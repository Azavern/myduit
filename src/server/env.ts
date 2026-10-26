import "server-only";
import { z } from "zod";

import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/dates";

const httpUrl = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "harus URL http(s) yang valid");

const hex64 = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "harus 64 karakter hex (32 byte acak)");

const runtimeSchema = z.object({
  APP_URL: httpUrl,
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
  DATABASE_URL: z.string().min(1, "connection string PostgreSQL role finance_runtime wajib diisi"),
  AUTH_TOKEN_PEPPER: hex64,
  DEFAULT_TIMEZONE: z.string().default(DEFAULT_TIMEZONE).refine(isValidTimezone, "harus nama zona waktu IANA"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(2),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const adminSchema = z.object({
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
  DATABASE_ADMIN_URL: z.string().min(1, "DATABASE_ADMIN_URL wajib untuk setup/migration/backup"),
});

export type RuntimeEnv = z.infer<typeof runtimeSchema>;
export type AdminEnv = z.infer<typeof adminSchema>;

export class ConfigurationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super("Konfigurasi lingkungan belum valid.");
    this.name = "ConfigurationError";
    // Never include secret values: only variable names and messages.
    this.issues = issues;
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

let cachedRuntime: RuntimeEnv | null = null;

/**
 * Runtime environment. Validated lazily so a build that does not touch the
 * database is allowed to succeed without credentials (blueprint §12).
 */
export function getRuntimeEnv(): RuntimeEnv {
  if (cachedRuntime) return cachedRuntime;
  const parsed = runtimeSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new ConfigurationError(formatIssues(parsed.error));
  }
  cachedRuntime = parsed.data;
  return cachedRuntime;
}

/** Admin environment for migration/backup/bootstrap. Local & CI only. */
export function getAdminEnv(): AdminEnv {
  const parsed = adminSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new ConfigurationError(formatIssues(parsed.error));
  }
  return parsed.data;
}

export function isProduction(): boolean {
  const parsed = z.enum(["local", "preview", "production"]).catch("local").parse(process.env.APP_ENV);
  return parsed === "production";
}

export function appUrl(): string {
  const raw = process.env.APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export const RUNTIME_ENV_KEYS = [
  "APP_URL",
  "APP_ENV",
  "DATABASE_URL",
  "AUTH_TOKEN_PEPPER",
] as const;
