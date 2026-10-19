# ADR-0025: Python for the API and server workers

- Status: Accepted
- Implementation: Migration not started
- Date: 2026-10-19
- Last Reviewed: 2026-10-19
- Owners: Kyle
- Source of Truth: maintainer-selected shared API/worker language
- Update Triggers: Python migration design, framework or schema ownership selection, worker relocation, parity evidence
- Related Docs: [Language evaluation](../integrations/backend-language-evaluation.md), [Independent applications](../architecture/independent-applications.md), [Worker](../architecture/worker.md), [ADR-0024](./0024-independent-applications.md), [ADR-0023](./0023-local-recognition-in-scanner-clients.md), [Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211)

## Context

The maintainer wants to replace backend TypeScript and use one language for both the HTTP API and server workers.
The remaining choices were Go and Python.
Catalog ingestion and the Scan compatibility scaffold already use Python.
A Go-only server would also require porting or replacing those worker implementations.
The earlier Go-API/Python-worker recommendation does not satisfy the shared-language requirement.

## Decision

Select Python as the target language for the API and server workers.
Keep Svelte/TypeScript for the website and Kotlin/Compose for Android.
Group server code under `backend/`; exact package layout and relocation steps belong to migration planning.

API and workers keep independent process lifetimes, resource budgets and deployment ownership.
Bulk ingestion and CPU work must not block the HTTP event loop.
The accepted phone/Jetson recognition placement in ADR-0023 remains unchanged.

This advances the language direction without replacing ADR-0024's independent application responsibilities.
The TypeScript API remains the implemented baseline until a reviewed migration preserves its contracts.
No framework, ORM, schema generator or migration schedule is selected here.

## Consequences

Python reuses the existing worker implementation and avoids a second server language.
The API still needs a deliberate port of domain behavior, SQL access, validation and resource lifetime.
Python requires explicit handling of blocking work, cancellation, bounded pools and streams.
The decision favors maintenance consistency; it does not claim a measured speed or memory improvement over Node or Go.

## Follow-up

[Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211) retains framework, language-neutral contracts, schema/migration ownership, staged delivery and rollback questions.
The [evaluation's migration gates](../integrations/backend-language-evaluation.md#migration-gates) define compatibility evidence to retain before replacing production behavior.
Implementation tickets remain unready until their responsibilities, interfaces and acceptance evidence are reviewed.
