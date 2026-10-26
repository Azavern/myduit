import "server-only";
import { cookies } from "next/headers";

import { appUrl, getRuntimeEnv } from "@/server/env";

const PROD_COOKIE = "__Host-finance_session";
const DEV_COOKIE = "finance_session_dev";

function secureContext(): boolean {
  return appUrl().startsWith("https://");
}

export function sessionCookieName(): string {
  return secureContext() ? PROD_COOKIE : DEV_COOKIE;
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  // Support both names so switching APP_URL does not lock a developer out.
  return store.get(sessionCookieName())?.value ?? store.get(DEV_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(token: string): Promise<void> {
  const env = getRuntimeEnv();
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: secureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_ABSOLUTE_HOURS * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  for (const name of [PROD_COOKIE, DEV_COOKIE]) {
    store.set(name, "", {
      httpOnly: true,
      secure: secureContext(),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}
