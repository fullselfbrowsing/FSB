---
phase: 36-codegen-pipeline-no-dead-entry-resolution
verified: 2026-06-24T00:00:00Z
status: passed
score: 18/18 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification. Code review (36-REVIEW.md) HI-01/HI-02 + MED-01/MED-02 RESOLVED (commits 3cf40e50 + 499a329f); MED-03 deferred to Phase 37; LO-01/LO-04 cosmetic-open. All re-confirmed against the live codebase by this verifier."
---

# Phase 36: Codegen Pipeline + No-Dead-Entry Resolution -- Verification Report

**Phase Goal:** Build the build-time descriptor import pipeline AND the load-bearing no-dead-entry resolution so the moment descriptors land they are both SAFE (side-effect cross-checked, escalate-to-write on disagreement) and INVOCABLE (every searchable slug resolves to a non-null tier). Pipeline + quality gates exist BEFORE any real content import.
**Verified:** 2026-06-24
**Status:** passed
**Re-verification:** No -- initial verification (review fixes independently re-confirmed)

## Goal Achievement

This phase is build-script / gate / resolve() / eval machinery -- fully automatable. NO live-browser UAT applies (`human_needed` does not apply, as the prompt notes). Every truth below was verified by READING the actual code and RUNNING the relevant tests/gates in this verifier's own process (not by trusting SUMMARY.md). All 15 Phase-36 tests + gates exit 0; the importer re-emits byte-identical under tsx; the cross-check gate provably FAILS (exit!=0) on an under-stated op.

### Observable Truths (ROADMAP Success Criteria = the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **CGEN-01:** build-time tsx importer extracts OpenTabs op metadata (slug/params via z.toJSONSchema/origin/verb/desc) into provenance-stamped flat descriptor JSON; classifyGate-before-emit; recursive forbidden pre-scan; NO runtime opentabs/sdk/zod shipped | VERIFIED | `node --import tsx scripts/import-opentabs-catalog.mjs` -> exit 0, emitted 7 flat `opentabs__todoist__*.json`. Each descriptor: `params.additionalProperties===false`, `$schema` stripped, props 1-13, provenance sha=`4b170216...` + license MIT + signals, slug `todoist.*`. classifyGate import (line 50) + `await Denylist.load()` (line 347) BEFORE writes (line 378). |
| 2 | **CGEN-02:** side-effect class via shared verb-map + GraphQL/RPC carve-out + override; verify-catalog-crosscheck.mjs (chained into validate:extension) FAILS the build (exit!=0) on an under-stated destructive op; single shared module so importer + gate can't diverge | VERIFIED | `scripts/lib/side-effect-class.mjs` (299 lines) imported by BOTH importer (line 56 `deriveClass`) AND gate (lines 87-92). Proven no-divergence: all 7 importer-stamped classes EQUAL gate re-derivation. crossCheck returns failures (CLI exit 1) for void_invoice/delete_customer-downgraded/GraphQL-archive/HI-01 process_payment declared read; injected under-statement on real delete_task caught. Chained after verify-classification-gate.mjs. |
| 3 | **CGEN-03:** resolve() single descriptor-only fallback (T3 default / T2 when backing=learn); every searchable slug -> non-null tier; invoke never RECIPE_NOT_FOUND for a searchable slug; ZERO router edits | VERIFIED | `capability-catalog.js:347-356` -- single `if(!entry){ desc=_getDescriptor(slug); if(desc) return {tier: backing==='learn'?'T2':'T3', descriptor}; return null; }`. `no-dead-entry.test.js` 9/9 over the REAL corpus + synthetic learn fixture + negative control. `capability-router.test.js` 46/0: descriptor-only invoke -> RECIPE_DOM_FALLBACK_PENDING/RECIPE_LEARN_PENDING, unknown -> RECIPE_NOT_FOUND. Router switch (lines 743-777) unchanged. |
| 4 | **CGEN-04:** generated catalog inlined via readJsonDir; catalogVersion stable; IIFE/djb2 byte-shape unchanged (INV-01); smoke (todoist) eval re-passes (recall@k, wrong-invoke=0); SW cold-start within budget | VERIFIED | Snapshot: IIFE wrapper + `global.FsbRecipeIndex=DATA` + `module.exports=DATA`; 7 todoist slugs inlined (15 descriptors). `catalog-inline-shape.test.js` 14/0 (idempotent regen, deterministic+change-sensitive djb2). `capability-search-eval.test.js` 15/0: recall@5=1.000>=0.9, wrong-invoke=0.000, serialized 9.9KB<50KB, loadJSON+first-search 0.43ms<10ms. `head-handler-cap.test.js` 5/0 (HEAD_HANDLER_MODULES=3<=30). |

### Plan-level must-haves (cross-referenced; all VERIFIED)

| # | Plan must-have | Status | Evidence |
|---|----------------|--------|----------|
| 5 | zod/tsx/@opentabs-dev/plugin-sdk are devDependencies ONLY (absent from dependencies); jiti absent | VERIFIED | `package.json`: dependencies.{zod,tsx,plugin-sdk}=undefined; devDependencies.zod=^4.4.3, tsx=^4.22.4, plugin-sdk=0.0.113; jiti absent both lists. |
| 6 | No runtime opentabs/sdk/zod leaks into shipped extension/ (Wall 1); recipe-path-guard green | VERIFIED | grep for zod/plugin-sdk/opentabs/defineTool/z.toJSONSchema in `extension/**/*.js` (excl. tokenizer + .map) -> CLEAN. `verify-recipe-path-guard.mjs` PASS (20 files clean, capability-catalog.js on allowlist after the resolve edit). side-effect-class.mjs not referenced from extension/ (build-only). |
| 7 | Recursive forbidden-field pre-scan rejects script/expr/transform/code/fn/js at ANY depth (top/nested/array/union/$defs), passes clean | VERIFIED | `import-forbidden-prescan.test.js` 12/0 (all 6 positions). End-to-end: `assertCleanParams` THROWS on a `script` field planted in `$defs` (emit aborts for that op); clean schema not aborted. |
| 8 | classifyGate aborts emit (writes nothing) on an unclassified sensitive origin; benign todoist emits | VERIFIED | `import-classify-gate-call.test.js` 6/0 (gate refuses unclassified sensitive origin; passes benign todoist; importer exits 0 and writes >=1 descriptor). |
| 9 | _provenance.json apps[] filled with the todoist entry (SHA + slugs) | VERIFIED | `provenance-scaffold.test.js` exit 0; importer `fillProvenance` writes per-app entry; catalog-side apps[] non-empty. |
| 10 | crossCheck dual-exported (inline + CLI); CLI runs only on direct invocation | VERIFIED | `verify-catalog-crosscheck.mjs` exports `{crossCheck, deriveClass, verbClass}`; CLI guarded by `import.meta.url === pathToFileURL(process.argv[1])`. catalog-crosscheck.test imports the REAL crossCheck. |
| 11 | resolve() edit introduces NO eval/new Function/import( | VERIFIED | grep `eval(`/`new Function`/`import(` in capability-catalog.js -> CLEAN. recipe-path-guard green. |
| 12 | Snapshot regen idempotent over the same corpus (restore-not-rebuild) | VERIFIED | `catalog-inline-shape.test.js` proves in-memory regen reproduces committed bytes; importer re-run leaves git clean (no descriptor drift). |
| 13 | npm run validate:extension exits 0 end-to-end | VERIFIED | Ran: validate-extension (manifest + 285 JS clean, snapshot reconciled) + recipe-path-guard + classification-gate + catalog-crosscheck all PASS, exit 0. |

**Score:** 18/18 must-haves verified (4 ROADMAP SCs + 14 plan-level, deduplicated to the 18 distinct truths above).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/import-opentabs-catalog.mjs` | tsx importer (extract + pre-scan + gate + flat emit) | VERIFIED | 428 lines; exports toClosedParams/collectPropertyNames/preScanForbidden/assertCleanParams/inferSideEffect/verbPrefix/gateItems/extractDescriptors/runImport; runs under tsx exit 0. |
| `scripts/lib/side-effect-class.mjs` | the SINGLE shared derivation (HI-02) | VERIFIED | 299 lines; exports deriveClass/verbClass/verbPrefix/helperClass/methodClass/overrideFloor/maxClass + verb sets; imported by BOTH importer + gate. |
| `scripts/verify-catalog-crosscheck.mjs` | real derived-vs-declared fail-safe-high gate | VERIFIED | 200 lines (replaced the Plan-01 no-op stub); imports deriveClass from shared module; crossCheck compares declared<derived; CLI exit 1 on failure. |
| `extension/utils/capability-catalog.js` | the one resolve() descriptor-only fallback + accessors | VERIFIED | 430 lines; `_recipeIndex`/`_getDescriptor` (71-86); single `if(!entry)` fallback (347-356); HEAD_HANDLER_MODULES (3 entries). |
| `catalog/descriptors/opentabs__todoist__*.json` | 7 flat closed-params provenance descriptors | VERIFIED | 7 files, FLAT (no opentabs/ subdir); real params (1-13 props), closed, no $schema, full provenance+signals. |
| `extension/catalog/recipe-index.generated.js` | regenerated snapshot inlining the descriptors (INV-01) | VERIFIED | 623 lines; IIFE+dual-export tail intact; 7 todoist slugs inlined (15 descriptors). |
| `tests/{import-extraction,import-forbidden-prescan,import-classify-gate-call,catalog-crosscheck,no-dead-entry,catalog-inline-shape,head-handler-cap}.test.js` | real tests (not stubs) | VERIFIED | All 7 substantive (89-183 lines each), real assertions incl. adversarial HI-01/HI-02 cases; all exit 0. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| import-opentabs-catalog.mjs | verify-classification-gate.mjs | `import { classifyGate }` + `await Denylist.load()` before emit | WIRED | line 50 import; line 347 load; line 371 gate; line 378 writes (gate-before-emit). |
| import-opentabs-catalog.mjs | scripts/lib/side-effect-class.mjs | `import { verbPrefix, deriveClass }` (stamp via shared) | WIRED | line 56; inferSideEffect calls deriveClass (line 182). |
| verify-catalog-crosscheck.mjs | scripts/lib/side-effect-class.mjs | `import { deriveClass, verbClass, rankOf, ORDER }` (re-derive via SAME module) | WIRED | lines 87-92. No-divergence proven empirically (7/7 stamped==re-derived). |
| capability-catalog.js resolve() | FsbRecipeIndex.descriptors | `_getDescriptor(slug)` typeof-guarded read | WIRED | lines 75-86, 348. |
| resolve() fallback | capability-router.js switch(entry.tier) | exact 'T3'/'T2' literals -> typed seam reason | WIRED | router 743-777 maps T3->DOM_FALLBACK_PENDING, T2(no recipe)->LEARN_PENDING; router test 46/0. |
| package.json validate:extension | verify-catalog-crosscheck.mjs | chained after verify-classification-gate.mjs | WIRED | chain confirmed; ran exit 0. |
| package-extension.mjs readJsonDir | catalog/descriptors/opentabs__*.json | non-recursive flat read -> snapshot inline | WIRED | readJsonDir (51-54) non-recursive; 7 slugs inlined. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| emitted descriptors | params | z.toJSONSchema(tool.input) from vendored todoist op schemas | Yes (1-13 real props per op; closed-vocab) | FLOWING |
| recipe-index.generated.js | DATA.descriptors | readJsonDir(catalog/descriptors) | Yes (15 descriptors incl. 7 todoist) | FLOWING |
| crossCheck gate | derived class | provenance.signals re-derived via shared deriveClass | Yes (matches stamped on real corpus; catches injected under-statement) | FLOWING |
| resolve() fallback | tier | descriptor.backing read from FsbRecipeIndex.descriptors | Yes (T3 real for 7 dom-backed slugs; T2 for learn fixture) | FLOWING |
| eval index | search hits | buildIndex over seed-descriptors fixtures (todoist + asana/linear near-neighbors) | Yes (recall@5=1.000, 58 fixtures, params schema-on-hit) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Importer emits under tsx | `node --import tsx scripts/import-opentabs-catalog.mjs` | emitted 7 flat descriptors, exit 0 | PASS |
| Importer re-emit is byte-identical (no drift/mis-stamp) | diff vs committed + git status | NO DRIFT, git clean | PASS |
| Cross-check gate PASSES clean corpus | `node scripts/verify-catalog-crosscheck.mjs` | PASS (7 descriptors), exit 0 | PASS |
| Cross-check gate FAILS under-stated op | crossCheck([void_invoice declared read]) | 1 failure (CLI would exit 1) | PASS |
| Cross-check catches GraphQL mutation-as-read | crossCheck([linear.archiveIssue graphql declared read]) | 1 failure | PASS |
| Cross-check catches HI-01 api/no-method/unknown-verb | crossCheck([evil.process_payment api null process declared read]) | 1 failure | PASS |
| Correctly-stated op not false-flagged | crossCheck([delete_customer declared destructive]) | 0 failures | PASS |
| Forbidden field aborts emit | assertCleanParams(planted-in-$defs) | THROWS | PASS |
| resolve() -> non-null seam for searchable slug | resolve('todoist.create_task') | {tier:'T3'} no recipe | PASS |
| resolve() -> null for unknown slug | resolve('nonexistent.slug') | null | PASS |
| validate:extension end-to-end | `npm run validate:extension` | 4-gate chain all PASS, exit 0 | PASS |
| Cold-start budget | capability-search-eval | 9.9KB<50KB, 0.43ms<10ms | PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes are declared for this phase; the phase's runnable verification surface is the test files + the gate scripts (all executed above). Not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CGEN-01 | 36-01 | tsx importer -> provenance-stamped descriptor JSON; no runtime opentabs/sdk shipped (Wall 1) | SATISFIED | Truth #1, #5, #6, #7, #8, #9 |
| CGEN-02 | 36-03 | side-effect class inference + descriptor-vs-derived cross-check fails build on under-statement | SATISFIED | Truth #2, #10; shared-module no-divergence proven |
| CGEN-03 | 36-02 | resolve() single fallback -> T3/T2; harness proves no searchable-but-uninvocable dead entries | SATISFIED | Truth #3, #11 |
| CGEN-04 | 36-04 | catalog inlined via readJsonDir, stable catalogVersion, IIFE/djb2 unchanged; smoke eval re-passes | SATISFIED | Truth #4, #12 |

No orphaned requirements: REQUIREMENTS.md maps exactly CGEN-01..04 to Phase 36, and all four appear in plan frontmatter `requirements:` fields (36-01 CGEN-01, 36-02 CGEN-03, 36-03 CGEN-02, 36-04 CGEN-04).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | No TBD/FIXME/XXX in any Phase-36 file | -- | No BLOCKER debt markers |
| (none) | -- | No TODO/HACK/PLACEHOLDER in any Phase-36 file | -- | No leftover scaffolding |
| (none) | -- | Plan-01 verify-catalog-crosscheck.mjs stub genuinely replaced (no `no-op`/`PASS (stub)` remnants) | -- | Real gate, not a stub |

The intentional CI-green stubs Plan 01 created (verify-catalog-crosscheck.mjs, no-dead-entry/catalog-crosscheck/catalog-inline-shape/head-handler-cap tests) were ALL filled in-place by Plans 02-04 -- verified: every one now contains substantive logic and real assertions, none is still a stub.

### Notable Deviation (accepted, not a gap)

**ROADMAP SC#1 wording says descriptors live under `catalog/descriptors/opentabs/` (a subdir); the implementation emits FLAT** (`catalog/descriptors/opentabs__<svc>__<op>.json`). This is a deliberate, documented PLAN resolution (36-01 interfaces, "RESOLVED A1"), and it is the CORRECT engineering choice: `package-extension.mjs` `readJsonDir` (lines 51-54) and `validate-extension.mjs` are NON-RECURSIVE -- a physical `opentabs/` subdir would be SILENTLY DROPPED, so the descriptors would never inline into the shipped snapshot. The flat filename carries the `opentabs` namespace as a prefix + `provenance.source`, fully preserving the SC intent (descriptors land, inline, and are searchable -- all verified). The subdir wording would have been a latent build bug. This deviation strengthens, not weakens, the goal; no override entry is required since the SC outcome (provenance-stamped descriptor JSON that inlines) is observably achieved.

### Human Verification Required

None. Per the phase scope, all Phase-36 deliverables are build-script/gate/resolve()/eval and fully automatable; there is no live-browser UAT surface. `status: human_needed` does not apply.

### Deferred Items (not Phase-36 gaps)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | MED-03: synonym-generator cross-app collision / grammar hardening at breadth scale | Phase 37 | 36-REVIEW.md MED-03 marked SKIPPED -- "the smoke eval passes today" (recall@5=1.000, wrong-invoke=0 on the 7-op todoist smoke set); fixing requires the synonym generator + asana/linear fixtures + eval re-tune. Phase 37 is the breadth-prep phase. Confirmed: the Phase-36 smoke eval re-passes today, so this is genuinely future-scoped. |

LO-01 (runImport double-loads the denylist) and LO-04 (resolve() comment implies an enum the code does not assert) remain open per the review as cosmetic/optional-hardening -- both are behaviorally safe (LO-01: both paths load-first; LO-04: any non-'learn' backing defaults to the more-conservative T3 DOM seam) and neither blocks the phase goal. Informational only.

### Gaps Summary

No gaps. All four ROADMAP success criteria (CGEN-01..04) are observably achieved in the codebase and independently re-verified by running every Phase-36 test and gate in this verifier's own process:

- The pipeline is SAFE: the side-effect cross-check is a real gate built on a SINGLE shared derivation module (importer + gate cannot diverge -- proven 7/7 equal), it FAILS the build (exit!=0) on an under-stated destructive/mutating op including the GraphQL-POST-as-read and the HI-01 api/no-method/unknown-verb false-negative the review closed, and it is chained into validate:extension. classifyGate runs before any write.
- The pipeline is INVOCABLE: resolve() gains exactly one descriptor-only fallback returning a non-null seam tier (T3/T2), the no-dead-entry harness proves every searchable slug -> non-null tier over the REAL emitted corpus, and an actual router invoke yields RECIPE_DOM_FALLBACK_PENDING/RECIPE_LEARN_PENDING (never RECIPE_NOT_FOUND for a searchable slug), with zero router edits.
- The machinery exists BEFORE content: 7 todoist smoke descriptors prove the closed-params + Wall-1 pre-scan + provenance + flat-emit + inline path end-to-end; the catalog inlines with byte-stable IIFE/djb2 (INV-01); the smoke eval re-passes (recall@5=1.000, wrong-invoke=0); and the SW cold-start budget machinery (9.9KB<50KB, 0.43ms<10ms) plus the HEAD_HANDLER_MODULES<=30 cap are in place for breadth.

The two HIGH review findings and the two actioned MEDIUMs are RESOLVED and their fixes are wired AND asserted in committed tests (catalog-crosscheck.test cases (f) HI-01 and (g) HI-02 both pass). MED-03 is correctly deferred to Phase 37.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
