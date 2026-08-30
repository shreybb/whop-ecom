#!/usr/bin/env bash
# Manual product seeding checklist when API lacks plan:create scope.
# Company: biz_LOXBFWIxhgbn2M (Whop-Ecom) | App product: prod_K84wbdfcElqPM
cat <<'EOF'
Create in sandbox.whop.com → your Whop-Ecom business:

1. Product "Drop Tee" — one-time plan, $29, stock cap = 2 (demo sellout)
2. Product "Sticker Pack" — one-time plan, $5, unlimited stock
3. Attach the "drops" app experience to both products (sidebar tab)

Test card: 4242 4242 4242 4242, any future expiry, any CVC.

Demo loop:
  a) Buy Drop Tee twice → sells out
  b) Open Drops tab → Notify me
  c) Restock (increase stock) or click Notify waitlist in dashboard
  d) Buy again with same account → recovered revenue increments
EOF
