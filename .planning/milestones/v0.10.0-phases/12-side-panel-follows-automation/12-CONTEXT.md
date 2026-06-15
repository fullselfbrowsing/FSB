# Phase 12: Side panel follows automation — live progress + persistent per-conversation message log + per-tab sidepanel auto-open/close — Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 shipped the per-tab state model (chip + lockout + per-tab conversationId envelope). UAT-FINAL on 2026-06-08 surfaced three UX gaps that Phase 11 did not address:

1. **Live progress messages do not render in the sidepanel during a running autopilot task.** User report: "I see no progress."
2. **Sidepanel close + reopen shows empty chat.** Root cause: `fsbSessionLogs` (the only persistence layer Phase 11 had access to via the b8b761e8 hydrate scaffold) is session-level metadata — commands + final outcome only. It does not carry intermediate assistant / progress / tool messages.
3. **Sidepanel is globally available on every tab regardless of whether automation is bound to that tab.** Expected: sidepanel follows the automating tab.

Phase 12 closes all three:

- **Surface 1** wires live progress messages through to the DOM (fixes "no progress visible").
- **Surface 2** adds a real per-conversation message log persisted to chrome.storage.local; repoints the Phase 11 hydrate scaffold to read from it; fixes the "messages disappear on reopen" symptom for-real.
- **Surface 3** binds the sidepanel surface itself to the automating tab via chrome.sidePanel API, so opening Run in Tab A pops the sidepanel for Tab A; switching to a non-automation tab swaps the sidepanel view; multi-tab automation is handled by the existing Phase 11 swap.

UAT-12 joins the consolidated UAT-08+09+10+11+12 in one Chrome MV3 reload session post-Phase-12 ship.

</domain>

<decisions>
## Implementation Decisions

### Per-conversation message log — storage shape + write strategy (Area 1)

- **D-01:** Storage backend is `chrome.storage.local` (not `chrome.storage.session`). Survives SW restart AND browser restart. Quota concern is negligible at FSB scale (~50 conversations × ~5MB per worst-case ≈ 250MB envelope, well under storage.local quota of 10MB unlimited with `unlimitedStorage` permission; standard quota is 10MB and we are nowhere near that for typical chat-text payloads).
- **D-02:** Envelope shape `fsbConversationMessages: { v: 1, byConv: { '<convId>': { v: 1, messages: [{role, content, timestamp, kind, ...}, ...], lastWriteAt, createdAt } }, lru: ['<convId>', ...] }` under one storage key. Single-key envelope mirrors Phase 11 `fsbSidepanelTabConversations` + Phase 9 `lattice-runtime-adapter` LRU pattern. Versioned at both envelope-level (`v: 1`) and per-conversation entry (`v: 1`) for future migration ergonomics. `lastWriteAt` powers LRU; `createdAt` is informational.
- **D-03:** Write strategy is **write-through every `addMessage` call, debounced 200ms per conversationId**. The debounce batches rapid progress streams (e.g., autopilot emitting 5 progress messages in 100ms) into a single storage write. Lost-on-crash window is bounded to 200ms — acceptable for UX-grade persistence. Implementation: per-conversationId pending-write timer; on every addMessage call, append to in-memory buffer + reset timer; on timer fire, flush to storage.local. Defense-in-depth: a forced flush on `beforeunload` / sidepanel close.
- **D-04:** Eviction policy is **hard LRU cap of 50 conversations** matching the Phase 11 envelope cap. On 51st conversation insertion, evict the conversation with smallest `lastWriteAt`. Reuses the Phase 11 `enforceLruCap` pattern (already vendored from Phase 9 `lattice-runtime-adapter.js`). Tabs whose conversationId is evicted from the message-log gracefully degrade to "no prior messages" hydrate (same as Phase 11 envelope LRU eviction degrades to "no conversationId").

### Hydrate path repoint (Area 2)

- **D-05:** Repoint the existing `hydrateChatFromConversationId(convId)` helper added at commit `b8b761e8`. Keep the function name + signature unchanged (no API churn). Swap the data source from `fsbSessionLogs` + `fsbSessionIndex` to the new `fsbConversationMessages` store. The `b8b761e8` body becomes the fallback path (Tier 2).
- **D-06:** **Fallback order:** Tier 1 = new `fsbConversationMessages` store; Tier 2 = legacy `fsbSessionLogs` + `fsbSessionIndex` (for pre-Phase-12 conversations); Tier 3 = empty render + show welcome. Pre-Phase-12 conversations that have nothing in the new store but have rows in the old store render their commands + completion at Tier 2 (matches `b8b761e8` behavior). Phase-12+ conversations skip Tier 2 entirely.
- **D-07:** **Render fidelity is 1:1** — render every persisted message in chronological order, preserving the role + kind tags. Roles: `user`, `assistant`. Kinds: `text`, `progress`, `tool`, `error`. The DOM addMessage helper already supports a kind argument or class hook; planner verifies via code read.
- **D-08:** **Hydrate fires at two call sites:** (a) on sidepanel boot after `initTabConversationStore` (existing site from `b8b761e8`); (b) on `swapToTabConversation(tabId)` for tabs with a bound conversationId (existing site from `b8b761e8`). No additional triggers.

### Live progress wiring (Area 3)

- **D-09:** **Research-then-patch.** The wiring gap could be in: (a) `background.js` not broadcasting all autopilot progress events to the sidepanel via `chrome.runtime.sendMessage`, OR (b) sidepanel.js has a `chrome.runtime.onMessage` listener but it does not call `addMessage` for all event types the autopilot emits, OR (c) the autopilot loop in `agent-loop.js` emits events but the sidepanel's listener was deregistered / never registered. Research (12-RESEARCH.md) audits the full message flow and identifies the specific gap. The fix is whichever combination of (a)/(b)/(c) is broken, plus tests that exercise the channel end-to-end.
- **D-10:** **Progress events persist too.** Every progress message that lands in the DOM via addMessage MUST also land in the new `fsbConversationMessages` store via the write-through debouncer (D-03). Same code path — addMessage becomes the single point that writes BOTH to DOM and to storage.
- **D-11:** **Token-level streaming output is OUT OF SCOPE.** Phase 12 ships discrete-message delivery (one progress event = one persisted message). Token-by-token streaming (typewriter effect) is a separate UX layer deferred to v0.11.0+ if user demand surfaces.
- **D-12:** **Tool calls render as `kind: 'tool'` messages.** If autopilot emits a tool-dispatch event, addMessage('tool', `<tool-name>(<summary>)`) renders it as a distinguishable line in chat. Preserves user transparency into what autopilot is doing. The render styling is Claude's Discretion (planner picks within existing sidepanel.css conventions).

### Per-tab sidepanel auto-open/close (Area 4)

- **D-13:** **Auto-open trigger:** `chrome.sidePanel.open({tabId})` called from background.js (or wherever the Run handler runs) **synchronously inside the Run-handler user-gesture context**. MV3 spec requires `chrome.sidePanel.open` to fire inside a user-gesture window; the user clicking Run on the sidepanel IS that gesture. Implementation: when autopilot binds Tab A, background.js calls `chrome.sidePanel.setOptions({tabId: tabAId, enabled: true, path: 'ui/sidepanel.html'})` then `chrome.sidePanel.open({tabId: tabAId})`. Sidepanel becomes visible on Tab A.
- **D-14:** **Behavior on switch to non-automation tab:** **Stay open; swap view.** Sidepanel remains open as a Chrome surface; chrome.tabs.onActivated handler in sidepanel.js fires (existing from Phase 11); `refreshOwnerChip + swapToTabConversation` swap the view to the new tab (chip hidden + input enabled + hydrate fires for the new tab's convId or shows empty). This matches the Phase 11 + Bug 1 fix behavior. No `chrome.sidePanel.close` invocation. Rationale: auto-close is jarring (sidepanel reopens require explicit user gesture; we cannot auto-reopen later); stay-open-with-swap is the same UX Phase 11 + Bug 1 already delivers, just made consistent.
- **D-15:** **Behavior on switch back to automation tab:** **No separate action needed.** Sidepanel already open from D-13 + D-14; chrome.tabs.onActivated fires; Phase 11 swap restores the running task's view. Already covered.
- **D-16:** **Multi-automation tabs:** Each automating tab has its own sidepanel view (Phase 11 envelope per-tab). Switching between them swaps views. No "primary tab" pinning. The chrome.sidePanel.setOptions call from D-13 is per-tabId, so multiple bind-events register multiple enabled tabs cleanly.
- **D-17:** **Sidepanel "stays open" semantics:** D-14 means the Chrome surface stays mounted. But if the user explicitly closes the sidepanel (X button or Chrome side-panel-toggle in chrome:// shortcuts), the auto-open does NOT force-reopen on tab switches. Auto-open only fires on autopilot bind (D-13). Subsequent tab switches respect the user's explicit close until next autopilot bind. This avoids fighting the user's intent.

### Hard invariants (locked carry from v0.10.0)

- **D-18:** **INV-01 / INV-02 MCP wire contracts UNTOUCHED.** No tool-definitions.js change. No tool registry mutation.
- **D-19:** **INV-04 BYTE-FROZEN.** `extension/ai/agent-loop.js` is OFF LIMITS. `grep -c "setTimeout" extension/ai/agent-loop.js` MUST stay 8 post-phase. Phase 12 reads autopilot signals via the existing message channel (background.js relays); it does NOT modify agent-loop.js.
- **D-20:** **INV-05 deprecated agent modules frozen.**
- **D-21:** **INV-06 ZERO Lattice-side commits expected.** `current_lattice_sha` stays `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` per existing freeze. If research surfaces a Lattice primitive requirement, that is a discuss-phase blocker for human review.

### Surfaces in scope + out of scope

- **D-22:** **Surfaces in scope:** `extension/ui/sidepanel.js` (hydrate repoint + addMessage write-through wiring + listener verification), `extension/ui/sidepanel.html` (likely no change), `extension/background.js` (additive event registration: chrome.sidePanel.open call on Run; chrome.sidePanel.setOptions on autopilot bind; possibly a new message broadcaster for progress events if research surfaces a gap there), new sidecar `extension/ui/sidepanel-message-log.js` (envelope CRUD + debouncer + LRU + dual-export IIFE pattern matching Phase 11 sidepanel-tab-conv-store.js), `tests/sidepanel-message-log-smoke.test.js` (new), `package.json` (scripts.test &&-chain append).
- **D-23:** **Surfaces OUT of scope:** `extension/ai/agent-loop.js` (INV-04); any `extension/utils/mcp-*` file beyond reading existing exports; any `extension/ai/lattice-*` file (per Phase 11 + Phase 9 byte-freeze); `extension/manifest.json` only touched if research surfaces a missing permission (the `sidePanel` permission is already declared per Phase 10 + Phase 11 baseline); popup.js (no progress display in popup; chip-friendly-name fix already shipped in Phase 11).
- **D-24:** **NO chrome.tabs.onDiscarded change beyond Phase 11 D-15 (preserve).** When a tab is discarded, its conversationId stays in the envelope AND its messages stay in the new log. Discard does NOT trigger LRU eviction; only `chrome.tabs.onRemoved` drops both envelope entry + message log entry (matching Phase 11 D-14 "drop on close" — D-24 extends drop to the message log too).

### Plan shape + UAT integration

- **D-25:** **Anticipated plan breakdown:** 4-5 plans across 4-5 waves. Wave 0 smoke harness + sidecar `sidepanel-message-log.js` (envelope CRUD + debouncer + LRU helpers); Wave 1 hydrate repoint (FINT-23 partial — wire new store as Tier 1; keep fsbSessionLogs as Tier 2 fallback); Wave 2 addMessage write-through wiring (FINT-23 partial — every addMessage call writes to both DOM and persistent store via debouncer); Wave 3 live progress wiring research + fix (FINT-22); Wave 4 per-tab sidepanel auto-open + ceremony (FINT-24 + REQUIREMENTS.md + LATTICE-PIN.md + MILESTONE-AUDIT.md status_history + 12-VERIFICATION.md UAT-12 procedure). Planner finalizes exact plan count.
- **D-26:** **Per-axis UAT-12 deferred to consolidated end-of-milestone UAT alongside the already-pending UAT-08+09+10+11.** User runs UAT-08+09+10+11+12 in one Chrome MV3 reload session. UAT-12 procedure documented in `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` Human Verification section once execute-phase completes; verifier emits `human_needed`. Procedure includes: (a) start autopilot in Tab A — sidepanel auto-opens; (b) verify live progress messages render during run; (c) close sidepanel + reopen on Tab A — chat history restored from new store; (d) switch to Tab B — sidepanel view swaps cleanly; (e) close Tab B with running task — new tab Tab A entry preserved; (f) INV-04 + INV-06 byte-freeze automated check.

### Claude's Discretion

- Exact CSS class names and styling for `kind: 'progress'` and `kind: 'tool'` message lines (planner picks within existing sidepanel.css conventions).
- Exact debounce timer reset strategy (clear-and-replace vs trailing-edge-only).
- Exact module location of the message-log sidecar (`extension/ui/sidepanel-message-log.js` recommended; planner may relocate to `extension/utils/` if it ends up reused by popup or other surfaces — but D-22 currently scopes it to sidepanel).
- Exact storage key string for the message-log envelope (recommended `fsbConversationMessages` per D-02; planner may pick a sibling name if a collision is found during research).
- Whether to ship the debouncer as a private function inside the sidecar or as a separate `extension/ui/sidepanel-message-log-debouncer.js` (planner choice based on test ergonomics).
- Exact wording for the UAT-12 procedure sub-assertions (planner picks within established FSB UAT conventions from prior phases).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`extension/ui/sidepanel-tab-conv-store.js`** (Phase 11 sidecar; ~250 lines) — canonical IIFE dual-export pattern + envelope CRUD + LRU helpers + migration helper. Phase 12 sidecar `sidepanel-message-log.js` follows the SAME shape. The LRU helper (`_enforceLruCap`) is portable; Phase 12 either calls the existing helper from the new sidecar (cross-module dependency) or vendors a copy (mirror Phase 11 pattern of vendoring from lattice-runtime-adapter.js).
- **`extension/ui/sidepanel.js`** — `hydrateChatFromConversationId(convId)` helper added at commit `b8b761e8` (Bug 2 partial fix). Reads `fsbSessionLogs` + `fsbSessionIndex` from chrome.storage.local. Phase 12 D-05 repoints the data source while keeping the function name + signature.
- **`extension/ui/sidepanel.js`** — `addMessage(role, content, ...)` helper (existing, location to be confirmed by planner read). Phase 12 D-10 wires write-through to the new message log via this single chokepoint.
- **`extension/background.js`** — existing `chrome.runtime.sendMessage` broadcasts to sidepanel (for status updates, owner-chip refreshes, autopilot complete events). Phase 12 D-09 audits whether progress events are in the broadcast set; if not, adds them.
- **`extension/utils/agent-registry.js`** — envelope shape pattern `{ v: 1, records: { ... } }` matches Phase 12 D-02. Phase 11 sidecar already followed this; Phase 12 keeps the convention.

### Established Patterns

- **Sidecar module shape:** IIFE dual-export `(function(global) { ... })(globalThis)` with `global.FSBxxx = exportsObj; if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;`. Phase 11 sidepanel-tab-conv-store.js is the canonical reference.
- **Storage write debounce:** Not yet used in FSB UI codebase, but the pattern is straightforward (per-key timer map, set on each call). Research in Phase 12 confirms no existing pattern needs honoring; planner picks a tight implementation.
- **chrome.storage.local writes from sidepanel:** Existing call sites use `chrome.storage.local.set({...}, callback)` or the promise form. Phase 12 follows the promise form (consistent with Phase 11 sidecar's chrome.storage.session usage).
- **addMessage chokepoint pattern:** Phase 12 D-10 hinges on the assumption that EVERY message rendered into chatMessages goes through addMessage. Research verifies — if there is a direct-DOM-mutation path bypassing addMessage, Phase 12 adds a hook there too.

### Integration Points

- **sidepanel.html** loads scripts in a defined order. New `sidepanel-message-log.js` sidecar gets a `<script>` tag added strictly between `sidepanel-tab-conv-store.js` (Phase 11) and `sidepanel.js` (so sidepanel.js can reference both sidecars on boot).
- **chrome.runtime.onMessage** in sidepanel.js handles inbound autopilot events. Phase 12 D-09 audits coverage; the existing listener becomes the single point where progress events get translated to addMessage calls.
- **chrome.sidePanel.open / setOptions** in background.js. Currently there is no per-tab sidepanel binding in FSB (sidepanel is globally enabled per the manifest). Phase 12 D-13 + D-22 add these calls in the autopilot-bind path.

</code_context>

<specifics>
## Specific Ideas

User-specified requirements verbatim from 2026-06-08 UAT feedback:

1. "I see no progress" — covered by Surface 1 + D-09 + D-10.
2. "if I move to a different tab in which the automation isn't loading, the side panel should auto-close" — partially covered. D-14 chose stay-open-with-swap rather than hard auto-close because (a) chrome.sidePanel.close requires user gesture and cannot fire on tab switch; (b) hard close + auto-reopen later is impossible because reopen also requires gesture; (c) the swap-view UX delivers the same effective behavior (the panel is "irrelevant" on Tab B so user can ignore it; switching back to Tab A swaps the view back without re-opening). If user later asserts true auto-close is essential, that is a Phase 12 design revision discussion.
3. "whenever I'm back in the tab where automation is running, the side panel should auto-open" — covered by D-13 (auto-open on autopilot bind) + D-15 (subsequent swap-back handled by chrome.tabs.onActivated). Combined: first bind = auto-open; subsequent tab switches = swap-view (panel stays open from the original auto-open).
4. "yes the messages are still disappearing" — covered by Surface 2 + D-05 through D-08 (real per-conversation message log + repoint hydrate).

User direction: "do this as a phase with the research and everything else" — reflected in the 4-5 plan breakdown + research-then-patch live progress wiring (D-09).

</specifics>

<deferred>
## Deferred Ideas

- **Token-level streaming output** (D-11). Discrete message delivery only in Phase 12. Streaming defers to v0.11.0+.
- **Hard auto-close on tab switch** (D-14 chose stay-open-with-swap instead). Revisit if user later asserts true close is essential.
- **Auto-reopen on switch back to closed sidepanel** (D-17 explicit no-fight-user-intent). User has to click the extension icon or sidepanel toggle to reopen.
- **Per-conversation transcript export / download UI** (not a phase 12 deliverable; the log is stored and queryable but no UI surface ships).
- **Cross-tab conversation merging UI** (already deferred in Phase 11 — Phase 12 inherits the deferral).
- **Migration of pre-Phase-12 fsbSessionLogs rows into the new store** (fresh-only ship; pre-existing conversations gracefully degrade to Tier 2 fallback per D-06).
- **iframe / cross-origin sidepanel hosting changes** (sidepanel stays a same-extension surface; manifest unchanged unless research surfaces a missing permission).
- **Reset-on-mismatch** semantics for the message log (if a conversationId in the message-log has no matching entry in the per-tab envelope, the log entry just becomes orphaned and gets LRU-evicted naturally; no special cleanup pass).

</deferred>
