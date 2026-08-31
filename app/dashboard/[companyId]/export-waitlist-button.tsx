"use client";

import { Button } from "@whop/react/components";
import { useState, useTransition } from "react";
import { exportWaitlistCsvAction } from "@/app/actions-merchant";

export function ExportWaitlistButton({
	companyId,
	compact = false,
}: {
	companyId: string;
	compact?: boolean;
}) {
	const [isPending, startTransition] = useTransition();
	const [feedback, setFeedback] = useState<string | null>(null);

	return (
		<div
			className={
				compact
					? "flex items-center gap-2"
					: "flex flex-col items-start gap-1 lg:items-end"
			}
		>
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
							const { csv, filename, rowCount, emailCount } = result.data;
							const blob = new Blob([csv], {
								type: "text/csv;charset=utf-8",
							});
							const href = URL.createObjectURL(blob);
							const anchor = document.createElement("a");
							anchor.href = href;
							anchor.download = filename;
							anchor.click();
							URL.revokeObjectURL(href);
							const emailNote =
								emailCount === rowCount
									? `${emailCount} email${emailCount === 1 ? "" : "s"}`
									: `${emailCount} of ${rowCount} with email`;
							setFeedback(
								rowCount === 0
									? "Exported (empty waitlist) ✓"
									: `Exported ${rowCount} — ${emailNote} ✓`,
							);
							window.setTimeout(() => setFeedback(null), 3500);
						})
					}
				>
					Export waitlist CSV
				</Button>
			</div>
			{!compact ? (
				<p className="text-1 text-gray-9 text-pretty lg:text-right">
					Download everyone currently waiting — username, email, plan, and join
					date.
				</p>
			) : null}
		</div>
	);
}
