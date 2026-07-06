---
quick_id: 260630-vq5
slug: make-this-app-coinbase-t1-ready
status: completed
completed_at: 2026-07-01
---

# Coinbase T1 Readiness Summary

## Outcome

Coinbase is registered as a T1a head handler on `https://www.coinbase.com`.

- 11 Coinbase read descriptors are `t1-ready` with handler proof.
- 6 Coinbase write/destructive descriptors are `t1-guarded-fail-closed`.
- Coinbase reads use same-origin `/graphql/query` specs through `ctx.executeBoundSpec`.
- Coinbase writes are inert guarded handlers and do not call execution primitives.

## Key Files

- `catalog/handlers/coinbase.js`
- `extension/catalog/handlers/coinbase.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `catalog/write-activation-evidence.json`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/write-activation-evidence.test.js`

## Verification

Passed:

- `node -c catalog/handlers/coinbase.js && node -c extension/catalog/handlers/coinbase.js`
- `cmp -s catalog/handlers/coinbase.js extension/catalog/handlers/coinbase.js`
- Coinbase handler static scan for direct network/browser credential APIs
- Coinbase readiness row check over `reportReadiness()`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/head-handler-cap.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node tests/write-activation-evidence.test.js`
- `node tests/catalog-inline-shape.test.js`
- `node scripts/verify-catalog-crosscheck.mjs`
- `node tests/catalog-crosscheck.test.js`
- `node tests/payment-op-guard.test.js`
- `node tests/breadth-search-return.test.js`

Known unrelated failures observed in broader suites:

- `node tests/capability-head-handlers.test.js` has one unrelated failure: `facebook.search_marketplace parses Marketplace SSR listing fields`. Coinbase checks in that suite passed.
- `node tests/coverage-report.test.js` has one unrelated stale expectation: it still expects all Phase-39 commerce/travel/misc descriptors to be `backing:dom`, while this workspace has Costco handler-backed read descriptors.
