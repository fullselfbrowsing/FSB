---
phase: 56-governing-lineage-evidence-deadline-engine
plan: "02"
subsystem: exact-set-graph-truth-extraction
tags: [chrome-extension, drive-authority, exact-set, graph-snapshot, configured-provider, truth-extraction]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    provides: Fresh operation-local Drive authority certificates and complete visible-corpus source selection
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    provides: Immutable graph fragments, exact evidence locators, query scopes, and bounded configured-provider extraction patterns
  - phase: 56-governing-lineage-evidence-deadline-engine
    plan: "01"
    provides: Closed truth candidate schema, typed fact vocabulary, exact candidate identities, and deadline-rule operators
provides:
  - Explicit six-state source access/currentness on fresh Drive authority certificates
  - One complete capped exact-set graph snapshot with canonical records, relations, evidence, source bindings, and sgx1 digest
  - One bounded source-local configured-provider truth candidate stage with exact issued handles, current-batch evidence, repair fencing, cancellation, and no-storage acknowledgement
affects: [56-03-adjudication, 56-04-truth-store, 56-05-runtime, phase-57, phase-58, phase-59]

tech-stack:
  added: []
  patterns: [fresh-authority-exact-set, source-state-separate-from-trust, label-independent-native-sha256, source-local-provider-no-storage]

key-files:
  created:
    - extension/utils/skopeo-truth-extractor.js
    - tests/skopeo-truth-extractor.test.js
  modified:
    - extension/utils/skopeo-drive-authority.js
    - extension/utils/skopeo-graph-query.js
    - extension/utils/skopeo-graph-engine.js
    - tests/skopeo-drive-authority.test.js
    - tests/skopeo-graph-query.test.js
    - tests/skopeo-graph-runtime.test.js

key-decisions:
  - "Drive source state is a fresh-authority input separate from claim trust: ready, unreadable, and download-blocked may be certified as observed states, while pending/inaccessible/missing block complete graph use."
  - "Exact-set graph snapshots enumerate the whole current scope once, validate every source/generation/endpoint/evidence binding, and hash only canonical identity/currentness inputs; labels, filenames, recency, scores, and ordering hints cannot affect the digest."
  - "Truth extraction stages a normalized batch only after a frozen provider-no-storage acknowledgement and validates evidence against only the handles advertised to that current source batch."
  - "The extractor accepts only the graph runtime's sgx1 authorized-set namespace; a sha256 source fingerprint cannot substitute for complete-set authority."

patterns-established:
  - "Whole-set or nothing: source-state blockers, cap overruns, cache drift, stale generations, dangling endpoints, or final-currentness failure return no record/relation prefix."
  - "Candidate-only provider boundary: one configured provider/model sees one source's bounded inert excerpts and handle/kind projections, while all durable identities and locator ownership resolve locally."
  - "Repair by capability identity: only bare-JSON/closed-shape failures may receive one fresh-authority category/path-only repair; semantic, evidence, provider, authority, and cancellation failures are terminal."

requirements-completed: [TRUTH-02, TRUTH-03, TRUTH-04, TRUTH-06, TRUTH-07, TRUTH-09]

duration: 44 min
completed: 2026-07-23
---

# Phase 56 Plan 02: Exact-Set Graph Snapshot and Source-Local Truth Extraction Summary

**Fresh Drive authority now yields either one complete identity-bound graph set or no graph data, and the existing configured provider can propose only closed source-local truth candidates through exact current handles and evidence**

## Performance

- **Duration:** 44 min
- **Started:** 2026-07-23T23:44:24Z
- **Completed:** 2026-07-24T00:28:10Z
- **Tasks:** 4 TDD tasks
- **Files modified:** 8

## Accomplishments

- Added explicit `sourceState` to fresh Drive authority certificates and final-currentness comparisons, preserving all six access/currentness states without collapsing them into extracted claim trust.
- Added complete exact-set query enumeration and the background `snapshotExactSet` facade with canonical source/record/relation/evidence collections, exact endpoint-current overlays, fixed 32/4,096/16,384/65,536/8-MiB caps, before/after cache checks, final authority checks, and an identity-only `sgx1:` digest.
- Added `FsbSkopeoTruthExtractor` with one-source nonserializable sessions, exact partition/source/fingerprint/fragment/exact-set/provider/model bindings, the unchanged 8/24k/8/192k/1/20s/2,048/131,072 budgets, static inert-data prompts, configured-provider parity, and zero fallback or storage capability.
- Enforced whole-batch hostile-data parsing through the real Plan 01 truth schema, exact current-batch evidence advertising, one category/path-only shape repair, provider-no-storage acknowledgement before staging, late-cancellation suppression, and recursively frozen complete generations.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Specify authority, exact-query, and runtime contracts** - `57856392` (test)
2. **Task 2 GREEN: Implement source state and exact-set graph snapshots** - `c3a76a23` (feat)
3. **Task 3 RED: Specify the source-local truth-extractor contract** - `fead3420` (test)
4. **Task 4 GREEN: Implement bounded configured-provider truth extraction** - `f25b2cd3` (feat)

Post-task integration correction:

- **Bind extraction to the graph exact-set digest namespace** - `db163b68` (fix)

## Files Created/Modified

- `extension/utils/skopeo-drive-authority.js` - Fresh six-state source access/currentness certification and drift comparison.
- `tests/skopeo-drive-authority.test.js` - Controlled source-state authority contract and state/currentness permutations.
- `extension/utils/skopeo-graph-query.js` - Complete canonical graph enumeration with whole-result caps and cache-currentness fencing.
- `tests/skopeo-graph-query.test.js` - Exact-set enumeration, evidence ownership, permutation, drift, and max/max-plus-one contract.
- `extension/utils/skopeo-graph-engine.js` - Fresh-authority exact-set orchestration, source blockers, full endpoint/evidence validation, native digest, final recheck, and frozen facade.
- `tests/skopeo-graph-runtime.test.js` - Runtime exact membership, blocker, drift, release, cap, digest, and no-fallback contract.
- `extension/utils/skopeo-truth-extractor.js` - Source-local configured-provider session state machine, inert prompt, exact schema/handle admission, repair/cancellation budgets, and no-storage handshake.
- `tests/skopeo-truth-extractor.test.js` - Controlled RED/GREEN oracle with 177 assertions across provider formats, every candidate class/operator, hostile authority fields, exact evidence, budgets, repair, cancellation, disposal, and static capability absence.

## Test Evidence

- Controlled authority/query/runtime RED passed only when all three exact stable markers were present under the intended missing-contract paths.
- Controlled truth-extractor RED exited nonzero with exactly `skopeo truth extractor contract` after the real graph schema, truth schema, locator fixtures, and fake-provider harness preflighted successfully.
- Final combined gate passed in 3.44 seconds:
  - Drive authority contract: **PASS**
  - graph query contract: **PASS**
  - graph runtime contract: **PASS**
  - truth schema contract: **PASS**
  - truth extractor contract: **177 assertions passed**
- `node --check` passed for all four modified production modules.
- Existing graph evaluations remained green after exact-set implementation: all 37 fixtures executed; deterministic structural/security passed, provisional regression passed as not-gold, and domain fidelity remained `human_needed`.
- `git diff --check` passed. The plan changed no provider adapter, package, lockfile, host permission, MCP surface, background boot wiring, or storage registry.

## Decisions Made

- Made source access/currentness a certificate field rather than a truth claim. An unreadable or unavailable source is observable authority state, never evidence that a contract assertion is false.
- Derived complete-set identity from source state/fingerprint/generation, record/relation version IDs, and full evidence locator identities. Model labels and relevance/order metadata are deliberately absent so harmless text/order changes cannot select governing data.
- Kept the truth extractor independent of graph query, storage, adjudication, civil-date arithmetic, content routing, and background publication. Its only external effect is the already-configured provider call under the caller's operation signal.
- Required the exact no-storage acknowledgement before an accepted candidate batch enters even private session staging, and filtered semantic evidence context to the handles advertised in that current batch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test fixture correctness] Bounded the large-source locator fixture**

- **Found during:** Task 4 first GREEN run
- **Issue:** The test helper registered an entire 192,001-character source as one Phase 55 graph excerpt, so the graph schema correctly rejected the fixture before the intended source-budget assertion.
- **Fix:** Issued one exact first-excerpt locator per 24,000-character batch, using the same deterministic excerpt IDs and byte starts as production segmentation.
- **Files modified:** `tests/skopeo-truth-extractor.test.js`
- **Verification:** Exact 192,000-character/eight-call coverage passes and 192,001 characters fail before provider work.
- **Committed in:** `f25b2cd3`

**2. [Rule 1 - Integration correctness] Aligned authorized-set digest namespaces**

- **Found during:** Final cross-task review
- **Issue:** Task 2 correctly emits `sgx1:<sha256>` while the initial Task 4 guard reused the `sha256:` source-fingerprint validator, which would have rejected the real exact-set digest at integration time.
- **Fix:** Added a dedicated `sgx1:` validator and an executable negative assertion proving a source fingerprint cannot substitute for complete-set authority.
- **Files modified:** `extension/utils/skopeo-truth-extractor.js`, `tests/skopeo-truth-extractor.test.js`
- **Verification:** The five-suite combined gate passes; exact-set digest binding is present in the finalized generation.
- **Committed in:** `db163b68`

---

**Total deviations:** 2 auto-fixed correctness issues
**Impact on plan:** Both fixes tightened the locked exact-set/source-local contract. No dependency, provider, permission, storage, UI, scheduling, or network capability was added.

## Issues Encountered

- No production blocker remained. The only failures were controlled RED outcomes and the two fixture/integration mismatches documented above.

## User Setup Required

None - no package, credential, provider, host permission, service, database, daemon, MCP integration, or external configuration was added.

## Next Phase Readiness

- Plan 56-03 can consume one complete canonical `sgx1:`-bound graph set plus frozen source-local execution/effectiveness, lineage, fact, and deadline-rule candidates without trusting labels or model decisions.
- Plan 56-04 can persist only deterministic adjudication output while retaining complete source/generation/evidence reverse dependencies.
- Provider qualification and representative contract-domain fidelity remain explicitly human-needed; deterministic/security and provisional synthetic coverage do not promote those labels to legal gold.

## Self-Check: PASSED

---
*Phase: 56-governing-lineage-evidence-deadline-engine*
*Completed: 2026-07-23*
