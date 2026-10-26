"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { saveCategoryAction, savePaymentMethodAction, togglePaymentMethodAction } from "@/modules/masters/actions";

function Feedback({ status, message }: { status: "idle" | "error" | "success"; message?: string }) {
  if (!message || status === "idle") return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "sm:col-span-2 rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger"
          : "sm:col-span-2 rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

export function CategoryForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(saveCategoryAction, IDLE_STATE);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Feedback status={state.status} message={state.message} />
      <Field label="Nama kategori" htmlFor="catName" error={state.fieldErrors?.name}>
        <Input id="catName" name="name" required maxLength={120} />
      </Field>
      <Field label="Jenis" htmlFor="catKind" hint="Jenis kategori tidak dapat diubah setelah dibuat.">
        <Select id="catKind" name="kind" defaultValue="expense">
          <option value="sale">Penjualan</option>
          <option value="income">Pemasukan</option>
          <option value="expense">Pengeluaran</option>
        </Select>
      </Field>
      <Field label="Kode (opsional)" htmlFor="catCode">
        <Input id="catCode" name="code" maxLength={40} />
      </Field>
      <Field label="Warna (opsional)" htmlFor="catColor" hint="Contoh: #0d9488">
        <Input id="catColor" name="color" maxLength={20} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Tambah kategori
        </Button>
      </div>
    </form>
  );
}

export function PaymentMethodForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(savePaymentMethodAction, IDLE_STATE);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Feedback status={state.status} message={state.message} />
      <Field label="Nama metode" htmlFor="pmName">
        <Input id="pmName" name="name" required maxLength={80} />
      </Field>
      <Field label="Kode" htmlFor="pmCode" hint="Huruf kecil, mis. bank_transfer">
        <Input id="pmCode" name="code" required maxLength={40} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" loading={pending}>
          Tambah metode
        </Button>
      </div>
    </form>
  );
}

export function TogglePaymentMethodForm({
  workspaceId,
  methodId,
  active,
}: {
  workspaceId: string;
  methodId: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(togglePaymentMethodAction, IDLE_STATE);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="methodId" value={methodId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
      {state.status === "error" && state.message ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
