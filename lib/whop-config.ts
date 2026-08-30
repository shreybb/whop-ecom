const PRODUCTION_API_BASE = "https://api.whop.com/api/v1";
const SANDBOX_API_BASE = "https://sandbox-api.whop.com/api/v1";

/** Whop REST API base URL. Set WHOP_API_BASE for sandbox. */
export function getWhopApiBase(): string {
	const configured = process.env.WHOP_API_BASE?.trim();
	if (configured) return configured.replace(/\/$/, "");
	return PRODUCTION_API_BASE;
}

export function isWhopSandbox(): boolean {
	return getWhopApiBase() === SANDBOX_API_BASE;
}
