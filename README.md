# Restocked

Back-in-stock alerts and drop waitlists for Whop merchants.

When a plan sells out, customers tap **Notify me** on your Drops tab. When stock comes back, they get a push (and email if configured). Sales after an alert show up as **recovered revenue** on the merchant dashboard.

**Production:** [whop-ecom-beta.vercel.app](https://whop-ecom-beta.vercel.app)  
**Whop app:** Restocked (`app_B3l8MqujOfDV77`)

---

## How it works

```
Customer                         Merchant
/experiences/[experienceId]      /dashboard/[companyId]
"Notify me" on sold-out plans    waitlist, notify, recovered revenue
        │                                │
        └──────── Next.js + Supabase ──┘
                      │
              Whop API (plans, stock, notifications)
```

### The one thing to remember: stock is per **plan**

Whop inventory lives on **plans** (size, price tier, variant)—not on the product title or images.

| You change… | Restocked learns about it via… |
| --- | --- |
| Create a product / plan | Webhooks (`product.*`, `plan.created`) |
| Edit plan **stock** (0 → 1) | **Sync stock** button or dashboard load (see webhooks note below) |
| Someone buys the last unit | Webhook `payment.succeeded` + sync |

### Restock alerts (four ways we detect stock)

1. **Webhooks** — `product.*`, `plan.*`, `payment.succeeded` trigger a full stock sync.
2. **Page loads** — opening the customer or merchant app syncs stock (throttled to once per minute).
3. **Sync stock** — merchant button; always pulls live data from Whop (most reliable for restocks).
4. **Daily cron** — `/api/cron/sync-stock` safety net (once per day on Vercel Hobby).

When we see a plan go **sold out → in stock**, subscribed fans get a **restock alert** (if auto-notify is on). Merchants can also send **Restock alert** or **Send update** manually from the dashboard.

---

## Whop setup checklist

Do this once in [Whop Developer](https://whop.com/dashboard/developer) for your app.

### Hosting

| Field | Value |
| --- | --- |
| Base URL | `https://whop-ecom-beta.vercel.app` |
| Dashboard path | `/dashboard/[companyId]` |
| Experience path | `/experiences/[experienceId]` |

### API permissions

`product`, `plan`, `payment`, and `member` read, plus `notification:create`.  
For email alerts: `member:email:read` and configure Resend (below).

### Webhook

| Setting | Value |
| --- | --- |
| URL | `https://whop-ecom-beta.vercel.app/api/webhooks` |
| Secret | Copy into Vercel as `WHOP_WEBHOOK_SECRET` (starts with `ws_` or `whsec_`—paste as-is, no encoding) |
| Events | `payment.succeeded`, `product.created`, `product.updated`, `plan.created`, `plan.updated`, `plan.deleted`, `refund.created`, `refund.updated` |

**Webhook note:** Create/update events (`product.*`, `plan.created`) deliver reliably. As of testing, **changing only plan stock** in the Whop dashboard may not emit `plan.updated`. Use **Sync stock** on the Restocked dashboard after restocking—that path always works.

Test: Whop → Webhooks → **Send test event** → expect `{"ok":true}`.

### Merchant onboarding

1. Install the app on the business.
2. Attach the **Drops** experience to products you want on the waitlist.
3. Cap stock on the **plan** (turn off unlimited stock, set units).
4. Share the Drops tab—customers join the waitlist when sold out.

---

## Environment variables

Set on Vercel (and in `.env.local` for local dev).

| Variable | Required | Notes |
| --- | --- | --- |
| `WHOP_API_KEY` | Yes | App API key |
| `NEXT_PUBLIC_WHOP_APP_ID` | Yes | `app_…` |
| `WHOP_API_BASE` | Yes | Production: `https://api.whop.com/api/v1` · Sandbox: `https://sandbox-api.whop.com/api/v1` |
| `WHOP_WEBHOOK_SECRET` | Yes | From webhook settings |
| `SUPABASE_URL` | Yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only |
| `CRON_SECRET` | Yes | Protects cron + ops health |
| `RESEND_API_KEY` | No | Email alerts |
| `EMAIL_FROM` | No | Required with Resend |

Health check: `GET /api/health` → `{ "ready": true, … }`

---

## Local development

```bash
pnpm install
cp .env.development .env.local   # fill in real values
pnpm dev                         # whop-proxy for iframe auth
pnpm test
pnpm build
```

### Database

Run migrations in order under `supabase/migrations/` on your Supabase project (`0001` → latest).

### Useful scripts

| Script | Purpose |
| --- | --- |
| `node scripts/check-whop-webhooks.mjs` | List webhooks registered for your API key |
| `node scripts/send-test-webhook.mjs plan.updated` | POST a signed test webhook to production (needs `WHOP_WEBHOOK_SECRET` in `.env.local`) |

---

## Project layout

```
app/
  experiences/[experienceId]/   Customer Drops view + waitlist
  dashboard/[companyId]/        Merchant dashboard
  api/webhooks/                 Whop webhooks → stock sync + attribution
  api/cron/sync-stock/          Daily stock safety net
lib/
  stock.ts                      Sync, restock detection, notify
  alerts.ts                     Push + email delivery
  db/                           Tenant-scoped Supabase access
  webhook-catalog.ts            Resolve company from webhook payloads
  whop-webhook-verify.ts        ws_ / whsec_ signature verification
```

Every table is scoped by `company_id` (`biz_*`). The server never trusts client-supplied tenant IDs without a Whop token + access check.

---

## Demo flow

1. Create a product with a **capped plan** (e.g. 1 unit).
2. Sell it out (or set stock to 0).
3. Join the waitlist from the Drops experience.
4. Set plan stock back to 1 → click **Sync stock** on the dashboard.
5. Fan gets restock alert; purchase shows as recovered revenue.

---

## Stack

Next.js 16 · `@whop/sdk` 0.0.3 · Supabase · Vercel · Resend (optional email)
