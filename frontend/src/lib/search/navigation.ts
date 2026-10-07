import { MANA_COLORS, RARITIES, CARD_TYPES, LEGALITY_FORMATS } from './filter-options.ts';
import type { CatalogFilters } from './types.ts';
import { parseBrowsePagination, type BrowsePagination } from '#lib/browsing/pagination.ts';

export const SEARCH_DEFAULT_PAGE_SIZE = 'lazy';
export const SEARCH_MAX_OFFSET = 1_000_000;

export interface SearchInput {
	query: string;
	filters: CatalogFilters;
	pagination?: BrowsePagination;
}

function values<T extends string>(
	params: Pick<URLSearchParams, 'getAll'>,
	key: string,
	options: { id: T }[]
): T[] {
	const selected = new Set(params.getAll(key));
	return options.filter(({ id }) => selected.has(id)).map(({ id }) => id);
}

/** Only supported catalog filters enter a browser history entry. */
export function parseSearchUrl(url: {
	searchParams: Pick<URLSearchParams, 'get' | 'getAll'>;
}): SearchInput {
	return {
		query: url.searchParams.get('q') ?? '',
		pagination: parseBrowsePagination(
			new URLSearchParams(
				['pageSize', 'page'].flatMap((key) =>
					url.searchParams.getAll(key).map((value) => [key, value])
				)
			),
			SEARCH_MAX_OFFSET,
			SEARCH_DEFAULT_PAGE_SIZE
		),
		filters: {
			colorIdentity: values(url.searchParams, 'color', MANA_COLORS),
			rarities: values(url.searchParams, 'rarity', RARITIES),
			types: values(url.searchParams, 'type', CARD_TYPES),
			legalities: values(url.searchParams, 'legal', LEGALITY_FORMATS)
		}
	};
}

export function searchHref({ query, filters, pagination }: SearchInput): string {
	const params = new URLSearchParams();
	if (query) params.set('q', query);
	for (const [key, selected] of [
		['color', filters.colorIdentity],
		['rarity', filters.rarities],
		['type', filters.types],
		['legal', filters.legalities]
	] as const) {
		for (const value of [...new Set(selected ?? [])].sort()) params.append(key, value);
	}
	if (pagination) {
		params.set('pageSize', String(pagination.pageSize));
		params.set('page', String(pagination.page));
	}
	return `/mtg/search${params.size ? `?${params}` : ''}`;
}

export function isPrimaryClick(event: MouseEvent): boolean {
	return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function searchPagination(
	pageSize: BrowsePagination['pageSize'] = SEARCH_DEFAULT_PAGE_SIZE,
	page = 1
): BrowsePagination {
	return parseBrowsePagination(
		new URLSearchParams({ pageSize: String(pageSize), page: String(page) }),
		SEARCH_MAX_OFFSET,
		SEARCH_DEFAULT_PAGE_SIZE
	);
}
