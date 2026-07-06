# Changelog

All notable changes to `fsb-mcp-server` are documented in this file. Each entry corresponds to a published npm release; FSB extension milestones map to MCP package versions in the entry header.

<a id="v0.10.0"></a>

## 0.10.0 (2026-06-17)

Milestone: FSB v0.9.90 trigger watchers. Minor release that adds the public trigger tool family while keeping the shared tool registry, dependency set, and existing browser action schemas additive.

### Added

- **Trigger Watchers tool family.** Added `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` for one-element watch flows from MCP clients. `trigger` arms a selector plus condition, `stop_trigger` cancels a watch, `get_trigger_status` reads one persisted watch, and `list_triggers` lists active or terminal watches visible to the calling agent.
- **Blocking and detached reporting.** `trigger` defaults to blocking mode with 30s `notifications/progress` heartbeats, a 120s default timeout, and a 240s safety auto-detach ceiling. `detached:true` returns immediately with the generated `trigger_id` so callers can poll status later. Blocking calls settle as `fired`, `timed_out`, `detached`, or a mapped error.
- **Live-observe and refresh-poll watch modes.** `live-observe` uses an in-page observer and pulse feedback without reload. `refresh-poll` reloads the owned tab in the background, reads the selector after the page is ready, and coalesces same-tab due watches into one reload while evaluating each trigger independently.
- **Rearm, hysteresis, and cleanup.** `rearm_on_fire:true` keeps a watch armed after a fire, with numeric hysteresis to avoid repeated fires on the same satisfied edge. Trigger snapshots clean up on TTL expiry, tab close, explicit stop, timeout, and owner release after reconnect grace.
- **Trigger runtime composition.** Same-tab opposite watch modes reject with `TRIGGER_TAB_WATCH_CONFLICT`; restricted or blocked pages write structured attention state instead of staging page text. Trigger concurrency is configurable in the extension control panel through `fsbTriggerCap` (default 8, range 1-64).

### Changed

- **Reverse-DNS rebrand.** `mcpName` / `server.json` `name` updated from `io.github.lakshmanturlapati/fsb-mcp-server` to `io.github.fullselfbrowsing/fsb-mcp-server` to match the GitHub org transfer (repository moved to `fullselfbrowsing/FSB`). The npm package name `fsb-mcp-server` is **unchanged**, so `npx -y fsb-mcp-server` and the bundled `fsb-mcp-server` / `fsb-mcp` bins keep working without modification. MCP clients that pin the reverse-DNS name in their config (e.g., `mcpServers["io.github.lakshmanturlapati/fsb-mcp-server"]` blocks) MUST update the key to `io.github.fullselfbrowsing/fsb-mcp-server`.

### Anti-scope (NOT in 0.10.0)

- No dependency bumps; `@modelcontextprotocol/sdk`, `ws`, `zod`, `strip-json-comments`, `smol-toml`, and `yaml` are unchanged from 0.9.2.
- No desktop, browser, email, SMS, or Slack push delivery. Trigger output is notify-only to the MCP caller; the caller decides any follow-up.
- No server-side monitoring, cross-browser-restart auto-resume, screenshot diffing, multi-element compound watchers, or auto-act-on-fire workflow engine.
- No publish or tag action is performed by this release prep. Final `npm publish fsb-mcp-server@0.10.0` remains user-gated.

<a id="v0.9.3"></a>

## 0.9.3 (2026-06-04)

Milestone: org-rebrand. Repository transferred from LakshmanTurlapati/FSB to fullselfbrowsing/FSB; reverse-DNS mcpName updated accordingly.

### Breaking changes

- **`mcpName` rebrand.** The MCP reverse-DNS identifier rename from `io.github.lakshmanturlapati/fsb-mcp-server` → `io.github.fullselfbrowsing/fsb-mcp-server` reflects the GitHub org transfer. The npm package name `fsb-mcp-server` is **unchanged**, so any client invoking the server via `npx -y fsb-mcp-server` (or the bundled `fsb-mcp-server` / `fsb-mcp` bin) continues to work without modification. MCP clients that pin the reverse-DNS name in their config (e.g., `mcpServers["io.github.lakshmanturlapati/fsb-mcp-server"]` blocks in Claude Desktop / Claude Code config) MUST update the key to `io.github.fullselfbrowsing/fsb-mcp-server`. Re-run the installer or update the client config manually.

### Anti-scope (NOT in 0.9.3)

- No protocol changes; the implicit visual-session contract (v0.9.0) is byte-identical.
- No dependency bumps; `@modelcontextprotocol/sdk`, `ws`, `zod`, `strip-json-comments`, `smol-toml`, and `yaml` are unchanged from 0.9.2.
- No new tools or schema-source edits (`mcp/ai/tool-definitions.cjs` untouched).

<a id="v0.9.2"></a>

## 0.9.2 (2026-05-16)

Milestone: FSB v0.9.69 follow-up. Patch release that coerces string-encoded numeric tool params (`tabId`, `tab_id`, `count`, `limit`, `topN`, etc.) so MCP clients that serialize integers as JSON strings can call the tools without being rejected at the schema gate.

### Fixes

- **Coerce string-encoded numeric params.** Some MCP clients (observed: Claude Code) serialize integer tool params as JSON strings on the wire. The server's Zod input schemas previously declared bare `z.number()`, so `mcp__fsb__switch_tab({ tabId: "695936610" })` and any other tool with a numeric field rejected with `Expected number, received string`. The `jsonSchemaToZod` translator (`mcp/src/tools/schema-bridge.ts`) now emits `z.coerce.number().finite()` for `'number'` and `z.coerce.number().int().finite()` for `'integer'`, both wrapped in a `z.preprocess` that maps `""` to `NaN` so empty-string never silently coerces to `0`. Seven hand-rolled Zod sites that bypass the translator received the same swap: `agents.ts:35` (back), `vault.ts:60` + `vault.ts:110` (fill_credential, use_payment_method), `visual-session.ts:50` (start_visual_session), `observability.ts:27/68/91` (limit, count, topN). PR #63 (commit `fae2aa01`).

### Anti-scope (NOT in 0.9.2)

- No dependency bumps; `@modelcontextprotocol/sdk`, `ws`, `zod`, `strip-json-comments`, `smol-toml`, and `yaml` are unchanged from 0.9.1.
- No protocol changes; the implicit visual-session contract (v0.9.0) is byte-identical.
- No new typed errors; the existing schema-failure error shape is preserved.
- No JSON-Schema-source edits (`mcp/ai/tool-definitions.cjs` untouched; byte-identity parity test stays green).
- Final `npm publish fsb-mcp-server@0.9.2` remains user-gated post-merge per the v0.9.0 / v0.9.1 precedent.

<a id="v0.9.1"></a>

## 0.9.1 (2026-05-16)

Milestone: FSB v0.9.69 follow-up. Patch release adding `Hermes` to the v0.9.36 shared MCP client allowlist so the implicit visual-session contract (v0.9.0) accepts `client: "Hermes"` without raising `BADGE_NOT_ALLOWED`.

### Fixes

- **Add `Hermes` to the MCP client allowlist.** Action-tool calls that pass `client: "Hermes"` previously rejected at the schema layer with the typed `BADGE_NOT_ALLOWED` error (see the v0.9.0 entry for the contract). `Hermes` is now an approved client label alongside Claude, Codex, ChatGPT, Perplexity, Windsurf, Cursor, Antigravity, OpenCode, OpenClaw, Grok, and Gemini. Closes #47 via PR #49 (commit `1512cb48`).

### Anti-scope (NOT in 0.9.1)

- No dependency bumps; `@modelcontextprotocol/sdk`, `ws`, `zod`, `strip-json-comments`, `smol-toml`, and `yaml` are unchanged from 0.9.0.
- No protocol changes; the v0.9.0 implicit visual-session contract (`visual_reason` + `client` required, sliding 60s window, `is_final: true` early-clear) is byte-identical.
- No new typed errors; `VISUAL_FIELDS_REQUIRED`, `BADGE_NOT_ALLOWED`, and `TOOL_REMOVED` retain their v0.9.0 shape.
- Final `npm publish fsb-mcp-server@0.9.1` remains user-gated post-merge per the v0.9.0 precedent.

<a id="v0.9.0"></a>

## 0.9.0 (2026-05-11)

Milestone: FSB v0.9.62 -- Implicit Visual Session Contract. BREAKING CHANGE: the explicit `start_visual_session` and `end_visual_session` MCP tools were removed; the visual session is now implicit on every action tool call via a required field bundle (`visual_reason` + `client`, optional `is_final`).

### Breaking changes

- **`start_visual_session` and `end_visual_session` removed.** Both tool names remain registered in the MCP server's `tools/list` response, but their handlers now short-circuit and return the typed `TOOL_REMOVED` error before any browser work is dispatched. The tool descriptions begin with `[REMOVED in v0.9.0]` and point at this CHANGELOG entry for the migration recipe.
- **Every MCP action tool (~36 tools) now requires `visual_reason` and `client` in its input.** Action tools in scope: `click`, `type_text`, `navigate`, `scroll`, `drag`, `select_option`, `press_key`, `press_enter`, `drag_drop`, `hover`, `focus`, `clear_input`, `check_box`, `drop_file`, `click_and_hold`, `double_click`, `right_click`, `click_at`, `scroll_at`, `double_click_at`, `drag_variable_speed`, `set_attribute`, `insert_text`, `search`, `refresh`, `go_back`, `go_forward`, `open_tab`, `close_tab`, `switch_tab`, `execute_js`, `select_text_range`, `scroll_to_top`, `scroll_to_bottom`, `scroll_to_element`, `fill_sheet`. Read-only tools (`read_page`, `get_dom_snapshot`, `get_text`, `get_attribute`, `read_sheet`, `get_page_snapshot`, `list_tabs`, `get_site_guide`, `search_memory`, `report_progress`, `complete_task`, `partial_task`, `fail_task`, `wait_for_element`, `wait_for_stable`) are UNCHANGED -- they do not carry the new fields.
- **Visual session lifecycle is implicit and sliding.** The first action tool call on a tab brings up the overlay using the supplied `visual_reason` and `client` (allowlisted badge label). Each subsequent action call on the same tab re-arms a 60-second death timer (sliding window). After 60 seconds of silence the overlay auto-clears without an explicit end call. An action call with `is_final: true` clears the overlay immediately after the action's `change_report` resolves -- no 60-second wait.
- **MV3 service-worker eviction recovery.** The sliding-window state is persisted in `chrome.storage.session` and replayed on service-worker wake; the death-timer deadline survives eviction. This follows the v0.9.36 visual-session persistence pattern.

### Migration recipe

Before (v0.8.0 / v0.9.36 explicit contract):

```text
mcp> start_visual_session(client="Codex", task="Complete checkout", detail="Preparing cart")
-> { session_token: "visual_token_123" }

mcp> navigate(url="https://example.com/cart")
mcp> click(selector="text=Checkout")
mcp> type_text(selector="#email", text="user@example.com")

mcp> end_visual_session(session_token="visual_token_123", reason="ended")
-> { success: true }
```

After (v0.9.0 implicit contract):

```text
mcp> navigate(url="https://example.com/cart", visual_reason="Complete checkout", client="Codex")
mcp> click(selector="text=Checkout", visual_reason="Complete checkout", client="Codex")
mcp> type_text(selector="#email", text="user@example.com", visual_reason="Complete checkout", client="Codex", is_final=true)
```

The visual session is created implicitly on the first action call (`navigate`), refreshed on each subsequent action call (sliding 60-second death timer), and cleared by `is_final: true` on the last action of the task (`type_text`). No separate start or end call is required.

Callers may pass `visual_reason` and `client` on every action call (the same values repeated, as in the example above), or vary `visual_reason` per call to surface step-level overlay text to the user. The `client` value MUST stay on the v0.9.36 shared allowlist for the duration of the task (cross-client switching on the same tab still rejects with the existing `TAB_NOT_OWNED` ownership gate from v0.9.60).

### Typed errors

Three new typed-error codes accompany the new contract. Each error's body is structured (code + Detected/Why/Next action) and prints the migration recipe pointer where appropriate:

- `VISUAL_FIELDS_REQUIRED` -- raised when an action tool is called without `visual_reason` or without `client`. The body next-action line names the required fields and points at the v0.9.62 contract recipe. Surfaces at the schema layer BEFORE the underlying action runs (no DOM mutation, no change_report, no overlay change).
- `BADGE_NOT_ALLOWED` -- raised when `client` is not on the v0.9.36 shared allowlist. The body next-action line enumerates the approved client labels (Claude, Codex, ChatGPT, Perplexity, Windsurf, Cursor, Antigravity, OpenCode, OpenClaw, Grok, Gemini). Surfaces at the schema layer BEFORE the underlying action runs.
- `TOOL_REMOVED` -- raised when a caller invokes `start_visual_session` or `end_visual_session` by name. The body next-action line names the new contract (required `visual_reason` + `client` on action tools, sliding 60s window, `is_final: true` for early clear) and points at this CHANGELOG entry and the Visual Session Lifecycle section of `mcp/README.md`. Short-circuits BEFORE the WebSocket bridge -- a caller of a removed tool gets the migration recipe even if the extension is offline.

### What's New In v0.9.0

- **Implicit visual session.** First action call brings up the overlay; subsequent calls re-arm a 60-second sliding window; `is_final: true` clears immediately; 60 seconds of silence auto-clears. No explicit start/end calls needed.
- **Required field bundle on action tools.** `visual_reason` (short human-readable string), `client` (allowlisted badge label), and optional `is_final` (boolean) are required on every action tool. Schemas are enforced at the MCP server's `tools/list` discovery layer and re-validated at the dispatch chokepoint.
- **Per-tab lifecycle with SW-eviction replay.** Sliding-window state persists in `chrome.storage.session`; the deadline survives MV3 service-worker eviction via chrome.alarms-based replay.
- **Ownership integration.** The v0.9.60 `TAB_NOT_OWNED` / `AGENT_CAP_REACHED` ownership gates fire BEFORE the visual-session lifecycle; cross-agent action calls reject at the dispatch gate before any session state is touched.
- **Server-side typed errors.** `VISUAL_FIELDS_REQUIRED`, `BADGE_NOT_ALLOWED`, and `TOOL_REMOVED` carry the layered Detected/Why/Next-action body shape established by v0.9.60.

### Anti-scope (NOT in v0.9.0)

- Adding visual-session fields to read-only MCP tools (reads stay silent by design).
- Autopilot `run_task` overlay management (still uses its own internal lifecycle; PARITY-FUTURE-01 remains deferred).
- New badge labels in the allowlist (governed by the v0.9.36 badge policy).
- Cross-tab / cross-window visual-session coordination (deferred).
- Freeform `client` strings (allowlist policy from v0.9.36).
- Deriving `client` automatically from MCP connection metadata (IDENT-FUTURE-01 remains deferred).
- `expected_duration_ms` duration-hint field on the bundle (PARITY-FUTURE-02 remains deferred).
- Final `npm publish fsb-mcp-server@0.9.0` is user-gated post-merge per the v0.9.60 / v0.9.61 precedent.

## 0.8.0 (2026-05-06)

Milestone: FSB v0.9.60 -- multi-agent contract, run_task return-on-completion, back tool, heartbeat, persistence with sw_evicted recovery, post-action change_report (Phase 245), agent-scoped tab resolution + open_tab background-default (Phase 246).

### Multi-Agent Tab Concurrency

- New per-session/task `agent_id` minted by FSB via `crypto.randomUUID()`. MCP callers cannot supply IDs; the server captures the ID via the `agent:register` bridge route on first tool dispatch (Phases 237, 238).
- Configurable concurrency cap, default 8, range 1-64, persisted in `chrome.storage.local` under key `fsbAgentCap`. The (N+1)th agent claim rejects with typed error `AGENT_CAP_REACHED { cap, active }` (Phases 241 plan 01, 241 plan 03).
- Tab-ownership enforcement on every MCP tool dispatch via the gate in `extension/ws/mcp-tool-dispatcher.js`. Cross-agent calls reject with `TAB_NOT_OWNED`. Incognito tabs reject with `TAB_INCOGNITO_NOT_SUPPORTED`. Cross-window tabs reject with `TAB_OUT_OF_SCOPE` (Phase 240).
- Per-bindTab `ownership_token` (fresh `crypto.randomUUID()` per binding) prevents tab-ID-reuse exploitation when Chrome recycles a tab ID after close (Phase 240, validated Phase 244 plan 01 case 6).
- Forced-new-tab pooling via `chrome.tabs.onCreated + openerTabId`: opening a forced-new tab does NOT count as a new agent against the cap; the pool releases when its last tab closes (Phase 241 plan 02).
- Lock release on: task or session ends, MCP client disconnects after a 10s `RECONNECT_GRACE_MS` keyed by `connection_id`, user closes the tab. There is no idle timeout (Phase 241 plan 02 + 241 plan 03 LOCK-04 negative-invariant test).
- Service-worker eviction recovery: agent registry mirrors to `chrome.storage.session` write-through. On SW wake, `hydrate()` reconciles persisted records against `chrome.tabs.query()` and reaps ghost records before servicing any request (Phase 237 plan 03, validated Phase 244 plan 01 case 4).
- The full multi-agent contract is exercised end-to-end by `tests/multi-agent-regression.test.js` (6 cases, currently 6/6 green).

### `back` MCP Tool (BACK-01..05)

- New ownership-gated `back` tool: single-step browser-history back on the agent's owned tab (Phase 242).
- Structured result: `{ status, resultingUrl, historyDepth }` where `status` is one of `ok`, `no_history`, `cross_origin`, `bf_cache`, `fragment_only`.
- `pageshow`-based settle verification with a 2s timeout; cross-origin transitions reuse the v0.9.11 BF-cache resilience path to re-inject the content script.
- Background-tab compatible: does not steal focus.

### `run_task` Return-on-Completion (Phase 236 reborn -- MCP-03..06)

- `run_task` now returns when the underlying automation actually completes via `fsbAutomationLifecycleBus.dispatch('automationComplete')`, rather than at an arbitrary timer ceiling (Phase 239 plan 01).
- The 300s ceiling has been raised to a 600s safety net at both `mcp/src/tools/autopilot.ts` (`timeout: 600_000`) and `extension/ws/mcp-bridge-client.js` (`RUN_TASK_SAFETY_NET_MS = 600_000`). The safety net stays provisional until UAT proves zero dropped lifecycle events (Phase 239 plan 03).
- 30s heartbeat ticks emitted via `_sendProgress` and `notifications/progress`, carrying rich fields under `params._meta`: `alive`, `step`, `elapsed_ms`, `current_url`, `ai_cycles`, `last_action`. MCP host clients (Claude Code, Cursor, Codex, OpenClaw) no longer hit per-tool timeouts on long automations (Phase 239 plan 02).
- Task lifecycle persisted in `chrome.storage.session` keyed by `task_id`. On SW eviction during a long task, the bridge reconciles in-flight tasks on reconnect and the server emits a `partial_outcome` with `disposition: 'sw_evicted'` if the bridge cannot recover (Phase 239 plan 03 D-05/D-06).
- Bounded DoS mitigation on the post-eviction snapshot lookup: 30s reconnect grace at 250ms poll cadence + 5s `sendAndWait` timeout (Phase 239 plan 03, T-239-12).

### Tool Description Updates (MCP-07)

- Every manual tool description now documents that `agent_id` is FSB-issued and required, `tab_id` is agent-scoped, the cap is configurable, ownership is enforced, and the typed error codes the tool can return are enumerated (Phase 244 plan 02).
- `run_task`, `start_visual_session`, `end_visual_session`, `back`, `stop_task`, and `get_task_status` carry the full multi-agent contract block in their MCP-side description.

### UI / Observability

- Background-tab badge (the v0.9.36 trusted-client overlay) extended with a short `agent_id` suffix, e.g. `Claude / agent_a3f1`, on the page overlay and dashboard mirror (Phase 243 plan 03 UI-01).
- Sidepanel and popup show a read-only "owned by Agent X" chip on owned tabs. Visibility only -- no enforcement decision is made in the UI; the gate lives in `mcp-tool-dispatcher.js` (Phase 243 plan 03 UI-02).
- `control_panel.html` (Advanced Settings) exposes an Agent Concurrency card: numeric input 1-64, default 8, current-active counter, helper text, and a Reset to default button. Three-layer numeric clamping is in place: HTML min/max + JS input handler + SW `setCap` (Phase 241 plan 03 UI-03).

### Background-Tab Execution

- Audited 25+ MCP and autopilot tools for `chrome.tabs.update({active: true})` and `chrome.windows.update({focused: true})` side effects. Tools that genuinely require focus opt in via a per-tool `_forceForeground` flag in `tool-definitions.js`. Default is `false`; only `switch_tab` opts in. All other tools execute on background tabs without focus-stealing (Phase 243 plan 01 BG-01).
- The dispatcher gate lives in both `extension/ws/mcp-tool-dispatcher.js` `handleSwitchTabRoute` and `extension/ai/tool-executor.js` `case 'switch_tab'`, looked up via `_mcp_getToolByName` / `_te_getToolByName`.
- `webNavigation.onCommitted` detects user-initiated navigation on agent-owned tabs and emits a pause signal so that an in-flight automation does not race a manual user action (Phase 243 plan 02 BG-04).

### Post-Action Change Report (Phase 245)

- Every action tool (non-read) now returns a compact `change_report` field describing what the action mutated, so the agent does not have to follow up with `read_page` / `get_dom_snapshot` to learn the consequence (Phase 245 plan 01-02).
- Shape: `{ url: { before, after, changed }, title_changed, dialogs_opened, nodes_added, nodes_removed, attrs_changed, inputs_changed, focus_shift, mutation_count, settle_ms, truncated }`. Cross-origin navigations emit a URL-only report with `cross_origin: true`.
- Implementation: a MutationObserver starts immediately before the action handler runs and stops after `waitForDOMStable()` resolves (or a 500ms safety net). Diff scope is rooted at the nearest stable ancestor of the target element (form, dialog, main, or 3 levels up), or `document.documentElement` for document-level actions (`navigate`, `back`, `refresh`, `scroll_to_top`).
- Filters drop the noise: style-only mutations, animation/transition class toggles, scroll-position updates, mutations to elements that stay `aria-hidden=true`, and text-only changes shorter than 3 characters.
- Size-capped at 2400 bytes (~600 tokens): top-N truncation per array (3 dialogs, 5 added, 5 removed, 8 attr changes), `truncated: true` flag, and `change_report_hint: "truncated; call read_page for full state"` sibling field.
- Coverage list (INCLUDE): `click`, `click_at`, `right_click`, `double_click`, `double_click_at`, `click_and_hold`, `type_text`, `insert_text`, `clear_input`, `select_option`, `check_box`, `press_key`, `press_enter`, `hover`, `focus`, `scroll`, `scroll_at`, `scroll_to_bottom`, `scroll_to_top`, `scroll_to_element`, `drag`, `drag_drop`, `drag_variable_speed`, `drop_file`, `fill_credential`, `fill_sheet`, `set_attribute`, `select_text_range`, `navigate`, `go_back`, `go_forward`, `back`, `refresh`, `open_tab`, `switch_tab`, `execute_js`. Read-only/info/wait tools EXCLUDED (do not return `change_report`).
- Per-tool opt-out: `scroll`, `scroll_at`, `hover`, `focus` start with `_emitChangeReport: false` (passive movements, diff is reliably noise).
- Global opt-out: `options.html` -> Advanced Settings -> "Return action change reports" toggle (default ON; persists to `chrome.storage.local` under `fsbChangeReportsEnabled`). When OFF the dispatcher skips instrumentation entirely (zero overhead).
- Cross-origin / non-DOM-accessible navigations: `url.before`, `url.after`, `url.changed: true` are populated via `chrome.tabs` API; all other fields default to empty arrays / nulls; `cross_origin: true` is added so the agent knows DOM-level info is unavailable.
- Performance: <5ms observer overhead per action (measured against the v0.9.36 dom-stream perf fixture); <10ms serialization budget; <25ms p95 added latency target. If the 500ms safety net trips, `change_report.partial: true` is set so the agent knows the report is best-effort.

### Agent-Scoped Tab Resolution + open_tab Background-Default (Phase 246)

- New keystone helper `extension/utils/agent-tab-resolver.js` exports `resolveAgentTabOrError(agentId, params, client)` consumed by all 3 MCP tool families: read tools, visual session, and action tools (Phase 246 plan 01).
- Resolver branches: `legacy:popup`/`legacy:sidepanel`/`legacy:autopilot` agents fall through to the user's active tab via `_getActiveTab(client)` and return `skipGate: true` (preserves Phase 240's tab-arm-skip path for the legacy single-agent surfaces). Non-legacy MCP agents resolve via `registry.getAgentTabs(agentId)`: 1 owned tab -> use it; 0 owned -> typed error `NO_OWNED_TAB`; 2+ owned -> typed error `AMBIGUOUS_TAB` requiring explicit `tab_id` (Phase 246 plan 01-02).
- All 5 `_getActiveTab()` callers in `extension/ws/mcp-bridge-client.js` (`_handleGetDOM`, `_handleReadPage`, `_handleExecuteAction`, `_handleFillCredential`, `_handleUsePaymentMethod`) and the dispatcher's `handleGetPageSnapshotRoute` and `handleStartVisualSessionRoute` now route through the resolver. The resolved tabId is folded back into `routeParams` so Phase 240's `checkOwnershipGate` tab-arm fires for every non-creating MCP tool call -- closing the gap that previously let cross-agent action calls slip through (Phase 246 D-16).
- Optional `tab_id?: number` added to all 6 read tool MCP schemas (`read_page`, `get_dom_snapshot`, `get_text`, `get_attribute`, `read_sheet`, `get_page_snapshot`), `start_visual_session`, and 35 action-tool input schemas. Auto-resolves when omitted (single-tab agents pay no friction); enforces ownership when provided (Phase 246 plan 01-02).
- `mcp/src/tools/read-only.ts` overturns the Phase 238 D-06 "scope discipline -- read-only is signature-parity only" rule: agentId + optional tab_id are now threaded through every read-only tool's bridge payload (Phase 246 D-02).
- `mcp/src/tools/vault.ts` overturns the analogous `void agentScope` exemption: `fill_credential` and `use_payment_method` are now agent-scoped and route through the dispatch gate (Phase 246 D-13 vault overturn).
- 5 `PARAM_TRANSFORMS` entries in `mcp/src/tools/schema-bridge.ts` (`press_key`, `drag_drop`, `click_at`, `drag`, `fill_sheet`) explicitly forward `tab_id` so the schema rebuild does not silently drop it (Phase 246 RESEARCH Pitfall 1 closure).
- `extension/ws/mcp-tool-dispatcher.js` `handleOpenTabRoute` now defaults to background: `chrome.tabs.create({ active: params.active === true })`. Callers that legitimately need foreground must pass `active: true` explicitly. Phase 240 D-08 contract preserved -- `bindTab` still fires on success and the response carries `tabId` + `ownershipToken` (Phase 246 D-05).
- `back` tool schema parameter renamed from `tabId` (camelCase) to `tab_id` (snake_case) for consistency with the rest of the v0.9.60 multi-agent surface (Phase 246 follow-up). Internal extension dispatch still uses camelCase per the snake_case-MCP / camelCase-extension boundary rule.
- `end_visual_session` tool description corrected: it does NOT accept a `tab_id` parameter (the `session_token` identifies the tab); the description previously over-claimed the multi-agent contract block (Phase 246 follow-up).
- `mcp/src/tools/autopilot.ts` `run_task` description correction: removed misleading "tab_id is agent-scoped" sentence; `run_task` is task-level and does not accept a per-call `tab_id` (Phase 246 plan 03 task 4).
- `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs` remain byte-identical (~74,845 bytes); a permanent canary at `tests/tool-definitions-parity.test.js` (Buffer.compare === 0) prevents future drift (Phase 246 plan 03 closes RESEARCH Pitfall 2).

### Dependencies

- `@modelcontextprotocol/sdk` upgraded from `^1.27.1` to `^1.29.0`. Build is clean against the new SDK; no TypeScript breakage from the minor bump.
- `zod` stays on `^3.x`. `ws`, `strip-json-comments`, `smol-toml`, and `yaml` are unchanged.

### Migration Notes

- Existing single-agent surfaces (popup, sidepanel, autopilot) continue to work unchanged via synthesized `agent_id = 'legacy:<surface>'`. There is no v0.9.36 / v0.9.50 regression.
- MCP clients that currently send an `agent_id` field will have it ignored. The server captures the authoritative ID via `agent:register` and reflects it on the response so the client-side `AgentScope` can pin it for the lifetime of the connection.
- The default cap of 8 is sufficient for almost all multi-agent workflows. Raise it via the Agent Concurrency card in `control_panel.html` if needed (range 1-64).
- The `back` tool is additive. Clients that previously chained `execute_js("history.back()")` will keep working, but the typed `back` tool returns the structured status field and is the recommended path going forward.
- **Phase 245 -- `change_report` is additive.** Existing tool response fields (`success`, `message`, tool-specific fields) stay byte-identical. Clients that ignore the new `change_report` field continue to work unchanged. To opt out globally, set `fsbChangeReportsEnabled = false` in `chrome.storage.local` (or use the Advanced Settings toggle).
- **Phase 246 -- `open_tab` default flipped to background.** Callers that relied on the previous implicit-foreground behavior (no `active` field passed) will now open tabs in the background. Pass `active: true` explicitly to restore the prior UX. This affects MCP `open_tab` calls only; legacy popup/sidepanel/autopilot UI flows that drive `chrome.tabs.create` directly are unchanged.
- **Phase 246 -- multi-tab MCP agents must pass `tab_id`.** Single-tab agents auto-resolve via the registry (no caller change). Agents that own 2+ tabs and call read/visual/action tools without `tab_id` now receive a typed `AMBIGUOUS_TAB` error and must pass `tab_id` to disambiguate.
- **Phase 246 -- `back` tool parameter renamed.** `tabId` -> `tab_id` (snake_case) for consistency with the rest of the v0.9.60 multi-agent surface. v0.8.0 is the first published release with `back`, so there are no live callers to migrate.
- **Phase 246 -- read-only and vault tools now agent-scoped.** Tools previously exempted from agent identity injection (`mcp/src/tools/read-only.ts`, `mcp/src/tools/vault.ts`) now thread `agent_id`/`ownership_token`/`connection_id` through their bridge payloads. Callers driving these tools through a registered MCP client with an active `AgentScope` see no behavior change.

### Tests

- New: `tests/multi-agent-regression.test.js` (10 cases -- 6 from Phase 244 plan 01 + 4 added in Phase 246 plan 03 covering the resolver + gate composition, legacy:* skipGate after user tab switch, and ambiguous multi-tab routing).
- New (Phase 245): `tests/change-report-builder.test.js`, `tests/change-report-dispatcher.test.js`, `tests/change-report-toggle.test.js`, `tests/change-report-read-tools-excluded.test.js`.
- New (Phase 246): `tests/agent-tab-resolver.test.js`, `tests/read-tool-tab-resolution.test.js`, `tests/visual-session-agent-scoped.test.js`, `tests/action-tool-agent-scoped.test.js`, `tests/open-tab-background-default.test.js`, `tests/tool-definitions-parity.test.js` (Buffer.compare canary closing RESEARCH Pitfall 2).
- Extended (Phase 246): `tests/legacy-agent-synthesis.test.js`, `tests/visual-session-reentry.test.js`, `tests/ownership-error-codes.test.js`, `tests/agent-id-threading.test.js`.
- Updated: every Phase 237-244 test passes UNCHANGED against this 0.8.0 build (per Phase 244 VALIDATION.md SC#1 + Phase 246 verification).

## 0.7.4 (prior release)

See the README "What's New In v0.7.4" section for details. Headline items:

- Bridge lifecycle reconnect across service worker wakes.
- Hub/relay coordination for multiple MCP server instances.
- Route-aware tool dispatch and centralized parameter mapping.
- Layered diagnostics through `doctor` and `status --watch`.
- Persistent visual session glow across content script reinjection.
- Secure vault tools that avoid sending raw secrets over the bridge.
- One-command installer coverage for 21 platforms.
