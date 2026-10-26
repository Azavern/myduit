import { InvoiceForm, type ProductOption } from "@/components/sales/invoice-form";
import { PageHeader } from "@/components/app/page-header";
import { todayInTimezone } from "@/lib/dates";
import { loadWorkspace } from "@/server/dal/page";
import { listCashAccounts, listCustomers, listPaymentMethods, listProducts } from "@/server/services/masters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buat Penjualan" };

export default async function NewSalePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;

  const { data } = await loadWorkspace(workspaceId, async (tx, context) => {
    const today = todayInTimezone(context.workspace.timezone);
    const [customers, products, accounts, methods] = await Promise.all([
      listCustomers(tx, workspaceId, { activeOnly: true, limit: 200 }),
      listProducts(tx, workspaceId, { activeOnly: true, limit: 200 }),
      listCashAccounts(tx, workspaceId, true),
      listPaymentMethods(tx, workspaceId, true),
    ]);
    return { today, customers: customers.rows, products, accounts, methods };
  });

  const productOptions: ProductOption[] = data.products.rows.map((product) => ({
    id: product.id,
    name: product.name,
    baseUnit: product.base_unit,
    basePrice: product.base_price,
    units: data.products.units
      .filter((unit) => unit.product_id === product.id && unit.active)
      .map((unit) => ({ id: unit.id, name: unit.name, price: unit.price, conversionFactor: unit.conversion_factor })),
  }));

  const missing = data.accounts.length === 0 || data.methods.length === 0;

  return (
    <>
      <PageHeader
        title="Buat Penjualan"
        description="Isi item, lalu simpan sebagai draft atau finalisasi. Finalisasi membuat nomor dokumen dan (jika ada) uang muka dalam satu transaksi."
      />
      {missing ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-warning-surface px-4 py-3 text-sm text-warning">
          Sebelum mencatat uang muka, pastikan sudah ada akun kas dan metode pembayaran aktif di menu Kategori &amp;
          Metode serta Akun Kas.
        </p>
      ) : null}
      <InvoiceForm
        workspaceId={workspaceId}
        mode="new"
        customers={data.customers.map((customer) => ({ id: customer.id, name: customer.name }))}
        products={productOptions}
        cashAccounts={data.accounts.map((account) => ({ id: account.id, name: account.name }))}
        paymentMethods={data.methods.map((method) => ({ id: method.id, name: method.name }))}
        defaults={{
          businessDate: data.today,
          dueDate: "",
          customerId: "",
          notes: "",
          discountKind: "none",
          discountBasisPoints: 0,
          discountAmount: "0",
          additionalFee: "0",
          additionalFeeLabel: "",
          overrideReason: "",
          lines: [],
        }}
      />
    </>
  );
}
