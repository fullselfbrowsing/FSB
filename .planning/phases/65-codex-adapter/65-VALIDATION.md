---
phase: 65
slug: codex-adapter
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-22
reviewed: 2026-07-22
plan_count: 8
validation_tasks: 16
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for the Codex 0.142.5 adapter, byte-safe auth disclosure, hermetic FSB-only execution, immutable auth/billing identity, strict JSONL drift handling, and shared Providers/delegation UI.

This artifact is the approved pre-execution validation design. All 16 implementation tasks have exact owners and deterministic commands; their evidence status remains pending until execution. The three genuine external scenarios remain `human_needed` regardless of source-test results.

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
| `tests/mcp-codex-adapter.test.js` generic isolation plus auth/profile/parser sections | 65-04-01, 65-04-02, 65-04-03, 65-05-01 | Any Codex production symbol | Exact argv/env/profile, byte zeroization, managed-MCP attestation, parser lifecycle, no native tool authority | ✅ owned |
| `tests/fixtures/agent-streams/codex-0.142.5/` manifest, valid fixture, expected sequence, and native negative corpus | 65-05-01 | Registry/matrix production exposure | `schema-derived-contract`, `liveCapturePending:true`, exact event/usage/order limits, no false success | ✅ owned |
| Atomic first-production exposure sentinel | 65-05-01 | `CODEX_ADAPTER_ID`, `createCodexAdapter`, registry row, or Codex fixture symbol | Parser/fixture/negative/matrix/drift roster becomes production-visible in one task/commit | ✅ owned |
| Auth/billing identity and consent/start TOCTOU harness extensions | 65-01-01, 65-01-02, 65-02-01, 65-02-02, 65-03-01, 65-03-02, 65-06-01 | Codex preflight/start promotion | Five-field identity, exact auth→billing pairs, changed auth rejects before spawn/stdin | ✅ owned |
| Controller/store/UI real-profile parity fixtures | 65-01-02, 65-07-01, 65-07-02 | Codex feed/summary promotion | Real non-null profiles remain internal, no visible Profile row, USD null, generic DOM shape | ✅ owned |
| Phase 65 runner + preservation failure/signal harness | 65-08-02 | Full/root/CI sign-off | Exact command occurrence and complete dirty/staged/untracked/generated preservation | ✅ owned |
| `65-HUMAN-UAT.md` exact three-row ledger | 65-08-01 | Phase tracking completion | Exactly three unchecked `human_needed` / `pending` / evidence-empty rows | ✅ owned |

No new test framework, package, browser driver, provider credential, or vendored Codex binary is required.

---

## Per-Task Verification Map

Every implementation task appears exactly once. `⬜ pending` means the validation design and Wave-0 ownership are approved but the task has not executed yet.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Automated command | Status |
|---------|------|------|-------------|------------|-----------------|-------------------|--------|
| 65-01-01 | 01 | 1 | MULTI-05 | T65-03, T65-09, T65-10 | Closed auth→billing mapping and hostile-record-safe exact five-field validator, with no Codex exposure | `node tests/provider-parity.test.js --section accepted-identity-foundation` | ⬜ pending |
| 65-01-02 | 01 | 1 | MULTI-05 | T65-03, T65-09, T65-10 | Controller/store persist and hydrate one immutable identity with real profiles and no event USD | `node tests/delegation-controller.test.js --section accepted-identity-foundation && node tests/delegation-event-store.test.js --section accepted-identity-foundation` | ⬜ pending |
| 65-02-01 | 02 | 2 | MULTI-05 | T65-03, T65-09, T65-10 | Background evidence establishes accepted identity while browser requests remain provider-free | `node tests/delegation-routing.test.js --section accepted-identity-preflight` | ⬜ pending |
| 65-02-02 | 02 | 2 | MULTI-05 | T65-03, T65-09, T65-10 | Consent binds task and all five identity fields across trust, expiry, and replay | `node tests/delegation-consent.test.js --section accepted-identity-binding` | ⬜ pending |
| 65-03-01 | 03 | 3 | MULTI-05 | T65-03, T65-09, T65-10 | Daemon derives and validates the exact immutable five-field identity from its own current detection | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js","--section","accepted-identity-foundation"]]'` | ⬜ pending |
| 65-03-02 | 03 | 3 | MULTI-05 | T65-03, T65-09, T65-10 | Consent-bound identity crosses authenticated start and must match supervisor detection before runtime/journal/child/stdin, then echo-match before UI state | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js","--section","consent-bound-start"],["node","tests/mcp-bridge-background-dispatch.test.js","--section","accepted-identity"],["node","tests/delegation-routing.test.js","--section","immediate-start-identity"]]'` | ⬜ pending |
| 65-04-01 | 04 | 4 | MULTI-04, MULTI-05 | T65-01, T65-02, T65-05 | Shared sanitizer prevents reinjection and bounded byte probes zero every channel | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-codex-adapter.test.js","--section","generic-probe"],["node","tests/mcp-spawn-supervisor.test.js","--section","shared-environment"]]'` | ⬜ pending |
| 65-04-02 | 04 | 4 | MULTI-04 | T65-04, T65-05 | Serve-owned loopback reference and exact generic effective-authority descriptors | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/runtime-contracts.test.js"],["node","tests/mcp-codex-adapter.test.js","--section","generic-authority"]]'` | ⬜ pending |
| 65-04-03 | 04 | 4 | MULTI-04, MULTI-05 | T65-03, T65-04, T65-08 | Reprobe/attestation happen before spawn/stdin and success waits for empty-scratch cleanup | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js","--section","pre-spawn-authority"],["node","tests/mcp-agent-orphan-recovery.test.js"],["node","tests/runtime-contracts.test.js"]]'` | ⬜ pending |
| 65-05-01 | 05 | 5 | MULTI-04, MULTI-05, MULTI-06 | T65-01, T65-02, T65-04, T65-05, T65-06, T65-07, T65-08, T65-11, T65-12 | One indivisible first exposure contains complete 0.142.5 adapter/auth/profile/parser/fixture/roster/drift contract and Codex direct-runtime lifecycle/recovery | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-codex-adapter.test.js"],["node","tests/mcp-agent-orphan-recovery.test.js"],["node","tests/mcp-agent-stream-fixture.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"],["node","tests/mcp-agent-provider-contract.test.js"],["node","tests/mcp-adapter-compatibility.test.js"],["node","tests/mcp-version-parity.test.js"],["node","tests/mcp-diagnostics-status.test.js"],["node","tests/mcp-client-inventory.test.js"],["node","tests/agent-provider-forbidden-flags.test.js"],["node","tests/delegation-phase-contract.test.js","--section","phase65-atomic-exposure"]]'` | ⬜ pending |
| 65-06-01 | 06 | 6 | MULTI-04, MULTI-05, MULTI-06 | T65-02, T65-03, T65-09, T65-10, T65-11 | Safe three-row snapshot, stale→unknown, exact Codex pairs, provider-free consent/start | `node tests/mcp-agent-providers-storage.test.js && node tests/delegation-routing.test.js --section codex-auth-preflight && node tests/delegation-consent.test.js --section codex-auth-binding && node tests/mcp-bridge-background-dispatch.test.js --section codex-start-authority` | ⬜ pending |
| 65-06-02 | 06 | 6 | MULTI-05 | T65-02, T65-09, T65-10, T65-11 | Existing third row renders exact auth/billing matrix without markup/version/dollar changes | `node tests/providers-panel-logic.test.js --section codex-safe-evidence && node tests/providers-panel-ui.test.js --section codex-existing-row` | ⬜ pending |
| 65-07-01 | 07 | 7 | MULTI-04, MULTI-05, MULTI-06 | T65-02, T65-06, T65-08, T65-09, T65-10 | Durable accepted identity drives shared feed, no Profile row, USD null, authoritative terminal | `node tests/delegation-controller.test.js --section codex-accepted-identity && node tests/delegation-event-store.test.js --section codex-accepted-identity && node tests/delegation-sidepanel-ui.test.js --section codex-shared-feed && node tests/provider-parity.test.js --section delegated-agent-parity` | ⬜ pending |
| 65-07-02 | 07 | 7 | MULTI-04, MULTI-05, MULTI-06 | T65-10 | Every delegated action is ≥44px with responsive/a11y/theme/motion parity | `node tests/delegation-sidepanel-ui.test.js --section delegated-targets-and-a11y && node tests/providers-panel-ui.test.js --section responsive-accessibility` | ⬜ pending |
| 65-08-01 | 08 | 8 | MULTI-04, MULTI-05, MULTI-06 | T65-01, T65-02, T65-03, T65-04, T65-05, T65-06, T65-07, T65-08, T65-09, T65-10, T65-11, T65-12 | Exact graph/source/security/UAT contract verifies all ownership and preserves three pending rows | `node tests/delegation-phase-contract.test.js --section phase65-validation && node tests/delegation-phase-contract.test.js --section phase65-uat-ledger && node tests/agent-provider-forbidden-flags.test.js` | ⬜ pending |
| 65-08-02 | 08 | 8 | MULTI-04, MULTI-05, MULTI-06 | T65-01, T65-02, T65-03, T65-04, T65-05, T65-06, T65-07, T65-08, T65-09, T65-10, T65-11, T65-12 | Authoritative runner preserves workspace on every settlement path and enforces root/CI order | `node tests/phase65-full-tests-harness.test.js && node scripts/run-phase65-full-tests.mjs` | ⬜ pending |

No three consecutive tasks lack deterministic automated verification; every task has one exact command.

## Requirement Verification

| Requirement | Primary task owners | Blocking evidence | Residual evidence |
|-------------|---------------------|-------------------|-------------------|
| MULTI-04 | 65-04-01, 65-04-02, 65-04-03, 65-05-01, 65-06-01, 65-07-01, 65-07-02, 65-08-01, 65-08-02 | Five methods, stdin-only/no-native-authority profile, exact FSB attestation, atomic production exposure, terminal/cleanup and shared UX | Genuine Codex-to-browser execution remains UAT65-02 |
| MULTI-05 | 65-01-01, 65-01-02, 65-02-01, 65-02-02, 65-03-01, 65-03-02, 65-04-01, 65-04-03, 65-05-01, 65-06-01, 65-06-02, 65-07-01, 65-07-02, 65-08-01, 65-08-02 | Byte-safe four-state auth, immutable consent/start identity, stale→unknown, exact Providers/feed billing, USD null | Genuine account-state matrix remains UAT65-01 |
| MULTI-06 | 65-05-01, 65-06-01, 65-07-01, 65-07-02, 65-08-01, 65-08-02 | 0.142.5 schema-derived fixture, native negatives, chatMode false, registry/matrix/parser/manifest/Phase62 drift bijection | Genuine sanitized stream provenance remains UAT65-02 |

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
| T65-03 auth/billing TOCTOU | Consumed identity is sent only by background; ChatGPT→API, API→ChatGPT, and every other field change reject in supervisor before runtime preparation, `buildSpawn`, journal, child, and task stdin |
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

- [x] Exactly 8 plans and 16 unique task ids are mapped once in dependency order.
- [x] Every task has a deterministic `<automated>` command and no three consecutive tasks lack feedback.
- [x] Wave 0 gives every missing harness/fixture/sentinel an owner before dependent production edits.
- [x] Every MCP build/compiled-output consumer uses the workspace-preserving wrapper.
- [x] MULTI-04, MULTI-05, and MULTI-06 appear in plan frontmatter and map to blocking evidence.
- [x] T65-01 through T65-12 have concrete task owners and mechanical closure.
- [x] Atomic Codex exposure is exactly task 65-05-01, one indivisible implementation commit after provider-neutral foundations.
- [x] The approved UI-SPEC maps to shared source/DOM tests; no new renderer/markup/provider branch is planned.
- [x] Exactly three genuine scenarios are owned by 65-08-01 and remain unchecked `human_needed` / `pending` / evidence-empty.
- [ ] Implementation commands are green and execution evidence is recorded.

**Approval:** validation design approved for execution; implementation and genuine external evidence pending.
