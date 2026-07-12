# Roadmap: FSB (Full Self-Browsing)

## Milestones

- 🚧 **v0.9.91 MCP Clients as Providers** — Phases 57-65, planning 2026-07-11. Extends the Chrome MV3 extension + `fsb-mcp-server` so installed agent CLIs (Claude Code first, then OpenCode + Codex) become first-class side-panel providers: FSB captures which MCP clients the user copies/installs/connects, presents them as key-less providers in a renamed Providers panel, and delegates side-panel tasks to a spawned agent CLI that drives the browser back through FSB's own MCP tools — with a security-first reverse-request channel, an `AgentProviderAdapter` contract, task-mode only (chat-mode deferred), CI drift-smoke gate, native-messaging wake-host, and INV-01 (byte-stable existing MCP wire) preserved end-to-end.
- ✅ **v1.2.0 Showcase i18n Completeness** — Phases 52-56, shipped 2026-07-09. Archive: `.planning/milestones/v1.2.0-ROADMAP.md`. Closes the translation gap that reopened after v0.9.63 shipped: a full-page audit establishes the true drift/missing scope, resync + stats-page translation + transcreation review close it, a CI drift-detection gate lands on the clean baseline, and the long-deferred WARNING-02 locale-cookie redirect bug is fixed.
- ✅ **v1.1.0 T1 App Execution Expansion** — Phases 44-51, shipped 2026-06-30; refreshed 2026-07-01 after post-closeout T1 ports. Expanded proven T1/guarded coverage from 26 baseline descriptors to 1,267 executable T1-ready descriptors plus 556 guarded fail-closed rows, and closed the remaining catalog tail with explicit terminal-state accounting. Archive: `.planning/milestones/v1.1.0-ROADMAP.md`.
- ✅ **v1.0.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43, shipped 2026-06-29. Full OpenTabs-derived catalog/search/discovery surface: 2,314 descriptors across 128 app stems / 129 services; 26 T1/T1b descriptors today; 2,288 descriptors intentionally remain DOM/discovery-tail. Archive: `.planning/milestones/v1.0.0-ROADMAP.md`.

## Current Milestone: v0.9.91 MCP Clients as Providers

**Milestone Goal:** Make installed agent CLIs (Claude Code first) first-class side-panel providers — FSB captures which MCP clients the user installs/connects, presents them as key-less providers in a renamed Providers panel, and delegates side-panel tasks to a spawned agent CLI that drives the browser back through FSB's own MCP tools. The user's own words: "when I'm sending a message from the side panel, the FSB extension sends a request to the MCP server, which spawns a Claude/Codex/OpenCode agent with the prompt, and that agent uses FSB MCP tools to perform the task — technically driving the local coding agent from the side panel."

**Key context (non-negotiable):**

- **Security-first hard rule.** The reverse-request channel is RCE-adjacent by construction: a browser click becomes `execve(claude, -p, <prompt>)` inside a localhost daemon. The security foundation phase (Phase 59) — reverse-request channel + Origin/Host/secret/consent + CHAN-07 grep gate — MUST land before ANY spawn code exists. It cannot be deferred to a "hardening" phase. All CHAN-01..CHAN-07 requirements land in Phase 59 together.
- **INV-01 discipline.** Every wire addition is additive: new frame types (`ext:request`/`ext:response`/`ext:event`) + optional payload fields only. Existing `MCPMessageType` values and tool schemas stay byte-stable across the entire milestone; a byte-freeze regression test proves this in every phase that touches the wire.
- **Task-mode only.** Chat-mode continuity via `--resume` / `codex resume` / `opencode --continue` is v2 scope (CHAT-FUTURE-01/02); every adapter's `caps()` reports `chatMode: false` for v0.9.91.
- **Adapter breadth: OpenCode + Codex; skip Gemini.** GEMINI-FUTURE-01 defers Gemini until a live `--help` capture and JSONL schema pinning are done. NATIVE and DRIFT are IN scope.
- **No `--dangerously-skip-permissions` / `--yolo` / `--auto`.** Anywhere. Ever. Not even in an "advanced mode." A permanent CI grep gate (CHAN-07) fails the build if those strings appear under `mcp/src/agent-providers/**`.
- **No `@anthropic-ai/claude-agent-sdk` embedded in FSB.** Anthropic banned third-party products from using consumer subscription auth via the SDK (enforcement Apr 4 2026). Shelling to the user's installed `claude` binary is the only compliant "no API key" path and is standard ecosystem practice (Cline, Roo, Zed, Conductor).
- **Extension has no `nativeMessaging` permission in Phases 57-62.** Delegation therefore requires a running `fsb-mcp-server serve` daemon; MVP ships an honest "agent offline → doctor" state. Phase 63 (NATIVE) adds the optional wake-host that closes this UX cliff.
- **Source-pin tripwire discipline.** FSB's test suite pins exact token counts and substrings on extension source (even comments). Every extension-touching commit updates paired tripwires; the full suite runs from commit 1 of every phase.

**Phase ordering rationale (from research; dependency chain non-negotiable):** identity data (Phase 57) → provider selection UI reads it (Phase 58) → security foundation must exist before any spawn code (Phase 59) → adapter contract needs the channel (Phase 60) → UX/lifecycle needs the adapter (Phase 61) → drift gate and doctor need something to check (Phase 62) → native-host is additive and can only close the offline cliff after the offline state itself exists (Phase 63) → contract must be stable before adapter breadth (Phases 64-65).

## Phases

**Phase Numbering:**
- Integer phases (57, 58, 59, 60, 61, 62, 63, 64, 65): Planned milestone work, continuing from v1.2.0's Phase 56
- Decimal phases (57.1, 57.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 57: Agent Identity Capture** - Persist copy-clicks, capture MCP `initialize` `clientInfo`, thread it through `agent:register`, add disk-scan detection, expose a unified `getMcpClients` view — additive on both sides of the wire (INV-01 safe), unblocks everything downstream
- [ ] **Phase 58: Providers Panel** - Rename "API Configuration" → "Providers", introduce `api` vs `agent` provider kinds, hide the key input for agent kind, badge exactly one "Recommended" provider via the connected > installed > copy-clicked cascade, keep `universal-provider.js` unaware of agent values (INV-03 BYOK parity)
- [ ] **Phase 59: Reverse-Request Channel & Security Foundation** - **SECURITY-CRITICAL, load-bearing**. Additive `ext:*` frames on ws://localhost:7225, strict Origin allowlist + Host loopback + per-install rotating shared secret in `Sec-WebSocket-Protocol`, log redaction, hub-exit-mid-delegation topology tests, permanent CI grep gate against `--dangerously-skip-permissions` / `--yolo` / `--auto` — ships BEFORE any spawn code exists
- [ ] **Phase 60: Adapter Contract & Claude Code MVP** - `AgentProviderAdapter` interface, `SpawnSupervisor` in the `serve` daemon with argv-only spawn / scrubbed env / SIGTERM-at-process-group / Windows `taskkill /T /F` / orphan scan on startup, Claude Code adapter with verified 2.1.177 flag set + shipped `fsb` agent definition + recorded stream-json JSONL fixture — the integration payoff
- [ ] **Phase 61: Delegation UX & SW-Eviction Persistence** - Fifth `EXECUTION_MODES` entry `delegated`, explicit first-use consent card, live per-tool-call streaming feed, default-background-tab + "Take control" affordance, kill switch that reclaims owned tabs, post-run usage summary, `chrome.storage.session` per-event persistence, 20 s WS heartbeat, "agent offline → `doctor`" deep-link, restart-is-clean semantics
- [ ] **Phase 62: CI Drift-Smoke Gate & Doctor Extensions** - Per-adapter CI drift-smoke against canned fixtures (fail-loud on unknown event types / missing fields / version outside compat matrix), `fsb-mcp-server doctor` per-adapter section (binary path, version, auth, secret rotation age), machine-readable adapter compatibility matrix consumed by the extension
- [ ] **Phase 63: Native-Messaging Host** - `install --native-host` writes the platform-appropriate manifest (mac/Linux/Windows), extension gains additive `nativeMessaging` permission, "Agent offline" state auto-attempts wake before the doctor deep-link; the native host only launches (or attaches to) `serve` — it NEVER spawns agent CLIs directly (all spawn authority stays inside the daemon behind Phase 59 CHAN gates)
- [ ] **Phase 64: OpenCode Adapter** - Second adapter proves the contract accommodates server-mode + attach on top of cold spawn without any Phase 60 rewrite; pinned OpenCode agent definition + recorded JSONL fixture + drift-smoke coverage
- [ ] **Phase 65: Codex Adapter** - Third adapter with `codex exec --json` on the verified 0.142.5 hermetic flag set (`--ephemeral` + `--ignore-user-config`, never the deprecated `--full-auto`), `detect()` surfacing ChatGPT OAuth / API key / unauthenticated so the Providers panel discloses which billing bucket a run will hit; `caps.chatMode: false` across all adapters (task-mode only for v0.9.91)

## Phase Details

### Phase 57: Agent Identity Capture
**Goal**: FSB knows which MCP-capable agent CLIs the user has installed on disk, has expressed intent to install (via onboarding copy clicks), and has actually connected via MCP `initialize` — surfaced as a single ground-truth view that unblocks every downstream provider-selection decision.
**Depends on**: Nothing (first phase of this milestone; pure additive data layer on both sides of the wire)
**Requirements**: IDENT-01, IDENT-02, IDENT-03, IDENT-04, IDENT-05
**Success Criteria** (what must be TRUE):
  1. When the user clicks any copy-to-clipboard button on the onboarding MCP-install screen (for `claude-code`, `cursor`, `vscode`, `windsurf`, `codex`, `opencode`, `openclaw`, `claude-desktop`, or `all`), FSB records that client id (with timestamp, deduplicated, all-clients aggregated for multi-select cases) into a durable `fsbAgentProviders.clicked` list in `chrome.storage.local` that survives service-worker eviction and Chrome restart.
  2. When any MCP client completes its `initialize` handshake with `fsb-mcp-server` (over stdio, streamable-HTTP, or the ws://7225 bridge), FSB captures the caller's `clientInfo.name` and `clientInfo.version`, threads them through an additive field on the existing `agent:register` bridge payload, stamps them onto the live `AgentRecord` in the registry, and rolls the identity up into a durable `fsbAgentProviders.connected` entry keyed so re-connections update rather than duplicate.
  3. `fsb-mcp-server` can enumerate installed MCP-capable clients on the current machine by inspecting the paths already known to `platforms.ts` (per-OS `configPath` for file-mode clients; `claude --version` binary probe for cli-mode `claude-code`) and report each as `installed` / `not-installed` with any parseable version.
  4. A single `getMcpClients` extension runtime message returns a merged `clicked ∪ installed ∪ connected` view with per-client status, so UI surfaces read one consistent structure instead of assembling it themselves — and the merged view survives MV3 service-worker eviction.
  5. INV-01 holds: no existing `MCPMessageType` value, no existing tool schema, and no existing consumer of the `agent:register` payload breaks — the additive `clientInfo` field is optional and existing `payload: {}` handlers keep working byte-for-byte.
**Plans**: TBD

### Phase 58: Providers Panel
**Goal**: The control panel's "API Configuration" section becomes the "Providers" panel — distinguishing BYOK API providers from installed agent CLIs, badging exactly one provider "Recommended" from ground truth (never auto-switching selection), and shipping honest no-fabrication cost/usage copy for agent-kind providers.
**Depends on**: Phase 57 (needs real `fsbAgentProviders` data to render agent rows and to drive the "Recommended" cascade)
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06
**Success Criteria** (what must be TRUE):
  1. The control panel section formerly labeled "API Configuration" is labeled "Providers" (heading, nav label, and the legacy `#api-config` anchor continues to work as a redirect to the new `#providers` anchor for existing bookmarks); the source-pin tripwire suite stays green from commit 1 of this phase.
  2. Every provider row has an explicit `providerKind` of either `api` (the existing 7 BYOK LLM providers) or `agent` (a locally installed agent CLI); the kind determines which fields render — an `agent`-kind selection hides the API-key input, key-URL hint, and per-model key-format hint, and shows install status, auth status (where the CLI exposes it), connection status, and a "uses your subscription — no API key needed" caption instead.
  3. Exactly one provider is badged "Recommended" per session, chosen by the strict ground-truth cascade (highest = a CLI currently connected via MCP `initialize`, next = a CLI installed on disk, next = a CLI whose copy button was clicked during onboarding, fallback = the existing xAI-default recommendation); the badge is advisory only — the user's selection is never auto-switched.
  4. `universal-provider.js` (the existing BYOK request builder) never observes an agent value: switching between an active agent provider and a BYOK api provider preserves the other's configuration, and INV-03 provider parity for the 7 BYOK providers holds unchanged.
  5. Cost/usage rows for `agent`-kind providers display token count, turn count, and duration alongside the label "included in your subscription", with a link to the vendor's current billing page — never a fabricated dollar amount and never the words "free" or "unlimited".
**Plans**: TBD
**UI hint**: yes

### Phase 59: Reverse-Request Channel & Security Foundation
**Goal**: Extension → daemon reverse requests transit the existing `ws://localhost:7225` bridge with every documented 2025-2026 CVE-class defense enforced from commit one — Origin allowlist, Host loopback, per-install rotating shared secret, log redaction, additive-only wire evolution, and a permanent grep gate against the three "one-click RCE" flags. This phase is SECURITY-CRITICAL and load-bearing: it ships BEFORE any spawn code exists in Phase 60.
**Depends on**: Nothing (channel design is orthogonal to Phase 57/58 data + UI; can develop in parallel but MUST be code-green before Phase 60 starts)
**Requirements**: CHAN-01, CHAN-02, CHAN-03, CHAN-04, CHAN-05, CHAN-06, CHAN-07
**Success Criteria** (what must be TRUE):
  1. A new `ext:request` / `ext:response` / `ext:event` bridge message-type family transports extension → daemon reverse requests over the existing ws://localhost:7225 bridge, and a byte-freeze regression test proves every existing `MCPMessageType` value, tool schema, and bridge payload stays byte-identical (INV-01 additive proof).
  2. A relay process advertising `capabilities: ['agent-spawn']` on `relay:hello` becomes the routing target for `ext:*` frames: the hub routes each `ext:request` locally when it is itself the daemon, forwards to the first `agent-spawn`-advertising relay when it is not, and replies `agent_provider_offline` when no supervisor is present — verified by extending `tests/mcp-bridge-topology.test.js` with new hub-exit-mid-delegation and relay-mid-`ext:*`-frame cases without breaking any existing hub-exit-promotion test.
  3. A fixture crafted with `Origin: https://evil.com` on the WebSocket upgrade is rejected before any handler runs; a second fixture with `Host: evil.com:7225` (even when the target actually resolves to 127.0.0.1) is rejected as DNS-rebind defense — the bridge accepts `ext:*` frames only when the WS upgrade carried an `Origin` matching a durable per-install `chrome-extension://<fsb-id>` allowlist and a `Host` exactly `127.0.0.1` or `localhost` at the loopback port, and the daemon never binds `0.0.0.0`.
  4. A per-install ≥32-byte shared secret is provisioned once between the extension and the daemon, transported only in the `Sec-WebSocket-Protocol` upgrade header (never in URL, never in payloads, never in logs), rotated on daemon restart, and required on every `ext:*` frame — and `redactForLog` plus every tracked diagnostic ring-buffer sink strips any string matching the shared-secret token pattern, with a build-time drift gate that fails if a raw secret substring appears in any tracked log fixture.
  5. A permanent CI grep gate fails the build if the strings `--dangerously-skip-permissions`, `--yolo`, or `--auto` appear anywhere in `mcp/src/agent-providers/**`, so those "one-click RCE" flags can never enter the spawn path in any future patch.
**Plans**: TBD

### Phase 60: Adapter Contract & Claude Code MVP
**Goal**: A shell-free, tree-killable `SpawnSupervisor` in the `serve` daemon spawns the user's installed `claude` CLI via a formal five-method `AgentProviderAdapter` contract — with a shipped `fsb` agent definition (never prompt-stuffing), `--strict-mcp-config` hermeticity, and a recorded stream-json JSONL fixture — so a user with Claude Code installed can send a side-panel message and observe the agent drive their live browser back through FSB's MCP tools with visible per-tool-call feedback. This phase is the integration payoff; the contract is designed for adapter breadth so OpenCode/Codex slot in without rework.
**Depends on**: Phase 58 (provider selection reads the Providers panel), Phase 59 (channel + all CHAN security foundations must be code-green before any spawn code exists)
**Requirements**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, ADAPT-05, CLAUDE-01, CLAUDE-02, CLAUDE-03, CLAUDE-04
**Success Criteria** (what must be TRUE):
  1. The `AgentProviderAdapter` TypeScript interface (`mcp/src/agent-providers/adapter.ts`) exposes exactly five methods (`detect()` → `{installed, version, authState, binary}`, `buildSpawn(task, ctx)` → `SpawnSpec`, `parseEvents(stream)` → `AsyncIterable<AgentEvent>`, `kill(child, {grace})` → `Promise<void>`, `caps()` → `AdapterCapabilities`), and the Claude Code adapter (`mcp/src/agent-providers/claude-code.ts`) implements all five and is registered against the `INSTALL_CLIENTS` / `PLATFORMS` client id `claude-code`.
  2. A user with Claude Code installed can select "Claude Code" as their provider in the side panel, type a task, and observe the spawned CLI drive their live browser back through FSB's MCP tools — with visible per-tool-call feedback — while every existing FSB MCP tool call remains byte-identical on the wire (INV-01 preserved end-to-end through the delegation round-trip; the byte-freeze regression test still passes).
  3. The `SpawnSupervisor` accepts a validated spawn request over Phase 59's `ext:request` channel, looks up the requested adapter, constructs argv from adapter output plus a daemon-controlled flag allowlist (unknown payload keys rejected with a typed error), and spawns the child with `{ detached: true, windowsHide: true, stdio: ['pipe','pipe','pipe'] }` and an environment with `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY` scrubbed; the supervisor never invokes a shell, and the user's prompt reaches the CLI only via `child.stdin` (never argv, never `sh -c`) so shell metacharacters and Windows `.cmd`-shim EINVAL (Node CVE-2024-27980) cannot execute.
  4. A `stop` / cancel request triggers SIGTERM at the process-group level on POSIX (`process.kill(-child.pid, 'SIGTERM')` after `spawn({detached:true})`), `taskkill /pid <pid> /T /F` on Windows, escalates to SIGKILL after a grace window, and does not resolve the delegation until either an exit-signal is observed or the daemon confirms no descendant matches remain — grandchildren, MCP sub-servers, and shell tools spawned by the CLI are all terminated.
  5. On daemon startup, the supervisor scans for orphaned children matching prior adapter fingerprints (env-var tag + argv pattern) and kills them before accepting new spawn requests, and reports the scan result in structured diagnostics — so a daemon crash mid-run cannot leave a ghost CLI controlling the browser.
  6. The Claude Code adapter spawns `claude -p --verbose --output-format stream-json --include-partial-messages --strict-mcp-config --mcp-config <daemon-generated-loopback-file> --agents <shipped-fsb-agent-json> --agent fsb --permission-mode dontAsk --allowedTools "mcp__fsb" --disallowedTools "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch" --max-turns 40 --no-session-persistence` (or the version-appropriate equivalent selected by `detect()`); `parseEvents` translates the CLI's stream-json events into a normalized `AgentEvent` schema, fails loud on unknown event types (surfaced as `agent_protocol_drift` diagnostic), and is covered by a recorded JSONL fixture under `tests/fixtures/agent-streams/claude-code-2.1.177/` so CI runs without a live CLI; `detect()` fingerprints via `claude --version`, compares against a minimum supported version, and reports `installed=false` with a doctor-diagnostic message rather than spawning if the version predates the verified stream-json contract.
**Plans**: TBD

### Phase 61: Delegation UX & SW-Eviction Persistence
**Goal**: The side panel becomes a first-class delegation surface — visible first-use consent gate, live per-tool-call streaming feed, default-background-tab with a "Take control" affordance, kill switch that reclaims owned tabs, honest post-run usage summary, and MV3 SW-eviction-safe persistence so a 45-minute run resumes exactly the feed the user last saw. The extension has no `nativeMessaging` permission at this point — this phase ships the honest "Agent offline → `doctor`" state that Phase 63 later augments with an optional wake path.
**Depends on**: Phase 60 (adapter contract + Claude Code MVP producing the `AgentEvent` stream + tab ownership on spawn); Phase 59 heartbeat plumbing
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, LIFE-01, LIFE-02, LIFE-03, LIFE-04
**Success Criteria** (what must be TRUE):
  1. A fifth `EXECUTION_MODES` entry `delegated` in `extension/ai/engine-config.js` (with `uiFeedbackChannel: 'popup-sidepanel'`, `animatedHighlights: true`, wall-clock + event-silence watchdogs, and no iteration cap — the reasoning loop runs in the spawned CLI, not `runAgentLoop`) is selected automatically whenever the active provider is agent-kind, and the extension's own `runAgentLoop` is never entered for delegated tasks.
  2. Before FSB spawns any agent CLI for the first time, the user sees an explicit consent card that names the CLI, states what it will be permitted to do (drive FSB MCP tools on the user's live browser), and states what it will not (edit files, run shell, fetch arbitrary URLs); a per-run confirm-to-continue toggle is on by default and can be disabled per-provider only via an explicit "trust this agent" setting — the copy never uses "faster mode" language.
  3. The side panel renders a live per-run streaming feed with distinct card types for `init` (client, model, session id, allowed tools), `tool-call` (name, args summary, tab id), `retry` (typed error class), and `result` (usage summary) driven by the normalized `AgentEvent` stream; a delegated run opens by default in a new background tab, and when the user activates the tab the agent is driving, a persistent "Take control" affordance appears that pauses the agent (v0.9.60 ownership release + supervisor grace hold), lets the user interact, and offers "Resume with agent" to give ownership back.
  4. A prominent Stop button in the side panel triggers `stopDelegatedTask`, routes to the supervisor's kill, and — on confirmed exit — releases every tab that was owned by the spawned agent (per v0.9.60 ownership) and reports "Agent stopped, N tab(s) released" in the feed; a post-run summary card displays tokens (in/out/total), turn count, wall-clock duration, cost bucket (`included in your subscription` for agent kind, real USD for api kind), and an expandable per-tool-call breakdown.
  5. Every progress event received from the supervisor is written to `chrome.storage.session` under a per-delegation key BEFORE it fans out to UI subscribers, so a mid-run MV3 service worker eviction reloads exactly the delivered feed on re-open — no ghost state, no fabricated events, no dropped events; the fifth `EXECUTION_MODES` entry works end-to-end across a forced SW eviction in a test fixture.
  6. While a delegation is active, the extension pings the bridge every 20 s over the existing WS heartbeat channel to keep the Chrome 116+ SW-lifetime extension applied; if 3 heartbeats are missed the side panel switches to a `daemon:disconnected` fallback that offers a doctor-relaunch button but does not attempt an in-extension restart; if `fsb-mcp-server serve` is not running when a delegated send is attempted, the side panel shows an "Agent offline" state with a deep-link to `fsb-mcp-server doctor` output and does not enqueue or optimistically show the message; if the daemon restarts while a delegation was mid-flight, the supervisor kills any surviving spawned CLI (never re-adopts) and reports `daemon_restart_lost_run` in the side panel so the user knows the run ended.
**Plans**: TBD
**UI hint**: yes

### Phase 62: CI Drift-Smoke Gate & Doctor Extensions
**Goal**: An `fsb-mcp-server doctor` operator and CI both catch adapter drift the moment an agent CLI ships a new flag or event-shape — with a machine-readable adapter compatibility matrix the extension consumes to render "supported / degraded / unsupported" states without hardcoding versions anywhere in extension source.
**Depends on**: Phase 60 (needs at least one adapter to run drift-smoke against; Phase 61 UX consumes the compatibility matrix for rendering degraded states)
**Requirements**: DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04
**Success Criteria** (what must be TRUE):
  1. A CI job runs each shipped adapter against a canned prompt fixture, asserts the known event-type sequence and the presence of required fields on `system/init` and `result`, and fails the build on unknown event types, missing required fields, or a `--version` outside the compatibility matrix — with no live CLI required (the recorded JSONL fixtures from Phases 60/64/65 suffice), so contributors without every CLI installed can still land safe changes.
  2. `fsb-mcp-server doctor` gains a per-adapter section reporting: binary path, version, auth state (parseable where the CLI exposes it), shared-secret presence, and the current spawn-secret rotation age — so an operator with only `doctor` output can identify which adapter failed and why.
  3. The diagnostics ring buffer classifies drift events as `agent_protocol_drift` with adapter id, expected vs observed fields, and rate-limits duplicate entries at the existing 1-per-10s bucket so a chatty drift does not blow the buffer.
  4. `doctor` emits a machine-readable adapter compatibility matrix that both the CI drift-smoke job and the extension can read; the extension consumes the matrix at boot (and on doctor refresh) to render `supported` / `degraded` / `unsupported` badges in the Providers panel — and never hardcodes CLI versions in extension source.
**Plans**: TBD

### Phase 63: Native-Messaging Host
**Goal**: When the user has installed the optional native-messaging host, the "Agent offline" state auto-attempts to wake `fsb-mcp-server serve` before falling back to the Phase 61 doctor deep-link — closing the UX cliff introduced by the extension having no `nativeMessaging` permission through Phases 57-62. All spawn authority stays inside the serve daemon behind Phase 59's CHAN gates; the native host itself never spawns agent CLIs.
**Depends on**: Phase 61 ("Agent offline → doctor" state must already exist for the wake to have a fallback), Phase 62 (doctor extensions already report daemon state)
**Requirements**: NATIVE-01, NATIVE-02, NATIVE-03, NATIVE-04
**Success Criteria** (what must be TRUE):
  1. `fsb-mcp-server install --native-host` writes the platform-appropriate native-messaging host manifest — macOS `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`, Linux `~/.config/google-chrome/NativeMessagingHosts/`, Windows registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\` — allowing the FSB extension id as the sole caller, and installs a host binary that can wake the daemon on demand.
  2. The extension's manifest gains a single additive `nativeMessaging` permission entry (no other permission changes); at boot the extension detects native-host presence, and when the host is installed, an "Agent offline" state auto-attempts a wake before showing the doctor deep-link — a user with the host installed sees the delegation come alive on demand instead of the manual `serve` prompt.
  3. The native host itself does NOT spawn agents; it only starts `fsb-mcp-server serve` (or attaches to a running one) and exits after handoff — all spawn authority remains inside the serve daemon behind the Phase 59 CHAN gates (Origin allowlist, shared secret, flag allowlist, argv-only) and no CHAN requirement is relaxed to accommodate the wake path.
  4. `fsb-mcp-server uninstall --native-host` cleanly removes the manifest, and `doctor` reports native-host install state including manifest path, allowlist mismatches, and host-binary reachability so an operator can debug wake failures without shell-level inspection.
**Plans**: TBD

### Phase 64: OpenCode Adapter
**Goal**: The `AgentProviderAdapter` contract proves it accommodates a second CLI family — one that supports both cold spawn AND attach-to-running-server (`opencode serve` + `opencode run --attach`) — without any Phase 60 rewrite; OpenCode joins the Providers panel with a pinned agent definition and CI-covered event schema so the drift gate covers it from day one.
**Depends on**: Phase 60 (contract), Phase 62 (drift-smoke gate must accept the new adapter fixture)
**Requirements**: MULTI-01, MULTI-02, MULTI-03
**Success Criteria** (what must be TRUE):
  1. An OpenCode adapter (`mcp/src/agent-providers/opencode.ts`) implements the `AgentProviderAdapter` contract with `caps.serverMode = true`; the supervisor either spawns `opencode run` cold OR attaches to a running `opencode serve` per the adapter's `buildSpawn` output — and the Phase 60 contract handles both without any hardcoded spawn-vs-attach branch outside the adapter.
  2. The OpenCode adapter ships a pinned agent definition (equivalent to Claude Code's `--agents fsb`) using OpenCode's `agent create` / `agents` config surface, keyed to a version pinned during phase spike, so tool boundaries and system-prompt intent are identical across the two adapters.
  3. A recorded OpenCode JSONL fixture under `tests/fixtures/agent-streams/opencode-<pinned-version>/` proves the adapter's event schema in CI without a live CLI; the Phase 62 drift-smoke job includes OpenCode from the first commit of this phase, and unknown event types raise `agent_protocol_drift` with the adapter id `opencode`.
  4. A user with OpenCode installed can pick "OpenCode" as their provider in the side panel and observe the delegation UX (streaming feed, kill switch that reclaims tabs, post-run summary, SW-eviction survival) work identically to Claude Code — with no adapter-specific side-panel branches.
**Plans**: TBD

### Phase 65: Codex Adapter
**Goal**: Task-mode delegation coverage extends to OpenAI Codex with correct auth-state disclosure (ChatGPT OAuth vs API key vs unauthenticated) so users know which billing bucket a run will hit before starting; `caps.chatMode: false` across all v0.9.91 adapters confirms task-mode-only scope for the milestone.
**Depends on**: Phase 60 (contract), Phase 62 (drift-smoke gate)
**Requirements**: MULTI-04, MULTI-05, MULTI-06
**Success Criteria** (what must be TRUE):
  1. A Codex adapter (`mcp/src/agent-providers/codex.ts`) implements the `AgentProviderAdapter` contract, invoking `codex exec --json` with the verified 0.142.5 flag set (`--ephemeral` + `--ignore-user-config` for hermeticity; the deprecated `--full-auto` is NEVER referenced in adapter source, protected by the CHAN-07 grep gate against `--auto`).
  2. The Codex adapter's `detect()` correctly identifies auth via ChatGPT OAuth, API key, or unauthenticated and surfaces the state in the Providers panel so the user knows which billing bucket a run will hit — with copy that reflects the specific detected auth state ("included in your ChatGPT Plus subscription" vs "billed to your API key" vs "sign in to codex first").
  3. A recorded Codex JSONL fixture pins the event schema in CI (under `tests/fixtures/agent-streams/codex-0.142.5/` or the phase-pinned version); the Phase 62 drift-smoke job includes Codex from the first commit of this phase, and the adapter's `caps()` correctly reports `chatMode: false` — matching the milestone-wide task-mode-only posture.
  4. A user with Codex installed can pick "Codex" as their provider and observe the same delegation UX as Claude Code and OpenCode with the correct per-auth-state cost copy, and the Providers panel's `agent`-kind cost row shows tokens / turns / duration + the auth-state-appropriate subscription caption rather than a fabricated dollar amount.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 57 → 58 → 59 → 60 → 61 → 62 → 63 → 64 → 65
Security-first hard rule: Phase 59 is code-green before Phase 60 spawn code lands, regardless of Phase 57/58 progress.

| Phase | Plans Complete | Status | Completed |
|-------|-----------------|--------|-----------|
| 57. Agent Identity Capture | 3/3 | Complete   | 2026-07-12 |
| 58. Providers Panel | 0/0 | Not started | — |
| 59. Reverse-Request Channel & Security Foundation | 0/0 | Not started | — |
| 60. Adapter Contract & Claude Code MVP | 0/0 | Not started | — |
| 61. Delegation UX & SW-Eviction Persistence | 0/0 | Not started | — |
| 62. CI Drift-Smoke Gate & Doctor Extensions | 0/0 | Not started | — |
| 63. Native-Messaging Host | 0/0 | Not started | — |
| 64. OpenCode Adapter | 0/0 | Not started | — |
| 65. Codex Adapter | 0/0 | Not started | — |

## Completed Milestones

<details>
<summary>v1.2.0 Showcase i18n Completeness — Phases 52-56, SHIPPED 2026-07-09</summary>

**Milestone Goal:** Close the translation gap that reopened after v0.9.63 shipped -- full, drift-free coverage across all six supported locales (en, es, de, ja, zh-CN, zh-TW) for every showcase marketing page plus the stats page, the long-deferred locale-cookie redirect bug, and a CI gate that catches future drift automatically.

**Phase summary:**

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 52 | Full-Page Translation Completeness Audit | 1/1 | Complete |
| 53 | Trans-Unit Resync, Stats Translation & Transcreation Review | 3/3 | Complete; VISUAL-01 human_needed |
| 54 | Stats Lint Gate Flip & Dashboard Boundary Documentation | 1/1 | Complete |
| 55 | CI Drift-Detection Gate | 1/1 | Complete |
| 56 | Locale-Cookie Redirect Fix (WARNING-02) | 1/1 | Complete |

Archive files:

- `.planning/milestones/v1.2.0-ROADMAP.md`
- `.planning/milestones/v1.2.0-REQUIREMENTS.md`
- `.planning/v1.2.0-MILESTONE-AUDIT.md`

Outcome: 13/13 v1.2.0 requirements satisfied; audit passed. Phase 52's audit established the true 5-drifted/54-orphaned baseline, superseding the milestone brief's original "247 trans-units" estimate. Phase 53 resynced the 5 drifted units + retired the stats-274 JSON artifacts + transcreated the 19 hero/CTA strings across 5 non-en locales. Phase 54 flipped `lint:i18n` to cover stats and documented the dashboard exclusion as permanent. Phase 55 landed `verify-translation-drift.mjs` as a hard-fail CI gate on a clean drift-free baseline. Phase 56 fixed WARNING-02's picker-cookie short-circuit on the bare-`/` Accept-Language redirect. VISUAL-01 browser UAT remains `human_needed` (`53-VISUAL-QA.md`).

</details>

<details>
<summary>v1.1.0 T1 App Execution Expansion — Phases 44-51, SHIPPED 2026-06-30</summary>

**Hard invariants (v1.1.0):**

- Kept the two-tool MCP surface: `search_capabilities` and `invoke_capability`; no one tool per app.
- Preserved MV3 Wall 1: descriptors and recipes are closed-vocabulary data; no OpenTabs runtime/plugin code ships.
- Preserved Wall 2 unless explicitly extended by a verified Pattern-D design: credentialed execution stays origin-pinned and same-session.
- Writes and destructive actions stayed fail-closed until live request shape, consent behavior, and no-secret logging were proven.
- Denylisted origins remained blocked; sensitive origins stayed flagged/audited under the existing invoke/discovery consent semantics.
- Search distinguished "directly invocable T1" from "discovery-pending DOM/T2."

### Phase 44: T1 Readiness Inventory + Status Surface
**Goal:** Create the authoritative T1 readiness matrix for all 2,314 descriptors and make status visible to developers and users so "catalog supported" is never confused with "direct API-ready."
**Requirements:** T1R-01, T1R-02, T1R-03.
**Plans:**
- [x] 44-01: T1 readiness matrix generator and evidence report.
- [x] 44-02: Status-surface and documentation honesty pass.
- [x] 44-03: T1 readiness CI guard and phase closeout.

### Phase 45: T1 Porting Scaffold + Handler Contract Hardening
**Goal:** Build the reusable test and implementation scaffold for app ports so each new T1 handler has origin-pin, logged-out guard, shape guard, no-secret logging, consent classification, and byte-stable fallback behavior by default.
**Requirements:** T1R-04, T1R-05, T1R-09.
**Plans:**
- [x] 45-01: Port contract library and scaffold CLI.
- [x] 45-02: Current-catalog contract verifier.
- [x] 45-03: Documentation and phase closeout.

### Phase 46: Same-Origin Read Ports — First High-Value Batch
**Goal:** Convert a first batch of high-value read descriptors from T3 to executable T1 where the app's authenticated web runtime uses same-origin APIs and can be proven without weakening Wall 2.
**Requirements:** T1R-06.
**Plans:**
- [x] 46-01: Candidate selection and Netlify/Bitbucket/CircleCI handler ports.
- [x] 46-02: Catalog wiring, search readiness, and same-origin classifier gates.
- [x] 46-03: Verification, UAT notes, and phase closeout.

### Phase 47: Pattern-D + GAPI Bridge Architecture
**Goal:** Design and prove the missing architecture for apps whose useful APIs are separate-origin, per-org-subdomain, or page-bridge mediated, without breaking the active-tab credential boundary.
**Requirements:** T1R-07, T1R-08.
**Plans:**
- [x] 47-01: Pattern-D decision for separate-origin and per-org APIs.
- [x] 47-02: GAPI bridge decision for Google Workspace APIs.
- [x] 47-03: CI gate, negative controls, and closeout.

### Phase 48: High-Value Read Ports — Second Batch
**Goal:** Use the Phase 47 outcome to port another batch of read descriptors, including Pattern-D/GAPI candidates if the architecture is proven.
**Requirements:** T1R-06, T1R-07, T1R-08.
**Plans:**
- [x] 48-01: Vercel same-origin read head.
- [x] 48-02: CircleCI same-origin read expansion.
- [x] 48-03: Gate, search, and readiness-report closeout.

### Phase 49: Guarded Writes Activation Pipeline
**Goal:** Turn fail-closed write/destructive candidates into executable T1 only after live mutation-body capture, consent gate verification, and redacted audit proof.
**Requirements:** T1R-10, T1R-11.
**Plans:**
- [x] 49-01: Write activation evidence ledger.
- [x] 49-02: Evidence verifier and validation gate.
- [x] 49-03: Live-UAT template and closeout decision.

### Phase 50: T1 Expansion Gate + Next-Batch Plan
**Goal:** Close the milestone with an honest T1 coverage gate, full regression suite, and a prioritized backlog for the remaining 2,288-descendant tail.
**Requirements:** T1R-12.
**Plans:**
- [x] 50-01: Regenerate readiness evidence and closeout counts.
- [x] 50-02: Full regression gate.
- [x] 50-03: Next-batch backlog and milestone closeout.

### Phase 51: Full T1 Tail Migration Across Remaining Catalog
**Goal:** Convert the Phase 51 catalog-tail descriptors to explicit terminal states: executable T1/T1b where safe and technically provable, guarded fail-closed where write/destructive UAT is still required, or blocked where denylist/product/legal policy says no.
**Requirements:** T1ALL-01, T1ALL-02, T1ALL-03, T1ALL-04, T1ALL-05.
**Plans:**
- [x] 51-01: Full-tail worklist generator, acceptance gate, and batch scheduler.
- [x] 51-02: Existing-head and low-risk same-origin read bulk port.
- [x] 51-03: Retool CSRF same-origin read head.
- [x] 51-04: Asana same-origin Pattern-D carveout.
- [x] 51-05: Pattern-D and GAPI bridge implementation waves.
- [x] 51-06: Sensitive consumer/social and blocked-policy triage.
- [x] 51-07: Write/destructive live-UAT activation waves.
- [x] 51-08: Final all-tail regression, UAT ledger, and closeout.

Archive files:

- `.planning/milestones/v1.1.0-ROADMAP.md`
- `.planning/milestones/v1.1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.1.0-MILESTONE-AUDIT.md`

Outcome: v1.1.0 expanded proven direct execution from the v1.0.0 baseline into verified T1-ready read coverage across Netlify, Bitbucket, CircleCI, Vercel, Retool, Asana, and generated same-origin reads, with post-closeout ports reflected in the refreshed artifacts. Phase 51 closes the remaining catalog tail honestly: 1,267 rows are executable T1-ready, 556 rows are guarded fail-closed, and the remaining 491 descriptors are explicitly surfaced as bridge-needed, UAT-needed, blocked-policy, or degraded/discovery-pending rather than overclaimed.

</details>

<details>
<summary>v1.0.0 Full App Catalog (OpenTabs Parity) — Phases 35-43, SHIPPED 2026-06-29</summary>

Archive files:

- `.planning/milestones/v1.0.0-ROADMAP.md`
- `.planning/milestones/v1.0.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v1.0.0-phases/`

Outcome: full OpenTabs-derived catalog/search/discovery surface shipped with 2,314 descriptors across 128 app stems / 129 services. The milestone deliberately fed the existing tier model rather than hand-porting every action: 26 descriptors resolve to T1/T1b today, 5 guarded writes remain fail-closed, and 2,288 descriptors remain T3 DOM/discovery-tail. Full milestone audit passed; non-blocking live UAT and T1 expansion debt are carried forward.

</details>

<details>
<summary>v0.9.99 Native Capability Catalog (FSB API Execution) — Phases 26-34, CODE-COMPLETE 2026-06-23</summary>

Gave FSB first-class authenticated-API execution as a fast path alongside DOM automation, between Wall 1 (closed-vocabulary recipe DATA bound by a fixed interpreter) and Wall 2 (MAIN-world authenticated fetch). Full `npm test` EXIT 0; live-browser UAT debt (UAT-27/29/30/31/32-01) carried forward. The v1.0.0 milestone extends this substrate verbatim.

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 26 | Recipe Schema + Bundled Interpreter + MV3 CI Guard | 3/3 | Complete |
| 27 | Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar | 3/3 | Complete; live FETCH-05 UAT human_needed |
| 28 | Lean MCP Surface + Capability Search + Eval Harness | 4/4 | Complete |
| 29 | Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | 5/5 | Complete; live-capture UAT human_needed |
| 30 | Consent Governance + Recipe Signature Verification + Audit + Legal Posture | 4/4 | Complete; live smoke human_needed |
| 31 | Network-Capture Discovery + Recipe Synthesis + Learned Recipes | 6/6 | Complete; live UAT human_needed |
| 32 | Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | 5/5 | Complete; live self-heal UAT human_needed |
| 33 | PhantomStream Media Mirroring (0.2.1 Uptake) — milestone extension | 1/1 | Complete; live media UAT human_needed |
| 34 | Explicit File Upload Tool (upload_file) — milestone extension | 1/1 | Complete; live upload UAT human_needed |

Substrate carried into v1.0.0 (FIXED — do not redesign): tiers T0/T1a/T1b/T2-learned/T3-DOM; the closed-vocab interpreter; the consent gate (opt-out Auto default, denylist = the ONE hard floor); the 2 out-of-`TOOL_REGISTRY` MCP tools; `capability-catalog.js resolve()` / `capability-router.js invoke()` / `capability-search.js buildIndex()`; `scripts/package-extension.mjs readJsonDir` + the generated `recipe-index.generated.js` IIFE; the `github.js` T1a hand-port contract; `service-denylist.js` loader; `network-capture.js` discovery path; `verify-recipe-path-guard.mjs` Wall-1 guard.

</details>

<details>
<summary>v0.12.0 PhantomStream Package Migration — Phases 21-25, COMPLETED 2026-06-17</summary>

Archive files:

- `.planning/milestones/v0.12.0-ROADMAP.md`
- `.planning/milestones/v0.12.0-REQUIREMENTS.md`
- `.planning/milestones/v0.12.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.12.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 21 | Package Intake & Contract Mapping | 3/3 | Complete |
| 22 | Capture Adapter Migration | 4/4 | Complete |
| 23 | Dashboard Renderer Migration | 4/4 | Complete |
| 24 | Transport, Relay & Remote Control Integration | 4/4 | Complete |
| 25 | Parity Removal, Docs & Browser UAT | 4/4 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live Chrome-extension dashboard preview and remote-control UAT remains `human_needed`; see `.planning/milestones/v0.12.0-phases/25-parity-removal-docs-browser-uat/25-HUMAN-UAT.md`.

</details>

<details>
<summary>v0.11.0 Trigger Tool (Reactive DOM Monitoring) — Phases 14-20, COMPLETED 2026-06-17</summary>

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 14 | Trigger Survivability Foundation | 3/3 | Complete |
| 15 | Fire-Condition Engine & Value Extraction | 3/3 | Complete |
| 16 | Live-Observe Watch & Analyzing Pulse | 4/4 | Complete |
| 17 | Refresh-Poll Watch (Tab-Owning Background Reload) | 4/4 | Complete |
| 18 | Shared Tool Registry & Dispatcher Wiring | 4/4 | Complete |
| 19 | MCP Tools & Blocking/Detached Reporting | 3/3 | Complete |
| 20 | Integration, Cap UI, Docs & Edge Cases | 5/5 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live-browser/composed trigger UAT remains `human_needed`; publish/tag/release actions remain user-gated.

</details>

<details>
<summary>v0.10.0 Autopilot via Lattice SDK (Phases 01-13) — SHIPPED 2026-06-15</summary>

Archive files:

- `.planning/milestones/v0.10.0-ROADMAP.md`
- `.planning/milestones/v0.10.0-REQUIREMENTS.md`
- `.planning/milestones/v0.10.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.10.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 01 | Lattice SDK gap survey + integration scaffolding | 2/2 | Complete |
| 02 | Lattice tripwire + receipt primitives extension | 5/5 | Complete |
| 03 | Observability + step-markers extension | 3/3 | Complete |
| 04 | Provider adapter alignment | 5/5 | Complete |
| 05 | MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host | 6/6 | Complete |
| 06 | FSB engine consumes Lattice provider abstraction | 7/7 | Complete |
| 07 | Archive FSB custom provider stack | 4/4 | Complete |
| 08 | FSB agent brain on Lattice runtime | 3/3 | Complete |
| 09 | FSB SurvivabilityAdapter activated for MV3 SW eviction resumption | 3/3 | Complete |
| 10 | MCP-philosophy parity for autopilot driver | 3/3 | Complete |
| 11 | Tab-aware side panel surface | 5/5 | Complete |
| 12 | Side panel follows automation | 5/5 | Complete |
| 13 | Public Lattice package integration | 1/1 | Complete |

Known deferred closeout evidence: 11 human-gated Chrome MV3/UAT verification items were acknowledged at close. See `.planning/STATE.md` `## Deferred Items`.

</details>

## Carry-Forward Candidates

- **v0.9.91 v2 deferred (see REQUIREMENTS.md):** CHAT-FUTURE-01/02 (chat-mode continuity via `--resume` / `codex resume` / `opencode --continue` + per-thread cwd pinning); GEMINI-FUTURE-01 (Gemini CLI adapter after live `--help` capture + JSONL schema pinning); ACP-FUTURE-01 (`@zed-industries/agent-client-protocol` unification once ≥2 non-Claude adapters have shipped); REMOTE-FUTURE-01 (remote/mobile delegation surfaces — v0.9.91 is explicitly localhost-only).
- **Consolidated Chrome MV3 UAT debt:** Run and capture archived v0.10/v0.11/v0.12 + v0.9.99 (UAT-27/29/30/31/32-01) browser evidence if release policy requires post-close proof. Does NOT block v0.9.91.
- **v1.2.0 v2 deferred:** QA-01 (native-speaker/bilingual QA pass), I18N-FUTURE-01 (migrate stats page off ad hoc JSON mechanism into main XLIFF pipeline), I18N-FUTURE-02 (full automated per-locale visual regression pipeline), I18N-FUTURE-03 (translation-freshness/"last synced" reporting surface).
- **v2 deferred capability families (acknowledged, out of v1.0.0/v1.1.0):** GAPI-01 (gapi-bridge handler family for Google Workspace); CLOUD-01 (cloud-console Pattern-D ports); UATX-01 (per-app live guarded-write UAT closeout).
- **Delegation primitive (Lattice-owned):** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces after v0.9.91 stabilizes the adapter contract.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
