---
phase: 62-ci-drift-smoke-gate-doctor-extensions
plan: "02"
subsystem: mcp-doctor-diagnostics
tags: [doctor, compatibility, adapter-detection, bridge-auth, offline-diagnostics]

requires:
  - phase: 62-ci-drift-smoke-gate-doctor-extensions
    provides: Canonical adapter compatibility matrix, closed classifier, and matrix-backed production detection from Plan 01
provides:
  - Offline-capable local doctor rows collected through the production adapter registry and canonical classifier
  - Exact three-field bridge-auth metadata projection with no secret or session disclosure
  - Human and JSON doctor views backed by one compatibility snapshot with unchanged layer and exit semantics
affects: [62-03, 62-04, 62-05, 62-06]

tech-stack:
  added: []
  patterns:
    - Inject local registry, auth reader, bridge factory, and clock while production defaults remain authoritative
    - Project hostile local inputs into closed bounded rows before serialization or formatting
    - Render operator labels from the collected snapshot without reclassification or copied version policy

key-files:
  created: []
  modified:
    - mcp/src/diagnostics.ts
    - mcp/src/index.ts
    - tests/mcp-diagnostics-status.test.js
    - tests/mcp-version-parity.test.js

key-decisions:
  - "Enumerate only ids present in both the production registry and canonical matrix; detector failure becomes canonical binary_not_found/unsupported evidence without suppressing offline diagnostics."
  - "Keep Claude authentication exactly unknown in JSON and Not reported in text regardless of environment or detector-looking auth values."
  - "Expose bridge auth only as secret presence, validated rotation timestamp, and non-negative age; private state is projected immediately without spreading."
  - "Keep runDoctor on one collection call and preserve its historical diagnostic-layer precedence and healthy/unhealthy exit mapping."

patterns-established:
  - "Offline doctor seam: local adapter and auth facts are collected before bridge attachment and survive bridge/extension failure."
  - "Safe authority projection: plain own data, closed keys, bounded strings/paths/rows, and deterministic failure facts cross the doctor boundary."
  - "Text/JSON parity: the human formatter reads matrix, adapter, and auth facts from the same snapshot serialized by --json."

requirements-completed: [DRIFT-02, DRIFT-04]

duration: 14 min
completed: 2026-07-16
---

# Phase 62 Plan 02: Offline Doctor Compatibility Diagnostics Summary

**The existing doctor now reports canonical adapter compatibility, detector-approved local evidence, deliberately unreported Claude auth, and secret-safe bridge rotation metadata from one offline-capable snapshot in both human and JSON modes.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-16T17:37:17Z
- **Completed:** 2026-07-16T17:51:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended the doctor snapshot with the canonical compatibility matrix, one bounded production-registry adapter row per shipped/matrix intersection, and exactly three safe bridge-auth metadata fields.
- Added injected bridge, registry, auth-reader, and clock seams so offline, exception, malformed, accessor-bearing, prototype-bearing, overlong-path, and invalid-timestamp behavior is deterministic and fail-closed.
- Kept Claude auth exactly `unknown` in JSON and `Not reported` in text without inspecting environment, provider config, account state, or any private auth field beyond the immediate approved projection.
- Added human output for adapter id/label, binary/version fallbacks, exact compatibility label/reason, matrix profile/range, and bridge secret presence/rotation facts while retaining all established diagnostic lines.
- Proved `runDoctor` collects once, feeds that snapshot to either text or JSON, imports canonical policy only in collection, and retains the existing layer/exit mapping.

## Task Commits

Each task was committed atomically:

1. **Task 62-02-01: Collect daemon compatibility, detection, and auth metadata offline** — `c1f4aa81` (feat)
2. **Task 62-02-02: Render text and --json from the same doctor snapshot** — `52390992` (feat)

## Files Created/Modified

- `mcp/src/diagnostics.ts` — Closed adapter/auth doctor types, injected local collectors, canonical classification, and safe failure projection.
- `mcp/src/index.ts` — Human compatibility and bridge-auth sections sourced only from the collected snapshot.
- `tests/mcp-diagnostics-status.test.js` — Offline, hostile-input, secret non-leakage, fallback-label, and text/JSON fact-parity coverage.
- `tests/mcp-version-parity.test.js` — Single-collection, canonical-authority, unchanged-exit, and forbidden-authority source contracts.

## Decisions Made

- Used the registry/matrix intersection as the doctor roster so an unshipped injected id cannot manufacture a compatibility row.
- Preserved a detector-approved absolute real path and bounded version where safe, but forced malformed/missing evidence through the canonical unsupported reason vocabulary.
- Computed rotation age once from the injected snapshot clock and rendered invalid or unavailable timestamp facts as `Not reported` rather than throwing or guessing.
- Kept compatibility status capitalization in the formatter as presentation only; all classification reasons and version/profile policy continue to come from the canonical module.

## TDD Evidence

- **Task 1 RED:** new offline adapter/auth assertions failed because the snapshot had no compatibility matrix, adapter rows, or projected auth metadata; **GREEN:** the exact diagnostics + bridge-auth command passed 48 and 50 assertions respectively.
- **Task 2 RED:** 26 formatter/parity assertions failed because human doctor output had no adapter/auth sections; **GREEN:** the exact diagnostics + version-parity command passed 84 and 65 assertions respectively.
- Final combined focused regression passed all 84 diagnostics, 50 bridge-auth, and 65 version-parity assertions after one MCP build.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. Claude authentication is intentionally `unknown` / `Not reported` under the approved non-inference contract, and genuine installed-CLI corroboration remains pending for the milestone-end UAT sweep.

## User Setup Required

None - no installed provider CLI, account, browser, external network, or human UAT was required.

## Verification

- `npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-bridge-auth.test.js` — PASS
- `npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-version-parity.test.js` — PASS
- Combined focused regression (`build`, diagnostics, bridge-auth, version parity) — PASS, 199 assertions total in under four seconds.
- Stub/leak/source-authority scans — PASS; no private formatter field, auth inference, provider start, browser authority, or copied compatibility policy found.
- Protected `mcp/build/index.js` and the three pre-existing generated showcase files retain their exact pre-plan SHA-256 hashes.
- No live provider CLI, external network, browser, or human UAT was invoked.

## Next Phase Readiness

- Plan 62-03 can consume the established canonical safe compatibility projection without reusing local binary paths or bridge-auth metadata.
- Plan 62-04 can add bounded drift reporting independently of doctor collection and formatting.
- No blocker remains; genuine installed-version doctor corroboration stays pending for the single milestone-end UAT sweep.

## Self-Check: PASSED

- All four declared implementation/test artifacts and this summary exist.
- Task commits `c1f4aa81` and `52390992` are present.
- Both task-level exact commands, the combined focused regression, source scans, diff checks, and protected-hash checks pass.

---
*Phase: 62-ci-drift-smoke-gate-doctor-extensions*
*Completed: 2026-07-16*
