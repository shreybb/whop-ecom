import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { createWhopWebhookVerifier, unwrapWhopWebhook } from "@/lib/whop-webhook-verify";

function signedRequest(secret: string, format: "raw" | "default" = "default") {
	const signer =
		format === "raw"
			? new Webhook(secret, { format: "raw" })
			: new Webhook(secret);
	const body = JSON.stringify({
		id: "msg_test_1",
		type: "plan.updated",
		data: { id: "plan_1" },
	});
	const timestamp = new Date();
	const headers = {
		"webhook-id": "msg_test_1",
		"webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
		"webhook-signature": signer.sign("msg_test_1", timestamp, body),
	};
	return { body, headers };
}

describe("createWhopWebhookVerifier", () => {
	it("verifies ws_ secrets as raw UTF-8 HMAC keys", () => {
		const secret = `ws_${"a".repeat(64)}`;
		const { body, headers } = signedRequest(secret, "raw");
		expect(() => createWhopWebhookVerifier(secret).verify(body, headers)).not.toThrow();
		expect(unwrapWhopWebhook(body, headers, secret).type).toBe("plan.updated");
	});

	it("verifies whsec_ secrets via Standard Webhooks decoding", () => {
		const rawKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const secret = `whsec_${Buffer.from(rawKey).toString("base64")}`;
		const { body, headers } = signedRequest(secret, "default");
		expect(() => createWhopWebhookVerifier(secret).verify(body, headers)).not.toThrow();
	});
});
