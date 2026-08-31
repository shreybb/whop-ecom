import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPerPlanStats } from "@/lib/db/stats";
import { markConversionRefunded, recordConversionIfAttributed } from "@/lib/db/conversions";
import { createMockSupabase } from "./helpers/mock-supabase";

vi.mock("@/lib/supabase", () => ({
	getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";

type Row = Record<string, unknown>;

type Filter =
	| { kind: "eq"; column: string; value: unknown }
	| { kind: "gte"; column: string; value: unknown }
	| { kind: "is"; column: string; value: unknown };

function matchesFilters(row: Row, filters: Filter[]): boolean {
	for (const filter of filters) {
		switch (filter.kind) {
			case "eq":
				if (row[filter.column] !== filter.value) return false;
				break;
			case "gte":
				if (String(row[filter.column] ?? "") < String(filter.value)) return false;
				break;
			case "is":
				if (filter.value === null) {
					if (row[filter.column] !== null && row[filter.column] !== undefined) return false;
				} else if (row[filter.column] !== filter.value) return false;
				break;
		}
	}
	return true;
}

function createAggregateAwareSupabase(initial: Record<string, Row[]> = {}) {
	const base = createMockSupabase(initial);
	const origFrom = base.client.from.bind(base.client);

	function aggregateResult(table: string, columns: string, filters: Filter[]) {
		const rows = (base.store.get(table) ?? []).filter((row) => matchesFilters(row, filters));
		if (columns === "amount_usd.sum()") {
			const sum = rows.reduce((total, row) => total + Number(row.amount_usd ?? 0), 0);
			return { data: [{ sum }], error: null };
		}
		if (columns === "plan_id,amount_usd.sum()" || columns === "product_id,amount_usd.sum()") {
			const key = columns.startsWith("plan_id") ? "plan_id" : "product_id";
			const grouped = new Map<string, number>();
			for (const row of rows) {
				const id = String(row[key]);
				grouped.set(id, (grouped.get(id) ?? 0) + Number(row.amount_usd ?? 0));
			}
			return {
				data: [...grouped.entries()].map(([id, sum]) => ({ [key]: id, sum })),
				error: null,
			};
		}
		if (columns === "plan_id,id.count()") {
			const grouped = new Map<string, number>();
			for (const row of rows) {
				const id = String(row.plan_id);
				grouped.set(id, (grouped.get(id) ?? 0) + 1);
			}
			return {
				data: [...grouped.entries()].map(([plan_id, count]) => ({ plan_id, count })),
				error: null,
			};
		}
		return { data: [], error: null };
	}

	return {
		...base,
		client: {
			from(table: string) {
				const builder = origFrom(table);
				let selectColumns = "*";
				const filters: Filter[] = [];
				const origSelect = builder.select.bind(builder);
				const isAggregateSelect = () => selectColumns.includes(".sum()") || selectColumns.includes(".count()");
				const proxy = new Proxy(builder, {
					get(target, prop, receiver) {
						if (prop === "select") {
							return (columns = "*", opts?: { count?: string; head?: boolean }) => {
								selectColumns = columns;
								origSelect(columns, opts);
								return proxy;
							};
						}
						if (!isAggregateSelect()) {
							const value = Reflect.get(target, prop, receiver);
							return typeof value === "function" ? value.bind(target) : value;
						}
						if (prop === "eq") {
							return (column: string, value: unknown) => {
								filters.push({ kind: "eq", column, value });
								return proxy;
							};
						}
						if (prop === "gte") {
							return (column: string, value: unknown) => {
								filters.push({ kind: "gte", column, value });
								return proxy;
							};
						}
						if (prop === "is") {
							return (column: string, value: unknown) => {
								if (value === null) filters.push({ kind: "is", column, value: null });
								return proxy;
							};
						}
						if (prop === "then") {
							return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
								const aggregate = aggregateResult(table, selectColumns, filters);
								return Promise.resolve(aggregate).then(onFulfilled, onRejected);
							};
						}
						const value = Reflect.get(target, prop, receiver);
						return typeof value === "function" ? value.bind(target) : value;
					},
				});
				return proxy;
			},
		},
	};
}

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
		const mock = createAggregateAwareSupabase({
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
