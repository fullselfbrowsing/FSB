# Project Research Summary

**Project:** FSB v0.9.91 — MCP Clients as Providers
**Domain:** Brownfield extension of an MV3 Chrome extension + Node MCP daemon to spawn/supervise agent CLIs (Claude Code first) as first-class side-panel providers driving the live browser via FSB's own MCP tools
**Researched:** 2026-07-10
**Confidence:** HIGH

## Executive Summary

This is a brownfield integration milestone, not a greenfield build. All four research dimensions converge on a small, additive extension of proven FSB systems: the `platforms.ts` 21-client registry gains an identity/detection layer; the ws://7225 bridge gains a new reverse-request channel (`ext:*` frames, additive per INV-01); the `fsb-mcp-server serve` daemon gains a `SpawnSupervisor` module that shells to the user's installed agent CLI; and `EXECUTION_MODES` gains a fifth `delegated` entry. Zero new runtime dependencies — Node built-ins (`child_process`, `readline`, `fs`, `os`) plus the already-pinned `@modelcontextprotocol/sdk ^1.29` (which already exposes `server.getClientVersion()` — the seam is verified). The spawned CLI connects back as a normal FSB MCP client, reusing agent identity, tab ownership (v0.9.60), and visual-session badges (v0.9.36/62) unchanged — that pipeline reuse is the whole point.

The recommended approach is a **security-first, contract-first, adapter-second** shape: identity capture and the Providers panel rename land first (pure additive, low risk, immediate value); then the reverse-request channel with all origin/rebind/secret/consent-tier defenses baked in from commit 1 of Phase 60; then the Claude Code MVP built AS an adapter (not hard-coded) so OpenCode/Codex/Gemini slot in without rework. **Explicitly shell to the user's installed `claude` binary — do NOT embed `@anthropic-ai/claude-agent-sdk`**: Anthropic's policy prohibits third-party products from using consumer subscription auth via the SDK, but shelling to the genuine binary is standard ecosystem practice (Cline, Roo, Zed, Conductor all ship it), and that IS the product promise ("agent kind = no API key needed"). Subscription-OAuth token proxying is banned outright (Anthropic enforced this Apr 4 2026).

Key risks are almost entirely security-critical and cluster in one phase (60). The spawn channel is RCE-adjacent by construction: a browser click becomes `execve(claude, -p, <prompt>)` inside a localhost daemon. Every 2025-2026 CVE we surveyed (Inspector CVE-2025-49596, MCP SDK CVE-2025-66414/66416, Claude Code CVE-2025-59536, Gemini CVSS 10 workspace-trust, TrustFall one-keypress RCE across four CLIs) was the same failure class: an assumed trust boundary that was never enforced. Mitigations are known and shippable in Phase 60: strict `Origin` allowlist (extension ID only), strict `Host` = loopback (DNS-rebind defense), argv-only spawn with daemon-controlled flag set, per-install rotating shared secret in `Sec-WebSocket-Protocol` (never URL), `--strict-mcp-config` mandatory, `--dangerously-skip-permissions` NEVER exposed, POSIX detached + process-group kill / Windows `taskkill /T /F`, `chrome.storage.session` persistence for MV3 SW-eviction survival, and source-pin tripwire discipline on every extension-touching commit.

## Key Findings

### Recommended Stack

Zero new runtime deps in `mcp/`. The supervisor is ~200-300 lines on `node:child_process spawn` + `node:readline` line framing + the existing `@modelcontextprotocol/sdk ^1.29`. Flag matrices for all four target CLIs were verified against local binaries (claude 2.1.177, codex 0.142.5, opencode 1.14.25) plus current docs (gemini 0.50.0); adapters must version-probe (`<cli> --version`) and feature-detect (Claude ≥2.1.205 exposes a `capabilities` array in `system/init`).

**Core technologies:**
- `node:child_process` `spawn({ detached: true, signal, windowsHide: true })` — supervised child with tree-killable process group; `AbortController` per delegation for clean cancel semantics
- `node:readline` `createInterface({ input: child.stdout, crlfDelay: Infinity })` — JSONL line framing that handles partial lines and stderr interleave; per-line `try { JSON.parse } catch`
- `@modelcontextprotocol/sdk ^1.29.0` — `server.server.getClientVersion(): Implementation | undefined` and `oninitialized` callback verified at pinned tag; captures `clientInfo` from every `initialize` handshake (currently discarded); INV-01 safe (no wire change)
- `ws ^8.19` (existing) — reverse-request channel is additive message types (`ext:request` / `ext:response` / `ext:event`) over the SAME 7225 bridge; no new transport, no new port
- Recorded JSONL fixtures per CLI (`tests/fixtures/agent-streams/`) — offline contract tests that survive CI without live CLI calls

**Explicit rejections:** `@anthropic-ai/claude-agent-sdk` (banned subscription auth for third parties + bundles a duplicate Claude Code binary + Claude-only), `node-pty`/any PTY (headless modes exist), `execa`/`tree-kill`/`split2` (built-ins suffice for one long-lived child shape), `--bare` on Claude (skips OAuth), URL query-string secrets, `0.0.0.0` binding, and every "auto/yolo/dangerously-skip" flag.

### Expected Features

Comparable products cluster in four shapes: same-dropdown (Cline/Roo), separate-section (Zed), account-provider (Xcode), hosted-picker (GitHub Agent HQ). FSB's structural difference is that every comparable fronts an agent for coding-in-a-repo; FSB fronts the agent for driving the user's live browser, and the spawned agent loops back through FSB's own MCP tools. No surveyed product does side-panel-initiated spawn of a local CLI that then controls the user's real logged-in browser.

**Must have (table stakes):**
- Providers panel with `api`/`agent` kinds; agent kind hides key field, shows connection/install/auth state (Cline convention)
- "Uses your existing subscription — no API key needed" copy on agent providers; explicit inverse ("your Anthropic BYOK key does NOT make Claude Code work")
- Installed/not-installed detection per agent with 3-state degradation ("installed" / "not installed" / "daemon offline")
- Live streaming progress feed with per-tool-call visibility (map `claude -p --output-format stream-json --include-partial-messages` events to a side-panel feed)
- Stop/kill button that actually reclaims tabs (kills tree + releases v0.9.60 tab ownership)
- Explicit offline → `fsb-mcp-server doctor` handoff (extension has no `nativeMessaging`; cannot wake the daemon)
- Consent gate before spawn + strict-permission defaults + `--strict-mcp-config` (browser-control consent conventions from Claude in Chrome / Atlas / Gemini auto-browse)
- Usage/cost reporting appropriate to kind — API kind keeps cost tracker; agent kind shows tokens/turns/duration + "included in your subscription" (never fabricated dollars)
- Thread-as-session continuity (Claude/Codex/Gemini all support resume; stateless-per-message is the fallback for task-mode MVP)
- Visible in-browser activity — orange glow + visual-session badges already exist

**Should have (differentiators):**
- Ground-truth recommended default (connected > installed > copy-clicked) — never auto-switch
- Live-connected roster from MCP `initialize` handshake — unique observability nobody else has
- Closed-loop delegation (side panel → spawn → browser control via FSB MCP) with a shipped `fsb` agent definition via `--agents` instead of prompt-stuffing
- Multi-agent adapter contract (`AgentProviderAdapter`: `detect / buildSpawn / parseEvents / kill / caps`)
- Cross-surface session continuity — surface `session_id` so `claude --resume <id>` works in the terminal after the side-panel run
- Doctor-integrated failure UX with layer classification
- Kill switch that reports "agent stopped, 2 tabs released"

**Defer (v1.x / v2+):**
- Chat-mode via `--resume` + per-thread cwd pinning (task-mode ships first)
- OpenCode → Codex → Gemini adapters (contract proven on Claude Code first)
- Native-messaging host to wake the daemon (removes biggest UX cliff, adds installer + attack surface)
- ACP-based adapter unification (`@zed-industries/agent-client-protocol`) — designated evolution path once ≥2 non-Claude adapters ship
- Remote delegation surfaces (Happy-style mobile approvals)

**Anti-features (hard NO):**
- Proxying/spoofing subscription OAuth tokens or using Agent SDK with consumer auth (Anthropic banned Apr 4 2026)
- Bundling/silent-installing agent CLIs (Conductor can; FSB is MV3 extension + npm daemon — wrong shape)
- PTY/TUI screen-scraping (structured headless interfaces exist for all four)
- `--dangerously-skip-permissions` / `--yolo` / `--auto` as default or convenience toggle (RCE)
- Remote-LAN/tunnel delegation this milestone (localhost-only)
- Fabricated dollar costs for subscription-backed runs (Cline shows $0.00 — mimic)
- Auto-switching provider when a "better" agent connects
- Forcing/funneling users away from BYOK (INV-03 provider parity)

### Architecture Approach

FSB v0.9.91 is a brownfield integration map — the four features layer onto existing seams. `PLATFORMS` registry + `resolvePlatformTarget` handle disk detection; `AgentScope.ensure()` sends the `agent:register` payload (empty `{}` today — the clientInfo seam); `mcp-bridge-client.js:_ws.onopen` mints a per-connect `connectionId` (the pattern to clone for clientInfo stamping); the ws://7225 hub already gates by browser Origin (`bridge.ts:297-309`) and handles hub-exit promotion (`:756-783`); the `serve` daemon (`index.ts:266-294`) is the only intentionally long-lived process. Delegation coexists with the extension's own agent loop by becoming the fifth `EXECUTION_MODES` entry — the reasoning loop runs in the spawned CLI, not `runAgentLoop`; the daemon keeps only a session-lite record for UI state.

**Major components (new + modified):**

1. **Client-identity capture glue** (NEW inline in `runtime.ts` / `agent-scope.ts`; MODIFY `mcp-tool-dispatcher.js:handleAgentRegisterRoute` + `agent-registry.js`) — reads `getClientVersion()`, threads `clientInfo` through the additive `agent:register` payload, extension stamps registry AgentRecord + rolls up to durable `fsbAgentProviders.connected`
2. **Providers panel** (MODIFY `control_panel.html:146` + `options.js`) — rename "API Configuration" → "Providers"; NEW `providerKind` setting alongside `modelProvider` (which stays scoped to the 7 API providers so `universal-provider.js` never sees an agent value); agent-kind hides key groups, shows installed/connected/auth state
3. **Reverse-request protocol** (NEW additive types in `mcp/src/types.ts` + `bridge.ts` + `mcp-bridge-client.js`) — `ext:request` / `ext:response` / `ext:event` frames; supervisor advertises `capabilities: ['agent-spawn']` on `relay:hello`; hub routes locally or forwards to the advertising relay; Origin allowlist + shared secret + consent tier gate every frame
4. **SpawnSupervisor** (NEW `mcp/src/spawn-supervisor.ts`, ~200-300 lines, lives in the `serve` daemon) — validates consent + secret, looks up adapter, `spawn` with adapter-built argv, parses stream-json into `ext:event` fan-out, kill (SIGTERM → SIGKILL escalation with negative-PID on POSIX / `taskkill /T /F` on Windows)
5. **Adapter registry** (NEW `mcp/src/agent-providers/{index,adapter,claude-code}.ts`) — `AgentProviderAdapter` contract: `detect() / buildSpawn(task, ctx) / parseEvents(stream) / kill(child) / caps()`; keyed against `INSTALL_CLIENTS` + `PLATFORMS`; Claude Code first, then OpenCode/Codex/Gemini
6. **Fifth execution mode** (MODIFY `extension/ai/engine-config.js:63-108`) — `delegated: { uiFeedbackChannel: 'popup-sidepanel', animatedHighlights: true, safetyLimits: wall-clock + event-silence watchdog }` (no iteration cap — loop runs in the external CLI)
7. **Delegation coordinator** (MODIFY `extension/background.js` + `sidepanel.js`) — `startDelegatedTask`/`stopDelegatedTask` runtime messages; delegated session-lite records persisted to `chrome.storage.session` for SW-eviction survival; MUST use same-context `fsbDispatchInternalMessage` (auto-memory: `sendMessage` never loops back in-SW)

**Spawner ownership decision:** the `serve` daemon owns spawning. Rationale: hub identity is unstable by design (any stdio server can hold the port; hub-exit promotion reshuffles roles); spawning is RCE-adjacent and needs a single explicit consent holder; the daemon is the only intentionally long-lived process; and the extension can't wake anything (no `nativeMessaging`). The hub's only new job is routing `ext:*` frames to whichever relay advertised `agent-spawn` capabilities.

### Critical Pitfalls

The security section is the top of the pitfall stack. Every one of the top 5 is a repeat of a 2025-2026 CVE class that already shipped in the wild.

1. **CSWSH on ws://localhost:7225 → spawn RCE** — an attacker-controlled tab dials `ws://localhost:7225` and sends the delegation request. Prevention: strict `Origin` allowlist to `chrome-extension://<known-fsb-id>` on the WS upgrade, `Sec-WebSocket-Protocol` shared secret, `Host` = loopback, never bind `0.0.0.0`. Reference incidents: Mailpit, Dozzle CVE-2026-44985, Nanobot. Phase 60.
2. **DNS rebinding against localhost** — attacker's page resolves `evil.com` to `127.0.0.1` after the fact; loose `Host` checks pass. Prevention: `Host` header equality against `127.0.0.1`/`localhost` (port-stripped, case-folded), `Origin` allowlist still primary. Reference incidents: CVE-2025-49596 (Inspector, CVSS 9.4), CVE-2025-66414/66416 (MCP SDKs). Phase 60.
3. **Prompt-injection into spawn payload → RCE** — reverse-request payload carries `--dangerously-skip-permissions` or a malicious `--mcp-config`. Prevention: daemon owns the flag set; extension provides ONLY prompt string + adapter selector; reject unknown payload keys; strict argv construction (never `sh -c`); ship an `fsb` agent definition instead of prompt-stuffing; `--strict-mcp-config` mandatory. Reference incidents: CVE-2025-59536, CVE-2025-54794/54795, TrustFall. Phases 60/61/62 (defense-in-depth).
4. **`--dangerously-skip-permissions` / `--yolo` as default or "fast mode"** — 1-click RCE for any prompt injection. Prevention: PERMANENT invariant that these flags never appear in FSB's spawn path; grep-fail CI gate. Phase 60.
5. **Weak / leaked shared secret** — token in `chrome.storage.sync` (sync = huge leak surface), in URL query, in diagnostic logs. Prevention: per-install `>=32-byte` random token, rotate on daemon restart, transport via `Sec-WebSocket-Protocol` header only, redaction bar extends `redactForLog`, Origin allowlist stays primary (secret is defense-in-depth). Phase 60.

Additional load-bearing pitfalls with narrower phase homes:
- **Orphaned/zombie children on cancel** (Windows + POSIX): `spawn({ detached: true })` + `process.kill(-child.pid, 'SIGTERM')` on POSIX, `taskkill /pid <pid> /T /F` on Windows, orphan-scan on daemon startup. Phase 61.
- **Stdout backpressure deadlock**: `readline` interface, no `await` in the parse handler, drop-with-notice on side-panel close. Phase 61.
- **Daemon crash mid-run leaves CLI controlling browser**: extension-side heartbeat, spawned CLI exits when MCP transport dies, daemon restart doesn't blind-adopt. Phase 62.
- **Agent CLI stdout/flag/schema drift between versions**: adapter version detection, fail-loud on unknown events, drift-smoke CI job. Phases 61 + 63.
- **MV3 SW eviction during long delegation**: `chrome.storage.session` write per progress event, 20s WS heartbeat resets SW idle timer (Chrome 116+), `chrome.alarms` backup, extend the load-bearing v0.10.0 `setTimeout`-iterator pattern (INV-04). Phase 62.
- **Source-pin tripwire tests break the moment extension gets wired** (auto-memory): every extension-source edit updates paired tripwires in the same commit; full test suite green from commit 1 of every phase. Every extension-touching phase.
- **Chat-thread vs one-shot mismatch (`--resume` vs `-p` semantics)**: Claude Code `--continue` silently creates a new session in `-p` mode; adapter contract has explicit `mode: 'task' | 'chat'`. Phase 61 + 62.
- **User-vs-agent tab conflict**: default the delegated agent to a new background tab; explicit "take control" affordance on the active tab; `change_report` reconciliation detects user-initiated navigation. Phase 62.
- **Hub/relay bridge topology edge cases** (hub exits mid-delegation): topology tests must cover hub-exit-mid-delegation; new events are strictly additive types, existing wire byte-stable (INV-01). Phase 60 + every wire-touching phase.

## Implications for Roadmap

Phases continue from 57. The build order is dictated by dependencies (identity data enables provider UI enables delegation UI enables adapter breadth) plus a hard rule: the security foundation (Phase 60) ships before any spawn code and cannot be deferred to a "hardening" phase.

### Phase 57 — Agent identity capture (copy-clicks + clientInfo + inventory)
**Rationale:** Pure additive data layer on both sides of the wire; unblocks everything later; closes the v0.9.36 deferred "trusted MCP client identity from handshake metadata" item. Ships value on its own (control-panel roster) before any spawn work.
**Delivers:** `persistCopyClick` in `onboarding.js`; `getClientVersion()` capture in `runtime.ts`/`agent-scope.ts`; `clientInfo` field in `agent:register` payload (additive; INV-01 safe); `stampClientInfo` on `AgentRecord`; `resolvePlatformTarget` extended for cli-mode `claude-code` (binary + `~/.claude.json` detection); `fsbAgentProviders` storage schema; `getMcpClients` runtime message.
**Uses:** `platforms.ts` (existing), `agent-registry.js:stampConnectionId` pattern, SDK `^1.29.0`.
**Research flag:** LOW.

### Phase 58 — Providers panel rename + kinds + recommended default
**Rationale:** Visible value before the risky spawn work; establishes the selection the delegation UI reads; UI-only, low pitfall exposure.
**Delivers:** `control_panel.html:146` rename; `providerKind` model in `options.js`; agent rows + install/auth/connection state + recommended badge (connected > installed > copy-clicked); BYOK guard so `universal-provider.js` never sees an agent value; explicit "uses your subscription" copy per agent.
**Research flag:** LOW.

### Phase 59 — Reverse-request channel + security foundation
**Rationale:** SECURITY-CRITICAL. Pitfalls 1, 2, 3 (argv/flag rules), 5, 16 land here. Isolated in its own phase with its own tests so the INV-01 additive proof and CSWSH/rebind fixtures land before any spawn code exists.
**Delivers:** Additive `ext:request`/`ext:response`/`ext:event` types; `capabilities: ['agent-spawn']` on `relay:hello`; hub routing logic; extension pending-map + `sendExtRequest`; strict `Origin` allowlist to `chrome-extension://<fsb-id>`; `Host` = loopback check; per-install rotating shared secret in `Sec-WebSocket-Protocol`; `redactForLog` extension for token patterns; hub-exit-mid-delegation topology test cases.
**Research flag:** MEDIUM — shared-secret provisioning UX (TOFU pairing vs user-visible pairing code) and rebind fixture design.

### Phase 60 — Adapter contract + Claude Code MVP
**Rationale:** The integration payoff. Built AS an adapter from day one so OpenCode/Codex/Gemini slot in without rework. Pitfalls 3 (argv), 6, 7, 9, 12 land here.
**Delivers:** `AgentProviderAdapter` contract; `claude-code.ts` adapter with verified 2.1.177 flag set; `SpawnSupervisor` with POSIX process-group kill / Windows `taskkill /T /F`; `readline` stream framing; scrubbed env; stream-json event contract parser; `caps()` distinguishes task-mode vs chat-mode; adapter version detection; recorded JSONL fixtures.
**Research flag:** MEDIUM — Claude Code spikes: `--agent fsb` + inline `--agents` composition; `--tools ""` Windows quoting; `.cmd` shim resolution.

### Phase 61 — Delegation UX, lifecycle, and offline handoff
**Rationale:** The user-facing payoff. Pitfalls 4 (UX audit), 8, 10, 13, 14, 15 land here.
**Delivers:** Fifth `EXECUTION_MODES` entry `delegated`; `startDelegatedTask`/`stopDelegatedTask` background handlers; side-panel progress feed (init/tool/retry/result); kill switch that releases owned tabs; `chrome.storage.session` persistence per progress event; 20s WS heartbeat + `chrome.alarms` backup; explicit consent tiers; default-background-tab + "take control" affordance; post-run usage summary card; "agent offline → `doctor`" state.
**Research flag:** MEDIUM-HIGH — consent tier UX has no direct comparable; Anthropic billing model under active churn.

### Phase 62 — CI drift-smoke gate + doctor delegation checks
**Rationale:** Pitfall 9 (drift) will keep happening across the milestone's life.
**Delivers:** CI job that runs each adapter against a canned prompt and asserts a known event sequence; `fsb-mcp-server doctor` extended with binary/version/auth/spawn-secret checks per adapter; adapter compatibility matrix in `doctor` output; `agent_protocol_drift` classification.
**Research flag:** LOW.

### Phase 63+ — Multi-agent adapters (OpenCode → Codex → Gemini)
**Rationale:** Contract proven by Claude Code MVP; each new adapter re-uses the Phase 60 contract.
**Delivers:** Per-CLI adapters with verified flag matrices; per-adapter caps + version matrix + credentials story; `caps.chatMode` flag driving side-panel affordance (`--resume`); billing-model copy per adapter.
**Research flag:** MEDIUM per adapter — Gemini 0.50.0 live `--help` capture; OpenCode HTTP-server-vs-spawn shape.

### Phase Ordering Rationale

- **Dependency chain:** identity data (57) → provider selection UI reads it (58) → security foundation must exist before any spawn code (59) → adapter contract needs the channel (60) → UX/lifecycle needs the adapter (61) → drift gate and doctor need something to check (62) → contract must be stable before breadth (63+).
- **Security-first:** Phase 59 is the load-bearing phase. Every top-5 critical pitfall has fixture-level evidence baked in before any spawn logic exists in Phase 60.
- **INV-01 discipline:** every wire addition is additive — new frame types + optional payload fields only. Existing `MCPMessageType` values and tool schemas byte-stable across the whole milestone.
- **Test-suite tripwire discipline:** every extension-touching phase runs the full suite from commit 1; every extension-source edit updates paired tripwires in the same commit.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Flag matrices verified against local binaries (claude 2.1.177, codex 0.142.5, opencode 1.14.25) + current official docs; SDK accessor verified at pinned tag v1.29.0; Node child_process design facts verified verbatim from nodejs.org/api/child_process.html. Gemini 0.50.0 docs-only (no local binary). |
| Features | HIGH | Core UX conventions verified against Zed, Cline, Claude Code, ACP, Apple, GitHub, Google, OpenAI docs and multiple 2025-2026 vendor product pages. Anthropic subscription-OAuth ban timeline (Jan-Apr 2026) verified. |
| Architecture | HIGH | Every integration seam cited at file:line against live source; SDK `getClientVersion` verified via Context7 against pinned `^1.29.0`. |
| Pitfalls | HIGH | Security section verified against 2025-2026 CVEs and vendor advisories; MV3/child_process sections verified against Chrome/Node.js docs. Vendor billing footnotes flagged. |

**Overall confidence:** HIGH

### Gaps to Address

- **Shared-secret provisioning UX** — TOFU pairing on first `serve` connect vs a user-visible pairing code from `fsb-mcp-server pair` — decide in Phase 59 planning.
- **Inventory delivery trigger** — on-extension-connect push vs piggyback on `agent:register` vs on-demand `ext:request clients.detect` — decide in Phase 57 planning.
- **Anthropic billing model** — May 14 2026 announced, June 15 2026 paused; Providers-panel copy must not promise "unlimited/free" and must reflect the current state within each release cycle.
- **Whether `--agent fsb` selects an agent defined inline via `--agents`** — 5-minute spike in Phase 60; fallback is `--append-system-prompt-file`.
- **`--tools ""` Windows quoting + `.cmd` shim resolution** — Node CVE-2024-27980 EINVAL behavior; per-CLI installer layout to confirm.
- **OpenCode HTTP-server-vs-spawn adapter shape** — `opencode serve` + `run --attach` is a cheaper reuse path than cold spawn.
- **Gemini 0.50.0 live `--help` capture** — first Gemini adapter phase must start with this before any code.

## Feature Categories for Requirements Definition

1. **Identity Capture (IDENT)** — copy-click persist, MCP `initialize` `clientInfo` capture + threading, disk detection per `platforms.ts`, `fsbAgentProviders` storage schema.
2. **Providers Panel (PROV)** — "API Configuration" → "Providers" rename, `providerKind: api|agent`, per-kind field visibility, recommended-default badge (connected > installed > copy-clicked), kind-appropriate copy.
3. **Delegation Channel (CHAN)** — `ext:*` reverse-request frames on ws://7225, Origin allowlist, Host loopback, shared-secret transport, hub routing to `agent-spawn` relay, INV-01 additive proof, hub-exit topology tests.
4. **Adapter Contract (ADAPT)** — `AgentProviderAdapter` interface, `SpawnSupervisor`, POSIX/Windows kill-tree, `readline` framing, scrubbed env, version detection, JSONL fixtures.
5. **Claude Code MVP (CLAUDE)** — verified 2.1.177 flag set, shipped `fsb` agent definition via `--agents`, stream-json parsing, task-mode first, subscription auth via user's own login.
6. **Delegation UX (UX)** — consent tiers (first-enable + per-run), streaming feed, default-background-tab + take-control, kill switch that reclaims tabs, "agent offline → `doctor`", post-run usage summary card, cost copy discipline.
7. **Lifecycle & Persistence (LIFE)** — SW-eviction survival via `chrome.storage.session`, WS heartbeats, daemon-liveness detection, fifth `EXECUTION_MODES` entry.
8. **Drift Gate & Doctor (DRIFT)** — adapter version matrix, per-adapter CI smoke, `doctor` extensions, diagnostics classification.
9. **Multi-Agent Adapters (MULTI)** — OpenCode → Codex → Gemini (deferred phase family; contract-reuse only).

## Sources

Detailed sources live in the four research files. Aggregated by tier:

### Primary (HIGH confidence)
- Local binaries executed 2026-07-10: `claude --help` @ 2.1.177; `codex exec --help` + `codex mcp --help` @ 0.142.5; `opencode run --help` @ 1.14.25 — all flags quoted verbatim
- `code.claude.com/docs/en/{cli-reference,headless,permissions,agent-sdk/overview,sub-agents,chrome}`
- `learn.chatgpt.com/docs/{non-interactive-mode,config-file/config-reference}` (Codex)
- `github.com/google-gemini/gemini-cli` docs
- `opencode.ai/docs/{cli,mcp-servers,agents,server,acp}` + `zed.dev/acp`
- `modelcontextprotocol/typescript-sdk` tag v1.29.0 `src/server/index.ts` — `clientInfo` + `getClientVersion()` verified
- `nodejs.org/api/child_process.html` — detached/process-group, kill-tree, backpressure, shell warning — verbatim
- 2025-2026 CVE advisories: CVE-2025-49596 (Inspector), CVE-2025-66414/66416 (MCP SDKs), CVE-2025-59536 (Claude Code project files), CVE-2025-54794/54795 (Claude Code command injection), Gemini CLI CVSS 10 (GHSA-wpqr-6v78-jr5g), TrustFall (Adversa AI, May 2026), Mailpit/Dozzle/Nanobot CSWSH advisories
- Direct source reads in this repo cited at file:line in ARCHITECTURE.md
- `.planning/PROJECT.md` v0.9.91 milestone section
- graphify graph queries confirming symbol locations
- Auto-memory: `fsb-source-pin-tripwires.md`; `fsb-same-context-dispatch.md`

### Secondary (MEDIUM confidence)
- `zed.dev/docs/ai/external-agents`
- Cline docs on Claude Code provider; Roo Code PR #4864; Cline Codex OAuth blog
- Apple Xcode 26 coding intelligence docs
- GitHub Agent HQ blog posts
- `agentclientprotocol.com/protocol/overview`
- The Register (2026-02-20) + `anthropics/claude-code#28091` — subscription-OAuth ban timeline
- Chrome MV3 SW lifecycle + WebSocket keepalive docs

### Tertiary (LOW confidence / needs Phase-time validation)
- Gemini CLI 0.50.0 flag surface (docs-only)
- OpenCode permission-bypass flag naming in 1.15+ (rename in flight)
- Anthropic billing model state (announced May 14 2026, paused June 15 2026)
- Wrapping the genuine `claude` binary is ecosystem-standard practice but not explicitly blessed in writing by Anthropic

---
*Research completed: 2026-07-10*
*Ready for roadmap: yes*
