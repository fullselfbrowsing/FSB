---
slug: cluster1-routing
status: resolved
trigger: |
  Cluster 1 completion routing / dedup investigation (--diagnose).
  Three coupled symptoms observed in production after the 260608-bu4
  fixes shipped on the automation branch.

  D: When two parallel agent tasks run (Tab A + Tab B), only the FIRST
  session's completion appears in chat. Second session never shows a
  completion in any tab's chat -- even after swap. Backend completes
  cleanly (session removed from storage, count=0 keepalive stops).

  E: For the FIRST session, the user received THREE DUPLICATE
  completion responses in the chat. Render-side or broadcast-side
  fan-out -- not a wrong-tab routing (which would still sum to 2).

  C: Clicking "Stop" on a stale task shows "Error stopping
  automation: Session not found" toast, but the task ends gracefully
  shortly after. Likely sidepanel-vs-background sessionId state
  mismatch during cleanup window. May be related to D/E timing.
created: 2026-06-08
updated: 2026-06-15
---

# Debug Session: Cluster 1 -- completion routing dedup + missing-second-session

## Resolution

Resolved by quick tasks `260608-uof` and `260608-wnz`.
`260608-uof` shipped D-FIX/E-FIX completion routing, `tabId` threading,
already-ended stop handling, and per-tab status mirrors. `260608-wnz`
then shipped the Strategy B persistence hardening: no-reopen gate,
tab-scoped status, durable background-side persistence, sessionId plus
terminal dedupe, and multi-document fanout regression coverage.

## Symptoms (from user)

- **D** Second session never shows completion in chat (any tab).
  Backend completes cleanly; message log never receives the
  completion for session 2.
- **E** First session gets THREE duplicate completion renders in chat.
- **C** Stop button on a stale task -> "Error stopping automation:
  Session not found" toast. Task ends gracefully on backend shortly
  after.

## Static evidence gathered (pre-spawn)

- background.js has 15+ `fsbBroadcastAutomationLifecycle` call sites
  (per prior grep in planner notes). Multiple sites may fire for the
  same session-end event (automationComplete + session_ended + some
  cleanup-path emit).
- `cf9eea5b` (QT-7bi-02): rerouted completion persistence via
  `request.conversationId` arg -- moved from module-scope mirror to
  explicit per-message arg.
- `19b031cc` (QT-93i-02): per-tab `_tabRunningMap`, `_activeTabIdSnapshot`,
  setter signatures take tabId.
- `9b2d7279` (QT-bu4-02): 8-site tabId thread + `_resolveTabIdForSession`.
- FSB logs show one session (session_1780943345434) cleaned up at
  18:31:35 with no errors. Subsequent WARN-level "sendSessionStatus
  delivery failed" / "No tab with id: 184/185/186/187" -- sequential
  low-ID ghost tabs (agent sub-tabs that closed mid-flight). User's
  persistent tabs were 696002599 and 696002602.
- `port_disconnected` events on both persistent tabs at the end of
  the log window.

## Current Focus

- **hypothesis** (3 independent candidates to disambiguate):
  (H-D1) Session 2's `request.conversationId` arrives null/undefined
        in the sidepanel completion handler. `_persistMessageToConversation`
        silently no-ops on null convId, leaving nothing in the log to
        render on swap-back.
  (H-D2) Session 2's broadcast lands on a sidepanel that just got
        re-keyed by session 1's earlier completion -- the per-conv
        message log handler discards the second message because of a
        stale "current conv" guard.
  (H-D3) Session 2's broadcast is routed via the `port_disconnected`
        tab cleanup path, which means the broadcast may fire to a
        tab that's already gone, and there's no fallback that lands
        the message in the persistent message log.
  (H-E1) Background fires automationComplete + session_ended +
        (possibly) a third completion path (autopilot wrap-up,
        outcome-emit, or recovery), each with the same conversationId,
        and the sidepanel handler renders each one without dedup.
  (H-E2) cf9eea5b removed implicit dedup on the persistence side
        (when convId was module-scope mirror, dedup was implicit
        because of single-state guarding; with explicit per-message
        convId, multiple emits land in distinct call frames).
  (H-C1) stopAutomation in sidepanel sends `currentSessionId` (now
        re-resolved per active tab via the bu4 helper). If the
        session already terminated on the backend (clean shutdown
        via natural end_turn), the background returns "Session not
        found" because it's already removed from storage at the time
        stop arrives -- backend code path is "session existed, hit
        completion, removed -- user clicked stop AFTER" but UI still
        shows running state because the completion message either
        never arrived (D) or duplicates confused the state.

- **next_action**: DIAGNOSIS COMPLETE -- proceed to /gsd-quick to scope the
  fix. Recommended sequencing:
  (1) Fix D first (sidepanel handler outer bail). The fix is to OPEN the
      handler to background-tab completions: process persistence + per-tab
      state update for ALL session-matched messages (regardless of whether
      they're the currentSessionId), and gate only the ACTIVE-tab DOM render
      on isOriginatingActive.
  (2) Fix E's double-persist by removing ONE of the two persist call sites
      (either L2353 _persistMessageToConversation OR the chain through
      completeStatusMessage -> addCompletionMessage -> _persistMessage).
      The QT-7bi-02 comment at L2364-2369 already documents the intent
      ("Inline a DOM-only render to avoid the duplicate") but the if/else
      branches got out of sync: the currentStatusMessage path STILL calls
      completeStatusMessage which still persists.
  (3) Fix C as a cosmetic / UX polish: distinguish "session never existed"
      from "session already completed cleanly" in the stop response so
      the toast reads "Already completed" instead of "Session not found".
  (4) THREAD tabId through agent-loop.js's notifySidepanel payload
      (and all 13 background.js sites) so the fallback to _activeTabIdSnapshot
      is no longer the silent default. This is a defense-in-depth fix.

  -- BELOW retained as historical pre-spawn investigation plan --

- gsd-debugger -- run scientific method on all 3
  symptoms, prioritising E (dedup) first because it's the loudest
  signal and likely shares root cause with D. For each hypothesis:
  (1) Read background.js to enumerate every fsbBroadcastAutomationLifecycle
      call site, group by action type (automationComplete / session_ended
      / others), and trace what triggers each. Look for any path that
      could fire 3 times for one session-end event.
  (2) Read sidepanel.js `case 'automationComplete'` handler body and
      `_persistMessageToConversation` body. Confirm whether null/empty
      convId is treated as "drop" vs "use module-scope". Check for any
      dedup logic (event ID, sequence number, or content hash).
  (3) Drive a Node-side simulator: replay 3 identical automationComplete
      messages for convId=X through the handler and observe how many
      times persist + render fire. Then simulate 2 different convIds
      (session 1's convId + session 2's convId) interleaved, observe
      whether session 2's persistence lands in its convId's log.
  (4) For C: enumerate background.js stopAutomation handler. Check
      whether "session not found" is returned for sessions that COMPLETED
      vs sessions that NEVER EXISTED. The first case is benign (race
      with natural completion); the second case would be a real bug.
  (5) If reproduction possible via FSB MCP, drive the actual scenario:
      dispatch task on Tab A + Tab B in parallel, capture the broadcast
      counts via temporary console.log -- BUT this is a --diagnose run,
      so do NOT modify production code. Use static analysis + Node
      simulators only.

  Produce a structured Root Cause Report covering all 3 symptoms.
  No fix application -- this is --diagnose.

## Evidence

- timestamp: 2026-06-08 (session start)
  checked: grep `fsbBroadcastAutomationLifecycle` in extension/background.js
  found: 18 total references: 1 function definition (L2082), 1 globalThis bind (L2109), and **16 call sites** at lines: 2306, 2575, 3484, 3493, 6812, 7110, 9380, 9415, 9549, 10402, 11034, 11072, 11115, 11163, 11204, 11349, 11406, 11420
  implication: need to enumerate the `action` payload on each — hypothesis E (3x dupe) likely involves 3 distinct call sites firing during one session-end event

- timestamp: 2026-06-08 (call-site enum)
  checked: each call site classified by trigger
  found: 13 emit `automationComplete`, 5 emit `automationError`. Of the 13 complete-emits: 1 SW-restart recovery (2306), 1 tab-closed (2576), 1 replay-completed (3484), 1 handleStopAutomation user-stop (7111), 2 LEGACY-startAutomationLoop max-iter/timeout (9381/9416), 2 multi-site success (11035/11164), 1 no_progress (11073), 1 repeated-success (11116), 1 stuck (11205), 1 NORMAL completion (11349 -- but this is LEGACY startAutomationLoop, NOT the modern AI flow). For modern AI flow, completion fires from extension/ai/agent-loop.js:1431 (notifySidepanel inside finalizeSession), not background.js.
  implication: in modern flow only ONE emit fires per session terminal. The 13 background.js emit sites are mostly LEGACY (per the L9313 docstring "Replaced by runAgentLoop... No code paths call this function" -- but the call-sites at 8662/9124/9213/10029/10091/10296/11378 keep it potentially reachable for multi-site/sheets flows; not the simple test scenario).

- timestamp: 2026-06-08 (agent-loop emit payload)
  checked: extension/ai/agent-loop.js:1430-1453 notifySidepanel message object construction
  found: payload includes sessionId, conversationId, historySessionId, result, partial, stopped, error, reason, outcome, blocker, nextStep, outcomeDetails, task. **NO `tabId` field.** Same for the 2 guard emits at L1549 + L1591 (session_not_found / session_not_running).
  implication: the sidepanel handler at L2376 ("background.js fsbBroadcastAutomationLifecycle includes tabId on every automationComplete payload (verified -- session.tabId is persisted at session creation)") is FACTUALLY WRONG -- no broadcast site in either background.js or agent-loop.js includes `tabId`. The `request.tabId === 'number'` check always falls through to `_activeTabIdSnapshot`. This is critical for Symptom D: when session B completes while user is on Tab A, originatingTabId becomes TAB_A (wrong), and setIdleState clears Tab A's mirror instead of Tab B's. **But this isn't the primary D root cause** -- a stronger bug exists in the OUTER bail check (see next entry).

- timestamp: 2026-06-08 (sidepanel handler outer bail)
  checked: extension/ui/sidepanel.js:2333-2340 -- the early-return + the strict-match check
  found: handler structure:
    `if (!isRunning && request.sessionId !== currentSessionId) return;`  (line 2334)
    `if (request.sessionId === currentSessionId) { ... process ... }`     (line 2340)
  Combined effect: when session B's automationComplete arrives:
    - If user is on Tab A: isRunning=true, currentSessionId=SESS_A. Outer check: !true => false => DOES NOT return. Falls through to L2340: SESS_B !== SESS_A => INNER body is skipped entirely. **No persist, no DOM render, no per-tab state update for session B.**
    - If user is on Tab B (where SESS_B runs): isRunning=true, currentSessionId=SESS_B. Outer check skipped. Inner matches => processes. Works correctly.
  implication: this is the **primary root cause of Symptom D**. The handler has ZERO logic for "background-tab completion" -- the per-tab _tabRunningMap entries for non-current tabs are NEVER updated by automationComplete delivery. Worse, the persistence to fsbConversationMessages also never fires for background-tab sessions, so even when the user later swaps to Tab B, hydrateChatFromConversationId reads empty for conv_B.

- timestamp: 2026-06-08 (Node simulator -- verified)
  checked: /tmp/cluster1-sim2.js drives the verbatim handler body with two parallel sessions, user on Tab A
  found:
    Event 1 (sess_B completes, user on Tab A): renderLog shows ONLY {SET_IDLE on TAB_A} -- no PERSIST for conv_B, no RENDER. Tab B's per-tab entry stays isRunning=true. conv_B has ZERO persisted messages.
    Event 2 (sess_A completes, user on Tab A): renderLog shows {PERSIST conv_A, COMPLETE_STATUS_MSG, RENDER_VIA_ADD_COMPLETION, PERSIST conv_A, SET_IDLE} -- **2 persists into conv_A** (one via _persistMessageToConversation L2353, one via completeStatusMessage -> addCompletionMessage -> _persistMessage L1775). Only 1 DOM render (one completeStatusMessage call).
  implication: this REPRODUCES Symptom D (session B never shows in chat even after swap-back) and partially explains Symptom E (double-persist in conv_A produces 2 hydrate-replay bubbles on swap-back-then-back).

- timestamp: 2026-06-08 (Symptom E third-render hypothesis)
  checked: paths that could produce a 3rd render of the same completion for session 1
  found: candidates ranked:
    1. **Double-persist (proven above) + hydrate-on-swap = 2 bubbles AFTER swap.** That's only 2, not 3.
    2. **Live render (1) + double-persist hydrate on swap (2 more) = 3 total** -- BUT live render is in the SAME chatMessages DOM that hydrate clears before re-rendering. So live render is wiped. Net = 2.
    3. **fsbSessionLogs Tier 2 hydrate fallback** triggers when Tier 1 envelope is empty. Tier 2 renders completionMessage ONCE. If the user has Tier 1 storage cleared between dispatches (unlikely), Tier 2 would render alongside live render.
    4. **Multiple sidepanel listeners** (popup.js + sidepanel.js + dashboard) each render -- but only 1 sidepanel chat surface visible at a time.
    5. **Service worker restart in middle of dispatch** triggers SW-wake emit (background.js:2306) + the actual completion emit + possibly the finally block. That's plausibly 2-3 emits for one session.
    6. **Per-tab map corruption from QT-93i pre-fix paths** -- if `_tabRunningMap[TAB_A]` got reassigned to SESS_B mid-flight (the bug QT-93i tried to fix), then both session A's completion AND session B's completion would have `request.sessionId === currentSessionId` true, producing 2 renders. Combined with double-persist hydrate = up to 4 bubbles.
  implication: Symptom E's exact "3" count is hard to deterministically reproduce from static analysis alone. The strongest candidates are: (a) double-persist + hydrate replay (gives 2), (b) per-tab map cross-contamination from a session-A completion that landed on a tab where the user later dispatched session-B, producing reentrant renders. Need live FSB MCP log inspection to confirm 3 distinct emits vs 1 emit + 2 hydrate replays. **But regardless of the exact 3-count mechanism, the DOUBLE-PERSIST itself IS a bug** (cf7bi-02 introduced it: L2353 persists via _persistMessageToConversation, then completeStatusMessage->addCompletionMessage->_persistMessage L1775 persists AGAIN with module-scope convId which equals originatingConvId when isOriginatingActive).

- timestamp: 2026-06-08 (Symptom C analysis)
  checked: extension/background.js:7056-7133 handleStopAutomation
  found: returns `success:false, error:'Session not found'` at L7128-7132 when session is absent from BOTH activeSessions AND chrome.storage.session. The fallback restore path at L7065-7083 first tries memory, then storage. If the session naturally completed seconds ago, cleanupSession (L1860 activeSessions.delete + L1862 removePersistedSession) has wiped BOTH stores. Stop arrives and gets "Session not found".
  implication: **Symptom C is a CONSEQUENCE of Symptom D, not an independent bug.** The chain: session B naturally completes -> backend cleanup removes session -> UI never received the completion (Symptom D) -> Tab B's per-tab entry stays isRunning=true -> sendBtn stays disabled, stopBtn stays visible -> user clicks Stop -> background returns "Session not found" because it's already gone. The error message is misleading (should distinguish "stale stop on already-completed session" from "never existed"), but the underlying race is benign -- backend already did the right thing. Fix is cosmetic: differentiate the error case.

- timestamp: 2026-06-08 (state-emitter sanity check)
  checked: SessionStateEmitter usage and registration sites
  found: SessionStateEmitter class defined in extension/ai/state-emitter.js but **NEVER INSTANTIATED** anywhere in the extension. createSessionHooks in background.js:1908 registers safetyHook, progressHook (tool overlay), permissionHook -- but NOT createCompletionProgressHook or createIterationProgressHook. So `sessionStateEvent` / `iteration_complete` / `session_ended` payloads are NEVER actually emitted to chrome.runtime in the live extension. The sidepanel handler at L2522-2576 is effectively dead code for the modern flow.
  implication: rules out hypothesis H-E1 (iteration_complete + session_ended both firing alongside automationComplete). Only ONE channel actually fires for the modern AI loop: `notifySidepanel -> fsbBroadcastAutomationLifecycle -> chrome.runtime.sendMessage(automationComplete)`.

## Eliminated

- hypothesis: H-D1 (Session 2's request.conversationId arrives null/undefined; _persistMessageToConversation silently no-ops)
  evidence: read of sidepanel.js L2350 shows `originatingConvId = request.conversationId || conversationId`. agent-loop.js notifySidepanel includes `conversationId: sess.conversationId || null`. handleStartAutomation persists conversationId on session creation. So session B's broadcast DOES have a valid convId. But the bug is upstream: the OUTER guard at L2334 drops the entire handler invocation before reaching the persist call.
  timestamp: 2026-06-08 (after handler read)

- hypothesis: H-E1 (Three SessionStateEmitter events fire: automationComplete + iteration_complete + session_ended)
  evidence: SessionStateEmitter is NEVER instantiated. createSessionHooks does not register createCompletionProgressHook or createIterationProgressHook. The `case 'sessionStateEvent'` handler in sidepanel.js is effectively dead for the modern AI flow. Only one channel fires per terminal: notifySidepanel -> sendMessage(automationComplete).
  timestamp: 2026-06-08

- hypothesis: H-E2 (cf9eea5b removed implicit dedup -- request.conversationId per-message stream now allows duplicate persists)
  evidence: PARTIALLY confirmed. The double-persist DOES exist (sidepanel.js L2353 _persistMessageToConversation, then L2362 completeStatusMessage -> addCompletionMessage -> _persistMessage L1775). But this doesn't explain a 3x DOM render in the SAME session -- only a 2x persistence which produces 2x bubbles on hydrate-replay. The 3rd bubble likely comes from interaction between live render + hydrate after a tab swap (which clears chatMessages, then replays both persisted copies).
  timestamp: 2026-06-08

## Resolution

root_cause: |
  THREE coupled symptoms, ONE primary root cause:

  PRIMARY (Symptom D + chain-effect on Symptom C):
    sidepanel.js automationComplete handler at L2333-2429 has NO PATH for
    "completion arrives for a non-currentSessionId (background-tab session)".
    The outer bail at L2334 + the strict `if (request.sessionId === currentSessionId)`
    at L2340 together drop EVERYTHING for background-tab completions:
    no per-tab map update, no persistence, no render. Session 2's UI is
    permanently stuck because nothing ever flips its _tabRunningMap entry
    back to isRunning:false and nothing persists its completion bubble.

  SECONDARY (contributes to Symptom E):
    The active-tab path at L2360-2371 has a DOUBLE-PERSIST bug:
    L2353 calls _persistMessageToConversation against originatingConvId,
    THEN L2362 calls completeStatusMessage which calls addCompletionMessage
    which calls _persistMessage (L1775) against module-scope conversationId.
    When isOriginatingActive===true these are the SAME conv, so the completion
    bubble is persisted TWICE into fsbConversationMessages. Hydrate-on-swap
    replays both copies.

  TERTIARY (cosmetic, contributes to Symptom C error message):
    handleStopAutomation at background.js:7128 returns "Session not found"
    indistinguishably for "session never existed" vs "session naturally
    completed and was cleaned up between UI-state and stop-click". The
    underlying race is benign (backend already did the right thing), but
    the error toast is misleading.

  CONTRIBUTING ARCHITECTURAL ISSUE:
    Neither background.js nor agent-loop.js includes `tabId` in any
    automationComplete payload, despite sidepanel.js L2376 claiming
    they do. The fallback to `_activeTabIdSnapshot` works only when the
    active tab IS the originating tab; otherwise routing is wrong.

fix: |
  See proposed_fix per symptom below.

verification: (empty -- diagnose only, no fix applied)

files_changed: []

## Reasoning checkpoint

- Three symptoms, likely 1-3 root causes. The fact that E (3x dupe)
  and D (0x for session 2) happened in the same test session is loud:
  "first session got 3 copies, second got 0" almost looks like a
  fan-out where the broadcast TARGETING is wrong -- 3 emits all land
  on session 1's conv instead of being distributed 1 + 1 between
  the two convs. Worth investigating as a coupled hypothesis: maybe
  the broadcast uses a module-scope or stale "currentSession" reference
  in background.js, so all completions fire against session 1's convId
  until session 1 ends, then session 2's completion fires against a
  cleared/null convId.
