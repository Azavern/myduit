import Link from "next/link";

import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, Pagination, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { formatDateTimeID } from "@/lib/dates";
import { clampInt } from "@/lib/utils";
import { loadWorkspace } from "@/server/dal/page";
import { auditActionLabel, auditEntityLabel, listAuditEvents } from "@/server/services/audit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit" };

const PAGE_SIZE = 25;

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 10_000, 1);

  const { context, data } = await loadWorkspace(workspaceId, async (tx) => {
    const list = await listAuditEvents(tx, workspaceId, {
      action: sp.action ?? null,
      entityType: sp.entity ?? null,
      from: sp.from ?? null,
      to: sp.to ?? null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return list;
  });

  const columns: ColumnSpec[] = [
    { key: "created_at", header: "Waktu" },
    { key: "action", header: "Aksi", kind: "badge", badges: actionBadges() },
    { key: "entity_type", header: "Objek" },
    { key: "actor_name", header: "Pengguna" },
    { key: "reason", header: "Alasan", muted: true },
  ];

  const fields: FilterField[] = [
    {
      type: "select",
      name: "action",
      label: "Aksi",
      options: [
        { value: "", label: "Semua aksi" },
        { value: "insert", label: "Buat" },
        { value: "update", label: "Ubah" },
        { value: "delete", label: "Hapus" },
        { value: "invite", label: "Undang" },
        { value: "accept_invitation", label: "Terima undangan" },
        { value: "revoke_invitation", label: "Cabut undangan" },
      ],
    },
    {
      type: "select",
      name: "entity",
      label: "Objek",
      options: [
        { value: "", label: "Semua objek" },
        { value: "sales_invoices", label: "Tagihan" },
        { value: "payments", label: "Pembayaran" },
        { value: "payment_reversals", label: "Pembalikan pembayaran" },
        { value: "invoice_void_events", label: "Pembatalan tagihan" },
        { value: "financial_transactions", label: "Transaksi kas" },
        { value: "cash_transfers", label: "Transfer" },
        { value: "customers", label: "Pelanggan" },
        { value: "products", label: "Produk" },
        { value: "cash_accounts", label: "Akun kas" },
        { value: "workspace_memberships", label: "Keanggotaan" },
      ],
    },
    { type: "date", name: "from", label: "Dari" },
    { type: "date", name: "to", label: "Sampai" },
  ];

  return (
    <>
      <PageHeader
        title="Audit Aktivitas"
        description="Log bersifat append-only dan tidak dapat diubah atau dihapus dari aplikasi. Password, token, dan data sensitif tidak direkam."
        actions={
          <Link
            href={`/api/w/${workspaceId}/export/audit`}
            className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Ekspor CSV
          </Link>
        }
      />

      <FilterBar
        action={`/w/${workspaceId}/audit`}
        fields={fields}
        values={{ action: sp.action, entity: sp.entity, from: sp.from, to: sp.to }}
        resetHref={`/w/${workspaceId}/audit`}
      />

      <Card>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={columns}
            rows={data.rows.map((row) => ({
              id: row.id,
              created_at: formatDateTimeID(row.created_at, context.workspace.timezone),
              action: row.action,
              entity_type: auditEntityLabel(row.entity_type),
              actor_name: row.actor_name ?? "Sistem",
              reason: row.reason ?? "",
            }))}
            emptyTitle="Belum ada aktivitas"
            emptyDescription="Perubahan data keuangan, keanggotaan, dan pengaturan akan tercatat di sini."
          />
        </CardBody>
      </Card>

      <Pagination
        basePath={`/w/${workspaceId}/audit`}
        query={{ action: sp.action, entity: sp.entity, from: sp.from, to: sp.to }}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.total}
      />
    </>
  );
}

function actionBadges(): Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" | "brand" }> {
  return {
    insert: { label: auditActionLabel("insert"), tone: "brand" },
    update: { label: auditActionLabel("update"), tone: "info" },
    delete: { label: auditActionLabel("delete"), tone: "danger" },
    invite: { label: auditActionLabel("invite"), tone: "warning" },
    accept_invitation: { label: auditActionLabel("accept_invitation"), tone: "positive" },
    revoke_invitation: { label: auditActionLabel("revoke_invitation"), tone: "warning" },
  };
}
