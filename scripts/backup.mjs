#!/usr/bin/env node
/**
 * Database backup with pg_dump (custom format) plus verification.
 *
 *   pnpm db:backup
 *   pnpm db:backup -- --dir=./backups --keep=14
 *   pnpm db:backup -- --schema-only
 *
 * The connection string never appears in argv: the child process receives the
 * discrete PG* variables instead. Each dump is verified twice — the PGDMP magic
 * header and a pg_restore table-of-contents listing — before the script reports
 * success. Restore instructions live in docs/runbooks.md.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, readSync, closeSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, resolve } from "node:path";

import { loadEnvFiles, requireEnv, validateEnv } from "./lib/env.mjs";
import { die, fail, info, ok, step, warn } from "./lib/log.mjs";

const DEFAULT_KEEP_DAYS = 14;
const args = process.argv.slice(2);

function flagValue(name) {
  const inline = args.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : "";
}

const outDir = resolve(process.cwd(), flagValue("dir") || "backups");
const keepDays = Number.parseInt(flagValue("keep") || String(DEFAULT_KEEP_DAYS), 10);
const schemaOnly = args.includes("--schema-only");
const pgDumpBin = process.env.PG_DUMP_BIN || "pg_dump";
const pgRestoreBin = process.env.PG_RESTORE_BIN || "pg_restore";

function pgEnv(databaseUrl) {
  const url = new URL(databaseUrl);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  if (/\bsslmode=disable\b/i.test(databaseUrl)) env.PGSSLMODE = "disable";
  else env.PGSSLMODE = env.PGSSLMODE || "require";
  return env;
}

function pgArgs(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
  return [
    "--host",
    url.hostname,
    "--port",
    url.port || "5432",
    "--username",
    decodeURIComponent(url.username),
    "--dbname",
    database,
  ];
}

function binaryAvailable(bin, versionFlag) {
  const result = spawnSync(bin, [versionFlag], { encoding: "utf8" });
  return result.status === 0;
}

function hasMagic(path) {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.alloc(5);
  try {
    readSync(descriptor, buffer, 0, 5, 0);
  } finally {
    closeSync(descriptor);
  }
  return buffer.toString("latin1") === "PGDMP";
}

loadEnvFiles();
const { problems } = validateEnv("setup");
if (problems.length > 0) {
  for (const problem of problems) fail(`${problem.name}: ${problem.reason}`);
  die("DATABASE_ADMIN_URL wajib untuk backup (baca semua tabel tanpa RLS).");
}
const { DATABASE_ADMIN_URL } = requireEnv("DATABASE_ADMIN_URL");

if (!binaryAvailable(pgDumpBin, "--version")) {
  die(
    `Perintah ${pgDumpBin} tidak ditemukan. Pasang PostgreSQL client (mis. ` +
      "`brew install libpq` atau paket postgresql-client) atau set PG_DUMP_BIN.",
    2,
  );
}

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const fileName = `myduit-${stamp}${schemaOnly ? "-schema" : ""}.dump`;
const target = resolve(outDir, fileName);

step(`Membuat backup${schemaOnly ? " (skema saja)" : ""}`);
const dumpArgs = [
  ...pgArgs(DATABASE_ADMIN_URL),
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  target,
];
if (schemaOnly) dumpArgs.push("--schema-only");
const dump = spawnSync(pgDumpBin, dumpArgs, { env: pgEnv(DATABASE_ADMIN_URL), encoding: "utf8" });
if (dump.status !== 0) die(`pg_dump gagal: ${dump.stderr?.trim() || `exit ${dump.status}`}`, dump.status ?? 1);

const size = statSync(target).size;
if (size === 0 || !hasMagic(target)) die("Hasil dump tidak valid (header PGDMP tidak ditemukan).", 5);
ok(`dump dibuat: ${target} (${(size / 1024).toFixed(1)} KiB)`);

if (binaryAvailable(pgRestoreBin, "--version")) {
  const list = spawnSync(pgRestoreBin, ["--list", target], { encoding: "utf8" });
  if (list.status !== 0) die(`Verifikasi pg_restore --list gagal: ${list.stderr?.trim() || ""}`, 5);
  const entries = list.stdout.split("\n").filter((line) => /^\d+;/.test(line)).length;
  if (entries === 0) die("Verifikasi gagal: dump tidak berisi objek apa pun.", 5);
  ok(`verifikasi pg_restore --list: ${entries} objek`);
} else {
  warn(`${pgRestoreBin} tidak tersedia; verifikasi hanya memeriksa header PGDMP.`);
}

step("Retensi");
const cutoff = Date.now() - Math.max(keepDays, 0) * 86_400_000;
let removed = 0;
for (const entry of readdirSync(outDir)) {
  if (!entry.endsWith(".dump")) continue;
  const path = resolve(outDir, entry);
  if (statSync(path).mtimeMs >= cutoff) continue;
  unlinkSync(path);
  removed += 1;
}
ok(`file lebih lama dari ${keepDays} hari dihapus: ${removed}`);
info(`Total dump tersimpan: ${readdirSync(outDir).filter((entry) => entry.endsWith(".dump")).length} (${basename(outDir)}/)`);
