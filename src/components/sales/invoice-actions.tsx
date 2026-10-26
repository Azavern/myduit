"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { reversePaymentAction, voidInvoiceAction } from "@/modules/sales/actions";

function Feedback({ status, message }: { status: "idle" | "error" | "success"; message?: string }) {
  if (!message || status === "idle") return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger"
          : "rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

export function VoidInvoiceForm({
  workspaceId,
  invoiceId,
  today,
  disabled,
}: {
  workspaceId: string;
  invoiceId: string;
  today: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(voidInvoiceAction, IDLE_STATE);
  return (
    <details className="rounded-lg border border-border-subtle bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">Batalkan tagihan (void)</summary>
      <p className="mt-2 text-xs text-ink-muted">
        Void tidak menghapus dokumen. Nomor lama tetap dapat ditelusuri dan nomor tidak digunakan ulang. Tagihan yang
        masih memiliki pembayaran efektif harus dibalik dulu.
      </p>
      {disabled ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-warning-surface px-3 py-2 text-sm text-warning">
          Tagihan ini masih memiliki pembayaran efektif. Balikkan pembayaran terlebih dahulu.
        </p>
      ) : (
        <form action={action} className="mt-3 space-y-3" noValidate>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Feedback status={state.status} message={state.message} />
          <Field label="Tanggal pembatalan" htmlFor="voidDate">
            <Input id="voidDate" name="businessDate" type="date" defaultValue={today} required />
          </Field>
          <Field label="Alasan pembatalan" htmlFor="voidReason">
            <Textarea id="voidReason" name="reason" required maxLength={1000} />
          </Field>
          <Button type="submit" variant="danger" loading={pending}>
            Batalkan tagihan
          </Button>
        </form>
      )}
    </details>
  );
}

export function ReversePaymentForm({
  workspaceId,
  paymentId,
  invoiceId,
  today,
}: {
  workspaceId: string;
  paymentId: string;
  invoiceId: string;
  today: string;
}) {
  const [state, action, pending] = useActionState(reversePaymentAction, IDLE_STATE);
  return (
    <details className="rounded-lg border border-border-subtle bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">Balikkan pembayaran ini</summary>
      <p className="mt-2 text-xs text-ink-muted">
        Pembalikan mengoreksi seluruh pembayaran: alokasi menjadi tidak efektif sejak tanggal pembalikan dan kas
        dikurangi satu kali. Ini koreksi pencatatan, bukan klaim refund bank.
      </p>
      <form action={action} className="mt-3 space-y-3" noValidate>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <Feedback status={state.status} message={state.message} />
        <Field label="Tanggal pembalikan" htmlFor={`revDate-${paymentId}`}>
          <Input id={`revDate-${paymentId}`} name="businessDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Alasan koreksi" htmlFor={`revReason-${paymentId}`}>
          <Textarea id={`revReason-${paymentId}`} name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" variant="danger" loading={pending}>
          Balikkan pembayaran
        </Button>
      </form>
    </details>
  );
}
