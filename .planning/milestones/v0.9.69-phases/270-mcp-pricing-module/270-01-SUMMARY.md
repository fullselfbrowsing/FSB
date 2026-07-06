---
phase: 270-mcp-pricing-module
plan: 01
subsystem: mcp-telemetry
tags: [mcp, telemetry, pricing, cost-estimation, infrastructure]
requires:
  - mcp/src/tools/visual-session.ts (Phase 270 reads MCP_VISUAL_CLIENT_LABELS for parity gate)
  - extension/utils/install-identity.js (Phase 269 pattern mirrored for the JS module surface)
provides:
  - globalThis.fsbMcpPricing.estimateMcpCost — synchronous cost resolver for Phase 271's MCPMetricsRecorder
  - MCP_MODEL_PRICING, MCP_CLIENT_DEFAULT_MODEL, PRICING_SOURCE_DATE — auditable rate tables + freshness stamp
  - tests/mcp-pricing-data-parity.test.js — CI gate preventing silent JSON drift
affects:
  - package.json (test chain gains 2 new entries between install-identity and transcript-store)
tech-stack:
  added: []
  patterns:
    - JSON source-of-truth + byte-exact mirror + CI parity gate (new for FSB; first use of this anti-drift pattern)
    - Function/prototype on globalThis with CommonJS fallback (reused from Phase 269 install-identity.js)
    - Module-load invariant check that throws at startup but resolver that never throws at runtime
key-files:
  created:
    - mcp/data/mcp-pricing-data.json
    - extension/utils/mcp-pricing-data.json
    - mcp/src/tools/pricing.ts
    - extension/utils/mcp-pricing.js
    - tests/mcp-pricing.test.js
    - tests/mcp-pricing-data-parity.test.js
  modified:
    - package.json (test chain insertion)
decisions:
  - "pricing_confidence='fallback' is a distinct sentinel string from the row's own HIGH/MEDIUM/LOW — so consumers can tell at a glance that the model was assumed rather than reported."
  - "Resolver NEVER throws — wrapped in try/catch, returns canonical {cost,source,model_used,pricing_confidence,pricing_source_date} envelope on every input (null/undefined/chaos)."
  - "Object.prototype.hasOwnProperty.call used for all lookups — prototype-pollution safe (__proto__, constructor, toString do NOT resolve)."
  - "JSON top-level keys: pricing_source_date, pricing_policy, model_pricing, client_default_model in that order. model_pricing keys alphabetical; client_default_model keys preserve visual-session.ts source order for human-audit readability."
  - "'OpenClaw 🦀' (U+1F980 crab grapheme) is byte-exact in both JSON files AND in visual-session.ts; Section 8 test asserts parity at runtime."
metrics:
  duration_minutes: 16
  completed: 2026-05-14T15:19:07Z
  commits: 3
  tasks: 3
  files_created: 6
  files_modified: 1
  test_assertions_added: 156
---

# Phase 270 Plan 01: MCP Pricing Module Summary

The canonical USD-per-MTok rate table, client default-model mapping, and graceful-fallback cost resolver for FSB v0.9.69 telemetry — ships as a JSON source-of-truth, a TypeScript module for the MCP server, a JavaScript mirror for the extension service-worker, and a 156-assertion test suite with a CI parity gate that fails the build the moment the two JSON copies diverge.

## What Shipped

### Files Created (6)

| File | Purpose | Lines |
|------|---------|-------|
| `mcp/data/mcp-pricing-data.json` | Single source-of-truth: 30 model rows + 13 client defaults, every row with `confidence`/`source_url`/`source_date` | 297 |
| `extension/utils/mcp-pricing-data.json` | Byte-exact copy bundled with the extension (md5 verified) | 297 |
| `mcp/src/tools/pricing.ts` | TS module exporting `PRICING_SOURCE_DATE`, `MCP_MODEL_PRICING`, `MCP_CLIENT_DEFAULT_MODEL`, `estimateMcpCost()`, `type McpPricingResult` | 269 |
| `extension/utils/mcp-pricing.js` | JS service-worker mirror (`globalThis.fsbMcpPricing` + CommonJS for tests) | 283 |
| `tests/mcp-pricing.test.js` | 8 sections / 156 assertions covering lookup, fallback, unknown, chaos sweep, missing tokens, source-date, data integrity, confidence stamps, visual-session parity | 467 |
| `tests/mcp-pricing-data-parity.test.js` | CI gate: byte-exact compare of the two JSON copies; emits unified-diff hint on divergence | 46 |

### Files Modified (1)

- `package.json` — inserted `node tests/mcp-pricing.test.js && node tests/mcp-pricing-data-parity.test.js` between `tests/install-identity.test.js` (Phase 269 anchor) and `tests/transcript-store.test.js`. No other test commands reordered.

### Commits (3)

- `b834320` — feat(270-01): JSON source-of-truth pricing data with 30 models + 13 client defaults
- `6b2b88d` — feat(270-01): TS + JS pricing modules sharing JSON data
- `87a33fb` — test(270-01): mcp-pricing unit tests + data-parity CI gate + npm test wiring

## Resolver Four-Path Contract

`estimateMcpCost({client, model?, tokensIn, tokensOut})` returns the canonical envelope on every input:

```
{
  cost: number | null,
  source: 'lookup' | 'fallback' | 'unknown',
  model_used: string | null,
  pricing_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'fallback' | null,
  pricing_source_date: '2026-05-14'
}
```

1. **lookup** — `model` is provided AND is a key in `MCP_MODEL_PRICING` → cost computed, source=`'lookup'`, `pricing_confidence` = the model row's HIGH/MEDIUM/LOW stamp.
2. **fallback** — `model` missing/unknown BUT `client` is in `MCP_CLIENT_DEFAULT_MODEL` AND its default model resolves → cost computed via default model, source=`'fallback'`, `pricing_confidence='fallback'` (literal sentinel, distinct from the model row's own confidence so consumers can tell the model was assumed rather than reported).
3. **unknown** — neither resolves → `{cost: null, source: 'unknown', model_used: null, pricing_confidence: null, pricing_source_date: '2026-05-14'}`. Never $0, never a default-model row.
4. **missing-tokens modifier** — `tokensIn`/`tokensOut` null/undefined/NaN/Infinity/non-number → `cost: null`, but `model_used` + `source` + `pricing_confidence` preserved as far as the lookup got (legitimate "uncounted" on the stats page).

Resolver NEVER throws — body wrapped in try/catch; chaos inputs (Symbol, function, Date, Object.create(null), prototype-polluted keys like `__proto__`/`constructor`/`toString`) all fall through to the canonical UNKNOWN envelope.

## Sentinel Decisions Worth Recording

- **`pricing_confidence='fallback'`** is a distinct string from the model row's own HIGH/MEDIUM/LOW stamps. Phase 271's metrics recorder and downstream analytics dashboards can tell at a glance that the cost was computed from an assumed model rather than a reported one.
- **`'OpenClaw 🦀'`** (with the U+1F980 crab grapheme) is byte-exact in `mcp/src/tools/visual-session.ts:11`, `mcp/data/mcp-pricing-data.json`, `extension/utils/mcp-pricing-data.json`, and the Section 8 parity test regex. Any future edit that misses one of these four locations will trip the parity gate or Section 8.
- **JSON-data CI parity gate** is a first-of-kind pattern in FSB: a byte-exact `diff` test that fails the build if the two JSON copies drift. Established here as a reusable anti-drift mechanism for future shared-data files.

## Refresh Policy Reminder

**STACK.md sections 1-2 must be re-verified on every milestone bump.** Bump `pricing_source_date` (both JSON files) and re-run the parity test on update.

Specific 2026-05-14 watchlist:

- **DeepSeek V4-Pro promo expires 2026-05-31** — current `input_per_mtok=0.435`, `output_per_mtok=0.87` are the 75% discount rates. The vNext milestone must reverify and likely raise these by 4×.
- **Grok 4 retires 2026-05-15** — row kept in the table marked with `notes: "DEPRECATED -- retiring 2026-05-15..."` so the resolver can still cost-out historical telemetry rows captured before retirement.
- **Gemini 3.1 Pro rates are assumed-parity with 2.5 Pro** (1.25/10.00) — `confidence: "MEDIUM"`. Pending the official Gemini 3.x pricing table. Reverify on the next refresh cycle.
- **Opus 4.7 tokenizer drift** — new tokenizer consumes ~35% more tokens than 4.6 for the same input. Per-token rate is unchanged but effective cost-per-request can rise ~35%. Notes field documents this.

## Phase 271 Hook-Up Note

`globalThis.fsbMcpPricing.estimateMcpCost` is the entry point for Phase 271's `extension/ws/mcp-tool-dispatcher.js` to call from inside the MCPMetricsRecorder's `try/finally` hook. The resolver is synchronous — Phase 271 calls it inline, no awaits needed.

The MV3 service-worker JSON load fires at module-init via `fetch(chrome.runtime.getURL('utils/mcp-pricing-data.json'))`; Phase 271 must `importScripts('utils/mcp-pricing.js')` AFTER Phase 269's `install-identity.js` and BEFORE the first dispatcher call, so the fetch has resolved before the recorder runs. If the resolver is called before data has loaded (defensive only), it returns the canonical UNKNOWN envelope.

## Out-of-Scope (Confirmed Untouched)

- `extension/ai/cost-tracker.js` — the AI-provider pricing table is a SEPARATE module with different fallback semantics (graceful-fallback to grok-4-1-fast-reasoning for AI calls; MCP uses null because we may genuinely not know the model for external MCP clients). Not modified.
- `background.js` — no `importScripts('utils/mcp-pricing.js')` call yet. Phase 271 will add that.
- `manifest.json` — no permissions changes; the bundled JSON ships under existing extension resources.
- `extension/ws/mcp-tool-dispatcher.js` — Phase 271 territory; this phase ships the standalone module only.

## Verification Summary

Phase-level verification (per plan):

| Check | Result |
|-------|--------|
| Both JSON files parse | PASS |
| Byte-exact parity (diff) | PASS |
| TS build (`npm --prefix mcp run build`) | PASS clean |
| Compiled TS surface (`require('./mcp/build/tools/pricing.js')`) | PASS |
| JS module under Node (`require('./extension/utils/mcp-pricing.js')`) | PASS — `cost=18, source=lookup` for the canonical anchor |
| `node tests/mcp-pricing.test.js` | PASS 156/156 |
| `node tests/mcp-pricing-data-parity.test.js` | PASS byte-exact |
| Adjacent test `install-identity.test.js` (Phase 269 anchor) | PASS (no regression) |
| Adjacent test `transcript-store.test.js` (next in chain) | PASS (no regression) |
| Audit: `grep -c source_url` in JSON | 43 (>=30 required) |
| Audit: `grep -c confidence` in JSON | 43 (=43 expected: 30 models + 13 clients) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion was case-sensitive but data is uppercase**

- **Found during:** Task 3 verification run
- **Issue:** `tests/mcp-pricing.test.js` Section 6 spot-check used `r1.notes.indexOf('tokenizer')` (lowercase), but the JSON notes field contains `"NEW TOKENIZER"` (uppercase per STACK.md verbatim). Caused 1 failed assertion out of 156.
- **Fix:** Changed to `r1.notes.toLowerCase().indexOf('tokenizer')` for case-insensitive match. The capitalization in the JSON notes is preserved verbatim from STACK §1a "Opus 4.7 uses a new tokenizer" intent — only the test predicate was loosened to tolerate either case.
- **Files modified:** `tests/mcp-pricing.test.js` (one line)
- **Commit:** rolled into `87a33fb` (Task 3) before the commit landed; not a separate commit.

**2. [Rule 3 - Blocking] mcp/node_modules was missing on first build attempt**

- **Found during:** Task 2 (TS build)
- **Issue:** `mcp/node_modules/` did not exist in the worktree; `tsc` was unavailable.
- **Fix:** Ran `cd mcp && npm install` once to fetch deps. This is a setup-time fix that does not change shipped code.
- **Files modified:** None shipped. `mcp/package-lock.json` was incidentally updated (lockfile said 0.8.0 while package.json said 0.9.0, npm fixed the drift). Reverted via `git checkout` so the Task 2 commit stayed scoped to the two pricing modules.
- **Commit:** No deviation commit; rollback kept tree clean before Task 2 commit.

### Architectural Changes Requested

None.

## Known Stubs

None. All resolver paths produce real values; the unknown path's `cost: null` / `source: 'unknown'` envelope is the documented contract for legitimately-uncounted telemetry rows, not a stub.

## Self-Check: PASSED

All claims verified:

```
=== files ===
FOUND: mcp/data/mcp-pricing-data.json
FOUND: extension/utils/mcp-pricing-data.json
FOUND: mcp/src/tools/pricing.ts
FOUND: extension/utils/mcp-pricing.js
FOUND: tests/mcp-pricing.test.js
FOUND: tests/mcp-pricing-data-parity.test.js
FOUND: .planning/phases/270-mcp-pricing-module/270-01-SUMMARY.md

=== package.json wiring ===
FOUND: mcp-pricing.test.js in npm test
FOUND: parity test in npm test

=== commits ===
FOUND: b834320 (Task 1 -- JSON source-of-truth)
FOUND: 6b2b88d (Task 2 -- TS + JS modules)
FOUND: 87a33fb (Task 3 -- tests + wiring)
```
