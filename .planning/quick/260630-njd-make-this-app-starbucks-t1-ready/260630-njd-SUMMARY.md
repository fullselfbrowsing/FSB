---
quick: 260630-njd
status: complete
subsystem: capability-t1
tags: [starbucks, t1, same-origin, guarded-writes]
requirements_completed:
  - QT-260630-njd
completed: 2026-06-30
commit: working-tree
key-files:
  modified:
    - catalog/handlers/starbucks.js
    - extension/catalog/handlers/starbucks.js
    - extension/background.js
    - extension/utils/capability-catalog.js
    - scripts/report-t1-readiness.mjs
    - scripts/verify-t1-port-contract.mjs
    - catalog/write-activation-evidence.json
    - tests/capability-head-handlers.test.js
    - tests/head-handler-upgrade.test.js
    - tests/guarded-write-failclosed.test.js
    - tests/t1-readiness-report.test.js
---

# Quick 260630-njd: Starbucks T1 Summary

Starbucks now has app-level T1 terminal coverage under the current safety policy:
15 read descriptors resolve as direct same-origin T1a handlers, and 5 mutation
descriptors are registered as guarded fail-closed T1a handlers pending live
mutation-body UAT.

## Accomplishments

- Added `FsbHandlerStarbucks` for `https://www.starbucks.com`, mirrored into the
  bundled extension handler directory.
- Implemented 15 read handlers using same-origin `ctx.executeBoundSpec` calls
  against Starbucks `/apiproxy/v1` endpoints or same-origin bootstrap state.
- Kept the handler free of direct `fetch`, `XMLHttpRequest`, `chrome.scripting`,
  `chrome.tabs`, cookie/storage reads, and direct credential replay.
- Registered 5 Starbucks write/destructive descriptors as inert guarded T1a
  handlers returning dual-field `RECIPE_DOM_FALLBACK_PENDING` without calling
  `ctx.executeBoundSpec`.
- Wired Starbucks into the runtime head-handler registry, readiness reporting,
  port-contract coverage, guarded-write tests, and guarded evidence ledger.

## Verification

Passed:
- `node -c catalog/handlers/starbucks.js && node -c extension/catalog/handlers/starbucks.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- Live readiness rollup via `reportReadiness()`: `starbucks` = 15 ready, 5 guarded, 0 pending/blocked.

Blocked by unrelated in-progress app heads in this dirty workspace:
- `node scripts/verify-write-activation-evidence.mjs` failed on missing Medium and
  WhatsApp guarded evidence records; no Starbucks failures were reported.
- `node scripts/verify-t1-port-contract.mjs` failed on WhatsApp side-effect-class
  mismatches; no Starbucks failures were reported.

## Deviations

- No commit was created because this workspace already contains many unrelated
  uncommitted quick-task changes, including overlapping edits in shared registry
  and verification files; recorded as `working-tree` like the surrounding quick
  tasks.
