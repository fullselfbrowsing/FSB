# Phase 60: Adapter Contract & Claude Code MVP - Context

**Gathered:** 2026-07-14
**Status:** Ready for AI integration research and planning

<domain>
## Phase Boundary

Ship the daemon-side delegation core: the exact five-method `AgentProviderAdapter` contract, a closed adapter registry, a `serve`-owned `SpawnSupervisor`, a shell-free Claude Code 2.1.177-compatible adapter, deterministic process-tree cancellation and crash recovery, a strict loopback MCP/agent definition, and a pinned normalized stream-json fixture. The supervisor is production-wired behind Phase 59's authenticated `ext:*` handler and is exercised end to end through a reverse-channel harness.

Phase 60 does **not** add the production side-panel branch, consent card, persistent event feed, stop button behavior, service-worker-eviction recovery, heartbeat/offline UX, or tab reclamation. Those remain the explicit Phase 61 boundary. This resolves the roadmap's user-facing prose in favor of the requirements/dependency map: Phase 60 proves the real daemon/CLI integration that Phase 61 will expose to users.

</domain>

<decisions>
## Implementation Decisions

### Adapter Contract and Registry
- **D-01:** `AgentProviderAdapter` exposes exactly the five required methods and no hidden sixth lifecycle method: `detect()`, `buildSpawn(task, ctx)`, `parseEvents(stream)`, `kill(child, { grace })`, and `caps()`. Supporting types (`AdapterDetection`, `SpawnSpec`, `AgentEvent`, `AdapterCapabilities`, and task/context types) are exported separately.
- **D-02:** Adapters are declarative at the process boundary. `buildSpawn` returns an immutable, validated description; it never calls `spawn`, opens a shell, mutates global state, or accepts raw wire payloads. The supervisor alone owns spawn options, environment policy, stdin delivery, bookkeeping, and handler settlement.
- **D-03:** The registry is a closed map keyed by canonical client ids already shared by `PLATFORMS`, onboarding, and provider settings. Phase 60 registers only `claude-code`; unknown, missing, duplicate, or case-varied ids fail with a typed adapter error rather than falling back.
- **D-04:** `caps()` describes future-compatible behavior but is honest for the MVP: task mode is supported, `chatMode` and resume are false, and no OpenCode-style attach/server mode is implied.
- **D-05:** `detect()` resolves and retains one exact binary path, fingerprints that same path with `--version`, parses a semver-compatible version, reports a non-inferred auth state, and gates spawn on a supported version profile. Detection and spawn may not re-resolve different binaries from `PATH`.

### Supervisor Request and Spawn Policy
- **D-06:** Spawn authority exists only inside the intentionally started `fsb-mcp-server serve` process. Stdio MCP processes and incidental bridge hubs never construct a supervisor or advertise `agent-spawn`.
- **D-07:** The production handler supports a closed task-mode method set (`delegate.start` and `delegate.cancel`). Each payload is validated recursively against exact keys and types. No request may supply command, binary, argv, flags, environment, cwd, config path, agent definition, permission mode, or delegation id.
- **D-08:** `delegate.start` is one long-lived reverse-channel correlation: the supervisor emits normalized events while the child runs and returns the final response only after terminal settlement. `delegate.cancel` is a separate request keyed by the server-minted delegation id and resolves only after tree termination is confirmed. Phase 61 may add durable re-association without weakening this contract.
- **D-09:** The user's task is bounded UTF-8 text and travels only through `child.stdin`; it never appears in argv, environment tags, generated filenames, diagnostics, the orphan journal, or normal logs. The supervisor writes the task after spawn, handles backpressure/errors, and closes stdin for one-shot print mode.
- **D-10:** Spawn options are fixed by the supervisor: `shell: false`, `detached: true`, `windowsHide: true`, and `stdio: ['pipe', 'pipe', 'pipe']`. The child environment derives from the daemon environment only after removing `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY`, then adds non-secret FSB delegation fingerprints.
- **D-11:** Daemon-generated MCP config and other per-run files live in a private runtime directory, use owner-only permissions where supported, contain only the active loopback Streamable HTTP endpoint, and are removed after verified terminal settlement. No user/project MCP configuration is inherited.
- **D-12:** Phase 59's transport authentication remains authoritative. Supervisor validation is defense in depth and must not add secrets to `ext:*` payloads or broaden Phase 59's allowed frame shapes.

### Process Lifecycle and Crash Recovery
- **D-13:** The supervisor keeps a server-minted delegation id, child identity, adapter id, process group/tree identity, terminal state, and event emitter per active run. Duplicate cancellation and racing exit/kill paths settle exactly once.
- **D-14:** POSIX cancellation sends `SIGTERM` to the detached process group, waits the configured grace period, then sends `SIGKILL` to the group. Windows uses a direct, argv-only `taskkill /pid <pid> /T /F` invocation. `kill()` does not resolve until the child exit is observed and platform inspection confirms no matching descendants remain.
- **D-15:** A private, atomic, owner-only orphan journal records only server-minted/process metadata (never prompts). Startup inspects only journaled candidates, verifies the stored adapter fingerprint using the FSB environment tag plus the fixed argv signature and process identity, terminates confirmed survivors, and clears stale records before the bridge advertises `agent-spawn`. Broad `pkill`/name-only matching is forbidden.
- **D-16:** If recovery cannot safely classify or settle a journaled candidate, the daemon fails closed for spawn capability and emits structured, secret-free diagnostics rather than accepting new work or killing an unrelated user-owned Claude process.
- **D-17:** Normal daemon shutdown stops accepting requests, cancels every active run, waits for tree settlement, then closes HTTP and bridge resources. Event parsing, stdout draining, stderr draining, cancellation, and exit observation run concurrently so a full pipe cannot deadlock shutdown.

### Claude Code Invocation and Hermeticity
- **D-18:** The first compatibility profile is the locally verified Claude Code `2.1.177` baseline. It composes print mode, verbose stream-json, partial messages, strict MCP config, the shipped `fsb` agent definition, `dontAsk`, the FSB-only allow rule, the explicit built-in denylist, a verified empty built-in tool set, 40-turn protection, and no session persistence. Version-specific differences belong in closed profiles selected by `detect()`, not ad hoc conditionals or best-effort retries.
- **D-19:** The expected profile is equivalent to: `claude -p --verbose --output-format stream-json --include-partial-messages --strict-mcp-config --mcp-config <private-loopback-file> --agents <compact-shipped-json> --agent fsb --permission-mode dontAsk --tools "" --allowedTools mcp__fsb --disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch --max-turns 40 --no-session-persistence`. The task is still stdin-only.
- **D-20:** The shipped agent definition is static product policy, not a dynamic user prompt. It names the browser-control role, permits only FSB MCP tools, respects FSB ownership/vault boundaries, and tells the agent to fail closed on irreversible or consent-requiring actions. It ships under `mcp/ai/agents/`, which is already part of the npm package.
- **D-21:** Planning begins with controlled compatibility spikes for same-invocation `--agents` plus `--agent fsb`, `--max-turns` on the 2.1.177 profile, the empty `--tools` argv value, and stdin-only print mode. If inline agent selection is not supported, only a documented, shipped persona-file equivalent may be considered; no dynamic prompt stuffing is allowed.
- **D-22:** Windows remains shell-free. A native executable may be spawned directly. A `.cmd` shim may be unwrapped only through a verified, deterministic interpreter/entry-point resolver with fixed argv; otherwise detection reports unsupported and provides a diagnostic. `cmd /c`, `shell: true`, and string command construction are prohibited.
- **D-23:** FSB does not embed the Claude Agent SDK, proxy OAuth tokens, bundle a CLI, choose a model for the user, use `--bare`, or emit any forbidden auto-approval flag. Claude Code continues to own subscription authentication and model choice.

### Stream Contract, Diagnostics, and Fixtures
- **D-24:** `parseEvents` performs bounded incremental JSONL framing over stdout, handles chunk splits and a final partial line, and yields the stable `{ type, sessionId, payload }` contract. Stdout and stderr are always drained concurrently; stderr is bounded/redacted diagnostic context, never a second event protocol.
- **D-25:** Known 2.1.177 inputs include `system/init`, `assistant`, `user`, `stream_event` partials/tool activity, `system/api_retry`, and `result`. Normalized types cover init, assistant/user messages and deltas, tool use/result, retry, result, and diagnostic events. Additional fields inside a known shape are preserved in `payload`; missing required fields, unknown top-level types, and unknown required `system` subtypes fail loud.
- **D-26:** Protocol drift raises a typed `agent_protocol_drift` adapter diagnostic, emits no fabricated success/result event, stops the affected child, and produces a terminal failed outcome. Phase 59's five transport error codes remain unchanged; adapter-domain failures travel in the typed delegation event/result payload until a later protocol phase intentionally revises the transport contract.
- **D-27:** The primary fixture is a sanitized recording from Claude Code 2.1.177 under `tests/fixtures/agent-streams/claude-code-2.1.177/`. Tests also mutate it with unknown types, malformed/missing fields, chunk boundaries, a final unterminated line, stderr noise, and at least 200 KiB of output to prove backpressure-safe draining and fail-loud behavior without a live CLI.
- **D-28:** Existing MCP types, tool schemas, relay defaults, and response envelopes remain byte-identical. New supervisor behavior enters only through Phase 59's additive handler seam and must keep the version-parity/byte-freeze suite green.

### Verification and UAT Deferral
- **D-29:** Automated/source verification, full repository tests, artifact/key-link checks, and a clean security/code review remain blocking before Phase 61 starts.
- **D-30:** Live Claude subscription/auth, real CLI-to-loopback-MCP execution, OS process-tree behavior, daemon-crash orphan recovery, and eventual browser-driving behavior are recorded as pending human/live UAT. Per the user's standing instruction, they are neither fabricated nor run now; they join the single milestone-end UAT gate.

### the agent's Discretion
- Exact internal filenames beneath `mcp/src/agent-providers/`, concrete bounded task/line/stderr limits, diagnostic wording, and the journal filename/schema may be selected during planning so long as the locked trust and lifecycle rules above hold.
- The normalized event type spelling may be refined during AI-SPEC/research, but Phase 61 must consume provider-neutral values and must never parse raw Claude JSON.
- Test dependency-injection seams and platform process-inspection helpers may follow existing MCP conventions; production behavior must remain fail-closed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing. Current roadmap/requirements/context override older research wherever they conflict.**

### Milestone Contract and State
- `.planning/PROJECT.md` — Current v0.9.91 goal, hard constraints, INV-01 discipline, and the user-directed milestone-end UAT policy.
- `.planning/ROADMAP.md` § Phase 60 — Phase boundary, dependency ordering, goal, and six observable success criteria.
- `.planning/REQUIREMENTS.md` §§ ADAPT and CLAUDE — ADAPT-01..05 and CLAUDE-01..04 normative contracts plus milestone anti-features.
- `.planning/STATE.md` — Current Phase 60 focus, pending compatibility spikes, no-todo state, and deferred-UAT ledger.

### Milestone Research
- `.planning/research/STACK.md` §§ Claude Code CLI, process supervision, version compatibility — Locally verified 2.1.177 flags, zero-runtime-dependency stack, shell-vs-SDK decision, and open compatibility spikes.
- `.planning/research/ARCHITECTURE.md` §§ Side-panel delegation, multi-agent adapters, spawner ownership — Existing seams, serve-daemon ownership, round-trip flow, and hub/relay constraints. Ignore its pre-Phase-59 secret-in-payload sketch.
- `.planning/research/PITFALLS.md` §§ 3, 6-9, 12 and recovery checklist — Spawn injection, tree kill, pipe backpressure, crash orphans, protocol drift, and task-mode hazards.
- `.planning/research/SUMMARY.md` § Phase 60 — Contract-first implementation scope and phase-time research gaps.

### Upstream Phase Decisions
- `.planning/phases/58-providers-panel/58-CONTEXT.md` — `providerKind`/`agentProviderId` separation, canonical agent ids, advisory selection, and auth/billing honesty.
- `.planning/phases/58-providers-panel/58-VERIFICATION.md` — Automated/source-green provider selection contract and deferred live UI checks.
- `.planning/phases/59-reverse-request-channel-security-foundation/59-CONTEXT.md` — Authenticated `ext:*` wire, exact handler/routing semantics, secret boundary, and permanent forbidden-flag gate.
- `.planning/phases/59-reverse-request-channel-security-foundation/59-VERIFICATION.md` — Code-green CHAN-01..07 evidence and the no-spawn boundary that Phase 60 now crosses.
- `.planning/phases/59-reverse-request-channel-security-foundation/59-REVIEW.md` — Final clean security review and exact-once/stale-socket guarantees.
- `.planning/phases/57-agent-identity-capture/57-01-SUMMARY.md` — Canonical `claude-code` client identity and existing binary inventory behavior.

### FSB Agent and Browser-Control Contracts
- `skills/fsb/SKILL.md` — Shipped FSB operating model from which the static Claude agent definition should be distilled.
- `skills/fsb/references/multi-agent-contract.md` — Agent identity, ownership, and concurrency rules the spawned CLI must preserve.
- `skills/fsb/references/vault-boundary.md` — Credential/vault safety boundary for browser actions.
- `.planning/v0.9.62-CONTRACT.md` — Implicit visual-session and trusted-label constraints reused by later delegation UX.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp/src/ext-protocol.ts`, `mcp/src/types.ts`, and `mcp/src/bridge.ts` already provide strict authenticated reverse frames, local-first capable-relay routing, streamed request events, and exact-once final settlement.
- `mcp/src/index.ts` owns `serve` startup/shutdown; `mcp/src/http.ts` returns the actual loopback Streamable HTTP endpoint the generated Claude MCP config must reference.
- `mcp/src/client-inventory.ts` provides shell-free binary/version probe and dependency-injection patterns. Its `.cmd` probe failure is evidence, not permission to introduce a shell fallback.
- `mcp/src/platforms.ts`, `extension/ui/onboarding.js`, and `extension/ui/providers-panel.js` already agree on the `claude-code` id.
- `scripts/verify-agent-provider-flags.mjs` and its tests are the permanent source gate for forbidden approval flags.
- `mcp/src/queue.ts` and `mcp/src/agent-scope.ts` already serialize mutations and register each spawned CLI's HTTP MCP session as an independent FSB agent.

### Established Patterns
- The MCP package is strict TypeScript/ESM targeting Node 18.20+, with zero unnecessary runtime dependencies and plain Node test harnesses against built output.
- Wire evolution is additive and guarded by `tests/mcp-version-parity.test.js`; bridge security/topology behavior is concentrated in focused contract and real-socket suites.
- Extension code has source-shape tripwires. Since production side-panel wiring is Phase 61, Phase 60 should avoid extension edits unless a blocking contract defect is proven.
- Sensitive state files use atomic replacement and owner-only permissions in Phase 59's bridge-auth implementation; the orphan journal/runtime config should reuse that discipline.

### Integration Points
- Reorder `runHttpMode` so the HTTP endpoint exists, the supervisor is configured, and orphan recovery completes before `bridge.connect()` advertises `agent-spawn`.
- Construct `WebSocketBridge` with the real supervisor handler and capability only in `serve`; close the supervisor before HTTP/bridge shutdown completes.
- Add the exact five-method contract, registry, Claude adapter, process helpers, and supervisor under `mcp/src/agent-providers/` (or a closely adjacent supervisor module) while keeping adapter-specific parsing out of the bridge.
- Ship the static agent definition under `mcp/ai/agents/`, already included by `mcp/package.json`.
- Extend `tests/mcp-reverse-channel-contract.test.js`, `tests/mcp-bridge-topology.test.js`, `tests/mcp-client-inventory.test.js`, `tests/mcp-version-parity.test.js`, and the root serial test chain; add focused supervisor/parser/fixture suites.

</code_context>

<specifics>
## Specific Ideas

- Detection must report `/opt/homebrew/bin/claude` version `2.1.177` as one bound fingerprint on the current development machine; newer unrelated installations must not silently replace it at spawn time.
- The Claude process should see one MCP server named `fsb` at the current daemon's `http://127.0.0.1:<port>/mcp` endpoint and no inherited user/project MCP servers.
- A server-minted delegation id, not the bridge request id or user text, is the durable process identity and cancellation handle.
- Provider-specific JSON ends at `parseEvents`; everything above the adapter sees only normalized `AgentEvent` values.

</specifics>

<deferred>
## Deferred Ideas

- Production side-panel branching, first-use consent, feed cards, stop/take-control UX, per-event `chrome.storage.session` persistence, heartbeat/offline recovery, and tab reclamation — Phase 61.
- Compatibility matrix and expanded `doctor` output — Phase 62.
- Native-messaging daemon wake-up — Phase 63.
- OpenCode and Codex adapters — Phases 64 and 65; no Phase 60 contract branch may hard-code their future behavior.
- Chat mode, `--resume`, follow-up continuity, warm pools, PTYs, remote/LAN delegation, and bundled CLIs — outside this phase/milestone as already recorded.
- All live CLI/OS/browser UAT — preserved pending for the user-directed milestone-end gate.

</deferred>

---

*Phase: 60-adapter-contract-claude-code-mvp*
*Context gathered: 2026-07-14 via autonomous smart-discuss defaults*
