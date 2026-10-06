import type { CatalogFilters, CatalogSearchRequest, Game } from './types.ts';

export interface SearchContextInput {
	game: Game;
	query: string;
	filters: CatalogFilters;
	limit?: number;
	sort?: CatalogSearchRequest['sort'];
}

export function buildSearchContextKey({
	game,
	query,
	filters,
	limit = 50,
	sort
}: SearchContextInput): string {
	const normalizedQuery = query.trim();
	const mode = normalizedQuery.length < 2 ? 'browse' : 'search';
	return JSON.stringify({
		game,
		limit,
		sort: sort ?? (mode === 'browse' ? 'name:asc' : null),
		mode,
		query: mode === 'browse' ? '' : normalizedQuery.toLowerCase(),
		filters: {
			colors: [...new Set(filters.colors ?? [])].sort(),
			colorIdentity: [...new Set(filters.colorIdentity ?? [])].sort(),
			rarities: [...new Set(filters.rarities ?? [])].sort(),
			types: [...new Set(filters.types ?? [])].sort(),
			legalities: [...new Set(filters.legalities ?? [])].sort(),
			sets: [...new Set((filters.sets ?? []).map((set) => set.toLowerCase()))].sort()
		}
	});
}
