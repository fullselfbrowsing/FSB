---
phase: 60-adapter-contract-claude-code-mvp
fixed_at: "2026-07-14T18:51:18Z"
review_path: .planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
commits:
  - "18790740"
  - "1c7c69d5"
  - "ceca6048"
  - "0ee1c54b"
  - "3f594593"
---

# Phase 60: Code Review Fix Report

**Fixed at:** 2026-07-14
**Source review:** `.planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: A failed tree termination leaves `agent-spawn` available for new work

**Files modified:** `mcp/src/agent-providers/spawn-supervisor.ts`, `mcp/src/agent-providers/serve-delegation.ts`, `tests/mcp-spawn-supervisor.test.js`, `tests/mcp-bridge-topology.test.js`
**Commit:** `18790740`
**Applied fix:** Added a one-way supervisor degradation latch for `tree_unsettled` and unverifiable runtime cleanup. Degradation rejects every later start and invokes a one-shot serve callback that performs orderly forced nonzero shutdown, disconnecting the bridge and withdrawing the capability until a fresh process completes startup recovery. The regression keeps the unresolved journal, proves the callback fires once, and proves a second start cannot emit a second spawn.

### WR-01: Cancellation can settle before the detached setup task finishes mutating runtime state

**Files modified:** `mcp/src/agent-providers/spawn-supervisor.ts`, `tests/mcp-spawn-supervisor.test.js`
**Commit:** `1c7c69d5`
**Applied fix:** Retained each run's setup/execution promises and made cancellation join them before terminal settlement. Cancellation-aware barriers now cover detection, spawn construction, preparation, activation resolution, and activation, while runtime ownership starts early enough to clean a private configuration even before a journal entry exists. Held-promise regressions at `buildSpawn`, `prepareRun`, `resolveActivation`, and `activateRun` prove close cannot resolve early and cannot leave configuration, journal, PID-map, or task authority behind.

### WR-02: Active route loss is either silently ignored or mislabeled as protocol drift

**Files modified:** `mcp/src/types.ts`, `mcp/src/bridge.ts`, `mcp/src/agent-providers/spawn-supervisor.ts`, `mcp/src/agent-providers/serve-delegation.ts`, `tests/mcp-spawn-supervisor.test.js`, `tests/mcp-bridge-topology.test.js`
**Commit:** `ceca6048`
**Applied fix:** Extension handlers now receive a route-lifetime abort signal. Local extension loss, relayed origin loss, and selected hub/relay loss abort the exact delegated run, terminate its tree once, and prevent failover replay. The supervisor preserves `route_lost` for an active emitter failure instead of rewriting it as provider drift; the existing Phase 59 external error union remains unchanged. Regressions cover a throwing active event emitter and real local, relay-origin, and hub loss after `delegation.started`.

### WR-03: Stdin error coverage ends before EOF delivery is safely settled

**Files modified:** `mcp/src/agent-providers/spawn-supervisor.ts`, `tests/mcp-spawn-supervisor.test.js`
**Commit:** `0ee1c54b`
**Applied fix:** `writeTask()` now owns the write callback, drain, EOF/end callback, finish, premature close, and error lifecycle as one joined promise. Cancellation waits for that work rather than settling around a detached continuation. Deterministic regressions cover close during EOF delivery, error during EOF delivery, permanent backpressure without drain, and cancellation while backpressured with a held close.

### WR-04: The full-suite harness can report workspace preservation after changing user bytes

**Files modified:** `scripts/run-phase60-full-tests.mjs`, `tests/phase60-full-tests-harness.test.js`, `package.json`
**Commit:** `3f594593`
**Applied fix:** The harness now records read-only SHA-256 fingerprints for logical index entries, staged and unstaged tracked bytes, untracked entries and bytes, and the complete status/path set. It rejects any byte or path change without restoring user state. A test-only command/root seam injects dirty-file, same-name staged-index, and new-untracked mutations; the regression proves a nonzero result, preservation of those injected mutations, and cleanup of only the harness-created compatibility path.

## Verification

- `./mcp/node_modules/.bin/tsc -p mcp/tsconfig.json --noEmit` — passed
- `node tests/mcp-spawn-supervisor.test.js` — passed
- `node tests/mcp-bridge-topology.test.js` — 254 passed, 0 failed
- `node tests/mcp-reverse-channel-contract.test.js` — passed
- `node tests/phase60-full-tests-harness.test.js` — passed
- `node tests/mcp-agent-provider-contract.test.js` — passed
- `node tests/mcp-claude-code-adapter.test.js` — passed
- `node tests/mcp-agent-stream-fixture.test.js` — passed (`CLAUDE-03` remains `human_needed`)
- `node tests/mcp-agent-orphan-recovery.test.js` — passed
- `node tests/mcp-client-inventory.test.js` — passed
- `git diff --check 18790740^ HEAD -- <Phase 60 fix scope>` — passed

Live Claude UAT and the full root suite were not run. The fixes use deterministic local regressions, and the dedicated full-suite harness was itself under review in this iteration while the workspace retained substantial pre-existing dirty state.

---

_Fixed: 2026-07-14_
_Fixer: Codex (`gsd-code-review-fix`)_
_Iteration: 1_
