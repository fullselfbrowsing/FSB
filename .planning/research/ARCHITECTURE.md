# Architecture Research: v1.0.0 Full App Catalog (OpenTabs Parity)

**Domain:** Integrating a ~119-app / ~2,523-op external MIT catalog (OpenTabs) INTO FSB's existing tiered capability substrate (v0.9.99)
**Milestone:** v1.0.0 Full App Catalog (OpenTabs Parity) — SUBSEQUENT milestone; integrate WITH the v0.9.99 substrate, do not redesign it
**Researched:** 2026-06-23
**Confidence:** HIGH (every integration point read live from on-disk FSB source on branch `automation`: `capability-catalog.js`, `capability-router.js`, `capability-search.js`, `package-extension.mjs`, `service-denylist.js`, `network-capture.js`, `background.js`, `catalog/handlers/github.js`, `catalog/descriptors/*.json`; OpenTabs op metadata read live via authenticated `gh api repos/opentabs-dev/opentabs/...`, 119 plugin dirs confirmed)

> Scope note: this is a research/integration map for `gsd-roadmapper`, not an implementation. The v0.9.99 capability architecture is a FIXED substrate (tiers T0/T1a/T1b/T2/T3, the interpreter, the consent gate, the 2 MCP tools). The substrate's own architecture research is preserved at [ARCHITECTURE-v0.9.99-CAPABILITY-CATALOG.md](ARCHITECTURE-v0.9.99-CAPABILITY-CATALOG.md) — this document **cites it as the substrate** and specifies how the four v1.0.0 streams attach. It does NOT re-derive the tiers, the interpreter, or the MCP surface.
>
> Canonical-path note: per this directory's convention (the v0.9.99 SUMMARY states "the four research files written for THIS milestone replaced their prior-milestone content at the canonical paths"), this v1.0.0 architecture lives at the canonical `ARCHITECTURE.md`; the superseded v0.9.99 architecture is preserved on-disk at the milestone-suffixed path above (matching `PITFALLS-EXCALIDRAW.md` / `PITFALLS-v0.9.69-TELEMETRY.md`).

---

## 0. The Load-Bearing Decision (read this first)

The v1.0.0 mandate is **breadth + depth + safety + learning, NOT cloning OpenTabs**. The substrate already gives FSB five tiers and two front doors. The entire milestone reduces to **feeding the existing tiers** from OpenTabs metadata:

| Stream | What it actually is | NOT |
|--------|---------------------|-----|
| **BREADTH** | codegen OpenTabs op-metadata → FSB **descriptors (closed-vocab DATA)** so all 119 apps return from `search_capabilities` | NOT 2,523 hand-written handlers; NOT shipping OpenTabs' `handle()` code (Wall 1) |
| **DEPTH** | hand-port ~15-30 top apps as **T1a/T1b handlers** exactly like the shipped `catalog/handlers/github.js` | NOT a new mechanism — reuses `registerHandler` + `HEAD_HANDLER_MODULES` + `seedHeadHandlers()` |
| **DENYLIST** | grow `extension/config/service-denylist.json` DATA — the ONE hard floor under opt-out Auto — BEFORE any sensitive app is reachable | NOT new code; `service-denylist.js` is untouched |
| **DISCOVERY** | seed the 119 origins + endpoint hints so the existing `network-capture.js` learns the tail | NOT a new discovery engine — the Phase-31 path already exists |

**The single most important architectural fact:** today `capability-catalog.js resolve()` returns **`null`** for any slug not in its `REGISTRY` (verified at `capability-catalog.js:303-304`), and the router then returns `RECIPE_NOT_FOUND` (`capability-router.js:688-691`). But `capability-search.js` indexes **all `cat.descriptors`** (`capability-search.js:135-178`), so an imported descriptor-only slug is **searchable**. Without a change, all ~2,523 imported descriptors would be **discoverable-but-uninvocable dead entries**. The load-bearing deliverable is a `resolve()` fallback that maps a descriptor-only slug to a **non-null seam tier (T3 DOM or T2 learn-pending)** — §2 Decision B. This is the quality gate.

---

## 1. Standard Architecture

### System Overview (the substrate + the four v1.0.0 attachment points marked ★NEW / ◆MOD)

```
+---------------------------------------------------------------------------+
|  MCP CLIENT  (search_capabilities / invoke_capability)  |  AUTOPILOT      |
|  -- 2 tools OUTSIDE TOOL_REGISTRY (INV-01) -- UNCHANGED  |  same engine    |
+---------------------------+-----------------------------+-------------------+
                            |                             |
        (search)           v                             v   (invoke)
+--------------------------------------+   +-------------------------------------+
| capability-search.js  (minisearch)   |   | capability-router.js  invoke()      |
|  indexes ALL cat.descriptors         |   |  +-- _evaluateConsent (UNCHANGED) --+|
|  sideEffectClass: recipe method WINS |   |  |  denylist -> off -> ask -> auto  ||
|  ◆MOD getDescriptorBySlug() export   |   |  |  denylist = the ONE hard floor   ||
+-------------------+------------------+    |  +-------------------+--------------+|
                    | reads                 |   catalog.resolve(slug, origin)     |
                    v                        |  +-- tier dispatch (UNCHANGED) ----+|
+--------------------------------------+    |  |  T0/T1a/T1b/T2/T3 -> typed reason||
| FsbRecipeIndex (global)              |    |  +-------------------+--------------+|
|  extension/catalog/                  |    +----------------------+---------------+
|  recipe-index.generated.js           |                           |
|  { recipes[], descriptors[~2523] }   |                           v
|  ◆MOD GENERATED bigger by build      |    +-------------------------------------+
+-------------------+------------------+    | capability-catalog.js  resolve()    |
                    | built from             |  learned T2 -> REGISTRY T1a/T1b/T0  |
+--------------------------------------+    |  ★NEW descriptor-only -> T3 or T2   |
| scripts/codegen-opentabs.mjs ★NEW    |    |     (no dead RECIPE_NOT_FOUND)      |
|  OpenTabs metadata -> descriptors    |    |  ◆MOD HEAD_HANDLER_MODULES += ports|
+-------------------+------------------+    +----------------------+---------------+
                    | reads (pinned snapshot)                       | ctx.executeBoundSpec
+--------------------------------------+    +----------------------v---------------+
| vendor/opentabs-snapshot/ ★NEW       |    | capability-fetch.js (MAIN world)    |
|  plugins/<app>/{package.json,        |    |  executeBoundSpec re-pins origin    |
|  src/tools/*.ts, src/index.ts} +PIN  |    +-------------------------------------+
+--------------------------------------+
                                            +-------------------------------------+
+--------------------------------------+    | catalog/handlers/<app>.js ★NEW x15-30|
| extension/config/                    |    |  T1a/T1b: own origin,               |
|  service-denylist.json ◆MOD (FIRST)  |    |  executeBoundSpec-only,             |
|   deniedOrigins[] + sensitiveOrigins[]|   |  self-register at load              |
|  discovery-seeds.json ★NEW           |    +-------------------------------------+
|   119 origins + endpoint hints       |    +-------------------------------------+
+-------------------+------------------+    | learned-recipe-store.js (T2)        |
                    | endpoint hints         |  per-origin fsbLearnedRecipes       |
                    v                        |  getLearnedSync(slug, origin)       |
+--------------------------------------+    +----------------------^--------------+
| network-capture.js (CDP, ◆MOD small) |                           | promote-after-replay
|  startSession consent-gated          |---------------------------+
|  reads discovery-seeds endpointHints |
+--------------------------------------+
```

### Component Responsibilities (★NEW / ◆MOD / UNCHANGED, with real anchors)

| Component | Responsibility | State | Anchor file |
|-----------|----------------|-------|-------------|
| Codegen | OpenTabs op-metadata → `catalog/descriptors/*.json` + `discovery-seeds.json`; derive service/origin/intentSynonyms/actionVerb/sideEffectClass/params/provenance | **★NEW** | `scripts/codegen-opentabs.mjs` |
| Vendored snapshot | pinned MIT OpenTabs metadata for hermetic/offline build + auditable provenance | **★NEW** | `vendor/opentabs-snapshot/` + `PIN.md` |
| Cross-check guard | fail build if any descriptor under-states a mutating op as `read` | **★NEW** | `scripts/verify-catalog-crosscheck.mjs` (chained into `validate:extension`) |
| Packager | already inlines `{recipes, descriptors}` into the generated IIFE; just re-reads the bigger descriptor set | **◆MOD** (one added codegen call) | `scripts/package-extension.mjs:66-89` (`readJsonDir`) |
| Generated index | ships `{recipes[], descriptors[~2523]}` | **◆MOD** (bigger, same shape) | `extension/catalog/recipe-index.generated.js` |
| Search | index all descriptors incl. descriptor-only; recipe-method wins cross-check | **UNCHANGED code** + **◆MOD** add `getDescriptorBySlug` export | `extension/utils/capability-search.js:89-185,281` |
| Catalog `resolve()` | learned→REGISTRY→**descriptor-only→T3/T2**→null | **◆MOD** (the no-dead-entry branch + `HEAD_HANDLER_MODULES` ports) | `extension/utils/capability-catalog.js:215-219,285-360` |
| Hand-port handlers | T1a/T1b head: own first-party origin, `executeBoundSpec`-only, tokens never logged, self-register | **★NEW** ~15-30 | `catalog/handlers/<app>.js` (shape = `github.js`) |
| Denylist data | cover banking/payments/health/ToS-hostile across the 119 BEFORE reach | **◆MOD data** (FIRST) | `extension/config/service-denylist.json` |
| Discovery seeds | 119 origins + endpoint hints for the network-capture tail | **★NEW data** | `extension/config/discovery-seeds.json` |
| Network capture | consent-gated CDP capture reads endpoint hints | **◆MOD small** + reads new data | `extension/utils/network-capture.js` |
| Router / interpreter / fetch / consent gate / learned store | dispatch, bind, MAIN-world fetch, opt-out Auto gate, T2 store | **UNCHANGED** | `capability-router.js`, `capability-interpreter.js`, `capability-fetch.js`, `consent-policy-store.js`, `learned-recipe-store.js` |

---

## 2. The Hard Decisions (resolved)

### Decision A — The codegen input contract (BREADTH): OpenTabs op-metadata → FSB descriptor

**Recommendation: a build-time Node ESM transform reading a PINNED snapshot, emitting committed `catalog/descriptors/*.json`. Read ONLY metadata; never vendor/ship OpenTabs' `dist/` runtime (Wall 1).**

The OpenTabs op shape is verified (read live from the `airtable` plugin). Each plugin is an npm package; each op is a `defineTool({...})` in `src/tools/<op>.ts`; the service/origin metadata is in `package.json.opentabs` + the `src/index.ts` plugin class:

| OpenTabs source | Location | → FSB descriptor field | Derivation |
|-----------------|----------|------------------------|------------|
| `urlPatterns:['*://*.airtable.com/*']`, `homepage` | `package.json.opentabs` + class | `service` (`airtable.com`) + canonical origin | parse host from urlPattern |
| op `name` (`list_records`) + plugin `name` (`airtable`) | `defineTool` / class | `slug` (`airtable.list_records`) | `${plugin}.${op}` |
| `description`+`summary`+`displayName`+`group` | `defineTool` | `intentSynonyms[]`, `description`, `actionVerb` | NL-phrase synthesis; verb from name prefix |
| `handle()` uses `apiGet` vs `apiPost/Put/Delete` | `defineTool.handle` | `sideEffectClass` | **static scan of the api-helper call** (Decision C) |
| `input: z.object({...})` (zod) | `defineTool` | `params` (JSON-Schema) | zod→JSON-Schema conversion |
| plugin name + repo SHA | `package.json` + PIN | `provenance` (MIT) | from `_provenance.json` |

**Verified read example** — OpenTabs `airtable/src/tools/list-records.ts` `defineTool({ name:'list_records', description:'List all records...', input: z.object({base_id, table_id}), handle: async p => apiGet(...) })` → FSB descriptor:
```json
{ "slug":"airtable.list_records", "service":"airtable.com",
  "intentSynonyms":["list airtable records","show rows in an airtable table",
                    "view records in airtable","get airtable table rows"],
  "description":"List all records (rows) in an Airtable table (imported, read)",
  "actionVerb":"list", "sideEffectClass":"read",
  "params":{"type":"object","properties":{"base_id":{"type":"string"},
            "table_id":{"type":"string"}},"required":["base_id","table_id"],
            "additionalProperties":false},
  "backing":"dom",
  "provenance":{"source":"opentabs","license":"MIT",
                "plugin":"@opentabs-dev/opentabs-plugin-airtable","op":"list_records"} }
```
This matches the existing hand-authored descriptor shape verbatim (`catalog/descriptors/github-issues-create.json`, read live: `slug/service/intentSynonyms/description/actionVerb/sideEffectClass/params`).

**When:** all 119 apps / ~2,523 ops. **Trade-offs:** descriptors ship immediately, executable backing lags → Decision B guarantees no dead entry. zod→JSON-Schema must flatten constructs the closed `params` sub-schema cannot express (`z.union` → permissive `anyOf`/string) and NEVER emit a forbidden field name (`script/expr/transform/code/fn/js`) — the recipe-schema pre-scan would reject those (verified at the Phase-26 forbidden-name pre-scan).

### Decision B — The no-dead "discoverable-but-uninvocable" descriptor path (THE quality gate)

**Recommendation: add a descriptor-only fallback branch to `capability-catalog.js resolve()` so EVERY searchable slug resolves to a non-null tier. A descriptor with no bundled handler/recipe resolves to T3 (DOM) by default, or T2 (learn-pending) when a discovery seed exists — never `null` → never `RECIPE_NOT_FOUND` for a searchable slug.**

The current `resolve()` (verified):
```
resolve(slug, origin):
  learned = _getLearned(slug, origin)          # T2 wins (capability-catalog.js:294-301)
  if learned: return {tier:'T2', recipe}
  entry = REGISTRY[slug]                        # T1a/T1b/T0 (:303)
  if !entry: return null                        # <-- THE DEAD-ENTRY BUG for imports (:304)
  ...quarantine check, tier returns...
```
The fix is a single branch inserted at the `!entry` point, using a typeof-guarded `_getDescriptor(slug)` accessor that mirrors the existing `_getRecipeBySlug` accessor (`capability-catalog.js:54-60`) — it reads `FsbRecipeIndex.descriptors` (or a new `FsbCapabilitySearch.getDescriptorBySlug`):
```
  # --- ★NEW descriptor-only fallback (no dead entry) ---
  desc = _getDescriptor(slug)
  if desc:
      tier = (desc.backing === 'learn') ? 'T2' : 'T3'   # default T3
      return { tier, descriptor: desc, origin: desc.serviceOrigin }
  return null    # genuinely-unknown slug ONLY
```
The router already maps the result correctly with **zero router changes**:
- **T3** → `RECIPE_DOM_FALLBACK_PENDING` (`capability-router.js:723-727`): the model/autopilot completes the task via FSB's universal DOM engine (the always-available floor).
- **T2 with no recipe** → `RECIPE_LEARN_PENDING` (`capability-router.js:709-721`): signals the consent-gated discovery path can learn this origin's endpoint.

**Which tier for a descriptor-only slug?** Codegen stamps `"backing":"dom"` by default and `"backing":"learn"` when the app has a discovery seed (Decision E). `_descriptorTier` reads it; absent ⇒ T3. Rationale: T3/DOM needs no per-origin learning and always works; T2/learn is offered only where a seed primes the network-capture path.

**Gate (Phase 36):** the search-eval harness must assert **every descriptor slug that `search_capabilities` can return resolves to a non-null tier** (T1a/T1b/T0/T2/T3) — i.e. `invoke` never returns `RECIPE_NOT_FOUND` for a searchable slug. **Trade-offs:** a T3 descriptor-only invoke does no API fast-path (DOM is slower but reliable) — intended tail behavior; hand-ports (Decision D) + learned recipes upgrade the hot subset over time.

### Decision C — Side-effect class derivation + cross-check at scale (BREADTH safety)

**Recommendation: derive `sideEffectClass` twice (codegen static-scan + runtime recipe-method) and cross-check; disagreement escalates to `write` (over-state, never under-state).**

1. **Codegen (static):** scan the OpenTabs `handle()` for the api-helper verb (`apiGet`⇒read; `apiPost`/`apiPut`/`apiPatch`/`apiDelete`⇒write) AND the op-name prefix (`get_`/`list_`/`read_`⇒read; `create_`/`update_`/`delete_`/`add_`/`set_`⇒write). **Disagreement ⇒ `write`** + a codegen warning. (Verified: `airtable/list-records.ts` uses `apiGet`; `airtable/update-cell.ts` uses `apiPost` — the signal is reliable and present.)
2. **Runtime (existing, UNCHANGED):** `capability-search.js buildIndex` re-derives `sideEffectClass` from the **recipe method** when a recipe is paired and **the recipe wins** (`capability-search.js:89-125`, Phase-28 D-02). `capability-router.js _deriveSideEffectClass` promotes to `mutating` whenever the HTTP method is `POST/PUT/PATCH/DELETE` regardless of any authored class (`capability-router.js:290-305`). So a mis-authored descriptor can never cause a mutating call to be gated as a read.

**Enforcement:** `scripts/verify-catalog-crosscheck.mjs` (★NEW, chained into `validate:extension` alongside `verify-recipe-path-guard.mjs`) fails the build if any descriptor's authored `sideEffectClass:read` pairs with a mutating recipe/handler method, or if the codegen static-scan flagged a disagreement resolved to `read`. **Trade-offs:** over-stating to `write` adds write-friction to some genuine reads — acceptable; a later hand-port/learned recipe with a real GET method corrects it via recipe-wins.

### Decision D — Hand-ported head (DEPTH): T1a/T1b registration, origin-pin, executeBoundSpec-only

**Recommendation: hand-port ~15-30 apps EXACTLY like the shipped `catalog/handlers/github.js` — the mechanism already exists and is tested. No new registration machinery.**

Each hand-port is a dual-export IIFE that (verified against `github.js`):
- targets its app's **own first-party origin** (the separate-origin public API is FORBIDDEN — the session cookie does not cross; `github.js` asserts `api.github.com` never appears, and the test enforces it);
- builds bound spec(s) and calls **`ctx.executeBoundSpec` ONLY** (never a browser scripting/tabs API), so the active-tab origin-pin inside `executeBoundSpec` holds on the head path;
- keeps scraped CSRF/tokens **only inside the bound spec, never in a log line**;
- **self-registers** its slugs via `FsbCapabilityCatalog.registerHandler(slug, {tier:'T1a', handler, origin, params, descriptor})` at load (typeof-guarded — verified at `github.js` tail).

**Three required wiring edits per hand-port (all verified seams):**
1. **Handler self-register at load** — the IIFE tail (verbatim shape from `github.js:` self-registration block).
2. **`HEAD_HANDLER_MODULES` += entry** — `capability-catalog.js:215-219` (`{ global:'FsbHandlerLinear', service:'linear.app', origin:'https://linear.app' }`); `seedHeadHandlers()` (`:232-253`) reads each present global (defense-in-depth).
3. **`background.js` importScripts** — add `importScripts('catalog/handlers/linear.js')` in the block at `background.js:191-197`, AFTER `capability-catalog.js` (`:179`) and BEFORE the `seedHeadHandlers()` call (`:196-197`). The packager already copies `catalog/handlers/*.js` → `extension/catalog/handlers/` (`package-extension.mjs:101-115`).

**T1a vs T1b:** single same-origin GET/POST the closed recipe schema expresses ⇒ ship a **T1b recipe** (`catalog/recipes/<app>.json`, like the verified `reddit-inbox.json`); multi-call / persisted-query-hash / split-token CSRF (Slack xoxc/xoxd, Notion `/api/v3`, GraphQL persisted queries) ⇒ ship a **T1a handler**. A slug is EITHER T1a OR T1b — declared explicitly, no runtime tie-break.

**Guarded writes:** a write op stays **fail-closed to `RECIPE_DOM_FALLBACK_PENDING`** (the verified `github.issues.create` pattern at `github.js`) until a live-captured mutation body is confirmed — never stamp success for an unverified mutation. Each hand-port's `[ASSUMED-ENDPOINT]` carries a human_needed live-UAT (the Phase-29 posture). **Trade-offs:** real engineering + live-capture per port → keep the head small (15-30) and high-value; the tail rides BREADTH(T3)+DISCOVERY(T2).

### Decision E — Discovery seeding (the tail): origins + endpoint hints

**Recommendation: a NEW `extension/config/discovery-seeds.json` (codegen-emitted) listing all 119 origins + endpoint hints, read by `network-capture.js` to prime the consent-gated capture path for the non-hand-ported tail.**

Data shape (mirrors the verified denylist host-pattern form):
```json
{ "v":1, "seeds":[
  { "service":"airtable.com", "origin":"https://airtable.com",
    "urlPatterns":["*://*.airtable.com/*"],
    "endpointHints":["/v0.3/application/{appId}/read","/row/{rowId}/updatePrimitiveCell"] },
  { "service":"linear.app", "origin":"https://linear.app",
    "urlPatterns":["*://*.linear.app/*"], "endpointHints":["/graphql"] } ] }
```
Endpoint hints are extracted by codegen from the OpenTabs `handle()` bodies (e.g. airtable `application/{base}/read`, the verified `apiGet` path). `network-capture.js startSession` (verified consent-gated, rides the existing Input-domain `chrome.debugger` attach — NO manifest change) reads the hints to recognize the relevant XHR/Fetch faster and bias the synthesizer toward the known endpoint.

**Critical constraint:** hints are `[ASSUMED]` until live-observed — they only **bias**, never **execute**. The synthesizer still caps to declarative-executable auth and **replay-verifies before promotion** (the Phase-31 promote-after-replay gate, verified) — a hint never becomes a recipe without a real captured + replayed call. A descriptor whose origin has a seed gets `"backing":"learn"` (Decision B) so its descriptor-only resolve offers T2/learn instead of T3/DOM. **Trade-offs:** seeds add zero permission and zero execution risk; they are pure priming data.

---

## 3. Recommended Project Structure (deltas only — ★NEW / ◆MOD)

```
scripts/
  package-extension.mjs            # ◆MOD: invoke/consume codegen output (existing readJsonDir covers descriptors)
  codegen-opentabs.mjs             # ★NEW: OpenTabs metadata -> descriptors + discovery-seeds
  verify-catalog-crosscheck.mjs    # ★NEW (CI): descriptor sideEffectClass vs recipe-derived at scale

vendor/opentabs-snapshot/          # ★NEW: pinned MIT source snapshot (hermetic build + provenance)
  PIN.md                           #   commit SHA + MIT license text + attribution
  plugins/<app>/{package.json, src/tools/*.ts, src/index.ts}   # METADATA ONLY (no dist/)

catalog/
  descriptors/                     # GROWS ~11 -> ~2523 (codegen-emitted, committed for reviewable diff)
    <app>-<op>.json                #   one per OpenTabs op (closed-vocab DATA)
    _provenance.json               # ★NEW: per-app MIT attribution + source SHA
  recipes/                         # hand-authored T1b recipes ONLY (unchanged policy)
    <app>.json                     # ★NEW (only for hand-ported T1b apps)
  handlers/                        # GROWS +15..30 hand-ported T1a/T1b head modules
    linear.js / jira.js / vercel.js / datadog.js / ...   # ★NEW (shape = github.js)

extension/
  config/
    service-denylist.json          # ◆MOD: expanded denied + sensitive (LANDS FIRST, Phase 35)
    discovery-seeds.json           # ★NEW: 119 origins + endpoint hints
  catalog/
    recipe-index.generated.js      # ◆MOD GENERATED, bigger
    handlers/<app>.js              # copied by package-extension.mjs (existing mechanism)
  utils/
    capability-catalog.js          # ◆MOD: descriptor-only -> T3/T2 (no dead entry) + HEAD_HANDLER_MODULES += ports
    capability-search.js           # ◆MOD: add getDescriptorBySlug export (code otherwise unchanged)
    network-capture.js             # ◆MOD (small): read discovery-seeds endpoint hints
  background.js                    # ◆MOD: importScripts each hand-port before seedHeadHandlers()
```

### Structure Rationale

- **`vendor/opentabs-snapshot/` (pinned, committed):** the codegen MUST run against a pinned snapshot, not a live `gh api` fetch at build time — builds must be hermetic/offline and the MIT provenance auditable (`PIN.md` = SHA + license, mirroring the existing `.planning/LATTICE-PIN.md` discipline). Only metadata files are vendored; OpenTabs' compiled `dist/` and `handle()` runtime are NOT shipped (Wall 1: metadata as DATA, never their code).
- **`catalog/descriptors/` grows, `catalog/recipes/` does not (much):** descriptors are cheap closed-vocab search DATA (codegen-safe). A recipe is the executable closed-vocab contract — only hand-authored + `validateRecipe`-passing recipes enter `catalog/recipes/`; an auto-learned recipe enters via the **learned-store** (promote-after-replay), never the bundled catalog (Anti-Pattern 4).
- **Committed codegen output (not pure build-time generation):** emit descriptors as committed files so the diff is reviewable, the search-eval harness runs in CI against a stable corpus, and a codegen regression is visible in PR review. `package-extension.mjs` re-reads them via the existing `readJsonDir` (verified at `:51-68`).

---

## 4. Architectural Patterns

### Pattern 1: Feed the existing tiers, don't add tiers (the whole milestone)

**What:** BREADTH→T3/T2, DEPTH→T1a/T1b, DISCOVERY→T2-via-learn. No new tier, no new router branch, no new MCP tool.
**When:** always — this is the substrate-respecting posture.
**Trade-offs:** + zero churn to the load-bearing router/interpreter/gate (INV-01..04 trivially preserved) + reuses tested machinery. − descriptor-only tail is DOM-speed until upgraded (accepted).

### Pattern 2: Descriptor-only → typed seam reason, never RECIPE_NOT_FOUND (Decision B)

**What:** `resolve()` returns T3/T2 for a searchable-but-unbacked slug; the router's existing T3/T2 mapping yields `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_LEARN_PENDING` — actionable typed reasons the model acts on.
**When:** every imported descriptor.
**Trade-offs:** + no dead catalog entries + the autopilot self-heals to DOM automatically + discovery is offered where seeded. − one extra accessor + one branch in `resolve()` (cheap).

### Pattern 3: Two derivations + escalate-to-write (Decision C)

**What:** codegen static-scan + runtime recipe-method, cross-checked; disagreement ⇒ `write`; a CI guard enforces it.
**When:** every imported descriptor; guard runs in `validate:extension`.
**Trade-offs:** + a mis-authored read can never become an ungated mutation + the recipe-wins runtime rule is the backstop. − some genuine reads carry write-friction until corrected by a recipe.

### Pattern 4: Hand-port = github.js shape, verbatim (Decision D)

**What:** new `catalog/handlers/<app>.js` modules using `registerHandler` + `HEAD_HANDLER_MODULES` + `seedHeadHandlers()` + `executeBoundSpec`-only + own-origin + guarded-write-fail-closed.
**When:** the ~15-30 highest-value apps only.
**Trade-offs:** + first-class API fast path with the origin-pin intact + reuses the tested registration mechanism. − real engineering + live-capture UAT per port (keep the head small).

### Pattern 5: Seed-then-learn for the tail (Decision E)

**What:** `discovery-seeds.json` primes `network-capture.js`; a real captured+replayed call promotes a T2 learned recipe that then outranks the descriptor-T3 on the next visit (verified learned-first `resolve()` order).
**When:** the non-hand-ported origins.
**Trade-offs:** + the hot tail upgrades to the API fast path from the user's own traffic, consent-gated + no permission change. − hints are assumed until observed (they only bias, never execute).

---

## 5. Data Flow

### Build-time (BREADTH + DISCOVERY seeding)

```
vendor/opentabs-snapshot/plugins/<app>/{package.json, src/tools/*.ts, src/index.ts}
   |  scripts/codegen-opentabs.mjs (★NEW)
   |    parse opentabs.urlPatterns + class -> service/origin
   |    parse each defineTool -> slug, intentSynonyms, actionVerb, params(zod->JSON-Schema)
   |    static-scan handle() api-helper verb -> sideEffectClass (escalate-to-write on disagree)
   v                                              v
catalog/descriptors/<app>-<op>.json          extension/config/discovery-seeds.json
catalog/descriptors/_provenance.json         (119 origins + endpoint hints)
   |  scripts/package-extension.mjs (◆MOD: existing readJsonDir at :51-68)
   v
extension/catalog/recipe-index.generated.js   { recipes[], descriptors[~2523] }
   |  CI: verify-catalog-crosscheck.mjs (★NEW) + verify-recipe-path-guard.mjs (existing)
   v
fail build if any descriptor under-states a mutating op as read
```

### Runtime invoke (the no-dead-entry path)

```
invoke_capability(slug) / autopilot executeCapabilityToolForAutopilot
   v
capability-router.invoke(slug, args, {origin, tabId})        [UNCHANGED]
   v
_evaluateConsent(...)  denylist -> off -> ask -> auto         [UNCHANGED]
   denylist.isDenied(origin) -> RECIPE_CONSENT_BLOCKED  (the ONE hard floor)
   v allow
catalog.resolve(slug, origin)                                 [◆MOD]
   |-- learned T2 (recipe) ----------> _runDeclarativeTier('local')  -> API fast path
   |-- REGISTRY T1a ------------------> _runHandlerTier -> handler.handle -> executeBoundSpec
   |-- REGISTRY T1b/T0 (recipe) ------> _runDeclarativeTier -> executeBoundSpec
   |-- ★NEW descriptor-only, seeded --> T2 no-recipe -> RECIPE_LEARN_PENDING (offer discovery)
   |-- ★NEW descriptor-only, unseeded-> T3 -> RECIPE_DOM_FALLBACK_PENDING (DOM completes it)
   |-- genuinely unknown -------------> null -> RECIPE_NOT_FOUND
```

### Discovery → learned upgrade (existing Phase-31 machinery, primed by seeds)

```
user opts into discovery on seeded origin
   v  network-capture.startSession(origin,{tabId,confirmedSensitive?})  [consent-gated, ◆MOD reads hints]
observe same-origin XHR/Fetch (redacted at handler) -> synthesizer
synthesize recipe (caps to declarative-executable; flags response-CSRF for Phase32)
promote-after-replay (interpret 'local' -> executeBoundSpec -> clean? promote)
   v
learned-recipe-store.addLearnedRecipe -> fsbLearnedRecipes + index +learnedN
   next visit: catalog.resolve learned-first -> T2 -> API fast path (no longer T3/DOM)
```

---

## 6. Scaling Considerations

| Scale | Architecture adjustment |
|-------|-------------------------|
| ~11 → ~2,523 descriptors | minisearch index size + `catalogVersion` (djb2 over sorted slugs, verified at `capability-search.js:190-199`) — measure SW-startup build time + snapshot-restore time; eval harness must re-pass on the larger near-neighbor corpus |
| search recall at 2,523 docs | `intentSynonyms` quality is load-bearing (Phase-28 D-14 proved a description-only index fails wrong-invoke=0). Codegen must emit ≥3-4 distinct intent phrases per op; the harness gates it |
| `recipe-index.generated.js` byte size | ~2,523 descriptors inline as one JSON IIFE could be hundreds of KB. Measure `importScripts` parse cost; if needed split descriptors into a second generated file (`descriptor-index.generated.js`) loaded before `capability-search.js` — `package-extension.mjs` already owns generation, so it is a one-file addition, not an architecture change |
| snapshot churn | codegen shifts `catalogVersion` only if slugs change (content hash) — stable across same-corpus rebuilds, so the persisted index restores rather than rebuilds (verified restore-on-base-match at `capability-search.js:154-175`) |

### Scaling priorities

1. **First bottleneck — search precision, not size.** 2,523 ops with weak synonyms collapses `search_capabilities` precision (wrong-invoke). Fix: codegen emits rich `intentSynonyms`; the Phase-28 eval harness re-runs in Phase 36 as the BREADTH gate.
2. **Second bottleneck — generated-file parse cost at cold SW start.** Fix: split descriptors into `extension/catalog/descriptor-index.generated.js` if the single IIFE is too large; one-file build addition.

---

## 7. Anti-Patterns

### Anti-Pattern 1: Shipping descriptors with no resolution path (the dead-entry trap)
**What people do:** import all 119 apps as descriptors, leave `resolve()` returning `null` for them.
**Why it's wrong:** every imported slug is discoverable-but-uninvocable — `invoke_capability` returns `RECIPE_NOT_FOUND`, breaking the search→invoke progressive-disclosure contract and eroding catalog trust.
**Do this instead:** Decision B — descriptor-only → **T3 (DOM)** or **T2 (learn-pending)**, never `null`; gate it with the harness assertion that every searchable slug resolves non-null.

### Anti-Pattern 2: Cloning OpenTabs' code/handlers (Wall 1 violation + scope blowup)
**What people do:** vendor/ship the 2,523 OpenTabs `handle()` implementations (their `dist/` IIFEs) so every op has a real backing.
**Why it's wrong:** (a) Wall 1 — shipping their runtime as the executable layer is "code as control flow," the Web-Store-ban risk the substrate exists to avoid; (b) it is the npm-per-plugin model v0.9.99 explicitly rejected; (c) 2,523 code handlers is unmaintainable.
**Do this instead:** import only **metadata as DATA** (descriptors); execute via the existing tiers (small hand-ported head + T1b recipes + learned T2 + T3 DOM).

### Anti-Pattern 3: Letting a sensitive app become reachable before the denylist covers it
**What people do:** import finance/health/social descriptors + hand-ports, expand the denylist "later."
**Why it's wrong:** the shipped default is **opt-out Auto** (v0.9.99 Phase 30) — the denylist is the ONE hard floor (verified at `capability-router.js _evaluateConsent` step 1). A reachable banking/payments/health origin under Auto could replay credentials — the "safe brand inversion / credential-replay weapon" top risk.
**Do this instead:** **DENYLIST LANDS FIRST** (Phase 35). No category batch containing a sensitive app ships its descriptors/hand-ports until `deniedOrigins`/`sensitiveOrigins` cover that category.

### Anti-Pattern 4: Codegen emitting recipes (not just descriptors) for the tail
**What people do:** auto-synthesize `catalog/recipes/*.json` from OpenTabs endpoints so the tail has a bundled T1b backing.
**Why it's wrong:** an unreplayed synthesized recipe is confidently-wrong execution from birth (recipe-rot at t=0) and bloats the locked recipe contract with unverified entries.
**Do this instead:** codegen emits **descriptors only**; a recipe enters `catalog/recipes/` only by hand-authoring + `validateRecipe`; an auto-learned recipe enters via the learned-store (promote-after-replay), never the bundled catalog.

### Anti-Pattern 5: Hand-port handler targeting the public API origin
**What people do:** a hand-port calls `api.linear.app` / `api.stripe.com` because that is the documented API.
**Why it's wrong:** the first-party session cookie is scoped to the app's own origin, not the separate API subdomain — the call would be unauthenticated, and `executeBoundSpec`'s origin-pin rejects the cross-origin target (`RECIPE_ORIGIN_MISMATCH`).
**Do this instead:** target the app's OWN first-party origin + its internal/persisted-query endpoints (the verified github/slack/notion handler pattern; the test asserts no api-subdomain appears).

---

## 8. Integration Points

### External sources

| Source | Integration pattern | Notes / gotchas |
|--------|---------------------|------------------|
| OpenTabs repo (`github.com/opentabs-dev/opentabs`, MIT) | vendor a **pinned snapshot** under `vendor/opentabs-snapshot/` (`PIN.md` = SHA + MIT); codegen reads metadata files only | `gh api repos/opentabs-dev/opentabs/...` confirmed working; op shape = `defineTool({name,displayName,description,summary,group,input:zod,output,handle})`; plugin shape = `package.json.opentabs.{urlPatterns,homepage}` + `src/index.ts` class. NEVER vendor/ship `dist/` runtime (Wall 1) |
| `@opentabs-dev/plugin-sdk` | reference only (for the `defineTool`/`ToolDefinition` shape the codegen parses) | NOT a runtime dependency of FSB |

### Internal boundaries (★NEW / ◆MOD, real file paths)

| Boundary | Communication | State |
|----------|---------------|-------|
| `codegen-opentabs.mjs` → `catalog/descriptors/*.json` | writes JSON (committed) | **★NEW** |
| `package-extension.mjs` → `recipe-index.generated.js` | existing `readJsonDir` + inline IIFE (`:51-89`) | **◆MOD** (one added call) |
| `verify-catalog-crosscheck.mjs` → CI | `validate:extension` → `ci/all-green` | **★NEW** (mirror `verify-recipe-path-guard.mjs` wiring) |
| `capability-search.js` ← `FsbRecipeIndex.descriptors` | indexes all descriptors (`:135-178`) | **UNCHANGED** + **◆MOD** add `getDescriptorBySlug` export (`:402`) |
| `capability-catalog.js resolve()` ← descriptor index | typeof-guarded `_getDescriptor` → T3/T2 (`:285-360`) | **◆MOD** + `HEAD_HANDLER_MODULES` += ports (`:215-219`) |
| `catalog/handlers/<app>.js` → `registerHandler` | self-register at load + `seedHeadHandlers()` | **★NEW** ~15-30 (shape = `github.js`) |
| `background.js` importScripts | load handlers after catalog, before `seedHeadHandlers()` (`:191-197`) | **◆MOD** |
| `service-denylist.json` ← (data) | loaded by `service-denylist.js` at boot (`background.js:213-222`) | **◆MOD data**; `service-denylist.js` code UNCHANGED |
| `network-capture.js` ← `discovery-seeds.json` | reads endpoint hints in `startSession`/synthesizer | **◆MOD small** + **★NEW data** |

### Invariants the integration must not move (verified against source)

- **INV-01:** the 2 tools stay OUTSIDE `TOOL_REGISTRY`; frozen non-trigger registry hash unmoved. BREADTH adds DATA + DEPTH adds handlers behind the SAME 2 tools — **no new MCP tool**, no schema change.
- **INV-02:** both front doors keep calling the SAME `FsbCapabilityRouter.invoke` (`capability-router.js:654`); hand-ports register into the SAME catalog both doors read. No autopilot-only path.
- **INV-03:** typed reasons (`RECIPE_DOM_FALLBACK_PENDING`, `RECIPE_LEARN_PENDING`, `RECIPE_CONSENT_BLOCKED`) byte-equal across all 7 providers (surface verbatim via the `/^RECIPE_.+$/` passthrough — NO `errors.ts` edit).
- **INV-04:** the `agent-loop.js` setTimeout iterator untouched — invoke stays a single bounded async op.
- **Wall 1:** descriptors are closed-vocab DATA; codegen NEVER emits a forbidden field name; `verify-recipe-path-guard.mjs` stays green (new catalog code stays dynamic-code-free even in comments).
- **Wall 2:** every credentialed call still goes through `capability-fetch.js executeBoundSpec` in the MAIN world with the active-tab origin-pin; hand-ports are `executeBoundSpec`-only; CDP capture stays discovery-only.

---

## 9. Phase Build Order (from Phase 35) — DENYLIST-FIRST, category-batched

> Phases continue from v0.9.99's Phase 34. Ordering principle: **denylist before reach** (no sensitive app reachable before its category is covered), **pipeline before content** (codegen + no-dead-entry resolution before importing at scale), **breadth before depth** within a category, **discovery seeding alongside breadth**. Each phase keeps the existing surface green (INV-01..04 + Walls 1/2).

| # | Phase | Scope | Touches (★NEW / ◆MOD) | Gates / invariant watch |
|---|-------|-------|----------------------|-------------------------|
| **35** | **Denylist Expansion (LANDS FIRST) + provenance scaffold** | Expand `service-denylist.json` denied+sensitive to cover ALL banking/payments/health/ToS-hostile origins across the 119 BEFORE anything imports. Vendor `vendor/opentabs-snapshot/` + `PIN.md` (MIT). Scaffold `catalog/descriptors/_provenance.json`. | ◆MOD `service-denylist.json`; ★NEW `vendor/opentabs-snapshot/`, `_provenance.json` | denylist host-pattern matches `service-denylist.js` loader; classify(sensitive) covers finance/health/social; nothing else reachable yet. **No INV touched.** |
| **36** | **Codegen pipeline + no-dead-entry resolution** | `codegen-opentabs.mjs` (metadata→descriptor; zod→JSON-Schema; side-effect static-scan + escalate-to-write); `verify-catalog-crosscheck.mjs`. ◆MOD `capability-catalog.js` descriptor-only→T3/T2; ◆MOD `capability-search.js` `getDescriptorBySlug`. **Smoke on ONE non-sensitive category** (productivity: airtable/asana/clickup) to prove pipeline + the no-`RECIPE_NOT_FOUND`-for-searchable-slug harness assertion. | ★NEW `codegen-opentabs.mjs`, `verify-catalog-crosscheck.mjs`; ◆MOD catalog/search | search-eval harness re-passes (recall@k, wrong-invoke=0) on smoke corpus; every searchable slug resolves non-null; recipe-path guard PASS; INV-01 hash unmoved |
| **37** | **Breadth A — Dev / Productivity** (non-sensitive) | Codegen + ship descriptors for linear, jira, confluence, clickup, asana, airtable, vercel, circleci, bitbucket, docker-hub, cloudflare, datadog(read), amplitude, … + discovery seeds. | ◆MOD generated index; ★NEW descriptors + seeds | crosscheck CI green; eval harness green on growing corpus; T3/T2 fallback verified |
| **38** | **Breadth B — Comms / Social / Content** (sensitivity-screened) | Descriptors for discord, bluesky, reddit-extra, chatgpt, claude, etc. **Only after Phase 35 denylist covers any sensitive social origins.** Per-app sensitivity check before inclusion. | ★NEW descriptors + seeds | denylist-coverage assertion for this batch; eval harness green |
| **39** | **Breadth C — Commerce / Travel / Misc** (sensitivity-screened) | Descriptors for booking, airbnb, bestbuy, costco, craigslist, dominos, chipotle, calendly, etc. Screen out / deny payment-bearing flows. | ★NEW descriptors + seeds | denylist-coverage assertion; payment-flow ops fail-closed (T3 DOM or denied) |
| **40** | **Depth 1 — top hand-ports (read)** | Hand-port ~8-12 highest-value READ heads as T1a/T1b (linear.issues.list, jira.search, datadog.query, vercel.deployments, …): own origin, executeBoundSpec-only, HEAD_HANDLER_MODULES + importScripts. | ★NEW `catalog/handlers/*.js`; ◆MOD `capability-catalog.js`, `background.js` | head-handler tests (origin-separation, no api-subdomain, no token logging); router parity; INV-02 (both doors hit registered handlers) |
| **41** | **Depth 2 — remaining hand-ports + guarded writes** | ~7-18 more heads incl. write ops that **fail-closed to DOM fallback** until live-captured (the `github.issues.create` pattern). Per-handler `[ASSUMED-ENDPOINT]` → human_needed live-UAT. | ★NEW handlers; ◆MOD catalog/background | guarded-write never stamps success; live-capture UAT recorded (not fabricated); INV-03 typed reasons byte-stable |
| **42** | **Discovery seeding hardening + tail learn** | Finalize `discovery-seeds.json` for all non-hand-ported origins; ◆MOD `network-capture.js` to read endpoint hints; verify a seeded origin learns a T2 recipe via promote-after-replay (consent-gated). | ★NEW/◆MOD `discovery-seeds.json`; ◆MOD `network-capture.js` | discovery gate keeps sensitive-confirm; synthesizer caps to declarative-executable; learned T2 outranks descriptor-T3 next visit |
| **43** | **Catalog-scale + milestone gate** | Measure index build/restore + generated-file parse at ~2,523 descriptors (split descriptors file if needed); final eval harness; 7-provider parity; full `npm test` EXIT 0; provenance/attribution complete (MIT). | ◆MOD (possible `descriptor-index.generated.js` split) | INV-01..04 all green; Walls 1/2 guards green; search performant at scale; milestone CI gate closed |

**Category-batch dependency rationale:**
- **35 (denylist) strictly first** — opt-out Auto makes the denylist the only floor; no category with a sensitive app imports before its origins are denied/sensitive-flagged.
- **36 (pipeline) before any real import** — the no-dead-entry resolution + crosscheck guard must exist before 2,523 descriptors land, or the first batch ships dead/unsafe entries.
- **37-39 (breadth) least-sensitive → most-sensitive** so denylist coverage is proven incrementally; each batch carries a denylist-coverage assertion.
- **40-41 (depth) after breadth** — hand-ports upgrade the hot subset already discoverable from breadth; writes fail-closed until live-verified.
- **42 (discovery) after breadth + depth** — seeds the tail that neither breadth-T3 nor depth-T1a covers with the API fast path via learning.
- **43 (scale gate) last** — full-corpus performance + parity + provenance close, mirroring the v0.9.99 Phase-32 milestone-gate posture.

**MV3-survivability across the build:** none of these phases touch the `agent-loop.js` setTimeout iterator (INV-04). Invoke stays a single bounded async op; codegen is build-time only; the catalog/search/network-capture edits are additive SW-module changes loaded via the existing `importScripts` chain.

---

## Sources

- FSB substrate (read live, this repo, branch `automation`, 2026-06-23): `extension/utils/capability-catalog.js` (resolve/REGISTRY/HEAD_HANDLER_MODULES/seedHeadHandlers/registerHandler), `extension/utils/capability-router.js` (invoke/_evaluateConsent/tier dispatch/_deriveSideEffectClass), `extension/utils/capability-search.js` (buildIndex/deriveSideEffect/catalogVersion/getRecipeBySlug/restore), `extension/utils/consent-policy-store.js`, `extension/utils/service-denylist.js` (isDenied/classify/load), `extension/utils/network-capture.js` (startSession/consent gate/endpoint), `extension/background.js` (importScripts load order :191-222), `scripts/package-extension.mjs` (readJsonDir/generated IIFE/handler copy :41-115), `catalog/handlers/github.js` (T1a shape + self-register + guarded-write), `catalog/descriptors/*.json` (descriptor shape), `extension/config/service-denylist.json` (denylist data shape) — **HIGH**
- FSB framing/invariants: `.planning/PROJECT.md` (v1.0.0 milestone, INV-01..04, Walls 1/2, "port + learn not clone"), `.planning/STATE.md` (Phase 26-34 decision log, tier vocabulary, opt-out-Auto Phase-30 note) — **HIGH**
- v0.9.99 substrate architecture (preserved on-disk): [ARCHITECTURE-v0.9.99-CAPABILITY-CATALOG.md](ARCHITECTURE-v0.9.99-CAPABILITY-CATALOG.md) — the tiered-runtime/MAIN-world-fetch/consent-gate design this milestone integrates with — **HIGH**
- OpenTabs op metadata (read live via authenticated `gh api repos/opentabs-dev/opentabs/...`): `plugins/airtable/{package.json (opentabs.urlPatterns/homepage), src/index.ts (plugin class + ToolDefinition[]), src/tools/list-records.ts (apiGet read op), src/tools/update-cell.ts (apiPost write op)}`; 119 plugin dirs confirmed (`plugins/` dir count); `defineTool({name,displayName,description,summary,group,input:zod,output,handle})` shape — **HIGH**
- OpenTabs license: MIT (repo `LICENSE`); attribution already in FSB README Acknowledgements — **HIGH**

---
*Architecture research for: Full App Catalog (OpenTabs Parity) — integration into FSB's v0.9.99 tiered capability substrate*
*Researched: 2026-06-23*
