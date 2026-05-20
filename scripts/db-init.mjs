import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { buildDatabaseSslConfig, prepareRuntimeEnv } from "./env.mjs";

const { Pool } = pg;

prepareRuntimeEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  ssl: buildDatabaseSslConfig(),
});

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runSqlFile(client, filePath) {
  const sql = await readFile(filePath, "utf8");
  for (const statement of splitSqlStatements(sql)) {
    await client.query(statement);
  }
}

const client = await pool.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsPath = join(process.cwd(), "db", "migrations");
  const migrationFiles = (await readdir(migrationsPath))
    .filter((entry) => /^\d+.*\.sql$/i.test(entry))
    .sort((left, right) => left.localeCompare(right, "en"));

  for (const migrationFile of migrationFiles) {
    const applied = await client.query("SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1", [
      migrationFile,
    ]);
    if (applied.rows[0]) {
      continue;
    }

    await client.query("BEGIN");
    try {
      await runSqlFile(client, join(migrationsPath, migrationFile));
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migrationFile]);
      await client.query("COMMIT");
      console.log(`Applied migration ${migrationFile}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Database migrations completed successfully.");
} finally {
  client.release();
  await pool.end();
}
