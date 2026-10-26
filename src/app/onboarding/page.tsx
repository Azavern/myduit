import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateWorkspaceForm, WorkspacePicker } from "@/components/app/create-workspace-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActorContext } from "@/server/dal/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; denied?: string }>;
}) {
  const context = await requireActorContext();
  const params = await searchParams;
  const active = context.workspaces.filter((workspace) => !workspace.archivedAt);

  if (active.length > 0 && params.new !== "1" && !params.denied) {
    redirect(`/w/${active[0]!.workspaceId}/dashboard`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-700">myduit</p>
          <h1 className="text-2xl font-semibold text-ink">Pilih atau buat workspace</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Masuk sebagai {context.profile.displayName} ({context.profile.email})
          </p>
        </div>
        <Link href="/" className="text-sm text-brand-700 hover:underline">
          Muat ulang
        </Link>
      </header>

      {params.denied ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-danger-surface px-4 py-3 text-sm text-danger"
        >
          Anda tidak memiliki akses ke workspace yang diminta. Pilih workspace yang tersedia di bawah ini.
        </p>
      ) : null}

      {context.workspaces.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Workspace Anda</CardTitle>
            <Link href="/onboarding?new=1" className="text-sm font-medium text-brand-700 hover:underline">
              Buat workspace baru
            </Link>
          </CardHeader>
          <CardBody>
            <WorkspacePicker workspaces={context.workspaces} />
          </CardBody>
        </Card>
      ) : null}

      {active.length === 0 || params.new === "1" ? <CreateWorkspaceForm /> : null}
    </main>
  );
}
