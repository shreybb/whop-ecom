import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key. This bypasses RLS,
// so tenant isolation is enforced in lib/db.ts where every query is scoped by
// company_id derived from a verified Whop token — never from client input.
export function getSupabase() {
	const url = process.env.SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
	}
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
