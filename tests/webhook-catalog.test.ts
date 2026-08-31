import { describe, expect, it, vi } from "vitest";
import { resolveCatalogCompanyId } from "@/lib/webhook-catalog";

vi.mock("@/lib/whop-sdk", () => ({
	getWhopSdk: vi.fn(),
}));

import { getWhopSdk } from "@/lib/whop-sdk";

describe("resolveCatalogCompanyId", () => {
	it("prefers nested company.id", async () => {
		await expect(
			resolveCatalogCompanyId("plan.updated", {
				id: "plan_1",
				company: { id: "biz_1" },
			}),
		).resolves.toBe("biz_1");
	});

	it("falls back to account_id", async () => {
		await expect(
			resolveCatalogCompanyId("plan.updated", {
				id: "plan_1",
				account_id: "biz_2",
			}),
		).resolves.toBe("biz_2");
	});

	it("falls back to envelope company_id", async () => {
		await expect(
			resolveCatalogCompanyId(
				"product.updated",
				{ id: "prod_1" },
				"biz_envelope",
			),
		).resolves.toBe("biz_envelope");
	});

	it("retrieves company from plan when payload omits tenant id", async () => {
		vi.mocked(getWhopSdk).mockReturnValue({
			plans: {
				retrieve: vi.fn().mockResolvedValue({ product: { id: "prod_1" } }),
			},
			products: {
				retrieve: vi.fn().mockResolvedValue({ company: { id: "biz_3" } }),
			},
		} as never);

		await expect(
			resolveCatalogCompanyId("plan.updated", { id: "plan_1" }),
		).resolves.toBe("biz_3");
	});
});
