#!/usr/bin/env node
/**
 * Creates the first account (owner) through the admin connection. Registration
 * in the app itself is invitation-only, so a fresh deployment needs exactly one
 * operator-created identity.
 *
 *   pnpm bootstrap:owner -- --email=owner@contoh.id
 *   pnpm bootstrap:owner -- --email=owner@contoh.id --name="Nama Pemilik"
 *   pnpm bootstrap:owner -- --email=owner@contoh.id --generate-password
 *   pnpm bootstrap:owner -- --email=owner@contoh.id --reset-password
 *
 * The workspace itself is created in /onboarding after sign-in so the chosen
 * template preset (categories, payment methods, cash accounts) is applied by
 * the same code path the UI uses.
 */
import { isHex64, loadEnvFiles, requireEnv, validateEnv } from "./lib/env.mjs";
import { withGuardedConnection, hasSchema } from "./lib/db.mjs";
import { generatePassword, hashPassword, verifyPassword } from "./lib/password.mjs";
import { die, fail, info, ok, step, warn } from "./lib/log.mjs";
import { promptHidden } from "./lib/prompt.mjs";

const args = process.argv.slice(2);

function flagValue(name) {
  const inline = args.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : "";
}

const generatePasswordFlag = args.includes("--generate-password");
const resetPassword = args.includes("--reset-password");
const email = flagValue("email") || process.env.OWNER_EMAIL || "";
const displayName = flagValue("name") || process.env.OWNER_NAME || "Pemilik";

loadEnvFiles();

step("Memeriksa konfigurasi");
for (const problem of validateEnv("setup").problems) {
  fail(`${problem.name}: ${problem.reason}${problem.hint ? ` — ${problem.hint}` : ""}`);
}
if (validateEnv("setup").problems.length > 0) die("Lengkapi konfigurasi lalu jalankan ulang.");

if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
  die("Alamat email pemilik wajib dan harus valid: --email=owner@contoh.id");
}

const { DATABASE_ADMIN_URL } = requireEnv("DATABASE_ADMIN_URL");

let password = process.env.OWNER_PASSWORD?.trim() ?? "";
let generated = false;
if (!password && generatePasswordFlag) {
  password = generatePassword();
  generated = true;
} else if (!password) {
  password = await promptHidden("Kata sandi pemilik (minimal 12 karakter, tidak ditampilkan): ");
  const repeat = await promptHidden("Ulangi kata sandi: ");
  if (password !== repeat) die("Kata sandi tidak sama.");
}
if (password.length < 12) die("Kata sandi minimal 12 karakter.");

const passwordHash = await hashPassword(password);
const normalized = email.trim().toLowerCase();

await withGuardedConnection(DATABASE_ADMIN_URL, async (sql) => {
  if (!(await hasSchema(sql))) die("Skema belum ada. Jalankan `pnpm setup` (dengan --migrate) lebih dulu.", 3);

  const existing = await sql`
    select id, display_name, status from public.users where email_normalized = ${normalized}
  `;

  if (existing.length > 0) {
    const user = existing[0];
    if (!resetPassword) {
      warn(`Akun ${normalized} sudah ada (id: ${user.id}, status: ${user.status}).`);
      info("  · gunakan --reset-password untuk mengganti kata sandinya.");
      return;
    }
    await sql.begin(async (tx) => {
      await tx`
        update public.users
        set password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now()
        where id = ${user.id}
      `;
      await tx`
        update app_private.sessions set revoked_at = coalesce(revoked_at, now()) where user_id = ${user.id}
      `;
    });
    const verified = await sql`select password_hash from public.users where id = ${user.id}`;
    if (!(await verifyPassword(password, verified[0]?.password_hash ?? ""))) {
      die("Verifikasi hash kata sandi gagal setelah pembaruan.", 5);
    }
    ok(`kata sandi ${normalized} diperbarui; seluruh sesi aktif dicabut`);
    return;
  }

  const inserted = await sql`
    insert into public.users (email, email_normalized, display_name, password_hash)
    values (${email.trim()}, ${normalized}, ${displayName}, ${passwordHash})
    returning id, created_at
  `;
  const user = inserted[0];
  if (!user?.id) die("Pembuatan akun gagal tanpa pesan dari database.", 5);

  const verified = await sql`select password_hash from public.users where id = ${user.id}`;
  if (!(await verifyPassword(password, verified[0]?.password_hash ?? ""))) {
    die("Verifikasi hash kata sandi gagal setelah pembuatan akun.", 5);
  }
  ok(`akun owner dibuat: ${normalized} (id: ${user.id})`);
});

step("Hasil");
info(`  · email: ${normalized}`);
if (generated) {
  // Printed once, on the operator's own terminal, because it is the only copy.
  info(`  · kata sandi sementara: ${password}`);
  warn("Simpan sekarang dan ganti setelah masuk; keluaran ini tidak disimpan di mana pun.");
} else if (isHex64(process.env.OWNER_PASSWORD ?? "")) {
  info("  · kata sandi berasal dari OWNER_PASSWORD");
}
info("  1. pnpm dev");
info("  2. Masuk di /login dengan akun di atas");
info("  3. Buat workspace pertama di /onboarding (template diterapkan otomatis)");
