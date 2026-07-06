---
status: complete
completed: 2026-07-01T06:28:02Z
quick_id: 260701-1kg
slug: make-this-app-walmart-t1-ready
commit: working-tree
---

# Summary

Made Walmart T1-ready for the reviewed public page-read subset:

- `walmart.search_products`
- `walmart.get_product`
- `walmart.get_product_reviews`
- `walmart.get_store`

Added `FsbHandlerWalmart` in `catalog/handlers/walmart.js`, synced it to `extension/catalog/handlers/walmart.js`, changed the four promoted Walmart descriptors to `backing: "handler"`, and wired the head through the background loader, capability catalog, readiness/search surfaces, coverage reports, T1 port contract, recipe-path guard, and origin-classification gate.

The Walmart head uses only `ctx.executeBoundSpec` with `GET`, `Accept: text/html`, same-origin cookie auth, `origin: https://www.walmart.com`, and `__NEXT_DATA__` parsing. It fails closed with `RECIPE_DOM_FALLBACK_PENDING` on invalid input, logged-out/error responses, missing page data, or unexpected shapes.

Kept account/cart/order/checkout/navigation rows out of the handler. These remain non-ready catalog-tail rows until separate review or live evidence exists.

## Shared validation repairs

While validating the current shared workspace, I also corrected small gate drift caused by parallel T1 work:

- added the missing Instacart same-origin `/graphql` origin proof so the global origin gate passes with the existing Instacart head
- re-baselined the lattice importScripts exact counts for the current 67-head bundle
- deduped the duplicate Calendly guarded-write evidence entries while retaining the later guarded records

## Verification

Passed:

- `node --check catalog/handlers/walmart.js`
- `node --check extension/catalog/handlers/walmart.js`
- `cmp catalog/handlers/walmart.js extension/catalog/handlers/walmart.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node scripts/package-extension.mjs`
- `npm run validate:extension`

Latest generated readiness snapshot:

- `2314` descriptors
- `757` T1-ready
- `306` guarded fail-closed
- `1057` discovery-pending
- `194` blocked

The extension package was regenerated at `dist/fsb-extension-v0.9.90.zip`.
