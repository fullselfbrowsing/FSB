---
phase: 10-mcp-philosophy-parity-for-autopilot-driver-visual-session-li
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - extension/utils/mcp-visual-session.js
  - extension/utils/mcp-visual-session-lifecycle.js
  - extension/utils/mcp-metrics-recorder.js
  - extension/ai/agent-loop.js
  - tests/mcp-philosophy-parity-smoke.test.js
  - package.json
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

Phase 10 wires autopilot driver attribution into the v0.9.62 sliding-window visual-session lifecycle and the Phase 271 MCP metrics recorder. The high-leverage areas all hold:

- **INV-04 byte-freeze (CRITICAL):** `extension/ai/agent-loop.js` setTimeout count = 8 (confirmed at lines 1450, 1955, 2654, 2723, 2733 + 3 comment/JSDoc references). The iterator pattern `session._nextIterationTimer = setTimeout(function() { runAgentIteration(...) }, N)` appears exactly 4 times (lines 1955, 2654, 2723, 2733). Both Phase 10 emission sites live INSIDE the main `for (ci...)` tool-call loop body, NOT inside any setTimeout lambda: `recordVisualSessionTick` at line 2076 (between the Phase 8 lattice step.transition emit and the local-tool interception block) and `recordDispatch` at line 2405 (after `toolResults.push`). Visual-inspection cross-checked with Part 9.3/9.4 of the new test, which does an awk-scan of the source.
- **Allowlist key uniqueness:** `'FSB Autopilot'` -> `toClientLabelKey` -> `'fsbautopilot'`. No collision with the existing 13 entries (closest candidates: `'openclaw'`, `'openclaw🦀'`).
- **drivingModel attribution correctness:** provider read from `session.providerConfig.providerKey` (line 2398); model read from `session.providerConfig.model` (line 2399) -- the field is `.model` throughout agent-loop.js (canonical declaration at line 1717, `var model = session.providerConfig.model;`); the focus-area note "`modelName`" was descriptive shorthand for the same field. xAI reasoning_tokens extracted only when `_phase10ProviderKey === 'xai'` AND `response.usage.completion_tokens_details` exists; non-xAI leaves the field `undefined`; the assignment is direct so `0` is preserved (no truthy coercion).
- **Pitfall 3 (response variable scope):** `var response` declared at line 1752 and assigned at line 1761 inside the same try-block (`try {` at line 1714) that wraps the recordDispatch insertion at line 2405. `var` hoisting puts the binding in scope throughout the function; the defensive `typeof response !== 'undefined'` guard (line 2401) covers the path where the API call threw before assignment.
- **Backward compat for lifecycle entries:** `recordVisualSessionTick` (lifecycle.js lines 357-389) preserves `existingEntry.driver` when present and defaults absent entries to `'autopilot'` only when the caller passes `fields.driver === 'autopilot'`, else `'mcp'`. The agent_mismatch gate (line 343) prevents a stale-driver-mismatch corner case from mutating cross-driver. The restore path at lines 564-628 never reads the `driver` field, so pre-Phase-10 entries pass through restore untouched and the field stays absent for downstream consumers that don't yet know about it.
- **PII safety on drivingModel:** the new field carries `provider` (provider key string), `model_id` (public model name), and optional `reasoning_tokens` (integer). None are secrets; none match the recorder's no-PII grep allowlist forbidden identifiers (bodies, DOM, hrefs, innerHTML, clipboard, cookie headers, Authorization headers, `.value` properties). The static-grep gate at `tests/mcp-metrics-no-pii-leak.test.js` is therefore expected to pass.
- **Defensive guards:** both emission sites wrap in `if (typeof X === 'function')` plus try/catch with comment `swallow - fire-and-forget`. Recorder bug cannot alter the dispatcher's resolved value or thrown error (whole-body try/catch at recorder line 262 + outer try/catch at agent-loop.js lines 2075 and 2397).
- **Comment hygiene:** new comments at agent-loop.js lines 2071-2072, 2392-2393, and 2647-2649 use the synonym "deferred-iterator schedule" in place of the literal `setTimeout` token, matching the convention.
- **No emojis** in any Phase 10 code, comments, or test strings. The single emoji match at `mcp-visual-session.js:14` (`'OpenClaw 🦀'`) is a pre-existing client label, NOT Phase 10 code; the new entry `'FSB Autopilot'` at line 19 is ASCII-clean.
- **dispatcher_route allowlist:** recorder lines 277-281 accept `'tool' | 'message' | 'autopilot'` as the only literals that pass through; other values coerce to `null`. MCP path behavior is unchanged.
- **INV-01 (tool-definitions parity):** confirmed untouched -- last commit affecting either file (`extension/ai/tool-definitions.js` / `mcp/ai/tool-definitions.cjs`) is `336f3a92` (Phase 255-01, pre-Phase-10). No diff in this phase.
- **package.json scripts.test chain:** `mcp-philosophy-parity-smoke.test.js` appended as the final entry of the long `&&` chain; the chain is otherwise unmodified.

## Info

### IN-01: Test file docstring contradicts test body

**File:** `tests/mcp-philosophy-parity-smoke.test.js:17`
**Issue:** The file header comment reads "ASCII only. No emojis. No literal token 'setTimeout' anywhere in this file." -- but Part 9 (lines 365-395) deliberately greps the agent-loop source for `setTimeout` to enforce INV-04 byte-freeze and therefore must contain the literal token in regex literals and assertion-message strings. The "no literal token setTimeout" promise applies to the NEW production comments in `extension/ai/agent-loop.js` (where the synonym "deferred-iterator schedule" is used), not to this test which validates the invariant.
**Fix:** Reword the header to clarify scope, e.g.:
```js
 * ASCII only. No emojis. The literal token 'setTimeout' appears only inside
 * Part 9 byte-freeze regex literals + assertion messages that grep the
 * agent-loop source; new production comments in agent-loop.js use the
 * "deferred-iterator schedule" synonym.
```

### IN-02: Focus-area description vs. code field name

**File:** N/A (review-internal observation only)
**Issue:** Focus area #7 in the review prompt refers to the model field as `session.providerConfig.modelName`, but the canonical agent-loop.js field is `session.providerConfig.model` (declared at line 1717 and read at line 2399 in the Phase 10 insertion). The code uses the correct established field name; no bug. Logged as Info so a future planner who copies the focus-area phrasing into a follow-up plan doesn't introduce a stale field reference.
**Fix:** When updating planning docs / future focus-areas, prefer `session.providerConfig.model` (the canonical declared field) to avoid drift.

---

_Reviewed: 2026-05-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
