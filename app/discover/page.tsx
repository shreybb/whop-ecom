// App Store listing page ("discover view"). Static marketing copy —
// this is what merchants see before installing.
export default function DiscoverPage() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-white">
			<div className="mx-auto max-w-4xl px-4 py-16">
				<div className="mb-14 text-center">
					<p aria-hidden className="mb-4 text-6xl">
						📦
					</p>
					<h1 className="mb-4 text-5xl font-bold">Restocked</h1>
					<p className="mx-auto max-w-2xl text-xl text-slate-300">
						Back-in-stock alerts &amp; drop waitlists. Turn every sellout
						into your next revenue spike.
					</p>
				</div>

				<div className="mb-12 rounded-xl border border-slate-700 bg-slate-800/60 p-8 text-center">
					<p className="mx-auto mb-2 max-w-2xl text-lg text-slate-200">
						Drops sell out — that's the point. But every sold-out product
						page is silently turning away buyers. Restocked captures that
						demand with one-tap waitlists and pings everyone the moment
						you restock.
					</p>
					<p className="text-sm text-slate-400">
						Back-in-stock alerts are the highest-converting notification
						in e-commerce: ~60% open rates and up to 22% conversion.
					</p>
				</div>

				<div className="grid gap-6 md:grid-cols-3">
					<div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6">
						<h3 className="mb-2 font-semibold">One-tap waitlists</h3>
						<p className="text-sm text-slate-300">
							Customers hit "Notify me" on any sold-out product. No
							emails to type — it's tied to their Whop account.
						</p>
					</div>
					<div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6">
						<h3 className="mb-2 font-semibold">Automatic restock alerts</h3>
						<p className="text-sm text-slate-300">
							Restock in your Whop dashboard and every waiting customer
							gets a push notification — or fire it manually with one
							click.
						</p>
					</div>
					<div className="rounded-xl border border-slate-700 bg-slate-800/60 p-6">
						<h3 className="mb-2 font-semibold">Recovered revenue</h3>
						<p className="text-sm text-slate-300">
							Purchases from alerted customers are attributed
							automatically, so you see exactly how much money the
							waitlist brought back.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
