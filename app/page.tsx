// Root page: a Whop app renders inside whop.com iframes at
// /experiences/[experienceId] (customers) and /dashboard/[companyId]
// (merchants). Hitting the bare deployment URL lands here.
export default function Page() {
	return (
		<main className="flex min-h-screen items-center justify-center px-6 py-12">
			<div className="mx-auto flex max-w-xl flex-col gap-4 rounded-xl border border-gray-a4 bg-gray-a2 p-10 text-center">
				<h1 className="text-8 font-bold text-gray-12">Restocked</h1>
				<p className="text-4 text-gray-10">
					Back-in-stock alerts &amp; drop waitlists for Whop businesses.
					Sell out by design, never lose the demand.
				</p>
				<p className="text-3 text-gray-9">
					This app runs inside Whop — install it on your business to see
					the merchant dashboard and give your customers a Drops tab.
				</p>
			</div>
		</main>
	);
}
