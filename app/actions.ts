"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { setAutoNotify, upsertCompany } from "@/lib/db/companies";
import { getTrackedProducts } from "@/lib/db/products";
import {
	joinWaitlist as dbJoinWaitlist,
	leaveWaitlist as dbLeaveWaitlist,
} from "@/lib/db/waitlist";
import { notifyWaitlistForProduct, syncCompanyStock } from "@/lib/stock";
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

export async function joinWaitlistAction(
	experienceId: string,
	productId: string,
) {
	const { userId, companyId } = await requireExperienceContext(experienceId);
	await upsertCompany(companyId);
	const user = await getWhopSdk()
		.users.retrieve(userId)
		.catch(() => null);
	await dbJoinWaitlist({
		companyId,
		productId,
		experienceId,
		whopUserId: userId,
		username: user?.username ?? null,
	});
	revalidatePath(`/experiences/${experienceId}`);
}

export async function leaveWaitlistAction(
	experienceId: string,
	productId: string,
) {
	const { userId, companyId } = await requireExperienceContext(experienceId);
	await dbLeaveWaitlist({ companyId, productId, whopUserId: userId });
	revalidatePath(`/experiences/${experienceId}`);
}

export async function notifyWaitlistAction(
	companyId: string,
	productId: string,
) {
	await requireCompanyAdmin(companyId);
	const products = await getTrackedProducts(companyId);
	const product = products.find((p) => p.product_id === productId);
	if (!product) throw new Error("Unknown product");
	const { notified } = await notifyWaitlistForProduct(
		companyId,
		product,
		"manual",
	);
	revalidatePath(`/dashboard/${companyId}`);
	return { notified };
}

export async function syncStockAction(companyId: string) {
	await requireCompanyAdmin(companyId);
	const result = await syncCompanyStock(companyId, "sync", { force: true });
	revalidatePath(`/dashboard/${companyId}`);
	return {
		restocked: result.restockedProductIds.length,
		soldOut: result.soldOutProductIds.length,
	};
}

export async function setAutoNotifyAction(
	companyId: string,
	autoNotify: boolean,
) {
	await requireCompanyAdmin(companyId);
	await setAutoNotify(companyId, autoNotify);
	revalidatePath(`/dashboard/${companyId}`);
}
