import { getSupabase } from "@/lib/supabase";
import type { CompanyRow } from "./types";

export async function upsertCompany(
	companyId: string,
	title?: string | null,
	options: { createdFromInstall?: boolean } = {},
) {
	const { data, error } = await getSupabase()
		.from("companies")
		.upsert(
			{
				id: companyId,
				...(title ? { title } : {}),
				...(options.createdFromInstall ? { created_from_install: true } : {}),
			},
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

export async function setNotifyTemplates(
	companyId: string,
	templates: { notifyTitle?: string | null; notifyBody?: string | null },
) {
	const { error } = await getSupabase()
		.from("companies")
		.update({
			...(templates.notifyTitle !== undefined
				? { notify_title: templates.notifyTitle }
				: {}),
			...(templates.notifyBody !== undefined
				? { notify_body: templates.notifyBody }
				: {}),
		})
		.eq("id", companyId);
	if (error) throw error;
}

export async function listCompanyIds(): Promise<string[]> {
	const { data, error } = await getSupabase().from("companies").select("id");
	if (error) throw error;
	return (data ?? []).map((r) => r.id as string);
}
