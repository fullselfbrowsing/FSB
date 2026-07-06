---
id: 260630-lhy
title: Promote Zillow public same-origin search reads to T1-ready
created_at: 2026-06-30T20:28:44.055Z
completed_at: 2026-06-30T20:36:53Z
status: complete
commit: working-tree
---

# Summary

Promoted 8 Zillow public same-origin read rows to T1-ready through a reviewed bundled-head handler. The handler only builds bound specs for Zillow's first-party `/async-create-search-page-state` endpoint; it performs no direct fetch, Chrome scripting call, page-global auth scrape, authorization-header injection, or saved-state exposure.

## Results

- T1-ready rows: 166 -> 174.
- Catalog-tail rows: 2,143 -> 2,135.
- Degraded/discovery-pending rows: 1,014 -> 1,006.
- Head modules: 17 -> 18, still under the cap of 30.
- T1 port contract: 179 T1 rows, 169 handler rows, 5 guarded fail-closed.

## Verification

- `node -c catalog/handlers/zillow.js`
- `node -c extension/catalog/handlers/zillow.js`
- `node -c tests/capability-head-handlers.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node tests/t1-tail-worklist.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/backing-status-annotation.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `npm run validate:extension`
