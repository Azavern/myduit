"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ROLE_LABELS } from "@/lib/permissions";
import { IDLE_STATE } from "@/lib/action-state";
import { createWorkspaceAction } from "@/modules/workspace/actions";
import type { WorkspaceSummary } from "@/server/dal/session";

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "UTC",
];

const TEMPLATES = [
  { code: "sales_receivables", label: "Penjualan & Piutang", description: "Pedagang dengan tempo atau cicilan." },
  { code: "simple_cashbook", label: "Buku Kas Sederhana", description: "Pencatatan kas harian sederhana." },
  { code: "small_business", label: "Usaha Kecil", description: "Toko atau usaha mikro." },
  { code: "freelancer", label: "Jasa/Freelancer", description: "Klien dan tagihan jasa." },
  { code: "household", label: "Anggaran Rumah Tangga", description: "Keuangan pribadi/keluarga." },
  { code: "project_event", label: "Proyek/Acara", description: "Kepanitiaan atau pengelolaan acara." },
];

export function WorkspacePicker({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const router = useRouter();
  return (
    <ul className="divide-y divide-border-subtle">
      {workspaces.map((workspace) => (
        <li key={workspace.workspaceId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="font-medium text-ink">
              {workspace.name}
              {workspace.archivedAt ? <span className="ml-2 text-xs text-warning">(arsip)</span> : null}
            </p>
            <p className="text-xs text-ink-subtle">Peran: {ROLE_LABELS[workspace.role]}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/w/${workspace.workspaceId}/dashboard`)}
          >
            Buka
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, IDLE_STATE);
  const [template, setTemplate] = useState("sales_receivables");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat workspace baru</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={action} className="space-y-5" noValidate>
          {state.status === "error" && state.message ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
          ) : null}

          <Field label="Nama workspace / usaha" htmlFor="name" error={state.fieldErrors?.name}>
            <Input id="name" name="name" required placeholder="Contoh: Toko Sinar Jaya" />
          </Field>

          <Field
            label="Zona waktu"
            htmlFor="timezone"
            hint="Menentukan tanggal transaksi harian (business date) workspace."
          >
            <Select id="timezone" name="timezone" defaultValue="Asia/Makassar">
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Template awal</legend>
            <p className="text-xs text-ink-subtle">
              Template hanya menambahkan kategori, metode pembayaran, dan akun awal. Tidak ada transaksi contoh.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((item) => (
                <label
                  key={item.code}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
                    template === item.code ? "border-brand-500 bg-brand-50" : "border-border-subtle bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={item.code}
                    checked={template === item.code}
                    onChange={() => setTemplate(item.code)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-ink">{item.label}</span>
                    <span className="block text-xs text-ink-muted">{item.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" loading={pending}>
            Buat workspace
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
