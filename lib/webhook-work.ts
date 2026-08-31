import { claimWebhookEvent, getWebhookEvent, tryStartWebhookProcessing } from "@/lib/db/conversions";

export async function resolveWebhookWork(
	eventId: string,
	eventType: string,
	payload: unknown,
): Promise<"skip_processed" | "process"> {
	const inserted = await claimWebhookEvent(eventId, eventType, payload);
	if (inserted) {
		return (await tryStartWebhookProcessing(eventId)) ? "process" : "skip_processed";
	}

	const existing = await getWebhookEvent(eventId);
	if (existing?.processed_at) return "skip_processed";

	// Duplicate while still unprocessed: only retry when no other worker holds the lock.
	return (await tryStartWebhookProcessing(eventId)) ? "process" : "skip_processed";
}
