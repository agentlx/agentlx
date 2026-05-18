import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "./env.server";

export async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateToken(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function getPendingTokenKey() {
  return createHash("sha256").update(getEnv().AGENTLX_PENDING_TOKEN_SECRET).digest();
}

function getProtectedDataKey(purpose: string) {
  return createHash("sha256")
    .update(`${purpose}:${getEnv().AGENTLX_PENDING_TOKEN_SECRET}`)
    .digest();
}

function encryptProtectedText(plaintext: string, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getProtectedDataKey(purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptProtectedText(payload: string, purpose: string) {
  const [ivText, authTagText, ciphertextText] = payload.split(".");
  if (!ivText || !authTagText || !ciphertextText) {
    throw new Error("Payload protegido invalido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getProtectedDataKey(purpose),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function encryptPendingToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getPendingTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPendingToken(payload: string) {
  const [ivText, authTagText, ciphertextText] = payload.split(".");
  if (!ivText || !authTagText || !ciphertextText) {
    throw new Error("Token pendente invalido.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getPendingTokenKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function encryptStoredExecutionCommand(command: string) {
  return encryptProtectedText(command, "execution-command");
}

export function decryptStoredExecutionCommand(payload: string) {
  return decryptProtectedText(payload, "execution-command");
}

export function encryptAgentToken(token: string) {
  return encryptProtectedText(token, "agent-token");
}

export function decryptAgentToken(payload: string) {
  return decryptProtectedText(payload, "agent-token");
}

export function readAgentAuthorizationId(value: string | null | undefined) {
  if (!value?.startsWith("Agent ")) return null;
  const agentId = value.slice("Agent ".length).trim();
  return agentId || null;
}

export type AgentRequestSignatureHeaders = {
  version: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

function normalizeBase64UrlPadding(input: string) {
  const remainder = input.length % 4;
  if (remainder === 0) {
    return input;
  }
  return input + "=".repeat(4 - remainder);
}

export async function buildAgentRequestSignaturePayload(
  method: string,
  requestPath: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
) {
  const bodyHash = await sha256Hex(rawBody);
  return [method.toUpperCase(), requestPath, timestamp, nonce, bodyHash].join("\n");
}

export async function signAgentRequest(
  agentSecret: string,
  method: string,
  requestPath: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
) {
  const payload = await buildAgentRequestSignaturePayload(
    method,
    requestPath,
    timestamp,
    nonce,
    rawBody,
  );
  return createHmac("sha256", agentSecret).update(payload).digest("base64url");
}

export async function verifyAgentRequestSignature(input: {
  agentSecret: string;
  method: string;
  requestPath: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
  signature: string;
}) {
  const expected = await signAgentRequest(
    input.agentSecret,
    input.method,
    input.requestPath,
    input.timestamp,
    input.nonce,
    input.rawBody,
  );

  const providedBuffer = Buffer.from(normalizeBase64UrlPadding(input.signature), "base64url");
  const expectedBuffer = Buffer.from(normalizeBase64UrlPadding(expected), "base64url");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function readAgentRequestSignatureHeaders(request: Request) {
  const version = request.headers.get("x-agent-auth-version")?.trim() ?? "";
  const timestamp = request.headers.get("x-agent-auth-timestamp")?.trim() ?? "";
  const nonce = request.headers.get("x-agent-auth-nonce")?.trim() ?? "";
  const signature = request.headers.get("x-agent-auth-signature")?.trim() ?? "";

  if (!version && !timestamp && !nonce && !signature) {
    return null;
  }

  if (!version || !timestamp || !nonce || !signature) {
    throw Object.assign(new Error("Cabecalhos de assinatura do agent estao incompletos."), {
      statusCode: 401,
    });
  }

  return {
    version,
    timestamp,
    nonce,
    signature,
  } satisfies AgentRequestSignatureHeaders;
}
