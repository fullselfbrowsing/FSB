# 260630-u6d SUMMARY -- Make this app YNAB T1-ready

## Outcome

Completed in the shared working tree.

YNAB now has a reviewed `FsbHandlerYnab` head for `https://app.ynab.com`:

- 11 safe read rows resolve as executable T1a handler-backed reads.
- 11 mutation rows resolve as guarded fail-closed T1a rows and call no execution primitive.
- `ynab.snooze_category_goal` is corrected from `read` to `write`.
- Extension service-worker import, head-handler manifest, readiness/search overrides, port/origin/recipe-path guards, coverage, and write-activation evidence are wired.

## Implemented

- Added `catalog/handlers/ynab.js` and mirrored it byte-for-byte to `extension/catalog/handlers/ynab.js`.
- Registered YNAB in `extension/background.js` and `extension/utils/capability-catalog.js`.
- Added YNAB readiness, guarded, port-contract, coverage, recipe-path, and origin-classification wiring.
- Added YNAB handler behavior tests, upgrade tests, readiness tests, terminal-state override coverage, and extension-copy parity coverage.
- Regenerated `extension/catalog/recipe-index.generated.js` with `npm run package:extension`.

## Verification

Passed:

- `node --check catalog/handlers/ynab.js`
- `node --check extension/catalog/handlers/ynab.js`
- `cmp -s catalog/handlers/ynab.js extension/catalog/handlers/ynab.js`
- `npm run package:extension`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node tests/verify-origin-classification.test.js`
- `npm run validate:extension`

Latest readiness numbers after this shared T1 batch:

- 2,314 descriptors
- 637 T1-ready
- 257 guarded fail-closed
- 1,226 discovery-pending
- 194 blocked

## Commit

No atomic commit was created because this workspace is already a heavily shared dirty worktree with many unrelated parallel T1 changes. The task is recorded as `working-tree` in `.planning/STATE.md`.
