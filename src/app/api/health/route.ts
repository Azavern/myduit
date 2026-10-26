import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for the platform. It deliberately performs no database work:
 * readiness (schema present, credentials valid) is verified by `pnpm check:env`
 * and the smoke tests so a transient DB hiccup does not restart the app.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "myduit", timestamp: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
