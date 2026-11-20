import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const activeStatuses = new Set([
	"Pending",
	"InProgress",
	"Delayed",
	"Cancelling",
]);

function awsJson(operation, parameters) {
	try {
		const output = execFileSync(
			"aws",
			[
				"ssm",
				operation,
				"--cli-input-json",
				JSON.stringify(parameters),
				"--output",
				"json",
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
		);
		return JSON.parse(output);
	} catch (error) {
		const stderr = error.stderr?.toString() ?? "";
		if (stderr.includes("InvocationDoesNotExist")) {
			const pending = new Error("SSM invocation is not visible yet");
			pending.code = "InvocationDoesNotExist";
			throw pending;
		}
		// Keep AWS response bodies and remote command output out of the build log.
		throw new Error(
			`AWS SSM ${operation} failed. Check AWS permissions, credentials and node status.`,
		);
	}
}

export function buildMigrationRequest({ instanceId, repository, commit }) {
	if (!/^i-[a-f0-9]{8}(?:[a-f0-9]{9})?$/.test(instanceId ?? "")) {
		throw new Error("Set BASTION_INSTANCE_ID to the bastion EC2 instance ID");
	}
	if (repository !== "czxzc/github-user-project") {
		throw new Error("Migration source must be czxzc/github-user-project");
	}
	if (!/^[a-f0-9]{40}$/.test(commit ?? "")) {
		throw new Error("GITHUB_SHA must be a full Git commit hash");
	}

	const command = `set -eu
umask 077
work_dir="$(mktemp -d /tmp/github-user-migration.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT
mkdir "$work_dir/source"
curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 180 \\
  'https://codeload.github.com/${repository}/tar.gz/${commit}' -o "$work_dir/source.tar.gz"
tar -xzf "$work_dir/source.tar.gz" --strip-components=1 -C "$work_dir/source"
bash "$work_dir/source/scripts/ci/migrate-on-bastion.sh" "$work_dir/source"
`;

	return {
		DocumentName: "AWS-RunShellScript",
		InstanceIds: [instanceId],
		TimeoutSeconds: 120,
		Comment: `Database migration ${commit}`,
		Parameters: {
			commands: [command],
			executionTimeout: ["1200"],
		},
	};
}

export async function waitForMigration({
	commandId,
	instanceId,
	call = awsJson,
	wait = sleep,
	now = Date.now,
	timeoutMs = 1_350_000,
	log = console.log,
}) {
	const deadline = now() + timeoutMs;
	let previousStatus;
	while (now() < deadline) {
		let invocation;
		try {
			invocation = await call("get-command-invocation", {
				CommandId: commandId,
				InstanceId: instanceId,
			});
		} catch (error) {
			if (error.code !== "InvocationDoesNotExist") throw error;
			await wait(5_000);
			continue;
		}
		if (invocation.Status !== previousStatus) {
			log(`Bastion migration: ${invocation.Status}`);
			previousStatus = invocation.Status;
		}
		if (invocation.Status === "Success" && invocation.ResponseCode === 0)
			return;
		if (!activeStatuses.has(invocation.Status)) {
			throw new Error(
				`Migration failed (${invocation.Status}, exit ${invocation.ResponseCode}). ` +
					`See SSM Run Command ${commandId} and the protected log on the bastion. Lambda deployment is blocked.`,
			);
		}
		await wait(5_000);
	}
	throw new Error(
		`Migration timed out. Check SSM Run Command ${commandId}. Lambda deployment is blocked.`,
	);
}

export async function runMigration({
	environment = process.env,
	call = awsJson,
	waitOptions = {},
} = {}) {
	const request = buildMigrationRequest({
		instanceId: environment.BASTION_INSTANCE_ID,
		repository: environment.GITHUB_REPOSITORY,
		commit: environment.GITHUB_SHA,
	});
	const response = await call("send-command", request);
	const commandId = response.Command?.CommandId;
	if (!/^[a-f0-9-]{36}$/.test(commandId ?? "")) {
		throw new Error(
			"SSM did not return a valid command ID; Lambda deployment is blocked",
		);
	}
	console.log(`Migration command: ${commandId}`);
	let finished = false;
	const cancel = async () => {
		try {
			await call("cancel-command", {
				CommandId: commandId,
				InstanceIds: request.InstanceIds,
			});
		} catch {
			console.error(
				`Could not cancel SSM command ${commandId}; check it on the bastion.`,
			);
		}
	};
	const interrupted = async () => {
		await cancel();
		process.exit(1);
	};
	process.once("SIGINT", interrupted);
	process.once("SIGTERM", interrupted);
	try {
		await waitForMigration({
			...waitOptions,
			commandId,
			instanceId: request.InstanceIds[0],
			call,
		});
		finished = true;
		console.log("Database migration completed. Lambda deployment may proceed.");
	} finally {
		process.removeListener("SIGINT", interrupted);
		process.removeListener("SIGTERM", interrupted);
		if (!finished) await cancel();
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runMigration().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
