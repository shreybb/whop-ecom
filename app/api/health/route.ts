import { getWhopApiBase, isWhopSandbox } from "@/lib/whop-config";
import { getWhopSdk } from "@/lib/whop-sdk";

export const dynamic = "force-dynamic";

/** Setup diagnostics — safe to expose; no secrets returned. */
export async function GET() {
	const checks: Record<string, { ok: boolean; detail?: string }> = {};

	const required = [
		"WHOP_API_KEY",
		"NEXT_PUBLIC_WHOP_APP_ID",
		"WHOP_WEBHOOK_SECRET",
		"SUPABASE_URL",
		"SUPABASE_SERVICE_ROLE_KEY",
	] as const;

	for (const key of required) {
		const val = process.env[key];
		checks[key] = {
			ok: Boolean(val && !val.includes("placeholder")),
			detail: val?.includes("placeholder") ? "placeholder value" : val ? "set" : "missing",
		};
	}

	checks.WHOP_API_BASE = {
		ok: true,
		detail: `${getWhopApiBase()}${isWhopSandbox() ? " (sandbox)" : ""}`,
	};

	let supabaseOk = false;
	try {
		const { getSupabase } = await import("@/lib/supabase");
		const { error } = await getSupabase().from("companies").select("id").limit(1);
		supabaseOk = !error;
		checks.supabase_connectivity = {
			ok: supabaseOk,
			detail: error?.message ?? "connected",
		};
	} catch (e) {
		checks.supabase_connectivity = {
			ok: false,
			detail: e instanceof Error ? e.message : "failed",
		};
	}

	let whopOk = false;
	try {
		const app = await getWhopSdk().apps.retrieve(
			process.env.NEXT_PUBLIC_WHOP_APP_ID!,
		);
		whopOk = true;
		checks.whop_app = {
			ok: true,
			detail: `${app.name} @ ${app.company?.title ?? "unknown"} — base_url=${app.base_url ?? "NOT SET"}, dashboard_path=${app.dashboard_path ?? "NOT SET"}`,
		};
	} catch (e) {
		checks.whop_app = {
			ok: false,
			detail: e instanceof Error ? e.message : "failed",
		};
	}

	const ready =
		Object.entries(checks)
			.filter(([k]) => k !== "whop_app" && k !== "supabase_connectivity")
			.every(([, v]) => v.ok) && supabaseOk;

	return Response.json({
		service: "restocked",
		ready,
		checks,
		userActions: [
			"Set app Hosting: base_url=https://whop-ecom-beta.vercel.app, dashboard_path=/dashboard/[companyId]",
			"Approve app permissions: product, plan, payment, member read + notification:create",
			"Create webhook → /api/webhooks (payment.succeeded, product.updated, product.created)",
			"Install app on sandbox business + add Drops experience to a product",
			"Provide Supabase URL + service role key (or access token for agent setup)",
		],
	});
}
