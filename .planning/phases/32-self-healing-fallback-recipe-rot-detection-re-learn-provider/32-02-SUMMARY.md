---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
plan: 02
subsystem: api
tags: [capability-recipe, rot-detection, jmespath, json-schema, self-healing, mv3]

# Dependency graph
requires:
  - phase: 26
    provides: capability-recipe-schema (closed-vocab RECIPE_SCHEMA + validateRecipe), the capability-interpreter bound-spec build, the recipe-path CI guard allowlist
  - phase: 27
    provides: capability-fetch executeBoundSpec normalized result shape (success/redirected/status/data; origin-pin RECIPE_ORIGIN_MISMATCH) + getFSBJmespath read-path engine
  - phase: 31
    provides: recipe-synthesizer closed-vocab recipe core + learned-recipe-store (persisted schemaVersion:1 learned recipes)
  - phase: 32-01
    provides: the Wave-0 RED suites (capability-rot-detector.test.js taxonomy contract, recipe-schema-lock version assertion) + the rot-detector allowlist pre-arm
provides:
  - "capability-rot-detector.js: classifyRecipeBroken(result, recipe) HEAL-04 taxonomy (broken / logged-out / legitimate-no-results) + validateExpectedShape(data, expectedShape) conservative structural predicate, eval-free"
  - "Backward-compatible recipe schema v1->v2: schemaVersion enum:[1,2] (persisted v1 still validates at runtime) + optional capturedAt + expectedShape; additionalProperties:false preserved"
  - "Interpreter carry of expectedShape + capturedAt into the bound spec (belt-and-suspenders for the Plan-03 router read)"
  - "Synthesizer stamp of a conservative expectedShape:'@' + capturedAt at schemaVersion:2 on learned recipes"
  - "Migrated in-chain schema regression gate proving v1 backward-compat + out-of-enum reject + v2-with-optional-fields accept; new valid-recipe-v2.json fixture"
affects: [Plan 03 (router rot-path wiring reads classifyRecipeBroken + recipe.expectedShape), Plan 04 (re-freezes the v2 RECIPE_SCHEMA hash)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure dual-export IIFE data classifier (no chrome.*, no fetch, no dynamic code) on the recipe-path allowlist, auto-globbed by guard Check 4"
    - "Conservative present-container predicate: an empty-but-present container of the expected kind is a REAL no-results outcome (never masked); only a missing path / null / wrong-kind body is RECIPE_EXPIRED"
    - "Additive backward-compatible JSON-Schema versioning via schemaVersion enum (NOT a bumped const) so prior-version persisted recipes keep validating"

key-files:
  created:
    - extension/utils/capability-rot-detector.js
    - catalog/recipes/_fixtures/valid-recipe-v2.json
  modified:
    - extension/utils/capability-recipe-schema.js
    - extension/utils/capability-interpreter.js
    - extension/utils/recipe-synthesizer.js
    - tests/capability-recipe-schema.test.js

key-decisions:
  - "schemaVersion widened const:1 -> enum:[1,2] (NOT a bumped const) -- the correct reading of D-08 'v1 stays valid': a persisted/bundled schemaVersion:1 recipe (Phase-31 LEARNED recipes carry :1) STILL validates at runtime, while an out-of-enum version is still RECIPE_SCHEMA_INVALID"
  - "validateExpectedShape reuses the SAME jmespath read-path engine the extract field runs (FsbCapabilityInterpreter.getFSBJmespath, globalThis.jmespath fallback); an absent engine degrades to shape-passes -- no false RECIPE_EXPIRED, the DOM fallback is the backstop (D-06)"
  - "The typed RECIPE_* security passthrough branch runs BEFORE the generic fetch-failed branch so a RECIPE_ORIGIN_MISMATCH / RECIPE_CONSENT_* rejection is never healed away as a rot (T-32-PASS, Pitfall 3)"
  - "An engine throw inside validateExpectedShape is treated conservatively as shape-passes (an engine/path edge is not evidence of rot)"

patterns-established:
  - "Pattern: present-container = non-null/undefined resolved value INCLUDING empty array/object -> the load-bearing HEAL-04 never-mask line"
  - "Pattern: synthesized recipes carry the strongest derivable conservative assertion (expectedShape:'@' = non-null response) because the synthesizer only has redacted shape-only capture, never a body (D-07/A4)"

requirements-completed: [HEAL-02, HEAL-04]

# Metrics
duration: 6min
completed: 2026-06-23
---

# Phase 32 Plan 02: Recipe-Rot Detector + Additive Schema v2 Summary

**Eval-free capability-rot-detector.js (classifyRecipeBroken HEAL-04 taxonomy + conservative validateExpectedShape reusing the extract jmespath engine) plus a backward-compatible recipe schema v1->v2 (schemaVersion enum:[1,2] + optional capturedAt/expectedShape) threaded through the interpreter and stamped by the Phase-31 synthesizer.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-23T08:39:02Z
- **Completed:** 2026-06-23T08:45:33Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- New eval-free `capability-rot-detector.js` exporting `classifyRecipeBroken(result, recipe)` (the broken / logged-out / legitimate-no-results taxonomy that NEVER masks a real outcome and passes typed RECIPE_* security failures through) and `validateExpectedShape(data, expectedShape)` (a conservative structural predicate reusing the same jmespath read-path engine the `extract` field runs) -- the single genuinely-new module of Phase 32. Turns the Plan-01 taxonomy suite GREEN (21/21).
- Additive, BACKWARD-COMPATIBLE schema bump v1->v2: `FSB_RECIPE_SCHEMA_VERSION = 2`, `schemaVersion` widened from `const` to `enum:[1,2]` (so persisted schemaVersion:1 recipes still validate at runtime -- the literal D-08 proof), plus optional `capturedAt` + `expectedShape`; `additionalProperties:false` and the `required` list preserved.
- Threaded `expectedShape` + `capturedAt` through the interpreter into the bound spec (mirroring the `extract` carry) and stamped a conservative `expectedShape:'@'` + `capturedAt` on synthesized learned recipes at schemaVersion:2.
- Migrated the in-`npm test`-chain schema regression gate for the enum bump (version===2; v1 fixture still validates; out-of-enum 3 and 0 rejected; v2-with-optional-fields accepts) + added a `valid-recipe-v2.json` fixture the recipe-path guard Check 2 also validates.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create capability-rot-detector.js** - `c55c30cc` (feat)
2. **Task 2: Backward-compatible schema v1->v2 + interpreter carry + synthesizer stamp** - `e66ddcbe` (feat)
3. **Task 3: Migrate the in-chain schema regression gate + v2 fixture** - `e80dba8b` (test)

**Plan metadata:** see the final docs commit.

## Files Created/Modified

- `extension/utils/capability-rot-detector.js` (created) - The pure, dynamic-code-free rot classifier: `classifyRecipeBroken` (decision table) + `validateExpectedShape` (conservative present-container predicate) + the read-path engine accessor. Dual-export IIFE, ASCII-only, on the recipe-path allowlist.
- `catalog/recipes/_fixtures/valid-recipe-v2.json` (created) - A schemaVersion:2 accept fixture carrying capturedAt + expectedShape; doubles as a build-time v2 accept proof under the recipe-path guard Check 2.
- `extension/utils/capability-recipe-schema.js` (modified) - FSB_RECIPE_SCHEMA_VERSION 1->2; schemaVersion const->enum:[1,2]; optional capturedAt + expectedShape added; additionalProperties:false + required unchanged.
- `extension/utils/capability-interpreter.js` (modified) - Bound-spec build now carries expectedShape + capturedAt alongside extract (typeof-guarded, unevaluated data).
- `extension/utils/recipe-synthesizer.js` (modified) - SCHEMA_VERSION 1->2; recipe core stamps expectedShape:'@' + capturedAt:new Date().toISOString(); core stays closed-vocab and still passes validateRecipe.
- `tests/capability-recipe-schema.test.js` (modified) - version assertion ===1 -> ===2; v1 accept kept (backward-compat proof); inverted schemaVersion:2->INVALID replaced with out-of-enum 3/0 reject + v2-optional-fields accept + v2 fixture accept; missing-version reject unchanged.

## Decisions Made

- **schemaVersion enum, not bumped const:** D-08 "v1 stays valid" is implemented as `enum:[1,2]` so the Phase-31 persisted LEARNED recipes (schemaVersion:1, LEARN-04) keep validating at runtime; a bumped const would have mass-invalidated them. An out-of-enum version (0/3) is still rejected, and schemaVersion stays in `required`.
- **Engine-absent and engine-throw both degrade to shape-passes** in validateExpectedShape (D-06): a missing/failing read-path engine must not manufacture false RECIPE_EXPIRED that masks real results; the DOM fallback is the real backstop.
- **Typed-passthrough ordering:** the `success:false && /^RECIPE_/` branch runs before the generic fetch-failed branch so a security rejection (origin-pin / consent) is never healed away (T-32-PASS, Pitfall 3).
- **Conservative synthesized expectedShape ('@'):** the synthesizer only has redacted shape-only capture, never a response body, so '@' ("the learned endpoint still returns a non-null response") is the strongest derivable assertion (D-07/A4).

## Deviations from Plan

None - plan executed exactly as written. (No bugs, missing-critical, or blocking issues encountered; Rules 1-4 did not fire. The optional sibling v2 fixture suggested in Task 3 was added.)

## Issues Encountered

None during planned work. Two pre-existing intentionally-RED suites were observed in the no-regression sweep and confirmed OUT OF SCOPE for this plan (logged to `deferred-items.md`):

- **tests/capability-router.test.js (8 RED):** all 8 failures are router rot-path WIRING (HEAL-01 "routes to RECIPE_DOM_FALLBACK_PENDING", HEAL-03 quarantine + runDiscovery re-learn). The plan explicitly says "Do NOT touch the router/autopilot wiring (Plan 03)"; `capability-router.js` is UNMODIFIED by this plan (verified via git status). 30/38 pass; the 8 go GREEN when Plan 03 wires classifyRecipeBroken into the router. Owner: Plan 03.
- **tests/recipe-schema-lock.test.js (1 RED):** the "FSB_RECIPE_SCHEMA_VERSION === 2" assertion now PASSES (this plan's bump satisfied it); the "frozen v2 RECIPE_SCHEMA hash" assertion fails against a `TBD-FROZEN-IN-PLAN-04` placeholder (the suite prints the actual digest `f35211f5...` for Plan 04 to paste). The plan scopes the v2-hash re-freeze to Plan 04 (Pitfall 6). Owner: Plan 04.

## Verification

Plan verification block (all exit 0):

- `node tests/capability-rot-detector.test.js` -> 21/21 GREEN (taxonomy + expectedShape).
- `node tests/capability-recipe-schema.test.js` -> 46/46 GREEN (migrated: version===2; v1 fixture valid; out-of-enum 3/0 rejected; v2-with-optional-fields valid).
- `node tests/recipe-synthesizer.test.js` -> 21/21 GREEN (synthesized expectedShape:'@' + capturedAt at schemaVersion:2 still pass validateRecipe).
- `node scripts/verify-recipe-path-guard.mjs` -> PASS (rot-detector eval-free + on allowlist; 9 on-disk capability modules covered; valid-recipe-v2.json validated by Check 2).

No-regression (all exit 0): capability-interpreter (51/51), recipe-signature-interpreter-hook (13/13), recipe-path-guard, capability-fetch, and all 5 learned-* suites.

Posture checks: capability-rot-detector.js and valid-recipe-v2.json are ASCII-only (no emojis, CLAUDE.md hard constraint); the rot-detector contains zero eval / new Function / import( (Wall-1, verified by grep + the guard's comment-scanning Check 1).

## User Setup Required

None - no external service configuration required (user_setup: [] in the plan; no packages installed).

## Next Phase Readiness

- Plan 03 can now wire `classifyRecipeBroken` into `capability-router.js` after `executeBoundSpec` (the rot path: broken -> RECIPE_DOM_FALLBACK_PENDING + quarantine + runDiscovery re-learn), turning the 8 RED router assertions GREEN. The router reads `recipe.expectedShape` directly; the interpreter's spec carry is the belt-and-suspenders path.
- Plan 04 re-freezes the v2 RECIPE_SCHEMA hash: paste the digest the recipe-schema-lock suite prints (`f35211f524639f4b9611edb973b1eaf94f24769fbaff205e3c658914fd622a37`) over the TBD placeholder.
- No blockers introduced. Wall-1 (eval-free recipe path) and the closed schema vocabulary remain intact.

## Self-Check: PASSED

- All 6 created/modified files verified present on disk (capability-rot-detector.js, valid-recipe-v2.json, capability-recipe-schema.js, capability-interpreter.js, recipe-synthesizer.js, capability-recipe-schema.test.js).
- All 3 task commits verified in git history (c55c30cc, e66ddcbe, e80dba8b).

---
*Phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider*
*Completed: 2026-06-23*
