# Feature Research

**Domain:** Authenticated-API-through-the-session agent capabilities (MV3 Chrome extension + MCP), parity-plus vs OpenTabs, for FSB v0.9.99 Native Capability Catalog
**Researched:** 2026-06-19
**Milestone:** v0.9.99 Native Capability Catalog (FSB API Execution)
**Confidence:** HIGH (OpenTabs feature surface, Claude Code Tool Search mechanics, CSRF/session-replay security, self-healing fallback benchmarks all verified against primary/multiple sources; exact live plugin/tool counts are point-in-time and noted as such)

> **Note:** This file replaces the earlier v0.11.0 Trigger Tool FEATURES research, which is archived in the v0.11.0 milestone snapshot.

## Context: What This Milestone Is

FSB already does DOM-based AI browser automation (55 canonical / 63 MCP tools, autopilot, memory, vault, site guides). The new capability is a **fast path**: have the AI call a service's *real web API* through the user's already-authenticated browser session (the "OpenTabs idea") instead of clicking the UI — while keeping the DOM engine as a self-healing fallback.

The decided architecture is the spec to validate against:
- **Lean MCP dispatcher** — `search_capabilities` + `invoke_capability` (progressive disclosure) so a catalog of thousands of capabilities never bloats the MCP tool list.
- **In-extension capability runtime** — authenticated *same-origin* `fetch` (FSB already holds `debugger` + `<all_urls>` + `execute_js` MAIN-world), plus a fixed bundled interpreter.
- **MV3-safe code/data split** — bundled imperative handlers for the hard/popular head; **server-delivered DECLARATIVE recipes (data, not code)** for the long tail (MV3 bans remotely-hosted code).
- **CDP network-capture discovery** — observe a page's real API calls to learn capabilities.
- **Learned recipes** promoted into procedural memory; auto-growing per-origin catalog.
- **API→DOM self-healing fallback.**
- **Per-origin Off/Ask/Auto consent + audit log + default-off.**

The headline strategy: **do everything OpenTabs does AND be better** (self-healing, learned/auto-growing catalog, standalone-capable, zero-install).

This document classifies the feature surface into table-stakes / differentiators / anti-features, notes complexity, maps dependencies onto existing FSB subsystems, and gives an explicit OpenTabs parity matrix.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These define the category. An "authenticated-API agent" that lacks any of these feels broken or unsafe. OpenTabs has all of them; FSB must match to claim parity.

| Feature | Why Expected | Complexity | Notes / FSB dependency |
|---------|--------------|------------|------------------------|
| **Authenticated same-session API call** ("call the API the frontend calls, no API keys, no OAuth") | The entire value prop. If you're logged in, the agent should reuse the session. | HIGH | Core primitive. Build on `execute_js` MAIN-world `fetch` (confirmed: `tool-executor.js:374` runs `chrome.scripting.executeScript({world:'MAIN'})`). Same-origin fetch in the page context inherits cookies + CSRF tokens + custom auth headers automatically. **This is the safer subset** of OpenTabs' model (see anti-features). |
| **Lean tool surface / progressive disclosure** (`search_capabilities` → `invoke_capability`) | A catalog of ~2,000–2,800 tools cannot be front-loaded into MCP context; loading 167 tools already costs ~60K tokens. Tool-selection accuracy collapses (43%→<14%) when the menu is too long. | HIGH | The defining constraint. Maps to INV-01/INV-02 (keep ~63 tools byte-stable, add ~2). Mirrors Claude Code's Tool Search: lazy schema loading, search returns schema-on-hit, 3–5 tools/query. See "Search→Invoke Pattern" section. Dependency: MCP dispatcher (`ws/mcp-tool-dispatcher.js`), tool registry. |
| **Schema-on-hit** (search returns the callable schema, not just a name) | A search that returns only tool names forces a second "describe" round-trip; agents need the parameter schema to invoke. | MEDIUM | Return the invoke schema in the `search_capabilities` hit payload (Anthropic Tool Search loads "3–5 relevant tools (~3K tokens) per query"). Avoids an extra round-trip. |
| **Per-origin / per-capability permission model (Off / Ask / Auto)** | Replaying a user's auth against real APIs is a write-capable, money-capable action. Users must gate it. OpenTabs ships exactly this 3-tier model. | MEDIUM | Maps to FSB's "consent governance" requirement. New per-origin permission store in `chrome.storage.local`. Reuse the consent/confirmation UX already used by `use_payment_method`. |
| **Default-off / nothing runs until enabled** | "Everything starts off. No tool executes until you explicitly enable it." Safety baseline for the whole category. | LOW | Default state = Off for every origin. Aligns with FSB's "supervised/safe" positioning and INV-04. |
| **Audit log** ("what ran, when, whether it succeeded") | Users replaying auth need a record. OpenTabs: "Every tool call is logged." | LOW–MEDIUM | FSB already has session logs + `get_logs` + observability tools (`list_sessions`, `get_session_detail`). Extend to record capability invocations (origin, capability, args-redacted, outcome). |
| **Runs locally / no cloud for execution** | Trust requirement: the session and secrets never leave the machine. OpenTabs: "Runs locally. No cloud." | LOW | FSB already executes in-browser; only recipe *definitions* stream from FSB's server (data, not secrets). Make this boundary explicit in docs. |
| **Built-in browser tools available without a plugin** (read/click/type/screenshot/network) | OpenTabs ships these so any tab works even with no plugin. Without a universal fallback the catalog has dead zones. | NONE (already shipped) | **FSB already exceeds this** — 55/63 tools incl. `click`, `type_text`, `read_page`, `get_dom_snapshot`, `execute_js`, CDP coordinate tools. This is FSB's existing moat, not new work. |
| **Capability/plugin discovery** ("point the AI at a site, it finds the API") | OpenTabs' growth engine. Users expect the catalog to expand to sites you didn't pre-build. | HIGH | Maps to FSB's "CDP network-capture discovery." Dependency: `chrome.debugger` (already attached for CDP Input — confirmed `background.js:13811`). Add `Network.enable` + `requestWillBeSent`/`responseReceived`/`getResponseBody` capture. |
| **Works with any MCP client** | OpenTabs and FSB both target the MCP ecosystem. | NONE (already shipped) | FSB MCP server already supports 21 client targets. New tools inherit this. |
| **Result returns structured data, not a screenshot** | The whole point of API path vs DOM path: clean JSON back to the agent. | LOW | `invoke_capability` returns the parsed API response. Trivial once the fetch primitive exists. |

### Differentiators (Competitive Advantage)

These are where FSB beats OpenTabs. They map 1:1 to the milestone's stated "be better" goals. Each should be called out explicitly in positioning.

| Feature | Value Proposition | Complexity | Notes / FSB dependency |
|---------|-------------------|------------|------------------------|
| **API→DOM self-healing fallback** | When a recipe breaks (endpoint changed, schema drift, 4xx), FSB silently drops to DOM automation + site guides and still completes the task. OpenTabs has **no UI fallback** — when its API call breaks, the tool is simply dead until someone re-builds the plugin. Industry data: locator fallback heals 40–70% of failures, intent-based healing 75–90%+. FSB already owns both layers. | MEDIUM | **The single biggest differentiator.** Dependency: existing DOM engine + 17-category site guides + autopilot `run_task`. The capability runtime needs a typed "recipe failed → escalate to DOM" path. Detection: HTTP status, response-shape mismatch, empty/error payloads. |
| **Learned / auto-growing catalog via procedural memory** | Successful discovered calls get promoted into FSB procedural memory as reusable per-origin recipes. The catalog grows *automatically from real use* on the user's own machine, including private/internal tools, with **zero authoring**. OpenTabs auto-builds plugins too, but they're code artifacts a human reviews/publishes; FSB's learned recipes are declarative data that self-populate. | HIGH | Dependency: 3-type memory system (`lib/memory/`, `PROCEDURAL` type confirmed in `memory-schemas.js`) + memory consolidator + `search_memory`. Learned recipe = declarative record {origin, endpoint, method, param-mapping, auth-mode}. Feeds `search_capabilities`. |
| **Zero-install / out-of-box catalog** | Popular capabilities ship **bundled in the extension**. No `npm install <plugin>` per service, no per-plugin toolchain. OpenTabs requires `opentabs plugin install <name>` (npm package per plugin) for anything beyond built-ins. FSB users get the head of the catalog on day one. | MEDIUM | Bundled imperative handlers compiled into the extension (the "hard/popular head"). Long tail streams as declarative recipes on demand. No per-capability install step. Optional explicit install via MCP command/control panel for power users. |
| **MV3-safe declarative-recipe long tail (data, not code)** | The long-tail catalog ships as **declarative recipes interpreted by a fixed bundled interpreter** — legal under MV3 (which bans remotely-hosted code). OpenTabs' npm-package-per-plugin model is fundamentally a desktop/Node distribution; it cannot ship arbitrary new code into an MV3 extension. This is *how* FSB gets a big catalog while staying Web-Store-compliant. | HIGH | Dependency: a deterministic recipe interpreter (allowlisted ops: build URL, set headers from a fixed set, map params, parse response). The interpreter is fixed code; recipes are pure data. Carries INV-04 (MV3-survivability) directly. |
| **Standalone-capable (catalog usable without external MCP host)** | FSB's own autopilot can drive capabilities via the same registry (INV-02 parity). OpenTabs is fundamentally a bridge that needs an external AI/MCP client (or its CLI) to do anything. FSB works as a self-contained agent *and* as an MCP server. | LOW–MEDIUM | Dependency: autopilot loop already shares the canonical tool registry. `search_capabilities`/`invoke_capability` must be callable from the internal loop, not only MCP. |
| **Unified consent across API + DOM + vault** | One coherent per-origin Off/Ask/Auto governance surface spanning API replay, DOM automation, and the credential/payment vault. OpenTabs governs plugins only; DOM-level browser tools are separate and ungoverned by the plugin permission model. | MEDIUM | Dependency: existing vault confirmation flow + new per-origin store. Single audit log across both paths. |
| **Same-origin-fetch safety posture** | FSB executes the API call *in the page's own origin context* via MAIN-world fetch, so it only ever sends auth the page itself could send (no cross-origin credential exfiltration primitive). Positioned as a deliberately narrower, safer capability than generic cross-origin session replay. | LOW (design choice) | This is a *constraint sold as a feature*. See anti-features for the cross-origin replay trap it avoids. |

### Anti-Features (Commonly Requested, Often Problematic)

Things that look like obvious parity items but should be **intentionally skipped or constrained**. Documenting these prevents scope creep and security regressions.

| Feature | Why Requested | Why Problematic | Alternative (FSB approach) |
|---------|---------------|-----------------|----------------------------|
| **npm-package-per-plugin distribution** (clone OpenTabs' model) | It's how OpenTabs ships ~2,000 tools; "just do what they do." | MV3 prohibits remotely-hosted/eval'd code — you cannot load an npm plugin's JS into the extension at runtime. Per-plugin toolchains (`tsc + build`, lint, type-check) are a desktop-Node assumption. Reproducing ~2,769 tools by hand is a content treadmill. | **Port + learn, not re-derive.** Bundle the head as compiled handlers; stream the tail as declarative recipes; grow the rest via CDP-capture learning. Explicitly a milestone constraint. |
| **Generic cross-origin authenticated session replay** | "Let the agent call ANY domain's API using my cookies from anywhere." Maximally powerful. | This is the CSRF/session-hijack threat model. Browsers auto-attach session cookies; a primitive that issues arbitrary cross-origin authenticated requests is a credential-exfiltration and forgery engine. `HttpOnly`/`SameSite`/CSRF-token protections exist precisely to stop this. | **Same-origin fetch only**, executed in the target page's own context. The agent can only send what that page could already send. Narrower by design. |
| **Remote code execution of server-delivered logic** | "Stream the plugin code from the server so the catalog updates instantly." | Direct MV3 violation; also makes the server a supply-chain RCE vector into every user's browser. | **Declarative recipes (data) + fixed local interpreter.** Server ships parameters, never executable logic. |
| **Auto-enable discovered capabilities** | "When FSB learns a new API, just use it." Frictionless. | Silent auto-trust of a freshly-captured, write-capable endpoint replaying user auth is the worst-case safety failure for this category. | **Default-off + Ask on first use.** Learned recipe lands in catalog as *discovered, not trusted*; first invocation requires explicit consent (mirrors OpenTabs "disabled by default even the ones I ship"). |
| **AI source-code review as the trust gate** (copy OpenTabs literally) | OpenTabs markets "your AI reviews the plugin source before you enable it." | For FSB the long tail is **declarative data, not source code**, so "review the source" is largely a category error — there is no adapter source to audit. Over-investing here misframes the model. | Show the user the **recipe in plain terms** (origin, endpoint, method, what data it sends) + per-origin consent + audit log. Trust the *data preview*, not a code-review ritual. Optional: surface the captured request for inspection. |
| **Background / unattended API execution** | "Run my API workflows while I'm away." | FSB is supervised-by-design; background agents were explicitly sunset (v0.9.45rc1 → OpenClaw/Claude Routines). Unattended auth-replay amplifies blast radius. | Keep capabilities **session-bound and supervised**, consistent with trigger watchers being "local and notify-only." External runtimes handle unattended. |
| **Desktop/email/SMS/Slack push on capability events** | "Notify me when the API call finishes." | FSB already drew this line for triggers (notify-only to the caller, no push). Re-litigating it here is scope creep. | Return structured results to the caller; let the orchestrating agent decide. |
| **Cloud-hosted capability execution** | "Run capabilities server-side so my browser doesn't need to be open." | Breaks the local-trust model and the authenticated-session premise (the session lives in the user's browser). Also contradicts OpenTabs' own "no cloud" promise. | **Local execution only.** Only recipe definitions (non-secret data) come from FSB's server. |

---

## The Search→Invoke (Progressive Disclosure) Pattern — Detailed Findings

This is the load-bearing mechanism (table-stakes #2) and deserves its own treatment because the roadmap must get it right.

**The problem it solves (verified):**
- Loading ~167 tools from 4 servers ≈ 60K tokens (~30% of a 200K window) *before any work*. Standard MCP setups can consume up to ~72% of context on tool defs.
- Tool-selection accuracy *collapses* with menu size: 43% → under 14% (wrong tool ~7/8 times) when overloaded.
- A 2,000–2,800-tool catalog is a non-starter as a flat MCP tool list.

**How Claude Code's Tool Search does it (the reference implementation):**
- **Lazy schema loading.** Detects when MCP tool descriptions exceed ~10K tokens, marks tools `defer_loading: true`, and replaces full defs with a single search tool. Discovery (a tool *exists*) is separated from schema fetch (how to *call* it).
- **Two search modes:** regex (precise, when the name is roughly known) and BM25 (natural-language/semantic, exploratory). Implication: FSB should index capabilities on origin + service + action verbs + synonyms.
- **Schema-on-hit:** "3–5 relevant tools (~3K tokens) get loaded per query." The hit carries enough to invoke — no separate describe call.
- **Overhead:** ~500 tokens for the search tool itself; net reduction ~85% (e.g. ~77K→~8.7K with 50+ tools). The extra round-trip (search, then invoke) is real but cheap relative to the savings.
- **Accuracy with search ON:** Opus 4 49%→74%; Opus 4.5 79.5%→88.1%. So search *improves* selection accuracy, not just token cost.

**Contested data point (flag for validation):** Stacklok's "MCP Optimizer" benchmark claims 94% selection accuracy vs Anthropic Tool Search "34%" — a vendor comparison that contradicts Anthropic's own 74–88% figures. Treat the 34% as adversarial marketing; the mechanism (search→invoke + lazy schema) is sound regardless of whose router scores highest. **Recommendation:** adopt the *pattern*, keep the ranking implementation swappable.

**FSB-specific design implications:**
- `search_capabilities(query, [origin])` should **bias on the active/owned tab's origin** — a major opportunity Claude Code's generic Tool Search does *not* exploit (no context/tab biasing found in its docs). FSB knows the agent's owned tab; rank same-origin capabilities first. This is a concrete parity-plus.
- Return schema-on-hit (avoid a describe round-trip).
- Keep results small (≤5) to preserve the accuracy gains.
- Index both **bundled** capabilities and **learned** (procedural-memory) recipes in one search.
- Carries INV-01/INV-02: existing ~63 tools stay byte-stable; only `search_capabilities` + `invoke_capability` are added.

---

## OpenTabs Parity Matrix

Explicit map of **what FSB matches, what it exceeds, and what it intentionally skips.** Baseline = OpenTabs as of 2026-06 (github.com/opentabs-dev/opentabs).

> **On the numbers:** OpenTabs' own site says "100+ plugins, ~2,000 tools." The live `plugins/` directory currently shows ~136 plugin folders (counted 2026-06-19), and the milestone brief cites "119 plugins / ~2,769 tools." These are all consistent: the catalog is **auto-growing via AI-built plugins** ("most plugins in this repo were built by AI in minutes"), so any single number is a point-in-time snapshot. FSB should not chase the absolute count — it should match the *mechanism* (auto-grow) and beat it on resilience.

| Capability | OpenTabs | FSB v0.9.99 plan | Verdict |
|------------|----------|------------------|---------|
| Authenticated API call via session, no API keys/OAuth | Yes — calls the app's internal API the frontend calls | Yes — MAIN-world same-origin `fetch` via existing `execute_js` primitive | **MATCH** |
| Lean tool surface for huge catalog | Implicit (MCP client + plugin enable); not a documented search→invoke router | `search_capabilities` + `invoke_capability`, schema-on-hit, tab-origin biasing | **EXCEED** (explicit progressive disclosure + tab biasing) |
| Permission model Off/Ask/Auto | Yes — per-plugin or per-tool; resets on plugin update | Yes — per-origin (+ per-capability) Off/Ask/Auto; default-off | **MATCH** |
| Default-off, nothing runs until enabled | Yes — "everything starts off… even the ones I ship" | Yes — default Off per origin | **MATCH** |
| Audit log | Yes — "every tool call is logged (what ran, when, succeeded)" | Yes — extend existing session logs/observability to capability invocations | **MATCH** |
| Local execution, no cloud | Yes | Yes — execution in-browser; only recipe *data* from server | **MATCH** |
| Built-in browser tools (screenshot/click/type/network), no plugin needed | Yes — works on any tab | Yes, and far deeper — 55/63 DOM+CDP tools already shipped | **EXCEED** (mature DOM engine pre-exists) |
| Plugin/capability discovery from a live site | Yes — AI analyzes page, discovers APIs, scaffolds code, registers plugin (3-step, self-improving skill) | Yes — CDP `Network.*` capture of real requests → declarative recipe | **MATCH** (different mechanism: capture vs scaffold-code) |
| AI code review before enable | Yes — reviews adapter source; user decides | Intentionally reframed — long tail is *data*, not code; show recipe preview + consent instead | **INTENTIONAL SKIP** (category mismatch; replaced by data-preview consent) |
| Plugin distribution | npm package per plugin; `opentabs plugin install <name>`; publishable | Bundled head (zero-install) + server-streamed declarative recipes; optional explicit install | **EXCEED** (zero-install, MV3-legal) — and **SKIP** the npm-per-plugin model |
| CLI mode (non-MCP) | Yes — "don't want MCP? use CLI mode" | FSB has its own standalone autopilot + control panel; not shipping a separate CLI for capabilities | **PARTIAL / SKIP** (standalone-via-autopilot instead of a dedicated CLI) |
| Self-healing API→DOM fallback | **No** — broken API tool is dead until re-built | **Yes** — drops to DOM + site guides, completes task | **EXCEED** (unique) |
| Learned/auto-growing catalog from real use | Partial — AI *builds* plugins (code artifacts, human-reviewed/published) | Yes — successful calls auto-promote to procedural-memory recipes (data, zero authoring) | **EXCEED** (auto-learn into memory, incl. private/internal tools) |
| Standalone usable without external MCP host | Limited — bridge needs an MCP client or its CLI | Yes — internal autopilot shares the same capability registry | **EXCEED** |
| Same-origin-only safety constraint | Not emphasized (model is plugin-mediated API access) | Yes — deliberately same-origin fetch only | **EXCEED** (narrower, safer primitive) |
| Anonymous telemetry, opt-out | Yes | FSB already has anonymous opt-out telemetry (v0.9.69) | **MATCH** |

**Summary:** FSB **matches** every table-stakes item, **exceeds** on six axes (self-healing fallback, learned/auto-grow, zero-install, standalone, tab-biased search, same-origin safety), and **intentionally skips** three (npm-per-plugin distribution, generic cross-origin replay, code-review-as-trust-gate) — each skip is a deliberate safety/MV3 posture, not a gap.

---

## Feature Dependencies

```
[search_capabilities + invoke_capability]   (lean MCP dispatcher, INV-01/02)
        |
        +--requires--> [Capability registry/index] (bundled head + learned recipes)
        |                      |
        |                      +--requires--> [Authenticated same-origin fetch primitive]
        |                      |                      └─builds on─> execute_js MAIN-world (EXISTS)
        |                      |
        |                      +--requires--> [Declarative recipe interpreter] (MV3-safe, fixed code)
        |                                             └─fed by─> server-delivered recipe data
        |
        +--enhanced-by--> [Tab-origin biasing] (rank owned-tab origin first)  <- parity-plus

[CDP network-capture discovery]
        └─requires─> chrome.debugger Network.* (debugger already attached, EXISTS)
        └─produces─> candidate recipe -> [Learned recipe in procedural memory]
                                              └─requires─> 3-type memory + consolidator (EXISTS)
                                              └─feeds─> Capability registry/index

[Per-origin Off/Ask/Auto consent]  --gates--> [invoke_capability]
        └─reuses─> vault confirmation UX (EXISTS)
        └─requires─> per-origin permission store (chrome.storage.local) (NEW)

[Audit log] --records--> every [invoke_capability] + every API->DOM fallback
        └─extends─> session logs / get_logs / observability tools (EXISTS)

[API->DOM self-healing fallback]  --depends-on--> DOM engine + 17-category site guides + run_task (ALL EXIST)
        └─triggered-by─> recipe failure detection (HTTP status / shape mismatch / empty payload)

[Default-off] --conflicts-with--> [Auto-enable discovered capabilities] (ANTI-FEATURE — keep default-off)
[Generic cross-origin replay] --conflicts-with--> [Same-origin-only safety] (ANTI-FEATURE — keep same-origin)
```

### Dependency Notes

- **search/invoke requires the registry, which requires the fetch primitive + the interpreter:** you cannot expose capabilities you can't execute. Build order: fetch primitive → interpreter → registry → search/invoke tools.
- **Discovery requires CDP network capture, which is unlocked by the existing `debugger` attach** (confirmed live in `background.js`). The new work is `Network.enable` + request/response/getResponseBody handling, not acquiring the permission.
- **Learned recipes require procedural memory** — the `PROCEDURAL` type, consolidator, and `search_memory` already exist; the new work is the recipe *shape* and the promote-on-success path.
- **Consent gates invoke, and reuses the vault confirmation pattern** — don't build a second confirmation UX; extend the one `use_payment_method` already uses.
- **Self-healing depends entirely on pre-existing FSB subsystems** (DOM engine, site guides, autopilot) — this differentiator is cheap *because FSB already owns both halves*; OpenTabs would have to build a whole DOM engine to match it.
- **Two hard conflicts are the anti-features:** default-off vs auto-enable, and same-origin vs cross-origin replay. The roadmap must keep the safe side of both; they should never land in the same phase as "make it frictionless."

---

## MVP Definition

### Launch With (v1 of the capability catalog)

The thinnest slice that proves "FSB calls authenticated APIs through the session, safely, behind a lean dispatcher."

- [ ] **Authenticated same-origin fetch primitive** — the executable core; nothing works without it.
- [ ] **`search_capabilities` + `invoke_capability` (schema-on-hit, ≤5 results, tab-origin biasing)** — the lean surface; satisfies INV-01/INV-02 and the no-bloat mandate.
- [ ] **Bundled head: a handful of hard/popular services as compiled handlers** — proves zero-install + the imperative path. (Pick 5–10 high-value services.)
- [ ] **Per-origin Off/Ask/Auto consent + default-off** — non-negotiable safety; reuses vault confirm UX.
- [ ] **Audit log of capability invocations** — extends existing observability.
- [ ] **API→DOM self-healing fallback (basic: on failure, escalate to `run_task`/DOM)** — the flagship differentiator; even a simple version is the headline.

### Add After Validation (v1.x)

- [ ] **Declarative recipe interpreter + server-delivered long-tail recipes** — scales the catalog the MV3-legal way. *Trigger: head proves out and demand for the tail is real.*
- [ ] **CDP network-capture discovery** — "point FSB at a site, it learns the API." *Trigger: interpreter exists to hold the captured recipe.*
- [ ] **Learned recipes auto-promoted into procedural memory** — the auto-grow flywheel. *Trigger: discovery + interpreter both shipped.*
- [ ] **Capability-discovered UX surface** ("FSB found a faster way to do X here — save it? trust it?") with recipe-data preview. *Trigger: learning path exists to surface.*
- [ ] **Per-capability (not just per-origin) consent granularity.** *Trigger: users want finer control after living with per-origin.*

### Future Consideration (v2+)

- [ ] **Optional explicit install of long-tail capability packs via MCP command / control panel** — power-user curation. *Defer: auto-grow + streamed tail covers most needs first.*
- [ ] **Capability sharing/export between users or machines** (declarative recipes are portable data). *Defer: needs a trust/provenance model; until PMF, learned-local is enough.*
- [ ] **Richer fallback intelligence** (intent-based DOM healing using the captured API's semantic intent to guide the DOM path). *Defer: basic escalation first; 75–90% intent-based healing is a later optimization.*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Authenticated same-origin fetch primitive | HIGH | MEDIUM | P1 |
| `search_capabilities` + `invoke_capability` (lean dispatcher) | HIGH | HIGH | P1 |
| Schema-on-hit + tab-origin biasing | HIGH | MEDIUM | P1 |
| Per-origin Off/Ask/Auto + default-off | HIGH (safety) | MEDIUM | P1 |
| Audit log of invocations | MEDIUM | LOW | P1 |
| Bundled head (compiled handlers, zero-install) | HIGH | MEDIUM | P1 |
| API→DOM self-healing fallback (basic) | HIGH (differentiator) | MEDIUM | P1 |
| Declarative recipe interpreter (MV3-safe) | HIGH | HIGH | P2 |
| Server-delivered long-tail recipes | MEDIUM | MEDIUM | P2 |
| CDP network-capture discovery | HIGH (differentiator) | HIGH | P2 |
| Learned recipes → procedural memory (auto-grow) | HIGH (differentiator) | HIGH | P2 |
| Capability-discovered "save/trust" UX | MEDIUM | MEDIUM | P2 |
| Per-capability consent granularity | MEDIUM | LOW | P2 |
| Optional explicit install of capability packs | LOW | MEDIUM | P3 |
| Capability sharing/export | LOW | HIGH | P3 |
| Intent-based DOM healing (advanced fallback) | MEDIUM | HIGH | P3 |

**Priority key:** P1 = must have for the v1 capability slice · P2 = add after the core path validates · P3 = future / PMF-gated.

---

## Competitor Feature Analysis

| Feature | OpenTabs | Claude Code Tool Search (pattern reference) | FSB v0.9.99 approach |
|---------|----------|---------------------------------------------|----------------------|
| Big-catalog tool exposure | MCP + per-plugin enable; flat-ish surface | Lazy schema load, `defer_loading`, search→invoke, 3–5 tools/query, ~500-tok overhead | `search_capabilities`/`invoke_capability` + schema-on-hit + **tab-origin biasing** (beyond Claude's generic search) |
| Auth API execution | Plugin calls app's internal API via session | N/A (general tool router) | MAIN-world same-origin fetch via `execute_js` |
| Discovery / catalog growth | AI scaffolds a code plugin (self-improving skill) | N/A | CDP network capture → declarative recipe → procedural memory |
| Distribution | npm package per plugin | N/A | Bundled head + streamed declarative tail; no per-plugin install |
| Permissions | Off/Ask/Auto per plugin/tool, reset on update | N/A | Off/Ask/Auto per origin (+per capability), default-off |
| Trust gate | AI reviews adapter *source* | N/A | Recipe *data* preview + consent + audit (no source to review) |
| Failure when API breaks | Tool dead until re-built | N/A | **Self-heal to DOM + site guides** |
| Standalone | Needs MCP client or its CLI | Lives inside Claude Code | Standalone via FSB autopilot **and** MCP |
| Safety scope | Plugin-mediated API access | N/A | **Same-origin only** (no cross-origin credential replay) |

---

## Open Questions / Flags for Roadmap

- **Ranking implementation is swappable, but pick one for v1.** BM25 + regex (Claude Code's choice) is a sane default; vendor accuracy claims conflict (Anthropic 74–88% vs Stacklok's adversarial 34%/94% framing). Don't over-engineer the router in v1 — keep it replaceable.
- **Recipe schema is the crux of the MV3-safe split.** The declarative recipe format must be expressive enough for the long tail (URL templating, header set from a fixed allowlist, param mapping, response extraction, pagination?) yet provably non-Turing-complete so the interpreter stays "fixed code, data-only input." This is the highest-risk design artifact → likely needs a dedicated research/spike phase. (PITFALLS will cover MV3 remote-code boundaries in depth.)
- **Failure-detection taxonomy for self-healing** needs definition: which signals (HTTP 4xx/5xx, auth-redirect HTML instead of JSON, empty/shape-mismatched payload, CSRF-token rejection) trigger the DOM fallback, and how to avoid false-fallbacks that mask real "no results" answers.
- **CSRF/same-origin nuance:** even same-origin fetch can trip CSRF defenses if the page's real requests carry a per-request token the agent didn't capture. Capture-then-replay must record token-bearing headers; flag as a discovery-fidelity requirement.
- **Counting expectations:** do not set a "match OpenTabs' N tools" success metric. Match the *auto-grow mechanism* and win on resilience; the absolute count is a moving, AI-generated target.

---

## Sources

OpenTabs feature surface and parity baseline:
- [github.com/opentabs-dev/opentabs (README + plugins directory, ~136 plugin folders counted 2026-06-19)](https://github.com/opentabs-dev/opentabs)
- [opentabs.dev (landing — plugin/tool counts, discovery flow, "disabled by default," AI code review, audit log)](https://opentabs.dev/)
- [OpenTabs on mcpmarket.com](https://mcpmarket.com/server/opentabs)
- [OpenTabs on mcpservers.org](https://mcpservers.org/servers/opentabs-dev/opentabs)

Search→invoke / progressive disclosure (Claude Code Tool Search + MCP context-bloat):
- [What is MCP Tool Search — Claude Code context-pollution guide (lazy schema, defer_loading, regex/BM25, accuracy numbers)](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide)
- [Claude Code MCP Tool Search: lazy loading cut token usage 85% (Software Thug)](https://www.softwarethug.com/posts/claude-code-mcp-tool-search-lazy-loading/)
- [MCP context-bloat crisis — accuracy collapse 43%→14% (AgentMarketCap)](https://agentmarketcap.ai/blog/2026/04/08/mcp-context-bloat-enterprise-scale-tool-definitions-agent-context-budget)
- [Stacklok MCP Optimizer vs Anthropic Tool Search head-to-head (contested accuracy figures)](https://dev.to/stacklok/stackloks-mcp-optimizer-vs-anthropics-tool-search-tool-a-head-to-head-comparison-2f32)
- [RAG-MCP: when too many tools become too much context (Medium)](https://medium.com/@pankaj_pandey/when-too-many-tools-become-too-much-context-a-deep-dive-into-rag-mcp-9b628c8476d3)

Self-healing API→DOM fallback (differentiator grounding):
- [Browser Harness — self-healing browser automation for AI agents](https://openflows.org/currency/currents/browser-harness/)
- [Best self-healing test automation tools 2026 — locator-fallback 40–70% vs intent-based 75–90%+ (Shiplight)](https://www.shiplight.ai/blog/best-self-healing-test-automation-tools)
- [The State of AI & Browser Automation in 2026 (Browserless)](https://www.browserless.io/blog/state-of-ai-browser-automation-2026)

Consent / session-replay security (default-off + same-origin grounding):
- [CSRF — OWASP Cheat Sheet (cookie auto-attach, SameSite, tokens)](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [CSRF — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [Towards Browser Controls to Protect Cookies from Malicious Extensions (arXiv)](https://arxiv.org/html/2405.06830v3)

Capture-then-replay UX precedent:
- [NetReplay — capture & replay network requests, local-only (Chrome Web Store)](https://chromewebstore.google.com/detail/netreplay-%E2%80%93-capture-repla/elfmodpnblbidnigceioaffjdadpgjko)
- [Trustworthy AI agents: deterministic replay (Sakura Sky)](https://www.sakurasky.com/blog/missing-primitives-for-trustworthy-ai-part-8/)

FSB-internal (read directly, not cited as web sources): `extension/ai/tool-executor.js` (`execute_js` MAIN-world), `extension/background.js` (`chrome.debugger` attach for CDP), `extension/lib/memory/memory-schemas.js` (`PROCEDURAL` memory type), `mcp/README.md` (63-tool surface), `.planning/PROJECT.md` (milestone goal + invariants INV-01..04).

---
*Feature research for: authenticated-API-through-the-session agent capabilities (FSB v0.9.99 Native Capability Catalog)*
*Researched: 2026-06-19*
