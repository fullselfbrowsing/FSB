---
quick_id: 260630-vog
slug: make-this-app-pandaexpress-t1-ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Make Panda Express T1-ready - Summary

## Outcome

Panda Express is T1a-ready for four public same-origin Olo/NomNom read descriptors:

- `pandaexpress.find_restaurants`
- `pandaexpress.get_restaurant`
- `pandaexpress.get_restaurant_menu`
- `pandaexpress.get_product_modifiers`

The new `FsbHandlerPandaexpress` handler executes credential-free GET specs through `ctx.executeBoundSpec` against `https://www.pandaexpress.com`, with `authStrategy: "none"` and `credentials: "omit"`. It does not read localStorage, cookies, auth tokens, customer state, rewards, billing, basket, checkout, coupon, recent-order, or order-history paths.

Panda Express basket, checkout, coupon, billing, loyalty, favorites, profile, recent-order, and mutation rows remain non-active.

## Files Changed

- `catalog/handlers/pandaexpress.js`
- `extension/catalog/handlers/pandaexpress.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`

Shared gate maintenance in the existing dirty tree:

- Added Redfin's current handler-backed rows to the search readiness override.
- Kept Coinbase guarded writes recorded in the write-activation evidence ledger.
- Updated generated same-origin recipe expectations after handler coverage removed stale generated Bitbucket, Redfin, and Webflow T1b recipes.

## Verification

Passed:

- `node -c catalog/handlers/pandaexpress.js`
- `node -c extension/catalog/handlers/pandaexpress.js`
- `cmp catalog/handlers/pandaexpress.js extension/catalog/handlers/pandaexpress.js`
- `node tests/capability-head-handlers.test.js` -> 1254 passed, 0 failed
- `node tests/head-handler-upgrade.test.js` -> 3723 passed, 0 failed
- `node tests/head-handler-cap.test.js` -> 5 passed, 0 failed
- `node tests/verify-origin-classification.test.js` -> 156 passed, 0 failed
- `node scripts/verify-origin-classification.mjs` -> PASS, 61 shipped heads, 0 silent cross-origin ports
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs` -> PASS, 985 T1 rows, 979 handler rows, 281 guarded fail-closed
- `node tests/t1-readiness-report.test.js` -> 21 passed, 0 failed
- `node tests/t1-terminal-states.test.js` -> 12 passed, 0 failed
- `node tests/generated-same-origin-read-recipes.test.js` -> 14 passed, 0 failed
- `node scripts/report-t1-readiness.mjs` -> descriptors=2314, ready=704, guarded=281, discovery=1135, blocked=194
- `node scripts/report-t1-tail-worklist.mjs` -> PASS, 1329 tail rows
- `node scripts/report-t1-terminal-states.mjs` -> PASS, 2314 descriptors, 704 ready
- `npm run validate:extension`
- `npm run package:extension` -> wrote `dist/fsb-extension-v0.9.90.zip`

## Notes

No git commit was created because this workspace already contains extensive pre-existing and concurrent T1 edits in shared files. The quick-task table records comparable parallel T1 ports as `working-tree`, so this task follows that convention.
