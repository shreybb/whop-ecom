import { headers } from "next/headers";
import { getCompany, upsertCompany } from "@/lib/db/companies";
import {
	getDashboardStats,
	getPerProductStats,
	getRecentActivity,
} from "@/lib/db/stats";
import { syncCompanyStock } from "@/lib/stock";
import { getWhopSdk } from "@/lib/whop-sdk";
import { AutoNotifyToggle, SyncButton } from "./controls";
import { ProductTable } from "./product-table";

// Merchant view. Tenant isolation: the companyId path param is only
// honored after checkAccess confirms the verified user is an admin of
// that company — a member (or stranger) hitting this URL gets nothing.
export default async function DashboardPage({
	params,
}: {
	params: Promise<{ companyId: string }>;
}) {
	const { companyId } = await params;
	const whopsdk = getWhopSdk();
	const { userId } = await whopsdk.verifyUserToken(await headers());
	const access = await whopsdk.users.checkAccess(companyId, { id: userId });

	if (!access.has_access || access.access_level !== "admin") {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<p className="text-4 text-gray-10">
					Only team members of this business can view the Restocked
					dashboard.
				</p>
			</main>
		);
	}

	await upsertCompany(companyId);
	const [{ products }, stats, productStats, activity, company] =
		await Promise.all([
			syncCompanyStock(companyId, "sync"),
			getDashboardStats(companyId),
			getPerProductStats(companyId),
			getRecentActivity(companyId),
			getCompany(companyId),
		]);

	const conversionRate =
		stats.notified > 0
			? Math.round((stats.converted / stats.notified) * 100)
			: null;
	const productTitles = new Map(
		products.map((p) => [p.product_id, p.title]),
	);

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:p-8">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-7 font-bold">Restocked</h1>
					<p className="text-3 text-gray-10">
						Back-in-stock alerts &amp; drop waitlists
					</p>
				</div>
				<div className="flex items-center gap-3">
					<AutoNotifyToggle
						companyId={companyId}
						enabled={company?.auto_notify ?? true}
					/>
					<SyncButton companyId={companyId} />
				</div>
			</header>

			<section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard label="Waiting now" value={String(stats.waiting)} />
				<StatCard label="Alerts sent" value={String(stats.notified)} />
				<StatCard
					label="Recovered revenue"
					value={`$${stats.recoveredUsd.toFixed(2)}`}
					accent
				/>
				<StatCard
					label="Alert conversion"
					value={conversionRate == null ? "—" : `${conversionRate}%`}
				/>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-5 font-semibold">Products</h2>
				<ProductTable
					companyId={companyId}
					rows={products.map((p) => {
						const s = productStats.get(p.product_id);
						return {
							productId: p.product_id,
							title: p.title,
							price: p.price,
							currency: p.currency,
							inStock: p.in_stock,
							stockLeft: p.stock_left,
							waiting: s?.waiting ?? 0,
							notified: s?.notified ?? 0,
							recoveredUsd: s?.recoveredUsd ?? 0,
						};
					})}
				/>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-5 font-semibold">Recent activity</h2>
				{activity.length === 0 ? (
					<p className="rounded-xl border border-gray-a4 bg-gray-a2 p-6 text-center text-3 text-gray-10">
						No activity yet. When customers join waitlists, restocks are
						detected, or alerts convert into sales, it shows up here.
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-gray-a3 rounded-xl border border-gray-a4 bg-gray-a2">
						{activity.map((item) => (
							<li
								key={`${item.kind}-${item.at}-${item.productId}`}
								className="flex items-center gap-3 px-4 py-3"
							>
								<span aria-hidden className="text-3">
									{item.kind === "join" && "👋"}
									{item.kind === "restock" && "📦"}
									{item.kind === "conversion" && "💸"}
								</span>
								<span className="min-w-0 flex-1 truncate text-3">
									<span className="font-medium">
										{productTitles.get(item.productId) ?? item.productId}
									</span>{" "}
									<span className="text-gray-10">— {item.detail}</span>
								</span>
								<time className="shrink-0 text-2 text-gray-9">
									{new Date(item.at).toLocaleString("en-US", {
										month: "short",
										day: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</time>
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}

function StatCard({
	label,
	value,
	accent = false,
}: {
	label: string;
	value: string;
	accent?: boolean;
}) {
	return (
		<div
			className={`flex flex-col gap-1 rounded-xl border p-4 ${
				accent
					? "border-green-a5 bg-green-a2"
					: "border-gray-a4 bg-gray-a2"
			}`}
		>
			<span className="text-2 text-gray-10">{label}</span>
			<span
				className={`text-6 font-bold ${accent ? "text-green-11" : ""}`}
			>
				{value}
			</span>
		</div>
	);
}
