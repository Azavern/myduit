import Link from "next/link";
import { notFound } from "next/navigation";

import { DataTable } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { CustomerForm } from "@/components/masters/customer-form";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateID, todayInTimezone } from "@/lib/dates";
import { paymentStatusLabel, type PaymentStatus } from "@/lib/invoice";
import { formatIDR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { loadWorkspace } from "@/server/dal/page";
import { getCustomer } from "@/server/services/masters";
import { listPayments } from "@/server/services/payments";
import { listInvoices } from "@/server/services/sales";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; customerId: string }>;
}) {
  const { workspaceId, customerId } = await params;

  const { context, data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const customer = await getCustomer(tx, workspaceId, customerId);
    if (!customer) return { customer: null, invoices: null, payments: null, today: todayInTimezone(ctx.workspace.timezone) };
    const [invoices, payments] = await Promise.all([
      listInvoices(tx, workspaceId, { customerId, limit: 50 }),
      listPayments(tx, workspaceId, { customerId, limit: 50 }),
    ]);
    return { customer, invoices, payments, today: todayInTimezone(ctx.workspace.timezone) };
  });

  if (!data.customer || !data.invoices || !data.payments) notFound();
  const customer = data.customer;

  const openInvoices = data.invoices.rows.filter((row) => row.status === "final" && !row.voided && BigInt(row.balance) > 0n);
  const totalReceivable = openInvoices.reduce((sum, row) => sum + BigInt(row.balance), 0n);
  const canPay = can(context.role, "payments");

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${customer.phone ?? "Tanpa telepon"} · ${customer.email ?? "Tanpa email"} · ${customer.active ? "Aktif" : "Nonaktif"}`}
        actions={
          <>
            {canPay ? (
              <Link
                href={`/w/${workspaceId}/payments/new?customerId=${customer.id}`}
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Catat Pembayaran
              </Link>
            ) : null}
            <Link
              href={`/w/${workspaceId}/sales/new`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Buat Penjualan Baru
            </Link>
            <Link
              href={`/w/${workspaceId}/customers`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Kembali
            </Link>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-border-subtle bg-surface px-5 py-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Total piutang</p>
          <p className="tabular mt-2 text-xl font-semibold text-ink">{formatIDR(totalReceivable)}</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface px-5 py-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Tagihan terbuka</p>
          <p className="tabular mt-2 text-xl font-semibold text-ink">{openInvoices.length}</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface px-5 py-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Transaksi terakhir</p>
          <p className="mt-2 text-xl font-semibold text-ink">{formatDateID(data.invoices.rows[0]?.business_date ?? null)}</p>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Semua tagihan</CardTitle>
          <span className="text-xs text-ink-subtle">Setiap tagihan tetap menjadi baris tersendiri</span>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={[
              { key: "number", header: "Nomor" },
              { key: "business_date", header: "Tanggal", kind: "date" },
              { key: "due_date", header: "Jatuh tempo", kind: "date" },
              { key: "total_amount", header: "Total", kind: "money", align: "right" },
              { key: "balance", header: "Sisa", kind: "money", align: "right" },
              { key: "state", header: "Status", kind: "badge", badges: statusBadges() },
            ]}
            rows={data.invoices.rows.map((row) => ({
              id: row.id,
              number: row.number ?? "Draft",
              business_date: row.business_date,
              due_date: row.due_date,
              total_amount: row.total_amount,
              balance: row.balance,
              state: stateFor(row.status, BigInt(row.total_amount), BigInt(row.balance), row.voided),
            }))}
            rowHref={{ prefix: `/w/${workspaceId}/sales/`, key: "id" }}
            emptyTitle="Belum ada tagihan"
            emptyDescription="Pelanggan ini belum memiliki dokumen penjualan."
          />
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Riwayat pembayaran</CardTitle>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <DataTable
            columns={[
              { key: "number", header: "Nomor" },
              { key: "business_date", header: "Tanggal", kind: "date" },
              { key: "account_name", header: "Akun" },
              { key: "amount", header: "Nominal", kind: "money", align: "right" },
              { key: "state", header: "Status", kind: "badge", badges: { effective: { label: "Efektif", tone: "positive" }, reversed: { label: "Dibalikkan", tone: "danger" } } },
            ]}
            rows={data.payments.rows.map((row) => ({
              id: row.id,
              number: row.number,
              business_date: row.business_date,
              account_name: row.account_name,
              amount: row.amount,
              state: row.reversed ? "reversed" : "effective",
            }))}
            emptyTitle="Belum ada pembayaran"
            emptyDescription="Pembayaran pelanggan ini akan tampil di sini."
          />
        </CardBody>
      </Card>

      <details className="rounded-card border border-border-subtle bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Ubah data pelanggan</summary>
        <div className="mt-4">
          <CustomerForm
            workspaceId={workspaceId}
            values={{
              id: customer.id,
              name: customer.name,
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              address: customer.address ?? "",
              notes: customer.notes ?? "",
              active: customer.active,
            }}
          />
        </div>
      </details>
    </>
  );
}

function stateFor(status: "draft" | "final", total: bigint, balance: bigint, voided: boolean): PaymentStatus {
  if (voided) return "void";
  if (status === "draft") return "draft";
  const paid = total - balance;
  if (paid <= 0n) return "unpaid";
  if (paid < total) return "partial";
  return "paid";
}

function statusBadges(): Record<string, { label: string; tone: "neutral" | "info" | "positive" | "warning" | "danger" }> {
  return {
    draft: { label: paymentStatusLabel("draft"), tone: "neutral" },
    unpaid: { label: paymentStatusLabel("unpaid"), tone: "warning" },
    partial: { label: paymentStatusLabel("partial"), tone: "info" },
    paid: { label: paymentStatusLabel("paid"), tone: "positive" },
    void: { label: paymentStatusLabel("void"), tone: "danger" },
  };
}
