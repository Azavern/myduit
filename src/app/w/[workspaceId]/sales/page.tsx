import Link from "next/link";

import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, Pagination, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { formatDateID, PERIOD_PRESETS, resolvePeriod } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { paymentStatusLabel, type PaymentStatus } from "@/lib/invoice";
import { clampInt } from "@/lib/utils";
import { loadWorkspace } from "@/server/dal/page";
import { listCustomers } from "@/server/services/masters";
import { invoiceSortKey, listInvoices } from "@/server/services/sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Penjualan" };

const PAGE_SIZE = 25;

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 10_000, 1);

  const { data } = await loadWorkspace(workspaceId, async (tx, context) => {
    const range = resolvePeriod(sp.period, sp.from, sp.to, context.workspace.timezone);
    const list = await listInvoices(tx, workspaceId, {
      from: range.from,
      to: range.to,
      customerId: sp.customer ?? null,
      paymentState: (sp.status as "all") ?? "all",
      search: sp.q ?? null,
      sortKey: invoiceSortKey(sp.sort),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    const customers = await listCustomers(tx, workspaceId, { activeOnly: false, limit: 200 });
    return { range, list, customers: customers.rows };
  });

  const columns: ColumnSpec[] = [
    { key: "number", header: "Nomor" },
    { key: "business_date", header: "Tanggal", kind: "date" },
    { key: "customer_name", header: "Pelanggan" },
    { key: "due_date", header: "Jatuh tempo", kind: "date" },
    { key: "total_amount", header: "Total", kind: "money", align: "right" },
    { key: "balance", header: "Sisa", kind: "money", align: "right" },
    {
      key: "state",
      header: "Status",
      kind: "badge",
      badges: statusBadges(),
    },
    { key: "creator", header: "Dibuat oleh", muted: true },
  ];

  const fields: FilterField[] = [
    { type: "select", name: "period", label: "Periode", options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
    { type: "date", name: "from", label: "Dari" },
    { type: "date", name: "to", label: "Sampai" },
    {
      type: "select",
      name: "status",
      label: "Status",
      options: [
        { value: "all", label: "Semua status" },
        { value: "draft", label: "Draft" },
        { value: "unpaid", label: "Belum dibayar" },
        { value: "partial", label: "Dibayar sebagian" },
        { value: "paid", label: "Lunas" },
        { value: "overdue", label: "Terlambat" },
        { value: "void", label: "Dibatalkan" },
      ],
    },
    {
      type: "select",
      name: "customer",
      label: "Pelanggan",
      options: [{ value: "", label: "Semua pelanggan" }, ...data.customers.map((c) => ({ value: c.id, label: c.name }))],
    },
    { type: "search", name: "q", label: "Cari nomor/pelanggan", placeholder: "INV-2026…" },
  ];

  const queryForLinks: Record<string, string | undefined> = {
    period: sp.period,
    from: sp.from,
    to: sp.to,
    status: sp.status,
    customer: sp.customer,
    q: sp.q,
    sort: sp.sort,
  };

  return (
    <>
      <PageHeader
        title="Penjualan"
        description={`Tagihan pada ${data.range.label.toLowerCase()}. Satu baris mewakili satu dokumen penjualan, bukan satu pelanggan.`}
        actions={
          <>
            <Link
              href={`/w/${workspaceId}/sales/new`}
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Buat Penjualan
            </Link>
            <Link
              href={`/api/w/${workspaceId}/export/invoices?${new URLSearchParams(
                Object.entries(queryForLinks).filter(([, value]) => value) as [string, string][],
              ).toString()}`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Ekspor CSV
            </Link>
          </>
        }
      />

      <FilterBar
        action={`/w/${workspaceId}/sales`}
        fields={fields}
        values={{ period: sp.period, from: sp.from, to: sp.to, status: sp.status, customer: sp.customer, q: sp.q }}
        resetHref={`/w/${workspaceId}/sales`}
      />

      <Card>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={columns}
            rows={data.list.rows.map((row) => ({
              id: row.id,
              number: row.number ?? "Draft",
              business_date: row.business_date,
              customer_name: row.customer_name ?? "(tanpa pelanggan)",
              due_date: row.due_date,
              total_amount: row.total_amount,
              balance: row.balance,
              state: computeState(row.status, BigInt(row.total_amount), BigInt(row.balance), row.voided),
              creator: row.creator,
            }))}
            rowHref={{ prefix: `/w/${workspaceId}/sales/`, key: "id" }}
            emptyTitle="Belum ada penjualan pada filter ini"
            emptyDescription="Buat penjualan baru atau ubah filter periode. Draft juga tampil di daftar ini."
            summary={`Total piutang pada ${data.range.label.toLowerCase()}: ${formatIDR(
              data.list.rows.reduce((sum, row) => sum + BigInt(row.balance), 0n),
            )} (berdasarkan halaman ini). Lihat laporan piutang untuk angka lengkap.`}
          />
        </CardBody>
      </Card>

      <Pagination
        basePath={`/w/${workspaceId}/sales`}
        query={queryForLinks}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.list.total}
      />
      <p className="mt-2 text-xs text-ink-subtle">
        Periode: {formatDateID(data.range.from)} – {formatDateID(data.range.to)}. Angka piutang akhir dihitung per
        cutoff, bukan per periode.
      </p>
    </>
  );
}

function computeState(status: "draft" | "final", total: bigint, balance: bigint, voided: boolean): PaymentStatus {
  if (voided) return "void";
  if (status === "draft") return "draft";
  const paid = total - balance;
  if (paid <= 0n) return "unpaid";
  if (paid < total) return "partial";
  return "paid";
}

function statusBadges(): Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" | "brand" }> {
  return {
    draft: { label: paymentStatusLabel("draft"), tone: "neutral" },
    unpaid: { label: paymentStatusLabel("unpaid"), tone: "warning" },
    partial: { label: paymentStatusLabel("partial"), tone: "info" },
    paid: { label: paymentStatusLabel("paid"), tone: "positive" },
    void: { label: paymentStatusLabel("void"), tone: "danger" },
  };
}
