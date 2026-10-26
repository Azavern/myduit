#!/usr/bin/env node
/**
 * Creates a single-use password reset link. Creating reset tokens is
 * deliberately not granted to the runtime role, so this runs on the admin
 * connection and prints the link exactly once.
 *
 *   pnpm auth:reset -- --email=owner@contoh.id
 *
 * The database stores only the HMAC of the token (30 minute expiry, matching
 * the copy on /reset-password). Every older unconsumed token of that user is
 * invalidated so only the newest link works.
 */
import { appOrigin, loadEnvFiles, requireEnv, validateEnv } from "./lib/env.mjs";
import { withGuardedConnection, hasSchema } from "./lib/db.mjs";
import { hashToken, generateToken } from "./lib/tokens.mjs";
import { die, fail, info, ok, step, warn } from "./lib/log.mjs";

const RESET_TTL_MINUTES = 30;
const args = process.argv.slice(2);

function flagValue(name) {
  const inline = args.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : "";
}

const email = flagValue("email") || process.env.RESET_EMAIL || "";

loadEnvFiles();

step("Memeriksa konfigurasi");
const { problems } = validateEnv("runtime");
for (const problem of problems) fail(`${problem.name}: ${problem.reason}`);
if (problems.length > 0) die("Lengkapi konfigurasi lalu jalankan ulang (lihat docs/env.md).");

const { DATABASE_ADMIN_URL, AUTH_TOKEN_PEPPER } = requireEnv(["DATABASE_ADMIN_URL", "AUTH_TOKEN_PEPPER"]);
if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) die("Wajib: --email=akun@contoh.id");

const normalized = email.trim().toLowerCase();
const token = generateToken();
const tokenHash = hashToken("reset", token, AUTH_TOKEN_PEPPER);

await withGuardedConnection(DATABASE_ADMIN_URL, async (sql) => {
  if (!(await hasSchema(sql))) die("Skema belum ada. Jalankan `pnpm setup` lebih dulu.", 3);

  const users = await sql`select id, status from public.users where email_normalized = ${normalized}`;
  const user = users[0];
  if (!user) die(`Akun ${normalized} tidak ditemukan. Jalankan \`pnpm bootstrap:owner\` lebih dulu.`, 4);
  if (user.status !== "active") warn(`Akun ${normalized} berstatus ${user.status}; reset tetap dibuat tetapi masuk akan ditolak.`);

  const invalidated = await sql`
    update app_private.password_reset_tokens
    set consumed_at = now()
    where user_id = ${user.id} and consumed_at is null
    returning id
  `;

  const inserted = await sql`
    insert into app_private.password_reset_tokens (user_id, token_hash, expires_at)
    values (${user.id}, ${tokenHash}, now() + ${`${RESET_TTL_MINUTES} minutes`}::interval)
    returning id, expires_at
  `;
  ok(`token reset dibuat untuk ${normalized}`);
  if (invalidated.length > 0) info(`  · ${invalidated.length} token lama dibatalkan`);
  info(`  · berlaku sampai ${inserted[0]?.expires_at?.toISOString?.() ?? "?"}`);
});

step("Tautan reset (hanya ditampilkan sekali)");
info(`  ${appOrigin()}/reset-password?token=${token}`);
warn("Token tidak disimpan dalam bentuk asli; tautan ini tidak dapat ditampilkan ulang.");
