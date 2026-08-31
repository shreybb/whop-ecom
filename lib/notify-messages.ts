export type MessageVariant = { title: string; content: string };

type Placeholders = { product: string; plan: string; label: string };

export const RESTOCK_VARIANTS: MessageVariant[] = [
	{
		title: "{label} is back in stock!",
		content:
			"You asked us to let you know — {label} is available again. Grab it before it sells out.",
	},
	{
		title: "It's back: {label}",
		content:
			"Good news — {label} just restocked. You joined the waitlist for this one, so here's your heads-up.",
	},
	{
		title: "{product} restocked",
		content:
			"{label} is live again. Don't sleep on it — limited units go fast.",
	},
	{
		title: "Your wait is over — {label}",
		content:
			"We saved you a spot on the waitlist and {label} is back. Tap through before it's gone again.",
	},
	{
		title: "Back on the shelf: {label}",
		content:
			"{label} is in stock right now. You asked for a ping — this is it.",
	},
];

export const MANUAL_IN_STOCK_VARIANTS: MessageVariant[] = [
	{
		title: "Update: {label}",
		content:
			"The merchant just sent a waitlist update for {label}. Check the Drops tab for details.",
	},
	{
		title: "Heads up on {label}",
		content:
			"There's fresh news about {label} for everyone on the waitlist. Open the Drops tab to see what's new.",
	},
];

export const MANUAL_SOLD_OUT_VARIANTS: MessageVariant[] = [
	{
		title: "Update: {label}",
		content:
			"You're still on the waitlist for {label}. The store just sent an update — check the Drops tab.",
	},
	{
		title: "Still waiting on {label}?",
		content:
			"{label} is still sold out, but the merchant wanted to reach everyone on the waitlist. See the Drops tab for the latest.",
	},
];

export function pickMessageVariant(
	pool: MessageVariant[],
	variantIndex: number,
): MessageVariant {
	if (pool.length === 0) {
		return { title: "Back in stock", content: "An item on your waitlist is available." };
	}
	return pool[((variantIndex % pool.length) + pool.length) % pool.length]!;
}

export function applyMessagePlaceholders(
	template: string,
	placeholders: Placeholders,
): string {
	return template
		.replaceAll("{label}", placeholders.label)
		.replaceAll("{product}", placeholders.product)
		.replaceAll("{plan}", placeholders.plan);
}

export function resolveRestockMessagePool(
	inStock: boolean,
	source: "manual" | "sync" | "webhook" | "cron",
): MessageVariant[] {
	if (inStock) {
		return source === "manual" ? MANUAL_IN_STOCK_VARIANTS : RESTOCK_VARIANTS;
	}
	return MANUAL_SOLD_OUT_VARIANTS;
}
