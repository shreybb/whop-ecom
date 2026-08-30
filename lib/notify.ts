// Whop push notifications. The pinned @whop/sdk 0.0.3 predates the
// notifications resource, so this calls the REST endpoint directly.
// Docs: https://docs.whop.com/developer/guides/notifications

import { getWhopApiBase } from "@/lib/whop-config";

// Whop caps user_ids per request; chunk to stay well under it.
const CHUNK_SIZE = 25;

type NotificationTarget =
	| { experienceId: string; userIds?: string[] }
	| { accountId: string };

export async function sendNotification(
	target: NotificationTarget,
	message: { title: string; content: string; restPath?: string },
): Promise<{ sent: number; failed: number }> {
	const apiKey = process.env.WHOP_API_KEY;
	if (!apiKey) throw new Error("WHOP_API_KEY must be set");

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
			console.error(
				"[notify] failed",
				res.status,
				await res.text().catch(() => ""),
			);
		}
	}
	return { sent, failed };
}
