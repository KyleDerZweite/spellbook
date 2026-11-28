# ADR-0031: Expo mobile app for iOS and Android

- Status: Accepted
- Date: 2026-11-28
- Last Reviewed: 2026-11-28
- Source of Truth: [Issue #460](https://github.com/KyleDerZweite/spellbook/issues/460)
- Update Triggers:
  - Mobile platform or application ownership
  - Web, mobile and API boundaries
- Related Docs:
  - [ADR-0024](./0024-independent-applications.md)
  - [Independent applications](../architecture/independent-applications.md)
  - [Mobile and Scan](../architecture/mobile-and-scan.md)

## Context

ADR-0024 established independent web, API and mobile applications. Its Kotlin and Jetpack Compose
selection covered Android alone. Spellbook now needs a single mobile implementation for iOS and
Android while retaining the SvelteKit website and PWA.

## Decision

Adopt Option A. Keep SvelteKit in `frontend/` as the web application and PWA. Replace the Kotlin and
Compose project in `android/` with an Expo and React Native application in `apps/mobile/`. The app
uses the existing [OpenAPI contract](../../contracts/openapi.json) and shares one mobile codebase
across iOS and Android.

This decision supersedes the mobile stack selection in ADR-0024. Independent web, API and mobile
ownership continues to apply.

## Consequences

Remove the standalone Android project and its Gradle CI workflow. The companion mobile MVP
implements the Expo app, its tooling and device verification. Both mobile targets need platform
acceptance even though they share application code.
