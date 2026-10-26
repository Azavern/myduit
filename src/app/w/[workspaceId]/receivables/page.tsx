import Link from "next/link";

import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AGING_BUCKETS, formatDateID, isValidDateString, todayInTimezone } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { loadWorkspace } from "@/server/dal/page";
import { listCustomers } from "@/server/services/masters";
import { getReceivables } from "@/server/services/reports";

export const dynamic = "force-dynamic";
export const metadata = { title: "Piutang" };

export default async function ReceivablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;

  const { context, data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const today = todayInTimezone(ctx.workspace.timezone);
    const cutoff = sp.cutoff && isValidDateString(sp.cutoff) ? sp.cutoff : today;
    const bucket = AGING_BUCKETS.map((b) => b.key).includes(sp.bucket as "not_due") ? (sp.bucket as "not_due") : null;
    const report = await getReceivables(tx, workspaceId, cutoff, { customerId: sp.customer ?? null, bucket });
    const customers = await listCustomers(tx, workspaceId, { activeOnly: false, limit: 200 });
    return { today, cutoff, report, customers: customers.rows };
  });

  const columns: ColumnSpec[] = [
    { key: "number", header: "Nomor tagihan" },
    { key: "customer_name", header: "Pelanggan" },
    { key: "business_date", header: "Tanggal", kind: "date" },
    { key: "due_date", header: "Jatuh tempo", kind: "date" },
    { key: "total_amount", header: "Total", kind: "money", align: "right" },
    { key: "paid_amount", header: "Dibayar", kind: "money", align: "right" },
    { key: "balance", header: "Sisa", kind: "money", align: "right" },
    { key: "bucket", header: "Umur", kind: "badge", badges: bucketBadges() },
  ];

  const fields: FilterField[] = [
    { type: "date", name: "cutoff", label: "Per tanggal (as-of)" },
    {
      type: "select",
      name: "bucket",
      label: "Kelompok umur",
      options: [{ value: "", label: "Semua" }, ...AGING_BUCKETS.map((b) => ({ value: b.key, label: b.label }))],
    },
    {
      type: "select",
      name: "customer",
      label: "Pelanggan",
      options: [{ value: "", label: "Semua pelanggan" }, ...data.customers.map((c) => ({ value: c.id, label: c.name }))],
    },
  ];

  const exportQuery = new URLSearchParams();
  if (sp.cutoff) exportQuery.set("cutoff", sp.cutoff);
  if (sp.bucket) exportQuery.set("bucket", sp.bucket);
  if (sp.customer) exportQuery.set("customer", sp.customer);

  return (
    <>
      <PageHeader
        title="Piutang"
        description={`Saldo dihitung as-of ${formatDateID(data.cutoff)}: total tagihan final − alokasi pembayaran efektif sampai tanggal tersebut.`}
        actions={
          <Link
            href={`/api/w/${workspaceId}/export/receivables?${exportQuery.toString()}`}
            className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Ekspor CSV
          </Link>
        }
      />

      <FilterBar
        action={`/w/${workspaceId}/receivables`}
        fields={fields}
        values={{ cutoff: sp.cutoff, bucket: sp.bucket, customer: sp.customer }}
        resetHref={`/w/${workspaceId}/receivables`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Total piutang terbuka" value={formatIDR(data.report.total)} />
        <SummaryTile label="Termasuk terlambat" value={formatIDR(data.report.overdue)} tone="warning" />
        {data.report.byBucket
          .filter((bucket) => bucket.bucket !== "not_due")
          .slice(0, 2)
          .map((bucket) => (
            <SummaryTile key={bucket.bucket} label={bucket.label} value={formatIDR(bucket.amount)} />
          ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tagihan terbuka</CardTitle>
          <span className="text-xs text-ink-subtle">Satu baris = satu tagihan individual</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={columns}
            rows={data.report.rows.map((row) => ({
              id: row.invoice_id,
              number: row.number,
              customer_name: row.customer_name ?? "—",
              business_date: row.business_date,
              due_date: row.due_date,
              total_amount: row.total_amount,
              paid_amount: row.paid_amount,
              balance: row.balance,
              bucket: row.bucket,
            }))}
            rowHref={{ prefix: `/w/${workspaceId}/sales/`, key: "id" }}
            emptyTitle="Tidak ada tagihan terbuka"
            emptyDescription="Semua tagihan sudah lunas, dibatalkan, atau belum ada penjualan kredit pada tanggal acuan."
          />
        </CardBody>
      </Card>

      <p className="mt-3 text-xs text-ink-subtle">
        Workspace: {context.workspace.name}. Perubahan as-of date memengaruhi seluruh angka pada halaman ini.
      </p>
    </>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={tone === "warning" ? "tabular mt-2 text-xl font-semibold text-warning" : "tabular mt-2 text-xl font-semibold text-ink"}>
        {value}
      </p>
    </div>
  );
}

function bucketBadges(): Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" | "brand" }> {
  return {
    not_due: { label: "Belum jatuh tempo", tone: "positive" },
    d1_30: { label: "1–30 hari", tone: "warning" },
    d31_60: { label: "31–60 hari", tone: "warning" },
    d61_90: { label: "61–90 hari", tone: "danger" },
    d90_plus: { label: "> 90 hari", tone: "danger" },
  };
}
