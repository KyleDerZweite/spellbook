import { parseLazyBrowsePagination, clampBrowsePagination } from '#lib/browsing/pagination.ts';
import { inventoryQueryFromUrl } from './inventory-window.ts';

/** Browser addressing is translated before the unchanged legacy API parser. */
export function inventoryBrowseQuery(url: URL) {
	const pagination = parseLazyBrowsePagination(url.searchParams, 1_000_000);
	const wire = new URL(url);
	wire.searchParams.delete('page');
	wire.searchParams.set('offset', String(pagination.offset));
	wire.searchParams.set('limit', String(pagination.limit));
	return { pagination, query: inventoryQueryFromUrl(wire) };
}
export { clampBrowsePagination };
