---
phase: 55-chrome-local-graph-incremental-truth-foundation
plan: "03"
subsystem: trusted-local-graph-extraction
tags: [chrome-extension, universal-provider, structured-output, capability-session, utf8-evidence]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    provides: Fresh source certificates, operation cancellation, one-use content sinks, and opaque effect acknowledgement
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    plan: "01"
    provides: Closed extraction schema, semantic evidence parser, local identities, and provider cancellation
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    plan: "02"
    provides: Provider-bound staging batches and exact complete-fragment seal payload
provides:
  - Eight-invariant opaque one-source extraction sessions with fresh one-use certificate admission
  - Deterministic normalized UTF-8 excerpts bounded to eight calls, eight excerpts, and 24,000 characters per call
  - Stateless configured-provider requests with fixed temperature/output caps, strict bare-JSON admission, and one bounded repair
  - Generation-qualified prior handles, locally derived immutable batches, exact reuse keys, and complete fragment/index assembly
affects: [55-05-graph-runtime, graph-evals, source-replacement]

tech-stack:
  added: []
  patterns: [weakmap-session-capability, inert-json-prompt-envelope, ephemeral-provider-result, complete-generation-assembly]

key-files:
  created:
    - extension/utils/skopeo-graph-extractor.js
    - tests/skopeo-graph-extractor.test.js
  modified: []

key-decisions:
  - "The public session enumerates only partition/account/source/content/schema/prompt/provider/model invariants; excerpt text, validated working data, and mutable state remain in a private WeakMap and are erased on terminal outcomes."
  - "Each normal or repair step rereads settings and calls only the injected UniversalProvider-compatible factory once; provider/model drift invalidates and clears the generation before provider or staging work."
  - "Phase 54 ingestion certificates intentionally expose a null content fingerprint, so preparation binds the recomputed one-use transport byte hash; a later non-null fingerprint must match, while null-fingerprint certificates can fence work but cannot produce an exact reuse key."
  - "Only stripped schema-parsed batches cross the staging seam, and finalization returns the graph store's exact fragment/lexical/adjacency/result-cache seal payload after complete coverage."

patterns-established:
  - "Ephemeral provider step: raw response exists only in frozen `{status, rawResponse, outcome}` preparation data; the outcome's exact-key batch contains no prompt, source excerpt, candidate ref, or raw response."
  - "Terminal fail-closed cleanup: drift, cancellation, certificate misuse, provider failure, semantic failure, and budget failure clear every private excerpt and partial-generation collection."
  - "Response-local identity: raw candidate refs resolve only inside one response, while later batches receive bounded `{handle, kind}` projections backed by exact same-generation private entries."

requirements-completed: [LOCAL-02, LOCAL-04, LOCAL-05, TRUTH-01, TRUTH-10]

duration: 35 min
completed: 2026-07-21
---

# Phase 55 Plan 03: Bounded Local Graph Extractor Summary

**One freshly certified source now becomes bounded inert provider requests and a complete locally identified graph candidate only after exact provider, schema, evidence, reference, coverage, and authority gates pass**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-21T14:22:36Z
- **Completed:** 2026-07-21T14:57:06Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 2

## Accomplishments

- Added `FsbSkopeoGraphExtractor` with its exact frozen surface, nonserializable Proxy sessions, private certificate replay protection, deterministic line normalization/UTF-8 locators, one-use transport sink consumption, and terminal state disposal.
- Added the sole configured-provider path: one static system policy plus one JSON-stringified one-source envelope, provider-specific temperature/output controls, the exact operation signal, no history/tools/fallback/cache, a 128-KiB raw gate, one bare `JSON.parse`, and one separately certified repair allowance.
- Reused the production graph schema for closed structural/semantic/evidence admission, including response-local refs, advertised generation-qualified prior handles, local endpoint rules, derived IDs, collision checks, and exact store-ready batch fields.
- Added complete-generation finalization into immutable fragment, lexical, and adjacency inputs with exact provider/model provenance and zero partial output; exact reuse keys cover all seven required dimensions.
- Added a 135-assertion recorded-provider oracle covering exact maxima and max-plus-one boundaries, normalized multibyte locators, hostile prompts/responses, replay/clone/expiry/abort/drift, repair, prior metadata, cancellation, storage separation, and final assembly.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Specify opaque sessions, request minimization, budgets, and no-storage provider handoff** - `effed3a5` (test)
2. **Task 2 GREEN: Implement deterministic segmentation and configured-provider extraction sessions** - `694e7002` (feat)
3. **Task 3 RED: Harden evidence, reuse, ingestion-certificate, and terminal cancellation gates** - `deffe076` (test)
4. **Task 3 GREEN: Complete semantic admission, exact reuse, disposal, prompt schema, and final assembly** - `a43b814f` (feat)

## Files Created/Modified

- `extension/utils/skopeo-graph-extractor.js` - Frozen extractor factory, opaque sessions, deterministic segmentation, provider calls, strict validation/repair, prior-handle registry, exact reuse, disposal, and complete graph-store seal assembly.
- `tests/skopeo-graph-extractor.test.js` - Recorded transport/provider/certificate contract with privacy markers, exact boundaries, fresh-operation choreography, hostile validation fixtures, and complete fragment/index verification.

## Test Evidence

- Controlled RED passed by exiting nonzero only because `extension/utils/skopeo-graph-extractor.js` and `FsbSkopeoGraphExtractor` were absent.
- The final extractor contract passed **135 assertions / 0 failures**; syntax and `git diff --check` passed.
- Graph schema compatibility passed **572 / 0**, including the same extraction, fragment, lexical, adjacency, identity, and evidence parsers used by the extractor.
- Universal provider cancellation passed **68 / 0**, including abort propagation through fetch and retry backoff.
- Graph store, Drive authority/controller, and Drive corpus transport contracts each passed with **PASS / 0 failures**.
- Static scans found no automation integration, conversation history, response cache, CLI parser, direct fetch, socket, dynamic evaluation, tool, callback, package, or external-service path.

## Decisions Made

- Kept the session comparison tuple visible but inert: its eight nonsecret scalar values are frozen on the capability, while every raw or mutable value is private and the capability cannot serialize or structured-clone.
- Used fixed 24,000-character call windows split into at most eight deterministic excerpts, preserving normalized UTF-8 source byte offsets without fuzzy evidence recovery.
- Classified only bare-JSON and closed-schema failures as repairable. Evidence, endpoint, reference, provider, authority, cancellation, and budget failures invalidate and erase the generation.
- Stripped `candidateRef`, `candidateHandle`, and candidate ordinals before staging; only private prior registry entries retain the derived details required to validate later advertised handles.
- Returned the exact Plan 02 seal payload from finalization so Plan 05 can pass it directly through a separately certified graph-store effect without reshaping or retaining source/model bytes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Integration] Supported the production ingestion certificate's intentionally absent content fingerprint**

- **Found during:** Task 3 integration hardening against the Phase 54 authority implementation.
- **Issue:** Fresh ingestion certificates carry `contentFingerprint: null`; rejecting them would make the production extraction path impossible even though the one-use content transport supplies a recomputed byte hash.
- **Fix:** Preparation binds the trusted transport hash as the session fingerprint. Later non-null certificate fingerprints must match exactly; fresh null-fingerprint ingestion certificates may continue under Phase 54 authority, but exact reuse returns `content-fingerprint-unavailable` rather than constructing a partial key.
- **Files modified:** `extension/utils/skopeo-graph-extractor.js`, `tests/skopeo-graph-extractor.test.js`
- **Verification:** Recorded sink/certificate fixtures prove hash binding, later fresh-operation admission, mismatch rejection, and zero null-fingerprint reuse.
- **Committed in:** `a43b814f`

---

**Total deviations:** 1 auto-fixed blocking integration issue.
**Impact on plan:** The adjustment preserves fail-closed reuse and enables the existing Phase 54 ingestion interface without adding state, authority fields, packages, or a second provider path.

## Issues Encountered

- The content transport delivers text through a one-use sink rather than returning text in its public result. Preparation now supplies exactly one sink, verifies the same live operation signal, and rejects missing or duplicate sink delivery.

## User Setup Required

None - no package, provider, credential, host, external service, or manual configuration was added.

## Next Phase Readiness

- Plan 05 can open provider-bound staging with `verifyProviderBinding`, wrap each `nextBatch`/`repairBatch` prepared step in the exact Phase 54 no-storage publisher acknowledgement, immediately discard its raw response, and stage only `outcome.batch` under a later fresh operation.
- Finalization produces the exact Plan 02 seal payload and clears private source/working state after success.
- No blocker remains for Plan 04 query work or Plan 05 runtime orchestration.

## Self-Check: PASSED

---
*Phase: 55-chrome-local-graph-incremental-truth-foundation*
*Completed: 2026-07-21*
