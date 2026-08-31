"use client";

export function ActivityTime({ at }: { at: string }) {
	return (
		<time dateTime={at} className="shrink-0 text-2 text-gray-9">
			{new Date(at).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
			})}
		</time>
	);
}
