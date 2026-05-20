import { readFileSync } from "node:fs";

export function readSecretFile(filePath, variableName) {
  try {
    return readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
  } catch (error) {
    throw new Error(
      `Unable to read ${variableName} from ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function applyFileEnv(env = process.env) {
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

  return env;
}

export function buildDatabaseUrlFromParts(env = process.env) {
  if (env.DATABASE_URL?.trim()) {
    return env.DATABASE_URL.trim();
  }

  const user = env.POSTGRES_USER?.trim();
  const password = env.POSTGRES_PASSWORD?.trim();
  const database = env.POSTGRES_DB?.trim();
  const host = env.DB_HOST?.trim() || "db";
  const port = env.DB_PORT?.trim() || "5432";

  if (!user || !password || !database) {
    return "";
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

export function prepareRuntimeEnv(env = process.env) {
  applyFileEnv(env);
  if (!env.DATABASE_URL?.trim()) {
    const databaseUrl = buildDatabaseUrlFromParts(env);
    if (databaseUrl) {
      env.DATABASE_URL = databaseUrl;
    }
  }
  return env;
}

export function buildDatabaseSslConfig(env = process.env) {
  if (!/^true$/i.test(env.DATABASE_SSL || "")) {
    return undefined;
  }

  const rejectUnauthorized = !/^false$/i.test(env.DATABASE_SSL_REJECT_UNAUTHORIZED || "true");
  const ca = env.DATABASE_SSL_CA?.trim();
  const caPath = env.DATABASE_SSL_CA_PATH?.trim();

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : caPath ? { ca: readFileSync(caPath, "utf8") } : {}),
  };
}
