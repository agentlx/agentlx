import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "./env.server";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const TOTP_EXPIRED_WINDOW = 4;
const MIN_TOTP_SECRET_BYTES = 10;

function getEncryptionSecrets() {
  const env = getEnv();
  const primarySecret = env.AGENTLX_MFA_ENCRYPTION_SECRET || env.AGENTLX_PENDING_TOKEN_SECRET;
  const previousSecrets = env.AGENTLX_MFA_ENCRYPTION_SECRET_PREVIOUS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([primarySecret, ...previousSecrets])];
}

function encryptionKeys() {
  return getEncryptionSecrets().map((secret) => createHash("sha256").update(secret).digest());
}

function base32Encode(buffer: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string) {
  const normalized = input.toUpperCase().replace(/[=\s-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function timingSafeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function formatCounter(counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  return buffer;
}

function createTotpCode(secret: string, timestamp = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  const hmac = createHmac("sha1", key).update(formatCounter(counter)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function encryptValue(value: string) {
  const [primaryKey] = encryptionKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primaryKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptValue(payload: string) {
  const [version, ivValue, tagValue, cipherValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !cipherValue) {
    throw new Error("Invalid encrypted MFA payload");
  }

  let lastError: unknown;
  const keys = encryptionKeys();
  for (let index = 0; index < keys.length; index += 1) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        keys[index],
        Buffer.from(ivValue, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipherValue, "base64url")),
        decipher.final(),
      ]);

      return {
        value: decrypted.toString("utf8"),
        keyIndex: index,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to decrypt MFA payload");
}

function createMfaConfigurationError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function normalizeTotpSecret(secret: string) {
  const normalizedSecret = secret.toUpperCase().replace(/[=\s-]/g, "");
  if (!normalizedSecret) {
    throw createMfaConfigurationError("MFA_SECRET_MISSING", "Missing MFA secret");
  }

  try {
    const decoded = base32Decode(normalizedSecret);
    if (decoded.length < MIN_TOTP_SECRET_BYTES) {
      throw createMfaConfigurationError("MFA_SECRET_INVALID", "Invalid MFA secret");
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }
    throw createMfaConfigurationError("MFA_SECRET_INVALID", "Invalid MFA secret");
  }

  return normalizedSecret;
}

function normalizeTotpToken(token: string) {
  return token.replace(/\s+/g, "");
}

export function createTotpSecret(byteLength = 20) {
  return base32Encode(randomBytes(byteLength));
}

export function buildTotpOtpAuthUrl({
  secret,
  accountName,
  issuer,
}: {
  secret: string;
  accountName: string;
  issuer: string;
}) {
  const label = `${issuer}:${accountName}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(
    secret,
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

export function assessTotpToken(
  secret: string,
  token: string,
  options: { timestamp?: number } = {},
) {
  const normalizedSecret = normalizeTotpSecret(secret);
  const normalizedToken = normalizeTotpToken(token);
  if (!/^\d{6}$/.test(normalizedToken)) {
    return { valid: false, reason: "invalid" as const };
  }

  const timestamp = Number.isFinite(options.timestamp) ? Number(options.timestamp) : Date.now();

  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const candidate = createTotpCode(
      normalizedSecret,
      timestamp + offset * TOTP_STEP_SECONDS * 1000,
    );
    if (timingSafeEqualString(candidate, normalizedToken)) {
      return { valid: true, reason: "valid" as const, driftSteps: offset };
    }
  }

  for (let offset = TOTP_WINDOW + 1; offset <= TOTP_EXPIRED_WINDOW; offset += 1) {
    const candidate = createTotpCode(
      normalizedSecret,
      timestamp - offset * TOTP_STEP_SECONDS * 1000,
    );
    if (timingSafeEqualString(candidate, normalizedToken)) {
      return { valid: false, reason: "expired" as const };
    }
  }

  return { valid: false, reason: "invalid" as const };
}

export function encryptMfaSecret(secret: string) {
  return encryptValue(normalizeTotpSecret(secret));
}

export function resolveStoredMfaSecret(payload: string) {
  const rawValue = payload.trim();
  if (!rawValue) {
    throw createMfaConfigurationError("MFA_SECRET_MISSING", "Missing MFA secret");
  }

  if (rawValue.startsWith("v1.")) {
    const decrypted = decryptValue(rawValue);
    const normalized = normalizeTotpSecret(decrypted.value);
    return {
      secret: normalized,
      needsMigration: decrypted.keyIndex > 0 || decrypted.value !== normalized,
    };
  }

  return {
    secret: normalizeTotpSecret(rawValue),
    needsMigration: true,
  };
}

export function encryptMfaPayload(payload: unknown) {
  return encryptValue(JSON.stringify(payload));
}

export function decryptMfaPayload<T>(payload: string): T {
  return JSON.parse(decryptValue(payload).value) as T;
}
