---
phase: 65-codex-adapter
status: all_fixed
findings_in_scope: 2
fixed: 2
skipped: 0
finding_ids: [CR-01, W-01]
iteration: 2
---

# Phase 65 Code Review Fix Report

**Fixed at:** 2026-07-22T17:22:31Z  
**Source review:** `.planning/phases/65-codex-adapter/65-REVIEW.md`  
**Iteration:** 2

Both iteration-2 findings were fixed. No finding was skipped. The already-closed
W-02 finding was preserved and is not counted in this iteration.

## Fixed Issues

### CR-01 — App-server stdin closed before `config/read` completed

**Status:** fixed  
**Commit:** `42420ba0` (`fix(65): await Codex config response before EOF`)  
**Files modified:** `mcp/src/agent-providers/adapter.ts`,
`mcp/src/agent-providers/codex-profile.ts`,
`mcp/src/agent-providers/effective-authority.ts`,
`mcp/src/agent-providers/process-probe.ts`,
`mcp/src/agent-providers/spawn-supervisor.ts`,
`tests/mcp-codex-adapter.test.js`, and
`tests/mcp-spawn-supervisor.test.js`

The bounded probe can now keep stdin open after writing the fixed request and
close it only after observing a complete newline-terminated stdout line with
the exact validated response prefix `{"id":2,"result":`. Prefix matching is
byte-based, works across chunk boundaries, and remains subject to the existing
time, byte, abort, channel, tree-settlement, ownership, and zeroization bounds.
The Codex attestation descriptor requires that exact response trigger.

The native classifier now accepts exactly three JSONL messages in protocol
order: the id-1 initialize response, the
`remoteControl/status/changed` notification, and the id-2 `config/read`
response. It still derives and validates the complete enabled MCP roster and
all existing endpoint, `required`, tool-order, approval, enabled-state, and
secret-absence constraints from observed evidence. Task overrides, retained
binary, scratch directory, direct endpoint, and sanitized environment remain
reused unchanged.

A faithful hermetic pinned-0.142.5 native-protocol regression demonstrates the
transport lifecycle: immediate EOF produces `[1, null]` and fails closed;
response-driven EOF produces `[1, null, 2]`, validates the full roster, then
settles the root and same-group descendant. Its observed operation roster is
limited to initialize, initialized, and config-read; it performs no model,
login, browser, or task operation. Negatives cover missing/reordered/foreign or
extra messages, malformed config/read JSON, early nonzero exit, timeout, abort,
stdin/stream/spawn failure, channel overflow, and chunk-split response matching.
Supervisor tests prove rejected evidence blocks before prepare, task spawn,
event emission, and task stdin while retaining zeroization and tree settlement.

### W-01 — Successful probes did not settle detached descendants

**Status:** fixed  
**Commit:** `067464a3` (`fix(65): settle successful probe trees`)  
**Files modified:** `mcp/src/agent-providers/process-probe.ts`,
`mcp/src/agent-providers/process-tree.ts`, and
`tests/mcp-codex-adapter.test.js`

Every successful child close now enters asynchronous complete-tree settlement
before output aggregation or resolution. A settlement failure erases all owned
chunks and rejects with the closed `tree_unsettled` error. Returned buffer
ownership and idempotent caller zeroization remain unchanged. POSIX settlement
also avoids an unnecessary wait when the initial group signal already proves
the process group absent.

Coverage includes a real POSIX root that exits 0 while leaving a same-group
long-lived descendant: a controlled gate proves the probe remains unresolved
until settlement, both PIDs are absent afterward, and the descendant's delayed
marker is never written. Supported Windows `/T /F` tree semantics receive an
equivalent successful-root/descendant test. A failed success-path absence proof
returns `tree_unsettled` and erases the retained exact source buffer.

## Automated Verification

- Focused preservation-wrapped Codex adapter and spawn-supervisor suites passed.
- `tests/runtime-contracts.test.js` passed 29/29.
- `tests/agent-provider-forbidden-flags.test.js` passed.
- `node tests/phase65-full-tests-harness.test.js` passed.
- `node scripts/run-phase65-full-tests.mjs` passed the complete focused,
  extension, and guarded root matrices.
- The full runner finished with both workspace-preservation checks reporting
  `PASS`.
- The pre-existing 402 planning-file deletions remain exactly 402, no file is
  staged, and the four protected generated files retain their required SHA-256
  identities.

The genuine authenticated Codex and browser scenarios remain honestly pending
as human UAT in `65-HUMAN-UAT.md`; they are not code-review findings.

---

_Fixed: 2026-07-22T17:22:31Z_  
_Fixer: Codex (`gsd-code-review` / `gsd-autonomous`)_  
_Iteration: 2_
