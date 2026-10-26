"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import { archiveWorkspaceAction, updateWorkspaceSettingsAction } from "@/modules/workspace/actions";

const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "UTC"];

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

export function WorkspaceSettingsForm({
  workspaceId,
  name,
  timezone,
}: {
  workspaceId: string;
  name: string;
  timezone: string;
}) {
  const [state, action, pending] = useActionState(updateWorkspaceSettingsAction, IDLE_STATE);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="sm:col-span-2">
        <Feedback status={state.status} message={state.message} />
      </div>
      <Field label="Nama workspace" htmlFor="wsName" error={state.fieldErrors?.name}>
        <Input id="wsName" name="name" defaultValue={name} required maxLength={160} />
      </Field>
      <Field
        label="Zona waktu"
        htmlFor="wsTimezone"
        hint="Memengaruhi penentuan business date. Tidak mengubah tanggal dokumen lama."
      >
        <Select id="wsTimezone" name="timezone" defaultValue={timezone}>
          {[...new Set([timezone, ...TIMEZONES])].map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}

export function ArchiveWorkspaceForm({ workspaceId, archived }: { workspaceId: string; archived: boolean }) {
  const [state, action, pending] = useActionState(archiveWorkspaceAction, IDLE_STATE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <Feedback status={state.status} message={state.message} />
      <p className="text-sm text-ink-muted">
        Mengarsipkan workspace menghentikan transaksi baru tanpa menghapus data. Data keuangan tidak dapat dihapus
        permanen pada prototipe ini.
      </p>
      <Button type="submit" variant={archived ? "secondary" : "danger"} loading={pending}>
        {archived ? "Aktifkan kembali workspace" : "Arsipkan workspace"}
      </Button>
    </form>
  );
}
