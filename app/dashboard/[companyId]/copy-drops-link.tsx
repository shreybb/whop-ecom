"use client";

import { Button } from "@whop/react/components";
import { useState } from "react";

export function CopyDropsLink({
	url,
	label = "Copy Drops link",
	size = "1",
}: {
	url: string | null;
	label?: string;
	size?: "1" | "2";
}) {
	const [feedback, setFeedback] = useState<string | null>(null);

	if (!url) {
		return (
			<span className="text-2 text-gray-9">
				Add Restocked as a Drops experience on your whop first.
			</span>
		);
	}

	return (
		<div className="flex items-center gap-2">
			{feedback ? (
				<span className="text-2 text-green-11">{feedback}</span>
			) : null}
			<Button
				variant="soft"
				size={size}
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(url);
						setFeedback("Copied!");
						window.setTimeout(() => setFeedback(null), 2000);
					} catch {
						setFeedback("Could not copy");
					}
				}}
			>
				{label}
			</Button>
		</div>
	);
}
