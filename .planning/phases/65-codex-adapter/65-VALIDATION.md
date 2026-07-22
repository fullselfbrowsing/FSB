---
phase: 65
slug: codex-adapter
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for the Codex 0.142.5 adapter, byte-safe auth disclosure, hermetic FSB-only execution, immutable auth/billing identity, strict JSONL drift handling, and shared Providers/delegation UI.

This artifact establishes the validation architecture before planning. The planner must replace the provisional ownership rows with exact plan/task ids and commands; execution closure must then mark only automated rows green. The three genuine external scenarios remain `human_needed` regardless of source-test results.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native serial Node assertions, strict TypeScript build, injected process/environment/clock fakes, VM-loaded extension modules, handcrafted DOM harnesses, source/artifact contracts, and schema-derived JSONL fixtures |
| **Config files** | Root `package.json`; `mcp/package.json`; `mcp/tsconfig.json` |
| **Quick run command** | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '<focused commands>'` |
| **Full phase command** | `node scripts/run-phase65-full-tests.mjs` once the closure runner exists |
| **Repository baseline** | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` |
| **Estimated runtime** | Focused task slices normally under 30 seconds; Phase 65 matrix under 2 minutes; guarded repository suite several minutes |

Every command that compiles or consumes fresh MCP output must use `scripts/run-mcp-build-preserving-workspace.mjs`. A bare `npm --prefix mcp run build` or bare root `npm test` is invalid in this dirty shared workspace because generated output is user-owned and already modified.

---

## Sampling Rate

- **Within every test-first task:** Land the named failing harness/fixture assertion before production code, then run the exact focused command.
- **After every task commit:** Run the row mapped to that task; no paid/model-backed Codex call, credential read, genuine browser, or user process is permitted.
- **After every plan wave:** Run all focused rows accumulated through that wave before starting dependent work.
- **Before phase verification:** Run the Phase 65 runner, extension validation, source/security contract, and guarded repository baseline.
- **Maximum focused feedback latency:** 30 seconds per task slice; parser mutation corpora may be grouped in the focused runner.
- **No-watch/no-live rule:** Watch mode, login/logout, a real Codex model task, genuine Chrome delegation, screenshot, account mutation, or assistive-technology judgment never counts as automated evidence.

---

## Wave 0 / Test-First Requirements

| Validation asset | Planned ownership | Must exist before | Blocking proof | Status |
|------------------|-------------------|-------------------|----------------|--------|
| `tests/mcp-codex-adapter.test.js` isolation/auth/profile/parser sections | Identity/execution substrate plans | Any Codex production symbol | Exact argv/env/profile, byte zeroization, managed-MCP attestation, parser lifecycle, no native tool authority | ❌ missing |
| `tests/fixtures/agent-streams/codex-0.142.5/` manifest, valid fixture, expected sequence, and native negative corpus | Atomic exposure plan | Registry/matrix production exposure | `schema-derived-contract`, `liveCapturePending:true`, exact event/usage/order limits, no false success | ❌ missing |
| Atomic first-production exposure sentinel | Atomic exposure plan | `CODEX_ADAPTER_ID`, `createCodexAdapter`, registry row, or Codex fixture symbol | Parser/fixture/negative/matrix/drift roster becomes production-visible in one task/commit | ❌ missing |
| Auth/billing identity and consent TOCTOU harness extensions | Identity authority plan | Codex preflight/start promotion | Five-field identity, exact auth→billing pairs, changed auth rejects before spawn/stdin | ❌ missing |
| Controller/store/UI real-profile parity fixtures | Product/UI plans | Codex feed/summary promotion | Real non-null profiles remain internal, no visible Profile row, USD null, generic DOM shape | ❌ missing |
| Phase 65 runner + preservation failure/signal harness | Closure plan | Full/root/CI sign-off | Exact command occurrence and complete dirty/staged/untracked/generated preservation | ❌ missing |
| `65-HUMAN-UAT.md` exact three-row ledger | Closure plan | Phase tracking completion | Exactly three unchecked `human_needed` / `pending` / evidence-empty rows | ❌ missing |

No new test framework, package, browser driver, provider credential, or vendored Codex binary is required.

---

## Provisional Requirement Verification Map

The plan-phase checker must replace `TBD` with exact plan/task ids and copy each task's deterministic `<automated>` command into a one-to-one per-task table before execution.

| Requirement | Threat refs | Secure behavior | Primary automated evidence | Owner |
|-------------|-------------|-----------------|----------------------------|-------|
| MULTI-04 | T65-01, T65-04, T65-05, T65-08, T65-12 | Exact five methods; stdin-only task; no native execution/tool authority; one attested FSB MCP; atomic production exposure; clean exit/tree/cleanup terminal barrier | Codex adapter, provider contract, forbidden flags, supervisor, orphan recovery, runtime contract, atomic exposure sentinel | TBD |
| MULTI-05 | T65-01, T65-02, T65-03, T65-09, T65-10 | Four-state byte-safe auth; accepted auth/billing consent binding; immediate re-probe; five-field persistence; safe Providers copy | Codex auth section, storage, preflight/routing, consent, background dispatch, controller/store, Providers logic/UI | TBD |
| MULTI-06 | T65-06, T65-07, T65-08, T65-11, T65-12 | Honest 0.142.5 schema fixture; exact normalized lifecycle and negative corpus; task-only caps; registry/matrix/parser/manifest/drift bijection | stream fixture, drift smoke, compatibility, version parity, provider contract, Codex parser sections | TBD |

---

## Focused Command Inventory

These are the expected command families. Plans must select the smallest deterministic subset for each task and wrap every MCP build consumer.

| Area | Workspace-safe command |
|------|------------------------|
| Codex isolation/profile/auth | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-codex-adapter.test.js","--section","isolation"],["node","tests/mcp-codex-adapter.test.js","--section","auth"]]'` |
| Parser/fixture/native drift | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-codex-adapter.test.js","--section","parser"],["node","tests/mcp-agent-stream-fixture.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` |
| Contract/composition/matrix | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-provider-contract.test.js"],["node","tests/mcp-adapter-compatibility.test.js"],["node","tests/mcp-version-parity.test.js"]]'` |
| Supervisor/runtime/recovery | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js"],["node","tests/mcp-agent-orphan-recovery.test.js"],["node","tests/runtime-contracts.test.js"]]'` |
| Doctor/inventory/safe projection | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-diagnostics-status.test.js"],["node","tests/mcp-client-inventory.test.js"],["node","tests/mcp-agent-providers-storage.test.js"]]'` |
| Reverse channel | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-reverse-channel-contract.test.js"],["node","tests/mcp-bridge-topology.test.js"]]'` |
| Auth/consent/routing | `node tests/delegation-routing.test.js && node tests/delegation-consent.test.js && node tests/mcp-bridge-background-dispatch.test.js` |
| Durable identity | `node tests/delegation-controller.test.js && node tests/delegation-event-store.test.js` |
| Providers UI | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js && node tests/mcp-agent-providers-storage.test.js` |
| Delegated feed/UI | `node tests/delegation-sidepanel-ui.test.js && node tests/provider-parity.test.js && node tests/delegation-event-store.test.js` |
| Source/security | `node tests/agent-provider-forbidden-flags.test.js && node tests/agent-protocol-drift-diagnostics.test.js && node scripts/verify-agent-provider-flags.mjs` |
| Complete Phase 65 | `node scripts/run-phase65-full-tests.mjs` |

---

## Security Test Obligations

| Threat | Blocking automated proof |
|--------|--------------------------|
| T65-01 ambient credentials | Complete source-pinned scrub roster across detection/attestation/spawn; fixed env cannot reintroduce stripped variables |
| T65-02 status-byte leakage | API-key canary classified without string retention; all chunks/aggregate zeroed; no fragment in errors/logs/state/fixtures |
| T65-03 auth/billing TOCTOU | ChatGPT→API and API→ChatGPT changes reject before `buildSpawn`, journal, child, and task stdin |
| T65-04 foreign MCP/injection | validated loopback endpoint; exact effective roster/allowlist/approval; extra or ambiguous server blocks before spawn |
| T65-05 inherited/native authority | ignore flags, no-execution-environment setting, feature/profile closure, forbidden flag/source gates |
| T65-06 native event leakage | reasoning/todo validated then discarded; command/file/web/collab/error/unknown events fail without raw detail |
| T65-07 MCP identity confusion | exact item/server/tool/order tracking; adjacent sanitized tool pair; mismatch/duplicate/open-terminal negatives |
| T65-08 forged success | one candidate plus exit 0, no signal, settled tree, successful scratch cleanup; every missing gate yields no result |
| T65-09 billing mutation/USD | immutable accepted auth/billing across events/hydration; Codex USD always null and never rendered |
| T65-10 compatibility authority | browser requests remain provider/auth/billing-free; safe evidence cannot select or start |
| T65-11 provenance/version drift | 0.142.5 schema-derived manifest, `liveCapturePending:true`, installed 0.144.6 degraded, no “recorded” claim |
| T65-12 partial exposure | literal source sentinel and registry/matrix/parser/fixture/drift bijection in first production Codex commit |

Every HIGH or CRITICAL threat blocks phase verification; none is accepted as residual automated risk.

---

## Manual-Only Verifications

| ID | Behavior | Requirement | Why manual | Status | Evidence |
|----|----------|-------------|------------|--------|----------|
| UAT65-01 | Genuine ChatGPT/API-key/unauthenticated auth matrix with exact safe copy and no credential/status leakage | MULTI-05 | Requires real Codex account states and human review of disclosure | `human_needed` / `pending` | *(empty)* |
| UAT65-02 | Genuine Codex-to-browser task, cancellation/tree cleanup, authoritative completion, tokens/turns/duration, honest billing, no USD | MULTI-04–06 | Requires installed CLI, model-backed account, daemon, browser, and deliberate external effects | `human_needed` / `pending` | *(empty)* |
| UAT65-03 | Providers/delegation keyboard, screen-reader, light/dark/forced-colors/reduced-motion, zoom, and narrow layout; 44px targets and no Profile row | MULTI-04–06 | Rendered themes and assistive technology require human judgment | `human_needed` / `pending` | *(empty)* |

Automated source/DOM assertions may protect the contract but must not change these rows to passed.

---

## Validation Sign-Off

- [ ] Planner has replaced provisional ownership with one exact row per plan task.
- [ ] Every task has a deterministic `<automated>` command and no three consecutive tasks lack feedback.
- [ ] Wave 0 creates every missing harness/fixture/sentinel before dependent production edits.
- [ ] Every MCP build/compiled-output consumer uses the workspace-preserving wrapper.
- [ ] MULTI-04, MULTI-05, and MULTI-06 appear in plan frontmatter and map to blocking evidence.
- [ ] T65-01 through T65-12 have concrete task owners and mechanical closure.
- [ ] Atomic Codex exposure is one indivisible implementation task/commit after provider-neutral foundations.
- [ ] The approved UI-SPEC is mapped to shared source/DOM tests; no new renderer/markup/provider branch is planned.
- [ ] Exactly three genuine scenarios remain unchecked `human_needed` / `pending` / evidence-empty.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after the exact task map passes review.

**Approval:** pending plan/task mapping and execution evidence.
