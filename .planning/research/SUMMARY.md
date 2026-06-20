# Project Research Summary

**Project:** FSB (Full Self-Browsing)
**Milestone:** v0.9.99 Native Capability Catalog (FSB API Execution)
**Domain:** MV3 Chrome-extension capability runtime — call a service's real web API through the user's authenticated browser session (the OpenTabs idea) as a fast path alongside DOM automation, behind a lean MCP dispatcher, with zero plugin installs and no MCP tool bloat
**Researched:** 2026-06-19
**Confidence:** HIGH

> This SUMMARY synthesizes the four research files written for THIS milestone, which replaced their prior-milestone content at the canonical paths: [STACK.md](STACK.md), [FEATURES.md](FEATURES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PITFALLS.md](PITFALLS.md). Prior-milestone pitfalls are preserved at [PITFALLS-v0.9.69-TELEMETRY.md](PITFALLS-v0.9.69-TELEMETRY.md), [PITFALLS-EXCALIDRAW.md](PITFALLS-EXCALIDRAW.md), [PITFALLS-MODULARIZATION.md](PITFALLS-MODULARIZATION.md). The prior v0.11.0 SUMMARY this file supersedes is recoverable from git history.

## Executive Summary

This milestone gives FSB **authenticated-API execution as a fast path** beside its existing DOM engine: the agent calls the *same* internal web API the page's frontend calls, riding the user's already-authenticated session, instead of clicking the UI — and silently self-heals back to DOM automation when the API path breaks. The decisive research finding is that **FSB already ships the hard primitive.** Three live code paths inject JS into the page **MAIN world** via `chrome.scripting.executeScript`, where a `fetch('/api', {credentials:'include'})` runs *as the site's own origin* and the browser attaches the user's cookies (HttpOnly included) automatically. FSB also already holds `debugger` + `<all_urls>` + `unlimitedStorage`, attaches CDP at protocol `1.3`, and has an inverted-index memory store. So this is **not greenfield infrastructure** — it is a structured, governed, learnable wrapper around primitives that already exist, plus **three small eval-free libraries** (`minisearch`, `jmespath`, `@cfworker/json-schema`) vendored the way `lz-string` already is. **No manifest or permission change is required.**

Two hard walls shape every phase and must be treated as architectural invariants, not mitigations. **Wall 1 (MV3 "no remotely hosted code"):** server-delivered recipes must be **CLOSED-vocabulary DATA** (endpoint template + method + an auth-strategy *enum* + param schema + static request map + a read-only JMESPath extract) bound by a **fixed bundled interpreter** — never `eval`'d, never grown into a mini-language of server-authored control flow. Google explicitly prohibits "an interpreter to run complex commands fetched as data," so a CI guard must fail the build on any `eval`/`new Function`/`import(` reachable from the recipe path and reject any recipe opcode outside the enum. **Wall 2 (execution context):** the authenticated fetch **MUST run in the page MAIN world** (via the existing `execute_js` seam) so the user's first-party HttpOnly/SameSite cookies attach; a **background-SW `fetch()` is the anti-pattern** (it is extension-origin, cross-origin to the site, hits CORS, and silently drops SameSite cookies → 401/403 or a logged-out 200). CDP `Network` is **discovery-only**, never the invoke transport.

The biggest risk is that this feature is, definitionally, **automated replay of the user's credentials against private endpoints** — the exact capability a stealth credential-stealer wants — bolted onto a product whose entire brand is "supervised/safe." That is why the posture is **default-OFF per origin, Off/Ask/Auto consent, origin-pinning (a recipe for an origin may only target that origin), recipe integrity (sign/verify, reusing FSB's Lattice Ed25519/JCS receipts), mutation gating, auth-strictly-local (no cookie/token ever leaves the device or persists), and a complete audit log.** The second structural risk is **capability boundary**: signed/HMAC/nonce/ephemeral-token/persisted-query-hash requests **cannot be captured-and-replayed generically** (the secret + signer live in page JS and recompute per request), which makes the **DOM self-healing fallback mandatory, not optional** — it is the universal floor that catches recipe rot, the hard auth classes, and no-UI-path gaps. The right competitive posture is **parity-plus**: match OpenTabs' *auto-grow mechanism* (do NOT chase its moving ~2,769 AI-generated tool count), and win on self-healing fallback, learned/auto-growing recipes, zero-install, standalone-via-autopilot, tab-biased search, and the same-origin-only safety constraint.

## Key Findings

### Recommended Stack

The stack delta is deliberately tiny and **eval-free by mandate**. FSB reuses what it already has (MV3 SW, the MAIN-world `executeScript`+`new Function` fetch primitive, `chrome.debugger`@`1.3`, the `jsonSchemaToZod` bridge, the `chrome.storage.local` inverted-index memory store, esbuild, `@modelcontextprotocol/sdk@^1.29.0` + `zod@^3.24.0`). It adds **three small, zero-dependency, SW-safe libraries** vendored into the service worker like `lib/lz-string.min.js` (PATH A) or emitted as one `capability-runtime.js` IIFE via a new esbuild entry (PATH B) — `background.js` is byte-frozen (D-17) so the SW is **not** an esbuild input. **Nothing new on the MCP-server side**; the two new tools register through the existing `server.tool()` + `jsonSchemaToZod()`. The interpreter and auth-strategy handlers are **FSB-authored code shipped in the package** by design (RHC-safe). See [STACK.md](STACK.md).

**Core technologies (the actual new deps — all zero-dependency, eval-free, SW-safe):**
- **`minisearch@7.2.0`** (capability search, in the SW) — ~7 kB gz BM25 + prefix + fuzzy with **field boosting** (the clean lever for **tab-origin biasing**); `toJSON`/`loadJSON` snapshot persists to `chrome.storage.local`. Far better recall than `String.includes`, far lighter than embeddings.
- **`jmespath@0.16.0`** (response extraction, read-only, in the SW) — verified pure tree-walking interpreter, **no `eval`/`Function`**, a formally-specified side-effect-free *read* query language → stays on the safe side of the RHC "no complex-command interpreter" rule because it can only project/filter existing JSON.
- **`@cfworker/json-schema@4.1.1`** (in-SW recipe + param validation) — purpose-built for strict-CSP runtimes with **no `eval`/`new Function`** (the MV3-safe replacement for Ajv), drafts 4/7/2019-09/2020-12.
- **`url-template@3.1.1`** (optional) — only if the long tail needs RFC 6570 query/explode; otherwise a 10-line hand-rolled `{var}` replacer.

**Hard stack exclusions (load-bearing):** **Ajv in default codegen mode** (compiles validators with `new Function` → throws under MV3 SW CSP; confirmed real-world breakage, MCP-SuperAssistant #171); **JSONata in recipes** (a full server-authorable expression language = the textbook prohibited "interpreter for complex commands fetched as data"); **any `eval`/`new Function` on a recipe field in the SW**; **local embedding/ML runtimes** (tens of MB, needs `wasm-unsafe-eval`, pointless at this corpus size); **`jsonpath-plus`** (script-expression eval surface); **`zod@4.x`** (coercion drift risk vs the zod-3 bridge → INV-01); and **routing the authenticated fetch through SW `fetch()`** (Wall 2).

### Expected Features

FSB **matches every table-stakes item, exceeds on six axes, and intentionally skips three** (each skip a deliberate MV3/safety posture, not a gap). See [FEATURES.md](FEATURES.md) and its OpenTabs parity matrix.

**Must have (table stakes — the category definition):**
- **Authenticated same-session API call** — the whole value prop; built on the existing MAIN-world `fetch`.
- **Lean tool surface / progressive disclosure** (`search_capabilities` → `invoke_capability`, **schema-on-hit**, ≤5 results, **tab-origin biasing**) — a 2,000–2,800-tool catalog cannot be a flat MCP list (loading ~167 tools already costs ~60K tokens; selection accuracy collapses 43%→<14% when overloaded). Search ON *improves* accuracy (Opus 4.5: 79.5%→88.1%), not just token cost.
- **Per-origin Off/Ask/Auto consent + default-off + audit log** — replaying real auth is write/money-capable; nothing runs until explicitly enabled.
- **Local execution / no cloud; structured-data result; works with any MCP client** — mostly already true for FSB.
- **Capability discovery** (point FSB at a site, it learns the API) — via CDP `Network` capture.

**Should have (the differentiators where FSB beats OpenTabs):**
- **API→DOM self-healing fallback** — *the single biggest differentiator*; when a recipe breaks FSB drops to its DOM engine + 17-category site guides + `run_task` and still completes. OpenTabs has **no** fallback (a broken API tool is dead until re-built).
- **Learned / auto-growing catalog via procedural memory** — successful discovered calls auto-promote to per-origin recipes (declarative data, zero authoring), incl. private/internal tools.
- **Zero-install bundled head + MV3-safe declarative-recipe long tail** — popular capabilities ship in the extension; the tail streams as *data*; no `npm install <plugin>` per service.
- **Standalone-via-autopilot, unified consent across API+DOM+vault, same-origin-fetch safety** (a constraint sold as a feature).

**Defer (v1.x / v2+):** server-delivered long-tail recipes + CDP discovery + learned-recipe promotion are an **add-after-validation** tranche (gate: head proves out); per-capability (vs per-origin) consent granularity; optional explicit capability-pack install; capability sharing/export (needs a trust/provenance model); intent-based DOM healing (the 75–90% optimization after basic escalation works).

**Intentional skips (anti-features):** npm-package-per-plugin distribution (MV3-illegal as runtime code); **generic cross-origin authenticated replay** (the CSRF/credential-exfiltration engine — same-origin only); RCE of server-delivered logic; auto-enable of discovered capabilities; AI-source-code-review as the trust gate (the tail is *data*, not code → show a recipe preview instead); background/unattended execution; push notifications; cloud execution.

### Architecture Approach

The capability layer is **new SW source files composing existing primitives** (mirroring the v0.11.0 `trigger` precedent), with **two thin front doors converging on one engine**. MCP reaches it via `search_capabilities`/`invoke_capability` registered **OUTSIDE `TOOL_REGISTRY`** (the `vault.ts` precedent — keeps INV-01 untouched and the surface lean); autopilot reaches it via a `tool-executor.js` branch; **both call one `capability-router.js`** (INV-02 parity at the *runtime* layer, not by sharing a tool schema). The router selects a tier (T0 model-prior public APIs → T1a bundled imperative handlers (code, shipped) → T1b bundled/server declarative recipes (data) → T2 learned recipes (memory) → T3 DOM fallback), **biased by the owned tab's origin**, and on break/empty/4xx-5xx/shape-mismatch routes to the DOM fallback. The **consent gate sits immediately after `checkOwnershipGate` inside `dispatchMcpToolRoute`** (single chokepoint; `Off` hard-refuses before any side effect). See [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components (NEW unless noted):**
1. **MCP capability tools** (`mcp/src/tools/capabilities.ts`) — `search_capabilities` (read-only, queue-bypass) + `invoke_capability` (queued); registered via `server.tool()`, **not** in `TOOL_REGISTRY`.
2. **Dispatch chokepoint** (`ws/mcp-tool-dispatcher.js`, MODIFIED) — existing ownership gate **+ new per-origin consent gate** + new `mcp:capabilities-*` routes.
3. **Capability runtime** (`utils/capability-{catalog,router,interpreter,fetch,discovery,consent,audit}.js`) — catalog/tiering, origin-biased routing + fallback decision, declarative-recipe→templated-fetch interpreter (SW), the **fixed bundled MAIN-world fetch fn** + CSRF scrape/extract helpers, CDP `Network` capture→recipe synthesis, per-origin store, append-only audit (no secrets).
4. **Authenticated fetch boundary** — `chrome.scripting.executeScript({world:'MAIN', func: <bundled fn>, args:[spec]})`; the recipe supplies *parameters to a bundled function*, never executable strings (the MV3-safe code/data split).
5. **Learned-recipe store** (`lib/memory/*`, REUSE+extend) — recipes as `createProceduralMemory` records (extend `typeData` with `{endpoint, method, headerMap, csrfSource, extractPath, origin}`); **store shape, never response bodies/PII**.
6. **DOM fallback** (`tool-executor.js executeTool()`, REUSE) — the universal floor.

### Critical Pitfalls

Top items from [PITFALLS.md](PITFALLS.md). The first two are the architectural walls; the rest are high-severity.

1. **Recipe interpreter drifts into "code fetched as data" → Web Store ban (WALL 1).** The format grows an `if`, a `map(expr)`, an inline transform string, then `eval`. Because FSB holds `debugger`+`<all_urls>` (max-scrutiny perms) this is a *takedown of an extension with an install base*, not a warning. **Avoid:** freeze a **closed opcode/enum vocabulary** with a versioned JSON Schema; **CI guard fails on `eval`/`new Function`/`import(`** reachable from the recipe path and rejects unknown opcodes; treat the hardest/most-popular services as **bundled imperative handlers**, never recipes. Watch for a recipe field named `script`/`expr`/`transform`/`code`/`fn`/`js`.
2. **Replay fetch from the wrong context (extension origin) → auth silently absent (WALL 2).** A SW `fetch(url,{credentials:'include'})` sends the *extension's* cookie jar, not the user's session → 401/403 or a logged-out 200; the recipe gets blamed for "rot." **Avoid:** issue same-origin authenticated calls from the **page MAIN world** (existing `execute_js` seam); a smoke test must assert the **logged-in data shape** (not logged-out) from the chosen context against a real HttpOnly site.
3. **Credential-replay weapon / "safe brand" inversion.** A malicious/poisoned recipe with `<all_urls>` could drive the user's session to read DMs / send messages / move money on any logged-in site. **Avoid:** **default-OFF per origin**, Off/Ask/Auto (Auto is explicit per-origin opt-in, never global); **origin-pinning** enforced *in the interpreter* (request origin ≠ consented origin → reject); **sign/verify server recipes** (Ed25519/JCS via Lattice receipts) before execute; **mutation gating** (POST/PUT/PATCH/DELETE = higher consent + shown in the Ask prompt); sensitive-origin friction (banking/email/gov) even in Auto.
4. **Auth or recipe-template data routed back to FSB's server → exfiltration + Limited-Use violation.** The captured call *is* the auth; POSTing it for "learning"/telemetry ships cookies/tokens off-device. **Avoid:** **auth strictly local**; redact auth fields **at capture time before persist/promote/egress**; learned recipes store **shape only**; a tested redactor asserts no `cookie`/`authorization`/`token`/`x-csrf` substring survives.
5. **Recipe rot — APIs change, hashes/endpoints break, no expiry detection → confidently-wrong/empty results.** Vendors ship new bundles weekly; a persisted-query hash 404s (`PersistedQueryNotFound`); a changed filter silently returns everything/nothing. **Avoid:** stamp recipes with captured-at + schema hash; **validate each response against an expected-shape assertion** → typed `RECIPE_EXPIRED`; for APQ keep the **full query body** alongside the hash (or re-scan the JS bundle); on `RECIPE_EXPIRED` **self-heal to DOM and re-learn**; quarantine repeat failures. This is the *designed steady state*, not an edge case.
6. **Capability-search recall/precision failure.** Low recall → the model never finds the tool (whole fast-path investment wasted on DOM fallback); low precision → a fuzzy match auto-fires the *wrong destructive* call with real credentials. **Avoid:** index on **intent-phrased synonyms + service + action verb + side-effect class**, not endpoint names; return scored/ranked/origin-scoped results with side-effect class visible; **disambiguate before any mutating invoke**; build an **eval harness** (recall@k + wrong-invoke rate) and gate the milestone on it (FSB has the 50-prompt precedent).
7. **MV3 SW eviction mid-API-call → lost in-flight request, ambiguous mutation state.** An in-flight `fetch` counts as idle; the SW dies at ~30s; a naive retry duplicates a POST (two issues/messages). **Avoid:** **reuse FSB's proven survival machinery** from `run_task` Phase 239 (`mcp-task-store.js` resume-sidecar, `chrome.storage.session` hot-state, `partial_state`/`sw_evicted`) + Lattice ResumePolicy (`SAFE`/`ON_ERROR`/`RECOVERY_AMBIGUOUS`); treat ambiguous mid-mutation as `RECOVERY_AMBIGUOUS` (idempotency key / read-back / surface to user — **never blind-retry**).

## Implications for Roadmap

Based on combined research, the suggested phase structure **continues integer phases from Phase 25** (per PROJECT.md). This sequence **reconciles the four researchers' orderings into one**: it honors PITFALLS' insistence that the **recipe schema + CI guard is a day-one invariant (P-A)** and that the **fetch primitive carries resume-sidecar + origin-pinning from the start (P-B)**; it follows ARCHITECTURE's dependency-driven "prove the cookie/CORS/CSRF fetch FIRST, then surface, then tier, then govern, then discover, then harden self-heal"; and it lands FEATURES' P1 MVP slice across the first four phases with the P2 discovery/learning tranche after. **Net: 7 phases** (Phase 25–31).

> Ordering principle (all four agents agree): the **riskiest unknown is the page-context authenticated fetch (cookies/CORS/CSRF/SameSite)** — de-risk it first against ONE hardcoded recipe; **discovery-first is wrong** because a learned recipe is useless until invoke + routing exist to consume it and dangerous until consent gates it.

### Phase 25: Recipe schema + bundled interpreter + MV3 CI guard
**Rationale:** Wall 1 is a day-one invariant — the schema's *closedness* and the CI guard must exist before any recipe is interpreted, or the design drifts into a ban. (PITFALLS P-A; foundational for everything downstream.)
**Delivers:** versioned JSON Schema for recipes (endpoint template, method, auth-strategy **enum**, param schema, static request map, JMESPath extract); the **fixed bundled interpreter** dispatching to a closed enum of bundled auth-strategy handlers; `@cfworker/json-schema` validation in the SW; **CI guard** failing on `eval`/`new Function`/`import(` reachable from the recipe path + rejection of unknown opcodes; homepage Limited-Use/compliance note.
**Uses:** `@cfworker/json-schema`, `jmespath` (vendored PATH A/B); the FSB-authored interpreter.
**Avoids:** Pitfall 1 (WALL 1 ban).
**Invariant watch:** MV3 (no server code; closed vocabulary).

### Phase 26: Authenticated fetch primitive (page MAIN-world) + execution-context contract + resume-sidecar + origin-pin
**Rationale:** Wall 2 — the spine. Prove a same-origin credentialed `fetch` (incl. CSRF scrape) works through the `execute_js` seam against ONE hardcoded recipe; everything authenticated depends on this. Build SW-eviction survival and origin-pinning in from the start (cheaper than retrofitting; origin-pin must hold even on an un-governed path). (PITFALLS P-B + Pitfall 7; ARCHITECTURE P1.)
**Delivers:** `capability-fetch.js` (the bundled MAIN-world fetch fn + CSRF/extract helpers) + minimal `capability-interpreter.js` wiring; resume-sidecar reuse (`mcp-task-store.js` / `chrome.storage.session`, `RECOVERY_AMBIGUOUS` for mid-mutation); origin-pin enforcement.
**Uses:** existing `executeScript({world:'MAIN'})` seam, `run_task`/Lattice survival machinery.
**Avoids:** Pitfalls 2, 7 (and 3's cross-origin leg at the primitive level).
**Invariant watch:** INV-04 (no iterator change; invoke is a single bounded async op).

### Phase 27: Lean MCP surface — `search_capabilities` + `invoke_capability` (outside TOOL_REGISTRY) + dispatcher routes + search/index
**Rationale:** Once invoke works internally, expose the lean wire surface through the single chokepoint, and stand up the search/index the whole progressive-disclosure model depends on (search quality is the catalog's ceiling). (ARCHITECTURE P2; PITFALLS P-C; FEATURES P1.)
**Delivers:** `mcp/src/tools/capabilities.ts` (schema-on-hit, ≤5 results, tab-origin biasing); `minisearch` index in the SW (`toJSON`/`loadJSON` snapshot); MODIFIED `runtime.ts`, `queue.ts` (`search_capabilities` read-only bypass), `mcp-tool-dispatcher.js`, `mcp-bridge-client.js`; **eval harness** (recall@k + wrong-invoke gate).
**Uses:** `minisearch`, existing `jsonSchemaToZod()` + zod-3.
**Addresses:** lean dispatcher / progressive disclosure (table stakes #2).
**Avoids:** Pitfall 6 (recall/precision); INV-01 drift.
**Invariant watch:** **INV-01** (existing ~63 tool schemas byte-identical; only 2 added; `.cjs` mirror untouched).

### Phase 28: Catalog registry + router + tiers (T0/T1a/T1b) + autopilot path
**Rationale:** With one front door proven, add tiering and the **autopilot branch** so both surfaces share the engine (INV-02 at the runtime layer). Bundled head (T1a) proves zero-install + the imperative path. (ARCHITECTURE P3; FEATURES P1 bundled head.)
**Delivers:** `capability-catalog.js`, `capability-router.js` (origin-biased tier selection + fallback decision), `catalog/recipes/*.json` (T1b data), `catalog/handlers/*.js` (T1a code, 5–10 high-value services); MODIFIED `tool-executor.js` (autopilot branch).
**Implements:** the "two front doors, one engine" + tiering pattern.
**Avoids:** Anti-Pattern 1 (adding to `TOOL_REGISTRY`).
**Invariant watch:** **INV-02** (shared runtime, no parallel autopilot stack); MV3 (data vs bundled-code split).

### Phase 29: Consent governance — per-origin Off/Ask/Auto + origin-pin + recipe integrity + audit log
**Rationale:** Governance must wrap invoke **before** any learning/auto behavior ships; default-off keeps FSB supervised. This is the safety gate the whole "credential-replay" risk hinges on. (PITFALLS P-D; ARCHITECTURE P4; FEATURES P1.)
**Delivers:** `capability-consent.js` (per-origin store, default Off, hydrate-on-load like `fsbChangeReportsEnabled`) + `capability-audit.js` (append-only; origin/slug/method/side-effect/consent/outcome; **no secrets**); recipe **signature verification** (Ed25519/JCS via Lattice receipts) before execute; mutation gating + disambiguation-before-mutate; control-panel UI; consent gate placed **right after `checkOwnershipGate`** in `dispatchMcpToolRoute`. Folds in the **legal-posture + denylist/ToS-respect** disclosure (PITFALLS P-H — low-code, high-leverage).
**Avoids:** Pitfalls 3, 4 (policy half), 6 (disambiguation half).
**Invariant watch:** supervised-safety; auth-local.

### Phase 30: CDP Network discovery → recipe synthesis → learned recipes (T2) in procedural memory + capture-time redaction
**Rationale:** Auto-growth is the highest-novelty layer; it depends on consent (only learn on Ask/Auto origins), the memory schema, and the router (to consume learned recipes). Last of the "build" tranche because it stacks on all prior layers. (ARCHITECTURE P5; PITFALLS P-F; FEATURES P2.)
**Delivers:** `capability-discovery.js` (extend the existing `chrome.debugger.attach({tabId},'1.3')` block with `Network.enable` + `requestWillBeSent`/`responseReceived`/`getResponseBody`; register `onEvent` **synchronously at SW top-level**); recipe synthesis → `createProceduralMemory` promotion (per-origin, **shape not PII**); **redact-before-persist** (tested redactor); feed the `minisearch` index.
**Uses:** existing `debugger`@`1.3` (no manifest change); `lib/memory/*`.
**Avoids:** Pitfall 4 (capture-time leg); persisting PII/bodies (Anti-Pattern 5).
**Invariant watch:** MV3 (no server code); INV-04 (no iterator change); CDP banner UX is a known quantity but capture windows must be minimized.

### Phase 31: Self-healing fallback hardening + recipe-rot detection + re-learn loop + tests/UAT
**Rationale:** Tie recipe-break detection to the existing DOM tools so a broken recipe still completes the task — the flagship differentiator and the catch-all for Wall-2's un-replayable auth classes. Depends on everything. (ARCHITECTURE P6; PITFALLS P-G + Pitfall 7's ambiguity policy; FEATURES self-healing differentiator.)
**Delivers:** typed `RECIPE_EXPIRED`/`RECOVERY_AMBIGUOUS` taxonomy + expected-shape assertions; `capability-router.js` fallback to `executeTool()` (DOM + site guides + `run_task`) that **completes the task then re-learns**; recipe quarantine/demote; mutation-ambiguity policy (no blind retry); schema-lock / parity / consent / provider tests across the 7 providers; UAT (live Chrome-extension UAT user-gated per FSB norm).
**Uses:** existing DOM engine, 17-category site guides, `run_task`.
**Avoids:** Pitfalls 5, 7 (recovery leg).
**Invariant watch:** **INV-03** (provider parity); **INV-01** (schema-lock test green).

### Phase Ordering Rationale

- **Dependencies (all four agents converge):** schema/CI-guard (Wall 1) and the page-context fetch (Wall 2) are the two foundations; search needs invoke to exist; tiering + the autopilot path need one front door proven; consent must precede any auto/learning; discovery needs consent + memory + router to consume what it learns; self-heal needs the full stack. Hence 25→31.
- **Risk-first:** the riskiest unknown (cookie/CORS/CSRF/SameSite of the page fetch) is de-risked in Phase 26 against a hardcoded recipe; the ban-risk (recipe-as-code) is fenced in Phase 25 before any recipe runs.
- **Invariant-respecting throughout:** no phase touches the `agent-loop.js` `setTimeout`-chained iterator (INV-04); the two new MCP tools are additive-only outside `TOOL_REGISTRY` (INV-01); parity is enforced at the runtime layer (INV-02); the cross-provider test gate is Phase 31 (INV-03).
- **Avoids the two hard conflicts:** default-off vs auto-enable, and same-origin vs cross-origin replay — the safe side of both is locked in Phases 25/26/29 and never co-lands with a "make it frictionless" change.
- **Posture, not count:** the sequence matches OpenTabs' *auto-grow mechanism* (Phase 30) and the *resilience* win (Phase 31); it sets **no "match N tools" metric** (the ~2,769 figure is a moving, AI-generated target).

### Research Flags

Phases likely needing a deeper `--research-phase` spike during planning:
- **Phase 25 (recipe schema):** *the highest-risk design artifact in the milestone.* The closed vocabulary must be expressive enough for long-tail REST/GraphQL (URL templating, header allowlist, param mapping, response extraction, pagination?) yet provably non-Turing-complete. Needs a dedicated schema-design + RHC-line spike.
- **Phase 26 (fetch primitive):** spike **capture/replay fidelity for CSRF/ephemeral tokens** (per-session vs per-request nonce, Slack `xoxc`+`xoxd` split, persisted-query hash) and the **`getResponseBody` > ~1 MB** discovery limit — these define the head/tail/DOM-fallback split sizing.
- **Phase 30 (discovery):** spike CDP `Network` capture details (`maxPostDataSize`, `extraInfo` raw-header/cookie events, detach/restore so the existing `Input` emulation isn't disrupted) and the redactor's completeness test.
- **Phase 31 (self-heal):** spike the **failure-detection taxonomy** (which signals → DOM fallback without masking legitimate "no results") and the mutation-ambiguity recovery policy.

Phases with well-documented patterns (lighter research):
- **Phase 27 (MCP surface):** strong in-repo precedents (`vault.ts` out-of-registry registration, `search_memory` progressive disclosure, `jsonSchemaToZod` bridge); `minisearch` is well-documented.
- **Phase 28 (catalog/router) & Phase 29 (consent):** mirror the v0.11.0 `trigger` dual-path + the existing vault confirmation UX + `fsbChangeReportsEnabled` hydration; mostly composition of known patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All integration seams read directly from on-disk FSB source on `automation-worktree`; the three new libs' versions + zero-dep/eval-free status verified against npm + source (2026-06-19); MV3 CSP + RHC line verified against developer.chrome.com; Ajv breakage corroborated by a real bug. |
| Features | HIGH | OpenTabs surface, Claude Code Tool Search mechanics, CSRF/session-replay security, self-healing benchmarks verified against primary/multiple sources. *One contested data point flagged* (Stacklok's adversarial 34% vs Anthropic's 74–88%) — the *pattern* is sound regardless; keep the ranker swappable. Exact live OpenTabs plugin/tool counts are point-in-time. |
| Architecture | HIGH | Every integration point verified against on-disk source (file:line anchors); the execution-context decision is grounded in three already-shipping `world:'MAIN'` seams; phase order is dependency-derived and INV-preserving. |
| Pitfalls | HIGH | Chrome policy, MV3 lifecycle, fetch-origin semantics, auth mechanics all verified against official docs + primary sources. *One MEDIUM:* OpenTabs `github-api.ts` was **not on disk** — its CSRF/persisted-query patterns are reconstructed from GraphQL/Slack/persisted-query primary sources (the *mechanics* are HIGH; the specific file is a proxy). |

**Overall confidence:** HIGH

### Gaps to Address

- **Recipe schema expressiveness vs RHC line** — the central unknown; resolve in the Phase 25 spike (closed enum that still covers the realistic long tail). Hold the bright line: never `eval` a recipe field, never let a recipe carry JS/auth code, never grow server-authored control flow.
- **Capture fidelity for CSRF / ephemeral / signed / persisted-query auth** — determines what is generically replayable vs **must** fall to DOM. Resolve in the Phase 26 spike; it directly sizes the head/tail/DOM split. (Hard boundary per Wall 2: per-request nonces, HMAC/signed params, short-TTL tokens are **not** generically replayable.)
- **`getResponseBody` > ~1 MB returns null / only while buffered** — design discovery around it (call after `loadingFinished`, set `maxPostDataSize`, stash partials); Phase 30.
- **Head/tail split sizing** — which services are bundled imperative handlers (T1a) vs declarative recipes (T1b) follows directly from the two capture/expressiveness spikes above; left to planning, informed by Phases 25/26.
- **Ranker choice** — BM25 + regex (Claude Code's choice via `minisearch`) is the v1 default; keep it replaceable. Don't over-engineer the router in v1.
- **Integration path A vs B** — vendor UMD/IIFE into `extension/lib/` (matches `lz-string` precedent) **or** emit one `capability-runtime.js` IIFE via a new esbuild entry; either keeps every executable byte inside the package (RHC-safe). Decide in Phase 25/26.

## Sources

### Primary (HIGH confidence)
- **FSB on-disk source** (`automation-worktree`, read directly): `extension/ai/tool-executor.js` + `extension/ws/mcp-bridge-client.js` (`world:'MAIN'`+`new Function`/`eval` fetch primitive), `extension/ws/mcp-tool-dispatcher.js` (single chokepoint, ownership gate, route tables, consent-hydration precedent), `extension/ai/tool-definitions.js` (55-tool `TOOL_REGISTRY`), `extension/ai/agent-loop.js` (`getPublicTools`, `setTimeout` iterator INV-04), `mcp/src/runtime.ts` + `mcp/src/tools/{vault,manual,read-only,observability,schema-bridge}.ts` (out-of-registry `server.tool()`, `search_memory` progressive disclosure, `jsonSchemaToZod`), `extension/lib/memory/memory-{schemas,storage}.js` (`createProceduralMemory`, inverted index, `MAX_MEMORIES`), `extension/background.js` (`chrome.debugger.attach(...,'1.3')` Input-only; `importScripts('lib/lz-string.min.js')`), `extension/manifest.json` (`debugger`/`<all_urls>`/`unlimitedStorage`/`scripting`), `esbuild.config.js` (D-17 SW byte-freeze), `extension/config/secure-config.js` (local-only secret pattern), `.planning/PROJECT.md` (v0.9.99 goal + INV-01..04, `run_task` Phase 239 survival, Lattice receipts/ResumePolicy).
- **Chrome for Developers** — Manifest CSP (`script-src 'self' 'wasm-unsafe-eval'`), remote-hosted-code (RHC excludes data/JSON; prohibits "an interpreter to run complex commands fetched as data"), Limited-Use / User-Data (auth cookies = sensitive data; no third-party transfer), SW lifecycle (in-flight `fetch` counts as idle; ~30s idle kill), `chrome.debugger` (un-suppressable banner), CDP Network domain (`getResponseBody` ~1 MB cap, call after `loadingFinished`).
- **Library sources** — `@cfworker/json-schema` README (built for no-`eval` runtimes), `jmespath.js` source (verified eval-free), MiniSearch (zero-dep, SW-safe, field boosting, `loadJSON`/`toJSON`); npm versions verified 2026-06-19.
- **Security/standards** — OWASP CSRF Cheat Sheet + MDN CSRF (per-request vs per-session token replayability), MDN Using Fetch + SameSite (web.dev / PortSwigger), Same-origin / CORS (Wikipedia), GraphQL APQ (Apollo / Crawlee / Doyensec), Slack `xoxc`/`xoxd` mechanics, `hiQ v. LinkedIn` / CFAA analyses.

### Secondary (MEDIUM confidence)
- **Claude Code Tool Search / MCP context-bloat** — lazy schema / `defer_loading` / regex+BM25 / 3–5 tools-per-query / accuracy figures (atcyrus, Software Thug, AgentMarketCap, RAG-MCP).
- **Self-healing benchmarks** — locator-fallback 40–70% vs intent-based 75–90% (Shiplight, Browserless, Browser Harness).
- **Ajv-in-MV3 breakage** — MCP-SuperAssistant #171 / ajv #2527 (corroborates the eval-CSP constraint with a real bug).
- **OpenTabs reference** — repo README + `plugins/` directory (counts point-in-time; `fetchFromPage` / CSRF scrape / persisted-query-hash pattern being matched).

### Tertiary (LOW confidence — flagged for validation)
- **Stacklok "MCP Optimizer" 34%/94% vs Anthropic 74–88%** — adversarial vendor framing; treat the pattern as sound, keep the ranker swappable.
- **OpenTabs `github-api.ts` specifics** — file not on disk; CSRF/persisted-query patterns reconstructed from primary GraphQL/Slack sources (mechanics HIGH, the specific file MEDIUM).

---
*Research completed: 2026-06-19*
*Ready for roadmap: yes*
