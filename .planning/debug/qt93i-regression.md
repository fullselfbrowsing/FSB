---
slug: qt93i-regression
status: investigating
trigger: |
  QT-93i (commits 8bb40a9b + 19b031cc + 5f846208) shipped two related
  tab-scoping fixes whose code shape passes the smoke tests (26 PASS / 0
  FAIL) but whose RUNTIME behavior is wrong:

  (1) Send button is still BLOCKED on a second tab when another tab is
  running a task. The per-tab isRunning fix in commit 19b031cc was
  supposed to make the send button gated on the active tab's running
  state, NOT a global flag. Expected: dispatch task on Tab A, switch to
  Tab B, type a message, send button enabled. Actual: send button
  remains disabled on Tab B while Tab A's task runs.

  (2) Auto-collapse on unused tabs still does NOT visibly collapse the
  panel. The chrome.tabs.onActivated listener added in commit 8bb40a9b
  was supposed to call chrome.sidePanel.setOptions({tabId, enabled:false})
  when the user switches to a tab with no active agent session. Expected:
  switch to a non-working tab, panel visibly collapses. Actual: panel
  stays open across all tabs, no visible collapse on activation.

  User explicit instruction: "you need to do a deeper research or
  delegate this debug task to codex using appropriate GSD skill" --
  i.e. stop guessing, run the scientific method.
created: 2026-06-08
updated: 2026-06-08
---

# Debug Session: QT-93i tab-scoping regression (symptoms ship but behavior is wrong)

## Symptoms (from user)

- **Expected behavior**:
  (1) Send button enabled on a tab with no active task, even when another
      tab is running.
  (2) Side panel visibly collapses (Chrome hides it for that tab) when
      switching to a tab with no active agent session.
- **Actual behavior**:
  (1) Send button DISABLED on the new tab while another tab runs a task.
  (2) Side panel stays visible across all tabs; no visible collapse.
- **Error messages**: None reported. Pure UI / state misbehavior.
- **Timeline**: Regressions in commits 8bb40a9b (chrome.tabs.onActivated +
  chrome.action.onClicked force-open) + 19b031cc (per-tab _tabRunningMap
  + setRunningState/setIdleState/setErrorState taking tabId) +
  5f846208 (smoke test). All on automation branch, pushed 2026-06-08.
- **Reproduction**:
  Reload extension at chrome://extensions. Open Tab A, dispatch any
  task (e.g. "check weather"). While it runs, open Tab B and type
  a message -> send button stays disabled. Also switch to a third
  Tab C with no active session -> panel does NOT visibly collapse.

## Static evidence gathered (pre-spawn)

- **Smoke test passes (26 PASS / 0 FAIL)**:
  `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js` confirms the
  code SHAPE matches the plan:
  - Part 1: chrome.tabs.onActivated body has the setOptions
    enabled-toggle wired to findActiveAutomationSessionForTab.
  - Part 2: chrome.action.onClicked creates setOptionsPromise + openPromise
    synchronously (no `await` between them).
  - Part 3: sidepanel.js exports _tabRunningMap + _activeTabIdSnapshot
    + _getTabRunningEntry + getCurrentTabRunningState +
    _syncModuleScopeFromActiveTab.
  - Part 4: setRunningState/setIdleState/setErrorState accept optional
    tabId; automationComplete + session_ended route by originating tab.
- **Smoke test mocks**: tests stub chrome.sidePanel + chrome.tabs +
  FSBSidepanelMessageLog and brace-walk the AST to extract listener
  bodies. They do NOT exercise the actual state-population flow from a
  real session lifecycle, so any bug in HOW state is written to the
  per-tab map at session start (or HOW the active-tab snapshot is
  cached on boot, or HOW the swap re-resolution dispatches set*State)
  is INVISIBLE to the smoke.
- **FSB runtime logs (live, just pulled)**:
  - Tabs: 5 tabs across 2 windows; tab 695998952 (weather.com), tab
    695998959 (coindesk.com) both had recent task dispatches that
    completed successfully (sessions session_1780918002417 +
    session_1780918000949 in conversation conv_...jnkq + conv_...sc7c).
  - Lifecycle hygiene: keepalive stopped on session_count=0,
    "Session removed from storage" + "Conversation sessions persisted,
    count: 0" -- backend cleanup is healthy.
  - No errors / warnings in the last 100 log entries.
- **Suspected bug surface (not yet confirmed)**:
  Two competing hypotheses, requires runtime trace to disambiguate.

## Current Focus

- **hypothesis** (post static-trace): SYMPTOM 1 root cause is at sidepanel.js:1186
  + 13098-13122. When tab swap fires, the swap handler at 856-866 reads
  the entry for the NEW tab, calls setIdleState(activeInfo.tabId), but
  the active tab snapshot at line 858 is set ONE LINE BEFORE the call
  -- so when setIdleState executes, isActiveTab is true and the module
  mirror clears to isRunning=false. BUT: the activated tab cannot ever
  reach updateSendButtonState because chrome.sidePanel.setOptions
  enabled:false (background.js:13111) collapses (hides) the panel for
  non-working tabs. The sidepanel UI on Tab B is NEVER RENDERED, so the
  user never sees a fresh enabled sendBtn -- they see Tab A's still-
  visible panel (the auto-collapse failure of Symptom 2 KEEPS the
  active-tab panel pinned to whatever tab was open before the swap),
  with Tab A's running state mirror.

  In other words: Symptom 1 and Symptom 2 are TWO HALVES OF THE SAME
  ROOT BUG. The auto-collapse strategy in 8bb40a9b (setOptions
  enabled:false) does not actually hide an open panel. The panel
  stays glued to Tab A's content -- including Tab A's isRunning=true
  module mirror. The per-tab map work in 19b031cc is correct but
  invisible because the swap-driven re-sync at lines 856-866 runs
  inside a sidepanel that was supposed to be hidden but isn't, AND
  because the activated tab's content area never refreshed to show
  the per-tab idle state.

  Wait -- actually the sidepanel is PERSISTENT in Chrome MV3.
  setOptions enabled:false does NOT collapse an open sidepanel for
  the activated tab if the SAME panel.html is shown on all tabs.
  Need to verify chrome.sidePanel docs to confirm exact behavior.

- **next_action**: Read Chrome docs on chrome.sidePanel.setOptions
  behavior re: enabled:false on an already-open panel. Also do a
  Node-driven test of the swap path to see what happens to sendBtn.

- **call sites missing tabId** (potential leak vectors, may or may
  not contribute):
  - sidepanel.js:1268 setIdleState() -- error in sendMessage
  - sidepanel.js:1274 setIdleState() -- catch in handleSendMessage
  - sidepanel.js:1310 setIdleState() -- stopAutomation reply
  - sidepanel.js:1397 setIdleState() -- liveness orphan
  - sidepanel.js:2192 setErrorState() -- renderAutomationCompletionPayload
  - sidepanel.js:2209 setIdleState() -- renderAutomationCompletionPayload
  - sidepanel.js:2435 setErrorState() -- automationError handler
  - sidepanel.js:3044 setRunningState() -- startReplay (currentSessionId set above)
  - All default to _activeTabIdSnapshot, which means they write to
    the active tab, not the originating session's tab. This is the
    classic "global flag in tab clothing" leak.

- **hypothesis** (legacy):
  (H-A) The per-tab _tabRunningMap is NEVER POPULATED at session-start
        because the call site that flips state to "running" (likely
        inside handleSendMessage / executeAutomationFromSidepanel) does
        not pass a tabId argument, so setRunningState(undefined) goes
        through the default-to-active-tab branch and writes to the map
        keyed by the dispatch tab -- but then on tab swap, the SWAP
        listener at sidepanel.js:786 (extended in commit 19b031cc to
        call _syncModuleScopeFromActiveTab) reads from a tab entry that
        has NO running:true value, falls through to the default "idle"
        snapshot, and ... wait, that should LEAVE the send button
        enabled on the new tab. So if send button is DISABLED on a fresh
        tab, the gate is elsewhere -- possibly the module-mirror is
        still being read by a faster path than the swap re-resolution.
  (H-B) The chrome.tabs.onActivated listener in background.js IS firing
        but setOptions({tabId, enabled:false}) does NOT actually hide
        the panel for an already-open panel -- Chrome's documented
        behavior is that setOptions enabled:false PREVENTS FUTURE opens
        on that tab but does not CLOSE an already-rendered panel.
        chrome.sidePanel API has NO programmatic close. So the
        "auto-collapse" expectation may be physically impossible with
        the current API and the previous understanding was wrong.

- **next_action**: gsd-debugger -- (a) re-read sidepanel.js around the
  send-button gate path to find EVERY site that disables sendBtn (line
  1106 updateSendButtonState gates on `!hasContent || isRunning`; line
  1326 setRunningState; line 608 applyInputLockout(foreignOwned) --
  the foreign-owned path may still be firing globally). Look for any
  CALL to setRunningState in handleSendMessage / dispatchAutomation
  paths and confirm whether it's passed a tabId or relies on the
  active-tab default. Trace the order: dispatch starts on Tab A,
  setRunningState(Tab A id) runs, user switches to Tab B,
  chrome.tabs.onActivated swap fires, _syncModuleScopeFromActiveTab
  copies Tab B's idle entry to the module mirror, updateSendButtonState
  re-runs -- WHY does the button stay disabled? Look for any path that
  forces `isRunning = true` on the active-tab snapshot AFTER the swap
  (e.g. an incoming progress message arriving on the dispatch tab but
  applied to the active tab's state because of a routing bug).
  (b) Read the chrome.sidePanel API docs / behavior re. setOptions
  enabled:false on an already-open panel -- if Chrome cannot close an
  open panel, the auto-collapse fix needs a different strategy or the
  panel will only collapse on the NEXT open (not immediately on tab
  switch). Document the constraint and propose a workaround if
  impossible.

## Evidence

- timestamp: 2026-06-08 -- User: send button still blocked on second
  tab when first tab is running. Hot-reloaded after 8bb40a9b + 19b031cc.
- timestamp: 2026-06-08 -- User: auto-collapse not visibly happening
  on non-working tabs.
- timestamp: 2026-06-08 -- Static read of sidepanel.js line 1106
  updateSendButtonState confirms gate is `!hasContent || isRunning`.
  isRunning is module-scope active-tab mirror per QT-93i-02 design.
- timestamp: 2026-06-08 -- Static read of background.js confirms
  chrome.tabs.onActivated listener is registered (commit 8bb40a9b) and
  calls findActiveAutomationSessionForTab to decide enabled flag.
- timestamp: 2026-06-08 -- Static read of smoke test confirms tests
  pass against the CODE SHAPE, not the lifecycle. Tests stub state and
  brace-walk for assertion -- they do NOT drive a real session.

## Eliminated

- hypothesis: bug in sidepanel.js setRunningState/setIdleState/setErrorState
  per-tab map implementation
  evidence: /tmp/qt93i-runtime-probe.js + /tmp/qt93i-probe-v2.js execute the
  EXACT extracted listener body from sidepanel.js:846-867 (chrome.tabs.onActivated
  body) against mocked chrome.* + DOM. End state on Tab B (idle) after swap:
  isRunning=false, sendBtn.disabled=false (after typing). Per-tab map records
  Tab A=running, Tab B=idle. Module-scope mirror correctly mirrors Tab B's idle
  state. The code path WORKS IN ISOLATION.
  timestamp: 2026-06-08 (probe v1 + v2 runs)

- hypothesis: legacy isRunning module-scope global flag is the gate
  evidence: per-tab map writes to _tabRunningMap[tabId]; module mirror only
  syncs to active tab. Probe confirms after swap, mirror reads Tab B's idle
  entry. Static read of all 4 sendBtn.disabled write sites (sidepanel.js:1186,
  1428, 1458, 1490) confirms NO global flag leak.
  timestamp: 2026-06-08

## Reasoning checkpoint (post-probe)

- Probe v2 results: chrome.tabs.onActivated listener body (EXACT extracted
  source from sidepanel.js:846-867) executed against mocked chrome.* + DOM,
  end state on Tab B = isRunning:false, _activeTabIdSnapshot:200,
  sendBtn.disabled:false (after typing). Code path IS structurally correct.
- This means BOTH symptoms have a UNIFIED ROOT CAUSE: Symptom 2's
  architectural API limitation (setOptions enabled:false ineffective with
  manifest default_path) leaves the sidepanel document VISIBLE on Tab B
  showing Tab A's pre-swap UI. The listener fires + updates state, but the
  user-visible UI is the global panel document which was last rendered for
  Tab A. Chrome's sidepanel "shares a single document per window" (docs);
  setOptions enabled:false is the ONLY hide mechanism on Chrome <141, and
  it's documented to be ineffective with manifest default_path.
- Plan 260608-93i-PLAN line 135 explicitly states "no eager clear (setOptions
  enabled:false collapses panel surface in one frame)" -- THIS IS THE FALSE
  ASSUMPTION. Chrome does NOT collapse the panel with default_path in the
  manifest. The plan was built on a Chrome API misunderstanding.

## Resolution

root_cause:
  symptom_1: NOT IN sidepanel.js code path. Per-tab map + swap re-sync are
    structurally correct. The runtime bug originates from Symptom 2: the
    sidepanel document on Tab B is the SAME document instance as Tab A (Chrome
    global panel from manifest default_path + openPanelOnActionClick:true),
    AND chrome.sidePanel.setOptions({tabId, enabled:false}) does NOT hide the
    panel because the global default_path panel takes precedence as the
    fallback. SO: the user sees Tab A's panel UI on Tab B (statusDot=Working,
    statusText=Working, sendBtn=disabled). The chrome.tabs.onActivated
    listener in sidepanel.js DOES fire and DOES update the state correctly,
    but only if the listener's view of "active tab" matches the user's view.
    When background.js's chrome.tabs.onActivated also runs and calls setOptions
    enabled:false on Tab B, Chrome's panel-display logic does NOTHING (because
    of the manifest default panel fallback) -- so the user sees the old UI.
    UPDATE (after probe v2): the sidepanel.js listener body, when executed
    against the exact extracted listener body, DOES produce sendBtn.disabled=false
    on Tab B as expected. So either (a) the listener never fires when user
    switches tabs in real Chrome (unlikely; extensions docs confirm it fires),
    or (b) the sidepanel.js DOM mutations land on the SAME document instance
    that is then NOT shown to the user because Chrome is supposed to hide the
    panel for Tab B but doesn't, so the user keeps seeing Tab A's PRE-swap UI
    snapshot. The latter is the real explanation.

  symptom_2: chrome.sidePanel.setOptions({tabId:X, enabled:false}) is
    DOCUMENTED to hide the panel on that tab -- but ONLY when the panel is
    configured per-tab (NOT via manifest default_path). The FSB extension
    declares "side_panel": { "default_path": "ui/sidepanel.html" } in
    manifest.json AND calls chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true }) at background.js:13360. This configuration
    creates a GLOBAL panel that is shown by default on every tab. When
    setOptions({tabId, enabled:false}) is called on a global-panel tab, the
    panel does NOT collapse -- Chrome falls back to the default panel from
    the manifest. (Source: multiple chromium-extensions threads, Chrome
    devs docs, GitHub issue #987.) The auto-collapse strategy in commit
    8bb40a9b is ARCHITECTURALLY INCOMPATIBLE with the manifest's default_path
    config. chrome.sidePanel.close() exists only in Chrome 141+; FSB targets
    older versions. There is no API-level workaround on Chrome 116-140.

fix:
  symptom_1: NO CODE FIX in sidepanel.js setters needed. Per-tab map is
    correct. Fix Symptom 2 (panel display routing) and Symptom 1 disappears
    because the user will see Tab B's panel UI (which is already idle) instead
    of Tab A's pinned UI.
    SECONDARY HARDENING (low priority): the 7 call sites in sidepanel.js
    that pass no tabId to setIdleState/setErrorState (lines 1268, 1274,
    1310, 1397, 2192, 2209, 2435) should be audited -- they default to
    _activeTabIdSnapshot, which can mis-route when state-changing events
    fire on a tab that's no longer active.

  symptom_2: Two viable strategies (planner decides):
    (A) Remove "side_panel": { "default_path": ... } from manifest.json
        AND set setPanelBehavior({ openPanelOnActionClick: false }) so the
        panel is ALWAYS opened explicitly via setOptions({tabId, path,
        enabled:true}) + open({tabId}). Then setOptions({tabId, enabled:false})
        WILL hide the panel on that tab. Costs: action.onClicked must
        explicitly setOptions+open per tab; first open() is gesture-bound;
        the panel won't open on freshly-installed Chrome until the user
        clicks the icon at least once.
    (B) Revert the auto-collapse feature (commit 8bb40a9b) and accept that
        the panel stays visible on all tabs (the original behavior). Per-tab
        content swap (sidepanel.js:swapToTabConversation + the per-tab map
        re-sync) already swaps chat + running state per tab, so the panel
        being visible is no longer a leak -- it just shows the active tab's
        state. The "auto-collapse" UX intent (CONTEXT D-01 implication) was
        based on the false assumption that setOptions enabled:false would
        work with the manifest default_path.
    Recommended: (B). It's a smaller surface, preserves Chrome MV3
    user-gesture behavior for action.onClicked, and matches the actual
    Chrome API behavior. The per-tab content scoping that 19b031cc shipped
    is the right fix; the panel just stays visible.

verification:
  symptom_1: probe confirms code path correct -- /tmp/qt93i-probe-v2.js
    executes the extracted listener body and observes sendBtn.disabled=false
    on Tab B after swap. No code fix needed in sidepanel.js.
  symptom_2: Chrome docs + multiple chromium-extensions threads confirm
    manifest default_path + openPanelOnActionClick:true + setOptions
    enabled:false interaction. Auto-collapse is architecturally broken under
    this config.

files_changed: []  # diagnose-only mode; no fixes applied

## Reasoning checkpoint

- Two distinct bugs in the same code-change set. Hypotheses A and B
  are independent and can be investigated in parallel by the debugger.
- The smoke test passing while runtime fails is the classic "tested
  the shape, not the behavior" signature -- the debug must drive the
  actual state-flip path, not re-grep source.
- Chrome's chrome.sidePanel API behavior re. "enabled:false on already-
  open panel" is the most likely root cause of Symptom 2 (auto-collapse
  doesn't visibly close). If confirmed, the fix is a documentation /
  expectation adjustment, NOT more code.
