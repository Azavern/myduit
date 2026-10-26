import "server-only";

import type { Tx } from "@/server/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { formatIDR } from "@/lib/money";

export type TransactionKind = "income" | "expense";

export type FinancialTransactionRow = {
  id: string;
  number: string;
  kind: TransactionKind;
  business_date: string;
  amount: string;
  category_id: string;
  category_name: string;
  account_id: string;
  account_name: string;
  description: string;
  counterparty: string | null;
  related_transfer_id: string | null;
  reversed: boolean;
};

export async function createFinancialTransaction(
  tx: Tx,
  input: {
    workspaceId: string;
    kind: TransactionKind;
    businessDate: string;
    categoryId: string;
    cashAccountId: string;
    paymentMethodId?: string | null;
    amount: bigint;
    description: string;
    counterparty?: string | null;
    reference?: string | null;
    notes?: string | null;
    relatedTransferId?: string | null;
  },
): Promise<{ id: string; number: string }> {
  if (input.amount <= 0n) throw new ValidationError("Nominal harus lebih dari nol.");
  const description = input.description.trim();
  if (!description) throw new ValidationError("Deskripsi wajib diisi.");

  const categoryCheck = await tx<{ id: string }[]>`
    select id from public.categories
    where workspace_id = ${input.workspaceId} and id = ${input.categoryId} and kind::text = ${input.kind} and active
  `;
  if (categoryCheck.length === 0) {
    throw new ValidationError("Kategori tidak cocok dengan jenis transaksi atau sudah nonaktif.");
  }

  const numbers = await tx<{ number: string }[]>`
    select app_private.next_document_number(${input.workspaceId}::uuid, 'transaction', ${input.businessDate}::date) as number
  `;
  const number = numbers[0]!.number;

  const inserted = await tx<{ id: string }[]>`
    insert into public.financial_transactions
      (workspace_id, number, kind, business_date, category_id, cash_account_id, payment_method_id,
       amount, description, counterparty, reference, notes, related_transfer_id)
    values (${input.workspaceId}, ${number}, ${input.kind}::public.transaction_kind, ${input.businessDate}::date,
      ${input.categoryId}, ${input.cashAccountId}, ${input.paymentMethodId ?? null}, ${input.amount.toString()},
      ${description}, ${input.counterparty?.trim() || null}, ${input.reference?.trim() || null},
      ${input.notes?.trim() || null}, ${input.relatedTransferId ?? null})
    returning id
  `;
  const transactionId = inserted[0]!.id;

  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, financial_transaction_id, description)
    values (${input.workspaceId}, ${input.cashAccountId}, ${input.businessDate}::date,
      ${input.kind}::text::public.movement_kind,
      ${(input.kind === "income" ? input.amount : -input.amount).toString()}, ${transactionId}, ${description})
  `;

  return { id: transactionId, number };
}

export async function createTransfer(
  tx: Tx,
  input: {
    workspaceId: string;
    businessDate: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: bigint;
    fee?: bigint;
    feeCategoryId?: string | null;
    reference?: string | null;
    notes?: string | null;
  },
): Promise<{ id: string; number: string; feeTransactionId: string | null }> {
  if (input.amount <= 0n) throw new ValidationError("Nominal transfer harus lebih dari nol.");
  if (input.sourceAccountId === input.destinationAccountId) {
    throw new ValidationError("Akun sumber dan tujuan harus berbeda.");
  }

  const numbers = await tx<{ number: string }[]>`
    select app_private.next_document_number(${input.workspaceId}::uuid, 'transfer', ${input.businessDate}::date) as number
  `;
  const number = numbers[0]!.number;

  const inserted = await tx<{ id: string }[]>`
    insert into public.cash_transfers
      (workspace_id, number, source_account_id, destination_account_id, business_date, amount, reference, notes)
    values (${input.workspaceId}, ${number}, ${input.sourceAccountId}, ${input.destinationAccountId},
      ${input.businessDate}::date, ${input.amount.toString()}, ${input.reference?.trim() || null}, ${input.notes?.trim() || null})
    returning id
  `;
  const transferId = inserted[0]!.id;

  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, cash_transfer_id, description)
    values (${input.workspaceId}, ${input.sourceAccountId}, ${input.businessDate}::date, 'transfer_out',
      ${(-input.amount).toString()}, ${transferId}, ${`Transfer keluar ${number}`})
  `;
  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, cash_transfer_id, description)
    values (${input.workspaceId}, ${input.destinationAccountId}, ${input.businessDate}::date, 'transfer_in',
      ${input.amount.toString()}, ${transferId}, ${`Transfer masuk ${number}`})
  `;

  let feeTransactionId: string | null = null;
  const fee = input.fee ?? 0n;
  if (fee > 0n) {
    if (!input.feeCategoryId) throw new ValidationError("Biaya transfer memerlukan kategori pengeluaran.");
    const feeResult = await createFinancialTransaction(tx, {
      workspaceId: input.workspaceId,
      kind: "expense",
      businessDate: input.businessDate,
      categoryId: input.feeCategoryId,
      cashAccountId: input.sourceAccountId,
      amount: fee,
      description: `Biaya transfer ${number}`,
      relatedTransferId: transferId,
    });
    feeTransactionId = feeResult.id;
  }

  return { id: transferId, number, feeTransactionId };
}

export async function listTransactions(
  tx: Tx,
  workspaceId: string,
  filter: { from?: string | null; to?: string | null; kind?: TransactionKind | null; accountId?: string | null; categoryId?: string | null; search?: string | null; limit?: number; offset?: number } = {},
): Promise<{ rows: FinancialTransactionRow[]; incoming: string; outgoing: string; total: number }> {
  const search = filter.search?.trim() ? `%${filter.search.trim().toLowerCase()}%` : null;
  const limit = filter.limit ?? 25;
  const offset = filter.offset ?? 0;
  const rows = await tx<FinancialTransactionRow[]>`
    select t.id, t.number, t.kind, t.business_date::text, t.amount::text, t.category_id, cat.name as category_name,
      t.cash_account_id as account_id, a.name as account_name, t.description, t.counterparty,
      t.related_transfer_id,
      exists (select 1 from public.financial_transaction_reversals r
        where r.workspace_id = t.workspace_id and r.transaction_id = t.id) as reversed
    from public.financial_transactions t
    join public.categories cat on cat.workspace_id = t.workspace_id and cat.id = t.category_id
    join public.cash_accounts a on a.workspace_id = t.workspace_id and a.id = t.cash_account_id
    where t.workspace_id = ${workspaceId}
      and t.related_transfer_id is null
      and (${filter.from ?? null}::date is null or t.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or t.business_date <= ${filter.to ?? null}::date)
      and (${filter.kind ?? null}::text is null or t.kind::text = ${filter.kind ?? null})
      and (${filter.accountId ?? null}::uuid is null or t.cash_account_id = ${filter.accountId ?? null}::uuid)
      and (${filter.categoryId ?? null}::uuid is null or t.category_id = ${filter.categoryId ?? null}::uuid)
      and (${search}::text is null or lower(t.description) like ${search}::text or lower(coalesce(t.number,'')) like ${search}::text)
    order by t.business_date desc, t.created_at desc
    limit ${limit} offset ${offset}
  `;
  const sums = await tx<{ incoming: string; outgoing: string; count: string }[]>`
    select
      coalesce(sum(case when kind = 'income' then amount else 0 end), 0)::text as incoming,
      coalesce(sum(case when kind = 'expense' then amount else 0 end), 0)::text as outgoing,
      count(*)::text as count
    from public.financial_transactions t
    where t.workspace_id = ${workspaceId} and t.related_transfer_id is null
      and (${filter.from ?? null}::date is null or t.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or t.business_date <= ${filter.to ?? null}::date)
      and (${filter.kind ?? null}::text is null or t.kind::text = ${filter.kind ?? null})
      and (${filter.accountId ?? null}::uuid is null or t.cash_account_id = ${filter.accountId ?? null}::uuid)
      and (${filter.categoryId ?? null}::uuid is null or t.category_id = ${filter.categoryId ?? null}::uuid)
      and (${search}::text is null or lower(t.description) like ${search}::text or lower(coalesce(t.number,'')) like ${search}::text)
  `;
  return {
    rows,
    incoming: sums[0]?.incoming ?? "0",
    outgoing: sums[0]?.outgoing ?? "0",
    total: Number(sums[0]?.count ?? "0"),
  };
}

export type TransferRow = {
  id: string;
  number: string;
  business_date: string;
  amount: string;
  source_name: string;
  destination_name: string;
  reversed: boolean;
};

export async function listTransfers(
  tx: Tx,
  workspaceId: string,
  filter: { from?: string | null; to?: string | null; limit?: number; offset?: number } = {},
): Promise<{ rows: TransferRow[]; total: number }> {
  const limit = filter.limit ?? 25;
  const offset = filter.offset ?? 0;
  const rows = await tx<TransferRow[]>`
    select t.id, t.number, t.business_date::text, t.amount::text, s.name as source_name, d.name as destination_name,
      exists (select 1 from public.cash_transfer_reversals r
        where r.workspace_id = t.workspace_id and r.transfer_id = t.id) as reversed
    from public.cash_transfers t
    join public.cash_accounts s on s.workspace_id = t.workspace_id and s.id = t.source_account_id
    join public.cash_accounts d on d.workspace_id = t.workspace_id and d.id = t.destination_account_id
    where t.workspace_id = ${workspaceId}
      and (${filter.from ?? null}::date is null or t.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or t.business_date <= ${filter.to ?? null}::date)
    order by t.business_date desc, t.created_at desc
    limit ${limit} offset ${offset}
  `;
  const totals = await tx<{ count: string }[]>`
    select count(*)::text as count from public.cash_transfers t
    where t.workspace_id = ${workspaceId}
      and (${filter.from ?? null}::date is null or t.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or t.business_date <= ${filter.to ?? null}::date)
  `;
  return { rows, total: Number(totals[0]?.count ?? "0") };
}

export type CashMovementRow = {
  id: string;
  business_date: string;
  kind: string;
  signed_amount: string;
  account_name: string;
  description: string | null;
  created_at: string;
};

export async function listCashMovements(
  tx: Tx,
  workspaceId: string,
  filter: { accountId?: string | null; from?: string | null; to?: string | null; limit?: number; offset?: number } = {},
): Promise<CashMovementRow[]> {
  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;
  return tx<CashMovementRow[]>`
    select m.id, m.business_date::text, m.kind::text, m.signed_amount::text, a.name as account_name,
      m.description, m.created_at::text
    from public.cash_movements m
    join public.cash_accounts a on a.workspace_id = m.workspace_id and a.id = m.cash_account_id
    where m.workspace_id = ${workspaceId}
      and (${filter.accountId ?? null}::uuid is null or m.cash_account_id = ${filter.accountId ?? null}::uuid)
      and (${filter.from ?? null}::date is null or m.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or m.business_date <= ${filter.to ?? null}::date)
    order by m.business_date desc, m.created_at desc
    limit ${limit} offset ${offset}
  `;
}

/**
 * Reverses a general income/expense by appending an opposite cash movement and
 * a dated reversal event. The original row is never modified (blueprint §9.5).
 */
export async function reverseFinancialTransaction(
  tx: Tx,
  input: { workspaceId: string; transactionId: string; businessDate: string; reason: string },
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("Alasan koreksi wajib diisi.");

  const rows = await tx<{ id: string; business_date: string; cash_account_id: string; amount: string; kind: TransactionKind }[]>`
    select id, business_date::text, cash_account_id, amount::text, kind
    from public.financial_transactions where workspace_id = ${input.workspaceId} and id = ${input.transactionId}
    for update
  `;
  const transaction = rows[0];
  if (!transaction) throw new NotFoundError("Transaksi tidak ditemukan.");
  if (input.businessDate < transaction.business_date) {
    throw new ValidationError("Tanggal koreksi tidak boleh lebih awal dari tanggal transaksi.");
  }
  const already = await tx<{ id: string }[]>`
    select id from public.financial_transaction_reversals
    where workspace_id = ${input.workspaceId} and transaction_id = ${input.transactionId}
  `;
  if (already.length > 0) throw new ConflictError("Transaksi ini sudah dikoreksi.");

  await tx`
    insert into public.financial_transaction_reversals (workspace_id, transaction_id, business_date, reason)
    values (${input.workspaceId}, ${input.transactionId}, ${input.businessDate}::date, ${reason})
  `;

  const movements = await tx<{ id: string }[]>`
    select id from public.cash_movements
    where workspace_id = ${input.workspaceId} and financial_transaction_id = ${input.transactionId}
  `;
  const movement = movements[0];
  if (!movement) throw new ConflictError("Pergerakan kas transaksi tidak ditemukan.");
  const signed = transaction.kind === "income" ? `-${transaction.amount}` : transaction.amount;

  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, reversal_of, description)
    values (${input.workspaceId}, ${transaction.cash_account_id}, ${input.businessDate}::date, 'reversal',
      ${signed}, ${movement.id}, ${`Koreksi transaksi: ${reason}`})
  `;
}

/** Reverses a transfer: both legs plus any linked fee, on one business date. */
export async function reverseTransfer(
  tx: Tx,
  input: { workspaceId: string; transferId: string; businessDate: string; reason: string },
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("Alasan koreksi wajib diisi.");

  const rows = await tx<{ id: string; business_date: string }[]>`
    select id, business_date::text from public.cash_transfers
    where workspace_id = ${input.workspaceId} and id = ${input.transferId} for update
  `;
  const transfer = rows[0];
  if (!transfer) throw new NotFoundError("Transfer tidak ditemukan.");
  if (input.businessDate < transfer.business_date) {
    throw new ValidationError("Tanggal koreksi tidak boleh lebih awal dari tanggal transfer.");
  }
  const already = await tx<{ id: string }[]>`
    select id from public.cash_transfer_reversals
    where workspace_id = ${input.workspaceId} and transfer_id = ${input.transferId}
  `;
  if (already.length > 0) throw new ConflictError("Transfer ini sudah dikoreksi.");

  // Reverse the linked fee first so the deferred integrity trigger passes.
  const fees = await tx<{ id: string }[]>`
    select id from public.financial_transactions
    where workspace_id = ${input.workspaceId} and related_transfer_id = ${input.transferId}
  `;
  for (const fee of fees) {
    await reverseFinancialTransaction(tx, {
      workspaceId: input.workspaceId,
      transactionId: fee.id,
      businessDate: input.businessDate,
      reason: `Koreksi biaya transfer: ${reason}`,
    });
  }

  await tx`
    insert into public.cash_transfer_reversals (workspace_id, transfer_id, business_date, reason)
    values (${input.workspaceId}, ${input.transferId}, ${input.businessDate}::date, ${reason})
  `;

  const movements = await tx<{ id: string; cash_account_id: string; signed_amount: string }[]>`
    select id, cash_account_id, signed_amount::text from public.cash_movements
    where workspace_id = ${input.workspaceId} and cash_transfer_id = ${input.transferId}
    order by kind
  `;
  if (movements.length !== 2) throw new ConflictError("Pergerakan kas transfer tidak lengkap.");

  for (const movement of movements) {
    await tx`
      insert into public.cash_movements
        (workspace_id, cash_account_id, business_date, kind, signed_amount, reversal_of, description)
      values (${input.workspaceId}, ${movement.cash_account_id}, ${input.businessDate}::date, 'reversal',
        ${(-BigInt(movement.signed_amount)).toString()}, ${movement.id}, ${`Koreksi transfer: ${reason}`})
    `;
  }
}

export function transferFeeNote(fee: bigint): string {
  return fee > 0n ? `Biaya transfer ${formatIDR(fee)} dicatat sebagai pengeluaran terpisah.` : "Tanpa biaya transfer.";
}
