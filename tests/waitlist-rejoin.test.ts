import { describe, expect, it } from "vitest";
import {
	resolvePlanWaitlistCta,
	resolveSubscriberEmail,
	toPlanUiStatus,
} from "@/lib/waitlist-ui";

describe("toPlanUiStatus", () => {
	it("maps converted waitlist rows to converted UI status", () => {
		expect(toPlanUiStatus("converted")).toBe("converted");
	});
});

describe("resolvePlanWaitlistCta", () => {
	const plan = {
		in_stock: false,
		purchase_url: "https://whop.com/checkout/plan_1",
	};

	it("shows Notify me when sold out and previously converted", () => {
		expect(resolvePlanWaitlistCta(plan, "converted")).toBe("notify_me");
	});

	it("shows You got it only while the plan is in stock", () => {
		expect(
			resolvePlanWaitlistCta(
				{ ...plan, in_stock: true },
				"converted",
			),
		).toBe("you_got_it");
	});

	it("shows Buy for in-stock plans that are not converted", () => {
		expect(
			resolvePlanWaitlistCta(
				{ ...plan, in_stock: true },
				"none",
			),
		).toBe("buy");
	});

	it("shows On waitlist for subscribed sold-out plans", () => {
		expect(resolvePlanWaitlistCta(plan, "subscribed")).toBe("on_waitlist");
	});
});

describe("resolveSubscriberEmail", () => {
	it("prefers the company member email", () => {
		expect(
			resolveSubscriberEmail("member@example.com", "user@example.com"),
		).toBe("member@example.com");
	});

	it("falls back to the Whop user email", () => {
		expect(resolveSubscriberEmail(undefined, "user@example.com")).toBe(
			"user@example.com",
		);
	});

	it("returns null when no email is available", () => {
		expect(resolveSubscriberEmail(undefined, null)).toBeNull();
	});
});
