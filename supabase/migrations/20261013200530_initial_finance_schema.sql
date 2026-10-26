-- Initial P0 schema. Timestamp uses UTC; authored 2026-10-14 Asia/Makassar.
-- Canonical migration runner: Supabase CLI. Never use drizzle push/migrate here.
-- No auth.users/auth.uid(), default user, password, or provider key.
-- Runtime role starts NOLOGIN. A separate local provisioning script sets its password.
-- Execute as the trusted Supabase migration owner (postgres, with BYPASSRLS).

create schema app_private;
revoke all on schema app_private from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'finance_runtime') then
    create role finance_runtime nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  else
    -- Roles are cluster-wide and can survive a local db reset. Preserve its password.
    if exists(select 1 from pg_roles where rolname='finance_runtime' and
      (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls or rolinherit))
      or exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='finance_runtime'))
      or exists(select 1 from pg_class where relowner=(select oid from pg_roles where rolname='finance_runtime'))
      or exists(select 1 from pg_namespace where nspowner=(select oid from pg_roles where rolname='finance_runtime')) then
      raise exception 'Existing finance_runtime is privileged or owns objects; operator review required';
    end if;
  end if;
  if not (select rolbypassrls or rolsuper from pg_roles where rolname = current_user) then
    raise exception 'Migration owner must have BYPASSRLS for internal auth/policy helpers';
  end if;
end $$;

-- (Additional trigger functions appear after the auth helpers below.)

create type public.membership_role as enum ('owner','admin','finance','cashier','viewer');
create type public.member_status as enum ('active','disabled');
create type public.category_kind as enum ('sale','income','expense');
create type public.account_kind as enum ('cash','bank','ewallet','other');
create type public.invoice_status as enum ('draft','final');
create type public.transaction_kind as enum ('income','expense');
create type public.movement_kind as enum
  ('opening','payment','income','expense','transfer_in','transfer_out','reversal');
create domain public.idr_amount as bigint check (value between 0 and 1000000000000);
create domain public.positive_idr_amount as bigint check (value between 1 and 1000000000000);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 254),
  email_normalized text not null unique,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  password_hash text not null check (length(password_hash) between 32 and 1024),
  status public.member_status not null default 'active',
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_normalized_email check (email_normalized = lower(btrim(email)))
);
comment on table public.users is 'Custom application identities. No dependency on Supabase Auth. Never expose password_hash in application DTOs.';

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  currency text not null default 'IDR' check (currency = 'IDR'),
  timezone text not null default 'Asia/Makassar',
  template_code text not null default 'sales_receivables' check (template_code in
    ('sales_receivables','simple_cashbook','small_business','freelancer','household','project_event')),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  archived_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  role public.membership_role not null,
  status public.member_status not null default 'active',
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,user_id)
);
create unique index memberships_one_active_owner on public.workspace_memberships(workspace_id)
  where role = 'owner' and status = 'active';
create index memberships_user_workspace on public.workspace_memberships(user_id,workspace_id,status);

create table app_private.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null, idle_timeout_seconds integer not null default 86400
    check (idle_timeout_seconds between 300 and 86400),
  revoked_at timestamptz, check (expires_at > created_at)
);
create index sessions_user on app_private.sessions(user_id);
create index sessions_expiry on app_private.sessions(expires_at);
create table app_private.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null, consumed_at timestamptz,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(), check (expires_at > created_at)
);
create index reset_user on app_private.password_reset_tokens(user_id);
create index reset_expiry on app_private.password_reset_tokens(expires_at);
create table app_private.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  role public.membership_role not null check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null, accepted_at timestamptz, revoked_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(), check (expires_at > created_at)
);
create index invitations_workspace on app_private.workspace_invitations(workspace_id);
create index invitations_expiry on app_private.workspace_invitations(expires_at);
create table app_private.auth_rate_limits (
  bucket_key text primary key check (bucket_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0), expires_at timestamptz not null,
  check (expires_at > window_started_at)
);
create index rate_limits_expiry on app_private.auth_rate_limits(expires_at);

create table public.categories (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  code text, kind public.category_kind not null, color text, icon text, active boolean not null default true,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,kind,name)
);
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  code text not null check (length(code) between 1 and 40), active boolean not null default true,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,code)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  phone text, email text, address text, notes text, active boolean not null default true,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id)
);
create index customers_workspace_name on public.customers(workspace_id,lower(name));
create table public.products (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 160), sku text,
  product_kind text not null check (product_kind in ('goods','service')),
  base_unit text not null check (length(btrim(base_unit)) between 1 and 40),
  base_price public.idr_amount not null, description text, active boolean not null default true,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id)
);
create unique index products_sku on public.products(workspace_id,lower(sku)) where sku is not null;
create index products_workspace_name on public.products(workspace_id,lower(name));
create table public.product_unit_options (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  product_id uuid not null, name text not null check (length(btrim(name)) between 1 and 40),
  conversion_factor numeric(18,6) not null check (conversion_factor > 0 and conversion_factor < 1000000000000),
  price public.idr_amount not null, active boolean not null default true,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,product_id,name),
  unique (workspace_id,product_id,id),
  foreign key (workspace_id,product_id) references public.products(workspace_id,id) on delete restrict
);
create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check (length(btrim(name)) between 1 and 120), kind public.account_kind not null,
  opening_date date not null, reference text, notes text, active boolean not null default true,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,name)
);
create table public.document_counters (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  document_kind text not null check (document_kind in ('invoice','payment','transaction','transfer')),
  document_year integer not null check (document_year between 2000 and 9999),
  last_value bigint not null default 0 check (last_value >= 0),
  unique (workspace_id,id), unique (workspace_id,document_kind,document_year)
);
create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  customer_id uuid, number text, business_date date not null, due_date date,
  status public.invoice_status not null default 'draft', notes text,
  subtotal public.idr_amount not null default 0,
  discount_kind text not null default 'none' check (discount_kind in ('none','amount','percent')),
  discount_basis_points integer not null default 0 check (discount_basis_points between 0 and 10000),
  discount_amount public.idr_amount not null default 0,
  additional_fee public.idr_amount not null default 0, additional_fee_label text,
  total_amount public.idr_amount not null default 0,
  override_reason text, finalized_at timestamptz,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,number),
  foreign key (workspace_id,customer_id) references public.customers(workspace_id,id),
  check (due_date is null or due_date >= business_date),
  check (discount_amount <= subtotal),
  check (total_amount = subtotal - discount_amount + additional_fee),
  check ((discount_kind = 'none' and discount_amount = 0 and discount_basis_points = 0)
    or (discount_kind = 'amount' and discount_basis_points = 0)
    or (discount_kind = 'percent' and discount_amount = round(subtotal::numeric * discount_basis_points / 10000))),
  check (additional_fee = 0 or (additional_fee_label is not null and length(btrim(additional_fee_label)) > 0)),
  check ((status = 'draft' and finalized_at is null and number is null)
    or (status = 'final' and finalized_at is not null and number is not null and length(btrim(number)) > 0 and total_amount > 0))
);
create index invoices_date on public.sales_invoices(workspace_id,business_date,id);
create index invoices_customer on public.sales_invoices(workspace_id,customer_id,business_date);
create index invoices_due on public.sales_invoices(workspace_id,due_date) where status = 'final';
create table public.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  invoice_id uuid not null, line_number integer not null check (line_number > 0), product_id uuid not null,
  unit_option_id uuid, product_name text not null, unit_name text not null,
  conversion_factor numeric(18,6) not null check (conversion_factor > 0 and conversion_factor < 1000000000000),
  quantity numeric(18,6) not null check (quantity > 0 and quantity < 1000000000000), unit_price public.idr_amount not null,
  gross_amount public.idr_amount not null,
  discount_kind text not null default 'none' check (discount_kind in ('none','amount','percent')),
  discount_basis_points integer not null default 0 check (discount_basis_points between 0 and 10000),
  discount_amount public.idr_amount not null default 0, subtotal public.idr_amount not null,
  created_by uuid not null references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,invoice_id,line_number),
  foreign key (workspace_id,invoice_id) references public.sales_invoices(workspace_id,id) on delete cascade,
  foreign key (workspace_id,product_id) references public.products(workspace_id,id),
  foreign key (workspace_id,product_id,unit_option_id) references public.product_unit_options(workspace_id,product_id,id),
  check (gross_amount = round(quantity * unit_price::numeric)),
  check (discount_amount <= gross_amount and subtotal = gross_amount - discount_amount),
  check ((discount_kind = 'none' and discount_amount = 0 and discount_basis_points = 0)
    or (discount_kind = 'amount' and discount_basis_points = 0)
    or (discount_kind = 'percent' and discount_amount = round(gross_amount::numeric * discount_basis_points / 10000)))
);
create index invoice_lines_product on public.sales_invoice_lines(workspace_id,product_id);
create table public.payments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  customer_id uuid, number text not null, business_date date not null,
  amount public.positive_idr_amount not null, cash_account_id uuid not null, payment_method_id uuid not null,
  reference text, notes text,
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,number),
  foreign key (workspace_id,customer_id) references public.customers(workspace_id,id),
  foreign key (workspace_id,cash_account_id) references public.cash_accounts(workspace_id,id),
  foreign key (workspace_id,payment_method_id) references public.payment_methods(workspace_id,id)
);
create index payments_date on public.payments(workspace_id,business_date,id);
create index payments_customer on public.payments(workspace_id,customer_id);
create index payments_account on public.payments(workspace_id,cash_account_id);
create index payments_method on public.payments(workspace_id,payment_method_id);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  payment_id uuid not null, invoice_id uuid not null, amount public.positive_idr_amount not null,
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,payment_id,invoice_id),
  foreign key (workspace_id,payment_id) references public.payments(workspace_id,id),
  foreign key (workspace_id,invoice_id) references public.sales_invoices(workspace_id,id)
);
create index allocations_invoice on public.payment_allocations(workspace_id,invoice_id);
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  number text not null, kind public.transaction_kind not null, business_date date not null,
  category_id uuid not null, cash_account_id uuid not null, payment_method_id uuid,
  amount public.positive_idr_amount not null, description text not null check (length(btrim(description)) > 0),
  counterparty text, reference text, notes text, related_transfer_id uuid,
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,number),
  foreign key (workspace_id,category_id) references public.categories(workspace_id,id),
  foreign key (workspace_id,cash_account_id) references public.cash_accounts(workspace_id,id),
  foreign key (workspace_id,payment_method_id) references public.payment_methods(workspace_id,id),
  check (related_transfer_id is null or kind = 'expense')
);
create index transactions_date on public.financial_transactions(workspace_id,business_date,id);
create index transactions_category on public.financial_transactions(workspace_id,category_id);
create index transactions_account on public.financial_transactions(workspace_id,cash_account_id);
create index transactions_method on public.financial_transactions(workspace_id,payment_method_id);
create table public.cash_transfers (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  number text not null, source_account_id uuid not null, destination_account_id uuid not null,
  business_date date not null, amount public.positive_idr_amount not null,
  reference text, notes text,
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,number), check (source_account_id <> destination_account_id),
  foreign key (workspace_id,source_account_id) references public.cash_accounts(workspace_id,id),
  foreign key (workspace_id,destination_account_id) references public.cash_accounts(workspace_id,id)
);
alter table public.financial_transactions add foreign key (workspace_id,related_transfer_id)
  references public.cash_transfers(workspace_id,id);
create unique index transaction_one_transfer_fee on public.financial_transactions(workspace_id,related_transfer_id)
  where related_transfer_id is not null;
create index transfers_date on public.cash_transfers(workspace_id,business_date,id);
create index transfers_source on public.cash_transfers(workspace_id,source_account_id);
create index transfers_destination on public.cash_transfers(workspace_id,destination_account_id);
create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  payment_id uuid not null, business_date date not null, reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,payment_id),
  foreign key (workspace_id,payment_id) references public.payments(workspace_id,id)
);
create table public.invoice_void_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  invoice_id uuid not null, business_date date not null, reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,invoice_id),
  foreign key (workspace_id,invoice_id) references public.sales_invoices(workspace_id,id)
);
create table public.financial_transaction_reversals (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  transaction_id uuid not null, business_date date not null, reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,transaction_id),
  foreign key (workspace_id,transaction_id) references public.financial_transactions(workspace_id,id)
);
create table public.cash_transfer_reversals (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  transfer_id uuid not null, business_date date not null, reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id), unique (workspace_id,transfer_id),
  foreign key (workspace_id,transfer_id) references public.cash_transfers(workspace_id,id)
);
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  cash_account_id uuid not null, business_date date not null, kind public.movement_kind not null,
  signed_amount bigint not null check (signed_amount between -1000000000000 and 1000000000000),
  payment_id uuid, financial_transaction_id uuid, cash_transfer_id uuid, opening_account_id uuid,
  reversal_of uuid, description text,
  created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,cash_account_id) references public.cash_accounts(workspace_id,id),
  foreign key (workspace_id,payment_id) references public.payments(workspace_id,id),
  foreign key (workspace_id,financial_transaction_id) references public.financial_transactions(workspace_id,id),
  foreign key (workspace_id,cash_transfer_id) references public.cash_transfers(workspace_id,id),
  foreign key (workspace_id,opening_account_id) references public.cash_accounts(workspace_id,id),
  foreign key (workspace_id,reversal_of) references public.cash_movements(workspace_id,id),
  check (num_nonnulls(payment_id,financial_transaction_id,cash_transfer_id,opening_account_id,reversal_of) = 1),
  check ((kind = 'opening' and opening_account_id = cash_account_id and opening_account_id is not null)
    or (kind = 'payment' and payment_id is not null and signed_amount > 0)
    or (kind = 'income' and financial_transaction_id is not null and signed_amount > 0)
    or (kind = 'expense' and financial_transaction_id is not null and signed_amount < 0)
    or (kind = 'transfer_in' and cash_transfer_id is not null and signed_amount > 0)
    or (kind = 'transfer_out' and cash_transfer_id is not null and signed_amount < 0)
    or (kind = 'reversal' and reversal_of is not null)),
  check (reversal_of is null or reversal_of <> id)
);
create unique index movements_one_payment on public.cash_movements(workspace_id,payment_id) where payment_id is not null;
create unique index movements_one_transaction on public.cash_movements(workspace_id,financial_transaction_id) where financial_transaction_id is not null;
create unique index movements_transfer_leg on public.cash_movements(workspace_id,cash_transfer_id,kind) where cash_transfer_id is not null;
create unique index movements_one_opening on public.cash_movements(workspace_id,opening_account_id) where opening_account_id is not null;
create unique index movements_one_reversal on public.cash_movements(workspace_id,reversal_of) where reversal_of is not null;
create index movements_account_date on public.cash_movements(workspace_id,cash_account_id,business_date,id);
create table public.idempotency_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  actor_id uuid not null references public.users(id), operation text not null check (length(operation) between 1 and 80),
  request_key uuid not null, payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','completed')),
  result jsonb, resource_type text, resource_id uuid,
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique (workspace_id,id), unique (workspace_id,actor_id,operation,request_key),
  check ((status = 'pending' and result is null and completed_at is null)
    or (status = 'completed' and result is not null and completed_at is not null))
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  actor_id uuid references public.users(id), action text not null,
  entity_type text not null, entity_id uuid, before_data jsonb, after_data jsonb,
  reason text, request_id text, created_at timestamptz not null default now(),
  unique (workspace_id,id)
);
create index audit_workspace_time on public.audit_events(workspace_id,created_at desc,id);
create index audit_workspace_actor on public.audit_events(workspace_id,actor_id,created_at desc);
create index audit_entity on public.audit_events(workspace_id,entity_type,entity_id);

-- Remaining functions, triggers, policies and grants are below.

-- Auth helpers are only callable by the trusted Next.js server DB role.
-- HMACs and scrypt encoded hashes are computed by Node, never by the browser.
create function app_private.actor_id() returns uuid
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select s.user_id from app_private.sessions s join public.users u on u.id = s.user_id
  where s.token_hash = nullif(current_setting('app.session_hash',true),'')
    and s.revoked_at is null and s.expires_at > now()
    and s.last_seen_at + make_interval(secs => s.idle_timeout_seconds) > now()
    and u.status = 'active'
$$;

create function app_private.has_permission(p_workspace uuid, p_permission text) returns boolean
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select coalesce(bool_or(
    case p_permission
      when 'read' then true
      when 'sales' then m.role in ('owner','admin','finance','cashier')
      when 'customers' then m.role in ('owner','admin','finance','cashier')
      when 'master' then m.role in ('owner','admin','finance')
      when 'cash' then m.role in ('owner','admin','finance')
      when 'payments' then m.role in ('owner','admin','finance','cashier')
      when 'reverse' then m.role in ('owner','admin','finance')
      when 'audit' then m.role in ('owner','admin','finance')
      when 'export' then m.role in ('owner','admin','finance')
      when 'reports' then m.role in ('owner','admin','finance','viewer')
      when 'members' then m.role in ('owner','admin')
      when 'settings' then m.role in ('owner','admin')
      when 'owner' then m.role = 'owner'
      else false
    end and (p_permission in ('read','audit','export') or w.archived_at is null)
  ),false)
  from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
  where m.workspace_id = p_workspace and m.user_id = app_private.actor_id() and m.status = 'active'
    and p_workspace = nullif(current_setting('app.workspace_id',true),'')::uuid
$$;

create function app_private.set_context(p_session_hash text, p_workspace uuid default null,
  p_request_id text default null) returns uuid
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_actor uuid; v_session uuid;
begin
  -- Transaction-local settings; pooled connections must never use session SET.
  perform set_config('app.session_hash','',true);
  perform set_config('app.user_id','',true);
  perform set_config('app.workspace_id','',true);
  select s.user_id,s.id into v_actor,v_session
    from app_private.sessions s join public.users u on u.id=s.user_id
    where s.token_hash=p_session_hash and s.revoked_at is null and s.expires_at>now()
      and s.last_seen_at+make_interval(secs=>s.idle_timeout_seconds)>now() and u.status='active';
  if v_actor is null then raise exception 'Invalid or expired session' using errcode='28000'; end if;
  if p_workspace is not null and not exists (select 1 from public.workspace_memberships
    where workspace_id=p_workspace and user_id=v_actor and status='active') then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  update app_private.sessions set last_seen_at=now()
    where id=v_session and last_seen_at < now()-interval '15 minutes';
  perform set_config('app.session_hash',p_session_hash,true);
  perform set_config('app.user_id',v_actor::text,true);
  perform set_config('app.workspace_id',coalesce(p_workspace::text,''),true);
  perform set_config('app.request_id',left(coalesce(p_request_id,''),160),true);
  return v_actor;
end $$;

create function app_private.get_login_credential(p_email text)
returns table (user_id uuid, password_hash text)
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select id,password_hash from public.users where email_normalized=lower(btrim(p_email)) and status='active'
$$;
comment on function app_private.get_login_credential(text) is
  'SERVER ONLY: rate-limit first, verify scrypt password in Node. Never return result to browser.';

create function app_private.create_session(p_user uuid,p_token_hash text,p_verified_password_hash text,
  p_absolute_seconds integer default 604800,p_idle_seconds integer default 86400) returns uuid
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_id uuid;
begin
  if p_absolute_seconds not between 300 and 604800 or p_idle_seconds not between 300 and 86400 then
    raise exception 'Invalid session lifetime';
  end if;
  if not exists(select 1 from public.users where id=p_user and status='active'
      and password_hash=p_verified_password_hash for update) then
    raise exception 'Invalid account' using errcode='28000';
  end if;
  insert into app_private.sessions(user_id,token_hash,expires_at,idle_timeout_seconds)
    values(p_user,p_token_hash,now()+make_interval(secs=>p_absolute_seconds),p_idle_seconds) returning id into v_id;
  return v_id;
end $$;
comment on function app_private.create_session(uuid,text,text,integer,integer) is
  'Trusted server only, after successful password verification. Not a public login API.';

create function app_private.revoke_session(p_token_hash text) returns void
language sql security definer set search_path = pg_catalog set row_security = off as $$
  update app_private.sessions set revoked_at=coalesce(revoked_at,now()) where token_hash=p_token_hash
$$;
create function app_private.current_profile()
returns table (id uuid,email text,display_name text)
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select id,email,display_name from public.users where id=app_private.actor_id()
$$;
create function app_private.my_workspaces()
returns table (workspace_id uuid,name text,role public.membership_role,archived_at timestamptz)
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select w.id,w.name,m.role,w.archived_at from public.workspace_memberships m
  join public.workspaces w on w.id=m.workspace_id
  where m.user_id=app_private.actor_id() and m.status='active'
$$;
create function app_private.list_members(p_workspace uuid)
returns table (user_id uuid,display_name text,role public.membership_role,status public.member_status)
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select u.id,u.display_name,m.role,m.status from public.workspace_memberships m
  join public.users u on u.id=m.user_id
  where m.workspace_id=p_workspace and app_private.has_permission(p_workspace,'read')
$$;
create function app_private.hit_rate_limit(p_key text,p_window_seconds integer,p_limit integer) returns boolean
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_count integer;
begin
  if p_window_seconds not between 1 and 86400 or p_limit not between 1 and 10000 then
    raise exception 'Invalid rate limit configuration';
  end if;
  insert into app_private.auth_rate_limits(bucket_key,window_started_at,request_count,expires_at)
    values(p_key,now(),1,now()+make_interval(secs=>p_window_seconds))
  on conflict(bucket_key) do update set
    window_started_at=case when app_private.auth_rate_limits.expires_at<=now() then now() else app_private.auth_rate_limits.window_started_at end,
    request_count=case when app_private.auth_rate_limits.expires_at<=now() then 1 else least(app_private.auth_rate_limits.request_count+1,10001) end,
    expires_at=case when app_private.auth_rate_limits.expires_at<=now() then now()+make_interval(secs=>p_window_seconds) else app_private.auth_rate_limits.expires_at end
    returning request_count into v_count;
  return v_count <= p_limit;
end $$;
create function app_private.consume_password_reset(p_token_hash text,p_password_hash text) returns void
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_user uuid; v_id uuid;
begin
  select id,user_id into v_id,v_user from app_private.password_reset_tokens
    where token_hash=p_token_hash and consumed_at is null and expires_at>now() for update;
  if v_user is null then raise exception 'Invalid reset token' using errcode='28000'; end if;
  if not exists(select 1 from public.users where id=v_user and status='active' for update) then
    raise exception 'Invalid reset token' using errcode='28000';
  end if;
  update public.users set password_hash=p_password_hash,password_changed_at=now(),updated_at=now() where id=v_user;
  update app_private.password_reset_tokens set consumed_at=now() where id=v_id;
  update app_private.sessions set revoked_at=coalesce(revoked_at,now()) where user_id=v_user;
end $$;
-- Creating reset tokens is intentionally NOT granted to runtime; local operator uses admin credential.

create function app_private.create_workspace(p_name text,p_timezone text default 'Asia/Makassar',
  p_template text default 'sales_receivables') returns uuid
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_user uuid:=app_private.actor_id(); v_workspace uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  insert into public.workspaces(name,timezone,template_code,created_by)
    values(p_name,p_timezone,p_template,v_user) returning id into v_workspace;
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(v_workspace,v_user,'owner',v_user);
  return v_workspace;
end $$;
create function app_private.create_invitation(p_workspace uuid,p_email text,p_role public.membership_role,
  p_token_hash text) returns uuid
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_id uuid; v_actor_role public.membership_role;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not app_private.has_permission(p_workspace,'members') then raise exception 'Forbidden' using errcode='42501'; end if;
  select role into v_actor_role from public.workspace_memberships where workspace_id=p_workspace and user_id=app_private.actor_id();
  if p_role='owner' or (v_actor_role='admin' and p_role='admin') then raise exception 'Role escalation denied' using errcode='42501'; end if;
  insert into app_private.workspace_invitations(workspace_id,email_normalized,role,token_hash,expires_at,created_by)
    values(p_workspace,lower(btrim(p_email)),p_role,p_token_hash,now()+interval '72 hours',app_private.actor_id()) returning id into v_id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id)
    values(p_workspace,app_private.actor_id(),'invite','workspace_invitations',v_id);
  return v_id;
end $$;
create function app_private.accept_invitation(p_token_hash text,p_name text default null,p_password_hash text default null) returns uuid
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_inv app_private.workspace_invitations%rowtype; v_user uuid; v_existing uuid;
begin
  select * into v_inv from app_private.workspace_invitations where token_hash=p_token_hash
    and accepted_at is null and revoked_at is null and expires_at>now() for update;
  if v_inv.id is null then raise exception 'Invalid invitation' using errcode='28000'; end if;
  perform 1 from public.workspaces where id=v_inv.workspace_id and archived_at is null for update;
  if not found then raise exception 'Invalid invitation' using errcode='28000'; end if;
  select id into v_existing from public.users where email_normalized=v_inv.email_normalized;
  if not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
    where m.workspace_id=v_inv.workspace_id and m.user_id=v_inv.created_by and m.status='active' and u.status='active'
      and (m.role='owner' or (m.role='admin' and v_inv.role<>'admin'))) then
    raise exception 'Invitation issuer no longer authorized' using errcode='42501';
  end if;
  if v_existing is not null then
    v_user:=app_private.actor_id();
    if v_user is distinct from v_existing then raise exception 'Login with the invited account required' using errcode='28000'; end if;
  else
    if p_password_hash is null or p_name is null then raise exception 'Registration details required'; end if;
    insert into public.users(email,email_normalized,display_name,password_hash)
      values(v_inv.email_normalized,v_inv.email_normalized,p_name,p_password_hash) returning id into v_user;
  end if;
  if exists(select 1 from public.workspace_memberships where workspace_id=v_inv.workspace_id and user_id=v_user) then
    raise exception 'Membership already exists; operator must review reactivation';
  end if;
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(v_inv.workspace_id,v_user,v_inv.role,v_inv.created_by);
  update app_private.workspace_invitations set accepted_at=now() where id=v_inv.id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id)
    values(v_inv.workspace_id,v_user,'accept_invitation','workspace_invitations',v_inv.id);
  return v_user;
end $$;
create function app_private.revoke_invitation(p_workspace uuid,p_invitation uuid) returns void
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
begin
  if not app_private.has_permission(p_workspace,'members') then raise exception 'Forbidden' using errcode='42501'; end if;
  update app_private.workspace_invitations set revoked_at=now()
    where workspace_id=p_workspace and id=p_invitation and accepted_at is null;
  if found then
    insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id)
      values(p_workspace,app_private.actor_id(),'revoke_invitation','workspace_invitations',p_invitation);
  end if;
end $$;
create function app_private.set_membership(p_workspace uuid,p_user uuid,p_role public.membership_role,p_status public.member_status) returns void
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_actor_role public.membership_role; v_target_role public.membership_role;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not app_private.has_permission(p_workspace,'members') then raise exception 'Forbidden' using errcode='42501'; end if;
  select role into v_actor_role from public.workspace_memberships where workspace_id=p_workspace and user_id=app_private.actor_id();
  select role into v_target_role from public.workspace_memberships where workspace_id=p_workspace and user_id=p_user;
  if v_target_role is null or v_target_role='owner' or p_role='owner'
    or (v_actor_role='admin' and (v_target_role='admin' or p_role='admin')) then
    raise exception 'Role escalation denied' using errcode='42501';
  end if;
  update public.workspace_memberships set role=p_role,status=p_status,updated_by=app_private.actor_id(),updated_at=now() where workspace_id=p_workspace and user_id=p_user;
end $$;
create function app_private.transfer_owner(p_workspace uuid,p_new_owner uuid) returns void
language plpgsql security definer set search_path = pg_catalog set row_security = off as $$
declare v_actor uuid:=app_private.actor_id();
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if not app_private.has_permission(p_workspace,'owner') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_new_owner=v_actor or not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
    where m.workspace_id=p_workspace and m.user_id=p_new_owner and m.status='active' and u.status='active') then
    raise exception 'Invalid ownership target';
  end if;
  update public.workspace_memberships set role='admin',updated_by=v_actor,updated_at=now() where workspace_id=p_workspace and user_id=v_actor;
  update public.workspace_memberships set role='owner',updated_by=v_actor,updated_at=now() where workspace_id=p_workspace and user_id=p_new_owner;
end $$;

-- No business reads go through definer functions; RLS-protected tables are queried by runtime.
create function app_private.next_document_number(p_workspace uuid,p_kind text,p_date date) returns text
language plpgsql security invoker set search_path = pg_catalog as $$
declare v_counter bigint; v_prefix text;
begin
  if not app_private.has_permission(p_workspace,case when p_kind='invoice' then 'sales' when p_kind='payment' then 'payments' else 'cash' end) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  v_prefix:=case p_kind when 'invoice' then 'INV' when 'payment' then 'PAY' when 'transaction' then 'TXN' when 'transfer' then 'TRF' end;
  if v_prefix is null then raise exception 'Invalid document kind'; end if;
  insert into public.document_counters(workspace_id,document_kind,document_year,last_value)
    values(p_workspace,p_kind,extract(year from p_date)::integer,1)
  on conflict(workspace_id,document_kind,document_year) do update set last_value=public.document_counters.last_value+1
  returning last_value into v_counter;
  return v_prefix||'-'||extract(year from p_date)::integer||'-'||lpad(v_counter::text,greatest(6,length(v_counter::text)),'0');
end $$;

create function app_private.reject_mutation() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception '% is append-only; use a reversal event',tg_table_name using errcode='23514'; end $$;

create function app_private.stamp_record() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_data jsonb; v_actor uuid; v_runtime boolean;
begin
  v_runtime:=session_user='finance_runtime' or current_setting('role',true)='finance_runtime';
  v_actor:=app_private.actor_id(); v_data:=to_jsonb(new);
  if tg_op='UPDATE' and (new.id<>old.id or
    (v_data ? 'workspace_id' and v_data->>'workspace_id' is distinct from to_jsonb(old)->>'workspace_id') or
    (v_data ? 'created_by' and v_data->>'created_by' is distinct from to_jsonb(old)->>'created_by') or
    (v_data ? 'created_at' and v_data->>'created_at' is distinct from to_jsonb(old)->>'created_at')) then
    raise exception 'Identity, tenant, creator and creation time are immutable' using errcode='23514';
  end if;
  if v_runtime then
    if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
    if tg_op='INSERT' then
      if v_data ? 'created_by' then v_data:=v_data||jsonb_build_object('created_by',v_actor); end if;
      if v_data ? 'created_at' then v_data:=v_data||jsonb_build_object('created_at',now()); end if;
    end if;
    if v_data ? 'updated_by' then v_data:=v_data||jsonb_build_object('updated_by',v_actor); end if;
  end if;
  if v_data ? 'updated_at' then v_data:=v_data||jsonb_build_object('updated_at',now()); end if;
  new:=jsonb_populate_record(new,v_data);
  return new;
end $$;

create function app_private.guard_workspace() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid IANA timezone'; end if;
  if tg_op='UPDATE' and new.archived_at is distinct from old.archived_at
    and (session_user='finance_runtime' or current_setting('role',true)='finance_runtime')
    and not app_private.has_permission(new.id,'owner') then
    raise exception 'Only owner can archive/unarchive workspace' using errcode='42501';
  end if;
  return new;
end $$;
create function app_private.assert_owner() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_workspace uuid; v_row jsonb:=coalesce(to_jsonb(new),to_jsonb(old));
begin
  v_workspace:=(case when tg_table_name='workspaces' then v_row->>'id' else v_row->>'workspace_id' end)::uuid;
  if exists(select 1 from public.workspaces where id=v_workspace) and
    (select count(*) from public.workspace_memberships where workspace_id=v_workspace and role='owner' and status='active')<>1 then
    raise exception 'Workspace must have exactly one active owner' using errcode='23514';
  end if;
  return null;
end $$;

create function app_private.guard_invoice() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_actor_role public.membership_role;
begin
  if tg_op='DELETE' then
    if old.status='final' then raise exception 'Final invoice cannot be deleted' using errcode='23514'; end if;
    return old;
  end if;
  if tg_op='INSERT' and new.status<>'draft' then raise exception 'Insert draft and lines before finalization'; end if;
  if tg_op='UPDATE' and old.status='final' then raise exception 'Final invoice is immutable; void and replace' using errcode='23514'; end if;
  if new.status='final' then
    if new.customer_id is not null and not exists(select 1 from public.customers where workspace_id=new.workspace_id and id=new.customer_id and active) then
      raise exception 'Active customer required for finalization';
    end if;
    if not exists(select 1 from public.sales_invoice_lines where workspace_id=new.workspace_id and invoice_id=new.id) then
      raise exception 'Final invoice requires at least one line';
    end if;
    if exists(select 1 from public.sales_invoice_lines l join public.products p on p.id=l.product_id
      left join public.product_unit_options u on u.id=l.unit_option_id
      where l.workspace_id=new.workspace_id and l.invoice_id=new.id and (not p.active or (l.unit_option_id is not null and not u.active))) then
      raise exception 'Inactive product or unit cannot be finalized';
    end if;
    select role into v_actor_role from public.workspace_memberships where workspace_id=new.workspace_id and user_id=app_private.actor_id() and status='active';
    if v_actor_role='cashier' and exists(select 1 from public.sales_invoice_lines l join public.products p on p.id=l.product_id
      left join public.product_unit_options u on u.id=l.unit_option_id where l.workspace_id=new.workspace_id and l.invoice_id=new.id
        and l.unit_price<>coalesce(u.price,p.base_price)) then
      raise exception 'Cashier cannot override price' using errcode='42501';
    end if;
    if exists(select 1 from public.sales_invoice_lines l join public.products p on p.id=l.product_id
      left join public.product_unit_options u on u.id=l.unit_option_id where l.workspace_id=new.workspace_id and l.invoice_id=new.id
        and l.unit_price<>coalesce(u.price,p.base_price)) and length(btrim(coalesce(new.override_reason,'')))=0 then
      raise exception 'Price override requires a reason';
    end if;
    new.finalized_at:=now();
  end if;
  return new;
end $$;
create function app_private.guard_line() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_workspace uuid:=coalesce(new.workspace_id,old.workspace_id); v_invoice uuid:=coalesce(new.invoice_id,old.invoice_id); v_status public.invoice_status;
begin
  select status into v_status from public.sales_invoices where workspace_id=v_workspace and id=v_invoice for update;
  if v_status='final' then raise exception 'Final invoice lines are immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and new.invoice_id<>old.invoice_id then raise exception 'Invoice line cannot move to another invoice'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create function app_private.guard_allocation() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_invoice public.sales_invoices%rowtype; v_payment public.payments%rowtype;
begin
  -- Server must pre-lock ALL invoice IDs in sorted order before inserting allocations.
  select * into v_invoice from public.sales_invoices where workspace_id=new.workspace_id and id=new.invoice_id for update;
  select * into v_payment from public.payments where workspace_id=new.workspace_id and id=new.payment_id;
  if v_invoice.id is null or v_payment.id is null or v_invoice.status<>'final'
    or v_invoice.customer_id is distinct from v_payment.customer_id
    or v_payment.business_date<v_invoice.business_date
    or exists(select 1 from public.invoice_void_events where workspace_id=new.workspace_id and invoice_id=new.invoice_id)
    or exists(select 1 from public.payment_reversals where workspace_id=new.workspace_id and payment_id=new.payment_id) then
    raise exception 'Invalid allocation: final invoice, customer, date or reversal' using errcode='23514';
  end if;
  return new;
end $$;
create function app_private.guard_event() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_row jsonb:=to_jsonb(new); v_date date; v_source_date date; v_tz text; v_role public.membership_role;
begin
  if v_row ? 'business_date' then
    select timezone into v_tz from public.workspaces where id=new.workspace_id;
    v_date:=(v_row->>'business_date')::date;
    if v_date>(now() at time zone v_tz)::date then raise exception 'Future financial business dates are not supported in P0'; end if;
    select role into v_role from public.workspace_memberships where workspace_id=new.workspace_id and user_id=app_private.actor_id() and status='active';
    if v_role='cashier' and v_date<>(now() at time zone v_tz)::date then raise exception 'Cashier cannot backdate' using errcode='42501'; end if;
  end if;
  if tg_table_name='payment_reversals' then
    -- Same invoice locks as payment recording, in deterministic order.
    perform 1 from public.sales_invoices i join public.payment_allocations a on a.invoice_id=i.id and a.workspace_id=i.workspace_id
      where a.workspace_id=new.workspace_id and a.payment_id=new.payment_id order by i.id for update of i;
    select business_date into v_source_date from public.payments where workspace_id=new.workspace_id and id=new.payment_id;
  elsif tg_table_name='invoice_void_events' then
    select business_date into v_source_date from public.sales_invoices where workspace_id=new.workspace_id and id=new.invoice_id and status='final' for update;
  elsif tg_table_name='financial_transaction_reversals' then
    select business_date into v_source_date from public.financial_transactions where workspace_id=new.workspace_id and id=new.transaction_id for update;
  elsif tg_table_name='cash_transfer_reversals' then
    select business_date into v_source_date from public.cash_transfers where workspace_id=new.workspace_id and id=new.transfer_id for update;
  end if;
  if tg_table_name in ('payment_reversals','invoice_void_events','financial_transaction_reversals','cash_transfer_reversals') and
    (v_source_date is null or v_date<v_source_date) then raise exception 'Invalid reversal/void source or date'; end if;
  return new;
end $$;
create function app_private.guard_cash_account() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if tg_op='UPDATE' and new.opening_date<>old.opening_date then raise exception 'Opening date is immutable; create a correction movement'; end if;
  return new;
end $$;
create function app_private.audit_record() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_workspace uuid; v_actor uuid;
begin
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
  v_row:=coalesce(v_new,v_old);
  v_workspace:=case when tg_table_name='workspaces' then (v_row->>'id')::uuid else (v_row->>'workspace_id')::uuid end;
  v_actor:=coalesce(app_private.actor_id(),(v_row->>'updated_by')::uuid,(v_row->>'created_by')::uuid);
  -- Safe operational snapshots. Exclude PII, notes and all secret-bearing fields.
  v_old:=v_old-array['email','email_normalized','phone','address','notes','description','counterparty','reference','password_hash','token_hash','settings'];
  v_new:=v_new-array['email','email_normalized','phone','address','notes','description','counterparty','reference','password_hash','token_hash','settings'];
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,before_data,after_data,reason,request_id)
    values(v_workspace,v_actor,lower(tg_op),tg_table_name,(v_row->>'id')::uuid,v_old,v_new,
      coalesce(v_row->>'reason',v_row->>'override_reason'),nullif(current_setting('app.request_id',true),''));
  return null;
end $$;

-- Narrow, indexed validation at transaction end. A CHECK cannot validate sums across rows.
create function app_private.assert_invoice(p_workspace uuid,p_invoice uuid) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_i public.sales_invoices%rowtype; v_paid numeric; v_subtotal numeric; v_void date;
begin
  select * into v_i from public.sales_invoices where workspace_id=p_workspace and id=p_invoice;
  if v_i.id is null then return; end if;
  select coalesce(sum(subtotal),0) into v_subtotal from public.sales_invoice_lines where workspace_id=p_workspace and invoice_id=p_invoice;
  if v_i.subtotal<>v_subtotal then raise exception 'Invoice subtotal differs from line sum' using errcode='23514'; end if;
  select business_date into v_void from public.invoice_void_events where workspace_id=p_workspace and invoice_id=p_invoice;
  select coalesce(sum(a.amount),0) into v_paid from public.payment_allocations a
    where a.workspace_id=p_workspace and a.invoice_id=p_invoice
      and not exists(select 1 from public.payment_reversals r where r.workspace_id=a.workspace_id and r.payment_id=a.payment_id);
  if v_paid>v_i.total_amount then raise exception 'Invoice over-allocation' using errcode='23514'; end if;
  if v_void is not null and v_paid<>0 then raise exception 'Void requires all payments to be reversed' using errcode='23514'; end if;
  if v_i.status='final' and v_void is null and v_paid<v_i.total_amount and (v_i.customer_id is null or v_i.due_date is null) then
    raise exception 'Credit invoice requires customer and due date (reverse and void anonymous cash invoices atomically)' using errcode='23514';
  end if;
end $$;
create function app_private.assert_payment(p_workspace uuid,p_payment uuid) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_p public.payments%rowtype; v_sum numeric; v_reversal_date date; v_count bigint;
begin
  select * into v_p from public.payments where workspace_id=p_workspace and id=p_payment;
  if v_p.id is null then return; end if;
  select sum(amount),count(*) into v_sum,v_count from public.payment_allocations where workspace_id=p_workspace and payment_id=p_payment;
  if coalesce(v_sum,0)<>v_p.amount or (v_p.customer_id is null and v_count<>1) then
    raise exception 'Payment must be fully allocated; anonymous payment must target one invoice' using errcode='23514';
  end if;
  if not exists(select 1 from public.cash_movements where workspace_id=p_workspace and payment_id=p_payment
    and kind='payment' and signed_amount=v_p.amount and cash_account_id=v_p.cash_account_id and business_date=v_p.business_date) then
    raise exception 'Payment requires exactly one matching cash movement' using errcode='23514';
  end if;
  select business_date into v_reversal_date from public.payment_reversals where workspace_id=p_workspace and payment_id=p_payment;
  if v_reversal_date is not null and not exists(select 1 from public.cash_movements m join public.cash_movements r on r.workspace_id=m.workspace_id and r.reversal_of=m.id
    where m.workspace_id=p_workspace and m.payment_id=p_payment and r.business_date=v_reversal_date) then
    raise exception 'Payment reversal requires cash reversal' using errcode='23514';
  end if;
end $$;
create function app_private.assert_transaction(p_workspace uuid,p_transaction uuid) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_t public.financial_transactions%rowtype; v_reversal_date date;
begin
  select * into v_t from public.financial_transactions where workspace_id=p_workspace and id=p_transaction;
  if v_t.id is null then return; end if;
  if not exists(select 1 from public.categories where workspace_id=p_workspace and id=v_t.category_id and kind::text=v_t.kind::text) then
    raise exception 'Income/expense category kind mismatch' using errcode='23514';
  end if;
  if not exists(select 1 from public.cash_movements where workspace_id=p_workspace and financial_transaction_id=p_transaction
    and kind::text=v_t.kind::text and signed_amount=case when v_t.kind='income' then v_t.amount else -v_t.amount end
    and cash_account_id=v_t.cash_account_id and business_date=v_t.business_date) then
    raise exception 'Financial transaction requires matching cash movement' using errcode='23514';
  end if;
  select business_date into v_reversal_date from public.financial_transaction_reversals where workspace_id=p_workspace and transaction_id=p_transaction;
  if v_reversal_date is not null and not exists(select 1 from public.cash_movements m join public.cash_movements r on r.workspace_id=m.workspace_id and r.reversal_of=m.id
    where m.workspace_id=p_workspace and m.financial_transaction_id=p_transaction and r.business_date=v_reversal_date) then
    raise exception 'Transaction reversal requires cash reversal' using errcode='23514';
  end if;
end $$;
create function app_private.assert_transfer(p_workspace uuid,p_transfer uuid) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_t public.cash_transfers%rowtype; v_reversal_date date;
begin
  select * into v_t from public.cash_transfers where workspace_id=p_workspace and id=p_transfer;
  if v_t.id is null then return; end if;
  if not exists(select 1 from public.cash_movements where workspace_id=p_workspace and cash_transfer_id=p_transfer
      and kind='transfer_out' and signed_amount=-v_t.amount and cash_account_id=v_t.source_account_id and business_date=v_t.business_date)
    or not exists(select 1 from public.cash_movements where workspace_id=p_workspace and cash_transfer_id=p_transfer
      and kind='transfer_in' and signed_amount=v_t.amount and cash_account_id=v_t.destination_account_id and business_date=v_t.business_date) then
    raise exception 'Transfer requires matching outgoing and incoming legs' using errcode='23514';
  end if;
  select business_date into v_reversal_date from public.cash_transfer_reversals where workspace_id=p_workspace and transfer_id=p_transfer;
  if v_reversal_date is not null and (select count(*) from public.cash_movements m join public.cash_movements r on r.workspace_id=m.workspace_id and r.reversal_of=m.id
    where m.workspace_id=p_workspace and m.cash_transfer_id=p_transfer and r.business_date=v_reversal_date)<>2 then
    raise exception 'Transfer reversal requires both cash reversals' using errcode='23514';
  end if;
  if v_reversal_date is not null and exists(select 1 from public.financial_transactions f where f.workspace_id=p_workspace and f.related_transfer_id=p_transfer
    and not exists(select 1 from public.financial_transaction_reversals r where r.workspace_id=f.workspace_id and r.transaction_id=f.id and r.business_date=v_reversal_date)) then
    raise exception 'Reverse associated transfer fee on the same business date' using errcode='23514';
  end if;
end $$;
create function app_private.assert_movement(p_workspace uuid,p_movement uuid) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_m public.cash_movements%rowtype; v_o public.cash_movements%rowtype; v_opening date; v_event_date date;
begin
  select * into v_m from public.cash_movements where workspace_id=p_workspace and id=p_movement;
  if v_m.id is null then return; end if;
  select opening_date into v_opening from public.cash_accounts where workspace_id=p_workspace and id=v_m.cash_account_id;
  if v_m.business_date<v_opening or (v_m.kind='opening' and v_m.business_date<>v_opening) then
    raise exception 'Movement precedes opening date or opening date mismatch' using errcode='23514';
  end if;
  if v_m.kind='reversal' then
    select * into v_o from public.cash_movements where workspace_id=p_workspace and id=v_m.reversal_of;
    if v_o.kind in ('opening','reversal') or v_m.cash_account_id<>v_o.cash_account_id or v_m.signed_amount<>-v_o.signed_amount or v_m.business_date<v_o.business_date then
      raise exception 'Invalid cash reversal' using errcode='23514';
    end if;
    if v_o.payment_id is not null then
      select business_date into v_event_date from public.payment_reversals where workspace_id=p_workspace and payment_id=v_o.payment_id;
    elsif v_o.financial_transaction_id is not null then
      select business_date into v_event_date from public.financial_transaction_reversals where workspace_id=p_workspace and transaction_id=v_o.financial_transaction_id;
    elsif v_o.cash_transfer_id is not null then
      select business_date into v_event_date from public.cash_transfer_reversals where workspace_id=p_workspace and transfer_id=v_o.cash_transfer_id;
    end if;
    if v_event_date is null or v_event_date<>v_m.business_date then raise exception 'Cash reversal needs matching source reversal event' using errcode='23514'; end if;
  end if;
end $$;
create function app_private.assert_idempotency(p_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if exists(select 1 from public.idempotency_requests where id=p_id and status<>'completed') then
    raise exception 'Idempotency claim/result must commit together' using errcode='23514';
  end if;
end $$;

create function app_private.check_financial_integrity() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_row jsonb:=coalesce(to_jsonb(new),to_jsonb(old)); v_w uuid:=(v_row->>'workspace_id')::uuid; v_id uuid:=(v_row->>'id')::uuid; v_other uuid; v_original public.cash_movements%rowtype;
begin
  case tg_table_name
    when 'sales_invoices' then perform app_private.assert_invoice(v_w,v_id);
    when 'sales_invoice_lines' then perform app_private.assert_invoice(v_w,(v_row->>'invoice_id')::uuid);
    when 'payments' then perform app_private.assert_payment(v_w,v_id);
    when 'payment_allocations' then
      perform app_private.assert_payment(v_w,(v_row->>'payment_id')::uuid);
      perform app_private.assert_invoice(v_w,(v_row->>'invoice_id')::uuid);
    when 'payment_reversals' then
      perform app_private.assert_payment(v_w,(v_row->>'payment_id')::uuid);
      for v_other in select invoice_id from public.payment_allocations where workspace_id=v_w and payment_id=(v_row->>'payment_id')::uuid loop
        perform app_private.assert_invoice(v_w,v_other);
      end loop;
    when 'invoice_void_events' then perform app_private.assert_invoice(v_w,(v_row->>'invoice_id')::uuid);
    when 'financial_transactions' then
      perform app_private.assert_transaction(v_w,v_id);
      if v_row->>'related_transfer_id' is not null then perform app_private.assert_transfer(v_w,(v_row->>'related_transfer_id')::uuid); end if;
    when 'financial_transaction_reversals' then
      perform app_private.assert_transaction(v_w,(v_row->>'transaction_id')::uuid);
      select related_transfer_id into v_other from public.financial_transactions where workspace_id=v_w and id=(v_row->>'transaction_id')::uuid;
      if v_other is not null then perform app_private.assert_transfer(v_w,v_other); end if;
    when 'cash_transfers' then perform app_private.assert_transfer(v_w,v_id);
    when 'cash_transfer_reversals' then perform app_private.assert_transfer(v_w,(v_row->>'transfer_id')::uuid);
    when 'cash_accounts' then
      if exists(select 1 from public.cash_accounts where workspace_id=v_w and id=v_id) and not exists(select 1 from public.cash_movements where workspace_id=v_w and opening_account_id=v_id) then
        raise exception 'Account requires one opening movement (zero permitted)' using errcode='23514';
      end if;
    when 'cash_movements' then
      perform app_private.assert_movement(v_w,v_id);
      if v_row->>'payment_id' is not null then perform app_private.assert_payment(v_w,(v_row->>'payment_id')::uuid); end if;
      if v_row->>'financial_transaction_id' is not null then perform app_private.assert_transaction(v_w,(v_row->>'financial_transaction_id')::uuid); end if;
      if v_row->>'cash_transfer_id' is not null then perform app_private.assert_transfer(v_w,(v_row->>'cash_transfer_id')::uuid); end if;
      if v_row->>'reversal_of' is not null then
        select * into v_original from public.cash_movements where workspace_id=v_w and id=(v_row->>'reversal_of')::uuid;
        if v_original.payment_id is not null then perform app_private.assert_payment(v_w,v_original.payment_id); end if;
        if v_original.financial_transaction_id is not null then perform app_private.assert_transaction(v_w,v_original.financial_transaction_id); end if;
        if v_original.cash_transfer_id is not null then perform app_private.assert_transfer(v_w,v_original.cash_transfer_id); end if;
      end if;
    when 'idempotency_requests' then perform app_private.assert_idempotency(v_id);
    else null;
  end case;
  return null;
end $$;

-- Trigger wiring. Names enforce stamping -> guards -> audit.
create trigger a_stamp before insert or update on public.workspaces for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.categories for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.payment_methods for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.customers for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.products for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.product_unit_options for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.cash_accounts for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.sales_invoices for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.sales_invoice_lines for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.payments for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.payment_allocations for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.financial_transactions for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.cash_transfers for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.payment_reversals for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.invoice_void_events for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.financial_transaction_reversals for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.cash_transfer_reversals for each row execute function app_private.stamp_record();
create trigger a_stamp before insert or update on public.cash_movements for each row execute function app_private.stamp_record();
create trigger a_append_only before update or delete on public.payments for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.payment_allocations for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.financial_transactions for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.cash_transfers for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.payment_reversals for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.invoice_void_events for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.financial_transaction_reversals for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.cash_transfer_reversals for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.cash_movements for each row execute function app_private.reject_mutation();
create trigger a_append_only before update or delete on public.audit_events for each row execute function app_private.reject_mutation();
create trigger z_audit after insert or update or delete on public.workspaces for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.categories for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.payment_methods for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.customers for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.products for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.product_unit_options for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.cash_accounts for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.sales_invoices for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.sales_invoice_lines for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.workspace_memberships for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.payments for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.payment_allocations for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.financial_transactions for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.cash_transfers for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.payment_reversals for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.invoice_void_events for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.financial_transaction_reversals for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.cash_transfer_reversals for each row execute function app_private.audit_record();
create trigger z_audit after insert or update or delete on public.cash_movements for each row execute function app_private.audit_record();
create constraint trigger z_financial_integrity after insert or update or delete on public.sales_invoices deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.sales_invoice_lines deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.payments deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.payment_allocations deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.financial_transactions deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.cash_transfers deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.payment_reversals deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.invoice_void_events deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.financial_transaction_reversals deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.cash_transfer_reversals deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.cash_movements deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.cash_accounts deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create constraint trigger z_financial_integrity after insert or update or delete on public.idempotency_requests deferrable initially deferred for each row execute function app_private.check_financial_integrity();
create trigger b_guard before insert or update on public.workspaces for each row execute function app_private.guard_workspace();
create trigger b_guard before insert or update or delete on public.sales_invoices for each row execute function app_private.guard_invoice();
create trigger b_guard before insert or update or delete on public.sales_invoice_lines for each row execute function app_private.guard_line();
create trigger b_guard before insert on public.payment_allocations for each row execute function app_private.guard_allocation();
create trigger b_guard before insert or update on public.cash_accounts for each row execute function app_private.guard_cash_account();
create trigger c_business_event before insert or update on public.sales_invoices for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.payments for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.financial_transactions for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.cash_transfers for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.payment_reversals for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.invoice_void_events for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.financial_transaction_reversals for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.cash_transfer_reversals for each row execute function app_private.guard_event();
create trigger c_business_event before insert or update on public.cash_movements for each row execute function app_private.guard_event();
create constraint trigger z_owner after insert or update or delete on public.workspaces deferrable initially deferred for each row execute function app_private.assert_owner();
create constraint trigger z_owner after insert or update or delete on public.workspace_memberships deferrable initially deferred for each row execute function app_private.assert_owner();
-- Deny by default: application tables are not public Data API tables.
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
revoke all on public.workspaces from public;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_memberships force row level security;
revoke all on public.workspace_memberships from public;
alter table public.categories enable row level security;
alter table public.categories force row level security;
revoke all on public.categories from public;
alter table public.payment_methods enable row level security;
alter table public.payment_methods force row level security;
revoke all on public.payment_methods from public;
alter table public.customers enable row level security;
alter table public.customers force row level security;
revoke all on public.customers from public;
alter table public.products enable row level security;
alter table public.products force row level security;
revoke all on public.products from public;
alter table public.product_unit_options enable row level security;
alter table public.product_unit_options force row level security;
revoke all on public.product_unit_options from public;
alter table public.cash_accounts enable row level security;
alter table public.cash_accounts force row level security;
revoke all on public.cash_accounts from public;
alter table public.document_counters enable row level security;
alter table public.document_counters force row level security;
revoke all on public.document_counters from public;
alter table public.sales_invoices enable row level security;
alter table public.sales_invoices force row level security;
revoke all on public.sales_invoices from public;
alter table public.sales_invoice_lines enable row level security;
alter table public.sales_invoice_lines force row level security;
revoke all on public.sales_invoice_lines from public;
alter table public.payments enable row level security;
alter table public.payments force row level security;
revoke all on public.payments from public;
alter table public.payment_allocations enable row level security;
alter table public.payment_allocations force row level security;
revoke all on public.payment_allocations from public;
alter table public.financial_transactions enable row level security;
alter table public.financial_transactions force row level security;
revoke all on public.financial_transactions from public;
alter table public.cash_transfers enable row level security;
alter table public.cash_transfers force row level security;
revoke all on public.cash_transfers from public;
alter table public.payment_reversals enable row level security;
alter table public.payment_reversals force row level security;
revoke all on public.payment_reversals from public;
alter table public.invoice_void_events enable row level security;
alter table public.invoice_void_events force row level security;
revoke all on public.invoice_void_events from public;
alter table public.financial_transaction_reversals enable row level security;
alter table public.financial_transaction_reversals force row level security;
revoke all on public.financial_transaction_reversals from public;
alter table public.cash_transfer_reversals enable row level security;
alter table public.cash_transfer_reversals force row level security;
revoke all on public.cash_transfer_reversals from public;
alter table public.cash_movements enable row level security;
alter table public.cash_movements force row level security;
revoke all on public.cash_movements from public;
alter table public.idempotency_requests enable row level security;
alter table public.idempotency_requests force row level security;
revoke all on public.idempotency_requests from public;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
revoke all on public.audit_events from public;
alter table public.users enable row level security;
revoke all on public.users from public;
alter table app_private.sessions enable row level security;
revoke all on app_private.sessions from public;
alter table app_private.password_reset_tokens enable row level security;
revoke all on app_private.password_reset_tokens from public;
alter table app_private.workspace_invitations enable row level security;
revoke all on app_private.workspace_invitations from public;
alter table app_private.auth_rate_limits enable row level security;
revoke all on app_private.auth_rate_limits from public;
create policy workspaces_read on public.workspaces for select to finance_runtime using (app_private.has_permission(id,'read'));
grant select on public.workspaces to finance_runtime;
create policy workspace_memberships_read on public.workspace_memberships for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.workspace_memberships to finance_runtime;
create policy categories_read on public.categories for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.categories to finance_runtime;
create policy payment_methods_read on public.payment_methods for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.payment_methods to finance_runtime;
create policy customers_read on public.customers for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.customers to finance_runtime;
create policy products_read on public.products for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.products to finance_runtime;
create policy product_unit_options_read on public.product_unit_options for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.product_unit_options to finance_runtime;
create policy cash_accounts_read on public.cash_accounts for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.cash_accounts to finance_runtime;
create policy document_counters_read on public.document_counters for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.document_counters to finance_runtime;
create policy sales_invoices_read on public.sales_invoices for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.sales_invoices to finance_runtime;
create policy sales_invoice_lines_read on public.sales_invoice_lines for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.sales_invoice_lines to finance_runtime;
create policy payments_read on public.payments for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.payments to finance_runtime;
create policy payment_allocations_read on public.payment_allocations for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.payment_allocations to finance_runtime;
create policy financial_transactions_read on public.financial_transactions for select to finance_runtime using (app_private.has_permission(workspace_id,'reports'));
grant select on public.financial_transactions to finance_runtime;
create policy cash_transfers_read on public.cash_transfers for select to finance_runtime using (app_private.has_permission(workspace_id,'reports'));
grant select on public.cash_transfers to finance_runtime;
create policy payment_reversals_read on public.payment_reversals for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.payment_reversals to finance_runtime;
create policy invoice_void_events_read on public.invoice_void_events for select to finance_runtime using (app_private.has_permission(workspace_id,'read'));
grant select on public.invoice_void_events to finance_runtime;
create policy financial_transaction_reversals_read on public.financial_transaction_reversals for select to finance_runtime using (app_private.has_permission(workspace_id,'reports'));
grant select on public.financial_transaction_reversals to finance_runtime;
create policy cash_transfer_reversals_read on public.cash_transfer_reversals for select to finance_runtime using (app_private.has_permission(workspace_id,'reports'));
grant select on public.cash_transfer_reversals to finance_runtime;
create policy cash_movements_read on public.cash_movements for select to finance_runtime using (app_private.has_permission(workspace_id,'reports'));
grant select on public.cash_movements to finance_runtime;
create policy idempotency_requests_read on public.idempotency_requests for select to finance_runtime using (actor_id=app_private.actor_id() and app_private.has_permission(workspace_id,'read'));
grant select on public.idempotency_requests to finance_runtime;
create policy audit_events_read on public.audit_events for select to finance_runtime using (app_private.has_permission(workspace_id,'audit'));
grant select on public.audit_events to finance_runtime;
create policy categories_insert on public.categories for insert to finance_runtime with check (app_private.has_permission(workspace_id,'master'));
create policy categories_update on public.categories for update to finance_runtime using (app_private.has_permission(workspace_id,'master')) with check (app_private.has_permission(workspace_id,'master'));
grant insert,update on public.categories to finance_runtime;
create policy payment_methods_insert on public.payment_methods for insert to finance_runtime with check (app_private.has_permission(workspace_id,'master'));
create policy payment_methods_update on public.payment_methods for update to finance_runtime using (app_private.has_permission(workspace_id,'master')) with check (app_private.has_permission(workspace_id,'master'));
grant insert,update on public.payment_methods to finance_runtime;
create policy customers_insert on public.customers for insert to finance_runtime with check (app_private.has_permission(workspace_id,'customers'));
create policy customers_update on public.customers for update to finance_runtime using (app_private.has_permission(workspace_id,'customers')) with check (app_private.has_permission(workspace_id,'customers'));
grant insert,update on public.customers to finance_runtime;
create policy products_insert on public.products for insert to finance_runtime with check (app_private.has_permission(workspace_id,'master'));
create policy products_update on public.products for update to finance_runtime using (app_private.has_permission(workspace_id,'master')) with check (app_private.has_permission(workspace_id,'master'));
grant insert,update on public.products to finance_runtime;
create policy product_unit_options_insert on public.product_unit_options for insert to finance_runtime with check (app_private.has_permission(workspace_id,'master'));
create policy product_unit_options_update on public.product_unit_options for update to finance_runtime using (app_private.has_permission(workspace_id,'master')) with check (app_private.has_permission(workspace_id,'master'));
grant insert,update on public.product_unit_options to finance_runtime;
create policy cash_accounts_insert on public.cash_accounts for insert to finance_runtime with check (app_private.has_permission(workspace_id,'master'));
create policy cash_accounts_update on public.cash_accounts for update to finance_runtime using (app_private.has_permission(workspace_id,'master')) with check (app_private.has_permission(workspace_id,'master'));
grant insert,update on public.cash_accounts to finance_runtime;
create policy sales_invoices_insert on public.sales_invoices for insert to finance_runtime with check (app_private.has_permission(workspace_id,'sales'));
create policy sales_invoices_update on public.sales_invoices for update to finance_runtime using (app_private.has_permission(workspace_id,'sales')) with check (app_private.has_permission(workspace_id,'sales'));
grant insert,update on public.sales_invoices to finance_runtime;
create policy sales_invoice_lines_insert on public.sales_invoice_lines for insert to finance_runtime with check (app_private.has_permission(workspace_id,'sales'));
create policy sales_invoice_lines_update on public.sales_invoice_lines for update to finance_runtime using (app_private.has_permission(workspace_id,'sales')) with check (app_private.has_permission(workspace_id,'sales'));
grant insert,update on public.sales_invoice_lines to finance_runtime;
create policy sales_invoices_delete on public.sales_invoices for delete to finance_runtime using (app_private.has_permission(workspace_id,'sales'));
grant delete on public.sales_invoices to finance_runtime;
create policy sales_invoice_lines_delete on public.sales_invoice_lines for delete to finance_runtime using (app_private.has_permission(workspace_id,'sales'));
grant delete on public.sales_invoice_lines to finance_runtime;
create policy payments_insert on public.payments for insert to finance_runtime with check (app_private.has_permission(workspace_id,'payments'));
grant insert on public.payments to finance_runtime;
create policy payment_allocations_insert on public.payment_allocations for insert to finance_runtime with check (app_private.has_permission(workspace_id,'payments'));
grant insert on public.payment_allocations to finance_runtime;
create policy financial_transactions_insert on public.financial_transactions for insert to finance_runtime with check (app_private.has_permission(workspace_id,'cash'));
grant insert on public.financial_transactions to finance_runtime;
create policy cash_transfers_insert on public.cash_transfers for insert to finance_runtime with check (app_private.has_permission(workspace_id,'cash'));
grant insert on public.cash_transfers to finance_runtime;
create policy payment_reversals_insert on public.payment_reversals for insert to finance_runtime with check (app_private.has_permission(workspace_id,'reverse'));
grant insert on public.payment_reversals to finance_runtime;
create policy invoice_void_events_insert on public.invoice_void_events for insert to finance_runtime with check (app_private.has_permission(workspace_id,'reverse'));
grant insert on public.invoice_void_events to finance_runtime;
create policy financial_transaction_reversals_insert on public.financial_transaction_reversals for insert to finance_runtime with check (app_private.has_permission(workspace_id,'reverse'));
grant insert on public.financial_transaction_reversals to finance_runtime;
create policy cash_transfer_reversals_insert on public.cash_transfer_reversals for insert to finance_runtime with check (app_private.has_permission(workspace_id,'reverse'));
grant insert on public.cash_transfer_reversals to finance_runtime;
create policy workspace_update on public.workspaces for update to finance_runtime using (app_private.has_permission(id,'settings')) with check (app_private.has_permission(id,'settings'));
grant update on public.workspaces to finance_runtime;
create policy movement_insert on public.cash_movements for insert to finance_runtime with check ((kind='payment' and app_private.has_permission(workspace_id,'payments')) or (kind in ('opening','income','expense','transfer_in','transfer_out') and app_private.has_permission(workspace_id,'cash')) or (kind='reversal' and app_private.has_permission(workspace_id,'reverse')));
grant insert on public.cash_movements to finance_runtime;
create policy idempotency_insert on public.idempotency_requests for insert to finance_runtime with check (actor_id=app_private.actor_id() and app_private.has_permission(workspace_id,'sales'));
create policy idempotency_update on public.idempotency_requests for update to finance_runtime using (actor_id=app_private.actor_id() and app_private.has_permission(workspace_id,'sales')) with check (actor_id=app_private.actor_id() and app_private.has_permission(workspace_id,'sales'));
grant insert,update on public.idempotency_requests to finance_runtime;
create policy counters_insert on public.document_counters for insert to finance_runtime with check (app_private.has_permission(workspace_id,case when document_kind='invoice' then 'sales' when document_kind='payment' then 'payments' else 'cash' end));
create policy counters_update on public.document_counters for update to finance_runtime using (app_private.has_permission(workspace_id,case when document_kind='invoice' then 'sales' when document_kind='payment' then 'payments' else 'cash' end)) with check (app_private.has_permission(workspace_id,case when document_kind='invoice' then 'sales' when document_kind='payment' then 'payments' else 'cash' end));
grant insert,update on public.document_counters to finance_runtime;
grant usage on schema public,app_private to finance_runtime;
revoke all on all functions in schema app_private from public;
do $$
declare v_role text; v_table text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if exists(select 1 from pg_roles where rolname=v_role) then
      execute format('revoke all on schema app_private from %I',v_role);
      execute format('revoke all on all tables in schema app_private from %I',v_role);
      execute format('revoke all on all functions in schema app_private from %I',v_role);
      foreach v_table in array array['users','workspaces','workspace_memberships','categories','payment_methods','customers','products','product_unit_options','cash_accounts','document_counters','sales_invoices','sales_invoice_lines','payments','payment_allocations','financial_transactions','cash_transfers','payment_reversals','invoice_void_events','financial_transaction_reversals','cash_transfer_reversals','cash_movements','idempotency_requests','audit_events'] loop
        execute format('revoke all on table public.%I from %I',v_table,v_role);
      end loop;
    end if;
  end loop;
end $$;
-- Default ACLs apply to objects subsequently created by this migration owner.
alter default privileges in schema app_private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
do $$
declare v_role text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if exists(select 1 from pg_roles where rolname=v_role) then
      execute format('alter default privileges in schema public revoke all on tables from %I',v_role);
      execute format('alter default privileges in schema app_private revoke all on tables from %I',v_role);
      execute format('alter default privileges in schema app_private revoke execute on functions from %I',v_role);
    end if;
  end loop;
end $$;
grant execute on function app_private.actor_id() to finance_runtime;
grant execute on function app_private.has_permission(uuid,text) to finance_runtime;
grant execute on function app_private.set_context(text,uuid,text) to finance_runtime;
grant execute on function app_private.get_login_credential(text) to finance_runtime;
grant execute on function app_private.create_session(uuid,text,text,integer,integer) to finance_runtime;
grant execute on function app_private.revoke_session(text) to finance_runtime;
grant execute on function app_private.current_profile() to finance_runtime;
grant execute on function app_private.my_workspaces() to finance_runtime;
grant execute on function app_private.list_members(uuid) to finance_runtime;
grant execute on function app_private.hit_rate_limit(text,integer,integer) to finance_runtime;
grant execute on function app_private.consume_password_reset(text,text) to finance_runtime;
grant execute on function app_private.create_workspace(text,text,text) to finance_runtime;
grant execute on function app_private.create_invitation(uuid,text,public.membership_role,text) to finance_runtime;
grant execute on function app_private.accept_invitation(text,text,text) to finance_runtime;
grant execute on function app_private.revoke_invitation(uuid,uuid) to finance_runtime;
grant execute on function app_private.set_membership(uuid,uuid,public.membership_role,public.member_status) to finance_runtime;
grant execute on function app_private.transfer_owner(uuid,uuid) to finance_runtime;
grant execute on function app_private.next_document_number(uuid,text,date) to finance_runtime;

-- Stable keys, posted request results and master kinds cannot be rewritten.
create function app_private.guard_idempotency() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if old.status='completed' or new.workspace_id<>old.workspace_id or new.actor_id<>old.actor_id
    or new.operation<>old.operation or new.request_key<>old.request_key
    or new.payload_hash<>old.payload_hash or new.created_at<>old.created_at or new.id<>old.id then
    raise exception 'Idempotency identity/result is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger b_idempotency before update on public.idempotency_requests
  for each row execute function app_private.guard_idempotency();

create function app_private.guard_counter() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if new.id<>old.id or new.workspace_id<>old.workspace_id or new.document_kind<>old.document_kind
    or new.document_year<>old.document_year or new.last_value<=old.last_value then
    raise exception 'Counter identity is immutable and number must advance' using errcode='23514';
  end if;
  return new;
end $$;
create trigger b_counter before update on public.document_counters
  for each row execute function app_private.guard_counter();

create function app_private.guard_category_kind() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if new.kind<>old.kind then raise exception 'Category kind is immutable; create a new category' using errcode='23514'; end if;
  return new;
end $$;
create trigger b_kind before update on public.categories
  for each row execute function app_private.guard_category_kind();

create function app_private.guard_source_active() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if tg_table_name in ('payments','financial_transactions') then
    if not exists(select 1 from public.cash_accounts where workspace_id=new.workspace_id and id=new.cash_account_id and active) then
      raise exception 'Active cash account required';
    end if;
    if new.payment_method_id is not null and not exists(select 1 from public.payment_methods where workspace_id=new.workspace_id and id=new.payment_method_id and active) then
      raise exception 'Active payment method required';
    end if;
  end if;
  if tg_table_name='payments' then
    if new.customer_id is not null and not exists(select 1 from public.customers where workspace_id=new.workspace_id and id=new.customer_id and active) then
      raise exception 'Active customer required';
    end if;
  end if;
  if tg_table_name='financial_transactions' then
    if not exists(select 1 from public.categories where workspace_id=new.workspace_id and id=new.category_id and active) then
      raise exception 'Active category required';
    end if;
  end if;
  if tg_table_name='cash_transfers' then
    if not exists(select 1 from public.cash_accounts where workspace_id=new.workspace_id and id=new.source_account_id and active)
      or not exists(select 1 from public.cash_accounts where workspace_id=new.workspace_id and id=new.destination_account_id and active) then
      raise exception 'Two active transfer accounts required';
    end if;
  end if;
  return new;
end $$;
create trigger d_active before insert on public.payments for each row execute function app_private.guard_source_active();
create trigger d_active before insert on public.financial_transactions for each row execute function app_private.guard_source_active();
create trigger d_active before insert on public.cash_transfers for each row execute function app_private.guard_source_active();

create function app_private.revoke_sessions_on_security_change() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if new.status='disabled' and exists(select 1 from public.workspace_memberships where user_id=new.id and status='active' and role='owner') then
    raise exception 'Transfer ownership before disabling a workspace owner';
  end if;
  if new.status is distinct from old.status or new.password_hash is distinct from old.password_hash then
    update app_private.sessions set revoked_at=coalesce(revoked_at,now()) where user_id=new.id;
    update app_private.password_reset_tokens set consumed_at=coalesce(consumed_at,now()) where user_id=new.id;
    update public.users set password_changed_at=now(),updated_at=now() where id=new.id;
  end if;
  return null;
end $$;
create trigger z_security after update of status,password_hash on public.users
  for each row execute function app_private.revoke_sessions_on_security_change();
-- This UPDATE touches timestamps only, so it does not recursively fire the column-specific trigger.

-- Cashier may RETURNING/read only their own receipt movements, never the complete cashbook.
drop policy cash_movements_read on public.cash_movements;
create policy cash_movements_read on public.cash_movements for select to finance_runtime using (
  app_private.has_permission(workspace_id,'reports') or
  (kind='payment' and created_by=app_private.actor_id() and app_private.has_permission(workspace_id,'payments'))
);
-- Revoke explicitly for functions added after the earlier ACL block as well.
revoke all on all functions in schema app_private from public;

-- As-of helper is SECURITY INVOKER: never bypasses workspace/report RLS.
create function app_private.invoice_balances_as_of(p_workspace uuid,p_cutoff date)
returns table (invoice_id uuid,customer_id uuid,number text,business_date date,due_date date,
  total_amount bigint,paid_amount numeric,balance numeric)
language sql stable security invoker set search_path=pg_catalog as $$
  select i.id,i.customer_id,i.number,i.business_date,i.due_date,i.total_amount::bigint,
    coalesce(paid.amount,0),i.total_amount::numeric-coalesce(paid.amount,0)
  from public.sales_invoices i
  left join lateral (
    select sum(a.amount) amount from public.payment_allocations a
    join public.payments p on p.workspace_id=a.workspace_id and p.id=a.payment_id
    where a.workspace_id=i.workspace_id and a.invoice_id=i.id and p.business_date<=p_cutoff
      and not exists(select 1 from public.payment_reversals r
        where r.workspace_id=p.workspace_id and r.payment_id=p.id and r.business_date<=p_cutoff)
  ) paid on true
  where i.workspace_id=p_workspace and i.status='final' and i.business_date<=p_cutoff
    and app_private.has_permission(p_workspace,'reports')
    and not exists(select 1 from public.invoice_void_events v
      where v.workspace_id=i.workspace_id and v.invoice_id=i.id and v.business_date<=p_cutoff)
$$;
grant execute on function app_private.invoice_balances_as_of(uuid,date) to finance_runtime;

comment on table public.cash_movements is 'Immutable cash ledger. Opening is included once here; no separate current_balance or opening_balance column.';
comment on table public.payment_allocations is 'Immutable allocations. Reverse the entire payment via payment_reversals; do not UPDATE/DELETE allocations.';
comment on table public.sales_invoices is 'Insert draft + lines then UPDATE status=final in one transaction. Final rows are immutable; void is a separate dated event.';
comment on schema app_private is 'Server-only auth and internal helpers. Never add this schema to Supabase Data API exposed schemas.';
