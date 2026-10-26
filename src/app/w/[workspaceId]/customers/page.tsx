import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, Pagination, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { CustomerForm } from "@/components/masters/customer-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIDR } from "@/lib/money";
import { clampInt } from "@/lib/utils";
import { loadWorkspace } from "@/server/dal/page";
import { listCustomers } from "@/server/services/masters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pelanggan" };

const PAGE_SIZE = 25;

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 10_000, 1);

  const { data } = await loadWorkspace(workspaceId, (tx) =>
    listCustomers(tx, workspaceId, {
      search: sp.q ?? null,
      activeOnly: sp.active === "1",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  );

  const columns: ColumnSpec[] = [
    { key: "name", header: "Nama" },
    { key: "phone", header: "Telepon" },
    { key: "open_invoices", header: "Tagihan terbuka", kind: "numeric", align: "right" },
    { key: "receivable", header: "Total piutang", kind: "money", align: "right" },
    { key: "last_transaction", header: "Transaksi terakhir", kind: "date" },
    { key: "state", header: "Status", kind: "badge", badges: { active: { label: "Aktif", tone: "positive" }, inactive: { label: "Nonaktif", tone: "neutral" } } },
  ];

  const fields: FilterField[] = [
    { type: "search", name: "q", label: "Cari nama/telepon", placeholder: "Nama pelanggan" },
    {
      type: "select",
      name: "active",
      label: "Status",
      options: [
        { value: "", label: "Semua" },
        { value: "1", label: "Aktif saja" },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Pelanggan"
        description="Saldo piutang adalah hasil penjumlahan tagihan yang belum lunas, bukan nilai yang diedit manual."
      />

      <FilterBar
        action={`/w/${workspaceId}/customers`}
        fields={fields}
        values={{ q: sp.q, active: sp.active }}
        resetHref={`/w/${workspaceId}/customers`}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Daftar pelanggan</CardTitle>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={columns}
            rows={data.rows.map((row) => ({
              id: row.id,
              name: row.name,
              phone: row.phone,
              open_invoices: row.open_invoices,
              receivable: row.receivable,
              last_transaction: row.last_transaction,
              state: row.active ? "active" : "inactive",
            }))}
            rowHref={{ prefix: `/w/${workspaceId}/customers/`, key: "id" }}
            emptyTitle="Belum ada pelanggan"
            emptyDescription="Tambahkan pelanggan untuk mencatat penjualan kredit dengan tempo atau cicilan."
          />
        </CardBody>
      </Card>

      <Pagination
        basePath={`/w/${workspaceId}/customers`}
        query={{ q: sp.q, active: sp.active }}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.total}
      />

      <details className="mt-4 rounded-card border border-border-subtle bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Tambah pelanggan baru</summary>
        <div className="mt-4">
          <CustomerForm
            workspaceId={workspaceId}
            values={{ name: "", phone: "", email: "", address: "", notes: "", active: true }}
          />
        </div>
      </details>

      <p className="mt-3 text-xs text-ink-subtle">
        Total piutang pada daftar di atas: {formatIDR(data.rows.reduce((sum, row) => sum + BigInt(row.receivable), 0n))} dari
        halaman ini.
      </p>
    </>
  );
}
