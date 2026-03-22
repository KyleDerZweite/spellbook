import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchCards, searchPrintings } from '$lib/search/meilisearch';

// Mock the meilisearch module
vi.mock('meilisearch', () => {
  const mockSearch = vi.fn();
  const mockIndex = vi.fn(() => ({ search: mockSearch }));
  return {
    MeiliSearch: vi.fn(() => ({ index: mockIndex })),
    __mockSearch: mockSearch,
    __mockIndex: mockIndex,
  };
});

describe('searchCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty query', async () => {
    const result = await searchCards('');
    expect(result.hits).toEqual([]);
  });

  it('returns empty array for single-char query', async () => {
    const result = await searchCards('a');
    expect(result.hits).toEqual([]);
  });
});

describe('searchPrintings', () => {
  it('returns empty array for empty oracle_id', async () => {
    const result = await searchPrintings('');
    expect(result.hits).toEqual([]);
  });
});
