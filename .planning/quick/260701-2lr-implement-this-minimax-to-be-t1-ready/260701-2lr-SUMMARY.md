---
quick_id: 260701-2lr
status: completed
---

# Quick Task 260701-2lr Summary: MiniMax T1 Readiness

## Result

MiniMax is wired as a T1 handler-backed app:

- `minimax.get_current_user` is executable through a bounded same-page read on `https://agent.minimax.io`.
- The page-read branch reuses the MiniMax page Axios instance discovered from `webpackChunk_N_E`, preserving the app's interceptor-signed request path.
- The remaining 30 MiniMax POST/write/destructive descriptors are upgraded to guarded fail-closed handlers with activation evidence requirements.

## Verification

Passing:

- `node tests/minimax-t1-ready.test.js`
- `node -c catalog/handlers/minimax.js`
- `node -c extension/catalog/handlers/minimax.js`
- `node tests/service-denylist.test.js`
- `node tests/capability-fetch.test.js`
- MiniMax readiness probe: 31 rows, with 1 `t1-ready` and 30 `t1-guarded-fail-closed`

Broader gates run but blocked by unrelated in-progress targets:

- `node scripts/verify-t1-port-contract.mjs` fails on Craigslist mapping, Amazon/AWS syntax, and TikTok guarded read classifications.
- `node scripts/verify-write-activation-evidence.mjs` fails on non-MiniMax guarded rows missing evidence.
- `node scripts/verify-recipe-path-guard.mjs` fails on non-MiniMax handler allowlist drift.
- `node tests/t1-readiness-report.test.js` fails on Amazon/AWS readiness expectations.
- `node tests/capability-head-handlers.test.js` fails on Home Depot, Shopify, and Airtable.
- `node tests/head-handler-upgrade.test.js` is blocked by `catalog/handlers/aws.js` syntax.

No commit was created because the worktree contains unrelated parallel edits, including shared files touched by multiple app-target agents.
