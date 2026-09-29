---
phase: 65-codex-adapter
reviewed: "2026-07-22T17:30:04Z"
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
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 65 Code Review

Phase 65 passes the final standard-depth code re-review. All findings from the
original review and iteration 2 are closed. No evidence-backed Critical,
Warning, or Info finding remains in the 53-file review scope.

The three entries in `65-HUMAN-UAT.md` intentionally remain `human_needed` /
`pending` with empty evidence. They are not code-review findings and were not
counted above.

## Closure evidence

- **Complete effective authority:**
  `mcp/src/agent-providers/effective-authority.ts:871-1045` accepts only the
  exact pinned initialize/status/config-read sequence, enumerates the complete
  enabled `mcp_servers` roster, requires the sole enabled row to be `fsb`, and
  derives endpoint, `required`, `enabled`, ordered tool allowlist, approval,
  header, environment, bearer-token, local-environment, and timeout checks from
  observed `config/read` evidence. No successful equality is hard-coded.
  Disabled inherited rows carry no authority; every enabled foreign or
  ambiguous row fails closed.
- **Exact pinned app-server lifecycle:**
  `mcp/src/agent-providers/codex-profile.ts:370-426` emits only initialize,
  initialized, and id-2 `config/read`, with `app-server --stdio
  --strict-config`. `mcp/src/agent-providers/process-probe.ts:351-379` keeps
  stdin open until a complete newline-terminated id-2 result line is observed,
  including across chunk boundaries, and only then closes stdin. The strict
  classifier rejects missing, reordered, malformed, extra, foreign, error, or
  incomplete messages. The authority operation roster contains no model,
  login, browser, or task operation; the separate identity probe remains the
  approved read-only `login status` check.
- **Pre-spawn fail-closed ordering:**
  `mcp/src/agent-providers/spawn-supervisor.ts:2178-2289` reuses the retained
  command, exact task overrides, direct endpoint, task scratch directory, and
  exact sanitized environment. Identity and authority must both pass before
  runtime preparation at lines 1301-1339, task-child creation, event emission,
  or task stdin. Probe, parse, exit, signal, stderr, roster, and identity
  failures reduce to bounded `adapter_unavailable` behavior with no raw detail.
- **Complete process-tree settlement:**
  `mcp/src/agent-providers/process-probe.ts:323-349` settles the detached tree
  before every failure rejection, while lines 417-483 settle it before every
  successful resolution or return `tree_unsettled`. The Linux/macOS production
  paths terminate and verify the complete detached process group. Windows is
  not an enabled production delegation platform
  (`spawn-supervisor.ts:1061-1062`); its shared helper uses native `/T /F`
  semantics and fails closed when settlement cannot be proved, so it is an
  unsupported-platform note rather than an in-scope finding. Real POSIX
  success, timeout, abort, stdout-overflow, and
  stderr-overflow descendant fixtures prove neither root nor descendant can
  outlive the promise.
- **Exact zeroization:**
  `mcp/src/agent-providers/process-probe.ts:381-407` copies bounded channel
  bytes and erases the exact emitted source buffer in `finally`. Every failure
  erases retained copies; successful aggregation erases copies and transfers
  only independent owned aggregates, whose idempotent `zeroize()` erases both
  channels. Tree-settlement and aggregation failures preserve the same rule.
- **No cross-layer regression:** The five review-fix commits modify only the
  authority/probe/supervisor core and focused tests. The accepted five-field
  identity remains exact through compatibility, preflight, consent, start,
  runtime/event storage, reconciliation, feed, and billing presentation. No
  model/profile picker, login mutation, browser operation, Codex-specific UI
  renderer, visible Profile row, or USD estimate was introduced.

## Verification

- Inspected fix commits `a35b4ddc`, `a804277f`, `1528190c`, `067464a3`, and
  `42420ba0`; all pass `git show --check`.
- Preservation-wrapped `tests/mcp-codex-adapter.test.js` passed.
- Preservation-wrapped `tests/mcp-spawn-supervisor.test.js` passed.
- The iteration-2 fixer also recorded a green Phase 65 harness and exact full
  runner with both workspace-preservation checks passing.
- The unrelated planning deletions, protected generated artifacts, staging
  state, and three pending human-UAT rows were preserved.

No source file was edited and no commit was created by this re-review.
