---
phase: 55-chrome-local-graph-incremental-truth-foundation
plan: "02"
subsystem: trusted-local-graph-persistence
tags: [chrome-extension, storage-local, immutable-pages, pointer-last, recovery, capability-authorization]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    provides: Exact partition/source authority, mutation lanes, tombstone-first purge, and trusted local storage
  - phase: 55-chrome-local-graph-incremental-truth-foundation
    plan: "01"
    provides: Closed graph fragments, shards, evidence, deterministic identities, and candidate-overlay versions
provides:
  - Corpus-owned one-call participant authorization capabilities with exact name, mode, request, signal, and epoch binding
  - Immutable source-owned fragment, lexical, adjacency, result-cache, staging, journal, and candidate-overlay pages
  - Withhold-and-purge replacement followed by provider-bound invisible staging and pointer-last publication
  - Proposer-owned endpoint-current candidate overlays plus existence-independent proposer-only empty replacement
  - Bounded fresh-worker recovery, disposable-cache ownership, and metadata-only partition diagnostics
affects: [55-03-graph-extractor, 55-04-graph-query, 55-05-graph-runtime]

tech-stack:
  added: []
  patterns: [corpus-owned-one-call-capability, source-owned-immutable-pages, pointer-last-publication, bounded-local-recovery]

key-files:
  created:
    - extension/utils/skopeo-graph-store.js
    - tests/skopeo-graph-store.test.js
  modified:
    - extension/utils/skopeo-corpus-store.js
    - tests/skopeo-corpus-store.test.js

key-decisions:
  - "The corpus store alone mints participant capabilities; graph binders receive only a registration-private verifier and never receive or authenticate the corpus mutation guard."
  - "Staged batches persist only provider-bound hashes and locally derived record/relation version IDs; name-bearing labels become durable only in authoritative fragment pages and matching source-owned lexical shards."
  - "Source replacement closes visibility and proves durable/cache absence before staging, while the published source control is the final visibility write."
  - "Candidate overlays are owned by the proposing source, bind every current endpoint generation, and clear by removing only proposer-known keys without reading a former target."
  - "Wake recovery is sorted and capped at 128 work items, rebuilds only derivable shards from a valid fragment, never hydrates query caches, and leaves corrupt authority withheld or repairing."

patterns-established:
  - "One-call participant seam: exact request identity plus participant/mode/signal/epoch must verify before and after every participant storage or cache await, then the capability is revoked in finally."
  - "Invisible generation assembly: batch metadata, fragment pages, shards, and hashes remain unreadable until one validated source control pointer is written last."
  - "Location-aware privacy: source IDs/fingerprints live only in authoritative ownership keys/fields; derived labels live only in authoritative records and matching lexical shards; diagnostics contain fixed metadata only."

requirements-completed: [LOCAL-02, LOCAL-03, TRUTH-01, TRUTH-05, TRUTH-10]

duration: 38 min
completed: 2026-07-21
---

# Phase 55 Plan 02: Trusted Local Graph Store Summary

**A source-owned immutable graph store now withdraws stale truth before work, stages provider-bound generations invisibly, publishes one validated pointer last, and recovers or purges every durable and disposable influence under exact one-call authority**

## Performance

- **Duration:** 38 min
- **Started:** 2026-07-21T13:36:56Z
- **Completed:** 2026-07-21T14:15:18Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 4

## Accomplishments

- Added the corpus-owned authorized participant bridge without changing the legacy registration contract. Every purge and absence callback receives a fresh frozen nonserializable capability bound to its participant, mode, exact request object, live signal, and operation epoch; clones, raw guards, wrong names/modes/requests, aborts, replay, and post-return use fail closed.
- Added `FsbSkopeoGraphStore` with its exact frozen API, graph-owned WeakMap mutation guards, literal `fsbSkopeoGraph:1:` namespace, length-prefixed ownership keys, bounded independently paged values, provider/model-bound staging, complete seal validation, and final active-pointer publication.
- Persisted no name-bearing batch payload during staging: durable staged batches retain only immutable binding metadata, version IDs, and a hash. Validated labels remain only in authoritative fragment records and matching lexical shards.
- Added proposer-owned `cross-document-candidate` overlays whose relation and overlay identities are recomputed against exact current proposer/target records and generations. Target advance makes prior overlays unreadable; exact empty replacement clears without target lookup or existence-dependent output.
- Implemented four real graph purge binders, one exact disposable-cache owner, source/partition absence proofs, idempotent cleanup, sorted 128-step recovery, orphan removal, derivable lexical/adjacency repair, corrupt-pointer closure, and bounded privacy-safe diagnostics.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Specify authorization, durable generations, overlays, failure recovery, and privacy** - `2fac76cb` (test)
2. **Task 2 GREEN: Implement authorized corpus participants and source-owned pointer-last graph persistence** - `3c291714` (feat)
3. **Task 3: Harden recovery, disposable cache absence, diagnostics, and before/after fault matrices** - `5034847f` (test)

## Files Created/Modified

- `extension/utils/skopeo-graph-store.js` - Frozen trusted graph store, immutable source pages, provider-bound staging, overlays, purge binders, cache ownership, recovery, readers, provenance, metadata, and diagnostics.
- `tests/skopeo-graph-store.test.js` - 103 static assertion sites plus repeated before/after failure matrices for source publication and overlay publish/clear, restart convergence, isolation, privacy, recovery bounds, cache refusal, and deterministic recreation.
- `extension/utils/skopeo-corpus-store.js` - Additive authorized participant registration, private verifier closure, fresh one-call capabilities, and revocation in `finally`.
- `tests/skopeo-corpus-store.test.js` - Exact binder invocation, unique-name sharing, minimized authorization, source/partition mode, clone/raw/wrong/replay/accessor rejection, and post-return revocation coverage.

## Test Evidence

- Controlled RED exited nonzero only for the missing `registerAuthorizedPurgeParticipant` surface and missing `FsbSkopeoGraphStore` module.
- Two consecutive focused verification passes completed with corpus-store **71 assertions / 0 failures** and graph-store **PASS / 0 failures**; the graph contract executes repeated before/after storage-failure loops from its 103 static assertion sites.
- `node tests/skopeo-graph-schema.test.js` passed **572 / 0**, proving Plan 01 fragment, lexical, adjacency, and candidate identity compatibility.
- The graph-store contract completed in **0.32 seconds**, below the 30-second requirement, and recreated the store twice against identical durable bytes with byte-identical fragment/shard projections.
- Syntax checks and `git diff --check` passed. Static scans found no Drive, provider, content, UI, remote graph, database, dynamic evaluator, external service, or runtime Graphify dependency.

## Decisions Made

- Used separate graph-owned mutation guards for engine writes and corpus-owned authorization capabilities for purge callbacks. Similar signal-shaped objects never cross-authenticate between the two WeakMap domains.
- Kept staging restart-safe without making candidate data authoritative: each batch write contains only exact ownership/binding metadata, locally derived version IDs, and a deterministic hash; sealing receives and reparses the complete fragment before writing authoritative pages.
- Stored source controls and generation pages independently so a changed source can be fenced before any delete or provider work. Staging keys have no read fallback, and cleanup completes before the final published pointer write.
- Made candidate relation pages immutable but keyed solely under proposer ownership; the overlay pointer carries the complete current endpoint-generation set, so target changes invalidate reads without mutating or conflating either endpoint.
- Chose deterministic local shard regeneration during recovery and discard-only behavior for disposable result caches. Recovery does not request a corpus fingerprint, infer global authority, or hydrate an in-memory query cache.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no package, external service, credential, or manual configuration is required.

## Next Phase Readiness

- Plan 03 can stage only validated provider-bound batches and seal one complete fragment through the new store handle while raw provider output remains outside durable storage.
- Plan 04 can register the single disposable cache owner and read exact-current fragments/shards without treating cache state as authority.
- Plan 05 can register the four graph binders through the corpus-owned authorized participant API, implement whole-source replacement, and use proposer-only empty overlay clearing without target disclosure.
- No blockers remain.

## Self-Check: PASSED

---
*Phase: 55-chrome-local-graph-incremental-truth-foundation*
*Completed: 2026-07-21*
