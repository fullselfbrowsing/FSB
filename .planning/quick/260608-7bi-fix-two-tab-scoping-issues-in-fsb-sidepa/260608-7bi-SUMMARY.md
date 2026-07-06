---
phase: 260608-7bi
plan: 01
subsystem: extension/sidepanel
tags: [tab-scoping, sidepanel, sidePanel-API, completion-routing, conversationId, QT-7bi-01, QT-7bi-02]
type: quick-task
status: complete
date_completed: 2026-06-08
requirements: [QT-7bi-01, QT-7bi-02]
dependency_graph:
  requires: []
  provides:
    - "Per-tab chrome.sidePanel.setOptions toggling via chrome.tabs.onActivated"
    - "chrome.action.onClicked force-open path that re-enables a disabled tab BEFORE chrome.sidePanel.open"
    - "_persistMessageToConversation helper: explicit-convId variant of _persistMessage for cross-tab routing"
    - "_renderCompletionDomOnly helper: visual twin of addCompletionMessage WITHOUT internal _persistMessage write-through"
    - "automationComplete handler routes by request.conversationId (no longer leaks completions into wrong tab's conv)"
    - "iteration_complete persists via conv-routed helper regardless of currentSessionId match (background-tab progress lands in originating conv)"
  affects:
    - "tests/sidepanel-message-log-smoke.test.js (Phase 12 sibling; Part 5.9 + 5.12 invariants updated for QT-7bi-02 reality)"
tech_stack:
  added: []
  patterns:
    - "chrome.sidePanel.setOptions per-tab enabled flag for panel-visibility gating"
    - "Brace-walking source extraction + sandboxed new Function() for real-runtime listener/case-body tests"
    - "Sibling helper pattern (closure-over-module-state vs explicit-arg) to isolate cross-tab routing without disturbing user-typed-message path"
key_files:
  created:
    - "tests/sidepanel-tab-scoping-fix-smoke.test.js"
  modified:
    - "extension/background.js"
    - "extension/ui/sidepanel.js"
    - "tests/sidepanel-message-log-smoke.test.js"
    - "package.json"
decisions:
  - "Per CONTEXT D-01: all working tabs stay enabled simultaneously; onActivated only mutates the activated tabId, never touches sibling working tabs."
  - "Per CONTEXT D-02: chrome.action.onClicked unconditionally re-enables the panel via setOptions(enabled:true) BEFORE chrome.sidePanel.open so a previously-collapsed tab can be force-opened with welcome state."
  - "Per CONTEXT D-03: dispatch tab wins for completion routing; automationComplete + iteration_complete persist by request.conversationId, falling back to module conversationId only when payload field is absent."
  - "Claude's discretion -- no debounce on chrome.tabs.onActivated (cadence is human; setOptions is fire-and-forget)."
  - "Claude's discretion -- no manual chrome.tabs.onRemoved cleanup (Chrome resets per-tab setOptions state when tabId destroyed; zero memory cost)."
  - "Claude's discretion -- no eager indicator-flicker clear (setOptions enabled:false collapses panel surface in one frame; residual chip text disappears with the panel)."
metrics:
  duration: ~25 min
  completed: 2026-06-08
  tasks: 3
  files: 4
  commits: 3
  test_assertions_added: 25
---

# Quick Task 260608-7bi: Tab-scoping fix in FSB sidepanel Summary

## One-liner

Two-axis tab-scoping fix for the FSB Chrome extension sidepanel: per-tab visibility toggle via `chrome.tabs.onActivated` + `chrome.sidePanel.setOptions`, and completion-routing leak fix where `automationComplete` / `iteration_complete` now persist by `request.conversationId` instead of the module-scope `conversationId` that gets mutated on tab switch.

## What shipped

Two related sidepanel issues fixed across 4 files in 3 atomic commits:

**Issue 1 (QT-7bi-01) -- Panel visibility leaks across tabs.** The sidepanel was always enabled on every tab. Now `chrome.tabs.onActivated` toggles `chrome.sidePanel.setOptions({ tabId, enabled: <bool> })` based on whether the activated tab has an in-flight automation session (`findActiveAutomationSessionForTab(tabId)`). Working tabs get `enabled:true` + `path:'ui/sidepanel.html'`; non-working tabs get `enabled:false`. The user can force-open the panel on any idle tab by clicking the action icon: `chrome.action.onClicked` now calls `setOptions(enabled:true, path)` BEFORE `chrome.sidePanel.open` so a previously-collapsed tab is re-enabled in the same Chrome gesture window.

**Issue 2 (QT-7bi-02) -- Completion message routes to wrong tab.** When `automationComplete` fired for a session dispatched from tab A while the sidepanel currently displayed tab B's conversation, the existing `_persistMessage` (which closes over the module-scope `conversationId`) would write the completion bubble into tab B's persisted log. Fix: route persistence through a new `_persistMessageToConversation(role, content, kind, convId)` sibling helper that takes an explicit `convId` from `request.conversationId` (every `fsbBroadcastAutomationLifecycle` call site in background.js already supplies it). DOM render is gated by `originatingConvId === conversationId`; otherwise the message is persisted silently and replays via the existing `hydrateChatFromConversationId` on next tab switch. Same fix applied to `sessionStateEvent` -> `iteration_complete` for mid-flight progress.

## Files touched

| File | Change |
|------|--------|
| `extension/background.js` | NEW `chrome.tabs.onActivated` listener (~30 lines, post-action.onClicked, pre-alarms.onAlarm); extended `chrome.action.onClicked` listener with setOptions-before-open block. Both ASCII-only; defensive try/catch + typeof guards (Chrome <114 graceful). |
| `extension/ui/sidepanel.js` | NEW `_persistMessageToConversation` helper (sibling of `_persistMessage`); NEW `_renderCompletionDomOnly` helper (DOM-only variant of `addCompletionMessage` that avoids the internal `_persistMessage` write-through double-write); REWROTE `case 'automationComplete':` body to derive `originatingConvId` from `request.conversationId` + gate DOM render by `isOriginatingActive`; REWROTE `case 'sessionStateEvent':` to defer the `currentSessionId` gate per-event so `iteration_complete` persistence fires for background-tab sessions while DOM `updateStatusMessage` remains correctly bound to the active session. |
| `tests/sidepanel-tab-scoping-fix-smoke.test.js` | NEW real-runtime smoke (5 parts, 25 PASS assertions): brace-walk extracts listener / helper / case bodies and invokes via sandboxed `new Function()` against mocked `chrome.sidePanel`, `chrome.tabs`, `FSBSidepanelMessageLog`, `_messageLogDebouncer`, `_messageLogPendingBuffer`. Parts 1+2 cover panel-visibility (non-working tab disable, working tab enable, missing tabId early-return, sidePanel-API-absent graceful, force-open ordering). Parts 3+4+5 cover completion routing (helper buffer writes, debouncer-schedule wiring, null/empty/sidecar-absent/debouncer-absent guards, role coercion, kind defaulting, case wires `originatingConvId`, DOM gate, setIdleState always-fires, iter conv-routed, no surviving legacy `_persistMessage` call, deferred-gate marker present). |
| `tests/sidepanel-message-log-smoke.test.js` | Rule 3 carryforward fix: Part 5.9 updated to expect `_persistMessageToConversation(..., iterConvId)` (QT-7bi-02 replaces the legacy `_persistMessage('assistant', 'Step ' + ...)` call). Part 5.12 regex widened to `[\s\S]*?case 'error_occurred':` so the greedy match captures past the new inline `if (request.sessionId !== currentSessionId) break;` gate in `case 'tool_executed':`. |
| `package.json` | One-line `scripts.test` chain extension: appended `&& node tests/sidepanel-tab-scoping-fix-smoke.test.js` as the FINAL entry (after `sidepanel-mcpvisualsession-listener.test.js`). |

## Commits

| # | Hash | Title |
|---|------|-------|
| 1 | `779bbae2` | `feat(7bi): per-tab sidepanel visibility via chrome.tabs.onActivated + force-open` |
| 2 | `cf9eea5b` | `fix(7bi): route automationComplete + iteration_complete via request.conversationId` |
| 3 | `76fc0160` | `test(7bi): add tab-scoping fix smoke + update Phase 12 sibling for QT-7bi-02` |

## In-code markers (for future grep)

- `QT-7bi-01` -- panel-visibility per-tab + force-open with welcome state (background.js -- 2 sites).
- `QT-7bi-02` -- completion-routing fix (sidepanel.js -- 6 sites: helper, case body, render helper, iteration_complete persist, deferred-gate comment, plus inline rationale comments).

## Verification

| Check | Result |
|-------|--------|
| `node --check extension/background.js` | exit 0 (PARSE OK) |
| `node --check extension/ui/sidepanel.js` | exit 0 (PARSE OK) |
| `node tests/sidepanel-tab-scoping-fix-smoke.test.js` standalone | 25 PASS / 0 FAIL |
| `npm test` full chain | exit 0 (green; sibling Phase 8 38 PASS, Phase 11 + Phase 12 still pass; sidepanel-message-log-smoke now reads 61 PASS / 0 FAIL after sibling-invariant update) |
| `grep -c "setTimeout" extension/ai/agent-loop.js` | 8 (INV-04 byte-freeze preserved -- task did not modify agent-loop.js) |
| Emoji scan (Node Unicode regex against modified files) | PASS (no emojis anywhere) |
| Git status modified-file count | 4 functional files + 1 new test file (matches plan output spec) |

## Deviations from Plan

### Rule 3 -- Auto-fix blocking issue (sibling-test invariants)

**1. [Rule 3 - Test Invariant Carryforward] Updated sidepanel-message-log-smoke.test.js Parts 5.9 + 5.12 for QT-7bi-02 reality.**

- **Found during:** Task 3 verification (`npm test` chain run).
- **Issue:** Part 5.9 asserted the literal string `_persistMessage('assistant', 'Step ' + request.iteration + ' complete', 'progress')` was STILL present in sidepanel.js. QT-7bi-02 replaces that exact call with `_persistMessageToConversation(..., iterConvId)` -- the replacement is enforced by Part 5.2 of our new tab-scoping smoke ("legacy _persistMessage call for iteration_complete is replaced (not duplicated)"), so the sibling's assertion is stale by design. Part 5.12 used `case 'tool_executed':[\s\S]*?break;` (non-greedy) which stopped at the new inline `if (request.sessionId !== currentSessionId) break;` early-return gate added by the deferred-gate restructure -- the match no longer reached the `addActionMessage` line.
- **Fix:** Part 5.9 assertion regex updated to `_persistMessageToConversation\('assistant', 'Step ' \+ request\.iteration \+ ' complete', 'progress', iterConvId\)`. Part 5.12 match widened to `case 'tool_executed':[\s\S]*?case 'error_occurred':` so the greedy span still captures `addActionMessage`. Inline rationale comments added in the test file pointing back to QT-7bi-02.
- **Files modified:** `tests/sidepanel-message-log-smoke.test.js` (Part 5.9 + Part 5.12 only; all other assertions untouched).
- **Commit:** `76fc0160` (combined with Task 3 -- test additions + sibling-invariant adjustment land together per the same logical unit of change).

No other deviations. Plan executed exactly as written.

## User Verification Steps

To validate the fix end-to-end after this lands:

1. **Hot-reload extension** in Chrome: `chrome://extensions/` -> click the Reload icon on FSB.
2. **Open the sidepanel on Tab A** (any HTTPS page). Dispatch a task ("scroll to bottom and click sign up" or similar).
3. **Switch to Tab B (mid-flight)** -- a different HTTPS page with no active automation. Expected: the sidepanel surface for Tab B collapses (no chat content visible; the panel may disappear from the action-icon affordance entirely on Chrome 114+).
4. **Force-open the panel on Tab B** by clicking the FSB action icon. Expected: panel opens with the empty/welcome state (new conv, no chat history from Tab A leaks in).
5. **Switch back to Tab A** before the task completes. Expected: the panel is enabled, the chat history is intact, and the still-running indicator is correct.
6. **Let Tab A's task finish while focus is on Tab B.** Expected: when you return to Tab A, the final assistant message is visible in Tab A's conversation. Conversely, Tab B's panel never receives that completion bubble (its conv stays empty).
7. **Check iter milestones across tabs:** dispatch a multi-step task on Tab A, switch to Tab B mid-flight, wait for several "Step N complete" iterations, then return to Tab A. Expected: all the missed step milestones are now visible in Tab A's chat log (replayed via `hydrateChatFromConversationId` on tab return).

## Threat Flags

None. This task is sidepanel-internal: no new network endpoints, no new auth paths, no new storage schemas, no new trust boundaries. The `chrome.sidePanel.setOptions` calls are guarded by `typeof` checks (Chrome <114 graceful degradation) and wrapped in try/catch (best-effort, no automation-blocking failure path).

## Self-Check: PASSED

- `extension/background.js` -- FOUND, chrome.tabs.onActivated listener + force-open block both present (grep verified).
- `extension/ui/sidepanel.js` -- FOUND, `_persistMessageToConversation` + `_renderCompletionDomOnly` helpers + rewritten case bodies all present.
- `tests/sidepanel-tab-scoping-fix-smoke.test.js` -- FOUND (new file).
- `tests/sidepanel-message-log-smoke.test.js` -- FOUND, Part 5.9 + 5.12 assertions updated.
- `package.json` -- FOUND, new smoke registered as final entry in scripts.test.
- Commits `779bbae2`, `cf9eea5b`, `76fc0160` -- all present in `git log --oneline`.
- `npm test` exit code: 0 (verified).
