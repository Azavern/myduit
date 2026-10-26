import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { ReversePaymentForm, VoidInvoiceForm } from "@/components/sales/invoice-actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { formatDateID, todayInTimezone } from "@/lib/dates";
import { paymentStatusLabel } from "@/lib/invoice";
import { formatIDR, formatQuantity } from "@/lib/money";
import { can } from "@/lib/permissions";
import { loadWorkspace } from "@/server/dal/page";
import { getInvoiceDetail } from "@/server/services/sales";

export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, BadgeTone> = {
  draft: "neutral",
  unpaid: "warning",
  partial: "info",
  paid: "positive",
  void: "danger",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}) {
  const { workspaceId, invoiceId } = await params;

  const { context, data } = await loadWorkspace(workspaceId, async (tx, ctx) => {
    const invoice = await getInvoiceDetail(tx, workspaceId, invoiceId);
    return { invoice, today: todayInTimezone(ctx.workspace.timezone) };
  });

  if (!data.invoice) notFound();
  const invoice = data.invoice;
  const canReverse = can(context.role, "reverse");
  const canEdit = can(context.role, "sales");

  return (
    <>
      <PageHeader
        title={invoice.number ?? "Draft tagihan"}
        description={`${invoice.customer_name ?? "Tanpa pelanggan"} · ${formatDateID(invoice.business_date)}`}
        actions={
          <>
            <Badge tone={STATUS_TONES[invoice.payment_state] ?? "neutral"}>
              {paymentStatusLabel(invoice.payment_state)}
            </Badge>
            {invoice.status === "draft" && canEdit ? (
              <Link
                href={`/w/${workspaceId}/sales/${invoice.id}/edit`}
                className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
              >
                Edit draft
              </Link>
            ) : null}
            {can(context.role, "payments") && invoice.status === "final" && !invoice.voided && BigInt(invoice.balance) > 0n ? (
              <Link
                href={`/w/${workspaceId}/payments/new?invoiceId=${invoice.id}`}
                className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Catat Pembayaran
              </Link>
            ) : null}
            <Link
              href={`/w/${workspaceId}/sales`}
              className="inline-flex h-10 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
            >
              Kembali
            </Link>
          </>
        }
      />

      {invoice.voided ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-danger-surface px-4 py-3 text-sm text-danger">
          Tagihan ini dibatalkan pada {formatDateID(invoice.void_business_date)}. Alasan: {invoice.void_reason}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rincian item</CardTitle>
          </CardHeader>
          <CardBody className="px-0 py-0">
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Produk</Th>
                    <Th>Satuan</Th>
                    <Th className="text-right">Kuantitas</Th>
                    <Th className="text-right">Harga</Th>
                    <Th className="text-right">Diskon</Th>
                    <Th className="text-right">Subtotal</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <Tr key={line.id}>
                      <Td>{line.product_name}</Td>
                      <Td className="text-ink-muted">
                        {line.unit_name}
                        {line.conversion_factor !== "1.000000" && line.conversion_factor !== "1" ? (
                          <span className="ml-1 text-xs">(×{formatQuantity(line.conversion_factor)})</span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-right">{formatQuantity(line.quantity)}</Td>
                      <Td className="tabular text-right">{formatIDR(line.unit_price)}</Td>
                      <Td className="tabular text-right">{formatIDR(line.discount_amount)}</Td>
                      <Td className="tabular text-right">{formatIDR(line.subtotal)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatIDR(invoice.subtotal)} />
              <Row label="Diskon" value={`-${formatIDR(invoice.discount_amount)}`} />
              <Row label={`Biaya tambahan${invoice.additional_fee_label ? ` (${invoice.additional_fee_label})` : ""}`} value={formatIDR(invoice.additional_fee)} />
              <div className="flex justify-between border-t border-border-subtle pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatIDR(invoice.total_amount)}</dd>
              </div>
              <Row label="Sudah dibayar" value={formatIDR(invoice.paid_amount)} />
              <Row label="Sisa tagihan" value={formatIDR(invoice.balance)} emphasis />
              <Row label="Jatuh tempo" value={formatDateID(invoice.due_date)} />
              {invoice.override_reason ? <Row label="Alasan ubah harga" value={invoice.override_reason} /> : null}
              {invoice.notes ? <Row label="Catatan" value={invoice.notes} /> : null}
              <Row label="Dibuat oleh" value={invoice.creator} />
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Riwayat pembayaran &amp; alokasi</CardTitle>
        </CardHeader>
        <CardBody className="px-0 py-0">
          {invoice.allocations.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted">Belum ada pembayaran untuk tagihan ini.</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Nomor pembayaran</Th>
                    <Th>Tanggal</Th>
                    <Th className="text-right">Nominal alokasi</Th>
                    <Th>Status</Th>
                    {canReverse ? <Th>Aksi</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {invoice.allocations.map((allocation) => (
                    <Tr key={`${allocation.payment_id}-${allocation.payment_number}`}>
                      <Td>{allocation.payment_number}</Td>
                      <Td>{formatDateID(allocation.business_date)}</Td>
                      <Td className="tabular text-right">{formatIDR(allocation.amount)}</Td>
                      <Td>
                        <Badge tone={allocation.reversed ? "danger" : "positive"}>
                          {allocation.reversed ? "Dibalikkan" : "Efektif"}
                        </Badge>
                      </Td>
                      {canReverse ? (
                        <Td>
                          {allocation.reversed ? (
                            <span className="text-xs text-ink-subtle">—</span>
                          ) : (
                            <ReversePaymentForm
                              workspaceId={workspaceId}
                              paymentId={allocation.payment_id}
                              invoiceId={invoice.id}
                              today={data.today}
                            />
                          )}
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      {canReverse && invoice.status === "final" && !invoice.voided ? (
        <div className="mt-4">
          <VoidInvoiceForm
            workspaceId={workspaceId}
            invoiceId={invoice.id}
            today={data.today}
            disabled={BigInt(invoice.paid_amount) > 0n}
          />
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={emphasis ? "tabular text-right font-medium text-warning" : "tabular text-right"}>{value}</dd>
    </div>
  );
}
