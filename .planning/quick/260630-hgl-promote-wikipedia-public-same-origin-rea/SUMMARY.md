---
quick_id: 260630-hgl
slug: promote-wikipedia-public-same-origin-rea
description: Promote Wikipedia public same-origin reads to T1-ready
status: complete
completed_at: 2026-06-30T17:40:34Z
commit: working-tree
---

# Summary

Promoted 17 Wikipedia public same-origin/same-site reads to T1-ready through a new app-specific T1a handler.

## Changed

- Added `catalog/handlers/wikipedia.js` and the packaged copy under `extension/catalog/handlers/wikipedia.js`.
- Registered `FsbHandlerWikipedia` in the bundled head manifest and service-worker imports.
- Added Wikipedia to readiness, coverage, origin-classification, recipe-path, and T1 port-contract tooling.
- Added the 17 public Wikipedia slugs to the search readiness override.
- Extended focused handler, upgrade, origin-classification, terminal-state, and importScripts-count tests.
- Regenerated Phase 44 readiness and Phase 51 tail/terminal-state reports.

## Counts

- T1-ready: 116 -> 133.
- Tail rows: 2,193 -> 2,176.
- Same-origin proof-required: 1,064 -> 1,047.
- Guarded fail-closed: unchanged at 5.

## Verification

- `npm run package:extension`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/t1-tail-worklist.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `npm run validate:extension`

No commit was created because the worktree already contains unrelated dirty changes.
