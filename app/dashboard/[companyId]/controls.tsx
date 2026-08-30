"use client";

import { Button } from "@whop/react/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAutoNotifyAction, syncStockAction } from "@/app/actions";

export function SyncButton({ companyId }: { companyId: string }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [lastResult, setLastResult] = useState<string | null>(null);

	return (
		<div className="flex items-center gap-2">
			{lastResult && (
				<span
					className={`text-2 ${lastResult.startsWith("Could not") ? "text-red-11" : "text-gray-10"}`}
				>
					{lastResult}
				</span>
			)}
			<Button
				variant="soft"
				size="2"
				loading={isPending}
				onClick={() =>
					startTransition(async () => {
						const result = await syncStockAction(companyId);
						if (result.ok) {
							const { restocked, soldOut } = result.data;
							setLastResult(
								restocked || soldOut
									? `${restocked} restock${restocked === 1 ? "" : "s"}, ${soldOut} sellout${soldOut === 1 ? "" : "s"} detected`
									: "Stock is up to date",
							);
							router.refresh();
						} else {
							setLastResult(result.error);
						}
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
	const [error, setError] = useState<string | null>(null);
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
						const result = await setAutoNotifyAction(companyId, next);
						if (result.ok) {
							setEnabled(next);
							setError(null);
						} else {
							setError(result.error);
						}
					})
				}
				className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
					enabled ? "bg-green-9" : "bg-gray-a5"
				} ${isPending ? "opacity-60" : ""}`}
			>
				<span
					className={`block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
						enabled ? "translate-x-5" : "translate-x-0"
					}`}
				/>
			</button>
			<span className="text-gray-10">
				Auto-notify on restock
				<span className="block text-1 text-gray-9">
					Blasts every subscriber on that plan when stock returns
				</span>
				{error && (
					<span className="ml-2 text-red-11">{error}</span>
				)}
			</span>
		</label>
	);
}
