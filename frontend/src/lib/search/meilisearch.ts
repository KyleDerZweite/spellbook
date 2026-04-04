import { MeiliSearch, type Index } from 'meilisearch';
import { env } from '$env/dynamic/public';
import type { CardDocument, FacetResponse, Game, SearchResult } from './types';

let client: MeiliSearch | null = null;
let distinctIndex: Index<CardDocument>;
let allIndex: Index<CardDocument>;
const DEFAULT_GAME: Game = 'mtg';

/**
 * Initialize the MeiliSearch client with the search API key.
 * Must be called once before any search functions are used.
 */
export function initMeiliSearch(searchKey: string): void {
	client = new MeiliSearch({
		host: env.PUBLIC_MEILISEARCH_URL,
		apiKey: searchKey
	});
	distinctIndex = client.index<CardDocument>('cards_distinct');
	allIndex = client.index<CardDocument>('cards_all');

	// Pre-warm: fire a no-op query on each index so the HTTP connection
	// and MeiliSearch caches are hot before the user's first real search.
	distinctIndex.search('', { limit: 1 }).catch(() => {});
	allIndex.search('', { limit: 1 }).catch(() => {});
}

function ensureClient(): void {
	if (!client) throw new Error('MeiliSearch not initialized — call initMeiliSearch() first');
}

function ensureSupportedGame(game: Game): void {
	if (game !== 'mtg') {
		throw new Error(`${game.toUpperCase()} search is not available yet`);
	}
}

export interface SearchOptions {
	game?: Game;
	filter?: string[];
	limit?: number;
	offset?: number;
	sort?: string[];
}

/**
 * Search cards by name using the distinct index (one result per unique card).
 * Returns empty for queries shorter than 2 characters.
 */
export async function searchCards(
	query: string,
	options: SearchOptions = {}
): Promise<SearchResult> {
	ensureClient();
	ensureSupportedGame(options.game ?? DEFAULT_GAME);
	if (!query || query.length < 2) {
		return { hits: [], query, processingTimeMs: 0, estimatedTotalHits: 0 };
	}

	const result = await distinctIndex.search(query, {
		limit: options.limit ?? 20,
		offset: options.offset ?? 0,
		filter: options.filter,
		sort: options.sort
	});

	return {
		hits: result.hits as CardDocument[],
		query: result.query ?? query,
		processingTimeMs: result.processingTimeMs ?? 0,
		estimatedTotalHits: result.estimatedTotalHits ?? 0
	};
}

/**
 * Browse all cards with no query (empty string), sorted alphabetically.
 * Used for initial page load and browse mode.
 */
export async function browseCards(options: SearchOptions = {}): Promise<SearchResult> {
	ensureClient();
	ensureSupportedGame(options.game ?? DEFAULT_GAME);
	const result = await distinctIndex.search('', {
		limit: options.limit ?? 50,
		offset: options.offset ?? 0,
		filter: options.filter,
		sort: options.sort ?? ['name:asc']
	});

	return {
		hits: result.hits as CardDocument[],
		query: '',
		processingTimeMs: result.processingTimeMs ?? 0,
		estimatedTotalHits: result.estimatedTotalHits ?? 0
	};
}

/**
 * Fetch facet distribution counts for colors, rarity, and set_code.
 * Uses limit: 0 so no documents are returned -- only facet data.
 */
export async function getFacets(filter?: string[]): Promise<FacetResponse> {
	ensureClient();
	const result = await distinctIndex.search('', {
		limit: 0,
		filter,
		facets: ['colors', 'rarity', 'set_code']
	});

	const dist = (result.facetDistribution ?? {}) as Record<string, Record<string, number>>;
	return {
		colors: dist['colors'] ?? {},
		rarity: dist['rarity'] ?? {},
		set_code: dist['set_code'] ?? {}
	};
}

/**
 * Search all printings of a card by oracle_id.
 * Returns empty for blank oracle_id.
 */
export async function searchPrintings(
	oracleId: string,
	options: { game?: Game; limit?: number; sort?: string[] } = {}
): Promise<SearchResult> {
	ensureClient();
	ensureSupportedGame(options.game ?? DEFAULT_GAME);
	if (!oracleId) {
		return { hits: [], query: '', processingTimeMs: 0, estimatedTotalHits: 0 };
	}

	const result = await allIndex.search('', {
		filter: [`oracle_id = "${oracleId}"`],
		sort: options.sort ?? ['set_code:asc'],
		limit: options.limit ?? 1000
	});

	return {
		hits: result.hits as CardDocument[],
		query: result.query ?? '',
		processingTimeMs: result.processingTimeMs ?? 0,
		estimatedTotalHits: result.estimatedTotalHits ?? 0
	};
}

export async function getSetCatalogSize(
	setCode: string,
	game: Game = DEFAULT_GAME
): Promise<number> {
	ensureClient();
	ensureSupportedGame(game);

	if (!setCode) {
		return 0;
	}

	const result = await allIndex.search('', {
		limit: 0,
		filter: [`set_code = "${setCode}"`],
		distinct: 'oracle_id'
	} as never);

	return (result as { estimatedTotalHits?: number }).estimatedTotalHits ?? 0;
}
