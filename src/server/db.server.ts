import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { defaultActionTemplates, type ServiceDetection } from "@/lib/agentlx";
import { createSeedState } from "./seed.server";
import { getEnv } from "./env.server";
import { buildDatabaseSslConfig } from "./db-ssl.server";
import { appendAuditLog } from "./audit.server";

const { Pool } = pg;

const env = getEnv();

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: buildDatabaseSslConfig({
    enabled: env.DATABASE_SSL,
    rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    ca: env.DATABASE_SSL_CA,
    caPath: env.DATABASE_SSL_CA_PATH,
  }),
  options: `-c timezone=${env.APP_TIME_ZONE}`,
});

let readyPromise: Promise<void> | null = null;
let maintenanceStarted = false;
const CLEANUP_BATCH_SIZE = 1000;

function toJson(value: unknown) {
  return JSON.stringify(value);
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let dollarQuote: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const rest = sql.slice(index);

    if (dollarQuote) {
      if (rest.startsWith(dollarQuote)) {
        current += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        if (sql[index + 1] === quote) {
          current += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    const dollarMatch = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
    if (dollarMatch) {
      dollarQuote = dollarMatch[0];
      current += dollarQuote;
      index += dollarQuote.length - 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const statement = current.trim();
  if (statement) {
    statements.push(statement);
  }

  return statements;
}

async function runSqlFile(client: pg.PoolClient, filePath: string) {
  const sql = await readFile(filePath, "utf8");
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await client.query(statement);
  }
}

async function runMigrations() {
  const migrationsPath = join(process.cwd(), "db", "migrations");
  const migrationFiles = (await readdir(migrationsPath))
    .filter((entry) => /^\d+.*\.sql$/i.test(entry))
    .sort((left, right) => left.localeCompare(right, "en"));

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const migrationFile of migrationFiles) {
      const applied = await client.query<{ id: string }>(
        "SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1",
        [migrationFile],
      );
      if (applied.rows[0]) {
        continue;
      }

      await client.query("BEGIN");
      try {
        await runSqlFile(client, join(migrationsPath, migrationFile));
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migrationFile]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const enterprise = await import("@agentlx/enterprise");
    const enterpriseMigrations =
      enterprise.getEnterpriseProvider().getEnterpriseMigrations?.() ?? [];
    for (const migration of enterpriseMigrations) {
      const migrationId = `enterprise:${migration.id}`;
      const applied = await client.query<{ id: string }>(
        "SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1",
        [migrationId],
      );
      if (applied.rows[0]) {
        continue;
      }

      await client.query("BEGIN");
      try {
        for (const statement of splitSqlStatements(migration.sql)) {
          await client.query(statement);
        }
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migrationId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function runLegacySchemaBootstrap() {
  const client = await pool.connect();
  try {
    await runSqlFile(client, join(process.cwd(), "db", "schema.sql"));
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
      await appendAuditLog(client, {
        executionId: audit.executionId,
        machineId: audit.machineId,
        machineHostname: audit.machineId
          ? (machineHostnameById.get(audit.machineId) ?? audit.machineId)
          : null,
        actorType: audit.actorType,
        actorId: audit.actorId,
        action: audit.action,
        message: audit.message,
        createdAt: audit.createdAt,
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runBatchedCleanup(client: pg.PoolClient, sql: string, params: unknown[]) {
  while (true) {
    const result = await client.query(sql, [...params, CLEANUP_BATCH_SIZE]);
    if ((result.rowCount ?? 0) < CLEANUP_BATCH_SIZE) {
      return;
    }
  }
}

async function runMaintenanceCleanup() {
  const now = new Date().toISOString();
  const sessionCutoff = new Date(
    Date.now() - env.AGENTLX_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const enrollmentCutoff = new Date(
    Date.now() - env.AGENTLX_ENROLLMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const executionCutoff = new Date(
    Date.now() - env.AGENTLX_EXECUTION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const inventoryCutoff = new Date(
    Date.now() - env.AGENTLX_INVENTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const client = await pool.connect();
  try {
    await runBatchedCleanup(
      client,
      `
        DELETE FROM user_sessions
        WHERE ctid IN (
          SELECT ctid
          FROM user_sessions
          WHERE expires_at <= $1
             OR (last_seen_at <= $2 AND expires_at <= $1)
          LIMIT $3
        )
      `,
      [now, sessionCutoff],
    );
    await runBatchedCleanup(
      client,
      `
        DELETE FROM agent_request_nonces
        WHERE ctid IN (
          SELECT ctid
          FROM agent_request_nonces
          WHERE expires_at <= $1
          LIMIT $2
        )
      `,
      [now],
    );
    await runBatchedCleanup(
      client,
      `
        DELETE FROM agent_enrollment_tokens
        WHERE ctid IN (
          SELECT ctid
          FROM agent_enrollment_tokens
          WHERE expires_at <= $1
            AND (consumed_at IS NOT NULL OR created_at <= $2)
          LIMIT $3
        )
      `,
      [now, enrollmentCutoff],
    );
    await runBatchedCleanup(
      client,
      `
        DELETE FROM auth_login_rate_limits
        WHERE ctid IN (
          SELECT ctid
          FROM auth_login_rate_limits
          WHERE updated_at <= $1
            AND (locked_until IS NULL OR locked_until <= $2)
          LIMIT $3
        )
      `,
      [sessionCutoff, now],
    );
    await runBatchedCleanup(
      client,
      `
        DELETE FROM machine_inventories
        WHERE ctid IN (
          SELECT ctid
          FROM machine_inventories
          WHERE collected_at <= $1
          LIMIT $2
        )
      `,
      [inventoryCutoff],
    );
    await runBatchedCleanup(
      client,
      `
        UPDATE action_executions execution
        SET
          output = '',
          error_output = CASE
            WHEN execution.error_output = '' THEN ''
            ELSE LEFT(execution.error_output, 2048)
          END
        WHERE execution.id IN (
          SELECT candidate.id
          FROM action_executions candidate
          WHERE candidate.requested_at <= $1
            AND candidate.status IN ('success', 'failed', 'cancelled')
            AND (candidate.output <> '' OR LENGTH(candidate.error_output) > 2048)
            AND EXISTS (
              SELECT 1
              FROM audit_logs audit
              WHERE audit.execution_id = candidate.id
            )
          LIMIT $2
        )
      `,
      [executionCutoff],
    );
    await runBatchedCleanup(
      client,
      `
        DELETE FROM action_executions execution
        WHERE execution.id IN (
          SELECT candidate.id
          FROM action_executions candidate
          WHERE candidate.requested_at <= $1
            AND candidate.status IN ('success', 'failed', 'cancelled')
            AND NOT EXISTS (
              SELECT 1
              FROM audit_logs audit
              WHERE audit.execution_id = candidate.id
            )
          LIMIT $2
        )
      `,
      [executionCutoff],
    );
  } finally {
    client.release();
  }
}

function startPeriodicMaintenance() {
  if (maintenanceStarted || env.NODE_ENV === "test") {
    return;
  }

  maintenanceStarted = true;
  const intervalMs = env.AGENTLX_MAINTENANCE_INTERVAL_MINUTES * 60 * 1000;
  setInterval(() => {
    runMaintenanceCleanup().catch((error) => {
      console.error("[maintenance] cleanup failed", error);
    });
  }, intervalMs).unref?.();
}

export async function ensureDatabaseReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (env.DATABASE_RUN_MIGRATIONS_ON_BOOT) {
        await runMigrations();
      } else {
        await runLegacySchemaBootstrap();
      }
      await seedDemoData();
      await runMaintenanceCleanup();
      startPeriodicMaintenance();
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
