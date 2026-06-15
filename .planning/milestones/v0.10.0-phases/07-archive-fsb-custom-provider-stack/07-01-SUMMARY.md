---
phase: 07-archive-fsb-custom-provider-stack
plan: 01
subsystem: integration
tags: [lattice, feature-flag, provider-bridge, mv3, fsb-engine]

# Dependency graph
requires:
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    provides: feature-flag-gated bridge wiring (FSB_LATTICE_PROVIDER_BRIDGE_ENABLED) and lattice-provider-bridge.js shim
provides:
  - unconditional Lattice provider bridge call path in callProviderWithTools
  - removal of FSB_LATTICE_PROVIDER_BRIDGE_ENABLED feature flag from production code
  - removal of legacy providerInstance.sendRequest fallback in agent-loop.js
  - Phase 7-aware narrative on bridge JSDoc + boot log
  - bridge-envelope-aware regression test for issue #29 (Gemini/Anthropic/xAI empty-contents seeding)
affects: [07-02 documentation ceremony, 07-03 UAT-1 procedure, v0.11.0+ physical archive carryforward]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Strategy B archive (semantic archive via flag removal; physical archive deferred)
    - Test mocks chrome.runtime.sendMessage to intercept lattice-provider-execute envelope

key-files:
  created: []
  modified:
    - extension/ai/agent-loop.js
    - extension/ai/lattice-provider-bridge.js
    - tests/lattice-provider-bridge-smoke.test.js
    - tests/agent-loop-empty-contents.test.js

key-decisions:
  - "Comment text inside agent-loop.js cannot mention the flag literal (smoke asserts ZERO token occurrences). Reworded comment to refer to 'feature flag' generically."
  - "Regression test must require lattice-provider-bridge.js BEFORE agent-loop.js so executeViaBridge is installed on globalThis."

patterns-established:
  - "Pattern: Flag-removal phase reuses prior smoke assertions inverted to expect zero (line + token counts both must drop to 0)."
  - "Pattern: Bridge-aware regression tests intercept chrome.runtime.sendMessage envelopes instead of stubbing legacy provider HTTP-send."

requirements-completed: [FINT-09]

# Metrics
duration: ~14min
completed: 2026-05-28
---

# Phase 7 Plan 07-01: Strip FSB_LATTICE_PROVIDER_BRIDGE_ENABLED Flag Summary

**Lattice provider bridge is now the unconditional provider call path in callProviderWithTools; the feature flag and legacy providerInstance.sendRequest fallback are deleted; npm test stays 85+8 green.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-28T04:21:53Z (approx)
- **Completed:** 2026-05-28T04:35:27Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Removed the Phase 6 feature flag wrapper and legacy fallback from `extension/ai/agent-loop.js` callProviderWithTools tail. Bridge call is now unconditional.
- Updated `extension/ai/lattice-provider-bridge.js` JSDoc + boot log to Phase 7 (FINT-09) past-tense narrative; no flag identifier remains in the bridge source.
- Updated `tests/lattice-provider-bridge-smoke.test.js` Part 3 + 5 to expect zero flag references and zero legacy-fallback references; INV-04 setTimeout count assertion stays === 8.
- Rewrote `tests/agent-loop-empty-contents.test.js` to mock `chrome.runtime.sendMessage`, capture the `lattice-provider-execute` envelope's `requestBody`, and assert on the captured body. All 4 sub-tests (Gemini empty/ongoing + Anthropic empty + xAI empty) green: 8/0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Strip flag wrapper + legacy fallback from agent-loop.js** -- `8d075fb9` (refactor)
2. **Task 2: Strip flag references from lattice-provider-bridge.js JSDoc + boot log** -- `5588d20f` (refactor)
3. **Task 3: Update smoke assertions + rewrite empty-contents regression test** -- `5ad8f987` (test)

## Files Created/Modified
- `extension/ai/agent-loop.js` -- callProviderWithTools tail rewritten: flag wrapper deleted, legacy `providerInstance.sendRequest(requestBody)` deleted, bridge call (`executeViaBridge`) is now unconditional. Comment block replaced with Phase 7 (FINT-09) narrative; WR-03 baseUrl narrative preserved verbatim.
- `extension/ai/lattice-provider-bridge.js` -- JSDoc lines 17-18 + boot log line 167 updated to Phase 7-aware text; zero flag identifier remains.
- `tests/lattice-provider-bridge-smoke.test.js` -- Part 3 + 5 flag/fallback assertions updated to expect zero with Phase 7 FINT-09 message tags; INV-04 setTimeout count assertion stays === 8.
- `tests/agent-loop-empty-contents.test.js` -- fully rewritten: mocks chrome.runtime.sendMessage, captures `lattice-provider-execute` envelope `requestBody`, asserts on captured body instead of legacy provider stub. Requires lattice-provider-bridge.js before agent-loop.js so executeViaBridge is registered on globalThis.

## Verification Evidence

### Line-count delta on agent-loop.js
```
$ git diff HEAD~3 HEAD --stat -- extension/ai/agent-loop.js
 extension/ai/agent-loop.js | 32 ++++++++++++++++----------------
 1 file changed, 16 insertions(+), 16 deletions(-)
```
Net delta: **0 lines** (16 insertions, 16 deletions). The 5-line wrapper + fallback deletion was offset by an equivalent expansion of the Phase 7 narrative comment block. File total line count stays at 2564.

### setTimeout iterator absolute line numbers (post-Phase 7)
INV-04 baseline: 4 iterator hits, count = 8 total setTimeout occurrences. Positions UNCHANGED from Phase 6 end:
- Iterator 1: line 1864 (was 1864 at Phase 6 end)
- Iterator 2: line 2462 (was 2462)
- Iterator 3: line 2531 (was 2531)
- Iterator 4: line 2541 (was 2541)

The other 4 setTimeout matches are in comments (lines 5, 1237) and the sleep helper (line 1395). All preserved.

Wave 2 LATTICE-PIN narrative can cite these as "unchanged from Phase 6 end."

### Grep audit
```
$ grep -rn "FSB_LATTICE_PROVIDER_BRIDGE_ENABLED" extension/ | wc -l
0
$ grep -rn "FSB_LATTICE_PROVIDER_BRIDGE_ENABLED" tests/ | wc -l
4    # all inside smoke test assertions that verify flag is gone (regex literal + assertion message)
$ grep -c "executeViaBridge(" extension/ai/agent-loop.js
1    # single unconditional call site
$ grep -c "providerInstance\.sendRequest" extension/ai/agent-loop.js
0    # legacy fallback deleted
$ grep -c "setTimeout" extension/ai/agent-loop.js
8    # INV-04 preserved
$ grep -c "_UniversalProvider" extension/ai/agent-loop.js
2    # baseline preserved (var at line 102 + new at line 1183 -- both byte-frozen)
$ grep -c "providerInstance\.getEndpoint" extension/ai/agent-loop.js
2    # baseline preserved (line 1212 logging + JSDoc reference)
$ grep -c "Phase 7" extension/ai/lattice-provider-bridge.js
3    # JSDoc + boot log + a comment reference
$ grep -c "crypto.randomUUID" extension/ai/lattice-provider-bridge.js
3    # bridge body preserved
```

### Strategy B intact
```
$ test -f extension/ai/universal-provider.js && echo "OK universal-provider.js stays"
OK universal-provider.js stays
$ test ! -d extension/_archive && echo "OK _archive/ does not exist"
OK _archive/ does not exist
$ git status --porcelain extension/ai/universal-provider.js extension/ai/ai-providers.js extension/ui/control_panel.html extension/ui/options.js extension/background.js extension/offscreen/lattice-host.js
(empty -- all 6 files byte-frozen)
```

### Test chain
```
$ node tests/lattice-provider-bridge-smoke.test.js | tail -3
--- Summary ---
passed: 85
failed: 0

$ node tests/agent-loop-empty-contents.test.js | tail -3
--- Summary ---
  Passed: 8
  Failed: 0

$ npm test ; echo $?
... (29 + 39 + 72 + 47 + 40 + 85 = 312 PASS across all 6 chained tests) + 8 PASS empty-contents test
0
```

Smoke PASS count delta from Phase 6 end: **85 -> 85** (semantic of 4 assertions changed from "expect 1/2/1/8" to "expect 0/0/0/8" but the count stays 5 assertions in that block; tests stay green).

### Syntax validation
```
$ node --check extension/ai/agent-loop.js && echo SYNTAX OK
SYNTAX OK
$ node --check extension/ai/lattice-provider-bridge.js && echo SYNTAX OK
SYNTAX OK
```

## Decisions Made
- **Comment cannot mention flag literal.** The smoke test asserts `agent-loop.js` has ZERO token occurrences of `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED`. The first draft Phase 7 narrative comment mentioned the flag by name "the Phase 6 feature flag FSB_LATTICE_PROVIDER_BRIDGE_ENABLED is removed", which caused the assertion to fail (1 occurrence remaining). Reworded to refer to "the Phase 6 feature flag" generically. Spec line 36 ("Strip the flag from agent-loop.js -- 4 references") implies the literal must be gone everywhere including comments.
- **Regression test must require bridge first.** `extension/ai/agent-loop.js` resolves `executeViaBridge` only as a global (no Node require fallback for it inside agent-loop.js). In the Node test context, requiring `lattice-provider-bridge.js` BEFORE `agent-loop.js` runs the bridge IIFE which installs `executeViaBridge` onto `globalThis`. This was added as a single `require` line in the test setup (not as a deviation — it was the obvious test-harness consequence of removing the flag).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded flag-referencing comment in agent-loop.js**
- **Found during:** Task 1 verification (the regression test that runs the smoke also runs as part of Task 3)
- **Issue:** First draft of the Phase 7 narrative comment block mentioned the literal flag identifier `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` inside the comment, which caused `grep -c FSB_LATTICE_PROVIDER_BRIDGE_ENABLED extension/ai/agent-loop.js` to return 1 instead of 0. This would have made Task 3's smoke assertion fail.
- **Fix:** Reworded comment to refer to "the Phase 6 feature flag" without the identifier. The semantic narrative (flag removed, fallback deleted, Strategy B file preservation) stays intact.
- **Files modified:** `extension/ai/agent-loop.js` (comment text only).
- **Verification:** `grep -c FSB_LATTICE_PROVIDER_BRIDGE_ENABLED extension/ai/agent-loop.js` returns 0.
- **Committed in:** `8d075fb9` (Task 1 commit -- caught + fixed pre-commit).

**2. [Rule 3 - Blocking] Added bridge require to regression test setup**
- **Found during:** Task 3 (running `node tests/agent-loop-empty-contents.test.js` first time)
- **Issue:** First run threw `ReferenceError: executeViaBridge is not defined` because the Node test required `agent-loop.js` directly without first loading `lattice-provider-bridge.js`, so the bridge IIFE never ran and `executeViaBridge` was never installed on `globalThis`.
- **Fix:** Added `require('../extension/ai/lattice-provider-bridge.js');` before `require('../extension/ai/agent-loop.js');` in the test file. The bridge IIFE installs `globalScope.executeViaBridge = executeViaBridge` so the SW-side global resolution works.
- **Files modified:** `tests/agent-loop-empty-contents.test.js`.
- **Verification:** Test exits 0 with 8/0 PASS/FAIL.
- **Committed in:** `5ad8f987` (Task 3 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 3 -- Blocking)
**Impact on plan:** Both auto-fixes are mechanical test-harness corrections required by the flag removal itself. No scope creep, no production behavior change beyond the explicit Phase 7 scope.

## Issues Encountered
- None beyond the 2 deviations above (which were caught + fixed during execution).

## User Setup Required
None - no external service configuration required. Wave 3 (Plan 07-03 UAT-1) will require user to load the extension in Chrome and capture boot logs, but that is the milestone UAT, not Plan 07-01 scope.

## Wave 1 -> Wave 2 Handoff

Plan 07-02 (documentation ceremony) needs these concrete production-code commit SHAs:

| Task | Description | Commit SHA |
|------|-------------|------------|
| 1 | Strip flag wrapper + legacy fallback from agent-loop.js | `8d075fb9` |
| 2 | Strip flag references from lattice-provider-bridge.js JSDoc + boot log | `5588d20f` |
| 3 | Update smoke + rewrite empty-contents test | `5ad8f987` |

Plan 07-02 should reference these SHAs in:
- LATTICE-PIN.md Phase 7 row (FSB-side commits column)
- REQUIREMENTS.md FINT-09 traceability row (proof artifact)
- INV-03 wording update in REQUIREMENTS.md (Phase 7 end-state assertion)

## Next Phase Readiness
- Plan 07-01 deliverable complete: flag removed from production code, legacy fallback deleted, bridge unconditional, npm test green.
- Wave 2 (Plan 07-02 documentation ceremony) unblocked.
- Wave 3 (Plan 07-03 UAT-1 procedure generation + user execution) unblocked.
- Strategy B intact: `extension/ai/universal-provider.js` stays on disk; `extension/_archive/` does not exist; physical archive deferred to v0.11.0+.

## Self-Check: PASSED

- `extension/ai/agent-loop.js` modified -- FOUND
- `extension/ai/lattice-provider-bridge.js` modified -- FOUND
- `tests/lattice-provider-bridge-smoke.test.js` modified -- FOUND
- `tests/agent-loop-empty-contents.test.js` modified -- FOUND
- Commit `8d075fb9` -- FOUND
- Commit `5588d20f` -- FOUND
- Commit `5ad8f987` -- FOUND
- `grep "FSB_LATTICE_PROVIDER_BRIDGE_ENABLED" extension/` returns 0 -- VERIFIED
- `npm test` exits 0 -- VERIFIED

---
*Phase: 07-archive-fsb-custom-provider-stack*
*Completed: 2026-05-28*
