---
phase: 08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - extension/ai/lattice-step-emitter.js
  - extension/background.js
  - extension/ai/agent-loop.js
  - tests/lattice-step-emitter-smoke.test.js
  - tests/lattice-provider-bridge-smoke.test.js
  - package.json
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 8: Code Review Report

**Reviewed:** 2026-05-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

Phase 8 (FINT-10 + FINT-11) ships a SW-side producer for the Phase 5 D-16 `lattice-step-transition` envelope and wires two emission sites into the agent iterator at LLM_TURN and TOOL_DISPATCH boundaries. All high-leverage areas verified:

- **INV-04 preservation:** `extension/ai/agent-loop.js` setTimeout count is still exactly 8. The four iterator-scheduling callsites (`session._nextIterationTimer = setTimeout(function() { runAgentIteration(...); }, N);`) at lines 1881, 2498, 2567, 2577 are byte-identical in pattern and remain single-line statements. Neither emission site (lines 1861, 1974) is inside any setTimeout lambda body. INV-04 is intact.
- **Defensive guards:** Both emission sites wrap the call in `if (typeof sendLatticeStepTransition === 'function')` AND a try/catch — double-defended against module-load failure or synchronous throws.
- **Dual-export idiom:** `extension/ai/lattice-step-emitter.js` correctly mirrors the Phase 5/6 pattern — IIFE-wrapped, `globalScope.sendLatticeStepTransition = ...` for MV3 SW classic scope, `module.exports = { ... }` for Node CJS, fallback chain `globalThis -> self -> this`.
- **Fire-and-forget contract:** No `await`, no return-value plumbing in caller, chrome.runtime.sendMessage wrapped in try/catch, returned Promise allowed to dangle per D-03.
- **No PII / wire-shape freeze:** Envelope payload contains only `runId`, `sessionId`, `stepName`, `stepIndex`, `timestamp`, optional `previousStepName` — zero providerKey/model/reasoning_tokens leakage. Phase 5 D-16 byte-frozen shape preserved for Phase 10 extension headroom.
- **Smoke test integrity:** 38 PASS / 0 FAIL; Parts 1, 2, 3.4, 3.5, 4.1-4.5, 5 exercise the module via real load + invoke against a mocked `chrome.runtime.sendMessage`.
- **No emojis** in any new file or test.
- **importScripts ordering:** background.js line 13 inserts `ai/lattice-step-emitter.js` between `ai/lattice-provider-bridge.js` (line 12) and `ai/ai-integration.js` (line 14) — adjacency-relaxed-to-2 invariant in the bridge smoke test (`tests/lattice-provider-bridge-smoke.test.js:550`) correctly accommodates the new entry.

No critical or warning-level issues found. Three advisory info items below.

## Info

### IN-01: Hybrid smoke-test strategy mixes real-runtime and source-grep assertions

**File:** `tests/lattice-step-emitter-smoke.test.js:155-167, 246-249, 300-355`
**Category:** test_quality
**Issue:** Parts 1, 2, 3.4, 3.5, 4.1-4.5, and 5 exercise the emitter module via real load + invoke (the MEMORY-recommended `real_runtime_tests_not_static_text` discipline). However, Parts 3.1-3.3, 4.6, 6.1-6.8 fall back to source-text regex grep against `extension/ai/agent-loop.js`, `background.js`, `package.json`, and `LATTICE-PIN.md`.

The static-grep assertions here are legitimately *invariant regression sentinels* (setTimeout count = 8, iterator pattern occurs 4x, no token inside lambda, importScripts count, lattice SHA pin) — not behavioral assertions about whether the emitter works. So the hybrid is defensible, but the test file's docstring (`// Real-runtime test discipline per CLAUDE.md MEMORY`) over-claims since ~13 of 38 assertions are static.

**Fix:** Add a comment block above Part 6 explaining the INV-regression-sentinel intent so future reviewers don't re-litigate the discipline. Defer if not blocking.

### IN-02: Awk-scan in Part 6.3 (Pitfall 1 guardrail) uses a permissive multi-line close pattern

**File:** `tests/lattice-step-emitter-smoke.test.js:310-321`
**Category:** test_quality
**Issue:** Part 6.3 walks lines and sets `insideLambda = true` on `setTimeout(function`, then resets it only on `/\},\s*\d+\s*\)/`. Works correctly today because all four iterator callsites are single-line. If a future refactor names the delay (`}, _delay);`), the regex `\d+` will NOT match and `insideLambda` will stay true indefinitely, masking real violations downstream.

**Fix:** Tighten close detection to also accept identifier-suffixed close: `/\},\s*[\w\d]+\s*\)/`. Low priority — no current callsite uses a variable delay.

### IN-03: Sentinel pass-count floor (`pass < 25`) is below the actual 38 PASS test surface

**File:** `tests/lattice-step-emitter-smoke.test.js:364`
**Category:** test_quality
**Issue:** The exit-code guard `if (pass < 25)` is 13 short of the actual 38 PASSes. If someone silently deletes Parts 4-6 entirely, the test will still report PASS as long as Parts 1-3 succeed (13+13 = 26 > 25). Weakens regression protection. The docstring at line 14 references `Exit 0 on PASS >= 12` which is also stale — Plan 08-02 floor mentioned in actual code at line 365 says 25 but Plan 08-03 ships 38 PASSes.

**Fix:** Update floor to `pass < 38` (or `pass < 35` for one-PASS jitter tolerance), so any future test deletion fails the chain loudly.

---

_Reviewed: 2026-05-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
