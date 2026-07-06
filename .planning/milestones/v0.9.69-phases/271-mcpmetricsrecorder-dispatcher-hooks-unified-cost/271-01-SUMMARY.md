---
phase: 271-mcpmetricsrecorder-dispatcher-hooks-unified-cost
plan: 01
subsystem: telemetry
tags: [telemetry, mcp, analytics, cost-tracking, pricing, privacy, v0.9.69]
requires:
  - extension/utils/mcp-pricing.js  # Phase 270 pricing resolver (now also wired into importScripts as part of reconciliation #3)
  - extension/utils/install-identity.js  # Phase 269 pattern mirrored
  - extension/utils/analytics.js  # existing AI-provider analytics surface (extended)
  - extension/background.js  # importScripts chain + duplicate BackgroundAnalytics
  - extension/ws/mcp-tool-dispatcher.js  # both chokepoints (lines 285-301 + 303-331)
provides:
  - globalThis.fsbMcpMetricsRecorder.recordDispatch  # single MCP fact-emission site
  - globalThis.fsbMcpMetricsRecorder.MCP_TOOL_TOKEN_HEURISTICS  # frozen const heuristic table
  - tests/mcp-metrics-recorder.test.js  # 8-section behaviour test (81 assertions)
  - tests/mcp-metrics-no-pii-leak.test.js  # static-grep CI gate against 9 banned identifiers
  - chrome.storage.local.fsbUsageData rows carrying source='mcp' discriminator
  - back-filled rows carrying source='ai-provider' on AI-provider-shaped legacy entries
affects:
  - existing Control Panel hero (Total Tokens / Total Cost / Total Requests) -- now auto-includes MCP contributions via camelCase aliases (NO new UI)
  - downstream Phase 272 TelemetryCollector (will consume rows from fsbUsageData)
tech-stack:
  added: []  # No new dependencies; pure JS function/prototype module pattern
  patterns:
    - "Function/prototype on globalThis (mirrors install-identity.js + mcp-pricing.js)"
    - "Dual-key row schema: canonical snake_case + camelCase aliases for hero back-compat"
    - "Single-chokepoint architecture: ONLY recordDispatch writes MCP rows"
    - "Two-layer defence: recorder try/catch + dispatcher try/catch around recorder call"
    - "Static-grep CI gate enforces privacy contract at build time"
    - "Test seam: _setStorageShim() for Node test isolation"
key-files:
  created:
    - extension/utils/mcp-metrics-recorder.js  # 375 lines
    - tests/mcp-metrics-recorder.test.js  # 456 lines
    - tests/mcp-metrics-no-pii-leak.test.js  # 91 lines
  modified:
    - extension/utils/analytics.js  # +44 lines (normalizeUsageSource + back-fill walk)
    - extension/background.js  # +43 lines (importScripts wiring + duplicate back-fill walk)
    - extension/ws/mcp-tool-dispatcher.js  # +89 lines (try/finally at both chokepoints)
    - package.json  # +1 line (test chain insertion)
decisions:
  - "MCP and AI-provider rows write to the SAME storage key (chrome.storage.local.fsbUsageData) discriminated by source field; hero merges automatically with NO new UI"
  - "Dual-key row schema (snake_case canonical + camelCase aliases) reconciles CONTEXT decision 5 with the existing hero's camelCase reads in getAllTimeStats"
  - "normalizeUsageSource extended to whitelist 'mcp' + 'ai-provider' alongside the legacy three (automation|memory|sitemap); the duplicate copy in background.js:~4365 updated identically"
  - "AI-provider back-fill walks ONLY rows with the AI-provider shape (model + inputTokens); persists once via saveData() so reload paths are idempotent"
  - "Recorder NEVER throws; dispatcher's try/finally adds defence-in-depth try/catch around the recorder call so metrics bugs cannot alter dispatcher contract"
  - "type_text/insert_text read ONLY .length never the string value -- documented in code + enforced by static-grep CI gate"
  - "Phase 270's mcp-pricing.js importScripts wiring was missing -- this plan repairs the gap (reconciliation #3) with a single line above the new recorder line"
metrics:
  duration: "~25min"
  tasks_completed: 3
  files_created: 3
  files_modified: 4
  lines_added: 1095
  lines_removed: 28
  tests_passing: "81 (recorder) + 1 (PII gate) + 303 (unaffected dispatcher) + 35 (Phase 269 install-identity) + 167 (Phase 270 pricing) + 1 (parity) = 588 assertions"
completed: 2026-05-14
---

# Phase 271 Plan 01: MCPMetricsRecorder + Dispatcher Hooks + Unified Cost Surfacing Summary

JS function/prototype module on `globalThis.fsbMcpMetricsRecorder` that records every MCP tool dispatch as a single row in `chrome.storage.local.fsbUsageData` (same key the Control Panel hero already reads), with both canonical snake_case keys for Phase 272 telemetry consumption AND camelCase aliases so the existing hero merges MCP contributions without a single UI change. Hooked from try/finally blocks at both dispatcher chokepoints (`dispatchMcpToolRoute` + `dispatchMcpMessageRoute`) and protected by a static-grep CI gate that fails the build if the recorder source contains any of 9 banned PII identifiers.

## Commits

| Hash      | Type | Description |
| --------- | ---- | ----------- |
| `cf8092d` | feat | add MCPMetricsRecorder + extend normalizeUsageSource + wire importScripts chain |
| `4075eb7` | feat | hook MCPMetricsRecorder into dispatcher chokepoints via try/finally |
| `586a91c` | test | add MCPMetricsRecorder behaviour test + PII grep gate + wire test chain |

## Tasks Completed

### Task 1: New module + normalizeUsageSource extension + importScripts wiring

**Files created:**
- `extension/utils/mcp-metrics-recorder.js` (375 lines)
  - `globalThis.fsbMcpMetricsRecorder.recordDispatch(input)` — async function; NEVER throws; full-body try/catch.
  - `MCP_TOOL_TOKEN_HEURISTICS` — frozen object mapping tool name to `{in, out, token_source}`. Covers: click family (7 tools), navigate family (6 tools), read family (4 tools), run_task, wait family (2 tools), scroll family (5 tools), sheet family (2 tools).
  - `_estimateTokensForTool(tool, requestPayload)` — pure synchronous helper; reads ONLY `payload.text.length` (never the string value) for type_text/insert_text special case.
  - `FSB_USAGE_DATA_KEY = 'fsbUsageData'` — explicitly the existing AI-provider storage key (CONTEXT decision 1).
  - Node `module.exports` mirror with `_setStorageShim(shim)` test seam.

**Files modified:**
- `extension/utils/analytics.js`
  - `normalizeUsageSource(source)` extended to whitelist `'mcp'` + `'ai-provider'` (reconciliation #1).
  - `loadStoredData()` performs one-time idempotent back-fill: AI-provider-shaped rows (model + inputTokens) lacking source get `source: 'ai-provider'`; legacy workflow-source rows untouched. Persists once via `saveData()` so second pass is no-op (decision 7).
- `extension/background.js`
  - Duplicate inline `BackgroundAnalytics.loadStoredData` (around line 4365) mirrors the same back-fill walk so the duplicate copy stays in sync.
  - importScripts chain wires `utils/mcp-pricing.js` AND `utils/mcp-metrics-recorder.js` immediately after `ws/mcp-tool-dispatcher.js` (line 33), before `automation-logger.js` (line 34) and `analytics.js` (line 35). The mcp-pricing line is a Phase-270 repair (reconciliation #3 — Phase 270 produced the module but never wired the importScripts).

### Task 2: Dispatcher try/finally hooks at BOTH chokepoints

**Files modified:**
- `extension/ws/mcp-tool-dispatcher.js`
  - `dispatchMcpToolRoute` (lines 285-301): `route.handler(...)` wrapped in try/finally; finally invokes `globalThis.fsbMcpMetricsRecorder.recordDispatch({client, tool, requestPayload, response, success, dispatcher_route: 'tool'})` inside its own try/catch defence layer. Early-return paths (`!route`, `route.handler !== 'function'`, ownership gate fail) intentionally do NOT record.
  - `dispatchMcpMessageRoute` (lines 303-331): same try/finally pattern wrapping BOTH terminal arms (`route.handler` path AND `client[route.helperName]` path). `dispatcher_route: 'message'`. Restricted-read short-circuit + `!route` early return do NOT record.
  - `success` boolean derives from `response.success === false` → `false`; thrown errors → `false` (initial value); else `true`. This matches CONTEXT decision 3: success AND failure paths both record; errors do NOT skip recording.

### Task 3: Behaviour tests + PII grep gate + package.json test chain

**Files created:**
- `tests/mcp-metrics-recorder.test.js` (456 lines, 81 assertions, 8 sections):
  - **Section 1:** recordDispatch with known tool — appends one row with both snake_case + camelCase keys, source='mcp'.
  - **Section 2:** Unknown tool — token_source='unknown', tokens_in=100, tokens_out=200.
  - **Section 3:** Failure case (success=false) — still records, row.success === false.
  - **Section 4:** 10 sequential awaited dispatches — exactly 10 rows (no double-write).
  - **Section 5:** Hero merge — 3 MCP + 2 AI-provider rows, heroSum() reads all 5; tokens + cost merge.
  - **Section 6:** AI-provider back-fill — first pass touches=true, second pass no-op; legacy workflow rows untouched; shapeless rows not back-filled.
  - **Section 7:** type_text scaling — 400 chars → 100 tokens, "hi" → floor 50, undefined → floor 50, null payload → floor 50; recorded row carries the scaled value.
  - **Section 8:** Pricing integration — Claude → claude-opus-4-7 fallback, cost_usd ≈ 0.001; unknown client → cost_usd=null + camelCase cost=0.
- `tests/mcp-metrics-no-pii-leak.test.js` (91 lines): static-grep CI gate. Strips line + block comments first; scans against 9 banned patterns: `prompt`, `url`, `href`, `innerHTML`, `outerHTML`, `clipboard`, `Cookie`, `Authorization`, `.value` (the last reads `.value` whole-token).

**Files modified:**
- `package.json` `scripts.test` chain: insert both new tests immediately after `mcp-pricing-data-parity.test.js`. Final substring: `mcp-pricing-data-parity.test.js && node tests/mcp-metrics-recorder.test.js && node tests/mcp-metrics-no-pii-leak.test.js && node tests/transcript-store.test.js`.

## Verification Results

### New tests
| Test | Result | Assertions |
| ---- | ------ | ---------- |
| `node tests/mcp-metrics-recorder.test.js` | PASS (exit 0) | 81 |
| `node tests/mcp-metrics-no-pii-leak.test.js` | PASS (exit 0) | 1 (gate) |

### Upstream regression sweep
| Test | Result | Assertions |
| ---- | ------ | ---------- |
| `node tests/mcp-tool-routing-contract.test.js` | PASS | 151 |
| `node tests/mcp-restricted-tab.test.js` | PASS | 74 |
| `node tests/mcp-recovery-messaging.test.js` | PASS | 63 |
| `node tests/mcp-in-flight-session-lookup.test.js` | PASS | 15 |
| `node tests/install-identity.test.js` (Phase 269) | PASS | 35 |
| `node tests/mcp-pricing.test.js` (Phase 270) | PASS | 167 |
| `node tests/mcp-pricing-data-parity.test.js` (Phase 270) | PASS | 1 |

**Total verified:** 588 assertions across new + regression sweep.

### importScripts chain ordering (extension/background.js)

```
33: try { importScripts('ws/mcp-tool-dispatcher.js'); } catch (e) { console.error('[FSB] Failed to load mcp-tool-dispatcher.js:', e.message); }
38: try { importScripts('utils/mcp-pricing.js'); } catch (e) { console.error('[FSB] Failed to load mcp-pricing.js:', e.message); }
42: try { importScripts('utils/mcp-metrics-recorder.js'); } catch (e) { console.error('[FSB] Failed to load mcp-metrics-recorder.js:', e.message); }
53: try { importScripts('ws/mcp-bridge-client.js'); } catch (e) { console.error('[FSB] Failed to load mcp-bridge-client.js:', e.message); }
```

Correct dependency order: dispatcher → pricing → metrics-recorder → bridge-client (the first place that fires MCP traffic via `armMcpBridge('service-worker-evaluated')`).

### Hero-merge invariant (inline plan verification)

```bash
node -e '... recordDispatch({client:"Claude", tool:"click", ...}); assert(row.source==="mcp", row.inputTokens===50, row.tokens_in===50, row.model==="claude-opus-4-7")'
# Output: hero merge invariant: PASS
```

## Deviations from Plan

None — the plan executed exactly as written. Two minor implementation notes worth surfacing:

1. **Reconciliations applied as specified:**
   - **Reconciliation #1:** `normalizeUsageSource` extended in BOTH `extension/utils/analytics.js` AND the duplicate at `extension/background.js:~4365`. Without this, every `loadStoredData()` cycle would clobber `source: 'mcp'` to `'automation'`.
   - **Reconciliation #2:** MCP rows write dual-key shape — snake_case canonical (`tokens_in`/`tokens_out`/`cost_usd`/`ts`) for Phase 272 telemetry consumption AND camelCase aliases (`inputTokens`/`outputTokens`/`cost`/`timestamp`) for existing hero compatibility. `cost_usd: null` (unknown pricing) maps to legacy `cost: 0` per D-10 so the hero sum stays correct without inventing a fake number.
   - **Reconciliation #3:** Phase 270's `mcp-pricing.js` importScripts wiring was a known gap — this plan repairs it with one line above the new recorder line. Confirmed via `grep mcp-pricing extension/background.js` returning the new wiring.
   - **Reconciliation #4:** No new UI added — hero numbers auto-update because MCP rows live in `fsbUsageData`, `getAllTimeStats` sums all rows, and the camelCase aliases ensure visibility.

2. **`response` parameter is accepted but unused by the row schema** (per plan decision 5). This is forward-compat for future heuristics; the static-grep gate confirms recorder source contains no references to `response.body` / `response.html` / etc.

## PII Privacy Compliance

The recorder source code, with comments stripped, contains **ZERO** matches for the 9 banned identifiers:
- `prompt`, `url`, `href`, `innerHTML`, `outerHTML`, `clipboard`, `Cookie`, `Authorization`, `.value`

The only field the recorder reads from `requestPayload` is `requestPayload.text.length` (an integer) for the `type_text`/`insert_text` heuristic — the literal string value is NEVER stored, forwarded, logged, or inspected. Documented in module top-of-file allowlist comment.

The static-grep gate enforces this contract at build time (`tests/mcp-metrics-no-pii-leak.test.js` runs in the npm test chain).

## Self-Check: PASSED

- File `extension/utils/mcp-metrics-recorder.js`: FOUND (375 lines)
- File `tests/mcp-metrics-recorder.test.js`: FOUND (456 lines)
- File `tests/mcp-metrics-no-pii-leak.test.js`: FOUND (91 lines)
- Commit `cf8092d`: FOUND on branch
- Commit `4075eb7`: FOUND on branch
- Commit `586a91c`: FOUND on branch
- importScripts chain wires mcp-pricing.js (line 38) AND mcp-metrics-recorder.js (line 42), both AFTER mcp-tool-dispatcher.js (line 33) and BEFORE mcp-bridge-client.js (line 53): FOUND
- package.json `scripts.test` chain ordering: `mcp-pricing-data-parity.test.js && node tests/mcp-metrics-recorder.test.js && node tests/mcp-metrics-no-pii-leak.test.js && node tests/transcript-store.test.js` — FOUND (verified via inline plan check)
- Both new tests exit 0 standalone: VERIFIED
- All 7 upstream regression-sweep tests exit 0: VERIFIED
