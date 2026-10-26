import { afterEach, describe, expect, it, vi } from "vitest";

import { hashPassword as appHash, verifyPassword as appVerify } from "@/server/auth/password";
import { hashToken as appHashToken } from "@/server/auth/tokens";
import { hashPassword as scriptHash, verifyPassword as scriptVerify } from "../../scripts/lib/password.mjs";
import { hashToken as scriptHashToken } from "../../scripts/lib/tokens.mjs";
import { validateEnv } from "../../scripts/lib/env.mjs";

const PEPPER = "a".repeat(64);

describe("password hashing parity", () => {
  it("accepts hashes produced by the other implementation", async () => {
    const appEncoded = await appHash("kata-sandi-yang-panjang");
    const scriptEncoded = await scriptHash("kata-sandi-yang-panjang");
    expect(await scriptVerify("kata-sandi-yang-panjang", appEncoded)).toBe(true);
    expect(await appVerify("kata-sandi-yang-panjang", scriptEncoded)).toBe(true);
    expect(await scriptVerify("kata-sandi-yang-panjang!", appEncoded)).toBe(false);
    expect(await appVerify("kata-sandi-yang-panjang!", scriptEncoded)).toBe(false);
  });

  it("rejects malformed encodings identically", async () => {
    for (const encoded of ["", "scrypt1$$", "scrypt2$131072,8,1$c2FsdA$aGFzaA", "not-a-hash"]) {
      expect(await appVerify("whatever", encoded)).toBe(false);
      expect(await scriptVerify("whatever", encoded)).toBe(false);
    }
  });
});

describe("token hashing parity", () => {
  it("produces the same HMAC for every purpose", () => {
    for (const purpose of ["session", "invitation", "reset", "ratelimit"] as const) {
      expect(scriptHashToken(purpose, "contoh-token", PEPPER)).toBe(appHashToken(purpose, "contoh-token", PEPPER));
    }
  });
});

describe("env validation parity", () => {
  const base = {
    APP_URL: "http://localhost:3000",
    APP_ENV: "local",
    DATABASE_URL: "postgresql://finance_runtime:pw@localhost:5432/postgres",
    AUTH_TOKEN_PEPPER: PEPPER,
  };

  type EnvRecord = Record<string, string | undefined>;

  function scriptRuntimeOk(env: EnvRecord): boolean {
    return validateEnv("runtime", env).problems.length === 0;
  }

  async function appRuntimeOk(env: EnvRecord): Promise<boolean> {
    const saved = new Map(Object.entries(process.env));
    for (const key of [...saved.keys()]) if (["APP_URL", "APP_ENV", "DATABASE_URL", "AUTH_TOKEN_PEPPER", "DEFAULT_TIMEZONE"].includes(key)) delete process.env[key];
    for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;
    try {
      vi.resetModules();
      const envModule = await import("@/server/env");
      envModule.getRuntimeEnv();
      return true;
    } catch {
      return false;
    } finally {
      for (const key of ["APP_URL", "APP_ENV", "DATABASE_URL", "AUTH_TOKEN_PEPPER", "DEFAULT_TIMEZONE"]) delete process.env[key];
      for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
      vi.resetModules();
    }
  }

  afterEach(() => {
    vi.resetModules();
  });

  it("agrees on valid configuration", async () => {
    expect(scriptRuntimeOk(base)).toBe(true);
    expect(await appRuntimeOk(base)).toBe(true);
  });

  it.each<[string, EnvRecord]>([
    ["missing DATABASE_URL", { ...base, DATABASE_URL: undefined }],
    ["missing APP_URL", { ...base, APP_URL: undefined }],
    ["short pepper", { ...base, AUTH_TOKEN_PEPPER: "abc" }],
    ["non-hex pepper", { ...base, AUTH_TOKEN_PEPPER: "z".repeat(64) }],
    ["relative APP_URL", { ...base, APP_URL: "/dashboard" }],
    ["unknown APP_ENV", { ...base, APP_ENV: "staging" }],
  ])("agrees on invalid configuration: %s", async (_label, env) => {
    expect(scriptRuntimeOk(env)).toBe(false);
    expect(await appRuntimeOk(env)).toBe(false);
  });

  it("agrees that APP_ENV is optional", async () => {
    const env = { ...base, APP_ENV: undefined };
    expect(scriptRuntimeOk(env)).toBe(true);
    expect(await appRuntimeOk(env)).toBe(true);
  });
});
