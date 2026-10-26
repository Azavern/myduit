import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { PaymentForm } from "@/components/payments/payment-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { formatDateID, todayInTimezone } from "@/lib/dates";
import { formatIDR } from "@/lib/money";
import { loadWorkspace } from "@/server/dal/page";
import { listCashAccounts, listCustomers, listPaymentMethods } from "@/server/services/masters";
import { getInvoiceDetail, listOpenInvoices } from "@/server/services/sales";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catat Pembayaran" };

export default async function NewPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ customerId?: string; invoiceId?: string }>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;

  const { data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const today = todayInTimezone(ctx.workspace.timezone);
    const [accounts, methods, customers] = await Promise.all([
      listCashAccounts(tx, workspaceId, true),
      listPaymentMethods(tx, workspaceId, true),
      listCustomers(tx, workspaceId, { activeOnly: true, limit: 200 }),
    ]);

    let customerId: string | null = sp.customerId ?? null;
    let customerLabel = "—";
    let invoices: { invoiceId: string; number: string; businessDate: string; dueDate: string | null; total: string; balance: string }[] = [];

    if (sp.invoiceId) {
      const invoice = await getInvoiceDetail(tx, workspaceId, sp.invoiceId);
      if (invoice && invoice.status === "final" && BigInt(invoice.balance) > 0n && !invoice.voided) {
        customerId = invoice.customer_id;
        customerLabel = invoice.customer_name ?? "Tanpa pelanggan (tunai anonim)";
        invoices = [
          {
            invoiceId: invoice.id,
            number: invoice.number ?? "—",
            businessDate: invoice.business_date,
            dueDate: invoice.due_date,
            total: invoice.total_amount,
            balance: invoice.balance,
          },
        ];
      }
    } else if (customerId) {
      const open = await listOpenInvoices(tx, workspaceId, { cutoff: "2100-01-01", customerId });
      const customer = customers.rows.find((row) => row.id === customerId);
      customerLabel = customer?.name ?? "—";
      invoices = open.map((invoice) => ({
        invoiceId: invoice.invoice_id,
        number: invoice.number,
        businessDate: invoice.business_date,
        dueDate: invoice.due_date,
        total: invoice.total_amount,
        balance: invoice.balance,
      }));
    }

    return { today, accounts, methods, customers: customers.rows, customerId, customerLabel, invoices };
  });

  const hasContext = Boolean(sp.invoiceId) || Boolean(sp.customerId);

  return (
    <>
      <PageHeader
        title="Catat Pembayaran"
        description="Pembayaran harus dialokasikan eksplisit. Sistem tidak menebak tagihan yang dimaksud dan tidak membuat saldo kredit pelanggan pada P0."
        actions={
          <Link
            href={`/w/${workspaceId}/payments`}
            className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Riwayat pembayaran
          </Link>
        }
      />

      {!hasContext ? (
        <Card>
          <CardHeader>
            <CardTitle>Pilih pelanggan</CardTitle>
          </CardHeader>
          <CardBody>
            <form method="get" action={`/w/${workspaceId}/payments/new`} className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Pelanggan</span>
                <Select name="customerId" required>
                  <option value="">— Pilih pelanggan —</option>
                  {data.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · piutang {formatIDR(customer.receivable)}
                    </option>
                  ))}
                </Select>
              </label>
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Lanjutkan
              </button>
            </form>
            <p className="mt-3 text-xs text-ink-subtle">
              Untuk pembayaran tagihan tunai tanpa pelanggan, buka detail tagihan lalu tekan Catat Pembayaran.
              Pembelian terakhir: {formatDateID(data.today)}.
            </p>
          </CardBody>
        </Card>
      ) : (
        <PaymentForm
          workspaceId={workspaceId}
          customerId={data.customerId}
          customerLabel={data.customerLabel}
          invoices={data.invoices}
          cashAccounts={data.accounts.map((account) => ({ id: account.id, name: account.name }))}
          paymentMethods={data.methods.map((method) => ({ id: method.id, name: method.name }))}
          today={data.today}
          lockedCustomer={Boolean(sp.invoiceId)}
        />
      )}
    </>
  );
}
