import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP-aligned scrypt parameters (blueprint §6.2).
type ScryptParams = { N: number; r: number; p: number; maxmem: number };
const PARAMS: ScryptParams = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const VERSION = "scrypt1";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 256;

export function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new Error("Kata sandi terlalu panjang (maksimum 256 byte).");
  }
}

/** Encodes key material as version$N,r,p$salt$hash (all base64url). */
export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return `${VERSION}$${PARAMS.N},${PARAMS.r},${PARAMS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function splitEncoded(encoded: string): { params: ScryptParams; salt: Buffer; hash: Buffer } | null {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [rawN, rawR, rawP] = (parts[1] ?? "").split(",").map((value) => Number.parseInt(value, 10));
  const n = rawN ?? 0;
  const r = rawR ?? 0;
  const p = rawP ?? 0;
  if (n <= 0 || r <= 0 || p <= 0) return null;
  try {
    return {
      params: { N: n, r, p, maxmem: PARAMS.maxmem },
      salt: Buffer.from(parts[2] ?? "", "base64url"),
      hash: Buffer.from(parts[3] ?? "", "base64url"),
    };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = splitEncoded(encoded);
  if (!parsed) return false;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) return false;
  let derived: Buffer;
  try {
    derived = await scrypt(password, parsed.salt, parsed.hash.length, parsed.params);
  } catch {
    return false;
  }
  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Valid hash used when an email is unknown so login timing does not reveal
 * whether an account exists (blueprint §6.2).
 */
export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("dummy-password-for-timing-equalisation");
  }
  return dummyHashPromise;
}
