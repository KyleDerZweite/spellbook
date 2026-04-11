import { Meilisearch } from 'meilisearch';
import { privateEnv } from '$lib/env/private';
import type { CardDocument } from '$lib/search/types';
import type { MobileSearchResponse } from './types';

let client: Meilisearch | null = null;

function getClient(): Meilisearch {
	if (client) {
		return client;
	}

	const host = privateEnv.MEILISEARCH_INTERNAL_URL ?? privateEnv.PUBLIC_MEILISEARCH_URL;
	const apiKey = privateEnv.MEILI_MASTER_KEY;
	if (!host || !apiKey) {
		throw new Error(
			'MeiliSearch mobile API requires MEILISEARCH_INTERNAL_URL/PUBLIC_MEILISEARCH_URL and MEILI_MASTER_KEY'
		);
	}

	client = new Meilisearch({
		host,
		apiKey
	});
	return client;
}

export async function searchCatalog(
	query: string,
	limit = 20,
	offset = 0
): Promise<MobileSearchResponse> {
	const trimmed = query.trim();
	const index = getClient().index<CardDocument>('cards_distinct');
	const result = await index.search(trimmed, {
		limit,
		offset,
		sort: trimmed.length < 2 ? ['name:asc'] : undefined
	});

	return {
		query: trimmed,
		hits: result.hits as CardDocument[],
		estimatedTotalHits: result.estimatedTotalHits ?? 0
	};
}

export async function getPrintings(oracleId: string, limit = 100): Promise<MobileSearchResponse> {
	const index = getClient().index<CardDocument>('cards_all');
	const result = await index.search('', {
		filter: [`oracle_id = "${oracleId}"`],
		sort: ['set_code:asc'],
		limit
	});

	return {
		query: '',
		hits: result.hits as CardDocument[],
		estimatedTotalHits: result.estimatedTotalHits ?? 0
	};
}
