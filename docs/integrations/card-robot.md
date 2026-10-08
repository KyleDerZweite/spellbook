# Card scanner and sorter

- Status: Proposed integration
- Last Reviewed: 2026-10-08
- Source of Truth: product requirements, scan API code, maintainer scope brief and supplied hardware concept
- Update Triggers: project responsibilities, integration planning, capture and recognition APIs, physical inventory schema, device protocol, construction choices, prototype results, local scanner recognition and device-login direction, client feature parity, browser scanning and phone computation-core variants
- Related Docs: [Product specification](../product/specification.md), [Domain model](../../GLOSSARY.md), [Mobile and scan](../architecture/mobile-and-scan.md), [API routes](../product/routing-and-games.md), [Local authentication](../operations/local-auth.md), [Sorter integration Wayfinder map](https://github.com/KyleDerZweite/spellbook/issues/194), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md)

The proposed device accepts a stack of MTG cards, separates one card at a time, captures an image, and sorts cards into output trays. Spellbook supplies the review interface, inventory, decklist, and selected sorting rule. A Jetson may run capture and recognition; a microcontroller may operate motors and read position sensors. Construction and board selection remain undecided.

Sorting may use colour, card type, or set. Each job needs a fixed mapping from those values to output trays, including multicolour, colourless, multiple card types, and unknown results. Name sorting is a possible later rule. A deck-assembly job selects matching cards from the stack actually fed into the machine and reports missing quantities. It cannot retrieve cards from arbitrary storage boxes. Physical assembly does not include AI deck suggestions.

## Planning scope and supplied concept

The maintainer's 2026-10-07 concept extends the existing website, Dashboard, Inventory and Deck Builder into an ecosystem with a phone scanner client and a physical sorter. The sorter is the machine, not a replacement name for the website. This is a private project and a possible project for the university's Embedded Systems module, which is not yet confirmed.

This effort prepares backend and client contracts, records the concept and plans an exploratory simulator. Hardware construction, machine control, CAD and optimization belong to a separate project, with eventual integration into this service. The maintainer has started local testing and 3D prototyping separately. No measurements or design revisions from that work have been incorporated into this software contract. [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md) records local recognition as the direction; exact client responsibilities need another review. The backend manages authorized account data and can prepare public references; it does not infer a presented user's card from its images.

The eventual destination remains a buildable Spec with a simulator-based integration plan. Immediate work is documentation and experiments that show Input, Scan, transport, six boxes and Eject alongside a rough component list. The [Sorter integration Wayfinder map](https://github.com/KyleDerZweite/spellbook/issues/194) indexes the decisions. A completed Spec, implemented simulator and real hardware evidence do not yet exist.

The [scanner platform evaluation](./scanner-platform-evaluation.md) researches client/runtime and host/controller alternatives, including OSS maintenance, self-hosting and reproduction. It proposes experiments without selecting construction or implementation contracts.

The maintainer proposed new-intake, re-sorting and possibly physical deck-assembly modes but kept their semantics and the duplicate-counting strategy open. Arbitrary input stacks without known source boxes must be supported. A known source box can help a workflow; it is not a prerequisite. A capture identifier correlates a presentation and its processing, not a permanent physical-copy identity or proof that the card is newly owned.

## Physical concept

Version 0 presents one card at a time. A weight presses the input stack downward and a motorized roller extracts its bottom card through a narrow opening. Separation reliability and any additional separator remain engineering questions. The card slides down a scanning ramp before an upper conveyor grips it. The conveyor is intended to run continuously; pressure, guidance, timing and arrival detection remain unproven construction choices.

Three positions along the straight path each contain a flap and a left/right rocker. An opened flap releases the card downward to its rocker, producing six removable box destinations. With all flaps closed, the card continues to a fixed end-of-line Eject. Exact geometry and actuation are undecided. The available Jetson Orin Nano Super development kit and HD Logitech USB camera are test equipment, not proof that a chosen control or recognition pipeline meets the movement deadline. Direct Jetson actuation versus a separate microcontroller remains open.

Eject is a regular seventh output. It handles unmatched or uncertain cards, absent/unavailable destinations, intentional output and proposed deck assembly. Logical uncertainty should route a card there rather than stop the whole run, provided its physical position is known and the machine can perform that routing. Jams, double feeds and unknown position still require safe device handling; a straight path alone does not prove a safe outcome in those cases.

## Box identity and availability

Each removable box has a durable identity independent of its current left/right row position and a configurable rule. Candidate filters include colour, colour identity, set, rarity, card type and membership in a selected decklist. Overlapping filters, priority, unknown attributes and rule changes during a run require explicit semantics.

The concept puts a QR marker on the rear inner wall, viewed at an angle. One camera or reader per position is an idea, not a selected part. QR may carry a filter or reference a versioned configuration. An ID/config-reference design permits a stored rule to change without reprinting the marker, but offline evaluation requires that configuration on the device. QR payload, optional signatures and configuration activation remain open.

The intended availability rule is deliberate: a visible, recognized QR makes the box available; when cards hide it, further matching cards go to Eject. The signal establishes unavailability, not its cause. Occlusion due to capacity, a missing box and a failed read must not be presented as independently verified observations. Whether additional presence/capacity sensing is necessary remains a hardware decision. A box change before a queued card arrives requires correlation with the observed outcome.

## Local fast and slow recognition

Installed box rules determine the attributes needed for a local fast decision. When those attributes are reliably available, the device chooses a box or Eject before the routing deadline. Five monocolour destinations plus colourless make six boxes; this does not settle whether their rules use card colour or Commander colour identity. [Magic rules 105 and 903.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt) distinguish both from frame colour and include rules-text and back-face contributions to colour identity. Set or deck-membership rules may require stronger identification. No confidence thresholds or measured classifier latency are selected.

Captured frames also feed a slower local queue for exact printing, language, finish evidence and optional Condition estimation. Recognition candidates and estimates remain distinguishable from confirmed data. The [scan architecture](../architecture/mobile-and-scan.md#proposed-recognition-pipeline) owns candidate methods and evaluation. No model, OCR package, local index or cross-platform runtime is selected. Multiple frames and specialized crops are evaluation ideas, not proven improvements.

The mechanical path must not wait for Cloud inference. A temporary network loss should leave local routing possible when the needed references, rules and credentials are available. Queue storage, restart recovery, permitted offline actions and later sync remain to be designed. Sustained capture faster than the slow path requires bounded backlog and admission control; a queue does not create sustainable throughput.

Retain captures, rule/box context, selected targets and actual placement observations until exact results and synchronization finish. A selected target is not confirmed arrival, and late recognition may contradict the earlier physical decision. Neither result automatically establishes a new owned copy. The existing review requirement and proposed placement constraints below remain the starting point while the intake strategy is unresolved.

## Backend, phone and device responsibilities

Spellbook owns Accounts, Catalog, Inventory, Decks and their authorized mutations today. Machines, boxes, device sessions, physical locations and movements are planned extensions. Public reference preparation may include images, features, embeddings and versioned indices for local recognition; preparation and distribution contracts are unbuilt. It concerns known reference data, not processing user captures on the server.

The phone app should offer the website's product functions as well as local scanning. During a sort run it primarily provides login, operation and status. The machine-login concept displays a short-lived QR on the sorter; the signed-in phone app scans and approves it through the backend, after which the sorter obtains an authorized machine session. Keep default machine ownership, the active account and the current machine session distinct. Guest/shared use and resale are future considerations, not required Version 0 features. Enrollment, QR binding, credentials, permissions, expiry, revocation and offline recovery need a reviewed Auth contract. No passwords or existing bearer tokens belong in a public QR.

The existing website and Dashboard remain useful for Inventory, Deck and later machine/job management. Browser camera scanning and local browser recognition are options to evaluate. A machine display and phone interface are proposed additional views of authorized state. Native phone app versus PWA, device-to-phone communication and reuse of recognition implementation remain open. The existing image-upload/review route and API remain available; Scan UI development and navigation entrypoints are paused. [Mobile and scan](../architecture/mobile-and-scan.md#client-scope-and-open-responsibilities) owns the open client split.

The supplied concept hosts recognition and local job processing on Jetson. A phone acting as the computation core is an additional variant to examine, not a selected replacement. It could provide recognition and job planning while a device controller operates sensors and actuators with local movement timing. Camera placement and attachment, the command/result transport, deadlines and phone-disconnect behavior need evidence. The simulator can compare this variant without pretending it already works with the available equipment.

The proposed meaning of a "stateless" backend is that a service process does not own motor timing or depend on its memory to resume machine work. Account Inventory, accepted-event evidence and review state still require durable storage. Machine-process state and durable account state must have separate owners in the integration contract.

For proposed deck assembly, the user chooses a Deck and may empty relevant boxes into the input. Matching required cards go to Eject as the assembly output; remaining cards follow available sorting rules. The machine cannot retrieve from arbitrary storage. A new pass must not add already owned cards again, and actual allocations still depend on the unresolved physical-location model and confirmed outcomes.

## Exploratory simulator

The desired concept surface shows Input, Scan, transport, six removable boxes and Eject. It can expose active rules, QR availability, local fast/slow results, retained captures, queue depth and backend sync. Vary local recognition delay, uncertainty, a later contradictory result and a network interruption without turning an open physical-identity rule into an assumed Inventory effect. Compare Jetson-hosted processing with a phone computation-core variant, including loss of the phone connection separately from backend interruption.

The former server-inference and waiting-for-server variants are withdrawn after the maintainer's correction. Simulate local scheduling and deferred synchronization instead. This surface is an exploratory model before CAD and hardware, not a measured motion model or a completed integration acceptance suite. The rough component inventory below distinguishes known equipment from conceptual requirements.

### Rough component inventory

This is a concept checklist, not a selected bill of materials. Counts describe the supplied mechanism; they do not select parts or prove a workable design.

| Item                                                              | Concept count or status                                | Remaining choice                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Jetson Orin Nano Super development kit and HD Logitech USB camera | Available test equipment                               | Actual capture and inference limits                         |
| Weighted input stack and bottom-card feed                         | One input and one proposed motorized feed roller       | Separation, drive and double-feed detection                 |
| Ramp and Scan area                                                | One proposed scan area                                 | Lighting, geometry and any holding point                    |
| Upper conveyor and card guidance                                  | One proposed conveyor                                  | Pressure mechanism, drive and card-position observations    |
| Flaps and left/right rockers                                      | Three of each                                          | Actuation, geometry and position confirmation               |
| Removable boxes and fixed Eject                                   | Six boxes and one Eject                                | Capacity and arrival observations                           |
| Box QR identification                                             | One marker per box; one camera per position is an idea | Shared versus individual readers and availability detection |
| Machine-control electronics, power, wiring and mounts             | Required functions; exact parts and counts open        | Controller, interfaces and construction choices             |

## Current software and proposed work

Spellbook has account-owned scan sessions, image uploads, stored artifacts, candidate-shaped results, and an explicit review commit to inventory. The scan worker remains a placeholder with no production recognition. Inventory entries group quantities by printing, finish, and condition. Physical copy identifiers, locations, movements, and deck assignments are not implemented.

The retained `/mtg/scan` route implements image upload, candidate review, manual catalog selection, and explicit inventory confirmation. Scan UI development is paused and navigation entrypoints are removed. External recognizers can replace candidates for an owned artifact. The [scan architecture](../architecture/mobile-and-scan.md) and [OpenAPI source](../../frontend/src/routes/openapi.json/+server.ts) own those implemented contracts. Direct camera capture, device controllers, sorting jobs, motor protocols, sensor-confirmed outcomes, and construction remain proposed.

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

Plan phone and simulated device adapters around locally produced recognition evidence. The current image-upload API is available for compatibility, but a results-only device contract is not implemented. Recognition output is evidence for review, not permission to add inventory. Manual selection of a catalog printing must remain possible when recognition returns no result. The initial robot integration must retain explicit confirmation before importing a newly owned card.

The following records are proposed and need versioned API definitions before implementation:

| Record             | Minimum information                                                                   | Meaning                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Job                | `jobId`, requested handling intent, rule or deck snapshot, destination mapping        | The operator's requested work. Mode semantics and permitted Inventory effects remain unresolved.                |
| Capture            | `captureId`, `jobId`, sequence number, capture digest, optional Scan/image references | One observed card presentation. Recapturing the same held card must not create another owned copy.              |
| Recognition result | `eventId`, `captureId`, model version, status, candidates, optional `artifactId`      | Locally computed printing candidates and evidence. The server validates account ownership and Catalog identity. |
| Move command       | `commandId`, `captureId`, target tray                                                 | Permission to attempt a physical movement, not proof of arrival.                                                |
| Placement result   | `eventId`, `commandId`, `captureId`, outcome, observed tray, sensor evidence          | Confirmed arrival, a jam, or an unknown outcome requiring reconciliation.                                       |

Reuse the scan candidate vocabulary for printing and canonical card identifiers. Keep language, finish, and condition separate from recognition confidence. Do not invent confidence thresholds before evaluating labeled images. The existing result endpoint requires an artifact owned by the authenticated account. A future results-only contract instead needs an authorized machine/job/capture binding, with its image-retention policy still open. Optional references in this proposed table do not change today's API. Clients cannot choose another account through a payload field.

For proposed event endpoints, persist the event identifier and accepted payload digest with the result. Replaying the same identifier and payload returns the recorded outcome without another effect. Reusing an identifier with changed content is a conflict. A device persists pending events and their identifiers before transmission. A server acknowledgement confirms durable receipt, not physical arrival.

The device-to-microcontroller transport is undecided. Whichever transport is chosen must correlate commands and results, reject duplicate movement commands, and stop feeding when card position is unknown. Spellbook should exchange job intent and outcomes with the device controller; browser timing must not control individual motor pulses.

## State, inventory, and recovery

Physical routing and digital interpretation progress separately. A presented card can be captured, receive a fast target, move and arrive while exact recognition, review or synchronization remains pending. Logical uncertainty uses regular Eject when physical routing remains possible. A jam, double feed, lost position or uncertain placement requires device handling and reconciliation. These are conceptual lifecycles, not selected protocol enums or new values for the current Scan-session status column.

The digital lifecycle retains local captures and recognition evidence, then applies the review and authorized Inventory effect selected for that handling intent. Physical arrival does not authorize a new owned quantity, and a recognition result does not establish arrival. The duplicate-intake strategy and final mode semantics remain open for simulator and hardware experiments.

An approved import records a newly owned copy only after the required physical outcome is confirmed. For a scan-only phone flow, the operator confirms the held card and its import. For a sorter, the device must report arrival at the output tray, or the operator must reconcile the card manually. Once location and assignment storage exists, update it from successful placement results, never from a commanded movement or motor acknowledgement.

Sorting an already owned card must not call inventory add again. Recognition identifies a printing, not a uniquely owned copy. A future physical-inventory model must distinguish the same printing held in different places and quantities assigned to different decks. It must retain printing, language, finish, condition, location, and assignment without merging incompatible copies. Decide whether individual copy identifiers or quantity allocations are sufficient when the handling workflow is known.

Current supported finishes are `nonfoil` and `foil`; additional finishes require an explicit schema and validation change. Do not silently map an unsupported finish to one of those values. A printing ID carries catalog identity, including its language, but the current inventory model is not a physical tracking system. Spellbook display positions are not box or tray locations.

A deck job freezes the requested deck entries for the run. Allocate each fed card at most once, prefer exact printing matches, and require an explicit policy for alternate printings. Report the selected output, rejected or uncertain cards, and requirements missing from the fed stack. Inventory elsewhere does not prove that the robot can access those cards. Finishing the job must not claim a physical deck assignment until confirmed placements and assignment storage support it.

After a network failure, retry recorded software events with their original identifiers. After a controller restart or lost movement acknowledgement, reconcile the card's observed position before moving again. Do not blindly replay motor commands. Recovering software state cannot reverse a card that already moved. Retain an unresolved placement until sensor evidence or the operator establishes its destination.

## Prototype acceptance

1. A phone or simulated client creates a session, submits an image, shows candidates or manual catalog selection, and imports only after confirmation. A repeated commit has one inventory effect, and another account cannot read the artifact.
2. External recognition submits results for an owned artifact with a stable event identifier. Tests cover duplicate and conflicting events, stale results, unknown printings, and interrupted delivery. No automatic inventory mutation occurs.
3. A bench device demonstrates one-card separation, capture, and confirmed arrival in one tray. Double feeds, jams, restart, and uncertain position pause the run without inventing inventory or location changes.
4. Sorting applies a fixed colour, type, or set rule to a labeled evaluation stack, including input without known source boxes. Every card is accounted for in a confirmed destination or unresolved outcome. Simulated placements remain marked simulated and do not establish physical movement.
5. Deck assembly selects from a known fed stack and reports missing requirements. Repeated canonical cards, alternate printings, and duplicate delivery events cannot allocate or record the same copy twice.

Construction, sleeved versus unsleeved cards, sleeve dimensions, card protection, separation reliability, sensor placement, tray capacity, throughput targets, and recognition accuracy remain open. Jetson model, camera, lens, lighting, OCR or embedding model, and microcontroller interfaces also require prototype evidence. The available Calliope mini 3 is an option to assess against those interfaces, not a selected controller. No hardware ADR is warranted until a real construction tradeoff is resolved.
