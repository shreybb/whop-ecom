import { getSupabase } from "@/lib/supabase";
import type { TrackedPlan, TrackedProduct } from "./types";

export async function getTrackedPlans(companyId: string): Promise<TrackedPlan[]> {
	const { data, error } = await getSupabase()
		.from("tracked_products")
		.select()
		.eq("company_id", companyId)
		.order("title")
		.order("plan_title");
	if (error) throw error;
	return (data ?? []) as TrackedPlan[];
}

export async function getTrackedProducts(companyId: string): Promise<TrackedProduct[]> {
	const plans = await getTrackedPlans(companyId);
	return aggregatePlansToProducts(plans);
}

export function aggregatePlansToProducts(plans: TrackedPlan[]): TrackedProduct[] {
	const byProduct = new Map<string, TrackedProduct>();
	for (const plan of plans) {
		const existing = byProduct.get(plan.product_id);
		const inStock = plan.in_stock;
		const stockLeft = plan.unlimited ? null : plan.stock_left;
		if (!existing) {
			byProduct.set(plan.product_id, {
				company_id: plan.company_id,
				product_id: plan.product_id,
				title: plan.title,
				route: plan.route,
				currency: plan.currency,
				price: plan.price,
				purchase_url: plan.purchase_url,
				in_stock: inStock,
				stock_left: stockLeft,
				last_synced_at: plan.last_synced_at,
			});
			continue;
		}
		existing.in_stock = existing.in_stock || inStock;
		if (!existing.in_stock && !inStock) {
			existing.stock_left = (existing.stock_left ?? 0) + (stockLeft ?? 0);
		} else if (existing.in_stock && inStock) {
			if (existing.stock_left !== null && stockLeft !== null) {
				existing.stock_left = existing.stock_left + stockLeft;
			} else {
				existing.stock_left = null;
			}
		} else if (inStock) {
			existing.stock_left = stockLeft;
		}
		if (plan.price !== null && (existing.price === null || plan.price < existing.price)) {
			existing.price = plan.price;
			existing.currency = plan.currency;
			existing.purchase_url = plan.purchase_url;
		}
		if (plan.last_synced_at > existing.last_synced_at) {
			existing.last_synced_at = plan.last_synced_at;
		}
	}
	return [...byProduct.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function upsertTrackedPlans(
	companyId: string,
	rows: Omit<TrackedPlan, "company_id" | "last_synced_at">[],
) {
	if (rows.length === 0) return;
	const { error } = await getSupabase()
		.from("tracked_products")
		.upsert(
			rows.map((r) => ({
				...r,
				company_id: companyId,
				last_synced_at: new Date().toISOString(),
			})),
			{ onConflict: "company_id,product_id,plan_id" },
		);
	if (error) throw error;
}

export async function upsertTrackedProducts(
	companyId: string,
	rows: Omit<TrackedProduct, "company_id" | "last_synced_at">[],
) {
	await upsertTrackedPlans(
		companyId,
		rows.map((r) => ({
			...r,
			plan_id: r.product_id,
			plan_title: null,
			image_url: null,
			visibility: null,
			unlimited: r.stock_left === null && r.in_stock,
		})),
	);
}

export async function deleteStaleTrackedPlans(
	companyId: string,
	liveKeys: ReadonlySet<string>,
) {
	const cached = await getTrackedPlans(companyId);
	const stale = cached.filter((row) => !liveKeys.has(`${row.product_id}:${row.plan_id}`));
	if (stale.length === 0) return 0;
	const client = getSupabase();
	for (const row of stale) {
		const { error } = await client
			.from("tracked_products")
			.delete()
			.eq("company_id", companyId)
			.eq("product_id", row.product_id)
			.eq("plan_id", row.plan_id);
		if (error) throw error;
	}
	return stale.length;
}
