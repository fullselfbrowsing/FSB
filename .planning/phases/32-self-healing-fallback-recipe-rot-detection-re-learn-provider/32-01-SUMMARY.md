---
phase: 32
plan: 01
subsystem: capability-self-healing-validation
tags: [testing, wave-0, recipe-rot, provider-parity, schema-lock, ci-guard, red-suite]
requires:
  - tests/tool-definitions-parity.test.js (frozen registryHash/stable harness)
  - tests/capability-router.test.js (router harness + installCatalog idiom)
  - tests/capability-autopilot-parity.test.js (router-invoke spy + makeResult shape)
  - scripts/verify-recipe-path-guard.mjs (RECIPE_PATH_ALLOWLIST + Check 1/Check 4)
provides:
  - tests/capability-rot-detector.test.js (HEAL-02/04 taxonomy + expectedShape RED suite)
  - tests/provider-parity.test.js (HEAL-05/INV-03 7-provider parity RED suite)
  - tests/recipe-schema-lock.test.js (HEAL-05/INV-01 schema-lock RED suite)
  - RECIPE_PATH_ALLOWLIST pre-arm for extension/utils/capability-rot-detector.js
  - npm test chain wiring for the 3 new suites
affects:
  - Plan 02 (capability-rot-detector.js + v2 schema bump turn 2 suites green)
  - Plan 03 (router classify-hook + quarantine + re-learn turn router/autopilot green)
  - Plan 04 (frozen v2 schema hash paste + milestone gate)
tech-stack:
  added: []
  patterns:
    - zero-framework FSB test convention (passed/failed counters, check(cond,msg), process.exit)
    - frozen-hash schema-lock (crypto sha256 over stable() key-sorted serialization)
    - RED-suite-ahead-of-implementation (Wave 0 contract; modules land in later plans)
    - allowlist pre-arm ahead of file creation (Check 1 existsSync-skip; Check 4 fail-closed-on-land)
    - drive-the-REAL-router (not a canned spy) so fallback assertions genuinely red
key-files:
  created:
    - tests/capability-rot-detector.test.js
    - tests/provider-parity.test.js
    - tests/recipe-schema-lock.test.js
  modified:
    - tests/capability-router.test.js
    - tests/capability-autopilot-parity.test.js
    - scripts/verify-recipe-path-guard.mjs
    - package.json
decisions:
  - "Drove the REAL capability-router.invoke (not a canned spy) in provider-parity + autopilot Phase-32 blocks, because the autopilot front door + spy passthrough already landed in Phase 29 Plans 04/05 -- a spy would pre-bake the answer and make the suite self-fulfilling/GREEN. Driving the real router (which lacks the Plan-03 classify hook) is what makes the fallback-decision half genuinely RED today."
  - "Asserted the CONSERVATIVE expectedShape contract (data:[] under expectedShape:'@' -> NOT broken) per the RESEARCH Pattern 2 decision table (authoritative) over the stricter validateExpectedShape skeleton variant -- the decision table is the load-bearing HEAL-04 never-mask contract."
  - "Left FROZEN_RECIPE_SCHEMA_V2_HASH as a clearly-marked 'TBD-FROZEN-IN-PLAN-04' placeholder (the v2 schema does not exist yet, so the digest cannot be known now). Recorded the would-be digest (fa7ba92f...) in a DIAG line for Plan 04 convenience, but that value will only be correct once Plan 02 adds capturedAt+expectedShape and bumps to v2."
metrics:
  duration: ~35m
  completed: 2026-06-23
  tasks: 3
  files_created: 3
  files_modified: 4
---

# Phase 32 Plan 01: Wave 0 Validation Contract Summary

Authored the three NEW zero-framework RED test suites (rot-detector taxonomy, 7-provider parity, recipe schema-lock), extended the router + autopilot suites with the fallback/quarantine/re-learn assertions, pre-armed the recipe-path CI guard allowlist for the not-yet-created `capability-rot-detector.js`, and wired the three new files into the npm test chain -- all RED today (their targets land in Plans 02-04), with the INV-04 iterator guard staying GREEN throughout.

## What Was Built

**Task 1 -- rot-detector taxonomy RED suite + allowlist pre-arm** (`ffb69282`)
- `tests/capability-rot-detector.test.js` (254 lines): the full HEAL-02/HEAL-04 contract. Calls `classifyRecipeBroken(result, recipe)` with synthetic `executeBoundSpec` result shapes covering the entire RESEARCH Pattern 2 decision table -- 4xx/5xx + fetch-failed + login-HTML/null-body all classify broken; `redirected:true` -> `RECIPE_LOGGED_OUT` (surfaced, NOT healed); `data:[]` under `expectedShape:'@'` -> NOT broken ("0 results passes" -- the load-bearing never-mask line); `RECIPE_ORIGIN_MISMATCH` + `RECIPE_CONSENT_REQUIRED` typed dual-field rejections classify NOT broken (T-32-PASS security passthrough). Plus direct `validateExpectedShape` assertions (present non-empty passes; present empty of expected kind passes; null/missing/wrong-kind fails). Reads bodies but never `console.log`s them raw (T-32-LEAK / V7 posture).
- Pre-armed `scripts/verify-recipe-path-guard.mjs` RECIPE_PATH_ALLOWLIST with `extension/utils/capability-rot-detector.js` -- Check 1's `existsSync` pre-check skips the absent file (guard stays green); Check 4 fails closed the moment Plan 02 lands it off-allowlist.

**Task 2 -- provider-parity + schema-lock RED suites** (`6324b977`)
- `tests/provider-parity.test.js` (220 lines): HEAL-05/INV-03. The FORMAT half (each of the 7 PROVIDER_KEYS formats the public tools without error; both out-of-registry capability tools are absent) passes today (INV-01 by construction). The FALLBACK-DECISION half drives the REAL router with a synthetic broken 404 fetch per provider and asserts it emits the byte-identical `RECIPE_DOM_FALLBACK_PENDING` reason provider-independently -- RED until Plan 03's classify hook (today the router passes the 404 through raw).
- `tests/recipe-schema-lock.test.js` (144 lines): HEAL-05/INV-01. Clones the `tool-definitions-parity` stable+sha256 mechanism. Asserts `FSB_RECIPE_SCHEMA_VERSION === 2` (RED; it is 1) + a frozen v2 `RECIPE_SCHEMA` hash (a marked `TBD-FROZEN-IN-PLAN-04` placeholder) + re-asserts the frozen tool registry hash `ad6efb8c...` (passes today -- no tool-definitions edit this phase).

**Task 3 -- extend router/autopilot suites + wire npm test + INV-04 baseline** (`f25aa55c`)
- `tests/capability-router.test.js` (+151 lines): a broken 404 T1b fetch routes to dual-field `RECIPE_DOM_FALLBACK_PENDING` carrying the underlying reason; a broken T2 verdict calls `FsbLearnedRecipeStore.quarantine(slug,origin)`; a broken bundled verdict calls `catalog.quarantineBundled(slug)`; the `runDiscovery` re-learn trigger is wired (reachable) on the rot path; a legitimate no-results (200+empty) and a logged-out (redirected:true) do NOT route to fallback and fire NO quarantine. All 8 new failures are HEAL-*; zero pre-existing CAT-*/LOW- regressions.
- `tests/capability-autopilot-parity.test.js` (+86 lines): drives the REAL router with a broken 404 and asserts the autopilot `makeResult` surfaces the typed reason (`result.code === RECIPE_DOM_FALLBACK_PENDING`, `error` reflects `error||errorCode`, `result.fellBackToDom === true`) so the model sees it next iteration. 3 new HEAL-01 failures only; the pre-existing CAT-04 assertions are now GREEN (Plans 04/05 already landed upstream).
- `package.json` scripts.test: appended `provider-parity` + `recipe-schema-lock` + `capability-rot-detector` after `learned-local-provenance-exempt.test.js` (chain tail, no reorder).

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Recipe-path guard green (pre-arm safe) | `node scripts/verify-recipe-path-guard.mjs` | exit 0 (20 files clean, 8 capability modules all on allowlist) |
| INV-04 iterator guard green | `node tests/agent-loop-iterator-guard.test.js` | exit 0 (no production code touched) |
| rot-detector suite parses + RED | `node tests/capability-rot-detector.test.js` | exit 1 (MODULE_NOT_FOUND -- Plan 02 lands it) |
| provider-parity parses + RED | `node tests/provider-parity.test.js` | exit 1 (8 fallback-decision FAILs -- Plan 03) |
| schema-lock parses + RED | `node tests/recipe-schema-lock.test.js` | exit 1 (version 1 + placeholder mismatch) |
| router extended + RED | `node tests/capability-router.test.js` | exit 1 (8 HEAL-* FAILs, 30 PASS, no regressions) |
| autopilot extended + RED | `node tests/capability-autopilot-parity.test.js` | exit 1 (3 HEAL-01 FAILs only) |
| npm test chain ordering | `node -e` ordering assertion | exit 0 (3 new files after learned cluster) |
| ASCII-only (no emojis) | byte scan of all 7 changed files | clean |
| artifact min_lines | wc -l vs must_haves | 254/80, 220/60, 144/50 -- all OK |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] provider-parity + autopilot Phase-32 blocks were initially GREEN (self-fulfilling spy)**
- **Found during:** Task 2 (provider-parity) and Task 3 (autopilot extension)
- **Issue:** The plan's stub strategy (a spy on `globalThis.FsbCapabilityRouter.invoke` returning a canned broken result) made the suites GREEN today, because the autopilot front door + the spy->door passthrough already landed in Phase 29 Plans 04/05. A canned spy pre-bakes the `RECIPE_DOM_FALLBACK_PENDING` answer, so asserting the door surfaces it tests nothing new and never reds -- violating the plan's explicit "keep both so the suite reds until the phase is complete" requirement.
- **Fix:** Both Phase-32 fallback-decision blocks now load and drive the REAL `capability-router.invoke` (the same cfworker/jmespath/interpreter preload `capability-router.test.js` uses) with a synthetic broken 404 fetch via a stubbed catalog + fetch primitive. The real router has no post-`executeBoundSpec` classify hook yet (Plan 03), so it passes the 404 through raw -> the typed-reason assertions genuinely RED today and turn GREEN exactly when Plan 03 emits the marker. This is faithful to RESEARCH Pattern 5 ("a stubbed broken result yields the SAME typed reason") while keeping the assertion honest.
- **Files modified:** tests/provider-parity.test.js, tests/capability-autopilot-parity.test.js
- **Commits:** 6324b977, f25aa55c

### Scope-faithful interpretation notes (not deviations)

- The plan said the autopilot suite is "RED until Plan 05" -- but Plan 05 (the autopilot branch) already landed (the suite was GREEN on arrival, 10/0). The new Phase-32 surfacing assertions are the only RED ones, which is the correct intent (they depend on Plan 03's emit, not on the already-shipped door).
- The conservative `expectedShape` "0 results passes" contract (RESEARCH Pattern 2 decision table) was asserted over the stricter `validateExpectedShape` skeleton (RESEARCH Pattern 3 code comment treats empty as absent). The decision table is the authoritative HEAL-04 contract; Plan 02 implements `validateExpectedShape` so a present-empty-of-expected-kind passes.

## Known Stubs

None. This is a Wave 0 RED-test plan -- the "stubs" are the deliberately-failing assertions whose production targets land in Plans 02-04. Each is documented in-file with the plan that turns it green:
- `FROZEN_RECIPE_SCHEMA_V2_HASH = 'TBD-FROZEN-IN-PLAN-04'` -- a clearly-marked placeholder; Plan 04 computes-once-and-pastes the real digest (the v2 schema does not exist yet).

## Notes for Downstream Plans

- **Plan 02** (`capability-rot-detector.js` + v2 schema): turns `tests/capability-rot-detector.test.js` GREEN (exports `classifyRecipeBroken` + `validateExpectedShape`) and flips the `FSB_RECIPE_SCHEMA_VERSION === 2` half of `recipe-schema-lock.test.js`. The detector MUST stay eval-free (Check 4 auto-globs it the moment it lands).
- **Plan 03** (router classify-hook + quarantine + re-learn): turns the 8 router HEAL-* assertions + the 3 autopilot HEAL-01 assertions + the provider-parity fallback-decision half GREEN. The hook sits in `_runDeclarativeTier` after `executeBoundSpec` (~:401) and `_runHandlerTier` (~:433); the router must call `FsbLearnedRecipeStore.quarantine` / `catalog.quarantineBundled` on a broken verdict and keep `FsbDiscoverySession.runDiscovery` reachable on the rot path.
- **Plan 04** (frozen hash + milestone gate): computes the real v2 `RECIPE_SCHEMA` hash and pastes it over the `TBD-FROZEN-IN-PLAN-04` placeholder at first green. With Plan 02's schema in place the digest is `fa7ba92f3549a5903ac817651ee6a319e7e068cfa010c0b5c454f9a4e8d07e7c` ONLY if no further schema fields change -- recompute at paste-time.

## Self-Check: PASSED

- All 3 created test files exist on disk (capability-rot-detector, provider-parity, recipe-schema-lock).
- All 4 modified files exist (capability-router, capability-autopilot-parity, verify-recipe-path-guard.mjs, package.json).
- SUMMARY.md exists.
- All 3 task commits exist in git history (ffb69282, 6324b977, f25aa55c).
