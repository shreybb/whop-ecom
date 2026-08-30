export function OnboardingChecklist() {
	const steps = [
		{
			title: "Attach Restocked to your products",
			detail:
				"Add this app as an experience on your whop — include a free or public product if you want non-members to join waitlists.",
		},
		{
			title: "Cap stock on a plan",
			detail:
				"In Whop, set a finite stock limit on at least one plan (size, color, tier, etc.). Restocked tracks each plan separately.",
		},
		{
			title: "Sell out, then restock",
			detail:
				"Let a plan hit zero, have someone join the waitlist on the Drops tab, then add stock back. Auto-notify will blast everyone waiting on that plan.",
		},
	];

	return (
		<section className="flex flex-col gap-3 rounded-xl border border-blue-a5 bg-blue-a2 p-5">
			<div>
				<h2 className="text-5 font-semibold text-blue-12">
					Get your first waitlist
				</h2>
				<p className="mt-1 text-3 text-blue-11">
					Whop apps can&apos;t add a button inside native checkout — your Drops
					tab is the recapture surface. Share it with your community when
					something sells out.
				</p>
			</div>
			<ol className="flex flex-col gap-3">
				{steps.map((step, i) => (
					<li key={step.title} className="flex gap-3">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-a4 text-2 font-bold text-blue-12">
							{i + 1}
						</span>
						<div>
							<p className="text-3 font-medium">{step.title}</p>
							<p className="text-2 text-blue-11">{step.detail}</p>
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}
