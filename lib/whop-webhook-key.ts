/** Returns the env secret for webhook verification (ws_ / whsec_ as-is). */
export function getWhopWebhookSigningKey(
	secret = process.env.WHOP_WEBHOOK_SECRET,
): string {
	const trimmed = secret?.trim();
	if (!trimmed) return "";
	return trimmed;
}
