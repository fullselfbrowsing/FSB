---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
plan: 01
subsystem: testing
tags: [capability-router, capability-catalog, zero-framework-test, mv3-ci-guard, recipe-path-allowlist, package-extension, inv-04, autopilot-parity]

# Dependency graph
requires:
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    provides: "routerless invoke path (mcp:capabilities-invoke), capability-search slug->recipe map, the EXPECTED_NON_TRIGGER_REGISTRY_HASH lock, capability-mcp-surface.test.js patterns"
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    provides: "executeBoundSpec + two-point origin-pin (RECIPE_ORIGIN_MISMATCH), the capability-fetch.test.js chrome-stub + executeScript recorder"
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: "interpretRecipe, the recipe-path CI guard + RECIPE_PATH_ALLOWLIST, the /^RECIPE_.+$/ mapFSBError passthrough"
provides:
  - "tests/capability-router.test.js -- the CAT-01/02/03/05 Nyquist sampling surface (RED until Plan 02/03 land the router/handlers)"
  - "tests/capability-autopilot-parity.test.js -- the CAT-04 one-engine-two-front-doors + INV-01 out-of-registry surface (RED front doors until Plans 04/05; INV-01 floor GREEN today)"
  - "tests/agent-loop-iterator-guard.test.js -- the INV-04 setTimeout-iterator byte guard (GREEN today)"
  - "capability-router.js + capability-catalog.js pre-armed on RECIPE_PATH_ALLOWLIST (guard fails closed once Plan 02 creates them)"
  - "package-extension.mjs handler-copy step (ships catalog/handlers/*.js under extension/ once Plan 03 creates them; absent-dir-tolerant today)"
  - "all three new tests wired into npm test after capability-mcp-surface.test.js"
affects: [29-02-router-catalog, 29-03-bundled-head-handlers, 29-04-dispatcher-reroute, 29-05-autopilot-parity-branch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED test scaffolding: the Nyquist sampling tests are authored BEFORE the modules they import exist; a MODULE_NOT_FOUND is a clean deterministic RED detected by the harness (not a crash)"
    - "typeof-guarded global injection: the router test injects stub FsbCapabilityCatalog/FsbCapabilityFetch via globalThis so the pure router is Node-unit-testable exactly as the SW typeof-guarded-global convention intends"
    - "pre-arm-ahead-of-creation: a new extension/utils/capability-*.js is added to RECIPE_PATH_ALLOWLIST in the SAME milestone, before the file lands (Check 1 existsSync-skips absent, Check 4 fails closed once present) -- the Phase-27/28 precedent"
    - "handlers are COPIED not JSON-inlined: catalog/handlers/*.js are reviewed CODE, copyFileSync'd verbatim under extension/catalog/handlers/ (vs the recipe-index JSON-inline), absent-dir-tolerant via existsSync"

key-files:
  created:
    - tests/capability-router.test.js
    - tests/capability-autopilot-parity.test.js
    - tests/agent-loop-iterator-guard.test.js
  modified:
    - scripts/verify-recipe-path-guard.mjs
    - scripts/package-extension.mjs
    - package.json

key-decisions:
  - "Router fall-through reason codes locked: RECIPE_NOT_FOUND (no catalog entry / no recipe), RECIPE_LEARN_PENDING (T2 stub), RECIPE_DOM_FALLBACK_PENDING (T3 seam) -- all match /^RECIPE_.+$/ and surface verbatim through the built mapFSBError"
  - "Catalog resolve(slug, origin) contract finalized for the tests: a slug is EITHER T1a OR T1b (explicit tier, no runtime tie-break); origin biases candidate ranking only (owned-origin first), never the tier of a known slug (RESEARCH Open Q3)"
  - "The MCP front door is driven in the parity test via dispatchMcpMessageRoute('mcp:capabilities-invoke', ...) (the dispatcher does not export handleCapabilitiesInvokeMessageRoute); the autopilot front door via tool-executor.js executeCapabilityToolForAutopilot (Plan 05 adds + exports it)"
  - "The iterator guard pins ALL FOUR setTimeout schedule callsites (the three canonical 100/5000/2000ms INV-04 lines plus the defensive :2026 100ms no-tool-call fallback) and asserts the callsite count == 4 -- a stricter byte-and-count guard than the plan's three-line minimum"

patterns-established:
  - "Wave 0 RED scaffolding: author the sampling tests now; MODULE_NOT_FOUND for a not-yet-created import is the correct RED, detected (not crashed) by the harness"
  - "Pre-arm the fail-closed CI guard + the packager in the same milestone the modules are planned, so both are correct the instant the modules land"

requirements-completed: [CAT-01, CAT-02, CAT-03, CAT-04, CAT-05]

# Metrics
duration: 6min
completed: 2026-06-21
---

# Phase 29 Plan 01: Wave 0 Validation Contract + Fail-Closed CI/Packaging Prerequisites Summary

**Stood up the three Nyquist sampling tests (router CAT-01/02/03/05, autopilot-parity CAT-04, INV-04 iterator byte guard) in RED, and pre-armed the recipe-path allowlist + the handler packaging step BEFORE the router/catalog/handlers exist, so every later wave is sampled against real tests and the CI guard + packaged build are correct the moment the new modules land.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-21T19:47:39Z
- **Completed:** 2026-06-21T19:53:57Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Authored `tests/capability-router.test.js` (398 lines) — the full CAT-01/02/03/05 contract: tier order via an injected in-memory catalog, origin bias (owned-origin selection), T1a handler dispatch + the real-`executeBoundSpec` origin-pin (`RECIPE_ORIGIN_MISMATCH`, empty recorder), the T1b lifted `interpretRecipe`→`executeBoundSpec` path stamped `tier:'T1b'`, the three typed reasons each matching `/^RECIPE_.+$/` and surfacing verbatim through the built `mapFSBError`, and the T3-no-exec spy. A clean RED today (the router lands in Plan 02).
- Authored `tests/capability-autopilot-parity.test.js` (223 lines) — CAT-04 one-engine-two-front-doors: a spy on `globalThis.FsbCapabilityRouter.invoke` asserts both the MCP dispatcher route and the autopilot branch reach the same engine with the same `(slug, args)` and a `makeResult`-shaped wrapper (RED until Plans 04/05). The INV-01 / Anti-Pattern-1 floor (both capability tools out of `TOOL_REGISTRY`; frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unmoved) runs GREEN today.
- Authored `tests/agent-loop-iterator-guard.test.js` (73 lines) — the INV-04 byte guard pinning the `setTimeout`-chained iterator lines (100/5000/2000ms) and the schedule callsite count; passes today and reds on any future iterator edit.
- Pre-armed `RECIPE_PATH_ALLOWLIST` with `capability-router.js` + `capability-catalog.js` (guard still PASSes — 10 files clean) and added the absent-dir-tolerant handler-copy step to `package-extension.mjs`; wired all three tests into `npm test`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the RED router test (CAT-01/02/03/05)** — `5d257219` (test)
2. **Task 2: Author the RED autopilot-parity test (CAT-04) + the INV-04 iterator guard** — `8e82324f` (test)
3. **Task 3: Pre-arm the allowlist + the handler packaging step + wire both tests into the chain** — `8182cc32` (chore)

**Plan metadata:** _(this commit)_ `docs(29-01): complete plan`

## Files Created/Modified
- `tests/capability-router.test.js` (created) — zero-framework router unit suite; requires `../extension/utils/capability-router.js`; injects stub `FsbCapabilityCatalog`/`FsbCapabilityFetch` via `globalThis`; reuses the `capability-fetch.test.js` chrome-stub + `executeScript` recorder for the origin-pin path; RED until Plan 02.
- `tests/capability-autopilot-parity.test.js` (created) — spies on `globalThis.FsbCapabilityRouter.invoke`, drives the MCP door via `dispatchMcpMessageRoute('mcp:capabilities-invoke')` and the autopilot door via `executeCapabilityToolForAutopilot`; asserts registry absence + the frozen hash (GREEN) and the two-front-door identity (RED until Plans 04/05).
- `tests/agent-loop-iterator-guard.test.js` (created) — reads `extension/ai/agent-loop.js`, asserts the three canonical iterator strings byte-unchanged + exactly 4 schedule callsites; GREEN today.
- `scripts/verify-recipe-path-guard.mjs` (modified) — appended `capability-router.js` + `capability-catalog.js` to `RECIPE_PATH_ALLOWLIST` with a Phase-29 pre-arm comment (Pitfall 4).
- `scripts/package-extension.mjs` (modified) — `copyFileSync` import + an `existsSync`-guarded step copying `catalog/handlers/*.js` verbatim into `extension/catalog/handlers/` and logging the count (Pitfall 5 / 28-D-16 trap).
- `package.json` (modified) — appended `capability-router.test.js && capability-autopilot-parity.test.js && agent-loop-iterator-guard.test.js` to `scripts.test` after `capability-mcp-surface.test.js`.

## Decisions Made
- **Typed fall-through reason names** (Claude's Discretion per CONTEXT/RESEARCH A6): `RECIPE_NOT_FOUND` / `RECIPE_LEARN_PENDING` / `RECIPE_DOM_FALLBACK_PENDING`. All match `/^RECIPE_.+$/` and were verified to surface verbatim (not collapsed to `action_rejected`) through the built `mcp/build/errors.js` `mapFSBError`. These are now FINALIZED in the test surface, so Plan 02 must emit exactly these codes.
- **Catalog `resolve(slug, origin)` contract** (RESEARCH Open Q3): a slug is EITHER T1a OR T1b (explicit per-slug tier, no runtime tie-break); origin biases candidate ranking only (owned-origin first, mirroring `_stableSortByOwnedService`). The router test exercises this exactly.
- **MCP front door driven via the route table:** the dispatcher does not export `handleCapabilitiesInvokeMessageRoute`, so the parity test uses the exported `dispatchMcpMessageRoute('mcp:capabilities-invoke', { payload })` (both capability routes confirmed present in `MCP_PHASE199_MESSAGE_ROUTES`). The autopilot front door uses `executeCapabilityToolForAutopilot` (added + exported by Plan 05).
- **Stricter iterator guard than required:** the plan asked for the three canonical lines; the guard additionally pins the defensive `:2026` 100ms no-tool-call fallback and asserts the total schedule callsite count is exactly 4, so a *new* or *removed* iterator schedule also reds the guard.

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed their `<action>`/`<acceptance_criteria>` verbatim. The RED state of the two import-dependent tests (router, parity front-doors) is the intended Wave 0 outcome, not a deviation; the iterator guard and the recipe-path guard are GREEN as required.

## Issues Encountered
None. Confirmed up front that `tool-executor.js` and `mcp-tool-dispatcher.js` both `require()` standalone in Node (so the parity test's require structure is valid), that the dispatcher exports `dispatchMcpMessageRoute` + the two capability routes (but not the internal invoke handler), and that `mcp/ai/tool-definitions.cjs` + `mcp/build/errors.js` are already built (so the registry-hash and `mapFSBError` assertions resolve). The packager's new handler-copy step was run and verified to log "copied 0 handler module(s) ... (absent catalog/handlers/ tolerated)" without throwing.

## Known Stubs
None. This plan authors test/guard scaffolding only; it ships no implementation stubs. The RED tests are the deliberate Wave 0 sampling surface — the modules they import (`capability-router.js`, the autopilot branch) are created by Plans 02–05, not stubbed here (per the plan's explicit "do NOT stub the implementation here").

## User Setup Required
None — no external service configuration required. Phase 29 installs zero external packages (the recipe-path guard is the supply-chain control).

## Next Phase Readiness
- **Plan 02 (router + catalog):** the router test (`tests/capability-router.test.js`) is the GREEN target. The router must export `invoke(slug, args, { origin, tabId })` returning `{ success:true, ...result, tier }` on a hit or the dual-field `{ success:false, code, errorCode, error }` typed fall-through; the catalog must export `resolve(slug, origin) -> { tier, handler?, recipe? } | null`. Both must register on `RECIPE_PATH_ALLOWLIST` (already pre-armed) and stay eval-free (Check 4 will fail closed otherwise).
- **Plan 03 (bundled head):** `catalog/handlers/*.js` will be copied into the package automatically (the packager step is in place); each handler is a slug-keyed `{ tier:'T1a', origin, sideEffectClass, async handle(args, ctx) }` that calls `ctx.executeBoundSpec` and never `chrome.scripting` itself.
- **Plans 04/05 (reroute + autopilot branch):** the parity test's two front-door assertions go GREEN when the dispatcher's `mcp:capabilities-invoke` handler and the new `executeCapabilityToolForAutopilot` both call `globalThis.FsbCapabilityRouter.invoke`. INV-01 must stay GREEN (the frozen hash is asserted unmoved); the iterator guard must stay GREEN (hook `tool-executor.js`, never `agent-loop.js`).
- No blockers. The `[ASSUMED]` head-service internal endpoints remain a Plan-03 live-capture item, flagged in RESEARCH (not gating this plan).

## Self-Check: PASSED

- Created files verified on disk: `tests/capability-router.test.js`, `tests/capability-autopilot-parity.test.js`, `tests/agent-loop-iterator-guard.test.js`, `29-01-SUMMARY.md`.
- Task commits verified in git log: `5d257219`, `8e82324f`, `8182cc32`.
- Behavioral verification: `node tests/agent-loop-iterator-guard.test.js` exit 0; `node scripts/verify-recipe-path-guard.mjs` exit 0 (10 files clean); `node tests/capability-router.test.js` exit 1 (clean RED — module lands Plan 02); `node tests/capability-autopilot-parity.test.js` exit 1 (INV-01 floor GREEN, front doors RED — Plans 04/05); all three tests wired into `npm test`.

---
*Phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo*
*Completed: 2026-06-21*
