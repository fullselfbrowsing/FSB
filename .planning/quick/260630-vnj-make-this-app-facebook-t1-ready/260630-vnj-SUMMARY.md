---
quick_id: 260630-vnj
description: Make this app Facebook T1-ready
status: completed
date: 2026-07-01
mode: quick
commit: working-tree
---

# Quick Task 260630-vnj: Make Facebook T1-ready

## Outcome

Facebook now has a conservative bundled T1a head:

- `facebook.get_current_user` is T1-ready through a same-origin `GET https://www.facebook.com/` HTML read.
- `facebook.search_marketplace` is T1-ready through a same-origin Marketplace search HTML read.
- `facebook.confirm_friend_request`, `facebook.delete_friend_request`, and `facebook.react_to_post` are registered as guarded fail-closed T1a rows and never call execution primitives.
- Private Relay/doc-id Facebook reads remain unregistered in the handler and stay catalog-tail/discovery-pending.

## Files Touched

- `catalog/handlers/facebook.js`
- `extension/catalog/handlers/facebook.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `catalog/write-activation-evidence.json`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`
- `tests/verify-origin-classification.test.js`

## Verification

Passed:

- `cmp catalog/handlers/facebook.js extension/catalog/handlers/facebook.js`
- `node -e "...facebook handler surface..."`
- `node tests/head-handler-cap.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/coverage-report.mjs`
- `node tests/write-activation-evidence.test.js`
- `node tests/generated-same-origin-read-recipes.test.js`
- `npm run validate:extension`

## Notes

No commit was created because the workspace already contained extensive unrelated dirty changes from concurrent quick tasks. The STATE entry uses `working-tree`, matching the existing convention in this shared workspace.
