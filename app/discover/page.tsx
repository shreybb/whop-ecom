// App Store listing page ("discover view"). Static marketing copy —
// this is what merchants see before installing.
export default function DiscoverPage() {
	return (
		<main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-8 sm:py-16">
			<header className="flex flex-col gap-2 text-center">
				<h1 className="text-8 font-bold">Restocked</h1>
				<p className="mx-auto max-w-2xl text-4 text-gray-10">
					Back-in-stock alerts &amp; drop waitlists. Turn every sellout
					into your next revenue spike.
				</p>
			</header>

			<section className="rounded-xl border border-gray-a4 bg-gray-a2 p-6 text-center sm:p-8">
				<p className="mx-auto mb-2 max-w-2xl text-4 text-gray-11">
					Drops sell out — that&apos;s the point. But every sold-out product
					page is silently turning away buyers. Restocked captures that
					demand with one-tap waitlists and pings everyone the moment
					you restock.
				</p>
				<p className="text-3 text-gray-9">
					Back-in-stock alerts are the highest-converting notification
					in e-commerce: ~60% open rates and up to 22% conversion.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-5">
					<h2 className="mb-2 text-4 font-semibold">One-tap waitlists</h2>
					<p className="text-3 text-gray-10">
						Customers hit &quot;Notify me&quot; on any sold-out product. No
						emails to type — it&apos;s tied to their Whop account.
					</p>
				</div>
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-5">
					<h2 className="mb-2 text-4 font-semibold">
						Automatic restock alerts
					</h2>
					<p className="text-3 text-gray-10">
						Restock in your Whop dashboard and every waiting customer
						gets a push notification — or fire it manually with one
						click.
					</p>
				</div>
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-5">
					<h2 className="mb-2 text-4 font-semibold">Recovered revenue</h2>
					<p className="text-3 text-gray-10">
						Purchases from alerted customers are attributed
						automatically, so you see exactly how much money the
						waitlist brought back.
					</p>
				</div>
			</section>
		</main>
	);
}
