---
quick_id: 260630-vop
slug: make-this-app-redfin-t1-ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Make Redfin T1-ready - Summary

## Outcome

Redfin is T1a-ready for its 12 read descriptors. The new `FsbHandlerRedfin` handler executes reviewed same-origin GET specs against `https://www.redfin.com/stingray/...`, declares RF_AUTH cookie-to-`x-rf-secure` signing through `executeBoundSpec.csrfSource`, strips Redfin's `{}&&` JSON prefix, validates Stingray envelopes, and fails closed with `RECIPE_DOM_FALLBACK_PENDING` on auth/shape/runtime issues.

## Files Changed

- `catalog/handlers/redfin.js`
- `extension/catalog/handlers/redfin.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-origin-classification.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/lattice-provider-bridge-smoke.test.js`

## Verification

- `node --check catalog/handlers/redfin.js && node --check extension/catalog/handlers/redfin.js && node --check tests/capability-head-handlers.test.js && node --check scripts/verify-origin-classification.mjs`
- `node tests/capability-head-handlers.test.js` -> 1254 passed, 0 failed
- `node tests/head-handler-upgrade.test.js` -> 3723 passed, 0 failed
- `node tests/head-handler-cap.test.js` -> 5 passed, 0 failed
- `node scripts/verify-origin-classification.mjs` -> PASS, 61 shipped heads, 0 silent cross-origin ports
- `node scripts/verify-t1-port-contract.mjs` -> PASS, 985 T1 rows, 979 handler rows, 281 guarded fail-closed
- `node tests/verify-origin-classification.test.js` -> 156 passed, 0 failed
- `node tests/lattice-provider-bridge-smoke.test.js` -> 101 passed, 0 failed
- Redfin readiness probe confirmed all 12 Redfin rows are `t1-ready T1a handler https://www.redfin.com`.

## Notes

No git commit was created because this workspace contains extensive pre-existing and concurrent T1 edits in the same shared files. The project quick-task table records comparable parallel T1 ports with `working-tree`, so this task follows that convention.
