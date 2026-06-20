# Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard - Research

**Researched:** 2026-06-19
**Domain:** MV3 service-worker capability runtime — closed-vocabulary recipe-as-data format, eval-free bundled interpreter (validate→bind→emit-spec, stops before the network), and a CI guard that makes the Wall-1 "no code fetched as data" line unbreakable before any recipe runs.
**Confidence:** HIGH (every integration claim re-verified against on-disk source on branch `automation-worktree`; all three libs downloaded, parsed, `node --check`'d on Node 18/20/25, and functionally exercised; `@cfworker/json-schema` rejection of forbidden fields proven live)

> This file turns the milestone-level research (`.planning/research/{STACK,PITFALLS,ARCHITECTURE,SUMMARY}.md`, dated 2026-06-19, using pre-final numbering where "Phase 25" == this **Phase 26**) into Phase-26-specific, plan-ready implementation guidance. It does not repeat that research; it verifies the on-disk mechanics and resolves the open sub-questions.

---

<user_constraints>
## User Constraints (from 26-CONTEXT.md)

### Locked Decisions
- **D-01:** PATH A — vendor `minisearch`, `jmespath`, `@cfworker/json-schema` into `extension/lib/` as global UMD/IIFE loaded via `importScripts(...)`, mirroring `extension/lib/lz-string.min.js`; access via `typeof <Global> !== 'undefined'` (the `getFSBLZStringCodec()` / `ws-client.js:98-99` pattern).
- **D-02:** `minisearch` (UMD `dist/umd`) and `jmespath` (single UMD `jmespath.js`) vendor **as-is**. `@cfworker/json-schema` is ESM/CJS-only and **must** be converted by a one-off build-time `esbuild --bundle --format=iife --global-name=...` into `extension/lib/cfworker-json-schema.min.js`. (A raw-ESM file in `lib/` fails the existing `scripts/validate-extension.mjs` `node --check` gate.)
- **D-03:** All **three** libs ship in Phase 26 (CAP-05), even though only `@cfworker/json-schema` + `jmespath` are exercised here; `minisearch` is vendored-not-wired until Phase 28.
- **D-04:** `url-template` is **OUT for v1**; endpoint templating = hand-rolled `{var}` replacer.
- **D-05:** **No manifest/permission change.** Only additive `importScripts('lib/...')` line(s) on the SW entry (lz-string precedent + esbuild SW byte-freeze).
- **D-06:** Recipe = versioned JSON, closed top-level vocab: `schemaVersion`, `id`/`slug`, `origin`, `endpoint` (URI template), `method` (GET/POST/PUT/PATCH/DELETE), `authStrategy` (closed enum, D-08), `params` (nested JSON-Schema), `request` (static param→query/header/body map), `extract` (single read-only JMESPath).
- **D-07:** **No executable/script fields, ever.** Forbidden names actively rejected + CI-guarded: `script`, `expr`, `transform`, `code`, `fn`, `js`. Anything outside the closed vocab → typed rejection.
- **D-08:** `authStrategy` v1 enum: `same-origin-cookie`, `csrf-header-scrape`, `bearer-from-storage`, `none`. **(OPEN — resolved below: defer `persisted-query-hash` and split-token to Phase 29.)**
- **D-09:** **Pagination OUT of v1.**
- **D-10:** Versioning via the `schemaVersion` envelope field, mirroring `FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION` in `extension/utils/trigger-store.js`.
- **D-11:** Interpreter **validates** (recipe + invoke params, in the SW, via `@cfworker/json-schema`) and **binds** to the selected auth-strategy handler, producing a bound spec `{ url, method, headers, body, authStrategy, csrfSource? }`. It **does NOT** perform the network call.
- **D-12:** Auth-strategy handlers here are **header/spec-shaping stubs**; cookie-carrying MAIN-world fetch + live CSRF scrape are **Phase 27 (FETCH-01/02)**.
- **D-13:** Validation is **eval-free**: `@cfworker/json-schema` only — never Ajv codegen, never `eval`/`new Function`/`import()` on a recipe field.
- **D-14:** `extract` (JMESPath) is **defined + schema-validated** here; `jmespath` is vendored and the extract helper may be unit-tested against a **static JSON fixture**. Live extraction is Phase 27.
- **D-15:** Typed-error shape: interpreter **returns** (does not throw) `{ success:false, code:'RECIPE_SCHEMA_INVALID'|'RECIPE_UNKNOWN_FIELD'|'RECIPE_OPCODE_INVALID', ...context }`, surfaced by adding `RECIPE_*` to `mcp/src/errors.ts` (mirroring the `TRIGGER_*` extension point).
- **D-16:** A **new Node static-analysis guard** (e.g. `scripts/verify-recipe-path-guard.mjs`) that (1) greps a **recipe-path file allowlist** for `eval`/`new Function`/`import(` and fails non-zero on any hit, and (2) runs the recipe schema against **accept/reject fixtures**.
- **D-17:** "Recipe path" = an **explicit hardcoded file allowlist** (interpreter, schema module, auth-strategy handler module, vendored runtime libs) — **NOT** a whole-`extension/` grep — to avoid false-positives on FSB's sanctioned `execute_js` (`extension/ai/tool-executor.js:387`, `extension/ws/mcp-bridge-client.js:922`).
- **D-18:** The guard hooks into the existing gate: added to / chained after `npm run validate:extension`, which runs in `.github/workflows/ci.yml`'s `extension` job before `npm test` and feeds `ci / all-green`.
- **D-19:** Plain CommonJS `node tests/*.test.js` appended to root `package.json` `scripts.test` `&&`-chain — **no framework** — mirroring `tests/trigger-store.test.js`. Three suites: (a) schema accept/reject fixtures, (b) interpreter binding (stops before the network), (c) eval-free guard self-test.

### Claude's Discretion
- Standalone-script vs extend-`validate-extension.mjs`-in-place for the CI guard — either acceptable; planner picks lower-friction. **(Recommendation below: standalone `scripts/verify-recipe-path-guard.mjs` chained into `validate:extension`.)**
- Exact new-file names/locations within established conventions (interpreter/schema/handlers under `extension/utils/`, alongside `trigger-store.js`; sample recipes under a `catalog/recipes/*.json`-style path if any fixtures ship).
- esbuild flags for the one-off `@cfworker` IIFE bundle (`platform: browser`, `target: chrome120`, matching existing entries).

### Deferred Ideas (OUT OF SCOPE)
- `url-template` (RFC 6570 query/explode) — v1 uses hand-rolled `{var}`.
- Pagination in the recipe schema.
- `persisted-query-hash` / Slack-style split-token auth strategies — defer to the Phase 29 bundled-handler head (see resolution below).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CAP-01** | Versioned JSON Schema defines a recipe as pure data (endpoint template, method, auth-strategy enum, param schema, static request/header map, read-only JMESPath extract); no executable/script fields. | Concrete draft schema below (closed top-level vocab, `additionalProperties:false` at every level, `schemaVersion` const). Proven: `@cfworker/json-schema` rejects forbidden `script` field via `#/additionalProperties` and bad enums via `#/properties` (live test). |
| **CAP-02** | Fixed bundled interpreter binds recipe data to a **closed enum** of bundled auth-strategy handlers; never `eval`/`new Function`/`import()`. | validate→bind→emit-spec pipeline below; closed handler-registry shape (frozen object keyed by the `authStrategy` enum). The interpreter is FSB-authored, vendored in the package (RHC-safe). Phase-26 boundary: stubs shape the spec, do NOT fetch. |
| **CAP-03** | Recipes + invocation params validated in the SW by an eval-free validator before execution; invalid/unknown-opcode → typed error. | `@cfworker/json-schema@4.1.1` (`new Validator(schema, '2020-12', false).validate(x)` → `{valid, errors[]}`), zero-dep, built for no-`eval` CSP runtimes (verified). Typed `RECIPE_*` returns mapped from `errors[].keywordLocation`/`instanceLocation`. |
| **CAP-04** | CI guard fails the build on any `eval`/`new Function`/`import(` reachable from the recipe path AND on any recipe field outside the closed vocab. | `scripts/verify-recipe-path-guard.mjs` (allowlist grep + accept/reject fixtures); wired into `validate:extension` → `extension` job → `all-green`. Whole-tree grep finds exactly 3 sanctioned sites (verified), proving the allowlist is mandatory. |
| **CAP-05** | Interpreter + the three libs ship inside the extension package; no remotely-hosted code, no manifest/permission change. | PATH-A vendoring mechanics verified end-to-end (UMD globals + the cfworker IIFE build); manifest already grants `scripting`/`debugger`/`unlimitedStorage`; SW byte-freeze means only additive `importScripts` lines. |
</phase_requirements>

## Summary

Phase 26 is entirely **service-worker-internal and Node-testable**: a recipe JSON-Schema module, a fixed bundled interpreter (validate → bind → emit a `boundRequestSpec`, **stopping before any `fetch`**), a closed auth-strategy handler registry of spec-shaping stubs, three vendored libraries, the `RECIPE_*` typed-error family in `mcp/src/errors.ts`, a CI guard scanning an explicit recipe-path file allowlist, and three plain-CommonJS test suites. It touches **no MCP routes, no dispatcher, no manifest** — those are Phases 27/28. Every load-bearing claim in CONTEXT.md was re-verified on disk and, where empirical, reproduced.

The single highest-fidelity finding: the recipe-as-data line is **mechanically enforceable today**. `@cfworker/json-schema@4.1.1` (zero deps, eval-free, the MV3-safe Ajv replacement) with `additionalProperties:false` at every level **rejects the forbidden `script` field** (`keywordLocation:#/additionalProperties`) and **rejects out-of-enum opcodes** (`#/properties`) in a live test against a draft schema. The CI guard's allowlist requirement is also empirically proven: a whole-`extension/` grep for `eval`/`new Function`/`import(` (excluding `dist/`+`lib/`) hits **exactly 3 sanctioned sites** — `tool-executor.js:387` (`eval(jsCode)`), `mcp-bridge-client.js:922` (`new Function(userCode)`), and `lattice-runtime-adapter.js:66` (an `import('lattice')` reference inside a comment) — so a broad grep would fail the build on legitimate MAIN-world `execute_js`. The guard MUST scan an explicit recipe-path allowlist.

One **correction to CONTEXT.md D-02's stated reasoning** (the conclusion is right; the *why* is version-fragile): "a raw-ESM file in `lib/` fails `node --check`" is true on **Node 20** (CI's version — `export` → SyntaxError, verified exit 1) but **PASSES on Node 25** (engines `>=24`, ES-module-syntax auto-detection — verified exit 0). The version-independent, robust reason to IIFE-bundle `@cfworker/json-schema` is that **a top-level `import`/`export` is a SyntaxError when loaded via `importScripts` in a classic service worker** (classic scripts are never parsed as modules) — so a raw-ESM file breaks at SW runtime regardless of which Node the CI gate uses. Bundle it for the runtime reason, not just the gate. The IIFE bundle (built, 45.3 kB) passes `node --check` on Node 18/20/25 and contains zero `eval`/`new Function`/`import(`/`node:` references — clean for the allowlist.

**Primary recommendation:** Vendor `minisearch`@7.2.0 (UMD, global `MiniSearch`) and `jmespath`@0.16.0 (UMD, global lowercase `jmespath`) as-is; IIFE-bundle `@cfworker/json-schema`@4.1.1 to `extension/lib/cfworker-json-schema.min.js` (global `CfworkerJsonSchema`) via a repo-pinned esbuild one-off. Build the schema with `additionalProperties:false` everywhere + an explicit forbidden-name `not` guard (defense-in-depth). Make the interpreter return typed `RECIPE_*` objects. Use a standalone `scripts/verify-recipe-path-guard.mjs` chained into `validate:extension`. Lock `authStrategy` to the four D-08 members; defer `persisted-query-hash`/split-token to Phase 29.

## Architectural Responsibility Map

Phase 26 lives wholly in the **SW tier**; the MAIN-world and MCP tiers appear only as the downstream boundary the emitted spec is handed to.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recipe schema definition + validation | SW (utils module) | — | Validation must be eval-free in the SW under MV3 CSP; `@cfworker/json-schema` runs here. |
| Invoke-param validation | SW (interpreter) | — | Params validated against the recipe's `params` sub-schema before binding. |
| Auth-strategy binding (spec shaping) | SW (handler registry) | — | A closed enum→bundled-stub dispatch; the recipe selects a handler by id, never ships handler code. |
| Endpoint `{var}` templating | SW (interpreter) | — | Hand-rolled string substitution over validated params (no `url-template`). |
| JMESPath extract definition | SW (extract helper) | — | Defined + unit-tested vs a static fixture now; the read runs in Phase 27 against a live response. |
| Emit `boundRequestSpec` | SW (interpreter output) | **MAIN world (Phase 27)** | The spec is the hand-off contract; the authenticated `fetch` consuming it is Phase 27. |
| Typed-error surfacing | SW (return shape) → **MCP server (`errors.ts`)** | — | `{success:false, code}` returned from SW; `errors.ts` passes the `RECIPE_*` code through verbatim (Phase 26 adds the regex; the dispatcher route that carries it is Phase 28). |
| CI guard (recipe-path scan + fixtures) | Build/CI (Node script) | — | Static analysis at build time; not shipped to the browser. |

## Standard Stack

### Core (the three vendored libs — all zero-dep, eval-free, SW-safe)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cfworker/json-schema` | **4.1.1** [VERIFIED: npm registry + slopcheck OK + functional test] | In-SW recipe + invoke-param validation (drafts 4/7/2019-09/2020-12) | Purpose-built for no-`eval`/`new Function` runtimes (README cites Cloudflare workers verbatim); zero deps. The MV3-safe Ajv replacement. Verified to reject forbidden fields + bad enums live. |
| `jmespath` | **0.16.0** [VERIFIED: npm registry + slopcheck OK + source grep] | Read-only response extraction (recipe stores a JMESPath string; interpreter projects/filters parsed JSON) | Single UMD `jmespath.js`; verified **0** `eval`/`new Function`/`import(`. Formally-specified side-effect-free read query language → safe side of the RHC "no command interpreter" line. Defined here; runs in Phase 27. |
| `minisearch` | **7.2.0** [VERIFIED: npm registry + slopcheck OK + source grep] | Capability search (Phase 28). **Vendored now per CAP-05, NOT wired in Phase 26.** | UMD (`dist/umd/index.js`, global `MiniSearch`); verified **0** `eval`/`new Function`/`import(`. Ships now so CAP-05 ("three libs ship in the package") is satisfied. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `esbuild` (already a devDependency) | `^0.24.0` [VERIFIED: package.json] | Build-time one-off IIFE bundle of `@cfworker/json-schema` into `lib/` | Run once to produce `extension/lib/cfworker-json-schema.min.js`; the SW itself is NOT an esbuild input (byte-freeze). |

### Alternatives Considered (rejected — see STACK.md "What NOT to Use")
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@cfworker/json-schema` | Ajv (default codegen) | Ajv compiles validators with `new Function` → **throws under MV3 SW CSP**. Only viable precompiled at build time; recipes are runtime-delivered, so cfworker's interpreted validator is required. |
| `jmespath` (read-only) | JSONata / `jsonpath-plus` | JSONata is a full server-authorable expression language = the textbook prohibited "interpreter for complex commands fetched as data". `jsonpath-plus` exposes script-expression eval. Both are Wall-1 / audit risks. |
| Hand-rolled `{var}` | `url-template@3.1.1` | RFC 6570 query/explode is unneeded in v1 (D-04, pagination OUT); a ~10-line replacer avoids the dep. Revisit only if the long tail needs `{?state,labels}`. |

**Installation (build-time devDependencies — vendored, not Node-runtime-imported):**
```bash
# Pin exact versions. These are BUILD-TIME deps: their dist files are copied/bundled into
# extension/lib/ and loaded by the browser via importScripts. Node never requires them at runtime,
# so they belong in devDependencies (alongside esbuild + lattice-cli), NOT dependencies.
npm install --save-dev minisearch@7.2.0 jmespath@0.16.0 @cfworker/json-schema@4.1.1
```

**Version verification (run 2026-06-19, this session):**
```
npm view minisearch version            -> 7.2.0   (repo github.com/lucaong/minisearch)
npm view jmespath version              -> 0.16.0  (repo github.com/jmespath/jmespath.js)
npm view @cfworker/json-schema version -> 4.1.1   (repo github.com/cfworker/cfworker)
npm view url-template version          -> 3.1.1   (OUT for v1)
```

### The exact `@cfworker` IIFE build (verified working this session)
```bash
# One-off, run from repo root using the REPO-PINNED esbuild (do NOT use npx --yes esbuild,
# which auto-downloads an unverified copy). The repo already has esbuild@^0.24.0 in devDeps.
node_modules/.bin/esbuild node_modules/@cfworker/json-schema/dist/esm/index.js \
  --bundle \
  --format=iife \
  --global-name=CfworkerJsonSchema \
  --platform=browser \
  --target=chrome120 \
  --legal-comments=none \
  --outfile=extension/lib/cfworker-json-schema.min.js
```
Verified output: 45.3 kB; header `var CfworkerJsonSchema = (() => { ... })();`; **0** `eval(`/`new Function`/`import(`/`node:` references; `node --check` exit 0 on Node 18.19, 20.18, 25.9. Exposes `CfworkerJsonSchema.Validator`.

**Two integration options for producing the bundle (planner's choice):**
- **(a) Commit the built file** to `extension/lib/cfworker-json-schema.min.js` and document the regeneration command in a comment / `package.json` script (e.g. `scripts.build:cfworker`). Lowest CI friction — CI never rebuilds it; matches how `lz-string.min.js` et al. are committed prebuilt. **Recommended.**
- **(b) Add a build step** that regenerates it. Higher friction (CI must run it; the SW byte-freeze doesn't cover `lib/` but the validate gate `node --check`s it either way). Only if reproducibility-from-source is a hard requirement.

## Package Legitimacy Audit

Run this session: `slopcheck install minisearch jmespath @cfworker/json-schema --json` → **all 3 [OK]**. Registry versions confirmed via `npm view`. No `postinstall` scripts of concern (these are build-time-vendored, not runtime-installed into the extension).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `minisearch@7.2.0` | npm | mature (7.x line) | high (widely used SW search lib) | github.com/lucaong/minisearch | [OK] | Approved (vendor as-is, wire Phase 28) |
| `jmespath@0.16.0` | npm | mature/frozen spec | high (AWS-ecosystem staple) | github.com/jmespath/jmespath.js | [OK] | Approved (vendor as-is) |
| `@cfworker/json-schema@4.1.1` | npm | mature (4.x line) | high | github.com/cfworker/cfworker | [OK] | Approved (IIFE-bundle then vendor) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

> Note: `npm audit` reported 2 vulnerabilities (1 moderate, 1 high) in the *transitive devDependency tree of the slopcheck scratch install*, not in these three zero-dependency packages themselves (all three have empty `dependencies`/`peerDependencies` — verified). No action needed for the vendored libs.

## Architecture Patterns

### System Architecture Diagram (Phase 26 data flow)

```
                 invoke_capability(slug, args)            [Phase 28 entry — NOT built here]
                            |
                            v
   +-------------------------------------------------------------------+
   |  CAPABILITY INTERPRETER  (SW: extension/utils/capability-interpreter.js)  |
   |                                                                   |
   |  1. resolveRecipe(slug)            <- catalog (Phase 28/29); in 26: passed in / fixture
   |  2. validateRecipe(recipe)         -> CfworkerJsonSchema.Validator(RECIPE_SCHEMA,'2020-12')
   |         |  invalid -> return {success:false, code:'RECIPE_SCHEMA_INVALID'|              |
   |         |             'RECIPE_UNKNOWN_FIELD'|'RECIPE_OPCODE_INVALID', errors}            |
   |         v                                                         |
   |  3. validateParams(recipe.params, args)  -> Validator(recipe.params)                    |
   |         |  invalid -> return {success:false, code:'RECIPE_SCHEMA_INVALID', errors}      |
   |         v                                                         |
   |  4. templateEndpoint(recipe.endpoint, args)  -> hand-rolled {var} replacer -> url       |
   |  5. buildRequest(recipe.request, args)       -> {query, headers, body} (static map)     |
   |  6. bindAuthStrategy(recipe.authStrategy, ...) -> AUTH_HANDLERS[strategy].shape(...)     |
   |         (closed frozen registry of SPEC-SHAPING STUBS — declare header/csrf needs)      |
   |         |  unknown strategy (defense-in-depth) -> {success:false,'RECIPE_OPCODE_INVALID'}|
   |         v                                                         |
   |  7. emit  boundRequestSpec = {url, method, headers, body, authStrategy, csrfSource?,    |
   |                               origin, extract}                    |
   +----------------------------------|--------------------------------+
                                      |  (Phase 26 STOPS HERE — no fetch)
                                      v
        =========== boundRequestSpec hand-off contract ===========
                                      |
                                      v
   [Phase 27]  capability-fetch.js  -> chrome.scripting.executeScript({world:'MAIN'})
               reads CSRF live, fetch(url,{credentials:'include'}), runs JMESPath extract
```

### Recommended Project Structure (new files; conventions per Claude's-discretion)
```
extension/
  utils/
    capability-recipe-schema.js     # NEW: exports RECIPE_SCHEMA (the JSON Schema object) + version const
    capability-interpreter.js       # NEW: validate->bind->emit-spec; returns typed {success:false,code}
    capability-auth-strategies.js   # NEW: frozen AUTH_HANDLERS registry (4 spec-shaping stubs)
  lib/
    minisearch.min.js               # NEW: vendored UMD as-is (global MiniSearch) — not wired in 26
    jmespath.min.js                 # NEW: vendored UMD as-is (global jmespath) — defined, runs Phase 27
    cfworker-json-schema.min.js     # NEW: built IIFE (global CfworkerJsonSchema)
  catalog/                          # NEW dir (does not exist yet)
    recipes/
      _fixtures/                    # accept/reject fixture recipes for the schema test + CI guard
  background.js                     # MODIFIED: +importScripts lines (additive only)
scripts/
  verify-recipe-path-guard.mjs      # NEW: allowlist grep + accept/reject fixture run
mcp/src/
  errors.ts                         # MODIFIED: +RECIPE_* to the verbatim-passthrough regex
tests/
  capability-recipe-schema.test.js  # NEW: accept/reject fixtures
  capability-interpreter.test.js    # NEW: binding -> bound spec, asserts STOPS before network
  recipe-path-guard.test.js         # NEW: planted-eval fixture is flagged
package.json                        # MODIFIED: scripts.test += 3 entries; devDeps += 3 libs
```
Naming note: CONTEXT.md and ARCHITECTURE.md both gesture at `capability-*.js` under `utils/` (alongside `trigger-store.js`). The `capability-recipe-schema.js` / `capability-auth-strategies.js` split keeps the schema and the handler registry independently testable and independently allowlisted by the CI guard.

### Pattern 1: SW module dual-export (the load-bearing vendoring/global pattern)
**What:** Every FSB SW module is an IIFE that assigns its exports to a `globalThis.<Name>` AND to `module.exports` (so `node tests/*.test.js` can `require()` it and the SW can read the global). This is also why vendored UMD/IIFE libs pass `node --check`.
**When to use:** Every new `capability-*.js` module.
**Example:**
```js
// Source: extension/utils/trigger-store.js (tail) — VERIFIED on disk
(function(global) {
  'use strict';
  // ... module body, var FSB_..._PAYLOAD_VERSION = 1; ...
  var exportsObj = { /* public API */ };
  global.FsbCapabilityInterpreter = exportsObj;       // SW reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                       // node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

### Pattern 2: vendored-lib global access (the `typeof <Global> !== 'undefined'` guard)
**What:** The SW reads a vendored lib via a `typeof` guard, never an import.
**Example:**
```js
// Source: extension/ws/ws-client.js:98-99 — VERIFIED on disk
function getFSBLZStringCodec() {
  return (typeof LZString !== 'undefined' && LZString) ? LZString : null;
}
// For Phase 26, the analogous accessors (verified global names from the package headers):
//   minisearch UMD  -> globalThis.MiniSearch          (header: global.MiniSearch = factory())
//   jmespath UMD     -> globalThis.jmespath  (LOWERCASE) (footer: this.jmespath = {})
//   cfworker IIFE    -> globalThis.CfworkerJsonSchema   (header: var CfworkerJsonSchema = (()=>{...})())
function getFSBRecipeValidator(schema, draft) {
  if (typeof CfworkerJsonSchema === 'undefined' || !CfworkerJsonSchema.Validator) return null;
  return new CfworkerJsonSchema.Validator(schema, draft || '2020-12', false /* emit all errors */);
}
```

### Pattern 3: closed auth-strategy handler registry (the Wall-1 "enum→bundled behavior" rule)
**What:** A frozen object keyed by the `authStrategy` enum, each value a **spec-shaping stub** (declares header/CSRF needs; shapes the spec). The recipe selects a handler by id — it never carries handler code. This is what keeps the interpreter "config-driven," not "a command runner."
**Example (shape, not final):**
```js
const AUTH_HANDLERS = Object.freeze({
  'none':                 { shape(spec) { return spec; } },
  'same-origin-cookie':   { shape(spec) { return { ...spec, credentials: 'include' }; } }, // Phase 27 consumes credentials
  'bearer-from-storage':  { shape(spec, ctx) { return { ...spec, _authNeed: { kind:'bearer', source:'storage' } }; } },
  'csrf-header-scrape':   { shape(spec, recipe) { return { ...spec, csrfSource: recipe.csrf || { from:'meta', selector:'meta[name=csrf-token]', header:'X-CSRF-Token' } }; } },
});
// bindAuthStrategy: const h = AUTH_HANDLERS[recipe.authStrategy];
//   if (!h) return { success:false, code:'RECIPE_OPCODE_INVALID', field:'authStrategy', value:recipe.authStrategy };
//   return h.shape(spec, recipe);
```
> NB: in Phase 26 these stubs only *declare* what Phase 27 will need (`credentials`, `_authNeed`, `csrfSource`). They perform no I/O. The `csrf` recipe field is part of the closed vocab IF `csrf-header-scrape` ships in v1 — see the schema below.

### Anti-Patterns to Avoid (from ARCHITECTURE.md Anti-Pattern 3 + PITFALLS Pitfall 1)
- **`eval`/`new Function`/`import()` on any recipe field** — Wall-1 ban + MV3 CSP throw. The CI guard exists to make this impossible on the recipe path.
- **A `transform`/`expr`/`script` recipe field "for flexibility"** — the exact drift PITFALLS Pitfall 1 names. Forbidden names are schema-rejected AND CI-guarded.
- **Performing the `fetch` in the interpreter** — that is Phase 27 in MAIN world. A SW `fetch` is Wall-2 (extension-origin, no first-party cookies). The interpreter must `return` the spec and stop.
- **Putting the CI guard on a whole-`extension/` grep** — false-positives on the 3 sanctioned `execute_js`/`import('lattice')` sites (verified). Allowlist only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema validation in the SW | A custom validator or Ajv | `@cfworker/json-schema` | Eval-free, spec-compliant (drafts 4–2020-12), zero-dep. Ajv's codegen throws under MV3 CSP. |
| Response field extraction | A custom path engine | `jmespath` (read-only) | Formally specified, side-effect-free, eval-free; gives projection/filtering without a maintained path parser. |
| Schema-version envelope | Ad-hoc version field | Mirror `FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION` (`trigger-store.js:59`) | An established FSB idiom; the read-side "wrong version → canonical empty" posture is already proven. |
| Typed-error passthrough to MCP | A new error-mapping path | Extend the `errors.ts` `TRIGGER_*` regex (line 122) | The verbatim-code passthrough is the established extension point; `RECIPE_*` joins it in one line. |
| Test harness | A test framework | Clone `tests/trigger-store.test.js` + `tests/fixtures/run-task-harness.js` | Zero-framework `node tests/*.test.js` + `installChromeMock` is the FSB convention (D-19). |

**Hand-roll ONLY:** the `{var}` endpoint replacer (D-04; ~10 lines), the interpreter dispatcher, and the auth-strategy stubs — all FSB-authored by design (RHC-safe; they ship in the package).

## Runtime State Inventory

> Phase 26 is **greenfield-additive** (new modules + vendored libs + new CI script + new tests). It introduces no rename/refactor/migration. The only edits to existing files are *additive*: `importScripts` lines in `background.js`, three `scripts.test` entries + three devDeps in `package.json`, and one regex extension in `errors.ts`. There is no stored data, live service config, OS-registered state, or build artifact carrying an old name to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 26 persists nothing. `schemaVersion` is defined for *future* persisted recipes (Phase 28/31), but Phase 26 validates in-memory only. | None |
| Live service config | None — no MCP route, dispatcher, or external service touched (Phases 27/28). | None |
| OS-registered state | None. | None |
| Secrets/env vars | None — auth-strategy stubs declare *needs*; no secret is read or written in Phase 26. | None |
| Build artifacts | The new `extension/lib/cfworker-json-schema.min.js` is a *new* build output, not a stale rename. If option (a) is chosen it is committed; regeneration is the documented esbuild one-off. | Commit the built file OR add `scripts.build:cfworker` |

## Common Pitfalls

### Pitfall 1: Dropping raw `@cfworker` ESM into `lib/` (breaks at SW runtime AND on CI Node 20)
**What goes wrong:** A raw-ESM file with top-level `export` is a SyntaxError when `importScripts`-loaded in a classic SW, and fails `node --check` on Node 20 (CI). It *passes* `node --check` on Node 25 (local) — so a developer on Node 25 may not see the gate fail locally while CI (Node 20) does.
**Why it happens:** Modern Node auto-detects ES-module syntax; `importScripts` does not (classic scripts only).
**How to avoid:** Always IIFE-bundle `@cfworker/json-schema` (verified command above). Never vendor its raw `dist/esm` or `dist/commonjs`.
**Warning signs:** `SyntaxError: Unexpected token 'export'` in `validate-extension` CI output; "works on my machine" (Node 25) vs CI red (Node 20).

### Pitfall 2: `additionalProperties:false` is necessary but not sufficient for the forbidden-name guarantee
**What goes wrong:** `additionalProperties:false` rejects ALL unknown fields (verified — `script` → `#/additionalProperties`), which technically covers `script`/`expr`/etc. But the rejection's `keywordLocation` is identical for any stray field, so you cannot tell the planner/audit "a *forbidden* field was present" vs "a typo'd field."
**Why it happens:** The closed-vocab rejection and the forbidden-name policy collapse into the same JSON-Schema keyword.
**How to avoid:** Add an explicit defense-in-depth check (a `not`/`propertyNames` clause, or an interpreter pre-scan of the recipe's keys against the forbidden list) that yields `RECIPE_UNKNOWN_FIELD` with the offending field name in context, AND keep dedicated reject fixtures for each forbidden name (`script`,`expr`,`transform`,`code`,`fn`,`js`) so the CI guard proves each is rejected. Inspect `errors[].instanceLocation` to report *which* field.
**Warning signs:** A reject fixture passes "because additionalProperties caught it" but the typed code is generic; no per-forbidden-name fixture.

### Pitfall 3: CI-guard grep matches comments/strings (both a hazard and a feature)
**What goes wrong:** A substring grep for `import(` matches `lattice-runtime-adapter.js:66`'s `import('lattice')` *inside a comment* (verified). On the recipe-path allowlist this is the *desired* strictness (the recipe path must be clean even in comments/strings), but if the allowlist is mis-scoped to include non-recipe files, the guard goes red on sanctioned code.
**Why it happens:** Static substring scanning has no AST awareness.
**How to avoid:** Keep the allowlist tight (the 3 new `capability-*.js` + the 3 vendored libs). Confirmed clean this session: the cfworker IIFE, jmespath, and minisearch all contain **0** `eval(`/`new Function`/`import(`. The guard must ALSO include a negative self-test asserting it does NOT flag the sanctioned `execute_js` sites (i.e. those files are NOT on the allowlist).
**Warning signs:** Guard fails on `tool-executor.js` or `lattice-runtime-adapter.js`; allowlist references a glob instead of explicit paths.

### Pitfall 4: cfworker asserts `format` by default in 2020-12 (unlike the spec default)
**What goes wrong:** In draft 2020-12 the spec makes `format` annotation-only, but `@cfworker/json-schema` **asserts** `format:'uri'` by default (verified: `'not a uri'` → `valid:false` in both '2020-12' and '7'). If a recipe's `origin`/`endpoint` uses `format:'uri'` but a legitimately-shaped value (e.g. a relative endpoint template `/api/{x}`) isn't a full URI, it will be rejected unexpectedly.
**Why it happens:** Implementation choice; cfworker is among the most spec-compliant but asserts formats.
**How to avoid:** Use `format:'uri'` only on `origin` (a full origin like `https://github.com`), NOT on `endpoint` (a relative template). Validate `endpoint` with a `pattern` (e.g. must start with `/`) instead. Add fixtures covering both.
**Warning signs:** Valid-looking recipes rejected on the `endpoint` field with a `format` keywordLocation.

### Pitfall 5: `engines.node >=24` vs CI `node-version: '20'` mismatch
**What goes wrong:** The repo's root `engines.node` is `>=24.0.0` but `.github/workflows/ci.yml` pins `node-version: '20'` (verified, lines 22/42/59). Anything that behaves differently across Node 20↔24 (like the `--check` ESM detection in Pitfall 1) can pass locally and fail in CI (or vice-versa).
**How to avoid:** Treat CI's Node 20 as the source of truth for the gate; the IIFE-bundle decision already neutralizes the one Node-version-sensitive behavior in this phase. Flag the mismatch to the planner (it is pre-existing, not introduced by Phase 26).

## Code Examples

### CfworkerJsonSchema validation + typed-error mapping (verified API)
```js
// Source: @cfworker/json-schema@4.1.1 README + live functional test (this session)
// new Validator(schema, draft, shortCircuit) ; validate(x) -> { valid:boolean, errors:OutputUnit[] }
// OutputUnit = { keyword, keywordLocation, instanceLocation, error }
function validateRecipe(recipe) {
  const v = getFSBRecipeValidator(RECIPE_SCHEMA, '2020-12'); // shortCircuit:false -> all errors
  if (!v) return { success: false, code: 'RECIPE_SCHEMA_INVALID', error: 'validator unavailable' };
  const r = v.validate(recipe);
  if (r.valid) return { success: true };
  // Map: an additionalProperties failure whose offending key is a forbidden name -> RECIPE_UNKNOWN_FIELD
  const addl = r.errors.find(e => /additionalProperties/.test(e.keywordLocation));
  if (addl) return { success: false, code: 'RECIPE_UNKNOWN_FIELD', instanceLocation: addl.instanceLocation, errors: r.errors };
  // An enum/method/authStrategy failure -> RECIPE_OPCODE_INVALID
  const enumErr = r.errors.find(e => /properties\/(method|authStrategy)/.test(e.keywordLocation));
  if (enumErr) return { success: false, code: 'RECIPE_OPCODE_INVALID', keywordLocation: enumErr.keywordLocation, errors: r.errors };
  return { success: false, code: 'RECIPE_SCHEMA_INVALID', errors: r.errors };
}
```
Live-test evidence (this session): valid recipe → `valid:true`; `{...,script:'...'}` → `valid:false, keywordLocation:#/additionalProperties, instanceLocation:#`; `method:'CONNECT'` → `valid:false, #/properties`; `authStrategy:'persisted-query-hash'` → `valid:false`.

### Hand-rolled `{var}` endpoint templater (D-04)
```js
// Substitute ONLY validated params; reject leftover/unknown placeholders (no eval, no url-template).
function templateEndpoint(template, params) {
  const used = new Set();
  const url = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, name) => {
    if (!(name in params)) throw { code: 'RECIPE_SCHEMA_INVALID', error: `missing param for {${name}}` };
    used.add(name);
    return encodeURIComponent(String(params[name]));
  });
  return url; // origin-pin (request origin == recipe.origin) is ENFORCED IN PHASE 27 (FETCH-03)
}
```

### Typed-error passthrough in errors.ts (one-line extension)
```ts
// Source: mcp/src/errors.ts:122 (VERIFIED) — extend the verbatim-passthrough regex.
// Current:
if (explicitCode && /^(TRIGGER_.+|INVALID_TRIGGER_ID|INVALID_TAB_ID|LIFECYCLE_UNAVAILABLE|REFRESH_POLL_INTERVAL_TOO_LOW)$/.test(explicitCode)) {
  return explicitCode;
}
// Phase 26: add RECIPE_.+ so {success:false, code:'RECIPE_*'} surfaces verbatim instead of collapsing to 'action_rejected':
//   /^(TRIGGER_.+|RECIPE_.+|INVALID_TRIGGER_ID|...)$/
// (Alternatively add the three exact codes to CODE_ONLY_ERROR_KEYS at errors.ts:54-68. The regex
//  is the lower-friction copy-target since it already matches a family by prefix.)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ajv in the SW | `@cfworker/json-schema` (interpreted, eval-free) | MV3 default CSP (`script-src 'self'`, no `unsafe-eval`) | Ajv codegen throws in the SW; cfworker is the standard MV3-safe validator. |
| Raw-ESM vendoring + hope | IIFE-bundle ESM-only libs before vendoring | Node 22+ `--check` ESM auto-detection made the failure version-dependent | The robust reason to bundle is `importScripts` classic-script semantics, not the gate. |

**Deprecated/outdated for this phase:**
- CONTEXT.md D-02's stated rationale ("raw-ESM fails `node --check`") is **CI-correct on Node 20 but not universally true** (passes on Node 25). The *decision* (bundle to IIFE) stands; the durable justification is SW classic-script execution.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `slack-style split-token` / `persisted-query-hash` should **defer to Phase 29** bundled handlers, not join the v1 `authStrategy` enum. | OPEN-question resolution (below) | If a v1 long-tail target needs split-token, it falls to DOM until Phase 29 — acceptable per the head/tail split; revisit if Phase 27's capture spike shows a high-value tail target blocked. |
| A2 | The interpreter should `return` typed errors (never throw) to match the dispatcher's `{success:false, code}` convention. | D-15 / errors.ts | Low — confirmed by `ownership-error-codes.test.js` + the back-route handler return shape; throwing would bypass the verbatim-code path. |
| A3 | `minisearch` global is `MiniSearch`, `jmespath` global is lowercase `jmespath`, cfworker IIFE global is `CfworkerJsonSchema`. | Pattern 2 | Verified from package headers/footers this session; risk is only if a different build/global-name flag is chosen. |
| A4 | Committing the prebuilt `cfworker-json-schema.min.js` (option a) is lower-friction than a CI build step. | Installation | Low — matches all existing `lib/*.min.js` (committed prebuilt); planner may choose (b) for source-reproducibility. |

**If this table looks short:** most Phase-26 claims were *verified*, not assumed — the libs were downloaded and exercised, and every integration anchor was read on disk.

## Open Questions

1. **Should `persisted-query-hash` and/or Slack-style split-token join the v1 `authStrategy` enum? (CONTEXT.md D-08)**
   - **What we know:** PITFALLS Wall-2 classifies persisted-query-hash as "conditionally replayable" (rots on the vendor's client-bundle deploy; needs the full query body as fallback or a JS-bundle re-scan) and split-token (`xoxc`+`xoxd`) as needing BOTH a JS-readable bearer AND an HttpOnly cookie attached from page context. Both involve **imperative, multi-step, page-JS-coupled** logic (bundle scraping, hash extraction, dual-token threading) that a *declarative* recipe cannot express without growing toward the Wall-1 line.
   - **What's unclear:** whether any Phase-26-era fixture target needs them. None do — Phase 26 ships no live recipes (only fixtures).
   - **Recommendation (resolves A1):** **Defer both to Phase 29's bundled imperative-handler head (T1a).** Rationale: (a) they are imperative by nature (the STACK.md "popular/hard HEAD" pattern explicitly names GitHub persisted-query and Slack split-token as *bundled-handler* material, not recipe material); (b) adding them to the v1 enum would pressure the schema to carry hash/bundle/dual-token fields that edge toward "code as data"; (c) the four D-08 members (`same-origin-cookie`, `csrf-header-scrape`, `bearer-from-storage`, `none`) cover the genuinely-declarative long tail. Lock the enum at four. This keeps the v1 schema provably non-Turing-complete and matches the milestone's head/tail split.

2. **Does the `csrf` recipe field belong in the v1 closed vocab?**
   - **What we know:** `csrf-header-scrape` is a v1 `authStrategy` member; ARCHITECTURE.md Decision B models the CSRF source as a *data* field (`csrf:{from,selector,header}`). The auth-strategy stub needs somewhere to read the source declaration.
   - **Recommendation:** Yes — add an OPTIONAL `csrf` object to the closed vocab (`{ from: enum['meta','cookie','response'], selector?: string, header: string }`, `additionalProperties:false`), required only when `authStrategy === 'csrf-header-scrape'` (express via JSON-Schema `if/then`). It is pure data (a selector + header name), not code — safely inside Wall-1. The live scrape is Phase 27.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (build/test) | esbuild bundle, `node tests/*.test.js`, `node --check` gate | ✓ | 25.9 local / 20 in CI / 18,20,21 via nvm | — |
| esbuild | one-off `@cfworker` IIFE bundle | ✓ | `^0.24.0` (devDep) | — |
| npm registry access | install the 3 libs | ✓ | — | — |
| slopcheck | package legitimacy audit | ✓ (installed this session) | — | mark `[ASSUMED]` if absent (not needed — ran clean) |
| `node_modules/.bin/esbuild` | build command | ✓ after `npm install` | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

> Nyquist is enabled (`.planning/config.json` `workflow` has no `nyquist_validation:false`). All Phase-26 behavior is automatable under the existing zero-framework `node tests/*.test.js` harness — no live browser needed (the network is Phase 27).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (plain CommonJS `node tests/*.test.js` + `assert`; pass/fail counters). VERIFIED convention: `tests/trigger-store.test.js`, `tests/ownership-error-codes.test.js`. |
| Config file | None — tests are sequenced in root `package.json` `scripts.test` `&&`-chain. |
| Quick run command | `node tests/capability-recipe-schema.test.js` (single suite, < 2 s) |
| Full suite command | `npm test` (the full `&&`-chain) and `npm run validate:extension` (gate + new CI guard) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | Valid recipe passes; each forbidden name (`script`/`expr`/`transform`/`code`/`fn`/`js`) rejected; unknown field rejected; bad `method`/`authStrategy` enum rejected; `schemaVersion` const enforced. | unit | `node tests/capability-recipe-schema.test.js` | ❌ Wave 0 |
| CAP-02 | Valid recipe → expected `boundRequestSpec {url,method,headers,body,authStrategy,csrfSource?}`; each of the 4 auth strategies shapes the spec correctly; **assert the interpreter performs NO `fetch`/`executeScript`** (no chrome.scripting call recorded by the mock). | unit | `node tests/capability-interpreter.test.js` | ❌ Wave 0 |
| CAP-03 | Invoke params validated against `recipe.params`; invalid args → `RECIPE_SCHEMA_INVALID`; unknown-opcode recipe → `RECIPE_OPCODE_INVALID`; validator runs without `eval` (passes under the no-eval harness). | unit | `node tests/capability-interpreter.test.js` | ❌ Wave 0 |
| CAP-04 | The guard flags a planted-`eval` fixture on the recipe path (non-zero exit); the guard does NOT flag the sanctioned `execute_js` sites; the guard rejects each reject-fixture recipe. | unit + CI gate | `node scripts/verify-recipe-path-guard.mjs` + `node tests/recipe-path-guard.test.js` | ❌ Wave 0 |
| CAP-05 | All three `lib/*.min.js` exist, pass `node --check`, and expose their globals (the `validate-extension` walk already `node --check`s `lib/`); `background.js` has the additive importScripts lines; manifest unchanged. | integration | `npm run validate:extension` | partial (gate exists; new files ❌ Wave 0) |
| (errors.ts) | A SW result `{success:false, code:'RECIPE_SCHEMA_INVALID'}` surfaces the code verbatim (not collapsed to `action_rejected`). | unit | new assertion in an `errors`-style test (mirror `tests/mcp-recovery-messaging.test.js`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the single affected suite (`node tests/capability-*.test.js`), < 2 s.
- **Per wave merge:** `npm run validate:extension` (manifest + `node --check` over `lib/` + the new recipe-path guard) + the three new suites.
- **Phase gate:** full `npm test` green + `npm run validate:extension` green before `/gsd:verify-work`. (The mcp build runs inside `npm test`, so the `errors.ts` change is type-checked there.)

### Wave 0 Gaps
- [ ] `tests/capability-recipe-schema.test.js` — covers CAP-01 (clone `trigger-store.test.js` structure; load `extension/utils/capability-recipe-schema.js` + the vendored cfworker IIFE; reuse `installChromeMock` if any chrome.* is touched — schema validation alone needs none).
- [ ] `tests/capability-interpreter.test.js` — covers CAP-02/CAP-03 (assert bound-spec shape AND that `chrome.scripting.executeScript` is never called via the mock recorder).
- [ ] `tests/recipe-path-guard.test.js` — covers CAP-04 (planted-eval fixture flagged; sanctioned sites NOT flagged).
- [ ] `catalog/recipes/_fixtures/` — accept (1+ valid) + reject (one per forbidden name + unknown-field + bad-enum) recipe JSON fixtures, shared by the schema test and the CI guard.
- [ ] Framework install: none — harness exists (`tests/fixtures/run-task-harness.js` provides `installChromeMock({storage:{session,local},tabs})`, VERIFIED).
- [ ] Loading the cfworker IIFE under Node for tests: the IIFE assigns `var CfworkerJsonSchema=...` (a global in script scope). Under Node, `require()` of a `var`-assigned IIFE does NOT auto-populate `module.exports`. **Test-load strategy:** either (i) `eval`/`vm.runInThisContext` the file then read `globalThis.CfworkerJsonSchema` in the test harness (test-only, not shipped — allowed, the guard scans the *recipe path*, not tests), or (ii) have `capability-recipe-schema.js`/the interpreter read the global `CfworkerJsonSchema` and, in tests, pre-load it via the harness. Document the chosen loader in Wave 0; (i) mirrors how content-bundle globals are tested.

## Security Domain

> `security_enforcement` is not disabled in config (absent = enabled). Phase 26 is the **Wall-1 enforcement phase** — its entire purpose is a security control (no code as data). The credential-replay / origin-pin / consent surface is Phases 27/30, but the input-validation + injection-prevention controls land here.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | **yes** | `@cfworker/json-schema` validates BOTH the recipe (closed vocab, `additionalProperties:false`) AND invoke params against the recipe's `params` sub-schema before any binding. Forbidden-name defense-in-depth. |
| V5.2 Sanitization / injection | **yes** | `{var}` templater `encodeURIComponent`s every substituted param and rejects unfilled placeholders → no template injection into the URL. Static `request` map (no arbitrary header/body construction from server strings). |
| V14.2 Dependency | **yes** | Three zero-dependency libs, slopcheck-clean, version-pinned, vendored (no runtime fetch of code). CI guard asserts no `eval`/`new Function`/`import(` on the recipe path. |
| V6 Cryptography | no (Phase 30 — recipe signing via Lattice Ed25519/JCS) | — never hand-rolled |
| V2 Authentication / V3 Session / V4 Access Control | no (Phases 27/30 — auth-strategy stubs only shape specs here) | — |

### Known Threat Patterns for {MV3 SW + recipe-as-data}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| "Recipe carries executable logic" (interpreter drift → Web Store ban) | Tampering / Elevation | Closed JSON-Schema vocab + forbidden-name rejection + **CI guard** on the recipe-path allowlist (CAP-04). Verified mechanically enforceable. |
| Template injection via param into URL | Tampering | `encodeURIComponent` in the `{var}` replacer; reject unfilled/unknown placeholders. |
| Cross-origin credential redirection (recipe targets origin ≠ consented) | Spoofing / Information Disclosure | Origin-pin is **Phase 27 (FETCH-03)** at fetch time; Phase 26 carries `origin` in the bound spec so Phase 27 can enforce. (Flag: do NOT claim origin-pin is done in 26.) |
| Validator that secretly `eval`s | Elevation | `@cfworker/json-schema` is eval-free (README + verified 0 `eval`/`new Function` in the bundle); it is ON the recipe-path allowlist the guard scans. |
| Forbidden field slips through as a typo'd known field | Tampering | `additionalProperties:false` + per-forbidden-name reject fixtures (Pitfall 2). |

## Sources

### Primary (HIGH confidence)
- **FSB on-disk source** (re-verified this session, branch `automation-worktree`): `extension/background.js:97` (`importScripts('lib/lz-string.min.js')`) + the full importScripts chain (lines 7-118); `extension/ws/ws-client.js:98-99` (`getFSBLZStringCodec`, `typeof LZString`); `scripts/validate-extension.mjs` (`EXT_DIRS` incl. `lib` line 79; per-file `node --check` lines 89/102-110); `esbuild.config.js` (byte-freeze D-17 lines 17-19/43-49; per-entry `platform:browser`/`target:chrome120`/`format:iife`; `stub-node-builtins` plugin lines 134-158); `mcp/src/errors.ts` (`CODE_ONLY_ERROR_KEYS` 54-68; `resolveErrorKey` 100-154; `TRIGGER_*` verbatim regex line 122); `extension/utils/trigger-store.js` (`FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION=1` line 59; dual-export IIFE tail); `tests/trigger-store.test.js` + `tests/ownership-error-codes.test.js` (zero-framework convention, `freshRequireStore`, `check(cond,msg)`); `tests/fixtures/run-task-harness.js` (`installChromeMock({storage:{session,local},tabs})` lines 131-161); `extension/ws/mcp-tool-dispatcher.js` (route-table shape lines 50-118; `TAB_NOT_OWNED` typed return); `extension/ai/tool-executor.js:387` + `extension/ws/mcp-bridge-client.js:922` (sanctioned MAIN-world `eval`/`new Function`); `extension/ai/lattice-runtime-adapter.js:66` (`import('lattice')` in a comment — third whole-tree grep hit); `extension/manifest.json` (no `content_security_policy` → MV3 default; perms incl. `scripting`/`debugger`/`unlimitedStorage`); `package.json` (`scripts.test`/`scripts.ci`/`scripts.validate:extension`; devDeps `esbuild ^0.24.0`; `engines.node >=24`); `.github/workflows/ci.yml` (`extension` job: `validate:extension` then `npm test`; `all-green needs:[extension,mcp-smoke,website]`; `node-version:'20'`).
- **Library packages** (downloaded + parsed + executed this session): `@cfworker/json-schema@4.1.1` (README Validator API; `dependencies:{}`; raw ESM `export * from`; functional test proving forbidden-field + bad-enum rejection; IIFE bundle built 45.3 kB, 0 eval/Function/import, `node --check` exit 0 on Node 18/20/25; `format:'uri'` asserted by default); `minisearch@7.2.0` (UMD header `global.MiniSearch = factory()`; 0 eval/Function/import; node-ref is a benign object key); `jmespath@0.16.0` (UMD footer `this.jmespath = {}`; 0 eval/Function/import); slopcheck `[OK]` on all three.
- **Node `--check` cross-version matrix** (reproduced this session): raw ESM in `lib/` → exit 1 on Node 20.18, exit 0 on Node 25.9; `.cjs`-forced parse → SyntaxError on `export` (confirms classic-script/importScripts semantics).

### Secondary (MEDIUM confidence)
- Milestone research `.planning/research/{STACK,PITFALLS,ARCHITECTURE,SUMMARY}.md` (2026-06-19) — library decisions, Wall-1/Wall-2, Anti-Pattern 3, head/tail split (the basis the above verifies).

### Tertiary (LOW confidence — flagged)
- None new. The OpenTabs `github-api.ts` specifics remain a proxy (not on disk) but are not load-bearing for Phase 26 (no live recipe ships here).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all three libs downloaded, version-confirmed, slopcheck-clean, parsed, `node --check`'d across Node 18/20/25, and the cfworker validator + IIFE bundle exercised functionally.
- Vendoring mechanics (PATH A): **HIGH** — global names verified from package headers; the exact esbuild command built a working 45.3 kB IIFE; the `validate-extension` `lib/` walk + `node --check` behavior reproduced.
- Architecture / interpreter boundary: **HIGH** — boundary is CONTEXT.md-locked and matches ARCHITECTURE.md Decision B; the bound-spec contract is explicit; no fetch in Phase 26.
- CI guard: **HIGH** — whole-tree grep reproduced the exactly-3 sanctioned hits, proving the allowlist requirement empirically.
- Typed errors: **HIGH** — `errors.ts:122` regex is the verified one-line copy-target.
- Pitfalls: **HIGH** — Pitfalls 1, 2, 4, 5 each reproduced or read on disk.

**Research date:** 2026-06-19
**Valid until:** ~2026-07-19 (30 days; stable libs and frozen FSB seams. The Node 20-vs-24 gate behavior is the only time-sensitive item and is neutralized by the IIFE-bundle decision.)

## RESEARCH COMPLETE
