#!/usr/bin/env node
/**
 * Local/operator setup (blueprint §12):
 *   1. verifies the admin connection and that the migration has been applied;
 *   2. sets the password of the NOLOGIN role `finance_runtime` (created by the
 *      migration) so the application can authenticate;
 *   3. composes DATABASE_URL from DATABASE_POOLER_URL + DB_RUNTIME_PASSWORD and
 *      proves it works by connecting as finance_runtime;
 *   4. writes DATABASE_URL into .env.local without touching other lines.
 *
 *   pnpm setup
 *   pnpm setup -- --migrate          # apply migrations with the Supabase CLI first
 *   pnpm setup -- --rotate-password  # generate and set a new DB password
 *
 * No secret value is ever printed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { withGuardedConnection, hasSchema } from "./lib/db.mjs";
import { appOrigin, isHex64, loadEnvFiles, requireEnv, validateEnv } from "./lib/env.mjs";
import { die, fail, info, ok, step, warn } from "./lib/log.mjs";

const RUNTIME_ROLE = "finance_runtime";
const args = process.argv.slice(2);
const runMigrate = args.includes("--migrate");
const rotatePassword = args.includes("--rotate-password");

loadEnvFiles();

step("Memeriksa konfigurasi setup");
const { problems } = validateEnv("setup");
for (const problem of problems) fail(`${problem.name}: ${problem.reason}${problem.hint ? ` — ${problem.hint}` : ""}`);
if (problems.length > 0) die("Perbaiki konfigurasi di atas lalu jalankan ulang.");

const { DATABASE_ADMIN_URL } = requireEnv("DATABASE_ADMIN_URL");

function upsertEnvLine(path, key, value) {
  const line = `${key}=${value}`;
  if (!existsSync(path)) {
    writeFileSync(path, `${line}\n`, { mode: 0o600 });
    return "created";
  }
  const text = readFileSync(path, "utf8");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) {
    const next = text.replace(pattern, line);
    if (next === text) return "unchanged";
    writeFileSync(path, next);
    return "updated";
  }
  writeFileSync(path, `${text.replace(/\s*$/, "")}\n${line}\n`);
  return "appended";
}

function composeDatabaseUrl(poolerUrl, password) {
  const url = new URL(poolerUrl);
  url.password = password;
  if (!url.username) url.username = RUNTIME_ROLE;
  return url.toString();
}

await withGuardedConnection(DATABASE_ADMIN_URL, async (sql) => {
  if (!(await hasSchema(sql))) {
    if (!runMigrate) {
      die(
        "Skema belum ada. Jalankan migrasi lebih dulu (supabase migration up --local atau supabase db push), " +
          "atau ulangi `pnpm setup -- --migrate`.",
        3,
      );
    }
    step("Menjalankan migrasi melalui Supabase CLI");
    const local = (process.env.APP_ENV ?? "local") === "local";
    const command = local ? ["migration", "up", "--local"] : ["db", "push", "--linked"];
    const result = spawnSync("npx", ["supabase", ...command], { stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) die("Migrasi gagal. Perbaiki error di atas lalu ulangi.", result.status ?? 1);
    if (!(await hasSchema(sql))) die("Migrasi selesai tetapi tabel public.users masih tidak ditemukan.", 3);
  }
  ok("skema tersedia");

  const roleRows = await sql`select rolname from pg_roles where rolname = ${RUNTIME_ROLE}`;
  if (roleRows.length === 0) {
    die(`Role ${RUNTIME_ROLE} tidak ditemukan; jalankan migrasi awal terlebih dahulu.`, 3);
  }

  const privilegeRows = await sql`
    select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = ${RUNTIME_ROLE}
  `;
  const privileges = privilegeRows[0] ?? {};
  if (privileges.rolsuper || privileges.rolbypassrls || privileges.rolcreatedb || privileges.rolcreaterole) {
    warn(`Role ${RUNTIME_ROLE} memiliki hak istimewa; runtime seharusnya hanya memiliki akses terbatas.`);
  }

  let password = (process.env.DB_RUNTIME_PASSWORD ?? "").trim();
  if (rotatePassword || !password) {
    password = randomBytes(32).toString("hex");
    ok("password role runtime baru dibuat (nilai hanya ditulis ke file, tidak ditampilkan)");
  }
  if (!isHex64(password)) die("DB_RUNTIME_PASSWORD harus 64 karakter hex. Jalankan `pnpm secrets:generate`.");

  // ALTER ROLE is a utility statement: parameters cannot be bound. Interpolating
  // is safe because the value is validated as hex64 immediately above.
  await sql.unsafe(`alter role ${RUNTIME_ROLE} with login password '${password}'`);
  ok(`password role ${RUNTIME_ROLE} diperbarui`);

  const poolerUrl = (process.env.DATABASE_POOLER_URL ?? "").trim();
  if (!poolerUrl) {
    info("  · DATABASE_POOLER_URL kosong: susun DATABASE_URL manual lalu jalankan `pnpm env:check`");
    return;
  }

  let databaseUrl;
  try {
    databaseUrl = composeDatabaseUrl(poolerUrl, password);
  } catch {
    die("DATABASE_POOLER_URL tidak dapat diparsing sebagai URL PostgreSQL.");
  }

  step("Menguji login finance_runtime");
  await withGuardedConnection(databaseUrl, async (runtimeSql) => {
    const rows = await runtimeSql`select current_user as who`;
    if (rows[0]?.who !== RUNTIME_ROLE) {
      die(`Login runtime memakai role tidak terduga (${rows[0]?.who ?? "tidak diketahui"}).`, 4);
    }
    const visible = await runtimeSql`select count(*)::int as total from public.workspaces`;
    ok(`login sebagai ${RUNTIME_ROLE} berhasil (workspace terlihat: ${visible[0]?.total ?? 0})`);
  });

  const envPath = resolve(process.cwd(), ".env.local");
  const action = upsertEnvLine(envPath, "DATABASE_URL", databaseUrl);
  ok(`DATABASE_URL ${action === "created" ? "dibuat" : action === "appended" ? "ditambahkan" : "diperbarui"} di .env.local`);

  const secretsPath = resolve(process.cwd(), ".secrets/generated.env");
  if (existsSync(secretsPath)) upsertEnvLine(envPath, "AUTH_TOKEN_PEPPER", readSecret(secretsPath, "AUTH_TOKEN_PEPPER"));
});

function readSecret(path, key) {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(readFileSync(path, "utf8"));
  const value = match?.[1]?.trim() ?? "";
  if (!isHex64(value)) die(`Nilai ${key} di ${path} tidak valid; jalankan ulang \`pnpm secrets:generate\`.`);
  return value;
}

step("Langkah berikutnya");
info(`  1. Pastikan APP_URL=${appOrigin()} dan AUTH_TOKEN_PEPPER terisi di .env.local`);
info("  2. pnpm env:check -- --mode=runtime");
info("  3. pnpm bootstrap:owner -- --email=owner@contoh.id");
info("  4. pnpm dev, lalu buat workspace pertama lewat /onboarding (template diterapkan otomatis)");
