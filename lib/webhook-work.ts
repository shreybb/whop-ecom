import { claimWebhookEvent, getWebhookEvent } from "@/lib/db/conversions";

export async function resolveWebhookWork(
	eventId: string,
	eventType: string,
	payload: unknown,
): Promise<"skip_processed" | "process"> {
	const inserted = await claimWebhookEvent(eventId, eventType, payload);
	if (inserted) return "process";

	const existing = await getWebhookEvent(eventId);
	if (existing?.processed_at) return "skip_processed";
	// Duplicate delivery while still unprocessed — retry the work.
	return "process";
}
