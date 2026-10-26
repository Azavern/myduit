import "server-only";

import type { Tx } from "@/server/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { formatIDR } from "@/lib/money";

export type InvoiceLockRow = {
  id: string;
  customer_id: string | null;
  business_date: string;
  total_amount: string;
  paid: string;
  voided: boolean;
};

export type AllocationInput = { invoiceId: string; amount: bigint };

/**
 * Locks the referenced invoices in a deterministic UUID order so concurrent
 * payments cannot over-allocate (blueprint §9.3). Balances are re-read after
 * the lock is held — never trusted from the UI.
 */
export async function lockInvoices(tx: Tx, workspaceId: string, invoiceIds: string[]): Promise<InvoiceLockRow[]> {
  if (invoiceIds.length === 0) return [];
  const uniqueIds = [...new Set(invoiceIds)].sort();
  await tx`
    select id from public.sales_invoices
    where workspace_id = ${workspaceId} and id in ${tx(uniqueIds)}
    order by id
    for update
  `;
  return tx<InvoiceLockRow[]>`
    select i.id, i.customer_id, i.business_date::text as business_date, i.total_amount::text,
      coalesce((
        select sum(a.amount) from public.payment_allocations a
        where a.workspace_id = i.workspace_id and a.invoice_id = i.id
          and not exists (select 1 from public.payment_reversals r
            where r.workspace_id = a.workspace_id and r.payment_id = a.payment_id)
      ), 0)::text as paid,
      exists (select 1 from public.invoice_void_events v
        where v.workspace_id = i.workspace_id and v.invoice_id = i.id) as voided
    from public.sales_invoices i
    where i.workspace_id = ${workspaceId} and i.id in ${tx(uniqueIds)} and i.status = 'final'
    order by i.id
  `;
}

export type InsertPaymentInput = {
  workspaceId: string;
  customerId: string | null;
  businessDate: string;
  amount: bigint;
  cashAccountId: string;
  paymentMethodId: string;
  reference?: string | null;
  notes?: string | null;
  allocations: AllocationInput[];
};

export type InsertPaymentResult = { paymentId: string; number: string };

/**
 * Creates a payment, its allocations and exactly one incoming cash movement in
 * the caller's transaction. The sum of allocations must equal the payment.
 */
export async function insertPayment(tx: Tx, input: InsertPaymentInput): Promise<InsertPaymentResult> {
  if (input.amount <= 0n) throw new ValidationError("Nominal pembayaran harus lebih dari nol.");
  if (input.allocations.length === 0) throw new ValidationError("Pembayaran harus dialokasikan ke minimal satu tagihan.");

  const totalAllocated = input.allocations.reduce((sum, allocation) => sum + allocation.amount, 0n);
  if (totalAllocated !== input.amount) {
    throw new ValidationError("Jumlah alokasi harus sama dengan nominal pembayaran.");
  }

  const invoices = await lockInvoices(
    tx,
    input.workspaceId,
    input.allocations.map((allocation) => allocation.invoiceId),
  );
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  if (invoices.length !== input.allocations.length) {
    throw new NotFoundError("Salah satu tagihan tidak ditemukan atau belum final.");
  }

  for (const allocation of input.allocations) {
    if (allocation.amount <= 0n) throw new ValidationError("Nilai alokasi harus lebih dari nol.");
    const invoice = byId.get(allocation.invoiceId);
    if (!invoice) throw new NotFoundError("Tagihan alokasi tidak ditemukan.");
    if (invoice.voided) throw new ConflictError("Tagihan sudah dibatalkan dan tidak dapat menerima pembayaran.");
    if (invoice.customer_id !== input.customerId) {
      throw new ValidationError("Alokasi hanya boleh untuk tagihan milik pelanggan yang sama.");
    }
    if (input.businessDate < invoice.business_date) {
      throw new ValidationError("Tanggal pembayaran tidak boleh lebih awal dari tanggal tagihan.");
    }
    const balance = BigInt(invoice.total_amount) - BigInt(invoice.paid);
    if (allocation.amount > balance) {
      throw new ValidationError(
        `Alokasi melebihi sisa tagihan. Maksimum yang dapat dialokasikan adalah ${formatIDR(balance)}.`,
      );
    }
  }

  if (input.customerId === null && input.allocations.length !== 1) {
    throw new ValidationError("Pembayaran tanpa pelanggan hanya boleh dialokasikan ke satu tagihan tunai.");
  }

  const numbers = await tx<{ number: string }[]>`
    select app_private.next_document_number(${input.workspaceId}::uuid, 'payment', ${input.businessDate}::date) as number
  `;
  const number = numbers[0]!.number;

  const inserted = await tx<{ id: string }[]>`
    insert into public.payments
      (workspace_id, customer_id, number, business_date, amount, cash_account_id, payment_method_id, reference, notes)
    values (${input.workspaceId}, ${input.customerId}, ${number}, ${input.businessDate}::date,
      ${input.amount.toString()}, ${input.cashAccountId}, ${input.paymentMethodId},
      ${input.reference?.trim() || null}, ${input.notes?.trim() || null})
    returning id
  `;
  const paymentId = inserted[0]!.id;

  for (const allocation of input.allocations) {
    await tx`
      insert into public.payment_allocations (workspace_id, payment_id, invoice_id, amount)
      values (${input.workspaceId}, ${paymentId}, ${allocation.invoiceId}, ${allocation.amount.toString()})
    `;
  }

  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, payment_id, description)
    values (${input.workspaceId}, ${input.cashAccountId}, ${input.businessDate}::date, 'payment',
      ${input.amount.toString()}, ${paymentId}, ${`Penerimaan ${number}`})
  `;

  return { paymentId, number };
}

export type PaymentRow = {
  id: string;
  number: string;
  business_date: string;
  amount: string;
  customer_id: string | null;
  customer_name: string | null;
  account_name: string;
  method_name: string;
  reversed: boolean;
  allocation_count: string;
};

export async function listPayments(
  tx: Tx,
  workspaceId: string,
  filter: { from?: string; to?: string; customerId?: string; limit?: number; offset?: number; search?: string | null } = {},
): Promise<{ rows: PaymentRow[]; total: number }> {
  const search = filter.search?.trim() ? `%${filter.search.trim().toLowerCase()}%` : null;
  const limit = filter.limit ?? 25;
  const offset = filter.offset ?? 0;
  const rows = await tx<PaymentRow[]>`
    select p.id, p.number, p.business_date::text, p.amount::text, p.customer_id, c.name as customer_name,
      a.name as account_name, pm.name as method_name,
      exists (select 1 from public.payment_reversals r where r.workspace_id = p.workspace_id and r.payment_id = p.id) as reversed,
      (select count(*)::text from public.payment_allocations al where al.workspace_id = p.workspace_id and al.payment_id = p.id) as allocation_count
    from public.payments p
    left join public.customers c on c.workspace_id = p.workspace_id and c.id = p.customer_id
    join public.cash_accounts a on a.workspace_id = p.workspace_id and a.id = p.cash_account_id
    join public.payment_methods pm on pm.workspace_id = p.workspace_id and pm.id = p.payment_method_id
    where p.workspace_id = ${workspaceId}
      and (${filter.from ?? null}::date is null or p.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or p.business_date <= ${filter.to ?? null}::date)
      and (${filter.customerId ?? null}::uuid is null or p.customer_id = ${filter.customerId ?? null}::uuid)
      and (${search}::text is null or lower(p.number) like ${search}::text or lower(coalesce(c.name,'')) like ${search}::text)
    order by p.business_date desc, p.created_at desc
    limit ${limit} offset ${offset}
  `;
  const totals = await tx<{ count: string }[]>`
    select count(*)::text as count from public.payments p
    left join public.customers c on c.workspace_id = p.workspace_id and c.id = p.customer_id
    where p.workspace_id = ${workspaceId}
      and (${filter.from ?? null}::date is null or p.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or p.business_date <= ${filter.to ?? null}::date)
      and (${filter.customerId ?? null}::uuid is null or p.customer_id = ${filter.customerId ?? null}::uuid)
      and (${search}::text is null or lower(p.number) like ${search}::text or lower(coalesce(c.name,'')) like ${search}::text)
  `;
  return { rows, total: Number(totals[0]?.count ?? "0") };
}

export type PaymentAllocationRow = {
  invoice_id: string;
  invoice_number: string;
  business_date: string;
  amount: string;
};

export async function getPaymentAllocations(tx: Tx, workspaceId: string, paymentId: string): Promise<PaymentAllocationRow[]> {
  return tx<PaymentAllocationRow[]>`
    select al.invoice_id, i.number as invoice_number, i.business_date::text, al.amount::text
    from public.payment_allocations al
    join public.sales_invoices i on i.workspace_id = al.workspace_id and i.id = al.invoice_id
    where al.workspace_id = ${workspaceId} and al.payment_id = ${paymentId}
    order by i.business_date, i.number
  `;
}

/**
 * Reverses an entire payment (P0 policy): a dated reversal event plus a
 * negative cash movement. The original payment and allocations remain as
 * history (blueprint §9.5).
 */
export async function reversePayment(
  tx: Tx,
  input: { workspaceId: string; paymentId: string; businessDate: string; reason: string },
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("Alasan pembalikan wajib diisi.");

  const payments = await tx<{ id: string; business_date: string; amount: string; cash_account_id: string; customer_id: string | null }[]>`
    select id, business_date::text, amount::text, cash_account_id, customer_id
    from public.payments where workspace_id = ${input.workspaceId} and id = ${input.paymentId}
  `;
  const payment = payments[0];
  if (!payment) throw new NotFoundError("Pembayaran tidak ditemukan.");

  const existing = await tx<{ id: string }[]>`
    select id from public.payment_reversals where workspace_id = ${input.workspaceId} and payment_id = ${input.paymentId}
  `;
  if (existing.length > 0) throw new ConflictError("Pembayaran ini sudah dibalikkan.");

  if (input.businessDate < payment.business_date) {
    throw new ValidationError("Tanggal pembalikan tidak boleh lebih awal dari tanggal pembayaran.");
  }

  // Lock the touched invoices in a stable order, same protocol as recording.
  const allocationInvoices = await tx<{ invoice_id: string }[]>`
    select invoice_id from public.payment_allocations
    where workspace_id = ${input.workspaceId} and payment_id = ${input.paymentId}
  `;
  await lockInvoices(
    tx,
    input.workspaceId,
    allocationInvoices.map((row) => row.invoice_id),
  );

  await tx`
    insert into public.payment_reversals (workspace_id, payment_id, business_date, reason)
    values (${input.workspaceId}, ${input.paymentId}, ${input.businessDate}::date, ${reason})
  `;

  const movements = await tx<{ id: string }[]>`
    select id from public.cash_movements
    where workspace_id = ${input.workspaceId} and payment_id = ${input.paymentId} and kind = 'payment'
  `;
  const movement = movements[0];
  if (!movement) throw new ConflictError("Pergerakan kas pembayaran tidak ditemukan.");

  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, reversal_of, description)
    values (${input.workspaceId}, ${payment.cash_account_id}, ${input.businessDate}::date, 'reversal',
      ${(-BigInt(payment.amount)).toString()}, ${movement.id}, ${`Pembalikan pembayaran: ${reason}`})
  `;
}
