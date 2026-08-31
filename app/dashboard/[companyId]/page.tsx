import { headers } from "next/headers";
import { resolveDropsShareUrl } from "@/app/actions-merchant";
import { getCompany, upsertCompany } from "@/lib/db/companies";
import {
	getDashboardStats,
	getPerPlanStats,
	getRecentActivity,
} from "@/lib/db/stats";
import { syncCompanyStock } from "@/lib/stock";
import { getWhopSdk } from "@/lib/whop-sdk";
import { ActivityTime } from "./activity-time";
import { AlertTypesCallout } from "./alert-types-callout";
import { AutoNotifyToggle, SyncButton } from "./controls";
import { CopyDropsLink } from "./copy-drops-link";
import { ExportWaitlistButton } from "./export-waitlist-button";
import { NotifyTemplatesForm } from "./notify-templates";
import { OnboardingChecklist } from "./onboarding-checklist";
import { PlanTable } from "./plan-table";

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
	const [{ plans }, stats, planStats, activity, company, dropsLink] =
		await Promise.all([
			syncCompanyStock(companyId, "sync"),
			getDashboardStats(companyId),
			getPerPlanStats(companyId),
			getRecentActivity(companyId),
			getCompany(companyId),
			resolveDropsShareUrl(companyId).catch(() => null),
		]);

	const conversionRate =
		stats.notified > 0
			? Math.round(stats.conversionRate * 100)
			: null;

	const planTitles = new Map(
		plans.map((p) => [
			p.plan_id,
			p.plan_title ? `${p.title} — ${p.plan_title}` : p.title,
		]),
	);
	const productTitles = new Map(plans.map((p) => [p.product_id, p.title]));

	const showOnboarding =
		plans.length === 0 || (stats.waiting === 0 && stats.notified === 0);

	const tableRows = plans.map((plan) => {
		const s = planStats.get(plan.plan_id);
		return {
			planId: plan.plan_id,
			productId: plan.product_id,
			productTitle: plan.title,
			planTitle: plan.plan_title,
			imageUrl: plan.image_url,
			price: plan.price,
			currency: plan.currency,
			inStock: plan.in_stock,
			stockLeft: plan.stock_left,
			unlimited: plan.unlimited,
			waiting: s?.waiting ?? 0,
			pendingNotify: s?.pendingNotify ?? 0,
			notified: s?.notified ?? 0,
			recoveredUsd: s?.recoveredUsd ?? 0,
		};
	});

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:p-8">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-7 font-bold">Restocked</h1>
					<p className="text-3 text-gray-10">
						Back-in-stock alerts &amp; drop waitlists — per plan
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

			{showOnboarding && (
				<OnboardingChecklist dropsShareUrl={dropsLink?.url ?? null} />
			)}

			<section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard label="Waiting now" value={String(stats.waiting)} />
				<StatCard label="Alerts sent (7d)" value={String(stats.notified)} />
				<StatCard
					label="Recovered revenue"
					value={`$${stats.recoveredUsd.toFixed(2)}`}
					accent
				/>
				<StatCard
					label="Alert conversion (7d)"
					value={conversionRate == null ? "—" : `${conversionRate}%`}
				/>
			</section>

			<NotifyTemplatesForm
				companyId={companyId}
				initialTitle={company?.notify_title ?? null}
				initialBody={company?.notify_body ?? null}
			/>

			<section className="flex flex-col gap-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<h2 className="text-5 font-semibold shrink-0">Plans</h2>
					<div className="flex min-w-0 flex-col gap-3 lg:items-end">
						<ExportWaitlistButton companyId={companyId} waitingCount={stats.waiting} />
						{dropsLink ? (
							<div className="flex min-w-0 flex-col gap-1 lg:items-end">
								<CopyDropsLink
									url={dropsLink.url}
									label="Copy Drops link"
									size="2"
								/>
								<p className="text-1 text-gray-9 text-pretty lg:text-right">
									Share on Discord or IG when something sells out — fans land on
									your {dropsLink.experienceName} tab.
								</p>
							</div>
						) : null}
					</div>
				</div>
				<AlertTypesCallout />
				{tableRows.length === 0 ? (
					<p className="rounded-xl border border-gray-a4 bg-gray-a2 p-6 text-center text-3 text-gray-10">
						No plans found. Publish a product with at least one priced plan
						on your whop and hit &ldquo;Sync stock&rdquo;.
					</p>
				) : (
					<PlanTable companyId={companyId} rows={tableRows} />
				)}
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
								key={`${item.kind}-${item.at}-${item.productId}-${item.planId ?? ""}`}
								className="flex items-center gap-3 px-4 py-3"
							>
								<span aria-hidden className="text-3">
									{item.kind === "join" && "👋"}
									{item.kind === "restock" && "📦"}
									{item.kind === "conversion" && "💸"}
								</span>
								<span className="min-w-0 flex-1 truncate text-3">
									<span className="font-medium">
										{item.planId
											? (planTitles.get(item.planId) ??
												productTitles.get(item.productId) ??
												item.productId)
											: (productTitles.get(item.productId) ?? item.productId)}
									</span>{" "}
									<span className="text-gray-10">— {item.detail}</span>
								</span>
								<ActivityTime at={item.at} />
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
