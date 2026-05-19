import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const DEFAULT_SECRETS_DIR = "secrets";

function printUsage() {
  console.log(`Usage:
  node scripts/generate-secrets.mjs [--format env|files] [--output-dir secrets]

Examples:
  node scripts/generate-secrets.mjs
  node scripts/generate-secrets.mjs --format files --output-dir secrets
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

function secret(byteLength = 36) {
  return randomBytes(byteLength).toString("base64url");
}

function buildSecrets() {
  return {
    POSTGRES_PASSWORD: secret(32),
    AGENTLX_PENDING_TOKEN_SECRET: secret(48),
    AGENTLX_MFA_ENCRYPTION_SECRET: secret(48),
  };
}

async function writeSecretFiles(values, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const mapping = {
    POSTGRES_PASSWORD: "postgres_password.txt",
    AGENTLX_PENDING_TOKEN_SECRET: "agentlx_pending_token_secret.txt",
    AGENTLX_MFA_ENCRYPTION_SECRET: "agentlx_mfa_encryption_secret.txt",
  };

  for (const [key, value] of Object.entries(values)) {
    await writeFile(join(outputDir, mapping[key]), `${value}\n`, { mode: 0o600 });
  }
}

function printEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`);
  }
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const format = getArgValue("--format", "env");
  if (!["env", "files"].includes(format)) {
    throw new Error("--format must be env or files.");
  }

  const values = buildSecrets();
  if (format === "env") {
    printEnv(values);
    return;
  }

  const outputDir = getArgValue("--output-dir", DEFAULT_SECRETS_DIR);
  await writeSecretFiles(values, outputDir);
  console.log(
    `Secrets written to ${outputDir}. Keep these files private and restrict permissions.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
