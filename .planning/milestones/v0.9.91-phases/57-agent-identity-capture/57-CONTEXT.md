# Phase 57: Agent Identity Capture - Context

**Gathered:** 2026-07-11 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

FSB knows which MCP-capable agent CLIs the user has installed on disk, has expressed intent to install (via onboarding copy clicks), and has actually connected via MCP `initialize` — surfaced as a single ground-truth view (`clicked ∪ installed ∪ connected`, keyed by canonical client id) that unblocks every downstream provider-selection decision. Pure additive data layer on both sides of the wire (INV-01 safe).

**In-scope:** IDENT-01 (copy-click persistence) · IDENT-02 (clientInfo capture + threading) · IDENT-03 (registry stamping + durable `connected` rollup) · IDENT-04 (daemon-side installed-client detection) · IDENT-05 (extension-side `getMcpClients` merged view).

**Out-of-scope:** any UI to display the merged view (Phase 58 Providers panel), any use of the view to pick a provider (Phase 58), any reverse-request channel or spawn behavior (Phase 59+), Gemini alias-table row (deferred until Gemini adapter phase).
</domain>

<decisions>
## Implementation Decisions

### Wire Additions — clientInfo Through `agent:register` (Both Transports)

- **D-01:** Inject a lazy `clientInfoSupplier` (`() => { name?: string; version?: string } | null`) into `AgentScope` at `createRuntime()` construction time (`mcp/src/runtime.ts:31-50`). `AgentScope.ensure(bridge)` reads the supplier inside its register call (`mcp/src/agent-scope.ts:59-62`) and, when the supplier returns a non-null value with either `name` or `version`, sends `payload: { clientInfo: { name?, version? } }`; when it returns null, sends `payload: {}` unchanged. The signature of `ensure(bridge)` does not change, so no tool-registration site is touched.
- **D-02:** The supplier reads from `server.getClientVersion()` (SDK accessor verified at pinned tag `^1.29.0`). Lazy-read is safe because `ensure()` only fires during a tool call, which strictly postdates the MCP `initialize` handshake. The supplier setter in `AgentScope` is type-guarded so mock scopes (`makeMockAgentScope` in `tests/visual-session-schema-lock.test.js`) continue to work without changes.
- **D-03:** Runtime wiring: `createRuntime()` calls `agentScope.setClientInfoSupplier(() => server.server.getClientVersion?.() ?? null)` after both the `agentScope` and `server` are constructed. Both transports get this uniformly — stdio has one runtime per process (`mcp/src/index.ts:243`), and `serve` builds a fresh runtime per HTTP session (`mcp/src/http.ts:125`). No transport-specific changes.
- **D-04:** Extension-side, `handleAgentRegisterRoute` (`extension/ws/mcp-tool-dispatcher.js:1935-1994`) reads `payload.clientInfo` with defensive checks (typeof object; per-field typeof string; per-field length cap ≤200 chars each; drop unknowns), then calls a new `reg.stampClientInfo(agentId, clientInfo)` method cloned exactly from `stampConnectionId` (`extension/utils/agent-registry.js:634-648`) — sync single-property mutation, fire-and-forget `_persist()`, boolean return.
- **D-05:** The durable `fsbAgentProviders.connected` rollup write lives in the dispatcher (not the registry), mirroring the best-effort read-modify-write precedent for `fsbActiveAgentsCount` at `mcp-tool-dispatcher.js:1979-1985`. The register response shape is byte-identical: `{ success, agentId, agentIdShort, ownershipTokens, connectionId }` at `:1993` — no new fields.

### fsbAgentProviders Storage Schema and the Merged View

- **D-06:** One `chrome.storage.local` key `fsbAgentProviders` holds three sub-maps, each keyed by canonical client id:
  ```
  {
    clicked:   { <id>: { count, firstClickedAt, lastClickedAt, source? } },
    connected: { <id>: { name, version, lastSeenAt } },
    installed: { <key>: { detected, configPath, version?, checkedAt } }
  }
  ```
  `storage.local` (not `session`) is required by IDENT-03 ("survives Chrome restart"). Keyed maps give re-connection update-not-duplicate structurally: re-registering overwrites `connected[id]` in place.
- **D-07:** Writes are per-subkey read-modify-write helpers (`storageMutateAgentProviders(subkey, fn)`) so a copy-click writer and a `connected`-stamp writer don't clobber unrelated sub-keys. The single-key RMW race between onboarding page and SW is accepted as a known limitation: it self-heals on next event, and observation-time inconsistency is visible only as a briefly flaky Providers roster in Phase 58. If the race turns out to matter empirically, migration to three flat top-level keys is a clean shim.
- **D-08:** The merged view for `getMcpClients` is assembled **extension-side** in a new `fsbHandleRuntimeMessage` case in `extension/background.js` (routed at `:7610`). Return shape: one map keyed by canonical client id, with the three source records preserved separately per client — `{ clicked | null, installed | null, connected | null, live? }` — plus the live-registry state where available. The UI derives tier (connected > installed > clicked) itself.
- **D-09:** Joining `connected` into the merged view uses a `clientInfo.name`-to-canonical-id alias table maintained inside the extension (module-level constant, e.g. `extension/utils/mcp-client-aliases.js`). Normalization strips case and whitespace; explicit aliases handle known name drift. Unmapped names surface as display-only raw entries (no join to `installed`/`clicked`) so a novel client is visible but unmerged.
- **D-10:** The sunset `listAgents` runtime message stays sunset (INV-05). Any in-SW caller uses `globalThis.fsbDispatchInternalMessage` (`background.js:8731`), never `chrome.runtime.sendMessage` — auto-memory: sendMessage never loops back in-SW.

### Installed-Client Detection and Inventory Delivery

- **D-11:** Detection runs **daemon-side only**. For all file-mode / instructions-mode / installMode entries in the `PLATFORMS` registry, reuse `resolvePlatformTarget()` unchanged (`mcp/src/platforms.ts:437-490`). Its `detected` flag means "config file exists OR parent app dir exists," which is the right heuristic for "client app installed." No new npm dependencies; `node:child_process.execFile` is the only new stdlib surface.
- **D-12:** `claude-code` gets a special case: its entry is `installMode: 'cli', configPath: null` (`platforms.ts:95-103`), so `getPlatformTargetCandidates` returns `[]` and `resolvePlatformTarget` hard-codes `detected: false`. Detect it via `execFile('claude', ['--version'], { timeout: 3000 })` with **no** `shell: true`, results memoized for the daemon process lifetime. `version` string is captured only for `claude-code` this phase; file-mode configs carry no version on disk and instructions-mode entries report undetectable.
- **D-13:** Windows resolution of the `claude --version` probe: the detector tries a fixed candidate list per platform. On POSIX: `claude`. On Windows: `claude.cmd` first, then `claude.exe`, then bare `claude`. If none succeeds, `detected: false, version: undefined` is reported — never a shell escalation, never `shell: true` (Node CVE-2024-27980 EINVAL protection). This mirrors the Phase 60 spawn contract but lands one phase early because detection needs it.
- **D-14:** Inventory reaches the extension via **belt-and-braces**: (a) a new additive `MCPMessageType` union member (e.g. `system:client-inventory`) sent daemon→extension over the existing `_routeMessage` path (`extension/ws/mcp-bridge-client.js:390-415`), fire-and-tolerate at bridge-ready and after each successful detection refresh; PLUS (b) piggybacked as a `platforms` field on each `agent:register` payload. Old extensions reply "Unknown MCP message type" via the default throw and the server ignores; old servers omit the piggyback field and the new extension keeps whatever cached snapshot it has.
- **D-15:** The extension caches the `installed` snapshot in `fsbAgentProviders.installed` and stamps `checkedAt` on receipt, so the merged view survives daemon-offline (returns stale-but-honest data with `checkedAt` timestamps so UI can render "checked N minutes ago" if needed later).

### Onboarding Copy-Click Persistence

- **D-16:** Add `persistCopyClick(clientId, source)` invoked from `copyCommand()` (`extension/ui/onboarding.js:784-794`, currently only clipboard + 1.6s `state.copied` checkmark + toast). Uses the existing `storageSet` helper (precedent: `persistProviderSelection` at `:560-570`). Writes to `fsbAgentProviders.clicked[clientId] = { count: <existing>+1, firstClickedAt: <first-write>, lastClickedAt: Date.now() }`. Rendering keeps passing `'current'` / `client.id` to `state.copied` unchanged — the checkmark UX and any onboarding tripwire pins depend on it.
- **D-17:** Fan clicks already pass the real client id (`onboarding.js:522-525`). Base-command copies (`:508-509`) currently pass literal `'current'` — the persist handler resolves this to `ROLL_CLIENTS[state.iconIndex].id` at write time (the current rolled client) and tags it `source: 'base'`. Fan clicks are tagged `source: 'fan'`. The `source` field distinguishes user-signal strength for Phase 58's recommended-default cascade.
- **D-18:** When the `all` client is clicked (`{id: 'all', flag: '--all'}` at `onboarding.js:44`), expand at write time to the seven flag-carrying clients: claude-code, claude-desktop, cursor, vscode, windsurf, codex, opencode. Each expanded entry is written with `source: 'all'`. `openclaw` is **excluded** — its entry has `flag: ''` and bare `cmd: 'npx -y fsb-mcp-server'`, meaning `install --all` factually does not configure it.
- **D-19:** The base-copy attribution is preserved: base copies persist (not skipped), because the rolling widget is the most prominent copy button on the screen and dropping it would undercount exactly the default path most users take. The `source` field lets Phase 58 weight fan clicks (unambiguous intent) higher than base clicks (weaker signal) if needed.

### Claude's Discretion

- Test-injection surface: whether `AgentScope.setClientInfoSupplier` also accepts a plain-object shape `{name, version}` instead of a nullable supplier (convenience for mocks). Recommended default: supplier-only, keep the type minimal; add object-shape only if the mock harness churn is proven.
- Alias-table starter contents: known aliases can be seeded from the empirical capture research (see canonical refs); populating a Codex or OpenCode alias before their adapters ship is fine but not required this phase.
- Timing of the daemon-side detection refresh (event-driven only vs periodic): recommended default is on bridge-connect and after each `install` command; a periodic sweep can be added later without protocol change.

### Folded Todos

None — no matching todos in the pending queue.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/PROJECT.md` — INV-01/INV-03/INV-04/INV-05 hard invariants, `nativeMessaging` deferral (Phase 63 scope), no-new-npm-deps constraint.
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/REQUIREMENTS.md` — IDENT-01..05 (this phase); PROV-05 (downstream consumer of the merged view; the recommended-default cascade reads from IDENT-05's return shape).
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/ROADMAP.md` — Phase 57 goal + success criteria.
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/research/SUMMARY.md` — spawner-ownership context (D-11 daemon-side detection follows this), zero-new-deps constraint, INV-01 additive discipline.
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/research/ARCHITECTURE.md` — Client-identity capture glue section (Flow 1 at :147-157 specifies the copy-click seam verbatim); `fsbAgentProviders` durable-rollup rationale (:137,175); Open Question 2 inventory-delivery mechanism (D-14 resolves it); INV-05 sunset agents note (:283-285).
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/research/STACK.md` — SDK v1.29.0 accessor verification; Node child_process caveats (Windows `.cmd` shim, no `shell: true`, `execFile` over `exec`).
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/research/PITFALLS.md` — source-pin tripwire discipline (`background.js` edits break tests; same-commit pin update); MV3 SW-eviction constraints; `fsbDispatchInternalMessage` in-SW dispatch rule.
- `/Users/lakshman/conductor/workspaces/fsb/yaounde/.planning/codebase/CONVENTIONS.md`, `.../ARCHITECTURE.md`, `.../INTEGRATIONS.md` — established patterns for storage helpers, runtime-message routing, agent-registry envelope.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`mcp/src/agent-scope.ts:53-117`** — `AgentScope.ensure()` sends the empty `agent:register` payload. Adding a lazy supplier here is a single-file additive change.
- **`mcp/src/runtime.ts:31-50`** — `createRuntime()` constructs both `agentScope` and `server` in one place; the supplier-injection seam is native.
- **`mcp/src/http.ts:125`** — per-HTTP-session runtime construction; verified that each session gets its own `AgentScope` + `McpServer`. Uniform wiring works.
- **`mcp/src/platforms.ts:437-490`** — `resolvePlatformTarget()` already implements file-mode detection with `existsSync`; imported by `install.ts:660`. Zero new detection code for 20 of 21 clients.
- **`mcp/src/index.ts:243`** — stdio runtime construction (one per process).
- **`extension/ws/mcp-tool-dispatcher.js:1935-1994`** — `handleAgentRegisterRoute` including the `stampConnectionId` pattern to clone at `:1965-1970` and the `fsbActiveAgentsCount` best-effort RMW at `:1979-1985`.
- **`extension/utils/agent-registry.js:634-648`** — `stampConnectionId` — the exact template for `stampClientInfo`.
- **`extension/ui/onboarding.js:560-570`** — `persistProviderSelection` — the exact template for `persistCopyClick`, showing how to write `chrome.storage.local` from the onboarding page.
- **`extension/ui/onboarding.js:522-525` and `:508-509`** — the two copy click sites where client id is in hand.
- **`extension/ws/mcp-bridge-client.js:390-415`** — `_routeMessage` where a new `system:client-inventory` case slots in.
- **`extension/background.js:7610`** — `fsbHandleRuntimeMessage` router where the `getMcpClients` case lands.

### Established Patterns

- **Additive optional payload fields** for wire evolution (verified by `agent-scope.ts:77-101` consumption pattern; INV-01).
- **Per-subkey read-modify-write helpers** for storage mutations that survive concurrent writers (established by dispatcher's `fsbActiveAgentsCount` pattern).
- **Same-context dispatch** in the MV3 service worker via `globalThis.fsbDispatchInternalMessage` — never `chrome.runtime.sendMessage` in-SW (auto-memory).
- **Storage envelope separation**: `agent-registry.js` owns `chrome.storage.session` for the live registry; durable rollups live in `chrome.storage.local` under separate keys.
- **Source-pin tripwire discipline**: extension-source edits must update paired tripwire pins in the same commit; test suite green from commit 1 of every phase (auto-memory).

### Integration Points

- **Downstream (Phase 58 PROV):** the `getMcpClients` merged view IS the data source for the Providers panel rendering, the recommended-default cascade (PROV-05), and the "installed / not-installed / daemon offline" 3-state UX. Return shape must be stable — Phase 58 will not amend it.
- **Downstream (Phase 60 CLAUDE):** the `claude` binary probe implemented here (D-12/D-13) is reused unchanged by the adapter contract's `detect()` for Claude Code.
- **Downstream (Phase 62 DRIFT):** `doctor` reads the same `installed` snapshot (D-11) plus adapter-version data added in that phase.
- **Upstream (existing v0.9.36):** closes the "trusted MCP client identity from handshake metadata" deferred item.
</code_context>

<specifics>
## Specific Ideas

- The alias-table module (D-09) lives at `extension/utils/mcp-client-aliases.js`. Seed content is empirical — see canonical refs "empirical clientInfo capture" research flag.
- The `source` field values on `clicked` entries (D-17) are the enumerated set `'fan' | 'base' | 'all'`; Phase 58 may or may not use them but they cost near-zero to record now.
- The daemon detection sweep timing (D-11/Discretion note) is deferred to the planner; recommended default: refresh on bridge-connect + after each `install` command; no periodic sweep this phase.
</specifics>

<deferred>
## Deferred Ideas

- **Gemini alias-table row** — no local binary was available for empirical capture; deferred to `GEMINI-FUTURE-01`.
- **UI to display the merged view** — Phase 58 Providers panel scope.
- **Recommended-default cascade** using the merged view — Phase 58 PROV-05 scope.
- **`nativeMessaging`-driven daemon wake-up** — Phase 63 NATIVE scope; irrelevant to identity capture.
- **Periodic daemon-side detection sweep** — no user need in the wild yet; add later without protocol change.
- **Object-shape convenience for `setClientInfoSupplier`** — supplier-only for now; add if mock-harness churn is proven.
- **Migration to three flat top-level `fsbAgentProviders*` keys** — kept as a clean shim if the single-key RMW race turns out to matter empirically.

### Reviewed Todos (not folded)

None — no todos returned by `todo.match-phase` for this phase.
</deferred>
