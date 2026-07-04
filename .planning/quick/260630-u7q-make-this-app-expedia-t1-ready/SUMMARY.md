---
status: complete
completed: 2026-07-01T02:55:14Z
quick_id: 260630-u7q
slug: make-this-app-expedia-t1-ready
commit: working-tree
---

# Summary

Made Expedia T1-ready for the six safe public search/navigation rows: `expedia.navigate_to_hotel`, `expedia.search_activities`, `expedia.search_car_rentals`, `expedia.search_cruises`, `expedia.search_flights`, and `expedia.search_packages`.

The new handler is pinned to `https://www.expedia.com`, uses only `executeBoundSpec`, performs same-origin HTML GETs, returns the generated public search URL without page navigation, and fails closed with the shared `RECIPE_DOM_FALLBACK_PENDING` fallback when the runtime primitive or HTML shape is unavailable.

## Files Changed

- Added `catalog/handlers/expedia.js`.
- Added `extension/catalog/handlers/expedia.js`.
- Registered Expedia in service-worker startup, head seeding, readiness reporting, coverage, recipe-path guard, T1 port verification, origin classification, and search readiness override surfaces.
- Added Expedia coverage to handler, head-upgrade, head-cap, readiness, terminal-state, and origin-classification tests.

## Verification

Passed:

- `node -c catalog/handlers/expedia.js`
- `node -c extension/catalog/handlers/expedia.js`
- `cmp catalog/handlers/expedia.js extension/catalog/handlers/expedia.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `npm run package:extension`
- Direct post-package resolver/readiness checks confirm the six promoted Expedia rows resolve to `t1-ready`/`T1a` with handler proof, while excluded rows remain discovery-pending.

Known non-Expedia blockers in the dirty workspace:

- `node tests/capability-head-handlers.test.js` passes the Expedia assertions but fails one existing Retool envelope assertion.
- `node scripts/report-t1-readiness.mjs` fails on existing Costco handler-backed rows.
- `node scripts/verify-t1-port-contract.mjs` fails on an existing Excel `reauthenticate` contract mismatch.
- `node scripts/verify-origin-classification.mjs` fails on existing unmapped Snowflake, Costco, Discord, and Todoist heads; Expedia origin proof is reported as same-origin.
- `node scripts/verify-recipe-path-guard.mjs` fails because existing Costco and Todoist handlers are not allowlisted.
