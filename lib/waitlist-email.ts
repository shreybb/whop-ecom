import type { MemberProfile } from "@/lib/whop-members";
import type { EmailMessage } from "@/lib/email";

export type WaitlistEmailRecipient = {
	userId: string;
	username?: string | null;
};

export type WaitlistEmailContent = {
	title: string;
	body: string;
	productTitle: string;
	companyTitle: string | null;
	imageUrl?: string | null;
	price?: number | null;
	currency?: string | null;
	purchaseUrl?: string | null;
	restPath?: string;
	inStock: boolean;
};

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function formatPrice(price: number | null | undefined, currency: string | null | undefined) {
	if (price == null) return null;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: (currency ?? "usd").toUpperCase(),
		}).format(price);
	} catch {
		return `$${price.toFixed(2)}`;
	}
}

function getAppOrigin(): string | null {
	const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
	if (configured) return configured.replace(/\/$/, "");
	const vercel = process.env.VERCEL_URL?.trim();
	if (vercel) return `https://${vercel}`;
	return null;
}

export function recipientFirstName(
	profile: MemberProfile | undefined,
	fallbackUsername?: string | null,
): string {
	const name = profile?.name?.trim();
	if (name) {
		const first = name.split(/\s+/)[0];
		if (first) return first;
	}
	const username = profile?.username ?? fallbackUsername;
	if (username) return username.replace(/^@/, "");
	return "there";
}

function resolveCtaUrl(content: WaitlistEmailContent): string | null {
	if (content.purchaseUrl) return content.purchaseUrl;
	if (!content.restPath) return null;
	const origin = getAppOrigin();
	if (!origin) return null;
	return `${origin}${content.restPath.startsWith("/") ? "" : "/"}${content.restPath}`;
}

export function buildWaitlistEmailMessage(
	content: WaitlistEmailContent,
	profile: MemberProfile,
	fallbackUsername?: string | null,
): EmailMessage {
	const seller = content.companyTitle?.trim() || "the store";
	const firstName = recipientFirstName(profile, fallbackUsername);
	const priceLabel = formatPrice(content.price, content.currency);
	const ctaUrl = resolveCtaUrl(content);
	const ctaLabel = content.inStock ? "Shop now" : "View in Drops";
	const statusLabel = content.inStock ? "Back in stock" : "Waitlist update";

	const safe = {
		title: escapeHtml(content.title),
		body: escapeHtml(content.body),
		productTitle: escapeHtml(content.productTitle),
		seller: escapeHtml(seller),
		firstName: escapeHtml(firstName),
		priceLabel: priceLabel ? escapeHtml(priceLabel) : null,
		statusLabel: escapeHtml(statusLabel),
		ctaLabel: escapeHtml(ctaLabel),
	};

	const imageBlock = content.imageUrl
		? `<img src="${escapeHtml(content.imageUrl)}" alt="${safe.productTitle}" width="120" height="120" style="display:block;width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid #e5e5e5;" />`
		: `<div style="width:120px;height:120px;border-radius:12px;background:#f4f4f5;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;color:#71717a;">${safe.productTitle.slice(0, 1)}</div>`;

	const ctaBlock = ctaUrl
		? `<p style="margin:24px 0 0;">
				<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">
					${safe.ctaLabel}
				</a>
			</p>`
		: "";

	const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
		<tr>
			<td align="center">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
					<tr>
						<td style="padding:24px 28px 8px;font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:#6b7280;">
							${safe.seller}
						</td>
					</tr>
					<tr>
						<td style="padding:0 28px 8px;font-size:24px;font-weight:700;line-height:1.3;">
							${safe.title}
						</td>
					</tr>
					<tr>
						<td style="padding:8px 28px 0;font-size:15px;line-height:1.6;color:#374151;">
							Hi ${safe.firstName},
						</td>
					</tr>
					<tr>
						<td style="padding:20px 28px;">
							<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
								<tr>
									<td style="padding:16px;width:120px;vertical-align:top;">
										${imageBlock}
									</td>
									<td style="padding:16px 16px 16px 0;vertical-align:top;">
										<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:0.04em;">
											${safe.statusLabel}
										</p>
										<p style="margin:0 0 6px;font-size:18px;font-weight:700;line-height:1.35;color:#111827;">
											${safe.productTitle}
										</p>
										${safe.priceLabel ? `<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111827;">${safe.priceLabel}</p>` : ""}
										<p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
											${safe.body}
										</p>
									</td>
								</tr>
							</table>
							${ctaBlock}
						</td>
					</tr>
					<tr>
						<td style="padding:0 28px 28px;font-size:12px;line-height:1.5;color:#9ca3af;">
							You joined the waitlist for ${safe.productTitle} at ${safe.seller}.
							${ctaUrl ? "" : " Open the Drops tab on Whop to check availability."}
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`.trim();

	const textLines = [
		`${seller}`,
		"",
		`Hi ${firstName},`,
		"",
		content.title,
		"",
		content.productTitle,
		priceLabel ? priceLabel : null,
		"",
		content.body,
		"",
		ctaUrl ? `${ctaLabel}: ${ctaUrl}` : "Open the Drops tab on Whop to check availability.",
		"",
		`You joined the waitlist for ${content.productTitle} at ${seller}.`,
	].filter((line): line is string => line != null);

	return {
		to: profile.email,
		subject: content.title,
		html,
		text: textLines.join("\n"),
	};
}
