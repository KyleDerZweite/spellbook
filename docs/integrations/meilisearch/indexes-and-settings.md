# MeiliSearch Indexes and Settings

- Status: Canonical
- Last Reviewed: 2026-05-18
- Source of Truth: code
- Update Triggers: index setting changes, filterable attribute changes, sortability changes, distinct behavior changes
- Related Docs: [MeiliSearch Overview](./README.md), [Search API](./search-api.md), [Worker Architecture](../../architecture/worker.md)

This document records the current Spellbook index setup.

## Indexes

### `cards_distinct`

- primary key: `id`
- distinct attribute: `oracle_id`
- purpose: primary MTG search and name-only import resolution

### `cards_all`

- primary key: `id`
- no distinct attribute
- purpose: printing lookup and set plus collector-number import resolution
- pagination max total hits: `5000`

## Import Resolver Fields

Both live indexes expose these filterable attributes for import resolution:

- `normalized_name`
- `collector_number`
- `oracle_id`
- `set_code`
- legality fields under `legalities`

`cards_distinct` keeps `oracle_id` as the distinct attribute so name-only imports resolve to the default catalog printing. `cards_all` keeps every printing so exact imports can resolve by set code, collector number, and normalized name.

## Staging Indexes

The worker reindexes into `cards_distinct_next` and `cards_all_next`, waits for MeiliSearch tasks to complete, swaps staging with live indexes atomically, then deletes the old data now held by the `_next` names.
