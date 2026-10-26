import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Byte-for-byte compatible with src/server/auth/password.ts. Operator scripts
 * run outside the Next.js runtime (the app module is `server-only`), so the
 * encoding is duplicated here and verified against the app implementation by
 * tests/unit/password-parity.test.ts.
 */
const scrypt = promisify(scryptCallback);

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 256;
const PARAMS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const VERSION = "scrypt1";

export function assertPasswordPolicy(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new Error("Kata sandi terlalu panjang (maksimum 256 byte).");
  }
}

export async function hashPassword(password) {
  assertPasswordPolicy(password);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return `${VERSION}$${PARAMS.N},${PARAMS.r},${PARAMS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  const parts = String(encoded).split("$");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;
  const [n, r, p] = parts[1].split(",").map((value) => Number.parseInt(value, 10));
  if (!(n > 0 && r > 0 && p > 0)) return false;
  const salt = Buffer.from(parts[2], "base64url");
  const hash = Buffer.from(parts[3], "base64url");
  if (hash.length === 0) return false;
  const derived = await scrypt(password, salt, hash.length, { N: n, r, p, maxmem: PARAMS.maxmem });
  if (derived.length !== hash.length) return false;
  return timingSafeEqual(derived, hash);
}

/** Random password that satisfies the policy; used with `--generate-password`. */
export function generatePassword() {
  return randomBytes(24).toString("base64url");
}
