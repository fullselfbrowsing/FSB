---
status: complete
completed: 2026-07-01
quick_id: 260630-vo5
slug: make-this-app-circleci-t1-ready
commit: working-tree
---

# Quick Task 260630-vo5 Summary: Make CircleCI T1-ready

## Outcome

CircleCI now has terminal T1 accounting across all 33 `circleci.*` descriptors:

- 20 CircleCI read descriptors resolve through same-origin T1a handlers pinned to `https://app.circleci.com/api/v2`.
- 1 existing read descriptor, `circleci.list_collaborations`, remains T1-ready through its current recipe path.
- 12 CircleCI write/destructive descriptors are registered as guarded fail-closed T1a handlers pending live mutation-body UAT.
- CircleCI has no discovery-pending, UAT-needed, bridge-needed, or blocked terminal rows in the current readiness model.

The guarded mutation rows return dual-field `RECIPE_DOM_FALLBACK_PENDING` and do not call `executeBoundSpec`.

## Key Files

- `catalog/handlers/circleci.js`
- `extension/catalog/handlers/circleci.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `catalog/write-activation-evidence.json`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`

## Verification

Passed:

- `node -c catalog/handlers/circleci.js`
- `node -c extension/catalog/handlers/circleci.js`
- `cmp -s catalog/handlers/circleci.js extension/catalog/handlers/circleci.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/capability-search-eval.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`

CircleCI readiness check:

- total CircleCI rows: 33
- `t1-ready`: 21
- `t1-guarded-fail-closed`: 12
- non-terminal CircleCI rows: 0

Known unrelated failures in this dirty shared workspace:

- `node scripts/report-t1-terminal-states.mjs` fails on missing guarded evidence records for six Coinbase guarded rows.
- `node tests/t1-terminal-states.test.js` fails on those same Coinbase guarded evidence gaps and Redfin search-readiness override gaps.
- `node scripts/verify-write-activation-evidence.mjs` fails on those same Coinbase guarded evidence gaps.
- `node scripts/verify-origin-classification.mjs` fails on the unrelated Facebook relative runtime override proof.
- `node tests/head-handler-cap.test.js` fails because the shared worktree currently has 61 head-handler modules against the cap of 60.

## Notes

No commit was created. This workspace already contains a large set of unrelated uncommitted T1 app migrations from parallel quick tasks, including overlapping changes in shared registry and report files, so this quick task is recorded as `working-tree`.
