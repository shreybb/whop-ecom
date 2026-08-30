import { headers } from "next/headers";
import { upsertCompany } from "@/lib/db/companies";
import { getUserWaitingProductIds, getWaitingCounts } from "@/lib/db/waitlist";
import { syncCompanyStock } from "@/lib/stock";
import { getWhopSdk } from "@/lib/whop-sdk";
import { ProductCard } from "./product-card";

// Customer view: every drop from this business with live stock state.
// In-stock products link to checkout; sold-out products offer the waitlist.
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
	const { products } = await syncCompanyStock(companyId, "sync");
	const [waitingCounts, myWaitingIds] = await Promise.all([
		getWaitingCounts(companyId),
		getUserWaitingProductIds(companyId, userId),
	]);

	const soldOutCount = products.filter((p) => !p.in_stock).length;

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
			<header className="flex flex-col gap-1">
				<h1 className="text-7 font-bold">
					{experience.company.title} Drops
				</h1>
				<p className="text-3 text-gray-10">
					{soldOutCount > 0
						? `${soldOutCount} drop${soldOutCount === 1 ? "" : "s"} sold out — join a waitlist and we'll ping you the second it's restocked.`
						: "Everything is in stock right now. Join a waitlist any time something sells out."}
				</p>
			</header>

			{products.length === 0 ? (
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-8 text-center">
					<p className="text-4 font-medium">No products yet</p>
					<p className="mt-1 text-3 text-gray-10">
						When this business publishes products, they will show up here
						with live stock tracking.
					</p>
				</div>
			) : (
				<ul className="flex flex-col gap-3">
					{products.map((product) => (
						<ProductCard
							key={product.product_id}
							experienceId={experienceId}
							product={{
								productId: product.product_id,
								title: product.title,
								price: product.price,
								currency: product.currency,
								purchaseUrl: product.purchase_url,
								inStock: product.in_stock,
								stockLeft: product.stock_left,
							}}
							waitingCount={waitingCounts.get(product.product_id) ?? 0}
							isWaiting={myWaitingIds.has(product.product_id)}
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
