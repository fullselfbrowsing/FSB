# Phase 64: OpenCode Adapter - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add OpenCode 1.14.25 as the second production `AgentProviderAdapter`, proving the existing five-method contract can express both cold `opencode run` execution and attachment to a bounded FSB-owned `opencode serve` process. Ship the static FSB agent policy, strict JSON event normalization, compatibility-matrix and fixture coverage, doctor/Providers projection, and lifecycle-safe supervision without changing task-mode-only scope or inheriting unrelated OpenCode authority.

</domain>

<decisions>
## Implementation Decisions

### Execution Topology
- Cold `opencode run` is the default path. Attach mode is selected only when an FSB-owned OpenCode server has been verified healthy; both paths are covered by production-contract tests.
- FSB may attach only to a server it launched on loopback with a random port and a random Basic Auth secret. It never discovers, attaches to, mutates, or terminates a user's existing OpenCode TUI/server process.
- Preserve the exact five-method `AgentProviderAdapter` surface. Extend the declarative spawn contract with provider-neutral cold/attach topology data rather than adding an OpenCode-specific supervisor branch or a sixth adapter method.
- At most one bounded FSB-owned OpenCode server lives per FSB daemon. Every delegation creates a fresh task session, chat/session continuation stays disabled, and the server receives bounded idle teardown.

### Hermetic Policy and Task Delivery
- Run from a private FSB configuration boundary, disable project configuration, use OpenCode's pure mode, and expose only the private loopback FSB MCP server. User/project plugins, MCP servers, agents, hooks, skills, and commands are not inherited.
- Deliver the user's task through stdin only. Task text must never enter argv, environment variables, generated filenames, logs, server URLs, or lifecycle receipts.
- Ship a static primary `fsb` agent whose permissions deny all tools by default and allow only the FSB MCP tool prefix. Shell, file edits, web access, subagents, skills, external-directory access, and every non-FSB tool remain denied.
- Preserve OpenCode's existing sign-in and default model without an FSB model override or provider API-key fallback. If no usable account/model can be established non-interactively, detection or preflight fails closed with bounded guidance.

### JSON Stream, Fixture, and Terminal Truth
- Pin the first compatibility profile to the locally verified OpenCode 1.14.25 binary. Commit a sanitized schema-derived fixture with `liveCapturePending: true`; a genuine sanitized capture remains a milestone-end human-UAT item until reviewed.
- Normalize provider output as follows: `step_start` to `init`; a completed/error `tool_use` record to ordered `tool_use` plus `tool_result`; `text` to `assistant`; optional `reasoning` to `assistant_delta`; `step_finish` to a candidate `result`; and `error` to a diagnostic/failed terminal path.
- Require one bounded session identity, valid required fields, ordered lifecycle, and exactly one terminal candidate. Unknown event types, invalid shapes, session mixing, reordered lifecycle, duplicate terminal records, or data after terminal fail with `agent_protocol_drift` and stop the child.
- A `step_finish` record is only a candidate result. Success becomes authoritative only after exactly one valid candidate and a clean child exit. Provider error, missing/duplicate terminal, or nonzero/signal exit fails closed without a fabricated success.

### Product Integration and Lifecycle
- Reuse the existing OpenCode Providers row and provider-neutral delegated UX unchanged. Detection and compatibility evidence drive its Installed/Supported/Degraded/Unsupported states; no OpenCode-only side-panel branch, row reordering, or recommendation mutation is introduced.
- Keep OpenCode auth as `unknown` / `Not reported` in this phase. Billing copy states that usage follows the account/provider configured in OpenCode and never asserts subscription inclusion or a dollar amount without authoritative metadata.
- Attach-to-cold fallback is permitted only before a provider session or task exists. Once a task is accepted or any event is observed, failure settles closed without replay. User-owned OpenCode processes are never killed or modified.
- Extend registry, matrix, fixture, drift-smoke, doctor, supervisor, Providers, source/security gates, and full-suite coverage. One genuine authenticated OpenCode-to-browser run remains `human_needed` in the milestone-end UAT ledger.

### the agent's Discretion
- Exact internal module names, bounded timeouts, idle lifetime, private configuration filenames, and provider-neutral spawn-topology type names may follow the established `mcp/src/agent-providers/` conventions.
- Exact safe presentation wording may follow the existing Providers and delegated-feed copy as long as availability, compatibility, auth, billing, and recommendation remain distinct and honest.
- The planner may refine bounded raw-field schemas and normalized payload fields from the pinned 1.14.25 source and fixture, but may not relax fail-loud drift behavior or terminal-exit corroboration.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp/src/agent-providers/adapter.ts` already defines the exact five-method contract, immutable `SpawnSpec`, task-only capabilities, retained-binary identity, and provider-neutral `AgentEvent` schema.
- `mcp/src/agent-providers/claude-code.ts`, `claude-detect.ts`, `claude-profile.ts`, and `claude-stream.ts` provide the detector/profile/parser composition pattern without granting adapters direct spawn authority.
- `mcp/src/agent-providers/spawn-supervisor.ts` already owns shell-free process creation, stdin delivery, environment scrubbing, orphan journaling, tree settlement, and exact-once delegation results.
- `mcp/src/agent-providers/compatibility.ts`, `tests/mcp-agent-drift-smoke.test.js`, and `tests/fixtures/agent-streams/claude-code-2.1.177/` provide the canonical matrix/fixture/provenance pattern.
- The Providers panel, compatibility projection, delegated controller, feed, doctor output, and provider evidence storage already contain dormant canonical OpenCode rows and provider-neutral UI behavior.

### Established Patterns
- Adapters are declarative and deeply frozen; only the serve-owned supervisor acquires process, filesystem, environment, journal, or kill authority.
- Canonical adapter ids, production registry rows, compatibility rows, fixture manifests, doctor rows, and browser-safe projections form a tested bijection and fail closed on disagreement.
- User task text is stdin-only and absent from specs, receipts, journals, diagnostics, and normal logs. Provider-native JSON ends at `parseEvents`; all consumers above the adapter use normalized events.
- Compatibility is observational only. It cannot select a provider, grant spawn authority, mutate BYOK settings, or override detector/preflight decisions.
- Every extension-visible change preserves existing source-pin tripwires, seven-provider API parity, additive wire invariants, and the milestone-end human-UAT deferral policy.

### Integration Points
- Expand `AgentProviderId`, task-only/server-mode capabilities, spawn-context/spec topology, and registry validation/production composition under `mcp/src/agent-providers/`.
- Add OpenCode detector, profile, static agent/config policy, JSONL parser, and lifecycle helpers beside the Claude implementation while keeping shared supervision provider-neutral.
- Generalize the closed `delegate.start` adapter-id validation and supervisor/journal fingerprints without widening wire payload authority.
- Add the OpenCode row to the canonical compatibility matrix, offline drift harness, fixture roster, doctor collection, safe browser projection, and package/build inclusion.
- Exercise existing Providers and delegation UI through data-driven OpenCode evidence; avoid adapter-specific branches in extension presentation code.

</code_context>

<specifics>
## Specific Ideas

- Use the installed `/opt/homebrew/bin/opencode` 1.14.25 binary as the local compatibility baseline while retaining its resolved native executable identity through spawn.
- The pinned CLI supports `run --format json`, `run --attach`, `serve --hostname 127.0.0.1 --port 0`, Basic Auth via `OPENCODE_SERVER_PASSWORD`, pure mode, and stdin message input.
- The pinned JSON surface emits `step_start`, `tool_use`, `step_finish`, `text`, optional `reasoning`, and `error` records; `step_finish` carries reason, cost, and token accounting but still requires clean-exit corroboration.
- OpenCode's agent permission patterns can deny everything and allow only tools prefixed by the configured FSB MCP server name.

</specifics>

<deferred>
## Deferred Ideas

- OpenCode chat/session continuation, user-owned server attachment, cross-daemon server persistence, provider/model selection UI, and inferred auth/billing classification remain out of scope.
- Genuine authenticated stream provenance and live OpenCode-driven browser behavior remain in the user-directed milestone-end UAT sweep.

</deferred>
