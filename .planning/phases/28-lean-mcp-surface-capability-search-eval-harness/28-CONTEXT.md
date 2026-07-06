# Phase 28: Lean MCP Surface + Capability Search + Eval Harness - Context

**Gathered:** 2026-06-20 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose the Phase 26/27 capability engine through a **lean two-tool MCP wire surface** using **progressive disclosure** (`search_capabilities` -> `invoke_capability`) that never bloats the MCP context, and stand up the **search/index whose quality is the catalog's ceiling** -- gated by an **eval harness** (recall@k + wrong-invoke rate). This is research slot **P2 / "Phase 27"** (the research files use pre-final numbering: research "Phase 27" == this actual **Phase 28**; research "Phase 28" == actual Phase 29).

**In scope (SURF-01..06):**
- `search_capabilities` (read-only): ranked, schema-on-hit results (<=5) for an intent query, biased by the owned tab's origin (SURF-01).
- `invoke_capability`: executes a selected capability by slug with validated params, returns a structured result (SURF-02).
- Both tools register OUTSIDE `TOOL_REGISTRY` via `server.tool()`, keeping the existing ~63 MCP tool schemas byte-identical (INV-01) (SURF-03).
- A persisted `minisearch` index over intent synonyms + service + action verb + side-effect class, snapshotted to `chrome.storage.local` (SURF-04).
- `search_capabilities` is read-only and bypasses the mutation queue; `invoke_capability` is serialized through it (SURF-05).
- An eval harness measuring recall@k + wrong-invoke rate, with the milestone gated on thresholds (SURF-06).

**Explicitly NOT in this phase:**
- The full tiered `capability-router.js` (T0 model-prior / T1a bundled imperative head / T1b declarative tail / T2 learned / T3 DOM fallback), the catalog **registry**, and the **autopilot `tool-executor.js` parity branch** -- all **Phase 29**. Phase 28's `invoke_capability` connects search -> the EXISTING Phase 27 primitive DIRECTLY (slug -> recipe lookup -> `interpretRecipe` -> `executeBoundSpec`), with NO router.
- The **consent gate** (Off/Ask/Auto), **audit log**, **recipe signature verification**, and **disambiguation-before-mutate** enforcement -- all **Phase 30**. Phase 28 invoke runs UNGATED like Phase 27's hardcoded path -- but the two-point **origin-pin still holds**.
- **CDP Network discovery / recipe synthesis / learned recipes** -- **Phase 31**. **Self-healing DOM fallback / recipe-rot / 7-provider parity gate** -- **Phase 32**.
</domain>

<decisions>
## Implementation Decisions

### Search Descriptor & Index Field Source (SURF-04)
- **D-01:** The minisearch index is populated from a **NEW separate capability-descriptor document shape** (one per capability, keyed by recipe `slug`/`id`), NOT from the recipe itself. The descriptor carries the intent/human-facing fields: `slug`, `service`, `intentSynonyms[]`, `description`, `actionVerb`, `sideEffectClass`. The **Phase 26 closed recipe schema stays byte-untouched** -- adding synonyms/description would edit a locked, CI-guarded vocabulary (`capability-recipe-schema.js` is on `RECIPE_PATH_ALLOWLIST`; the one real recipe `catalog/recipes/github-notifications.json` carries no such fields). Recommended location: `catalog/descriptors/*.json` (or a slug-keyed `searchDescriptor` block in a catalog manifest).
- **D-02:** `service`, `actionVerb`, and `sideEffectClass` are AUTHORED in the descriptor but **cross-checked against recipe-derived values at index-build time** (descriptor = the synonym/description carrier; derivation = the integrity check). `sideEffectClass` derives from the frozen `method`: **GET/HEAD = read, POST/PUT/PATCH = mutate, DELETE = destructive** -- mirroring the existing `MUTATING_METHODS = {POST,PUT,PATCH,DELETE}` set at `capability-fetch.js:228`. `service` derives from `origin` host + `id` namespace. Indexing terse endpoint names alone is the #1 recall-failure mode (PITFALLS Pitfall 6) -- intent synonyms are mandatory.
- **D-03:** The `sideEffectClass` (read/mutate/destructive) is **surfaced in every `search_capabilities` result** so the model can disambiguate before invoking. (Enforced disambiguation-before-mutate is a Phase 30 consent concern; Phase 28 only makes the class *visible*.)

### Search/Index Module & Persistence (SURF-04, SURF-05)
- **D-04:** A **NEW SW module `extension/utils/capability-search.js`** (dual-export IIFE, mirroring `capability-interpreter.js` / `capability-fetch.js`) owns the `MiniSearch` instance and the **slug -> recipe map**. It MUST be added to `RECIPE_PATH_ALLOWLIST` (`scripts/verify-recipe-path-guard.mjs:84-97`) and stay **eval-free** (it touches recipe/descriptor data; Check 4 fails CLOSED on any `extension/utils/capability-*.js` missing from the allowlist). The interpreter stays purity-bound (validate+bind+STOP, no `chrome.storage`) -- the index does NOT live inside it.
- **D-05:** The index builds at SW startup via `addAll(descriptors)`, snapshots via `MiniSearch.prototype.toJSON` to `chrome.storage.local` under key **`fsbCapabilityIndex`** alongside a stored **`catalogVersion`/hash**, and reloads via `MiniSearch.loadJSON(json, options)` when the version matches -- else rebuilds and re-snapshots. (`minisearch.min.js` is already vendored + loaded at `background.js:120` but "not wired until Phase 28"; the API surface `loadJSON`/`toJSON`/`addAll`/`search`/`boost`/`combineWith`/`fuzzy`/`prefix`/`storeFields`/`searchableFields`/`extractField` is confirmed present.) Avoid rebuild-on-every-wake (cold-start latency + SW-eviction regression).

### Invoke Execution Path & Result Shape (SURF-02)
- **D-06:** `invoke_capability` runs the **DIRECT Phase-27 path with NO Phase-29 router**: `slug -> capability-search slug->recipe lookup -> FsbCapabilityInterpreter.interpretRecipe(recipe, args) -> FsbCapabilityFetch.executeBoundSpec(spec, tabId)`. Param validation happens **SW-side inside `interpretRecipe`** (against `recipe.params`, via the fresh cfworker Validator at `capability-interpreter.js:307-369`).
- **D-07:** The **structured result** returned to MCP is the existing `executeBoundSpec` normalized shape `{ success, status, finalUrl, redirected, data, text }` (`capability-fetch.js:377-385`), or the dual-field typed error on failure. A **bad/unknown slug returns a new `RECIPE_NOT_FOUND`** that surfaces verbatim for free via the `/^RECIPE_.+$/` passthrough at `mcp/src/errors.ts:137` (no errors.ts edit needed; `RECOVERY_AMBIGUOUS` is already whitelisted at `errors.ts:71`).
- **D-08 (schema-on-hit):** `search_capabilities` returns the matched recipe's **`params` JSON-Schema in the hit payload** so the model can construct valid `invoke_capability` args in one round-trip (no extra schema fetch). The recipe already carries the `params` sub-document the interpreter validates against.

### MCP Registration, Read-Only Split & Tab-Origin Bias (SURF-01, SURF-03, SURF-05)
- **D-09:** A **NEW `mcp/src/tools/capabilities.ts`** exports `registerCapabilityTools(server, ...)`, called from `mcp/src/runtime.ts` alongside the other `register*Tools` (vault call-site precedent at `runtime.ts:36-43`). **Both tools register via `server.tool()` OUTSIDE `TOOL_REGISTRY`** -- the `vault.ts:20-48` "explicit security boundary" precedent. This is what keeps INV-01 intact: the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (`tests/tool-definitions-parity.test.js`) never moves because the registry list never changes.
- **D-10:** `search_capabilities` zod shape `{ query: string, origin?: string, topN?: number }`, **joins the `readOnlyTools` set in `mcp/src/queue.ts:30-52`** (the `search_memory` bypass precedent) so discovery never parks behind an in-flight mutation; bridges to a **read-only `mcp:capabilities-search`** route. `invoke_capability` uses a **GENERIC zod shape `{ slug: string, params?: object, tab_id?: number }`** (per-recipe param validation is SW-side, D-06 -- a static `server.tool()` schema cannot express dynamic per-recipe params), is **`queue.enqueue`-serialized**, and bridges to a **queued `mcp:capabilities-invoke`** route. New routes register in `MCP_PHASE199_MESSAGE_ROUTES` (`mcp-tool-dispatcher.js:84-116`) with bridge handlers keyed by message name (`mcp-bridge-client.js:455-509`).
- **D-11 (tab-origin bias):** The owned-tab origin for biasing is **resolved authoritatively SW-side in the dispatcher** (from the ownership registry / `checkOwnershipGate` tab resolution at `mcp-tool-dispatcher.js:178-298`, reading `new URL(tab.url).origin` per the `capability-fetch.js:285-291` pattern) -- the model cannot spoof it -- **AND** an optional `origin` override param is accepted. minisearch applies the bias via field **`boost`** on a `service`/`origin`-matched field at query time. (Read-only `search_capabilities` still resolves the owned-tab origin even though it bypasses the queue.)

### Eval Harness & Milestone Gate (SURF-06)
- **D-12:** The eval harness is a **zero-framework, CI-automated `node tests/capability-search-eval.test.js`** that joins the root `package.json` `test` `&&`-chain (the Phase 26/27 `tests/capability-*.test.js` convention; `npm test` runs in `ci`). It drives a fixtures file of **intent -> expected-slug pairs** and computes **recall@k (k<=5)** + **wrong-invoke rate** over the index.
- **D-13 (gate):** The milestone gate is **recall@5 >= 0.9 AND wrong-invoke = 0**. Zero-wrong-invoke is **non-negotiable** (a mis-invoke is a real authenticated side effect, not a recoverable click -- PITFALLS Pitfall 6). No live model is required: this is pure index-recall measurement, so it runs in CI.
- **D-14 (sparse-catalog seeding):** Because the real catalog is ~1 recipe (`github-notifications.json`), the eval set is **seeded with synthetic head capabilities + descriptors + intent paraphrases** so the harness actually exercises ranking (mirroring how `catalog/recipes/_fixtures/` seeds the Phase 26 schema tests). Indexing only the single real recipe would make recall a trivial 1.0 and prove nothing.

### INV-01 Schema-Lock, Packaging & Catalog Shipping (SURF-03)
- **D-15:** **No `fsb-mcp-server` version bump** is required for two additive out-of-registry tools (pinned `0.10.0`; if the planner DOES bump, the 5 version-locked files enforced by `tests/mcp-version-parity.test.js:65-90` must all move in lockstep). Add a **new `tests/capability-mcp-surface.test.js`** asserting (a) the two new tool names exist on the wire AND (b) the `tool-definitions-parity` registry hash is **unchanged** -- the explicit INV-01 proof for this phase.
- **D-16 (catalog must ship):** `catalog/recipes/` does **NOT currently ship in the extension package** (`scripts/package-extension.mjs` has zero `catalog`/`recipes` references; `background.js` has no recipe-loader). Phase 28 MUST add a **copy step to `package-extension.mjs`** to bundle `catalog/` (recipes + descriptors) into the extension, and load them at SW startup (via `chrome.runtime.getURL` fetch, or a build-time-generated `importScripts` JS manifest). Without this, the index has no data source in a packaged build.

### Claude's Discretion
- Exact descriptor file layout: per-slug `catalog/descriptors/*.json` vs a single slug-keyed manifest (D-01).
- The minisearch field-boost WEIGHTS for origin biasing and the searchable-field list / `combineWith` mode (D-11) -- planner-tunable.
- The exact recall@k `k` and threshold if evidence supports deviating from recall@5 >= 0.9 (D-13) -- but wrong-invoke = 0 is fixed.
- Runtime catalog-load mechanism: packaged-JSON `fetch` vs build-time generated `extension/catalog/recipe-index.generated.js` dual-export IIFE loaded via `importScripts` (D-16) -- the latter avoids MV3 SW cold-start `fetch` fragility if it proves unreliable.
- Whether the slug->recipe map and the descriptor index live in one `capability-search.js` or split (search index vs invoke lookup) -- one module recommended.

### Folded Todos
None -- no pending todos matched Phase 28.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Research (authoritative, dated 2026-06-19; **NB pre-final numbering**: research "Phase 27" == this actual **Phase 28**; research "Phase 28" == actual Phase 29):
- `.planning/research/ARCHITECTURE.md` -- **Decision A** (register the two tools OUTSIDE `TOOL_REGISTRY`, vault precedent; INV-01/INV-02 safe) at :106-128; progressive-disclosure anti-bloat mechanism at :128; tab-origin bias at :166-177; bridge route names `mcp:capabilities-search` (read-only) / `mcp:capabilities-invoke` (queued) at :44-45; component table at :90-125; **Anti-Pattern 1** (do NOT add to `TOOL_REGISTRY`) at :338-341. Note: the `capability-router.js` tiers T0-T3 and `catalog.resolve` (:166-177, P3) are **Phase 29**, NOT here.
- `.planning/research/PITFALLS.md` -- **Pitfall 6** (capability-search recall/precision; index on intent synonyms + service + action verb + side-effect class; scored/ranked/origin-scoped results with side-effect class visible; eval harness recall@k + wrong-invoke gate; the 50-prompt precedent) at :245-282; the "looks done but isn't" checklist at :393-394; risk table at :409-420.
- `.planning/research/FEATURES.md` -- lean tool surface / `search_capabilities(query, [origin])` + schema-on-hit + tab-biasing framing at :39, :99.
- `.planning/research/STACK.md` -- `minisearch@7.2.0` (field boosting = the tab-origin lever; `toJSON`/`loadJSON` snapshot to `chrome.storage.local`); `jmespath` read-only extract; zero-dep bias; What-NOT-to-Use.
- `.planning/research/SUMMARY.md` -- decision-ready synthesis (lines 39, 56, 59, 75, 98-102, 150-151, 170); risk-first ordering.

Roadmap / requirements / prior context:
- `.planning/ROADMAP.md` -- Phase 28 details + **Phase 29 boundary** (router/tiers/autopilot parity is Phase 29); INV-01..04; the two architectural Walls.
- `.planning/REQUIREMENTS.md` -- SURF-01..06 (this phase); CAT-01..05 (Phase 29, for the boundary).
- `.planning/phases/26-recipe-schema-bundled-interpreter-mv3-ci-guard/26-CONTEXT.md` -- LOCKED: closed recipe vocabulary (D-06/D-07), forbidden field names, `minisearch` vendored-not-wired (D-03), eval-free validation (D-13), CI-guard allowlist (D-16/D-17).
- `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-CONTEXT.md` -- LOCKED: `capability-fetch.js` (`executeBoundSpec` result shape), two-point origin-pin (D-08), `interpretRecipe` fold+pin (D-08/D-09), `RECOVERY_AMBIGUOUS` passthrough (D-12), the one real `github-notifications` recipe.

Source anchors (verified on `automation-worktree`, 2026-06-20):
- `mcp/src/tools/vault.ts:20-48` -- out-of-`TOOL_REGISTRY` `server.tool()` security-boundary precedent; `mcp/src/runtime.ts:36-43` -- registration call site.
- `mcp/src/tools/observability.ts:84-110` -- `search_memory` schema-on-hit read-only progressive-disclosure precedent.
- `mcp/src/queue.ts:30-52` -- the `readOnlyTools` set + bypass (`search_capabilities` joins it).
- `mcp/src/tools/schema-bridge.ts` -- `jsonSchemaToZod()` (zod-3) for tool input schemas.
- `mcp/src/errors.ts:71` (`RECOVERY_AMBIGUOUS` whitelisted), `:137` (`/^RECIPE_.+$/` verbatim passthrough -- a new `RECIPE_NOT_FOUND` surfaces free).
- `extension/ws/mcp-tool-dispatcher.js:84-116` (`MCP_PHASE199_MESSAGE_ROUTES` table), `:178-298` (ownership gate + tab/origin resolution), `:462-511` (`dispatchMcpMessageRoute`), `:2141-2159` (`handleSearchMemoryMessageRoute` template).
- `extension/ws/mcp-bridge-client.js:455-509` (handler-by-message-name switch), `:1657-1664` (`_handleSearchMemory` delegating template), `:517-520` (`_getActiveTab`).
- `extension/utils/capability-interpreter.js:236-369` (`interpretRecipe`: arg validation + spec emit, STOPS before network).
- `extension/utils/capability-fetch.js:272-385` (`executeBoundSpec` + normalized result shape), `:228` (`MUTATING_METHODS` -> side-effect class), `:285-291` (tab-origin resolution pattern).
- `extension/utils/capability-recipe-schema.js` -- the CLOSED vocabulary (do NOT edit); `extension/utils/capability-auth-strategies.js` -- frozen enum registry.
- `extension/background.js:119-143` -- vendored-lib + capability-module `importScripts` order (`minisearch.min.js:120`, "not wired until Phase 28").
- `scripts/verify-recipe-path-guard.mjs:84-97` -- `RECIPE_PATH_ALLOWLIST` (new `capability-search.js` MUST join) + Check 4 fail-closed disk drift.
- `tests/tool-definitions-parity.test.js:48-58` -- frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (INV-01 lock); `tests/mcp-version-parity.test.js:65-90` -- the 5 version-locked files; `mcp/package.json:3` (`0.10.0`).
- `catalog/recipes/github-notifications.json:1-9` -- the one real recipe (closed vocab, no synonyms); `catalog/recipes/_fixtures/valid-recipe.json` -- the `params`+`request`+`extract` shape.
- `scripts/package-extension.mjs` -- NO catalog copy today (shipping path absent; D-16 adds it).
- `extension/test-data/edge-cases/edge_prompts.md` -- the 50-prompt eval-harness fixture precedent (SURF-06 model).
- `package.json:17` (`test` chain), `:32` (`ci` -> `npm test`) -- where the eval test wires in.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Out-of-registry `server.tool()` registration** (`mcp/src/tools/vault.ts:20-48` + `runtime.ts:36-43`): the exact INV-01-safe pattern for `capabilities.ts`.
- **`search_memory` progressive disclosure** (`mcp/src/tools/observability.ts:84-110`): the read-only schema-on-hit data-tool precedent for `search_capabilities`.
- **`readOnlyTools` queue bypass** (`mcp/src/queue.ts:30-52`): `search_capabilities` joins it; `invoke_capability` enqueues.
- **Phase 26/27 engine** (`capability-interpreter.js` + `capability-fetch.js`): `interpretRecipe` (validate+bind+pin+emit, STOPS) -> `executeBoundSpec` (the cookie-carrying MAIN-world fetch + normalized result). Phase 28 invoke composes these directly.
- **Vendored `minisearch`** (`extension/lib/minisearch.min.js`, loaded at `background.js:120`): field boosting (`boost`), `toJSON`/`loadJSON` snapshot -- wired for the first time here.
- **Typed-error passthrough** (`mcp/src/errors.ts`): `RECIPE_*` verbatim surface (free `RECIPE_NOT_FOUND`); `RECOVERY_AMBIGUOUS` already whitelisted.
- **Dispatch chokepoint + ownership/tab resolution** (`mcp-tool-dispatcher.js`): the authoritative owned-tab origin for biasing; new route entries in `MCP_PHASE199_MESSAGE_ROUTES`.
- **Zero-framework test convention** (`tests/capability-*.test.js` + `package.json` `test` chain): clones for the eval harness.
- **50-prompt eval precedent** (`extension/test-data/edge-cases/edge_prompts.md`): the metric-gated harness model.

### Established Patterns
- **Dual-export IIFE module shell** (interpreter/fetch/auth-strategies): the shape for `capability-search.js` -- SW global via `importScripts`, `module.exports` for Node tests.
- **CI-guard allowlist is fail-closed:** any new `extension/utils/capability-*.js` absent from `RECIPE_PATH_ALLOWLIST` reds CI (Check 4) -- `capability-search.js` MUST be registered and stay eval-free.
- **Closed recipe vocabulary is frozen:** searchable metadata (synonyms/description/side-effect) lives in a SEPARATE descriptor, never in the recipe.
- **INV-01 via out-of-registry registration:** registry membership = forced dual exposure (autopilot `getPublicTools` + MCP filters) + the frozen parity hash; the two capability tools deliberately avoid it.
- **Side-effect class is latent in `method`:** `MUTATING_METHODS` (`capability-fetch.js:228`) already encodes read-vs-mutate; the descriptor's `sideEffectClass` is cross-checked against it.

### Integration Points
- `mcp/src/tools/capabilities.ts` (NEW) -- `registerCapabilityTools`: `search_capabilities` + `invoke_capability` via `server.tool()`.
- `mcp/src/runtime.ts` (MODIFIED) -- call `registerCapabilityTools` alongside `registerVaultTools` et al.
- `mcp/src/queue.ts` (MODIFIED) -- add `search_capabilities` to `readOnlyTools`.
- `extension/utils/capability-search.js` (NEW) -- MiniSearch index + slug->recipe map + `toJSON`/`loadJSON` persistence; added to `RECIPE_PATH_ALLOWLIST`.
- `extension/ws/mcp-tool-dispatcher.js` (MODIFIED) -- `mcp:capabilities-search` (read-only) + `mcp:capabilities-invoke` (queued) routes; owned-tab origin for bias.
- `extension/ws/mcp-bridge-client.js` (MODIFIED) -- bridge handlers for the two new messages.
- `extension/background.js` (MODIFIED) -- additive `importScripts('utils/capability-search.js')`; catalog load at startup.
- `scripts/verify-recipe-path-guard.mjs` (MODIFIED) -- add `capability-search.js` to `RECIPE_PATH_ALLOWLIST`.
- `scripts/package-extension.mjs` (MODIFIED) -- bundle `catalog/` (recipes + descriptors) into the extension package.
- `catalog/descriptors/*.json` (NEW) -- per-slug search descriptors (synonyms/description/service/actionVerb/sideEffectClass).
- `tests/capability-search-eval.test.js` (NEW) + `tests/capability-mcp-surface.test.js` (NEW) + `package.json` `test` chain (MODIFIED) -- eval gate + INV-01 surface proof.
</code_context>

<specifics>
## Specific Ideas

- **Index field source is the central design call:** the recipe schema is CLOSED + CI-guarded, so searchable metadata (intent synonyms, description, side-effect class) lives in a SEPARATE `catalog/descriptors/*.json` keyed by slug -- the recipe is never edited. `service`/`actionVerb`/`sideEffectClass` are authored but integrity-checked against recipe-derived values (side-effect from `method`: GET=read, POST/PUT/PATCH=mutate, DELETE=destructive).
- **Progressive disclosure is the anti-bloat invariant:** the model sees TWO tools, not 2,000+ slugs-as-schemas. `search_capabilities` returns <=5 ranked slugs + one-line descriptions + side-effect class + the matched `params` schema (schema-on-hit); `invoke_capability(slug, params)` runs exactly one.
- **INV-01 trap:** adding the tools to `TOOL_REGISTRY` would red `tool-definitions-parity.test.js`'s frozen hash AND force autopilot exposure. Right move = `server.tool()` out-of-registry (vault precedent); parity with autopilot is achieved at the RUNTIME layer in Phase 29, not the tool layer.
- **Catalog-doesn't-ship trap:** `catalog/` is top-level and NOT copied into the extension package today -- the index would be empty in a packaged build. Phase 28 must add the copy step and SW load path.
- **Eval harness must be seeded:** with ~1 real recipe, recall is a trivial 1.0; seed synthetic head capabilities + paraphrases so the harness measures real ranking. Gate = recall@5 >= 0.9 AND wrong-invoke = 0 (zero-wrong-invoke non-negotiable).
- **Tab-origin bias is authoritative:** resolve the owned-tab origin SW-side (model can't spoof) plus an optional override; minisearch `boost` implements the lean lever.
</specifics>

<deferred>
## Deferred Ideas

- **Tiered `capability-router.js` (T0-T3) + catalog registry + autopilot `tool-executor.js` parity branch** -- **Phase 29**. Phase 28 invoke is the direct routerless path against the existing engine.
- **Consent gate (Off/Ask/Auto) + audit log + recipe signature verification + enforced disambiguation-before-mutate** -- **Phase 30**. Phase 28 invoke runs ungated (origin-pin still holds); side-effect class is *visible* but not yet *gating*.
- **Bundled imperative head (T1a code handlers) + declarative tail catalog at scale** -- **Phase 29** (Phase 28 indexes only the handful of descriptors that exist).
- **CDP Network discovery -> recipe synthesis -> learned recipes feeding the index** -- **Phase 31**.
- **Self-healing DOM fallback + recipe-rot detection + 7-provider/schema-lock parity gate** -- **Phase 32**.
- **Live-model-in-the-loop eval** (vs pure index-recall measurement) -- out of v1; the Phase 28 gate measures index recall + wrong-invoke deterministically in CI.

### Reviewed Todos (not folded)
None -- no pending todos matched Phase 28.
</deferred>
