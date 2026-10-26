import postgres from "postgres";

import { die } from "./log.mjs";

/**
 * Scripts talk to PostgreSQL with the same client and TLS policy as the app
 * (src/server/db/client.ts). Admin scripts must pass DATABASE_ADMIN_URL: the
 * migration intentionally grants the runtime role no direct table writes.
 */
export function sslOption(databaseUrl) {
  if (/sslmode=disable/i.test(databaseUrl)) return false;
  return { rejectUnauthorized: true };
}

export function connect(databaseUrl, { max = 1 } = {}) {
  return postgres(databaseUrl, {
    prepare: false,
    max,
    idle_timeout: 10,
    connect_timeout: 10,
    ssl: sslOption(databaseUrl),
    onnotice: () => {},
  });
}

/** Connects, runs `fn`, and always closes the pool. */
export async function withConnection(databaseUrl, fn, options) {
  const sql = connect(databaseUrl, options);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** True when the migration has been applied to this database. */
export async function hasSchema(sql) {
  const rows = await sql`
    select to_regclass('public.users') is not null as present
  `;
  return Boolean(rows[0]?.present);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message.split("\n")[0];
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return String(error);
}

/**
 * Same as withConnection, but failures are reported with an actionable hint and
 * a redacted message instead of a raw driver stack trace.
 */
export async function withGuardedConnection(databaseUrl, fn, options) {
  try {
    return await withConnection(databaseUrl, fn, options);
  } catch (error) {
    const hint = connectionHint(error);
    die(`Akses database gagal.${hint ? ` ${hint}` : ""} (${errorMessage(error)})`);
  }
}

/** Human-readable hint for a failed connection without leaking credentials. */
export function connectionHint(error) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  switch (code) {
    case "28P01":
    case "28000":
      return "Autentikasi database gagal: periksa password/role pada connection string.";
    case "3D000":
      return "Database tidak ditemukan: periksa nama database pada connection string.";
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "ETIMEDOUT":
      return "Tidak dapat menjangkau host database: periksa jaringan, host, dan port.";
    case "42P01":
      return "Skema belum ada: jalankan migrasi (supabase migration up --local).";
    default:
      return null;
  }
}
