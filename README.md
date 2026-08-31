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

## Why back-in-stock (not reviews)

The assignment asked us to pick one of two Shopify categories and ship it
for Whop. On Shopify install volume, **product reviews** lead the pack
(Judge.me alone reports ~401k installs); **back-in-stock / waitlist apps**
(Notify Me!, Amp, Swym) are a close #2. We shipped **back-in-stock** because
Whop already has the ingredients reviews do not solve here: native plan-level
stock caps, a drop culture that sells out on purpose, and **zero recapture
tooling** when inventory hits zero. Reviews attach to the business, not a
sold-out SKU — they do not bring buyers back the second a restock lands.

## Merchant gap notes (Blacktop Supply Co)

Setting up the demo store on Whop vs a typical Shopify BIS stack surfaced
gaps we built Restocked to cover:

- **Stock lives on plans, not products** — capped inventory is per
  size/color/price tier; merchants need plan-grain visibility, not a single
  product badge.
- **No back-in-stock flow** — a sold-out Whop product page is a dead end;
  there is no Notify-me widget or waitlist capture on the native checkout
  surface (Whop apps cannot inject into checkout).
- **No product-page recapture widget** — Shopify BIS apps embed on the PDP;
  on Whop the substitute is a **Drops experience tab** attached to products
  (including a free/public product if the merchant wants non-members on the
  waitlist).
- **Reviews are business-level** — Judge.me-style review widgets do not
  fire when a specific variant restocks; they do not replace demand capture
  after a sellout.
- **Distribution is manual** — onboarding must tell merchants to attach
  the experience, cap stock on a plan, and treat the Drops tab as the
  recapture surface.

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
  │  /api/webhooks  (payment.succeeded, product.*,   │
  │                  plan.*, refund.*)             │
  │  /api/cron/sync-stock (daily on Vercel Hobby)     │
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
3. **Daily cron** — upper bound on staleness for dormant tenants (Vercel Hobby runs cron once per day; upgrade to Pro for hourly).
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
  api/webhooks/                 payment.succeeded, product.*, plan.*, refund.*
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

Env vars: `WHOP_API_KEY`, `WHOP_API_BASE` (sandbox:
`https://sandbox-api.whop.com/api/v1`), `NEXT_PUBLIC_WHOP_APP_ID`,
`WHOP_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET` (protects `/api/cron/sync-stock` and authorized `/api/health`). On Vercel Hobby, cron runs once per day — upgrade to Pro for hourly. Optional email alerts: `RESEND_API_KEY`, `EMAIL_FROM` (needs
`member:email:read` on the Whop app).

### Sandbox setup (sandbox.whop.com)

App `app_WemaJ0mtcGCZWd` · company `biz_LOXBFWIxhgbn2M` · route `whop-ecom`

Dashboard checklist (API key cannot set hosting/webhooks without scopes):

1. Hosting: base URL `https://whop-ecom-beta.vercel.app`, dashboard path `/dashboard/[companyId]`
2. Permissions: product, plan, payment, member read + notification:create
3. Webhook → `/api/webhooks` (payment.succeeded, product.*, plan.created, plan.updated, plan.deleted, refund.created, refund.updated)
4. Install: `https://sandbox.whop.com/apps/app_WemaJ0mtcGCZWd/install`
5. Add Drops experience to products (`scripts/seed-products-manual.sh`)
6. Supabase: run `supabase/migrations/0001_init.sql`, wire env on Vercel

Health: `GET /api/health` · Demo: sell out capped product → waitlist → restock → buy → recovered revenue

### Production

Repeat on whop.com, set `WHOP_API_BASE=https://api.whop.com/api/v1`, submit to App Store.
