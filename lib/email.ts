// Transactional email via Resend (https://resend.com). Whop push notifications
// are in-app only; email reaches users who miss the push or prefer inbox alerts.

export type EmailMessage = {
	to: string;
	subject: string;
	html: string;
	text: string;
};

export async function sendEmail(
	message: EmailMessage,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!apiKey || !from) {
		return { ok: false, skipped: true };
	}

	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: [message.to],
			subject: message.subject,
			html: message.html,
			text: message.text,
		}),
	});

	if (res.ok) return { ok: true };
	const error = await res.text().catch(() => `HTTP ${res.status}`);
	console.error("[email] send failed", res.status, error);
	return { ok: false, error };
}

export async function sendEmailBatch(
	messages: EmailMessage[],
): Promise<{ sent: number; failed: number; skipped: boolean }> {
	if (messages.length === 0) return { sent: 0, failed: 0, skipped: true };

	let sent = 0;
	let failed = 0;
	let skipped = false;
	for (const message of messages) {
		const result = await sendEmail(message);
		if (result.skipped) {
			skipped = true;
			break;
		}
		if (result.ok) sent += 1;
		else failed += 1;
	}
	return { sent, failed, skipped };
}
