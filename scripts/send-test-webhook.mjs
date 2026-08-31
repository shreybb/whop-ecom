import { config } from "dotenv";
import { Webhook } from "standardwebhooks";

config({ path: ".env.local" });

const secret = process.env.WHOP_WEBHOOK_SECRET;

function createWhopWebhookVerifier(value) {
	const trimmed = value.trim();
	if (trimmed.startsWith("ws_")) {
		return new Webhook(trimmed, { format: "raw" });
	}
	return new Webhook(trimmed);
}
const url =
	process.env.WEBHOOK_TEST_URL ||
	"https://whop-ecom-beta.vercel.app/api/webhooks";
const companyId =
	process.env.WEBHOOK_TEST_COMPANY_ID || "biz_ziYSVogR6YqSPN";

if (!secret) {
	console.error("Missing WHOP_WEBHOOK_SECRET in .env.local");
	process.exit(1);
}

// ws_ secrets use raw UTF-8 bytes; whsec_ uses Standard Webhooks base64 decoding.
const wh = createWhopWebhookVerifier(secret);

async function send(label, payload, { sign = true } = {}) {
	const body = JSON.stringify(payload);
	const msgId = payload.id;
	const timestamp = new Date();
	const headers = { "content-type": "application/json" };
	if (sign) {
		headers["webhook-id"] = msgId;
		headers["webhook-timestamp"] = String(
			Math.floor(timestamp.getTime() / 1000),
		);
		headers["webhook-signature"] = wh.sign(msgId, timestamp, body);
	}
	const res = await fetch(url, { method: "POST", headers, body });
	const text = await res.text();
	console.log(`\n[${label}] ${res.status} ${res.statusText}`);
	console.log(text || "(empty body)");
	return res.status;
}

const ts = Date.now();
const eventType = process.argv[2] || "plan.updated";

await send(
	"unsigned (expect 400)",
	{ id: `evt_unsigned_${ts}`, type: eventType, data: {} },
	{ sign: false },
);

const payload = {
	id: `evt_test_${eventType.replace(/\./g, "_")}_${ts}`,
	type: eventType,
	data: {
		id: "plan_test_probe",
		company: { id: companyId },
	},
};

await send(`${eventType} (first delivery)`, payload);
await send(`${eventType} (duplicate, expect OK duplicate)`, payload);
