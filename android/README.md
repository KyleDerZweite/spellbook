# Spellbook Android

- Status: Implemented client, native acceptance pending integration
- Last Reviewed: 2026-10-24
- Source of Truth: this Gradle project and the shared HTTP contracts
- Update Triggers: canonical versioned API paths, current-operation mutation recovery, native behavior, toolchain, API origin, credential storage, retention, streamed response bounds, reviewed deletion, account intent lifetime and acceptance evidence
- Related Docs: [Independent applications](../docs/architecture/independent-applications.md), [Mobile design handoff](../docs/product/mobile-app-exploration.md), [Authentication](../docs/architecture/auth.md), [Mobile HTTP](../docs/architecture/mobile-and-scan.md)

This independent Kotlin/Compose application uses the Python API directly.
It imports no web or database implementation.
The API validates authority, Printing identity, Inventory mutations, receipts and availability.
Shared Auth and account requests use `/api/v1/auth/...` and `/api/v1/account/...`.
MTG requests use `/api/v1/mtg/...`, including public Catalog reads under `/catalog` and the private Dashboard at `/dashboard`.
Home, Search, Inventory and Decks follow the accepted compact mobile composition, with the website's icon geometry, distinct tab colors and a Settings gear.

## Build and configuration

Use JDK 21, Android SDK package `platforms;android-37.0`, Build Tools `36.0.0` and the committed Gradle 9.6.1 wrapper.
The wrapper verifies the official distribution SHA-256.
AGP 9.1.1 owns built-in Kotlin, upgraded to KGP 2.4.21.
Do not apply `kotlin.android`.

From `android/`, with the installed Android Studio JBR:

```sh
JAVA_HOME=/opt/android-studio/jbr ANDROID_HOME=/home/kyle/Android/Sdk \
  ./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug --no-daemon
```

Other JDK 21 installations work with the same commands.
Android Studio 2025.3.3 can open this directory independently.
No Node command or database is needed for these checks.
Repository Node commands use `fnm exec --using 26.10.0`.

The default debug origin is `http://127.0.0.1:3001`.
Set the actual task-owned API port reproducibly:

```sh
JAVA_HOME=/opt/android-studio/jbr ANDROID_HOME=/home/kyle/Android/Sdk \
  ./gradlew :app:assembleDebug \
  -Pspellbook.debugApiBaseUrl=http://127.0.0.1:PORT --no-daemon
```

Replace `PORT` with the API listener's actual port.
The runtime owner can then run `adb -s SERIAL reverse tcp:PORT tcp:PORT` and install `app/build/outputs/apk/debug/app-debug.apk`.
Use the assigned emulator serial.
This project does not start an emulator, API or PostgreSQL.
It needs no LAN listener or firewall change.
Debug cleartext access permits only `127.0.0.1` and `localhost`; `10.0.2.2` and LAN HTTP are rejected.

Release builds require `-Pspellbook.apiBaseUrl=https://your-api-origin`, without a path, credentials, query or fragment.
`preReleaseBuild` rejects missing or non-HTTPS configuration.
The runtime also validates the configured origin.
Signing and distribution remain the release owner's responsibility.

## Dependencies and responsibilities

| Dependency                                         | Pin        | Purpose                                                             |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| AGP                                                | 9.1.1      | Android packaging, built-in Kotlin and Lint                         |
| Gradle                                             | 9.6.1      | Independent, reproducible Android build                             |
| Kotlin/KGP, Compose compiler, serialization plugin | 2.4.21     | Typed native implementation and generated DTO serializers           |
| Compose BOM                                        | 2026.09.00 | Compatible Compose UI and Material 3 components                     |
| Navigation3                                        | 1.2.0      | Native back stack, saved navigation and system Back                 |
| Lifecycle                                          | 2.11.0     | ViewModel/StateFlow, lifecycle collection and foreground ownership  |
| Activity                                           | 1.13.0     | Compose activity and edge-to-edge platform integration              |
| Ktor OkHttp                                        | 3.6.0      | HTTP and SSE with cancellation; no cookie jar or write retry plugin |
| kotlinx.serialization JSON                         | 1.11.0     | Explicit serialized HTTP DTOs and bounded draft serialization       |
| JUnit                                              | 4.13.2     | JVM regression tests                                                |
| Ktor MockEngine                                    | 3.6.0      | Isolated transport failures and wire assertions in JVM tests        |
| coroutines-test                                    | 1.11.0     | Deterministic suspend-function tests                                |

SSE is in Ktor Client Core and needs no separate SSE dependency.
The setup follows [AGP built-in Kotlin](https://developer.android.com/build/migrate-to-built-in-kotlin), [Navigation3](https://developer.android.com/guide/navigation/navigation-3/basics) and [Ktor SSE](https://ktor.io/docs/client-server-sent-events.html) and [scoped response streaming](https://ktor.io/docs/client-responses.html#streaming).
Android Keystore, app-private preferences and bounded current-screen reads cover the selected storage requirements without Room, DataStore, a dependency-injection framework or an offline write queue.

`data/` owns serialized DTOs, transport, credential storage and mutation recovery rules.
`feature/AppModel.kt` owns lifecycle, current-account state and use-case orchestration.
`ui/` owns native screens and presentation.
UI never constructs trusted actors or resolves ownership locally.
The launcher uses the existing [Spellbook brand asset](../docs/reference/website-icons.md), copied without alteration.

## Implemented journeys

Public Catalog Search supports a query, color filters and bounded pagination.
Printing details load `GET /api/v1/mtg/catalog/printings/:printingId` as a direct `CardDocument`, with actual artwork and alternative Printings.
All Catalog reads use the configured API.
Artwork loads from the API's HTTPS image URLs; it carries no session token.

Home reads the real Dashboard.
Inventory reads 40 entries per page with search and Box filtering.
Boxes read paginated Groups and support explicit creation.
Entry details support Quantity/Notes edits, whole-entry Box membership and reviewed-quantity removal confirmation.
Printing, Finish and Condition stay fixed while editing.
Notes edits retain the revision originally reviewed until the user explicitly chooses current saved values.

Inventory's small plus opens Search and the Add draft.
Login and Registration return to that same unsaved guest draft.
Save requires a separate explicit action and sends the existing `{requestId, source: "mobile", items: [...]}` contract.
Add preserves existing Notes rather than replacing them without a reviewed Notes revision.

Deck Library uses the bounded directory endpoint.
Selected Deck uses `selectedOnly=true`, with actual composition, ownership projection and a separate Availability read.
Requirements remain separate from owned quantities.
Profile shows the actual account's saved card fields and totals.
Settings supports appearance, account entry, explicit logout, Card Station and manual QR request inspection/Approve/Deny.
A failed logout retains credentials until server revocation succeeds or the user explicitly removes local sign-in.

Card Station states that no device connection is available.
Its eight-box circle and central input are a design representation with no fabricated identity, content, activity or successful job.
Phone capture and native QR camera decoding show explicit unavailable states.
Deck writing/import/export, full Profile editing, camera recognition and hardware services are outside this first native read/add contract.

## State and recovery

Sessions have fixed server expiry and no refresh token.
Foreground expiry also disables private views when the stream is unavailable.
Android Keystore protects a nonexportable AES-GCM key; app-private preferences hold only session ciphertext.
The backend origin is authenticated encryption context.
Backups are disabled.
Startup/resume validates the session before private reads.
A 401, including a rejected SSE handshake, or an auth-expired SSE event disables private access and requires sign-in.
Network and 503 stream failures remain unavailable and use the existing bounded backoff.

Small drafts are namespaced by backend origin and account, with a separate guest namespace.
Each serialized draft is at most 64 KiB; at most four draft slots are retained.
A guest draft transfers only through the contextual sign-in journey.
Different-account/backend authentication clears private searches, Box filters, offsets and prior private routes; same-account reauthentication may retain them.
Different accounts load different drafts and receive no previous account's read state.
Logout clears local drafts for the active account and guest.
Passwords remain only in the active login composition.
Login and logout share one owned request job.
Back, logout, expiry and background disposal cancel it; epoch/backend/account and intent fences reject late success and failure callbacks, including a response that completes after local sign-in removal.

Removal confirmation freezes the reviewed entry identity, name, quantity, account, request ID and exact DELETE body when the dialog opens.
A remote quantity change cannot enlarge that review; HTTP 409 requires another explicit review with a new request ID.
Ambiguous removal retries keep the original body and request ID.

A mutation persists its method, exact serialized body, request ID, backend and account before dispatch.
An ambiguous failure exposes only an explicit retry of that frozen attempt.
It cannot be replayed for a different account/backend.
Only current mutation operations can be retained or retried.
Loading a draft discards an obsolete attempt without changing its add draft or rewriting the operation.
Successful acknowledgement is persisted before current-state refresh.
A reload failure keeps the confirmed receipt and offers a read retry.
It cannot resend a successful write.
Definitive validation/conflict failures permit correction with a new request ID; Notes conflicts retain the user's text and show the current saved Notes.

The app keeps one bounded current-screen read, clears it when leaving the screen/background, and installs no HTTP or disk cache.
`no-store` responses are not reused.
JSON and artwork bodies are consumed inside Ktor `prepareRequest`/`prepareGet` scoped `execute` blocks, before the 2 MiB limit is checked.
This bypasses Ktor's eager SavedCall body buffering.
Scoped cleanup and channel cancellation stop oversized or abandoned transfers without reading their full bodies.
Marked SSE HTTP failures are rejected before Ktor's SSE error transform can save an unbounded body.
Artwork has no persistent cache, limits each download to 2 MiB and each decoded dimension to at most 800 pixels, or 192 pixels for rows, with four concurrent decodes.
Oversized/failed reads show unavailable, not empty success.
Inventory and directory pagination replace the current page rather than accumulating an unbounded list.
Selected Deck composition renders 40 rows per page within the bounded selected response.

Foreground ownership cancels reads, in-flight writes and SSE when the app stops.
Unconfirmed attempts remain drafts and never replay on resume.
Session/account changes cancel old private work.
SavedState reset/invalidate events reload only the current screen; draft text and reviewed Notes revisions remain separate.
Stream reconnect uses bounded backoff and stops after five failed connections.
Resume revalidates and reconnects.
Manual Refresh is always available on private read destinations.

## Acceptance and remaining evidence

JVM tests cover HTTPS/loopback policy, fixed expiry, bearer selection, no-store reads, structured Notes conflicts, one-call transport failure, identical explicit retry, account/backend binding, receipt identity, supported Printing finishes and draft recreation.
Backpressured unknown-length 16 MiB producers verify that API/artwork reads cancel before full consumption.
Task-owned ephemeral loopback HTTP listeners exercise the real OkHttp/SSE 401 and unavailable handshake paths.
Pure policy tests cover immutable removal review, account context/navigation resets and delayed login/logout completion.
These tests establish client transport and policy behavior, not Android Keystore, rendered UI or compatibility with real PostgreSQL and the extracted API host.

The parent integration owns installation, rendered light/dark/narrow layouts, touch/accessibility, system Back/keyboard, real guest Search, login/register, guest draft to explicit Save, lost-response retry, confirmed-save/read-failure feedback, account isolation and website-to-app SSE refresh.
These native journeys need the real API and the parent's task-owned emulator or an approved Android device.
Build/JVM/Lint success does not establish native rendering or hardware acceptance.
The parent reports the emulator boot failure and any resulting unexecuted target checks.
