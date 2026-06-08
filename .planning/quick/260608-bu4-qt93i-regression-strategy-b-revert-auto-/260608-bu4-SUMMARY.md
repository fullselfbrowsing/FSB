---
phase: 260608-bu4
plan: 01
subsystem: extension/sidepanel + extension/background + tests
tags:
  - qt93i-regression
  - strategy-b
  - tab-scoping
  - per-tab-map
  - chrome-sidepanel-api-limitation
dependency_graph:
  requires:
    - 8bb40a9b (chrome.action.onClicked safe-gesture; chrome.tabs.onActivated listener -- partially REVERTED)
    - 19b031cc (per-tab _tabRunningMap + setters with tabId arg -- preserved)
    - cf9eea5b (request.conversationId completion routing -- preserved)
    - 779bbae2 (panel-visibility per-tab decision -- amended)
  provides:
    - chrome.tabs.onActivated listener REMOVED from background.js (Strategy B)
    - _resolveTabIdForSession(sessionId) helper in sidepanel.js for session->tabId routing
    - 8 leaky setter call sites now thread explicit tabId (no more default-to-active-tab corruption)
    - regression-catching test sidepanel-progress-tick-setter-routing.test.js (drives real handler body)
    - CONTEXT D-01 amendment documenting chrome.sidePanel.setOptions enabled:false API limitation
  affects:
    - extension/background.js (1 file, 43-line block removed)
    - extension/ui/sidepanel.js (1 file, helper added + 8 sites updated)
    - tests/sidepanel-tab-scoping-fix-redo-smoke.test.js (Part 1 replaced with Strategy B comment + defensive assert)
    - tests/sidepanel-progress-tick-setter-routing.test.js (NEW)
    - package.json (scripts.test extended with new test)
    - .planning/quick/260608-7bi-.../260608-7bi-CONTEXT.md (D-01 appended)
tech_stack:
  added: []
  patterns:
    - "Brace-walking source extractor + sandboxed Function eval for real-runtime test discipline"
    - "Backward-scan from unique downstream anchor (switch (request.action)) to locate target addListener when multiple homonymous listeners exist"
    - "_resolveTabIdForSession scans _tabRunningMap entries to map sessionId -> owning tabId, with _activeTabIdSnapshot defensive fallback"
key_files:
  created:
    - tests/sidepanel-progress-tick-setter-routing.test.js
  modified:
    - extension/background.js
    - extension/ui/sidepanel.js
    - tests/sidepanel-tab-scoping-fix-redo-smoke.test.js
    - package.json
    - .planning/quick/260608-7bi-fix-two-tab-scoping-issues-in-fsb-sidepa/260608-7bi-CONTEXT.md
decisions:
  - "Strategy B (revert auto-collapse listener) chosen over Strategy A (remove manifest default_path). Smaller surface, preserves Chrome MV3 user-gesture behavior for chrome.action.onClicked, matches actual Chrome API behavior. Per-tab CONTENT scoping (swapToTabConversation + _tabRunningMap) delivers the user-visible per-tab behavior; the panel stays visible on every tab but its content reflects the active tab's conversation."
  - "_resolveTabIdForSession placed immediately after _syncModuleScopeFromActiveTab to co-locate per-tab helpers. One-line JSDoc only -- no over-engineering. Defensive fallback to _activeTabIdSnapshot so callers always get a valid number."
  - "Smoke test Part 1 updated via Option A (delete + Strategy B comment + defensive assertion that the listener stays REMOVED). Option B (inverted assertion) was rejected because a future unrelated chrome.tabs.onActivated listener for a different reason would trip it incorrectly."
  - "New test uses BACKWARD anchor scan: locate 'switch (request.action)' first, then lastIndexOf the chrome.runtime.onMessage.addListener anchor BEFORE that switch position. sidepanel.js has 3 chrome.runtime.onMessage.addListener calls (analytics, bus relay, big switch); naive forward-extract would return the wrong one."
metrics:
  duration: "~50 minutes (single executor session)"
  completed: 2026-06-08T13:52:45Z
  tasks_completed: 4
  files_touched: 6
  commits: 3
requirements:
  - QT-93i-regression-A
  - QT-93i-regression-B
  - QT-93i-regression-C
---

# Quick Task 260608-bu4: QT-93i Regression Closure (Strategy B) Summary

QT-93i-regression closed via Strategy B from the debug session: revert the
chrome.tabs.onActivated auto-collapse listener (Chrome API limitation: setOptions
enabled:false does NOT hide the panel when manifest declares default_path), and
thread tabId through the 8 leaky setter sites in sidepanel.js that were defaulting
to _activeTabIdSnapshot and corrupting the per-tab map under cross-tab traffic.

## Files Touched (6)

| File | Change |
| ---- | ------ |
| `extension/background.js` | Removed 43-line chrome.tabs.onActivated.addListener block (lines 13081-13122 pre-edit); kept chrome.action.onClicked safe-gesture pattern from 8bb40a9b |
| `extension/ui/sidepanel.js` | Added `_resolveTabIdForSession(sessionId)` helper; threaded tabId through 8 setter sites (1268, 1274, 1310, 1397, 2192, 2209, 2435, 3044) |
| `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js` | Part 1 replaced with Strategy B comment block + defensive assertion that the listener stays REMOVED (Parts 2-4 unchanged) |
| `tests/sidepanel-progress-tick-setter-routing.test.js` | NEW: drives real chrome.runtime.onMessage handler body via brace-walk + new Function eval; asserts cross-tab events do NOT corrupt active-tab _tabRunningMap entry; 12 PASS / 0 FAIL |
| `package.json` | scripts.test chain appends the new test as the FINAL entry |
| `.planning/quick/260608-7bi-.../260608-7bi-CONTEXT.md` | D-01 (Multi-tab visibility) amended with API-limitation bullet citing Chrome docs + debug session |

## Commit SHAs

| Commit | Type | Description |
| ------ | ---- | ----------- |
| `09576615` | fix(260608-bu4) | revert chrome.tabs.onActivated auto-collapse listener (Strategy B) |
| `9b2d7279` | fix(260608-bu4) | thread tabId through 8 leaky setter sites + add _resolveTabIdForSession helper |
| `2128e27a` | test(260608-bu4) | add progress-tick setter-routing regression test + update tab-scoping smoke + amend 7bi CONTEXT D-01 |

## QT-93i-regression Markers in Code (for future grep)

- `extension/ui/sidepanel.js`: comment header on `_resolveTabIdForSession` -- `QT-93i-regression (Strategy B) -- resolve a tabId by scanning _tabRunningMap`
- `extension/ui/sidepanel.js`: comment header inside automationError case -- `QT-93i-regression (Strategy B) -- route by originating tab`
- `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js`: Part 1 comment block -- `Strategy B (debug session qt93i-regression, 2026-06-08)`
- `tests/sidepanel-progress-tick-setter-routing.test.js`: file-level JSDoc -- `QT-93i-regression (Strategy B) -- progress-tick / completion setter routing`
- `.planning/quick/260608-7bi-.../260608-7bi-CONTEXT.md`: D-01 amendment -- `API limitation discovered in debug session qt93i-regression`

## Verification (Task 4)

All 10 regression checks PASS:

| # | Check | Result |
| - | ----- | ------ |
| 1 | `node --check extension/background.js && node --check extension/ui/sidepanel.js` | exit 0 |
| 2 | `node tests/sidepanel-progress-tick-setter-routing.test.js` | 12 PASS / 0 FAIL |
| 3 | `node tests/sidepanel-tab-scoping-fix-redo-smoke.test.js` | 22 PASS / 0 FAIL |
| 4 | `npm test` (full chain) | exit 0 |
| 5 | `grep -c setTimeout extension/ai/agent-loop.js` | 8 (INV-04 byte-frozen) |
| 6 | No-emoji audit (5 touched files) | empty (no matches) |
| 7 | `grep -c chrome.tabs.onActivated.addListener extension/background.js` | 0 |
| 8 | `grep -cE 'setIdleState\(\)|setErrorState\(\)|setRunningState\(\)' extension/ui/sidepanel.js` | 0 (all 8 sites threaded) |
| 9 | `grep -c _resolveTabIdForSession extension/ui/sidepanel.js` | 7 (declaration + 6 references) |
| 10 | `git status --porcelain` | clean (only pre-existing showcase/angular drift unrelated to this task) |

### Sibling test PASS counts (no regressions)

| Test | PASS Count | Notes |
| ---- | ---------- | ----- |
| `tests/lattice-step-emitter-smoke.test.js` (Phase 8) | 38 / 0 | Unchanged |
| `tests/sidepanel-tab-aware-smoke.test.js` (Phase 11) | 41 / 0 | Unchanged |
| `tests/sidepanel-message-log-smoke.test.js` (Phase 12) | 61 / 0 | Unchanged |
| `tests/sidepanel-mcpvisualsession-listener.test.js` (Phase 12) | 11 / 0 | Unchanged |
| `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js` (QT-93i) | 22 / 0 | Part 1 replaced with Strategy B assertion |
| `tests/sidepanel-progress-tick-setter-routing.test.js` (NEW) | 12 / 0 | NEW regression-catching test |

## Anti-regression Note

The new test `tests/sidepanel-progress-tick-setter-routing.test.js` is the
regression-catching contract: it extracts the actual chrome.runtime.onMessage
handler body from sidepanel.js (using a backward-anchor scan from the unique
`switch (request.action)` token to find the big handler among three
addListener calls), evals it in a sandboxed Function with mocked chrome.* +
DOM + injected per-tab helpers, then dispatches:

  (a) a session_A automationComplete while user is on Tab B (200) with
      session_A's per-tab entry on Tab A (100). Asserts Tab B's entry is
      NEVER corrupted to isRunning:true and Tab B's sendBtn stays enabled.
  (b) a sessionStateEvent session_ended with explicit request.tabId=100
      while Tab B has its OWN session_B running. Asserts Tab A's entry
      flips to isRunning:false but Tab B's entry is UNCHANGED -- session_B
      still running, sendBtn stays disabled on Tab B.

Any future regression that reintroduces a bare default-to-active-tab setter
call inside a session-driven path will be caught by this test BEFORE it
ships.

## Reference

- Debug session root-cause: `.planning/debug/qt93i-regression.md` (Strategy B chosen and applied).
- CONTEXT D-01 amendment: `.planning/quick/260608-7bi-.../260608-7bi-CONTEXT.md` (Multi-tab visibility decision -- API-limitation paragraph appended).
- Plan: `.planning/quick/260608-bu4-qt93i-regression-strategy-b-revert-auto-/260608-bu4-PLAN.md`.

## Deviations from Plan

None - plan executed exactly as written. All 4 tasks completed; all
must_haves verified by automated checks; npm test exits 0; no auto-fixes,
no checkpoints, no architectural changes triggered.

## User Verification Steps (manual UAT after hot-reload)

1. chrome://extensions -> reload FSB extension.
2. Open Tab A; dispatch a task (panel shows Working).
3. Switch to Tab B mid-flight. The panel STAYS visible (Chrome API limitation; this is intentional Strategy B behavior). The chat content area reflects Tab B's conversation (empty / welcome / Tab B's own history).
4. Type a message on Tab B. The send button is ENABLED (per-tab _tabRunningMap correctly records Tab A=running, Tab B=idle).
5. Dispatch a separate task on Tab B (now both Tab A and Tab B have running sessions).
6. Switch back to Tab A. The panel shows Tab A's Working state and conversation.
7. Either task completes while the user is on the other tab: the completing tab's send button reflects the correct state when the user switches back; the other tab's state is UNTOUCHED.
8. Confirm no chrome://extensions console errors.

## Self-Check: PASSED

Verified all artifacts exist on disk and all commits exist in git history:

- FOUND: extension/background.js (modified -- chrome.tabs.onActivated removed)
- FOUND: extension/ui/sidepanel.js (modified -- _resolveTabIdForSession added + 8 sites threaded)
- FOUND: tests/sidepanel-tab-scoping-fix-redo-smoke.test.js (modified -- Part 1 Strategy B)
- FOUND: tests/sidepanel-progress-tick-setter-routing.test.js (new file)
- FOUND: package.json (modified -- scripts.test extended)
- FOUND: .planning/quick/260608-7bi-fix-two-tab-scoping-issues-in-fsb-sidepa/260608-7bi-CONTEXT.md (modified -- D-01 amended)
- FOUND: commit 09576615 (Task 1: revert auto-collapse listener)
- FOUND: commit 9b2d7279 (Task 2: thread tabId + helper)
- FOUND: commit 2128e27a (Task 3: new test + smoke update + amendment)
