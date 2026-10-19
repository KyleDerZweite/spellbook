# Spellbook website and Android design handoff

- Status: Revised design proposal; separate Android application selected, maintainer acceptance and native implementation pending
- Last Reviewed: 2026-10-19
- Source of Truth: maintainer's revised Android direction, inspected first-party app images and versioned mobile source, linked Figma files, website artifact `903b427` and shared API contracts
- Update Triggers: mobile visual/flow review, framework selection, API parity, native session lifecycle, camera/recognition or Cardstation contracts
- Related Docs: [UI direction](./ui-design-direction.md), [Routes](./routing-and-games.md), [Mobile and Scan](../architecture/mobile-and-scan.md), [Auth](../architecture/auth.md), [Client evaluation](../integrations/scanner-platform-evaluation.md), [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md), [Product index](./README.md)

The maintainer selected a separate Android application with its own UI and lifecycle against the shared backend. The first mobile visual scaffold was rejected on 2026-10-19. It is not the current design direction. The replacement uses actual mobile-app references, artwork, a useful Dashboard-like Home, public Search and contextual sign-in. The implemented PWA is not the future app design.

## Figma files and review

| File                                                                                     | Scope                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Spellbook](https://www.figma.com/design/aKZ8f01JvXu68PAOIeevbw?node-id=42-2)            | Visual overview, revised Android prototype, source references and implementation handoff. Existing website captures remain a separate implementation inventory. |
| [Spellbook Cardstation](https://www.figma.com/design/mvLCjFJobIjv1gPKOi6b31?node-id=2-2) | Only the real public Landing page and a short handoff. The unfinished Dashboard is not its design reference.                                                    |

Start at `00 Übersicht`, then open the current Android journey. The earlier mobile page is marked rejected. Website typography and routes remain unchanged. Marcellus, IBM Plex Mono and neutral surfaces preserve the brand; the app has its own navigation and composition. Sample data and technical notes belong outside phone screens.

![Revised Android Home, Search, Inventory and contextual Login exported from Figma.](./assets/mobile-app-exploration.png)

## Visible references

| Inspected first-party source                                                                       | Adapted pattern                                                                     |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Letterboxd Android](https://letterboxd.com/crew/story/huge-update-to-our-android-app-is-out-now/) | Large artwork, neutral dark chrome and readable image grids.                        |
| [ManaBox](https://www.manabox.app/)                                                                | Compact Inventory/Box rows with artwork, counts and adjacent search.                |
| [Pocket Casts Search](https://blog.pocketcasts.com/2025/11/18/search/)                             | Persistent search, one filter row and concise image/name/metadata results.          |
| [T3 Code Android](https://play.google.com/store/apps/details?id=com.t3tools.t3code)                | Compact headers, content hierarchy, a named primary action and contextual controls. |

The downloaded product images establish visible design, not conversion or Spellbook usability. Competitor branding, markets, physical-storage semantics and social features are not adopted. Android onboarding illustrations are guidance, not verified real-app login screenshots.

## T3 Code Android follow-up

The maintainer requested this additional reference on 2026-10-19. Official Android phone screenshots were inspected alongside source commit `1451e7cb23034d29774338608368a15d8845df36`. T3 has a separate React Native client with a [Compose App Bar](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/mobile/src/components/ui/NativeAppBar.android.tsx#L1-L40) and [native Material3 navigation](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/mobile/modules/t3-native-controls/android/src/main/java/expo/modules/t3nativecontrols/T3WorkspaceNavigationModule.kt#L103-L126). This supports a separate mobile presentation without selecting Spellbook's framework.

Propose a compact Inventory header, clear card-row hierarchy, one named Add cards action and contextual entry editing. Keep the four Spellbook destinations, artwork, fonts and public Search contract. The editor changes Quantity and Notes, keeps Printing, Finish and Condition fixed, and requires an explicit Save.

For implementation, specify Keyboard/Back order, retained query/draft context and distinct loading, refresh, error and empty states. T3 implements [keyboard-first Back handling](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/mobile/src/features/home/ThreadListToolbar.tsx#L53-L86) and [platform-specific sheets](https://github.com/pingdotgg/t3code/blob/1451e7cb23034d29774338608368a15d8845df36/apps/mobile/src/components/ui/Sheet.android.tsx#L9-L28). Its chat gestures, hidden filters and device-connection model are not automatic Spellbook requirements.

The [Figma comparison](https://www.figma.com/design/aKZ8f01JvXu68PAOIeevbw/Spellbook?node-id=58-107) contains two static, editable Spellbook proposals beside the actual T3 references. It does not replace the current flow graph. Store images show Light Mode and have no stated capture commit; they are not revision-matched to the inspected source. Source review and static images establish no Android runtime, gesture, keyboard or performance result.

![T3 Code Android references beside the proposed Spellbook Inventory and explicit entry editor.](./assets/t3-android-ui-comparison.png)

## Main journeys

Home, Search, Inventory and Decks are four stable destinations. The signed-in Home shows owned copies, Canonical-card counts, exact/alternate/missing Deck requirements and recently edited cards. A guest gets usable Catalog content and Search. No invented trends or gains appear. Account actions and QR authorization sit behind the avatar.

Search and Printing details remain public. A guest selects a Printing and prepares Quantity, Finish and Condition. Save opens Login or Registration. Success returns to the same unsaved draft; the user confirms Save explicitly. Cancel retains the public context. Direct Login opens Home; an explicitly requested private destination resumes that destination. Login never creates an Inventory entry. Invalid credentials and failed or unconfirmed saves retain their inputs. [Android onboarding](https://developer.android.com/design/ui/mobile/guides/patterns/onboarding) and [conditional navigation](https://developer.android.com/guide/navigation/use-graph/conditional) inform this proposal.

Deck quantities remain requirements, Inventory quantities remain ownership, and Boxes remain groups. QR requires explicit account/instance approval; requester redemption creates the ordinary session. It is not machine enrollment or synchronization. Camera permission belongs at the scan action. Local recognition and Jetson-owned Cardstation execution follow [ADR-0023](../decisions/0023-local-recognition-in-scanner-clients.md).

## Implementation handoff

Recommend [Kotlin/Jetpack Compose](https://developer.android.com/develop/ui/compose/documentation) for Android-first UI, with [CameraX](https://developer.android.com/media/camera/camerax/analyze) as a later capture candidate. Framework selection remains open. The first native slice should cover public Search, exact Printing, contextual Login and acknowledged Inventory addition visible on the website.

The API already supports much of the product. A public single-Printing GET by Printing ID, native session storage/App Links/lifecycle, local reference assets, offline writes and device jobs/sync need separate reviewed contracts. Existing-entry PATCH changes Quantity/Notes; changing Printing/Finish/Condition needs a separate identity rule. Keep [auth authority](../architecture/auth.md) and [Inventory/Deck/category contracts](../architecture/mobile-and-scan.md) in the shared backend.

The Figma fields and responses simulate fixture states. Rendered Dark Mode and prototype reactions do not establish native forms, keyboard/Back behavior, Light Mode, real authentication, physical-phone capture or recognition. Product acceptance and native implementation remain separate work.
