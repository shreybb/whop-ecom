"use client";

import { Button } from "@whop/react/components";
import { useState, useTransition } from "react";
import { notifyWaitlistAction } from "@/app/actions";

type Row = {
	productId: string;
	title: string;
	price: number | null;
	currency: string | null;
	inStock: boolean;
	stockLeft: number | null;
	waiting: number;
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

export function ProductTable({
	companyId,
	rows,
}: {
	companyId: string;
	rows: Row[];
}) {
	if (rows.length === 0) {
		return (
			<p className="rounded-xl border border-gray-a4 bg-gray-a2 p-6 text-center text-3 text-gray-10">
				No products found. Publish a product with at least one priced plan
				on your whop and hit “Sync stock”.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-gray-a4 bg-gray-a2">
			<table className="w-full text-left text-3">
				<thead>
					<tr className="border-b border-gray-a4 text-2 text-gray-10">
						<th className="px-4 py-3 font-medium">Product</th>
						<th className="px-4 py-3 font-medium">Price</th>
						<th className="px-4 py-3 font-medium">Stock</th>
						<th className="px-4 py-3 font-medium">Waiting</th>
						<th className="px-4 py-3 font-medium">Alerted</th>
						<th className="px-4 py-3 font-medium">Recovered</th>
						<th className="px-4 py-3" />
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-a3">
					{rows.map((row) => (
						<ProductRow
							key={row.productId}
							companyId={companyId}
							row={row}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

function ProductRow({ companyId, row }: { companyId: string; row: Row }) {
	const [isPending, startTransition] = useTransition();
	const [justNotified, setJustNotified] = useState<number | null>(null);

	return (
		<tr>
			<td className="px-4 py-3 font-medium">{row.title}</td>
			<td className="px-4 py-3 text-gray-10">
				{formatPrice(row.price, row.currency)}
			</td>
			<td className="px-4 py-3">
				{row.inStock ? (
					<span className="text-green-11">
						{row.stockLeft == null ? "In stock" : `${row.stockLeft} left`}
					</span>
				) : (
					<span className="font-semibold text-red-11">Sold out</span>
				)}
			</td>
			<td className="px-4 py-3">{row.waiting}</td>
			<td className="px-4 py-3 text-gray-10">{row.notified}</td>
			<td className="px-4 py-3 text-green-11">
				${row.recoveredUsd.toFixed(2)}
			</td>
			<td className="px-4 py-3 text-right">
				{justNotified != null ? (
					<span className="text-2 text-green-11">
						Notified {justNotified} ✓
					</span>
				) : (
					<Button
						variant="classic"
						size="1"
						disabled={row.waiting === 0}
						loading={isPending}
						onClick={() =>
							startTransition(async () => {
								const { notified } = await notifyWaitlistAction(
									companyId,
									row.productId,
								);
								setJustNotified(notified);
							})
						}
					>
						Notify waitlist{row.waiting > 0 ? ` (${row.waiting})` : ""}
					</Button>
				)}
			</td>
		</tr>
	);
}
