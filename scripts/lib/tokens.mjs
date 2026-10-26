import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Compatible with src/server/auth/tokens.ts: the database only stores the
 * HMAC-SHA-256 digest of a token, so an operator script must hash tokens the
 * same way. tests/unit/token-parity.test.ts compares both implementations.
 */
const DOMAIN = {
  session: "session.v1",
  invitation: "invitation.v1",
  reset: "reset.v1",
  ratelimit: "ratelimit.v1",
};

export function hashToken(purpose, token, pepper) {
  const domain = DOMAIN[purpose];
  if (!domain) throw new Error(`Jenis token tidak dikenal: ${purpose}`);
  if (!/^[0-9a-f]{64}$/.test(pepper ?? "")) {
    throw new Error("AUTH_TOKEN_PEPPER harus 64 karakter hex.");
  }
  return createHmac("sha256", pepper).update(`${domain}:${token}`).digest("hex");
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
