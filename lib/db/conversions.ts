import { getSupabase } from "@/lib/supabase";
import type { WaitlistEntry } from "./types";

const ATTRIBUTION_WINDOW_DAYS = 7;

// Find a notified entry for this buyer+product inside the attribution
// window and record the conversion. Idempotent per payment id.
export async function recordConversionIfAttributed(params: {
	companyId: string;
	productId: string;
	whopUserId: string;
	paymentId: string;
	amountUsd: number | null;
	currency: string | null;
}) {
	const client = getSupabase();
	const windowStart = new Date(
		Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
	const { data: entries, error } = await client
		.from("waitlist_entries")
		.select()
		.eq("company_id", params.companyId)
		.eq("product_id", params.productId)
		.eq("whop_user_id", params.whopUserId)
		.eq("status", "notified")
		.gte("notified_at", windowStart)
		.limit(1);
	if (error) throw error;
	const entry = (entries ?? [])[0] as WaitlistEntry | undefined;
	if (!entry) return null;

	const { error: convError } = await client.from("conversions").insert({
		company_id: params.companyId,
		product_id: params.productId,
		whop_user_id: params.whopUserId,
		payment_id: params.paymentId,
		waitlist_entry_id: entry.id,
		amount_usd: params.amountUsd,
		currency: params.currency,
	});
	// 23505 = this payment was already attributed (webhook redelivery).
	if (convError && convError.code !== "23505") throw convError;
	if (convError) return null;

	const { error: updError } = await client
		.from("waitlist_entries")
		.update({ status: "converted", converted_at: new Date().toISOString() })
		.eq("id", entry.id);
	if (updError) throw updError;
	return entry;
}

// True if this webhook id has not been processed before (Whop delivers
// at-least-once, so ingestion must be idempotent).
export async function claimWebhookEvent(
	id: string,
	type: string,
	payload: unknown,
) {
	const { error } = await getSupabase()
		.from("webhook_events")
		.insert({ id, type, payload });
	if (error && error.code === "23505") return false;
	if (error) throw error;
	return true;
}
