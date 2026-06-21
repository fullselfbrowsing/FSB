---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
plan: 02
subsystem: api
tags: [capability-router, capability-catalog, tier-dispatch, recipe, mv3-service-worker, origin-pin, dual-export-iife]

# Dependency graph
requires:
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    provides: "FsbCapabilitySearch.getRecipeBySlug slug->recipe map (T1b source, D-04); the routerless invoke path (mcp-tool-dispatcher.js:2202-2220) lifted into the T1b tier"
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    provides: "FsbCapabilityFetch.executeBoundSpec (MAIN-world credentialed fetch + the active-tab origin-pin the router must NOT bypass)"
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: "FsbCapabilityInterpreter.interpretRecipe (validate+bind+STOP); createRecipeError dual-field shape; RECIPE_PATH_ALLOWLIST + Check 4; errors.ts /^RECIPE_.+$/ passthrough"
  - phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
    provides: "Plan 01 RED tests/capability-router.test.js (the CAT-01/02/03/05 contract) + the pre-armed allowlist entries"
provides:
  - "FsbCapabilityCatalog: authoritative slug->{tier, handler|recipe, descriptor} registry; resolve(slug, origin); registerHandler(slug, entry) Plan-03 T1a seam; biasByOwnedOrigin owned-origin-first re-rank"
  - "FsbCapabilityRouter: invoke(slug, args, {origin, tabId}) tiered dispatch (T0/T1a/T1b/T2/T3) returning {success:true, ...result, tier} or the dual-field typed-error shape"
  - "The T1b/T0 lifted declarative tier (interpretRecipe -> executeBoundSpec, tier-stamped); the T1a handler-dispatch tier; T2->RECIPE_LEARN_PENDING + T3->RECIPE_DOM_FALLBACK_PENDING typed-fall-through seams"
  - "Additive SW importScripts wiring (catalog then router after capability-search.js) -- the engine both front doors will share (INV-02)"
affects: [phase-29-plan-03-bundled-head-handlers, phase-29-plan-04-dispatcher-autopilot-reroute, phase-31-learned-recipes-T2, phase-32-self-healing-DOM-fallback-T3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-export IIFE SW module (global.FsbCapability* + module.exports) mirroring capability-search.js / capability-interpreter.js tails"
    - "typeof-guarded collaborator accessors (_catalog/_search/_interp/_fetchPrimitive) so Node unit tests inject stubs"
    - "Tiered dispatch with typed fall-through reasons via the createRecipeError dual-field shape ({success:false, code, errorCode, error})"
    - "Lifted routerless body becomes a tier case (the router routes; executeBoundSpec keeps the pin)"

key-files:
  created:
    - "extension/utils/capability-catalog.js"
    - "extension/utils/capability-router.js"
  modified:
    - "extension/background.js"

key-decisions:
  - "Two separate modules (catalog + router), not one combined module -- registry-data and routing-logic stay separately testable (D-04, PATTERNS recommendation)"
  - "Catalog declares each slug's tier AUTHORITATIVELY and attaches a best-effort inline recipe copy; the router prefers entry.recipe then _search().getRecipeBySlug -- so a T1b slug resolves its tier even before the search index is built (dev tree / unit harness)"
  - "T1a handler registration is a declarative registerHandler(slug, entry) seam the Plan-03 handler modules push into at load -- the catalog never imports a handler"
  - "T2/T3 return typed reasons ONLY (RECIPE_LEARN_PENDING / RECIPE_DOM_FALLBACK_PENDING); the router never calls executeTool/page injection this phase (real T2=Phase 31, real T3=Phase 32)"
  - "The router is a PURE module: no chrome./fetch/eval/new Function/import even in comments; it never re-targets -- the active-tab origin-pin holds inside executeBoundSpec on every real-tier path (D-12, Pitfall 3)"

patterns-established:
  - "Pattern 1: tier dispatch switch on catalog entry.tier with the lifted declarative body as case T1b/T0 and a handler.handle(args, ctx) dispatch as case T1a"
  - "Pattern 2: origin bias lives in the catalog's resolve()/biasByOwnedOrigin (owned-origin-first, NEVER re-tiers a known slug); the router routes the single entry it returns"

requirements-completed: [CAT-01, CAT-03, CAT-05]

# Metrics
duration: 5min
completed: 2026-06-21
---

# Phase 29 Plan 02: Catalog + Tiered Router (Declarative Tail) Summary

**Origin-biased tiered capability router (T0/T1a/T1b/T2/T3) plus the authoritative slug->tier catalog -- two pure dual-export IIFE SW modules that turn tests/capability-router.test.js fully GREEN (24/24) with the T1b lifted body real, T1a handler-dispatch ready, and T2/T3 as typed-fall-through seams.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-21T19:58:44Z
- **Completed:** 2026-06-21T20:03:00Z (approx)
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `capability-router.js` -- the single SW-global tier-dispatch engine `FsbCapabilityRouter.invoke(slug, args, {origin, tabId})`: T1b/T0 run the verbatim-lifted routerless body (`interpretRecipe -> executeBoundSpec`, tier-stamped); T1a dispatches to `handler.handle(args, ctx)`; T2/T3 return `RECIPE_LEARN_PENDING` / `RECIPE_DOM_FALLBACK_PENDING` with NO execution; unknown slug/tier -> `RECIPE_NOT_FOUND`. All reasons use the dual-field `createRecipeError` shape and match `/^RECIPE_.+$/`.
- `capability-catalog.js` -- the authoritative per-slug tier registry; `resolve(slug, origin)` returns `{tier, handler|recipe, descriptor}` or `null`; `github.notifications` seeded as the T1b head; `registerHandler` is the declarative Plan-03 T1a seam; `biasByOwnedOrigin` is the reusable owned-origin-first re-rank (never re-tiers a known slug).
- Additive `importScripts` wiring in `background.js`: catalog then router, after `capability-search.js` + the `buildOrRestore` block (load order is load-bearing -- catalog reads `getRecipeBySlug`, router reads the catalog).
- The whole `tests/capability-router.test.js` CAT-01/02/03/05 contract is GREEN (24/24) with ZERO edits to the Plan-01 RED test file, including the T1a-handler, real-`executeBoundSpec` origin-pin (`RECIPE_ORIGIN_MISMATCH`, empty executeScript recorder), and origin-bias paths.
- No INV-01 regression: `capability-mcp-surface` (19/0), `capability-fetch` (26/0), and the frozen `tool-definitions-parity` hash (256/0) all stay green -- this plan adds two modules + additive importScripts and touches no dispatcher/registry surface.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author capability-catalog.js (slug->tier registry)** - `c60733c2` (feat)
2. **Task 2: Author capability-router.js (tier dispatch + lifted T1b body + typed fall-through)** - `12f72632` (feat)
3. **Task 3: Wire catalog + router into the SW importScripts load order** - `1e4fae0f` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

_Note: this is a `type: execute` plan whose RED contract was authored in Plan 01 (Wave 0); the Task 1/2 `tdd="true"` cycle was RED-first against that pre-existing suite -- the catalog landed first (router test still RED, expected), then the router turned the full suite GREEN._

## Files Created/Modified
- `extension/utils/capability-catalog.js` (created, 208 lines) - authoritative slug->{tier, handler|recipe, descriptor} registry; `resolve`/`registerHandler`/`biasByOwnedOrigin`; github.notifications T1b seed; eval-free dual-export IIFE on RECIPE_PATH_ALLOWLIST.
- `extension/utils/capability-router.js` (created, 216 lines) - tier-dispatch engine `invoke(slug, args, ctx)`; lifted T1b/T0 declarative body; T1a handler dispatch; T2/T3 typed-fall-through seams; pure module (no chrome./fetch), collaborators via typeof-guarded accessors.
- `extension/background.js` (modified, +11 lines, additive only) - `importScripts` slots for capability-catalog.js then capability-router.js after capability-search.js + buildOrRestore.

## Decisions Made
- **Two modules, not one** (catalog vs. router) -- keeps the registry data and the routing logic separately testable (D-04 Claude's Discretion; PATTERNS recommendation), and preserves the interpreter's purity charter (the router is never folded into capability-interpreter.js).
- **Authoritative tier + best-effort inline recipe:** the catalog declares the tier and attaches a byte-identical inline copy of `github-notifications.json` as a fallback; the router resolves the live recipe as `entry.recipe || _search().getRecipeBySlug(slug)` (D-04). This makes `resolve('github.notifications').tier === 'T1b'` hold even in the unit harness where the search index is not built, without making the inline copy the authoritative source.
- **Declarative T1a registration seam:** `registerHandler(slug, entry)` is the documented mechanism Plan 03 uses -- handler modules push themselves in at load (after the catalog loads); the catalog imports no handler. Keeps the registry declarative.
- **Tier label naming:** chose `RECIPE_LEARN_PENDING` (T2) and `RECIPE_DOM_FALLBACK_PENDING` (T3) as the typed fall-through reasons (Claude's Discretion, CONTEXT D-07); both match `/^RECIPE_.+$/` and surface verbatim via the existing `errors.ts` passthrough (no errors.ts edit).
- **Comment hygiene for the allowlist:** rephrased the catalog's Wall-1 comment to avoid the literal substrings `eval` / `new Function` / `import(` (the Task-1 verify and the router's `chrome.`/`fetch(` scan use a naive `indexOf`, stricter than the guard's word-boundary regex) -- mirrors the capability-search.js "dynamic-code constructs" phrasing.

## Deviations from Plan

None - plan executed exactly as written.

The plan's `<interfaces>` were finalized in Plan 01 and the RED test encodes the exact API; both modules were implemented to those contracts with no auto-fixes, no missing-critical additions, and no blocking-issue workarounds. The allowlist entries for both modules were already pre-armed by Plan 01 (the Phase-27/28 "register ahead of creation" precedent), so no guard edit was needed.

## Issues Encountered
- **Forbidden-substring self-flag (resolved within Task 1):** the catalog's first Wall-1 comment contained the literal words "eval / new Function / dynamic import", which the Task-1 verify's naive `indexOf('eval')` / `indexOf('import(')` scan flags. Rephrased to "dynamic-code constructs even in comments" (the established capability-search.js wording) -- no behavior change, scan clean. This is normal comment hygiene for the recipe-path allowlist, not a code defect.

## Known Stubs

These are INTENTIONAL phase-scoped seams (documented in 29-CONTEXT.md D-05/D-07 and the plan `must_haves`), NOT goal-blocking stubs:

- **T2 learned-recipe tier** (`capability-router.js`, `invoke` switch `case 'T2'`) - returns `RECIPE_LEARN_PENDING` with no execution. Real learned recipes (CDP capture -> synthesis -> promotion) are **Phase 31**.
- **T3 DOM-fallback tier** (`capability-router.js`, `invoke` switch `case 'T3'`) - returns `RECIPE_DOM_FALLBACK_PENDING` and MUST NOT call `executeTool`/page injection. Real self-healing DOM fallback is **Phase 32**.
- **T1a handler registry** (`capability-catalog.js`, `REGISTRY` seeds only the T1b `github.notifications`) - the `registerHandler` seam is in place but the 5-10 bundled imperative head handlers are **Plan 03** (`catalog/handlers/*.js`). The router's T1a dispatch path is real and proven against an injected stub handler in the test.
- **Inline recipe fallback** (`capability-catalog.js`, `GITHUB_NOTIFICATIONS_RECIPE`) - a deliberate best-effort copy of the shipped `catalog/recipes/github-notifications.json`; the authoritative runtime source remains the search slug->recipe map (D-04). Documented as such in-module.

## User Setup Required

None - no external service configuration required. Two new bundled SW modules + additive importScripts; no manifest/permission change, no new packages (RESEARCH Package Legitimacy Audit = N/A).

## Next Phase Readiness
- **Plan 03 (bundled head, CAT-02):** the router's T1a dispatch and the catalog's `registerHandler` seam are live and tested -- Plan 03 authors `catalog/handlers/*.js` and registers each handler's slug as `tier:'T1a'`. The packaging step (`scripts/package-extension.mjs`) and the handler-index still need to ship the handlers in a packaged build (the 28-D-16 trap; D-10).
- **Plan 04 (front-door reroute, CAT-04/INV-02):** the shared `FsbCapabilityRouter.invoke(...)` global is loaded at SW startup, ready for the MCP dispatcher (`handleCapabilitiesInvokeMessageRoute` rewire, D-03) and the autopilot `tool-executor.js` branch to both call it. The route table + wire names stay byte-identical (INV-01 hash unmoved).
- **No blockers.** The two-point origin-pin holds on every real-tier path; the router is not a pin bypass.

## Self-Check: PASSED

- Files verified on disk: `extension/utils/capability-catalog.js`, `extension/utils/capability-router.js`, `.planning/phases/29-catalog-tiered-router-bundled-head-declarative-tail-autopilo/29-02-SUMMARY.md` (all FOUND).
- Commits verified in git log: `c60733c2`, `12f72632`, `1e4fae0f` (all FOUND).
- `extension/background.js` (committed) contains both `importScripts('utils/capability-catalog.js')` and `importScripts('utils/capability-router.js')`.
- `node tests/capability-router.test.js` -> 24 passed / 0 failed; `node scripts/verify-recipe-path-guard.mjs` -> PASS.

---
*Phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo*
*Completed: 2026-06-21*
