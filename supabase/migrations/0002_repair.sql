-- One-shot repair script (not a second 0002 migration).
-- Repair partial 0002 apply. Safe to re-run (idempotent where possible).
-- Run in Supabase SQL Editor after a failed 0002 migration.

-- ---------------------------------------------------------------------------
-- 1) companies
-- ---------------------------------------------------------------------------
alter table companies
  add column if not exists notify_title text,
  add column if not exists notify_body text;

alter table companies
  add column if not exists created_from_install boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) webhook_events
-- ---------------------------------------------------------------------------
alter table webhook_events
  add column if not exists processed_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text;

create index if not exists webhook_events_unprocessed
  on webhook_events (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- 3) tracked_products → plan grain (skip if plan_id already exists)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tracked_products'
      and column_name = 'plan_id'
  ) then
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

    drop table tracked_products_legacy;
  end if;
end $$;

alter table tracked_products enable row level security;

-- ---------------------------------------------------------------------------
-- 4) restock_events
-- ---------------------------------------------------------------------------
alter table restock_events
  add column if not exists plan_id text;

create index if not exists restocks_by_plan
  on restock_events (company_id, plan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) waitlist_entries (plan_id must exist before FKs)
-- ---------------------------------------------------------------------------
alter table waitlist_entries
  add column if not exists plan_id text,
  add column if not exists email text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist_entries'
      and column_name = 'notified_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist_entries'
      and column_name = 'last_notified_at'
  ) then
    alter table waitlist_entries rename column notified_at to last_notified_at;
  end if;
end $$;

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

create unique index if not exists waitlist_one_active
  on waitlist_entries (company_id, plan_id, whop_user_id)
  where status = 'subscribed';

create index if not exists waitlist_by_plan
  on waitlist_entries (company_id, plan_id, status);

create index if not exists waitlist_by_user
  on waitlist_entries (company_id, whop_user_id, status);

-- ---------------------------------------------------------------------------
-- 6) conversions
-- ---------------------------------------------------------------------------
alter table conversions
  add column if not exists plan_id text,
  add column if not exists refunded_at timestamptz;

create index if not exists conversions_by_plan
  on conversions (company_id, plan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7) foreign keys (only after plan_id columns exist)
-- ---------------------------------------------------------------------------
alter table waitlist_entries
  drop constraint if exists waitlist_entries_plan_fk;

alter table waitlist_entries
  add constraint waitlist_entries_plan_fk
  foreign key (company_id, product_id, plan_id)
  references tracked_products (company_id, product_id, plan_id)
  on delete cascade;

alter table waitlist_entries
  drop constraint if exists waitlist_entries_restock_fk;

alter table waitlist_entries
  add constraint waitlist_entries_restock_fk
  foreign key (restock_event_id)
  references restock_events (id)
  on delete set null;

alter table conversions
  drop constraint if exists conversions_plan_fk;

alter table conversions
  add constraint conversions_plan_fk
  foreign key (company_id, product_id, plan_id)
  references tracked_products (company_id, product_id, plan_id)
  on delete cascade;
