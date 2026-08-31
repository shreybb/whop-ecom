"use client";

import { Button } from "@whop/react/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notifyWaitlistAction } from "@/app/actions";

export type PlanRow = {
	planId: string;
	productId: string;
	productTitle: string;
	planTitle: string | null;
	imageUrl: string | null;
	price: number | null;
	currency: string | null;
	inStock: boolean;
	stockLeft: number | null;
	unlimited: boolean;
	waiting: number;
	pendingNotify: number;
	notified: number;
	recoveredUsd: number;
};

function formatPrice(price: number | null, currency: string | null) {
	if (price == null) return "—";
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: (currency ?? "usd").toUpperCase(),
		}).format(price);
	} catch {
		return `$${price.toFixed(2)}`;
	}
}

function formatStockLabel(inStock: boolean, stockLeft: number | null) {
	if (!inStock) return "Sold out (0)";
	if (stockLeft == null) return "Unlimited";
	return `${stockLeft} unit${stockLeft === 1 ? "" : "s"}`;
}

function planLabel(row: PlanRow) {
	return row.planTitle
		? `${row.productTitle} — ${row.planTitle}`
		: row.productTitle;
}

export function PlanTable({
	companyId,
	rows,
}: {
	companyId: string;
	rows: PlanRow[];
}) {
	if (rows.length === 0) {
		return null;
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-gray-a4 bg-gray-a2">
			<table className="w-full text-left text-3">
				<thead>
					<tr className="border-b border-gray-a4 text-2 text-gray-10">
						<th className="px-4 py-3 font-medium">Plan</th>
						<th className="px-4 py-3 font-medium">Price</th>
						<th className="px-4 py-3 font-medium">Stock</th>
						<th className="px-4 py-3 font-medium">On waitlist</th>
						<th className="px-4 py-3 font-medium">Awaiting ping</th>
						<th className="px-4 py-3 font-medium">Alerted (7d)</th>
						<th className="px-4 py-3 font-medium">Recovered</th>
						<th className="w-28 px-4 py-3 font-medium text-right">Action</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-a3">
					{rows.map((row) => (
						<PlanTableRow
							key={row.planId}
							companyId={companyId}
							row={row}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

function PlanTableRow({
	companyId,
	row,
}: {
	companyId: string;
	row: PlanRow;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [feedback, setFeedback] = useState<string | null>(null);

	const stampede =
		!row.unlimited &&
		row.stockLeft != null &&
		row.waiting > row.stockLeft &&
		row.waiting > 0;
	const canNotify = row.pendingNotify > 0;

	return (
		<tr>
			<td className="px-4 py-3">
				<div className="flex items-center gap-3">
					{row.imageUrl ? (
						<img
							src={row.imageUrl}
							alt=""
							className="size-10 shrink-0 rounded-lg object-cover"
						/>
					) : (
						<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-a4 text-2 font-bold">
							{row.productTitle.slice(0, 1).toUpperCase()}
						</div>
					)}
					<div className="min-w-0">
						<div className="font-medium leading-snug">{planLabel(row)}</div>
						{stampede ? (
							<p
								className="mt-1 text-1 leading-snug text-amber-11"
								title={`${row.waiting} on the waitlist but only ${row.stockLeft} in stock`}
							>
								{row.waiting} waiting · {row.stockLeft} in stock — notify pings
								everyone; some may miss out.
							</p>
						) : null}
					</div>
				</div>
			</td>
			<td className="px-4 py-3 text-gray-10">
				{formatPrice(row.price, row.currency)}
			</td>
			<td className="px-4 py-3">
				<span
					className={
						row.inStock ? "text-green-11" : "font-semibold text-red-11"
					}
				>
					{formatStockLabel(row.inStock, row.stockLeft)}
				</span>
			</td>
			<td className="px-4 py-3">{row.waiting}</td>
			<td className="px-4 py-3">{row.pendingNotify}</td>
			<td className="px-4 py-3 text-gray-10">{row.notified}</td>
			<td className="px-4 py-3 text-green-11">
				${row.recoveredUsd.toFixed(2)}
			</td>
			<td className="px-4 py-3 text-right whitespace-nowrap">
				{feedback ? (
					<span
						className={`inline-block max-w-32 text-left text-2 leading-snug ${feedback.startsWith("Notified") || feedback.startsWith("All notified") ? "text-green-11" : "text-red-11"}`}
					>
						{feedback}
					</span>
				) : !canNotify ? (
					<span className="text-2 text-gray-10">
						{row.waiting > 0 ? "All notified ✓" : "—"}
					</span>
				) : (
					<Button
						variant="classic"
						size="1"
						className="whitespace-nowrap"
						loading={isPending}
						title={
							row.inStock
								? stampede
									? `Restock alert — pings all ${row.waiting} waiting; only ${row.stockLeft} in stock, so some may miss out`
									: `Restock alert — notifies ${row.pendingNotify} waiting fan${row.pendingNotify === 1 ? "" : "s"} with a checkout link`
								: `Send update — still sold out; pings ${row.pendingNotify} waiting fan${row.pendingNotify === 1 ? "" : "s"} with a status message (no buy link)`
						}
						onClick={() =>
							startTransition(async () => {
								const result = await notifyWaitlistAction(
									companyId,
									row.planId,
								);
								if (result.ok) {
									const { notified, waiting, stockLeft, pendingNotify } =
										result.data;
									if (notified === 0) {
										setFeedback("All notified ✓");
									} else {
										const stampedeNote =
											stockLeft != null && waiting > stockLeft
												? ` — all ${waiting} pinged, ${stockLeft} in stock`
												: "";
										setFeedback(`Notified ${notified}${stampedeNote} ✓`);
									}
									router.refresh();
								} else {
									setFeedback(result.error);
								}
							})
						}
					>
						{row.inStock
							? `Restock alert (${row.pendingNotify})`
							: `Send update (${row.pendingNotify})`}
					</Button>
				)}
			</td>
		</tr>
	);
}
