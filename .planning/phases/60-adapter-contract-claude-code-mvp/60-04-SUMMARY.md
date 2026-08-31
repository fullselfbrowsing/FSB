---
phase: 60-adapter-contract-claude-code-mvp
plan: "04"
subsystem: agent-delegation-runtime
tags: [spawn-supervisor, reverse-channel, serve-lifecycle, exact-once, regression-harness]

requires:
  - phase: 60-02
    provides: closed Claude adapter, strict normalized event stream, and truthful fixture provenance
  - phase: 60-03
    provides: private runtime files, strong process identity, verified tree termination, and startup recovery
  - phase: 59
    provides: authenticated local-first/capable-relay reverse-request channel
provides:
  - strict serve-only exact-once delegation supervisor with stdin-only task delivery
  - recovery-gated capable bridge startup and verified asynchronous shutdown
  - local and relayed early-id/event/cancel/domain-terminal contract coverage
  - fail-safe root regression harness and milestone-end live-UAT ledger
affects: [phase-61, phase-62, phase-64, phase-65]

tech-stack:
  added: []
  patterns:
    - durable prepared and active authority barriers before task delivery
    - serve-only capability ownership after orphan recovery
    - one terminal settlement shared across result, drift, cancel, route loss, and shutdown races
    - full-suite compatibility fixture with finally cleanup and dirty/staged preservation checks

key-files:
  created:
    - mcp/src/agent-providers/spawn-supervisor.ts
    - mcp/src/agent-providers/serve-delegation.ts
    - tests/mcp-spawn-supervisor.test.js
    - scripts/run-phase60-full-tests.mjs
    - .planning/phases/60-adapter-contract-claude-code-mvp/60-HUMAN-UAT.md
  modified:
    - mcp/src/agent-providers/registry.ts
    - mcp/src/agent-providers/runtime-files.ts
    - mcp/src/index.ts
    - tests/mcp-reverse-channel-contract.test.js
    - tests/mcp-bridge-topology.test.js
    - tests/mcp-client-inventory.test.js
    - package.json

key-decisions:
  - "Keep all production spawn authority inside the intentional HTTP serve lifecycle; stdio, diagnostics, wait, and shared runtime bridges remain incapable."
  - "Grant task authority only after prepared journal, child spawn observation, exact process identity, and durable active journal replacement all succeed."
  - "Keep agent_protocol_drift and other provider failures in domain events/terminal payloads while preserving Phase 59's exact five transport errors."
  - "Withhold production spawn on Windows and unsupported platforms until process evidence can prove the identity required for collateral-safe termination."
  - "Defer every live CLI, OS, crash, and browser check to the single milestone-end gate without weakening automated/source blockers."

patterns-established:
  - "Supervisor exact-once boundary: every start remains pending through parser EOF, child close, bounded stream drains, tree verification, and runtime cleanup."
  - "Ordered serve lifecycle: HTTP bind -> supervisor construction -> recovery -> capable bridge connect -> inventory push; shutdown reverses authority before exit."

requirements-completed:
  - ADAPT-01
  - ADAPT-02
  - ADAPT-03
  - ADAPT-04
  - ADAPT-05
  - CLAUDE-01
  - CLAUDE-02
  - CLAUDE-03
  - CLAUDE-04

duration: 32min
completed: 2026-07-14
---

# Phase 60 Plan 04: Serve-Only Delegation and Regression Closure Summary

**A recovery-gated serve daemon now owns the sole strict Claude spawn supervisor, streams correlated delegation events through the authenticated reverse channel, settles every lifecycle race exactly once, and is protected by the complete root regression suite.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-14T17:41:04Z
- **Completed:** 2026-07-14T18:13:23Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added strict recursive `delegate.start`/`delegate.cancel` handling, cryptographic server ids, fixed shell-free spawn options, provider-key scrubbing, bounded concurrent streams, durable authority barriers, stdin-only task delivery, normalized event fanout, idempotent cancellation, and exact-once terminal cleanup.
- Added a production supervisor factory that binds the closed Claude adapter to private runtime state, concrete inspection, verified termination, and startup recovery without granting process authority to the adapter itself.
- Added an injected serve lifecycle that binds HTTP first, completes recovery before capable bridge connection, pushes inventory only after connection, and shuts down supervisor/tree state before HTTP, bridge, and process exit.
- Extended real WebSocket topology coverage for local and first-capable-relay early ids, multiple pending events, correlated final results, late-event drops, minted-id cancellation, domain drift, route loss, and no replay.
- Added five Phase 60 gates to root `npm test`, a no-shell full-suite harness that preserves dirty/staged state and cleans the historical Phase 39 link on success or failure, and a fully pending `human_needed` live-UAT ledger.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the strict exact-once SpawnSupervisor** — `363f0ca9`
2. **Task 2: Wire ordered serve-only startup, reverse events, cancellation, and shutdown** — `eb954fc7`
3. **Task 3: Add root regression gates and preserve all live checks for milestone end** — `ced741b5`

## Files Created/Modified

- `mcp/src/agent-providers/spawn-supervisor.ts` — Owns strict requests, spawn authority, durable barriers, stream fanout, cancellation, settlement, and production dependency binding.
- `mcp/src/agent-providers/serve-delegation.ts` — Orchestrates recovery-gated serve startup and one idempotent ordered shutdown promise.
- `mcp/src/index.ts` — Routes only HTTP `serve` through the capable lifecycle while leaving stdio and incidental bridges unchanged.
- `tests/mcp-spawn-supervisor.test.js` — Covers hostile payloads, exact argv/options/env/stdin, >200 KiB output, noisy stderr, journal barriers, lifecycle races, cancel, shutdown, and leakage canaries.
- `tests/mcp-bridge-topology.test.js` — Covers lifecycle ordering/failures plus long-lived local/relay delegation routing and settlement.
- `tests/mcp-reverse-channel-contract.test.js` — Freezes early-id/event/domain-terminal shapes and the exact-five transport-error union.
- `scripts/run-phase60-full-tests.mjs` — Creates the one compatibility symlink, runs root tests without shell interpolation, cleans in `finally`, and checks workspace preservation.
- `.planning/phases/60-adapter-contract-claude-code-mvp/60-HUMAN-UAT.md` — Preserves seven executable live checks as unchecked milestone-end work.

## Decisions Made

- The capable bridge object may be configured before HTTP bind, but it cannot connect or advertise until the actual loopback endpoint exists and recovery returns `spawnAvailable: true`.
- Result events are not terminal authority by themselves. The start handler remains open through complete parser EOF, child close, tree verification, and required private-state cleanup.
- A shutdown reporting any unsettled tree still closes HTTP and disconnects the bridge in order, then requests a nonzero process exit rather than claiming clean success.
- Windows process inspection remains deliberately incapable of production spawn because the native zero-dependency evidence cannot yet prove the exact child environment fingerprint. Its fixed taskkill path remains covered with injected confirmed evidence and awaits live corroboration.
- The historical Phase 39 deletion is user-owned. Full-suite compatibility is supplied only by an untracked temporary symlink; the harness never restores, stages, or commits the deleted artifact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated the inventory regression assertion after lifecycle ownership moved**
- **Found during:** Task 3 full root suite
- **Issue:** The Phase 57 source assertion still required `runHttpMode` to call `pushMcpClientInventory` directly, although Plan 04 intentionally moved that call into the recovery-gated serve lifecycle.
- **Fix:** Kept the stdio assertion unchanged and made the serve assertion verify `bridge.connect()` immediately followed by injected inventory push inside `serve-delegation.ts`.
- **Files modified:** `tests/mcp-client-inventory.test.js`
- **Verification:** Focused inventory test and the subsequent complete root suite pass.
- **Committed in:** `ced741b5`

**2. [Rule 2 - Missing Critical] Added fail-closed production supervisor construction and unsupported-platform gating**
- **Found during:** Task 2 serve integration
- **Issue:** The injected supervisor was complete, but production serve had no closed factory binding the registry, private runtime files, inspector, terminator, and recovery; unsupported platforms could otherwise reach a lifecycle they could not verify.
- **Fix:** Added `createProductionSpawnSupervisor`, concrete adapter kill binding, and a recovery result that withholds spawn on unsupported verification platforms.
- **Files modified:** `mcp/src/agent-providers/spawn-supervisor.ts`
- **Verification:** Build, supervisor matrix, recovery ambiguity lifecycle test, and full suite pass.
- **Committed in:** `eb954fc7`

**Total deviations:** 2 auto-fixed integration gaps. **Impact:** Both preserve intended ownership and fail-closed behavior without adding Phase 61 UI scope.

## Issues Encountered

- The first full-suite run exposed the stale inventory source assertion and stopped cleanly. The harness removed its temporary link and preserved workspace state; after the assertion was corrected, the complete suite passed.
- No live Claude authentication, real model stream, kernel process tree, daemon crash, or browser UAT was performed. Those checks remain explicitly pending by user instruction.

## User Setup Required

None for automated operation. The authenticated CLI, cross-OS, crash/restart, and browser checks are deferred to the single milestone-end UAT gate documented in `60-HUMAN-UAT.md`.

## Next Phase Readiness

- Phase 61 can consume the authenticated `delegate.start`/`delegate.cancel` seam, early server id, normalized progress stream, and exact terminal payload without owning process launch details.
- Phase 61 must preserve server-minted identity and add only its planned side-panel consent/feed/stop/persistence behavior; none was pulled into Phase 60.
- The live Phase 60 ledger remains pending and should be executed together with the other accumulated milestone UAT only at the final gate.

## Verification

- Focused Phase 60 provider, adapter, fixture, supervisor, and orphan-recovery tests — PASS
- Phase 59 reverse-channel, topology (238 assertions), auth (50 assertions), version parity, and forbidden-flag tests — PASS
- Injected post-link harness failure — expected exit 86; link and created directory absent afterward
- `node scripts/run-phase60-full-tests.mjs` — PASS; complete root `npm test` green and workspace state preserved
- Temporary Phase 39 compatibility link — absent and unstaged after both failure and success paths
- Live UAT — all seven checks remain unchecked `human_needed`

## Self-Check: PASSED

All declared key files exist, all three task commits are present, focused and full automated gates pass, the temporary compatibility path is absent, and no live result or Phase 61 production behavior was fabricated.

---
*Phase: 60-adapter-contract-claude-code-mvp*
*Completed: 2026-07-14*
