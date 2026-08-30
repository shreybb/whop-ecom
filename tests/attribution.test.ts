import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPerPlanStats } from "@/lib/db/stats";
import { markConversionRefunded, recordConversionIfAttributed } from "@/lib/db/conversions";
import { createMockSupabase } from "./helpers/mock-supabase";

vi.mock("@/lib/supabase", () => ({
	getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";

const COMPANY = "biz_a";
const notifiedAt = new Date().toISOString();

function baseWaitlistEntry(overrides: Record<string, unknown> = {}) {
	return {
		id: "wait_1",
		company_id: COMPANY,
		product_id: "prod_1",
		plan_id: "plan_s",
		experience_id: "exp_1",
		whop_user_id: "user_1",
		username: "buyer",
		email: null,
		status: "subscribed",
		created_at: new Date().toISOString(),
		last_notified_at: notifiedAt,
		converted_at: null,
		restock_event_id: "restock_1",
		...overrides,
	};
}

describe("recordConversionIfAttributed", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
	});

	it("records conversion when plan and attribution window match", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [baseWaitlistEntry()],
			conversions: [],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const entry = await recordConversionIfAttributed({
			companyId: COMPANY,
			productId: "prod_1",
			planId: "plan_s",
			whopUserId: "user_1",
			paymentId: "pay_1",
			amountUsd: 42,
			currency: "usd",
		});

		expect(entry?.id).toBe("wait_1");
		const conversions = mock.store.get("conversions") ?? [];
		expect(conversions).toHaveLength(1);
		expect(conversions[0].amount_usd).toBe(42);
		expect((mock.store.get("waitlist_entries") ?? [])[0].status).toBe("converted");
	});

	it("does not attribute when plan_id does not match the notified waitlist row", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [baseWaitlistEntry({ plan_id: "plan_m" })],
			conversions: [],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const entry = await recordConversionIfAttributed({
			companyId: COMPANY,
			productId: "prod_1",
			planId: "plan_s",
			whopUserId: "user_1",
			paymentId: "pay_2",
			amountUsd: 42,
			currency: "usd",
		});

		expect(entry).toBeNull();
		expect(mock.store.get("conversions") ?? []).toHaveLength(0);
	});
});

describe("recovered revenue excludes refunds", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
	});

	it("excludes refunded conversions from per-plan recovered revenue", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [],
			conversions: [
				{ company_id: COMPANY, plan_id: "plan_s", amount_usd: 50, refunded_at: null },
				{ company_id: COMPANY, plan_id: "plan_s", amount_usd: 25, refunded_at: new Date().toISOString() },
			],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const stats = await getPerPlanStats(COMPANY);

		expect(stats.get("plan_s")?.recoveredUsd).toBe(50);
	});

	it("marks a conversion refunded by payment id", async () => {
		const mock = createMockSupabase({
			conversions: [{ payment_id: "pay_refund", refunded_at: null }],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		await markConversionRefunded("pay_refund");

		expect((mock.store.get("conversions") ?? [])[0].refunded_at).toBeTruthy();
	});
});
