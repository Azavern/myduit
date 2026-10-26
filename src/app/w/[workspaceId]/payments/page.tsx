import Link from "next/link";

import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, Pagination, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PERIOD_PRESETS, resolvePeriod } from "@/lib/dates";
import { clampInt } from "@/lib/utils";
import { loadWorkspace } from "@/server/dal/page";
import { listPayments } from "@/server/services/payments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pembayaran" };

const PAGE_SIZE = 25;

export default async function PaymentsPage({
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
    const list = await listPayments(tx, workspaceId, {
      from: range.from,
      to: range.to,
      search: sp.q ?? null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return { range, list };
  });

  const columns: ColumnSpec[] = [
    { key: "number", header: "Nomor penerimaan" },
    { key: "business_date", header: "Tanggal", kind: "date" },
    { key: "customer_name", header: "Pelanggan" },
    { key: "account_name", header: "Akun" },
    { key: "method_name", header: "Metode" },
    { key: "amount", header: "Nominal", kind: "money", align: "right" },
    {
      key: "state",
      header: "Status",
      kind: "badge",
      badges: {
        effective: { label: "Efektif", tone: "positive" },
        reversed: { label: "Dibalikkan", tone: "danger" },
      },
    },
  ];

  const fields: FilterField[] = [
    { type: "select", name: "period", label: "Periode", options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
    { type: "date", name: "from", label: "Dari" },
    { type: "date", name: "to", label: "Sampai" },
    { type: "search", name: "q", label: "Cari nomor/pelanggan", placeholder: "PAY-2026…" },
  ];

  const queryForLinks: Record<string, string | undefined> = {
    period: sp.period,
    from: sp.from,
    to: sp.to,
    q: sp.q,
  };

  const exportQuery = new URLSearchParams(
    Object.entries({ period: sp.period, from: sp.from, to: sp.to }).filter(([, value]) => value) as [string, string][],
  );

  return (
    <>
      <PageHeader
        title="Pembayaran"
        description={`Penerimaan pelanggan pada ${data.range.label.toLowerCase()}. Setiap baris adalah satu kejadian pembayaran; alokasi tercatat di detail tagihan.`}
        actions={
          <>
            <Link
              href={`/w/${workspaceId}/payments/new`}
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Catat Pembayaran
            </Link>
            <Link
              href={`/api/w/${workspaceId}/export/payments?${exportQuery.toString()}`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Ekspor CSV
            </Link>
          </>
        }
      />

      <FilterBar
        action={`/w/${workspaceId}/payments`}
        fields={fields}
        values={{ period: sp.period, from: sp.from, to: sp.to, q: sp.q }}
        resetHref={`/w/${workspaceId}/payments`}
      />

      <Card>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={columns}
            rows={data.list.rows.map((row) => ({
              id: row.id,
              number: row.number,
              business_date: row.business_date,
              customer_name: row.customer_name ?? "(tanpa pelanggan)",
              account_name: row.account_name,
              method_name: row.method_name,
              amount: row.amount,
              state: row.reversed ? "reversed" : "effective",
            }))}
            emptyTitle="Belum ada pembayaran"
            emptyDescription="Catat pembayaran dari detail tagihan, profil pelanggan, atau tombol di atas."
          />
        </CardBody>
      </Card>

      <Pagination
        basePath={`/w/${workspaceId}/payments`}
        query={queryForLinks}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.list.total}
      />
    </>
  );
}
