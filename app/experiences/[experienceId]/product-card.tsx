"use client";

import { Button } from "@whop/react/components";
import { useState, useTransition } from "react";
import { joinWaitlistAction, leaveWaitlistAction } from "@/app/actions";

type ProductInfo = {
	productId: string;
	title: string;
	price: number | null;
	currency: string | null;
	purchaseUrl: string | null;
	inStock: boolean;
	stockLeft: number | null;
};

function formatPrice(price: number | null, currency: string | null) {
	if (price == null) return null;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: (currency ?? "usd").toUpperCase(),
		}).format(price);
	} catch {
		return `$${price.toFixed(2)}`;
	}
}

function StockBadge({ product }: { product: ProductInfo }) {
	if (!product.inStock) {
		return (
			<span className="rounded-full bg-red-a3 px-2.5 py-0.5 text-1 font-semibold text-red-11">
				Sold out
			</span>
		);
	}
	if (product.stockLeft != null && product.stockLeft <= 10) {
		return (
			<span className="rounded-full bg-amber-a3 px-2.5 py-0.5 text-1 font-semibold text-amber-11">
				Only {product.stockLeft} left
			</span>
		);
	}
	return (
		<span className="rounded-full bg-green-a3 px-2.5 py-0.5 text-1 font-semibold text-green-11">
			In stock
		</span>
	);
}

export function ProductCard({
	experienceId,
	product,
	waitingCount,
	isWaiting: initialWaiting,
}: {
	experienceId: string;
	product: ProductInfo;
	waitingCount: number;
	isWaiting: boolean;
}) {
	const [isWaiting, setIsWaiting] = useState(initialWaiting);
	const [isPending, startTransition] = useTransition();

	// Server count includes my entry if I was already waiting at render time;
	// adjust for client-side joins/leaves since then.
	const displayedWaiting =
		waitingCount + (isWaiting ? 1 : 0) - (initialWaiting ? 1 : 0);

	const toggleWaitlist = () => {
		startTransition(async () => {
			if (isWaiting) {
				await leaveWaitlistAction(experienceId, product.productId);
				setIsWaiting(false);
			} else {
				await joinWaitlistAction(experienceId, product.productId);
				setIsWaiting(true);
			}
		});
	};

	const price = formatPrice(product.price, product.currency);

	return (
		<li className="flex items-center gap-4 rounded-xl border border-gray-a4 bg-gray-a2 p-4">
			<div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-gray-a4 text-5 font-bold">
				{product.title.slice(0, 1).toUpperCase()}
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="truncate text-4 font-semibold">
						{product.title}
					</span>
					<StockBadge product={product} />
				</div>
				<div className="flex items-center gap-3 text-2 text-gray-10">
					{price && <span>{price}</span>}
					{!product.inStock && displayedWaiting > 0 && (
						<span>
							{displayedWaiting}{" "}
							{displayedWaiting === 1 ? "person" : "people"} waiting
						</span>
					)}
				</div>
			</div>

			{product.inStock ? (
				product.purchaseUrl && (
					<a
						href={product.purchaseUrl}
						target="_blank"
						rel="noopener noreferrer"
					>
						<Button variant="classic" size="2">
							Buy
						</Button>
					</a>
				)
			) : (
				<Button
					variant={isWaiting ? "soft" : "classic"}
					size="2"
					loading={isPending}
					onClick={toggleWaitlist}
				>
					{isWaiting ? "On the list ✓" : "Notify me"}
				</Button>
			)}
		</li>
	);
}
