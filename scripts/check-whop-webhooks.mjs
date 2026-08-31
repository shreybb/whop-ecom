import { config } from "dotenv";

config({ path: ".env.local" });

const apiKey = process.env.WHOP_API_KEY;
const base = (process.env.WHOP_API_BASE || "https://api.whop.com/api/v1").replace(
	/\/$/,
	"",
);

if (!apiKey) {
	console.error("Set WHOP_API_KEY (production key for live webhooks).");
	process.exit(1);
}

const res = await fetch(`${base}/webhooks`, {
	headers: { Authorization: `Bearer ${apiKey}` },
});
const body = await res.text();
if (!res.ok) {
	console.error(`GET /webhooks failed ${res.status}:`, body);
	process.exit(1);
}

const data = JSON.parse(body);
const hooks = Array.isArray(data) ? data : data.data ?? [];
if (hooks.length === 0) {
	console.log("No webhooks registered for this API key.");
	process.exit(0);
}

console.log(`Found ${hooks.length} webhook(s):\n`);
for (const hook of hooks) {
	console.log(`  id:      ${hook.id}`);
	console.log(`  url:     ${hook.url}`);
	console.log(`  enabled: ${hook.enabled}`);
	console.log(`  events:  ${(hook.events ?? []).join(", ") || "(none)"}`);
	console.log("");
}
