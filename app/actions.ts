"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { actionErr, actionOk, type ActionResult } from "@/lib/action-result";
import {
	setAutoNotify,
	setNotifyTemplates,
	upsertCompany,
} from "@/lib/db/companies";
import { getTrackedPlans } from "@/lib/db/products";
import type { TrackedPlan } from "@/lib/db/types";
import {
	joinWaitlist as dbJoinWaitlist,
	leaveWaitlist as dbLeaveWaitlist,
} from "@/lib/db/waitlist";
import { notifyWaitlistForPlan, syncCompanyStock } from "@/lib/stock";
import { getMemberProfilesForUsers } from "@/lib/whop-members";
import { resolveSubscriberEmail } from "@/lib/waitlist-ui";
import { getWhopSdk } from "@/lib/whop-sdk";

// Server actions re-verify the Whop user token on every call and re-derive
// the tenant server-side (from the experience or an admin access check) —
// client-supplied ids are never trusted for authorization.

async function requireUser() {
	const { userId } = await getWhopSdk().verifyUserToken(await headers());
	return userId;
}

async function requireExperienceContext(experienceId: string) {
	const whopsdk = getWhopSdk();
	const userId = await requireUser();
	const [experience, access] = await Promise.all([
		whopsdk.experiences.retrieve(experienceId),
		whopsdk.users.checkAccess(experienceId, { id: userId }),
	]);
	if (!access.has_access) throw new Error("No access to this experience");
	return { userId, companyId: experience.company.id };
}

async function requireCompanyAdmin(companyId: string) {
	const userId = await requireUser();
	const access = await getWhopSdk().users.checkAccess(companyId, {
		id: userId,
	});
	if (!access.has_access || access.access_level !== "admin") {
		throw new Error("Admin access required");
	}
	return userId;
}

async function requireSoldOutPlan(
	companyId: string,
	planId: string,
): Promise<ActionResult<{ plan: TrackedPlan }>> {
	const { plans } = await syncCompanyStock(companyId, "sync", {
		force: true,
	});
	const plan = plans.find((p) => p.plan_id === planId);
	if (!plan) return actionErr("Plan not found");
	if (plan.in_stock) return actionErr("This option is in stock");
	return actionOk({ plan });
}

export async function joinWaitlistAction(
	experienceId: string,
	planId: string,
): Promise<ActionResult> {
	try {
		const { userId, companyId } =
			await requireExperienceContext(experienceId);
		const check = await requireSoldOutPlan(companyId, planId);
		if (!check.ok) return check;

		await upsertCompany(companyId);
		const [profiles, user] = await Promise.all([
			getMemberProfilesForUsers(companyId, [userId]),
			getWhopSdk()
				.users.retrieve(userId)
				.catch(() => null),
		]);
		const memberProfile = profiles.get(userId);
		const email = resolveSubscriberEmail(
			memberProfile?.email,
			user && "email" in user
				? (user.email as string | null | undefined)
				: null,
		);
		await dbJoinWaitlist({
			companyId,
			productId: check.data.plan.product_id,
			planId,
			experienceId,
			whopUserId: userId,
			username: memberProfile?.username ?? user?.username ?? null,
			email,
		});
		revalidatePath(`/experiences/${experienceId}`);
		return actionOk();
	} catch {
		return actionErr("Could not join the waitlist. Please try again.");
	}
}

export async function leaveWaitlistAction(
	experienceId: string,
	planId: string,
): Promise<ActionResult> {
	try {
		const { userId, companyId } =
			await requireExperienceContext(experienceId);
		const plans = await getTrackedPlans(companyId);
		const plan = plans.find((p) => p.plan_id === planId);
		if (!plan) return actionErr("Plan not found");
		await dbLeaveWaitlist({
			companyId,
			productId: plan.product_id,
			planId,
			whopUserId: userId,
		});
		revalidatePath(`/experiences/${experienceId}`);
		return actionOk();
	} catch {
		return actionErr("Could not leave the waitlist. Please try again.");
	}
}

export async function notifyWaitlistAction(
	companyId: string,
	planId: string,
): Promise<
	ActionResult<{ notified: number; waiting: number; pendingNotify: number; stockLeft: number | null }>
> {
	try {
		await requireCompanyAdmin(companyId);
		const { plans } = await syncCompanyStock(companyId, "sync", {
			force: true,
		});
		const plan = plans.find((p) => p.plan_id === planId);
		if (!plan) return actionErr("Unknown plan");
		const result = await notifyWaitlistForPlan(companyId, plan, "manual");
		revalidatePath(`/dashboard/${companyId}`);
		return actionOk(result);
	} catch {
		return actionErr("Could not notify the waitlist. Please try again.");
	}
}

export async function syncStockAction(
	companyId: string,
): Promise<ActionResult<{ restocked: number; soldOut: number }>> {
	try {
		await requireCompanyAdmin(companyId);
		const result = await syncCompanyStock(companyId, "sync", { force: true });
		revalidatePath(`/dashboard/${companyId}`);
		return actionOk({
			restocked: result.restockedPlanIds.length,
			soldOut: result.soldOutPlanIds.length,
		});
	} catch {
		return actionErr("Could not sync stock. Please try again.");
	}
}

export async function setAutoNotifyAction(
	companyId: string,
	autoNotify: boolean,
): Promise<ActionResult> {
	try {
		await requireCompanyAdmin(companyId);
		await setAutoNotify(companyId, autoNotify);
		revalidatePath(`/dashboard/${companyId}`);
		return actionOk();
	} catch {
		return actionErr("Could not update settings. Please try again.");
	}
}

export async function setNotifyTemplatesAction(
	companyId: string,
	notifyTitle: string | null,
	notifyBody: string | null,
): Promise<ActionResult> {
	try {
		await requireCompanyAdmin(companyId);
		await setNotifyTemplates(companyId, {
			notifyTitle: notifyTitle?.trim() || null,
			notifyBody: notifyBody?.trim() || null,
		});
		revalidatePath(`/dashboard/${companyId}`);
		return actionOk();
	} catch {
		return actionErr("Could not save alert copy. Please try again.");
	}
}
