import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Mirrors the validation in src/server/env.ts. Scripts cannot import that
 * module (it is marked `server-only` and uses path aliases), so the rules live
 * here as well; tests/unit/env-parity.test.ts keeps both implementations
 * aligned for every rule that is duplicated.
 */
export const ENV_FILES = [".env.local", ".env"];

export function loadEnvFiles(cwd = process.cwd()) {
  for (const file of ENV_FILES) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    try {
      process.loadEnvFile(path);
    } catch (error) {
      throw new Error(`Gagal membaca ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const ENVIRONMENTS = ["local", "preview", "production"];
export const TIMEZONE_FALLBACK = "Asia/Makassar";

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isPostgresUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function isHex64(value) {
  return typeof value === "string" && HEX64.test(value);
}

export function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function integerInRange(value, min, max) {
  if (!/^\d+$/.test(value ?? "")) return false;
  const parsed = Number.parseInt(value, 10);
  return parsed >= min && parsed <= max;
}

const RUNTIME_RULES = [
  { name: "APP_URL", required: true, check: isHttpUrl, hint: "http(s) origin aplikasi, tanpa trailing slash" },
  {
    name: "APP_ENV",
    required: false,
    check: (value) => ENVIRONMENTS.includes(value),
    hint: "local | preview | production (default: local)",
  },
  {
    name: "DATABASE_URL",
    required: true,
    check: isPostgresUrl,
    hint: "connection string role finance_runtime (pooler), jangan di-prefix NEXT_PUBLIC_",
  },
  { name: "AUTH_TOKEN_PEPPER", required: true, check: isHex64, hint: "32 byte acak sebagai 64 karakter hex" },
  {
    name: "DEFAULT_TIMEZONE",
    required: false,
    check: isValidTimezone,
    hint: `nama zona waktu IANA, mis. ${TIMEZONE_FALLBACK}`,
  },
  { name: "DATABASE_POOL_MAX", required: false, check: (value) => integerInRange(value, 1, 20), hint: "1-20" },
  {
    name: "SESSION_ABSOLUTE_HOURS",
    required: false,
    check: (value) => integerInRange(value, 1, 720),
    hint: "1-720",
  },
  { name: "SESSION_IDLE_HOURS", required: false, check: (value) => integerInRange(value, 1, 72), hint: "1-72" },
  {
    name: "LOG_LEVEL",
    required: false,
    check: (value) => ["debug", "info", "warn", "error"].includes(value),
    hint: "debug | info | warn | error",
  },
];

const ADMIN_RULES = [
  {
    name: "DATABASE_ADMIN_URL",
    required: true,
    check: isPostgresUrl,
    hint: "kredensial admin (postgres) untuk provisioning; jangan pasang di runtime Vercel",
  },
];

const SETUP_RULES = [
  ...ADMIN_RULES,
  {
    name: "DB_RUNTIME_PASSWORD",
    required: false,
    check: isHex64,
    hint: "password role finance_runtime hasil generator (hanya dipakai saat setup)",
  },
  {
    name: "DATABASE_POOLER_URL",
    required: false,
    check: isPostgresUrl,
    hint: "template Transaction pooler tanpa password",
  },
];

export const RULE_SETS = {
  runtime: RUNTIME_RULES,
  admin: ADMIN_RULES,
  setup: SETUP_RULES,
};

/**
 * Returns { ok: [], problems: [{name, reason}] } for one rule set.
 * @param {"runtime" | "admin" | "setup"} mode
 * @param {Record<string, string | undefined>} [env]
 */
export function validateEnv(mode, env = process.env) {
  const rules = RULE_SETS[mode];
  if (!rules) throw new Error(`Mode validasi tidak dikenal: ${mode}`);
  const okList = [];
  const problems = [];
  for (const rule of rules) {
    const raw = env[rule.name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      // Empty optional variables fall back to the documented default.
      if (!rule.required) okList.push({ name: rule.name, status: "default" });
      else problems.push({ name: rule.name, reason: "wajib diisi", hint: rule.hint });
      continue;
    }
    if (rule.check && !rule.check(value)) {
      problems.push({ name: rule.name, reason: "format tidak valid", hint: rule.hint });
      continue;
    }
    okList.push({ name: rule.name, status: value });
  }
  return { ok: okList, problems };
}

/**
 * Reads a required variable or throws a redaction-safe error.
 * @param {string | string[]} names
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, string>}
 */
export function requireEnv(names, env = process.env) {
  const list = Array.isArray(names) ? names : [names];
  const values = {};
  const missing = [];
  for (const name of list) {
    const value = env[name];
    if (!value || !value.trim()) missing.push(name);
    else values[name] = value.trim();
  }
  if (missing.length > 0) {
    throw new Error(`Variabel lingkungan belum diisi: ${missing.join(", ")}. Jalankan "pnpm env:check" untuk detail.`);
  }
  return values;
}

export function appOrigin(env = process.env) {
  return (env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
