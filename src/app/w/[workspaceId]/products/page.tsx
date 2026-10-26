import { DataTable, type ColumnSpec } from "@/components/app/data-table";
import { FilterBar, Pagination, type FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { ProductForm } from "@/components/masters/product-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIDR } from "@/lib/money";
import { clampInt } from "@/lib/utils";
import { loadWorkspace } from "@/server/dal/page";
import { listProducts } from "@/server/services/masters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produk/Jasa" };

const PAGE_SIZE = 50;

export default async function ProductsPage({
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
    listProducts(tx, workspaceId, {
      search: sp.q ?? null,
      activeOnly: sp.active === "1",
      productKind: sp.kind === "goods" || sp.kind === "service" ? sp.kind : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  );

  const unitsByProduct = new Map<string, string[]>();
  for (const unit of data.units) {
    const list = unitsByProduct.get(unit.product_id) ?? [];
    if (unit.active) list.push(`${unit.name} ×${Number(unit.conversion_factor)} @${formatIDR(unit.price)}`);
    unitsByProduct.set(unit.product_id, list);
  }

  const columns: ColumnSpec[] = [
    { key: "name", header: "Nama" },
    { key: "sku", header: "SKU" },
    { key: "kind", header: "Tipe", kind: "badge", badges: { goods: { label: "Barang", tone: "brand" }, service: { label: "Jasa", tone: "info" } } },
    { key: "base_unit", header: "Satuan dasar" },
    { key: "base_price", header: "Harga dasar", kind: "money", align: "right" },
    { key: "units", header: "Satuan tambahan", muted: true },
    { key: "state", header: "Status", kind: "badge", badges: { active: { label: "Aktif", tone: "positive" }, inactive: { label: "Nonaktif", tone: "neutral" } } },
  ];

  const fields: FilterField[] = [
    { type: "search", name: "q", label: "Cari nama/SKU", placeholder: "Nama produk" },
    {
      type: "select",
      name: "kind",
      label: "Tipe",
      options: [
        { value: "", label: "Semua" },
        { value: "goods", label: "Barang" },
        { value: "service", label: "Jasa" },
      ],
    },
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
        title="Produk/Jasa"
        description="Harga dan satuan disimpan sebagai snapshot pada setiap baris transaksi, sehingga perubahan master tidak mengubah histori."
      />

      <FilterBar
        action={`/w/${workspaceId}/products`}
        fields={fields}
        values={{ q: sp.q, kind: sp.kind, active: sp.active }}
        resetHref={`/w/${workspaceId}/products`}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Katalog</CardTitle>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={columns}
            rows={data.rows.map((row) => ({
              id: row.id,
              name: row.name,
              sku: row.sku,
              kind: row.product_kind,
              base_unit: row.base_unit,
              base_price: row.base_price,
              units: (unitsByProduct.get(row.id) ?? []).join(", "),
              state: row.active ? "active" : "inactive",
            }))}
            rowHref={{ prefix: `/w/${workspaceId}/products/`, key: "id" }}
            emptyTitle="Belum ada produk"
            emptyDescription="Tambahkan produk atau jasa agar dapat digunakan pada penjualan."
          />
        </CardBody>
      </Card>

      <Pagination
        basePath={`/w/${workspaceId}/products`}
        query={{ q: sp.q, kind: sp.kind, active: sp.active }}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.total}
      />

      <details className="mt-4 rounded-card border border-border-subtle bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Tambah produk/jasa baru</summary>
        <div className="mt-4">
          <ProductForm
            workspaceId={workspaceId}
            values={{
              name: "",
              sku: "",
              productKind: "goods",
              baseUnit: "",
              basePrice: "0",
              description: "",
              active: true,
              units: [],
            }}
          />
        </div>
      </details>

      <p className="mt-3 text-xs text-ink-subtle">
        Catatan P0: fitur eceran/paket hanya menghitung harga. Penghitungan stok belum tersedia pada prototipe ini.
      </p>
    </>
  );
}
