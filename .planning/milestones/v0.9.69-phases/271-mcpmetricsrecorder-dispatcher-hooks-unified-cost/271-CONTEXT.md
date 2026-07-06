# Phase 271: MCPMetricsRecorder + Dispatcher Hooks + Unified Cost Surfacing - Context

**Gathered:** 2026-05-14
**Status:** Planned (271-01-PLAN.md, 3 tasks, single wave)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** COST-01, COST-02, COST-03, COST-04, COST-05

<domain>
## Phase Boundary

Every MCP tool dispatch flows through a single recorder that contributes to the SAME analytics numbers the user already sees in the Control Panel.

**In scope:**
- New `extension/utils/mcp-metrics-recorder.js` module (function/prototype on `globalThis.fsbMcpMetricsRecorder`) — the SINGLE fact-emission site for every MCP tool dispatch.
- Try/finally wrappers in `extension/ws/mcp-tool-dispatcher.js` (`dispatchMcpToolRoute` lines 285-301 + `dispatchMcpMessageRoute` lines 303-331 per ARCHITECTURE research §1.1) calling `MCPMetricsRecorder.recordDispatch()` post-resolve.
- Best-effort token estimator: a tool->tokens heuristic table (click ≈ 50 in / 30 out, get_dom_snapshot ≈ 100 in / 4000 out, run_task ≈ 200 in / 8000 out, navigate ≈ 50 in / 20 out, type_text ≈ tokens_from_text_length, read_page ≈ 80 in / 2000 out, fallback ≈ 100 in / 200 out).
- Cost computation via Phase 270's `globalThis.fsbMcpPricing.estimateMcpCost()`.
- Writes rows to `chrome.storage.local.fsbUsageData` (SAME key as existing AI-provider analytics from `extension/ai/cost-tracker.js`); each MCP row carries `source: 'mcp'` discriminator; AI-provider rows continue to carry `source: 'ai-provider'` (back-fill source on existing rows if absent).
- Broadcasts via existing `ANALYTICS_UPDATE` runtime message so the Control Panel hero refreshes immediately.
- Tests: `tests/mcp-metrics-recorder.test.js` covering single-source-of-truth (one recordDispatch -> one row, no double-count), MCP/AI distinguishability via source field, hero-number recomputation includes both, token-estimator deterministic output per tool name.

**Explicitly NOT in scope:**
- Outbound telemetry collector (Phase 272 — separate phase, reads from `fsbUsageData` rows OR from a Recorder summary callback).
- Server-side ingest (Phase 273).
- Stats page consumption (Phase 274).
- MCP/AI split tooltip in Control Panel hero (declined by user: strictly merged per D-04).
- Per-call log row UI (the per-call log already exists in Control Panel for AI-provider; the MCP rows automatically appear there because they share `fsbUsageData` -- no new UI surface).

</domain>

<decisions>
## Implementation Decisions

### Token harvest (the big one)
- **Strategy:** Best-effort estimate via a hardcoded tool->{in, out} heuristic table.
- **Per-row schema includes `token_source: 'estimate' | 'measured' | 'unknown'`:**
  - `'estimate'`: derived from the heuristic table.
  - `'measured'`: not used in v0.9.69 (MCP envelopes don't carry tokens). Reserved for future.
  - `'unknown'`: tool not in heuristic table; fall through to fallback row of ~100 in / 200 out, marked `token_source='unknown'`.
- **Heuristic table location:** new constant `MCP_TOOL_TOKEN_HEURISTICS` inside `extension/utils/mcp-metrics-recorder.js` (NOT in the pricing JSON — different concern; tokens are estimator-side, prices are provider-side).
- **Heuristics seed values** (initial; refine over time):
  - `click`, `click_at`, `double_click`, `right_click`, `hover`, `press_enter`, `press_key` → 50 in / 30 out
  - `type_text`, `insert_text` → `Math.max(50, Math.ceil(text.length / 4))` in / 30 out
  - `navigate`, `open_tab`, `switch_tab`, `go_back`, `go_forward`, `refresh` → 50 in / 30 out
  - `read_page` → 80 in / 2000 out
  - `get_dom_snapshot` → 100 in / 4000 out
  - `get_text`, `get_attribute` → 80 in / 200 out
  - `run_task` → 200 in / 8000 out
  - `wait_for_element`, `wait_for_stable` → 50 in / 30 out
  - `scroll`, `scroll_at`, `scroll_to_*` → 50 in / 30 out
  - `fill_sheet`, `read_sheet` → 150 in / 500 out
  - Unknown tool: 100 in / 200 out + `token_source: 'unknown'`
- **Document in code that heuristics are coarse and will be revisited in v0.9.70+ once telemetry baselines real per-tool usage**.

### Hero merge (strictly merged per D-04 + user choice this phase)
- The existing Control Panel hero ("Total Tokens / Total Cost / Total Requests") reflects the SUM of all `fsbUsageData` rows REGARDLESS of `source` field.
- NO new UI section labeled "MCP" or "AI breakdown".
- NO hover tooltip with split.
- The per-call log row UI (existing in Control Panel) renders rows from `fsbUsageData` and naturally shows MCP rows alongside AI rows; if the existing UI renders a "model" column, MCP rows show the assumed default model (from pricing module).
- If the existing per-call log filters by `source === 'ai-provider'` (back-compat), update the filter to accept BOTH sources OR remove the filter entirely.

### Row schema
- New row shape (BOTH MCP and AI-provider write to this, AI-provider rows are back-filled to add `source` if missing):
  ```js
  {
    source: 'mcp' | 'ai-provider',
    client: string,           // MCP client label OR AI provider name (e.g., 'anthropic')
    tool: string,             // MCP tool name OR AI model name (existing field for AI rows)
    model: string,            // resolved model used for pricing
    tokens_in: number,
    tokens_out: number,
    token_source: 'estimate' | 'measured' | 'unknown',
    cost_usd: number | null,  // null for unknown pricing
    pricing_confidence: 'HIGH'|'MEDIUM'|'LOW'|'fallback'|null,
    ts: number                // Date.now()
  }
  ```
- AI-provider rows from `extension/ai/cost-tracker.js` get a one-time migration at storage-load time: any row lacking `source` is back-filled with `source: 'ai-provider'`.

### Single chokepoint (no double-counting)
- ONLY `MCPMetricsRecorder.recordDispatch()` writes MCP rows to `fsbUsageData`.
- `dispatcher.js`'s `try/finally` is the ONLY place that calls it.
- Phase 272's `TelemetryCollector` consumes ROWS from `fsbUsageData` (or a derived summary) — it does NOT call `recordDispatch()` directly, eliminating double-count vector.

### Hook placement
- `dispatchMcpToolRoute` (mcp-tool-dispatcher.js lines 285-301): wrap `route.handler(...)` in try/finally; finally block calls `recordDispatch({client, tool, requestPayload, response, success})`.
- `dispatchMcpMessageRoute` (lines 303-331): same pattern.
- Hook runs POST-resolve so success/failure both captured; errors do NOT skip recording.

### Tests
- `tests/mcp-metrics-recorder.test.js`:
  1. recordDispatch with known tool -> single fsbUsageData row appended, source='mcp', token_source='estimate'.
  2. recordDispatch with unknown tool -> single row with token_source='unknown'.
  3. recordDispatch failure case -> still records (no row drop on error).
  4. 10 sequential recordDispatch calls -> exactly 10 rows (no double-count).
  5. Hero recompute (sum across rows) -> includes both 'mcp' and 'ai-provider' sources.
  6. AI-provider row back-fill: rows without source get `source: 'ai-provider'` on storage load.
  7. type_text token estimation -> proportional to text.length.
  8. Pricing integration: known client+tool -> cost number; unknown client+unknown tool -> cost=null.
- Test invokes `globalThis.fsbMcpPricing.estimateMcpCost()` — uses Phase 270's module.

### Claude's Discretion
- Exact `console.log` debug-level wording on dispatch hook.
- Whether to add a `dispatcher_route: 'tool' | 'message'` field on MCP rows for future debug -- recommend yes, harmless.
- Exact `package.json` test chain position (mirror Phase 269+270 insertion order).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/ai/cost-tracker.js` -- the existing `MODEL_PRICING` table + `estimateCost()` resolver for AI-provider calls. Pattern to mirror for the MCP recorder shape, but NOT to call (MCP uses Phase 270's `fsbMcpPricing` instead).
- `extension/utils/analytics.js` -- the existing `fsbUsageData` reader (loads, recomputes hero numbers). Storage key shared.
- `extension/utils/install-identity.js` (Phase 269) -- function/prototype on globalThis pattern.
- `extension/utils/mcp-pricing.js` (Phase 270) -- resolver invoked via `globalThis.fsbMcpPricing.estimateMcpCost(...)`.
- `extension/ws/mcp-tool-dispatcher.js` lines 285-331 -- the chokepoints to hook.

### Established Patterns
- `chrome.runtime.sendMessage({type: 'ANALYTICS_UPDATE', ...})` broadcasts hero refresh (existing at background.js line ~11440 per ARCHITECTURE).
- `fsbUsageData` is a flat array of row objects appended on each dispatch.
- All FSB extension storage keys use camelCase with `fsb` prefix.

### Integration Points
- `extension/ws/mcp-tool-dispatcher.js` lines 285-301 + 303-331 — the try/finally chokepoints (sole place that writes MCP rows).
- `extension/utils/mcp-metrics-recorder.js` (NEW) — wraps `chrome.storage.local` append + pricing call + broadcast.
- `extension/utils/analytics.js` line 148-180 — back-fill `source: 'ai-provider'` on load.
- `extension/background.js` importScripts chain — after `mcp-pricing.js` (Phase 270), add `mcp-metrics-recorder.js`.

</code_context>

<specifics>
## Specific Ideas

- The token heuristics are deliberately conservative initial values; they will be tuned in v0.9.70+ based on real telemetry baselines that the FSB server starts collecting in Phase 273.
- `text.length / 4` is the OpenAI rule-of-thumb for English text tokens (~1 token per 4 chars) — close enough for the type_text heuristic.
- The MCP row's `model` field uses the resolved default model from Phase 270's pricing module — so a Claude Code call gets `model: 'claude-opus-4-7'`, Codex gets `model: 'gpt-5.5'`, etc.

</specifics>

<deferred>
## Deferred Ideas

- Real per-tool token measurement (deferred until MCP envelopes start carrying token counts).
- Per-MCP-client pie chart in Control Panel (declined by user; aggregates stay merged).
- Export CSV button (declined by user this phase).
- MCP/AI split tooltip on hover (declined by user; strictly merged).
- Auto-tuning of token heuristics from telemetry baselines (v0.9.70+).

</deferred>

<plan_reconciliations>
## Planner Notes (added 2026-05-14 during /gsd-plan-phase)

Four reconciliations between CONTEXT.md and the live codebase were discovered during planning and resolved in `271-01-PLAN.md` `<reconciliations>` block:

1. **`source` field collision** — existing `extension/utils/analytics.js:4-10` `normalizeUsageSource()` coerces unknown source values to `'automation'`. Without intervention, `'mcp'` would be clobbered on every `loadStoredData`. Resolution: extend the function to whitelist `'mcp'` and `'ai-provider'` as additional legal values; the legacy three (`automation|memory|sitemap`) coexist as a 5-value enum on the merged row.

2. **Token-key naming collision** — existing analytics rows use camelCase (`inputTokens`/`outputTokens`/`cost`/`timestamp`). CONTEXT.md decision 5 specifies snake_case (`tokens_in`/`tokens_out`/`cost_usd`/`ts`). The hero `getAllTimeStats` reads camelCase. Resolution: MCP rows write BOTH key sets — canonical snake_case for Phase 272 telemetry, camelCase aliases for hero compatibility with no UI changes. `cost_usd: null` (unknown pricing) maps to legacy `cost: 0` so the hero sum stays correct; `cost_usd` remains null as the canonical "uncounted" signal Phase 274 surfaces.

3. **`mcp-pricing.js` not wired in importScripts chain** — `grep mcp-pricing extension/background.js` returns ZERO matches. Phase 270 produced the module + JSON + tests, but did not wire the importScripts call. Task 1 wires BOTH `utils/mcp-pricing.js` (one-line Phase-270 repair) AND `utils/mcp-metrics-recorder.js`, both AFTER `ws/mcp-tool-dispatcher.js`.

4. **No existing per-call log UI surface** — CONTEXT.md decision 9 references "the per-call log already exists in Control Panel", but `grep` confirms no such UI exists in `extension/ui/control_panel.html`. The closest UI is the 4-tile analytics hero + cost-breakdown + chart. Resolution: NO new UI in this phase (per CONTEXT decision 8 "NO new UI section"). Hero numbers auto-update because MCP rows live in `fsbUsageData`, `getAllTimeStats` sums all rows, and the camelCase aliases ensure visibility. Cost-breakdown workflow tiles (Automation/Memory) read `getStatsBySource('30d', 'automation'|'memory')` and correctly do NOT include MCP rows (source='mcp') — the intended D-04 separation: hero is unified; workflow-source breakdown is orthogonal.

</plan_reconciliations>
</content>
</invoke>