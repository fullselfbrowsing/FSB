---
phase: quick-260707-7id
plan: 01
subsystem: mcp-bridge / session-history
tags: [mcp, session-recording, replay, memory, history-badges, mv3-eviction]
requires:
  - extension/ws/mcp-tool-dispatcher.js dispatch choke points (Phase 271 metrics-recorder pattern)
  - extension/utils/automation-logger.js saveSession + fsbSessionLogs/fsbSessionIndex
  - background.js extractAndStoreMemories + session-schema createSession
provides:
  - globalThis.fsbMcpSessionRecorder (extension/utils/mcp-session-recorder.js)
  - fsbSessionIndex entries with mode + mcpClient fields
  - MCP/Autopilot source badges in sidepanel + options history lists
affects:
  - extension/ws/mcp-tool-dispatcher.js (both finally blocks)
  - extension/background.js (SW load order)
  - extension/utils/automation-logger.js (NEW/APPEND/index paths)
tech-stack:
  added: []
  patterns:
    - versioned chrome.storage.session envelope (mcp-task-store.js pattern, key fsbMcpSessionBuffer v1)
    - promise-chain write lock (_withRecordLock pattern)
    - lazy-global direct calls in SW (never chrome.runtime.sendMessage in-SW)
key-files:
  created:
    - extension/utils/mcp-session-recorder.js
    - tests/mcp-session-recorder.test.js
  modified:
    - extension/ws/mcp-tool-dispatcher.js
    - extension/background.js
    - extension/utils/automation-logger.js
    - extension/ui/sidepanel.js
    - tests/lattice-provider-bridge-smoke.test.js
    - extension/ui/options.js (LEFT UNCOMMITTED -- mixed with pre-existing local edits)
    - package.json (LEFT UNCOMMITTED -- mixed with pre-existing local edits)
decisions:
  - "Optional AI title/summary synthesis SKIPPED (locked default: task seeded from first visualReason; no single-call global provider helper exists)"
  - "Single commit at Task 3 with exactly the seven clean files, per the plan's explicit commit protocol (options.js + package.json left as flagged local edits)"
  - "closeSession re-seeds one session-bound log entry when getSessionLogs(sessionId) is empty so the saveSession empty-logs gate passes on post-eviction restore closes"
metrics:
  duration: "20m 19s"
  completed: "2026-07-07T10:59:31Z"
  tests: "npm test exit 0; new suite 94 passed / 0 failed"
  commit: 721e2826
---

# Quick Task 260707-7id: Record MCP Agent Sessions into Logs/History/Replay/Memory Summary

**One-liner:** MCP-agent browsing sessions (sidecar action calls through is_final or 60s idle) now land in fsbSessionLogs/fsbSessionIndex with mode 'mcp-agent', replay-shape actionHistory, and memory extraction via a dispatcher-choke-point sibling recorder that survives MV3 SW eviction through a versioned fsbMcpSessionBuffer envelope.

## What Was Built

1. **extension/utils/mcp-session-recorder.js** (new, 697 lines) -- IIFE classic script, lazy `globalThis.chrome`, registers `globalThis.fsbMcpSessionRecorder` plus a CommonJS mirror. Sessions keyed `agentId::tabId`; birth on first `visualSession` sidecar action (autopilot-format `session_<ms>` id with same-ms monotonic guard, task from first `visualReason`, `logSessionStart` seeds the saveSession log gate); sidecar-less calls JOIN the agent's most recently active session (unknown agentId ignored -- structurally enforces the >=1-action gate); `run_task` skipped entirely; close on `isFinal`/`is_final` or the 60s sliding idle window (own injectable timer + lazy sweep, mirroring mcp-visual-session-lifecycle semantics). Close builds the session via lazy `createSession` (manual same-keys object under Node) with `mode: 'mcp-agent'` + `mcpClient`, then calls `automationLogger.saveSession` and `extractAndStoreMemories` through DIRECT globals (never in-SW sendMessage), both fire-and-forget. Key-targeted redaction (`pass(word)?|secret|token|credential|api[-_]?key|authorization`) via lazy `redactForLog` (literal `[REDACTED]` fallback); url/selector/text persist raw for replay. Open sessions persist to `chrome.storage.session.fsbMcpSessionBuffer` `{v:1, records}` (canonical-empty on mismatch, key removed when empty); module-load restore closes expired sessions and re-arms live ones.

2. **Dispatcher hooks** -- separate sibling try/catch blocks AFTER the metrics recorder blocks in BOTH finally blocks of `dispatchMcpToolRoute` (`dispatcher_route: 'tool'`) and `dispatchMcpMessageRoute` (`dispatcher_route: 'message'`, INSIDE the `!_mcpMetricsSuppressInner` gate so alias-routed tools record once). Both use `client: resolveMcpClientLabel(payload)`, not awaited, no return-in-finally. Test 9's fsbMcpMetricsRecorder regex spans verified undisturbed (still exactly 2).

3. **SW load** -- one new line in background.js directly after the mcp-metrics-recorder load (comment lines deliberately token-free for the tally pin).

4. **automation-logger.js** -- `mode` (default 'autopilot') + `mcpClient` (default null) carried through the NEW session literal, the APPEND field carries, and the indexEntry; pre-existing index entries default to Autopilot in the UI.

5. **Badges** -- sidepanel `loadHistoryList` and options `loadSessionList` meta rows render `MCP · <client>` (`history-source-badge mcp` / `session-source-badge mcp`) for mcp-agent sessions, `Autopilot` otherwise; escapeHtml'd, no new CSS files, no filter control (locked scope: badge only -- optional history filter skipped).

6. **tests/mcp-session-recorder.test.js** (new, 623 lines, 94 assertions) -- the 10 locked cases plus eviction restore (expired closes + live rehydrates + buffer key removal) and malformed/wrong-version envelope collapse; registered in the package.json chain right after mcp-dispatcher-client-label.

## Verification Results

- `node tests/mcp-session-recorder.test.js`: **94 passed, 0 failed** (all 10 locked cases + eviction restore + source-pin guards).
- `node tests/mcp-dispatcher-client-label.test.js`: 51 passed, 0 failed (Test 9 metrics pins undisturbed).
- `node tests/lattice-provider-bridge-smoke.test.js`: 110 passed, 0 failed (tally bumped 309 -> 310 mentions, 305 -> 306 call sites, provenance comments added per convention).
- Full `npm test`: **exit 0**. Aggregate across the two dominant reporter formats: 2,817 passed / 0 failed ("Results:" format, 49 suites) + 1,081 passed / 0 failed ("PASS/FAIL" format, 28 suites) = 3,898 assertions, 0 failures; remaining suites use bespoke reporters and all passed (chain is `&&`-fatal).
- `git status mcp/`: clean -- zero changes under mcp/, no tool-schema changes.
- `git log -1 --stat`: exactly the seven staged files (1,387 insertions, 2 deletions -- the two replaced lattice pin lines); no file deletions.
- `git diff extension/ui/options.js`: 5 hunks -- 4 pre-existing (fsbSelect work, lines ~1067-1167) + exactly 1 new (the badge at ~2792).

## Commit

- **721e2826** `feat(quick-260707-7id): record MCP agent sessions into logs/history/replay/memory` -- extension/utils/mcp-session-recorder.js, extension/ws/mcp-tool-dispatcher.js, extension/background.js, extension/utils/automation-logger.js, extension/ui/sidepanel.js, tests/lattice-provider-bridge-smoke.test.js, tests/mcp-session-recorder.test.js.

## FLAGGED: Files Left Uncommitted (user action needed)

Per the plan's commit protocol, these two files carry BOTH pre-existing local edits AND this task's surgical additions -- commit them together with your pending work:

1. **extension/ui/options.js** -- pre-existing fsbSelect edits (~lines 1067-1167) + this task's badge insertion in `loadSessionList` (~line 2792, the `session-source-badge` span).
2. **package.json** -- pre-existing test-chain insertion (`settings-card-select-clipping` + `control-panel-scroll-containment`, which reference your untracked local test files) + this task's insertion of `node tests/mcp-session-recorder.test.js` after `node tests/mcp-dispatcher-client-label.test.js`.

Also untouched and still local: extension/ui/options.css (pre-existing), tests/control-panel-scroll-containment.test.js + tests/settings-card-select-clipping.test.js (pre-existing untracked).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking environment] Fresh worktree had no installed dependencies**
- **Found during:** Task 1 verification (lattice test: `Cannot find package 'lattice'`), then Task 3 full-suite run (`better-sqlite3`, `ng` missing).
- **Fix:** `npm ci` (lockfile-exact restore, no new packages, no lockfile changes) in four locations: repo root, mcp/, showcase/server/, showcase/angular/.
- **Files modified:** none tracked (node_modules only; package-lock.json byte-identical).

**2. [Rule 2 - Missing critical functionality] Companion call-site pin also updated**
- **Found during:** Task 1 D. The plan cited only the `grep -c "importScripts"` mention tally, but lattice-provider-bridge-smoke.test.js ALSO pins the `importScripts(` call-site count (305), which my one new line increments.
- **Fix:** updated both assertions (310 mentions / 306 call sites) with provenance comments per the test's documented convention.
- **Commit:** 721e2826.

**3. [Rule 2 - Missing critical functionality] Post-eviction saveSession gate re-seed**
- **Found during:** Task 1 design of the restore path. After SW eviction the automationLogger in-memory log buffer is empty, so a restored-then-expired session would hit the saveSession empty-logs gate (automation-logger.js:709) and be silently dropped.
- **Fix:** closeSession re-seeds one session-bound log entry via `logSessionStart` when `getSessionLogs(sessionId)` is empty, before calling saveSession. Proven by Test 11 ("empty post-eviction log buffer re-seeded").
- **Commit:** 721e2826.

### Notes (not deviations)

- Plan's line citations for the lattice tally (568-584, older baselines) had drifted in this workspace (assertions now at ~618/652 with baselines 309/305 after parallel head work); handled per the test's own convention.
- Test 10's substring-order assertion initially matched the `typeof` guard instead of the call site during authoring; pinned to the call form (`recordDispatch({`) before the suite was first registered -- never committed broken.
- Orchestrator's generic per-task-commit rule was superseded by the plan's explicit Task 3 commit protocol (single commit, exactly seven files) which plan verification item 5 depends on.

## Optional AI Title Synthesis: SKIPPED

Per the plan's locked default: no single-call global provider helper exists in the SW, so `task` is seeded from the first `visualReason` (first-visualReason seeding). No provider plumbing was built.

## Pre-existing Test Failures

None. After dependency restore, the full suite is green (exit 0). No unrelated failures were encountered or left behind.

## Known Stubs

None -- all recorded fields are wired to real data sources; badges render live index fields.

## Self-Check: PASSED

- extension/utils/mcp-session-recorder.js: FOUND (committed)
- tests/mcp-session-recorder.test.js: FOUND (committed)
- Commit 721e2826: FOUND on refinements
- npm test exit 0: CONFIRMED
