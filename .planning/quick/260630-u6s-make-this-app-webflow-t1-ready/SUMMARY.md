---
status: complete
completed: 2026-07-01T02:55:00Z
quick_id: 260630-u6s
slug: make-this-app-webflow-t1-ready
commit: working-tree
---

# Summary

Made Webflow T1-ready by adding a same-origin `T1a` read head for all 15 existing `webflow.*` descriptors. The handler is pinned to `https://webflow.com`, uses only `executeBoundSpec`, calls the vendored `/api` GET endpoints, maps Webflow response shapes, and fails closed with `RECIPE_DOM_FALLBACK_PENDING` on missing primitives, auth/HTTP failures, or unexpected response shapes.

## Files Changed

- Added `catalog/handlers/webflow.js`.
- Added `extension/catalog/handlers/webflow.js`.
- Registered Webflow in service-worker startup, head seeding, readiness loading, port verification, origin classification, coverage, recipe-path guard, and search readiness override surfaces.
- Added Webflow coverage to handler, head-upgrade, readiness, and origin-classification tests.

## Verification

Passed:

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- Webflow-only readiness/port check: all 15 Webflow rows are `t1-ready` with `handler` proof and pass `validateHandlerRows()`.

Known non-Webflow blockers in the dirty workspace:

- `node tests/t1-readiness-report.test.js` fails on existing Todoist rows.
- `node tests/t1-terminal-states.test.js` fails on existing Excel/Retool guarded evidence records.
- `node scripts/verify-t1-port-contract.mjs` fails on existing Excel/Retool/Todoist rows.
- `node scripts/verify-origin-classification.mjs` and `node tests/verify-origin-classification.test.js` fail on existing Snowflake/Excel/Costco/Discord/Todoist/PowerPoint origin-classification issues.
- `node scripts/verify-recipe-path-guard.mjs` fails because existing `catalog/handlers/todoist.js` is not allowlisted.
- `node tests/coverage-report.test.js` fails because existing Costco rows are handler-backed in a Phase-39 DOM-only assertion.
