---
phase: 60-adapter-contract-claude-code-mvp
plan: "03"
subsystem: agent-process-lifecycle
tags: [orphan-recovery, process-tree, atomic-files, procfs, taskkill]

requires:
  - phase: 60-01
    provides: retained Claude executable identity and provider-neutral child contract
  - phase: 60-02
    provides: concrete Claude adapter with injected tree-kill authority
provides:
  - owner-only exact runtime MCP configuration and two-state orphan journal
  - bounded platform-explicit process inspection with confirmed/stale/ambiguous classifications
  - verified idempotent tree termination and journal-scoped startup recovery
affects: [60-04, phase-61, phase-62, phase-64, phase-65]

tech-stack:
  added: []
  patterns:
    - durable prepared-before-spawn and active-before-stdin journal transitions
    - strong process evidence before any group signal or native tree termination
    - content-free startup recovery counts gate capability advertisement

key-files:
  created:
    - mcp/src/agent-providers/process-tree.ts
    - tests/mcp-agent-orphan-recovery.test.js
  modified:
    - mcp/src/agent-providers/runtime-files.ts

key-decisions:
  - "Treat PID reuse, incomplete platform evidence, a surviving process group without its leader, and multiple prepared matches as ambiguous; none may receive a signal."
  - "Require Darwin evidence to carry both the daemon-computed argv signature and the unique runtime fingerprint because native ps command text alone cannot reconstruct an exact argv vector."
  - "Keep Windows fail-closed when the native zero-dependency query cannot prove the exact per-process environment fingerprint; Plan 04 must withhold spawn on that unsupported verification path."
  - "Remove the private run directory before deleting its journal record so a cleanup failure preserves the durable recovery anchor."

patterns-established:
  - "Journal-only recovery: every inspection is anchored by one exact validated record, survivors are never adopted, and ambiguity preserves the record."
  - "Verified termination: success requires child settlement when available plus a final stale classification; duplicate calls share one signal sequence."

requirements-completed:
  - ADAPT-04
  - ADAPT-05

duration: 14min
completed: 2026-07-14
---

# Phase 60 Plan 03: Private Runtime State and Orphan Recovery Summary

**Private atomic runtime state, exact cross-platform process evidence, collateral-safe tree termination, and fail-closed startup recovery now form the lifecycle substrate for the supervisor.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-14T17:27:42Z
- **Completed:** 2026-07-14T17:41:03Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added an owner-only `~/.fsb/agent-runtime` service with an exact single-loopback-server MCP config, strict prepared/active journal union, serialized no-follow atomic writes, symlink rejection, bounded reads, and artifact canary coverage.
- Added concrete bounded Linux `/proc`, Darwin absolute `/bin/ps`, Windows native WMIC, and unsupported-platform inspection paths. Only exact start/group/argv/fingerprint evidence can classify a journaled candidate as confirmed.
- Added POSIX negative-process-group TERM/grace/KILL handling and direct native Windows taskkill execution with fixed argv, final absence verification, delayed-child settlement, racing-call idempotence, and typed `tree_unsettled` failure.
- Added serial startup recovery that clears proven stale entries, terminates and re-verifies confirmed survivors, preserves ambiguous/unsettled records, emits content-free per-profile counts, and withholds advertisement whenever spawn is unsafe.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create owner-only runtime MCP config and atomic orphan journal** — `8852b35d`
2. **Task 2: Implement verified POSIX and Windows process-tree termination** — `ad3dfcb2`
3. **Task 3: Implement journal-only startup recovery classification** — `4e57b77a`

## Files Created/Modified

- `mcp/src/agent-providers/runtime-files.ts` — Owns exact private runtime files, journal transitions, cleanup ordering, and startup recovery aggregation/gating.
- `mcp/src/agent-providers/process-tree.ts` — Implements bounded concrete inspectors, canonical identity helpers, native fixed-argv execution, and idempotent verified termination.
- `tests/mcp-agent-orphan-recovery.test.js` — Covers modes, symlinks, schemas, atomic failures, concrete platform evidence, signal ordering, child races, recovery mixtures, corrupt journals, and unrelated-process safety.

## Decisions Made

- A missing active leader is stale only when the complete process table also proves its retained process group absent. A surviving group without the leader remains ambiguous rather than being treated as successful cleanup.
- Linux exactness comes from NUL-delimited argv plus the unique environment fingerprint; Darwin also requires the daemon-computed argv signature in the child environment because `ps` text is not a lossless argv encoding.
- The planned zero-dependency Windows query cannot establish the required environment evidence. It therefore remains an explicit fail-closed platform result with zero taskkill, and the supervisor integration must not spawn into a lifecycle it cannot verify.
- Recovery diagnostics aggregate only adapter id, profile version, and the three outcome counts. Delegation ids, paths, argv, fingerprints, command lines, tasks, environment, and provider output never enter the result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved the recovery anchor when run-directory cleanup fails**
- **Found during:** Task 3 recovery failure matrix
- **Issue:** `removeRun()` initially deleted the journal record before cleaning its private directory, so an insecure or failed cleanup could throw after the recovery anchor was already lost.
- **Fix:** Clean the settled run directory first, then atomically remove the journal entry. A cleanup or subsequent journal-write failure now leaves a conservative retry path.
- **Files modified:** `mcp/src/agent-providers/runtime-files.ts`, `tests/mcp-agent-orphan-recovery.test.js`
- **Verification:** Remove-failure recovery remains fail-closed and retains the journal record.
- **Committed in:** `4e57b77a`

**2. [Rule 2 - Missing Critical] Distinguished a surviving process group from proven absence**
- **Found during:** Task 2 active-leader disappearance matrix
- **Issue:** Treating a missing retained PID as stale could falsely report success while descendants in the retained process group survived.
- **Fix:** Complete Linux/Darwin tables are checked for the journaled group; any remaining member yields `group_still_present` and no success classification.
- **Files modified:** `mcp/src/agent-providers/process-tree.ts`, `tests/mcp-agent-orphan-recovery.test.js`
- **Verification:** The leader-missing/group-present fixture is ambiguous, and stop cannot resolve success while matching descendants remain.
- **Committed in:** `ad3dfcb2`

**Total deviations:** 2 auto-fixed lifecycle bugs. **Impact:** Both close unsafe success paths without broadening the planned runtime surface.

## Issues Encountered

- The delegated full-plan executor completed its required reading but produced no edits after several minutes. It was interrupted, and execution continued through the autonomous workflow's local fallback with the same task boundaries and atomic commits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 60-04 can now bind prepared-before-spawn, exact post-spawn identity activation, stdin release, adapter kill, startup recovery, and serve-only capability advertisement into `SpawnSupervisor`.
- Plan 60-04 must include `FSB_AGENT_ARGV_SIGNATURE` in the scrubbed fixed child environment and must withhold Windows/unsupported spawn while the concrete inspector cannot prove the required identity.
- Real POSIX/Windows descendant behavior and daemon-crash recovery remain `human_needed` at the single milestone-end UAT gate; no live result was inferred.

## Verification

- `npm --prefix mcp run build` — PASS
- `node tests/mcp-agent-orphan-recovery.test.js` — PASS
- `node tests/mcp-bridge-auth.test.js` — PASS (50 passed)
- `node tests/agent-provider-forbidden-flags.test.js` — PASS
- No live CLI, real OS process tree, authenticated browser, or model invocation was used.

## Self-Check: PASSED

All declared key files exist, all three task commits are present, and every Plan 03 automated acceptance command passes with the unrelated-process and content-free diagnostic assertions intact.

---
*Phase: 60-adapter-contract-claude-code-mvp*
*Completed: 2026-07-14*
