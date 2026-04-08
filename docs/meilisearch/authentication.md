# MeiliSearch Authentication

This document describes how Spellbook currently authenticates MeiliSearch access.

## Server-Side Admin Access

Spellbook uses `MEILI_MASTER_KEY` on the server side for administrative access.

Current server-side uses:

- the Python worker configures indexes and uploads documents
- the SvelteKit server lists keys and retrieves the default search-only key

## Browser Access

The browser uses a search-only key.

Current Spellbook behavior:

1. the frontend server calls MeiliSearch internally using `MEILI_MASTER_KEY`
2. it finds the default search-only key by listing keys
3. it caches that key in the server process
4. it passes the key to authenticated sessions
5. the browser initializes the MeiliSearch client with that key

This is implemented in `frontend/src/hooks.server.ts` and `frontend/src/lib/search/meilisearch.ts`.

## Operator Guidance

For the current app:

- configure `MEILI_MASTER_KEY`
- configure `MEILISEARCH_INTERNAL_URL`
- configure `PUBLIC_MEILISEARCH_URL`

Do not rely on `PUBLIC_MEILISEARCH_SEARCH_KEY` as the canonical current setup in repo docs.

## Key Expectations

The runtime logic expects a search-only key to exist in MeiliSearch.

It looks for:

- a key named `Default Search API Key`, or
- a key with exactly one action, `search`

## Security Notes

- `MEILI_MASTER_KEY` must never be exposed to the browser
- the search-only key is intentionally browser-safe because it grants read-only search access to public catalog data
- user data does not live in MeiliSearch

## Example Compose Variables

```env
MEILI_MASTER_KEY=replace-me
MEILISEARCH_INTERNAL_URL=http://meilisearch:7700
PUBLIC_MEILISEARCH_URL=https://spellbook-search.example.com
```
