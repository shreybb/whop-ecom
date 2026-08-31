/** Whop signing secrets (ws_… / whsec_…) must be passed raw — not base64-encoded. */
export function getWhopWebhookSigningKey(
	secret = process.env.WHOP_WEBHOOK_SECRET,
): string {
	const trimmed = secret?.trim();
	if (!trimmed) return "";
	return trimmed;
}
