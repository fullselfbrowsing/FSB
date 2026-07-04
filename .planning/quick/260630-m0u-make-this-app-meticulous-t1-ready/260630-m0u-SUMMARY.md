---
quick_id: 260630-m0u
slug: make-this-app-meticulous-t1-ready
description: Make Meticulous same-origin GraphQL reads T1-ready
status: complete
completed_at: 2026-06-30T21:09:58Z
commit: working-tree
---

# Summary

Promoted 21 Meticulous same-origin GraphQL read rows to T1-ready through a reviewed bundled-head handler for `https://app.meticulous.ai/api/graphql`.

## Changed

- Added `catalog/handlers/meticulous.js` and packaged it to `extension/catalog/handlers/meticulous.js`.
- Registered `FsbHandlerMeticulous` in the bundled head manifest and service-worker imports.
- Added Meticulous to readiness reporting, origin classification, recipe-path guard, T1 port-contract, and search readiness overrides.
- Added handler tests proving same-origin cookie auth, GraphQL query-only bodies, `extract: "data"`, no direct fetch/Chrome APIs, no bearer/localStorage usage, and fail-closed logged-out/error behavior.
- Regenerated Phase 44 readiness and Phase 51 tail/terminal/write-UAT artifacts.
- Aligned shared search/evidence accounting for active Bsky, Cloudflare, Terraform, and Twilio heads already present in this worktree so the terminal-state gate stays coherent.

## Counts

- T1-ready rows: 277.
- Guarded fail-closed rows: 33.
- Tail rows: 2,004.
- Head modules: 25, still under the cap of 30.
- Meticulous split: 21 read rows `t1-ready`; 5 write rows remain `discovery-pending` / `uat-needed`.

The Meticulous write rows remain inactive: `meticulous.accept_all_diffs`, `meticulous.check_for_flakes`, `meticulous.compare_replays`, `meticulous.create_label_action`, and `meticulous.upsert_diff_approval`.

## Verification

- `node -c catalog/handlers/meticulous.js`
- `node -c extension/catalog/handlers/meticulous.js`
- `node -c tests/capability-head-handlers.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `npm run package:extension`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-tail-worklist.test.js`
- `node tests/t1-terminal-states.test.js`
- `npm run validate:extension`

No commit was created because the workspace already contains broad unrelated dirty changes from parallel work.
