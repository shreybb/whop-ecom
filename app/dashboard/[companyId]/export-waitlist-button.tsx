"use client";

import { Button } from "@whop/react/components";
import { useState, useTransition } from "react";
import { exportWaitlistCsvAction } from "@/app/actions-merchant";

export function ExportWaitlistButton({ companyId }: { companyId: string }) {
	const [isPending, startTransition] = useTransition();
	const [feedback, setFeedback] = useState<string | null>(null);

	return (
		<div className="flex items-center gap-2">
			{feedback ? (
				<span
					className={`text-2 ${feedback.startsWith("Exported") ? "text-green-11" : "text-red-11"}`}
				>
					{feedback}
				</span>
			) : null}
			<Button
				variant="soft"
				size="2"
				loading={isPending}
				onClick={() =>
					startTransition(async () => {
						const result = await exportWaitlistCsvAction(companyId);
						if (!result.ok) {
							setFeedback(result.error);
							return;
						}
						const { csv, filename } = result.data;
						const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
						const href = URL.createObjectURL(blob);
						const anchor = document.createElement("a");
						anchor.href = href;
						anchor.download = filename;
						anchor.click();
						URL.revokeObjectURL(href);
						setFeedback("Exported ✓");
						window.setTimeout(() => setFeedback(null), 2500);
					})
				}
			>
				Export waitlist CSV
			</Button>
		</div>
	);
}
