# Quick Task 260630-mgf: Make this app tumblr T1-ready

## Scope

Promote Tumblr into the current T1 model without expanding the trust boundary.

## Tasks

### 1. Add Tumblr head wiring

Files:
- `catalog/handlers/tumblr.js`
- `extension/catalog/handlers/tumblr.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `extension/utils/capability-search.js`
- `catalog/write-activation-evidence.json`

Action:
- Add a Tumblr handler module pinned to `https://www.tumblr.com`.
- Execute read descriptors through the browser-bound `/api/v2` API using `executeBoundSpec`.
- Register write/destructive Tumblr descriptors as guarded fail-closed until live mutation-body UAT exists.
- Wire the handler into service-worker imports, head manifests, readiness tooling, origin verification, recipe path guard, and readiness annotations.

Verify:
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`

Done:
- Tumblr rows resolve as `t1-ready` for supported reads or `t1-guarded-fail-closed` for guarded mutations.

### 2. Add regression coverage

Files:
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/lattice-provider-bridge-smoke.test.js`

Action:
- Assert Tumblr handler shape, same-origin spec construction, auth bootstrap handling, shape guards, mutation fail-closed behavior, and catalog upgrade behavior.
- Update exact head-count tripwires where they intentionally lock the current shipped head.

Verify:
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`

Done:
- Tests prove Tumblr is wired and guarded correctly.

### 3. Refresh readiness artifacts and summarize

Files:
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`
- `.planning/STATE.md`
- `.planning/quick/260630-mgf-make-this-app-tumblr-t1-ready/260630-mgf-SUMMARY.md`

Action:
- Regenerate the T1 readiness report.
- Record task summary and GSD quick state.

Verify:
- Tumblr totals match the intended ready/guarded split.

Done:
- Quick task bookkeeping is complete.
