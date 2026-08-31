import { describe, expect, it } from "vitest";
import { buildWaitlistNotifyMessage } from "@/lib/notify";
import {
	MANUAL_SOLD_OUT_VARIANTS,
	pickMessageVariant,
	RESTOCK_VARIANTS,
} from "@/lib/notify-messages";

const plan = {
	title: "F1 Jacket",
	plan_title: "Medium",
	purchase_url: "https://whop.com/checkout/plan_1",
	in_stock: true,
};

describe("restock message rotation", () => {
	it("cycles through built-in variants per restock index", () => {
		const first = buildWaitlistNotifyMessage(null, plan, { title: "", content: "" }, "sync", 0);
		const second = buildWaitlistNotifyMessage(null, plan, { title: "", content: "" }, "sync", 1);

		expect(first.title).toContain("F1 Jacket");
		expect(second.title).not.toBe(first.title);
		expect(second.content).not.toBe(first.content);
	});

	it("wraps the variant pool after the last message", () => {
		const wrapped = pickMessageVariant(RESTOCK_VARIANTS, RESTOCK_VARIANTS.length);
		expect(wrapped).toEqual(RESTOCK_VARIANTS[0]);
	});

	it("keeps merchant custom copy instead of rotating on automatic restock", () => {
		const message = buildWaitlistNotifyMessage(
			{ notify_title: "Drop alert: {label}", notify_body: "Custom body for {plan}" },
			plan,
			{ title: "", content: "" },
			"sync",
			99,
		);

		expect(message.title).toBe("Drop alert: F1 Jacket — Medium");
		expect(message.content).toBe("Custom body for Medium");
	});

	it("ignores merchant custom copy for manual sold-out updates", () => {
		const soldOutPlan = { ...plan, in_stock: false };
		const custom = {
			notify_title: "Drop alert: {label}",
			notify_body: "Custom body for {plan}",
		};

		const message = buildWaitlistNotifyMessage(
			custom,
			soldOutPlan,
			{ title: "", content: "" },
			"manual",
			0,
		);

		expect(message.title).not.toBe("Drop alert: F1 Jacket — Medium");
		expect(message.content).not.toBe("Custom body for Medium");
		expect(message.title).toContain("F1 Jacket");
	});

	it("rotates manual sold-out variants by index", () => {
		const soldOutPlan = { ...plan, in_stock: false };
		const first = buildWaitlistNotifyMessage(
			null,
			soldOutPlan,
			{ title: "", content: "" },
			"manual",
			0,
		);
		const second = buildWaitlistNotifyMessage(
			null,
			soldOutPlan,
			{ title: "", content: "" },
			"manual",
			1,
		);

		expect(first.title).not.toBe(second.title);
		expect(pickMessageVariant(MANUAL_SOLD_OUT_VARIANTS, 0).title).toContain("{label}");
	});

	it("does not apply merchant restock copy to manual in-stock updates", () => {
		const message = buildWaitlistNotifyMessage(
			{ notify_title: "Drop alert: {label}", notify_body: "Custom body for {plan}" },
			plan,
			{ title: "", content: "" },
			"manual",
			0,
		);

		expect(message.title).not.toBe("Drop alert: F1 Jacket — Medium");
		expect(message.content).not.toBe("Custom body for Medium");
	});
});
