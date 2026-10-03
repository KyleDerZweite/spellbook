import type {
	CatalogFilters,
	CatalogSearchRequest,
	FacetResponse,
	Game,
	SearchResult
} from './types.ts';

const CATALOG_API = '/api/mobile/v1/mtg';

function ensureSupportedGame(game: Game = 'mtg'): void {
	if (game !== 'mtg') throw new Error(`${game.toUpperCase()} search is not available yet`);
}

async function requestCatalog(path: string, init: RequestInit): Promise<SearchResult> {
	const response = await fetch(`${CATALOG_API}${path}`, {
		credentials: 'same-origin',
		cache: 'no-store',
		...init
	});
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		const message = body && typeof body === 'object' && 'message' in body ? body.message : null;
		throw new Error(
			typeof message === 'string'
				? message
				: response.status === 401
					? 'Sign in to search the catalog.'
					: 'Catalog search failed. Try again.'
		);
	}
	return response.json();
}

function search(request: CatalogSearchRequest, signal?: AbortSignal): Promise<SearchResult> {
	return requestCatalog('/search', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request),
		signal
	});
}

export interface SearchOptions {
	game?: Game;
	filters?: CatalogFilters;
	limit?: number;
	offset?: number;
	sort?: CatalogSearchRequest['sort'];
	signal?: AbortSignal;
}

export async function searchCards(
	query: string,
	options: SearchOptions = {}
): Promise<SearchResult> {
	ensureSupportedGame(options.game);
	if (query.trim().length < 2) {
		return { hits: [], query, processingTimeMs: 0, estimatedTotalHits: 0 };
	}
	return search(
		{
			query: query.trim(),
			filters: options.filters,
			limit: options.limit ?? 20,
			offset: options.offset ?? 0,
			sort: options.sort
		},
		options.signal
	);
}

export async function browseCards(options: SearchOptions = {}): Promise<SearchResult> {
	ensureSupportedGame(options.game);
	return search(
		{
			query: '',
			filters: options.filters,
			limit: options.limit ?? 50,
			offset: options.offset ?? 0,
			sort: options.sort ?? 'name:asc'
		},
		options.signal
	);
}

export async function getFacets(
	filters?: CatalogFilters,
	signal?: AbortSignal
): Promise<FacetResponse> {
	const result = await search({ query: '', filters, limit: 0, facets: true }, signal);
	return result.facets ?? { colors: {}, rarity: {}, set_code: {} };
}

/** Card detail needs all printings; the API caps each page at 100. */
export async function searchPrintings(
	oracleId: string,
	options: { game?: Game; limit?: number; signal?: AbortSignal } = {}
): Promise<SearchResult> {
	ensureSupportedGame(options.game);
	const result: SearchResult = { hits: [], query: '', processingTimeMs: 0, estimatedTotalHits: 0 };
	if (!oracleId) return result;
	const limit = Math.min(options.limit ?? 1000, 1000);
	while (result.hits.length < limit) {
		const page = await requestCatalog(
			`/cards/${encodeURIComponent(oracleId)}/printings?limit=${Math.min(100, limit - result.hits.length)}&offset=${result.hits.length}`,
			{ signal: options.signal }
		);
		if (result.hits.length && page.generationId !== result.generationId) {
			throw new Error('The catalog changed while loading printings. Reopen the card to try again.');
		}
		result.hits.push(...page.hits);
		result.estimatedTotalHits = page.estimatedTotalHits;
		result.processingTimeMs += page.processingTimeMs ?? 0;
		result.generationId = page.generationId;
		if (!page.hits.length || result.hits.length >= page.estimatedTotalHits) break;
	}
	return result;
}

export async function getSetCatalogSize(setCode: string, game: Game = 'mtg'): Promise<number> {
	ensureSupportedGame(game);
	if (!setCode.trim()) return 0;
	const result = await search({
		query: '',
		filters: { sets: [setCode.trim().toLowerCase()] },
		limit: 0
	});
	return result.estimatedTotalHits;
}
