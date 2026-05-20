import "dotenv/config";

import pg from "pg";
import { buildDatabaseSslConfig, prepareRuntimeEnv } from "./env.mjs";

const { Client } = pg;

prepareRuntimeEnv();

const connectionString = process.env.DATABASE_URL;
const retries = Number(process.env.DATABASE_CONNECT_RETRIES || 20);
const delayMs = Number(process.env.DATABASE_CONNECT_RETRY_DELAY_MS || 2000);

if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let attempt = 1; attempt <= retries; attempt += 1) {
  const client = new Client({
    connectionString,
    ssl: buildDatabaseSslConfig(),
  });

  try {
    await client.connect();
    await client.query("select 1");
    await client.end();
    console.log("Database connection is ready.");
    process.exit(0);
  } catch (error) {
    await client.end().catch(() => undefined);
    console.log(`Waiting for database (${attempt}/${retries})...`);
    if (attempt === retries) {
      console.error(error);
      process.exit(1);
    }
    await sleep(delayMs);
  }
}
