---
quick_id: 260701-2ll
slug: implement-ebay-to-be-t1-ready
description: Implement eBay to be T1 ready
status: complete
completed: 2026-07-01
commit: pending
---

# Quick Task 260701-2ll Summary

## Outcome

Implemented eBay T1 readiness with a same-origin T1a handler:

- Seven eBay read slugs now resolve as `t1-ready` with handler proof.
- `ebay.watch_item` is corrected to `write` and resolves as `t1-guarded-fail-closed`.
- The guarded write is inert and does not call any execution primitive pending live mutation-body UAT.

## Files Changed

- `catalog/handlers/ebay.js`
- `extension/catalog/handlers/ebay.js`
- `catalog/descriptors/opentabs__ebay__*.json`
- `catalog/descriptors/_fixtures/seed-descriptors.json`
- `extension/catalog/recipe-index.generated.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `catalog/write-activation-evidence.json`
- `tests/ebay-head-handler.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `.planning/STATE.md`

## Verification

Passed:

- `node -c catalog/handlers/ebay.js`
- `node -c extension/catalog/handlers/ebay.js`
- `node tests/ebay-head-handler.test.js`
- eBay readiness probe: all eight eBay rows are T1a handler-backed; seven reads are `t1-ready`, `ebay.watch_item` is `t1-guarded-fail-closed`
- eBay evidence probe: `catalog/write-activation-evidence.json` includes `ebay.watch_item`
- `node scripts/verify-t1-readiness-gate.mjs`

Attempted but blocked by non-eBay parallel work:

- `node tests/head-handler-upgrade.test.js`: fails while loading `catalog/handlers/aws.js` due a syntax error outside eBay scope.
- `node tests/guarded-write-failclosed.test.js`: same AWS syntax failure before reaching the eBay row.
- `node scripts/verify-t1-port-contract.mjs`: fails on non-eBay PostHog verifier mapping, Tinder/TikTok classifications, and the AWS handler syntax.
- `node scripts/verify-write-activation-evidence.mjs` and `node tests/write-activation-evidence.test.js`: fail on missing guarded evidence for non-eBay apps introduced by parallel work.
