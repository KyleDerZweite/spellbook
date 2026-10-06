import { MANA_COLORS, RARITIES, CARD_TYPES, LEGALITY_FORMATS } from './filter-options.ts';
import type { CatalogFilters } from './types.ts';

export interface SearchInput {
	query: string;
	filters: CatalogFilters;
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
		filters: {
			colorIdentity: values(url.searchParams, 'color', MANA_COLORS),
			rarities: values(url.searchParams, 'rarity', RARITIES),
			types: values(url.searchParams, 'type', CARD_TYPES),
			legalities: values(url.searchParams, 'legal', LEGALITY_FORMATS)
		}
	};
}

export function searchHref({ query, filters }: SearchInput): string {
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
	return `/mtg/search${params.size ? `?${params}` : ''}`;
}

export function isPrimaryClick(event: MouseEvent): boolean {
	return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
