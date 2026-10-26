"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { MembershipRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/permissions";

export function WorkspaceSwitcher({
  currentWorkspaceId,
  workspaces,
}: {
  currentWorkspaceId: string;
  workspaces: { workspaceId: string; name: string; role: MembershipRole; archivedAt: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (workspaces.length <= 1) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2">
        <p className="truncate text-sm font-medium text-ink">{workspaces[0]?.name ?? "Workspace"}</p>
        <p className="text-xs text-ink-subtle">{ROLE_LABELS[(workspaces[0]?.role ?? "viewer") as MembershipRole]}</p>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="sr-only">Pilih workspace aktif</span>
      <select
        value={currentWorkspaceId}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => router.push(`/w/${next}/dashboard`));
        }}
        className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-medium text-ink"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.workspaceId} value={workspace.workspaceId}>
            {workspace.name}
            {workspace.archivedAt ? " (arsip)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
