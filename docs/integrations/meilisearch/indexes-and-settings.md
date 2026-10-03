# MeiliSearch indexes and settings

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code
- Update Triggers: index setting changes, filterable attribute changes, sortability changes, distinct behavior changes
- Related Docs: [MeiliSearch Overview](./README.md), [Search API](./search-api.md), [Worker Architecture](../../architecture/worker.md), [Task handling](./tasks.md)

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

## Import resolver fields

Both live indexes expose these filterable attributes for import resolution:

- `normalized_name`
- `collector_number`
- `oracle_id`
- `set_code`
- legality fields under `legalities`

`cards_distinct` keeps `oracle_id` as the distinct attribute so name-only imports resolve to a representative catalog printing. `cards_all` keeps every printing so exact imports can resolve by set code, collector number, and normalized name.

## Searchable fields and staging

Both indexes search `name`, `printed_name`, `type_line`, `oracle_text`, and `set_name`, in that order. The localized field also includes printed multi-face names. Distinct search does not promise the newest printing or a preferred language; explicit printing selection uses `cards_all`.

The staging indexes use the same settings as their live counterparts. [Task handling](./tasks.md) owns their creation, swap, and cleanup sequence.
