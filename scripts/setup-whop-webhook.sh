#!/usr/bin/env bash
# Wire Whop sandbox webhook + print dashboard checklist.
# Run after hosting paths are set in sandbox.whop.com dashboard.
set -euo pipefail

: "${WHOP_API_KEY:?Set WHOP_API_KEY}"
: "${WHOP_COMPANY_ID:?Set WHOP_COMPANY_ID (biz_... from app company)}"

BASE="${WHOP_API_BASE:-https://sandbox-api.whop.com/api/v1}"
WEBHOOK_URL="${WEBHOOK_URL:-https://whop-ecom-beta.vercel.app/api/webhooks}"

echo "Creating webhook at $WEBHOOK_URL for company $WHOP_COMPANY_ID ..."
RESP=$(curl -sS -X POST \
  -H "Authorization: Bearer $WHOP_API_KEY" \
  -H "Content-Type: application/json" \
  "$BASE/webhooks" \
  -d "{\"url\":\"$WEBHOOK_URL\",\"events\":[\"payment.succeeded\",\"product.updated\",\"product.created\"],\"company_id\":\"$WHOP_COMPANY_ID\"}")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

SECRET=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('secret') or d.get('webhook_secret') or '')" 2>/dev/null || true)
if [ -n "$SECRET" ]; then
  echo ""
  echo "Webhook secret (save to WHOP_WEBHOOK_SECRET / Vercel):"
  echo "$SECRET"
else
  echo ""
  echo "Webhook API create failed — create manually in sandbox.whop.com:"
  echo "  Developer → your app → Webhooks → URL: $WEBHOOK_URL"
  echo "  Events: payment.succeeded, product.updated, product.created"
fi
