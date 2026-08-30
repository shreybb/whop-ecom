// Row types for the tenant-scoped data layer. The tenant is always a Whop
// company (biz_*); every table carries company_id.

export type CompanyRow = {
	id: string;
	title: string | null;
	auto_notify: boolean;
	created_at: string;
};

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

export type WaitlistEntry = {
	id: string;
	company_id: string;
	product_id: string;
	experience_id: string;
	whop_user_id: string;
	username: string | null;
	status: "waiting" | "notified" | "converted";
	created_at: string;
	notified_at: string | null;
	converted_at: string | null;
	restock_event_id: string | null;
};

export type RestockEvent = {
	id: string;
	company_id: string;
	product_id: string;
	source: "manual" | "sync" | "webhook" | "cron";
	notified_count: number;
	created_at: string;
};

export type Conversion = {
	id: string;
	company_id: string;
	product_id: string;
	whop_user_id: string;
	payment_id: string;
	waitlist_entry_id: string | null;
	amount_usd: number | null;
	currency: string | null;
	created_at: string;
};
