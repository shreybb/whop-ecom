import type { NextRequest } from "next/server";
import { listCompanyIds } from "@/lib/db/companies";
import { syncCompanyStock } from "@/lib/stock";

// Safety-net restock detection for merchants who restock in the Whop
// dashboard while nobody has the app open. Primary detection paths are the
// product.* webhooks and the lazy sync on page views; this cron guarantees
// an upper bound on staleness. Vercel sends Authorization: Bearer CRON_SECRET.
export async function GET(request: NextRequest): Promise<Response> {
	const secret = process.env.CRON_SECRET;
	if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
		return new Response("Unauthorized", { status: 401 });
	}

	const companyIds = await listCompanyIds();
	const results: Record<string, string> = {};
	for (const companyId of companyIds) {
		try {
			const { restockedProductIds } = await syncCompanyStock(
				companyId,
				"cron",
				{ force: true },
			);
			results[companyId] = `ok (${restockedProductIds.length} restocks)`;
		} catch (err) {
			results[companyId] = `error: ${err instanceof Error ? err.message : "unknown"}`;
		}
	}
	return Response.json({ synced: companyIds.length, results });
}
