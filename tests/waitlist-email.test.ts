import { describe, expect, it } from "vitest";
import { buildWaitlistEmailMessage, recipientFirstName } from "@/lib/waitlist-email";

describe("recipientFirstName", () => {
	it("prefers the member full name", () => {
		expect(
			recipientFirstName({
				userId: "user_1",
				email: "a@b.com",
				name: "Alex Johnson",
				username: "alexj",
			}),
		).toBe("Alex");
	});

	it("falls back to username from the waitlist row", () => {
		expect(recipientFirstName(undefined, "coolbuyer")).toBe("coolbuyer");
	});
});

describe("buildWaitlistEmailMessage", () => {
	it("includes seller, product image, price, and personalized greeting", () => {
		const message = buildWaitlistEmailMessage(
			{
				title: "F1 Jacket is back in stock!",
				body: "You asked us to let you know — grab it before it sells out again.",
				productTitle: "F1 Jacket — Medium",
				companyTitle: "Blacktop Supply Co.",
				imageUrl: "https://cdn.example.com/jacket.jpg",
				price: 120,
				currency: "usd",
				purchaseUrl: "https://whop.com/checkout/plan_123",
				inStock: true,
			},
			{
				userId: "user_1",
				email: "buyer@example.com",
				name: "Sam Rivera",
				username: "samr",
			},
		);

		expect(message.to).toBe("buyer@example.com");
		expect(message.subject).toBe("F1 Jacket is back in stock!");
		expect(message.html).toContain("Blacktop Supply Co.");
		expect(message.html).toContain("Hi Sam,");
		expect(message.html).toContain("https://cdn.example.com/jacket.jpg");
		expect(message.html).toContain("F1 Jacket — Medium");
		expect(message.html).toContain("$120.00");
		expect(message.html).toContain("Shop now");
		expect(message.text).toContain("Hi Sam,");
	});
});
