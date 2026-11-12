# Phase 65: Codex Adapter - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add OpenAI Codex as the third production `AgentProviderAdapter`, using the verified 0.142.5 non-interactive contract and the existing provider-neutral task-delegation pipeline. Ship hermetic `codex exec --json` execution, exact ChatGPT/API-key/unauthenticated disclosure, strict JSONL normalization and drift coverage, immutable billing identity, and the existing Providers/consent/feed/summary experience with `caps.chatMode: false`.

This phase does not add chat/resume continuity, choose a model, accept ambient OpenAI credentials, expose a dollar estimate, inherit user/project Codex configuration, add a Codex-specific UI branch, perform a paid live capture, or run genuine browser/account/accessibility UAT before the milestone-end sweep.

</domain>

<decisions>
## Implementation Decisions

### Execution Profile and Authority

- Pin the compatibility profile and fixture directory to Codex 0.142.5. The locally installed 0.144.6 binary is newer-than-tested evidence and therefore Degraded under the existing compatibility policy rather than silently becoming the fixture baseline.
- Use one direct task process with task text delivered through stdin: `codex exec - --json --ephemeral --ignore-user-config --sandbox read-only --skip-git-repo-check`, plus only reviewed closed configuration overrides needed for the FSB MCP endpoint.
- Retain the user's `CODEX_HOME` solely for Codex authentication. Do not copy or read credentials. Ignore user configuration and inject exactly one required FSB MCP server through closed `-c mcp_servers.fsb...` arguments.
- Run from daemon-owned scratch space. Task mode is the only capability: no resume, profile, model override, image, output file/schema, additional directory, remote mode, local provider, search, approval override, `--full-auto`, `--yolo`, or sandbox-bypass flag.
- Preserve the exact five-method adapter contract. The adapter remains declarative; the serve-owned supervisor alone controls process creation, sanitized environment, stdin, lifecycle, journal, cancellation, and tree settlement.

### Auth and Billing Truth

- Extend the safe adapter auth contract with exact `chatgpt`, `api_key`, `unauthenticated`, and `unknown` states. Claude Code and OpenCode retain their existing `unknown` behavior.
- Probe the retained Codex binary with `codex login status` under the same credential-scrubbed environment used for execution. Accept only the exact bounded known outputs for ChatGPT, API-key, or unauthenticated status; every other output or probe failure becomes `unknown`.
- Never read `auth.json` or another credential store. The API-key status output may contain the key itself, so raw probe bytes must be bounded, discarded/zeroed immediately after classification, and excluded from logs, diagnostics, state, errors, browser projections, and fixtures.
- Scrub `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN`, `OPENAI_API_KEY`, and the existing source-pinned provider credential roster from detection and spawn. Environment-only users receive bounded guidance to store the key through `codex login --with-api-key`.
- Re-probe immediately before spawn and bind the accepted auth class to immutable run context. If auth changed after preflight/consent, reject the start and require refresh/consent again. Both `unauthenticated` and `unknown` block execution.
- Map ChatGPT auth to `subscription` and API-key auth to `api` through a provider-neutral allowed-billing contract. Persist that accepted bucket through streaming, terminal handling, and rehydration; events cannot change it.
- Present ChatGPT as "Included with your ChatGPT plan" without claiming a specific plan tier. Present API-key mode as "Billed to the API key stored by Codex; dollar amount not reported." Present unauthenticated mode as "Sign in to Codex first." Tokens, turns, and duration remain visible; USD is always null.

### JSON Stream, Fixture, and Drift Gate

- Add `tests/fixtures/agent-streams/codex-0.142.5/` as a sanitized `schema-derived-contract` with `liveCapturePending: true`. A genuine sanitized stream remains `human_needed` for milestone-end UAT and must not be described as recorded before that evidence exists.
- Normalize `thread.started` to `init`; completed agent messages to `assistant`; FSB MCP item start/completion to ordered `tool_use`/`tool_result`; and `turn.completed` usage to a candidate `result`. `turn.started` is lifecycle-only. Reasoning and plan-update text are never persisted or displayed.
- Permit MCP calls only to the sole configured `fsb` server and its bounded tool namespace. Command execution, file changes, web search, another MCP server/tool, unknown top-level or item events, `turn.failed`, and `error` fail loud without producing result success.
- Require one bounded thread identity, exact order and item identity, valid usage, and one terminal candidate. Malformed UTF-8/JSON, size/event-count overflow, missing fields, session mixing, duplicate/missing terminal, or data after terminal becomes `agent_protocol_drift` and stops the child.
- A valid `turn.completed` record is only a terminal candidate. Authoritative success additionally requires clean process exit and completed process-tree cleanup; failure, signal, missing candidate, parser drift, or unsettled cleanup remains failure.
- The first production source commit expands Codex atomically across adapter/parser, fixture and native negative corpus, adapter id and registry, compatibility matrix, capabilities, provider-contract tests, and Phase 62 drift-smoke roster. No production commit may expose Codex without its parser and drift contract.

### Product Integration, UI Cleanup, and UAT

- Promote the existing third-row Codex entry through shared provider metadata, inventory, compatibility, selection, consent, preflight, accepted-run context, feed, summary, doctor, and storage paths. Preserve Claude/OpenCode and all seven API-provider behavior.
- Background-owned saved settings remain provider authority. Side-panel start/consent requests stay provider-free, compatibility remains observational, and no Codex-specific renderer, visible component, row reordering, recommendation mutation, or BYOK mutation is introduced.
- Persist accepted `{providerId, label, profileVersion, authState, billingKind}` identity with exact validation. Streaming, terminal handling, and rehydration reject provider/auth/billing changes, prototype/accessor records, extra keys, or stale state.
- Close both advisory Phase 64 UI findings in this phase: raise every shared delegated action target from 36px to at least 44px, including narrow layouts; remove the generic visible `Profile` row for all adapters while retaining `profileVersion` internally for routing, compatibility, and drift diagnostics.
- Test real controller-produced snapshots rather than nulling profile versions in parity fixtures. Keep existing focus order, live regions, responsive behavior, themes, forced-colors, and reduced-motion contracts.
- Add exactly three unchecked Phase 65 human-UAT rows: the three-state auth matrix; a genuine Codex-to-browser delegation with cancellation/cleanup and honest summary; and keyboard/screen-reader/theme/narrow-layout behavior. They remain `human_needed` for the milestone-end sweep alongside UAT64-01 through UAT64-03.
- Automated closure still requires focused tests, the Phase 62 drift job, full repository suite, source/security gates, code review, security review, UI review, and goal verification. Automated evidence never marks genuine account/browser/accessibility UAT passed.

### the agent's Discretion

- Exact module names, bounded probe/output limits, safe diagnostic codes, private scratch filenames, and provider-neutral auth/billing type names may follow established `mcp/src/agent-providers/` conventions.
- The planner may refine exact raw Codex JSON field schemas from pinned official documentation and the verified local CLI surface, but may not widen accepted event families, retain reasoning text, weaken fail-loud drift behavior, or fabricate provenance.
- Exact safe copy may be tightened for clarity while preserving the accepted distinctions: ChatGPT plan, stored API key with no dollar amount, unauthenticated sign-in required, and unknown fail-closed.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `mcp/src/agent-providers/adapter.ts`, `registry.ts`, `compatibility.ts`, `protocol-drift.ts`, and `spawn-supervisor.ts` already define the exact adapter contract, canonical roster, fixture matrix, bounded drift vocabulary, sanitized spawn environment, exact-once terminal handling, and tree-settlement gates.
- `claude-*` supplies the direct-task detector/profile/parser pattern. `opencode-*` supplies source-pinned credential scrubbing, schema-derived fixture provenance, role-aware runtime materialization, strict native event normalization, and terminal-candidate corroboration patterns.
- `tests/mcp-agent-drift-smoke.test.js` already enforces a registry/matrix/parser/manifest bijection over the complete production roster. The Codex expansion must preserve that exactness.
- `extension/utils/delegation-providers.js`, delegation preflight/consent/controller/event store, background accepted-run context, Providers logic, and delegation feed already centralize provider-neutral identity and billing behavior.
- The dormant Codex Providers row and definition already occupy the stable third position. Existing UI needs data-contract promotion rather than new markup.

### Established Patterns

- Adapters expose exactly five frozen methods and never spawn directly. Task text is stdin-only and absent from argv, environment, files, receipts, diagnostics, and logs.
- Canonical adapter ids, production registry, compatibility rows, fixture manifests, doctor output, browser-safe evidence, provider tables, and UI storage are closed rosters with exact-order/bijection tests.
- Compatibility can describe availability but cannot select a provider or grant spawn authority. Preflight, consent, and accepted daemon response form the start authority chain.
- Provider-native output ends at strict parsers. Browser-visible lifecycle uses frozen normalized events, durable sequence ledgers, immutable run context, and exact-once terminal settlement.
- Genuine external account, process, browser, theme, keyboard, and screen-reader claims are accumulated as unchecked milestone-end UAT rather than inferred from source tests.

### Integration Points

- Add `codex.ts` and supporting detect/profile/stream modules beside the existing adapters; extend exact ids, compatibility, protocol-drift, registry dependencies, production supervisor composition, diagnostics, and client inventory.
- Add the Codex 0.142.5 fixture/manifest and expand adapter, compatibility, provider-contract, drift-smoke, forbidden-flag, supervisor, environment-scrub, and full-suite tests.
- Generalize provider metadata from one static billing kind to a closed allowed-billing/auth mapping while preserving exact Claude/OpenCode results and safe rehydration.
- Project safe Codex availability/auth evidence through daemon inventory and browser storage without exposing path, raw version, status output, credential data, configuration, argv, or environment.
- Drive the existing Providers row and delegated UX from accepted Codex evidence, remove profile-version presentation generically, and enforce 44px action targets in source/DOM tests.

</code_context>

<specifics>
## Specific Ideas

- The verified 0.142.5 surface supports `exec --json`, stdin prompt `-`, `--ephemeral`, `--ignore-user-config` while auth still uses `CODEX_HOME`, `--sandbox read-only`, `--skip-git-repo-check`, and dotted `-c` MCP overrides. The deprecated `--full-auto` and all bypass variants remain forbidden.
- Official JSONL families are `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started`, `item.completed`, and `error`; item families include agent messages, reasoning, command execution, file changes, MCP tool calls, web search, and plan updates.
- The installed 0.144.6 binary currently reports `Logged in using ChatGPT`. Its compiled status strings also establish the bounded API-key prefix and `Not logged in` outcome without reading any credential file.
- Codex usage reports input, cached-input, output, and reasoning-output tokens on `turn.completed`; only input/output totals required by the existing summary are projected, and no local price table is consulted.

</specifics>

<deferred>
## Deferred Ideas

- Codex chat/resume continuity, session persistence, model/profile selection, workspace-write authority, shell/file/web surfaces, environment-only credentials, plan-tier inference, dollar calculation, and Gemini support remain outside v0.9.91.
- A genuine sanitized Codex JSONL capture, all three real auth states, a paid/plan-backed browser delegation, rendered themes, keyboard/screen-reader behavior, and process cancellation evidence remain in the milestone-end human-UAT sweep.

</deferred>
