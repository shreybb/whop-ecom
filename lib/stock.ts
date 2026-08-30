import { getCompany, upsertCompany } from "@/lib/db/companies";
import { getTrackedProducts, upsertTrackedProducts } from "@/lib/db/products";
import type { RestockEvent, TrackedProduct } from "@/lib/db/types";
import {
	createRestockEvent,
	getWaitingEntries,
	markEntriesNotified,
} from "@/lib/db/waitlist";
import { sendNotification } from "@/lib/notify";
import { getWhopSdk } from "@/lib/whop-sdk";

// Whop has no stock field on products; availability lives on plans
// (stock / unlimited_stock). A product is in stock when any visible plan
// is purchasable. Sold-out -> in-stock transitions are restocks.

const SYNC_THROTTLE_MS = 60_000;
const MAX_PRODUCTS = 100;

type ProductSnapshot = Omit<TrackedProduct, "company_id" | "last_synced_at">;

async function fetchLiveSnapshot(
	companyId: string,
): Promise<ProductSnapshot[]> {
	// One plans.list call covers every product; group client-side.
	type PlanInfo = {
		productId: string;
		stock: number | null;
		unlimited: boolean;
		price: number;
		currency: string;
		purchaseUrl: string;
	};
	const whopsdk = getWhopSdk();
	const plansByProduct = new Map<string, PlanInfo[]>();
	let planCount = 0;
	for await (const plan of whopsdk.plans.list({ company_id: companyId })) {
		if (plan.visibility === "archived") continue;
		const productId = plan.product?.id;
		if (!productId) continue;
		const list = plansByProduct.get(productId) ?? [];
		list.push({
			productId,
			stock: plan.stock,
			unlimited: plan.unlimited_stock,
			price: plan.initial_price,
			currency: plan.currency,
			purchaseUrl: plan.purchase_url,
		});
		plansByProduct.set(productId, list);
		if (++planCount >= 500) break;
	}

	const snapshots: ProductSnapshot[] = [];
	let productCount = 0;
	for await (const product of whopsdk.products.list({
		company_id: companyId,
	})) {
		if (product.visibility === "archived") continue;
		const plans = plansByProduct.get(product.id) ?? [];
		if (plans.length === 0) continue;
		const unlimited = plans.some((p) => p.unlimited);
		const stockLeft = unlimited
			? null
			: plans.reduce((sum, p) => sum + (p.stock ?? 0), 0);
		const cheapest = plans.reduce((a, b) => (a.price <= b.price ? a : b));
		snapshots.push({
			product_id: product.id,
			title: product.title,
			route: product.route,
			currency: cheapest.currency,
			price: cheapest.price,
			purchase_url: cheapest.purchaseUrl,
			in_stock: unlimited || (stockLeft ?? 0) > 0,
			stock_left: stockLeft,
		});
		if (++productCount >= MAX_PRODUCTS) break;
	}
	return snapshots;
}

export type SyncResult = {
	products: TrackedProduct[];
	restockedProductIds: string[];
	soldOutProductIds: string[];
};

// Compare live Whop stock against our cache, persist the new state, and
// react to transitions. Throttled so page views can call it freely.
export async function syncCompanyStock(
	companyId: string,
	source: RestockEvent["source"],
	options: { force?: boolean } = {},
): Promise<SyncResult> {
	const cached = await getTrackedProducts(companyId);

	const newestSync = cached.reduce(
		(max, p) => Math.max(max, new Date(p.last_synced_at).getTime()),
		0,
	);
	if (
		!options.force &&
		cached.length > 0 &&
		Date.now() - newestSync < SYNC_THROTTLE_MS
	) {
		return { products: cached, restockedProductIds: [], soldOutProductIds: [] };
	}

	const live = await fetchLiveSnapshot(companyId);
	const cachedById = new Map(cached.map((p) => [p.product_id, p]));

	const restocked: string[] = [];
	const soldOut: string[] = [];
	for (const snap of live) {
		const prev = cachedById.get(snap.product_id);
		if (prev && !prev.in_stock && snap.in_stock) restocked.push(snap.product_id);
		if (prev && prev.in_stock && !snap.in_stock) soldOut.push(snap.product_id);
	}

	await upsertTrackedProducts(companyId, live);
	const products = await getTrackedProducts(companyId);
	const byId = new Map(products.map((p) => [p.product_id, p]));

	const company = (await getCompany(companyId)) ?? (await upsertCompany(companyId));

	for (const productId of restocked) {
		const product = byId.get(productId);
		if (!product) continue;
		if (company.auto_notify) {
			await notifyWaitlistForProduct(companyId, product, source);
		}
	}

	// A sellout is a merchant moment: tell the team the waitlist is armed.
	for (const productId of soldOut) {
		const product = byId.get(productId);
		if (!product) continue;
		await sendNotification(
			{ accountId: companyId },
			{
				title: `${product.title} just sold out`,
				content:
					"Restocked is now collecting demand — customers can join the waitlist and you can notify them all in one click when you restock.",
			},
		).catch((err) => console.error("[stock] sellout notify failed", err));
	}

	return {
		products,
		restockedProductIds: restocked,
		soldOutProductIds: soldOut,
	};
}

// Notify everyone waiting on a product, grouped by the experience they
// joined from (Whop notifications are addressed per experience).
export async function notifyWaitlistForProduct(
	companyId: string,
	product: TrackedProduct,
	source: RestockEvent["source"],
): Promise<{ notified: number }> {
	const entries = await getWaitingEntries(companyId, product.product_id);
	if (entries.length === 0) return { notified: 0 };

	const event = await createRestockEvent(companyId, product.product_id, source);

	const byExperience = new Map<string, typeof entries>();
	for (const entry of entries) {
		const list = byExperience.get(entry.experience_id) ?? [];
		list.push(entry);
		byExperience.set(entry.experience_id, list);
	}

	const notifiedIds: string[] = [];
	for (const [experienceId, group] of byExperience) {
		const { failed } = await sendNotification(
			{ experienceId, userIds: group.map((e) => e.whop_user_id) },
			{
				title: `${product.title} is back in stock!`,
				content: `You asked us to let you know — ${product.title} is available again. Grab it before it sells out.`,
			},
		);
		if (failed === 0) notifiedIds.push(...group.map((e) => e.id));
	}

	await markEntriesNotified(companyId, notifiedIds, event.id);

	await sendNotification(
		{ accountId: companyId },
		{
			title: `Waitlist notified: ${product.title}`,
			content: `${notifiedIds.length} waiting customer${notifiedIds.length === 1 ? "" : "s"} just got a back-in-stock alert. Watch your recovered revenue.`,
		},
	).catch((err) => console.error("[stock] merchant notify failed", err));

	return { notified: notifiedIds.length };
}
