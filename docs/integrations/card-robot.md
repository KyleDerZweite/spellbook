# Card scanner and sorter

- Status: Proposed integration
- Last Reviewed: 2026-10-05
- Source of Truth: product requirements, scan API code, hardware concept
- Update Triggers: capture and recognition APIs, physical inventory schema, device protocol, construction choices, prototype results
- Related Docs: [Product specification](../product/specification.md), [Domain model](../../GLOSSARY.md), [Mobile and scan](../architecture/mobile-and-scan.md), [API routes](../product/routing-and-games.md), [Local authentication](../operations/local-auth.md)

The proposed device accepts a stack of MTG cards, separates one card at a time, captures an image, and sorts cards into output trays. Spellbook supplies the review interface, inventory, decklist, and selected sorting rule. A Jetson may run capture and recognition; a microcontroller may operate motors and read position sensors. Construction and board selection remain undecided.

Sorting may use colour, card type, or set. Each job needs a fixed mapping from those values to output trays, including multicolour, colourless, multiple card types, and unknown results. Name sorting is a possible later rule. A deck-assembly job selects matching cards from the stack actually fed into the machine and reports missing quantities. It cannot retrieve cards from arbitrary storage boxes. Physical assembly does not include AI deck suggestions.

## Current software and proposed work

Spellbook has account-owned scan sessions, image uploads, stored artifacts, candidate-shaped results, and an explicit review commit to inventory. The scan worker remains a placeholder with no production recognition. Inventory entries group quantities by printing, finish, and condition. Physical copy identifiers, locations, movements, and deck assignments are not implemented.

The `/scan` workspace implements image upload, candidate review, manual catalog selection, and explicit inventory confirmation. External recognizers can replace candidates for an owned artifact. The [scan architecture](../architecture/mobile-and-scan.md) and [OpenAPI source](../../frontend/src/routes/openapi.json/+server.ts) own those implemented contracts. Direct camera capture, device controllers, sorting jobs, motor protocols, sensor-confirmed outcomes, and construction remain proposed.

The existing authenticated API supports:

| Operation                     | Existing route                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| List recent sessions          | `GET /api/mobile/v1/mtg/scan/sessions`                                             |
| Read an owned image           | `GET /api/mobile/v1/mtg/scan/artifacts/{artifactId}/image`                         |
| Submit recognition candidates | `POST /api/mobile/v1/mtg/scan/sessions/{sessionId}/artifacts/{artifactId}/result`  |
| Create a session              | `POST /api/mobile/v1/mtg/scan/sessions`                                            |
| Upload an image               | `POST /api/mobile/v1/mtg/scan/sessions/{sessionId}/frames`, multipart field `file` |
| Read artifacts and candidates | `GET /api/mobile/v1/mtg/scan/sessions/{sessionId}/result`                          |
| Commit reviewed selections    | `POST /api/mobile/v1/mtg/scan/review/commit`                                       |

External clients use an opaque local session token in `Authorization: Bearer ...`, following the [authentication contract](../architecture/auth.md). Device-specific credentials and permissions are future work. Keep tokens in the device's protected configuration and omit them from images, job records, and logs.

For the first prototype, use one session per presented card. Artifact recording currently changes an open session to `pending_review`, and further frame uploads require an open session. Session creation and frame upload do not currently accept a caller's idempotency key. The review commit's `requestId` does not make either operation replay-safe.

Candidate submission replaces the artifact result and does not mutate inventory. It has no event identifier, payload fingerprint, or stale-result rejection. A delayed submission can replace newer candidates before the session closes. The proposed event protocol below is additional work, separate from the implemented inventory commit fingerprint.

## Minimal device contract

Start with a phone or simulated device posting images through the same API. Recognition output is evidence for review, not permission to add inventory. Manual selection of a catalog printing must remain possible when recognition returns no result. The initial robot integration must retain explicit confirmation before importing a newly owned card.

The following records are proposed and need versioned API definitions before implementation:

| Record             | Minimum information                                                            | Meaning                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Job                | `jobId`, mode, fixed sorting rule or deck snapshot, tray mapping               | The operator's requested work. Modes distinguish new inventory import from sorting already owned cards.               |
| Capture            | `captureId`, `jobId`, sequence number, `sessionId`, `artifactId`, image digest | One observed card presentation and its image. Recapturing the same held card must not create another owned copy.      |
| Recognition result | `eventId`, `captureId`, `artifactId`, model version, status, candidates        | Candidate printing IDs and optional scores or OCR clues. The server validates account ownership and catalog identity. |
| Move command       | `commandId`, `captureId`, target tray                                          | Permission to attempt a physical movement, not proof of arrival.                                                      |
| Placement result   | `eventId`, `commandId`, `captureId`, outcome, observed tray, sensor evidence   | Confirmed arrival, a jam, or an unknown outcome requiring reconciliation.                                             |

Reuse the scan candidate vocabulary for printing and canonical card identifiers. Keep language, finish, and condition separate from recognition confidence. Do not invent confidence thresholds before evaluating labeled images. A submitted result must refer to an artifact owned by the authenticated account; clients cannot choose another account through a payload field.

For proposed event endpoints, persist the event identifier and accepted payload digest with the result. Replaying the same identifier and payload returns the recorded outcome without another effect. Reusing an identifier with changed content is a conflict. A device persists pending events and their identifiers before transmission. A server acknowledgement confirms durable receipt, not physical arrival.

The device-to-microcontroller transport is undecided. Whichever transport is chosen must correlate commands and results, reject duplicate movement commands, and stop feeding when card position is unknown. Spellbook should exchange job intent and outcomes with the device controller; browser timing must not control individual motor pulses.

## State, inventory, and recovery

The proposed card cycle is `presented`, `captured`, `awaiting_review`, `approved`, `move_requested`, `placed`, then `recorded`. Rejected candidates enter a review tray or pause for the operator. A jam, double feed, lost card-position signal, or uncertain outcome enters `needs_reconciliation`. These are proposed device states, not new values for the current scan-session status column.

An approved import records a newly owned copy only after the required physical outcome is confirmed. For a scan-only phone flow, the operator confirms the held card and its import. For a sorter, the device must report arrival at the output tray, or the operator must reconcile the card manually. Once location and assignment storage exists, update it from successful placement results, never from a commanded movement or motor acknowledgement.

Sorting an already owned card must not call inventory add again. Recognition identifies a printing, not a uniquely owned copy. A future physical-inventory model must distinguish the same printing held in different places and quantities assigned to different decks. It must retain printing, language, finish, condition, location, and assignment without merging incompatible copies. Decide whether individual copy identifiers or quantity allocations are sufficient when the handling workflow is known.

Current supported finishes are `nonfoil` and `foil`; additional finishes require an explicit schema and validation change. Do not silently map an unsupported finish to one of those values. A printing ID carries catalog identity, including its language, but the current inventory model is not a physical tracking system. Spellbook display positions are not box or tray locations.

A deck job freezes the requested deck entries for the run. Allocate each fed card at most once, prefer exact printing matches, and require an explicit policy for alternate printings. Report the selected output, rejected or uncertain cards, and requirements missing from the fed stack. Inventory elsewhere does not prove that the robot can access those cards. Finishing the job must not claim a physical deck assignment until confirmed placements and assignment storage support it.

After a network failure, retry recorded software events with their original identifiers. After a controller restart or lost movement acknowledgement, reconcile the card's observed position before moving again. Do not blindly replay motor commands. Recovering software state cannot reverse a card that already moved. Retain an unresolved placement until sensor evidence or the operator establishes its destination.

## Prototype acceptance

1. A phone or simulated client creates a session, submits an image, shows candidates or manual catalog selection, and imports only after confirmation. A repeated commit has one inventory effect, and another account cannot read the artifact.
2. External recognition submits results for an owned artifact with a stable event identifier. Tests cover duplicate and conflicting events, stale results, unknown printings, and interrupted delivery. No automatic inventory mutation occurs.
3. A bench device demonstrates one-card separation, capture, and confirmed arrival in one tray. Double feeds, jams, restart, and uncertain position pause the run without inventing inventory or location changes.
4. Sorting applies a fixed colour, type, or set rule to a known stack. Every card is accounted for in a confirmed tray or unresolved outcome. Simulated placements remain marked simulated and do not establish physical movement.
5. Deck assembly selects from a known fed stack and reports missing requirements. Repeated canonical cards, alternate printings, and duplicate delivery events cannot allocate or record the same copy twice.

Construction, sleeved versus unsleeved cards, sleeve dimensions, card protection, separation reliability, sensor placement, tray capacity, throughput targets, and recognition accuracy remain open. Jetson model, camera, lens, lighting, OCR or embedding model, and microcontroller interfaces also require prototype evidence. The available Calliope mini 3 is an option to assess against those interfaces, not a selected controller. No hardware ADR is warranted until a real construction tradeoff is resolved.
