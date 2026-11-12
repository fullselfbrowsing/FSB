---
phase: 64-opencode-adapter
verified: 2026-07-21T13:22:31Z
status: human_needed
score: "4/4 roadmap success criteria verified; 66/66 plan truths and 36/36 key links accounted"
requirements:
  MULTI-01: verified
  MULTI-02: verified
  MULTI-03: verified
automated_gaps: 0
human_verification:
  - test: "UAT64-01 — Genuine authenticated OpenCode-to-browser delegation"
    expected: "Provider-bound consent, genuine OpenCode browser tool use, exact-once kill/reclaim, no replay, terminal-gated success, and Billing: Not reported"
    why_human: "Requires an installed authenticated OpenCode 1.14.25 CLI, real account/default model, disposable Chrome profile, paired daemon/extension, and a controlled external site"
  - test: "UAT64-02 — Installed 1.14.25 Providers, keyboard, and screen-reader behavior"
    expected: "The unchanged second agent row reports supported OpenCode with Not reported auth/billing, coherent keyboard focus, one causal live-region announcement, silent hydration, and understandable theme/forced-color presentation"
    why_human: "Requires a genuine installed CLI, live Chrome rendering, keyboard interaction, a screen reader, and OS/browser accessibility modes"
  - test: "UAT64-03 — Live cold and FSB-owned attach feed/summary equivalence"
    expected: "Cold remains the default without a verified lease; attach uses only an FSB-owned verified lease; both create fresh tasks and identical provider-neutral feed/terminal summaries with no replay or duplication"
    why_human: "Requires real OpenCode processes, a genuine FSB-owned server lease, live loopback health/attach behavior, and observed browser settlement"
---

# Phase 64: OpenCode Adapter Verification Report

**Phase goal:** Prove that the frozen five-method `AgentProviderAdapter` contract accommodates OpenCode cold task execution and attach to an FSB-owned `opencode serve` process without a Phase 60 rewrite; ship a pinned private agent definition and CI-covered event schema; and project OpenCode through the existing provider-neutral browser delegation UX.

**Verified against:** worktree HEAD `d0cc82dc1948bb453a9882839aa32caa84b74557`. The implementation identity remains `122bdd1c`; every later commit through HEAD changes only Phase 64 review/security documentation.

**Status:** `human_needed`. Deterministic implementation, wiring, security, regression, and history checks are complete. Exactly three genuine external scenarios remain pending in `64-HUMAN-UAT.md`.

**Re-verification:** No — initial goal verification.

## Goal Achievement

### ROADMAP success criteria

| # | Success criterion | Status | Direct code/history evidence |
|---|---|---|---|
| 1 | OpenCode implements the five-method adapter with `serverMode=true`; the generic supervisor selects cold or attach from declarative topology without an OpenCode-specific execution branch. | VERIFIED | `adapter.ts:877-882` remains exactly `detect`, `buildSpawn`, `parseEvents`, `kill`, `caps`; `opencode.ts:41-46,56-121` returns those five frozen methods with task-only/server-mode capabilities. `opencode-profile.ts:850-878` declares cold, attach, and loopback server argv. `spawn-supervisor.ts:1317-1341,1696+` interprets `direct` versus `owned_server` topology and has no OpenCode profile import or adapter-id execution branch. The production composition at `spawn-supervisor.ts:3363-3410` supplies real role-scoped `AgentRuntimeFiles` paths to the production registry. |
| 2 | A pinned private FSB agent definition enforces equivalent tool/system-prompt intent without model override or inherited project policy. | VERIFIED | `opencode-detect.ts:11,271-340` retains exact OpenCode `1.14.25` native detection. `opencode-profile.ts:226-257,471-545` binds the shipped FSB prompt/description digests, `default_agent: fsb`, `share: disabled`, updates/plugins/commands/instructions disabled, primary mode, 40 steps, wildcard deny followed by the final `fsb_*` allow, and no model override. Role-scoped private config/test-home/managed-config artifacts are materialized and journal-aligned before task/server/preflight spawn. Process and server effective-policy attestations fail closed through the shared verifier. |
| 3 | The OpenCode fixture and native negative corpus are in the existing Phase 62 drift CI gate from the first implementation commit; Plan 05 exposes adapter/registry/matrix/bijection atomically. | VERIFIED | Git history proves the first Phase 64 implementation commit is `6bbf6727` and contains the complete parser, schema-derived `opencode-1.14.25` fixture/manifest, shared drift type, stream-fixture/drift tests, native negative corpus, and OpenCode test. At that commit `.github/workflows/ci.yml:51` already invokes the exact Phase 62 drift script, while registry/matrix remain Claude-only and `registry.require('opencode')` is asserted to fail. The sole exposure commit `b04e97df` changes exactly seven planned files together: `opencode.ts`, registry, compatibility matrix, drift-smoke, provider-contract, compatibility, and adapter tests. Its exact roster is Claude/OpenCode with parser/fixture/matrix/registry bijection and Codex absent. Later Plan 05 maintenance commits `3646673c` and `623cb593` are test-only. |
| 4 | OpenCode is selectable and uses the same streaming feed, kill switch, terminal summary, persistence, and service-worker recovery UX with no adapter-specific side-panel branch. | VERIFIED (automated); live corroboration pending | `delegation-providers.js` is the exact frozen Claude/OpenCode metadata table and gives OpenCode `billingKind: unknown`. `background.js:1604-1669,2100-2249` rereads authoritative saved selection, rechecks it before challenge consumption, sends only canonical `adapterId` at `delegate.start`, validates the returned adapter, and freezes accepted run identity. Event store/controller append before fanout and rehydrate canonical provider identity. `delegation-feed.js:426,541-569` hides result/summary until an authoritative completed terminal and maps unknown billing to `Billing not reported`. OpenCode reuses the existing second Providers row and existing side-panel/feed nodes; source/DOM gates reject provider-specific CSS, layout, renderer, replay, and raw native fields. |

**Roadmap score:** 4/4 criteria verified. Criterion 4's implementation and deterministic behavior are green; its genuine browser/process/accessibility evidence is why the overall status remains `human_needed`.

## First-Implementation and Atomic-Exposure History Audit

The history condition was checked against commit contents, not summaries.

### First implementation commit — `6bbf6727`

`git log --reverse` from the Phase 64 planning boundary through Plan 05 shows this first path-touching implementation sequence:

1. `6bbf6727 feat(64-01): add OpenCode stream drift gate`
2. `ce19337c feat(64-02): freeze provider topology contract`
3. `6119fad0 feat(64-03): version role-aware runtime journal`
4. Plan 04 detector/profile test and implementation commits
5. `b04e97df feat(64-05): expose OpenCode adapter atomically`

The complete file roster of `6bbf6727` is:

- modified `adapter.ts` and `claude-stream.ts` to share provider-neutral drift;
- added `opencode-stream.ts` and `protocol-drift.ts`;
- added `opencode-1.14.25/contract-stream.jsonl` and `manifest.json`;
- modified the shared drift-smoke and stream-fixture suites;
- added `mcp-opencode-adapter.test.js`.

At the exact `6bbf6727` tree:

- the fixture contract roster is Claude plus OpenCode;
- the manifest is explicitly `schema-derived-contract`, `liveCapturePending: true`, and sanitized;
- the parser maps init/reasoning/text/tool completion/tool error/continuation/terminal records and rejects malformed shape/order/session/id/UTF-8/JSONL/bounds/provider-error/duplicate/missing/unknown cases;
- the pre-existing CI job invokes `node tests/mcp-agent-drift-smoke.test.js` exactly once;
- production registry and compatibility matrix deliberately remain Claude-only, and the test requires OpenCode lookup to fail before exposure.

This satisfies the exact “drift coverage from the first implementation commit” condition without pretending that an unregistered adapter was already shipped.

### Atomic production exposure — `b04e97df`

`git show --name-status b04e97df` contains exactly:

- `mcp/src/agent-providers/opencode.ts` (added);
- `mcp/src/agent-providers/registry.ts`;
- `mcp/src/agent-providers/compatibility.ts`;
- `tests/mcp-adapter-compatibility.test.js`;
- `tests/mcp-agent-drift-smoke.test.js`;
- `tests/mcp-agent-provider-contract.test.js`;
- `tests/mcp-opencode-adapter.test.js`.

The commit simultaneously establishes `['claude-code', 'opencode']` in the registry and matrix, enables `registry.require('opencode')`, and requires the fixture manifests to equal the registered contract roster. No registration-only or matrix-only production interval exists. Codex remains absent.

## Plan-Level Must-Have Audit

All 66 frontmatter truths were checked against current implementation/tests. All 39 artifact declarations resolve; after deduplication, all 35 unique declared artifacts exist and are substantive. The 36 declared key links were inspected at both endpoints and through their call/data boundaries.

| Plan | Truths | Links | Status | Current evidence |
|---|---:|---:|---|---|
| 64-01 parser/fixture/drift-first | 5 | 3 | VERIFIED | Strict bounded OpenCode parser, schema-derived 1.14.25 manifest/JSONL, native positive/negative corpus, shared typed drift, exact existing CI command, and history proof above. Candidate result is held until EOF. |
| 64-02 frozen adapter topology | 6 | 3 | VERIFIED | Exact five methods; provider-neutral direct/owned-server topology; closed process roles; fixed env separated from one opaque password binding; server/attach-only binding legality; closed process/server attestation declarations. |
| 64-03 role-aware runtime journal | 4 | 1 | VERIFIED | Version-2 role-aware journal supports delegation/provider-server/policy-preflight, exact private artifacts, 0700/0600 atomic storage, legacy v1 Claude reads, role-aware removal/recovery, and no representable task/secret. |
| 64-04 detection/private policy | 5 | 3 | VERIFIED | Native retained-binary identity before/after exact `--version`, exact 1.14.25, private FSB config/agent policy, stdin-only task argv, loopback server/attach declarations, closed effective-policy assertions. |
| 64-05 atomic exposure | 4 | 3 | VERIFIED | One seven-file production exposure commit establishes adapter, exact registry/matrix order, parser/fixture bijection, caps, and drift smoke together; Codex remains unshipped. |
| 64-06 bounded evidence | 4 | 3 | VERIFIED | Client inventory, doctor, authenticated compatibility route, and browser storage project the exact shipped Claude/OpenCode compatibility roster; path/version stay local to doctor; auth is unknown/Not reported; Codex compatibility stays unshipped. |
| 64-07 generic owned-server lifecycle | 6 | 3 | VERIFIED | Cold is selected without a reusable lease; only FSB-created loopback/port-0 server trees can form leases; authenticated health, version, identity, generation, and configuration digest gate attach; password bytes are transient/zeroed; bounded idle/recovery/cleanup has no user-process discovery or kill. |
| 64-08 authority and terminal barriers | 6 | 3 | VERIFIED | Process/server attestations precede task authority; replay closes immediately before spawn; task writes once to stdin; stderr fallback is bounded; parser result stays private until clean exit, tree settlement, and runtime cleanup; every failure discards success and terminalizes once. |
| 64-09 provider authority/consent | 4 | 3 | VERIFIED | One exact immutable provider table; authoritative saved selection/preflight; provider/task/nonce/TTL-bound one-time challenge; isolated trust; selection recheck before consume; canonical adapter only at daemon boundary; immutable accepted metadata survives setting changes. |
| 64-10 durable lifecycle/drift | 6 | 3 | VERIFIED | Normalized-only append-before-fanout store; provider-neutral controller/hydration; result nonterminal until explicit terminal; exact per-adapter drift grammar/throttle; OpenCode tokens persist; OpenCode billing is unknown and USD null. |
| 64-11 existing Providers row | 4 | 3 | VERIFIED | OpenCode remains the existing second radio row; safe Supported/Degraded/Unsupported evidence; exact Not reported auth/billing copy and fixed help links; no visible DOM/CSS/order/layout change; selection, recommendation, forms, API values, and dirty state remain independent. |
| 64-12 existing side panel/feed | 5 | 2 | VERIFIED | Canonical label drives existing consent/lifecycle/feed; client request stays provider-free; cold/attach/fallback are visually identical; no replay path; `Billing not reported`; result and summary require completed terminal; hydration and duplicate events remain silent. |
| 64-13 exact closure/honest UAT | 7 | 3 | VERIFIED | Exact 13-plan/28-task/wave/requirement/threat map, 25-command focused runner, root/CI occurrence contracts, first-commit/atomic-exposure assertions, source/security gates, preservation harness, guarded repository baseline, and exactly three unpromoted UAT rows. |

**Must-haves:** 66/66 verified. **Declared links:** 36/36 wired. **Unique declared artifacts:** 35/35 present and behaviorally connected.

## Key-Link Rollup

Each row groups all links declared by that plan; no link was accepted merely because both files existed.

| Plan | Declared boundary traced | Status |
|---|---|---|
| 01 | OpenCode native JSONL -> production parser -> shared typed drift -> generalized fixture harness -> existing Phase 62 CI job | WIRED |
| 02 | Adapter `buildSpawn` -> closed topology/process/secret descriptors -> supervisor interpreter; attestations -> shared policy verifier | WIRED |
| 03 | Supervisor prepare/activate/remove/recover -> role-aware runtime journal and private artifact paths | WIRED |
| 04 | Production adapter -> retained detector/private profile; profile assertion descriptors -> shared verifier | WIRED |
| 05 | Production registry -> OpenCode adapter; compatibility matrix/manifest -> generalized drift bijection | WIRED AT ONE COMMIT |
| 06 | Detector/registry/matrix -> inventory and doctor; authenticated compatibility route -> safe browser persistence | WIRED |
| 07 | Generic supervisor topology selection -> owned server creation/health/lease -> identity-bound cleanup/recovery | WIRED |
| 08 | Supervisor preflight verifier -> task spawn; parser/stderr/exit -> private candidate -> tree/runtime cleanup -> terminal publication | WIRED |
| 09 | Background authoritative settings -> canonical helper/preflight/consent -> `delegate.start`; accepted id -> frozen run context | WIRED |
| 10 | Background normalized events -> event store; controller -> append-before-fanout/hydration; safe drift detail -> per-adapter reporter | WIRED |
| 11 | Validated compatibility storage -> pure Providers mapper -> unchanged existing DOM/details nodes | WIRED |
| 12 | Existing side-panel provider-free intent -> background; canonical controller snapshot -> existing feed/summary terminal gate | WIRED |
| 13 | Focused runner -> build preserver; root test -> sole CI invocation; phase contract -> exact pending UAT ledger | WIRED |

## End-to-End Data and Authority Trace

| Flow | Trace | Result |
|---|---|---|
| Provider selection and consent | `chrome.storage.local` authoritative selection -> canonical two-provider helper -> compatibility/preflight -> provider/task-bound one-time challenge -> selection recheck -> challenge consume -> authenticated `delegate.start({adapterId, task})` | Only background can choose the adapter; the side-panel start request carries no provider id; a changed provider cannot replay another provider's consent. |
| Private policy and process authority | retained 1.14.25 detector -> role-scoped private runtimes -> process-policy attestation -> generic cold/verified-attach selection -> durable prepare/spawn/activate -> stdin task once | No inherited project config, model override, shell, arbitrary user process, task argv, or persistent secret enters authority. |
| Owned server and transient secret | supervisor-generated high-entropy bytes -> direct server spawn env / selected attach env or transient Basic header -> authenticated loopback health + retained process identity -> bounded lease -> zeroed teardown | The raw password is absent from topology, fixed env, journal, argv, receipts, diagnostics, browser state, and UI. |
| Stream to terminal | bounded native JSONL -> normalized events -> private candidate -> clean EOF/stderr/exit -> verified tree/runtime cleanup -> result event + authoritative terminal | A candidate cannot become visible success after drift, nonzero exit, signal, duplicate/missing result, or cleanup failure. |
| Browser persistence and UI | frozen accepted provider context -> normalized append before fanout -> controller snapshot/hydration -> existing Providers/side-panel/feed text nodes | Provider identity survives setting changes/worker eviction; OpenCode auth and billing stay unknown; raw native/config/server/model data is non-representable. |
| Crash recovery | role-aware journal -> exact process identity inspection -> confirmed termination or fail-closed ambiguity -> role-specific graph removal; only delegation role creates restart-loss disposition | Server/preflight infrastructure is recoverable without fabricating a lost browser run or touching a user-owned process. |

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| MULTI-01 | SATISFIED | Exact five-method OpenCode adapter; task-only/server-mode caps; cold and verified attach declarations; generic supervisor interpretation; production role-scoped composition; clean tree/runtime settlement. |
| MULTI-02 | SATISFIED | Exact 1.14.25 retained detection and private OpenCode config with shipped FSB prompt/description, primary agent, deny-then-final-allow tools, no model override, and effective-policy attestations. |
| MULTI-03 | SATISFIED | Committed `opencode-1.14.25` fixture and manifest; schema-derived provenance remains honest; parser/native negatives/generalized drift gate are present from first implementation commit and execute in existing CI/root gates. |

No orphaned Phase 64 requirement exists: `REQUIREMENTS.md` marks all three complete and traceability maps each to Phase 64.

## Code Review and Security Regression

The initial code review found four real issues; verification checked their fixes in production paths rather than accepting the fix report:

| Finding | Fix evidence at current implementation | Status |
|---|---|---|
| CR-01 production runtime composition | `9935b7ce` adds closed role-scoped runtime declarations; production mints and resolves all three scopes; real `AgentRuntimeFiles` materializes config/test-home/managed-config before the applicable preflight/server/task and removes them after settlement. | CLOSED |
| WR-01 OpenCode token loss | `20208cb1` projects normalized `payload.tokens` when Claude-style `usage` is absent; actual pinned parser output persists 18 input, 11 output, 29 total tokens. | CLOSED |
| WR-02 inherited provider credentials | `5dd6e120` source-pins and scrubs the 142-name OpenCode credential/discovery roster for every process role while retaining operational PATH/HOME/XDG roots. | CLOSED |
| WR-03 detached preflight recovery | `122bdd1c` gives policy preflights durable prepare/activate/terminate/remove state and infrastructure-only startup recovery for prepared and active crash windows. | CLOSED |

The iteration-two review at implementation HEAD `122bdd1c` reports zero Critical, Warning, or Info findings across the 66-file review scope. `git diff --check` for current implementation paths passes. Commits after `122bdd1c` are review/security artifacts only.

`64-SECURITY.md` closes T64-01 through T64-10 with no accepted risk and `threats_open: 0`. Direct inspection confirmed the principal controls: five-method/closed-roster authority, stdin-only task, fixed-env versus opaque secret separation, no user-process discovery/kill, private policy isolation, shared exact attestations, identity-bound loopback leases, replay closure before spawn, candidate/cleanup terminal barrier, bounded drift diagnostics, and closed browser/UI projection.

## Automated Verification Executed by This Verifier

### Current focused Phase 64 matrix

Command: `node scripts/run-phase64-full-tests.mjs`

Result: exit 0 with both preservation receipts:

- `[mcp-build-preserver] PASS: MCP build and commands completed with workspace identity preserved`
- `[phase64-full-tests] PASS: focused matrix passed with workspace identity preserved`

The runner rebuilt MCP source and executed all 25 closed commands: first-commit parser/fixture gate, stream fixture, generalized drift smoke, adapter, production topology, provider contract, compatibility, supervisor, orphan recovery, reverse channel, bridge topology/background dispatch, inventory, doctor, provider storage, consent, routing, controller, event store, drift diagnostics, Providers logic/UI, side-panel/feed UI, forbidden-source checks, and the Phase 64 validation contract. Notable aggregates were event store 34/34, controller 41/41, doctor 298/298, and Phase 64 closure 106/106.

### Repository-wide regression baseline

Command: `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'`

The current-HEAD repository test child completed successfully and printed:

- `[phase60-full-tests] PASS: full suite passed and workspace state was preserved`

After that success, the *outer nested* preserver reported `Git index bytes or mode changed during the guarded lifecycle` and returned 1. This is the documented Conductor clean-entry stat-refresh race from Plan 13, not a test or semantic workspace failure. The prior Phase 13 exact gate passed both preservation layers with its reversible, candidate-proved `assume-unchanged` mitigation and restored all flags. This verifier did not mutate index flags to manufacture another green receipt.

Post-run semantic audit at current HEAD is exact:

- 402 pre-existing user-owned planning deletions remain;
- the same four pre-existing modified generated artifacts remain (`mcp/build/index.js`, `showcase/angular/public/llms-full.txt`, `showcase/angular/public/llms.txt`, and `showcase/angular/public/sitemap.xml`);
- staging is empty;
- no untracked file exists before this verification artifact;
- HEAD is unchanged.

Accordingly, the full test process is green at current source, while the outer raw-index observation is recorded as an environment/preservation diagnostic rather than hidden or mislabeled as an implementation gap.

### Other checks

| Check | Result |
|---|---|
| `git diff --check` on implementation/workflow/test paths | PASS |
| First-commit drift/CI history and pre-exposure negative | PASS |
| Plan 05 exact atomic seven-file exposure history | PASS |
| Exact 13-plan / 28-task / D64-01..16 / T64-01..10 map | PASS (106/106 contract) |
| Five-method, shared-verifier, no-OpenCode-supervisor-branch, no-user-process, no-replay, secret, policy, terminal, and UI source gates | PASS |
| UAT honesty parser | PASS; exactly UAT64-01..03, unchecked, `human_needed`, `pending`, evidence-empty |
| UAT ledger SHA-256 before artifact creation | `e86f81d740c5045e5a12ec29455e973f3f3adc12b6f094d9ad03d298178e42cc` |

## Disconfirmation Pass and Limits

- The fixture is intentionally schema-derived, not a genuine authenticated capture. Its manifest still says `liveCapturePending: true`; automation did not promote it.
- Fake process/HTTP, VM/DOM, source, and storage tests prove deterministic contracts but cannot prove the user's installed OpenCode binary/account/default model, real loopback attach process, Chrome rendering, keyboard focus, or screen-reader speech.
- The supervisor never adopts an arbitrary already-running OpenCode process. Attach is only to a verified FSB-owned lease; otherwise selection is cold. This is the intended security contract, not missing generic attach behavior.
- The ROADMAP's top Phase 64 checkbox remains unchecked while all 13 plan rows and the milestone table say complete. That is tracking state consistent with pending milestone-end UAT, not a deterministic implementation gap.
- No live model request, user process, browser delegation, screenshot, keyboard walkthrough, or accessibility run was performed during this verification.

## Human Verification Required

### 1. UAT64-01 — Genuine authenticated OpenCode-to-browser delegation

Use an installed authenticated OpenCode 1.14.25 CLI, paired daemon/extension, disposable Chrome profile, and a benign reversible site. Verify provider-bound consent, real browser tool use, exact-once kill/reclaim, no stopped-task replay, success only after completed terminal, and the approved unknown-billing summary. Retain no task, credential, model, raw event, local path, endpoint, port, or secret evidence.

### 2. UAT64-02 — Installed Providers, keyboard, and screen-reader behavior

In live Chrome with OpenCode 1.14.25, inspect the unchanged second agent row across light/dark/forced-colors and keyboard/screen-reader use. Verify Supported plus Not reported semantics, visible/coherent focus, one causal shared-live-region announcement for user-triggered transitions, silent cold hydration, and no native/process data disclosure.

### 3. UAT64-03 — Live cold versus FSB-owned attach equivalence

Run equivalent benign fresh tasks first without a reusable lease and then with a verified FSB-owned lease. Verify cold default, FSB-owned attach only, fresh-session semantics, identical provider-neutral feed/terminal summary, exact-once kill settlement, and pre-spawn fallback with no duplicate feed, terminal, or replay.

All three scenarios remain unchecked, `human_needed`, `pending`, and evidence-empty by explicit user direction until the v0.9.91 milestone-end sweep.

## Gaps Summary

**No automated, source, wiring, requirement, security, or code-review gap was found.** The Phase 64 goal is deterministically achieved: 4/4 roadmap criteria, 66/66 plan truths, 36/36 declared links, 35/35 unique artifacts, MULTI-01..03, D64-01..16, and T64-01..10 are accounted; the current focused matrix and repository test process are green; the first-implementation and atomic-exposure history requirements are exact.

Overall status remains **`human_needed`** solely because UAT64-01, UAT64-02, and UAT64-03 require genuine external account/process/browser/accessibility evidence. No automated gap-closure plan is warranted.

---

_Verified: 2026-07-21T13:22:31Z_

_Verifier: Codex (`gsd-verifier`)_
