# Phase 12: Side panel follows automation -- live progress + persistent per-conversation message log + per-tab sidepanel auto-open/close - Research

**Researched:** 2026-06-08
**Domain:** FSB Chrome MV3 sidepanel UI -- message-channel audit + chrome.storage.local persistence layer + chrome.sidePanel API binding
**Confidence:** HIGH (all 26 CONTEXT decisions cross-checked against in-tree code; line numbers verified via Read + grep; INV-04 baseline = 8 verified; INV-06 SHA = e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 verified; chrome.sidePanel API constraints verified against official Chrome docs; no Lattice-side surface required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Per-conversation message log -- storage shape + write strategy (Area 1)**

- **D-01:** Storage backend is `chrome.storage.local` (not `chrome.storage.session`). Survives SW restart AND browser restart. Quota concern negligible at FSB scale (well under 10MB quota; `unlimitedStorage` permission is also declared in manifest).
- **D-02:** Envelope shape `fsbConversationMessages: { v: 1, byConv: { '<convId>': { v: 1, messages: [{role, content, timestamp, kind, ...}, ...], lastWriteAt, createdAt } }, lru: ['<convId>', ...] }` under one storage key. Single-key envelope mirrors Phase 11 `fsbSidepanelTabConversations` + Phase 9 `lattice-runtime-adapter` LRU pattern. Versioned at both envelope-level (`v: 1`) and per-conversation entry (`v: 1`).
- **D-03:** Write strategy is **write-through every `addMessage` call, debounced 200ms per conversationId**. Defense-in-depth: forced flush on `beforeunload` / sidepanel close.
- **D-04:** Eviction policy is **hard LRU cap of 50 conversations** matching Phase 11 envelope cap. On 51st insertion, evict the conversation with smallest `lastWriteAt`. Reuses Phase 11 `enforceLruCap` pattern.

**Hydrate path repoint (Area 2)**

- **D-05:** Repoint existing `hydrateChatFromConversationId(convId)` helper added at commit `b8b761e8`. Keep function name + signature unchanged. Swap data source from `fsbSessionLogs` + `fsbSessionIndex` to new `fsbConversationMessages` store. The `b8b761e8` body becomes the fallback path (Tier 2).
- **D-06:** **Fallback order:** Tier 1 = new `fsbConversationMessages` store; Tier 2 = legacy `fsbSessionLogs` + `fsbSessionIndex` (for pre-Phase-12 conversations); Tier 3 = empty render + show welcome.
- **D-07:** **Render fidelity 1:1** -- render every persisted message in chronological order, preserving role + kind tags. Roles: `user`, `assistant`. Kinds: `text`, `progress`, `tool`, `error`.
- **D-08:** **Hydrate fires at two call sites:** (a) on sidepanel boot after `initTabConversationStore`; (b) on `swapToTabConversation(tabId)` for tabs with a bound conversationId. No additional triggers.

**Live progress wiring (Area 3)**

- **D-09:** **Research-then-patch.** Audit message flow + identify the specific gap; fix is whichever combination of (a) background.js relay / (b) sidepanel listener / (c) agent-loop emission is broken, plus end-to-end tests.
- **D-10:** **Progress events persist too.** Every progress message in DOM via addMessage MUST also land in `fsbConversationMessages` store via debouncer.
- **D-11:** **Token-level streaming OUT OF SCOPE.** Discrete-message delivery only. Streaming defers to v0.11.0+.
- **D-12:** **Tool calls render as `kind: 'tool'` messages.** Styling is Claude's Discretion within existing sidepanel.css conventions.

**Per-tab sidepanel auto-open/close (Area 4)**

- **D-13:** **Auto-open trigger:** `chrome.sidePanel.open({tabId})` called from background.js inside Run-handler user-gesture context. Implementation: when autopilot binds Tab A, background.js calls `chrome.sidePanel.setOptions({tabId, enabled: true, path})` then `chrome.sidePanel.open({tabId})`.
- **D-14:** **Behavior on switch to non-automation tab:** **Stay open; swap view.** No `chrome.sidePanel.close` invocation. Rationale: auto-close is jarring; stay-open-with-swap is the same UX Phase 11 + Bug 1 fix already delivers.
- **D-15:** **Behavior on switch back to automation tab:** **No separate action needed.** Already covered by D-13 + D-14 + chrome.tabs.onActivated.
- **D-16:** **Multi-automation tabs:** Each automating tab has its own sidepanel view. No "primary tab" pinning.
- **D-17:** **Sidepanel "stays open" semantics:** Explicit user-close is respected (no fight-the-user-intent re-open). Auto-open ONLY fires on autopilot bind.

**Hard invariants (locked carry from v0.10.0)**

- **D-18:** **INV-01 / INV-02 MCP wire contracts UNTOUCHED.**
- **D-19:** **INV-04 BYTE-FROZEN.** `extension/ai/agent-loop.js` is OFF LIMITS. `grep -c "setTimeout" extension/ai/agent-loop.js` MUST stay 8 post-phase.
- **D-20:** **INV-05 deprecated agent modules frozen.**
- **D-21:** **INV-06 ZERO Lattice-side commits expected.** `current_lattice_sha` stays `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`.

**Surfaces in scope + out of scope**

- **D-22:** **Surfaces in scope:** `extension/ui/sidepanel.js`, `extension/ui/sidepanel.html`, `extension/background.js`, new sidecar `extension/ui/sidepanel-message-log.js`, `tests/sidepanel-message-log-smoke.test.js`, `package.json`.
- **D-23:** **Surfaces OUT of scope:** `extension/ai/agent-loop.js` (INV-04); MCP utility files beyond reads; Lattice files; manifest.json unless missing permission; popup.js.
- **D-24:** **NO chrome.tabs.onDiscarded change beyond Phase 11 D-15 (preserve).** Discard preserves both envelope entry AND message log entry. Only `chrome.tabs.onRemoved` drops both.

**Plan shape + UAT integration**

- **D-25:** **Anticipated plan breakdown:** 4-5 plans across 4-5 waves. Wave 0 smoke + sidecar; Wave 1 hydrate repoint; Wave 2 addMessage write-through; Wave 3 live progress wiring; Wave 4 per-tab sidepanel auto-open + ceremony.
- **D-26:** **Per-axis UAT-12 deferred to consolidated end-of-milestone UAT alongside UAT-08+09+10+11.** User runs UAT-08+09+10+11+12 in one Chrome MV3 reload session.

### Claude's Discretion

- Exact CSS class names + styling for `kind: 'progress'` and `kind: 'tool'` message lines.
- Exact debounce timer reset strategy (clear-and-replace vs trailing-edge-only).
- Exact module location of message-log sidecar (`extension/ui/sidepanel-message-log.js` recommended).
- Exact storage key string for envelope (recommended `fsbConversationMessages` -- ZERO collision verified).
- Whether debouncer ships as private function inside sidecar OR separate module.
- Exact wording for UAT-12 procedure sub-assertions.

### Deferred Ideas (OUT OF SCOPE)

- Token-level streaming output (D-11).
- Hard auto-close on tab switch (D-14 chose stay-open-with-swap).
- Auto-reopen on switch back to closed sidepanel (D-17 no-fight-user-intent).
- Per-conversation transcript export / download UI.
- Cross-tab conversation merging UI (inherited from Phase 11).
- Migration of pre-Phase-12 fsbSessionLogs into new store (fresh-only ship).
- iframe / cross-origin sidepanel hosting changes.
- Reset-on-mismatch semantics for message log (orphans LRU-evict naturally).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FINT-22** | Live progress wiring (Surface 1; D-09 + D-10). Trace + close the gap between autopilot emission and sidepanel DOM render. Every progress event must reach addMessage AND the persistent log. | Section 6 trace of all 4 hops identifies the gap: tool-level progress requires `showSidepanelProgressEnabled` setting (default `false`) for `tool_executed` sessionStateEvent to render. Settings-toggle as fix candidate vs unconditional render decision in Section 6.4. |
| **FINT-23** | Per-conversation message log + hydrate repoint (Surface 2; D-01 through D-08). New `chrome.storage.local` store keyed by `fsbConversationMessages`; Tier-1 hydrate from new store; Tier-2 fallback to existing `fsbSessionLogs` via b8b761e8 path; Tier-3 welcome. | Sections 4 + 5 verify envelope shape with zero collision (`grep -r fsbConversationMessages extension/` returns empty); Phase 11 `hydrateChatFromConversationId` at sidepanel.js:285-360 is the exact chokepoint. |
| **FINT-24** | Per-tab sidepanel auto-open/close (Surface 3; D-13 through D-17). `chrome.sidePanel.setOptions({tabId, enabled, path})` + `chrome.sidePanel.open({tabId})` in autopilot bind path. Stay-open-with-swap on tab switch via existing Phase 11 + Bug 1 fix machinery. | Section 7 verifies `chrome.sidePanel.open` requires user-gesture context; `setOptions` does NOT; Run-button click in sidepanel IS the gesture; multi-tab `setOptions` works per-tabId. |

REQ-ID rationale: continues FINT-NN..K placeholder series in REQUIREMENTS.md. FINT-22/23/24 explicitly close the three UX gaps surfaced during the 2026-06-08 UAT-FINAL session. Phase 12 SUMMARY will populate the traceability rows.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **NO emojis** in code, logs, markdown, or any file output unless explicitly requested. ENFORCED across all artifacts including this RESEARCH.md.
- **NO em-dashes or hyphens between sentences** in prose; use `.` (period) followed by capital letter OR `--` per FSB convention.
- **Browser automation policy:** Use FSB MCP tools for any live-browser tasks. (Not applicable to Phase 12 -- pure code phase.)
- **Run applications only when explicitly asked.** (Not applicable to Phase 12 -- research only.)
- **Real-runtime tests, not static-text grep.** Smoke must exercise actual functions with mocked chrome.* fixtures, not regex-scan source for identifier presence. Phase 11 cumulative 41 PASS smoke at `tests/sidepanel-tab-aware-smoke.test.js` is the convention reference; Phase 12 ships a sibling smoke at `tests/sidepanel-message-log-smoke.test.js`.

## Summary

Phase 12 ships **three coupled UX surfaces** that complete the side-panel UX delivery Phase 11 started, all FSB-internal with zero Lattice-side surface required.

1. **Live progress wiring (FINT-22).** Closes the visible "I see no progress" UX gap. ROOT CAUSE IDENTIFIED in Section 6: the existing `sessionStateEvent` channel from background.js to sidepanel.js is FULLY WIRED. `statusUpdate` messages already render via `updateStatusMessage` (the typing-dots-with-progress-bar UI). The user-visible gap is per-tool progress: `tool_executed` events arrive at sidepanel.js:1960-1964 but are GATED behind `showSidepanelProgressEnabled` setting which defaults to `false` (sidepanel.js:17 + 788). Smallest fix candidates documented; planner picks based on D-09 amendment + D-12 styling discretion.

2. **Persistent per-conversation message log + hydrate repoint (FINT-23).** New `chrome.storage.local` store under key `fsbConversationMessages` (verified zero collision). Envelope: `{v:1, byConv: {'<convId>': {v:1, messages:[...], lastWriteAt, createdAt}}, lru:['<convId>'...]}`. Write-through every `addMessage` call, 200ms debounced per-conversationId. Hard LRU cap = 50 conversations (Phase 11 algorithm port). The existing `hydrateChatFromConversationId(convId)` at sidepanel.js:285-360 is repointed -- function name + signature UNCHANGED, body restructured to 3-tier fallback (new store -> legacy fsbSessionLogs -> empty).

3. **Per-tab sidepanel auto-open/close (FINT-24).** Adds `chrome.sidePanel.setOptions({tabId, enabled: true, path: 'ui/sidepanel.html'})` + `chrome.sidePanel.open({tabId})` to the autopilot-bind code path in background.js. The Run-button click in sidepanel IS the user gesture that satisfies the chrome.sidePanel.open requirement (verified Section 7). Tab-switch swap-view already shipped by Phase 11 (chrome.tabs.onActivated handler at sidepanel.js:727 + Bug 1 fix chrome.windows.onFocusChanged backstop at sidepanel.js:765). No `chrome.sidePanel.close` invocation per D-14 (close requires gesture; cannot fire on tab switch).

**INV-06 binary verdict: NOT TRIGGERED.** Zero Lattice-side commits required. The chrome.storage.local envelope is FSB host-runtime storage, not a Lattice contract. The chrome.sidePanel API is Chrome host platform. The message-log debouncer is pure FSB-side. `current_lattice_sha` stays frozen at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 HEAD; verified via `cd lattice && git rev-parse HEAD`).

**INV-04 byte-freeze: SAFE.** Phase 12 touches `sidepanel.js` + `sidepanel.html` + `background.js` + new sidecar `extension/ui/sidepanel-message-log.js` + new smoke + package.json scripts.test chain append. `agent-loop.js` is OFF LIMITS. `grep -c "setTimeout" extension/ai/agent-loop.js` stays at the verified post-Phase-11 baseline of **8** (verified via Bash). Smoke ships a Part N byte-freeze regression assertion.

**Primary recommendation:** Land as **5 plans across 5 waves**, sequential due to shared sidepanel.js editing region across Waves 1+2+3:
- **Plan 12-00 (Wave 0):** Smoke harness scaffold + sidecar `sidepanel-message-log.js` (envelope CRUD + 200ms debouncer + LRU helpers + dual-export IIFE). PASS-when-empty placeholders for Parts 1-N.
- **Plan 12-01 (Wave 1):** Hydrate repoint (FINT-23 partial). Wire new store as Tier 1; keep fsbSessionLogs as Tier 2 fallback. sidepanel.html script-tag inserts new sidecar before sidepanel.js.
- **Plan 12-02 (Wave 2):** addMessage write-through wiring (FINT-23 partial). Every addMessage call writes to DOM AND persistent store via debouncer. `kind` parameter added to addMessage signature backward-compatibly (default `kind: 'text'`).
- **Plan 12-03 (Wave 3):** Live progress wiring research + fix (FINT-22). Closes "I see no progress" UX gap via the smallest fix identified in Section 6.
- **Plan 12-04 (Wave 4):** Per-tab sidepanel auto-open binding (FINT-24) + ceremony closure. background.js gains chrome.sidePanel.setOptions + open call sites in autopilot bind path; REQUIREMENTS.md FINT-22/23/24 narrative + traceability + LATTICE-PIN.md Phase 12 row (SHA UNCHANGED) + v0.10.0-MILESTONE-AUDIT.md status_history phase_12_shipped + 12-VERIFICATION.md UAT-12 procedure.

## Section 1: Architecture and Integration Approach for Each Surface

### 1.A Surface 1 -- Live Progress Wiring (FINT-22; D-09 + D-10)

**Integration point:** `extension/ui/sidepanel.js:1794-1971` -- the autopilot inbound chrome.runtime.onMessage listener that handles 5 message actions:
- `automationComplete` (lines 1796-1855) -- terminal success
- `statusUpdate` (lines 1857-1875) -- WORKING per-iteration progress via `updateStatusMessage`
- `automationError` (lines 1878-1924) -- terminal error
- `loginDetected` (lines 1926-1935) -- mid-task login interrupt
- `paymentFillConfirmation` (line 1937-1939) -- mid-task payment confirm
- `sessionStateEvent` (lines 1941-1969) -- the state-emitter pub/sub channel with 4 event-type cases

**Existing rendering chain:**

```
agent-loop.js / background.js
  -> emit statusUpdate via chrome.runtime.sendMessage
  -> sidepanel.js line 1857 case 'statusUpdate'
  -> updateStatusMessage(text, progressData)  [line 1367]
  -> mutates currentStatusMessage DOM node (typing-dots indicator with progress bar)
```

This pipe WORKS for the typing-dots-style status indicator (the dot loader at the bottom of the chat that animates while autopilot is in flight). Section 6 maps out why the user reports "no progress" despite this channel firing -- the answer is that the typing-dots indicator is visually subtle AND per-tool execution events are gated behind a settings toggle (`showSidepanelProgressEnabled` default `false`).

**Phase 12 wiring shape:**

The integration is additive at the existing inbound listener (sidepanel.js:1794-1971). For every event type that contains user-visible progress information, the handler also routes a structured-shape message through `addMessage` with the new `kind` parameter so the persistent log + UX surface both update:

```js
// Phase 12 FINT-22 -- progress event types map to addMessage(kind, content, role)
case 'sessionStateEvent':
  if (request.sessionId !== currentSessionId) break;
  switch (request.eventType) {
    case 'iteration_complete':
      // existing updateStatusMessage call preserved
      // NEW: addMessage(`Step ${request.iteration} complete`, 'assistant', 'progress')
      break;
    case 'tool_executed':
      // existing addActionMessage GATED behind showSidepanelProgressEnabled
      // NEW: addMessage(`${request.toolName}${request.success ? '' : ' [failed]'}`, 'assistant', 'tool')
      //      UNCONDITIONAL per D-12 (kind: 'tool' visible by default; styling via Claude's Discretion)
      break;
    // ...
  }
```

**Critical INV-04 boundary:** all wiring is in sidepanel.js inbound listeners and background.js outbound broadcasters. `agent-loop.js` is OFF LIMITS. The agent-loop already emits via `chrome.runtime.sendMessage` and the state-emitter; Phase 12 routes the EXISTING emissions to the new persistence chokepoint, never modifying the emission source.

### 1.B Surface 2 -- Persistent Per-Conversation Message Log + Hydrate Repoint (FINT-23; D-01 through D-08)

**Sidecar module:** `extension/ui/sidepanel-message-log.js` follows the Phase 11 `sidepanel-tab-conv-store.js` shape exactly:
- IIFE dual-export pattern: `(function(global) { ... })(typeof globalThis !== 'undefined' ? globalThis : this)` with `global.FSBSidepanelMessageLog = exportsObj` + `module.exports = exportsObj`.
- Pure helpers: `emptyEnvelope`, `isValidEnvelope`, `appendMessage`, `getConversationMessages`, `dropConversation`, `_touchLru`, `_enforceLruCap`.
- Storage I/O abstracted as injected callbacks (`storageReadFn`, `storageWriteFn`) so smoke tests mock without touching extension host globals.
- 200ms-debounce timer table: `Map<convId, timeoutId>` keyed by conversationId; trailing-edge semantics; `flush(convId)` forces immediate write; `flushAll()` for sidepanel beforeunload.

**Storage envelope:**

```typescript
interface FsbConversationMessagesEnvelope {
  v: 1;
  byConv: {
    [convId: string]: {
      v: 1;
      messages: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: number;     // Date.now() at addMessage call
        kind: 'text' | 'progress' | 'tool' | 'error';
      }>;
      lastWriteAt: number;     // Date.now() at last flush
      createdAt: number;       // Date.now() at first appendMessage for this convId
    };
  };
  lru: string[];               // MRU head; tail evicted at cap (50)
}
```

**Integration point:** `extension/ui/sidepanel.js:1469-1523` -- the existing `addMessage(text, type)` helper is the DOM chokepoint. Phase 12 extends its signature backward-compatibly:

```js
// Pre-Phase-12 signature: addMessage(text, type = 'system')
// Phase 12 signature: addMessage(text, type = 'system', kind)
//   kind defaults to 'text' for the existing call sites
//   new call sites in the autopilot listener pass kind='progress' or kind='tool'
function addMessage(text, type = 'system', kind) {
  // ... existing DOM render code unchanged ...

  // Phase 12 FINT-23 write-through:
  if (typeof FSBSidepanelMessageLog !== 'undefined' && conversationId) {
    var role = (type === 'user') ? 'user' : 'assistant';
    var resolvedKind = kind || (type === 'error' ? 'error' : 'text');
    try {
      FSBSidepanelMessageLog.appendMessage(conversationId, {
        role: role,
        content: text,
        timestamp: Date.now(),
        kind: resolvedKind
      });
      // debouncer schedules write 200ms in the future
    } catch (_e) { /* swallow -- DOM render must never block on storage */ }
  }
}
```

The existing 100+ `addMessage` call sites in sidepanel.js (verified via grep, 60+ matches) ALL automatically gain persistence by going through this chokepoint. This is the strongest leverage point in the file.

**Hydrate path repoint:** `extension/ui/sidepanel.js:285-360` `hydrateChatFromConversationId` is the existing function added at commit `b8b761e8` (Bug 2 partial fix). Phase 12 D-05 keeps the function name + signature unchanged; body becomes 3-tier:

```js
async function hydrateChatFromConversationId(convId) {
  if (!convId || typeof convId !== 'string') return 0;
  if (!chatMessages) return 0;

  // Tier 1 (Phase 12): new fsbConversationMessages store
  try {
    if (typeof FSBSidepanelMessageLog !== 'undefined') {
      var messages = await FSBSidepanelMessageLog.getConversationMessages(
        convId,
        (key) => chrome.storage.local.get(key)
      );
      if (Array.isArray(messages) && messages.length > 0) {
        chatMessages.innerHTML = '';
        for (var i = 0; i < messages.length; i++) {
          renderPersistedMessage(messages[i]);
        }
        return messages.length;
      }
    }
  } catch (_e) { /* fall through to Tier 2 */ }

  // Tier 2 (b8b761e8 body preserved verbatim): legacy fsbSessionLogs fallback
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    // ... existing b8b761e8 body lines 289-358 here ...
  } catch (_e) {
    // Tier 3: empty render (caller fires welcome)
    return 0;
  }
}
```

### 1.C Surface 3 -- Per-Tab Sidepanel Auto-Open/Close Binding (FINT-24; D-13 through D-17)

**Integration point:** `extension/background.js` autopilot bind path. The existing `startAutomation` handler (around line 6447+ per grep of `case 'startAutomation'`) is the user-gesture window. The sidepanel.js `handleSendMessage` (line 993) calls `chrome.runtime.sendMessage({action: 'startAutomation', task, tabId, ...})` synchronously inside the sendBtn click handler -- the user click IS the user gesture, and the message-bus call from sidepanel to SW does NOT consume the gesture (per Chromium-issues thread referenced in Section 7).

**Phase 12 wiring shape in background.js:**

```js
// Inside the existing startAutomation handler, AFTER session bind succeeds
// but BEFORE any await that would consume the user gesture:
try {
  await chrome.sidePanel.setOptions({
    tabId: targetTabId,
    enabled: true,
    path: 'ui/sidepanel.html'
  });
  await chrome.sidePanel.open({ tabId: targetTabId });
} catch (sidePanelErr) {
  // Best-effort: setOptions or open failure does NOT abort the automation
  console.warn('[FSB] sidePanel auto-open failed', { error: sidePanelErr && sidePanelErr.message });
}
```

**Critical gesture-context constraint:** `chrome.sidePanel.open` MUST be called synchronously inside the user-gesture window. The sidepanel's sendBtn click handler triggers `handleSendMessage` -> `chrome.runtime.sendMessage({action: 'startAutomation', ...})` -- this round-trip preserves the gesture context across the message bus IF the SW handler is synchronous AND calls `chrome.sidePanel.open` before any other `await`. Section 7 documents the practical recipe.

**Tab-switch handling is FREE:** Phase 11 already shipped `chrome.tabs.onActivated` (sidepanel.js:727) + `chrome.windows.onFocusChanged` backstop (sidepanel.js:765) handlers that call `refreshOwnerChip` + `swapToTabConversation`. Phase 12 does NOT add NEW tab-switch handlers. The view-swap UX is the same one Phase 11 ships -- chip updates, input lockout re-evaluates, conversationId swaps, hydrate fires (with Phase 12's new Tier-1 source).

**Sidepanel stays open across tab switches** per chrome.sidePanel API docs: "When a user temporarily switches to a tab where the side panel is not enabled, the side panel will be hidden." Phase 12 calls `setOptions({enabled: true})` only for the automating tab; tabs without that setOptions inherit the global manifest default (also enabled via `side_panel.default_path`). So switching to a non-automating tab keeps the panel mounted but shows the global sidepanel.html (which is the same document instance per Chrome single-page semantics). Result: panel stays mounted, the chrome.tabs.onActivated handler in sidepanel.js fires, and the visible view swaps.

## Section 2: INV-06 Binary Verdict

**Verdict: NOT TRIGGERED. Zero Lattice-side commits expected.**

Reasoning across each Phase 12 surface:

| Surface | Subsystem | Lattice contract surface? | Verdict |
|---------|-----------|---------------------------|---------|
| Live progress wiring (FINT-22) | chrome.runtime.sendMessage relay + sidepanel inbound listener + addMessage hook | No -- FSB-internal Chrome runtime IPC | NOT TRIGGERED |
| Per-conversation message log (FINT-23) | chrome.storage.local envelope + debouncer + LRU | No -- chrome.storage.local is Chrome host storage; Lattice has no opinion | NOT TRIGGERED |
| Hydrate path repoint (FINT-23) | sidepanel.js function body swap (data source change) | No -- internal sidepanel function | NOT TRIGGERED |
| Per-tab sidepanel binding (FINT-24) | chrome.sidePanel.setOptions + open API | No -- Chrome host platform API | NOT TRIGGERED |
| addMessage hook for write-through (FINT-23) | sidepanel.js helper signature extension | No -- internal sidepanel helper | NOT TRIGGERED |

**Verified post-research:**
- `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 HEAD; unchanged through Phases 6-11).
- Zero new commits expected on Lattice's `fsb-integration-experiments` branch.
- LATTICE-PIN.md Phase 12 row carries `current_lattice_sha` UNCHANGED.

**If discuss-phase or downstream planning surfaces a Lattice primitive requirement:** that is a discuss-phase blocker requiring human review per D-21. The current research finds NO such requirement.

## Section 3: INV-04 Byte-Freeze Guard

**Baseline (verified 2026-06-08 via `grep -c "setTimeout" extension/ai/agent-loop.js`):** `8`.

Phase 12 wiring NEVER touches `agent-loop.js`. The autopilot-emission side of the message channel (statusUpdate / sessionStateEvent / automationComplete / automationError) already fires from existing agent-loop.js + background.js code paths; Phase 12 wires the SIDEPANEL-SIDE listener + persistence layer + chrome.sidePanel.open call site in background.js.

**Verification patterns the planner should use post-phase:**

```bash
# Pattern 1: setTimeout count must equal 8 (verified baseline)
grep -c "setTimeout" extension/ai/agent-loop.js
# Expected: 8

# Pattern 2: iterator pattern (the load-bearing 4 setTimeouts that drive the iteration)
grep -c "session._nextIterationTimer = setTimeout" extension/ai/agent-loop.js
# Expected: 4

# Pattern 3: Phase 12 token NEVER inside a setTimeout lambda body
# (mirrors Phase 8/9/10/11 pitfall guardrails)
awk '/setTimeout\s*\(/{flag=1; depth=0} flag{depth += gsub(/\{/,"{"); depth -= gsub(/\}/,"}"); if(/appendMessage|FSBSidepanelMessageLog|fsbConversationMessages|chrome\.sidePanel\.open|chrome\.sidePanel\.setOptions/){print "VIOLATION: Phase 12 token inside setTimeout lambda at line " NR ": " $0; exit 1}; if(depth<=0 && /\)/){flag=0}}' extension/ai/agent-loop.js
# Expected: empty output (zero violations)

# Pattern 4: git porcelain diff for agent-loop.js across Phase 12
git diff --stat extension/ai/agent-loop.js
# Expected: empty (zero byte changes; INV-04 binary)
```

Phase 12 smoke test ships a Part that exercises all 4 patterns programmatically (mirrors Phase 11 Plan 11-04 smoke Part 7 byte-freeze regression at >= 4 PASS).

## Section 4: Per-Conversation Message Log Envelope Shape

### Envelope schema (TypeScript-style)

```typescript
interface FsbConversationMessagesEnvelope {
  v: 1;
  byConv: {
    [convId: string]: ConversationLog;
  };
  lru: string[];  // MRU head; tail evicted at cap (50)
}

interface ConversationLog {
  v: 1;
  messages: PersistedMessage[];
  lastWriteAt: number;  // ms epoch; updated on every flush
  createdAt: number;    // ms epoch; set once on first appendMessage
}

interface PersistedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;  // Date.now() at addMessage call (not flush time)
  kind: 'text' | 'progress' | 'tool' | 'error';
}
```

Storage key: `fsbConversationMessages` (chrome.storage.local). **Verified ZERO collision** via `grep -rn "fsbConversationMessages" extension/` returning empty. Sibling keys in chrome.storage.local: `fsbSessionLogs`, `fsbSessionIndex`, `showSidepanelProgress`, `lastTask`, `uiMode`, `apiKey`, `captchaApiKey`. No risk of accidental overwrite or shape conflict.

### Debouncer pseudocode

```js
// Inside extension/ui/sidepanel-message-log.js sidecar
var _pendingWrites = new Map();  // convId -> { timer, messages: [] }
var _DEBOUNCE_MS = 200;

function appendMessage(convId, msg) {
  if (!convId || !msg) return;

  // 1. Load-or-init the pending bucket for this convId
  var pending = _pendingWrites.get(convId);
  if (!pending) {
    pending = { timer: null, messages: [] };
    _pendingWrites.set(convId, pending);
  }

  // 2. Append the message to in-memory buffer (immediate read consistency)
  pending.messages.push(msg);

  // 3. Reset the debounce timer (clear-and-replace -- planner discretion)
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(function () { _flushConv(convId); }, _DEBOUNCE_MS);
}

async function _flushConv(convId) {
  var pending = _pendingWrites.get(convId);
  if (!pending || pending.messages.length === 0) return;

  var batchedMessages = pending.messages.slice();  // copy snapshot
  pending.messages.length = 0;                      // clear in place
  pending.timer = null;

  try {
    // Read envelope from chrome.storage.local
    var bag = await chrome.storage.local.get(STORAGE_KEY);
    var envelope = bag[STORAGE_KEY];
    if (!isValidEnvelope(envelope)) envelope = emptyEnvelope();

    // Append to per-conv log; lazy-init log if first message
    var log = envelope.byConv[convId];
    if (!log) {
      log = { v: 1, messages: [], lastWriteAt: Date.now(), createdAt: Date.now() };
      envelope.byConv[convId] = log;
    }
    for (var i = 0; i < batchedMessages.length; i++) {
      log.messages.push(batchedMessages[i]);
    }
    log.lastWriteAt = Date.now();

    // LRU + cap enforcement
    _touchLru(envelope, convId);
    _enforceLruCap(envelope, DEFAULT_CAP);

    // Persist
    var payload = {};
    payload[STORAGE_KEY] = envelope;
    await chrome.storage.local.set(payload);
  } catch (_e) {
    // Best-effort: storage failures degrade silently (DOM already rendered)
    // Resurrect the batched messages so the next flush retries:
    if (pending && batchedMessages.length > 0) {
      pending.messages = batchedMessages.concat(pending.messages);
    }
  }
}

async function flushAll() {
  // Called on sidepanel beforeunload / page close for D-03 defense-in-depth
  var convIds = Array.from(_pendingWrites.keys());
  for (var i = 0; i < convIds.length; i++) {
    var pending = _pendingWrites.get(convIds[i]);
    if (pending && pending.timer) clearTimeout(pending.timer);
    await _flushConv(convIds[i]);
  }
}
```

### LRU algorithm (Phase 11 algorithm port)

Identical shape to `sidepanel-tab-conv-store.js:_enforceLruCap` -- ports the function verbatim with key naming changes:
- `envelope.lru` array: head = most-recently-written conv, tail = next-to-evict
- `_touchLru(envelope, convId)`: removes convId from any current position then unshifts to head
- `_enforceLruCap(envelope, cap = 50)`: while `lru.length > cap`, pop tail key and `delete envelope.byConv[key]`. Also reaps orphan byConv entries not in lru (defense vs envelope corruption).

### Migration / collision avoidance with legacy fsbSessionLogs

**Storage key uniqueness verified:** `fsbConversationMessages` does NOT exist in any FSB file pre-Phase-12. The legacy `fsbSessionLogs` key remains untouched (Tier-2 fallback per D-06 + b8b761e8 body preserved verbatim).

**No data migration:** D-26 explicitly defers pre-Phase-12 fsbSessionLogs conversation migration. Pre-existing conversations:
- New conversations (post-Phase-12): write to new store. Tier 1 hydrate finds them, renders 1:1.
- Pre-existing conversations (pre-Phase-12): Tier 1 returns empty; Tier 2 falls back to existing b8b761e8 body which queries fsbSessionLogs by conversationId. Renders the same way Phase 11 + Bug 2 fix does today.
- Mixed conversations (continuing a pre-Phase-12 conversation post-Phase-12): TIER 1 ALWAYS WINS per D-06. The fsbSessionLogs entries are SHADOWED for this convId once new entries land. This is acceptable per D-26 fresh-only ship. The risk is a one-time UX loss of pre-Phase-12 prelude messages, mitigated by Tier 2 catching purely-pre-Phase-12 convIds.

**Conflict prevention:** Tier 1's `getConversationMessages` returns empty array if no entry for convId in byConv. Tier 2 fires only on Tier 1 empty. Tier 3 (empty render + welcome) fires only on both above failing. No double-rendering possible -- the three tiers are short-circuit-mutually-exclusive.

## Section 5: Hydrate Path Repoint Concrete Details

### Sketch of 3-tier fallback (replaces b8b761e8 body)

```js
async function hydrateChatFromConversationId(convId) {
  // Guard: invalid input
  if (!convId || typeof convId !== 'string') return 0;
  if (!chatMessages) return 0;

  // ============================================================
  // Tier 1: new fsbConversationMessages store (Phase 12)
  // ============================================================
  try {
    if (typeof FSBSidepanelMessageLog !== 'undefined'
        && typeof FSBSidepanelMessageLog.getConversationMessages === 'function') {
      var messages = await FSBSidepanelMessageLog.getConversationMessages(
        convId,
        function (keys) { return chrome.storage.local.get(keys); }
      );
      if (Array.isArray(messages) && messages.length > 0) {
        chatMessages.innerHTML = '';
        for (var i = 0; i < messages.length; i++) {
          var m = messages[i];
          // Render preserves role + kind tags per D-07
          renderPersistedMessage(m.content, m.role, m.kind);
        }
        // Update legacy thread-state markers so b8b761e8 scaffolding stays consistent
        activeConversationId = convId;
        return messages.length;
      }
    }
  } catch (_e) { /* fall through to Tier 2 */ }

  // ============================================================
  // Tier 2: legacy fsbSessionLogs (pre-Phase-12 conversations)
  // The b8b761e8 body is preserved here VERBATIM
  // ============================================================
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const sessionIndex = stored.fsbSessionIndex || [];
    if (!Array.isArray(sessionIndex) || sessionIndex.length === 0) return 0;

    var matching = [];
    for (var i = 0; i < sessionIndex.length; i++) {
      var entry = sessionIndex[i];
      if (entry && entry.conversationId === convId) {
        var detail = (entry.id && sessionStorage[entry.id]) ? sessionStorage[entry.id] : entry;
        matching.push(detail);
      }
    }
    if (matching.length === 0) return 0;

    matching.sort(function(a, b) {
      var aTime = a?.startTime || 0;
      var bTime = b?.startTime || 0;
      return aTime - bTime;
    });

    chatMessages.innerHTML = '';

    for (var s = 0; s < matching.length; s++) {
      var session = matching[s] || {};
      var commands = Array.isArray(session.commands) ? session.commands : [];
      if (commands.length === 0 && session.lastTask) commands = [session.lastTask];

      for (var c = 0; c < commands.length; c++) {
        var cmd = commands[c];
        if (typeof cmd === 'string' && cmd.trim().length > 0) {
          addMessage(cmd, 'user');
        }
      }

      var completion = session.completionMessage || session.result || '';
      if (typeof completion === 'string' && completion.trim().length > 0) {
        var outcomeStr = typeof session.outcome === 'string' ? session.outcome.toLowerCase() : '';
        var isPartial = outcomeStr === 'partial';
        var isError = outcomeStr === 'failure' || (session.error && !completion);
        if (isError) {
          addMessage(completion, 'error');
        } else {
          addCompletionMessage(completion, 'ai', isPartial);
        }
      } else if (session.error && typeof session.error === 'string' && session.error.trim().length > 0) {
        addMessage(session.error, 'error');
      }
    }

    var latest = matching[matching.length - 1];
    if (latest && latest.id) {
      lastRenderedTerminalSessionId = latest.id;
      historySessionId = latest.historySessionId || latest.id;
    }
    activeConversationId = convId;

    return matching.length;
  } catch (_e) {
    // ============================================================
    // Tier 3: empty (caller fires welcome message)
    // ============================================================
    return 0;
  }
}
```

### addMessage chokepoint code path

**Function name:** `addMessage`
**Location:** `extension/ui/sidepanel.js:1469-1523`
**Current signature:** `function addMessage(text, type = 'system')`
**Phase 12 signature:** `function addMessage(text, type = 'system', kind)` (backward compatible -- default `kind` is derived from `type` if absent)

**Existing call sites (60+ verified via grep):** every existing call works unchanged. The new optional 3rd parameter is consumed only by the message-log persistence hook; the DOM render path is byte-frozen.

**The chokepoint property:** every visible message in the sidepanel chat (welcome message, user prompts, AI completions, error bubbles, action messages, status messages) flows through `addMessage` OR `addCompletionMessage` (sidepanel.js:1405-1442) OR `addActionMessage` (sidepanel.js:1284-1304). Phase 12 D-10 + D-12 requires the persistence write to happen at the unified entry point.

**Recommendation:** add a private internal helper `_persistMessage(role, content, kind)` invoked from inside addMessage + addCompletionMessage + addActionMessage. The 3 helpers are the only chokepoints; centralizing the persistence call inside them captures all renders.

```js
function _persistMessage(role, content, kind) {
  if (typeof FSBSidepanelMessageLog === 'undefined') return;
  if (!conversationId) return;       // lazy mint guard (D-17 from Phase 11)
  if (!content) return;
  try {
    FSBSidepanelMessageLog.appendMessage(conversationId, {
      role: role,
      content: content,
      timestamp: Date.now(),
      kind: kind || 'text'
    });
  } catch (_e) { /* swallow -- never block UI render on storage */ }
}
```

Call from inside addMessage (after DOM render), addCompletionMessage (after DOM render), addActionMessage (after DOM render).

## Section 6: Live Progress Wiring AUDIT -- Primary Research Output

This is the most critical section of the research. The user's UAT report "I see no progress" is the trigger. The audit traces the full 4-hop message flow and identifies the specific gap.

### 6.1 The 4-hop trace

```
HOP 1: agent-loop.js EMITS via chrome.runtime.sendMessage(...) / state-emitter.emit(...)
   |
   v
HOP 2: background.js RELAYS via fsbBroadcastAutomationLifecycle / direct chrome.runtime.sendMessage
   |
   v
HOP 3: sidepanel.js chrome.runtime.onMessage.addListener RECEIVES (sidepanel.js:1794-1971)
   |
   v
HOP 4: sidepanel.js DOM render via updateStatusMessage / addMessage / addActionMessage / completeStatusMessage
```

### 6.2 Per-hop existence + event type catalog

#### HOP 1 -- agent-loop.js emission inventory

| Event source | Code path | Verified? | Event types emitted |
|--------------|-----------|-----------|---------------------|
| `runAgentIteration` terminal path | `fsbBroadcastAutomationLifecycle` at agent-loop.js:1431, 1549, 1591 | YES | `automationComplete`, `automationError` |
| `runAgentIteration` mid-iteration | direct chrome.runtime.sendMessage at agent-loop.js (verified via grep "statusUpdate" -- agent-loop.js does NOT directly send statusUpdate; background.js does) | n/a | -- |
| state-emitter calls (FINT-12 + FINT-10/11 carry from Phase 8) | `stateEmitter.emit(STATE_EVENTS.ITERATION_COMPLETE, ...)` etc. fires sessionStateEvent via state-emitter.js:120-132 | YES | `sessionStateEvent` with eventType `iteration_complete`, `tool_executed`, `session_ended`, `error_occurred`, `status_changed`, `session_started`, `cost_updated` |

**HOP 1 verdict: EXISTS. Events fire. The autopilot DOES emit progress signals.**

#### HOP 2 -- background.js relay inventory

| Event source | Code path | Verified? | Event types emitted |
|--------------|-----------|-----------|---------------------|
| Connection / readiness | `chrome.runtime.sendMessage({action: 'statusUpdate', sessionId, message: 'Connecting to page...'})` at background.js:6743-6749, 6800-6806 | YES | `statusUpdate` |
| Per-action progress | `chrome.runtime.sendMessage({action: 'statusUpdate', sessionId, message: getActionStatus(action.tool, action.params), iteration, maxIterations, progressPercent, estimatedTimeRemaining})` at background.js:10524-10534, 9965-9974 | YES | `statusUpdate` (with progress data) |
| Auth signing-in step | same as above at background.js:9966 | YES | `statusUpdate` |
| Terminal | `fsbBroadcastAutomationLifecycle({action: 'automationComplete'|'automationError', sessionId, ...})` at background.js:2082-2106, used at lines 3485, 3494, 6786, 7085, 9355, 9390, 9524, 10377, 11009, 11047, 11090, 11138, 11179 | YES | `automationComplete`, `automationError` |
| Replay status | `chrome.runtime.sendMessage({action: 'statusUpdate', sessionId, message, iteration, maxIterations, progressPercent, replayStep, isReplay: true})` at background.js:3411-3420 | YES | `statusUpdate` (replay variant) |
| state-emitter sessionStateEvent | broadcast via `chrome.runtime.sendMessage({action: 'sessionStateEvent', eventType, ...data})` from state-emitter.js:120-132 (the emitter is owned by background.js; runs in SW context) | YES | `sessionStateEvent` |

**HOP 2 verdict: EXISTS. All event broadcasts are wired.**

#### HOP 3 -- sidepanel.js inbound listener inventory

Verified at `extension/ui/sidepanel.js:1794-1971`. The listener handles exactly the following actions:

| Action | Sub-case | Renders via | Verified line |
|--------|----------|-------------|---------------|
| `automationComplete` | success | `completeStatusMessage(completionMessage, 'partial')` OR `addCompletionMessage(completionMessage, 'ai', isPartial)` | 1803-1807 |
| `automationComplete` | partial (recon suggestion) | `chatMessages.appendChild(reconDiv)` | 1829-1846 |
| `statusUpdate` | iteration progress | `updateStatusMessage(request.message, {iteration, maxIterations, progressPercent})` + previous status snapshotted as `addActionMessage(prevText)` | 1867-1873 |
| `automationError` | terminal | `completeStatusMessage(...)` + addMessage tips + retry button | 1880-1923 |
| `loginDetected` | mid-task | `updateStatusMessage('Login page detected...')` + `showLoginPrompt(...)` | 1928-1934 |
| `paymentFillConfirmation` | mid-task | `showPaymentFillConfirmation(request)` | 1938 |
| `sessionStateEvent` -> `iteration_complete` | per-iteration | `updateStatusMessage('Step ' + iteration + ' complete', ...)` -- ONLY if `currentStatusMessage && isRunning` | 1944-1952 |
| `sessionStateEvent` -> `session_ended` | terminal | `setIdleState()` + `loadHistoryList()` (gated by isHistoryViewActive) | 1953-1959 |
| `sessionStateEvent` -> `tool_executed` | per-tool | `addActionMessage(request.toolName + (success ? '' : ' [failed]'))` -- **GATED by `showSidepanelProgressEnabled && isRunning`** | 1960-1964 |
| `sessionStateEvent` -> `error_occurred` | mid-task error | `console.warn(...)` only -- NOT rendered in chat | 1965-1967 |

**HOP 3 verdict: PARTIALLY EXISTS.** The listener exists. It handles all 6 action types the autopilot emits. But three specific gaps surface:

#### HOP 4 -- DOM render inventory

| Render function | Source | What it produces |
|-----------------|--------|------------------|
| `addMessage(text, type)` | sidepanel.js:1469-1523 | Persistent chat bubble (Phase 12 D-10 write-through chokepoint) |
| `addCompletionMessage(text, type, isPartial)` | sidepanel.js:1405-1442 | AI completion bubble with markdown render |
| `addActionMessage(text)` | sidepanel.js:1284-1304 | **GATED by `showSidepanelProgressEnabled`.** Collapsed action-summary list inside currentStatusMessage. **Early-returns if setting off.** |
| `addStatusMessage(text, type)` | sidepanel.js:1307-1364 | Typing-dots status indicator with optional progress bar (progress bar gated by `showSidepanelProgressEnabled`) |
| `updateStatusMessage(text, progressData)` | sidepanel.js:1367-1384 | Mutates currentStatusMessage DOM in-place |
| `completeStatusMessage(text, type)` | sidepanel.js:1387-1402 | Removes typing-dots, renders final bubble |

**HOP 4 verdict: EXISTS. The DOM render path is fully wired.**

### 6.3 The gap

**The gap is NOT in the message channel.** All four hops work. The user's "I see no progress" UX report decomposes into THREE distinct issues:

**Gap A -- per-tool progress is settings-gated (PRIMARY).**

`extension/ui/sidepanel.js:17` declares `let showSidepanelProgressEnabled = false;` and `sidepanel.js:787-791` reads `chrome.storage.local.get(['showSidepanelProgress'])` on boot. The setting defaults to `false` (per `extension/ui/options.js:24 showSidepanelProgress: false`).

Two render paths are gated:
- `addActionMessage(text)` at sidepanel.js:1284-1285: `if (!showSidepanelProgressEnabled) return;` -- early-return when off.
- `case 'tool_executed':` at sidepanel.js:1960-1964: `if (showSidepanelProgressEnabled && isRunning) { addActionMessage(...) }` -- conditional render.

**Result: with default settings, the user sees NO per-tool progress messages.** The typing-dots indicator at the bottom of the chat updates via `statusUpdate` (because that path is unconditional in updateStatusMessage), but visually the dots are subtle and per-tool actions are invisible.

**Smallest fix candidates (planner picks):**

1. **Flip the default to `true`** in options.js:24 + the boot read default in sidepanel.js:790 (`?? false` -> `?? true`). One-line behavioral change; preserves the existing user-controllable toggle for users who want to silence the chatter.
2. **Unconditional render** of per-tool progress as `kind: 'tool'` messages per D-12. This contradicts the existing settings toggle but matches Phase 12 D-10 intent ("every progress message persists"). Recommendation if planner picks (2): preserve `showSidepanelProgressEnabled` as a render-style toggle (e.g., collapsed-action-summary vs full-bubble) rather than a visibility toggle.
3. **Hybrid:** flip the default to `true` AND make the toggle a render-style switch.

This research RECOMMENDS option 1 (flip the default to `true`). Lowest-risk, minimal LOC, preserves user control. The user's UAT report "I see no progress" maps directly to "the setting they didn't know existed defaulted off."

**Gap B -- statusUpdate progress is subtle (SECONDARY).**

The `updateStatusMessage` path at sidepanel.js:1367 mutates the typing-dots indicator in place. The user CAN see progress here (the message + progress bar + percentage label update), but the visual is a single replacing line at the bottom of the chat rather than a scrolling log of progress events. Some users perceive this as "no progress" because they expect chat-style cumulative messages.

**Smallest fix candidates (planner picks):**

1. **Keep statusUpdate as the live indicator AND emit a snapshot to addMessage when the indicator updates** (the existing snapshot path at sidepanel.js:1864-1868 calls `addActionMessage(prevText)` which IS gated by `showSidepanelProgressEnabled` -- so once Gap A is fixed via option 1, Gap B resolves naturally).

**Recommendation: Gap A fix subsumes Gap B fix.**

**Gap C -- assistant text-content streaming is OUT OF SCOPE (per D-11).**

The autopilot's actual model output (the "I am navigating to X. I am clicking Y. I have entered Z.") is NOT emitted as a separate progress event -- the full text lands ONLY in the terminal `automationComplete` payload as `result` / `completionMessage`. Per D-11, token-level streaming is deferred to v0.11.0+. Phase 12 does NOT close this. The user's UAT may have intended this as "I see no progress" -- in that case the user needs to know discrete tool actions + iteration milestones ARE the in-scope progress, and that's what Phase 12 ships.

### 6.4 Recommended smallest fix

**For FINT-22 (Surface 1):** Land Plan 12-03 as a 3-task plan:

1. **Settings default flip + persistence write-through.** Change `showSidepanelProgress` default from `false` to `true` in options.js:24, sidepanel.js:17, and sidepanel.js:790. Boot reads default with `?? true` instead of `?? false`. Users who had the setting explicitly set retain their preference; users who never touched it now see progress.

2. **Add `kind: 'tool'` and `kind: 'progress'` calls in the sidepanel inbound listener.** For each progress event type, ALSO call `addMessage(content, 'assistant', kind)` to fire the Phase 12 D-10 persistence write-through. The DOM-side render styling (collapsed action summary vs full bubble) stays governed by `showSidepanelProgressEnabled` if option 1 isn't preferred; the persistence write fires unconditionally.

3. **Verify end-to-end test.** Smoke Part covers: simulate a `sessionStateEvent` with `eventType: 'tool_executed'` arriving at the listener; assert a new persisted message with `kind: 'tool'` lands in the message log mock; assert the DOM addMessage call records the right content. >= 6 PASS.

## Section 7: chrome.sidePanel API Constraints

**Verified against official Chrome docs at https://developer.chrome.com/docs/extensions/reference/api/sidePanel + community sources** (see Sources section). FSB's existing usage at background.js:12979 (`chrome.sidePanel.open({windowId})`) and background.js:13229 (`chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})`) is a working production-side reference.

### 7.1 `chrome.sidePanel.open({tabId})` -- user-gesture required (TRUE; verified)

> sidePanel.open() may only be called inside a user gesture, which is the single most common gotcha. open() has to be called inside a user gesture, so you cannot fire it from a setTimeout or after an awaited fetch.

**Production-side practical recipe** (verified against community Chromium issues):

```js
// CORRECT: synchronous click handler -> message bus -> SW handler -> sidePanel.open
// Step 1 (sidepanel.js): button click -> chrome.runtime.sendMessage()
sendBtn.addEventListener('click', function () {
  chrome.runtime.sendMessage({action: 'startAutomation', task, tabId}, function (response) {
    // ... response handler ...
  });
});

// Step 2 (background.js): SW handler picks up the message
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'startAutomation') {
    // Phase 12 FINT-24: synchronous-as-possible inside the gesture window
    chrome.sidePanel.setOptions({tabId: request.tabId, enabled: true, path: 'ui/sidepanel.html'})
      .then(function () {
        return chrome.sidePanel.open({tabId: request.tabId});
      })
      .then(function () {
        // ... proceed with autopilot bind ...
      })
      .catch(function (err) {
        console.warn('[FSB] sidePanel auto-open failed', err);
        // Best-effort: failure does NOT abort the automation
      });
  }
});
```

**Risk:** The gesture context "decays" through long await chains. If the SW handler `await`s any provider API call BEFORE calling `chrome.sidePanel.open`, the gesture context may be lost. Recommendation: call `setOptions` + `open` as the FIRST awaits inside the startAutomation handler, before any other async work.

### 7.2 `chrome.sidePanel.close()` -- user-gesture required (Chrome 141+; PARTIALLY verified)

Per official docs (Chrome 141+):
> A close() method exists. It closes the extension's side panel and accepts a CloseOptions parameter specifying either tabId or windowId.

Documentation does NOT explicitly state whether close() requires user gesture, but by analogy with open() and per community discussion at the w3c/webextensions GitHub issue #521 (referenced in Sources), close() is expected to inherit the same constraint.

**D-14 decision is correct:** Phase 12 does NOT call `chrome.sidePanel.close()`. On tab switch to non-automation tab, the panel STAYS OPEN and swaps view (the chrome.tabs.onActivated handler in sidepanel.js fires; refreshOwnerChip + swapToTabConversation swap the view).

### 7.3 `chrome.sidePanel.setOptions({tabId, enabled, path})` -- NO gesture required (verified)

Per official docs:
> setOptions() and setPanelBehavior() have no documented user gesture requirement and can be called programmatically.

**This is the leverage point for per-tab binding:** `setOptions({tabId: X, enabled: true, path: 'ui/sidepanel.html'})` can be called for multiple tabs (e.g., when 2+ autopilots run in parallel). The panel auto-shows for the active tab when it has setOptions registered.

### 7.4 Multi-tab `setOptions` interaction

Per official docs:
> When a user temporarily switches to a tab where the side panel is not enabled, the side panel will be hidden.

**Behavior:** Calling `setOptions({tabId: tabA, enabled: true})` then later `setOptions({tabId: tabB, enabled: true})` registers BOTH tabs as panel-enabled. Switching between them keeps the panel open + visible (Chrome treats the panel as the same document instance per current MV3 implementation). Switching to a tab WITHOUT setOptions inherits the manifest default (`side_panel.default_path: 'ui/sidepanel.html'` per manifest line 39-41), which is ALSO enabled globally. So the FSB sidepanel stays mounted across all tab switches today (this is why "open on tab A, switch to tab B" doesn't auto-close the panel even pre-Phase-12).

### 7.5 Sidepanel surface preservation across `setOptions(enabled: false)`

Documentation does NOT explicitly state whether `setOptions({enabled: false})` automatically closes an open panel. Conservative interpretation: disabling does NOT close immediately. Per D-14 we never disable any tab post-bind, so this is moot for Phase 12.

### 7.6 Recommended call sequence for D-13 auto-open on Run

```js
// Inside background.js startAutomation handler, AS FIRST AWAIT before bind logic:
async function handleStartAutomation(request, sender, sendResponse) {
  // 1. Capture targetTabId from request (verified existing param)
  var targetTabId = request.tabId;

  // 2. Configure per-tab sidepanel + open (Phase 12 FINT-24)
  //    This MUST happen synchronously inside the gesture window.
  try {
    await chrome.sidePanel.setOptions({
      tabId: targetTabId,
      enabled: true,
      path: 'ui/sidepanel.html'
    });
    await chrome.sidePanel.open({ tabId: targetTabId });
  } catch (sidePanelErr) {
    // Best-effort: failure does NOT abort automation.
    console.warn('[FSB] Phase 12 FINT-24 sidePanel auto-open failed', {
      tabId: targetTabId, error: sidePanelErr && sidePanelErr.message
    });
  }

  // 3. Proceed with existing autopilot bind logic (ensureContentScriptInjected etc.)
  // ... existing handler body unchanged ...
}
```

## Section 8: Edge Cases the Planner Must Defend Against

### EC-01 -- SW eviction mid-debounce

**Scenario:** sidepanel page has `addMessage` calls in flight; the 200ms debounce timer is pending; Chrome MV3 evicts the SW background. Does the timer fire?

**Verdict: SAFE.** The 200ms `setTimeout` lives in the **sidepanel page document**, not the SW. The sidepanel page is a regular DOM document under the side panel surface; its setTimeout runs in the page's own event loop. SW eviction does NOT affect the sidepanel page's timer. The timer fires on schedule, chrome.storage.local.set succeeds (storage is SW-independent), the persistence completes.

**Defense:** Ship the `flushAll()` on `beforeunload` per D-03 to catch the sidepanel-page-close case (separate from SW eviction).

### EC-02 -- chrome.storage.local quota approaching limit

**Scenario:** A user runs FSB extensively, accumulating dozens of long conversations.

**Verdict: HANDLED by D-04 LRU cap.** Hard cap = 50 conversations. Worst case 50 conversations * ~5MB/conv would be 250MB, but typical conversation message logs are ~50KB each (text only; D-11 defers token streaming). LRU eviction kicks in on every write; older conversations age out.

**Plus:** Manifest declares `unlimitedStorage` permission (verified line 11) which exempts chrome.storage.local from the 10MB default quota anyway.

**Defense:** D-04 enforceLruCap is the primary defense; quota error handling is best-effort (storage failures degrade silently per D-03).

### EC-03 -- Pre-existing AND new messages for same convId

**Scenario:** A conversation has pre-Phase-12 fsbSessionLogs entries AND new Phase-12 fsbConversationMessages entries.

**Verdict: Tier 1 always wins per D-06; no double-render.** The 3-tier fallback in `hydrateChatFromConversationId` is short-circuit-mutually-exclusive: if Tier 1 returns count > 0, Tier 2 never runs. So the user sees only the new message log entries, NOT the pre-existing fsbSessionLogs prelude.

**UX risk:** First-time post-Phase-12 use of a pre-Phase-12 conversation may LOSE the pre-Phase-12 prelude messages once any new addMessage call fires (because that new call creates the Tier 1 entry and shadows Tier 2). Acceptable per D-26 fresh-only ship.

**Defense:** None required. The behavior is the documented contract.

### EC-04 -- User opens sidepanel from chrome:// settings sidebar (no per-tab context)

**Scenario:** User opens chrome://extensions/?id=fsbId, then clicks "Sidepanel" link or opens chrome's side panel via global toggle.

**Verdict: FALLS BACK GRACEFULLY.** sidepanel.js `initTabConversationStore` (sidepanel.js:114-155) catches the no-active-tab case at line 145 -- `conversationId = null`. The hydrate path returns 0 because no convId is bound. The welcome message renders. The user can chat normally; the lazy-mint path in handleSendMessage triggers a fresh convId.

**Defense:** Existing Phase 11 fallback handles this. Phase 12 does not regress.

### EC-05 -- chrome.tabs.onRemoved fires while debounce timer is pending

**Scenario:** User closes tab A while a 200ms debounce timer is pending for that tab's conversation.

**Verdict: NEEDS DEFENSE.** Per D-24, `chrome.tabs.onRemoved` drops BOTH the envelope entry AND the message log entry. But if a debounce timer is pending, the next flush could resurrect the just-dropped entry.

**Defense:** The `dropConversation(convId)` helper in the sidecar must:
1. Clear any pending debounce timer for that convId.
2. Drop the in-memory pending buffer.
3. Read envelope, delete byConv[convId], remove from lru, persist.

**Smoke coverage:** A Part exercises drop-while-debounce-pending and asserts the entry is gone after the would-have-fired timer window.

### EC-06 -- Multiple autopilots on multiple tabs simultaneously

**Scenario:** User runs autopilot on Tab A and Tab B in parallel.

**Verdict: HANDLED via per-tab envelope from Phase 11.** Each tab has its own conversationId in `fsbSidepanelTabConversations.byTab[tabId]`. Each conversationId has its own log entry in `fsbConversationMessages.byConv[convId]`. The autopilot inbound listener already routes by `currentSessionId`, which is per-tab. No cross-talk possible at the persistence layer.

**Defense:** None required. The architecture handles it.

### EC-07 -- User explicit close while autopilot is running

**Scenario:** User clicks the X on the sidepanel while autopilot is in flight.

**Verdict: HANDLED per D-17.** No auto-reopen. The user's intent is respected; subsequent tab switches do NOT force the panel open. The next time the user clicks the FSB action icon OR triggers Run from popup, the panel will open again.

**Defense:** None required at the code level. D-17 is the policy decision.

### EC-08 -- chrome.runtime.sendMessage from sidepanel to SW fails (SW evicted)

**Scenario:** The sidepanel sends statusUpdate but the SW has just been evicted.

**Verdict: HANDLED via catch.** sidepanel.js catches `chrome.runtime.sendMessage` rejection via `.catch(...)` swallowing the error. The next event re-tries. No persistence corruption.

**Defense:** Existing pattern; no Phase 12 changes required.

## Section 9: Validation Architecture (Nyquist Dimension 8)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vanilla `node tests/<smoke>.test.js` (CLAUDE.md "real-runtime tests, not static-text" pattern; mirrors Phase 11) |
| Config file | none -- each smoke is self-contained; chrome.* mocks installed at file top |
| Quick run command | `node tests/sidepanel-message-log-smoke.test.js` |
| Full suite command | `npm test` (the &&-chain runs all Phase 1-11 smokes plus the new Phase 12 smoke) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|-------------|
| FINT-22 | sessionStateEvent `tool_executed` -> addMessage('assistant', `${toolName}`, 'tool') -> persisted | unit | `node tests/sidepanel-message-log-smoke.test.js` (Part 4) | NEW (Wave 0) |
| FINT-22 | statusUpdate -> updateStatusMessage + per-iteration addMessage write-through | unit | same smoke (Part 4) | NEW (Wave 0) |
| FINT-22 | showSidepanelProgress default flip verification (sidepanel.js + options.js) | unit | same smoke (Part 4) | NEW (Wave 0) |
| FINT-23 | Sidecar appendMessage debouncer fires within 200ms; flushes to storage | unit | same smoke (Part 1) | NEW (Wave 0) |
| FINT-23 | Sidecar LRU cap=50 evicts smallest-lastWriteAt entry on 51st insert | unit | same smoke (Part 1) | NEW (Wave 0) |
| FINT-23 | hydrateChatFromConversationId Tier 1 returns >0 -> Tier 2 skipped | unit | same smoke (Part 2) | NEW (Wave 0) |
| FINT-23 | hydrateChatFromConversationId Tier 1 empty -> Tier 2 fires (b8b761e8 body) | unit | same smoke (Part 2) | NEW (Wave 0) |
| FINT-23 | hydrate signature unchanged (function name + arity verified by direct call) | unit | same smoke (Part 2) | NEW (Wave 0) |
| FINT-23 | Zero collision with `fsbSessionLogs` / `fsbSessionIndex` keys (assert distinct after write) | unit | same smoke (Part 1) | NEW (Wave 0) |
| FINT-23 | addMessage write-through hooks all 3 chokepoints (addMessage + addCompletionMessage + addActionMessage) | unit | same smoke (Part 3) | NEW (Wave 0) |
| FINT-24 | background.js startAutomation handler calls chrome.sidePanel.setOptions + open with targetTabId | unit | same smoke (Part 5) | NEW (Wave 0) |
| FINT-24 | sidePanel API call failure is best-effort (does NOT abort automation) | unit | same smoke (Part 5) | NEW (Wave 0) |
| INV-04 byte-freeze | grep count = 8 + iterator pattern = 4 + Phase 12 token NEVER inside setTimeout lambda | regression | same smoke (Part 6) | NEW (Wave 0) |
| INV-06 byte-freeze | LATTICE-PIN.md current_lattice_sha literal = `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | regression | same smoke (Part 6) | NEW (Wave 0) |

### Sampling Rate

- **Per task commit:** `node tests/sidepanel-message-log-smoke.test.js` -- 1-2 second runtime; per CLAUDE.md "real runtime tests".
- **Per wave merge:** `npm test` -- the full &&-chain validates Phase 1-11 carryforward.
- **Phase gate:** Full `npm test` green before `/gsd-verify-work` invocation.

### Wave 0 Gaps

- [ ] `tests/sidepanel-message-log-smoke.test.js` -- covers all FINT-22/23/24 plus INV-04/06 byte-freeze. Mirrors Phase 11 `tests/sidepanel-tab-aware-smoke.test.js` shape (chrome.* mocks at top + 6+ Parts). Wave 0 ships with PASS-when-empty placeholders for Parts 1-6.
- [ ] `extension/ui/sidepanel-message-log.js` sidecar -- envelope CRUD + 200ms debouncer + LRU helpers + dual-export IIFE. Wave 0 ships the module skeleton with all exports stubbed.
- [ ] Smoke chrome.* mock layer additions (vs. Phase 11): `chrome.sidePanel.setOptions`, `chrome.sidePanel.open`, `chrome.storage.local` (Phase 11 mocked .session; Phase 12 also needs .local), `setTimeout` mock for the 200ms debouncer test (or use vitest-fake-timers analog with vanilla Date.now polling).
- [ ] Phase 11 smoke file at `tests/sidepanel-tab-aware-smoke.test.js` BYTE-FROZEN through Phase 12 (no edits; the new Phase 12 smoke is a sibling).

## Section 10: Pitfalls (Anti-Patterns from Prior FSB UI Work)

### Pitfall 1 -- Treating fsbSessionLogs as message log

**Origin:** Bug 2 partial fix (commit `b8b761e8`). The hydrate scaffold reads from `fsbSessionLogs` which is session METADATA (commands + final outcome), not chat MESSAGES (progress + assistant + tool intermediate messages). Result: hydrate "works" in tests but the user sees a 2-line transcript on reopen (the original user message + the final completion bubble) instead of the actual chat scrollback.

**Phase 12 mitigation:** D-05 + D-06 explicitly carve out the new `fsbConversationMessages` store as Tier 1 ground truth. Tier 2 fallback to fsbSessionLogs is preserved for pre-Phase-12 conversations only (gracefully degrades to metadata-render).

### Pitfall 2 -- chrome.runtime.sendMessage from sidepanel to SW consumes the gesture context

**Origin:** Community Chromium issues + GoogleChrome/chrome-extensions-samples issue #1001. If the SW's `chrome.runtime.onMessage` handler does any awaits before calling `chrome.sidePanel.open`, the gesture context decays and `open()` throws.

**Phase 12 mitigation:** Section 7.6 recipe -- call `setOptions` + `open` as the FIRST awaits in the startAutomation handler, before any provider API or content-script-readiness await.

### Pitfall 3 -- addMessage write-through inflicting double-render on hydrate

**Risk:** If the hydrate path calls `addMessage` (which the b8b761e8 body does), each replayed message would write back to the message log, doubling entries on every reopen.

**Phase 12 mitigation:** Recommend the planner adds a hydrating flag (`var _isHydrating = true` set before render loop, cleared after) consumed by `_persistMessage` to short-circuit. Alternative: introduce a separate `renderPersistedMessage(content, role, kind)` that bypasses addMessage's persistence hook and only renders DOM. The smoke must cover this case.

### Pitfall 4 -- chrome.sidePanel.open silent failure on per-tab API on global setPanelBehavior

**Origin:** FSB currently calls `chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true})` (background.js:13229) which is global, not per-tab. Mixing this with `setOptions({tabId, enabled})` is documented as compatible, but the per-tab `enabled: true` is ADDITIVE -- it does not unset the global default. Result: panel is enabled on ALL tabs (global default) AND additionally explicitly enabled on the autopilot tab.

**Phase 12 mitigation:** This is the desired behavior (sidepanel stays available everywhere; auto-opens specifically when bound). No change needed. Document in the plan that the `enabled: true` per-tab call is for the AUTO-OPEN trigger, not for limiting visibility.

### Pitfall 5 -- Sidepanel page lifecycle vs SW lifecycle confusion

**Origin:** Existing FSB code has helpers like `livenessInterval` (sidepanel.js:14) and `checkSessionLiveness` (sidepanel.js:1172) that explicitly defend against SW eviction. The sidepanel PAGE is a separate document; its closure is detected differently than SW eviction.

**Phase 12 mitigation:** D-03 forced flush on `beforeunload` handles the sidepanel page close. SW eviction does NOT trigger sidepanel beforeunload. The 200ms debouncer in the page survives SW eviction (the page event loop is independent). Edge case EC-01 verified safe.

## Section 11: Recommended Plan Breakdown

### Wave order is sequential due to shared sidepanel.js editing region

`sidepanel.js` gets edits across Waves 1+2+3 (hydrate repoint + addMessage hook + listener routing). Parallelizing risks merge conflict cascades. Recommend strict-sequential per wave.

### Plan inventory

**Plan 12-00 (Wave 0) -- Sidecar scaffold + smoke harness**

- Create `extension/ui/sidepanel-message-log.js` sidecar with all exports stubbed (emptyEnvelope, isValidEnvelope, appendMessage, getConversationMessages, dropConversation, flush, flushAll, _touchLru, _enforceLruCap). Dual-export IIFE pattern matches Phase 11.
- Create `tests/sidepanel-message-log-smoke.test.js` with chrome.runtime + chrome.tabs + chrome.storage.local + chrome.storage.session + chrome.sidePanel mocks. Parts 1-6 PASS-when-empty placeholders. Target floor: 6 PASS / 0 FAIL.
- Append new smoke to `package.json` scripts.test &&-chain (FINAL entry after `sidepanel-tab-aware-smoke.test.js`).
- Update `extension/ui/sidepanel.html` script-tag chain: insert `<script src="sidepanel-message-log.js"></script>` immediately AFTER `sidepanel-tab-conv-store.js` (line 127) and BEFORE `sidepanel.js` (line 129).
- INV-04 + INV-06 byte-freeze regressions baselined.

Closes: nothing (scaffold only).

**Plan 12-01 (Wave 1) -- Hydrate repoint (FINT-23 partial)**

- Implement sidecar exports: `getConversationMessages(convId, storageReadFn)` -- reads `fsbConversationMessages` key, filters by convId, returns messages array sorted by timestamp.
- Refactor `hydrateChatFromConversationId(convId)` at sidepanel.js:285-360 to 3-tier per Section 5 sketch. Function name + signature UNCHANGED.
- Add `renderPersistedMessage(content, role, kind)` helper alongside addMessage -- bypasses the new write-through hook to avoid double-render (Pitfall 3).
- Smoke Parts 1+2 filled at >= 8 PASS.

Closes: FINT-23 partial (hydrate Tier 1 wired).

**Plan 12-02 (Wave 2) -- addMessage write-through wiring (FINT-23 partial)**

- Implement sidecar `appendMessage(convId, msg)` -- in-memory buffer + 200ms debounce trigger.
- Implement sidecar `_flushConv(convId)` -- envelope read + append + LRU + persist.
- Implement sidecar `flushAll()` -- forced flush for beforeunload.
- Add private `_persistMessage(role, content, kind)` helper to sidepanel.js.
- Wire `_persistMessage` calls in addMessage (1469-1523) + addCompletionMessage (1405-1442) + addActionMessage (1284-1304) AFTER existing DOM render.
- Wire `window.addEventListener('beforeunload', () => FSBSidepanelMessageLog.flushAll())`.
- Smoke Part 3 filled at >= 6 PASS.

Closes: FINT-23 complete (Tier 1 + write-through wired).

**Plan 12-03 (Wave 3) -- Live progress wiring fix (FINT-22)**

- Flip `showSidepanelProgress` default from `false` to `true` in:
  - `extension/ui/options.js:24` -- `showSidepanelProgress: false` -> `showSidepanelProgress: true`.
  - `extension/ui/sidepanel.js:17` -- `let showSidepanelProgressEnabled = false;` -> `let showSidepanelProgressEnabled = true;`.
  - `extension/ui/sidepanel.js:788` -- `stored.showSidepanelProgress ?? false` -> `stored.showSidepanelProgress ?? true`.
- Add new addMessage calls in the inbound listener for each progress event type, with `kind: 'tool' | 'progress'` per D-12:
  - `case 'tool_executed':` add `addMessage(toolName + (success ? '' : ' [failed]'), 'assistant', 'tool')` UNCONDITIONAL (write-through to persistence always; DOM render styling defers to D-12 Claude's Discretion).
  - `case 'iteration_complete':` add `addMessage('Step ' + iteration + ' complete', 'assistant', 'progress')` UNCONDITIONAL.
- Smoke Part 4 filled at >= 6 PASS.

Closes: FINT-22 complete.

**Plan 12-04 (Wave 4) -- Per-tab sidepanel auto-open + ceremony (FINT-24 + ceremony)**

- Add `chrome.sidePanel.setOptions({tabId, enabled: true, path: 'ui/sidepanel.html'})` + `chrome.sidePanel.open({tabId})` calls at the start of `startAutomation` handler in `extension/background.js` per Section 7.6 recipe.
- Smoke Part 5 filled at >= 4 PASS (mock chrome.sidePanel.setOptions + open; assert call order; assert error swallowing).
- Smoke Part 6 filled at >= 4 PASS (INV-04 byte-freeze regression: setTimeout count = 8 + 4 iterator patterns + zero Phase 12 token in setTimeout lambda; INV-06 LATTICE-PIN.md SHA literal byte-freeze).
- REQUIREMENTS.md FINT-22/23/24 narrative entries + 3 traceability rows + Total v1 footer bump 44 -> 47 + Last updated bumped to 2026-06-08.
- LATTICE-PIN.md Phase 12 row appended (`current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`).
- v0.10.0-MILESTONE-AUDIT.md status_history `phase_12_shipped` entry + last_revised bumped.
- New `12-VERIFICATION.md` Human Verification section with 6-sub-assertion UAT-12 procedure joining consolidated UAT-08+09+10+11+12 single Chrome MV3 reload session.

Closes: FINT-24 complete. Milestone state ready for consolidated UAT.

### Final smoke target

`tests/sidepanel-message-log-smoke.test.js` final >= 28 PASS / 0 FAIL (Part 1 envelope + LRU >= 6 + Part 2 hydrate 3-tier >= 4 + Part 3 write-through >= 6 + Part 4 progress wiring >= 6 + Part 5 sidePanel API >= 4 + Part 6 INV byte-freeze >= 4).

Plus carryforward `tests/sidepanel-tab-aware-smoke.test.js` BYTE-FROZEN at 41 PASS (Phase 11 baseline; Phase 12 does NOT touch this file).

Plus full `npm test` chain green (Phase 1-11 smokes + new Phase 12 smoke).

## Section 12: Open Questions (RESOLVED)

> All three OQs resolved in favor of the SIMPLEST viable implementation per Phase 12 scope. Plans 12-00 through 12-04 implement these resolutions; no further design iteration required.

### OQ-1 -- showSidepanelProgress default flip vs unconditional render

Section 6.4 RECOMMENDS option 1 (flip the default). The planner may pick option 2 (unconditional render) instead, OR a hybrid that flips the default AND repurposes the setting as a render-style toggle. Plan 12-03 must lock the choice.

**Recommendation:** option 1. Lowest LOC. Preserves user control.

**RESOLVED:** Plan 12-03 locks option 1 (flip showSidepanelProgress default false -> true in extension/ui/options.js + extension/ui/sidepanel.js, 3 sites total). User retains override via Settings -> Sidepanel toggle.

### OQ-2 -- Tool message kind styling (D-12 Claude's Discretion)

`kind: 'tool'` messages need a visual treatment in sidepanel.css. Options:
- (a) Reuse existing `.message.action` styling (smaller font, distinct color).
- (b) Reuse `.collapsed-action` from addActionMessage.
- (c) Ship a new `.message.tool` rule with monospace + subtle background.

**Recommendation:** option (a) -- existing action styling is already in production for similar use. Lowest visual disruption.

**RESOLVED:** Plans 12-01 + 12-02 lock option (a). Plan 12-01 `renderPersistedMessage` maps `kind: 'progress' | 'tool'` -> CSS class `.message.action` via the existing addActionMessage path. Plan 12-02 Hook C persists via addActionMessage, which already renders with `.message.action` styling. Zero new CSS rules required.

### OQ-3 -- Debounce reset strategy (clear-and-replace vs trailing-edge-only)

Section 4 sketches clear-and-replace (every addMessage resets the 200ms window). Alternative: trailing-edge-only (the first addMessage starts the timer; subsequent calls within 200ms append to buffer but do NOT reset). Tradeoff:
- Clear-and-replace: bursts of 10 calls in 100ms get batched into 1 write at 200ms after the LAST call. May delay flush during long bursts.
- Trailing-edge-only: same burst gets flushed at 200ms after the FIRST call. More predictable max latency; may cause a second flush if calls span the boundary.

**Recommendation:** clear-and-replace. Predictable for bursty progress streams (which is the common case). The 200ms-bounded loss window is fine per D-03.

**RESOLVED:** Plan 12-00 `createDebouncer` factory locks clear-and-replace (every schedule call clears the pending timer via clearTimeout, then replaces it with a new 200ms timer). Predictable batching of bursty progress streams; 200ms-bounded loss window matches D-03 contract; forced flush on `beforeunload` (D-03 defense-in-depth) covers the long-burst delay edge case.

## Section 13: Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `chrome.storage.local` quota is 10MB default + `unlimitedStorage` exempts FSB from it | Section 4 + 8 EC-02 | Storage failures would degrade silently (D-03); LRU cap = 50 limits worst-case anyway |
| A2 | The sidepanel sendBtn click handler -> chrome.runtime.sendMessage round-trip preserves user-gesture context across the SW boundary | Section 7.6 + Pitfall 2 | If gesture decays, sidePanel.open fails; existing fallback (sidepanel stays available via global default; user opens manually) covers |
| A3 | `chrome.sidePanel.setOptions({enabled: true})` does NOT auto-open the panel; only `open()` triggers visibility | Section 7.3 + 7.4 | If wrong, panel may open on tabs not currently active; mitigation is to not enable on non-automation tabs (we don't) |
| A4 | The sidepanel page's `setTimeout` survives SW eviction | Section 8 EC-01 | If wrong, debounce timer lost; mitigation is the `beforeunload` forced flush (D-03 defense-in-depth) |
| A5 | The state-emitter `sessionStateEvent` for `tool_executed` IS emitted by current production code (Phase 8 / 10 sites) | Section 6.2 HOP 1 | If not emitted, Plan 12-03 cannot wire it; would require backing into Section 6 alt fix paths |
| A6 | `addMessage` is the unified DOM chokepoint for all message renders (no direct chatMessages.appendChild bypass paths) | Section 5 + Pitfall 3 | If bypass paths exist (sidepanel.js shows some, e.g. recon retry div), persistence misses those messages; mitigation is to verify via grep + add `_persistMessage` calls at any bypass site |

## Section 14: Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (for smoke) | tests/sidepanel-message-log-smoke.test.js | ✓ | (any modern; vanilla node + require) | -- |
| Chrome 114+ for chrome.sidePanel API | FINT-24 setOptions + open | required at runtime; smoke mocks | -- | If user has Chrome <114, sidePanel API absent; FSB already gracefully degrades via the try/catch around setPanelBehavior at background.js:13231 |
| npm test full chain | regression coverage | ✓ | (npm 11; see Phase 1 catalog-fix entry) | -- |
| Lattice file: dep | Lattice surface preservation check | ✓ | path:./lattice/packages/lattice (Phase 1 baseline) | -- |
| esbuild (offscreen / dist build) | unchanged in Phase 12 | ✓ | 0.24.x (Phase 5 baseline) | -- |

No missing dependencies. Phase 12 is pure FSB-side code; no new external requirements.

## Section 15: Security Domain

> Skipping the full ASVS table per `security_enforcement: false` -- this is a UX persistence + IPC wiring phase, not a security feature.

Cross-cutting security observations for the planner:

- **Storage:** chrome.storage.local is per-extension origin; no cross-origin leak. The new envelope contains user-typed messages and AI completions. No new PII surface beyond what Phase 11 + b8b761e8 already persist (fsbSessionLogs already stores commands + completionMessages).
- **Cross-extension messages:** sidepanel.js's chrome.runtime.onMessage listener already filters by `request.sessionId === currentSessionId` for autopilot events. No new cross-extension surface.
- **chrome.sidePanel.open with tabId from sidepanel:** the tabId arrives via the sidepanel-sent startAutomation message. Background.js handler receives it from `sender` context. Validate tabId is a positive integer + the tab exists (existing handler already does this for content-script readiness). No new attack surface.
- **INV-01/02 preserved:** no tool-definitions touch. No MCP wire change.

## Section 16: State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Single global `fsbSidepanelConversationId` (Phase 1-10) | `fsbSidepanelTabConversations` envelope (Phase 11) -- per-tab keying | Phase 11 (2026-06-07) | Phase 12 builds on per-tab envelope |
| `addMessage` writes ONLY to DOM (Phase 1-11) | `addMessage` writes to DOM AND persistent `fsbConversationMessages` store (Phase 12) | Phase 12 (2026-06-08) | Sidepanel reopen restores full transcript |
| Global sidepanel (auto-opens via setPanelBehavior; manifest default) | Per-tab + global sidepanel (setOptions for auto-bind tabs; global default for others) | Phase 12 (2026-06-08) | Sidepanel binds to automating tab on Run |
| Tool progress GATED by `showSidepanelProgress` setting default `false` | Tool progress UNCONDITIONAL render via `kind: 'tool'` addMessage OR default-flip per Section 6.4 | Phase 12 (2026-06-08) | User sees "I see no progress" UX gap closed |
| Hydrate from `fsbSessionLogs` only (b8b761e8 Bug 2 partial) | 3-tier hydrate: new store -> fsbSessionLogs -> empty (Phase 12 D-06) | Phase 12 (2026-06-08) | Reopens render full chat scrollback for new convs |

## Sources

### Primary (HIGH confidence)

- **In-tree code (verified via Read + grep + Bash):**
  - `extension/ui/sidepanel.js` (2686 lines verified) -- inbound listener at lines 1794-1971; addMessage chokepoint at 1469-1523; hydrateChatFromConversationId at 285-360; initTabConversationStore at 114-155.
  - `extension/ui/sidepanel.html` (131 lines verified) -- script-tag chain at lines 119-129.
  - `extension/ui/sidepanel-tab-conv-store.js` (252 lines verified) -- canonical sidecar IIFE pattern template.
  - `extension/background.js` (13351 lines verified) -- fsbBroadcastAutomationLifecycle at 2082-2106; sidePanel.open at 12979; setPanelBehavior at 13229; statusUpdate broadcasts at 3411, 6743, 6800, 9965, 10524.
  - `extension/ai/agent-loop.js` (2778 lines; OFF LIMITS but read for emission inventory) -- fsbBroadcastAutomationLifecycle calls at 1431, 1549, 1591.
  - `extension/ai/state-emitter.js` (212 lines verified) -- sessionStateEvent broadcast at line 120.
  - `extension/ai/lattice-step-emitter.js` (64 lines verified) -- Phase 8 sidecar template for the new sidepanel-message-log.js sidecar.
  - `extension/manifest.json` (verified) -- `sidePanel`, `tabs`, `storage`, `unlimitedStorage`, `offscreen` permissions present; `side_panel.default_path` at lines 39-41.
- **CONTEXT.md** at `.planning/phases/12-side-panel-follows-automation/12-CONTEXT.md` (verified) -- 26 locked decisions.
- **Phase 11 RESEARCH.md** at `.planning/phases/11-tab-aware-side-panel-surface/11-RESEARCH.md` (verified) -- template + format conventions.
- **Phase 11 CONTEXT.md** at `.planning/phases/11-tab-aware-side-panel-surface/11-CONTEXT.md` (verified) -- D-14 drop-on-close + D-15 preserve-on-discard + D-17 lazy mint.
- **Bug 1 debug file** at `.planning/debug/resolved/phase-11-tab-swap-stale.md` (verified) -- chrome.windows.onFocusChanged backstop + applyInputLockout(false) restore fix at commit `ba107c87`.
- **Bug 2 debug file** at `.planning/debug/resolved/phase-11-sidepanel-reopen-empty.md` (verified) -- hydrate scaffold at commit `b8b761e8`; identifies fsbSessionLogs as wrong data source.
- **INV-04 baseline:** `grep -c "setTimeout" extension/ai/agent-loop.js` returns `8` (verified).
- **INV-06 baseline:** `cd lattice && git rev-parse HEAD` returns `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (verified).
- **Zero-collision check:** `grep -rn "fsbConversationMessages" extension/` returns empty (verified).
- **Storage key inventory:** no conflict with `fsbSessionLogs`, `fsbSessionIndex`, `showSidepanelProgress`, `lastTask`, `uiMode`, `apiKey`, `captchaApiKey`, `fsbSidepanelTabConversations`, `fsbSidepanelConversationId`, `fsbAgentRegistry`, `mcpVisualSession:<tabId>`, `fsb_lattice_snapshot_<sessionId>_*`, `fsbMcpVisualSessions`.

### Secondary (MEDIUM confidence)

- **chrome.sidePanel official docs (WebFetch + WebSearch):** https://developer.chrome.com/docs/extensions/reference/api/sidePanel -- verifies user-gesture requirement on open(); setOptions/setPanelBehavior do NOT require gesture; close() exists Chrome 141+; multi-tab setOptions interaction.
- **Chrome storage quota docs (WebSearch):** chrome.storage.local default 10MB; `unlimitedStorage` permission exempts; FSB declares the permission.
- **ExtensionFast 2026 guide (WebSearch):** how-to for sidepanel build patterns; confirms gesture context preservation across message bus per recipe in Section 7.6.

### Tertiary (LOW confidence)

- **Chromium-issues threads (WebSearch):** community discussion on gesture decay through long await chains. Treated as cautionary not authoritative; conservative recipe in Section 7.6 avoids the risk by calling setOptions + open as FIRST awaits in the SW handler.

## Metadata

**Confidence breakdown:**
- Architecture + integration approach (Section 1): HIGH -- all three surfaces map to verified in-tree code lines + exact function signatures.
- INV-06 binary verdict (Section 2): HIGH -- exhaustive surface enumeration; no Lattice contract surface in any sub-area.
- INV-04 byte-freeze (Section 3): HIGH -- baseline verified; agent-loop.js explicitly off limits; smoke pattern derived from Phase 11.
- Envelope shape + debouncer (Section 4): HIGH -- direct extension of Phase 11 algorithm; chrome.storage.local quota verified via official docs + manifest review.
- Hydrate path repoint (Section 5): HIGH -- existing function body identified line-by-line; 3-tier sketch is a syntactic restructure not a semantic change.
- Live progress audit (Section 6): HIGH -- all 4 hops traced to specific line numbers; root cause (settings default off) verified in 3 source-of-truth files.
- chrome.sidePanel constraints (Section 7): MEDIUM -- official docs verify gesture requirement; community sources clarify boundary cases; FSB's existing production usage (line 12979 + 13229) provides working reference.
- Edge cases (Section 8): MEDIUM -- 8 distinct scenarios each cross-checked against Phase 11 / debug patterns; uncertainty on SW-eviction-mid-debounce mitigated by belt-and-suspenders flushAll.
- Validation architecture (Section 9): HIGH -- mirrors Phase 11 smoke pattern; chrome.* mocks well-understood.
- Pitfalls (Section 10): HIGH -- 5 historical FSB-specific gotchas verified against shipped phase debug files.
- Plan breakdown (Section 11): HIGH -- 5 plans / 5 waves locked; dependency order strict-sequential.

**Research date:** 2026-06-08
**Valid until:** 2026-06-22 (14 days; fast-moving sidepanel API + Chrome MV3 conventions)
**Lattice SHA frozen at:** `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 HEAD; INV-06)
**INV-04 setTimeout baseline:** `8` (Phase 7+8+9+10+11 carryforward; verified)
