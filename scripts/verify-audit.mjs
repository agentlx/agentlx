import "dotenv/config";

import { createHash, createHmac } from "node:crypto";
import pg from "pg";
import { buildDatabaseSslConfig, prepareRuntimeEnv } from "./env.mjs";

const { Client } = pg;

prepareRuntimeEnv();

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
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

function timestampText(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function computeIntegrityHash(input) {
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

function computeAnchorHash(integrityHash) {
  const secret =
    process.env.AGENTLX_AUDIT_ANCHOR_SECRET ||
    process.env.AGENTLX_PENDING_TOKEN_SECRET ||
    "change-me-pending-token-secret";
  return createHmac("sha256", secret).update(integrityHash).digest("hex");
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: buildDatabaseSslConfig(),
});

await client.connect();

try {
  const logs = await client.query(`
    SELECT
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
    FROM audit_logs
    ORDER BY created_at ASC, id ASC
  `);
  const anchors = await client.query(`
    SELECT audit_log_id, integrity_hash, anchor_hash
    FROM audit_integrity_anchors
    ORDER BY created_at ASC
  `);
  const anchorByLogId = new Map(anchors.rows.map((anchor) => [anchor.audit_log_id, anchor]));
  const failures = [];
  let prevHash = "";

  for (const row of logs.rows) {
    const expectedPrevHash = prevHash || null;
    if ((row.integrity_prev_hash ?? null) !== expectedPrevHash) {
      failures.push({ id: row.id, reason: "prev_hash_mismatch" });
    }

    const expectedHash = computeIntegrityHash({
      id: row.id,
      prevHash,
      createdAt: timestampText(row.created_at),
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      severity: row.severity,
      executionId: row.execution_id,
      machineId: row.machine_id,
      machineHostname: row.machine_hostname,
      message: row.message,
      metadata: row.metadata_json ?? {},
    });

    if (row.integrity_hash !== expectedHash) {
      failures.push({ id: row.id, reason: "integrity_hash_mismatch" });
    }

    const anchor = anchorByLogId.get(row.id);
    if (!anchor) {
      failures.push({ id: row.id, reason: "anchor_missing" });
    } else if (
      anchor.integrity_hash !== row.integrity_hash ||
      anchor.anchor_hash !== computeAnchorHash(expectedHash)
    ) {
      failures.push({ id: row.id, reason: "anchor_mismatch" });
    }

    prevHash = row.integrity_hash || "";
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, checked: logs.rows.length, failures }, null, 2));
    process.exit(2);
  }

  console.log(JSON.stringify({ ok: true, checked: logs.rows.length }, null, 2));
} finally {
  await client.end();
}
