---
phase: 260608-uof
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - extension/ui/sidepanel.js
  - extension/ai/agent-loop.js
  - extension/background.js
  - tests/sidepanel-background-tab-completion.test.js
  - package.json
  - /Users/lakshmanturlapati/.claude/projects/-Users-lakshmanturlapati-Desktop-FSB/memory/project_chrome_sidepanel_no_close.md
autonomous: true
requirements:
  - D-FIX
  - E-FIX
  - C-FIX
  - B-FIX
  - A-FIX
  - BROADCAST-tabId-THREAD
  - SIMULATOR-PROMOTE

must_haves:
  truths:
    - "When Tab B's session completes while user is on Tab A, Tab B's completion bubble persists into conv_B's fsbConversationMessages log."
    - "When Tab B's session completes while user is on Tab A, Tab B's _tabRunningMap entry flips isRunning:false (so Tab B's sendBtn re-enables on swap)."
    - "When Tab A's session completes (active tab path with currentStatusMessage non-null), exactly ONE assistant completion entry is persisted into conv_A (no double-persist)."
    - "Every fsbBroadcastAutomationLifecycle automationComplete payload (background.js 13 sites + agent-loop.js notifySidepanel) carries an explicit tabId field; the sidepanel handler comment at L2376 reflects reality."
    - "Stopping a stale task that completed cleanly between UI state and click shows 'Already completed' (not 'Session not found') toast."
    - "Switching between two parallel running tabs preserves each tab's currentStatusMessage + currentActionGroup independently -- no cross-tab DOM leak when one tab's loader is active and the other ends."
    - "When chrome.sidePanel.close is available (Chrome 141+) AND user activates a tab in a window where NO tab has an active session, the panel collapses for that window. When close() is unavailable or any tab in the window is still running, the panel stays visible (no regression of project_chrome_sidepanel_no_close.md memory)."
    - "npm test exits 0 end-to-end including the new sidepanel-background-tab-completion.test.js."
  artifacts:
    - path: "extension/ui/sidepanel.js"
      provides: "Restructured automationComplete handler (D-FIX + E-FIX); B-FIX per-tab status/action group mirrors; C-FIX alreadyEnded branch in stopAutomation response handler"
      contains: "_tabStatusIntentMap"
    - path: "extension/ai/agent-loop.js"
      provides: "notifySidepanel payload includes tabId (BROADCAST-tabId-THREAD)"
      contains: "tabId: sess.tabId"
    - path: "extension/background.js"
      provides: "13 fsbBroadcastAutomationLifecycle automationComplete call sites carry session.tabId; handleStopAutomation tier-3 fsbSessionLogs lookup distinguishes alreadyEnded vs never-existed; chrome.tabs.onActivated listener with Chrome 141+ sidePanel.close auto-collapse + per-window has-any-working-tab gate (A-FIX)"
      contains: "chrome.sidePanel.close"
    - path: "tests/sidepanel-background-tab-completion.test.js"
      provides: "Real-runtime regression test for D-FIX + E-FIX using brace-walk + sandbox eval pattern; promoted from /tmp simulator"
      contains: "Tab B's completion persists to conv_B"
    - path: "package.json"
      provides: "Test chain registers sidepanel-background-tab-completion.test.js as final entry"
      contains: "sidepanel-background-tab-completion.test.js"
    - path: "/Users/lakshmanturlapati/.claude/projects/-Users-lakshmanturlapati-Desktop-FSB/memory/project_chrome_sidepanel_no_close.md"
      provides: "Amendment documenting the Chrome 141+ chrome.sidePanel.close() exception with per-window has-any-working-tab gate"
      contains: "Chrome 141+"
  key_links:
    - from: "extension/ai/agent-loop.js notifySidepanel"
      to: "extension/ui/sidepanel.js case automationComplete"
      via: "tabId field on the broadcast message payload"
      pattern: "tabId:\\s*sess\\.tabId"
    - from: "extension/ui/sidepanel.js case automationComplete"
      to: "_persistMessageToConversation"
      via: "unconditional call for any session-matched message (regardless of currentSessionId)"
      pattern: "_persistMessageToConversation\\('assistant'"
    - from: "extension/background.js chrome.tabs.onActivated listener"
      to: "chrome.sidePanel.close"
      via: "feature-detect + per-window has-any-working-tab gate via chrome.tabs.query({windowId}) + findActiveAutomationSessionForTab filter"
      pattern: "chrome\\.sidePanel\\.close"
    - from: "extension/background.js handleStopAutomation"
      to: "chrome.storage.local.get(['fsbSessionLogs'])"
      via: "tier-3 lookup when session absent from memory + chrome.storage.session"
      pattern: "fsbSessionLogs"
---

<objective>
Apply the debugger's Root Cause Report (.planning/debug/cluster1-routing.md) for
Cluster 1 routing bugs plus the Cluster 2 leftover items. Seven coupled items:
two LOAD-BEARING fixes (D missing-second-completion, E 3x dupe on first session),
one cosmetic toast fix (C session-not-found), defense-in-depth tabId thread
through all broadcast sites, a real-runtime regression test promoted from the
debugger's /tmp simulator, plus B (per-tab status message/action group mirror)
and A (Chrome 141+ sidePanel.close auto-collapse with per-window gate).

Purpose: Eliminate the user-visible "second session never shows completion"
+ "first session shows 3 duplicate completions" cluster, lock the regression
via real-runtime test, and quietly polish C/A/B as additive improvements.

Output: 6 git commits on `automation` branch (one per task), npm test exit 0
end-to-end, memory file amended with the Chrome 141+ exception.
</objective>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/debug/cluster1-routing.md
@.planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/cluster1-sim2.js.orig
@extension/ui/sidepanel.js
@extension/ai/agent-loop.js
@extension/background.js
@tests/sidepanel-progress-tick-setter-routing.test.js
@tests/sidepanel-tab-scoping-fix-redo-smoke.test.js
@/Users/lakshmanturlapati/.claude/projects/-Users-lakshmanturlapati-Desktop-FSB/memory/project_chrome_sidepanel_no_close.md

<interfaces>
Key contracts the executor needs. Embedded so no codebase scavenger hunt.

extension/ui/sidepanel.js module-scope state (lines ~10-15, 40-50, 1520-1523):

```javascript
let currentSessionId = null;
let conversationId = null;
let isRunning = false;
var _tabRunningMap = new Map();           // Map<tabId, {isRunning, sessionId}>
var _activeTabIdSnapshot = null;
let currentStatusMessage = null;          // active loader DOM node (single, MODULE SCOPE)
let currentActionGroup = null;            // collapsible action group inside currentStatusMessage
```

extension/ui/sidepanel.js helpers:

```javascript
function _getTabRunningEntry(tabId): {isRunning, sessionId}     // lazy-init per tabId
function _resolveTabIdForSession(sessionId): number              // scans _tabRunningMap, falls back to _activeTabIdSnapshot
function setIdleState(tabId)                                     // takes optional tabId per 19b031cc; clears per-tab entry + active-tab UI if active
function _persistMessageToConversation(role, content, kind, convId)  // explicit-convId persist; no-op if convId missing
function _renderCompletionDomOnly(text, type, isPartial)         // DOM-only render; no _persistMessage side effect
function completeStatusMessage(text, type)                       // CALLS addCompletionMessage which CALLS _persistMessage (double-persist hazard!)
function addCompletionMessage(text, type, isPartial)             // DOM render + _persistMessage('assistant', text, 'text')
function hydrateChatFromConversationId(convId): Promise<number>  // Tier 1 (fsbConversationMessages) / Tier 2 (fsbSessionLogs) read
```

extension/ai/agent-loop.js notifySidepanel (lines 1425-1469):

```javascript
function notifySidepanel(sid, sess, terminal) {
  // Constructs message object: { action, sessionId, conversationId, historySessionId,
  //   result, partial, stopped, error, reason, outcome, blocker, nextStep, outcomeDetails, task }
  // *** MISSING: tabId field. Must add: tabId: sess.tabId || null
  //     (session.tabId is persisted at session creation per debugger report) ***
  fsbBroadcastAutomationLifecycle(message);
}
```

extension/background.js fsbBroadcastAutomationLifecycle (line 2082) -- pass-through;
each call site constructs its own message object. 13 automationComplete call sites
needing tabId thread (verified via grep -- planner confirmed against orchestrator):
2306, 2576, 3485, 7111, 9381, 9416, 11035, 11073, 11116, 11164, 11205, 11349,
PLUS extension/ai/agent-loop.js:1431 (the modern flow primary emit; threaded via
notifySidepanel signature change above).

Note: lines 3493, 6812, 9549, 10402, 11406, 11420 emit automationError (NOT
in the 13-site automationComplete list). Out of scope; leave alone OR extend
tabId in a 1-line drop-in (executor discretion, document in commit msg).

extension/background.js handleStopAutomation (line 7062):

```javascript
async function handleStopAutomation(sessionId, sendResponse) {
  // Tier 1: activeSessions.get(sessionId)
  // Tier 2: chrome.storage.session.get(`session_${sessionId}`)
  // (current) If both miss -> 'Session not found' error
  // *** Add Tier 3 (C-FIX): chrome.storage.local.get(['fsbSessionLogs'])
  //     If sessionId is a key in fsbSessionLogs, this session completed and was
  //     cleaned up. Return {success:false, alreadyEnded:true, error:'Already completed'} ***
}
```

extension/background.js helpers usable for A-FIX:

```javascript
function findActiveAutomationSessionForTab(tabId): Session|null   // O(activeSessions) scan
// chrome.tabs.query({windowId}) -> Tab[]
// chrome.sidePanel.close({windowId})  <-- Chrome 141+; feature-detect via typeof check
```

Module-scope state to be ADDED in B-FIX (sidepanel.js):

```javascript
// Per-tab mirror of (currentStatusMessage, currentActionGroup) keyed by tabId.
// Eagerly persisted on swap, lazily restored on tab switch back. Prevents
// a session that ends on Tab B while user is on Tab A from clearing Tab A's
// loader DOM (currentStatusMessage is module-scope -- any setIdleState call
// from a B-fired event currently clobbers Tab A's UI).
var _tabStatusIntentMap = new Map();  // Map<tabId, {statusMessage, actionGroup}>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: D-FIX + E-FIX -- restructure sidepanel automationComplete handler (LOAD-BEARING; commit first)</name>
  <files>extension/ui/sidepanel.js</files>
  <action>
Restructure the case 'automationComplete' body at lines 2333-2429 to fix
TWO bugs from .planning/debug/cluster1-routing.md:

D-FIX (primary, Symptom D): The handler currently has NO PATH for "completion
arrives for a non-currentSessionId (background-tab session)". The outer bail
at L2334 + the strict `if (request.sessionId === currentSessionId)` at L2340
together drop EVERYTHING for background-tab completions: no per-tab map
update, no persistence, no render.

E-FIX (secondary, Symptom E): The active-tab path at L2360-2371 has a
DOUBLE-PERSIST bug. L2353 calls _persistMessageToConversation against
originatingConvId, THEN L2362 calls completeStatusMessage which calls
addCompletionMessage which calls _persistMessage (L1775) against
module-scope conversationId. When isOriginatingActive===true these are the
SAME conv, so the completion bubble is persisted TWICE.

REQUIRED NEW SHAPE (paraphrased; preserve all existing logging, partial
flag handling, history view refresh, recon suggestion block):

```javascript
case 'automationComplete': {
  // D-FIX: relax outer bail. Only short-circuit when sessionId matches
  // no known tab entry AND is not our currentSessionId.
  var sessionKnown = (request.sessionId === currentSessionId);
  if (!sessionKnown) {
    var iter = _tabRunningMap.values();
    var n = iter.next();
    while (!n.done) {
      if (n.value && n.value.sessionId === request.sessionId) { sessionKnown = true; break; }
      n = iter.next();
    }
  }
  if (!sessionKnown) return;  // genuinely unknown session -- drop

  // From here, the message IS for a session we know about (active or background).
  var completionMessage = request.result || 'The automation completed but no summary was provided. Please try again if the task wasn\'t completed as expected.';
  var isPartial = request.partial === true;
  var originatingConvId = (typeof request.conversationId === 'string' && request.conversationId.length > 0)
    ? request.conversationId : conversationId;

  // D-FIX: persist UNCONDITIONALLY for any session-matched message.
  // Absence of this line for background tabs caused Symptom D.
  _persistMessageToConversation('assistant', completionMessage, 'text', originatingConvId);

  // D-FIX: per-tab state update UNCONDITIONALLY. Resolve the originating
  // tab from request.tabId (now threaded per Task 2) or fall back to
  // _resolveTabIdForSession (scans _tabRunningMap for sessionId).
  var originatingTabId = (typeof request.tabId === 'number')
    ? request.tabId
    : _resolveTabIdForSession(request.sessionId);

  // E-FIX: the if-branch (active tab + currentStatusMessage non-null) must
  // mirror the else-branch -- clear the loader DOM manually and call the
  // DOM-only render. Do NOT call completeStatusMessage (it persists again).
  var isOriginatingActive = (originatingConvId === conversationId);
  if (isOriginatingActive) {
    if (currentStatusMessage) {
      try { currentStatusMessage.remove(); } catch (_e) {}
      currentStatusMessage = null;
      currentActionGroup = null;
    }
    _renderCompletionDomOnly(completionMessage, isPartial ? 'partial' : 'ai', isPartial);
  }

  // setIdleState takes optional tabId per 19b031cc; resolves to active
  // tab when undefined. For background tabs, flips per-tab entry
  // isRunning:false WITHOUT touching active-tab UI.
  setIdleState(originatingTabId);

  if (isHistoryViewActive) {
    loadHistoryList();
  }

  // Recon suggestion block (PRESERVE EXISTING -- only fire on active tab + partial)
  if (isPartial && isOriginatingActive) {
    // ... existing recon suggestion IIFE preserved verbatim ...
  }

  break;
}
```

CRITICAL DETAILS:
- Remove the `if (request.sessionId === currentSessionId) { ... }` nesting at
  L2340-2428. All logic that was inside is now top-level inside the case block,
  gated only by the relaxed outer guard.
- Preserve the recon suggestion IIFE EXACTLY (lines 2390-2427); it already
  gates on `isPartial && isOriginatingActive` which still holds.
- Do NOT delete the QT-7bi-02 comment at L2355-2358 -- rewrite to reflect
  the new shape (persist is now UNCONDITIONAL, not "first" gated on
  currentSessionId match).
- Add a leading comment block above `case 'automationComplete':` explaining
  D-FIX + E-FIX with a one-line back-ref to .planning/debug/cluster1-routing.md.
- New structure must keep persist + per-tab state update unconditional
  for ALL session-matched messages, gate ONLY the DOM render on
  isOriginatingActive (per orchestrator constraint).
- ASCII only. No emojis.
  </action>
  <verify>
    <automated>node verify-uof-task1.js</automated>
    <description>Where verify-uof-task1.js does: read sidepanel.js, locate case 'automationComplete', assert body contains _persistMessageToConversation AND _renderCompletionDomOnly AND sessionKnown variable, AND does NOT contain completeStatusMessage call (the if-branch must use _renderCompletionDomOnly). Inline alternative if scriptlets disallowed: node -e "var fs=require('fs');var s=fs.readFileSync('extension/ui/sidepanel.js','utf8');var i=s.indexOf(\"case 'automationComplete'\");var body=s.slice(i,i+5000);if(body.indexOf('_persistMessageToConversation')===-1)throw new Error('missing persist');if(body.match(/completeStatusMessage\\(/))throw new Error('still calls completeStatusMessage');if(body.indexOf('_renderCompletionDomOnly')===-1)throw new Error('missing DOM-only render');if(body.indexOf('sessionKnown')===-1)throw new Error('missing relaxed outer guard');console.log('OK');"</description>
  </verify>
  <done>
    automationComplete case body has: relaxed outer guard scanning _tabRunningMap;
    unconditional _persistMessageToConversation call; isOriginatingActive gates
    DOM render only; if-branch uses _renderCompletionDomOnly (NOT
    completeStatusMessage); recon IIFE preserved; comments updated to cite
    cluster1-routing.md. Single git commit:
    fix(uof-1): D-FIX background-tab completion + E-FIX double-persist in sidepanel automationComplete handler
  </done>
</task>

<task type="auto">
  <name>Task 2: BROADCAST-tabId-THREAD -- thread tabId through all automationComplete payloads (LOAD-BEARING; commit second)</name>
  <files>extension/ai/agent-loop.js, extension/background.js, extension/ui/sidepanel.js</files>
  <action>
Make the sidepanel handler's `request.tabId` field non-fictional. Per debugger
report, the L2376 comment ("background.js fsbBroadcastAutomationLifecycle
includes tabId on every automationComplete payload") is FACTUALLY WRONG --
no broadcast site includes tabId. Defense-in-depth fix:

Step A -- extension/ai/agent-loop.js (line ~1430): in the `notifySidepanel`
helper's `message` object, add `tabId: sess.tabId || null` as a sibling key
to `conversationId: sess.conversationId || null`.

Step B -- extension/background.js: at each of the following 13 call sites
(verified via grep + action=automationComplete filter), ADD a `tabId:` key.
Use the appropriate variable in scope at each site:

  - Line 2306 (SW-restart): tabId: persistedSession.tabId
  - Line 2575 (tab-closed onTabRemoved loop): tabId: tabId (loop variable)
  - Line 3484 (replay-completed): tabId: session.tabId
  - Line 7110 (handleStopAutomation): tabId: session.tabId
  - Line 9380 (LEGACY max-iterations): tabId: session.tabId
  - Line 9415 (LEGACY timeout): tabId: session.tabId
  - Line 11034 (multi-site success): tabId: session.tabId
  - Line 11072 (no_progress): tabId: session.tabId
  - Line 11115 (repeated-success): tabId: session.tabId
  - Line 11163 (multi-site stuck completion): tabId: session.tabId
  - Line 11204 (stuck): tabId: session.tabId
  - Line 11349 (LEGACY normal completion): tabId: session.tabId

The 13 sites above are automationComplete actions only. Skip the
automationError sites (3493, 6812, 9549, 10402, 11406, 11420) -- out of
scope per task constraint, but you MAY extend tabId to them too if it's
a 1-line drop-in (no logic change). Document the choice in the commit msg.

Step C -- extension/ui/sidepanel.js line ~2374-2378: rewrite the QT-93i-02
comment describing the tabId fallback. Replace the FALSE claim that
"background.js ... includes tabId on every automationComplete payload
(verified ...)" with the now-TRUE claim referencing Task 2 commit SHA
(filled in by executor after commit).

VERIFICATION DISCIPLINE: before editing each background.js line, use Read
to fetch line +- 10 around the line number to confirm:
  1. The action IS `automationComplete` (not `automationError`).
  2. There IS a `session` (or `persistedSession`, etc.) variable in scope.
  3. session.tabId is the right reference (some sites may need
     session.previousTabId or session.originalTabId -- prefer session.tabId
     unless context dictates otherwise; trust debugger's claim that
     session.tabId is persisted at session creation).

NO logic changes. NO restructuring. Only add the new `tabId:` key.
ASCII only. No emojis.
  </action>
  <verify>
    <automated>node -e "var s=require('fs').readFileSync('extension/ai/agent-loop.js','utf8');var i=s.indexOf('function notifySidepanel');var body=s.slice(i,i+3000);if(body.indexOf('tabId:')===-1)throw new Error('agent-loop notifySidepanel missing tabId');console.log('agent-loop OK');var bg=require('fs').readFileSync('extension/background.js','utf8');var L=bg.split('\\n');var c=0,t=0;for(var j=0;j<L.length;j++){if(L[j].indexOf(\"action: 'automationComplete'\")!==-1){c++;for(var k=j;k<j+15&&k<L.length;k++){if(L[k].indexOf('tabId:')!==-1){t++;break;}}}}if(t<c)throw new Error('automationComplete missing tabId: '+t+'/'+c);console.log('background.js OK ('+t+'/'+c+' sites)');"</automated>
  </verify>
  <done>
    agent-loop.js notifySidepanel message has tabId: key; all 13 background.js
    automationComplete call sites have tabId: key; sidepanel.js comment at
    L2374-2378 rewritten to reflect new truth. Single git commit:
    feat(uof-2): thread tabId through all automationComplete broadcast payloads (defense-in-depth)
  </done>
</task>

<task type="auto">
  <name>Task 3: SIMULATOR-PROMOTE -- new real-runtime regression test for D-FIX + E-FIX (LOAD-BEARING; commit third)</name>
  <files>tests/sidepanel-background-tab-completion.test.js, package.json</files>
  <action>
Promote the debugger simulator (.planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/cluster1-sim2.js.orig)
into a real-runtime regression test at
tests/sidepanel-background-tab-completion.test.js.

PATTERN (MANDATORY): mirror
tests/sidepanel-progress-tick-setter-routing.test.js's brace-walk + sandbox
eval approach. Specifically:
  - Locate the big chrome.runtime.onMessage.addListener body using the
    "switch (request.action)" anchor (sidepanel.js has THREE addListener
    calls; we need the one with the switch).
  - Brace-walk to extract the listener body.
  - Construct a sandboxed Function whose parameter list injects all the
    helpers + module-scope mirrors the case body needs.
  - Inject the SAME mocks the progress-tick test uses (chrome.runtime /
    tabs, DOM stubs, persistence stubs, render stubs).

REQUIRED ASSERTIONS (the test MUST drive the actual handler body via
sandbox eval -- NO static-text grep for "presence of fix"):

Part 1 -- post-Task-1 structural sanity (informational):
  Locate the case 'automationComplete' body and confirm presence of
  sessionKnown variable, unconditional _persistMessageToConversation,
  _renderCompletionDomOnly call (not completeStatusMessage), and the
  relaxed outer guard scanning _tabRunningMap.

Part 2 -- D-FIX scenario (Tab B completes while user on Tab A):
  Setup: _tabRunningMap has Tab A (100, sess_A, isRunning:true) and
  Tab B (200, sess_B, isRunning:true). _activeTabIdSnapshot=100.
  conversationId='conv_A'. moduleIsRunning=true. moduleCurrentSessionId=sess_A.
  Dispatch automationComplete with sessionId=sess_B, conversationId=conv_B,
  tabId=200 (threaded post-Task-2), result='B done'.

  Assertions:
    2.1 _persistMessageToConversation called with convId='conv_B' (NOT 'conv_A')
    2.2 _persistMessageToConversation called EXACTLY ONCE this dispatch
    2.3 Tab B's _tabRunningMap entry now has isRunning:false, sessionId:null
    2.4 Tab A's _tabRunningMap entry UNTOUCHED (isRunning:true, sess_A)
    2.5 moduleIsRunning UNTOUCHED (still true) and moduleCurrentSessionId
        UNTOUCHED (still sess_A) -- active-tab UI stays running
    2.6 _renderCompletionDomOnly NOT called (isOriginatingActive=false)
    2.7 sendBtn.disabled stays true (active-tab UI undisturbed)

Part 3 -- E-FIX scenario (Tab A completes, currentStatusMessage non-null):
  Setup: like Part 2 but dispatch automationComplete for sess_A, conv_A,
  tabId=100. currentStatusMessage set to a fake DOM stub with a spy-able
  remove method. result='A done'.

  Assertions:
    3.1 _persistMessageToConversation called EXACTLY ONCE with convId='conv_A'
        (NOT twice -- E-FIX no longer routes through addCompletionMessage)
    3.2 completeStatusMessage NOT called (if-branch now uses manual cleanup
        plus _renderCompletionDomOnly directly)
    3.3 addCompletionMessage NOT called (its internal _persistMessage was
        the second persist site)
    3.4 _renderCompletionDomOnly called EXACTLY ONCE with text='A done'
    3.5 currentStatusMessage.remove() was called (manual cleanup)
    3.6 setIdleState called with tabId=100 (per-tab routing)
    3.7 Tab A's _tabRunningMap entry now has isRunning:false

Part 4 -- pre-Task-1 sanity (informational comment block only):
  Add a comment block explaining the assertions in Part 2 would have FAILED
  against pre-Task-1 sidepanel.js (outer bail + strict-match drop the entire
  body for background-tab completions) and assertion 3.1 would have FAILED
  for double-persist. Do NOT add actual pre-fix reproduction code.

OUTPUT FORMAT: print `N PASS / M FAIL` summary, exit 0 on all-pass, exit 1
otherwise. Match the style of
tests/sidepanel-progress-tick-setter-routing.test.js verbatim (ok() helper,
console.log section headers, no chalk/colors).

REGISTER IN package.json: append
`&& node tests/sidepanel-background-tab-completion.test.js`
as the FINAL entry of `scripts.test` chain (after
sidepanel-progress-tick-setter-routing.test.js).

VERIFY before commit: `node tests/sidepanel-background-tab-completion.test.js`
exits 0 against post-Task-1 + post-Task-2 sidepanel.js + agent-loop.js. Then
`npm test` exits 0 end-to-end.

ASCII only. No emojis.
  </action>
  <verify>
    <automated>node tests/sidepanel-background-tab-completion.test.js &amp;&amp; grep -q "sidepanel-background-tab-completion.test.js" package.json &amp;&amp; npm test</automated>
  </verify>
  <done>
    tests/sidepanel-background-tab-completion.test.js exists, drives the actual
    sidepanel.js handler body via brace-walk + sandbox eval, asserts Tab B's
    completion persists to conv_B (D-FIX) AND Tab A's completion produces
    EXACTLY ONE persist (E-FIX). Test exits 0. package.json scripts.test
    chain extended with new test as final entry. npm test exits 0 end-to-end.
    Single git commit:
    test(uof-3): real-runtime regression test for D-FIX + E-FIX (promotes /tmp simulator)
  </done>
</task>

<task type="auto">
  <name>Task 4: C-FIX -- distinguish alreadyEnded from never-existed in stopAutomation (additive polish)</name>
  <files>extension/background.js, extension/ui/sidepanel.js</files>
  <action>
Cosmetic fix for Symptom C from .planning/debug/cluster1-routing.md.
After Task 1, the D chain is fixed so this is defensive polish for the
narrow race window where stop arrives between completion broadcast and
the sidepanel handler running.

Step A -- extension/background.js handleStopAutomation (L7062-7133):
Add a Tier 3 fallback BEFORE the "Session not found" sendResponse. After
the existing Tier 1 (activeSessions) + Tier 2 (chrome.storage.session)
lookups both miss, look up chrome.storage.local.get(['fsbSessionLogs']).
If fsbSessionLogs[sessionId] exists, this session completed cleanly and
was cleaned up. Return:

```javascript
sendResponse({
  success: false,
  alreadyEnded: true,
  error: 'Already completed'
});
```

Insert this between L7126 and L7133, BEFORE the final
`sendResponse({ success: false, error: 'Session not found' })`:

```javascript
} else {
  automationLogger.warn('Session not found in memory or storage', { sessionId });

  // C-FIX (cluster1-routing.md): tier-3 lookup -- if the session is in
  // fsbSessionLogs, it completed cleanly between UI state and stop-click.
  // Distinguish so the sidepanel renders a friendly toast.
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs']);
    const sessionLogs = stored.fsbSessionLogs || {};
    if (sessionLogs[sessionId]) {
      automationLogger.info('Stop on already-completed session (race with natural completion)', { sessionId });
      sendResponse({
        success: false,
        alreadyEnded: true,
        error: 'Already completed'
      });
      return;
    }
  } catch (logsErr) {
    automationLogger.warn('fsbSessionLogs tier-3 lookup failed', { sessionId, error: logsErr.message });
    // fall through to default 'Session not found' response
  }

  sendResponse({
    success: false,
    error: 'Session not found'
  });
}
```

Step B -- extension/ui/sidepanel.js stopAutomation response handler
(L1300-1342, specifically the else branch at L1335-1340): add a branch
on `response.alreadyEnded`:

```javascript
} else {
  const errorMsg = response ? response.error : 'Unknown error';
  if (response && response.alreadyEnded) {
    // C-FIX: session completed cleanly between UI state and stop-click.
    // Treat as success: complete the loader DOM, set idle, no error toast.
    if (currentStatusMessage) {
      completeStatusMessage('Already completed', 'system');
    } else {
      addMessage('Already completed', 'system');
    }
    setIdleState(_resolveTabIdForSession(currentSessionId));
    currentSessionId = null;
    stopRequested = false;
    console.log('Side panel: Stop arrived after natural completion (alreadyEnded)');
  } else {
    addMessage('Error stopping automation: ' + errorMsg, 'error');
    stopRequested = false;
    console.error('Side panel: Stop automation failed:', errorMsg);
  }
}
```

NOTE: completeStatusMessage('Already completed', 'system') here is SAFE.
The system-type branch at L1676-1678 routes to addMessage (not
addCompletionMessage), so no double-persist risk.

ASCII only. No emojis.
  </action>
  <verify>
    <automated>node -e "var s=require('fs').readFileSync('extension/background.js','utf8');if(s.indexOf('alreadyEnded: true')===-1)throw new Error('background.js missing alreadyEnded');if(s.indexOf(\"'Already completed'\")===-1)throw new Error('background.js missing Already completed string');console.log('background.js OK');var sp=require('fs').readFileSync('extension/ui/sidepanel.js','utf8');if(sp.indexOf('alreadyEnded')===-1)throw new Error('sidepanel.js missing alreadyEnded branch');console.log('sidepanel.js OK');"</automated>
  </verify>
  <done>
    background.js handleStopAutomation has tier-3 fsbSessionLogs lookup that
    returns {alreadyEnded:true, error:'Already completed'} when the session
    completed cleanly. sidepanel.js stopAutomation response handler has an
    alreadyEnded branch that shows a friendly system message instead of
    an error toast. Single git commit:
    fix(uof-4): C-FIX distinguish alreadyEnded from never-existed in stopAutomation
  </done>
</task>

<task type="auto">
  <name>Task 5: B-FIX -- per-tab currentStatusMessage + currentActionGroup mirror (additive polish)</name>
  <files>extension/ui/sidepanel.js</files>
  <action>
Fix the module-scope leak of currentStatusMessage + currentActionGroup
across tabs. Today currentStatusMessage is a single module-scope variable;
when the user switches from Tab A (mid-task, loader visible) to Tab B
(idle), the loader visually persists in the chat DOM under conversationId
swap. Worse, if Tab B's session ends while user is on Tab A, the active-tab
path in the new D-FIX handler will clear currentStatusMessage on Tab A.

PLANNER AUDIT OF currentActionGroup (per orchestrator constraint):
Verified by grep that currentActionGroup has the EXACT SAME lifecycle as
currentStatusMessage:
  - Set inside ensureActionGroup (L1525): returns null if !currentStatusMessage,
    so the action group is meaningless without the status message.
  - Cleared at L1490 (setIdleState active-tab path) -- same site as currentStatusMessage cleanup.
  - Cleared at L1589 (addStatusMessage replaces current status, also clears group).
  - Cleared at L1670 (completeStatusMessage path).
DECISION: currentActionGroup leaks the same way as currentStatusMessage.
Treat them as a SINGLE per-tab intent pair. The mirror map keys both fields
together.

Step A -- add module-scope state near line 1523 (after the
currentActionGroup declaration):

```javascript
// B-FIX (cluster1-routing.md Cluster 2 leftover):
// Per-tab mirror of (currentStatusMessage, currentActionGroup). Eagerly
// stored on tab swap-OUT; lazily restored on tab swap-IN. Prevents the
// single module-scope vars from leaking one tab's loader DOM across tabs.
var _tabStatusIntentMap = new Map(); // Map<tabId, {statusMessage, actionGroup}>
```

Step B -- add helpers immediately after the declaration:

```javascript
function _persistTabStatusIntent(tabId) {
  if (typeof tabId !== 'number') return;
  _tabStatusIntentMap.set(tabId, {
    statusMessage: currentStatusMessage,
    actionGroup: currentActionGroup
  });
}
function _restoreTabStatusIntent(tabId) {
  if (typeof tabId !== 'number') {
    currentStatusMessage = null;
    currentActionGroup = null;
    return;
  }
  var entry = _tabStatusIntentMap.get(tabId);
  if (entry) {
    currentStatusMessage = entry.statusMessage || null;
    currentActionGroup = entry.actionGroup || null;
  } else {
    currentStatusMessage = null;
    currentActionGroup = null;
  }
}
function _clearTabStatusIntent(tabId) {
  if (typeof tabId !== 'number') return;
  _tabStatusIntentMap.delete(tabId);
}
```

Step C -- call _persistTabStatusIntent BEFORE swapToTabConversation
clears module state on tab switch-OUT, and _restoreTabStatusIntent AFTER
swapToTabConversation loads the new tab's conversation. Locate
swapToTabConversation by grepping. If swapToTabConversation does not
exist by that name, the equivalent path is whatever code runs in response
to chrome.tabs.onActivated and updates _activeTabIdSnapshot. The pattern:

```javascript
// (in tab switch-OUT path, before _activeTabIdSnapshot is reassigned)
_persistTabStatusIntent(_activeTabIdSnapshot);

// (after _activeTabIdSnapshot = newTabId AND conversationId swap)
_restoreTabStatusIntent(_activeTabIdSnapshot);
```

Step D -- in setIdleState (L1464-1493): when clearing per-tab entry for a
NON-active tab, also clear that tab's status intent entry to free DOM
references:

```javascript
// existing: entry.isRunning = false; entry.sessionId = null;
if (target !== _activeTabIdSnapshot) {
  _clearTabStatusIntent(target);
}
```

When the active tab clears (the existing isActiveTab block), also clear
the active tab's intent map entry (the module-scope vars are now null,
so the mirror should match):

```javascript
// existing: currentStatusMessage = null; currentActionGroup = null;
_clearTabStatusIntent(_activeTabIdSnapshot);
```

Step E -- in the case 'automationComplete' handler from Task 1's
if-branch (when isOriginatingActive=true and currentStatusMessage exists),
after the manual cleanup, also clear the intent entry for that tab:

```javascript
if (currentStatusMessage) {
  try { currentStatusMessage.remove(); } catch (_e) {}
  currentStatusMessage = null;
  currentActionGroup = null;
  _clearTabStatusIntent(_activeTabIdSnapshot);
}
```

VERIFICATION: in the new test from Task 3 (or as a follow-on addition),
add Part 5 -- B-FIX scenario:
  - Setup: Tab A is active with currentStatusMessage set.
  - Swap to Tab B: _persistTabStatusIntent(100) called, then swap,
    then _restoreTabStatusIntent(200) sets currentStatusMessage=null.
  - Tab B's automationComplete fires: per Task 1, the if-branch does NOT
    fire (currentStatusMessage is null on Tab B because Tab B has no
    intent entry).
  - Swap back to Tab A: _restoreTabStatusIntent(100) restores Tab A's
    currentStatusMessage.

Adding Part 5 is OPTIONAL (Task 3 verifies Tasks 1+2 minimum) -- the B-FIX
correctness can be left to manual UAT since it is additive polish.

ASCII only. No emojis.
  </action>
  <verify>
    <automated>node -e "var s=require('fs').readFileSync('extension/ui/sidepanel.js','utf8');if(s.indexOf('_tabStatusIntentMap')===-1)throw new Error('_tabStatusIntentMap not declared');if(s.indexOf('_persistTabStatusIntent')===-1)throw new Error('_persistTabStatusIntent helper missing');if(s.indexOf('_restoreTabStatusIntent')===-1)throw new Error('_restoreTabStatusIntent helper missing');if(s.indexOf('_clearTabStatusIntent')===-1)throw new Error('_clearTabStatusIntent helper missing');console.log('B-FIX helpers OK');"</automated>
  </verify>
  <done>
    sidepanel.js has _tabStatusIntentMap module-scope Map, plus the three
    persist/restore/clear helpers; tab swap path persists outgoing tab's
    intent and restores incoming tab's intent; setIdleState clears intent
    on per-tab cleanup; case 'automationComplete' clears intent after
    manual loader cleanup. Audit decision (currentActionGroup leaks the
    same way as currentStatusMessage; both mirrored together) documented
    in the commit message. Single git commit:
    fix(uof-5): B-FIX per-tab currentStatusMessage + currentActionGroup mirror
  </done>
</task>

<task type="auto">
  <name>Task 6: A-FIX + memory amendment -- Chrome 141+ sidePanel.close auto-collapse with per-window gate (additive polish)</name>
  <files>extension/background.js, /Users/lakshmanturlapati/.claude/projects/-Users-lakshmanturlapati-Desktop-FSB/memory/project_chrome_sidepanel_no_close.md</files>
  <action>
Re-add the panel auto-collapse behavior that was reverted in commit
09576615 (Strategy B), but this time using the Chrome 141+
chrome.sidePanel.close() API instead of the broken setOptions({enabled:false})
path. Honor the existing memory file project_chrome_sidepanel_no_close.md
by NOT re-adding the setOptions path, and amend the memory to document
the close() exception.

Step A -- extension/background.js: add a chrome.tabs.onActivated listener
near the existing tab-resolver block (grep for "chrome.tabs.onActivated"
to confirm it is currently absent per Strategy B revert; the test at
tests/sidepanel-tab-scoping-fix-redo-smoke.test.js Part 1 explicitly
asserts the listener is REMOVED -- that assertion must be UPDATED in
this task; see Step D below).

```javascript
// A-FIX (cluster1-routing.md Cluster 2 leftover):
// Chrome 141+ added chrome.sidePanel.close(). Use it to auto-collapse
// the panel when the user activates a tab in a window where NO tab has
// an active automation session.
//
// CRITICAL per-window gate: if ANY tab in the activated tab's window
// has an active session (e.g., user switches from working Tab A to
// non-working Tab B in the same window), DO NOT close -- Tab A's panel
// must stay visible.
//
// Pre-Chrome-141: silently skip (feature-detect). Memory
// project_chrome_sidepanel_no_close.md amended in this same commit.
chrome.tabs.onActivated.addListener(async function (activeInfo) {
  try {
    if (typeof chrome.sidePanel === 'undefined') return;
    if (typeof chrome.sidePanel.close !== 'function') return; // pre-141

    var activatedTabId = activeInfo && activeInfo.tabId;
    var activatedWindowId = activeInfo && activeInfo.windowId;
    if (typeof activatedTabId !== 'number' || typeof activatedWindowId !== 'number') return;

    // Per-window has-any-working-tab gate.
    var tabsInWindow = await chrome.tabs.query({ windowId: activatedWindowId });
    var anyWorking = false;
    for (var i = 0; i < tabsInWindow.length; i++) {
      var t = tabsInWindow[i];
      if (t && typeof t.id === 'number' && findActiveAutomationSessionForTab(t.id)) {
        anyWorking = true;
        break;
      }
    }
    if (anyWorking) return; // keep panel visible

    // No working tab in this window -- close the panel.
    try {
      await chrome.sidePanel.close({ windowId: activatedWindowId });
    } catch (closeErr) {
      console.warn('[FSB] chrome.sidePanel.close failed (non-fatal)', closeErr && closeErr.message);
    }
  } catch (outerErr) {
    console.warn('[FSB] chrome.tabs.onActivated A-FIX handler error', outerErr && outerErr.message);
  }
});
```

Step B -- amend memory file
/Users/lakshmanturlapati/.claude/projects/-Users-lakshmanturlapati-Desktop-FSB/memory/project_chrome_sidepanel_no_close.md.
Add an EXCEPTION subsection BEFORE the "How to apply" paragraph:

```markdown
**EXCEPTION (Chrome 141+):** Chrome 141 added `chrome.sidePanel.close({windowId})`.
This API DOES close the panel reliably even when the manifest declares
`side_panel.default_path`, because it operates per-window rather than
per-tab. The QT-uof-6 task (2026-06-08) added a `chrome.tabs.onActivated`
listener in `background.js` that calls `chrome.sidePanel.close({windowId})`
when the activated tab's window contains NO active automation session.
Per-window has-any-working-tab gate enumerates `chrome.tabs.query({windowId})`
and filters via `findActiveAutomationSessionForTab` so a user switching
from a working Tab A to a non-working Tab B in the SAME window does
NOT lose Tab A's panel. Feature-detected (`typeof chrome.sidePanel.close === 'function'`),
so pre-141 installs degrade silently to no auto-collapse. The
`setOptions enabled:false` path remains FORBIDDEN per the original
memory body above -- the EXCEPTION is ONLY for the new `close()` API.
```

Do NOT touch the original memory body paragraph (the `setOptions enabled:false`
prohibition still applies); only ADD the EXCEPTION block above "How to apply".

Step C -- update the test assertion in
tests/sidepanel-tab-scoping-fix-redo-smoke.test.js Part 1 (L94-96) which
currently asserts the chrome.tabs.onActivated listener is REMOVED:

```javascript
// Replace L94-96:
console.log('\nPart 1 -- chrome.tabs.onActivated listener RE-ADDED for Chrome 141+ sidePanel.close auto-collapse:');
ok(bgSrc.indexOf('chrome.tabs.onActivated.addListener') !== -1,
   'Part 1 -- chrome.tabs.onActivated listener PRESENT in background.js (A-FIX cluster1-routing.md)');
ok(bgSrc.indexOf('chrome.sidePanel.close') !== -1,
   'Part 1 -- chrome.sidePanel.close call present (Chrome 141+ auto-collapse)');
ok(bgSrc.indexOf('findActiveAutomationSessionForTab') !== -1,
   'Part 1 -- per-window has-any-working-tab gate via findActiveAutomationSessionForTab');
```

Replace the existing rationale comment block at L78-93 with a 1-line
ref to the new cluster1-routing.md task; the old debug note about
qt93i-regression.md stays referenced as historical context.

Step D -- NO re-add of setOptions enabled:false path. NO change to
manifest.json default_path. NO change to the chrome.action.onClicked
gesture-preservation pattern from commit 8bb40a9b. ONLY the new
chrome.tabs.onActivated -> chrome.sidePanel.close path.

ASCII only. No emojis.
  </action>
  <verify>
    <automated>node -e "var s=require('fs').readFileSync('extension/background.js','utf8');if(s.indexOf('chrome.tabs.onActivated.addListener')===-1)throw new Error('chrome.tabs.onActivated listener missing');if(s.indexOf('chrome.sidePanel.close')===-1)throw new Error('chrome.sidePanel.close call missing');if(s.indexOf('findActiveAutomationSessionForTab')===-1)throw new Error('findActiveAutomationSessionForTab helper not referenced');if(s.indexOf('setOptions')!==-1 &amp;&amp; s.indexOf('enabled: false')!==-1){var idx=s.indexOf('enabled: false');console.warn('warn: enabled: false present at offset '+idx+'; verify it is not in onActivated path');}console.log('background.js OK');var m=require('fs').readFileSync('/Users/lakshmanturlapati/.claude/projects/-Users-lakshmanturlapati-Desktop-FSB/memory/project_chrome_sidepanel_no_close.md','utf8');if(m.indexOf('Chrome 141')===-1)throw new Error('memory file missing Chrome 141 exception');console.log('memory OK');"</automated>
  </verify>
  <done>
    background.js has chrome.tabs.onActivated listener that calls
    chrome.sidePanel.close({windowId}) with feature-detect + per-window
    has-any-working-tab gate (via chrome.tabs.query({windowId}) +
    findActiveAutomationSessionForTab filter). Memory file
    project_chrome_sidepanel_no_close.md amended with EXCEPTION subsection
    documenting the Chrome 141+ close() path. Test
    sidepanel-tab-scoping-fix-redo-smoke.test.js Part 1 updated to assert
    the listener IS PRESENT (not REMOVED). setOptions enabled:false NOT
    re-added. npm test exits 0 end-to-end. Single git commit:
    feat(uof-6): A-FIX Chrome 141+ sidePanel.close auto-collapse with per-window gate (memory amended)
  </done>
</task>

</tasks>

<verification>
End-to-end verification after all 6 commits land on `automation` branch:

  1. `npm test` exits 0. The new tests/sidepanel-background-tab-completion.test.js
     passes all parts. The amended tests/sidepanel-tab-scoping-fix-redo-smoke.test.js
     Part 1 (re-add assertion) passes. All other 100+ tests remain green.

  2. Visual UAT (manual, optional -- left to user / milestone UAT):
     a. Open Tab A, dispatch task X.
     b. Open Tab B (new tab in same window), dispatch task Y.
     c. While both tasks are running, stay on Tab A; wait for Tab B to complete.
     d. Verify: Tab A's task continues running (currentStatusMessage loader
        still visible). No completion bubble appears in Tab A's chat.
     e. Wait for Tab A's task to complete.
     f. Verify: EXACTLY ONE completion bubble appears in Tab A's chat (E-FIX).
     g. Swap to Tab B.
     h. Verify: Tab B's completion bubble is visible in chat (D-FIX
        hydrate-on-swap). Tab B's sendBtn is enabled.

  3. C-FIX UAT: dispatch a quick task, click Stop AFTER the task completes
     naturally but before the UI updates. Verify: toast shows "Already
     completed" (not "Session not found").

  4. A-FIX UAT (Chrome 141+ only): on a Chrome 141+ install, switch from
     a working tab to a non-working tab IN A DIFFERENT WINDOW; panel
     collapses. Switch within same window (working + non-working tabs);
     panel stays visible.

  5. Memory file project_chrome_sidepanel_no_close.md contains both the
     original prohibition body AND the new Chrome 141+ exception block.
</verification>

<success_criteria>
- 6 git commits landed on `automation` branch in order: T1 -> T2 -> T3 -> T4 -> T5 -> T6.
- npm test exits 0 after T3 and stays exit-0 through T6.
- tests/sidepanel-background-tab-completion.test.js exists, is registered in
  package.json scripts.test, exercises the actual sidepanel.js handler body
  (not static-text grep), and asserts D-FIX + E-FIX behavior.
- All 13 background.js automationComplete call sites include `tabId:` key.
- agent-loop.js notifySidepanel includes `tabId: sess.tabId || null` in message.
- sidepanel.js case 'automationComplete' has relaxed outer guard, unconditional
  persist, isOriginatingActive-gated DOM render, NO completeStatusMessage call
  in the if-branch.
- sidepanel.js has _tabStatusIntentMap module-scope state + persist/restore/clear
  helpers + tab-swap call sites for B-FIX.
- background.js has chrome.tabs.onActivated listener with chrome.sidePanel.close
  feature-detect + per-window gate for A-FIX.
- Memory file amended with Chrome 141+ EXCEPTION block.
- handleStopAutomation tier-3 lookup distinguishes alreadyEnded for C-FIX.
- ROADMAP.md NOT touched (quick-task scope).
</success_criteria>

<output>
After completion: this is a quick task (not a phase), so no SUMMARY.md is
required. The 6 git commits + the updated STATE.md "Quick Tasks Completed"
row (which the post-task router or user will append) serve as the audit
trail. Each commit message follows the format documented in the task <done>
blocks above.
</output>
