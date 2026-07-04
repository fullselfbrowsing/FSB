---
quick_id: 260630-nh1
slug: make-this-app-dominos-t1-ready
description: Make Domino's same-origin GraphQL reads T1-ready
status: complete
completed_at: 2026-06-30T22:14:28Z
commit: working-tree
---

# Summary

Promoted Domino's safe explicit-input read subset to T1-ready through a bundled `FsbHandlerDominos` handler pinned to `https://www.dominos.com/api/web-bff/graphql`.

## Changed

- Added `catalog/handlers/dominos.js` and packaged it to `extension/catalog/handlers/dominos.js`.
- Registered `FsbHandlerDominos` in the bundled head manifest and service-worker imports.
- Added Domino's to readiness reporting, coverage reporting, origin classification, and T1 port-contract verification.
- Added handler and upgrade tests for address search, store lookup, menu categories, category products, product detail, and deal detail.
- Regenerated the extension catalog snapshot and Phase 44 readiness report.
- Repaired shared validation drift from parallel head work: WhatsApp guarded mutation descriptors now carry write/destructive classes, Chipotle has its public no-auth origin proof, and frozen head/import counts match the current 38-head workspace.

## Promoted Slugs

- `dominos.search_address`
- `dominos.find_stores_by_address`
- `dominos.get_menu_categories`
- `dominos.get_category_products`
- `dominos.get_product`
- `dominos.get_deal`

## Excluded

Cart mutations, order placement, checkout navigation, active cart reads, customer profile, saved addresses/cards, payment rows, and loyalty rows remain non-T1 because their state carriers or mutation evidence need separate review.

## Verification

- `node -c catalog/handlers/dominos.js`
- `node -c extension/catalog/handlers/dominos.js`
- `node scripts/package-extension.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node tests/verify-origin-classification.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `node tests/generated-same-origin-read-recipes.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run validate:extension`

No commit was created because this workspace already contains broad unrelated dirty changes from parallel work.
