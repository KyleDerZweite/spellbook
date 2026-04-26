import type { Game } from './types';

interface SearchContextInput {
	game: Game;
	query: string;
	filters: string[];
}

export function buildSearchContextKey({ game, query, filters }: SearchContextInput): string {
	const mode = query.length < 2 ? 'browse' : 'search';
	return JSON.stringify({
		game,
		mode,
		query,
		filters: [...filters].sort()
	});
}
