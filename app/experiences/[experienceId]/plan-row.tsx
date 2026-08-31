"use client";

import { Button } from "@whop/react/components";
import { useState, useTransition } from "react";
import { joinWaitlistAction, leaveWaitlistAction } from "@/app/actions";
import {
	resolvePlanWaitlistCta,
	type PlanUiStatus,
} from "@/lib/waitlist-ui";
import type { TrackedPlan } from "@/lib/db/types";

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

function StockBadge({ plan }: { plan: TrackedPlan }) {
	if (!plan.in_stock) {
		return (
			<span className="rounded-full bg-red-a3 px-2.5 py-0.5 text-1 font-semibold text-red-11">
				Sold out
			</span>
		);
	}
	// Scarcity only when stock is low; never expose unlimited or exact high counts.
	if (plan.stock_left != null && plan.stock_left <= 10) {
		return (
			<span className="rounded-full bg-amber-a3 px-2.5 py-0.5 text-1 font-semibold text-amber-11">
				Only {plan.stock_left} left
			</span>
		);
	}
	return (
		<span className="rounded-full bg-green-a3 px-2.5 py-0.5 text-1 font-semibold text-green-11">
			In stock
		</span>
	);
}

export function PlanRow({
	experienceId,
	plan,
	showPlanTitle,
	waitingCount,
	waitlistStatus: initialStatus,
}: {
	experienceId: string;
	plan: TrackedPlan;
	showPlanTitle: boolean;
	waitingCount: number;
	waitlistStatus: PlanUiStatus;
}) {
	const [status, setStatus] = useState<PlanUiStatus>(initialStatus);
	const [message, setMessage] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const wasSubscribedInitially = initialStatus === "subscribed";
	const displayedWaiting =
		waitingCount +
		(status === "subscribed" ? 1 : 0) -
		(wasSubscribedInitially ? 1 : 0);

	const joinWaitlist = () => {
		setMessage(null);
		startTransition(async () => {
			const result = await joinWaitlistAction(experienceId, plan.plan_id);
			if (result.ok) {
				setStatus("subscribed");
				setMessage(
					"You're on the list — we'll notify you in Whop when this restocks.",
				);
			} else {
				setMessage(result.error);
			}
		});
	};

	const leaveWaitlist = () => {
		setMessage(null);
		startTransition(async () => {
			const result = await leaveWaitlistAction(experienceId, plan.plan_id);
			if (result.ok) {
				setStatus("none");
				setMessage(null);
			} else {
				setMessage(result.error);
			}
		});
	};

	const price = formatPrice(plan.price, plan.currency);
	const cta = resolvePlanWaitlistCta(plan, status);

	return (
		<li className="flex items-center gap-4 px-4 py-3">
			{plan.image_url && showPlanTitle ? (
				<img
					src={plan.image_url}
					alt=""
					className="size-10 shrink-0 rounded-lg object-cover"
				/>
			) : null}

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					{showPlanTitle && plan.plan_title && (
						<span className="truncate text-3 font-semibold">
							{plan.plan_title}
						</span>
					)}
					<StockBadge plan={plan} />
				</div>
				<div className="flex flex-col gap-0.5 text-2 text-gray-10">
					<div className="flex items-center gap-3">
						{price && <span>{price}</span>}
						{!plan.in_stock && displayedWaiting > 0 && (
							<span>
								{displayedWaiting}{" "}
								{displayedWaiting === 1 ? "person" : "people"} waiting
							</span>
						)}
					</div>
					{message && (
						<span
							className={
								message.includes("on the list")
									? "text-green-11"
									: "text-red-11"
							}
						>
							{message}
						</span>
					)}
				</div>
			</div>

			<div className="flex shrink-0 flex-col items-end gap-1">
				{cta === "buy" ? (
					<a href={plan.purchase_url!}>
						<Button variant="classic" size="2">
							Buy
						</Button>
					</a>
				) : cta === "you_got_it" ? (
					<Button variant="soft" size="2" disabled>
						You got it ✓
					</Button>
				) : cta === "on_waitlist" ? (
					<>
						<Button variant="soft" size="2" disabled>
							On waitlist
						</Button>
						<button
							type="button"
							disabled={isPending}
							onClick={leaveWaitlist}
							className="text-2 text-gray-10 underline-offset-2 hover:text-gray-12 hover:underline disabled:opacity-50"
						>
							Leave waitlist
						</button>
					</>
				) : (
					<Button
						variant="classic"
						size="2"
						loading={isPending}
						onClick={joinWaitlist}
					>
						Notify me
					</Button>
				)}
			</div>
		</li>
	);
}
