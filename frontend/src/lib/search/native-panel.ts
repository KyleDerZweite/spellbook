import type { CatalogRange } from '#lib/search/catalogWindow.ts';

/** Named action transport does not change the native page's retained intent. */
export function nativeSearchPageKey(url: Pick<URL, 'pathname' | 'search'>): string {
	const params = new URLSearchParams(url.search);
	params.delete('/addToDeck');
	params.delete('/addToInventory');
	return url.pathname + (params.size ? '?' + params.toString() : '');
}

/** Showing native feedback above the grid must not erase its URL through Lazy anchoring. */
export function nativeFeedbackRange(
	range: CatalogRange,
	routeAnchor: number,
	active: boolean
): CatalogRange {
	return active ? { ...range, anchor: routeAnchor } : range;
}
