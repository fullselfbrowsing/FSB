---
slug: phase-11-tab-swap-stale
status: resolved
fix_commit: ba107c87df20726b8c9f0d432554bacd0a003edc
trigger: |
  UAT-11 reveal: while autopilot is running on Tab A, opening a brand new Tab B does NOT reset the sidepanel.
  Sidepanel chip stays "owned by FSB Autopilot" and input stays locked, as if Tab B were also bound to the
  running task. Expected: on tab activate to a free tab, chip hides + input re-enables + chat area clears
  (Tab B has no prior conversation). Actual: state appears frozen on Tab A's bound view.
created: 2026-06-08
updated: 2026-06-08
phase: 11
phase_slug: tab-aware-side-panel-surface
related_commits:
  - 6a499368  # Plan 11-03 sidepanel boot path refactor (swapToTabConversation + onActivated extension)
  - 482d68d7  # WR-01 envelope write serialization
  - 5ec4cb26  # WR-02 surface no-active-tab edge case
  - 2d410eb6  # WR-03 retry button foreign-owned gate
hard_invariants:
  - INV-04 BYTE-FROZEN — `grep -c "setTimeout" extension/ai/agent-loop.js` = 8
  - INV-06 BYTE-FROZEN — lattice HEAD e95067bfa87ed1b75838fc3b3ef217a3b01acbd3
  - Surfaces in scope only: extension/ui/sidepanel.js, extension/ui/owner-chip.js, extension/ui/sidepanel-tab-conv-store.js
---

# Phase 11 — Tab swap not updating sidepanel state

## Symptoms

**Expected behavior:**
When user switches from Tab A (where autopilot is running) to a fresh Tab B:
1. `chrome.tabs.onActivated` fires for Tab B's tabId
2. `refreshOwnerChip()` re-evaluates ownership against Tab B's tabId — finds Tab B is unowned (no agent in registry, no lifecycle entry)
3. Owner chip hides via `shouldShowOwnerChip` returning false (ownerAgentId for Tab B = null)
4. `applyInputLockout(false)` re-enables chatInput, sendBtn, micBtn, stopBtn
5. `swapToTabConversation(tabBId)` clears `chatMessages.innerHTML` (Tab B has no prior conversation; lazy mint deferred to first send)

**Actual behavior:**
After switching to Tab B:
- Owner chip still shows "owned by FSB Autopilot"
- Chat input + send + mic + stop still dimmed/disabled
- Chat area still shows Tab A's running-task conversation (or stale state)

It appears the sidepanel does NOT respond to the tab switch at all — as if `chrome.tabs.onActivated` is either not firing in the sidepanel context, or the handler is throwing/early-returning before reaching `refreshOwnerChip` + `swapToTabConversation`.

**Error messages:** none reported by user. Need DevTools inspection.

**Timeline:** First observed during UAT-FINAL on 2026-06-08, immediately after extension reload. Did NOT exist pre-Phase-11 because pre-Phase-11 there was no per-tab swap — chat was global.

**Reproduction:**
1. Open `chrome://extensions` and reload FSB extension (pick up Phase 11 + auto-fix commits).
2. Open Tab A on any URL (e.g. https://example.com). Open FSB sidepanel.
3. Verify chip hidden + input enabled (Tab A is free) — PASSES.
4. Type an autopilot task in chat. Click Run. Observe chip flips to "owned by FSB Autopilot" + input dims — PASSES (this is the Phase 11 visible lockout).
5. While the task runs, open a new Tab B (any URL). Switch to Tab B.
6. Observe sidepanel — FAILS to swap. Still shows Tab A's bound view.

## Suspect hypotheses (initial)

### H1 — chrome.tabs.onActivated does not fire in the sidepanel page context
The Chrome MV3 sidepanel page is hosted in its own document; `chrome.tabs.onActivated` may not be exposed there the way it is in popup/background contexts. If so, the listener silently never fires.

Evidence to gather: `console.log('[sidepanel] onActivated fired:', activeInfo.tabId)` inside the listener. Repro and check SW or sidepanel console.

### H2 — chrome.tabs.onActivated fires but refreshOwnerChip is awaiting the in-flight envelope write from the autopilot task
After WR-01 the writes serialize through `_envelopeWriteChain`. If autopilot triggers many writes via `recordVisualSessionTick` or `recordDispatch` (no — those write to different store), the chain shouldn't block the chip read. But `lookupClientLabel` async + `_isActiveTabForeignOwned` async + ownership-registry read all happen before chip render — any one of them stalling holds the chip on Tab A's last-rendered state.

Evidence to gather: timing of refreshOwnerChip start vs end; whether it ever resolves on tab switch.

### H3 — chip + lockout state are reading from module-scope variables NOT updated synchronously with tabId
sidepanel.js may carry `_currentOwnerAgentId` or similar module-scope var that's only set in the previous refreshOwnerChip. If the new refresh path early-returns before updating these, the visible state stays frozen.

Evidence to gather: read sidepanel.js for module-scope variables that gate rendering.

### H4 — sidepanel.js onActivated listener is registered AFTER autopilot start side-effects have already poisoned module state
Phase 11 added the listener inside DOMContentLoaded. If DOMContentLoaded fired before the listener wrap, the registration would be silently lost. Unlikely given existing pre-Phase-11 onActivated for chip refresh worked, but worth confirming the registration path.

Evidence to gather: grep for `chrome.tabs.onActivated.addListener` in sidepanel.js — expect 1 hit (extended in Phase 11), not 2.

### H5 — chrome.tabs.onActivated fires correctly + handler runs but `chrome.tabs.query({active: true, currentWindow: true})` returns Tab A still (stale window context)
If sidepanel is in a separate window context from the active tab (e.g. side panel docked to a different window than the user is browsing in), `currentWindow: true` may return the sidepanel's hosting window rather than the user's active browsing window. The activeInfo.tabId would be correct but downstream queries would fetch the wrong tab.

Evidence to gather: log activeInfo.tabId vs `chrome.tabs.query({active: true, currentWindow: true})` — see if they diverge.

## Current Focus

**hypothesis:** ROOT CAUSE FOUND — H3 (module/DOM-state poisoning) confirmed for input controls, plus secondary defects in `refreshOwnerChip` early-return paths.

**test:** Read sidepanel.js applyInputLockout body + refreshOwnerChip body + updateSendButtonState + listener registration.

**next_action:** Apply minimal fix (3 small changes), re-run smoke, commit.

## Evidence

- 2026-06-08T01:00 — Read extension/manifest.json. "tabs" + "sidePanel" permissions present (lines 12-14). chrome.tabs.onActivated IS available in the sidepanel document context per MV3 docs. H1 weakened.

- 2026-06-08T01:00 — Read extension/ui/sidepanel.html. Script tag chain ends at sidepanel.js (line 129). chatInput/sendBtn/stopBtn/micBtn DOM ids all present. chip element id="fsb-owner-chip" present at line 26. fsb-lockout-aria-description sr-only span present at line 27.

- 2026-06-08T01:00 — grep chrome.tabs.onActivated extension/ui/sidepanel.js: exactly ONE listener registration (line 567), wrapping refreshOwnerChip + swapToTabConversation sequentially. H4 (double-registration / lost-registration) refuted by source.

- 2026-06-08T01:00 — popup.js does NOT register chrome.tabs.onActivated (short-lived; line 229 comment confirms). No comparable working pattern to diff against.

- 2026-06-08T01:00 — Read extension/ui/sidepanel.js lines 420-461 (applyInputLockout). When called with foreignOwned=false, the BUTTON branch ONLY does `el.removeAttribute('aria-disabled')`. It does NOT set `el.disabled = false`. The comment claims `updateSendButtonState()` handles button-disabled restoration. But updateSendButtonState (line 783-786) ONLY touches `sendBtn.disabled`. So stopBtn and micBtn `disabled=true` set by applyInputLockout(true) is NEVER cleared by applyInputLockout(false). **CONFIRMED ROOT CAUSE for "input controls stay disabled" symptom.**

- 2026-06-08T01:00 — Read extension/ui/sidepanel.js lines 491-553 (refreshOwnerChip). Two early-return paths hide the chip but do NOT call applyInputLockout(false): (a) line 493-494 chip-not-in-DOM (defensive); (b) line 500-505 no-active-tab. Plus the outer catch at line 550-552 swallows errors without unlocking. None of these typically fire, but they are defective on the unlock contract — a stray throw inside the chip-render block leaves controls locked.

- 2026-06-08T01:00 — Per Chrome dev docs (WebSearch): chrome.tabs.onActivated fires reliably in sidepanel context for tab switches. Firefox bug 1342207 noted that "opening a new window doesn't change the active tab because that tab is already active when it's created", but this is window-scoped, not new-tab-scoped. For brand-new-tab opens via Ctrl+T in the same window, onActivated DOES fire. H1 refuted by external evidence + Chrome docs example.

- 2026-06-08T01:00 — Verified existing smoke test Part 3.4 asserts `applyInputLockout(false)` clears aria-* + class + restores `contenteditable=true` on the DIV. It does NOT assert `el.disabled === false` on the BUTTON elements, so the smoke test passed all along while the bug shipped. The fix must add a Part 3.5 assertion.

- 2026-06-08T01:00 — Baseline smoke run: 39 PASS / 0 FAIL (node tests/sidepanel-tab-aware-smoke.test.js).

## Eliminated

- hypothesis: H1 (chrome.tabs.onActivated unavailable in sidepanel context)
  evidence: Chrome MV3 docs confirm API is available. Permissions in manifest are correct. The pre-Phase-11 listener registered identically and worked for chip refresh. No code change in Phase 11 removed the API surface.
  timestamp: 2026-06-08T01:00

- hypothesis: H2 (envelope-write chain stalling refreshOwnerChip)
  evidence: refreshOwnerChip does NOT await `_envelopeReadyPromise` nor touch `_envelopeWriteChain`. The chain is only awaited by ensureTabConversation / dropTabConversation / swapToTabConversation. refreshOwnerChip is independent and cannot stall on the envelope chain.
  timestamp: 2026-06-08T01:00

- hypothesis: H4 (listener registered too late or twice)
  evidence: grep confirms exactly one registration site (line 567). Top-level script execution registers BEFORE any DOMContentLoaded async work runs. Pre-Phase-11 listener registered at the same site and worked.
  timestamp: 2026-06-08T01:00

- hypothesis: H5 (currentWindow context mismatch)
  evidence: `chrome.tabs.query({active:true, currentWindow:true})` from the sidepanel page returns the active tab in the sidepanel's hosting window. For single-window-single-tab-switch scenarios (the user's repro), this returns Tab B correctly. The H5 risk only matters for multi-window scenarios outside the reported repro scope.
  timestamp: 2026-06-08T01:00

## Resolution

**root_cause:**
Primary: `applyInputLockout(false)` in extension/ui/sidepanel.js (lines 441-449) does NOT restore `el.disabled = false` on stopBtn and micBtn when unlocking. The comment says updateSendButtonState handles button state, but that helper only touches sendBtn. Once locked by `applyInputLockout(true)` (line 432-434), stopBtn and micBtn remain `disabled=true` even after `applyInputLockout(false)` is called on tab switch.

Secondary: `refreshOwnerChip` (extension/ui/sidepanel.js) has two early-return paths (chip-not-in-DOM, no-active-tab) and a catch-all that hide/clear chip state without calling `applyInputLockout(false)`. These leave control state out-of-sync with chip visibility on the unlock path.

Defensive concern: `chrome.tabs.onActivated` is the SOLE refresh trigger for tab-switch. Per RESEARCH and best-practice, supplementing with `chrome.windows.onFocusChanged` provides defense-in-depth for the rare MV3 case where a brand-new-tab event sequence may not be observed cleanly by a single listener.

**fix:**
1. extension/ui/sidepanel.js applyInputLockout(false) BUTTON branch: explicitly set `el.disabled = false` on stopBtn and micBtn (NOT sendBtn — sendBtn is governed by isRunning via updateSendButtonState per the design contract).
2. extension/ui/sidepanel.js refreshOwnerChip early-return + catch paths: call `applyInputLockout(false)` whenever the chip is hidden so the unlock contract is honored.
3. extension/ui/sidepanel.js: add chrome.windows.onFocusChanged listener that re-runs refreshOwnerChip + swapToTabConversation (using `chrome.tabs.query({active:true, windowId})` to resolve the active tab of the focused window). Defense-in-depth backstop for onActivated misses.
4. tests/sidepanel-tab-aware-smoke.test.js: add Part 3.5 asserting `stopBtn.disabled === false` AND `micBtn.disabled === false` after applyInputLockout(false). This pins the regression so a future refactor cannot reintroduce the bug.

**verification:** Re-run `node tests/sidepanel-tab-aware-smoke.test.js`. Expect >= 40 PASS / 0 FAIL (39 baseline + new Part 3.5).

**files_changed:**
- extension/ui/sidepanel.js
- tests/sidepanel-tab-aware-smoke.test.js
