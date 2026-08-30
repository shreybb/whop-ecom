-- Restocked: back-in-stock alerts & drop waitlists for Whop.
--
-- Multi-tenancy model: the tenant is a Whop company (biz_*). Every row is
-- scoped by company_id and every query in lib/db.ts requires it. The app
-- accesses this database exclusively from the server with the service role
-- key; RLS is enabled with no policies as a deny-all backstop so leaked
-- anon keys can never read tenant data.

create table companies (
  id text primary key, -- Whop company id (biz_*)
  title text,
  -- When true, a detected restock automatically notifies the waitlist.
  auto_notify boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cache of each tenant's product stock state, used to detect
-- sold-out -> in-stock transitions (restocks) and the reverse (sellouts).
create table tracked_products (
  company_id text not null references companies(id) on delete cascade,
  product_id text not null, -- Whop product id (prod_*)
  title text not null,
  route text,
  currency text,
  price numeric,
  purchase_url text,
  in_stock boolean not null default true,
  stock_left integer, -- null = unlimited
  last_synced_at timestamptz not null default now(),
  primary key (company_id, product_id)
);

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  product_id text not null,
  experience_id text not null, -- where the user joined; used to target notifications
  whop_user_id text not null,
  username text,
  status text not null default 'waiting'
    check (status in ('waiting', 'notified', 'converted')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  converted_at timestamptz,
  restock_event_id uuid
);

-- A user can only wait once per product per tenant (they can re-join after
-- being notified, which starts a fresh cycle).
create unique index waitlist_one_active
  on waitlist_entries (company_id, product_id, whop_user_id)
  where status = 'waiting';
create index waitlist_by_product on waitlist_entries (company_id, product_id, status);
create index waitlist_by_user on waitlist_entries (company_id, whop_user_id, status);

create table restock_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  product_id text not null,
  source text not null check (source in ('manual', 'sync', 'webhook', 'cron')),
  notified_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index restocks_by_company on restock_events (company_id, created_at desc);

-- A conversion is a payment.succeeded from a user we notified about that
-- product within the attribution window. This powers the recovered-revenue
-- counter, the app's headline metric.
create table conversions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  product_id text not null,
  whop_user_id text not null,
  payment_id text not null unique, -- idempotent per Whop payment
  waitlist_entry_id uuid references waitlist_entries(id),
  amount_usd numeric,
  currency text,
  created_at timestamptz not null default now()
);
create index conversions_by_company on conversions (company_id, created_at desc);

-- Raw webhook log. The primary key on Whop's webhook id makes ingestion
-- idempotent (Whop delivers at-least-once).
create table webhook_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- Deny-all RLS: the server uses the service role which bypasses RLS;
-- no anon/authenticated policies exist on purpose.
alter table companies enable row level security;
alter table tracked_products enable row level security;
alter table waitlist_entries enable row level security;
alter table restock_events enable row level security;
alter table conversions enable row level security;
alter table webhook_events enable row level security;
