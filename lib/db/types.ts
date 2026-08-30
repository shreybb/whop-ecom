// Row types for the tenant-scoped data layer. The tenant is always a Whop
// company (biz_*); every table carries company_id.

export type CompanyRow = {
	id: string;
	title: string | null;
	auto_notify: boolean;
	notify_title: string | null;
	notify_body: string | null;
	created_from_install: boolean;
	created_at: string;
};

/** One cached Whop plan row (primary stock grain). */
export type TrackedPlan = {
	company_id: string;
	product_id: string;
	plan_id: string;
	title: string;
	plan_title: string | null;
	route: string | null;
	currency: string | null;
	price: number | null;
	purchase_url: string | null;
	image_url: string | null;
	visibility: string | null;
	in_stock: boolean;
	stock_left: number | null;
	unlimited: boolean;
	last_synced_at: string;
};

/**
 * @deprecated Product-aggregated view for backward compat until Agent D lands
 * plan-grain UI. Prefer TrackedPlan.
 */
export type TrackedProduct = {
	company_id: string;
	product_id: string;
	title: string;
	route: string | null;
	currency: string | null;
	price: number | null;
	purchase_url: string | null;
	in_stock: boolean;
	stock_left: number | null;
	last_synced_at: string;
};

export type WaitlistStatus = "subscribed" | "converted" | "unsubscribed";

export type WaitlistEntry = {
	id: string;
	company_id: string;
	product_id: string;
	plan_id: string;
	experience_id: string;
	whop_user_id: string;
	username: string | null;
	email: string | null;
	status: WaitlistStatus;
	created_at: string;
	last_notified_at: string | null;
	converted_at: string | null;
	restock_event_id: string | null;
};

export type RestockEvent = {
	id: string;
	company_id: string;
	product_id: string;
	plan_id: string | null;
	source: "manual" | "sync" | "webhook" | "cron";
	notified_count: number;
	created_at: string;
};

export type Conversion = {
	id: string;
	company_id: string;
	product_id: string;
	plan_id: string | null;
	whop_user_id: string;
	payment_id: string;
	waitlist_entry_id: string | null;
	amount_usd: number | null;
	currency: string | null;
	refunded_at: string | null;
	created_at: string;
};

export type WebhookEvent = {
	id: string;
	type: string;
	payload: unknown;
	received_at: string;
	processed_at: string | null;
	attempts: number;
	last_error: string | null;
};
