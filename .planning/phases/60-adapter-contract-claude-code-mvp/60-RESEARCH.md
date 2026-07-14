# Phase 60 Research: Adapter Contract & Claude Code MVP

**Researched:** 2026-07-14  
**Scope:** Daemon-side adapter, supervision, recovery, Claude profile, normalized events, and reverse-channel harness  
**Live boundary:** Claude authentication/model calls, real OS tree cleanup, daemon-crash recovery, and browser-driving remain pending for the single milestone-end UAT gate

## Summary

Phase 60 should extend the authenticated Phase 59 `ext:*` handler seam rather than add a second wire protocol. The intentionally started `serve` process is the only owner of a `SpawnSupervisor`; stdio processes and incidental bridge hubs remain unable to spawn. The HTTP endpoint must be bound before the supervisor can generate Claude's private MCP configuration, but orphan recovery must finish before the bridge connects and advertises `agent-spawn`.

The clean implementation is a provider-neutral adapter package plus a supervisor that owns every process concern. Claude-specific code supplies detection, a closed 2.1.177 compatibility profile, and bounded JSONL normalization. It does not spawn, mutate global state, accept wire payloads, or leak raw provider JSON upward. Phase 61 will add extension routing, consent, feed persistence, stop/take-control UX, and offline recovery; Phase 60 proves the daemon core through the existing reverse-channel test harness.

No new AI framework or runtime dependency is needed. The MCP package already has strict TypeScript, ESM, Zod, Node process/stream APIs, and built-output Node tests.

## Normative Inputs

Current sources override older milestone research where they conflict:

- `60-CONTEXT.md`: exact phase boundary and decisions D-01..D-30.
- `60-AI-SPEC.md`: direct-CLI runtime profile, domain guardrails, TypeScript validation, and 20-case evaluation contract.
- `.planning/REQUIREMENTS.md`: ADAPT-01..05 and CLAUDE-01..04.
- Phase 59 context/review/verification: authenticated routing, exact-five transport errors, exact-once correlations, and byte-freeze boundary.
- `skills/fsb/SKILL.md`, `multi-agent-contract.md`, and `vault-boundary.md`: static delegated-agent policy.

## Existing Code Seams

### Serve ownership and startup

- `mcp/src/index.ts::runHttpMode()` currently rotates the bridge secret, constructs a plain `WebSocketBridge`, connects it, and only then binds Streamable HTTP. Phase 60 must reorder this.
- `startHttpServer()` returns the actual loopback MCP endpoint needed by the generated Claude config.
- `runStdioServer()` and other `new WebSocketBridge()` call sites must remain supervisor-free and must not advertise `agent-spawn`.
- Shutdown is currently synchronous at the signal edge and closes HTTP before disconnecting the bridge. It needs one idempotent async shutdown path that stops intake, settles children, closes HTTP, disconnects the bridge, and exits.

Recommended order:

1. Rotate Phase 59 session secret; create queue and a bridge not yet connected.
2. Bind Streamable HTTP and obtain `httpServer.endpoint`.
3. Construct the supervisor with that endpoint and private runtime dependencies.
4. Run journal recovery. If classification or cleanup is ambiguous, keep spawn unavailable/fail startup closed.
5. Install the closed handler and `agent-spawn` capability on the serve-owned bridge, then connect it.
6. Push inventory only after bridge connection.

If bridge construction cannot be configured after creation, create HTTP with the same preconfigured bridge instance, then connect only after recovery. Do not create a temporary capable bridge or advertise during recovery.

### Reverse-channel contract

- `mcp/src/types.ts` already defines `ExtRequestHandler(request, emit) => Promise<payload>`.
- `mcp/src/bridge.ts::_invokeLocalExtHandler()` and `_invokeRelayedExtHandler()` keep a correlation open while the handler promise is pending and forward validated `ext:event` frames during that interval.
- Phase 59 owns routing, authentication, duplicate-id handling, route cleanup, and the exact five `ExtError.code` values. Adapter failures must remain typed delegation events/final payloads, not new transport codes.
- `mcp/src/ext-protocol.ts` strictly validates the outer frame but treats `payload` as a bounded record. The new handler must apply recursively strict method-specific Zod schemas before adapter lookup.

Use exactly two methods:

- `delegate.start`: `{ adapterId: 'claude-code', task: string }`; reject every extra/nested key. Mint the delegation ID server-side, emit it in the first `delegation.started` event, stream normalized events, and resolve the handler only at terminal settlement.
- `delegate.cancel`: `{ delegationId: string }`; reject extra keys, wait for verified tree disappearance, then return a typed cancellation result.

The bridge request id is transport correlation only. It is not the delegation/process identity. A cancel uses the earlier server-minted id.

## Recommended Module Design

Keep provider-specific code under `mcp/src/agent-providers/` and make dependencies injectable for deterministic built-output tests:

| File | Responsibility |
|------|----------------|
| `types.ts` | Exact five-method `AgentProviderAdapter`; detection, spawn spec, capabilities, task/context, normalized event, and typed adapter error contracts |
| `registry.ts` | Closed canonical-id registry; only `claude-code` in Phase 60; typed failure for unknown/case-varied/duplicate ids |
| `claude-code.ts` | Exact-path detection, version-profile selection, immutable argv/config construction, `caps()`, delegation to parser/kill helpers |
| `claude-stream.ts` | Incremental bounded JSONL framing, known 2.1.177 event validation, normalization, and `agent_protocol_drift` errors |
| `spawn-supervisor.ts` | Strict handler schemas, active-run map, spawn/stdin/drains, exact-once settlement, cancellation, shutdown, and event translation |
| `process-tree.ts` | POSIX group signals, Windows direct `taskkill`, liveness/descendant inspection contracts, and injectable clocks/process calls |
| `runtime-files.ts` | Owner-only runtime directory, private MCP config, atomic orphan journal, cleanup, and symlink/type checks |
| `diagnostics.ts` (or focused helper) | Closed secret-free diagnostic categories, bounded redacted stderr tail, and content-free counters |

Ship the reviewed static agent policy at `mcp/ai/agents/fsb.json`. `mcp/package.json` already includes `ai/` in published files, but tests must assert the built package asset and parse its exact closed schema.

The adapter interface has exactly:

```ts
interface AgentProviderAdapter {
  detect(): Promise<AdapterDetection>;
  buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec>;
  parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent>;
  kill(child: SupervisedChild, options: { grace: number }): Promise<KillResult>;
  caps(): AdapterCapabilities;
}
```

No `start`, `close`, `configure`, or hidden lifecycle method belongs on the adapter. `buildSpawn()` returns frozen data; only the supervisor calls `spawn`.

## Claude Detection and Compatibility Profile

Reuse the dependency-injection style of `mcp/src/client-inventory.ts`, but do not reuse its weak PATH candidate result as a spawn fingerprint. Detection must:

1. Resolve a native executable to one retained real path.
2. execute that exact path with `['--version']`, `shell: false`, bounded output, and timeout;
3. parse semver and require the closed minimum/profile baseline `2.1.177`;
4. return an explicit non-inferred auth state and a secret-free diagnostic when unavailable;
5. pass the same retained path into `buildSpawn()` so spawn never searches PATH again.

On Windows, `.cmd`/`.bat` cannot be passed directly to Node without a shell. Accept a native executable or a verified deterministic shim unwrapping to a fixed interpreter/entry point. Otherwise report unsupported. Never use `cmd /c`, `shell: true`, or string command construction.

The baseline argv is fixed by the daemon and AI-SPEC. It includes print/verbose stream JSON, partial messages, empty setting sources (subject to compatibility attestation), slash-command/Chrome isolation where supported by the closed profile, strict private MCP config, shipped inline `fsb` agent plus `--agent fsb`, `dontAsk`, literal empty built-in tools, only `mcp__fsb`, redundant built-in denies, 40 turns, and no persistence. The task is not an argv element; it is bounded UTF-8 written to stdin after all consumers/listeners attach.

Official docs support `--agents` plus `--agent`, `--max-turns`, and `--tools ""`; they also state `--help` is incomplete. Do not weaken the profile because 2.1.177 help omits a documented flag. Do not use `--bare`, which breaks the required OAuth/keychain subscription path. Because strict MCP does not isolate every customization and empty `--setting-sources` semantics are not proven live here, validate `system/init` before treating the run as browser-ready. Unexpected built-ins, MCP servers, plugins/hooks, or missing `fsb` are terminal configuration drift. The live 2.1.177 isolation check remains milestone-end UAT.

## Spawn and Lifecycle State Machine

Model each run explicitly rather than with independent booleans:

`created -> spawning -> running -> stopping -> settled`

Terminal reasons include success, cancelled, spawn/stdin failure, non-result exit, protocol drift, tree unsettled, and daemon restart loss. Every event/error/close/cancel/shutdown race enters one idempotent `settleOnce()` path.

Supervisor invariants:

- fixed spawn options: `shell: false`, `detached: true`, `windowsHide: true`, `stdio: ['pipe','pipe','pipe']`;
- derive the environment from the daemon only after deleting `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY`; add only non-secret delegation/profile fingerprints;
- attach child `error`/`close`, stdout parser, and bounded stderr drain before writing stdin;
- honor stdin backpressure and close stdin for one-shot task mode;
- concurrently drain both output pipes; never await exit before draining;
- keep the `delegate.start` handler pending through validated terminal settlement;
- never replay a task after any failure because browser effects may already have occurred.

Suggested resource bounds from AI-SPEC: 64 KiB task, 256 KiB JSONL line, 64 KiB redacted stderr tail, unlimited total stdout only through incremental processing (test at least 200 KiB), and 40 turns.

## Tree Cancellation and Orphan Recovery

POSIX cancellation signals the detached process group with `SIGTERM`, waits the configured grace interval while observing exit/tree state, then sends `SIGKILL` to the group. Windows invokes `taskkill` directly with `['/pid', String(pid), '/T', '/F']`. A kill promise resolves only after child exit and the injected inspector reports no matching descendant.

Recovery should reuse Phase 59's `bridge-auth.ts` discipline: owner-only directory/file modes, `O_EXCL|O_NOFOLLOW`, fsync, atomic rename, exact-key validation, and safe cleanup. The journal stores no prompt or provider output—only delegation id, PID/group, creation/process identity, adapter/profile, fixed argv signature, and a non-secret environment fingerprint.

Inspect only journaled candidates. Require process identity plus fixed argv and FSB environment evidence before killing. Stale entries clear; confirmed survivors terminate; ambiguous candidates leave the unrelated process untouched and withhold spawn capability. Implement inspection behind a platform contract with deterministic fakes. If the production platform cannot safely provide all required identity evidence, report the platform unsupported/fail closed rather than fall back to name-only matching.

## Event Parser and Fixture Strategy

The parser must frame bytes incrementally, preserve split UTF-8/JSON lines, accept a final unterminated line, reject oversized lines, and validate JSON before normalization. Known inputs include `system/init`, `assistant`, `user`, `stream_event`, `system/api_retry`, and `result`. Extra fields inside recognized envelopes survive in `payload`; unknown top-level types, unknown required system subtypes, and missing required fields throw typed drift.

Normalize to strict provider-neutral events such as init, assistant/message delta, user, tool use/result, retry, result, and diagnostic. Above the adapter, no code branches on raw Claude JSON. Drift emits no success, requests tree termination, and returns a typed failed delegation payload while preserving Phase 59's transport error set.

Add `tests/fixtures/agent-streams/claude-code-2.1.177/` with a manifest and sanitized JSONL. Because this workflow does not run an authenticated Claude task, fixture provenance must be honest: use a checked-in schema-derived contract fixture for automated development if necessary and mark real 2.1.177 capture/corroboration pending at milestone-end UAT. Never label synthetic/documentation-derived bytes as a live recording. Tests should derive deterministic mutations for unknown types/subtypes, malformed/missing fields, chunk splits, final partial line, stderr noise, and >200 KiB incremental output.

## Test and Integration Plan

Add focused built-output Node tests and place them before the final root regression gate:

- adapter interface/registry exactness and capability honesty;
- detection/version/retained-path/Windows-shim matrix;
- exact Claude argv, private config, static agent, stdin-only canaries, env scrubbing, and forbidden flags;
- parser fixture sequence, mutations, bounds, and drift terminal behavior;
- supervisor spawn/stdin/drain/error/close/cancel races and exact-once settlement;
- POSIX/Windows kill ordering and journal recovery with injected inspectors;
- reverse-channel local/relayed events, early delegation id, terminal response, cancel, and serve-only capability;
- startup/shutdown ordering in `runHttpMode()`;
- Phase 59 reverse-channel contract, topology, auth, exact five errors, version parity/byte freeze;
- package asset inclusion and the root `npm test` chain.

Tests should import `mcp/build/**` after `npm --prefix mcp run build`, matching repository convention. Prefer explicit dependency injection hooks over monkeypatching global process functions. Do not add extension/background or side-panel production wiring in this phase.

## Suggested Plan Decomposition

1. **Contract, Claude profile, and stream fixture/parser** — types/registry, retained detection, static agent, runtime validation, normalized parser, fixture/mutations, and package/forbidden-flag tests. Covers ADAPT-01/02 and CLAUDE-01..04 foundations.
2. **Private runtime state and process lifecycle** — owner-only files/journal, process inspector/tree helpers, supervisor state machine, stdin/env policy, cancellation, crash recovery, and deterministic lifecycle tests. Covers ADAPT-03..05 and CLAUDE-02.
3. **Serve/reverse-channel integration** — strict `delegate.*` handler, startup recovery ordering, serve-only capability, shutdown settlement, local/relay harness, and Phase 59 parity gates. Completes ADAPT-02..05.
4. **Phase verification and review fixes** — full build/root suite, source/security review, requirement evidence, and a UAT ledger without fabricated live passes.

The planner may combine the verification work into each implementation plan, but should keep contract/parser work ahead of supervisor integration and keep serve wiring after deterministic lifecycle helpers exist.

## Requirement-to-Evidence Map

| Requirement | Primary evidence |
|-------------|------------------|
| ADAPT-01 | Compile-time exact interface, closed registry tests, honest `caps()` |
| ADAPT-02 | Immutable spawn spec, retained path, adapter-neutral normalized events, unchanged parity tests |
| ADAPT-03 | Strict payload rejection, fixed spawn capture, stdin canary, scrubbed env, no-shell source gate |
| ADAPT-04 | Injected POSIX/Windows tree state matrices and exact-once cancel response |
| ADAPT-05 | Atomic journal tests, confirmed/stale/ambiguous/unrelated recovery cases, pre-advertisement ordering |
| CLAUDE-01 | Exact profile/agent/MCP argv and package asset assertions; live effective-profile check deferred |
| CLAUDE-02 | Static policy review, built-in/MCP isolation assertions, init attestation failure tests |
| CLAUDE-03 | Fixture/mutation parser tests and fail-loud drift; live recording provenance corroboration deferred |
| CLAUDE-04 | Exact-path version probe/minimum/profile tests and unavailable diagnostic |

## Risks and Planning Traps

1. **Advertising too early:** connecting the capable bridge before recovery violates ADAPT-05.
2. **Short start acknowledgement:** returning before terminal settlement closes the Phase 59 event route; emit the delegation id as an event instead.
3. **Transport-code creep:** adding `agent_protocol_drift` to `ExtError.code` breaks the exact-five freeze; keep it in delegation-domain payloads.
4. **Weak nested validation:** the outer parser cannot stop payload smuggling; use strict per-method schemas.
5. **Detection/spawn mismatch:** a second PATH lookup defeats fingerprinting.
6. **Unsafe Windows convenience:** `.cmd`, `cmd /c`, or `shell:true` are forbidden; unsupported is safer.
7. **False orphan certainty:** PID/name alone can target an unrelated process after PID reuse; ambiguity must fail closed.
8. **Pipe deadlock:** stdout and stderr must drain from spawn through terminal settlement.
9. **Configuration inheritance:** strict MCP alone is insufficient; use the closed isolation profile plus init attestation.
10. **Fixture provenance overclaim:** automated schema coverage may pass while real capture stays pending; document that honestly.
11. **Phase 61 bleed:** no extension route, consent UI, persistent feed, stop button, heartbeat, or tab reclamation belongs in Phase 60.

## Official References

- Claude Code CLI: https://code.claude.com/docs/en/cli-usage
- Programmatic/headless Claude Code: https://code.claude.com/docs/en/headless
- Permissions: https://code.claude.com/docs/en/permissions
- Permission modes: https://code.claude.com/docs/en/permission-modes
- Custom subagents: https://code.claude.com/docs/en/sub-agents
- Node child processes: https://nodejs.org/docs/latest-v22.x/api/child_process.html
- Microsoft `taskkill`: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill

## Deferred Live UAT Ledger

Preserve, but do not execute or claim, these checks until the milestone-end gate:

- installed Claude Code 2.1.177 subscription/keychain authentication and effective isolation flags;
- real CLI -> private loopback MCP -> FSB agent registration/tool use;
- POSIX and Windows descendant termination after grace/escalation;
- daemon-crash orphan detection without collateral process termination;
- real JSONL capture provenance/schema comparison;
- live browser ownership, vault boundary, irreversible-action handoff, and eventual Phase 61 UX.

