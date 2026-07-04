# Quick Task 260630-qj8 Summary: Make Target T1-ready

Status: complete
Date: 2026-07-01

## Outcome

Promoted the safe public Target page-read subset to handler-backed T1a:

- `target.search_products`
- `target.get_product`

The Target head uses `executeBoundSpec` only and builds same-origin public HTML GET specs against `https://www.target.com` with `authStrategy: "same-origin-cookie"`. It parses embedded page JSON from Target search/detail HTML and fails closed with the dual-field `RECIPE_DOM_FALLBACK_PENDING` marker when the page shape or execution primitive is unavailable.

## Excluded Rows

These rows remain non-ready/non-handler-backed:

- `target.add_to_cart`
- `target.apply_promo_code`
- `target.find_nearby_stores`
- `target.get_cart`
- `target.get_current_user`
- `target.get_loyalty_details`
- `target.get_order`
- `target.get_savings_summary`
- `target.get_shopping_list`
- `target.get_store`
- `target.list_favorites`
- `target.list_orders`
- `target.list_shopping_lists`
- `target.navigate_to_checkout`
- `target.remove_cart_item`
- `target.update_cart_item_quantity`

## Verification

Passed:

- `node -c catalog/handlers/target.js`
- `node -c extension/catalog/handlers/target.js`
- `cmp catalog/handlers/target.js extension/catalog/handlers/target.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/t1-readiness-report.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`

Target-specific origin assertions passed inside `tests/verify-origin-classification.test.js`, including the real Target head and malformed Target override negative control.

Known unrelated failures in the current dirty workspace:

- `node scripts/verify-origin-classification.mjs` still fails because pre-existing dirty heads `FsbHandlerSnowflake`, `FsbHandlerDiscord`, and `FsbHandlerPowerpoint` have no app mapping in `HEAD_APP_MAP`.
- `node tests/verify-origin-classification.test.js` has the same live-catalog failure, while Target's own checks pass.
- `node tests/t1-terminal-states.test.js` fails because pre-existing dirty Hack2Hire, PowerPoint, and Snowflake handler-backed rows are missing search readiness overrides.

## Notes

The workspace already contains many unrelated in-flight T1 quick-task and showcase changes. This task was left in the working tree rather than committed so unrelated dirty changes are not accidentally included in a Target commit.
