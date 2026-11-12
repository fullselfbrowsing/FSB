---
phase: 62-ci-drift-smoke-gate-doctor-extensions
plan: "03"
subsystem: mcp-compatibility-refresh
tags: [compatibility, bridge-auth, storage, freshness, cold-boot]

requires:
  - phase: 62-ci-drift-smoke-gate-doctor-extensions
    provides: Canonical compatibility matrix, closed reason vocabulary, safe projector, and production detectors from Plan 01
provides:
  - Separately authenticated read-only adapter.compatibility reverse-channel request
  - Exact validated and serialized compatibility evidence in the provider envelope
  - Fifteen-minute injected-clock freshness projection with fail-closed stale and unavailable behavior
  - Coalesced five-second paired refresh with durable-write-before-fan-out ordering
affects: [62-04, 62-05, 62-06]

tech-stack:
  added: []
  patterns:
    - Keep compatibility observational and separate from delegation, process, provider, and wake authority
    - Validate the same closed safe snapshot before storage, hydration, freshness projection, and merged-row fan-out
    - Share one in-flight background promise across cold and manual callers, then clear it only after settlement

key-files:
  created: []
  modified:
    - mcp/src/agent-providers/serve-delegation.ts
    - extension/utils/mcp-agent-providers.js
    - extension/ws/mcp-bridge-client.js
    - extension/background.js
    - tests/mcp-reverse-channel-contract.test.js
    - tests/mcp-bridge-topology.test.js
    - tests/mcp-agent-providers-storage.test.js
    - tests/mcp-bridge-client-lifecycle.test.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/mcp-client-merged-view.test.js

key-decisions:
  - "Route compatibility through its own authenticated exact-empty-payload method and leave delegate.status plus the five established transport failures unchanged."
  - "Store only schema version, checked timestamp, and canonical safe rows; reject inherited, accessor, sparse, duplicate, oversized, future-dated, or unknown evidence."
  - "Make the provider helper the single durable mutation/freshness authority and expose compatibility only on agent rows, never API rows or recommendation inputs."
  - "Trigger best-effort refresh only on a genuine paired transition, coalesce concurrent callers, and return cached rows with exactly refreshed, stale, or unavailable."

patterns-established:
  - "Authenticated observational seam: reverse-channel reads can expose bounded daemon facts without inheriting lifecycle or process authority."
  - "Durable-before-visible refresh: exact validation precedes serialized storage replacement, which completes before merged rows are returned."
  - "One-way freshness: supported evidence older than fifteen minutes degrades to evidence_stale while degraded and unsupported facts never become more permissive."

requirements-completed: [DRIFT-04]

duration: 38 min
completed: 2026-07-16
---

# Phase 62 Plan 03: Authenticated Compatibility Refresh Summary

**Daemon-classified adapter compatibility now crosses one authenticated read-only route into an exact-validated, freshness-aware durable provider view, with paired cold refresh and bounded manual fallback that never manufactures support.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-07-16T17:52:00Z
- **Completed:** 2026-07-16T18:30:23Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added adapter.compatibility behind the established extension authentication gate with an exact empty own-object payload, production registry/detector enumeration, injected clock, and canonical browser-safe projection.
- Preserved delegate.status, adapter lifecycle methods, and transport behavior while proving the compatibility route has no spawn, wake, filesystem, session, task, or process authority.
- Extended the versioned provider envelope with exact compatibility replacement on the existing serialized mutation chain while preserving clicked, connected, installed, and unknown sibling data.
- Added canonical reason/status validation and a single injected-clock fifteen-minute freshness boundary: stale support degrades to evidence_stale, while absent, corrupt, future, mismatched, or unshipped evidence stays unsupported.
- Added a five-second bridge wrapper and one background refresh orchestrator that coalesces callers, writes durably before fan-out, refreshes silently only after paired authentication, and returns existing rows with a closed outcome on every failure path.

## Task Commits

Each task was committed atomically:

1. **Task 62-03-01: Add the separate authenticated compatibility request** — 53562b32 (feat)
2. **Task 62-03-02: Persist validated compatibility with background-owned freshness** — 9b794ace (feat)
3. **Task 62-03-03: Orchestrate bounded cold-boot and manual compatibility refresh** — f581ba46 (feat)

## Files Created/Modified

- mcp/src/agent-providers/serve-delegation.ts — Authenticated exact-payload route, production detector execution, safe canonical response, and fail-closed detector handling.
- extension/utils/mcp-agent-providers.js — Exact compatibility validator, serialized replacement, hydration, freshness projection, and agent-row merge.
- extension/ws/mcp-bridge-client.js — Paired-only five-second compatibility wrapper and isolated pairing-transition observers.
- extension/background.js — Sole coalesced refresh owner, cached fallback outcome, durable-write-before-merge ordering, and silent paired hydration.
- tests/mcp-reverse-channel-contract.test.js — Separate route, exact payload, auth, safe-response, forbidden-field, and unchanged-delegation contracts.
- tests/mcp-bridge-topology.test.js — Production registry/detector routing, fail-closed rows, authority isolation, and transport regressions.
- tests/mcp-agent-providers-storage.test.js — Envelope preservation, exact hostile-shape rejection, serialized writes, storage failure, freshness, and projection boundaries.
- tests/mcp-bridge-client-lifecycle.test.js — Pairing timing, exact frame, timeout, pending correlation, response, and observer lifecycle.
- tests/mcp-bridge-background-dispatch.test.js — Coalescing, validation, durable ordering, cached fallback, malformed/write/transport failure, cold boot, and reconnect coverage.
- tests/mcp-client-merged-view.test.js — Compatibility separation, API-row exclusion, and updated runtime result-envelope regression coverage.

## Decisions Made

- Reused the canonical Plan 01 classifier and browser projector on the daemon; neither the bridge nor browser compares versions or inspects binaries.
- Kept validation in the background-owned provider helper so storage hydration and live refresh accept the same exact closed contract.
- Returned durable cached merged rows even when transport, authentication, validation, or replacement fails; only the refresh outcome changes.
- Published pairing transitions only when the status actually changes, isolating observer errors and preventing duplicate paired notifications from replaying a live request.

## TDD Evidence

- **Task 1 RED:** the new contract failed because adapter.compatibility had no separate authenticated route; **GREEN:** MCP build, reverse-channel contract, and bridge topology passed with 278 topology assertions.
- **Task 2 RED:** the storage suite failed because replaceCompatibility did not exist; **GREEN:** provider storage and accumulated background dispatch passed, with the existing merged-view regression also green.
- **Task 3 RED:** lifecycle failed because requestAdapterCompatibility did not exist and background dispatch failed because no compatibility composition was present; **GREEN:** lifecycle passed 226 assertions and background dispatch passed 247 assertions.
- Final accumulated boundary passed MCP build, reverse-channel, topology, lifecycle, background, storage, and merged-view suites.

## Security and Privacy

- The browser response, storage envelope, merged rows, logs, and UI-facing result contain no binary path, detected version, profile, secret, session, task, provider payload, prompt, or environment data.
- The request is authenticated, exact-empty, read-only, and separate from delegate.status; it cannot invoke provider processes, native messaging, doctor, shell, wake, spawn, kill, or filesystem paths.
- Prototype-bearing, inherited, accessor, sparse, duplicate, oversized, unknown-key, invalid-clock, malformed, and partial evidence is rejected before durable storage.
- Storage rejection cannot leak a newer in-memory supported result, and stale or unavailable evidence cannot project fresh support.

## Deviations from Plan

### Necessary regression coverage

- **Found during:** Tasks 62-03-02 and 62-03-03
- **Issue:** Compatibility adds a field to merged agent rows and a refresh outcome to getMcpClients, but the plan's task file lists omitted tests/mcp-client-merged-view.test.js.
- **Resolution:** Extended that existing regression suite to prove compatibility remains absent from API rows and to pin the new exact runtime envelope.
- **Files modified:** tests/mcp-client-merged-view.test.js
- **Verification:** node tests/mcp-client-merged-view.test.js passes.
- **Committed in:** 9b794ace and f581ba46

## Issues Encountered

- Two read-first paths named by the plan do not exist on the target tree or in its history: tests/mcp-provider-canonical-source.test.js and extension/utils/mcp-reverse-contract.js. The authoritative provider-source coverage lives in the storage/merged-view suites, and the reverse contract is inline in the bridge plus tests/mcp-reverse-channel-contract.test.js; those real artifacts were used without creating duplicate modules.

## Known Stubs

None. Installed-provider and browser-visible corroboration remains intentionally pending for the single milestone-end UAT sweep.

## User Setup Required

None - no installed provider CLI, account, live browser, external network, native host, wake flow, or human UAT was required.

## Verification

- npm --prefix mcp run build — PASS
- node tests/mcp-reverse-channel-contract.test.js — PASS
- node tests/mcp-bridge-topology.test.js — PASS, 278 assertions
- node tests/mcp-bridge-client-lifecycle.test.js — PASS, 226 assertions
- node tests/mcp-bridge-background-dispatch.test.js — PASS, 247 assertions
- node tests/mcp-agent-providers-storage.test.js — PASS
- node tests/mcp-client-merged-view.test.js — PASS
- JavaScript syntax checks and git diff --check across all Task 03 files — PASS
- Protected mcp/build/index.js and the three pre-existing generated showcase files retain their exact required SHA-256 hashes.
- No live provider CLI, external network, browser, native host, wake flow, or human UAT was invoked.

## Next Phase Readiness

- Plan 62-04 can consume one durable, freshness-aware compatibility view for bounded drift reporting without gaining binary or process authority.
- Plan 62-05 can render compatibility and refresh outcomes without implementing policy, mutating recommendation/selection/forms, or announcing cold hydration.
- No blocker remains; all genuine installed/browser UAT stays deferred to the requested milestone-end sweep.

## Self-Check: PASSED

- All ten implementation/test artifacts and this summary exist.
- Task commits 53562b32, 9b794ace, and f581ba46 are present.
- All task-level and accumulated synthetic gates, syntax checks, diff checks, and protected-hash checks pass.

---
*Phase: 62-ci-drift-smoke-gate-doctor-extensions*
*Completed: 2026-07-16*
