"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { useRequestKey } from "@/components/app/request-key";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { injectRequestKey } from "@/lib/idempotency";
import { calcInvoiceTotals, calcLine, type DiscountKind } from "@/lib/invoice";
import { formatIDR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveInvoiceAction } from "@/modules/sales/actions";

export type CustomerOption = { id: string; name: string };
export type CashAccountOption = { id: string; name: string };
export type PaymentMethodOption = { id: string; name: string };
export type ProductOption = {
  id: string;
  name: string;
  baseUnit: string;
  basePrice: string;
  units: { id: string; name: string; price: string; conversionFactor: string }[];
};

type LineState = {
  key: string;
  productId: string;
  unitOptionId: string;
  quantity: string;
  unitPrice: string;
  discountKind: DiscountKind;
  discountAmount: string;
  discountBasisPoints: number;
};

function newLine(defaultProduct?: ProductOption): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    productId: defaultProduct?.id ?? "",
    unitOptionId: "",
    quantity: "1",
    unitPrice: defaultProduct?.basePrice ?? "0",
    discountKind: "none",
    discountAmount: "0",
    discountBasisPoints: 0,
  };
}

export function InvoiceForm({
  workspaceId,
  mode,
  invoiceId,
  customers,
  products,
  cashAccounts,
  paymentMethods,
  defaults,
}: {
  workspaceId: string;
  mode: "new" | "edit";
  invoiceId?: string;
  customers: CustomerOption[];
  products: ProductOption[];
  cashAccounts: CashAccountOption[];
  paymentMethods: PaymentMethodOption[];
  defaults: {
    businessDate: string;
    dueDate: string;
    customerId: string;
    notes: string;
    discountKind: DiscountKind;
    discountBasisPoints: number;
    discountAmount: string;
    additionalFee: string;
    additionalFeeLabel: string;
    overrideReason: string;
    lines: LineState[];
  };
}) {
  const [state, action, pending] = useActionState(saveInvoiceAction, IDLE_STATE);
  const [customerId, setCustomerId] = useState(defaults.customerId);
  const [businessDate, setBusinessDate] = useState(defaults.businessDate);
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [notes, setNotes] = useState(defaults.notes);
  const [discountKind, setDiscountKind] = useState<DiscountKind>(defaults.discountKind);
  const [discountBasisPoints, setDiscountBasisPoints] = useState(defaults.discountBasisPoints);
  const [discountAmount, setDiscountAmount] = useState(defaults.discountAmount);
  const [additionalFee, setAdditionalFee] = useState(defaults.additionalFee);
  const [additionalFeeLabel, setAdditionalFeeLabel] = useState(defaults.additionalFeeLabel);
  const [overrideReason, setOverrideReason] = useState(defaults.overrideReason);
  const [lines, setLines] = useState<LineState[]>(defaults.lines.length > 0 ? defaults.lines : [newLine()]);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositAmount, setDepositAmount] = useState("0");
  const [depositAccountId, setDepositAccountId] = useState(cashAccounts[0]?.id ?? "");
  const [depositMethodId, setDepositMethodId] = useState(paymentMethods[0]?.id ?? "");

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const computed = lines.map((line) => {
    const product = productById.get(line.productId);
    const unit = product?.units.find((option) => option.id === line.unitOptionId);
    const defaultPrice = unit?.price ?? product?.basePrice ?? "0";
    const calc = calcLine({
      quantity: line.quantity || "0",
      unitPrice: line.unitPrice || "0",
      discountKind: line.discountKind,
      discountAmount: line.discountAmount,
      discountBasisPoints: line.discountBasisPoints,
    });
    return { line, product, unit, defaultPrice, calc, overridden: line.unitPrice !== defaultPrice && defaultPrice !== "0" };
  });

  const totals = calcInvoiceTotals(
    computed.map((item) => item.calc),
    {
      discountKind,
      discountAmount,
      discountBasisPoints,
      additionalFee,
    },
  );

  const deposit = BigInt(depositAmount.replace(/\D/g, "") || "0");
  const remaining = totals.total - (deposit > totals.total ? totals.total : deposit);
  const hasOverride = computed.some((item) => item.overridden);
  const isCredit = totals.total - deposit > 0n;

  const payloadJson = useMemo(() => {
    const payload = {
      invoiceId: invoiceId ?? null,
      customerId: customerId || null,
      businessDate,
      dueDate: dueDate || null,
      notes: notes || null,
      discountKind,
      discountBasisPoints,
      discountAmount,
      additionalFee,
      additionalFeeLabel: additionalFeeLabel || null,
      overrideReason: overrideReason || null,
      lines: lines.map((line) => ({
        productId: line.productId,
        unitOptionId: line.unitOptionId || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountKind: line.discountKind,
        discountAmount: line.discountAmount,
        discountBasisPoints: line.discountBasisPoints,
      })),
      deposit:
        depositEnabled && deposit > 0n
          ? {
              amount: depositAmount,
              cashAccountId: depositAccountId,
              paymentMethodId: depositMethodId,
              reference: null,
            }
          : null,
      requestKey: "",
    };
    return JSON.stringify(payload);
  }, [
    invoiceId,
    customerId,
    businessDate,
    dueDate,
    notes,
    discountKind,
    discountBasisPoints,
    discountAmount,
    additionalFee,
    additionalFeeLabel,
    overrideReason,
    lines,
    depositEnabled,
    depositAmount,
    depositAccountId,
    depositMethodId,
    deposit,
  ]);

  // The idempotency key follows the serialised payload: a retried submission
  // replays instead of creating the invoice twice, while an edited payload gets
  // a fresh key (the server rejects a reused key with a different payload).
  const requestKey = useRequestKey(payloadJson);
  const finalPayload = injectRequestKey(payloadJson, requestKey);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="payload" value={finalPayload} />

      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-danger-surface px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Bagian A — Informasi dokumen</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Pelanggan"
            htmlFor="customerId"
            hint="Wajib untuk penjualan kredit. Boleh kosong hanya untuk tunai lunas."
          >
            <Select id="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">— Tanpa pelanggan (tunai lunas) —</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal transaksi" htmlFor="businessDate">
            <Input
              id="businessDate"
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
            />
          </Field>
          <Field label="Jatuh tempo" htmlFor="dueDate" hint="Wajib bila masih ada sisa kredit.">
            <Input id="dueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field label="Catatan internal" htmlFor="notes">
            <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bagian B — Item</CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((current) => [...current, newLine(products[0])])}
          >
            Tambah baris
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {products.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-warning-surface px-3 py-2 text-sm text-warning">
              Belum ada produk aktif. Tambahkan produk terlebih dahulu di menu Produk/Jasa.
            </p>
          ) : null}
          {computed.map((item, index) => (
            <div key={item.line.key} className="rounded-lg border border-border-subtle p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Baris {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((current) => (current.length > 1 ? current.filter((l) => l.key !== item.line.key) : current))}
                  aria-label={`Hapus baris ${index + 1}`}
                >
                  Hapus
                </Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <Field label="Produk/Jasa" htmlFor={`product-${item.line.key}`}>
                    <Select
                      id={`product-${item.line.key}`}
                      value={item.line.productId}
                      onChange={(event) => {
                        const product = productById.get(event.target.value);
                        updateLine(item.line.key, {
                          productId: event.target.value,
                          unitOptionId: "",
                          unitPrice: product?.basePrice ?? "0",
                        });
                      }}
                    >
                      <option value="">— Pilih produk —</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="lg:col-span-2">
                  <Field label="Satuan" htmlFor={`unit-${item.line.key}`}>
                    <Select
                      id={`unit-${item.line.key}`}
                      value={item.line.unitOptionId}
                      onChange={(event) => {
                        const unit = item.product?.units.find((option) => option.id === event.target.value);
                        updateLine(item.line.key, {
                          unitOptionId: event.target.value,
                          unitPrice: unit?.price ?? item.product?.basePrice ?? "0",
                        });
                      }}
                    >
                      <option value="">{item.product?.baseUnit ?? "satuan dasar"}</option>
                      {item.product?.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} (×{Number(unit.conversionFactor)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="lg:col-span-2">
                  <Field label="Kuantitas" htmlFor={`qty-${item.line.key}`}>
                    <Input
                      id={`qty-${item.line.key}`}
                      inputMode="decimal"
                      value={item.line.quantity}
                      onChange={(event) => updateLine(item.line.key, { quantity: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="lg:col-span-2">
                  <Field label="Harga satuan" htmlFor={`price-${item.line.key}`}>
                    <Input
                      id={`price-${item.line.key}`}
                      inputMode="numeric"
                      value={item.line.unitPrice}
                      onChange={(event) => updateLine(item.line.key, { unitPrice: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="lg:col-span-2">
                  <Field label="Diskon baris" htmlFor={`disc-${item.line.key}`}>
                    <Input
                      id={`disc-${item.line.key}`}
                      inputMode="numeric"
                      value={item.line.discountKind === "percent" ? String(item.line.discountBasisPoints / 100) : item.line.discountAmount}
                      disabled={item.line.discountKind === "none"}
                      onChange={(event) => {
                        const raw = event.target.value.replace(/[^\d.]/g, "");
                        if (item.line.discountKind === "percent") {
                          updateLine(item.line.key, { discountBasisPoints: Math.round(Number(raw || "0") * 100) });
                        } else {
                          updateLine(item.line.key, { discountAmount: raw });
                        }
                      }}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <label className="text-ink-muted" htmlFor={`dkind-${item.line.key}`}>
                    Jenis diskon
                  </label>
                  <Select
                    id={`dkind-${item.line.key}`}
                    className="h-8 w-32 text-xs"
                    value={item.line.discountKind}
                    onChange={(event) => updateLine(item.line.key, { discountKind: event.target.value as DiscountKind })}
                  >
                    <option value="none">Tanpa</option>
                    <option value="amount">Nominal</option>
                    <option value="percent">Persen</option>
                  </Select>
                </div>
                <p className="tabular text-ink-muted">
                  Subtotal baris: <span className="font-medium text-ink">{formatIDR(item.calc.subtotal)}</span>
                  {item.overridden ? <span className="ml-2 text-warning">harga diubah dari master</span> : null}
                </p>
              </div>
            </div>
          ))}

          {hasOverride ? (
            <Field
              label="Alasan perubahan harga"
              htmlFor="overrideReason"
              hint="Wajib diisi karena ada harga yang berbeda dari master. Tercatat di audit."
            >
              <Input
                id="overrideReason"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                maxLength={500}
              />
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bagian C — Ringkasan</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Diskon invoice" htmlFor="invoiceDiscountKind">
                <Select
                  id="invoiceDiscountKind"
                  value={discountKind}
                  onChange={(event) => setDiscountKind(event.target.value as DiscountKind)}
                >
                  <option value="none">Tanpa diskon</option>
                  <option value="amount">Nominal</option>
                  <option value="percent">Persen</option>
                </Select>
              </Field>
              <Field label="Nilai diskon" htmlFor="invoiceDiscountValue">
                <Input
                  id="invoiceDiscountValue"
                  inputMode="numeric"
                  disabled={discountKind === "none"}
                  value={discountKind === "percent" ? String(discountBasisPoints / 100) : discountAmount}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[^\d.]/g, "");
                    if (discountKind === "percent") setDiscountBasisPoints(Math.round(Number(raw || "0") * 100));
                    else setDiscountAmount(raw);
                  }}
                />
              </Field>
              <Field label="Biaya tambahan" htmlFor="additionalFee">
                <Input
                  id="additionalFee"
                  inputMode="numeric"
                  value={additionalFee}
                  onChange={(event) => setAdditionalFee(event.target.value)}
                />
              </Field>
              <Field label="Label biaya" htmlFor="additionalFeeLabel">
                <Input
                  id="additionalFeeLabel"
                  value={additionalFeeLabel}
                  onChange={(event) => setAdditionalFeeLabel(event.target.value)}
                  maxLength={120}
                  placeholder="Mis. ongkos kirim"
                />
              </Field>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={depositEnabled}
                  onChange={(event) => setDepositEnabled(event.target.checked)}
                />
                Ada uang muka / pembayaran saat ini
              </label>
              {depositEnabled ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Nominal" htmlFor="depositAmount">
                    <Input
                      id="depositAmount"
                      inputMode="numeric"
                      value={depositAmount}
                      onChange={(event) => setDepositAmount(event.target.value)}
                    />
                  </Field>
                  <Field label="Akun penerima" htmlFor="depositAccount">
                    <Select
                      id="depositAccount"
                      value={depositAccountId}
                      onChange={(event) => setDepositAccountId(event.target.value)}
                    >
                      {cashAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Metode" htmlFor="depositMethod">
                    <Select
                      id="depositMethod"
                      value={depositMethodId}
                      onChange={(event) => setDepositMethodId(event.target.value)}
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-ink-subtle">
                Uang muka dicatat sebagai pembayaran sungguhan dan dialokasikan ke tagihan ini, bukan dikurangi diam-diam.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-canvas p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular">{formatIDR(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Diskon invoice</dt>
                <dd className="tabular">-{formatIDR(totals.discountAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Biaya tambahan</dt>
                <dd className="tabular">{formatIDR(totals.additionalFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-2 text-base font-semibold">
                <dt>Total tagihan</dt>
                <dd className="tabular">{formatIDR(totals.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Uang muka</dt>
                <dd className="tabular">{formatIDR(deposit)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>Sisa tagihan</dt>
                <dd className={cn("tabular", remaining > 0n && "text-warning")}>{formatIDR(remaining)}</dd>
              </div>
            </dl>
            {isCredit && (!customerId || !dueDate) ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-warning-surface px-3 py-2 text-xs text-warning">
                Masih ada sisa tagihan: pelanggan dan jatuh tempo wajib diisi sebelum finalisasi.
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="mode" value="final" variant="primary" loading={pending}>
          Simpan &amp; Finalisasi
        </Button>
        <Button type="submit" name="mode" value="draft" variant="secondary" loading={pending}>
          Simpan Draft
        </Button>
        <Button type="button" variant="ghost" onClick={() => window.history.back()}>
          Batal
        </Button>
        {mode === "edit" && invoiceId ? (
          <Link href={`/w/${workspaceId}/sales/${invoiceId}`} className="text-sm text-brand-700 hover:underline">
            Lihat detail tagihan
          </Link>
        ) : null}
      </div>
      <p className="text-xs text-ink-subtle">
        Pratinjau di halaman ini hanya perkiraan. Server menghitung ulang seluruh nilai sebelum menyimpan.
      </p>
    </form>
  );
}
