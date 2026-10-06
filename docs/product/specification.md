# Spellbook product specification

- Status: Canonical
- Last Reviewed: 2026-10-06
- Source of Truth: application code, tests, accepted product requirements
- Update Triggers: account access and preferences, dashboard summaries, catalog identity, inventory or deck behavior, import formats, API contracts, scan capability and priorities, physical-card integration requirements, supported platforms, release acceptance changes
- Related Docs: [Domain model](../../GLOSSARY.md), [Routes](./routing-and-games.md), [UI direction](./ui-design-direction.md), [System architecture](../architecture/system-overview.md), [Authentication](../architecture/auth.md), [Mobile and scan](../architecture/mobile-and-scan.md), [Deployment](../operations/deployment.md), [Card scanner and sorter](../integrations/card-robot.md), [Product index](./README.md)

Spellbook is an open-source MTG inventory and deck builder for private accounts on a self-hosted instance. Visitors can search the local catalog and inspect printings without an account. Signed-in users record owned printings, edit decklists, and compare deck requirements with inventory. Hosted operation uses the same account boundaries and runtime services.

This document owns product requirements and implementation status. The glossary owns terminology. Architecture documents own internal implementation details, and operations documents own installation and recovery steps. Requirements marked planned are not shipped capabilities.

## Scope and users

The primary users are collectors maintaining a private owned-card ledger, players building decks from their inventory, and developers importing or automating that work. MTG is the only supported game. Existing game fields and the versioned API's `mtg` segment do not establish support for other games.

The core workflow is to find a printing, record its owned quantity, build or import a deck, inspect exact and alternate printing availability, edit the deck, and export it. Inventory ownership and deck requirements remain separate throughout this workflow.

Public deck sharing, social feeds, marketplaces, financial portfolio management, collaborative editing, AI deck recommendations, native mobile clients, and gameplay simulation are outside the current scope. A separate future play application may consume catalog and deck data.

Reliable card scanning and an installable mobile app are future product priorities. The working website, catalog, inventory, and deck tools provide their foundation. The [mobile and scan architecture](../architecture/mobile-and-scan.md) owns implementation status and the accepted PWA-first direction. An app download, production recognition, and direct camera capture are not currently available.

## Capability status

| Capability             | Current contract                                                                                                         | Boundary                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Catalog search         | Search locally indexed Scryfall cards and select printings                                                               | Search quality and catalog freshness depend on successful worker ingestion         |
| Dashboard              | Current account inventory totals, distributions, recently edited entries, deck availability and pending scan reviews     | No prices, growth history or reservation across decks                              |
| Owned inventory        | Add, change, decrement, remove, and bulk mutate printing entries                                                         | No physical locations or per-copy identifiers                                      |
| Inventory presentation | List presentation, filters, sorting, and owned set progress                                                              | No binder-style view or physical-location tracking                                 |
| Deck builder           | Private deck editing, catalog and printing selection, role moves, import/export, and exact/alternate/missing totals      | Availability allocates within one deck and does not reserve inventory across decks |
| Text exchange          | MTG Arena-style import preview and commit, plus deck text export                                                         | No CSV importer profiles or hosted-service scraping                                |
| Import warnings        | Lightweight size, copy-count, and catalog legality warnings                                                              | No full MTG rules engine                                                           |
| Automation             | Versioned inventory, deck, import, printing, and scan endpoints                                                          | The route and OpenAPI documents own wire contracts                                 |
| Scan review            | Photo upload, owned session review, external candidate submission, manual printing choice, and explicit inventory commit | No production recognizer, direct camera capture, or physical sorter                |
| Mobile web             | Responsive application using the same account and data model                                                             | Offline operation and a completed installable PWA are planned                      |

Local authentication and the interactive deck workspace are implemented. The deck workspace includes catalog and printing selection, quantity and role editing, per-deck availability, previewed imports, and downloadable exports. Physical scanner and sorter integration is proposed; its preparation does not establish hardware or per-copy tracking support.

## Account access and ownership

The application uses local usernames and passwords. Users can register a local account, sign in, use the private workspace, and sign out without an external identity provider. Registration is public on the instance; there is no invite-only or first-user-only policy. OIDC redirects, discovery, provider tokens, and external identity linking are removed from active authentication.

Signed-in users can choose a local sprite avatar and profile artwork in [Settings](./routing-and-games.md). Both choices persist with their account. Registration also offers the generated artwork library. The private profile card is editable in Settings and can include actual account totals through KPI placeholders. Rank, public profile sharing and set-completion claims are not implemented. Profile photo uploads and language preferences are deferred. The [UI direction](./ui-design-direction.md) owns account menu placement and avatar presentation.

An account's internal identifier owns its inventory, decks, scan sessions, and mutation requests. A username is a login identifier, not a database ownership key. Renaming or recovering credentials must preserve the owning account. Existing accounts require an explicit operator-controlled migration that preserves their internal identifiers.

The server derives the account from the authenticated session. A client-supplied account identifier must never grant access. Queries and mutations must constrain the parent object and its children to that account. Knowledge of another account's deck, inventory entry, or scan identifier must not expose or mutate it.

Passwords require a salted, memory-hard hash. The server stores only hashes of opaque session tokens, checks expiry on each authenticated request, and revokes the session on logout. Browser sessions use an HttpOnly cookie with the appropriate secure and same-site settings. JSON authentication endpoints return a bearer token for API clients without setting a browser cookie. Unsafe cookie-authenticated requests require origin protection. Authentication errors must not reveal whether a username exists.

The [authentication architecture](../architecture/auth.md) owns the exact registration policy, credential limits, session duration, rate limits, cookie behavior, bearer-token behavior, and migration procedure. Email verification, email password recovery, MFA, and delegated identity providers are not current features.

## Profile card editor

Settings separates account preferences from card customization. `/settings` owns optional contact email and an Edit avatar dialog; `/settings/profile-card` owns only the card definition and artwork; `/settings/password` owns current-password-confirmed credential changes. One centered layout supplies Profile, Profile Card and Password links within the application Shell. Email is contact data, not a verified login or recovery identity. Avatar cancel discards the dialog draft; each save preserves the other preferences. Password changes revoke old sessions and issue a fresh session for the current browser. Invalid requests do not change credentials or sessions. Demo passwords remain immutable. The [authentication architecture](../architecture/auth.md) owns validation, concurrency and session transaction details.

Settings provides a configurable regular MTG profile card with a live preview. Name, mana cost, frame color, legendary frame, rarity, type line, rules text, flavor text and optional paired Power/Toughness are editable. Legendary frame changes presentation without rewriting the free type line. Artwork comes from the existing generated library; sprite selection remains an account preference. Field-specific character limits, rules/flavor line limits and an eight-symbol mana-cost limit are enforced by the shared contract. Power/Toughness accept numeric values, simple card formulas, or one supported KPI, rather than free prose. No upload or specialized card layout is included.

The card definition stores text templates and presentation fields separately from current inventory totals. Supported placeholders are `{total_owned_cards}`, `{unique_card_names}`, `{owned_printings}`, `{owned_sets}`, `{foil_copies}` and `{total_decks}`. Owned cards means summed physical-copy quantities; represented sets does not mean completed sets. Values resolve from the current authenticated account during rendering and remain unavailable when totals cannot load. They are never saved back into the template.

One shared validator owns allowed fields, limits, mana grammar and placeholder names. The Settings action owns authenticated persistence; the preview owns no queries or writes. Save must retain all inputs on failure and persist them across reload without changing account identity or visibility. UI and future agent adapters use the same validated definition. Agent editing endpoints, additional TCG templates, public sharing, image export and rank remain future work.

## Dashboard

The public `/` landing is stable across sessions. Signed-in users open their private account summary at `/mtg/dashboard`; Inventory remains the default destination after login or registration without an explicit safe return path.

Dashboard totals distinguish physical copies, canonical card names, printings, sets, foil copies and decks. Set, finish and condition distributions use owned quantities. The page shows the eight largest sets, an Other sets remainder, and up to eight recently edited inventory entries ordered by their stored update time. Recent edits do not establish an acquisition history.

Each deck reports required, exact, alternate and missing quantities through the existing [availability calculation](#deck-availability), independently against the full inventory. The summary does not reserve copies across decks. Pending scan review counts include owned sessions with `pending_review` status. An unavailable scan count is explicit; a failed account load offers retry. Empty inventory and deck states link to their next actions.

Prices, portfolio values, historical growth and synthetic trends are outside this dashboard. Its summaries use existing account records and require no new persistence model.

## Catalog and printing identity

The [domain model](../../GLOSSARY.md) distinguishes the card's canonical identity from its printing identity. Catalog search groups matching printings by canonical card; printing selection retains individual printing identities. The [catalog architecture](../architecture/catalog.md) owns PostgreSQL storage, publication, query contracts, and selection policy.

Search must show a recognizable card name and image and provide useful MTG filters. The printing chooser must expose enough information to distinguish the available set, collector number, and printing. Adding an owned card or deck entry records the selected printing and its canonical identity together.

The web Search form reports the local result of adding an owned card. While a request is pending, it prevents repeat submissions, printing changes and inspector dismissal. Completion or failure preserves the selected printing, quantity, finish and condition for review or another explicit action. This form does not provide automatic retry or request-level idempotency.

Matching by display name alone is insufficient for availability. Two printings of one canonical card can be interchangeable for a deck while remaining distinct inventory entries. Two different canonical cards with similar names must remain distinct.

Catalog data is shared reference data. Owned quantities, notes, and deck membership belong to the account and do not modify the shared catalog. Missing catalog images must not remove the accessible card name or block quantity editing.

## Owned inventory

Each account has one MTG inventory. Entries group by inventory, printing, finish, and condition. Repeated adds to the same group increase its quantity. Entries retain notes and an ordering position. List sorting does not change that persisted identity or position.

Supported finishes are `nonfoil` and `foil`. Supported conditions are `NM`, `LP`, `MP`, `HP`, and `DMG`. These are the persisted choices even when the source catalog describes additional finish types.

The canonical bulk mutation path accepts add, set, decrement, and remove operations. Positive owned quantities remain stored; setting or decrementing to zero or less removes the entry. Invalid operations, finishes, conditions, and nonfinite quantities must fail validation. An error must not leave a partially applied bulk request.

Users can inspect inventory as a compact list. The toolbar contains Search, Filter and Sort, with a count of matching entries and their total copies. Search matches card names, set codes, conditions and notes. Filter opens a shared popover with searchable set names and codes from the owned inventory, plus finish and condition selectors. Set choices combine with OR; search, sets, finish and condition combine with AND. Active set, finish and condition chips open the relevant filter control for editing; their separate clear buttons remove only that value. Clear filters preserves the selected ordering.

The list starts in card-name ascending order. Clicking Card selects name ordering or reverses its active direction. Clicking Set groups entries by set code; repeated clicks reverse the set order while names within each set remain ascending. Either base header clears the additional ordering. Finish, Condition and Quantity apply one additional ordering at a time, before names and within sets when set grouping is active. Repeated clicks reverse that ordering. Finish starts with Nonfoil before Foil, Condition with `NM, LP, MP, HP, DMG`, and Quantity uses numeric order. The toolbar Sort menu exposes the same ordering choices, including Newest first by the entry's `createdAt` descending without a time filter. A variant click from that mode returns to name ascending with the chosen variant ordering.

An entry displays New for seven elapsed days from `createdAt`. The badge explains its creation date and duration. Quantity or note edits, added copies merged into an existing entry and internal reordering do not restart this period. This is an entry-age indicator, not per-copy acquisition history. The page uses its server load time and refreshes badge age every minute while open.

Selecting exactly one set reveals owned-name progress. Selecting zero or multiple sets hides it. Progress counts owned canonical cards across that set, ignores other list filters, and reports unavailable catalog totals explicitly. Quantity edits preserve notes and the current filters. The inspector edits quantity and notes for the selected owned entry. The decrement control stops at one; the row action menu contains Remove, which opens the shared confirmation dialog without expanding the row. The dialog identifies the entry and quantity, focuses Cancel, blocks dismissal while pending and retains errors for retry. Cancel returns focus to that menu; successful removal focuses a neighboring row menu or Search when no matching rows remain. An empty inventory focuses Find your first card.

Physical locations, binder or box assignment, loans, individual copy identifiers, per-copy provenance, and physical movement history are planned. The inventory currently stores aggregate quantities. Catalog printing identity includes language, but there is no separate physical-copy language or location record. Inventory export and CSV exchange require separate implementation; deck text export does not establish inventory export support.

## Deck builder

The implemented workspace uses `/mtg/decks?deck=ID` to select an owned deck. Catalog queries use `q`, and printing selection uses the canonical card identifier in `printing`. Deck rows support local name filtering and name or quantity sorting. An owned-results filter narrows catalog results without preventing users from adding an unowned card.

A user must be able to create, select, rename, describe, change the format of, and delete a private deck. A deck entry records printing identity, canonical identity, quantity, and role. The supported roles are main deck, sideboard, commander, and companion.

The editor must search the local catalog and let the user add a chosen printing without first adding it to inventory. It must support changing quantities, removing entries, and moving entries between roles. Adding the same printing to the same role combines quantities. Moving it into an existing matching entry combines quantities without dropping copies.

The deck workspace must keep the selected deck, card search, role sections, and availability visible or readily accessible. Show card counts and explicit save or mutation feedback. Users must be able to distinguish an unsaved edit, an applied mutation, and a failed request. Format labels guide warnings; they must not silently remove cards or block drafts.

Deletion requires an explicit confirmation that names the deck. Routine quantity and role edits must not demand repeated confirmations. Disabled and pending controls must prevent accidental duplicate submissions while preserving visible error recovery.

Import and export belong in this workspace. The user must review imported text before committing it and see malformed, unresolved, ambiguous, or unsupported lines. An export must be a downloadable or copyable plain-text decklist with supported sections.

Drag-and-drop, deck tags, maybeboard persistence, playtesting, deck sharing, collaboration, and a full rules engine are not required for this builder.

## Deck availability

Availability compares all entries of one deck against the same account's inventory. It must distribute owned quantities across deck entries so one physical copy cannot satisfy multiple required copies within that deck.

Perform exact-printing matching before alternate-printing matching. Reserve all exact matches before distributing alternate printings, so an early flexible requirement does not consume a copy needed by a later exact requirement. Aggregate finish and condition groups when the deck does not require either attribute.

For each deck entry, expose its required quantity, exact owned quantity used, alternate quantity used, and missing quantity. Totals must agree with entry results. The result must remain deterministic for the same inventory and deck inputs.

For example, two deck entries requiring one copy each of the same canonical card cannot both report available when the account owns only one copy. If the account owns the requested printing for one entry and a different printing for the other, exact matches take precedence.

`GET /api/mobile/v1/mtg/decks/{deckId}/availability` exposes this calculation to authenticated clients. It returns `deckId`, `entries` with `entryId`, `required`, `exact`, `alternate`, and `missing`, and matching `totals`. Invalid deck identifiers return 400; absent or foreign decks return 404. The API allocates entries in stable identifier order and marks the response `no-store`.

This allocation is a calculation for one deck. It does not reserve, move, or decrement inventory. Comparing a second deck can reuse the same owned copies. Physical assignment across decks, unavailable-because-assigned results, storage locations, and executable build plans remain planned.

## Import, export, and warnings

The supported input is MTG Arena-style text with quantities, card names, and optional printing hints. The parser recognizes main, sideboard, commander, companion, and maybeboard sections, as well as supported section aliases. Blank lines and comment lines are ignored. Duplicate parsed lines with matching identity hints and role combine quantities.

Preview returns parsed, resolved, unresolved, and ambiguous lines with warnings. Malformed lines remain visible as unresolved input. Resolution uses the local catalog. A successful parse does not establish a resolved printing.

Commit reparses and resolves submitted text on the server. It accepts only resolved lines in supported roles; the client cannot replace server resolution with unverified preview results. Deck imports accept the four persisted roles. Inventory imports accept main-section entries. Maybeboard entries are preview-only and are not persisted.

The user must see which lines will be committed and which remain uncommitted. Editing the text invalidates the displayed preview. Preview is not a durable catalog snapshot, so catalog changes between preview and commit can change resolution; the commit response is authoritative.

Deck text export preserves quantities and role sections. Exact printing round trips depend on available printing metadata. The exporter enriches entries with collector numbers when the local catalog provides them; fallback text may contain only a name and set. It is not a complete archival export of database state.

Warnings cover basic deck size, commander counts and singleton requirements, constructed copy limits, Vintage restricted-card quantities, and available catalog legality data. Commander size counts main and commander roles. Recognized card-text exceptions adjust copy limits. These checks do not implement all commander eligibility, partner, companion, color-identity, or card-specific rules. Warnings allow users to continue editing and importing drafts.

CSV mappings for ManaBox, Moxfield, Archidekt, and generic columns are planned. Integrations should accept user-provided exports before depending on private remote APIs.

## Scan review

The authenticated `/mtg/scan` workspace creates and reopens account-owned sessions, uploads a JPEG, PNG, or WebP photo, and displays stored images and recognition candidates. The initial workflow uses one photo per session. Users can search the catalog, select a printing manually, set quantity, finish, and condition, then confirm an explicit inventory commit. Draft selections remain local until commit. Committed sessions are read-only.

Scan APIs list recent owned sessions, accept image artifacts, return candidate matches, serve owned images, and accept externally produced candidate results. External results identify a model version and resolve submitted printing identifiers against the catalog. A result replaces the artifact's current candidates under a session lock; identical retries do not create additional artifacts, review entries, or inventory. Committed and cancelled sessions reject result changes.

Result submission has no event identifier, payload-digest conflict protocol, or stale-version rejection. A late result can replace a newer result while the session remains reviewable. Session creation and photo upload do not acquire replay safety from the later review commit's request identifier.

A scan candidate does not count as inventory until the user explicitly commits it. The commit validates ownership of the session and artifact and uses the canonical inventory mutation path. Repeated matching commits do not duplicate quantities. Ambiguous and low-confidence results remain visible and correctable; manual catalog selection permits review without a working recognizer.

The built-in recognizer remains a placeholder. OCR, trained embedding inference, validated automatic recognition, direct browser camera capture, and physical sorting are not implemented. Candidate scores must not be presented as verified recognition accuracy.

The [mobile and scan architecture](../architecture/mobile-and-scan.md) owns endpoint bodies, candidate counts and score ranges, supported image signatures, upload limits, session listing limits, storage behavior, and worker boundaries.

## Physical scanner and sorter preparation

A physical card-scanning, indexing, sorting, and deck-assembly product is a separate later project. Its proposed integration must not make hardware a requirement for the current website.

A future device may feed individual MTG cards from a stack, capture each card, and sort it into configured output trays. Colour, type, and set are candidate sorting rules. A Jetson may run recognition, and a microcontroller may control motors and sensors. Hardware selection, construction, recognition models, and the movement protocol are undecided.

The [card scanner and sorter proposal](../integrations/card-robot.md) owns the device concept, candidate protocol, recovery model, and prototype acceptance criteria. These are proposed contracts. Current scan and inventory APIs do not establish an implemented robot controller, sorting job, or physical placement record.

Recognition proposes a printing; user confirmation establishes an intended import. A commanded movement does not establish output placement. A sorter must confirm placement through sensor evidence or operator reconciliation before recording a physical location. Sorting an already owned card must not add its quantity to inventory again.

Physical tracking requires a schema decision that preserves individual copy identity or explicit quantity allocations, language, finish, condition, location, and deck assignment. These fields and relationships must be implemented before Spellbook claims to track cards in trays or assembled decks. Current aggregate inventory entries cannot distinguish otherwise identical copies in different places.

A deck-assembly job selects matching cards only from the stack actually fed into the device. It allocates a presented card at most once, follows an explicit alternate-printing policy, and reports unmet requirements. It cannot retrieve cards from arbitrary storage or treat inventory elsewhere as physically reachable. Deck assembly is separate from AI deck suggestions, which remain outside the implemented product.

## API and consistency requirements

The [route inventory](./routing-and-games.md) owns supported paths. The [mobile and scan architecture](../architecture/mobile-and-scan.md) links the versioned API contract. Web actions and API handlers must call the same inventory and deck repositories rather than maintain separate mutation semantics.

Bulk callers supply a nonempty `requestId` scoped to the account. They must retain it when retrying the same operation and generate a new identifier for a new logical operation. New inventory, deck, deck import, and scan review mutations persist a fingerprint of the normalized mutation. Matching retries apply once; reusing an identifier for a different normalized mutation returns HTTP 409 without applying it. Legacy mutation records with a null fingerprint retain their earlier deduplication behavior and cannot detect changed payloads. Idempotency does not provide optimistic concurrency control or a historical response snapshot.

A bulk request validates its operations before writing, records the mutation request with its writes, and rolls back on failure. Deck imports create the deck, mutation record, and entries in one transaction. Deck mutations serialize writes to the same deck; concurrent retries have one effect. Reusing a deck request identifier for a different deck is rejected. A role move preserves the total quantity, including when its destination already exists.

Quantity validation accepts finite integer numbers within the signed 32-bit range; fractional values and numeric strings are rejected. Additions and decrements require positive quantities. JSON handlers validate scalar types rather than coercing arrays, objects, or booleans into strings or quantities. The [API architecture](../architecture/mobile-and-scan.md) owns body-size, pagination, upload, and field limits.

Authentication, validation, missing-resource, and unexpected-service failures must remain distinct. Errors shown to users must describe the failed action without exposing passwords, session tokens, SQL internals, or private data. Successful writes return persisted data or trigger a fresh authoritative read.

The current API does not provide a general ETag or version-based editor conflict protocol. Independently submitted replacement edits can overwrite an earlier edit. Real-time collaboration and explicit stale-editor conflict resolution require additional work.

## Interface acceptance

The [UI design direction](./ui-design-direction.md) owns the base design and visual requirements. The release must satisfy these workflow checks:

1. An authenticated user can find a card, choose a printing, and add an owned quantity with finish and condition.
2. The user can create a deck, search the catalog, add an unowned card, change its quantity and role, and remove it.
3. Availability reports exact, alternate, and missing quantities without reusing a copy within one deck.
4. Import preview shows unresolved and ambiguous input, and commit does not silently include unsupported lines.
5. A user can export a deck and sign out, and another account cannot see the first account's objects.
6. A user can upload a scan photo, review an external candidate or select a printing manually, and explicitly import it once. Another account cannot read the image.
7. The same workflows remain usable on a narrow mobile viewport and through keyboard navigation.

Controls require visible labels or accessible names. Forms associate validation errors with inputs. Pending, empty, success, and failure states need readable text. Focus must be visible, dialogs must return focus appropriately, and meaning must not depend on color alone.

A dense desktop layout may use columns and tables. Narrow screens must stack essential controls, keep primary actions reachable, and avoid hiding required actions behind hover. Card images supplement readable names and printing identifiers. Reduced motion preferences must be respected.

## Runtime and verification

The [system overview](../architecture/system-overview.md) owns the runtime boundaries. The [deployment guide](../operations/deployment.md) owns required services, environment variables, migration, and startup commands. Dependency versions belong to manifests and lockfiles rather than copied version tables in this specification.

The [repository verification workflow](../operations/github-automation.md) owns local commands, CI coverage, browser checks, and evidence. Apply it against the domain contracts and interface acceptance criteria above. An acceptance requirement does not establish implemented or verified behavior by itself.
