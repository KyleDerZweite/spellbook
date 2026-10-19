# Mobile app exploration

- Status: Research and proposal; not an accepted implementation contract
- Last Reviewed: 2026-10-19
- Source of Truth: linked primary guidance, PR 231 source at `903b427`, maintainer's mobile UX research request
- Update Triggers: mobile navigation and onboarding selection, Figma review, target-phone evidence, capture and local-recognition requirements, client packaging
- Related Docs: [UI direction](./ui-design-direction.md), [Client evaluation](../integrations/scanner-platform-evaluation.md), [Mobile and Scan](../architecture/mobile-and-scan.md), [Auth](../architecture/auth.md), [Frontend](../architecture/frontend.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Product index](./README.md)

Recommend a task-focused mobile UI with contextual onboarding. Retain PWA for current QR/Inventory/Deck use; benchmark future local recognition before selecting native capabilities. Presentation and packaging are separate choices. This is a proposal, not production UI or a replacement platform decision.

## What changes on mobile

The current [App hub](../../frontend/src/routes/app/+page.svelte) repeats account/install explanations. [Navigation](../../frontend/src/lib/components/layout/Nav.svelte) combines the website header with five installed-mode destinations.

[Android onboarding guidance](https://developer.android.com/design/ui/mobile/guides/patterns/onboarding) recommends contextual learning and questions whether a walkthrough is necessary. [Permission guidance](https://developer.android.com/training/permissions/requesting) requests access when the action needs it and preserves alternatives after denial. Apply these patterns:

- Start with a useful action, without a mandatory introductory carousel. Returning users go straight to their workspace.
- Use four destinations: Home, Search, Inventory and Decks. Make QR authorization a Home action. Avoid a second hamburger destination menu. This fits [Android peer navigation](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns).
- Remove repeated marketing, install-status cards and the website footer from installed task screens. Keep account, help and legal links accessible through account/settings.
- Retain Spellbook typography. Use visible Back/Cancel, safe areas and keyboard-aware forms. Android's [48 dp target](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility) informs a web target of 48 CSS px; validate on-device with large text.

## Proposed first useful journey

[Figma exploration](https://www.figma.com/design/YJV0in350zzTEtZVfaZxmk?node-id=2-13) contains six editable static frames, not a running app. Manual entry, error states and signed-out continuation are annotated only. [Rendered concept](./assets/mobile-app-exploration.png).

| State            | Purpose and concise copy                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| First launch     | Sign in or create an account; public Search remains available. No camera prompt yet.                                                             |
| Signed-in Home   | Primary `QR scannen`; Inventory and Deck access. Omit installation instructions once installed.                                                  |
| First camera use | Explain camera use beside `Kamera öffnen`; offer `Link eingeben`. Browser/Android owns the real permission prompt.                               |
| QR viewfinder    | Framing cue, Cancel and manual fallback. Pause/release the camera on leave or backgrounding.                                                     |
| Approval         | `Anmeldung erlauben?` with account, instance and request identifier; explicit Allow/Deny. Preserve QR intent through login, then recheck expiry. |
| Success          | `Anmeldung freigegeben`; return to Home. Expired, denied or failed requests offer a new code or retry.                                           |

QR approval permits one-use sign-in; requester redemption creates the account session. Hardware enrollment, Cardstation synchronization and jobs remain unbuilt. Retain security context despite shorter copy.

Future card scanning remains separate and unimplemented: capture, local recognition, review Printing/Finish/Condition/Quantity, authorized Inventory save. Legacy Scan presentation stays paused.

## Is PWA the right delivery?

| Option                   | Assessment for Spellbook                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PWA                      | Reuses SvelteKit SSR/cookie auth with a distinct mobile layout. [Brave installation can use a shortcut rather than a WebAPK](https://web.dev/learn/pwa/installation); emulator standalone launch does not prove Honor compatibility.                                                      |
| Capacitor with Svelte UI | A candidate for required native plugins. [Bundled web assets](https://capacitorjs.com/docs/getting-started) cannot run the existing Node server. Client/API, auth and native releases need design. [Static/SPA output](https://svelte.dev/docs/kit/adapter-static) needs separate design. |
| Kotlin/Compose           | Candidate for substantial native capture/recognition using [CameraX analysis](https://developer.android.com/media/camera/camerax/analyze). Requires another UI client and parity work.                                                                                                    |

A [Trusted Web Activity](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2) addresses store distribution, not native recognition. See the broader [client evaluation](../integrations/scanner-platform-evaluation.md#website-and-phone-app).

## Next slice and decision evidence

After owner selection, limit the first slice to `/app` and installed narrow navigation. `Shell`/`Nav` own presentation; existing workspaces and QR/backend interfaces retain state and authorization. Standalone mode informs presentation, viewport informs geometry. Neither grants access. Preserve browser routes, install help and wider layouts.

Acceptance must cover first/returning launch, signed-out QR return, permission denial, expiry, offline recovery, Android Back, keyboard and large text. The draft does not implement these behaviors.

Before a platform change, benchmark one-card foreground capture/local recognition/review/save on Kyle's exact Honor/OS/Brave. Agree quality, latency and memory budgets first. If the browser passes, retain PWA; otherwise compare a native plugin and Compose slice. Required OS integration or distribution may also justify packaging. Preserve [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md): recognition stays local, Cardstation runs on Jetson. Offline private data/reference assets/sync need separate contracts.
