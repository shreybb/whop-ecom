"use server";

import { headers } from "next/headers";
import type { ExperienceListResponse } from "@whop/sdk/resources/experiences";
import { actionErr, actionOk, type ActionResult } from "@/lib/action-result";
import { getTrackedPlans } from "@/lib/db/products";
import { getSupabase } from "@/lib/supabase";
import { isWhopSandbox } from "@/lib/whop-config";
import { getWhopSdk } from "@/lib/whop-sdk";

async function requireCompanyAdmin(companyId: string) {
	const whopsdk = getWhopSdk();
	const { userId } = await whopsdk.verifyUserToken(await headers());
	const access = await whopsdk.users.checkAccess(companyId, { id: userId });
	if (!access.has_access || access.access_level !== "admin") {
		throw new Error("Admin access required");
	}
	return userId;
}

function whopSiteOrigin() {
	return isWhopSandbox() ? "https://sandbox.whop.com" : "https://whop.com";
}

function pickPreferredDropsExperience(
	experiences: ExperienceListResponse[],
) {
	const score = (name: string) => {
		const lower = name.toLowerCase();
		if (lower.includes("restocked")) return 3;
		if (lower.includes("drops")) return 2;
		return 1;
	};
	return [...experiences].sort((a, b) => score(b.name) - score(a.name))[0];
}

/** Best shareable Whop URL for the merchant Drops / Restocked experience. */
export async function resolveDropsShareUrl(
	companyId: string,
): Promise<{ url: string; experienceName: string } | null> {
	const whopsdk = getWhopSdk();
	const appId = process.env.NEXT_PUBLIC_WHOP_APP_ID;
	const experiences: ExperienceListResponse[] = [];

	const listParams = appId
		? { company_id: companyId, app_id: appId }
		: { company_id: companyId };

	for await (const experience of whopsdk.experiences.list(listParams)) {
		experiences.push(experience);
	}

	if (experiences.length === 0 && appId) {
		for await (const experience of whopsdk.experiences.list({
			company_id: companyId,
		})) {
			experiences.push(experience);
		}
	}

	const preferred = pickPreferredDropsExperience(experiences);
	if (!preferred) return null;

	const full = await whopsdk.experiences.retrieve(preferred.id);
	const companyRoute = full.company.route;
	const productRoute = full.products[0]?.route;
	const origin = whopSiteOrigin();
	const url = productRoute
		? `${origin}/${companyRoute}/${productRoute}`
		: `${origin}/${companyRoute}`;

	return { url, experienceName: full.name };
}

function csvEscape(value: string) {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export async function exportWaitlistCsvAction(
	companyId: string,
): Promise<
	ActionResult<{
		csv: string;
		filename: string;
		rowCount: number;
		emailCount: number;
	}>
> {
	try {
		await requireCompanyAdmin(companyId);

		const [entriesResult, plans] = await Promise.all([
			getSupabase()
				.from("waitlist_entries")
				.select("username, email, plan_id, created_at")
				.eq("company_id", companyId)
				.eq("status", "subscribed")
				.order("created_at"),
			getTrackedPlans(companyId),
		]);

		if (entriesResult.error) throw entriesResult.error;

		const planLabels = new Map(
			plans.map((plan) => [
				plan.plan_id,
				plan.plan_title ? `${plan.title} — ${plan.plan_title}` : plan.title,
			]),
		);

		const entries = entriesResult.data ?? [];
		const emailCount = entries.filter((entry) => Boolean(entry.email)).length;

		const header = "username,email,plan,joined_at";
		const rows = entries.map((entry) => {
			const username = entry.username ?? "";
			const email = entry.email ?? "";
			const plan =
				planLabels.get(entry.plan_id as string) ?? (entry.plan_id as string);
			const joinedAt = entry.created_at as string;
			return [username, email, plan, joinedAt]
				.map((cell) => csvEscape(String(cell)))
				.join(",");
		});

		const csv = [header, ...rows].join("\n");
		const date = new Date().toISOString().slice(0, 10);
		return actionOk({
			csv,
			filename: `restocked-waitlist-${date}.csv`,
			rowCount: entries.length,
			emailCount,
		});
	} catch {
		return actionErr("Could not export waitlist. Please try again.");
	}
}
