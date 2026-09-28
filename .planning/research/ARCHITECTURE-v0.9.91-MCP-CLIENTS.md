# Architecture Research: v0.9.91 MCP Clients as Providers

**Domain:** Chrome MV3 extension + local MCP server ecosystem — installed agent CLIs as first-class side-panel providers
**Milestone:** v0.9.91 — SUBSEQUENT milestone; maps four features onto the existing FSB architecture (extension SW + ws://7225 hub/relay bridge + fsb-mcp-server stdio/serve). Existing architecture is mapped, not redesigned.
**Researched:** 2026-07-10
**Confidence:** HIGH (every integration point verified against source at file:line; SDK `getClientVersion` verified via Context7; spawned-CLI flag surface is MEDIUM-LOW — see Open Questions)

> Canonical-path note: per this directory's convention (see the header of `ARCHITECTURE-v1.2.0-SHOWCASE-I18N.md`), this document replaces the prior milestone's content at the canonical `ARCHITECTURE.md` path. The superseded v1.2.0 research is preserved at `ARCHITECTURE-v1.2.0-SHOWCASE-I18N.md`.

This is a brownfield integration map answering: (a) exact seams per feature, (b) new components, (c) data flows, (d) build order, (e) which process owns spawning, (f) delegation coexistence with the extension's own agent loop.

---

## 1. Existing System Overview (verified)

```
+------------------------------ Chrome (MV3) -------------------------------+
|  Side panel (ui/sidepanel.js)      Control panel (ui/options.js +         |
|   startAutomation/stopAutomation     control_panel.html "API Config")     |
|   runtime msgs :1506/:1558           modelProvider select :146/:157       |
|          |                                    |                           |
|          v                                    v                           |
|  background.js service worker -- fsbHandleRuntimeMessage :7610            |
|   handleStartAutomation :8912 --> agent-loop.js runAgentLoop :1180        |
|   handleStopAutomation  :9559     (BYOK via universal-provider.js)        |
|   fsbAgentRegistryInstance (utils/agent-registry.js, global export :1468) |
|          ^                                                                |
|          | dispatchMcpMessageRoute / dispatchMcpToolRoute                 |
|  ws/mcp-bridge-client.js <---- ws://localhost:7225 ----+                  |
|   (_connectionId minted at onopen :127;                |                  |
|    routes agent:register et al :391-415)               |                  |
+--------------------------------------------------------+------------------+
                                                          |
        +--------------------- Node processes ------------+----------------+
        |  WebSocketBridge (mcp/src/bridge.ts)                             |
        |   hub (port 7225 owner) <-- relay:hello -- relay clients         |
        |   hub-exit promotion with jitter :756-783                        |
        |                                                                  |
        |  fsb-mcp-server stdio (per MCP client; index.ts :243)            |
        |  fsb-mcp-server serve  (HTTP daemon; index.ts :266, http.ts)     |
        |   each createRuntime(): McpServer + AgentScope (runtime.ts :31)  |
        |   AgentScope.ensure -> agent:register payload {} (:59-62)        |
        +------------------------------------------------------------------+
                          ^
                          | MCP stdio / Streamable HTTP
              External MCP clients (Claude Code, Cursor, Codex, ...)
              installed via install.ts / platforms.ts PLATFORMS (:77)
```

### Component Responsibilities (existing components this milestone touches)

| Component | Responsibility | Evidence |
|-----------|----------------|----------|
| `extension/ui/onboarding.js` | Install-command copy UX; already knows the clicked client id | `INSTALL_CLIENTS` :35-45; fan-item click -> `copyCommand(client.cmd, client.id)` :522-525; `copyCommand()` :784-794 keeps `state.copied` in memory only (:67, :787) — **nothing is persisted today** |
| `extension/ui/control_panel.html` | "API Configuration" section to rename | `<section id="api-config">` :144, `<h2>API Configuration</h2>` :146, `#modelProvider` select with 7 API providers :157-165, per-provider key groups (e.g. `#xaiApiKeyGroup` :196) |
| `extension/ui/options.js` | Provider select load/save + key-field visibility | default `modelProvider: 'xai'` :5; change listener :613-624; `updateApiKeyVisibility(provider)` :1301-1309; settings object built :1632; persisted flat to `chrome.storage.local` :1677 |
| `extension/ui/sidepanel.js` | Task entry; sends `startAutomation` with legacy agent identity | `ensureLegacySidepanelAgent()` :1503; `chrome.runtime.sendMessage({action:'startAutomation', task, tabId, agentId, ownershipToken})` :1506-1513; `stopAutomation()` :1545-1560 |
| `extension/background.js` | Session orchestration, kill switch, registry host | `fsbHandleRuntimeMessage` :7610; `handleStartAutomation` :8912; `startAutomationLoop` :11853; `handleStopAutomation` :9559 (storage-restore fallback; `fsbBroadcastAutomationLifecycle` on stop :9612) |
| `extension/utils/agent-registry.js` | Mints `agent_<uuid>`, tab ownership, connection grace | `registerAgent()` :305 (AgentRecord `{agentId, createdAt, tabIds, ...}` :263, :333); `stampConnectionId()` :634 (the pattern to clone for clientInfo); staged releases keyed by connectionId :286; exported `global.FsbAgentRegistry` :1468 |
| `extension/ws/mcp-bridge-client.js` | Extension side of ws://7225; per-connect `connectionId`; routes server-to-extension requests | `_ws.onopen` mints `crypto.randomUUID()` :112-144 (:127); onclose stages release via `stageReleaseByConnectionId` :185-186; keepalive `mcp:ping` send :329-330, `mcp:pong` ignore :373; `_handleMessage` switch :364/:391 routes `agent:register`/`agent:release`/`agent:status` :395-397 |
| `extension/ws/mcp-tool-dispatcher.js` | Route handlers incl. agent identity | `handleAgentRegisterRoute` :1935-1994 — mints via registry, stamps `connectionId` :1965-1970, returns `{success, agentId, agentIdShort, ownershipTokens:{}, connectionId}` :1993; cap rejection `AGENT_CAP_REACHED` :1947-1954. **`clientInfo` appears nowhere in this payload today** |
| `extension/ai/engine-config.js` | Named execution modes | `EXECUTION_MODES` :63-108 — exactly four: `autopilot`, `mcp-manual`, `mcp-agent`, `dashboard-remote`; `loadSessionConfig(modeName)` :126 |
| `mcp/src/bridge.ts` | Hub/relay WS topology on 7225 | hub start :264-295; browser-origin gate :297-309 (`allowedBrowserOrigins ['chrome-extension://']` :90); relay handshake `relay:hello` :328-333, `relay:welcome` :453-462, `relay:state` broadcast :502-509; `_handleExtensionMessage` :515-572 (understands ONLY `mcp:ping`, `mcp:progress`, and id-matched responses — **extension-initiated requests have no protocol today**); hub-exit promotion :756-783; reject-message contract `BRIDGE_DISCONNECT_MESSAGES` :34-38 |
| `mcp/src/agent-scope.ts` | Per-process (stdio) / per-session (HTTP) agent identity | `ensure()` sends `{type:'agent:register', payload:{}}` :59-62 — **the empty payload is the clientInfo seam**; defensive optional-field consumption pattern :77-101 |
| `mcp/src/agent-bridge.ts` | Threads agentId/ownershipToken/connectionId into every tool payload | `sendAgentScopedBridgeMessage` :70-93 |
| `mcp/src/runtime.ts` | Assembles server+bridge+queue+AgentScope | `createRuntime()` :31-50; `agentScope: options.agentScope ?? new AgentScope()` :34 |
| `mcp/src/http.ts` | `serve` daemon; per-HTTP-session McpServer sharing ONE bridge/queue | initialize creates `createRuntime({bridge, queue})` :123-143 — each HTTP session gets its **own AgentScope + own McpServer** (so its own clientInfo), shared bridge |
| `mcp/src/index.ts` | CLI entry: stdio/serve/status/doctor/install | stdio :243-264; `serve` -> `runHttpMode` :381-383/:266-294; `doctor` -> `runDoctor` :388-389/:334-348; help claims "install (21 platforms)" :93 |
| `mcp/src/platforms.ts` | Client registry with per-OS config paths | `PLATFORMS` :77 (23 entries: 18 file-mode, 1 cli-mode `claude-code` :95-103 with `configPath: null`, 4 instructions-mode :314/:324/:334/:344); disk detection = `resolvePlatformTarget()` :437-490 via `existsSync` on config file :455-466 then parent dir :468-479 |
| `mcp/src/install.ts` | Writes client configs / prints commands | `getClaudeCodeInstallCommand()` :31-33 (`claude mcp add --scope user fsb -- npx -y fsb-mcp-server`) |
| `mcp/src/tools/autopilot.ts` | `run_task` -> `mcp:start-automation` with onProgress heartbeats | :33, :51, :124-131 |
| `mcp/src/types.ts` | Bridge wire vocabulary (INV-01 additive-only) | `MCPMessageType` :8-48 (server-to-extension requests + `agent:*`); `MCPResponse` union `mcp:result|mcp:progress|mcp:error` :51-55 |
| `mcp/src/diagnostics.ts` | doctor layer classification | `collectBridgeDiagnostics()` :422 (offline-UX handoff target) |

---

## 2. Integration Seams Per Feature (question a)

### Feature 1 — Agent identity capture

| Seam | File:line | Change kind |
|------|-----------|-------------|
| Copy-click persistence | `extension/ui/onboarding.js:508-509` (base-command binds), `:522-525` (per-client fan binds), `:784-794` (`copyCommand` body) | MODIFY: add `persistCopyClick(clientId)` inside `copyCommand`; today `state.copied` is render-only |
| `initialize` clientInfo capture | `mcp/src/server.ts:9-21` (McpServer creation), `mcp/src/runtime.ts:31-50` | MODIFY: read `server.server.getClientVersion()` -> `Implementation {name, version}` after initialize. Verified via Context7: functional in SDK v1.x (repo pins `@modelcontextprotocol/sdk ^1.29.0`, `mcp/package.json:54`); deprecated only in the SDK v2 migration. Capture point: `oninitialized` hook or lazily inside `AgentScope.ensure` |
| Thread clientInfo through register | `mcp/src/agent-scope.ts:59-62` — `payload: {}` today | MODIFY: `payload: { clientInfo: {name, version} }` (additive; INV-01 safe). `AgentScope` needs a clientInfo supplier injected via `createRuntime` (runtime.ts:31) since it currently has no server handle |
| Extension-side stamping | `extension/ws/mcp-tool-dispatcher.js:1935-1994`; precedent: `connectionId` capture :1965-1970 | MODIFY: read `payload.clientInfo`, call new `reg.stampClientInfo(agentId, clientInfo)` |
| Registry record | `extension/utils/agent-registry.js:263` (AgentRecord shape), `:305` (registerAgent), `:634` (`stampConnectionId` — clone this) | MODIFY: `clientInfo` on AgentRecord + `stampClientInfo()`; surface in status/list snapshots |
| Installed-client disk detection | `mcp/src/platforms.ts:437-490` (`detected` flag) | REUSE server-side; NEW inventory push to extension (Section 3). Pitfall: `claude-code` is cli-mode with `configPath: null` (:95-103) so `resolvePlatformTarget` always reports `detected:false` for it — Claude Code detection must check the `claude` binary / `~/.claude.json` instead |
| Control-panel surfacing | `extension/ui/options.js` + `control_panel.html` | MODIFY: read new storage keys + new `getMcpClients` runtime message answered from the registry. Do NOT revive the commented background-agents `listAgents` surface (`options.js:5767`, `sidepanel.js:3651`) — that is the sunset v0.9.45rc1 path (INV-05) |

### Feature 2 — Providers panel

| Seam | File:line | Change kind |
|------|-----------|-------------|
| Section rename | `extension/ui/control_panel.html:144-148` (`id="api-config"`, `<h2>API Configuration</h2>` :146) | MODIFY copy to "Providers"; keep element ids stable where tests pin them (source-pin tripwires — run suite from first commit) |
| Provider select | `control_panel.html:157-165` (`#modelProvider`: xai/gemini/openai/anthropic/openrouter/lmstudio/custom) | MODIFY: add agent-provider entries (e.g. grouped optgroups) + recommended badge |
| Kind-aware key visibility | `extension/ui/options.js:1301-1309` (`updateApiKeyVisibility`) + change listener :613-624 | MODIFY: `agent` kind hides ALL key groups, shows connected/installed status instead |
| Settings model | `options.js:5` (default), `:1632` (save object), `:1677` (`chrome.storage.local.set`), `:1337-1376` (load) | MODIFY: introduce `providerKind` (`api`\|`agent`) + `agentProviderId` alongside `modelProvider`; `modelProvider` keeps its 7 API values so `universal-provider.js` (provider switches :196/:550) never sees an agent value |
| Recommended defaulting | new `fsbAgentProviders` storage | NEW: precedence connected > installed > copy-clicked |

### Feature 3 — Side-panel delegation (Claude Code MVP)

| Seam | File:line | Change kind |
|------|-----------|-------------|
| Side panel send | `sidepanel.js:1506-1513` | MODIFY: when selected provider kind is `agent`, dispatch new `startDelegatedTask` runtime message instead of the BYOK path |
| Background coordinator | `background.js:7610` (router), alongside `handleStartAutomation` :8912 | NEW `handleStartDelegatedTask`: lightweight delegated session record (UI state only), forwards over the reverse channel |
| Extension reverse-request send | `mcp-bridge-client.js` — precedent: fire-and-forget `mcp:ping` :329-330; `_handleMessage` switch :364-415 | NEW: extension-initiated request/response (`ext:*` frames) with own pending-map + id namespace; today the client can only *respond* to server requests |
| Bridge protocol | `mcp/src/bridge.ts:515-572` (`_handleExtensionMessage` drops unknown frames), `:328-333` (`relay:hello`), `:441-489` (relay registration), `types.ts:8-55` | NEW additive frames: `ext:request`/`ext:response`/`ext:event` + supervisor capability advertisement on `relay:hello`/`relay:welcome`/`relay:state` (additive fields; INV-01) |
| Spawner | none today | NEW `mcp/src/spawn-supervisor.ts` (Section 3 + Section 5) |
| Spawned CLI re-entry | entire existing pipeline: child runs `fsb-mcp-server` stdio -> relay on 7225 -> `agent:register` (`agent-scope.ts:53`) -> own agentId + tab ownership -> tool dispatch | REUSE unchanged — the core reuse win of the milestone |
| Progress to side panel | bridge `mcp:progress` origin-routing precedent :541-551; extension-to-UI precedent `fsbBroadcastAutomationLifecycle` `background.js:2456` | NEW `ext:event` frames supervisor -> hub -> extension -> runtime message -> `sidepanel.js` renderer |
| Kill switch | `sidepanel.js:1545-1560` -> `background.js:9559`; grace release `mcp-bridge-client.js:185-186` + registry :286 | MODIFY stop path for delegated sessions: `ext:request delegate.cancel` (supervisor SIGTERMs child); child's WS close then reuses existing `stageReleaseByConnectionId` cleanup |
| Offline UX | `mcp/src/diagnostics.ts:422`, `index.ts:334-348` (doctor) | NEW side-panel state: no supervisor answers -> "agent offline — run `fsb-mcp-server serve` / `doctor`" (extension has no nativeMessaging; it cannot wake any process) |
| Execution mode | `extension/ai/engine-config.js:63-108` | MODIFY: fifth `EXECUTION_MODES` entry `delegated` |

### Feature 4 — Multi-agent adapters

| Seam | File:line | Change kind |
|------|-----------|-------------|
| Adapter contract | new `mcp/src/agent-providers/` | NEW `AgentProviderAdapter`: `detect() / buildSpawn(task, ctx) / parseEvents(stream) / kill(child) / caps()` |
| Claude Code adapter | `install.ts:31-33` (CLI command precedent); platforms cli-mode nuance :95-103 | NEW `claude-code.ts` — built as an adapter from day one so OpenCode/Codex/Gemini slot in |
| Detection reuse | `platforms.ts:437-490` | REUSE for file-mode clients; per-adapter binary checks for cli-mode |
| Provider list wiring | Providers panel model (Feature 2) | MODIFY: adapter ids become `agent` provider ids; `caps()` gates task-mode vs chat-mode (`--resume`) UI |

---

## 3. New Components (question b)

| Component | Location | Kind | Contents |
|-----------|----------|------|----------|
| Reverse-request protocol frames | `mcp/src/types.ts` (+ `bridge.ts` + `mcp-bridge-client.js`) | NEW wire types (additive) | `ext:request {id, method, payload, secret}` extension->hub; `ext:response {id, payload}` hub->extension; `ext:event {id, payload}` streamed supervisor->extension. Plus additive `capabilities: ['agent-spawn']` on `RelayHello` and supervisor presence on `RelayWelcome`/`RelayState` (types.ts:70-80 region) |
| Spawner/supervisor | `mcp/src/spawn-supervisor.ts` | NEW module | Consent + shared-secret validation; adapter lookup; `child_process.spawn` with adapter-built argv (never `shell:true`); stream-json stdout parse -> `ext:event` fan-out; kill (SIGTERM -> SIGKILL escalation); child bookkeeping keyed by `delegationId`; exit-watch emits terminal event |
| Adapter registry | `mcp/src/agent-providers/{index,adapter,claude-code}.ts` | NEW | `AgentProviderAdapter` contract; registry keyed by client ids aligned with `INSTALL_CLIENTS` (`onboarding.js:35-45`) and `PLATFORMS` keys (`platforms.ts:77`) |
| Client-identity capture glue | inline in `runtime.ts` / `agent-scope.ts` | NEW glue | `getClientVersion()` read + supplier threading into `agent:register` payload |
| Extension reverse-channel client | `extension/ws/mcp-bridge-client.js` | MODIFY (new capability) | `sendExtRequest(method, payload, {timeout})` with pending map + `ext:` id prefix; `ext:event` subscription routed to background listeners |
| Delegation coordinator | `extension/background.js` | MODIFY (new handlers) | `startDelegatedTask`/`stopDelegatedTask` runtime messages; delegated session-lite records; event relay to side panel |
| Captured-identity storage schema | `chrome.storage.local` | NEW schema (additive keys) | `fsbAgentProviders: { copyClicks: {<clientId>: {count, lastCopiedAt}}, connected: {<clientName>: {lastSeenAt, version}}, installed: {<platformKey>: {detected, configPath, checkedAt}}, selected: {kind:'api'|'agent', id} }`. Registry AgentRecord carries `clientInfo` as session-scoped truth; `fsbAgentProviders.connected` is the durable rollup |
| Provider-kind model | `extension/ui/options.js` + engine read sites | MODIFY | `providerKind` setting + guard so BYOK engine paths only ever see the existing 7 API providers |
| Fifth execution mode | `extension/ai/engine-config.js:63-108` | MODIFY | `delegated: { uiFeedbackChannel:'popup-sidepanel', animatedHighlights:true, safetyLimits: wall-clock watchdog (iterations N/A — loop runs in the external CLI) }` |

---

## 4. Data Flows (question c)

### Flow 1 — Onboarding capture -> storage

```
User hovers copy fan, clicks a client (e.g. "Cursor")
  onboarding.js:522-525  (button dataset.copyClient -> INSTALL_CLIENTS lookup)
    -> copyCommand(client.cmd, client.id)      onboarding.js:784
        -> writeClipboard(text)                :796
        -> NEW persistCopyClick(client.id)     -> chrome.storage.local
              fsbAgentProviders.copyClicks['cursor'] = {count+1, lastCopiedAt}
Control panel Providers section reads fsbAgentProviders on load
  (options.js load path :1337-1376) -> renders "copy-clicked" tier (weakest signal)
```
Base-command copies (`:508-509`) copy the currently rolled client's flag (`state.token` :63) — persist `{clientId: current, source:'base'}` so those clicks are not lost.

### Flow 2 — initialize clientInfo -> agent:register -> extension registry -> control panel

```
Claude Code launches `npx -y fsb-mcp-server` (stdio)     [or connects to serve HTTP]
  SDK initialize handshake carries clientInfo {name, version}
  stdio: one runtime/process (index.ts:243-247); HTTP: one runtime/session (http.ts:123-143)
    server.server.getClientVersion() -> {name, version}  [SDK v1.x accessor, verified]
First tool call -> AgentScope.ensure(bridge)             agent-scope.ts:53
  payload {} -> NEW payload {clientInfo}                 agent-scope.ts:59-62
  bridge.sendAndWait('agent:register')                   bridge.ts:180-228
    hub -> extension WS                                  bridge.ts:219-222
      mcp-bridge-client.js _handleMessage :364, case 'agent:register' :395
        dispatchMcpMessageRoute -> handleAgentRegisterRoute   mcp-tool-dispatcher.js:1935
          reg.registerAgent() mints agent_<uuid>         agent-registry.js:305
          reg.stampConnectionId(...)                     dispatcher :1965-1970 (existing)
          NEW reg.stampClientInfo(agentId, clientInfo)   (clone of registry :634 pattern)
          NEW rollup: fsbAgentProviders.connected['claude-code'] = {lastSeenAt, version}
        response {agentId, agentIdShort, connectionId}   dispatcher :1993 -> AgentScope caches
Control panel: NEW getMcpClients runtime message -> background reads registry + fsbAgentProviders
  -> Providers panel shows "Claude Code — connected (agent_ab12...)"
     (trusted-label precedent: visual-session clientLabel, dispatcher :1902)
```
Topology note: each stdio MCP client is its own process -> own AgentScope -> own clientInfo. In `serve` mode each HTTP session gets its own McpServer+AgentScope (http.ts:125 passes only bridge+queue; runtime.ts:34 defaults a fresh AgentScope) — clientInfo is correctly per-client on both transports.

### Flow 3 — Side-panel delegation round trip

```
[side panel]  provider kind=agent (claude-code) selected; user types task, Send
  sidepanel.js NEW branch at the :1506 send site -> runtime msg
    startDelegatedTask {task, tabId(hint), providerId}
[background]  NEW handleStartDelegatedTask -> delegated session-lite record (UI state)
  -> mcp-bridge-client NEW sendExtRequest('delegate.start',
       {task, providerId, tabHint, consentTier, secret})
[ws 7225]     ext:request -> hub _handleExtensionMessage (bridge.ts:515) NEW ext:* branch
  hub is supervisor?  yes -> handle locally
                      no  -> forward to the relay that advertised capabilities:['agent-spawn']
                      none -> ext:response {error:'agent_provider_offline'}
[supervisor = serve daemon]  SpawnSupervisor.validate(secret, consent)
  -> adapter('claude-code').buildSpawn(task)
  -> spawn claude -p ... --output-format stream-json --strict-mcp-config
       + hermetic mcp-config pointing ONLY at fsb + shipped `fsb` agent definition
       (exact flags: verify in phase research)
  -> ext:response {delegationId} -> extension -> side panel "delegating..."
[spawned CLI] launches its own `npx fsb-mcp-server` (stdio) -> connects 7225 as relay
  -> agent:register (Flow 2) -> OWN agentId + clientInfo
  -> MCP tools (read_page/click/run_task/...) -> bridge -> extension dispatcher
     -> tab actions under ITS OWN ownership (agent-registry bindTab :492-500) + visible glow
[events]      supervisor parses child stream-json
  -> ext:event {delegationId, phase, text, toolUse} -> hub -> extension bridge client
  -> runtime message -> sidepanel.js progress renderer
[stop]        side panel Stop (sidepanel.js:1545) -> background NEW stopDelegatedTask
  -> sendExtRequest('delegate.cancel', {delegationId}) -> supervisor SIGTERM child
  -> child exits -> child's stdio server WS closes -> extension-side grace release
     (stageReleaseByConnectionId, mcp-bridge-client.js:185-186 / registry :286)
  -> supervisor ext:event {status:'cancelled'} -> side panel terminal state
```

### State Management

- Delegated-task UI state: background session-lite records + `chrome.storage.session` for SW-eviction survival. The MV3 SW WILL be evicted during long delegations; on WS reconnect the extension mints a fresh `_connectionId` (mcp-bridge-client.js:112-144), so `delegationId` must live in storage and re-associate on wake — mirror the `handleStopAutomation` storage-restore fallback pattern (background.js:9567-9586).
- Identity ground truth: `fsbAgentProviders` (durable rollup) + live registry AgentRecords.

---

## 5. Spawner Ownership: hub vs relay vs serve daemon (question e)

**Recommendation: the `serve` daemon owns spawning. `SpawnSupervisor` lives in the `fsb-mcp-server serve` process regardless of whether its bridge is currently hub or relay. The hub's only new job is routing `ext:*` frames to whichever connected process advertises the `agent-spawn` capability — handling locally when it is itself the supervisor.**

Rationale:

1. **Process lifetime.** Hub identity is unstable by design: any stdio server owned by an unrelated client session can hold the port, and hub-exit promotion (bridge.ts:756-783, jittered race, exercised by `tests/mcp-bridge-topology.test.js` `runHubExitPromotion` :242) reshuffles roles whenever that client exits. A spawned CLI's stream-json stdout must be read for the whole delegation; if the reader were "whoever is hub", a Cursor session quitting mid-delegation would orphan the child and its event stream. The serve daemon is the only intentionally long-lived process (index.ts:266-294, explicit SIGTERM/SIGINT shutdown :284-293).
2. **Consent and security posture.** Spawning is RCE-adjacent. Binding it to a process the user explicitly started gives a clean consent story and a single holder for the shared secret and consent tiers. Arbitrary stdio hubs launched by third-party clients must never gain spawn authority implicitly.
3. **Hub-exit promotion safety.** The daemon's bridge already reconnects/promotes automatically (`_attemptPromotion` :756, `_scheduleRelayReconnect` :785). Every reconnect re-sends `relay:hello`, so the additive `capabilities:['agent-spawn']` field re-advertises the supervisor to each new hub. Children are attached to the daemon process; hub churn never touches them — only frame routing pauses briefly (extension retries `ext:request` on disconnect-class rejections; extend `BRIDGE_DISCONNECT_MESSAGES` semantics, bridge.ts:34-38, if new reject sites are added — the comment there makes this mandatory).
4. **Matches the honest-offline constraint.** The extension cannot wake processes (no nativeMessaging). "Supervisor present = serve daemon running (or a hub that opted in)" is exactly the state `doctor` (index.ts:334-348) can diagnose and the side panel can message.

Concrete hub routing rule (new code in bridge.ts): on `ext:request` from the extension — if this process registered a local SpawnSupervisor, handle; else forward to the first relay whose hello advertised `agent-spawn`; else reply `ext:response {error:'agent_provider_offline'}`. This stays inside the milestone's "reverse channel over the existing ws://7225 bridge" decision and is byte-additive on the wire (INV-01: new frame types + optional hello fields only; all existing `MCPMessageType` values untouched, types.ts:8-48).

Rejected alternatives:
- **Hub-owned spawning:** simplest routing (frames already land at bridge.ts:515) but fails lifetime + consent as above.
- **Any-process spawning:** ambiguous ownership; duplicate spawns on retries; kill-switch routing becomes a search problem.
- **Separate supervisor port (e.g. 7226):** cleanest isolation, zero forwarding — but contradicts the milestone's existing-bridge decision and adds a second listener to the doctor/firewall surface. Keep as documented fallback if hub-forwarding proves fragile during implementation.

Edge case to handle explicitly: two `serve` daemons (user runs `serve` twice). First-advertised-supervisor-wins at the hub, with a diagnostics note; do not fan out to multiple supervisors.

---

## 6. Delegation Coexistence With the Extension's Agent Loop (question f)

1. **Execution modes.** `delegated` becomes the fifth `EXECUTION_MODES` entry (engine-config.js:63-108). Delegated tasks never enter `runAgentLoop` (agent-loop.js:1180) — background keeps a session-lite record for UI state; the reasoning loop runs in the spawned CLI, which drives the browser through the same MCP tool surface (INV-02 parity holds because no new tool stack exists). `loadSessionConfig('delegated')` (engine-config.js:126) supplies wall-clock watchdog + event-silence timeout instead of iteration caps.
2. **Tab ownership.** The spawned CLI's stdio server registers its own agent (Flow 2) and binds tabs on first action (agent-registry.js:492-500). Two guards: (a) the side panel's `ensureLegacySidepanelAgent` pre-bind (sidepanel.js:1503) must NOT run for delegated sends, or the target tab is owned by `legacy:sidepanel` and the CLI's agent hits `TAB_NOT_OWNED` — pass the tab as a hint in the delegate payload and let the CLI's agent own it; (b) the spawned agent counts against the concurrency cap (`AGENT_CAP_REACHED`, dispatcher :1947-1954) — surface as a typed side-panel error.
3. **Kill-switch paths (two; both required).**
   - UI stop: side panel -> `stopDelegatedTask` -> `ext:request delegate.cancel` -> supervisor SIGTERM child. Distinct from BYOK stop (`handleStopAutomation` background.js:9559), which stays untouched for non-delegated sessions.
   - Process-death fallback: child or daemon dies -> child's WS closes -> existing `stageReleaseByConnectionId` grace release (mcp-bridge-client.js:185-186; registry staged releases :286) frees tabs/overlays; the supervisor's exit-watch emits a terminal `ext:event` so the panel never hangs on "running". If the daemon itself dies, the extension's pending `ext:request` map times out -> offline state.
4. **Simultaneity.** BYOK autopilot on tab A + delegated CLI on tab B coexist — exactly the v0.9.60 multi-agent ownership model. The only shared per-process resource is each MCP server's mutation queue (queue.ts), which serializes only that client's mutations.
5. **UI feedback.** Delegated progress arrives via `ext:event` -> runtime messages, not loop `statusUpdate`s. Side panel adds a renderer branch reusing existing status components (`addStatusMessage` pattern, sidepanel.js:1525).
6. **Test tripwires.** Every extension file touched (background.js, engine-config.js, sidepanel.js, mcp-bridge-client.js, dispatcher, agent-registry.js, onboarding.js, options.js) sits under source-pin tests (token counts/substrings). Run the full suite from the first commit of every phase.

---

## 7. Recommended Build Order (question d)

Phases continue from 57. Dependency chain: identity capture -> providers UI -> delegation MVP -> multi-adapter.

| Step | Scope | Depends on | Why this position |
|------|-------|-----------|-------------------|
| 1. Identity capture (copy-clicks + clientInfo) | onboarding persist; `getClientVersion` capture; `agent:register` payload `{clientInfo}`; `stampClientInfo`; `fsbAgentProviders` schema + connected rollup; `getMcpClients` runtime message | nothing | Pure additive data layer on both sides of the wire; unblocks everything later; closes the v0.9.36 deferred "trusted MCP client identity from handshake metadata" item |
| 2. Installed-client detection + inventory | reuse `resolvePlatformTarget`; NEW inventory delivery server->extension (additive `system:client-inventory` request on extension-connect, or piggyback on register — decide with payload measurements); claude-code binary detection | 1 (schema exists) | Server-side disk access only; completes connected > installed > copy-clicked ground truth |
| 3. Providers panel | rename :146; provider-kind model; agent rows + status; key-field hiding; recommended defaulting; BYOK guard | 1, 2 (needs real data) | Visible value before the risky spawn work; establishes the selection the delegation UI reads |
| 4. Reverse-request channel + security | `ext:request/response/event`; hub routing + supervisor advertisement; extension pending-map; shared secret + origin gating + consent tiers; topology tests alongside `tests/mcp-bridge-topology.test.js` | independent, but sequence after 3 | Security-critical seam isolated in its own phase with its own tests; INV-01 additive proof lives here |
| 5. Delegation MVP (Claude Code) | SpawnSupervisor in serve daemon; `claude-code` adapter (built AS an adapter); `delegated` EXECUTION_MODES entry; side-panel send/progress/stop; offline->doctor UX; SW-eviction re-association | 3 (provider selection), 4 (channel) | The integration payoff; the child CLI reuses the entire existing agent pipeline unchanged |
| 6. Multi-agent adapters | registry hardening; OpenCode -> Codex -> Gemini adapters; `caps()`-gated task-mode vs chat-mode (`--resume`) | 5 | Contract proven by one real implementation before generalizing |

Parallelization: 1 and 2 can interleave; 4 can start while 3 is in review. 5 must not start before 4's security tests are green.

---

## 8. Anti-Patterns (repo-specific)

### Anti-Pattern 1: Prompt-stuffing the spawned CLI
**What people do:** encode task + tool guidance into one giant `-p` prompt.
**Why it's wrong:** brittle, unauditable; the milestone already chose a shipped `fsb` agent definition + hermetic `--strict-mcp-config`.
**Do this instead:** adapter `buildSpawn` emits argv referencing the shipped agent definition; the task is the only variable input.

### Anti-Pattern 2: Reviving the sunset background-agents surface
**What people do:** resurrect `listAgents`/`getAgentStats` (commented at options.js:5767/6049, sidepanel.js:3651) or `extension/agents/*` for "agents in the panel".
**Why it's wrong:** INV-05 freezes those modules; the new surface is MCP-client identity, a different concept.
**Do this instead:** new `getMcpClients` message backed by `fsbAgentRegistryInstance` + `fsbAgentProviders`.

### Anti-Pattern 3: Making `modelProvider` polymorphic
**What people do:** store `modelProvider:'claude-code'` and branch everywhere.
**Why it's wrong:** `universal-provider.js` (:196/:550), engine reads, and MCP diagnostics (`status` prints `modelProvider`, index.ts:152-156) all assume the 7 API values; an agent value leaks into request builders.
**Do this instead:** separate `providerKind` + `agentProviderId`; `modelProvider` stays the last-used API provider.

### Anti-Pattern 4: Letting "whoever is hub" spawn
**Why it's wrong:** Section 5 — child lifetime tied to an unrelated client session; consent ambiguity; kill-switch routing breaks across hub-exit promotion.
**Do this instead:** serve-daemon-owned SpawnSupervisor + capability-advertised routing.

### Anti-Pattern 5: Editing bridge wire contracts in place
**Why it's wrong:** INV-01 — every existing `MCPMessageType` (types.ts:8-48) and tool schema is byte-stable; register consumers tolerate only additive optional fields (see the defensive pattern in agent-scope.ts:77-101).
**Do this instead:** new frame types + optional payload fields only; update `BRIDGE_DISCONNECT_MESSAGES` (bridge.ts:34-38) for any new reject-on-disconnect site — its comment makes this mandatory.

---

## 9. Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Agent CLIs (claude, opencode, codex, gemini) | `spawn` with adapter-built argv; stream-json stdout; SIGTERM kill | Verify flags per CLI in phase research; never `shell:true` |
| MCP SDK ^1.29.0 | `server.server.getClientVersion()` / `oninitialized` | Functional in v1.x; deprecated in SDK v2 in favor of per-request `ctx.mcpReq.envelope` — note for any future SDK major upgrade (Context7, HIGH) |
| Client config files on disk | `resolvePlatformTarget` existsSync detection (platforms.ts:437-490) | cli-mode (`claude-code`) and instructions-mode entries need per-adapter detection |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| side panel <-> background | runtime messages (`startAutomation` :1506; NEW `startDelegatedTask`/`stopDelegatedTask`/`getMcpClients`) | keep `startAutomation` payload backward-compatible |
| background <-> hub | ws://7225; today server-initiated only; NEW `ext:*` extension-initiated frames | origin gate bridge.ts:297-309 + NEW shared secret for `ext:*` |
| hub <-> supervisor relay | `relay:hello` capability advertisement (additive) + `ext:*` forwarding | mirrors existing `messageOrigin` response routing bridge.ts:538-571 |
| supervisor <-> child CLI | argv/agent-definition in; stream-json out | watchdog + exit-code mapping to terminal `ext:event` |
| child's MCP server <-> extension | unchanged existing pipeline (register/tools/ownership) | the deliberate reuse core of the milestone |

---

## Sources

- Direct source reads (this repo; all `file:line` citations above): `mcp/src/{bridge,agent-scope,agent-bridge,runtime,server,http,index,types,platforms,install}.ts`, `mcp/src/tools/autopilot.ts`, `mcp/src/diagnostics.ts`; `extension/ws/{mcp-bridge-client,mcp-tool-dispatcher}.js`; `extension/utils/agent-registry.js`; `extension/ui/{onboarding,options,sidepanel}.js`, `extension/ui/control_panel.html`; `extension/ai/engine-config.js`; `extension/background.js` — HIGH
- graphify graph queries (symbol locations: `handleAgentRegisterRoute` dispatcher:1935, `handleStartAutomation` background:8912, `handleStopAutomation` background:9559, `createRuntime` runtime:31, `PLATFORMS` platforms:77; topology tests `tests/mcp-bridge-topology.test.js` incl. `runHubExitPromotion` :242 and `runRejectsUntrustedBrowserOrigin` :215) — HIGH
- Context7 `/modelcontextprotocol/typescript-sdk` — server-side `getClientVersion()` exists and is functional in v1.x; deprecated in the v2 migration; 2026-era transports return `undefined` and move identity to `ctx.mcpReq.envelope` — HIGH for the pinned `^1.29.0` (`mcp/package.json:54`)
- `.planning/PROJECT.md` v0.9.91 milestone section (INV-01, no-nativeMessaging constraint, security tiers, phases from 57) — HIGH
- Claude Code headless flag surface (`-p`, `--output-format stream-json`, `--strict-mcp-config`, agent definitions): training data + milestone context only — **MEDIUM-LOW; verify exact flags against the installed CLI during the Delegation MVP phase**

### Open Questions for Phase Research

1. Exact current `claude` CLI headless flags, permission-mode defaults, and stream-json event schema (verify against the installed CLI at implementation time).
2. Inventory delivery trigger: on-extension-connect push vs piggyback on `agent:register` vs on-demand `ext:request clients.detect` — decide in Step 2 with payload-size measurements.
3. Shared-secret provisioning for `ext:*` frames (the extension has no pre-shared channel with the daemon other than the bridge itself): TOFU pairing on first `serve` connect vs a user-visible pairing code in the control panel — decide in Step 4 security research.
4. Whether the Providers panel should also surface HTTP-session clients from `serve` mode distinctly from stdio clients (both produce clientInfo; UX question only).

---
*Architecture research for: FSB v0.9.91 MCP Clients as Providers*
*Researched: 2026-07-10*
