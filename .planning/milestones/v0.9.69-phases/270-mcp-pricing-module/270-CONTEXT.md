# Phase 270: MCP Pricing Module - Context

**Gathered:** 2026-05-14
**Status:** Plans created (270-01-PLAN.md, 2026-05-14)
**Mode:** Auto-generated (infrastructure-only — skipped smart-discuss; all success criteria are developer-facing)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** PRICE-01, PRICE-02, PRICE-03, PRICE-04, PRICE-05

<domain>
## Phase Boundary

A developer can attribute a USD cost to any MCP tool call by looking up the calling client and its assumed default model in a single auditable table.

**In scope:**
- New module exporting `MCP_MODEL_PRICING` (per-model input/output rates), `MCP_CLIENT_DEFAULT_MODEL` (client label -> assumed model), and a resolver function `estimateMcpCost({client, model?, tokensIn, tokensOut})`.
- Source-stamped May 2026 rates with code-comment URLs per row.
- HIGH/MEDIUM/LOW confidence column per row.
- Fallback policy: unknown (client, model) -> `{cost: null, source: 'unknown'}`. Never $0, never default-model row.
- `PRICING_SOURCE_DATE = "2026-05-14"` constant attached to every resolver result.
- Unit tests covering 12 allowlist clients + unknown-pair fallback + every confidence level.

**Explicitly NOT in scope:**
- Wiring the resolver into MCP dispatch (Phase 271).
- Per-request surcharges (web search, Google grounding, etc.) -- documented as future telemetry enrichment, not v0.9.69.
- Batch / cache-hit rate discounts beyond capturing the raw standard rate.
- Auto-refresh CI gate (deferred per user scope: TELEMETRY-FUTURE PRICING-REFRESH-CI).
- Per-event `actual_model` field for runtime overrides (deferred; STACK research §Open Questions).
</domain>

<decisions>
## Implementation Decisions

### Module location (Claude's Discretion, decided)
- Two parallel modules ship:
  - **`mcp/src/tools/pricing.ts`** — TypeScript module for MCP server-side use (if downstream phases ever need it server-side). Exports `MCP_MODEL_PRICING`, `MCP_CLIENT_DEFAULT_MODEL`, `estimateMcpCost()`, `PRICING_SOURCE_DATE`.
  - **`extension/utils/mcp-pricing.js`** — JS mirror for the extension service-worker side (function/prototype attached to `globalThis.fsbMcpPricing`, `importScripts`-compatible — mirrors the analytics.js / install-identity.js pattern landed in Phase 269).

**Rationale:** Phase 271 (MCPMetricsRecorder) runs INSIDE the extension service worker (CommonJS / globalThis pattern), not server-side TS. So the extension needs the JS version. The TS version is kept in sync because the MCP server may surface costs in error messages or analytics tools later. They share the same canonical rates via a shared JSON data file: `mcp/data/mcp-pricing-data.json` is the source-of-truth; both .ts and .js modules import from it OR copy it verbatim with a freshness check at boot.

**Simplification:** ship JSON source-of-truth + JS extension module + TS server module. Use JSON for shared data; thin wrapper functions per platform.

### Resolver contract
- Input: `{ client: string, model?: string, tokensIn: number, tokensOut: number }`.
- Output: `{ cost: number | null, source: 'lookup' | 'fallback' | 'unknown', model_used: string | null, pricing_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'fallback' | null, pricing_source_date: '2026-05-14' }`.
- Throws: **never**. Always returns the shape above.

### Fallback policy
- Path 1: `model` provided AND in `MCP_MODEL_PRICING` -> `{cost: rate*tokens, source: 'lookup', model_used: model, pricing_confidence: row.confidence}`.
- Path 2: `model` missing/unknown BUT `client` in `MCP_CLIENT_DEFAULT_MODEL` AND its default model is in `MCP_MODEL_PRICING` -> compute using the default model, `source: 'fallback'`, `pricing_confidence: 'fallback'`.
- Path 3: neither matches -> `{cost: null, source: 'unknown', model_used: null, pricing_confidence: null}`.
- Path 4: `tokensIn` or `tokensOut` is `null`/`undefined`/non-finite (NaN, Infinity, -Infinity) OR **negative** -> `cost: null`, but still return `model_used` + `source` as far as the lookup got. Tokens missing are a legitimate "uncounted" reason on the stats page. Negative tokens are rejected uniformly with missing/non-finite (added in Phase 270 review-fix WR-03) to prevent negative USD costs from polluting `sum(cost_usd)` / `avg(cost_usd)` aggregations on the showcase dashboard. Zero remains legitimate (`tokensIn >= 0` accepted -> `cost: 0` for a zero-tokens call).

### Storage of pricing data
- **`mcp/data/mcp-pricing-data.json`** — single source-of-truth JSON file. Contains:
  - `pricing_source_date: "2026-05-14"`
  - `model_pricing: { "<model>": { input_per_mtok: 5.00, output_per_mtok: 25.00, confidence: "HIGH", source_url: "...", source_date: "...", notes?: "..." } }`
  - `client_default_model: { "<client>": { model: "...", confidence: "HIGH", source_url: "...", notes?: "..." } }`
- Both .ts and .js modules `require` / `import` the JSON. This avoids manual sync drift.

### Test strategy
- New `tests/mcp-pricing.test.js` covering:
  1. Every entry in `MCP_CLIENT_DEFAULT_MODEL` resolves to a real `MCP_MODEL_PRICING` row OR explicitly returns fallback `null`.
  2. Resolver `lookup` path: known (client, model) -> correct cost arithmetic.
  3. Resolver `fallback` path: known client, unknown model -> uses client's default model.
  4. Resolver `unknown` path: unknown client AND unknown model -> `{cost: null, source: 'unknown'}`.
  5. Resolver with `tokensIn=null` -> `cost: null`, `model_used` still resolved as far as it gets.
  6. `pricing_source_date` is `2026-05-14` on every result.
  7. Pricing data integrity: rates match STACK.md May 2026 board (spot-check 5 random rows against the doc).
  8. Confidence stamps: every row has `confidence ∈ {'HIGH', 'MEDIUM', 'LOW'}`.

### Claude's Discretion
- Exact JSON nesting style (flat dict vs nested groups by provider) -- recommend flat dict for simpler lookups.
- Whether to inline tested rates as constants in test file vs read from the JSON -- recommend "read from JSON" with one spot-check (rate of `claude-sonnet-4-6` is exactly `{input: 3.00, output: 15.00}`) as a structural anchor.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/ai/cost-tracker.js` -- existing AI-provider pricing module (`MODEL_PRICING` table + `estimateCost()` resolver). The new MCP pricing module mirrors its shape but is a SEPARATE table (no merging — MCP and AI-provider semantics differ on the fallback for unknown models).
- `mcp/src/tools/visual-session.ts:9-12` -- the canonical client label allowlist. The pricing module's `MCP_CLIENT_DEFAULT_MODEL` keys MUST match this list (otherwise typo drift). Phase 270 tests assert this with a runtime parity check.
- `extension/utils/install-identity.js` -- Phase 269's module pattern: function/prototype on `globalThis`. Mirror this.

### Established Patterns
- All FSB rate tables use USD per million tokens (per `cost-tracker.js`).
- Confidence column adds new value -- no FSB precedent for this; introduce now.
- Source-URL-in-comment per row is also new but a clean addition.

### Integration Points
- Phase 271 (next) will `require('./utils/mcp-pricing.js')` from `extension/ws/mcp-tool-dispatcher.js` and call `estimateMcpCost(...)` in the `try/finally` recorder hook.
- No `background.js` changes in Phase 270 -- this is a pure data + resolver module; only loaded by callers in Phase 271.
- No `package.json` test-chain insertion needed if the test file name pattern auto-discovers; verify against the existing test runner. If manual insertion needed, mirror Phase 269's `tests/install-identity.test.js` insertion right after it.

</code_context>

<specifics>
## Specific Ideas

- The Anthropic models `Claude Opus 4.7` etc. use a NEW TOKENIZER that consumes ~35% more tokens for the same input vs 4.6 — note this in the JSON `notes` field for Opus 4.7 row, so future analysis can adjust.
- Grok 4 retires 2026-05-15; the JSON entry stays but marked `deprecated: true` so the resolver can still cost-out historical telemetry.
- DeepSeek V4-Pro has a 75% promo through 2026-05-31 — note this in `notes` field; v0.9.70 refresh cycle should reverify.
- The pricing rate stored is the **non-batch, non-cache-hit standard list price** -- the FSB cost estimator records raw rate without batch/cache multipliers. Document this in the JSON file's top-level `pricing_policy` comment.

</specifics>

<deferred>
## Deferred Ideas

- Per-request surcharges (Anthropic web search $10/1k, Google grounding $35/1k) -- future telemetry enrichment.
- `actual_model` field on telemetry events for runtime model override -- deferred to v0.9.70.
- 90-day pricing-staleness CI gate -- deferred (TELEMETRY-FUTURE PRICING-REFRESH-CI).
- Auto-merge of `cost-tracker.js` MODEL_PRICING with MCP_MODEL_PRICING -- not done; semantics differ on fallback policy.
- Batch / cache-hit multipliers -- not modeled in v0.9.69; raw standard rate only.

</deferred>
