import "server-only";
import { headers } from "next/headers";

import { appUrl } from "@/server/env";
import { ForbiddenError } from "@/server/errors";

/**
 * Rejects mutations whose Origin does not exactly match the configured app
 * origin. Server Actions already run their own origin checks; this is an
 * explicit, testable layer used by custom handlers (blueprint §6.5).
 */
export async function assertSameOrigin(): Promise<void> {
  const store = await headers();
  const origin = store.get("origin");
  const expected = appUrl();
  if (!origin) {
    throw new ForbiddenError("Permintaan ditolak: header Origin tidak ada.");
  }
  if (origin.replace(/\/$/, "") !== expected) {
    throw new ForbiddenError("Permintaan ditolak: origin tidak diizinkan.");
  }
}

/**
 * Client IP for rate limiting. Only proxy headers the deployment actually
 * trusts are read (Vercel/most reverse proxies set `x-forwarded-for`).
 * Never trust client-supplied values for authorization decisions.
 */
export async function clientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return store.get("x-real-ip") ?? "unknown";
}

export async function requestId(): Promise<string | null> {
  const store = await headers();
  return store.get("x-request-id") ?? store.get("x-vercel-id");
}
