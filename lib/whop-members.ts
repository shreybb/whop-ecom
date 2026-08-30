import { getWhopApiBase } from "@/lib/whop-config";

export type MemberProfile = {
	userId: string;
	email: string;
	name: string | null;
	username: string | null;
};

type MemberListResponse = {
	data?: Array<{
		user?: {
			id: string;
			email: string | null;
			name: string | null;
			username: string | null;
		} | null;
	}>;
};

/** Resolve Whop user ids to member profiles (requires member:email:read). */
export async function getMemberProfilesForUsers(
	companyId: string,
	userIds: string[],
): Promise<Map<string, MemberProfile>> {
	const apiKey = process.env.WHOP_API_KEY;
	if (!apiKey || userIds.length === 0) return new Map();

	const unique = [...new Set(userIds)];
	const profiles = new Map<string, MemberProfile>();
	const base = getWhopApiBase();

	const BATCH = 50;
	for (let i = 0; i < unique.length; i += BATCH) {
		const batch = unique.slice(i, i + BATCH);
		const params = new URLSearchParams({ company_id: companyId });
		for (const id of batch) params.append("user_ids[]", id);

		const res = await fetch(`${base}/members?${params}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (!res.ok) {
			console.error("[members] list failed", res.status, await res.text());
			continue;
		}
		const body = (await res.json()) as MemberListResponse;
		for (const member of body.data ?? []) {
			const user = member.user;
			if (!user?.id || !user.email) continue;
			profiles.set(user.id, {
				userId: user.id,
				email: user.email,
				name: user.name,
				username: user.username,
			});
		}
	}

	return profiles;
}
