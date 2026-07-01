# Quick Task 260701-e5j: Implement ClickUp T1 readiness

Status: complete
Date: 2026-07-01
Code commit: 999f07b0

## Result

ClickUp now has T1a read handlers for all 11 existing `clickup.get_*` catalog rows. The handlers dispatch through the bounded page-read primitive on `https://app.clickup.com`, and the in-page bridge uses the ClickUp WebSocket-captured JWT plus the `cuHandshake` API base while rejecting non-ClickUp API hosts before fetch.

## Files

- `catalog/handlers/clickup.js`
- `extension/catalog/handlers/clickup.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-catalog.js`
- `extension/background.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/clickup-t1-ready.test.js`
- `tests/head-handler-cap.test.js`

## Verification

- PASS: `node -c extension/utils/capability-fetch.js`
- PASS: `node tests/clickup-t1-ready.test.js` (11/0)
- PASS: `node tests/head-handler-cap.test.js` (5/0)
- PASS: focused readiness probe: 11 ClickUp rows, all `t1-ready`, all `T1a`, all with handler proof.
- PARTIAL: `node scripts/verify-origin-classification.mjs` recognizes `FsbHandlerClickup` as `PAGE-BEARER-READ`; command still fails on unrelated in-flight heads.
- PARTIAL: `node scripts/verify-t1-port-contract.mjs` has no ClickUp failures; command still fails on unrelated gmaps/posthog/teams rows.
- PARTIAL: `node scripts/verify-recipe-path-guard.mjs` has no ClickUp failure; command still fails on unrelated allowlist drift.

## Commit Note

Code/test changes are committed in `999f07b0`. The `.planning/STATE.md` tracking row is present in the working tree, but it was not committed because the shared STATE file also contains unrelated milestone/archive edits from other workers; committing the whole file would sweep in unrelated planning work.
