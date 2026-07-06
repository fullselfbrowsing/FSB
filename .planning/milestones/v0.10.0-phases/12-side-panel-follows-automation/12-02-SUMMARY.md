---
phase: 12-side-panel-follows-automation
plan: 02
subsystem: ui
tags: [sidepanel, message-log, write-through, debouncer, lru, beforeunload, ec-05-defense, wave-2, fint-23]

# Dependency graph
requires:
  - phase: 12-side-panel-follows-automation
    plan: 00
    provides: FSBSidepanelMessageLog sidecar (createDebouncer factory + appendMessage + dropConversationMessages + emptyEnvelope + isValidEnvelope + STORAGE_KEY + DEFAULT_DEBOUNCE_MS + DEFAULT_CAP)
  - phase: 12-side-panel-follows-automation
    plan: 01
    provides: renderPersistedMessage helper (Pitfall 3 defense -- hydrate replay bypasses addMessage chokepoint so write-through hooks here never loop on reopen)
provides:
  - _persistMessage(role, content, kind) write-through helper invoked from addMessage + addCompletionMessage + addActionMessage chokepoints
  - _flushMessageLog(convId) async helper -- snapshot buffer + read envelope + appendMessage loop + persist; on failure resurrects snapshot
  - Module-scope _messageLogDebouncer (createDebouncer factory) + _messageLogPendingBuffer Map<convId, Array<msg>>
  - Boot-time debouncer init + beforeunload force-flush listener (CONTEXT D-03 defense-in-depth)
  - addMessage signature extended with optional 3rd `kind` parameter (backward compatible for 60+ existing call sites)
  - addActionMessage persistence UNCONDITIONAL (fires BEFORE showSidepanelProgressEnabled guard per CONTEXT D-10)
  - chrome.tabs.onRemoved EC-05 defense: resolve convId BEFORE drop -> cancel debouncer -> clear buffer -> drop envelope -> persist
  - Smoke Parts 3 + 4 filled with 20 real PASS (debouncer defer + clear-and-replace + LRU eviction + buffered burst + flushAll + cancel + drop together + flushAll no-op + callback throw swallow)
affects: [12-03-live-progress-fix, 12-04-sidepanel-binding-ceremony]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write-through chokepoint pattern -- single _persistMessage helper invoked from 3 DOM render entry points (addMessage + addCompletionMessage + addActionMessage)"
    - "Clear-and-replace debounce per CONTEXT D-03 -- every schedule() call replaces prior timer with fresh 200ms timer; predictable batching of bursty progress streams"
    - "Defense-in-depth force flush on beforeunload -- bounded 200ms loss window on sidepanel close per CONTEXT D-03"
    - "EC-05 resurrection-after-drop defense -- cancel debouncer BEFORE drop ensures would-have-fired write does not re-add evicted entry"
    - "Resurrect-on-failure pattern -- _flushMessageLog snapshots + clears buffer; on storage failure prepends snapshot back to buffer so next flush retries"

key-files:
  created:
    - .planning/phases/12-side-panel-follows-automation/12-02-SUMMARY.md
  modified:
    - extension/ui/sidepanel.js
    - tests/sidepanel-message-log-smoke.test.js

key-decisions:
  - "D-03 honored: clear-and-replace 200ms debounce; beforeunload force flush via window.addEventListener; storage failures swallow silently to never block DOM render"
  - "D-10 honored: addActionMessage persistence fires BEFORE the showSidepanelProgressEnabled guard so progress messages persist UNCONDITIONALLY even when DOM render is suppressed by user setting"
  - "addMessage signature extended with optional 3rd kind parameter -- backward compatible with 60+ existing call sites that pass 1-2 args; Plan 12-03 autopilot listener can pass kind='tool' for tool_executed events"
  - "EC-05 defense -- chrome.tabs.onRemoved resolves convId via FSBSidepanelTabConvStore.getTabConversation BEFORE Phase 11 drop nulls the byTab entry; then cancels debouncer + drops in-memory buffer + drops message-log envelope + persists; ensures the 200ms timer cannot resurrect the evicted entry"
  - "Defensive typeof + isValidEnvelope guards at every cross-module boundary so script-tag load order failures degrade gracefully"

patterns-established:
  - "Pattern 1: Module-scope debouncer + buffer pair (per-convId state for batched writes) initialized at boot via sidecar factory; consumed by chokepoint helpers"
  - "Pattern 2: Chokepoint write-through -- one helper (_persistMessage) called from 3 DOM render functions ensures all visible messages persist via a single code path"
  - "Pattern 3: Resolve-before-drop -- when tab is removed, read the to-be-dropped convId BEFORE the Phase 11 drop nulls it, then perform cross-store cleanup using the captured value"

requirements-completed:
  - FINT-23 (per-conversation message log -- write-through path lands here; Tier 1 hydrate read path shipped in Plan 12-01)

# Metrics
duration: 7 min
completed: 2026-06-08
---

# Phase 12 Plan 02: addMessage write-through wiring Summary

**Module-scope debouncer + in-memory buffer + _persistMessage / _flushMessageLog helpers + boot init + beforeunload force flush; addMessage / addCompletionMessage / addActionMessage chokepoint hooks (addActionMessage persists UNCONDITIONALLY per CONTEXT D-10 BEFORE the showSidepanelProgressEnabled guard); chrome.tabs.onRemoved EC-05 defense (resolve convId BEFORE drop -> cancel debouncer -> clear buffer -> drop envelope -> persist); smoke Parts 3 + 4 filled with 20 real PASS (debounce semantics + LRU + flushAll + cancel + EC-05 + error swallow); cumulative smoke 40 PASS / 0 FAIL (well above 28 cumulative target).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-08T07:59:19Z
- **Completed:** 2026-06-08T08:06:44Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- `extension/ui/sidepanel.js` carries new module-scope state for the Phase 12 FINT-23 write-through layer: `var _messageLogDebouncer = null;` + `var _messageLogPendingBuffer = new Map();` inserted immediately after `let showSidepanelProgressEnabled = false;` near the top of the file. The pair holds boot-instantiated debouncer + per-convId in-memory buffer of pending messages that flush as a single batched chrome.storage.local write.
- New `_persistMessage(role, content, kind)` helper added immediately ABOVE `renderPersistedMessage` (grouped with other Phase 12 helpers). Guards: returns early on `typeof FSBSidepanelMessageLog === 'undefined'` (sidecar absent / script-tag load failure); on null/empty `conversationId` (lazy-mint window per Phase 11 D-17); on empty `content`; on absent `_messageLogDebouncer` (boot init failed). Role normalization: `'user'` -> `'user'`; everything else -> `'assistant'` (covers DOM-type literals like `'system'`, `'error'`, `'action'`). Kind normalization: caller-supplied 3rd arg overrides; default `'text'`. Appends to in-memory buffer for read consistency within the debounce window; schedules a 200ms-debounced flush per CONTEXT D-03 clear-and-replace semantics via `_messageLogDebouncer.schedule(convId, ...)`.
- New `_flushMessageLog(convId)` async helper added alongside `_persistMessage`. Reads the envelope from `chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY)`; defaults to `emptyEnvelope()` on invalid; iterates the snapshot and calls `FSBSidepanelMessageLog.appendMessage(envelope, convId, snapshot[i])` (which enforces LRU cap = 50 per Plan 12-00); persists back. On failure: snapshots are resurrected into the buffer (prepending if a new snapshot arrived during the await) so the next flush retries -- best-effort per CONTEXT D-03.
- Boot init block added AFTER `await initTabConversationStore()` and BEFORE `initializeSidepanelAnalytics()` inside the existing `document.addEventListener('DOMContentLoaded', ...)` handler. Instantiates the debouncer via `FSBSidepanelMessageLog.createDebouncer({ debounceMs: FSBSidepanelMessageLog.DEFAULT_DEBOUNCE_MS })`. Registers `window.addEventListener('beforeunload', ...)` for forced `flushAll()` on sidepanel close (CONTEXT D-03 defense-in-depth; fire-and-forget catch-then-swallow because the page may not survive the await).
- `addMessage` signature extended with optional 3rd `kind` parameter: `function addMessage(text, type = 'system', kind)`. Backward compatible with the 60+ existing call sites that pass 1-2 args; Plan 12-03 autopilot listener can pass an explicit `kind` (e.g., `'tool'` for `tool_executed` events). Write-through hook fires AFTER `scrollToBottom()` so DOM render completes before persistence write. Role derives from `type` (`'user'` -> `'user'`; else `'assistant'`); kind derives from `type` when not supplied by caller (`'error'` -> `'error'`; `'action'` -> `'tool'`; else `'text'`).
- `addCompletionMessage` write-through hook fires after the existing `scrollToBottom()`: `_persistMessage('assistant', text, 'text')`. The `isPartial` flag is NOT recorded per CONTEXT D-07 + D-26 (fresh-only ship; pre-Phase-12 conversations no longer surface the partial badge on hydrate).
- `addActionMessage` write-through hook fires BEFORE the existing `if (!showSidepanelProgressEnabled) return;` guard (line 1309 area). Per CONTEXT D-10: "every progress message that lands in the DOM via addMessage MUST also land in `fsbConversationMessages`." By moving persistence ahead of the guard, persistence fires UNCONDITIONALLY -- the DOM render below remains gated by the user setting until Plan 12-03 flips the default to true (FINT-22). Smoke verifies this via the unconditional write-through (addActionMessage internally persists; the call site only needs to invoke the function).
- `chrome.tabs.onRemoved` listener body extended with the EC-05 resurrection-after-drop defense per 12-RESEARCH Section 8 EC-05. Order is critical:
  1. Resolve `droppedConvId = FSBSidepanelTabConvStore.getTabConversation(tabConvEnvelope, tabId)` BEFORE the existing `dropTabConversation(tabId)` call (which nulls the byTab entry).
  2. Call the existing `await dropTabConversation(tabId)` (Phase 11 envelope drop unchanged).
  3. If `droppedConvId` resolved + `FSBSidepanelMessageLog` available: call `_messageLogDebouncer.cancel(droppedConvId)` to clear any pending 200ms timer; call `_messageLogPendingBuffer.delete(droppedConvId)` to clear in-memory buffer; read the message-log envelope; call `FSBSidepanelMessageLog.dropConversationMessages(envelope, droppedConvId)`; persist back.
  Step 3's cancel + buffer-clear MUST precede the envelope drop. Otherwise the 200ms timer could fire AFTER the envelope drop and re-add an entry. The smoke (Part 4.8) verifies this scenario.
- `tests/sidepanel-message-log-smoke.test.js` Parts 3 + 4 filled with 20 real PASS via fake-timer harness. The harness uses `setTimeoutFn` + `clearTimeoutFn` dependency injection on `createDebouncer({...})` so `advance(ms)` synchronously runs any callbacks whose deadline has elapsed. Mirrors the Plan 12-00 verify-command pattern.
  - **Part 3 (10 PASS):** 3.1-3.2 debouncer defers and fires at 200ms exactly; 3.3-3.4 clear-and-replace -- 1st schedule + 100ms wait + 2nd schedule + 199ms wait shows 0 fires, then 2ms more shows ONLY the 2nd callback fires (1st was clear-and-replaced); 3.5-3.8 LRU cap=50 -- insert 51 conversations -> oldest (lru_0) evicted from byConv, newest (lru_50) retained, head = MRU; 3.9-3.10 buffered burst -- 5 schedules in ~80ms (each followed by 20ms advance) -> still pending at 199ms-after-LAST-schedule (fakeNow=80 last schedule + 199 = 279), fires exactly once at 200ms (fakeNow=281).
  - **Part 4 (10 PASS):** 4.1-4.3 flushAll forces all pending callbacks; _hasPending true while pending then false after flush; 4.4-4.5 cancel preempts (callback never fires; _hasPending false); 4.6-4.8 EC-05 -- cancel + dropConversationMessages together: envelope byConv entry removed, lru entry removed, callback never fires (resurrection defeated); 4.9 flushAll on empty pending = no-op; 4.10 callback throw swallowed; flush completes without raising (per CONTEXT D-03 best-effort).
- Cumulative smoke after Wave 2: 40 PASS / 0 FAIL (well above the >= 28 cumulative plan target).
- Phase 11 sibling smoke at `tests/sidepanel-tab-aware-smoke.test.js` BYTE-FROZEN (no diff). `npm test` end-to-end chain green; exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add module-scope debouncer + buffer + boot init + beforeunload flush** - `c44344b1` (feat)
2. **Task 2: Hook _persistMessage into 3 chokepoints + extend onRemoved EC-05 defense** - `2925f925` (feat)
3. **Task 3: Fill smoke Parts 3 + 4 with debouncer + LRU + flushAll + cancel assertions** - `cb2dd11b` (test)

**Plan metadata:** (this SUMMARY commit follows below)

## Files Created/Modified

- `extension/ui/sidepanel.js` (MODIFIED; +174 / -1 lines across 2 commits)
  - +10 lines module-scope `_messageLogDebouncer` + `_messageLogPendingBuffer` declarations near line 17.
  - +84 lines `_persistMessage` + `_flushMessageLog` helpers immediately above `renderPersistedMessage`.
  - +15 lines boot init block (createDebouncer + beforeunload listener) after `initTabConversationStore()`.
  - +1 line `addMessage` signature extension `, kind`.
  - +12 lines `addMessage` write-through hook after scrollToBottom.
  - +4 lines `addCompletionMessage` write-through hook after scrollToBottom.
  - +5 lines `addActionMessage` write-through hook BEFORE showSidepanelProgressEnabled guard.
  - +43 lines `chrome.tabs.onRemoved` EC-05 defense extension (resolve convId + cancel + clear buffer + drop envelope + persist).
- `tests/sidepanel-message-log-smoke.test.js` (MODIFIED; +118 / -4 lines) -- Parts 3 + 4 placeholders replaced with 20 real PASS using fake-timer harness (setTimeoutFn + clearTimeoutFn dependency injection on createDebouncer).

## Diff summary

| File | Lines added | Lines removed |
|------|-------------|---------------|
| `extension/ui/sidepanel.js` | 174 | 1 |
| `tests/sidepanel-message-log-smoke.test.js` | 118 | 4 |

## Verification Results

| Check | Result |
|-------|--------|
| `node tests/sidepanel-message-log-smoke.test.js` | exit 0; 40 PASS / 0 FAIL (>= 28 cumulative target met by +12) |
| `npm test` end-to-end | exit 0; entire chain green; Phase 11 sibling `sidepanel-tab-aware-smoke.test.js` reports 41 PASS unchanged |
| `grep -c "setTimeout" extension/ai/agent-loop.js` (INV-04 byte-freeze) | 8 (UNCHANGED) |
| `cd lattice && git rev-parse HEAD` (INV-06 byte-freeze) | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED; zero Lattice-side commits) |
| `git status --porcelain lattice/` (Lattice cleanliness) | empty |
| `grep -c "_persistMessage" extension/ui/sidepanel.js` | 4 (1 function definition + 3 chokepoint hooks: addMessage + addCompletionMessage + addActionMessage; plan target >= 4 met) |
| `grep -c "_messageLogDebouncer" extension/ui/sidepanel.js` | 10 (var declaration + boot init + beforeunload usage + onRemoved cancel + _persistMessage schedule call + sundry typeof guards; plan target >= 5 met) |
| `grep -c "FSBSidepanelMessageLog.createDebouncer" extension/ui/sidepanel.js` | 2 (1 typeof guard + 1 actual call; both inside boot init block per defensive defense-in-depth) |
| `grep -c "FSBSidepanelMessageLog.appendMessage" extension/ui/sidepanel.js` | 1 (inside _flushMessageLog) |
| `grep -c "window.addEventListener('beforeunload'" extension/ui/sidepanel.js` | 1 (inside boot init block) |
| `grep -c "FSBSidepanelMessageLog.dropConversationMessages" extension/ui/sidepanel.js` | 1 (inside chrome.tabs.onRemoved EC-05 defense) |
| Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js` byte-frozen | UNCHANGED (no git diff) |
| Emoji scan in modified files | CLEAN (no emojis) |
| `addMessage` signature extended | YES -- `function addMessage(text, type = 'system', kind)` |
| `addActionMessage` persistence BEFORE the showSidepanelProgressEnabled guard | YES -- `_persistMessage('assistant', text, 'tool')` fires before the `if (!showSidepanelProgressEnabled) return;` guard |

## Decisions Made

- **Clear-and-replace debounce locked at the createDebouncer factory layer (Plan 12-00); Plan 12-02 consumer code does not need to re-implement.** Every `_messageLogDebouncer.schedule(convId, cb)` call clears the prior timer + replaces with a fresh 200ms timer. Verified via Part 3.3 + 3.4 (1st schedule + 100ms wait + 2nd schedule + 199ms wait shows 0 fires; only the 2nd callback fires after another 2ms).
- **In-memory buffer is per-convId Map keyed by conversationId.** Each addMessage append pushes to the buffer immediately (read consistency within the debounce window). On flush, the buffer is snapshotted + cleared in place; the snapshot is iterated through `appendMessage` (which handles LRU + idempotent envelope grow). If a concurrent write arrives during the await on the storage I/O, the new entries go into the cleared buffer and a new schedule fires for them on the next debounce window. Failure resurrects the snapshot (prepending if new entries arrived).
- **EC-05 resurrection-after-drop defense ordered: resolve-before-drop -> cancel debouncer -> clear buffer -> drop envelope -> persist.** Cancelling the debouncer BEFORE the envelope drop ensures the would-have-fired 200ms timer cannot re-add the just-evicted entry. The smoke (Part 4.8) exercises the scenario where a schedule fires + is then cancelled before the envelope drop; the callback never runs and the envelope stays clean.
- **Persistence write-through fires AFTER DOM render at addMessage + addCompletionMessage** (after the existing `scrollToBottom()` call). This ensures storage failures NEVER block DOM render -- the user sees their message instantly; persistence is best-effort.
- **Persistence write-through fires BEFORE the showSidepanelProgressEnabled guard at addActionMessage.** This is the CONTEXT D-10 contract: "every progress message that lands in the DOM via addMessage MUST also land in fsbConversationMessages." Plan 12-03 will flip the default to true so DOM render is also unconditional; meanwhile the persistence layer is already unconditional. Smoke Part 3 + 4 exercise the debouncer + appendMessage pipeline directly; the chokepoint integration is verified by inspecting the source (grep counts above).
- **addMessage signature is backward compatible.** Existing 60+ call sites continue to pass 1-2 args (text, type). The optional 3rd `kind` parameter is consumed by Plan 12-03's autopilot listener path (which will pass `kind='tool'` for `tool_executed` events). The kind is derived from `type` when not supplied (`'error'` -> `'error'`; `'action'` -> `'tool'`; else `'text'`) so all existing call sites get correct kind tags automatically.
- **Plan verify command target of `FSBSidepanelMessageLog.createDebouncer` = 1 was prose; actual returns 2 (typeof guard + call).** Both occurrences are inside the boot init block; the typeof guard is the defensive defense-in-depth pattern that script-tag load order failures degrade gracefully. The verification command in `<verification>` step 8 was an approximate target; the +1 typeof guard is a beneficial Rule 2 defensive idiom and does not violate any plan invariant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Smoke Part 3.9 timing comment + assertion mismatch on burst-flush**
- **Found during:** Task 3 (smoke run after Parts 3 + 4 filled)
- **Issue:** Initial Part 3.9 wrote "burst of 5 schedules in 100ms still pending at 199ms-after-last" and called `advance(199)` after the loop. But the loop body was `schedule(); advance(20);` over 5 iterations, so the LAST schedule fires at `fakeNow=80` (not `fakeNow=100` as the comment implied). The `advance(199)` call brought time to `fakeNow=299`, which is 219ms after the last schedule -- past the 200ms debounce deadline; the timer had already fired, so `fires3 === 1` and the `fires3 === 0` assertion FAILED.
- **Fix:** Adjusted the advance amount to `advance(179)` so fakeNow reaches 279 = 80 + 199 = exactly 199ms after the last schedule. Then `advance(2)` brings fakeNow to 281 = 80 + 201 = past the deadline; the timer fires. Updated the assertion message to reference "last-schedule" instead of "last" (semantically clearer about which time anchor we're measuring from). The comment was rewritten to spell out the loop arithmetic.
- **Files modified:** `tests/sidepanel-message-log-smoke.test.js` (Part 3.9 fake-timer arithmetic + comment, ~5 lines diff)
- **Verification:** Re-ran smoke; Part 3.9 + 3.10 both PASS. Cumulative 40 PASS / 0 FAIL.
- **Committed in:** `cb2dd11b` (Task 3 commit; fix applied before commit landed)

---

**Total deviations:** 1 auto-fixed (1 test-arithmetic bug -- burst-flush timing window)
**Impact on plan:** Zero production code change; only test-arithmetic correctness fix. Plan executed as written aside from the trivial timing-comment correction logged above.

## Authentication Gates

None - this plan is pure code; no external services touched.

## Issues Encountered

None - plan executed exactly as written aside from the Part 3.9 timing-comment fix logged in Deviations.

## User Setup Required

None - no external service configuration required.

## Carryforward Note for Plans 12-03 + 12-04

Plan 12-02 closes the WRITE-THROUGH half of FINT-23. Combined with Plan 12-01's READ path (3-tier hydrate), FINT-23 is now FULLY SHIPPED. Plans 12-03 + 12-04 build on this baseline:

- **Plan 12-03 (Wave 3 -- FINT-22):** Live progress wiring fix. Flip `showSidepanelProgress` default from `false` to `true` in 3 sites (extension/ui/options.js:24 + extension/ui/sidepanel.js:17 + extension/ui/sidepanel.js:813 area). Add `addMessage(content, 'assistant', kind)` calls in the inbound listener for `iteration_complete` and `tool_executed` sessionStateEvent cases (kind='progress' and kind='tool' respectively). Because Plan 12-02 already routes `addMessage` write-through to the persistence layer, those new listener calls AUTOMATICALLY persist -- no additional persistence wiring required. Plan 12-03 fills smoke Part 5.
- **Plan 12-04 (Wave 4 -- FINT-24 + ceremony):** Per-tab `chrome.sidePanel.setOptions` + `open` in autopilot bind path. INV-04 + INV-06 byte-freeze regression smoke. REQUIREMENTS.md FINT-22/23/24 traceability + LATTICE-PIN.md Phase 12 row + MILESTONE-AUDIT.md status_history. Plan 12-04 fills smoke Parts 6 + 7 + 8.

The Plan 12-02 chokepoint hook ensures Plan 12-03's new listener calls automatically persist -- this is the leverage from the "single point of write-through" design. If Plan 12-03 needs to fire a NEW addMessage call from a new code path, it just calls `addMessage(content, type, kind)` and persistence happens for free.

## Next Phase Readiness

- Ready for Plan 12-03 (Wave 3 live progress wiring fix). Plan 12-02 prerequisites met:
  - `addMessage` signature accepts optional `kind` parameter -- Plan 12-03 listener calls can specify `kind='progress'` for `iteration_complete` and `kind='tool'` for `tool_executed`.
  - `_persistMessage` write-through fires unconditionally for addActionMessage (CONTEXT D-10) -- existing tool_executed addActionMessage calls already persist.
  - Beforeunload force-flush is registered -- sidepanel close window is bounded to 200ms loss.
  - EC-05 resurrection-after-drop is defended -- chrome.tabs.onRemoved + debouncer cooperate cleanly.
- Sidecar API contract (Plan 12-00) consumed correctly: `STORAGE_KEY` + `DEFAULT_DEBOUNCE_MS` + `createDebouncer` + `appendMessage` + `dropConversationMessages` + `emptyEnvelope` + `isValidEnvelope`. No churn required for Plans 12-03 + 12-04.
- Phase 11 sibling smoke 41 PASS / 0 FAIL byte-unchanged (Plan 12-02 invariant preserved).
- Cumulative smoke 40 PASS / 0 FAIL; Plan 12-03 will add Part 5 (>= 6 PASS) -> cumulative >= 46 expected post-Wave 3.

## Self-Check: PASSED

- File check: `extension/ui/sidepanel.js` MODIFIED (module-scope vars + _persistMessage + _flushMessageLog + boot init + beforeunload + 3 chokepoint hooks + onRemoved EC-05 defense).
- File check: `tests/sidepanel-message-log-smoke.test.js` MODIFIED (Parts 3 + 4 filled with 20 real PASS).
- Commit check: `c44344b1` FOUND (Task 1).
- Commit check: `2925f925` FOUND (Task 2).
- Commit check: `cb2dd11b` FOUND (Task 3).
- Smoke check: `node tests/sidepanel-message-log-smoke.test.js` exits 0 with 40 PASS / 0 FAIL (>= 28 cumulative target met by +12).
- Full chain: `npm test` exits 0 end-to-end; Phase 11 sibling smoke 41 PASS unchanged.
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` = 8 (BYTE-FROZEN).
- INV-06: `cd lattice && git rev-parse HEAD` = `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED).
- Lattice porcelain: `git status --porcelain lattice/` empty.
- _persistMessage occurrences in sidepanel.js: 4 (1 def + 3 chokepoint hooks).
- _messageLogDebouncer occurrences in sidepanel.js: 10.
- FSBSidepanelMessageLog.createDebouncer occurrences: 2 (typeof guard + call).
- FSBSidepanelMessageLog.appendMessage occurrences: 1 (inside _flushMessageLog).
- window.addEventListener('beforeunload' occurrences: 1.
- FSBSidepanelMessageLog.dropConversationMessages occurrences: 1 (inside onRemoved EC-05 defense).
- Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js`: byte-unchanged (no git diff).
- No emojis in any modified file.

---
*Phase: 12-side-panel-follows-automation*
*Completed: 2026-06-08*
