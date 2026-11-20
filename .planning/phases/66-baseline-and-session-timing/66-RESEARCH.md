# Phase 66: Baseline and Session Timing - Research

**Researched:** 2026-09-29
**Domain:** MV3 service-worker instrumentation (MCP ingress, session recorder, Lattice journal, autopilot loop), provider usage/cost accounting, and an on-request Node benchmark harness (fixture server, headless Claude Code driver, MCP SDK client, bootstrap statistics)
**Confidence:** HIGH for code integration points and tripwires (read and probed in this session); MEDIUM for the live benchmark topology (Chrome/native-host/pairing behaviour partly documented, partly inferred); MEDIUM for xAI facts (official docs, but the response `model` string after redirect is undocumented)

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

#### Change footprint and compatibility
- **D-01:** Keep the MCP diff minimal: Phase 66 changes no source file under `mcp/`. The extension does the work (timing capture, the session-detail fix, run identity, cost labels), and the benchmark lives in `scripts/bench/`. `fsb://config` already passes the extension's payload through unchanged (`mcp/src/resources/index.ts:138-162`), so identity fields are an extension-only edit.
- **D-02:** Every Phase 66 change is additive and does not change behavior:
  - Autopilot decisions, action execution, tool names, schemas, descriptions and response shapes stay as they are, apart from added optional fields.
  - The one intended behavior change: `get_session_detail` returns journal sessions instead of "not found".
  - Milestone-wide rule from the user: with Jev disabled, FSB behaves exactly as it does today.
- **D-03:** No MCP-server-side timestamps in this phase. Time spent in the MCP `TaskQueue` is labelled "not measured" and is never quietly folded into another figure. Caller gap is the extension's receive time for call n minus its completion time for call n−1; both are measured on the same machine.

#### Timing capture and storage
- **D-04:** MCP per-call timing is captured in the extension, where calls arrive (`_handleMessage`, `extension/ws/mcp-bridge-client.js` ~1144-1199).
  - It travels to both recording paths on a hidden symbol property, the same pattern as `MCP_REPLAY_RECORD_CONTEXT` (`extension/ws/mcp-tool-dispatcher.js` ~160).
  - It is stored, with a completion time, as an added optional `metadata.timing` field on the journal `tool.call` event.
  - It is never added to tool responses and never written to `chrome.storage.local` on each call.
  - Do not compute call time from journal event timestamps: they include IndexedDB write-queue delay.
  - Do not put timing on the `beginCall` identity: `tests/mcp-session-recorder-journal.test.js:92` deep-equals it.
- **D-05:** Autopilot records, for each iteration, model time (from `apiCallStartTime`, `extension/ai/agent-loop.js` ~1936) and each tool's time (the span between the `BEFORE_TOOL_EXECUTION` and `AFTER_TOOL_EXECUTION` hooks). Both must survive `automationLogger.saveSession` and the `sanitizeActionHistoryEntry` allowlist. A value that was not measured is null or omitted, never 0. Today `createActionEvent.durationMs` defaults to 0 and is dropped on save.
- **D-06:** The headline metric is wall time per completed task, measured by the benchmark runner's own clock. Session `endTime` is never the metric:
  - `closeIdleRun` (60 s idle alarm, `mcp-lattice-journal.js` ~1530) sets `endTime` late.
  - `saveSession` resets `endTime` on every save.
  - Runs closed with `idle_timeout` are flagged, and their idle tail is excluded.

#### Session detail and operator surface
- **D-07:** `handleGetSessionMessageRoute` gets a journal-first branch, mirroring the control-panel lookup at `extension/background.js` ~12496-12536. Lookup order:
  1. `globalThis.FsbMcpLatticeJournal`: `hasSession`, then `getSessionDetail`
  2. the legacy `loadSession`
  3. in-flight sessions

  The branch is skipped when the journal module is missing, which `tests/mcp-in-flight-session-lookup.test.js` requires. `format:'text'` goes to the journal's `exportHumanReadable`.
- **D-08:** The response keeps the existing `{success:true, session:{...}}` envelope.
  - Journal `tool.call` events become a sanitized `session.actionHistory` with timing fields added. The control panel already does this conversion (`extension/ui/options.js` ~3444-3476).
  - Raw journal events, which carry the full request and result payloads, are never returned.
  - `get_session_detail` gains no new parameters: MCP-04 allows only `expect`. This overrides the research suggestion of `afterSequence`/`limit`.
- **D-09:** Operators see timing in:
  - `get_session_detail` JSON
  - its text export, which gains per-call milliseconds
  - the benchmark report

  The control-panel session viewer does not change. (User: 5a.)

#### Tokens and cost
- **D-10:** Autopilot cost comes from the provider when it reports one. For xAI that is `usage.cost_in_usd_ticks` (10^10 ticks = $1; when streaming, only the final chunk has it).
  - The price-table figure becomes a labelled fallback estimate. Each iteration records `usageSource`/`costSource`.
  - Session and baseline records mark values "unavailable" or "estimate" instead of inventing them at these three places:
    - `usage.input || 0` (`agent-loop.js` ~2007)
    - unknown models priced as Grok (`cost-tracker.js` ~85-88)
    - `totalCost || 0` (`automation-logger.js` ~884)
  - Reasoning tokens are included in cost estimates. They are reported separately from `completion_tokens` (`completion_tokens_details.reasoning_tokens`) and billed at the output rate.
- **D-11:** Update the Grok rows of the `extension/ai/cost-tracker.js` price table. xAI retired `grok-4-1-fast` on 2026-08-15, and that name is now served by grok-4.3 at $1.25 input / $2.50 output per million tokens. The table still says $0.20 / $0.50. (User: 4a.)
- **D-12:** For MCP sessions, FSB marks the calling host's model time, tokens and cost as unavailable. Caller gap is labelled an upper bound on the host's thinking time. Host metrics come only from the benchmark driver:
  - **Claude Code:** the `result` event supplies `duration_ms`, `duration_api_ms`, `num_turns`, `usage` and `modelUsage`. `total_cost_usd` is labelled "list-price estimate, not billed" when `apiKeySource` is `none` or `costBasis` is `list`.
  - **Cursor:** reports duration only; tokens and cost are "unavailable (host does not report)".
  - v0.9.91 made the same call for agent dollar cost (`usd = null`, `extension/utils/delegation-event-store.js` ~569).

#### Benchmark suite
- **D-13:** The benchmark is plain Node scripts in a new `scripts/bench/`: a runner, a report, statistics helpers, and a fixture server on 127.0.0.1 with local fixture pages.
  - It runs only on request, never in `npm test` or CI.
  - It adds no dependencies. The MCP client comes from `mcp/node_modules`, with the SDK kept at 1.29.0.
  - Precedent for a fixture server plus Chrome as an opt-in test: `tests/screenshot-uat.test.js`.
- **D-14:** How each arm is driven:
  - **MCP arm:** scripted headless Claude Code, launched from `scripts/bench/` with the pinned v0.9.91 flags (`mcp/src/agent-providers/claude-profile.ts` ~179-207). Nothing under `mcp/` changes (D-01).
  - **Optional Cursor arm:** scripted with `cursor-agent -p --output-format stream-json`.
  - **Autopilot arm:** `run_task` from an SDK stdio client, with an API-kind provider selected. An agent-kind provider returns a consent response before the autopilot loop runs (`background.js` ~13639-13647).
- **D-15:** Tasks: a core set on local fixture pages stays unchanged through Phase 71, and only this set is used for the release comparison. A small live-site set (UAT- and Jira-style reading) is reported separately and does not count toward the release gate. (User: 2, recommended.)
- **D-16:** Size: about 12 core tasks (6 mixed, 6 click-heavy) × 10 alternating runs per arm × 2 baseline arms (autopilot, Claude Code MCP), roughly 240 runs. The baseline must collect enough for Phase 71's method:
  - Headline: the geometric mean of per-task median ratios, with a hierarchical bootstrap CI (resample tasks, then runs within each task).
  - Per-task CIs are descriptive only.
  - A CI that crosses 1.0 is reported as "inconclusive".
  - Five runs per task is a smoke test only.

  (User: 3, recommended.)
- **D-17:** Success is decided by code, from evidence independent of both FSB and the agent:
  - Fixture tasks: the fixture server's log of submitted requests, the final URL, and DOM markers.
  - Live tasks: URL and text checks after the timed window.
  - Agent claims are stored as "claimed" only and never count as proof: autopilot `end_turn`/DONE, `complete_task`, and `run_task` success, including `partial_outcome:'timeout'`.
- **D-18:** Each run records its identity:
  - git SHA
  - extension manifest version and the ID of the extension actually loaded
  - MCP server version and SDK version
  - provider kind, requested model, and the model string the provider returned
  - host name, version and model
  - host tool-loading mode. For Claude Code: whether `init.tools` contains `ToolSearch` or `WaitForMcpServers`, plus the `ENABLE_TOOL_SEARCH` value it was launched with.
  - task ID and version, and a hash of the fixture content
  - the MCP tool count and a hash of the `tools/list` payload, read by the runner through its own SDK client. The tool list changes in Phases 66.1 and 69, so later comparisons must account for it.

  In the extension, fix `_handleGetConfig` (`mcp-bridge-client.js` ~2702). It currently reads keys that nothing writes. It should return the keys that exist (`providerKind`/`modelProvider`/`modelName`, `extension/config/config.js` ~18-21) plus the manifest version. The change is read-only, and `fsb://config` is a resource, not a tool.
- **D-19:** The autopilot baseline pins an explicit current xAI model ID instead of the retired `grok-4-1-fast` name, and records the model string xAI returns. Changing FSB's product default model is not part of this phase. (User: 4a.)
- **D-20:** The runner saves each run's detail to disk as soon as the run ends. Before any new recording, it exports the 40 recorded MCP sessions from 2026-09-16..21. History keeps 50 sessions per mode and the journal keeps 30 days, so those sessions would be pruned around 2026-10-16..21, sooner as benchmark runs push them out.
- **D-21:** Raw session exports stay local and out of git, because they can contain page content from real sites. Only sanitized per-run metrics, identity and aggregates are committed as the baseline.

### Claude's Discretion
- Autopilot timing capture: a new hook module (e.g. `extension/ai/hooks/timing-hook.js`) or inline stamps. Weigh the tripwires:
  - A new module raises the pinned `importScripts` count (333, `tests/lattice-provider-bridge-smoke.test.js:634-635`).
  - Editing `agent-loop.js` touches pinned counts such as the 8 `setTimeout` tokens and fixed anchor text.
- The exact xAI model ID to pin (a current grok-4.3 variant), confirmed during research.
- Where the committed baseline artifacts live (`scripts/bench/results/` or the phase directory), within D-21.
- The exact fixture tasks, the internal layout of the benchmark scripts, and the report format.
- Whether the text export shows per-call timing as columns or inline.

### Deferred Ideas (OUT OF SCOPE)
- **MCP settings tool.** Shows all control-panel settings compactly and sets any one of them, including the Jev fast-mode toggle once Phase 68 adds it.
  - Reads hide secrets.
  - Writes may change any setting except secrets and credentials; the user chose this over an allowlist.
  - The user approved this new tool on 2026-09-29, and it is inserted as **Phase 66.1**. MCP-04 and the out-of-scope entry against a second user-facing fast-mode switch are amended to match.
- **FSB's default autopilot model has been retired.** Requests for `grok-4-1-fast` are now served by grok-4.3, at about 5-6× the cost FSB assumes. Updating the product default is a separate fix; Phase 66 only pins the model the benchmark uses (D-19).
- **MCP-server-side timestamps** (`serverReceivedAt`, measured `TaskQueue` wait). Add these later only if runs with concurrent agents need queue wait separated from caller gap (D-03).
- **Per-call timing columns in the control-panel session viewer.** Not planned (D-09).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEAS-01 | An operator can inspect per-call wall time, FSB execution time, model time, tokens, and cost for both MCP and autopilot sessions, with unavailable values labelled rather than invented. | MCP ingress stamp + journal `metadata.timing` (Pattern 1); autopilot `iterationTiming`/`durationMs` inline stamps (Pattern 4); provider-first usage/cost with labels (Pattern 5); explicit `measurement` projection that survives the `/token/i` key filter (Pitfall 1); host metrics from the driver only (Pattern 8). |
| MEAS-02 | An operator can retrieve session details for a journal-backed MCP session, including its tool calls and timing records. | Journal-first branch in `handleGetSessionMessageRoute` with paging, `actionHistory` projection built through the existing `sanitizeActionHistoryEntry`, text export through `exportHumanReadable` (Patterns 2-3); vm-harness guard (Pitfall 4). |
| MEAS-03 | An operator can run a repeatable, outcome-checked task suite and save a baseline of completion rate, wall time per completed task, and cost before enabling Jev. | `scripts/bench/` runner, fixture server with request-log evidence and post-window CDP checks (Pattern 7), run identity via the fixed `fsb://config` + runner's own SDK client (Pattern 6), hierarchical bootstrap helper (Pattern 9), history export of the 40 sessions (Pattern 10), bench topology preflight and human checkpoints (Plan Decomposition). |
</phase_requirements>

## Summary

All three requirements are reachable with extension-only changes plus a new `scripts/bench/` tree, exactly as D-01 prescribes. Every integration point named in CONTEXT.md was re-read at its current line numbers (drift was small; see the Integration Point Index). Four findings from this session change how the work must be done and are not in CONTEXT.md or the prior research:

1. **`get_session_detail` strips every key containing "token".** `sanitizeValue` drops keys matching `/password|...|token|.../i` (`mcp-tool-dispatcher.js:2027-2046`). A probe of the current route (run in this session) returned a saved autopilot session with `totalInputTokens`, `totalOutputTokens`, `inputTokens`, `outputTokens` and `reasoningTokens` all removed, and `actionHistory[].durationMs` removed by the allowlist. Tokens are therefore invisible over MCP today, and any new field named `*Tokens` would silently vanish. MEAS-01 needs an explicit, post-sanitization `measurement` projection, and stored field names should avoid the substring "token".
2. **FSB's price table misprices the pin target.** `estimateCost('grok-4.3', 1e6, 1e6)` returns **$18.00** today because the substring fallback matches the legacy `grok-4` row ($3/$15); the true list price is $3.75. Unknown models such as `claude-sonnet-4-6` (which FSB's own model list offers) are priced as Grok ($0.70). D-11 must add exact `grok-4.3` rows ahead of the legacy keys, and the benchmark must prefer `usage.cost_in_usd_ticks`.
3. **The autopilot request path is non-streaming and returns the raw xAI body unchanged** (`offscreen/lattice-host.js:878-906` → `lattice-provider-bridge.js:235` → `agent-loop.js:1954`). `usage.cost_in_usd_ticks`, `usage.completion_tokens_details.reasoning_tokens` and `response.model` are already on the `response` object in the loop; no request change is needed.
4. **Cross-agent verification through FSB is impossible by design**, so D-17 evidence must come from outside FSB: `list_tabs` returns only the caller's own tabs (`mcp-tool-dispatcher.js` `handleListTabsRoute`), and the runner's SDK client is a different agent from Claude's. Fixture evidence therefore comes from the fixture server's request log, and DOM markers / final URL / tab cleanup come from a post-window CDP check against a dedicated bench Chrome profile.

The live benchmark is the riskiest part, and the risk is operational rather than code: the worktree extension must be side-loaded (the everyday Chrome runs the Web Store build `badgafnf…`), bridge pairing is pinned to one extension origin in `~/.fsb/bridge-auth.json`, the FSB native host manifest allows only the Web Store origin, the extension hard-codes hub port 7225, and branded Chrome 137+ ignores `--load-extension`. The recommended topology is a dedicated `--user-data-dir` bench profile with its own `NativeMessagingHosts/` manifest copy, a runner-owned hub on 7225, and explicit human checkpoints for loading, pairing and restoring.

**Primary recommendation:** Build in four parallel code tracks (MCP timing capture; session-detail + measurement projection; autopilot timing + provider cost; bench helpers + fixtures), keep all timing out of tool responses and out of per-call `chrome.storage.local` writes, add no service-worker module (inline stamps, zero `importScripts` churn), pin `grok-4.3`, and gate the live campaign behind a runner preflight that refuses to run unless `fsb://config` proves the Phase 66 build, model and topology.

## Project Constraints (from CLAUDE.md, STATE.md and operator memory)

There is no `./CLAUDE.md` (it is gitignored under "Development files"). Actionable constraints that carry the same weight:

| Source | Directive |
|--------|-----------|
| `~/.claude/CLAUDE.md` (user global) | Never add "Co-Authored-By" or AI attribution lines to commits, PR descriptions or pushes. |
| STATE.md INV-01 | MCP wire is byte-stable; additions are optional fields only. |
| STATE.md INV-03 | `universal-provider.js` sees only the 7 API-kind providers. Do not route benchmark or Jev logic through it. |
| STATE.md INV-04 | `setTimeout`-chained iterator preserved; `agent-loop.js` must keep exactly 8 `setTimeout` tokens (comments count) and the 4 schedule lines byte-identical. |
| STATE.md tripwire discipline | Every extension-touching commit updates its paired source-pin tests in the same commit; full suite green from the phase's first commit. |
| STATE.md same-context dispatch | Inside the SW use `globalThis.fsbDispatchInternalMessage` (typeof-guarded), never `chrome.runtime.sendMessage`, to reach background handlers. |
| Operator memory: test chain | `npm test` is one `&&` chain; it halts at the first port-bound suite if 7225 is held. Free the hub and stray `mcp/build/index.js` relays before a full run. |
| Operator memory: CI Node 20 | CI runs Node 20 (`.github/workflows/ci.yml:22`); root `engines` says ≥24. CI-run tests must avoid Node 22+ globals (`WebSocket`, `Object.groupBy`, `Promise.withResolvers`, `crypto.hash`, `fs.globSync`, `process.getBuiltinModule`). |
| Operator memory: minimal MCP diff | Touch `mcp/src` only when a tool schema must change (none in this phase). |
| Operator memory: pre-existing failures | On clean main, `tests/mcp-lifecycle-smoke.test.js` (in `test:mcp-smoke`) fails 0/5, and 6 unscripted tests fail. Not Phase 66's fault; do not "fix" them in this phase. |
| Operator memory: MCP driving | Visual-session `client` labels must come from the badge allowlist ("Claude", not "claude-code"); never pass device-emulation args to `capture_screenshot` in the suite (wedges the per-tab CDP lease). |
| `tests/delegation-phase-contract.test.js:129-155, 2373-2391` | New root test commands must be appended to the `package.json` `test` chain **and** listed in `REFINEMENT_ROOT_TEST_COMMANDS`; never edit the `PRE_PHASE6x_ROOT_TEST_HASH` values. |
| `tests/mcp-client-identity-integration.test.js:469-486` | Append new chain entries at the tail; do not reorder existing ones. |
| `.gitignore` | Global `build/`, `dist/`, `*.log` ignores exist; do not name bench output dirs `build` or `dist`. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-call MCP timing capture (receive, completion) | Extension SW (`mcp-bridge-client.js` ingress, dispatcher recorder hook) | — | D-01/D-03: single machine clock at the extension's MCP ingress; no server stamps. |
| Timing persistence | Extension storage: Lattice journal (IndexedDB) `tool.call.metadata.timing` | Legacy recorder → `fsbSessionLogs` via `saveSession` (legacy-only clients) | Append-only IDB; never per-call `chrome.storage.local` writes (D-04). |
| Caller gap / host-think upper bound | Projection time (dispatcher projection, journal text export, bench report) | — | Derived, never stored; depends on neighbouring calls. |
| Autopilot model/tool time, usage, cost labels | Extension SW (`agent-loop.js` inline stamps, `cost-tracker.js` pure helpers) | `automation-logger.js` persistence | The loop already owns `apiCallStartTime` and the tool bracket; the logger owns durable history. |
| Session detail over MCP (MEAS-02) | Extension SW dispatcher route | MCP server passes through unchanged | D-01: no `mcp/` change; the tool already forwards `{sessionId, format}`. |
| Run identity (`fsb://config`) | Extension SW `_handleGetConfig` | MCP resource passes through (`mcp/src/resources/index.ts:138-162`) | Read-only allowlisted projection. |
| Wall clock per task, outcome evidence, statistics | Benchmark runner (Node, `scripts/bench/`) | Fixture server (Node http), CDP post-window check | D-06, D-17: independent of FSB and the agent. |
| Host (Claude Code/Cursor) model time, tokens, cost | Benchmark driver (stream-json parser) | — | D-12: FSB cannot observe host internals. |

## Standard Stack

### Core (all already present; nothing to install)

| Library / Runtime | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (`node:http`, `node:crypto`, `node:child_process`, `node:test`, `node:assert`, `node:fs`) | Node 24.14.1 local, Node 20 in CI [VERIFIED: `node --version`, `.github/workflows/ci.yml:22`] | Fixture server, hashing, spawning `claude`, unit tests | D-13: no dependencies; matches `tests/screenshot-uat.test.js` precedent. |
| `@modelcontextprotocol/sdk` (from `mcp/node_modules`) | 1.29.0 [VERIFIED: `mcp/package.json` dependency pin; installed copy at `/opt/homebrew/lib/node_modules/fsb-mcp-server/node_modules/@modelcontextprotocol/sdk/package.json` = 1.29.0] | Runner's own client: `Client`, `StdioClientTransport` (`client/stdio.js`), `listTools`, `readResource`, `callTool`, `getServerVersion` | D-13; already the product's SDK. Resolve with `createRequire(path.join(repo,'mcp','package.json'))`, following `tests/mcp-bridge-topology.test.js:11`. |
| `ws` (from `mcp/node_modules`) | as locked in `mcp/package-lock.json` | CDP client in the runner (post-window checks, tab cleanup) | Node 20-safe alternative to the global `WebSocket`; precedent `tests/mcp-smoke-harness.js:10`. |
| Claude Code CLI | 2.1.283 installed [VERIFIED: `claude --version`] | MCP arm host | D-14. |
| cursor-agent CLI | 2026.09.08-6caf4ff installed [VERIFIED: `cursor-agent --version`] | Optional Cursor arm | D-14 (optional). |
| esbuild (root devDependency, via `npm run build`) | as locked | Builds `extension/dist/offscreen/lattice-host.js`, which the offscreen host loads (`extension/offscreen/lattice-host.html:35`) | Required before side-loading the worktree extension; `extension/dist/` is gitignored. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Google Chrome (branded) | installed; version recorded by the runner from CDP `/json/version` | Bench browser with a dedicated `--user-data-dir` and `--remote-debugging-port=0` | Always for the live campaign. |
| Chrome for Testing / Chromium | not installed | Would allow `--load-extension` automation | Not recommended in this phase (adds a download step; D-13 spirit). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline timing stamps in `agent-loop.js` | New `extension/ai/hooks/timing-hook.js` | A hook module adds +1 to both `importScripts` pins (333/329) and a registration edit, but `agent-loop.js` must still change (the `AFTER_API_RESPONSE` context lacks model time and the provider usage fields), so the module saves nothing. Recommend inline. |
| Fixture-server request log + post-window CDP | FSB read tools from the runner's own agent | FSB read tools are agent-scoped (`list_tabs` returns only owned tabs) and are not independent of FSB (violates D-17). |
| An in-page telemetry probe posting DOM state | Server-visible effects of the fixture app itself | A probe that sends requests on DOM mutations would lengthen FSB's network-quiet settle wait (a click waits for 200 ms of network quiet) and distort FSB execution time. |
| Dedicated bench Chrome profile | Side-load into the everyday Profile 2 | Profile 2 carries real browsing state (other tabs/extensions = timing noise) and its IndexedDB holds the 40 sessions; a separate profile also keeps bench recordings from evicting them. Profile 2 is only attractive for logged-in live-site tasks. |

**Installation:** none. Environment setup for a fresh worktree (this worktree has no `node_modules` at all [VERIFIED: `ls`]):

```bash
npm install --no-audit --no-fund            # root (esbuild, tsx, test deps)
npm --prefix mcp ci --no-audit --no-fund    # MCP SDK 1.29.0, ws, zod 3
npm --prefix mcp run build                  # full mcp/build (only 6 files are tracked)
npm --prefix showcase/server install        # server-telemetry suites in the npm test chain
npm run build                               # extension/dist/offscreen/lattice-host.js
```

## Package Legitimacy Audit

This phase installs **no external packages**. The benchmark imports `@modelcontextprotocol/sdk` 1.29.0 and `ws` from the existing `mcp/package-lock.json`, which CI already installs with `npm --prefix mcp ci`. slopcheck was not run because there is nothing new to vet.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌────────────────────── benchmark runner (Node, scripts/bench) ──────────────────────┐
                         │  preflight ─► identity (git SHA, tree hash, fsb://config, tools/list hash)         │
 task JSON ──► scheduler │  ABBA-alternating runs ─► t0 ─► arm driver ─► t1 ─► evidence ─► outcome check      │
 (core/live)             │                                  │                    ▲            │                 │
                         │                                  │                    │            ▼                 │
                         │                                  │           fixture server   per-run JSON (raw,    │
                         │                                  │           request log      gitignored) + metrics │
                         │                                  │           + CDP post-window (committed, sanitized)│
                         └──────────────────────────────────┼─────────────────────────────────────────────────┘
                                                            │
        ┌───────────────────────────────┬───────────────────┴───────────────────────┐
        ▼ MCP arm                       ▼ autopilot arm                              ▼ observability (runner client)
  claude -p (pinned v0.9.91 flags)   runner SDK client: open_tab(startUrl)       list_sessions / get_session_detail /
  stream-json ─► init/result events     then run_task(task) [timed]              readResource(fsb://config) / listTools
        │ stdio                          │ stdio                                   │
        ▼                                ▼                                         ▼
  FSB MCP server (relay) ──────────► FSB MCP server = HUB on 127.0.0.1:7225 (runner-owned, workspace build)
                                                   │ ws (bridge-auth pinned to the unpacked extension origin)
                                                   ▼
  Chrome bench profile ─► unpacked worktree extension SW
     _handleMessage: [stamp receivedAt on hidden Symbol] ─► route ─► execute (+ change_report settle)
        ─► recorder entry.timing {receivedAt, completedAt, fsbMs} ─► journal tool.call.metadata.timing (IndexedDB)
     autopilot loop: apiCallStart ─► provider (offscreen fetch, non-streaming xAI) ─► usage/cost labels
        ─► tool bracket (after permission check) ─► actionHistory.durationMs + iterationTiming ─► saveSession
     get_session_detail: journal-first ─► paged tool.call projection + explicit measurement block ─► JSON / text
                                                   │
                                                   ▼
                                  fixture pages on http://127.0.0.1:<port>/r/<runToken>/...
                                  (form POSTs / save fetches logged server-side = primary evidence)
```

### Recommended Project Structure

```
scripts/bench/
├── run-bench.mjs            # CLI: preflight, schedule, drive arms, save per-run detail immediately
├── report.mjs               # CLI: aggregate runs → summary.json + report.md (+ A/A noise floor)
├── export-history.mjs       # CLI: turn the raw 40-session export into sanitized per-call metrics
├── fixture-server.mjs       # node:http on 127.0.0.1:0; /r/<token>/ prefix; request log; evidence endpoint
├── lib/
│   ├── stats.mjs            # median, quantile, wilson, mulberry32, hierarchical bootstrap (pure)
│   ├── outcome.mjs          # evaluateOutcome(task, evidence) (pure)
│   ├── tasks.mjs            # loadTasks + validateTask (pure schema check) + fixture hashing
│   ├── identity.mjs         # canonicalJson, sha256, toolsListDigest, treeHash (pure + fs)
│   ├── claude-arm.mjs       # argv builder mirroring claude-profile.ts; NDJSON stream summarizer (pure parts)
│   ├── cursor-arm.mjs       # optional
│   ├── mcp-client.mjs       # SDK client from mcp/node_modules; run_task with progress-reset timeout
│   └── cdp.mjs              # minimal CDP client over mcp/node_modules/ws (post-window checks, cleanup)
├── tasks/core/*.json        # 12 frozen tasks (6 mixed, 6 click-heavy), versioned
├── tasks/live/*.json        # small live set, reported separately
├── fixtures/<app>/...       # static HTML/JS fixture apps
├── results/<campaignId>/    # COMMITTED: runs.jsonl (sanitized), summary.json, report.md, identity.json
└── .local/                  # GITIGNORED: raw per-run JSON, stream-json logs, session exports
tests/
├── bench-stats.test.mjs, bench-outcome.test.mjs, bench-tasks.test.mjs,
├── bench-identity.test.mjs, bench-claude-stream.test.mjs, bench-fixture-server.test.mjs   # Node 20-safe, in the npm test chain
```

Keep baseline artifacts in `scripts/bench/results/`, not the phase directory: Pitfall 22 of the prior research notes that tests reading live `.planning/phases/66-*` files break when the milestone is archived, and Phase 71 needs a stable path.

### Pattern 1: Hidden-symbol call timing at MCP ingress (D-04)

**What:** Stamp `receivedAt` on the parsed payload under a registry Symbol at `_handleMessage`, read it where recorder entries are built, and pass it to the recorder as an explicit `timing` field. The Symbol never serializes (JSON, `structuredClone` and non-enumerable spread all drop it — verified in this session).

**When to use:** Every recorded MCP call (bridge action tap and dispatcher message-route recorder, plus terminal task-status outcomes).

**Rules:**
- Use `Symbol.for('fsb.mcp.call-timing')` so `mcp-bridge-client.js` and `mcp-tool-dispatcher.js` share the symbol without load-order coupling, and so `vm` harnesses see the same symbol (`Symbol.for` is shared across realms — verified). Give each file's top-level `const` a **different identifier**: both files declare top-level `const`s in the shared classic-script global lexical scope, so a duplicate name throws on the second `importScripts`.
- Use `Date.now()` only. `performance` is **undefined** in every `vm` harness that loads these files (verified); guard it with `typeof` or avoid it.
- Define the property with `Object.defineProperty(..., { enumerable: false, configurable: true })` exactly like `mcp-tool-dispatcher.js:3184-3197`.
- `canonicalizeVisualSessionOwnershipToken` returns `{...payload, ownershipToken}` (`mcp-tool-dispatcher.js:576-579`), which drops a non-enumerable Symbol. Read the timing from the **original** payload at the top of `dispatchMcpToolRoute`, before canonicalization, and pass it explicitly to `recordTaskOutcome`.
- Stamp `completedAt` at the recorder call site, synchronously, before the fire-and-forget enqueue. The recorder queue and the journal write queue add delay; never derive call time from `event.timestamp` (D-04).

```js
// mcp-bridge-client.js (top level; unique identifier)
const MCP_BRIDGE_CALL_TIMING = Symbol.for('fsb.mcp.call-timing');

// in _handleMessage, right after `if (!id || !type) return;`
if (payload && typeof payload === 'object') {
  try {
    Object.defineProperty(payload, MCP_BRIDGE_CALL_TIMING, {
      value: { receivedAt: Date.now() }, enumerable: false, configurable: true
    });
  } catch (_e) { /* timing never gates routing */ }
}

// shared shape builder (one per file, or a small pure helper in the dispatcher)
function buildMcpCallTiming(source) {
  const stamp = source && source[MCP_BRIDGE_CALL_TIMING];
  if (!stamp || !Number.isFinite(stamp.receivedAt)) return null;   // absent -> omitted, never 0
  const completedAt = Date.now();
  return { v: 1, receivedAt: stamp.receivedAt, completedAt,
           fsbMs: Math.max(0, completedAt - stamp.receivedAt) };
}

// _recordMcpSessionAction: add to sessionRecordEntry
//   timing: buildMcpCallTiming(payload),
```

Recorder and journal changes that carry it through (all additive; omit the key when timing is null so existing byte-cost and deep-equal tests are unaffected):
- `recordAction(input)` builds a **new** entry (`mcp-session-recorder.js:2336-2352`); forward `timing: input.timing`.
- `_snapshotJournalEntry` returns an explicit field list (`:918-966`); add `timing: _sanitizeCallTiming(entry.timing)` (finite non-negative numbers only).
- `recordTaskOutcome` (`:1751-1800`) builds its journal entry through `_snapshotJournalEntry`; pass timing into it.
- Legacy path: `_snapshotEntry` (`:854-880`) and `session.actionHistory.push` (`:2146-2152`) gain `timing`/`durationMs` so D-04's "both recording paths" holds for legacy-only clients.
- Journal `recordDispatchNow` metadata (`mcp-lattice-journal.js:1210-1229`): `if (timing) metadata.timing = timing;`. Replay is unaffected because `replayEntryFromEvent` (`:1752-1766`) copies an explicit field list that does not include metadata extras [VERIFIED: codebase].
- `INTERNAL_PAYLOAD_KEYS` (`:44-48`) and `RECORDING_SIDECAR_FIELDS` (`tests/mcp-tool-smoke.test.js:58`) **do not change**: the timing never becomes a string key on any payload, `stripInternalPayload` clones via `structuredClone`/JSON (`:76-86`, `:821-834`) which drops Symbol keys, and the server-side sidecars are untouched (D-01).

### Pattern 2: Journal-first session lookup with paged projection (D-07, D-08)

```js
// mcp-tool-dispatcher.js handleGetSessionMessageRoute, after the sessionId check,
// BEFORE the automationLogger availability check (so journal sessions resolve even without it)
const journal = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpLatticeJournal : null;
if (journal && typeof journal.hasSession === 'function' && typeof journal.getSessionDetail === 'function'
    && await journal.hasSession(payload.sessionId)) {
  if (payload.format === 'text') {
    if (typeof journal.exportHumanReadable !== 'function') {
      return createMcpRouteError('get_session_detail', 'observability', MCP_ROUTE_RECOVERY_HINT,
        { error: 'Human-readable session exporter unavailable' });
    }
    return { success: true, format: 'text', text: await journal.exportHumanReadable(payload.sessionId) };
  }
  const collected = await collectJournalToolCalls(journal, payload.sessionId); // pages 500 at a time, bounded
  return { success: true, session: projectJournalSessionForMcp(collected) };
}
// then the existing automationLogger.loadSession branch, then the in-flight fallback, unchanged
```

- `getSessionDetail` caps a page at 500 events (`mcp-lattice-journal.js:24-25, 1631-1648`); `sanitizeSessionDetail` keeps the last 100 actions (`mcp-tool-dispatcher.js:2108`). Page with `afterSequence = nextSequence` until `hasMore` is false, keep only compact projected `tool.call` rows in a ring of 100, and keep totals over all calls. Bound the loop (for example 20 pages) and set `actionHistoryTruncated`/`callsTotal` so truncation is visible. The MCP tool's bridge timeout is 10 s (`mcp/src/tools/observability.ts:56-58`).
- Build each row by feeding a pseudo-action `{tool, timestamp: Date.parse(event.timestamp), iteration: null, params: <inline request params if inline>, result: <inline compact result if inline>}` through the **existing** `sanitizeActionHistoryEntry`, then attach `sequence`, `route`, `logicalTab` and `timing`. This reuses the allowlist (selector ≤250 chars, domain only, error ≤500 chars) and guarantees raw payloads never leave. Descriptors stored as `artifact` or `omitted` contribute nothing.
- Session metadata: `sanitizeSessionMetadata(detail.session)` on the `buildIndexEntry` shape (`id`, `task`, `status`, `startTime`, `endTime`, `actionCount`, `eventCount`, `mcpClient`, `storageBackend: 'journal-v2'`, `recordingState`, `outcome`, `outcomeDetails`, ...). Keep the `{success:true, session:{...}}` envelope (D-08).
- Mirror of the control panel: `hydrateJournalSessionDetail` (`extension/ui/options.js:3443-3476`) does the same field mapping; do not reuse its `journalDescriptorPreview`, which returns inline payload values.

### Pattern 3: Explicit measurement projection (survives the key filter)

Build a `measurement` block **after** the generic sanitizer and attach it to the sanitized session. Delete `iterationTiming`/`measurementSummary` from the generic output first (the generic sanitizer would already have stripped their token fields and flattened anything at depth 4 to `'[object]'`, `mcp-tool-dispatcher.js:2041`).

```js
// MCP (journal) sessions
measurement: {
  v: 1, kind: 'mcp',
  calls: 37, callsWithTiming: 37,
  fsbMs: { total: 21340, median: 512, p90: 1210 },
  callerGapMs: { total: 301220, median: 7110, label: 'upper bound on host thinking time' },
  activeSpanMs: 322560,             // lastCompletedAt - firstReceivedAt; never endTime - startTime (D-06)
  endReason: 'idle_timeout',        // from outcomeDetails.reason; idle tail excluded
  queueWaitMs: null, queueWaitStatus: 'not_measured',                         // D-03
  host: { modelMs: null, inputTokens: null, outputTokens: null, costUsd: null,
          status: 'unavailable', reason: 'host does not report to FSB' }      // D-12
}
// autopilot sessions
measurement: {
  v: 1, kind: 'autopilot',
  iterations: 9, modelMs: { total: 23110, median: 2380 }, toolMs: { total: 6120, median: 410 },
  inputTokens: 184233, outputTokens: 2310, reasoningTokens: 5120, cachedInputTokens: 90112,
  usageSource: 'provider',
  costUsd: 0.2481, costSource: 'provider',       // 'provider' | 'estimate' | 'mixed' | 'unavailable'
  requestedModel: 'grok-4.3', servedModels: ['grok-4.3'],
  perIteration: [ /* last 100 flat rows */ ]
}
```

Add `durationMs` to `sanitizeActionHistoryEntry` **only when finite** (`...(Number.isFinite(action?.durationMs) ? { durationMs: action.durationMs } : {})`) so unmeasured values are omitted, not 0 (D-05). No test deep-equals sanitized action entries [VERIFIED: grep].

### Pattern 4: Inline autopilot stamps (recommended over a hook module)

- **Model time:** `apiCallStartTime` exists at `agent-loop.js:1936`. Take `var apiCallElapsedMs = Date.now() - apiCallStartTime;` immediately after the provider call(s) resolve, next to the existing debug log at `:1986-1992`. It includes the one text-only image-rejection retry when that fires (`:1957-1979`); record `modelRetried: true` in that case rather than pretending it is one call.
- **Tool time:** the `BEFORE_TOOL_EXECUTION` emit (`:2260-2293`) runs the permission check. Today only the synchronous `permHook` is registered on that event (`background.js:4577`; `hooks/permission-hook.js:38-51` returns immediately), but Phase 68 may add confirmation work there, so start the stamp **after** it returns non-denied (just before `session._currentStepName = 'BEFORE_TOOL_EXECUTION'` at `:2298`) and end it at the successful action-history push (`:2797-2812`), which happens just before `AFTER_TOOL_EXECUTION` (`:2816`). Denied (`:2268-2291`) and malformed-argument (`:2229-2251`) branches never executed a tool: leave `durationMs` absent there.
- `ActionHistory.push` stores the object **as-is** when it has `tool` and `timestamp` (`action-history.js:91-100`), so adding `durationMs: Date.now() - toolStartedAt` to the object literal at `:2799-2803` is sufficient on the normal path. `createActionEvent`'s `durationMs: f.durationMs || 0` (`:51`) only runs on the fallback path; changing that default to `null` is honest but trips `tests/action-history.test.js:67` (paired update in the same commit).
- **Per-iteration record:** push one flat row into `session.iterationTiming` (keep the last 100) after the tool loop and on the `end_turn` path, and keep running totals in `session.measurementSummary`. Store usage as `usage: { input, output, reasoning, cachedInput }` (no key contains "token").
- **Testability:** no test runs `runAgentIteration` end to end; existing agent-loop tests call only the exported `callProviderWithTools` with a stubbed `executeViaBridge` (`tests/openai-agent-request.test.js:43-56`, `tests/agent-loop-empty-contents.test.js:36-41`). Put the logic in pure helpers so it can be unit-tested: usage/cost readers in `cost-tracker.js`, and a row builder/appender (for example `appendIterationTiming(session, row, cap)`) either in `cost-tracker.js` or exported additively from `agent-loop.js` (its `module.exports` at `:3131-3133` has no test pinning its key list [VERIFIED: grep]). The agent-loop edit itself then stays a few call sites, which the pin suites cover.
- **Persistence:** `automation-logger.js` projects explicit fields in both branches: the existing-session branch (`:863-920`, action rows `:904-916`) and the new-session branch (`:921-976`, action rows `:963-973`). Add `iterationTiming` (capped copy), `measurementSummary`, and `durationMs: Number.isFinite(a.durationMs) ? a.durationMs : null` to the action-row map in **both** branches. `persistSession` (`background.js:4958-4992`) persists only stop-button essentials, so no survivability change is needed (sessions are not resumable after SW restart).
- `saveToLogger` runs before completion is broadcast (`agent-loop.js:1637-1662`) but `saveSession` is async; the runner must retry `get_session_detail` briefly after `run_task` resolves.
- Tripwires in `agent-loop.js`: keep 8 `setTimeout` tokens (no new timers, no comment mentioning the word), keep the 4 schedule lines byte-identical, keep one `stepName: 'LLM_TURN'` and one `TOOL_DISPATCH`, and keep the anchor substrings used by `cost-tracker-ordering`, `meta-cognitive-tracker`, `ownership-leakage-regression` and `run-task-cleanup-paths`. `lastTurnResult.durationMs` is session-elapsed time, not model time (`:2111`); do not repurpose it (and leave `tests/turn-result.test.js:50` alone).

### Pattern 5: Provider-first usage and cost with labels (D-10, D-11)

The xAI path is non-streaming (`agent-loop.js:1109-1115` builds `{model, messages, tools, temperature:0, max_tokens:4096}`; the offscreen host `fetch`es and returns `await fetchResp.json()` unchanged, `offscreen/lattice-host.js:878-906`; the bridge returns `rawResponse`, `lattice-provider-bridge.js:235`). Everything D-10 needs is already on `response`.

```js
// cost-tracker.js additions (pure; module.exports guard already exists)
var XAI_TICKS_PER_USD = 1e10;
function readProviderUsage(response, providerKey) {        // returns nulls, never invented zeros
  var u = response && response.usage;
  if (!u) return { input: null, output: null, reasoning: null, cachedInput: null,
                   providerCostUsd: null, usageSource: 'unavailable', servedModel: (response && response.model) || null };
  var num = function (v) { return Number.isFinite(v) ? v : null; };
  // OpenAI-compatible (xai/openai/openrouter/custom/lmstudio); anthropic/gemini branches mirror extractUsage
  return {
    input: num(u.prompt_tokens), output: num(u.completion_tokens),
    reasoning: num(u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens),
    cachedInput: num(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens),
    providerCostUsd: providerKey === 'xai' && Number.isFinite(u.cost_in_usd_ticks) ? u.cost_in_usd_ticks / XAI_TICKS_PER_USD : null,
    usageSource: (num(u.prompt_tokens) !== null || num(u.completion_tokens) !== null) ? 'provider' : 'unavailable',
    servedModel: response.model || null
  };
}
function estimateCostDetailed(model, usage, provider) {    // no Grok fallback: unknown -> unavailable
  if ((provider || '').toLowerCase() === 'lmstudio') return { usd: 0, source: 'estimate', pricingKey: 'lmstudio-local' };
  var key = resolvePricingKey(model);                      // exact first, then prefix/substring over ordered keys
  if (!key || usage.input === null || usage.output === null) return { usd: null, source: 'unavailable', pricingKey: key };
  var p = MODEL_PRICING[key];
  var billedOutput = usage.output + (usage.reasoning || 0); // D-10: reasoning billed at output rate
  return { usd: (usage.input / 1e6) * p.input + (billedOutput / 1e6) * p.output, source: 'estimate', pricingKey: key };
}
```

- Keep the legacy numeric `estimateCost`/`CostTracker.record` behaviour (including the unknown-model fallback that `tests/cost-tracker.test.js` pins) so `session.totalCost`, the sidepanel and `BackgroundAnalytics` keep working unchanged (D-02). The labelled fields are additive and are what MEAS-01 and the benchmark read.
- D-11 rows: add exact `grok-4.3` and `grok-4.3-latest` at 1.25/2.50 **first in the object** (substring matching iterates insertion order and today `grok-4.3` hits `grok-4`); set every slug xAI now redirects to grok-4.3 (`grok-4-1-fast`, `grok-4-1-fast-reasoning`, `grok-4-1-fast-non-reasoning`, `grok-4-fast-reasoning`, `grok-4-fast-non-reasoning`, `grok-4-0709`, `grok-3`) to 1.25/2.50; set `grok-code-fast-1` and add `grok-build-0.1` at 1.00/2.00 [CITED: docs.x.ai/developers/migration/may-15-retirement; docs.x.ai/developers/pricing]. These are the <200k-token tier; label estimates accordingly.
- Validate the estimate formula live: on each xAI iteration where both are available, record `estimateDeltaPct = (estimate - provider) / provider`. This settles whether `completion_tokens` already includes reasoning tokens and the effect of the cached-input discount (not modelled in the estimate).
- Two other Grok price tables exist and are **not** in D-11's scope: `extension/utils/analytics.js:28-36` (dashboard) and `extension/background.js:10867`. Leave them (the control-panel dashboard is out of scope, D-09); see Open Questions.

### Pattern 6: Run identity from `fsb://config` (D-18)

`_handleGetConfig` (`mcp-bridge-client.js:2702-2708`) reads `selectedModel`/`selectedProvider`/`defaultModel`, which nothing writes. Replace it with a read-only allowlist:

```js
async _handleGetConfig() {
  const stored = await chrome.storage.local.get([
    'providerKind', 'modelProvider', 'modelName', 'maxIterations', 'domOptimization', 'maxDOMElements'
  ]);
  const config = {
    providerKind: typeof stored.providerKind === 'string' ? stored.providerKind : 'api',   // same defaults as
    modelProvider: typeof stored.modelProvider === 'string' ? stored.modelProvider : 'xai', // fsbReadAuthoritativeProviderConfig
    modelName: typeof stored.modelName === 'string' ? stored.modelName.trim() : '',         // (background.js:1726-1739)
    ...(Number.isFinite(stored.maxIterations) ? { maxIterations: stored.maxIterations } : {}),
    ...(typeof stored.domOptimization === 'boolean' ? { domOptimization: stored.domOptimization } : {}),
    ...(Number.isFinite(stored.maxDOMElements) ? { maxDOMElements: stored.maxDOMElements } : {})
  };
  let manifest = null;
  try { manifest = chrome.runtime && typeof chrome.runtime.getManifest === 'function' ? chrome.runtime.getManifest() : null; } catch (_e) {}
  return { config, extension: {
    id: (chrome.runtime && chrome.runtime.id) || null,
    version: manifest && manifest.version || null,
    measurement: { callTiming: 1, sessionDetailJournal: 1 }   // proves the Phase 66 build is loaded
  } };
}
```

- Never return API keys (the `mcp/src/types.ts:27` comment promises "keys redacted"). Test that no key named like a secret appears.
- The doctor already prefers `modelProvider`/`modelName` (`mcp/src/diagnostics.ts:729-743`), so the fix also makes `doctor --include-config` report a configured model. `normalizeConfig` reads `payload?.config ?? payload`, so a top-level `extension` sibling is harmless.
- The Web Store build and the worktree both report manifest `0.9.91`; only the `measurement` marker (and the extension ID) distinguishes them. The runner must refuse to run when the marker is absent or the ID equals `badgafnfchcihdfnjneklogedcdkmjfk`.
- `getManifest` may be missing in `vm` harness chrome mocks; guard it.

### Pattern 7: Fixture evidence and post-window checks (D-15, D-17)

- **Isolation by URL prefix:** each run gets a random token; all fixture pages are served under `http://127.0.0.1:<port>/r/<token>/...`. Relative links keep the prefix, so the server attributes every request to its run without cookies.
- **Primary evidence = the app's own requests.** Design every core task so success requires a server-visible effect that is part of normal page operation: a form POST, a "Save" `fetch` with a JSON body, or a navigation to a result page. The server logs `{t, method, path, query, body}` per run. Do not add an in-page probe that sends requests on DOM mutation during the timed window (Pitfall 9).
- **Evidence endpoint:** `GET /__bench/evidence?run=<token>` requires a runner-held secret header, so an agent calling `fetch` from `execute_js` cannot read or rewrite evidence.
- **Final URL and DOM markers:** after t1, the runner uses CDP on the bench Chrome (`--remote-debugging-port=0`, port read from `<profile>/DevToolsActivePort`, same as `tests/screenshot-uat.test.js:52-62`): find page targets whose URL contains `/r/<token>/`, read `location.href` and `[data-bench-marker]` values with `Runtime.evaluate`, then close those targets (`Target.closeTarget`) so tabs do not accumulate over 240 runs. Claude's tabs stay open after `claude` exits (the registry releases ownership after the 10 s reconnect grace, `extension/utils/agent-registry.js:75`, but does not close tabs).
- **Pure outcome evaluation:** `evaluateOutcome(task, evidence)` returns `{pass, checks:[{kind, pass, detail}]}`; `claimed` (run_task status, `complete_task`, Claude `result.is_error === false`) is stored separately and never read by the evaluator.
- **Live tasks:** URL and text checks through the same post-window CDP read (independent of FSB). They need logins in the bench profile and are reported in a separate section.

Task schema (versioned; `fixtureSha256` computed over the task JSON plus its fixture files, canonicalized):

```json
{
  "id": "core-click-checklist", "version": 1, "set": "core", "category": "click-heavy",
  "startPath": "/fixtures/checklist/index.html",
  "instruction": "Open {startUrl}. Tick the items Alpha, Delta, Echo and Kilo, then press Save.",
  "timeBudgetMs": 240000,
  "success": { "all": [
    { "kind": "request", "method": "POST", "path": "/api/checklist/save", "count": 1,
      "jsonEquals": { "checked": ["alpha", "delta", "echo", "kilo"] } },
    { "kind": "finalUrl", "pathEquals": "/fixtures/checklist/saved.html" },
    { "kind": "marker", "name": "saved-count", "equals": "4" }
  ] },
  "fixtureFiles": ["fixtures/checklist/index.html", "fixtures/checklist/saved.html", "fixtures/checklist/app.js"]
}
```

Suggested core set (6 mixed, 6 click-heavy; all server-verifiable): mixed — invoice lookup (read table, submit the max invoice), Jira-like ticket triage (find by label, change status in a custom dropdown, save), search → results → open a specific detail page, three-step wizard submit, settings read-then-change, paginate five pages to find and add an item; click-heavy — ten-checkbox checklist, four custom (div) dropdowns, nested accordion drill-down, chained confirm modals, tabbed editor toggles, kanban moves via "Move to" menus.

### Pattern 8: Host metrics from the driver only (D-12, D-14)

- **Claude Code arm argv** mirrors `claude-profile.ts:187-207` (task-mode branch): `-p --verbose --output-format stream-json --include-partial-messages --setting-sources "" --disable-slash-commands --no-chrome --strict-mcp-config --mcp-config <bench mcp config> --agents <SERIALIZED fsb agent> --agent fsb --permission-mode dontAsk --tools "" --allowedTools mcp__fsb --disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch --max-turns 40 --no-session-persistence`, task on **stdin** [VERIFIED: codebase]. Build `--agents` from `mcp/ai/agents/fsb.json` with the same key order as `serializeStaticAgentPolicy`, and record the agent-prompt hash in identity. The bench MCP config points at `node <worktree>/mcp/build/index.js`.
- Run `claude` in an **empty temp cwd** so the repo's `.claude/skills` and gitignored `CLAUDE.md` cannot load; record whether `~/.claude/CLAUDE.md` could have loaded (unverified, see Assumptions).
- Parse NDJSON: from `system/init` record `model`, `tools` (contains `ToolSearch` → tool search on; `WaitForMcpServers` → off), `mcp_servers[].status`, `apiKeySource`, `mcp_server_errors`; count `tool_use` blocks by name (FSB tools vs `ToolSearch`); from `result` record `duration_ms`, `duration_api_ms`, `num_turns`, `usage`, `modelUsage`, `total_cost_usd`, `is_error`, `subtype`, `permission_denials` [CITED: code.claude.com/docs/en/headless; code.claude.com/docs/en/costs]. Label cost "list-price estimate, not billed" when `apiKeySource` is `none` or a `costBasis: 'list'` field is present (D-12; the docs say all such figures are client-side estimates).
- Record `ENABLE_TOOL_SEARCH` as launched (`unset` = default `auto`) [CITED: code.claude.com/docs/en/mcp].
- Timeout: send **SIGINT** first (SIGTERM exits 143 with no `result` event [CITED: code.claude.com/docs/en/headless]), wait a grace, then SIGTERM.
- Cursor (optional): `result` has `duration_ms`, `duration_api_ms` and no tokens or cost [CITED: cursor.com/docs/cli/reference/output-format] → label "unavailable (host does not report)".

### Pattern 9: Hierarchical bootstrap of the geometric mean of per-task median ratios (D-16)

```js
// scripts/bench/lib/stats.mjs (pure, deterministic, Node 20-safe)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function median(xs) { const s = [...xs].sort((a, b) => a - b); const n = s.length;
  if (!n) return NaN; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
export function quantile(xs, q) { const s = [...xs].sort((a, b) => a - b); if (!s.length) return NaN;
  const h = (s.length - 1) * q; const lo = Math.floor(h); return s[lo] + (h - lo) * ((s[Math.ceil(h)] ?? s[lo]) - s[lo]); }
function resample(xs, rnd) { const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = xs[Math.floor(rnd() * xs.length)]; return out; }

// tasks: [{ id, a: [wallMs of completed runs], b: [wallMs of completed runs] }]; ratio = median(b)/median(a)
export function geoMeanMedianRatio(tasks, { iterations = 10000, seed = 66, level = 0.95 } = {}) {
  const usable = tasks.filter(t => t.a.length > 0 && t.b.length > 0);
  const dropped = tasks.filter(t => !(t.a.length > 0 && t.b.length > 0)).map(t => t.id);
  const logRatio = (t) => Math.log(median(t.b) / median(t.a));
  const estimate = Math.exp(usable.reduce((s, t) => s + logRatio(t), 0) / usable.length);
  const rnd = mulberry32(seed); const draws = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let k = 0; k < usable.length; k++) {                  // level 1: resample tasks
      const t = usable[Math.floor(rnd() * usable.length)];
      sum += Math.log(median(resample(t.b, rnd)) / median(resample(t.a, rnd)));   // level 2: runs within task
    }
    draws[i] = Math.exp(sum / usable.length);
  }
  const lo = quantile(draws, (1 - level) / 2), hi = quantile(draws, 1 - (1 - level) / 2);
  const verdict = lo > 1 ? 'slower' : hi < 1 ? 'faster' : 'inconclusive';    // CI crossing 1.0 => inconclusive
  return { estimate, ci: [lo, hi], verdict, usedTasks: usable.map(t => t.id), droppedTasks: dropped, iterations, seed };
}
export function wilson(successes, n, z = 1.959963984540054) {
  if (!n) return [NaN, NaN]; const p = successes / n; const d = 1 + z * z / n;
  const c = p + z * z / (2 * n); const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
```

- Tasks where either arm has no completed run are dropped from the wall-time headline and listed; completion rate (with Wilson CI) and cost per completed task are reported beside it.
- Add an **A/A noise-floor check** to the baseline report: split each arm's runs into odd/even rounds and run the same bootstrap. Its CI should straddle 1.0; its width is the smallest effect Phase 71 can claim.
- Schedule rounds ABBA (round 1: autopilot then MCP per task; round 2: MCP then autopilot; ...) with a seeded task order, and record `round`, `order`, `startedAt` per run.

### Pattern 10: Exporting the 40 recorded sessions (D-20, D-21)

The 40 sessions live in the **Web Store build's** IndexedDB (extension `badgafnf…`, Chrome Profile 2). Worktree code and the bench profile cannot read them. Available paths today:

| Path | Works on the Web Store build? | Effort | Output |
|------|------|--------|--------|
| MCP `get_session_detail` | No — the bug this phase fixes (journal sessions return `session_not_found`) | — | — |
| MCP `list_sessions` | Yes (reads `fsbSessionIndex`) | 1 call | Run-level metadata only: `startTime`, `endTime`, `actionCount`, `eventCount`, `mcpClient`, `outcome` |
| Control panel → Session History → per-session JSON download | Yes (`saveJournalSessionExport` → port `fsb-session-export-v2` → `streamSessionExport`, `options.js:3508-3548`) | 40 Save-As dialogs | Full JSON incl. `event.timestamp`, metadata and resolved request/result values |
| DevTools console on the Web Store control-panel page | Yes (`chrome.runtime.sendMessage({action:'getSessionDetail', ...})`, `background.js:12513-12536`) | One snippet | One JSON file with every tool.call event (timestamps, tool, success, route, client); request/result stay as descriptors |

Recommended: first snapshot `list_sessions` (safety net), then run the console snippet (Code Examples) from `chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/ui/control_panel.html` DevTools. Save raw output to `scripts/bench/.local/history-2026-09-16_21/` (gitignored). `scripts/bench/export-history.mjs` derives sanitized per-call metrics (inter-event deltas labelled "journal-timestamp deltas; include caller gap and IndexedDB write-queue delay", grouped by `mcpClient`) into `scripts/bench/results/history-2026-09-16_21/metrics.json`, which is committed. Because the bench uses a separate profile and extension ID, benchmark recordings do not evict these sessions; ordinary MCP use in Profile 2 still does, so this is the first task of the phase.

### Anti-Patterns to Avoid

- **Timing in tool responses** (ARCHITECTURE Anti-Pattern 7): adds tokens to every call; timing appears only in `get_session_detail`, its text export and the bench report.
- **Returning `journal.getSessionDetail` events as-is:** they carry inline request/result payloads (`eventForDetail`, `mcp-lattice-journal.js:1620-1629`).
- **Adding `afterSequence`/`limit` to `get_session_detail`:** forbidden by MCP-04 (D-08).
- **Using `event.timestamp` differences as FSB time:** includes the IndexedDB write queue (D-04).
- **Using session `endTime`** for anything (D-06).
- **Adding a timer or the word "setTimeout" to `agent-loop.js`** (8-token pin).
- **Changing legacy numeric cost/token fields' meaning** (sidepanel and dashboard consumers; D-02). Add labelled fields instead.
- **Letting the SDK default timeout govern `run_task`:** SDK 1.29 `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` [VERIFIED: sdk/dist/esm/shared/protocol.js:8]; a timed-out client leaves autopilot running in the browser and corrupts the next run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP client for the runner | Raw JSON-RPC over stdio | `@modelcontextprotocol/sdk` 1.29.0 `Client` + `StdioClientTransport` from `mcp/node_modules` | Handles initialize, progress tokens, `resetTimeoutOnProgress`, `maxTotalTimeout`, and exposes `transport.pid` and `getServerVersion()`. |
| Sanitizing projected actions | A new allowlist | Existing `sanitizeActionHistoryEntry` / `sanitizeSessionMetadata` | Same privacy boundary as today's legacy path. |
| Journal paging, text export | New IndexedDB reads | `getSessionDetail`, `exportHumanReadable`, `streamSessionExport` | Tested, budget-aware, artifact-verified. |
| Session export UI | New control-panel code | Existing streaming export / `getSessionDetail` runtime message | D-09 forbids control-panel changes. |
| Provider cost math for xAI | Token × price only | `usage.cost_in_usd_ticks` | Covers cached-input discounts, tiers and tool costs in one number. |
| Tab ownership bypass for verification | A privileged FSB route | CDP on the dedicated bench profile | Independent of FSB (D-17); no new product surface. |
| Chrome with an extension flag | `--load-extension` on branded Chrome | One-time manual "Load unpacked" in the bench profile | Branded Chrome 137+ ignores `--load-extension` [CITED: prior STACK.md research]. |

**Key insight:** the measurement must not change what it measures. Every new write is either off the hot path (fire-and-forget recorder, end-of-session save) or a synchronous `Date.now()`; every evidence source sits outside FSB and the agent.

## Runtime and Operational State Touched by the Benchmark

Not a rename phase, but the live campaign changes machine state that git does not track. The planner needs explicit set-up and restore steps.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 40 journal sessions (2026-09-16..21) in the Web Store extension's IndexedDB, Profile 2; 30-day retention and 50-session cap [VERIFIED: `mcp-lattice-journal.js:28-29`] | Export first (human checkpoint H1). |
| Live service config | `~/.fsb/bridge-auth.json` `allowedExtensionOrigin = chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk` [VERIFIED: file read, secrets redacted]; binding is sticky (`bindAllowedExtensionOrigin`, `mcp/src/bridge-auth.ts:161-178`) | `fsb-mcp-server pair --reset` before the campaign so the unpacked extension binds; `pair --reset` again afterwards so the Web Store build re-binds. |
| OS-registered state | Native messaging host `io.github.fullselfbrowsing.fsb_native_host` in `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`, `allowed_origins` = Web Store origin only [VERIFIED: file read]. The extension gets its bridge pairing code only via this host (`background.js:2204-2233` → `chrome.storage.session`) | Put a copy of the manifest, with the unpacked origin, in `<bench-user-data-dir>/NativeMessagingHosts/` (user-level hosts resolve inside the active user data dir [CITED: developer.chrome.com native messaging]). Leave the global manifest untouched. |
| Secrets/env vars | xAI API key must be entered in the bench profile's control panel; `ENABLE_TOOL_SEARCH` env recorded per run | Human checkpoint; never write the key to bench artifacts. |
| Build artifacts / installed packages | `extension/dist/offscreen/lattice-host.js` (esbuild, gitignored); `mcp/build` (only 6 files tracked); global `fsb-mcp-server` 0.11.0 at `/opt/homebrew/bin` and the packed native-host runtime 0.11.0 at `~/.fsb/native-host/runtime/package` [VERIFIED] | `npm run build` and `npm --prefix mcp run build` before loading; the runner spawns `node <worktree>/mcp/build/index.js` and verifies it owns 7225 (listener PID = `transport.pid`). |
| Hub port | Extension hard-codes `ws://localhost:7225` (`mcp-bridge-client.js:12`); the hub keeps one extension socket | Disable FSB in everyday Chrome (or quit it) for the campaign window; free 7225 before starting. |

## Common Pitfalls

### Pitfall 1: `get_session_detail` silently drops token fields and nested timing
**What goes wrong:** `sanitizeValue` removes every key matching `/token/i` and turns objects at depth ≥ 4 into `'[object]'`; `sanitizeActionHistoryEntry` drops `durationMs`.
**Why it happens:** the secret filter predates token accounting (`mcp-tool-dispatcher.js:2027-2050`, `:2064-2086`).
**How to avoid:** store usage under names without "token" (`usage.input`), keep stored rows flat, and emit an explicit post-sanitization `measurement` block. Test that a session with token counts comes back with them.
**Warning signs:** `measurement` or `iterationTiming` rows missing `inputTokens` or showing `'[object]'` [VERIFIED: probe run in this session].

### Pitfall 2: Pricing the pin target as Grok 4
**What goes wrong:** `estimateCost('grok-4.3', …)` substring-matches `grok-4` ($3/$15): 4.8× too high. Unknown models are priced as Grok ($0.20/$0.50 today).
**How to avoid:** exact `grok-4.3`/`grok-4.3-latest` rows first; `estimateCostDetailed` returns `unavailable` for unknown models; prefer provider ticks [VERIFIED: node probe].

### Pitfall 3: Duplicate top-level identifiers across SW classic scripts
**What goes wrong:** `mcp-tool-dispatcher.js` (loaded at `background.js:81`) and `mcp-bridge-client.js` (`:122`) share one global lexical scope; a second `const X` throws and the bridge client fails to load.
**How to avoid:** distinct identifiers per file, both assigned `Symbol.for('fsb.mcp.call-timing')`.

### Pitfall 4: `vm` harness differences
**What goes wrong:** harnesses load a single file with a minimal context: no `performance`, no `structuredClone`, no `FsbMcpLatticeJournal`, often no `chrome.runtime.getManifest` [VERIFIED: `tests/mcp-in-flight-session-lookup.test.js:34-94`, `tests/mcp-bridge-background-dispatch.test.js:306-313`, node vm probe].
**How to avoid:** `Date.now()` only; `typeof` guards on `globalThis.FsbMcpLatticeJournal`, `performance`, `getManifest`; never reference the other file's top-level identifiers at evaluation time.

### Pitfall 5: The `recordTaskOutcome` path loses the Symbol
**What goes wrong:** visual-session canonicalization spreads the payload (`mcp-tool-dispatcher.js:576-579`), so `complete_task`/`fail_task` calls lose timing.
**How to avoid:** read timing from the original payload at the start of `dispatchMcpToolRoute` and pass it explicitly.

### Pitfall 6: Journal byte-cost tests and text-export parity
**What goes wrong:** `tests/mcp-lattice-journal.test.js:416-431` asserts `streamSessionExport(id,'text')` output **equals** `exportHumanReadable(id)`, and other cases assert exact counts/regexes (`/Call 505: read_step_504/`).
**How to avoid:** change both text producers through one shared formatter; append timing after the tool name (e.g. `[OK] Call 3: click — fsb 412 ms, gap 8113 ms (upper bound)`, or `— timing not recorded` for older events); add `metadata.timing` only when present so existing budget fixtures keep their byte costs.

### Pitfall 7: `run_task` needs an owned tab and a long timeout
**What goes wrong:** for a registered agent, `handleStartAutomationRoute` requires `resolveAgentTabOrError` to succeed (`mcp-tool-dispatcher.js:2636-2677`), so a fresh runner agent gets `NO_OWNED_TAB`; and the SDK times out at 60 s.
**How to avoid:** before t0, the runner's agent opens the start URL (`open_tab`) outside the timed window; call `run_task` with `{ onprogress, resetTimeoutOnProgress: true, timeout: 60000, maxTotalTimeout: task.timeBudgetMs }`; on timeout call `stop_task` and mark the run failed. Record the asymmetry (the MCP arm opens its own tab inside the window); it does not affect within-arm Phase 71 comparisons.

### Pitfall 8: Hub, pairing and origin mismatches look like "extension not connected"
**What goes wrong:** the everyday Web Store FSB grabs the single 7225 slot, the bridge refuses the unpacked origin (sticky pin), or native messaging refuses the unpacked origin so no pairing code is ever delivered. Doctor may still look healthy (operator memory).
**How to avoid:** the preflight checklist in Plan Decomposition, and a runner preflight that requires `fsb://config` to return the `measurement` marker and the expected unpacked extension ID before any run.

### Pitfall 9: Evidence collection that perturbs FSB's settle waits
**What goes wrong:** a page probe posting DOM state on every mutation keeps the network busy; FSB's click settle waits for network quiet (PROJECT.md: 300 ms DOM stability plus 200 ms network quiet, capped at 3 s), so FSB time inflates.
**How to avoid:** evidence = the app's own submissions during the window; DOM markers via CDP after the window.

### Pitfall 10: Tab and state accumulation across 240 runs
**What goes wrong:** Claude's tabs survive process exit; hundreds of open tabs slow the profile over the campaign and bias later runs.
**How to avoid:** CDP cleanup after each run; restart the bench Chrome between campaign sessions; record run order so drift can be checked.

### Pitfall 11: Model drift under an alias
**What goes wrong:** `grok-4.3` is the model name and `grok-4.3-latest` an alias; xAI publishes no dated grok-4.3 snapshot [CITED: docs.x.ai/developers/models/grok-4.3], and the `model` string returned after redirects is undocumented.
**How to avoid:** record `servedModels` and `system_fingerprint` (if present) per iteration; the runner flags runs whose served model does not match `^grok-4\.3`.

### Pitfall 12: History caps evict bench detail before it is saved
**What goes wrong:** autopilot history keeps 50 sessions per mode (`automation-logger.js:20`); 120 autopilot runs overflow it.
**How to avoid:** fetch `get_session_detail` right after each run (with a short retry for the async save) and write the per-run file immediately (D-20).

### Pitfall 13: Test-chain registration and Node 20
**What goes wrong:** a new test file not listed in `REFINEMENT_ROOT_TEST_COMMANDS` breaks `tests/delegation-phase-contract.test.js`'s pre-phase hash checks; a Node 22+ global passes locally and fails CI.
**How to avoid:** prefer extending existing, already-chained test files for extension changes; register new bench tests once, in one plan; write them as plain `node:test` ESM without Node 22+ APIs.

### Pitfall 14: `npm test` false reds from port 7225
**What goes wrong:** a running bench hub or stray relay holds 7225 and the chain halts at the first port-bound suite (operator memory).
**How to avoid:** never run the campaign and the full chain at the same time; run per-file checks during development and the full chain with 7225 free.

## Code Examples

### Runner: own SDK client, identity, and `run_task` with progress-reset timeout
```js
// scripts/bench/lib/mcp-client.mjs (runs locally only; Node 24 fine, but nothing here needs >20)
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
const repo = path.resolve(new URL('../../..', import.meta.url).pathname);
const mcpRequire = createRequire(path.join(repo, 'mcp', 'package.json'));
const { Client } = mcpRequire('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = mcpRequire('@modelcontextprotocol/sdk/client/stdio.js');
const sdkVersion = mcpRequire('@modelcontextprotocol/sdk/package.json').version;

export async function openRunnerClient() {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(repo, 'mcp', 'build', 'index.js')], stderr: 'pipe'
  });
  const client = new Client({ name: 'fsb-bench', version: '1' });
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  const canonical = JSON.stringify(tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
    .sort((a, b) => a.name.localeCompare(b.name)));
  const config = await client.readResource({ uri: 'fsb://config' });
  return { client, transport, identity: {
    serverVersion: client.getServerVersion(), sdkVersion, serverPid: transport.pid,
    toolsList: { count: tools.length, sha256: createHash('sha256').update(canonical).digest('hex') },
    config: JSON.parse(config.contents[0].text)      // must contain extension.measurement.callTiming === 1
  } };
}

export async function runTaskTimed(client, task, budgetMs) {
  const t0 = Date.now();
  const res = await client.callTool({ name: 'run_task', arguments: { task } }, undefined, {
    onprogress: () => {}, resetTimeoutOnProgress: true, timeout: 60_000, maxTotalTimeout: budgetMs
  });
  return { t0, t1: Date.now(), claimed: res };      // "claimed" only (D-17)
}
```

### Exporting the 40 journal sessions from the Web Store build (paste in the control-panel DevTools console)
```js
// chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/ui/control_panel.html -> DevTools -> Console
(async () => {
  const { fsbSessionIndex = [] } = await chrome.storage.local.get(['fsbSessionIndex']);
  const from = Date.parse('2026-09-16T00:00:00'), to = Date.parse('2026-09-22T00:00:00');
  const ids = fsbSessionIndex.filter(s => s.storageBackend === 'journal-v2' && s.startTime >= from && s.startTime < to).map(s => s.id);
  const out = { exportedAt: new Date().toISOString(), extensionId: chrome.runtime.id,
                version: chrome.runtime.getManifest().version, sessions: [] };
  for (const sessionId of ids) {
    let after = -1, events = [], session = null;
    for (let page = 0; page < 50; page++) {
      const r = await chrome.runtime.sendMessage({ action: 'getSessionDetail', sessionId, afterSequence: after, limit: 500 });
      if (!r || !r.success) break;
      session = r.session; events = events.concat(r.events || []);
      if (!r.hasMore || r.nextSequence == null) break; after = r.nextSequence;
    }
    out.sessions.push({ session, events });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = 'fsb-history-2026-09-16_21.json'; a.click();
  console.log('exported', out.sessions.length, 'sessions');
})();
```

### Journal text export line (shared by both text producers)
```js
function formatCallTimingSuffix(metadata, previousCompletedAt) {
  const t = metadata && metadata.timing;
  if (!t || !Number.isFinite(t.fsbMs)) return ' | timing not recorded';
  let gap = '';
  if (Number.isFinite(previousCompletedAt) && Number.isFinite(t.receivedAt)) {
    const g = t.receivedAt - previousCompletedAt;
    gap = g >= 0 ? ' | caller gap ' + g + ' ms (upper bound)' : ' | overlapped previous call';
  }
  return ' | fsb ' + t.fsbMs + ' ms' + gap;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `grok-4-1-fast*`, `grok-4-fast*`, `grok-4-0709`, `grok-3` served as themselves | Retired; requests redirect to `grok-4.3` (low or none reasoning effort) and bill at $1.25/$2.50 per M | May 15, 2026 12:00 PT [CITED: docs.x.ai/developers/migration/may-15-retirement] | FSB's default model now costs ~5-6× the table value; pin `grok-4.3` for the baseline. |
| Token × price estimates | `usage.cost_in_usd_ticks` on every response (1e10 ticks = $1; streaming: final chunk only, needs `stream_options.include_usage`) | [CITED: docs.x.ai/developers/cost-tracking] | Provider cost is authoritative; FSB's autopilot path is non-streaming, so the field is on the body. |
| Claude Code loads all MCP tool definitions at start | Tool search on by default (v2.1.232+ with feature flags); `ENABLE_TOOL_SEARCH=auto|true|false`; `WaitForMcpServers` when off; descriptions truncated at 2,048 chars | [CITED: code.claude.com/docs/en/mcp] | Record the mode per run; Phase 69's description diet must be judged by wall time. |
| `--load-extension` on branded Chrome | Ignored on branded Chrome 137+ | [CITED: prior STACK.md research, MEDIUM] | Load the unpacked extension manually once in the bench profile. |

**Deprecated/outdated in the codebase:** `.planning/codebase/TESTING.md` (dated 2026-02-03) says no tests exist; ignore it. `config.js:82` still recommends `grok-4-1-fast` (product default; out of scope per Deferred Ideas).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The bare slug `grok-4-1-fast` (FSB's default) is also redirected to grok-4.3; the retirement doc lists only the `-reasoning`/`-non-reasoning` variants | Summary, Pattern 5 | Low for Phase 66: the benchmark pins `grok-4.3` and records the served model; affects only the deferred default fix. |
| A2 | xAI's response `model` field after redirect and for `grok-4.3` echoes a grok-4.3 string | Pitfall 11 | Runner mismatch check could false-flag; make the pattern configurable and inspect the first smoke run. |
| A3 | xAI reports reasoning tokens separately from `completion_tokens` for grok-4.3 (D-10 states it; FSB's legacy parser assumes it) | Pattern 5 | Estimates double-count reasoning; the recorded `estimateDeltaPct` against provider ticks detects it on the first run. |
| A4 | A user-level native messaging manifest placed in `<user-data-dir>/NativeMessagingHosts/` is honoured for a custom `--user-data-dir` on macOS | Runtime State | If wrong, the unpacked extension never receives a pairing code; fallback is `fsb-mcp-server install --native-host --extension-id <unpacked-id>` (changes the global manifest; restore afterwards). |
| A5 | Branded Chrome keeps a manually loaded unpacked extension across restarts of the bench profile, and `--remote-debugging-port` works with a non-default `--user-data-dir` | Pattern 7 | Extra manual reload steps; CDP checks would need a different browser build. |
| A6 | `--setting-sources ""` plus an empty cwd keeps project skills out; whether `~/.claude/CLAUDE.md` still loads is unverified | Pattern 8 | Small prompt differences across machines; record it and keep the machine fixed. |
| A7 | The direct `mcp:start-automation` message may create a small journal-v2 run for the runner's agent (the recorder skips only the literal tool name `run_task`, `mcp-session-recorder.js:2226`); the runner's `open_tab` pre-step is an action tool with visual-session fields (`tool-definitions.js:628-650`) and is journaled under the runner's agent | Pattern 7 / runner | Extra rows in the bench profile's session history; the runner must select the autopilot session by the `sessionId` that `run_task` returns, and MCP-arm sessions by client label, time window and run token in `startUrl`, excluding the runner's own agent. |
| A8 | Campaign cost and duration: autopilot on grok-4.3 roughly $0.05-0.40 per run (≈$6-50 for 120 runs); the Claude arm consumes subscription usage and may hit 5-hour windows; 240 runs take roughly 5-8 hours of wall time | Plan Decomposition | Budget or scheduling surprises; run the smoke first and extrapolate. |
| A9 | The 9.5 s / 4.6 s per-call medians in PROJECT.md were computed from journal timestamps or session spans; the method is not recorded in the repo | Pattern 10 | The history analyzer may not reproduce them exactly; report its method explicitly. |

## Open Questions (RESOLVED)

1. **Retirement date discrepancy.** CONTEXT D-11 says xAI retired `grok-4-1-fast` on 2026-08-15; the official page says May 15, 2026 12:00 PT. The decision is unaffected; fix the wording when the deferred default-model fix is written.
   **RESOLVED:** No Phase 66 change. The prices D-11 uses stand, and the date is corrected in the deferred default-model fix.
2. **Other Grok price tables.** `extension/utils/analytics.js:28-36` and `extension/background.js:10867` keep $0.20/$0.50. D-11 names only `cost-tracker.js`, and updating the dashboard tables changes displayed numbers. Recommendation: leave them in Phase 66 and add them to the deferred default-model fix; ask the user only if they want dashboard parity now.
   **RESOLVED:** Both tables stay unchanged in Phase 66 and move to the deferred default-model fix (orchestrator decision 6).
3. **Which Claude model for the MCP arm.** The v0.9.91 profile passes no `--model`. For reproducibility add `--model <id>` in the bench driver and record `init.model`/`modelUsage`. The user should pick the model (the 40-session baseline used whatever each session used).
   **RESOLVED:** Explicit `--claude-model`, with no default. It is required for `--smoke`/`--campaign` and recorded in run identity. The user picks it at H2/H4 (decision 3).
4. **Should `createActionEvent`'s default change to `null`?** Recommended (D-05 wording) with the paired `tests/action-history.test.js:67` update; it only affects the fallback path. Low risk either way.
   **RESOLVED:** Yes. The default becomes `null`, with the paired test update in the same task (decision 5).
5. **Live-site set membership and logins.** D-15 wants UAT- and Jira-style reading tasks; they need accounts in the bench profile. Recommend 2-4 tasks, reported separately, optional for completing the phase if logins are unavailable.
   **RESOLVED:** The live set keeps both categories and needs no logins (decision 8):
   - 2 public Jira-style reads
   - 2 UAT-style reads against FSB's own public production showcase, `https://full-selfbrowsing.com`. These check that deployed pages show the expected content, as a UAT pass would.

   It stays 2-4 tasks, reported separately and excluded from the release gate. A task whose site is unreachable is recorded as skipped and does not block the phase.
6. **Cursor arm.** Optional per D-14; recommend implementing the parser/driver but not running it in the Phase 66 baseline (D-16 sizes two arms).
   **RESOLVED:** Build and unit-test the driver and parser, but keep them out of the Phase 66 baseline campaign (decision 7).

### Orchestrator decisions recorded for the plans (2026-09-30)

Plans cite these as "orchestrator decision N". They are Claude's-discretion choices made within the locked D-01..D-21.

1. **Plan split:** follows the research decomposition, adjusted by the planner (11 plans, 6 waves). No two plans in the same wave share a file.
2. **H1 export first:** 66-01 is non-autonomous; H2-H5 live in the live plans. Every spend-bearing or everyday-setup-changing step is a blocking `checkpoint:human-action`, because `auto_advance` is on.
3. **Claude model for the MCP arm:** an explicit `--claude-model` with no default, recorded in identity.
4. **Autopilot model:** pinned to `grok-4.3`. Preflight refuses any other model, and the model string xAI returns is recorded.
5. **`createActionEvent`:** `durationMs` defaults to `null`, with the paired test updated.
6. **Other Grok price tables:** `analytics.js` and `background.js` stay unchanged.
7. **Cursor arm:** built and tested, but not part of the baseline campaign.
8. **Live set:** 2 public Jira reads plus 2 UAT-style reads on `https://full-selfbrowsing.com`. It is reported separately and optional if a site is unreachable.
9. **Pattern-map findings are honored:**
   - Sheets entries keep `timing`.
   - The new Claude fixture lives under `tests/fixtures/bench/`.
   - Timing rows carry no `stepName` key.
   - Comments use fresh wording that avoids pinned text.
   - The cost-tracker unknown-model path is decoupled from the Grok row.
   - `_handleExecuteAction` stays within its size budget.

   **D-02/D-10 reconciliation:** the legacy numeric totals (`totalCost`, `totalInputTokens`, …) keep their existing values for backward compatibility (D-02). The new labelled fields are the authoritative measurement (D-10), and the MCP `measurement` projection adds a basis label next to each legacy total so a bare number is never shown unlabelled.
10. **No `mcp/` source changes (D-01):** bench scripts may import read-only from `mcp/node_modules` and `mcp/build` and may spawn `mcp/build/index.js`.
11. **Commit messages:** never add `Co-Authored-By` or any AI attribution line.
12. **Tripwires:** every extension edit runs its paired pinned tests. New chain entries are appended to `REFINEMENT_ROOT_TEST_COMMANDS`, and the historical hashes are never edited.
13. **Environment:** the first autonomous plan installs dependencies and records the start-commit `npm test` baseline with port 7225 free. Pre-existing failures are recorded, not fixed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 24.14.1 (CI: 20) | — |
| npm | installs | ✓ | 11.19.0 | — |
| root `node_modules` | tests, esbuild | ✗ (fresh worktree) | — | `npm install` (Wave 0) |
| `mcp/node_modules` (SDK 1.29.0, ws, zod) | runner, MCP tests | ✗ (fresh worktree) | — | `npm --prefix mcp ci` (Wave 0) |
| `mcp/build` (full) | runner, Claude arm, tests | partial (6 tracked files) | — | `npm --prefix mcp run build` |
| `extension/dist/offscreen/lattice-host.js` | autopilot in the unpacked extension | ✓ (built 2026-09-28) | — | `npm run build` |
| Claude Code | MCP arm | ✓ | 2.1.283 | — |
| cursor-agent | optional arm | ✓ | 2026.09.08-6caf4ff | skip arm |
| Google Chrome (branded) | live campaign | ✓ (in use, Profile 2) | recorded at run time | Chromium/Chrome for Testing (not installed) |
| Global `fsb-mcp-server` / native-host runtime | pairing commands, native host launcher | ✓ | 0.11.0 / 0.11.0 | workspace `node mcp/build/index.js pair --reset` |
| xAI API key in the bench profile | autopilot arm | unknown | — | human checkpoint |

**Missing dependencies with no fallback:** none (all installable).
**Missing dependencies with fallback:** installs above; the xAI key and bench-profile setup are human steps.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Plain Node scripts (`node tests/x.test.js`, custom `assert`/`check` helpers) plus `node:test` for some suites (`node --test tests/mcp-lattice-journal.test.js`) |
| Config file | none; the root `package.json` `test` script is a 298-command `&&` chain; `pretest` runs `mcp-session-recorder-journal`, `mcp-lattice-journal` and `mcp-session-export-port` |
| Quick run command | `node tests/<file>.test.js` (or `node --test tests/<file>.test.js`) for each touched suite |
| Full suite command | `npm test` with port 7225 free (runs `pretest` first) |
| CI | Node 20, `npm run validate:extension && npm test` (`.github/workflows/ci.yml`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEAS-01 | `_handleMessage` stamps a non-enumerable timing symbol; lifecycle order `begin, route, result, end` unchanged; timing never appears in `_sendResult` JSON | unit (vm) | `node tests/mcp-bridge-background-dispatch.test.js` | ✅ extend |
| MEAS-01 | `_recordMcpSessionAction` and the dispatcher message-route recorder attach `timing {receivedAt, completedAt, fsbMs}`; terminal task-status outcomes keep timing through canonicalization | unit (vm) | `node tests/mcp-bridge-background-dispatch.test.js`; new case in `node tests/mcp-session-recorder.test.js` or a new `tests/mcp-call-timing.test.js` | ✅ extend / ❌ new |
| MEAS-01 | Recorder forwards timing into `_snapshotJournalEntry` / legacy snapshot; `beginCall` identity deep-equal unchanged | unit | `node tests/mcp-session-recorder-journal.test.js` | ✅ extend |
| MEAS-01 | Journal stores `metadata.timing` only when supplied; replay projection unchanged; both text exports show per-call ms and stay byte-equal | unit | `node --test tests/mcp-lattice-journal.test.js` | ✅ extend |
| MEAS-01 | `cost_in_usd_ticks` → USD; reasoning billed at output rate; unknown model → `unavailable`; `grok-4.3` exact row; legacy `estimateCost` pins updated to new Grok prices | unit | `node tests/cost-tracker.test.js` | ✅ update |
| MEAS-01 | Autopilot iteration rows and `durationMs` survive `saveSession` in both branches; unmeasured → null/omitted | unit | `node tests/automation-logger-mcp-retention.test.js` (new case) or new `tests/autopilot-measurement.test.js` | ✅ extend / ❌ new |
| MEAS-01 | `agent-loop.js` edits keep INV-04 and anchors | source pins | `node tests/mcp-philosophy-parity-smoke.test.js && node tests/lattice-survivability-smoke.test.js && node tests/agent-loop-iterator-guard.test.js && node tests/cost-tracker-ordering.test.js && node tests/meta-cognitive-tracker.test.js && node tests/ownership-leakage-regression.test.js && node tests/run-task-cleanup-paths.test.js && node tests/lattice-step-emitter-smoke.test.js` | ✅ run |
| MEAS-01 | `measurement` projection returns token counts and timing despite the `/token/i` filter; `durationMs` omitted when unmeasured | unit (vm) | `node tests/mcp-in-flight-session-lookup.test.js` (new cases) | ✅ extend |
| MEAS-01 / D-18 | `_handleGetConfig` returns `providerKind`/`modelProvider`/`modelName`, manifest version, extension id, `measurement` marker, and no secret-like keys | unit (vm) | `node tests/mcp-bridge-background-dispatch.test.js` (new case) | ✅ extend |
| MEAS-02 | Journal session resolves in JSON (envelope unchanged, `storageBackend: 'journal-v2'`, sanitized `actionHistory` with timing, no raw payload strings) and in text; branch skipped when the journal module is missing; legacy and in-flight fallbacks and `session_not_found` unchanged; paging beyond 500 events | unit (vm, real journal module with memory backend) | `node tests/mcp-in-flight-session-lookup.test.js` | ✅ extend |
| MEAS-02 | Round trip: an id from `list_sessions` (index projection) resolves via `get_session_detail` | integration (vm) | same file or new `tests/mcp-session-detail-journal.test.js` | ❌ new (optional) |
| MEAS-03 | Stats: median/quantile known answers; bootstrap deterministic by seed; A/A → inconclusive; known 0.7× effect → "faster" with CI excluding 1; zero-success task dropped and listed; Wilson bounds | unit | `node tests/bench-stats.test.mjs` | ❌ Wave 0 |
| MEAS-03 | Outcome evaluator: request/finalUrl/marker checks, count and exact-body rules, claims ignored | unit | `node tests/bench-outcome.test.mjs` | ❌ Wave 0 |
| MEAS-03 | Task schema validation, fixture hashing stable across runs, 6+6 core composition | unit | `node tests/bench-tasks.test.mjs` | ❌ Wave 0 |
| MEAS-03 | Identity: canonical JSON + tools/list digest stable under key reordering; runner refuses Web Store id / missing marker / wrong model | unit | `node tests/bench-identity.test.mjs` | ❌ Wave 0 |
| MEAS-03 | Claude stream summarizer: init/result extraction, ToolSearch detection, cost labelling; argv parity with `claude-profile.ts` source text | unit | `node tests/bench-claude-stream.test.mjs` | ❌ Wave 0 |
| MEAS-03 | Fixture server: port 0 on 127.0.0.1, path-traversal guard, per-run token attribution, evidence endpoint requires the secret | unit (local http) | `node tests/bench-fixture-server.test.mjs` | ❌ Wave 0 |
| MEAS-03 | Preflight, smoke, and the ~240-run baseline in a live browser | manual / live | `node scripts/bench/run-bench.mjs --preflight`, `--smoke`, `--campaign`; `node scripts/bench/report.mjs <campaignId>` | ❌ live-only |

### Sampling Rate
- **Per task commit:** the touched suites' quick commands above, plus the pin suites whenever `agent-loop.js`, `background.js` or the dispatcher changes.
- **Per wave merge:** `npm run test:mcp-journal && npm test` with 7225 free.
- **Phase gate:** full `npm test` green on the final commit; `npm run validate:extension` green; the six `tests/bench-*.test.mjs` run under Node 20 once (official Node 20 tarball, not `npx node@20`); live smoke and baseline campaign reviewed.

### Wave 0 Gaps
- [ ] `tests/bench-stats.test.mjs`, `tests/bench-outcome.test.mjs`, `tests/bench-tasks.test.mjs`, `tests/bench-identity.test.mjs`, `tests/bench-claude-stream.test.mjs`, `tests/bench-fixture-server.test.mjs` — append to the `test` chain and to `REFINEMENT_ROOT_TEST_COMMANDS` in one commit.
- [ ] A synthetic Claude stream-json fixture that includes a realistic `result` event (the existing `tests/fixtures/agent-streams/claude-code-2.1.177` fixture has no duration or cost fields).
- [ ] An xAI chat-completions response fixture with `usage.cost_in_usd_ticks`, `completion_tokens_details.reasoning_tokens` and `prompt_tokens_details.cached_tokens`.
- [ ] Environment: `npm install`, `npm --prefix mcp ci`, `npm --prefix mcp run build`, `npm --prefix showcase/server install`; confirm the chain is green on the start commit before the first extension edit.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth); bench changes bridge pairing | Use the product's `pair --reset`; never copy `sessionSecret` into bench artifacts |
| V3 Session Management | no | — |
| V4 Access Control | yes | Fixture server binds 127.0.0.1 only; evidence endpoint requires a runner-held secret; no new privileged FSB route |
| V5 Input Validation | yes | Task JSON validated before use; fixture server path-traversal guard (same as `tests/screenshot-uat.test.js:65-84`); timing numbers validated as finite non-negative before persistence |
| V6 Cryptography | yes (hashing only) | `node:crypto` `createHash('sha256')`; never hand-roll |
| V7/V8 Data protection and logging | yes | `_handleGetConfig` explicit allowlist (no keys); raw exports in gitignored `scripts/bench/.local/`; committed results carry metrics and identity only; `get_session_detail` projection reuses the existing sanitizers |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key or bridge secret leaking through `fsb://config` or bench identity | Information disclosure | Allowlist projection; unit test asserts no secret-like keys; identity records only IDs, versions and hashes |
| Page content from real sites committed in baseline files | Information disclosure | D-21 split: `.local/` raw vs `results/` sanitized; `.gitignore` entry for `scripts/bench/.local/` |
| Raw journal payloads returned over MCP | Information disclosure | Projection through `sanitizeActionHistoryEntry`; test asserts no inline request/result values in the response |
| Agent tampering with or reading outcome evidence | Tampering / spoofing | Evidence endpoint secret; evaluator reads only server-side logs and post-window CDP; claims stored separately |
| Spoofed timing via payload keys | Tampering | Timing lives on a Symbol, which JSON cannot carry; string payload keys are never read as timing |

## Plan Decomposition Hints (for the planner)

**Dependencies:** extension tracks are independent of each other except for shared contracts (field names below) and shared files; the live campaign depends on every code track plus the human preflight.

Shared contracts to state verbatim in each plan:
- Symbol: `Symbol.for('fsb.mcp.call-timing')`; stamp `{ receivedAt }`; recorder entry field `timing: { v:1, receivedAt, completedAt, fsbMs }`; journal `metadata.timing` (same shape, omitted when null).
- Autopilot: `session.iterationTiming[]` (flat rows, last 100, `usage: {input, output, reasoning, cachedInput}`, `usageSource`, `costUsd`, `costSource`, `servedModel`, `modelMs`, `toolMs`, `toolCount`), `session.measurementSummary`, `actionHistory[].durationMs`.
- Config: `{ config: {providerKind, modelProvider, modelName, ...}, extension: {id, version, measurement:{callTiming:1, sessionDetailJournal:1}} }`.

| Wave | Plan (suggested) | Files owned | Autonomous? | Notes |
|------|------|-------------|-------------|-------|
| 0 | **66-01 History export and hygiene** | `scripts/bench/export-history.mjs`, `.gitignore` (`scripts/bench/.local/`), `scripts/bench/results/history-2026-09-16_21/` | **No — human checkpoint H1 first** | Time-critical (prune ~2026-10-16..21). Snapshot `list_sessions`, run the console snippet in the Web Store control panel, then derive sanitized metrics. Also confirms `npm test` green on the start commit. |
| 1 | **66-02 MCP call timing capture + identity** | `extension/ws/mcp-bridge-client.js`, `extension/utils/mcp-session-recorder.js`, `extension/utils/mcp-lattice-journal.js`, tests `mcp-bridge-background-dispatch`, `mcp-session-recorder-journal`, `mcp-lattice-journal` | yes | Includes `_handleGetConfig` (same file) and both journal text exports. |
| 1 | **66-03 Session detail journal branch + measurement projection** | `extension/ws/mcp-tool-dispatcher.js` (message-route recorder timing, `dispatchMcpToolRoute` timing pass-through, `handleGetSessionMessageRoute`, sanitizer additions), test `mcp-in-flight-session-lookup` | yes | Parallel with 66-02 using the shared contract; its journal test cases use the real journal module with a memory backend. |
| 1 | **66-04 Autopilot timing, provider cost labels, price rows** | `extension/ai/agent-loop.js`, `extension/ai/cost-tracker.js`, `extension/utils/automation-logger.js`, optionally `extension/ai/action-history.js`; tests `cost-tracker`, `action-history`, `automation-logger-mcp-retention` (+ pin suites) | yes | Heaviest tripwire load; run the eight agent-loop pin suites on every commit. |
| 1 | **66-05 Bench core: helpers, tasks, fixtures, server** | `scripts/bench/lib/*`, `scripts/bench/tasks/**`, `scripts/bench/fixtures/**`, `scripts/bench/fixture-server.mjs`, `tests/bench-*.test.mjs`, `package.json` (test chain), `tests/delegation-phase-contract.test.js` (`REFINEMENT_ROOT_TEST_COMMANDS`) | yes | The only plan that edits the test chain. Node 20-safe tests. |
| 2 | **66-06 Runner, arms, report** | `scripts/bench/run-bench.mjs`, `scripts/bench/report.mjs`, `scripts/bench/lib/{mcp-client,claude-arm,cursor-arm,cdp}.mjs` | yes (code) | Depends on 66-05; runtime depends on 66-02..04. Preflight refuses on: 7225 not owned by the runner's server, missing `measurement` marker, Web Store extension id, `providerKind !== 'api'`, `modelProvider !== 'xai'`, `modelName !== 'grok-4.3'`. |
| 2 | **66-07 Integration verification** | none or test-only | yes | Full `npm test` with 7225 free; Node 20 run of bench tests; manual review that no timing appears in tool responses. |
| 3 | **66-08 Live baseline capture** | `scripts/bench/results/<campaignId>/**` | **No — human checkpoints H2-H5** | Smoke (2-3 tasks × 2 runs × 2 arms) → review evidence and identity → full campaign (12 × 10 × 2, ABBA) → report with A/A noise floor → commit sanitized results → restore everyday setup. |

**Human checkpoints (cannot be automated):**
- **H1 (first, urgent):** export the 40 sessions from the Web Store build in Profile 2 before further MCP use there.
- **H2 (bench profile setup, once):** create `~/.fsb-bench/chrome-profile`; launch branded Chrome with `--user-data-dir=<that dir> --remote-debugging-port=0 --no-first-run`; enable Developer mode and "Load unpacked" the worktree `extension/` (after `npm run build`); note the extension ID; place the native-host manifest copy with that origin in `<profile>/NativeMessagingHosts/`; disable FSB in the everyday profile (or quit everyday Chrome); run `fsb-mcp-server pair --reset`; open the bench Chrome so the unpacked extension pairs; in its control panel set provider xAI, enter the API key, select `grok-4.3`; sign into live-site accounts if the live set is used.
- **H3 (after the last extension commit):** reload the unpacked extension in the bench profile; the runner verifies the marker, extension ID and model through `fsb://config`.
- **H4 (campaign):** start the smoke, review, then the full campaign (may span Claude usage windows; keep the machine awake).
- **H5 (restore):** close the bench Chrome, `fsb-mcp-server pair --reset`, re-enable FSB in the everyday profile so the Web Store build re-binds; optionally delete the bench profile.

## Integration Point Index (verified line numbers, 2026-09-29)

| File | Lines | What |
|------|-------|------|
| `extension/ws/mcp-bridge-client.js` | 12-97 top-level consts; 1144-1199 `_handleMessage`; 1689-1743 `_recordMcpSessionAction`; 1745-1944 `_handleExecuteAction` (record at 1933); 2349-2625 `_handleStartAutomation`; 2702-2708 `_handleGetConfig` | ingress, action tap, run_task settle, config |
| `extension/ws/mcp-tool-dispatcher.js` | 160 `MCP_REPLAY_RECORD_CONTEXT`; 576-579 payload spread; 639-731 `dispatchMcpToolRoute` (recordTaskOutcome 714-724); 733-874 `dispatchMcpMessageRoute` (recorder entry 823-871); 2027-2050 `isSensitiveKey`/`sanitizeValue`; 2064-2116 sanitizers; 2636-2677 `handleStartAutomationRoute`; 2870-2957 list/get session routes; 3184-3197 defineProperty precedent; 3926 exports | |
| `extension/utils/mcp-session-recorder.js` | 100 caps; 854-880 `_snapshotEntry`; 918-966 `_snapshotJournalEntry`; 1751-1800 `recordTaskOutcome`; 2048-2220 legacy `_recordDispatchNow` (push 2146-2152); 2222-2280 `recordDispatch` (run_task skip 2226); 2282-2325 call identity/lease; 2336-2352 `recordAction` | |
| `extension/utils/mcp-lattice-journal.js` | 24-30 limits/retention/idle; 44-48 `INTERNAL_PAYLOAD_KEYS`; 76-86 `clone`; 821-872 strip/index entry; 1168-1330 `recordDispatchNow` (metadata 1210-1229); 1530-1564 `closeIdleRun`; 1620-1648 detail; 1752-1766 replay entry; 2008-2045 `hasSession`/`exportHumanReadable`; 2103-2180 `streamSessionExport`; 2199-2247 api | |
| `extension/ai/agent-loop.js` | 1457-1465 `saveToLogger`; 1637-1669 `finalizeSession`; 1936 `apiCallStartTime`; 1954-1992 provider call; 2005-2029 usage/cost; 2053-2063 `AFTER_API_RESPONSE`; 2066-2146 end_turn; 2229-2293 malformed/permission/denial; 2298 step marker; 2769-2795 metrics row (reasoning tokens); 2797-2821 action push + `AFTER_TOOL_EXECUTION`; 2899-2906 `AFTER_ITERATION` | |
| `extension/ai/cost-tracker.js` | 23-54 table; 67-92 `estimateCost` (fallback 85-88); 128-135 `record` | |
| `extension/ai/action-history.js` | 38-53 `createActionEvent`; 91-100 `push`; 219-225 serializer | |
| `extension/ai/tool-use-adapter.js` | 312-337 `extractUsage` | |
| `extension/utils/automation-logger.js` | 20 cap; 557 `logTiming`; 689 `exportHumanReadable`; 840-1040 `saveSession` (884 totalCost; 904-916 and 963-973 action projections; 982-1012 index) | |
| `extension/background.js` | 81/94/97/104/122 SW loads; 803-816 agent-engine loads; 1726-1739 authoritative provider; 2204-2233 pairing via native host; 4958 `persistSession`; 12495-12536 control-panel session handlers; 13624-13647 start automation / agent consent | |
| `extension/offscreen/lattice-host.js` | 183-213 `computeUrl`; 878-906 non-streaming fetch | |
| `extension/ui/options.js` | 3443-3487 journal hydrate/load; 3508-3548 streaming export | |
| `mcp/src/agent-providers/claude-profile.ts` | 24-31 denied tools; 187-207 task-mode argv | |
| `mcp/src/tools/observability.ts` | 43-66 `get_session_detail` (10 s timeout) | |
| `mcp/src/queue.ts` | 16-22, 64-77 read-only bypass vs serialized mutations | |
| Tests (pins) | `lattice-provider-bridge-smoke.test.js:634-685`; `lattice-survivability-smoke.test.js:371-372`; `mcp-philosophy-parity-smoke.test.js:373-378`; `agent-loop-iterator-guard.test.js:49-69`; `cost-tracker.test.js` (Grok prices, unknown fallback); `action-history.test.js:67`; `turn-result.test.js:50`; `mcp-session-recorder-journal.test.js:92`; `mcp-lattice-journal.test.js:416-431, 1380-1398`; `mcp-tool-smoke.test.js:58`; `delegation-phase-contract.test.js:129-155, 2373-2391` | |

## Sources

### Primary (HIGH confidence)
- Codebase reads and probes in this session (files and line ranges in the Integration Point Index), including a `vm` probe of the current `get_session_detail` sanitizer, a node probe of `estimateCost` matches, and node checks of Symbol/`vm` semantics.
- `/opt/homebrew/lib/node_modules/fsb-mcp-server/node_modules/@modelcontextprotocol/sdk` 1.29.0 — `client/stdio.d.ts` (`pid`, `stderr`), `client/index.d.ts` (`getServerVersion`, `listTools`, `readResource`, `callTool`), `shared/protocol.js:8` (60 s default timeout), `protocol.d.ts` (`resetTimeoutOnProgress`, `maxTotalTimeout`).
- Local files: `~/.fsb/bridge-auth.json` (origin pin; secrets not read into output), native messaging host manifests, `~/.fsb/native-host/install-receipt.json`.

### Secondary (MEDIUM confidence — official docs fetched 2026-09-29)
- https://docs.x.ai/developers/migration/may-15-retirement — retired slugs and grok-4.3 redirect, pricing.
- https://docs.x.ai/developers/cost-tracking — `usage.cost_in_usd_ticks`, 1e10 ticks, streaming final chunk.
- https://docs.x.ai/developers/pricing and https://docs.x.ai/developers/models/grok-4.3 — `grok-4.3` ($1.25/$2.50, alias `grok-4.3-latest`, default reasoning `low`, function calling yes).
- https://code.claude.com/docs/en/headless — `system/init`, `result`, SIGTERM/SIGINT behaviour, `--mcp-config` startup wait.
- https://code.claude.com/docs/en/costs — cost figures are client-side list-price estimates.
- https://code.claude.com/docs/en/mcp — `ENABLE_TOOL_SEARCH`, `ToolSearch`/`WaitForMcpServers`, 2,048-char truncation.
- https://cursor.com/docs/cli/reference/output-format — result has durations only.
- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging — user-level hosts live under the profile's `NativeMessagingHosts`.

### Tertiary (LOW confidence)
- Prior milestone research (`.planning/research/STACK.md`) for branded Chrome 137+ ignoring `--load-extension`; not re-verified this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; SDK and CLIs verified locally.
- Architecture (extension changes): HIGH — every integration point read at current lines; sanitizer and pricing behaviour probed.
- Benchmark topology (Chrome profile, native host, pairing): MEDIUM — mechanisms verified in code and local files; Chrome behaviour for custom profiles partly documented.
- Pitfalls: HIGH for code pitfalls (verified); MEDIUM for campaign cost and duration.

**Research date:** 2026-09-29
**Valid until:** 2026-10-13 for external facts (xAI models and Claude Code change weekly); code facts until the next edit of the listed files.
