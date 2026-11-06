import { MANA_COLORS, RARITIES, CARD_TYPES, LEGALITY_FORMATS } from './filter-options.ts';
import { LANGUAGE_OPTIONS, DEFAULT_SEARCH_LANGUAGES } from './languages.ts';
import type { CatalogFilters } from './types.ts';
import { browserColorFilters, completeColorMatch } from './color-filters.ts';
import { parseLazyBrowsePagination, type BrowsePagination } from '#lib/browsing/pagination.ts';

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
export function browserLanguages(params: Pick<URLSearchParams, 'get' | 'getAll'>) {
	const raw = params.getAll('lang');
	const selected = LANGUAGE_OPTIONS.filter(({ id }) => raw.includes(id)).map(({ id }) => id);
	if (selected.length) return selected;
	if (raw.includes('all') || params.get('languages') === 'selected') return [];
	return [...DEFAULT_SEARCH_LANGUAGES];
}

export function parseSearchUrl(url: {
	searchParams: Pick<URLSearchParams, 'get' | 'getAll'>;
}): SearchInput {
	const not = values(url.searchParams, 'colorNot', MANA_COLORS);
	const all = values(url.searchParams, 'colorAnd', MANA_COLORS).filter(
		(color) => !not.includes(color)
	);
	const any = values(url.searchParams, 'color', MANA_COLORS).filter(
		(color) => !all.includes(color) && !not.includes(color)
	);
	return {
		query: url.searchParams.get('q') ?? '',
		pagination: parseLazyBrowsePagination(
			new URLSearchParams(
				['pageSize', 'page'].flatMap((key) =>
					url.searchParams.getAll(key).map((value) => [key, value])
				)
			),
			SEARCH_MAX_OFFSET
		),
		filters: {
			languages: browserLanguages(url.searchParams),
			...browserColorFilters({
				field: url.searchParams.get('colorMode') === 'identity' ? 'identity' : 'color',
				any,
				all,
				...(not.length ? { not } : {})
			}),
			rarities: values(url.searchParams, 'rarity', RARITIES),
			types: values(url.searchParams, 'type', CARD_TYPES),
			legalities: values(url.searchParams, 'legal', LEGALITY_FORMATS)
		}
	};
}

export function searchHref({ query, filters, pagination }: SearchInput): string {
	const params = new URLSearchParams();
	const match = filters.colorMatch ? completeColorMatch(filters.colorMatch) : undefined;
	if (query) params.set('q', query);
	const languages = filters.languages ?? DEFAULT_SEARCH_LANGUAGES;
	if (!languages.length) params.set('lang', 'all');
	else if (languages.length !== 2 || !languages.includes('de') || !languages.includes('en'))
		for (const language of [...new Set(languages)].sort()) params.append('lang', language);
	for (const [key, selected] of [
		['color', match?.any],
		['colorAnd', match?.all],
		['colorNot', match?.not],
		['rarity', filters.rarities],
		['type', filters.types],
		['legal', filters.legalities]
	] as const) {
		for (const value of [...new Set(selected ?? [])].sort()) params.append(key, value);
	}
	if (match?.field === 'identity') params.set('colorMode', 'identity');
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
	return parseLazyBrowsePagination(
		new URLSearchParams({ pageSize: String(pageSize), page: String(page) }),
		SEARCH_MAX_OFFSET
	);
}
