# ADR-0023: Local recognition in scanner clients

- Status: Accepted
- Date: 2026-10-07
- Last Reviewed: 2026-10-08
- Owners: Kyle
- Source of Truth: maintainer's explicit local-recognition decision of 2026-10-07
- Update Triggers: recognition placement, client feature parity and responsibilities, browser scanning, phone-client technology, device access, capture storage, client compatibility, supersession
- Supersedes: [ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md) for future capture and recognition placement only
- Related Docs: [Mobile and scan](../architecture/mobile-and-scan.md), [System overview](../architecture/system-overview.md), [Product specification](../product/specification.md), [Card scanner and sorter](../integrations/card-robot.md), [Application contract](../architecture/application-contract.md), [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md), [Decision index](./README.md)

## Context

Earlier planning put recognition on the server. The implemented Scan module stores uploads, accepts external candidates and commits reviewed selections; its Python worker does not recognize cards. The maintainer considered server-side exact recognition behind a device's fast sorting path, then explicitly rejected that placement.

The intended ecosystem includes the website, a phone app and a physical sorter. The phone app should provide the website's product functions as well as scanning, account login and device interaction. The maintainer also reopened browser scanning as an option and requested another review of client responsibilities.

## Decision

Future recognition of user captures follows a local-client direction. Server-side recognition is outside that direction. Phone and sorter recognition remain intended capabilities; browser capture and local browser recognition are additional options to evaluate. The exact allocation of capture, preprocessing and recognition across clients is open. Keep the fast sorting decision and slower exact recognition separable; their concrete execution hosts and scheduling need a reviewed contract.

The server may prepare public Catalog reference images, features, embeddings and versioned indices for clients. This preparation concerns known public references, not inference on user captures. Its build format, distribution protocol, model choice and per-client compatibility remain to be specified. Recognition and Condition estimation on a presented user's card stay local.

Spellbook remains authoritative for account access, Catalog identity validation and authorized Inventory/Deck operations. The backend receives client-produced recognition evidence and agreed device outcomes through reviewed contracts. A client's proposed printing does not bypass ownership, validation, review or mutation replay rules. Recognition does not itself determine whether a physical card is a new Inventory addition.

Scanning clients should use consistent recognition meanings and result contracts. This decision does not select one shared binary, language, model or runtime across browser, phones and Jetson. Native app versus PWA, supported phone platforms, recognition asset distribution and device credentials remain open. The device-login concept uses a short-lived QR displayed by the sorter and approved through the authenticated phone app; token mechanics and revocation still need a contract. Website-based confirmation remains available where the existing product already provides it; a future app review flow is not yet implemented.

Existing web Scan upload/review routes, artifact storage, the worker scaffold and their public contracts are implemented compatibility behavior. This documentation decision neither removes them nor supplies a results-only scanner protocol. Their future reuse or migration needs a reviewed contract. Whether future clients upload images for review is a separate storage decision, not permission for server inference.

## Consequences

The mechanical decision must not depend on a per-card Cloud roundtrip. The intended sorter should continue through temporary backend connection loss using local recognition and configuration. A phone acting as the recognition or job-planning host introduces a separate phone-to-sorter dependency to evaluate. This does not establish complete offline operation: local Catalog/reference availability, credentials, rules, pending changes and synchronization still need decisions.

Recognition performance, model compatibility, image quality and resource limits must be evaluated on each intended client. Backend processes need not host a recognition model, but still persist account data and accepted effects. An in-process "stateless" service does not make Inventory stateless.

The former server-recognition and Scan/Hold/Wait-for-server variants are withdrawn from active planning. The simulator can instead explore local fast versus slower exact recognition, retained results and backend connectivity without freezing the still-open physical identity strategy. The current Dashboard, website, Inventory and Deck Builder remain part of Spellbook; adding scanner clients does not replace them.

## Client-scope clarification

On 2026-10-07, the maintainer clarified that the phone app should offer the website's functions and that website scanning deserves evaluation. The earlier phone/sorter-only description was too restrictive. This ADR records local recognition placement, not a finalized responsibility split or a prohibition of browser scanning.

The phone's primary role during a sort run is login, operation and status. A phone acting as the computation core is an additional concept variant. It could host recognition and job planning while a device controller handles sensors, actuators and movement timing. Camera attachment, transport, deadlines and disconnect behavior remain open; this variant does not select a controller or replace the available Jetson.

## Follow-up

Reconcile the Wayfinder map and affected questions. Review the client responsibility split before finalizing affected reference, device-access and result contracts. [Mobile and scan](../architecture/mobile-and-scan.md#client-scope-and-open-responsibilities) owns that comparison. Keep the arbitrary-stack requirement, duplicate-counting strategy, QR/filter choices and offline requirements explicit and unresolved.

Scan UI development and navigation entrypoints are paused on current main, while the retained Scan route and API remain available. This local-recognition decision does not remove those compatibility contracts or establish a production recognizer or app release. A completed Spec, client benchmarks and integration evidence remain separate work.

## References

- [Sorter integration Wayfinder map](https://github.com/KyleDerZweite/spellbook/issues/194)
- [ADR-0003](./0003-pwa-first-mobile-and-server-side-scan.md)
- [ADR-0015](./0015-shared-backend-use-cases-and-client-contracts.md)
