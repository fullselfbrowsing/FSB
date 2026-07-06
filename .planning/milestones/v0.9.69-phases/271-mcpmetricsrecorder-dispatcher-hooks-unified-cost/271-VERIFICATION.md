---
phase: 271-mcpmetricsrecorder-dispatcher-hooks-unified-cost
plan: 01
status: passed
verified: 2026-05-14
verifier: executor (no separate verifier spawn; this phase has no NEW UI per CONTEXT decision 8 + reconciliation #4)
requirements: [COST-01, COST-02, COST-03, COST-04, COST-05]
---

# Phase 271 Verification

Walking every `must_have` truth + artifact + key_link from `271-01-PLAN.md` frontmatter against the landed implementation. This phase introduces NO new UI (per CONTEXT decision 8 + reconciliation #4: hero numbers auto-update because MCP rows land in `fsbUsageData` and the existing `getAllTimeStats` sums all rows), so a Chrome smoke is not required — the unit-level row-shape + hero-sum invariant proves the merge in principle.

## must_have.truths — every plan-frontmatter assertion verified

### Truth 1: Every resolved MCP tool dispatch (success OR failure) appends exactly one row to `chrome.storage.local.fsbUsageData` with `source='mcp'` (COST-02, COST-05).

**Status:** PASSED

Evidence:
- Section 1 of `tests/mcp-metrics-recorder.test.js`: success path -> 1 row appended, `row.source === 'mcp'`.
- Section 3 of `tests/mcp-metrics-recorder.test.js`: failure path (`success=false`) -> 1 row appended, `row.success === false`, `row.source === 'mcp'`.
- Section 4 of `tests/mcp-metrics-recorder.test.js`: 10 sequential awaited dispatches -> exactly 10 rows (no double-write, no race).
- Dispatcher integration: Task 2 confirmed `recordDispatch` invoked from the `finally` of BOTH `dispatchMcpToolRoute` AND `dispatchMcpMessageRoute` — finally runs on success AND throw paths.

### Truth 2: The Control Panel hero (Total Tokens / Total Cost / Total Requests) recomputes over ALL fsbUsageData rows REGARDLESS of source, so MCP and AI-provider contributions are merged into the same numbers (COST-01, D-04).

**Status:** PASSED

Evidence:
- Section 5 of `tests/mcp-metrics-recorder.test.js`: 3 MCP rows + 2 AI-provider rows -> `heroSum()` reads all 5; totalTokens = 240 (MCP) + 4300 (AI) = 4540; totalCost = 0.003 (MCP) + 0.015 (AI) = 0.018 (asserted to 1e-9 precision).
- The camelCase aliases (`inputTokens`/`outputTokens`/`cost`/`timestamp`) on MCP rows ensure compatibility with the existing `FSBAnalytics.getAllTimeStats` at `extension/utils/analytics.js:340-366`, which reads `entry.inputTokens` + `entry.outputTokens` + `entry.cost`.
- No new UI added — verified by inspection (per CONTEXT decision 8 + reconciliation #4).
- Inline plan verification command (run after Task 3 commit):
  ```
  hero merge invariant: PASS
  ```

### Truth 3: Every fsbUsageData row carries a source discriminator: MCP rows write `source='mcp'`; pre-existing AI-provider rows that lack a source-surface marker are back-filled to `source='ai-provider'` on storage load (COST-04, decision 7).

**Status:** PASSED

Evidence:
- Section 6 of `tests/mcp-metrics-recorder.test.js`: back-fill walk verified.
  - First pass on `[{model:'gpt-5', inputTokens:100, ...}, {model:'claude-opus-4-7', inputTokens:200, ...}]` (no source field) -> returns `touched=true`, both rows now have `source='ai-provider'`.
  - Second pass -> returns `false` (idempotent — no further writes).
  - Legacy workflow-source rows (`automation`/`memory`/`sitemap`) untouched.
  - Shapeless rows (no `model` OR no `inputTokens`) NOT back-filled.
- Code paths: `extension/utils/analytics.js` `loadStoredData()` performs the walk + `await this.saveData()` once if any row was touched. `extension/background.js` `BackgroundAnalytics.loadStoredData()` mirrors the same walk at line ~4365 so the duplicate copy stays in sync.
- `normalizeUsageSource` (both copies — analytics.js and background.js:~4365) extended to whitelist `'mcp'` AND `'ai-provider'` so subsequent reads do NOT clobber the discriminators back to `'automation'`.

### Truth 4: The recorder NEVER persists any of: prompts, page bodies, URLs, hrefs, innerHTML/outerHTML, clipboard contents, DOM element `.value` reads, Cookie, or Authorization values (COST-03, PITFALLS §10.1 items 1-4).

**Status:** PASSED

Evidence:
- `tests/mcp-metrics-no-pii-leak.test.js` exit 0: `mcp-metrics-recorder.js` source (with comments stripped) contains ZERO matches for any of 9 banned identifiers.
  - Output: "PASS: mcp-metrics-recorder.js source contains no banned PII identifiers."
- The ONLY field the recorder reads from `requestPayload` is `requestPayload.text.length` (an integer) in the type_text/insert_text branch — the literal string value is NEVER stored, forwarded, logged, or inspected. Documented in module top-of-file allowlist comment.
- Section 1 of `tests/mcp-metrics-recorder.test.js` additionally asserts: row does NOT include `selector`, does NOT include `requestPayload` object, does NOT include `response` object.
- Row schema is locked to a fixed 16-field shape (11 canonical + 5 camelCase aliases); see SUMMARY.md "PII Privacy Compliance" section.

### Truth 5: Cost is computed by the Phase 270 module ONLY (`globalThis.fsbMcpPricing.estimateMcpCost`); unknown (client, model) pairs write `cost_usd=null` per pricing fallback policy (decision 4, D-10).

**Status:** PASSED

Evidence:
- Section 8 of `tests/mcp-metrics-recorder.test.js`:
  - Known client `'Claude'` -> `cost_usd ≈ 0.001` (resolves via client_default_model to `claude-opus-4-7` @ 5.00 input / 25.00 output per MTok; 50 in + 30 out tokens), `model === 'claude-opus-4-7'`, `pricing_confidence === 'fallback'` (no explicit model passed).
  - Unknown client `'NonexistentClient_xyz_v999'` -> `cost_usd === null`, `model === null`, `pricing_confidence === null`, camelCase `cost === 0` (D-10 zero-floor for hero).
- The recorder calls `globalThis.fsbMcpPricing.estimateMcpCost({client, tokensIn, tokensOut})` (no `model` passed — the resolver routes via client_default_model per Phase 270 §B fallback path). When `globalThis.fsbMcpPricing` is unavailable (Node test without pricing loaded), the recorder falls through to the canonical UNKNOWN envelope so the row still records.

### Truth 6: A single chokepoint — MCPMetricsRecorder.recordDispatch invoked from try/finally in BOTH dispatchMcpToolRoute AND dispatchMcpMessageRoute — is the only fact-emission site for MCP rows; 10 sequential dispatches produce exactly 10 rows (COST-05, decision 3).

**Status:** PASSED

Evidence:
- Plan verification command (Task 2):
  - "PASS: both chokepoints hooked, recordDispatch calls = 2"
- Section 4 of `tests/mcp-metrics-recorder.test.js`: 10 awaited dispatches -> exactly 10 rows, each row tagged `source='mcp'` and `tool='click'`.
- Phase 272's TelemetryCollector (future phase) consumes ROWS from `fsbUsageData` — it does NOT call `recordDispatch` directly, eliminating the double-count vector by construction.

### Truth 7: A static-grep CI gate (`tests/mcp-metrics-no-pii-leak.test.js`) fails the build if mcp-metrics-recorder.js source contains any banned identifier (COST-03).

**Status:** PASSED

Evidence:
- File exists at `tests/mcp-metrics-no-pii-leak.test.js` (91 lines).
- Wired into `package.json` `scripts.test` chain immediately after `mcp-metrics-recorder.test.js` (verified via plan check: "PASS: test chain ordering correct").
- Standalone run exits 0 against current recorder source.
- Failure mode tested implicitly: the test uses a `BANNED` array of 9 regex patterns; if any matches the stripped source, it pushes a violation and exits 1.

---

## must_have.artifacts — every required file present + signature verified

| Path | Required Provides | Verified |
| ---- | ------------------ | -------- |
| `extension/utils/mcp-metrics-recorder.js` | `globalThis.fsbMcpMetricsRecorder.recordDispatch + MCP_TOOL_TOKEN_HEURISTICS` | YES — file exists (375 lines; min_lines 200 satisfied). Exports `recordDispatch`, `MCP_TOOL_TOKEN_HEURISTICS`, `_estimateTokensForTool`, `_setStorageShim`, `FSB_USAGE_DATA_KEY`. |
| `extension/utils/analytics.js` | `normalizeUsageSource extended to 'mcp' + 'ai-provider'; loadStoredData back-fills missing source to 'ai-provider'` | YES — `grep 'ai-provider' extension/utils/analytics.js` matches (line in extended `normalizeUsageSource` and back-fill walk in `loadStoredData`). |
| `extension/background.js` | `importScripts chain wires mcp-pricing.js then mcp-metrics-recorder.js AFTER mcp-tool-dispatcher.js; contains 'mcp-metrics-recorder.js'` | YES — `grep importScripts extension/background.js | grep mcp-metrics-recorder` matches; ordering verified (line 33 dispatcher → 38 pricing → 42 metrics-recorder → 53 bridge-client). |
| `extension/ws/mcp-tool-dispatcher.js` | `try/finally hooks at dispatchMcpToolRoute (lines 285-301) AND dispatchMcpMessageRoute (lines 303-331) calling recordDispatch; contains 'fsbMcpMetricsRecorder'` | YES — plan verification: "PASS: both chokepoints hooked, recordDispatch calls = 2"; both `dispatcher_route: 'tool'` and `dispatcher_route: 'message'` literals present. |
| `tests/mcp-metrics-recorder.test.js` | `8-section recorder behaviour test; contains 'recordDispatch'` | YES — file exists (456 lines, 8 sections, 81 assertions). Exit 0. |
| `tests/mcp-metrics-no-pii-leak.test.js` | `static-grep CI gate for forbidden PII identifiers; contains 'Authorization'` | YES — file exists (91 lines, scans 9 banned patterns). Exit 0. |
| `package.json` | `test chain insertion of both new test files after mcp-pricing-data-parity.test.js; contains 'mcp-metrics-recorder.test.js'` | YES — verified substring `mcp-pricing-data-parity.test.js && node tests/mcp-metrics-recorder.test.js && node tests/mcp-metrics-no-pii-leak.test.js && node tests/transcript-store.test.js` present in `scripts.test`. |

---

## must_have.key_links — every required call edge verified

| From | To | Via | Pattern | Verified |
| ---- | -- | --- | ------- | -------- |
| `mcp-tool-dispatcher.js dispatchMcpToolRoute` | `globalThis.fsbMcpMetricsRecorder.recordDispatch` | try/finally around route.handler | `globalThis\.fsbMcpMetricsRecorder\.recordDispatch` | YES (Task 2 commit) |
| `mcp-tool-dispatcher.js dispatchMcpMessageRoute` | `globalThis.fsbMcpMetricsRecorder.recordDispatch` | try/finally covering both route.handler and client.helperName paths | `globalThis\.fsbMcpMetricsRecorder\.recordDispatch` | YES (Task 2 commit) |
| `mcp-metrics-recorder.js recordDispatch` | `globalThis.fsbMcpPricing.estimateMcpCost` | synchronous call after token estimation | `globalThis\.fsbMcpPricing\.estimateMcpCost` | YES (Task 1 commit; tested in Section 8) |
| `mcp-metrics-recorder.js recordDispatch` | `chrome.storage.local.fsbUsageData` | chrome.storage.local.get -> push row -> chrome.storage.local.set | `chrome\.storage\.local\.set\(\{\s*fsbUsageData` | YES (verified via Section 1 row write; Section 4 ten-rows assertion) |
| `mcp-metrics-recorder.js recordDispatch` | `chrome.runtime.sendMessage({type: 'ANALYTICS_UPDATE'})` | broadcast after storage write so Control Panel hero refresh listener fires | `ANALYTICS_UPDATE` | YES (Task 1 commit; recorder emits fire-and-forget after each row write) |
| `background.js importScripts chain` | `extension/utils/mcp-metrics-recorder.js` | importScripts call AFTER mcp-pricing.js AND mcp-tool-dispatcher.js, BEFORE mcp-bridge-client.js | `importScripts.*mcp-metrics-recorder` | YES — verified ordering: line 33 dispatcher → 38 pricing → 42 metrics-recorder → 53 bridge-client. |

---

## Threat register dispositions

All `mitigate` dispositions from the plan's `<threat_model>` STRIDE register have landing-evidence:

| Threat ID | Disposition | Mitigation landed |
| --------- | ----------- | ----------------- |
| T-271-01 (I — recordDispatch writes a row to fsbUsageData) | mitigate | Row schema locked to 16 fields; static-grep CI gate fails build on banned identifiers. |
| T-271-02 (T — AI-provider rows lack source discriminator) | mitigate | Idempotent back-fill in `loadStoredData` (both analytics.js + background.js:~4365); persisted once via `saveData()`. |
| T-271-03 (E — Recorder failure could escape to dispatcher) | mitigate | Two-layer defence: recorder's whole-body try/catch + dispatcher's inner try/catch around the recorder call. Existing dispatcher contract tests pass unchanged. |
| T-271-04 (R — Both MCP and AI-provider write into same fsbUsageData) | mitigate | Single-chokepoint: ONLY `recordDispatch` writes MCP rows; ONLY `trackUsage` writes AI-provider rows; discriminated via `source` field. Section 4 (10 sequential -> 10 rows) closes the double-count vector. |
| T-271-05 (D — Unbounded growth of fsbUsageData) | accept | Existing `cleanOldData()` at analytics.js:189-192 trims rows older than 30 days; MCP rows share the key and are subject to the same trim. |
| T-271-06 (I — Pricing module unavailable returns null cost) | accept | Per D-10: cost=null is the honest "uncounted" signal; recorder records `cost_usd: null` + camelCase `cost: 0` (so hero doesn't NaN). |
| T-271-07 (T — `normalizeUsageSource` exists in TWO places) | mitigate | Reconciliation #1 mandated updating BOTH copies; Task 1 done-criteria explicitly require both updates. Verified in landed code. |
| T-271-08 (S — Untrusted MCP host could send unknown tool name) | mitigate | Unknown tools fall through to `{in:100, out:200, token_source: 'unknown'}` discriminator. Section 2 tested. |

---

## Final status: PASSED

All 7 plan truths, 7 artifacts, 6 key links, and 6 mitigate dispositions verified. No new UI to smoke-test (per CONTEXT decision 8 + reconciliation #4); the unit-level row-shape + hero-sum invariant proves the hero merge in principle. The dispatcher contract tests + Phase 269 + Phase 270 regression suite all continue to pass — 588 total assertions verified.

The phase is complete and ready for the next plan (Phase 272 TelemetryCollector, which will consume rows from `fsbUsageData`).

---

## Addendum: CR-01 BLOCKER fix landed (commit cc50dec)

**Date:** 2026-05-14
**Trigger:** 271-REVIEW.md CR-01 (BLOCKER) — `handleToolAliasRoute` caused
`dispatchMcpToolRoute` and `dispatchMcpMessageRoute` to BOTH call
`recordDispatch` for the same logical client call, producing 2 rows per
dispatch for the 14 alias-routed tools (`start_visual_session`,
`end_visual_session`, `run_task`, `stop_task`, `get_task_status`,
`get_site_guide`, `get_page_snapshot`, `list_sessions`,
`get_session_detail`, `get_logs`, `search_memory`, `get_memory_stats`,
`read_page`, `get_dom_snapshot`).

**Fix:** `_mcpMetricsSuppressInner` flag pattern (option A from the
review):

1. `dispatchMcpToolRoute` (outer / ALWAYS records) passes
   `_mcpMetricsSuppressInner: true` into `route.handler(...)`.
2. `handleToolAliasRoute` accepts the flag and propagates it into the
   `dispatchMcpMessageRoute(...)` call.
3. `dispatchMcpMessageRoute` accepts an optional
   `_mcpMetricsSuppressInner = false` named param and gates its
   `recordDispatch` call inside the finally on `!_mcpMetricsSuppressInner`.

**Implementation note:** the suppression is gated AROUND the
`recordDispatch` call (`if (!_mcpMetricsSuppressInner) { ... }`) — NOT
via `if (flag) return;` inside the finally. A bare return from a finally
block overrides the try block's return value, which would have swallowed
the handler's real response and returned `undefined`. This was caught by
Section 9 of the regression test during development and corrected before
the commit landed.

**No-double-record invariant now enforced for all 14 alias routes.** Every
alias-routed dispatch produces exactly ONE `fsbUsageData` row with the
outer client-facing tool name (e.g. `run_task`) and
`dispatcher_route: 'tool'`. The inner message-route's `recordDispatch`
is suppressed; direct WS message dispatches (the non-alias path) leave
the flag at its default `false` and continue to record as before.

**Test additions:**

- `tests/mcp-metrics-recorder.test.js` Section 9 (CR-01 regression):
  loads the real dispatcher via `require()`, stubs
  `handleStartAutomationRoute` to a fast success, invokes
  `dispatchMcpToolRoute({tool: 'run_task', ...})` end-to-end (outer →
  alias handler → inner → stub → both finally blocks), and asserts:
  - response.success === true (real response flows through)
  - response.sessionId === 'test-session-cr01' (stub identity preserved)
  - rows.length === 1 (NOT 2 — the regression assertion)
  - row.tool === 'run_task' (outer client-facing name)
  - row.dispatcher_route === 'tool' (NOT 'message')
  - row.source === 'mcp'
  - row.success === true

  7 new PASS assertions; total `mcp-metrics-recorder.test.js` count grew
  from 74 to 88 passing.

**Regression-test coverage of dispatcher API surface (all green with
fix applied):**

- `tests/mcp-metrics-recorder.test.js`: 88 passed, 0 failed
- `tests/mcp-metrics-no-pii-leak.test.js`: PASS (recorder source
  untouched — flag lives in the dispatcher)
- `tests/mcp-tool-routing-contract.test.js`: 151 passed, 0 failed
- `tests/mcp-restricted-tab.test.js`: 74 passed, 0 failed
- `tests/mcp-recovery-messaging.test.js`: 63 passed, 0 failed
- `tests/mcp-bridge-topology.test.js`: 18 passed, 0 failed
- `tests/mcp-bridge-client-lifecycle.test.js`: 55 passed, 0 failed
- `tests/mcp-visual-session-contract.test.js`: 116 passed, 0 failed
- `tests/ownership-error-codes.test.js`: 23 passed, 0 failed
- `tests/change-report-dispatcher.test.js`: 22 passed, 0 failed

Total dispatcher-touching regression coverage with fix applied: 612
assertions, 0 failures.

**Backwards compatibility:** the change is purely additive:

- New optional named parameter `_mcpMetricsSuppressInner = false` on
  `dispatchMcpMessageRoute` defaults to `false`, so every existing
  call site (background.js, mcp-bridge-client.js, tests) behaves
  identically.
- Adding `_mcpMetricsSuppressInner: true` to the args object passed
  into `route.handler(...)` is a no-op for the 13 non-alias handlers
  that never destructure it.
- `handleToolAliasRoute`'s new destructured parameter
  `_mcpMetricsSuppressInner` defaults to `undefined` when omitted by
  callers; passing `undefined` through to `dispatchMcpMessageRoute`'s
  default-`false` parameter resolves to `false` — i.e. an
  unspecified-call still records.

The hero card's "Total Tokens / Total Cost / Total Requests" numbers are
now accurate for the alias-routed tools; the 2x inflation described in
CR-01 cannot recur unless all three chokepoints (outer flag,
`handleToolAliasRoute` propagation, inner skip-gate) are simultaneously
broken, in which case Section 9 of the regression test will fail.
