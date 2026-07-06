---
quick_id: 260701-2km
slug: implement-carta-to-be-t1-ready
status: completed
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260701-2km Summary

## Outcome

Carta is T1-ready in the readiness model:

- 20/20 Carta descriptors resolve `t1-ready`.
- 20/20 Carta descriptors resolve `T1a`.
- `https://app.carta.com` is classified `sensitive`, not `denied`.
- The Carta head uses reviewed same-origin `GET` requests through `executeBoundSpec` only.

No commit was created because the workspace already contained parallel dirty changes in shared files. The quick task is recorded as `working-tree` to avoid staging unrelated workers' edits.

## Changed Files

- `catalog/handlers/carta.js`
- `extension/catalog/handlers/carta.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `extension/config/service-denylist.json`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/coverage-report.mjs`
- `tests/carta-handler.test.js`
- `tests/service-denylist.test.js`
- `docs/LEGAL.md`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`

## Validation

- `node tests/carta-handler.test.js` -- PASS, 123 passed / 0 failed.
- `node tests/service-denylist.test.js` -- PASS, 66 passed / 0 failed.
- `node -e "import('./scripts/report-t1-readiness.mjs').then(...Carta rows...)"` -- PASS, `carta rows=20 ready=20 bad=0`.
- `node -e "import('./scripts/lib/t1-port-contract.mjs').then(...validateHandlerSource(carta)...)"` -- PASS, `carta handler source failures=0`.
- `node -e "const h=require('./extension/catalog/handlers/carta.js'); ...closed params..."` -- PASS, `closedParamFailures=0`.
- `node scripts/verify-origin-classification.mjs` -- FAIL from unrelated heads, but Carta row is `SAME-ORIGIN FsbHandlerCarta head=https://app.carta.com api=https://app.carta.com`.
- `node scripts/verify-t1-readiness-gate.mjs` -- FAIL from unrelated rows: `airbnb.remove_from_wishlist`, `amazon.cancel_order`, `amazon.get_product`, and Grafana rows.
- `node scripts/report-t1-readiness.mjs` -- FAIL with the same unrelated readiness-gate rows; report still generated and Carta rows are ready.
- `node scripts/verify-t1-port-contract.mjs` -- FAIL from unrelated rows in Airbnb, Craigslist, Telegram, Amazon, Ticketmaster, TikTok, and Zendesk; no Carta failures.

## Remaining Blockers

No Carta-specific blockers remain. Broad shared gates are currently blocked by unrelated dirty-tree work from other app batches.
