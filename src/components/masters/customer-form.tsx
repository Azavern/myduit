"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { saveCustomerAction } from "@/modules/masters/actions";

export type CustomerFormValues = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
};

export function CustomerForm({ workspaceId, values }: { workspaceId: string; values: CustomerFormValues }) {
  const [state, action, pending] = useActionState(saveCustomerAction, IDLE_STATE);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {values.id ? <input type="hidden" name="customerId" value={values.id} /> : null}

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

      <Field label="Nama pelanggan" htmlFor={`name-${values.id ?? "new"}`} error={state.fieldErrors?.name}>
        <Input id={`name-${values.id ?? "new"}`} name="name" defaultValue={values.name} required maxLength={160} />
      </Field>
      <Field label="Nomor telepon" htmlFor={`phone-${values.id ?? "new"}`}>
        <Input id={`phone-${values.id ?? "new"}`} name="phone" defaultValue={values.phone} maxLength={40} />
      </Field>
      <Field label="Email" htmlFor={`email-${values.id ?? "new"}`}>
        <Input id={`email-${values.id ?? "new"}`} name="email" type="email" defaultValue={values.email} maxLength={254} />
      </Field>
      <Field label="Status" htmlFor={`active-${values.id ?? "new"}`}>
        <select
          id={`active-${values.id ?? "new"}`}
          name="active"
          defaultValue={values.active ? "true" : "false"}
          className="h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm"
        >
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </Field>
      <Field label="Alamat" htmlFor={`address-${values.id ?? "new"}`} className="sm:col-span-2">
        <Input id={`address-${values.id ?? "new"}`} name="address" defaultValue={values.address} maxLength={500} />
      </Field>
      <Field label="Catatan penagihan" htmlFor={`notes-${values.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`notes-${values.id ?? "new"}`} name="notes" defaultValue={values.notes} maxLength={2000} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Simpan pelanggan
        </Button>
      </div>
    </form>
  );
}
