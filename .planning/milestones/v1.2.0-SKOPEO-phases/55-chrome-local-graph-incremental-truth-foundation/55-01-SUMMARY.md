---
phase: 55-chrome-local-graph-incremental-truth-foundation
plan: "01"
subsystem: local-graph-schema-provider-boundary
tags: [chrome-extension, graph-schema, deterministic-identity, evidence, cancellation, abort-signal]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    provides: Exact partition/source authority, content fingerprints, trusted-local storage boundary, and fresh operation cancellation
provides:
  - Frozen classic-script/CommonJS graph schema with exact kinds, predicates, caps, durable records, and hostile-descriptor rejection
  - Source-scoped stable record/relation IDs plus fingerprint-bound fragment, version, prior-handle, and candidate-overlay generation IDs
  - Closed extraction envelope with issued UTF-8 evidence ranges and same-generation advertised prior-candidate resolution
  - Separate trusted cross-document candidate intent and endpoint-version-bound durable relation contracts
  - Caller AbortSignal composition through provider fetch, timeout, 429/503 backoff, 400 retry, recursive retry, and late completion
affects: [55-02-graph-store, 55-03-graph-extractor, 55-04-graph-query, 55-05-graph-runtime]

tech-stack:
  added: []
  patterns: [descriptor-safe-closed-parser, length-prefixed-source-identity, generation-qualified-candidate-handle, composed-provider-cancellation]

key-files:
  created:
    - extension/utils/skopeo-graph-schema.js
    - tests/skopeo-graph-schema.test.js
    - tests/universal-provider-cancellation.test.js
  modified:
    - extension/ai/universal-provider.js

key-decisions:
  - "The public graph module uses exact version strings while the untrusted extraction envelope retains AI-SPEC's bare integer schemaVersion 1; the engine attaches the versioned source namespace after validation."
  - "Stable record identity includes only partition, source, kind, primary UTF-8 source range, and the fixed primary-evidence local key; labels, candidate refs, content fingerprints, and provider output cannot disambiguate it."
  - "The reserved @fsb: handle namespace is outside the model candidateRef alphabet and every handle binds fragment generation, prior batch ordinal, candidate ordinal, and stable record ID."
  - "Cross-document output remains a candidate: relation versions bind both endpoint record versions/generations and canonical proposing-source evidence, while the complete sorted relation set binds the overlay generation."
  - "Provider timeout errors retain their exact existing message and private classification; caller cancellation emits a fixed AbortError with FSB_PROVIDER_ABORTED and never reads or propagates the caller reason."

patterns-established:
  - "Closed graph values: exact enumerable data descriptors are copied into recursively frozen null-prototype records before later storage consumers can observe them."
  - "Identity/version split: stable IDs exclude content and labels, while fragment, record, local relation, candidate relation, and overlay versions bind the exact generations that make them current."
  - "Abort-aware retry: one caller listener owns each fetch or backoff wait, is removed in finally/settlement, and the same signal is checked before every recursive request."

requirements-completed: [LOCAL-01, LOCAL-02, LOCAL-04, LOCAL-05, LOCAL-07, TRUTH-01, TRUTH-10]

duration: 29 min
completed: 2026-07-21
---

# Phase 55 Plan 01: Graph Language and Provider Cancellation Summary

**A closed source-scoped graph language now derives every record, relation, evidence, and candidate-overlay identity locally, while the existing provider path honors caller cancellation across fetch and every retry boundary**

## Performance

- **Duration:** 29 min
- **Started:** 2026-07-21T12:54:15Z
- **Completed:** 2026-07-21T13:22:40Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 4

## Accomplishments

- Added `FsbSkopeoGraphSchema` as a frozen IIFE/CommonJS surface with exactly eight record kinds, seven predicates, three cross-document candidate predicates, finite limits, private Draft 2020-12 validation, and descriptor-safe null-prototype copies.
- Derived length-prefixed SHA-256 identities for source fragments, stable and versioned records, stable and local/candidate relation versions, generation-qualified prior handles, and canonical complete candidate overlays. A target-only generation advance changes both the candidate relation version and overlay generation without fusing endpoint identities.
- Enforced the full predicate endpoint matrix, 1–4 issued evidence locators mapped to exact normalized UTF-8 source ranges, response-local ref uniqueness, same-generation advertised prior handles, and zero executable/adjudicative model fields.
- Defined the durable fragment, lexical-shard, adjacency-shard, trusted candidate-intent, and endpoint-bound candidate-relation parsers that Plans 02–05 consume without redefining identity.
- Extended `UniversalProvider.sendRequest(requestBody, options)` and `fetchWithTimeout(...)` with one exact caller signal, pre-fetch abort, composed internal timeout control, abort-aware 429/503 waits, 400 retry suppression, recursive signal forwarding, late-result rejection, and listener/timer cleanup.
- Kept provider/model selection, adaptive timeout, rate-limit caps, request formatting, LM Studio behavior, package manifests, and dependency locks unchanged. Graphify remains conceptual only at pinned commit `abff1b1ca4052fcf9d955c5f6a034088723f4536`; no upstream runtime or copied code was introduced.

## Task Commits

Each TDD task was committed RED then GREEN:

1. **Task 1 RED: Specify the closed graph schema and identity contract** - `1a32e8c8` (test)
2. **Task 1 GREEN: Implement the graph schema and deterministic identities** - `9d03ae96` (feat)
3. **Task 2 RED: Specify provider cancellation and retry suppression** - `b2e6d0d6` (test)
4. **Task 2 GREEN: Compose caller cancellation through provider work** - `9289ea2f` (feat)

## Files Created/Modified

- `extension/utils/skopeo-graph-schema.js` - Closed vocabularies, evidence/extraction/durable parsers, stable/versioned identity derivation, prior handles, and candidate overlay generations.
- `tests/skopeo-graph-schema.test.js` - 572 assertions spanning the exact API, all 448 predicate endpoint combinations, namespace changes, UTF-8 evidence, hostile descriptors, caps, prior batches, durable shards, and target-only candidate advances.
- `extension/ai/universal-provider.js` - Caller-signal validation, fixed abort errors, timeout/caller cause separation, composed fetch abort, abort-aware waits, recursive propagation, and late-result suppression.
- `tests/universal-provider-cancellation.test.js` - 68 assertions for abort-before-work, fetch cancellation, ignored late fetches, 429/503 backoff, 400 parameter retry, exact recursive signal identity, timeout parity, and cleanup.

## Test Evidence

- Controlled Task 1 RED exited nonzero only because `extension/utils/skopeo-graph-schema.js` was absent.
- Controlled Task 2 RED exited nonzero at the intended already-aborted request contract before provider edits.
- The complete focused battery passed twice: `node --check` for both production modules, graph schema 572/0, provider cancellation 68/0, and LM Studio 13/0.
- `node tests/provider-parity.test.js` passed 34/0 across all seven provider configurations.
- Package and lock files were byte-unchanged from the pre-plan commit; `git diff --check` passed.
- Static scans found no dynamic evaluator, Graphify/runtime import, Chrome/storage/query dependency, executable candidate field, new endpoint, or provider-selection branch in the graph schema.

## Decisions Made

- Kept model output intentionally smaller than durable graph state. The model supplies only bare candidates, labels, typed predicates, and issued locators; source ownership, stable IDs, versions, handles, and durable relations are derived locally.
- Treated the first admitted evidence locator as the stable primary source range while canonicalizing the complete proposing-source evidence set for cross-document relation versions.
- Allowed the same raw candidate ref in a later batch only when it names a new response-local candidate; cross-batch references require a previously advertised `@fsb:` handle whose full generation tuple recomputes exactly.
- Preserved local provider behavior by composing cancellation around the existing fetch/retry machinery rather than adding a provider, fallback route, endpoint, or request format.
- Used a private WeakSet to distinguish internally created timeout errors inside recursive catch handling without exposing a new timeout payload or confusing a later caller abort with the timeout that fired first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test oracle correctness] Ensured backoff cancellation tests reached the wait rather than racing the fetch listener**
- **Found during:** Task 2 GREEN verification
- **Issue:** The first 429/503 cancellation fixture could abort while the resolved fetch promise still owned the caller listener, so its name overstated backoff coverage.
- **Fix:** Added an explicit rate-limit-handler barrier and required the abort-aware wait listener to be live before aborting for both statuses. Also retained the separate in-fetch cancellation case.
- **Files modified:** `tests/universal-provider-cancellation.test.js`
- **Verification:** Both 429 and 503 cases prove one active backoff listener, one fetch only, fixed abort output, and zero residual listeners; the full 68-assertion test passes.
- **Committed in:** `9289ea2f`

---

**Total deviations:** 1 auto-fixed (test oracle correctness)
**Impact on plan:** The fix strengthened the planned cancellation proof without changing product scope, dependencies, provider behavior, or package files.

## Issues Encountered

None beyond the self-corrected backoff test race above.

## User Setup Required

None - no external service configuration or package installation is required.

## Next Phase Readiness

- Plan 02 can consume the frozen fragment/shard/candidate contracts and deterministic IDs for immutable source generations, pointer-last publication, and source-owned overlays.
- Plan 03 can pass each fresh Phase 54 operation signal directly to `sendRequest(..., { signal })` and rely on fixed abort semantics with zero accepted late batch or retry.
- Plans 04–05 inherit stable/versioned identity separation and endpoint-bound candidate overlay derivation. No blocker or dependency change remains.

## Self-Check: PASSED

---
*Phase: 55-chrome-local-graph-incremental-truth-foundation*
*Completed: 2026-07-21*
