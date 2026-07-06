---
status: complete
completed: 2026-07-01
task: Implement Amazon to be T1 ready
---

# Summary

Implemented Amazon T1 readiness for the existing six Amazon descriptors:

- `amazon.search_products`, `amazon.get_product`, `amazon.list_orders`, and `amazon.track_order` now resolve as T1a handler-backed reads.
- `amazon.place_order` and `amazon.cancel_order` are T1a guarded fail-closed writes and do not execute mutation specs before live mutation-body UAT.
- Added focused Amazon behavior/readiness coverage.

## Validation

- PASS: `node tests/amazon-t1-ready.test.js`
- PASS: `node scripts/verify-t1-readiness-gate.mjs`
- PASS for Amazon rows: report shows Amazon 4 ready, 2 guarded, 0 discovery-pending.

## Non-Amazon Blockers Observed

Broader shared gates currently fail because of concurrent in-flight app work outside Amazon ownership:

- `node tests/t1-readiness-report.test.js` fails on AWS rows.
- `node scripts/verify-t1-port-contract.mjs` fails on PostHog verifier mapping, AWS handler syntax, and TikTok guarded read rows.
- `node scripts/verify-write-activation-evidence.mjs` and `node tests/write-activation-evidence.test.js` fail on non-Amazon missing evidence rows.
- `node tests/head-handler-cap.test.js` fails on shared head count/cap drift.
- `node scripts/verify-recipe-path-guard.mjs` fails on non-Amazon handler allowlist drift.
