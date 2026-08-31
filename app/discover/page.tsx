// App Store listing page ("discover view"). Static marketing copy —
// this is what merchants see before installing.
export default function DiscoverPage() {
	return (
		<main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-8 sm:py-16">
			<header className="flex flex-col gap-3 text-center">
				<h1 className="text-8 font-bold">Restocked</h1>
				<p className="mx-auto max-w-2xl text-4 text-gray-10">
					Back-in-stock alerts &amp; drop waitlists for Whop merchants who sell
					out on purpose.
				</p>
				<p className="mx-auto max-w-xl text-3 text-gray-9">
					Built for limited-stock drops, capped plans, and hype sellouts — not
					evergreen catalogs.
				</p>
			</header>

			<section className="rounded-xl border border-gray-a4 bg-gray-a2 p-6 sm:p-8">
				<h2 className="mb-4 text-center text-5 font-semibold">
					The three-step loop
				</h2>
				<ol className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-3">
					<li className="flex flex-col gap-1 text-center">
						<span className="text-6" aria-hidden>
							1
						</span>
						<p className="text-3 font-medium">Sell out</p>
						<p className="text-2 text-gray-10">
							Cap stock on a plan. Fans hit Notify me on your Drops tab.
						</p>
					</li>
					<li className="flex flex-col gap-1 text-center">
						<span className="text-6" aria-hidden>
							2
						</span>
						<p className="text-3 font-medium">Restock</p>
						<p className="text-2 text-gray-10">
							Add inventory in Whop. Everyone waiting gets a push alert.
						</p>
					</li>
					<li className="flex flex-col gap-1 text-center">
						<span className="text-6" aria-hidden>
							3
						</span>
						<p className="text-3 font-medium">Recover revenue</p>
						<p className="text-2 text-gray-10">
							Purchases from alerted fans are attributed — you see dollars
							brought back.
						</p>
					</li>
				</ol>
			</section>

			<section className="rounded-xl border border-green-a5 bg-green-a2 p-6 text-center sm:p-8">
				<p className="text-4 font-semibold text-green-12">
					Recovered revenue, not vanity metrics
				</p>
				<p className="mx-auto mt-2 max-w-2xl text-3 text-green-11">
					Your dashboard shows waitlist size, alerts sent, and real dollars
					attributed to back-in-stock notifications — so you know the waitlist
					paid off.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-5">
					<h2 className="mb-2 text-4 font-semibold">One-tap waitlists</h2>
					<p className="text-3 text-gray-10">
						Customers hit &quot;Notify me&quot; on sold-out plans in your Drops
						experience. No email forms — tied to their Whop account.
					</p>
				</div>
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-5">
					<h2 className="mb-2 text-4 font-semibold">
						Automatic restock alerts
					</h2>
					<p className="text-3 text-gray-10">
						Restock in Whop and every subscriber on that plan gets a push — or
						fire it manually with one click.
					</p>
				</div>
				<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-5">
					<h2 className="mb-2 text-4 font-semibold">Shareable Drops link</h2>
					<p className="text-3 text-gray-10">
						When checkout is sold out, copy your Drops URL from the dashboard
						and drop it in Discord or IG — your recapture surface lives outside
						native checkout.
					</p>
				</div>
			</section>
		</main>
	);
}
