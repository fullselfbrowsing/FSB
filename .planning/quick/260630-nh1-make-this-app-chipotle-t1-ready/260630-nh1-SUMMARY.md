# Quick Task 260630-nh1 Summary: Make Chipotle T1-ready

Status: complete
Date: 2026-06-30

## Outcome

Promoted the safe public Chipotle read subset to handler-backed T1a:

- `chipotle.get_ordering_status`
- `chipotle.get_restaurant`
- `chipotle.get_menu`
- `chipotle.get_preconfigured_meals`

The Chipotle head uses `executeBoundSpec` only and builds credential-free public services GET specs against `https://services.chipotle.com`, pinned from the extension side to `https://www.chipotle.com` with `authStrategy: "none"` and `credentials: "omit"`.

## Excluded Rows

These rows remain non-ready/non-handler-backed:

- `chipotle.get_current_user`
- `chipotle.get_extras_campaigns`
- `chipotle.get_favorites`
- `chipotle.get_last_restaurant`
- `chipotle.get_loyalty_points`
- `chipotle.get_menu_groups`
- `chipotle.get_payment_methods`
- `chipotle.get_promotions`
- `chipotle.get_recent_orders`
- `chipotle.get_reward_categories`
- `chipotle.get_rewards`
- `chipotle.find_restaurants`

## Verification

Passed:

- `node -c catalog/handlers/chipotle.js`
- `node -c extension/catalog/handlers/chipotle.js`
- `cmp catalog/handlers/chipotle.js extension/catalog/handlers/chipotle.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/verify-origin-classification.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `npm run package:extension`
- `npm run validate:extension`

## Notes

The workspace already contains many unrelated in-flight T1 quick-task changes. This task was left in the working tree rather than committed so unrelated dirty changes are not accidentally included in a Chipotle commit.
