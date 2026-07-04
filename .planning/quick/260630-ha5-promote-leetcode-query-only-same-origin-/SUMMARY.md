---
quick_id: 260630-ha5
slug: promote-leetcode-query-only-same-origin-
description: Promote LeetCode query-only same-origin reads to T1-ready
status: complete
completed_at: 2026-06-30T17:32:00Z
commit: working-tree
---

# Summary

Promoted 24 LeetCode query-only same-origin GraphQL reads to T1-ready through a new app-specific T1a handler.

## Changed

- Added `catalog/handlers/leetcode.js` and the packaged copy under `extension/catalog/handlers/leetcode.js`.
- Registered `FsbHandlerLeetcode` in the bundled head manifest and service-worker imports.
- Added LeetCode to readiness, coverage, origin-classification, recipe-path, and T1 port-contract tooling.
- Added the 24 LeetCode query-only slugs to the search readiness override.
- Extended focused handler, upgrade, origin-classification, terminal-state, and importScripts-count tests.
- Regenerated Phase 44 readiness and Phase 51 tail/terminal-state reports.

## Counts

- T1-ready: 92 -> 116.
- Tail rows: 2,217 -> 2,193.
- Same-origin proof-required: 1,088 -> 1,064.
- Guarded fail-closed: unchanged at 5.

## Verification

- `npm run package:extension`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node tests/head-handler-upgrade.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `npm run validate:extension`

No commit was created because the worktree already contains unrelated dirty changes.
