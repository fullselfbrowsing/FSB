# Quick Task 260701-2mh Summary: Make Uber Eats Implementation T1 Ready

## Status

Complete.

## What Changed

- Added a bundled Uber Eats T1a handler for `www.ubereats.com`.
- Promoted safe first-party reads:
  - `ubereats.list_restaurants`
  - `ubereats.get_menu`
  - `ubereats.list_orders`
- Added fail-closed guarded T1a mutation handlers:
  - `ubereats.place_order`
  - `ubereats.cancel_order`
- Mirrored the handler into the extension bundle.
- Wired Uber Eats into handler loading, head-handler seeding, capability search T1 status, readiness reporting, and the T1 port-contract verifier.
- Added focused Uber Eats handler coverage.

## Verification

- `node --check catalog/handlers/ubereats.js && node --check extension/catalog/handlers/ubereats.js && node --check tests/ubereats-t1-ready.test.js`
- `node tests/ubereats-t1-ready.test.js`
- `node tests/head-handler-cap.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- Targeted Uber Eats T1 port-contract smoke: PASS for 5 Uber Eats rows.

## Notes

- `node tests/capability-head-handlers.test.js` still has unrelated concurrent failures in other app surfaces; Uber Eats assertions passed in the filtered run.
- Full `node scripts/verify-t1-port-contract.mjs` still has unrelated concurrent failures outside Uber Eats.
