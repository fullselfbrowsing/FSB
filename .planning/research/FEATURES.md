# Feature Research

**Domain:** Reactive DOM-monitoring / change-trigger tool for an AI browser-automation extension (FSB `trigger` family, v0.11.0)
**Researched:** 2026-06-15
**Milestone:** v0.11.0 Trigger Tool (Reactive DOM Monitoring)
**Confidence:** HIGH (prior-art behaviors verified against official docs / source: Distill.io docs, Visualping blog, changedetection.io source + issues, Playwright API docs, Binance/Coinbase help, Chrome MV3 lifecycle docs)

## Scope Note (read first)

This research surveys prior art ONLY to extract the feature vocabulary and user expectations for the NEW `trigger` tool. The full FSB action/read toolset (~36 action + 15 read-only tools), `run_task` autopilot lifecycle, multi-agent tab ownership, change_report, visual sessions, and uniqueness-scored targeting already exist and are NOT re-evaluated here — they appear only as *dependencies* the trigger tool reuses.

(Note: this file replaces the earlier v0.9.69 telemetry FEATURES research, which is archived in the v0.9.69 milestone snapshot.)

The ecosystem splits into three prior-art families, each contributing vocabulary:

| Family | Examples | What FSB borrows |
|--------|----------|------------------|
| Web change monitors | Visualping, Distill.io, Browse AI, Wachete, Hexowatch, Fluxguard, changedetection.io | Condition vocabulary (any-change, contains, regex, numeric threshold, % change), check-interval tiers, element targeting UX, notification *semantics* |
| Price/stock/crypto trackers | Keepa, CamelCamelCamel, Honey, Binance/Coinbase alerts | Threshold direction (above/below), % change, price parsing, edge-vs-level fire expectations |
| Programmatic "wait-until" primitives | Playwright `waitForFunction`/`waitForSelector`, browser-use wait/extract, uptime/synthetic monitors (Cronitor, UptimeRobot, Uptime.com) | Condition + timeout + poll-interval grammar, blocking-return semantics, assertion operators |

## Feature Landscape

### Table Stakes (Users Expect These)

Features any credible "watch this and tell me when X" tool has. Missing these = the trigger tool looks half-built next to Distill/Visualping/changedetection.io.

| Feature | Why Expected | Complexity | Notes / FSB dependency |
|---------|--------------|------------|-------|
| **Any-change condition** (`changed`) | The baseline of every monitor — Distill, Visualping, Browse AI, changedetection.io all start here ("notify on any difference from baseline") | LOW | Compare current extracted value vs stored initial value. Reuses FSB read-tool extraction + change_report diffing (EXISTING). |
| **Contains / keyword condition** (`contains`) | Universal. Distill `has`/`contains`, changedetection.io "Trigger on text", Visualping keyword, UptimeRobot keyword monitor. Canonical use: restock ("In Stock"), status text | LOW | Substring match on extracted text. Document the case-sensitivity default (recommend case-insensitive — matches "In Stock" intuition). |
| **Numeric threshold** (`>=`, `<=`, `>`, `<`) | Core of every price tracker (Keepa/CamelCamel "below my price", Binance "Rises Above"/"Drops To") and Distill (`number less/more than`) | LOW-MED | Requires reliable number extraction (see Smart value extraction). PROJECT.md's four operators exactly match the Distill/Binance vocabulary — well-grounded. |
| **Exact-value / regex match** (`equals`/`regex`) | Distill `matches regular expression`, changedetection.io regex filters, synthetic-monitor assertions. Needed when "any change" is too noisy but a specific target matters | MED | Cheap once `equals` exists. Compile-once; guard against catastrophic backtracking (ReDoS) on caller-supplied patterns. |
| **Element-scoped targeting** (watch ONE element, not whole page) | Distill visual selector, Visualping region highlight, changedetection.io CSS/XPath/JSONPath. Users expect to point at "the price," not diff the whole page | LOW (for FSB) | Dependency reuse: FSB uniqueness-scored selectors (EXISTING, v0.9) are *more precise* than most monitors' raw CSS/XPath. Not new work. |
| **Configurable check / refresh interval** | Every monitor exposes cadence tiers (Visualping 2/5/15/60 min; synthetic 30s/1/5/15 min; Browse AI hourly/daily/custom) | LOW-MED | PROJECT.md's ~60s default + hard floor is correct. Chrome 120+ `chrome.alarms` minimum period is 30s (verified) — the natural hard floor for refresh-poll. |
| **Stop / cancel a watch** (`stop_trigger`) | Every monitor lets you delete/pause; an un-stoppable watcher is a leak and a footgun | LOW | Mirrors existing `stop_task`. Must tear down the MutationObserver / cancel the `chrome.alarms` poll AND clear the visual pulse. |
| **Status / introspection** (`get_trigger_status`, `list_triggers`) | Users + the driving AI need "is it still watching? last value? time left?" — mirrors task-status tooling and monitor dashboards | LOW | Mirrors existing `get_task_status` / agent listing. Per-trigger: state, current vs initial value, condition, watch mode, elapsed/remaining, last-check time. |
| **Timeout on a watch** | Playwright `waitForFunction` timeout, synthetic max-wait — every "wait until" primitive has a ceiling. Unbounded blocking waits are an anti-pattern | LOW | PROJECT.md's configurable blocking timeout + safety ceiling is correct. On timeout return a distinct `timed_out` outcome (not error, not fire) so the AI can re-arm. |
| **Fires once, reports cleanly** (terminal fire) | A fire should return *what* fired + the matched value, then stop — same shape as a completed task. Synthetic/Playwright waits resolve once | LOW | Default to one-shot edge fire — see PITFALL. Firing repeatedly while a condition stays true is the documented changedetection.io complaint. |

### Differentiators (Competitive Advantage)

Where FSB's trigger stands out against standalone monitors. These align with FSB's Core Value ("the AI decides, the mechanics execute") and its existing autopilot+MCP architecture.

| Feature | Value Proposition | Complexity | Notes / FSB dependency |
|---------|-------------------|------------|-------|
| **AI-decides-on-fire (notify-only into an agent loop)** | Standalone monitors fire into a *dumb* channel (email/Slack/webhook) where a human must act. FSB fires back into a *reasoning* agent that decides the follow-up (re-check, buy, escalate, re-arm). This is the entire point of the milestone | LOW (a return contract, not new infra) | Trigger returns the fire event to autopilot or the MCP caller; the AI takes over. Strictly notify-only (see Anti-Features). Depends on the `run_task`/MCP lifecycle-return contract (Phase 239). |
| **Autopilot + MCP parity (single shared registry)** | Same `trigger` tool usable by FSB's own autopilot loop AND any external MCP client (Claude Code, Cursor, etc.). Standalone monitors are siloed products; FSB triggers compose with the full action toolset | MED | INV-02 mandates one registry. Trigger + 3 companions register once. Structural moat — no competitor exposes change-monitoring as an MCP primitive alongside a full automation toolset. |
| **Live-observe vs refresh-poll, selectable per-trigger** | Monitors are almost universally server-side *poll-only* (re-fetch on a schedule). FSB can watch a live element *in place* via MutationObserver for instant fire on SPA/ticker updates (crypto, live scores) with zero reloads, OR refresh-poll for static server-rendered pages (Amazon). Caller picks the mechanism | MED-HIGH | Genuinely differentiated — sub-second reaction on live pages that poll-based monitors structurally cannot match. MutationObserver lives in the content script (page-lifetime, survives SW eviction — verified), SW as survivable coordinator. |
| **In-page "analyzing" gentle pulse on the watched element** | Visible, trustworthy feedback that *this specific element* is being watched, reusing FSB's orange overlay. Standalone monitors give zero on-page indication. Reinforces FSB's "trusted, visible automation" identity | LOW-MED | Reuses existing visual-session overlay + trusted-badge machinery (v0.9.36/v0.9.62); shifts steady glow to a gentle pulse. Pure presentation layer. |
| **Real browser context (auth, JS, SPA) for free** | Keepa/CamelCamel are Amazon-specific; most monitors struggle with logged-in / JS-heavy pages. FSB watches inside the user's actual authenticated, JS-executing tab — works on gated dashboards, internal tools, SPAs out of the box | LOW (inherent) | Inherited from FSB being an in-browser extension, not a server-side fetcher. State explicitly as positioning; no new work. |
| **Smart value extraction with override** (`extract: text \| number \| attribute`) | Auto-parse numbers (strip `$`, commas, whitespace) for threshold/equals; raw text for changed/contains; explicit override for edge cases (read `data-price`, `aria-valuenow`) | MED | Distill auto-detects "numeric type"; FSB makes it explicit + overridable = more robust. Attribute extraction handles cases where visible text lies but an attribute holds the true value. |
| **Detached + blocking dual-mode reporting** | Blocking-by-default with heartbeats (mirrors `run_task`, good for short waits + conversational flows) AND detached opt-in returning a `trigger_id` for long watches the caller polls. Standalone monitors are detach-only; pure programmatic waits (Playwright) are block-only — FSB offers both | MED | Mirrors the proven `run_task` lifecycle-return + `get_task_status` pattern (Phase 239 / v0.9.60). Detached recommended beyond a few minutes. Heartbeat interval should mirror the existing 30s task heartbeat. |
| **Multiple concurrent triggers with a cap** | Watch several elements/pages at once (e.g. 3 product prices) under one configurable cap, reusing the agent/tab concurrency model | MED | Mirrors v0.9.60 agent cap (1-64, default 8). Each trigger agent/tab-scoped so refresh-poll reloads target the trigger's OWN tab without focus-stealing (reuse agent-scoped tab resolution). |
| **% change condition** (stretch / NOT in v1 scope) | Binance "Change is Over", Distill "increased/decreased more than %", crypto alerts. Common in price/crypto monitoring | MED | NOT in the v0.11.0 condition list (changed/threshold/equals/contains). Flag as likely v0.11.x follow-on — needs baseline-vs-current delta + reopens edge-vs-level questions. Defer unless cheap to fold into threshold. |

### Anti-Features (Commonly Requested, Often Problematic)

Features adjacent monitors have that FSB should explicitly NOT build for v0.11.0. PROJECT.md already calls several out; this section makes the rationale durable for REQUIREMENTS.md.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Server-side hosting / cloud monitoring** | Visualping, Distill, Browse AI, Wachete run on their servers so watches persist when your machine is off | FSB is a local in-browser extension; standing up a monitoring backend is a different product, contradicts the privacy/local model, and is enormous scope | Run inside the user's browser via MV3 survivability (`chrome.alarms` + resume sidecars). Watch lives while Chrome is open. State the "browser must be open" limitation honestly. |
| **Building our own notification channel** (email/SMS/desktop push/Slack) | Every monitor ships delivery channels; users ask "can it text me?" | Notification delivery is a whole product surface (deliverability, templates, opt-in, rate limits, spam). Duplicates what the *driving AI client* already does | Notify-only: the trigger reports the fire to the agent/MCP caller, which already has its own surfacing. PROJECT.md explicitly defers desktop/Chrome push to a later milestone. |
| **Auto-act-on-fire** (auto-add-to-cart, auto-buy, auto-submit) | "When price drops, just buy it for me" | Destroys FSB's Core Value ("the AI decides") and creates a dangerous autonomous-action footgun (irreversible/financial actions with no judgment) | The AI/caller decides the follow-up after the notify-only fire, then *may* invoke action tools. Explicitly out of scope per PROJECT.md. |
| **Level-triggered re-firing** (fire on every check while condition stays true) | "Tell me every time the price is still below X" | changedetection.io #2715 shows users get confused EITHER way; repeated firing into an agent loop = notification storm + token burn + duplicate agent actions | Default to one-shot edge fire (fire once on crossing, then terminal). If re-arming is wanted, the AI re-invokes `trigger`. Make one-shot semantics explicit in the tool description. |
| **Whole-page visual-diff / screenshot diffing** | Visualping's headline feature (Visual/All mode); pixel-diff catches layout changes | FSB targets ONE element via precise selectors; full-page visual diffing is noisy (ads, timestamps, carousels), heavy (screenshot + image compare), and contradicts the element-scoped design | Element-scoped text/number/attribute extraction. FSB's uniqueness-scored targeting is more precise than visual diff for "watch this value." |
| **Macro / multi-step pre-check interactions** (log in, click through, dismiss modal, THEN read) | Distill macro recording, changedetection.io browser-steps — needed when the value is behind interaction | Re-running a multi-step macro on every poll is fragile + expensive; conflates "monitoring" with "automation." FSB already HAS a full automation loop for setup | Caller uses existing FSB action tools to navigate/auth/reveal the element FIRST, then arms a `trigger` on the now-visible element. Keep trigger to read-and-compare. |
| **Change history / diff timeline UI** | Distill/Visualping keep a versioned change log with highlighted diffs | A persistent history store is its own product surface (storage, retention, UI); out of scope for a notify-only primitive | Report the fire event + matched value at fire time. `get_trigger_status` exposes current vs initial value. Rich history is a future candidate, not v1. |
| **Sub-30s refresh-poll cadence** | "Check every 5 seconds" for fast-moving prices | Chrome 120+ `chrome.alarms` minimum period is 30s (verified); sub-minute hammering risks rate-limiting / IP bans and burns the SW lifecycle | For truly live data, use **live-observe** (MutationObserver fires instantly, no polling). Refresh-poll keeps a hard floor (~60s default; never below the 30s alarms floor). This is exactly why the two-mechanism design exists. |

## Feature Dependencies

```
trigger()  [the core tool]
   |
   |--requires--> Uniqueness-scored element targeting        [EXISTING — v0.9]
   |--requires--> Element value extraction (read tools /     [EXISTING — change_report diffing, v0.9.60]
   |              change_report diff machinery)
   |--requires--> Smart value extraction (number/text/attr)  [NEW — small, builds on read tools]
   |
   |--branches on watch mechanism-->
   |       |--refresh-poll--> chrome.alarms scheduler        [EXISTING infra — MCP reconnect / stream watchdog]
   |       |                --> agent-scoped tab resolution   [EXISTING — v0.9.60, no focus-stealing]
   |       |                --> page reload + re-read         [EXISTING — refresh tool]
   |       |
   |       |--live-observe--> MutationObserver in content     [NEW — content-script-side, page-lifetime]
   |                          script (survives SW eviction)
   |
   |--requires--> MV3 survivability (chrome.alarms +          [EXISTING — v0.10.0 Lattice survivability adapter;
   |              resume-sidecar / partial_state pattern)      generalizes Phase 239 partial_state]
   |
   |--reporting branches-->
   |       |--blocking (default)--> lifecycle-return +        [EXISTING — run_task pattern, Phase 239]
   |       |                        30s heartbeats
   |       |--detached (opt-in)--> trigger_id + poll          [EXISTING — get_task_status pattern]
   |
   |--requires--> Visual session + trusted badge overlay      [EXISTING — v0.9.36/v0.9.62];
   |              (steady glow -> gentle analyzing pulse)       pulse variant is NEW presentation
   |
   |--registered in--> single shared tool registry           [EXISTING constraint — INV-02]
                       (autopilot + MCP parity)

Companion tools (mirror the run_task / stop_task / get_task_status family):
   stop_trigger          ──requires──> trigger() registry + teardown (observer/alarm/pulse)
   get_trigger_status    ──requires──> trigger() registry + per-trigger state
   list_triggers         ──requires──> trigger() registry + concurrency cap accounting

Concurrency:
   Multiple concurrent triggers ──requires──> agent/tab concurrency cap model  [EXISTING — v0.9.60, 1-64 default 8]
```

### Dependency Notes

- **trigger requires existing element targeting + value extraction:** The hardest parts (reliably finding and reading ONE element) are already solved by FSB's uniqueness-scored selectors and change_report diffing. The NEW work is the comparison/condition layer, the live-observe MutationObserver path, and the per-trigger lifecycle — NOT element identification.
- **Refresh-poll reuses chrome.alarms + agent-scoped tab resolution:** Both already exist (alarms drive MCP reconnect and the DOM-stream watchdog; agent-scoped resolution from v0.9.60 prevents focus-stealing). The trigger's reload-and-re-read must target the trigger's OWN tab — an INV from PROJECT.md and a direct reuse, not new infra.
- **Live-observe is the main genuinely-new runtime piece:** MutationObserver runs in the content script (page-lifetime, NOT subject to the SW 30s eviction — verified), with the SW as survivable coordinator. Most likely to need dedicated phase research (re-injection after BF-cache/navigation, debouncing high-frequency mutations, fire delivery from content script back to SW after eviction).
- **MV3 survivability is the crux and already has a template:** PROJECT.md correctly identifies this generalizes the Phase 239 `partial_state` pattern and the v0.10.0 Lattice survivability adapter into a *standing watcher*. The watch must re-arm after SW eviction via `chrome.alarms`.
- **Blocking/detached reporting is a direct clone of run_task lifecycle:** Phase 239 already proved lifecycle-return + 30s heartbeats + `partial_state` on eviction, plus the `get_task_status` poll path. The trigger family mirrors `run_task`/`stop_task`/`get_task_status` 1:1 — low conceptual risk; the contract shape is battle-tested.
- **Companion tools are thin wrappers over a shared registry:** `stop_trigger`/`get_trigger_status`/`list_triggers` are the `stop_task`/`get_task_status`/agent-listing analogues. The only new state is the per-trigger registry entry; teardown must cancel the observer/alarm AND clear the visual pulse.
- **Concurrency reuses the agent cap, not a new limiter:** PROJECT.md ties the concurrent-trigger cap to the v0.9.60 agent/tab cap (1-64, default 8). Reuse that accounting.

## MVP Definition

### Launch With (v1 = v0.11.0)

The complete, credible trigger primitive per PROJECT.md scope.

- [ ] `trigger()` core tool — target one element, define a fire condition, get notified — *essential; the milestone*
- [ ] All four fire conditions: `changed`, `threshold` (`>=`/`<=`/`>`/`<`), `equals`/`regex`, `contains` — *table stakes; the condition vocabulary every monitor has*
- [ ] Both watch mechanisms: `refresh-poll` AND `live-observe` — *the differentiating dual-mechanism design; live-observe is the moat*
- [ ] Smart value extraction (auto number-parse; raw text; `extract: text|number|attribute` override) — *required for threshold/equals to be reliable*
- [ ] Dual-mode reporting: blocking-by-default (heartbeats, return on fire/timeout) + detached opt-in (`trigger_id` + poll) — *mirrors proven run_task contract*
- [ ] Companion tools: `stop_trigger`, `get_trigger_status`, `list_triggers` — *table stakes; un-stoppable/opaque watchers are footguns*
- [ ] Multiple concurrent triggers with configurable cap — *reuses existing agent cap*
- [ ] MV3 survivability (survive SW eviction via chrome.alarms + resume sidecar) — *the crux; a watch that dies on eviction is broken*
- [ ] Configurable refresh interval with hard floor (~60s default, never below 30s alarms floor) + blocking timeout with safety ceiling — *table stakes cadence control + anti-DoS*
- [ ] One-shot edge-fire semantics, documented explicitly — *avoids the changedetection.io #2715 notification-storm pitfall*
- [ ] In-page gentle "analyzing" pulse on the watched element via existing visual session — *differentiator; trusted visible feedback*
- [ ] Single shared registry (autopilot + MCP parity, INV-02) — *structural requirement*

### Add After Validation (v0.11.x)

- [ ] **% change condition** (above/below by N%) — *Binance/Distill have it; defer because it reopens edge-vs-level baseline questions and isn't in the v1 condition list*
- [ ] **Compound conditions** (AND/OR multiple conditions on one element, e.g. Distill's compound rules) — *add once single conditions are proven; combinational fire logic is extra surface*
- [ ] **Re-arm-on-fire option** (explicit opt-in to level/repeat semantics with de-dup) — *only if users genuinely need it; default stays one-shot*

### Future Consideration (v0.12+)

- [ ] **Desktop / Chrome push notification on fire** — *PROJECT.md explicitly defers; needs the notify-only boundary to relax deliberately*
- [ ] **Auto-act-on-fire workflows** — *deliberately deferred; reconsider only with strong human-in-the-loop guardrails*
- [ ] **Change history / diff timeline** — *a storage + UI product surface, not a primitive*
- [ ] **Cross-element / multi-condition watches in one trigger** — *e.g. "fire when price < X AND stock = In Stock"; compound across elements*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `trigger()` core + 4 conditions | HIGH | MEDIUM | P1 |
| Refresh-poll mechanism | HIGH | MEDIUM (reuses alarms + agent-tab) | P1 |
| Live-observe mechanism (MutationObserver) | HIGH | HIGH (main new runtime piece) | P1 |
| Smart value extraction (text/number/attr) | HIGH | MEDIUM | P1 |
| MV3 survivability (alarms + resume sidecar) | HIGH | MEDIUM-HIGH (generalizes existing pattern) | P1 |
| Blocking + detached reporting | HIGH | MEDIUM (clones run_task) | P1 |
| stop_trigger / get_trigger_status / list_triggers | HIGH | LOW | P1 |
| One-shot edge-fire semantics (documented) | HIGH | LOW | P1 |
| Concurrency cap | MEDIUM | LOW (reuses agent cap) | P1 |
| In-page analyzing pulse | MEDIUM | LOW-MEDIUM | P1 |
| AI-decides-on-fire (notify-only return) | HIGH | LOW (return contract) | P1 |
| Autopilot + MCP parity (shared registry) | HIGH | MEDIUM | P1 |
| % change condition | MEDIUM | MEDIUM | P2 |
| Compound conditions | MEDIUM | MEDIUM | P2 |
| Re-arm-on-fire opt-in | LOW-MEDIUM | LOW-MEDIUM | P3 |
| Push notifications | MEDIUM | HIGH | P3 |
| Change history UI | LOW | HIGH | P3 |

**Priority key:** P1 = must have for v0.11.0 launch · P2 = should have, v0.11.x · P3 = future

## Competitor Feature Analysis

| Feature | Web change monitors (Distill / Visualping / changedetection.io) | Price/crypto trackers (Keepa / Binance / Coinbase) | Programmatic waits (Playwright / synthetic monitors) | FSB `trigger` approach |
|---------|--------------|--------------|--------------|--------------|
| Any-change | Yes (baseline) | n/a (price-specific) | n/a (condition-based) | `changed` condition |
| Contains / keyword | Yes (`has`, "Trigger on text", keyword monitor) | Restock text | Body-content assertion | `contains` (case-insensitive default) |
| Numeric threshold | Yes (`number less/more than`) | Yes (above/below; "Rises Above"/"Drops To") | Response-time/value assertions | `threshold` (`>=`/`<=`/`>`/`<`) + smart number parse |
| Regex / exact | Yes (`matches regex`) | n/a | Assertion operators | `equals`/`regex` |
| % change | Yes (Distill increased/decreased %) | Yes (Binance "Change is Over"; 24H change) | n/a | Deferred to P2 |
| Element targeting | Visual selector + CSS/XPath/JSONPath | Product-page specific (Amazon ASIN) | CSS/text/role selectors | Uniqueness-scored selectors (EXISTING, more precise) |
| Watch mechanism | Server-side poll (re-fetch on schedule) | Server-side poll | In-page poll (`waitForFunction` raf/interval) OR event | **Both**: refresh-poll (server-style) + live-observe (in-page MutationObserver) — selectable |
| Check interval | 2/5/15/60 min tiers (server) | Backend polling | 30s+ schedule (synthetic); ms polling (Playwright) | ~60s default refresh-poll, 30s hard floor; instant on live-observe |
| Reporting / delivery | Email/SMS/Slack/Discord/webhook (detach) | Email/push/SMS/Twitter | Blocking promise resolve (Playwright); alert channel (synthetic) | **Notify-only** into agent/MCP: blocking-return + detached poll. NO own delivery channel |
| Fire semantics | Edge-ish; #2715 shows level/edge confusion | Threshold crossing | One-shot resolve | **One-shot edge fire**, documented; AI re-arms if needed |
| Acts on fire | No (notifies human) | No (notifies human) | No (test continues) | **No — AI decides** (notify-only by design) |
| Runs when machine off | Yes (cloud) | Yes (cloud) | No (in-process) | **No — browser must be open** (local MV3, honest limitation) |
| Authenticated/JS/SPA pages | Often struggles / needs macros | Site-specific | Full browser context | **Full real-browser context** inherited from extension (advantage) |

## Key Pitfall Flags for REQUIREMENTS / PITFALLS

**Edge-trigger vs level-trigger ambiguity (HIGH confidence, real-world verified).** changedetection.io issue #2715 documents users confused when a threshold fires once on crossing then goes silent on subsequent qualifying values. For FSB this is sharper because firing repeatedly into an *agent loop* = notification storm + token burn + duplicate actions. **Recommendation:** default to one-shot edge fire (fire once when the condition first becomes true, then terminal), document it explicitly in the tool description, and offer re-arm only as an explicit P2/P3 opt-in. Make this an explicit requirement, not implicit.

**Sub-interval / cadence floor (HIGH confidence, verified).** Chrome 120+ enforces a 30s minimum `chrome.alarms` period, matching the MV3 SW lifecycle. Refresh-poll must enforce this floor; truly live data routes to live-observe instead. Already reflected in PROJECT.md's ~60s default + hard floor.

**MutationObserver fire delivery across SW eviction (MEDIUM confidence — flag for phase research).** The observer lives in the content script (page-lifetime, survives eviction), but delivering a fire event back to an evicted SW, and re-establishing the observer after BF-cache restore / SPA navigation, is the trickiest runtime path and the most likely to need dedicated phase-level investigation.

## Sources

- Distill.io — [Conditions / Optimizing Alerts](https://distill.io/docs/web-monitor/using-conditions-to-get-alert-on-important-changes/), [What is Distill](https://distill.io/docs/web-monitor/what-is-distill/), [Features](https://distill.io/features/) (condition operators, visual selector, notification channels) — HIGH
- Visualping — [How Visualping Uses AI to Monitor Web Changes](https://visualping.io/blog/visualping-ai), [How to Monitor Website Changes](https://visualping.io/blog/how-to-monitor-website-changes) (visual/text/all modes, 2/5/15/60-min intervals, region selection) — MEDIUM (vendor blog)
- Browse AI — [Monitor](https://www.browse.ai/monitor), [How to use monitors](https://help.browse.ai/en/articles/10453923-how-to-use-monitors-to-automate-data-extraction) (scheduled runs, change sensitivity, webhook/API delivery) — MEDIUM (vendor docs)
- changedetection.io — [GitHub project](https://github.com/dgtlmoon/changedetection.io), [Restock & price detection tutorial](https://changedetection.io/tutorial/how-get-product-re-stock-or-back-stock-alerts-and-notifications), [Issue #2715 edge-vs-level fire](https://github.com/dgtlmoon/changedetection.io/issues/2715) (trigger-on-text, threshold, CSS/XPath/JSONPath, restock keyword rules, edge/level pitfall) — HIGH (source + issue tracker)
- Keepa / CamelCamelCamel — [Best Amazon Price Trackers 2026 (HARPA)](https://harpa.ai/blog/best-amazon-price-trackers-and-drop-alerts), [CamelCamelCamel vs Keepa (goaura)](https://goaura.com/blog/camelcamelcamel-vs-keepa) (below-threshold price alerts, per-condition thresholds, push/SMS/email/Twitter delivery) — MEDIUM
- Binance / Coinbase alerts — [Binance.US price alerts](https://support.binance.us/en/articles/9842911-how-to-set-up-price-alerts-on-the-binance-us-app), [Coinbase price alerts (Gadget Hacks)](https://smartphones.gadgethacks.com/how-to/coinbase-101-enable-price-alerts-buy-sell-perfect-time-0181842/) (Price Rises Above / Drops To / Change is Over / 24H Change, percentage + timeframe) — MEDIUM-HIGH (official help center for Binance)
- Playwright — [Page API: waitForFunction / waitForSelector](https://playwright.dev/docs/api/class-page) (polling `'raf' | number`, timeout, condition-based waits) — HIGH (official docs)
- browser-use — [System prompt / wait + extract](https://github.com/browser-use/browser-use/blob/main/browser_use/agent/system_prompt.md), [Structured output](https://docs.browser-use.com/cloud/agent/structured-output) (wait for element/text/url/ms; typed extraction) — MEDIUM-HIGH (source + official docs)
- Synthetic/uptime monitors — [Cronitor Synthetic Monitoring](https://cronitor.io/guides/synthetic-monitoring), [UptimeRobot monitoring types](https://uptimerobot.com/knowledge-hub/monitoring/ultimate-guide-to-uptime-monitoring-types/), [Google Cloud uptime checks](https://docs.cloud.google.com/monitoring/uptime-checks/introduction) (assertion grammar `{assertion} {operator} {value}`, status/keyword/response-time checks, 30s/1/5/15-min intervals) — MEDIUM-HIGH
- Chrome MV3 — [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [chrome.alarms reference](https://developer.chrome.com/docs/extensions/reference/api/alarms) (30s SW idle eviction, Chrome 120+ 30s minimum alarm period) — HIGH (official docs)
- MDN — [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) (content-script page-lifetime observation) — HIGH (official docs)

---
*Feature research for: FSB v0.11.0 Trigger Tool (Reactive DOM Monitoring)*
*Researched: 2026-06-15*
