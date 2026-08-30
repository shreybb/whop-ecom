import { getCompany, upsertCompany } from "@/lib/db/companies";
import {
	aggregatePlansToProducts,
	deleteStaleTrackedPlans,
	getTrackedPlans,
	upsertTrackedPlans,
} from "@/lib/db/products";
import type { RestockEvent, TrackedPlan, TrackedProduct } from "@/lib/db/types";
import {
	claimWaitingSubscribers,
	countPendingNotifyForPlan,
	countSubscribedForPlan,
	createRestockEvent,
	resetPlanNotifyEligibility,
	setRestockNotifiedCount,
} from "@/lib/db/waitlist";
import { sendWaitlistAlert } from "@/lib/alerts";
import { buildWaitlistNotifyMessage, sendNotification } from "@/lib/notify";
import { detectPlanStockTransitions } from "@/lib/stock-transitions";
import { getWhopSdk } from "@/lib/whop-sdk";

export type { TrackedPlan } from "@/lib/db/types";
export { claimWaitingSubscribers } from "@/lib/db/waitlist";

const SYNC_THROTTLE_MS = 60_000;
const PLAN_SOFT_CAP = 2000;

type PlanSnapshot = Omit<TrackedPlan, "company_id" | "last_synced_at">;

async function fetchLiveSnapshot(companyId: string): Promise<PlanSnapshot[]> {
	const whopsdk = getWhopSdk();
	const productsById = new Map<string, { title: string; route: string; imageUrl: string | null; visibility: string }>();
	for await (const product of whopsdk.products.list({ company_id: companyId })) {
		if (product.visibility === "archived") continue;
		const imageUrl = (product as { banner_image?: { url?: string } | null }).banner_image?.url ?? null;
		productsById.set(product.id, { title: product.title, route: product.route, imageUrl, visibility: product.visibility });
	}
	const snapshots: PlanSnapshot[] = [];
	let planCount = 0;
	for await (const plan of whopsdk.plans.list({ company_id: companyId })) {
		if (plan.visibility === "archived" || plan.visibility === "hidden") continue;
		const productId = plan.product?.id;
		const product = productId ? productsById.get(productId) : undefined;
		if (!productId || !product) continue;
		const unlimited = plan.unlimited_stock;
		const stockLeft = unlimited ? null : (plan.stock ?? 0);
		snapshots.push({
			product_id: productId,
			plan_id: plan.id,
			title: product.title,
			plan_title: plan.title,
			route: product.route,
			currency: plan.currency,
			price: plan.initial_price,
			purchase_url: plan.purchase_url,
			image_url: product.imageUrl,
			visibility: plan.visibility,
			in_stock: unlimited || (stockLeft ?? 0) > 0,
			stock_left: stockLeft,
			unlimited,
		});
		if (++planCount >= PLAN_SOFT_CAP) {
			console.warn(`[stock] plan soft cap (${PLAN_SOFT_CAP}) reached for ${companyId}`);
			break;
		}
	}
	return snapshots;
}

export type SyncResult = {
	plans: TrackedPlan[];
	products: TrackedProduct[];
	restockedPlanIds: string[];
	soldOutPlanIds: string[];
	restockedProductIds: string[];
	soldOutProductIds: string[];
};

export async function syncCompanyStock(
	companyId: string,
	source: RestockEvent["source"],
	options: { force?: boolean } = {},
): Promise<SyncResult> {
	const cached = await getTrackedPlans(companyId);
	const newestSync = cached.reduce((max, p) => Math.max(max, new Date(p.last_synced_at).getTime()), 0);
	if (!options.force && cached.length > 0 && Date.now() - newestSync < SYNC_THROTTLE_MS) {
		const products = aggregatePlansToProducts(cached);
		return { plans: cached, products, restockedPlanIds: [], soldOutPlanIds: [], restockedProductIds: [], soldOutProductIds: [] };
	}
	const live = await fetchLiveSnapshot(companyId);
	const liveKeys = new Set(live.map((s) => `${s.product_id}:${s.plan_id}`));
	const { restockedPlanIds, soldOutPlanIds } = detectPlanStockTransitions(cached, live);
	await upsertTrackedPlans(companyId, live);
	const deleted = await deleteStaleTrackedPlans(companyId, liveKeys);
	if (deleted > 0) console.info(`[stock] removed ${deleted} stale plan rows for ${companyId}`);
	const plans = await getTrackedPlans(companyId);
	const products = aggregatePlansToProducts(plans);
	const planById = new Map(plans.map((p) => [p.plan_id, p]));
	const company = (await getCompany(companyId)) ?? (await upsertCompany(companyId));
	for (const planId of restockedPlanIds) {
		const plan = planById.get(planId);
		if (!plan) continue;
		if (company.auto_notify) await notifyWaitlistForPlan(companyId, plan, source);
	}
	for (const planId of soldOutPlanIds) {
		const plan = planById.get(planId);
		if (!plan) continue;
		await resetPlanNotifyEligibility(companyId, planId);
		const label = plan.plan_title ? `${plan.title} — ${plan.plan_title}` : plan.title;
		await sendNotification({ accountId: companyId }, {
			title: `${label} just sold out`,
			content: "Restocked is now collecting demand — customers can join the waitlist and you can notify them all in one click when you restock.",
		}).catch((err) => console.error("[stock] sellout notify failed", err));
	}
	const restockedProductIds = [...new Set(restockedPlanIds.map((id) => planById.get(id)?.product_id).filter((id): id is string => Boolean(id)))];
	const soldOutProductIds = [...new Set(soldOutPlanIds.map((id) => planById.get(id)?.product_id).filter((id): id is string => Boolean(id)))];
	return { plans, products, restockedPlanIds, soldOutPlanIds, restockedProductIds, soldOutProductIds };
}

export async function notifyWaitlistForPlan(
	companyId: string,
	plan: TrackedPlan,
	source: RestockEvent["source"],
): Promise<{ notified: number; waiting: number; pendingNotify: number; stockLeft: number | null }> {
	const waiting = await countSubscribedForPlan(companyId, plan.plan_id);
	const pendingNotify = await countPendingNotifyForPlan(companyId, plan.plan_id);
	const stockLeft = plan.unlimited ? null : plan.stock_left;
	if (pendingNotify === 0) return { notified: 0, waiting, pendingNotify, stockLeft };
	const event = await createRestockEvent(companyId, plan.product_id, plan.plan_id, source);
	const claimed = await claimWaitingSubscribers(companyId, plan.plan_id, event.id);
	if (claimed.length === 0) return { notified: 0, waiting, pendingNotify, stockLeft };
	const company = await getCompany(companyId);
	const defaults = buildWaitlistNotifyMessage(company, plan, { title: "", content: "" }, source);
	const byExperience = new Map<string, typeof claimed>();
	for (const entry of claimed) {
		const list = byExperience.get(entry.experience_id) ?? [];
		list.push(entry);
		byExperience.set(entry.experience_id, list);
	}
	let notified = 0;
	for (const [experienceId, group] of byExperience) {
		const result = await sendWaitlistAlert({
			companyId,
			experienceId,
			recipients: group.map((e) => ({
				userId: e.whop_user_id,
				username: e.username,
			})),
			title: defaults.title,
			content: defaults.content,
			restPath: `/experiences/${experienceId}`,
			productTitle: plan.plan_title ? `${plan.title} — ${plan.plan_title}` : plan.title,
			companyTitle: company?.title,
			imageUrl: plan.image_url,
			price: plan.price,
			currency: plan.currency,
			purchaseUrl: plan.in_stock ? plan.purchase_url : null,
			inStock: plan.in_stock,
		});
		const alertOk = result.pushSkipped || result.pushSent > 0 || result.emailsSent > 0 || (result.pushFailed === 0 && !result.pushSkipped);
		if (alertOk) notified += group.length;
		else console.warn("[stock] alert failed; entries stay subscribed", result.lastError);
	}
	await setRestockNotifiedCount(event.id, notified);
	const label = plan.plan_title ? `${plan.title} — ${plan.plan_title}` : plan.title;
	await sendNotification({ accountId: companyId }, {
		title: `Waitlist notified: ${label}`,
		content: `${notified} waiting customer${notified === 1 ? "" : "s"} just got a back-in-stock alert. Watch your recovered revenue.`,
	}).catch((err) => console.error("[stock] merchant notify failed", err));
	return { notified, waiting, pendingNotify: Math.max(0, pendingNotify - notified), stockLeft };
}

export async function notifyWaitlistForProduct(
	companyId: string,
	product: TrackedProduct,
	source: RestockEvent["source"],
): Promise<{ notified: number }> {
	const plans = (await getTrackedPlans(companyId)).filter((p) => p.product_id === product.product_id);
	let notified = 0;
	for (const plan of plans) notified += (await notifyWaitlistForPlan(companyId, plan, source)).notified;
	return { notified };
}
