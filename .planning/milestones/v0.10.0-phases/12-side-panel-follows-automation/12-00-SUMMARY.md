---
phase: 12-side-panel-follows-automation
plan: 00
subsystem: ui
tags: [sidepanel, message-log, persistence, debouncer, lru, smoke-harness, wave-0]

# Dependency graph
requires:
  - phase: 11-tab-aware-sidepanel-surface
    provides: sidepanel-tab-conv-store.js IIFE dual-export pattern (canonical sidecar shape mirrored by sidepanel-message-log.js)
provides:
  - sidepanel-message-log.js sidecar with 7 pure helpers + createDebouncer factory + 4 constants
  - fsbConversationMessages chrome.storage.local envelope schema (D-01..D-04 locked)
  - Wave 0 smoke harness with 8 Part placeholders + chrome.* mocks (runtime/tabs/storage.local/storage.session/sidePanel)
  - sidepanel.html script-tag wiring for the new sidecar (loads between sidepanel-tab-conv-store.js and speech-to-text.js)
  - package.json scripts.test &&-chain extension (new smoke as FINAL entry)
affects: [12-01-hydrate-repoint, 12-02-write-through-wiring, 12-03-live-progress-fix, 12-04-sidepanel-binding-ceremony]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IIFE dual-export sidecar (mirrors Phase 11 sidepanel-tab-conv-store.js)"
    - "Caller-injected storage callbacks (sidecar has ZERO chrome.* references)"
    - "Per-conversationId debouncer with clear-and-replace semantics + injected setTimeoutFn/clearTimeoutFn for deterministic test timing"
    - "Tail-evict LRU + orphan-reap ported from Phase 9 lattice-runtime-adapter.js"
    - "Smoke Part-placeholder scaffold (PASS-when-empty Wave 0 baseline) consumed by subsequent wave fills"

key-files:
  created:
    - extension/ui/sidepanel-message-log.js
    - tests/sidepanel-message-log-smoke.test.js
    - .planning/phases/12-side-panel-follows-automation/12-00-SUMMARY.md
  modified:
    - extension/ui/sidepanel.html
    - package.json

key-decisions:
  - "D-01 + D-02 sidecar STORAGE_KEY = 'fsbConversationMessages' (zero collision verified pre-phase)"
  - "D-03 createDebouncer factory uses clear-and-replace semantics + 200ms default + dependency-injected timer functions"
  - "D-04 hard LRU cap = 50 (Phase 11 + Phase 9 algorithm port)"
  - "Sidecar contains ZERO chrome.* references (pure helper; storage I/O is caller-owned per D-22 test-seam)"
  - "Smoke ships with 8 Part placeholders (PASS-when-empty) so npm test chain stays green at Wave 0 baseline"

patterns-established:
  - "Pattern 1: Phase 12 sidecars follow Phase 11 IIFE dual-export shape exactly (sidepanel-tab-conv-store.js as canonical reference)"
  - "Pattern 2: Smoke Part placeholders annotate which downstream plan fills each Part (forward-readability for waves 1-4)"
  - "Pattern 3: createFakeClock + seedTabConvEnvelope + seedMessageLogEnvelope test helpers defined in Wave 0 smoke; reusable by Plans 12-01..04 fills"

requirements-completed: []

# Metrics
duration: 6 min
completed: 2026-06-08
---

# Phase 12 Plan 00: Wave 0 sidecar + smoke scaffold Summary

**Pure-helper sidecar at extension/ui/sidepanel-message-log.js (envelope CRUD + LRU + clear-and-replace debouncer) + Wave 0 smoke harness with 8 Part placeholders + sidepanel.html script-chain wiring + package.json &&-chain extension; zero behavioral production change.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-08T07:38:04Z
- **Completed:** 2026-06-08T07:44:11Z
- **Tasks:** 3
- **Files modified:** 4 (2 created + 2 edited)

## Accomplishments

- Pure-helper sidecar `extension/ui/sidepanel-message-log.js` (299 lines) with 7 helpers (`emptyEnvelope`, `isValidEnvelope`, `appendMessage`, `getMessages`, `dropConversationMessages`, `_touchLru`, `_enforceLruCap`) + `createDebouncer` factory + 4 constants (`STORAGE_KEY='fsbConversationMessages'`, `DEFAULT_CAP=50`, `DEFAULT_DEBOUNCE_MS=200`, `ENVELOPE_VERSION=1`).
- IIFE dual-export shape byte-for-byte mirrors Phase 11 `sidepanel-tab-conv-store.js`: `global.FSBSidepanelMessageLog = exportsObj` + `module.exports = exportsObj`.
- Sidecar contains ZERO chrome.* references (verified via `grep -c "chrome\." extension/ui/sidepanel-message-log.js = 0`). Storage I/O is caller-owned; timer functions are dependency-injected so Node tests advance simulated time deterministically.
- `appendMessage` defends against invalid roles (only `user|assistant`) + invalid kinds (only `text|progress|tool|error`) + malformed envelopes via `isValidEnvelope` gate at every public-API entry.
- `_enforceLruCap` ports Phase 9 `lattice-runtime-adapter.js` keep-latest-N tail-eviction plus orphan-reap (deletes `byConv` keys not present in `lru` array; defense vs DevTools-mutated storage corruption).
- `createDebouncer` honors CONTEXT D-03 clear-and-replace semantics: every `schedule(convId, cb)` cancels the prior timer AND replaces with a fresh 200ms timer; `flush(convId)` cancels + immediately fires; `flushAll()` flushes every pending convId; `cancel(convId)` cancels without firing (defeats resurrection-after-drop per T-12-00-06 threat model).
- New Wave 0 smoke harness at `tests/sidepanel-message-log-smoke.test.js` (288 lines) with 8 Part placeholders annotated for downstream fills. Each Part emits one `ok(true, 'placeholder ...')` so `npm test` stays green at the Wave 0 baseline of 8 PASS / 0 FAIL.
- Smoke installs chrome.runtime + chrome.tabs + chrome.storage.local + chrome.storage.session + chrome.sidePanel mocks at module-top BEFORE requiring extension modules; mock pattern lifted from Phase 11 `tests/sidepanel-tab-aware-smoke.test.js`. `_sidePanelOptionsCalls` + `_sidePanelOpenCalls` spy arrays + `_sidePanelSetOptionsImpl` + `_sidePanelOpenImpl` impl-overrides are wired now so Plans 12-04 Parts 6+7 can use them without harness churn.
- Forward-compat helpers added in Wave 0: `createFakeClock` (deterministic time advance), `seedTabConvEnvelope` + `seedMessageLogEnvelope` (fixture seeders for Plans 12-01..02 hydrate + write-through Parts).
- `extension/ui/sidepanel.html` script-tag chain extended: new `<script src="sidepanel-message-log.js"></script>` at new line 128, strictly between `sidepanel-tab-conv-store.js` (line 127) and `speech-to-text.js` (line 129). No other lines mutated.
- `package.json` scripts.test &&-chain appended with `&& node tests/sidepanel-message-log-smoke.test.js` as the FINAL entry after `sidepanel-tab-aware-smoke.test.js`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sidecar extension/ui/sidepanel-message-log.js** - `6b5d10da` (feat)
2. **Task 2: Wire sidecar into sidepanel.html script-tag chain** - `09d70845` (feat)
3. **Task 3: Create Wave 0 smoke + extend package.json scripts.test &&-chain** - `04bf066a` (test)

**Plan metadata:** (this SUMMARY commit follows below)

## Files Created/Modified

- `extension/ui/sidepanel-message-log.js` (NEW; 299 lines) — Pure-helper sidecar: envelope CRUD + LRU + clear-and-replace debouncer factory; IIFE dual-export.
- `tests/sidepanel-message-log-smoke.test.js` (NEW; 288 lines) — Wave 0 smoke with 8 Part placeholders + chrome.* mocks (incl. storage.local + sidePanel) + DOM stubs + forward-compat fake-clock / fixture-seeder helpers.
- `extension/ui/sidepanel.html` (MODIFIED; +1 line) — Script-tag chain insertion at new line 128.
- `package.json` (MODIFIED; +1 entry on `scripts.test`) — &&-chain ends with new smoke as FINAL entry.

## Diff summary

| File | Lines added | Lines removed |
|------|-------------|---------------|
| `extension/ui/sidepanel-message-log.js` | 299 | 0 |
| `tests/sidepanel-message-log-smoke.test.js` | 288 | 0 |
| `extension/ui/sidepanel.html` | 1 | 0 |
| `package.json` | 1 (in `scripts.test` string) | 1 (replaced trailing entry) |

## Verification Results

| Check | Result |
|-------|--------|
| `node tests/sidepanel-message-log-smoke.test.js` | exit 0; 8 PASS / 0 FAIL Wave 0 baseline |
| `npm test` end-to-end | exit 0; entire chain green; Phase 11 sibling `sidepanel-tab-aware-smoke.test.js` reports 41 PASS unchanged |
| `grep -c "setTimeout" extension/ai/agent-loop.js` (INV-04 byte-freeze) | 8 (unchanged; baseline preserved) |
| `cd lattice && git rev-parse HEAD` (INV-06 byte-freeze) | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (unchanged; zero Lattice-side commits) |
| `git status --porcelain lattice/` (Lattice cleanliness) | empty |
| `grep -c "chrome\." extension/ui/sidepanel-message-log.js` | 0 (sidecar contains ZERO host-extension API references) |
| `node -e "require('./extension/ui/sidepanel-message-log.js').STORAGE_KEY"` | `fsbConversationMessages` |
| sidepanel.html script-tag order | sidepanel-tab-conv-store.js < sidepanel-message-log.js < speech-to-text.js < sidepanel.js (verified by node-side parser) |

## Decisions Made

- D-22 test-seam preserved: sidecar accepts caller-injected storage callbacks; Plans 12-01..03 wire `chrome.storage.local.get/set` from sidepanel.js at the call sites, NOT inside the sidecar.
- Clear-and-replace debounce semantics chosen over trailing-edge-only per CONTEXT D-03: every new `schedule(convId, cb)` call replaces the prior timer + supersedes the prior callback, so the most recent in-flight write always wins (matches user-facing "type, pause, type" UX expectation).
- Smoke ships forward-compat helpers (`createFakeClock`, `seedTabConvEnvelope`, `seedMessageLogEnvelope`) in Wave 0 so Plans 12-01..04 do NOT need to re-shape the harness when filling the Parts.
- Sidecar JSDoc rewrites "ZERO chrome.* calls" to "ZERO host-extension API calls" to keep the verify-command grep clean while preserving meaning. Functionality unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comment grep collision with verify-command**
- **Found during:** Task 1 (sidecar verify step)
- **Issue:** The Task 1 `<verify>` automated grep checks `src.indexOf('chrome.') !== -1`. The initial JSDoc comment contained the literal phrase "ZERO chrome.* calls" (informational comment about the test-seam). This is a documentation-only reference but the strict substring scan flagged it.
- **Fix:** Rewrote the JSDoc comment to "ZERO host-extension API calls" — semantically equivalent, no functional change, no chrome.* tokens anywhere in the file.
- **Files modified:** `extension/ui/sidepanel-message-log.js` (3 lines of JSDoc reworded)
- **Verification:** `grep -c "chrome\." extension/ui/sidepanel-message-log.js = 0`; Task 1 verify now PASS.
- **Committed in:** `6b5d10da` (Task 1 commit; reword was applied before the commit landed)

---

**Total deviations:** 1 auto-fixed (1 bug — strict-grep comment collision)
**Impact on plan:** Cosmetic comment rewording; sidecar API surface unchanged; all behavior + structure as planned.

## Authentication Gates

None - this plan is pure code; no external services touched.

## Issues Encountered

None - plan executed exactly as written aside from the trivial JSDoc reword logged above.

## User Setup Required

None - no external service configuration required.

## Carryforward Note for Plans 12-01..04

Wave 0 baseline established. Subsequent plans fill the 8 Part placeholders:

- **Plan 12-01 (Wave 1):** Fills Part 1 (FINT-23 hydrate Tier 1 reads `fsbConversationMessages`) + Part 2 (FINT-23 hydrate Tier 2 fallback to legacy `fsbSessionLogs` + Tier 3 empty render). Consumes `seedMessageLogEnvelope` helper for Tier-1 fixture; consumes `_localStore` directly for Tier-2 fixture.
- **Plan 12-02 (Wave 2):** Fills Part 3 (FINT-23 `addMessage` write-through via debouncer + LRU cap enforcement) + Part 4 (FINT-23 `flushAll` on `beforeunload` + `cancel` on drop). Consumes `createFakeClock` helper for deterministic 200ms time advance.
- **Plan 12-03 (Wave 3):** Fills Part 5 (FINT-22 `showSidepanelProgress` default flip + unconditional persistence write-through for `tool_executed` / `iteration_complete` events). Consumes `_onMessageListeners` registry to inject `sessionStateEvent` fixtures.
- **Plan 12-04 (Wave 4):** Fills Part 6 (FINT-24 `chrome.sidePanel.setOptions` + `chrome.sidePanel.open` called in Run handler with target tabId) + Part 7 (FINT-24 sidePanel API failure is best-effort; try/catch swallows; automation continues) + Part 8 (INV-04 setTimeout=8 + 4 iterator patterns + Phase-12 token awk-scan empty + INV-06 SHA byte-frozen). Consumes `_sidePanelOptionsCalls` / `_sidePanelOpenCalls` spy arrays + `_sidePanelSetOptionsImpl` / `_sidePanelOpenImpl` overrides for graceful-degradation tests.

## Next Phase Readiness

- Ready for Plan 12-01 (Wave 1 hydrate repoint). All Wave 0 prerequisites met.
- Sidecar API contract locked; downstream plans consume `MessageLog.appendMessage` + `MessageLog.getMessages` + `MessageLog.createDebouncer` without further sidecar churn.
- Smoke harness mock layer ready for chrome.storage.local round-trip tests + chrome.sidePanel spy tests + DOM-listener fixture injection.

## Self-Check: PASSED

- File check: `extension/ui/sidepanel-message-log.js` FOUND (299 lines).
- File check: `tests/sidepanel-message-log-smoke.test.js` FOUND (288 lines).
- File check: `extension/ui/sidepanel.html` FOUND (script tag inserted).
- File check: `package.json` FOUND (chain extended).
- Commit check: `6b5d10da` FOUND (Task 1).
- Commit check: `09d70845` FOUND (Task 2).
- Commit check: `04bf066a` FOUND (Task 3).
- Smoke check: `node tests/sidepanel-message-log-smoke.test.js` exits 0 with 8 PASS / 0 FAIL.
- Full chain: `npm test` exits 0 end-to-end; Phase 11 sibling smoke 41 PASS unchanged.
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` = 8 (BYTE-FROZEN).
- INV-06: `cd lattice && git rev-parse HEAD` = `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED).
- Sidecar zero-chrome: `grep -c "chrome\." extension/ui/sidepanel-message-log.js` = 0.
- No emojis in any new or modified file.

---
*Phase: 12-side-panel-follows-automation*
*Completed: 2026-06-08*
