# MeiliSearch Tasks

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: worker upload flow changes, task wait behavior changes, sync marker changes
- Related Docs: [MeiliSearch Overview](./README.md), [Worker Architecture](../../architecture/worker.md)

MeiliSearch write operations are asynchronous. Spellbook currently relies on task completion during worker-driven indexing.

## Current Spellbook Task Usage

The Python worker:

1. uploads transformed MTG documents to `cards_distinct` in batches
2. uploads the same documents to `cards_all` in batches
3. collects every returned task UID
4. waits for each task to complete before considering the sync successful
