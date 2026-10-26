"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { createCashAccountAction } from "@/modules/masters/actions";

export function CashAccountForm({ workspaceId, today }: { workspaceId: string; today: string }) {
  const [state, action, pending] = useActionState(createCashAccountAction, IDLE_STATE);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {state.status === "error" && state.message ? (
        <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p role="status" className="sm:col-span-2 rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      ) : null}
      <Field label="Nama akun" htmlFor="accountName" error={state.fieldErrors?.name}>
        <Input id="accountName" name="name" required maxLength={120} placeholder="Kas Tunai / Bank BCA" />
      </Field>
      <Field label="Tipe akun" htmlFor="accountKind">
        <Select id="accountKind" name="kind" defaultValue="cash">
          <option value="cash">Kas tunai</option>
          <option value="bank">Bank</option>
          <option value="ewallet">E-wallet</option>
          <option value="other">Lainnya</option>
        </Select>
      </Field>
      <Field
        label="Tanggal saldo awal"
        htmlFor="accountOpeningDate"
        hint="Transaksi sebelum tanggal ini akan ditolak."
      >
        <Input id="accountOpeningDate" name="openingDate" type="date" defaultValue={today} />
      </Field>
      <Field
        label="Saldo awal"
        htmlFor="accountOpeningBalance"
        hint="Disimpan sebagai satu pergerakan kas jenis opening."
        error={state.fieldErrors?.openingBalance}
      >
        <Input id="accountOpeningBalance" name="openingBalance" inputMode="numeric" defaultValue="0" />
      </Field>
      <Field label="Referensi (opsional)" htmlFor="accountReference">
        <Input id="accountReference" name="reference" maxLength={120} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="accountNotes">
        <Input id="accountNotes" name="notes" maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Tambah akun
        </Button>
      </div>
    </form>
  );
}
