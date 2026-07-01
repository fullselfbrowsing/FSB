---
quick_id: 260701-2lm
slug: make-doordash-t1-ready
status: complete
completed_at: "2026-07-01T07:08:20Z"
commit: working-tree
---

# Quick Task 260701-2lm Summary

## Outcome

DoorDash now has a conservative T1a handler-backed read subset for:

- `doordash.get_current_user`
- `doordash.list_addresses`
- `doordash.list_orders`
- `doordash.get_order`
- `doordash.list_payment_methods`
- `doordash.get_notifications`

The promoted reads execute through same-origin `executeBoundSpec` GraphQL calls pinned to `https://www.doordash.com`, with CSRF cookie metadata, strict response-shape guards, and typed DOM-fallback failures. DoorDash favorite/profile/default-address/notification mutation rows remain discovery-pending.

## Verification

Passed:

- `node --check catalog/handlers/doordash.js`
- `node --check extension/catalog/handlers/doordash.js`
- `node --check tests/doordash-t1-ready.test.js`
- `node tests/doordash-t1-ready.test.js`
- `node --check tests/capability-head-handlers.test.js`
- `cmp catalog/handlers/doordash.js extension/catalog/handlers/doordash.js`
- `npm run package:extension`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- DoorDash readiness report check: six reads report `t1-ready T1a handler handler`; five mutation rows remain `discovery-pending T3 dom none`
- `node tests/generated-same-origin-read-recipes.test.js`
- `node --check extension/utils/capability-search.js`
- DoorDash search override check: all six promoted DoorDash read slugs are present in `T1_READY_SLUGS`

Known non-DoorDash failures observed during broader verification:

- `node tests/capability-head-handlers.test.js` has three unrelated failures for Home Depot, OneNote, and Airtable assertions.
- `node tests/t1-readiness-report.test.js` fails on unrelated Amazon/AWS readiness expectations.
- `node scripts/verify-t1-port-contract.mjs` fails on unrelated Craigslist, Amazon/AWS, and TikTok rows.
- `node scripts/verify-recipe-path-guard.mjs` fails on unrelated handler allowlist drift; DoorDash is not listed.
- `node tests/t1-terminal-states.test.js` still fails on unrelated write-UAT ledger and search override backlog; DoorDash is no longer in the missing override list.
- `node scripts/validate-extension.mjs` fails on unrelated Amazon/AWS handler syntax errors.

## Files

- Added DoorDash handler and extension mirror.
- Flipped six DoorDash read descriptors to handler backing.
- Wired DoorDash into background loading, handler catalog, T1 reporting, port-contract checks, recipe-path guard allowlist, and search readiness overrides.
- Added DoorDash-focused regression coverage for handler behavior, upgrade status, readiness reporting, terminal-state samples, and handler cap coverage.
