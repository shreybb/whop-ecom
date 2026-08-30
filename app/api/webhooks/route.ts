import { waitUntil } from "@vercel/functions";
import type { Payment, UnwrapWebhookEvent } from "@whop/sdk/resources.js";
import type { NextRequest } from "next/server";
import { upsertCompany } from "@/lib/db/companies";
import {
	incrementWebhookAttempt,
	markConversionRefunded,
	markWebhookProcessed,
	recordConversionIfAttributed,
} from "@/lib/db/conversions";
import { syncCompanyStock } from "@/lib/stock";
import { resolveWebhookWork } from "@/lib/webhook-work";
import { getWhopSdk } from "@/lib/whop-sdk";

// The pinned @whop/sdk 0.0.3 types only payment/membership/invoice/entry
// events, but unwrap() verifies the signature and JSON-parses whatever Whop
// sends — so product.* / refund.* events arrive fine and just need local types.
type CatalogWebhookEvent = {
	id: string;
	type:
		| "product.created"
		| "product.updated"
		| "product.published"
		| "product.unpublished"
		| "product.deleted"
		| "plan.created"
		| "plan.updated"
		| "plan.deleted";
	data: {
		id: string;
		company?: { id: string } | null;
		product?: { id: string } | null;
	};
};

// Official Whop webhook events (not in pinned SDK): refund.created, refund.updated
type RefundWebhookEvent = {
	id: string;
	type: "refund.created" | "refund.updated";
	data: {
		id: string;
		payment?: { id: string } | null;
		status?: string;
	};
};

type AppWebhookEvent = UnwrapWebhookEvent | CatalogWebhookEvent | RefundWebhookEvent;

/**
 * Whop does not emit app.installed / app.uninstalled webhook events (see
 * docs.whop.com/developer/guides/webhooks). Company rows are created lazily
 * on the first webhook or page view via upsertCompany().
 */
export async function POST(request: NextRequest): Promise<Response> {
	const requestBodyText = await request.text();
	const headers = Object.fromEntries(request.headers);

	let event: AppWebhookEvent;
	try {
		event = getWhopSdk().webhooks.unwrap(requestBodyText, {
			headers,
		}) as unknown as AppWebhookEvent;
	} catch (err) {
		console.error("[webhook] signature verification failed", err);
		return new Response("Invalid signature", { status: 400 });
	}

	const workDecision = await resolveWebhookWork(event.id, event.type, event);
	if (workDecision === "skip_processed") {
		return new Response("OK (duplicate)", { status: 200 });
	}

	const work = processWebhookEvent(event);
	waitUntil(work);

	try {
		await work;
		await markWebhookProcessed(event.id);
		return new Response("OK", { status: 200 });
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown error";
		console.error(`[webhook] ${event.type} failed`, err);
		await incrementWebhookAttempt(event.id, message).catch((e) =>
			console.error("[webhook] failed to record attempt", e),
		);
		return new Response("Processing failed", { status: 500 });
	}
}

async function processWebhookEvent(event: AppWebhookEvent): Promise<void> {
	if (event.type === "payment.succeeded") {
		await handlePaymentSucceeded(event.data);
		return;
	}

	if (event.type === "refund.created" || event.type === "refund.updated") {
		await handleRefund(event as RefundWebhookEvent);
		return;
	}

	if (
		event.type.startsWith("product.") ||
		event.type.startsWith("plan.")
	) {
		await handleCatalogChanged(event as CatalogWebhookEvent);
		return;
	}

	// Unhandled event types are acknowledged without side effects.
}

async function handlePaymentSucceeded(payment: Payment) {
	const companyId = payment.company?.id;
	const productId = payment.product?.id;
	const userId = payment.user?.id;
	if (!companyId) return;

	await upsertCompany(companyId, payment.company?.title ?? null);

	const planId = payment.plan?.id;
	if (productId && planId && userId) {
		const attributed = await recordConversionIfAttributed({
			companyId,
			productId,
			planId,
			whopUserId: userId,
			paymentId: payment.id,
			amountUsd: payment.usd_total,
			currency: payment.currency,
		});
		if (attributed) {
			console.log(
				`[webhook] recovered sale ${payment.id} for plan ${planId} (${companyId})`,
			);
		}
	}

	await syncCompanyStock(companyId, "webhook", { force: true });
}

async function handleRefund(event: RefundWebhookEvent) {
	const paymentId = event.data.payment?.id;
	if (!paymentId) return;
	await markConversionRefunded(paymentId);
	console.log(`[webhook] marked conversion refunded for payment ${paymentId}`);
}

async function handleCatalogChanged(event: CatalogWebhookEvent) {
	const companyId = event.data.company?.id;
	if (!companyId) return;
	await upsertCompany(companyId);
	await syncCompanyStock(companyId, "webhook", { force: true });
}
