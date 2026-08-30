import { waitUntil } from "@vercel/functions";
import type { Payment, UnwrapWebhookEvent } from "@whop/sdk/resources.js";
import type { NextRequest } from "next/server";
import { upsertCompany } from "@/lib/db/companies";
import {
	claimWebhookEvent,
	recordConversionIfAttributed,
} from "@/lib/db/conversions";
import { syncCompanyStock } from "@/lib/stock";
import { getWhopSdk } from "@/lib/whop-sdk";

// The pinned @whop/sdk 0.0.3 types only payment/membership/invoice/entry
// events, but unwrap() verifies the signature and JSON-parses whatever Whop
// sends — so product.* events arrive fine and just need a local type.
type ProductWebhookEvent = {
	id: string;
	type: "product.created" | "product.updated" | "product.published" | "product.unpublished";
	data: { id: string; company?: { id: string } | null };
};

export async function POST(request: NextRequest): Promise<Response> {
	// Signature check (Standard Webhooks HMAC) happens inside unwrap; an
	// invalid signature throws and we return 400 below.
	const requestBodyText = await request.text();
	const headers = Object.fromEntries(request.headers);

	// Widen the pinned SDK's event union to include the product.* events it
	// predates (unwrap passes them through after verifying the signature).
	let event: UnwrapWebhookEvent | ProductWebhookEvent;
	try {
		event = getWhopSdk().webhooks.unwrap(requestBodyText, {
			headers,
		}) as unknown as typeof event;
	} catch (err) {
		console.error("[webhook] signature verification failed", err);
		return new Response("Invalid signature", { status: 400 });
	}

	// Whop delivers at-least-once with a 5s deadline: claim the event id for
	// idempotency, hand work to waitUntil, and return 200 immediately.
	const fresh = await claimWebhookEvent(event.id, event.type, event);
	if (!fresh) return new Response("OK (duplicate)", { status: 200 });

	if (event.type === "payment.succeeded") {
		waitUntil(handlePaymentSucceeded(event.data));
	} else if (event.type.startsWith("product.")) {
		waitUntil(handleProductChanged(event as ProductWebhookEvent));
	}


	return new Response("OK", { status: 200 });
}

async function handlePaymentSucceeded(payment: Payment) {
	const companyId = payment.company?.id;
	const productId = payment.product?.id;
	const userId = payment.user?.id;
	if (!companyId) return;

	await upsertCompany(companyId, payment.company?.title ?? null);

	// 1. Attribution: was this buyer notified about this product recently?
	if (productId && userId) {
		const attributed = await recordConversionIfAttributed({
			companyId,
			productId,
			whopUserId: userId,
			paymentId: payment.id,
			amountUsd: payment.usd_total ?? payment.total,
			currency: payment.currency,
		});
		if (attributed) {
			console.log(
				`[webhook] recovered sale ${payment.id} for ${productId} (${companyId})`,
			);
		}
	}

	// 2. This sale may have consumed the last unit: re-check stock so a
	// sellout is detected (and the merchant alerted) in near real-time.
	await syncCompanyStock(companyId, "webhook", { force: true }).catch((err) =>
		console.error("[webhook] post-payment sync failed", err),
	);
}

async function handleProductChanged(event: ProductWebhookEvent) {
	const companyId = event.data.company?.id;
	if (!companyId) return;
	await upsertCompany(companyId);
	// A product/stock edit in the Whop dashboard lands here, which is how
	// restocks made outside our app trigger waitlist alerts automatically.
	await syncCompanyStock(companyId, "webhook", { force: true }).catch((err) =>
		console.error("[webhook] product sync failed", err),
	);
}
