# Technology Stack — v1.0.0 Full App Catalog (OpenTabs Parity)

**Project:** FSB (Full Self-Browsing)
**Milestone:** v1.0.0 — Full App Catalog (OpenTabs Parity): take the bundled head from 4 services to the full ~119-app OpenTabs surface via build-time descriptor codegen + a scaled minisearch catalog + a hand-ported depth tier.
**Domain:** Build-time catalog codegen (extract per-op descriptor metadata from 119 `@opentabs-dev/plugin-sdk` plugins, ~2,400 ops) into FSB's existing `recipe-index.generated.js`; scale the minisearch index to thousands of descriptors without blowing SW startup/memory; hand-port ~15-30 apps as T1a/T1b handlers.
**Researched:** 2026-06-23
**Confidence:** HIGH — extraction shape verified directly against the real OpenTabs repo (`github.com/opentabs-dev/opentabs`, MIT, `pushed_at 2026-06-21`); every claim about op shape / manifest serialization / Zod usage is quoted from inspected source. Versions verified via npm + Context7 on 2026-06-23.

> **Note:** This file supersedes the prior **v0.9.99** STACK research (Native Capability Catalog, dated 2026-06-19). The v0.9.99 architecture it described is now the FIXED substrate this milestone extends; recover the earlier notes from git history / the v0.9.99 milestone archive. This document covers ONLY the NEW v1.0.0 build-time codegen + scaling stack.

---

## TL;DR (for the roadmapper + requirements step)

- **OpenTabs op metadata IS extractable at build time — but NOT by static parsing alone.** Each op is `defineTool({ name, displayName, description, summary, icon, group, input: z.object({...}), output: z.object({...}), handle })`. `input`/`output` are **Zod 4 schemas** that import shared schemas from a sibling `schemas.ts` and helpers from the SDK, so a single-file regex/AST scrape cannot resolve a complete param schema. The robust path is **load + evaluate the Zod** (transpile TS on the fly → `import()` the plugin module → `z.toJSONSchema(tool.input)`) — exactly what OpenTabs' own `opentabs-plugin build` does (`platform/plugin-tools/src/commands/build.ts:416`).
- **There is NO prebuilt manifest in the repo to consume.** OpenTabs writes `dist/tools.json`, but `dist/` is `.gitignore`d. FSB must run the Zod→JSON-Schema conversion itself.
- **`z.toJSONSchema` is a Zod-4-only top-level API** (verified Zod 4.4.3 via Context7 `/websites/zod_dev_v4`). SDK declares `peerDependencies.zod: "^4.4.3"`; plugins pin `zod ^4.3.6`. → **Zod 4 is the one genuinely new build-time dependency.**
- **NEW build deps (devDependencies ONLY):** `zod@^4.4.3` + a TS-on-the-fly evaluator (`tsx@^4.22` recommended; `jiti@^2.7` is the OpenTabs-native equivalent). esbuild is already a FSB devDep and backs the evaluator.
- **REUSE at runtime, unchanged:** `minisearch ^7.2.0`, `@cfworker/json-schema ^4.1.1`, `jmespath ^0.16.0` — all already FSB deps and already vendored at `extension/lib/*.min.js`. FSB's target descriptor shape (`{slug, service, intentSynonyms, description, actionVerb, sideEffectClass, params}`) maps cleanly onto the OpenTabs manifest fields + **one inferred field** (`sideEffectClass` — OpenTabs has NO side-effect annotation; confirmed below).
- **Scaling to thousands of descriptors:** keep the existing build-time-prebuilt + `loadJSON` minisearch pattern (SURF-04), but (a) **index searchable text only, hold the `params` JSON Schema out-of-band** (schema-on-hit), (b) **shard the generated catalog by service + lazy-hydrate payloads**, (c) ship the **prebuilt serialized index** so SW wake is `loadJSON` not re-index. Concrete budget below.
- **MUST NOT ADD (Wall 1):** No runtime dependency on `@opentabs-dev/plugin-sdk`, `@opentabs-dev/plugin-tools`, `@opentabs-dev/shared`, any `@opentabs-dev/opentabs-plugin-*`, or `zod` **shipped into the extension**. Those + Zod live **only inside the Node build script**; the extension ships pure-data descriptors. No remote/eval'd code; no new `importScripts` of a plugin runtime; `verify-recipe-path-guard.mjs` stays green because nothing eval-able is added to the recipe path.

---

## How the OpenTabs op metadata is shaped (verified against the real repo)

Source: `github.com/opentabs-dev/opentabs` (MIT, `default_branch: main`, `pushed_at: 2026-06-21`). 119 plugin dirs under `plugins/` confirmed. **2,406** op files counted via `git/trees/main?recursive=1` filtered to `^plugins/[^/]+/src/tools/.*\.ts$` minus `schemas.ts`/`.test.ts` (the milestone's "2,523" includes schema/inline-tool variants). Op-count spot checks: linear **59**, github **37**, stripe 8+ in `tools/`.

### Per-op definition — `defineTool(...)` (verified across github, stripe, linear)

`plugins/github/src/tools/create-issue.ts` (verbatim head):

```typescript
import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getMutationId, graphql, turboData } from '../github-api.js';
import { issueSchema } from './schemas.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description: 'Create a new issue in a repository.',
  summary: 'Create a new issue in a repository',
  icon: 'plus-circle',
  group: 'Issues',
  input: z.object({
    owner: z.string().min(1).describe('Repository owner (user or org)'),
    repo: z.string().min(1).describe('Repository name'),
    title: z.string().min(1).describe('Issue title'),
    body: z.string().optional().describe('Issue body in Markdown'),
  }),
  output: z.object({ issue: issueSchema.describe('The created issue') }),
  handle: async params => { /* GraphQL mutation against github.com — imperative */ },
});
```

Same shape in `plugins/stripe/src/tools/create-customer.ts` (`input: z.object({ email: z.string().optional()..., metadata: z.record(z.string(), z.string()).optional() })`, `handle` calls `api('/customers', { method: 'POST', body })`) and uniformly across `plugins/linear`. **One `defineTool({...})` export per file**, aggregated in the plugin's `index.ts`.

`defineTool` is an **identity function** (`platform/plugin-sdk/src/index.ts`): `export const defineTool = (config) => config;`. No decorators, no reflection, no side effects — metadata is plain object-literal props + Zod schema objects.

### The `ToolDefinition` interface (the extraction contract) — `platform/plugin-sdk/src/index.ts`

```typescript
export interface ToolDefinition<TInput extends z.ZodObject<z.ZodRawShape>, TOutput extends z.ZodType> {
  name: string;          // build auto-prefixes: 'send_message' → 'slack__send_message' (delimiter '__')
  displayName?: string;  // derived from name when omitted
  description: string;
  summary?: string;
  icon?: LucideIconName;
  group?: string;
  input: TInput;         // Zod schema
  output: TOutput;       // Zod schema
  handle(params, context?): Promise<...>;  // imperative; endpoint + auth live HERE, not in metadata
}
```

### Plugin-level metadata — `index.ts extends OpenTabsPlugin` + `package.json.opentabs`

`plugins/github/src/index.ts`:

```typescript
class GitHubPlugin extends OpenTabsPlugin {
  readonly name = 'github';
  override readonly displayName = 'GitHub';
  readonly urlPatterns = ['*://github.com/*'];
  override readonly homepage = 'https://github.com';
  readonly tools: ToolDefinition[] = [ listRepos, getRepo, createRepo, /* ... */ ];
}
```

`plugins/github/package.json` carries a parallel `opentabs` block (`displayName`, `urlPatterns: ["*://github.com/*"]`, `homepage: "https://github.com"`, optional `configSchema`), typed in `platform/shared/src/manifest.ts` (`PluginOpentabsField`). **`urlPatterns`/`homepage` are FSB's source for `service`/origin** (`*://github.com/*` → `github.com`). `package.json.dependencies` declares `@opentabs-dev/plugin-sdk ^0.0.113`; `peerDependencies.zod ^4.0.0`; plugin devDeps pin `zod ^4.3.6`, `jiti ^2.6.1`, `typescript ^6.0.3`.

### The OpenTabs build output `dist/tools.json` (what FSB conceptually re-derives)

`platform/plugin-tools/src/commands/build.ts` = the `opentabs-plugin build` command. It `tsc`-compiles to `dist/`, dynamically `import()`s the compiled module (`pathToFileURL` + cache-busting query), then serializes each tool. The schema conversion (build.ts:414-439, verbatim):

```typescript
const convertToolSchemas = (tool: ToolDefinition) => {
  let inputSchema = z.toJSONSchema(tool.input) as Record<string, unknown>;   // ← Zod 4 NATIVE
  let outputSchema = z.toJSONSchema(tool.output) as Record<string, unknown>;
  delete inputSchema.$schema;
  delete outputSchema.$schema;
  return { inputSchema, outputSchema };
};
```

Emitted `ManifestTool` (`platform/shared/src/index.ts:157-176` + `generateToolsManifest` build.ts:646):

```typescript
export interface ManifestTool {
  name: string; displayName: string; description: string; summary?: string;
  icon: string; group?: string;
  input_schema: Record<string, unknown>;   // standard JSON Schema
  output_schema: Record<string, unknown>;
}
```

**Decisive facts for FSB's extractor:**
1. **It's Zod 4's `z.toJSONSchema()`, not the `zod-to-json-schema` npm lib.** FSB must use the same call → **Zod 4 required at build.**
2. **`input_schema` is standard JSON Schema** (draft 2020-12; `$schema` stripped) → directly consumable by FSB's existing `@cfworker/json-schema` validator and by minisearch; **no schema-dialect translation.**
3. The serializer **throws on `.transform()`/`.pipe()`/`.preprocess()`** (build.ts:419-422) → every op's `input` is guaranteed pure-structural JSON Schema. FSB inherits that guarantee.
4. `.describe('...')` text is preserved into JSON Schema `description` (verified Context7) → **free human-readable param descriptions** for FSB's descriptor + `intentSynonyms` seeding.
5. **No side-effect / mutation / destructive / readOnly annotation** exists anywhere in `ToolDefinition` or `ManifestTool`. FSB's `sideEffectClass` (`read`|`write`) **must be inferred** — the op `name` verb prefix is the signal (`list_`/`get_`/`search_`/`compare_` → read; `create_`/`update_`/`delete_`/`merge_`/`add_`/`remove_`/`archive_`/`finalize_`/`batch_`/`move_` → write), with a per-op override table for the long tail.

### Why static parsing alone is insufficient (the strategy decision)

`input`/`output` routinely reference **shared Zod schemas** imported from a sibling file — `import { issueSchema } from './schemas.js'` (github), `import { customerSchema } from './schemas.js'` (stripe), defined in `plugins/<app>/src/tools/schemas.ts` (`export const issueSchema = z.object({ number: z.number()..., labels: z.array(z.string())..., ... })`). A regex/AST scrape of one op file sees `output: z.object({ issue: issueSchema })` with `issueSchema` unresolved. Fully realizing the schema requires **module resolution + Zod evaluation**:

- ❌ **Static parse only (regex/`@babel/parser`/`ts-morph`, single file):** brittle; can't resolve cross-file `schemas.ts`/SDK refs; re-implements Zod→JSON-Schema by hand; high drift risk. Rejected.
- ❌ **Standalone `tsc --emit` then read `dist/`:** heavier than needed; replicates OpenTabs' gitignored `dist/`; tsconfig wrangling across 119 packages. Rejected as default.
- ✅ **Load + evaluate at build time (RECOMMENDED):** a Node script transpiles each plugin's TS on the fly (`tsx`/`jiti`, no emit), `import()`s the plugin module, walks `plugin.tools[]`, calls `z.toJSONSchema(tool.input)` — the identical operation `build.ts` performs. Deterministic; mirrors upstream exactly; ~10 lines of conversion logic. **`handle` bodies are never executed** (we read only `.input`/`.name`/`.description`/etc. metadata), so the imperative `fetchFromPage`/`graphql`/`document.*` code never runs at build.

---

## Recommended Stack

### Core Technologies (BUILD-TIME ONLY — a Node script run before/by `scripts/package-extension.mjs`)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **zod** | `^4.4.3` (current 4.4.3) | `z.toJSONSchema()` to convert each op's `input` Zod schema → JSON Schema at build time | The **exact** API OpenTabs' `build.ts:416` uses; matches SDK peer `zod ^4.4.3` + plugin pins `zod ^4.3.6`. `z.toJSONSchema` is Zod-4-only. **Pin the same major as the plugins** to guarantee schema-output parity. **devDependency ONLY — never bundled into the extension.** |
| **tsx** | `^4.22.4` (current 4.22.4) | Transpile-and-run the OpenTabs TS plugin modules so the build script can `import()` them without a separate `tsc` emit | Zero-config ESM/TS loader built on esbuild (already a FSB devDep). `node --import tsx ./scripts/import-opentabs-catalog.mjs`. Handles the plugins' `.js`-extension ESM imports + Zod. Mature, purpose-fit for "evaluate TS at build." |
| **@opentabs-dev/plugin-sdk** | `^0.0.113` (**devDependency**) | Resolve `import { defineTool, OpenTabsPlugin } from '@opentabs-dev/plugin-sdk'` when loading a plugin module | Required so plugin TS resolves at build. **CRITICAL: devDependency only — metadata-extraction scaffolding, never shipped.** `defineTool` is identity; `OpenTabsPlugin` is an abstract class — loading them is inert. (Hardening alternative: vendor a ~30-line stub — see Variant.) |

### Supporting Libraries (RUNTIME — all ALREADY FSB deps, REUSED unchanged)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **minisearch** | `^7.2.0` (dep; vendored `extension/lib/minisearch.min.js`) | The capability search index over thousands of descriptors | SURF-04 substrate. Same `INDEX_OPTIONS` at build + `loadJSON`. Scaling guidance below. |
| **@cfworker/json-schema** | `^4.1.1` (dep; vendored `extension/lib/cfworker-json-schema.min.js`) | Validate `invoke_capability` params against imported JSON-Schema `params` in the SW (eval-free) | OpenTabs `input_schema` is standard JSON Schema → drops straight into the existing CAP-03 validator. **No new validator.** |
| **jmespath** | `^0.16.0` (dep; vendored `extension/lib/jmespath.min.js`) | Recipe `extract` expression engine (existing) | Unchanged; the descriptor import does not touch the recipe `extract` path. |
| **esbuild** | `^0.24.0` (devDep; current 0.28.1) | Backs `tsx`; also FSB's offscreen bundler | No bump needed for tsx (it vendors its own esbuild). FSB's `esbuild ^0.24.0` is independent. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Node `>=24`** | Run the codegen script | Already FSB's `engines.node` floor (v0.10.0). Native ESM + `import()` + top-level await. |
| **Pinned OpenTabs source (git checkout / submodule / tarball)** | Acquire plugin sources at build time | Plugins are NOT importable from npm as source — `package.json.files: ["dist"]`. **Vendor `plugins/` + `platform/plugin-sdk/src` via a pinned commit** (record SHA, like `.planning/LATTICE-PIN.md`), OR generate once and **commit** `recipe-index.generated.js`. Codegen is a **maintainer build step, not an end-user install step.** |
| **`scripts/package-extension.mjs`** | The existing generator to extend | Today reads `catalog/descriptors/*.json` + `catalog/recipes/*.json` → inlines into `recipe-index.generated.js`. The new importer produces those descriptor JSONs (or feeds the generator directly). See Integration. |

## Installation

```bash
# NEW build-time deps (devDependencies ONLY — must NEVER appear in `dependencies`)
npm install -D zod@^4.4.3 tsx@^4.22.4 @opentabs-dev/plugin-sdk@^0.0.113

# (Variant: skip @opentabs-dev/plugin-sdk; vendor a ~30-line defineTool/OpenTabsPlugin stub instead)

# Runtime deps — ALREADY PRESENT, no install:
#   minisearch ^7.2.0, @cfworker/json-schema ^4.1.1, jmespath ^0.16.0  (vendored in extension/lib/)
#   esbuild ^0.24.0 (devDep, backs tsx)
```

## Integration with `scripts/package-extension.mjs` (the generator to scale)

Today (`package-extension.mjs:51-89`): `readJsonDir(catalog/descriptors)` + `readJsonDir(catalog/recipes)` → `JSON.stringify({recipes, descriptors})` → inlined into the dual-export IIFE `extension/catalog/recipe-index.generated.js` (~10 descriptors). The djb2 `catalogVersion` content-hashes whatever descriptors are present.

Proposed v1.0.0 flow (NEW importer is a **separate Node module run before / invoked by** `package-extension.mjs`):

1. **`scripts/import-opentabs-catalog.mjs`** (NEW, run under `tsx`): for each `plugins/<app>` in the pinned OpenTabs checkout —
   - Read `package.json.opentabs` → `service` (derive `github.com` from `urlPatterns`/`homepage`), provenance (`name`, `version`, MIT).
   - `import()` `plugins/<app>/src/index.ts` → read the plugin instance's `tools[]` (or import each `src/tools/*.ts` named export).
   - Per op: `slug` (FSB convention, e.g. `<service-stem>.<camelCased name>`; OpenTabs uses `app__op` — map deterministically), `params = z.toJSONSchema(tool.input)` then `delete params.$schema`, `description = tool.description`, `actionVerb`+`sideEffectClass` inferred from the `name` verb (override table), `intentSynonyms` seeded from `displayName`/`summary`/`description` (+ curated synonyms for top apps).
   - Emit one descriptor JSON per app (or per op) into `catalog/descriptors/opentabs/<app>.json`, **stamped with provenance** (`{ source: "opentabs", sourceVersion, license: "MIT" }`).
2. **`package-extension.mjs`** picks them up via the existing `readJsonDir` (extend it to recurse one level, or point it at the new subdir) and inlines them — **no change to the IIFE shape or `catalogVersion` hashing.**
3. Hand-ported T1a/T1b handlers (`catalog/handlers/<app>.js`) continue through the existing `package-extension.mjs:101-115` copy step **unchanged**.

The import stays a pure metadata transform: the generated artifact remains **pure data** (Wall 1 intact); `verify-recipe-path-guard.mjs` is unaffected (nothing eval-able added to the recipe path).

## Hand-porting ~15-30 apps as T1a/T1b (reuse the existing handler pattern — NO new stack)

Template = `extension/catalog/handlers/github.js` verbatim:
- Each handler is a **dual-export IIFE** (`global.FsbHandler<App>` + `module.exports`), self-registering slugs into `FsbCapabilityCatalog.registerHandler` at load, calling `ctx.executeBoundSpec(spec, ctx.tabId)` against the app's **own first-party origin** (Wall 2 cookie scoping), `params` as inline JSON Schema (validated by `@cfworker/json-schema`), tokens never logged, ASCII-only.
- OpenTabs is the **reference for endpoint + auth shape only** — its `<app>-api.ts` documents the real first-party transport (github: `getMetaContent('user-login')` auth, CSRF from `input[name="authenticity_token"]`, `turboData`/`graphql` against `github.com`; stripe: `api('/customers', {method:'POST'})`). FSB **hand-ports** that knowledge into a bound-spec handler; it does NOT ship OpenTabs' `handle` code. Endpoints flagged `[ASSUMED]` until live-captured, exactly like the current github handler.
- Top hand-port candidates by op-richness/value (from verified counts): linear (59), github (37), stripe, vercel, datadog, jira, notion, slack (last few already partly bundled).

## Scaling `recipe-index.generated.js` + minisearch to thousands of descriptors

**Problem:** ~2,400 ops × (slug + synonyms + description + `params` JSON Schema) inlined into ONE IIFE string that `importScripts` parses on every SW cold start, plus a serialized minisearch index hydrated via `loadJSON`. Naive inlining risks (a) a multi-MB JS file parsed on every MV3 SW wake, (b) index hydration latency, (c) memory.

**Recommended approach (build-time prebuilt, lazy + sharded — NO new runtime dep):**

1. **Split searchable text from payload.** The index needs only the *searchable* fields (`slug`, `service`, `intentSynonyms`, `actionVerb`, `sideEffectClass`, `description`) — **NOT** the `params` JSON Schema. Keep `params` in a **separate slug-keyed map** looked up only on a search hit (the SURF-01 "schema-on-hit" pattern already does this). Params schemas are the byte-bulk; removing them from the index is the biggest single shrink.
2. **Prebuild the minisearch index at build time; ship the serialized form** (already the SURF-04 contract via `INDEX_OPTIONS` + `loadJSON`). `MiniSearch.loadJSON(serialized, options)` rehydrates without re-indexing — O(load) not O(reindex). Biggest SW-startup win; already FSB's pattern — the task is keeping it healthy at ~100× the document count.
3. **Shard by service + lazy-hydrate.** Instead of one giant IIFE, emit per-service (or per-category) chunks (`recipe-index.<service>.generated.js`) + a small **always-loaded manifest** (slug→service + the prebuilt index). Load a service's params payload only when a slug from that service is invoked (`importScripts` on demand). Cold-start cost becomes "manifest + index," not "all 2,400 param schemas." Validate lazy-`importScripts`-after-wake ergonomics during the phase; fall back to a single chunk if unreliable (the index, not the payloads, is the hot path).
4. **Bound index size via field selection + `storeFields` discipline.** Index `intentSynonyms`/`description`/`slug`; `storeFields: ['slug','service','sideEffectClass']` (enough to render a result + route to the payload map). Do NOT store `params`/full `description` in the index.
5. **Catalog version + integrity unchanged.** The djb2 `catalogVersion` content hash → `chrome.storage.local` snapshot keeps working; bump on any descriptor change so a stale index is detected/rebuilt.
6. **Performance budget to gate in the phase:** target serialized index < ~1-2 MB and `loadJSON` + first `search` < ~50-100 ms on SW wake. Extend the existing SURF-06 eval harness (already measures recall@k / wrong-invoke) with **index-size + load-time assertions**. minisearch handles 100k+ small docs; ~2,400 short descriptors is comfortably in range — the real risk is **inlined-payload bytes**, which (1)+(3) remove from the hot path.

minisearch `^7.2.0` is current and sufficient. **No index-engine change** (no FlexSearch/lunr/Orama swap) is warranted — scaling here is a data-layout problem, not an engine-capability problem, and a swap risks INV-01/SURF-04.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Load+evaluate Zod via `tsx`** | `jiti@^2.7` (OpenTabs' own devDep for module loading) | For byte-for-byte parity with OpenTabs' loader (plugins list `jiti ^2.6.1`). Equally valid; `tsx` is preferred only for the esbuild reuse + simpler `--import`. |
| **Load+evaluate Zod** | Standalone `tsc --emit` then `import()` `dist/` | Only if a plugin's `index.ts` has type-only constructs the transpiler mishandles (not observed). Heavier; replicates gitignored `dist/`. |
| **Load+evaluate Zod** | Static AST parse (`@babel/parser`/`ts-morph`) + hand-rolled Zod→JSON-Schema | Only to avoid executing ANY OpenTabs/Zod code at build (unnecessary — reading `.input` is inert). Rejected: can't resolve cross-file `schemas.ts`; re-implements `z.toJSONSchema`; drift risk. |
| **Real `@opentabs-dev/plugin-sdk` devDep** | **Vendored ~30-line SDK stub** (`defineTool = c=>c`, abstract `OpenTabsPlugin`, no-op DOM/fetch helper exports) | Hardening: a stub keeps `node_modules` free of the SDK's DOM/fetch transitive surface and makes the build hermetic. Use the real SDK to validate the consumed surface first, then replace (it's tiny). |
| **minisearch (reuse)** | FlexSearch / Orama / lunr | None for this milestone. minisearch already ships + has the prebuilt+`loadJSON` integration + handles the scale. Swapping is unjustified risk vs INV-01/SURF-04. |
| **Commit the generated catalog** | Regenerate on every CI build | Commit `recipe-index.generated.js` (or per-service chunks) so CI/end-users build without the OpenTabs tree or build deps. Regenerate only on OpenTabs pin bump (audit trail like `.planning/LATTICE-PIN.md`). Mirrors FSB's current committed-generated-file practice. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@opentabs-dev/plugin-sdk` / `plugin-tools` / `shared` / `@opentabs-dev/opentabs-plugin-*` as a runtime `dependency` or `importScripts`** | **MV3 Wall 1** — these are code; the extension ships closed-vocabulary DATA only. A plugin runtime = remotely-hosted/eval-class code; fails MV3 policy + the spirit of `verify-recipe-path-guard.mjs`. | Import them **only inside the Node build script** (`devDependencies`); ship the resulting pure-data descriptors. |
| **`zod` in `dependencies` / bundled into the extension** | Same Wall 1 concern; Zod is large; the extension never needs Zod at runtime — params are validated by the vendored `@cfworker/json-schema`. | `zod` as a **devDependency**; convert to JSON Schema at build; validate at runtime with `@cfworker/json-schema`. |
| **`zod-to-json-schema` (the separate npm lib)** | OpenTabs uses Zod 4's **native** `z.toJSONSchema`. A different converter risks output drift vs the upstream manifest (`$ref`/`additionalProperties`/format handling). | `z.toJSONSchema()` from `zod@^4` — identical to upstream. |
| **Zod 3** | `z.toJSONSchema` is not a Zod 3 top-level API; SDK peer-deps Zod 4. | `zod@^4.4.3`. |
| **Static regex/AST-only extraction of op schemas** | Op `input`/`output` import shared schemas from `schemas.ts` + SDK helpers; single-file scrape can't resolve them; brittle across 2,400 ops. | Load+evaluate the module and call `z.toJSONSchema`. |
| **Executing op `handle()` at build** | `handle` runs imperative `fetchFromPage`/`graphql`/`document.querySelector` against a live page — meaningless + side-effectful in Node. | Read only **metadata** (`name`, `description`, `input`, `group`); never call `handle`. |
| **Inlining all ~2,400 param schemas into one IIFE parsed on every SW wake** | Multi-MB JS parsed on every MV3 cold start = startup/memory regression. | Split searchable-text (indexed) from params-payload (slug-keyed, lazy); shard by service; ship prebuilt `loadJSON` index. |
| **Trusting OpenTabs endpoints/auth as verified for FSB handlers** | OpenTabs `handle` bodies encode first-party transport knowledge but are not FSB-validated; internal endpoints drift. | Hand-port as bound-spec T1a/T1b with `[ASSUMED]` flags + live capture, exactly like the current `github.js`. |
| **Swapping the search engine to gain scale** | The bottleneck is inlined-payload bytes + index serialization, not engine capability. | Keep minisearch; fix the data layout (split/shard/prebuilt index). |

## Stack Patterns by Variant

**If the build must be fully hermetic / no OpenTabs `node_modules`:**
- Vendor a ~30-line `defineTool`/`OpenTabsPlugin`/SDK-helper stub + a pinned copy of `plugins/` + `platform/plugin-sdk/src` under e.g. `vendor/opentabs/` with a recorded commit SHA.
- Because every op `input` is plain Zod and `defineTool` is identity, the stub suffices to `import()` + `z.toJSONSchema` each op. Only `zod` + `tsx` remain real devDeps.

**If breadth must ship without the OpenTabs source at install time (recommended default):**
- Run the importer once at maintainer-time; **commit** the generated descriptor chunks + prebuilt index. CI/end-users build with **zero** new deps. Re-run only on OpenTabs pin bumps (audit trail like `.planning/LATTICE-PIN.md`).

**If an op uses `z.record`/`z.enum`/nested objects (e.g. stripe `metadata: z.record(z.string(), z.string())`, github `state: z.enum(['open','closed','all'])`):**
- `z.toJSONSchema` emits valid JSON Schema for these (verified shapes); `@cfworker/json-schema` validates them. No special handling — but include them in the SURF-06-style fixture set to guarantee round-trip validation at scale.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `zod@^4.4.3` (FSB build) | OpenTabs SDK peer `zod ^4.4.3`; plugin pins `zod ^4.3.6` | **Use the same Zod major as the plugins** so `z.toJSONSchema` output matches the upstream manifest exactly. Any `4.x` ≥ the plugins' pin is safe. |
| `tsx@^4.22.4` | Node `>=24`; esbuild (vendored by tsx) | FSB runs Node ≥24; tsx ships its own esbuild, independent of FSB's `esbuild ^0.24.0`. |
| `@cfworker/json-schema@^4.1.1` (runtime) | JSON Schema draft 2020-12 emitted by `z.toJSONSchema` (default target) | Already FSB's validator; the imported `input_schema` (post `$schema` strip) validates without translation. If a specific draft is required, pass `{ target: 'draft-2020-12' }` to `z.toJSONSchema` in the importer. |
| `minisearch@^7.2.0` (runtime) | Existing `INDEX_OPTIONS` + `loadJSON` (SURF-04) | No API change at scale; `loadJSON` rehydrate is the supported large-index path. |
| `@opentabs-dev/plugin-sdk@^0.0.113` (build) | `@opentabs-dev/shared@^0.0.113` (transitive) | Pre-1.0 — **pin exact** in the build pin file; treat any minor as potentially breaking the op shape; re-verify importer fixtures on bump. |

## Sources

- **OpenTabs repo (PRIMARY, HIGH)** `github.com/opentabs-dev/opentabs` @ `pushed_at 2026-06-21`, inspected via authenticated `gh api`:
  - `plugins/github/src/tools/{create-issue,list-issues}.ts`, `plugins/stripe/src/tools/create-customer.ts`, `plugins/linear/src/index.ts` — op `defineTool` shape (quoted).
  - `plugins/github/src/{index.ts,github-api.ts,tools/schemas.ts}`, `plugins/github/package.json` — plugin metadata + shared-schema imports + imperative `handle` transport + dep pins.
  - `platform/plugin-sdk/src/index.ts` — `ToolDefinition`, `defineTool` (identity fn), `OpenTabsPlugin` (quoted); `platform/plugin-sdk/package.json` (`peerDependencies.zod ^4.4.3`).
  - `platform/plugin-tools/src/commands/build.ts:414-439, 646-658` — `z.toJSONSchema` conversion + `generateToolsManifest` + `.transform/.pipe/.preprocess` rejection (quoted).
  - `platform/shared/src/{index.ts:137-176,manifest.ts}` — `PluginManifest`/`ManifestTool` shape; **no side-effect field** (quoted).
  - `.gitignore` (`dist/`) — confirms no prebuilt `tools.json` committed.
  - `git/trees/main?recursive=1` counts — 119 plugins; 2,406 op files; linear 59, github 37.
- **npm registry (HIGH)** verified 2026-06-23: `zod 4.4.3`, `tsx 4.22.4`, `jiti 2.7.0`, `esbuild 0.28.1`, `typescript 6.0.3`.
- **Context7 `/websites/zod_dev_v4` (HIGH)** — `z.toJSONSchema()` documented top-level Zod 4 API; preserves `.describe()`/`.meta()` into JSON Schema.
- **FSB repo (PRIMARY, HIGH)** — `package.json` (deps `@cfworker/json-schema ^4.1.1`, `jmespath ^0.16.0`, `minisearch ^7.2.0`; devDep `esbuild ^0.24.0`; `engines.node >=24`); `extension/lib/{minisearch,jmespath,cfworker-json-schema}.min.js` (vendored runtime libs); `scripts/package-extension.mjs` (generator); `extension/catalog/recipe-index.generated.js` (descriptor target shape); `extension/catalog/handlers/github.js` (T1a template); `.planning/PROJECT.md` (Walls, INV-01..04, v1.0.0 framing, SURF-01/04/06).

---
*Stack research for: build-time OpenTabs op-metadata codegen + MV3 thousands-descriptor catalog scaling + T1a/T1b hand-port reuse (FSB v1.0.0 OpenTabs Parity)*
*Researched: 2026-06-23*
