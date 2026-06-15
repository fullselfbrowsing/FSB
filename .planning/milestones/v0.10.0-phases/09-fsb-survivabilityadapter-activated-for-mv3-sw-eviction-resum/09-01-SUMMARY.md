---
phase: 09-fsb-survivabilityadapter-activated-for-mv3-sw-eviction-resum
plan: 01
subsystem: lattice-integration
tags:
  - mv3
  - sw
  - lattice
  - survivability
  - resume
  - fint-13
  - fint-15

requires:
  - phase: 05-mv3-survivability-bundler
    provides: extension/ai/lattice-runtime-adapter.js (standalone factory + 4 contract methods + Phase 5 marker vocabulary)
  - phase: 08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-
    provides: background.js importScripts cluster pattern + lattice-step-emitter at line 13 (Phase 9 flag flip lands immediately after)
provides:
  - "globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true (default-on at SW boot; observable from first runAgentLoop invocation)"
  - "runAgentLoop entry restore wiring (deserialize + resume + ResumePolicy log) before line 1215 runAgentIteration kickoff"
  - "Module-level async helper _findLatestSnapshot(sessionId) for chrome.storage.session prefix lookup"
  - "Adapter instance stashed on session._latticeAdapter for Plan 09-02 serialize sidecar reuse (single construction)"
  - "Smoke Part 6 scaffold with 9 PASS (Plan 09-02 fills incrementally to >=17 PASS target)"
affects:
  - 09-02 (consumes session._latticeAdapter at the 2 in-flight persist callsites; marker writes feed the restore site)
  - 09-03 (REQUIREMENTS.md FINT-13 + FINT-15 narrative + audit G2 closure references this plan)

tech-stack:
  added: []
  patterns:
    - "Phase 6 flag-flip-in-background.js precedent (code-only globalThis.FSB_LATTICE_*_ENABLED at SW boot; options-page exposure deferred)"
    - "Defensive guard idiom (typeof FSB_*_ENABLED !== 'undefined' && FSB_*_ENABLED && typeof globalThis.<Factory> !== 'undefined') wrapping fire-and-forget try/catch -- Phase 5 + Phase 8 carryforward"
    - "Module-level async helper with chrome.storage.session.get(null, ...) + JavaScript prefix filter + ISO-8601 chronological sort (matches RESEARCH Section 5)"

key-files:
  created: []
  modified:
    - extension/background.js
    - extension/ai/agent-loop.js
    - tests/lattice-survivability-smoke.test.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "Flag flip inserted IMMEDIATELY AFTER importScripts('ai/lattice-step-emitter.js') at line 13 with FINT-13 comment block; ai-integration.js shifts from line 14 to line 20 (absolute shift acceptable per Phase 8 precedent)."
  - "Restore block inserted IMMEDIATELY BEFORE the existing runAgentIteration(sessionId, options) kickoff call at line ~1244 (post-Phase-9 line; pre-Phase-9 was 1215). Block lives at top-level runAgentLoop body, NOT inside any setTimeout lambda (INV-04 preserved by site choice, not by guardrail discipline at the iterator)."
  - "_findLatestSnapshot defined as module-level async function above runAgentLoop (line ~1099 area, after the Phase 240 D-02 commentary block); reusable from any future site that needs the same prefix lookup."
  - "All 4 Lattice ResumePolicy literals treated as log + proceed per CONTEXT.md D-03 + RESEARCH Section 6; ZERO 5th-literal regression (no SAFE_REPLAY). CONSERVATIVE per-policy recovery dispatch remains OUT OF SCOPE per Phase 5 D-22."
  - "Adapter stashed on session._latticeAdapter for downstream Plan 09-02 serialize sidecar reuse (single construction at runAgentLoop entry; mirrors Phase 5 lifecycle expectation per RESEARCH Section 4)."

patterns-established:
  - "Phase 9 flag-flip-in-background.js carryforward for tests/lattice-provider-bridge-smoke.test.js: the bridge -> ai-integration gap-check accepts importScripts OR Phase 9 FINT-13 comment lines OR the FSB_LATTICE_RUNTIME_ADAPTER_ENABLED flag assignment. Gap bound relaxed from <=2 to <=8."

requirements-completed:
  - FINT-13
  - FINT-15

duration: 7min
completed: 2026-05-31
---

# Phase 9 Plan 09-01: SurvivabilityAdapter flag flip + runAgentLoop entry restore wiring Summary

**FSB SurvivabilityAdapter activated at SW boot via globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true; runAgentLoop entry now invokes deserialize + resume against the latest chrome.storage.session snapshot, logs the 4-member Lattice ResumePolicy verdict, and stashes the adapter on session._latticeAdapter for Plan 09-02 serialize sidecar reuse. Smoke Part 6 scaffold ships 9 PASS Wave 0 baseline. INV-04 byte-frozen; INV-06 SHA unchanged.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-31T12:40:52Z
- **Completed:** 2026-05-31T12:48:17Z
- **Tasks:** 2 / 2 complete
- **Files created:** 0
- **Files modified:** 4 (extension/background.js, extension/ai/agent-loop.js, tests/lattice-survivability-smoke.test.js, tests/lattice-provider-bridge-smoke.test.js)

## Accomplishments

- **FINT-13 production-side delivery complete:** `extension/background.js` line 13 area gains the single-line flag flip `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;` immediately after `importScripts('ai/lattice-step-emitter.js')`. Five-line comment block precedes the assignment citing FINT-13 + Phase 6 precedent + onInstalled timing rationale. ai-integration.js shifts from line 14 to line 20 (absolute shift acceptable; alphabetical cluster intact).
- **FINT-15 (restore + adapter stash) delivery complete:** `extension/ai/agent-loop.js` gains the defensive runAgentLoop entry restore block immediately before the existing `runAgentIteration(sessionId, options);` kickoff. Block wrapped in 4-clause guard (flag defined + flag truthy + FsbLatticeRuntimeAdapter present + createFsbLatticeRuntimeAdapter callable) + try/catch fire-and-forget. Adapter stashed on `session._latticeAdapter` for Plan 09-02 sidecar reuse. ResumePolicy logged with sessionId + marker + capturedAt.
- **_findLatestSnapshot helper shipped:** module-level async function above runAgentLoop. Uses `chrome.storage.session.get(null, ...)` + JavaScript prefix filter + ISO-8601 chronological sort (sortable lexicographically). Safe against missing chrome / runtime.lastError; returns null on any failure path.
- **Smoke Part 6 scaffold:** 9 PASS Wave 0 baseline (6.0.1 flag presence in background.js, 6.0.2 flag position after lattice-step-emitter, 6.0.3 INV-04 deferred-iterator schedule count = 8, 6.0.4 _findLatestSnapshot helper defined, 6.0.5 session._latticeAdapter stash, 6.0.6 createFsbLatticeRuntimeAdapter call, 6.0.7 adapter.resume call, 6.0.8 INV-06 SAFE_REPLAY guardrail empty, 6.0.9 iterator pattern 4 matches).
- **Full npm test chain remains green** end-to-end. Phase 8 lattice-step-emitter smoke baseline 38 PASS / 0 FAIL preserved (carryforward gate). Phase 6 provider-bridge smoke updated with Phase 9 carryforward + still green (86 PASS).
- **npm run build green** (esbuild emits all 3 entries to extension/dist/; Pitfall 4 gate held).

## Task Commits

1. **Task 1: Flag flip in background.js + smoke Part 6 placeholder scaffold** -- `3117bd50` (feat) -- 3 files; +52 / -6 lines; flag-flip with FINT-13 comment block; Part 6 baseline 3 PASS (6.0.1, 6.0.2, 6.0.3); Phase 9 carryforward in provider-bridge smoke for the bridge -> ai-integration gap-check (gap bound 2 -> 8; intervening lines accept importScripts OR FINT-13 comment OR FSB_LATTICE_RUNTIME_ADAPTER_ENABLED assignment).
2. **Task 2: runAgentLoop entry restore wiring + _findLatestSnapshot helper** -- `80bb9dea` (feat) -- 2 files; +80 lines; module-level _findLatestSnapshot async helper; 4-clause defensive guard + try/catch restore block before runAgentIteration kickoff; adapter stashed on session._latticeAdapter; Part 6 expansion with 6 restore wiring assertions (6.0.4 through 6.0.9).

## Files Created/Modified

- `extension/background.js` (MODIFIED, +6 lines) -- FINT-13 comment block + `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;` at line 19, immediately after `importScripts('ai/lattice-step-emitter.js')` at line 13.
- `extension/ai/agent-loop.js` (MODIFIED, +49 lines) -- module-level `_findLatestSnapshot(sessionId)` async helper above `runAgentLoop` (line ~1099); restore block immediately before `runAgentIteration(sessionId, options);` kickoff (line ~1244, formerly line 1215).
- `tests/lattice-survivability-smoke.test.js` (MODIFIED, +34 lines) -- Part 6 Phase 9 activation scaffold (lines 286-318); 9 PASS Wave 0 baseline; assertions content-based per Phase 6/8 precedent so future line shifts don't break smoke.
- `tests/lattice-provider-bridge-smoke.test.js` (MODIFIED, Phase 9 carryforward) -- bridge -> ai-integration gap-check bound relaxed from `gap <= 2` to `gap <= 8`; intervening line acceptance broadened to importScripts OR Phase 9 FINT-13 comment OR FSB_LATTICE_RUNTIME_ADAPTER_ENABLED assignment.

## Decisions Made

- **Restore site IMMEDIATELY BEFORE runAgentIteration kickoff (not inside any setTimeout lambda)** -- runAgentLoop entry is the canonical structural restore point per RESEARCH Section 5; the kickoff call at line 1215 is at top-level runAgentLoop body (not a setTimeout callback). INV-04 preservation by SITE choice, not by guardrail discipline at the iterator. Plan 09-02 marker writes are the sites that demand INV-04 vigilance (placed before setTimeout, never inside).
- **`_findLatestSnapshot` defined as module-level async helper (not closure inside runAgentLoop)** -- mirrors the FSB convention for utility helpers above runAgentLoop (e.g., `_al_loadSessionConfig`); reusable from any future site; trivial to smoke-test via function-existence regex per Phase 6/8 precedent.
- **All 4 Lattice ResumePolicy literals collapse to "log + proceed"** per CONTEXT.md D-03 + RESEARCH Section 6 + Phase 5 D-22 (CONSERVATIVE recovery dispatcher OUT OF SCOPE). Zero 5th literal (no SAFE_REPLAY). The CONTEXT.md D-03 narrative mention of SAFE_REPLAY is treated as a documentation artifact corrected by RESEARCH Section 6.
- **Single adapter construction at runAgentLoop entry (option A from RESEARCH Section 4)** -- stashed on session._latticeAdapter for Plan 09-02 sidecar reuse (the 2 in-flight persist callsites at agent-loop.js:1840 + 2474). Avoids per-sidecar reconstruction cost + keeps sessionId in closure scope per Phase 5 lifecycle convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Phase 9 carryforward update of provider-bridge smoke bridge -> ai-integration gap-check assertion**
- **Found during:** Task 1 (full `npm test` run after background.js flag flip insertion)
- **Issue:** `tests/lattice-provider-bridge-smoke.test.js` line 547-551 had hardcoded assertions `gap <= 2` and `every intervening line is an importScripts() call`. Task 1's FINT-13 flag flip inserts 5 comment lines + 1 globalThis assignment between `importScripts('ai/lattice-step-emitter.js')` at line 13 and `importScripts('ai/ai-integration.js')` (now at line 20). Gap grew from 2 -> 7 (within the new 1..8 bound); intervening lines are no longer all importScripts. 7 assertion failures emitted.
- **Fix:** Updated the gap bound to `<= 8` (room for 1 emitter importScripts + up to 6 comment + flag lines + ai-integration) and broadened the intervening-line acceptance predicate from `/^\s*importScripts\(/` to `(isImport || isPhase9Comment || isPhase9Flag)` where isPhase9Comment matches `/^\s*\/\//` and isPhase9Flag matches `/^\s*globalThis\.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED\s*=\s*true/`. This preserves the Phase 5 D-17 no-arbitrary-content-between byte-frozen ethos -- intervening lines MUST still be one of three known shapes; no random code allowed.
- **Files modified:** tests/lattice-provider-bridge-smoke.test.js
- **Verification:** `npm test` exits 0 end-to-end; provider-bridge smoke gap-check + intervening-line predicate both green; Phase 5 D-17 ethos preserved with Phase 9 carryforward.
- **Committed in:** `3117bd50` (Task 1 commit; bundled with the flag-flip insertion that mandated the carryforward).

---

**Total deviations:** 1 auto-fixed (Rule 1 -- stale-literal carryforward update mandated by the +6-line FINT-13 flag-flip insertion). Exact mirror of Phase 8 Plan 08-01 Deviations #2 and #3 pattern.
**Impact on plan:** Zero scope creep; all 4 forbidden files untouched (lattice-runtime-adapter.js, lattice-step-emitter.js, lattice-provider-bridge.js, offscreen/lattice-host.js); zero Lattice-side commits; INV-04 byte-frozen.

## Issues Encountered

- None during planned work. The 1 auto-fixed deviation was anticipated by the Phase 8 Plan 08-01 pattern: the provider-bridge smoke's bridge -> ai-integration gap-check is a known cumulative-carryforward surface that each subsequent phase touching background.js between bridge and ai-integration must update.

## Hard Invariant Status

| Invariant | Required | Actual | Status |
|-----------|----------|--------|--------|
| INV-01 (tool-definitions parity) | green (existing baseline) | green (chain end "FAIL: 0") | HOLDS |
| INV-04 (deferred-iterator schedule count) | 8 | 8 | HOLDS |
| INV-04 (iterator pattern matches) | 4 | 4 | HOLDS |
| INV-04 (no marker writes inside any setTimeout lambda) | 0 | 0 (Plan 09-01 does not touch any setTimeout callsite) | HOLDS |
| INV-05 (deprecated agent modules absent or bannered) | unchanged | unchanged | HOLDS |
| INV-06 (Lattice SHA frozen) | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | HOLDS |
| INV-06 (no SAFE_REPLAY literal in agent-loop.js) | 0 | 0 | HOLDS |
| Wave 0 smoke floor | >= 39 PASS / 0 FAIL (estimated by plan) | 49 PASS / 0 FAIL | EXCEEDS |
| Phase 8 emitter smoke carryforward | >= 38 PASS / 0 FAIL | 38 PASS / 0 FAIL | HOLDS |
| Full npm test chain | green | green (FAIL: 0) | HOLDS |
| npm run build | green | green | HOLDS |

## Audit Gap G2 Status

- **Before Plan 09-01:** flag flip MISSING (background.js never set `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED`); restore wiring MISSING (runAgentLoop never invoked deserialize/resume); adapter never constructed in production code paths.
- **After Plan 09-01:** flag flip SHIPPED (default-on at SW boot); restore wiring SHIPPED (deserialize + resume + ResumePolicy log at runAgentLoop entry); adapter constructed at runAgentLoop entry and stashed on session._latticeAdapter for downstream sidecar reuse. Marker write sites + serialize sidecars + LRU enforcement pending Plan 09-02.
- **Plan 09-03:** flips the audit row in `.planning/v0.10.0-MILESTONE-AUDIT.md` G2 `documented_carryforward_low` -> `closed_in_phase_9` after Plan 09-02 fills the in-flight write sites.

## INV-04 Byte-Freeze Verification

- `grep -c "setTimeout" extension/ai/agent-loop.js` returns **8** (unchanged from Phase 8 baseline).
- `grep -c "session._nextIterationTimer = setTimeout" extension/ai/agent-loop.js` returns **4** (iterator pattern intact).
- Plan 09-01 modifications are at line ~1099 (helper) and line ~1218 (restore block before kickoff at line ~1244). Neither location is inside any setTimeout lambda body. The 4 iterator setTimeout callsites at agent-loop.js:1881 + 2498 + 2567 + 2577 (pre-Phase-9 line numbers) shift modestly upward due to the +49-line insertion above them but remain byte-identical in iterator pattern shape.

## INV-06 Lattice SHA Verification

- `cd lattice && git rev-parse HEAD` returns **e95067bfa87ed1b75838fc3b3ef217a3b01acbd3** (Phase 5 SHA; zero Lattice-side commits in Phase 9 per RESEARCH Section 2 SurvivabilityAdapter<TState> polymorphic finding).

## Adapter Stash Handoff to Plan 09-02

The single adapter instance constructed at runAgentLoop entry is stashed on `session._latticeAdapter`. Plan 09-02's 2 in-flight persist sidecars at `extension/ai/agent-loop.js:1840` (end_turn terminal tail) and `extension/ai/agent-loop.js:2474` (post-iteration normal tail) MUST consume this instance via `session._latticeAdapter.serialize(session)` rather than calling `globalThis.FsbLatticeRuntimeAdapter.createFsbLatticeRuntimeAdapter({sessionId})` per sidecar.

Plan 09-02 sidecar pattern:
```js
await persist(sessionId, session);
if (typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== 'undefined'
    && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED
    && session._latticeAdapter
    && typeof session._latticeAdapter.serialize === 'function') {
  try {
    session._latticeAdapter.serialize(session);
  } catch (_e) { /* fire-and-forget per D-02 */ }
}
```

## scripts.test Chain Delta

- No package.json scripts.test changes in Plan 09-01 (Part 6 lives inside the existing Phase 5 lattice-survivability-smoke.test.js; no new test file).
- Phase 8 final entry preserved: `node tests/lattice-step-emitter-smoke.test.js`.

## User Setup Required

None -- no external service configuration; no env vars; no manual UAT for Plan 09-01. Phase 9 UAT-09 is deferred to the consolidated end-of-milestone UAT alongside UAT-08 + UAT-10 per CONTEXT.md D-07 + user 2026-05-31 directive ("skip UAT to last").

## Next Plan Readiness

- **Plan 09-02 (next):** ready to consume `session._latticeAdapter` at the 2 in-flight persist callsites + write 3 marker writes (`BEFORE_API_REQUEST` before bridge call ~1820-1830 area; `BEFORE_TOOL_EXECUTION` at line 1973 just before Phase 8 TOOL_DISPATCH emission at 1974; `BEFORE_NEXT_ITERATION_SCHEDULE` at line 2497 just before setTimeout at 2498) + LRU enforcement in `lattice-runtime-adapter.js:persistInternal`. The line numbers cited above are pre-Phase-9; Plan 09-02 verifies post-Plan-09-01 absolute lines via content-based discovery per RESEARCH Section 4.
- **Blockers:** None. INV-04 / INV-06 byte-frozen confirmed.
- **Concerns:** Plan 09-02 marker writes MUST live OUTSIDE setTimeout lambdas (set the marker BEFORE the setTimeout schedule, never inside the callback body). The Plan 09-02 awk-scan regression test from RESEARCH Section 3 enforces this at smoke time.

## Self-Check: PASSED

- `extension/background.js` contains `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true` (verified via grep).
- `extension/ai/agent-loop.js` contains `_findLatestSnapshot` (2 occurrences: definition + restore-block call) (verified via grep).
- `extension/ai/agent-loop.js` contains `session._latticeAdapter = adapter` (1 occurrence) (verified via grep).
- `extension/ai/agent-loop.js` contains zero `SAFE_REPLAY` literal (verified via grep).
- `tests/lattice-survivability-smoke.test.js` Part 6 scaffold present with 9 PASS (verified via node run; smoke total 49 PASS / 0 FAIL).
- Commits exist: `3117bd50` (Task 1), `80bb9dea` (Task 2) (verified via `git log --oneline`).
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8; `grep -c "session._nextIterationTimer = setTimeout"` returns 4.
- INV-06: `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (unchanged).
- Full `npm test` chain green (each sub-summary "FAIL: 0"; chain end shows Phase 8 emitter smoke 38 PASS / 0 FAIL preserved).
- `npm run build` green (esbuild emits all 3 dist entries).

---
*Phase: 09-fsb-survivabilityadapter-activated-for-mv3-sw-eviction-resum*
*Plan: 01*
*Completed: 2026-05-31*
