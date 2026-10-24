# System overview

- Status: Canonical
- Last Reviewed: 2026-10-23
- Source of Truth: code and explicitly marked design requirements
- Update Triggers: Python default activation and source contraction, Python API/worker language selection and migration planning, independent web/backend/Android deployment direction, same-origin PWA delivery and shared QR account-session API, service boundaries, application and operator resource ownership, topology, authentication, data ownership, runtime allocation, hosted capacity requirements, frontend/backend separation, cross-client synchronization and public reference publication, local recognition and client responsibilities, client feature parity, browser scanning and phone computation-host evaluation, proposed Python/OpenAPI and worker ownership evaluation
- Related Docs: [Architecture](./README.md), [Frontend](./frontend.md), [Postgres](./postgres.md), [Worker](./worker.md), [Auth](./auth.md), [Mobile and scan](./mobile-and-scan.md), [Android design handoff](../product/mobile-app-exploration.md), [Deployment](../operations/deployment.md), [Realtime backend evaluation](../integrations/realtime-backends.md), [ADR-0015](../decisions/0015-shared-backend-use-cases-and-client-contracts.md), [Accepted application contract](./application-contract.md), [Valuation](./valuation.md), [Category rules](./category-rules.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Independent applications](./independent-applications.md), [Backend language evaluation](../integrations/backend-language-evaluation.md), [Python direction](../decisions/0025-python-api-and-workers.md)

Spellbook has an independent SvelteKit web runtime and Python/FastAPI API.
The API owns Auth, Profile, Dashboard, Catalog, Inventory/Groups, Deck, Valuation, Scan and SavedState use cases.
PostgreSQL stores account-owned state and public reference publications.
Python workers retain ingestion and Scan scaffold responsibilities.
The first Kotlin/Compose Android slice is integrated; native target acceptance remains pending.

```text
Browser -> SvelteKit SSR/forms and same-origin proxy -> Python API -> Postgres
Android / API client -> Python API using a local session bearer token
Scryfall -> Python worker -> Postgres catalog generation -> atomic publication
Scan upload -> Python API -> Backend Scan -> local or S3 artifact storage
                                     -> Python scan-worker scaffold
```

The browser and installed web app share one frontend and session cookie.
Root pnpm workspace packages separate `frontend/` and `contracts/`; independent Python packages live under `backend/`.
Frontend server composition exposes a request-bound remote adapter through `API_INTERNAL_URL`.
The Python API owns its database pool, SavedState listener/streams, password executor and Scan resource lifetime.
The independent State worker owns ValueHistory and WholeDeckCategory scheduling.
Frontend owns SSR, native form presentation, cookies and streaming HTTP forwarding.
Web runtime imports of backend implementation, pg, Drizzle and password hashing are forbidden.
Native operators and public Demo fixtures also belong to backend.
Backend applications enforce ownership using session-produced trusted actors.
The [catalog](./catalog.md) uses separate PostgreSQL tables for public printing metadata.
Account-owned data remains scoped by the authenticated account.

The retained [Scan contracts](./mobile-and-scan.md) accept uploaded images and external candidates; Scan entrypoints and UI development are paused.
The bundled recognizer remains a scaffold; no vector database is required.

Application requests run in Python and Catalog ingestion runs in the Python worker.
[ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md) records future local recognition in the Android-first phone app and Jetson-hosted Cardstation.
The accepted PWA/QR delivery uses the website's same-origin SvelteKit application with installed narrow navigation.
Backend Auth owns the integrated browser/device QR authorization API; frontend owns QR/camera presentation and cookies.
This does not implement a Jetson client or local MTG recognition.
The shared API must support app extensions whether or not the ordinary website exposes them; exact runtimes and device contracts remain open.
The backend accepts authorized outcomes and owns Inventory/Deck persistence; it does not infer a presented card from its image.
Preparing public recognition references for client download remains part of the concept, with its contract unbuilt.
The current Python Scan scaffold and image-upload workflow remain implemented compatibility behavior.
[Mobile and scan](./mobile-and-scan.md#client-scope-and-open-responsibilities) owns client scope, including website functionality and additional capabilities in the phone app.

Before setting hosted capacity targets, measure request latency, database query and connection waits, memory, and account-transaction latency during catalog refreshes.
Budget PostgreSQL connections across application replicas and workers.
Use the [product specification](../product/specification.md) for implemented workflows and verification requirements.

## Accepted boundary redesign

On 2026-10-06, the maintainer selected root `frontend/` and `contracts/`; independent Python packages live under `backend/` ownership with enforced import rules, initially in one SvelteKit deployment.
[ADR-0015](../decisions/0015-shared-backend-use-cases-and-client-contracts.md) records that accepted direction.
That initial phase retained SvelteKit rendering, native form actions and HTTP routes.
Backend modules continue to own persistence, account authorization and use cases.
The web routes and external API must use those same use cases.
Shared contracts must describe serialized data independently of database row types and backend implementation imports.

A separately packaged client may configure its API address for local operation or a deployment behind a load balancer.
The delivered installed PWA uses the same origin as the website.
Web server routes now call the API over HTTP.
The same-origin proxy preserves public API paths, credential precedence, response headers and streaming.
`APP_ORIGIN` is the public origin; `API_INTERNAL_URL` selects only the internal destination.
Frontend feature components must depend on contracts and the application interface rather than persistence.
Another backend implementation must satisfy the same request, response, error, authentication and mutation semantics; a configurable URL alone does not provide that compatibility.

The review must cover every current web workflow, including capabilities that the versioned external API does not yet expose.
The [independent applications contract](./independent-applications.md#http-module-interface) owns the integrated parity reads and closed web commands, verification evidence and remaining native target checks.

The earlier API-preparation pass left app delivery for later.
The accepted 2026-10-16 PWA/QR delivery extends the shared web client.
The 2026-10-19 decision selects native Android delivery; hardware integration remains later work.
MTG remains the only functional game scope.
The selected synchronization scope is online-first visibility of saved account changes across connected clients within approximately two seconds under normal conditions.
Clients reload current data after reconnect or app resume and preserve unsaved input.
Offline writes and push notifications to closed apps are outside this pass.
The accepted [application contract](./application-contract.md#saved-state-synchronization) specifies account-scoped SSE invalidation through PostgreSQL LISTEN/NOTIFY, session revalidation and bounded refetches.

The selected concurrent-edit rules depend on the data.
Avatar and individual selection fields use the last value successfully saved by the backend.
Updates to different fields must preserve both changes.
Quantity adjustments must be atomic and retries must not apply an operation twice.
A stale save of the same Notes or Description text returns a conflict while preserving the client's draft for resolution.
This is saved-state synchronization, not collaborative live text editing.

Self hosting remains the preferred operating mode.
The maintainer selected PostgreSQL as the source of truth for account state and the MTG catalog, with SavedState transport and mounted Profile/Dashboard/Inventory/Deck/Scan consumers implemented without Convex.
Rendered workspace acceptance and deployed proxy verification remain separate.
The [realtime backend evaluation](../integrations/realtime-backends.md) owns the dated provider research and managed-service cost ceiling for any later reconsideration.
The accepted transport uses the PostgreSQL LISTEN/NOTIFY, Psycopg and bounded Python streaming.
No database replacement is selected.

Kyle accepted the earlier nineteen-slice design in Q56 on 2026-10-06.
The 2026-10-07 [value-only decision](../decisions/0020-value-only-inventory-history.md) removes cost mechanisms.
[ADR-0022](../decisions/0022-daily-value-observation-checkpoints.md) records the implemented aggregate daily observations that replace cost-dependent personal history.
It leaves implemented application, saved-state, public reference and category boundaries intact.
[The application contract](./application-contract.md), [Valuation](./valuation.md) and [category rules](./category-rules.md) own current implementation and remaining plans.
Design acceptance does not establish implementation, scalability, synchronization evidence or deployment.
[ADR-0003](../decisions/0003-pwa-first-mobile-and-server-side-scan.md) still describes the delivered web client; [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md) replaces its future capture and recognition placement.
The shared SvelteKit PWA supplies the implemented install/QR delivery; a separate Android application is the selected next client.
[ADR-0024](../decisions/0024-independent-applications.md) now selects Kotlin/Compose for Android.
Recognition runtime remains unselected.
[Mobile and scan](./mobile-and-scan.md#client-scope-and-open-responsibilities) owns integration status and pending target acceptance.

## Selected independent applications

On 2026-10-19, the maintainer requested three separate applications in the same monorepo: the Svelte website, application backend and Android app.
The integrated Python HTTP host and remote web adapter have separate build/start ownership.
The layout retains frontend/backend/contracts and adds an independent Android Gradle project.
Android source integration is complete; native device and final cross-client target acceptance remain pending.
Worker packages retain Catalog/price publication and scan responsibilities.
A wholesale directory rename or new monorepo orchestrator is not required.

The independent HTTP boundary remains stable while the unmerged candidate activates the Python implementation.
The HTTP host owns session authentication and backend use cases.
SvelteKit retains SSR, native forms and browser cookies, forwarding session credentials through HTTP and preserving public same-origin API paths through the proxy.
Serialized actor DTOs do not carry authority; the API must reauthenticate credentials.
Kotlin, Go and Python clients need language-neutral request, response and error contracts, rather than importing TypeScript implementation types.

The implementation contract must cover complete web/API parity, wire errors, origin protection, QR/session behavior, account-scoped SSE and cancellation, original mutation receipts, text conflicts, and Catalog generation/revision.
Preserve Drizzle migration history, operator commands, resource Start/Close and PostgreSQL transaction ownership.
Verify real HTTP/PostgreSQL, web SSR/forms, retries and two-process saved-state invalidation before declaring extraction complete.
[The mobile handoff](../product/mobile-app-exploration.md#native-implementation-handoff) owns the stack recommendation and first native journeys.
[ADR-0024](../decisions/0024-independent-applications.md) selects Kotlin/Compose.
The [reviewed implementation contract](./independent-applications.md) owns extraction interfaces and acceptance.
Language migration remains separate from this implemented first slice.

## Selected Python direction

[ADR-0025](../decisions/0025-python-api-and-workers.md) selects Python for both the future API and server workers, grouped under `backend/`.
[The evaluation](../integrations/backend-language-evaluation.md) records the tradeoff; [issue 211](https://github.com/KyleDerZweite/spellbook/issues/211) retains framework, schema ownership, exact package layout and migration planning.
The unmerged candidate now activates Python API/Core and independent State, Catalog and Scan processes.
Default launchers run the explicit Python migrator before starting runtime owners.
The replaced Node server is removed while frontend/contracts/Android and unchanged SQL/Demo assets remain.
[ADR-0027](../decisions/0027-python-functional-migration-acceptance.md) and the [migration contract](./python-backend-migration.md) separate source completion from final integration and production operations.
Review responsibilities, interfaces, dependency directions and compatibility before changing implementation contracts.
