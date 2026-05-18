import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
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

function scrypt(password: string, salt: string, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = toBase64Url(randomBytes(16));
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 32 * 1024 * 1024,
  });

  return `scrypt$1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const parts = passwordHash.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt") {
    return false;
  }

  const [, , nValue, rValue, pValue, salt, storedHash] = parts;
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
    maxmem: 32 * 1024 * 1024,
  });
  const actualHash = fromBase64Url(storedHash);

  if (actualHash.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(actualHash, derived);
}
