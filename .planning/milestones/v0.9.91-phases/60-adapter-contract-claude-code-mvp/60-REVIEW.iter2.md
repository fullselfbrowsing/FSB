---
phase: 60
status: issues_found
depth: deep
files_reviewed: 24
findings:
  critical: 1
  warning: 4
  info: 0
  total: 5
---

# Phase 60 Deep Code Review

## Verdict

Issues found. The adapter/profile/parser boundary is strongly closed, task and provider-key canaries stay out of argv/environment/journal diagnostics, serve-only startup is recovery-gated, and the focused suites pass. Release is blocked, however, because an unresolved process tree does not revoke future spawn authority. Four additional lifecycle and regression-harness races should also be fixed before Phase 61 consumes this runtime.

## Critical Findings

### CR-01 — A failed tree termination leaves `agent-spawn` available for new work

**Files:** `mcp/src/agent-providers/spawn-supervisor.ts:429-439`, `mcp/src/agent-providers/spawn-supervisor.ts:889-929`, `mcp/src/agent-providers/spawn-supervisor.ts:955-976`, `mcp/src/agent-providers/process-tree.ts:723-742`, `tests/mcp-spawn-supervisor.test.js:687-704`

When inspection remains ambiguous or a matching tree survives, the terminator correctly throws `tree_unsettled`, but `cancelLifecycle()` merely settles that run as failed. `settleOnce()` then removes it from `activeRuns`, while `accepting` remains true (it is latched false only by daemon-wide `close()`). A subsequent `delegate.start` therefore passes the handler gate and can spawn another browser-capable agent while the prior journaled descendant may still be alive. The existing test proves the journal is retained after an unsettled cancel but never attempts a second start. This violates the Phase 60 critical guardrail requiring new spawn to be withheld after any unresolved matching descendant.

**Required fix:** latch the supervisor into a fail-closed/degraded state on `tree_unsettled` or unverifiable cleanup, reject all later starts, and withdraw/disconnect the advertised capability (or force an orderly nonzero daemon shutdown). Only a fresh startup recovery that proves the journal clean may restore spawn authority. Add a regression that an unsettled ordinary cancel leaves the journal intact, emits no second spawn, and cannot keep advertising usable `agent-spawn` capability.

## Warning Findings

### WR-01 — Cancellation can settle before the detached setup task finishes mutating runtime state

**Files:** `mcp/src/agent-providers/spawn-supervisor.ts:464-518`, `mcp/src/agent-providers/spawn-supervisor.ts:521-640`, `mcp/src/agent-providers/spawn-supervisor.ts:916-933`, `tests/mcp-spawn-supervisor.test.js:631-704`

`start()` launches `executeRun()` without retaining/awaiting its promise. If shutdown arrives after the line-530 stop check while `buildSpawn()` or `prepareRun()` is pending, `cancelLifecycle()` sees no `run.entry`, settles immediately, and lets `close()` return. `executeRun()` can then create the MCP file and prepared journal, observe `stopRequested`, throw, and return at line 627 because the run is already settled—skipping cleanup. The same missing setup barrier lets resolve/activate continuations reassign stale in-memory entry/PID state after cancellation cleanup; correctness there currently depends on the concrete runtime mutation queue rather than supervisor lifecycle ownership.

**Required fix:** retain one execution/setup promise per run and make cancellation/close join it. Protect the whole prepared-to-active transition with a cancellation-aware barrier, and do not settle/remove the run until any in-flight runtime mutation has either stopped before mutation or been followed by verified cleanup. Add held-promise races at `buildSpawn`, `prepareRun`, `resolveActivation`, and `activateRun`, asserting close does not resolve early and no journal/config/PID map entry appears after settlement.

### WR-02 — Active route loss is either silently ignored or mislabeled as protocol drift

**Files:** `mcp/src/agent-providers/spawn-supervisor.ts:598-615`, `mcp/src/agent-providers/spawn-supervisor.ts:727-753`, `mcp/src/agent-providers/spawn-supervisor.ts:779-807`, `tests/mcp-spawn-supervisor.test.js:343-346`, `tests/mcp-spawn-supervisor.test.js:555-565`, `tests/mcp-bridge-topology.test.js:1390`, `tests/mcp-bridge-topology.test.js:1461-1528`

If `run.emit` throws on a post-start `delegation.event`, `consumeEvents()` preserves `Error('route_lost')` in `parserError`, but every later check hardcodes `agent_protocol_drift`; the terminal code is therefore false. The only emitter-error test throws on the first `delegation.started` call and never covers the active-event branch. More importantly, topology loss normally removes the bridge route and makes later emits no-ops rather than throws, so the supervisor receives no abort signal and the CLI can continue running after the authenticated extension/hub correlation is gone. The topology tests currently assert only that late frames cannot reach the closed socket, not that the delegated process is cancelled.

**Required fix:** make route lifetime observable/cancellable by the supervisor (for example, an abort signal on the handler context), terminate the tree when that signal fires, and preserve `route_lost` rather than rewriting it as provider drift. Test both a throwing active emitter and real local/relayed socket loss after `delegation.started`, with one tree stop, one non-success settlement, no replay, and no continuing task authority.

### WR-03 — Stdin error coverage ends before EOF delivery is safely settled

**Files:** `mcp/src/agent-providers/spawn-supervisor.ts:817-857`, `tests/mcp-spawn-supervisor.test.js:73-129`, `tests/mcp-spawn-supervisor.test.js:541-553`

`writeTask()` removes its stdin error listener and resolves as soon as the write callback/drain pair completes, then calls `stdin.end()` outside that protected promise without an end callback or `finish`/`close` observation. If the child closes the pipe after the write callback but before/during `end()`, a later EPIPE/error has no owned listener and can become an uncaught stream error; cancellation can also settle while this detached write continuation is still pending. Current tests cover write-callback failure and ordinary high-water backpressure, but not close-after-write/before-EOF or cancellation during backpressure.

**Required fix:** keep error/close listeners installed through `end`, await the end callback plus `finished()`/a deliberately classified close outcome, and join this promise during cancellation. Add deterministic close-before-end, error-after-write-callback, no-drain, and cancel-during-backpressure cases.

### WR-04 — The full-suite harness can report workspace preservation after changing user bytes

**File:** `scripts/run-phase60-full-tests.mjs:38-53`, `scripts/run-phase60-full-tests.mjs:143-165`

The final check only requires each original `git status --short` line to remain present and the staged *path list* to be identical. It does not detect changed contents of an already-dirty file, altered staged bytes under the same path, or new dirty/untracked paths. A test can therefore overwrite a user-modified file while retaining the same short-status line—or modify the index entry for an already-staged path—and the harness still prints that workspace state was preserved.

**Required fix:** capture and compare content-safe fingerprints/diffs for the index, every pre-existing tracked dirty path, and untracked entries (without restoring anything), and reject unexpected new final paths. Add an injected child command/test seam that mutates an already-dirty file and staged bytes under an existing staged name, proving the harness exits nonzero while still cleaning only its own compatibility symlink.

## Verification

- `git diff --check 7ee3b7e4^..HEAD -- <Phase 60 scope>` — passed
- `node tests/mcp-agent-provider-contract.test.js` — passed
- `node tests/mcp-claude-code-adapter.test.js` — passed
- `node tests/mcp-agent-stream-fixture.test.js` — passed (`CLAUDE-03` provenance remains `human_needed`)
- `node tests/mcp-spawn-supervisor.test.js` — passed
- `node tests/mcp-agent-orphan-recovery.test.js` — passed
- `node tests/mcp-reverse-channel-contract.test.js` — passed
- `node tests/mcp-bridge-topology.test.js` — 238 passed, 0 failed
- `node tests/mcp-client-inventory.test.js` — passed

Passing tests do not cover the interleavings and preservation blind spots above. The full root suite was not rerun during this review because the dedicated harness itself is one of the reviewed findings and the workspace contains substantial pre-existing dirty/deleted state.

## Reviewed Scope

Reviewed all 24 requested files from `7ee3b7e4^..HEAD`, including the adapter/registry/detection/profile contract, static FSB policy, stream normalizer and fixture, runtime files, POSIX/Windows process inspection and termination, exact-once supervisor, serve lifecycle, reverse-channel/topology/inventory regression tests, root test wiring, and the workspace-preserving full-suite harness.
