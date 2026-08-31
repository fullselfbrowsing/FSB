---
phase: 54-permission-scoped-drive-corpus-boundary
plan: "01"
subsystem: permission-scoped-corpus-schema
tags: [chrome-extension, drive-corpus, closed-schema, partition-authority, lifecycle-evidence, fingerprints]

requires:
  - phase: 53.1-generalize-skopeo-adaptive-huds-across-the-capability-catalo
    provides: Installed action authority, bounded projections, and deterministic canonical SHA-256 patterns
provides:
  - Versioned collision-safe account/root partition keys and account/root/source record keys
  - Closed manifest, partition, visibility, source-state, and evidence-transition contracts
  - Independent metadata, physical-membership, and exact-content fingerprint schemas
  - Fail-closed parsing for hostile, oversized, cyclic, prototype-bearing, and raw-content-bearing inputs
affects: [54-03-corpus-store, 54-06-drive-reconciler, phase-55-local-graph]

tech-stack:
  added: []
  patterns: [classic frozen global, length-prefixed tuple encoding, null-prototype records, evidence-gated state transitions, web-crypto-only sha256]

key-files:
  created:
    - extension/utils/skopeo-corpus-schema.js
    - tests/skopeo-corpus-schema.test.js
  modified: []

key-decisions:
  - "Partition and source identities use strict versioned length-prefixed tuples, so account, corpus-root, and source authority cannot collide or fall back to global identity."
  - "Opaque not-found evidence remains inaccessible; only a complete authoritative inventory reconciliation may transition a source to missing."
  - "Metadata, physical membership, and content stay in separate parsed domains; callers compare their canonical forms independently so rename or move evidence cannot impersonate byte/revision change without expanding the exact closed API."
  - "SHA-256 is explicitly asynchronous and returns null when Web Crypto is unavailable; no weak or Node-only fallback enters extension code."

patterns-established:
  - "Closed corpus boundary: validate own enumerable data properties before reading, accept only ordinary/null prototypes, then clone into deeply frozen null-prototype records."
  - "Visibility before derivation: non-ready records structurally reject source-derived names, fingerprints, snippets, counts, citations, relationships, and raw error material."

requirements-completed: [CORPUS-02, CORPUS-03, CORPUS-06]

duration: 16 min
completed: 2026-07-20
---

# Phase 54 Plan 01: Permission-Scoped Corpus Schema Summary

**A frozen closed-world schema now makes account/root/source authority, honest six-state readiness, and independent change identities structural before storage or Drive transport exists**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-20T12:39:12Z
- **Completed:** 2026-07-20T12:55:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added exact `scpk1:` partition and `scsk1:` source encodings with bounded authority IDs, strict tuple membership, collision-safe round trips, frozen parse results, and rejection of extra, missing, legacy, ambiguous, or cross-partition forms.
- Closed the durable lifecycle vocabulary across manifest, partition, source visibility, the exact six operational source states, and evidence tags. Ready requires complete proof, opaque not-found cannot become missing, and withheld states cannot retain stale presentation or derived fields.
- Separated normalized metadata, physical parent/root/vendor membership, and revision/checksum/export-byte content identity. Rename-only and move-only cases leave content identity unchanged.
- Added bounded canonicalization and browser-safe SHA-256, with rejection of accessors without execution, custom prototypes, symbols, functions, sparse arrays, cycles, excessive depth/count/size, raw bodies, secrets, and unknown fields.
- Established a 602-line contract oracle that loads both the classic global and CommonJS export, locks the exact public surface, and exercises every High-threat negative from the plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Specify the closed corpus tuple, state, and fingerprint contract in RED** - `d6e66c34` (test)
2. **Task 2: Implement the frozen corpus schema and make the focused oracle GREEN** - `d374b549` (feat)

## Verification

- Controlled RED passed only because `extension/utils/skopeo-corpus-schema.js` was absent; the harness itself syntax-checked and the failure named the missing schema module.
- `node tests/skopeo-corpus-schema.test.js` - passed twice with deterministic `skopeo corpus schema contract: PASS` output.
- `node --check extension/utils/skopeo-corpus-schema.js` and `node --check tests/skopeo-corpus-schema.test.js` - passed.
- Export/state/evidence/fingerprint seam checks found the exact required implementation; the inverse persisted-field check found none of `fullText`, `rawError`, `innerHTML`, `oauth`, or `shortcutTarget` in production source.
- `git diff --check` - passed; the new utility has no storage, Drive, network, UI, graph, extraction, or Node-only dependency.
- Stub and trust-boundary scans found only intentional hostile-field fixtures and the test's final PASS logger; no production stub, dynamic execution, credential storage, or I/O seam was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced a nonexistent read-first test path with the repository's actual authority oracle**
- **Found during:** Task 1 preparation
- **Issue:** `tests/skopeo-action-authority.test.js` is named in the plan but does not exist and has no git history.
- **Fix:** Read `extension/utils/skopeo-action-authority.js` in full and used the existing authority coverage embedded in `tests/skopeo-session-lifecycle.test.js`, alongside every other required read-first source.
- **Files modified:** None
- **Verification:** The new schema follows the established canonical JSON, frozen-global/CommonJS, and browser Web Crypto conventions; focused tests pass twice.
- **Committed in:** N/A (read-path correction only)

---

**Total deviations:** 1 auto-fixed (1 blocking read-path correction)
**Impact on plan:** No scope change and no production behavior was inferred from a missing test. The exact closed public interface remained authoritative.

## Issues Encountered

- The prose asks for a comparison helper while the same plan declares an exact closed public interface without one. The implementation preserves that exact API and distinguishes changes by canonical equality inside each of the three separately parsed fingerprint domains.
- No implementation blockers or remaining automated failures were encountered.

## User Setup Required

None.

## Next Phase Readiness

- Plan 03 can consume exact partition/source keys and validated records without defining a permissive storage identity.
- Plan 06 can reconcile metadata, physical membership, and exact content independently while preserving authoritative missing semantics.
- Phase 55 can build source-owned local intelligence only after a source reaches the closed ready contract.

## Self-Check: PASSED

- Both planned files exist and syntax-check.
- Task commits `d6e66c34` and `d374b549` are present.
- The focused schema oracle passed twice with identical output.
- Only the expected phase-start tracking change remains outside the two atomic task commits.

---
*Phase: 54-permission-scoped-drive-corpus-boundary*
*Completed: 2026-07-20*
