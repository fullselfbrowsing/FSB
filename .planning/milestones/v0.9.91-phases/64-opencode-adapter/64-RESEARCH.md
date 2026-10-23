# Phase 64: OpenCode Adapter — Research

**Researched:** 2026-07-20 [VERIFIED: codebase inspection]  
**Overall confidence:** HIGH for the pinned OpenCode 1.14.25 CLI/source contract and repository integration map; MEDIUM for hermetic configuration because the safest isolation uses version-bound upstream test flags and genuine authenticated behavior is intentionally deferred. [VERIFIED: codebase inspection] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts]  
**Scope:** Planning research and deterministic validation design only. No authenticated model call, live browser delegation, user OpenCode server, or provider credential was used. [VERIFIED: codebase inspection]

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

[VERIFIED: codebase inspection] The following decision text is reproduced verbatim from `64-CONTEXT.md`.

#### Execution Topology
- Cold `opencode run` is the default path. Attach mode is selected only when an FSB-owned OpenCode server has been verified healthy; both paths are covered by production-contract tests.
- FSB may attach only to a server it launched on loopback with a random port and a random Basic Auth secret. It never discovers, attaches to, mutates, or terminates a user's existing OpenCode TUI/server process.
- Preserve the exact five-method `AgentProviderAdapter` surface. Extend the declarative spawn contract with provider-neutral cold/attach topology data rather than adding an OpenCode-specific supervisor branch or a sixth adapter method.
- At most one bounded FSB-owned OpenCode server lives per FSB daemon. Every delegation creates a fresh task session, chat/session continuation stays disabled, and the server receives bounded idle teardown.

#### Hermetic Policy and Task Delivery
- Run from a private FSB configuration boundary, disable project configuration, use OpenCode's pure mode, and expose only the private loopback FSB MCP server. User/project plugins, MCP servers, agents, hooks, skills, and commands are not inherited.
- Deliver the user's task through stdin only. Task text must never enter argv, environment variables, generated filenames, logs, server URLs, or lifecycle receipts.
- Ship a static primary `fsb` agent whose permissions deny all tools by default and allow only the FSB MCP tool prefix. Shell, file edits, web access, subagents, skills, external-directory access, and every non-FSB tool remain denied.
- Preserve OpenCode's existing sign-in and default model without an FSB model override or provider API-key fallback. If no usable account/model can be established non-interactively, detection or preflight fails closed with bounded guidance.

#### JSON Stream, Fixture, and Terminal Truth
- Pin the first compatibility profile to the locally verified OpenCode 1.14.25 binary. Commit a sanitized schema-derived fixture with `liveCapturePending: true`; a genuine sanitized capture remains a milestone-end human-UAT item until reviewed.
- Normalize provider output as follows: `step_start` to `init`; a completed/error `tool_use` record to ordered `tool_use` plus `tool_result`; `text` to `assistant`; optional `reasoning` to `assistant_delta`; `step_finish` to a candidate `result`; and `error` to a diagnostic/failed terminal path.
- Require one bounded session identity, valid required fields, ordered lifecycle, and exactly one terminal candidate. Unknown event types, invalid shapes, session mixing, reordered lifecycle, duplicate terminal records, or data after terminal fail with `agent_protocol_drift` and stop the child.
- A `step_finish` record is only a candidate result. Success becomes authoritative only after exactly one valid candidate and a clean child exit. Provider error, missing/duplicate terminal, or nonzero/signal exit fails closed without a fabricated success.

#### Product Integration and Lifecycle
- Reuse the existing OpenCode Providers row and provider-neutral delegated UX unchanged. Detection and compatibility evidence drive its Installed/Supported/Degraded/Unsupported states; no OpenCode-only side-panel branch, row reordering, or recommendation mutation is introduced.
- Keep OpenCode auth as `unknown` / `Not reported` in this phase. Billing copy states that usage follows the account/provider configured in OpenCode and never asserts subscription inclusion or a dollar amount without authoritative metadata.
- Attach-to-cold fallback is permitted only before a provider session or task exists. Once a task is accepted or any event is observed, failure settles closed without replay. User-owned OpenCode processes are never killed or modified.
- Extend registry, matrix, fixture, drift-smoke, doctor, supervisor, Providers, source/security gates, and full-suite coverage. One genuine authenticated OpenCode-to-browser run remains `human_needed` in the milestone-end UAT ledger.

### the agent's Discretion

[VERIFIED: codebase inspection] The following discretion text is reproduced verbatim from `64-CONTEXT.md`.

- Exact internal module names, bounded timeouts, idle lifetime, private configuration filenames, and provider-neutral spawn-topology type names may follow the established `mcp/src/agent-providers/` conventions.
- Exact safe presentation wording may follow the existing Providers and delegated-feed copy as long as availability, compatibility, auth, billing, and recommendation remain distinct and honest.
- The planner may refine bounded raw-field schemas and normalized payload fields from the pinned 1.14.25 source and fixture, but may not relax fail-loud drift behavior or terminal-exit corroboration.

### Deferred Ideas

[VERIFIED: codebase inspection] The following deferred text is reproduced verbatim from `64-CONTEXT.md`.

- OpenCode chat/session continuation, user-owned server attachment, cross-daemon server persistence, provider/model selection UI, and inferred auth/billing classification remain out of scope.
- Genuine authenticated stream provenance and live OpenCode-driven browser behavior remain in the user-directed milestone-end UAT sweep.

</user_constraints>

<phase_requirements>

## Phase Requirements

| Requirement | Exact requirement | Research support |
|---|---|---|
| MULTI-01 | An OpenCode adapter (`mcp/src/agent-providers/opencode.ts`) implements the `AgentProviderAdapter` contract with `caps.serverMode=true`; the supervisor either spawns `opencode run` cold or attaches to a running `opencode serve` per the adapter's `buildSpawn` output (contract-stresser: the ADAPT contract must accommodate both spawn and attach without hardcoding). | Preserve the five methods and make `buildSpawn` return a closed, provider-neutral execution topology containing task client, optional owned-server bootstrap/readiness data, and a pre-task-only cold fallback. The supervisor interprets topology, never `adapterId === 'opencode'`. [VERIFIED: codebase inspection] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] |
| MULTI-02 | The OpenCode adapter ships a pinned agent definition (equivalent to Claude Code's `--agents fsb`) using OpenCode's `agent create` / `agents` config surface, keyed to a version pinned during phase spike. | The locked context supersedes imperative `agent create`: generate an exact private `opencode.json` with a static primary `fsb` agent, default-deny permission ordering, one remote FSB MCP entry, sharing disabled, and no model override. Attest the effective agent/config before accepting a task because `run --agent` falls back to the default when the named agent is missing. [VERIFIED: codebase inspection] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/agent.ts] |
| MULTI-03 | A recorded OpenCode JSONL fixture under `tests/fixtures/agent-streams/opencode-1.14.25/` (or the latest pinned version) proves the adapter's event schema in CI without a live CLI. | Add `contract-stream.jsonl` plus the established exact manifest shape with `provenance: schema-derived-contract`, `sanitized: true`, `liveCapturePending: true`, requirement `MULTI-03`, pinned source URLs, multi-step lifecycle, completed/error tool records, and one terminal finish. Refactor the drift harness's Claude-native selectors/mutators into a closed per-adapter fixture contract. [VERIFIED: codebase inspection] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] |

</phase_requirements>

## Summary

[VERIFIED: codebase inspection] Phase 64 is a horizontal contract-stress phase, not merely four new OpenCode files. The daemon core currently has one canonical adapter id, a flat one-process `SpawnSpec`, Claude-specific start validation and drift errors, one delegation-only orphan journal shape, and a result event that is published before exit corroboration. The extension is also only partially provider-neutral: consent, preflight, controller, event store, background routing, side-panel validation, drift diagnostics, billing context, and compatibility expiry contain literal Claude identity checks.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] OpenCode's JSON run stream is multi-step. A tool-driven task can emit several `step_start` and `step_finish` records; `tool-calls` and `unknown` finishes are continuation boundaries, while the first other valid finish is the terminal candidate. Planning every `step_finish` as terminal would reject ordinary tool use or expose a premature success.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/instruction.ts] OpenCode's `--pure` flag suppresses external plugin loading but does not by itself create the locked hermetic boundary. Global config, home `.opencode`, global instruction files, managed configuration, active-organization configuration, and config directories have independent loading paths. The plan therefore needs both private path controls and an effective-policy attestation gate; static-file tests alone are insufficient.

[ASSUMED] The safest implementation order is: (1) common ids/errors/topology/runtime schemas, (2) OpenCode detector/profile/parser and schema-derived fixture, (3) owned-server lease plus supervisor terminal ordering, (4) compatibility/doctor/inventory projection, (5) extension provider-neutralization, and (6) security/source/full-suite gates. The common contract should land before either OpenCode production registration or browser support is enabled.

## Critical Planning Findings

| Finding | Consequence for the plan | Confidence |
|---|---|---|
| `run --agent fsb` warns and falls back instead of failing when `fsb` is missing, invalid, or a subagent. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] | A pre-task effective-agent/config attestation and a bounded fallback-warning stderr gate are mandatory. A static config fixture is not runtime proof. | HIGH |
| `--pure` skips configured external plugins, while config, instruction, skill, managed-config, and active-account paths are separate. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/plugin/index.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts] | Use a private XDG config root, project-config disable flags, home/config isolation, source-pinned internal isolation flags, and effective config/tool attestation. | HIGH |
| OpenCode automatically appends an external-directory allow rule for its truncation directory unless that exact glob is explicitly denied. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/agent/agent.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/tool/truncate.ts] | The static policy needs both wildcard deny and the resolved exact truncation glob deny before the final `fsb_*` allow. Test the resolved rules, not only serialized JSON. | HIGH |
| `step_finish` occurs once per model step, and only non-`tool-calls`/non-`unknown` completion ends the prompt loop. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/processor.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] | The parser must distinguish continuation finishes from the single terminal candidate and treat only the first `step_start` as normalized run init. | HIGH |
| Server port `0`, explicit loopback hostname, Basic Auth environment variables, and `/global/health` with `{healthy:true,version}` are present in 1.14.25. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/serve.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/routes/global.ts] | Launch `serve --hostname 127.0.0.1 --port 0`, parse only its bounded readiness line, then require an authenticated exact-version health response tied to the retained child identity. | HIGH |
| The extension's compatibility mapper forces every non-Claude row to Unsupported, while background delegation identity and billing are hardcoded to Claude/subscription. [VERIFIED: codebase inspection] | Phase 64 must introduce one closed canonical provider-definition table and data-drive every consumer; adding only the Providers compatibility row would be incomplete and would misreport billing. | HIGH |
| The current supervisor publishes a normalized `result` after parser EOF but before it verifies a clean exit. [VERIFIED: codebase inspection] | Hold the candidate entirely inside daemon state; emit it and settle success only after parser completion, stderr drain, clean child exit, and tree cleanup. | HIGH |

## Architectural Responsibility Map

[VERIFIED: codebase inspection]

```text
Authoritative provider selection (background settings)
                 |
                 v
closed provider metadata table ---- consent / preflight / controller / feed
                 |                                  |
                 | delegate.start(adapterId, task)  | normalized only
                 v                                  v
generic SpawnSupervisor ---------------------- extension event ledger
  |       |          |
  |       |          +-- held terminal candidate -> clean exit -> success
  |       +------------- one FSB-owned server lease (optional, bounded)
  +--------------------- one fresh task client (cold or attach)
                 |
                 v
AgentProviderAdapter.buildSpawn() returns declarative topology
  +-- preflight process declarations (no task)
  +-- cold task process
  +-- optional owned-server launch/readiness declaration
  +-- attach task process with pre-spawn cold fallback
                 |
                 v
OpenCode 1.14.25 parser -> provider-neutral AgentEvent stream
```

| Owner | Required change | Explicit non-authority |
|---|---|---|
| `mcp/src/agent-providers/adapter.ts` plus a common protocol-drift module | Add canonical `opencode`, `serverMode:true`, deeply frozen process/topology declarations, safe preflight/readiness descriptors, and common drift error/reason types while retaining exactly five adapter methods. [VERIFIED: codebase inspection] | No spawning, health I/O, secret generation, port discovery, task persistence, or provider-specific supervisor branch. [VERIFIED: codebase inspection] |
| New `opencode-detect.ts`, `opencode-profile.ts`, `opencode-stream.ts`, `opencode.ts` or equivalent | Retain binary identity, classify 1.14.25, build exact private config/argv/env declarations, normalize JSONL, and expose task-only/server capabilities. [ASSUMED] | No process ownership, filesystem mutation, user server discovery, auth classification, model override, or UI projection. [VERIFIED: codebase inspection] |
| `runtime-files.ts` | Create exact cold/server runtime roots and provider-declared-but-supervisor-validated files; version the journal so owned servers and delegations are distinguishable and old Claude entries remain recoverable. [ASSUMED] | Never delete arbitrary adapter paths or classify server recovery as a lost user delegation. [VERIFIED: codebase inspection] |
| `spawn-supervisor.ts` or a sibling owned-server coordinator | Interpret topology generically, mint server secret, launch/attest one server, select a healthy lease, enforce replay boundary, supervise both process roles, idle-reap, and delay result publication. [ASSUMED] | Never branch on `opencode`, enumerate ports/processes, attach to a user process, replay a task after stdin/event, or leak topology. [VERIFIED: codebase inspection] |
| `compatibility.ts`, registry, diagnostics, inventory | Add the exact profile/fixture row and one detector source of truth; expose only closed compatibility classification to the browser, while doctor retains local path/version/auth-unknown facts. [ASSUMED] | Compatibility remains observational and cannot select, spawn, or infer auth/billing. [VERIFIED: codebase inspection] |
| Extension canonical provider metadata helper | Supply `{id,label,billingKind}` for Claude/OpenCode to preflight, consent, controller, event store, background, side panel, feed, and drift diagnostics. [ASSUMED] | No provider-native version, binary path, topology, secret, raw JSON, or adapter-specific rendering. [VERIFIED: codebase inspection] |
| Existing Providers UI | Allow safe OpenCode Supported/Degraded mapping, preserve second-row order and exact approved copy, and keep Codex Unsupported. [VERIFIED: codebase inspection] | No new HTML/CSS/component, no semver, no selection/recommendation mutation from compatibility, and no OpenCode display branch. [VERIFIED: codebase inspection] |

## Standard Stack

### Core

| Concern | Use | Why | Confidence |
|---|---|---|---|
| Runtime/build | Existing Node.js ESM and TypeScript 5.9.x package. [VERIFIED: codebase inspection] | Process supervision, random bytes, HTTP health, streams, paths, and timers already exist in Node core and repository code. [VERIFIED: codebase inspection] | HIGH |
| Schema validation | Existing `zod` 3.25.76 in `mcp/package.json`. [VERIFIED: codebase inspection] | The current adapter and wire layers already use strict Zod validation; no second validator is needed. [VERIFIED: codebase inspection] | HIGH |
| Provider CLI | External OpenCode binary/profile exactly `1.14.25`. [VERIFIED: codebase inspection] | The local retained binary and official tag source agree on the run/server/config/event surfaces researched here. [CITED: https://github.com/anomalyco/opencode/tree/v1.14.25/packages/opencode] | HIGH |
| Process launch | Existing `node:child_process.spawn`/`execFile` with absolute retained command, argv array, `shell:false`, detached process group, and bounded streams. [VERIFIED: codebase inspection] | It preserves the Phase 59/60 authority and shell-free boundary. [CITED: https://nodejs.org/api/child_process.html] | HIGH |
| Secret generation | Existing `node:crypto.randomBytes` or equivalent CSPRNG. [VERIFIED: codebase inspection] | A daemon-minted high-entropy Basic Auth password needs no library. [CITED: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback] | HIGH |
| Tests | Existing script-style Node assertions, VM/DOM harnesses, production TypeScript build, fixture drift smoke, source pins, and root `npm test`. [VERIFIED: codebase inspection] | These are already the repository's acceptance mechanisms for adapters, supervisor, doctor, extension persistence, and UI. [VERIFIED: codebase inspection] | HIGH |

### Supporting Repository Contracts

| Existing contract | Reuse/extension |
|---|---|
| `AgentProviderAdapter` | Keep `detect`, `buildSpawn`, `parseEvents`, `kill`, and `caps` exactly; enrich only declarative types and context. [VERIFIED: codebase inspection] |
| Retained binary detector | Extract or mirror the safe PATH/native identity pattern used by Claude, including Windows shim refusal/verification and identity recheck. [VERIFIED: codebase inspection] |
| `AgentRuntimeFiles` and orphan recovery | Extend exact-owned file/journal shapes; do not bypass them for the long-lived server. [VERIFIED: codebase inspection] |
| `ADAPTER_COMPATIBILITY_MATRIX` | Add one exact OpenCode row and preserve registry/matrix/fixture/doctor bijection. [VERIFIED: codebase inspection] |
| `FsbMcpAgentProviders` projection | Add OpenCode to shipped labels, retain closed status/reason/timestamp only, and continue to classify Codex as unshipped. [VERIFIED: codebase inspection] |
| Delegation event ledger/controller | Continue append-before-fanout, exact provider identity, exact-once terminal settlement, and service-worker rehydration. [VERIFIED: codebase inspection] |

### Package Legitimacy Audit

[VERIFIED: codebase inspection] No new npm, Bun, browser, or runtime package is recommended. Node core plus the existing Zod dependency cover the new work, and OpenCode is an external user-installed binary rather than a repository dependency. The package-legitimacy gate is therefore not applicable; plans should contain no install task.

## Architecture Patterns

### Pattern 1: Closed Provider-Neutral Topology, Not a Sixth Method

[ASSUMED] Factor the flat process fields into a deeply frozen `ProcessSpec`, then let `SpawnSpec` carry a closed topology chosen by `buildSpawn`. A representative shape is:

```ts
type ProcessRole = 'task_client' | 'owned_server' | 'policy_preflight';

interface ProcessSpec {
  readonly role: ProcessRole;
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly fixedEnv: Readonly<Record<string, string>>;
  readonly privateFiles: readonly RuntimeFileRef[];
  readonly stdin: 'none' | 'task';
  readonly stdout: 'agent_jsonl' | 'bounded_readiness' | 'bounded_json';
}

type SpawnTopology =
  | { readonly kind: 'cold'; readonly task: ProcessSpec; readonly warm?: OwnedServerSpec }
  | {
      readonly kind: 'attach';
      readonly task: ProcessSpec;
      readonly lease: OwnedServerLeaseRef;
      readonly fallbackBeforeSpawn: ProcessSpec;
    };

interface SpawnSpec {
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly preflight: readonly ProcessSpec[];
  readonly topology: SpawnTopology;
}
```

[ASSUMED] The exact type names are discretionary. The invariant is that the supervisor switches only on closed generic roles/topology, and OpenCode-specific argv, readiness prefix, health path, expected JSON, and stderr sentinels arrive as trusted adapter declarations. Typed daemon-secret references are preferable to serializing the Basic Auth value into a generic `fixedEnv` object that might later be fingerprinted or logged.

[VERIFIED: codebase inspection] `freezeSpawnSpec` currently freezes only the flat top level. The plan must add recursive copying/freezing and hostile mutation tests for every nested array/object so callers cannot alter argv, health expectations, secret slots, fallback, or private-file descriptors after validation.

### Pattern 2: Conservative Cold/Attach State Machine

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] An attached `run` creates a new server-side session unless `--continue` or `--session` is supplied. The FSB profile must never include either flag.

[ASSUMED] Use this supervisor state machine:

```text
no verified lease
  -> choose cold for this task
  -> optionally warm one owned server for a future task

verified matching lease
  -> authenticated health + version + process/config fingerprint recheck
     -> healthy: choose attach
     -> unhealthy before client spawn/stdin: discard lease, choose cold once

task client spawned or stdin write begins or any event appears
  -> replay fence closes permanently
  -> every failure settles once; never cold-fallback
```

[VERIFIED: codebase inspection] The current supervisor writes the task only after child activation and `delegation.started`. For attach fallback safety, the lease check and any fallback decision must complete before task-client spawn; an attach client that exits with no JSON event is not proof that the remote server created no session. Therefore the conservative plan should not replay after an attached child exists, even if zero events were observed.

[ASSUMED] Cold should remain the first-task/default path. Warm the at-most-one server only after the cold path is committed, without delaying or replaying that task; later tasks can attach while the verified lease remains idle-live. A short bounded idle lifetime such as five minutes fits existing hold timers, but the exact value is discretionary and must use injected clocks/timers in tests.

### Pattern 3: Owned Server Lease Is Durable Process State

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/serve.ts] Launch the retained binary with global pure mode and explicit `serve --hostname 127.0.0.1 --port 0`; pass an explicit false mDNS value so config cannot broaden binding behavior. Parse only the exact bounded `opencode server listening on http://127.0.0.1:<port>` startup line.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/middleware.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/routes/global.ts] Mint at least 32 random bytes for `OPENCODE_SERVER_PASSWORD`, keep the username fixed and private, and verify `GET /global/health` with an Authorization header. Require HTTP success, a bounded exact plain object, `healthy === true`, and `version === '1.14.25'`.

[ASSUMED] Bind the lease to daemon generation, retained executable real path, process start identity/group, profile version, private-config digest, endpoint, secret reference, last-used monotonic time, and active attached-client count. A healthy HTTP responder without the exact owned process identity is not attachable.

[VERIFIED: codebase inspection] Journal schema currently treats every active child as a user delegation and validates only Claude ids. Add a versioned `runtimeKind: 'delegation' | 'provider_server'` (or equivalent) with backward parsing of old Claude entries as delegations. Startup recovery must kill a confirmed orphaned owned server but must not emit `daemon_restart_lost_run` for it. Ambiguous identity continues to degrade/fail closed.

### Pattern 4: Private Config Plus Effective-Policy Attestation

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/paths.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/global/index.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/managed.ts] For exact 1.14.25, use a private per-run/server `XDG_CONFIG_HOME`, put the generated config at its OpenCode global-config location, set `OPENCODE_DISABLE_PROJECT_CONFIG=1`, set `OPENCODE_TEST_HOME` to a private empty home, and set `OPENCODE_TEST_MANAGED_CONFIG_DIR` to a private empty directory. Do not alter `HOME`; the latter two variables are upstream test-isolation hooks and must be source-pinned to this exact profile.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/instruction.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/flag/flag.ts] Also set `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1` and `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`, because project-config disabling alone does not cover the user's `.claude/CLAUDE.md` or all external-skill discovery. Use global `--pure` to prevent external plugin loading, and disable auto-update/LSP downloads with their source-verified flags.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/index.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/util/log.ts] Pass global `--log-level ERROR`, never pass `--print-logs`, and continue to keep the task out of argv. OpenCode initializes a file logger and records argv at INFO by default; the explicit level suppresses that ordinary record and minimizes the upstream log surface. Source/security tests must still prove FSB-owned logs and retained stderr never contain the task.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/auth/index.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/provider/provider.ts] Leave the user's XDG data and state roots unchanged so OpenCode itself can read its existing `auth.json`/account database and recent-model state. Do not read, copy, serialize, log, or inject provider credentials, and do not pass `--model`. Let OpenCode resolve a model inside the isolated environment; if that resolution fails, return the provider-neutral not-ready outcome.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts] Private files are necessary but not sufficient: active-organization and OS-managed config can merge after ordinary config. Before accepting a task, execute bounded declarative preflights under the exact task environment, parse `debug config` and `debug agent fsb` in memory, and require:

- exactly the private `fsb` MCP authority and no external plugin/command/instruction/skill authority; [ASSUMED]
- a primary `fsb` agent with the shipped prompt digest and no agent-level model override; [ASSUMED]
- every enabled tool id begins with `fsb_`, with at least one expected FSB tool, and every other tool disabled; [ASSUMED]
- exact final permission precedence, including explicit truncation-directory denial; [ASSUMED]
- a default model resolves non-interactively without FSB choosing or copying it. [ASSUMED]

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/routes/instance/index.ts] For an owned server, repeat equivalent authenticated `/config` and `/agent` attestation before marking the lease healthy. Never retain or log the raw responses because they can contain provider/model/config metadata.

[ASSUMED] Treat disappearance or semantic change of the upstream test-isolation flags as a spawn-blocking profile failure. The browser may still show a newer binary as Degraded from version evidence, but execution should stay pinned to exact 1.14.25 until a new hermetic profile is reviewed.

### Pattern 5: Static OpenCode Agent Policy

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/agent.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/permission/index.ts] Derive OpenCode's static prompt/description from the existing shipped `mcp/ai/agents/fsb.json`, but serialize an OpenCode-native primary agent. Permission objects preserve insertion order, and the last matching rule wins.

[ASSUMED] The generated config should be equivalent to this shape, with the exact runtime truncation glob inserted and an endpoint created by `AgentRuntimeFiles`:

```json
{
  "share": "disabled",
  "autoupdate": false,
  "default_agent": "fsb",
  "plugin": [],
  "command": {},
  "instructions": [],
  "agent": {
    "fsb": {
      "mode": "primary",
      "description": "<shipped description>",
      "prompt": "<shipped prompt>",
      "steps": 40,
      "permission": {
        "*": "deny",
        "external_directory": {
          "*": "deny",
          "<resolved-opencode-data>/tool-output/*": "deny"
        },
        "fsb_*": "allow"
      }
    }
  },
  "mcp": {
    "fsb": {
      "type": "remote",
      "url": "http://127.0.0.1:<fsb-port>/mcp",
      "enabled": true,
      "oauth": false
    }
  }
}
```

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/mcp/index.ts] OpenCode exposes connected MCP tools as sanitized `<server>_<tool>` ids, so the server name `fsb` and final `fsb_*` rule implement the locked allowlist. Keep the outer global deny first and the allow prefix last.

[VERIFIED: codebase inspection] Runtime-file cleanup currently permits only `mcp-config.json`. Extend it with closed provider/profile file descriptors and exact names/modes; do not trust arbitrary `privateFiles` returned by an adapter as deletion authority. Directories remain `0700`, files `0600`, non-symlink, beneath the FSB runtime root, and task text must be absent from all content and path names.

### Pattern 6: Source-Derived Multi-Step JSONL State Machine

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] Every raw line has outer `type`, `timestamp`, and `sessionID`; part events contain `part`. The run command emits only completed/error tool parts, completed text, optional completed reasoning when thinking output is enabled, step boundaries, and session errors.

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] Use strict source-derived schemas for these nested fields:

| Raw event | Required nested evidence | Normalization |
|---|---|---|
| `step_start` | `part.id`, `part.sessionID`, `part.messageID`, `part.type === 'step-start'`; optional bounded snapshot. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | First valid record emits one `init`; later same-session starts advance parser step state without emitting duplicate init. [ASSUMED] |
| `tool_use` completed | Part base, `callID`, `tool`, `state.status`, plain input, bounded output/title/metadata, finite start/end. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | Emit `tool_use`, then adjacent `tool_result` with the same call id and `is_error:false`. [ASSUMED] |
| `tool_use` error | Part base, `callID`, `tool`, plain input, bounded error/metadata, finite start/end. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | Emit `tool_use`, then adjacent `tool_result` with the same call id and `is_error:true`; this is not by itself a run terminal. [ASSUMED] |
| `text` | Part base, `text`, completed `time.end`, optional bounded metadata. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | Emit `assistant` with a bounded text-only payload. [ASSUMED] |
| `reasoning` | Part base, `text`, completed time, optional bounded metadata. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | Emit `assistant_delta`; raw provider metadata does not cross the parser. [ASSUMED] |
| `step_finish` | Part base, bounded `reason`, finite nonnegative `cost`, and finite token/cache counters. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | `tool-calls` and `unknown` close an intermediate step; the first other source-valid reason becomes the held candidate `result`. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] |
| `error` | Exact bounded outer error shape for pinned source. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] | Emit only a stable sanitized diagnostic and throw protocol/provider failure; never forward the raw error object or fabricate result. [ASSUMED] |

[ASSUMED] Track one outer session id, current step state, seen part ids, seen call ids, step count, tool count, cumulative bounded token counters, one terminal candidate, and event index. Reject invalid UTF-8/JSON, lines over the existing 256 KiB cap, unknown/extra shapes, inner/outer session mismatch, events before first start, tool/finish outside a step, duplicate ids/calls, a second terminal finish, any raw record after the terminal candidate, EOF without candidate, or counter overflow.

[ASSUMED] A schema-derived fixture should include at least three steps so it proves the hard case: first init/reasoning/text/completed tool/`tool-calls` finish, another step/error tool/`tool-calls` finish, and final step/text/terminal finish. The fixture's exact normalized sequence should include both ordered tool pairs and exactly one final `result`.

### Pattern 7: Terminal Candidate Is Never a Browser Event Before Exit

[VERIFIED: codebase inspection] `consumeEvents` currently assigns `run.resultEvent` and then publishes it when parser iteration completes, before `executeRun` checks exit status. Refactor it to return/store a candidate but never call `publishOrBuffer` for `result`.

[ASSUMED] Authoritative success ordering is:

```text
strict parser reaches EOF with exactly one candidate
  -> stderr sentinel/drain completes without policy fallback warning
  -> child closes code 0 with no signal
  -> owned process tree settles and runtime cleanup succeeds
  -> emit the single normalized result
  -> append terminal(completed) and resolve delegate.start
```

[ASSUMED] On provider error, drift, missing/duplicate terminal, stderr fallback sentinel, nonzero/signal exit, or unsettled tree, discard the candidate and emit only the existing failed terminal path. This is required for both cold and attach and prevents transient success from persisting through service-worker eviction.

### Pattern 8: One Closed Provider Definition Table Across Extension Code

[VERIFIED: codebase inspection] A dormant OpenCode Providers definition already contains the approved billing body/links, but delegation modules independently accept only `{id:'claude-code',label:'Claude Code'}`. Create one immutable, exact-key helper loaded in background and side-panel contexts, with only shipped delegation providers:

```js
{
  'claude-code': { id: 'claude-code', label: 'Claude Code', billingKind: 'subscription' },
  opencode: { id: 'opencode', label: 'OpenCode', billingKind: 'unknown' }
}
```

[ASSUMED] The exact Claude billing entry should preserve current behavior; the OpenCode entry must be `unknown`. Consumers validate/copy metadata through helper functions instead of `if (providerId === 'opencode')` or provider-supplied labels.

[VERIFIED: codebase inspection] Generalize these closed consumers together: `delegation-preflight.js`, `delegation-consent.js`, `delegation-event-store.js`, `delegation-controller.js`, `delegation-feed.js`, `agent-protocol-drift-diagnostics.js`, `background.js`, `sidepanel.js`, and trust-reset/compatibility expiry code in options/background. Store provider id with each active delegation/profile so concurrent/later events cannot be mislabeled.

[VERIFIED: codebase inspection] `FSB_DELEGATION_START` currently omits provider id intentionally; keep that authority boundary. Background rereads authoritative settings/preflight, binds the consent challenge to that provider, and sends the validated id to `delegate.start`. A side-panel request must not choose an adapter directly.

### Pattern 9: Evidence Planes Stay Separate

[VERIFIED: codebase inspection] Providers Installation currently comes from MCP client inventory, compatibility comes from daemon adapter detection/matrix classification, and auth/billing use separate display models. Keep that separation.

[ASSUMED] Reuse one low-level OpenCode binary detector in both adapter detection and client inventory to avoid contradictory PATH/version probes, but strip version/path before browser inventory storage. The daemon may expose the closed `{status,reason,checkedAt}` compatibility row, and CLI doctor may show local binary path/version; neither raw version nor path enters extension presentation/storage for OpenCode.

[VERIFIED: codebase inspection] Generalize compatibility expiry over the closed shipped-provider roster rather than changing only the Claude literal to OpenCode. Compatibility refresh must not write selected settings, alter recommendation, or change Codex's unshipped Unsupported result.

## Don't Hand-Roll

| Do not build | Use instead | Reason |
|---|---|---|
| A second adapter/supervisor interface for server mode. [VERIFIED: codebase inspection] | Closed topology/process/readiness descriptors returned by the existing `buildSpawn`. [ASSUMED] | The phase exists to prove the five-method contract. |
| Port scanning, lock-file discovery, TUI inspection, or process-name attachment. [VERIFIED: codebase inspection] | `serve --port 0`, exact readiness line, authenticated health, and an in-memory/journaled owned lease. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/serve.ts] | Discovery can capture or kill a user-owned server and creates races. |
| A shell wrapper or interpolated command. [VERIFIED: codebase inspection] | Retained absolute binary plus argv arrays and `shell:false`. [CITED: https://nodejs.org/api/child_process.html] | Preserves command/task injection boundaries. |
| A browser-side semver/version policy. [VERIFIED: codebase inspection] | Existing daemon compatibility matrix/classifier and closed status/reason projection. [VERIFIED: codebase inspection] | UI spec explicitly excludes versions and version logic. |
| OpenCode auth/provider detection by reading or copying credential files. [VERIFIED: codebase inspection] | `authState:'unknown'`, OpenCode's own auth store, and a non-interactive usable-model policy preflight. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/auth/index.ts] | Avoids credential access and unsupported billing inference. |
| A permissive JSON parser based only on sample output. [VERIFIED: codebase inspection] | Strict Zod schemas derived from pinned `run.ts` and `message-v2.ts`, plus a schema-derived fixture and negative mutators. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | Sample-only parsing misses multi-step and nested-state invariants. |
| An OpenCode UI renderer/card/branch. [VERIFIED: codebase inspection] | Canonical provider metadata feeding existing Providers, consent, feed, and summary components. [VERIFIED: codebase inspection] | UI contract requires identical structure and semantics. |
| Arbitrary recursive deletion of adapter-provided private paths. [VERIFIED: codebase inspection] | Runtime-root-contained, exact-name/type/mode file descriptors and journal ownership. [ASSUMED] | Adapter declarations are not deletion authority. |

## Runtime State Inventory

[VERIFIED: codebase inspection] This phase changes live/runtime schemas and persisted extension records; plans need explicit compatibility handling rather than search-and-replace.

| Current state | New state | Migration/compatibility rule |
|---|---|---|
| `AgentProviderId` is only `'claude-code'`. [VERIFIED: codebase inspection] | Closed union `'claude-code' | 'opencode'`. [ASSUMED] | Every registry/matrix/doctor/wire validator derives from or exactly checks the same roster; unknown ids still fail. |
| Flat `SpawnSpec` describes one task process. [VERIFIED: codebase inspection] | Nested frozen preflight/cold/attach/owned-server topology. [ASSUMED] | Claude returns a cold-only topology with behavior/argv unchanged; add contract snapshots proving no regression. |
| Journal entries implicitly mean delegations and accept only Claude. [VERIFIED: codebase inspection] | Versioned process-role entries for delegation versus owned server. [ASSUMED] | Parse old valid Claude entries as `delegation`; never silently reinterpret unknown new fields. |
| One per-delegation runtime file `mcp-config.json`. [VERIFIED: codebase inspection] | Exact provider/profile runtime file sets plus a daemon-generation server runtime. [ASSUMED] | Cleanup validates root, filenames, types, ownership, and role; old Claude directory cleanup remains exact. |
| `activeRuns` owns every child. [VERIFIED: codebase inspection] | Active task runs plus at most one separate owned-server lease. [ASSUMED] | Server lifecycle is not exposed as a delegation and is closed on idle/daemon shutdown/recovery. |
| Parser drift class/reasons live in `claude-stream.ts`. [VERIFIED: codebase inspection] | Common bounded drift error with adapter-specific closed reason maps. [ASSUMED] | Preserve existing Claude reason strings; add OpenCode reasons without forwarding raw provider values. |
| Candidate result is an emitted run event before clean exit. [VERIFIED: codebase inspection] | Candidate remains daemon-private until exit/tree corroboration. [ASSUMED] | Existing persisted result/terminal records remain readable; new executions cannot persist premature success. |
| Consent/trust records accept only Claude. [VERIFIED: codebase inspection] | Provider-scoped closed records for Claude/OpenCode. [ASSUMED] | Existing valid Claude records stay valid; OpenCode trust is independent and challenge consumption rechecks current selection. |
| Controller/event-store/feed clients accept only Claude label/id. [VERIFIED: codebase inspection] | Exact canonical metadata for either shipped id. [ASSUMED] | Reject unknown/mismatched id/label pairs and preserve record key/version shape where possible. |
| Background stores only profile version per delegation and injects Claude/subscription context. [VERIFIED: codebase inspection] | Store immutable `{providerId,label,profileVersion,billingKind}` per delegation. [ASSUMED] | Rehydration validates canonical identity; OpenCode billing remains unknown. |
| Compatibility expiry reads only the Claude row. [VERIFIED: codebase inspection] | Compute expiration from closed shipped rows, normally the earliest supported-row expiry. [ASSUMED] | Stale projection stays deterministic and cannot affect settings/recommendation. |

## Common Pitfalls

1. **Treating every `step_finish` as terminal.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] Tool workflows legitimately produce intermediate `tool-calls`/`unknown` finishes. Test at least two continuation steps before the terminal candidate.
2. **Treating every `step_start` as a second run init.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/processor.ts] Emit one normalized init from the first start and validate subsequent starts as step boundaries.
3. **Trusting `--agent fsb`.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] The CLI falls back to default; effective-agent attestation and stderr sentinel rejection are required.
4. **Assuming `--pure` is full hermetic mode.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/plugin/index.ts] It skips external plugin loading, but other config/instruction/skill/managed/account paths need separate controls and validation.
5. **Using only `"*":"deny"` for external directories.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/agent/agent.ts] OpenCode appends a truncation-directory allow unless the exact glob is explicitly denied.
6. **Letting server stdout enter the task JSON parser.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/serve.ts] Server readiness and task JSONL are different bounded protocols and different child roles.
7. **Falling back after an attached child is spawned.** [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] No-event exit cannot prove no remote session/task was created; choose fallback before spawn/stdin only.
8. **Reporting recovered server death as lost user work.** [VERIFIED: codebase inspection] Add a process role to recovery accounting and user-visible restart dispositions.
9. **Publishing candidate result before exit.** [VERIFIED: codebase inspection] The current ordering needs a deliberate regression test with result→delayed nonzero exit and result→signal exit.
10. **Leaking version/topology through existing installed evidence.** [VERIFIED: codebase inspection] Keep full detection local, strip OpenCode version/path/server data before extension storage, and source-pin the presentation boundary.
11. **Updating only Providers compatibility.** [VERIFIED: codebase inspection] Consent, preflight, trust, controller, event store, side panel, background, diagnostics, and billing would still reject/mislabel OpenCode.
12. **Keeping the drift harness's Claude-native selectors.** [VERIFIED: codebase inspection] `system/init` and `result/success` do not exist in OpenCode; use per-adapter native selectors, labels, and negative mutators while still invoking the production parser generically.
13. **Allowing fixed config or secrets into journals/signatures/logs.** [VERIFIED: codebase inspection] Journal only digests/references and stable role facts; never serialize task, Basic Auth secret, raw config, raw health/body, or provider error.
14. **Changing UI structure for a topology the user cannot act on.** [VERIFIED: codebase inspection] Cold and attach must produce identical normalized UI snapshots and no HTML/CSS additions.

## Code Examples

### Exact OpenCode Task Argv Invariants

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] The profile should source-pin an allowlist equivalent to:

```text
cold:   opencode --pure --log-level ERROR run --format json --agent fsb [--thinking]
attach: opencode --pure --log-level ERROR run --format json --agent fsb [--thinking] --attach http://127.0.0.1:<owned-port>
serve:  opencode --pure --log-level ERROR serve --hostname 127.0.0.1 --port 0 --mdns false
```

[ASSUMED] The optional reasoning flag is a profile choice; if present, the parser must normalize it, and if absent the fixture still needs a direct parser case for optional `reasoning`. Never include positional message text, `--continue`, `--session`, `--fork`, `--share`, `--model`, `--file`, `--command`, password argv, or any permission-bypass flag. Task bytes go to the task client's stdin once and only once.

### Parser Terminal Refinement

```ts
if (raw.type === 'step_start') {
  requireSameSession(raw);
  requireNoTerminalCandidate();
  beginNextStep(raw.part);
  if (!seenInit) yield normalizedInit();
}

if (raw.type === 'step_finish') {
  requireOpenStep(raw.part);
  closeStepAndAccumulateUsage(raw.part);
  if (raw.part.reason === 'tool-calls' || raw.part.reason === 'unknown') continue;
  if (candidate) drift('duplicate_result');
  candidate = normalizedCandidate(raw.part);
}
```

[CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] The two continuation reasons above come from the pinned prompt loop; all source-valid other reasons are terminal candidates, not authoritative success.

### Replay Fence

```ts
if (lease && !(await revalidateOwnedLease(lease))) {
  // No task child/session exists yet: one cold selection is safe.
  selected = spec.topology.fallbackBeforeSpawn;
} else {
  selected = spec.topology.task;
}

const child = spawnSelected(selected);
replayAllowed = false; // closes before task stdin is written
await writeTaskOnce(child.stdin, task);
```

[ASSUMED] Tests should assert no second task child after the `spawnSelected` line for every failure permutation, including zero-event attach exit.

### Browser-Safe Run Metadata

```js
const provider = canonicalDelegationProvider(authoritativeProviderId);
runMetadata.set(delegationId, Object.freeze({
  providerId: provider.id,
  label: provider.label,
  profileVersion: accepted.profileVersion,
  billingKind: provider.billingKind
}));
```

[ASSUMED] This replaces hardcoded Claude client/billing context without allowing wire/provider output to supply a label or billing classification.

## State of the Art

| Surface | Pinned 1.14.25 behavior relevant to Phase 64 | Planning rule |
|---|---|---|
| `run` | JSON output, stdin message append, fresh session by default, attach URL/password support, agent validation with fallback, optional reasoning. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] | Pin exact argv and treat agent fallback as a security failure. |
| Event model | Strict part schemas for step/text/reasoning/tool; tool completion/error states include call/tool/input/time and output/error. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] | Derive Zod schemas/fixture from tag source and fail on drift. |
| Prompt loop | `tool-calls` and `unknown` are nonterminal; another finish reason ends the loop absent error. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] | Separate step finish from terminal candidate. |
| Server | Default port 0/loopback, explicit network options, Basic Auth environment, exact health/version route. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/network.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/routes/global.ts] | Use owned random-port server and authenticated lease checks only. |
| Config isolation | Public project-disable and pure flags exist; global/home/managed/account paths and internal test-isolation hooks remain version-specific. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/global/index.ts] | Spawn exact 1.14.25 only and attest effective authority. |
| Permissions | Ordered wildcard evaluation and MCP tool ids prefixed by sanitized server name. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/permission/index.ts] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/mcp/index.ts] | Default deny, exact external-dir deny, final `fsb_*` allow. |

[ASSUMED] This research is valid for planning the exact 1.14.25 profile. Revalidate before changing the execution profile, accepting a newer OpenCode version for spawn, or after 2026-08-19 if planning has not begun, because internal isolation flags and event shapes are not public stability guarantees.

## Assumptions Log

| Assumption | Risk | Plan treatment |
|---|---|---|
| Production use of `OPENCODE_TEST_HOME` and `OPENCODE_TEST_MANAGED_CONFIG_DIR` is acceptable only inside the exact 1.14.25 profile. [ASSUMED] | They are internal source hooks and may disappear or change. | Source-pin names/semantics, execute only exact 1.14.25, and fail closed on newer versions until a new profile is reviewed. |
| Leaving OpenCode data/state roots unchanged is the least-authority way to preserve existing sign-in/recent model. [ASSUMED] | OpenCode also uses those roots for its own database/log/state; the public API has no separate auth-only path. | Never read/copy credentials; keep sessions fresh/no continuation; document native OpenCode persistence and do not claim an ephemeral provider data store. |
| The private environment's OpenCode-resolved default is the operative “existing default” when global user config is intentionally excluded. [ASSUMED] | A model configured only in excluded global config may not resolve identically. | Never copy/pass that model; require exact-environment model preflight and show not-ready guidance if resolution fails. |
| A server warmed after cold commitment is the intended meaning of “cold default.” [ASSUMED] | Starting the server earlier could make attach the de facto first path; starting later may reduce reuse. | Make first/no-lease task deterministically cold and test later verified attach; idle timing remains discretionary. |
| Existing Claude billing behavior must remain stable while OpenCode billing is unknown. [ASSUMED] | A global switch to unknown could regress Phase 61 summaries. | Put billing kind in canonical provider metadata and test both providers explicitly. |

## Open Questions Resolved for Planning

| Question | Resolution |
|---|---|
| When may attach fall back? | Only during lease revalidation before a task child is spawned or task stdin begins. After spawn, zero events still does not permit replay. [ASSUMED] |
| How can a five-method adapter describe a server? | `buildSpawn` returns nested provider-neutral process/topology/readiness declarations; the supervisor remains the only executor. [ASSUMED] |
| How is `fsb` agent selection proven despite CLI fallback? | Exact-environment effective config/agent/tool preflight, server-side attestation for leases, and bounded stderr fallback sentinels before success. [ASSUMED] |
| Which `step_finish` is terminal? | `tool-calls`/`unknown` are intermediate; the first other source-valid finish is the single candidate. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] |
| Does a result reach UI before exit? | No. Candidate remains daemon-private and is emitted only after clean exit/tree settlement. [ASSUMED] |
| How is OpenCode selected without widening wire authority? | Background reads authoritative saved provider settings, binds consent to it, and sends the canonical id; side panel still cannot choose adapter in the start request. [VERIFIED: codebase inspection] |

## Environment Availability

| Capability | Observed state | Planning effect |
|---|---|---|
| Local platform | macOS workspace. [VERIFIED: codebase inspection] | POSIX process/path behavior can be exercised locally; Windows behavior remains injected automated coverage. |
| OpenCode | `/opt/homebrew/bin/opencode`, version `1.14.25`. [VERIFIED: codebase inspection] | Valid local compatibility baseline and help/source cross-check; do not encode the path. |
| OpenCode source | Official `v1.14.25` tag inspected locally from a clean archive. [VERIFIED: codebase inspection] | Exact source-derived fixture/config/event/server contracts are available without a live model call. |
| Node/npm | Node `24.14.1`, npm `11.11.0`; repository root requires Node >=24 and MCP package supports >=18.20. [VERIFIED: codebase inspection] | Keep production APIs within package/CI support, and do not infer older-runtime success only from local Node 24. |
| OpenCode authentication/model | Deliberately not probed with a real task. [VERIFIED: codebase inspection] | Unit/source/fixture tests are blocking; genuine account/model/browser proof remains `human_needed`. |
| Browser/daemon integration | Not exercised during research. [VERIFIED: codebase inspection] | Use existing VM/DOM/bridge stubs and defer genuine Chrome behavior. |
| New dependencies | None required. [VERIFIED: codebase inspection] | No install/bootstrap task belongs in the phase plan. |

## Validation Architecture

### Nyquist Status

[VERIFIED: codebase inspection] `workflow.nyquist_validation` is absent from `.planning/config.json`, so validation is enabled by default. Every implementation task needs a deterministic automated command, and missing OpenCode/topology/provider-neutral harnesses must be created in Wave 0 before dependent production work.

### Wave 0 Test/Harness Work

| Harness | Blocking coverage |
|---|---|
| New `tests/mcp-opencode-adapter.test.js` | Retained binary/version/profile; exact five methods/caps; deep freeze; stdin-only task; forbidden argv; private config/env; permission order/truncation deny; preflight exactness; cold/attach specs; strict multi-step parser and bounded negatives. [ASSUMED] |
| New `tests/mcp-opencode-server-topology.test.js` or equivalent supervisor section | Port 0/readiness parsing; Basic Auth; exact health/version; process identity/config fingerprint; one lease; cold default/warm/later attach; idle teardown; daemon close; health loss; pre-spawn fallback; post-spawn no replay; user process non-interaction. [ASSUMED] |
| OpenCode fixture directory and per-adapter fixture contract table | Schema-derived manifest, exact source docs, multi-step provider-native order, production parser sequence, missing/unknown/duplicate/reorder/session/post-terminal cases, `liveCapturePending:true`. [ASSUMED] |
| Provider-neutral extension fixtures | Canonical Claude/OpenCode ids/labels/billing, trust/challenge isolation, selected-provider recheck, controller/event-store/feed rehydration, exact OpenCode copy, no branch/version/topology leakage. [ASSUMED] |

### Focused Test Matrix

| Area | Tests to add/extend | Key assertions |
|---|---|---|
| Contract/registry | `mcp-agent-provider-contract`, OpenCode adapter test. [VERIFIED: codebase inspection] | Two exact production ids; five methods; Claude cold behavior unchanged; OpenCode task/chat/resume/server caps exact; hostile nested mutation fails. |
| Runtime/supervisor | `mcp-spawn-supervisor`, `mcp-agent-orphan-recovery`, new topology suite. [VERIFIED: codebase inspection] | Generic topology only; role-aware journal; exact ownership; cold/attach parity; fallback fence; one server; result withheld through clean/nonzero/signal/tree outcomes. |
| Parser/fixture | `mcp-agent-drift-smoke`, `mcp-agent-stream-fixture`, new adapter suite. [VERIFIED: codebase inspection] | Multi-step init/finishes, ordered tool pair, optional reasoning, terminal candidate, strict sessions/ids/fields, per-adapter native mutators, no live binary/network. |
| Policy/security | `agent-provider-forbidden-flags`, new private-policy/source gate. [VERIFIED: codebase inspection] | No bypass flags; task absent from spec/files/env/log/receipts; only FSB MCP; exact effective enabled tools; no inherited config authority; no secrets in snapshots/errors. |
| Matrix/doctor/inventory | `mcp-adapter-compatibility`, `mcp-diagnostics-status`, `mcp-client-inventory`, provider storage tests. [VERIFIED: codebase inspection] | Exact 1.14.25 row, registry/matrix/fixture/doctor bijection, auth unknown, local doctor path/version only, browser-safe installed/compatibility projection without OpenCode version/path. |
| Consent/lifecycle | `delegation-preflight`, `delegation-consent`, `delegation-event-store`, `delegation-controller`, routing/phase contract. [VERIFIED: codebase inspection] | Provider-scoped trust/challenge/run metadata, no request-side adapter authority, exact not-ready outcome, OpenCode billing unknown, Claude regression. |
| Providers/side panel | `providers-panel-logic`, `providers-panel-ui`, `delegation-sidepanel-ui`. [VERIFIED: codebase inspection] | Row order unchanged; OpenCode safe Supported/Degraded; Codex Unsupported; exact approved copy; no HTML/CSS; cold/attach identical; no success before clean exit. |
| Drift diagnostics | `agent-protocol-drift-diagnostics`. [VERIFIED: codebase inspection] | Both canonical ids, closed reason mapping/rate limits, no raw error/event/secret, independent throttling. |

### Requirement-to-Test Map

| Requirement | Minimum blocking automated evidence |
|---|---|
| MULTI-01 | Contract/registry test, cold/attach production spec snapshots, generic topology supervisor test, server ownership/health/idle/recovery test, fallback replay-fence test, candidate-result/exit corroboration test, and provider-neutral extension lifecycle snapshots. [ASSUMED] |
| MULTI-02 | Exact generated config snapshot, prompt digest, permission precedence/truncation deny, effective config/agent/tool preflight cases, no-model not-ready case, inherited plugin/MCP/agent/command/instruction/skill poison cases, and source-pin for 1.14.25 isolation flags. [ASSUMED] |
| MULTI-03 | Committed manifest/JSONL, registry/matrix/fixture bijection, production-parser expected sequence, adapter-native negative mutators, CI workflow smoke invocation, and milestone-end provenance row left `human_needed`. [ASSUMED] |

### Fast Verification Commands

[VERIFIED: codebase inspection] These commands match the repository's existing script-style harness. The planner may split files differently, but each task command should stay below roughly 30 seconds locally.

```bash
npm --prefix mcp run build && node tests/mcp-opencode-adapter.test.js
npm --prefix mcp run build && node tests/mcp-opencode-server-topology.test.js
npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-agent-orphan-recovery.test.js
npm --prefix mcp run build && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-agent-stream-fixture.test.js
npm --prefix mcp run build && node tests/mcp-agent-provider-contract.test.js && node tests/mcp-adapter-compatibility.test.js && node tests/mcp-diagnostics-status.test.js && node tests/mcp-client-inventory.test.js
node tests/delegation-consent.test.js && node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js
node tests/delegation-routing.test.js && node tests/delegation-sidepanel-ui.test.js && node tests/delegation-phase-contract.test.js
node tests/mcp-agent-providers-storage.test.js && node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js
node tests/agent-protocol-drift-diagnostics.test.js && node tests/agent-provider-forbidden-flags.test.js
```

### Phase Gate

[VERIFIED: codebase inspection] After focused tests: run the MCP build, all touched adapter/delegation/Providers/source-security suites, then repository `npm test`. Preserve workspace generated-artifact guards and update source-pin counts in the same implementation change that changes their source.

### Deferred UAT Ledger

| Evidence | Status |
|---|---|
| Genuine authenticated OpenCode-to-browser delegation with real provider/model configuration. [VERIFIED: codebase inspection] | `human_needed` at the single v0.9.91 milestone-end UAT sweep. |
| Live Providers transition for installed OpenCode 1.14.25 and keyboard/screen-reader announcement behavior. [VERIFIED: codebase inspection] | `human_needed` at the single v0.9.91 milestone-end UAT sweep. |
| Live cold and FSB-owned attach paths producing the same provider-neutral feed and terminal summary. [VERIFIED: codebase inspection] | `human_needed` at the single v0.9.91 milestone-end UAT sweep. |

## Security Domain

### Assets and Trust Boundaries

| Asset/boundary | Required security property |
|---|---|
| User task | Enters exactly one task-client stdin; absent from argv/env/files/names/logs/URLs/journals/diagnostics and never replayed. [VERIFIED: codebase inspection] |
| Retained OpenCode binary | Absolute, native, realpath-bound, version-probed, identity-rechecked, and profile-pinned before every spawn/lease use. [VERIFIED: codebase inspection] |
| Private OpenCode config | Exact-owned paths/modes, isolated config/home/managed-dir inputs, project disable/pure flags, only FSB authority, effective attestation. [ASSUMED] |
| OpenCode auth/default model | OpenCode-owned data/state only; FSB neither reads credentials nor injects provider/model fallback; usability is a boolean preflight fact, auth remains unknown. [ASSUMED] |
| FSB MCP endpoint | Private loopback remote MCP entry only; enabled tool names must match `fsb_*`; existing FSB bridge/tab/vault/consent authority remains downstream. [VERIFIED: codebase inspection] |
| Owned OpenCode server | One daemon-owned process identity, loopback random port, random Basic Auth secret, exact profile/config fingerprint, bounded idle and recovery. [ASSUMED] |
| Provider JSONL | Untrusted bounded bytes; strict UTF-8/JSON/source schemas/session/lifecycle; raw data ends at parser. [VERIFIED: codebase inspection] |
| Extension boundary | Only canonical id/label, closed compatibility/status, normalized event view models, profile facts, and billing unknown for OpenCode. [VERIFIED: codebase inspection] |

### Threats and Mitigations

| Threat | Required mitigation | Verification |
|---|---|---|
| Task/command injection | No shell; task non-representable in spec topology/private files and written once to stdin; `--log-level ERROR`; sensitive-value scan across spec/diagnostics/events. [VERIFIED: codebase inspection] [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/util/log.ts] | Hostile Unicode/quotes/newlines/task sentinel across cold/attach/preflight/journal/log spies. [ASSUMED] |
| Attachment to user or spoofed local server | Never discover; lease only from FSB launch; retained PID/start identity/config digest; random secret; authenticated exact health/version. [ASSUMED] | Fake responder, wrong PID/version/secret/host/port/config, user process sentinel, and kill spy. [ASSUMED] |
| Attach replay/duplicate action | Decide fallback before task-child spawn; permanent replay fence at spawn/stdin/event; exact-once terminal. [ASSUMED] | Health-fail fallback succeeds once; every later failure creates one child/session/feed/terminal and no cold child. [ASSUMED] |
| User/project/managed config injects tools/hooks/MCP/instructions | Private XDG config/home/managed dir, project disable, pure, skill/prompt flags, exact effective config/agent/tool attestation. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts] | Poison global/project/home/managed/active-org fixtures; preflight fails before acceptance and no task child. [ASSUMED] |
| `fsb` agent silently falls back | Effective agent/server attestation plus reject known bounded fallback warnings on stderr. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] | Missing/subagent/renamed/overridden agent tests for cold and attach. [ASSUMED] |
| Built-in/external tool escape | Ordered wildcard deny, exact truncation external-dir deny, final `fsb_*` allow, effective enabled-tool assertion. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/agent/agent.ts] | Shell/edit/read/web/task/skill/external-dir and unknown future tool poison cases stay false. [ASSUMED] |
| Protocol drift or session mixing | Strict 256 KiB JSONL, exact shapes, inner/outer session equality, ordered state machine, unique ids, one candidate, post-terminal rejection, child kill. [VERIFIED: codebase inspection] | Fixture negative matrix and chunk/UTF-8/boundary fuzz. [ASSUMED] |
| Premature/fabricated success | Keep result candidate private until clean code 0/no signal/tree cleanup; discard on all errors. [VERIFIED: codebase inspection] | Delayed exit, nonzero, signal, missing/duplicate/post-terminal/provider-error/tree-unsettled cases. [ASSUMED] |
| Basic Auth/config/provider secret disclosure | CSPRNG secret reference; env/header only; never argv/URL/query/journal/signature/UI/storage/log; raw preflight/config/error bodies discarded. [ASSUMED] | Sentinel secret across serialized specs, logs, doctor, extension storage/DOM, receipts, drift detail. [ASSUMED] |
| Orphaned long-lived server | Role-aware journal, exact process inspection/termination, idle timer, daemon-close cleanup, conservative ambiguous degradation. [ASSUMED] | Restart recovery for confirmed/stale/ambiguous server and delegation entries. [ASSUMED] |
| Provider identity/billing confusion | Authoritative background selection, provider-bound challenge, canonical id/label table, immutable run metadata, OpenCode billingKind unknown. [VERIFIED: codebase inspection] | Selection-change races, forged labels/ids, rehydration, Claude/OpenCode billing snapshots. [ASSUMED] |
| UI leakage or authority growth | Closed projections/textContent, no version/topology/raw event/model/config, no new HTML/CSS, compatibility observational only. [VERIFIED: codebase inspection] | DOM/storage/log canaries and source gates. [ASSUMED] |

### ASVS-Oriented Controls

[CITED: https://owasp.org/www-project-application-security-verification-standard/] Applicable control themes are:

- V2 authentication: the owned server requires a high-entropy daemon-minted Basic Auth secret; provider authentication remains OpenCode-owned and unclassified. [ASSUMED]
- V3 session management: every delegation creates one fresh session; no continue/session flags, cross-daemon lease persistence, or replay after acceptance. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts]
- V4 access control: only an FSB-owned server lease and `fsb_*` tools are authorized; background remains provider-selection authority; user processes and non-FSB tools are outside scope. [VERIFIED: codebase inspection]
- V5 validation/encoding: exact plain-object schemas, bounded UTF-8/JSON/strings/numbers, closed ids/reasons/topologies, safe text projection, and unknown-field rejection. [VERIFIED: codebase inspection]
- V6 cryptography: Node CSPRNG generates server secrets; secrets are never used as identifiers or persisted in public receipts. [CITED: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback]
- V7 error/logging: stable sanitized diagnostics only; no raw provider stderr/error/config/health/task/secret in logs or browser state. [ASSUMED]
- V12 file/resource handling: private root containment, exact file allowlist, restrictive modes, symlink/type refusal, role-aware cleanup, and no arbitrary adapter-path deletion. [VERIFIED: codebase inspection]
- V13 API/web service: loopback-only authenticated health/config/agent requests with response/time caps, exact version and process ownership. [ASSUMED]
- V14 configuration: private source-pinned configuration, no project/user authority inheritance, explicit sharing disable, exact capability/source gates, and fail-closed drift. [ASSUMED]

## Sources

### Primary External Sources

1. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/run.ts] OpenCode 1.14.25 `run` source. Supports stdin task input, JSON event emission, attach/password behavior, fresh/continued session flags, agent fallback, event filtering, and error behavior.
2. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/message-v2.ts] OpenCode 1.14.25 message/part schemas. Supports exact step, text, reasoning, tool state, token, cost, id, time, and metadata fields.
3. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/processor.ts] OpenCode 1.14.25 session processor. Supports step-start/step-finish creation and per-step usage/cost emission.
4. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/prompt.ts] OpenCode 1.14.25 prompt loop. Supports `tool-calls`/`unknown` continuation versus terminal finish behavior.
5. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/cmd/serve.ts] OpenCode 1.14.25 serve command. Supports headless server launch and exact readiness line.
6. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/cli/network.ts] OpenCode 1.14.25 network options. Supports default random port, loopback hostname, and explicit network-option precedence behavior.
7. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/middleware.ts] OpenCode 1.14.25 server middleware. Supports environment-driven Basic Auth and default username.
8. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/routes/global.ts] OpenCode 1.14.25 global routes. Supports `/global/health` response shape and installation version.
9. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/server/routes/instance/index.ts] OpenCode 1.14.25 instance routes. Supports authenticated config and agent inspection surfaces used for lease attestation.
10. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/config.ts] OpenCode 1.14.25 configuration loader/schema. Supports load order, project disable, global/custom/directory/managed/account sources, agent/MCP/share/default-model fields.
11. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/paths.ts] OpenCode 1.14.25 config path discovery. Supports global, project, home `.opencode`, and explicit config-directory sources.
12. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/global/index.ts] OpenCode 1.14.25 global paths. Supports separate XDG config/data/state roots and `OPENCODE_TEST_HOME` isolation.
13. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/managed.ts] OpenCode 1.14.25 managed config. Supports system-managed locations and the version-bound managed-directory test override.
14. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/flag/flag.ts] OpenCode 1.14.25 flags. Supports project, prompt, skill, update, LSP, server-auth, config, and pure controls.
15. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/session/instruction.ts] OpenCode 1.14.25 instruction discovery. Supports project/global/Claude instruction paths and disable behavior.
16. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/plugin/index.ts] OpenCode 1.14.25 plugin loader. Supports pure-mode handling of external versus internal plugins.
17. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/agent.ts] OpenCode 1.14.25 agent config schema. Supports primary mode, prompt, steps, and permission definition.
18. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/agent/agent.ts] OpenCode 1.14.25 resolved agents. Supports permission merge order and truncation-directory allow insertion.
19. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/permission/index.ts] OpenCode 1.14.25 permission engine. Supports insertion-order rule creation and last-match tool disabling.
20. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/tool/truncate.ts] OpenCode 1.14.25 tool truncation. Supports the exact data-root external-directory glob that must be denied.
21. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/mcp/index.ts] OpenCode 1.14.25 MCP integration. Supports sanitized `fsb_<tool>` names.
22. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/config/mcp.ts] OpenCode 1.14.25 MCP config. Supports remote URL, enabled flag, OAuth disable, and timeout shape.
23. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/auth/index.ts] OpenCode 1.14.25 auth store. Supports auth ownership under OpenCode's data root.
24. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/provider/provider.ts] OpenCode 1.14.25 default-model resolution. Supports config model, recent state, then available-provider fallback order.
25. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/index.ts] OpenCode 1.14.25 global CLI middleware. Supports pure and log-level option processing and argv logging initialization.
26. [CITED: https://github.com/anomalyco/opencode/blob/v1.14.25/packages/opencode/src/util/log.ts] OpenCode 1.14.25 logger. Supports level filtering and file-log behavior.
27. [CITED: https://opencode.ai/docs/cli/] OpenCode CLI documentation, accessed 2026-07-20. Public command overview cross-check.
28. [CITED: https://opencode.ai/docs/server/] OpenCode server documentation, accessed 2026-07-20. Public server/auth/API overview cross-check.
29. [CITED: https://opencode.ai/docs/agents/] OpenCode agent documentation, accessed 2026-07-20. Public agent/permission overview cross-check.
30. [CITED: https://nodejs.org/api/child_process.html] Node.js Child Process API. Supports explicit executable/argv, `shell:false`, detached process groups, and stdio ownership.
31. [CITED: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback] Node.js Crypto API. Supports cryptographically strong random Basic Auth secret generation.
32. [CITED: https://owasp.org/www-project-application-security-verification-standard/] OWASP ASVS project. Supports the security-domain control mapping.

### Repository Sources

- [VERIFIED: codebase inspection] `.planning/phases/64-opencode-adapter/64-CONTEXT.md`, `64-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` define the locked scope, exact product copy, requirements, dependencies, and deferred UAT.
- [VERIFIED: codebase inspection] `mcp/src/agent-providers/adapter.ts`, `registry.ts`, `claude-code.ts`, `claude-detect.ts`, `claude-profile.ts`, and `claude-stream.ts` define the five-method/declarative composition baseline.
- [VERIFIED: codebase inspection] `mcp/src/agent-providers/spawn-supervisor.ts`, `runtime-files.ts`, `process-tree.ts`, and `serve-delegation.ts` define current process, task, journal, recovery, compatibility, and bridge ownership.
- [VERIFIED: codebase inspection] `mcp/src/agent-providers/compatibility.ts`, `mcp/src/diagnostics.ts`, `mcp/src/client-inventory.ts`, and `mcp/src/platforms.ts` define matrix/doctor/installation evidence seams.
- [VERIFIED: codebase inspection] `extension/utils/mcp-agent-providers.js`, delegation preflight/consent/event-store/controller/feed/drift helpers, `extension/background.js`, `extension/ui/providers-panel.js`, `extension/ui/options.js`, and `extension/ui/sidepanel.js` define browser projection and the remaining Claude literals.
- [VERIFIED: codebase inspection] `tests/mcp-agent-drift-smoke.test.js`, existing fixture manifest, adapter/compatibility/supervisor/recovery/doctor/inventory tests, delegation lifecycle/UI tests, Providers tests, source/security gates, `.github/workflows/ci.yml`, `package.json`, and `mcp/package.json` define automated acceptance patterns.

## Metadata

| Field | Value |
|---|---|
| Research mode | Ecosystem plus repository architecture. [VERIFIED: codebase inspection] |
| Nyquist validation | Enabled; config contains no explicit false setting. [VERIFIED: codebase inspection] |
| Security domain | Required and included because the phase adds process/server ownership, configuration isolation, authentication secret, untrusted JSONL, and browser authority projection. [VERIFIED: codebase inspection] |
| New third-party packages | None. [VERIFIED: codebase inspection] |
| Highest-confidence findings | Multi-step finish semantics, run agent fallback, config load paths, permission precedence/truncation exception, server port/auth/health, and repository hardcode inventory. [CITED: https://github.com/anomalyco/opencode/tree/v1.14.25/packages/opencode] [VERIFIED: codebase inspection] |
| Residual medium-confidence evidence | Genuine account/model behavior, real cold/attach equivalence, UI accessibility, and production use of upstream test-isolation flags. [ASSUMED] |
| Human evidence | Exactly the three UI-spec rows remain `human_needed` at milestone end. [VERIFIED: codebase inspection] |

## Research Resolution

[VERIFIED: codebase inspection] Phase 64 is ready to plan if the first plan treats common topology/runtime/provider identity as the prerequisite and later plans do not bypass the effective-policy attestation or replay/result fences. The central design constraint is conservative: exact OpenCode 1.14.25 execution only, cold first without a verified lease, attach only to an identity-bound FSB server, no fallback after task-client spawn, and no success event before clean exit/tree settlement. All genuine authenticated/browser evidence remains deferred and must not be claimed from the schema-derived fixture.

## RESEARCH COMPLETE
