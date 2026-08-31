"use client";

import type { TrackedPlan } from "@/lib/db/types";
import type { WaitlistStatus } from "@/lib/db/waitlist";
import { toPlanUiStatus } from "@/lib/waitlist-ui";
import { PlanRow } from "./plan-row";

export type ProductGroupData = {
	productId: string;
	title: string;
	imageUrl: string | null;
	plans: TrackedPlan[];
};

export function ProductGroup({
	experienceId,
	group,
	waitingCounts,
	waitlistStatuses,
}: {
	experienceId: string;
	group: ProductGroupData;
	waitingCounts: Record<string, number>;
	waitlistStatuses: Record<string, WaitlistStatus | "none">;
}) {
	const hasMultiplePlans = group.plans.length > 1;

	return (
		<li className="flex flex-col overflow-hidden rounded-xl border border-gray-a4 bg-gray-a2">
			<div className="flex items-center gap-3 border-b border-gray-a3 px-4 py-3">
				{group.imageUrl ? (
					<img
						src={group.imageUrl}
						alt=""
						className="size-12 shrink-0 rounded-lg object-cover"
					/>
				) : (
					<div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-gray-a4 text-5 font-bold">
						{group.title.slice(0, 1).toUpperCase()}
					</div>
				)}
				<h2 className="text-5 font-semibold">{group.title}</h2>
			</div>

			<ul className="divide-y divide-gray-a3">
				{group.plans.map((plan) => (
					<PlanRow
						key={plan.plan_id}
						experienceId={experienceId}
						plan={plan}
						showPlanTitle={hasMultiplePlans}
						waitingCount={waitingCounts[plan.plan_id] ?? 0}
						waitlistStatus={toPlanUiStatus(
							waitlistStatuses[plan.plan_id],
						)}
					/>
				))}
			</ul>
		</li>
	);
}
