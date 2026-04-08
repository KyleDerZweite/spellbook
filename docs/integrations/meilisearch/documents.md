# MeiliSearch Documents

- Status: Canonical
- Last Reviewed: 2026-04-08
- Source of Truth: code
- Update Triggers: worker transform changes, primary key changes, stored field changes
- Related Docs: [MeiliSearch Overview](./README.md), [Indexes and Settings](./indexes-and-settings.md), [Worker Architecture](../../architecture/worker.md)

This document describes the current Spellbook document shape and ingestion rules.

## Primary Key

Both current Spellbook indexes use `id` as the primary key.

In Spellbook, `id` is the Scryfall card printing ID.

## Current Ingestion Rules

- tokens and other non-game layouts are skipped
- documents without `id` or `oracle_id` are skipped
- documents are sorted by `released_at` descending before upload
- the same transformed document set is uploaded to both `cards_distinct` and `cards_all`
