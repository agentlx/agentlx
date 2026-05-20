import "dotenv/config";

import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { buildDatabaseSslConfig, prepareRuntimeEnv } from "./env.mjs";

const { Client } = pg;

prepareRuntimeEnv();

function printUsage() {
  console.log(`Usage:
  node scripts/queue-remote-command.mjs --machine "<machine-id-or-hostname>" --command "uname -a"

Options:
  --machine VALUE         Machine id or hostname to target.
  --command VALUE         Shell command to enqueue.
  --requested-by VALUE    Audit actor label. Default: codex-cli
  --timeout-sec VALUE     Agent command timeout in seconds. Default: 30
  --wait-sec VALUE        How long to wait for completion. Default: 90
  --poll-ms VALUE         Poll interval while waiting. Default: 2000
  --no-wait               Only enqueue, do not wait for completion.

Notes:
  - If DATABASE_URL is empty, the script builds it from POSTGRES_* using DB_HOST=db and DB_PORT=5432 by default.
  - This uses the same action_executions queue consumed by the agent poll loop.
`);
}

function getArgValue(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
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
    executionId: input.executionId ?? null,
    machineId: input.machineId ?? null,
    machineHostname: input.machineHostname ?? null,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
    `,
    [
      id,
      input.executionId ?? null,
      input.machineId ?? null,
      input.machineHostname ?? null,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProtectedDataKey() {
  return createHash("sha256")
    .update(
      `execution-command:${process.env.AGENTLX_PENDING_TOKEN_SECRET || "change-me-pending-token-secret"}`,
    )
    .digest();
}

function encryptStoredExecutionCommand(command) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getProtectedDataKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(command, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function redactSensitiveText(value) {
  return value
    .replace(
      /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi,
      "-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----",
    )
    .replace(/(authorization\s*[:=]\s*bearer\s+)([^\s"'`,;]+)/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+([A-Za-z0-9._~+/-]+=*)/g, "Bearer [REDACTED]")
    .replace(
      /\b((?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization))\b(\s*[:=]\s*)(["']?)([^"'`\r\n\s]+)(\3)/gi,
      "$1$2$3[REDACTED]$3",
    )
    .replace(
      /(^|\n)([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)=([^\n]*)/g,
      "$1$2=[REDACTED]",
    )
    .replace(
      /([?&](?:token|secret|password|api[_-]?key|access[_-]?key|client[_-]?secret)=)([^&\s]+)/gi,
      "$1[REDACTED]",
    );
}

async function loadMachine(client, lookup) {
  const result = await client.query(
    `
      SELECT id, agent_id, hostname, status, last_seen_at
      FROM machines
      WHERE id = $1 OR hostname = $1
      ORDER BY last_seen_at DESC
      LIMIT 1
    `,
    [lookup],
  );

  return result.rows[0] ?? null;
}

async function loadExecution(client, executionId) {
  const result = await client.query(
    `
      SELECT
        id,
        status,
        requested_at,
        dispatched_at,
        started_at,
        finished_at,
        exit_code,
        output,
        error_output
      FROM action_executions
      WHERE id = $1
      LIMIT 1
    `,
    [executionId],
  );

  return result.rows[0] ?? null;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    process.exit(0);
  }

  const machineLookup = getArgValue("--machine").trim();
  const command = getArgValue("--command").trim();
  const requestedBy = getArgValue("--requested-by", "codex-cli").trim() || "codex-cli";
  const timeoutSec = Number.parseInt(getArgValue("--timeout-sec", "30"), 10);
  const waitSec = Number.parseInt(getArgValue("--wait-sec", "90"), 10);
  const pollMs = Number.parseInt(getArgValue("--poll-ms", "2000"), 10);
  const shouldWait = !hasFlag("--no-wait");

  if (!machineLookup) {
    throw new Error("--machine is required.");
  }
  if (!command) {
    throw new Error("--command is required.");
  }
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new Error("--timeout-sec must be a positive integer.");
  }
  if (!Number.isFinite(waitSec) || waitSec <= 0) {
    throw new Error("--wait-sec must be a positive integer.");
  }
  if (!Number.isFinite(pollMs) || pollMs <= 0) {
    throw new Error("--poll-ms must be a positive integer.");
  }

  const client = new Client({
    connectionString: buildConnectionString(),
    ssl: buildDatabaseSslConfig(),
  });

  await client.connect();

  try {
    const machine = await loadMachine(client, machineLookup);
    if (!machine) {
      throw new Error(`Machine not found for lookup: ${machineLookup}`);
    }

    const executionId = randomUUID();
    const requestedAt = new Date().toISOString();
    const redactedCommand = redactSensitiveText(command);
    const encryptedCommand = encryptStoredExecutionCommand(command);

    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, NULL, 'Terminal remoto', 'system', $5, $6, 'terminal', 'queued',
          $7, $8, $8, NULL, NULL, NULL, $9, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        redactedCommand,
        encryptedCommand,
        requestedBy,
        requestedAt,
        timeoutSec,
      ],
    );

    await appendAuditLog(client, {
      executionId,
      machineId: machine.id,
      machineHostname: machine.hostname,
      actorType: "system",
      actorId: requestedBy,
      action: "terminal.requested.cli",
      severity: "warn",
      message: `CLI queued remote command for ${machine.hostname}: ${redactedCommand.slice(0, 140)}`,
      metadata: { alert: true, executionKind: "terminal", source: "cli" },
      createdAt: requestedAt,
    });
    await client.query("COMMIT");

    console.log(`Execution queued: ${executionId}`);
    console.log(`Machine: ${machine.hostname} (${machine.id}) status=${machine.status}`);
    console.log(`Command: ${redactedCommand}`);

    if (!shouldWait) {
      return;
    }

    const deadline = Date.now() + waitSec * 1000;
    while (Date.now() < deadline) {
      await sleep(pollMs);
      const execution = await loadExecution(client, executionId);
      if (!execution) {
        throw new Error(`Execution not found after enqueue: ${executionId}`);
      }

      console.log(
        `status=${execution.status} dispatched_at=${execution.dispatched_at ?? "-"} started_at=${execution.started_at ?? "-"} finished_at=${execution.finished_at ?? "-"}`,
      );

      if (["success", "failed", "cancelled"].includes(execution.status)) {
        console.log(`exit_code=${execution.exit_code ?? "null"}`);
        if (execution.output) {
          console.log("--- stdout ---");
          console.log(execution.output);
        }
        if (execution.error_output) {
          console.log("--- stderr ---");
          console.log(execution.error_output);
        }
        process.exit(execution.status === "success" ? 0 : 1);
      }
    }

    throw new Error(`Timed out waiting for execution ${executionId} after ${waitSec}s.`);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors when no transaction is active.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
