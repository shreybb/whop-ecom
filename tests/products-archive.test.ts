import { describe, expect, it, vi } from "vitest";
import { PLAN_SOFT_CAP, shouldArchiveStalePlans } from "@/lib/db/products";

describe("shouldArchiveStalePlans", () => {
	it("allows archive when the live list is below the soft cap", () => {
		expect(shouldArchiveStalePlans(PLAN_SOFT_CAP - 1)).toBe(true);
	});

	it("skips archive when the live list hit the soft cap", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(shouldArchiveStalePlans(PLAN_SOFT_CAP)).toBe(false);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(`cap (${PLAN_SOFT_CAP})`),
		);
		warn.mockRestore();
	});

	it("skips archive when the live list exceeds the soft cap", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(shouldArchiveStalePlans(PLAN_SOFT_CAP + 100)).toBe(false);
		warn.mockRestore();
	});
});
