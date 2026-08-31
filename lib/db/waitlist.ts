import { getSupabase } from "@/lib/supabase";
import { ATTRIBUTION_WINDOW_DAYS } from "./conversions";
import type { RestockEvent, WaitlistEntry } from "./types";

export type LegacyWaitlistStatus = "waiting" | "notified" | "converted" | "none";
export type WaitlistStatus = LegacyWaitlistStatus;

export async function joinWaitlist(params: {
	companyId: string;
	productId: string;
	planId: string;
	experienceId: string;
	whopUserId: string;
	username?: string | null;
	email?: string | null;
}) {
	const planId = params.planId;
	const client = getSupabase();
	const { data: existing, error: fetchError } = await client
		.from("waitlist_entries")
		.select("id,status")
		.eq("company_id", params.companyId)
		.eq("plan_id", planId)
		.eq("whop_user_id", params.whopUserId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (fetchError) throw fetchError;
	if (existing?.status === "subscribed") {
		const updates: Record<string, unknown> = {};
		if (params.experienceId) updates.experience_id = params.experienceId;
		if (params.username !== undefined) updates.username = params.username ?? null;
		if (params.email !== undefined) updates.email = params.email ?? null;
		if (Object.keys(updates).length > 0) {
			const { error } = await client
				.from("waitlist_entries")
				.update(updates)
				.eq("id", existing.id);
			if (error) throw error;
		}
		return { alreadyWaiting: true };
	}
	if (existing && existing.status !== "subscribed") {
		const { error } = await client
			.from("waitlist_entries")
			.update({
				status: "subscribed",
				experience_id: params.experienceId,
				username: params.username ?? null,
				email: params.email ?? null,
				last_notified_at: null,
				converted_at: null,
				restock_event_id: null,
			})
			.eq("id", existing.id);
		if (error) throw error;
		return { alreadyWaiting: false };
	}
	const { error } = await client.from("waitlist_entries").insert({
		company_id: params.companyId,
		product_id: params.productId,
		plan_id: planId,
		experience_id: params.experienceId,
		whop_user_id: params.whopUserId,
		username: params.username ?? null,
		email: params.email ?? null,
		status: "subscribed",
	});
	if (error && error.code !== "23505") throw error;
	return { alreadyWaiting: error?.code === "23505" };
}

export async function leaveWaitlist(params: {
	companyId: string;
	productId: string;
	planId: string;
	whopUserId: string;
}) {
	const planId = params.planId;
	const { error } = await getSupabase()
		.from("waitlist_entries")
		.update({ status: "unsubscribed" })
		.eq("company_id", params.companyId)
		.eq("plan_id", planId)
		.eq("whop_user_id", params.whopUserId)
		.eq("status", "subscribed");
	if (error) throw error;
}

export async function getSubscribedEntries(companyId: string, planId: string) {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select()
		.eq("company_id", companyId)
		.eq("plan_id", planId)
		.eq("status", "subscribed")
		.order("created_at");
	if (error) throw error;
	return (data ?? []) as WaitlistEntry[];
}

export async function claimWaitingSubscribers(
	companyId: string,
	planId: string,
	restockEventId: string,
): Promise<WaitlistEntry[]> {
	const client = getSupabase();
	const now = new Date().toISOString();
	const { data, error } = await client
		.from("waitlist_entries")
		.update({ last_notified_at: now, restock_event_id: restockEventId })
		.eq("company_id", companyId)
		.eq("plan_id", planId)
		.eq("status", "subscribed")
		.is("last_notified_at", null)
		.select();
	if (error) throw error;
	return (data ?? []) as WaitlistEntry[];
}

/** Undo a notify claim when delivery failed so the entry stays retryable. */
export async function rollbackNotifyClaims(companyId: string, entryIds: string[]) {
	if (entryIds.length === 0) return;
	const { error } = await getSupabase()
		.from("waitlist_entries")
		.update({ last_notified_at: null, restock_event_id: null })
		.eq("company_id", companyId)
		.in("id", entryIds);
	if (error) throw error;
}

/** Subscribers who still need an alert for the current sold-out / restock cycle. */
export async function countPendingNotifyForPlan(companyId: string, planId: string) {
	const { count, error } = await getSupabase()
		.from("waitlist_entries")
		.select("id", { count: "exact", head: true })
		.eq("company_id", companyId)
		.eq("plan_id", planId)
		.eq("status", "subscribed")
		.is("last_notified_at", null);
	if (error) throw error;
	return count ?? 0;
}

/** New sellout cycle — everyone on the list can be alerted again on the next restock. */
export async function resetPlanNotifyEligibility(companyId: string, planId: string) {
	const { error } = await getSupabase()
		.from("waitlist_entries")
		.update({ last_notified_at: null, restock_event_id: null })
		.eq("company_id", companyId)
		.eq("plan_id", planId)
		.eq("status", "subscribed");
	if (error) throw error;
}

export async function countSubscribedForPlan(companyId: string, planId: string) {
	const { count, error } = await getSupabase()
		.from("waitlist_entries")
		.select("id", { count: "exact", head: true })
		.eq("company_id", companyId)
		.eq("plan_id", planId)
		.eq("status", "subscribed");
	if (error) throw error;
	return count ?? 0;
}

export async function getWaitingCountsByPlan(companyId: string) {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select("plan_id")
		.eq("company_id", companyId)
		.eq("status", "subscribed");
	if (error) throw error;
	const counts = new Map<string, number>();
	for (const row of data ?? []) {
		const planId = row.plan_id as string;
		counts.set(planId, (counts.get(planId) ?? 0) + 1);
	}
	return counts;
}

export async function getWaitingCounts(companyId: string) {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select("product_id")
		.eq("company_id", companyId)
		.eq("status", "subscribed");
	if (error) throw error;
	const counts = new Map<string, number>();
	for (const row of data ?? []) {
		const productId = row.product_id as string;
		counts.set(productId, (counts.get(productId) ?? 0) + 1);
	}
	return counts;
}

export async function getUserWaitlistStatuses(
	companyId: string,
	whopUserId: string,
): Promise<Map<string, WaitlistStatus>> {
	const windowStart = new Date(
		Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select("product_id,status,last_notified_at,converted_at")
		.eq("company_id", companyId)
		.eq("whop_user_id", whopUserId)
		.in("status", ["subscribed", "converted"])
		.order("created_at", { ascending: false });
	if (error) throw error;

	const statuses = new Map<string, WaitlistStatus>();
	for (const row of data ?? []) {
		const productId = row.product_id as string;
		if (statuses.has(productId)) continue;
		if (row.status === "converted") {
			statuses.set(productId, "converted");
			continue;
		}
		if (row.last_notified_at && row.last_notified_at >= windowStart) {
			statuses.set(productId, "notified");
			continue;
		}
		statuses.set(productId, "waiting");
	}
	return statuses;
}

export async function createRestockEvent(
	companyId: string,
	productId: string,
	planId: string,
	source: RestockEvent["source"],
) {
	const { data, error } = await getSupabase()
		.from("restock_events")
		.insert({
			company_id: companyId,
			product_id: productId,
			plan_id: planId,
			source,
		})
		.select()
		.single();
	if (error) throw error;
	return data as RestockEvent;
}

export async function countRestockEventsForPlan(companyId: string, planId: string) {
	const { count, error } = await getSupabase()
		.from("restock_events")
		.select("id", { count: "exact", head: true })
		.eq("company_id", companyId)
		.eq("plan_id", planId);
	if (error) throw error;
	return count ?? 0;
}

export async function setRestockNotifiedCount(
	restockEventId: string,
	notifiedCount: number,
) {
	const { error } = await getSupabase()
		.from("restock_events")
		.update({ notified_count: notifiedCount })
		.eq("id", restockEventId);
	if (error) throw error;
}

export async function markEntriesNotified(
	companyId: string,
	entryIds: string[],
	restockEventId: string,
) {
	if (entryIds.length === 0) return;
	const now = new Date().toISOString();
	const client = getSupabase();
	const { error } = await client
		.from("waitlist_entries")
		.update({
			last_notified_at: now,
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

export async function getUserWaitingProductIds(companyId: string, whopUserId: string) {
	const statuses = await getUserWaitlistStatuses(companyId, whopUserId);
	const waiting = new Set<string>();
	for (const [productId, status] of statuses) {
		if (status === "waiting") waiting.add(productId);
	}
	return waiting;
}

export async function getUserWaitlistStatusesByPlan(companyId: string, whopUserId: string) {
	const { data, error } = await getSupabase()
		.from("waitlist_entries")
		.select("plan_id,status,last_notified_at,converted_at")
		.eq("company_id", companyId)
		.eq("whop_user_id", whopUserId)
		.in("status", ["subscribed", "converted", "unsubscribed"])
		.order("created_at", { ascending: false });
	if (error) throw error;
	const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const statuses = new Map<string, WaitlistStatus | "none">();
	for (const row of data ?? []) {
		const planId = row.plan_id as string;
		if (statuses.has(planId)) continue;
		if (row.status === "converted") {
			statuses.set(planId, "converted");
			continue;
		}
		if (row.status === "subscribed") {
			if (row.last_notified_at && row.last_notified_at >= windowStart) {
				statuses.set(planId, "notified");
			} else {
				statuses.set(planId, "waiting");
			}
			continue;
		}
		statuses.set(planId, "none");
	}
	return statuses;
}
