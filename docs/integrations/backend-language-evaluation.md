# Backend language and worker layout evaluation

- Status: Python and migration contract accepted, implementation not started
- Last Reviewed: 2026-10-20
- Source of Truth: current implementation and linked primary-source research
- Update Triggers: Python API/worker language selection and migration planning, backend language selection, worker ownership, schema generation, representative measurements
- Related Docs: [Independent applications](../architecture/independent-applications.md), [Application contract](../architecture/application-contract.md), [Worker](../architecture/worker.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Verification](../operations/github-automation.md), [Decision issue 211](https://github.com/KyleDerZweite/spellbook/issues/211), [Python direction](../decisions/0025-python-api-and-workers.md)

## Selected direction

The maintainer selected Python for both the future HTTP API and server workers in [ADR-0025](../decisions/0025-python-api-and-workers.md).
The new constraint is one server language, choosing between Go and Python.
Python retains the existing workers; Go for both would also require porting or replacing them.
This maintenance tradeoff supersedes the earlier Go-API/Python-worker recommendation.
[Issue 211](https://github.com/KyleDerZweite/spellbook/issues/211) records the migration design discussion.
The [accepted migration contract](../architecture/python-backend-migration.md) and [ADR-0026](../decisions/0026-python-migration-contract.md) select FastAPI/Uvicorn, Psycopg, ownership, staged delivery and rollback after independent review.

The baseline is the independent TypeScript/Node API, SvelteKit website and Kotlin/Compose app.
Catalog ingestion already uses Python; the Scan worker returns `no_match` and implements no recognition.
No measured API capacity failure establishes a need to rewrite.

## Tradeoffs for Spellbook

| Candidate                              | Useful properties                                                                                                 | Cost or limitation                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/Node                        | Existing use cases, tests, Drizzle queries and shared validators; retaining it avoids a port.                     | TypeScript types do not validate network input. CPU work needs isolation from the event loop. It does not meet the maintainer's preferred long-term language direction. |
| Go                                     | Compiled service, standard HTTP streaming and request contexts, goroutines for concurrent I/O and multicore work. | A Go-only target also needs a worker port. Domain logic, SQL adapters and validators need porting. Cancellation, limits and transaction cleanup remain explicit.        |
| Python                                 | Existing worker expertise, FastAPI/Psycopg ecosystem, proximity to scientific tooling.                            | Blocking calls in async handlers block progress; CPU-heavy Python needs deliberate isolation. Multiple server processes multiply pools, listeners and memory.           |
| Rust, excluded from the current choice | Safe Rust checks memory access and thread sharing; axum/Tokio and SQLx support typed concurrent services.         | Ownership, cancellation and build/schema tooling add learning and maintenance work. Memory safety does not bound queues or prove business correctness.                  |

[Node's event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) applies to the current baseline.
[Go HTTP](https://pkg.go.dev/net/http#ResponseController) and [goroutines](https://go.dev/doc/effective_go#goroutines) suit the extracted service boundary.
Goroutines do not replace durable jobs with leases, fencing and retries; [pgx transactions](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Begin) still require explicit rollback.
[FastAPI](https://fastapi.tiangolo.com/async/) distinguishes asynchronous waiting from blocking work.
Optional [free-threaded Python](https://docs.python.org/3/howto/free-threading-python.html) requires compatible extensions and synchronization, rather than automatically solving CPU scaling.
[Python server processes](https://fastapi.tiangolo.com/deployment/server-workers/) replicate memory and resources; [Rust's Send/Sync checks](https://doc.rust-lang.org/book/ch16-04-extensible-concurrency-sync-and-send.html) constrain thread sharing.
[Tokio cancellation](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety) and [SQLx query checks](https://docs.rs/sqlx/latest/sqlx/macro.query.html) require deliberate use; neither verifies authorization or lock order.

## Accepted ownership

Group the Python API and server workers under `backend/` as selected in ADR-0025.
The [migration contract](../architecture/python-backend-migration.md#framework-modules-and-resources) owns the accepted package layout, including shared application/SQL modules and separate state runners.
Its API and existing worker destinations are:

```text
backend/
  api/
  workers/
    catalog/   # Python ingestion/publication
    scan/      # Python compatibility scaffold
```

This is the accepted destination, not the current layout.
Keep separate packages, environments, images and process lifetimes.
Do not move bulk ingestion into HTTP request tasks.
Phone/Jetson recognition remains local under ADR-0023; Python tooling does not select server inference.

## Migration gates

Retain one schema/migration owner and SQL history, one owner per mutation, atomic original receipts/fingerprints, lock order, conflict fields, QR/session authority and bounded SSE revalidation/shutdown.
Preserve safe integers, decimal/revision strings, absent versus null fields and form throttling before decoding.
OpenAPI and executable compatibility fixtures must become language-neutral; `contracts/` also contains pure TypeScript validators/presentation helpers that cannot simply be imported into another language.
Generated TypeScript/Kotlin clients require compatibility tests.

After grilling criteria and explicitly authorizing an experiment, compare one bounded read, one receipt mutation/readback and SSE against Node using the same PostgreSQL data, SQL and limits.
Exercise lost responses, replay conflicts, QR races, revocation, rollback, slow consumers and native/enhanced web forms.
Measure p95/p99, RSS/CPU, connections, build/CI time and change effort.
Agree migration rejection criteria, staged ownership and rollback before preparing implementation tickets.
No prototype, rewrite, worker move or benchmark was performed for this research.
