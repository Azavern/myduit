import "server-only";

import type { Tx } from "@/server/db/client";
import { AGING_BUCKETS, agingBucket, type AgingBucket } from "@/lib/dates";

/*
 * Reporting semantics (documented in docs/data-model.md):
 * - Penjualan periode  : final invoices with business_date in range, excluding
 *                        voids effective on or before the period end.
 * - Kas masuk periode  : positive movements of kinds payment/income/reversal.
 * - Kas keluar periode : absolute negative movements of kinds expense/reversal.
 * - Saldo kas          : sum of every movement up to the cutoff (includes opening).
 * - Piutang            : sum of open balances as of the cutoff. Transfers and
 *                        opening movements are excluded from operating flows.
 */

export type CashFlowPoint = { bucket: string; inflow: string; outflow: string };
export type CategoryTotal = { name: string; amount: string; kind: string };
export type AgingRow = { bucket: AgingBucket; label: string; amount: string; count: string };
export type DueInvoice = {
  invoice_id: string;
  number: string;
  customer_name: string | null;
  due_date: string | null;
  balance: string;
};

export type DashboardData = {
  sales: string;
  salesCount: string;
  cashIn: string;
  cashOut: string;
  netCash: string;
  cashBalance: string;
  receivable: string;
  overdue: string;
  unpaidCount: string;
  cashFlow: CashFlowPoint[];
  salesVsReceipts: { bucket: string; sales: string; receipts: string }[];
  expenseByCategory: CategoryTotal[];
  aging: AgingRow[];
  dueSoon: DueInvoice[];
};

export async function getDashboard(
  tx: Tx,
  workspaceId: string,
  range: { from: string; to: string; cutoff: string },
): Promise<DashboardData> {
  const sales = await tx<{ total: string; count: string }[]>`
    select coalesce(sum(i.total_amount), 0)::text as total, count(*)::text as count
    from public.sales_invoices i
    where i.workspace_id = ${workspaceId} and i.status = 'final'
      and i.business_date between ${range.from}::date and ${range.to}::date
      and not exists (select 1 from public.invoice_void_events v
        where v.workspace_id = i.workspace_id and v.invoice_id = i.id and v.business_date <= ${range.to}::date)
  `;

  const flow = await tx<{ inflow: string; outflow: string }[]>`
    select
      coalesce(sum(case when signed_amount > 0 and kind in ('payment','income','reversal') then signed_amount else 0 end), 0)::text as inflow,
      coalesce(sum(case when signed_amount < 0 and kind in ('expense','reversal') then -signed_amount else 0 end), 0)::text as outflow
    from public.cash_movements
    where workspace_id = ${workspaceId} and business_date between ${range.from}::date and ${range.to}::date
  `;

  const balance = await tx<{ balance: string }[]>`
    select coalesce(sum(signed_amount), 0)::text as balance
    from public.cash_movements
    where workspace_id = ${workspaceId} and business_date <= ${range.cutoff}::date
  `;

  const receivable = await tx<{ total: string; count: string; overdue: string }[]>`
    select
      coalesce(sum(balance) filter (where balance > 0), 0)::text as total,
      count(*) filter (where balance > 0)::text as count,
      coalesce(sum(balance) filter (where balance > 0 and due_date is not null and due_date < ${range.cutoff}::date), 0)::text as overdue
    from app_private.invoice_balances_as_of(${workspaceId}::uuid, ${range.cutoff}::date)
  `;

  const cashFlow = await tx<CashFlowPoint[]>`
    select business_date::text as bucket,
      coalesce(sum(case when signed_amount > 0 and kind in ('payment','income','reversal') then signed_amount else 0 end), 0)::text as inflow,
      coalesce(sum(case when signed_amount < 0 and kind in ('expense','reversal') then -signed_amount else 0 end), 0)::text as outflow
    from public.cash_movements
    where workspace_id = ${workspaceId} and business_date between ${range.from}::date and ${range.to}::date
    group by business_date
    order by business_date
  `;

  const salesVsReceipts = await tx<{ bucket: string; sales: string; receipts: string }[]>`
    with months as (
      select generate_series(date_trunc('month', ${range.from}::date), date_trunc('month', ${range.to}::date), interval '1 month')::date as bucket
    )
    select m.bucket::text as bucket,
      coalesce((
        select sum(i.total_amount) from public.sales_invoices i
        where i.workspace_id = ${workspaceId} and i.status = 'final'
          and date_trunc('month', i.business_date) = m.bucket
          and not exists (select 1 from public.invoice_void_events v
            where v.workspace_id = i.workspace_id and v.invoice_id = i.id and v.business_date <= ${range.to}::date)
      ), 0)::text as sales,
      coalesce((
        select sum(mv.signed_amount) from public.cash_movements mv
        where mv.workspace_id = ${workspaceId} and mv.kind = 'payment'
          and date_trunc('month', mv.business_date) = m.bucket
      ), 0)::text as receipts
    from months m
    order by m.bucket
  `;

  const expenseByCategory = await tx<CategoryTotal[]>`
    select c.name as name, t.kind::text as kind, sum(t.amount)::text as amount
    from public.financial_transactions t
    join public.categories c on c.workspace_id = t.workspace_id and c.id = t.category_id
    where t.workspace_id = ${workspaceId} and t.kind = 'expense'
      and t.business_date between ${range.from}::date and ${range.to}::date
      and not exists (select 1 from public.financial_transaction_reversals r
        where r.workspace_id = t.workspace_id and r.transaction_id = t.id and r.business_date <= ${range.to}::date)
    group by c.name, t.kind
    order by sum(t.amount) desc
    limit 8
  `;

  const openInvoices = await tx<{ balance: string; due_date: string | null }[]>`
    select balance::text, due_date::text
    from app_private.invoice_balances_as_of(${workspaceId}::uuid, ${range.cutoff}::date)
    where balance > 0
  `;

  const agingMap = new Map<AgingBucket, { amount: bigint; count: bigint }>();
  for (const bucket of AGING_BUCKETS) agingMap.set(bucket.key, { amount: 0n, count: 0n });
  for (const invoice of openInvoices) {
    const bucket = agingBucket(invoice.due_date, range.cutoff);
    const entry = agingMap.get(bucket)!;
    entry.amount += BigInt(invoice.balance);
    entry.count += 1n;
  }
  const aging: AgingRow[] = AGING_BUCKETS.map((bucket) => ({
    bucket: bucket.key,
    label: bucket.label,
    amount: (agingMap.get(bucket.key)?.amount ?? 0n).toString(),
    count: (agingMap.get(bucket.key)?.count ?? 0n).toString(),
  }));

  const dueSoon = await tx<DueInvoice[]>`
    select b.invoice_id, b.number, c.name as customer_name, b.due_date::text, b.balance::text
    from app_private.invoice_balances_as_of(${workspaceId}::uuid, ${range.cutoff}::date) b
    left join public.customers c on c.workspace_id = ${workspaceId} and c.id = b.customer_id
    where b.balance > 0
    order by b.due_date nulls last, b.business_date
    limit 5
  `;

  const inflow = BigInt(flow[0]?.inflow ?? "0");
  const outflow = BigInt(flow[0]?.outflow ?? "0");
  return {
    sales: sales[0]?.total ?? "0",
    salesCount: sales[0]?.count ?? "0",
    cashIn: inflow.toString(),
    cashOut: outflow.toString(),
    netCash: (inflow - outflow).toString(),
    cashBalance: balance[0]?.balance ?? "0",
    receivable: receivable[0]?.total ?? "0",
    overdue: receivable[0]?.overdue ?? "0",
    unpaidCount: receivable[0]?.count ?? "0",
    cashFlow,
    salesVsReceipts,
    expenseByCategory,
    aging,
    dueSoon,
  };
}

export type SalesReportRow = {
  bucket: string;
  invoices: string;
  sales: string;
  receipts: string;
};

export async function getSalesReport(
  tx: Tx,
  workspaceId: string,
  range: { from: string; to: string },
  granularity: "day" | "month",
): Promise<{ rows: SalesReportRow[]; totalSales: string; totalReceipts: string }> {
  const unit = granularity === "month" ? "month" : "day";
  const rows = await tx<SalesReportRow[]>`
    with buckets as (
      select generate_series(date_trunc(${unit}::text, ${range.from}::date), date_trunc(${unit}::text, ${range.to}::date),
        ('1 ' || ${unit}::text)::interval)::date as bucket
    )
    select b.bucket::text as bucket,
      coalesce((select count(*) from public.sales_invoices i
        where i.workspace_id = ${workspaceId} and i.status = 'final'
          and date_trunc(${unit}::text, i.business_date) = b.bucket
          and not exists (select 1 from public.invoice_void_events v
            where v.workspace_id = i.workspace_id and v.invoice_id = i.id and v.business_date <= ${range.to}::date)), 0)::text as invoices,
      coalesce((select sum(i.total_amount) from public.sales_invoices i
        where i.workspace_id = ${workspaceId} and i.status = 'final'
          and date_trunc(${unit}::text, i.business_date) = b.bucket
          and not exists (select 1 from public.invoice_void_events v
            where v.workspace_id = i.workspace_id and v.invoice_id = i.id and v.business_date <= ${range.to}::date)), 0)::text as sales,
      coalesce((select sum(m.signed_amount) from public.cash_movements m
        where m.workspace_id = ${workspaceId} and m.kind = 'payment'
          and date_trunc(${unit}::text, m.business_date) = b.bucket), 0)::text as receipts
    from buckets b
    order by b.bucket
  `;
  const totalSales = rows.reduce((sum, row) => sum + BigInt(row.sales), 0n);
  const totalReceipts = rows.reduce((sum, row) => sum + BigInt(row.receipts), 0n);
  return { rows, totalSales: totalSales.toString(), totalReceipts: totalReceipts.toString() };
}

export type ReceivableRow = {
  invoice_id: string;
  number: string;
  customer_name: string | null;
  business_date: string;
  due_date: string | null;
  total_amount: string;
  paid_amount: string;
  balance: string;
  bucket: AgingBucket;
};

export async function getReceivables(
  tx: Tx,
  workspaceId: string,
  cutoff: string,
  filter: { customerId?: string | null; bucket?: AgingBucket | null } = {},
): Promise<{ rows: ReceivableRow[]; total: string; overdue: string; byBucket: AgingRow[] }> {
  const raw = await tx<
    { invoice_id: string; customer_name: string | null; number: string; business_date: string; due_date: string | null; total_amount: string; paid_amount: string; balance: string }[]
  >`
    select b.invoice_id, c.name as customer_name, b.number, b.business_date::text, b.due_date::text,
      b.total_amount::text, b.paid_amount::text, b.balance::text
    from app_private.invoice_balances_as_of(${workspaceId}::uuid, ${cutoff}::date) b
    left join public.customers c on c.workspace_id = ${workspaceId} and c.id = b.customer_id
    where b.balance > 0
      and (${filter.customerId ?? null}::uuid is null or b.customer_id = ${filter.customerId ?? null}::uuid)
    order by b.due_date nulls last, b.business_date
  `;
  const rows: ReceivableRow[] = raw.map((row) => ({ ...row, bucket: agingBucket(row.due_date, cutoff) }));
  const filtered = filter.bucket ? rows.filter((row) => row.bucket === filter.bucket) : rows;

  const bucketMap = new Map<AgingBucket, { amount: bigint; count: bigint }>();
  for (const bucket of AGING_BUCKETS) bucketMap.set(bucket.key, { amount: 0n, count: 0n });
  for (const row of rows) {
    const entry = bucketMap.get(row.bucket)!;
    entry.amount += BigInt(row.balance);
    entry.count += 1n;
  }
  const byBucket: AgingRow[] = AGING_BUCKETS.map((bucket) => ({
    bucket: bucket.key,
    label: bucket.label,
    amount: (bucketMap.get(bucket.key)?.amount ?? 0n).toString(),
    count: (bucketMap.get(bucket.key)?.count ?? 0n).toString(),
  }));

  const total = rows.reduce((sum, row) => sum + BigInt(row.balance), 0n);
  const overdue = rows
    .filter((row) => row.bucket !== "not_due")
    .reduce((sum, row) => sum + BigInt(row.balance), 0n);
  return { rows: filtered, total: total.toString(), overdue: overdue.toString(), byBucket };
}

export type CashFlowRow = {
  bucket: string;
  opening: string;
  inflow: string;
  outflow: string;
  closing: string;
};

export async function getCashFlow(
  tx: Tx,
  workspaceId: string,
  range: { from: string; to: string },
  accountId: string | null,
  granularity: "day" | "month",
): Promise<{ rows: CashFlowRow[]; byAccount: { account_name: string; opening: string; inflow: string; outflow: string; closing: string }[] }> {
  const unit = granularity === "month" ? "month" : "day";
  const rows = await tx<CashFlowRow[]>`
    with buckets as (
      select generate_series(date_trunc(${unit}::text, ${range.from}::date), date_trunc(${unit}::text, ${range.to}::date),
        ('1 ' || ${unit}::text)::interval)::date as bucket
    ),
    movement as (
      select m.business_date, m.signed_amount::numeric as amount,
        case when m.signed_amount > 0 then m.signed_amount else 0 end as inflow,
        case when m.signed_amount < 0 then -m.signed_amount else 0 end as outflow
      from public.cash_movements m
      where m.workspace_id = ${workspaceId}
        and (${accountId ?? null}::uuid is null or m.cash_account_id = ${accountId ?? null}::uuid)
    )
    select b.bucket::text as bucket,
      coalesce((select sum(amount) from movement where business_date < b.bucket), 0)::text as opening,
      coalesce((select sum(inflow) from movement where business_date = b.bucket), 0)::text as inflow,
      coalesce((select sum(outflow) from movement where business_date = b.bucket), 0)::text as outflow,
      coalesce((select sum(amount) from movement where business_date <= b.bucket), 0)::text as closing
    from buckets b
    order by b.bucket
  `;

  const byAccount = await tx<{ account_name: string; opening: string; inflow: string; outflow: string; closing: string }[]>`
    select a.name as account_name,
      coalesce(sum(m.signed_amount) filter (where m.business_date < ${range.from}::date), 0)::text as opening,
      coalesce(sum(m.signed_amount) filter (where m.signed_amount > 0 and m.business_date between ${range.from}::date and ${range.to}::date), 0)::text as inflow,
      coalesce(sum(-m.signed_amount) filter (where m.signed_amount < 0 and m.business_date between ${range.from}::date and ${range.to}::date), 0)::text as outflow,
      coalesce(sum(m.signed_amount) filter (where m.business_date <= ${range.to}::date), 0)::text as closing
    from public.cash_accounts a
    left join public.cash_movements m on m.workspace_id = a.workspace_id and m.cash_account_id = a.id
    where a.workspace_id = ${workspaceId} and (${accountId ?? null}::uuid is null or a.id = ${accountId ?? null}::uuid)
    group by a.id, a.name
    order by lower(a.name)
  `;

  return { rows, byAccount };
}

export type ReceiptRow = {
  payment_id: string;
  number: string;
  business_date: string;
  customer_name: string | null;
  amount: string;
  account_name: string;
  method_name: string;
  reversed: boolean;
};

export async function getReceipts(
  tx: Tx,
  workspaceId: string,
  range: { from: string; to: string },
  filter: { customerId?: string | null } = {},
): Promise<{ rows: ReceiptRow[]; total: string }> {
  const rows = await tx<ReceiptRow[]>`
    select p.id as payment_id, p.number, p.business_date::text, c.name as customer_name, p.amount::text,
      a.name as account_name, pm.name as method_name,
      exists (select 1 from public.payment_reversals r
        where r.workspace_id = p.workspace_id and r.payment_id = p.id and r.business_date <= ${range.to}::date) as reversed
    from public.payments p
    left join public.customers c on c.workspace_id = p.workspace_id and c.id = p.customer_id
    join public.cash_accounts a on a.workspace_id = p.workspace_id and a.id = p.cash_account_id
    join public.payment_methods pm on pm.workspace_id = p.workspace_id and pm.id = p.payment_method_id
    where p.workspace_id = ${workspaceId}
      and p.business_date between ${range.from}::date and ${range.to}::date
      and (${filter.customerId ?? null}::uuid is null or p.customer_id = ${filter.customerId ?? null}::uuid)
    order by p.business_date, p.number
  `;
  const total = rows.reduce((sum, row) => (row.reversed ? sum : sum + BigInt(row.amount)), 0n);
  return { rows, total: total.toString() };
}
