---
quick_id: 260630-mj0
slug: make-this-app-pinterest-t1-ready
description: Make this app pinterest T1-ready
status: complete
completed_at: 2026-06-30T21:58:00Z
---

# Quick Task 260630-mj0 Summary

## Outcome

Pinterest is wired as a T1 head with 14 same-origin read handlers and 10 guarded fail-closed write/destructive handlers.

Safe reads execute through Pinterest first-party `/resource/.../get/` endpoints on `https://www.pinterest.com` using same-origin cookies and cookie-derived CSRF headers. POST-backed mutations and destructive operations remain blocked behind `RECIPE_DOM_FALLBACK_PENDING` until live mutation UAT evidence exists.

## Changed

- Added `catalog/handlers/pinterest.js` and bundled it to `extension/catalog/handlers/pinterest.js`.
- Registered `FsbHandlerPinterest` in the service-worker import list, capability catalog, search readiness surface, origin classification, recipe-path allowlist, port-contract map, readiness report, and coverage report.
- Corrected Pinterest follow/save/unfollow descriptors and fixtures from `read` to `write`.
- Regenerated the extension catalog index and T1 readiness/tail/terminal-state reports.
- Added regression coverage for Pinterest handler shape, resource URL/body construction, CSRF sourcing, error handling, guarded mutations, origin classification, upgrade rows, and head import counts.

## Verification

- `node --check catalog/handlers/pinterest.js`
- `node --check tests/capability-head-handlers.test.js`
- `node --check scripts/verify-origin-classification.mjs`
- `node --check tests/verify-origin-classification.test.js`
- `node --check tests/head-handler-upgrade.test.js`
- `node --check tests/guarded-write-failclosed.test.js`
- `node --check scripts/report-t1-readiness.mjs`
- `node --check scripts/verify-t1-port-contract.mjs`
- `node --check extension/utils/capability-search.js`
- `node scripts/package-extension.mjs`
- `node tests/head-handler-cap.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `npm run validate:extension`
