import "server-only";

import type { Tx } from "@/server/db/client";

export type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
  request_id: string | null;
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  insert: "Buat",
  update: "Ubah",
  delete: "Hapus",
  invite: "Undang anggota",
  revoke_invitation: "Cabut undangan",
  accept_invitation: "Terima undangan",
  export: "Ekspor",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entityType: string): string {
  const map: Record<string, string> = {
    sales_invoices: "Tagihan",
    sales_invoice_lines: "Baris tagihan",
    payments: "Pembayaran",
    payment_allocations: "Alokasi pembayaran",
    payment_reversals: "Pembalikan pembayaran",
    invoice_void_events: "Pembatalan tagihan",
    financial_transactions: "Transaksi kas",
    cash_transfers: "Transfer",
    cash_movements: "Pergerakan kas",
    customers: "Pelanggan",
    products: "Produk",
    product_unit_options: "Satuan produk",
    cash_accounts: "Akun kas",
    categories: "Kategori",
    payment_methods: "Metode pembayaran",
    workspace_memberships: "Keanggotaan",
    workspaces: "Workspace",
    workspace_invitations: "Undangan",
  };
  return map[entityType] ?? entityType;
}

export async function listAuditEvents(
  tx: Tx,
  workspaceId: string,
  filter: { action?: string | null; entityType?: string | null; actorId?: string | null; from?: string | null; to?: string | null; limit?: number; offset?: number } = {},
): Promise<{ rows: AuditRow[]; total: number }> {
  const limit = filter.limit ?? 25;
  const offset = filter.offset ?? 0;
  const rows = await tx<AuditRow[]>`
    select e.id, e.action, e.entity_type, e.entity_id, e.actor_id, u.display_name as actor_name,
      e.reason, e.created_at::text, e.request_id
    from public.audit_events e
    left join public.users u on u.id = e.actor_id
    where e.workspace_id = ${workspaceId}
      and (${filter.action ?? null}::text is null or e.action = ${filter.action ?? null}::text)
      and (${filter.entityType ?? null}::text is null or e.entity_type = ${filter.entityType ?? null}::text)
      and (${filter.actorId ?? null}::uuid is null or e.actor_id = ${filter.actorId ?? null}::uuid)
      and (${filter.from ?? null}::date is null or e.created_at >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or e.created_at < (${filter.to ?? null}::date + interval '1 day'))
    order by e.created_at desc, e.id desc
    limit ${limit} offset ${offset}
  `;
  const totals = await tx<{ count: string }[]>`
    select count(*)::text as count from public.audit_events e
    where e.workspace_id = ${workspaceId}
      and (${filter.action ?? null}::text is null or e.action = ${filter.action ?? null}::text)
      and (${filter.entityType ?? null}::text is null or e.entity_type = ${filter.entityType ?? null}::text)
      and (${filter.actorId ?? null}::uuid is null or e.actor_id = ${filter.actorId ?? null}::uuid)
      and (${filter.from ?? null}::date is null or e.created_at >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or e.created_at < (${filter.to ?? null}::date + interval '1 day'))
  `;
  return { rows, total: Number(totals[0]?.count ?? "0") };
}
