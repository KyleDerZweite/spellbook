import type { CatalogFilters, Game } from './types.ts';

interface SearchContextInput {
	game: Game;
	query: string;
	filters: CatalogFilters;
}

export function buildSearchContextKey({ game, query, filters }: SearchContextInput): string {
	const normalizedQuery = query.trim();
	const mode = normalizedQuery.length < 2 ? 'browse' : 'search';
	return JSON.stringify({
		game,
		mode,
		query: normalizedQuery,
		filters: {
			colors: [...(filters.colors ?? [])].sort(),
			rarities: [...(filters.rarities ?? [])].sort(),
			types: [...(filters.types ?? [])].sort(),
			legalities: [...(filters.legalities ?? [])].sort(),
			sets: [...(filters.sets ?? [])].sort()
		}
	});
}
