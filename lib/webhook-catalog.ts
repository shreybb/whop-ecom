import { getWhopSdk } from "@/lib/whop-sdk";

type CatalogWebhookData = {
	id: string;
	company?: { id: string } | null;
	product?: { id: string } | null;
	account_id?: string | null;
	company_id?: string | null;
};

/** Whop webhook payloads may use company, account_id, or company_id depending on API version. */
export async function resolveCatalogCompanyId(
	eventType: string,
	data: CatalogWebhookData,
	envelopeCompanyId?: string | null,
): Promise<string | null> {
	if (data.company?.id) return data.company.id;
	if (envelopeCompanyId) return envelopeCompanyId;
	if (data.account_id) return data.account_id;
	if (data.company_id) return data.company_id;

	if (!eventType.startsWith("plan.")) return null;

	try {
		const plan = await getWhopSdk().plans.retrieve(data.id);
		const productId = plan.product?.id;
		if (!productId) return null;
		const product = await getWhopSdk().products.retrieve(productId);
		return (product as { company?: { id: string } }).company?.id ?? null;
	} catch (err) {
		console.error("[webhook] failed to resolve company from plan", data.id, err);
		return null;
	}
}
