import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const configPath = process.env.MIGRATION_CONFIG_PATH;
const certificatePath = process.env.RDS_CA_BUNDLE;
const logDirectory = "/var/lib/github-user-project-migrations";
let client;

try {
	if (!configPath || !certificatePath)
		throw new Error("Migration configuration paths are missing");
	const metadata = await stat(configPath);
	if (metadata.uid !== 0 || (metadata.mode & 0o777) !== 0o600) {
		throw new Error("Migration configuration must be root-owned with mode 600");
	}
	const config = JSON.parse(await readFile(configPath, "utf8"));
	const connection = new URL(config.databaseUrl);
	if (!["postgres:", "postgresql:"].includes(connection.protocol)) {
		throw new Error("Invalid PostgreSQL connection URL");
	}
	// Use the downloaded CA bundle even if an older URL refers to a /tmp file.
	connection.searchParams.set("sslmode", "verify-full");
	connection.searchParams.set("sslrootcert", certificatePath);
	connection.searchParams.delete("uselibpqcompat");
	client = new pg.Client({
		connectionString: connection.href,
		connectionTimeoutMillis: 10_000,
	});
	await client.connect();
	await client.query("SET lock_timeout = '30s'");
	await client.query("SET statement_timeout = '5min'");
	await client.query("SELECT pg_advisory_lock(73160421)");
	await migrate(drizzle({ client }), {
		migrationsFolder: fileURLToPath(
			new URL("../src/migrations", import.meta.url),
		),
	});
	console.log("All committed database migrations completed successfully.");
} catch (error) {
	// Detailed errors remain on the bastion, outside SSM and GitHub logs.
	const codes = [];
	for (let cause = error; cause; cause = cause.cause) {
		if (cause.code) codes.push(String(cause.code));
	}
	await mkdir(logDirectory, { recursive: true, mode: 0o700 });
	const logPath = path.join(logDirectory, "last-migration-error.log");
	await writeFile(logPath, String(error.stack ?? error), { mode: 0o600 });
	console.error(
		`Database migration failed${codes.length ? ` (${codes.join(", ")})` : ""}.`,
	);
	console.error(
		`Review ${logPath} on the bastion. Lambda deployment will be blocked.`,
	);
	process.exitCode = 1;
} finally {
	await client?.end();
}
