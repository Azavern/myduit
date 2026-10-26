import Link from "next/link";

import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { AgingChart } from "@/components/app/charts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PERIOD_PRESETS, resolvePeriod, todayInTimezone } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { loadWorkspace } from "@/server/dal/page";
import { listCashAccounts } from "@/server/services/masters";
import { getCashFlow, getReceipts, getReceivables, getSalesReport } from "@/server/services/reports";

export const dynamic = "force-dynamic";
export const metadata = { title: "Laporan" };

function exportHref(workspaceId: string, type: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams({ type });
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  return `/w/${workspaceId}/export?${params.toString()}`;
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const granularity = sp.growth === "month" ? "month" : sp.growth === "day" ? "day" : "month";

  const { context, data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const range = resolvePeriod(sp.period, sp.from, sp.to, ctx.workspace.timezone);
    const cutoff = todayInTimezone(ctx.workspace.timezone);
    const accountId = sp.account ?? null;
    const [sales, cashFlow, receipts, receivables, accounts] = await Promise.all([
      getSalesReport(tx, workspaceId, range, granularity),
      getCashFlow(tx, workspaceId, range, accountId, granularity),
      getReceipts(tx, workspaceId, range),
      getReceivables(tx, workspaceId, cutoff),
      listCashAccounts(tx, workspaceId, true),
    ]);
    return { range, cutoff, granularity, sales, cashFlow, receipts, receivables, accounts };
  });

  const query = { period: sp.period, from: sp.from, to: sp.to, growth: sp.growth, account: sp.account };
  const canExport = context.role !== "viewer";

  const fields: FilterField[] = [
    { type: "select", name: "period", label: "Periode", options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
    { type: "date", name: "from", label: "Dari" },
    { type: "date", name: "to", label: "Sampai" },
    {
      type: "select",
      name: "growth",
      label: "Kelompok",
      options: [
        { value: "month", label: "Bulanan" },
        { value: "day", label: "Harian" },
      ],
    },
    {
      type: "select",
      name: "account",
      label: "Akun kas",
      options: [{ value: "", label: "Semua akun" }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))],
    },
  ];

  const salesColumns: ColumnSpec[] = [
    { key: "bucket", header: data.granularity === "month" ? "Bulan" : "Tanggal", kind: "date" },
    { key: "invoices", header: "Jumlah tagihan", kind: "numeric", align: "right" },
    { key: "sales", header: "Penjualan", kind: "money", align: "right" },
    { key: "receipts", header: "Penerimaan kas", kind: "money", align: "right" },
  ];

  const cashFlowColumns: ColumnSpec[] = [
    { key: "bucket", header: data.granularity === "month" ? "Bulan" : "Tanggal", kind: "date" },
    { key: "opening", header: "Saldo awal", kind: "money", align: "right" },
    { key: "inflow", header: "Masuk", kind: "money", align: "right" },
    { key: "outflow", header: "Keluar", kind: "money", align: "right" },
    { key: "closing", header: "Saldo akhir", kind: "money", align: "right" },
  ];

  const receiptColumns: ColumnSpec[] = [
    { key: "number", header: "Nomor" },
    { key: "business_date", header: "Tanggal", kind: "date" },
    { key: "customer_name", header: "Pelanggan" },
    { key: "method_name", header: "Metode" },
    { key: "account_name", header: "Akun" },
    { key: "amount", header: "Nominal", kind: "money", align: "right" },
    {
      key: "state",
      header: "Status",
      kind: "badge",
      badges: { effective: { label: "Efektif", tone: "positive" }, reversed: { label: "Dibatalkan", tone: "warning" } },
    },
  ];

  return (
    <>
      <PageHeader
        title="Laporan"
        description={`Periode: ${data.range.label}. Laporan dihitung dari pergerakan kas dan posisi piutang pada tanggal cutoff (${data.cutoff}).`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canExport ? (
          <>
            <Link href={exportHref(workspaceId, "sales", query)} className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm hover:bg-brand-50">
              Ekspor penjualan (CSV)
            </Link>
            <Link href={exportHref(workspaceId, "cash-flow", query)} className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm hover:bg-brand-50">
              Ekspor arus kas (CSV)
            </Link>
            <Link href={exportHref(workspaceId, "receipts", query)} className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm hover:bg-brand-50">
              Ekspor penerimaan (CSV)
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Ekspor CSV tersedia untuk peran selain viewer.</p>
        )}
      </div>

      <FilterBar
        action={`/w/${workspaceId}/reports`}
        fields={fields}
        values={{ period: sp.period, from: sp.from, to: sp.to, growth: sp.growth, account: sp.account }}
        resetHref={`/w/${workspaceId}/reports`}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Laporan penjualan &amp; penerimaan</CardTitle>
          <span className="text-xs text-ink-subtle">
            Total penjualan {formatIDR(data.sales.totalSales)} · Total penerimaan {formatIDR(data.sales.totalReceipts)}
          </span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={salesColumns}
            rows={data.sales.rows as unknown as Record<string, string | number>[]}
            emptyTitle="Tidak ada data penjualan"
            emptyDescription="Pilih periode lain atau catat penjualan final terlebih dahulu."
          />
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Arus kas</CardTitle>
          <span className="text-xs text-ink-subtle">Transfer antar akun dikecualikan dari pemasukan/pengeluaran operasional, tetapi memengaruhi saldo akun.</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={cashFlowColumns}
            rows={data.cashFlow.rows as unknown as Record<string, string | number>[]}
            emptyTitle="Tidak ada pergerakan kas"
            emptyDescription="Belum ada pergerakan kas pada periode ini."
            summary={
              <span>
                Saldo per akun:{" "}
                {data.cashFlow.byAccount
                  .map((row) => `${row.account_name} ${formatIDR(row.closing)}`)
                  .join(" · ") || "—"}
              </span>
            }
          />
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Penerimaan pembayaran</CardTitle>
          <span className="text-xs text-ink-subtle">Total efektif {formatIDR(data.receipts.total)}</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={receiptColumns}
            rows={data.receipts.rows.map((row) => ({ ...row, state: row.reversed ? "reversed" : "effective" }))}
            emptyTitle="Tidak ada penerimaan"
            emptyDescription="Pembayaran pelanggan akan tampil di sini."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Umur piutang</CardTitle>
          <span className="text-xs text-ink-subtle">
            Posisi per {data.cutoff} · Total {formatIDR(data.receivables.total)} (jatuh tempo {formatIDR(data.receivables.overdue)})
          </span>
        </CardHeader>
        <CardBody>
          <AgingChart data={data.receivables.byBucket} />
        </CardBody>
      </Card>
    </>
  );
}
