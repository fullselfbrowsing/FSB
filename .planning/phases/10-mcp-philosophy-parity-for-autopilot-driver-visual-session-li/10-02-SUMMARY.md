---
phase: 10-mcp-philosophy-parity-for-autopilot-driver-visual-session-li
plan: 02
subsystem: telemetry
tags: [metrics-recorder, drivingModel, dispatcher-route, agent-loop, autopilot, mcp-philosophy, FINT-17, FINT-18]

requires:
  - phase: 10-mcp-philosophy-parity-for-autopilot-driver-visual-session-li
    plan: 01
    provides: MCP_VISUAL_CLIENT_LABELS allowlist entry + nextEntry driver field + recordVisualSessionTick autopilot call site + Wave 0 smoke scaffold
  - phase: 08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-
    provides: Phase 8 emission-site precedent + session.providerConfig source-of-truth (agent-loop lines 1191-1196)
provides:
  - mcp-metrics-recorder.js route allowlist extended 'tool' | 'message' | 'autopilot' (FINT-17 D-04)
  - mcp-metrics-recorder.js row schema NEW optional top-level drivingModel pass-through field (FINT-18 D-04)
  - agent-loop.js autopilot recordDispatch call site immediately after toolResults.push and before // ADOPT-04 (FINT-17 D-03)
  - agent-loop.js driving-model identity capture from session.providerConfig + xAI reasoning_tokens edge case from response.usage.completion_tokens_details (FINT-18 D-04)
  - tests/mcp-philosophy-parity-smoke.test.js Parts 5-8 filled (16 new real assertions; 30 PASS total)
affects: [10-03-documentation-ceremony]

tech-stack:
  added: []
  patterns:
    - Fire-and-forget defensive-guard call site adjacent to Plan 10-01 visual-session tick + Phase 8 step.transition emission (consistent FINT-11/16/17 pattern)
    - Pass-through optional field (drivingModel) coerced to undefined on absence so MCP-side rows stay regression-free
    - Conditional xAI reasoning_tokens extraction preserving 0 vs undefined semantics (D-04 strict reading; non-xAI providers unconditionally undefined)
    - Synonym discipline maintained -- comments use "deferred-iterator schedule" instead of literal token (Phase 8 / Plan 10-01 precedent honored)

key-files:
  created: []
  modified:
    - extension/utils/mcp-metrics-recorder.js
    - extension/ai/agent-loop.js
    - tests/mcp-philosophy-parity-smoke.test.js

key-decisions:
  - "D-03 honored: recordDispatch call inserted IMMEDIATELY AFTER toolResults.push and IMMEDIATELY BEFORE // ADOPT-04 comment at the main tool-execution path (line 2381 anchor); local-tool-interception path at line 2021 intentionally NOT instrumented (denied/skipped tools are not real autopilot dispatches)"
  - "D-04 honored: drivingModel { provider, model_id, reasoning_tokens } sourced from session.providerConfig.providerKey + session.providerConfig.model; xAI reasoning_tokens extracted from response.usage.completion_tokens_details.reasoning_tokens when providerKey === 'xai'; non-xAI unconditionally undefined per strict D-04 reading"
  - "D-07 honored: INV-04 BYTE-FROZEN (setTimeout count = 8, iterator pattern count = 4, awk-scan empty for recordDispatch AND recordVisualSessionTick); INV-06 BYTE-FROZEN (Lattice SHA e95067bfa87ed1b75838fc3b3ef217a3b01acbd3, zero Lattice-side commits)"
  - "Pitfall 3 honored: pre-edit awk-scan VERIFIED var response declaration at line 1752 (in scope through tool-dispatch loop body) BEFORE insertion at line 2381"
  - "Pitfall 4 honored: strict D-04 reading on xAI-only reasoning_tokens path; OpenAI o1 extension deferred to v0.11.0+ as forward-compat"
  - "Pitfall 1 honored: zero literal 'setTimeout' token in any new comment; 'deferred-iterator schedule' synonym used"
  - "Recorder pass-through choice: input.drivingModel is forwarded verbatim when truthy + typeof === 'object' (matches D-04 'minimal pass-through' direction; field-by-field copy intentionally avoided)"

patterns-established:
  - "Per-tool-call recordDispatch cadence with attribution sourced from session.providerConfig (supports mid-session provider switches at agent-loop lines 1180-1186)"
  - "xAI-specific raw-response usage quirk preserved as opaque pass-through from executeViaBridge per FINT-08 / LSDK-16 contract"
  - "Smoke-fill expansion pattern: Parts 5-8 fill 16 new PASS assertions while preserving Parts 1-4 baseline (Plan 10-01) and Parts 9-10 placeholders (Plan 10-03)"

requirements-completed:
  - FINT-17
  - FINT-18

duration: 12min
completed: 2026-05-31
---

# Phase 10 Plan 10-02: Metrics Recorder Integration + Driving-Model Attribution Summary

**Recorder route allowlist extended to accept 'autopilot' + new top-level drivingModel pass-through row field + autopilot recordDispatch call site landed at agent-loop.js post-toolResults.push boundary with provider/model + xAI reasoning_tokens attribution, smoke at 30 PASS / 0 FAIL (16 new real assertions covering recorder schema + dispatcher_route + reasoning_tokens edge cases + MCP non-regression).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-31 (this execution)
- **Completed:** 2026-05-31
- **Tasks:** 3 / 3
- **Files modified:** 3
- **Commits:** 3 task commits + 1 metadata commit pending

## Accomplishments

- `mcp-metrics-recorder.js` route allowlist at lines 275-281 now accepts `'autopilot'` as a third valid literal in addition to `'tool'` and `'message'`. Unknown routes still coerce `routeLabel` to `null` (allowlist gate intact); verified by smoke Part 6.2.
- `mcp-metrics-recorder.js` row schema at lines 339-349 carries a NEW optional top-level `drivingModel` field. Coerced to `undefined` when `input.drivingModel` is absent or non-object so MCP rows stay clean; verified by smoke Part 8.
- `agent-loop.js` autopilot iteration body invokes `globalThis.fsbMcpMetricsRecorder.recordDispatch({ client: 'FSB Autopilot', tool: call.name, requestPayload: call.args, success: result.success, dispatcher_route: 'autopilot', drivingModel: { provider, model_id, reasoning_tokens } })` immediately after `toolResults.push` (line 2381) and immediately before the `// ADOPT-04` comment.
- Driving-model identity sourced from `session.providerConfig.providerKey` + `session.providerConfig.model` (D-04). xAI `reasoning_tokens` extracted from `response.usage.completion_tokens_details.reasoning_tokens` when `providerKey === 'xai'`; `undefined` for non-xAI providers. `0` preserved as `0` (not coerced to `undefined`) per RESEARCH Section 7.
- `tests/mcp-philosophy-parity-smoke.test.js` Parts 5-8 filled with 16 new real assertions (was 6 placeholder, now 16 real). Smoke total: **30 PASS / 0 FAIL** (was 20 PASS). Parts 1-4 from Plan 10-01 preserved at 14 PASS. Parts 9-10 placeholders preserved for Plan 10-03.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend recorder route allowlist + drivingModel row field** -- `eaacd4ba` (feat)
2. **Task 2: Insert recordDispatch call at agent-loop.js post-toolResults.push** -- `225cfa55` (feat)
3. **Task 3: Fill smoke Parts 5-8** -- `8eaec031` (test)

## Files Created/Modified

- `extension/utils/mcp-metrics-recorder.js` -- Route allowlist extended (3-line check became 5 lines including FINT-17 comment marker); new `drivingModel` field with pass-through + undefined coercion added in the canonical snake_case row block between `dispatcher_route: routeLabel,` and `// Legacy camelCase aliases`. (+14 / -3)
- `extension/ai/agent-loop.js` -- New 37-line autopilot `recordDispatch` block inserted between `toolResults.push(...)` (line 2381) and the `// ADOPT-04` comment (line ~2420 post-insert). Defensive guard on `globalThis.fsbMcpMetricsRecorder.recordDispatch` + try/catch fire-and-forget. (+37 / -0)
- `tests/mcp-philosophy-parity-smoke.test.js` -- Recorder module loaded via CommonJS surface (3 new lines at module-load section); Parts 5-8 filled with 16 real assertions replacing 4 placeholder PASS lines; Parts 9-10 placeholders preserved. (+145 / -6)

## Decisions Made

- **Insertion site at line 2381 (main tool-execution path), not 2021 (local-tool-interception path):** The plan referenced line 2279 pre-Plan-10-01 → ~2297 post-10-01. Actual post-10-01 file has two `toolResults.push` sites: line 2021 (permission-denied early exit) and line 2381 (canonical post-execution). The line 2381 anchor is the canonical autopilot dispatch boundary; the line 2021 site is the denial path and intentionally NOT instrumented (denied/skipped tools don't have a real execution outcome to attribute).
- **Recorder loaded via CommonJS surface in smoke:** The recorder exposes both `globalThis.fsbMcpMetricsRecorder` AND a `module.exports` surface. Smoke uses `require()` (matching Plan 10-01's visual-session + lifecycle module-load pattern); both surfaces share the same `recordDispatch` function reference so global-registration is implicitly tested.
- **`fsbMcpPricing` left unmocked in smoke:** The recorder gracefully falls through to `_unknownPricingEnvelope()` when `globalThis.fsbMcpPricing` is absent. Smoke does not mock pricing — recorder writes the row with `model: null, cost_usd: null, pricing_confidence: 'unknown'`. The drivingModel field is independent of pricing resolution; the test surface stays focused on Phase 10 deltas.
- **Storage flatten helper kept defensive:** The recorder writes `fsbUsageData` as a flat array under the key (no wrapper). Smoke's `_latestRow()` helper tolerates both array-direct AND `{rows: [...]}` wrapper shapes per the plan's Part 5 compatibility note, future-proofing against recorder schema evolution.

## Deviations from Plan

None - plan executed exactly as written. The line-number variance (2279 → 2381) was anticipated by the plan ("expected ~2297 post-10-01"; actual is +84 because Plan 10-01's recordVisualSessionTick block + earlier file growth pushed the anchor down further). Behavior matches plan intent verbatim — same text-anchored insertion point relative to `toolResults.push` and `// ADOPT-04`.

## Verification Outputs

### Pre-edit awk-scan (Pitfall 3 — RESEARCH Section 7)

```
awk 'NR>=1100 && NR<=2400 && /^[[:space:]]*var response/ {print NR, $0}' extension/ai/agent-loop.js
1752     var response;
```

`var response` declared at line 1752 (outer scope of `runAgentIteration`); in scope through the tool-dispatch loop body at line 2381. Confirmed before insertion.

### INV-04 byte-freeze (post-task)

```
grep -c "setTimeout" extension/ai/agent-loop.js
8

grep -c "session\._nextIterationTimer = setTimeout" extension/ai/agent-loop.js
4

awk '/setTimeout\(function/,/}, [0-9]+\)/ { if ($0 ~ /recordDispatch/) print NR }' extension/ai/agent-loop.js
(empty)

awk '/setTimeout\(function/,/}, [0-9]+\)/ { if ($0 ~ /recordVisualSessionTick/) print NR }' extension/ai/agent-loop.js
(empty)
```

### INV-06 byte-freeze (post-task)

```
cd lattice && git rev-parse HEAD
e95067bfa87ed1b75838fc3b3ef217a3b01acbd3

git status --porcelain lattice/
(empty)
```

### Test outputs

```
node tests/mcp-philosophy-parity-smoke.test.js
30 PASS / 0 FAIL

node tests/lattice-step-emitter-smoke.test.js
38 PASS / 0 FAIL  (Phase 8 sibling unchanged)

npm test
exit 0  (full chain green; verified via tail of full output)

npm run build
[esbuild] done  (3 entries built clean post-Task-1)
```

### Recorder schema deltas (verification commands per plan)

```
grep -c "input.dispatcher_route === 'autopilot'" extension/utils/mcp-metrics-recorder.js
1

grep -c "drivingModel:" extension/utils/mcp-metrics-recorder.js
1
```

## Issues Encountered

- None. All three tasks executed cleanly. Pre-edit awk-scan confirmed `var response` scope before insertion (Pitfall 3 avoided). INV-04 byte-freeze + INV-06 byte-freeze both held throughout.

## Carryforward for Plan 10-03

- Fill Parts 9-10 of `tests/mcp-philosophy-parity-smoke.test.js`:
  - Part 9: INV-04 + INV-06 byte-freeze regression assertions (grep counts on agent-loop.js + Lattice SHA verification)
  - Part 10: Provider switch precedence — mid-session `session.providerConfig` refresh at agent-loop.js:1180-1186 propagates to next `recordDispatch` call's `drivingModel.provider` + `drivingModel.model_id`
- Documentation ceremony:
  - REQUIREMENTS.md FINT-16/17/18 narrative + INV-02 wording promotion ("DEFINITIONS parity" -> "DEFINITIONS + LIFECYCLE + TELEMETRY + DRIVING-MODEL ATTRIBUTION parity")
  - LATTICE-PIN.md Phase 10 row append (SHA unchanged `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`)
  - v0.10.0-MILESTONE-AUDIT.md MCP-philosophy parity row closure

## Next Phase Readiness

- Plan 10-02 outputs are stable for downstream consumption by Plan 10-03 (documentation ceremony).
- Recorder + agent-loop integration is fully wired; autopilot tool calls now produce one `fsbUsageData` row per dispatch with provider + model + (xAI-only) reasoning_tokens attribution.
- INV-04 + INV-06 byte-freeze posture is unchanged; Plan 10-03 inherits the byte-frozen baseline.
- Smoke harness at 30 PASS / 0 FAIL with stable mock contracts; Plan 10-03 adds 4 more real assertions to land 34+ PASS at phase close.

## Self-Check

Verifying claims:

- File `extension/utils/mcp-metrics-recorder.js`: FOUND (modified, route allowlist + drivingModel field)
- File `extension/ai/agent-loop.js`: FOUND (modified, recordDispatch call at post-toolResults.push)
- File `tests/mcp-philosophy-parity-smoke.test.js`: FOUND (modified, Parts 5-8 filled)
- Commit `eaacd4ba` (Task 1): FOUND
- Commit `225cfa55` (Task 2): FOUND
- Commit `8eaec031` (Task 3): FOUND
- INV-06 Lattice SHA: e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 (frozen)
- INV-04 setTimeout count: 8 (frozen)
- Smoke total: 30 PASS / 0 FAIL

## Self-Check: PASSED

---
*Phase: 10-mcp-philosophy-parity-for-autopilot-driver-visual-session-li*
*Plan: 10-02*
*Completed: 2026-05-31*
