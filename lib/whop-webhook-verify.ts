import { Webhook } from "standardwebhooks";

/**
 * Whop webhook signing secrets use two formats:
 * - ws_…  → HMAC key is the UTF-8 secret string as-is (production + sandbox)
 * - whsec_… → Standard Webhooks: strip prefix, base64-decode remainder
 */
export function createWhopWebhookVerifier(
	secret = process.env.WHOP_WEBHOOK_SECRET,
): Webhook {
	const trimmed = secret?.trim();
	if (!trimmed) {
		throw new Error("WHOP_WEBHOOK_SECRET must be set");
	}
	if (trimmed.startsWith("ws_")) {
		return new Webhook(trimmed, { format: "raw" });
	}
	return new Webhook(trimmed);
}

export function unwrapWhopWebhook<T = unknown>(
	body: string,
	headers: Record<string, string>,
	secret = process.env.WHOP_WEBHOOK_SECRET,
): T {
	const verifier = createWhopWebhookVerifier(secret);
	verifier.verify(body, headers);
	return JSON.parse(body) as T;
}
