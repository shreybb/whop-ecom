export function AlertTypesCallout() {
	return (
		<div className="rounded-xl border border-gray-a4 bg-gray-a2 p-4 text-2 text-gray-10">
			<p className="font-medium text-gray-12">How waitlist alerts work</p>
			<ul className="mt-2 space-y-2">
				<li>
					<span className="font-medium text-gray-12">Restock alert</span> — when
					stock is back (automatic on restock, or manual while in stock). Fans get
					a back-in-stock message with a checkout link.
				</li>
				<li>
					<span className="font-medium text-gray-12">Send update</span> — while
					still sold out. Pings everyone on the waitlist with a status update
					(ETA, delay, hype). No checkout link — item is not buyable yet.
				</li>
			</ul>
		</div>
	);
}
