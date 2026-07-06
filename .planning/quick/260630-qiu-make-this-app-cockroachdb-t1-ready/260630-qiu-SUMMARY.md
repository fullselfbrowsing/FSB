---
quick: 260630-qiu
status: complete
subsystem: capability-t1
tags: [cockroachdb, t1, same-origin, grpc, guarded-writes]
requirements_completed:
  - QT-260630-qiu
completed: 2026-07-01
commit: working-tree
key-files:
  created:
    - catalog/handlers/cockroachdb.js
    - extension/catalog/handlers/cockroachdb.js
  modified:
    - extension/utils/capability-fetch.js
    - extension/background.js
    - extension/utils/capability-catalog.js
    - extension/utils/capability-search.js
    - catalog/descriptors/opentabs__cockroachdb__execute_sql.json
    - catalog/descriptors/_fixtures/seed-descriptors.json
    - extension/catalog/recipe-index.generated.js
    - scripts/lib/side-effect-class.mjs
    - scripts/report-t1-readiness.mjs
    - scripts/verify-origin-classification.mjs
    - scripts/verify-recipe-path-guard.mjs
    - scripts/verify-t1-port-contract.mjs
    - catalog/write-activation-evidence.json
    - tests/capability-fetch.test.js
    - tests/capability-head-handlers.test.js
    - tests/head-handler-cap.test.js
    - tests/head-handler-upgrade.test.js
    - tests/guarded-write-failclosed.test.js
    - tests/verify-origin-classification.test.js
    - tests/t1-terminal-states.test.js
    - tests/t1-readiness-report.test.js
---

# Quick 260630-qiu Summary: CockroachDB Cloud T1 Readiness

## Completed

- Added `FsbHandlerCockroachdb` as a bundled T1a head pinned to `https://cockroachlabs.cloud`.
- Promoted 13 safe CockroachDB Cloud read descriptors through `ctx.executeBoundPageRead`.
- Added the CockroachDB page-read branch in `capabilityPageReadInPage` for first-party credentialed gRPC-web reads using the page-loaded protobuf runtime.
- Kept 5 mutation-capable descriptors guarded fail-closed: `create_database_user`, `delete_cluster`, `delete_database_user`, `execute_sql`, and `set_delete_protection`.
- Reclassified `cockroachdb.execute_sql` to `write` because arbitrary SQL can mutate state.
- Wired CockroachDB through service-worker imports, head registration, readiness overrides, recipe-path guard, port-contract mapping, origin-classification, guarded-write evidence, and generated catalog packaging.

## Verification

Passed:

- `node tests/capability-fetch.test.js` - 43 passed, 0 failed.
- `node tests/head-handler-cap.test.js` - 5 passed, 0 failed after aligning the shared head cap to the live 47-head manifest.
- `node tests/head-handler-upgrade.test.js` - 2589 passed, 0 failed.
- `node tests/guarded-write-failclosed.test.js` - 771 passed, 0 failed.
- `node scripts/verify-recipe-path-guard.mjs` - passed.
- `node scripts/verify-t1-port-contract.mjs` - passed.
- `node scripts/report-t1-readiness.mjs` - descriptors=2314, ready=545, guarded=172.
- `node tests/t1-readiness-report.test.js` - 14 passed, 0 failed.
- `node scripts/package-extension.mjs` - regenerated the extension catalog and bundled handler copy.

Observed unrelated red gates in the shared dirty workspace:

- `node tests/capability-head-handlers.test.js` has 1 MSWord secret-path hygiene failure unrelated to CockroachDB; the CockroachDB handler checks and copy parity passed.
- `node tests/verify-origin-classification.test.js` and `node scripts/verify-origin-classification.mjs` pass CockroachDB same-origin classification, but fail on concurrent Snowflake, MSWord, Hack2Hire, Discord, and PowerPoint head work.
- `node scripts/verify-write-activation-evidence.mjs`, `node tests/write-activation-evidence.test.js`, and `node tests/t1-terminal-states.test.js` fail on missing Discord guarded-write evidence and unrelated Snowflake/Hack2Hire/PowerPoint readiness override gaps.

## Notes

- No direct CockroachDB fetch, chrome, storage, cookie, or secret logging paths were added to the handler.
- `cockroachdb.execute_sql` remains guarded despite being read-like in name because the SQL payload can perform writes or destructive changes.
- The quick task is recorded as `working-tree` because the workspace already contained many unrelated uncommitted changes from parallel app work.
