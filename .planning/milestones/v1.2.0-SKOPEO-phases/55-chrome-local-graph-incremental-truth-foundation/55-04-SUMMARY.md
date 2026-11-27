---
phase: 55-chrome-local-graph-incremental-truth-foundation
plan: "04"
subsystem: trusted-local-graph-query
tags: [chrome-extension, minisearch, weakmap-capability, graph-traversal, provenance]

requires:
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    plan: "01"
    provides: Closed graph schema, source-owned identities, evidence locators, and typed relation predicates
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    plan: "02"
    provides: Current-fragment reads, active source-owned shards, candidate overlays, and purge-owner registration
provides:
  - Opaque exact-partition/exact-source-generation query scopes with explicit lazy hydration
  - Bounded source-attributable MiniSearch and adjacency caches with synchronous purge and four-partition LRU eviction
  - Exact lookup, deterministic lexical search, finite typed neighbor traversal, and minimized provenance inspection
  - Current-generation fencing before and after every query plus endpoint-qualified candidate-only relations
affects: [55-05-graph-runtime, graph-consumers, cited-projections, source-replacement]

tech-stack:
  added: []
  patterns: [weakmap-query-scope, lazy-authorized-cache, defensive-frozen-projection, iterative-bounded-traversal]

key-files:
  created:
    - extension/utils/skopeo-graph-query.js
    - tests/skopeo-graph-query.test.js
  modified: []

key-decisions:
  - "A query scope is a frozen nonserializable Proxy whose partition and sorted exact source-generation set exist only in a WeakMap; minting and cache-owner registration perform no graph reads."
  - "Only ensureScopeCache may hydrate: it reparses source/generation ownership, builds from the exact active fragment/shard set, and rechecks every current generation before admitting the cache."
  - "At most one exact-set cache is live per partition and four partitions are retained by LRU; replacement, eviction, purge, or current-generation drift closes every attached scope and clears all cache collections."
  - "Cross-document candidates remain separate candidate-only edges, require both exact endpoint generations and record versions in scope, and carry only proposing-source evidence."

patterns-established:
  - "Currentness sandwich: every read operation verifies all exact source generations before producing influence and again before returning its newly allocated projection."
  - "Reject-whole bounded traversal: iterative visited node/edge sets enforce depth, node, edge, and byte limits before any partial over-cap result can escape."
  - "Closed cache participation: source and partition purge methods synchronously invalidate scopes, clear index/record/relation/adjacency collections, and report exact absence without rebuilding."

requirements-completed: [LOCAL-01, LOCAL-02, LOCAL-03, LOCAL-06, TRUTH-01]

duration: 24 min
completed: 2026-07-21
---

# Phase 55 Plan 04: Bounded Authorized Graph Query Summary

**Exact current source-generation scopes now lazily reconstruct finite local graph caches and expose only four deterministic, minimized, source-attributable read primitives**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-21T15:02:56Z
- **Completed:** 2026-07-21T15:26:28Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 2

## Accomplishments

- Added `FsbSkopeoGraphQuery` with its exact frozen factory surface, accessor-safe exact input parsing, nonserializable WeakMap scopes, zero-read construction, and explicit one-seam lazy cache hydration.
- Reconstructed source-attributable label and adjacency caches only from current exact fragment/shard reads, with a shared fixed MiniSearch configuration, 4,096-record cap, four-partition LRU, active-generation rechecks, and complete cache disposal.
- Implemented exact record lookup, AND lexical label search with deterministic score/ID order, iterative predicate/direction traversal with cycle suppression, and record/relation provenance capped at four locators.
- Kept cross-document relations candidate-only and admitted them only when proposer and target source generations plus endpoint record versions are all present in the exact scope; only proposing-source evidence is projected.
- Added a production-module oracle covering real schema/store publication, lazy wake reconstruction, all predicates/directions, cycles, deterministic ties, source/partition isolation, target advance/revocation, purge absence, hostile inputs, exact maxima, max-plus-one rejection, result-byte rejection, and closed-surface scans.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Specify exact authorized scopes, cache reconstruction, and four bounded reads** - `ae90e08e` (test)
2. **Task 2 GREEN: Implement source-attributable lexical, traversal, exact, and provenance queries** - `e5b4db91` (feat)
3. **Task 2 hardening: Fix shared index configuration and complete cache disposal** - `08ac745c` (fix)

## Files Created/Modified

- `extension/utils/skopeo-graph-query.js` - Frozen query factory, opaque scopes, lazy current-source cache reconstruction, LRU/purge invalidation, and four bounded defensive read projections.
- `tests/skopeo-graph-query.test.js` - Real graph schema/store and bounded fake-store contract for authorization, isolation, determinism, stale exclusion, caps, and privacy.

## Test Evidence

- Controlled RED exited nonzero only because `extension/utils/skopeo-graph-query.js` and `FsbSkopeoGraphQuery` were absent.
- The final graph query contract passed on repeated runs, including byte-identical fresh-module reconstruction and exact purge/rebuild fixtures; syntax and `git diff --check` passed.
- Graph schema compatibility passed **572 / 0** and the graph store contract passed **PASS / 0 failures**.
- Checked-in MiniSearch compatibility passed **16 / 0** over the 190-fixture capability-search evaluation, with recall@5 **1.000** and wrong-invoke **0.000**.
- The Phase 54 corpus authority/runtime regression passed **PASS / 0 failures**.
- Static scans found no raw storage/shard access, arbitrary graph language, dynamic execution, remote process, extra package, or public-surface expansion.

## Decisions Made

- Used one live exact-set cache per partition so authorizing a different source set automatically closes every capability attached to the prior partition cache rather than risking subset/superset reuse.
- Indexed only records named by validated source-owned lexical postings, while exact lookup and traversal retain separately validated record/version ownership beside every internal entry.
- Sorted source pairs before hydration, index documents before insertion, search hits by score then stable ID, and traversal nodes/edges by stable/version ID so no object, map, shard, or insertion order affects output.
- Treated result size as a terminal admission gate: every projection is recursively frozen first and then rejected whole if its serialized UTF-8 length exceeds 64 KiB.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The final conformance pass found that cache construction used equivalent fresh MiniSearch option objects and invalidation only unlinked cache contents. Before close-out, construction was changed to one fixed shared options object and invalidation was hardened to clear every retained collection and index reference.

## User Setup Required

None - no package, credential, host, external service, or manual configuration was added.

## Next Phase Readiness

- Plan 05 can mint query scopes only after Phase 54 exact-set certification, await `ensureScopeCache`, and expose the four closed query operations through the background-only graph facade.
- The graph store can register `query.cacheOwner` once at boot without hydration; source replacement, revocation, and partition purge receive synchronous cache absence semantics.
- No blocker remains for Phase 55 runtime orchestration.

## Self-Check: PASSED

---
*Phase: 55-chrome-local-graph-incremental-truth-foundation*
*Completed: 2026-07-21*
