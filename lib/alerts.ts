import { sendEmail } from "@/lib/email";
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
	/** Whop user ids that received push and/or email. */
	deliveredUserIds: string[];
	lastError?: string;
};

const PUSH_CHUNK_SIZE = 25;

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

	const messages: { userId: string; message: ReturnType<typeof buildWaitlistEmailMessage> }[] = [];
	for (const recipient of alert.recipients) {
		const profile = profiles.get(recipient.userId);
		const email = profile?.email ?? recipient.email?.trim() ?? null;
		if (!email) continue;
		messages.push({
			userId: recipient.userId,
			message: buildWaitlistEmailMessage(
				emailContent,
				profile ?? {
					userId: recipient.userId,
					email,
					name: null,
					username: recipient.username ?? null,
				},
				recipient.username,
			),
		});
	}
	return messages;
}

/** Push (Whop) + email (Resend). A recipient counts as delivered on either channel. */
export async function sendWaitlistAlert(
	alert: WaitlistAlert,
): Promise<WaitlistAlertResult> {
	const userIds = alert.recipients.map((r) => r.userId);
	const pushDelivered = new Set<string>();
	let pushSent = 0;
	let pushFailed = 0;
	let pushSkipped = false;
	let lastError: string | undefined;

	for (let i = 0; i < userIds.length; i += PUSH_CHUNK_SIZE) {
		const chunkIds = userIds.slice(i, i + PUSH_CHUNK_SIZE);
		const push = await sendNotification(
			{ experienceId: alert.experienceId, userIds: chunkIds },
			{
				title: alert.title,
				content: alert.content,
				restPath: alert.restPath,
			},
		);
		if (push.skipped) {
			pushSkipped = true;
			continue;
		}
		if (push.sent > 0 && push.failed === 0) {
			pushSent += push.sent;
			// Whop notifications API reports per-request success, not per-user delivery.
			// Only attribute push to specific users when correlation is unambiguous.
			if (chunkIds.length === 1 || push.sent === chunkIds.length) {
				for (const userId of chunkIds) pushDelivered.add(userId);
			}
		} else if (push.failed > 0) {
			pushFailed += push.failed;
			lastError = push.lastError;
		}
	}

	const profiles = await getMemberProfilesForUsers(alert.companyId, userIds);
	const emailBodies = buildEmailBodies(alert, profiles);
	const emailDelivered = new Set<string>();
	let emailsSent = 0;
	let emailsFailed = 0;
	let emailsSkipped = false;

	for (const { userId, message } of emailBodies) {
		const result = await sendEmail(message);
		if (result.skipped) {
			emailsSkipped = true;
			break;
		}
		if (result.ok) {
			emailsSent += 1;
			emailDelivered.add(userId);
		} else {
			emailsFailed += 1;
			lastError = result.error ?? lastError;
		}
	}

	const deliveredUserIds = [...new Set([...pushDelivered, ...emailDelivered])];

	return {
		pushSent,
		pushFailed,
		pushSkipped,
		emailsSent,
		emailsFailed,
		emailsSkipped,
		deliveredUserIds,
		lastError,
	};
}
