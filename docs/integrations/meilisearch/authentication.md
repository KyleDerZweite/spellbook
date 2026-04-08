# MeiliSearch Authentication

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: search-key handling changes, env var changes, frontend server auth changes
- Related Docs: [MeiliSearch Overview](./README.md), [Deployment](../../operations/deployment.md), [Auth Architecture](../../architecture/auth.md)

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
