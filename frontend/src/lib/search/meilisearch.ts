import { MeiliSearch } from 'meilisearch';
import { env } from '$env/dynamic/public';
import type { CardDocument, SearchResult } from './types';

let client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
  if (!client) {
    client = new MeiliSearch({
      host: env.PUBLIC_MEILISEARCH_URL!,
      apiKey: env.PUBLIC_MEILISEARCH_SEARCH_KEY,
    });
  }
  return client;
}

export async function searchCards(
  query: string,
  options?: { filter?: string[]; limit?: number; offset?: number },
): Promise<SearchResult> {
  if (!query || query.length < 2) {
    return { hits: [], query, processingTimeMs: 0 };
  }
  const result = await getClient().index('cards_distinct').search<CardDocument>(query, {
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
    filter: options?.filter,
  });
  return {
    hits: result.hits,
    query: result.query,
    processingTimeMs: result.processingTimeMs,
    estimatedTotalHits: result.estimatedTotalHits,
  };
}

export async function searchPrintings(oracleId: string): Promise<SearchResult> {
  if (!oracleId) {
    return { hits: [], query: '', processingTimeMs: 0 };
  }
  const result = await getClient().index('cards_all').search<CardDocument>('', {
    filter: [`oracle_id = "${oracleId}"`],
    limit: 100,
    sort: ['set_code:desc'],
  });
  return {
    hits: result.hits,
    query: '',
    processingTimeMs: result.processingTimeMs,
    estimatedTotalHits: result.estimatedTotalHits,
  };
}
