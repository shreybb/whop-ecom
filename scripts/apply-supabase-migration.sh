#!/usr/bin/env bash
# Apply schema to a Supabase project (requires supabase login or SUPABASE_ACCESS_TOKEN).
set -euo pipefail
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"

supabase db push --project-ref "$SUPABASE_PROJECT_REF" --db-url "${DATABASE_URL:-}"
