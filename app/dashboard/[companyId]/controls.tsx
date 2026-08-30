"use client";

import { Button } from "@whop/react/components";
import { useState, useTransition } from "react";
import { setAutoNotifyAction, syncStockAction } from "@/app/actions";

export function SyncButton({ companyId }: { companyId: string }) {
	const [isPending, startTransition] = useTransition();
	const [lastResult, setLastResult] = useState<string | null>(null);

	return (
		<div className="flex items-center gap-2">
			{lastResult && (
				<span className="text-2 text-gray-10">{lastResult}</span>
			)}
			<Button
				variant="soft"
				size="2"
				loading={isPending}
				onClick={() =>
					startTransition(async () => {
						const { restocked, soldOut } =
							await syncStockAction(companyId);
						setLastResult(
							restocked || soldOut
								? `${restocked} restock${restocked === 1 ? "" : "s"}, ${soldOut} sellout${soldOut === 1 ? "" : "s"} detected`
								: "Stock is up to date",
						);
					})
				}
			>
				Sync stock
			</Button>
		</div>
	);
}

export function AutoNotifyToggle({
	companyId,
	enabled: initialEnabled,
}: {
	companyId: string;
	enabled: boolean;
}) {
	const [enabled, setEnabled] = useState(initialEnabled);
	const [isPending, startTransition] = useTransition();

	return (
		<label className="flex cursor-pointer items-center gap-2 text-3">
			<button
				type="button"
				role="switch"
				aria-checked={enabled}
				disabled={isPending}
				onClick={() =>
					startTransition(async () => {
						const next = !enabled;
						await setAutoNotifyAction(companyId, next);
						setEnabled(next);
					})
				}
				className={`relative h-6 w-10 rounded-full transition-colors ${
					enabled ? "bg-green-9" : "bg-gray-a5"
				} ${isPending ? "opacity-60" : ""}`}
			>
				<span
					className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
						enabled ? "translate-x-[18px]" : "translate-x-0.5"
					}`}
				/>
			</button>
			<span className="text-gray-10">Auto-notify on restock</span>
		</label>
	);
}
