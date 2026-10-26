import "server-only";

import type { Tx } from "@/server/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { formatIDR, isValidQuantity, normalizeQuantity } from "@/lib/money";
import { calcInvoiceTotals, calcLine, type DiscountKind, type PaymentStatus, paymentStatus } from "@/lib/invoice";
import { insertPayment } from "@/server/services/payments";

export type InvoiceStatus = "draft" | "final";

export type InvoiceListRow = {
  id: string;
  number: string | null;
  business_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: string;
  balance: string;
  voided: boolean;
  line_count: string;
  creator: string;
};

export type InvoiceListFilter = {
  from?: string | null;
  to?: string | null;
  customerId?: string | null;
  paymentState?: "all" | "unpaid" | "partial" | "paid" | "overdue" | "void" | "draft";
  search?: string | null;
  sortKey?: number;
  limit?: number;
  offset?: number;
};

/**
 * `sortKey` maps to a fixed ORDER BY expression, never to interpolated SQL
 * identifiers (blueprint §10).
 */
const INVOICE_SORT = {
  date_desc: 1,
  date_asc: 2,
  total_desc: 3,
  balance_desc: 4,
  due_asc: 5,
  customer_asc: 6,
} as const;

export function invoiceSortKey(value: string | null | undefined): number {
  if (value && value in INVOICE_SORT) return INVOICE_SORT[value as keyof typeof INVOICE_SORT];
  return INVOICE_SORT.date_desc;
}

export async function listInvoices(
  tx: Tx,
  workspaceId: string,
  filter: InvoiceListFilter = {},
): Promise<{ rows: InvoiceListRow[]; total: number }> {
  const search = filter.search?.trim() ? `%${filter.search.trim().toLowerCase()}%` : null;
  const limit = filter.limit ?? 25;
  const offset = filter.offset ?? 0;
  const sortKey = filter.sortKey ?? INVOICE_SORT.date_desc;
  const paymentState = filter.paymentState ?? "all";

  const rows = await tx<InvoiceListRow[]>`
    with base as (
      select i.id, i.number, i.business_date, i.due_date, i.status, i.customer_id,
        c.name as customer_name, i.total_amount::text as total_amount,
        (i.total_amount - coalesce((
          select sum(a.amount) from public.payment_allocations a
          where a.workspace_id = i.workspace_id and a.invoice_id = i.id
            and not exists (select 1 from public.payment_reversals r
              where r.workspace_id = a.workspace_id and r.payment_id = a.payment_id)
        ), 0))::text as balance,
        exists (select 1 from public.invoice_void_events v
          where v.workspace_id = i.workspace_id and v.invoice_id = i.id) as voided,
        (select count(*)::text from public.sales_invoice_lines l
          where l.workspace_id = i.workspace_id and l.invoice_id = i.id) as line_count,
        coalesce(u.display_name, '—') as creator,
        i.created_at
      from public.sales_invoices i
      left join public.customers c on c.workspace_id = i.workspace_id and c.id = i.customer_id
      left join public.users u on u.id = i.created_by
      where i.workspace_id = ${workspaceId}
    )
    select x.id, x.number, x.business_date::text, x.due_date::text, x.status, x.customer_id, x.customer_name,
      x.total_amount, x.balance, x.voided, x.line_count, x.creator
    from base x
    where (${filter.from ?? null}::date is null or x.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or x.business_date <= ${filter.to ?? null}::date)
      and (${filter.customerId ?? null}::uuid is null or x.customer_id = ${filter.customerId ?? null}::uuid)
      and (${search}::text is null or lower(coalesce(x.number,'')) like ${search}::text
        or lower(coalesce(x.customer_name,'')) like ${search}::text)
      and (${paymentState} = 'all'
        or (${paymentState} = 'draft' and x.status = 'draft')
        or (${paymentState} = 'void' and x.voided)
        or (${paymentState} = 'unpaid' and x.status = 'final' and not x.voided and x.balance::numeric = x.total_amount::numeric)
        or (${paymentState} = 'partial' and x.status = 'final' and not x.voided and x.balance::numeric > 0 and x.balance::numeric < x.total_amount::numeric)
        or (${paymentState} = 'paid' and x.status = 'final' and not x.voided and x.balance::numeric <= 0)
        or (${paymentState} = 'overdue' and x.status = 'final' and not x.voided and x.balance::numeric > 0 and x.due_date is not null and x.due_date < current_date))
    order by
      case when ${sortKey}::int = 1 then x.business_date end desc,
      case when ${sortKey}::int = 2 then x.business_date end asc,
      case when ${sortKey}::int = 3 then x.total_amount::numeric end desc,
      case when ${sortKey}::int = 4 then x.balance::numeric end desc,
      case when ${sortKey}::int = 5 then x.due_date end asc,
      case when ${sortKey}::int = 6 then lower(coalesce(x.customer_name,'')) end asc,
      x.business_date desc, x.id desc
    limit ${limit} offset ${offset}
  `;

  const totals = await tx<{ count: string }[]>`
    with base as (
      select i.id, i.business_date, i.due_date, i.status, i.customer_id, i.total_amount,
        (i.total_amount - coalesce((
          select sum(a.amount) from public.payment_allocations a
          where a.workspace_id = i.workspace_id and a.invoice_id = i.id
            and not exists (select 1 from public.payment_reversals r
              where r.workspace_id = a.workspace_id and r.payment_id = a.payment_id)
        ), 0)) as balance,
        exists (select 1 from public.invoice_void_events v
          where v.workspace_id = i.workspace_id and v.invoice_id = i.id) as voided,
        c.name as customer_name
      from public.sales_invoices i
      left join public.customers c on c.workspace_id = i.workspace_id and c.id = i.customer_id
      where i.workspace_id = ${workspaceId}
    )
    select count(*)::text as count from base x
    where (${filter.from ?? null}::date is null or x.business_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or x.business_date <= ${filter.to ?? null}::date)
      and (${filter.customerId ?? null}::uuid is null or x.customer_id = ${filter.customerId ?? null}::uuid)
      and (${search}::text is null or lower(coalesce(x.number,'')) like ${search}::text
        or lower(coalesce(x.customer_name,'')) like ${search}::text)
      and (${paymentState} = 'all'
        or (${paymentState} = 'draft' and x.status = 'draft')
        or (${paymentState} = 'void' and x.voided)
        or (${paymentState} = 'unpaid' and x.status = 'final' and not x.voided and x.balance::numeric = x.total_amount::numeric)
        or (${paymentState} = 'partial' and x.status = 'final' and not x.voided and x.balance::numeric > 0 and x.balance::numeric < x.total_amount::numeric)
        or (${paymentState} = 'paid' and x.status = 'final' and not x.voided and x.balance::numeric <= 0)
        or (${paymentState} = 'overdue' and x.status = 'final' and not x.voided and x.balance > 0 and x.due_date is not null and x.due_date < current_date))
  `;
  return { rows, total: Number(totals[0]?.count ?? "0") };
}

export type InvoiceLineRow = {
  id: string;
  line_number: number;
  product_id: string;
  unit_option_id: string | null;
  product_name: string;
  unit_name: string;
  conversion_factor: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  subtotal: string;
};

export type InvoiceDetail = {
  id: string;
  number: string | null;
  business_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  customer_id: string | null;
  customer_name: string | null;
  notes: string | null;
  subtotal: string;
  discount_kind: DiscountKind;
  discount_basis_points: number;
  discount_amount: string;
  additional_fee: string;
  additional_fee_label: string | null;
  total_amount: string;
  paid_amount: string;
  balance: string;
  override_reason: string | null;
  finalized_at: string | null;
  voided: boolean;
  void_business_date: string | null;
  void_reason: string | null;
  creator: string;
  payment_state: PaymentStatus;
  lines: InvoiceLineRow[];
  allocations: {
    payment_id: string;
    payment_number: string;
    business_date: string;
    amount: string;
    reversed: boolean;
  }[];
};

export async function getInvoiceDetail(tx: Tx, workspaceId: string, invoiceId: string): Promise<InvoiceDetail | null> {
  const headers = await tx<
    {
      id: string;
      number: string | null;
      business_date: string;
      due_date: string | null;
      status: InvoiceStatus;
      customer_id: string | null;
      customer_name: string | null;
      notes: string | null;
      subtotal: string;
      discount_kind: DiscountKind;
      discount_basis_points: number;
      discount_amount: string;
      additional_fee: string;
      additional_fee_label: string | null;
      total_amount: string;
      paid_amount: string;
      override_reason: string | null;
      finalized_at: string | null;
      voided: boolean;
      void_business_date: string | null;
      void_reason: string | null;
      creator: string;
    }[]
  >`
    select i.id, i.number, i.business_date::text, i.due_date::text, i.status, i.customer_id,
      c.name as customer_name, i.notes, i.subtotal::text, i.discount_kind, i.discount_basis_points,
      i.discount_amount::text, i.additional_fee::text, i.additional_fee_label, i.total_amount::text,
      coalesce((
        select sum(a.amount) from public.payment_allocations a
        where a.workspace_id = i.workspace_id and a.invoice_id = i.id
          and not exists (select 1 from public.payment_reversals r
            where r.workspace_id = a.workspace_id and r.payment_id = a.payment_id)
      ), 0)::text as paid_amount,
      i.override_reason, i.finalized_at::text,
      (v.id is not null) as voided, v.business_date::text as void_business_date, v.reason as void_reason,
      coalesce(u.display_name, '—') as creator
    from public.sales_invoices i
    left join public.customers c on c.workspace_id = i.workspace_id and c.id = i.customer_id
    left join public.invoice_void_events v on v.workspace_id = i.workspace_id and v.invoice_id = i.id
    left join public.users u on u.id = i.created_by
    where i.workspace_id = ${workspaceId} and i.id = ${invoiceId}
  `;
  const header = headers[0];
  if (!header) return null;

  const lines = await tx<InvoiceLineRow[]>`
    select id, line_number, product_id, unit_option_id, product_name, unit_name,
      conversion_factor::text, quantity::text, unit_price::text, discount_amount::text, subtotal::text
    from public.sales_invoice_lines
    where workspace_id = ${workspaceId} and invoice_id = ${invoiceId}
    order by line_number
  `;

  const allocations = await tx<
    { payment_id: string; payment_number: string; business_date: string; amount: string; reversed: boolean }[]
  >`
    select a.payment_id, p.number as payment_number, p.business_date::text, a.amount::text,
      exists (select 1 from public.payment_reversals r
        where r.workspace_id = p.workspace_id and r.payment_id = p.id) as reversed
    from public.payment_allocations a
    join public.payments p on p.workspace_id = a.workspace_id and p.id = a.payment_id
    where a.workspace_id = ${workspaceId} and a.invoice_id = ${invoiceId}
    order by p.business_date, p.number
  `;

  const total = BigInt(header.total_amount);
  const paid = BigInt(header.paid_amount);
  return {
    ...header,
    balance: (total - paid).toString(),
    payment_state: paymentStatus(header.status, total, paid, header.voided),
    lines,
    allocations,
  };
}

/* ------------------------------------------------------------------ */
/* Simpan / finalisasi                                                 */
/* ------------------------------------------------------------------ */

export type InvoiceLineInput = {
  productId: string;
  unitOptionId: string | null;
  quantity: string;
  unitPrice: string;
  discountKind: DiscountKind;
  discountAmount: string;
  discountBasisPoints: number;
};

export type SaveInvoiceInput = {
  workspaceId: string;
  timezone: string;
  invoiceId?: string | null;
  customerId: string | null;
  businessDate: string;
  dueDate: string | null;
  notes?: string | null;
  discountKind: DiscountKind;
  discountBasisPoints: number;
  discountAmount: string;
  additionalFee: string;
  additionalFeeLabel?: string | null;
  overrideReason?: string | null;
  lines: InvoiceLineInput[];
  finalize: boolean;
  deposit?: { amount: string; cashAccountId: string; paymentMethodId: string; reference?: string | null } | null;
};

export type SaveInvoiceResult = { invoiceId: string; number: string | null; finalized: boolean };

type ProductSnapshot = {
  product_id: string;
  product_name: string;
  unit_name: string;
  conversion_factor: string;
  default_price: string;
  active: boolean;
  unit_active: boolean;
  resolved_unit_option_id: string | null;
};

async function loadProductSnapshots(
  tx: Tx,
  workspaceId: string,
  lines: InvoiceLineInput[],
): Promise<Map<string, ProductSnapshot>> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  if (productIds.length === 0) return new Map();
  const rows = await tx<
    {
      product_id: string;
      product_name: string;
      base_unit: string;
      base_price: string;
      product_active: boolean;
      unit_id: string | null;
      unit_name: string | null;
      conversion_factor: string | null;
      unit_price: string | null;
      unit_active: boolean | null;
    }[]
  >`
    select p.id as product_id, p.name as product_name, p.base_unit, p.base_price::text, p.active as product_active,
      u.id as unit_id, u.name as unit_name, u.conversion_factor::text, u.price::text, u.active as unit_active
    from public.products p
    left join public.product_unit_options u on u.workspace_id = p.workspace_id and u.product_id = p.id
    where p.workspace_id = ${workspaceId} and p.id in ${tx(productIds)}
  `;

  const snapshots = new Map<string, ProductSnapshot>();
  for (const row of rows) {
    const key = `${row.product_id}:${row.unit_id ?? "base"}`;
    snapshots.set(key, {
      product_id: row.product_id,
      product_name: row.product_name,
      unit_name: row.unit_name ?? row.base_unit,
      conversion_factor: row.conversion_factor ?? "1",
      default_price: row.unit_price ?? row.base_price,
      active: row.product_active,
      unit_active: row.unit_active ?? true,
      resolved_unit_option_id: row.unit_id,
    });
    if (!snapshots.has(`${row.product_id}:product`)) {
      snapshots.set(`${row.product_id}:product`, {
        product_id: row.product_id,
        product_name: row.product_name,
        unit_name: row.base_unit,
        conversion_factor: "1",
        default_price: row.base_price,
        active: row.product_active,
        unit_active: true,
        resolved_unit_option_id: null,
      });
    }
  }
  return snapshots;
}

export async function saveInvoice(tx: Tx, input: SaveInvoiceInput): Promise<SaveInvoiceResult> {
  if (input.lines.length === 0) throw new ValidationError("Minimal satu baris produk diperlukan.");

  for (const line of input.lines) {
    if (!isValidQuantity(line.quantity)) throw new ValidationError("Kuantitas setiap baris harus lebih dari nol.");
  }

  const snapshots = await loadProductSnapshots(tx, input.workspaceId, input.lines);
  const computed: {
    snapshot: ProductSnapshot;
    quantity: string;
    unitPrice: bigint;
    discountKind: DiscountKind;
    discountAmount: bigint;
    discountBasisPoints: number;
    gross: bigint;
    subtotal: bigint;
  }[] = [];

  for (const line of input.lines) {
    const key = line.unitOptionId ? `${line.productId}:${line.unitOptionId}` : `${line.productId}:product`;
    const snapshot = snapshots.get(key) ?? snapshots.get(`${line.productId}:product`);
    if (!snapshot) throw new ValidationError("Produk pada salah satu baris tidak ditemukan di workspace ini.");
    const unitPrice = BigInt(line.unitPrice || snapshot.default_price);
    const quantity = normalizeQuantity(line.quantity);
    const calc = calcLine({
      quantity,
      unitPrice: unitPrice.toString(),
      discountKind: line.discountKind,
      discountAmount: line.discountAmount,
      discountBasisPoints: line.discountBasisPoints,
    });
    computed.push({
      snapshot,
      quantity,
      unitPrice,
      discountKind: line.discountKind,
      discountAmount: calc.discount,
      discountBasisPoints: line.discountKind === "percent" ? line.discountBasisPoints : 0,
      gross: calc.gross,
      subtotal: calc.subtotal,
    });
  }

  const totals = calcInvoiceTotals(
    computed.map((line) => ({ gross: line.gross, discount: line.discountAmount, subtotal: line.subtotal })),
    {
      discountKind: input.discountKind,
      discountAmount: input.discountAmount,
      discountBasisPoints: input.discountBasisPoints,
      additionalFee: input.additionalFee,
    },
  );

  if (input.finalize) {
    if (totals.total <= 0n) throw new ValidationError("Total tagihan final harus lebih dari nol.");
    if (input.dueDate && input.dueDate < input.businessDate) {
      throw new ValidationError("Jatuh tempo tidak boleh lebih awal dari tanggal transaksi.");
    }
  }

  const discountBasisPoints = input.discountKind === "percent" ? input.discountBasisPoints : 0;
  const discountAmount = input.discountKind === "none" ? 0n : totals.discountAmount;

  let invoiceId: string;
  if (input.invoiceId) {
    const current = await tx<{ status: InvoiceStatus }[]>`
      select status from public.sales_invoices where workspace_id = ${input.workspaceId} and id = ${input.invoiceId} for update
    `;
    if (!current[0]) throw new NotFoundError("Draft tagihan tidak ditemukan.");
    if (current[0].status !== "draft") throw new ConflictError("Dokumen final tidak dapat diubah. Gunakan void dan dokumen pengganti.");
    invoiceId = input.invoiceId;
    await tx`delete from public.sales_invoice_lines where workspace_id = ${input.workspaceId} and invoice_id = ${invoiceId}`;
    await tx`
      update public.sales_invoices set
        customer_id = ${input.customerId}, business_date = ${input.businessDate}::date, due_date = ${input.dueDate}::date,
        notes = ${input.notes?.trim() || null}, subtotal = ${totals.subtotal.toString()},
        discount_kind = ${input.discountKind}, discount_basis_points = ${discountBasisPoints},
        discount_amount = ${discountAmount.toString()}, additional_fee = ${totals.additionalFee.toString()},
        additional_fee_label = ${input.additionalFeeLabel?.trim() || null},
        total_amount = ${totals.total.toString()}, override_reason = ${input.overrideReason?.trim() || null}
      where workspace_id = ${input.workspaceId} and id = ${invoiceId}
    `;
  } else {
    const inserted = await tx<{ id: string }[]>`
      insert into public.sales_invoices
        (workspace_id, customer_id, business_date, due_date, notes, subtotal, discount_kind,
         discount_basis_points, discount_amount, additional_fee, additional_fee_label, total_amount, override_reason)
      values (${input.workspaceId}, ${input.customerId}, ${input.businessDate}::date, ${input.dueDate}::date,
        ${input.notes?.trim() || null}, ${totals.subtotal.toString()}, ${input.discountKind},
        ${discountBasisPoints}, ${discountAmount.toString()}, ${totals.additionalFee.toString()},
        ${input.additionalFeeLabel?.trim() || null}, ${totals.total.toString()}, ${input.overrideReason?.trim() || null})
      returning id
    `;
    invoiceId = inserted[0]!.id;
  }

  let lineNumber = 0;
  for (const line of computed) {
    lineNumber += 1;
    await tx`
      insert into public.sales_invoice_lines
        (workspace_id, invoice_id, line_number, product_id, unit_option_id, product_name, unit_name,
         conversion_factor, quantity, unit_price, gross_amount, discount_kind, discount_basis_points,
         discount_amount, subtotal)
      values (${input.workspaceId}, ${invoiceId}, ${lineNumber}, ${line.snapshot.product_id},
        ${line.snapshot.resolved_unit_option_id}, ${line.snapshot.product_name}, ${line.snapshot.unit_name},
        ${line.snapshot.conversion_factor}::numeric, ${line.quantity}::numeric, ${line.unitPrice.toString()},
        ${line.gross.toString()}, ${line.discountKind}, ${line.discountBasisPoints},
        ${line.discountAmount.toString()}, ${line.subtotal.toString()})
    `;
  }

  if (!input.finalize) {
    return { invoiceId, number: null, finalized: false };
  }

  const numbers = await tx<{ number: string }[]>`
    select app_private.next_document_number(${input.workspaceId}::uuid, 'invoice', ${input.businessDate}::date) as number
  `;
  const number = numbers[0]!.number;

  await tx`
    update public.sales_invoices set status = 'final', number = ${number}, finalized_at = now()
    where workspace_id = ${input.workspaceId} and id = ${invoiceId}
  `;

  const depositAmount = input.deposit ? BigInt(input.deposit.amount.replace(/\D/g, "") || "0") : 0n;
  if (input.deposit && depositAmount > 0n) {
    if (depositAmount > totals.total) {
      throw new ValidationError(`Uang muka tidak boleh melebihi total tagihan (${formatIDR(totals.total)}).`);
    }
    await insertPayment(tx, {
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      businessDate: input.businessDate,
      amount: depositAmount,
      cashAccountId: input.deposit.cashAccountId,
      paymentMethodId: input.deposit.paymentMethodId,
      reference: input.deposit.reference ?? null,
      notes: "Uang muka saat finalisasi penjualan",
      allocations: [{ invoiceId, amount: depositAmount }],
    });
  }

  return { invoiceId, number, finalized: true };
}

export async function voidInvoice(
  tx: Tx,
  input: { workspaceId: string; invoiceId: string; businessDate: string; reason: string },
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("Alasan pembatalan wajib diisi.");

  const [invoice] = await lockInvoicesForVoid(tx, input.workspaceId, input.invoiceId);
  if (!invoice) throw new NotFoundError("Tagihan final tidak ditemukan.");
  if (invoice.status !== "final") throw new ConflictError("Hanya tagihan final yang dapat dibatalkan.");
  if (invoice.voided) throw new ConflictError("Tagihan ini sudah dibatalkan.");
  if (BigInt(invoice.paid) !== 0n) {
    throw new ConflictError("Tagihan masih memiliki pembayaran efektif. Balikkan pembayaran terlebih dahulu, lalu batalkan.");
  }
  if (input.businessDate < invoice.business_date) {
    throw new ValidationError("Tanggal pembatalan tidak boleh lebih awal dari tanggal tagihan.");
  }

  await tx`
    insert into public.invoice_void_events (workspace_id, invoice_id, business_date, reason)
    values (${input.workspaceId}, ${input.invoiceId}, ${input.businessDate}::date, ${reason})
  `;
}

async function lockInvoicesForVoid(
  tx: Tx,
  workspaceId: string,
  invoiceId: string,
): Promise<{ status: InvoiceStatus; business_date: string; paid: string; voided: boolean }[]> {
  return tx<{ status: InvoiceStatus; business_date: string; paid: string; voided: boolean }[]>`
    select i.status, i.business_date::text, coalesce((
      select sum(a.amount) from public.payment_allocations a
      where a.workspace_id = i.workspace_id and a.invoice_id = i.id
        and not exists (select 1 from public.payment_reversals r
          where r.workspace_id = a.workspace_id and r.payment_id = a.payment_id)
    ), 0)::text as paid,
    exists (select 1 from public.invoice_void_events v
      where v.workspace_id = i.workspace_id and v.invoice_id = i.id) as voided
    from public.sales_invoices i
    where i.workspace_id = ${workspaceId} and i.id = ${invoiceId}
    for update
  `;
}

export type OpenInvoiceRow = {
  invoice_id: string;
  number: string;
  business_date: string;
  due_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: string;
  paid_amount: string;
  balance: string;
};

/** Open invoices as of a cutoff, used by receivables and payment allocation. */
export async function listOpenInvoices(
  tx: Tx,
  workspaceId: string,
  options: { cutoff: string; customerId?: string | null; limit?: number; offset?: number } = { cutoff: "2100-01-01" },
): Promise<OpenInvoiceRow[]> {
  const cutoff = options.cutoff;
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  return tx<OpenInvoiceRow[]>`
    select b.invoice_id, b.number, b.business_date::text, b.due_date::text, b.customer_id,
      c.name as customer_name, b.total_amount::text, b.paid_amount::text, b.balance::text
    from app_private.invoice_balances_as_of(${workspaceId}::uuid, ${cutoff}::date) b
    left join public.customers c on c.workspace_id = ${workspaceId} and c.id = b.customer_id
    where b.balance > 0
      and (${options.customerId ?? null}::uuid is null or b.customer_id = ${options.customerId ?? null}::uuid)
    order by b.due_date nulls last, b.business_date, b.number
    limit ${limit} offset ${offset}
  `;
}
