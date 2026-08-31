import type { TrackedPlan } from "@/lib/db/types";
import type { WaitlistStatus } from "@/lib/db/waitlist";

/** UI status: subscribed covers both waiting and already-notified (persistent). */
export type PlanUiStatus = "none" | "subscribed" | "converted";

export type PlanWaitlistCta = "buy" | "you_got_it" | "on_waitlist" | "notify_me";

export function toPlanUiStatus(
	status: WaitlistStatus | "none" | undefined,
): PlanUiStatus {
	if (status === "converted") return "converted";
	if (status === "waiting" || status === "notified") return "subscribed";
	return "none";
}

/** Sold-out converted users can re-join; "You got it" only while in stock. */
export function resolvePlanWaitlistCta(
	plan: Pick<TrackedPlan, "in_stock" | "purchase_url">,
	status: PlanUiStatus,
): PlanWaitlistCta {
	if (plan.in_stock) {
		if (status === "converted") return "you_got_it";
		if (plan.purchase_url) return "buy";
		return "notify_me";
	}
	if (status === "subscribed") return "on_waitlist";
	return "notify_me";
}

/** Prefer company member email; fall back to the Whop user profile. */
export function resolveSubscriberEmail(
	memberEmail: string | undefined,
	userEmail: string | null | undefined,
): string | null {
	return memberEmail ?? userEmail ?? null;
}
