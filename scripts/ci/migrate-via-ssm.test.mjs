import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	buildMigrationRequest,
	runMigration,
	waitForMigration,
} from "./migrate-via-ssm.mjs";

const instanceId = "i-07f444db6b5c23654";
const commandId = "12345678-1234-1234-1234-123456789abc";
const environment = {
	BASTION_INSTANCE_ID: instanceId,
	GITHUB_REPOSITORY: "czxzc/github-user-project",
	GITHUB_SHA: "a".repeat(40),
};
const immediate = async () => {};
const quiet = () => {};

test("migration downloads the same commit being deployed and sends no database credentials", () => {
	const request = buildMigrationRequest({
		instanceId,
		repository: environment.GITHUB_REPOSITORY,
		commit: environment.GITHUB_SHA,
	});
	assert.deepEqual(request.InstanceIds, [instanceId]);
	assert.match(
		request.Parameters.commands[0],
		new RegExp(`/tar.gz/${environment.GITHUB_SHA}`),
	);
	assert.doesNotMatch(JSON.stringify(request), /DATABASE_URL|postgresql:\/\//);
});

test("untrusted repository names, commit values and instance IDs fail before SSM execution", () => {
	for (const input of [
		{ repository: "other/repository" },
		{ commit: "main; echo unsafe" },
		{ instanceId: "i-12345678; echo unsafe" },
	]) {
		assert.throws(() =>
			buildMigrationRequest({
				instanceId,
				repository: environment.GITHUB_REPOSITORY,
				commit: environment.GITHUB_SHA,
				...input,
			}),
		);
	}
});

test("eventual consistency and pending statuses are waited out before accepting success", async () => {
	const results = [
		Object.assign(new Error("not ready"), { code: "InvocationDoesNotExist" }),
		{ Status: "Pending", ResponseCode: -1 },
		{ Status: "InProgress", ResponseCode: -1 },
		{ Status: "Success", ResponseCode: 0 },
	];
	let polls = 0;
	await waitForMigration({
		commandId,
		instanceId,
		wait: immediate,
		log: quiet,
		call: async () => {
			const response = results[polls++];
			if (response instanceof Error) throw response;
			return response;
		},
	});
	assert.equal(polls, 4);
});

for (const result of [
	{ Status: "Failed", ResponseCode: 1 },
	{ Status: "TimedOut", ResponseCode: -1 },
	{ Status: "Cancelled", ResponseCode: -1 },
	{ Status: "Success", ResponseCode: 1 },
]) {
	test(`${result.Status} with exit ${result.ResponseCode} blocks deployment and suppresses remote output`, async () => {
		const logs = [];
		await assert.rejects(
			waitForMigration({
				commandId,
				instanceId,
				log: (message) => logs.push(message),
				call: async () => ({
					...result,
					StandardErrorContent: "private-database-password",
				}),
			}),
			/Lambda deployment is blocked/,
		);
		assert.doesNotMatch(logs.join("\n"), /private-database-password/);
	});
}

test("SSM permission failures stop the gate immediately", async () => {
	await assert.rejects(
		waitForMigration({
			commandId,
			instanceId,
			call: async () => {
				throw new Error("AccessDeniedException");
			},
		}),
		/AccessDeniedException/,
	);
});

test("a failed migration is cancelled and cannot reach the deployment continuation", async () => {
	const calls = [];
	let deployed = false;
	await assert.rejects(async () => {
		await runMigration({
			environment,
			waitOptions: { log: quiet },
			call: async (operation) => {
				calls.push(operation);
				if (operation === "send-command")
					return { Command: { CommandId: commandId } };
				if (operation === "get-command-invocation")
					return { Status: "Failed", ResponseCode: 1 };
				return {};
			},
		});
		deployed = true;
	});
	assert.equal(deployed, false);
	assert.deepEqual(calls, [
		"send-command",
		"get-command-invocation",
		"cancel-command",
	]);
});

test("a successful migration allows the deployment continuation without cancellation", async () => {
	const calls = [];
	await runMigration({
		environment,
		waitOptions: { log: quiet },
		call: async (operation) => {
			calls.push(operation);
			return operation === "send-command"
				? { Command: { CommandId: commandId } }
				: { Status: "Success", ResponseCode: 0 };
		},
	});
	assert.deepEqual(calls, ["send-command", "get-command-invocation"]);
});

test("local polling timeout fails closed and cancels the remote migration", async () => {
	let clock = 0;
	let cancelled = false;
	await assert.rejects(
		runMigration({
			environment,
			waitOptions: {
				timeoutMs: 10_000,
				now: () => clock,
				wait: async (delay) => {
					clock += delay;
				},
				log: quiet,
			},
			call: async (operation) => {
				if (operation === "send-command")
					return { Command: { CommandId: commandId } };
				if (operation === "cancel-command") {
					cancelled = true;
					return {};
				}
				return { Status: "InProgress", ResponseCode: -1 };
			},
		}),
		/timed out/,
	);
	assert.equal(cancelled, true);
});

test("workflow runs migration before upload and keeps failure propagation enabled", async () => {
	const workflow = await readFile(
		new URL("../../.github/workflows/deploy-lambda.yml", import.meta.url),
		"utf8",
	);
	const migrationIndex = workflow.indexOf(
		"- name: Migrate database on bastion",
	);
	const deployIndex = workflow.indexOf("- name: Update Lambda code");
	assert.ok(migrationIndex > 0 && migrationIndex < deployIndex);
	assert.doesNotMatch(
		workflow.slice(migrationIndex, deployIndex),
		/continue-on-error|always\(\)/,
	);
	assert.match(workflow, /cancel-in-progress: false/);
});

test("real CLI entry point exits nonzero for a failed remote migration", async () => {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "migration-gate-test-"),
	);
	try {
		await writeFile(
			path.join(directory, "aws"),
			`#!/usr/bin/env node
const operation = process.argv[3];
if (process.env.MOCK_AWS_ERROR) {
  console.error('An error occurred (' + process.env.MOCK_AWS_ERROR + ') when calling the SendCommand operation: hidden-test-secret');
  process.exit(254);
}
const result = operation === 'send-command'
  ? { Command: { CommandId: '${commandId}' } }
  : operation === 'get-command-invocation'
    ? { Status: process.env.MOCK_SSM_STATUS, ResponseCode: Number(process.env.MOCK_SSM_CODE) }
    : {};
console.log(JSON.stringify(result));
`,
			{ mode: 0o700 },
		);
		for (const [status, code, expectedExit] of [
			["Failed", "1", 1],
			["Success", "0", 0],
		]) {
			const result = spawnSync(
				process.execPath,
				[fileURLToPath(new URL("./migrate-via-ssm.mjs", import.meta.url))],
				{
					env: {
						...process.env,
						...environment,
						PATH: `${directory}${path.delimiter}${process.env.PATH}`,
						MOCK_SSM_STATUS: status,
						MOCK_SSM_CODE: code,
					},
					encoding: "utf8",
					timeout: 10_000,
				},
			);
			assert.equal(result.status, expectedExit, result.stderr);
		}
		for (const code of [
			"AccessDeniedException",
			"InvalidInstanceId",
			"InvalidDocument",
		]) {
			const result = spawnSync(
				process.execPath,
				[fileURLToPath(new URL("./migrate-via-ssm.mjs", import.meta.url))],
				{
					env: {
						...process.env,
						...environment,
						PATH: `${directory}${path.delimiter}${process.env.PATH}`,
						MOCK_AWS_ERROR: code,
					},
					encoding: "utf8",
					timeout: 10_000,
				},
			);
			assert.equal(result.status, 1);
			assert.ok(result.stderr.includes(`(${code})`), result.stderr);
			assert.doesNotMatch(result.stdout + result.stderr, /hidden-test-secret/);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
