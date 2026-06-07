---
phase: 11-tab-aware-side-panel-surface
plan: 01
subsystem: sidepanel
tags: [tab-aware, sidepanel, popup, owner-chip, friendly-label, lookupClientLabel, three-tier-resolution, FINT-19, wave-1]

requires:
  - phase: 10-mcp-philosophy-parity-for-autopilot-driver-visual-session-li
    provides: lifecycle entry.client field allowlisted via Phase 10 D-02 'FSB Autopilot' addition (consumed by lookupClientLabel as the SSOT)
  - phase: 11-tab-aware-side-panel-surface plan 00
    provides: Wave 0 smoke harness with Part 1 + Part 2 placeholders (filled in this plan), chrome mocks, DOM stubs, sidecar require side-effect
  - phase: 243-multi-agent-tab-concurrency
    provides: owner-chip dual-export idiom + shouldShowOwnerChip + findOwnerInEnvelope pure helpers reused by the three-tier resolution
provides:
  - extension/ui/owner-chip.js exports new async lookupClientLabel(tabId, storageReadFn) helper (5th helper alongside the existing 4)
  - extension/ui/sidepanel.js refreshOwnerChip three-tier resolution wired (legacy:* literal -> friendly entry.client -> formatAgentIdForDisplay short-prefix)
  - extension/ui/popup.js refreshOwnerChip three-tier resolution mirrored per D-09 popup chip-only fix
  - tests/sidepanel-tab-aware-smoke.test.js Part 1 + Part 2 filled (15 real PASS; total smoke 20 PASS / 0 FAIL)
affects: [11-02-foreign-owned-input-lockout, 11-03-per-tab-chat-history, 11-04-ceremony]

tech-stack:
  added: []
  patterns:
    - Async best-effort lookup helper with injected storageReadFn test seam (D-06)
    - Three-tier label resolution chain (legacy literal -> friendly client -> short-prefix Phase 243 baseline)
    - Dual-export shape preserved (globalThis.FSBOwnerChip.lookupClientLabel + module.exports.lookupClientLabel)
    - Source-level grep assertions inside the smoke for cross-file wiring verification

key-files:
  created: []
  modified:
    - extension/ui/owner-chip.js
    - extension/ui/sidepanel.js
    - extension/ui/popup.js
    - tests/sidepanel-tab-aware-smoke.test.js

key-decisions:
  - "D-05 honored: lookupClientLabel reads storage at 'mcpVisualSession:' + tabId; storage prefix literal matches MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX at lifecycle.js:58."
  - "D-06 honored: storageReadFn dependency injected; production callers pass (key) => chrome.storage.session.get(key); Node tests pass mock fns; helper itself never touches the extension host global storage API."
  - "D-07 honored: three-tier resolution order Tier 1 legacy:* literal -> Tier 2 friendly entry.client -> Tier 3 formatAgentIdForDisplay short-prefix. Verified source-level via smoke Part 2.5 (Tier 1 idx precedes Tier 2 idx)."
  - "D-08 honored: no in-memory cache layer; lifecycle entry is SSOT; chrome.storage.session.get is per-event read budget < 5ms."
  - "D-09 honored: popup.js refreshOwnerChip received byte-identical three-tier insert; MY_SURFACE literal at line 7 byte-frozen as 'legacy:popup'; popup-side input lockout + per-tab history remain OUT OF SCOPE for Plan 11-01."
  - "D-18 honored: Phase 11 Plan 11-01 touched ONLY extension/ui/owner-chip.js + extension/ui/sidepanel.js + extension/ui/popup.js + tests/sidepanel-tab-aware-smoke.test.js. ZERO modifications to extension/ai/*, extension/background.js, extension/manifest.json, lattice/."
  - "D-19 honored: INV-04 BYTE-FROZEN (grep -c \"setTimeout\" extension/ai/agent-loop.js = 8 before AND after Plan 11-01)."
  - "D-20 honored: INV-06 BYTE-FROZEN (cd lattice && git rev-parse HEAD = e95067bfa87ed1b75838fc3b3ef217a3b01acbd3; zero Lattice-side commits in Plan 11-01)."
  - "Pitfall 1 honored: no literal 'setTimeout' token introduced in any new code or comment in the four files touched."
  - "Plan 11-00 carryforward respected: sidecar module extension/ui/sidepanel-tab-conv-store.js BYTE-UNCHANGED; smoke Parts 3-7 placeholders BYTE-UNCHANGED; sidepanel.html script-tag chain + sidepanel.css baseline rule BYTE-UNCHANGED."

patterns-established:
  - "Friendly-label resolution chain: a downstream consumer trusts the upstream write-side allowlist gate (mcp-visual-session-lifecycle.js:325-333) and only validates shape (string + non-empty); cache invalidation hell avoided per Pitfall 1."
  - "Async helper test-seam injection extended to a 5th owner-chip helper: storageReadFn parameter pattern (mirrors existing findOwnerInEnvelope passing envelope as a param)."

requirements-completed: [FINT-19]

duration: 7min
completed: 2026-06-07
---

# Phase 11 Plan 11-01: Owner-chip friendly-label resolver Summary

**Wave 1 ships FINT-19 -- the owner-chip friendly-label resolver. New async `lookupClientLabel(tabId, storageReadFn)` helper added to `extension/ui/owner-chip.js`; both sidepanel and popup `refreshOwnerChip` extended with three-tier resolution (`legacy:*` literal -> friendly `entry.client` -> short-prefix fallback). Cryptic `owned by agent_a3f8b1` becomes `owned by OpenClaw` (or `Claude` / `Cursor` / `FSB Autopilot` per the Phase 10 14-entry allowlist) when a visual-session lifecycle entry exists for the active tab. Phase 243 baseline preserved for agents that never tick the visual-session pipeline.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-07
- **Completed:** 2026-06-07
- **Tasks:** 4 / 4
- **Files modified:** 4 (0 created, 4 modified)
- **Commits:** 4 task commits

## Accomplishments

- `extension/ui/owner-chip.js` gains a new async `lookupClientLabel(tabId, storageReadFn)` helper inside the existing IIFE body. Returns `Promise<string|null>` resolving to the trimmed `entry.client` from the visual-session lifecycle entry, or null on all invalid-input / missing-entry / malformed / throw paths. Module export contract preserved: dual export via `globalThis.FSBOwnerChip.lookupClientLabel` AND `module.exports.lookupClientLabel`. Existing 4 helpers BYTE-UNCHANGED.
- `extension/ui/sidepanel.js` `refreshOwnerChip` (lines 242-278 pre-edit) extended with three-tier resolution per CONTEXT D-07: Tier 1 short-circuits on `ownerAgentId.indexOf('legacy:') === 0` returning the literal id; Tier 2 awaits `FSBOwnerChip.lookupClientLabel(tab.id, (key) => chrome.storage.session.get(key))` returning the friendly client name; Tier 3 falls back to the existing `FsbAgentRegistry.formatAgentIdForDisplay` short-prefix. The chrome.tabs.onActivated listener at lines 285-294 + the chrome.storage.onChanged listener at lines 220-232 are BYTE-UNCHANGED (Plan 11-02 + Plan 11-03 extend those listeners in subsequent waves).
- `extension/ui/popup.js` `refreshOwnerChip` received the byte-identical three-tier insert per CONTEXT D-09 popup mirror. `MY_SURFACE = 'legacy:popup'` literal at line 7 stays byte-frozen. Popup-side input lockout + per-tab history changes remain OUT OF SCOPE -- popup is single-shot per Phase 243 design.
- `tests/sidepanel-tab-aware-smoke.test.js` Part 1 + Part 2 placeholders REPLACED with 15 real PASS assertions:
  - Part 1 (8 PASS) -- `lookupClientLabel` happy path + 7 null paths (trim semantics; missing entry; malformed non-object entry; missing client field; negative tabId without storage read; null storageReadFn; thrown storage read absorbed).
  - Part 2 (7 PASS) -- source-level wiring + export contracts: sidepanel.js + popup.js each reference `FSBOwnerChip.lookupClientLabel` exactly once; both carry the `Phase 11 FINT-19` marker comment; sidepanel.js Tier 1 conditional appears BEFORE Tier 2 call site; `module.exports.lookupClientLabel` is a function; `globalThis.FSBOwnerChip.lookupClientLabel` is a function (dual-export holds).
  - Parts 3-7 placeholders BYTE-UNCHANGED for Plan 11-02 + 11-03 + 11-04 fills.
- `node tests/sidepanel-tab-aware-smoke.test.js` exits 0 with `20 PASS / 0 FAIL` (was 7 baseline; +13 real PASS + 5 placeholders = 20 cumulative).
- Full `npm test` exits 0 end-to-end. Phase 10 sibling (`mcp-philosophy-parity-smoke.test.js`) unchanged at 37 PASS. Phase 8 sibling (`lattice-step-emitter-smoke.test.js`) unchanged at 38 PASS. Existing `tests/owner-chip.test.js` carries through at 39 PASS / 0 FAIL.
- INV-04 BYTE-FROZEN: `grep -c "setTimeout" extension/ai/agent-loop.js` returns `8` before AND after Plan 11-01. Plan 11-01 touched ZERO files in `extension/ai/*`.
- INV-06 BYTE-FROZEN: `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Zero Lattice-side commits in Plan 11-01.

## Task Commits

Each task was committed atomically on the `automation` branch:

1. **Task 1: Extend `extension/ui/owner-chip.js` with async `lookupClientLabel` helper + dual-export** -- `ae79049f` (feat)
2. **Task 2: Rewire `extension/ui/sidepanel.js` `refreshOwnerChip` with three-tier resolution** -- `2efa3008` (feat)
3. **Task 3: Mirror three-tier resolution in `extension/ui/popup.js` per CONTEXT D-09** -- `42742737` (feat)
4. **Task 4: Fill smoke Parts 1 + 2 with real assertions** -- `0b1ecb83` (test)

## Files Created/Modified

| File | Type | Change | Lines |
|------|------|--------|-------|
| `extension/ui/owner-chip.js` | modified | +44 / -1 (new async lookupClientLabel + 1-line exportsObj entry; existing 4 helpers BYTE-UNCHANGED) | 119 -> 162 |
| `extension/ui/sidepanel.js` | modified | +26 / -5 (replaced existing 5-line formatter+label block with three-tier conditional; surrounding code BYTE-UNCHANGED) | 2152 -> 2173 |
| `extension/ui/popup.js` | modified | +26 / -5 (byte-identical three-tier insert; MY_SURFACE literal + surrounding code BYTE-UNCHANGED) | 1046 -> 1067 |
| `tests/sidepanel-tab-aware-smoke.test.js` | modified | +100 / -2 (replaced 2 placeholder ok(true) calls with 15 real PASS; Parts 3-7 BYTE-UNCHANGED) | 175 -> 273 |

## Decisions Made

- **JSDoc cite-pinning (Pitfall 1 mitigation):** The new `lookupClientLabel` JSDoc explicitly cites the upstream allowlist gate at `mcp-visual-session-lifecycle.js:325-333` and explains why this consumer does NOT re-validate against the allowlist (the gate is the SSOT; re-validation would create cache-invalidation hell). Future maintainers reading the JSDoc see the design intent without needing to grep elsewhere.
- **`var` dialect inside the IIFE body:** The lookupClientLabel implementation uses `var` (not `let` / `const`) inside the IIFE body, matching the existing 4-helper dialect at owner-chip.js. The smoke tests + the call sites in sidepanel.js + popup.js use `let` / `const` (their own dialect). Mixed dialect within one repo is acceptable when each file is internally consistent.
- **Source-level wiring assertions (Part 2.5):** Verifying Tier 1 short-circuits BEFORE Tier 2 lookup is enforced by comparing indices of the regex match position. Functional verification through a mocked refreshOwnerChip invocation would require pulling in the full sidepanel.js module load chain (which currently top-level-references many DOM globals); source-level grep + ordering assertion provides equivalent confidence without that wiring cost.
- **`module.exports` + `globalThis` both asserted (Part 2.6 + 2.7):** The smoke's chrome mock + the require side-effect at module-top register `globalThis.FSBOwnerChip`; Part 2.7 verifies the dual-export shape holds. Part 2.6 separately asserts the require-returned object also has `lookupClientLabel`. Together they guarantee classic-script consumers (sidepanel + popup) AND Node-test consumers both see the new helper.

## Deviations from Plan

None -- plan executed exactly as written. No Rule 1 / 2 / 3 / 4 deviations encountered. Pre-existing untracked / modified files inside `lattice/` (`MULTI-MODEL-OUTPUT-CONTRACT-RESEARCH.md` untracked + `lattice/.planning/STATE.md` modified) were NOT touched by Plan 11-01; they are pre-existing workspace dirty state inside the lattice submodule, NOT introduced by this plan. INV-06 byte-freeze is enforced on the lattice HEAD SHA (which is verified unchanged) and on absence of new Lattice-side commits (verified empty), NOT on the lattice working tree.

## Authentication Gates

None encountered. Plan 11-01 is pure code (helper + wiring + smoke); no live auth surfaces touched.

## Verification

### Per-task automated checks

- **Task 1:** node-eval driver loaded the module via `require('./extension/ui/owner-chip.js')`, asserted `typeof m.lookupClientLabel === 'function'`, and exercised 8 input/output pairs (happy path; trim semantics; null tabId; negative tabId; null storageReadFn; missing entry; whitespace-only client; thrown storage read absorbed). PASS Task 1. Existing `tests/owner-chip.test.js` still PASS at 39/0.
- **Task 2:** node-eval driver read `extension/ui/sidepanel.js`, asserted presence of `FSBOwnerChip.lookupClientLabel` reference, Tier 1 conditional regex match `ownerAgentId\.indexOf\(['"]legacy:['"]\)\s*===\s*0`, `Phase 11 FINT-19` marker, Tier 3 `FSBOwnerChip.ownerLabelFor` fallback, AND verified Tier 3 index follows Tier 2 index in source order. INV-04 setTimeout count = 8 verified inline. PASS Task 2.
- **Task 3:** node-eval driver read `extension/ui/popup.js`, asserted `FSBOwnerChip.lookupClientLabel` exactly once, `Phase 11 FINT-19` marker, `MY_SURFACE = 'legacy:popup'` byte-frozen literal, Tier 1 conditional, Tier 3 fallback. PASS Task 3.
- **Task 4:** `node tests/sidepanel-tab-aware-smoke.test.js` exits 0 with `20 PASS / 0 FAIL`. `npm test` exits 0 end-to-end. PASS Task 4.

### End-to-end gates

| Gate | Command | Pre-Plan | Post-Plan |
|------|---------|----------|-----------|
| Phase 11 smoke green | `node tests/sidepanel-tab-aware-smoke.test.js` | 7 PASS / 0 FAIL | 20 PASS / 0 FAIL |
| Full chain green | `npm test` | exit 0 | exit 0 (Phase 8 sibling 38 PASS preserved; Phase 10 sibling 37 PASS preserved; owner-chip 39 PASS preserved; Phase 11 smoke 20 PASS) |
| INV-04 byte-freeze | `grep -c "setTimeout" extension/ai/agent-loop.js` | 8 | 8 (BYTE-FROZEN; Plan 11-01 ZERO modifications to agent-loop.js) |
| INV-06 byte-freeze | `cd lattice && git rev-parse HEAD` | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 (BYTE-FROZEN; zero Lattice-side commits in Plan 11-01) |
| owner-chip.js helper count | `grep -c "lookupClientLabel" extension/ui/owner-chip.js` | 0 | 2 (function declaration + exportsObj entry) |
| sidepanel.js wire count | `grep -c "FSBOwnerChip.lookupClientLabel" extension/ui/sidepanel.js` | 0 | 1 (Tier 2 call site) |
| popup.js wire count | `grep -c "FSBOwnerChip.lookupClientLabel" extension/ui/popup.js` | 0 | 1 (Tier 2 call site) |
| Existing owner-chip suite intact | `node tests/owner-chip.test.js` | 39 PASS / 0 FAIL | 39 PASS / 0 FAIL (new export is additive; destructure imports byte-unchanged) |
| Wave 0 carryforward intact | `extension/ui/sidepanel-tab-conv-store.js + sidepanel.html + sidepanel.css` | BYTE-UNCHANGED | BYTE-UNCHANGED (Plan 11-00 outputs untouched) |

## Carryforward Notes

Subsequent Plan 11-XX fills:

- **Plan 11-02 (FINT-20)** fills smoke Parts 3 + 4 -- foreign-owned input lockout:
  - Part 3: `applyInputLockout(foreignOwned)` DOM mutation on the 4 controls (chatInput `contenteditable` toggle + sendBtn + stopBtn + micBtn `disabled` + `aria-disabled="true"` + `.fsb-foreign-owned-disabled` class add/remove).
  - Part 4: `handleSendMessage` runtime gate via `_isActiveTabForeignOwned` + new `.fsb-foreign-owned-disabled` companion CSS class.
- **Plan 11-03 (FINT-21)** fills smoke Parts 5 + 6 -- per-tab chat history:
  - Part 5: envelope CRUD + LRU eviction (write 51 entries, assert 50 retained + first-written evicted).
  - Part 6: `migrateLegacyConversationKey` idempotency + sidepanel boot wiring + chrome.tabs.onActivated swap.
- **Plan 11-04 (INV-04 + INV-06 ceremony)** fills smoke Part 7 -- regression assertions on `grep -c "setTimeout" extension/ai/agent-loop.js === 8` + 4 iterator pattern count + awk-scan for the 5 Phase 11 helper tokens (`lookupClientLabel | applyInputLockout | ensureTabConversation | swapToTabConversation | dropTabConversation`) inside any setTimeout lambda body + lattice SHA frozen + REQUIREMENTS.md FINT-19 / 20 / 21 narrative landed + LATTICE-PIN.md Phase 11 row with SHA UNCHANGED + v0.10.0-MILESTONE-AUDIT.md status_history `phase_11_shipped` entry.

## Threat Surface Notes

No new threat surface introduced beyond the Plan-11-01 threat model (T-11-01-01 through T-11-01-06).

- **T-11-01-01 (Injection):** Hostile `entry.client` value bypassing the allowlist gate -- ACCEPT disposition holds. The write-side gate at `mcp-visual-session-lifecycle.js:325-333` normalizes + rejects unknown labels BEFORE storage write. `chipEl.textContent = ...` (NOT `innerHTML`) is the defense-in-depth render path -- even a hypothetical bypass cannot inject HTML or script.
- **T-11-01-02 (Tampering):** Future maintainer adds re-validation against the allowlist inside `lookupClientLabel` -- mitigated via JSDoc explicit cite-pin to the upstream gate at lifecycle.js:325-333 and explicit "this consumer does NOT re-validate against the allowlist" note. The smoke source-level assertions (Part 2.6) catch removal of the export entirely; future PRs adding re-validation would surface in code review.
- **T-11-01-03 (DoS):** Storage read latency degrading chip refresh UX -- ACCEPT disposition holds. The new lookup adds at most one `chrome.storage.session.get` call per chip refresh; per CONTEXT D-08, read budget is < 5ms typical.
- **T-11-01-04 (Information Disclosure):** New helper leaks `fsbAgentRegistry` contents through chip text -- mitigated. `lookupClientLabel` reads ONLY from `mcpVisualSession:<tabId>` storage key; never touches `fsbAgentRegistry`. Tier 3 fallback uses `formatAgentIdForDisplay` which returns 6-char hex prefix (NOT full agentId).
- **T-11-01-05 (Spoofing):** Future maintainer adds duplicate `chrome.tabs.onActivated` listener -- mitigated. Plan 11-01 does NOT register any new listener (the existing one at sidepanel.js lines 285-294 + popup.js DOMContentLoaded handler are BYTE-UNCHANGED). Plan 11-03 will ship the consolidated `onTabActivated` wrapper.
- **T-11-01-06 (Elevation of Privilege):** INV-04 byte-freeze violation via accidental agent-loop.js modification -- mitigated. Plan 11-01 touched ZERO files in `extension/ai/*`; verify gate asserts `grep -c "setTimeout" extension/ai/agent-loop.js === 8` AFTER each task.

## FINT-19 Closure Note

FINT-19 (Owner-chip friendly-label resolver) is now LIVE in production code:

- `extension/ui/owner-chip.js` exports the new `lookupClientLabel` async helper via dual-export shape.
- `extension/ui/sidepanel.js` `refreshOwnerChip` resolves labels through the three-tier chain.
- `extension/ui/popup.js` `refreshOwnerChip` mirrors the chain per D-09.
- Phase 10 14-entry allowlist values now render directly in chip text whenever a visual-session lifecycle entry exists for the active tab. For example, an active tab driven by OpenClaw via the MCP protocol now displays `owned by OpenClaw` instead of `owned by agent_a3f8b1`.
- Phase 243 baseline behavior preserved: agents that never tick the visual-session pipeline (raw-FSB-tool agents) still render via the Tier 3 `formatAgentIdForDisplay` 6-char short prefix.

FINT-19 mark-complete will be landed by the orchestrator on the post-plan state-update tick (per execute-phase command convention).

## Self-Check: PASSED

Verified post-write:

- File `extension/ui/owner-chip.js` carries new `lookupClientLabel` function + `exportsObj` entry: FOUND (grep count 2)
- File `extension/ui/sidepanel.js` carries `FSBOwnerChip.lookupClientLabel` call + `Phase 11 FINT-19` marker + Tier 1 conditional + Tier 3 fallback: FOUND
- File `extension/ui/popup.js` carries `FSBOwnerChip.lookupClientLabel` call + `Phase 11 FINT-19` marker + `MY_SURFACE = 'legacy:popup'` byte-frozen + Tier 1 conditional + Tier 3 fallback: FOUND
- File `tests/sidepanel-tab-aware-smoke.test.js` Part 1 + Part 2 contain 15 real `ok(...)` assertions; Parts 3-7 placeholders BYTE-UNCHANGED: FOUND
- Commit `ae79049f` (Task 1 owner-chip.js helper) exists in `git log --oneline`: FOUND
- Commit `2efa3008` (Task 2 sidepanel.js three-tier) exists in `git log --oneline`: FOUND
- Commit `42742737` (Task 3 popup.js three-tier) exists in `git log --oneline`: FOUND
- Commit `0b1ecb83` (Task 4 smoke Parts 1+2 fill) exists in `git log --oneline`: FOUND
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8: VERIFIED
- INV-06: `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`: VERIFIED
- Phase 11 smoke exits 0 with `20 PASS / 0 FAIL`: VERIFIED
- Full `npm test` exits 0 end-to-end: VERIFIED
- `tests/owner-chip.test.js` still PASS at 39 / 0 byte-unchanged: VERIFIED
