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

function optionalEnvString(schema: z.ZodString) {
  return z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }
    return value;
  }, schema.optional());
}

function envBoolean(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => (value == null ? defaultValue : /^true$/i.test(value)));
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
  DATABASE_SSL_REJECT_UNAUTHORIZED: envBoolean(true),
  DATABASE_SSL_CA: z.string().default(""),
  DATABASE_SSL_CA_PATH: z.string().default(""),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_CONNECT_RETRIES: z.coerce.number().int().positive().default(20),
  DATABASE_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().positive().default(2000),
  DATABASE_RUN_MIGRATIONS_ON_BOOT: envBoolean(true),
  AGENTLX_TRUST_PROXY: envBoolean(false),
  AGENTLX_PENDING_TOKEN_SECRET: z.string().min(16).default("change-me-pending-token-secret"),
  AGENTLX_AUDIT_ANCHOR_SECRET: optionalEnvString(z.string().min(16)),
  AGENTLX_AUDIT_ANCHOR_FILE: z.string().default(""),
  AGENTLX_MFA_ENCRYPTION_SECRET: optionalEnvString(z.string().min(16)),
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
  AGENTLX_MAINTENANCE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  AGENTLX_SESSION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  AGENTLX_ENROLLMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  AGENTLX_EXECUTION_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  AGENTLX_INVENTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  AGENTLX_AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
});

let cachedEnv: z.infer<typeof envSchema> | null = null;
let warnedDeploymentLock = false;

export const DEPLOYMENT_DOCS_URL = "https://doc.agentlx.com.br";

function firstHeaderValue(value: string | null) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .find(Boolean) ?? null
  );
}

function cleanProtocol(value: string | null) {
  const protocol = value?.replace(/:$/, "").toLowerCase();
  return protocol === "https" || protocol === "http" ? protocol : null;
}

function hostHasPort(host: string) {
  if (host.startsWith("[")) {
    return /\]:\d+$/.test(host);
  }
  return host.includes(":");
}

function appendForwardedPort(protocol: string, host: string, port: string | null) {
  if (!port || !/^\d+$/.test(port) || hostHasPort(host)) {
    return host;
  }

  if ((protocol === "https" && port === "443") || (protocol === "http" && port === "80")) {
    return host;
  }

  return `${host}:${port}`;
}

function getDeploymentRequestHeaders(request?: Request) {
  return {
    host: firstHeaderValue(request?.headers.get("host") ?? null),
    xForwardedProto: firstHeaderValue(request?.headers.get("x-forwarded-proto") ?? null),
    xForwardedHost: firstHeaderValue(request?.headers.get("x-forwarded-host") ?? null),
    xForwardedPort: firstHeaderValue(request?.headers.get("x-forwarded-port") ?? null),
    xForwardedSsl: firstHeaderValue(request?.headers.get("x-forwarded-ssl") ?? null),
  };
}

function getDetectedRequestOrigin(request: Request | undefined, trustedProxy: boolean) {
  const headers = getDeploymentRequestHeaders(request);
  if (!request) {
    return {
      detectedOrigin: "",
      headers,
    };
  }

  const requestUrl = new URL(request.url);
  if (!trustedProxy) {
    return {
      detectedOrigin: requestUrl.origin,
      headers,
    };
  }

  const forwardedProtocol =
    cleanProtocol(headers.xForwardedProto) ??
    (headers.xForwardedSsl?.toLowerCase() === "on" ? "https" : null);
  const protocol = forwardedProtocol ?? requestUrl.protocol.replace(/:$/, "");
  const host = headers.xForwardedHost ?? headers.host ?? requestUrl.host;
  const detectedHost = appendForwardedPort(protocol, host, headers.xForwardedPort);

  return {
    detectedOrigin: `${protocol}://${detectedHost}`,
    headers,
  };
}

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(applyFileEnv(process.env));
    process.env.TZ = cachedEnv.APP_TIME_ZONE;
    const deployment = getDeploymentSecurityState();
    if (deployment.locked && !warnedDeploymentLock) {
      warnedDeploymentLock = true;
      console.warn(
        `[security] agentlx iniciado em modo bloqueado: ${deployment.reasons.join(" ")}`,
      );
    }
  }
  return cachedEnv;
}

export function getDeploymentSecurityState(request?: Request) {
  const env = cachedEnv ?? envSchema.parse(applyFileEnv(process.env));
  const appOrigin = new URL(env.APP_ORIGIN);
  const { detectedOrigin, headers } = getDetectedRequestOrigin(request, env.AGENTLX_TRUST_PROXY);
  const reasons: string[] = [];

  if (appOrigin.protocol !== "https:") {
    reasons.push("APP_ORIGIN precisa usar HTTPS para liberar o painel.");
  }

  if (request) {
    const detectedUrl = new URL(detectedOrigin);
    if (detectedUrl.protocol !== "https:") {
      reasons.push(
        `A origem percebida foi ${detectedOrigin}, mas o painel exige HTTPS. Se estiver usando reverse proxy, confira X-Forwarded-Proto.`,
      );
    }

    if (detectedUrl.origin !== appOrigin.origin) {
      reasons.push(
        `A origem percebida (${detectedOrigin}) precisa corresponder exatamente ao APP_ORIGIN (${appOrigin.origin}).`,
      );
    }
  }

  if (env.NODE_ENV === "production") {
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(appOrigin.hostname)) {
      reasons.push("APP_ORIGIN em producao precisa apontar para um host publico real.");
    }

    if (env.AGENTLX_PENDING_TOKEN_SECRET === "change-me-pending-token-secret") {
      reasons.push("AGENTLX_PENDING_TOKEN_SECRET precisa ser alterado em producao.");
    }

    if (env.AGENTLX_SEED_ON_BOOT) {
      reasons.push("AGENTLX_SEED_ON_BOOT precisa ficar desativado em producao.");
    }

    if (env.DATABASE_SSL && !env.DATABASE_SSL_REJECT_UNAUTHORIZED) {
      reasons.push("DATABASE_SSL_REJECT_UNAUTHORIZED nao pode ser false em producao.");
    }
  }

  return {
    locked: reasons.length > 0,
    appOrigin: env.APP_ORIGIN,
    detectedOrigin: detectedOrigin || env.APP_ORIGIN,
    docsUrl: DEPLOYMENT_DOCS_URL,
    trustedProxy: env.AGENTLX_TRUST_PROXY,
    headers,
    reasons,
  };
}

export function assertDeploymentReady() {
  const deployment = getDeploymentSecurityState();
  if (deployment.locked) {
    throw new Error(
      `Configuracao HTTPS obrigatoria. Acesse ${DEPLOYMENT_DOCS_URL} para concluir a publicacao do painel.`,
    );
  }
}
