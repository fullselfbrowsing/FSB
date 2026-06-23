---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
plan: 05
subsystem: api
tags: [autopilot, tool-executor, capability-router, mv3, service-worker, agent-loop, INV-02, INV-04]

# Dependency graph
requires:
  - phase: 29-02
    provides: capability-router.js (globalThis.FsbCapabilityRouter.invoke) -- the shared engine both front doors call
  - phase: 29-04
    provides: handleCapabilitiesInvokeMessageRoute rerouted to FsbCapabilityRouter.invoke (front door 1 of INV-02)
  - phase: 29-03
    provides: the T1a bundled-head handlers + catalog the router dispatches to
provides:
  - "Autopilot front door (front door 2 of INV-02): executeCapabilityToolForAutopilot in tool-executor.js calls the SAME globalThis.FsbCapabilityRouter the MCP dispatcher calls -- one engine, two front doors, no parallel autopilot stack"
  - "A pre-executeTool capability guard (CAPABILITY_TOOL_NAMES) ABOVE _te_getToolByName -- the Pitfall-1 correction for out-of-registry tools (they never reach the _route switch)"
  - "An additive buildSystemPrompt hint so the autopilot model can ORIGINATE invoke_capability / search_capabilities calls despite the tools being out-of-registry (getPublicTools maps only the registry)"
  - "Full headless phase-close gate green: INV-01 hash unmoved, router behavior, autopilot parity, INV-04 iterator byte-untouched, recipe-path guard"
affects: [phase-30-consent-governance, phase-31-discovery, phase-32-self-heal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two front doors, one SW-global engine (the trigger precedent generalized to FsbCapabilityRouter)"
    - "Pre-executeTool guard for out-of-registry tools (mirrors the trigger ownership-strip SHAPE at a DIFFERENT hook point)"
    - "Out-of-registry LLM surfacing via an additive system-prompt hint, never a TOOL_REGISTRY entry (protects the frozen INV-01 hash)"

key-files:
  created: []
  modified:
    - extension/ai/tool-executor.js
    - extension/ai/agent-loop.js
    - tests/capability-autopilot-parity.test.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "The capability autopilot branch is a pre-executeTool guard (BEFORE _te_getToolByName), NOT an executeBackgroundTool switch case: the capability tools are out-of-registry (INV-01), so _te_getToolByName returns null and executeTool dies at 'Unknown tool' before the _route switch is ever consulted (Pitfall-1)."
  - "executeCapabilityToolForAutopilot reuses buildAutopilotTriggerParams (ownership strip) + makeResult and calls globalThis.FsbCapabilityRouter.invoke -- the SAME global the MCP dispatcher calls (INV-02). search_capabilities routes to FsbCapabilitySearch.search (never mutates); only invoke_capability sets hadEffect."
  - "The two capability tools stay OUT of TOOL_REGISTRY; the LLM is told they exist via a small additive buildSystemPrompt string, not a tool schema -- the frozen INV-01 non-trigger hash is unmoved and getPublicTools() never lists them (Pitfall-2)."
  - "The agent-loop.js setTimeout-chained iterator is byte-untouched (INV-04); the ONLY agent-loop.js edit is the one additive prompt line."

patterns-established:
  - "Two front doors, one engine: MCP dispatcher + autopilot tool-executor branch both call globalThis.FsbCapabilityRouter.invoke; parity is at the runtime layer, not the tool layer."
  - "Out-of-registry tool autopilot reach = pre-executeTool guard + additive prompt hint (never a registry entry)."

requirements-completed: [CAT-04]

# Metrics
duration: 7min
completed: 2026-06-21
---

# Phase 29 Plan 05: Autopilot Parity Front Door Summary

**Autopilot now reaches the same FsbCapabilityRouter SW-global as the MCP dispatcher via a pre-executeTool guard in tool-executor.js (one engine, two front doors, INV-02), with an additive system-prompt hint and the INV-04 iterator byte-untouched -- the full headless suite is green.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-21T20:28:56Z
- **Completed:** 2026-06-21T20:36:03Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added `executeCapabilityToolForAutopilot` + the `CAPABILITY_TOOL_NAMES` guard at the TOP of `executeTool` (before `_te_getToolByName`) -- the Pitfall-1 correction: out-of-registry capability tools route to the shared engine instead of dying at "Unknown tool". The branch mirrors the `trigger` ownership-strip / `makeResult` SHAPE but calls `globalThis.FsbCapabilityRouter.invoke` (front door 2 of INV-02).
- Added a small additive `buildSystemPrompt` hint surfacing `search_capabilities` + `invoke_capability` to the autopilot model (Pitfall-2: the tools are out-of-registry, so `getPublicTools()` can never list them).
- Closed the phase gate: the parity test (`capability-autopilot-parity`) is GREEN 10/0 (both front doors hit the same spied router global with identical slug+args; makeResult-shaped result carrying the router response verbatim; INV-01 out-of-registry + frozen hash), the INV-04 iterator byte-guard is GREEN 4/0, and the FULL `npm test` chain exits 0 with the recipe-path guard green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the pre-executeTool capability guard + executeCapabilityToolForAutopilot** - `1e677739` (feat)
2. **Task 2: Add the additive system-prompt capability hint (INV-04 iterator byte-untouched)** - `eb56fcb8` (feat)
3. **Task 3: Full-suite phase-close gate (stale-baseline Rule-1 fix)** - `dd3976c0` (test)

**Plan metadata:** (final docs commit -- see git log)

## Files Created/Modified
- `extension/ai/tool-executor.js` - Added `CAPABILITY_TOOL_NAMES` + `executeCapabilityToolForAutopilot` (calls `globalThis.FsbCapabilityRouter.invoke`, reuses `buildAutopilotTriggerParams` + `makeResult`); guard inserted at the top of `executeTool` before `_te_getToolByName`; exported the function for the parity harness.
- `extension/ai/agent-loop.js` - One additive `buildSystemPrompt` line naming the two capability tools and when to prefer them. The setTimeout iterator region is byte-untouched.
- `tests/capability-autopilot-parity.test.js` - Rule-1 harness fix: front door 1 was driven with two positional args; `dispatchMcpMessageRoute` takes a single `{ type, payload }` object. Corrected the call (assertion unchanged).
- `tests/lattice-provider-bridge-smoke.test.js` - Rule-1 stale-baseline fix: refreshed the `background.js` importScripts counts for the Phase 29 +5 modules.

## Decisions Made
- Surfaced both capability tools to autopilot (`search_capabilities` and `invoke_capability`) in the prompt hint -- the RESEARCH `[ASSUMED]` flag left search-to-autopilot as planner discretion; surfacing both is harmless (search never mutates) and matches the branch already handling both names.
- Kept the hint minimal (one sentence-pair, not tool schemas) per Pitfall-2 / RESEARCH Open Q1: CAT-04 is gated on the parity test (the branch routes correctly to the same engine); full autopilot-originated capability use is a later refinement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Parity-test front-door-1 invocation used the wrong call signature**
- **Found during:** Task 1 (verifying `node tests/capability-autopilot-parity.test.js`)
- **Issue:** The Wave-0 parity test called `dispatcher.dispatchMcpMessageRoute('mcp:capabilities-invoke', { payload: {...} })` with two positional args, but `dispatchMcpMessageRoute({ type, payload, ... })` takes a SINGLE destructured object (mcp-tool-dispatcher.js:472). With a string as the first arg, `type` was `undefined`, the route lookup missed, and front door 1 returned `mcp_route_unavailable` ("Missing direct MCP route for undefined") -- so the spy was never hit even though the Plan-04 reroute correctly calls `FsbCapabilityRouter.invoke`.
- **Fix:** Corrected the harness call to `dispatchMcpMessageRoute({ type: 'mcp:capabilities-invoke', payload: {...} })`. The assertion (both front doors hit the spied router global with the same slug+args) is unchanged; only the driving call shape was fixed.
- **Files modified:** tests/capability-autopilot-parity.test.js
- **Verification:** `node tests/capability-autopilot-parity.test.js` -> 10 passed, 0 failed (front door 1 now hits the spy and returns tier:T1b).
- **Committed in:** `1e677739` (Task 1 commit)

**2. [Rule 1 - Bug] Stale background.js importScripts baseline in another plan's smoke test**
- **Found during:** Task 3 (full `npm test` phase-close gate)
- **Issue:** `tests/lattice-provider-bridge-smoke.test.js` hardcoded `importScripts count = 170` / call-sites `= 166` (the Phase-28 baseline). Phase 29 (Plans 02-04) added 5 importScripts -- `utils/capability-catalog.js`, `utils/capability-router.js`, and the three T1a head handlers `catalog/handlers/{github,slack,notion}.js` -- so the actual counts are 175 / 171. This is the same class of stale-baseline drift Plan 28-01 left, anticipated by this plan's Task-3 action note.
- **Fix:** Updated both expected counts (170->175, 166->171) and their explanatory comments to record the Phase 29 +5 delta. No production code touched.
- **Files modified:** tests/lattice-provider-bridge-smoke.test.js
- **Verification:** `node tests/lattice-provider-bridge-smoke.test.js` exit 0; full `npm test` exit 0 with zero FAIL lines.
- **Committed in:** `dd3976c0` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- both stale Wave-0/Phase-28 test baselines, no production logic changed).
**Impact on plan:** Both fixes were necessary to make the gate green and neither weakened an assertion (the parity assertion is identical; the smoke baseline now reflects the real module count). No scope creep.

## Issues Encountered
None beyond the two auto-fixed stale-baseline bugs above. The router (Plan 02) and dispatcher reroute (Plan 04) were already in place, so front door 2 plus the harness fix were sufficient to turn the parity contract green.

## Test Results (phase-close gate)
- `npm test` -> exit 0, zero FAIL lines across the entire chain (including the mid-chain `npm --prefix mcp run build`).
- `node scripts/verify-recipe-path-guard.mjs` -> PASS (10 recipe-path files clean; all 7 on-disk capability modules on the allowlist, incl. capability-router.js + capability-catalog.js).
- `node tests/capability-mcp-surface.test.js` -> exit 0 (INV-01 frozen hash unmoved).
- `node tests/capability-router.test.js` -> exit 0.
- `node tests/capability-autopilot-parity.test.js` -> exit 0 (10/0; one engine, two front doors).
- `node tests/agent-loop-iterator-guard.test.js` -> exit 0 (4/0; INV-04 iterator byte-untouched).

## User Setup Required
None - no external service configuration required.

The single live-only property (a real authenticated head handler returning logged-in data from a real HttpOnly site) remains the Plan-03 `human_needed` UAT (29-HUMAN-UAT.md) and does NOT block this headless gate -- consistent with the Phase 27/28 posture.

## Next Phase Readiness
- Phase 29 (CAT-01..05) is execution-complete: catalog + tiered router (Plan 02), bundled head + declarative tail (Plan 03), internal-only dispatcher reroute / front door 1 (Plan 04), and autopilot parity / front door 2 (this plan). One engine, two front doors is proven at the runtime layer (INV-02) with INV-01 and INV-04 intact.
- Ready for Phase 29 verification, then Phase 30 (Consent Governance + Recipe Signature Verification): invoke currently runs UNGATED (origin-pin still holds on every tier path); Phase 30 adds the Off/Ask/Auto consent gate + mutation gating in front of the same shared router.

---
*Phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo*
*Completed: 2026-06-21*

## Self-Check: PASSED
- FOUND: 29-05-SUMMARY.md
- FOUND commits: 1e677739, eb56fcb8, dd3976c0
- FOUND modified files: extension/ai/tool-executor.js, extension/ai/agent-loop.js, tests/capability-autopilot-parity.test.js, tests/lattice-provider-bridge-smoke.test.js
