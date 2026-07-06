---
quick_id: 260630-kqt
slug: promote-one-more-safe-same-origin-public
description: Promote Yelp public same-origin reads to T1-ready
status: complete
completed_at: 2026-06-30T20:03:44Z
commit: working-tree
---

# Summary

Promoted 3 Yelp public same-origin reads to T1-ready through a new app-specific T1a handler.

## Changed

- Added `catalog/handlers/yelp.js` and packaged it to `extension/catalog/handlers/yelp.js`.
- Registered `FsbHandlerYelp` in the bundled head manifest and service-worker imports.
- Added Yelp to readiness, coverage, recipe-path, origin-classification, and T1 port-contract tooling.
- Added `yelp.autocomplete`, `yelp.get_business`, and `yelp.search_businesses` to the search readiness override.
- Extended focused handler, upgrade, origin-classification, terminal-state, and importScripts-count tests.
- Regenerated Phase 44 readiness and Phase 51 tail/terminal-state reports.

## Counts

- T1-ready: 153 -> 156.
- Tail rows: 2,156 -> 2,153.
- Same-origin proof-required: 1,027 -> 1,024.
- Guarded fail-closed: unchanged at 5.

`yelp.get_current_user`, `yelp.get_current_page_businesses`, `yelp.navigate_to_business`, and `yelp.navigate_to_search` remain inactive because they depend on page globals or navigation semantics.

## Verification

- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node tests/t1-tail-worklist.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/backing-status-annotation.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run validate:extension`

No commit was created because the worktree already contains unrelated dirty changes.
