---
phase: 11
slug: tab-aware-side-panel-surface
depth: standard
reviewed: 2026-06-07
status: findings
findings_count: { critical: 0, warning: 3, info: 4 }
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-07
**Depth:** standard
**Files Reviewed:** 6 production files + cross-reference of popup.html / agent-loop.js (INV verification)
**Status:** findings

## Summary

Phase 11 ships three coupled UX surfaces (FINT-19 friendly owner-chip, FINT-20 foreign-owned input lockout, FINT-21 per-tab chat history) across two new exports on `owner-chip.js`, a new sidecar module `sidepanel-tab-conv-store.js`, a refactored `sidepanel.js` boot path, a `popup.js` mirror, plus matching HTML/CSS additions.

The implementation is conscientious: every storage read defensively validates envelope shape; the owner-chip rendering correctly uses `textContent` (not `innerHTML`) so a malicious `entry.client` value cannot escape into the DOM; the IIFE dual-export pattern in the new sidecar mirrors `owner-chip.js` exactly; CONTEXT D-XX rationale is inline-cited at every non-obvious decision point. Hard invariants verified intact:

- **INV-01/02** PASS: no `tool-definitions.js` changes
- **INV-04** PASS: agent-loop.js changes in this window (`24197da8`, `a4c09208`) are UAT-08 prep and a config sweep, not Phase 11 work
- **INV-05** PASS: deprecated agent modules untouched
- **INV-06** PASS: `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`
- **No emojis** in any modified file (per CLAUDE.md)

Findings below are correctness/safety concerns the verifier's source-level grep cannot catch: a concurrent-write race against `chrome.storage.session`, a fail-open data-loss edge case in the overwrite path, and a small set of style/quality items.

## Warnings

### WR-01: Concurrent _persistEnvelope() calls can lose writes (last-writer-wins race)

**File:** `extension/ui/sidepanel.js:61-69`, `143`, `175`

**Issue:** `_persistEnvelope()` is called from at least two async paths that can interleave:

1. `dropTabConversation(tabId)` -> `await _persistEnvelope()` (line 143, fires on `chrome.tabs.onRemoved`)
2. `ensureTabConversationForActiveTab(overwrite)` -> `await _persistEnvelope()` (line 175, fires on every user send + on `startNewChat`)

Both functions mutate `tabConvEnvelope` in place THEN write the entire envelope back to storage. If a tab is closed (drop) at the same millisecond a user sends a message in a different tab (ensure), both handlers read the same in-memory `tabConvEnvelope`, each mutates it independently, then both call `chrome.storage.session.set(payload)` with their own view. Because `_persistEnvelope` serializes the whole envelope (not just the delta), the second write erases the first writer's mutation.

The race window is small but real on rapid tab-close / tab-send sequences, and the failure mode is silent (no surfaced error, no log because of the swallowed catch on line 66). Outcome: a dropped tab entry resurrects on the next reload, OR a lazy-minted entry vanishes mid-conversation.

**Fix:** Serialize writes with a single in-flight promise per the standard chrome.storage write-coalescing pattern. Minimal patch:

```javascript
// Phase 11 FINT-21 -- serialize envelope writes so concurrent
// drop/ensure paths cannot race on the read-mutate-write cycle.
let _persistInFlight = null;
async function _persistEnvelope() {
  if (_persistInFlight) { await _persistInFlight; }
  _persistInFlight = (async () => {
    try {
      var payload = {};
      payload[FSBSidepanelTabConvStore.STORAGE_KEY] = tabConvEnvelope;
      await chrome.storage.session.set(payload);
    } catch (_e) { /* swallow */ }
    finally { _persistInFlight = null; }
  })();
  return _persistInFlight;
}
```

This keeps the API/contract identical (still fire-and-forget compatible) but guarantees serial ordering at the storage boundary.

### WR-02: ensureTabConversationForActiveTab(true) can silently drop an entry on chrome.tabs.query failure

**File:** `extension/ui/sidepanel.js:151-182`

**Issue:** `ensureTabConversationForActiveTab(overwrite)` is called from `startNewChat` (line 883) with `overwrite=true` to force a fresh conversation in the current tab. The implementation does:

```javascript
// line 160
var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
var tab = tabs && tabs[0];
if (!tab || typeof tab.id !== 'number') {
  // falls through to noTabFallback mint
}
if (overwrite === true) {
  FSBSidepanelTabConvStore.dropTabConversation(tabConvEnvelope, tab.id);
}
```

If `chrome.tabs.query` throws (rare but possible under permission revocation or extension reload), control jumps to the outer `catch (_e)` (line 177) and `errFallback` is minted — but the existing entry for whatever the active tab WAS is untouched. That is correct.

However, if `chrome.tabs.query` succeeds and returns `tabs[]` but `tabs[0]` is undefined (e.g., a brief window where no tab is focused after window-close), `startNewChat` silently mints `noTabFallback` AND the user's existing conversation in their previous tab remains stale. The UI shows a fresh chat but the persistence layer still holds the old conversation under the old tab.id. The next time the user activates that tab, `swapToTabConversation` will restore the stale conversationId, mismatching the visible UI state.

This is a low-probability but non-trivial UX inconsistency: the user clicks "New Chat", sees a fresh chat, switches tabs, switches back, and finds the old conversation re-loaded.

**Fix:** When the active tab cannot be determined in the overwrite path, surface the failure so the caller can decide. Either:

- Resolve to a sentinel and have `startNewChat` show a "could not start a fresh chat" error message, OR
- Defer the overwrite until the next activation, OR (minimal change)
- Add a debug log + comment documenting the edge case:

```javascript
if (!tab || typeof tab.id !== 'number') {
  if (overwrite === true) {
    console.warn('[FSB] startNewChat: no active tab; existing entries preserved');
  }
  var noTabFallback = _mintConversationId();
  conversationId = noTabFallback;
  return noTabFallback;
}
```

### WR-03: Retry buttons bypass the FINT-20 lockout's visual affordance

**File:** `extension/ui/sidepanel.js:320-325`, `1637-1640`

**Issue:** Two retry-button handlers programmatically set `chatInput.textContent` and call `handleSendMessage()`:

- `handleReconComplete` (line 322): "Retry with Site Map" button
- `automationError` runtime listener (line 1639): "Retry" button

When the active tab is foreign-owned, FINT-20 dims chatInput/sendBtn/stopBtn/micBtn and sets `aria-disabled='true'`. But these retry buttons are NOT in the controls list and are NOT dimmed. The user sees them as fully active. Clicking them WILL hit the defense-in-depth gate inside `handleSendMessage` (line 742, `_isActiveTabForeignOwned`) which fail-closes the send — so no data leaks — but the retry message is silently dropped without explanation.

This is a UX gap rather than a security or data-loss bug (the gate works), but it creates a "click does nothing" experience that conflicts with the D-11 contract that the chip + dimmed controls are the user-visible explanation.

**Fix:** Either (a) add retry buttons to the lockout's `controls` array so they dim with the rest, or (b) wrap the click handler with the same `_isActiveTabForeignOwned()` check and show a user-facing message:

```javascript
retryBtn.addEventListener('click', async () => {
  if (await _isActiveTabForeignOwned()) {
    addMessage('Cannot retry while another agent owns the active tab.', 'system');
    return;
  }
  retryDiv.remove();
  chatInput.textContent = request.task;
  handleSendMessage();
});
```

Option (a) is preferable because it matches the rest of the lockout pattern; option (b) requires touching every retry button.

## Info

### IN-01: ENVELOPE_VERSION upgrade path is not addressed

**File:** `extension/ui/sidepanel-tab-conv-store.js:24`, `43`, `203-205`

**Issue:** `ENVELOPE_VERSION = 1` is a hard constant, and `isValidEnvelope` rejects any envelope where `env.v !== ENVELOPE_VERSION`. When (not if) a future phase needs to bump the schema to v2 (e.g., to add per-tab metadata, message history, branch state), `migrateLegacyConversationKey` will silently discard the entire v1 envelope and start fresh — losing every user conversation in every open tab.

Phase 11 doesn't introduce the bug (there is no v2 yet) but the pattern leaves a footgun for the next phase that touches this module.

**Fix:** Add a TODO + a forward-compatible upgrade hook now:

```javascript
function isValidEnvelope(env) {
  if (!env || typeof env !== 'object') return false;
  // TODO: when bumping ENVELOPE_VERSION, replace this exact check with a
  // version-aware migration in migrateLegacyConversationKey (see Phase 10
  // D-04 pattern for lifecycle envelope schema migration).
  if (env.v !== ENVELOPE_VERSION) return false;
  // ...
}
```

Optional: have `migrateLegacyConversationKey` detect `env.v < ENVELOPE_VERSION` and call a `_migrateV1ToV2` upgrader rather than overwriting with `emptyEnvelope()`.

### IN-02: Magic number DEFAULT_CAP = 50 is documented in comments but not a named contract

**File:** `extension/ui/sidepanel-tab-conv-store.js:23`, `90-103`, `122-142`

**Issue:** The 50-tab cap is set at module scope but `_enforceLruCap` accepts an optional `cap` parameter. The public API (`ensureTabConversation`) hard-wires `_enforceLruCap(envelope, DEFAULT_CAP)` (line 140), so the parameter is currently dead code. If a future caller passes a different cap to `ensureTabConversation`, the override silently ignored.

**Fix:** Either (a) plumb a `cap` parameter through `ensureTabConversation` for consistency, or (b) hard-wire `_enforceLruCap` to always use `DEFAULT_CAP` and remove the unused parameter to prevent dead-code drift. Option (b) is simpler:

```javascript
function _enforceLruCap(envelope) {
  if (!isValidEnvelope(envelope)) return;
  while (envelope.lru.length > DEFAULT_CAP) { ... }
  ...
}
```

### IN-03: swapToTabConversation discards in-memory chat messages without persisting them

**File:** `extension/ui/sidepanel.js:121-133`

**Issue:** On `chrome.tabs.onActivated`, `swapToTabConversation` calls `chatMessages.innerHTML = ''` to clear the visible UI before swapping to the next tab's `conversationId`. The previous tab's visible messages (the user's chat bubbles + AI responses) are NOT persisted anywhere — they live only in DOM. When the user activates the previous tab again, only the `conversationId` is restored; the message history is gone.

This appears to be intentional per D-17 (lazy mint only persists the conversationId, not the message bodies), and the conversationId is what background.js uses to thread context for the next AI turn. But the user-visible behavior is: "switch tabs, switch back, my chat history is missing." There is no inline comment explaining this is by design.

**Fix:** Add a comment documenting the contract so the next reader doesn't file this as a bug:

```javascript
// Phase 11 FINT-21 -- D-17 contract: only conversationId is persisted
// per-tab; the visible message DOM is intentionally discarded on swap.
// Context continuity is preserved server-side via conversationId.
if (chatMessages && typeof chatMessages.innerHTML !== 'undefined') {
  chatMessages.innerHTML = '';
}
```

If this is NOT intentional (i.e., message history SHOULD persist per tab), that's a Phase 12 feature gap to track in REQUIREMENTS.

### IN-04: Defensive try/catch swallows errors with no telemetry breadcrumb

**File:** `extension/ui/sidepanel.js:66`, `87`, `132`, `144`, `177-181`, `412`, `431`, `503`, `521-522`, `537`, `540`

**Issue:** Phase 11 added ~10 `catch (_e) { /* swallow */ }` blocks for best-effort storage / DOM / event-listener paths. The rationale (don't poison sidepanel boot on a transient storage error) is sound, but the codebase will become impossible to debug when one of these paths starts failing in production — there is no `console.warn` breadcrumb, no analytics event, nothing.

The Phase 11 verifier confirmed 27/27 must-haves, but those checks don't exercise storage failures. A real-world `QUOTA_BYTES_PER_ITEM` exceed (chrome.storage.session has a 10MB cap) would silently drop user data with no signal.

**Fix:** Replace the silent swallows with one-line `console.warn` breadcrumbs that name the function. They are stripped from production logs by the existing log-level config but keep DevTools usable:

```javascript
catch (e) { console.warn('[FSB sidepanel] _persistEnvelope failed:', e?.message); }
```

This is consistent with the pattern already used at line 472 (recon suggestion check), 1526 (recoverLatestThreadTerminalOutcome), and elsewhere in sidepanel.js — Phase 11's new catches are the OUTLIER for being silent.

---

**Files reviewed (full content):**
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/owner-chip.js` (163 lines)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/sidepanel.js` (2415 lines)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/popup.js` (1067 lines)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/sidepanel-tab-conv-store.js` (252 lines)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/sidepanel.html` (131 lines)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/sidepanel.css` (1674 lines)

**Files cross-referenced (invariant checks):**
- `/Users/lakshmanturlapati/Desktop/FSB/automation/extension/ui/popup.html` (script load order)
- Git log for `extension/ai/agent-loop.js` and `extension/ai/tool-definitions.js` (INV-01/02/04)
- `lattice/` HEAD SHA (INV-06)

_Reviewed: 2026-06-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Fixes Applied

**Applied:** 2026-06-07
**Scope:** Warnings only (WR-01, WR-02, WR-03). Info findings (IN-01..04) deferred per default policy.
**Applier:** Claude (gsd-code-fixer)
**Test gate:** `node tests/sidepanel-tab-aware-smoke.test.js` -> 39 PASS / 0 FAIL after every fix. `npm test` exit 0 end-to-end.
**Invariants verified:** INV-04 `grep -c "setTimeout" extension/ai/agent-loop.js` = 8 (unchanged). INV-06 `cd lattice && git rev-parse HEAD` = `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (unchanged).

### WR-01: Concurrent _persistEnvelope() race -- FIXED

**Commit:** `482d68d7`
**File:** `extension/ui/sidepanel.js`
**Fix shape:** Added module-scope `_envelopeWriteChain` + `_serializeEnvelopeWrite(fn)` mirroring `withRegistryLock` at `extension/utils/agent-registry.js:180-185`. Wrapped `_persistEnvelope`'s storage write inside the serializer so every existing call site (`dropTabConversation` + `ensureTabConversationForActiveTab`) linearizes at the storage boundary without API changes. The `.then(fn, fn)` shape keeps the chain alive across rejections; the `.catch` on the assignment prevents `UnhandledRejection` leakage. Race window closed: drop-on-tab-close + ensure-on-user-send now serialize even when they fire within the same millisecond.

### WR-02: ensureTabConversationForActiveTab silently preserves stale entry -- FIXED

**Commit:** `5ec4cb26`
**File:** `extension/ui/sidepanel.js`
**Fix shape:** Per WR-02 recommended minimal-change patch, added a `console.warn` breadcrumb inside the `!tab` branch when `overwrite === true`. Message: `[sidepanel] ensureTabConversationForActiveTab(force=true) skipped -- no active tab in current window`. Behavior NOT changed: still falls through to `noTabFallback` mint with no auto-recovery; the pre-existing entry remains untouched. The breadcrumb surfaces the rare edge case (side panel open in inactive window context, or brief no-focused-tab window after a window close) for telemetry / DevTools so it is no longer silent. No EMOJI per CLAUDE.md.

### WR-03: Retry buttons bypass FINT-20 visual lockout -- FIXED

**Commit:** `2d410eb6`
**File:** `extension/ui/sidepanel.js`
**Fix shape:** Per WR-03 recommended option (b), wrapped each retry click handler in `await _isActiveTabForeignOwned()` and early-return with a `console.warn` breadcrumb. Option (b) is the correct choice here because retry buttons can be created AFTER a lockout state is established (they would miss `applyInputLockout`'s control snapshot). Three sites updated:

1. `handleReconComplete` retry button (`Retry with Site Map`)
2. `automationError` retry button (`Retry`)
3. History list delegated click handler (`.history-replay-btn` -> `startReplay`) -- replay dispatches a `replaySession` message that targets the active tab, so it needs the same gate as the direct retry buttons

Without this fix the click silently dropped the user's intent because `handleSendMessage`'s existing runtime gate fail-closed at line ~801 without surfacing the cause. Now the breadcrumb is emitted and the UX is consistent with D-11 (chip + dimmed controls are the user-visible explanation; the underlying gate honors the same contract). No EMOJI per CLAUDE.md.

### Hard Invariant Re-verification

| Invariant | Pre-fix baseline | Post-fix value | Status |
|-----------|------------------|----------------|--------|
| INV-04 setTimeout count in agent-loop.js | 8 | 8 | UNCHANGED |
| INV-06 lattice HEAD SHA | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | UNCHANGED |
| INV-01/02 tool-definitions.js / deprecated agent modules | untouched | untouched | UNCHANGED |
| Smoke test `tests/sidepanel-tab-aware-smoke.test.js` | 39 PASS / 0 FAIL | 39 PASS / 0 FAIL | UNCHANGED |
| Full `npm test` | exit 0 | exit 0 | UNCHANGED |

### Info findings -- NOT applied (deferred per default policy)

| ID | Title | Reason |
|----|-------|--------|
| IN-01 | ENVELOPE_VERSION upgrade path not addressed | Info severity; future-phase footgun. Defer to Phase 12+ if schema bump is needed. |
| IN-02 | DEFAULT_CAP = 50 magic-number dead code path | Info severity; current callers all pass DEFAULT_CAP. Hardening can land alongside the next sidepanel-tab-conv-store change. |
| IN-03 | swapToTabConversation discards in-memory chat messages | Info severity; per CONTEXT D-17 lazy-mint contract this is intentional. Documentation-only fix can land in any Phase 11 follow-up. |
| IN-04 | Defensive try/catch swallows errors with no telemetry breadcrumb | Info severity; consistent pattern across ~10 sites. Whole-codebase pattern-fix scope; out of scope for warning-only fix pass. |

_Fixes applied: 2026-06-07_
_Applier: Claude (gsd-code-fixer)_
_Iteration: 1_
