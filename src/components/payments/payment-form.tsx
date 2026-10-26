"use client";

import { useActionState, useMemo, useState } from "react";

import { useRequestKey } from "@/components/app/request-key";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { IDLE_STATE } from "@/lib/action-state";
import { formatDateID } from "@/lib/dates";
import { injectRequestKey } from "@/lib/idempotency";
import { formatIDR } from "@/lib/money";
import { recordPaymentAction } from "@/modules/payments/actions";

export type OpenInvoiceOption = {
  invoiceId: string;
  number: string;
  businessDate: string;
  dueDate: string | null;
  total: string;
  balance: string;
};

export function PaymentForm({
  workspaceId,
  customerId,
  customerLabel,
  invoices,
  cashAccounts,
  paymentMethods,
  today,
  lockedCustomer,
}: {
  workspaceId: string;
  customerId: string | null;
  customerLabel: string;
  invoices: OpenInvoiceOption[];
  cashAccounts: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  today: string;
  lockedCustomer: boolean;
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, IDLE_STATE);
  const [businessDate, setBusinessDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(cashAccounts[0]?.id ?? "");
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>(() =>
    Object.fromEntries(invoices.map((invoice) => [invoice.invoiceId, invoices.length === 1 ? invoice.balance : ""])),
  );
  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum + BigInt(value.replace(/\D/g, "") || "0"), 0n),
    [allocations],
  );
  const paymentAmount = BigInt(amount.replace(/\D/g, "") || "0");
  const balanced = totalAllocated === paymentAmount && paymentAmount > 0n;

  const payloadJson = useMemo(
    () =>
      JSON.stringify({
        customerId,
        businessDate,
        amount: amount || "0",
        cashAccountId: accountId,
        paymentMethodId: methodId,
        reference: reference || null,
        notes: notes || null,
        allocations: invoices
          .map((invoice) => ({ invoiceId: invoice.invoiceId, amount: allocations[invoice.invoiceId] ?? "" }))
          .filter((allocation) => (allocation.amount ?? "").replace(/\D/g, "") !== ""),
        requestKey: "",
      }),
    [customerId, businessDate, amount, accountId, methodId, reference, notes, invoices, allocations],
  );

  // The key follows the serialised payload: retries replay, edits resubmit.
  const requestKey = useRequestKey(payloadJson);
  const finalPayload = injectRequestKey(payloadJson, requestKey);

  function fillRemaining(invoice: OpenInvoiceOption) {
    setAllocations({ [invoice.invoiceId]: invoice.balance });
    setAmount(invoice.balance);
  }

  function autoDistribute() {
    const ordered = [...invoices].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    let remaining = paymentAmount;
    const next: Record<string, string> = {};
    for (const invoice of ordered) {
      if (remaining <= 0n) break;
      const balance = BigInt(invoice.balance);
      const take = balance < remaining ? balance : remaining;
      next[invoice.invoiceId] = take.toString();
      remaining -= take;
    }
    setAllocations(next);
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">
            Tidak ada tagihan terbuka untuk pelanggan ini. Pembayaran hanya dapat dialokasikan ke tagihan final yang
            belum lunas.
          </p>
        </CardBody>
      </Card>
    );
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
      {state.status === "success" && state.message ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-success-surface px-4 py-3 text-sm text-success">
          {state.message}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Data pembayaran</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Pelanggan" htmlFor="customerLabel" hint={lockedCustomer ? "Dibuka dari konteks pelanggan/tagihan." : undefined}>
            <Input id="customerLabel" value={customerLabel} readOnly />
          </Field>
          <Field label="Tanggal diterima" htmlFor="payDate">
            <Input id="payDate" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
          </Field>
          <Field label="Nominal pembayaran" htmlFor="payAmount">
            <Input
              id="payAmount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Akun kas tujuan" htmlFor="payAccount">
            <Select id="payAccount" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Metode pembayaran" htmlFor="payMethod">
            <Select id="payMethod" value={methodId} onChange={(event) => setMethodId(event.target.value)}>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referensi/bukti (opsional)" htmlFor="payReference">
            <Input id="payReference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
          </Field>
          <Field label="Catatan (opsional)" htmlFor="payNotes" className="sm:col-span-2">
            <Textarea id="payNotes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alokasi ke tagihan</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={autoDistribute} disabled={paymentAmount <= 0n}>
              Bagi otomatis
            </Button>
          </div>
        </CardHeader>
        <CardBody className="px-0 py-0">
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Nomor</Th>
                  <Th>Tanggal</Th>
                  <Th>Jatuh tempo</Th>
                  <Th className="text-right">Sisa sebelum</Th>
                  <Th className="text-right">Dialokasikan</Th>
                  <Th>Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <Tr key={invoice.invoiceId}>
                    <Td>{invoice.number}</Td>
                    <Td>{formatDateID(invoice.businessDate)}</Td>
                    <Td>{formatDateID(invoice.dueDate)}</Td>
                    <Td className="tabular text-right">{formatIDR(invoice.balance)}</Td>
                    <Td className="text-right">
                      <Input
                        aria-label={`Alokasi untuk ${invoice.number}`}
                        inputMode="numeric"
                        className="h-9 text-right"
                        value={allocations[invoice.invoiceId] ?? ""}
                        onChange={(event) =>
                          setAllocations((current) => ({ ...current, [invoice.invoiceId]: event.target.value }))
                        }
                      />
                    </Td>
                    <Td>
                      <Button type="button" variant="ghost" size="sm" onClick={() => fillRemaining(invoice)}>
                        Isi sisa
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <p className={balanced ? "tabular text-sm text-success" : "tabular text-sm text-warning"}>
          Total alokasi {formatIDR(totalAllocated)} dari pembayaran {formatIDR(paymentAmount)}
          {balanced ? " — seimbang" : " — harus sama"}
        </p>
        <Button type="submit" loading={pending} disabled={!balanced}>
          Simpan Pembayaran
        </Button>
      </div>
      <p className="text-xs text-ink-subtle">
        Server mengunci tagihan dan membaca ulang saldo sebelum menyimpan, sehingga dua pembayaran paralel tidak bisa
        melebihi sisa tagihan.
      </p>
    </form>
  );
}
