# Quick Summary: Make Priceline T1-ready

Date: 2026-06-30
Quick ID: 260630-mjd
Status: implemented; Priceline-specific checks pass

## Outcome

Added a bundled T1a same-origin Priceline read head for the public first-party search/autocomplete endpoints:

- `priceline.search_airports`
- `priceline.search_locations`
- `priceline.search_points_of_interest`

The handler is pinned to `https://www.priceline.com`, uses only `ctx.executeBoundSpec`, and falls back with `RECIPE_DOM_FALLBACK_PENDING` on unexpected JSON shapes, redirects, HTTP errors, or missing bound execution context.

Auth-token GraphQL reads and browser navigation descriptors intentionally remain discovery-pending.

## Files Changed

- `catalog/handlers/priceline.js`
- `extension/catalog/handlers/priceline.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/verify-origin-classification.test.js`

## Verification

Passed:

- `node -c catalog/handlers/priceline.js`
- `node -c extension/catalog/handlers/priceline.js`
- `node -c tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node scripts/verify-recipe-path-guard.mjs`

Priceline-specific behavior checks passed inside `node tests/capability-head-handlers.test.js`.

Readiness report rows:

- `priceline.search_airports`: `t1-ready`, `T1a`, `handler`, `https://www.priceline.com`
- `priceline.search_locations`: `t1-ready`, `T1a`, `handler`, `https://www.priceline.com`
- `priceline.search_points_of_interest`: `t1-ready`, `T1a`, `handler`, `https://www.priceline.com`

Known non-Priceline shared-gate failures in the current dirty workspace:

- `node tests/capability-head-handlers.test.js` fails one Instagram assertion: `instagram.js performs NO direct network call`.
- `node tests/verify-origin-classification.test.js` fails on the concurrently added Pinterest head: expected head count and missing/invalid Pinterest origin proof.
- `node scripts/verify-origin-classification.mjs` fails on `FsbHandlerPinterest`.
- `node scripts/verify-t1-port-contract.mjs` fails on Pinterest guarded-write rows.

No Priceline failures were reported by those failing shared gates.
