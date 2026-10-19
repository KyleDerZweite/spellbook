# Spellbook website and Android design handoff

- Status: Design scaffold; independent Android direction selected for exploration, framework and implementation pending
- Last Reviewed: 2026-10-19
- Source of Truth: maintainer's revised Android direction, linked Figma files, website artifact `903b427`, routes and shared API contracts
- Update Triggers: Figma flow review, native framework selection, API parity, camera/recognition or Cardstation contracts
- Related Docs: [UI direction](./ui-design-direction.md), [Routes](./routing-and-games.md), [Mobile and Scan](../architecture/mobile-and-scan.md), [Auth](../architecture/auth.md), [Client evaluation](../integrations/scanner-platform-evaluation.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Product index](./README.md)

The maintainer rejected the earlier PWA-first recommendation and requested a complete website/Android flow scaffold. Design an independent Android app against the shared backend. A failed browser benchmark is not a prerequisite for that product choice. The earlier six-screen PWA exploration is replaced by this handoff; production PWA routes remain implemented.

## Figma workspaces

| File                                                                                     | Scope                                                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Spellbook](https://www.figma.com/design/aKZ8f01JvXu68PAOIeevbw?node-id=14-2)            | Cross-client overview, existing website references, independent Android journeys, foundations and handoff. |
| [Spellbook Cardstation](https://www.figma.com/design/mvLCjFJobIjv1gPKOi6b31?node-id=2-2) | Short handoff and one real website Dashboard reference only. Machine UI and flows stay open.               |

Start on `00 Übersicht` for the cross-client map and journey index. Open [the Android prototype](https://www.figma.com/proto/aKZ8f01JvXu68PAOIeevbw?node-id=7-15&page-id=3%3A61&starting-point-node-id=7%3A15&scaling=scale-down) to follow entry and account setup. The other seven flow starts are on `02 Android-Flows`; `03 Website-Referenz` contains the current website.

Website references are ten real Demo snapshots at 1440×1000, including light/dark Dashboard, landing, login, Search, Inventory, Deck library/editor, Categories and Settings. They preserve the current website rather than approving a redesign. Mobile frames use Spellbook's Marcellus/IBM Plex Mono and neutral palette with their own navigation and task composition.

![Representative Android entry and Overview frames exported from Figma.](./assets/mobile-app-exploration.png)

This image shows one journey; the linked Figma file owns the complete design scaffold.

## Flow coverage

| Journey           | Mobile design scope and existing counterpart                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry/account     | Welcome, instance/account entry, login/register and Overview. Website routes and bearer auth exist; native integration is new.                                                 |
| Find/use a card   | Search, filters, exact Printing details, explicit Inventory or Deck target. Both website Add actions exist.                                                                    |
| Inventory         | List, edit, Boxes, values/history and import review. Boxes are groups. Text import exists in the API, without a website import dialog; no Inventory-export feature is claimed. |
| Decks             | Library, creation/metadata, editor, import and Arena export. Keep owned quantities separate from Deck requirements.                                                            |
| Categories        | Library, criteria and explicit Review/Reset. Entry and whole-deck scopes remain distinct.                                                                                      |
| Account/settings  | Profile, Profile Card, appearance, password/session state and logout. No invented email-reset or device-management API.                                                        |
| QR authorization  | Scan/manual input, explicit account/instance review, approve/deny and expiry/retry. Approval permits one-use sign-in; requester redemption creates the session.                |
| Future extensions | Single-card capture, local recognition, review and authorized save. Cardstation phone status is an identified contract gap, not working synchronization.                       |

The scaffold has 34 editable phone frames across eight journeys, plus linked selection, confirmation and recovery panels. These are design/prototype states with sample data. They establish no Android build, live authentication, camera or recognition evidence. Prototype error variants have separate review-board entry points. Dynamic forms, conflict handling and native lifecycle need detailed acceptance before implementation.

## App choice and actual effort

Recommend [Kotlin/Jetpack Compose](https://developer.android.com/develop/ui/compose/documentation) for Android-first independent UI, with [CameraX](https://developer.android.com/media/camera/camerax/analyze) as a capture/analysis candidate. Framework selection remains open. A separate [Svelte/Capacitor client](https://capacitorjs.com/docs) is a fair alternative with a dedicated mobile UI, native adapters and bundled assets. Existing SvelteKit server loads/actions do not run inside that client.

A starter and one complete vertical slice are bounded work. Full parity also needs native DTO/HTTP integration, Back/process-restart behavior, secure session storage and QR/App Links. Much of the backend already exists. An individual Printing lookup is internal today but lacks a matching standalone GET in OpenAPI. Existing-entry PATCH changes Quantity/Notes; changing Printing/Finish/Condition needs a separate identity rule. Local recognition/reference assets, offline writes and Cardstation enrollment/jobs/sync require separate contracts. No duration estimate or production recognizer is established here.

## Review and next handoff

Walk through first login, Search-to-Inventory, Deck editing, QR approval and future capture/review/save. Check Back/Cancel, empty/pending/error states, expiry, denied camera, large text and saved-versus-retried changes. Prototype navigation is not product validation.

After flow review, the recommended first native slice is login, Catalog search, exact Printing selection and an acknowledged Inventory add visible on the website. Keep account authority, revisions and mutation replay in the existing backend. Native client state and encrypted token storage need a reviewed interface; [Keystore](https://developer.android.com/privacy-and-security/keystore) protects encryption keys, not a server-side refresh-token mechanism. Recognition remains local under [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), and Cardstation execution remains on Jetson. No production-code implementation starts from this scaffold alone.
