# MeiliSearch Tasks

- Status: Canonical
- Last Reviewed: 2026-05-18
- Source of Truth: code
- Update Triggers: worker upload flow changes, task wait behavior changes, sync marker changes
- Related Docs: [MeiliSearch Overview](./README.md), [Worker Architecture](../../architecture/worker.md)

MeiliSearch write operations are asynchronous. Spellbook currently relies on task completion during worker-driven indexing.

## Current Spellbook Task Usage

The Python worker:

1. creates fresh `cards_distinct_next` and `cards_all_next` staging indexes
2. applies index settings to the staging indexes
3. uploads transformed MTG documents to both staging indexes in batches
4. collects every returned task UID
5. waits for each upload task to complete
6. swaps `cards_distinct_next` with `cards_distinct` and `cards_all_next` with `cards_all`
7. waits for the swap task to complete
8. deletes the old data now held under the `_next` names
9. persists Scryfall sync timestamps only after the swap succeeds
