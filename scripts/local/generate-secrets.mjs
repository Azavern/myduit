#!/usr/bin/env node
/**
 * Generates local secrets and writes them to .secrets/generated.env (ignored by
 * git). Nothing is printed except file paths and variable names.
 *
 *   pnpm secrets:generate                 # refuses to overwrite an existing file
 *   pnpm secrets:generate -- --force      # rotates, keeping a timestamped copy
 *   pnpm secrets:generate -- --out /tmp/x.env
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

import { info, ok, step, warn } from "../lib/log.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const outIndex = args.indexOf("--out");
const outPath = resolve(process.cwd(), outIndex >= 0 ? (args[outIndex + 1] ?? ".secrets/generated.env") : ".secrets/generated.env");

if (existsSync(outPath) && !force) {
  warn(`${outPath} sudah ada. Gunakan --force untuk merotasi (file lama disalin lebih dulu).`);
  process.exit(1);
}

function hex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function parseValue(text, name) {
  const match = new RegExp(`^${name}=(.*)$`, "m").exec(text);
  return match?.[1]?.trim() ?? "";
}

let previous = "";
if (existsSync(outPath)) {
  previous = readFileSync(outPath, "utf8");
  const backup = `${outPath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  writeFileSync(backup, previous, { mode: 0o600 });
  ok(`File sebelumnya disalin ke ${backup}`);
}

// Rotation keeps the pepper stable unless explicitly asked: rotating it
// invalidates every session and invitation token of a running deployment.
const keepPepper = previous && !args.includes("--rotate-pepper");
const pepper = keepPepper ? parseValue(previous, "AUTH_TOKEN_PEPPER") : hex(32);
const runtimePassword = hex(32);

const lines = [
  "# Dibuat oleh `pnpm secrets:generate` — JANGAN commit file ini.",
  `# ${new Date().toISOString()}`,
  "",
  "# Pepa HMAC untuk token sesi/undangan/reset dan bucket rate limit keamanan.",
  `AUTH_TOKEN_PEPPER=${pepper}`,
  "",
  "# Password role database finance_runtime; dipakai `pnpm setup`.",
  `DB_RUNTIME_PASSWORD=${runtimePassword}`,
  "",
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), { mode: 0o600 });

step("Rahasia lokal dibuat");
ok(`${outPath} (mode 600)`);
info("Variabel: AUTH_TOKEN_PEPPER, DB_RUNTIME_PASSWORD");
if (keepPepper) info("AUTH_TOKEN_PEPPER dipertahankan; gunakan --rotate-pepper untuk merotasinya.");
info("Langkah berikutnya: muat nilai ini ke .env.local (lihat docs/env.md) lalu jalankan `pnpm env:check`.");
