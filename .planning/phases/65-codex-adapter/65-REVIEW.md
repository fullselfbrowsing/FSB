---
phase: 65-codex-adapter
reviewed: "2026-07-22T16:06:24Z"
depth: standard
files_reviewed: 53
files_reviewed_list:
  - .github/workflows/ci.yml
  - extension/background.js
  - extension/ui/delegation-feed.js
  - extension/ui/options.js
  - extension/ui/providers-panel.js
  - extension/ui/sidepanel.css
  - extension/ui/sidepanel.js
  - extension/utils/delegation-consent.js
  - extension/utils/delegation-controller.js
  - extension/utils/delegation-event-store.js
  - extension/utils/delegation-preflight.js
  - extension/utils/delegation-providers.js
  - extension/utils/mcp-agent-providers.js
  - mcp/src/agent-providers/accepted-identity.ts
  - mcp/src/agent-providers/adapter.ts
  - mcp/src/agent-providers/codex-detect.ts
  - mcp/src/agent-providers/codex-profile.ts
  - mcp/src/agent-providers/codex-stream.ts
  - mcp/src/agent-providers/codex.ts
  - mcp/src/agent-providers/compatibility.ts
  - mcp/src/agent-providers/effective-authority.ts
  - mcp/src/agent-providers/process-probe.ts
  - mcp/src/agent-providers/registry.ts
  - mcp/src/agent-providers/runtime-files.ts
  - mcp/src/agent-providers/serve-delegation.ts
  - mcp/src/agent-providers/spawn-environment.ts
  - mcp/src/agent-providers/spawn-supervisor.ts
  - mcp/src/client-inventory.ts
  - mcp/src/diagnostics.ts
  - scripts/run-mcp-build-preserving-workspace.mjs
  - scripts/run-phase64-full-tests.mjs
  - scripts/run-phase65-full-tests.mjs
  - tests/agent-provider-forbidden-flags.test.js
  - tests/delegation-consent.test.js
  - tests/delegation-controller.test.js
  - tests/delegation-event-store.test.js
  - tests/delegation-phase-contract.test.js
  - tests/delegation-routing.test.js
  - tests/delegation-sidepanel-ui.test.js
  - tests/fixtures/agent-streams/codex-0.142.5/contract-stream.jsonl
  - tests/fixtures/agent-streams/codex-0.142.5/expected-events.json
  - tests/fixtures/agent-streams/codex-0.142.5/manifest.json
  - tests/fixtures/agent-streams/codex-0.142.5/native-negative-corpus.json
  - tests/mcp-agent-orphan-recovery.test.js
  - tests/mcp-agent-providers-storage.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-codex-adapter.test.js
  - tests/mcp-spawn-supervisor.test.js
  - tests/phase64-full-tests-harness.test.js
  - tests/phase65-full-tests-harness.test.js
  - tests/provider-parity.test.js
  - tests/providers-panel-ui.test.js
  - tests/runtime-contracts.test.js
findings:
  critical: 1
  warning: 2
  info: 0
  total: 3
status: issues_found
---

# Phase 65 Code Review

Phase 65 is not ready to ship. The Codex pre-spawn barrier does not prove the complete effective MCP authority it claims to prove, leaving the critical foreign-MCP boundary open. The bounded process primitive also has two cleanup defects that should be corrected while repairing that barrier.

The three entries in `65-HUMAN-UAT.md` are intentionally `human_needed` / `pending` with empty evidence. They are not review findings and were not counted above.

## Critical

### CR-01 — The Codex authority probe cannot observe the complete effective MCP roster

**Evidence**

- `mcp/src/agent-providers/codex-profile.ts:368-377` builds the native inspection command as `codex mcp ... get fsb --json`. This retrieves one named server; it does not enumerate the complete effective server roster.
- `mcp/src/agent-providers/effective-authority.ts:573-580` requires that same `get fsb --json` suffix, preventing the descriptor from using a complete-roster probe.
- `mcp/src/agent-providers/effective-authority.ts:726-769` parses only one server object, then assigns `serverCountMatches = true` at line 757, `requiredMatches = true` at line 760, and `approvalPolicyMatches = true` at line 766 without reading evidence for any of those properties.
- `tests/mcp-codex-adapter.test.js:661-695` tests only a single native `fsb` object and mutations of fields that object actually contains. The two-server negative at `tests/mcp-codex-adapter.test.js:371-376` exercises the separate generic `effective_authority_json` classifier, not the production `codex_effective_authority_json` path.

**Impact**

Codex configuration tables merge recursively across retained system, enterprise, cloud, legacy-managed, and admin layers. The `mcp_servers={}` runtime value therefore cannot remove an unknown lower-layer server name. With such a server present, `mcp get fsb` can still return the expected `fsb` object and the classifier passes because roster cardinality is hardcoded. The task child can then invoke the foreign server before parser-time rejection, so post-hoc JSONL filtering is not a prevention boundary. The same classifier also reports `required` and server-local approval as proven even though the native response never supplied them. This defeats the T65-04/T65-05 pre-spawn mitigation and is ship-blocking.

**Required fix**

Use a pinned native/effective-config inspection that enumerates every enabled MCP server under the exact task overrides and sanitized environment. Require exactly one enabled entry named `fsb`. If roster output lacks the endpoint, enabled tools, `required`, approval mode, or secret-bearing transport fields, pair it with a second detail/effective-config proof; do not synthesize successful booleans for absent evidence. If pinned Codex cannot expose layer-equivalent effective state, block execution rather than treating command-line intent as attestation.

**Regression expectations**

- Exercise the production `codex_effective_authority_json` classifier/barrier with a native-shaped effective roster containing valid `fsb` plus a managed `foreign` server; assert failure before `prepareRun`, task child creation, or task stdin.
- Add native-path negatives for missing/false `required` and non-`approve` local approval, plus duplicate/disabled/ambiguous server rows and secret-bearing header/env/bearer material.
- Add a source/descriptor assertion that the production probe enumerates the roster and that no asserted equality field is initialized to unconditional `true`.

## Warnings

### W-01 — Probe failures reject before the probe process tree is settled

**Evidence**

- `mcp/src/agent-providers/process-probe.ts:207-213` spawns the probe without a detached process group or another descendant-ownership mechanism.
- `mcp/src/agent-providers/process-probe.ts:180-185` sends `SIGKILL` only to the immediate `ChildProcess`.
- `mcp/src/agent-providers/process-probe.ts:240-247` removes the `close` listener, kills the immediate child, and rejects immediately; it neither awaits child close nor checks/terminates descendants.
- The timeout, abort, and overflow cases in `tests/mcp-codex-adapter.test.js:119-172` assert only the returned error code. They do not create a descendant or prove process settlement after rejection.

**Impact**

A timed-out, aborted, or overflowing retained binary can leave a descendant alive after the supervisor considers the pre-spawn operation finished. Although the task child is then blocked, the orphan can retain inherited authentication/configuration access, keep pipes or files open, or outlive daemon shutdown. That undercuts the process-ownership guarantees used elsewhere for delegated task children.

**Required fix**

Give each probe an owned process group/job, terminate the complete tree on every failure path, and do not resolve or reject until the immediate child is closed and descendant absence is confirmed. Reuse the supervisor's platform-specific tree termination/inspection substrate where practical.

**Regression expectations**

- For timeout, abort, stdout overflow, and stderr overflow, run a fixture that creates a long-lived descendant and records both PIDs outside the process tree.
- After the probe promise rejects, assert the parent and descendant are both gone and cannot perform a delayed marker write.
- Cover POSIX process groups and the supported Windows termination mechanism separately.

### W-02 — Secret-bearing source chunks are copied but never zeroized

**Evidence**

- `mcp/src/agent-providers/process-probe.ts:250-269` receives each raw `Buffer`, creates `Buffer.from(value)`, and stores only the copy. The original `value` is never erased.
- `mcp/src/agent-providers/process-probe.ts:240-246` and `mcp/src/agent-providers/process-probe.ts:288-317` zero the stored copies and returned aggregate buffers, but cannot reach the original stream chunks after the handler returns.
- `tests/mcp-codex-adapter.test.js:88-110` verifies only the returned aggregate buffers. It does not retain emitted source chunks and check that those buffers were erased on success or failure.

**Impact**

`codex login status` can place masked API-key fragments in stderr. Even after the result and copied chunks are zeroized, the original Node stream buffers retain those bytes until garbage collection. This violates the phase's explicit every-chunk/aggregate zeroization contract and leaves avoidable credential residue in daemon memory.

**Required fix**

Either take ownership of each emitted `Buffer` and zero that exact buffer after aggregation, or copy it and erase the source buffer in a `finally` block immediately after the copy is accepted/rejected. Preserve the existing aggregate-result ownership and idempotent `zeroize()` behavior.

**Regression expectations**

- Add an injectable collector/spawn seam whose readable emits retained canary buffers; assert the exact source buffers are all zero after successful close.
- Repeat for timeout, abort, malformed/overflow, and spawn/stream failure paths, while also asserting the returned aggregate is zero after `zeroize()`.

## Review notes

- Review scope was the 53 files listed in the frontmatter, with cross-file tracing through the consent-to-supervisor start path, effective-authority barrier, parser/terminal settlement, safe compatibility projection, and test runners.
- The unrelated planning deletions and the four pre-existing dirty generated artifacts were excluded from findings and were not modified.
- No source files were edited and no commit was created. This review did not rerun the already-recorded green matrix because the requested task was static review and the workspace contains user-owned dirty state.
