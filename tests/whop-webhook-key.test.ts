import { describe, expect, it } from "vitest";
import { getWhopWebhookSigningKey } from "@/lib/whop-webhook-key";

describe("getWhopWebhookSigningKey", () => {
	it("returns trimmed secret without encoding", () => {
		expect(getWhopWebhookSigningKey("  ws_abc123  ")).toBe("ws_abc123");
		expect(getWhopWebhookSigningKey("whsec_base64payload")).toBe(
			"whsec_base64payload",
		);
	});

	it("returns empty string when unset", () => {
		expect(getWhopWebhookSigningKey("")).toBe("");
		expect(getWhopWebhookSigningKey(undefined)).toBe("");
	});
});
