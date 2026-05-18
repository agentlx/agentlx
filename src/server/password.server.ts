import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function toBase64Url(buffer: Uint8Array) {
  return Buffer.from(buffer).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export async function hashPassword(password: string) {
  const salt = toBase64Url(randomBytes(16));
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024,
  })) as Buffer;

  return `scrypt$1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const parts = passwordHash.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt") {
    return false;
  }

  const [, , nValue, rValue, pValue, salt, storedHash] = parts;
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
    maxmem: 32 * 1024 * 1024,
  })) as Buffer;
  const actualHash = fromBase64Url(storedHash);

  if (actualHash.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(actualHash, derived);
}
