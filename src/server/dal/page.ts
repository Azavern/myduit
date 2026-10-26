import "server-only";

import type { Tx } from "@/server/db/client";
import { runWithSession } from "@/server/dal/context";
import { requireWorkspaceContext, type WorkspaceContext } from "@/server/dal/session";

export type LoadedWorkspace<T> = { context: WorkspaceContext; data: T };

/**
 * Resolves the verified workspace context (redirecting if the actor has no
 * access) and runs `loader` inside one transaction with the tenant context
 * installed. Every page/action data read goes through here.
 */
export async function loadWorkspace<T>(
  workspaceId: string,
  loader: (tx: Tx, context: WorkspaceContext) => Promise<T>,
  options: { isolation?: "repeatable read" | "serializable" } = {},
): Promise<LoadedWorkspace<T>> {
  const context = await requireWorkspaceContext(workspaceId);
  const data = await runWithSession(
    { sessionHash: context.sessionHash, workspaceId, isolation: options.isolation },
    (tx) => loader(tx, context),
  );
  return { context, data };
}

/** Same as loadWorkspace but without redirecting; returns null when denied. */
export async function tryLoadWorkspace<T>(
  workspaceId: string,
  loader: (tx: Tx, context: WorkspaceContext) => Promise<T>,
): Promise<LoadedWorkspace<T> | null> {
  const { getWorkspaceContext, currentSessionHash } = await import("@/server/dal/session");
  const sessionHash = await currentSessionHash();
  if (!sessionHash) return null;
  const context = await getWorkspaceContext(sessionHash, workspaceId);
  if (!context) return null;
  const data = await runWithSession({ sessionHash, workspaceId }, (tx) => loader(tx, context));
  return { context, data };
}
