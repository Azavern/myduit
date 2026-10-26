import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type TokenPurpose = "session" | "invitation" | "reset" | "ratelimit";

const DOMAIN: Record<TokenPurpose, string> = {
  session: "session.v1",
  invitation: "invitation.v1",
  reset: "reset.v1",
  ratelimit: "ratelimit.v1",
};

/** 32 random bytes, base64url — only ever stored in the browser cookie/URL. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * HMAC-SHA-256 of a token under `AUTH_TOKEN_PEPPER`. The DB only stores this
 * 64-character hex digest (blueprint §6.3).
 */
export function hashToken(purpose: TokenPurpose, token: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update(`${DOMAIN[purpose]}:${token}`)
    .digest("hex");
}

export function hashIp(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${DOMAIN.ratelimit}:${ip}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** SHA-256 of the canonical payload representation, used for idempotency. */
export function hashPayload(payload: unknown): string {
  return createHmac("sha256", "idempotency.v1")
    .update(canonicalJson(payload))
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
