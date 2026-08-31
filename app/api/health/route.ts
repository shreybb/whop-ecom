import { buildHealthUserActions, describeWhopHosting } from "@/lib/whop-hosting-health";
import { getWhopApiBase, isWhopSandbox } from "@/lib/whop-config";
import { getWhopSdk } from "@/lib/whop-sdk";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function isHealthAuthorized(request: NextRequest): boolean {
	const auth = request.headers.get("authorization");
	if (!auth?.startsWith("Bearer ")) return false;
	const token = auth.slice("Bearer ".length);
	const secrets = [process.env.CRON_SECRET, process.env.HEALTH_SECRET].filter(
		(s): s is string => Boolean(s),
	);
	return secrets.some((secret) => secret === token);
}

/** Setup diagnostics — public body is { ready, checks }; ops detail requires Bearer CRON_SECRET or HEALTH_SECRET. */
export async function GET(request: NextRequest) {
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

	const resendKey = process.env.RESEND_API_KEY;
	const emailFrom = process.env.EMAIL_FROM;
	checks.email_notifications = {
		ok: Boolean(resendKey && emailFrom),
		detail:
			resendKey && emailFrom
				? "Resend configured (waitlist emails enabled)"
				: resendKey || emailFrom
					? "partial — set both RESEND_API_KEY and EMAIL_FROM"
					: "optional — push-only until Resend is configured",
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
	let hosting = describeWhopHosting({
		name: "unknown",
		company: { id: "unknown", title: "unknown" },
		base_url: null,
		dashboard_path: null,
		experience_path: null,
	});
	try {
		const app = await getWhopSdk().apps.retrieve(
			process.env.NEXT_PUBLIC_WHOP_APP_ID!,
		);
		whopOk = true;
		hosting = describeWhopHosting(app);
		checks.whop_app = {
			ok: whopOk,
			detail: hosting.detail,
		};
		checks.whop_hosting = {
			ok: hosting.ok,
			detail: hosting.hint ?? (hosting.baseUrl ? "base_url visible" : "paths configured"),
		};
	} catch (e) {
		checks.whop_app = {
			ok: false,
			detail: e instanceof Error ? e.message : "failed",
		};
		checks.whop_hosting = {
			ok: false,
			detail: "could not load app from Whop API",
		};
	}

	const envReady = required.every((key) => checks[key].ok);
	const emailConfigured = Boolean(checks.email_notifications.ok);

	const ready =
		Object.entries(checks)
			.filter(([k]) => !["whop_app", "whop_hosting", "supabase_connectivity"].includes(k))
			.every(([, v]) => v.ok) && supabaseOk;

	if (!isHealthAuthorized(request)) {
		return Response.json({ ready, checks });
	}

	return Response.json({
		ready,
		checks,
		whopHosting: hosting,
		userActions: buildHealthUserActions({
			isSandbox: isWhopSandbox(),
			envReady,
			hosting,
			emailConfigured,
		}),
	});
}
