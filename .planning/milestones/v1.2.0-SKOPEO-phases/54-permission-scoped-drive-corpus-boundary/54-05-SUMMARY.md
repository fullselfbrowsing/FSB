---
phase: 54-permission-scoped-drive-corpus-boundary
plan: "05"
subsystem: fresh-drive-corpus-authority
tags: [chrome-extension, drive-authority, physical-ancestry, ephemeral-certificates, fail-quiet, display-currentness]

requires:
  - phase: 54-permission-scoped-drive-corpus-boundary
    plan: "01"
    provides: Closed account/root/source schema, source states, and collision-safe tuples
  - phase: 54-permission-scoped-drive-corpus-boundary
    plan: "03"
    provides: One-visible-corpus store, authority epochs, withdrawal, and tombstone-first purge
  - phase: 54-permission-scoped-drive-corpus-boundary
    plan: "04"
    provides: Private typed Drive transport with exact account, file, parent, and shared-drive evidence
provides:
  - Five-kind operation authority with fresh account, root, source, and physical ancestry proof
  - Nonserializable WeakMap/WeakSet certificates scoped to one bounded operation and exact source or source set
  - Final-currentness admission for single callbacks and source-owned display rows/complete aggregates
  - Explicit one-corpus enrollment, replacement, account-switch, recovery, and fail-quiet controller closure
affects: [54-06-drive-reconciler, 54-07-corpus-ui, 54-08-runtime-integration, phase-55-local-graph]

tech-stack:
  added: []
  patterns: [operation-local-capability, physical-edge-reproof, exact-source-set, final-currentness, withdraw-before-replace]

key-files:
  created:
    - extension/utils/skopeo-drive-authority.js
    - extension/utils/skopeo-corpus-controller.js
    - tests/skopeo-drive-authority.test.js
  modified: []

key-decisions:
  - "An operation is bound to one exact trusted tab/origin/generation/profile/context/entity snapshot plus the active account/root tuple; page email, authuser, names, and alternate roots make zero Drive calls."
  - "Physical membership verifies both files.get parent evidence and the corresponding bounded parent list edge. Multiple paths are admitted only when every proven path resolves to the same nearest direct-child vendor scope."
  - "Certificates are frozen Proxy capabilities registered only in WeakMap/WeakSet state, deliberately fail JSON and structured cloning, and are destroyed with their one operation."
  - "Transient source proof publishes a metadata-free pending record before returning; confirmed inaccessible proof publishes a withheld record before attempting source-owned purge."
  - "Display callbacks receive only exact certified sources; final reproof removes any changed source row and suppresses the aggregate unless the complete requested set remains current."

patterns-established:
  - "Proof-use-proof: certify from fresh account/root/source/ancestry evidence, repeat full proof before callback admission, and repeat it after every awaited consumer callback before output."
  - "Per-source fail-quiet projection: a failed source contributes no identifier, row, label, count, state payload, or callback value even when other exact sources remain admissible."
  - "Stable-root enrollment: rename and parent movement do not change the enrolled root ID, while trash, non-folder/shortcut shape, lost listing access, account drift, and identity uncertainty close authority."

requirements-completed: [CORPUS-01, CORPUS-02, CORPUS-03, CORPUS-04, CORPUS-05]

duration: 12 min
completed: 2026-07-20
---

# Phase 54 Plan 05: Fresh Drive Corpus Authority Summary

**Every ingestion, query, display, citation-open, and alert-delivery operation now crosses a fresh exact account/root/source proof whose nonreplayable certificates lose authority before stale callback output can escape**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-20T15:14:37Z
- **Completed:** 2026-07-20T15:26:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a frozen classic-global/CommonJS Drive authority with exact trusted-context validation, bounded deadlines/abort handling, fresh `about.user.permissionId`, exact root-folder proof, and active store epoch comparison for all five closed operation kinds.
- Implemented bounded physical ancestry over exact file IDs. Every edge is confirmed through current parent metadata plus a complete parent-child listing; root files are corpus-wide, nested sources inherit the nearest direct-child vendor, same-vendor multiple paths resolve deterministically, ambiguous vendors/cycles/depth/missing parents stay pending, and shortcut targets are never read.
- Added single-source and nonempty deduplicated bounded-set APIs with no implicit current/all/partition scan. Identical proof coalesces only inside one operation, while later operations perform fresh Drive reads.
- Minted frozen, identity-bearing operation and certificate Proxies backed by private WeakMap/WeakSet registries. They cannot be JSON-serialized, structured-cloned, forged, cloned, substituted across operation/kind/context/source, or reused after explicit/automatic finish.
- Wrapped single and set callbacks in proof-use-proof admission. Account/root/source ancestry, trusted context, active authority epoch, and exact source record canonical state are repeated before and after every awaited callback.
- Made production `display` assembly source-owned: only rows naming exact certified sources are accepted, a moved/revoked/epoch-changed source is removed after assembly, and an aggregate survives only when the entire originally requested set still certifies.
- Withheld a failed source before returning its minimized decision. Transient proof transitions to metadata-free pending; denial, opaque 404, trash, or physical removal transitions to inaccessible before a tombstone-first purge attempt.
- Added a one-corpus controller that accepts only the exact current Drive-folder entity, re-fetches identity/root authority, keeps same-root enrollment idempotent, withdraws and purges before replacement/account switch, preserves root identity through rename/move, and projects only `unconfigured`, `validating`, `active`, or `fail-quiet` status.
- Added an 886-line adversarial oracle covering spoofed identity/context fields, all five operation kinds, root/direct/nested/multiparent/ambiguous/outside/cycle/missing-parent/shortcut ancestry, set bounds, certificate replay, never-resolving work, abort, callback-await races, source/partition/authority/context epochs, partial display, enrollment ordering, and account/root loss.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write RED authority, ancestry, enrollment, and certificate-replay contracts** - `8cf1e6c0` (test)
2. **Task 2: Implement fresh authority certificates and one-corpus controller closure** - `f0f708b9` (feat)
3. **Task 2 verification hardening: Cover cross-root, source-epoch, and during-callback account races** - `47ae9996` (test)

## Files Created/Modified

- `extension/utils/skopeo-drive-authority.js` - Exact operation contexts, bounded physical proof, private capability registries, source closure, single/set callback admission, display filtering, and final currentness.
- `extension/utils/skopeo-corpus-controller.js` - Exact folder enrollment, activation, revalidation, recovery, withdrawal, replacement, account switching, and minimized status.
- `tests/skopeo-drive-authority.test.js` - Deterministic transport/store/controller fakes plus spoofing, ancestry, coalescing, replay, revocation, epoch, timeout, display, and lifecycle oracles.

## Verification

- Controlled Task 1 RED syntax-checked and exited nonzero only because `FsbSkopeoDriveAuthority` and `FsbSkopeoCorpusController` were absent.
- `node --check extension/utils/skopeo-drive-authority.js` - passed.
- `node --check extension/utils/skopeo-corpus-controller.js` - passed.
- `node tests/skopeo-drive-authority.test.js` - passed three times, including two consecutive final runs.
- `node tests/skopeo-corpus-schema.test.js` - passed.
- `node tests/skopeo-corpus-store.test.js` - passed 64 assertions plus all replacement/purge await-boundary recovery cases.
- `node tests/skopeo-drive-corpus-transport.test.js` - passed.
- `node tests/skopeo-session-lifecycle.test.js` - passed the production runtime integration and lifecycle contracts used in place of the stale planned authority-test path.
- Required authority/controller seam scans and the full Task 1 matrix scan passed.
- `git diff --check` - passed before every commit and after final verification.
- Production-source inspection found no Chrome storage, content messaging, email/authuser authority, certificate persistence, resource-key projection, logging, raw errors, or source body retention.

## Decisions Made

- Bound operations to the existing Skopeo profile/version and semantic entity in addition to the required tab/origin/generation/context epoch, so a same-tab route/profile transition cannot inherit corpus authority.
- Verified each physical parent edge with `listChildren` as well as the child's `parents` field. This spends a bounded request budget to avoid treating a lone stale/substituted parent claim as membership.
- Allowed multiple physical paths only when all completed paths agree on one vendor scope, then selected the shortest lexicographically stable path. Cross-vendor ambiguity remains pending.
- Kept certificate proof details in trusted memory and made the public capability intentionally uncloneable; future consumers receive no caller-constructible certificate input.
- Applied source closure before purge so unavailable future purge participants cannot leave the old source visible while cleanup waits for registration/recovery.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking path correction] Used the repository's actual action-authority oracle**
- **Found during:** Task 1 read-first gate
- **Issue:** The plan names `tests/skopeo-action-authority.test.js`, but that file does not exist in this checkout or repository history.
- **Fix:** Read the production authority and used its existing coverage in `tests/skopeo-session-lifecycle.test.js`, matching the same correction already documented by Plan 54-01.
- **Files modified:** None for this correction.
- **Verification:** The corrected session-lifecycle oracle passed after the new authority/controller implementation.
- **Committed in:** No code change required; documented here.

---

**Total deviations:** 1 auto-fixed (1 blocking read-path correction)
**Impact on plan:** No product scope or authority behavior changed; the correction selected the repository's real production oracle.

## Issues Encountered

- The store intentionally exposes only active source records through its visible manifest. Pending/inaccessible current-page copy therefore remains a later minimized controller/UI projection concern; this authority safely returns only closed decisions and never infers a source from absent active state.
- No implementation or verification blocker remains.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06 can use `beginOperation('ingestion', exactContext)` plus exact `certifySource` calls for initial inventory and change-hint reproof without defining another ancestry policy.
- Plan 08 can wrap future query/display/citation/alert callbacks with the same single/set authority and use the source-owned display result directly for final background projection.
- The controller supplies explicit staging/activation seams and minimized status, while reconciliation and content runtime/UI integration remain correctly deferred to Plans 06-08.

## Self-Check: PASSED

- All three planned files exist and syntax-check.
- Commits `8cf1e6c0`, `f0f708b9`, and `47ae9996` are present.
- The exact schema/store/transport/authority dependency chain, repeated focused oracle, and corrected session-lifecycle regression are green.
- Every High threat has a zero-callback or zero-output negative, and failed source proof closes the source record before the minimized decision returns.
- The working tree was clean before summary/tracking creation.

---
*Phase: 54-permission-scoped-drive-corpus-boundary*
*Completed: 2026-07-20*
