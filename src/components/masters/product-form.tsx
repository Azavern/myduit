"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { saveProductAction } from "@/modules/masters/actions";

export type UnitRow = { name: string; factor: string; price: string; active: boolean };

export type ProductFormValues = {
  id?: string;
  name: string;
  sku: string;
  productKind: "goods" | "service";
  baseUnit: string;
  basePrice: string;
  description: string;
  active: boolean;
  units: UnitRow[];
};

export function ProductForm({ workspaceId, values }: { workspaceId: string; values: ProductFormValues }) {
  const [state, action, pending] = useActionState(saveProductAction, IDLE_STATE);
  const [units, setUnits] = useState<UnitRow[]>(values.units);
  const suffix = values.id ?? "new";

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {values.id ? <input type="hidden" name="productId" value={values.id} /> : null}

      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nama produk/jasa" htmlFor={`pname-${suffix}`} error={state.fieldErrors?.name}>
          <Input id={`pname-${suffix}`} name="name" defaultValue={values.name} required maxLength={160} />
        </Field>
        <Field label="Kode/SKU (opsional)" htmlFor={`psku-${suffix}`} hint="Unik per workspace bila diisi.">
          <Input id={`psku-${suffix}`} name="sku" defaultValue={values.sku} maxLength={60} />
        </Field>
        <Field label="Tipe" htmlFor={`pkind-${suffix}`}>
          <Select id={`pkind-${suffix}`} name="productKind" defaultValue={values.productKind}>
            <option value="goods">Barang</option>
            <option value="service">Jasa</option>
          </Select>
        </Field>
        <Field label="Satuan dasar" htmlFor={`punit-${suffix}`} error={state.fieldErrors?.baseUnit}>
          <Input id={`punit-${suffix}`} name="baseUnit" defaultValue={values.baseUnit} required maxLength={40} />
        </Field>
        <Field label="Harga satuan dasar" htmlFor={`pprice-${suffix}`} error={state.fieldErrors?.basePrice}>
          <Input id={`pprice-${suffix}`} name="basePrice" inputMode="numeric" defaultValue={values.basePrice} />
        </Field>
        <Field label="Status" htmlFor={`pactive-${suffix}`}>
          <Select id={`pactive-${suffix}`} name="active" defaultValue={values.active ? "true" : "false"}>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </Select>
        </Field>
        <Field label="Deskripsi" htmlFor={`pdesc-${suffix}`} className="sm:col-span-2 lg:col-span-3">
          <Textarea id={`pdesc-${suffix}`} name="description" defaultValue={values.description} maxLength={2000} />
        </Field>
      </div>

      <div>
        <p className="text-sm font-medium text-ink">Satuan jual tambahan (opsional)</p>
        <p className="mb-2 text-xs text-ink-subtle">
          Contoh: 1 pak = 6 botol. Faktor konversi disimpan pada baris transaksi sehingga perubahan master tidak mengubah
          histori.
        </p>
        <div className="space-y-2">
          {units.map((unit, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                name="unitName"
                value={unit.name}
                onChange={(event) => setUnits((current) => current.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))}
                placeholder="Nama satuan (mis. pak)"
                aria-label={`Nama satuan ${index + 1}`}
              />
              <Input
                name="unitFactor"
                value={unit.factor}
                onChange={(event) => setUnits((current) => current.map((row, i) => (i === index ? { ...row, factor: event.target.value } : row)))}
                placeholder="Konversi (mis. 6)"
                inputMode="decimal"
                aria-label={`Faktor konversi ${index + 1}`}
              />
              <Input
                name="unitPrice"
                value={unit.price}
                onChange={(event) => setUnits((current) => current.map((row, i) => (i === index ? { ...row, price: event.target.value } : row)))}
                placeholder="Harga jual satuan"
                inputMode="numeric"
                aria-label={`Harga satuan ${index + 1}`}
              />
              <input type="hidden" name="unitActive" value={unit.active ? "true" : "false"} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUnits((current) => current.filter((_, i) => i !== index))}
                aria-label={`Hapus satuan ${index + 1}`}
              >
                Hapus
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => setUnits((current) => [...current, { name: "", factor: "1", price: "0", active: true }])}
        >
          Tambah satuan
        </Button>
      </div>

      <Button type="submit" loading={pending}>
        Simpan produk
      </Button>
    </form>
  );
}
