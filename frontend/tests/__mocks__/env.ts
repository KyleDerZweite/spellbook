// Mock for $env/static/public (if still used anywhere)
export const PUBLIC_MEILISEARCH_URL = 'http://localhost:7700';
export const PUBLIC_MEILISEARCH_SEARCH_KEY = 'test-key';
export const PUBLIC_SPACETIMEDB_URL = 'ws://localhost:3000';
export const PUBLIC_SPACETIMEDB_MODULE = 'spellbook';

// Mock for $env/dynamic/public
export const env = {
  PUBLIC_MEILISEARCH_URL: 'http://localhost:7700',
  PUBLIC_MEILISEARCH_SEARCH_KEY: 'test-key',
  PUBLIC_SPACETIMEDB_URL: 'ws://localhost:3000',
  PUBLIC_SPACETIMEDB_MODULE: 'spellbook',
};
