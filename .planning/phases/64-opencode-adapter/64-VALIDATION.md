---
phase: 64
slug: opencode-adapter
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
plan_count: 0
validation_tasks: 0
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for the exact OpenCode 1.14.25 profile, provider-neutral cold/owned-attach topology, strict JSONL normalization, and unchanged delegation UI.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native serial Node assertion scripts, strict TypeScript build, VM-loaded extension scripts, handcrafted DOM harnesses, and source/artifact contract scripts |
| **Config file** | Root `package.json`; `mcp/package.json`; `mcp/tsconfig.json` |
| **Quick run command** | Task-focused Node test from the final per-task map; prepend the workspace-preserving MCP build wrapper for compiled seams |
| **Full suite command** | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` |
| **Estimated runtime** | Focused slices under 30 seconds; guarded full suite several minutes |

The guarded build wrapper is mandatory because this workspace contains unrelated user-owned planning deletions and modified generated artifacts. It must restore the complete generated graph, raw Git index bytes/mode, dirty bytes, staged state, and untracked listing after every compiled test lifecycle.

---

## Sampling Rate

- **After every task commit:** Run the task's focused command; every compiled MCP seam builds only through the workspace-preserving wrapper.
- **After every plan wave:** Run every Phase 64 focused suite accumulated through that wave.
- **Before phase verification:** Run all focused adapter/topology/drift/provider-neutral/source-security suites, then the guarded full repository suite.
- **Max focused feedback latency:** 30 seconds.
- **No-watch/no-live rule:** Watch mode, a live authenticated model call, a user OpenCode process, a real browser delegation, or network-dependent evidence never counts as automated verification.

---

## Provisional Requirement Verification Map

The planner must replace these requirement-level rows with one exact row per final task before plan-checker approval. No three consecutive implementation tasks may lack a deterministic automated command.

| Requirement | Threat Refs | Secure Behavior | Minimum Blocking Automated Evidence | Status |
|-------------|-------------|-----------------|-------------------------------------|--------|
| MULTI-01 | T64-01–T64-07 | The five-method provider-neutral contract declares cold and owned-attach topology; the supervisor owns one bounded lease, permits fallback only before task-client spawn, withholds success until clean exit/tree settlement, and never touches user processes | Contract/registry snapshots; cold/attach production specs; server ownership/health/idle/recovery; replay fence; candidate-result/exit corroboration; provider-neutral lifecycle snapshots | ⬜ pending |
| MULTI-02 | T64-02–T64-06 | Exact 1.14.25 private policy preserves OpenCode-owned auth/default-model resolution while denying inherited authority and allowing only `fsb_*`; unusable policy/account/model fails before task acceptance | Generated-config snapshot; prompt digest; permission precedence and truncation deny; effective config/agent/tool attestation; poison-source cases; missing-model not-ready case; source pins for isolation flags | ⬜ pending |
| MULTI-03 | T64-04, T64-08–T64-10 | A sanitized schema-derived multi-step fixture drives the production parser and adapter-native negative mutators; drift fails closed as `agent_protocol_drift` with adapter id `opencode` | Manifest/JSONL contract; registry/matrix/fixture bijection; expected normalized sequence; unknown/missing/duplicate/reordered/mixed-session/post-terminal cases; CI/root smoke invocation; UAT provenance stays pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/mcp-opencode-adapter.test.js` — retained binary/version/profile, exact contract/caps, deep freeze, stdin-only task, private policy, effective attestation, cold/attach specs, strict parser, and bounded negatives.
- [ ] `tests/mcp-opencode-server-topology.test.js` (or an equivalently isolated supervisor section) — random loopback port, Basic Auth, exact health/version, process/config identity, one lease, cold-first/attach-later behavior, idle teardown, fallback fence, and user-process non-interaction.
- [ ] `tests/fixtures/agent-streams/opencode-1.14.25/` plus a closed per-adapter fixture contract — sanitized schema-derived multi-step JSONL, pinned sources, `liveCapturePending: true`, and adapter-native mutators.
- [ ] Provider-neutral extension fixtures — canonical Claude/OpenCode identity and billing, provider-bound trust/challenges, selected-provider recheck, event-store/controller/feed rehydration, exact approved copy, and no topology/version/raw-event leakage.
- [ ] A Phase 64 focused serial runner or equivalent closed root-test entries that execute each new suite exactly once while preserving workspace state.

No new test framework, browser driver, live OpenCode server, real provider credential, or runtime dependency is required for deterministic validation.

---

## Focused Command Matrix

| Area | Automated Command |
|------|-------------------|
| Adapter/profile/parser | `npm --prefix mcp run build && node tests/mcp-opencode-adapter.test.js` |
| Owned-server topology | `npm --prefix mcp run build && node tests/mcp-opencode-server-topology.test.js` |
| Generic supervisor/recovery | `npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-agent-orphan-recovery.test.js` |
| Fixture/drift | `npm --prefix mcp run build && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-agent-stream-fixture.test.js` |
| Registry/matrix/doctor/inventory | `npm --prefix mcp run build && node tests/mcp-agent-provider-contract.test.js && node tests/mcp-adapter-compatibility.test.js && node tests/mcp-diagnostics-status.test.js && node tests/mcp-client-inventory.test.js` |
| Delegation lifecycle | `node tests/delegation-consent.test.js && node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js && node tests/delegation-routing.test.js && node tests/delegation-phase-contract.test.js` |
| Providers/side panel | `node tests/mcp-agent-providers-storage.test.js && node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js && node tests/delegation-sidepanel-ui.test.js` |
| Drift/security boundary | `node tests/agent-protocol-drift-diagnostics.test.js && node tests/agent-provider-forbidden-flags.test.js` |

The final plans may split files differently, but each mapped focused command must remain deterministic, non-watch, offline, and normally below 30 seconds.

---

## Threat References

| Ref | Threat | Required Control |
|-----|--------|------------------|
| T64-01 | OpenCode forces an adapter-specific supervisor branch or sixth method | Closed provider-neutral topology interpreted without adapter-id branching; exact five-method contract tests |
| T64-02 | Task text or a server secret enters argv, env snapshots, files, receipts, or logs | Task written once to stdin; typed secret references; bounded diagnostics and sentinel non-leak gates |
| T64-03 | FSB discovers, attaches to, mutates, or kills a user OpenCode process | Retained child identity plus daemon-minted secret/config fingerprint; no process discovery or PID signaling |
| T64-04 | Attach fallback or retry replays an accepted task | Fallback only before provider session/task child/event; settle exactly once thereafter |
| T64-05 | User/project/managed config injects tools, agents, plugins, MCP, commands, skills, hooks, or instructions | Private config/home/managed inputs, project disable, pure/disable flags, and effective-policy attestation |
| T64-06 | Missing `fsb` agent silently falls back or built-in tools escape deny policy | Exact resolved-agent/tool assertions, known-warning rejection, ordered wildcard deny plus final `fsb_*` allow |
| T64-07 | A stale/wrong owned server receives a task | Authenticated exact-version health, retained process identity, config fingerprint, bounded lease and teardown |
| T64-08 | Multi-step `step_finish` produces premature UI success | Continuation-reason handling, one terminal candidate, clean child exit/tree settlement before result publication |
| T64-09 | Unknown, malformed, reordered, mixed-session, duplicate, or post-terminal data is tolerated | Strict bounded schemas/order/session state machine; stop child and emit closed `agent_protocol_drift` details |
| T64-10 | Provider-native metadata, topology, credentials, or raw events cross into the extension | Closed browser-safe provider/event view models, canonical metadata, text-only rendering, source/security pins |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Genuine authenticated OpenCode-to-browser delegation with real account/model configuration | MULTI-01–03 | Requires a real provider account, installed CLI, daemon, browser, and deliberate external side effects | Run only in the single v0.9.91 milestone-end UAT sweep; retain sanitized provider/version/outcome evidence without task, credential, model metadata, raw events, path, port, or secret |
| Installed OpenCode 1.14.25 Providers transition plus keyboard/screen-reader behavior | MULTI-01–03 | Live browser rendering and assistive technology need human judgment | Execute the approved `64-UI-SPEC.md` matrix at milestone end and record sanitized visible/focus/announcement outcomes |
| Live cold and FSB-owned attach paths produce the same feed and terminal summary | MULTI-01–03 | A fixture cannot prove native process/network/browser integration | Run one cold and one daemon-owned attach scenario at milestone end; confirm one consent, one task, one chronological feed, one terminal, and successful kill-switch reclamation |

Every row remains `human_needed`; synthetic/source evidence must never promote it.

---

## Validation Sign-Off

- [ ] Final PLAN task ids match the per-task map.
- [ ] All tasks have an automated verify command or explicit Wave 0 dependency.
- [ ] Sampling continuity has no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every missing focused fixture and provider-neutral harness.
- [ ] No watch mode, live credential/model call, user process, or browser evidence is counted as automated.
- [ ] Guarded builds preserve unrelated dirty/staged state and protected generated artifacts.
- [ ] Manual checks remain pending at the milestone-end gate and are never fabricated.
- [ ] `nyquist_compliant: true` is set only after independent plan-checker approval.

**Approval:** pending
