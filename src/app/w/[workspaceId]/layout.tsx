import { AppShell } from "@/components/app/app-shell";
import { requireWorkspaceContext } from "@/server/dal/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const context = await requireWorkspaceContext(workspaceId);

  return (
    <AppShell
      workspaceId={context.workspace.id}
      timezone={context.workspace.timezone}
      archived={Boolean(context.workspace.archivedAt)}
      role={context.role}
      profile={{ displayName: context.profile.displayName, email: context.profile.email }}
      workspaces={context.workspaces}
    >
      {children}
    </AppShell>
  );
}
