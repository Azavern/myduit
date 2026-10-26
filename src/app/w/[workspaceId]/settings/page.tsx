import { PageHeader } from "@/components/app/page-header";
import { ArchiveWorkspaceForm, WorkspaceSettingsForm } from "@/components/app/settings-forms";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeID } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/permissions";
import { loadWorkspace } from "@/server/dal/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan" };

const TEMPLATE_LABELS: Record<string, string> = {
  sales_receivables: "Penjualan & Piutang",
  simple_cashbook: "Buku Kas Sederhana",
  small_business: "Usaha Kecil",
  freelancer: "Jasa/Freelancer",
  household: "Anggaran Rumah Tangga",
  project_event: "Proyek/Acara",
};

export default async function SettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { context } = await loadWorkspace(workspaceId, async () => null);

  return (
    <>
      <PageHeader
        title="Pengaturan Workspace"
        description="Perubahan pengaturan berlaku untuk transaksi baru; nilai historis dan tanggal dokumen lama tidak diubah."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profil workspace</CardTitle>
          </CardHeader>
          <CardBody>
            <WorkspaceSettingsForm
              workspaceId={workspaceId}
              name={context.workspace.name}
              timezone={context.workspace.timezone}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan konfigurasi</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Mata uang</dt>
                <dd>IDR (Rupiah)</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Template</dt>
                <dd>{TEMPLATE_LABELS[context.workspace.templateCode] ?? context.workspace.templateCode}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Zona waktu</dt>
                <dd>{context.workspace.timezone}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Peran Anda</dt>
                <dd>{ROLE_LABELS[context.role]}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Status arsip</dt>
                <dd>{context.workspace.archivedAt ? formatDateTimeID(context.workspace.archivedAt, context.workspace.timezone) : "Aktif"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-ink-subtle">
              Modul P1 (anggaran, stok, utang pemasok, jadwal cicilan, lampiran, impor, PDF) belum tersedia dan tidak
              ditampilkan sebagai menu aktif.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Arsip workspace</CardTitle>
        </CardHeader>
        <CardBody>
          <ArchiveWorkspaceForm workspaceId={workspaceId} archived={Boolean(context.workspace.archivedAt)} />
        </CardBody>
      </Card>
    </>
  );
}
