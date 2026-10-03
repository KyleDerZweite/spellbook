# Backend language and hosted performance

- Status: Canonical
- Last Reviewed: 2026-10-03
- Source of Truth: code and primary documentation
- Update Triggers: backend service boundaries, runtime changes, measured performance limits, hosted deployment requirements, scan model selection
- Related Docs: [System overview](./system-overview.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Mobile and scan](./mobile-and-scan.md), [Deployment](../operations/deployment.md)

Retain SvelteKit for application requests and Postgres access. Retain Python for catalog ingestion and the isolated scan-processing service. No measured Spellbook bottleneck currently justifies a Go backend or a Python rewrite of application routes.

Go can be useful for a future service with measured CPU or concurrency limits. Python is the current choice for evaluating OCR and embedding models. Neither choice requires moving authentication, inventory, or deck transactions out of SvelteKit.

## Current code boundaries

| Boundary             | Implementation                                                                                                          | Performance questions                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Application requests | SvelteKit server loads, actions, and API routes under `frontend/src/routes`                                             | Request CPU, rendering, serialization, database and search wait time      |
| Owned data           | Drizzle repositories under `frontend/src/lib/server/data`, with a `pg` pool in `frontend/src/lib/server/db/client.ts`   | Query plans, rows returned, locks, connection waits, transaction duration |
| Catalog lookup       | MeiliSearch accessed by the frontend and server                                                                         | Index size, filter cost, network latency, response size                   |
| Catalog ingestion    | Python package under `worker/src/worker`                                                                                | Download time, transformation CPU and memory, indexing and task waits     |
| Scan processing      | HTTP boundary in `frontend/src/lib/server/mobile/scan-worker.ts` and Python service under `scan-worker/src/scan_worker` | Upload, queue, preprocessing, inference, retrieval and review latency     |

The scan worker currently returns an empty `no_match` result with stub model versions. It does not provide OCR, embeddings, or production recognition. Model-library comparisons below describe candidates for that service, not installed capabilities.

Application authentication remains owned by the frontend server. Its credentials and session policy belong in [Auth](./auth.md); the language choice does not prescribe an identity provider.

## What each runtime changes

SvelteKit's [Node adapter](https://svelte.dev/docs/kit/adapter-node) produces a standalone Node server. Node supports concurrent asynchronous I/O, but long JavaScript callbacks block the event loop. The [Node event-loop guide](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) explains this limitation. Large parsing, serialization, and synchronous computation therefore need measurement even when handlers use `async`.

[Node worker threads](https://nodejs.org/api/worker_threads.html) can isolate CPU-intensive JavaScript. The Node documentation explicitly distinguishes this use from I/O work, for which built-in asynchronous operations are generally more appropriate. Additional workers or application replicas also need a shared database connection budget.

[Go goroutines](https://go.dev/doc/faq#goroutines) multiplex concurrent work onto operating-system threads. Go can execute CPU work across cores within one process. Its runtime still has allocation and garbage-collection costs. The [Go garbage-collector guide](https://go.dev/doc/gc-guide) documents the CPU and memory tradeoff and the soft memory limit. These mechanisms provide useful controls, not a measured throughput advantage for Spellbook.

A Go handler does not make the same Postgres query, lock wait, MeiliSearch request, or object-storage transfer inherently faster. It could reduce application CPU or memory for a specific workload. A comparison must distinguish those savings from external-service waits and from changes to query shape, caching, or algorithms.

Python's [threading documentation](https://docs.python.org/3/library/threading.html) explains that conventional CPython builds serialize Python bytecode execution through the GIL. Processes can provide CPU parallelism; supported free-threaded builds have different constraints. These details do not imply that native tensor operations or GPU kernels execute as Python bytecode.

Python suits model evaluation because supported libraries expose model loading, preprocessing, tensor operations, and hardware execution. [PyTorch's CUDA documentation](https://github.com/pytorch/pytorch/blob/main/docs/source/notes/cuda.md) describes asynchronous GPU execution. [TensorFlow](https://www.tensorflow.org/guide/gpu) supports CPU and GPU operations. [ONNX Runtime](https://onnxruntime.ai/docs/get-started/with-python.html) provides Python inference packages, with [execution providers](https://onnxruntime.ai/docs/execution-providers/) for different hardware. Select a framework only after choosing and testing a model. Do not install all three by default.

Inference latency depends on the model, image size, preprocessing, hardware, batching, and transfer costs. Moving the HTTP handler to Go would leave these costs unless the inference implementation also changed. Keep model execution outside interactive inventory and deck requests so it can receive separate resource limits and scaling.

## Benchmarks before a language change

The following is a proposed measurement plan. No latency, throughput, concurrency limit, or hosting-cost result has been established by this review. Set service objectives and an expected traffic mix before choosing pass thresholds.

Run production builds on recorded CPU, memory, storage, and network configurations. Fix the application revision, dependency locks, database snapshot, catalog snapshot, and resource limits. Use separate load-generation capacity. Measure cold starts separately from warm steady-state runs, and repeat runs to expose variance.

| Workload                   | Proposed cases                                                                                                    | Measurements                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Inventory and deck reads   | Accounts with 1,000, 10,000, and 100,000 inventory entries; small and large decklists                             | p50/p95/p99 latency, rows and bytes returned, query time, pool wait, request CPU                 |
| Inventory and deck writes  | Single updates and batches within supported request limits; concurrent updates to the same and different accounts | Transaction and lock time, conflicts, throughput, rollback correctness, idempotent retry results |
| Deck availability          | Repeated canonical cards across roles and printings through the implemented availability endpoint                 | Computation time, query count, allocation correctness, event-loop delay                          |
| Catalog search and imports | Name and printing queries, representative filters, large lists within request limits                              | MeiliSearch latency, resolution request count, parsing time, payload size, memory                |
| Catalog ingestion          | Fixed bulk snapshot, full rebuild and unchanged-snapshot run                                                      | Download, transform, indexing and swap time separately; peak memory                              |
| Scan inference             | A labeled image set, fixed model and hardware, cold and warm model, selected batch sizes                          | Accuracy, upload and queue time, preprocessing, inference, retrieval, peak RAM/VRAM              |

Increase concurrent clients in recorded steps until latency objectives or error limits fail. Report successful requests per second together with tail latency and errors. Include a sustained run to detect memory growth and queue buildup. Do not infer hosted capacity from a trivial health endpoint.

Instrument application CPU and memory, database query and pool waits, search latency, and external calls. Node's [performance APIs](https://nodejs.org/api/perf_hooks.html) expose event-loop delay and utilization. For asynchronous GPU work, use the framework's synchronization or timing events, as described in the PyTorch documentation, so measurements include completed computation.

If application CPU dominates after query and algorithm fixes, compare the smallest affected function or service with an equivalent Go implementation. Preserve validation, authentication, transaction behavior, outputs, datasets, and resource limits. Include serialization and network overhead if extraction adds an HTTP boundary. Record development and operational costs alongside runtime results.

## Requirements for a hosted service

These are deployment acceptance requirements, not a claim that the current self-hosted deployment meets them:

- Verify account isolation in every query, mutation, artifact access, and background job. Test concurrent requests from different accounts.
- Define latency and availability objectives, expected account sizes, traffic limits, and resource budgets. Track errors and saturation before scaling.
- Bound request sizes, batch sizes, upload sizes, processing time, and queued work. Apply rate limits and cancellation where clients can exhaust shared capacity.
- Budget Postgres connections across all replicas and workers. Measure lock contention and query plans before adding application replicas.
- Keep shared sessions, durable state, and retained artifacts usable across replicas. Test readiness, graceful shutdown, and migrations during deployment.
- Run expensive scan work with separate CPU/GPU limits. If processing outlives an HTTP request, add a durable job lifecycle with bounded retries and recovery before offering that workflow.
- Verify backups, restore procedures, retention, and removal of account-owned data. Keep secrets in protected deployment configuration.

Go becomes a candidate when an identified service misses its objective because of application runtime cost and a representative prototype improves that objective enough to justify another service. Python remains the candidate for model work when its supported libraries meet the model and hardware requirements. Neither future hosting nor ML work alone requires a general backend rewrite.

All external sources above were reviewed on 2026-10-03. They describe runtime mechanisms and supported capabilities, not comparative Spellbook benchmark results.
