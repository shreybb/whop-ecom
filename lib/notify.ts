import { getWhopApiBase } from "@/lib/whop-config";
import type { CompanyRow, TrackedPlan } from "@/lib/db/types";

type NotifyDefaults = { title: string; content: string };

const CHUNK_SIZE = 25;

type NotificationTarget =
	| { experienceId: string; userIds?: string[] }
	| { accountId: string };

// Customer alerts are Whop push only in this pass. Email/SMS integrations
// are intentionally out of scope; waitlist rows store email for a later pass.
export function buildWaitlistNotifyMessage(
	company: Pick<CompanyRow, "notify_title" | "notify_body"> | null | undefined,
	plan: Pick<TrackedPlan, "title" | "plan_title" | "purchase_url" | "in_stock">,
	defaults: NotifyDefaults,
	source: "manual" | "sync" | "webhook" | "cron",
): NotifyDefaults {
	const label = plan.plan_title ? `${plan.title} — ${plan.plan_title}` : plan.title;
	const fallbackTitle = plan.in_stock
		? `${label} is back in stock!`
		: source === "manual"
			? `Update: ${label}`
			: `${label} is back in stock!`;
	const fallbackContent = plan.in_stock
		? `You asked us to let you know — ${label} is available again. Grab it before it sells out.`
		: source === "manual"
			? `You're on the waitlist for ${label}. There's a new update — check the Drops tab for details.`
			: `You asked us to let you know — ${label} is available again. Grab it before it sells out.`;
	const title = company?.notify_title?.trim() || defaults.title || fallbackTitle;
	const content = company?.notify_body?.trim() || defaults.content || fallbackContent;
	return {
		title: title.replaceAll("{product}", plan.title).replaceAll("{plan}", plan.plan_title ?? plan.title),
		content: content.replaceAll("{product}", plan.title).replaceAll("{plan}", plan.plan_title ?? plan.title),
	};
}

export async function sendNotification(
	target: NotificationTarget,
	message: { title: string; content: string; restPath?: string },
): Promise<{ sent: number; failed: number; skipped?: boolean; lastError?: string }> {
	const apiKey = process.env.WHOP_API_KEY;
	if (!apiKey) throw new Error("WHOP_API_KEY must be set");
	if (process.env.WHOP_NOTIFICATIONS_DISABLED === "true") {
		console.warn("[notify] disabled via WHOP_NOTIFICATIONS_DISABLED");
		return { sent: 0, failed: 0, skipped: true };
	}
	const base: Record<string, unknown> = {
		title: message.title,
		content: message.content,
		...(message.restPath ? { rest_path: message.restPath } : {}),
	};
	const bodies: Record<string, unknown>[] = [];
	if ("accountId" in target) {
		bodies.push({ ...base, account_id: target.accountId });
	} else if (!target.userIds) {
		bodies.push({ ...base, experience_id: target.experienceId });
	} else {
		for (let i = 0; i < target.userIds.length; i += CHUNK_SIZE) {
			bodies.push({
				...base,
				experience_id: target.experienceId,
				user_ids: target.userIds.slice(i, i + CHUNK_SIZE),
			});
		}
	}
	let sent = 0;
	let failed = 0;
	let lastError: string | undefined;
	for (const body of bodies) {
		const res = await fetch(`${getWhopApiBase()}/notifications`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
		if (res.ok) sent += 1;
		else {
			failed += 1;
			lastError = await res.text().catch(() => `HTTP ${res.status}`);
			console.error("[notify] failed", res.status, lastError);
		}
	}
	return { sent, failed, ...(lastError ? { lastError } : {}) };
}
