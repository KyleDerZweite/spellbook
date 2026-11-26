import type {
	MissingCardsExportRequest,
	MissingCardsExportResponse,
	MissingExportFormat
} from '@spellbook/contracts/decks.ts';

export const BULK_BASIC_LAND_THRESHOLD = 10;
export const BULK_BUDGET_CARD_THRESHOLD = 20;

export interface BulkEbaySearchHint {
	domain: 'ebay.de' | 'ebay.com';
	url: string;
	reason: 'basic_lands' | 'budget_cards' | 'both';
}

/**
 * Build an unobtrusive external eBay search link when missing basic lands (>= 10) or
 * budget cards under 0.50 EUR (>= 20) cross the v1 threshold. Domain follows UI locale.
 */
export function buildBulkEbaySearchUrl(
	locale: string,
	missingBasicLandCopies: number,
	missingBudgetCardCopies: number
): BulkEbaySearchHint | null {
	const hasLands = missingBasicLandCopies >= BULK_BASIC_LAND_THRESHOLD;
	const hasBudget = missingBudgetCardCopies >= BULK_BUDGET_CARD_THRESHOLD;
	if (!hasLands && !hasBudget) return null;

	const isGerman = locale.toLowerCase().startsWith('de');
	const domain: 'ebay.de' | 'ebay.com' = isGerman ? 'ebay.de' : 'ebay.com';
	const reason: BulkEbaySearchHint['reason'] =
		hasLands && hasBudget ? 'both' : hasLands ? 'basic_lands' : 'budget_cards';

	const query =
		reason === 'basic_lands'
			? isGerman
				? 'Magic The Gathering Standardländer Lot'
				: 'MTG Basic Lands Lot'
			: isGerman
				? 'Magic The Gathering Bulk Lot'
				: 'MTG Bulk Lot';

	const params = new URLSearchParams({ _nkw: query });
	return {
		domain,
		url: `https://www.${domain}/sch/i.html?${params.toString()}`,
		reason
	};
}

export function missingExportFilename(
	format: MissingExportFormat,
	deckNames: readonly string[]
): string {
	const prefix =
		deckNames.length === 1
			? deckNames[0].replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'deck'
			: `${deckNames.length}-decks`;
	return `${prefix}-missing-${format}.txt`;
}

export async function fetchMissingCardsExport(
	input: MissingCardsExportRequest,
	signal?: AbortSignal,
	fetchFn: typeof fetch = fetch
): Promise<MissingCardsExportResponse> {
	const response = await fetchFn('/api/v1/mtg/decks/missing-export', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			deckIds: input.deckIds,
			mode: input.mode ?? 'sum',
			includePrinting: input.includePrinting ?? false
		}),
		signal
	});
	if (!response.ok) {
		let message = 'Could not calculate missing cards.';
		try {
			const data = (await response.json()) as { message?: unknown };
			if (typeof data?.message === 'string' && data.message) message = data.message;
		} catch {
			// Keep default message when response body is not JSON.
		}
		throw new Error(message);
	}
	return (await response.json()) as MissingCardsExportResponse;
}
