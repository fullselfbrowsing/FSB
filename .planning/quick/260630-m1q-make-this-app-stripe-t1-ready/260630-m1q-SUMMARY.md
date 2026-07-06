# Quick Task 260630-m1q Summary: Make this app Stripe T1-ready

## Result

Stripe Dashboard is T1-ready for 21 read-only slugs:

- `stripe.get_account`, `stripe.get_balance`, `stripe.get_customer`, `stripe.get_event`, `stripe.get_invoice`, `stripe.get_payment_intent`, `stripe.get_price`, `stripe.get_product`, `stripe.get_subscription`
- `stripe.list_balance_transactions`, `stripe.list_customers`, `stripe.list_events`, `stripe.list_invoices`, `stripe.list_payment_intents`, `stripe.list_prices`, `stripe.list_products`, `stripe.list_subscriptions`
- `stripe.search_customers`, `stripe.search_invoices`, `stripe.search_payment_intents`, `stripe.search_subscriptions`

The handler is a same-origin dashboard head:

- Active-tab/bootstrap origin: `https://dashboard.stripe.com`
- API path: `https://dashboard.stripe.com/v1/*`
- Execution primitive: `ctx.executeBoundSpec`
- No direct `fetch`, no `chrome.tabs`/`chrome.scripting`, no `api.stripe.com`
- Dashboard auth carriers stay inside bound spec headers and are not logged or returned

Stripe write/destructive rows remain unregistered pending live mutation-body UAT:

- create/update customer/product/price/invoice rows
- `stripe.delete_customer`
- `stripe.finalize_invoice`
- `stripe.void_invoice`

## Files

Primary Stripe files:

- `catalog/handlers/stripe.js`
- `extension/catalog/handlers/stripe.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/coverage-report.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/t1-terminal-states.test.js`

Shared-gate compatibility fixes made because this workspace already contained other in-progress heads:

- Added missing bundled copy parity rows for current heads.
- Fixed the Bsky test fixture branch order for `getProfiles`.
- Removed a forbidden literal from a Twilio comment and kept Twilio guarded-write evidence fail-closed.

## Verification

Passed:

- `node -c catalog/handlers/stripe.js`
- `node -c extension/catalog/handlers/stripe.js`
- `npm run package:extension`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/coverage-report.mjs`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `npm run validate:extension`

Readiness report after the change:

- `descriptors=2314`
- `ready=277`
- `guarded=33`
- `discovery=1810`
- `blocked=194`

## Commit

No commit was created. The workspace already contained a large unrelated dirty tree from parallel quick tasks, so this quick is recorded as `working-tree`.
