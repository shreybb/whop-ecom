import type { App } from "@whop/sdk/resources/shared";

export type WhopHostingStatus = {
	ok: boolean;
	baseUrl: string | null;
	dashboardPath: string | null;
	experiencePath: string | null;
	detail: string;
	hint?: string;
};

/** Interpret Whop app hosting fields for /api/health. */
export function describeWhopHosting(app: Pick<App, "name" | "company" | "base_url" | "dashboard_path" | "experience_path">): WhopHostingStatus {
	const baseUrl = app.base_url?.trim() || null;
	const dashboardPath = app.dashboard_path?.trim() || null;
	const experiencePath = app.experience_path?.trim() || null;
	const owner = app.company?.title ?? "unknown";

	if (baseUrl) {
		return {
			ok: true,
			baseUrl,
			dashboardPath,
			experiencePath,
			detail: `${app.name} @ ${owner} — base_url=${baseUrl}, dashboard_path=${dashboardPath ?? "—"}, experience_path=${experiencePath ?? "—"}`,
		};
	}

	// Whop may omit base_url when the API key lacks developer:basic:read even if
	// hosting is configured in the dashboard. Paths coming back is a strong signal.
	if (dashboardPath || experiencePath) {
		return {
			ok: true,
			baseUrl: null,
			dashboardPath,
			experiencePath,
			detail: `${app.name} @ ${owner} — dashboard_path=${dashboardPath ?? "—"}, experience_path=${experiencePath ?? "—"}`,
			hint:
				"Whop returned base_url=null. That often means the API key is missing developer:basic:read (the value can still be set in Hosting). If the app loads inside Whop, you can ignore this.",
		};
	}

	return {
		ok: false,
		baseUrl: null,
		dashboardPath,
		experiencePath,
		detail: `${app.name} @ ${owner} — hosting paths not configured`,
		hint:
			"In Whop → App → Hosting, set base_url (e.g. https://whop-ecom-beta.vercel.app), dashboard_path=/dashboard/[companyId], experience_path=/experiences/[experienceId].",
	};
}

export function buildHealthUserActions(input: {
	isSandbox: boolean;
	envReady: boolean;
	hosting: WhopHostingStatus;
	emailConfigured: boolean;
}): string[] {
	const actions: string[] = [];

	if (!input.hosting.ok) {
		actions.push(
			"Whop app → Hosting: set base_url, dashboard_path=/dashboard/[companyId], experience_path=/experiences/[experienceId]",
		);
	} else if (!input.hosting.baseUrl && input.hosting.hint) {
		actions.push(
			"Optional: add developer:basic:read on your Whop app API key if you want /api/health to display base_url",
		);
	}

	if (input.isSandbox) {
		actions.push(
			"Sandbox: use WHOP_API_BASE=https://sandbox-api.whop.com/api/v1 and sandbox app credentials",
		);
	} else if (!input.envReady) {
		actions.push(
			"Production env: WHOP_API_BASE=https://api.whop.com/api/v1 + live API key and webhook secret",
		);
	}

	actions.push(
		"Webhook → /api/webhooks (payment.succeeded, product.*, plan.*, refund.*)",
	);

	if (!input.emailConfigured) {
		actions.push(
			"Optional: RESEND_API_KEY + EMAIL_FROM for waitlist email alerts (needs member:email:read)",
		);
	}

	return actions;
}
