import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardStats } from "@/lib/db/stats";
import {
	claimWaitingSubscribers,
	countPendingNotifyForPlan,
	countSubscribedForPlan,
	rollbackNotifyClaims,
} from "@/lib/db/waitlist";
import { createMockSupabase, getCompanyIdFilters } from "./helpers/mock-supabase";

vi.mock("@/lib/supabase", () => ({
	getSupabase: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({
	sendWaitlistAlert: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
	buildWaitlistNotifyMessage: vi.fn(() => ({ title: "Back in stock", content: "Grab it now" })),
	sendNotification: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }),
}));

vi.mock("@/lib/db/companies", () => ({
	getCompany: vi.fn().mockResolvedValue({ title: "Test Co", auto_notify: true }),
}));

import { getSupabase } from "@/lib/supabase";
import { sendWaitlistAlert } from "@/lib/alerts";

const COMPANY_A = "biz_a";
const COMPANY_B = "biz_b";

describe("claimWaitingSubscribers", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
	});

	it("notifies each subscriber once across concurrent claims", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					status: "subscribed",
					restock_event_id: null,
					last_notified_at: null,
				},
				{
					id: "w2",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_2",
					status: "subscribed",
					restock_event_id: null,
					last_notified_at: null,
				},
			],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const [first, second] = await Promise.all([
			claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_1"),
			claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_1"),
		]);

		const claimedIds = [...first, ...second].map((entry) => entry.id);
		expect(new Set(claimedIds).size).toBe(claimedIds.length);
		expect(claimedIds.sort()).toEqual(["w1", "w2"]);

		const rows = mock.store.get("waitlist_entries") ?? [];
		for (const row of rows) {
			expect(row.status).toBe("subscribed");
			expect(row.restock_event_id).toBe("restock_1");
			expect(row.last_notified_at).toBeTruthy();
		}
	});

	it("does not reclaim subscribers already notified for the current cycle", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					status: "subscribed",
					restock_event_id: "restock_1",
					last_notified_at: "2026-01-01T00:00:00.000Z",
				},
			],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const claimed = await claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_2");

		expect(claimed).toEqual([]);
	});

	it("reclaims subscribers after sellout resets eligibility", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					status: "subscribed",
					restock_event_id: "restock_1",
					last_notified_at: "2026-01-01T00:00:00.000Z",
				},
			],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const { resetPlanNotifyEligibility } = await import("@/lib/db/waitlist");
		await resetPlanNotifyEligibility(COMPANY_A, "plan_s");
		const claimed = await claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_2");

		expect(claimed.map((entry) => entry.id)).toEqual(["w1"]);
	});

	it("keeps subscribers subscribed after two restock notifications", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					status: "subscribed",
					restock_event_id: null,
					last_notified_at: null,
				},
			],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		await claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_1");
		const second = await claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_2");

		expect(second).toEqual([]);
		const row = (mock.store.get("waitlist_entries") ?? [])[0];
		expect(row.status).toBe("subscribed");
		expect(row.restock_event_id).toBe("restock_1");
		expect(await countSubscribedForPlan(COMPANY_A, "plan_s")).toBe(1);
	});
});

describe("rollbackNotifyClaims", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
	});

	it("claim + failed send leaves last_notified_at null", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					status: "subscribed",
					restock_event_id: null,
					last_notified_at: null,
				},
			],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		const claimed = await claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_1");
		expect(claimed).toHaveLength(1);
		expect(claimed[0].last_notified_at).toBeTruthy();

		await rollbackNotifyClaims(COMPANY_A, ["w1"]);

		const row = (mock.store.get("waitlist_entries") ?? [])[0];
		expect(row.status).toBe("subscribed");
		expect(row.last_notified_at).toBeNull();
		expect(row.restock_event_id).toBeNull();
		expect(await countPendingNotifyForPlan(COMPANY_A, "plan_s")).toBe(1);
	});
});

describe("notifyWaitlistForPlan delivery rollback", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
		vi.mocked(sendWaitlistAlert).mockReset();
	});

	it("rolls back claims when sendWaitlistAlert delivers nobody", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					username: "buyer1",
					status: "subscribed",
					restock_event_id: null,
					last_notified_at: null,
				},
			],
			restock_events: [],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);
		vi.mocked(sendWaitlistAlert).mockResolvedValue({
			pushSent: 0,
			pushFailed: 1,
			pushSkipped: false,
			emailsSent: 0,
			emailsFailed: 0,
			emailsSkipped: true,
			deliveredUserIds: [],
			lastError: "HTTP 500",
		});

		const { notifyWaitlistForPlan } = await import("@/lib/stock");
		const result = await notifyWaitlistForPlan(
			COMPANY_A,
			{
				company_id: COMPANY_A,
				product_id: "prod_1",
				plan_id: "plan_s",
				title: "F1 Jacket",
				plan_title: "Medium",
				route: "f1-jacket",
				currency: "usd",
				price: 120,
				purchase_url: "https://whop.com/checkout/plan_s",
				image_url: null,
				visibility: "visible",
				in_stock: true,
				stock_left: 5,
				unlimited: false,
				last_synced_at: new Date().toISOString(),
			},
			"manual",
		);

		expect(result.notified).toBe(0);
		expect(result.pendingNotify).toBe(1);
		const row = (mock.store.get("waitlist_entries") ?? [])[0];
		expect(row.status).toBe("subscribed");
		expect(row.last_notified_at).toBeNull();
		expect(row.restock_event_id).toBeNull();
	});
});

describe("notifyWaitlistForPlan auto restock", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
		vi.mocked(sendWaitlistAlert).mockReset();
	});

	it("notifies subscribers who already received a sold-out Send update", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [
				{
					id: "w1",
					company_id: COMPANY_A,
					product_id: "prod_1",
					plan_id: "plan_s",
					experience_id: "exp_1",
					whop_user_id: "user_1",
					username: "buyer1",
					email: "buyer@example.com",
					status: "subscribed",
					restock_event_id: "restock_old",
					last_notified_at: "2026-01-01T00:00:00.000Z",
				},
			],
			restock_events: [],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);
		vi.mocked(sendWaitlistAlert).mockResolvedValue({
			pushSent: 1,
			pushFailed: 0,
			pushSkipped: false,
			emailsSent: 1,
			emailsFailed: 0,
			emailsSkipped: false,
			deliveredUserIds: ["user_1"],
		});

		const { notifyWaitlistForPlan } = await import("@/lib/stock");
		const result = await notifyWaitlistForPlan(
			COMPANY_A,
			{
				company_id: COMPANY_A,
				product_id: "prod_1",
				plan_id: "plan_s",
				title: "F1 Jacket",
				plan_title: "Medium",
				route: "f1-jacket",
				currency: "usd",
				price: 120,
				purchase_url: "https://whop.com/checkout/plan_s",
				image_url: null,
				visibility: "visible",
				in_stock: true,
				stock_left: 1,
				unlimited: false,
				last_synced_at: new Date().toISOString(),
			},
			"webhook",
		);

		expect(result.notified).toBe(1);
		expect(sendWaitlistAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				recipients: [
					expect.objectContaining({
						userId: "user_1",
						email: "buyer@example.com",
					}),
				],
			}),
		);
	});
});


describe("tenant scope on db helpers", () => {
	beforeEach(() => {
		vi.mocked(getSupabase).mockReset();
	});

	it("scopes waitlist claim queries by company_id", async () => {
		const mock = createMockSupabase({ waitlist_entries: [] });
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		await claimWaitingSubscribers(COMPANY_A, "plan_s", "restock_1");

		expect(getCompanyIdFilters(mock.recorded)).toEqual([COMPANY_A]);
	});

	it("scopes dashboard stats queries by company_id", async () => {
		const mock = createMockSupabase({
			waitlist_entries: [],
			conversions: [],
		});
		vi.mocked(getSupabase).mockReturnValue(mock.client as never);

		await getDashboardStats(COMPANY_B);

		expect(getCompanyIdFilters(mock.recorded).every((id) => id === COMPANY_B)).toBe(true);
		expect(getCompanyIdFilters(mock.recorded).length).toBeGreaterThan(0);
	});
});
