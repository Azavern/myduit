import "server-only";

import type { Tx } from "@/server/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { lineGross } from "@/lib/money";

export type CategoryKind = "sale" | "income" | "expense";
export type AccountKind = "cash" | "bank" | "ewallet" | "other";
export type ProductKind = "goods" | "service";

/* ------------------------------------------------------------------ */
/* Kategori                                                            */
/* ------------------------------------------------------------------ */

export type CategoryRow = {
  id: string;
  name: string;
  code: string | null;
  kind: CategoryKind;
  color: string | null;
  active: boolean;
};

export async function listCategories(
  tx: Tx,
  workspaceId: string,
  filter: { kind?: CategoryKind; activeOnly?: boolean; search?: string | null } = {},
): Promise<CategoryRow[]> {
  const search = filter.search?.trim() ? `%${filter.search.trim().toLowerCase()}%` : null;
  return tx<CategoryRow[]>`
    select id, name, code, kind, color, active
    from public.categories
    where workspace_id = ${workspaceId}
      and (${filter.kind ?? null}::public.category_kind is null or kind = ${filter.kind ?? null}::public.category_kind)
      and (${filter.activeOnly ?? false} = false or active)
      and (${search}::text is null or lower(name) like ${search}::text)
    order by kind, lower(name)
  `;
}

export async function createCategory(
  tx: Tx,
  workspaceId: string,
  input: { name: string; kind: CategoryKind; code?: string | null; color?: string | null; icon?: string | null },
): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1) throw new ValidationError("Nama kategori wajib diisi.");
  const rows = await tx<{ id: string }[]>`
    insert into public.categories (workspace_id, name, code, kind, color, icon)
    values (${workspaceId}, ${name}, ${input.code?.trim() || null}, ${input.kind}::public.category_kind,
      ${input.color ?? null}, ${input.icon ?? null})
    returning id
  `;
  return rows[0]!.id;
}

export async function updateCategory(
  tx: Tx,
  workspaceId: string,
  id: string,
  input: { name?: string; code?: string | null; color?: string | null; active?: boolean },
): Promise<void> {
  const current = await tx<{ name: string; code: string | null; color: string | null; active: boolean }[]>`
    select name, code, color, active from public.categories where workspace_id = ${workspaceId} and id = ${id}
  `;
  const row = current[0];
  if (!row) throw new NotFoundError("Kategori tidak ditemukan.");
  const name = input.name?.trim() ?? row.name;
  const code = input.code === undefined ? row.code : input.code;
  const color = input.color === undefined ? row.color : input.color;
  const active = input.active ?? row.active;
  if (!name) throw new ValidationError("Nama kategori wajib diisi.");
  await tx`
    update public.categories set name = ${name}, code = ${code}, color = ${color}, active = ${active}, updated_at = now()
    where workspace_id = ${workspaceId} and id = ${id}
  `;
}

/* ------------------------------------------------------------------ */
/* Metode pembayaran                                                   */
/* ------------------------------------------------------------------ */

export type PaymentMethodRow = { id: string; name: string; code: string; active: boolean };

export async function listPaymentMethods(tx: Tx, workspaceId: string, activeOnly = false): Promise<PaymentMethodRow[]> {
  return tx<PaymentMethodRow[]>`
    select id, name, code, active from public.payment_methods
    where workspace_id = ${workspaceId} and (${activeOnly} = false or active)
    order by lower(name)
  `;
}

export async function createPaymentMethod(
  tx: Tx,
  workspaceId: string,
  input: { name: string; code: string; active?: boolean },
): Promise<string> {
  const name = input.name.trim();
  const code = input.code.trim().toLowerCase().replace(/\s+/g, "_");
  if (!name || !code) throw new ValidationError("Nama dan kode metode pembayaran wajib diisi.");
  const rows = await tx<{ id: string }[]>`
    insert into public.payment_methods (workspace_id, name, code, active)
    values (${workspaceId}, ${name}, ${code}, ${input.active ?? true})
    returning id
  `;
  return rows[0]!.id;
}

export async function setPaymentMethodActive(tx: Tx, workspaceId: string, id: string, active: boolean): Promise<void> {
  await tx`
    update public.payment_methods set active = ${active}, updated_at = now()
    where workspace_id = ${workspaceId} and id = ${id}
  `;
}

/* ------------------------------------------------------------------ */
/* Pelanggan                                                           */
/* ------------------------------------------------------------------ */

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  open_invoices: string;
  receivable: string;
  last_transaction: string | null;
};

export async function listCustomers(
  tx: Tx,
  workspaceId: string,
  filter: { search?: string | null; activeOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: CustomerListRow[]; total: number }> {
  const search = filter.search?.trim() ? `%${filter.search.trim().toLowerCase()}%` : null;
  const limit = filter.limit ?? 25;
  const offset = filter.offset ?? 0;
  const rows = await tx<CustomerListRow[]>`
    select c.id, c.name, c.phone, c.active,
      coalesce(inv.open_invoices, 0)::text as open_invoices,
      coalesce(inv.receivable, 0)::text as receivable,
      inv.last_transaction::text as last_transaction
    from public.customers c
    left join lateral (
      select
        count(*) filter (where x.balance > 0) as open_invoices,
        coalesce(sum(x.balance) filter (where x.balance > 0), 0) as receivable,
        max(x.business_date) as last_transaction
      from (
        select i.business_date, i.total_amount - coalesce((
          select sum(a.amount) from public.payment_allocations a
          where a.workspace_id = i.workspace_id and a.invoice_id = i.id
            and not exists (select 1 from public.payment_reversals r
              where r.workspace_id = a.workspace_id and r.payment_id = a.payment_id)
        ), 0) as balance
        from public.sales_invoices i
        where i.workspace_id = c.workspace_id and i.customer_id = c.id and i.status = 'final'
          and not exists (select 1 from public.invoice_void_events v
            where v.workspace_id = i.workspace_id and v.invoice_id = i.id)
      ) x
    ) inv on true
    where c.workspace_id = ${workspaceId}
      and (${filter.activeOnly ?? false} = false or c.active)
      and (${search}::text is null or lower(c.name) like ${search}::text or coalesce(c.phone,'') like ${search}::text)
    order by lower(c.name)
    limit ${limit} offset ${offset}
  `;
  const totals = await tx<{ count: string }[]>`
    select count(*)::text as count from public.customers c
    where c.workspace_id = ${workspaceId}
      and (${filter.activeOnly ?? false} = false or c.active)
      and (${search}::text is null or lower(c.name) like ${search}::text or coalesce(c.phone,'') like ${search}::text)
  `;
  return { rows, total: Number(totals[0]?.count ?? "0") };
}

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
};

export async function getCustomer(tx: Tx, workspaceId: string, id: string): Promise<CustomerDetail | null> {
  const rows = await tx<CustomerDetail[]>`
    select id, name, phone, email, address, notes, active
    from public.customers where workspace_id = ${workspaceId} and id = ${id}
  `;
  return rows[0] ?? null;
}

export async function createCustomer(
  tx: Tx,
  workspaceId: string,
  input: { name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Nama pelanggan wajib diisi.");
  const duplicate = await tx<{ id: string }[]>`
    select id from public.customers
    where workspace_id = ${workspaceId} and lower(name) = lower(${name})
      and (${input.phone?.trim() || null}::text is null or phone = ${input.phone?.trim() || null})
  `;
  if (duplicate.length > 0) {
    throw new ConflictError("Pelanggan dengan nama serupa sudah ada. Buka data lama atau ubah nama.");
  }
  const rows = await tx<{ id: string }[]>`
    insert into public.customers (workspace_id, name, phone, email, address, notes)
    values (${workspaceId}, ${name}, ${input.phone?.trim() || null}, ${input.email?.trim() || null},
      ${input.address?.trim() || null}, ${input.notes?.trim() || null})
    returning id
  `;
  return rows[0]!.id;
}

export async function updateCustomer(
  tx: Tx,
  workspaceId: string,
  id: string,
  input: { name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; active?: boolean },
): Promise<void> {
  const current = await tx<{ name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; active: boolean }[]>`
    select name, phone, email, address, notes, active from public.customers
    where workspace_id = ${workspaceId} and id = ${id}
  `;
  const row = current[0];
  if (!row) throw new NotFoundError("Pelanggan tidak ditemukan.");
  const name = input.name?.trim() ?? row.name;
  if (!name) throw new ValidationError("Nama pelanggan wajib diisi.");
  await tx`
    update public.customers set
      name = ${name},
      phone = ${(input.phone === undefined ? row.phone : input.phone)?.trim() || null},
      email = ${(input.email === undefined ? row.email : input.email)?.trim() || null},
      address = ${(input.address === undefined ? row.address : input.address)?.trim() || null},
      notes = ${(input.notes === undefined ? row.notes : input.notes)?.trim() || null},
      active = ${input.active ?? row.active},
      updated_at = now()
    where workspace_id = ${workspaceId} and id = ${id}
  `;
}

/* ------------------------------------------------------------------ */
/* Produk dan satuan                                                   */
/* ------------------------------------------------------------------ */

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  product_kind: ProductKind;
  base_unit: string;
  base_price: string;
  description: string | null;
  active: boolean;
};

export type UnitOptionRow = {
  id: string;
  product_id: string;
  name: string;
  conversion_factor: string;
  price: string;
  active: boolean;
};

export async function listProducts(
  tx: Tx,
  workspaceId: string,
  filter: { search?: string | null; activeOnly?: boolean; productKind?: ProductKind; limit?: number; offset?: number } = {},
): Promise<{ rows: ProductRow[]; units: UnitOptionRow[]; total: number }> {
  const search = filter.search?.trim() ? `%${filter.search.trim().toLowerCase()}%` : null;
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const rows = await tx<ProductRow[]>`
    select id, name, sku, product_kind, base_unit, base_price::text, description, active
    from public.products
    where workspace_id = ${workspaceId}
      and (${filter.activeOnly ?? false} = false or active)
      and (${filter.productKind ?? null}::text is null or product_kind = ${filter.productKind ?? null})
      and (${search}::text is null or lower(name) like ${search}::text or lower(coalesce(sku,'')) like ${search}::text)
    order by lower(name)
    limit ${limit} offset ${offset}
  `;
  const ids = rows.map((row) => row.id);
  const units = ids.length
    ? await tx<UnitOptionRow[]>`
        select id, product_id, name, conversion_factor::text, price::text, active
        from public.product_unit_options where workspace_id = ${workspaceId} and product_id in ${tx(ids)}
        order by conversion_factor
      `
    : [];
  const totals = await tx<{ count: string }[]>`
    select count(*)::text as count from public.products
    where workspace_id = ${workspaceId}
      and (${filter.activeOnly ?? false} = false or active)
      and (${filter.productKind ?? null}::text is null or product_kind = ${filter.productKind ?? null})
      and (${search}::text is null or lower(name) like ${search}::text or lower(coalesce(sku,'')) like ${search}::text)
  `;
  return { rows, units, total: Number(totals[0]?.count ?? "0") };
}

export async function getProduct(tx: Tx, workspaceId: string, id: string): Promise<{ product: ProductRow; units: UnitOptionRow[] } | null> {
  const rows = await tx<ProductRow[]>`
    select id, name, sku, product_kind, base_unit, base_price::text, description, active
    from public.products where workspace_id = ${workspaceId} and id = ${id}
  `;
  const product = rows[0];
  if (!product) return null;
  const units = await tx<UnitOptionRow[]>`
    select id, product_id, name, conversion_factor::text, price::text, active
    from public.product_unit_options where workspace_id = ${workspaceId} and product_id = ${id} order by conversion_factor
  `;
  return { product, units };
}

export type ProductInput = {
  name: string;
  sku?: string | null;
  productKind: ProductKind;
  baseUnit: string;
  basePrice: bigint;
  description?: string | null;
  units: { name: string; conversionFactor: string; price: bigint; active?: boolean }[];
};

export async function createProduct(tx: Tx, workspaceId: string, input: ProductInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Nama produk wajib diisi.");
  if (!input.baseUnit.trim()) throw new ValidationError("Satuan dasar wajib diisi.");
  const rows = await tx<{ id: string }[]>`
    insert into public.products (workspace_id, name, sku, product_kind, base_unit, base_price, description)
    values (${workspaceId}, ${name}, ${input.sku?.trim() || null}, ${input.productKind}, ${input.baseUnit.trim()},
      ${input.basePrice.toString()}, ${input.description?.trim() || null})
    returning id
  `;
  const productId = rows[0]!.id;
  await replaceUnitOptions(tx, workspaceId, productId, input.units);
  return productId;
}

export async function updateProduct(
  tx: Tx,
  workspaceId: string,
  id: string,
  input: ProductInput & { active?: boolean },
): Promise<void> {
  const rows = await tx<{ id: string }[]>`
    update public.products set
      name = ${input.name.trim()},
      sku = ${input.sku?.trim() || null},
      product_kind = ${input.productKind},
      base_unit = ${input.baseUnit.trim()},
      base_price = ${input.basePrice.toString()},
      description = ${input.description?.trim() || null},
      active = coalesce(${input.active ?? null}::boolean, active),
      updated_at = now()
    where workspace_id = ${workspaceId} and id = ${id}
    returning id
  `;
  if (rows.length === 0) throw new NotFoundError("Produk tidak ditemukan.");
  await replaceUnitOptions(tx, workspaceId, id, input.units);
}

export async function setProductActive(tx: Tx, workspaceId: string, id: string, active: boolean): Promise<void> {
  await tx`
    update public.products set active = ${active}, updated_at = now()
    where workspace_id = ${workspaceId} and id = ${id}
  `;
}

async function replaceUnitOptions(
  tx: Tx,
  workspaceId: string,
  productId: string,
  units: ProductInput["units"],
): Promise<void> {
  // Unit options are referenced by historical invoice lines, so deactivate
  // rather than delete, then upsert by (name).
  await tx`
    update public.product_unit_options set active = false, updated_at = now()
    where workspace_id = ${workspaceId} and product_id = ${productId}
  `;
  for (const unit of units) {
    const name = unit.name.trim();
    if (!name) continue;
    await tx`
      insert into public.product_unit_options (workspace_id, product_id, name, conversion_factor, price, active)
      values (${workspaceId}, ${productId}, ${name}, ${unit.conversionFactor}::numeric, ${unit.price.toString()}, ${unit.active ?? true})
      on conflict (workspace_id, product_id, name) do update set
        conversion_factor = excluded.conversion_factor,
        price = excluded.price,
        active = excluded.active,
        updated_at = now()
    `;
  }
}

export function productUnitPrice(
  product: { base_price: string },
  unit: { price: string } | undefined,
): bigint {
  return BigInt(unit?.price ?? product.base_price);
}

export { lineGross };

/* ------------------------------------------------------------------ */
/* Akun kas                                                            */
/* ------------------------------------------------------------------ */

export type CashAccountRow = {
  id: string;
  name: string;
  kind: AccountKind;
  opening_date: string;
  active: boolean;
  balance: string;
};

export async function listCashAccounts(tx: Tx, workspaceId: string, activeOnly = false): Promise<CashAccountRow[]> {
  return tx<CashAccountRow[]>`
    select a.id, a.name, a.kind, a.opening_date::text, a.active,
      coalesce(sum(m.signed_amount), 0)::text as balance
    from public.cash_accounts a
    left join public.cash_movements m on m.workspace_id = a.workspace_id and m.cash_account_id = a.id
    where a.workspace_id = ${workspaceId} and (${activeOnly} = false or a.active)
    group by a.id
    order by lower(a.name)
  `;
}

export async function createCashAccount(
  tx: Tx,
  workspaceId: string,
  input: { name: string; kind: AccountKind; openingDate: string; openingBalance: bigint; reference?: string | null; notes?: string | null },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Nama akun wajib diisi.");
  const rows = await tx<{ id: string }[]>`
    insert into public.cash_accounts (workspace_id, name, kind, opening_date, reference, notes)
    values (${workspaceId}, ${name}, ${input.kind}, ${input.openingDate}::date,
      ${input.reference?.trim() || null}, ${input.notes?.trim() || null})
    returning id
  `;
  const accountId = rows[0]!.id;
  // Every account needs exactly one opening movement, even when the balance is
  // zero (blueprint §9.1). It is added once here and never summed twice.
  await tx`
    insert into public.cash_movements
      (workspace_id, cash_account_id, business_date, kind, signed_amount, opening_account_id, description)
    values (${workspaceId}, ${accountId}, ${input.openingDate}::date, 'opening', ${input.openingBalance.toString()},
      ${accountId}, 'Saldo awal akun')
  `;
  return accountId;
}

export async function setCashAccountActive(tx: Tx, workspaceId: string, id: string, active: boolean): Promise<void> {
  await tx`
    update public.cash_accounts set active = ${active}, updated_at = now()
    where workspace_id = ${workspaceId} and id = ${id}
  `;
}
