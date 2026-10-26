import "server-only";
import { redirect } from "next/navigation";

import { readSessionToken } from "@/server/auth/cookies";
import { hashToken } from "@/server/auth/tokens";
import { getRuntimeEnv } from "@/server/env";
import { runWithSession } from "@/server/dal/context";
import { postgresErrorCode } from "@/server/db/client";

export type MembershipRole = "owner" | "admin" | "finance" | "cashier" | "viewer";

export type WorkspaceSummary = {
  workspaceId: string;
  name: string;
  role: MembershipRole;
  archivedAt: string | null;
};

export type WorkspaceContext = {
  sessionHash: string;
  actorId: string;
  profile: { id: string; email: string; displayName: string };
  workspace: {
    id: string;
    name: string;
    timezone: string;
    templateCode: string;
    archivedAt: string | null;
  };
  role: MembershipRole;
  workspaces: WorkspaceSummary[];
};

/** Hash of the current browser cookie, or null when the user is signed out. */
export async function currentSessionHash(): Promise<string | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return hashToken("session", token, getRuntimeEnv().AUTH_TOKEN_PEPPER);
}

export async function requireSessionHash(): Promise<string> {
  const sessionHash = await currentSessionHash();
  if (!sessionHash) redirect("/login");
  return sessionHash;
}

export type ActorContext = {
  sessionHash: string;
  actorId: string;
  profile: { id: string; email: string; displayName: string };
  workspaces: WorkspaceSummary[];
};

/** Actor-only context (no workspace). Returns null when the session is invalid. */
export async function getActorContext(sessionHash: string): Promise<ActorContext | null> {
  try {
    return await runWithSession({ sessionHash }, async (tx, ctx) => {
      const profiles = await tx<{ id: string; email: string; display_name: string }[]>`
        select id, email, display_name from app_private.current_profile()
      `;
      const profile = profiles[0];
      if (!profile) return null;
      const workspaces = await tx<{ workspace_id: string; name: string; role: MembershipRole; archived_at: string | null }[]>`
        select workspace_id, name, role, archived_at from app_private.my_workspaces() order by name
      `;
      return {
        sessionHash,
        actorId: ctx.actorId,
        profile: { id: profile.id, email: profile.email, displayName: profile.display_name },
        workspaces: workspaces.map((w) => ({
          workspaceId: w.workspace_id,
          name: w.name,
          role: w.role,
          archivedAt: w.archived_at,
        })),
      };
    });
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code === "28000" || code === "42501") return null;
    throw error;
  }
}

export async function requireActorContext(): Promise<ActorContext> {
  const sessionHash = await requireSessionHash();
  const context = await getActorContext(sessionHash);
  if (!context) redirect("/login");
  return context;
}

/** Full workspace context, or null when the actor cannot access the workspace. */
export async function getWorkspaceContext(
  sessionHash: string,
  workspaceId: string,
): Promise<WorkspaceContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return null;
  try {
    return await runWithSession({ sessionHash, workspaceId }, async (tx, ctx) => {
      const profiles = await tx<{ id: string; email: string; display_name: string }[]>`
        select id, email, display_name from app_private.current_profile()
      `;
      const profile = profiles[0];
      const workspaceRows = await tx<
        { id: string; name: string; timezone: string; template_code: string; archived_at: string | null }[]
      >`select id, name, timezone, template_code, archived_at from public.workspaces where id = ${workspaceId}`;
      const workspace = workspaceRows[0];
      if (!profile || !workspace) return null;
      const membershipRows = await tx<{ role: MembershipRole }[]>`
        select role from public.workspace_memberships
        where workspace_id = ${workspaceId} and user_id = ${ctx.actorId} and status = 'active'
      `;
      const role = membershipRows[0]?.role;
      if (!role) return null;
      const workspaces = await tx<{ workspace_id: string; name: string; role: MembershipRole; archived_at: string | null }[]>`
        select workspace_id, name, role, archived_at from app_private.my_workspaces() order by name
      `;
      return {
        sessionHash,
        actorId: ctx.actorId,
        profile: { id: profile.id, email: profile.email, displayName: profile.display_name },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          timezone: workspace.timezone,
          templateCode: workspace.template_code,
          archivedAt: workspace.archived_at,
        },
        role,
        workspaces: workspaces.map((w) => ({
          workspaceId: w.workspace_id,
          name: w.name,
          role: w.role,
          archivedAt: w.archived_at,
        })),
      };
    });
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code === "28000" || code === "42501") return null;
    throw error;
  }
}

export async function requireWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
  const sessionHash = await requireSessionHash();
  const context = await getWorkspaceContext(sessionHash, workspaceId);
  if (!context) redirect(`/onboarding?denied=${encodeURIComponent(workspaceId)}`);
  return context;
}

/** Cheap existence check used by the onboarding redirect target. */
export async function userHasAnyWorkspace(): Promise<boolean> {
  const sessionHash = await currentSessionHash();
  if (!sessionHash) return false;
  const count = await runWithSession({ sessionHash }, async (tx) => {
    const rows = await tx<{ count: string }[]>`select count(*)::text as count from app_private.my_workspaces()`;
    return rows[0]?.count ?? "0";
  }).catch(() => "0");
  return Number(count) > 0;
}
