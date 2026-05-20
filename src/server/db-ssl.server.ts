import { readFileSync } from "node:fs";

export function buildDatabaseSslConfig(input: {
  enabled: boolean;
  ca?: string | null;
  caPath?: string | null;
  rejectUnauthorized?: boolean;
}) {
  if (!input.enabled) {
    return undefined;
  }

  const rejectUnauthorized = input.rejectUnauthorized ?? true;
  const ca = input.ca?.trim();
  const caPath = input.caPath?.trim();

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : caPath ? { ca: readFileSync(caPath, "utf8") } : {}),
  };
}
