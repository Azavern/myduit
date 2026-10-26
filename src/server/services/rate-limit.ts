import "server-only";
import type { Tx } from "@/server/db/client";

export const RATE_LIMITS = {
  loginPerIp: { limit: 30, windowSeconds: 900 },
  loginPerIdentity: { limit: 5, windowSeconds: 900 },
  registerPerIp: { limit: 10, windowSeconds: 3600 },
  resetPerIp: { limit: 10, windowSeconds: 3600 },
} as const;

/**
 * Atomic counter in PostgreSQL (blueprint §6.5). Returns false when the caller
 * exceeded the limit for the current window.
 */
export async function consumeRateLimit(
  tx: Tx,
  keyHash: string,
  windowSeconds: number,
  limit: number,
): Promise<boolean> {
  const rows = await tx<{ allowed: boolean }[]>`
    select app_private.hit_rate_limit(${keyHash}::text, ${windowSeconds}::int, ${limit}::int) as allowed
  `;
  return rows[0]?.allowed === true;
}
