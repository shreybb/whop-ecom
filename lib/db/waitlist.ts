import { getSupabase } from "@/lib/supabase";
import type { RestockEvent, WaitlistEntry } from "./types";

export async function joinWaitlist(params: {
	companyId: string;
	productId: string;
	experienceId: string;
	whopUserId: string;
	username?: string | null;
}) {
	// The partial unique index makes duplicate joins a no-op.
	const { error } = await getSupabase().from("waitlist_entries").insert({
		company_id: params.companyId,
		product_id: params.productId,
		experience_id: params.experienceId,
		whop_user_id: params.whopUserId,
		username: params.username ?? null,
	});
	if (error && error.code !== "23505") throw error;
	return { alreadyWaiting: error?.code === "23505" };
}

export async function leaveWaitlist(params: {
	companyId: string;
	productId: string;
	whopUserId: string;
}) {
	const { error } = await getSupabase()
		.from("waitlist_entries")
		.delete()
		.eq("company_id", params.companyId)
		.eq("product_id", params.productId)
		.eq("whop_user_id", params.whopUserId)
		.eq("status", "waiting");
	if (error) throw error;
}

export async function getWaitingEntries(companyId: string, productId: string) {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select()
		.eq("company_id", companyId)
		.eq("product_id", productId)
		.eq("status", "waiting")
		.order("created_at");
	if (error) throw error;
	return (data ?? []) as WaitlistEntry[];
}

export async function getUserWaitingProductIds(
	companyId: string,
	whopUserId: string,
): Promise<Set<string>> {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select("product_id")
		.eq("company_id", companyId)
		.eq("whop_user_id", whopUserId)
		.eq("status", "waiting");
	if (error) throw error;
	return new Set((data ?? []).map((r) => r.product_id as string));
}

export async function getWaitingCounts(
	companyId: string,
): Promise<Map<string, number>> {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select("product_id")
		.eq("company_id", companyId)
		.eq("status", "waiting");
	if (error) throw error;
	const counts = new Map<string, number>();
	for (const row of data ?? []) {
		const id = row.product_id as string;
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}

export async function createRestockEvent(
	companyId: string,
	productId: string,
	source: RestockEvent["source"],
) {
	const { data, error } = await getSupabase()
		.from("restock_events")
		.insert({ company_id: companyId, product_id: productId, source })
		.select()
		.single();
	if (error) throw error;
	return data as RestockEvent;
}

export async function markEntriesNotified(
	companyId: string,
	entryIds: string[],
	restockEventId: string,
) {
	if (entryIds.length === 0) return;
	const client = getSupabase();
	const { error } = await client
		.from("waitlist_entries")
		.update({
			status: "notified",
			notified_at: new Date().toISOString(),
			restock_event_id: restockEventId,
		})
		.eq("company_id", companyId)
		.in("id", entryIds);
	if (error) throw error;
	const { error: countError } = await client
		.from("restock_events")
		.update({ notified_count: entryIds.length })
		.eq("id", restockEventId);
	if (countError) throw countError;
}
