---
quick_id: 260630-kg0
slug: promote-npm-public-same-origin-read-hand
description: Promote npm public same-origin Spiferack reads to T1-ready
status: complete
completed_at: 2026-06-30T19:51:57Z
commit: working-tree
---

# Summary

Promoted 11 npm public same-origin `x-spiferack` read rows to T1-ready through a new app-specific T1a handler.

## Changed

- Added `catalog/handlers/npm.js` and packaged it to `extension/catalog/handlers/npm.js`.
- Registered `FsbHandlerNpm` in the bundled head manifest and service-worker imports.
- Added npm to readiness, coverage, recipe-path, origin-classification, and T1 port-contract tooling.
- Added the 11 read-only npm slugs to the search readiness override.
- Extended focused handler, upgrade, origin-classification, terminal-state, and importScripts-count tests.
- Regenerated Phase 44 readiness and Phase 51 tail/terminal-state reports.

## Counts

- T1-ready: 142 -> 153.
- Tail rows: 2,167 -> 2,156.
- Same-origin proof-required: 1,038 -> 1,027.
- Guarded fail-closed: unchanged at 5.

`npm.get_current_user`, `npm.list_tokens`, and `npm.list_user_packages` remain inactive because they depend on authenticated page globals, token listing, or private/settings surfaces.

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
- `node scripts/verify-t1-readiness-gate.mjs`
- `node tests/t1-tail-worklist.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run validate:extension`

No commit was created because the worktree already contains unrelated dirty changes.
