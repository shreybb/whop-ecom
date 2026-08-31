import { getSupabase } from "@/lib/supabase";
import { ATTRIBUTION_WINDOW_DAYS } from "./conversions";

export type DashboardStats = {
	waiting: number;
	notified: number;
	converted: number;
	recoveredUsd: number;
	conversionRate: number;
};

export type PlanStats = {
	waiting: number;
	pendingNotify: number;
	notified: number;
	converted: number;
	recoveredUsd: number;
	conversionRate: number;
};

export type ProductStats = {
	waiting: number;
	notified: number;
	recoveredUsd: number;
};

function windowStartIso(): string {
	return new Date(
		Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
}
function sumByKey(
	rows: Record<string, unknown>[] | null | undefined,
	key: string,
	valueKey: string,
): Map<string, number> {
	const map = new Map<string, number>();
	for (const row of rows ?? []) {
		const id = row[key] as string;
		map.set(id, (map.get(id) ?? 0) + Number(row[valueKey] ?? 0));
	}
	return map;
}

function countByKey(
	rows: Record<string, unknown>[] | null | undefined,
	key: string,
): Map<string, number> {
	const map = new Map<string, number>();
	for (const row of rows ?? []) {
		const id = row[key] as string;
		map.set(id, (map.get(id) ?? 0) + 1);
	}
	return map;
}


export async function getDashboardStats(companyId: string): Promise<DashboardStats> {
	const client = getSupabase();
	const windowStart = windowStartIso();
	const [waitingRes, notifiedRes, convertedRes, recoveredRes, windowConvRes] =
		await Promise.all([
			client.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "subscribed"),
			client.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).not("last_notified_at", "is", null).gte("last_notified_at", windowStart),
			client.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "converted"),
			client.from("conversions").select("amount_usd").eq("company_id", companyId).is("refunded_at", null),
			client.from("conversions").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", windowStart).is("refunded_at", null),
		]);
	for (const res of [waitingRes, notifiedRes, convertedRes, recoveredRes, windowConvRes]) {
		if (res.error) throw res.error;
	}
	const notified = notifiedRes.count ?? 0;
	const windowConversions = windowConvRes.count ?? 0;
	return {
		waiting: waitingRes.count ?? 0,
		notified,
		converted: convertedRes.count ?? 0,
		recoveredUsd: (recoveredRes.data ?? []).reduce((sum, row) => sum + Number(row.amount_usd ?? 0), 0),
		conversionRate: notified > 0 ? windowConversions / notified : 0,
	};
}

export async function getPerPlanStats(companyId: string): Promise<Map<string, PlanStats>> {
	const client = getSupabase();
	const windowStart = windowStartIso();
	const [entriesRes, recoveredByPlanRes, windowConvByPlanRes] = await Promise.all([
		client.from("waitlist_entries").select("plan_id,status,last_notified_at").eq("company_id", companyId),
		client.from("conversions").select("plan_id,amount_usd").eq("company_id", companyId).is("refunded_at", null),
		client.from("conversions").select("plan_id").eq("company_id", companyId).gte("created_at", windowStart).is("refunded_at", null),
	]);
	if (entriesRes.error) throw entriesRes.error;
	if (recoveredByPlanRes.error) throw recoveredByPlanRes.error;
	if (windowConvByPlanRes.error) throw windowConvByPlanRes.error;
	const map = new Map<string, PlanStats>();
	const get = (planId: string): PlanStats => {
		let s = map.get(planId);
		if (!s) {
			s = { waiting: 0, pendingNotify: 0, notified: 0, converted: 0, recoveredUsd: 0, conversionRate: 0 };
			map.set(planId, s);
		}
		return s;
	};
	for (const row of entriesRes.data ?? []) {
		const planId = row.plan_id as string;
		const s = get(planId);
		if (row.status === "subscribed") {
			s.waiting += 1;
			if (!row.last_notified_at) s.pendingNotify += 1;
		}
		if (row.status === "converted") s.converted += 1;
		const notifiedAt = row.last_notified_at as string | null;
		if (notifiedAt && notifiedAt >= windowStart) s.notified += 1;
	}
	const recoveredByPlan = sumByKey(recoveredByPlanRes.data, "plan_id", "amount_usd");
	const windowConvByPlan = countByKey(windowConvByPlanRes.data, "plan_id");
	for (const [planId, recoveredUsd] of recoveredByPlan) {
		get(planId).recoveredUsd = recoveredUsd;
	}
	for (const [planId, s] of map) {
		const windowConversions = windowConvByPlan.get(planId) ?? 0;
		s.conversionRate = s.notified > 0 ? windowConversions / s.notified : 0;
	}
	return map;
}

export async function getPerProductStats(companyId: string): Promise<Map<string, ProductStats>> {
	const client = getSupabase();
	const windowStart = windowStartIso();
	const [entriesRes, recoveredByProductRes] = await Promise.all([
		client.from("waitlist_entries").select("product_id,status,last_notified_at").eq("company_id", companyId),
		client.from("conversions").select("product_id,amount_usd").eq("company_id", companyId).is("refunded_at", null),
	]);
	if (entriesRes.error) throw entriesRes.error;
	if (recoveredByProductRes.error) throw recoveredByProductRes.error;
	const map = new Map<string, ProductStats>();
	const get = (id: string) => {
		let s = map.get(id);
		if (!s) {
			s = { waiting: 0, notified: 0, recoveredUsd: 0 };
			map.set(id, s);
		}
		return s;
	};
	for (const row of entriesRes.data ?? []) {
		const s = get(row.product_id as string);
		if (row.status === "subscribed") s.waiting += 1;
		const notifiedAt = row.last_notified_at as string | null;
		if (notifiedAt && notifiedAt >= windowStart) s.notified += 1;
	}
	for (const [productId, recoveredUsd] of sumByKey(
		recoveredByProductRes.data,
		"product_id",
		"amount_usd",
	)) {
		get(productId).recoveredUsd = recoveredUsd;
	}
	return map;
}

export type ActivityItem = {
	kind: "join" | "restock" | "conversion";
	productId: string;
	planId?: string;
	detail: string;
	at: string;
};

export async function getRecentActivity(companyId: string, limit = 15): Promise<ActivityItem[]> {
	const client = getSupabase();
	const [joins, restocks, convs] = await Promise.all([
		client.from("waitlist_entries").select("product_id,plan_id,username,whop_user_id,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(limit),
		client.from("restock_events").select("product_id,plan_id,source,notified_count,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(limit),
		client.from("conversions").select("product_id,plan_id,amount_usd,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(limit),
	]);
	if (joins.error) throw joins.error;
	if (restocks.error) throw restocks.error;
	if (convs.error) throw convs.error;
	const items: ActivityItem[] = [
		...(joins.data ?? []).map((r) => ({
			kind: "join" as const,
			productId: r.product_id as string,
			planId: r.plan_id as string,
			detail: `${r.username ?? r.whop_user_id} joined the waitlist`,
			at: r.created_at as string,
		})),
		...(restocks.data ?? []).map((r) => ({
			kind: "restock" as const,
			productId: r.product_id as string,
			planId: (r.plan_id as string | null) ?? undefined,
			detail: `Restock detected (${r.source}) — ${r.notified_count} notified`,
			at: r.created_at as string,
		})),
		...(convs.data ?? []).map((r) => ({
			kind: "conversion" as const,
			productId: r.product_id as string,
			planId: (r.plan_id as string | null) ?? undefined,
			detail: `Recovered sale — $${(Number(r.amount_usd) || 0).toFixed(2)}`,
			at: r.created_at as string,
		})),
	];
	return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
