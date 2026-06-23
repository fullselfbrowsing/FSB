# Phase 32 Deferred Items

Out-of-scope discoveries logged during plan execution. NOT fixed in the plan that
found them (see the scope boundary in execute-plan: only auto-fix issues directly
caused by the current task's changes).

## From Plan 02 (rot-detector + additive schema v2)

### 1. tests/capability-router.test.js -- 8 RED assertions (Plan 03 wiring)

- **Found during:** Task 2 no-regression sweep.
- **Status:** Expected RED. Out of scope for Plan 02.
- **Detail:** 30/38 assertions pass. The 8 failures are all router rot-path WIRING:
  HEAL-01 ("a broken fetch routes to RECIPE_DOM_FALLBACK_PENDING"), HEAL-03
  ("called FsbLearnedRecipeStore.quarantine", "called catalog.quarantineBundled",
  "runDiscovery re-learn trigger is WIRED on the rot path").
- **Why not fixed here:** 32-02-PLAN explicitly says "Do NOT touch the router/
  autopilot wiring (Plan 03)". The router source (extension/utils/capability-router.js)
  is UNMODIFIED by Plan 02 (verified: `git status` shows no change). These assertions
  go GREEN when Plan 03 wires classifyRecipeBroken into the router after executeBoundSpec.
- **Owner:** Plan 03.

### 2. tests/recipe-schema-lock.test.js -- 1 RED assertion (Plan 04 hash re-freeze)

- **Found during:** Task 2 no-regression sweep.
- **Status:** Expected RED. Out of scope for Plan 02.
- **Detail:** Section (1) "FSB_RECIPE_SCHEMA_VERSION === 2" PASSES after the Plan-02
  bump. Section (2) "frozen v2 RECIPE_SCHEMA hash" FAILS against a placeholder digest
  `TBD-FROZEN-IN-PLAN-04`; the suite's own diagnostic prints the actual v2 digest
  (f35211f524639f4b9611edb973b1eaf94f24769fbaff205e3c658914fd622a37) for Plan 04 to paste.
- **Why not fixed here:** 32-02-PLAN scopes the v2-hash re-freeze to Plan 04 (Pitfall 6:
  "re-freeze v2 hash in Plan 04"). Pasting the digest now would pre-empt Plan 04's INV-01
  freeze step. The placeholder is an intentional cross-plan tripwire.
- **Owner:** Plan 04 (paste the printed digest over the TBD placeholder).
