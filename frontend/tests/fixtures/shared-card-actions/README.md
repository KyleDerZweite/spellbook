# Shared Card adapter proof fixture

This test-only route mounts the production shared components and exported native actions. It is not the production Search loader or integration acceptance. The fixture substitutes an explicit optional read failure and a response lost after a real commit. It rewrites form targets only in its own rendered host so shared components can reach the fixture actions.

In an isolated worktree with the assigned disposable target `spellbook_shared_cards_20261007` and free port 5282, copy this directory's `+page.server.ts` and `+page.svelte` into `src/routes/_shared-card-actions-proof/`. From `frontend/`, load the protected environment, build with its matching `APP_ORIGIN`, then run `node --test tests/shared-card-actions-http.test.ts`. The test writes protected own-account browser fixture references under the worktree's ignored `.local/design-review/`.

Stop the owned runtime, remove that temporary route, and rebuild before freezing the production candidate. A final manifest must contain no `_shared-card-actions-proof` route. Root must separately wire and verify the actual Search loader, action and native panel. This fixture does not establish rendered, touch, account-lifetime or composed Search/Inventory acceptance.
