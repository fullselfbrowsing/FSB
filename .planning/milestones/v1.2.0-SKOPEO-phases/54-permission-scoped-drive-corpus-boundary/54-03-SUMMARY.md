---
phase: 54-permission-scoped-drive-corpus-boundary
plan: "03"
subsystem: crash-safe-corpus-persistence
tags: [chrome-extension, mv3, trusted-local-storage, exact-tuples, tombstone-first-purge, restart-recovery]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    plan: "01"
    provides: Closed corpus schema, length-prefixed partition/source keys, and exact state/fingerprint parsers
  - phase: 54-permission-scoped-drive-corpus-boundary
    plan: "02"
    provides: Awaited TRUSTED_CONTEXTS boot wall and background-only trusted persistence ownership
provides:
  - Single-visible-manifest corpus store partitioned by exact account permission ID and corpus root ID
  - Opaque epoch-bound replacement handles with durable staging, complete checkpoints, and pointer-last publication
  - Seven-category tombstone-first source and partition purge with strict result verification and bounded journals
  - MV3 restart recovery for unavailable identity, account mismatch, incomplete purge, orphan staging, corrupt records, and stale checkpoints
affects: [54-05-drive-authority, 54-06-drive-reconciler, 54-08-runtime-integration, phase-55-local-graph]

tech-stack:
  added: []
  patterns: [global-manifest-lane, exact-partition-lanes, pointer-last-publication, tombstone-first-purge, durable-resume-cursors]

key-files:
  created:
    - extension/utils/skopeo-corpus-store.js
  modified:
    - tests/skopeo-corpus-store.test.js

key-decisions:
  - "Visibility is controlled by one schema-parsed manifest pointer; staged partitions and withheld/purging sources are never inferred through a current-user, last-corpus, or storage-scan fallback."
  - "Replacement closes the old manifest first and publishes the candidate pointer only after exact source records, inventory checkpoint, active partition record, and committed operation state are durable."
  - "Purge adapters are seven unique exact in-memory method records; source tombstones precede adapter calls, every adapter must prove absence, and terminal metadata is written only after source removal."
  - "Recovery trusts only reparsed durable state and fresh optional account permission identity; unavailable identity is unproven, mismatch withdraws before purge, and stale checkpoints close rather than restore visibility."

patterns-established:
  - "Closed multi-key transaction: every intermediate durable state is invisible or purging, and only the final controlling manifest write can open visibility."
  - "Idempotent participant journal: persist a bounded cursor after each exact purge/absence step so duplicate calls and worker restarts safely resume."
  - "Fresh-wake validation: reparse the manifest, active partition, checkpoint, operation, source keys/bodies, and journals before returning active or advancing recovery."

requirements-completed: [CORPUS-02, CORPUS-05]

duration: 36 min
completed: 2026-07-20
---

# Phase 54 Plan 03: Crash-Safe Corpus Store Summary

**Exact account/root corpus persistence now stays single-visible through replacement, tombstones all source-owned influence before removal, and converges after every injected MV3 storage or participant failure**

## Performance

- **Duration:** 36 min
- **Started:** 2026-07-20T13:43:32Z
- **Completed:** 2026-07-20T14:19:55Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added a frozen classic-global/CommonJS corpus store whose only visibility path is an exact Plan 01 account/root partition pointer backed by a complete inventory checkpoint.
- Added global replacement serialization and per-partition mutation lanes. Replacement closes and withdraws the old pointer before candidate staging, rechecks an opaque operation epoch on every later call, and writes the new pointer last.
- Added strict source/partition persistence that reparses every schema record and cross-checks encoded keys against record bodies; corrupt manifests, source substitutions, stale handles, stale checkpoints, and incomplete inventories fail closed.
- Added an exact seven-name participant registry for fragments, indexes, citations, counts, relationships, result cache, and alerts. Purge writes a durable source or partition tombstone first, advances a bounded cursor through every purge and absence proof, removes source metadata, and publishes terminal completion last.
- Added deterministic wake recovery for unavailable identity, changed account permission ID, pending journals, orphan staging, duplicate operations, corrupt durable state, and pointer/checkpoint failures without persisting identity proofs, operation certificates, raw errors, source bodies, or participant payloads.
- Exercised failure before and after all 34 source-purge awaits and all 125 replacement awaits with alternating quota rejection and worker loss; every seeded case converges without cross-source, cross-root, or cross-account deletion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the store oracle with exact-partition, tombstone-first, and failure-injection RED cases** - `2dec79bd` (test)
2. **Task 2: Implement closed manifest, staging, and exact tuple/source persistence** - `21bb79f4` (feat)
3. **Task 3: Complete source-owned purge, terminal verification, and MV3 restart recovery** - `e69bedb5` (feat)

## Files Created/Modified

- `extension/utils/skopeo-corpus-store.js` - Injected trusted-local manifest, partition, source, checkpoint, operation, purge-journal, participant, and recovery protocol.
- `tests/skopeo-corpus-store.test.js` - Trusted boot regression plus tuple isolation, visibility ordering, tombstone/participant ordering, corruption/concurrency, strict-result, and exhaustive failure/restart oracles.

## Verification

- Controlled Task 1 RED exited nonzero only because `extension/utils/skopeo-corpus-store.js` was absent.
- `node --check extension/utils/skopeo-corpus-store.js` - passed.
- `node tests/skopeo-corpus-schema.test.js` - passed.
- `node tests/skopeo-corpus-store.test.js` - passed 64 reported assertions plus the deterministic before/after matrix over 34 purge and 125 replacement awaits.
- The store suite also passed the existing TRUSTED_CONTEXTS boot, fixed trusted-feature bridge, CAPTCHA secret boundary, injected-file storage closure, and 14 static mutation cases.
- `git diff --check` - passed before every task commit and at final verification.

## Decisions Made

- Used one small control manifest rather than discoverable active flags on partition records, so no scan or fallback can make two partitions visible.
- Kept operation authority opaque and epoch-bound; durable operation records contain only bounded tuple/epoch/lifecycle metadata and never a replayable permission certificate.
- Replayed participant work idempotently from durable cursors and required exact `{ ok: true }` / `{ owned: false }` responses. Extra fields or remaining influence leave recovery pending.
- Revalidated the active partition, checkpoint, and committed operation during wake recovery before reporting `active`; stale or corrupt durable control data closes and is purged instead of salvaged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both implementation GREEN passes satisfied the full failure matrix on their first run; Task 3's intended RED identified the loose participant-adapter shape and was resolved by exact data-property normalization.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can implement the private fixed-action Drive transport independently on the Plan 01 schema foundation.
- Plans 05 and 06 can consume the exact store handle, staging, transition, checkpoint, withdrawal, participant, and recovery seams after Plan 04 supplies fresh Drive evidence.
- No Phase 55-59 source-owned consumer was implemented; all seven categories remain in-memory test adapters only.

## Self-Check: PASSED

- All three task commits exist and final schema/store verification is green.
- Durable storage inspection contains no source bytes/full text, credentials, permission certificates, raw errors, or participant payloads.
- The working tree was clean before summary/tracking creation.

---
*Phase: 54-permission-scoped-drive-corpus-boundary*
*Completed: 2026-07-20*
