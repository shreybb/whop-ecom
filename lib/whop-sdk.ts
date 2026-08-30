import { Whop } from "@whop/sdk";

let client: Whop | null = null;

// Lazy singleton so builds and page-data collection don't require
// production secrets — the client is only constructed at request time.
export function getWhopSdk(): Whop {
	if (!client) {
		client = new Whop({
			appID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
			apiKey: process.env.WHOP_API_KEY,
			webhookKey: btoa(process.env.WHOP_WEBHOOK_SECRET || ""),
		});
	}
	return client;
}
