import "server-only";

import { AuthError } from "@/server/errors";
import { getSql, type Tx } from "@/server/db/client";

export type SessionContext = {
  actorId: string;
  sessionHash: string;
  workspaceId: string | null;
};

export type IsolationLevel = "repeatable read" | "serializable";

export type RunOptions = {
  sessionHash: string;
  workspaceId?: string | null;
  requestId?: string | null;
  isolation?: IsolationLevel;
};

/**
 * Runs `fn` inside one database transaction whose first statement installs the
 * verified session context (`app.session_hash`, `app.workspace_id`). Because the
 * settings are transaction-local, the context can never leak into the next
 * request that reuses a pooled connection (blueprint §7).
 */
export async function runWithSession<T>(
  options: RunOptions,
  fn: (tx: Tx, ctx: SessionContext) => Promise<T>,
): Promise<T> {
  const sql = getSql();
  const result = await sql.begin(async (tx) => {
    if (options.isolation) {
      // Whitelisted literal; never interpolate client input here.
      await tx.unsafe(`set transaction isolation level ${options.isolation}`);
    }
    const rows = await tx<{ actor_id: string | null }[]>`
      select app_private.set_context(
        ${options.sessionHash}::text,
        ${options.workspaceId ?? null}::uuid,
        ${options.requestId ?? null}::text
      ) as actor_id
    `;
    const actorId = rows[0]?.actor_id ?? null;
    if (!actorId) {
      throw new AuthError("Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.");
    }
    return fn(tx, { actorId, sessionHash: options.sessionHash, workspaceId: options.workspaceId ?? null });
  });
  return result as T;
}

/**
 * Transaction without session context. Used only by pre-authentication flows
 * (login, registration, password reset) that call SECURITY DEFINER helpers.
 */
export async function runWithoutSession<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = getSql();
  const result = await sql.begin(async (tx) => fn(tx));
  return result as T;
}
