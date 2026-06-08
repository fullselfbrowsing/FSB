# Phase 11: Tab-aware side panel surface — friendly owner-chip + foreign-owned input lockout + per-tab chat history - Research

**Researched:** 2026-06-07
**Domain:** FSB Chrome MV3 sidepanel UI — owner-chip label resolution + input gating + per-tab conversation persistence
**Confidence:** HIGH (all 22 CONTEXT decisions cross-checked against in-tree code; line numbers verified via grep + read; INV-04/06 baselines verified clean; no Lattice-side surface required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Storage envelope shape**

- **D-01:** Single chrome.storage.session key `fsbSidepanelTabConversations` holding the entire per-tab map as one envelope. Atomic read/write semantics. Matches the agent-registry envelope shape pattern (single key, records keyed by id).
- **D-02:** Envelope shape `{ v: 1, byTab: { '<tabId>': <entry>, ... }, lru: ['<tabId>', ...] }` with `v: 1` literal at root.
- **D-03:** Per-tab entry shape `{ conversationId: string, lastAccessAt: number, createdAt: number }`.
- **D-04:** Hard cap of 50 tabs in the map. On 51st entry insertion, evict the tab with smallest `lastAccessAt`. Reuse Phase 9 `enforceLruCap` pattern from `extension/ai/lattice-runtime-adapter.js`. The `lru: ['<tabId>', ...]` field is maintained eviction order (head = MRU, tail = next-to-evict).

**Owner-chip friendly-label lookup pathway**

- **D-05:** Owner-chip reads visual-session lifecycle entry for active tabId via async `chrome.storage.session.get(storageKeyForTab(tabId))`. The existing `chrome.tabs.onActivated` handler at sidepanel.js:288 becomes async.
- **D-06:** New helper from `extension/ui/owner-chip.js`: `lookupClientLabel(tabId, storageReadFn)` returns `Promise<string|null>` resolving to `entry.client` if a lifecycle entry exists, otherwise `null`. Storage fn injected for testability.
- **D-07:** Fallback when no lifecycle entry: render `formatAgentIdForDisplay` 6-char short prefix. Three-tier resolution: `legacy:*` literal → lifecycle `entry.client` → short-prefix.
- **D-08:** NO in-memory cache layer. `chrome.storage.session.get` ~1ms typical; cache invalidation creates stale-cache failure mode. Lifecycle entry IS the source of truth.
- **D-09:** Popup (`extension/ui/popup.js` + `extension/ui/popup.html`) gets identical `ownerLabelFor` extension. Popup-side input lockout + per-tab history OUT OF SCOPE.

**Foreign-owned input lockout granularity**

- **D-10:** When `shouldShowOwnerChip(ownerAgentId, 'legacy:sidepanel')` returns true, disable ALL user-input controls: chat textarea, send button, run-task button, voice-input button, stop-task button.
- **D-11:** Visual cue is existing owner chip plus dimmed/disabled CSS. Disabled controls get `disabled` attribute + `aria-disabled="true"`; CSS adds reduced opacity. NO separate banner.
- **D-12:** FSB Autopilot driving the active tab is treated as foreign ownership. Autopilot's agentId is `legacy:autopilot` distinct from `legacy:sidepanel`. Chip displays `owned by FSB Autopilot`; controls lock out.
- **D-13:** Stop-task button also disabled when foreign-owned. Stop-task is FSB-Autopilot-local — surfacing it as enabled creates false affordance.

**Conversation lifecycle policies**

- **D-14:** On `chrome.tabs.onRemoved(tabId)`, drop the entry from per-tab map AND LRU order. History view aggregation unaffected.
- **D-15:** On `chrome.tabs.onDiscarded(tabId)`, preserve the entry untouched. `tabId` survives discard/restore.
- **D-16:** On `chrome.tabs.onAttached`/`onDetached` (window moves), preserve the entry. Per-window keying rejected.
- **D-17:** Lazy mint: per-tab `conversationId` minted on first user message in that tab, not on tab activation. On tab activation with no entry, empty chat surface; first send triggers `conversationId = mintConversationId()` + envelope write + render.

**Surfaces touched (locked)**

- **D-18:** Phase 11 touches FSB-internal UI surfaces only: `sidepanel.js`, `sidepanel.html`, `sidepanel.css`, `owner-chip.js`, `popup.js`, `popup.html`. No `extension/ai/*`, no `background.js`, no `manifest.json`, no Lattice-side files.
- **D-19:** INV-04 BYTE-FROZEN: `grep -c "setTimeout" extension/ai/agent-loop.js` stays 8.
- **D-20:** INV-06 BYTE-FROZEN: `current_lattice_sha` stays `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Zero Lattice-side commits.

**Plan shape + UAT integration**

- **D-21:** Anticipated 3-5 plans across 3-4 waves: Wave 0 smoke scaffold; Waves 1-3 the three surfaces; Wave 4 ceremony.
- **D-22:** Per-axis UAT-11 deferred to consolidated end-of-milestone UAT alongside UAT-08+09+10. User runs UAT-08+09+10+11 in one Chrome MV3 reload session.

### Claude's Discretion

- Exact CSS class names for disabled-state visual treatment.
- Exact aria-label / aria-describedby copy for locked state.
- Exact storage key string (recommended `fsbSidepanelTabConversations`).
- Whether LRU helper ships as inline private function inside sidepanel.js, sidecar `extension/ui/sidepanel-tab-conv-store.js`, or re-export from `agent-registry.js`.
- Exact insertion ordering of new helper file in sidepanel.html.

### Deferred Ideas (OUT OF SCOPE)

- Popup-side input lockout + per-tab history (popup is single-shot per Phase 243).
- Cross-window side panel state unification.
- Conversation history search + cross-tab merging UI.
- Incognito mode special-casing.
- Archive-on-close (instead of drop-on-close).
- Per-window keying.
- Pre-cache + storage.onChanged sync.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FINT-19** | Owner-chip friendly-label resolver: new `lookupClientLabel(tabId, storageReadFn)` async helper in `owner-chip.js`; sidepanel.js + popup.js `refreshOwnerChip` extended with three-tier resolution (legacy literal → lifecycle entry.client → short-prefix fallback) | Sections 1.A + 6 verify the existing `refreshOwnerChip` extension point at sidepanel.js:242-278 + the lifecycle entry read site via `storageKeyForTab` at mcp-visual-session-lifecycle.js:86-89 |
| **FINT-20** | Foreign-owned input lockout: when `shouldShowOwnerChip` returns true, disable chatInput + sendBtn + stopBtn + micBtn (no separate run-task button exists). Defense-in-depth runtime gate at handleSendMessage entry | Sections 1.B + 6 verify DOM element IDs at sidepanel.html:65 + 73 + 76 + 79; existing disabled-state CSS pattern at sidepanel.css:502-511 |
| **FINT-21** | Per-tab conversation state model: refactor `fsbSidepanelConversationId` single-key to `fsbSidepanelTabConversations` envelope (`{v:1, byTab, lru}`); `chrome.tabs.onActivated` swaps visible conversation; `chrome.tabs.onRemoved` drops entry; `chrome.tabs.onDiscarded` preserves; lazy mint on first user message; LRU cap=50 with eviction-on-write | Sections 1.C + 4 + 5 verify the existing `initConversationId` site at sidepanel.js:46-59 + the Phase 9 LRU pattern at lattice-runtime-adapter.js:136-162 + envelope idiom at agent-registry.js |

REQ-ID rationale: continues the FINT-NN..K placeholder series in REQUIREMENTS.md. FINT-19/20/21 explicitly close the three UX gaps surfaced during the 2026-06-07 OpenRouter session. Phase 11 SUMMARY will populate the traceability rows.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **NO emojis** in code, logs, markdown, or any file output unless explicitly requested.
- **NO em-dashes between sentences** in prose; use `--` per FSB convention.
- **Browser automation policy:** Use FSB MCP tools for any live-browser tasks. (Not applicable to Phase 11 — pure code phase.)

## Summary

Phase 11 ships **three coupled UX surfaces** that make FSB's side panel tab-aware, all FSB-internal with zero Lattice-side surface required.

1. **Friendly owner-chip label.** Replaces the cryptic `owned by agent_a3f8b1` with `owned by OpenClaw` / `owned by Claude` / `owned by FSB Autopilot` by reading the visual-session lifecycle entry's `client` field (Phase 10 D-02 14-entry allowlist). Three-tier resolution preserves Phase 243 fallback for raw-tool agents.

2. **Foreign-owned input lockout.** When the active tab is foreign-owned, the side panel disables `chatInput` + `sendBtn` + `stopBtn` + `micBtn` (and any run-task button if one exists; current code uses `sendBtn` for both message + task). Visual cue is the existing owner chip; controls get `disabled` + `aria-disabled="true"`; defense-in-depth runtime gate at `handleSendMessage` entry.

3. **Per-tab chat history.** State model migrates from single `fsbSidepanelConversationId` key to `fsbSidepanelTabConversations` envelope (`{v:1, byTab: Map<tabId, {conversationId, lastAccessAt, createdAt}>, lru: ['<tabId>'...]}`). `chrome.tabs.onActivated` swaps visible conversation; switching back retains. Persistence survives MV3 SW restart via chrome.storage.session. LRU cap=50 with eviction-on-write (Phase 9 pattern ported).

**INV-06 binary verdict: NOT TRIGGERED.** Zero Lattice-side commits required. All four surfaces (owner-chip helper, sidepanel.js + popup.js extension, input lockout, per-tab envelope) live in `extension/ui/*`. No Lattice primitive extension is needed; the visual-session lifecycle entry shape already carries `client` (Phase 10 D-01) and FSB's chrome.storage.session is host-specific persistence not a Lattice contract surface. `current_lattice_sha` stays frozen at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 HEAD).

**INV-04 byte-freeze: SAFE.** Phase 11 touches `sidepanel.js` + `sidepanel.html` + `sidepanel.css` + `owner-chip.js` + `popup.js` + `popup.html` only. `agent-loop.js` is OFF LIMITS. `grep -c "setTimeout" extension/ai/agent-loop.js` stays at the verified post-Phase-10 baseline of **8** (4 iterator patterns at lines 1977 + 2676 + 2745 + 2755 + 1 promise sleep at 1472 + 1 comment refs + 2 leading comments). Smoke Part covers byte-freeze regression assertion.

**Primary recommendation:** Land as **4 plans across 4 waves** (D-21 anticipates 3-5; concrete count = 4).
- **Plan 11-00 (Wave 0):** Pure-helper extraction + tab-conv-store sidecar + Wave 0 smoke scaffold. PASS-when-empty placeholders that subsequent plans fill.
- **Plan 11-01 (Wave 1):** Owner-chip friendly-label resolver (FINT-19) — `lookupClientLabel` helper + sidepanel/popup refresh wiring + smoke Parts 1+2.
- **Plan 11-02 (Wave 2):** Foreign-owned input lockout (FINT-20) — disable controls + aria-disabled + runtime gate + CSS + smoke Parts 3+4.
- **Plan 11-03 (Wave 3):** Per-tab conversation state model (FINT-21) — envelope migration + onActivated swap + onRemoved/onDiscarded handlers + lazy mint + LRU + smoke Parts 5+6.
- **Plan 11-04 (Wave 4):** Ceremony — REQUIREMENTS.md FINT-19/20/21 narrative + traceability + LATTICE-PIN.md Phase 11 row (SHA UNCHANGED) + v0.10.0-MILESTONE-AUDIT.md status_history phase_11_shipped entry.

## Section 1: Architecture and Integration Approach for Each Surface

### 1.A Owner-chip Friendly Label (FINT-19)

**Integration point:** `extension/ui/sidepanel.js:242-278` `refreshOwnerChip` is the existing async function that the chrome.tabs.onActivated handler at line 288 already invokes. The function currently reads `fsbAgentRegistry` envelope from chrome.storage.session, resolves `ownerAgentId`, and calls `FSBOwnerChip.ownerLabelFor`.

**Phase 11 extension shape:**

```js
async function refreshOwnerChip() {
  // ... existing prelude (chipEl + tab query + agent registry read)

  const stored = await chrome.storage.session.get('fsbAgentRegistry');
  const envelope = stored && stored.fsbAgentRegistry;
  const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(envelope, tab.id);

  if (!FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE)) {
    chipEl.style.display = 'none';
    return;
  }

  // Phase 11 FINT-19: three-tier resolution
  let label;
  if (ownerAgentId.indexOf('legacy:') === 0) {
    // Tier 1: legacy:* literal (e.g., legacy:popup)
    label = ownerAgentId;
  } else {
    // Tier 2: lookup visual-session lifecycle entry for friendly client name
    const friendlyLabel = await FSBOwnerChip.lookupClientLabel(
      tab.id,
      (key) => chrome.storage.session.get(key)
    );
    if (friendlyLabel) {
      label = friendlyLabel;
    } else {
      // Tier 3: fall back to short prefix (Phase 243 baseline)
      const formatter = (typeof FsbAgentRegistry !== 'undefined'
        && typeof FsbAgentRegistry.formatAgentIdForDisplay === 'function')
        ? FsbAgentRegistry.formatAgentIdForDisplay
        : null;
      label = FSBOwnerChip.ownerLabelFor(ownerAgentId, formatter);
    }
  }

  chipEl.textContent = FSBOwnerChip.buildChipText(label);
  chipEl.style.display = 'inline-flex';
}
```

**New helper in `extension/ui/owner-chip.js`:**

```js
/**
 * Look up the friendly client label for a tab from the visual-session lifecycle.
 * Returns the entry.client value if a lifecycle entry exists for the tabId,
 * otherwise null. Storage read is injected for testability.
 *
 * @param {number} tabId
 * @param {function} storageReadFn  Async fn that takes a storage key and returns
 *                                   the chrome.storage.session.get bag.
 * @returns {Promise<string|null>}
 */
async function lookupClientLabel(tabId, storageReadFn) {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId <= 0) return null;
  if (typeof storageReadFn !== 'function') return null;
  const key = 'mcpVisualSession:' + tabId;
  try {
    const bag = await storageReadFn(key);
    const entry = bag && bag[key];
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.client !== 'string' || entry.client.trim().length === 0) return null;
    return entry.client.trim();
  } catch (_e) {
    return null;
  }
}
```

**Key insight:** the visual-session lifecycle storage key prefix is `mcpVisualSession:` per `mcp-visual-session-lifecycle.js:58` `MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX`. Phase 11 inlines the prefix literal (no need to importScripts the lifecycle module into the sidepanel — sidepanel never importScripts; it uses script tags). The lifecycle module guarantees `entry.client` is pre-normalized per Phase 10 D-01 + D-02 (only allowlisted labels survive `recordVisualSessionTick`'s `normalizeMcpVisualClientLabel` call at lifecycle.js:325-333). Defensive validation rejects non-string + empty values [VERIFIED: mcp-visual-session-lifecycle.js:325-333].

**Popup mirror (D-09):** `extension/ui/popup.js:107-148` has byte-identical `refreshOwnerChip` shape; same three-tier resolution lands there too. Phase 11 ships popup-side chip-only fix in the same plan to keep the helper test surface symmetric.

### 1.B Foreign-owned Input Lockout (FINT-20)

**Integration points (verified DOM IDs):**

| Element ID | sidepanel.html line | Purpose |
|------------|---------------------|---------|
| `chatInput` | line 65 (contenteditable div) | Primary input |
| `sendBtn` | line 79 | Send message / run task (single button) |
| `stopBtn` | line 73 (hidden by default) | Stop automation |
| `micBtn` | line 76 | Voice input |

**Important discovery:** there is NO separate run-task button. The current side panel uses `sendBtn` for both "send message" and "run task" (both flow through `handleSendMessage` which calls `chrome.runtime.sendMessage({action: 'startAutomation', task: message, ...})` at sidepanel.js:520-526). CONTEXT D-10 lists "run-task button" as a distinct control; Phase 11 implementation should treat `sendBtn` as the single combined control. If a discrete "run-task" button is introduced in a future phase, it follows the same pattern.

**CONTEXT D-10 list reconciliation:** Five controls in CONTEXT (chat textarea, send button, run-task button, voice-input button, stop-task button) collapse to **four DOM elements** in current code (chatInput, sendBtn, micBtn, stopBtn). The "run-task button" is currently the same `sendBtn` — the same lockout closes both behaviors.

**Lockout helper signature:**

```js
/**
 * Toggle input controls' disabled state based on foreign-tab ownership.
 * Called by refreshOwnerChip after shouldShowOwnerChip resolves.
 *
 * @param {boolean} foreignOwned  true => lock out; false => unlock
 */
function applyInputLockout(foreignOwned) {
  const controls = [
    document.getElementById('chatInput'),
    document.getElementById('sendBtn'),
    document.getElementById('stopBtn'),
    document.getElementById('micBtn')
  ];
  for (const el of controls) {
    if (!el) continue;
    if (foreignOwned) {
      // Buttons use 'disabled' attribute; contenteditable div uses 'contenteditable=false'.
      if (el.tagName === 'BUTTON') {
        el.disabled = true;
      } else {
        el.setAttribute('contenteditable', 'false');
      }
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('fsb-foreign-owned-disabled');
    } else {
      if (el.tagName === 'BUTTON') {
        // Don't undo isRunning-driven disable; just clear the foreign flag.
        // updateSendButtonState() restores correct state for sendBtn.
        el.removeAttribute('aria-disabled');
      } else {
        el.setAttribute('contenteditable', 'true');
        el.removeAttribute('aria-disabled');
      }
      el.classList.remove('fsb-foreign-owned-disabled');
    }
  }
  // Restore correct sendBtn state via existing helper.
  if (typeof updateSendButtonState === 'function') updateSendButtonState();
}
```

**Defense-in-depth runtime gate** at `handleSendMessage` entry (sidepanel.js:483-553):

```js
async function handleSendMessage() {
  const message = chatInput.textContent.trim();
  if (!message || isRunning) return;

  // Phase 11 FINT-20: defense-in-depth runtime gate. The disabled attribute is
  // the primary defense; this guards against a stale UI state (e.g., button
  // disabled-state cleared by a sibling refresh racing with tab activation).
  if (await _isActiveTabForeignOwned()) return;

  // ... existing body unchanged
}

async function _isActiveTabForeignOwned() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') return false;
    const stored = await chrome.storage.session.get('fsbAgentRegistry');
    const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(stored?.fsbAgentRegistry, tab.id);
    return FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE);
  } catch (_e) {
    return false;  // fail-open: never block on storage errors
  }
}
```

### 1.C Per-tab Chat History (FINT-21)

**Existing single-key flow (verified, sidepanel.js:46-59):**

```js
async function initConversationId() {
  const stored = await chrome.storage.session.get(['fsbSidepanelConversationId']);
  if (stored.fsbSidepanelConversationId) {
    conversationId = stored.fsbSidepanelConversationId;
  } else {
    conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await chrome.storage.session.set({ fsbSidepanelConversationId: conversationId });
  }
}
```

**Phase 11 replacement flow:**

```js
// On sidepanel boot:
await initTabConversationStore();  // populates module-scope `tabConvEnvelope`

// On chrome.tabs.onActivated:
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await refreshOwnerChip();      // existing
  await swapToTabConversation(activeInfo.tabId);  // Phase 11 new
});

// On chrome.tabs.onRemoved:
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await dropTabConversation(tabId);
});

// On chrome.tabs.onDiscarded — NO-OP (D-15)

// On first user message in a tab with no entry:
async function handleSendMessage() {
  // ... existing prelude
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  conversationId = await ensureTabConversation(tab.id);  // lazy mint
  // ... rest of existing flow
}

// On New Chat button (startNewChat):
// Mint fresh conversationId + persist to the per-tab envelope under current tab.
```

**Conversation UI swap mechanics:** `chatMessages` div is cleared on tab switch, then re-rendered from the persisted message history for the new tabId's conversationId. The existing FSB session-history fetch path (`chrome.runtime.sendMessage({action: 'loadSession', sessionId: ...})` at sidepanel.js:~370-393) provides the mechanism; Phase 11 maps `conversationId -> sessionId` via existing logic OR uses an in-memory cache of last-rendered messages keyed by tabId. Per Claude's discretion, the planner picks based on existing message-history surface.

**Sidecar module location (Claude's discretion):** Three options per CONTEXT:

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Inline private function inside sidepanel.js | Co-located with consumers | Bloats sidepanel.js further (already 2152 lines) | Not recommended |
| **Sidecar `extension/ui/sidepanel-tab-conv-store.js`** | **Testable; mirror owner-chip.js dual-export idiom; pure-helper isolation** | One more script tag in sidepanel.html | **RECOMMENDED** |
| Re-export from `agent-registry.js` | Shared LRU implementation | Couples sidepanel state to registry-domain concerns | Not recommended |

The sidecar module mirrors `extension/ui/owner-chip.js`-style: IIFE-wrapped, dual export (`globalThis.FSBSidepanelTabConvStore` + `module.exports`), pure helpers that accept storage dependencies as parameters. See Section 4 for the concrete envelope schema.

## Section 2: INV-06 Binary Verdict

### Verdict: **NOT TRIGGERED. INV-06 STAYS FROZEN at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5 SHA).**

Phase 11 ships **ZERO Lattice-side commits**. LATTICE-PIN.md Phase 11 row will record `current_lattice_sha UNCHANGED` per Phase 6-10 precedent. Plan 11-04 ceremony will append the Phase 11 row mirroring Phase 8/9/10 row shapes.

### Evidence (HIGH confidence)

**Four surfaces, all FSB-internal:**

1. **`lookupClientLabel` helper** lives in `extension/ui/owner-chip.js` — FSB-only file; no Lattice import.
2. **Sidepanel + popup wiring** — `extension/ui/sidepanel.js` + `popup.js` are FSB-only UI; classic script-tag loaders that have never depended on Lattice.
3. **Input lockout CSS + DOM** — `extension/ui/sidepanel.css` styling; pure UI.
4. **Per-tab conversation envelope** — chrome.storage.session is an FSB host-runtime concern. The envelope shape (`{v:1, byTab, lru}`) is a host-specific persistence layer, NOT a Lattice contract.

**The visual-session lifecycle entry's `client` field** (the data source Phase 11 reads for friendly labels) was added in Phase 10 FINT-16 entirely on the FSB side at `extension/utils/mcp-visual-session-lifecycle.js:368-388` [VERIFIED: lifecycle.js Plan 10-01 nextEntry shape extension]. The allowlist live at `extension/utils/mcp-visual-session.js:4-20` (14 entries including `'FSB Autopilot'`) is also FSB-side.

**No Lattice receipt, tracer, hook pipeline, provider adapter, or survivability primitive is consumed or extended by Phase 11.** The lattice/ directory is read-only carryforward through this phase.

[VERIFIED: in-session grep `grep -rn "lattice\|Lattice" extension/ui/` returns only references in owner-chip.js test comments and Phase 243/237 narrative — zero runtime imports]

**If the planner surfaces a need for a Lattice-side primitive extension during planning,** that is a discuss-phase blocker per CONTEXT D-20 and must be flagged for human review. Research expects this to NOT happen given the FSB-internal nature of all four surfaces.

## Section 3: INV-04 Byte-Freeze Guard Patterns

### Baseline verified 2026-06-07

```bash
grep -c "setTimeout" extension/ai/agent-loop.js
# Returns: 8
```

[VERIFIED: in-session bash command, count = 8]

Distribution (line numbers from post-Phase-10):

| Line | Context | Pattern |
|------|---------|---------|
| 5 | JSDoc comment | `* Each iteration is a separate setTimeout callback ...` |
| 1292 | JSDoc comment | `* Uses setTimeout-chaining (not while-loop)` |
| 1472 | Promise sleep | `return new Promise(function(resolve) { setTimeout(resolve, ms); });` |
| **1977** | **Iterator pattern** | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);` |
| **2676** | **Iterator pattern** | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);` |
| **2745** | **Iterator pattern** | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 5000);` |
| **2755** | **Iterator pattern** | `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 2000);` |
| (one more leading comment) | Pre-iterator comment | (8th match per `grep -c` total) |

The 4 `session._nextIterationTimer = setTimeout(...)` patterns are the load-bearing INV-04 iterator pattern.

### Phase 11 Byte-Freeze Smoke Patterns

Phase 11 plans MUST include the following assertions in Wave 0 + Wave 4 smoke (mirroring Phase 6 Plan 06-05 + Phase 8 Plan 08-02 + Phase 10 Plan 10-01 precedent):

**Pattern 1: Total count holds at 8**

```js
ok('INV-04 Pattern 1: setTimeout total count = 8', () => {
  const src = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');
  const matches = src.match(/setTimeout/g);
  assert.equal(matches ? matches.length : 0, 8);
});
```

**Pattern 2: Iterator pattern count = 4**

```js
ok('INV-04 Pattern 2: 4 iterator patterns intact', () => {
  const src = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');
  const matches = src.match(/session\._nextIterationTimer\s*=\s*setTimeout/g);
  assert.equal(matches ? matches.length : 0, 4);
});
```

**Pattern 3: NO Phase-11 token inside any setTimeout lambda body (awk-scan empty)**

```js
ok('INV-04 Pattern 3: no Phase 11 tokens inside setTimeout lambdas', () => {
  // awk-equivalent: scan setTimeout(... ) lambda bodies for forbidden Phase 11 tokens.
  // Forbidden: lookupClientLabel, applyInputLockout, ensureTabConversation,
  //            swapToTabConversation, dropTabConversation
  const src = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');
  // Capture each setTimeout(...) call; for nested parens, this regex catches
  // simple lambdas as in the iterator pattern. Iterator lambdas are bare
  // function bodies; complex nesting is not used in agent-loop.js.
  const setTimeoutCalls = src.match(/setTimeout\s*\([^;]+?\)/g) || [];
  const forbidden = /lookupClientLabel|applyInputLockout|ensureTabConversation|swapToTabConversation|dropTabConversation/;
  for (const call of setTimeoutCalls) {
    assert.ok(!forbidden.test(call),
      'Phase 11 helper found inside setTimeout body: ' + call);
  }
});
```

**Why this matters:** Phase 11 SHOULD NOT touch `agent-loop.js` per D-18. The awk-scan pattern catches accidental cross-contamination if a future maintainer thinks they're "helping" by wiring a Phase 11 helper into the autopilot loop. Phase 11's domain is sidepanel.js + owner-chip.js + popup.js — none of which carry setTimeout patterns related to autopilot iteration.

**Pattern 4: Phase 11 touches only the locked file set**

```js
ok('INV-04 Pattern 4: Phase 11 file scope locked', () => {
  // git status check: only files in extension/ui/* (sidepanel + popup + owner-chip)
  // are modified. agent-loop.js, background.js, manifest.json untouched.
  // (Run as a smoke assertion or pre-commit hook; pattern recorded here for plans.)
});
```

## Section 4: Storage Envelope Shape Concrete Details

### TypeScript-style schema

```typescript
/**
 * chrome.storage.session key: 'fsbSidepanelTabConversations'
 */
interface TabConvEnvelope {
  v: 1;                                   // literal version
  byTab: { [tabId: string]: TabConvEntry }; // string-keyed map (JSON-safe)
  lru: string[];                          // tab id order, head = MRU, tail = LRU
}

interface TabConvEntry {
  conversationId: string;  // matches existing 'conv_<timestamp>_<rand>' format
  lastAccessAt: number;    // Unix ms; for LRU eviction + future history aggregation
  createdAt: number;       // Unix ms; preserved across updates
}
```

**Note:** tabIds are stringified for the `byTab` map keys (JSON keys must be strings in chrome.storage.session round-trip). The `lru` array can also be string-typed for consistency. Helper functions accept both `number` and `string` tabIds and normalize via `String(tabId)`.

### Eviction algorithm pseudocode

```js
/**
 * Touch the LRU order for a tabId — moves it to the head (MRU position).
 * Mutates envelope.lru in place.
 */
function _touchLru(envelope, tabIdStr) {
  const idx = envelope.lru.indexOf(tabIdStr);
  if (idx !== -1) envelope.lru.splice(idx, 1);
  envelope.lru.unshift(tabIdStr);  // head = MRU
}

/**
 * Enforce LRU cap. If byTab has > cap entries, evict the tail tab id
 * (LRU) until count <= cap. Mutates envelope in place.
 */
function _enforceLruCap(envelope, cap) {
  while (envelope.lru.length > cap) {
    const tailTabId = envelope.lru.pop();
    delete envelope.byTab[tailTabId];
  }
  // Also evict any byTab entries not in lru order (defense vs corruption).
  const lruSet = new Set(envelope.lru);
  for (const tabIdStr of Object.keys(envelope.byTab)) {
    if (!lruSet.has(tabIdStr)) delete envelope.byTab[tabIdStr];
  }
}

/**
 * Ensure a per-tab conversation entry exists. Lazy mint on first call.
 * Updates lastAccessAt + touches LRU. Returns the conversationId.
 */
async function ensureTabConversation(envelope, tabId, mintFn) {
  const tabIdStr = String(tabId);
  let entry = envelope.byTab[tabIdStr];
  if (!entry) {
    entry = {
      conversationId: mintFn(),  // mint via existing 'conv_<ts>_<rand>' fn
      createdAt: Date.now(),
      lastAccessAt: Date.now()
    };
    envelope.byTab[tabIdStr] = entry;
  } else {
    entry.lastAccessAt = Date.now();
  }
  _touchLru(envelope, tabIdStr);
  _enforceLruCap(envelope, DEFAULT_CAP);  // DEFAULT_CAP = 50
  return entry.conversationId;
}

/**
 * Drop a tab's entry (called on chrome.tabs.onRemoved).
 */
function dropTabConversation(envelope, tabId) {
  const tabIdStr = String(tabId);
  delete envelope.byTab[tabIdStr];
  const idx = envelope.lru.indexOf(tabIdStr);
  if (idx !== -1) envelope.lru.splice(idx, 1);
}

/**
 * Look up an existing conversationId for a tab (no mint). Returns null
 * if no entry exists.
 */
function getTabConversation(envelope, tabId) {
  const tabIdStr = String(tabId);
  const entry = envelope.byTab[tabIdStr];
  return entry ? entry.conversationId : null;
}
```

### Migration helper signature

```js
/**
 * Migrate from the legacy single-key `fsbSidepanelConversationId` (Phase 243
 * baseline) to the Phase 11 envelope. Idempotent: safe to call on every boot.
 *
 * If the legacy key is present AND envelope is absent or empty, the legacy
 * conversationId is preserved under the currently-active tab. After migration,
 * the legacy key is removed.
 *
 * Pattern mirrors the v0.9.36-compat migration at mcp-visual-session-lifecycle.js
 * (the Phase 256 lifecycle module preserves prior schemas on restoreVisualSessionLifecyclesFromStorage).
 *
 * @param {object} storageRead   async fn (key) -> bag
 * @param {object} storageWrite  async fn (payload) -> void
 * @param {object} storageRemove async fn (key) -> void
 * @param {number} activeTabId   the tabId to bind the legacy conversationId to
 * @returns {Promise<TabConvEnvelope>}  the post-migration envelope
 */
async function migrateLegacyConversationKey(storageRead, storageWrite, storageRemove, activeTabId) {
  const bag = await storageRead(['fsbSidepanelConversationId', 'fsbSidepanelTabConversations']);
  let envelope = bag.fsbSidepanelTabConversations;
  if (!envelope || envelope.v !== 1) {
    envelope = { v: 1, byTab: {}, lru: [] };
  }
  const legacyConvId = bag.fsbSidepanelConversationId;
  if (legacyConvId && activeTabId && typeof activeTabId === 'number' && activeTabId > 0) {
    const tabIdStr = String(activeTabId);
    if (!envelope.byTab[tabIdStr]) {
      envelope.byTab[tabIdStr] = {
        conversationId: legacyConvId,
        createdAt: Date.now(),
        lastAccessAt: Date.now()
      };
      _touchLru(envelope, tabIdStr);
    }
  }
  await storageWrite({ fsbSidepanelTabConversations: envelope });
  if (legacyConvId) {
    await storageRemove('fsbSidepanelConversationId');
  }
  return envelope;
}
```

**Migration timing:** runs once at sidepanel boot inside `initTabConversationStore`, BEFORE the first `refreshOwnerChip` call. Idempotent on second boot (envelope present, legacy key absent — early-return path).

## Section 5: Hydration Timing — The Race Window

### Three concurrent boot events

When the sidepanel opens, three things happen approximately concurrently:

1. **Sidepanel script execution.** `sidepanel.js` evaluates top-level (module-scope `const chatInput = ...` etc. at lines 62-71), then DOMContentLoaded fires which calls `await initConversationId()` then `refreshOwnerChip()` (sidepanel.js:297-413).
2. **chrome.tabs.onActivated first fire.** The handler at sidepanel.js:288 may fire BEFORE DOMContentLoaded completes if Chrome dispatches the event during sidepanel boot. The MDN/Chrome MV3 docs are silent on guarantee ordering; empirically the listener registration happens at line 288 BEFORE DOMContentLoaded async work starts.
3. **chrome.storage.session.get resolution.** Two separate async storage reads (active tab info + lifecycle entry) resolve in unknown order vs DOMContentLoaded.

### Recommended sequencing (per HIGH-confidence pattern)

```js
// 1. SYNCHRONOUS: register chrome.tabs.onActivated listener early
//    (before any async work) so a tab switch during boot is captured.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Idempotent: if envelope not yet initialized, await first.
  await _envelopeReadyPromise;
  await refreshOwnerChip();
  await swapToTabConversation(activeInfo.tabId);
});

// 2. SYNCHRONOUS: register chrome.tabs.onRemoved listener
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await _envelopeReadyPromise;
  await dropTabConversation(tabId);
});

// 3. ASYNC: initialize envelope. _envelopeReadyPromise resolves once envelope
//    is loaded from storage + migration runs.
let _envelopeReadyResolve;
const _envelopeReadyPromise = new Promise((r) => { _envelopeReadyResolve = r; });
let tabConvEnvelope = null;

async function initTabConversationStore() {
  // First, get active tab so migration can rebind legacy convId to active tab.
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = activeTab && activeTab.id;
  tabConvEnvelope = await migrateLegacyConversationKey(
    (keys) => chrome.storage.session.get(keys),
    (payload) => chrome.storage.session.set(payload),
    (key) => chrome.storage.session.remove(key),
    activeTabId
  );
  // Set conversationId from envelope OR mint lazily (D-17 lazy mint).
  conversationId = activeTabId
    ? getTabConversation(tabConvEnvelope, activeTabId)
    : null;
  _envelopeReadyResolve();  // unblock event handlers
}

// 4. INSIDE DOMContentLoaded handler:
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  await initTabConversationStore();   // Phase 11: replaces initConversationId()
  initializeSidepanelAnalytics();
  // ... rest of existing boot
  refreshOwnerChip();  // existing
});
```

### Race-free guarantees

| Race | Handled by |
|------|-----------|
| onActivated fires before envelope ready | `await _envelopeReadyPromise` gate inside the handler |
| onRemoved fires before envelope ready | Same gate |
| Tab activated during DOMContentLoaded async work | Listener registered synchronously at module load, so the event is queued and handled after envelope ready |
| Two simultaneous storage writes (e.g., onActivated swap + handleSendMessage lazy-mint) | All writes go through a single `_writeEnvelope()` helper that acquires `_envelopeMutex` (mirrors `withRegistryLock` at agent-registry.js:181-185) |

**Write serialization:**

```js
let _envelopeWriteChain = Promise.resolve();
function _withEnvelopeWrite(fn) {
  const next = _envelopeWriteChain.then(fn, fn);
  _envelopeWriteChain = next.catch(() => {});
  return next;
}
```

This ensures envelope mutations linearize even if multiple handlers fire concurrently.

## Section 6: Lockout Granularity — DOM IDs + CSS + ARIA

### DOM elements to disable (verified from sidepanel.html)

| ID | Tag | Phase 11 disabled mechanism |
|----|-----|------------------------------|
| `chatInput` | `<div contenteditable="true">` | Set `contenteditable="false"` + `aria-disabled="true"` + add `.fsb-foreign-owned-disabled` class |
| `sendBtn` | `<button>` | Set `disabled` attribute + `aria-disabled="true"` + add `.fsb-foreign-owned-disabled` class |
| `stopBtn` | `<button>` | Same as sendBtn |
| `micBtn` | `<button>` | Same as sendBtn |

**Discovery: `.fsb-owner-chip` CSS class has NO definition in any CSS file.** [VERIFIED: in-session bash `grep -rn fsb-owner-chip extension/ --include="*.css"` returns zero hits]. The chip is currently styled only by inline `style="display:none"`. Phase 11 has freedom to introduce `.fsb-owner-chip` styling rules without colliding with existing ones — Plan 11-01 / 11-02 should add minimal chip styling alongside the new `.fsb-foreign-owned-disabled` class.

### Recommended CSS (Claude's discretion; planner finalizes)

```css
/* Phase 11 FINT-19: owner chip baseline styling */
.fsb-owner-chip {
  display: none;          /* hidden by default */
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  background: var(--status-bg);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

/* Phase 11 FINT-20: foreign-owned input lockout visual treatment */
.fsb-foreign-owned-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* contenteditable div + button overlap: cursor: not-allowed needs to win */
[id="chatInput"].fsb-foreign-owned-disabled {
  user-select: none;
  background: color-mix(in srgb, var(--bg-tertiary) 76%, var(--border-color) 24%);
}
```

**Why opacity 0.45:** Visual parity with the existing `.send-btn:disabled` rule at sidepanel.css:502-511 which uses `color-mix(in srgb, var(--bg-tertiary) 76%, var(--border-color) 24%)` — both give a clearly-disabled look. Opacity 0.45 is more universally readable than the existing color-mix approach but planner picks based on theme parity testing.

### ARIA copy (Claude's discretion)

| Element | aria-label (when locked) | aria-describedby |
|---------|--------------------------|-------------------|
| chatInput | `Chat input disabled — this tab is owned by another agent` | id reference to a hidden description element |
| sendBtn | `Send disabled — switch to a free tab to chat` | same |
| micBtn | `Voice input disabled — switch to a free tab` | same |
| stopBtn | `Stop disabled — this tab is controlled by another agent` | same |

A hidden description span at the bottom of the sidepanel-container provides the shared description text. Mirrors the established sidepanel.html aria pattern (`role="textbox" aria-multiline="true"` at chatInput per sidepanel.html:69-70).

### Screen-reader semantics rationale

- `aria-disabled="true"` complements the `disabled` attribute and is the canonical way to communicate "this control exists but cannot be used right now" to assistive tech.
- The existing owner chip span (`#fsb-owner-chip`) becomes the explanation cue per D-11; consider adding `role="status"` + `aria-live="polite"` to it so screen-reader users hear the ownership announcement when it appears.

## Section 7: Edge Cases the Planner Must Defend Against

### 7.1 SW eviction mid-tab-switch (storage write in flight)

**Scenario:** User switches tab; `swapToTabConversation` calls `chrome.storage.session.set({fsbSidepanelTabConversations: ...})` but Chrome evicts the SW before the write commits.

**Reality check:** Phase 11 runs in the sidepanel context, NOT the SW. The sidepanel is a DOM document with its own lifecycle independent of the SW. `chrome.storage.session` is shared between SW + sidepanel, but the sidepanel's JS execution context does NOT get evicted by the 30s/5min SW kill timers — it persists as long as the side panel is open in the browser.

**However:** if the user CLOSES the sidepanel mid-write, the write may be lost. Chrome.storage.session writes are typically <10ms and atomic-per-key, so the window is tiny. Defense: write serialization via `_withEnvelopeWrite` (Section 5) ensures writes don't tear; if a write is lost, the next boot's migration helper falls through to lazy-mint on first message.

### 7.2 chrome.tabs.onRemoved fires before envelope save

**Scenario:** User opens tab A, sends message (lazy mint), then immediately closes tab A before the lazy-mint write commits. `onRemoved(A)` fires and tries to drop entry that hasn't been written yet.

**Defense:** `dropTabConversation` is a no-op on missing entries (Map.delete on absent key + Array.indexOf returns -1). The write race is harmless: either (a) lazy-mint writes first, then drop succeeds and removes entry, OR (b) drop runs first as no-op, then lazy-mint writes the entry which is then orphaned. Case (b) leaves an orphan entry; the next boot's tab existence check in migration helper OR the LRU cap eviction will eventually reap it.

**Recommended hardening:** during `chrome.tabs.onRemoved`, also call `chrome.storage.session.remove('mcpVisualSession:' + tabId)` to clean up the lifecycle entry — this is already done by `handleVisualSessionLifecycleTabRemoved` at lifecycle.js:464-466 in the SW path; Phase 11's sidepanel-side drop is parallel and safe.

### 7.3 User has 51+ tabs open with conversations (LRU eviction trigger)

**Scenario:** User chats in 51 different tabs without closing any. The 51st `ensureTabConversation` call triggers LRU eviction of the least-recently-accessed tab.

**Defense:** `_enforceLruCap` runs synchronously inside `ensureTabConversation` AFTER the new entry is added (Section 4 pseudocode). The new entry survives; the LRU-tail tab loses its conversation. If the user switches back to the evicted tab, `getTabConversation` returns null, and on first message a fresh `conversationId` is minted (D-17 lazy mint). The previous conversation is lost from the side panel view, but the underlying FSB session-history view (aggregated by `sessionId` from the existing FSB sessions store per D-14) still has it.

**Smoke assertion:** write 51 conversations, assert byTab has exactly 50 entries, assert the FIRST written tab is gone, assert the 51st is present.

### 7.4 Lifecycle entry has client value NOT in the allowlist

**Scenario:** A pre-Phase-10 lifecycle entry survives SW restart with `entry.client === 'SomeRandomLabel'` that's not in the 14-entry allowlist.

**Defense:** `recordVisualSessionTick` at lifecycle.js:325-333 calls `normalizeMcpVisualClientLabel(fields.client)` BEFORE writing the entry, and returns `'client_not_allowed'` if normalization fails — so a non-allowlisted client never enters storage. However, defensive paranoia: `lookupClientLabel` should still validate the returned `entry.client` is a non-empty string (it does per the implementation in Section 1.A). If a malformed client value survives somehow, fall through to short-prefix.

**Recommendation:** `lookupClientLabel` does NOT need to re-validate against the allowlist — that would couple owner-chip.js to mcp-visual-session.js. The existing `normalizeMcpVisualClientLabel` write-side gate is the primary defense; `lookupClientLabel` is a trust-but-verify-shape consumer.

### 7.5 Tab discarded then restored (entry preservation verified)

**Scenario:** Chrome's memory pressure auto-discards a background tab. The discarded tab's tabId persists; when Chrome restores it, the same tabId is reused.

**Defense (D-15):** `chrome.tabs.onDiscarded` is NOT subscribed. The entry stays in `fsbSidepanelTabConversations` untouched. When the tab becomes active again, `chrome.tabs.onActivated` fires with the SAME tabId, `swapToTabConversation` finds the entry, and the conversation restores.

**Smoke pattern:** simulate by writing an entry for tab 999, do NOT fire onDiscarded, fire onActivated(999), assert the conversationId matches the original.

### 7.6 First-time tab open with no prior entry (lazy mint)

**Scenario:** User opens a new tab. `chrome.tabs.onActivated` fires with the new tabId. The user sees the empty chat surface.

**Defense (D-17):** `swapToTabConversation` calls `getTabConversation` (NOT `ensureTabConversation`). If null is returned, set `conversationId = null` and clear `chatMessages`. The user's first message triggers `ensureTabConversation` which mints + persists + renders.

```js
async function swapToTabConversation(tabId) {
  await _envelopeReadyPromise;
  const newConvId = getTabConversation(tabConvEnvelope, tabId);
  if (newConvId === conversationId) return;  // no-op same tab
  conversationId = newConvId;  // null OK for empty
  chatMessages.innerHTML = '';
  if (conversationId) {
    // Render message history for this conversation
    await _renderConversationHistory(conversationId);
  }
}
```

### 7.7 Send button race — user clicks Send while tab-activation handler still resolving

**Scenario:** User on tab A presses Send rapidly while switching to tab B. The onActivated handler is mid-flight; envelope state is updating.

**Defense:** Two layers:
1. **handleSendMessage uses the LATEST active tab query:** `const [tab] = await chrome.tabs.query({active: true, currentWindow: true});` — this resolves to whichever tab is active AT THE TIME OF QUERY, not the tab at click time. The conversation is bound to the current active tab.
2. **Write serialization via `_withEnvelopeWrite`:** if onActivated's `swapToTabConversation` and handleSendMessage's `ensureTabConversation` both fire, they linearize. Whichever runs first wins; the second sees the up-to-date envelope.

**Edge case within edge case:** if the user clicks Send AND switches tabs in the same microtask, the message will be sent to whichever tab `chrome.tabs.query` returns. This matches existing FSB behavior (the chatInput value belongs to the user's intent at click time; the target tab follows query resolution). Document this as a known quirk; no additional defense needed.

## Section 8: Validation Architecture (Nyquist Dimension 8)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node-native test pattern (assert + console PASS/FAIL counter; matches every FSB smoke test) |
| Config file | none — each test file is self-contained |
| Quick run command | `node tests/sidepanel-tab-awareness-smoke.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FINT-19 | `lookupClientLabel(tabId, mockStorageReadFn)` resolves entry.client when lifecycle entry present | unit | `node tests/sidepanel-tab-awareness-smoke.test.js` (Part 1) | Wave 0 creates |
| FINT-19 | `lookupClientLabel` returns null on missing/malformed entry | unit | same | Wave 0 |
| FINT-19 | Three-tier resolution: legacy:* → entry.client → short-prefix | unit | same (Part 2) | Wave 0 |
| FINT-19 | popup.js + sidepanel.js source-level: both wire `lookupClientLabel` | static | same (Part 2.x) | Wave 0 |
| FINT-20 | `applyInputLockout(true)` sets disabled + aria-disabled on 4 controls | unit (jsdom-less DOM stub) | same (Part 3) | Wave 0 |
| FINT-20 | `applyInputLockout(false)` clears flags | unit | same (Part 3) | Wave 0 |
| FINT-20 | sidepanel.js source-level: handleSendMessage gates on `_isActiveTabForeignOwned` | static | same (Part 4) | Wave 0 |
| FINT-20 | CSS source-level: `.fsb-foreign-owned-disabled` class defined in sidepanel.css | static | same (Part 4) | Wave 0 |
| FINT-21 | Envelope schema: ensureTabConversation lazy-mints on first call | unit | same (Part 5) | Wave 0 |
| FINT-21 | Envelope schema: same tabId returns same conversationId on second call | unit | same (Part 5) | Wave 0 |
| FINT-21 | LRU eviction: writing 51 entries leaves 50 with oldest evicted | unit | same (Part 5) | Wave 0 |
| FINT-21 | dropTabConversation removes from byTab AND lru | unit | same (Part 5) | Wave 0 |
| FINT-21 | migrateLegacyConversationKey preserves legacy convId under active tabId | unit | same (Part 6) | Wave 0 |
| FINT-21 | sidepanel.js + sidepanel.html source-level wiring | static | same (Part 6) | Wave 0 |
| INV-04 | setTimeout count = 8 in agent-loop.js | byte-freeze | same (Part 7) | Wave 0 |
| INV-04 | 4 iterator patterns intact | byte-freeze | same (Part 7) | Wave 0 |
| INV-04 | No Phase 11 token inside any setTimeout lambda body | byte-freeze | same (Part 7) | Wave 0 |
| INV-06 | LATTICE-PIN.md current_lattice_sha unchanged | byte-freeze | same (Part 7) | Wave 0 |

### Sampling Rate
- **Per task commit:** `node tests/sidepanel-tab-awareness-smoke.test.js`
- **Per wave merge:** `npm test` (full chain; ~5-10 min)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/sidepanel-tab-awareness-smoke.test.js` — new file; covers all FINT-19/20/21 + INV regression
- [ ] `extension/ui/sidepanel-tab-conv-store.js` — new sidecar pure-helper module (per recommendation in Section 1.C)
- [ ] Optional: extend existing `tests/owner-chip.test.js` with 5 new assertions for `lookupClientLabel` rather than creating a separate file

### Expected Test Counts (comparison to similar FSB phases)

| Phase | Smoke file | Final PASS count | Source |
|-------|-----------|------------------|--------|
| Phase 6 | lattice-provider-bridge-smoke | 85 | Plan 06-05 |
| Phase 8 | lattice-step-emitter-smoke | 38 | Plan 08-02 |
| Phase 9 | lattice-survivability-smoke | 72 | Plan 09-02 |
| Phase 10 | mcp-philosophy-parity-smoke | 36 | Plan 10-03 |

**Phase 11 target: 25-35 PASS by Plan 11-03 end** — Phase 11 is UI-scope so simpler than the Lattice-side phases. Realistic distribution:
- Part 1 (lookupClientLabel happy path + nulls): 6 PASS
- Part 2 (three-tier resolution + source-level wiring): 5 PASS
- Part 3 (applyInputLockout DOM mutation): 4 PASS
- Part 4 (runtime gate + CSS source-level): 4 PASS
- Part 5 (envelope CRUD + LRU): 6 PASS
- Part 6 (migration helper): 3 PASS
- Part 7 (INV-04 + INV-06 byte-freeze): 4 PASS

**Total estimate: 32 PASS.** Plan 11-00 scaffolds 6 PASS-when-empty placeholders; subsequent plans fill them.

### Node-side DOM mocking pattern

`applyInputLockout` mutates DOM. In Node tests, we mock `document.getElementById` to return a stub object that records attribute changes:

```js
function createDomStub(idMap) {
  return {
    getElementById(id) {
      if (!idMap[id]) return null;
      return idMap[id];
    }
  };
}
function createButtonStub() {
  const attrs = {};
  return {
    tagName: 'BUTTON',
    disabled: false,
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    classList: { add(c) { attrs._class = (attrs._class || []).concat(c); }, remove(c) { attrs._class = (attrs._class || []).filter(x => x !== c); } },
    _attrs: () => attrs
  };
}
// Test fixture: stub chatInput + sendBtn + stopBtn + micBtn; install on global.document
global.document = createDomStub({
  chatInput: { tagName: 'DIV', setAttribute, removeAttribute, classList, _attrs },
  sendBtn: createButtonStub(),
  // ...
});
```

This avoids jsdom dependency (FSB does not currently use it; introducing it would be a larger scope change).

### chrome.tabs / chrome.storage.session mock pattern

Already established in FSB tests — copy verbatim from `tests/mcp-visual-tick-lifecycle.test.js:58-92` (chrome.storage mock with `_dump()` introspection) and `tests/agent-registry.test.js:91-100` (chrome.tabs mock with onRemoved listener registry).

## Section 9: Common Pitfalls

### Pitfall 1: Cache invalidation hell on lifecycle entry reads
**What goes wrong:** A maintainer adds an in-memory cache to `lookupClientLabel` "for performance" without invalidation on `chrome.storage.onChanged` — chip displays stale label when a tab transfers from one MCP client to another.
**Why it happens:** Storage reads feel slow; cache feels safe.
**How to avoid:** Per D-08, NO cache layer. `chrome.storage.session.get` is ~1ms. Document this as a permanent design decision in the helper's JSDoc.
**Warning signs:** PR introducing `_labelCache = new Map()` or `chrome.storage.onChanged.addListener`.

### Pitfall 2: Forgetting to clear chatMessages on tab swap
**What goes wrong:** User switches from tab A (mid-conversation) to tab B (mid-different-conversation). The chip updates but the chat messages still show tab A's content.
**Why it happens:** `refreshOwnerChip` and `swapToTabConversation` are called as two separate steps inside the onActivated handler; if a future maintainer adds chip-only refreshes elsewhere they forget the conversation swap.
**How to avoid:** Co-locate chip refresh + conversation swap inside a single `onTabActivated(activeInfo)` wrapper. Document the coupling.
**Warning signs:** Multiple chrome.tabs.onActivated.addListener calls in sidepanel.js.

### Pitfall 3: Disabled state lingers after foreign agent releases tab
**What goes wrong:** Foreign agent finishes and releases the tab. The agent registry envelope clears, but the side panel's disabled-state classes don't get cleared because `refreshOwnerChip` is only triggered on tab activation, not on chrome.storage.onChanged of fsbAgentRegistry.
**Why it happens:** The chrome.storage.onChanged listener at sidepanel.js:220-232 already triggers `refreshOwnerChip` for `fsbAgentRegistry` mutations — but Phase 11 needs to ensure `applyInputLockout` is also called inside that path. The existing code only updates the chip text.
**How to avoid:** Centralize chip + lockout into a single `refreshTabOwnership()` function that calls both refreshOwnerChip and applyInputLockout based on a shared computed `isForeignOwned` boolean. Wire both onActivated AND onChanged to that function.
**Warning signs:** Lockout sticky after release; user reports "I can't type even though no agent is shown".

### Pitfall 4: Per-tab envelope grows unboundedly under heavy LRU pressure
**What goes wrong:** Power user with 100+ tabs opens/closes tabs frequently. Each open triggers lazy mint + LRU touch + cap enforcement; the lru array thrashes.
**Why it happens:** LRU enforcement runs on every `ensureTabConversation` call (every send + every tab activation that already has an entry). Quadratic patterns in `_touchLru` (array.indexOf + splice) become noticeable above 50 entries.
**How to avoid:** O(50) lookups are negligible (1µs typical). Don't pre-optimize. But DO assert via smoke that 100 sequential operations don't exceed any reasonable wall-clock budget (5ms aggregate).
**Warning signs:** Profiling shows lookup time growing linearly with envelope size.

### Pitfall 5: Migration helper double-writes legacy convId across multiple sidepanel instances
**What goes wrong:** User has TWO Chrome windows open, each with its own sidepanel. Both sidepanel instances run `migrateLegacyConversationKey` concurrently. Both read the legacy key, both bind it to their respective active tab, then both delete the legacy key.
**Why it happens:** chrome.storage.session is shared across all extension contexts; race is real.
**How to avoid:** Migration is idempotent — if both sidepanels write the same envelope shape, the second write overwrites the first with the same data. The legacy key delete is also idempotent. The worst case is the legacy convId gets bound to ONE active tab (whichever sidepanel runs last); the OTHER sidepanel's user starts fresh on their active tab. Acceptable.
**Warning signs:** None — the race is benign by design.

## Section 10: Recommended Plan Breakdown

### Wave 0 (Plan 11-00): Smoke scaffold + sidecar module extraction

**Deliverables:**
- New `tests/sidepanel-tab-awareness-smoke.test.js` with 7 Part placeholders that each PASS-when-empty (each part emits 1 PASS log even before content fills it) so the &&-chain stays green.
- New `extension/ui/sidepanel-tab-conv-store.js` pure-helper module exporting: `migrateLegacyConversationKey`, `ensureTabConversation`, `getTabConversation`, `dropTabConversation`, `_enforceLruCap` (private; exposed for testing).
- `package.json` `scripts.test` chain extended with the new smoke as final entry.
- Sidepanel.html script-tag chain extended with `<script src="sidepanel-tab-conv-store.js"></script>` AFTER `owner-chip.js`.

**Rationale:** Wave 0 establishes the test harness + the testable module. No production wiring; sidepanel.js unchanged. Wave 0 lands without any UX-visible change; ensures CI green.

**INV gates:** byte-freeze regression assertions go in Part 7 from day 1; subsequent plans cannot regress.

### Wave 1 (Plan 11-01): Owner-chip friendly label (FINT-19)

**Deliverables:**
- Extend `extension/ui/owner-chip.js` with `lookupClientLabel` async helper + dual export.
- Modify `extension/ui/sidepanel.js` `refreshOwnerChip` (line ~242) to implement three-tier resolution.
- Modify `extension/ui/popup.js` `refreshOwnerChip` (line ~107) identically.
- Smoke Part 1 (lookupClientLabel unit tests) + Part 2 (three-tier + source-level wiring) filled — 11 PASS.

**Rationale:** FINT-19 is fully orthogonal to FINT-20 and FINT-21; landing it first lets the user see friendly labels immediately. Risk = low (helper is pure; refresh extension is additive to the existing pattern).

**Dependencies:** Wave 0 only (smoke scaffold + sidecar module).

### Wave 2 (Plan 11-02): Foreign-owned input lockout (FINT-20)

**Deliverables:**
- Modify `extension/ui/sidepanel.js`: add `applyInputLockout` + `_isActiveTabForeignOwned` helpers; wire into `refreshOwnerChip`; add defense-in-depth gate at `handleSendMessage` entry.
- Modify `extension/ui/sidepanel.css`: add `.fsb-foreign-owned-disabled` rule + `.fsb-owner-chip` baseline styling (covers the discovered missing CSS gap).
- Modify `extension/ui/sidepanel.html`: add aria-describedby + hidden description span for screen-reader semantics.
- Smoke Parts 3+4 (lockout DOM mutation + runtime gate + CSS source-level) filled — 8 PASS.

**Rationale:** Builds on Wave 1's `refreshOwnerChip` extension point. The chip + lockout are visually paired (chip explains, lockout enforces). Landing them together is coherent UX.

**Dependencies:** Wave 1 (refreshOwnerChip already extended).

### Wave 3 (Plan 11-03): Per-tab conversation state model (FINT-21)

**Deliverables:**
- Wire `initTabConversationStore` into DOMContentLoaded boot path; replace `initConversationId`.
- Add `swapToTabConversation` + `dropTabConversation` event handlers; wire into chrome.tabs.onActivated (extend existing) + onRemoved (new subscription).
- Update `handleSendMessage` to call `ensureTabConversation(tab.id)` for lazy mint.
- Update `startNewChat` to mint via `ensureTabConversation` rather than direct mint.
- Smoke Parts 5+6 (envelope CRUD + LRU + migration) filled — 9 PASS.

**Rationale:** FINT-21 is the most-complex of the three; lands last so the test harness + sidecar module + chip surfaces are stable. Migration helper protects existing users (preserves their legacy conversation under the active tab).

**Dependencies:** Wave 0 (sidecar module) + Wave 1+2 (refreshOwnerChip already extended; no conflicts).

### Wave 4 (Plan 11-04): Ceremony closure

**Deliverables:**
- `.planning/REQUIREMENTS.md`: add FINT-19/20/21 narrative entries + traceability rows; Total v1 footer bump 41 → 44; Last updated bump to 2026-06-07.
- `.planning/LATTICE-PIN.md`: append Phase 11 row with `current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`; cite Section 2 binary INV-06 NO verdict.
- `.planning/v0.10.0-MILESTONE-AUDIT.md`: append `phase_11_shipped` status_history entry; reference UAT-11 deferred to consolidated UAT alongside UAT-08+09+10.
- ZERO production code touched.

**Rationale:** Ceremony plans match Phase 8/9/10 precedent. UAT-11 procedure documented in `11-VERIFICATION.md` per D-22; verifier emits `human_needed`.

**Dependencies:** Plans 11-01 + 11-02 + 11-03 production code complete.

### Plan Order Rationale

```
Plan 11-00 (Wave 0) → Plan 11-01 (Wave 1) → Plan 11-02 (Wave 2) → Plan 11-03 (Wave 3) → Plan 11-04 (Wave 4)
       scaffold              chip                    lockout                 history                 ceremony
```

**Why strict sequential** (not parallel):
- Smoke file is shared across all plans (each fills different Parts).
- Plans 11-01 + 11-02 both modify `refreshOwnerChip` in sidepanel.js — a parallel branch would race.
- Plan 11-03 modifies `handleSendMessage` AND `startNewChat` AND boot path — touches lines already-modified by Plan 11-02.

**Parallel opportunity (NOT recommended):** Plan 11-01 chip work could theoretically parallel Plan 11-03 history work since they touch different code regions, but the smoke file race + the FSB precedent (Phases 6/8/9/10 all ran sequentially) argue for strict ordering.

## Environment Availability

> This phase has no NEW external dependencies. All required Chrome APIs (`chrome.tabs.onActivated`, `chrome.tabs.onRemoved`, `chrome.storage.session.get/set/remove`, `chrome.runtime.sendMessage`) are already in use by FSB and available in Chrome MV3 production builds.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| chrome.tabs.onActivated | Tab switch handler | ✓ | MV3 | — |
| chrome.tabs.onRemoved | Tab close handler | ✓ | MV3 | — |
| chrome.storage.session | Envelope persistence | ✓ | MV3 (Chrome 102+) | — |
| chrome.runtime.sendMessage | Existing send path (unchanged) | ✓ | MV3 | — |
| Node test runner (node) | Smoke tests | ✓ | (Node 18+) | — |
| MCP_VISUAL_CLIENT_LABELS allowlist | Friendly label source | ✓ | Phase 10 baseline (14 entries) | Short-prefix fallback |
| `fsbAgentRegistry` storage key | Owner resolution | ✓ | Phase 237/240 baseline | None — required |
| `mcpVisualSession:<tabId>` storage keys | Lifecycle entry source | ✓ | Phase 256 baseline | Short-prefix fallback when absent |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all required APIs and data sources are present.

## Validation Architecture

(Covered in detail in Section 8.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node-native assert + PASS/FAIL counter (FSB convention) |
| Config file | none |
| Quick run command | `node tests/sidepanel-tab-awareness-smoke.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
See Section 8 table — 14 distinct behaviors mapped to 7 Parts.

### Sampling Rate
- **Per task commit:** Quick run.
- **Per wave merge:** Full suite.
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/sidepanel-tab-awareness-smoke.test.js` — new file (Plan 11-00 creates)
- [ ] `extension/ui/sidepanel-tab-conv-store.js` — new sidecar module (Plan 11-00 creates)
- [ ] DOM stub helper utility (inline in test file; not extracted to shared module)

## Security Domain

> The FSB project does not have `security_enforcement: false` set, so this section applies. Phase 11 is a UI-state phase with no auth, crypto, or input-validation surface that introduces new attack vectors.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 11 introduces no auth |
| V3 Session Management | no | Phase 11 reuses existing conversationId format; not a session token |
| V4 Access Control | partial | Foreign-owned input lockout IS an access-control surface (UI-level only; defense-in-depth) |
| V5 Input Validation | yes | `lookupClientLabel` validates entry.client shape; envelope round-trip validates v:1 literal |
| V6 Cryptography | no | No new crypto; conversationId format unchanged from Phase 243 |

### Known Threat Patterns for FSB sidepanel surface

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| UI bypass: user uses popup or new tab while sidepanel is locked | Spoofing | Accepted per D-12 — popup remains available as intentional escape hatch |
| Storage tampering: attacker mutates `fsbSidepanelTabConversations` via DevTools | Tampering | Envelope schema validation (v:1 check) + defensive shape checks in helpers; treats unrecognized envelope as `{v:1, byTab:{}, lru:[]}` baseline |
| LRU thrashing as DoS: 1000+ tab opens to evict legitimate conversations | Denial of Service | Cap=50 + lazy mint (only persisted on first message) — attacker cannot force eviction of recently-USED conversations; user-controlled rate-limit |
| Conversation hijack via tabId collision after browser restart | Spoofing | tabIds reset per Chrome session; envelope is in chrome.storage.session which is also session-scoped — no cross-session contamination |
| chip XSS via malformed entry.client | Injection | `chipEl.textContent = ...` (NOT innerHTML); ensures text-only render regardless of entry.client content |

**XSS verification:** the existing chip render at sidepanel.js:273 already uses `.textContent` (not `.innerHTML`); Phase 11 preserves this safe pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `chrome.tabs.onActivated` fires during sidepanel boot AFTER listener registration but possibly BEFORE DOMContentLoaded completes | 5 | Race window timing; mitigated by `_envelopeReadyPromise` gate regardless |
| A2 | Chrome.storage.session writes are atomic per key (no torn writes within a single key) | 7.1 | Tornd writes corrupt envelope; mitigated by version-literal check + fallback to baseline envelope |
| A3 | `chatMessages` div clearing + re-rendering from chrome.runtime.sendMessage('loadSession') is the established pattern for history-view swap | 1.C | Wrong mechanism would invalidate Plan 11-03 implementation; planner verifies in-session before implementing |
| A4 | `.fsb-owner-chip` CSS class is undefined anywhere in the project (verified via grep) | 6 | If a future check finds it defined elsewhere, Plan 11-02 styling rules might collide; smoke verifies pre-edit baseline |
| A5 | Phase 11 plan count of 4 is realistic given the precedent of Phase 8 (3 plans), Phase 9 (3 plans), Phase 10 (3 plans) all delivering similar-complexity sidecar work in 3 plans | 10 | Could compress to 3 plans by merging 11-02 + 11-03 (lockout + history both wire into refreshOwnerChip path), but separation aids review |

**No CRITICAL assumptions:** All claims tagged are either verified (A2-A4) or low-risk timing (A1, A5).

## Open Questions (RESOLVED)

> All three questions resolved in favor of the SIMPLEST viable implementation per Phase 11 scope. Plans 11-01 through 11-04 implement these resolutions; no further design iteration required.

1. **RESOLVED — No chatMessages auto-render of NEW (unbound) tabs on swap; bound-conversation tabs DO restore.** `chatMessages` clears on swap to a tab with no bound conversationId (D-17 lazy mint deferred); for tabs whose conversationId IS bound, the swap path now hydrates the prior transcript from `fsbSessionLogs` so the user sees the conversation they had with that tab. Rationale: the original RESOLVED #1 leaned on "first send re-builds via existing addMessage path," but the per-tab envelope already records which tabs the user has conversed in — those tabs SHOULD restore on swap because not doing so is functionally identical to the boot-reopen-empty UX bug (`debug-phase-11-sidepanel-reopen-empty`). The FSB session-history view (`historyBtn` + `historyListEl`) remains the cross-tab aggregation surface for sessions that span multiple conversations.
   - Implementation: Plan 11-03 Task 1 `swapToTabConversation(tabId)` updates module-scope `conversationId` AND (post-fix debug-phase-11-sidepanel-reopen-empty) calls `hydrateChatFromConversationId(nextConvId)` when the next tab has a bound conversation. Unminted tabs still leave chatMessages empty (D-17 lazy mint preserved). The next user send mints (or uses existing) conversationId for that tab.

2. **RESOLVED — No `chrome.storage.onChanged` listener for `mcpVisualSession:<tabId>` keys.** Phase 11 chip + lockout fires on `chrome.tabs.onActivated` only (existing handler at sidepanel.js:288). The existing `chrome.storage.onChanged` listener at sidepanel.js:220-232 covers `fsbAgentRegistry` changes (which trigger chip refresh on agent registration/release). Adding a second prefix listener for `mcpVisualSession:` is out of Phase 11 scope per the surface-lockout contract (Phase 11 touches sidepanel.js + owner-chip.js + popup.js + sidepanel.html + sidepanel.css + new sidecar; the listener-prefix change would expand the surface). Rationale: the live-update of friendly-label-during-active-foreign-agent is a polish; the chip already updates correctly on tab switch and on owner change via the registry watcher.
   - Implementation: Plans 11-01 + 11-02 wire chip resolution + lockout into the existing `chrome.tabs.onActivated` + `chrome.storage.onChanged` listeners; no NEW prefix watcher added.

3. **RESOLVED — Migration binds conversationId AND boot hydrates the chat surface from the bound conversation's session log.** The boot-time migration in Plan 11-03's `initTabConversationStore` reads the legacy `fsbSidepanelConversationId` key, writes the conversationId into the per-tab envelope under the active tabId, deletes the legacy key, and sets the module-scope `conversationId` to that value. Sidepanel boot (post-fix debug-phase-11-sidepanel-reopen-empty) then calls `hydrateChatFromConversationId(conversationId)` to replay the conversation's prior `commands[]` (user prompts) + `completionMessage` (ai messages) from `fsbSessionLogs`. The welcome message is suppressed when prior content hydrates. Rationale: the original RESOLVED #3 assumed "the existing post-migration boot path already restores the chat surface from the session store via the existing handler chain," but no such handler chain was wired (the `recoverLatestThreadTerminalOutcome` scaffolding was dead code, never called, referencing undeclared state). The hydrate path corrects this assumption while remaining behavior-preserving for fresh boots (welcome shows on empty conversations) and idempotent (storage failures degrade silently).
   - Implementation: Plan 11-03 Task 1 migration helper unchanged. New `hydrateChatFromConversationId(convId)` function lives in sidepanel.js and queries `fsbSessionLogs` + `fsbSessionIndex` keyed by conversationId, sorts ascending by startTime, replays commands + completionMessage per row. DOMContentLoaded invokes it after `initTabConversationStore` and skips the welcome banner when rendered count > 0.

## Standard Stack

### Core (FSB-side, already loaded via sidepanel.html script tags)

| Module | Purpose | Phase 11 Touch |
|--------|---------|---------------|
| `extension/ui/owner-chip.js` | Pure helpers (shouldShowOwnerChip, ownerLabelFor, findOwnerInEnvelope, buildChipText) | ADD `lookupClientLabel` async helper |
| `extension/ui/sidepanel.js` | Sidepanel boot + refreshOwnerChip + handleSendMessage + chrome.tabs handlers | EXTEND refreshOwnerChip, ADD applyInputLockout + _isActiveTabForeignOwned, REPLACE initConversationId, ADD onRemoved handler |
| `extension/ui/sidepanel.html` | DOM structure + script-tag chain | ADD new sidecar script tag, ADD hidden description span for aria-describedby |
| `extension/ui/sidepanel.css` | Visual styling | ADD `.fsb-foreign-owned-disabled` + `.fsb-owner-chip` baseline |
| `extension/ui/popup.js` | Popup boot + refreshOwnerChip | EXTEND refreshOwnerChip identically (D-09) |
| `extension/ui/popup.html` | Popup DOM | UNCHANGED |
| `extension/ui/sidepanel-tab-conv-store.js` | **NEW** sidecar pure-helper module | CREATE (envelope CRUD + LRU + migration) |
| `tests/sidepanel-tab-awareness-smoke.test.js` | **NEW** real-runtime Node smoke | CREATE (7 Parts; 32 PASS target) |

### Supporting (read-only references; no modifications)

| Module | Used For | Why Not Touched |
|--------|----------|------------------|
| `extension/utils/agent-registry.js` | `formatAgentIdForDisplay` (Tier 3 fallback) | Read via existing global on sidepanel surface; no API change needed |
| `extension/utils/mcp-visual-session-lifecycle.js` | Storage key prefix `mcpVisualSession:` + `entry.client` field | Read via storage key only; Phase 11 inlines the prefix literal |
| `extension/utils/mcp-visual-session.js` | 14-entry allowlist | Phase 11 trusts pre-normalized `entry.client`; no direct allowlist consultation needed |
| `extension/ai/agent-loop.js` | INV-04 byte-freeze target | OFF LIMITS — Phase 11 does not touch |
| `extension/background.js` | SW load order | OFF LIMITS — sidepanel changes don't require manifest or SW changes |
| `lattice/` directory | INV-06 byte-freeze | OFF LIMITS — zero Lattice surface |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sidecar `extension/ui/sidepanel-tab-conv-store.js` module | Inline private functions in sidepanel.js | Module-scope isolation lost; bloats sidepanel.js further |
| Sidecar module | Re-export from `extension/utils/agent-registry.js` | Couples sidepanel state to registry-domain concerns |
| `chrome.storage.session` envelope | `chrome.storage.local` for cross-session persistence | Per D-15 + INV expectations, session-scoped is intentional |
| `chrome.storage.session.get(null)` for migration scan | Per-key reads | Faster for known-key fetch; we know both keys by name |

## Architecture Patterns

### Recommended Project Structure (Phase 11 file additions)
```
extension/
├── ui/
│   ├── owner-chip.js                    # extended with lookupClientLabel
│   ├── sidepanel.js                     # extended with lockout + per-tab handlers
│   ├── sidepanel.html                   # +1 sidecar script tag
│   ├── sidepanel.css                    # +new .fsb-foreign-owned-disabled + .fsb-owner-chip rules
│   ├── sidepanel-tab-conv-store.js      # NEW sidecar module
│   ├── popup.js                         # mirror refreshOwnerChip changes (chip only)
│   └── popup.html                       # UNCHANGED

tests/
└── sidepanel-tab-awareness-smoke.test.js  # NEW
```

### Pattern 1: IIFE-wrapped dual-export pure helper

Used by `owner-chip.js`, `agent-registry.js`, `mcp-visual-session.js`. Phase 11 sidecar module follows the SAME pattern:

```js
// Source: extension/ui/owner-chip.js:30-119 (canonical FSB pattern)
(function(global) {
  'use strict';
  function lookupClientLabel(tabId, storageReadFn) { /* ... */ }
  function ensureTabConversation(envelope, tabId, mintFn) { /* ... */ }
  // ... other helpers

  var exportsObj = {
    lookupClientLabel: lookupClientLabel,
    ensureTabConversation: ensureTabConversation,
    // ...
  };
  global.FSBSidepanelTabConvStore = exportsObj;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

### Pattern 2: Versioned storage envelope (FSB-canonical)

Pattern observed in `agent-registry.js` (`{v:1, records: {...}}`), `mcp-visual-session-lifecycle.js` (per-tab entries under prefix keys), Phase 9 `lattice-runtime-adapter.js` (`fsb_lattice_snapshot_<sessionId>_<capturedAt>`).

Phase 11 mirrors the agent-registry pattern exactly: single key, version literal at root, records map keyed by id. The `lru` field is the only addition specific to Phase 11.

### Pattern 3: chrome.tabs.onActivated handler chain

Existing pattern at sidepanel.js:285-294 wraps the listener registration in a feature-detection guard for Node test compatibility:

```js
try {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated
      && typeof chrome.tabs.onActivated.addListener === 'function') {
    chrome.tabs.onActivated.addListener(() => { refreshOwnerChip(); });
  }
} catch (_e) { /* swallow */ }
```

Phase 11 extends the existing listener body; does NOT register a second listener.

### Anti-Patterns to Avoid

- **chrome.storage.onChanged listeners with no early-return.** A listener firing on EVERY storage change in any area triggers unnecessary refresh work. Phase 11's listeners must filter by area + key prefix.
- **DOM mutation inside chrome.runtime.onMessage handlers.** Race risk; the sidepanel's runtime.onMessage handlers should set state flags read by the next animation frame, not mutate DOM directly.
- **Multiple sources of truth for active tab id.** The active tab is determined ONCE per refresh cycle via `chrome.tabs.query({active: true, currentWindow: true})`; do NOT cache `activeTabId` in module scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU eviction logic | Custom min-heap or doubly-linked list | Array-based head/tail (Section 4 pseudocode) | 50-entry array operations are <1µs; complexity adds bug surface |
| Storage envelope migration | Multi-version schema with discriminated unions | Single `v:1` literal check + fallback to baseline | Phase 11 has ONE schema version; future migrations add v:2 then |
| Lifecycle entry validation | Re-import normalizeMcpVisualClientLabel into owner-chip.js | Trust the write-side gate at lifecycle.js:325-333 | Maintains layer isolation; the upstream gate is the source of truth |
| Per-tab conversationId minting | Crypto-strong UUIDs | Existing `conv_<timestamp>_<rand>` format (sidepanel.js:52) | Format already used everywhere; collision-resistant for human-scale tab counts |
| chrome.tabs availability detection | Custom feature flags | Existing try/catch + typeof guard pattern (sidepanel.js:285-294) | Established FSB convention; works in both browser and Node test |

**Key insight:** Phase 11 reuses existing FSB patterns at every decision point — IIFE module shape, envelope versioning, LRU eviction, listener registration, defensive guards. The "new" code is ~80% pattern application, ~20% Phase 11-specific glue.

## Common Pitfalls (Cross-reference)

The 5 historic gotchas from prior FSB UI work that Phase 11 must defend against are detailed in Section 9 above. Repeating titles here for quick reference:

1. Cache invalidation hell on lifecycle entry reads
2. Forgetting to clear chatMessages on tab swap
3. Disabled state lingers after foreign agent releases tab
4. Per-tab envelope grows unboundedly under heavy LRU pressure
5. Migration helper double-writes legacy convId across multiple sidepanel instances

## Code Examples

### Example 1: lookupClientLabel canonical implementation

```js
// Source: Phase 11 FINT-19 (per Section 1.A)
async function lookupClientLabel(tabId, storageReadFn) {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId <= 0) return null;
  if (typeof storageReadFn !== 'function') return null;
  const key = 'mcpVisualSession:' + tabId;
  try {
    const bag = await storageReadFn(key);
    const entry = bag && bag[key];
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.client !== 'string' || entry.client.trim().length === 0) return null;
    return entry.client.trim();
  } catch (_e) {
    return null;
  }
}
```

### Example 2: refreshTabOwnership combined helper

```js
// Source: Phase 11 (combines FINT-19 chip + FINT-20 lockout into single call)
async function refreshTabOwnership() {
  try {
    const chipEl = document.getElementById('fsb-owner-chip');
    if (!chipEl) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') {
      chipEl.style.display = 'none';
      applyInputLockout(false);
      return;
    }
    const stored = await chrome.storage.session.get('fsbAgentRegistry');
    const ownerAgentId = FSBOwnerChip.findOwnerInEnvelope(stored?.fsbAgentRegistry, tab.id);
    const isForeignOwned = FSBOwnerChip.shouldShowOwnerChip(ownerAgentId, MY_SURFACE);

    if (!isForeignOwned) {
      chipEl.textContent = '';
      chipEl.style.display = 'none';
      applyInputLockout(false);
      return;
    }

    // Three-tier label resolution (FINT-19)
    let label;
    if (ownerAgentId.indexOf('legacy:') === 0) {
      label = ownerAgentId;
    } else {
      const friendly = await FSBOwnerChip.lookupClientLabel(
        tab.id, (key) => chrome.storage.session.get(key)
      );
      if (friendly) {
        label = friendly;
      } else {
        const formatter = (typeof FsbAgentRegistry !== 'undefined' && typeof FsbAgentRegistry.formatAgentIdForDisplay === 'function')
          ? FsbAgentRegistry.formatAgentIdForDisplay : null;
        label = FSBOwnerChip.ownerLabelFor(ownerAgentId, formatter);
      }
    }
    chipEl.textContent = FSBOwnerChip.buildChipText(label);
    chipEl.style.display = 'inline-flex';

    // Input lockout (FINT-20)
    applyInputLockout(true);
  } catch (_e) { /* best-effort; never poison boot */ }
}
```

### Example 3: chrome.tabs.onActivated extended handler

```js
// Source: Phase 11 — combined chip + history swap on tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await _envelopeReadyPromise;          // wait for boot migration
    await refreshTabOwnership();          // chip + lockout (FINT-19 + 20)
    await swapToTabConversation(activeInfo.tabId);  // history swap (FINT-21)
  } catch (_e) { /* swallow */ }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `fsbSidepanelConversationId` chrome.storage.session key | Versioned envelope `{v:1, byTab, lru}` under `fsbSidepanelTabConversations` | Phase 11 | Per-tab isolation; LRU bounded |
| `owned by agent_a3f8b1` chip text | `owned by OpenClaw` (or Claude / Cursor / FSB Autopilot per allowlist) | Phase 11 | Human-readable; matches user mental model |
| Side panel always allows input | Foreign-owned tabs lock input controls | Phase 11 | Prevents accidental cross-agent messages |
| `chrome.tabs.onActivated` only refreshes chip | Also swaps chat history + applies lockout | Phase 11 | Tab-aware UX coherence |

**Deprecated/outdated:**
- `initConversationId` single-key path: REPLACED by `initTabConversationStore` + envelope migration.
- Sidepanel.js linearly grows the conversationId state in module scope: REPLACED by per-tab state via envelope lookup.

## Sources

### Primary (HIGH confidence)

- `extension/ui/sidepanel.js` — lines 1-2152 read in-session 2026-06-07 (selective regions); confirmed integration points + INV-04 baseline
- `extension/ui/sidepanel.html` — full file read; confirmed DOM IDs + script-tag chain
- `extension/ui/sidepanel.css` — selective grep + line 490-511 read; confirmed disabled-state precedent + missing `.fsb-owner-chip` rule
- `extension/ui/owner-chip.js` — full 119 lines read; confirmed dual-export pattern + extension point for `lookupClientLabel`
- `extension/ui/popup.js` + `popup.html` — full files read; confirmed mirror requirement per D-09
- `extension/utils/mcp-visual-session-lifecycle.js` — selective reads (lines 1-250 + 295-465 + 550-640); confirmed storage key prefix + nextEntry shape with driver field + recordVisualSessionTick allowlist gate
- `extension/utils/mcp-visual-session.js` — full 579 lines read; confirmed 14-entry allowlist + normalizeMcpVisualClientLabel gate
- `extension/utils/agent-registry.js` — selective reads (lines 180-280); confirmed formatAgentIdForDisplay + withRegistryLock mutex pattern + AgentRegistry shape
- `extension/ai/lattice-runtime-adapter.js` — full 323 lines read; confirmed Phase 9 enforceLruCap pattern + chrome.storage.session usage
- `.planning/phases/11-tab-aware-side-panel-surface/11-CONTEXT.md` — full 22 decisions read
- `.planning/REQUIREMENTS.md` — 188 lines read across both partial pages; confirmed FINT-NN..K placeholder + Phase 10 closure narrative
- `.planning/STATE.md` — read; confirmed milestone status + Phase 10 closure
- `.planning/ROADMAP.md` — 291 lines read; confirmed Phase 11 entry + all 6 INVs
- `.planning/v0.10.0-MILESTONE-AUDIT.md` — full read; confirmed UAT-08+09+10 deferred state
- `tests/owner-chip.test.js` — full 190 lines read; confirmed FSB test pattern
- `tests/mcp-visual-tick-lifecycle.test.js` — lines 1-120 read; confirmed chrome mock pattern
- `tests/lattice-step-emitter-smoke.test.js` — lines 1-100 read; confirmed real-runtime smoke pattern
- `package.json` `scripts.test` chain — confirmed test chain idiom
- `.planning/LATTICE-PIN.md` — lines 1-31 read; confirmed `current_lattice_sha` byte-freeze
- `.planning/config.json` — confirmed `commit_docs: true`, no `nyquist_validation: false`

### Secondary (MEDIUM confidence)

- Phase 9 + Phase 10 RESEARCH.md docs (read selective sections for format reference)
- FSB MEMORY notes (auto-loaded; confirmed real-runtime test discipline + Phase 8 lattice-step-emitter precedent)

### Tertiary (LOW confidence)

- None — all critical claims verified against in-tree source.

## Metadata

**Confidence breakdown:**
- INV-06 binary verdict (Section 2): HIGH — verified via grep of `extension/ui/*` (zero Lattice imports) + dependency on already-shipped Phase 10 schema
- INV-04 byte-freeze patterns (Section 3): HIGH — `grep -c setTimeout` baseline verified at 8; awk pattern is mechanical
- Storage envelope schema (Section 4): HIGH — modeled directly on agent-registry.js + Phase 9 adapter patterns; all FSB-canonical
- Hydration timing (Section 5): MEDIUM — chrome.tabs.onActivated boot-time firing order is not formally documented in Chrome MV3 docs; recommended sequencing uses defensive gate regardless
- Lockout granularity (Section 6): HIGH — DOM IDs verified from sidepanel.html; CSS gap discovered (no `.fsb-owner-chip` rule); aria pattern matches existing chatInput surface
- Edge cases (Section 7): HIGH — all 7 scenarios derived from established Chrome MV3 + chrome.storage.session semantics
- Validation architecture (Section 8): HIGH — test count target derived from 4-phase precedent (Phases 6/8/9/10)
- Pitfalls (Section 9): HIGH — all 5 derive from observed FSB UI patterns + Phase 243 / Phase 256 / Phase 10 history
- Plan breakdown (Section 10): HIGH — 4-plan structure mirrors Phase 8/9/10 ceremony precedent

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (Phase 11 implementation timeframe; envelope schema + DOM IDs stable beyond that horizon)
