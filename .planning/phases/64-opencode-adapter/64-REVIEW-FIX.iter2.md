---
phase: 64
fixed_at: 2026-07-21T12:43:49Z
review_path: .planning/phases/64-opencode-adapter/64-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 64: Code Review Fix Report

**Fixed at:** 2026-07-21T12:43:49Z
**Source review:** `.planning/phases/64-opencode-adapter/64-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: The production supervisor cannot construct or materialize an OpenCode runtime

**Status:** fixed: requires human verification
**Files modified:** `mcp/src/agent-providers/adapter.ts`, `mcp/src/agent-providers/opencode-profile.ts`, `mcp/src/agent-providers/opencode.ts`, `mcp/src/agent-providers/runtime-files.ts`, `mcp/src/agent-providers/spawn-supervisor.ts`, `tests/mcp-agent-orphan-recovery.test.js`, `tests/mcp-opencode-server-topology.test.js`
**Commit:** `9935b7ce`
**Applied fix:** Extended the closed spawn declaration with role-scoped private runtimes. The production supervisor now mints exact delegation, provider-server, and policy-preflight runtime graphs; resolves OpenCode profiles against those identities; materializes their config/test-home/managed-config artifacts before policy checks or child spawn; journals each role under the same runtime id used by its paths; and removes each graph in lifecycle order. A real production-composition regression uses the production registry and `AgentRuntimeFiles`, with only process/network seams, to prove cold execution, warm attach, preflight ordering, identity alignment, and complete cleanup.

### WR-01: Real OpenCode result token counts are dropped before persistence and UI projection

**Status:** fixed: requires human verification
**Files modified:** `extension/utils/delegation-event-store.js`, `tests/delegation-controller.test.js`, `tests/delegation-event-store.test.js`, `tests/fixtures/delegation-events.js`
**Commit:** `20208cb1`
**Applied fix:** The event store now projects the normalized OpenCode `payload.tokens` fields whenever Claude-style `usage` fields are absent. The hostile fixture uses the genuine OpenCode result shape, and an integration regression feeds actual `parseOpenCodeEvents` output from the pinned 1.14.25 stream fixture through persistence and controller projection, retaining 18 input, 11 output, and 29 total tokens.

### WR-02: The spawn environment still inherits provider credentials that OpenCode can use as an API-key fallback

**Status:** fixed: requires human verification
**Files modified:** `mcp/src/agent-providers/spawn-supervisor.ts`, `tests/mcp-opencode-server-topology.test.js`
**Commit:** `5dd6e120`
**Applied fix:** Replaced the three-key scrub with a deterministic 142-name credential/discovery boundary source-pinned to OpenCode v1.14.25 tag commit `3c85719fea0ee83389c814d7abbf1f98c5c6f0f1`. It covers the upstream models roster, custom provider reads, OpenCode auth/config/model injection, AWS credential-chain discovery, and Google ADC aliases while retaining operational `PATH`, `HOME`, and XDG data/state/cache variables for native sign-in. Poison canaries prove every denied variable is absent from process preflights, the owned server, the cold task, and the warm attach task.

### WR-03: Detached policy-preflight process groups are not durably recoverable after a daemon crash

**Status:** fixed: requires human verification
**Files modified:** `mcp/src/agent-providers/runtime-files.ts`, `mcp/src/agent-providers/spawn-supervisor.ts`, `tests/mcp-agent-orphan-recovery.test.js`, `tests/mcp-opencode-server-topology.test.js`
**Commits:** `9935b7ce`, `122bdd1c`
**Applied fix:** Process-json policy probes now own distinct `policy_preflight` runtime identities and use durable prepare, spawn, activate, terminate, and remove transitions. Startup recovery treats them as infrastructure, confirms and terminates surviving trees, removes their private runtime graphs, and emits no false delegation restart-loss disposition. Real runtime-file crash-window regressions cover both a confirmed process with only a prepared journal and an active preflight journal.

## Automated Verification

- `node tests/mcp-opencode-server-topology.test.js --section production-composition` through the MCP build-preservation wrapper — passed
- `node tests/mcp-agent-orphan-recovery.test.js` through the MCP build-preservation wrapper — passed
- `node scripts/run-phase64-full-tests.mjs` — passed all 25 focused Phase 64 commands; the guarded build wrapper confirmed workspace identity preservation
- Included suites passed for the adapter, production topology, provider contract, spawn supervisor, orphan recovery, event store (34/34), and delegation controller (41/41)
- Phase 64 contract validation passed 106/106 assertions

The deferred genuine authenticated OpenCode-to-browser and other human UAT cases were not run; they remain queued in the Phase 64 milestone-end UAT ledger.

---

_Fixed: 2026-07-21T12:43:49Z_
_Fixer: Codex (`gsd-code-fixer`)_
_Iteration: 1_
