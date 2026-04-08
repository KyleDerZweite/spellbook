# MeiliSearch Indexes and Settings

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: index setting changes, filterable attribute changes, sortability changes, distinct behavior changes
- Related Docs: [MeiliSearch Overview](./README.md), [Search API](./search-api.md), [Worker Architecture](../../architecture/worker.md)

This document records the current Spellbook index setup.

## Indexes

### `cards_distinct`

- primary key: `id`
- distinct attribute: `oracle_id`
- purpose: primary MTG search

### `cards_all`

- primary key: `id`
- no distinct attribute
- purpose: printing lookup
- pagination max total hits: `5000`
