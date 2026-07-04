---
quick_id: 260630-mga
slug: make-instagram-t1-ready
status: complete
completed: 2026-06-30
---

# Make Instagram T1-ready

## Outcome

Instagram is now T1a-ready in the catalog with 28 handler-backed rows:

- 18 read rows are executable same-origin `/api/v1` bound specs on `https://www.instagram.com`.
- 10 write-like rows are T1a descriptors guarded fail-closed with write-activation evidence placeholders.
- The handler uses closed parameter schemas, `executeBoundSpec`, cookie CSRF injection, Instagram web headers, and JSON shape guards.
- No Instagram handler path uses direct network calls, browser scripting/tabs, direct cookie reads, storage reads, or bearer/header replay.

## Verification

- `node -c catalog/handlers/instagram.js`
- `node -c extension/catalog/handlers/instagram.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-write-activation-evidence.mjs`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/t1-port-contract-gate.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`
- `node tests/service-denylist.test.js`

Readiness extraction showed `0` report validation failures and `28` Instagram rows: `18` reads plus `10` guarded writes. The global write ledger now passes with `5` active write records and `88` guarded fail-closed records.
