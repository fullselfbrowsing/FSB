---
phase: 64
slug: opencode-adapter
status: approved
implementation_status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-20
reviewed: 2026-07-21
plan_count: 13
validation_tasks: 28
---

# Phase 64 — Validation Strategy

> Exact validation contract for OpenCode 1.14.25, a closed provider-neutral preflight/attestation seam, cold/FSB-owned-attach topology, strict multi-step JSONL normalization, safe evidence projection, and the unchanged delegation UI.

`approved` and `nyquist_compliant` describe this executable validation design. All 28 implementation rows are `✅ green`; Phase 64 automated validation is complete. The three genuine external scenarios remain `human_needed` regardless of automated results.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native serial Node assertions, strict TypeScript build, injected process/HTTP/clock fakes, VM-loaded extension modules, handcrafted DOM harnesses, and source/artifact contracts |
| **Config file** | Root `package.json`; `mcp/package.json`; `mcp/tsconfig.json` |
| **Quick run command** | `node scripts/run-phase64-full-tests.mjs` |
| **Full suite command** | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` |
| **Estimated runtime** | Task slices normally under 30 seconds; focused matrix under 90 seconds; guarded repository suite several minutes |

Every command that compiles or consumes fresh MCP output uses `scripts/run-mcp-build-preserving-workspace.mjs`. A bare `npm --prefix mcp run build` is invalid in this dirty shared workspace. The wrapper must restore the complete generated graph, raw Git index bytes/mode/entries, dirty and staged bytes, symlinks/modes, status, and untracked listing on every settlement path.

---

## Sampling Rate

- **Within every TDD task:** Write the named failing harness/fixture assertion before production action, then run the exact mapped command.
- **After every task:** Run its deterministic row below; no live CLI/server/network/browser/provider credential is permitted.
- **After each wave:** Run all focused rows accumulated through that wave, joining parallel plans before their dependent wave starts.
- **Before phase verification:** Run `node scripts/run-phase64-full-tests.mjs`, the source/security phase contract, then the exact guarded Phase 60 repository baseline.
- **Maximum focused feedback latency:** 30 seconds per task slice; deterministic byte-boundary suites may be grouped in the focused runner.
- **No-watch/no-live rule:** Watch mode, an installed user OpenCode process, authenticated model call, real loopback server, genuine Chrome delegation, screenshot, or assistive-technology judgment never counts as automated evidence.

---

## Wave 0 / Test-First Ownership

Wave 0 is planning-complete because every missing harness has a specific test-first owner before dependent production edits.

| Missing validation asset | Test-first owner(s) | Must exist before | Blocking proof | Status |
|--------------------------|---------------------|-------------------|----------------|--------|
| Complete strict parser, honest 1.14.25 fixture, native mutation corpus, and generalized adapter drift gate | 64-01-01 | Any other Phase 64 implementation task or production registration | One literal first implementation commit proves sequence/schema/session/terminal/overflow negatives and generalized Claude/OpenCode CI drift discovery while the registry/matrix remain Claude-only | ✅ owned |
| Generic topology, immutable preflight/attestation descriptors, fixed-env/secret-binding split, shared verifier, and spawn binding harness | 64-02-01 | Runtime/profile/supervisor production seams | Exact five methods; closed descriptors; fixedEnv secret rejection; exact server/attach binding and cold/direct/preflight absence | ✅ owned |
| Versioned role-aware runtime journal and exact private-artifact harness | 64-03-01 | Private policy or owned-server supervision | Legacy/new role grammar, containment/mode refusal, role-specific recovery, zero-kill ambiguity, and structural non-retention of secret env/header material | ✅ owned |
| OpenCode detector/profile/declarative policy harness | 64-04-01..03 | Production registration | Detection, profile-policy, descriptor-attestation, exact binding declarations, and forbidden-source sections | ✅ owned |
| Atomic adapter/registry/matrix/fixture-drift harness | 64-05-01 | Any production OpenCode exposure | Existing first-commit gate reruns before edits; exact registry/matrix/fixture/parser/drift bijection lands in one task | ✅ owned |
| Inventory/doctor/browser-safe projection harness | 64-06-01..02 | Any browser UI consumption | Local evidence consistency, safe two-row projection, Codex-unshipped and no-authority/storage sentinels | ✅ owned |
| Generic owned-server lifecycle and transient-secret harness | 64-07-01..03 | Task acceptance | Selection/replay, exact fake-spawn secret propagation, post-spawn scrubbing, owned health, and lease lifecycle sections | ✅ owned |
| Generic supervisor attestation/result barrier harness | 64-08-01..03 | Result publication | Shared-verifier source gate, task-once, server/attach env presence, cold/preflight absence, stderr, terminal-barrier, reverse-channel, and bridge regressions | ✅ owned |
| Provider authorization and canonical metadata fixtures | 64-09-01..03 | Browser start/routing authority | Preflight, consent, trust, authoritative routing, and immutable run context | ✅ owned |
| Durable provider lifecycle/drift fixtures | 64-10-01..03 | UI feed consumption | Store/controller hydration, billing, append-before-fanout, and safe per-provider drift | ✅ owned |
| Existing Providers-row logic/DOM harness | 64-11-01..02 | OpenCode row promotion | Safe evidence/copy/storage plus no-layout/order/focus/a11y/source locks | ✅ owned |
| Existing delegated side-panel/feed harness | 64-12-01..02 | Delegated OpenCode UI completion | Canonical consent/lifecycle and provider-neutral feed/terminal/billing snapshots | ✅ owned |
| Focused serial runner and workspace failure/signal harness | 64-13-02 | Root/CI/full-suite closure | Exact occurrence contract and preservation harness | ✅ owned |

No new test framework, runtime dependency, browser driver, provider credential, or user process is required.

---

## Per-Task Verification Map

The table contains exactly one row for every task in Plans 64-01 through 64-13. Commands are identical to PLAN `<automated>` values.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Automated command | Status |
|---------|------|------|-------------|------------|-----------------|-------------------|--------|
| 64-01-01 | 01 | 1 | MULTI-03 | T64-08, T64-09, T64-10 | Sole first implementation commit contains the complete source-pinned parser, honest fixture, strict native negatives, and generalized adapter-native CI drift gate before production exposure | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","first-commit-drift-gate"],["node","tests/mcp-agent-stream-fixture.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` | ✅ green |
| 64-02-01 | 02 | 2 | MULTI-01, MULTI-03 | T64-01, T64-02, T64-09 | Exact five-method topology/attestation seam separates public fixedEnv from the only closed server/attach secret binding and rejects all secret values | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-provider-contract.test.js"],["node","tests/mcp-spawn-supervisor.test.js"]]'` | ✅ green |
| 64-03-01 | 03 | 3 | MULTI-01, MULTI-03 | T64-02, T64-03 | Exact role-aware journal preserves legacy Claude recovery, recovers owned trees only, and makes resolved spawn env/password/header material structurally impossible | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-orphan-recovery.test.js"],["node","tests/mcp-agent-provider-contract.test.js"]]'` | ✅ green |
| 64-04-01 | 04 | 4 | MULTI-02 | T64-05 | Retained identity accepts only exact 1.14.25 and leaves auth unknown | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","detection"]]'` | ✅ green |
| 64-04-02 | 04 | 4 | MULTI-02 | T64-02, T64-05, T64-06 | Private exact config and ordered deny/final-fsb_* policy contain no task/model/credential; only server/attach specs declare the opaque binding | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","profile-policy"]]'` | ✅ green |
| 64-04-03 | 04 | 4 | MULTI-02 | T64-05, T64-06 | Profile populates shared descriptors only; clean/poison documents use the generic verifier and no native checker export | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","attestation"],["node","tests/agent-provider-forbidden-flags.test.js"]]'` | ✅ green |
| 64-05-01 | 05 | 5 | MULTI-01, MULTI-02, MULTI-03 | T64-01, T64-05, T64-09 | After rerunning the first-commit gate, adapter composition, registry, compatibility, manifest/parser rosters, and native drift bijection become exact Claude/OpenCode production exposure atomically | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-provider-contract.test.js"],["node","tests/mcp-opencode-adapter.test.js","--section","composition"],["node","tests/mcp-adapter-compatibility.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` | ✅ green |
| 64-06-01 | 06 | 6 | MULTI-01, MULTI-02, MULTI-03 | T64-05, T64-10 | Inventory/doctor share retained detection while browser-bound inventory strips local/native evidence | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-client-inventory.test.js"],["node","tests/mcp-diagnostics-status.test.js"]]'` | ✅ green |
| 64-06-02 | 06 | 6 | MULTI-01, MULTI-02, MULTI-03 | T64-05, T64-10 | Safe daemon/browser roster is exact Claude/OpenCode, Codex unshipped, observational, and local/native-free | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-adapter-compatibility.test.js"],["node","tests/mcp-agent-providers-storage.test.js"]]'` | ✅ green |
| 64-07-01 | 07 | 6 | MULTI-01, MULTI-02 | T64-01, T64-03, T64-04 | Generic cold/attach selection closes replay before task-child spawn and preserves direct Claude | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-server-topology.test.js","--section","selection-replay"],["node","tests/mcp-spawn-supervisor.test.js"]]'` | ✅ green |
| 64-07-02 | 07 | 6 | MULTI-01, MULTI-02 | T64-02, T64-07 | Fake spawn observes the exact transient password only on owned server and selected attach child, absence on cold/preflight, immediate env scrubbing, transient Basic health, and no `--password` | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-server-topology.test.js","--section","owned-health"],["node","tests/mcp-agent-orphan-recovery.test.js"]]'` | ✅ green |
| 64-07-03 | 07 | 6 | MULTI-01, MULTI-02 | T64-03, T64-07 | One coalesced server, fresh tasks, bounded idle/close/recovery, zero user-process signaling, and no retained raw secret | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-server-topology.test.js","--section","lease-lifecycle"],["node","tests/mcp-agent-orphan-recovery.test.js"],["node","tests/mcp-spawn-supervisor.test.js"]]'` | ✅ green |
| 64-08-01 | 08 | 7 | MULTI-01, MULTI-02, MULTI-03 | T64-05, T64-06, T64-07 | Supervisor interprets shared descriptors/verifier only; clean policy/model passes before acceptance; no OpenCode import/callback/id branch | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-server-topology.test.js","--section","policy-attestation"],["node","tests/agent-provider-forbidden-flags.test.js"]]'` | ✅ green |
| 64-08-02 | 08 | 7 | MULTI-01, MULTI-02, MULTI-03 | T64-02, T64-04, T64-06 | Task is written once; server/attach receive only the selected transient binding; cold/preflight receive none; captured env is scrubbed; fallback warnings fail closed; no replay | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-server-topology.test.js","--section","task-once"],["node","tests/mcp-spawn-supervisor.test.js"],["node","tests/mcp-reverse-channel-contract.test.js"]]'` | ✅ green |
| 64-08-03 | 08 | 7 | MULTI-01, MULTI-02, MULTI-03 | T64-08, T64-09 | Result stays private through EOF/stderr/exit/tree/runtime cleanup; failures expose zero success | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-spawn-supervisor.test.js"],["node","tests/mcp-opencode-server-topology.test.js","--section","terminal-barrier"],["node","tests/mcp-reverse-channel-contract.test.js"],["node","tests/mcp-bridge-topology.test.js"]]'` | ✅ green |
| 64-09-01 | 09 | 7 | MULTI-01, MULTI-02 | T64-01, T64-10 | Exact canonical table/preflight accepts only shipped Claude/OpenCode and keeps request/evidence authority separate | `node tests/mcp-agent-providers-storage.test.js && node tests/delegation-routing.test.js --section provider-preflight && node tests/mcp-bridge-background-dispatch.test.js --section delegation-provider-authority` | ✅ green |
| 64-09-02 | 09 | 7 | MULTI-01, MULTI-02 | T64-04, T64-10 | Provider-bound one-time challenges/trust cannot cross adapters or stale selection | `node tests/delegation-consent.test.js && node tests/delegation-routing.test.js --section provider-consent && node tests/mcp-bridge-background-dispatch.test.js --section delegation-consent-order` | ✅ green |
| 64-09-03 | 09 | 7 | MULTI-01, MULTI-02 | T64-04, T64-10 | Background alone sends adapterId and freezes matching provider/billing metadata at acceptance | `node tests/delegation-routing.test.js && node tests/mcp-bridge-background-dispatch.test.js --section delegation-provider-routing` | ✅ green |
| 64-10-01 | 10 | 8 | MULTI-01, MULTI-03 | T64-08, T64-10 | Durable entries accept canonical OpenCode, force unknown billing, and keep result nonterminal | `node tests/delegation-event-store.test.js` | ✅ green |
| 64-10-02 | 10 | 8 | MULTI-01, MULTI-03 | T64-08, T64-10 | Controller persists before fanout and silently hydrates concurrent provider identity/exact-once state | `node tests/delegation-controller.test.js` | ✅ green |
| 64-10-03 | 10 | 8 | MULTI-01, MULTI-03 | T64-09, T64-10 | Closed adapter-specific drift detail is bounded, identity-matched, and independently throttled | `node tests/agent-protocol-drift-diagnostics.test.js && node tests/mcp-bridge-background-dispatch.test.js --section agent-protocol-drift` | ✅ green |
| 64-11-01 | 11 | 8 | MULTI-01, MULTI-02, MULTI-03 | T64-05, T64-10 | Existing Providers model maps safe evidence and exact Not reported copy without selection/billing/native leakage | `node tests/providers-panel-logic.test.js && node tests/mcp-agent-providers-storage.test.js` | ✅ green |
| 64-11-02 | 11 | 8 | MULTI-01, MULTI-02, MULTI-03 | T64-10 | Existing second row retains exact DOM/order/copy/focus/a11y with one nonvisual helper script and no CSS/layout branch | `node tests/providers-panel-ui.test.js` | ✅ green |
| 64-12-01 | 12 | 9 | MULTI-01, MULTI-02, MULTI-03 | T64-04, T64-10 | Existing consent/lifecycle DOM uses canonical labels, provider-free start, and no topology/replay branch | `node tests/delegation-sidepanel-ui.test.js --section opencode-lifecycle && node tests/providers-panel-ui.test.js --section delegation-trust` | ✅ green |
| 64-12-02 | 12 | 9 | MULTI-01, MULTI-02, MULTI-03 | T64-08, T64-10 | Same normalized feed shows Billing not reported and no success before authoritative terminal | `node tests/delegation-sidepanel-ui.test.js && node tests/delegation-event-store.test.js` | ✅ green |
| 64-13-01 | 13 | 10 | MULTI-01, MULTI-02, MULTI-03 | T64-10 | Exactly three genuine scenarios remain unchecked human_needed/pending/evidence-empty | `node tests/delegation-phase-contract.test.js --section phase64-uat-ledger` | ✅ green |
| 64-13-02 | 13 | 10 | MULTI-01, MULTI-02, MULTI-03 | T64-01–T64-10 | Focused/root/CI/source-security matrix pins the first commit, atomic exposure, transient-secret contract, and workspace preservation exactly once | `node tests/phase64-full-tests-harness.test.js && node scripts/run-phase64-full-tests.mjs` | ✅ green |
| 64-13-03 | 13 | 10 | MULTI-01, MULTI-02, MULTI-03 | T64-01–T64-10 | Exact 13-plan/28-task/decision/threat map and guarded full baseline block every gap | `node tests/delegation-phase-contract.test.js --section phase64-validation && node tests/agent-provider-forbidden-flags.test.js && node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` | ✅ green |

No three consecutive tasks lack deterministic automated verification; every task has one exact command.

---

## Requirement Verification

| Requirement | Primary plans | Blocking evidence | Residual evidence |
|-------------|---------------|-------------------|-------------------|
| **MULTI-01** | 02–03, 05–13 | Exact five methods; immutable generic topology/attestation/secret-binding seam; role-aware runtime boundary; exact registry; safe projections; owned lease; shared verifier; authoritative routing; durable lifecycle and unchanged UI | Genuine authenticated cold/attach browser runs remain human_needed |
| **MULTI-02** | 04–09, 11–13 | Exact detector/profile; private config; prompt digest; ordered deny/final fsb_* allow; descriptor-only attestations; generic verifier; unknown auth/billing and approved UI copy | Genuine account/model usability remains human_needed |
| **MULTI-03** | 01–03, 05–06, 08, 10–13 | First-commit sanitized schema fixture; strict parser; native mutations; generalized drift gate; exact rosters; safe drift; terminal/UI failure behavior and CI wiring | Genuine sanitized stream provenance review remains human_needed |

All requirement ids appear in PLAN frontmatter and are mechanically rechecked by Task 64-13-03.

---

## Decision Coverage

| Decision | Primary plan/task owners | Mechanical closure |
|----------|--------------------------|--------------------|
| D64-01 cold default; verified attach only | 64-07-01..03, 64-12-01..02, 64-13-03 | Cold/lease/fallback and UI-equivalence counts |
| D64-02 FSB-owned loopback/random secret; never user process | 64-03-01, 64-07-02..03, 64-13-02..03 | Identity/auth/recovery zero-kill, transient env/header, and discovery source gates |
| D64-03 exact five methods; generic topology | 64-02-01, 64-05-01, 64-07-01, 64-08-01, 64-13-03 | Exact method/type/import/callback/id-branch contract |
| D64-04 one bounded server; fresh task/session | 64-02-01, 64-03-01, 64-07-01..03 | Topology, runtime roles, concurrency, lease, idle and no-continuation tests |
| D64-05 private/pure/effective policy | 64-04-02..03, 64-08-01, 64-13-03 | Exact config plus generic preflight/server poison matrix |
| D64-06 stdin-only task | 64-02-01, 64-04-02, 64-08-02, 64-13-02 | Non-representability and one task-child stdin write |
| D64-07 primary fsb/default deny/final allow | 64-04-02..03, 64-08-01..02, 64-13-03 | Prompt/permission/tool/fallback-warning gates |
| D64-08 native auth/model ownership; fail closed | 64-04-01..03, 64-06-01..02, 64-08-01, 64-11-01 | Unknown auth/no override plus usable-model verdict and copy |
| D64-09 pinned honest fixture | 64-01-01, 64-05-01, 64-13-01..03 | Literal-first provenance/parser/drift gate, atomic production bijection, CI and pending live row |
| D64-10 normalized mapping | 64-01-01, 64-08-03, 64-10-01..03, 64-12-02 | Native parser to durable provider-neutral sequence |
| D64-11 strict session/order/drift | 64-01-01, 64-02-01, 64-08-03, 64-10-03 | Closed reasons, bounded schema/state and safe diagnostics |
| D64-12 candidate plus process truth | 64-01-01, 64-08-03, 64-10-01..02, 64-12-02 | Private candidate and completed-terminal UI barrier |
| D64-13 existing row/provider-neutral UX | 64-06-02, 64-09-01..03, 64-11-01..02, 64-12-01..02 | Exact rosters, no visible layout/provider renderer/authority |
| D64-14 auth/billing unknown | 64-06-01..02, 64-09-03, 64-10-01..02, 64-11-01..02, 64-12-02 | Unknown/Not reported and zero dollar/subscription inference |
| D64-15 pre-spawn fallback only; no replay | 64-03-01, 64-07-01, 64-08-02..03, 64-09-02..03, 64-12-01 | Durable role boundary, permanent replay fence, and one browser/UI start/terminal |
| D64-16 complete blocking coverage | 64-01..13; closure 64-13-02..03 | Exact maps, focused/root/CI/source/full-suite gates |

---

## Threat References and Owners

| Ref | Threat | Required control | Primary task owners |
|-----|--------|------------------|---------------------|
| T64-01 | Adapter-specific branch, callback, or sixth method | Exact five methods; closed immutable topology/attestation grammar; shared verifier; no provider import/id branch | 64-02-01, 64-05-01, 64-07-01, 64-08-01, 64-09-01, 64-13-02/03 |
| T64-02 | Task or Basic secret leaks | Task-only stdin; fixedEnv/secret-binding split; exact owned-server/selected-attach env materialization; cold/direct/preflight absence; transient Basic header; immediate scrubbing; no retention/serialization/`--password` | 64-02-01, 64-03-01, 64-04-02, 64-07-02, 64-08-02, 64-13-02/03 |
| T64-03 | User OpenCode process attach/kill | New loopback child only; retained identity/generation/config; no discovery; fail-closed ambiguity | 64-03-01, 64-07-01/03, 64-13-02/03 |
| T64-04 | Attach fallback replays accepted work | One pre-spawn fallback; replay closes before child spawn; exact-once browser/UI lifecycle | 64-07-01, 64-08-02, 64-09-02/03, 64-12-01, 64-13-03 |
| T64-05 | Config/profile evidence injects authority | Exact private 1.14.25 policy, closed declarative assertions, shared generic verifier, exact compatibility source | 64-04-01..03, 64-05-01, 64-06-01/02, 64-08-01, 64-11-01, 64-13-03 |
| T64-06 | Missing fsb agent/tool fallback | Prompt digest/primary/no model override; ordered deny/final fsb_* allow; stderr warning rejection | 64-04-02/03, 64-08-01/02, 64-13-03 |
| T64-07 | Stale/wrong server receives task | CSPRNG Basic auth; exact health/version; identity/config/generation; bounded lease and server attestation | 64-07-02/03, 64-08-01, 64-13-03 |
| T64-08 | Premature/fabricated success | Continuation-aware parser; private candidate; clean exit/tree/runtime barrier; completed terminal before UI success | 64-01-01, 64-08-03, 64-10-01/02, 64-12-02, 64-13-03 |
| T64-09 | Malformed/reordered/duplicate/post-terminal data survives | First-commit exact bounded schemas/state/fixture mutators; closed diagnostics; generalized native drift gate; atomic production bijection | 64-01-01, 64-05-01, 64-08-03, 64-10-03, 64-13-03 |
| T64-10 | Native/server/auth/billing data leaks to browser/UI | Closed safe projection/canonical metadata, unknown billing, text-only existing UI, no native/topology/version/secret data | 64-01-01, 64-06-01/02, 64-09-01..03, 64-10-01..03, 64-11-01/02, 64-12-01/02, 64-13-01..03 |

Applicable ASVS L1 domains are explicit in plan threat models: V2 authentication-secret handling, V3 replay, V4 access control/process authority, V5 validation/serialization, V7 error/log confidentiality, V13 API/health verification, and V14 configuration safety. Every HIGH/CRITICAL threat blocks; none is accepted.

---

## Focused Command Matrix

| Area | Workspace-safe command |
|------|------------------------|
| First-commit parser/fixture/native drift | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","first-commit-drift-gate"],["node","tests/mcp-agent-stream-fixture.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` |
| Contract/profile/composition | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-provider-contract.test.js"],["node","tests/mcp-opencode-adapter.test.js","--section","adapter"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` |
| Owned server/supervisor/recovery | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-server-topology.test.js"],["node","tests/mcp-spawn-supervisor.test.js"],["node","tests/mcp-agent-orphan-recovery.test.js"]]'` |
| Registry/matrix/doctor/inventory/projection | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-adapter-compatibility.test.js"],["node","tests/mcp-diagnostics-status.test.js"],["node","tests/mcp-client-inventory.test.js"],["node","tests/mcp-agent-providers-storage.test.js"]]'` |
| Reverse channel | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-reverse-channel-contract.test.js"],["node","tests/mcp-bridge-topology.test.js"]]'` |
| Extension authority/persistence | `node tests/delegation-consent.test.js && node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js && node tests/delegation-routing.test.js && node tests/mcp-bridge-background-dispatch.test.js` |
| Providers row | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js && node tests/mcp-agent-providers-storage.test.js` |
| Delegated side panel/feed | `node tests/delegation-sidepanel-ui.test.js && node tests/delegation-event-store.test.js` |
| Drift/source/security | `node tests/agent-protocol-drift-diagnostics.test.js && node tests/agent-provider-forbidden-flags.test.js && node tests/delegation-phase-contract.test.js --section phase64-validation` |
| Complete Phase 64 | `node scripts/run-phase64-full-tests.mjs` |
| Repository baseline | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` |

---

## Manual-Only Verifications

| Scenario | Requirement | Status | Result | Evidence | Why manual |
|----------|-------------|--------|--------|----------|------------|
| Genuine authenticated OpenCode-to-browser delegation with real account/model configuration | MULTI-01–03 | `human_needed` | `pending` | *(empty)* | Requires installed CLI, real account/model, daemon, browser, and deliberate external effects |
| Installed OpenCode 1.14.25 Providers transition plus keyboard/screen-reader behavior | MULTI-01–03 | `human_needed` | `pending` | *(empty)* | Live rendering, focus, announcements, and assistive technology require human judgment |
| Live cold and FSB-owned attach paths produce the same feed/terminal summary and kill-switch reclamation | MULTI-01–03 | `human_needed` | `pending` | *(empty)* | Fakes/fixtures cannot prove native process/network/browser integration |

Task 64-13-01 creates one ledger with exactly these three unchecked rows. Later evidence must be sanitized and must not retain task text, credentials, model metadata, raw events, local paths, endpoint/port, or Basic secret.

---

## Validation Sign-Off

- [x] Exactly 13 PLAN files and 28 unique task ids are mapped once.
- [x] Dependency waves are valid: 01 → 02 → 03 → 04 → 05 → {06,07} → {08,09} → {10,11} → 12 → 13, with no same-wave file conflict.
- [x] Plan 64-01 has exactly one task and is the literal first Phase 64 implementation task/commit: complete strict parser, honest fixture, native negative corpus, and generalized adapter drift gate land together; planning-document commits do not count as implementation commits; every later plan depends on it transitively.
- [x] Plan 64-05 has exactly one atomic task/commit: production adapter composition, registry exposure, compatibility row, and full fixture/parser/drift bijection cannot split.
- [x] Frontmatter covers MULTI-01, MULTI-02, and MULTI-03.
- [x] Every task has a deterministic automated command; sampling has no gap.
- [x] Every missing harness/fixture/runner has a test-first Wave-0 owner before dependent production edits.
- [x] Every MCP build/compiled check uses the workspace-preserving wrapper.
- [x] D64-01..16 and T64-01..10 have concrete plan/task owners and mechanical closure in 64-13-03.
- [x] The five-method contract includes closed deeply frozen provider-neutral preflight/attestation/topology data and a shared verifier; no callback, sixth method, adapter-id branch, OpenCode supervisor import, or task value is planned.
- [x] Public serialized `fixedEnv` is separate from `SpawnSecretEnvBinding`; only `OPENCODE_SERVER_PASSWORD` → `owned_server_basic_password` is legal; the raw password string materializes only in the direct owned-server or selected attach spawn env, while the Basic header is derived transiently from opaque supervisor-only bytes; cold/direct/preflight carry none; fake-spawn tests prove exact propagation and immediate post-call scrubbing; no raw string is retained, serialized, logged, placed in argv, or exposed to browser/UI, and the volatile bytes are zeroed at lease teardown.
- [x] Role-aware runtime journal/private-artifact migration is isolated before owned-server lifecycle; registry/matrix exposure is isolated atomically before inventory/doctor/browser projection.
- [x] Providers row (11) and delegated side-panel/feed (12) remain separate bounded UI plans.
- [x] Every plan includes concrete assets, trust boundaries, threats, mitigations, verification, HIGH/CRITICAL blocking, and residual evidence boundaries.
- [x] The approved UI-SPEC uses existing visible markup/CSS/components only; HTML deltas are exact local helper script order, with no visible structure/layout/provider renderer.
- [x] No live credential/model/server/user process/browser/accessibility evidence is counted as automated.
- [x] Exactly three genuine scenarios remain unchecked `human_needed` / `pending` / evidence-empty.
- [x] No new package or Phase 60–63 security/lifecycle relaxation is planned.

**Approval:** automated validation complete; genuine external UAT remains pending.
