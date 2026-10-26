import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { InvoiceForm, type ProductOption } from "@/components/sales/invoice-form";
import { todayInTimezone } from "@/lib/dates";
import { loadWorkspace } from "@/server/dal/page";
import { listCashAccounts, listCustomers, listPaymentMethods, listProducts } from "@/server/services/masters";
import { getInvoiceDetail } from "@/server/services/sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Draft Tagihan" };

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}) {
  const { workspaceId, invoiceId } = await params;

  const { data } = await loadWorkspace(workspaceId, async (tx, context) => {
    const invoice = await getInvoiceDetail(tx, workspaceId, invoiceId);
    const today = todayInTimezone(context.workspace.timezone);
    if (!invoice) return { invoice: null, today, customers: [], products: { rows: [], units: [], total: 0 }, accounts: [], methods: [] };
    const [customers, products, accounts, methods] = await Promise.all([
      listCustomers(tx, workspaceId, { activeOnly: true, limit: 200 }),
      listProducts(tx, workspaceId, { activeOnly: true, limit: 200 }),
      listCashAccounts(tx, workspaceId, true),
      listPaymentMethods(tx, workspaceId, true),
    ]);
    return { invoice, today, customers: customers.rows, products, accounts, methods };
  });

  if (!data.invoice) notFound();
  const invoice = data.invoice;
  if (invoice.status === "final") redirect(`/w/${workspaceId}/sales/${invoiceId}`);

  const productOptions: ProductOption[] = data.products.rows.map((product) => ({
    id: product.id,
    name: product.name,
    baseUnit: product.base_unit,
    basePrice: product.base_price,
    units: data.products.units
      .filter((unit) => unit.product_id === product.id && unit.active)
      .map((unit) => ({ id: unit.id, name: unit.name, price: unit.price, conversionFactor: unit.conversion_factor })),
  }));

  return (
    <>
      <PageHeader
        title="Edit draft tagihan"
        description="Draft dapat diubah bebas. Setelah finalisasi, dokumen tidak dapat diedit lagi."
      />
      <InvoiceForm
        workspaceId={workspaceId}
        mode="edit"
        invoiceId={invoice.id}
        customers={data.customers.map((customer) => ({ id: customer.id, name: customer.name }))}
        products={productOptions}
        cashAccounts={data.accounts.map((account) => ({ id: account.id, name: account.name }))}
        paymentMethods={data.methods.map((method) => ({ id: method.id, name: method.name }))}
        defaults={{
          businessDate: invoice.business_date,
          dueDate: invoice.due_date ?? "",
          customerId: invoice.customer_id ?? "",
          notes: invoice.notes ?? "",
          discountKind: invoice.discount_kind,
          discountBasisPoints: invoice.discount_basis_points,
          discountAmount: invoice.discount_amount,
          additionalFee: invoice.additional_fee,
          additionalFeeLabel: invoice.additional_fee_label ?? "",
          overrideReason: invoice.override_reason ?? "",
          lines: invoice.lines.map((line) => ({
            key: line.id,
            productId: line.product_id,
            unitOptionId: line.unit_option_id ?? "",
            quantity: line.quantity,
            unitPrice: line.unit_price,
            discountKind: "none" as const,
            discountAmount: line.discount_amount,
            discountBasisPoints: 0,
          })),
        }}
      />
    </>
  );
}
