---
quick_id: 260630-njd
status: planned
created: 2026-06-30
---

# Quick Task 260630-njd: Make this app starbucks T1-ready

## Goal

Promote the existing Starbucks catalog descriptors from DOM/discovery-only to T1 readiness using the same current app-port pattern: same-origin reads execute through `executeBoundSpec`; write/destructive rows remain guarded fail-closed until live mutation-body UAT records activation evidence.

## Tasks

1. Add `catalog/handlers/starbucks.js` and mirror it to `extension/catalog/handlers/starbucks.js`.
   - Implement Starbucks read handlers for the existing read descriptors using first-party `https://www.starbucks.com/apiproxy/v1` or same-origin bootstrap reads.
   - Register write/destructive descriptors as guarded fail-closed T1a handlers with byte-stable `RECIPE_DOM_FALLBACK_PENDING`.

2. Wire Starbucks into the T1 runtime and gates.
   - Add the handler to `extension/background.js`, `extension/utils/capability-catalog.js`, `scripts/report-t1-readiness.mjs`, and `scripts/verify-t1-port-contract.mjs`.
   - Add Starbucks write slugs to the guarded-write readiness/evidence paths.

3. Add focused coverage and verify.
   - Extend existing head-handler, upgrade, guarded-write, and readiness tests for Starbucks.
   - Run targeted tests and T1 verification scripts.
