#!/usr/bin/env node
/**
 * Validates environment configuration without printing any secret value.
 *
 *   pnpm env:check              # runtime (default)
 *   pnpm env:check -- --mode=admin
 *   pnpm env:check -- --mode=setup
 *
 * Exit codes: 0 = semua valid, 1 = ada masalah konfigurasi.
 */
import { loadEnvFiles, RULE_SETS, validateEnv } from "./lib/env.mjs";
import { fail, info, ok, step, warn } from "./lib/log.mjs";

function parseMode(argv) {
  const flag = argv.find((value) => value.startsWith("--mode"));
  if (!flag) return "runtime";
  const [, value] = flag.split("=");
  return value ?? argv[argv.indexOf(flag) + 1] ?? "runtime";
}

const mode = parseMode(process.argv.slice(2));
if (!RULE_SETS[mode]) {
  fail(`Mode tidak dikenal: ${mode}. Pilihan: ${Object.keys(RULE_SETS).join(", ")}.`);
  process.exit(1);
}

loadEnvFiles();
step(`Memeriksa konfigurasi (mode: ${mode})`);

const { ok: valid, problems } = validateEnv(mode);

for (const entry of valid) {
  if (entry.status === "default") info(`  · ${entry.name}: kosong, memakai nilai default`);
  else ok(entry.name);
}

for (const problem of problems) {
  fail(`${problem.name}: ${problem.reason}${problem.hint ? ` — ${problem.hint}` : ""}`);
}

if (problems.length > 0) {
  info("\nNilai tidak pernah ditampilkan oleh pemeriksa ini.");
  process.exit(1);
}

if (valid.every((entry) => entry.status === "default")) warn("Tidak ada variabel yang diperiksa (semua kosong/opsional).");
info("\nKonfigurasi valid.");
