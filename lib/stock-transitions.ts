import type { TrackedPlan } from "@/lib/db/types";

export type PlanStockSnapshot = Pick<TrackedPlan, "product_id" | "plan_id" | "in_stock">;

/** Detect per-plan restock / sell-out transitions between cached and live snapshots. */
export function detectPlanStockTransitions(
	cached: PlanStockSnapshot[],
	live: PlanStockSnapshot[],
): { restockedPlanIds: string[]; soldOutPlanIds: string[] } {
	const cachedByKey = new Map(cached.map((p) => [`${p.product_id}:${p.plan_id}`, p]));
	const restockedPlanIds: string[] = [];
	const soldOutPlanIds: string[] = [];
	for (const snap of live) {
		const prev = cachedByKey.get(`${snap.product_id}:${snap.plan_id}`);
		if (prev && !prev.in_stock && snap.in_stock) restockedPlanIds.push(snap.plan_id);
		if (prev && prev.in_stock && !snap.in_stock) soldOutPlanIds.push(snap.plan_id);
	}
	return { restockedPlanIds, soldOutPlanIds };
}
