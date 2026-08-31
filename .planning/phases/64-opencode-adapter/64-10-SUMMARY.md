---
phase: 64-opencode-adapter
plan: "10"
subsystem: durable-delegation-lifecycle
tags: [opencode, persistence, hydration, controller, diagnostics, service-worker]

requires:
  - phase: 64-opencode-adapter
    plan: "09"
    provides: Canonical provider authorization and immutable accepted-run routing
provides:
  - Exact durable Claude Code and OpenCode lifecycle entries with canonical identity and honest billing
  - One provider-neutral controller state machine for append-before-fanout, hydration, loss, hold, resume, stop, and concurrency
  - Closed six-field adapter-specific drift diagnostics with independent provider throttles and exact-once reporting
affects: [64-11, 64-12, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Snapshot exact-own-data canonical context synchronously before any asynchronous persistence boundary
    - Keep normalized result entries nonterminal until a distinct supervisor-authoritative terminal commits
    - Validate drift against adapter-specific reason rosters and immutable accepted-run identity before best-effort reporting

key-files:
  created: []
  modified:
    - extension/utils/delegation-event-store.js
    - extension/utils/delegation-controller.js
    - extension/utils/agent-protocol-drift-diagnostics.js
    - extension/background.js
    - tests/fixtures/delegation-events.js
    - tests/delegation-event-store.test.js
    - tests/delegation-controller.test.js
    - tests/agent-protocol-drift-diagnostics.test.js
    - tests/mcp-bridge-background-dispatch.test.js

key-decisions:
  - "Accept only exact canonical Claude Code or OpenCode own-data pairs at durable boundaries, reconstruct defensive frozen copies, and derive later identity solely from persisted init metadata."
  - "Keep every normalized result in running state and require an explicit authoritative terminal to establish completed, failed, stopped, or restart-lost truth."
  - "Mirror the MCP adapter-specific drift vocabularies in a bounded six-field browser projection, throttle each shipped adapter independently, and report only after terminal persistence succeeds."
  - "Upgrade the existing compact MCP drift tuple at the background boundary with the accepted immutable profile, eventIndex 1, and an empty issue-path list without expanding the wire contract."

patterns-established:
  - "Canonical durable context: exact provider pair, bounded profile, and closed billing are snapshotted before the first await and copied onto normalized entries."
  - "Terminal authority separation: result data may be durable and visible while ownership remains running until terminal cleanup settles."
  - "Observational diagnostics: validation, throttling, and storage failures are isolated from authoritative terminal settlement."

requirements-completed: [MULTI-01, MULTI-03]

duration: 31 min
completed: 2026-07-21
---

# Phase 64 Plan 10: Durable Provider Lifecycle and Drift Diagnostics Summary

**Claude Code and OpenCode now share one exact durable lifecycle through append-before-fanout persistence, silent eviction hydration, honest provider billing, and bounded adapter-specific drift reporting.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-07-21T09:54:05Z
- **Completed:** 2026-07-21T10:24:33Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 9 implementation/test paths

## Accomplishments

- Generalized delegation entries to accept only exact canonical Claude Code and OpenCode client pairs, snapshot hostile caller inputs before asynchronous storage, and preserve the existing version, key, quota, and legacy-Claude contracts.
- Kept OpenCode billing permanently honest as `unknown` with `usd: null`; model, auth, task, topology, endpoint, port, path, argv, environment, secret, and raw provider-native fields cannot enter persistence.
- Preserved result-as-candidate semantics: a result entry remains `running`, survives hydration as nonterminal, and can become success or failure only through a separate authoritative terminal entry.
- Removed the controller's implicit provider default and generalized start, append, reduce, fanout, hydration, loss, hold, resume, stop, timeout, and terminal races around one canonical provider-neutral state machine.
- Proved concurrent Claude Code and OpenCode runs retain separate immutable provider/profile/sequence/tab/hold/terminal state, including delayed persistence and silent service-worker hydration.
- Matched the exact MCP drift-reason roster for each shipped adapter, enforced the closed six-field detail schema and bounded paths/indices/profiles, and kept the two ten-second throttles independent.
- Bound background drift reporting to immutable accepted-run adapter/profile context and awaited terminal controller settlement first, so malformed, repeated, hydrated, mismatched, or throwing diagnostics cannot duplicate or alter terminal truth.

## Task Commits

All three tasks landed as explicit RED/GREEN pairs:

1. **Durable lifecycle RED** — `0a72ded4` (test; canonical providers, hostile context, honest billing, and result-before-terminal cases)
2. **Durable lifecycle GREEN** — `dda88aeb` (feat; canonical exact-context projection, synchronous snapshots, and terminal-authority preservation)
3. **Concurrent controller RED** — `b710498f` (test; immutable starts, concurrent providers, delayed append, and silent hydration)
4. **Concurrent controller GREEN** — `013361da` (feat; provider-neutral durable controller and persisted-provider reconstruction)
5. **Adapter drift RED** — `c2b22e80` (test; closed rosters, six-field detail, cross-provider negatives, throttling, and exact-once settlement)
6. **Adapter drift GREEN** — `e3499c62` (feat; safe per-adapter diagnostics and background terminal integration)

## Files Created/Modified

- `extension/utils/delegation-event-store.js` — Validates and snapshots exact canonical provider context, forces honest billing, and preserves explicit terminal authority.
- `extension/utils/delegation-controller.js` — Starts and hydrates either shipped provider through one immutable, append-before-fanout lifecycle.
- `extension/utils/agent-protocol-drift-diagnostics.js` — Enforces adapter-specific reason tables, bounded six-field details, and independent provider throttles.
- `extension/background.js` — Projects compact or rich drift evidence against immutable accepted context and reports only after authoritative settlement.
- `tests/fixtures/delegation-events.js` — Supplies canonical Claude Code and OpenCode lifecycle contexts.
- `tests/delegation-event-store.test.js` — Covers exact schemas, hostile inputs, quotas, legacy hydration, honest OpenCode billing, and result/terminal separation.
- `tests/delegation-controller.test.js` — Covers exact provider starts, concurrent isolation, durable ordering, hydration, and existing lifecycle/loss races.
- `tests/agent-protocol-drift-diagnostics.test.js` — Covers closed vocabularies, shapes, bounds, hostile objects, and independent throttles.
- `tests/mcp-bridge-background-dispatch.test.js` — Covers accepted-context matching, exact-once drift projection, exception isolation, and unchanged terminal settlement.

## Decisions Made

- Required an explicit exact `{id,label}` provider object at controller start instead of consulting a default or mutable setting; the caller receives no later opportunity to relabel the run.
- Reconstructed hydration identity only when every persisted provider-bearing entry agrees with the canonical init pair and billing classification.
- Copied the exact reason rosters from the MCP protocol-drift contract rather than accepting a generic `protocol_drift` reason or cross-adapter reason reuse.
- Preserved the existing compact MCP wire tuple and safely completed its browser-only detail at the accepted-run boundary; no transport schema or provider-native payload surface was added.
- Performed best-effort drift reporting after awaited terminal persistence. Validation, storage, or reporter exceptions cannot weaken or delay the authoritative terminal outcome.

## Security and Verification

- **T64-08 (CRITICAL, terminal tampering): mitigated.** Results remain nonterminal across persistence and hydration; explicit terminal evidence alone establishes completion/failure/stopped/restart-loss state.
- **T64-09 (HIGH, diagnostic denial of service): mitigated.** Exact adapter/reason validation, bounded fields, independent throttling, exact-once tracking, and exception isolation all pass.
- **T64-10 (CRITICAL, persistence disclosure): mitigated.** Only normalized exact lifecycle fields and canonical client/profile/billing context serialize; hostile raw, task, auth, model, server, topology, path, environment, argv, and secret sentinels are rejected or absent.
- No HIGH or CRITICAL finding was accepted.

Final verification receipts:

- `node tests/delegation-event-store.test.js` — **33 passed, 0 failed**.
- `node tests/delegation-controller.test.js` — **41 passed, 0 failed**.
- `node tests/agent-protocol-drift-diagnostics.test.js` — **all assertions passed**.
- `node tests/mcp-bridge-background-dispatch.test.js --section agent-protocol-drift` — **355 passed, 0 failed**.
- `node --check` passed for all four modified production JavaScript files.
- Provider-branch scan found no Claude/OpenCode literals in the controller; scoped `git diff --check` passed for all nine plan paths.

## Deviations from Plan

None. The implementation stayed within the nine declared paths and preserved the existing MCP wire contract while completing its safe browser-side diagnostic projection.

## Issues Encountered

None. All RED cases failed for the intended missing behavior, each GREEN pair passed its focused suite, and the accumulated final gate remained green.

## User Setup Required

None - no dependency, credential, account, browser, executable, or external-service configuration was added.

## Next Phase Readiness

- Plan 64-11 can consume durable canonical provider/profile/billing evidence for the existing OpenCode Providers row.
- Plan 64-12 can project the same provider-neutral lifecycle into the existing delegated feed and summary UI without adapter-specific state branches.
- Plan 64-13 retains full validation, CI/security gates, and the milestone-end genuine-browser UAT ledger.
- No active blocker.

## Self-Check: PASSED

- All nine declared implementation/test paths exist and are clean after six reviewable RED/GREEN commits.
- Exact focused commands, syntax checks, provider-neutral branch scan, whitespace checks, hostile-input matrices, concurrency/hydration coverage, and HIGH/CRITICAL threat mitigations pass.
- The pre-existing shared `STATE.md` worktree edit and all unrelated dirty workspace paths remain untouched and unstaged for the parent orchestrator.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-21*
