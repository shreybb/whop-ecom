import { describe, expect, it } from "vitest";
import { describeWhopHosting } from "@/lib/whop-hosting-health";

describe("describeWhopHosting", () => {
	const app = {
		name: "Restocked",
		company: { id: "biz_1", title: "Blacktop Supply Co." },
		base_url: null,
		dashboard_path: "/dashboard/[companyId]",
		experience_path: "/experiences/[experienceId]",
	};

	it("treats configured paths as hosting ok when base_url is hidden by the API", () => {
		const status = describeWhopHosting(app);
		expect(status.ok).toBe(true);
		expect(status.hint).toContain("developer:basic:read");
	});

	it("reports missing hosting when no paths or base url are present", () => {
		const status = describeWhopHosting({
			...app,
			dashboard_path: null,
			experience_path: null,
		});
		expect(status.ok).toBe(false);
	});
});
