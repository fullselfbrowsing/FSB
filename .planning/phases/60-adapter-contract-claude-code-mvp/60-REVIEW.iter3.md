---
phase: 60-adapter-contract-claude-code-mvp
reviewed: 2026-07-14T19:02:12Z
depth: deep
files_reviewed: 27
files_reviewed_list:
  - mcp/ai/agents/fsb.json
  - mcp/src/agent-providers/adapter.ts
  - mcp/src/agent-providers/claude-code.ts
  - mcp/src/agent-providers/claude-detect.ts
  - mcp/src/agent-providers/claude-profile.ts
  - mcp/src/agent-providers/claude-stream.ts
  - mcp/src/agent-providers/process-tree.ts
  - mcp/src/agent-providers/registry.ts
  - mcp/src/agent-providers/runtime-files.ts
  - mcp/src/agent-providers/serve-delegation.ts
  - mcp/src/agent-providers/spawn-supervisor.ts
  - mcp/src/bridge.ts
  - mcp/src/index.ts
  - mcp/src/types.ts
  - package.json
  - scripts/run-phase60-full-tests.mjs
  - tests/fixtures/agent-streams/claude-code-2.1.177/contract-stream.jsonl
  - tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json
  - tests/mcp-agent-orphan-recovery.test.js
  - tests/mcp-agent-provider-contract.test.js
  - tests/mcp-agent-stream-fixture.test.js
  - tests/mcp-bridge-topology.test.js
  - tests/mcp-claude-code-adapter.test.js
  - tests/mcp-client-inventory.test.js
  - tests/mcp-reverse-channel-contract.test.js
  - tests/mcp-spawn-supervisor.test.js
  - tests/phase60-full-tests-harness.test.js
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-07-14T19:02:12Z
**Depth:** deep
**Files Reviewed:** 27
**Status:** issues_found

## Summary

The degradation latch and serve shutdown callback, setup-mutation join barrier, stdin EOF/backpressure ownership, and content-safe full-suite workspace fingerprints are sound under the reviewed interleavings. Local, relayed-origin, and hub-loss abort propagation also reaches the supervisor without changing Phase 59's exact five transport errors.

One route-lifetime race remains. If route loss arrives after `executeRun()` has entered verified cleanup, the execution continuation can settle success or its earlier domain failure before `cancelLifecycle()` gets to settle `route_lost`. A deterministic held-cleanup probe reproduces the incorrect success result. No live/authenticated/OS/browser UAT or full root suite was run.

## Warnings

### WR-01: Route loss during final cleanup can lose exact-once terminal precedence

**Files:** `mcp/src/agent-providers/spawn-supervisor.ts:651-677`, `mcp/src/agent-providers/spawn-supervisor.ts:986-1025`, `tests/mcp-spawn-supervisor.test.js:691-711`

**Issue:** `executeRun()` checks `run.stopRequested` before choosing its result, but both result branches then await `terminateAndCleanup()` and settle without checking again. Its catch branch has the same gap after cleanup. If the route aborts while that cleanup promise is pending, `cancelRun()` sets `stopRequested = true` and starts `cancelLifecycle()`, but both paths await the same termination promise. The execution path registered its continuation first, so it resumes first and wins `settleOnce()` with `succeeded`, an error-result terminal, or the pre-existing failure code; the later route cancellation cannot replace it with `route_lost`.

A deterministic probe held `runtimeFiles.removeRun()` during a successful run, aborted the supplied route signal, then released cleanup. The current implementation returned:

```json
{"status":"succeeded","terminal":{"type":"result","sessionId":"s","payload":{"is_error":false}}}
```

This violates the repaired contract that loss of an active correlation yields one non-success route-lost settlement. The process tree is already being cleaned, so this is not continuing spawn authority and is classified as a warning rather than a critical issue.

**Fix:** Immediately after every awaited `terminateAndCleanup()` and before any success/domain-failure `settleOnce()`, re-check `run.stopRequested` and return so the already-started `cancelLifecycle()` owns terminal settlement. Preserve degradation precedence when cleanup itself fails. Add held-terminator or held-`removeRun` regressions covering route abort during cleanup for a successful result, an `is_error` result, and a catch-path failure such as `process_exit` or protocol drift; each must stop/clean once and settle only as `route_lost`.

## Remedy Validation

- Supervisor degradation is one-way, rejects later starts, invokes the serve callback once, and shares the existing orderly nonzero shutdown promise across callback/signal races.
- Cancellation waits for held `buildSpawn`, `prepareRun`, `resolveActivation`, and `activateRun` work, then removes runtime/journal/PID-map state before settlement.
- Bridge-owned AbortSignals cover local extension loss, relayed origin loss, and hub/relay loss without expanding `ExtError`; the remaining defect is only the final-cleanup precedence race above.
- `writeTask()` owns write callback, drain, end callback, finish, close, and error settlement; cancellation joins backpressured stdin via child/tree closure.
- The full-suite harness fingerprints logical index entries, dirty tracked bytes, untracked paths/bytes, and the complete status set. Its isolated negative regression mutates all three classes and verifies nonzero detection without restoration.

## Verification

- `./mcp/node_modules/.bin/tsc -p mcp/tsconfig.json --noEmit` — passed
- `node tests/mcp-spawn-supervisor.test.js` — passed
- `node tests/mcp-bridge-topology.test.js` — 254 passed, 0 failed
- `node tests/mcp-reverse-channel-contract.test.js` — passed; exact five transport errors retained
- `node tests/phase60-full-tests-harness.test.js` — passed
- `node tests/mcp-agent-provider-contract.test.js` — passed
- `node tests/mcp-claude-code-adapter.test.js` — passed
- `node tests/mcp-agent-stream-fixture.test.js` — passed; recorded provenance remains `human_needed`
- `node tests/mcp-agent-orphan-recovery.test.js` — passed
- `node tests/mcp-client-inventory.test.js` — passed
- `git diff --check 7ee3b7e4^..3f594593 -- <Phase 60 source scope>` — passed
- Deterministic route-abort-during-`removeRun` probe — failed as described in WR-01

---

_Reviewed: 2026-07-14T19:02:12Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
