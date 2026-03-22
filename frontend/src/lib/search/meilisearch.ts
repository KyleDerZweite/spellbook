import { MeiliSearch } from 'meilisearch';
import {
  PUBLIC_MEILISEARCH_URL,
  PUBLIC_MEILISEARCH_SEARCH_KEY,
} from '$env/static/public';
import type { CardDocument, SearchResult } from './types';

const client = new MeiliSearch({
  host: PUBLIC_MEILISEARCH_URL,
  apiKey: PUBLIC_MEILISEARCH_SEARCH_KEY,
});

const distinctIndex = client.index('cards_distinct');
const allIndex = client.index('cards_all');

export async function searchCards(
  query: string,
  options?: { filter?: string[]; limit?: number; offset?: number },
): Promise<SearchResult> {
  if (!query || query.length < 2) {
    return { hits: [], query, processingTimeMs: 0 };
  }
  const result = await distinctIndex.search<CardDocument>(query, {
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
  const result = await allIndex.search<CardDocument>('', {
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
