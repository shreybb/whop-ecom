-- Soft-archive stale tracked plans (no waitlist cascade) + webhook in-flight lock.

-- ---------------------------------------------------------------------------
-- tracked_products: archive instead of hard delete
-- ---------------------------------------------------------------------------
alter table tracked_products
  add column archived_at timestamptz;

create index tracked_products_active
  on tracked_products (company_id)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- webhook_events: prevent concurrent processing of the same event
-- ---------------------------------------------------------------------------
alter table webhook_events
  add column processing_started_at timestamptz;

-- ---------------------------------------------------------------------------
-- FKs: never cascade-delete waitlists/conversions when a plan row disappears
-- (archive uses UPDATE, not DELETE; RESTRICT blocks accidental hard deletes)
-- ---------------------------------------------------------------------------
alter table waitlist_entries
  drop constraint if exists waitlist_entries_plan_fk;

alter table waitlist_entries
  add constraint waitlist_entries_plan_fk
  foreign key (company_id, product_id, plan_id)
  references tracked_products (company_id, product_id, plan_id)
  on delete restrict;

alter table conversions
  drop constraint if exists conversions_plan_fk;

alter table conversions
  add constraint conversions_plan_fk
  foreign key (company_id, product_id, plan_id)
  references tracked_products (company_id, product_id, plan_id)
  on delete restrict;
