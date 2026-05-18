import "dotenv/config";

import { readFileSync } from "node:fs";
import { z } from "zod";

function readSecretFile(filePath: string, variableName: string) {
  try {
    return readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
  } catch (error) {
    throw new Error(
      `Nao foi possivel ler ${variableName} em ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function applyFileEnv(env: NodeJS.ProcessEnv) {
  for (const [key, filePath] of Object.entries(env)) {
    if (!key.endsWith("_FILE") || !filePath) {
      continue;
    }

    const targetKey = key.slice(0, -"_FILE".length);
    if (env[targetKey]?.trim()) {
      continue;
    }

    env[targetKey] = readSecretFile(filePath, key);
  }

  if (!env.DATABASE_URL?.trim()) {
    const user = env.POSTGRES_USER?.trim();
    const password = env.POSTGRES_PASSWORD?.trim();
    const database = env.POSTGRES_DB?.trim();
    const host = env.DB_HOST?.trim() || "db";
    const port = env.DB_PORT?.trim() || "5432";

    if (user && password && database) {
      env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
        password,
      )}@${host}:${port}/${encodeURIComponent(database)}`;
    }
  }

  return env;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  APP_TIME_ZONE: z
    .string()
    .min(1)
    .default("America/Sao_Paulo")
    .refine(
      (value) => {
        try {
          Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      },
      { message: "APP_TIME_ZONE precisa ser um fuso horario IANA valido." },
    ),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z
    .string()
    .optional()
    .transform((value) =>
      value == null ? process.env.NODE_ENV === "production" : /^true$/i.test(value),
    ),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_CONNECT_RETRIES: z.coerce.number().int().positive().default(20),
  DATABASE_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().positive().default(2000),
  AGENTLX_PENDING_TOKEN_SECRET: z.string().min(16).default("change-me-pending-token-secret"),
  AGENTLX_MFA_ENCRYPTION_SECRET: z.string().min(16).optional(),
  AGENTLX_MFA_ENCRYPTION_SECRET_PREVIOUS: z.string().default(""),
  AGENTLX_MFA_ISSUER: z.string().min(1).default("agentlx"),
  AGENTLX_MFA_PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AGENTLX_MFA_SETUP_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AGENTLX_SEED_ON_BOOT: z
    .string()
    .optional()
    .transform((value) =>
      value == null ? process.env.NODE_ENV !== "production" : /^true$/i.test(value),
    ),
  AGENTLX_BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  AGENTLX_BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional(),
  AGENTLX_BOOTSTRAP_ADMIN_FULL_NAME: z.string().min(3).max(160).optional(),
});

let cachedEnv: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(applyFileEnv(process.env));
    process.env.TZ = cachedEnv.APP_TIME_ZONE;
    if (cachedEnv.NODE_ENV === "production") {
      const appOrigin = new URL(cachedEnv.APP_ORIGIN);
      if (appOrigin.protocol !== "https:") {
        throw new Error("APP_ORIGIN precisa usar HTTPS em producao.");
      }
      if (["localhost", "127.0.0.1", "0.0.0.0"].includes(appOrigin.hostname)) {
        throw new Error("APP_ORIGIN precisa apontar para um host publico real em producao.");
      }
      if (cachedEnv.AGENTLX_PENDING_TOKEN_SECRET === "change-me-pending-token-secret") {
        throw new Error("AGENTLX_PENDING_TOKEN_SECRET precisa ser alterado em producao.");
      }
    }
  }
  return cachedEnv;
}
