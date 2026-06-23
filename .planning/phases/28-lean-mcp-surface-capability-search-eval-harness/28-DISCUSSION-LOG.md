# Phase 28: Lean MCP Surface + Capability Search + Eval Harness - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-06-20
**Phase:** 28-lean-mcp-surface-capability-search-eval-harness
**Mode:** assumptions (--auto)
**Areas analyzed:** Search Descriptor & Index Field Source; Search/Index Module & Persistence; Invoke Execution Path & Result Shape; MCP Registration / Read-Only Split / Tab-Origin Bias; Eval Harness & Gate; INV-01 Schema-Lock / Packaging / Catalog Shipping

## Assumptions Presented

### (A) Search Descriptor & Index Field Source
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Index fields come from a NEW separate capability-descriptor doc (per slug: intentSynonyms/description/service/actionVerb/sideEffectClass); recipe schema untouched | Confident | `capability-recipe-schema.js` closed vocab on `RECIPE_PATH_ALLOWLIST`; `catalog/recipes/github-notifications.json:1-9` has no such fields; `PITFALLS.md:264-266` |
| service/actionVerb/sideEffectClass authored but cross-checked vs recipe-derived (side-effect from method: GET=read, POST/PUT/PATCH=mutate, DELETE=destructive) | Confident (Likely on authored-vs-derived sub-choice) | `capability-fetch.js:228` `MUTATING_METHODS`; derivation as integrity check |

### (B) Search/Index Module & Persistence
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New `extension/utils/capability-search.js` (dual-export IIFE) owns MiniSearch + slug->recipe map; on `RECIPE_PATH_ALLOWLIST`; eval-free | Likely | `background.js:119-143` importScripts order; `verify-recipe-path-guard.mjs:84-97` Check 4 fail-closed; interpreter purity at `capability-interpreter.js:13-23` |
| Build via addAll at startup; snapshot toJSON -> `chrome.storage.local` key `fsbCapabilityIndex` + catalogVersion/hash; reload loadJSON on version match | Likely | `minisearch.min.js` API surface confirmed; `mcp-task-store.js` persistence discipline |

### (C) Invoke Execution Path & Result Shape
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Direct routerless path: slug -> recipe lookup -> interpretRecipe -> executeBoundSpec; param validation SW-side | Confident | `capability-interpreter.js:264-369`; `capability-fetch.js:377-385`; boundary note (router is Phase 29) |
| Result shape = `{success,status,finalUrl,redirected,data,text}`; bad slug -> new `RECIPE_NOT_FOUND` surfaces free; schema-on-hit returns recipe.params | Confident | `capability-fetch.js:377-385`; `errors.ts:137` `/^RECIPE_.+$/`; `errors.ts:71` `RECOVERY_AMBIGUOUS`; `FEATURES.md:39` |

### (D) MCP Registration / Read-Only Split / Tab-Origin Bias
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New `mcp/src/tools/capabilities.ts` via `server.tool()` OUTSIDE TOOL_REGISTRY (vault precedent); registered from runtime.ts | Confident | `vault.ts:20-48`; `runtime.ts:36-43`; `ARCHITECTURE.md:113,122,338-341` |
| search_capabilities {query,origin?,topN?} joins readOnlyTools bypass + read-only route; invoke_capability generic {slug,params?,tab_id?} enqueued + queued route | Confident | `queue.ts:30-52`; `observability.ts:84-110`; `ARCHITECTURE.md:44-45,124`; `mcp-tool-dispatcher.js:84-116` |
| Owned-tab origin resolved authoritatively SW-side (+ optional override); minisearch boost applies bias | Likely | `mcp-tool-dispatcher.js:178-298`; `capability-fetch.js:285-291`; `FEATURES.md:99` |

### (E) Eval Harness & Gate
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Zero-framework CI-automated `node tests/capability-search-eval.test.js` over intent->expected-slug fixtures; recall@k + wrong-invoke | Likely | `package.json:17,32` test/ci chain; `PITFALLS.md:271-274`; precedent `extension/test-data/edge-cases/edge_prompts.md` |
| Gate = recall@5 >= 0.9 AND wrong-invoke = 0; eval set seeded with synthetic head capabilities (catalog is sparse) | Likely | `PITFALLS.md:253-255` (mis-invoke = real side effect); `catalog/recipes/` = 1 real recipe + fixtures |

### (F) INV-01 Schema-Lock / Packaging / Catalog Shipping
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| No version bump needed (additive out-of-registry tools); parity hash unchanged; add `tests/capability-mcp-surface.test.js` INV-01 proof | Confident (Likely on no-bump policy) | `tool-definitions-parity.test.js:48-58` frozen hash; `mcp-version-parity.test.js:65-90` 5 locked files; `mcp/package.json:3` |
| catalog/ does NOT currently ship -> add copy step to package-extension.mjs + SW load path | Confident | `scripts/package-extension.mjs` zero catalog refs; `background.js` no recipe-loader |

## Corrections Made

No corrections -- ran in `--auto` mode. All assumptions were Confident or Likely (none Unclear); the recommended Alternative 1 was auto-selected for each Likely item with a sub-choice.

## Auto-Resolved

No Unclear assumptions required default-resolution. The following Likely sub-choices were auto-resolved to the analyzer's recommended Alternative 1:
- (A) Separate `catalog/descriptors/*.json` keyed by slug (vs pure derivation) -- chose descriptor + derivation cross-check.
- (B) `capability-search.js` location + `fsbCapabilityIndex` snapshot with catalogVersion (vs index-inside-interpreter) -- chose new allowlisted module.
- (D) Owned-tab origin resolved SW-side authoritatively + optional override (vs model-passed-only) -- chose SW-side authoritative.
- (E) CI-automated node eval test, gate recall@5 >= 0.9 AND wrong-invoke = 0 (vs manual-run snapshot) -- chose CI-automated.
- (F) Bundle catalog/ via package-extension.mjs copy step, no version bump (vs generated IIFE + 0.10.1 bump) -- chose copy step + no bump.

## External Research

None performed -- the analyzer flagged no codebase gaps. The vendored `minisearch.min.js` API (`loadJSON`/`toJSON`/`addAll`/`search`/`boost`/`combineWith`/`fuzzy`/`prefix`/`storeFields`/`searchableFields`/`extractField` all confirmed present) plus the `.planning/research/*` synthesis and the Phase 26/27 engine provided sufficient evidence. Residual open items (exact recall@k threshold, minisearch boost weights) are planner-tunable parameters, captured under Claude's Discretion in CONTEXT.md.
