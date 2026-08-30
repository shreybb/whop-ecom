import { describe, expect, it } from "vitest";
import { detectPlanStockTransitions } from "@/lib/stock-transitions";

describe("detectPlanStockTransitions", () => {
	it("detects restock for one plan without affecting sibling plans", () => {
		const cached = [
			{ product_id: "prod_1", plan_id: "plan_s", in_stock: false },
			{ product_id: "prod_1", plan_id: "plan_m", in_stock: false },
		];
		const live = [
			{ product_id: "prod_1", plan_id: "plan_s", in_stock: true },
			{ product_id: "prod_1", plan_id: "plan_m", in_stock: false },
		];

		const result = detectPlanStockTransitions(cached, live);

		expect(result.restockedPlanIds).toEqual(["plan_s"]);
		expect(result.soldOutPlanIds).toEqual([]);
	});

	it("detects sell-out per plan independently", () => {
		const cached = [
			{ product_id: "prod_1", plan_id: "plan_s", in_stock: true },
			{ product_id: "prod_1", plan_id: "plan_m", in_stock: true },
		];
		const live = [
			{ product_id: "prod_1", plan_id: "plan_s", in_stock: false },
			{ product_id: "prod_1", plan_id: "plan_m", in_stock: true },
		];

		const result = detectPlanStockTransitions(cached, live);

		expect(result.soldOutPlanIds).toEqual(["plan_s"]);
		expect(result.restockedPlanIds).toEqual([]);
	});
});
