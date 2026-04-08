# ADR-0001: Docs-First Knowledge System

- Status: Accepted
- Date: 2026-04-08
- Owners: Spellbook maintainers
- Related Docs: [Docs Index](../README.md), [Product Docs](../product/README.md), [Architecture Docs](../architecture/README.md)

## Context

Spellbook accumulated a growing pile of markdown files, but not yet enough durable knowledge to justify a separate repo-local wiki or a heavier LLM-managed knowledge pipeline.

The project needs:

- a clearer docs structure
- a place for durable decisions
- stronger maintenance expectations for contributors and agents

## Decision

Spellbook will use a docs-first knowledge system.

This means:

- `docs/` remains the primary in-repo knowledge surface
- canonical docs are organized into typed sections
- major decisions are recorded in `docs/decisions/`
- superseded docs are removed from the active tree and remain recoverable through git history
- maintenance is process-based, not automation-heavy
- plain markdown remains the required format

## Consequences

Positive:

- easier discovery of active docs
- less drift between code and docs
- durable decision memory without introducing a separate wiki
- no parallel archive tree competing with canonical docs

Tradeoffs:

- contributors must spend more effort on doc classification
- some topics will require both canonical doc updates and ADR updates

## Follow-Up

- keep section indexes current
- add ADRs for future structural decisions
- revisit a separate wiki only if project knowledge outgrows this docs-first model

## References

- [Docs Index](../README.md)
