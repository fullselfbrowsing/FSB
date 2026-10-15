# Phase 57: Agent Identity Capture - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-07-11
**Phase:** 57-agent-identity-capture
**Mode:** assumptions
**Areas analyzed:** Wire Additions (clientInfo through agent:register), fsbAgentProviders Storage Schema and Merged View, Installed-Client Detection and Inventory Delivery, Onboarding Copy-Click Persistence

## Assumptions Presented

### Wire Additions — clientInfo Through `agent:register` (Both Transports)

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Inject a lazy `clientInfoSupplier` into `AgentScope` at `createRuntime()`; read `server.getClientVersion()` inside `ensure()` at send time; omit field when supplier returns null. No signature change to `ensure()`. | Confident | `mcp/src/agent-scope.ts:59-62` (empty payload); `mcp/src/runtime.ts:31-50` (single construction site for both agentScope and server); `mcp/src/http.ts:125` (per-HTTP-session runtime); `mcp/src/index.ts:243` (stdio one-runtime-per-process). Verified fresh runtime per HTTP session by direct read of `http.ts`. Lazy read is guaranteed populated (ensure only fires post-tool-call). |
| Extension-side, `handleAgentRegisterRoute` reads `payload.clientInfo` defensively, calls a new `reg.stampClientInfo(agentId, clientInfo)` cloned from `stampConnectionId`, writes rollup in dispatcher (mirroring `fsbActiveAgentsCount` RMW). Register response byte-identical. | Confident | `extension/ws/mcp-tool-dispatcher.js:1935-1994` (route); `:1965-1970` (`stampConnectionId` pattern); `:1979-1985` (rollup RMW precedent); `:1993` (frozen response shape); `extension/utils/agent-registry.js:634-648` (`stampConnectionId` template); `mcp/src/agent-scope.ts:77-101` (defensive optional-field consumption showing additive INV-01 discipline). |

### fsbAgentProviders Storage Schema and the Merged View

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Single `chrome.storage.local` key `fsbAgentProviders` holding `{ clicked, connected, installed }` sub-maps keyed by canonical client id; per-subkey RMW helpers accept single-key clobber race as known limitation. | Likely | `.planning/research/ARCHITECTURE.md:137,175` (schema); `extension/utils/agent-registry.js:651-657` (registry envelope is session-scoped — durable rollup must be separate); IDENT-03 requirement text names dotted sub-keys of one parent. Alternative rejected default: three flat top-level keys (eliminates race but requires two-key migration if introduced later). |
| Merge happens extension-side in a new `getMcpClients` case in `fsbHandleRuntimeMessage`, returning a map keyed by canonical client id with `{clicked, installed, connected}` records preserved separately; alias table (case/whitespace + explicit) maps `clientInfo.name`→canonical id; sunset `listAgents` stays sunset (INV-05). | Likely | `extension/background.js:7610` (router); `.planning/research/ARCHITECTURE.md:283-285` (INV-05 sunset agents); `options.js:5767`, `sidepanel.js:3651` (commented-out `listAgents` callers). Only the extension holds all three sources; `clicked` never leaves the extension; daemon can be offline while the panel still needs a view. |

### Installed-Client Detection and Inventory Delivery

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Detection runs daemon-side only, reusing `resolvePlatformTarget()` unchanged for file-mode/instructions-mode clients; `claude-code` needs `execFile('claude', ['--version'])` special case with per-OS candidate list (Windows `.cmd`/`.exe`/bare); no `shell: true`. | Confident | `mcp/src/platforms.ts:437-490` (existing detection loop with `existsSync`); `:400-402`, `:444-453` (cli-mode blind spot for claude-code where `configPath: null`); `mcp/src/install.ts:660` (existing `resolvePlatformTarget` consumer); `.planning/research/STACK.md` (Node CVE-2024-27980 EINVAL rule; `execFile` over `exec`); `.planning/research/SUMMARY.md:174` (Windows `.cmd` shim flagged). Extension has no fs API; no version source for file-mode configs. |
| Belt-and-braces inventory delivery: additive `MCPMessageType` union member (e.g. `system:client-inventory`) sent daemon→extension via `_routeMessage`, PLUS piggyback on each `agent:register` payload; extension caches in `fsbAgentProviders.installed` for daemon-offline resilience. | Likely | `extension/ws/mcp-bridge-client.js:390-415` (`_routeMessage` add-case seam); `mcp/src/types.ts:8-48` (`MCPMessageType` union additive point, INV-01 safe); `.planning/research/ARCHITECTURE.md` Open Question 2 explicitly left this decision open — must lock in planning. `bridge.ts:515-572` confirms extension-initiated pull is unavailable this phase (Phase 59 territory). Alternative rejected default: piggyback-only leaves serve-daemon-only + client-launched-no-tool users with empty installed tier. |

### Onboarding Copy-Click Persistence

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Add `persistCopyClick(clientId, source)` invoked from `copyCommand()`; writes `fsbAgentProviders.clicked[clientId] = { count+1, firstClickedAt, lastClickedAt }` via `storageSet`; rendering keeps passing `'current'`/`client.id` to `state.copied` unchanged. | Likely | `extension/ui/onboarding.js:784-794` (`copyCommand` — clipboard + checkmark + toast, nothing persisted); `:560-570` (`persistProviderSelection` — precedent for `chrome.storage.local` writes from onboarding page); `:522-525` (fan clicks pass real id); `:508-509` (base copies pass literal `'current'`); `:507` (`current = ROLL_CLIENTS[state.iconIndex]` — resolves base-copy attribution); `.planning/research/ARCHITECTURE.md:147-157` (Flow 1 specifies this seam). Alternative rejected default: skip base copies (would undercount the most prominent copy button on the screen). |
| `all` clicks expand at write time to the seven flag-carrying clients (claude-code, claude-desktop, cursor, vscode, windsurf, codex, opencode), each tagged `source: 'all'`; `openclaw` excluded (`flag: ''`, bare `cmd: 'npx -y fsb-mcp-server'`). | Likely | `extension/ui/onboarding.js:44` (`{id: 'all', flag: '--all'}`); `:43` (`openclaw` with `flag: ''` and bare cmd); `:35-45` (full `INSTALL_CLIENTS` roster). IDENT-01 text says "aggregates all ids." Alternative rejected default: store literal `'all'` sentinel (forces every reader to know the expansion rule). |

## Corrections Made

No corrections — all assumptions confirmed on first pass.

## External Research

Two open research topics flagged as phase-time spikes (not blockers):
- **Empirical `clientInfo.name`/`version` capture per real client** — needed before locking the alias-table module (D-09) with production content. Cheap plan-time capture: connect each locally installed client once and log the handshake. Deferred to plan phase.
- **Windows `claude` binary resolution** — `execFile('claude', ...)` without `shell: true` does not resolve `.cmd`/`.ps1` npm shims (Node CVE-2024-27980 EINVAL). D-13 resolves this with a per-OS candidate list; the alternative would require deferring installed-client version detection for claude-code on Windows to Phase 60.

Everything else — SDK accessor validity, `platforms.ts` coverage, empty-payload seam, stamp pattern, spawner ownership, INV-01 additive rules — is covered by `.planning/research/SUMMARY.md` and `.planning/research/ARCHITECTURE.md`.
