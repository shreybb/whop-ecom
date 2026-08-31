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
import { resolveCatalogCompanyId } from "@/lib/webhook-catalog";
import { resolveWebhookWork } from "@/lib/webhook-work";
import { getWhopWebhookSigningKey } from "@/lib/whop-webhook-key";
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
		account_id?: string | null;
		company_id?: string | null;
	};
	company_id?: string | null;
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

function webhookJson(body: Record<string, unknown>, status = 200) {
	return Response.json(body, { status });
}

/**
 * Whop does not emit app.installed / app.uninstalled webhook events (see
 * docs.whop.com/developer/guides/webhooks). Company rows are created lazily
 * on the first webhook or page view via upsertCompany().
 */
export async function POST(request: NextRequest): Promise<Response> {
	const requestBodyText = await request.text();
	const headers = Object.fromEntries(request.headers);
	console.log("[webhook] POST /api/webhooks");

	let event: AppWebhookEvent;
	try {
		event = getWhopSdk().webhooks.unwrap(requestBodyText, {
			headers,
			key: getWhopWebhookSigningKey(),
		}) as unknown as AppWebhookEvent;
	} catch (err) {
		console.error("[webhook] signature verification failed", err);
		return webhookJson({ ok: false, error: "invalid_signature" }, 400);
	}

	const workDecision = await resolveWebhookWork(event.id, event.type, event);
	if (workDecision === "skip_processed") {
		return webhookJson({ ok: true, duplicate: true });
	}

	console.log(`[webhook] received ${event.type} ${event.id}`);

	const work = processWebhookEvent(event);
	waitUntil(work);

	try {
		await work;
		await markWebhookProcessed(event.id);
		return webhookJson({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "unknown error";
		console.error(`[webhook] ${event.type} failed`, err);
		await incrementWebhookAttempt(event.id, message).catch((e) =>
			console.error("[webhook] failed to record attempt", e),
		);
		return webhookJson({ ok: false, error: "processing_failed" }, 500);
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
	const companyId = await resolveCatalogCompanyId(
		event.type,
		event.data,
		event.company_id,
	);
	if (!companyId) {
		console.warn(
			`[webhook] ${event.type} missing company id for resource ${event.data.id}`,
		);
		return;
	}
	await upsertCompany(companyId);
	const result = await syncCompanyStock(companyId, "webhook", { force: true });
	console.log(
		`[webhook] ${event.type} synced ${companyId}: restocked=${result.restockedPlanIds.length} soldOut=${result.soldOutPlanIds.length}`,
	);
}
