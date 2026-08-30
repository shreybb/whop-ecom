"use client";

import { useEffect } from "react";

function isAuthError(error: Error): boolean {
	const msg = error.message.toLowerCase();
	return (
		msg.includes("token") ||
		msg.includes("unauthorized") ||
		msg.includes("authentication") ||
		msg.includes("x-whop-user-token") ||
		msg.includes("not authenticated")
	);
}

export default function RootError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	const authFailure = isAuthError(error);

	return (
		<main className="flex min-h-screen items-center justify-center p-6 sm:p-8">
			<div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border border-gray-a4 bg-gray-a2 p-8 text-center">
				<h1 className="text-6 font-bold text-gray-12">
					{authFailure ? "Open inside Whop" : "Something went wrong"}
				</h1>
				<p className="text-3 text-gray-10">
					{authFailure
						? "Restocked runs inside whop.com. Install the app on your business and open the Drops tab or merchant dashboard from your Whop — visiting this URL directly has no user session."
						: "An unexpected error occurred. Try again, or reopen the app from Whop."}
				</p>
				{!authFailure && (
					<button
						type="button"
						onClick={reset}
						className="mx-auto rounded-lg border border-gray-a5 bg-gray-a3 px-4 py-2 text-3 font-medium text-gray-12 hover:bg-gray-a4"
					>
						Try again
					</button>
				)}
			</div>
		</main>
	);
}
