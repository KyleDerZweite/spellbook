import { MeiliSearch } from 'meilisearch';
import {
	PUBLIC_MEILISEARCH_URL,
	PUBLIC_MEILISEARCH_SEARCH_KEY
} from '$env/static/public';
import type { CardDocument, SearchResult } from './types';

const client = new MeiliSearch({
	host: PUBLIC_MEILISEARCH_URL,
	apiKey: PUBLIC_MEILISEARCH_SEARCH_KEY
});

const distinctIndex = client.index<CardDocument>('cards_distinct');
const allIndex = client.index<CardDocument>('cards_all');

export interface SearchOptions {
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
 * Search all printings of a card by oracle_id.
 * Returns empty for blank oracle_id.
 */
export async function searchPrintings(
	oracleId: string,
	options: { limit?: number; sort?: string[] } = {}
): Promise<SearchResult> {
	if (!oracleId) {
		return { hits: [], query: '', processingTimeMs: 0, estimatedTotalHits: 0 };
	}

	const result = await allIndex.search('', {
		filter: [`oracle_id = "${oracleId}"`],
		sort: options.sort ?? ['set_code:asc'],
		limit: options.limit ?? 100
	});

	return {
		hits: result.hits as CardDocument[],
		query: result.query ?? '',
		processingTimeMs: result.processingTimeMs ?? 0,
		estimatedTotalHits: result.estimatedTotalHits ?? 0
	};
}
