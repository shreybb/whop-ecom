-- Restocked 0002: plan-level stock cache, persistent waitlists, webhook retry
-- columns, plan-scoped conversions.
--
-- Backfill note: product-level tracked_products and legacy waitlist rows are
-- cleared here. The next stock sync repopulates tracked_products per plan;
-- customers re-join waitlists at plan grain (Agent D UI). Safe for demo-empty
-- tenants; production with live waitlists needs a Whop API backfill before apply.

-- ---------------------------------------------------------------------------
-- companies: custom notify copy + install provenance
-- ---------------------------------------------------------------------------
alter table companies
  add column notify_title text,
  add column notify_body text,
  add column created_from_install boolean not null default false;

-- ---------------------------------------------------------------------------
-- webhook_events: processing state (claim != success)
-- ---------------------------------------------------------------------------
alter table webhook_events
  add column processed_at timestamptz,
  add column attempts integer not null default 0,
  add column last_error text;

create index webhook_events_unprocessed
  on webhook_events (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- tracked_products: one row per (company, product, plan)
-- ---------------------------------------------------------------------------
alter table tracked_products rename to tracked_products_legacy;

create table tracked_products (
  company_id text not null references companies(id) on delete cascade,
  product_id text not null,
  plan_id text not null,
  title text not null,
  plan_title text,
  route text,
  currency text,
  price numeric,
  purchase_url text,
  image_url text,
  visibility text,
  in_stock boolean not null default true,
  stock_left integer,
  unlimited boolean not null default false,
  last_synced_at timestamptz not null default now(),
  primary key (company_id, product_id, plan_id)
);

-- Legacy product-level cache is dropped; sync repopulates at plan grain.
drop table tracked_products_legacy;

-- ---------------------------------------------------------------------------
-- restock_events: plan grain + waitlist FK target
-- ---------------------------------------------------------------------------
alter table restock_events
  add column plan_id text;

create index restocks_by_plan on restock_events (company_id, plan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- waitlist_entries: persistent subscribe (subscribed | converted | unsubscribed)
-- ---------------------------------------------------------------------------
alter table waitlist_entries
  add column plan_id text,
  add column email text;

alter table waitlist_entries
  rename column notified_at to last_notified_at;

-- Legacy rows cannot be mapped to a plan without Whop API data.
delete from waitlist_entries;

alter table waitlist_entries
  alter column plan_id set not null;

alter table waitlist_entries
  drop constraint if exists waitlist_entries_status_check;

alter table waitlist_entries
  add constraint waitlist_entries_status_check
  check (status in ('subscribed', 'converted', 'unsubscribed'));

alter table waitlist_entries
  alter column status set default 'subscribed';

drop index if exists waitlist_one_active;
drop index if exists waitlist_by_product;
drop index if exists waitlist_by_user;

create unique index waitlist_one_active
  on waitlist_entries (company_id, plan_id, whop_user_id)
  where status = 'subscribed';

create index waitlist_by_plan on waitlist_entries (company_id, plan_id, status);
create index waitlist_by_user on waitlist_entries (company_id, whop_user_id, status);

-- ---------------------------------------------------------------------------
-- conversions: plan attribution + refunds
-- ---------------------------------------------------------------------------
alter table conversions
  add column plan_id text,
  add column refunded_at timestamptz;

create index conversions_by_plan on conversions (company_id, plan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- foreign keys (plan rows must exist before waitlist/conversion inserts)
-- ---------------------------------------------------------------------------
alter table waitlist_entries
  add constraint waitlist_entries_plan_fk
  foreign key (company_id, product_id, plan_id)
  references tracked_products (company_id, product_id, plan_id)
  on delete cascade;

alter table waitlist_entries
  add constraint waitlist_entries_restock_fk
  foreign key (restock_event_id)
  references restock_events (id)
  on delete set null;

alter table conversions
  add constraint conversions_plan_fk
  foreign key (company_id, product_id, plan_id)
  references tracked_products (company_id, product_id, plan_id)
  on delete cascade;

-- 0001 had RLS on tracked_products; the recreated table needs it again.
alter table tracked_products enable row level security;
