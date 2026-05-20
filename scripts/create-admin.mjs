import "dotenv/config";

import { createHash, createHmac, randomBytes, randomUUID, scrypt as nodeScrypt } from "node:crypto";
import { stdin } from "node:process";
import { promisify } from "node:util";
import pg from "pg";
import { buildDatabaseSslConfig, prepareRuntimeEnv } from "./env.mjs";

const { Client } = pg;

prepareRuntimeEnv();

const scrypt = promisify(nodeScrypt);
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const ALL_SCREENS = ["dashboard", "machines", "groups", "templates", "logs", "users"];

function printUsage() {
  console.log(`Usage:
  printf '%s' "SuaSenha" | node scripts/create-admin.mjs --name "Seu Nome" --email "admin@empresa.com" --password-stdin

Notes:
  - If the email does not exist, the user is created as admin.
  - If the email already exists, the account is promoted/updated to admin and the password is replaced.
  - If DATABASE_URL is empty, the script builds it from POSTGRES_* using DB_HOST=db and DB_PORT=5432 by default.
  - --password is still accepted for automation, but --password-stdin avoids exposing the password in shell history and process arguments.
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

async function readPasswordFromStdin() {
  stdin.setEncoding("utf8");
  let input = "";

  for await (const chunk of stdin) {
    input += chunk;
  }

  return input.replace(/\r?\n$/, "");
}

function buildConnectionString() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is empty and POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB are not fully defined.",
    );
  }

  return process.env.DATABASE_URL.trim();
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }

  return value;
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function computeAuditIntegrityHash(input) {
  return createHash("sha256")
    .update(
      [
        input.id,
        input.prevHash,
        input.createdAt,
        input.actorType,
        input.actorId,
        input.action,
        input.severity,
        input.executionId ?? "",
        input.machineId ?? "",
        input.machineHostname ?? "",
        input.message,
        stableJson(input.metadata),
      ].join("|"),
    )
    .digest("hex");
}

async function appendAuditLog(client, input) {
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const metadata = sortJson(input.metadata ?? {});
  const previous = await client.query(`
    SELECT integrity_hash
    FROM audit_logs
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE
  `);
  const prevHash = previous.rows[0]?.integrity_hash ?? "";
  const integrityHash = computeAuditIntegrityHash({
    id,
    prevHash,
    createdAt,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    severity: input.severity,
    executionId: null,
    machineId: null,
    machineHostname: null,
    message: input.message,
    metadata,
  });

  await client.query(
    `
      INSERT INTO audit_logs (
        id,
        execution_id,
        machine_id,
        machine_hostname,
        actor_type,
        actor_id,
        action,
        severity,
        message,
        metadata_json,
        integrity_prev_hash,
        integrity_hash,
        created_at
      )
      VALUES ($1, NULL, NULL, NULL, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
    `,
    [
      id,
      input.actorType,
      input.actorId,
      input.action,
      input.severity,
      input.message,
      stableJson(metadata),
      prevHash || null,
      integrityHash,
      createdAt,
    ],
  );

  const anchorSecret =
    process.env.AGENTLX_AUDIT_ANCHOR_SECRET ||
    process.env.AGENTLX_PENDING_TOKEN_SECRET ||
    "change-me-pending-token-secret";
  const anchorHash = createHmac("sha256", anchorSecret).update(integrityHash).digest("hex");
  await client.query(
    `
      INSERT INTO audit_integrity_anchors (
        id, audit_log_id, integrity_hash, anchor_hash, anchor_version, created_at
      )
      VALUES ($1, $2, $3, $4, 1, $5)
    `,
    [randomUUID(), id, integrityHash, anchorHash, createdAt],
  );
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
  const readsPasswordFromStdin = process.argv.includes("--password-stdin");
  if (readsPasswordFromStdin && process.argv.includes("--password")) {
    throw new Error("Use either --password or --password-stdin, not both.");
  }
  const password = readsPasswordFromStdin
    ? await readPasswordFromStdin()
    : getArgValue("--password");

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
    ssl: buildDatabaseSslConfig(),
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
      const userId = randomUUID();
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
        [userId, fullName, email, passwordHash, JSON.stringify(ALL_SCREENS), now, now],
      );

      await appendAuditLog(client, {
        actorType: "system",
        actorId: "create-admin-cli",
        action: "user.admin.cli.created",
        severity: "critical",
        message: `Script create-admin criou o administrador ${email}.`,
        createdAt: now,
        metadata: {
          alert: true,
          userId,
          targetEmail: email,
        },
      });

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
    await appendAuditLog(client, {
      actorType: "system",
      actorId: "create-admin-cli",
      action: "user.admin.cli.updated",
      severity: "critical",
      message: `Script create-admin atualizou o administrador ${email}.`,
      createdAt: now,
      metadata: {
        alert: true,
        userId,
        targetEmail: email,
      },
    });
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
