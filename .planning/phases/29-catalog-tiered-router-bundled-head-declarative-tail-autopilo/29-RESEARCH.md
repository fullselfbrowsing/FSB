# Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity - Research

**Researched:** 2026-06-21
**Domain:** MV3 capability runtime — origin-biased tiered router + zero-install bundled imperative head + declarative recipe tail + autopilot runtime-parity, on an existing FSB extension/MCP codebase
**Confidence:** HIGH (every source anchor in CONTEXT.md re-verified on branch `automation-worktree` 2026-06-21; the architecture is locked in a spec-grade CONTEXT.md — this RESEARCH consolidates it and fills the three open gaps: Validation Architecture, head-service selection, and the handler-interface / typed-reason / packaging implementation specifics)

> This phase already has a spec-grade `29-CONTEXT.md` (locked decisions D-01..D-12 with line-level anchors) and four project-level research files. This RESEARCH does **not** re-derive the locked architecture. It (1) re-verifies the anchors hold, (2) supplies the **Validation Architecture** (no test plan existed), (3) selects the **5–10 head services** against D-09 with durable per-service API specifics, and (4) pins the **implementation specifics** the planner needs: handler module interface, T2/T3 typed fall-through reason codes, the autopilot hook-point reality, and the handler packaging mechanism.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Router & Catalog modules (CAT-01, CAT-05):**
- **D-01:** Two NEW SW modules — `extension/utils/capability-router.js` (tier selection + origin bias + fall-through) and `extension/utils/capability-catalog.js` (slug → `{tier, handler|recipe, descriptor}` registry). Both **dual-export IIFE shells** (`global.FsbCapabilityRouter` / `global.FsbCapabilityCatalog` + `module.exports`), both **added to `RECIPE_PATH_ALLOWLIST`**, both **eval-free** (Check 4 fails CI closed on any `extension/utils/capability-*.js` missing from the allowlist).
- **D-02:** Router exposes a single SW-global entry — `FsbCapabilityRouter.invoke(slug, args, { origin, tabId })` — returning `{ success:true, …result, tier }` on a structured hit OR the dual-field typed-error shape `{ success:false, code, errorCode, error }` carrying a typed fall-through reason. The typed reason surfaces verbatim to MCP via the `/^RECIPE_.+$/` passthrough — **no `errors.ts` edit**.
- **D-03 (the reroute — additive, INV-01-safe):** `handleCapabilitiesInvokeMessageRoute` is rewired so its current body (`getRecipeBySlug` → `interpretRecipe` → `executeBoundSpec`) **becomes the router's T1b tier**, and the dispatcher handler now calls `FsbCapabilityRouter.invoke(...)`. The route table and wire names (`mcp:capabilities-invoke` / `mcp:capabilities-search`) **do NOT change** — the frozen registry hash and the two-tool surface proof stay green. Tools stay OUTSIDE `TOOL_REGISTRY`.
- **D-04 (catalog ↔ search):** `capability-catalog.js` is the authoritative tier registry keyed by slug. The Phase-28 `capability-search.js` slug→recipe map (`getRecipeBySlug`) remains the T1b recipe source; the catalog references it or the planner extends the search map into the catalog (planner discretion). MiniSearch index still drives `search_capabilities`; the catalog drives `invoke_capability` tier routing.

**Tier scope — REAL vs typed seam (CAT-01, CAT-05):**
- **D-05:** T1a (bundled imperative handlers) and T1b (declarative recipes via `interpretRecipe` → `executeBoundSpec`) ship as REAL working tiers. T1b already works end-to-end today via the routerless path.
- **D-06:** T0 "model-prior public API" is a thin declarative special-case (a recipe with `authStrategy: none` / keyless public call), NOT separate infrastructure.
- **D-07:** T2 (learned recipes) is a no-op/empty-returning stub (real learning = Phase 31). T3 (DOM fallback) is a typed-fall-through SEAM — on no-match/break the router returns a typed reason but does **NOT** call `executeTool()` yet. CAT-05 requires the *seam + reason*, not next-tier execution.

**Bundled head (CAT-02):**
- **D-08:** Head = 5–10 imperative handler modules under a NEW `catalog/handlers/*.js` directory. Each invoked by the router for a slug whose catalog entry is `tier:'T1a'`. A handler = reviewed code shipped in the bundle (may run multi-step / GraphQL-persisted-query / split-token logic the closed declarative schema cannot express); a recipe = pure JSON data bound by the fixed interpreter. Handlers still ultimately call the **same MAIN-world `executeBoundSpec`** (origin-pin holds — D-12).
- **D-09 (criteria, NOT a fixed list):** The planner/research selects the 5–10 services against: (1) high user value + auth-bearing; (2) a stable public/persisted API surface the head can target durably; (3) origin maps cleanly to a single first-party origin (for the pin); (4) GitHub is already proven and seeds the head. Candidate pool noted (GitHub, Gmail, Slack, Notion, Linear, …) but final selection is a planning deliverable.
- **D-10 (handler packaging):** Handlers must ship in the packaged extension. Add an analogous build/copy step to `scripts/package-extension.mjs` (today emits `extension/catalog/recipe-index.generated.js` / `FsbRecipeIndex`) — either a parallel `handler-index.generated.js` or a direct copy + `importScripts`. Without it, the head is absent in a packaged build.

**Autopilot parity (CAT-04, INV-02, INV-04):**
- **D-11:** Autopilot parity is a NEW branch in `extension/ai/tool-executor.js`, mirroring the `trigger` branch, that — for the capability tools — calls the SAME `FsbCapabilityRouter` SW-global the MCP dispatcher calls. NOT reached by adding tools to `TOOL_REGISTRY` (Anti-Pattern 1). One router, loaded once, two thin front doors. Mirror the `buildAutopilotTriggerParams` ownership-strip / `source:'autopilot'` shape.
- **D-12 (INV-04 + origin-pin):** The `agent-loop.js` `setTimeout`-chained iterator stays byte-untouched; invoke remains a single bounded async op. The two-point origin-pin holds on EVERY tier path — T1b through `interpretRecipe` + `executeBoundSpec`; **T1a handlers must also assert the active-tab origin before any side effect**. The router does NOT bypass the pin.

### Claude's Discretion
- Whether `capability-catalog.js` is fully separate or extends `capability-search.js`'s slug→recipe map (one combined module acceptable if it preserves interpreter purity).
- The exact tier-selection signature and the typed fall-through reason codes for the T2/T3 seams — planner names them; **must match `/^RECIPE_.+$/`**.
- The exact handler module interface (function signature; how a handler declares slug/tier/origin/side-effect class) and whether T1a handlers may use `from:'response'` CSRF sourcing (27-D-06, available-if-needed, NOT gating).
- The exact autopilot hook point — recommended a dedicated `tool-executor.js` branch; a pre-switch special-case inside `executeTool()` is acceptable; the `agent-loop.js:2427` call site is discouraged (INV-04 blast radius).
- The handler packaging mechanism (parallel `handler-index.generated.js` vs direct `importScripts`).
- MiniSearch field-boost weights / origin-bias lever reused for router tier biasing.

### Deferred Ideas (OUT OF SCOPE)
- **Real learned recipes (T2)** — CDP capture → synthesis → procedural memory. **Phase 31** (this phase ships T2 as an empty stub).
- **Real self-healing DOM fallback (T3)** — router actually calls `executeTool()` on break, completes, re-learns; recipe-rot detection. **Phase 32** (this phase ships T3 as a typed seam).
- **Consent gate (Off/Ask/Auto) + mutation gating + recipe signature verification + audit log + legal posture.** **Phase 30** (Phase 29 invoke runs ungated; origin-pin still holds).
- **Formal 7-provider parity gate + schema-lock parity test** as a milestone gate. **Phase 32** (INV-03 must not be *broken* here, but the gate ships in 32).
- **`from:'response'` CSRF sourcing** is available to a T1a head handler if a chosen service needs it (27-D-06), NOT gating Phase 29.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CAT-01** | A capability router selects a tier — model-prior public API → bundled handler → declarative recipe → learned recipe → DOM fallback — biased by the tab origin. | Tier order + signature in **Architecture Patterns › Pattern 1 (router)**; origin-bias lever reuses `capability-search.js` `ORIGIN_BOOST` (verified `:55`). The router is a NEW pure SW module; T1b = the lifted routerless body (`mcp-tool-dispatcher.js:2202-2220`, verified). |
| **CAT-02** | 5–10 high-value services ship as bundled imperative handlers (the zero-install head), requiring no install. | **Head-Service Selection** section: 7 concrete services with first-party origin, internal endpoint, auth carrier, side-effect class, and T1a-vs-T1b rationale. `catalog/handlers/` confirmed absent today (must be created). |
| **CAT-03** | Additional services load as declarative recipes (data) executed by the bundled interpreter (the long tail). | T1b reuses the SHIPPING `interpretRecipe`→`executeBoundSpec` primitive verbatim (verified `capability-interpreter.js:236-370`, `capability-fetch.js:272-385`). The one real recipe pair (`github-notifications`) is the data-shape template. |
| **CAT-04** | Autopilot reaches the same capability engine via a `tool-executor` branch — runtime-layer parity, no parallel stack (INV-02). | **Implementation Specifics › Autopilot Parity** — the trigger precedent (`globalThis.fsbTriggerDispatchToolRequest` called by BOTH `mcp-tool-dispatcher.js:1587` and `tool-executor.js:406`, verified) is the exact "two front doors one engine" model; the capability equivalent is `globalThis.FsbCapabilityRouter`. **CRITICAL FINDING below: the branch is a pre-`executeTool` special-case, not an `executeBackgroundTool` switch case, because the tools are out-of-registry.** |
| **CAT-05** | The router returns either a structured result or a typed reason for falling through to the next tier. | **Implementation Specifics › Typed Fall-Through Reason Codes** — proposed `RECIPE_*` codes (all match `/^RECIPE_.+$/`, verified against the passthrough regex `errors.ts:137`). Dual-field shape `{success:false, code, errorCode, error}` cloned from `createRecipeError` (verified `capability-interpreter.js:85`). |
</phase_requirements>

## Summary

The phase is unusually de-risked: Phase 27 shipped the authenticated MAIN-world fetch primitive (`executeBoundSpec`, which performs the second origin-pin and returns a normalized `{success, status, finalUrl, redirected, data, text}` shape), Phase 28 shipped the search index + the routerless invoke path, and the `trigger` family already demonstrates the exact "one SW-global engine, two thin front doors (MCP dispatcher + autopilot `tool-executor.js` branch)" pattern this phase reproduces. **No new infrastructure, no new permissions, no manifest change, no `errors.ts` edit.** The work is: insert a router *inside* the existing dispatcher handler (T1b = the lifted body), add a catalog registry, write 5–10 imperative head handlers that call the same `executeBoundSpec`, add a handler packaging step, and add the autopilot branch.

The three open gaps this RESEARCH fills:

1. **Validation Architecture** — every CAT requirement is provable in CI with no live browser by mocking `executeBoundSpec` / stubbing the SW-global / using an in-memory catalog, following the Phase-28 zero-framework test convention (`check(cond,msg)` + `process.exit`). One property is genuinely live-only (a real authenticated head handler returning logged-in data against a real HttpOnly site) → `human_needed`, matching the Phase 27/28 live-UAT posture.

2. **Head-service selection** — the decisive D-09 nuance: **the origin-pin requires the head handler to target the SAME first-party origin the user's tab is on.** Public documented APIs on a separate origin (`api.github.com`, `api.linear.app`, `oauth.reddit.com`) do NOT carry the tab's session cookies. The head must therefore target each web app's **own internal first-party endpoint** (the OpenTabs `fetchFromPage` model the existing `github-notifications` recipe already uses: `github.com/notifications`, not `api.github.com`). This single fact selects which services qualify and which are T1a (multi-step / split-token / persisted-query) vs T1b (single same-origin GET).

3. **Implementation specifics** — handler interface, typed reason codes, packaging, and the load-bearing autopilot-parity correction (out-of-registry tools cannot use the `executeBackgroundTool` switch).

**Primary recommendation:** Build `capability-router.js` as a thin pure dispatcher (catalog lookup → tier branch → typed fall-through), seat T1b on the verbatim-lifted routerless body, define a one-function handler interface `handle(args, ctx) → Promise<result>` where `ctx = { origin, tabId, executeBoundSpec }`, ship the head as GitHub (seed) + Notion + Slack + Gmail + Linear + GitHub-issues + YouTube/Reddit (read-mostly), package handlers via a `handler-index.generated.js` clone of the recipe-index step, and add the autopilot branch as a **pre-`executeTool` guard** that calls `globalThis.FsbCapabilityRouter.invoke(...)`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tier selection + origin bias + fall-through decision | SW: `capability-router.js` (NEW, pure, eval-free) | — | The router owns ONLY routing logic; it performs no `chrome.*` and no network itself — it delegates to handlers/interpreter. Keeps it allowlist-clean and unit-testable in Node. |
| Slug → `{tier, handler|recipe, descriptor}` registry | SW: `capability-catalog.js` (NEW) | `capability-search.js` slug→recipe map (T1b source) | Authoritative tier keying; references the existing Phase-28 map for T1b recipes (D-04). |
| T1a imperative head logic (multi-step / persisted-query / split-token) | Page MAIN world via `executeBoundSpec` (the authenticated fetch) | SW: `catalog/handlers/*.js` builds the spec | Handler = reviewed bundled CODE that may compose multiple bound specs; the actual credentialed request still runs MAIN-world (origin-pin holds). |
| T1b declarative recipe execution | SW: `interpretRecipe` (validate+bind+STOP) + page MAIN world `executeBoundSpec` | `capability-search.js.getRecipeBySlug` | The verbatim-lifted Phase-27/28 primitive; recipes stay pure data. |
| Origin-pin enforcement (two-point) | `interpretRecipe` (self-consistency, `:338-357`) + `executeBoundSpec` (active-tab, `:291-298`) | T1a handlers MUST also assert active-tab origin before any side effect | The router is NOT a pin bypass (D-12). For T1a the pin is enforced by routing every credentialed call through `executeBoundSpec`, which re-pins. |
| MCP front door | SW dispatcher: `handleCapabilitiesInvokeMessageRoute` (MODIFIED → calls router) | — | Wire names/route table/registry untouched (INV-01). |
| Autopilot front door | SW: `tool-executor.js` pre-`executeTool` capability branch (NEW) → same router global | — | Runtime-layer parity (INV-02); LLM exposure via system-prompt hint, NOT `getPublicTools()` (Anti-Pattern 1). |
| Handler packaging into the zip | Build: `scripts/package-extension.mjs` (MODIFIED) | — | Handlers live under top-level `catalog/`, NOT `extension/` → must be inlined/copied under `extension/` or the head is empty in a packaged build (the 28-D-16 trap). |

## Standard Stack

This phase adds **NO new npm dependencies**. It composes shipping FSB primitives. The "stack" is the set of in-repo modules the new code binds to, all verified present on `automation-worktree` 2026-06-21.

### Core (existing modules the new code calls)
| Module | Role for Phase 29 | Why standard | Provenance |
|--------|-------------------|--------------|------------|
| `extension/utils/capability-fetch.js` → `FsbCapabilityFetch.executeBoundSpec(spec, tabId)` | The authenticated MAIN-world fetch + the second origin-pin; returns `{success, status, finalUrl, redirected, data, text}`. T1a handlers AND T1b both call it. | The shipping, origin-pinned, resume-sidecar-wrapped execution primitive. | [VERIFIED: codebase `capability-fetch.js:272-385`] |
| `extension/utils/capability-interpreter.js` → `FsbCapabilityInterpreter.interpretRecipe(recipe, args)` | T1b binder: validate + bind + STOP (no network). Returns `{success:true, spec}` or a typed `RECIPE_*` dual-field error. | The closed-vocab MV3-safe recipe binder. | [VERIFIED: codebase `capability-interpreter.js:236-370`] |
| `extension/utils/capability-search.js` → `FsbCapabilitySearch.getRecipeBySlug(slug)` | T1b recipe source (slug→recipe map); MiniSearch index unchanged. | Phase-28 catalog source the router's T1b tier reads. | [VERIFIED: codebase `capability-search.js:222-224`] |
| `globalThis.fsbTriggerDispatchToolRequest` (precedent only) | The exact "two front doors, one SW-global engine" template. Defined `background.js:5219`; called by dispatcher `mcp-tool-dispatcher.js:1587` AND autopilot `tool-executor.js:406`. | The proven runtime-parity pattern the capability router mirrors. | [VERIFIED: codebase, grep 2026-06-21] |
| `createRecipeError(code, extra)` shape | The dual-field typed-error shape `{success:false, code, errorCode, error, ...extra}` the router returns for fall-through. | The shape that survives the `/^RECIPE_.+$/` passthrough verbatim. | [VERIFIED: codebase `capability-interpreter.js:85-94`] |

### Supporting (build / guard)
| Module | Role | When | Provenance |
|--------|------|------|------------|
| `scripts/package-extension.mjs` | Clone the `recipe-index.generated.js` step for handlers (D-10). | Packaging. | [VERIFIED: codebase `:41-89`] |
| `scripts/verify-recipe-path-guard.mjs` | Add `capability-router.js` + `capability-catalog.js` to `RECIPE_PATH_ALLOWLIST` (Check 4 reds otherwise). | Both new modules. | [VERIFIED: codebase `:85-103`, `:269-302`; guard currently PASSes with 8 files] |
| `extension/background.js` (`importScripts` block) | Additive load slots for router + catalog after `capability-search.js`. | SW startup. | [VERIFIED: codebase `:119-163`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Router as a separate `capability-router.js` | Fold routing into `capability-catalog.js` (one module) | CONTEXT D-01 names two modules; one combined module is acceptable per Claude's Discretion IF interpreter purity is preserved. Two modules keep the registry (data) and the routing (logic) separable for testing. **Recommend two** — matches the named anchors and the existing one-concern-per-file convention. |
| Handler interface = one `handle(args, ctx)` fn | A class / multi-method handler object | A single async function mirrors the recipe's single bound-spec shape and is trivially Node-unit-testable with a mocked `ctx.executeBoundSpec`. Recommend the function form. |
| Packaging via `handler-index.generated.js` (data-inlined) | Direct `importScripts('catalog/handlers/*.js')` after a copy step | Handlers are CODE, so they can't be JSON-inlined the way recipes are. They must be **copied** under `extension/catalog/handlers/` and either listed in a generated manifest or `importScripts`'d individually. See Implementation Specifics › Packaging. |

**Installation:** No package installs. (The Package Legitimacy Audit below is therefore N/A — see that section.)

## Package Legitimacy Audit

**Not applicable.** Phase 29 installs **zero external packages**. All three new SW modules (`capability-router.js`, `capability-catalog.js`, the `catalog/handlers/*.js` set) are FSB-authored code shipped in the bundle; they import nothing from any registry. The three vendored libs the capability family already uses (`minisearch.min.js`, `jmespath.min.js`, `cfworker-json-schema.min.js`) were vetted and vendored in Phases 25–28 and are unchanged here.

No `npm view` / `pip index` / slopcheck run is required because no dependency is added. The CI guard `verify-recipe-path-guard.mjs` is the relevant supply-chain control for this phase: it fails closed if any new `extension/utils/capability-*.js` is absent from the allowlist or contains `eval`/`new Function`/`import(` — this is the MV3 Wall-1 enforcement, not a registry concern.

## Architecture Patterns

### System Architecture Diagram

```
  MCP CLIENT (Claude/Codex/Cursor)              FSB AUTOPILOT (agent-loop.js)
  invoke_capability(slug, args)                 model emits a capability call
        |                                              | (LLM told the 2 tools
        | WS bridge (data only)                        |  exist via system-prompt
        v                                              |  hint — NOT getPublicTools)
  +--------------------------------------+             v
  | mcp-tool-dispatcher.js               |      +-------------------------------+
  | handleCapabilitiesInvokeMessageRoute |      | tool-executor.js              |
  | (MODIFIED: body -> router call)      |      | PRE-executeTool capability    |
  +-------------------+------------------+      | branch (NEW): strip ownership,|
                      |                         | source:'autopilot', call global|
                      |                         +---------------+---------------+
                      |   FRONT DOOR 1                          |  FRONT DOOR 2
                      v                                         v
              +-----------------------------------------------------------+
              |  globalThis.FsbCapabilityRouter.invoke(slug,args,{origin, |
              |                                            tabId})  (NEW)  |
              |  1. entry = FsbCapabilityCatalog.resolve(slug, origin)    |
              |  2. switch(entry.tier):                                   |
              +----+-----------+-----------+-----------+----------+-------+
                   |T0          |T1a        |T1b        |T2        |T3
                   v            v           v           v         v
            +----------+  +-----------+ +----------+ +--------+ +----------+
            | recipe   |  | catalog/  | | lifted   | | STUB   | | SEAM     |
            | auth:none|  | handlers/ | | router-  | | returns| | returns  |
            | (declar. |  | *.js      | | less body| | empty/ | | typed    |
            |  special-|  | handle(   | | getRecipe| | RECIPE_| | RECIPE_  |
            |  case)   |  |  args,ctx)| | BySlug-> | | LEARN_ | | DOM_     |
            +----+-----+  +-----+-----+ | interpret| | PENDING| | FALLBACK_|
                 |              |       | Recipe-> | | (no-op,| | PENDING  |
                 |              |       | exec...  | | P31)   | | (no exec,|
                 |              |       +----+-----+ +---+----+ |  P32)    |
                 |              |            |           |      +----+-----+
                 +-----+--------+------------+           |           |
                       |  (all real tiers converge)      |           |
                       v                                 |           |
        +-------------------------------------+          |           |
        | FsbCapabilityFetch.executeBoundSpec |          |           |
        | (spec, tabId)                       |          |           |
        |  - SECOND origin-pin (active tab)   |          |           |
        |  - executeScript world:'MAIN'       |          |           |
        |  - returns {success,status,data,..} |          |           |
        +------------------+------------------+          |           |
                           |                             |           |
                           v                             v           v
                  { success:true,            { success:false, code:RECIPE_*, ...}
                    ...result, tier }          (typed fall-through reason)
                           |                             |
                           +-------------+---------------+
                                         |  back to whichever front door
                                         v
                       MCP: mapFSBError (RECIPE_.+ passthrough, verbatim)
                       Autopilot: makeResult({success, hadEffect, error, result})
```

The reader can trace the primary use case (`invoke_capability("github.notifications", {})` on a `github.com` tab) by following: dispatcher → router → catalog resolves `tier:'T1b'` (or `T1a` if promoted to a handler) → `interpretRecipe`/`handle` builds the spec → `executeBoundSpec` re-pins the active tab to `github.com` and issues the credentialed same-origin fetch → normalized result returns with `tier:'T1b'`.

### Recommended Project Structure (NEW in bold)
```
extension/
  utils/
    capability-router.js        # NEW  tier selection + origin bias + typed fall-through (pure, eval-free)
    capability-catalog.js       # NEW  slug -> {tier, handler|recipe, descriptor} registry (pure, eval-free)
    capability-search.js        # UNCHANGED (T1b recipe source via getRecipeBySlug)
    capability-interpreter.js   # UNCHANGED (T1b binder)
    capability-fetch.js         # UNCHANGED (executeBoundSpec — T1a & T1b call it)
  ws/
    mcp-tool-dispatcher.js      # MODIFIED  handleCapabilitiesInvokeMessageRoute -> router (D-03)
  ai/
    tool-executor.js            # MODIFIED  pre-executeTool capability branch (D-11)
    agent-loop.js               # UNTOUCHED iterator (INV-04); +system-prompt hint only (optional)
  background.js                 # MODIFIED  additive importScripts for router + catalog + handler load
catalog/
  recipes/*.json                # T1b data (long tail) — github-notifications.json is the seed
  descriptors/*.json            # search descriptors (intent synonyms etc.)
  handlers/                     # NEW  T1a imperative bundled handlers (the zero-install head)
    github.js                   #   (one module per service, or one per slug — planner choice)
    notion.js
    slack.js
    ...
scripts/
  package-extension.mjs         # MODIFIED  clone recipe-index step -> ship catalog/handlers/ (D-10)
  verify-recipe-path-guard.mjs  # MODIFIED  add capability-router.js + capability-catalog.js to allowlist
tests/
  capability-router.test.js          # NEW  tier order, origin bias, fall-through, typed reasons
  capability-catalog.test.js         # NEW  slug resolution, tier keying (optional, may fold into router test)
  capability-autopilot-parity.test.js# NEW  one-engine-two-front-doors proof
  recipe-path-guard.test.js          # UNCHANGED (re-asserts allowlist after the 2 new modules)
  capability-mcp-surface.test.js     # UNCHANGED — MUST stay green (INV-01 hash + 2-tool wire)
```

### Pattern 1: The router as a thin pure dispatcher (CAT-01, CAT-05)
**What:** `capability-router.js` is a pure SW module — no `chrome.*`, no `fetch`, no `eval`. It looks up the catalog, branches on `entry.tier`, and either delegates to a real tier or returns a typed fall-through reason. It receives `executeBoundSpec` / `interpretRecipe` / `getRecipeBySlug` via typeof-guarded globals (the established pattern), so it remains Node-unit-testable by injecting stubs.
**When to use:** Every `invoke_capability` and every autopilot capability call.
**Example (shape — planner authors the real module):**
```js
// extension/utils/capability-router.js  (dual-export IIFE shell; mirror capability-interpreter.js:374-385)
// Source: composed from VERIFIED anchors capability-fetch.js:272, capability-interpreter.js:236,
//         capability-search.js:222, mcp-tool-dispatcher.js:2202-2220
(function (global) {
  'use strict';

  function _catalog() { return (typeof FsbCapabilityCatalog !== 'undefined') ? FsbCapabilityCatalog : null; }
  function _search()  { return (typeof FsbCapabilitySearch  !== 'undefined') ? FsbCapabilitySearch  : null; }
  function _interp()  { return (typeof FsbCapabilityInterpreter !== 'undefined') ? FsbCapabilityInterpreter : null; }
  function _fetch()   { return (typeof FsbCapabilityFetch   !== 'undefined') ? FsbCapabilityFetch   : null; }

  function _err(code, extra) {                    // clone of createRecipeError (capability-interpreter.js:85)
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) { for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; }
    return out;
  }

  // invoke(slug, args, { origin, tabId }) -> { success:true, ...result, tier } | typed fall-through
  async function invoke(slug, args, ctx) {
    ctx = ctx || {};
    var cat = _catalog();
    var entry = cat && typeof cat.resolve === 'function' ? cat.resolve(slug, ctx.origin) : null;

    // No catalog entry at all -> RECIPE_NOT_FOUND (the Phase-28 contract, unchanged).
    if (!entry) return _err('RECIPE_NOT_FOUND', { slug: slug });

    switch (entry.tier) {
      case 'T1a': {                                // bundled imperative handler
        var handler = entry.handler;               // resolved module (see catalog)
        if (!handler || typeof handler.handle !== 'function') return _err('RECIPE_NOT_FOUND', { slug: slug });
        var r = await handler.handle(args || {}, {
          origin: ctx.origin, tabId: ctx.tabId,
          executeBoundSpec: _fetch() ? _fetch().executeBoundSpec : null,
          interpretRecipe:  _interp() ? _interp().interpretRecipe : null
        });
        if (r && r.success === true) { r.tier = 'T1a'; return r; }
        return r;                                  // handler returns its own typed RECIPE_* on failure
      }
      case 'T0':                                   // no-auth declarative special-case
      case 'T1b': {                                // declarative recipe -> the LIFTED routerless body
        var search = _search(), interp = _interp(), fetchMod = _fetch();
        var recipe = entry.recipe || (search ? search.getRecipeBySlug(slug) : null);
        if (!recipe) return _err('RECIPE_NOT_FOUND', { slug: slug });
        var interpreted = interp.interpretRecipe(recipe, args || {});
        if (!interpreted || interpreted.success !== true) return interpreted; // typed RECIPE_* verbatim
        var out = await fetchMod.executeBoundSpec(interpreted.spec, ctx.tabId);
        if (out && out.success === true) out.tier = (entry.tier === 'T0') ? 'T0' : 'T1b';
        return out;
      }
      case 'T2':                                   // learned recipes — Phase 31 stub
        return _err('RECIPE_LEARN_PENDING', { slug: slug });
      case 'T3':                                   // DOM fallback SEAM — Phase 32 (NO executeTool here)
        return _err('RECIPE_DOM_FALLBACK_PENDING', { slug: slug });
      default:
        return _err('RECIPE_NOT_FOUND', { slug: slug });
    }
  }

  var exportsObj = { invoke: invoke };
  global.FsbCapabilityRouter = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
> This is a **shape**, not a mandate. `[ASSUMED]` for the exact reason-code names and the catalog `resolve` contract — planner finalizes. The tier order, the typed-error shape, the `executeBoundSpec` call, and the lifted T1b body are all `[VERIFIED: codebase]`.

### Pattern 2: Two front doors, one engine (INV-02 without registry bloat)
**What:** The MCP dispatcher handler AND the autopilot `tool-executor.js` branch both call `globalThis.FsbCapabilityRouter.invoke(...)`. This is byte-for-byte how `trigger` already works (one global `fsbTriggerDispatchToolRequest`, two callers). Parity is at the runtime layer; the tools are NOT in `TOOL_REGISTRY`.
**When:** Always — it IS the INV-02 mechanism.
**Anti-Pattern (forbidden):** Adding `search_capabilities`/`invoke_capability` to `TOOL_REGISTRY` to "reach autopilot." That bloats `getPublicTools()` (the LLM tool list, `agent-loop.js:674`, verified) and moves the frozen registry hash, redding `capability-mcp-surface.test.js` + `tool-definitions-parity.test.js`.

### Pattern 3: T1a handler reuses the fetch seam, never re-implements auth (CAT-02)
**What:** A handler builds one or more bound specs and calls `ctx.executeBoundSpec(spec, tabId)` for each credentialed request. It NEVER calls `chrome.scripting.executeScript` itself and NEVER constructs the fetch — that keeps the origin-pin (executed inside `executeBoundSpec`) on the head path and keeps the handler off the eval-sensitive surface. A handler MAY scrape a page-side token first (a `from:'response'` CSRF/`xoxc` read) via a separate read-only bound spec or the interpreter's CSRF source, then place it in the next spec's body/header.
**When:** Every T1a service.

### Anti-Patterns to Avoid
- **Putting the router inside `capability-interpreter.js`** — violates the interpreter's validate+bind+STOP purity charter (no `chrome.*`, no network). The router is a SEPARATE module. [CITED: CONTEXT D-01 / `<specifics>`]
- **A second invoke path alongside the dispatcher path** — the router must be inserted INSIDE the existing handler, not bolted on as a parallel route (that is the "parallel stack" INV-02 forbids). [CITED: CONTEXT `<specifics>`]
- **Executing the T3 DOM fallback here** — return the typed seam reason; live self-healing is Phase 32. [CITED: CONTEXT D-07]
- **Editing the `agent-loop.js` `setTimeout` iterator** (`:2725/2794/2804`) — hook in `tool-executor.js`. [VERIFIED: codebase; INV-04]
- **Targeting a service's public API on a separate origin from a head handler** (e.g. `api.github.com` from a `github.com` tab) — the tab's session cookies do NOT cross to the API subdomain; the call returns logged-out/401. Target the first-party internal endpoint. [VERIFIED: same-origin policy + GitHub/Linear/Reddit API-on-separate-origin confirmed via web search 2026-06-21]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated same-origin fetch + origin-pin | A new fetch wrapper in the router/handler | `FsbCapabilityFetch.executeBoundSpec(spec, tabId)` | It already does the active-tab origin re-pin, the resume-sidecar write, the MAIN-world `executeScript`, and SW-side JMESPath extract. Re-implementing drops the pin (credential-replay risk) and the eviction survival. [VERIFIED: `capability-fetch.js:272-385`] |
| Recipe validation + binding | A param-checker in the router | `FsbCapabilityInterpreter.interpretRecipe(recipe, args)` | Closed-vocab schema gate, `$ref` hardening, endpoint templating, query-fold, first origin-pin — all done, all no-throw. [VERIFIED: `capability-interpreter.js:236-370`] |
| Typed fall-through error shape | A bespoke error object | The `createRecipeError`-shaped `{success:false, code, errorCode, error}` | Only this shape survives the `/^RECIPE_.+$/` passthrough verbatim; the MCP `mapFSBError` and the test both key on it. [VERIFIED: `capability-interpreter.js:85`, `errors.ts:137`, `capability-mcp-surface.test.js:239-274`] |
| Autopilot dual-path wiring | A new dispatch mechanism | Clone the `trigger` branch shape (ownership-strip, `source:'autopilot'`, call the SW-global) | The proven INV-02 pattern; reuse `buildAutopilotTriggerParams` for the ownership strip. [VERIFIED: `tool-executor.js:55-82, 402-423`; `background.js:5219`] |
| Shipping handlers into the package | A new zip arg / manual copy | Clone the `recipe-index.generated.js` build step under `extension/catalog/` | The existing step already solves "top-level `catalog/` is outside `extension/` so the zip misses it." [VERIFIED: `package-extension.mjs:41-89`] |
| Origin biasing in tier resolution | A new ranking system | Reuse `capability-search.js` `ORIGIN_BOOST` / owned-service partition (`:55, :215-218`) | The MiniSearch origin lever already exists and is eval-harness-tuned. [VERIFIED: `capability-search.js:55, 209-219`] |

**Key insight:** Phase 29 is almost entirely *wiring* of Phase-25→28 primitives. The only genuinely new logic is (a) the tier switch and (b) the per-service head handlers' request composition. Everything else is "call the thing that already exists." Any hand-rolled fetch/auth/error-shape in this phase is a regression against shipped, tested infrastructure.

## Runtime State Inventory

This phase is **additive code + one build-step change**, not a rename/refactor/migration. There is no renamed string to chase through datastores or OS-registered state. The closest equivalent — "what existing on-disk/runtime state must change for the new code to take effect" — is captured here for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None.** No collection/key/user_id is renamed. The MiniSearch snapshot (`fsbCapabilityIndex` in `chrome.storage.local`) and the recipe data are unchanged. T2 is a stub (no learned-recipe store written this phase). | None — verified by reading `capability-search.js:54` (STORAGE_KEY unchanged) and D-07 (T2 no-op). |
| Live service config | **None.** No external service (n8n/Datadog/etc.) configuration references the new modules. | None. |
| OS-registered state | **None.** No Task Scheduler / pm2 / launchd entry. | None. |
| Secrets/env vars | **None.** No new secret or env var. (Auth is the user's browser cookies, attached by the browser, never read by FSB.) | None. |
| Build artifacts / installed packages | `extension/catalog/recipe-index.generated.js` is build-generated and git-ignored at dev time; the NEW handler artifact (`handler-index.generated.js` or copied `catalog/handlers/`) will be generated the same way. The `mcp/build/*` and `mcp/ai/tool-definitions.cjs` are rebuilt by `npm --prefix mcp run build` in the test chain — **must stay byte-identical for the registry hash** (the build is deterministic; no tool added). | Regenerate on package; verify INV-01 hash unmoved via `capability-mcp-surface.test.js`. |

**Nothing found in 4 of 5 categories** — verified explicitly above (not left blank).

## Common Pitfalls

### Pitfall 1: The autopilot branch can't be a switch case (the load-bearing implementation trap)
**What goes wrong:** The planner mirrors the `trigger` branch literally and adds a `case 'invoke_capability':` inside `executeBackgroundTool`'s `switch (tool.name)` (`tool-executor.js:222-224`). It never fires.
**Why it happens:** `executeBackgroundTool`'s switch is only reached from `executeTool(name,...)` AFTER `_te_getToolByName(name)` resolves the tool from `TOOL_REGISTRY`. The trigger tools work there because they ARE in `TOOL_REGISTRY` with `_route:'background'` (verified: `tool-definitions.js:1215, 1349, _route:'background' at +22`). The capability tools are **out-of-registry** (INV-01), so `_te_getToolByName('invoke_capability')` returns `null` and `executeTool` returns `{success:false, error:'Unknown tool: invoke_capability'}` (`tool-executor.js:668-673`) before the switch is ever consulted.
**How to avoid:** Add the capability branch as a **pre-`executeTool` special-case** — a guard at the very top of `executeTool()` (before `_te_getToolByName`), or a dedicated function the autopilot dispatch consults before `executeTool`. CONTEXT D-11's "mirror the trigger branch" is about the *shape* (ownership-strip via `buildAutopilotTriggerParams`, `source:'autopilot'`, call `globalThis.FsbCapabilityRouter.invoke`), NOT the literal switch location — and CONTEXT explicitly lists "a pre-switch special-case inside `executeTool()` is acceptable" as Claude's Discretion. **Recommend the pre-`executeTool` guard.**
**Warning signs:** A `case 'invoke_capability'` in `executeBackgroundTool`; an autopilot-parity test that mocks a registry tool; "works from MCP, silently no-ops from autopilot."
[VERIFIED: codebase grep 2026-06-21]

### Pitfall 2: The LLM can't see the capability tools, so the autopilot path is dead unless the model is told
**What goes wrong:** The autopilot branch is correctly wired, but the model never emits a capability call because `getPublicTools()` maps only `TOOL_REGISTRY` (`agent-loop.js:674`, verified) and the two tools aren't in it — so they're absent from the LLM tool list. `buildSystemPrompt` currently has zero `capabilit*` mentions (verified by grep).
**Why it happens:** Anti-Pattern 1 (correctly) keeps the tools out of the registry to protect INV-01, which also keeps them out of the LLM's tool list.
**How to avoid:** Surface the two capability tools to the autopilot model via an **additive system-prompt hint** (a tiny string, NOT 2 tool schemas), exactly as ARCHITECTURE Decision A anticipated ("OPTIONAL: surface via a tiny prompt hint, NOT tool defs"). This is the `agent-loop.js:buildSystemPrompt` additive-string change CONTEXT permits while keeping the iterator untouched. **The planner must decide whether autopilot needs to *originate* capability calls this phase or merely be *capable* of routing them** — if the milestone only requires runtime parity (the branch exists and routes correctly when invoked), a smoke-level prompt hint suffices; full autopilot-originated capability use can be a later refinement. Flag this as an Open Question.
**Warning signs:** Parity test passes (branch routes) but no end-to-end autopilot task ever calls a capability; product expectation mismatch.
[VERIFIED: codebase grep 2026-06-21]

### Pitfall 3: Head handler targets the wrong origin → auth silently absent (credential-replay corollary)
**What goes wrong:** A GitHub head handler calls `https://api.github.com/notifications` (the documented REST API). From a `github.com` tab, `executeBoundSpec` re-pins the active tab to `github.com`, the request origin is `api.github.com` ≠ `github.com` → `RECIPE_ORIGIN_MISMATCH` (or, if the pin were bypassed, a logged-out 401 because the session cookie is scoped to `github.com`, not `api.github.com`).
**Why it happens:** The documented public API lives on a separate origin (`api.github.com`, `api.linear.app`, `oauth.reddit.com` — all confirmed via web search 2026-06-21). The instinct is to use the documented endpoint.
**How to avoid:** Target the web app's **own internal first-party endpoint** — the OpenTabs `fetchFromPage` model the existing `github-notifications` recipe already encodes (`github.com/notifications`, not `api.github.com`). Every head service must be chosen so its data endpoint is same-origin with the page the user is logged into. See Head-Service Selection.
**Warning signs:** A handler/recipe `origin` field that differs from the page the user actually browses; `RECIPE_ORIGIN_MISMATCH` on a "correct" endpoint; 401s only against real sites.
[VERIFIED: same-origin policy; API-origin separation confirmed for GitHub/Linear/Reddit/Slack via web search]

### Pitfall 4: A new `extension/utils/capability-*.js` not added to the allowlist reds CI
**What goes wrong:** The router/catalog modules land but `RECIPE_PATH_ALLOWLIST` isn't updated; Check 4 enumerates `extension/utils/capability-*.js` from disk and fails closed.
**Why it happens:** The allowlist is hardcoded (not a glob) by design; humans must append.
**How to avoid:** Add `'extension/utils/capability-router.js'` and `'extension/utils/capability-catalog.js'` to `RECIPE_PATH_ALLOWLIST` (`verify-recipe-path-guard.mjs:85-103`) IN THE SAME PLAN that creates them, and keep both modules free of `eval`/`new Function`/`import(` even in comments.
**Warning signs:** `verify-recipe-path-guard: FAIL ... exists on disk but is NOT on the recipe-path allowlist`.
[VERIFIED: codebase `:269-302`; guard currently PASSes with 8 files]

### Pitfall 5: Handlers not packaged → empty head in a packaged build (the 28-D-16 trap, again)
**What goes wrong:** `catalog/handlers/*.js` exists in the repo but `package-extension.mjs` only ships `extension/**` + the generated recipe-index; the top-level `catalog/handlers/` is never zipped, so a packaged build resolves zero T1a handlers.
**Why it happens:** `catalog/` is a top-level dir outside `extension/`; the zip is of `EXT_ROOT`.
**How to avoid:** Clone the D-16 step — generate/copy a handler artifact UNDER `extension/catalog/` so the existing zip picks it up. See Implementation Specifics › Packaging.
**Warning signs:** T1a slugs route to `RECIPE_NOT_FOUND` only in a packaged build; works in a dev tree, empty after `package-extension.mjs`.
[VERIFIED: codebase `package-extension.mjs:41-89`; `catalog/handlers/` confirmed absent today]

## Code Examples

### Reroute the dispatcher handler to the router (D-03) — INV-01-safe
```js
// extension/ws/mcp-tool-dispatcher.js  — handleCapabilitiesInvokeMessageRoute (MODIFIED)
// Source: VERIFIED current body at mcp-tool-dispatcher.js:2198-2221; the body BELOW the router
//         call is what moves INTO the router's T1b tier (Pattern 1).
async function handleCapabilitiesInvokeMessageRoute({ payload }) {
  if (typeof FsbCapabilityRouter === 'undefined' || typeof FsbCapabilityRouter.invoke !== 'function') {
    return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT,
      { error: 'Capability router unavailable' });
  }
  // Resolve tabId + owned origin SW-side (the search handler's pattern, :2178-2186).
  let tabId = Number.isFinite(payload.tab_id) ? payload.tab_id : null;
  let origin = payload.origin || null;
  if (tabId === null || origin === null) {
    try {
      const t = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabId === null) tabId = t[0] ? t[0].id : null;
      if (origin === null) origin = (t[0] && t[0].url) ? new URL(t[0].url).origin : null;
    } catch (e) { /* leave null; executeBoundSpec re-pins and rejects a mismatch */ }
  }
  // ONE call. The router owns tier selection + the lifted T1b body + typed fall-through.
  return await FsbCapabilityRouter.invoke(payload.slug, payload.params || {}, { origin, tabId });
}
```

### Autopilot capability branch (D-11) — pre-`executeTool` special-case
```js
// extension/ai/tool-executor.js  — a guard the autopilot dispatch consults BEFORE executeTool's
// _te_getToolByName (because the capability tools are out-of-registry; see Pitfall 1).
// Source: mirrors the trigger branch shape (tool-executor.js:402-423, VERIFIED) but at a different
//         hook point; reuses buildAutopilotTriggerParams (:55-74, VERIFIED).
const CAPABILITY_TOOL_NAMES = new Set(['invoke_capability', 'search_capabilities']);

async function executeCapabilityToolForAutopilot(name, params, tabId) {
  const router = (typeof globalThis !== 'undefined') ? globalThis.FsbCapabilityRouter : null;
  if (!router || typeof router.invoke !== 'function') {
    return makeResult({ success: false, error: 'FsbCapabilityRouter unavailable' });
  }
  const finalParams = buildAutopilotTriggerParams(params, tabId);   // strip agent_id/ownership, add tab_id
  let origin = null;
  try { const t = await chrome.tabs.get(tabId); origin = (t && t.url) ? new URL(t.url).origin : null; }
  catch (_) { /* executeBoundSpec re-pins */ }

  // search vs invoke: invoke routes a slug; search would call FsbCapabilitySearch.search directly.
  const response = (name === 'invoke_capability')
    ? await router.invoke(finalParams.slug, finalParams.params || {}, { origin, tabId, source: 'autopilot' })
    : { success: true, results: (typeof FsbCapabilitySearch !== 'undefined'
          ? FsbCapabilitySearch.search(finalParams.query || '', origin, 5) : []) };

  const success = response && response.success !== false;
  return makeResult({
    success,
    hadEffect: success && name === 'invoke_capability',   // invoke may mutate; search never does
    error: success ? null : (response?.error || response?.errorCode || null),
    result: response
  });
}
// Wire it in: at the TOP of executeTool(name, ...), `if (CAPABILITY_TOOL_NAMES.has(name)) return
// executeCapabilityToolForAutopilot(name, params, tabId);` BEFORE _te_getToolByName.
```
> `[ASSUMED]` for `search_capabilities` being autopilot-reachable — CONTEXT names `invoke_capability` as the capability the autopilot branch must reach; whether search is also surfaced to autopilot is planner discretion. The branch SHAPE and the `globalThis.FsbCapabilityRouter` target are `[VERIFIED/CITED]`.

### A T1a head handler (the interface) — GitHub seed
```js
// catalog/handlers/github.js  (a NEW T1a handler; reviewed CODE shipped in the bundle)
// Source: interface composed from executeBoundSpec contract (capability-fetch.js:272, VERIFIED)
//         and the github-notifications recipe shape (catalog/recipes/github-notifications.json, VERIFIED).
(function (global) {
  'use strict';
  // A handler is a slug-keyed object exposing async handle(args, ctx).
  // ctx = { origin, tabId, executeBoundSpec, interpretRecipe }.
  // It builds bound spec(s) and calls ctx.executeBoundSpec — NEVER chrome.scripting itself,
  // so the origin-pin (inside executeBoundSpec) stays on the head path (D-12).
  const handlers = {
    'github.notifications': {
      tier: 'T1a', origin: 'https://github.com', sideEffectClass: 'read',
      async handle(args, ctx) {
        // Single same-origin GET — this one is simple enough to be a recipe, but shown as the
        // handler interface. A REAL T1a (e.g. github.create_issue via /_graphql persisted query)
        // would compose multiple specs and scrape a CSRF token first.
        const spec = {
          url: 'https://github.com/notifications?query=' + encodeURIComponent(args.query || 'is:unread'),
          method: 'GET', headers: { 'Accept': 'application/json' }, body: null, query: {},
          authStrategy: 'same-origin-cookie', origin: 'https://github.com', extract: '@'
        };
        return await ctx.executeBoundSpec(spec, ctx.tabId);   // re-pins active tab to github.com
      }
    }
  };
  global.FsbHandlerGithub = handlers;
  if (typeof module !== 'undefined' && module.exports) module.exports = handlers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
> `[ASSUMED]` for the exact handler registration global naming and whether one module hosts many slugs vs one — planner finalizes the interface. The `executeBoundSpec` call contract and spec shape are `[VERIFIED: capability-fetch.js + github-notifications.json]`.

## Head-Service Selection (CAT-02, D-09)

**The decisive constraint (D-09 criterion 3 + the origin-pin):** a head handler's request origin MUST equal the first-party origin of the page the user is logged into, because `executeBoundSpec` re-pins the active tab and the session cookie is scoped to that origin. **Public documented APIs on a separate origin do NOT qualify** (`api.github.com`, `api.linear.app`, `oauth.reddit.com` confirmed separate-origin via web search 2026-06-21). The head therefore targets each web app's **own internal first-party endpoint** (OpenTabs `fetchFromPage` model — exactly what the shipping `github-notifications` recipe does).

**T1a vs T1b decision rule:** if the call is a **single same-origin GET/POST the closed declarative schema can already express**, it is a **T1b recipe** (data, no handler). It becomes a **T1a handler** only when it needs **multi-step composition, a GraphQL persisted-query body, or split-token / `from:'response'` CSRF scraping** the schema cannot express (per D-08 / 26-CONTEXT.md:124).

### Proposed head (7 services — within the 5–10 band; GitHub seeds it)

| # | Service / slug seed | First-party origin (pin target) | Internal endpoint the handler targets | Auth carrier | Side-effect | T1a or T1b — why | Provenance |
|---|---------------------|-------------------------------|---------------------------------------|--------------|-------------|------------------|-----------|
| 1 | **GitHub — notifications** (`github.notifications`) | `https://github.com` | `GET /notifications` (already the shipping recipe) | first-party session cookie (HttpOnly), rides same-origin | read | **T1b** — single same-origin GET; already proven. Seeds the head as data. | [VERIFIED: `catalog/recipes/github-notifications.json`] |
| 2 | **GitHub — assigned issues / create issue** (`github.issues.*`) | `https://github.com` | `POST /_graphql` (GitHub's own frontend GraphQL, persisted-query-bearing) for mutations; or `GET /issues` for reads | session cookie + a CSRF token the frontend includes | read / **mutating** | **T1a** — a mutation via the persisted-query `/_graphql` needs a query body + CSRF scrape the recipe schema can't express. | [ASSUMED: GitHub frontend uses same-origin `/_graphql` with persisted queries — pattern confirmed generically via web search; exact path/CSRF header NOT verified, planner must capture against a live tab] |
| 3 | **Slack — list/post message** (`slack.*`) | `https://app.slack.com` | `POST /api/<method>` (e.g. `conversations.list`, `chat.postMessage`) — Slack's own web client API, same-origin | **split token**: `xoxd` HttpOnly cookie (rides same-origin) + `xoxc` token scraped from page and placed in the request body | read / **mutating** | **T1a** — split-token + `xoxc` in the *body* (not a header) + page-scrape is exactly the multi-step/`from:'response'` case the schema cannot express. **Needs `from:'response'` CSRF-style sourcing (27-D-06 carried forward).** | [VERIFIED: xoxc-in-body + xoxd-cookie mechanics via web search 2026-06-21; PITFALLS §Integration Gotchas] |
| 4 | **Notion — list spaces / load page** (`notion.*`) | `https://www.notion.so` | `POST /api/v3/<op>` (e.g. `getSpaces`, `loadCachedPageChunk`) — Notion's own internal API powering its UI | `token_v2` HttpOnly cookie, rides same-origin | read (the head's first slugs) | **T1a** — `/api/v3` is a POST-only RPC where loading a page is a multi-call record-fetch sequence; not a single declarative GET. | [VERIFIED: `/api/v3/loadCachedPageChunk` + `getSpaces` + `token_v2` cookie via web search 2026-06-21] |
| 5 | **Gmail — list threads / labels** (`gmail.*`) | `https://mail.google.com` | Gmail's own first-party internal endpoint (the web UI's data fetch) | first-party Google session cookies (HttpOnly), ride same-origin | read | **T1a** — Gmail's internal feed is a batch/protobuf-ish multi-part response, not a clean single-GET JSON; needs handler-side composition. | [ASSUMED: Gmail internal endpoint shape — NOT verified this session; high user value + auth-bearing + single origin qualifies it, but the planner MUST capture the real endpoint/format against a live tab before authoring. Flag: Google may rate-limit/obfuscate.] |
| 6 | **Linear — my issues** (`linear.*`) | `https://linear.app` | Linear's own frontend GraphQL endpoint (same-origin on `linear.app`, NOT `api.linear.app`) | first-party session cookie, rides same-origin | read | **T1a** — GraphQL query body + the app's own (non-`api.`) origin; the public `api.linear.app` needs a PAT and is a different origin, so the head uses the first-party UI endpoint. | [ASSUMED: `linear.app` serves its UI via a same-origin GraphQL endpoint distinct from `api.linear.app` — `api.linear.app` confirmed separate via web search; the first-party UI endpoint path NOT verified, planner must capture] |
| 7 | **Reddit — unread inbox** (`reddit.inbox`) | `https://www.reddit.com` | `GET /message/unread.json` (legacy same-origin `.json` endpoint) | first-party session cookie, rides same-origin | read | **T1b** — a single same-origin GET returning JSON; the declarative recipe schema expresses it. (Note the origin caveat: API on `oauth.reddit.com` is a *different* origin and is NOT used.) | [VERIFIED: `oauth.reddit.com` vs `www.reddit.com` origin split via web search; `.json` legacy endpoints are a known same-origin pattern — `[ASSUMED]` that `/message/unread.json` is still served, planner verifies] |

**Selection rationale against D-09:** all seven are high-value + auth-bearing (1); each targets a stable first-party internal surface (2 — durability varies: GitHub/Reddit `.json`/REST-ish are most durable, Slack/Notion `/api` are stable-but-undocumented, Gmail/Linear internal feeds are the least durable and most likely to rot → exactly why they're handlers, the rot-tolerant tier, with DOM fallback as the Phase-32 floor); each maps to ONE first-party origin for the pin (3); GitHub seeds it (4).

**Flagged for `from:'response'` CSRF sourcing (27-D-06):** **Slack** (`xoxc` scraped from page → request body) definitively; **GitHub mutations** (CSRF token scraped from the page DOM before a `/_graphql` POST) likely. These are the head services that exercise the carried-forward `from:'response'` capability. Reads (GitHub notifications, Notion getSpaces, Reddit inbox) ride the cookie alone and need no token scrape.

**Recommended minimum viable head (if 5 preferred over 7):** GitHub-notifications (T1b seed) + GitHub-issues (T1a, proves persisted-query) + Slack (T1a, proves split-token/`from:'response'`) + Notion (T1a, proves `/api/v3` multi-call) + Reddit-inbox (T1b, proves a second same-origin recipe). This 5 covers every distinct mechanism class (single-GET recipe, persisted-query handler, split-token handler, RPC-multi-call handler, second recipe) so the architecture is fully exercised; Gmail + Linear can be added once their internal endpoints are captured.

> **All endpoint specifics tagged `[ASSUMED]` above are training/inference-derived and MUST be confirmed by capturing the real request against a live authenticated tab during planning/implementation** (the Phase-26 capture-fidelity spike the SUMMARY flagged). Registry/public-API existence does NOT confer verified status for an *internal* endpoint. The origin-separation facts (which API lives on a separate origin) ARE web-search-verified.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 28 routerless invoke (dispatcher → `getRecipeBySlug`→`interpretRecipe`→`executeBoundSpec` inline) | Router inserted INSIDE the same handler; the inline body becomes T1b | This phase (29) | The wire/registry/route table are byte-identical; only the handler's internals change (INV-01 preserved). |
| Capability tools reachable only via MCP | Reachable via MCP AND autopilot, both hitting one SW-global router | This phase (29) | Runtime-layer parity (INV-02) without registry membership. |
| Head = the one `github-notifications` recipe (data) | Head = 5–10 reviewed imperative handlers (code) for multi-step/split-token/persisted-query services + recipes for the simple tail | This phase (29) | Zero-install head; the code/data split becomes physical (`catalog/handlers/` vs `catalog/recipes/`). |

**Deprecated/outdated:**
- The instinct to use a service's *documented public API* (`api.github.com`, `api.linear.app`) from a head handler — wrong origin for the pin; use the first-party internal endpoint. [VERIFIED this session]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The autopilot branch must be a pre-`executeTool` special-case (out-of-registry tools can't use the `executeBackgroundTool` switch). | Implementation Specifics / Pitfall 1 | LOW — this is VERIFIED by code reading (`_te_getToolByName` returns null → "Unknown tool" before the switch); stated as `[VERIFIED]`, listed here only because the *recommended hook point* among the discretion options is a judgment. If wrong, the branch silently no-ops (caught by the parity test). |
| A2 | GitHub's frontend exposes a same-origin `/_graphql` persisted-query endpoint usable for issue mutations. | Head-Service Selection #2 | MEDIUM — if the path/CSRF differs, the GitHub-issues handler needs a different spec. Mitigation: capture against a live tab before authoring; GitHub-notifications (T1b) still seeds the head regardless. |
| A3 | Gmail and Linear serve their data via a first-party same-origin internal endpoint distinct from any `api.*` origin. | Head-Service Selection #5, #6 | MEDIUM–HIGH — Gmail/Linear internal feeds are the least durable and least-verified. Mitigation: the recommended 5-service MVP head EXCLUDES Gmail/Linear; add them only after capture. DOM fallback (Phase 32) is the floor for rot. |
| A4 | `www.reddit.com/message/unread.json` legacy same-origin JSON endpoint is still served. | Head-Service Selection #7 | LOW — if removed, drop Reddit from the head; the architecture is already proven by the other recipes/handlers. |
| A5 | `search_capabilities` is (optionally) autopilot-reachable. | Code Examples / Autopilot branch | LOW — CONTEXT names `invoke_capability` as the required autopilot reach; search is a nice-to-have. If out of scope, the branch handles `invoke_capability` only. |
| A6 | The exact typed reason-code names (`RECIPE_LEARN_PENDING`, `RECIPE_DOM_FALLBACK_PENDING`). | Implementation Specifics / Typed Reasons | LOW — CONTEXT explicitly delegates naming to the planner; the ONLY hard constraint (`/^RECIPE_.+$/`) is VERIFIED satisfied. |
| A7 | A T1a handler may run multiple `executeBoundSpec` calls within one `invoke` and still honor INV-04 (single bounded async op). | Pattern 3 / handler interface | MEDIUM — INV-04 says invoke is "a single bounded async op" and the iterator is untouched; a handler that awaits several specs sequentially is still one bounded async op from the dispatcher's view (no `setTimeout` chain), but the planner should confirm the SW-eviction window (~30s) covers a multi-call head sequence, reusing the resume-sidecar `executeBoundSpec` already writes per call. |

## Open Questions

1. **Does autopilot need to *originate* capability calls this phase, or only be *capable* of routing them?**
   - What we know: CAT-04/INV-02 require runtime-layer parity (one engine, two front doors). The branch + a system-prompt hint make autopilot capable; full autopilot-originated capability use needs the model to choose them.
   - What's unclear: whether the milestone's definition of "autopilot reaches the same engine" is satisfied by the branch existing and routing correctly (provable via a parity test) vs. requiring an end-to-end autopilot task that calls a capability.
   - Recommendation: ship the branch + a minimal system-prompt hint; gate the requirement on the **parity test** (branch routes to the same router and returns the same result shape as the MCP path), and treat full autopilot-originated capability use as a Phase-32+ refinement. Confirm with the user during plan-check if ambiguous.

2. **One handler module per service or per slug, and what global does it export?**
   - What we know: `catalog/handlers/` is new; the dual-export IIFE convention applies.
   - Recommendation: one module per service exporting a slug-keyed object (`{ 'github.notifications': {...}, 'github.issues.create': {...} }`); the catalog maps slug → `{tier:'T1a', handlerModule, handlerKey}`. Planner finalizes; this is Claude's Discretion.

3. **How does the catalog `resolve(slug, origin)` choose between a T1a handler and a T1b recipe when both could exist for a slug?**
   - What we know: D-04 leaves catalog↔search relationship to planner discretion.
   - Recommendation: the catalog entry's `tier` is authoritative and explicit per slug (no ambiguity at runtime); a slug is EITHER T1a OR T1b, declared in the catalog. Origin bias affects *search ranking*, not tier choice for a known slug.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (test runner) | The zero-framework test chain | ✓ | (repo standard) | — |
| `npm --prefix mcp run build` | Rebuilds `mcp/build/*` + `tool-definitions.cjs` for the INV-01 surface test | ✓ | — | — |
| Chrome/Chromium with the extension loaded | Live-only head-handler smoke (authenticated fetch against a real HttpOnly site) | ✗ in CI | — | `human_needed` live-UAT (Phase 27/28 posture) |

**Missing dependencies with no fallback:** none that block the codeable work — all CAT requirements are CI-provable headless (see Validation Architecture). The single live-only property (a real authenticated head handler returning logged-in data) is `human_needed`, not blocking.
**Missing dependencies with fallback:** the live browser → covered by mocked `executeBoundSpec` in CI + a `human_needed` live smoke.

## Validation Architecture

> nyquist_validation is not disabled in `.planning/config.json` (key absent → enabled). This section is mandatory and drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Zero-framework FSB convention** — `node tests/<name>.test.js`, module-level `passed/failed` counters, `check(cond, msg)`, `process.exit(failed>0?1:0)`. No jest/mocha. (Verified against `capability-mcp-surface.test.js`, `capability-interpreter.test.js`.) |
| Config file | none — tests are plain Node scripts appended to the root `package.json` `scripts.test` chain (verified: chain ends at `capability-mcp-surface.test.js`). |
| Quick run command | `node tests/capability-router.test.js` (the new core test) |
| Full suite command | `npm test` (the long `&&` chain; includes `npm --prefix mcp run build` mid-chain, required before the MCP-surface test) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAT-01 | Router selects the correct tier in T0→T1a→T1b→T2→T3 order, biased by origin | unit | `node tests/capability-router.test.js` | ❌ Wave 0 |
| CAT-01 | Origin bias: a recipe whose origin matches the owned tab outranks/selects over a generic one | unit | `node tests/capability-router.test.js` (inject 2 catalog entries, assert selection) | ❌ Wave 0 |
| CAT-02 | Each head slug routes to its `tier:'T1a'` handler and the handler calls `executeBoundSpec` with the right origin | unit (mocked `executeBoundSpec`) | `node tests/capability-router.test.js` (stub `ctx.executeBoundSpec`, assert spec.origin + call) | ❌ Wave 0 |
| CAT-02 | Origin-pin on the T1a path: a handler whose spec.origin ≠ active tab yields `RECIPE_ORIGIN_MISMATCH` (via the real `executeBoundSpec` pin) | unit (mock `chrome.tabs.get`) | `node tests/capability-router.test.js` reusing the `capability-fetch.test.js` chrome stub | ❌ Wave 0 |
| CAT-03 | A T1b recipe routes through the lifted body (`interpretRecipe`→`executeBoundSpec`) and returns the normalized shape with `tier:'T1b'` | unit (in-memory catalog + mocked fetch) | `node tests/capability-router.test.js` | ❌ Wave 0 |
| CAT-04 | One-engine-two-front-doors: BOTH the dispatcher handler and the autopilot branch call `globalThis.FsbCapabilityRouter.invoke`; same slug+args → identical result shape | unit (spy on the global) | `node tests/capability-autopilot-parity.test.js` | ❌ Wave 0 |
| CAT-04 | The capability tools are NOT in `TOOL_REGISTRY` and `getPublicTools()` does not list them (Anti-Pattern 1 guard) | unit | fold into `tests/capability-autopilot-parity.test.js` (assert registry absence) | ❌ Wave 0 |
| CAT-05 | Unknown slug → `RECIPE_NOT_FOUND`; T2 → `RECIPE_LEARN_PENDING`; T3 → `RECIPE_DOM_FALLBACK_PENDING`; all match `/^RECIPE_.+$/` and surface verbatim through `mapFSBError` | unit | `node tests/capability-router.test.js` + reuse the `mapFSBError` passthrough assertion from `capability-mcp-surface.test.js` | ❌ Wave 0 |
| CAT-05 | T3 seam returns a reason and does NOT call `executeTool()` (no DOM execution this phase) | unit (spy that `executeTool`/`chrome.scripting` is never called on T3) | `node tests/capability-router.test.js` | ❌ Wave 0 |
| INV-01 | The frozen non-trigger registry hash is unchanged after the reroute; 2 tools on the wire | unit | `node tests/capability-mcp-surface.test.js` (EXISTS — must stay green) | ✅ |
| INV-04 | `agent-loop.js` `setTimeout` iterator bytes unchanged | guard | git-diff assertion or a byte-hash check of the iterator region (planner adds a tiny guard test, or relies on review) | ❌ Wave 0 (lightweight) |
| live | A real T1a head handler returns **logged-in** data (not logged-out) from a real HttpOnly site | manual / `human_needed` | live-UAT in a loaded extension (Phase 27/28 posture) | n/a (human) |

### Sampling Rate
- **Per task commit:** `node tests/capability-router.test.js` (the tier/fall-through/origin-pin core) — < 1s, no build needed.
- **Per wave merge:** `node tests/capability-router.test.js && node tests/capability-autopilot-parity.test.js && npm --prefix mcp run build && node tests/capability-mcp-surface.test.js && node scripts/verify-recipe-path-guard.mjs` (adds the INV-01 surface proof + the allowlist guard).
- **Phase gate:** Full `npm test` green (the whole chain) before `/gsd:verify-work`; plus the `human_needed` live smoke recorded (not blocking the headless gate, matching Phase 27/28).

### Wave 0 Gaps
- [ ] `tests/capability-router.test.js` — covers CAT-01, CAT-02, CAT-03, CAT-05 (tier order, origin bias, origin-pin via the existing chrome stub, typed reasons, T3-no-exec). The single highest-value new test.
- [ ] `tests/capability-autopilot-parity.test.js` — covers CAT-04 (both front doors call the same global; result-shape identity; registry absence).
- [ ] (lightweight) INV-04 iterator-byte guard — a few lines asserting the `setTimeout` region is unchanged, OR rely on the existing review discipline + the `tool-definitions-parity` hash (which would NOT catch an iterator edit — so a small guard is the safer choice).
- [ ] Append both new test files to the root `package.json` `scripts.test` chain AFTER `capability-mcp-surface.test.js` (the same place Phase 28 appended its tests).
- Framework install: **none** — zero-framework convention; no install command.

**Why this is genuinely headless-provable:** the router is a pure module; T1b's `interpretRecipe` is pure and already Node-tested; `executeBoundSpec`'s only non-pure step is `chrome.scripting.executeScript`, and `capability-fetch.test.js` already demonstrates the chrome-stub pattern (mock `chrome.tabs.get` for the pin, mock `chrome.scripting.executeScript` to return a canned `{result:{...}}`). The autopilot parity is provable by spying on `globalThis.FsbCapabilityRouter.invoke`. The ONLY thing a headless test cannot prove is that a real site's cookie attaches and returns logged-in data — that is the `human_needed` live smoke, consistent with the Phase 27/28 live-UAT posture.

## Security Domain

> `security_enforcement` is not set to `false` in config (absent → enabled). This phase's security surface is dominated by the credential-replay risk class and the MV3 code/data wall.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirectly) | FSB never reads/holds the credential — the browser attaches the user's first-party cookies on a same-origin MAIN-world fetch (`executeBoundSpec`). The control is "replay the *session*, never the *token*." [VERIFIED: `capability-fetch.js`] |
| V3 Session Management | yes | Origin-pin is the session-confinement control: a request may only target the active tab's origin (two-point pin). The router does NOT bypass it. |
| V4 Access Control | partial (Phase 30 owns the consent gate) | This phase runs UNGATED (consent = Phase 30) BUT the origin-pin holds on every tier path, including T1a handlers — that is the access-control floor for Phase 29. |
| V5 Input Validation | yes | T1b: `interpretRecipe` validates args against the recipe's params sub-schema (cfworker, no-throw) and templates with escaping. T1a: handlers must validate `args` before building specs. [VERIFIED: `capability-interpreter.js:254-292`] |
| V6 Cryptography | no (this phase) | No crypto here; recipe signature verification is Phase 30. Auth secrets are never handled by FSB. |

### Known Threat Patterns for {MV3 capability router + authenticated same-origin replay}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential-replay against a non-consented/cross origin | Elevation of Privilege / Spoofing | **Origin-pin enforced inside `executeBoundSpec` and re-asserted by the interpreter** — request origin must equal the active-tab origin; mismatch → `RECIPE_ORIGIN_MISMATCH`, no side effect. The router routes; it never re-targets. [VERIFIED: `capability-fetch.js:291-298`, `capability-interpreter.js:338-357`] |
| Recipe/handler interpreted as remote code (MV3 Wall 1) | Tampering | Router + catalog are **eval-free** and on `RECIPE_PATH_ALLOWLIST`; Check 4 fails CI closed on any `extension/utils/capability-*.js` with `eval`/`new Function`/`import(`. Handlers are reviewed bundled code (not server-delivered). [VERIFIED: `verify-recipe-path-guard.mjs`] |
| Token/cookie exfiltration (Slack `xoxc`, CSRF) into logs or off-device | Information Disclosure | Auth stays local; the audit log is Phase 30, but THIS phase must not log scraped tokens. T1a handlers that scrape `xoxc`/CSRF must place them only in the bound spec, never in a console/diagnostic line (reuse `redactForLog` discipline). [CITED: PITFALLS §Security Mistakes] |
| SW eviction mid-mutating-call → duplicate POST | Tampering / Denial of Service | `executeBoundSpec` already writes a resume-sidecar snapshot with `method`+`origin` and classifies a mutating in-flight snapshot as `RECOVERY_AMBIGUOUS` (never blind-retry). T1a handlers inherit this per `executeBoundSpec` call. [VERIFIED: `capability-fetch.js:228, 300-315, 388-399`] |
| Autopilot capability call bypassing the pin via a parallel path | Elevation of Privilege | The autopilot branch calls the SAME router → SAME `executeBoundSpec` → SAME pin. No parallel stack (INV-02). [VERIFIED: trigger precedent] |

## Sources

### Primary (HIGH confidence)
- FSB on-disk source, branch `automation-worktree`, re-verified 2026-06-21:
  - `extension/ws/mcp-tool-dispatcher.js` — routerless invoke handler `:2198-2221`, search handler `:2172-2190`, route table `:84-112`, trigger dispatch precedent `:1587`
  - `extension/ai/tool-executor.js` — `executeTool` registry-gated switch `:665-695`, `executeBackgroundTool` `:222`, trigger autopilot branch `:402-423`, `buildAutopilotTriggerParams` `:55-74`, `execute_js` MAIN-world `:382-394`
  - `extension/ai/agent-loop.js` — `getPublicTools` (registry→LLM) `:673-678`, `_executeTool` call site `:2427`, `handleDataTool` wiring `:1351`, (iterator `:2725/2794/2804` untouched)
  - `extension/utils/capability-fetch.js` — `executeBoundSpec` + second origin-pin + result shape `:272-385`, `MUTATING_METHODS` `:228`, `classifyOnWake` `:388-399`
  - `extension/utils/capability-interpreter.js` — `interpretRecipe` `:236-370`, `createRecipeError` dual-field shape `:85-94`, first origin-pin `:338-357`
  - `extension/utils/capability-search.js` — `getRecipeBySlug` `:222-224`, `INDEX_OPTIONS`/`ORIGIN_BOOST` `:48-55`, owned-service partition `:209-219`, dual-export shell `:226-241`
  - `scripts/verify-recipe-path-guard.mjs` — `RECIPE_PATH_ALLOWLIST` `:85-103`, Check 4 disk-drift `:269-302` (guard currently PASS, 8 files)
  - `scripts/package-extension.mjs` — recipe-index build step `:41-89`
  - `extension/background.js` — `importScripts` load order `:119-163`, `fsbTriggerDispatchToolRequest` def `:5219`
  - `catalog/recipes/github-notifications.json` + `catalog/descriptors/github-notifications.json` — the one real recipe+descriptor pair
  - `tests/capability-mcp-surface.test.js` — INV-01 hash + 2-tool wire proof (`EXPECTED_NON_TRIGGER_REGISTRY_HASH` `:58-59`)
  - `extension/ai/tool-definitions.js` — trigger family `_route:'background'` `:1215-1371`; no capability tools present (grep)
  - `mcp/src/errors.ts` — `/^(TRIGGER_.+|RECIPE_.+|...)$/` passthrough `:137`
- `.planning/phases/29-.../29-CONTEXT.md` — locked D-01..D-12 + canonical refs (authoritative scope)
- `.planning/research/{ARCHITECTURE,SUMMARY,FEATURES,PITFALLS}.md` — tier table/routing pseudocode (ARCH Decision C), two-front-doors pattern (ARCH Pattern 2 / Anti-Pattern 1), bundled-head framing (FEATURES), credential-replay + recipe-rot + search-recall (PITFALLS 3/5/6)
- `.planning/{ROADMAP,REQUIREMENTS}.md` — Phase 29 details `:82-89`, CAT-01..05 `:37-41`, INV-01..04 `:17-20`

### Secondary (MEDIUM confidence — web-verified origin/auth facts)
- [GitHub REST API — notifications/issues (api.github.com is a separate origin)](https://docs.github.com/en/rest/activity/notifications)
- [Linear GraphQL — api.linear.app + auth (separate origin from linear.app UI)](https://linear.app/developers/graphql)
- [Slack token formats xoxc (page/body) + xoxd (HttpOnly cookie)](https://shaharia.com/blog/slack-browser-tokens-golang-sdk-bypass-app-creation/) and [retrieving Slack cookies](https://www.papermtn.co.uk/retrieving-and-using-slack-cookies-for-authentication/)
- [Notion internal /api/v3 (loadCachedPageChunk, getSpaces, token_v2 cookie)](https://github.com/kjk/notionapi/blob/master/api_loadCachedPageChunk.go)
- [Reddit oauth.reddit.com vs www.reddit.com origin split](https://github.com/reddit-archive/reddit/wiki/oauth2)

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Internal endpoint *paths/CSRF specifics* for GitHub `/_graphql`, Gmail's feed, Linear's first-party GraphQL, Reddit `/message/unread.json` — inferred from training + the origin-separation facts above; **MUST be captured against a live authenticated tab during planning** (the Phase-26 capture spike). Tagged `[ASSUMED]`.

## Metadata

**Confidence breakdown:**
- Wiring / reroute / autopilot parity / typed reasons / packaging / allowlist: **HIGH** — every anchor re-verified on disk 2026-06-21; the trigger precedent and the lifted T1b body are exact.
- Validation Architecture: **HIGH** — built on the existing zero-framework convention and the demonstrated chrome-stub pattern in `capability-fetch.test.js`; every CAT requirement maps to a concrete headless command.
- Head-service *selection criteria + origin-pin reasoning + T1a/T1b classification*: **HIGH** — driven by the VERIFIED same-origin/origin-separation facts.
- Head-service *exact internal endpoints*: **MEDIUM–LOW** — internal/undocumented; tagged `[ASSUMED]`, must be captured live (this is expected and called out, not a gap in the research).

**Research date:** 2026-06-21
**Valid until:** ~2026-07-21 for the in-repo wiring (stable, anchored to a branch); ~2026-06-28 for the head-service internal endpoints (vendor frontends rot fast — re-capture at implementation time).

## RESEARCH COMPLETE

**Phase:** 29 - Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity
**Confidence:** HIGH (wiring/validation), MEDIUM-LOW (head endpoint specifics, correctly flagged for live capture)

### Key Findings
- **The whole phase is wiring of shipped primitives.** T1b = the verbatim-lifted routerless body; T1a handlers + the router both call the existing origin-pinned `executeBoundSpec`; the autopilot branch reproduces the proven `trigger` "one SW-global, two front doors" pattern (`globalThis.FsbCapabilityRouter`). No new deps, no manifest change, no `errors.ts` edit.
- **Load-bearing implementation correction (CAT-04):** the autopilot capability branch CANNOT be an `executeBackgroundTool` switch case — the capability tools are out-of-registry (INV-01), so `executeTool` returns "Unknown tool" before the switch. It MUST be a **pre-`executeTool` special-case** calling the router global. The model also can't see the tools (`getPublicTools` is registry-only), so a system-prompt hint is needed for autopilot to *originate* calls (flagged as Open Question 1).
- **Head-service decisive constraint (CAT-02):** the origin-pin forces head handlers to target each web app's **own first-party internal endpoint**, NOT its public API on a separate origin (`api.github.com`/`api.linear.app`/`oauth.reddit.com` are all separate-origin, web-verified). Proposed 7-service head (GitHub-notifications T1b seed, GitHub-issues/Slack/Notion/Gmail/Linear T1a, Reddit T1b) with a 5-service MVP that exercises every mechanism class. Slack (`xoxc` in body) and GitHub mutations need `from:'response'` CSRF sourcing (27-D-06).
- **Typed fall-through (CAT-05):** proposed `RECIPE_NOT_FOUND` / `RECIPE_LEARN_PENDING` (T2 stub) / `RECIPE_DOM_FALLBACK_PENDING` (T3 seam, no `executeTool`) — all match `/^RECIPE_.+$/` (verified) and use the `createRecipeError` dual-field shape that surfaces verbatim.
- **Validation is fully headless-provable** (mocked `executeBoundSpec` via the existing chrome-stub pattern; spy on the router global for parity; reuse the `mapFSBError` passthrough assertion); one property is `human_needed` live (real authenticated head fetch), matching Phase 27/28.

### File Created
`.planning/phases/29-catalog-tiered-router-bundled-head-declarative-tail-autopilo/29-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack (in-repo primitives) | HIGH | Every module + line anchor re-verified on disk 2026-06-21 |
| Architecture (router/reroute/autopilot/typed reasons/packaging) | HIGH | Exact precedents (trigger dual-path, lifted T1b body, recipe-index step) verified |
| Validation Architecture | HIGH | Built on the demonstrated zero-framework + chrome-stub conventions; every CAT → concrete command |
| Head-service selection criteria | HIGH | Origin-pin reasoning grounded in web-verified origin-separation facts |
| Head-service exact endpoints | MEDIUM-LOW | Internal/undocumented; tagged ASSUMED; must be captured live at implementation (expected) |

### Open Questions
1. Does autopilot need to *originate* capability calls this phase, or only be *capable* of routing them (parity test vs end-to-end)? — Recommend gating on the parity test + a minimal prompt hint.
2. One handler module per service or per slug, and its export global. — Recommend one module per service, slug-keyed.
3. Catalog `resolve(slug, origin)` tie-break between T1a/T1b. — Recommend explicit per-slug tier (no runtime ambiguity); origin bias affects search ranking only.

### Ready for Planning
Research complete. The planner has: the exact reroute, the handler interface + the autopilot hook-point correction, the typed reason codes, the packaging clone, the head-service list with per-service specifics and a 5-service MVP, and a fully-mapped headless Validation Architecture. The only items requiring live capture (internal endpoint paths) are explicitly flagged with `[ASSUMED]` and a mitigation (capture before authoring; 5-service MVP excludes the least-verified Gmail/Linear).
