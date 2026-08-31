import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendWaitlistAlert } from "@/lib/alerts";

vi.mock("@/lib/notify", () => ({
	sendNotification: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: true }),
}));

vi.mock("@/lib/whop-members", () => ({
	getMemberProfilesForUsers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/email", () => ({
	sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

import { sendEmail } from "@/lib/email";

describe("sendWaitlistAlert email fallback", () => {
	beforeEach(() => {
		vi.mocked(sendEmail).mockClear();
		vi.mocked(sendEmail).mockResolvedValue({ ok: true });
	});

	it("does not mark multi-user chunk as push-delivered without per-user correlation", async () => {
		const { sendNotification } = await import("@/lib/notify");
		vi.mocked(sendNotification).mockResolvedValue({ sent: 1, failed: 0 });
		vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "disabled" });

		const result = await sendWaitlistAlert({
			companyId: "biz_a",
			experienceId: "exp_1",
			recipients: [
				{ userId: "user_1", username: "a", email: null },
				{ userId: "user_2", username: "b", email: null },
			],
			title: "Hoodie is back",
			content: "Grab it now",
			productTitle: "Hoodie",
			inStock: true,
		});

		expect(result.pushSent).toBe(1);
		expect(result.deliveredUserIds).toEqual([]);
	});

	it("uses waitlist entry email when Whop member profile is missing", async () => {
		const result = await sendWaitlistAlert({
			companyId: "biz_a",
			experienceId: "exp_1",
			recipients: [
				{
					userId: "user_1",
					username: "buyer1",
					email: "buyer@example.com",
				},
			],
			title: "Hoodie is back",
			content: "Grab it now",
			productTitle: "Hoodie",
			inStock: true,
			purchaseUrl: "https://whop.com/checkout/plan_1",
		});

		expect(result.emailsSent).toBe(1);
		expect(result.deliveredUserIds).toContain("user_1");
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "buyer@example.com" }),
		);
	});
});
