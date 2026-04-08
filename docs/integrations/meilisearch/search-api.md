# MeiliSearch Search API

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: query mode changes, filter changes, limit changes, browse-mode behavior changes
- Related Docs: [MeiliSearch Overview](./README.md), [Indexes and Settings](./indexes-and-settings.md), [Frontend Architecture](../../architecture/frontend.md)

This document describes how the current Spellbook frontend uses MeiliSearch.

## Current Search Modes

### Browse mode

Used when the query is shorter than 2 characters.

Current behavior:

- search `cards_distinct`
- empty query
- sort by `name:asc`
- apply active filters

### Distinct card search

Used when the query length is 2 or more characters.

Current behavior:

- search `cards_distinct`
- free-text query
- apply active filters
- paginate with `limit` and `offset`
