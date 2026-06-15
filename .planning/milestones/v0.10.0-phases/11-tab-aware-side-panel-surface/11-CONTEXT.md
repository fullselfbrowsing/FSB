# Phase 11: Tab-aware side panel surface — friendly owner-chip + foreign-owned input lockout + per-tab chat history — Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the side panel tab-aware across three coupled UX surfaces so the user always sees the correct conversation, the correct ownership context, and the correct affordances for the currently-active tab.

Three surfaces shipped together as one coherent UX delivery:

1. **Friendly owner-chip label.** When the active tab has a visual-session lifecycle entry (`extension/utils/mcp-visual-session-lifecycle.js` storage key per tabId), the owner chip renders `owned by <entry.client>` (e.g. `owned by OpenClaw`, `owned by Claude`, `owned by Cursor`) instead of the current 6-char short prefix `owned by agent_a3f8b1`. Falls back to short-prefix display when no lifecycle entry exists.

2. **Foreign-owned input lockout.** When the active tab is foreign-owned (ownerAgentId !== `legacy:sidepanel` per the existing Phase 243 owner-chip suppression contract), the side panel disables chat input, send button, run-task button, voice-input button, and stop-task button. Re-enables on tab switch to a free tab. The existing owner chip is the visible explanation cue.

3. **Per-tab chat history.** Side panel chat history becomes tab-aware. State model migrates from the existing single `fsbSidepanelConversationId` chrome.storage.session key to a `Map<tabId, conversationId>` envelope. Switching tabs swaps the visible conversation; switching back retains. Persistence survives MV3 SW restart.

Phase 11 ships before the consolidated UAT-08+09+10 verdict; the UAT expands to UAT-08+09+10+11 in one Chrome MV3 reload session.

</domain>

<decisions>
## Implementation Decisions

### Storage envelope shape

- **D-01:** Single chrome.storage.session key `fsbSidepanelTabConversations` holding the entire per-tab map as one envelope. Atomic read/write semantics. Matches the agent-registry envelope shape pattern (single key, records keyed by id). Avoids per-tab key proliferation that complicates "query all" operations.
- **D-02:** Envelope shape `{ v: 1, byTab: { '<tabId>': <entry>, ... }, lru: ['<tabId>', ...] }` with `v: 1` literal at root. Future schema changes preserve old entries via an in-source migration helper (mirrors mcp-visual-session-lifecycle.js v0.9.36-compat pattern at lines 200-231).
- **D-03:** Per-tab entry shape `{ conversationId: string, lastAccessAt: number, createdAt: number }`. Timestamps enable LRU eviction + future history-view aggregation. `conversationId` matches the existing `conv_<timestamp>_<rand>` format minted by sidepanel.js (the existing initialization helper preserves backward compatibility).
- **D-04:** Hard cap of **50 tabs** in the map. On 51st entry insertion, evict the tab with the smallest `lastAccessAt`. LRU implementation reuses the Phase 9 `enforceLruCap` pattern from `extension/ai/lattice-runtime-adapter.js` (default 50/sessionId per JSDoc line 76); ported as a sidepanel-local helper. The `lru: ['<tabId>', ...]` field in the envelope is a maintained eviction order (head = most-recently-accessed, tail = next-to-evict); kept in sync with `lastAccessAt` writes. Tabs evicted from storage map gracefully degrade to "no prior conversation" on next activation (lazy re-mint per D-15).

### Owner-chip friendly-label lookup pathway

- **D-05:** Owner-chip looks up the friendly client label by reading the visual-session lifecycle entry for the active tabId via async `chrome.storage.session.get(storageKeyForTab(tabId))`. The existing `chrome.tabs.onActivated` handler in `extension/ui/sidepanel.js` (registered at line ~288) becomes async; chip renders after the storage read resolves. Read budget < 5ms typical; no perceived lag for tab-switch UX.
- **D-06:** New helper exported from `extension/ui/owner-chip.js`: `lookupClientLabel(tabId, storageReadFn)` that returns `Promise<string|null>` resolving to `entry.client` if a lifecycle entry exists for the tabId, otherwise `null`. `storageReadFn` is injected to keep the helper testable (Node tests pass a mock); production wiring at the call site uses `(key) => chrome.storage.session.get(key)`.
- **D-07:** Fallback when no lifecycle entry exists: render the current `formatAgentIdForDisplay` 6-char short prefix (e.g. `owned by agent_a3f8b1`). Preserves existing behavior for raw-FSB-tool agents that never tick the visual-session pipeline (Phase 243 baseline). Three-tier resolution: `legacy:*` literal first → lifecycle `entry.client` second → short-prefix fallback third.
- **D-08:** No in-memory cache layer for the friendly-label lookup. `chrome.storage.session.get` is ~1ms typical; cache invalidation on `chrome.storage.onChanged` adds complexity for marginal gain and creates a stale-cache failure mode. The lifecycle entry itself is the source of truth.
- **D-09:** Popup (`extension/ui/popup.js` + `extension/ui/popup.html`) gets the identical `ownerLabelFor` extension for chip-display consistency. Popup-side input lockout and per-tab history changes are OUT OF SCOPE — popup is single-shot per Phase 243 design.

### Foreign-owned input lockout granularity

- **D-10:** When `shouldShowOwnerChip(ownerAgentId, 'legacy:sidepanel')` returns true (i.e. a foreign agent owns the active tab), disable ALL user-input controls: chat textarea, send button, run-task button, voice-input button, stop-task button. The side panel surface is fully read-only on a foreign-owned tab.
- **D-11:** Visual cue is the existing owner chip plus dimmed/disabled CSS. The disabled controls get `disabled` attribute + `aria-disabled="true"` for screen-reader semantics; CSS adds reduced opacity. No separate banner above the input area — the owner chip is the existing UX cue and adding a second cue creates visual noise.
- **D-12:** FSB Autopilot driving the active tab is treated as foreign ownership. Autopilot's agentId is its own value (`legacy:autopilot` per agent-registry.js line ~358), distinct from `legacy:sidepanel`. The chip displays `owned by FSB Autopilot` (via lifecycle entry — Phase 10 ships the 'FSB Autopilot' allowlist label); controls lock out. User intervention paths: popup (still available) OR a new free tab. This is intentional: side panel input mid-autopilot would race with autopilot's own tool dispatch.
- **D-13:** Stop-task button is also disabled when foreign-owned. Stop-task is FSB-Autopilot-local — it stops the side-panel-initiated autopilot run, not arbitrary foreign agents. When foreign-owned, the button has no actual effect on the foreign agent; surfacing it as enabled would create a false affordance. The single exception (FSB Autopilot self-driving) is covered by D-12: autopilot drives autopilot's tab; sidepanel cannot stop FROM the sidepanel surface while autopilot owns the same tab. User stops via the popup or by waiting.

### Conversation lifecycle policies

- **D-14:** On `chrome.tabs.onRemoved(tabId)`, drop the entry from the per-tab map and the LRU order. The chat history view (existing `historyBtn` + `historyListEl` at sidepanel.js:68 + 364) still aggregates by sessionId from the existing FSB sessions store; per-tab map eviction does not affect history-view aggregation.
- **D-15:** On `chrome.tabs.onDiscarded(tabId)`, preserve the entry untouched. Discarded tabs can be re-activated by the browser; their chat history must restore intact. The `tabId` survives discard/restore in Chrome's tab lifecycle, so no special re-key handling is required.
- **D-16:** On `chrome.tabs.onAttached` / `onDetached` (window moves), preserve the entry. The tabId remains constant across window moves. Per-window keying is rejected — adds complexity and the tab-cross-window scenario is rare; the per-tab key already handles it correctly.
- **D-17:** Lazy mint: the per-tab `conversationId` is minted on first user message in that tab, not on tab activation. Avoids polluting storage with orphan entries for tabs the user activates but never chats in. On tab activation with no entry, the side panel shows an empty chat surface; first send triggers `conversationId = mintConversationId()` + envelope write + render.

### Surfaces touched (locked)

- **D-18:** Phase 11 touches FSB-internal UI surfaces only: `extension/ui/sidepanel.js`, `extension/ui/sidepanel.html`, `extension/ui/sidepanel.css`, `extension/ui/owner-chip.js`, `extension/ui/popup.js`, `extension/ui/popup.html`. No `extension/ai/*`, no `extension/background.js`, no `extension/manifest.json`, no Lattice-side files.
- **D-19:** INV-04 BYTE-FROZEN: `grep -c "setTimeout" extension/ai/agent-loop.js` stays 8. Phase 11 does not touch agent-loop.js. Verified via regression smoke test gate.
- **D-20:** INV-06 BYTE-FROZEN: `current_lattice_sha` stays at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Zero Lattice-side commits. The visual-session lifecycle map and agent-registry are FSB-internal primitives shipped in earlier phases; no Lattice-side primitive extension is required.

### Plan shape + UAT integration

- **D-21:** Anticipated plan breakdown: 3-5 plans across 3-4 waves. Wave 0 smoke harness for sidepanel.js helper extraction + storage envelope shape + lifecycle simulation; Waves 1-3 the three surfaces (owner-chip resolver + lockout + per-tab history); Wave 4 ceremony closure (REQUIREMENTS.md FINT-19/20/21 narrative + traceability + LATTICE-PIN.md Phase 11 row with SHA UNCHANGED + v0.10.0-MILESTONE-AUDIT.md status_history phase_11_shipped entry). Planner finalizes exact plan count.
- **D-22:** Per-axis UAT-11 deferred to the consolidated end-of-milestone UAT alongside the already-pending UAT-08+09+10. User runs UAT-08+09+10+11 in one Chrome MV3 reload session. UAT-11 procedure documented in `.planning/phases/11-tab-aware-side-panel-surface/11-VERIFICATION.md` Human Verification section once execute-phase completes; verifier emits `human_needed`.

### Claude's Discretion

- Exact CSS class names for the disabled-state visual treatment (sidepanel.css selectors).
- Exact aria-label / aria-describedby copy for the locked state (planner picks accessible phrasing within the established sidepanel.html aria pattern).
- Exact storage key string for the per-tab map (recommended `fsbSidepanelTabConversations` per D-01 but planner may pick a sibling name if a chrome.storage.session key collision is found during research).
- Whether to ship the LRU helper as an inline private function inside sidepanel.js, a sidecar `extension/ui/sidepanel-tab-conv-store.js` module loaded via the existing sidepanel.html script-tag chain, or as a re-export from `extension/utils/agent-registry.js` (which has its own LRU semantics). Planner picks based on test ergonomics + code-locality.
- Exact insertion ordering of the new helper file in sidepanel.html (alphabetical with existing script tags vs grouped by concern).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`extension/ui/owner-chip.js`** (119 lines) — pure helper module with `shouldShowOwnerChip`, `buildChipText`, `ownerLabelFor`, `findOwnerInEnvelope`. Exported on `globalThis.FSBOwnerChip` for browser + `module.exports` for Node tests. Phase 11 extends this module with a new async `lookupClientLabel(tabId, storageReadFn)` helper.
- **`extension/utils/mcp-visual-session-lifecycle.js`** (~640 lines) — per-tab storage keyed by `storageKeyForTab(tabId)`; entry shape per Phase 10 D-01: `{ tabId, agentId, client, visualReason, startedAt, lastTickAt, deadlineAt, isFinal, driver }`. Phase 11 reads `entry.client` for the friendly label.
- **`extension/utils/mcp-visual-session.js`** — 14-entry `MCP_VISUAL_CLIENT_LABELS` allowlist (`Claude`, `Codex`, `ChatGPT`, `Perplexity`, `Windsurf`, `Cursor`, `Antigravity`, `OpenCode`, `OpenClaw`, `OpenClaw 🦀`, `Grok`, `Gemini`, `Hermes`, `FSB Autopilot`) + `normalizeMcpVisualClientLabel(raw)` + `isAllowedMcpVisualClientLabel(raw)`. Phase 11 trusts `entry.client` is pre-normalized; if it isn't allowlisted, fall through to short-prefix.
- **`extension/utils/agent-registry.js`** — `formatAgentIdForDisplay(agentId)` returns the canonical 6-char hex short prefix; reused as fallback. `getAgentForTab(tabId)` returns the agentId owning the tab (already used by sidepanel chip refresh).
- **`extension/ai/lattice-runtime-adapter.js`** — Phase 9 LRU cap implementation at `enforceLruCap` (default 50/sessionId per JSDoc line 76). Pattern ported, not directly imported (sidepanel script-tag context does not have access to lattice-runtime-adapter without bundler work; Phase 11 is bundle-free per D-18).

### Established Patterns

- **Module shape:** Pure helpers in `extension/ui/owner-chip.js`-style modules use the `(function(global) { ... })(typeof globalThis !== 'undefined' ? globalThis : this)` IIFE with dual export to `global.FSBOwnerChip` AND `module.exports` for Node tests. Phase 11 helpers follow the same shape.
- **Owner chip refresh:** `extension/ui/sidepanel.js` line 288 registers `chrome.tabs.onActivated.addListener(() => { ... refreshOwnerChip() ... })`. Refresh logic at line ~234 reads the agent-registry envelope from `chrome.storage.session`, resolves owner agentId, calls `ownerLabelFor`, sets chip text. Phase 11 extends the refresh path to also read the visual-session lifecycle entry for the active tabId before chip text resolution.
- **Storage envelope versioning:** `extension/utils/agent-registry.js` envelope uses `{ v: 1, records: { ... } }` shape. Phase 11 `fsbSidepanelTabConversations` envelope mirrors this exact pattern.
- **Test seam injection:** Pure helpers accept their I/O dependencies as parameters (e.g., `findOwnerInEnvelope(envelope, tabId)` — the envelope is passed in, not read inside). Phase 11's `lookupClientLabel(tabId, storageReadFn)` follows this pattern so Node tests can mock storage.
- **Chrome lifecycle event subscription:** sidepanel.js wraps event subscriptions in feature-detection guards (`if (typeof chrome !== 'undefined' && chrome.tabs && ...)`) so the file remains require-able in Node test contexts.

### Integration Points

- **sidepanel.html** loads scripts in a defined order via `<script src="...">` tags at the bottom of body. New Phase 11 helper modules (if any) get inserted alphabetically or grouped by concern (planner choice per D-discretion).
- **chrome.tabs.onActivated** — existing subscription point at sidepanel.js:288 is the natural extension site for tab-switch chat-history hydration. Phase 11 hooks the same event to swap the visible conversation.
- **chrome.tabs.onRemoved / onDiscarded** — new subscriptions registered alongside the existing onActivated subscription. Handlers update the per-tab map.
- **send-button handler + run-task-button handler** — existing handlers at sidepanel.js lines ~509+ check the active tab and dispatch. Phase 11 wraps the dispatch in a `if (isForeignOwned) return` gate (the disabled attribute is the primary defense; the runtime gate is defense-in-depth against a stale UI state).
- **Conversation initialization at sidepanel.js:45-57** — `restoreOrInitConversationId()` currently reads `fsbSidepanelConversationId` and mints if absent. Phase 11 refactors this to read from the per-tab map keyed by active tabId; mints lazily on first user message (D-17).

</code_context>

<specifics>
## Specific Ideas

User-specified requirements verbatim from 2026-06-07 invocation:

1. "in the side panel a little badge saying that Tab owned by an agent underscore an ID a unique ID instead of instead of that I want you to replace it with the actual agent that is using for example OpenClaw or whatever from the allowed list" — covered by D-05 through D-09.
2. "whenever a tab is owned by an agent I should not be able to send any messages to that particular tab right and I should only be able to send messages and activate or run a task through side panel only when a tab is free" — covered by D-10 through D-13.
3. "I'm running a task one task in a particular tab. And if I open other other other tab, it should like retain history. So let's say I'm running a task in one tab and other another task in Another tab using the same side panel it should show different histories and different side panel content dynamically. Correct? So This is this is a thing. And yeah, when I switch back to the other tab with the with another other task, the chat history in the side panel should be retained." — covered by D-01 through D-04 + D-14 through D-17.

User priority direction: "carefully implement this with the best practices". Reflected in the LRU cap (D-04), versioned envelope (D-02), defense-in-depth gating (D-10 + integration point note on send-button handler), and test-seam injection pattern (D-06).

</specifics>

<deferred>
## Deferred Ideas

- **Popup-side input lockout + per-tab history** — Popup is single-shot per Phase 243 design; only the chip-friendly-name fix lands in popup this phase. A future v0.11.0 phase can extend popup with the other two surfaces if user demand arises.
- **Cross-window side panel state unification** — Each Chrome window has its own side panel surface; per-window state isolation is preserved. A user with two windows and one tab moved between them sees the conversation move with the tab (tabId is constant). Unifying side panel state across windows is not in scope.
- **Conversation history search + cross-tab merging UI** — The existing history view (`historyBtn` + `historyListEl`) stays as the aggregate-by-sessionId view. Cross-tab merging UI is deferred.
- **Incognito mode special-casing** — Side panel availability in incognito follows the extension manifest; tab-aware state behaves the same in incognito tabs as in regular tabs. No special handling.
- **Archive-on-close (instead of drop-on-close)** — D-14 chose drop-on-close for memory hygiene. Archive-on-close with restore-via-history is a potential future enhancement if user feedback shows desire to recover post-close conversations.
- **Per-window keying** — D-16 explicitly rejected this in favor of per-tab keying. Revisit if multi-window UX issues emerge.
- **Pre-cache + storage.onChanged sync** — D-08 explicitly rejected this for the friendly-label lookup. Async per-event reads are the chosen pattern.

</deferred>
