# Quick Task 260701-2lw Summary: Make This App Etsy T1 Ready

Date: 2026-07-01
Status: Complete
Commit: working-tree

## Outcome

Etsy is wired as a handler-backed T1 surface.

- Promoted reads: `etsy.search_listings`, `etsy.get_listing`, `etsy.list_orders`
- Guarded fail-closed writes: `etsy.add_to_cart`, `etsy.checkout`
- Runtime origin: `https://www.etsy.com`
- Runtime API base: `https://www.etsy.com/v1`

## Implementation

- Added `FsbHandlerEtsy` for origin-pinned same-origin-cookie JSON reads.
- Registered inert guarded handlers for cart and checkout writes; they return `RECIPE_DOM_FALLBACK_PENDING` and do not call `executeBoundSpec`.
- Flipped Etsy descriptors and seed fixture rows to `backing: "handler"`.
- Added runtime/import/search/readiness/origin-verifier wiring for Etsy.
- Added guarded write evidence requirements for Etsy cart and checkout.
- Added focused Etsy handler regression coverage.

## Verification

Passed:

- `node --check catalog/handlers/etsy.js`
- `node --check extension/catalog/handlers/etsy.js`
- `cmp catalog/handlers/etsy.js extension/catalog/handlers/etsy.js`
- `node --check tests/etsy-head-handler.test.js`
- `node -e "for (const p of ['catalog/write-activation-evidence.json','catalog/descriptors/_fixtures/seed-descriptors.json']) JSON.parse(require('fs').readFileSync(p,'utf8')); console.log('json ok');"`
- `node tests/etsy-head-handler.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/coverage-report.mjs`
- Focused readiness query shows Etsy reads as `t1-ready` and Etsy writes as `t1-guarded-fail-closed`.
- Focused evidence query confirms `etsy.add_to_cart` and `etsy.checkout` guarded evidence rows exist.

Known unrelated failures in the dirty shared workspace:

- `node scripts/verify-t1-port-contract.mjs`: fails on PostHog verifier mapping, Tinder side-effect drift, AWS handler syntax, TikTok/Tinder guarded-row side-effect mismatches.
- `node scripts/verify-write-activation-evidence.mjs`: fails on missing guarded evidence records for many non-Etsy apps.
- `node scripts/verify-origin-classification.mjs`: identifies Etsy as same-origin, but fails on unrelated unmapped/separate-origin heads.
- `node tests/t1-readiness-report.test.js`: fails on AWS readiness expectations.
- `node tests/guarded-write-failclosed.test.js`: fails on AWS handler syntax after passing many guarded rows.
- `node tests/head-handler-upgrade.test.js`: fails on AWS handler syntax before reaching all rows.
- `node tests/t1-terminal-states.test.js`: fails on missing non-Etsy evidence and broad search override drift.
- `node scripts/verify-recipe-path-guard.mjs`: fails on unrelated allowlist drift for non-Etsy handlers.
