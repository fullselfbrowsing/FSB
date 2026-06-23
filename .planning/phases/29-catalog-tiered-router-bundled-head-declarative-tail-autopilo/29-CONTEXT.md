# Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity - Context

**Gathered:** 2026-06-21 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the **catalog**, the **origin-biased tiered router**, the **zero-install bundled head** (imperative handlers), the **declarative-recipe long tail**, and the **autopilot parity branch** — so the MCP `invoke_capability` surface and autopilot reach ONE shared capability engine (**INV-02 at the runtime layer**). This is research slot **P3 / "Phase 28"** (the research files use pre-final numbering: research "Phase 28" == this actual **Phase 29**; research "Phase 27" == actual Phase 28).

**In scope (CAT-01..05):**
- A `capability-router.js` that selects a tier — **model-prior public API (T0) → bundled handler (T1a) → declarative recipe (T1b) → learned recipe (T2) → DOM fallback (T3)** — biased by the tab origin (CAT-01).
- **5–10 high-value services** ship as **bundled imperative handlers** (the zero-install head, `catalog/handlers/*.js`), requiring no install (CAT-02).
- Additional services load as **declarative recipes** (data) executed by the existing bundled interpreter — the long tail (CAT-03).
- **Autopilot reaches the same engine via a `tool-executor.js` branch** — runtime-layer parity with the MCP surface, with **no parallel autopilot stack** (CAT-04 / INV-02).
- The router returns **either a structured result or a typed reason** for falling through to the next tier (CAT-05).

**Explicitly NOT in this phase:**
- **Real learned recipes (T2)** — the learned-recipe lookup is a NO-OP/empty stub here; CDP Network discovery → recipe synthesis → promotion to procedural memory is **Phase 31**.
- **Real self-healing DOM fallback (T3)** — T3 is a typed-fall-through SEAM that returns a reason but does NOT yet call `executeTool()`; recipe-rot detection + re-learn + the live DOM completion are **Phase 32**.
- **Consent gate (Off/Ask/Auto), mutation gating, recipe signature verification, audit log, legal posture** — all **Phase 30**. Phase 29 invoke runs ungated like Phase 27/28 (the two-point origin-pin still holds on EVERY tier path).
- **7-provider parity gate + schema-lock parity test** as a formal milestone gate — **Phase 32** (INV-03 must not be *broken* here, but the parity test ships in 32).
</domain>

<decisions>
## Implementation Decisions

### Router & Catalog Modules (CAT-01, CAT-05)
- **D-01:** Add **two NEW SW modules** — `extension/utils/capability-router.js` (tier selection + origin bias + fall-through decision) and `extension/utils/capability-catalog.js` (the slug → `{tier, handler|recipe, descriptor}` registry). Both are **dual-export IIFE shells** (`global.FsbCapabilityRouter` / `global.FsbCapabilityCatalog` + `module.exports`, mirroring `capability-search.js:236`, `capability-interpreter.js:380`, `capability-fetch.js:438`), both **added to `RECIPE_PATH_ALLOWLIST`** (`scripts/verify-recipe-path-guard.mjs:85-103`), both **eval-free** (Check 4 at `:269-302` fails CI closed on any `extension/utils/capability-*.js` missing from the allowlist).
- **D-02:** The router exposes a **single SW-global entry** (e.g. `FsbCapabilityRouter.invoke(slug, args, { origin, tabId })`) returning **`{ success:true, …result, tier }`** on a structured hit OR the existing **dual-field typed-error shape `{ success:false, code, errorCode, error }`** carrying a typed fall-through reason. The typed reason surfaces verbatim to MCP via the `/^RECIPE_.+$/` passthrough (`mcp/src/errors.ts:137`) — **no `errors.ts` schema edit** beyond the already-whitelisted typed families.
- **D-03 (the reroute — additive, INV-01-safe):** The Phase-28 routerless invoke handler `handleCapabilitiesInvokeMessageRoute` (`extension/ws/mcp-tool-dispatcher.js:2198-2221`) is **rewired** so its current body (`getRecipeBySlug` → `interpretRecipe` → `executeBoundSpec`) **becomes the router's T1b tier**, and the dispatcher handler now calls **`FsbCapabilityRouter.invoke(...)`** instead. The route table `MCP_PHASE199_MESSAGE_ROUTES` (`:84-112`) and the wire message names (`mcp:capabilities-invoke` / `mcp:capabilities-search`) **do NOT change** — so the frozen registry hash (`tests/tool-definitions-parity.test.js`) and the two-tool surface proof (`tests/capability-mcp-surface.test.js`) stay green (INV-01). The tools stay OUTSIDE `TOOL_REGISTRY`.
- **D-04 (catalog ↔ search relationship):** `capability-catalog.js` is the **authoritative tier registry** keyed by slug. The Phase-28 `capability-search.js` slug→recipe map (`getRecipeBySlug:222`) remains the **T1b recipe source**; the catalog either references it or the planner extends the search map into the catalog (planner discretion — see Claude's Discretion). The MiniSearch index continues to drive `search_capabilities`; the catalog drives `invoke_capability` tier routing.

### Tier Scope — what ships REAL vs. as a typed seam (CAT-01, CAT-05)
- **D-05 (confirmed by user):** **T1a (bundled imperative handlers)** and **T1b (declarative recipes via the existing `interpretRecipe` → `executeBoundSpec` primitive)** ship as the **REAL working tiers** this phase. T1b already works end-to-end today via the routerless path (`mcp-tool-dispatcher.js:2206-2220`).
- **D-06 (confirmed):** **T0 "model-prior public API"** is realized as a **thin declarative special-case** (a recipe with `authStrategy: none` / keyless public call), NOT separate infrastructure — the caller/model already supplied args; the router just routes a no-auth slug.
- **D-07 (confirmed):** **T2 (learned recipes)** is a **no-op/empty-returning stub** (real learning = Phase 31) and **T3 (DOM fallback)** is a **typed-fall-through SEAM** — on a no-match/break the router returns a typed reason (e.g. `RECIPE_NOT_FOUND` for no tier; a `RECIPE_*` seam reason for the T2/T3 placeholders) but does **NOT** call `executeTool()` yet. CAT-05 requires the *seam + reason*, not next-tier execution (`ROADMAP.md:87`; "don't over-engineer the router in v1" `research/SUMMARY.md:170`).

### Bundled Head (CAT-02)
- **D-08 (confirmed):** The head is **5–10 imperative handler modules under a NEW `catalog/handlers/*.js` directory** (does not exist today — `catalog/` currently holds only `recipes/` + `descriptors/`). Each handler is invoked by the router for a slug whose catalog entry is `tier:'T1a'`. A **handler = reviewed code shipped in the extension bundle** (it may run multi-step / GraphQL-persisted-query / split-token logic the closed declarative schema cannot express — `26-CONTEXT.md:124`); a **recipe = pure JSON data** bound by the fixed interpreter. Handlers still ultimately call the **same MAIN-world `executeBoundSpec`** for the actual authenticated request (origin-pin holds — D-12).
- **D-09 (confirmed — criteria, not a fixed list):** The **planner/research selects the 5–10 services** against these **selection criteria** (NOT a hardcoded list locked here): (1) high user value + auth-bearing; (2) a stable public/persisted API surface the head can target durably; (3) origin maps cleanly to a single first-party origin (for the origin-pin); (4) GitHub is already proven (`catalog/recipes/github-notifications.json`) and seeds the head. Candidate pool noted (GitHub, Gmail, Slack, Notion, Linear, …) but final selection is a planning deliverable.
- **D-10 (handler packaging):** Handlers must ship in the packaged extension. The planner adds an **analogous build/copy step** to `scripts/package-extension.mjs` (which today emits `extension/catalog/recipe-index.generated.js` / `FsbRecipeIndex` at `:41-88`) — either a parallel `handler-index.generated.js` or a direct copy + `importScripts` load. Without it, the head is absent in a packaged build (the same trap 28-D-16 fixed for recipes).

### Autopilot Parity (CAT-04, INV-02, INV-04)
- **D-11 (confirmed):** Autopilot parity is a **NEW branch in `extension/ai/tool-executor.js`**, mirroring the existing **`trigger` branch (`:402-423`)**, that — for the capability tools — calls the **SAME `FsbCapabilityRouter` SW-global** the MCP dispatcher calls (the trigger precedent uses `globalThis.fsbTriggerDispatchToolRequest`; capabilities use `globalThis.FsbCapabilityRouter`). It is **NOT** reached by adding the tools to `TOOL_REGISTRY` (Anti-Pattern 1: that would force `getPublicTools()` LLM-list bloat at `agent-loop.js:673-678` — `research/ARCHITECTURE.md:338-341`). One router, loaded once at SW startup, **two thin front doors**. Mirror the `buildAutopilotTriggerParams` ownership-strip / `source:'autopilot'` shape (`tool-executor.js:55-78`).
- **D-12 (INV-04 + origin-pin carried forward):** The **`agent-loop.js` `setTimeout`-chained iterator stays byte-untouched** (`:2725/2794/2804`); invoke remains a **single bounded async op**. The **two-point origin-pin (27-D-08) holds on EVERY tier path** — T1b through `interpretRecipe` (self-consistency) + `executeBoundSpec` (active-tab origin); **T1a handlers must also assert the active-tab origin before any side effect** (Pitfall 3 credential-replay — `research/PITFALLS.md:131-166`). The router does NOT bypass the pin.

### Claude's Discretion
- Whether `capability-catalog.js` is a fully separate module or the registry **extends `capability-search.js`'s slug→recipe map** (D-04) — one combined module is acceptable if it preserves the interpreter's purity charter.
- The exact **tier-selection signature** and the **typed fall-through reason codes** for the T2/T3 seams (e.g. `RECIPE_LEARN_PENDING` / `RECIPE_DOM_FALLBACK_PENDING` vs. reusing `RECIPE_NOT_FOUND`) — planner names them; they must match `/^RECIPE_.+$/` to pass through free.
- The exact **handler module interface** (function signature; how a handler declares its slug/tier/origin/side-effect class) and whether T1a handlers may use `from:'response'` CSRF sourcing (carried forward from 27-D-06 / `27-CONTEXT.md:141` as available-if-a-head-service-needs-it, NOT gating).
- The exact **autopilot hook point** — recommended a dedicated `tool-executor.js` branch (trigger precedent); a pre-switch special-case inside `executeTool()` is acceptable; the `agent-loop.js:2427` call site is discouraged (INV-04 blast radius).
- The **handler packaging mechanism** (parallel `handler-index.generated.js` vs. direct `importScripts`) (D-10).
- minisearch field-boost weights / origin-bias lever reused for router tier biasing (planner-tunable).

### Folded Todos
None — no pending todos matched Phase 29.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Research (authoritative; **NB pre-final numbering**: research "Phase 28" == this actual **Phase 29**):
- `.planning/research/ARCHITECTURE.md` — **Decision C** tier table + routing pseudocode + origin-bias (:152-177); component table naming `capability-catalog.js` / `capability-router.js` (:88-101); **Pattern 1** fetch-seam reuse (:229-247); **Pattern 2** "two front doors, one engine" + the trigger dual-path citation (:249-253); recommended structure incl. `catalog/handlers/*.js` vs `catalog/recipes/*.json` (:185-221); **Anti-Pattern 1** do-NOT-add-to-`TOOL_REGISTRY` (:336-341); P3 build-order row (:396); INV-04 iterator note (:403).
- `.planning/research/SUMMARY.md` — two-front-doors-one-router synthesis + tier order (:56); Phase-29 deliverables (:106-111); learned/DOM-fallback deferral to later phases (:120, :128); "don't over-engineer the router in v1" + ranker (:170).
- `.planning/research/FEATURES.md` — bundled-head zero-install framing + "pick 5-10 high-value services" (:57-58, :190); code/data split (:17).
- `.planning/research/PITFALLS.md` — **Pitfall 3** credential-replay / origin-pin must hold on the router path (:131-166); **Pitfall 5/6** (recipe rot + search recall — the fall-through reasons the router emits) (:205-282).

Roadmap / requirements / prior context:
- `.planning/ROADMAP.md` — Phase 29 details (:83-89); the **Invariants** preamble INV-01..04 (:17-20); Phase 30/31/32 boundaries (the GOV/learn/heal deferrals).
- `.planning/REQUIREMENTS.md` — CAT-01..05 (this phase, :37-41); GOV-01..08 (Phase 30, the consent boundary); HEAL-05 (Phase 32, the 7-provider/schema-lock parity gate).
- `.planning/phases/28-lean-mcp-surface-capability-search-eval-harness/28-CONTEXT.md` — the `<deferred>` section naming the router/catalog/autopilot branch as Phase 29 (:154-156); the routerless invoke path D-06/D-07 the router replaces (:38-39); INV-01 out-of-registry rule D-09 (:43); catalog packaging D-16 (:54).
- `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-CONTEXT.md` — `executeBoundSpec` result shape + two-point origin-pin (the router's execution contract, D-08); `from:'response'` CSRF deferred to Phase 29 (:141).
- `.planning/phases/26-recipe-schema-bundled-interpreter-mv3-ci-guard/26-CONTEXT.md` — closed-vocab + CI-guard allowlist the new router/catalog modules must satisfy; `persisted-query-hash`/split-token deferred to the Phase-29 bundled head (:124).

Source anchors — the reroute + autopilot-parity wiring (verified on `automation-worktree`, 2026-06-21):
- `extension/ws/mcp-tool-dispatcher.js:2198-2221` — `handleCapabilitiesInvokeMessageRoute`, the routerless path (`getRecipeBySlug` → `interpretRecipe` → `executeBoundSpec`) the router gets inserted into; route table :84-112; search handler :2172-2190.
- `extension/ai/tool-executor.js:402-423` — the `trigger` autopilot branch (the EXACT template for the capability branch); `buildAutopilotTriggerParams` / `autopilotTriggerHadEffect` :55-82; `executeTool` registry-only switch :665-695.
- `extension/ai/agent-loop.js:2427` — `_executeTool` call site; `getPublicTools` registry→LLM mapping :673-678; the INV-04 `setTimeout` iterator :2725/2794/2804 (must stay untouched).
- `extension/ws/mcp-bridge-client.js:1676-1694` — the thin `_handleCapabilitiesSearch` / `_handleCapabilitiesInvoke` pass-throughs; dispatch switch :472-476.
- `extension/utils/capability-search.js` — the Phase-28 slug→recipe map (`getRecipeBySlug:222-224`, `INDEX_OPTIONS:48-52`) the catalog registry extends or sits beside.
- `extension/utils/capability-interpreter.js:236-370` (`interpretRecipe`, the T1b binder: validate+bind+STOP) and `extension/utils/capability-fetch.js:272-385` (`executeBoundSpec` result shape) and `:228` (`MUTATING_METHODS` → side-effect class) — the execution primitives the router's recipe tier calls.
- `scripts/verify-recipe-path-guard.mjs:85-103` (`RECIPE_PATH_ALLOWLIST` — new `capability-router.js` / `capability-catalog.js` MUST join) + Check 4 disk-drift :269-302.
- `scripts/package-extension.mjs:41-88` — the catalog → `extension/catalog/recipe-index.generated.js` build step (`FsbRecipeIndex`); handlers need an analogous packaging path (D-10).
- `extension/background.js:119-163` — the SW `importScripts` load order (capability family + recipe-index + `buildOrRestore`); new router/catalog modules slot in after `capability-search.js`.
- `catalog/recipes/github-notifications.json` + `catalog/descriptors/github-notifications.json` — the one real recipe+descriptor pair showing the data shape the head/tail expand.
- `tests/tool-definitions-parity.test.js` (frozen INV-01 hash) + `tests/capability-mcp-surface.test.js` (two-tool wire proof) — must stay green after the reroute.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The routerless invoke path** (`mcp-tool-dispatcher.js:2198-2221`): `getRecipeBySlug` → `interpretRecipe` → `executeBoundSpec` — lifted verbatim into the router's **T1b tier**.
- **The `trigger` autopilot dual-path** (`tool-executor.js:402-423` MCP-and-autopilot via `globalThis.fsbTriggerDispatchToolRequest`): the EXACT template for the capability branch (CAT-04). Ownership-strip helpers at `:55-82`.
- **Phase 26/27 execution primitives** (`capability-interpreter.js` `interpretRecipe` + `capability-fetch.js` `executeBoundSpec`): the cookie-carrying MAIN-world fetch the T1b tier (and T1a handlers) call; normalized result shape `{ success, status, finalUrl, redirected, data, text }`.
- **Phase 28 search index + slug→recipe map** (`capability-search.js`): the T1b recipe source the catalog references; minisearch origin-bias lever reusable for tier biasing.
- **Typed-error passthrough** (`mcp/src/errors.ts:137` `/^RECIPE_.+$/`; `RECOVERY_AMBIGUOUS` whitelisted): the router's structured fall-through reasons surface free.
- **The catalog packaging build step** (`package-extension.mjs:41-88`, `FsbRecipeIndex`): clone for the handler-index packaging path.
- **The SW `importScripts` load order** (`background.js:119-163`): additive slots for `capability-router.js` / `capability-catalog.js`.

### Established Patterns
- **Dual-export IIFE module shell** (interpreter/fetch/search/auth-strategies): the shape for `capability-router.js` + `capability-catalog.js`.
- **CI-guard allowlist is fail-closed:** any new `extension/utils/capability-*.js` absent from `RECIPE_PATH_ALLOWLIST` reds CI (Check 4) — the new modules MUST register and stay eval-free.
- **Imperative code lives ONLY in bundled handlers, compiled into the extension** (Wall-1): `catalog/handlers/*.js` is the only place capability code lives; recipes stay pure data.
- **INV-01 via out-of-registry registration:** the two capability tools stay outside `TOOL_REGISTRY`; parity with autopilot is achieved at the RUNTIME layer (one shared router), NOT the tool layer.
- **Two-point origin-pin holds on every path** (27-D-08): the router and handlers must assert active-tab origin before any side effect — the router is not a pin bypass.

### Integration Points
- `extension/utils/capability-router.js` (NEW) — tier selection + origin bias + typed fall-through; `FsbCapabilityRouter.invoke(...)`; joins `RECIPE_PATH_ALLOWLIST`.
- `extension/utils/capability-catalog.js` (NEW) — slug → `{tier, handler|recipe, descriptor}` registry; joins `RECIPE_PATH_ALLOWLIST`.
- `catalog/handlers/*.js` (NEW) — 5–10 T1a imperative bundled handlers (the zero-install head).
- `extension/ws/mcp-tool-dispatcher.js` (MODIFIED) — `handleCapabilitiesInvokeMessageRoute` calls the router instead of the inline path (D-03); route table + wire names unchanged.
- `extension/ai/tool-executor.js` (MODIFIED) — NEW capability branch mirroring the `trigger` branch, hitting the shared router (CAT-04).
- `extension/background.js` (MODIFIED) — additive `importScripts` for router + catalog; load at SW startup.
- `scripts/verify-recipe-path-guard.mjs` (MODIFIED) — add `capability-router.js` + `capability-catalog.js` to `RECIPE_PATH_ALLOWLIST`.
- `scripts/package-extension.mjs` (MODIFIED) — bundle `catalog/handlers/` (analogous to the recipe-index step) (D-10).
- `tests/*.test.js` + root `package.json` `test` chain (MODIFIED) — router/tier tests + autopilot-parity test; INV-01 surface proof stays green.

### `agent-loop.js` is UNTOUCHED (INV-04)
- The `setTimeout`-chained iterator (`:2725/2794/2804`) and the `_executeTool` call site (`:2427`) stay byte-identical; invoke is a single bounded async op.
</code_context>

<specifics>
## Specific Ideas

- **One engine, two front doors** is the load-bearing invariant: the MCP `invoke_capability` dispatcher handler AND the autopilot `tool-executor.js` branch both call the SAME `FsbCapabilityRouter` SW-global. No parallel autopilot stack (INV-02), exactly as `trigger` already does it (`tool-executor.js:402-423`).
- **The reroute is internal-only:** Phase 28 wired invoke DIRECTLY to the primitive; Phase 29 inserts the router *inside* the existing SW handler. Wire names, route table, and `TOOL_REGISTRY` are untouched — the INV-01 hash never moves.
- **Ship the tiers that have real work; seam the rest:** T1a + T1b are real; T0 is a no-auth declarative special-case; T2 (learn) and T3 (DOM fallback) are typed-fall-through seams that return a reason. Real T2 = Phase 31, real T3 = Phase 32.
- **Code-vs-data split is physical:** imperative handlers live in `catalog/handlers/*.js` (reviewed, bundled), recipes stay pure JSON in `catalog/recipes/*.json`. The build pipeline and review treat them differently.
- **Origin-pin must hold on the head too:** a T1a handler is imperative code but still authenticated MAIN-world fetch — it must assert active-tab origin before any side effect (Pitfall 3 credential-replay).
- **Catalog-doesn't-ship trap (again):** like recipes in Phase 28, the new `catalog/handlers/` must be added to `package-extension.mjs` or the head is empty in a packaged build.

### Pitfalls to avoid
- Do NOT add the capability tools to `TOOL_REGISTRY` to "reach autopilot" — that bloats `getPublicTools()` and breaks INV-01. Reach autopilot via the runtime branch.
- Do NOT put the router inside `capability-interpreter.js` — it would violate the interpreter's validate+bind+STOP purity charter (no `chrome.*`, no network).
- Do NOT let the router create a second invoke path alongside the inline dispatcher path — that is the "parallel stack" INV-02 forbids.
- Do NOT edit `agent-loop.js`'s `setTimeout` iterator (INV-04) — hook the branch in `tool-executor.js`.
- Do NOT execute the T3 DOM fallback here — return the typed seam reason; live self-healing is Phase 32.
</specifics>

<deferred>
## Deferred Ideas

- **Real learned recipes (T2)** — CDP Network capture → recipe synthesis → promotion to per-origin procedural memory feeding the router. **Phase 31.** (Phase 29 ships the T2 lookup as an empty stub.)
- **Real self-healing DOM fallback (T3)** — router actually calls `executeTool()` on recipe break, completes the task, then re-learns; recipe-rot (`RECIPE_EXPIRED`) detection. **Phase 32.** (Phase 29 ships T3 as a typed-fall-through seam.)
- **Consent gate (Off/Ask/Auto) + mutation gating + recipe signature verification + audit log + legal posture** around invoke. **Phase 30.** (Phase 29 invoke runs ungated; origin-pin still holds.)
- **Formal 7-provider parity gate + schema-lock parity test** as a milestone gate. **Phase 32** (INV-03 must not be broken here, but the gate ships in 32).
- **`from:'response'` CSRF sourcing** (a prior in-page GET to mint the token) — available to a T1a head handler if a chosen service needs it (27-D-06 carried forward), NOT gating Phase 29.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 29.
</deferred>
</content>
