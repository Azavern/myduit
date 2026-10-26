import "server-only";

import type { Tx } from "@/server/db/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isValidTimezone } from "@/lib/dates";
import type { MembershipRole } from "@/server/dal/session";

export const WORKSPACE_TEMPLATES = [
  { code: "sales_receivables", label: "Penjualan & Piutang", description: "Pedagang dengan tempo atau cicilan." },
  { code: "simple_cashbook", label: "Buku Kas Sederhana", description: "Pencatatan kas harian sederhana." },
  { code: "small_business", label: "Usaha Kecil", description: "Toko atau usaha mikro." },
  { code: "freelancer", label: "Jasa/Freelancer", description: "Klien dan tagihan jasa." },
  { code: "household", label: "Anggaran Rumah Tangga", description: "Keuangan pribadi/keluarga." },
  { code: "project_event", label: "Proyek/Acara", description: "Kepanitiaan atau pengelolaan acara." },
] as const;

export type TemplateCode = (typeof WORKSPACE_TEMPLATES)[number]["code"];

export function isTemplateCode(value: string): value is TemplateCode {
  return WORKSPACE_TEMPLATES.some((template) => template.code === value);
}

export async function createWorkspace(
  tx: Tx,
  input: { name: string; timezone: string; template: TemplateCode },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Nama workspace wajib diisi.");
  if (!isValidTimezone(input.timezone)) throw new ValidationError("Zona waktu tidak valid.");
  const rows = await tx<{ id: string }[]>`
    select app_private.create_workspace(${name}::text, ${input.timezone}::text, ${input.template}::text) as id
  `;
  const workspaceId = rows[0]?.id;
  if (!workspaceId) throw new ValidationError("Workspace tidak dapat dibuat.");
  return workspaceId;
}

export async function updateWorkspaceSettings(
  tx: Tx,
  workspaceId: string,
  input: { name?: string; timezone?: string },
): Promise<void> {
  if (input.timezone && !isValidTimezone(input.timezone)) throw new ValidationError("Zona waktu tidak valid.");
  const rows = await tx<{ id: string }[]>`
    update public.workspaces set
      name = coalesce(${input.name?.trim() || null}, name),
      timezone = coalesce(${input.timezone ?? null}, timezone),
      updated_at = now()
    where id = ${workspaceId}
    returning id
  `;
  if (rows.length === 0) throw new NotFoundError("Workspace tidak ditemukan.");
}

export async function setWorkspaceArchived(tx: Tx, workspaceId: string, archived: boolean): Promise<void> {
  await tx`
    update public.workspaces set
      archived_at = case when ${archived} then now() else null end,
      updated_at = now()
    where id = ${workspaceId}
  `;
}

export type MemberRow = { user_id: string; display_name: string; role: MembershipRole; status: "active" | "disabled" };

export async function listMembers(tx: Tx, workspaceId: string): Promise<MemberRow[]> {
  return tx<MemberRow[]>`
    select user_id, display_name, role, status from app_private.list_members(${workspaceId}::uuid)
    order by case role when 'owner' then 0 when 'admin' then 1 when 'finance' then 2 when 'cashier' then 3 else 4 end, display_name
  `;
}

export async function setMembership(
  tx: Tx,
  workspaceId: string,
  userId: string,
  role: MembershipRole,
  status: "active" | "disabled",
): Promise<void> {
  await tx`
    select app_private.set_membership(${workspaceId}::uuid, ${userId}::uuid,
      ${role}::public.membership_role, ${status}::public.member_status)
  `;
}

export async function transferOwner(tx: Tx, workspaceId: string, newOwnerId: string): Promise<void> {
  await tx`select app_private.transfer_owner(${workspaceId}::uuid, ${newOwnerId}::uuid)`;
}

export type PendingInvitation = {
  invitationId: string;
  emailMasked: string | null;
  role: MembershipRole;
  createdAt: string;
  status: "pending" | "accepted" | "revoked";
};

/**
 * Invitations live in `app_private` and are not readable by the runtime role.
 * Their lifecycle is therefore reconstructed from the append-only audit trail
 * written by the invitation database helpers (blueprint §6.1).
 */
export async function listInvitationLifecycle(tx: Tx, workspaceId: string): Promise<PendingInvitation[]> {
  const rows = await tx<{ entity_id: string; action: string; role: string; created_at: string }[]>`
    select entity_id, action, coalesce(after_data->>'role', 'finance') as role, created_at::text
    from public.audit_events
    where workspace_id = ${workspaceId}
      and entity_type = 'workspace_invitations'
      and action in ('invite', 'accept_invitation', 'revoke_invitation')
    order by created_at
  `;
  const map = new Map<string, PendingInvitation>();
  for (const row of rows) {
    const id = row.entity_id;
    if (row.action === "invite") {
      map.set(id, {
        invitationId: id,
        emailMasked: null,
        role: (row.role as MembershipRole) ?? "finance",
        createdAt: row.created_at,
        status: "pending",
      });
    } else {
      const existing = map.get(id);
      if (existing) existing.status = row.action === "accept_invitation" ? "accepted" : "revoked";
    }
  }
  return [...map.values()].filter((invitation) => invitation.status === "pending");
}

export async function requirePermission(
  tx: Tx,
  workspaceId: string,
  permission: string,
): Promise<void> {
  const rows = await tx<{ allowed: boolean }[]>`
    select app_private.has_permission(${workspaceId}::uuid, ${permission}::text) as allowed
  `;
  if (rows[0]?.allowed !== true) {
    throw new ForbiddenError("Anda tidak memiliki izin untuk tindakan ini pada workspace ini.");
  }
}

export async function getWorkspaceTimezone(tx: Tx, workspaceId: string): Promise<string> {
  const rows = await tx<{ timezone: string }[]>`
    select timezone from public.workspaces where id = ${workspaceId}
  `;
  return rows[0]?.timezone ?? "Asia/Makassar";
}
