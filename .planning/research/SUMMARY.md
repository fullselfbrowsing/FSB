# Project Research Summary

**Project:** FSB (Full Self-Browsing)
**Milestone:** v0.11.0 Trigger Tool (Reactive DOM Monitoring)
**Domain:** Long-running reactive DOM-monitoring tool family for an AI Chrome MV3 extension + MCP server
**Researched:** 2026-06-15
**Confidence:** HIGH

> This SUMMARY synthesizes four research files written for THIS milestone (they replaced stale v0.9.69 telemetry content at the canonical paths): [STACK.md](STACK.md), [FEATURES.md](FEATURES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PITFALLS.md](PITFALLS.md). Prior-milestone telemetry pitfalls are preserved at [PITFALLS-v0.9.69-TELEMETRY.md](PITFALLS-v0.9.69-TELEMETRY.md).

## Executive Summary

The `trigger` tool family turns FSB from a "do a task and stop" automaton into a *reactive watcher*: arm a watch on one DOM element, get notified when its value changes / crosses a threshold / equals a target / contains text, and let the AI decide what to do on fire (notify-only by design). The dominant, cross-cutting conclusion from all four researchers is that **this milestone requires ZERO new runtime dependencies and ZERO new architectural primitives.** Every need is met by MV3 platform built-ins (`chrome.alarms`, `chrome.storage.session/local`, `MutationObserver`, `chrome.tabs`/`chrome.scripting`), already-pinned packages (`@modelcontextprotocol/sdk@1.29.0` -- confirmed still `latest`, NO bump; `zod@^3.24.0`; `@full-self-browsing/lattice@1.3.0`), and machinery FSB already shipped. The work is *new source files that compose existing patterns* (NEW 5 / MODIFIED 8, **no `manifest.json` change, no `package.json` dependency delta**). There is an explicit "do NOT add" list: currency.js/numeral/dinero (a ~60-line `Intl.NumberFormat().formatToParts()` parser replaces them), zod@4 (number-coercion drift risks INV-01), and any MCP SDK bump.

The recommended approach is to build the trigger registry as a **third sibling** to the existing v0.9.36 visual-session lifecycle and v0.9.60 `run_task` tracking -- a parallel-but-analogous lifecycle (`fsbTriggerRegistry`), NOT a graft onto `run_task`/`activeSessions` and explicitly NOT touching the `agent-loop.js` `setTimeout` iterator (INV-04). Three subsystems already in-tree solve every hard sub-problem and are copied "change the constants, not the shape": `mcp-visual-session-lifecycle.js` (per-entity `chrome.alarms` + storage + SW-startup restore + tab-close cleanup) is the survival template; `mcp-task-store.js` (versioned `{v,records}` envelope) is the snapshot-store template; `mcp-bridge-client.js:_handleStartAutomation` (30s heartbeats, `settle()` single-resolve guard, 600s safety net, `partial_state`) is the blocking-return template; `dom-stream.js` (MutationObserver + rAF debounce + `chrome.runtime.sendMessage`) is the live-observe template. **MV3 survivability is the crux and is already solved in-tree:** the SW dies after 30s idle, but `chrome.alarms` persists across eviction and its 30s floor (Chrome 120) was deliberately aligned to that window -- an alarm tick revives the SW, which re-hydrates trigger state from `chrome.storage.session` and re-evaluates. Fire evaluation lives in the SW (durable authority), never the content script (which dies on navigation).

The risks are concentrated and well-characterized. **The #1 risk is MCP queue starvation:** a blocking `trigger()` registered like a normal mutation tool parks the single `TaskQueue` slot for hours and deadlocks every other tool -- including its own `stop_trigger`. The mitigation is structural: the watcher loop runs in `background.js` (never the MCP handler), and `stop_trigger`/`get_trigger_status`/`list_triggers` go in the read-only bypass set. Blocking mode must also auto-convert to detached past a safety ceiling because MCP hosts time out long calls regardless of progress notifications (and Chrome kills any single request >5 min). The genuine *moat* is `live-observe` (in-place MutationObserver) versus competitors' server-side poll-only monitors -- but it is also the highest-cost / highest-risk piece (re-injection after BF-cache/SPA nav, debouncing fire-storms, fire delivery to an evicted SW). Refresh-poll has a hard ~30s Chrome alarm floor (PROJECT.md's ~60s default sits safely above it) and must own its tab + reload in the background (no focus theft, reuse v0.9.60 agent-scoped tab resolution). Cross-cutting safety: one-shot edge-fire default + hysteresis (avoid flapping), locale-aware numeric normalization with NaN -> `parse_error` (never fire on a parse failure), and additive-only tool registration (INV-01 schema-lock stays green).

## Key Findings

### Recommended Stack

**Zero new runtime dependencies -- the headline conclusion.** Every capability is satisfied by APIs FSB already ships with or machinery FSB already built; the "additions" are new source files composing existing primitives, not new packages. The extension runtime keeps exactly its two deps (`axios`, `lattice`). `fsb-mcp-server` still bumps (likely `@0.10.0`) for the new tool surface, but its `dependencies` block is unchanged. (See [STACK.md](STACK.md).)

**Core technologies:**
- **Chrome MV3 platform APIs** (`chrome.alarms`, `chrome.storage.session/local`, `chrome.tabs`, `chrome.scripting`, `chrome.webNavigation`): survival + scheduling + tab-ownership substrate -- built-in and **already permissioned** in `manifest.json` (no new permission). The 30s alarm floor (Chrome 120) is the canonical MV3-survival timer.
- **`MutationObserver`** (Web API): the `live-observe` mechanism, observing ONE element in place -- push-based (no polling cost), already imported by FSB content scripts, isolated-world.
- **`@modelcontextprotocol/sdk@^1.29.0` (NO bump -- confirmed current `latest`)**: registers the 4 tools and emits `notifications/progress` heartbeats via the same `_meta` envelope `run_task` uses -- keeping it pinned protects INV-01.
- **`zod@^3.24.0` (stay on v3)**: MCP input validation through `schema-bridge.ts` `jsonSchemaToZod()`; zod@4 risks number-coercion drift (INV-01).
- **`@full-self-browsing/lattice@1.3.0` (pinned, do NOT touch -- INV-06)**: available as a survivability-adapter option, but the lighter dedicated sidecar is the recommended default.
- **New in-tree, 0-dep modules**: `value-extractor.js` (`Intl.NumberFormat().formatToParts()` separator discovery + regex normalize), `trigger-store.js` (clone of `mcp-task-store.js`), `content/trigger-observe.js`, `mcp/src/tools/trigger.ts`.

**Explicit "do NOT add" list:** any npm currency/number lib (currency.js/numeral/dinero/accounting); `zod@4.x`; any MCP SDK bump; SW keepalive antipatterns; `setTimeout`/`setInterval` as the standing watch loop; alarm periods <30s; reliance on `chrome.alarms persistAcrossSessions` (Chrome 150+ only).

### Expected Features

The full FSB toolset (~36 action + 15 read-only tools, `run_task`, multi-agent tab ownership, uniqueness-scored targeting, visual sessions) already exists and is reused as *dependencies*. Prior art (Distill / Visualping / changedetection.io; Keepa / Binance; Playwright `waitForFunction` / synthetic monitors) supplies only the feature vocabulary. (See [FEATURES.md](FEATURES.md).)

**Must have (table stakes -- P1, the v0.11.0 launch set):**
- All four fire conditions: `changed`, `threshold` (`>=`/`<=`/`>`/`<`), `equals`/`regex`, `contains` -- the vocabulary every monitor has.
- Both watch mechanisms, selectable per-trigger: `refresh-poll` (static pages) AND `live-observe` (live/SPA pages).
- Smart value extraction (auto number-parse; raw text for `changed`/`contains`; `extract: text|number|attribute` override).
- Dual-mode reporting: blocking-by-default (30s heartbeats, return on fire/timeout) + detached opt-in (`trigger_id` + poll).
- Companion tools `stop_trigger`, `get_trigger_status`, `list_triggers`; multiple concurrent triggers with a configurable cap (mirrors the v0.9.60 agent cap, 1-64, default 8).
- MV3 survivability (survive SW eviction via `chrome.alarms` + resume sidecar) -- the crux.
- Refresh interval with a hard floor (~60s default, never below the 30s alarm floor) + blocking timeout with safety ceiling.
- One-shot edge-fire semantics, documented explicitly; in-page gentle "analyzing" pulse on the watched element; single shared registry (INV-02).

**Should have (competitive differentiators):**
- **AI-decides-on-fire (notify-only into an agent loop)** -- competitors fire into a dumb channel; FSB fires into a reasoning agent. The point of the milestone.
- **Live-observe vs refresh-poll selectable per-trigger** -- sub-second reaction on live pages that poll-based monitors structurally cannot match. **FSB's genuine moat.**
- **Autopilot + MCP parity (single shared registry)** -- no competitor exposes change-monitoring as an MCP primitive alongside a full automation toolset.
- **Real-browser context (auth/JS/SPA) for free**; smart extraction with attribute override; blocking+detached dual mode.

**Defer (v0.11.x / v0.12+):**
- `% change` condition (reopens edge-vs-level baseline questions; not in the v1 condition list) -- P2.
- Compound conditions (AND/OR); explicit re-arm-on-fire opt-in -- P2/P3.
- Desktop/Chrome push notifications; auto-act-on-fire; change-history/diff-timeline UI -- P3 / explicitly out of scope.

**Anti-features (explicitly NOT built):** server-side/cloud hosting (FSB is local -- "browser must be open" is the honest limitation); own notification channel (notify-only); auto-act-on-fire (destroys the "AI decides" core value); level-triggered re-firing (notification storm); whole-page visual-diff; macro/multi-step pre-check; sub-30s refresh-poll.

### Architecture Approach

`trigger` bolts onto FSB's existing SW / content-script / MCP-bridge architecture as a **parallel trigger registry** -- copy the shape of four shipping subsystems, change the constants. NEW files (5) + MODIFIED files (8), no existing schema changes, no manifest changes. Fire evaluation lives in the SW (durable, re-hydratable) backed by `chrome.storage.session`; content scripts only read-and-report. The Lattice survivability adapter is evaluated and **deliberately NOT used** for trigger snapshots (lower risk, flat record not a Lattice `TState`, keeps the offscreen doc off the hot path -- the offscreen page evicts *before* the SW). (See [ARCHITECTURE.md](ARCHITECTURE.md).)

**Major components -- NEW (5):**
1. `extension/utils/trigger-store.js` -- `chrome.storage.session` snapshot envelope `{v:1, records:{[id]:snapshot}}`, key `fsbTriggerRegistry` (clone of `mcp-task-store.js`).
2. `extension/utils/trigger-lifecycle.js` -- per-trigger `chrome.alarms` (`fsbTrigger:<id>`), arm/clear/re-arm, SW-startup restore, tab-close cleanup (clone of `mcp-visual-session-lifecycle.js`).
3. `extension/utils/trigger-manager.js` -- arm/stop/evaluate/fire, the four fire conditions, smart value extraction, cap enforcement (mirrors `agent-registry.js`), tab binding.
4. `extension/content/trigger-observe.js` -- single-element debounced `MutationObserver` (live-observe), reports raw value deltas to the SW.
5. `mcp/src/tools/trigger.ts` -- 4 `server.tool()` registrations (1 blocking + 3 read-only/mutation).

**Major components -- MODIFIED (8):** `ai/tool-definitions.js` (TOOL_REGISTRY += 4 additive defs + `.cjs` mirror); `ws/mcp-tool-dispatcher.js` (route tables + `mcp:trigger-*` messages + ownership gate); `ws/mcp-bridge-client.js` (blocking `trigger()` heartbeat/settle handler); `background.js` (onAlarm branch + SW-startup restore + `chrome.tabs.onRemoved` cleanup); `content/messaging.js` (observe/read/pulse router cases); `content/visual-feedback.js` (analyzing-pulse glow variant + "watching" label); `mcp/src/runtime.ts` (call `registerTriggerTools`); `mcp/src/queue.ts` (`readOnlyTools` += `get_trigger_status`, `list_triggers`). **NO CHANGE:** `manifest.json`, all existing tool schemas (INV-01), `agent-loop.js` iterator (INV-04), Lattice package/adapter (INV-06).

### Critical Pitfalls

(Top 5 of 16 critical pitfalls; full catalog + recovery strategies in [PITFALLS.md](PITFALLS.md).)

1. **MCP TaskQueue starvation (the #1 risk).** A blocking `trigger()` in `queue.enqueue()` parks the single serialized mutation slot for hours, deadlocking every other tool incl. its own `stop_trigger`. **Avoid:** the watch loop runs in `background.js`, NOT the MCP handler; the blocking wait awaits a fire/timeout event without occupying the slot; `stop_trigger`/`get_trigger_status`/`list_triggers` MUST be in the read-only bypass set (mirror `get_task_status`). Non-negotiable: a caller must always be able to cancel a trigger it is blocked on.
2. **Service-worker eviction silently kills the watch (~30s idle).** A naive in-SW `setInterval`/closure loses the watch the moment the SW evicts -- "works in devtools, dies in the field" (INV-04's whole reason). **Avoid:** state lives in `chrome.storage`; the wake mechanism is `chrome.alarms` (survives eviction, revives the SW); on wake the SW rehydrates and re-evaluates. Floor refresh-poll at/above the ~30s alarm granularity. (No keepalive antipatterns -- those get the extension store-flagged and drain battery.)
3. **Blocking forever when the MCP transport can't sustain it.** Even with the queue fixed, hosts time out long calls (~60s default) despite progress notifications, and Chrome kills any single request >5 min. **Avoid:** emit 30s heartbeats (best-effort `resetTimeoutOnProgress`) AND auto-convert blocking -> detached past a safety ceiling, returning a `trigger_id` the caller polls -- the watcher never dies, only the blocking wait ends.
4. **Live-observe MutationObserver hazards** (leak / broad-subtree perf collapse / SPA re-render miss). Never-disconnected observers leak across navigation/re-injection; observing `document.body` on a ticker floods thousands of callbacks/sec; framework re-renders *replace* the watched node so a bound observer sees nothing. **Avoid:** pair every `.observe()` with guaranteed `.disconnect()` (on fire/stop/`beforeunload`/`pagehide`/re-injection, idempotent start, leak test); observe the narrowest node with `characterData`+`childList` (or `attributeFilter` for attributes), coalesce per batch; observe a stable container ancestor and **re-resolve the element by its uniqueness-scored selector each batch** (hook FSB's existing SPA-nav signals).
5. **Flapping / fire-storm + wrong numeric parse + INV-01 drift.** Level-trigger fires on every qualifying tick (storm into an agent loop); `parseFloat("1,234.56")` -> `1` and locale-blind parsing causes off-by-1000 false fires; editing shared `run_task` code in place risks byte-level wire drift. **Avoid:** edge-trigger + hysteresis + fire-once default; locale-aware normalize-then-parse, parse BOTH sides to Number before any comparison, NaN -> `parse_error` (never fire on a parse failure, never treat not-found as unchanged); register the 4 tools as purely *additive* new names/schemas (keep the schema-lock CI green, construct parallel envelopes -- never mutate `run_task`'s).

## Implications for Roadmap

**Two researchers (ARCHITECTURE, PITFALLS) independently proposed nearly the SAME phase decomposition.** This convergent build order is dependency-ordered (survivability/storage primitives FIRST because they are the crux and everything else needs them) and matches FSB's prior milestone discipline (lifecycle/ownership primitives before the MCP surface, as in v0.9.60 / v0.9.69). The blocking-return machinery reuses the most existing code (`_handleStartAutomation`) and is therefore lowest-risk *last*, after the watcher is proven.

### Phase 1: Storage + lifecycle primitives (the survivability foundation)
**Rationale:** MV3 survivability is the stated crux; nothing can be tested for eviction-survival until these exist. Both researchers put this first.
**Delivers:** `utils/trigger-store.js` (clone `mcp-task-store.js`, key `fsbTriggerRegistry`) + `utils/trigger-lifecycle.js` (clone `mcp-visual-session-lifecycle.js`: `fsbTrigger:<id>` alarm, restore, tab-close cleanup). Pure modules, Node-testable with mocked `chrome`; no behavior wired yet.
**Uses:** `chrome.alarms` + `chrome.storage.session` + the two proven sidecar templates.
**Avoids:** Pitfall 2 (SW eviction), Pitfall 3 (keepalive antipattern) -- designs for eviction from the start.

### Phase 2: Trigger manager + fire-condition engine + value extraction + cap
**Rationale:** The comparison/condition layer is the genuinely-new logic; it depends only on the storage primitives and is unit-testable in isolation.
**Delivers:** `utils/trigger-manager.js` -- arm/stop/evaluate/fire; the four conditions (changed/threshold/equals/contains); `value-extractor.js` smart extraction (`Intl.NumberFormat().formatToParts()` locale normalize; raw text for changed/contains; `extract` override); cap enforcement mirroring `agent-registry.js` (1-64, default 8, fail-loud `TRIGGER_CAP_REACHED`).
**Implements:** the trigger-manager component; the zero-dep numeric parser.
**Avoids:** Pitfall 9 (locale numeric parse -- parse both sides, NaN -> `parse_error`), Pitfall 10 (flapping -- edge-trigger + hysteresis + fire-once default), Pitfall 16 (duplicate fires -- atomic fire/disarm + dedupe key).

### Phase 3: SW glue -- onAlarm branch + SW-startup restore + tab-close cleanup
**Rationale:** This is the point at which refresh-poll *survives eviction* -- the milestone crux -- verifiable via alarm-tick tests. Depends on Phases 1-2.
**Delivers:** `background.js` -- the `fsbTrigger:` branch in the single `chrome.alarms.onAlarm` listener (before existing branches), `restoreTriggersFromStorage()` in the bootstrap pipeline, `chrome.tabs.onRemoved` trigger cleanup.
**Avoids:** Pitfall 2 (eviction survival, now end-to-end), Pitfall 15 (browser-restart reconcile -- rehydrate registry, reconcile vs `chrome.alarms.getAll()`, drop fired/expired, fail loud if tab gone).

### Phase 4: Content live-observe + read + pulse
**Rationale:** The genuine moat and the highest-risk runtime piece; needs the SW side (Phases 2-3) to receive its reports and drive pulses.
**Delivers:** `content/trigger-observe.js` (single-element debounced MutationObserver) + `content/messaging.js` router cases (`triggerObserveStart/Stop`, `triggerRead`, `triggerPulseStart/Stop`) + `content/visual-feedback.js` analyzing-pulse glow variant + `ViewportGlow` "watching" label.
**Uses:** `MutationObserver`, the `dom-stream.js` start/stop/debounce template, the `HighlightManager` glow.
**Avoids:** Pitfall 4 (observer leak -- disconnect everywhere + leak test), Pitfall 5 (broad-subtree perf -- narrowest node + `attributeFilter` + coalesce), Pitfall 6 (SPA re-render -- stable container + selector re-resolve each batch), Pitfall 8 (stale selector -- re-resolve via uniqueness scoring), UX overlay pitfalls (reduced-motion, guaranteed clear, no double-glow with `run_task`).

### Phase 5: Refresh-poll mechanism (tab-owning background reload)
**Rationale:** The server-style mechanism for static pages; depends on the SW glue (Phase 3) and the selector re-resolution shared with Phase 4.
**Delivers:** alarm-driven reload of the trigger's OWN tab in the background + re-read + evaluate; per-tab reload coalescing; interval floor + jitter; challenge-page detection.
**Uses:** `chrome.alarms`, v0.9.60 agent-scoped tab resolver (`resolveAgentTabOrError`), the existing `refresh`/page-stability path.
**Avoids:** Pitfall 7 (anti-bot -- hard floor + jitter + challenge detection -> `blocked`, never fire on a CAPTCHA page), Pitfall 14 (focus-steal -- own the tab, background reload, NEVER `tabs.query({active:true})`, `TAB_NOT_OWNED` on cross-agent), Pitfall 8 (stale selector -- not-found escalation, never silent unchanged).

### Phase 6: Tool registry + dispatcher routing (INV-01 / INV-02 verification point)
**Rationale:** Registration is meaningless until the watcher works; this is where the additive-only schema discipline is verified and where autopilot gains trigger access.
**Delivers:** `ai/tool-definitions.js` += 4 additive defs (regenerate `.cjs` mirror); `ws/mcp-tool-dispatcher.js` route tables += trigger aliases + `mcp:trigger-*` messages with the ownership gate.
**Avoids:** Pitfall 11 (INV-01 wire drift -- keep schema-lock CI green, only additions; INV-02 -- one registry feeds autopilot + MCP).

### Phase 7: MCP server tools + blocking return
**Rationale:** Reuses the most existing code (`_handleStartAutomation`) so it is lowest-risk last; closes the end-to-end MCP path. Depends on Phase 6.
**Delivers:** `mcp/src/tools/trigger.ts` (4 `server.tool()`), `runtime.ts` registration, `queue.ts` read-only set += `get_trigger_status`/`list_triggers`; `ws/mcp-bridge-client.js` blocking `trigger()` heartbeat/settle handler (clone the `_handleStartAutomation` shape with a trigger-specific timeout ceiling + `partial_state`/`sw_evicted` on eviction).
**Avoids:** Pitfall 1 (queue starvation -- read-only bypass for companions, watcher in background), Pitfall 13 (transport timeout -- 30s heartbeats + auto-convert blocking -> detached past the ceiling), Pitfall 12 (detached orphan -- owner binding + TTL + reap on disconnect/tab-close).

### Phase 8: Cap UI + polish + docs + edge cases
**Rationale:** Final composition + the conflict/coalescing edge cases that need the full system; the knock-on version bump.
**Delivers:** `control_panel.html` trigger-cap control next to the agent cap; CHANGELOG + mcp/README trigger docs; refresh-poll-vs-live-observe same-tab conflict (`TRIGGER_TAB_WATCH_CONFLICT`), co-located reload coalescing; `fsb-mcp-server@0.10.0` minor bump.
**Avoids:** the same-tab watch-mode conflict (Anti-Pattern 3), reload storms at scale.

### Phase Ordering Rationale

- **Dependency chain:** survivability primitives (1-3) must exist before eviction-survival can be tested (the crux); the condition engine (2) feeds the SW glue (3); content (4) and refresh-poll (5) both need the SW to receive reports and share the selector re-resolution layer; registration (6) and MCP (7) are meaningless until the watcher works; blocking-return (7) reuses the most code and is lowest-risk last.
- **Grouping by architecture:** the three NEW `utils/` modules cluster (1-3) because that is where every SW-survivable lifecycle helper already lives; content (4) is a separate module by design (not bolted onto `dom-stream.js`, to avoid the locked streaming watchdog/wire shape); the two watch mechanisms (4-5) share a selector layer; the MCP surface (6-7) is the thin additive cap.
- **Pitfall placement:** the crux pitfalls (2, 3, 15) land in the survivability phases; the moat pitfalls (4, 5, 6, 8) in live-observe; anti-bot/focus (7, 14) in refresh-poll; the MCP-contract pitfalls (1, 11, 12, 13) in registration + MCP.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase <N>`):
- **Phase 4 (content live-observe):** the highest-cost / highest-risk piece. Flagged open questions: **live-observe re-arm after navigation** (BF-cache/SPA-nav re-injection + observer re-attach + fire delivery to an evicted SW); the stable-container + per-batch selector re-resolution detail.
- **Phase 7 (MCP blocking return):** flagged open questions: the **blocking safety-ceiling value + detached TTL value** (concrete numbers -- "a few minutes" -> what); whether the `fire_envelope` is a flat record or borrows the Lattice Capability-Receipt shape.
- **Phase 3 / Phase 5 (survivability + refresh-poll):** flagged open question: **cross-browser-restart resume semantics** (auto-resume refresh-poll if tab/URL re-establishable vs `needs_attention`; live-observe needs the tab present).

Phases with well-documented in-tree patterns (skip research-phase):
- **Phase 1 (storage + lifecycle primitives):** near byte-for-byte clones of `mcp-task-store.js` + `mcp-visual-session-lifecycle.js`.
- **Phase 2 (cap + manager skeleton):** cap machinery mirrors `agent-registry.js`; condition logic is pure and well-specified (the locale-parse recipe is fully written in STACK.md).
- **Phase 6 (tool registry + dispatcher):** additive registration is the exact pattern every prior tool family used; guarded by existing schema-lock CI.

Deferred-feature research (NOT v0.11.0, but flagged for later milestones): **`% change` condition** (reopens edge-vs-level baseline); **K/M/B magnitude suffixes** in numeric extraction (support or explicitly reject -- a v1 decision but a v0.11.x expansion candidate).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `npm view` confirmed SDK `1.29.0` is current `latest` and zod `4.4.3` exists but is off FSB's line; MV3/`Intl` behaviors verified against official Chrome + MDN docs; zero-dep baseline read from `package.json`. |
| Features | HIGH | Prior-art behaviors verified against official docs/source (Distill docs, changedetection.io source + issue #2715, Playwright API, Binance help, Chrome MV3 lifecycle); v1 scope traced 1:1 to PROJECT.md target features. |
| Architecture | HIGH | Every named file/line verified against the working tree on `automation-worktree`; each new piece maps to a shipping precedent; integration points read directly from source. |
| Pitfalls | HIGH/MEDIUM | HIGH for MV3 lifecycle / MCP contract / MutationObserver / FSB integration (Chrome docs + MCP spec + source this session); MEDIUM for anti-bot reload thresholds and locale-parse edge tables (community + site-specific). |

**Overall confidence:** HIGH

### Gaps to Address

These are the researcher-flagged open questions that need resolution during planning/execution (they are *tuning/edge* decisions, not foundational risks):

- **Live-observe re-arm after navigation** (Phase 4): exact mechanism for re-attaching the observer + redelivering a fire after BF-cache restore / SPA route change to a possibly-evicted SW. Handle via dedicated phase research; the low-freq watchdog alarm is the proposed backstop.
- **Blocking safety-ceiling + detached TTL values** (Phase 7): PROJECT.md says "a few minutes" / "recommend detached beyond a few minutes" -- convert to concrete numbers (blocking ceiling, detached absolute TTL, reconnect grace). Decide during phase planning, document in REQUIREMENTS.
- **Cross-browser-restart resume semantics** (Phase 3/5): do triggers auto-resume from storage or require re-creation? Recommend refresh-poll auto-resume if tab/URL re-establishable; live-observe -> `needs_attention` if the tab is gone. Decide + document.
- **`% change` in v1** (deferred): out of the v0.11.0 condition list; confirm it stays P2 (reopens edge-vs-level baseline math).
- **K/M/B magnitude suffixes** (Phase 2): support `$1.2K`/`1.2M`/`1.2B` or explicitly reject -> `parse_error`. Pick a v1 stance and test it.
- **`fire_envelope` shape** (Phase 7): flat "what happened" record (old->new value, url, timestamp) vs a Lattice Capability-Receipt-shaped payload. Recommend flat for v0.11.0; receipt is a deferred candidate.

## Sources

### Primary (HIGH confidence)
- **FSB codebase (authoritative for integration)** -- `extension/ai/tool-definitions.js` (shared registry, INV-01/02 surface), `mcp/src/tools/autopilot.ts` (`run_task` lifecycle template), `mcp/src/queue.ts` (TaskQueue serialization + read-only bypass), `mcp/src/tools/schema-bridge.ts` (JSON-Schema->zod + numeric coercion), `extension/utils/mcp-task-store.js` (snapshot store template), `extension/utils/mcp-visual-session-lifecycle.js` (alarm+storage+restore template), `extension/ws/mcp-bridge-client.js:979-1158` (blocking heartbeat/settle/600s/partial_state), `extension/content/dom-stream.js` (MutationObserver template), `extension/content/visual-feedback.js` (orange-glow + reduced-motion + beforeunload disconnect), `extension/utils/agent-registry.js` + `agent-tab-resolver.js` (cap + tab ownership), `extension/ai/lattice-runtime-adapter.js` (adapter -- evaluated, deliberately not used), `extension/background.js:13284` (onAlarm dispatcher), `extension/manifest.json` (permissions already granted), root `package.json` (zero-dep baseline), `.planning/PROJECT.md` (milestone scope + INV-01/02/03/04/06).
- **Chrome MV3 official docs** -- service-worker lifecycle (30s idle eviction, 5-min request ceiling, event-revival); `chrome.alarms` reference (30s/0.5-min floor from Chrome 120, `persistAcrossSessions` Chrome 150+); Chrome 120 beta notes (alarm floor aligned to SW lifecycle).
- **MDN** -- `MutationObserver` (page-lifetime observation), `disconnect()` (leak if never disconnected), `attributeFilter`/`takeRecords`; `Intl.NumberFormat().formatToParts()` (locale group/decimal reverse-parse).
- **MCP TypeScript SDK (Context7, v1.29.0)** + `modelcontextprotocol.io` Tasks overview -- `server.tool`, `notifications/progress`, `_meta.progressToken`, `resetTimeoutOnProgress`/`maxTotalTimeout`, durable-handle-vs-blocking direction (SEP-1391, 2025-11-25 Tasks primitive).
- **`npm view`** -- `@modelcontextprotocol/sdk` `latest = 1.29.0` (no bump needed); `zod = 4.4.3` (off FSB's v3 line).
- **changedetection.io** -- source + issue #2715 (edge-vs-level fire confusion, real-world verified); Playwright Page API (`waitForFunction`/`waitForSelector`).

### Secondary (MEDIUM confidence)
- Web change monitors -- Distill.io docs, Visualping blog, Browse AI docs (condition vocabulary, interval tiers, region selection, webhook delivery).
- Price/crypto trackers -- Keepa/CamelCamelCamel comparisons, Binance/Coinbase price-alert help (above/below, "Change is Over", 24H change).
- Synthetic/uptime monitors -- Cronitor, UptimeRobot, Google Cloud uptime (assertion grammar, 30s/1/5/15-min intervals).
- Flapping/hysteresis literature -- Splunk Lantern, Datadog recovery thresholds, Prometheus `keep_firing_for`, Grafana #6202.
- MutationObserver perf/leak -- whatwg/dom#482, fsjs.dev, nolanlawson.com, dev.to "every observer disconnected" test pattern.
- MCP transport timeouts -- modelcontextprotocol/inspector#880, anthropics/claude-code#58687 (hosts time out long calls despite progress).
- chromium-extensions group (alarms wake the SW; ~30s/1min minimum reality).

### Tertiary (LOW confidence -- needs validation during planning)
- arxiv 2311.10911 (reCAPTCHAv2 study -- quick-succession reloads -> CAPTCHA ~14 tries human / immediate for automation) and ScraperAPI anti-bot blog -- anti-bot reload thresholds are site-specific; use to justify the floor + jitter + challenge-detection posture, not exact numbers.
- xjavascript.com locale-parsing posts -- confirm `parseFloat` is locale-blind; the concrete locale edge table (DE/FR/NBSP/parens/`%`) should be validated via tests during Phase 2.

---
*Research completed: 2026-06-15*
*Ready for roadmap: yes*
