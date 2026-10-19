# Backend language and worker layout evaluation

- Status: Proposed, language and migration undecided
- Last Reviewed: 2026-10-19
- Source of Truth: current implementation and linked primary-source research
- Update Triggers: backend language selection, worker ownership, schema generation, representative measurements
- Related Docs: [Independent applications](../architecture/independent-applications.md), [Application contract](../architecture/application-contract.md), [Worker](../architecture/worker.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Verification](../operations/github-automation.md), [Decision issue 211](https://github.com/KyleDerZweite/spellbook/issues/211)

## Recommendation

Evaluate a Go API with Python workers first.
Prefer a Python API if shared Python expertise and maintenance outweigh introducing Go.
Consider Rust when a specific resource or safety requirement justifies its ownership and async complexity.
This ranking is an engineering judgment, not a benchmark result or accepted migration.
The maintainer wants to replace backend TypeScript long term; language and schedule remain open in [issue 211](https://github.com/KyleDerZweite/spellbook/issues/211).

The baseline is the independent TypeScript/Node API, SvelteKit website and Kotlin/Compose app.
Catalog ingestion already uses Python; the Scan worker returns `no_match` and implements no recognition.
No measured API capacity failure establishes a need to rewrite.

## Tradeoffs for Spellbook

| Candidate       | Useful properties                                                                                                 | Cost or limitation                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/Node | Existing use cases, tests, Drizzle queries and shared validators; retaining it avoids a port.                     | TypeScript types do not validate network input. CPU work needs isolation from the event loop. It does not meet the maintainer's preferred long-term language direction. |
| Go              | Compiled service, standard HTTP streaming and request contexts, goroutines for concurrent I/O and multicore work. | Adds a language beside Python; domain logic, SQL adapters and validators still need porting. Cancellation, limits and transaction cleanup remain explicit.              |
| Python          | Existing worker expertise, FastAPI/Psycopg ecosystem, proximity to scientific tooling.                            | Blocking calls in async handlers block progress; CPU-heavy Python needs deliberate isolation. Multiple server processes multiply pools, listeners and memory.           |
| Rust            | Safe Rust checks memory access and thread sharing; axum/Tokio and SQLx support typed concurrent services.         | Ownership, cancellation and build/schema tooling add learning and maintenance work. Memory safety does not bound queues or prove business correctness.                  |

[Node's event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) applies to the current baseline.
[Go HTTP](https://pkg.go.dev/net/http#ResponseController) and [goroutines](https://go.dev/doc/effective_go#goroutines) suit the extracted service boundary.
Goroutines do not replace durable jobs with leases, fencing and retries; [pgx transactions](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Begin) still require explicit rollback.
[FastAPI](https://fastapi.tiangolo.com/async/) distinguishes asynchronous waiting from blocking work.
Optional [free-threaded Python](https://docs.python.org/3/howto/free-threading-python.html) requires compatible extensions and synchronization, rather than automatically solving CPU scaling.
[Python server processes](https://fastapi.tiangolo.com/deployment/server-workers/) replicate memory and resources; [Rust's Send/Sync checks](https://doc.rust-lang.org/book/ch16-04-extensible-concurrency-sync-and-send.html) constrain thread sharing.
[Tokio cancellation](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety) and [SQLx query checks](https://docs.rs/sqlx/latest/sqlx/macro.query.html) require deliberate use; neither verifies authorization or lock order.

## Proposed ownership

Group server code under `backend/`, independently of language:

```text
backend/
  api/
  workers/
    catalog/   # Python ingestion/publication
    scan/      # Python compatibility scaffold
```

This is a proposed destination, not the current layout.
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
Agree rejection criteria, staged ownership and rollback before choosing a language or preparing implementation tickets.
No prototype, rewrite, worker move or benchmark was performed for this research.
