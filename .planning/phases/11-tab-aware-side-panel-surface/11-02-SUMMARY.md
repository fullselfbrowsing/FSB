---
phase: 11-tab-aware-side-panel-surface
plan: 02
subsystem: sidepanel
tags: [tab-aware, sidepanel, input-lockout, applyInputLockout, defense-in-depth, runtime-gate, sr-only, aria-describedby, FINT-20, wave-2]

requires:
  - phase: 11-tab-aware-side-panel-surface plan 00
    provides: Wave 0 smoke harness Part 3 + Part 4 placeholders (filled in this plan), chrome mocks, createButtonStub + createDivStub + installDomStub DOM stub helpers, .fsb-owner-chip baseline CSS rule
  - phase: 11-tab-aware-side-panel-surface plan 01
    provides: refreshOwnerChip three-tier label resolution (Tier 1 legacy literal -> Tier 2 lookupClientLabel -> Tier 3 short-prefix) plus FSBOwnerChip.findOwnerInEnvelope + shouldShowOwnerChip reused by _isActiveTabForeignOwned
  - phase: 243-multi-agent-tab-concurrency
    provides: shouldShowOwnerChip + findOwnerInEnvelope pure helpers reused by Plan 11-02 runtime gate; agent-registry envelope shape (fsbAgentRegistry)
provides:
  - extension/ui/sidepanel.css new .fsb-foreign-owned-disabled rule (opacity 0.45 + cursor not-allowed + pointer-events none + user-select none) + .sr-only WAI-ARIA visually-hidden utility
  - extension/ui/sidepanel.html new fsb-lockout-aria-description sr-only span adjacent to chip span (screen-reader description for the 4 controls when locked)
  - extension/ui/sidepanel.js applyInputLockout(foreignOwned) sync helper toggling 4 controls (chatInput contenteditable div + sendBtn + stopBtn + micBtn) + _isActiveTabForeignOwned() async defense-in-depth gate
  - extension/ui/sidepanel.js refreshOwnerChip rewired with applyInputLockout(true) on chip-shown branch + applyInputLockout(false) on chip-hidden branch
  - extension/ui/sidepanel.js handleSendMessage early-return runtime gate against foreign-owned active tab
  - tests/sidepanel-tab-aware-smoke.test.js Part 3 + Part 4 filled (10 real PASS; total smoke 28 PASS / 0 FAIL)
affects: [11-03-per-tab-chat-history, 11-04-ceremony]

tech-stack:
  added: []
  patterns:
    - Disabled-mechanism table per element kind: BUTTON gets .disabled = true; contenteditable DIV gets setAttribute('contenteditable', 'false')
    - Defense-in-depth gating: primary defense is HTML attribute (disabled / contenteditable=false) set declaratively via applyInputLockout; secondary runtime gate at handleSendMessage entry re-reads ownership state and early-returns
    - Fail-open async helpers: _isActiveTabForeignOwned returns false on any storage error so transient failures never block user sends
    - In-sandbox indirect eval ((0, eval)) pattern for testing non-exported sidepanel.js helpers in Node smoke tests under strict mode
    - Aria-describedby applied programmatically (not hardcoded in HTML) so the descriptive text only attaches to controls when they are actually locked

key-files:
  created: []
  modified:
    - extension/ui/sidepanel.css
    - extension/ui/sidepanel.html
    - extension/ui/sidepanel.js
    - tests/sidepanel-tab-aware-smoke.test.js

key-decisions:
  - "D-10 honored (reconciled with verified DOM): the 5 controls listed in CONTEXT D-10 collapse to 4 DOM elements (chatInput + sendBtn + stopBtn + micBtn) because sendBtn serves dual-duty for send-message and run-task. Single lockout closes both behaviors."
  - "D-11 honored: dimmed/disabled CSS visual treatment (opacity 0.45 + pointer-events none + cursor not-allowed + user-select none) matches existing .send-btn:disabled visual parity; NO separate visual banner -- owner chip is the cue and aria-describedby span carries screen-reader semantics."
  - "D-12 + D-13 honored: stopBtn included in lockout because stopBtn is FSB-Autopilot-local; surfacing it enabled while a foreign agent owns the tab creates a false affordance. FSB Autopilot driving the active tab IS treated as foreign ownership (its agentId legacy:autopilot is distinct from legacy:sidepanel)."
  - "D-18 honored: Plan 11-02 touched ONLY extension/ui/sidepanel.css + extension/ui/sidepanel.html + extension/ui/sidepanel.js + tests/sidepanel-tab-aware-smoke.test.js. ZERO modifications to extension/ai/*, extension/background.js, extension/manifest.json, lattice/, extension/ui/popup.js, extension/ui/owner-chip.js, extension/ui/sidepanel-tab-conv-store.js."
  - "D-19 honored: INV-04 BYTE-FROZEN (grep -c 'setTimeout' extension/ai/agent-loop.js = 8 before AND after Plan 11-02)."
  - "D-20 honored: INV-06 BYTE-FROZEN (cd lattice && git rev-parse HEAD = e95067bfa87ed1b75838fc3b3ef217a3b01acbd3; zero Lattice-side commits in Plan 11-02)."
  - "Pitfall 1 honored: no literal 'setTimeout' token introduced in any new comment or code in the four touched files."
  - "Plan 11-00 carryforward respected: sidepanel-tab-conv-store.js BYTE-UNCHANGED; smoke Parts 5-7 placeholders BYTE-UNCHANGED; .fsb-owner-chip baseline CSS rule preserved with new rules APPENDED after it; sidepanel.html script-tag chain BYTE-UNCHANGED."
  - "Plan 11-01 carryforward respected: refreshOwnerChip three-tier resolution + FSBOwnerChip.lookupClientLabel call site BYTE-UNCHANGED; only ADDED two applyInputLockout call sites + one runtime gate; popup.js + owner-chip.js BYTE-UNCHANGED (popup-side lockout OUT OF SCOPE per D-09)."
  - "Claude's discretion -- strict-mode eval workaround in smoke Part 3: the smoke file declares 'use strict' so a direct eval() declaration does NOT create a global binding. Switched to indirect eval ((0, eval)(applyMatch[0])) so the eval'd function declaration executes in non-strict global scope and registers on globalThis.applyInputLockout for downstream access. Same correctness, single-character change."
  - "Claude's discretion -- aria-describedby application strategy: the 4 controls' aria-describedby attribute is set programmatically by applyInputLockout(true) and removed by applyInputLockout(false). Avoids stale aria-describedby pointing to a hidden description span when controls are NOT locked."
  - "Claude's discretion -- updateSendButtonState() called at the end of applyInputLockout to restore the correct sendBtn state on the unlock path. Preserves the isRunning-driven disabled flag (the existing helper handles both hasContent + isRunning gating). Defensive typeof check so the helper need not be defined yet in some boot orderings."

patterns-established:
  - "Per-element disabled mechanism dispatch: a single helper switches on a 'kind' field per control spec (button vs contenteditable) to apply the right disabled mechanism without if-tag-name branching at every call site."
  - "Fail-open defense-in-depth runtime gates: re-read ownership state, never throw to caller, return false on any error so the worst case is a single send racing through past a stale UI state -- which is recoverable."
  - "Indirect-eval pattern for unit-testing non-exported helpers from classic-script bodies: extract by regex, execute via (0, eval)() in the smoke, capture via globalThis. Strict-mode-safe alternative to module refactor."

requirements-completed: [FINT-20]

duration: 5min
completed: 2026-06-07
---

# Phase 11 Plan 11-02: Foreign-owned input lockout Summary

**Wave 2 ships FINT-20 -- foreign-owned input lockout. New `applyInputLockout(foreignOwned)` sync helper added to `extension/ui/sidepanel.js` toggles the disabled state on 4 input controls (chatInput contenteditable div + sendBtn + stopBtn + micBtn) with aria-disabled + aria-describedby + `.fsb-foreign-owned-disabled` class; new `_isActiveTabForeignOwned()` async helper provides defense-in-depth runtime gating at `handleSendMessage` entry. `refreshOwnerChip` is rewired to apply lockout when the chip renders foreign-owned and clear it when the chip is hidden. New `.fsb-foreign-owned-disabled` CSS rule (opacity 0.45 + pointer-events none + cursor not-allowed) plus `.sr-only` WAI-ARIA utility land in `extension/ui/sidepanel.css`. New hidden `fsb-lockout-aria-description` span lands in `extension/ui/sidepanel.html` adjacent to the chip. When the active tab is owned by a foreign agent (per the same Phase 243 `shouldShowOwnerChip` contract used in Plan 11-01), the side-panel surface goes read-only: visually dimmed, mouse-inert, keyboard-disabled, and screen-reader-explained.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-07
- **Completed:** 2026-06-07
- **Tasks:** 4 / 4
- **Files modified:** 4 (0 created, 4 modified)
- **Commits:** 4 task commits

## Accomplishments

- `extension/ui/sidepanel.css` end-of-file gains two new rule blocks appended AFTER the Plan 11-00 `.fsb-owner-chip` rule: `.fsb-foreign-owned-disabled` (opacity 0.45 + cursor not-allowed + pointer-events none + user-select none) for the dimmed-disabled visual treatment per CONTEXT D-11; `.sr-only` standard WAI-ARIA visually-hidden utility for the aria-describedby description span. Both blocks preceded by Phase 11 FINT-20 comment headers. Existing rules + Plan 11-00 `.fsb-owner-chip` block BYTE-UNCHANGED.
- `extension/ui/sidepanel.html` gains a new `<span id="fsb-lockout-aria-description" class="sr-only">Side panel input disabled because the active tab is controlled by another agent</span>` inserted IMMEDIATELY AFTER the existing `<span id="fsb-owner-chip">` at line 26, inside the same `.status-indicator` container. The span is visually hidden via `.sr-only` and supplies screen-reader semantics when the 4 controls receive `aria-describedby="fsb-lockout-aria-description"` programmatically via `applyInputLockout(true)`. Plan 11-00 sidecar script-tag chain (lines 118-128) BYTE-UNCHANGED.
- `extension/ui/sidepanel.js` defines two new helpers IMMEDIATELY BEFORE the existing `refreshOwnerChip` declaration: `applyInputLockout(foreignOwned)` (sync, 4-control loop with kind-dispatched disabled mechanism) + `_isActiveTabForeignOwned()` (async, re-reads active tab + agent registry envelope + invokes `FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE)`). `applyInputLockout` calls `updateSendButtonState()` on the unlock path to preserve the existing isRunning-driven disabled flag on `sendBtn`.
- `extension/ui/sidepanel.js` `refreshOwnerChip` is rewired with TWO `applyInputLockout` call sites: one inside the existing early-return false branch (clear lockout when chip is hidden because no owner or this surface owns the tab) + one immediately AFTER `chipEl.style.display = 'inline-flex';` (apply lockout when chip renders foreign-owned). Plan 11-01 three-tier label resolution + `FSBOwnerChip.lookupClientLabel` wiring BYTE-UNCHANGED; the catch block does NOT call `applyInputLockout(false)` (RESEARCH Pitfall 3 mitigation: if refresh fails mid-flight, lockout state is preserved).
- `extension/ui/sidepanel.js` `handleSendMessage` gains a defense-in-depth runtime gate `if (await _isActiveTabForeignOwned()) return;` IMMEDIATELY AFTER the existing `if (!message || isRunning) return;` early-return. The primary defense is the `disabled` attribute on `sendBtn` set declaratively by `applyInputLockout`; this gate guards against a stale UI state where the button was cleared by a sibling refresh racing with tab activation (RESEARCH Section 7.7). chrome.tabs.onActivated listener at lines 285-294 + chrome.storage.onChanged listener at lines 220-232 BYTE-UNCHANGED (already invoke `refreshOwnerChip`; lockout now flows through there).
- `tests/sidepanel-tab-aware-smoke.test.js` Part 3 + Part 4 placeholders REPLACED with 10 real PASS assertions:
  - Part 3 (5 PASS) -- `applyInputLockout` DOM mutation via in-sandbox indirect-eval extraction:
    - 3.0 function body extractable via regex `/function applyInputLockout\(foreignOwned\)\s*\{[\s\S]*?^\}/m`.
    - 3.1 lockout sets `disabled=true` on 3 BUTTON controls (sendBtn + stopBtn + micBtn).
    - 3.2 lockout sets `contenteditable='false'` on the chatInput DIV.
    - 3.3 all 4 controls receive `aria-disabled='true'` + `aria-describedby='fsb-lockout-aria-description'` + `.fsb-foreign-owned-disabled` class.
    - 3.4 unlock clears `aria-disabled` + `aria-describedby` + class on all 4 controls; chatInput contenteditable restored to `'true'`.
  - Part 4 (5 PASS) -- source-level wiring verification across 3 files:
    - 4.1 `refreshOwnerChip` body contains `applyInputLockout(true)`.
    - 4.2 `refreshOwnerChip` body contains `applyInputLockout(false)`.
    - 4.3 `handleSendMessage` body contains `_isActiveTabForeignOwned` runtime gate.
    - 4.4 `sidepanel.css` carries `.fsb-foreign-owned-disabled` rule with `opacity: 0.45` + `pointer-events: none`.
    - 4.5 `sidepanel.html` carries the `<span id="fsb-lockout-aria-description" class="sr-only">` adjacent to the chip span.
  - Parts 1, 2, 5, 6, 7 BYTE-UNCHANGED. Chrome mocks + DOM stub helpers + main IIFE wrapper BYTE-UNCHANGED.
- `node tests/sidepanel-tab-aware-smoke.test.js` exits 0 with `28 PASS / 0 FAIL` (was 20 baseline after Plan 11-01; +8 real PASS in Parts 3+4 = 28 cumulative, exceeding the Plan 11-02 target of >= 24 PASS).
- Full `npm test` exits 0 end-to-end. Phase 10 sibling (`mcp-philosophy-parity-smoke.test.js`) carries through at 37 PASS. Phase 8 sibling (`lattice-step-emitter-smoke.test.js`) unchanged at 38 PASS. `tests/owner-chip.test.js` unchanged at 39 PASS.
- INV-04 BYTE-FROZEN: `grep -c "setTimeout" extension/ai/agent-loop.js` returns `8` before AND after Plan 11-02. Plan 11-02 touched ZERO files in `extension/ai/*`.
- INV-06 BYTE-FROZEN: `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Zero Lattice-side commits in Plan 11-02. `git status --porcelain lattice/` empty (no working-tree modifications to lattice/).

## Task Commits

Each task was committed atomically on the `automation` branch:

1. **Task 1: Append `.fsb-foreign-owned-disabled` + `.sr-only` CSS rules to `extension/ui/sidepanel.css`** -- `fc283c89` (feat)
2. **Task 2: Add hidden aria-describedby description span to `extension/ui/sidepanel.html`** -- `ec5df3dd` (feat)
3. **Task 3: Add `applyInputLockout` + `_isActiveTabForeignOwned` helpers + wire into refreshOwnerChip + handleSendMessage runtime gate** -- `55d6c9e3` (feat)
4. **Task 4: Fill smoke Parts 3 + 4 with applyInputLockout + source-level assertions** -- `ef5fe5ee` (test)

## Files Created/Modified

| File | Type | Change | Lines |
|------|------|--------|-------|
| `extension/ui/sidepanel.css` | modified | +29 / -0 (two new appended rule blocks; existing rules + Plan 11-00 `.fsb-owner-chip` BYTE-UNCHANGED) | 1645 -> 1674 |
| `extension/ui/sidepanel.html` | modified | +1 / -0 (one new sr-only span line adjacent to chip span) | 130 -> 131 |
| `extension/ui/sidepanel.js` | modified | +91 / -0 (two new helper functions + 5 new lines inside refreshOwnerChip + handleSendMessage; surrounding code BYTE-UNCHANGED) | 2173 -> 2264 |
| `tests/sidepanel-tab-aware-smoke.test.js` | modified | +88 / -2 (replaced 2 placeholder `ok(true)` calls with 10 real PASS; Parts 1, 2, 5, 6, 7 BYTE-UNCHANGED) | 273 -> 359 |

Total diff: +209 / -2 across 4 files.

## Decisions Made

- **Strict-mode eval workaround in smoke Part 3 (Claude's discretion):** The smoke file declares `'use strict'` at the top. A direct `eval(applyMatch[0])` call from strict-mode code does NOT create a global binding for the eval'd `function applyInputLockout` declaration (eval gets its own scope under strict mode). Switched to indirect eval (`(0, eval)(applyMatch[0])`) so the eval'd code executes in non-strict global scope and the function declaration registers on `globalThis.applyInputLockout` for downstream access by the assertions. Same correctness, single-line change with no functional impact on the production code (the workaround is test-side only).
- **Aria-describedby application strategy (Claude's discretion):** The plan specifies that the 4 controls receive `aria-describedby="fsb-lockout-aria-description"` programmatically via `applyInputLockout`, NOT hardcoded in HTML. Confirmed this is correct: hardcoding the attribute would create a stale screen-reader cue pointing to a hidden description span when controls are NOT locked. Applying programmatically attaches the description only when relevant.
- **updateSendButtonState() on the unlock path (Claude's discretion):** `applyInputLockout(false)` removes the `aria-disabled` attribute and the `.fsb-foreign-owned-disabled` class but does NOT clear `sendBtn.disabled`. Instead it calls the existing `updateSendButtonState()` helper which correctly considers both `chatInput.textContent.trim().length > 0` AND `isRunning`. This preserves the isRunning-driven disabled flag during automation runs on the unlock transition. Defensive `typeof updateSendButtonState === 'function'` check so the helper need not be defined yet in some boot orderings.
- **Catch-block behavior on refreshOwnerChip (Claude's discretion):** The outer try/catch tail in `refreshOwnerChip` does NOT call `applyInputLockout(false)` if refresh fails mid-flight. Intentional per RESEARCH Pitfall 3: a transient storage error during refresh should NOT silently unlock controls -- the lockout state stays unchanged so the user sees the previous safe state until the next refresh succeeds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict-mode eval scope leak in smoke Part 3**
- **Found during:** Task 4 (first execution of `node tests/sidepanel-tab-aware-smoke.test.js`)
- **Issue:** The plan's Part 3 fill snippet uses `eval(applyMatch[0])` followed by `const applyInputLockoutFn = globalThis.applyInputLockout || applyInputLockout;`. Under strict mode (the smoke file begins with `'use strict'`), `eval` creates its own scope so the eval'd `function applyInputLockout` declaration does NOT register on `globalThis`, AND the bareword `applyInputLockout` fallback throws `ReferenceError: applyInputLockout is not defined`. Smoke crashed before Parts 3.1-3.4 could run.
- **Fix:** Changed `eval(applyMatch[0])` to `(0, eval)(applyMatch[0])` (indirect eval). Indirect eval executes the eval'd code in non-strict global scope so the `function applyInputLockout` declaration registers on `globalThis.applyInputLockout` as expected. Removed the bareword fallback because it can only succeed if globalThis registration succeeds anyway. Same correctness for the rest of Part 3 (3.1-3.4 unchanged).
- **Files modified:** `tests/sidepanel-tab-aware-smoke.test.js` (Part 3 snippet only)
- **Verification:** `node tests/sidepanel-tab-aware-smoke.test.js` then exits 0 with `28 PASS / 0 FAIL`; Parts 3.1-3.4 all PASS demonstrating applyInputLockout was correctly registered + exercised.
- **Committed in:** `ef5fe5ee` (Task 4 atomic commit)

---

**Total deviations:** 1 auto-fixed (1 bug -- Rule 1).
**Impact on plan:** Test-side workaround for a strict-mode JavaScript scope detail; ZERO impact on production code. Plan executed exactly as written on the production side.

## Authentication Gates

None encountered. Plan 11-02 is pure code (helpers + wiring + smoke + CSS + HTML); no live auth surfaces touched.

## Verification

### Per-task automated checks

- **Task 1:** node-eval driver scanned `extension/ui/sidepanel.css` for `.fsb-foreign-owned-disabled` rule with `opacity: 0.45` + `pointer-events: none`, `.sr-only` rule with `clip: rect(0, 0, 0, 0)`, `Phase 11 FINT-20` marker, and absence of `setTimeout` token. PASS Task 1.
- **Task 2:** node-eval driver scanned `extension/ui/sidepanel.html` for the new `<span id="fsb-lockout-aria-description" class="sr-only">` element + descriptive text + chip-span preservation + chip-to-desc proximity (descIdx > chipIdx, within 200 chars) + Plan 11-00 sidecar script-tag preservation. PASS Task 2.
- **Task 3:** node-eval driver scanned `extension/ui/sidepanel.js` for `function applyInputLockout(foreignOwned)` definition, `async function _isActiveTabForeignOwned()` definition, exactly 2 `applyInputLockout(true|false)` call sites, `if (await _isActiveTabForeignOwned()) return;` runtime gate, `Phase 11 FINT-20` marker, Plan 11-01 `FSBOwnerChip.lookupClientLabel` wire preservation, and INV-04 `grep -c "setTimeout" extension/ai/agent-loop.js === 8`. PASS Task 3.
- **Task 4:** `node tests/sidepanel-tab-aware-smoke.test.js` exits 0 with `28 PASS / 0 FAIL`. `npm test` exits 0 end-to-end. PASS Task 4.

### End-to-end gates

| Gate | Command | Pre-Plan | Post-Plan |
|------|---------|----------|-----------|
| Phase 11 smoke green | `node tests/sidepanel-tab-aware-smoke.test.js` | 20 PASS / 0 FAIL | 28 PASS / 0 FAIL |
| Full chain green | `npm test` | exit 0 | exit 0 (Phase 8 + Phase 10 + owner-chip suites BYTE-UNCHANGED) |
| INV-04 byte-freeze | `grep -c "setTimeout" extension/ai/agent-loop.js` | 8 | 8 (BYTE-FROZEN; Plan 11-02 ZERO modifications to agent-loop.js) |
| INV-06 byte-freeze | `cd lattice && git rev-parse HEAD` | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 (BYTE-FROZEN; zero Lattice-side commits in Plan 11-02) |
| Lattice working tree | `git status --porcelain lattice/` | (no Plan-11-02 introduced changes) | empty (no Plan-11-02 introduced changes) |
| sidepanel.js applyInputLockout token count | `grep -c "applyInputLockout" extension/ui/sidepanel.js` | 0 | 6 (function declaration + 2 call sites in refreshOwnerChip + comment references; >= 3 required) |
| sidepanel.js _isActiveTabForeignOwned token count | `grep -c "_isActiveTabForeignOwned" extension/ui/sidepanel.js` | 0 | 2 (function declaration + handleSendMessage gate; >= 2 required) |
| sidepanel.css .fsb-foreign-owned-disabled rule | `grep -c "\.fsb-foreign-owned-disabled" extension/ui/sidepanel.css` | 0 | 1 |
| sidepanel.html aria-description span | `grep -c "fsb-lockout-aria-description" extension/ui/sidepanel.html` | 0 | 1 |
| Plan 11-01 lookupClientLabel preserved | `grep -c "FSBOwnerChip.lookupClientLabel" extension/ui/sidepanel.js` | 1 | 1 (BYTE-UNCHANGED) |
| Plan 11-01 popup mirror preserved | `grep -c "FSBOwnerChip.lookupClientLabel" extension/ui/popup.js` | 1 | 1 (BYTE-UNCHANGED) |
| Plan 11-00 sidecar preserved | `grep -c 'src="sidepanel-tab-conv-store.js"' extension/ui/sidepanel.html` | 1 | 1 (BYTE-UNCHANGED) |
| Plan 11-00 .fsb-owner-chip baseline preserved | `grep -c "\.fsb-owner-chip" extension/ui/sidepanel.css` | 1 | 1 (BYTE-UNCHANGED) |

## Carryforward Notes

Subsequent Plan 11-XX fills:

- **Plan 11-03 (FINT-21)** fills smoke Parts 5 + 6 -- per-tab chat history:
  - Part 5: envelope CRUD + LRU eviction (write 51 entries via `ensureTabConversation`, assert 50 retained + first-written evicted per `_enforceLruCap` tail-pop semantics).
  - Part 6: `migrateLegacyConversationKey` idempotency + sidepanel boot wiring + `chrome.tabs.onActivated` conversation-swap behavior + `chrome.tabs.onRemoved` drop + `chrome.tabs.onDiscarded` preserve.
  - Production-code carryforward: Plan 11-02 outputs (applyInputLockout + _isActiveTabForeignOwned + .fsb-foreign-owned-disabled + .sr-only + fsb-lockout-aria-description) BYTE-UNCHANGED.
- **Plan 11-04 (INV-04 + INV-06 ceremony)** fills smoke Part 7 -- regression assertions on `grep -c "setTimeout" extension/ai/agent-loop.js === 8` + 4 iterator pattern count + awk-scan for the 5 Phase 11 helper tokens (`lookupClientLabel | applyInputLockout | ensureTabConversation | swapToTabConversation | dropTabConversation`) inside any setTimeout lambda body + lattice SHA frozen + REQUIREMENTS.md FINT-19 / 20 / 21 narrative landed + LATTICE-PIN.md Phase 11 row with SHA UNCHANGED + v0.10.0-MILESTONE-AUDIT.md status_history `phase_11_shipped` entry.

## Threat Surface Notes

No new threat surface introduced beyond the Plan-11-02 threat model (T-11-02-01 through T-11-02-07).

- **T-11-02-01 (Spoofing -- popup escape hatch):** ACCEPT disposition holds. Popup remains available as intentional user escape hatch when the side panel is locked; popup-side lockout is OUT OF SCOPE per D-09.
- **T-11-02-02 (Tampering -- DevTools removes disabled attribute):** Defense-in-depth runtime gate at `handleSendMessage` re-checks `_isActiveTabForeignOwned()` even when the button shows enabled. Verified source-level via smoke Part 4.3.
- **T-11-02-03 (DoS -- refresh-thrash from rapid tab switches):** ACCEPT disposition holds. `refreshOwnerChip` is debounced naturally by `chrome.tabs.onActivated` event coalescing; `applyInputLockout` is a sync O(4) DOM mutation (< 1ms per call).
- **T-11-02-04 (Information Disclosure -- aria copy mentions "another agent"):** ACCEPT disposition holds. The owner chip already displays `owned by <client>`; the aria text only restates that context for screen readers.
- **T-11-02-05 (Repudiation -- locked state could cause user to miss a critical message):** ACCEPT disposition holds. Chip + aria semantics explain the lockout; user can switch to a free tab. No data is lost (chatInput preserves typed text behind `contenteditable=false`).
- **T-11-02-06 (Elevation of Privilege -- INV-04 violation via accidental agent-loop.js modification):** MITIGATED. Plan 11-02 touched ZERO files in `extension/ai/*`; Task 3 verify gate asserted `grep -c "setTimeout" extension/ai/agent-loop.js === 8` AFTER each task.
- **T-11-02-07 (Spoofing -- duplicate chrome.tabs.onActivated listener future-maintainer hazard):** MITIGATED. Plan 11-02 ADDED no listener; `refreshOwnerChip`'s new lockout behavior flows through the existing listener at lines 285-294. Plan 11-03 will consolidate listener wiring per RESEARCH Pitfall 2.

## FINT-20 Closure Note

FINT-20 (Foreign-owned input lockout) is now LIVE in production code:

- `extension/ui/sidepanel.css` carries the `.fsb-foreign-owned-disabled` + `.sr-only` rules.
- `extension/ui/sidepanel.html` carries the `fsb-lockout-aria-description` sr-only span adjacent to the owner chip.
- `extension/ui/sidepanel.js` defines `applyInputLockout` + `_isActiveTabForeignOwned` helpers.
- `refreshOwnerChip` applies `applyInputLockout(true)` when the chip renders foreign-owned and `applyInputLockout(false)` when the chip is hidden. The chrome.tabs.onActivated + chrome.storage.onChanged listeners already invoke `refreshOwnerChip` so the lockout flows automatically on tab switch and on registry mutation.
- `handleSendMessage` early-returns when `_isActiveTabForeignOwned()` resolves true, providing defense-in-depth against stale UI states.
- When the active tab is owned by a foreign agent (e.g. OpenClaw driving the page via MCP, or FSB Autopilot self-driving a tab the user navigated to), the side panel:
  - Visually dims chatInput + sendBtn + stopBtn + micBtn to 45% opacity.
  - Inerts pointer events (clicks pass through; cursor shows `not-allowed`).
  - Sets `disabled=true` on the 3 buttons + `contenteditable='false'` on the chatInput div.
  - Sets `aria-disabled='true'` + `aria-describedby='fsb-lockout-aria-description'` on all 4 controls.
  - Re-enables all 4 controls when the user switches to a free tab or when the foreign agent releases the active tab (chrome.storage.onChanged on `fsbAgentRegistry` -> `refreshOwnerChip` -> `applyInputLockout(false)`).

FINT-20 mark-complete will be landed by the orchestrator on the post-plan state-update tick (per execute-phase command convention).

## Self-Check: PASSED

Verified post-write:

- File `extension/ui/sidepanel.css` carries new `.fsb-foreign-owned-disabled` + `.sr-only` rules + `Phase 11 FINT-20` marker: FOUND
- File `extension/ui/sidepanel.html` carries new `fsb-lockout-aria-description` sr-only span adjacent to chip: FOUND
- File `extension/ui/sidepanel.js` defines `applyInputLockout` + `_isActiveTabForeignOwned` + 2 call sites + runtime gate + `Phase 11 FINT-20` marker: FOUND
- File `tests/sidepanel-tab-aware-smoke.test.js` Part 3 + Part 4 contain 10 real `ok(...)` assertions; Parts 1, 2, 5, 6, 7 placeholders BYTE-UNCHANGED: FOUND
- Commit `fc283c89` (Task 1 CSS) exists in `git log --oneline`: FOUND
- Commit `ec5df3dd` (Task 2 HTML span) exists in `git log --oneline`: FOUND
- Commit `55d6c9e3` (Task 3 sidepanel.js helpers + wiring) exists in `git log --oneline`: FOUND
- Commit `ef5fe5ee` (Task 4 smoke fill) exists in `git log --oneline`: FOUND
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8: VERIFIED
- INV-06: `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`: VERIFIED
- Phase 11 smoke exits 0 with `28 PASS / 0 FAIL`: VERIFIED
- Full `npm test` exits 0 end-to-end: VERIFIED
- Plan 11-00 + Plan 11-01 carryforward BYTE-UNCHANGED (sidecar + .fsb-owner-chip CSS + owner-chip.js + popup.js + refreshOwnerChip three-tier resolution + lookupClientLabel call sites): VERIFIED
- No emojis in any of the 4 modified files: VERIFIED
- No literal `setTimeout` token in any new code or comment in the 4 modified files: VERIFIED
