# MeiliSearch authentication

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: search-key handling changes, env var changes, frontend server auth changes
- Related Docs: [MeiliSearch Overview](./README.md), [Deployment](../../operations/deployment.md), [Auth Architecture](../../architecture/auth.md)

The worker uses `MEILI_MASTER_KEY` to configure indexes and upload catalog documents. The frontend uses it to obtain the default search-only key from MeiliSearch's key API. These administrative credentials stay on the server.

[`hooks.server.ts`](../../../frontend/src/hooks.server.ts) caches the search-only key in the frontend process and passes it to authenticated browser sessions. The browser initializes its catalog client with that key. Restart the frontend after replacing the search key to clear the cached value.

[Deployment](../../operations/deployment.md#configuration) owns the internal URL, public URL, and secret configuration. The operator does not supply a separate `PUBLIC_MEILISEARCH_SEARCH_KEY`.
