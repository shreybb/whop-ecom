# Restocked — back-in-stock alerts & drop waitlists for Whop

Whop's drop culture creates sellouts by design: limited stock caps, hype,
gone in minutes. Every sold-out product page then silently turns away
buyers. **Restocked** captures that demand — customers tap "Notify me" on a
sold-out drop, and the moment it's restocked they get a push notification.
Every purchase that follows an alert is attributed, so merchants watch a
live **recovered revenue** counter.

On Shopify, this category (Notify Me!, Amp, Swym) serves tens of thousands
of brands, and back-in-stock alerts are the highest-converting notification
in e-commerce (~60% open rates, 6.5–22% conversion — Omnisend). Whop has
native stock caps but zero recapture tooling: this app fills a real gap.

## How it works

```
Customer (experience view)          Merchant (dashboard view)
  /experiences/[experienceId]         /dashboard/[companyId]
  "Notify me" on sold-out drops       waitlist counts, notify button,
        │                             recovered revenue, activity feed
        ▼                                   │
  ┌───────────────────────────────────────────────────┐
  │ Next.js on Vercel                                 │
  │  server actions ── lib/stock.ts ── lib/db/* ──────┼── Supabase (Postgres)
  │  /api/webhooks  (payment.succeeded, product.*)    │
  │  /api/cron/sync-stock (daily safety net)          │
  └───────────────────────────────────────────────────┘
        │                    ▲
        ▼                    │ x-whop-user-token (verified per request)
  Whop REST API (products, plans, notifications)
```

### Restock detection (defense in depth)

Whop has no stock field on products — availability lives on plans
(`stock` / `unlimited_stock`). We cache each tenant's stock state in
`tracked_products` and detect transitions through four independent paths:

1. **`product.*` webhooks** — a restock made in the Whop dashboard fires a
   re-sync within seconds.
2. **Lazy sync on page views** — any customer or merchant opening the app
   refreshes stock state (throttled to once/minute per tenant).
3. **Daily cron** — upper bound on staleness for dormant tenants.
4. **Manual "Notify waitlist" button** — the merchant stays in control.

A sold-out → in-stock transition creates a `restock_event` and (if
auto-notify is on) pushes alerts to everyone waiting. An in-stock →
sold-out transition notifies the merchant's team that the waitlist is
armed. `payment.succeeded` also forces a re-sync, so the sale that consumes
the last unit flags the sellout in near real-time.

### Attribution

On `payment.succeeded`, if the buyer holds a `notified` waitlist entry for
that product from the last 7 days, the payment is recorded in
`conversions` (idempotent on payment id) and the entry becomes
`converted`. That sum is the recovered-revenue metric.

## Multi-tenancy

The tenant is the installing Whop company (`biz_*`).

- **Every table carries `company_id`**; every function in `lib/db/*`
  requires it. There are no cross-tenant queries.
- **Tenant identity is never taken from the client.** The experience view
  derives the company from `experiences.retrieve(experienceId)` after
  verifying the Whop user token; the dashboard honors its `companyId` path
  param only after `checkAccess` confirms the caller is an **admin** of
  that company. Server actions re-verify on every call.
- **Supabase is server-only** (service role); RLS is enabled on all tables
  with no policies as a deny-all backstop, so no anon key can ever read
  tenant data.
- **Webhooks are HMAC-verified** (Standard Webhooks) and ingestion is
  idempotent via a primary key on Whop's webhook id — Whop delivers
  at-least-once.

## Stack

- **Next.js 16** (App Router, server actions) on the official
  [Whop app template](https://github.com/whopio/whop-nextjs-app-template)
- **`@whop/sdk` 0.0.3** (template-pinned: the latest SDK dropped
  `verifyUserToken`/`webhooks.unwrap`; notifications predate the SDK, so
  `lib/notify.ts` calls the REST endpoint directly)
- **Supabase** (Postgres) for all app-owned state — schema in
  `supabase/migrations/`
- **Vercel** for hosting, cron, and `waitUntil` background work

## Repo map

```
app/
  experiences/[experienceId]/   customer "Drops" view + waitlist button
  dashboard/[companyId]/        merchant dashboard (stats, table, feed)
  api/webhooks/                 payment.succeeded + product.* ingestion
  api/cron/sync-stock/          daily safety-net sync
  actions.ts                    server actions (auth re-verified per call)
lib/
  whop-sdk.ts                   lazy Whop client
  notify.ts                     push notifications (REST, chunked)
  stock.ts                      stock sync, restock/sellout transitions
  db/                           tenant-scoped data access per domain
supabase/migrations/            schema (multi-tenant, RLS deny-all)
```

## Local development

```bash
npm install
cp .env.development .env.local   # fill in real values
npm run dev                      # wraps whop-proxy for real iframe auth
```

Env vars: `WHOP_API_KEY`, `NEXT_PUBLIC_WHOP_APP_ID`, `WHOP_WEBHOOK_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

In the Whop developer dashboard: set the app's experience path to
`/experiences/[experienceId]`, dashboard path to `/dashboard/[companyId]`,
create a webhook to `/api/webhooks` subscribed to `payment.succeeded` and
`product.updated`, and request permissions for reading products, plans,
payments, members and sending notifications.
