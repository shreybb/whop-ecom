"use client";

import { Button } from "@whop/react/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setNotifyTemplatesAction } from "@/app/actions";

export function NotifyTemplatesForm({
	companyId,
	initialTitle,
	initialBody,
}: {
	companyId: string;
	initialTitle: string | null;
	initialBody: string | null;
}) {
	const router = useRouter();
	const [title, setTitle] = useState(initialTitle ?? "");
	const [body, setBody] = useState(initialBody ?? "");
	const [feedback, setFeedback] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	return (
		<form
			className="flex flex-col gap-3 rounded-xl border border-gray-a4 bg-gray-a2 p-4"
			onSubmit={(e) => {
				e.preventDefault();
				setFeedback(null);
				startTransition(async () => {
					const result = await setNotifyTemplatesAction(
						companyId,
						title || null,
						body || null,
					);
					if (result.ok) {
						setFeedback("Saved");
						router.refresh();
					} else {
						setFeedback(result.error);
					}
				});
			}}
		>
			<div>
				<h3 className="text-4 font-semibold">Custom alert copy</h3>
				<p className="mt-0.5 text-2 text-gray-10">
					Optional restock-only copy for automatic back-in-stock alerts. Leave
					blank to rotate through built-in restock variants each restock.
					Sold-out Send update always uses Restocked&apos;s built-in copy, not
					this form. Use {"{product}"}, {"{plan}"}, or{" "}
					{"{label}"} in custom restock copy.
				</p>
			</div>
			<label className="flex flex-col gap-1 text-2">
				<span className="text-gray-10">Alert title</span>
				<input
					type="text"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="e.g. Your size is back"
					className="rounded-lg border border-gray-a5 bg-gray-a1 px-3 py-2 text-3"
					maxLength={120}
				/>
			</label>
			<label className="flex flex-col gap-1 text-2">
				<span className="text-gray-10">Alert body</span>
				<textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder="e.g. Tap to grab it before it sells out again."
					rows={3}
					className="resize-y rounded-lg border border-gray-a5 bg-gray-a1 px-3 py-2 text-3"
					maxLength={500}
				/>
			</label>
			<div className="flex items-center gap-3">
				<Button type="submit" variant="soft" size="2" loading={isPending}>
					Save copy
				</Button>
				{feedback && (
					<span
						className={`text-2 ${feedback === "Saved" ? "text-green-11" : "text-red-11"}`}
					>
						{feedback}
					</span>
				)}
			</div>
		</form>
	);
}
