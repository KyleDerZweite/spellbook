# MeiliSearch Tasks

MeiliSearch write operations are asynchronous. Spellbook currently relies on task completion during worker-driven indexing.

## Current Spellbook Task Usage

The Python worker:

1. uploads transformed MTG documents to `cards_distinct` in batches
2. uploads the same documents to `cards_all` in batches
3. collects every returned task UID
4. waits for each task to complete before considering the sync successful

This behavior currently lives in `worker/src/worker/indexer.py`.

## Why Spellbook Waits

Spellbook waits for task completion so that:

- the initial seed is fully usable before the worker reports success
- the persisted sync state is only updated after successful indexing
- partial sync success does not get recorded as complete

## Current Operational Pattern

### Configure indexes

- create `cards_distinct`
- create `cards_all`
- update settings for both

### Seed or refresh data

- upload batches to both indexes
- wait for all returned task UIDs

### Persist sync markers

- only after successful completion, store the latest Scryfall `updated_at` marker

## Health Check vs Task Completion

Spellbook uses both:

- MeiliSearch health checks before startup work begins
- task waits after uploads are enqueued

Health means the service is reachable.

Task completion means the indexing work itself is done.
