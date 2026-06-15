---
phase: 12-side-panel-follows-automation
plan: 01
subsystem: ui
tags: [sidepanel, hydrate, 3-tier-fallback, render-persisted-message, pitfall-3-defense, wave-1, fint-23]

# Dependency graph
requires:
  - phase: 12-side-panel-follows-automation
    plan: 00
    provides: sidepanel-message-log.js sidecar (FSBSidepanelMessageLog.getMessages + STORAGE_KEY constants) + Wave 0 smoke harness with chrome.* + DOM stubs + fake clock + envelope seeders
provides:
  - hydrateChatFromConversationId 3-tier fallback (Tier 1 fsbConversationMessages, Tier 2 fsbSessionLogs verbatim from b8b761e8 + addMessage replaced with renderPersistedMessage, Tier 3 empty)
  - renderPersistedMessage(content, role, kind) helper -- DOM-only render path; bypasses addMessage chokepoint (Plan 12-02 Pitfall 3 defense baseline)
  - Phase 12 smoke Parts 1 + 2 filled with real Tier 1 + Tier 2 + Tier 3 assertions (16 PASS)
  - _loadSidepanelHydrate vm-style regex extractor pattern for downstream Plans 12-02..04 listener-body tests
affects: [12-02-write-through-wiring, 12-03-live-progress-fix, 12-04-sidepanel-binding-ceremony]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "renderPersistedMessage helper as Pitfall 3 defense (DOM-only sync; no .new class; no animation setTimeout; centralized CSS mapping for (role, kind) tuples)"
    - "3-tier hydrate fallback with short-circuit mutually-exclusive tiers (Tier 1 wins -> Tier 2 + Tier 3 skipped; Tier 2 wins -> Tier 3 skipped)"
    - "vm-style regex function extraction in Node smoke tests (sidepanel.js is classic-script document-bound 2600+ lines; new Function() with injected dependencies + bare-identifier var-prefix)"
    - "Faithful DOM innerHTML semantics in createDivStub via Object.defineProperty setter that clears children array (enables idempotency assertions)"

key-files:
  created:
    - .planning/phases/12-side-panel-follows-automation/12-01-SUMMARY.md
  modified:
    - extension/ui/sidepanel.js
    - tests/sidepanel-message-log-smoke.test.js

key-decisions:
  - "D-05 + D-06 honored: function name + arity preserved; Tier 1 fsbConversationMessages -> Tier 2 fsbSessionLogs -> Tier 3 empty short-circuit mutually-exclusive"
  - "D-07 render fidelity 1:1: defensive chronological sort by timestamp; role + kind tags preserved via renderPersistedMessage"
  - "Pitfall 3 defense: addMessage NOT called inside hydrate body (verified runtime + grep); Tier 2 body uses renderPersistedMessage exclusively"
  - "renderPersistedMessage drops .new class + animation setTimeout: replayed scrollback is NOT new"
  - "T-12-01-02 XSS mitigation: renderPersistedMessage uses messageDiv.textContent (NOT innerHTML); DOM escaping automatic"

patterns-established:
  - "Pattern 1: Phase 12 hydrate Tier-1 reads consume FSBSidepanelMessageLog.getMessages(envelope, convId) directly with the sidecar STORAGE_KEY"
  - "Pattern 2: Plans 12-02..04 listener-body smoke tests reuse _loadSidepanelHydrate extractor pattern (or sibling extractors) to load functions from sidepanel.js without requiring full module"
  - "Pattern 3: createDivStub innerHTML semantics now match DOM (setting clears children); downstream listener-body tests can rely on it for idempotency assertions"

requirements-completed:
  - FINT-23 (hydrate Tier 1 repoint partial -- read path; write-through path lands in Plan 12-02)

# Metrics
duration: 7 min
completed: 2026-06-08
---

# Phase 12 Plan 01: hydrate Tier 1 repoint + renderPersistedMessage Pitfall 3 defense Summary

**hydrateChatFromConversationId restructured to 3-tier fallback (fsbConversationMessages -> fsbSessionLogs -> empty) with a new renderPersistedMessage DOM-only helper that defeats the Plan 12-02 write-through loopback (Pitfall 3); smoke Parts 1 + 2 filled with 16 real PASS asserting envelope read + chronological sort + Tier 1 short-circuit + idempotency + Tier 2 legacy fallback + Tier 3 empty + convId guard; cumulative smoke 22 PASS / 0 FAIL.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-08T07:47:54Z
- **Completed:** 2026-06-08T07:54:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `extension/ui/sidepanel.js` `hydrateChatFromConversationId(convId)` body restructured to 3-tier fallback per CONTEXT D-05 through D-08. Function name + arity preserved (zero call-site churn). Tier 1 reads `fsbConversationMessages` via `FSBSidepanelMessageLog.getMessages(envelope, convId)` (Plan 12-00 sidecar) with defensive `typeof` guards on the sidecar + storage-key constants; defensive chronological sort by `timestamp` (insertion order is preserved by the sidecar but defends against out-of-order writers); short-circuit return on Tier 1 match. Tier 2 preserves the `b8b761e8` legacy `fsbSessionLogs` + `fsbSessionIndex` body verbatim except for `addMessage` / `addCompletionMessage` calls REPLACED with `renderPersistedMessage` (Pitfall 3 defense). Tier 3 catch returns 0; caller fires welcome.
- New `renderPersistedMessage(content, role, kind)` helper added immediately above `addMessage`. DOM-only sync render path; maps `(role, kind)` tuples to existing `.message.{user|system|action|error}` CSS classes (per CONTEXT D-12 styling reuse). NO `.new` class. NO animation `setTimeout`. Scrollback is NOT new. Uses `messageDiv.textContent` (NOT `innerHTML`) -- automatic DOM escaping defeats T-12-01-02 XSS.
- Pitfall 3 defense verified at runtime via Part 2.5 + 2.6 PASS (Tier 2 CSS classes present, confirming renderPersistedMessage path executed) and at grep-time via verification step 8 (zero `addMessage` / `addCompletionMessage` substring matches inside hydrate body).
- `tests/sidepanel-message-log-smoke.test.js` Parts 1 + 2 filled with 16 real PASS via vm-style function extraction. New `_loadSidepanelHydrate()` helper reads `extension/ui/sidepanel.js` as a string, extracts `hydrateChatFromConversationId` + `renderPersistedMessage` via regex, instantiates fresh closures via `new Function(...)` with injected `chrome` + `FSBSidepanelMessageLog` + `chatMessages` + `document` + state container. Bare identifier references (`activeConversationId`, `lastRenderedTerminalSessionId`, `historySessionId`) declared as closure-scoped vars; `getState()` returns a snapshot for mutation assertions.
- Smoke Part 1 (Tier 1; 6 PASS): 1.1 count returned matches envelope (3); 1.2 3 DOM children rendered; 1.3 chronological sort by timestamp ascending (envelope seeded out-of-order at 100/300/200 -> rendered in 100/200/300 order); 1.4 Tier 1 short-circuits Tier 2 (seeded `fsbSessionLogs` `SHOULD-NOT-RENDER` text absent from DOM); 1.5 idempotency on re-call (children count stays at 3, NOT 6); 1.6 `activeConversationId` mutation observed.
- Smoke Part 2 (Tier 2 + Tier 3 + convId guard; 10 PASS): 2.1 Tier 2 returns matching.length; 2.2 2 DOM children rendered (user cmd + assistant completion); 2.3 user command rendered first; 2.4 completion rendered second; 2.5 Tier 2 user CSS class set via renderPersistedMessage; 2.6 Tier 2 assistant CSS class set; 2.7 activeConversationId mutation observed in Tier 2 path; 2.8 Tier 3 returns 0 when both stores empty; 2.9 Tier 3 renders zero DOM children; 2.10 convId guard returns 0 for null + empty.
- `createDivStub` updated with faithful DOM `innerHTML` semantics via `Object.defineProperty` setter that clears the children array on assignment. This is a test-harness correctness fix required for the idempotency assertion 1.5; the existing `createDivStub` (Wave 0 baseline) had `innerHTML: ''` as a plain object property and did NOT clear children on subsequent assignments, so re-hydrating accumulated children (3 -> 6 on second call). Real DOM clears children when `innerHTML = ''`; the stub now matches.

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure hydrateChatFromConversationId to 3-tier fallback + add renderPersistedMessage helper** - `650682f5` (feat)
2. **Task 2: Fill smoke Parts 1 + 2 with real Tier 1 + Tier 2 + Tier 3 assertions (16 PASS)** - `22e93f47` (test)

**Plan metadata:** (this SUMMARY commit follows below)

## Files Created/Modified

- `extension/ui/sidepanel.js` (MODIFIED; +70 / -15 lines) -- Added `renderPersistedMessage(content, role, kind)` helper (29 lines incl. JSDoc) immediately above `addMessage`. Restructured `hydrateChatFromConversationId(convId)` body to 3-tier (Tier 1 fsbConversationMessages -> Tier 2 fsbSessionLogs verbatim from b8b761e8 with addMessage replaced -> Tier 3 catch return 0). Function name + arity preserved.
- `tests/sidepanel-message-log-smoke.test.js` (MODIFIED; +144 / -5 lines) -- Added `_loadSidepanelHydrate()` vm-style regex extractor + fresh-closure instantiator with injected deps. Filled Parts 1 + 2 placeholders with 16 real PASS. Updated `createDivStub` to use `Object.defineProperty` for faithful `innerHTML` setter semantics.

## Diff summary

| File | Lines added | Lines removed |
|------|-------------|---------------|
| `extension/ui/sidepanel.js` | 70 | 15 |
| `tests/sidepanel-message-log-smoke.test.js` | 149 | 5 |

## Verification Results

| Check | Result |
|-------|--------|
| `node tests/sidepanel-message-log-smoke.test.js` | exit 0; 22 PASS / 0 FAIL (>= 18 cumulative target met) |
| `npm test` end-to-end | exit 0; entire chain green; Phase 11 sibling `sidepanel-tab-aware-smoke.test.js` reports 41 PASS unchanged |
| `grep -c "setTimeout" extension/ai/agent-loop.js` (INV-04 byte-freeze) | 8 (UNCHANGED) |
| `cd lattice && git rev-parse HEAD` (INV-06 byte-freeze) | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED; zero Lattice-side commits) |
| `git status --porcelain lattice/` (Lattice cleanliness) | empty |
| `grep -c "renderPersistedMessage" extension/ui/sidepanel.js` | 7 (1 function definition + 6 call sites: 1 in Tier 1, 5 in Tier 2 -- exceeds plan target of >= 6) |
| `grep -c "FSBSidepanelMessageLog\\.getMessages" extension/ui/sidepanel.js` | 2 (1 typeof guard + 1 actual call -- both inside the Tier 1 try block) |
| Pitfall 3 defense grep -- addMessage/addCompletionMessage inside hydrate body | empty (zero -- defense intact) |
| Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js` byte-frozen | UNCHANGED (no git diff) |
| Emoji scan in modified files | CLEAN (no emojis) |

## Decisions Made

- **Tier 1 storage read uses sidecar STORAGE_KEY constant + typeof guards:** code reads `chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY)` and guards on `typeof FSBSidepanelMessageLog !== 'undefined'`, `typeof FSBSidepanelMessageLog.getMessages === 'function'`, and `typeof FSBSidepanelMessageLog.STORAGE_KEY === 'string'`. Defense against missing-module load order (sidepanel.html script-tag chain enforces order, but defense-in-depth covers SW restart races + future refactors).
- **Tier 1 defensive chronological sort:** `messages.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))`. The Plan 12-00 sidecar `appendMessage` preserves insertion order on append, so the sort is a no-op for in-order envelopes. The defense covers out-of-order writers (e.g., a future bulk-import path) and corrupted timestamps (defaulting to 0 keeps stable ordering). Asserted at Part 1.3 via out-of-order envelope seeding (100/300/200 -> 100/200/300).
- **D-26 partial-badge degradation accepted in Tier 2:** the b8b761e8 body used `addCompletionMessage(completion, 'ai', isPartial)` to surface a "partial outcome" badge for partial completions. Per Pitfall 3, the Tier 2 body now uses `renderPersistedMessage(completion, 'assistant', 'text')` which does NOT carry the partial badge. Acceptable per D-26 fresh-only ship (pre-Phase-12 conversations no longer surface the partial badge on hydrate; new Phase 12 conversations write through Plan 12-02's path where the partial signal is preserved via the `kind` tag).
- **`activeConversationId` set in BOTH Tier 1 success AND Tier 2 success:** preserves the b8b761e8 module-scope variable mutation semantics. `lastRenderedTerminalSessionId` + `historySessionId` set ONLY in Tier 2 (no session-id concept in Tier 1 envelope; the Tier 1 path has no synthesized session id to surface to `recoverLatestThreadTerminalOutcome`).
- **Smoke vm-style extractor over loading full sidepanel.js:** `extension/ui/sidepanel.js` is 2600+ lines and depends on `document.*` + many `chrome.*` listeners at module-load time. A Node `require()` of the full module would fail or pollute global state. The regex extraction + `new Function(...)` instantiator pattern keeps the smoke tightly scoped to the functions Plan 12-01 added or modified. Forward-compat for Plans 12-02..04: sibling extractors can target `addMessage`, `setIdleState`, `chrome.tabs.onActivated` listeners, etc.
- **createDivStub innerHTML setter (Rule 1 - Bug fix):** the Wave 0 createDivStub had `innerHTML: ''` as a plain object property. When sidepanel.js code does `chatMessages.innerHTML = ''`, the property is overwritten but the stub's children array is NOT cleared. Real DOM clears children. Fixed via `Object.defineProperty(stub, 'innerHTML', {set: v => { _innerHTML = v; if (typeof v === 'string') children.length = 0; }})`. This is a test-harness correctness fix needed for the Part 1.5 idempotency assertion (re-call should rerender same count, not double). Production code (hydrate) is correct; only the stub semantics were wrong.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] createDivStub did NOT clear children on innerHTML setter**
- **Found during:** Task 2 (smoke run after Parts 1 + 2 filled)
- **Issue:** Part 1.5 idempotency assertion expected `chatMessages._children().length === 3` after re-call. Got 6 -- the stub accumulated children across the two hydrate calls because `chatMessages.innerHTML = ''` (the sidepanel.js clear) was a plain object property assignment that did NOT clear the stub's `children` array. Real DOM clears children when innerHTML is set; the stub did not.
- **Fix:** Replaced the plain `innerHTML: ''` field with `Object.defineProperty(stub, 'innerHTML', {get, set})`. The setter assigns the inner value AND clears the children array on any string assignment. Faithful DOM innerHTML semantics restored.
- **Files modified:** `tests/sidepanel-message-log-smoke.test.js` (createDivStub helper, ~15 lines diff)
- **Verification:** Part 1.5 PASS after fix; Part 1.2 (3 children on first call) still PASS; all other createDivStub-consuming assertions still PASS.
- **Committed in:** `22e93f47` (Task 2 commit; fix landed before commit)

---

**Total deviations:** 1 auto-fixed (1 test-harness bug -- createDivStub innerHTML semantics)
**Impact on plan:** Zero production code change; only test-harness correctness fix. Plan executed as written aside from the trivial stub fix logged above.

## Authentication Gates

None - this plan is pure code; no external services touched.

## Issues Encountered

None - plan executed exactly as written aside from the createDivStub fix logged in Deviations.

## User Setup Required

None - no external service configuration required.

## Carryforward Note for Plans 12-02..04

Plan 12-01 ships the READ path of FINT-23. Plans 12-02..04 build on this baseline:

- **Plan 12-02 (Wave 2 -- FINT-23 partial):** addMessage write-through wiring. Every `addMessage(text, type)` call will additionally call `MessageLog.appendMessage(envelope, conversationId, {role, content, timestamp, kind})` via the per-convId debouncer from Plan 12-00. The `renderPersistedMessage` helper shipped here is the Pitfall 3 chokepoint defeat: hydrate replays will NOT loop back into persistence because `hydrateChatFromConversationId` calls `renderPersistedMessage` exclusively (zero `addMessage` calls in hydrate body, verified). Plan 12-02 fills smoke Parts 3 + 4 (write-through + LRU + flushAll + cancel).
- **Plan 12-03 (Wave 3 -- FINT-22):** Live progress wiring. `showSidepanelProgress` default flip + unconditional `addMessage` for `tool_executed` + `iteration_complete` `sessionStateEvent` cases. Builds on Plan 12-02's addMessage chokepoint to automatically persist progress messages. Plan 12-03 fills smoke Part 5.
- **Plan 12-04 (Wave 4 -- FINT-24 + ceremony):** Per-tab `chrome.sidePanel.setOptions` + `open` in autopilot bind path. INV-04 + INV-06 byte-freeze regression smoke. REQUIREMENTS.md FINT-22/23/24 traceability + LATTICE-PIN.md Phase 12 row + MILESTONE-AUDIT.md status_history. Plan 12-04 fills smoke Parts 6 + 7 + 8.

The `_loadSidepanelHydrate` vm-style extractor pattern shipped in Plan 12-01 smoke is the recommended technique for Plans 12-02..04 to instrument additional sidepanel.js functions without requiring the full module. Pattern: read sidepanel.js as text, regex-extract function body, declare bare-identifier references as closure-scoped vars via `new Function(...)` prefix, inject dependencies as `new Function` args.

## Next Phase Readiness

- Ready for Plan 12-02 (Wave 2 write-through wiring). Plan 12-01 prerequisites met:
  - `renderPersistedMessage` helper exists as Pitfall 3 chokepoint defeat (Plan 12-02's `addMessage` write-through hook can be unconditional because hydrate replays never touch `addMessage`).
  - 3-tier hydrate path validated end-to-end; Plan 12-02 can safely wire `addMessage` write-through knowing the Tier 1 read path works.
  - Smoke harness has the vm-extractor pattern + faithful innerHTML stub; Plans 12-02..04 smoke fills can extend the same pattern to additional sidepanel.js functions.
- Sidecar API contract (Plan 12-00) consumed correctly: `STORAGE_KEY` + `getMessages(envelope, convId)` -- no churn required for Plans 12-02..04.
- Phase 11 sibling smoke 41 PASS / 0 FAIL byte-unchanged (Plan 12-01 invariant preserved).

## Self-Check: PASSED

- File check: `extension/ui/sidepanel.js` MODIFIED (renderPersistedMessage helper added; hydrateChatFromConversationId 3-tier).
- File check: `tests/sidepanel-message-log-smoke.test.js` MODIFIED (Parts 1 + 2 filled; createDivStub innerHTML setter; _loadSidepanelHydrate extractor).
- Commit check: `650682f5` FOUND (Task 1).
- Commit check: `22e93f47` FOUND (Task 2).
- Smoke check: `node tests/sidepanel-message-log-smoke.test.js` exits 0 with 22 PASS / 0 FAIL (>= 18 target met).
- Full chain: `npm test` exits 0 end-to-end; Phase 11 sibling smoke 41 PASS unchanged.
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` = 8 (BYTE-FROZEN).
- INV-06: `cd lattice && git rev-parse HEAD` = `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED).
- Lattice porcelain: `git status --porcelain lattice/` empty.
- renderPersistedMessage occurrences in sidepanel.js: 7 (1 def + 6 calls; exceeds >= 6 plan target).
- Pitfall 3 defense: zero `addMessage` / `addCompletionMessage` calls inside hydrate body (verified via awk-extract of function body + grep).
- Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js`: byte-unchanged (no git diff).
- No emojis in any modified file.

---
*Phase: 12-side-panel-follows-automation*
*Completed: 2026-06-08*
