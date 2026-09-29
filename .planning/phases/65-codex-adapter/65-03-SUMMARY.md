---
phase: 65-codex-adapter
plan: "03"
subsystem: delegation-start-identity
tags: [accepted-identity, consent, spawn-supervisor, toctou, hostile-records]

requires:
  - phase: 65-codex-adapter
    plan: "02"
    provides: Exact five-field preflight and one-time consent identity binding
provides:
  - Daemon-owned hostile-record-safe accepted-identity validation and detection projection
  - Consent-bound authenticated delegate.start transport with no side-panel authority
  - Five-field daemon re-detection barrier before runtime preparation, journal, child, event, or stdin
  - Exact delegation.started identity echo checked before browser controller or visible run state
affects: [65-04, 65-05, 65-06, codex-adapter, delegated-start]

tech-stack:
  added: []
  patterns:
    - Derive accepted identity independently on both sides of the authenticated bridge and compare all five fields
    - Reject hostile wire records through exact own-enumerable-data descriptor inspection
    - Delay controller boot and persistence until the daemon echoes the consumed identity exactly

key-files:
  created:
    - mcp/src/agent-providers/accepted-identity.ts
  modified:
    - mcp/src/agent-providers/spawn-supervisor.ts
    - extension/background.js
    - tests/mcp-spawn-supervisor.test.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/delegation-routing.test.js

key-decisions:
  - "Keep the daemon identity contract independent from browser code while mechanically matching the same exact provider/auth/billing policy."
  - "Select the adapter only from the consumed identity providerId, then require current daemon detection to equal every identity field before any runtime side effect."
  - "Boot the browser controller only inside the exact delegation.started echo callback so a mismatch cannot create, hydrate, persist, or fan out a run."
  - "Require accepted identity as explicit authoritative row evidence and fail closed when it is absent; the later safe-inventory promotion supplies that evidence."

patterns-established:
  - "Immediate-start identity barrier: consumed browser authority must equal fresh daemon detection before runtime ids, paths, buildSpawn, journal, child, or stdin."
  - "Acceptance echo barrier: daemon-confirmed identity must equal consumed consent before controller creation or browser-visible state."

requirements-completed: [MULTI-05]

duration: 20 min
completed: 2026-07-22
---

# Phase 65 Plan 03: Consent-Bound Immediate Start Identity Summary

**Delegated start now crosses the authenticated bridge with only the one-time consumed five-field identity, revalidates it against fresh daemon detection before all runtime effects, and persists a run only after an exact daemon echo.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-22T10:53:52Z
- **Completed:** 2026-07-22T11:13:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added one frozen daemon-side accepted identity contract for Claude Code and OpenCode with exact provider, label, profile, auth, and billing validation; hostile records, invalid pairs, legacy shapes, and Codex production exposure fail closed.
- Changed authenticated `delegate.start` to carry exactly the consumed accepted identity and task, while adapter selection derives only from that validated identity.
- Compared fresh supervisor detection against all five consent-bound fields immediately after detection and before runtime ids/paths, build preparation, journal append, process creation, events, or task stdin.
- Echoed the fresh frozen identity in `delegation.started` and moved controller boot, hydration, persistence, run-context creation, and feed visibility behind exact browser-side equality.
- Covered both existing providers plus one-field mutations, hostile accessors/prototypes/symbols/extras, forged legacy wire records, post-check mutation, no replay, and zero-side-effect ordering.

## Task Commits

Each task was committed atomically:

1. **Define the daemon-owned accepted identity boundary** — `fa8e2a46` (feat)
2. **Bind consumed consent to immediate supervisor start** — `ed9cb63b` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/accepted-identity.ts` — Defines the exact five-field type, hostile-record validator, equality helper, and detection-owned Claude Code/OpenCode projection.
- `mcp/src/agent-providers/spawn-supervisor.ts` — Validates the authenticated start wire, rechecks daemon detection before runtime effects, and emits the exact accepted identity.
- `extension/background.js` — Carries authoritative identity through preflight/consent, transports only the consumed record, and delays controller state until exact daemon echo.
- `tests/mcp-spawn-supervisor.test.js` — Proves both-provider success, hostile wire rejection, five-field mismatch rejection, mutation isolation, and zero runtime/journal/child/stdin effects.
- `tests/mcp-bridge-background-dispatch.test.js` — Proves exact consumed transport, echo comparison before controller creation, persistence immutability, no replay, and full background regression parity.
- `tests/delegation-routing.test.js` — Pins provider-free side-panel requests and immediate-start source ordering.

## Decisions Made

- Kept the daemon validator self-contained rather than importing extension authority. Tests mechanically pin parity so neither side can silently widen a provider/auth/billing pair.
- Treated detection as the sole daemon identity source. Caller-provided label, profile, auth, and billing values authorize nothing unless they match the adapter's fresh validated detection exactly.
- Retained the current two-provider policy: Claude Code is `unknown/subscription`; OpenCode is `unknown/unknown`; no Codex production identifier was added.
- Required an exact accepted identity on the authoritative merged provider row and refused to synthesize one from compatibility alone. Plan 65-06 will promote safe classified inventory evidence into this already-closed boundary.
- Stored only daemon-confirmed identity in run/event contexts; later settings changes cannot relabel provider, profile, auth, or billing.

## Verification

- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js","--section","accepted-identity-foundation"]]'` — **PASS**.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js","--section","consent-bound-start"],["node","tests/mcp-bridge-background-dispatch.test.js","--section","accepted-identity"],["node","tests/delegation-routing.test.js","--section","immediate-start-identity"]]'` — **PASS** (including 66 accepted-identity bridge assertions).
- Preservation-wrapped complete `tests/mcp-spawn-supervisor.test.js` — **PASS**.
- Complete `tests/mcp-bridge-background-dispatch.test.js` — **PASS**, 355 passed and 0 failed.
- Complete `tests/delegation-routing.test.js` — **PASS**.
- JavaScript syntax checks and scoped `git diff --check` passed for every Task 02 JavaScript/test path.
- Threat checks cover T65-03 consent/detection TOCTOU, T65-09 immutable accepted state, and T65-10 provider-free browser routing; no unplanned HIGH or CRITICAL finding remains.

## Deviations from Plan

None - both tasks stayed within the six declared production/test paths and were committed separately.

## Issues Encountered

- The complete background regression suite exposed legacy expectations that still projected provider/profile/billing as separate controller event fields. Those declared test fixtures were migrated to the accepted-identity-only context, after which all 355 assertions passed.

## User Setup Required

None - no dependency, credential, external service, local process, or configuration was added.

## Next Phase Readiness

- Plan 65-04 can add generic pre-spawn probe and runtime-isolation descriptors behind the established identity barrier without changing browser authority.
- Plan 65-05 can extend the daemon projection atomically for Codex while preserving the same five-field start comparison.
- Plan 65-06 must populate authoritative safe inventory rows with accepted identity; until then, missing evidence intentionally returns the bounded refresh path instead of fabricating start authority.
- Claude Code and OpenCode remain the only production roster entries; no Plan 03 blocker remains.

## Self-Check: PASSED

- Both task commits exist and contain only their declared paths.
- Focused acceptance commands and complete regression suites pass.
- All five identity fields are checked before daemon runtime effects and again before browser persistence.
- The 402 pre-existing planning deletions and four unrelated dirty generated/showcase artifacts remain untouched and unstaged with their original hashes.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
