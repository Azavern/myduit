"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IDLE_STATE } from "@/lib/action-state";
import {
  createInvitationAction,
  revokeInvitationAction,
  setMembershipAction,
  transferOwnerAction,
} from "@/modules/workspace/actions";
import type { MembershipRole } from "@/lib/permissions";

const ASSIGNABLE_ROLES: MembershipRole[] = ["admin", "finance", "cashier", "viewer"];

export function InviteMemberForm({
  workspaceId,
  canAssignAdmin,
}: {
  workspaceId: string;
  canAssignAdmin: boolean;
}) {
  const [state, action, pending] = useActionState(createInvitationAction, IDLE_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p role="status" className="break-all rounded-lg border border-emerald-200 bg-success-surface px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      ) : null}
      <Field label="Email penerima undangan" htmlFor="inviteEmail" error={state.fieldErrors?.email}>
        <Input id="inviteEmail" name="email" type="email" required maxLength={254} />
      </Field>
      <Field label="Peran" htmlFor="inviteRole" hint="Owner tidak dapat diundang; gunakan transfer kepemilikan.">
        <Select id="inviteRole" name="role" defaultValue="finance">
          {ASSIGNABLE_ROLES.filter((role) => canAssignAdmin || role !== "admin").map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" loading={pending}>
        Buat tautan undangan
      </Button>
      <p className="text-xs text-ink-subtle">
        Prototipe ini tidak mengirim email. Salin tautan yang muncul dan kirimkan melalui kanal pilihan Anda. Tautan
        berlaku 72 jam dan sekali pakai.
      </p>
    </form>
  );
}

export function MemberRoleForm({
  workspaceId,
  userId,
  role,
  status,
  canManageAdmins,
}: {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
  status: "active" | "disabled";
  canManageAdmins: boolean;
}) {
  const [state, action, pending] = useActionState(setMembershipAction, IDLE_STATE);
  if (role === "owner") {
    return <span className="text-xs text-ink-subtle">Owner (tidak dapat diubah di sini)</span>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="userId" value={userId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Peran</span>
        <Select name="role" defaultValue={role} className="h-9 w-32 text-xs">
          {ASSIGNABLE_ROLES.filter((item) => canManageAdmins || item !== "admin").map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Status</span>
        <Select name="status" defaultValue={status} className="h-9 w-28 text-xs">
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </Select>
      </label>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        Simpan
      </Button>
      {state.status === "error" && state.message ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function RevokeInvitationForm({ workspaceId, invitationId }: { workspaceId: string; invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitationAction, IDLE_STATE);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" size="sm" variant="ghost" loading={pending}>
        Cabut
      </Button>
      {state.status === "error" && state.message ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function TransferOwnerForm({
  workspaceId,
  candidates,
}: {
  workspaceId: string;
  candidates: { userId: string; displayName: string }[];
}) {
  const [state, action, pending] = useActionState(transferOwnerAction, IDLE_STATE);
  if (candidates.length === 0) {
    return <p className="text-sm text-ink-muted">Tidak ada anggota aktif lain yang dapat menjadi owner.</p>;
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
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
      <Field label="Owner baru" htmlFor="newOwnerId" hint="Anda akan menjadi admin setelah transfer.">
        <Select id="newOwnerId" name="newOwnerId" required>
          {candidates.map((candidate) => (
            <option key={candidate.userId} value={candidate.userId}>
              {candidate.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="danger" loading={pending}>
        Transfer kepemilikan
      </Button>
    </form>
  );
}
