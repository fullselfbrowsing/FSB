---
quick_id: 260701-2lr
slug: implement-datadog-to-be-t1-ready
mode: quick
status: complete
completed_at: 2026-07-01
commit: working-tree
---

# Implement Datadog T1 Readiness Summary

## Outcome

Implemented Datadog as a bundled T1a same-origin read head for the 46 reviewed GET-backed Datadog capabilities. The handler is pinned to `https://app.datadoghq.com`, uses `ctx.executeBoundSpec()` with `authStrategy: "same-origin-cookie"`, and fails closed with `RECIPE_DOM_FALLBACK_PENDING` on missing primitives, HTTP/auth/redirect failures, Datadog error envelopes, or response shape mismatches.

The 25 Datadog rows that require POST bodies, cloning, mutation, destructive behavior, or live body evidence remain unregistered and are asserted as non-`t1-ready`.

## Files Touched

- `catalog/handlers/datadog.js`
- `extension/catalog/handlers/datadog.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `extension/catalog/recipe-index.generated.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-origin-classification.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/verify-origin-classification.test.js`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.md`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.json`
- `.planning/STATE.md`
- `.planning/quick/260701-2lr-implement-datadog-to-be-t1-ready/260701-2lr-PLAN.md`
- `.planning/quick/260701-2lr-implement-datadog-to-be-t1-ready/260701-2lr-SUMMARY.md`

## Verification

Passed:

- `npm run package:extension`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node tests/t1-tail-worklist.test.js`

Datadog-specific checks passed inside broader suites:

- `node tests/capability-head-handlers.test.js` Datadog block passed, but the suite failed on unrelated `homedepot.get_store_context` and `sentry.get_event` checks.
- `node tests/verify-origin-classification.test.js` Datadog origin checks passed, but the suite failed on the stale global head-count assertion and unrelated unmapped/unsupported heads.
- `node scripts/verify-origin-classification.mjs` classified Datadog as same-origin, but failed on 18 unrelated heads.

Failed due unrelated current worktree drift:

- `node scripts/verify-recipe-path-guard.mjs` failed on allowlist drift for non-Datadog handlers.
- `node scripts/verify-t1-port-contract.mjs` failed on PostHog verifier/guarded-entry gaps.
- `node scripts/report-t1-terminal-states.mjs` failed on guarded evidence gaps for other apps.
- `node tests/t1-terminal-states.test.js` failed on unrelated guarded evidence and readiness override gaps.

## Commit

No commit was created. The workspace was already heavily dirty with concurrent edits in the same shared files, so an atomic Datadog-only commit could not be staged safely without risking unrelated agent changes.
