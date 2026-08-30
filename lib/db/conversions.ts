import { getSupabase } from "@/lib/supabase";
import type { WaitlistEntry, WebhookEvent } from "./types";

export const ATTRIBUTION_WINDOW_DAYS = 7;

function windowStartIso(): string {
	return new Date(
		Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
}

export async function recordConversionIfAttributed(params: {
	companyId: string;
	productId: string;
	planId?: string;
	whopUserId: string;
	paymentId: string;
	amountUsd: number | null;
	currency: string | null;
}) {
	const client = getSupabase();
	const windowStart = windowStartIso();
	let query = client
		.from("waitlist_entries")
		.select()
		.eq("company_id", params.companyId)
		.eq("whop_user_id", params.whopUserId)
		.in("status", ["subscribed", "converted"])
		.not("last_notified_at", "is", null)
		.gte("last_notified_at", windowStart)
		.order("last_notified_at", { ascending: false })
		.limit(1);
	if (params.planId) query = query.eq("plan_id", params.planId);
	else query = query.eq("product_id", params.productId);
	const { data: entries, error } = await query;
	if (error) throw error;
	const entry = (entries ?? [])[0] as WaitlistEntry | undefined;
	if (!entry || entry.status === "converted") return null;

	const { error: convError } = await client.from("conversions").insert({
		company_id: params.companyId,
		product_id: params.productId,
		plan_id: entry.plan_id,
		whop_user_id: params.whopUserId,
		payment_id: params.paymentId,
		waitlist_entry_id: entry.id,
		amount_usd: params.amountUsd,
		currency: params.currency,
	});
	if (convError && convError.code !== "23505") throw convError;
	if (convError) return null;

	const { error: updError } = await client
		.from("waitlist_entries")
		.update({ status: "converted", converted_at: new Date().toISOString() })
		.eq("id", entry.id);
	if (updError) throw updError;
	return entry;
}

export async function markConversionRefunded(paymentId: string) {
	const { error } = await getSupabase()
		.from("conversions")
		.update({ refunded_at: new Date().toISOString() })
		.eq("payment_id", paymentId)
		.is("refunded_at", null);
	if (error) throw error;
}

export async function claimWebhookEvent(
	id: string,
	type: string,
	payload: unknown,
): Promise<boolean> {
	const { error } = await getSupabase()
		.from("webhook_events")
		.insert({ id, type, payload });
	if (error && error.code === "23505") return false;
	if (error) throw error;
	return true;
}

export async function getWebhookEvent(id: string): Promise<WebhookEvent | null> {
	const { data, error } = await getSupabase()
		.from("webhook_events")
		.select()
		.eq("id", id)
		.maybeSingle();
	if (error) throw error;
	return (data as WebhookEvent | null) ?? null;
}

export async function incrementWebhookAttempt(id: string, lastError: string) {
	const client = getSupabase();
	const existing = await getWebhookEvent(id);
	if (!existing) return;
	const { error } = await client
		.from("webhook_events")
		.update({
			attempts: (existing.attempts ?? 0) + 1,
			last_error: lastError,
		})
		.eq("id", id);
	if (error) throw error;
}

export async function markWebhookProcessed(id: string) {
	const { error } = await getSupabase()
		.from("webhook_events")
		.update({ processed_at: new Date().toISOString(), last_error: null })
		.eq("id", id);
	if (error) throw error;
}
