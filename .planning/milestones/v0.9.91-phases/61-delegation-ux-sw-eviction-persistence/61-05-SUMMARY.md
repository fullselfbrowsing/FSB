---
phase: 61-delegation-ux-sw-eviction-persistence
plan: "05"
subsystem: delegation-supervisor
tags: [delegation, posix-signals, process-groups, restart-recovery, atomic-persistence]

requires:
  - phase: 60-03
    provides: private runtime journal, exact process inspection, and confirmed process-tree termination
  - phase: 60-04
    provides: serve-owned exact-once spawn supervisor and closed reverse-request authority
  - phase: 61-03
    provides: acknowledged heartbeat and disconnect classification without restart inference
  - phase: 61-04
    provides: exact delegation mapping and sealed five-minute human-control leases
provides:
  - strict supervisor-only delegate.hold, delegate.resume, and delegate.status reverse methods
  - confirmed POSIX process-group hold/resume with fixed expiry and exact-once race settlement
  - daemon-generation journal metadata and bounded persisted restart-loss dispositions
affects: [61-06, 61-07, 61-08, phase-62]

tech-stack:
  added: []
  patterns:
    - bracket POSIX group signals with exact process-tree identity and group-state confirmation
    - persist restart loss only after prior-generation tree absence through a retry-safe disposition-before-journal-removal mutation

key-files:
  created: []
  modified:
    - mcp/src/agent-providers/spawn-supervisor.ts
    - mcp/src/agent-providers/runtime-files.ts
    - tests/mcp-spawn-supervisor.test.js
    - tests/mcp-agent-orphan-recovery.test.js
    - tests/mcp-reverse-channel-contract.test.js

key-decisions:
  - "Keep hold, resume, cancel, settlement, and status inside the one serve-owned supervisor; the five-method adapter contract remains unchanged."
  - "A hold or resume is acknowledged only after exact process identity, negative process-group signal, and resulting group state are confirmed; every unverifiable path converges to cancellation."
  - "Restart loss requires a prior daemon generation plus a durable post-cleanup disposition; transport disconnect, same-generation disk state, and failed cleanup never qualify."

patterns-established:
  - "Lifecycle transitions are fail-closed two-sided confirmations: inspect exact tree/state, signal the retained group, then inspect exact tree/state again."
  - "Recovery writes the bounded owner-only disposition before removing its journal source record, so an interrupted second replace is safely retryable without duplicate evidence."

requirements-completed:
  - UX-04
  - UX-05
  - LIFE-04

duration: 30min
completed: 2026-07-15
---

# Phase 61 Plan 05: Supervisor Lifecycle and Restart Evidence Summary

**The sole spawn supervisor now confirms bounded POSIX hold/resume transitions and exposes generation-backed, persisted restart-loss evidence without widening adapter or transport authority.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-07-15T10:20:20Z
- **Completed:** 2026-07-15T10:50:22Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added exact closed schemas for `delegate.hold`, `delegate.resume`, and empty-payload `delegate.status`, all routed through the existing supervisor. Status projects only one daemon generation, at most 64 active id/state rows, and at most 128 restart dispositions; the adapter remains exactly five methods.
- Added supported-POSIX-only `SIGSTOP`/`SIGCONT` handling against the retained negative process-group id. Exact process identity and complete group state are confirmed before and after each signal, confirmed holds alone arm the fixed five-minute expiry, and unsupported, stale, ambiguous, failed-signal, or failed-inspection cases cancel fail closed.
- Unified duplicate hold/resume/cancel operations, expiry, result, route loss, child exit, and cleanup races through the existing settle-once barrier. Fake-process and fake-clock evidence covers confirmation delay, duplicate operations, exact expiry boundary, hold-vs-result, resume-vs-cancel, signal failure, and unsettled descendants without claiming real kernel execution.
- Added strict generation metadata to prepared and active runtime journal records plus a separate versioned, schema-validated, owner-only recovery-disposition file. Prior-generation stale or killed trees persist `daemon_restart_lost_run` only after confirmed absence; same-generation, corrupt, ambiguous, and failed-cleanup records remain fail closed without false evidence.
- Made recovery persistence bounded to 128 records and crash-retry-safe: cleanup precedes disposition persistence, disposition persistence precedes source-journal removal, and an interrupted journal replace retries idempotently without changing the original disposition timestamp.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add strict hold, resume, and status schemas to the supervisor authority** — `18889d2d`
2. **Task 2: Implement confirmed POSIX hold, resume, expiry, and exact-once settlement** — `c4052b9c`
3. **Task 3: Persist bounded generation and restart-loss recovery evidence** — `ebb5e7af`

## Files Created/Modified

- `mcp/src/agent-providers/spawn-supervisor.ts` — Owns strict lifecycle/status requests, confirmed POSIX process-group transitions, hold expiry, bounded status projection, and the shared production daemon generation.
- `mcp/src/agent-providers/runtime-files.ts` — Validates generation-bearing run journals and atomically persists bounded restart-loss dispositions after confirmed prior-generation cleanup.
- `tests/mcp-spawn-supervisor.test.js` — Proves strict lifecycle schemas, status bounds/redaction, fake-clock expiry, signal/inspection failures, exact-once races, and idempotent recovery status.
- `tests/mcp-agent-orphan-recovery.test.js` — Proves private generation/disposition schemas, restrictive modes, pruning, crash retry, generation matrix, confirmed cleanup, and false-positive negatives.
- `tests/mcp-reverse-channel-contract.test.js` — Pins one-supervisor routing, unchanged five-method adapters, shared generation, and absence of adoption, replay, or disconnect-based restart inference.

## Decisions Made

- Lifecycle control remains supervisor policy. No hold/resume/status method was added to `AgentProviderAdapter`, and no second process owner or sixth adapter exists.
- Status treats transitional `holding`/`resuming` records as running until post-signal confirmation succeeds; it never reports held/resumed optimistically and never exposes PID, argv, environment, cwd, task text, credentials, or provider output.
- Unsupported platforms and unverifiable identity/state do not simulate success. They enter the normal confirmed termination path; an unsettled descendant preserves runtime evidence and degrades the supervisor.
- The production constructor mints one UUID generation and passes that exact value to startup recovery and every new journal record. Same-generation disk records are neither adopted nor killed and withhold spawn advertisement as ambiguous.
- Restart dispositions are non-destructive status evidence. Repeated recovery/status reads are idempotent, and ordinary WebSocket disconnect or route loss never writes a disposition.

## Deviations from Plan

None — the strict protocol, confirmed POSIX lifecycle matrix, fixed expiry, exact-once cleanup races, bounded generation/recovery persistence, and no-adoption/disconnect negatives all landed within the declared supervisor/runtime/test scope. `serve-delegation.ts` and `index.ts` required no edit because their existing one-supervisor handler route already carried the newly accepted closed methods; source pins prove that link.

## Issues Encountered

- Requiring `generation` in the exact runtime schema initially caused the expected focused fixture failure (`Prepared runtime state is invalid`). Fixtures and strict-key assertions were advanced together, after which the complete recovery matrix passed.
- Repeated MCP builds regenerated ignored/unstaged outputs as expected. The user-owned `mcp/build/index.js` remained exactly SHA-256 `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4` and was never staged.
- No real POSIX process group, installed CLI, daemon restart, browser service-worker eviction, or human-control interaction was exercised. Per user instruction, every live/human UAT remains pending for the single milestone-end sweep.

## User Setup Required

None. Genuine CLI/kernel/browser corroboration remains deferred to the milestone-end UAT ledger.

## Next Phase Readiness

- Plan 61-06 can reconcile service-worker state through strict `delegate.status`, drive confirmed hold/resume/cancel, and classify only persisted `daemon_restart_lost_run` evidence.
- Plan 61-07 can render Take Control, Resume, Stop, and restart-loss outcomes without receiving process metadata or inventing transport-derived state.
- No implementation blocker remains; live process/browser validation stays deferred to the milestone-end gate.

## Verification

- `npm --prefix mcp run build` — PASS
- `node tests/mcp-agent-orphan-recovery.test.js` — PASS
- `node tests/mcp-spawn-supervisor.test.js` — PASS
- `node tests/mcp-reverse-channel-contract.test.js` — PASS
- `node tests/mcp-bridge-topology.test.js` — PASS (254 passed, 0 failed; additional serve/replay/disconnect integration evidence)
- `shasum -a 256 mcp/build/index.js` — PASS (`6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`)
- `git diff --check` on every declared implementation/test file — PASS
- Live UAT — not run; deferred to the milestone-end sweep by explicit user instruction

## Self-Check: PASSED

All five declared changed artifacts exist, the three atomic task commits are present, both plan key links are source-pinned, the fresh automated gate and additional bridge integration suite pass, the protected build hash is unchanged, no unrelated/generated/user-owned state was staged, and no live/manual result was claimed.

---
*Phase: 61-delegation-ux-sw-eviction-persistence*
*Completed: 2026-07-15*
