# Phase 36: Codegen Pipeline + No-Dead-Entry Resolution - Research

**Researched:** 2026-06-24
**Domain:** Build-time OpenTabs op-metadata import (zod -> closed `params`), side-effect inference + cross-check gate, the load-bearing `resolve()` no-dead-entry fallback, catalog inlining + a one-category smoke proof. All in FSB's v0.9.99 capability substrate.
**Confidence:** HIGH (every runtime seam read live on branch `automation`; every Zod output shape EMPIRICALLY verified by running `z.toJSONSchema` against zod@4.4.3; OpenTabs transport conventions read live from the pinned repo; build deps slopcheck-verified)

## Summary

Phase 36 is a **build-time importer + two CI gates + ONE load-bearing runtime branch + a one-category smoke proof**. The runtime change is a single fallback branch in `capability-catalog.js resolve()` (currently `if (!entry) return null;` at line 304) that maps a descriptor-only slug to `{tier:'T3'}` (DOM) by default or `{tier:'T2'}` (learn-pending) when the origin is seeded. I read the router's `switch (entry.tier)` live: T3 already maps to `RECIPE_DOM_FALLBACK_PENDING` (line 773) and T2-with-no-recipe to `RECIPE_LEARN_PENDING` (line 767), so **the router needs ZERO changes** — the fallback only needs to emit the literal tier strings `'T3'`/`'T2'` (any other tier hits the `default:` at line 777 and returns `RECIPE_NOT_FOUND`, which is the bug). This is the smallest possible change that closes the discoverable-but-uninvocable dead-entry gap.

The importer (`scripts/import-opentabs-catalog.mjs`, run under `tsx`) loads each OpenTabs plugin module, reads op metadata, and calls `z.toJSONSchema(tool.input)` — the identical operation OpenTabs' own `opentabs-plugin build` performs at `platform/plugin-tools/src/commands/build.ts:746`. I empirically confirmed every flagged Zod construct: `z.union`->`anyOf`, `z.enum`->`{type:'string',enum:[...]}`, `z.record`->`{type:'object',propertyNames,additionalProperties}`, `z.nullable`->`anyOf+{type:'null'}`, optionals drop from `required`, defaults emit `"default"` AND stay required, `z.lazy` recursive -> `$ref`+`$defs`, and `.transform()` THROWS. Decisively, **`z.object()` emits `additionalProperties:false` by default** — the OpenTabs ops are plain `z.object()`, so the emitted schema is ALREADY the closed `params` contract FSB needs, with no post-processing. The Wall-1 forbidden-field pre-scan (`script/expr/transform/code/fn/js`) must walk **every `properties.*` key at every nesting depth** because `z.toJSONSchema` passes a property literally named `script` straight through — I proved a recursive walk catches it in all 6 positions (top, nested, array items, union branch, recursive `$defs`) with zero false-positives on a clean schema.

The headline correction to the milestone research: **the side-effect verb-map is NOT a single convention.** I read four plugins live — airtable uses `apiGet`/`apiPost` (named verb fns), stripe uses a single generic `api(endpoint, {method:'POST'})`, and linear/github use `graphql(...)` which is **always POST for both reads and mutations**. So inference must combine (a) named-helper patterns, (b) the `method:` option string, (c) the op-name verb prefix, and (d) a GraphQL/RPC carve-out where a POST is NOT auto-classed read, plus the override table for known-destructive POSTs — all resolving disagreements **fail-safe-high** (escalate to write/destructive).

**Primary recommendation:** Build `import-opentabs-catalog.mjs` under `tsx` (NOT jiti — slopcheck flagged jiti as a typosquat-suspect); call the Phase-35 `classifyGate()` BEFORE emitting any descriptor; emit closed-`params` descriptors to **`catalog/descriptors/*.json` top-level** (NOT a subdir — see the `readJsonDir` non-recursion finding in Pitfall 1, which forces either flat emission or a 1-line `readJsonDir` change, resolving the CONTEXT tension); add the single `resolve()` descriptor-only branch returning `{tier:'T3'|'T2'}`; author `verify-catalog-crosscheck.mjs` (side-effect derived-vs-declared, fail-safe-high) chained into `validate:extension`; add a `HEAD_HANDLER_MODULES`-cap CI assertion; extend the existing `capability-search-eval.test.js` harness with one non-sensitive smoke category (recommend **todoist** or **airtable** — productivity, non-sensitive, rich ops) plus index-size + cold-start-ms assertions.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| zod -> closed `params` extraction | Build script (`tsx`) | — | Runs at BUILD time only; NO zod/sdk/opentabs shipped (Wall 1). `z.toJSONSchema` mirrors upstream `build.ts` exactly |
| Forbidden-field pre-scan (Wall 1) | Build script + CI guard | — | Recursive property-name walk over the flattened JSON Schema; rejects any emitted descriptor with an eval-able field name |
| Side-effect class inference | Build script (verb-map + carve-out + override) | Runtime recipe-method (existing, unchanged) | Static derivation at import; the recipe-wins runtime backstop already promotes POST->mutating regardless of authored class |
| Descriptor-vs-derived cross-check | CI gate (`verify-catalog-crosscheck.mjs`) | — | Mirrors `verify-recipe-path-guard.mjs`; fails the build when a descriptor under-states a destructive op |
| No-dead-entry resolution | SW util (`capability-catalog.js resolve()`) | Router tier dispatch (existing, unchanged) | THE load-bearing runtime edit; one branch; the router already maps T3/T2 to typed reasons |
| Catalog inlining | Build script (`package-extension.mjs readJsonDir`) | — | Existing IIFE/djb2 path; descriptors-as-data; INV-01 |
| Searchable-slug -> non-null-tier proof | CI test (harness assertion) | — | Walks the descriptor corpus; asserts `resolve()` returns non-null for every slug search can return |

## Standard Stack

### Core (BUILD-TIME ONLY -- devDependencies, NEVER shipped into the extension; Wall 1)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **zod** | `4.4.3` | `z.toJSONSchema(tool.input)` -> closed JSON-Schema `params` | [VERIFIED: npm registry; slopcheck OK; ran live] The EXACT API `build.ts:746` uses; `z.toJSONSchema` is Zod-4-only; matches SDK peer `zod ^4.4.3` + plugin pins `zod ^4.3.6`. devDependency ONLY |
| **tsx** | `4.22.4` | Transpile-and-`import()` OpenTabs TS plugin modules at build (no `tsc` emit) | [VERIFIED: npm registry; slopcheck OK; no postinstall] esbuild-backed, zero-config; `node --import tsx ./scripts/import-opentabs-catalog.mjs`. **Preferred over jiti** (slopcheck flagged jiti `[SUS]`) |
| **@opentabs-dev/plugin-sdk** | `0.0.113` (devDependency) | Resolve `import { defineTool, OpenTabsPlugin }` when loading a plugin module | [VERIFIED: npm registry; latest=0.0.113] `defineTool` is an identity fn; loading it is inert. devDependency ONLY. **Hardening variant: vendor a ~30-line stub** (see Alternatives) to keep `node_modules` free of the SDK's DOM/fetch transitive surface |

### Supporting (RUNTIME -- ALL already FSB deps, REUSED unchanged)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **minisearch** | `^7.2.0` (vendored `extension/lib/minisearch.min.js`) | The capability search index over the grown descriptor set | [VERIFIED: read live] SURF-04 substrate; same `INDEX_OPTIONS` at build + `loadJSON`. No engine change |
| **@cfworker/json-schema** | `^4.1.1` (vendored) | Validate `invoke` params against the imported closed `params` schema | [VERIFIED] OpenTabs `input_schema` is standard JSON Schema (draft 2020-12) -> drops straight into the existing validator |
| **service-denylist.js classify()** | in-repo | The single source of truth the importer's `classifyGate()` call consults | [VERIFIED: read live] Phase-35 asset; the importer adds NO denylist code |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tsx` loader | `jiti@2.7.0` (OpenTabs' own devDep) | **slopcheck flagged jiti `[SUS]` (typosquat-near "vite").** Prefer tsx; if jiti is ever needed for upstream parity it must clear a `checkpoint:human-verify` first |
| Real `@opentabs-dev/plugin-sdk` devDep | Vendored ~30-line `defineTool = c=>c` + abstract `OpenTabsPlugin` stub under `vendor/opentabs-snapshot/` | Stub makes the build hermetic + keeps the SDK's DOM/fetch transitive surface out of `node_modules`. Recommended HARDENING; validate the real SDK's consumed surface first, then replace |
| Load + evaluate Zod (`z.toJSONSchema`) | Static AST parse (`@babel`/`ts-morph`) + hand-rolled converter | Rejected: ops import shared `schemas.ts`; single-file scrape can't resolve cross-file refs; re-implements `z.toJSONSchema`; drift vs upstream |
| Load + evaluate Zod | `tsc --emit` then read `dist/tools.json` | Heavier; replicates OpenTabs' gitignored `dist/`; tsconfig wrangling. `dist/` is NOT committed upstream |
| minisearch (reuse) | FlexSearch / Orama / lunr | None warranted; scaling here is a data-layout problem, not engine capability; a swap risks INV-01/SURF-04 |

**Installation:**
```bash
# BUILD-TIME devDependencies ONLY -- must NEVER appear in "dependencies" (Wall 1)
npm install -D zod@4.4.3 tsx@4.22.4 @opentabs-dev/plugin-sdk@0.0.113
# (jiti deliberately NOT installed -- slopcheck [SUS]; tsx is the loader)
# (Hardening variant: skip @opentabs-dev/plugin-sdk; vendor a ~30-line stub instead)
```

**Version verification:** All confirmed live on the npm registry 2026-06-24: `zod 4.4.3` (modified 2026-05-04), `tsx 4.22.4`, `jiti 2.7.0` (rejected), `@opentabs-dev/plugin-sdk 0.0.113`, `esbuild 0.28.1`. No `postinstall` scripts on tsx or zod.

## Package Legitimacy Audit

> Run at research time via `slopcheck install zod tsx jiti` (slopcheck 0.6.1; note: this version has NO `--json` flag).

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| zod | npm | 8+ yrs, current 4.4.3 | github.com/colinhacks/zod | **[OK]** | Approved (devDependency) |
| tsx | npm | mature, current 4.22.4 | github.com/privatenumber/tsx | **[OK]** | Approved (devDependency) |
| jiti | npm | mature, current 2.7.0 | github.com/unjs/jiti | **[SUS]** "Suspiciously close to 'vite'. Could be a typosquat." | **NOT USED** — tsx is the loader; jiti excluded from recommendations |
| @opentabs-dev/plugin-sdk | npm | pre-1.0, current 0.0.113 | github.com/opentabs-dev/opentabs | not scanned (scoped pkg) | Approved as devDependency ONLY; pin exact; re-verify importer fixtures on bump. **Hardening: replace with vendored stub** |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `jiti` — **NOT a Phase-36 dependency** (tsx is used instead). The CONTEXT/STACK note jiti as an alternative; this audit downgrades it to "do not adopt without human verification." If the planner ever swaps to jiti for upstream parity, gate it behind a `checkpoint:human-verify` task.

*slopcheck 0.6.1 ran successfully (`[OK] zod`, `[OK] tsx`, `[SUS] jiti`); `@opentabs-dev/plugin-sdk` is a scoped package not in slopcheck's scan path — it is a build-only devDependency pinned by exact version, never shipped (Wall 1), so its risk surface is the import-time metadata read only.*

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Phase-36 scope:** the pipeline + cross-check + no-dead-entry resolve + ONE non-sensitive smoke category proof (a dev/productivity app). The full 2,523-descriptor breadth import is Phases 37-39 — Phase 36 proves the machinery, not the content.
- **zod -> params flattening:** permissive `z.toJSONSchema` — `z.union`->`anyOf`, `z.record`/`z.enum` handled, optional fields preserved — while preserving the closed-vocab params contract. The forbidden-field-name pre-scan (`script/expr/transform/code/fn/js`) is the Wall-1 guard that rejects any emitted descriptor containing an eval-able field name.
- **Provenance:** each emitted descriptor carries the OpenTabs commit SHA `4b17021637d2cac12b8d84d21c40e765aa7b85e9` + its source path; descriptors land under `catalog/descriptors/opentabs/`. *(Researcher note: see Pitfall 1 — `readJsonDir` is NON-recursive, so a subdir is not inlined as-is; resolve flat-emit vs a 1-line readJsonDir change.)*
- **Runtime (Wall 1):** the importer runs under `tsx` at BUILD time only. NO runtime dependency on OpenTabs / `@opentabs-dev/plugin-sdk` / `zod` is shipped — the extension ships pure-data descriptors. `verify-recipe-path-guard.mjs` stays green.
- **Side-effect inference:** transport verb-map — `apiGet`->read; `apiPost`/`apiPut`/`apiPatch`->write; `apiDelete`->destructive — PLUS an override table for known-destructive POSTs (`void_invoice`, `delete_customer` -> destructive) and a GraphQL/RPC carve-out so POST mutations are NEVER classed `read`.
- **Cross-check failure mode:** `verify-catalog-crosscheck.mjs` compares the descriptor's declared side-effect class against the derived class; on disagreement it is **fail-safe-high** (escalate to write/destructive) and the gate FAILS the build when a descriptor UNDER-states a destructive op. Chained into `validate:extension` (-> `ci`). Proven by a destructive-op sample test (`void_invoice`, `delete_customer` class `destructive`; a GraphQL/RPC POST never `read`).
- **resolve() no-dead-entry fallback:** `capability-catalog.js resolve()` gains a SINGLE fallback branch — a descriptor-only slug (no bundled handler, no recipe) resolves to **T3 (DOM)** by default, or **T2 (learn-pending)** when the origin is seeded for discovery. A harness assertion proves every slug `search_capabilities` can return resolves to a non-null tier, so `invoke` NEVER returns `RECIPE_NOT_FOUND` for a searchable slug.
- **Integration invariants:** the generated catalog is inlined by `package-extension.mjs` via the EXISTING `readJsonDir` path with a stable `catalogVersion`; the generated `recipe-index.generated.js` IIFE shape and djb2 hashing are UNCHANGED (INV-01). The `resolve()` branch is the only load-bearing runtime edit.

### Claude's Discretion
- The exact zod edge-case handling (`z.union`/`z.record`/`z.enum`/`z.lazy`) — researcher to nail. **(NAILED — see "Genuinely-Open Mechanic 1", empirically verified.)**
- The precise override-table membership + the GraphQL/RPC detection mechanism. **(Specified — see "Genuinely-Open Mechanic 2".)**
- The chosen smoke category + the eval-harness fixture shape + the concrete SW cold-start budget. **(Recommended — see "Genuinely-Open Mechanic 4" + "Validation Architecture".)**

### Deferred Ideas (OUT OF SCOPE)
- Full breadth import of all real OpenTabs apps -> Phases 37 (BRDTH-01/02/03), 38, 39.
- Depth hand-ports (T1a/T1b handlers) -> Phases 40-41.
- Discovery seeding + tail learn -> Phase 42.
- Catalog-scale performance hardening + the milestone full-test gate -> Phase 43.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CGEN-01 | Build-time `scripts/import-opentabs-catalog.mjs` (tsx) extracts each op's metadata (slug, params via `z.toJSONSchema`, service/origin, action verb, description) into provenance-stamped descriptor JSON under `catalog/descriptors/opentabs/`, SHA-pinned; NO runtime OpenTabs/sdk dependency ships (Wall 1) | Mechanic 1 (empirically-verified zod extraction + pre-scan + the `additionalProperties:false`-by-default closed-params fact); Pitfall 1 (the `readJsonDir` non-recursion that constrains the emit path); §Code Examples (the importer skeleton) |
| CGEN-02 | Each op's side-effect class inferred from transport verb (apiGet->read; apiPost/Put/Delete->write/destructive) + override table; descriptor-vs-derived cross-check fails the build when a descriptor under-states a destructive op | Mechanic 2 (the REAL transport distribution — airtable named-verb fns, stripe `api({method})`, linear/github `graphql` always-POST; the carve-out + override table + fail-safe-high rule; the destructive-op sample test design) |
| CGEN-03 | `capability-catalog.js resolve()` gains a single fallback branch: descriptor-only slug -> T3 (DOM) or T2 (learn-pending when seeded); verified by a harness assertion over the full catalog | Mechanic 3 (the EXACT diff at line 304; the verified router `switch` that needs zero changes; the `_getDescriptor` accessor; the searchable-slug -> non-null-tier harness) |
| CGEN-04 | Generated catalog committed + inlined by `package-extension.mjs` via the existing `readJsonDir` path with a stable `catalogVersion`; IIFE shape + djb2 unchanged | Mechanic 4 (the byte-identical IIFE/djb2 confirmation; the `readJsonDir` flat-emit resolution; `catalogVersion` stability over sorted slugs); §Validation Architecture (the smoke-category eval re-pass + cold-start budget) |

## Architecture Patterns

### System Architecture Diagram

```
   BUILD / CODEGEN TIME (tsx; NO zod/sdk shipped -- Wall 1)
   +----------------------------------------------------------------------+
   | scripts/import-opentabs-catalog.mjs  (run: node --import tsx ...)     |
   |                                                                       |
   |  vendor/opentabs-snapshot/plugins/<app>/{package.json, src/*}         |
   |     |  (1) read package.json.opentabs.urlPatterns -> service/origin   |
   |     |  (2) import() src/index.ts -> plugin.tools[]  (handle NEVER run)|
   |     v                                                                 |
   |  per op:                                                              |
   |    slug        = <service-stem>.<op name>                             |
   |    params      = z.toJSONSchema(tool.input); delete params.$schema    |
   |                  (already additionalProperties:false -> closed)       |
   |    description = tool.description ; intentSynonyms <- summary/group    |
   |    actionVerb  = verb-prefix(op name)                                 |
   |    sideEffect  = INFER(helper, method-opt, name-verb, carve-out,      |
   |                        override) -> fail-safe-high  [Mechanic 2]      |
   |     |                                                                 |
   |     v  (3) FORBIDDEN-FIELD PRE-SCAN: walk every properties.* key at   |
   |           every depth; reject script/expr/transform/code/fn/js        |
   |     |  (4) classifyGate([{origin,service,slug,description}])  <------- Phase 35
   |     |        REFUSE to emit if an unclassified sensitive origin       |
   |     v                                                                 |
   |  catalog/descriptors/<app>-<op>.json  (provenance-stamped, SHA)       |
   +-------------------------------+--------------------------------------+
                                   | committed; read by:
   +-------------------------------v--------------------------------------+
   | scripts/package-extension.mjs  readJsonDir(catalog/descriptors)      |
   |   (NON-RECURSIVE -- see Pitfall 1)  -> recipe-index.generated.js     |
   |   IIFE + djb2 catalogVersion UNCHANGED (INV-01)                      |
   +-------------------------------+--------------------------------------+
                                   | CI GATES (validate:extension -> ci):
   +-------------------------------v--------------------------------------+
   | verify-recipe-path-guard.mjs (existing, stays green)                |
   | verify-classification-gate.mjs (Phase 35, existing)                 |
   | verify-catalog-crosscheck.mjs  *NEW* -- derived-vs-declared,        |
   |   fail-safe-high; FAILS if a descriptor under-states destructive     |
   | + HEAD_HANDLER_MODULES cap assertion (head stays <= ~30)            |
   +----------------------------------------------------------------------+
  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   RUNTIME invoke (the no-dead-entry path)
   +----------------------------------------------------------------------+
   | capability-router.invoke(slug,args,ctx)        [UNCHANGED]           |
   |   entry = catalog.resolve(slug, origin)        [<>MOD resolve()]     |
   |   _evaluateConsent(...) denylist->off->ask->(3.5 sensitive)->auto    |
   |   switch(entry.tier):  [UNCHANGED -- already maps the seam tiers]    |
   |     T1a -> handler ; T1b/T0 -> recipe ; T2(recipe) -> replay         |
   |     T2(no recipe) -> RECIPE_LEARN_PENDING        (line 767)          |
   |     T3            -> RECIPE_DOM_FALLBACK_PENDING  (line 773)         |
   |     default       -> RECIPE_NOT_FOUND  <-- the bug the branch closes |
   +-------------------------------+--------------------------------------+
                                   | catalog.resolve():
   +-------------------------------v--------------------------------------+
   | learned T2 (store) -> REGISTRY (T1a/T1b/T0)                          |
   |   *NEW* descriptor-only (FsbRecipeIndex.descriptors[slug]):          |
   |        seeded origin -> {tier:'T2', descriptor}  (RECIPE_LEARN_..)   |
   |        else          -> {tier:'T3', descriptor}  (RECIPE_DOM_..)     |
   |   genuinely-unknown slug -> null  (RECIPE_NOT_FOUND, correct)        |
   +----------------------------------------------------------------------+
```

### Recommended Project Structure (deltas only)
```
scripts/
  import-opentabs-catalog.mjs       # *NEW (tsx): OpenTabs metadata -> closed-params descriptors
  verify-catalog-crosscheck.mjs     # *NEW (CI): side-effect derived-vs-declared, fail-safe-high
  package-extension.mjs             # <>MOD (at most: 1-line readJsonDir recurse-1-level OR no change if flat-emit)
vendor/opentabs-snapshot/
  plugins/<app>/{package.json, src/tools/*.ts, src/index.ts}  # *NEW: metadata-only snapshot (Phase 35 scaffolded PIN.md + _provenance.json)
  (optional) sdk-stub.ts            # *NEW hardening: ~30-line defineTool/OpenTabsPlugin stub
catalog/descriptors/
  <app>-<op>.json                   # *NEW: smoke-category descriptors (FLAT -- see Pitfall 1)
  _provenance.json                  # <>MOD: Phase 36 fills apps[] with per-descriptor provenance
  _fixtures/
    seed-descriptors.json           # <>MOD: + smoke-category near-neighbors (eval corpus)
    intent-cases.json               # <>MOD: + smoke-category recall@5 cases
extension/utils/
  capability-catalog.js             # <>MOD: the ONE load-bearing branch (descriptor-only -> T3/T2) + _getDescriptor accessor
scripts/verify-recipe-path-guard.mjs # UNCHANGED (capability-catalog.js already on the allowlist; stays green)
tests/
  catalog-crosscheck.test.js        # *NEW: void_invoice/delete_customer destructive; GraphQL POST never read
  no-dead-entry.test.js             # *NEW: every searchable slug -> non-null tier
  capability-search-eval.test.js    # <>MOD: smoke category recall@5>=0.9 + wrong-invoke=0 + size/cold-start
  head-handler-cap.test.js          # *NEW: HEAD_HANDLER_MODULES length <= cap (head stays descriptors-only)
```

### Pattern 1: Descriptor-only -> typed seam reason, never RECIPE_NOT_FOUND (CGEN-03, THE quality gate)
**What:** `resolve()` returns `{tier:'T3'|'T2', descriptor}` for a searchable-but-unbacked slug; the router's existing `switch` yields `RECIPE_DOM_FALLBACK_PENDING` / `RECIPE_LEARN_PENDING`.
**When to use:** every imported descriptor.
**Key insight:** decouple **discoverable** from **invocable** — the descriptor is searchable the moment it lands; the fallback guarantees an actionable typed reason instead of a dead `RECIPE_NOT_FOUND`. Never auto-mint a recipe from guessed auth (Anti-Pattern 1).

### Pattern 2: Two derivations + escalate-to-write (CGEN-02)
**What:** import-time static derivation (helper/method/name) cross-checked against the descriptor's declared class; disagreement -> the HIGHER class; a CI guard enforces it.
**When to use:** every imported descriptor; the guard runs in `validate:extension`.
**Backstop (already live):** `capability-router._deriveSideEffectClass` (line 303) promotes POST/PUT/PATCH/DELETE to `mutating` regardless of authored class, and `capability-search.deriveSideEffect` (line 90) lets the recipe method win at index time. So a mis-authored read can never become an ungated mutation at runtime — the import-time gate catches it earlier, in PR review.

### Pattern 3: classifyGate() before emit (CGEN-01, the denylist-first floor)
**What:** the importer imports `classifyGate` from `verify-classification-gate.mjs` (Phase 35 dual-export) and calls it on the full extracted descriptor set BEFORE writing any JSON; an unclassified sensitivity-suspect origin aborts the emit.
**When to use:** the first step of the importer, after extraction, before any write.
**Contract (verified live):** `classifyGate(items, opts) -> {failures[]}` where `items` are `{origin, service?, slug?, description?}` and `opts.safeAllowlist` is a curated benign override. Call `await Denylist.load()` first. An importer that has NOT loaded sees an empty denylist -> everything fails-closed (the safe direction).

### Anti-Patterns to Avoid
- **Codegen emitting recipes (not just descriptors) for the tail:** an unreplayed synthesized recipe is confidently-wrong from birth + bloats the locked recipe contract. Emit **descriptors only**; a recipe enters `catalog/recipes/` only by hand-authoring + `validateRecipe`; a learned recipe enters via the learned-store (promote-after-replay).
- **Shipping zod/sdk/opentabs runtime:** Wall-1 violation. Import-time devDeps only; ship pure-data descriptors.
- **Emitting a novel tier string from the fallback:** anything other than the literal `'T3'`/`'T2'` hits the router `default:` (line 777) -> `RECIPE_NOT_FOUND`. Return EXACTLY `'T3'` or `'T2'`.
- **Inferring side-effect from HTTP method alone:** GraphQL/RPC mutations tunnel through POST; method-only mislabels them. Combine signals + carve-out (Mechanic 2).
- **Letting the smoke fixture leak into the shipped catalog:** keep eval near-neighbors under `catalog/descriptors/_fixtures/` (non-recursive `readJsonDir` excludes it). Real smoke-category descriptors go top-level and DO ship.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zod -> JSON Schema | A regex/AST scraper + hand-rolled converter | `z.toJSONSchema()` from zod@4 | [VERIFIED] Identical to OpenTabs `build.ts:746`; resolves cross-file `schemas.ts`; emits `additionalProperties:false` by default (the closed contract for free) |
| Closed-params validation | A new validator | The vendored `@cfworker/json-schema` | [VERIFIED] OpenTabs `input_schema` is draft-2020-12; drops straight in |
| Denylist classification before emit | A second classifier in the importer | `classifyGate()` from Phase 35 | [VERIFIED: dual-export read live] single source of truth; the importer adds zero denylist logic |
| Router seam-tier mapping | A new router branch for descriptor-only slugs | The EXISTING `switch (entry.tier)` (T3/T2 already mapped) | [VERIFIED: read live router lines 743-779] zero router changes; only `resolve()` returns the tier |
| Catalog inlining | A new generator/format | The existing `readJsonDir` + IIFE/djb2 path | [VERIFIED] INV-01; descriptors-as-data; same `catalogVersion` |
| Catalog version stamp | A new hash scheme | `_computeCatalogVersion` (djb2 over sorted slugs) | [VERIFIED: read live capability-search.js:190-200] stable across same-corpus rebuilds; restore-not-rebuild on SW wake |

**Key insight:** Phase 36 writes ONE new build script + ONE cross-check gate + ONE `resolve()` branch + tests. Almost everything else is composing primitives that already exist and are tested. The complexity is in the side-effect inference (the transport conventions genuinely differ across plugins) and in proving the no-dead-entry invariant — both resolved below.

## Genuinely-Open Mechanics -- RESOLVED

### Mechanic 1 -- zod -> closed-params extraction (CGEN-01)

**The build-time path (mirrors OpenTabs exactly):**
1. `node --import tsx ./scripts/import-opentabs-catalog.mjs` (tsx transpiles TS on import; `handle` bodies are NEVER executed — only `.input`/`.name`/`.description`/`.group`/`.summary` metadata is read, so the imperative `fetch`/`document.*` code never runs in Node).
2. For each op: `let params = z.toJSONSchema(tool.input); delete params.$schema;` — the identical operation at `platform/plugin-tools/src/commands/build.ts:746` [VERIFIED: read live]. OpenTabs' build also rejects `.transform()/.pipe()/.preprocess()` (the serializer throws), so every op's `input` is guaranteed pure-structural JSON Schema; FSB inherits that guarantee.

**EMPIRICALLY VERIFIED output shapes** (ran `z.toJSONSchema` against zod@4.4.3 live — these are the exact strings the importer + pre-scan must handle):

| Construct | Verified output |
|-----------|-----------------|
| `z.object({a, b:opt})` | `{"type":"object","properties":{"a":{...},"b":{...}},"required":["a"],"additionalProperties":false}` — **optional drops from `required`; `additionalProperties:false` BY DEFAULT** |
| `z.string().default('hi')` | `{"default":"hi","type":"string"}` AND the key STAYS in `required` |
| `z.union([str,num])` | `{"anyOf":[{"type":"string"},{"type":"number"}]}` |
| `z.enum(['open','closed','all'])` | `{"type":"string","enum":["open","closed","all"]}` |
| `z.record(z.string(),z.string())` | `{"type":"object","propertyNames":{"type":"string"},"additionalProperties":{"type":"string"}}` — value-schema `additionalProperties` is a SCHEMA, not `false` |
| `z.string().nullable()` | `{"anyOf":[{"type":"string"},{"type":"null"}]}` |
| `z.array(z.string())` | `{"type":"array","items":{"type":"string"}}` |
| `z.string().min(1).describe('X')` | `{"type":"string","minLength":1,"description":"X"}` — `.describe()` preserved (free intentSynonym seed) |
| `z.lazy(() => recursive)` (default) | `{"$ref":"#/$defs/__schema0"}` + `"$defs":{...}` |
| `z.lazy(...)` with `{cycles:'throw'}` | **THROWS** `Cycle detected` |
| `.transform(...)` | **THROWS** `Transforms cannot be represented in JSON Schema` |

**Decisive fact for the closed `params` contract:** plain `z.object()` already emits `additionalProperties:false`, which is exactly the existing FSB descriptor shape (verified: `catalog/descriptors/github-issues-create.json` has `"additionalProperties": false`). **No post-processing is needed to "close" the schema** — the importer just strips `$schema` and stamps provenance. The closed-vocab `params` is the OpenTabs `input_schema` verbatim.

**Recommended `z.toJSONSchema` options for the importer:** default target (draft-2020-12, matches `@cfworker/json-schema`). For `z.lazy` recursive ops, **default `cycles:'ref'`** ($ref+$defs) is the safe choice — do NOT use `cycles:'throw'` (it would abort the import on a legitimately-recursive op). The closed-params contract tolerates `$ref`/`$defs` (cfworker validates them). For unrepresentable types, the OpenTabs ops never use them (the build.ts guarantee), but as defense set NOTHING (let it throw) so an unexpected construct surfaces loudly in the import rather than silently emitting `{}`.

**The forbidden-field-name pre-scan (Wall-1 guard) -- the fixture-backed pass, EMPIRICALLY PROVEN:**

`z.toJSONSchema` does NOT strip a property literally named `script`/`expr`/etc. — I verified `z.object({script: z.string(), expr: z.string()})` emits `properties.script` and `properties.expr` verbatim. So the pre-scan must **recursively collect every `properties.*` key at every nesting depth** and reject the descriptor if any matches the forbidden set. I proved a recursive walk catches a forbidden name in all 6 positions with zero false-positives on a clean schema:

```
clean-create-issue => names=[owner,repo,title,body]   FORBIDDEN_HITS=[]      (PASS)
forbidden-top       => names=[script]                 FORBIDDEN_HITS=[script]
forbidden-nested    => names=[config,code,name]       FORBIDDEN_HITS=[code]
forbidden-in-array  => names=[steps,fn]               FORBIDDEN_HITS=[fn]
forbidden-in-union  => names=[payload,expr,safe]      FORBIDDEN_HITS=[expr]
forbidden-in-defs   => names=[root,js,kids]           FORBIDDEN_HITS=[js]
```

The pre-scan walk (verified working — see §Code Examples for the exact function): recurse into every object/array value; whenever a key `properties` holds an object, collect its child keys; match case-insensitively against `{script, expr, transform, code, fn, js}`. This must run over the **flattened JSON Schema** (post `z.toJSONSchema`), not the Zod source, because the forbidden name could appear in a `$defs` branch or a `z.record` value-schema. A fixture set should include one descriptor per position (top/nested/array/union/$defs) asserting rejection, plus a clean descriptor asserting pass — exactly the rows above.

**Slug + provenance:** `slug = <service-stem>.<op name>` (OpenTabs `app__op` -> FSB `app.op`; deterministic map). Each descriptor carries `provenance: {source:'opentabs', sha:'4b17021637...', sourcePath:'plugins/<app>/src/tools/<op>.ts', license:'MIT'}` and the `_provenance.json` `apps[]` array is filled with per-app entries (the Phase-35 scaffold left it empty for Phase 36 to extend — VERIFIED: read live, `"apps": []`).

### Mechanic 2 -- Side-effect verb-map + GraphQL/RPC carve-out (CGEN-02)

**THE CORRECTION (read live across 4 plugins -- the verb-map is NOT one convention):**

| Plugin | Transport helper(s) | Method signal | Read vs write detection |
|--------|--------------------|--------------:|--------------------------|
| **airtable** | `apiGet` (line 83, GET) + `apiPost` (line 113, `method:'POST'`) | named verb fn | helper name IS the verb [VERIFIED] |
| **stripe** | single generic `api(endpoint, {method?})` (default GET) | the `method:` option string | parse `{method:'POST'}` from the `handle` call [VERIFIED] |
| **linear** | `graphql(query, variables)` — **always POST** (line 107) | hardcoded POST | reads AND mutations BOTH POST; the GRAPHQL CARVE-OUT case [VERIFIED] |
| **github** | `graphql` + `turboData` (from STACK.md read) | mixed | same GraphQL always-POST issue |

So inference cannot rely on a single signal. **The combined derivation (in priority order):**

1. **GraphQL/RPC carve-out (FIRST, highest priority):** if the op's `handle` calls a GraphQL/RPC helper (`graphql`, `gql`, `gqlRequest`, or a known persisted-query path) -> the HTTP method is uninformative (always POST). Classify by the **op-name verb** instead: `list_/get_/search_/read_/fetch_/find_` -> read; `create_/update_/delete_/add_/remove_/set_/void_/archive_/merge_/move_/finalize_` -> write (delete-family -> destructive). A GraphQL op is **NEVER auto-classed read solely because no apiPost appears** — the name verb decides, and an ambiguous GraphQL op fails-safe to write.
2. **Named verb helper:** `apiGet`->read; `apiPost`/`apiPut`/`apiPatch`->write; `apiDelete`->destructive.
3. **Generic `api({method})`:** parse the `method:` option literal — GET/HEAD->read; POST/PUT/PATCH->write; DELETE->destructive. No literal -> default GET -> read, BUT cross-check against the name verb.
4. **Op-name verb prefix** (always computed; the cross-check partner): same verb sets as (1).
5. **Override table** (highest-specificity, applied last to UPGRADE only): known-destructive or known-mutating ops whose name/transport understates them.

**Disagreement rule -- FAIL-SAFE-HIGH:** order the classes `read < write < destructive`. If any two signals disagree, take the **MAX**. Example: a stripe op named `void_invoice` whose `handle` calls `api('/invoices/void', {method:'POST'})` — method-signal says write, override table says destructive -> **destructive**. A linear `graphql` op named `archiveIssue` — carve-out + name verb -> write (never read).

**Override table design (recommended membership — Claude's discretion, planner confirms):**
```js
// scripts/import-opentabs-catalog.mjs -- known-destructive / known-mutating overrides.
// Keyed by op-name (the OpenTabs `name`), value is the FLOOR class (max-merged).
const SIDE_EFFECT_OVERRIDES = {
  // known-destructive POSTs (the CONTEXT exemplars + obvious siblings)
  void_invoice: 'destructive',
  delete_customer: 'destructive',
  cancel_subscription: 'destructive',
  refund_charge: 'destructive',
  delete_record: 'destructive',
  archive_project: 'destructive',
  // known-mutating GraphQL ops that a name-verb heuristic might miss
  merge_pull_request: 'write',
};
```
The table is a FLOOR (max-merge), never a downgrade — it can only escalate. The destructive-op sample test asserts `void_invoice` and `delete_customer` classify `destructive` and a GraphQL/RPC POST (e.g. a linear `graphql` read query) is never `read`-misclassified into a writable-without-friction state.

**The cross-check gate (`verify-catalog-crosscheck.mjs`, *NEW*, mirrors `verify-recipe-path-guard.mjs`):**
- For each emitted descriptor: recompute the derived class from the stored provenance (the importer should persist the raw signals — `transportHelper`, `httpMethod`, `opNameVerb` — into the descriptor's provenance block so the gate can re-derive without re-parsing TS).
- Compare derived-MAX vs the descriptor's declared `sideEffectClass`.
- **FAIL the build** if `declared` is LOWER than `derived` (the descriptor under-states the op). A descriptor declaring `read` where any signal says write/destructive is the exact failure DENY-03's sibling closes for side-effects.
- Chained into `validate:extension` after `verify-classification-gate.mjs`:
  `"validate:extension": "... && node scripts/verify-classification-gate.mjs && node scripts/verify-catalog-crosscheck.mjs"`
- **Dual-export** (mirror Phase 35): `export { crossCheck }` so the importer can call it inline before writing, AND a CLI for the CI backstop.

**Acceptance test (`tests/catalog-crosscheck.test.js`):** feed synthetic descriptors — `{slug:'stripe.void_invoice', declared:'read', signals:{method:'POST', nameVerb:'void'}}` must FAIL (under-states destructive); `{slug:'linear.issues', declared:'read', signals:{transport:'graphql', method:'POST', nameVerb:'list'}}` must PASS (a GraphQL read query correctly stays read by NAME, but the gate confirms it's never auto-promoted-then-mislabeled); `{slug:'stripe.delete_customer', declared:'destructive', signals:{method:'POST', nameVerb:'delete'}}` must PASS (correctly stated).

### Mechanic 3 -- resolve() fallback branch -- EXACT diff (CGEN-03)

**The current code (VERIFIED: read live `capability-catalog.js`):** at line 303-304:
```js
var entry = Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : null;
if (!entry) return null;   // <-- line 304: THE dead-entry bug for imported descriptors
```

**The router consumes the result via `switch (entry.tier)` (VERIFIED: read live, lines 743-779) -- it ALREADY maps the seam tiers, so NO router change is needed:**
```
case 'T2': out = entry.recipe ? <replay> : _err('RECIPE_LEARN_PENDING', {slug});   // line 765-767
case 'T3': out = _err('RECIPE_DOM_FALLBACK_PENDING', {slug});                       // line 773
default:   out = _err('RECIPE_NOT_FOUND', {slug});                                  // line 777 -- the bug if tier is novel
```

**The MINIMAL single fallback branch (insert at line 304, replacing the bare `return null`):**
```js
// --- *NEW* CGEN-03: descriptor-only no-dead-entry fallback ---------------------
// A slug that is SEARCHABLE (in FsbRecipeIndex.descriptors, indexed by
// capability-search.js) but has NO REGISTRY handler and NO recipe would otherwise
// return null here -> the router returns RECIPE_NOT_FOUND for a slug search can
// surface (the discoverable-but-uninvocable dead entry). Resolve it to a non-null
// SEAM tier so the router's existing switch yields an actionable typed reason:
//   - seeded origin  -> T2 (no recipe) -> RECIPE_LEARN_PENDING (discovery can learn it)
//   - else           -> T3             -> RECIPE_DOM_FALLBACK_PENDING (DOM completes it)
// We NEVER fabricate a recipe (never auto-mint from guessed auth) -- T2 here carries
// NO recipe, so the router takes its RECIPE_LEARN_PENDING leg, not a replay.
if (!entry) {
  var desc = _getDescriptor(slug);
  if (desc) {
    var seeded = _isSeededOrigin(desc.service || (desc.provenance && desc.provenance.origin) || null);
    return {
      tier: seeded ? 'T2' : 'T3',   // EXACT literals -- any other string hits the router default -> RECIPE_NOT_FOUND
      descriptor: desc
      // NO recipe field: T2 here is learn-pending, T3 is DOM-pending; both are seam tiers the router maps without executing.
    };
  }
  return null;   // genuinely-unknown slug ONLY -> RECIPE_NOT_FOUND (correct)
}
```

**The `_getDescriptor` accessor (NEW, mirrors the existing `_getRecipeBySlug` typeof-guard at line 54-60):** read the descriptor set from `FsbRecipeIndex.descriptors` directly (the build-time generated global). Two viable sources:
```js
// Option A (recommended -- zero new capability-search export, smallest surface):
function _recipeIndex() {
  return (typeof FsbRecipeIndex !== 'undefined' && FsbRecipeIndex) ? FsbRecipeIndex : null;
}
function _getDescriptor(slug) {
  var idx = _recipeIndex();
  if (!idx || !Array.isArray(idx.descriptors)) return null;
  // small linear scan is fine at smoke scale; at full scale build a slug->descriptor
  // map ONCE (lazy-memoized) to stay O(1) -- the descriptors array is static post-load.
  for (var i = 0; i < idx.descriptors.length; i++) {
    var d = idx.descriptors[i];
    if (d && d.slug === slug) return d;
  }
  return null;
}
// Option B (ARCHITECTURE.md's <>MOD): add getDescriptorBySlug to capability-search.js
// and call it via a typeof-guarded _search() accessor. Equivalent; one more export.
```
**Recommendation: Option A** — `capability-search.js` does NOT currently export `getDescriptorBySlug` (VERIFIED: read live, exports end at line 407 with no such method), so Option A avoids a second module edit and keeps the load-bearing change to ONE file. At full scale (Phase 43) memoize a `slug->descriptor` map to avoid the linear scan; at smoke scale the scan is negligible.

**`_isSeededOrigin` (the "seeded" signal):** CONTEXT defers discovery-seeds to Phase 42, so in Phase 36 there is no `discovery-seeds.json` yet. The "seeded" determination should read the descriptor's own `backing` field (ARCHITECTURE.md Decision B): the importer stamps `"backing":"learn"` when the origin is seeded and `"backing":"dom"` (or absent) otherwise. For Phase 36's smoke category (non-sensitive, no seeds), descriptors stamp `backing:"dom"` -> all resolve to **T3**. So:
```js
function _isSeededOrigin(serviceOrOrigin) {
  // Phase 36: seeds land in Phase 42. The descriptor's own backing flag is the signal.
  // (read in _getDescriptor's result: desc.backing === 'learn' -> T2). Until Phase 42
  // stamps any 'learn' backing, every smoke descriptor is backing:'dom' -> T3.
  return false; // no seed source this phase; T2 path is exercised by a fixture with backing:'learn'
}
```
Simpler and more honest: make the branch read `desc.backing === 'learn' ? 'T2' : 'T3'` directly (no `_isSeededOrigin` helper needed this phase). A test fixture with `backing:'learn'` proves the T2 leg; the smoke category (all `backing:'dom'`) proves the T3 leg. **Recommendation: use `desc.backing === 'learn' ? 'T2' : 'T3'`** — it is the exact ARCHITECTURE.md Decision-B contract and needs no Phase-42 dependency.

**The harness that proves every searchable slug -> non-null tier (`tests/no-dead-entry.test.js`):**
```
load the smoke-category descriptor corpus (the same set package-extension inlines)
set globalThis.FsbRecipeIndex = { recipes:[...], descriptors:[...corpus...] }
require capability-catalog.js
for each descriptor d in corpus:
  r = FsbCapabilityCatalog.resolve(d.slug, 'https://' + d.service)
  assert r !== null                                  // no dead entry
  assert ['T0','T1a','T1b','T2','T3'].includes(r.tier)  // a real seam tier
  assert r.tier !== undefined
// negative control: a slug NOT in the corpus resolves to null (correct RECIPE_NOT_FOUND)
assert FsbCapabilityCatalog.resolve('nonexistent.slug', 'https://x.com') === null
```
This is the CGEN-03 acceptance gate. It directly proves "invoke NEVER returns RECIPE_NOT_FOUND for a searchable slug" by proving `resolve()` returns a router-dispatchable tier for every corpus slug.

### Mechanic 4 -- Catalog inlining + scale proof (CGEN-04)

**`readJsonDir` is NON-RECURSIVE (VERIFIED: read live, `package-extension.mjs:54`):** `readdirSync(absDir).filter(name => name.endsWith('.json'))` — a `catalog/descriptors/opentabs/` SUBDIR is NOT descended into. This is load-bearing and intentional (it's how `_fixtures/` is excluded). **This creates a direct tension with CONTEXT's "descriptors land under `catalog/descriptors/opentabs/`" + "readJsonDir unchanged".** Resolution (planner picks ONE; both keep the IIFE/djb2 byte-identical):
- **Option A (recommended -- flat emit, ZERO readJsonDir change):** the importer emits to `catalog/descriptors/<app>-<op>.json` top-level (the existing convention — `github-issues-create.json` etc. are already flat). Provenance lives INSIDE each descriptor (not in a path). `readJsonDir` picks them up unchanged. **This honors "readJsonDir unchanged" literally; the `opentabs/` path becomes a logical namespace via the `<app>-` filename prefix + the `provenance.source:'opentabs'` field, not a physical subdir.**
- **Option B (subdir + 1-line recurse):** keep `catalog/descriptors/opentabs/*.json` and change `readJsonDir` to descend one level for that subdir. This is a `readJsonDir` change (contradicts "unchanged") but keeps the physical namespace. The validate-extension.mjs `readJsonDir` (line 80) would need the SAME change for the staleness check to match.

**Recommendation: Option A (flat emit).** It satisfies the hard INV-01 / "readJsonDir + IIFE + djb2 unchanged" constraints literally, requires zero generator changes, and the `provenance.sourcePath` field preserves the OpenTabs origin path for audit. The CONTEXT's "land under `catalog/descriptors/opentabs/`" is best read as the logical source namespace (recorded in provenance), not a filesystem subdir that the non-recursive reader would silently drop. **Flag this for discuss-phase if the planner reads CONTEXT as mandating a physical subdir** — that would force Option B and a `readJsonDir` edit.

**IIFE + djb2 byte-identity (INV-01, VERIFIED):** the generated `recipe-index.generated.js` is `(function(global){ var DATA = {recipes,descriptors}; global.FsbRecipeIndex = DATA; ... })`. Adding more descriptors only grows the `DATA` JSON literal — the IIFE wrapper, the dual-export tail, and `_computeCatalogVersion` (djb2 over sorted slugs, capability-search.js:190-200) are untouched. `catalogVersion` shifts ONLY when the slug set changes (a content hash), so a same-corpus rebuild restores rather than rebuilds the SW index (verified restore-on-base-match at capability-search.js:159-175). **No code change to the IIFE/hash path.**

**The eval-harness fixture (extend the EXISTING `capability-search-eval.test.js`):** the harness is already built (VERIFIED: read live) — it loads `catalog/descriptors/_fixtures/seed-descriptors.json` (the near-neighbor corpus) + `intent-cases.json` (`{intent, expectedSlug}` cases), runs `buildIndex` + `search`, and asserts `recall@5 >= 0.9` AND `wrong-invoke === 0` (lines 118-119), plus the `toJSON->loadJSON(INDEX_OPTIONS)` round-trip (lines 124-138). For Phase 36, **extend the two fixtures with the smoke category**:
- Add ~8-12 smoke-category descriptors to `seed-descriptors.json` with cross-app near-neighbors (e.g. todoist `create_task` near asana `create_task`, linear `create_issue`, github `create_issue` — the wrong-invoke pressure-test).
- Add ~3-4 intent phrases per smoke op to `intent-cases.json` (the existing fixtures use 3 phrases/op; match that).
- The harness's existing `recall@5 >= 0.9` + `wrong-invoke === 0` assertions then gate the smoke category automatically — **no harness code change, only fixture data.**

**Concrete SW cold-start budget (from research/STATE SCALE-01, scoped to the smoke proof):** the milestone budget is **serialized index < ~1-2 MB** and **`loadJSON` + first `search` < ~50-100 ms** at the full ~2,523-descriptor scale. For the Phase-36 ONE-category smoke proof, set a proportional gate and prove the MEASUREMENT MACHINERY (Phase 43 re-runs it at full scale):
- **Smoke target:** serialized index for the smoke category (~10-30 descriptors) **< ~50 KB**; `loadJSON(serialized, INDEX_OPTIONS) + first search` **< ~10 ms** on the test host. These are generous for the size — the point is to ADD the size + load-time assertions to the harness now so they exist before breadth lands.
- **How to measure (add to `capability-search-eval.test.js`):**
  ```js
  const serialized = JSON.stringify(ms.toJSON());
  check(serialized.length < 50 * 1024, `smoke index serialized < 50KB (got ${(serialized.length/1024).toFixed(1)}KB)`);
  const t0 = performance.now();
  const restored = MiniSearch.loadJSON(serialized, INDEX_OPTIONS);
  restored.search('create a task');
  const ms_elapsed = performance.now() - t0;
  check(ms_elapsed < 10, `smoke loadJSON+first-search < 10ms (got ${ms_elapsed.toFixed(2)}ms)`);
  ```
- **Index-layout discipline (already in place, VERIFIED):** `INDEX_OPTIONS.fields` indexes only searchable text (`intentSynonyms`/`description`/`service`/`actionVerb`); `storeFields` is `['slug','service','sideEffectClass','description']` — `params` is NOT indexed or stored (schema-on-hit via the slug->descriptor map). So the index bytes stay small; the `params` JSON Schema bulk lives in the inlined `descriptors[]`, parsed once at SW wake, not in the search index. This is the SCALE-01 data-layout the full scale depends on; the smoke proof confirms it holds.

**HEAD_HANDLER_MODULES cap assertion (the "keep the head capped" CI gate):** `HEAD_HANDLER_MODULES` currently has 3 entries (github/slack/notion, VERIFIED line 215-219). Add `tests/head-handler-cap.test.js` asserting `HEAD_HANDLER_MODULES.length <= CAP` (CAP ~30 per the milestone "head stays 15-30"). This makes "breadth = descriptors-only, the head never sprawls into 2,523 imperative handlers" a CI failure, not a hope. Phase 36 adds ZERO head handlers (it's pipeline + descriptors only), so the assertion passes at 3.

## Common Pitfalls

### Pitfall 1: readJsonDir non-recursion silently drops a descriptor subdir
**What goes wrong:** the importer emits to `catalog/descriptors/opentabs/*.json` (per CONTEXT's wording) but `readJsonDir` (package-extension.mjs:54) is `readdirSync(...).filter(.json)` — NON-recursive — so the subdir is never inlined; the shipped catalog is empty of the new descriptors, the smoke eval "passes" over an empty corpus, and the dead-entry harness has nothing to check.
**Why it happens:** assuming `readJsonDir` recurses; the same assumption that `_fixtures/` is auto-excluded (it is — for the same non-recursion reason).
**How to avoid:** Option A (flat emit to `catalog/descriptors/*.json` top-level; provenance INSIDE the descriptor) — recommended, zero generator change. OR Option B (subdir + a 1-line recurse in BOTH package-extension.mjs:54 AND validate-extension.mjs:80). See Mechanic 4.
**Warning signs:** `catalogVersion` djb2 hash unchanged after adding descriptors; `recipe-index.generated.js` descriptor count unchanged; the eval harness reporting `over 0 fixtures`.

### Pitfall 2: Side-effect inferred from HTTP method alone -> GraphQL mutation mislabeled read
**What goes wrong:** linear/github ops go through `graphql()` (always POST). A "POST -> write" rule labels a `graphql` READ query as write (annoying friction) OR a name-only rule that defaults missing-method to read labels a `graphql` MUTATION as read (the dangerous direction — fully writable under Auto with no friction).
**Why it happens:** the transport conventions genuinely differ (airtable named-verb fns vs stripe generic `api({method})` vs linear/github `graphql` always-POST — all VERIFIED live).
**How to avoid:** the GraphQL/RPC carve-out FIRST (Mechanic 2): a GraphQL op is classified by its NAME verb, never auto-read; combine helper + method-option + name-verb signals; fail-safe-high on disagreement; override table for known-destructive POSTs.
**Warning signs:** a `*Mutation`/`archive*`/`delete*` GraphQL op with `sideEffectClass:'read'`; the cross-check gate not failing on a hand-planted under-stated destructive fixture.

### Pitfall 3: The fallback emits a tier the router doesn't map -> RECIPE_NOT_FOUND persists
**What goes wrong:** `resolve()` returns `{tier:'dom'}` or `{tier:'descriptor'}` or `{tier:'T3-pending'}` instead of the literal `'T3'`/`'T2'`; the router `switch` hits `default:` (line 777) and returns `RECIPE_NOT_FOUND` — the exact bug the fallback was meant to close, now silently re-introduced.
**Why it happens:** inventing a descriptive tier name instead of reusing the router's existing case labels.
**How to avoid:** return EXACTLY `'T3'` or `'T2'` (the strings the router's `case 'T3':`/`case 'T2':` match). The no-dead-entry harness (Mechanic 3) asserts `r.tier` is in the seam-tier set; add a sibling assertion that an actual `invoke` through a router stub returns `RECIPE_DOM_FALLBACK_PENDING`/`RECIPE_LEARN_PENDING` (NOT `RECIPE_NOT_FOUND`) for a corpus slug.
**Warning signs:** the router test logging `RECIPE_NOT_FOUND` for a known descriptor slug; `default:` branch hit in coverage.

### Pitfall 4: Forbidden field name survives in a nested/`$defs`/union branch
**What goes wrong:** the pre-scan checks only TOP-LEVEL `params.properties` keys; a forbidden name (`code`, `js`, `expr`) nested inside an object property, an array `items`, a `z.union`->`anyOf` branch, or a recursive `z.lazy`->`$defs` block slips through and ships an eval-able field name (Wall-1 breach).
**Why it happens:** `z.toJSONSchema` passes a property literally named `script` straight through (VERIFIED) and nests it wherever the Zod source put it.
**How to avoid:** the pre-scan RECURSES — collect every `properties.*` key at every depth (proven in all 6 positions, Mechanic 1). Run it over the FLATTENED JSON Schema, not the Zod source. Fixture set: one descriptor per position asserting rejection + a clean one asserting pass.
**Warning signs:** a descriptor with a `properties.code`/`properties.js` in a `$defs` or `anyOf` block; `verify-recipe-path-guard.mjs` is for the recipe-PATH files, NOT descriptor field names — it will NOT catch this; the pre-scan is a SEPARATE guard.

### Pitfall 5: Shipping zod/sdk into the extension (Wall-1 breach via a careless import)
**What goes wrong:** `import { z } from 'zod'` or `@opentabs-dev/plugin-sdk` leaks into a SHIPPED file (or `dependencies` instead of `devDependencies`), putting Zod runtime in the MV3 bundle.
**Why it happens:** the importer and the runtime live in the same repo; an accidental shared import.
**How to avoid:** zod/tsx/sdk are `devDependencies` ONLY; the importer is `scripts/*.mjs` (never `importScripts`'d); the shipped catalog is pure-data JSON inlined by the IIFE. `verify-recipe-path-guard.mjs` greps the recipe-path files for `import(` and stays green because no shipped capability file imports zod.
**Warning signs:** zod in `package.json` `dependencies`; `extension/**` referencing zod; the recipe-path guard's `import(` check firing.

## Code Examples

### The importer skeleton (CGEN-01 -- the load-bearing path, run under tsx)
```js
// scripts/import-opentabs-catalog.mjs  -- run: node --import tsx ./scripts/import-opentabs-catalog.mjs
// BUILD-TIME ONLY. NO zod/sdk shipped. Source: mirrors platform/plugin-tools/src/commands/build.ts:746.
import { z } from 'zod';                       // devDependency; build-time only
import { classifyGate } from './verify-classification-gate.mjs';  // Phase 35 dual-export
import Denylist from '../extension/utils/service-denylist.js';     // for classifyGate's classify()
// ... read vendor/opentabs-snapshot/plugins/<app> ...

await Denylist.load();                         // populate classify() from the committed roster

const FORBIDDEN = new Set(['script','expr','transform','code','fn','js']);
function collectPropertyNames(node, acc) {     // VERIFIED to catch forbidden names at every depth
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { for (const x of node) collectPropertyNames(x, acc); return acc; }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const pn of Object.keys(v)) acc.add(pn);
    }
    collectPropertyNames(v, acc);
  }
  return acc;
}
function preScanForbidden(params) {
  const names = collectPropertyNames(params, new Set());
  return [...names].filter(n => FORBIDDEN.has(String(n).toLowerCase()));
}

// For each plugin module imported via tsx:
//   const plugin = (await import(pluginIndexUrl)).default-or-named-instance;
//   for (const tool of plugin.tools) {
const params = z.toJSONSchema(tool.input);     // draft-2020-12; additionalProperties:false by default
delete params.$schema;
const hits = preScanForbidden(params);
if (hits.length) throw new Error(`Wall-1: op ${tool.name} emits forbidden field name(s): ${hits.join(',')}`);

const sideEffectClass = inferSideEffect(tool, transportHelper, httpMethod);  // Mechanic 2, fail-safe-high
const descriptor = {
  slug: `${serviceStem}.${tool.name}`,
  service,                                       // from package.json.opentabs.urlPatterns
  intentSynonyms: synthSynonyms(tool),           // >=3-4 phrases from displayName/summary/description
  description: tool.description,
  actionVerb: verbPrefix(tool.name),
  sideEffectClass,
  params,
  backing: seeded ? 'learn' : 'dom',             // drives resolve() T2/T3 (Mechanic 3)
  provenance: { source: 'opentabs', sha: '4b17021637d2cac12b8d84d21c40e765aa7b85e9',
                sourcePath: `plugins/${app}/src/tools/${opFile}`, license: 'MIT',
                signals: { transportHelper, httpMethod, opNameVerb: verbPrefix(tool.name) } }
};

// GATE BEFORE EMIT: refuse an unclassified sensitive origin (denylist-first).
const { failures } = classifyGate([{ origin: `https://${service}`, service, slug: descriptor.slug, description: descriptor.description }]);
if (failures.length) throw new Error('classifyGate refused emit:\n' + failures.join('\n'));
// ... write catalog/descriptors/<app>-<op>.json (FLAT -- Pitfall 1) ...
```

### The resolve() fallback (CGEN-03 -- the ONE load-bearing runtime edit)
```js
// extension/utils/capability-catalog.js -- the typeof-guarded descriptor accessor (mirror _getRecipeBySlug:54)
function _recipeIndex() {
  return (typeof FsbRecipeIndex !== 'undefined' && FsbRecipeIndex) ? FsbRecipeIndex : null;
}
function _getDescriptor(slug) {
  var idx = _recipeIndex();
  if (!idx || !Array.isArray(idx.descriptors)) return null;
  for (var i = 0; i < idx.descriptors.length; i++) {
    if (idx.descriptors[i] && idx.descriptors[i].slug === slug) return idx.descriptors[i];
  }
  return null;
}
// ... inside resolve(slug, origin), REPLACE `if (!entry) return null;` (line 304) with: ...
if (!entry) {
  var desc = _getDescriptor(slug);
  if (desc) {
    return {
      tier: (desc.backing === 'learn') ? 'T2' : 'T3',  // EXACT literals the router switch maps
      descriptor: desc                                  // NO recipe: T2=learn-pending, T3=dom-pending
    };
  }
  return null;  // genuinely-unknown slug -> RECIPE_NOT_FOUND (correct)
}
```

## State of the Art

| Old Approach (milestone STACK/ARCH assumption) | Verified reality (this research) | Impact |
|------------------------------------------------|----------------------------------|--------|
| Side-effect from a uniform `apiGet`/`apiPost` verb-map | Transport differs per plugin: airtable named-verb fns, stripe `api({method})`, linear/github `graphql` always-POST | Inference must combine helper + method-option + name-verb + GraphQL carve-out; fail-safe-high (Mechanic 2) |
| `z.toJSONSchema` needs post-processing to close `params` | Plain `z.object()` emits `additionalProperties:false` by DEFAULT | The closed-vocab `params` is the OpenTabs `input_schema` verbatim; just strip `$schema` |
| Descriptors land in a `catalog/descriptors/opentabs/` subdir, readJsonDir unchanged | `readJsonDir` is NON-recursive -> a subdir is silently dropped | Flat-emit (Option A) OR a 1-line recurse (Option B); cannot have BOTH a subdir AND unchanged readJsonDir (Pitfall 1) |
| `resolve()` fallback needs a `getDescriptorBySlug` search export + router awareness | The router `switch` ALREADY maps T3/T2; descriptors readable from `FsbRecipeIndex.descriptors` directly | Zero router change; zero search-export needed (Option A `_getDescriptor`); ONE file edited |
| jiti is an equal-valid loader alternative | slopcheck flags jiti `[SUS]` (typosquat-near "vite") | Use tsx; gate any jiti adoption behind human-verify |

**Deprecated/outdated:** none — this is a greenfield pipeline within a fixed substrate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CONTEXT's "descriptors land under `catalog/descriptors/opentabs/`" means a logical source namespace (recorded in provenance), not a mandatory filesystem subdir | Mechanic 4 / Pitfall 1 | If a physical subdir is mandated, Option A (flat emit) is wrong and Option B (readJsonDir + validate-extension recurse edit) is required — contradicting "readJsonDir unchanged". **Flag to discuss-phase.** MEDIUM risk; both options are specified so the planner can pick |
| A2 | The "seeded" signal for the T2 leg is the descriptor's `backing:'learn'` field (ARCHITECTURE Decision B), since discovery-seeds.json is Phase 42 | Mechanic 3 | If "seeded" must consult a real seed source in Phase 36, the `backing` proxy is insufficient; but CONTEXT defers seeds to 42, so the proxy is the intended Phase-36 mechanism. LOW risk |
| A3 | Override-table membership (`void_invoice`, `delete_customer`, `cancel_subscription`, `refund_charge`, `delete_record`, `archive_project`, `merge_pull_request`) — CONTEXT names only the first two; the rest are inferred siblings | Mechanic 2 | A missing destructive override under-states an op -> the cross-check gate's name-verb + method signals still catch most; the table only ADDS coverage. The two CONTEXT exemplars are the acceptance test. LOW risk (table is a max-merge floor, never a downgrade) |
| A4 | Smoke category = a non-sensitive dev/productivity app (recommend todoist or airtable); exact pick is Claude's discretion | Validation Architecture | If the chosen app trips the classification gate (it should not — both are benign per the Phase-35 119-app sweep), the importer aborts. Verify the pick is in the §119-app "benign" list. LOW risk |
| A5 | OpenTabs `build.ts` rejects `.transform()/.pipe()/.preprocess()` so every op's `input` is pure-structural (FSB inherits the guarantee) | Mechanic 1 | If a plugin slipped a transform past upstream, `z.toJSONSchema` THROWS in the importer (verified) -> the import fails loudly, not silently. The fail-loud direction is safe. LOW risk |

## Open Questions (RESOLVED)

> Both resolved at plan time and baked into plans 36-01/36-04. Markers below.

1. **Physical subdir vs flat emit for descriptors (A1).** — **RESOLVED: Option A (flat emit).** `readJsonDir` non-recursion verified in BOTH `package-extension.mjs` and `validate-extension.mjs`; descriptors emit FLAT as `catalog/descriptors/opentabs__<svc>__<op>.json` with provenance in-descriptor. `opentabs/` is a logical namespace (filename prefix + `provenance.source`), not a physical subdir.
   - What we know: `readJsonDir` is non-recursive; CONTEXT says both "land under `opentabs/`" AND "readJsonDir unchanged".
   - What's unclear: whether the planner/user reads `opentabs/` as a filesystem path or a logical namespace.
   - Recommendation: Option A (flat emit, provenance-in-descriptor) — honors "readJsonDir unchanged" literally. Surface to discuss-phase if a physical subdir is wanted; then Option B (1-line recurse in BOTH readers).

2. **Smoke category pick.** — **RESOLVED: todoist** (clean read+write ops, non-sensitive, good near-neighbor pressure against asana/linear `create_task`).
   - What we know: must be non-sensitive, dev/productivity, rich ops; benign per the Phase-35 sweep.
   - What's unclear: todoist vs airtable vs asana vs clickup.
   - Recommendation: **todoist** (clean read+write ops, obviously non-sensitive, good near-neighbor pressure against asana/linear `create_task`) or **airtable** (already the ARCHITECTURE worked example with verified `apiGet`/`apiPost` ops). Either proves the machinery.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | the importer + all tests | ✓ | >=24 (engines floor) | — |
| npm (registry access) | install zod/tsx devDeps | ✓ | — | commit generated descriptors so CI builds without the OpenTabs tree |
| zod (devDep) | `z.toJSONSchema` | install needed | 4.4.3 | none — required for extraction |
| tsx (devDep) | transpile-import plugin TS | install needed | 4.22.4 | jiti is `[SUS]` — do NOT use as fallback without human-verify |
| @opentabs-dev/plugin-sdk (devDep) | resolve `defineTool` import | install needed | 0.0.113 | vendored ~30-line stub (hardening — recommended) |
| vendor/opentabs-snapshot/plugins/<app>/src | the importer's metadata input | partial | Phase 35 scaffolded PIN.md + empty `_provenance.json` | Phase 36 vendors the actual metadata files for the smoke app(s) |
| `zip` CLI | package-extension.mjs final archive | ✓ (existing) | — | — |

**Missing dependencies with no fallback:** zod, tsx (both must be installed as devDeps; zod has no substitute for `z.toJSONSchema`).
**Missing dependencies with fallback:** `@opentabs-dev/plugin-sdk` (vendor a stub); the OpenTabs plugin metadata files (Phase 35 left only the PIN scaffold — Phase 36 vendors the smoke app's `src/` under `vendor/opentabs-snapshot/plugins/<app>/`).

## Validation Architecture

> nyquist_validation is enabled (no `workflow.nyquist_validation:false` in config). Test convention: standalone node scripts, `PASS=/FAIL=`, `process.exit(1)`; `npm test` is CI. The importer + crosscheck gate run under tsx/node at build time.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | FSB zero-framework node test scripts (`node tests/<name>.test.js`, module-level passed/failed counters, exit 1 on fail) |
| Config file | none — each test is a standalone `.mjs`/`.js`; chained in `package.json` `test` |
| Quick run command | `node tests/no-dead-entry.test.js && node tests/catalog-crosscheck.test.js` |
| Full suite command | `npm test` (the milestone gate) |
| Build/CI gate | `npm run validate:extension` (validate-extension + recipe-path-guard + classification-gate + **new crosscheck**) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CGEN-01 | `z.toJSONSchema` extraction emits closed `params` (additionalProperties:false), $schema stripped | unit | `node tests/import-extraction.test.js` | ❌ Wave 0 |
| CGEN-01 | Forbidden-field pre-scan rejects script/expr/transform/code/fn/js at every depth; passes clean | unit (fixture) | `node tests/import-forbidden-prescan.test.js` | ❌ Wave 0 |
| CGEN-01 | Importer calls `classifyGate()` before emit; aborts on unclassified sensitive origin | unit | `node tests/import-classify-gate-call.test.js` | ❌ Wave 0 (classifyGate itself: `tests/classification-gate.test.js` ✅) |
| CGEN-01 | NO zod/sdk shipped: recipe-path guard stays green; no `extension/**` imports zod | gate | `node scripts/verify-recipe-path-guard.mjs` | ✅ exists |
| CGEN-02 | `void_invoice`/`delete_customer` classify `destructive`; GraphQL POST never `read` | unit | `node tests/catalog-crosscheck.test.js` | ❌ Wave 0 |
| CGEN-02 | Cross-check FAILS the build when a descriptor under-states a destructive op (fail-safe-high) | gate | `node scripts/verify-catalog-crosscheck.mjs` | ❌ Wave 0 |
| CGEN-03 | Every searchable slug resolves to a non-null seam tier (T0/T1a/T1b/T2/T3); unknown slug -> null | unit | `node tests/no-dead-entry.test.js` | ❌ Wave 0 |
| CGEN-03 | `invoke` returns RECIPE_DOM_FALLBACK_PENDING/RECIPE_LEARN_PENDING (NOT RECIPE_NOT_FOUND) for a corpus slug | integration | extend `node tests/capability-router.test.js` | ✅ exists (extend) |
| CGEN-04 | IIFE shape + djb2 catalogVersion unchanged after inlining the smoke descriptors | unit | `node tests/catalog-inline-shape.test.js` | ❌ Wave 0 |
| CGEN-04 | Smoke category: recall@5 >= 0.9 AND wrong-invoke == 0; index < ~50KB; loadJSON+first-search < ~10ms | eval | `node tests/capability-search-eval.test.js` | ✅ exists (extend fixtures + add size/time asserts) |
| CGEN-04 (guard) | HEAD_HANDLER_MODULES length <= cap (head stays descriptors-only) | unit | `node tests/head-handler-cap.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node tests/no-dead-entry.test.js && node tests/catalog-crosscheck.test.js` (the two load-bearing proofs) + the touched test.
- **Per wave merge:** `npm run validate:extension` (runs the recipe-path guard + classification gate + new crosscheck) + the capability-* test subset (`capability-search-eval`, `capability-router`, `capability-head-handlers`, `no-dead-entry`, `catalog-crosscheck`).
- **Phase gate:** full `npm test` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/import-extraction.test.js` — CGEN-01 zod->closed-params (drive `z.toJSONSchema` over fixture Zod, assert shapes from Mechanic 1)
- [ ] `tests/import-forbidden-prescan.test.js` — CGEN-01 the 6-position recursive pre-scan (the EMPIRICALLY-VERIFIED fixture rows)
- [ ] `tests/import-classify-gate-call.test.js` — CGEN-01 importer aborts on unclassified sensitive origin
- [ ] `tests/catalog-crosscheck.test.js` — CGEN-02 destructive-op sample + GraphQL-never-read
- [ ] `scripts/verify-catalog-crosscheck.mjs` — CGEN-02 the CI gate (dual-export; chain into validate:extension)
- [ ] `tests/no-dead-entry.test.js` — CGEN-03 every searchable slug -> non-null tier + unknown -> null
- [ ] `tests/catalog-inline-shape.test.js` — CGEN-04 IIFE/djb2 byte-identity
- [ ] `tests/head-handler-cap.test.js` — the head-cap CI assertion
- [ ] Extend `tests/capability-search-eval.test.js` — smoke fixtures + index-size + cold-start-ms assertions (NO harness code change, only data + 2 asserts)
- [ ] Extend `tests/capability-router.test.js` — a descriptor-only slug invoke -> RECIPE_DOM_FALLBACK_PENDING (not RECIPE_NOT_FOUND)
- [ ] Register `verify-catalog-crosscheck.mjs` in `package.json` `validate:extension` (and the new tests in `test`)
- [ ] Vendor the smoke app's metadata under `vendor/opentabs-snapshot/plugins/<app>/` + install devDeps (zod/tsx/sdk)

*Framework install: none — node + the existing zero-framework convention cover all of the above.*

## Security Domain

> security_enforcement is enabled (absent = enabled). This phase's security surface is Wall-1 (no code-as-data) + the side-effect-class floor (no silent writable mutation under Auto) + the denylist-first emit gate.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Wall-1: build-time metadata only; NO zod/sdk/opentabs runtime shipped; descriptors-as-data |
| V5 Input Validation | yes | Closed `params` JSON Schema (additionalProperties:false by default) validated at invoke by `@cfworker/json-schema`; the forbidden-field pre-scan rejects eval-able field names |
| V5 (injection-adjacent) | yes | GraphQL/RPC carve-out + fail-safe-high side-effect class: a mutation can never be classed `read` and run ungated under Auto |
| V10 Malicious Code | yes | `verify-recipe-path-guard.mjs` (eval/new Function/import grep over recipe-path files) + the pre-scan; slopcheck on build deps (jiti `[SUS]` excluded) |
| V12 Files/Resources | yes | Importer never executes op `handle()` bodies (no `fetch`/`document.*` at build); reads metadata only |

### Known Threat Patterns for {build-time codegen + closed-vocab descriptor catalog}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Code-as-data on the recipe path (a descriptor carries an eval-able field) | Tampering / Elevation | Forbidden-field recursive pre-scan (Mechanic 1) + `verify-recipe-path-guard.mjs` (stays green) |
| GraphQL/RPC mutation mislabeled `read` -> writable under Auto with no friction | Elevation of Privilege | Verb-map + GraphQL carve-out + override table + fail-safe-high cross-check (Mechanic 2); runtime recipe-method backstop (router line 303) |
| Unclassified sensitive origin emits a descriptor -> writable the moment it lands | Elevation / Info Disclosure | `classifyGate()` before emit (Phase 35 denylist-first floor; Pattern 3) |
| Slopsquatted/typosquatted build dep (e.g. jiti~vite) executes at build | Tampering | slopcheck gate; tsx (OK) used, jiti (SUS) excluded; exact-pin the SDK; vendor-stub hardening |
| Dead descriptor (searchable, unbacked) erodes catalog trust / silent failure | Repudiation (UX) | The no-dead-entry resolve() fallback + the searchable-slug -> non-null-tier harness (Mechanic 3) |

## Sources

### Primary (HIGH confidence)
- **FSB substrate (read live, branch `automation`, 2026-06-24):** `extension/utils/capability-catalog.js` (resolve() line 285-360, the `!entry` return at 304, REGISTRY/HEAD_HANDLER_MODULES/registerHandler/seedHeadHandlers/_getRecipeBySlug); `extension/utils/capability-router.js` (invoke() 701-787, the `switch (entry.tier)` 743-779, T3->RECIPE_DOM_FALLBACK_PENDING 773, T2->RECIPE_LEARN_PENDING 767, default->RECIPE_NOT_FOUND 777, `_deriveSideEffectClass` 290-305 with MUTATING_METHODS promotion); `extension/utils/capability-search.js` (INDEX_OPTIONS 48-52, buildIndex/deriveSideEffect 90-129, `_computeCatalogVersion` djb2 190-200, exports 398-407 — NO getDescriptorBySlug); `scripts/package-extension.mjs` (readJsonDir NON-recursive 51-64, the IIFE generator 74-85); `scripts/verify-recipe-path-guard.mjs` (the 5 checks, the allowlist, the `import(` grep); `scripts/verify-classification-gate.mjs` (classifyGate(items,opts) dual-export 158-200, sensitivityHeuristic, ROSTER_ITEMS); `catalog/handlers/github.js` (T1a shape, self-register, guarded-write-fail-closed); `catalog/descriptors/github-issues-create.json` (the closed `params` additionalProperties:false shape); `catalog/descriptors/_fixtures/{seed-descriptors.json,intent-cases.json,_provenance.json}` (eval corpus + empty apps[] scaffold); `tests/capability-search-eval.test.js` (recall@5>=0.9 + wrong-invoke=0 + loadJSON round-trip); `package.json` (validate:extension chain, deps, engines>=24).
- **OpenTabs repo (read live via WebFetch, pinned `main`/SHA 4b170216):** `platform/plugin-tools/src/commands/build.ts:746` (`z.toJSONSchema(tool.input)` + transform-rejection + esbuild import() loader); `plugins/airtable/src/airtable-api.ts:83,113` (apiGet GET / apiPost POST — named verb fns); `plugins/stripe/src/stripe-api.ts` (single generic `api(endpoint,{method})`); `plugins/linear/src/linear-api.ts:107` (`graphql()` always-POST, reads+mutations both POST).
- **Zod 4.4.3 EMPIRICALLY VERIFIED (ran `z.toJSONSchema` live in /tmp/zod-probe):** union->anyOf, enum->{type:string,enum}, record->{object,propertyNames,additionalProperties}, nullable->anyOf+null, optional drops from required, default emits "default"+stays required, lazy->$ref/$defs, cycles:'throw'->THROWS, .transform()->THROWS, `additionalProperties:false` by default, `script`/`expr` property names survive verbatim; the recursive pre-scan catches forbidden names in all 6 positions.
- **npm registry (HIGH, verified 2026-06-24):** zod 4.4.3 (modified 2026-05-04, no postinstall), tsx 4.22.4 (no postinstall), jiti 2.7.0, @opentabs-dev/plugin-sdk 0.0.113, esbuild 0.28.1.
- **slopcheck 0.6.1 (ran live):** `[OK] zod`, `[OK] tsx`, `[SUS] jiti` (typosquat-near "vite").

### Secondary (MEDIUM confidence)
- **Milestone research (`.planning/research/STACK.md`, `ARCHITECTURE.md`):** the build-time codegen stack + the integration map + Decision B (descriptor-only -> T3/T2) — built on, with the verb-map correction (Mechanic 2) and the readJsonDir-non-recursion correction (Pitfall 1) noted where this phase research diverges.
- **Phase 35 research (`35-RESEARCH.md`):** the classifyGate dual-export contract + the OpenTabs SHA/MIT pin + the provenance scaffold the importer extends.
- **Zod JSON Schema docs (zod.dev/json-schema, WebFetch):** the options object keys (target/unrepresentable/cycles/io/override), draft-2020-12 default, optional/nullable rendering — cross-confirmed by the live probe.

### Tertiary (LOW confidence)
- **Zod GitHub issues (WebSearch):** the recursive-`z.lazy`+`.describe()` stack-overflow edge (issue #5777) and the unrepresentable/cycles options — relevant only if a smoke-app op is recursive; the smoke category should avoid recursive ops, and `cycles:'ref'` (default) handles the rest.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions npm-verified, slopcheck-gated, build path mirrors upstream `build.ts` read live.
- zod extraction + pre-scan (Mechanic 1): HIGH — every output shape EMPIRICALLY verified by running zod@4.4.3; the pre-scan proven in all 6 positions.
- Side-effect inference (Mechanic 2): HIGH on the transport reality (4 plugins read live), MEDIUM on exact override-table membership (a discretion call; the 2 CONTEXT exemplars are HIGH).
- resolve() fallback (Mechanic 3): HIGH — the exact line, the router switch, and the zero-router-change fact all verified against live source.
- Catalog inlining (Mechanic 4): HIGH on the IIFE/djb2 byte-identity + readJsonDir non-recursion; the flat-vs-subdir resolution flagged (A1) for planner/discuss confirmation.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (30 days; stable substrate + pinned OpenTabs SHA. zod/tsx are mature; re-verify the npm versions if the planner installs much later.)
