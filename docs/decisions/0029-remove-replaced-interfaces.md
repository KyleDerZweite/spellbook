# ADR-0029: Remove replaced interfaces immediately

- Status: Accepted
- Date: 2026-10-24
- Last Reviewed: 2026-10-24
- Owners: Kyle
- Source of Truth: Kyle's selected removal policy on 2026-10-24
- Update Triggers: interface replacement, API removal and client upgrade requirements
- Related Docs: [Contribution policy](../../CONTRIBUTING.md#replacing-interfaces), [Independent applications](../architecture/independent-applications.md), [ADR-0028](./0028-versioned-game-api.md), [Migration contract](../architecture/python-backend-migration.md)

Spellbook prioritizes a small current implementation and fast changes over support for older clients.
Replace interfaces and update first-party callers in the same change, then delete superseded code, routes, compatibility adapters, tests and documentation.
There is no deprecation window or automatic requirement to support older releases.
Users of older clients must update; an API path version does not promise parallel support for earlier releases.
The contribution policy owns this workflow.

This decision supersedes ADR-0028's legacy API aliases and the migration requirement to keep the previous HTTP paths available.
The API serves only the current canonical `/api/v1/...` routes and unchanged Discovery.
Removed API paths return 404 without redirects or alternate dispatch.
The replaced flat browser routes `/search`, `/inventory`, `/decks`, `/scan` and `/collections` are removed with their compatibility redirects.
The active `/mtg` index still selects `/mtg/search`; authentication redirects and current guide entrypoints retain their purpose.
Web and Android use current paths, and Android no longer treats old mutation paths as supported retries.
OpenAPI defines the current route inventory; obsolete Node route inventories, transfer maps and dual-runtime HTTP comparison runners are removed.
Useful parsing, authorization, receipt and integration tests continue against current interfaces.

This interface policy does not authorize deleting user data, rewriting SQL history, merging the candidate or deploying it.
Stored receipts and current-request retry semantics retain their existing owners.
