---
phase: 64-opencode-adapter
reviewed: 2026-07-21T12:52:02Z
depth: standard
files_reviewed: 66
files_reviewed_list:
  - .github/workflows/ci.yml
  - extension/background.js
  - extension/ui/control_panel.html
  - extension/ui/delegation-feed.js
  - extension/ui/options.js
  - extension/ui/providers-panel.js
  - extension/ui/sidepanel.html
  - extension/ui/sidepanel.js
  - extension/utils/agent-protocol-drift-diagnostics.js
  - extension/utils/delegation-consent.js
  - extension/utils/delegation-controller.js
  - extension/utils/delegation-event-store.js
  - extension/utils/delegation-preflight.js
  - extension/utils/delegation-providers.js
  - extension/utils/mcp-agent-providers.js
  - mcp/src/agent-providers/adapter.ts
  - mcp/src/agent-providers/claude-stream.ts
  - mcp/src/agent-providers/compatibility.ts
  - mcp/src/agent-providers/opencode-detect.ts
  - mcp/src/agent-providers/opencode-profile.ts
  - mcp/src/agent-providers/opencode-stream.ts
  - mcp/src/agent-providers/opencode.ts
  - mcp/src/agent-providers/policy-attestation.ts
  - mcp/src/agent-providers/protocol-drift.ts
  - mcp/src/agent-providers/registry.ts
  - mcp/src/agent-providers/runtime-files.ts
  - mcp/src/agent-providers/serve-delegation.ts
  - mcp/src/agent-providers/spawn-supervisor.ts
  - mcp/src/client-inventory.ts
  - mcp/src/diagnostics.ts
  - scripts/run-phase64-full-tests.mjs
  - tests/agent-protocol-drift-diagnostics.test.js
  - tests/agent-provider-forbidden-flags.test.js
  - tests/delegation-consent.test.js
  - tests/delegation-controller.test.js
  - tests/delegation-event-store.test.js
  - tests/delegation-phase-contract.test.js
  - tests/delegation-routing.test.js
  - tests/delegation-sidepanel-ui.test.js
  - tests/fixtures/agent-streams/opencode-1.14.25/contract-stream.jsonl
  - tests/fixtures/agent-streams/opencode-1.14.25/manifest.json
  - tests/fixtures/delegation-events.js
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/mcp-adapter-compatibility.test.js
  - tests/mcp-agent-drift-smoke.test.js
  - tests/mcp-agent-orphan-recovery.test.js
  - tests/mcp-agent-provider-contract.test.js
  - tests/mcp-agent-providers-storage.test.js
  - tests/mcp-agent-stream-fixture.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-bridge-topology.test.js
  - tests/mcp-claude-code-adapter.test.js
  - tests/mcp-client-identity-integration.test.js
  - tests/mcp-client-identity.test.js
  - tests/mcp-client-inventory.test.js
  - tests/mcp-client-merged-view.test.js
  - tests/mcp-diagnostics-status.test.js
  - tests/mcp-opencode-adapter.test.js
  - tests/mcp-opencode-server-topology.test.js
  - tests/mcp-reverse-channel-contract.test.js
  - tests/mcp-spawn-supervisor.test.js
  - tests/mcp-version-parity.test.js
  - tests/phase64-full-tests-harness.test.js
  - tests/provider-parity.test.js
  - tests/providers-panel-logic.test.js
  - tests/providers-panel-ui.test.js
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 64: Code Review Report

**Reviewed:** 2026-07-21T12:52:02Z

**Depth:** standard

**Files Reviewed:** 66

**Status:** clean

## Summary

The iteration-2 standard-depth review is clean at implementation HEAD `122bdd1c`. The exact original 66-file Phase 64 scope was re-reviewed against the phase context, research, validation, UI, security, and deferred-UAT contracts. The review concentrated additional call-chain analysis on the four iteration-1 fixes in commits `9935b7ce`, `20208cb1`, `5dd6e120`, and `122bdd1c`, including their production composition and lifecycle behavior rather than relying only on the added tests.

CR-01 and WR-01/02/03 are genuinely resolved. Role-scoped OpenCode config graphs are materialized under the journal identity for each delegation, owned server, and policy probe before the corresponding process starts. Native OpenCode token metrics survive parser-to-store projection. The pinned provider credential/discovery roster is absent from process preflights, owned-server, cold-task, and attach-task environments while operational and native-sign-in roots remain available. Detached policy probes now have durable prepared/active journal states and startup recovery without false delegation restart-loss records.

No Critical, Warning, or Info findings remain. No regression introduced by the fixes was found.

## Narrative Findings (AI reviewer)

None.

## Fixed-Finding Disposition

| Original finding | Disposition |
|---|---|
| CR-01 — production runtime composition | **Closed.** The five-method adapter returns closed role-scoped declarations; production supplies exact role runtimes; real `AgentRuntimeFiles` prepares the three required artifacts before preflight/server/task spawn; task and server identities align with their journal paths; cold, warm attach, and cleanup are exercised through the production registry. |
| WR-01 — OpenCode token persistence | **Closed.** The event store falls back from Claude-style `usage` to normalized OpenCode `tokens`, and the pinned parser fixture persists 18 input, 11 output, and 29 total tokens through the durable projection. |
| WR-02 — inherited provider credentials | **Closed.** The deterministic 142-name OpenCode 1.14.25 credential/discovery boundary is source-pinned and scrubbed before every child role; poison canaries cover the full roster across process probes, server, cold, and attach calls while `PATH`, `HOME`, and XDG data/state/cache roots remain available. |
| WR-03 — preflight crash recovery | **Closed.** Policy probes prepare a distinct `policy_preflight` runtime before spawn, activate it after process identity is confirmed, remove it only after tree settlement, and recover both prepared and active crash windows as infrastructure without emitting a lost-delegation disposition. |

## Verification Context

- `git diff --check 00d1090a..122bdd1c` passed for the implementation/test files changed by the four fixes.
- `node scripts/run-phase64-full-tests.mjs` passed with exit code 0 and both preservation markers. It rebuilt the MCP package through the guarded wrapper, ran the 25-command Phase 64 matrix, and preserved the pre-existing workspace identity.
- The focused matrix included the real production-registry/`AgentRuntimeFiles` OpenCode composition, adapter/profile contracts, owned-server topology, supervisor, orphan recovery, stream fixture, compatibility, reverse channel, browser routing, event store (34/34), controller (41/41), Providers UI, side-panel UI, forbidden-source gates, and Phase 64 closure contract (106/106).
- The authenticated OpenCode-to-browser, live Providers accessibility, and genuine cold-versus-attach scenarios remain honestly `human_needed` in `64-HUMAN-UAT.md`; no synthetic test was treated as live provenance.
- The existing 402 user-owned planning deletions, four unrelated modified generated files, and three orchestrator-owned untracked review/fix snapshots were left untouched. Only this review artifact was updated, and no commit was created.

---

_Reviewed: 2026-07-21T12:52:02Z_

_Reviewer: Codex (`gsd-code-reviewer`)_

_Depth: standard_
