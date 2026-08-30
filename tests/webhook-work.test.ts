import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimWebhookEvent, getWebhookEvent } from "@/lib/db/conversions";
import { resolveWebhookWork } from "@/lib/webhook-work";

vi.mock("@/lib/db/conversions", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/db/conversions")>();
	return {
		...actual,
		claimWebhookEvent: vi.fn(),
		getWebhookEvent: vi.fn(),
	};
});

describe("resolveWebhookWork", () => {
	beforeEach(() => {
		vi.mocked(claimWebhookEvent).mockReset();
		vi.mocked(getWebhookEvent).mockReset();
	});

	it("processes a first-time webhook event", async () => {
		vi.mocked(claimWebhookEvent).mockResolvedValue(true);

		await expect(resolveWebhookWork("evt_1", "payment.succeeded", {})).resolves.toBe("process");
	});

	it("retries work when duplicate delivery arrives before processed_at is set", async () => {
		vi.mocked(claimWebhookEvent).mockResolvedValue(false);
		vi.mocked(getWebhookEvent).mockResolvedValue({
			id: "evt_1",
			type: "payment.succeeded",
			payload: {},
			received_at: new Date().toISOString(),
			processed_at: null,
			attempts: 1,
			last_error: "boom",
		});

		await expect(resolveWebhookWork("evt_1", "payment.succeeded", {})).resolves.toBe("process");
	});

	it("skips already processed duplicate deliveries", async () => {
		vi.mocked(claimWebhookEvent).mockResolvedValue(false);
		vi.mocked(getWebhookEvent).mockResolvedValue({
			id: "evt_1",
			type: "payment.succeeded",
			payload: {},
			received_at: new Date().toISOString(),
			processed_at: new Date().toISOString(),
			attempts: 0,
			last_error: null,
		});

		await expect(resolveWebhookWork("evt_1", "payment.succeeded", {})).resolves.toBe("skip_processed");
	});
});
