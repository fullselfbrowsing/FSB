---
quick_id: 260630-k18
slug: promote-hacker-news-public-same-origin-h
description: Promote Hacker News public same-origin HTML reads to T1-ready
status: complete
completed_at: 2026-06-30T19:34:30Z
commit: working-tree
---

# Summary

Promoted 9 Hacker News public same-origin HTML reads to T1-ready through a new app-specific T1a handler.

## Changed

- Added `catalog/handlers/hackernews.js` and packaged it to `extension/catalog/handlers/hackernews.js`.
- Registered `FsbHandlerHackernews` in the bundled head manifest and service-worker imports.
- Added Hacker News to readiness, coverage, origin-classification, recipe-path, and T1 port-contract tooling.
- Added the 9 read-only Hacker News slugs to the search readiness override.
- Extended focused handler, upgrade, origin-classification, terminal-state, and importScripts-count tests.
- Regenerated Phase 44 readiness and Phase 51 tail/terminal-state reports.

## Counts

- T1-ready: 133 -> 142.
- Tail rows: 2,176 -> 2,167.
- Same-origin proof-required: 1,047 -> 1,038.
- Guarded fail-closed: unchanged at 5.

`hackernews.submit_comment` remains inactive because the vendored implementation is a POST with an HMAC-backed form and needs write/UAT handling.

## Verification

- `node -c catalog/handlers/hackernews.js`
- `npm run package:extension`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
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
