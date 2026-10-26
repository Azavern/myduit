"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { reverseTransactionAction, reverseTransferAction } from "@/modules/cash/actions";

export function ReverseTransactionForm({
  workspaceId,
  transactionId,
  label,
  today,
}: {
  workspaceId: string;
  transactionId: string;
  label: string;
  today: string;
}) {
  const [state, action, pending] = useActionState(reverseTransactionAction, IDLE_STATE);
  return (
    <details className="rounded-lg border border-border-subtle p-3">
      <summary className="cursor-pointer text-xs font-medium text-brand-700">Koreksi {label}</summary>
      <form action={action} className="mt-3 space-y-3" noValidate>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="transactionId" value={transactionId} />
        {state.message ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {state.message}
          </p>
        ) : null}
        <Field label="Tanggal koreksi" htmlFor={`rtDate-${transactionId}`}>
          <Input id={`rtDate-${transactionId}`} name="businessDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Alasan" htmlFor={`rtReason-${transactionId}`}>
          <Textarea id={`rtReason-${transactionId}`} name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" variant="danger" size="sm" loading={pending}>
          Balikkan transaksi
        </Button>
      </form>
    </details>
  );
}

export function ReverseTransferForm({
  workspaceId,
  transferId,
  today,
}: {
  workspaceId: string;
  transferId: string;
  today: string;
}) {
  const [state, action, pending] = useActionState(reverseTransferAction, IDLE_STATE);
  return (
    <details className="rounded-lg border border-border-subtle p-3">
      <summary className="cursor-pointer text-xs font-medium text-brand-700">Koreksi transfer</summary>
      <form action={action} className="mt-3 space-y-3" noValidate>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="transferId" value={transferId} />
        {state.message ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {state.message}
          </p>
        ) : null}
        <Field label="Tanggal koreksi" htmlFor={`rtrDate-${transferId}`}>
          <Input id={`rtrDate-${transferId}`} name="businessDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Alasan" htmlFor={`rtrReason-${transferId}`}>
          <Textarea id={`rtrReason-${transferId}`} name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" variant="danger" size="sm" loading={pending}>
          Balikkan transfer
        </Button>
      </form>
    </details>
  );
}
