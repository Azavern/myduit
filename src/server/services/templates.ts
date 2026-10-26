import "server-only";

import type { Tx } from "@/server/db/client";
import { createCashAccount } from "@/server/services/masters";
import type { CategoryKind } from "@/server/services/masters";
import type { TemplateCode } from "@/server/services/workspaces";

type Preset = {
  categories: { name: string; kind: CategoryKind }[];
  paymentMethods: { name: string; code: string }[];
  accounts: { name: string; kind: "cash" | "bank" | "ewallet" | "other" }[];
};

const COMMON_METHODS = [
  { name: "Tunai", code: "cash" },
  { name: "Transfer Bank", code: "bank_transfer" },
  { name: "QRIS / E-wallet", code: "qris" },
  { name: "Kartu", code: "card" },
  { name: "Lainnya", code: "other" },
];

const PRESETS: Record<TemplateCode, Preset> = {
  sales_receivables: {
    categories: [
      { name: "Penjualan", kind: "sale" },
      { name: "Pendapatan lain", kind: "income" },
      { name: "Pembelian barang", kind: "expense" },
      { name: "Operasional", kind: "expense" },
      { name: "Gaji", kind: "expense" },
    ],
    paymentMethods: COMMON_METHODS,
    accounts: [
      { name: "Kas Tunai", kind: "cash" },
      { name: "Bank", kind: "bank" },
    ],
  },
  simple_cashbook: {
    categories: [
      { name: "Pemasukan", kind: "income" },
      { name: "Pengeluaran", kind: "expense" },
    ],
    paymentMethods: COMMON_METHODS.slice(0, 2),
    accounts: [{ name: "Kas Tunai", kind: "cash" }],
  },
  small_business: {
    categories: [
      { name: "Penjualan", kind: "sale" },
      { name: "Pendapatan lain", kind: "income" },
      { name: "Biaya operasional", kind: "expense" },
      { name: "Biaya bahan", kind: "expense" },
    ],
    paymentMethods: COMMON_METHODS,
    accounts: [
      { name: "Kas Tunai", kind: "cash" },
      { name: "Bank", kind: "bank" },
    ],
  },
  freelancer: {
    categories: [
      { name: "Jasa", kind: "sale" },
      { name: "Pendapatan lain", kind: "income" },
      { name: "Biaya proyek", kind: "expense" },
      { name: "Operasional", kind: "expense" },
    ],
    paymentMethods: COMMON_METHODS.slice(0, 4),
    accounts: [{ name: "Rekening Utama", kind: "bank" }],
  },
  household: {
    categories: [
      { name: "Penghasilan", kind: "income" },
      { name: "Kebutuhan rutin", kind: "expense" },
      { name: "Transportasi", kind: "expense" },
      { name: "Tabungan", kind: "expense" },
    ],
    paymentMethods: COMMON_METHODS.slice(0, 3),
    accounts: [
      { name: "Kas", kind: "cash" },
      { name: "Rekening", kind: "bank" },
    ],
  },
  project_event: {
    categories: [
      { name: "Pemasukan proyek", kind: "income" },
      { name: "Biaya acara", kind: "expense" },
      { name: "Konsumsi", kind: "expense" },
      { name: "Perlengkapan", kind: "expense" },
    ],
    paymentMethods: COMMON_METHODS,
    accounts: [{ name: "Kas Proyek", kind: "cash" }],
  },
};

/**
 * Applies preset configuration for a template. Idempotent: uses ON CONFLICT
 * DO NOTHING so re-running never overwrites categories already in use, and it
 * never creates fictional financial transactions (blueprint §10).
 */
export async function applyTemplatePreset(
  tx: Tx,
  workspaceId: string,
  template: TemplateCode,
  today: string,
): Promise<void> {
  const preset = PRESETS[template];
  for (const category of preset.categories) {
    await tx`
      insert into public.categories (workspace_id, name, kind)
      values (${workspaceId}, ${category.name}, ${category.kind}::public.category_kind)
      on conflict (workspace_id, kind, name) do nothing
    `;
  }
  for (const method of preset.paymentMethods) {
    await tx`
      insert into public.payment_methods (workspace_id, name, code)
      values (${workspaceId}, ${method.name}, ${method.code})
      on conflict (workspace_id, code) do nothing
    `;
  }
  for (const account of preset.accounts) {
    const existing = await tx<{ id: string }[]>`
      select id from public.cash_accounts where workspace_id = ${workspaceId} and name = ${account.name}
    `;
    if (existing.length === 0) {
      await createCashAccount(tx, workspaceId, {
        name: account.name,
        kind: account.kind,
        openingDate: today,
        openingBalance: 0n,
        notes: "Dibuat otomatis dari template workspace",
      });
    }
  }
}
