---
quick_id: 260701-1kj
slug: make-this-app-instacart-t1-ready
status: complete
completed_at: "2026-07-01T06:20:34.000Z"
commit: working-tree
---

# Quick Task 260701-1kj Summary: Make this app Instacart T1-ready

## Outcome

Promoted the conservative Instacart same-origin read subset to T1a:

- `instacart.get_current_user`
- `instacart.list_addresses`
- `instacart.list_active_carts`
- `instacart.get_cart`
- `instacart.list_orders`
- `instacart.get_order`

Left the unsafe or not-yet-proven Instacart rows in the discovery tail:

- `instacart.get_location_context`
- `instacart.search_products`
- `instacart.get_product`
- `instacart.navigate_to_checkout`
- `instacart.update_cart_items`
- `instacart.delete_cart`

## Changes

- Added `catalog/handlers/instacart.js` and mirrored it to `extension/catalog/handlers/instacart.js`.
- Implemented same-origin-cookie Instacart GraphQL reads through `ctx.executeBoundSpec` only, with origin pins, persisted-query hashes, strict response-shape guards, and byte-stable DOM fallback errors.
- Registered `FsbHandlerInstacart` in the extension background/runtime catalog, T1 port contract verifier, readiness report preloads, and recipe-path guard allowlist.
- Marked only the six promoted Instacart descriptors as `backing: "handler"`.
- Added focused Instacart handler, upgrade, readiness, and terminal/search readiness regression coverage.
- Regenerated the packaged extension catalog/readiness artifacts.

## Verification

Passed:

- `node --check catalog/handlers/instacart.js`
- `node --check extension/catalog/handlers/instacart.js`
- `cmp catalog/handlers/instacart.js extension/catalog/handlers/instacart.js`
- `npm run package:extension`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/report-t1-readiness.mjs`

Readiness report after the change:

- `descriptors=2314`
- `apps=128`
- `ready=748`
- `guarded=300`
- `learn=0`
- `discovery=1072`
- `blocked=194`

## Known Unrelated Validation Blockers

`npm run validate:extension` did not complete because existing non-Instacart gates fail before or after the Instacart checks:

- `scripts/verify-recipe-path-guard.mjs` still reports pre-existing recipe-path allowlist drift for `catalog/handlers/calendly.js` and `catalog/handlers/clickhouse.js`. Instacart is now allowlisted.
- `tests/t1-terminal-states.test.js` still reports pre-existing missing guarded evidence for Docker Hub guarded writes: `dockerhub.create_repository`, `dockerhub.delete_repository`, and `dockerhub.update_repository`.

Instacart-specific readiness, handler, port-contract, and readiness-gate checks pass.
