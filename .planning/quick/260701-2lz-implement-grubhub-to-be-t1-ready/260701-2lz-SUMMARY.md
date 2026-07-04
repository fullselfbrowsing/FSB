# Quick Task 260701-2lz Summary: Implement Grubhub to be T1 ready

**Date:** 2026-07-01
**Status:** Complete

## Changes

- Added `catalog/handlers/grubhub.js` and synced `extension/catalog/handlers/grubhub.js`.
- Registered `FsbHandlerGrubhub` in the extension loader and capability catalog.
- Added Grubhub awareness to T1 readiness, T1 port-contract, origin-classification, and recipe-path guard surfaces.
- Added Grubhub coverage to head-handler, upgrade, readiness, and extension parity tests.

## Behavior

- `grubhub.list_restaurants`, `grubhub.get_restaurant`, and `grubhub.list_orders` are T1a same-origin read handlers pinned to `https://www.grubhub.com`.
- Read handlers build GET-only bound specs and execute only through `ctx.executeBoundSpec`.
- `grubhub.place_order` and `grubhub.cancel_order` are registered as guarded fail-closed handlers returning `RECIPE_DOM_FALLBACK_PENDING` with `fellBackToDom: true`.

## Verification

- PASS: `node -c catalog/handlers/grubhub.js`
- PASS: `node -c extension/catalog/handlers/grubhub.js`
- PASS: `cmp -s catalog/handlers/grubhub.js extension/catalog/handlers/grubhub.js`
- PASS: custom Grubhub direct handler check for slugs, bound-spec URLs, same-origin origin pinning, and guarded fail-closed mutations.
- PASS: `node tests/head-handler-cap.test.js`
- PASS: `node tests/head-handler-upgrade.test.js`
- PASS: `node tests/t1-readiness-report.test.js`
- PASS: syntax checks for touched extension and verifier files.
- PARTIAL: `node scripts/verify-origin-classification.mjs` now reports Grubhub as `SAME-ORIGIN`, but fails on unrelated heads.
- PARTIAL: `node scripts/verify-recipe-path-guard.mjs` has no Grubhub failure, but fails on unrelated allowlist drift.
- PARTIAL: `node scripts/verify-t1-port-contract.mjs` has no Grubhub failure, but fails on unrelated PostHog/TikTok rows.
- PARTIAL: `node tests/capability-head-handlers.test.js` passes Grubhub copy parity, but the full aggregate test fails on unrelated Home Depot and Sentry cases.

## Blockers

- Existing concurrent non-Grubhub failures remain in origin classification, recipe path guard, T1 port contract, and aggregate head-handler tests.
- `.planning/STATE.md` was left untouched because it already has unrelated concurrent edits in this workspace.
