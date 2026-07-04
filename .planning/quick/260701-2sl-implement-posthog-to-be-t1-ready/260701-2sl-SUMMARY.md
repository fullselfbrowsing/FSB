---
status: complete
quick_id: 260701-2sl
slug: implement-posthog-to-be-t1-ready
completed: 2026-07-01
---

# Quick Task 260701-2sl: Implement PostHog to be T1 ready

## Outcome

PostHog now has a T1a head handler for the reviewed same-origin GET surface on `https://us.posthog.com`.

- 24 read descriptors resolve as `t1-ready`.
- 14 write/query/destructive descriptors are registered as guarded fail-closed entries until live body UAT exists.
- Runtime and readiness wiring load `FsbHandlerPosthog` from both the catalog and extension handler trees.

## Files Changed

- `catalog/handlers/posthog.js`
- `extension/catalog/handlers/posthog.js`
- `extension/utils/capability-catalog.js`
- `extension/background.js`
- `scripts/report-t1-readiness.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/t1-readiness-report.test.js`
- `.planning/quick/260701-2sl-implement-posthog-to-be-t1-ready/260701-2sl-PLAN.md`
- `.planning/quick/260701-2sl-implement-posthog-to-be-t1-ready/260701-2sl-SUMMARY.md`
- `.planning/STATE.md`

## Verification

- `node -c catalog/handlers/posthog.js`
- `node -c tests/capability-head-handlers.test.js`
- `node -c tests/head-handler-upgrade.test.js`
- `node -c tests/t1-readiness-report.test.js`
- `node -c scripts/report-t1-readiness.mjs`
- `cmp -s catalog/handlers/posthog.js extension/catalog/handlers/posthog.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- Focused readiness probe: PostHog total 38 rows, 24 `t1-ready`, 14 `t1-guarded-fail-closed`.

`node tests/capability-head-handlers.test.js` has one existing non-PostHog failure in the shared tree: `homedepot.get_store_context reads the first-party bootstrap page`. The PostHog assertions in that suite pass.

## Commit

No commit was created. The working tree contains concurrent edits in the same shared files, so committing would risk capturing unrelated agent work.
