import { getSupabase } from "@/lib/supabase";
import type { TrackedProduct } from "./types";

export async function getTrackedProducts(companyId: string) {
	const { data, error } = await getSupabase()
		.from("tracked_products")
		.select()
		.eq("company_id", companyId)
		.order("title");
	if (error) throw error;
	return (data ?? []) as TrackedProduct[];
}

export async function upsertTrackedProducts(
	companyId: string,
	rows: Omit<TrackedProduct, "company_id" | "last_synced_at">[],
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
			{ onConflict: "company_id,product_id" },
		);
	if (error) throw error;
}
