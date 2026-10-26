import Link from "next/link";

import { AgingChart, CashFlowChart, ExpenseDonut, SalesVsReceiptsChart } from "@/components/app/charts";
import { DataTable } from "@/components/app/data-table";
import { FilterBar, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader, CardTitle, StatTile } from "@/components/ui/card";
import { formatDateID, PERIOD_PRESETS, resolvePeriod, todayInTimezone } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { auditEntityLabel, listAuditEvents } from "@/server/services/audit";
import { getDashboard, getReceivables } from "@/server/services/reports";
import { loadWorkspace } from "@/server/dal/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const PERIOD_FIELDS: FilterField[] = [
  {
    type: "select",
    name: "period",
    label: "Periode",
    options: PERIOD_PRESETS.map((preset) => ({ value: preset.key, label: preset.label })),
  },
  { type: "date", name: "from", label: "Dari" },
  { type: "date", name: "to", label: "Sampai" },
];

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;

  const { data } = await loadWorkspace(
    workspaceId,
    async (tx, context) => {
      const cutoff = todayInTimezone(context.workspace.timezone);
      const range = resolvePeriod(sp.period, sp.from, sp.to, context.workspace.timezone);
      const dashboard = await getDashboard(tx, workspaceId, { from: range.from, to: range.to, cutoff });
      const overdue = await getReceivables(tx, workspaceId, cutoff, { bucket: "d1_30" });
      const audit = await listAuditEvents(tx, workspaceId, { limit: 6 });
      return { cutoff, range, dashboard, overdue, audit };
    },
    { isolation: "repeatable read" },
  );

  const { range, cutoff, dashboard, overdue, audit } = data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Ringkasan ${range.label.toLowerCase()} · saldo dan piutang dihitung per ${formatDateID(cutoff)}.`}
        actions={
          <>
            <Link
              href={`/w/${workspaceId}/sales/new`}
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Buat Penjualan
            </Link>
            <Link
              href={`/w/${workspaceId}/payments/new`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Catat Pembayaran
            </Link>
            <Link
              href={`/w/${workspaceId}/transactions?new=expense`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Tambah Pengeluaran
            </Link>
          </>
        }
      />

      <FilterBar
        action={`/w/${workspaceId}/dashboard`}
        fields={PERIOD_FIELDS}
        values={{ period: sp.period, from: sp.from, to: sp.to }}
        resetHref={`/w/${workspaceId}/dashboard`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total penjualan" value={formatIDR(dashboard.sales)} hint={`${dashboard.salesCount} tagihan final`} />
        <StatTile
          label="Kas masuk"
          value={formatIDR(dashboard.cashIn)}
          tone="positive"
          href={`/w/${workspaceId}/reports?tab=cashflow&period=${sp.period ?? "this_month"}`}
        />
        <StatTile
          label="Kas keluar"
          value={formatIDR(dashboard.cashOut)}
          tone="negative"
          href={`/w/${workspaceId}/transactions?period=${sp.period ?? "this_month"}`}
        />
        <StatTile label="Perubahan kas bersih" value={formatIDR(dashboard.netCash)} hint="Bukan laba bersih" />
        <StatTile label="Saldo kas saat ini" value={formatIDR(dashboard.cashBalance)} />
        <StatTile
          label="Piutang terbuka"
          value={formatIDR(dashboard.receivable)}
          hint={`${dashboard.unpaidCount} tagihan belum lunas`}
          href={`/w/${workspaceId}/receivables`}
        />
        <StatTile
          label="Piutang terlambat"
          value={formatIDR(dashboard.overdue)}
          tone="warning"
          href={`/w/${workspaceId}/receivables?status=overdue`}
        />
        <StatTile
          label="Tagihan jatuh tempo ≤ 30 hari"
          value={formatIDR(overdue.byBucket.find((bucket) => bucket.bucket === "d1_30")?.amount ?? "0")}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Arus kas masuk vs keluar</CardTitle>
            <Link href={`/w/${workspaceId}/reports?tab=cashflow`} className="text-sm text-brand-700 hover:underline">
              Lihat laporan arus kas
            </Link>
          </CardHeader>
          <CardBody>
            <CashFlowChart data={dashboard.cashFlow.map((point) => ({ bucket: point.bucket, inflow: point.inflow, outflow: point.outflow }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Penjualan vs penerimaan</CardTitle>
          </CardHeader>
          <CardBody>
            <SalesVsReceiptsChart data={dashboard.salesVsReceipts} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Komposisi pengeluaran</CardTitle>
          </CardHeader>
          <CardBody>
            <ExpenseDonut data={dashboard.expenseByCategory.map((item) => ({ name: item.name, amount: item.amount }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Umur piutang per {formatDateID(cutoff)}</CardTitle>
          </CardHeader>
          <CardBody>
            <AgingChart data={dashboard.aging.map((bucket) => ({ label: bucket.label, amount: bucket.amount }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perlu ditindaklanjuti</CardTitle>
            <Link href={`/w/${workspaceId}/receivables`} className="text-sm text-brand-700 hover:underline">
              Semua piutang
            </Link>
          </CardHeader>
          <CardBody className="px-0 py-0">
            <DataTable
              columns={[
                { key: "number", header: "Nomor", sortable: false },
                { key: "customer_name", header: "Pelanggan", sortable: false },
                { key: "due_date", header: "Jatuh tempo", kind: "date", sortable: false },
                { key: "balance", header: "Sisa", kind: "money", align: "right", sortable: false },
              ]}
              rows={dashboard.dueSoon.map((invoice) => ({
                id: invoice.invoice_id,
                number: invoice.number,
                customer_name: invoice.customer_name ?? "—",
                due_date: invoice.due_date,
                balance: invoice.balance,
              }))}
              rowHref={{ prefix: `/w/${workspaceId}/sales/`, key: "id" }}
              emptyTitle="Tidak ada tagihan terbuka"
              emptyDescription="Semua tagihan sudah lunas atau belum ada penjualan kredit."
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Aktivitas terbaru</CardTitle>
          <Link href={`/w/${workspaceId}/audit`} className="text-sm text-brand-700 hover:underline">
            Audit lengkap
          </Link>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={[
              { key: "created_at", header: "Waktu", kind: "date", sortable: false },
              { key: "action", header: "Aksi", kind: "badge", badges: badgeMap(), sortable: false },
              { key: "entity_type", header: "Objek", sortable: false },
              { key: "actor_name", header: "Pengguna", sortable: false },
            ]}
            rows={audit.rows.map((row) => ({
              id: row.id,
              created_at: row.created_at,
              action: row.action,
              entity_type: auditEntityLabel(row.entity_type),
              actor_name: row.actor_name ?? "Sistem",
            }))}
            emptyTitle="Belum ada aktivitas"
            emptyDescription="Aktivitas yang mengubah data akan tercatat di sini."
          />
        </CardBody>
      </Card>

      <p className="mt-4 text-xs text-ink-subtle">
        Catatan: angka &quot;perubahan kas bersih&quot; bukan laba bersih. Laba bersih memerlukan cakupan biaya dan
        pengakuan pendapatan yang belum tersedia pada prototipe ini.
      </p>
    </>
  );
}

function badgeMap() {
  const tones: Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" | "brand" }> = {
    insert: { label: "Buat", tone: "brand" },
    update: { label: "Ubah", tone: "info" },
    delete: { label: "Hapus", tone: "danger" },
    invite: { label: "Undang", tone: "warning" },
    accept_invitation: { label: "Terima undangan", tone: "positive" },
    revoke_invitation: { label: "Cabut undangan", tone: "warning" },
  };
  return tones;
}
