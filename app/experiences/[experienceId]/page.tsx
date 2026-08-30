import { headers } from "next/headers";
import { upsertCompany } from "@/lib/db/companies";
import type { TrackedPlan } from "@/lib/db/types";
import {
	getUserWaitlistStatusesByPlan,
	getWaitingCountsByPlan,
} from "@/lib/db/waitlist";
import { syncCompanyStock } from "@/lib/stock";
import { getWhopSdk } from "@/lib/whop-sdk";
import { ProductGroup } from "./product-group";

// Customer view: every drop from this business with live stock state.
// In-stock plans link to checkout; sold-out plans offer the waitlist.
export default async function ExperiencePage({
	params,
}: {
	params: Promise<{ experienceId: string }>;
}) {
	const { experienceId } = await params;
	const whopsdk = getWhopSdk();
	const { userId } = await whopsdk.verifyUserToken(await headers());

	const [experience, access] = await Promise.all([
		whopsdk.experiences.retrieve(experienceId),
		whopsdk.users.checkAccess(experienceId, { id: userId }),
	]);
	if (!access.has_access) {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<p className="text-4 text-gray-10">
					You need access to this whop to see its drops.
				</p>
			</main>
		);
	}

	const companyId = experience.company.id;
	await upsertCompany(companyId, experience.company.title);

	// Lazy sync: page views keep stock state fresh (throttled to 1/min),
	// which doubles as restock detection without waiting for webhooks.
	const { plans } = await syncCompanyStock(companyId, "sync");
	const [waitingCounts, waitlistStatuses] = await Promise.all([
		getWaitingCountsByPlan(companyId),
		getUserWaitlistStatusesByPlan(companyId, userId),
	]);

	const soldOutPlanCount = plans.filter((p) => !p.in_stock).length;
	const groups = groupPlansByProduct(plans);

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
			<header className="flex flex-col gap-2">
				<h1 className="text-7 font-bold">
					{experience.company.title} Drops
				</h1>
				<p className="text-3 text-gray-10">
					{soldOutPlanCount > 0
						? `${soldOutPlanCount} item${soldOutPlanCount === 1 ? "" : "s"} sold out — join the waitlist and we'll ping you when it's back.`
						: "Everything is in stock right now. When something sells out, come back here to get notified."}
				</p>
			</header>

			{groups.length === 0 ? (
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-8 text-center">
					<p className="text-4 font-medium">No products yet</p>
					<p className="mt-1 text-3 text-gray-10">
						When this business publishes products, they will show up here.
					</p>
				</div>
			) : (
				<ul className="flex flex-col gap-4">
					{groups.map((group) => (
						<ProductGroup
							key={group.productId}
							experienceId={experienceId}
							group={group}
							waitingCounts={Object.fromEntries(waitingCounts)}
							waitlistStatuses={Object.fromEntries(waitlistStatuses)}
						/>
					))}
				</ul>
			)}

			<footer className="pt-2 text-center text-2 text-gray-9">
				Powered by Restocked — back-in-stock alerts for Whop
			</footer>
		</main>
	);
}

type ProductGroupData = {
	productId: string;
	title: string;
	imageUrl: string | null;
	plans: TrackedPlan[];
};

function groupPlansByProduct(plans: TrackedPlan[]): ProductGroupData[] {
	const byProduct = new Map<string, ProductGroupData>();
	for (const plan of plans) {
		let group = byProduct.get(plan.product_id);
		if (!group) {
			group = {
				productId: plan.product_id,
				title: plan.title,
				imageUrl: plan.image_url,
				plans: [],
			};
			byProduct.set(plan.product_id, group);
		}
		group.plans.push(plan);
	}
	for (const group of byProduct.values()) {
		group.plans.sort((a, b) => {
			const aTitle = a.plan_title ?? "";
			const bTitle = b.plan_title ?? "";
			return aTitle.localeCompare(bTitle);
		});
	}
	return [...byProduct.values()].sort((a, b) =>
		a.title.localeCompare(b.title),
	);
}
