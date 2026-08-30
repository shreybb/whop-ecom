import { getSupabase } from "@/lib/supabase";
import type { CompanyRow } from "./types";

export async function upsertCompany(companyId: string, title?: string | null) {
	const { data, error } = await getSupabase()
		.from("companies")
		.upsert(
			{ id: companyId, ...(title ? { title } : {}) },
			{ onConflict: "id" },
		)
		.select()
		.single();
	if (error) throw error;
	return data as CompanyRow;
}

export async function getCompany(companyId: string) {
	const { data, error } = await getSupabase()
		.from("companies")
		.select()
		.eq("id", companyId)
		.maybeSingle();
	if (error) throw error;
	return data as CompanyRow | null;
}

export async function setAutoNotify(companyId: string, autoNotify: boolean) {
	const { error } = await getSupabase()
		.from("companies")
		.update({ auto_notify: autoNotify })
		.eq("id", companyId);
	if (error) throw error;
}

export async function listCompanyIds(): Promise<string[]> {
	const { data, error } = await getSupabase().from("companies").select("id");
	if (error) throw error;
	return (data ?? []).map((r) => r.id as string);
}
