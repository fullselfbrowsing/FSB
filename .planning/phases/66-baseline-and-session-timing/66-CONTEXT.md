# Phase 66: Baseline and Session Timing - Context

**Gathered:** 2026-09-29 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish trustworthy timing and task-outcome records before any Jev path changes execution (MEAS-01, MEAS-02, MEAS-03).

In scope:
- per-call timing for MCP and autopilot sessions, with honest "unavailable" labels
- a working `get_session_detail` for journal-backed MCP sessions
- a repeatable, outcome-checked benchmark suite with a saved baseline and enough run identity to compare later runs

Out of scope:
- any change to how FSB decides or executes (no Jev, no description edits, no `expect`)
- control-panel UI changes
- the MCP settings tool (now Phase 66.1)
</domain>

<decisions>
## Implementation Decisions

### Change footprint and compatibility
- **D-01:** Keep the MCP diff minimal: Phase 66 changes no source file under `mcp/`. The extension does the work (timing capture, the session-detail fix, run identity, cost labels), and the benchmark lives in `scripts/bench/`. `fsb://config` already passes the extension's payload through unchanged (`mcp/src/resources/index.ts:138-162`), so identity fields are an extension-only edit.
- **D-02:** Every Phase 66 change is additive and does not change behavior:
  - Autopilot decisions, action execution, tool names, schemas, descriptions and response shapes stay as they are, apart from added optional fields.
  - The one intended behavior change: `get_session_detail` returns journal sessions instead of "not found".
  - Milestone-wide rule from the user: with Jev disabled, FSB behaves exactly as it does today.
- **D-03:** No MCP-server-side timestamps in this phase. Time spent in the MCP `TaskQueue` is labelled "not measured" and is never quietly folded into another figure. Caller gap is the extension's receive time for call n minus its completion time for call n−1; both are measured on the same machine.

### Timing capture and storage
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

### Session detail and operator surface
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

### Tokens and cost
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

### Benchmark suite
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
  - *Amended 2026-10-12:* the export half of D-20 is superseded. The Web Store build was reinstalled on 2026-10-09, which wiped the 40 sessions before the export ran, and no backup exists, so 66-01 was closed without executing it (see 66-01-SUMMARY.md). The save-each-run rule still applies.
- **D-21:** Raw session exports stay local and out of git, because they can contain page content from real sites. Only sanitized per-run metrics, identity and aggregates are committed as the baseline.

### Claude's Discretion
- Autopilot timing capture: a new hook module (e.g. `extension/ai/hooks/timing-hook.js`) or inline stamps. Weigh the tripwires:
  - A new module raises the pinned `importScripts` count (333, `tests/lattice-provider-bridge-smoke.test.js:634-635`).
  - Editing `agent-loop.js` touches pinned counts such as the 8 `setTimeout` tokens and fixed anchor text.
- The exact xAI model ID to pin (a current grok-4.3 variant), confirmed during research.
- Where the committed baseline artifacts live (`scripts/bench/results/` or the phase directory), within D-21.
- The exact fixture tasks, the internal layout of the benchmark scripts, and the report format.
- Whether the text export shows per-call timing as columns or inline.

### Folded Todos
None. No pending todos matched Phase 66.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` — Phase 66 goal and success criteria, and the inserted Phase 66.1. This file has the authoritative phase numbering.
- `.planning/REQUIREMENTS.md` — MEAS-01..03, and MCP-04 (the only new parameter allowed is `expect`).
- `.planning/PROJECT.md` — v1.0.0 milestone section, the measured 40-session baseline, and facts about the MCP tool surface.
- `.planning/STATE.md` — current position and the invariants carried forward (INV-01, INV-04, tripwire discipline).

### Research (v1.0.0; uses an older 8-phase numbering, so match sections by content, not phase number)
- `.planning/research/SUMMARY.md` — "Phase 66 — Measurement floor" section; Pitfalls 1, 2, 11, 15.
- `.planning/research/ARCHITECTURE.md` — per-call timing at extension boundaries, the journal-branch fix, Anti-Pattern 7 (no timing in responses), and the tripwire register.
- `.planning/research/PITFALLS.md` — Pitfalls 1-3 and 17; the "Looks Done But Isn't" checklist.
- `.planning/research/STACK.md` — the "Per-Call Timing" and "Benchmark and Measurement Tooling" tiers.
- `.planning/research/FEATURES.md` — "Benchmark and measurement"; the automated caller-side driver.
- `.planning/research/JEV-REFERENCE.md` — background only; Phase 66 makes no Jev calls.

### Codebase maps
- `.planning/codebase/TESTING.md` — test runner, the `npm test` chain, and suites that bind ports.
- `.planning/codebase/CONVENTIONS.md` — classic-script modules and the `module.exports` guard.

### External (verified 2026-09-29)
- xAI model retirement: https://docs.x.ai/developers/migration/may-15-retirement
- xAI cost tracking (`cost_in_usd_ticks`): https://docs.x.ai/developers/cost-tracking
- xAI pricing: https://docs.x.ai/developers/pricing
- Claude Code costs and the headless `result` event: https://code.claude.com/docs/en/costs
- Claude Code MCP tool search: https://code.claude.com/docs/en/mcp
- Cursor CLI output format: https://cursor.com/docs/cli/reference/output-format
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Journal API in `extension/utils/mcp-lattice-journal.js`:
  - `hasSession`
  - `getSessionDetail` (up to 500 events; ~1631-1648)
  - `exportHumanReadable` (~2008-2045)
  - `streamSessionExport` (~2103)
  - module exports (~2199-2240)
- Control-panel lookup that checks the journal first and converts results to the legacy shape: `extension/background.js` ~12496-12536 and `extension/ui/options.js` ~3444-3486.
- Sanitizers `sanitizeSessionMetadata`, `sanitizeActionHistoryEntry` and `sanitizeSessionDetail`: `extension/ws/mcp-tool-dispatcher.js` ~2064-2116. The hidden-symbol context pattern is at ~160.
- Autopilot hook points in `extension/ai/agent-loop.js`:
  - `apiCallStartTime` (~1936)
  - `AFTER_API_RESPONSE` (~2055)
  - `BEFORE_TOOL_EXECUTION` (~2260) and `AFTER_TOOL_EXECUTION` (~2816)
  - `saveToLogger` (~1457-1465)

  Also `createActionEvent.durationMs` in `extension/ai/action-history.js` ~38-53.
- Existing examples of metrics that are labelled and may be null: `McpPricingResult` (`mcp/src/tools/pricing.ts` ~68-74) and `_projectMetrics` (`extension/utils/delegation-event-store.js` ~551-580).
- Timing data already recorded:
  - `change_report.settle_ms` (dispatcher ~3891)
  - the `run_task` heartbeat's `elapsed_ms` and `FsbMcpTaskStore.started_at` (`mcp-bridge-client.js` ~2384-2565)
  - `automationLogger.logTiming` (`automation-logger.js` ~557); most callers pass `sessionId: null`
- Building blocks for the benchmark driver:
  - the Claude Code launch profile (`mcp/src/agent-providers/claude-profile.ts` ~179-207)
  - the stream parser `claude-stream.ts`; its `ResultSchema` uses `.passthrough()`
  - the fixture harness precedent in `tests/screenshot-uat.test.js`
  - the in-process server `createRuntime` in `mcp/src/runtime.ts`

  The fixture `tests/fixtures/agent-streams/claude-code-2.1.177` is synthetic, and its `result` line has no duration or cost fields.

### Established Patterns
- Wire changes are additive only. Recording sidecars are stripped by `INTERNAL_PAYLOAD_KEYS` (`mcp-lattice-journal.js` ~44-48) and checked by `RECORDING_SIDECAR_FIELDS` (`tests/mcp-tool-smoke.test.js:58`).
- Recording never blocks routing: it is fire-and-forget inside try/catch.
- Service-worker modules are classic `importScripts` scripts with a `module.exports` guard.
- Missing values are null, never 0. History keeps 50 sessions per mode; the journal keeps 30 days.
- Source-pin tripwires: every commit that touches the extension updates the tests that pin it in the same commit. The full suite stays green from the phase's first commit.

### Integration Points
- Bridge client, `mcp-bridge-client.js`:
  - `_handleMessage`, where calls arrive (~1144-1199)
  - `_recordMcpSessionAction` (~1689-1743)
  - `_handleGetConfig` (~2702-2707)
- Dispatcher: the message-route recorder (~829-851) and `handleGetSessionMessageRoute` (~2904-2957).
- Recorder, `extension/utils/mcp-session-recorder.js`:
  - `_snapshotJournalEntry` (~918-966)
  - the legacy `actionHistory.push` (~2146-2152)
  - the `run_task` skip (~2226); `run_task` is never journaled
- Journal:
  - `recordDispatchNow` metadata (~1210-1229)
  - `buildIndexEntry` (~836-872)
  - `closeIdleRun` (~1530-1564)
- Logger: the `saveSession` projections (`automation-logger.js` ~904-916 and ~963-974; index ~982-1012).
- Usage and cost:
  - agent loop, `agent-loop.js` ~2005-2029
  - usage extraction, `extension/ai/tool-use-adapter.js` ~312-337
  - reasoning tokens, `universal-provider.js` ~676
- Tests pinned to these files:
  - `tests/mcp-in-flight-session-lookup.test.js`
  - `tests/mcp-session-recorder-journal.test.js`
  - `tests/mcp-tool-smoke.test.js`
  - `tests/action-history.test.js:67`
  - `tests/turn-result.test.js:50`
  - `tests/lattice-provider-bridge-smoke.test.js:634-635`
  - `tests/lattice-survivability-smoke.test.js:371-372`
  - `tests/mcp-philosophy-parity-smoke.test.js`
  - `tests/mcp-lattice-journal.test.js`
  - `tests/cost-tracker.test.js`
</code_context>

<specifics>
## Specific Ideas

- User direction on the MCP arm: "minimal diff (as minimal changes to MCP as possible) (extension does most of the heavy lifting)". Recorded as D-01. A scripted host still drives the MCP arm from `scripts/bench/`, which touches nothing under `mcp/`.
- User direction for the milestone: with Jev disabled, all of FSB must stay backwards compatible (D-02).
- Measured facts the baseline should reproduce:
  - Median MCP wall time is 9.5 s per call with Claude and 4.6 s with Cursor. (The 40 source sessions were lost on 2026-10-09, so these two figures can no longer be re-derived; see the D-20 amendment.)
  - FSB's own execution takes about 0.3-1 s per call.
  - Caller turns are 85-90% of MCP time.
  - No autopilot sessions have been recorded yet.
</specifics>

<deferred>
## Deferred Ideas

- **MCP settings tool.** Shows all control-panel settings compactly and sets any one of them, including the Jev fast-mode toggle once Phase 68 adds it.
  - Reads hide secrets.
  - Writes may change any setting except secrets and credentials; the user chose this over an allowlist.
  - The user approved this new tool on 2026-09-29, and it is inserted as **Phase 66.1**. MCP-04 and the out-of-scope entry against a second user-facing fast-mode switch are amended to match.
- **FSB's default autopilot model has been retired.** Requests for `grok-4-1-fast` are now served by grok-4.3, at about 5-6× the cost FSB assumes. Updating the product default is a separate fix; Phase 66 only pins the model the benchmark uses (D-19).
- **MCP-server-side timestamps** (`serverReceivedAt`, measured `TaskQueue` wait). Add these later only if runs with concurrent agents need queue wait separated from caller gap (D-03).
- **Per-call timing columns in the control-panel session viewer.** Not planned (D-09).

### Reviewed Todos (not folded)
None.
</deferred>

---

*Phase: 66-baseline-and-session-timing*
*Context gathered: 2026-09-29*
