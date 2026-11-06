# Phase 65: Codex Adapter — Research

**Researched:** 2026-07-22  
**Overall confidence:** HIGH for the pinned Codex 0.142.5 CLI, auth-status, JSONL, environment, and repository integration contracts; MEDIUM for managed-config isolation because 0.142.5 deliberately retains system/cloud/admin layers and therefore requires a fail-closed effective-roster attestation.  
**Scope:** Planning research and deterministic validation design only. No paid/model-backed Codex task, live browser delegation, credential-file read, or genuine account-state capture was performed.

<user_constraints>

## User Constraints (from CONTEXT.md)

The planner and executor must treat `65-CONTEXT.md` as the decision authority. The most important locked boundaries are:

- Pin the production profile and schema-derived fixture to Codex 0.142.5. Installed 0.144.6 remains Degraded evidence, not a new baseline.
- Use direct stdin task mode only. Do not add resume/chat, model selection, output files/schema, images, extra directories, search, local/remote providers, full-auto, yolo, sandbox bypass, or a sixth adapter method.
- Retain `CODEX_HOME` only so Codex itself can use stored auth. Do not read/copy credentials or accept ambient `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN`, or `OPENAI_API_KEY`.
- Expose exactly one required FSB MCP server and no shell, file, web, collaboration, plugin/app, image, or foreign-MCP authority.
- Classify only `chatgpt`, `api_key`, `unauthenticated`, and `unknown`; bind the accepted state through consent and re-probe immediately before spawn.
- Keep all USD values null. ChatGPT and stored API-key modes receive distinct honest copy; unauthenticated/unknown cannot run.
- Normalize only the approved JSONL lifecycle, keep reasoning/plan text private, and require candidate result + clean exit + settled cleanup.
- Promote the existing third Providers row through shared abstractions. Do not add Codex-only markup/renderers or let compatibility select a provider.
- Fix the Phase 64 UI advisories generically: 44px delegated actions and no visible Profile row.
- Create exactly three unchecked Phase 65 human-UAT rows; automated evidence must not mark them complete.

### Clarifications produced by research

These refinements preserve the accepted behavior and are mandatory for the security boundary:

1. `--ignore-user-config` does not suppress user/project execpolicy rules. Add `--ignore-rules`; OpenAI documents the flags as separate controls.
2. Set `CODEX_EXEC_SERVER_URL=none` after scrubbing it and every `CODEX_EXEC_SERVER_NOISE_*` variable. In 0.142.5 this removes the local/remote execution/filesystem environment before model-facing tool construction.
3. Disable the pinned tool-bearing feature roster and set `project_doc_max_bytes=0`, `web_search="disabled"`, and a bounded FSB-only developer instruction. These are closed hardening values, not user-selected model/profile behavior.
4. Configure only the FSB MCP server with `required=true`, an exact enabled-tool allowlist, and server-local `default_tools_approval_mode="approve"`. This is not a global `--ask-for-approval` override; it authorizes only the already-consented first-party FSB tools so non-interactive stdin cannot turn an approval prompt into an accidental denial.
5. Because runtime TOML tables merge recursively, an `mcp_servers.fsb` override cannot delete a system/cloud/admin MCP server. Before task stdin, run a bounded secret-safe effective-roster attestation and fail closed unless the complete enabled roster is exactly `fsb` with the expected loopback endpoint and allowlist. Never log or persist the native roster response.
6. The roadmap's older “recorded” fixture wording is superseded by the accepted context: the first fixture is `schema-derived-contract` with `liveCapturePending: true`; genuine sanitized capture remains human UAT.
7. The roadmap's older “ChatGPT Plus” wording is also superseded: copy says “Included with your ChatGPT plan” and does not infer a plan tier.

</user_constraints>

<phase_requirements>

## Phase Requirements

| Requirement | Exact delivery interpretation | Planning consequence |
|---|---|---|
| MULTI-04 | Add `mcp/src/agent-providers/codex.ts` as the third exact five-method adapter, executing the reviewed 0.142.5 stdin/JSONL profile without deprecated or bypass flags. | Provider-neutral identity/runtime substrate lands before Codex exposure; the first production Codex commit must be atomic across adapter, profile, parser, registry, compatibility, fixture, and drift gates. |
| MULTI-05 | Detect exact ChatGPT, stored API-key, unauthenticated, or unknown state and disclose its billing bucket before start without leaking native status bytes. | Auth/billing becomes an immutable accepted-run identity, consent binds it, and the daemon re-probes before spawn. |
| MULTI-06 | Pin the 0.142.5 event contract in CI and keep `caps.chatMode:false`. | Add schema-derived fixture + native negative corpus, extend the Phase 62 roster bijection in the same exposure commit, and defer genuine capture honestly. |

</phase_requirements>

## Summary

Phase 65 should be built as a provider-neutral authority upgrade followed by one atomic Codex promotion. The runtime is viable with the pinned 0.142.5 binary, but the short baseline command is insufficient on its own: native execution environments, tool-bearing features, execpolicy rules, managed configuration, secret-bearing auth status, and auth/billing TOCTOU all need explicit controls.

The repository already has the correct high-level architecture: declarative adapters, one serve-owned supervisor, exact compatibility/drift rosters, provider-free browser requests, immutable ledgers, and shared provider UI. The phase should extend those abstractions rather than add Codex branches.

No new package is needed. Node core, the existing Zod schemas, source-pinned fixtures, VM/DOM tests, the TypeScript build, and current preservation runners cover the work.

## Critical Planning Findings

1. **No execution environment is stronger than read-only shell.** `CODEX_EXEC_SERVER_URL=none` causes 0.142.5 to omit the local environment; pinned `spec_plan.rs` then has no shell/apply-patch/view-image surface to expose. Scrub the four Noise variables first because they have independent remote-environment precedence.
2. **`--ignore-user-config` and `--ignore-rules` are distinct.** Pinned tests explicitly show ignored config can coexist with user policy files unless `--ignore-rules` is set.
3. **Exactly one MCP server needs attestation.** System, cloud, legacy-managed, and macOS-admin layers remain below runtime overrides. Recursive table merging cannot remove unknown lower-layer server names.
4. **MCP approval must be server-local.** 0.142.5 supports `default_tools_approval_mode="approve"` and per-tool overrides. Restrict the setting to `mcp_servers.fsb`; do not use `--ask-for-approval`, full disk access, or bypass flags.
5. **Auth status is secret-bearing stderr.** The API-key status includes a masked prefix and suffix. Classification must remain byte-oriented and bounded, and all buffers must be zeroed without creating a retained JS string.
6. **Auth is start authority, not cached decoration.** Compatibility may display safe state, but consent must bind `{providerId,label,profileVersion,authState,billingKind}` and the daemon must re-detect immediately before child creation/task stdin.
7. **The pinned event vocabulary is wider than the abbreviated context list.** It includes `item.updated`, `todo_list`, `collab_tool_call`, and error items. Exact reasoning/todo lifecycle may be recognized and discarded; every authority-bearing or unknown combination must fail loud.
8. **A terminal JSON record is not success.** Preserve the existing ordering: one valid result candidate, clean process exit, and completed tree/runtime cleanup before success.
9. **Static `metadata.billingKind` is no longer sufficient.** Codex can legitimately map one provider id to subscription or API billing. Every consumer must use the accepted auth/billing pair and persist it without re-deriving from current metadata.
10. **Codex exposure must be atomic.** The first production source containing `CODEX_ADAPTER_ID`, `createCodexAdapter`, a registry row, or a Codex fixture contract must also contain parser/negative corpus/matrix/drift-smoke coverage.

## Architectural Responsibility Map

| Concern | Owner | Required change |
|---|---|---|
| Adapter id/auth types | `mcp/src/agent-providers/adapter.ts` | Add `codex`; replace generic authenticated state with the closed four-state union while preserving Claude/OpenCode `unknown`. |
| Retained binary/version/profile | new `codex-detect.ts`, `codex-profile.ts`, `codex.ts` | Resolve native identity, classify 0.142.5 as supported and newer compatible versions as degraded, build one frozen task-only spawn description. |
| Environment isolation | shared sanitizer + `spawn-supervisor.ts` | Scrub provider credentials and exec-server/noise variables; fix `CODEX_EXEC_SERVER_URL=none`; use daemon scratch cwd; re-probe immediately before spawn. |
| FSB endpoint materialization | provider-neutral runtime reference + supervisor/runtime files | Resolve the serve-owned loopback endpoint into validated closed TOML arguments without exposing it to browser/task input. |
| Managed-MCP attestation | bounded supervisor preflight | Inspect effective enabled roster in memory and require exact FSB identity/URL/allowlist/approval; zero raw output and block on uncertainty. |
| JSONL parser | new `codex-stream.ts` | Strict source-derived state machine, safe normalized events, bounded drift reasons, held result candidate. |
| Compatibility/drift | `compatibility.ts`, `protocol-drift.ts`, fixture manifest, tests | Add exact third row and keep registry/matrix/parser/manifest bijection. |
| Runtime cleanup | `runtime-files.ts`, orphan/supervisor paths | Support a direct delegation with no private artifacts and remove empty scratch directories before terminal success. |
| Browser-safe inventory | `serve-delegation.ts`, diagnostics, client inventory, extension MCP projection | Project only safe classified auth/compatibility evidence; stale evidence forces auth to `unknown`. |
| Auth/billing authority | `delegation-providers.js`, preflight, consent, background | Centralize valid auth→billing pairs, bind them into challenges, compare daemon-start evidence before controller persistence. |
| Persistence | event store + controller | Persist exact five-field identity; reject event, hydration, prototype/accessor, extra-key, provider/auth/billing/profile drift. |
| Shared UI | Providers panel, options, feed, sidepanel CSS | Promote existing third row, drive exact copy from safe evidence, remove visible Profile row, raise all delegated actions including fixed Stop to 44px. |
| Closure | Phase 65 runner, CI, source/security gates, UAT ledger | Preserve dirty generated files, extend exact CI roster, and add exactly three pending human checks. |

## Standard Stack

### Core

| Layer | Existing mechanism | Why it remains correct |
|---|---|---|
| Process control | `node:child_process` with absolute retained command, argv array, `shell:false`, detached group, bounded streams | Preserves the Phase 59/60 spawn authority and avoids shell interpolation. |
| Validation | Existing Zod/exact-object helpers and closed clone/freeze functions | Required for hostile objects, extra keys, accessors, prototypes, and immutable identity. |
| Event normalization | Async JSONL parser yielding the existing `AgentEvent` union | Keeps provider-native data out of browser/service-worker code. |
| Persistence | Existing append-before-fanout delegation ledger/controller | Already supports exact-once settlement and rehydration; extend identity fields rather than branch. |
| Testing | Node assertion scripts, VM/DOM harnesses, TypeScript build, fixture drift smoke, root suite | Matches every touched trust boundary without adding dependencies. |

### Package Legitimacy Audit

No new npm, Rust, browser, or runtime package is recommended. Codex remains an external user-installed executable. Plans must not add an install task or vendor the binary.

## Architecture Patterns

### Pattern 1: Closed Direct Spawn Profile

The adapter should declare a frozen task-only profile equivalent to:

```text
codex exec - --json --ephemeral --ignore-user-config --ignore-rules
  --strict-config --color never --sandbox read-only --skip-git-repo-check
  -c <closed reviewed hardening values>
  -c mcp_servers.fsb.url=<validated daemon endpoint>
  -c mcp_servers.fsb.required=true
  -c mcp_servers.fsb.enabled=true
  -c mcp_servers.fsb.enabled_tools=<exact FSB allowlist>
  -c mcp_servers.fsb.default_tools_approval_mode="approve"
```

Task text remains the only stdin payload. It must be absent from argv, environment, scratch filenames/content, journals, logs, diagnostics, and errors. The supervisor, not the adapter, owns process creation and endpoint reference resolution.

Closed hardening includes `project_doc_max_bytes=0`, disabled web search, a minimal bounded developer instruction, and explicit false values for the pinned tool-bearing features that otherwise default on (`apps`, browser/computer-use families, hooks, image generation, multi-agent, plugins, shell/unified-exec families, skill dependency installation, tool elicitation/suggestion, and workspace dependencies). A pinned contract test should compare this feature vocabulary against 0.142.5 so silent rename/removal fails closed.

Forbidden source/runtime flags include `--full-auto`, `--yolo`, `--dangerously-bypass-approvals-and-sandbox`, `--dangerously-bypass-hook-trust`, `--ask-for-approval`, `--search`, `--add-dir`, `--model`, `--profile`, `--image`, `--output-schema`, `--output-last-message`, `resume`, `review`, remote mode, and local/OSS providers.

### Pattern 2: Shared Sanitized Environment for Detection and Spawn

Move credential stripping to one provider-neutral helper used by binary/auth detection, MCP attestation, and task spawn. Preserve the complete existing source-pinned roster and add:

- `CODEX_API_KEY`
- `CODEX_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `CODEX_EXEC_SERVER_URL`
- `CODEX_EXEC_SERVER_NOISE_REGISTRY_URL`
- `CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID`
- `CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN`
- `CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID`

After stripping, set only `CODEX_EXEC_SERVER_URL=none`. Fixed env must not be able to reintroduce a stripped key. Retain the real `CODEX_HOME`; do not inspect files beneath it. Use daemon-owned scratch roots for cwd/HOME-like non-auth config roots where the pinned CLI honors them.

### Pattern 3: Byte-Safe Auth Probe

Run the retained binary as `codex login status` with `shell:false`, the shared sanitized environment, fixed `cli_auth_credentials_store="file"`, a short timeout, and strict byte/event caps. Require empty stdout.

| Exit/stderr | Safe state | Handling |
|---|---|---|
| 0 + exact `Logged in using ChatGPT\n` | `chatgpt` | Discard bytes; publish only enum. |
| 0 + exact bounded API-key status shape | `api_key` | Classify from `Buffer` bytes; never stringify; zero chunks and aggregate. |
| 1 + exact `Not logged in\n` | `unauthenticated` | Publish enum + safe sign-in guidance. |
| Access token, PAT, Bedrock, malformed, overflow, timeout, signal, wrong channel/exit, or any other bytes | `unknown` | Fail closed for execution; no native text crosses the detector. |

The pinned source writes status to stderr and formats an API key with retained prefix/suffix. Tests need sentinel key fragments and should scan errors, diagnostics, snapshots, journals, emitted events, and fixtures for absence.

### Pattern 4: Exact MCP Authority Attestation

Runtime overrides are the highest config layer, but tables merge recursively. Pinned configuration order still includes system, enterprise cloud, legacy-managed, and macOS admin layers. Therefore:

1. Construct the exact FSB runtime overrides from a validated loopback endpoint and closed tool list.
2. Run a bounded native effective-roster inspection immediately before spawn under the same retained binary and sanitized environment.
3. Treat the native response as secret-bearing because MCP JSON can contain commands, headers, env, and URLs. Parse in memory, retain only boolean/exact-name comparisons, and zero raw buffers.
4. Require one enabled server named `fsb`, exact loopback URL, no bearer/header/env material, `required=true`, exact enabled tools, and server-local approve policy.
5. If the pinned CLI cannot prove layer-equivalent effective state, or any extra/ambiguous server exists, block with a safe profile-isolation diagnostic. Parser-time rejection is not prevention because a foreign tool may already have executed.

The planner may choose a stricter safe implementation (for example a source-pinned config-lock/effective-config proof) if tests demonstrate equivalence. It may not weaken this to prompt instructions plus post-hoc parser rejection.

### Pattern 5: Source-Derived JSONL State Machine

The pinned source defines these top-level families: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started`, `item.updated`, `item.completed`, and `error`.

| Native record | Normalized behavior |
|---|---|
| first/only `thread.started` with bounded id | emit one `init` |
| one `turn.started` | lifecycle only |
| completed `agent_message` | emit bounded `assistant` text |
| FSB `mcp_tool_call` started | emit sanitized `tool_use` with bounded identity; never arguments |
| matching successful FSB MCP completion | emit adjacent sanitized `tool_result`; never native result |
| exact reasoning/todo lifecycle/update | validate and discard all text/state |
| `turn.completed` with exact nonnegative bounded usage | hold one candidate `result` containing only safe token totals |
| command, file, web, collab, foreign/failed MCP, error item, `turn.failed`, top-level `error`, or unknown combination | throw bounded `agent_protocol_drift`; no result |

Track thread state, turn state, item ids, open MCP ids/server/tool identity, normalized count, line/stream/JSON complexity limits, one terminal candidate, and terminal position. Reject duplicate/missing lifecycle, start/completion mismatch, terminal while MCP is open, post-terminal events, invalid UTF-8/JSON, extra keys, numeric overflow, or incomplete EOF.

The parser returns a candidate only. Supervisor success remains gated on candidate + exit code 0 + no signal + settled process tree + successful runtime cleanup.

### Pattern 6: Immutable Accepted Auth/Billing Identity

Replace singular static billing metadata with one canonical closed mapping:

| Provider/auth | Billing | Runnable |
|---|---|---|
| Claude Code / `unknown` | `subscription` | unchanged existing policy |
| OpenCode / `unknown` | `unknown` | unchanged existing policy |
| Codex / `chatgpt` | `subscription` | yes |
| Codex / `api_key` | `api` | yes |
| Codex / `unauthenticated` | none/unknown display | no |
| Codex / `unknown` | `unknown` | no |

Every accepted run persists and validates exactly `{providerId,label,profileVersion,authState,billingKind}`. Safe compatibility evidence can display these values but cannot choose a provider or authorize spawn. Stale evidence forces `authState:'unknown'`.

Consent challenges bind auth and billing as well as provider/task. The daemon emits `delegation.started` with auth evidence; background compares it to the challenge-bound identity before controller persistence. A mismatch consumes/clears stale consent, stops before task stdin, and requires a fresh preflight.

### Pattern 7: Shared Product Promotion

Promote the dormant third Codex row through the canonical shipped roster; keep `control_panel.html` byte-identical if feasible. Options/Providers must render the selected safe row rather than calling auth/billing helpers without evidence.

The feed reads billing copy from persisted accepted identity:

- ChatGPT: `Included with your ChatGPT plan`
- API key: `Billed to the API key stored by Codex; dollar amount not reported.`
- unknown existing path: `Billing not reported`

USD remains null even for `billingKind:'api'`; do not activate the generic dollar formatter. Remove the visible Profile definition for all agents while continuing to validate `profileVersion` internally. Raise `.delegation-action` and the fixed delegated Stop control to at least 44px; preserve the existing narrow full-width layout, focus order, live regions, themes, forced colors, and reduced motion.

## Do Not Hand-Roll

- Do not parse `auth.json`, keyring data, or user config files.
- Do not spawn from the adapter or add `adapterId === 'codex'` supervisor branches.
- Do not let browser/provider compatibility choose billing or start authority.
- Do not estimate dollars or infer a ChatGPT plan tier.
- Do not accept a foreign MCP call and merely hide it from normalized events.
- Do not stringify raw API-key status output or native MCP roster data.
- Do not create a Codex renderer, component, markup row, or request payload field.
- Do not use installed 0.144.6 as fixture evidence.
- Do not mark schema-derived fixture provenance as live/recorded.
- Do not run a paid live task in automated closure.

## Runtime State Inventory

| State | Lifetime | Authority | Persisted? |
|---|---|---|---|
| retained binary identity/version/profile | detection → immediate pre-spawn recheck | daemon | safe classification only |
| raw login-status bytes | one bounded probe | none after classification | never; zeroed |
| safe auth state | compatibility display; then consent/run binding | daemon classification | safe enum only |
| billing kind | derived from canonical provider/auth mapping | daemon/browser shared closed contract | accepted run identity |
| effective MCP roster response | immediate pre-spawn attestation | none after comparison | never; zeroed |
| FSB endpoint | serve-owned daemon runtime | supervisor only | never browser-visible |
| task text | start request → child stdin | saved provider + consent authority | existing bounded persistence only; never argv/env/profile artifacts |
| native JSONL | child stdout → parser | parser only | never raw |
| normalized events | parser → ledger/controller/feed | existing normalized contract | yes, bounded |
| result candidate | parser terminal → supervisor settlement | supervisor | terminal only after corroboration |
| scratch directory | one delegation | supervisor/runtime files | no; removed before success |

## Common Pitfalls

| Pitfall | Consequence | Required prevention |
|---|---|---|
| Treating `--ignore-user-config` as complete isolation | inherited rules or managed MCP/tools remain | add `--ignore-rules`, closed feature/env profile, effective-roster attestation |
| Leaving exec-server Noise vars intact | remote execution/filesystem authority bypasses local disable | scrub all five exec-server variables, then set URL to `none` |
| Keeping static `metadata.billingKind` consumers | API-key runs rehydrate as subscription/unknown | persist accepted auth/billing and remove re-derivation |
| Using cached auth to start | auth changes after consent hit wrong billing bucket | immediate daemon re-probe and exact identity compare |
| Logging `codex login status` | key prefix/suffix leakage | byte-only classifier, zeroization, negative canaries |
| Ignoring `item.updated` | genuine pinned plan updates look like drift | validate/drop exact todo/reasoning updates only |
| Accepting native error/MCP payloads | secrets/reasoning/tool data cross trust boundary | stable reason codes and sanitized normalized payloads only |
| Emitting result before exit/cleanup | false success on crash/orphan | candidate + clean exit + settled cleanup ordering |
| Partial roster exposure | Codex selectable without parser/drift protections | atomic exposure source sentinel and commit boundary |
| Renaming the sole CI step casually | Phase 64 preservation runner fails | coordinate Phase 65 runner and existing CI-name assertions |
| Running generic `npm test` directly | user-owned `mcp/build/index.js` changes | use/update the repository preservation runner and restore only runner-owned generated output |

## Recommended Plan/Wave Decomposition

1. **Identity authority foundation:** canonical auth/billing pairs, five-field accepted identity, start/consent/controller/store/hydration binding, existing-provider regression tests. No Codex production symbol.
2. **Execution isolation substrate:** shared environment sanitizer, direct endpoint runtime reference, no-environment profile, managed-MCP attestation, byte-safe auth probe, runtime scratch cleanup. Still no Codex production symbol.
3. **Atomic Codex exposure:** adapter/detect/profile/parser, 0.142.5 fixture + native negatives, registry/matrix/caps/drift/diagnostics/inventory, source sentinel, roster tests in one production commit.
4. **Product promotion:** safe compatibility/auth projection, Providers/options/preflight/consent/background selection, exact copy, provider-free request invariants.
5. **Persistence and shared UI closure:** controller-produced parity snapshots, hostile mutation tests, USD-null billing, remove Profile row, 44px controls across narrow/theme/a11y contracts.
6. **Closure gates:** Phase 65 focused/full runner, root/CI ordering, source/security checks, exactly three pending UAT rows.
7. **Sequential reviews:** code review and fixes, security review and fixes, UI review and fixes, Nyquist/goal verification, phase tracking.

Plans may split these waves further to keep commits reviewable, but Codex production exposure must remain one indivisible plan/commit boundary.

## Validation Architecture

### Nyquist Status

Existing test infrastructure covers all requirements. Wave 0 is test/harness creation and source sentinels, not dependency installation. Every implementation task can run a focused Node test or TypeScript build; no three consecutive tasks should lack automated feedback.

### Wave 0 Test/Harness Work

- Add `tests/mcp-codex-adapter.test.js` with selectable sections for isolation foundation, auth, spawn profile, parser, native negatives, and atomic exposure.
- Add `tests/fixtures/agent-streams/codex-0.142.5/manifest.json`, schema-derived valid JSONL, expected normalized sequence, and a full negative corpus with `liveCapturePending:true`.
- Add/update an atomic Codex exposure sentinel before the production roster changes.
- Add `scripts/run-phase65-full-tests.mjs` using the existing dirty-file/build preservation pattern; coordinate the Phase 64 CI-step-name assertion.
- Add `65-HUMAN-UAT.md` only in closure, with exactly three unchecked `human_needed` rows.

### Focused Test Matrix

| Area | Primary tests | Minimum proof |
|---|---|---|
| binary/profile/auth | new Codex adapter test, version parity, provider contract | native identity, 0.142.5 supported, 0.144.6 degraded, exact four-state byte classifier/zeroization |
| spawn/env/MCP | Codex adapter, forbidden flags, supervisor, runtime contracts | exact argv, stdin-only task, stripped credentials/noise vars, `URL=none`, no native tools, sole attested FSB MCP |
| parser/drift | stream fixture, drift smoke, protocol diagnostics | valid normalized order, native negative corpus, no result on any failure |
| terminal/cleanup | supervisor, orphan recovery | candidate + clean exit + settled tree + removed scratch required |
| compatibility/inventory | compatibility, client inventory, diagnostics, storage | exact third row, safe auth only, stale→unknown, no path/version/status/secret leakage |
| consent/routing | preflight, consent, background dispatch | auth/billing challenge binding, TOCTOU rejection before task stdin, provider-free browser requests |
| persistence | event store, controller | five-field identity survives reload; cross-field drift/hostile records reject |
| Providers/feed/UI | panel logic/UI, sidepanel UI, provider parity | stable third row, exact copy, USD null, no Profile row, 44px actions, generic DOM shape |
| closure | Phase 65 runner, extension validation, root suite | preservation-safe full green + exact pending UAT ledger |

### Native Negative Corpus

The corpus should cover at least:

- missing/duplicate/out-of-order thread/turn/terminal events and data after terminal;
- duplicate item ids; completion without start; MCP id/server/tool mismatch; repeated completion; terminal with open MCP;
- foreign MCP, invalid tool name, failed MCP, command/file/web/collab/error item, `turn.failed`, top-level `error`, unknown top-level/item/update;
- agent message at invalid lifecycle, unsupported `item.updated`, and any reasoning/todo text accidentally emitted;
- invalid usage shape, negatives/fractions/overflow/extra keys;
- invalid UTF-8/JSON, blank lines, line/stream/event/depth/node/key/array overflow;
- nonzero exit, signal, parser failure, missing candidate, cleanup failure, or unsettled tree after a syntactically valid terminal;
- sentinel task/secret/native payload fragments absent from every normalized error/event/state artifact.

### Auth/Environment Negative Corpus

- extra whitespace, duplicate channels, trailing junk, invalid UTF-8, timeout, signal, output overflow, unknown status, and API-key-shaped bytes on the wrong exit code;
- exact unauthenticated exit 1 vs arbitrary exit 1;
- ambient credential and exec-server/noise variables absent from detection and spawn, including fixed-env reintroduction attempts;
- ChatGPT-consent/API-key-reprobe and API-key-consent/ChatGPT-reprobe reject before spawn/task stdin;
- extra managed/user/plugin MCP server or ambiguous roster blocks preflight;
- compatibility evidence alone cannot select Codex or grant start authority.

### Fast Verification Commands

```sh
npm --prefix mcp run build
node tests/mcp-codex-adapter.test.js --section isolation
node tests/mcp-codex-adapter.test.js --section auth
node tests/mcp-codex-adapter.test.js --section parser
node tests/mcp-agent-stream-fixture.test.js
node tests/mcp-agent-drift-smoke.test.js
node tests/mcp-agent-provider-contract.test.js
node tests/mcp-adapter-compatibility.test.js
node tests/mcp-spawn-supervisor.test.js
node tests/mcp-agent-orphan-recovery.test.js
node tests/mcp-agent-providers-storage.test.js
node tests/delegation-routing.test.js
node tests/delegation-consent.test.js
node tests/delegation-controller.test.js
node tests/delegation-event-store.test.js
node tests/providers-panel-logic.test.js
node tests/providers-panel-ui.test.js
node tests/delegation-sidepanel-ui.test.js
node tests/provider-parity.test.js
node tests/mcp-version-parity.test.js
node scripts/verify-agent-provider-flags.mjs
```

### Phase Gate

Use `node scripts/run-phase65-full-tests.mjs` as the preservation-safe authoritative automated gate, followed by `npm run validate:extension` and the preservation-wrapped root suite. A raw `npm test` invocation is not acceptable while it mutates the user's pre-existing generated file.

### Deferred UAT Ledger

Exactly these three rows remain unchecked and `human_needed`:

1. `UAT65-01` — genuine ChatGPT/API-key/unauthenticated auth matrix with exact safe copy and no credential/status leakage.
2. `UAT65-02` — genuine Codex-to-browser task, cancellation/cleanup, fresh completion, visible tokens/turns/duration, honest billing summary, no USD.
3. `UAT65-03` — Providers/delegation keyboard, screen-reader, light/dark/forced-colors/reduced-motion, and narrow layout; 44px targets and no visible Profile row.

## Security Domain

### Assets and Trust Boundaries

- User Codex auth store and any keyring-backed material
- Masked-but-secret-bearing login status bytes
- Browser consent and selected provider authority
- Daemon-owned FSB MCP endpoint/tool namespace
- System/cloud/admin/user Codex configuration and plugins
- Task text and native JSONL/reasoning/tool payloads
- Process group, scratch filesystem, runtime journal, and terminal truth
- Persisted auth/billing identity and cost presentation

### Threats and Required Mitigations

| ID | Severity | Threat | Mandatory mitigation/evidence |
|---|---|---|---|
| T65-01 | CRITICAL | ambient credential adoption | shared scrubber; source-pinned roster; fixed-env reinjection negatives |
| T65-02 | CRITICAL | API-key status leakage | bounded byte classifier, no stringify, buffer zeroization, sentinel scans |
| T65-03 | CRITICAL | auth/billing TOCTOU | consent binding + immediate daemon re-probe before spawn/stdin |
| T65-04 | CRITICAL | foreign MCP or endpoint/config injection | validated loopback runtime reference, effective-roster attestation, exact allowlist |
| T65-05 | CRITICAL | inherited rules/hooks/plugins/native tools widen authority | ignore flags, no-environment setting, closed features/config, source contract tests |
| T65-06 | HIGH | unsupported event executes or leaks data | prevent native authority; strict parser/negative corpus; sanitized errors only |
| T65-07 | HIGH | MCP lifecycle/identity confusion | exact item/server/tool/order tracking and adjacent normalized pairs |
| T65-08 | CRITICAL | JSON terminal forges success | clean exit + settled tree + cleanup after one candidate |
| T65-09 | HIGH | event/persistence mutates billing or fabricates USD | immutable five-field identity, USD-null invariant, hostile hydration tests |
| T65-10 | HIGH | compatibility/storage becomes start authority | provider-free requests and daemon/browser authority separation tests |
| T65-11 | HIGH | fixture/version provenance fabrication | pinned manifest, `liveCapturePending:true`, 0.144.6 degraded |
| T65-12 | HIGH | partial Codex roster exposure | first-production source sentinel and atomic exposure commit |

### ASVS-Oriented Controls

- **V1 Architecture:** one spawn authority, one canonical auth/billing mapping, closed provider roster.
- **V2 Authentication:** classify only Codex-owned bounded status; never inspect credential storage.
- **V4 Access Control:** no native execution environment; exact single FSB MCP authority.
- **V5 Validation:** exact objects, bounded buffers/JSON complexity, endpoint/identity/order validation.
- **V7 Logging:** no task, credential, auth-status, config-roster, MCP args/results, or reasoning data in diagnostics/logs.
- **V9 Communications:** FSB endpoint is validated loopback and serve-owned; no arbitrary remote injection.
- **V10 Malicious Code:** no plugin/app/skill dependency installation, shell, file, web, collaboration, or image tool surface.
- **V14 Configuration:** strict pinned profile, managed-layer attestation, source drift gate, fail-closed version policy.

## Sources

### Primary External Sources

- OpenAI Codex 0.142.5 release/tag: https://github.com/openai/codex/releases/tag/rust-v0.142.5
- OpenAI non-interactive mode documentation (`exec`, `--ephemeral`, read-only, `--ignore-user-config`, `--ignore-rules`, required MCP, JSONL families): https://developers.openai.com/codex/noninteractive
- Pinned 0.142.5 JSONL event schema: https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/exec/src/exec_events.rs
- Pinned 0.142.5 login status and masked-key formatting: https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/cli/src/login.rs
- Pinned configuration layer order and recursive merge: https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/config/src/loader/mod.rs and https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/config/src/merge.rs
- Pinned no-execution-environment behavior: https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/exec-server/src/environment.rs
- Pinned MCP approval behavior/config: https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/core/src/mcp_tool_call.rs and https://github.com/openai/codex/blob/rust-v0.142.5/codex-rs/codex-mcp/src/mcp/mod.rs

### Verified Local Evidence

- Official npm packages `@openai/codex@0.142.5` and `@openai/codex@0.142.5-darwin-arm64` were inspected in `/tmp` only.
- The retained pinned binary reports `codex-cli 0.142.5`; its help confirms stdin `-`, JSONL, ephemeral, ignore-user-config, ignore-rules, strict config, color, read-only sandbox, and skip-git flags.
- Pinned `features list` establishes the exact default-on feature vocabulary that profile tests must close.
- The locally installed production candidate is `/opt/homebrew/bin/codex` at 0.144.6 and currently reports ChatGPT auth; it was used only as Degraded/detection evidence, never as fixture provenance.

### Repository Sources

- `.planning/phases/65-codex-adapter/65-CONTEXT.md`
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- `mcp/src/agent-providers/adapter.ts`, `registry.ts`, `compatibility.ts`, `protocol-drift.ts`, `spawn-supervisor.ts`, `runtime-files.ts`, `serve-delegation.ts`
- `extension/utils/delegation-providers.js`, `mcp-agent-providers.js`, `delegation-preflight.js`, `delegation-consent.js`, `delegation-controller.js`, `delegation-event-store.js`
- `extension/background.js`, `extension/ui/providers-panel.js`, `options.js`, `delegation-feed.js`, `sidepanel.js`, `sidepanel.css`
- Phase 60–64 provider, supervisor, drift, persistence, and UI tests/runners

## Metadata

**Research method:** accepted Phase 65 context + repository contract inspection + three parallel read-only backend/UI/validation scouts + official Codex manual + pinned 0.142.5 binary/source inspection.  
**No external mutation:** no account change, login/logout, model call, browser task, or credential read.  
**Planner handoff:** create security-threat blocks referencing T65-01 through T65-12; preserve the provider-neutral/atomic-exposure wave order; include exact automated commands and three manual UAT rows.

## Research Resolution

The phase is ready to plan. There is no unresolved product choice. Managed configuration is a security implementation constraint: execution must fail closed unless the complete effective MCP/tool authority can be proven exact for the pinned profile.

## RESEARCH COMPLETE
