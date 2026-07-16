# Requirements: FSB (Full Self-Browsing)

**Defined:** 2026-07-11
**Core Value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely.
**Milestone:** v0.9.91 MCP Clients as Providers

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### IDENT -- Agent Identity Capture

- [x] **IDENT-01**: When the user clicks a copy-to-clipboard button on the onboarding MCP-install screen for a specific client (`claude-code`, `cursor`, `vscode`, `windsurf`, `codex`, `opencode`, `openclaw`, `claude-desktop`, `all`), FSB records that client id (with timestamp, deduplicated, all-clients aggregated for multi-select cases) into a durable `fsbAgentProviders.clicked` list in `chrome.storage.local`.
- [x] **IDENT-02**: When an MCP client completes its `initialize` handshake with `fsb-mcp-server` (over any transport: stdio, streamable-HTTP, or the ws://7225 bridge), FSB captures the caller's `clientInfo.name` and `clientInfo.version` and threads them to the extension via an additive field on the existing `agent:register` bridge payload without breaking any existing consumer of that payload (INV-01).
- [x] **IDENT-03**: The extension's agent registry stamps captured `clientInfo` onto each live `AgentRecord` and rolls the identity up into a durable `fsbAgentProviders.connected` entry that survives service-worker eviction and Chrome restart, keyed so re-connections update rather than duplicate.
- [x] **IDENT-04**: `fsb-mcp-server` can enumerate installed MCP-capable clients on the current machine by inspecting the paths already known to `platforms.ts` (per-OS `configPath` for file-mode clients; `<bin> --version` probe for cli-mode `claude-code`) and report each as `installed` / `not-installed` with any parseable version.
- [x] **IDENT-05**: A `getMcpClients` extension runtime message returns a merged view (`clicked` ∪ `installed` ∪ `connected`) with per-client status, so UI surfaces read one consistent structure instead of assembling it themselves.

### PROV -- Providers Panel

- [x] **PROV-01**: The control panel section formerly labeled "API Configuration" is labeled "Providers" (heading, nav label, and any anchor `#api-config` continues to work as a redirect to the new `#providers` anchor for existing bookmarks).
- [x] **PROV-02**: Each provider has an explicit `providerKind` value of either `api` (the existing 7 BYOK LLM providers) or `agent` (a locally installed agent CLI); the kind determines which fields render.
- [x] **PROV-03**: When an `agent`-kind provider is selected, the API-key input, key-URL hint, and per-model key-format hint are hidden; the panel shows instead the provider's install status, auth status (from the CLI's own login state where surfaceable), connection status, and a short "uses your subscription -- no API key needed" caption.
- [x] **PROV-04**: When the user has both an active `agent` provider selection and a valid BYOK key for an `api` provider, `universal-provider.js` continues to see only `api`-kind provider values; the two selections do not collide, and switching between them preserves the other's configuration (INV-03 provider parity for the BYOK side).
- [x] **PROV-05**: The panel visually marks exactly one provider as "Recommended" per session, chosen by a ground-truth cascade: highest-priority = a provider whose CLI is currently connected via MCP `initialize`, next = a provider whose CLI is installed on disk, next = a provider whose copy button the user clicked during onboarding, fallback = the current xAI-default recommendation. The panel never auto-switches the user's selection; the badge is advisory only.
- [x] **PROV-06**: Cost/usage rows for `agent`-kind providers never display fabricated dollar amounts; they display token count, turn count, and duration and label the run as "included in your subscription", with a link to the vendor's current billing page (copy must not promise "free" or "unlimited").

### CHAN -- Delegation Channel & Security Foundation

- [x] **CHAN-01**: A new bridge message-type family (`ext:request` / `ext:response` / `ext:event`) transports extension→daemon reverse requests over the existing ws://localhost:7225 bridge without changing the byte-shape of any existing `MCPMessageType` value (INV-01 additive proof).
- [x] **CHAN-02**: A relay process signals its ability to fulfill spawn requests by advertising `capabilities: ['agent-spawn']` in its `relay:hello`; the hub routes each `ext:request` locally (if itself the daemon) or to the first relay advertising the required capability.
- [x] **CHAN-03**: The bridge rejects every incoming `ext:*` frame whose WebSocket upgrade did not carry an `Origin` header matching a durable per-install FSB-extension-id allowlist and whose `Host` header is not exactly `127.0.0.1` (or `localhost`) at the loopback port.
- [x] **CHAN-04**: A per-install >=32-byte shared secret is provisioned once between the extension and the daemon, transported only in the `Sec-WebSocket-Protocol` upgrade header (never in URL, never in payloads, never in logs), rotated on daemon restart, and required on every `ext:*` frame.
- [x] **CHAN-05**: `redactForLog` and diagnostic ring-buffer writes strip any string matching the shared-secret token pattern; the drift gate fails the build if a raw secret substring appears in any tracked log fixture.
- [x] **CHAN-06**: The bridge topology test suite covers hub-exit-mid-delegation and relay-mid-`ext:*`-frame scenarios; existing hub-exit-promotion tests still pass byte-for-byte.
- [x] **CHAN-07**: A permanent CI grep gate fails the build if the strings `--dangerously-skip-permissions`, `--yolo`, or `--auto` appear anywhere in `mcp/src/agent-providers/**`, so those flags can never enter the spawn path in any future patch.

### ADAPT -- Adapter Contract & Spawn Supervisor

- [x] **ADAPT-01**: An `AgentProviderAdapter` TypeScript interface in `mcp/src/agent-providers/` defines exactly five methods: `detect() -> {installed, version, authState, binary}`, `buildSpawn(task, ctx) -> SpawnSpec`, `parseEvents(stream) -> AsyncIterable<AgentEvent>`, `kill(child, {grace}) -> Promise<void>`, and `caps() -> AdapterCapabilities`.
- [x] **ADAPT-02**: A `SpawnSupervisor` module living in the `fsb-mcp-server serve` daemon accepts a validated spawn request, looks up the requested adapter, constructs argv from adapter output plus a daemon-controlled flag allowlist (unknown payload keys rejected), and spawns the child with `{ detached: true, windowsHide: true, stdio: ['pipe','pipe','pipe'] }` and an environment with `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY` scrubbed.
- [x] **ADAPT-03**: The supervisor never invokes a shell; the user's prompt travels only via `child.stdin` (never argv, never `sh -c`) so shell metacharacters and Windows `.cmd`-shim EINVAL (Node CVE-2024-27980) cannot execute.
- [x] **ADAPT-04**: A `stop`/cancel request triggers SIGTERM at the process-group level (POSIX `process.kill(-child.pid, 'SIGTERM')` after `spawn({detached:true})`, Windows `taskkill /pid <pid> /T /F`), escalates to SIGKILL after a grace window, and blocks resolving the delegation until either an exit-signal is observed or the daemon confirms no descendant matches remain.
- [x] **ADAPT-05**: On daemon startup, the supervisor scans for orphaned children matching prior adapter fingerprints and kills them before accepting new spawn requests (recovery from crash).

### CLAUDE -- Claude Code MVP

- [x] **CLAUDE-01**: The Claude Code adapter spawns `claude -p --verbose --output-format stream-json --include-partial-messages --strict-mcp-config --mcp-config <daemon-generated-file-pointing-at-loopback-mcp-http-endpoint> --agents <shipped-fsb-agent-json> --agent fsb --permission-mode dontAsk --allowedTools "mcp__fsb" --disallowedTools "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch" --max-turns 40 --no-session-persistence`, or the version-appropriate equivalent selected by `detect()` output.
- [x] **CLAUDE-02**: The user's task prompt is sent to the spawned CLI via stdin only; the adapter constructs no argv fragment containing user-supplied text.
- [x] **CLAUDE-03**: The adapter's `parseEvents` translates the CLI's stream-json events (`system/init`, `assistant`, `user`, tool-use events, `system/api_retry`, `result`) into a normalized `AgentEvent` schema (`type`, `sessionId`, `payload`), fails loud on unknown event types (surfaced as `agent_protocol_drift` diagnostic), and is covered by a recorded JSONL fixture under `tests/fixtures/agent-streams/claude-code-2.1.177/` so CI runs without a live CLI.
- [x] **CLAUDE-04**: The Claude Code adapter's `detect()` fingerprints the binary via `claude --version`, compares against a minimum supported version, and reports `installed=false` with a doctor-diagnostic message rather than spawning if the version predates the verified stream-json contract.

### UX -- Delegation UX

- [x] **UX-01**: A fifth entry `delegated` in `EXECUTION_MODES` (`extension/ai/engine-config.js`) defines: `uiFeedbackChannel: 'popup-sidepanel'`, `animatedHighlights: true`, `safetyLimits: { wallClockMs, eventSilenceMs }` (no iteration cap -- the loop runs in the spawned CLI, not `runAgentLoop`), and is selected when the active provider is `agent`-kind.
- [x] **UX-02**: The side panel renders a live per-run streaming feed with distinct card types for init (client, model, session id, allowed tools), tool-call (name, args summary, tab id), retry (typed error class), and result (usage summary), driven by the normalized `AgentEvent` stream.
- [x] **UX-03**: Before FSB spawns any agent CLI for the first time, the user sees an explicit consent card that names the CLI, what it will be permitted to do (drive the FSB MCP tools on the user's live browser), and what it will not be permitted to do (edit files, run shell, fetch arbitrary URLs). A per-run confirm-to-continue toggle is on by default and can be disabled per provider only via an explicit "trust this agent" setting.
- [x] **UX-04**: A prominent Stop button in the side panel triggers `stopDelegatedTask`, which routes to the supervisor's kill and, on confirmed exit, releases every tab that was owned by the spawned agent (per v0.9.60 ownership) and reports "Agent stopped, N tab(s) released" in the feed.
- [x] **UX-05**: A delegated run opens by default in a new background tab; when the user activates the tab that the agent is driving, a persistent "Take control" affordance appears; clicking it pauses the agent (v0.9.60 ownership release + supervisor grace hold), lets the user interact, and offers "Resume with agent" to give ownership back.
- [x] **UX-06**: A post-run summary card displays tokens (in/out/total), turn count, wall-clock duration, cost bucket (`included in your subscription` for agent kind; real USD for api kind), and a per-tool-call breakdown, expandable to the full tool-call log for the run.

### LIFE -- Lifecycle & Persistence

- [x] **LIFE-01**: Every progress event received from the supervisor is written to `chrome.storage.session` under a per-delegation key before it fans out to UI subscribers, so a MV3 service worker eviction mid-run reloads exactly the delivered feed on re-open.
- [x] **LIFE-02**: While a delegation is active, the extension pings the bridge every 20 s over the existing WS heartbeat channel to keep the Chrome 116+ SW-lifetime extension applied; if 3 heartbeats are missed the extension shows a `daemon:disconnected` fallback that offers a doctor-relaunch button but does not attempt an in-extension restart.
- [x] **LIFE-03**: If `fsb-mcp-server serve` is not running when a delegated send is attempted, the side panel shows an "Agent offline" state with a deep-link to `fsb-mcp-server doctor` output and does not enqueue or optimistically show the message.
- [x] **LIFE-04**: On daemon restart while a delegation was mid-flight, the supervisor does not re-adopt any surviving spawned CLI; it kills it (LIFE-04 restart-is-clean) and reports `daemon_restart_lost_run` in the side panel so the user knows the run ended.

### DRIFT -- CI Drift-Smoke Gate & Doctor Extensions

- [x] **DRIFT-01**: A CI job runs each shipped adapter against a canned prompt fixture, asserts a known event-type sequence and the presence of required fields on `system/init` and `result`, and fails the build on unknown event types, missing fields, or a `--version` outside the compatibility matrix.
- [x] **DRIFT-02**: `fsb-mcp-server doctor` gains a per-adapter section reporting: binary path, version, auth state (parseable where the CLI exposes it), shared-secret presence, and the current spawn-secret rotation age.
- [x] **DRIFT-03**: The diagnostics ring buffer classifies drift events as `agent_protocol_drift` (with adapter id, expected vs observed) and rate-limits duplicate entries at the existing 1-per-10s bucket.
- [x] **DRIFT-04**: The `doctor` output includes a machine-readable adapter compatibility matrix that both CI and the extension can read to render "supported / degraded / unsupported" states without hardcoding versions in extension code.

### NATIVE -- Native-Messaging Host

- [ ] **NATIVE-01**: `fsb-mcp-server install --native-host` writes the platform-appropriate native-messaging host manifest (macOS `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`, Linux `~/.config/google-chrome/NativeMessagingHosts/`, Windows registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\`), allowing the FSB extension id as the sole caller, and installs a host binary that wakes the daemon on demand.
- [ ] **NATIVE-02**: The extension's manifest gains a `nativeMessaging` permission entry (additive, no other permission changes), and the extension detects native-host presence at boot; when present, an "Agent offline" state auto-attempts a wake before showing the doctor deep-link.
- [ ] **NATIVE-03**: The native host itself does not spawn agents; it only starts `fsb-mcp-server serve` (or attaches to a running one) and exits after handoff. All spawn authority remains inside the `serve` daemon behind the CHAN gates.
- [ ] **NATIVE-04**: `fsb-mcp-server uninstall --native-host` removes the manifest, and `doctor` reports native-host install state including manifest path and any Chrome allowlist mismatch.

### MULTI -- Additional Adapters

- [ ] **MULTI-01**: An OpenCode adapter (`mcp/src/agent-providers/opencode.ts`) implements the `AgentProviderAdapter` contract with `caps.serverMode=true`; the supervisor either spawns `opencode run` cold or attaches to a running `opencode serve` per the adapter's `buildSpawn` output (contract-stresser: the ADAPT contract must accommodate both spawn and attach without hardcoding).
- [ ] **MULTI-02**: The OpenCode adapter ships a pinned agent definition (equivalent to Claude Code's `--agents fsb`) using OpenCode's `agent create` / `agents` config surface, keyed to a version pinned during phase spike.
- [ ] **MULTI-03**: A recorded OpenCode JSONL fixture under `tests/fixtures/agent-streams/opencode-1.14.25/` (or the latest pinned version) proves the adapter's event schema in CI without a live CLI.
- [ ] **MULTI-04**: A Codex adapter (`mcp/src/agent-providers/codex.ts`) implements the `AgentProviderAdapter` contract, invoking `codex exec --json` with the current-verified flag set (v0.142.5 as baseline: use `--ephemeral` + `--ignore-user-config` for hermeticity; do not use the deprecated `--full-auto`).
- [ ] **MULTI-05**: The Codex adapter's `detect()` correctly identifies auth via ChatGPT OAuth vs API key vs unauthenticated and surfaces the state in the provider panel so the user knows which billing bucket a run will hit.
- [ ] **MULTI-06**: A recorded Codex JSONL fixture pins the event schema in CI, and the adapter's `caps()` correctly reports `chatMode: false` for v0.9.91 (task-mode only across all adapters).

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Chat-Mode Continuity

- **CHAT-FUTURE-01**: Adapters expose `caps.chatMode: true` and the side panel maps a chat thread to `--resume <session-id>` (Claude Code) / `codex resume` / `gemini --resume` / `opencode --continue` per adapter.
- **CHAT-FUTURE-02**: The daemon pins per-thread working directory so `claude --resume` finds its history.

### Gemini CLI Adapter

- **GEMINI-FUTURE-01**: Gemini CLI adapter after a live `--help` capture and JSONL schema pinning (v0.9.91 lacked a local binary to verify against).

### Broader Agent Ecosystem

- **ACP-FUTURE-01**: ACP-based adapter unification (`@zed-industries/agent-client-protocol`) once ≥2 non-Claude adapters have shipped and proven the contract shape.
- **REMOTE-FUTURE-01**: Remote/mobile delegation surfaces (Happy-style approval flows) -- explicitly localhost-only in v0.9.91.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Embedding `@anthropic-ai/claude-agent-sdk` in FSB | Anthropic policy prohibits third-party products from using consumer subscription auth via the SDK (enforcement Apr 4 2026); shelling to the user's installed `claude` binary is the only compliant "no API key" path. |
| Proxying / spoofing subscription OAuth tokens | Banned outright by Anthropic Apr 4 2026; would be product-killing regardless of technical feasibility. |
| Bundling / silent-installing agent CLIs | Wrong shape for a Chrome extension + npm daemon; would violate Chrome Web Store distribution rules and add attack surface. |
| PTY / TUI screen-scraping of agent CLIs | Structured headless interfaces exist for all four target CLIs; scraping is a maintenance sinkhole. |
| Any `--dangerously-skip-permissions` / `--yolo` / `--auto` flag in the spawn path | 1-click RCE for any prompt-injection incident; CHAN-07 grep gate makes this a permanent invariant. |
| Fabricated dollar costs on subscription-backed runs | Cline established the $0.00 convention; PROV-06 codifies it. |
| Auto-switching the user's provider when a "better" agent appears | Advisory badge only (PROV-05); user consent is the load-bearing property. |
| Forcing users away from BYOK when an agent is available | INV-03 provider parity carries forward; BYOK stays first-class. |
| `Firefox` support | Deferred at project level; MV3 nativeMessaging in NATIVE requirements is Chrome-specific for v0.9.91. |
| Native host that itself spawns agent CLIs | NATIVE-03 explicitly forbids this; all spawn authority lives inside the serve daemon behind CHAN gates. |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDENT-01 | Phase 57 | Complete |
| IDENT-02 | Phase 57 | Complete |
| IDENT-03 | Phase 57 | Complete |
| IDENT-04 | Phase 57 | Complete |
| IDENT-05 | Phase 57 | Complete |
| PROV-01 | Phase 58 | Complete |
| PROV-02 | Phase 58 | Complete |
| PROV-03 | Phase 58 | Complete |
| PROV-04 | Phase 58 | Complete |
| PROV-05 | Phase 58 | Complete |
| PROV-06 | Phase 58 | Complete |
| CHAN-01 | Phase 59 | Complete |
| CHAN-02 | Phase 59 | Complete |
| CHAN-03 | Phase 59 | Complete |
| CHAN-04 | Phase 59 | Complete |
| CHAN-05 | Phase 59 | Complete |
| CHAN-06 | Phase 59 | Complete |
| CHAN-07 | Phase 59 | Complete |
| ADAPT-01 | Phase 60 | Complete |
| ADAPT-02 | Phase 60 | Complete |
| ADAPT-03 | Phase 60 | Complete |
| ADAPT-04 | Phase 60 | Complete |
| ADAPT-05 | Phase 60 | Complete |
| CLAUDE-01 | Phase 60 | Complete |
| CLAUDE-02 | Phase 60 | Complete |
| CLAUDE-03 | Phase 60 | Complete |
| CLAUDE-04 | Phase 60 | Complete |
| UX-01 | Phase 61 | Complete |
| UX-02 | Phase 61 | Complete |
| UX-03 | Phase 61 | Complete |
| UX-04 | Phase 61 | Complete |
| UX-05 | Phase 61 | Complete |
| UX-06 | Phase 61 | Complete |
| LIFE-01 | Phase 61 | Complete |
| LIFE-02 | Phase 61 | Complete |
| LIFE-03 | Phase 61 | Complete |
| LIFE-04 | Phase 61 | Complete |
| DRIFT-01 | Phase 62 | Complete |
| DRIFT-02 | Phase 62 | Complete |
| DRIFT-03 | Phase 62 | Complete |
| DRIFT-04 | Phase 62 | Complete |
| NATIVE-01 | Phase 63 | Pending |
| NATIVE-02 | Phase 63 | Pending |
| NATIVE-03 | Phase 63 | Pending |
| NATIVE-04 | Phase 63 | Pending |
| MULTI-01 | Phase 64 | Pending |
| MULTI-02 | Phase 64 | Pending |
| MULTI-03 | Phase 64 | Pending |
| MULTI-04 | Phase 65 | Pending |
| MULTI-05 | Phase 65 | Pending |
| MULTI-06 | Phase 65 | Pending |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51 / 51 (100%)
- Unmapped: 0

**Phase distribution:**
- Phase 57 (IDENT): 5 requirements
- Phase 58 (PROV): 6 requirements
- Phase 59 (CHAN): 7 requirements
- Phase 60 (ADAPT + CLAUDE): 9 requirements
- Phase 61 (UX + LIFE): 10 requirements
- Phase 62 (DRIFT): 4 requirements
- Phase 63 (NATIVE): 4 requirements
- Phase 64 (MULTI-OpenCode): 3 requirements
- Phase 65 (MULTI-Codex): 3 requirements

---
*Requirements defined: 2026-07-11*
*Last updated: 2026-07-16 after Phase 62 completion (41/51 requirements complete; all live checks deferred to milestone end)*
