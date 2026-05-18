import "dotenv/config";

import { randomBytes, randomUUID, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import { prepareRuntimeEnv } from "./env.mjs";

const { Client } = pg;

prepareRuntimeEnv();

const scrypt = promisify(nodeScrypt);
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const ALL_SCREENS = ["dashboard", "machines", "templates", "logs", "users"];

function printUsage() {
  console.log(`Usage:
  node scripts/create-admin.mjs --name "Seu Nome" --email "admin@empresa.com" --password "SuaSenha"

Notes:
  - If the email does not exist, the user is created as admin.
  - If the email already exists, the account is promoted/updated to admin and the password is replaced.
  - If DATABASE_URL is empty, the script builds it from POSTGRES_* using DB_HOST=db and DB_PORT=5432 by default.
`);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function buildConnectionString() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is empty and POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB are not fully defined.",
    );
  }

  return process.env.DATABASE_URL.trim();
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024,
  });

  return `scrypt$1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${Buffer.from(derived).toString("base64url")}`;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const fullName = getArgValue("--name").trim();
  const email = normalizeEmail(getArgValue("--email"));
  const password = getArgValue("--password");

  if (fullName.length < 3) {
    throw new Error("--name must contain at least 3 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("--email must be a valid email address.");
  }
  if (password.length < 8) {
    throw new Error("--password must contain at least 8 characters.");
  }

  const connectionString = buildConnectionString();
  const client = new Client({
    connectionString,
    ssl: /^true$/i.test(process.env.DATABASE_SSL || "") ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    await client.query("BEGIN");

    const existing = await client.query(
      `
        SELECT id, session_version
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email],
    );

    if (existing.rows.length === 0) {
      await client.query(
        `
          INSERT INTO users (
            id,
            full_name,
            email,
            password_hash,
            role,
            allowed_screens,
            disabled,
            session_version,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'admin', $5::jsonb, FALSE, 1, $6, $7)
        `,
        [randomUUID(), fullName, email, passwordHash, JSON.stringify(ALL_SCREENS), now, now],
      );

      await client.query("COMMIT");
      console.log(`Admin created successfully: ${email}`);
      return;
    }

    const userId = existing.rows[0].id;
    const nextSessionVersion = Number(existing.rows[0].session_version ?? 1) + 1;

    await client.query(
      `
        UPDATE users
        SET
          full_name = $2,
          email = $3,
          password_hash = $4,
          role = 'admin',
          allowed_screens = $5::jsonb,
          disabled = FALSE,
          session_version = $6,
          updated_at = $7
        WHERE id = $1
      `,
      [userId, fullName, email, passwordHash, JSON.stringify(ALL_SCREENS), nextSessionVersion, now],
    );

    await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    console.log(`Admin updated successfully: ${email}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
