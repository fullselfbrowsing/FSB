# Pitfalls Research -- v0.11.0 Trigger Tool (Reactive DOM Monitoring)

**Domain:** Long-running reactive DOM watcher (change / threshold / equals / contains) on a Chrome MV3 extension + MCP server, with per-trigger refresh-poll or live-observe, blocking + detached reporting, MV3-survivable, notify-only.
**Researched:** 2026-06-15
**Confidence:** HIGH for MV3 lifecycle / MCP contract / MutationObserver mechanics (Chrome official docs + MCP spec + FSB source verified this session); MEDIUM for anti-bot reload thresholds and locale-parsing edge tables (community + verified-but-site-specific); HIGH for FSB-internal integration points (read from source this session).

> **Scope note:** this catalog is deliberately specific to *this* feature on *this* codebase. It cites the exact FSB files/patterns the trigger must reuse or avoid breaking. Generic web-app advice is omitted. Prior-milestone telemetry pitfalls were archived to `PITFALLS-v0.9.69-TELEMETRY.md`.

**FSB source inspected this session:**
- `mcp/src/queue.ts` -- `TaskQueue` serializes all non-read-only tools; read-only set bypasses (`get_task_status` etc.)
- `mcp/src/tools/autopilot.ts` -- `run_task` 600s safety net (`:130`), 30s heartbeat `onProgress`→`notifications/progress` reshape (`:88-100`), `sw_evicted` + `partial_state` snapshot recovery (`:138-196`)
- `extension/ai/agent-loop.js` -- `setTimeout`-chained iterator (INV-04, `:2003/:2702/:2771`), warm-state auto-resume (`:1238-1257`)
- `extension/utils/mcp-task-store.js` -- `FsbMcpTaskStore` persisted snapshot store
- `extension/utils/agent-tab-resolver.js` -- `resolveAgentTabOrError` agent-scoped tab resolution
- `extension/utils/agent-registry.js` -- tab ownership, `onCreated` openerTabId binding
- `extension/utils/mcp-visual-session-lifecycle.js` -- alarm-based `mcpVisualDeath:<tabId>` death timers + storage replay (`:469`, `:557`)
- `extension/content/visual-feedback.js` -- orange glow, reduced-motion `@media` (`:1601`), `beforeunload` observer disconnect (`:2244`)
- `extension/content/dom-stream.js` / `dom-state.js` / `actions.js` -- existing `observe()`/`disconnect()` discipline; two-tier watchdog
- `extension/content/selectors.js` -- uniqueness-scored selectors
- `extension/content/lifecycle.js` -- SPA navigation hooks (`:453-513`), BFCache `pageshow` (`:623`)
- `extension/background.js` -- `chrome.alarms.onAlarm` (`:13284`), `tabs.onRemoved` (`:13163`), ordered bootstrap, idempotent `alarms.create` (`:13481`)

---

## Critical Pitfalls

### Pitfall 1: Blocking the MCP TaskQueue for hours (queue starvation)

**What goes wrong:**
`trigger()` in blocking-default mode holds its MCP request open for minutes-to-hours. If registered like a normal mutation tool, it runs through `TaskQueue.enqueue()` in `mcp/src/queue.ts`, which **serializes all non-read-only tools** (`process()` runs one item, awaits it fully, then the next). A blocking trigger parks the single mutation slot for the entire watch window -- every subsequent `run_task`, `click`, `navigate`, `type_text`, even `stop_trigger`, queues behind it and the caller cannot cancel its own trigger. With a multi-trigger cap up to 64, the first blocking trigger deadlocks the rest.

**Why it happens:**
The trigger is modeled on `run_task`'s "block-and-return-on-completion" lifecycle (Phase 239), so the instinct is to copy the `queue.enqueue('run_task', ...)` wrapper. But `run_task` blocks for a *bounded* task with a 600s safety net (`autopilot.ts:130`); a trigger is intentionally unbounded.

**How to avoid:**
- The watch *loop* must NOT live inside the MCP request handler. Start the watcher in the extension (background); the MCP `trigger()` handler merely *awaits a fire/timeout event* without occupying the mutation slot -- treat the blocking wait like a read-only tool (queue bypass, `queue.ts:30`) OR resolve immediately with a `trigger_id` and stream fires via `notifications/progress`.
- `stop_trigger`, `get_trigger_status`, `list_triggers` MUST be in the read-only bypass set (mirror `get_task_status`, `queue.ts:33`) so they always work even while a blocking trigger is outstanding. Non-negotiable: a caller must be able to cancel a trigger it is blocked on.
- Companion-tool dispatch and the watch loop run in `background.js`, never gated by the single-flight `run_task` uses.

**Warning signs:**
A second tool call from the same client hangs indefinitely; `stop_trigger` itself times out; `run_task` returns the queue-timeout error (`mcp/src/errors.ts:27`) whenever a trigger is active.

**Phase to address:** MCP contract & tool-lifecycle phase (registers `trigger` + companions, wires queue bypass).

---

### Pitfall 2: Service-worker eviction silently kills the watch (~30s idle)

**What goes wrong:**
The MV3 service worker is terminated after **30 seconds of inactivity** (Chrome official lifecycle docs). A naive trigger holding state in an in-SW `setInterval`/`setTimeout`/closure loses the entire watch the moment the SW is evicted -- the user thinks the price is watched for hours; monitoring actually stopped 30s after the last activity and never fired.

**Why it happens:**
Developers test for 1-2 minutes with devtools open (which keeps the SW alive) and never observe a real eviction. "Works on my machine," dies in the field. This is INV-04's whole reason for existing.

**How to avoid:**
- **State lives outside the SW heap.** Persist each trigger's spec + last-seen value + armed/fired status to `chrome.storage`, exactly as `run_task` uses `globalThis.FsbMcpTaskStore` (`extension/utils/mcp-task-store.js`) and `mcp-visual-session-lifecycle.js` persists death timers.
- **Wake mechanism is `chrome.alarms`, not `setInterval`.** Alarms survive eviction and wake the SW (FSB already does this for `fsb-telemetry-beat`, the dom-stream watchdog, and `mcpVisualDeath:<tabId>` -- `background.js:13284` `onAlarm`). On wake, the SW rehydrates trigger state from storage and re-evaluates.
- **chrome.alarms minimum period is ~30s (Chrome 120+; effectively 1 min on older builds).** You cannot poll faster than that via alarms. Floor the refresh-poll interval accordingly (PROJECT.md proposes ~60s default -- keep the hard floor at or above alarm granularity).
- For live-observe, the MutationObserver lives in the *content script* (which survives SW eviction); it reports fires to the SW, and a periodic alarm acts as a safety re-arm if the SW was asleep when a report arrived (the two-tier pattern already shipped for DOM streaming: `chrome.alarms` SW-side + `setTimeout` content-side, Phase 211).

**Warning signs:**
Triggers fire reliably ~30s then never again; `get_trigger_status` shows `last_checked_at` stops advancing; fires only arrive when unrelated activity wakes the SW.

**Phase to address:** MV3 survivability phase (alarm-driven watch loop + storage-backed trigger registry). The crux phase per PROJECT.md.

---

### Pitfall 3: Keepalive antipatterns that get the extension flagged/rejected

**What goes wrong:**
To "fix" eviction, developers add a forever keepalive -- a self-pinging `setInterval` calling `chrome.runtime.getPlatformInfo()` every 20s, a perpetual dummy port, or an idle WebSocket whose only job is to reset the timer. These pin the SW 24/7, drain battery, and are exactly what Chrome Web Store reviewers flag as abusive. They also violate INV-04's spirit (survive eviction, don't prevent it).

**Why it happens:**
Keepalive hacks are the top StackOverflow/Medium answer for "MV3 SW keeps dying" and appear to make the problem vanish in testing.

**How to avoid:**
- **Design for eviction, not against it.** Let the SW die; resume from `chrome.alarms` + storage (Pitfall 2). The only sanctioned long-running pattern.
- Legitimate nuance: FSB's MCP bridge holds a WebSocket to `ws://localhost:7225` (`extension/ws/mcp-bridge-client.js`), and per Chrome 116+ WebSocket *message activity* resets the idle timer. That is incidental, only applies while an MCP client is actively connected/heartbeating, and is NOT a substitute for alarm-based survivability -- it MUST NOT be relied on for autopilot-initiated triggers (no bridge) or detached triggers (caller disconnected). Do not add a heartbeat *whose purpose is to keep the SW alive*.
- Never exceed the **5-minute single-request ceiling** -- a blocking handler that genuinely blocks one request >5 min is killed by Chrome regardless. This is the hard reason blocking mode must be alarm-driven internally and steer long blocks to detached (Pitfall 13).

**Warning signs:**
SW shows permanently "active" in `chrome://serviceworker-internals`; battery/CPU complaints; a `setInterval` whose body only calls a no-op chrome API.

**Phase to address:** MV3 survivability phase (document "no keepalive; alarm-resume only" as a success criterion).

---

### Pitfall 4: Never-disconnected MutationObserver (observer leak across navigation / re-injection)

**What goes wrong:**
A live-observe trigger creates `new MutationObserver(...)` on the watched subtree but never `disconnect()`s on fire, on `stop_trigger`, on navigation, or on content-script re-injection. Each navigation/BFCache restore re-injects the content script and spins up *another* observer; old ones keep their target nodes alive (documented leak, whatwg/dom#482) and keep firing against detached/stale DOM. On a long watch this compounds into runaway memory and duplicate fires.

**Why it happens:**
The observer is wired to start but teardown paths are easy to miss -- especially implicit ones (SW eviction, tab discard, SPA route change, re-injection).

**How to avoid:**
- Centralize observer lifecycle like FSB already does: `visual-feedback.js:2244` disconnects observers on `beforeunload` (VIS-07: "disconnect MutationObservers to prevent orphaned observers on BFCache navigation"); `dom-state.js` and `actions.js` pair every `.observe()` with a guaranteed `.disconnect()`. Reuse that discipline: one observer registry per content-script instance, disconnect-all on `beforeunload`/`pagehide` and on stop.
- Idempotent start: before observing, disconnect any prior observer for the same trigger_id (don't stack).
- On fire (fire-once triggers), disconnect immediately.
- Add a test asserting every observer created is disconnected (the dev.to "every MutationObserver disconnected" pattern) -- FSB content modules are Node-mock testable.

**Warning signs:**
Memory climbs steadily over a multi-hour watch; duplicate fire reports; callbacks firing after `stop_trigger`; tab-discard warnings.

**Phase to address:** Live-observe watch-mechanism phase.

---

### Pitfall 5: Observing too broad a subtree (perf collapse on busy pages)

**What goes wrong:**
A crypto/stock ticker mutates hundreds of nodes/sec. Observing `document.body` with `{ subtree: true, childList: true, characterData: true, attributes: true }` floods the callback with thousands of `MutationRecord`s, each of which the trigger scans to find its one element -- main-thread peg, jank, dropped frames on the very pages live-observe is meant for.

**Why it happens:**
Copy-pasting the broad `observe(document.body, {childList:true, subtree:true})` pattern (which FSB uses intentionally for *whole-page* DOM streaming, `dom-stream.js:761`, `dom-state.js:52`) onto a *single-element* watch.

**How to avoid:**
- Observe the **narrowest node containing the watched value**, not `document.body`. Text → observe that element with `{ characterData: true, subtree: true }`. Attribute (e.g. `aria-valuenow`, `data-price`) → `{ attributes: true, attributeFilter: ['the-one-attr'] }` (`attributeFilter` is the documented fix to cut record volume -- MDN; fsjs.dev).
- Match observer config to `extract` mode: text/number → `characterData`+`childList` on the element; attribute → `attributes`+`attributeFilter`. Do NOT enable `attributeOldValue`/`characterDataOldValue` unless a `changed` diff genuinely needs the prior value (they bloat records).
- Coalesce: within a batch, read the element's *current* value once and compare -- never process records individually.
- Throttle evaluation (rAF/debounce, at most every N ms) so a 500-mutation burst yields one threshold check, mirroring FSB's mutation-queue coalescing in `dom-stream.js`.

**Warning signs:**
Page janky only while a trigger is active; CPU spikes on ticker pages; callback invocation count in the thousands/sec.

**Phase to address:** Live-observe watch-mechanism phase.

---

### Pitfall 6: Missed changes on SPA re-render (observer detached from a replaced node)

**What goes wrong:**
On React/Angular/Vue, a re-render often *replaces* the watched node rather than mutating it in place. A MutationObserver bound to the old node sees nothing after the swap -- the value updates visibly but the trigger never fires. `characterData` observation silently misses changes when the framework swaps the whole text node.

**Why it happens:**
MutationObserver observes specific node instances; it does not "follow" a logical element across re-mounts. The diffing literature (whatwg/dom#482) notes broad single-root observation is the only robust catch-all -- conflicting with Pitfall 5.

**How to avoid:**
- Observe a **stable container ancestor** with `{ childList: true, subtree: true }` and, each batch, **re-resolve the watched element by its uniqueness-scored selector** (`extension/content/selectors.js`) before reading. The container survives child re-renders; the selector re-find tolerates node replacement.
- FSB already detects SPA navigation via `pushState`/`replaceState`/`popstate` (`lifecycle.js:453-513`). Hook trigger re-resolution to those signals; on route change, re-resolve and (if not found) apply stale-element policy (Pitfall 8).
- Prefer a stable selector anchor (ARIA/role/`data-testid`) over class-hash selectors for the container, consistent with FSB's "aria/role-first / data-testid-first" decisions (PROJECT.md Key Decisions).

**Warning signs:**
Trigger works on static pages but never fires on a React dashboard; value visibly changes but `last_seen_value` frozen; fires only after a full reload.

**Phase to address:** Live-observe watch-mechanism phase (selector re-resolution integration).

---

### Pitfall 7: Rapid refresh-poll trips anti-bot defenses (rate-limit, CAPTCHA, IP block)

**What goes wrong:**
Refresh-poll reloads the page on an interval. Too-frequent reloads from one client look exactly like scraping: sites respond with 429s, inject CAPTCHAs, or IP-block. Research shows a checkbox-CAPTCHA flow reloaded in quick succession serves an image CAPTCHA after ~14 tries even for humans, and *immediately* for automation-fingerprinted browsers. Once CAPTCHA'd/blocked, the trigger reads garbage (the challenge page) and may fire on wrong content or never fire.

**Why it happens:**
The instinct is "poll fast for fresh data." But this watches things like Amazon prices that change on minute/hour scales, not seconds.

**How to avoid:**
- **Hard interval floor + sane default.** PROJECT.md proposes ~60s default with a hard floor -- enforce the floor extension-side; reject/clamp sub-floor requests. Never allow alarm-granularity (~30s) reloads as default.
- Add light **jitter** so reloads aren't metronomic (a fixed-period reload is itself a bot signal).
- **Detect the challenge page and stop, don't fire.** After reload, if the element/selector is missing AND the page looks like a CAPTCHA/block (FSB has cookie-consent/overlay detection from v0.9.11 and a "CAPTCHA detection" backlog item), surface `blocked`/`needs_attention` instead of evaluating -- never fire on challenge content.
- Reuse the existing page-stability wait (`waitForPageStability`/`read_page` auto-stability, v0.9.11) so the value is read after the reload settles.
- Document `live-observe` as preferred for anything updating faster than ~1/min; refresh-poll is for static listings.

**Warning signs:**
Status flips to error/blocked after N reloads; `last_seen_value` becomes a CAPTCHA string; site returns 429; fires stop after a burst.

**Phase to address:** Refresh-poll watch-mechanism phase.

---

### Pitfall 8: Stale selector after reload / re-render (element lost)

**What goes wrong:**
The trigger captures a selector at creation. After a reload (refresh-poll) or SPA re-render the original selector no longer matches -- the site changed markup, an A/B variant rendered, or a class hash rotated. The trigger silently reads `null`, treats "element gone" as "value unchanged," and never fires; or matches a *different* element with the same selector and watches the wrong thing.

**Why it happens:**
Selectors are captured once and assumed stable. Real sites mutate markup between loads.

**How to avoid:**
- **Re-resolve the element every poll/batch via FSB's uniqueness-scored machinery** (`extension/content/selectors.js`), not a frozen CSS string. FSB's whole value prop is robust targeting with uniqueness scoring + coordinate fallback (PROJECT.md "Validated: precise element targeting with uniqueness-scored selectors") -- reuse it, don't hand-roll `querySelector`.
- Persist enough to re-find: the scored selector + a couple of fallback anchors (text content, role, nearby landmark); on miss, attempt fallback resolution before declaring the element gone.
- **Distinguish three states explicitly:** value-unchanged, value-changed (→ evaluate), element-not-found (→ `needs_attention`, do NOT silently treat as unchanged, do NOT fire). Not-found across K consecutive polls escalates to the caller.

**Warning signs:**
`last_seen_value` becomes `null`/empty after a reload; a `changed` trigger never fires on a page you know is changing; trigger fires on obviously wrong data.

**Phase to address:** Both watch-mechanism phases (shared selector re-resolution layer); not-found policy in the trigger-lifecycle/status phase.

---

### Pitfall 9: Numeric/threshold parsing wrong across locales and formats

**What goes wrong:**
"Smart numeric extraction" strips `$` and commas then `parseFloat`. But `parseFloat("1,234.56")` → `1` (stops at comma); German `"1.234,56"` (= 1234.56) yields 1.23456 or 1234.56 unpredictably; `"1 234,56"` (French NBSP thousands) breaks; `"€1.234,-"`, `"12,5 %"`, `"$1.2K"`, `"1.2M"`, `"(123.45)"` (accounting negative) all mis-parse. A threshold `>= 1000` then fires (or fails) on garbage. Comparing a string to a number is a classic trap: `"1,050" < 1000` is `true` (string coercion) -- a false fire.

**Why it happens:**
`parseFloat`/`Number` are locale-blind (verified: JS built-ins do not honor locale separators). Test data is US-formatted, so the bug hides until a EUR/INR/JPY page.

**How to avoid:**
- Normalize before compare with explicit rules, not blind stripping: detect the decimal separator (the *last* `.` or `,` with ≤2-3 trailing digits is usually decimal; the other is thousands), strip currency symbols/NBSP/spaces/`%`, handle parentheses-negative, handle `K`/`M`/`B`/`bn` suffixes (or explicitly reject them).
- Consider an `Intl.NumberFormat`-derived approach or a tiny locale-aware normalizer; at minimum support an explicit `locale`/`decimal_separator` override for ambiguous cases.
- **Always parse both sides to Number before any `>=/<=/>/<`.** Never compare a raw string with a numeric threshold. `equals` numeric → compare parsed numbers with tolerance; `equals` text / `contains` / `regex` → operate on the raw (trimmed) string, never the parsed number. This split is in the spec (`number` vs raw `text`) -- enforce it in code.
- If parsing fails (NaN), do NOT fire and do NOT treat as 0 -- surface `parse_error` in status so the user can switch `extract` mode or supply a locale.

**Warning signs:**
Threshold fires immediately on a large-looking string; never fires on a EUR/JPY page; numeric `last_seen_value` is `NaN`/`0` while the text clearly shows a number; off-by-1000 errors.

**Phase to address:** Value-extraction / fire-condition phase.

---

### Pitfall 10: Flapping / oscillation near a threshold (fire storm)

**What goes wrong:**
A price hovers at the threshold (e.g. `>= 100` while value bounces 99.98 ↔ 100.02 each tick). A naive "fire whenever condition true" emits a fire on every crossing -- a notification storm. For `changed`, a value toggling between two states fires endlessly.

**Why it happens:**
"Fire when condition true" is evaluated each tick with no memory of prior state. The monitoring literature (Splunk/Datadog/Prometheus) calls this flapping; the fix (hysteresis / `keep_firing_for` / edge-trigger) is well known but easy to omit.

**How to avoid:**
- **Edge-trigger, not level-trigger.** Fire on the *transition* not-satisfied → satisfied, using persisted prior state (`last_seen_value` + `was_satisfied`), not on every satisfied evaluation.
- **Fire-once is the safe default** (disarm after first fire; matches notify-only intent). Offer explicit `repeat`/`re-arm` as opt-in; when re-arming, require the condition to *clear* first (hysteresis): for `>= X`, re-arm only after value drops below `X - margin`; for `changed`, re-arm only after a stable read. Borrow Datadog recovery-threshold / Prometheus `keep_firing_for`.
- Optional **debounce / confirmation window**: require the condition to hold for N consecutive reads (or M ms) before firing, to ride out a single noisy tick.

**Warning signs:**
Dozens of fires within a minute for one trigger; fires in tight bursts whenever the value sits near threshold; a `changed` trigger that never stops.

**Phase to address:** Fire-condition / threshold-evaluation phase.

---

### Pitfall 11: INV-01 wire-contract drift on existing tools

**What goes wrong:**
Adding `trigger` "while you're in there" nudges an existing tool's schema -- adding a shared `agent_id`/`trigger_id` field to a common Zod schema, renaming a `change_report` field, or altering the `run_task` heartbeat `_meta` shape (`autopilot.ts:88-100`). Any byte-level change to an existing MCP tool's request/response breaks INV-01 and silently breaks every connected client (Claude Code, Codex, OpenClaw).

**Why it happens:**
Triggers reuse so much `run_task` machinery (heartbeats, partial_state, agent scoping) that it's tempting to edit shared code in place rather than add alongside.

**How to avoid:**
- **`trigger` + companions are purely additive new tools** (PROJECT.md INV-01). New names, new schemas; do not touch existing tool schemas.
- FSB already locks this with schema/contract tests (v0.9.62 schema-lock suite, `tests/`); keep the existing suite green and add the four tools as *additions*, not edits.
- If a heartbeat/progress shape is reused, reuse it by *constructing the same envelope* for the new tool -- do not refactor `run_task`'s `onProgress` closure into a shared mutated function that could change `run_task`'s bytes.
- Keep the single registry (INV-02): register the four tools once in `extension/ai/tool-definitions.js` so autopilot and MCP see identical definitions (the `.cjs` mirror feeds `mcp/src/queue.ts`). No autopilot-only trigger path.

**Warning signs:**
Schema-lock/contract tests go red; a client that worked yesterday rejects a tool result; diff on `autopilot.ts`/`read-only.ts`/`schema-bridge.ts` touches existing tool blocks.

**Phase to address:** MCP contract phase (additive registration); guarded by the existing schema-lock CI gate.

---

### Pitfall 12: Detached-trigger orphaning (resource leak / zombie watcher)

**What goes wrong:**
A caller starts a detached trigger (gets a `trigger_id`), then disconnects/crashes/forgets to poll and never calls `stop_trigger`. The alarm-driven watcher keeps reloading the page or observing forever -- a zombie that drains resources, keeps a tab busy, and counts against the concurrent-trigger cap, eventually exhausting it so no new triggers can start.

**Why it happens:**
Detached mode deliberately decouples the watcher from the request lifecycle (the point), removing the natural "request closed → stop" signal blocking mode has.

**How to avoid:**
- **Every trigger needs an owner + a TTL/ceiling.** Mirror FSB's `connection_id`-keyed reconnect grace and `run_task`'s 600s safety net: detached triggers get a max lifetime (PROJECT.md: "recommend detached beyond a few minutes" -- give detached its own absolute ceiling, e.g. expire after N hours unless refreshed).
- Bind triggers to the agent/connection (FSB binds tabs to agents via `agent-registry.js` + `agent-tab-resolver.js`); when the owning connection is gone past the reconnect grace, auto-stop its detached triggers and free the cap slot (analogous to v0.9.60 pool-shrink release).
- On tab close (`chrome.tabs.onRemoved`, wired for visual sessions at `background.js:13163`) auto-stop triggers targeting that tab.
- `list_triggers` exists precisely to find/reap zombies -- surface age, owner, last-checked.

**Warning signs:**
`list_triggers` shows triggers with no recent poll and a long-gone owner; cap exhausted (`TRIGGER_CAP_REACHED`) with mostly-idle triggers; tabs reloading with no client attached.

**Phase to address:** Trigger-lifecycle phase (TTL, owner binding, auto-reap on disconnect/tab-close).

---

### Pitfall 13: Blocking forever when MCP transport can't sustain it

**What goes wrong:**
Blocking mode is default; a caller blocks `trigger()` for hours. Even with the queue fixed (Pitfall 1), the MCP transport/host imposes timeouts: the default MCP tool-call timeout is ~60s, and many hosts time out long calls despite progress notifications (verified: modelcontextprotocol/inspector#880, anthropics/claude-code#58687). The blocking call dies client-side while the watcher keeps running server-side -- orphaned and confusing.

**Why it happens:**
"Blocking by default mirrors `run_task`" -- but `run_task` is bounded (600s) and emits 30s heartbeats specifically so the client's `resetTimeoutOnProgress` keeps it alive. A multi-hour trigger blows past any reasonable client ceiling.

**How to avoid:**
- **Emit heartbeats** on the same 30s cadence as `run_task` (`mcp-bridge-client.js` 30s `setInterval` → `notifications/progress`, reshaped at `autopilot.ts:88`) so hosts honoring `resetTimeoutOnProgress` keep the blocking call alive -- but know this is best-effort and host-dependent.
- **Force/recommend detached past a threshold.** PROJECT.md already says "recommend detached beyond a few minutes." Make it concrete: blocking mode has a safety ceiling (a few minutes) after which it auto-converts to detached and returns the `trigger_id` so the caller polls -- the watcher never dies, only the blocking wait ends. Matches the MCP-spec direction (Tasks / durable-handle, SEP-1391 / 2025-11-25 Tasks primitive).
- Document clearly in the tool description (like `run_task`'s long description) when to use blocking vs detached, and that long watches should be detached.

**Warning signs:**
Blocking `trigger()` returns a client-side timeout while `get_trigger_status` shows the trigger still alive; users report "it said it failed but then it fired later."

**Phase to address:** MCP contract phase (heartbeat + blocking-ceiling-to-detached conversion).

---

### Pitfall 14: Refresh-poll steals focus / disrupts other tabs & agents

**What goes wrong:**
A refresh-poll trigger reloads "the active tab" via `chrome.tabs.reload`/`chrome.tabs.query({active:true})`. But the user (or another agent) has switched tabs -- so the trigger reloads the *wrong* tab, or activates its tab and steals focus mid-reload, yanking the user away or disrupting a parallel `run_task`/another trigger. With concurrent triggers this is chaos.

**Why it happens:**
`chrome.tabs.query({active:true})` is the lazy way to get "a tab," and reload defaults can change activation. FSB explicitly fought this in v0.9.60 (Phase 246).

**How to avoid:**
- **Refresh-poll must own its tab and reload it in the background.** PROJECT.md is explicit: "Periodic reloads target the trigger's own tab and must not steal focus or disrupt other agents/tabs (reuse v0.9.60 agent-scoped tab resolution + background-tab defaults)." Resolve the target via `agent-tab-resolver.js` (`resolveAgentTabOrError`) -- NEVER `chrome.tabs.query({active:true})` (FSB removed that everywhere except synthesized legacy agents, Phase 246).
- Reload without activating (`chrome.tabs.reload(tabId)` does not activate by default -- verify and keep it so); never call `chrome.tabs.update({active:true})` in the poll path.
- Respect tab ownership: a trigger reloading a tab owned by another agent must reject with `TAB_NOT_OWNED` (reuse the v0.9.60 ownership gate), not reload it.

**Warning signs:**
The user's foreground tab reloads under them; a parallel `run_task` reports its page reloaded out from under it; focus jumps when a trigger polls.

**Phase to address:** Refresh-poll watch-mechanism phase (tab ownership + background reload).

---

### Pitfall 15: Inconsistent behavior on browser restart / SW reload

**What goes wrong:**
After a full browser restart (or extension reload), in-memory triggers are gone but `chrome.alarms` and `chrome.storage` persist. If an alarm fires post-restart but the SW didn't rehydrate the trigger registry from storage on startup, the alarm finds no trigger and either no-ops (silent loss) or throws. Conversely, stale fired/expired triggers not cleaned on boot may re-arm spuriously.

**Why it happens:**
The startup/bootstrap path (FSB has an ordered bootstrap, `background.js` v0.9.24 Phase 160) must explicitly rehydrate and reconcile the trigger registry -- easy to forget that alarms outlive the heap.

**How to avoid:**
- On SW startup (`chrome.runtime.onStartup` / bootstrap), rehydrate the registry from storage, reconcile against `chrome.alarms.getAll()`, drop expired/fired-and-disarmed triggers, re-arm the rest. Mirror FSB's warm-state resume (`agent-loop.js:1238`) and how `mcp-visual-session-lifecycle.js` rebuilds death-timer alarms from persisted entries (`background.js:557` comment).
- Make tab-bound triggers fail loud if their tab no longer exists after restart (tab id gone): set `needs_attention`/`stopped(tab_gone)` rather than silently dropping.
- Decide and document restart semantics: do triggers auto-resume, or require re-creation? (Recommend: refresh-poll auto-resumes if the tab/URL can be re-established; live-observe needs the tab present, else `needs_attention`.)

**Warning signs:**
After restarting Chrome, `list_triggers` is empty though triggers were active; alarms fire into the void (logs show alarm with no matching trigger); a fired trigger re-fires after restart.

**Phase to address:** MV3 survivability phase + trigger-lifecycle phase (bootstrap rehydration & reconciliation).

---

### Pitfall 16: Duplicate fires (double-delivery)

**What goes wrong:**
The same fire is reported twice: once by the content-script live-observe report and once by the safety-net alarm re-check that runs before the "fired" flag is persisted; or a blocking caller AND a detached poll both receive the fire. The user gets two notifications, or acts twice.

**Why it happens:**
Two independent paths (content report + alarm safety-net; blocking wait + status poll) race, and the disarm/fired flag isn't written atomically before delivery.

**How to avoid:**
- **Single source of truth for fired state**, persisted in storage, written before delivery. Use a monotonic fire sequence / dedupe key (`trigger_id` + fire-seq) so consumers dedupe.
- The alarm safety-net must check the persisted `fired`/`armed` flag and no-op if already fired (idempotent), like FSB's idempotent alarm patterns ("`chrome.alarms.create` with the same name replaces," `background.js:13481`).
- For fire-once triggers, disarm atomically on first fire so the second path sees disarmed.

**Warning signs:**
Two identical fire reports with the same value/timestamp; a blocking return AND a status poll both showing the same fire as new.

**Phase to address:** Fire-condition / trigger-lifecycle phase (atomic fire/disarm + dedupe key).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-SW `setInterval` watch loop (skip alarms+storage) | Trivial; works in devtools | Dies on every ~30s eviction; silent monitoring loss; the headline bug | **Never** -- violates INV-04; alarm+storage mandatory |
| Single frozen CSS selector (no re-resolution) | Simpler poll code | Breaks on reload/SPA re-render; wrong-element fires | Never for refresh-poll; only same-page live-observe re-validated each batch |
| `parseFloat` after stripping `$,` only | Fast; passes US tests | Wrong on every non-US locale; off-by-1000 fires | MVP only if locale pinned/known; ship locale-aware before GA |
| Blocking trigger inside `queue.enqueue` like run_task | Mirrors existing pattern | Starves the whole mutation queue for hours | Never -- bypass queue or run watcher in background |
| Level-trigger (fire whenever condition true) | One-line evaluation | Fire storms / flapping | Never for threshold; only with explicit dedupe window |
| No TTL on detached triggers | Less bookkeeping | Zombie watchers exhaust the cap | Never -- every trigger needs owner + ceiling |
| Editing shared run_task progress closure to reuse for trigger | DRY | Risks INV-01 byte drift on run_task | Never edit-in-place; construct a parallel envelope |
| Keepalive ping to dodge eviction | "Fixes" SW death | Store-review flag, battery drain | Never |

## Integration Gotchas

Common mistakes when connecting to FSB subsystems / external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `mcp/src/queue.ts` (TaskQueue) | Registering `trigger` + companions as mutation tools that serialize | Blocking-wait + all read-style companions in the read-only bypass set; watcher runs in background, not the handler |
| `chrome.alarms` | Assuming sub-30s polling; using `setInterval` for survivability | ~30s alarm floor (Chrome 120+); alarm-driven wake + storage rehydrate; floor the refresh interval at/above alarm granularity |
| `extension/utils/agent-tab-resolver.js` | `chrome.tabs.query({active:true})` to find the reload target | `resolveAgentTabOrError(agentId, params, client)`; background reload; honor `TAB_NOT_OWNED` |
| `extension/content/selectors.js` (uniqueness scoring) | Hand-rolled `querySelector` with a frozen selector | Re-resolve via uniqueness-scored selector + fallbacks every poll/batch |
| `extension/content/visual-feedback.js` (glow) | New always-on animation; not disconnecting observers on `beforeunload` | Reuse existing reduced-motion `@media` block + `beforeunload` observer-disconnect (`:2244`); add analyzing-pulse as a *variant* of the existing glow, not a new overlay |
| `extension/utils/mcp-task-store.js` / `chrome.storage` | Holding trigger state in SW memory | Persist trigger registry to storage like `FsbMcpTaskStore`; rehydrate on SW wake |
| MCP client transport | Blocking for hours and trusting heartbeats | 30s heartbeats (best-effort) + auto-convert blocking→detached past a ceiling |
| `chrome.tabs.onRemoved` (wired `background.js:13163`) | Not auto-stopping triggers on tab close | Reap triggers whose tab closed; free the cap slot |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Broad `subtree:true` observer on a busy ticker | Main-thread jank only while trigger active; thousands of callbacks/sec | Narrowest-node observe + `attributeFilter`; coalesce per batch; throttle evaluation | Any high-frequency live page (crypto, sports scores) |
| N concurrent refresh-poll triggers reloading many tabs | Memory + CPU spikes every interval; site rate-limits | Stagger/jitter intervals; cap concurrency (1-64, sensible default per PROJECT.md); prefer live-observe | ~10+ concurrent refresh-poll triggers or a fast floor |
| Per-mutation evaluation (no coalescing) | CPU proportional to page mutation rate, not value-change rate | Read current value once per batch, compare once | Busy SPA dashboards |
| Storing full DOM / large `last_seen_value` per trigger | `chrome.storage` quota pressure; slow rehydrate | Store only the extracted scalar + selector + flags, size-capped (mirror `change_report` `truncated`) | Many triggers or large captured values |
| Re-running uniqueness scoring over the whole DOM every tick | Slow polls on large pages | Scope re-resolution to the stable container; cache the scored selector, fall back only on miss | Large/complex pages at a fast interval |

## Security / Safety Mistakes

Domain-specific issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Firing on challenge-page content after a block | False/garbage fire; user acts on a CAPTCHA string | Detect block/CAPTCHA page; emit `blocked` status, never fire on it (Pitfall 7) |
| Treating "element not found" as "value unchanged" | Silent non-fire; user believes they're being watched | Distinct `needs_attention`/`not_found` state; escalate after K misses (Pitfall 8) |
| Cross-agent tab reload | One agent reloads/disrupts another's owned tab | Ownership gate on the reload path; `TAB_NOT_OWNED` (Pitfall 14) |
| Scope creep into auto-acting on fire | Notify-only is the v0.11.0 safety boundary; auto-act (e.g. add-to-cart) is a different risk class | Enforce notify-only; the AI/caller decides follow-up (PROJECT.md explicit out-of-scope) |
| Reloading an authenticated page and losing session | Reload triggers logout/expiry; trigger then watches a login page | Prefer live-observe for authed pages; detect login redirect → `needs_attention`, don't fire; don't clear cookies on reload |
| `regex`/`contains` on untrusted page text without bounds | Catastrophic-backtracking regex (ReDoS) on attacker-controlled DOM | Bound regex (length cap / safe engine); treat page text as untrusted input |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Analyzing-pulse animation janks the page | Stutter on the very pages being watched | GPU-composited transform/opacity only (FSB already uses `scaleX()`/composited glow); never animate layout properties |
| No reduced-motion path for the pulse | Accessibility regression; motion-sensitive users | Honor `@media (prefers-reduced-motion: reduce)` exactly like `visual-feedback.js:1601` (animation:none, keep a static cue) |
| Glow/pulse stuck on after fire or `stop_trigger` | Page shows "watching" forever; looks broken | Guaranteed clear on fire/stop/timeout; storage-backed replay deadline like `mcp-visual-session-lifecycle.js` so a dead SW can't strand the overlay |
| Pulse survives navigation/reload as a ghost | Overlay lingers on the wrong page | Tie overlay to content-script lifecycle; disconnect on `beforeunload`; re-assert only if trigger still active for that tab |
| Analyzing-pulse collides with `run_task` steady glow | Two overlays fight; ambiguous state | One owner per tab (FSB already enforces this for autopilot vs MCP visual sessions, PROJECT.md Key Decisions); pulse is a *state* of the single overlay, not a second overlay |
| No way to see/cancel active triggers | Users can't find what's running | `list_triggers` + clear status (armed/fired/blocked/age/owner) surfaced in UI |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Watch loop:** Works in devtools, but did you let the SW evict for >30s with devtools CLOSED and confirm it resumes from alarms+storage? (Pitfall 2)
- [ ] **Blocking mode:** Returns on fire, but does it bypass the mutation queue so other tools (and `stop_trigger`) still work? (Pitfall 1) And convert to detached past the ceiling instead of dying on a host timeout? (Pitfall 13)
- [ ] **MutationObserver:** Fires on change, but is it disconnected on fire, stop, navigation, BFCache, and re-injection -- verified by an "every observer disconnected" test? (Pitfall 4)
- [ ] **SPA pages:** Fires on a static page -- but still fires when the framework *replaces* the node (re-resolve via selector each batch)? (Pitfall 6)
- [ ] **Numeric parse:** Threshold works on `$1,234.56` -- does it work on `1.234,56` (DE), `1 234,56` (FR), `12,5 %`, `(123.45)`, and reject/flag NaN instead of firing on 0? (Pitfall 9)
- [ ] **Flapping:** Fires once cleanly -- but does a value oscillating at the threshold produce ONE fire (edge-trigger + hysteresis), not a storm? (Pitfall 10)
- [ ] **Refresh-poll:** Reloads the right tab in the background without stealing focus or touching another agent's tab? (Pitfall 14) And honors a hard interval floor + jitter so it doesn't get CAPTCHA'd? (Pitfall 7)
- [ ] **Detached:** Auto-reaps on owner disconnect / tab close / TTL so it can't zombie the cap? (Pitfall 12)
- [ ] **Element lost:** Distinguishes not-found from unchanged and escalates, rather than silently never firing? (Pitfall 8)
- [ ] **Overlay:** Clears on fire/stop/timeout even if the SW is dead (storage-backed deadline), honors reduced-motion, and doesn't double up with the run_task glow? (UX table)
- [ ] **INV-01:** Existing tool schemas byte-identical -- schema-lock CI still green with only additions? (Pitfall 11)
- [ ] **Browser restart:** After Chrome restart, persisted triggers either resume from storage or fail loud -- not silently vanish, not spuriously re-fire? (Pitfall 15)
- [ ] **Duplicate fires:** A single value change yields exactly one delivered fire across content-report + alarm-safety-net + blocking/poll paths? (Pitfall 16)

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SW evicted, watch lost (no alarm) | HIGH (rewrite) | Move state to storage + alarm wake; architectural, fix before GA, not patchable later |
| Queue starvation (blocking in queue) | MEDIUM | Move companions to read-only bypass; move watcher to background; convert blocking handler to await-event |
| Observer leak | LOW | Add disconnect on all teardown paths + a leak test; reload tab to clear stranded observers |
| Stale selector | LOW-MEDIUM | Swap frozen selector for uniqueness re-resolution + fallbacks; add not-found escalation |
| Locale mis-parse | LOW | Replace strip+parseFloat with locale-aware normalizer; add `locale`/`decimal_separator` override; backfill tests |
| Flapping fire storm | LOW | Switch level→edge trigger; add hysteresis/dedupe window; default fire-once |
| Anti-bot block | MEDIUM | Raise interval floor + jitter; add challenge-page detection→`blocked`; prefer live-observe |
| Detached zombie | LOW-MEDIUM | Add TTL + owner binding + onRemoved reap; `list_triggers` to find, `stop_trigger` to kill |
| INV-01 drift | HIGH (client breakage) | Revert shared-schema edit; re-add as separate additive tool; rely on schema-lock test to catch pre-merge |
| Stuck overlay | LOW | Storage-backed clear deadline + guaranteed clear on fire/stop; reload clears content-script overlay |
| Duplicate fires | LOW | Atomic fire/disarm before delivery; add dedupe key; make safety-net alarm idempotent |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. (Phase names are suggested groupings; the roadmap will assign numbers.)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Queue starvation | MCP contract & tool lifecycle | While a blocking trigger is active, a second tool call + `stop_trigger` both return promptly (test) |
| 2 SW eviction loses watch | MV3 survivability | SW evicted >30s with devtools closed → trigger still fires from alarm+storage (UAT) |
| 3 Keepalive antipattern | MV3 survivability | No keepalive present; SW idles to eviction between alarms; resumes correctly |
| 4 Observer leak | Live-observe watch mechanism | "Every observer disconnected" test green; memory flat over a long watch |
| 5 Broad-subtree perf | Live-observe watch mechanism | Busy-ticker fixture stays under a frame-time budget; bounded callback count |
| 6 SPA re-render miss | Live-observe watch mechanism | React/Angular fixture where node is replaced still fires (re-resolution test) |
| 7 Anti-bot reload | Refresh-poll watch mechanism | Interval floor + jitter enforced; challenge-page → `blocked`, no fire (test) |
| 8 Stale selector | Both watch mechanisms (shared selector layer) | Reload with mutated markup re-resolves or escalates not-found; never wrong-element fire |
| 9 Locale numeric parse | Value-extraction / fire-condition | Parse-table test across US/DE/FR/`%`/parens/NaN passes |
| 10 Flapping | Fire-condition / threshold eval | Oscillating-value fixture yields exactly one fire (edge+hysteresis) |
| 11 INV-01 drift | MCP contract (additive) | Existing schema-lock/contract CI green; only new tool names added |
| 12 Detached orphan | Trigger lifecycle | Owner disconnect / tab close / TTL → trigger auto-reaped; cap slot freed (test) |
| 13 Blocking transport timeout | MCP contract | 30s heartbeats emitted; blocking auto-converts to detached past ceiling (test) |
| 14 Focus-steal / wrong tab | Refresh-poll watch mechanism | Reload targets owned tab in background; foreground/other-agent tab untouched (test + UAT) |
| 15 Restart/SW-reload reconcile | MV3 survivability + lifecycle | Post-restart bootstrap rehydrates registry, reconciles alarms, drops fired/expired |
| 16 Duplicate fires | Fire-condition / lifecycle | Atomic fire/disarm; dedupe key; safety-net alarm idempotent (test) |
| UX overlay | Visual-feedback / analyzing-pulse | Reduced-motion honored; overlay clears on fire/stop even with dead SW; no double-overlay with run_task |

## Sources

- Chrome for Developers -- The extension service worker lifecycle (30s idle timeout, 5-min request ceiling, what resets the timer): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle [HIGH]
- Chrome for Developers -- Longer extension service worker lifetimes (Chrome 110+ event-driven lifetime; Chrome 116+ WebSocket activity resets timer; "always yield / persist state for termination"): https://developer.chrome.com/blog/longer-esw-lifetimes [HIGH]
- chromium-extensions group -- MV3, inactive service workers, and alarms (alarms wake the SW; ~30s/1min minimum period reality): https://groups.google.com/a/chromium.org/g/chromium-extensions/c/k5upFLVnPqE [MEDIUM]
- MDN -- MutationObserver.disconnect() (leak if never disconnected): https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/disconnect [HIGH]
- MDN -- MutationObserver() constructor / takeRecords (attributeFilter, missed-mutation handling): https://developer.mozilla.org/docs/Web/API/MutationObserver/MutationObserver [HIGH]
- whatwg/dom#482 -- MutationObserver opportunity for memory leak; broad subtree:true → diffing required: https://github.com/whatwg/dom/issues/482 [MEDIUM]
- dev.to -- Test that every MutationObserver is disconnected (leak-prevention test pattern): https://dev.to/scooperdev/test-that-every-mutationobserver-is-disconnected-to-avoid-memory-leaks-2fkp [MEDIUM]
- fsjs.dev -- Using MutationObserver for performance (attributeFilter, narrow scope, coalescing): https://fsjs.dev/behind-the-curtain-mutationobserver-performance-optimization/ [MEDIUM]
- nolanlawson.com -- Fixing memory leaks in web applications (observers on globally-available elements): https://nolanlawson.com/2020/02/19/fixing-memory-leaks-in-web-applications/ [MEDIUM]
- arxiv 2311.10911 -- reCAPTCHAv2 user study (quick-succession reloads → image CAPTCHA ~14 tries human / immediate for automation): https://arxiv.org/pdf/2311.10911 [MEDIUM]
- ScraperAPI -- Bypassing anti-bot detection (rate-limit / IP block / fingerprint signals on rapid requests): https://www.scraperapi.com/blog/bypassing-anti-bot-detection/ [LOW]
- xjavascript.com -- JS thousand separator / locale parsing pitfalls (parseFloat is locale-blind): https://www.xjavascript.com/blog/javascript-thousand-separator-string-format/ [MEDIUM]
- xjavascript.com -- Does JavaScript use local decimal separators (it does not): https://www.xjavascript.com/blog/does-javascript-take-local-decimal-separators-into-account/ [MEDIUM]
- Splunk Lantern -- Resolving flapping detectors (flapping definition): https://lantern.splunk.com/Observability/Product_Tips/Infrastructure_Monitoring/Resolving_flapping_detectors_in_Splunk_Infrastructure_Monitoring [MEDIUM]
- Datadog -- Recovery thresholds for metric monitors (hysteresis / dual-threshold): https://www.datadoghq.com/blog/introducing-recovery-thresholds/ [MEDIUM]
- alvo.me -- Prometheus alert debouncing (`keep_firing_for`, oscillation period): https://alvo.me/en/posts/2023/prometheus-debouncing/ [MEDIUM]
- Grafana #6202 -- Hysteresis for alerts (feature discussion): https://github.com/grafana/grafana/issues/6202 [LOW]
- modelcontextprotocol.io -- MCP Tasks overview (durable handle vs blocking; clients/intermediaries time out blocking calls): https://modelcontextprotocol.io/extensions/tasks/overview [HIGH]
- modelcontextprotocol #1391 / #982 -- Long-running operations / async tasks / resumability (SEP-1391; 2025-11-25 Tasks primitive): https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391 [MEDIUM]
- modelcontextprotocol/inspector #880 -- Progress notifications not captured, breaking timeout reset: https://github.com/modelcontextprotocol/inspector/issues/880 [MEDIUM]
- anthropics/claude-code #58687 -- Client times out long-running tool calls despite server progress notifications: https://github.com/anthropics/claude-code/issues/58687 [MEDIUM]
- FSB source (read this session): `mcp/src/queue.ts` (TaskQueue serialization + read-only bypass), `mcp/src/tools/autopilot.ts` (run_task 600s safety net, 30s heartbeat onProgress, sw_evicted partial_state), `extension/ai/agent-loop.js` (setTimeout-chained iterator INV-04, warm-state resume), `extension/utils/mcp-task-store.js` (FsbMcpTaskStore), `extension/utils/agent-tab-resolver.js` (agent-scoped tab resolution), `extension/utils/agent-registry.js` (tab ownership), `extension/utils/mcp-visual-session-lifecycle.js` (alarm-based death timers + storage replay), `extension/content/visual-feedback.js` (glow + reduced-motion + beforeunload observer disconnect), `extension/content/dom-stream.js` / `dom-state.js` / `actions.js` (existing observe/disconnect discipline + two-tier watchdog), `extension/content/selectors.js` (uniqueness-scored selectors), `extension/content/lifecycle.js` (SPA navigation + BFCache pageshow), `extension/background.js` (chrome.alarms onAlarm, onRemoved, ordered bootstrap, idempotent alarms.create). [HIGH]

---
*Pitfalls research for: long-running MV3 reactive DOM watcher with refresh-poll/live-observe + MCP dual-mode reporting (FSB v0.11.0 Trigger Tool)*
*Researched: 2026-06-15*
