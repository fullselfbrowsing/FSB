# Phase 28: Lean MCP Surface + Capability Search + Eval Harness - Research

**Researched:** 2026-06-20
**Domain:** MV3 service-worker full-text search (minisearch) + lean out-of-registry MCP tool surface + progressive disclosure + zero-framework eval harness
**Confidence:** HIGH (every source anchor in 28-CONTEXT.md verified against the live `automation-worktree` tree; minisearch API confirmed from the vendored `extension/lib/minisearch.min.js` source AND npm `minisearch@7.2.0`)

<user_constraints>
## User Constraints (from CONTEXT.md)

> The 28-CONTEXT.md is exhaustive and ALREADY locked every design decision. This research VERIFIES those decisions against the live tree and fills the how-to gaps. Decisions below are copied verbatim; the planner MUST honor them and must NOT re-explore alternatives.

### Locked Decisions

**Search Descriptor & Index Field Source (SURF-04)**
- **D-01:** The minisearch index is populated from a **NEW separate capability-descriptor document shape** (one per capability, keyed by recipe `slug`/`id`), NOT from the recipe itself. The descriptor carries the intent/human-facing fields: `slug`, `service`, `intentSynonyms[]`, `description`, `actionVerb`, `sideEffectClass`. The **Phase 26 closed recipe schema stays byte-untouched**. Recommended location: `catalog/descriptors/*.json` (or a slug-keyed `searchDescriptor` block in a catalog manifest).
- **D-02:** `service`, `actionVerb`, and `sideEffectClass` are AUTHORED in the descriptor but **cross-checked against recipe-derived values at index-build time**. `sideEffectClass` derives from the frozen `method`: **GET/HEAD = read, POST/PUT/PATCH = mutate, DELETE = destructive** -- mirroring `MUTATING_METHODS = {POST,PUT,PATCH,DELETE}` at `capability-fetch.js:228`. `service` derives from `origin` host + `id` namespace. Intent synonyms are mandatory (terse endpoint names alone is the #1 recall-failure mode).
- **D-03:** The `sideEffectClass` (read/mutate/destructive) is **surfaced in every `search_capabilities` result** so the model can disambiguate before invoking.

**Search/Index Module & Persistence (SURF-04, SURF-05)**
- **D-04:** A **NEW SW module `extension/utils/capability-search.js`** (dual-export IIFE, mirroring `capability-interpreter.js` / `capability-fetch.js`) owns the `MiniSearch` instance and the **slug -> recipe map**. It MUST be added to `RECIPE_PATH_ALLOWLIST` (`scripts/verify-recipe-path-guard.mjs:85-98`) and stay **eval-free** (Check 4 fails CLOSED on any `extension/utils/capability-*.js` missing from the allowlist). The interpreter stays purity-bound; the index does NOT live inside it.
- **D-05:** The index builds at SW startup via `addAll(descriptors)`, snapshots via `MiniSearch.prototype.toJSON` to `chrome.storage.local` under key **`fsbCapabilityIndex`** alongside a stored **`catalogVersion`/hash**, and reloads via `MiniSearch.loadJSON(json, options)` when the version matches -- else rebuilds and re-snapshots. Avoid rebuild-on-every-wake (cold-start latency + SW-eviction regression).

**Invoke Execution Path & Result Shape (SURF-02)**
- **D-06:** `invoke_capability` runs the **DIRECT Phase-27 path with NO Phase-29 router**: `slug -> capability-search slug->recipe lookup -> FsbCapabilityInterpreter.interpretRecipe(recipe, args) -> FsbCapabilityFetch.executeBoundSpec(spec, tabId)`. Param validation happens **SW-side inside `interpretRecipe`** (against `recipe.params`, via the cfworker Validator at `capability-interpreter.js:264-292`).
- **D-07:** The **structured result** returned to MCP is the existing `executeBoundSpec` normalized shape `{ success, status, finalUrl, redirected, data, text }` (`capability-fetch.js:377-385`), or the dual-field typed error on failure. A **bad/unknown slug returns a new `RECIPE_NOT_FOUND`** that surfaces verbatim via the `/^RECIPE_.+$/` passthrough at `mcp/src/errors.ts:137` (no errors.ts edit needed).
- **D-08 (schema-on-hit):** `search_capabilities` returns the matched recipe's **`params` JSON-Schema in the hit payload** so the model can construct valid `invoke_capability` args in one round-trip.

**MCP Registration, Read-Only Split & Tab-Origin Bias (SURF-01, SURF-03, SURF-05)**
- **D-09:** A **NEW `mcp/src/tools/capabilities.ts`** exports `registerCapabilityTools(server, ...)`, called from `mcp/src/runtime.ts` alongside the other `register*Tools`. **Both tools register via `server.tool()` OUTSIDE `TOOL_REGISTRY`** -- the `vault.ts:20-48` precedent. This keeps INV-01 intact: the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (`tests/tool-definitions-parity.test.js:52`) never moves.
- **D-10:** `search_capabilities` zod shape `{ query: string, origin?: string, topN?: number }`, **joins the `readOnlyTools` set in `mcp/src/queue.ts:30-45`** (the `search_memory` bypass precedent); bridges to a **read-only `mcp:capabilities-search`** route. `invoke_capability` uses a **GENERIC zod shape `{ slug: string, params?: object, tab_id?: number }`** (per-recipe param validation is SW-side, D-06), is **`queue.enqueue`-serialized**, and bridges to a **queued `mcp:capabilities-invoke`** route. New routes register in `MCP_PHASE199_MESSAGE_ROUTES` (`mcp-tool-dispatcher.js:84-116`) with bridge handlers keyed by message name (`mcp-bridge-client.js:455-509`).
- **D-11 (tab-origin bias):** The owned-tab origin for biasing is **resolved authoritatively SW-side in the dispatcher/handler** (tab resolution reading `new URL(tab.url).origin` per the `capability-fetch.js:285-291` pattern) -- the model cannot spoof it -- **AND** an optional `origin` override param is accepted. minisearch applies the bias via `boostDocument` / field `boost` at query time. (Read-only `search_capabilities` still resolves the owned-tab origin even though it bypasses the queue.)

**Eval Harness & Milestone Gate (SURF-06)**
- **D-12:** The eval harness is a **zero-framework, CI-automated `node tests/capability-search-eval.test.js`** that joins the root `package.json` `test` `&&`-chain. It drives a fixtures file of **intent -> expected-slug pairs** and computes **recall@k (k<=5)** + **wrong-invoke rate** over the index.
- **D-13 (gate):** The milestone gate is **recall@5 >= 0.9 AND wrong-invoke = 0**. Zero-wrong-invoke is **non-negotiable**. No live model is required: pure index-recall measurement, runs in CI.
- **D-14 (sparse-catalog seeding):** Because the real catalog is ~1 recipe, the eval set is **seeded with synthetic head capabilities + descriptors + intent paraphrases** (mirroring `catalog/recipes/_fixtures/`). Indexing only the single real recipe would make recall a trivial 1.0.

**INV-01 Schema-Lock, Packaging & Catalog Shipping (SURF-03)**
- **D-15:** **No `fsb-mcp-server` version bump** is required for two additive out-of-registry tools (pinned `0.10.0`; if the planner DOES bump, the 5 version-locked files enforced by `tests/mcp-version-parity.test.js` must all move in lockstep). Add a **new `tests/capability-mcp-surface.test.js`** asserting (a) the two new tool names exist on the wire AND (b) the `tool-definitions-parity` registry hash is **unchanged**.
- **D-16 (catalog must ship):** `catalog/recipes/` does **NOT currently ship in the extension package** (`scripts/package-extension.mjs` zips `extension/` only). Phase 28 MUST add a **copy/generate step** to bundle `catalog/` (recipes + descriptors) into the extension, and load them at SW startup (via `chrome.runtime.getURL` fetch, or a build-time-generated `importScripts` JS manifest).

### Claude's Discretion
- Exact descriptor file layout: per-slug `catalog/descriptors/*.json` vs a single slug-keyed manifest (D-01).
- The minisearch field-boost WEIGHTS for origin biasing and the searchable-field list / `combineWith` mode (D-11) -- planner-tunable.
- The exact recall@k `k` and threshold if evidence supports deviating from recall@5 >= 0.9 (D-13) -- but wrong-invoke = 0 is fixed.
- Runtime catalog-load mechanism: packaged-JSON `fetch` vs build-time generated `extension/catalog/recipe-index.generated.js` dual-export IIFE loaded via `importScripts` (D-16) -- the latter avoids MV3 SW cold-start `fetch` fragility.
- Whether the slug->recipe map and the descriptor index live in one `capability-search.js` or split -- one module recommended.

### Deferred Ideas (OUT OF SCOPE)
- **Tiered `capability-router.js` (T0-T3) + catalog registry + autopilot `tool-executor.js` parity branch** -- **Phase 29**. Phase 28 invoke is the direct routerless path.
- **Consent gate (Off/Ask/Auto) + audit log + recipe signature verification + enforced disambiguation-before-mutate** -- **Phase 30**. Phase 28 invoke runs ungated (origin-pin still holds); side-effect class is *visible* but not *gating*.
- **Bundled imperative head (T1a code handlers) + declarative tail at scale** -- **Phase 29**.
- **CDP Network discovery -> recipe synthesis -> learned recipes feeding the index** -- **Phase 31**.
- **Self-healing DOM fallback + recipe-rot detection + 7-provider/schema-lock parity gate** -- **Phase 32**.
- **Live-model-in-the-loop eval** -- out of v1; Phase 28 measures index recall + wrong-invoke deterministically in CI.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SURF-01 | `search_capabilities` returns ranked, schema-on-hit results (<=5) for an intent query, biased by the owned tab's origin | minisearch `search(query, {boost / boostDocument, combineWith, fuzzy, prefix, filter})` (vendored source verified); origin resolved SW-side via `new URL(tab.url).origin` (`capability-fetch.js:285-291`); schema-on-hit returns `recipe.params` from the slug->recipe map (D-08). See **Standard Stack**, **Pattern 2/3**, **Code Examples**. |
| SURF-02 | `invoke_capability` executes a selected capability with validated parameters and returns a structured result | Direct path `interpretRecipe(recipe,args)` -> `executeBoundSpec(spec,tabId)`; result `{success,status,finalUrl,redirected,data,text}` (`capability-fetch.js:377-385`); SW-side param validation (`capability-interpreter.js:264-292`). See **Pattern 4**, **Code Examples**. |
| SURF-03 | Both tools register outside `TOOL_REGISTRY` (via `server.tool()`), keeping the existing ~63 MCP tool schemas byte-identical (INV-01) | `vault.ts:20-48` out-of-registry precedent; `runtime.ts:36-43` call site; frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` at `tool-definitions-parity.test.js:52` unaffected because `TOOL_REGISTRY` (55 entries) is untouched. See **Pattern 1**, **Pitfall 1**, **Validation Architecture**. |
| SURF-04 | A persisted minisearch index indexes intent synonyms + service + action verb + side-effect class, and snapshots to `chrome.storage.local` | Descriptor doc shape (D-01); `MiniSearch` `fields`/`storeFields` over `intentSynonyms`+`service`+`actionVerb`+`sideEffectClass`+`description`; `toJSON`/`loadJSON(json, options)` round-trip (options arg MANDATORY -- vendored source throws without it). See **Standard Stack**, **Pattern 2**, **Pitfall 3**. |
| SURF-05 | `search_capabilities` is read-only and bypasses the mutation queue; `invoke_capability` is serialized through it | `queue.ts:30-45` `readOnlyTools` Set -- add `'search_capabilities'`; `invoke_capability` calls `queue.enqueue('invoke_capability', ...)`. See **Pattern 1**, **Validation Architecture**. |
| SURF-06 | An eval harness measures recall@k and wrong-invoke rate, and the milestone is gated on its thresholds | Zero-framework `node tests/capability-search-eval.test.js` + intent->slug fixtures (D-12/D-14); recall@5>=0.9 AND wrong-invoke=0 (D-13); precedent `extension/test-data/edge-cases/edge_prompts.md` (70 lines, ~50 prompts). See **Pattern 5**, **Validation Architecture**. |
</phase_requirements>

## Summary

This phase is almost entirely an **integration + wiring** exercise against machinery that already exists. The recipe interpreter (`capability-interpreter.js`), the authenticated MAIN-world fetch (`capability-fetch.js`), the three vendored libraries (`minisearch`/`jmespath`/`@cfworker`), the out-of-registry MCP tool pattern (`vault.ts`), the read-only progressive-disclosure tool pattern (`search_memory` in `observability.ts`), the read-only queue bypass (`queue.ts`), the message-route table (`mcp-tool-dispatcher.js`), and the bridge handler switch (`mcp-bridge-client.js`) are all present and verified. **No new external package is introduced** -- all three runtime deps were vendored in Phase 26 and `minisearch.min.js` is already `importScripts`-loaded at `background.js:120` but "not wired until Phase 28."

The genuine unknowns the planner needs are: (1) the **concrete minisearch index-build/snapshot/restore code shape** for a SW module -- verified directly from the vendored UMD source: `loadJSON(json, options)` REQUIRES the same options object used at construction (the source literally throws otherwise), which is the load-bearing round-trip constraint; (2) the **exact two-tool out-of-registry registration recipe** (copy `vault.ts` `server.tool()` + the `search_memory` read-only data-tool shape); (3) the **dispatcher + bridge route wiring** for a new read-only `mcp:capabilities-search` and a queued `mcp:capabilities-invoke` (the `handleSearchMemoryMessageRoute`/`_handleSearchMemory` pair is the exact template); (4) **how the catalog gets shipped** (it does not today -- `package-extension.mjs` zips `extension/` only, and `catalog/` is top-level); and (5) the **eval-harness methodology** (recall@k + wrong-invoke definitions, synthetic intent->slug seeding for a sparse catalog, zero-framework CI gate).

**Primary recommendation:** Treat Phase 28 as five thin, mechanical seams glued onto proven parts: (a) `capabilities.ts` (two `server.tool()` calls + queue split) modeled byte-for-byte on `vault.ts` + `observability.ts`; (b) `capability-search.js` (one `MiniSearch` instance + slug->recipe map + `toJSON`/`loadJSON` persistence) modeled on the interpreter/fetch IIFE shell; (c) two new `MCP_PHASE199_MESSAGE_ROUTES` entries + bridge handlers modeled on `handleSearchMemoryMessageRoute`/`_handleSearchMemory`; (d) a catalog-ship step in `package-extension.mjs` -- **recommend the build-time-generated `extension/catalog/recipe-index.generated.js` dual-export IIFE loaded via `importScripts`** (MV3-cold-start-safe, no SW `fetch` fragility); (e) a seeded synthetic intent->slug fixture + a zero-framework `node tests/capability-search-eval.test.js` gating recall@5>=0.9 AND wrong-invoke=0, plus `tests/capability-mcp-surface.test.js` asserting the registry hash is unchanged.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `search_capabilities` tool definition + zod shape + queue-bypass | MCP server (`mcp/src/tools/capabilities.ts`, `queue.ts`) | -- | The tool schema and read-only classification are an MCP-server concern; nothing browser-side defines them. Mirrors `observability.ts` `search_memory`. |
| `invoke_capability` tool definition + zod shape + queue-serialize | MCP server (`mcp/src/tools/capabilities.ts`) | -- | Generic `{slug, params?, tab_id?}` schema lives server-side; per-recipe validation is delegated SW-side (a static schema cannot express dynamic per-recipe params). |
| Wire transport (`mcp:capabilities-search` / `-invoke` routing) | Bridge (`mcp-bridge-client.js`) + Dispatcher (`mcp-tool-dispatcher.js`) | -- | The bridge handler switch + `MCP_PHASE199_MESSAGE_ROUTES` are the SW message chokepoint; this is exactly where `search_memory` routes. |
| minisearch index build / snapshot / restore | SW module (`extension/utils/capability-search.js`) | `chrome.storage.local` | MV3 SW owns the in-memory inverted index; persistence is `chrome.storage.local` (the only durable SW store). The index lives OUTSIDE the purity-bound interpreter (D-04). |
| Owned-tab origin resolution (bias source) | SW dispatcher/handler | Agent ownership registry | Origin must be authoritative + un-spoofable -> resolved SW-side from the owned/active tab URL (`new URL(tab.url).origin`), never trusted from the model. |
| slug -> recipe lookup + interpret + execute (invoke) | SW (`capability-search.js` map -> `capability-interpreter.js` -> `capability-fetch.js`) | page MAIN world (fetch) | The Phase 26/27 engine is the execution tier; Phase 28 composes it directly (no router). The credentialed fetch itself runs in the page MAIN world (Wall 2). |
| Catalog data shipping (recipes + descriptors -> package) | Build script (`scripts/package-extension.mjs`) | -- | Packaging is a build-time concern; the catalog is top-level today and must be copied/generated into the extension bundle. |
| Eval harness (recall@k / wrong-invoke gate) | Node test (`tests/capability-search-eval.test.js`) | `package.json` test chain | Pure index-recall measurement; deterministic, no live model, no browser -- a Node CLI test like every other `tests/capability-*.test.js`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `minisearch` | **7.2.0** | In-memory BM25 inverted index for `search_capabilities`; field boosting + `boostDocument` for tab-origin bias; `toJSON`/`loadJSON` snapshot to `chrome.storage.local` | `[VERIFIED: npm registry]` latest = 7.2.0; vendored copy at `extension/lib/minisearch.min.js` is UMD (`global.MiniSearch`), zero-dep, SW-safe, already `importScripts`-loaded at `background.js:120`. Real BM25 + prefix + fuzzy + field boosting -- far better recall than `String.includes()`, far lighter than embeddings. `[CITED: .planning/research/STACK.md:89]` |
| `@cfworker/json-schema` | 4.1.1 | SW-side per-recipe param validation inside `interpretRecipe` | Already vendored (`extension/lib/cfworker-json-schema.min.js`, IIFE global `CfworkerJsonSchema`); the interpreter already uses it (`capability-interpreter.js:67-72`). Phase 28 adds NO new use -- invoke just calls `interpretRecipe`. `[VERIFIED: codebase]` |
| `jmespath` | 0.16.0 | Read-only response extract inside `executeBoundSpec` | Already vendored + wired in Phase 27 (`capability-fetch.js:91-98`); Phase 28 adds no new use. `[VERIFIED: codebase]` |
| `zod` | ^3.24.0 | MCP tool input schemas (`server.tool()` third arg) | Already the MCP server's schema lib (`mcp/package.json:56`); both new tools use hand-written zod shapes. `[VERIFIED: codebase]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | `McpServer.tool()` registration | Already present; `registerCapabilityTools` calls `server.tool()` exactly like `registerVaultTools`. `[VERIFIED: codebase]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `minisearch` | `flexsearch` / `fuse.js` / local embeddings | Rejected in STACK.md: flexsearch ~2.3 MB + ESM friction (overkill); fuse.js is fuzzy-only and scales worse; embeddings need tens of MB + `wasm-unsafe-eval` for a few-thousand-row corpus. minisearch dominates (BM25 + prefix + fuzzy + field boost, ~7 kB gz). `[CITED: .planning/research/STACK.md:231-233]` |
| `jsonSchemaToZod` for `invoke_capability` params | hand-written `z.object({...}).passthrough()` / `z.record(z.any())` | `jsonSchemaToZod` (`schema-bridge.ts:78`) does NOT handle `type:'object'` (defaults to `z.any()`) and is built for the static registry, not dynamic per-recipe schemas. `invoke_capability` uses a generic `params?: object` (validated SW-side) -- hand-write the zod shape. `[VERIFIED: codebase]` |

**Installation:** None. All runtime deps are already vendored (Phase 26 D-05; CAP-05). No `npm install`, no manifest/permission change.

**Version verification (run 2026-06-20):**
```bash
npm view minisearch version    # -> 7.2.0  (matches vendored extension/lib/minisearch.min.js and STACK.md)
```

## Package Legitimacy Audit

> **N/A for this phase.** Phase 28 introduces **zero** new external packages. The three capability-runtime libraries (`minisearch@7.2.0`, `jmespath@0.16.0`, `@cfworker/json-schema@4.1.1`) were installed, vendored, and slop-audited in Phase 26 (CAP-05); they are already in `extension/lib/` and on the `RECIPE_PATH_ALLOWLIST`. The only "new" artifacts are FSB-authored source files (`capability-search.js`, `capabilities.ts`, descriptors, tests) -- not registry packages.

| Package | Registry | Status | Disposition |
|---------|----------|--------|-------------|
| minisearch | npm | Vendored Phase 26; latest 7.2.0 confirmed | No change -- already shipped |
| jmespath | npm | Vendored Phase 26 | No change -- already shipped |
| @cfworker/json-schema | npm | Vendored Phase 26 (IIFE) | No change -- already shipped |

**Packages removed due to slopcheck [SLOP] verdict:** none (no new installs).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
  MCP client (Claude/Codex)                              MCP client
        |  search_capabilities(query, origin?, topN?)         |  invoke_capability(slug, params?, tab_id?)
        v   [read-only -> bypasses queue]                     v   [mutation -> queue.enqueue serializes]
  +----------------------------------------+         +----------------------------------------+
  | mcp/src/tools/capabilities.ts          |         | mcp/src/tools/capabilities.ts          |
  |  server.tool('search_capabilities')    |         |  server.tool('invoke_capability')      |
  |  (NOT in TOOL_REGISTRY)                 |         |  queue.enqueue('invoke_capability', fn)|
  +-------------------+--------------------+         +-------------------+--------------------+
        | bridge.sendAndWait                                 | sendAgentScopedBridgeMessage
        | {type:'mcp:capabilities-search'}                   | {type:'mcp:capabilities-invoke'}
        v   (WebSocket bridge)                               v
  ============================ SW boundary (extension) ============================
        v                                                    v
  mcp-bridge-client.js  _handleCapabilitiesSearch       mcp-bridge-client.js  _handleCapabilitiesInvoke
        |  -> dispatchMcpMessageRoute(...)                   |  -> dispatchMcpMessageRoute(...)
        v                                                    v
  mcp-tool-dispatcher.js                                mcp-tool-dispatcher.js
   MCP_PHASE199_MESSAGE_ROUTES['mcp:capabilities-search'] MCP_PHASE199_MESSAGE_ROUTES['mcp:capabilities-invoke']
   handleCapabilitiesSearchMessageRoute                  handleCapabilitiesInvokeMessageRoute
        |  resolve owned-tab origin (new URL(tab.url).origin)|  resolve tabId (explicit or owned/active tab)
        v                                                    v
  +----------------------------------+              +-------------------------------------------+
  | capability-search.js             |              | capability-search.js: slug -> recipe map  |
  |  MiniSearch.search(query, {       |  schema-on-hit |        |                                  |
  |   boostDocument by origin, ...})  |-----------+  |        v                                  |
  |  returns <=topN hits:             |           |  | FsbCapabilityInterpreter.interpretRecipe  |
  |   {slug, service, sideEffectClass,|           |  |   (recipe, args)  [validate+bind+pin+STOP]|
  |    description, score, params}    |           |  |        |  spec                            |
  +----------------------------------+           |  |        v                                  |
        ^ index built at SW startup              |  | FsbCapabilityFetch.executeBoundSpec        |
        |  addAll(descriptors)                    |  |   (spec, tabId)  -> page MAIN-world fetch  |
        |  toJSON -> chrome.storage.local         |  |        |                                  |
        |  (key 'fsbCapabilityIndex' + version)   |  |        v  {success,status,finalUrl,...}    |
        |  loadJSON(json, SAME options) on wake   |  +-------------------------------------------+
        |                                              ^
  catalog/descriptors/*.json  +  catalog/recipes/*.json
        ^ shipped via build-time generated extension/catalog/recipe-index.generated.js (importScripts)
```

### Recommended Project Structure
```
catalog/
├── recipes/                          # EXISTING (Phase 26/27) -- closed-vocab recipe data
│   ├── github-notifications.json
│   └── _fixtures/                    # EXISTING -- valid/reject test fixtures
├── descriptors/                      # NEW (D-01) -- per-slug search descriptors
│   ├── github-notifications.json     # {slug, service, intentSynonyms[], description, actionVerb, sideEffectClass}
│   └── _fixtures/                    # NEW -- synthetic head capabilities for eval seeding (D-14)
extension/
├── catalog/
│   └── recipe-index.generated.js     # NEW (build artifact, D-16) -- dual-export IIFE: {recipes, descriptors}
├── utils/
│   └── capability-search.js          # NEW (D-04) -- MiniSearch instance + slug->recipe map + persistence
├── lib/minisearch.min.js             # EXISTING (vendored, loaded background.js:120)
mcp/src/
├── tools/capabilities.ts             # NEW (D-09) -- registerCapabilityTools (2 server.tool() calls)
├── runtime.ts                        # MODIFIED -- add registerCapabilityTools call
└── queue.ts                          # MODIFIED -- add 'search_capabilities' to readOnlyTools Set
extension/ws/
├── mcp-tool-dispatcher.js            # MODIFIED -- 2 routes + 2 handlers + origin resolution
└── mcp-bridge-client.js              # MODIFIED -- 2 switch cases + 2 delegating handlers
scripts/
├── package-extension.mjs             # MODIFIED (D-16) -- ship catalog into the package
└── verify-recipe-path-guard.mjs      # MODIFIED (D-04) -- add capability-search.js to allowlist
tests/
├── capability-search-eval.test.js    # NEW (D-12) -- recall@k + wrong-invoke gate
└── capability-mcp-surface.test.js    # NEW (D-15) -- 2 tools on wire + registry hash unchanged
```

### Pattern 1: Two out-of-registry MCP tools + read-only/queue split (D-09, D-10, SURF-03, SURF-05)
**What:** Register `search_capabilities` (read-only, bypasses queue) and `invoke_capability` (queued) via `server.tool()` in a new `capabilities.ts`, called from `runtime.ts`. Neither joins `TOOL_REGISTRY`.
**When to use:** Always -- this is the INV-01-preserving seam.
**Mechanics verified:**
- `registerVaultTools(server, bridge, queue, agentScope)` is the exact signature + call-site shape (`runtime.ts:42`, `vault.ts:20`). Add `registerCapabilityTools(server, bridge, queue, agentScope)` next to it.
- Read-only bypass is data-driven: a tool's name is added to the `readOnlyTools` Set literal in the `TaskQueue` constructor (`queue.ts:30-45`), and `enqueue(name, fn)` returns `fn()` immediately when `readOnlyTools.has(name)` (`queue.ts:51-54`). So `search_capabilities` must call `queue.enqueue('search_capabilities', fn)` AND the string `'search_capabilities'` must be added to the Set. (The `search_memory` tool follows exactly this: it calls `queue.enqueue('search_memory', ...)` at `observability.ts:97` and `'search_memory'` is in the Set at `queue.ts:39`.)
- `invoke_capability` calls `queue.enqueue('invoke_capability', fn)` and is NOT in the Set -> serialized (the `fill_credential`/`use_payment_method` precedent at `vault.ts:66,116`).
**Example:** see Code Examples below.

### Pattern 2: minisearch index build + snapshot + restore in a SW module (D-04, D-05, SURF-04)
**What:** A single `MiniSearch` instance in `capability-search.js`, built from descriptors at startup, persisted via `toJSON`, restored via `loadJSON(json, SAME_OPTIONS)`.
**When to use:** SW startup (build-or-restore) + on every `search_capabilities` call (query).
**Critical constraint (verified from vendored source):** `MiniSearch.loadJSON(json, options)` REQUIRES the `options` argument and it MUST match the original constructor config -- the shipped source literally throws `'loadJSON should be given the same options used when serializing the index'`. So the options object (`{ fields, storeFields, idField, ... }`) must be a module-level constant reused at BOTH construction and `loadJSON`.
**Snapshot/version discipline (D-05):** store `{ index: ms.toJSON(), catalogVersion }` under `chrome.storage.local['fsbCapabilityIndex']`. On wake: read it; if `catalogVersion` matches the current catalog hash -> `MiniSearch.loadJSON(stored.index, OPTIONS)`; else rebuild via `addAll(descriptors)` + re-snapshot. Never rebuild on every wake (cold-start latency + SW-eviction regression).
**Example:** see Code Examples below.

### Pattern 3: tab-origin bias via `boostDocument` (D-11, SURF-01)
**What:** Bias results toward capabilities whose `service`/`origin` matches the owned tab's origin.
**Verified levers (from vendored source -- both exist):**
- **Field `boost`**: `search(query, { boost: { intentSynonyms: 3, description: 1 } })` -- boosts a matched FIELD's contribution. Use for static field weighting (synonyms > description).
- **`boostDocument(documentId, term, storedFields)`**: a per-document multiplier callback that can read `storedFields` -- **the clean origin-bias lever**. Recommend: `boostDocument: (id, term, stored) => stored.service === ownedService ? ORIGIN_BOOST : 1`. This boosts the whole doc when its service matches the active tab, regardless of which term matched.
**Origin resolution (un-spoofable):** resolve SW-side in the handler from the owned/active tab: `new URL(tab.url).origin` (the exact pattern at `capability-fetch.js:285-291`). Accept an optional `origin` override param but prefer the resolved owned-tab origin. The model never supplies the authoritative origin.

### Pattern 4: routerless direct invoke (D-06, D-07, SURF-02)
**What:** `invoke_capability` composes the existing Phase 27 engine with NO Phase 29 router.
**Sequence (all verified):**
1. Resolve `tabId` (explicit `tab_id` param, else owned/active tab).
2. `const recipe = capabilitySearch.getRecipeBySlug(slug)` -- if absent, return `RECIPE_NOT_FOUND` (verbatim passthrough via `errors.ts:137`; `RECIPE_NOT_FOUND` is currently unused anywhere -- free to introduce, no `errors.ts` edit).
3. `const interpreted = FsbCapabilityInterpreter.interpretRecipe(recipe, params)` -- this VALIDATES `params` against `recipe.params` SW-side (`capability-interpreter.js:264-292`), templates the endpoint, builds the request, re-asserts the origin-pin, binds auth, and returns `{ success:true, spec }` or a typed `RECIPE_*` error (return that verbatim).
4. `const result = await FsbCapabilityFetch.executeBoundSpec(interpreted.spec, tabId)` -- runs the page MAIN-world credentialed fetch, the second active-tab origin-pin, the resume-sidecar, and the SW-side extract; returns `{ success, status, finalUrl, redirected, data, text }` (`capability-fetch.js:377-385`).
5. Return `result` to MCP (mapped by `mapFSBError`).

### Pattern 5: zero-framework recall@k / wrong-invoke eval (D-12, D-13, D-14, SURF-06)
**What:** A `node tests/capability-search-eval.test.js` that builds the index over the SEEDED descriptor set, runs each fixture intent through `search`, and asserts the gate.
**Definitions (deterministic, no live model):**
- **recall@k:** fraction of fixtures whose `expectedSlug` appears in the top-`k` (k<=5) search hits. `recall@k = (# fixtures where expectedSlug in top-k hits) / (# fixtures)`.
- **wrong-invoke rate:** the rate at which the TOP-1 hit's slug differs from `expectedSlug` for fixtures that have a correct answer -- i.e. a fixture whose top-1 is a *different, plausible* capability. `wrong-invoke = (# fixtures where top1.slug != expectedSlug) / (# fixtures)`. The gate `wrong-invoke = 0` means the top-1 must always be the expected slug for every seeded fixture (zero mis-invoke).
**Gate:** `assert(recall@5 >= 0.9)` AND `assert(wrongInvoke === 0)`; non-zero of either -> `process.exit(1)` (the `tests/capability-*.test.js` convention).
**Seeding (D-14):** because the real catalog is ~1 recipe, author ~6-12 synthetic head capabilities (descriptors + minimal recipes) under `catalog/descriptors/_fixtures/` with 3-5 intent paraphrases each (e.g. "message my team", "send a slack message", "post to the channel" -> `slack.post-message`). The precedent is `extension/test-data/edge-cases/edge_prompts.md` (70 lines, ~50 numbered intent prompts across failure categories) and `catalog/recipes/_fixtures/` (the Phase 26 valid/reject seed).
**Test data lives outside the shipped runtime:** like `catalog/recipes/_fixtures/`, the eval seed is test-only (not `node --check`'d, not packaged), so it does NOT count against the recipe-path CI guard.

### Anti-Patterns to Avoid
- **Adding `search_capabilities`/`invoke_capability` to `TOOL_REGISTRY`:** reds `tool-definitions-parity.test.js` (the frozen hash + the 49-name `EXPECTED_NON_TRIGGER_TOOL_NAMES` list) AND forces autopilot exposure via `getPublicTools()`. Register via `server.tool()` out-of-registry. `[CITED: .planning/research/ARCHITECTURE.md:338-341]`
- **Building the index inside `capability-interpreter.js`:** violates D-04 (interpreter is purity-bound: validate+bind+STOP, no `chrome.storage`). The index is a separate `capability-search.js`.
- **Calling `MiniSearch.loadJSON(json)` without the options arg:** throws at runtime (verified in vendored source). Always pass the same options used at construction.
- **Trusting a model-supplied `origin` as the authoritative bias source:** the owned-tab origin must be resolved SW-side (`new URL(tab.url).origin`); the `origin` param is an optional override only.
- **Rebuilding the index on every SW wake:** cold-start latency + a regression against MV3 SW eviction. Restore from snapshot when `catalogVersion` matches.
- **A `server.tool()` static schema that enumerates per-recipe params for `invoke_capability`:** impossible (params are dynamic per recipe). Use the generic `{slug, params?, tab_id?}` and validate SW-side.
- **Adding the catalog as a runtime `fetch` from `chrome.runtime.getURL` without a cold-start fallback:** MV3 SW `fetch` at startup can race eviction. Prefer the build-time `importScripts` JS manifest (D-16 discretion); if `fetch` is used, gate it behind the index build-or-restore and tolerate failure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ranked intent search | A custom `String.includes()` / token-overlap scorer | `minisearch` BM25 + prefix + fuzzy | The catalog quality ceiling IS search quality (Pitfall 6). Hand-rolled scoring under-recalls on intent vocabulary and has no field boosting for origin bias. `[CITED: .planning/research/STACK.md:165]` |
| Index persistence | Manual serialize of the inverted index to JSON | `MiniSearch.prototype.toJSON()` + `MiniSearch.loadJSON(json, options)` | minisearch ships a tested round-trip; a hand-rolled serializer will drift from the internal index structure across versions. `[VERIFIED: extension/lib/minisearch.min.js]` |
| Per-recipe param validation | A bespoke validator in `invoke_capability` | `interpretRecipe` (already validates `params` via cfworker) | The interpreter ALREADY validates args against `recipe.params` (`capability-interpreter.js:264-292`). Re-validating in the tool duplicates logic and risks divergence. `[VERIFIED: codebase]` |
| Credentialed fetch + origin-pin + extract | Any new fetch path in the tool/dispatcher | `executeBoundSpec(spec, tabId)` | Wall 2: the authenticated call MUST run in the page MAIN world. `executeBoundSpec` is that spine (`capability-fetch.js:272-385`). A background-SW `fetch()` is the documented anti-pattern. `[CITED: .planning/STATE.md:65]` |
| Error surfacing for unknown slug | An `errors.ts` edit for a new code | Return `RECIPE_NOT_FOUND`; the `/^RECIPE_.+$/` passthrough surfaces it verbatim | `errors.ts:137` already passes `RECIPE_.+` verbatim; `RECIPE_NOT_FOUND` is unused -> free. No INV-01-adjacent edit. `[VERIFIED: mcp/src/errors.ts:137]` |
| topN clamping | A new bounds helper | `boundedPositiveInt(value, default, max)` | Already exists at `mcp-tool-dispatcher.js:1413` and is used by `handleSearchMemoryMessageRoute` (`:2152`) for the same topN-clamp need. `[VERIFIED: codebase]` |
| Message route plumbing | A new dispatch path | `MCP_PHASE199_MESSAGE_ROUTES` + `dispatchMcpMessageRoute` + a `_handleX` bridge delegate | The entire read-only message-route + handler pattern exists (`handleSearchMemoryMessageRoute`/`_handleSearchMemory`); clone it. `[VERIFIED: codebase]` |

**Key insight:** Phase 28 is glue. The single piece of genuinely NEW logic is the descriptor->index mapping + the `boostDocument` origin bias; everything else is a documented clone of an existing, tested pattern. The highest-risk surface is search RECALL (Pitfall 6), which is why the eval harness is the gate -- not the wiring.

## Runtime State Inventory

> This phase is mostly additive new code, but it DOES introduce a persisted snapshot and a build-time catalog artifact, so the inventory is non-trivial.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **NEW** `chrome.storage.local['fsbCapabilityIndex']` (the minisearch `toJSON` snapshot + `catalogVersion`). No PRE-EXISTING key collides (verified: `fsbCapabilityIndex` is unused; existing keys are `fsbChangeReportsEnabled` and the task-store/memory keys). | Code edit only -- the SW writes/reads this new key. The `catalogVersion` mismatch path must rebuild+re-snapshot so a stale snapshot from an older catalog never serves wrong results. No migration of existing user data (greenfield key). |
| Live service config | None. No external service config embeds anything renamed here. `search_capabilities`/`invoke_capability` are NEW wire names, not renames. | None -- verified by grep (`RECIPE_NOT_FOUND`, `capabilities-search`, `capabilities-invoke`, `fsbCapabilityIndex`, `capability-search.js` all absent today). |
| OS-registered state | None. No OS-level registration (Task Scheduler / launchd / pm2) references this phase. | None -- verified (FSB is a Chrome extension + Node MCP server; no OS-registered task names involved). |
| Secrets/env vars | None. Auth material (cookies/CSRF) is carried by the EXISTING `executeBoundSpec` page-world fetch (`credentials:'include'`), never persisted, never named in a new env var. No SOPS/.env key added. | None. |
| Build artifacts / installed packages | **NEW** build artifact `extension/catalog/recipe-index.generated.js` (D-16, if the generated-IIFE option is chosen) -- a stale copy after a catalog edit would serve old data. `mcp/ai/tool-definitions.cjs` is regenerated by `npm --prefix mcp run build` (already in the test chain) and is UNAFFECTED (no registry change). | Build-step ordering: the catalog generator must run BEFORE `package-extension.mjs` zips, and the generated file must be regenerated whenever `catalog/` changes. If the `fetch`-from-`getURL` option is chosen instead, no generated artifact -- the raw `catalog/*.json` is copied into the zip. |

**Nothing found in categories Live service config / OS-registered state / Secrets:** confirmed by grep against the live tree (none of `capabilities-search`, `capabilities-invoke`, `fsbCapabilityIndex`, `capability-search.js`, `RECIPE_NOT_FOUND`, `catalog/descriptors` exist today).

## Common Pitfalls

### Pitfall 1: Capability-search recall/precision failure (the milestone-defining risk)
**What goes wrong:** Two modes -- (a) low recall: the model searches "message my team" but the capability is indexed as "post chat.postMessage" -> miss -> falls back to slow DOM or gives up; (b) low precision: a fuzzy match surfaces a wrong-but-plausible capability (a *delete* when the user wanted *archive*), and because invoke executes with the user's real credentials, a mis-invoke is a REAL destructive action, not a recoverable click.
**Why it happens:** Indexing terse, API-named endpoint descriptions that don't match user/agent intent vocabulary; no disambiguation step before a high-consequence invoke.
**How to avoid:** Index on **intent-phrased synonyms + service + action verb + side-effect class**, not endpoint names (D-01/D-02); return **scored, ranked, origin-scoped** results with `sideEffectClass` visible (D-03); gate the milestone on an eval harness (recall@5>=0.9 AND wrong-invoke=0, D-13). Zero-wrong-invoke is non-negotiable.
**Warning signs:** high DOM-fallback rate on tasks that HAVE a capability (recall miss); any wrong-invoke in eval; descriptors with empty/auto-generated-only descriptions. `[CITED: .planning/research/PITFALLS.md:245-282]`

### Pitfall 2: INV-01 schema-lock breakage
**What goes wrong:** A change touches the `TOOL_REGISTRY`-derived wire schemas, moving `EXPECTED_NON_TRIGGER_REGISTRY_HASH` and reddening `tool-definitions-parity.test.js`.
**Why it happens:** Adding the new tools to `TOOL_REGISTRY` "for parity," or editing `tool-definitions.js` (which must stay byte-identical to the `.cjs` mirror).
**How to avoid:** Register the two tools ONLY via `server.tool()` in `capabilities.ts` (out-of-registry). Do not touch `tool-definitions.js`/`.cjs`. Add `tests/capability-mcp-surface.test.js` asserting the hash is unchanged AND the two tool names ARE on the wire (D-15).
**Warning signs:** `tool-definitions-parity.test.js` FAIL on `registryHash(...) === EXPECTED_NON_TRIGGER_REGISTRY_HASH`; any diff to `tool-definitions.js`. `[VERIFIED: tests/tool-definitions-parity.test.js:52,124-131]`

### Pitfall 3: minisearch `loadJSON` options mismatch / snapshot drift
**What goes wrong:** `loadJSON(json)` is called without the options arg (throws), OR the options differ from construction (silently corrupt index), OR a stale snapshot from an older catalog serves wrong results.
**Why it happens:** The options arg is non-obvious; the round-trip contract is easy to miss; no version stamp on the snapshot.
**How to avoid:** Keep the construction options in a module-level constant; pass that SAME constant to `loadJSON` (the vendored source throws `'loadJSON should be given the same options used when serializing the index'` if absent). Stamp the snapshot with `catalogVersion` and rebuild+re-snapshot on mismatch (D-05).
**Warning signs:** a thrown error on SW wake referencing `loadJSON`; search returning stale/missing slugs after a catalog edit. `[VERIFIED: extension/lib/minisearch.min.js]`

### Pitfall 4: Catalog absent from the packaged extension -> empty index in production
**What goes wrong:** `package-extension.mjs` zips `extension/` only; `catalog/` is top-level, so a packaged build has NO descriptor/recipe data and the index is empty -- search always misses, invoke always `RECIPE_NOT_FOUND`. Works in dev (files on disk) but silently breaks in a Web Store build.
**Why it happens:** The packaging boundary excludes top-level dirs; there is no recipe-loader in `background.js` today.
**How to avoid (D-16):** Add a catalog-ship step. **Recommended:** a build-time generator that emits `extension/catalog/recipe-index.generated.js` (a dual-export IIFE bundling `{recipes, descriptors}`) loaded via `importScripts` -- MV3-cold-start-safe, no SW `fetch` race. Alternative: copy `catalog/` into `extension/catalog/` before the zip and `fetch(chrome.runtime.getURL('catalog/...'))` at startup (more fragile under SW eviction). Either way, add a CI assertion that the packaged artifact CONTAINS the catalog data.
**Warning signs:** index size 0 in a packaged build; all eval passes locally but a manual packaged-extension smoke shows empty search. `[VERIFIED: scripts/package-extension.mjs:55-59]`

### Pitfall 5: Recipe-path CI guard fails closed on the new module
**What goes wrong:** `capability-search.js` is created but NOT added to `RECIPE_PATH_ALLOWLIST` -> `verify-recipe-path-guard.mjs` Check 4 (disk-drift) FAILS the build because it enumerates `extension/utils/capability-*.js` from disk and fails on any not on the allowlist.
**Why it happens:** Check 4 is fail-closed by design (LO-03); a new capability module is invisible to the allowlist until explicitly added.
**How to avoid:** Add `'extension/utils/capability-search.js'` to `RECIPE_PATH_ALLOWLIST` (`scripts/verify-recipe-path-guard.mjs:85-98`) in the SAME plan that creates the file, and keep the file free of `eval(`/`new Function`/`import(` even in comments/strings (the guard scans comments).
**Warning signs:** `verify-recipe-path-guard: FAIL` with "allowlist drift: 'capability-search.js' exists on disk but is NOT on the recipe-path allowlist". `[VERIFIED: scripts/verify-recipe-path-guard.mjs:264-312]`

## Code Examples

> All examples are derived from verified live-tree patterns. Adapt names/weights per Claude's Discretion.

### `capabilities.ts` -- two out-of-registry tools with the queue split (Pattern 1)
```typescript
// Modeled on mcp/src/tools/vault.ts:20-130 + mcp/src/tools/observability.ts:84-111
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';

export function registerCapabilityTools(
  server: McpServer, bridge: WebSocketBridge, queue: TaskQueue, agentScope: AgentScope,
): void {
  // SURF-01 / SURF-05: read-only progressive-disclosure search. 'search_capabilities'
  // must ALSO be added to queue.ts readOnlyTools so enqueue() bypasses (search_memory precedent).
  server.tool(
    'search_capabilities',
    'Search the FSB capability catalog by intent. Returns up to topN ranked capabilities, each with its slug, service, side-effect class (read/mutate/destructive), one-line description, and the params JSON-Schema (schema-on-hit) so you can call invoke_capability in one step. Results are biased toward the active tab\'s origin.',
    {
      query: z.string().describe('Natural-language intent, e.g. "show my github notifications"'),
      origin: z.string().optional().describe('Optional origin override (e.g. "https://github.com"). Omit to use the active tab origin.'),
      topN: z.coerce.number().int().positive().finite().optional().describe('Max results (default 5, max 5)'),
    },
    async ({ query, origin, topN }) => {
      if (!bridge.isConnected) return mapFSBError({ success: false, error: 'extension_not_connected' });
      return queue.enqueue('search_capabilities', async () => {     // bypasses queue (name in readOnlyTools)
        const result = await bridge.sendAndWait(
          { type: 'mcp:capabilities-search', payload: { query, origin, topN } },
          { timeout: 5_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  // SURF-02 / SURF-05: serialized invoke. Generic schema; per-recipe validation is SW-side.
  server.tool(
    'invoke_capability',
    'Invoke a capability by slug (from search_capabilities) with validated params. Executes the service\'s real web API in your authenticated session and returns a structured result. Mutating capabilities perform real side effects.',
    {
      slug: z.string().describe('Capability slug from a search_capabilities hit'),
      params: z.record(z.any()).optional().describe('Parameters matching the hit\'s params JSON-Schema'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional tab id; omit to use the active/owned tab'),
    },
    async ({ slug, params, tab_id }) => {
      if (!bridge.isConnected) return mapFSBError({ success: false, error: 'extension_not_connected' });
      return queue.enqueue('invoke_capability', async () => {        // serialized (not in readOnlyTools)
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = { slug, params: params || {} };
        if (tab_id !== undefined) payload.tab_id = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge, agentScope, 'mcp:capabilities-invoke', payload,
          { timeout: 30_000, targetTabId },
        );
        return mapFSBError(result);
      });
    },
  );
}
```
Then in `runtime.ts` (after `registerVaultTools(...)` at :42): `registerCapabilityTools(server, bridge, queue, agentScope);`
And in `queue.ts` readOnlyTools Set (:30-45): add `'search_capabilities',`.

### `capability-search.js` -- MiniSearch build/snapshot/restore + slug->recipe map (Pattern 2/3)
```javascript
// Dual-export IIFE shell -- mirror of capability-interpreter.js:1-2,374-385
(function(global) {
  'use strict';

  // Construction options MUST be reused verbatim at loadJSON (vendored minisearch throws otherwise).
  var INDEX_OPTIONS = {
    idField: 'slug',
    fields: ['intentSynonyms', 'description', 'service', 'actionVerb'], // searchable
    storeFields: ['slug', 'service', 'sideEffectClass', 'description'],  // returned on hit
    // extractField default handles arrays by joining; intentSynonyms[] is fine.
  };
  var STORAGE_KEY = 'fsbCapabilityIndex';
  var ORIGIN_BOOST = 4; // Claude's Discretion -- tune via eval

  function _getMiniSearch() {
    return (typeof MiniSearch !== 'undefined' && MiniSearch) ? MiniSearch : null;   // UMD global (background.js:120)
  }
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
  // Catalog source: the build-time generated dual-export IIFE (D-16) OR a fetch fallback.
  function _getCatalog() {
    return (typeof FsbRecipeIndex !== 'undefined' && FsbRecipeIndex) ? FsbRecipeIndex : { recipes: [], descriptors: [] };
  }

  var _ms = null;            // MiniSearch instance
  var _slugToRecipe = {};    // slug -> recipe (for invoke + schema-on-hit)

  // D-02: derive sideEffectClass from the recipe method (cross-check the descriptor).
  function deriveSideEffect(method) {
    var m = String(method || '').toUpperCase();
    if (m === 'DELETE') return 'destructive';
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'mutate';
    return 'read'; // GET/HEAD
  }

  async function buildOrRestore() {
    var MS = _getMiniSearch();
    if (!MS) return false;
    var cat = _getCatalog();
    var descriptors = cat.descriptors || [];
    // slug -> recipe map (invoke lookup + schema-on-hit params)
    _slugToRecipe = {};
    (cat.recipes || []).forEach(function(r) { if (r && r.id) _slugToRecipe[r.id] = r; });

    var catalogVersion = String(descriptors.length) + ':' + (cat.version || ''); // simple hash; tune as needed
    var c = _getChrome();
    // 1. Try snapshot restore on version match (D-05).
    if (c && c.storage && c.storage.local) {
      try {
        var stored = await c.storage.local.get(STORAGE_KEY);
        var snap = stored && stored[STORAGE_KEY];
        if (snap && snap.catalogVersion === catalogVersion && snap.index) {
          _ms = MS.loadJSON(JSON.stringify(snap.index), INDEX_OPTIONS); // SAME options -- mandatory
          return true;
        }
      } catch (e) { /* fall through to rebuild */ }
    }
    // 2. Rebuild + snapshot.
    _ms = new MS(INDEX_OPTIONS);
    _ms.addAll(descriptors.map(function(d) {
      return {
        slug: d.slug, service: d.service, intentSynonyms: d.intentSynonyms || [],
        description: d.description || '', actionVerb: d.actionVerb || '',
        sideEffectClass: d.sideEffectClass || deriveSideEffect((_slugToRecipe[d.slug] || {}).method),
      };
    }));
    if (c && c.storage && c.storage.local) {
      try { await c.storage.local.set({ [STORAGE_KEY]: { catalogVersion: catalogVersion, index: _ms.toJSON() } }); }
      catch (e) { /* best-effort */ }
    }
    return true;
  }

  // SURF-01: ranked, origin-biased, schema-on-hit results (<=topN).
  function search(query, ownedOrigin, topN) {
    if (!_ms) return [];
    var ownedService = null;
    try { ownedService = ownedOrigin ? new URL(ownedOrigin).host : null; } catch (e) { ownedService = null; }
    var hits = _ms.search(String(query || ''), {
      combineWith: 'OR',                          // any matching term contributes (recall)
      prefix: true, fuzzy: 0.2,
      boost: { intentSynonyms: 3, description: 1 },
      boostDocument: function(id, term, stored) {  // origin bias lever (D-11)
        return (ownedService && stored && stored.service && stored.service.indexOf(ownedService) !== -1) ? ORIGIN_BOOST : 1;
      },
    });
    var k = Math.max(1, Math.min(Number(topN) || 5, 5));
    return hits.slice(0, k).map(function(h) {
      var recipe = _slugToRecipe[h.slug] || {};
      return {
        slug: h.slug, service: h.service, sideEffectClass: h.sideEffectClass,
        description: h.description, score: h.score,
        params: recipe.params || null,            // schema-on-hit (D-08)
      };
    });
  }

  function getRecipeBySlug(slug) { return _slugToRecipe[slug] || null; }

  var exportsObj = { buildOrRestore: buildOrRestore, search: search, getRecipeBySlug: getRecipeBySlug, deriveSideEffect: deriveSideEffect };
  global.FsbCapabilitySearch = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
Load order in `background.js` (after `capability-fetch.js` at :143): `try { importScripts('catalog/recipe-index.generated.js'); } catch (e) {...}` then `try { importScripts('utils/capability-search.js'); } catch (e) {...}` then call `FsbCapabilitySearch.buildOrRestore()` at startup.

### Dispatcher route + handler (Pattern 4) -- read-only search + queued invoke
```javascript
// Add to MCP_PHASE199_MESSAGE_ROUTES (mcp-tool-dispatcher.js:84-116):
'mcp:capabilities-search': { routeFamily: 'capabilities', handler: handleCapabilitiesSearchMessageRoute },
'mcp:capabilities-invoke': { routeFamily: 'capabilities', handler: handleCapabilitiesInvokeMessageRoute },

// Handlers -- modeled on handleSearchMemoryMessageRoute (:2141-2159):
async function handleCapabilitiesSearchMessageRoute({ payload }) {
  if (typeof FsbCapabilitySearch === 'undefined' || typeof FsbCapabilitySearch.search !== 'function') {
    return createMcpRouteError('search_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability search unavailable' });
  }
  // Resolve owned-tab origin SW-side (un-spoofable); payload.origin is an optional override only.
  var ownedOrigin = payload.origin || null;
  if (!ownedOrigin) {
    try {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      ownedOrigin = (tabs[0] && tabs[0].url) ? new URL(tabs[0].url).origin : null;   // capability-fetch.js:285-291 pattern
    } catch (e) { ownedOrigin = null; }
  }
  var topN = boundedPositiveInt(payload.topN, 5, 5);                                  // :1413 helper
  var results = FsbCapabilitySearch.search(payload.query || '', ownedOrigin, topN);
  return { success: true, results: results };                                         // search_memory return shape
}

async function handleCapabilitiesInvokeMessageRoute({ payload }) {
  if (typeof FsbCapabilitySearch === 'undefined' || typeof FsbCapabilityInterpreter === 'undefined' || typeof FsbCapabilityFetch === 'undefined') {
    return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability engine unavailable' });
  }
  var recipe = FsbCapabilitySearch.getRecipeBySlug(payload.slug);
  if (!recipe) return { success: false, code: 'RECIPE_NOT_FOUND', errorCode: 'RECIPE_NOT_FOUND', error: 'RECIPE_NOT_FOUND', slug: payload.slug };
  var interpreted = FsbCapabilityInterpreter.interpretRecipe(recipe, payload.params || {});
  if (!interpreted || interpreted.success !== true) return interpreted;               // typed RECIPE_* verbatim
  // Resolve tabId: explicit payload.tab_id, else active/owned tab.
  var tabId = Number.isFinite(payload.tab_id) ? payload.tab_id : null;
  if (tabId === null) {
    try { var t = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = t[0] ? t[0].id : null; } catch (e) { tabId = null; }
  }
  return await FsbCapabilityFetch.executeBoundSpec(interpreted.spec, tabId);          // {success,status,finalUrl,redirected,data,text}
}
```

### Bridge delegating handlers (mcp-bridge-client.js) -- modeled on `_handleSearchMemory` (:1657-1664)
```javascript
// In the _handleMessage switch (:455-509):
case 'mcp:capabilities-search': return this._handleCapabilitiesSearch(payload);
case 'mcp:capabilities-invoke': return this._handleCapabilitiesInvoke(payload);
// Handler bodies:
async _handleCapabilitiesSearch(payload) {
  const r = await dispatchMcpMessageRoute({ type: 'mcp:capabilities-search', payload, client: this });
  return r || {};
}
async _handleCapabilitiesInvoke(payload) {
  const r = await dispatchMcpMessageRoute({ type: 'mcp:capabilities-invoke', payload, client: this });
  return r || {};
}
```

### Descriptor doc shape (D-01) -- `catalog/descriptors/github-notifications.json`
```json
{
  "slug": "github.notifications",
  "service": "github.com",
  "intentSynonyms": ["show my github notifications", "check github alerts", "list unread github notifications", "what's new on github"],
  "description": "List your unread GitHub notifications",
  "actionVerb": "list",
  "sideEffectClass": "read"
}
```
(`slug` MUST equal the recipe `id`; `sideEffectClass` cross-checked against the recipe `method` GET -> "read" at index-build, D-02.)

### Eval fixture + gate (Pattern 5) -- `tests/capability-search-eval.test.js` sketch
```javascript
// Zero-framework, modeled on tests/capability-interpreter.test.js convention + edge_prompts.md precedent.
const assert = require('assert');
const MiniSearch = require('../extension/lib/minisearch.min.js'); // UMD require works in Node
const FIXTURES = require('../catalog/descriptors/_fixtures/intent-cases.json'); // [{ intent, expectedSlug }, ...]
const DESCRIPTORS = require('../catalog/descriptors/_fixtures/seed-descriptors.json');
// ... build index with the SAME INDEX_OPTIONS as capability-search.js ...
let hit = 0, wrongInvoke = 0;
for (const f of FIXTURES) {
  const hits = ms.search(f.intent, { combineWith: 'OR', prefix: true, fuzzy: 0.2, boost: { intentSynonyms: 3 } });
  const top5 = hits.slice(0, 5).map(h => h.id);
  if (top5.includes(f.expectedSlug)) hit++;                  // recall@5
  if (hits[0] && hits[0].id !== f.expectedSlug) wrongInvoke++; // top-1 mis-invoke
}
const recall = hit / FIXTURES.length;
const wrongRate = wrongInvoke / FIXTURES.length;
console.log(`recall@5=${recall.toFixed(3)} wrong-invoke=${wrongRate.toFixed(3)}`);
assert(recall >= 0.9, `recall@5 ${recall} < 0.9`);
assert(wrongRate === 0, `wrong-invoke ${wrongRate} != 0`);    // non-negotiable (D-13)
process.exit(0);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Expose every capability as an MCP tool schema (the OpenTabs ~2,769-tool model) | Two-tool progressive disclosure (`search_capabilities` -> `invoke_capability`); the model queries into a search index, never sees the full catalog as schemas | This milestone (v0.9.99) | Keeps the MCP context lean; the catalog can grow without bloating the tool list. `[CITED: .planning/research/ARCHITECTURE.md:128]` |
| `String.includes()` / substring matching for tool lookup | minisearch BM25 + prefix + fuzzy + field/document boosting | This phase | Real intent recall; origin bias via `boostDocument`; persisted index. `[CITED: .planning/research/STACK.md:165-170]` |
| Per-recipe static MCP schema | Generic `{slug, params?, tab_id?}` + SW-side per-recipe validation | This phase | A static `server.tool()` schema cannot express dynamic per-recipe params; validation moves to `interpretRecipe`. |

**Deprecated/outdated:**
- The autopilot `tool-executor.js` parity branch + `capability-router.js` referenced in `ARCHITECTURE.md` Decision A is **Phase 29, NOT Phase 28**. Phase 28's `invoke_capability` is the DIRECT routerless path. Do not implement the router here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `boostDocument(documentId, term, storedFields)` is the cleanest origin-bias lever and reads `storedFields` | Pattern 3, Code Examples | LOW -- both `boost` (field) and `boostDocument` are confirmed present in the vendored source; the exact `boostDocument` arg names are inferred from source usage (`boostDocumentFn(documentId, ...)`). If the signature differs, fall back to a post-`search` re-rank by `service`. Verify against the actual stored-field passthrough when implementing. |
| A2 | `wrong-invoke rate` = (# fixtures where top-1 slug != expectedSlug) / (# fixtures) | Pattern 5, Validation Architecture | LOW -- this is the natural operationalization of PITFALLS' "wrong-invoke" for a deterministic (no-live-model) harness. The planner/discuss may refine to count only mutating/destructive top-1 mismatches, but the stricter all-fixtures definition is safer and matches "zero-wrong-invoke non-negotiable." |
| A3 | The build-time generated `extension/catalog/recipe-index.generated.js` IIFE (vs runtime `fetch`) is the MV3-cold-start-safe catalog-ship option | Summary, Pitfall 4, Project Structure | LOW -- D-16 explicitly lists this as Claude's Discretion and flags the `fetch` path as fragile. Either works; the generated-IIFE is recommended but not mandated. |
| A4 | `chrome.storage.local['fsbCapabilityIndex']` does not collide with any existing key | Runtime State Inventory | LOW -- verified by grep (key is absent today); but the full set of runtime storage keys was not exhaustively enumerated. A pre-implementation grep for `fsbCapabilityIndex` confirms. |
| A5 | A simple `descriptors.length + ':' + version` is an adequate `catalogVersion` stamp | Code Examples (Pattern 2) | LOW -- a content hash (e.g. of the serialized descriptor array) is more robust against same-count edits; the planner may upgrade. Functionally non-blocking. |

**Note:** Every item above is LOW risk. The DECISIONS themselves (from CONTEXT.md) are locked, not assumed; these assumptions are implementation-detail choices within Claude's Discretion areas.

## Open Questions

1. **Exact `boostDocument` callback signature in minisearch 7.2.0**
   - What we know: the vendored source contains both `options.boost` (field map) and a `boostDocumentFn(documentId, term, storedFields)` form (confirmed by `grep`).
   - What's unclear: the precise positional args and whether `storedFields` is the 3rd arg in this exact build.
   - Recommendation: when implementing, log the args once against the seeded index, or consult the minisearch 7.2.0 README `boostDocument` entry; fall back to a post-search re-rank by `service` if the signature differs. Non-blocking (the field `boost` lever alone is sufficient for a first pass).

2. **k and threshold tuning for the gate**
   - What we know: D-13 fixes recall@5>=0.9 AND wrong-invoke=0; k and the 0.9 are Claude's Discretion if evidence supports deviation.
   - What's unclear: whether a sparse synthetic seed of ~6-12 capabilities will trivially hit recall@5=1.0 (defeating the point) or expose ranking weaknesses.
   - Recommendation: seed enough NEAR-NEIGHBOR capabilities (e.g. multiple "send"/"post"/"message" services) that the top-1 disambiguation is non-trivial -- the harness must be able to FAIL on a naive index. Validate the seed actually stresses ranking before locking the threshold.

3. **Catalog packaging CI proof**
   - What we know: the catalog must ship (D-16); `package-extension.mjs` zips `extension/` only.
   - What's unclear: the exact CI assertion shape that proves the packaged artifact contains the catalog.
   - Recommendation: add a smoke assertion (in `tests/capability-mcp-surface.test.js` or a packaging test) that the generated `recipe-index.generated.js` exists and exports a non-empty `descriptors` array after the build step, OR that the zip entry list includes `catalog/`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | Eval harness + all tests + MCP build | ✓ | >=18.20.0 (engines) | -- |
| `npm` (mcp build) | `npm --prefix mcp run build` in test chain | ✓ | bundled | -- |
| `zip` CLI | `package-extension.mjs` (existing) | ✓ (assumed; existing dependency) | -- | `package-extension.mjs` already `fail`s with a clear message if absent |
| `minisearch` (vendored) | `capability-search.js` index | ✓ | 7.2.0 (`extension/lib/minisearch.min.js`) | -- |
| `@cfworker/json-schema` (vendored) | SW-side param validation | ✓ | 4.1.1 (IIFE) | -- |
| `jmespath` (vendored) | extract (Phase 27, reused) | ✓ | 0.16.0 | -- |
| Chrome/live extension | LIVE invoke against a real authenticated session | ✗ in CI | -- | The CI eval is index-recall only (no browser); a live invoke smoke is human-gated UAT (mirrors FETCH-05/UAT-27-01). |

**Missing dependencies with no fallback:** none -- all build/test deps are present; the live-browser invoke is intentionally a human-gated UAT, not a CI dependency.
**Missing dependencies with fallback:** the live authenticated invoke (Chrome) -> deterministic CI index-recall eval + a human-gated live smoke (consistent with the milestone's existing live-UAT ledger).

## Validation Architecture

> `nyquist_validation` key is ABSENT from `.planning/config.json` -> treated as ENABLED. This section feeds VALIDATION.md (Dimension 8).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Zero-framework Node test scripts (the FSB convention: each `tests/*.test.js` is a standalone `node` file that prints PASS/FAIL and `process.exit(1)` on failure) |
| Config file | none -- tests are `&&`-chained in `package.json` `test` script (`:17`) |
| Quick run command | `node tests/capability-search-eval.test.js` (single test) |
| Full suite command | `npm test` (the full `&&`-chain; also runs in `npm run ci` via `:32`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SURF-01 | search returns <=5 ranked, schema-on-hit, origin-biased hits | unit | `node tests/capability-search-eval.test.js` (asserts hits<=5, each carries `params`+`sideEffectClass`; origin-bias fixture: a tab-origin-matched capability outranks a generic one) | ❌ Wave 0 |
| SURF-02 | invoke runs slug->interpret->execute and returns `{success,status,...}` or typed error | unit | `node tests/capability-mcp-surface.test.js` (mocks `executeBoundSpec`; asserts the routerless path calls `interpretRecipe` then `executeBoundSpec`; unknown slug -> `RECIPE_NOT_FOUND`) | ❌ Wave 0 |
| SURF-03 | both tools on wire; registry hash UNCHANGED | unit | `node tests/capability-mcp-surface.test.js` (the built MCP module exposes `search_capabilities`+`invoke_capability`) AND `node tests/tool-definitions-parity.test.js` (existing -- `EXPECTED_NON_TRIGGER_REGISTRY_HASH` still equal) | parity test EXISTS; surface test ❌ Wave 0 |
| SURF-04 | index over synonyms+service+verb+side-effect; `toJSON`/`loadJSON` round-trip; snapshot to `chrome.storage.local` | unit | `node tests/capability-search-eval.test.js` (round-trip: build -> `toJSON` -> `loadJSON(json, OPTIONS)` -> identical search results; version-mismatch -> rebuild) | ❌ Wave 0 |
| SURF-05 | search bypasses queue; invoke serialized | unit | `node tests/capability-mcp-surface.test.js` (assert `'search_capabilities'` is in the `readOnlyTools` set / bypasses; `'invoke_capability'` enqueues) -- reuse the queue-behavior assertion style | ❌ Wave 0 |
| SURF-06 | recall@5>=0.9 AND wrong-invoke=0 over the seeded fixture set | unit (gate) | `node tests/capability-search-eval.test.js` (the milestone gate; `process.exit(1)` if either threshold fails) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node tests/capability-search-eval.test.js && node tests/capability-mcp-surface.test.js` (the two NEW phase tests -- fast, no browser).
- **Per wave merge:** `npm test` (full chain incl. `tool-definitions-parity`, `recipe-path-guard`, `capability-*`, and the MCP build) + `node scripts/verify-recipe-path-guard.mjs` (via `validate:extension`).
- **Phase gate:** full `npm run ci` green (validate:extension + npm test + mcp-smoke + showcase) before `/gsd:verify-work`. INV-01 hash unchanged, recall@5>=0.9, wrong-invoke=0, snapshot round-trip green, read-only-bypass behavior asserted.

### Wave 0 Gaps
- [ ] `tests/capability-search-eval.test.js` -- covers SURF-01, SURF-04, SURF-06 (recall@k + wrong-invoke gate + round-trip).
- [ ] `tests/capability-mcp-surface.test.js` -- covers SURF-02, SURF-03, SURF-05 (2 tools on wire + registry hash unchanged + queue split + RECIPE_NOT_FOUND).
- [ ] `catalog/descriptors/_fixtures/seed-descriptors.json` + `catalog/descriptors/_fixtures/intent-cases.json` -- the synthetic head capabilities + intent->slug pairs (D-14 seeding; must stress ranking with near-neighbors).
- [ ] Append both new tests to the `package.json` `test` `&&`-chain (after the existing `capability-fetch.test.js`).
- [ ] No framework install needed (zero-framework convention).

## Security Domain

> `security_enforcement` is not explicitly `false` in config -> included. This is an authenticated-capability surface (auth replay), so the security framing is load-bearing.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Two-point origin-pin already enforced in the engine (`interpretRecipe` :338-357 + `executeBoundSpec` :276-298); Phase 28 invoke inherits it -- do NOT add a new fetch path that bypasses the pin. |
| V4 Access Control | yes (partial) | Phase 28 runs UNGATED (consent gate is Phase 30) but the owned-tab origin-pin still holds (the model cannot invoke against an origin it doesn't own a tab for). The origin used for bias is resolved SW-side, not model-supplied. |
| V5 Input Validation | yes | `invoke_capability` params validated SW-side against `recipe.params` via the cfworker Validator (`interpretRecipe`); `search_capabilities` query is a plain string into minisearch (no injection surface -- minisearch is a pure index, no eval). topN clamped via `boundedPositiveInt`. |
| V6 Cryptography | no | No new crypto in Phase 28 (recipe signature verification is Phase 30/SIGN-01). |
| V7 Error Handling | yes | Typed `RECIPE_*` errors surface verbatim (`errors.ts:137`); the result shape never leaks cookies/auth (the page-world func returns only non-secret response data -- `capability-fetch.js:207-215`). |

### Known Threat Patterns for {MV3 extension + authenticated API replay + search index}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Model spoofs `origin` to bias toward / invoke a high-stakes service it doesn't own | Spoofing / Elevation | Resolve owned-tab origin SW-side (`new URL(tab.url).origin`); treat the `origin` param as a non-authoritative override; the engine's active-tab origin-pin rejects a wrong-tab invoke (`executeBoundSpec` :291-298). |
| Wrong-but-plausible capability auto-fires a destructive call with real credentials | Tampering | `sideEffectClass` surfaced in every hit (D-03) for model disambiguation; eval gate `wrong-invoke=0` (D-13); (enforced disambiguation-before-mutate is Phase 30). |
| A poisoned/oversized descriptor injects code via the index | Tampering / EoP | Descriptors are pure data into minisearch (no eval); the recipe schema is closed-vocab + CI-guarded (Phase 26); `capability-search.js` is on the recipe-path allowlist and scanned for `eval`/`new Function`/`import(`. |
| Stale snapshot serves a deleted/renamed capability | Tampering (integrity) | `catalogVersion` stamp on the `chrome.storage.local` snapshot; rebuild+re-snapshot on mismatch (D-05). |
| Auth material leaks via the result payload or the index | Information Disclosure | The page-world func returns only non-secret response data (`capability-fetch.js:207-215`); the index stores only descriptor metadata (no response bodies, no auth). |
| Search query bloats the MCP context (anti-bloat invariant) | DoS (context) | Progressive disclosure: results capped at <=5 hits with one-line descriptions; the full catalog is never exposed as tool schemas. |

## Sources

### Primary (HIGH confidence)
- `extension/lib/minisearch.min.js` (vendored UMD source) -- API surface verified: `loadJSON(json, options)` (options MANDATORY, throws otherwise), `toJSON`, `addAll`, `search` with `boost`/`boostDocument`/`combineWith`/`fuzzy`/`prefix`/`filter`, `storeFields`/`fields`/`idField`/`searchOptions`. Global `MiniSearch`.
- `npm view minisearch version` -> `7.2.0` (run 2026-06-20) -- matches vendored copy + STACK.md.
- `mcp/src/tools/vault.ts:20-130` -- out-of-`TOOL_REGISTRY` `server.tool()` precedent + `queue.enqueue` serialize.
- `mcp/src/tools/observability.ts:84-111` -- `search_memory` read-only progressive-disclosure data-tool precedent.
- `mcp/src/queue.ts:24-64` -- `readOnlyTools` Set + bypass-in-`enqueue` mechanism (the search bypass lever).
- `mcp/src/runtime.ts:30-48` -- `registerVaultTools` call-site shape.
- `mcp/src/errors.ts:137` -- `/^(...|RECIPE_.+|...)$/` verbatim passthrough (free `RECIPE_NOT_FOUND`).
- `mcp/src/tools/schema-bridge.ts:78-132` -- `jsonSchemaToZod` (confirmed it does NOT handle `type:'object'` -> hand-write the invoke zod shape).
- `extension/utils/capability-interpreter.js:236-370` -- `interpretRecipe` (validates args :264-292, returns `{success,spec}` or typed `RECIPE_*`).
- `extension/utils/capability-fetch.js:228,272-385` -- `MUTATING_METHODS` (side-effect derivation), `executeBoundSpec` result shape, tab-origin resolution (:285-291).
- `extension/ws/mcp-tool-dispatcher.js:84-116` (`MCP_PHASE199_MESSAGE_ROUTES`), `:462-511` (`dispatchMcpMessageRoute`), `:2141-2159` (`handleSearchMemoryMessageRoute` template), `:1413` (`boundedPositiveInt`), `:178-188` (`_resolveTabIdForGate` -- only resolves explicit tabId).
- `extension/ws/mcp-bridge-client.js:455-509` (switch), `:517-520` (`_getActiveTab`), `:1657-1664` (`_handleSearchMemory` delegate template).
- `extension/background.js:119-143` -- `importScripts` order (`minisearch.min.js:120`; capability family :122-143).
- `scripts/verify-recipe-path-guard.mjs:85-98` (`RECIPE_PATH_ALLOWLIST`), `:264-312` (Check 4 disk-drift fail-closed).
- `scripts/package-extension.mjs:55-59` -- zips `extension/` only; `catalog/` NOT included (D-16 gap confirmed).
- `tests/tool-definitions-parity.test.js:52,124-131` -- frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` + registry-size assertions (INV-01).
- `tests/mcp-version-parity.test.js:25,66-76` -- `canonicalVersion='0.10.0'` + the 5 version-locked files.
- `package.json:17,32` -- the `test` `&&`-chain (ends with `capability-*.test.js`) + `ci` runs `npm test`.
- `catalog/recipes/github-notifications.json`, `catalog/recipes/_fixtures/valid-recipe.json` -- recipe shape (`params`/`request`/`extract`); `node -e` confirms `TOOL_REGISTRY.length===55`.
- `extension/test-data/edge-cases/edge_prompts.md` (70 lines, ~50 intent prompts) -- eval-harness fixture precedent.

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md:106-128,166-177,338-341` -- Decision A (out-of-registry), progressive disclosure, tab-origin bias, Anti-Pattern 1 (cross-checked against the live tree; note the router/autopilot-parity items are Phase 29).
- `.planning/research/PITFALLS.md:245-282` -- Pitfall 6 (recall/precision + eval gate).
- `.planning/research/STACK.md:89,165-170,231-234,284` -- minisearch field boosting, `toJSON`/`loadJSON`, alternatives rejected.

### Tertiary (LOW confidence)
- minisearch 7.2.0 `boostDocument` exact arg signature -- inferred from vendored source usage (`boostDocumentFn(documentId, ...)`); confirm at implementation (Open Question 1).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- minisearch 7.2.0 confirmed on npm AND in the vendored source; all other deps already shipped/wired.
- Architecture (registration, routes, queue split, invoke path): HIGH -- every seam is a verified clone of an existing tested pattern (`vault.ts`, `observability.ts`, `handleSearchMemoryMessageRoute`, `executeBoundSpec`).
- Index build/snapshot/restore: HIGH -- `loadJSON(json, options)` constraint verified directly from the shipped library source (it throws without the options arg).
- Catalog shipping: HIGH on the gap (confirmed `package-extension.mjs` excludes `catalog/`); MEDIUM on the exact recommended mechanism (generated IIFE vs fetch is Claude's Discretion).
- Eval harness: HIGH on the convention + precedent; MEDIUM on the exact wrong-invoke operationalization (Assumption A2) and seed difficulty (Open Question 2).
- Pitfalls: HIGH -- all five are grounded in verified live-tree mechanisms (parity hash, Check 4, loadJSON throw, packaging boundary, Pitfall 6).

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable -- all dependencies vendored/pinned; the only fast-moving item is minisearch, pinned at the vendored 7.2.0).
