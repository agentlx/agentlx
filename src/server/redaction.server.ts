import { decryptStoredExecutionCommand, encryptStoredExecutionCommand } from "./security.server";

const REDACTED = "[REDACTED]";

const PEM_PRIVATE_KEY_BLOCK =
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi;
const AUTHORIZATION_BEARER = /(authorization\s*[:=]\s*bearer\s+)([^\s"'`,;]+)/gi;
const GENERIC_BEARER = /\bBearer\s+([A-Za-z0-9._~+/-]+=*)/g;
const SECRET_ASSIGNMENT =
  /\b((?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization))\b(\s*[:=]\s*)(["']?)([^"'`\r\n\s]+)(\3)/gi;
const ENV_SECRET_LINE =
  /(^|\n)([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)=([^\n]*)/g;
const QUERY_SECRET =
  /([?&](?:token|secret|password|api[_-]?key|access[_-]?key|client[_-]?secret)=)([^&\s]+)/gi;

function replaceSecretAssignment(match: string, label: string, separator: string, quote: string) {
  return `${label}${separator}${quote}${REDACTED}${quote}`;
}

export function redactSensitiveText(value: string) {
  if (!value) {
    return value;
  }

  return value
    .replace(PEM_PRIVATE_KEY_BLOCK, (match) =>
      match.replace(
        /[\s\S]+/,
        "-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----",
      ),
    )
    .replace(AUTHORIZATION_BEARER, (_match, prefix) => `${prefix}${REDACTED}`)
    .replace(GENERIC_BEARER, `Bearer ${REDACTED}`)
    .replace(SECRET_ASSIGNMENT, replaceSecretAssignment)
    .replace(ENV_SECRET_LINE, (_match, leading, key) => `${leading}${key}=${REDACTED}`)
    .replace(QUERY_SECRET, (_match, prefix) => `${prefix}${REDACTED}`);
}

export function protectExecutionCommand(command: string) {
  const raw = command.trim();
  return {
    rawCommand: raw,
    redactedCommand: redactSensitiveText(raw),
    encryptedCommand: raw ? encryptStoredExecutionCommand(raw) : "",
  };
}

export function resolveExecutionCommand(redactedCommand: string, encryptedCommand: string | null) {
  if (encryptedCommand) {
    try {
      return decryptStoredExecutionCommand(encryptedCommand);
    } catch {
      return redactedCommand;
    }
  }

  return redactedCommand;
}

export function redactAuditMessage(message: string) {
  return redactSensitiveText(message);
}
