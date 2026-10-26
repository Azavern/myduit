import "server-only";
import postgres from "postgres";

import { getRuntimeEnv } from "@/server/env";

export type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;

let cached: Sql | null = null;

function sslOption(databaseUrl: string): boolean | { rejectUnauthorized: boolean } {
  // TLS certificate verification stays on for hosted Supabase. Only an
  // explicit local escape hatch (`sslmode=disable`) turns TLS off.
  if (/sslmode=disable/i.test(databaseUrl)) return false;
  return { rejectUnauthorized: true };
}

/**
 * Reusable pool for the application server. `prepare: false` is required for
 * Supavisor transaction pooling (blueprint §5).
 */
export function getSql(): Sql {
  if (cached) return cached;
  const env = getRuntimeEnv();
  cached = postgres(env.DATABASE_URL, {
    prepare: false,
    max: env.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ssl: sslOption(env.DATABASE_URL),
    onnotice: () => {},
  });
  return cached;
}

/** Close the pool (used by tests and scripts). */
export async function closeSql(): Promise<void> {
  if (cached) {
    const pool = cached;
    cached = null;
    await pool.end({ timeout: 5 });
  }
}

export function postgresErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === "23505";
}
