import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { defaultActionTemplates, type ServiceDetection } from "@/lib/agentlx";
import { createSeedState } from "./seed.server";
import { getEnv } from "./env.server";

const { Pool } = pg;

const env = getEnv();

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  options: `-c timezone=${env.APP_TIME_ZONE}`,
});

let readyPromise: Promise<void> | null = null;

function toJson(value: unknown) {
  return JSON.stringify(value);
}

async function runSchema() {
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
  } finally {
    client.release();
  }
}

async function insertMachineServices(
  client: pg.PoolClient,
  machineId: string,
  services: ServiceDetection[],
) {
  await client.query("DELETE FROM machine_services WHERE machine_id = $1", [machineId]);
  for (const service of services) {
    await client.query(
      `
        INSERT INTO machine_services (
          id, machine_id, slug, display_name, version, detected_by, collected_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        crypto.randomUUID(),
        machineId,
        service.slug,
        service.displayName ?? null,
        service.version ?? null,
        service.detectedBy,
        new Date().toISOString(),
      ],
    );
  }
}

async function seedTemplates(client: pg.PoolClient) {
  for (const template of defaultActionTemplates) {
    await client.query(
      `
        INSERT INTO action_templates (
          id, name, description, service, target_distro_ids, target_distro_families,
          command, estimated_seconds, risk, enabled
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
        SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          service = EXCLUDED.service,
          target_distro_ids = EXCLUDED.target_distro_ids,
          target_distro_families = EXCLUDED.target_distro_families,
          command = EXCLUDED.command,
          estimated_seconds = EXCLUDED.estimated_seconds,
          risk = EXCLUDED.risk,
          enabled = EXCLUDED.enabled
      `,
      [
        template.id,
        template.name,
        template.description,
        template.service,
        toJson(template.targetDistroIds),
        toJson(template.targetDistroFamilies),
        template.command,
        template.estimatedSeconds,
        template.risk,
        true,
      ],
    );
  }
}

async function seedDemoData() {
  if (!env.AGENTLX_SEED_ON_BOOT) {
    return;
  }

  const state = createSeedState();
  const client = await pool.connect();
  try {
    const existing = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM machines",
    );
    if (Number(existing.rows[0]?.count ?? 0) > 0) {
      await seedTemplates(client);
      return;
    }

    await client.query("BEGIN");
    await seedTemplates(client);

    for (const agent of state.agents) {
      await client.query(
        `
          INSERT INTO agents (
            id, machine_id, label, auth_token_hash, registered_at, last_seen_at, version,
            poll_interval_sec, state
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          agent.id,
          agent.machineId,
          agent.label,
          agent.authTokenHash,
          agent.registeredAt,
          agent.lastSeenAt,
          agent.version,
          agent.pollIntervalSec,
          agent.state,
        ],
      );
    }

    for (const machine of state.machines) {
      await client.query(
        `
          INSERT INTO machines (
            id, agent_id, hostname, ip, os, distro_id, distro_family, distro_version, kernel,
            arch, location, uptime_sec, cpu_percent, ram_used_gb, ram_total_gb, disk_percent,
            status, last_seen_at, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20
          )
        `,
        [
          machine.id,
          machine.agentId,
          machine.hostname,
          machine.ip,
          machine.os,
          machine.distroId,
          machine.distroFamily,
          machine.distroVersion,
          machine.kernel,
          machine.arch,
          machine.location,
          machine.uptimeSec,
          machine.cpuPercent,
          machine.ramUsedGb,
          machine.ramTotalGb,
          machine.diskPercent,
          machine.status,
          machine.lastSeenAt,
          machine.createdAt,
          machine.updatedAt,
        ],
      );

      await insertMachineServices(
        client,
        machine.id,
        machine.services.map((slug) => ({
          slug,
          displayName: slug.toUpperCase(),
          detectedBy: "seed",
        })),
      );
    }

    for (const inventory of state.inventories) {
      await client.query(
        `
          INSERT INTO machine_inventories (
            id, machine_id, collected_at, hostname, ip, os, distro_id, distro_family,
            distro_version, kernel, arch, location, uptime_sec, cpu_percent, ram_used_gb,
            ram_total_gb, disk_percent, services_json
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18::jsonb
          )
        `,
        [
          inventory.id,
          inventory.machineId,
          inventory.collectedAt,
          inventory.hostname,
          inventory.ip,
          inventory.os,
          inventory.distroId,
          inventory.distroFamily,
          inventory.distroVersion,
          inventory.kernel,
          inventory.arch,
          inventory.location,
          inventory.uptimeSec,
          inventory.cpuPercent,
          inventory.ramUsedGb,
          inventory.ramTotalGb,
          inventory.diskPercent,
          toJson(inventory.services),
        ],
      );
    }

    for (const status of state.statusHistory) {
      await client.query(
        `
          INSERT INTO machine_status_history (id, machine_id, status, recorded_at, note)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [status.id, status.machineId, status.status, status.recordedAt, status.note],
      );
    }

    const machineHostnameById = new Map(
      state.machines.map((machine) => [machine.id, machine.hostname]),
    );

    for (const execution of state.executions) {
      await client.query(
        `
          INSERT INTO action_executions (
            id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
            status, requested_by, requested_at, available_at, dispatched_at, started_at, finished_at,
            duration_ms, exit_code, output, error_output
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14, $15, $16, $17, $18
          )
        `,
        [
          execution.id,
          execution.machineId,
          machineHostnameById.get(execution.machineId) ?? execution.machineId,
          execution.agentId,
          execution.templateId,
          execution.templateName,
          execution.service,
          execution.command,
          execution.status,
          execution.requestedBy,
          execution.requestedAt,
          execution.dispatchedAt,
          execution.startedAt,
          execution.finishedAt,
          execution.durationMs,
          execution.exitCode,
          execution.output,
          execution.errorOutput,
        ],
      );
    }

    for (const audit of state.auditLogs) {
      await client.query(
        `
          INSERT INTO audit_logs (
            id, execution_id, machine_id, machine_hostname, actor_type, actor_id, action, message,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          audit.id,
          audit.executionId,
          audit.machineId,
          audit.machineId ? (machineHostnameById.get(audit.machineId) ?? audit.machineId) : null,
          audit.actorType,
          audit.actorId,
          audit.action,
          audit.message,
          audit.createdAt,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDatabaseReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await runSchema();
      await seedDemoData();
    })();
  }
  return readyPromise;
}

export async function dbQuery<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) {
  await ensureDatabaseReady();
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  await ensureDatabaseReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
