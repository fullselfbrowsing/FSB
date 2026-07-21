---
phase: 64-opencode-adapter
reviewed: 2026-07-21T12:08:42Z
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
  critical: 1
  warning: 3
  info: 0
  total: 4
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-07-21T12:08:42Z

**Depth:** standard

**Files Reviewed:** 66

**Status:** issues found

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: The production supervisor cannot construct or materialize an OpenCode runtime

**File:** `mcp/src/agent-providers/opencode.ts:71-83`; `mcp/src/agent-providers/spawn-supervisor.ts:1125-1194`, `mcp/src/agent-providers/spawn-supervisor.ts:2320-2345`, `mcp/src/agent-providers/spawn-supervisor.ts:3095-3102`; `mcp/src/agent-providers/opencode-profile.ts:367-377`; `mcp/src/agent-providers/runtime-files.ts:767-775`, `mcp/src/agent-providers/runtime-files.ts:1190-1201`

**Issue:** Every production OpenCode `delegate.start` fails before a child can spawn. `createProductionSpawnSupervisor` builds the production registry without `resolveOpenCodeProfileRuntime`, so the OpenCode adapter uses `unavailableProfileRuntime` and throws from `buildSpawn`. Supplying only that callback would still leave the path broken: the supervisor supplies the Claude-shaped one-file runtime context, while the profile requires the exact OpenCode config/test-home/managed-config triplet; `buildOpenCodeSpawnSpec` discards the profile's `privateArtifacts`; both delegation and owned-server `prepareRun` calls pass an empty artifact list even though runtime validation requires the exact three OpenCode artifacts; and process-json policy probes run before any private files are prepared. The owned server also receives a new `serverId`, but its fixed paths were derived from the task delegation id, while `AgentRuntimeFiles` requires paths derived from the journal entry's own id. The current composition therefore has no lifecycle-valid owner for either task or warm-server runtime files.

The focused tests mask the production break. `tests/mcp-opencode-adapter.test.js:737-815` injects the missing resolver, and `tests/mcp-opencode-server-topology.test.js:425-498` uses fake adapters plus a fake runtime store that neither validates nor materializes the real private artifacts. No test starts OpenCode through the real `createProductionSpawnSupervisor` composition.

**Fix:** Keep the exact five adapter methods, but extend the closed declarative result of `buildSpawn` so it carries role-scoped private-runtime declarations/artifacts. Have the production supervisor mint the task and provider-server runtime graphs before their respective policy probes or spawns, pass the exact role-specific paths in each spawn context, persist/materialize the required artifacts under the same ids used by their journal entries, and remove them in lifecycle order. Add a production-composition test using the real registry and `AgentRuntimeFiles` with only process/network seams stubbed; it must cover cold execution, warm attach, preflight ordering, and cleanup.

### Warnings

#### WR-01: Real OpenCode result token counts are dropped before persistence and UI projection

**File:** `mcp/src/agent-providers/opencode-stream.ts:484-499`; `extension/utils/delegation-event-store.js:520-548`; `tests/fixtures/delegation-events.js:135-158`; `tests/delegation-event-store.test.js:361-378`

**Issue:** The OpenCode parser emits token counters in `payload.tokens` with `total`, `input`, `output`, `reasoning`, and cache fields. The event store reads only Claude-style `payload.usage.input_tokens`, `output_tokens`, and `total_tokens`, so a genuine successful OpenCode result persists `null` input/output/total metrics and the delegated feed cannot display the counters the parser collected. The OpenCode event-store fixture does not exercise the native normalized shape: despite its name, it supplies Claude-style `usage`, `num_turns`, and `duration_ms`, which makes the test pass while the production boundary loses data.

**Fix:** Define one provider-neutral normalized result metric shape and have both parsers emit it, or explicitly project the closed OpenCode `tokens` shape in the event store. Add an integration assertion that feeds the actual `parseOpenCodeEvents` output from the pinned Phase 64 stream fixture through the event store/controller and verifies the persisted token totals.

#### WR-02: The spawn environment still inherits provider credentials that OpenCode can use as an API-key fallback

**File:** `mcp/src/agent-providers/spawn-supervisor.ts:91-95`, `mcp/src/agent-providers/spawn-supervisor.ts:934-941`, `mcp/src/agent-providers/spawn-supervisor.ts:1880-1891`; `tests/mcp-spawn-supervisor.test.js:1233`

**Issue:** The supervisor copies the daemon environment and removes only `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY`. The pinned OpenCode 1.14.25 provider implementation recognizes additional inherited credential and provider-discovery variables, including AWS profiles/keys/web-identity/container credentials and other provider-specific tokens. Those values survive into the policy probes, owned server, cold task, and attach task. A default model can therefore resolve through a shell credential rather than the user's retained OpenCode sign-in, silently changing account/provider and billing authority despite the phase's explicit no-provider-API-key-fallback contract. The current test only loops over the same three-name list and cannot catch this drift.

**Fix:** For the pinned profile, establish a reviewed closed environment boundary that removes every upstream-recognized provider credential/discovery variable while retaining only the operational and XDG data/state variables OpenCode needs for its native sign-in. Add poison-canary tests for each denied credential family across preflight, server, cold, and attach spawns, and source-pin the deny roster to the exact upstream profile.

#### WR-03: Detached policy-preflight process groups are not durably recoverable after a daemon crash

**File:** `mcp/src/agent-providers/spawn-supervisor.ts:1637-1661`, `mcp/src/agent-providers/spawn-supervisor.ts:1667-1699`, `mcp/src/agent-providers/spawn-supervisor.ts:1720-1739`

**Issue:** Each process-json policy attestation is spawned as a detached process group. The supervisor synthesizes a journal entry only in memory and records it in `entriesByPid`; it never calls `AgentRuntimeFiles.prepareRun` or `activateRun`. Normal success, timeout, and error paths attempt termination, but a daemon crash after spawn leaves no durable entry for startup recovery to inspect and kill. The bounded policy timeout does not help once the supervising daemon is gone, so an OpenCode preflight tree can outlive its owner and retain the private environment.

**Fix:** Give detached policy probes a distinct durable runtime role and journal their prepare/activate/remove transitions, avoiding delegation-id collisions with the eventual task, or execute them through a non-detached lifecycle primitive that cannot outlive the supervisor. Add a crash-window recovery test from both post-spawn/pre-activation and active-preflight states.

### Info

No informational findings.

## Verification Notes

This was a standard-depth source review of the exact 66-file Phase 64 scope. The phase context, research, validation contract, and UI contract were used as review constraints. Focused tests and harnesses were inspected for false positives and missing production composition, but no test suite, build, authenticated OpenCode run, browser session, visual check, or human UAT was rerun as part of this review. The milestone-end genuine authenticated OpenCode-to-browser case remains correctly deferred; it cannot compensate for CR-01 because the production path currently fails before spawn.

Only this review artifact was created. Existing source, generated output, deletions, and unrelated working-tree changes were not modified.

---

_Reviewed: 2026-07-21T12:08:42Z_

_Reviewer: Codex (`gsd-code-reviewer`)_

_Depth: standard_
