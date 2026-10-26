import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { ProductForm } from "@/components/masters/product-form";
import { loadWorkspace } from "@/server/dal/page";
import { getProduct } from "@/server/services/masters";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; productId: string }>;
}) {
  const { workspaceId, productId } = await params;

  const { data } = await loadWorkspace(workspaceId, (tx) => getProduct(tx, workspaceId, productId));
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={data.product.name}
        description="Perubahan konversi satuan tidak mengubah kuantitas atau harga pada transaksi historis."
        actions={
          <Link
            href={`/w/${workspaceId}/products`}
            className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Kembali ke katalog
          </Link>
        }
      />
      <div className="rounded-card border border-border-subtle bg-surface p-5">
        <ProductForm
          workspaceId={workspaceId}
          values={{
            id: data.product.id,
            name: data.product.name,
            sku: data.product.sku ?? "",
            productKind: data.product.product_kind,
            baseUnit: data.product.base_unit,
            basePrice: data.product.base_price,
            description: data.product.description ?? "",
            active: data.product.active,
            units: data.units.map((unit) => ({
              name: unit.name,
              factor: Number(unit.conversion_factor).toString(),
              price: unit.price,
              active: unit.active,
            })),
          }}
        />
      </div>
    </>
  );
}
