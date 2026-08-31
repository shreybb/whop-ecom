import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimWebhookEvent, getWebhookEvent, tryStartWebhookProcessing } from "@/lib/db/conversions";
import { resolveWebhookWork } from "@/lib/webhook-work";

vi.mock("@/lib/db/conversions", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/db/conversions")>();
	return {
		...actual,
		claimWebhookEvent: vi.fn(),
		getWebhookEvent: vi.fn(),
		tryStartWebhookProcessing: vi.fn(),
	};
});

describe("resolveWebhookWork", () => {
	beforeEach(() => {
		vi.mocked(claimWebhookEvent).mockReset();
		vi.mocked(getWebhookEvent).mockReset();
		vi.mocked(tryStartWebhookProcessing).mockReset();
	});

	it("processes a first-time webhook event", async () => {
		vi.mocked(claimWebhookEvent).mockResolvedValue(true);
		vi.mocked(tryStartWebhookProcessing).mockResolvedValue(true);

		await expect(resolveWebhookWork("evt_1", "payment.succeeded", {})).resolves.toBe("process");
		expect(tryStartWebhookProcessing).toHaveBeenCalledWith("evt_1");
	});

	it("skips when another worker already holds the in-flight lock", async () => {
		vi.mocked(claimWebhookEvent).mockResolvedValue(false);
		vi.mocked(getWebhookEvent).mockResolvedValue({
			id: "evt_1",
			type: "payment.succeeded",
			payload: {},
			received_at: new Date().toISOString(),
			processed_at: null,
			attempts: 0,
			last_error: null,
		});
		vi.mocked(tryStartWebhookProcessing).mockResolvedValue(false);

		await expect(resolveWebhookWork("evt_1", "payment.succeeded", {})).resolves.toBe("skip_processed");
	});

	it("retries work when duplicate delivery arrives before processed_at and lock is free", async () => {
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
		vi.mocked(tryStartWebhookProcessing).mockResolvedValue(true);

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
		expect(tryStartWebhookProcessing).not.toHaveBeenCalled();
	});
});
