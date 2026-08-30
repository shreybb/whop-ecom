import { sendEmailBatch } from "@/lib/email";
import { sendNotification } from "@/lib/notify";
import { getMemberProfilesForUsers, type MemberProfile } from "@/lib/whop-members";
import {
	buildWaitlistEmailMessage,
	type WaitlistEmailRecipient,
} from "@/lib/waitlist-email";

export type WaitlistAlert = {
	companyId: string;
	experienceId: string;
	recipients: WaitlistEmailRecipient[];
	title: string;
	content: string;
	restPath?: string;
	productTitle: string;
	companyTitle?: string | null;
	imageUrl?: string | null;
	price?: number | null;
	currency?: string | null;
	purchaseUrl?: string | null;
	inStock: boolean;
};

export type WaitlistAlertResult = {
	pushSent: number;
	pushFailed: number;
	pushSkipped: boolean;
	emailsSent: number;
	emailsFailed: number;
	emailsSkipped: boolean;
	delivered: boolean;
	lastError?: string;
};

function buildEmailBodies(
	alert: WaitlistAlert,
	profiles: Map<string, MemberProfile>,
) {
	const emailContent = {
		title: alert.title,
		body: alert.content,
		productTitle: alert.productTitle,
		companyTitle: alert.companyTitle ?? null,
		imageUrl: alert.imageUrl,
		price: alert.price,
		currency: alert.currency,
		purchaseUrl: alert.purchaseUrl,
		restPath: alert.restPath,
		inStock: alert.inStock,
	};

	const messages = [];
	for (const recipient of alert.recipients) {
		const profile = profiles.get(recipient.userId);
		if (!profile) continue;
		messages.push(
			buildWaitlistEmailMessage(
				emailContent,
				profile,
				recipient.username,
			),
		);
	}
	return messages;
}

/** Push (Whop) + email (Resend). Delivers if either channel succeeds. */
export async function sendWaitlistAlert(
	alert: WaitlistAlert,
): Promise<WaitlistAlertResult> {
	const userIds = alert.recipients.map((r) => r.userId);

	const push = await sendNotification(
		{ experienceId: alert.experienceId, userIds },
		{
			title: alert.title,
			content: alert.content,
			restPath: alert.restPath,
		},
	);

	const profiles = await getMemberProfilesForUsers(alert.companyId, userIds);
	const emailBatch = await sendEmailBatch(buildEmailBodies(alert, profiles));

	const delivered =
		push.skipped ||
		push.sent > 0 ||
		emailBatch.sent > 0 ||
		(push.failed === 0 && !push.skipped);

	return {
		pushSent: push.sent,
		pushFailed: push.failed,
		pushSkipped: Boolean(push.skipped),
		emailsSent: emailBatch.sent,
		emailsFailed: emailBatch.failed,
		emailsSkipped: emailBatch.skipped,
		delivered,
		lastError: push.lastError,
	};
}
