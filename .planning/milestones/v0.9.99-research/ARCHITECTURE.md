# Architecture Research: v0.9.99 Native Capability Catalog (Authenticated-API Execution)

**Domain:** Authenticated-API execution capability layer for an MV3 AI browser-automation extension + MCP server (FSB)
**Milestone:** v0.9.99 Native Capability Catalog (FSB API Execution) — subsequent milestone; integrate WITH existing FSB architecture, do not rebuild
**Researched:** 2026-06-19
**Confidence:** HIGH (all integration points verified against on-disk FSB source on branch `automation-worktree`; execution-context decision grounded in the actual `chrome.scripting.executeScript({world:'MAIN'})` seams already shipping in three places)

> Scope note: this is a research/integration map for `gsd-roadmapper`, not an implementation. It identifies REAL FSB files/seams, marks NEW vs MODIFIED, resolves the page-vs-SW-vs-CDP execution-context tradeoff with a recommendation, places the consent gate, and proposes a phase build order that preserves INV-01..04 and MV3 "no remotely hosted code."
>
> Canonical-path note: the sibling `ARCHITECTURE.md` in this directory holds the v0.11.0 Trigger research, which this document **cites as a directly-applicable precedent**. To avoid destroying that cited precedent, this v0.9.99 architecture lives at a milestone-suffixed path, matching the existing `PITFALLS-v0.9.69-TELEMETRY.md` / `PITFALLS-EXCALIDRAW.md` convention already used here.

---

## 0. The Load-Bearing Discovery (read this first)

FSB **already executes authenticated same-origin `fetch()` against real web APIs** — it just does not yet call it a "capability." Three shipping code paths inject arbitrary JS into the **page MAIN world** via `chrome.scripting.executeScript`:

| Path | File:Line | World | Carries user session? |
|------|-----------|-------|------------------------|
| Autopilot `execute_js` | `extension/ai/tool-executor.js:382-394` | `world: 'MAIN'`, `eval(jsCode)` | YES (page context) |
| MCP `execute_js` | `extension/ws/mcp-bridge-client.js:915-937` | `world: 'MAIN'`, `new Function(userCode)` | YES (page context) |
| Canvas interceptor | `extension/manifest.json` content_scripts | `world: 'MAIN'`, `document_start` | n/a (instrumentation) |

When code runs in the page MAIN world, a `fetch('/api/...', {credentials:'include'})` is issued **by the page's own origin**, so the browser attaches the site's cookies — **including HttpOnly cookies** — automatically, and **same-origin requests are not subject to CORS**. FSB never reads the cookies; the browser does the auth. This is byte-for-byte the OpenTabs `fetchFromPage` model cited in the milestone context.

**Architectural consequence:** the v0.9.99 "authenticated fetch primitive" is **not new infrastructure**. It is a *constrained, structured re-use* of the existing MAIN-world injection seam, wrapped by a recipe interpreter and gated by consent. This collapses most of the perceived risk and is the spine of every recommendation below.

---

## 1. Standard Architecture

### System Overview

```
+---------------------------------------------------------------------------+
|  MCP CLIENT (Claude / Codex / Cursor)        |  AUTOPILOT (agent-loop.js)  |
|  -- lean surface: +2 tools                   |  -- same TOOL_REGISTRY      |
|     search_capabilities / invoke_capability  |     (INV-02)                |
+----------------------+---------------------------------+-------------------+
                       | MCP stdio/WS (INV-01 wire)      | in-SW call
                       v                                 v
+---------------------------------------------------------------------------+
|  mcp/src (TS server)  registerCapabilityTools()  [NEW capabilities.ts]     |
|    - search_capabilities  -> bridge 'mcp:capabilities-search' (read-only)  |
|    - invoke_capability     -> bridge 'mcp:capabilities-invoke' (queued)    |
+----------------------+----------------------------------------------------+
                       | WebSocket bridge message (data only -- no secrets)
                       v
+===========================================================================+
|  EXTENSION SERVICE WORKER (background.js)                                  |
|                                                                           |
|  +-----------------------------------------------------------------+      |
|  |  dispatchMcpToolRoute  [MODIFIED]  ws/mcp-tool-dispatcher.js     |      |
|  |    SINGLE CHOKEPOINT: agent identity + tab ownership gate        |      |
|  |    + NEW: per-origin consent gate (Off/Ask/Auto) BEFORE handler  |      |
|  +----------------------------+------------------------------------+      |
|                               v                                           |
|  +-----------------------------------------------------------------+      |
|  |  Capability Runtime  [NEW]  utils/capability-*.js               |      |
|  |   catalog-registry | router | recipe-interpreter | audit-log    |      |
|  |   tiers: model-prior public API -> bundled/server recipe -> DOM |      |
|  +------+---------------------------+----------------------+-------+      |
|         |(invoke)                   |(persist learned)     |(fallback)    |
|         v                           v                      v              |
|  +-------------+   +------------------------+   +------------------------+ |
|  | MAIN-world  |   | Procedural memory      |   | executeTool(...)       | |
|  | fetch via   |   | lib/memory/* [reuse]   |   | tool-executor.js       | |
|  | execute_js  |   | createProceduralMemory |   | (DOM self-heal path)   | |
|  | seam [reuse]|   +------------------------+   +------------------------+ |
|  +------+------+                                                          |
|         |  chrome.scripting.executeScript({world:'MAIN'})                 |
+=========|=================================================================+
          v
   +-------------------------------------------------------------------+
   |  PAGE (MAIN world)  -- carries user's cookies (HttpOnly incl.)    |
   |    fetch(sameOriginApiUrl, {credentials:'include', headers:{csrf}})|
   +-------------------------------------------------------------------+
          ^
          |  CDP Network.* discovery (NEW use of existing `debugger` perm)
   +-------------------------------------------------------------------+
   |  Discovery: chrome.debugger Network domain -> capture real calls  |
   |    (endpoint, method, headers, payload) -> recipe synthesis       |
   +-------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | New / Modified | Anchor file |
|-----------|----------------|----------------|-------------|
| MCP capability tools | Expose `search_capabilities` + `invoke_capability` over the wire; progressive disclosure (search returns slugs, invoke runs one) | **NEW** | `mcp/src/tools/capabilities.ts` |
| Dispatch chokepoint | Identity + ownership gate (existing) **+ consent gate** + route capability messages | **MODIFIED** | `extension/ws/mcp-tool-dispatcher.js` |
| Catalog registry | Hold tiered catalog: bundled handlers (code) + bundled/server recipes (data) + learned recipes (memory) | **NEW** | `extension/utils/capability-catalog.js` |
| Router | Decide tier per request; bias by tab origin; pick recipe vs DOM fallback | **NEW** | `extension/utils/capability-router.js` |
| Recipe interpreter | Execute a DECLARATIVE recipe (data) by templating an authenticated fetch + extraction; no `eval` of server strings | **NEW** | `extension/utils/capability-interpreter.js` |
| Authenticated fetch primitive | Issue same-origin fetch in page MAIN world (re-use the `execute_js` injection seam) | **NEW thin wrapper over REUSED seam** | wraps `tool-executor.js` / `mcp-bridge-client.js:_handleExecuteJS` pattern |
| Discovery capture | Attach CDP `Network` domain to observe real API traffic; emit candidate recipes | **NEW** (new *use* of existing debugger plumbing) | `extension/utils/capability-discovery.js` + `background.js` debugger block (~13811) |
| Learned-recipe store | Persist synthesized recipes as procedural memory, per-origin, auto-grow | **REUSE + extend** | `extension/lib/memory/memory-schemas.js`, `memory-storage.js` |
| Consent + audit | Per-origin Off/Ask/Auto setting; append-only audit log; auth material strictly local | **NEW** | `extension/utils/capability-consent.js`, `capability-audit.js` |
| DOM fallback | When a recipe breaks, complete via existing DOM tools | **REUSE** | `extension/ai/tool-executor.js executeTool()` |
| Shared tool registry | `execute_js` + DOM tools the fallback/interpreter lean on | **UNTOUCHED schemas (INV-01)** | `extension/ai/tool-definitions.js` |

---

## 2. The Three Hard Decisions (resolved)

### Decision A — Where `search_capabilities` + `invoke_capability` wire in (INV-01 / INV-02 safe)

**Recommendation: register the two capability tools OUTSIDE `TOOL_REGISTRY`, following the `vault.ts` precedent — NOT inside the canonical registry.**

Why this is the correct seam, with evidence:

- `TOOL_REGISTRY` (`extension/ai/tool-definitions.js`, 55 tools) is consumed by **both** surfaces: MCP via `registerManualTools` / `registerReadOnlyTools` (which iterate `TOOL_REGISTRY.filter(...)`, `manual.ts:216`, `read-only.ts:100`) **and** autopilot via `getPublicTools()` (`agent-loop.js:674` maps *every* registry entry into the LLM tool list). Anything added to `TOOL_REGISTRY` is auto-exposed in both places — good for parity, but it would bloat the MCP context with catalog surface, which the milestone explicitly forbids.
- The **vault tools already solve exactly this**: `mcp/src/tools/vault.ts:16-19` registers `list_credentials` / `fill_credential` / `list_payment_methods` / `use_payment_method` **directly via `server.tool()`, deliberately not via `TOOL_REGISTRY`**, "to maintain an explicit security boundary." `search_capabilities` / `invoke_capability` get the same treatment for an analogous boundary (auth replay) and to keep the surface lean.
- INV-01 (wire contracts byte-identical for *existing* tools) is preserved because nothing in `TOOL_REGISTRY` changes. The two new tools are *additions*, not modifications, so the schema-lock tests stay green and the `.cjs` mirror is untouched.
- INV-02 (autopilot uses the same registry MCP exposes — "no parallel autopilot-only stack") is satisfied **at the runtime layer, not the tool layer**: both surfaces invoke capabilities through the **same Capability Runtime in the SW**. Autopilot reaches it through `tool-executor.js` (a new `_route: 'background'` branch OR a `dataHandler` case); MCP reaches it through `dispatchMcpToolRoute` -> capability message route. They converge on `capability-router.js` — one engine, two thin front doors. (This mirrors how `trigger` already has an autopilot path in `tool-executor.js:402-423` and an MCP path in the dispatcher route table at `mcp-tool-dispatcher.js:65-68`.)

Concrete wiring:

| Seam | Change | File:Line |
|------|--------|-----------|
| MCP registration | add `registerCapabilityTools(server,bridge,queue,agentScope)` | `mcp/src/runtime.ts:36-43` (add one call) |
| MCP tool defs | `server.tool('search_capabilities', ...)` (read-only, queue-bypass) + `server.tool('invoke_capability', ...)` (queued) | **NEW** `mcp/src/tools/capabilities.ts` |
| Wire message types | `mcp:capabilities-search`, `mcp:capabilities-invoke` added to route tables | `extension/ws/mcp-tool-dispatcher.js:50-116` |
| Read-only bypass | add `search_capabilities` to `readOnlyTools` so discovery never parks the mutation queue | `mcp/src/queue.ts` (the `readOnlyTools` set) |
| Autopilot path | new branch routing `invoke_capability` / `search_capabilities` to the runtime | `extension/ai/tool-executor.js` (`executeBackgroundTool` switch, ~line 402 area) |
| Autopilot LLM exposure | OPTIONAL: if autopilot should *see* the catalog, surface via a tiny prompt hint, NOT 2,769 tool defs | `agent-loop.js buildSystemPrompt` (additive string only) |

**Progressive disclosure is the anti-bloat mechanism:** `search_capabilities(query, origin?)` returns a *short list of capability slugs + one-line descriptions* (data), and `invoke_capability(slug, args)` runs exactly one. The model never sees the full catalog as tool schemas — it sees two tools and queries into them. This is the same "search -> invoke" shape `search_memory` already uses (`observability.ts:84-110`), the read-only data-tool precedent.

### Decision B — WHERE the recipe interpreter + authenticated fetch run (the cookie/CORS/SameSite/HttpOnly resolution)

**Recommendation: the authenticated fetch executes in the PAGE MAIN world (via the existing `execute_js` injection seam); the recipe interpreter logic lives in the SW (background) and *templates* the fetch, then ships the templated call into the page. CDP `Fetch`/`Network` is used for DISCOVERY only, never as the invoke transport.**

This is a three-way comparison; here is the tradeoff resolved against the actual constraint — *which context carries the user's real session for a same-origin API call*:

| Context | Carries site cookies (incl. HttpOnly)? | CORS applies? | SameSite respected? | Verdict for INVOKE |
|---------|----------------------------------------|---------------|----------------------|--------------------|
| **Page MAIN world** (`executeScript({world:'MAIN'})` -> `fetch('/api',{credentials:'include'})`) | **YES** — request originates from the page's own origin; browser attaches cookies incl. HttpOnly automatically; FSB never reads them | **NO** for same-origin (the whole point) | **YES** — first-party context, SameSite=Lax/Strict cookies sent | **WINNER** |
| **Background SW `fetch()`** | Partial/unreliable — SW fetch is an extension-origin request; cookies attach only per host-permission cookie policy, SameSite=Strict/Lax often withheld, and it is a *cross-origin* request to the site so **CORS blocks** most JSON APIs lacking `Access-Control-Allow-Origin: chrome-extension://...` | YES (extension origin is cross-origin to the site) | Frequently NO (third-party context) | Rejected for invoke |
| **CDP `Fetch.fulfillRequest`/`continueRequest`** | Operates on requests the page *already* makes; can read/modify in-flight; synthesizing a brand-new authenticated request via CDP is awkward and forces an attached-debugger banner per call | Bypasses CORS but you must reconstruct headers/cookies manually | Manual | Rejected for invoke; **accepted for discovery** |

**Rationale in prose:** The only context that *reliably* carries the user's authenticated, first-party session for an arbitrary same-origin JSON API — without FSB ever touching the secret cookie — is the page itself. SW `fetch()` is an extension-origin request: it is cross-origin to the target site (CORS preflight failures on credentialed JSON endpoints) and SameSite=Strict/Lax cookies are commonly withheld in that third-party context. The page MAIN world makes the call *as the site*, so cookies (HttpOnly included), CORS exemption (same-origin), and SameSite all "just work" — which is precisely why OpenTabs uses `fetchFromPage` and why FSB's own `execute_js` already does authenticated work today without anyone designing it to.

**Split of concerns:**
- **Interpreter (SW):** validates the recipe, resolves the per-origin consent decision, fills the URL/method/body template from `args`, scrapes/threads the CSRF token (see below), and **constructs a small, fixed, audited fetch snippet**. It does NOT `eval` server-delivered code (MV3 ban). It builds the *call*, not arbitrary logic.
- **Fetch (page MAIN world):** the SW injects the constructed fetch via the `execute_js` seam (`executeScript({world:'MAIN', func, args:[fetchSpec]})`), where `func` is a **fixed, extension-bundled function** that performs `fetch(spec.url, {method, headers, body, credentials:'include'})` and returns the response. The recipe (server data) only supplies *parameters to a bundled function*, never executable strings — this is the MV3-safe code/data split.

**CSRF handling (the OpenTabs detail):** many authenticated POST APIs require a CSRF token that lives in a meta tag, a cookie-readable value, or a prior GET response. The interpreter declares the CSRF source in the recipe as *data* (e.g. `csrf: {from:'meta', selector:'meta[name=csrf-token]', header:'X-CSRF-Token'}`), and a **bundled** extraction step reads it in the page context before the POST. Persisted-query-hash discovery (GraphQL) is handled the same way: the hash is captured during discovery and stored in the recipe as a data field.

**Why not just keep using raw `execute_js`?** Because raw `execute_js` is an *unstructured* escape hatch with no consent gate, no audit, no recipe schema, and the model has to hand-write the fetch every time. The capability layer is the structured, governed, learnable wrapper around the same primitive.

### Decision C — Catalog tiers + routing (model-prior -> recipe -> DOM), and the code/data/memory split

**Recommendation: three tiers, selected by `capability-router.js`, biased by tab origin, with a hard MV3 rule that *only* bundled handlers contain code and *all* server/learned recipes are pure data interpreted by a fixed bundled interpreter.**

| Tier | What it is | Storage | Code or Data? | When chosen |
|------|------------|---------|---------------|-------------|
| **T0 model-prior public APIs** | The model already knows the shape of well-known public/documented APIs (GitHub REST, etc.); interpreter templates a call from the model's argument | none (model knowledge) + thin validation | Data (args -> bundled fetch fn) | Public, well-known, low-risk endpoints; fastest path |
| **T1a bundled handlers** | Imperative handlers compiled INTO the extension for the hard/popular "head" (tricky auth, multi-step, GraphQL persisted queries) | shipped in extension bundle | **Code (allowed — ships in the extension, not from server)** | Popular services where a declarative recipe is insufficient |
| **T1b bundled/server recipes** | DECLARATIVE recipe objects (endpoint, method, header map, CSRF source, extraction path) for the easy long tail | bundled JSON + server-delivered JSON (data) | **Data only (MV3-safe)** | Long-tail services; streamed from FSB server as data |
| **T2 learned recipes** | Recipes synthesized from CDP discovery on this user's real traffic, promoted to procedural memory | `chrome.storage.local` via `lib/memory/*` | Data only | Per-origin, auto-grown; user-specific endpoints |
| **T3 DOM fallback** | Existing DOM automation completes the task when no recipe works or a recipe breaks | n/a | Code (existing tools) | Self-healing fallback (always available) |

**Routing decision (in `capability-router.js`):**
```
on invoke_capability(slug, args) at origin O:
  consent = consentForOrigin(O)            # Off -> hard refuse (DOM-only)
  if consent == Off: return route(DOM_FALLBACK)
  recipe = catalog.resolve(slug, O)        # learned(O) > bundled-handler > bundled/server-recipe > model-prior
  prefer recipe whose declared origin matches O  # tab-origin bias
  try interpreter.run(recipe, args, O)     # page MAIN-world fetch
  on break/empty/4xx-5xx-shape-mismatch:
      record recipe health--               # drives re-discovery
      return route(DOM_FALLBACK)           # self-heal: finish via DOM tools
```

**Tab-origin bias:** resolution is scoped by the active tab's origin (the router has it from the ownership-gated tab). A learned recipe for `O` outranks a generic bundled recipe; a recipe whose `origin` field does not match `O` is only used if it is explicitly cross-origin-safe (public API). This keeps invocation first-party and consent-scoped.

**The MV3 invariant, stated precisely:** *No remotely hosted code.* The FSB server delivers **recipe DATA** (JSON describing endpoints/headers/extraction), which a **fixed, bundled interpreter** consumes. The server never delivers a function body, and the interpreter never `eval`/`new Function`s server-supplied strings. T1a bundled handlers are the *only* place imperative capability code lives, and it is compiled into the extension at build time (reviewed, shipped through the Web Store) — fully MV3-compliant. This is the same posture as the existing `site-guides/` (data) + content-script tools (code) split.

---

## 3. Recommended Project Structure (NEW files in bold)

```
extension/
  ai/
    tool-definitions.js        # UNTOUCHED schemas (INV-01); execute_js seam reused
    tool-executor.js           # MODIFIED: +invoke_capability/search_capabilities branch
    agent-loop.js              # UNTOUCHED iterator (INV-04); optional prompt hint only
  ws/
    mcp-tool-dispatcher.js     # MODIFIED: +consent gate, +capability message routes
    mcp-bridge-client.js       # MODIFIED: route mcp:capabilities-* (reuse _handleExecuteJS pattern)
  utils/
    **capability-catalog.js**      # tiered catalog registry (T0/T1a/T1b/T2)
    **capability-router.js**       # tier selection + origin bias + fallback decision
    **capability-interpreter.js**  # declarative-recipe -> templated authenticated fetch (SW side)
    **capability-fetch.js**        # the FIXED bundled page-MAIN-world fetch fn + CSRF/extract helpers
    **capability-discovery.js**    # CDP Network capture -> candidate recipe synthesis
    **capability-consent.js**      # per-origin Off/Ask/Auto store + Ask prompt plumbing
    **capability-audit.js**        # append-only audit log (origin, slug, time, outcome; NO secrets)
  lib/memory/
    memory-schemas.js          # REUSE createProceduralMemory; +recipe typeData fields
    memory-storage.js          # REUSE persist/retrieve, per-origin
  catalog/                     # **NEW** bundled data
    **recipes/*.json**             # T1b declarative recipes (data, MV3-safe)
    **handlers/*.js**              # T1a imperative bundled handlers (code, shipped in bundle)
  background.js                # MODIFIED: wire runtime at startup; extend debugger block for Network
mcp/src/
  tools/
    **capabilities.ts**            # registerCapabilityTools: search_capabilities + invoke_capability
  runtime.ts                   # MODIFIED: +registerCapabilityTools(...)
  queue.ts                     # MODIFIED: search_capabilities in readOnlyTools bypass
  ai/
    tool-definitions.cjs       # MODIFIED only if defs added to registry (recommend: NOT — stay out)
```

### Structure Rationale

- **`utils/capability-*.js`:** mirrors the v0.11.0 `trigger` precedent (`utils/trigger-store.js`, `trigger-manager.js`, `trigger-lifecycle.js`) — new source files composing existing primitives, one concern per file, SW-loadable via `importScripts`.
- **`catalog/recipes/` (data) vs `catalog/handlers/` (code):** physically separates the MV3-safe declarative tier from the bundled-code tier so review and the build pipeline can treat them differently (recipes are also what the server streams).
- **Memory reuse, not a new store:** learned recipes are procedural memory; `createProceduralMemory` already has `steps`/`selectors`/`timings`/`successRate`/`targetUrl` (`memory-schemas.js:91-103`) — extend `typeData` with `{endpoint, method, headerMap, csrfSource, extractPath, origin}` rather than inventing a parallel store (mirrors the milestone's "learned recipes via memory" goal).
- **`capabilities.ts` outside `TOOL_REGISTRY`:** the vault-tool security-boundary precedent; keeps the lean MCP surface.

---

## 4. Architectural Patterns

### Pattern 1: Structured re-use of the MAIN-world `execute_js` seam (do not reinvent the fetch primitive)

**What:** The authenticated fetch is a *fixed, bundled function* injected via `executeScript({world:'MAIN', func, args:[spec]})`, where `spec` is recipe-derived data.
**When:** Every T0/T1b/T2 invoke (declarative path).
**Trade-offs:** + carries real session (HttpOnly/SameSite/CORS all correct) + reuses a battle-tested seam + MV3-safe (no server code). − bound to the *active tab's* origin (cross-origin capability needs a tab on that origin or a public API); − page CSP can constrain `fetch` in rare cases (fallback to DOM).

**Example (shape, not implementation):**
```js
// SW: interpreter builds spec (data); injects a FIXED func
const spec = interpreter.template(recipe, args, origin); // {url, method, headers, body, csrf}
const [{result}] = await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: capabilityFetchInPage,   // bundled, reviewed, NOT from server
  args: [spec]
});
// capabilityFetchInPage(spec): reads CSRF from DOM if declared, then
//   return fetch(spec.url, {method, headers, body, credentials:'include'}).then(r=>r.json())
```

### Pattern 2: Two front doors, one engine (INV-02 without registry bloat)

**What:** MCP (`invoke_capability` -> `mcp:capabilities-invoke`) and autopilot (`tool-executor.js` branch) both call `capability-router.js`.
**When:** Always — parity is enforced at the runtime, not by sharing a tool schema.
**Trade-offs:** + lean MCP surface + true parity (same engine, same results, same consent/audit) + matches the existing `trigger` dual-path precedent. − one extra indirection vs putting it in `TOOL_REGISTRY` (accepted, because registry membership = forced dual exposure + context bloat).

### Pattern 3: Discovery -> synthesis -> persist as procedural memory (auto-growing catalog)

**What:** Attach CDP `Network` to a tab (reusing the `chrome.debugger.attach({tabId},'1.3')` plumbing already at `background.js:~13811`), observe `Network.requestWillBeSent` / `responseReceived` / `getResponseBody`, synthesize a candidate recipe, and promote successful ones via `createProceduralMemory`.
**When:** Opt-in learning on origins the user has set to Ask/Auto; or after a successful DOM completion that the system recognizes could have been an API call.
**Trade-offs:** + grows the catalog from the user's real, authenticated traffic + no server round-trip + per-origin. − CDP attach shows the "DevTools is debugging this tab" banner (already true for FSB's CDP input tools, so not a new UX cost); − must redact/avoid persisting response bodies containing PII (store *shape*, not data).

**Example (capture shape):**
```
debugger.attach -> Network.enable
on requestWillBeSent(req):  if req.url ~ /api|graphql/ and method in {GET,POST}: stash {url,method,headers,postData}
on responseReceived(res):   stash {status, mimeType}
on loadingFinished:         synthesize recipe candidate {endpoint, method, headerMap(safe), csrfSource?, extractPath?}
-> capability-discovery.proposeRecipe(candidate, origin)  # human/auto promote to memory
```

### Pattern 4: Consent gate co-located with the ownership gate (single chokepoint)

**What:** `dispatchMcpToolRoute` already runs `checkOwnershipGate(...)` synchronously before the handler (`mcp-tool-dispatcher.js:406-407`). Add a `checkCapabilityConsentGate({tool, origin})` immediately after it, *before* `route.handler(...)`.
**When:** Only for `invoke_capability` (and discovery promotion); all other tools pass through unchanged (INV-01 untouched).
**Trade-offs:** + one audited choke for both identity and consent + Off can hard-refuse before any side effect + per-origin decision is resolvable from the gate's tab context. − must keep the gate synchronous/cheap (Off/Ask/Auto is a `chrome.storage.local` map read, hydrate-on-load like `fsbChangeReportsEnabled` at `mcp-tool-dispatcher.js:14-37`).

---

## 5. Data Flow

### Invoke flow (the happy path)

```
MCP client: invoke_capability("github.create_issue", {repo, title})
  -> mcp/src/tools/capabilities.ts (queue.enqueue; bridge 'mcp:capabilities-invoke')
  -> WS bridge (data only; NO cookies/CSRF on the wire)
  -> dispatchMcpToolRoute  [ownership gate]  [NEW consent gate: Off? Ask? Auto?]
  -> capability-router.resolve(slug, origin)   # learned(O) > handler > recipe > model-prior
  -> capability-interpreter.template(recipe, args, origin)   # build fetch spec (SW)
  -> chrome.scripting.executeScript({world:'MAIN', func: capabilityFetchInPage, args:[spec]})
       PAGE: read CSRF (if declared) -> fetch(url,{credentials:'include'}) -> json
  -> response normalized -> capability-audit.append({origin, slug, ok, ts})   # NO secrets
  -> mapFSBError -> MCP client
       (on break: router -> DOM fallback via executeTool(...), still completes)
```

### Discovery -> learn flow

```
user (Auto/Ask origin) does authenticated work
  -> capability-discovery attaches CDP Network -> captures real call
  -> synthesize candidate recipe (endpoint/method/headers/csrf/extract) -- store SHAPE not PII
  -> promote: lib/memory/memory-storage persist createProceduralMemory(typeData=recipe)
  -> next invoke at that origin: router finds learned recipe first (catalog auto-grew)
```

### State / consent

```
chrome.storage.local:
  fsbCapabilityConsent : { [origin]: 'off' | 'ask' | 'auto' }   # per-origin gate
  fsb_memories         : [...procedural recipe memories...]      # learned catalog (existing key)
  fsbCapabilityAudit   : append-only ring (origin, slug, outcome, ts; NO auth material)
extension bundle (read-only):
  catalog/recipes/*.json (data)  +  catalog/handlers/*.js (code)
FSB server (data only):
  GET /capabilities/recipes?origin=... -> declarative recipe JSON (interpreted locally; never eval'd)
```

---

## 6. Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 1 origin / handful of recipes | Bundled recipes + model-prior only; discovery off by default; consent default Off (supervised). Nothing to tune. |
| Dozens of origins / learned recipes growing | Procedural-memory cap (`MAX_MEMORIES=500`, `memory-schemas.js:23`) starts to bind — add per-origin recipe cap + LRU by `successRate`/`lastSuccessAt`; memory consolidation (`memory-consolidator.js`) already exists to prune. |
| Long-tail catalog streamed from server | Cache server recipes in `chrome.storage.local` with an ETag/version; never block invoke on a network fetch (fall back to bundled/model-prior if the server is slow/down). Server stays *data-only* (MV3). |

### Scaling priorities

1. **First bottleneck — procedural-memory size.** Learned recipes share the 500-memory / 8MB budget with all other memories. Mitigation: store recipe *shape* (no response bodies), per-origin LRU, lean on existing consolidation.
2. **Second bottleneck — MCP context budget.** If `search_capabilities` returns too many slugs, the model context bloats. Mitigation: cap results, rank by origin-match + `successRate`, paginate. (This is *why* progressive disclosure exists.)

---

## 7. Anti-Patterns

### Anti-Pattern 1: Adding `search_capabilities`/`invoke_capability` to `TOOL_REGISTRY`
**What people do:** put the new tools in the canonical registry "for parity."
**Why it's wrong:** registry membership forces exposure in *both* `getPublicTools()` (autopilot LLM list, `agent-loop.js:674`) and every MCP registration filter (`manual.ts`/`read-only.ts`), and risks touching the `.cjs` mirror + schema-lock tests (INV-01 surface). It also conflates the lean *capability* surface with the 55 *primitive* tools.
**Do this instead:** register via `server.tool()` in a dedicated `capabilities.ts` (vault-tool precedent, `vault.ts:16`), and achieve parity at the **runtime** layer (shared `capability-router.js`), not the tool layer.

### Anti-Pattern 2: Running the authenticated invoke from the background SW `fetch()`
**What people do:** `fetch(siteApi, {credentials:'include'})` from `background.js`.
**Why it's wrong:** the SW request is **extension-origin** = cross-origin to the site -> CORS preflight failures on credentialed JSON, and SameSite=Strict/Lax cookies withheld in the third-party context. It silently fails or returns 401/403 on exactly the authenticated endpoints the feature targets.
**Do this instead:** issue the fetch in the **page MAIN world** via the `execute_js` seam (Decision B). Same-origin, first-party, cookies (HttpOnly) attached by the browser.

### Anti-Pattern 3: Interpreting server recipes by `eval`/`new Function` on server-supplied strings
**What people do:** ship "recipes" that are JS snippets and `eval` them for flexibility.
**Why it's wrong:** that is **remotely hosted code** — a hard MV3 violation and Web Store rejection. (Note FSB's own `execute_js` uses `eval`/`new Function`, but on **user/model-supplied** code at runtime, not server-delivered code — a different trust class.)
**Do this instead:** recipes are **pure data** (endpoint/method/header-map/CSRF-source/extract-path) consumed by a **fixed bundled interpreter**; only T1a *bundled* handlers contain code, compiled into the extension.

### Anti-Pattern 4: Bypassing the dispatch chokepoint for "speed"
**What people do:** call the capability runtime directly from a new bridge handler that skips `dispatchMcpToolRoute`.
**Why it's wrong:** it bypasses the identity + ownership gate *and* the new consent gate, breaking the single-chokepoint guarantee and the supervised-safety posture.
**Do this instead:** route `mcp:capabilities-invoke` through `dispatchMcpToolRoute` so ownership + consent + audit all fire in one place (mirrors how every other MCP tool routes).

### Anti-Pattern 5: Persisting response bodies / auth material into memory or the audit log
**What people do:** store the full API response (with PII) as the "learned recipe," or log the cookie/CSRF for "debuggability."
**Why it's wrong:** violates "auth material strictly local / never persisted" and leaks PII into `chrome.storage`.
**Do this instead:** store recipe *shape* only; the audit log records `{origin, slug, outcome, timestamp}` and never secrets (mirror the vault rule "raw secrets never traverse the bridge," `vault.ts:18`, and the `redactForLog` precedent).

---

## 8. Integration Points

### External services

| Service | Integration pattern | Notes / gotchas |
|---------|---------------------|------------------|
| Target site's web API | Page MAIN-world same-origin `fetch({credentials:'include'})` via `execute_js` seam | Carries HttpOnly cookies; no CORS same-origin; needs a tab on that origin (or a public/CORS-enabled API for cross-origin) |
| FSB server (recipe delivery) | `GET` declarative recipe JSON (DATA only); cached locally with version/ETag | MV3: data only, interpreted locally, never `eval`'d; invoke must not block on it |
| CDP Network (discovery) | `chrome.debugger.attach({tabId},'1.3')` + `Network.enable` (extend existing debugger block) | Shows DevTools banner (already true for FSB CDP input tools); redact bodies |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP server <-> SW | WebSocket bridge messages `mcp:capabilities-search/invoke` (data only) | INV-01: existing tool wires untouched; these are *new* message types |
| Dispatcher <-> runtime | in-SW function call after ownership+consent gate | single chokepoint preserved (`dispatchMcpToolRoute`) |
| Autopilot <-> runtime | `tool-executor.js` branch -> `capability-router.js` | INV-02 parity at runtime; iterator untouched (INV-04) |
| Runtime <-> page | `chrome.scripting.executeScript({world:'MAIN'})` with a fixed bundled func + data spec | the authenticated fetch boundary; MV3-safe |
| Runtime <-> memory | `lib/memory/*` `createProceduralMemory` / persist / retrieve, per-origin | learned-recipe store reuse (no new store) |
| Runtime <-> consent/audit | `chrome.storage.local` maps, hydrate-on-load + `onChanged` | mirror `fsbChangeReportsEnabled` hydration pattern |

---

## 9. Suggested Phase Build Order (dependency-respecting; INV-01..04 + MV3 honored)

> Ordering principle: prove the authenticated-fetch seam and the *invoke* path against a single hardcoded recipe FIRST (highest technical risk: cookies/CORS/CSRF), THEN layer catalog tiers, THEN discovery/learning, THEN governance polish. Each phase is independently shippable and keeps the existing surface green.

| # | Phase | Why this order / dependencies | Touches (NEW / MODIFIED) | Invariant watch |
|---|-------|-------------------------------|--------------------------|-----------------|
| **P1** | **Authenticated fetch primitive (page MAIN-world) + interpreter skeleton** | De-risk Decision B first: prove a same-origin credentialed `fetch` (incl. CSRF) works through the `execute_js` seam against ONE hardcoded recipe. Everything else depends on this working. | NEW `capability-fetch.js`, `capability-interpreter.js` (minimal); REUSE `execute_js` injection | MV3 (fixed bundled func, no server code) |
| **P2** | **MCP `search_capabilities` + `invoke_capability` (outside TOOL_REGISTRY) + dispatcher routes** | Once invoke works internally, expose the lean wire surface and wire it through the single chokepoint. Depends on P1. | NEW `mcp/src/tools/capabilities.ts`; MOD `runtime.ts`, `queue.ts`, `mcp-tool-dispatcher.js`, `mcp-bridge-client.js` | INV-01 (existing wires untouched; new types only), lean surface |
| **P3** | **Catalog registry + router + tiers (T0 model-prior, T1a bundled handlers, T1b bundled recipes) + autopilot path** | With one front door proven, add tiering + the autopilot branch so both surfaces share the engine. Depends on P1/P2. | NEW `capability-catalog.js`, `capability-router.js`, `catalog/recipes/*.json`, `catalog/handlers/*.js`; MOD `tool-executor.js` | INV-02 (shared runtime, no parallel stack), MV3 (data vs bundled-code split) |
| **P4** | **Consent gate (per-origin Off/Ask/Auto) + audit log, in the dispatch path** | Governance must wrap invoke before any learning/auto behavior ships; default-off keeps FSB supervised. Depends on P2 (gate location) and P3 (something to gate). | NEW `capability-consent.js`, `capability-audit.js`; MOD `mcp-tool-dispatcher.js` (gate after ownership), control-panel UI | supervised-safety, auth-local (no secrets persisted) |
| **P5** | **CDP Network discovery -> recipe synthesis -> persist as procedural memory (learned tier T2)** | Auto-growth is the highest-novelty; depends on consent (only learn on Ask/Auto origins) + memory schema + router (to consume learned recipes). Last because it builds on all prior layers. | NEW `capability-discovery.js`; MOD `background.js` debugger block (+Network), `memory-schemas.js` (recipe typeData), `memory-storage.js` | MV3 (no server code), redact PII, INV-04 (no iterator change) |
| **P6** | **Self-healing fallback hardening + DOM-completion bridge + tests/UAT** | Tie recipe-break detection to the existing DOM tools so a broken recipe still completes the task; add schema-lock/parity/consent tests across providers. Depends on everything. | MOD `capability-router.js` (fallback), REUSE `tool-executor.js executeTool`; tests across 7 providers | INV-03 (provider parity), INV-01 (schema-lock test green) |

**Why not discovery-first?** Discovery (P5) is tempting but useless until invoke (P1) and routing (P3) exist to *consume* a learned recipe, and dangerous until consent (P4) gates it. The riskiest unknown is the cookie/CORS/CSRF behavior of the page-context fetch — that must be P1.

**MV3-survivability across the build:** none of these phases touch the `agent-loop.js` `setTimeout`-chained iterator (INV-04, lines 2725/2794/2804). Invoke is a single bounded async op (like `execute_js` today). If a *long* multi-call capability is ever needed, host the loop in `background.js` driven by `chrome.alarms` (the v0.11.0 trigger precedent) — never in the SW with a naked closure, and never block the MCP `TaskQueue` slot.

---

## Sources

- FSB on-disk source (authoritative for all integration seams, verified 2026-06-19 on `automation-worktree`):
  - `extension/ws/mcp-tool-dispatcher.js` — `dispatchMcpToolRoute` single chokepoint, ownership gate (lines 394-460), route tables (50-116), consent-hydration precedent (14-37)
  - `extension/ai/tool-executor.js` — `executeTool` `_route` dispatch (665-695), `execute_js` MAIN-world (374-400)
  - `extension/ws/mcp-bridge-client.js` — `_handleExecuteJS` MAIN-world `new Function` fetch seam (908-962)
  - `extension/ai/tool-definitions.js` — `TOOL_REGISTRY` (55 tools), `getToolByName`, schema shape; `execute_js` def (100-120)
  - `extension/ai/agent-loop.js` — `getPublicTools()` LLM surface (674), `_executeTool` dispatch (2427), `setTimeout` iterator (2725/2794/2804) INV-04
  - `mcp/src/runtime.ts` — `register*Tools` sequence (36-43)
  - `mcp/src/tools/manual.ts` — `registerManualTools` (`TOOL_REGISTRY.filter`, `server.tool`, `mcp:execute-action` wire, 209-257)
  - `mcp/src/tools/vault.ts` — out-of-registry `server.tool()` security-boundary precedent (16-19), "secrets never cross the bridge"
  - `mcp/src/tools/read-only.ts` / `observability.ts` — read-only data-tool + `search_memory` progressive-disclosure precedent
  - `mcp/src/tools/schema-bridge.ts` — `tool-definitions.cjs` -> MCP `jsonSchemaToZod` mirror
  - `extension/lib/memory/memory-schemas.js` — `createProceduralMemory` typeData (91-103), `MAX_MEMORIES`/budget (23-24)
  - `extension/background.js` — existing `chrome.debugger.attach({tabId},'1.3')` + `sendCommand` CDP plumbing (~13811+, Input.* today; Network.* to add); offscreen host (~15360+)
  - `extension/manifest.json` — `debugger`, `scripting`, `<all_urls>`, `offscreen` permissions; MAIN-world content script
  - `extension/config/secure-config.js` — local-only encrypted secret pattern (`chrome.storage.local`, AES-GCM), "never persist secrets" posture
- `.planning/PROJECT.md` — v0.9.99 milestone goals + INV-01..04; vault/dispatch decisions
- `.planning/research/ARCHITECTURE.md` (v0.11.0 Trigger) — directly-applicable NEW-files-compose-existing-primitives + parallel-registry + additive-tool-registration architectural precedent
- Milestone context — OpenTabs `github-api.ts` `fetchFromPage` (page-context same-origin fetch carrying HttpOnly cookies + CSRF scraping + persisted-query-hash discovery)
- [Same-origin policy (Wikipedia)](https://en.wikipedia.org/wiki/Same-origin_policy) — same-origin requests bypass CORS; HTTPS cookies maintain authenticated sessions
- [Cross-origin resource sharing (Wikipedia)](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) — why an extension-origin (SW) fetch is cross-origin to the target site
- [chrome.cookies API (Chrome for Developers)](https://developer.chrome.com/docs/extensions/reference/api/cookies) — extensions *can* read HttpOnly cookies via this API; FSB deliberately does NOT (page-context fetch instead), keeping auth handling implicit/local

---
*Architecture research for: authenticated-API capability layer integration (FSB v0.9.99)*
*Researched: 2026-06-19*
