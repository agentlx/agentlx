import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { prepareRuntimeEnv } from "./env.mjs";

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
  ssl: /^true$/i.test(process.env.DATABASE_SSL || "") ? { rejectUnauthorized: false } : undefined,
});

const schemaPath = join(process.cwd(), "db", "schema.sql");
const sql = await readFile(schemaPath, "utf8");
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const client = await pool.connect();
try {
  for (const statement of statements) {
    await client.query(statement);
  }
  console.log("Database schema initialized successfully.");
} finally {
  client.release();
  await pool.end();
}
