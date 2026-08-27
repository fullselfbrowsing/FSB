---
phase: 55
fixed_at: "2026-07-21T21:23:23Z"
review_path: .planning/phases/55-chrome-local-graph-incremental-truth-foundation/55-REVIEW.md
iteration: 3
findings: 1
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 55: Code Review Fix Report

**Fixed at:** 2026-07-21T21:23:23Z
**Source review:** .planning/phases/55-chrome-local-graph-incremental-truth-foundation/55-REVIEW.md
**Iteration:** 3

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0
- Atomic fix commits this iteration: 2

## Fixed Issues

### W-01: B01/B02 overstate exact and max-plus-one fixture coverage

**Status:** fixed
**Commit:** e827ab53
**Files modified:** tests/fixtures/skopeo-graph-evals/cases.json, tests/skopeo-graph-evals.test.js

**Applied fix:** B01 and B02 now expose a distinct measured value and rejection/admission boolean for every declared numeric boundary. Every authority-transition token and every B01/B02 query-proof field resolves to its corresponding runtime observation. The shared `maxPlusOneProbesObserved` flag, the literal `every_max_plus_one_rejected` override, and the grouped `execute-exact-query-caps` proof were removed.

B01 executes and observes 20 individual exact boundaries: 192,000 source characters; 8 excerpts and 24,000 excerpt characters per call; 8 normal calls; 1 repair call; 131,072 response characters; 128 records; 256 relations; 4 evidence locators; 128 advertised prior candidates; an actually serialized 16,384-byte prior projection; 2,048 requested output tokens; pointer-last publication; a 32-source scope; 512 query characters; topN 20; depth 2; node limit 64; edge limit 128; and an actually serialized, admitted 65,536-byte traversal result.

B02 executes and observes 17 individual max-plus-one boundaries: 192,001 source characters with zero provider calls; 9 excerpts; 24,001 excerpt characters; 131,073 response characters with zero staging; 129 records; 257 relations; 5 evidence locators; a second repair attempt with no third provider call; 129 prior candidates with only 128 advertised and the overflow handle absent; an actually serialized 16,385-byte prior candidate with zero entries projected; a rejected 33-source scope; query length 513; topN 21; depth 3; node limit 65; edge limit 129; and an actually serialized, rejected 65,537-byte traversal result. Every query max-plus-one probe is a separate production `GraphQuery` call.

The real GraphSchema-backed path supplies the 128/129 candidate-count evidence. Because its closed handle/kind shapes naturally top out at 13,825 serialized bytes under the 128-entry cap, the byte-only defense-in-depth branch is exercised through GraphExtractor's existing injected schema seam: one production-schema-validated candidate is given a controlled post-validation handle size, then the unmodified production extractor performs and measures the 16,384/16,385-byte prompt projection. The exact result-byte probe uses production GraphSchema parsing and a production GraphQuery traversal; labels are deterministically sized until the actual final JSON result measures exactly 65,536 bytes.

**Cumulative relevant commit evidence:** `b1c3a484` made all 37 fixture IDs executable in review iteration 2. `e827ab53` closed iteration 3's original observation gap by replacing shared/literal claims with exact per-boundary probes. `2cd1a9b6` adds the post-cap confirmation evidence described below.

### Post-cap confirmation addendum

**Commit:** 2cd1a9b6
**Files modified:** tests/fixtures/skopeo-graph-evals/cases.json, tests/skopeo-graph-evals.test.js

The final confirmation warning is resolved without starting a new review iteration. The query-boundary harness now creates a real GraphSchema-parsed fragment plus lexical and adjacency shards, supplies those artifacts through the production GraphQuery store contract, creates and hydrates an exact production scope, and only then executes boundary calls.

B01 now executes five independent production calls for query length 512, topN 20, traversal depth 2, node limit 64, and edge limit 128. Every call returns a non-empty/non-null result and records its own numeric measurement and admission field; the obsolete shared `searchAdmitted` and `traversalAdmitted` fields no longer exist.

B02 now pairs each isolated +1 probe with an immediately preceding exact-limit control on the same hydrated scope. The 512-character and top-20 controls return non-empty lexical results, and the depth-2, node-64, and edge-128 controls return non-null traversals before their 513/21/3/65/129 counterparts reject. Each control and rejection has a separate observation consumed by both the transition proof and query proof.

The result-byte path also executes a paired production traversal: an actual 65,536-byte result is admitted, the same schema-valid fixture is expanded by exactly one byte, and the measured 65,537-byte result is rejected as `null`. B02 carries the new `reject-65537-result-bytes` transition, `result_bytes_rejected` query proof, and separate control/rejection observations.

## Verification

- `node tests/skopeo-graph-evals.test.js` — PASS; 37 fixtures, deterministic structural/security PASS, provisional regression PASS (not gold), `domain_fidelity: human_needed`.
- `npm run test:skopeo-graph-evals` — PASS; schema 572/572, provider cancellation 75/75, graph store PASS, extractor 135 assertions, query PASS, runtime PASS, and 37-case eval PASS.
- `node scripts/verify-skopeo-storage-boundary.mjs` — PASS; 32 injected/dependency files checked.
- `npm run validate:extension` — PASS; all extension gates passed and 435 JavaScript files parsed cleanly.
- `node tests/skopeo-corpus-store.test.js` — PASS; 71 assertions.
- `node tests/lattice-provider-bridge-smoke.test.js` — PASS; 111/111.
- `node --check tests/skopeo-graph-evals.test.js`, fixture JSON parsing, and `git diff --check` — PASS.
- `node tests/skopeo-browser-contract.test.js` — PASS after the first full-suite attempt hit the repository's intermittent Chrome DevTools startup timeout.
- `npm test` — PASS on the final rerun, including `tests/skopeo-browser-contract.test.js`; the initial environment-only Chrome startup timeout did not reproduce in isolation or on the full rerun.

The full-suite run regenerated only crawler-file dates in `showcase/angular/public/llms-full.txt` and `showcase/angular/public/sitemap.xml`; those dates were restored with `apply_patch`, and both files are byte-identical to their pre-run state.

## Remaining Human Gate

The corpus still contains exactly 37 fixtures with category counts 6/6/7/5/3/7/3. All labels remain pending and `domain_fidelity` remains exactly `human_needed`; no deterministic probe or this review fix fabricates expert approval.

---

_Fixed: 2026-07-21T21:23:23Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
