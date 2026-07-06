---
phase: 12-side-panel-follows-automation
plan: 04
subsystem: background-sw
tags: [sidepanel, chrome-sidepanel-api, user-gesture, auto-open, ceremony, inv-byte-freeze, wave-4, fint-24]

# Dependency graph
requires:
  - phase: 12-side-panel-follows-automation
    plan: 03
    provides: FINT-22 default flip showSidepanelProgress + case 'iteration_complete' unconditional _persistMessage; cumulative smoke 51 PASS / 0 FAIL baseline
provides:
  - extension/background.js handleStartAutomation gains chrome.sidePanel.setOptions + open as FIRST 2 awaits in best-effort try/catch (FINT-24)
  - REQUIREMENTS.md FINT-22/23/24 narrative + 3 traceability rows + Total v1 footer 44 -> 47 + Last updated 2026-06-08
  - LATTICE-PIN.md Phase 12 row appended; current_lattice_sha UNCHANGED at e95067bfa87ed1b75838fc3b3ef217a3b01acbd3; last_updated 2026-06-08
  - v0.10.0-MILESTONE-AUDIT.md status_history phase_12_shipped entry + last_revised 2026-06-08 (status STAYS in_progress per CONTEXT D-26)
  - NEW 12-VERIFICATION.md with status: human_needed + UAT-12 6-sub-assertion procedure (consolidated UAT-08+09+10+11+12)
  - Smoke Parts 6 + 7 + 8 filled with 13 real PASS (5 + 4 + 4); cumulative 61 PASS / 0 FAIL across 8 Parts
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gesture-window-first await ordering: chrome.sidePanel.setOptions + open MUST be the FIRST awaits in the message handler so the user-gesture context (sendBtn click in sidepanel.js -> chrome.runtime.sendMessage round-trip) is preserved per Chrome MV3 contract (RESEARCH Section 7.1 + Pitfall 2)"
    - "Best-effort try/catch around platform-API calls: sidePanel.setOptions + open failure does NOT abort automation; catch logs structured console.warn so failures surface to chrome://extensions service worker console (CONTEXT D-13)"
    - "Comment-token grep-collision defense: comment text rewritten to avoid the literal substring 'chrome.sidePanel.open' inside the comment block so first-match indexOf assertions in smoke + Task 1 verify command land on the actual call site, not the comment (mirrors Plan 12-03 Deviation 2 + Plan 12-00 sidecar precedents)"
    - "Smoke Part 6.4 ordering check uses 'await chrome.sidePanel.setOptions' / 'await chrome.sidePanel.open(' literals (not bare 'chrome.sidePanel.setOptions') to keep the assertion robust against future comment rewordings"

key-files:
  created:
    - .planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md
    - .planning/phases/12-side-panel-follows-automation/12-04-SUMMARY.md
  modified:
    - extension/background.js
    - tests/sidepanel-message-log-smoke.test.js
    - .planning/REQUIREMENTS.md
    - .planning/LATTICE-PIN.md
    - .planning/v0.10.0-MILESTONE-AUDIT.md

key-decisions:
  - "chrome.sidePanel block inserted IMMEDIATELY AFTER let targetTabId resolution + IMMEDIATELY BEFORE conversationSessions.has reactivation check per CONTEXT D-13 + RESEARCH Section 7.6 recipe"
  - "Block gated on (targetTabId && typeof chrome.sidePanel !== 'undefined') for graceful degradation on Chrome <114 + null tabId edge cases"
  - "Existing chrome.sidePanel.open({windowId: tab.windowId}) at background.js:12979 + chrome.sidePanel.setPanelBehavior at background.js:13229 BYTE-FROZEN -- the Plan 12-04 block is ADDITIVE"
  - "UAT-12 procedure DEFERRED to consolidated UAT-08+09+10+11+12 single Chrome MV3 reload session per CONTEXT D-26 + user directive carryforward 'skip UAT to last'"
  - "Comment in production code reworded from 'chrome.sidePanel.open per Chrome MV3 user-gesture contract' to 'the panel-open call per Chrome MV3 user-gesture contract' (Rule 1 fix avoiding comment-substring grep-collision with Task 1 verify command + Part 6.4 ordering assertion)"

patterns-established:
  - "Pattern 1: chrome platform-API auto-open calls MUST be best-effort wrapped in try/catch + gated on typeof feature-detection so missing API on older Chrome versions degrades gracefully"
  - "Pattern 2: chrome.sidePanel.open + setOptions MUST be the FIRST awaits in a user-gesture-preserving handler -- placing them after any other await voids the gesture window per Chrome MV3 contract (Pitfall 2)"
  - "Pattern 3: smoke ordering assertions on literal strings should prefix the literal with 'await' or otherwise scope to the call site to defeat comment-text false positives"

requirements-completed:
  - FINT-24 (per-tab sidepanel auto-open binding)

# Metrics
duration: 9 min
completed: 2026-06-08
---

# Phase 12 Plan 04: FINT-24 sidepanel auto-open + ceremony + INV byte-freeze regression Summary

**chrome.sidePanel.setOptions + open inserted as FIRST 2 awaits in handleStartAutomation per RESEARCH Section 7.6 recipe (best-effort try/catch gated on targetTabId + typeof chrome.sidePanel) + ceremony closure (REQUIREMENTS.md FINT-22/23/24 narrative + traceability + Total v1 44 -> 47 + Last updated 2026-06-08; LATTICE-PIN.md Phase 12 row appended SHA UNCHANGED; v0.10.0-MILESTONE-AUDIT.md status_history phase_12_shipped + last_revised 2026-06-08 status STAYS in_progress; new 12-VERIFICATION.md status human_needed UAT-12 6-sub-assertion procedure deferred to consolidated UAT-08+09+10+11+12) + smoke Parts 6+7+8 filled with 13 real PASS (5 + 4 + 4) cumulative 61 PASS / 0 FAIL across 8 Parts (>= 45 target exceeded by +16). FINT-24 SHIPPED. Phase 12 closure complete.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-08T08:23:57Z
- **Completed:** 2026-06-08T08:32:47Z
- **Tasks:** 3
- **Files modified:** 5 (1 new VERIFICATION.md + 4 ceremony + 1 background.js + 1 smoke)

## Accomplishments

- `extension/background.js` `handleStartAutomation(request, sender, sendResponse)` gains a new best-effort try/catch block inserted IMMEDIATELY AFTER `let targetTabId = tabId || sender.tab?.id;` (line 6424) and IMMEDIATELY BEFORE the existing `// Check for existing conversation session for follow-up reuse` comment (line 6426 pre-insert). The block is gated `if (targetTabId && typeof chrome.sidePanel !== 'undefined') { try { ... } catch (sidePanelErr) { ... } }`. Inside the try: `await chrome.sidePanel.setOptions({ tabId: targetTabId, enabled: true, path: 'ui/sidepanel.html' })` then `await chrome.sidePanel.open({ tabId: targetTabId })`. Inside the catch: `console.warn('[FSB] Phase 12 FINT-24 sidePanel auto-open failed', { tabId: targetTabId, error: sidePanelErr && sidePanelErr.message })`. The block carries a 10-line header comment citing FINT-24 + Plan 12-04 + RESEARCH Section 7.1 + Pitfall 2 + CONTEXT D-13.
- The two new awaits are the FIRST awaits in the handler body per RESEARCH Section 7.6 + Pitfall 2: the user-gesture context (sendBtn click in sidepanel.js -> chrome.runtime.sendMessage round-trip) is preserved through to chrome.sidePanel.open ONLY when no other await intervenes between the gesture origin and the open call. Placing the block AFTER `let targetTabId = ...` + BEFORE the `conversationSessions.has` reactivation path (which begins with the `chrome.tabs.sendMessage` await at line 6463 in the reactivation branch + the `chrome.tabs.get` await at line 6490 in the main branch) is the structurally required position.
- The existing `chrome.sidePanel.open({windowId: tab.windowId})` at line 12979 + `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})` at line 13229 BYTE-FROZEN. The Plan 12-04 block is purely additive.
- `.planning/REQUIREMENTS.md`: 3 new narrative entries inserted after FINT-21 (`- [x] **FINT-22 -- DONE 2026-06-08 (Phase 12 Plan 12-03)** ...`, `- [x] **FINT-23 -- DONE 2026-06-08 (Phase 12 Plans 12-00 + 12-01 + 12-02)** ...`, `- [x] **FINT-24 -- DONE 2026-06-08 (Phase 12 Plan 12-04)** ...`); 3 traceability rows inserted after the FINT-21 row; Total v1 footer flipped 44 -> 47 with FINT-22/23/24 transition narrative; Last updated header bumped to 2026-06-08 with full Phase 12 closure narrative + preserved Phase 11 verbatim after the new prefix.
- `.planning/LATTICE-PIN.md`: Frontmatter `last_updated` bumped 2026-06-07 -> 2026-06-08; `current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` per CONTEXT D-21 + INV-06; Phase 12 row appended to the Per-FSB-Phase Log table after the existing Phase 11 row.
- `.planning/v0.10.0-MILESTONE-AUDIT.md`: Frontmatter `last_revised` bumped 2026-06-07 -> 2026-06-08; `phase_12_shipped` entry appended to `status_history:` IMMEDIATELY AFTER the existing `phase_11_shipped` entry (multi-line YAML literal block scalar mirroring Phase 8/9/10/11 format); milestone `status` STAYS `in_progress` per CONTEXT D-26 (UAT-12 + UAT-08+09+10+11 consolidated UAT pending user execution).
- New `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` (66 lines) with frontmatter `status: human_needed` + `verdict: human_needed` + `inv_04_baseline: 8` + `inv_06_baseline: e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Body contains Automated Verification table (8 gates all PASS) + Human Verification (UAT-12) section with 6-sub-assertion table (a-f covering: chrome.sidePanel auto-opens on Run click; live progress messages render during run; close+reopen restores chat from new store; tab switch swaps view; close tab drops envelope entry + log entry; INV-04/06 byte-freeze automated check) + UAT-12 verdict reporting protocol + UAT-12 Execution Record placeholder.
- `tests/sidepanel-message-log-smoke.test.js` Parts 6 + 7 + 8 placeholders REPLACED with 13 real PASS (5 + 4 + 4):
  - **Part 6 (5 PASS):** 6.1 handleStartAutomation found in background.js; 6.2 setOptions called with tabId + enabled true + path; 6.3 chrome.sidePanel.open called with tabId; 6.4 setOptions BEFORE open via `await`-prefixed indexOf (gesture-window order); 6.5 sidePanel block sits AFTER targetTabId + BEFORE reactivation (gesture preservation per RESEARCH Section 7.1 + Pitfall 2).
  - **Part 7 (4 PASS):** 7.1 setOptions + open wrapped in try/catch with sidePanelErr identifier; 7.2 catch logs structured console.warn (not error throw); 7.3 block gated on `typeof chrome.sidePanel !== 'undefined'`; 7.4 block ALSO gated on targetTabId truthy.
  - **Part 8 (4 PASS):** 8.1 INV-04 `grep -c "setTimeout" extension/ai/agent-loop.js === 8`; 8.2 4 `session._nextIterationTimer = setTimeout` iterator patterns intact; 8.3 INV-04 Phase-12 token awk-scan empty inside ALL setTimeout lambda bodies (paren-depth walker checks for FSBSidepanelMessageLog | _persistMessage | _flushMessageLog | _messageLogDebouncer | fsbConversationMessages | chrome.sidePanel.open | chrome.sidePanel.setOptions); 8.4 INV-06 LATTICE-PIN.md `current_lattice_sha` literal byte-frozen at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`.
- Cumulative smoke after Wave 4: **61 PASS / 0 FAIL** (target was `>= 45`; exceeded by +16).
- `npm test` end-to-end chain green; exit 0. Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js` BYTE-FROZEN (zero git diff verified).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add chrome.sidePanel.setOptions + open as FIRST 2 awaits in handleStartAutomation** - `29b91889` (feat)
2. **Task 2: Ceremony closure -- REQUIREMENTS + LATTICE-PIN + MILESTONE-AUDIT + 12-VERIFICATION** - `0e9516d7` (docs)
3. **Task 3: Fill smoke Parts 6 + 7 + 8 with FINT-24 + INV byte-freeze regression** - `2094dfd5` (test)

**Plan metadata:** (this SUMMARY commit follows below)

## Files Created/Modified

- `extension/background.js` (MODIFIED; +26 / -0 lines) -- Insert best-effort try/catch block in handleStartAutomation IMMEDIATELY AFTER `let targetTabId = ...` (line 6424) and BEFORE the existing `// Check for existing conversation session for follow-up reuse` comment. Block contains 10-line header comment + 2 chrome.sidePanel awaits + catch console.warn.
- `.planning/REQUIREMENTS.md` (MODIFIED; +7 / -2 lines) -- 3 narrative entries appended after FINT-21 (FINT-22 + FINT-23 + FINT-24); 3 traceability rows appended after FINT-21 row (FINT-22 + FINT-23 + FINT-24); Total v1 footer flipped 44 -> 47 with closure narrative; Last updated header bumped to 2026-06-08 with Phase 12 closure narrative + preserved Phase 11 verbatim.
- `.planning/LATTICE-PIN.md` (MODIFIED; +1 / -1 lines) -- Frontmatter `last_updated` bumped 2026-06-07 -> 2026-06-08; Phase 12 row appended to Per-FSB-Phase Log table; `current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`.
- `.planning/v0.10.0-MILESTONE-AUDIT.md` (MODIFIED; +3 / -1 lines) -- Frontmatter `last_revised` bumped 2026-06-07 -> 2026-06-08; `phase_12_shipped` status_history entry appended after phase_11_shipped; milestone `status` STAYS `in_progress`.
- `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` (NEW; 66 lines) -- Frontmatter `status: human_needed` + Automated Verification table (8 gates) + Human Verification UAT-12 6-sub-assertion table (a-f) + verdict reporting protocol + UAT-12 Execution Record placeholder.
- `tests/sidepanel-message-log-smoke.test.js` (MODIFIED; +90 / -6 lines) -- Parts 6 + 7 + 8 placeholders REPLACED with 13 real PASS using static-text grep of background.js handler body + paren-depth walker for setTimeout lambda body scan + LATTICE-PIN.md frontmatter SHA literal check.

## Diff summary

| File | Lines added | Lines removed |
|------|-------------|---------------|
| `extension/background.js` | 26 | 0 |
| `.planning/REQUIREMENTS.md` | 7 | 2 |
| `.planning/LATTICE-PIN.md` | 1 | 1 |
| `.planning/v0.10.0-MILESTONE-AUDIT.md` | 3 | 1 |
| `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` | 66 | 0 |
| `tests/sidepanel-message-log-smoke.test.js` | 90 | 6 |

## Verification Results

| Check | Result |
|-------|--------|
| `node tests/sidepanel-message-log-smoke.test.js` | exit 0; **61 PASS / 0 FAIL** (>= 45 cumulative target exceeded by +16) |
| `npm test` end-to-end | exit 0; entire chain green; Phase 11 sibling `sidepanel-tab-aware-smoke.test.js` reports 39 PASS unchanged |
| `grep -c "setTimeout" extension/ai/agent-loop.js` (INV-04 byte-freeze) | 8 (UNCHANGED; Phase 7+8+9+10+11 baseline carryforward) |
| `grep -c "session._nextIterationTimer = setTimeout" extension/ai/agent-loop.js` (INV-04 iterator) | 4 (UNCHANGED) |
| `cd lattice && git rev-parse HEAD` (INV-06 byte-freeze) | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED; zero Lattice-side commits) |
| `git status --porcelain lattice/` (Lattice cleanliness) | empty |
| `grep -c "chrome.sidePanel.setOptions" extension/background.js` | 1 (new Plan 12-04 call; no pre-existing references modified) |
| `grep -c "chrome.sidePanel.open" extension/background.js` | 2 (Plan 12-04 new call + existing line 12979 windowId open BYTE-FROZEN) |
| `grep -c "chrome.sidePanel.setPanelBehavior" extension/background.js` | 1 (existing line 13229 BYTE-FROZEN) |
| `.planning/REQUIREMENTS.md` FINT-22/23/24 narratives | 3 entries present; all DONE 2026-06-08 |
| `.planning/REQUIREMENTS.md` FINT-22/23/24 traceability rows | 3 rows present; all Complete |
| `.planning/REQUIREMENTS.md` Total v1 footer | `47/47 Complete` present |
| `.planning/REQUIREMENTS.md` Last updated header | `2026-06-08` present |
| `.planning/LATTICE-PIN.md` frontmatter `last_updated` | `2026-06-08` |
| `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED) |
| `.planning/LATTICE-PIN.md` Phase 12 row | present in table (`12 (side panel follows automation)`) |
| `.planning/v0.10.0-MILESTONE-AUDIT.md` frontmatter `last_revised` | `2026-06-08` |
| `.planning/v0.10.0-MILESTONE-AUDIT.md` frontmatter `status` | `in_progress` (UNCHANGED per CONTEXT D-26) |
| `.planning/v0.10.0-MILESTONE-AUDIT.md` `phase_12_shipped` entry | present in status_history |
| `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` exists | YES; status: human_needed + UAT-12 procedure with 6 sub-assertions |
| Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js` byte-frozen | UNCHANGED (no git diff) |
| Emoji scan in modified files | CLEAN (no emojis anywhere) |
| Task 1 automated verify | PASS Task 1 |
| Task 2 automated verify | PASS Task 2 |
| Task 3 automated verify | `SMOKE OK (61 PASS / 0 FAIL) + INV-04 (8) + INV-06 (e95067bfa87ed1b75838fc3b3ef217a3b01acbd3)` |

## Decisions Made

- **chrome.sidePanel.setOptions + open positioned as FIRST 2 awaits in handleStartAutomation.** RESEARCH Section 7.1 + Pitfall 2 specifies that Chrome's MV3 user-gesture window for `chrome.sidePanel.open({tabId})` decays through long await chains; the gesture originates from the sendBtn click in `extension/ui/sidepanel.js` and is preserved through the `chrome.runtime.sendMessage` round-trip; calling the two new awaits AFTER any other await in the handler would void the gesture window. Placement immediately after `let targetTabId = ...` (line 6424) and immediately before the existing `conversationSessions.has` reactivation path (line 6427 pre-insert) is the structurally required position.
- **Block gated on `targetTabId && typeof chrome.sidePanel !== 'undefined'`.** Two guards: (a) `targetTabId` truthy prevents calling `setOptions` with null tabId (e.g., when neither `request.tabId` nor `sender.tab?.id` resolved); (b) `typeof chrome.sidePanel !== 'undefined'` provides graceful degradation on Chrome <114 (where the chrome.sidePanel API is undefined; rare per RESEARCH Section 14). The Chrome <114 case is essentially a no-op rather than a thrown error.
- **Best-effort try/catch wrapping both awaits per CONTEXT D-13.** sidePanel API failures (e.g., quota exceeded, permission revoked, tab destroyed mid-call) MUST NOT abort the automation; the catch logs a structured `console.warn` so failures surface in the chrome://extensions service worker console for debugging without escalating to the outer try in handleStartAutomation (which would route to the existing `sendResponse({success: false, error: ...})` failure path).
- **Existing `chrome.sidePanel.open({windowId})` at background.js:12979 + `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})` at background.js:13229 BYTE-FROZEN.** Per RESEARCH Pitfall 4 + Plan 12-04 plan section: these are pre-Phase-12 calls (popup-driven open via windowId + global setPanelBehavior default). The Plan 12-04 block is purely ADDITIVE — does NOT remove the global default; sidepanel stays available everywhere; auto-opens specifically on autopilot bind per CONTEXT D-14.
- **NO `chrome.sidePanel.close` call added anywhere.** Per CONTEXT D-14 stay-open-with-swap: tab switching to a non-automation tab does NOT auto-close the sidepanel; the existing Phase 11 chrome.tabs.onActivated handler in sidepanel.js performs the view swap. `chrome.sidePanel.close` also requires user-gesture context which is not present on tab switch, so the call would silently fail anyway.
- **Comment in production code reworded to avoid grep-collision (Rule 1 - Bug).** The original comment text contained the literal substring `chrome.sidePanel.open per Chrome MV3 user-gesture contract`. Task 1's verify command uses `indexOf('chrome.sidePanel.open')` which finds the comment occurrence FIRST (byte 572) before the actual call site (byte 1071). Same false-positive pattern as Plan 12-03 Deviation 2 + Plan 12-00 sidecar JSDoc reword. The comment was rewritten to `the panel-open call per Chrome MV3 user-gesture contract` -- semantically equivalent (the call IS the panel-open call) with zero `chrome.sidePanel.open` substring in the comment body. Smoke Part 6.4 ALSO uses the `await` prefix on the indexOf scan so the assertion is robust against future comment-text drift.
- **Smoke Part 6.4 uses `await chrome.sidePanel.setOptions` / `await chrome.sidePanel.open(` indexOf** (NOT bare `chrome.sidePanel.setOptions` / `chrome.sidePanel.open`) so the assertion is robust against:
  - Comment text false-positives (the `await` prefix is JS code, not comment prose).
  - Future scaffolding that might reference the same API in JSDoc or string literals.
- **UAT-12 procedure DEFERRED to consolidated UAT-08+09+10+11+12.** Per CONTEXT D-26 + user directive carryforward "skip UAT to last": the 6-sub-assertion UAT-12 procedure is documented in 12-VERIFICATION.md Human Verification section but is bundled into the single Chrome MV3 reload session that also covers Phase 8 step.transition emission + Phase 9 SurvivabilityAdapter MV3 SW eviction resume + Phase 10 MCP-philosophy parity + Phase 11 tab-aware side panel surface. Verifier emits `human_needed`; milestone `status` STAYS `in_progress` until consolidated UAT verdict captured.
- **Cumulative smoke 61 PASS vs >= 45 target.** Wave 0 baseline was 8 PASS; Plan 12-01 added 14 (Part 1+2 = 16 - 2 placeholders = 14 net) to 22; Plan 12-02 added 18 (Parts 3+4 = 20 - 2 placeholders = 18 net) to 40; Plan 12-03 added 11 (Part 5 = 12 - 1 placeholder = 11 net) to 51; Plan 12-04 added 10 (Parts 6+7+8 = 13 PASS - 3 placeholders = 10 net) to 61. The plan target of >= 45 was the cumulative floor; actual delivery exceeds by +16.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment in handleStartAutomation patch contained `chrome.sidePanel.open` token causing Task 1 verify-command false-FAIL**
- **Found during:** Task 1 verify step (`<verify>` automated check after initial edit landed)
- **Issue:** The Task 1 verify command uses `body.indexOf('chrome.sidePanel.open')` to assert that the actual `chrome.sidePanel.open` call site appears AFTER the `chrome.sidePanel.setOptions` call site. The original header comment for the new block contained the literal phrase `through to chrome.sidePanel.open per Chrome MV3 user-gesture contract` at byte ~572 of the matched handler body. The string-indexOf heuristic found `chrome.sidePanel.open` at byte 572 (in the comment), BEFORE the `chrome.sidePanel.setOptions` actual call at byte 1071, incorrectly flagging `setOptions not before open` even though the actual code ordering was correct.
- **Fix:** Reworded the comment from `through to chrome.sidePanel.open per Chrome MV3 user-gesture contract` to `through to the panel-open call per Chrome MV3 user-gesture contract`. Semantically equivalent (the call IS the panel-open call); no production behavior change. The reword eliminates the regex-token collision so the Task 1 verify command + smoke Part 6.4 ordering assertion both find the actual call site as the first occurrence.
- **Files modified:** `extension/background.js` (10-line comment block reworded; 0 lines of executable code changed)
- **Verification:** Re-ran Task 1 verify command; `PASS Task 1`. Smoke Part 6.4 (which uses the more robust `await chrome.sidePanel.setOptions` / `await chrome.sidePanel.open(` indexOf) PASS regardless.
- **Committed in:** `29b91889` (Task 1 commit; reword applied before commit landed)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 comment-collision fix; same pattern as Plan 12-00 sidecar JSDoc reword + Plan 12-03 case comment reword)
**Impact on plan:** Cosmetic comment rewording; production code ordering is correct; smoke + verify command both more robust against future comment drift via `await`-prefixed indexOf. Plan executed substantively as written.

## Authentication Gates

None - this plan is pure code + docs; no external services touched.

## Issues Encountered

None - plan executed exactly as written aside from the trivial comment reword logged in Deviations.

## User Setup Required

None - no external service configuration required. UAT-12 (consolidated UAT-08+09+10+11+12) requires user-driven Chrome MV3 reload session per CONTEXT D-26 deferral.

## Phase 12 Closure Narrative

Plan 12-04 closes Phase 12 — `side panel follows automation`. With Plan 12-04 shipped:

- **FINT-22 (live progress wiring)** — SHIPPED via Plan 12-03 (default flip showSidepanelProgress false -> true at 4 sites + case 'iteration_complete' unconditional _persistMessage).
- **FINT-23 (per-conversation message log + hydrate repoint)** — SHIPPED via Plans 12-00 (sidecar + smoke scaffold) + 12-01 (3-tier hydrate Tier 1 wins) + 12-02 (addMessage write-through chokepoint + boot debouncer + beforeunload flushAll + EC-05 cancel-on-drop).
- **FINT-24 (per-tab sidepanel auto-open binding)** — SHIPPED via Plan 12-04 (chrome.sidePanel.setOptions + open as FIRST 2 awaits in handleStartAutomation; best-effort try/catch).

Cumulative Phase 12 user-journey now delivers:
1. User clicks Run in sidepanel on Tab A — chrome.sidePanel.setOptions + open fire in user-gesture window; sidepanel surface confirmed open on Tab A.
2. Live progress events (iteration_complete + tool_executed) fire from `extension/ai/agent-loop.js` via the existing SW broadcaster; Plan 12-03 default flip means DOM render is enabled by default; Plan 12-02 chokepoint persists every message to `fsbConversationMessages` via the 200ms debouncer.
3. User closes sidepanel mid-run; reopens on same tab — Plan 12-01 Tier 1 hydrate restores ALL messages from `fsbConversationMessages` (chronological order; role + kind preserved; rendered via Pitfall 3 chokepoint defeat `renderPersistedMessage`).
4. User switches to Tab B — Phase 11 `chrome.tabs.onActivated` + `swapToTabConversation` swap the view (sidepanel STAYS open per CONTEXT D-14 stay-open-with-swap); chip + lockout + chat surface reflect Tab B.
5. User closes Tab A while it had a running task — Phase 11 `chrome.tabs.onRemoved` drops the per-tab envelope entry; Plan 12-02 EC-05 defense cancels the debouncer + drops the message-log entry; opening a new tab shows fresh welcome with no leftover progress messages.

Phase 11 + Phase 12 together deliver the full tab-aware + per-conversation-history + side-panel-follows-automation UX surface that the 2026-06-08 UAT-FINAL feedback called out.

UAT-12 + UAT-08 + UAT-09 + UAT-10 + UAT-11 — all five DEFERRED to consolidated end-of-milestone single Chrome MV3 reload session per CONTEXT D-26 + user directive carryforward "skip UAT to last". Milestone v0.10.0 status STAYS `in_progress` until consolidated UAT verdict captured.

INV-04 BYTE-FROZEN throughout Phase 12 — `grep -c "setTimeout" extension/ai/agent-loop.js === 8` (Phase 7+8+9+10+11 baseline carryforward); 4 `session._nextIterationTimer = setTimeout` iterator patterns intact; awk-scan empty for Phase-12 tokens inside any setTimeout lambda body.

INV-06 BYTE-FROZEN throughout Phase 12 — `current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 HEAD); zero Lattice-side commits per 12-RESEARCH Section 2 binary INV-06 verdict (chrome.storage.local + chrome.sidePanel + chrome.runtime.sendMessage are all Chrome host APIs not Lattice contracts).

## Self-Check: PASSED

- File check: `extension/background.js` MODIFIED (handleStartAutomation handler body extended with chrome.sidePanel block + 10-line comment header).
- File check: `.planning/REQUIREMENTS.md` MODIFIED (FINT-22/23/24 narratives + traceability + footer + Last updated).
- File check: `.planning/LATTICE-PIN.md` MODIFIED (frontmatter last_updated + Phase 12 row; SHA unchanged).
- File check: `.planning/v0.10.0-MILESTONE-AUDIT.md` MODIFIED (frontmatter last_revised + phase_12_shipped entry; status unchanged).
- File check: `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` CREATED (66 lines).
- File check: `tests/sidepanel-message-log-smoke.test.js` MODIFIED (Parts 6+7+8 filled with 13 real PASS).
- File check: `.planning/phases/12-side-panel-follows-automation/12-04-SUMMARY.md` CREATED (this file).
- Commit check: `29b91889` FOUND (Task 1 background.js).
- Commit check: `0e9516d7` FOUND (Task 2 ceremony).
- Commit check: `2094dfd5` FOUND (Task 3 smoke).
- Smoke check: `node tests/sidepanel-message-log-smoke.test.js` exits 0 with 61 PASS / 0 FAIL (>= 45 cumulative target exceeded by +16).
- Full chain: `npm test` exits 0 end-to-end; Phase 11 sibling smoke 39 PASS unchanged.
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` = 8 (BYTE-FROZEN; Phase 7+8+9+10+11 baseline carryforward).
- INV-04: `grep -c "session._nextIterationTimer = setTimeout" extension/ai/agent-loop.js` = 4 (iterator patterns intact).
- INV-04: Phase-12 token awk-scan empty inside ALL setTimeout lambda bodies (smoke Part 8.3 PASS).
- INV-06: `cd lattice && git rev-parse HEAD` = `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UNCHANGED; zero Lattice-side commits).
- INV-06: LATTICE-PIN.md frontmatter `current_lattice_sha` literal byte-frozen (smoke Part 8.4 PASS).
- Lattice porcelain: `git status --porcelain lattice/` empty.
- Existing chrome.sidePanel.open({windowId}) at background.js:12979 + chrome.sidePanel.setPanelBehavior at background.js:13229 BYTE-FROZEN (Task 1 verify command + smoke Parts 6+7 implicitly assert via grep counts).
- Phase 11 sibling smoke `tests/sidepanel-tab-aware-smoke.test.js`: byte-unchanged (no git diff).
- No emojis in any new or modified file.

---
*Phase: 12-side-panel-follows-automation*
*Completed: 2026-06-08*
