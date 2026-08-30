import { getSupabase } from "@/lib/supabase";

export type DashboardStats = {
	waiting: number;
	notified: number;
	converted: number;
	recoveredUsd: number;
};

export async function getDashboardStats(
	companyId: string,
): Promise<DashboardStats> {
	const client = getSupabase();
	const [entriesRes, convRes] = await Promise.all([
		client
			.from("waitlist_entries")
			.select("status")
			.eq("company_id", companyId),
		client
			.from("conversions")
			.select("amount_usd")
			.eq("company_id", companyId),
	]);
	if (entriesRes.error) throw entriesRes.error;
	if (convRes.error) throw convRes.error;
	const statuses = (entriesRes.data ?? []).map((r) => r.status as string);
	return {
		waiting: statuses.filter((s) => s === "waiting").length,
		// "notified" includes entries that later converted.
		notified: statuses.filter((s) => s === "notified" || s === "converted")
			.length,
		converted: statuses.filter((s) => s === "converted").length,
		recoveredUsd: (convRes.data ?? []).reduce(
			(sum, c) => sum + (Number(c.amount_usd) || 0),
			0,
		),
	};
}

export type ProductStats = {
	waiting: number;
	notified: number;
	recoveredUsd: number;
};

export async function getPerProductStats(
	companyId: string,
): Promise<Map<string, ProductStats>> {
	const client = getSupabase();
	const [entriesRes, convRes] = await Promise.all([
		client
			.from("waitlist_entries")
			.select("product_id,status")
			.eq("company_id", companyId),
		client
			.from("conversions")
			.select("product_id,amount_usd")
			.eq("company_id", companyId),
	]);
	if (entriesRes.error) throw entriesRes.error;
	if (convRes.error) throw convRes.error;
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
		if (row.status === "waiting") s.waiting += 1;
		else s.notified += 1;
	}
	for (const row of convRes.data ?? []) {
		get(row.product_id as string).recoveredUsd += Number(row.amount_usd) || 0;
	}
	return map;
}

export type ActivityItem = {
	kind: "join" | "restock" | "conversion";
	productId: string;
	detail: string;
	at: string;
};

export async function getRecentActivity(
	companyId: string,
	limit = 15,
): Promise<ActivityItem[]> {
	const client = getSupabase();
	const [joins, restocks, convs] = await Promise.all([
		client
			.from("waitlist_entries")
			.select("product_id,username,whop_user_id,created_at")
			.eq("company_id", companyId)
			.order("created_at", { ascending: false })
			.limit(limit),
		client
			.from("restock_events")
			.select("product_id,source,notified_count,created_at")
			.eq("company_id", companyId)
			.order("created_at", { ascending: false })
			.limit(limit),
		client
			.from("conversions")
			.select("product_id,amount_usd,created_at")
			.eq("company_id", companyId)
			.order("created_at", { ascending: false })
			.limit(limit),
	]);
	if (joins.error) throw joins.error;
	if (restocks.error) throw restocks.error;
	if (convs.error) throw convs.error;

	const items: ActivityItem[] = [
		...(joins.data ?? []).map((r) => ({
			kind: "join" as const,
			productId: r.product_id as string,
			detail: `${r.username ?? r.whop_user_id} joined the waitlist`,
			at: r.created_at as string,
		})),
		...(restocks.data ?? []).map((r) => ({
			kind: "restock" as const,
			productId: r.product_id as string,
			detail: `Restock detected (${r.source}) — ${r.notified_count} notified`,
			at: r.created_at as string,
		})),
		...(convs.data ?? []).map((r) => ({
			kind: "conversion" as const,
			productId: r.product_id as string,
			detail: `Recovered sale — $${(Number(r.amount_usd) || 0).toFixed(2)}`,
			at: r.created_at as string,
		})),
	];
	return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
