---
slug: phase-11-sidepanel-reopen-empty
status: resolved
trigger: |
  Closing the sidepanel and reopening it (with the working tab still open OR with a new tab) shows
  an empty chat. Messages from the prior conversation do not restore. User expects the chat history
  to persist on sidepanel reopen.
created: 2026-06-08
updated: 2026-06-08T00:30:00Z
phase: 11
phase_slug: tab-aware-side-panel-surface
related_commits:
  - 6a499368  # Plan 11-03 sidepanel boot path refactor (initTabConversationStore)
  - 6e8531da  # Plan 11-02 (FINT-20)
hard_invariants:
  - INV-04 BYTE-FROZEN — `grep -c "setTimeout" extension/ai/agent-loop.js` = 8
  - INV-06 BYTE-FROZEN — lattice HEAD e95067bfa87ed1b75838fc3b3ef217a3b01acbd3
  - Surfaces in scope only: extension/ui/sidepanel.js, extension/ui/owner-chip.js, extension/ui/sidepanel-tab-conv-store.js, extension/ui/sidepanel.html
---

# Phase 11 — Sidepanel reopen shows empty chat

## Symptoms

**Expected behavior:**
1. User runs an autopilot task in sidepanel on Tab A — messages appear in chat.
2. User closes the sidepanel.
3. User reopens the sidepanel on the same Tab A.
4. **Expected:** chat messages from the prior session restore from the per-tab conversation envelope (the conversationId for Tab A is bound; the FSB sessions store has the messages keyed by that conversationId; sidepanel boot should hydrate the chat DOM).

**Actual behavior:**
- Sidepanel reopens with EMPTY chat (no messages rendered).
- conversationId may still be bound to the tab (per Phase 11 envelope) but no messages render.

User confirmed via AskUserQuestion: "Both" scenarios fail (same-tab reopen AND new-tab reopen).

## Context

This is potentially a pre-existing UX gap that Phase 11 inherited, not strictly a regression:
- Pre-Phase-11: single global `fsbSidepanelConversationId`. Sidepanel close + reopen → DOM disposed + recreated → blank chat (conversationId persists but messages don't auto-render).
- Phase 11: per-tab `fsbSidepanelTabConversations` envelope. Sidepanel boot calls `initTabConversationStore` (line ~74), which sets `conversationId` for the active tab. Per RESOLVED Open Question #1 in 11-RESEARCH.md: "swap updates conversationId only; user's first send rebuilds via existing addMessage path".

The RESOLVED #1 decision applied to TAB SWAP (chrome.tabs.onActivated mid-session). It did NOT address SIDEPANEL REOPEN (page load from scratch).

User expectation: on sidepanel reopen with an existing per-tab conversationId, the prior conversation's messages should render into chatMessages so the user sees the chat history.

## Hypotheses

### H1 — Sidepanel boot never calls a chat-restore path
After `initTabConversationStore` resolves the conversationId from the envelope, sidepanel.js DOMContentLoaded continues without calling any "load messages for this conversationId and render" path. The chat stays empty by default.

Evidence to gather: read sidepanel.js DOMContentLoaded body around `initTabConversationStore` call.

### H2 — A restore path exists but doesn't fire because conversationId isn't ready in time
If there's a `loadSession(conversationId)` call somewhere on boot, it might be running BEFORE `initTabConversationStore` resolves the per-tab conversationId. So loadSession runs with an empty or default ID, returns nothing.

Evidence to gather: check ordering of restore calls vs initTabConversationStore.

### H3 — The FSB sessions store doesn't carry the messages
If the sidepanel never persisted messages to the sessions store (only displayed them in DOM), there's nothing to restore. This would be a deeper UX gap — messages would need to be persisted on send/receive into the sessions store, then queried on boot.

Evidence to gather: search for `chrome.storage` writes in handleSendMessage + the receive path; verify messages are written somewhere persistent keyed by conversationId.

### H4 — Hydration was intentionally deferred per RESOLVED Open Question #1
The RESOLVED decision in 11-RESEARCH said no auto-render on swap. If the implementation applied the same logic to sidepanel BOOT (treating boot as a swap), that's a misinterpretation — the user's UX expectation is reasonable and the policy should distinguish boot from swap.

Evidence to gather: read RESOLVED #1 verbatim + check if sidepanel boot path inherited the same "no render" behavior.

## Current Focus

**hypothesis CONFIRMED:** A hybrid of H1 + H3 + H4. The persistence layer for chat messages is partly present (fsbSessionLogs has commands + actionHistory + completionMessage keyed by conversationId in the index), but the sidepanel never wires a hydrate-on-boot path. A scaffold (recoverLatestThreadTerminalOutcome) exists from a previous half-done effort but it is never invoked AND depends on three undeclared module-scope variables (historySessionId, activeConversationId, lastRenderedTerminalSessionId) plus a never-defined persistSidepanelThreadState. This dead-code condition predates Phase 11.

**fix scope:** UI surface only (extension/ui/sidepanel.js + sidepanel.html unchanged). No background.js / agent-loop.js / lattice touch. The fix adds:
1. Declarations for historySessionId / activeConversationId / lastRenderedTerminalSessionId + a no-op persistSidepanelThreadState (rehabilitates the existing scaffolding without changing its behavior).
2. A new hydrateChatFromConversationId(convId) function that reads fsbSessionLogs + fsbSessionIndex, filters by conversationId, sorts ascending, and replays each command (user message) + each session's completionMessage (ai message) into the chat DOM via addMessage / addCompletionMessage.
3. A boot-time call from DOMContentLoaded after initTabConversationStore (only if conversationId is non-null) that fires hydrateChatFromConversationId BEFORE the welcome message — so the welcome only shows on empty chats.
4. A swapToTabConversation enhancement: after clearing chatMessages, if the new tab's conversationId is non-null, also hydrate.

**expecting:** sidepanel reopen on Tab A renders the prior conversation's user prompts + ai completions in correct order; per-tab envelope swap also restores chat on tab activation if the target tab has a bound convId (this also resolves the "swap shows blank" UX gap that RESOLVED #1 left as v0.11+ enhancement — calling out below).

## Evidence

- timestamp: 2026-06-08T00:00:00Z
  checked: extension/ui/sidepanel.js lines 1-230 (module state + envelope helpers)
  found: conversationId is module-scope let (line 11), restored from envelope at line 121 if entry exists, else null per D-17 lazy mint
  implication: boot has the conversationId in memory by line 652 — a downstream hydrate call has the key it needs

- timestamp: 2026-06-08T00:00:01Z
  checked: extension/ui/sidepanel.js lines 636-765 (DOMContentLoaded body)
  found: DOMContentLoaded calls initTabConversationStore (line 652) then immediately moves to analytics + lock check + getStatus + storage.set + refreshOwnerChip + history list listener + clearAll handler + speech-to-text + addMessage('Welcome...') + chatInput.focus(). NO call to any chat-restore function.
  implication: H1 confirmed — sidepanel boot path lacks any hydration call

- timestamp: 2026-06-08T00:00:02Z
  checked: extension/ui/sidepanel.js lines 1464-1633 (renderAutomationCompletionPayload + getLatestThreadSessionRecord + recoverLatestThreadTerminalOutcome)
  found: recoverLatestThreadTerminalOutcome is DEFINED but never CALLED anywhere in the file. It references historySessionId, activeConversationId, lastRenderedTerminalSessionId and calls persistSidepanelThreadState() — none of which are declared / defined in sidepanel.js. Confirmed via grep: no `let historySessionId`, no `function persistSidepanelThreadState`.
  implication: A previous half-done restore effort left dead scaffolding; calling this function as-is would throw ReferenceError on the first undeclared assignment

- timestamp: 2026-06-08T00:00:03Z
  checked: git show d1c5cab0:extension/ui/sidepanel.js (Aug 2025 baseline pre-Phase-11)
  found: Same broken references existed in d1c5cab0 (lines 981-1134 of that revision). historySessionId / activeConversationId / lastRenderedTerminalSessionId / persistSidepanelThreadState all referenced but never declared, and recoverLatestThreadTerminalOutcome never called.
  implication: This is a PRE-EXISTING UX gap, not a Phase 11 regression. Phase 11 surface-scope work uncovered it because per-tab history was advertised in the user-facing change.

- timestamp: 2026-06-08T00:00:04Z
  checked: extension/utils/automation-logger.js lines 700-830 (saveSession persistence shape)
  found: fsbSessionLogs keyed by sessionId stores: commands[] (user task texts in chronological order via append mode at line 728), actionHistory (successful tool actions), completionMessage / result / error / outcome, conversationId, historySessionId, commandCount, lastTask. Same conversationId aggregates multi-turn follow-ups via the conversationSessions map in background.js line 2156-2160 (5 follow-ups reuse one session id; new conversation = new session id).
  implication: H3 partly false — messages ARE persisted, but as a (commands[], completionMessage) tuple per session, not as a chat-message array. Reconstructable: each session row contributes user+ai message pairs, multiple session rows can share a conversationId via the conversationSessions continuity map. Hydrate path: query fsbSessionIndex by conversationId, sort by startTime ascending, for each session render its commands[] as user messages followed by completionMessage as ai message.

- timestamp: 2026-06-08T00:00:05Z
  checked: 11-RESEARCH.md RESOLVED Open Question #3 (line 1105)
  found: "It does NOT trigger an extra chatMessages render — the existing post-migration boot path already restores the chat surface from the session store via the existing handler chain."
  implication: H4 confirmed — RESEARCH assumed the existing handler chain works. It does not. The fix corrects the assumption + delivers what RESOLVED #3 promised. Need to update RESOLVED #3 verbiage to reflect the actual implementation (hydrate-on-boot is now wired, not assumed).

- timestamp: 2026-06-08T00:00:06Z
  checked: 11-RESEARCH.md RESOLVED Open Question #1 (line 1099)
  found: "swap updates conversationId only; user's first send rebuilds via existing addMessage path" was the locked decision for tab-swap behavior. Author noted "auto-render on swap" is a v0.11+ enhancement.
  implication: The user reported BOTH "same-tab reopen" AND "new-tab reopen" fail. Same-tab reopen IS boot scope (RESOLVED #3 territory). New-tab-reopen is ALSO boot scope (sidepanel was closed, new tab is just the active tab on reopen). Tab-SWAP mid-session is a separate UX flow not directly reported as broken. To stay conservative, the fix hydrates on BOOT only and ALSO on swap-to-tab-with-bound-convId (because swap clears chatMessages, leaving nothing — which is exactly the same UX problem as boot). RESOLVED #1 will be amended inline to clarify: "swap with NO bound convId leaves chatMessages empty (D-17 lazy mint); swap to a bound convId now hydrates that conversation's prior messages — same hydrate path as boot."

- timestamp: 2026-06-08T00:00:07Z
  checked: tests/sidepanel-tab-aware-smoke.test.js baseline run
  found: 41 PASS / 0 FAIL with current code
  implication: Smoke baseline holds — fix MUST keep it green

## Eliminated

- hypothesis: H2 -- restore path exists but fires before envelope is ready (ordering race)
  evidence: no restore path exists in the file at all; recoverLatestThreadTerminalOutcome is defined but never called from anywhere; not a timing/ordering issue
  timestamp: 2026-06-08T00:00:08Z

## Resolution

root_cause: |
  Pre-existing UX gap surfaced by Phase 11's per-tab conversation envelope feature.

  Two-layer cause:

  1. Sidepanel boot path never wires a chat-restoration call. DOMContentLoaded
     calls initTabConversationStore (which resolves the per-tab conversationId
     from the envelope) then proceeds directly to analytics, lock check, getStatus,
     refreshOwnerChip, history list listener wiring, speech-to-text, welcome
     message, focus -- with no hydration step in between. There is no
     restoreChat / loadConversation / hydrateMessages call anywhere on boot.

  2. A scaffolding function (recoverLatestThreadTerminalOutcome) exists from
     a previous half-done effort. It is DEFINED but NEVER INVOKED anywhere
     in sidepanel.js. It also references three module-scope variables
     (historySessionId, activeConversationId, lastRenderedTerminalSessionId)
     and a function (persistSidepanelThreadState) that are NEVER DECLARED.
     Calling this scaffolding as-is would throw ReferenceError on the first
     assignment. Confirmed via git show d1c5cab0 -- the dead references
     predate Phase 11 (visible in the August 2025 pre-Phase-11 baseline).

  RESOLVED Open Question #3 in 11-RESEARCH.md assumed "the existing post-migration
  boot path already restores the chat surface from the session store via the
  existing handler chain" -- but no such handler chain was wired. RESOLVED #1
  similarly handled tab-SWAP semantics but did not address the analogous
  sidepanel-BOOT scenario the user reported. Phase 11 inherited and surfaced
  this gap; it did not cause it.

fix: |
  Three changes in extension/ui/sidepanel.js + one doc update.

  A. Declare module-scope thread state + add no-op stub for the existing
     pre-Phase-11 scaffolding so it can no longer throw ReferenceError if
     ever invoked. Variables: historySessionId, activeConversationId,
     lastRenderedTerminalSessionId. Stub: persistSidepanelThreadState() (no-op;
     thread state is derived from the envelope + fsbSessionLogs, no separate
     persist surface needed).

  B. Add async function hydrateChatFromConversationId(convId):
     - Reads chrome.storage.local fsbSessionLogs + fsbSessionIndex.
     - Filters sessionIndex entries by matching conversationId.
     - Sorts ascending by startTime (chronological replay).
     - For each session row: replays session.commands[] as 'user' messages
       (with fallback to session.lastTask for older rows without commands[]),
       then renders session.completionMessage as an 'ai' completion (partial
       outcome wraps a 'Partial result' label; failure outcome routes via
       addMessage('error') so the dismiss button + auto-collapse kick in).
     - Clears chatMessages internally before rendering so repeated calls
       are idempotent (no duplicate transcripts).
     - Updates lastRenderedTerminalSessionId + historySessionId + activeConversationId
       so the dead-code scaffolding (if ever activated) sees consistent state.
     - Returns count of session rows rendered. Best-effort: storage failures
       degrade to 0 (caller-side fallback fires the welcome message).

  C. Wire into the boot path: DOMContentLoaded calls
     hydrateChatFromConversationId(conversationId) AFTER initTabConversationStore
     (so the per-tab convId is already resolved) and BEFORE the welcome
     message. The welcome message only renders when hydratedCount === 0
     (fresh / empty conversation), so users see continuation instead of
     a redundant greeting.

  D. Wire into the swap path: swapToTabConversation(tabId) now also calls
     hydrateChatFromConversationId(nextConvId) when the target tab has a
     bound conversation. Unminted tabs still leave chatMessages empty (D-17
     lazy mint preserved). This is consistent with the spirit of RESOLVED
     Open Question #1: swap does no work for NEW (unbound) tabs, but tabs
     the user has chatted in already restore their transcript -- because
     not restoring is functionally identical to the boot-empty bug.

  E. Update 11-RESEARCH.md RESOLVED #1 + RESOLVED #3 inline to reflect the
     correct implementation post-fix (boot hydrate is now wired; swap hydrates
     bound conversations). Cite this debug slug for traceability.

verification: |
  - tests/sidepanel-tab-aware-smoke.test.js: 41 PASS / 0 FAIL (baseline preserved).
  - node --check extension/ui/sidepanel.js: SYNTAX OK.
  - INV-04: grep -c "setTimeout" extension/ai/agent-loop.js = 8 (frozen, untouched).
  - INV-06: lattice/ submodule untouched.
  - Surface scope: only extension/ui/sidepanel.js + .planning/phases/11-... touched. No background.js / agent-loop.js / lattice changes.
  - Code review against fix:
    * hydrateChatFromConversationId guards null/non-string convId at entry.
    * Storage read wrapped in try/catch; failure returns 0 (welcome message renders).
    * chatMessages.innerHTML cleared INTERNALLY before render (idempotent on repeat).
    * Re-uses existing addMessage / addCompletionMessage helpers (no DOM-shape duplication).
    * Boot: hydrate runs BEFORE welcome; welcome suppressed when count > 0.
    * Swap: hydrate runs AFTER manual chatMessages clear (harmless on unbound nextConvId; correct on bound).
    * D-17 lazy mint preserved: swap to unminted tab still leaves chatMessages empty (no spurious mint, no spurious render).
  - User-flow verification (paper-trace):
    * Scenario A (same-tab reopen): user runs autopilot on Tab A -> session row written with conversationId=convX, commands=["task1"], completionMessage="done"; user closes sidepanel; user reopens; initTabConversationStore resolves conversationId=convX from envelope; hydrate runs; query returns 1 session; renders "task1" user + "done" ai. Welcome suppressed. EXPECTED OUTCOME: user sees prior transcript. PASS by code-path inspection.
    * Scenario B (new-tab reopen): user runs autopilot on Tab A, closes sidepanel, opens NEW Tab B, reopens sidepanel; initTabConversationStore migrates envelope, finds NO entry for Tab B; conversationId stays null (D-17 lazy mint); hydrate returns 0; welcome renders. EXPECTED OUTCOME: blank chat + welcome (Tab B is a fresh conversation). PASS by code-path inspection. NOTE: this matches the per-tab semantics -- each tab is its own conversation. To see Tab A's history user can switch to Tab A (then swap path will hydrate it).
    * Scenario C (swap back to Tab A from Tab B): chrome.tabs.onActivated fires; swapToTabConversation peeks Tab A's bound convId; chatMessages clears; hydrate runs; transcript restores. PASS by code-path inspection.

files_changed:
  - extension/ui/sidepanel.js
  - .planning/phases/11-tab-aware-side-panel-surface/11-RESEARCH.md (RESOLVED #1 + #3 amended)
