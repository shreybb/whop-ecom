export default function RootLoading() {
	return (
		<main className="flex min-h-screen items-center justify-center p-6 sm:p-8">
			<div className="flex flex-col items-center gap-3 rounded-xl border border-gray-a4 bg-gray-a2 px-8 py-10">
				<div
					aria-hidden
					className="size-8 animate-spin rounded-full border-2 border-gray-a5 border-t-gray-11"
				/>
				<p className="text-3 text-gray-10">Loading Restocked…</p>
			</div>
		</main>
	);
}
