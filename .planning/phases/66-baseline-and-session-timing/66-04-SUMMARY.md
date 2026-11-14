---
phase: 66-baseline-and-session-timing
plan: 04
subsystem: observability
tags: [autopilot, per-iteration-timing, provider-cost, xai, cost-tracker, automation-logger, source-pins, d-02]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: start-commit baseline and the W11 regression sweep with 66-02-SWEEP-BASELINE.json
  - phase: 66-baseline-and-session-timing (plan 03)
    provides: legacy MCP actionHistory rows carrying a v1 timing and durationMs, handed to automationLogger.saveSession
provides:
  - "D-11 Grok rows: grok-4.3 / grok-4.3-latest / grok-build-0.1 first in MODEL_PRICING; retired slugs at $1.25/$2.50, grok-code-fast-1 at $1.00/$2.00"
  - "LEGACY_UNKNOWN_MODEL_PRICING (frozen 0.20/0.50) decoupled from the Grok rows; resolvePricingKey (own keys only)"
  - "readProviderUsage: provider-first usage and cost (xAI cost_in_usd_ticks / 1e10, OpenRouter usage.cost), null when unmeasured"
  - "estimateCostDetailed: labelled estimate; unknown model or missing usage -> 'unavailable'; reasoning billed at the output rate for xai and gemini"
  - "buildIterationTimingRow / appendIterationTiming / addIterationToolTime: the v1 session.iterationTiming rows (last 100) and session.measurementSummary"
  - "agent-loop.js: model time per iteration (modelRetried on the image retry), tool time from permission check to success push, actionHistory[].durationMs on executed calls only"
  - "createActionEvent durationMs defaults to null"
  - "automation-logger.js: iterationTiming, measurementSummary, durationMs and legacy MCP timing persisted in both save branches; save-time totalCostBasis on the record and its index entry (I-2); timing lines in the autopilot text export"
  - "tests/fixtures/bench/xai-chat-completion.json: synthetic xAI body with cost ticks, reasoning and cached input"
affects: [66-06, 66-08, benchmark autopilot arm, get_session_detail measurement projection, list_sessions totalCostBasis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider-reported numbers first, price table second, and every value carries a source label (provider / estimate / mixed / unavailable)"
    - "Inline agent-loop stamps call pure cost-tracker helpers through _al_ resolvers with null fallbacks, so a missing helper skips measurement instead of inventing a 0"
    - "Measurement blocks sit in try/catch (/* measurement is diagnostic-only */) and never gate what the loop decides or executes"
    - "Save-time basis labels: computed once when the record is written and copied to the lean index entry"

key-files:
  created:
    - tests/fixtures/bench/xai-chat-completion.json
  modified:
    - extension/ai/cost-tracker.js
    - extension/ai/agent-loop.js
    - extension/ai/action-history.js
    - extension/utils/automation-logger.js
    - tests/cost-tracker.test.js
    - tests/cost-tracker-ordering.test.js
    - tests/action-history.test.js
    - tests/automation-logger-mcp-retention.test.js

key-decisions:
  - "The legacy estimateCost keeps its 0.20/0.50 unknown-model rate through a frozen constant, so legacy totals for unknown models do not move; only estimateCostDetailed (the measurement path) reports them as unavailable"
  - "resolvePricingKey matches own keys only: prototype names ('constructor', '__proto__') and non-string models now fall back instead of yielding NaN or throwing"
  - "Executed-tool time that comes out negative (wall clock stepped back) is recorded as null, never a negative number or a clamped 0"
  - "The logger persists durationMs only when finite and non-negative, and keeps an MCP timing only when it passes the v1 contract, with fsbMs recomputed"
  - "Text-export timing lines print a unit only beside a measured number ('model 2001 ms'), and a word for a missing value ('model n/a', 'tools none')"
  - "Each task committed once, tests with source: every touched suite is in the npm test chain and must stay green in every commit; RED was run and recorded before each implementation"

patterns-established:
  - "Plan 66-06 reads session.iterationTiming / session.measurementSummary / actionHistory[].durationMs exactly as the v1 contract in 66-04-PLAN.md <interfaces> describes, and uses the stored totalCostBasis when it is 'estimate' or 'unavailable'"
  - "New cost-tracker helpers become service-worker globals through importScripts; agent-loop resolves them with the typeof-global-else-require idiom"

requirements-completed: [MEAS-01]

# Metrics
duration: 24min
completed: 2026-09-30
---

# Phase 66 Plan 04: Autopilot Iteration Timing and Provider-First Cost Summary

**Autopilot iterations now record model time (with a retry mark), summed executed-tool time and provider-first usage and cost with source labels. xAI's `cost_in_usd_ticks` is the cost when present; the price table is a labelled estimate that prices grok-4.3 at $1.25/$2.50 instead of the old $3/$15 substring match, and never prices an unknown model as Grok. Executed calls carry `durationMs` (none on denied or malformed calls). Everything persists through `automationLogger.saveSession`, including a save-time `totalCostBasis` label on the record and its index entry, and the autopilot text export shows per-iteration and per-call milliseconds. Legacy totals and autopilot behaviour are unchanged (D-02).**

This plan delivers the autopilot slice of MEAS-01 (D-05, D-09, D-10, D-11). `requirements-completed` lists the plan's requirement ID for traceability only. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched, because the orchestrator owns them.

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-30T07:06:35Z
- **Completed:** 2026-09-30T07:30Z
- **Tasks:** 3/3
- **Files:** 9 (4 extension sources and 4 paired test files modified, 1 test fixture created); exactly the plan's `files_modified`

## Accomplishments

- **Pricing (D-11, D-10):**
  - `grok-4.3`, `grok-4.3-latest` and `grok-build-0.1` are the first three `MODEL_PRICING` keys, so the substring loop can no longer send `grok-4.3` to the legacy `grok-4` row. `estimateCost('grok-4.3', 1e6, 1e6)` is 3.75 (it was 18.00).
  - The seven slugs xAI now serves with grok-4.3 bill at $1.25/$2.50. `grok-code-fast-1` bills at $1.00/$2.00. Every other row is unchanged, and so are the tables in `analytics.js` and `background.js` (orchestrator decision 6).
  - Unknown models keep the frozen 0.20/0.50 display rate in the legacy numbers (still 0.70 per 1M/1M). The labelled measurement path reports them as `unavailable`.
- **Provider-first readers:**
  - `readProviderUsage` maps the OpenAI-compatible, Anthropic and Gemini usage shapes to `{input, output, reasoning, cachedInput}`. It takes xAI cost from `cost_in_usd_ticks / 1e10` and OpenRouter cost from `usage.cost`, and caps `servedModel` at 128 characters. Missing, non-finite, negative and string values become null.
  - `estimateCostDetailed` bills reasoning at the output rate only for xai and gemini, where it is reported outside the output count. LM Studio is a labelled $0 estimate.
- **Iteration rows:**
  - `buildIterationTimingRow` produces the exact v1 row. Provider cost wins over the estimate, and `estimateDeltaPct = round4((estimate - provider) / provider)`.
  - The fixture's delta is 0.9853, which is the cached-input discount the estimate does not model.
  - `appendIterationTiming` keeps the last 100 rows and O(1) summary totals that stay null until the first finite value. A source is the rows' shared value, or `mixed` once rows differ.
- **Agent loop (inline, no new module, `background.js` untouched):**
  - Five `_al_` resolvers with null fallbacks.
  - Model time is stamped once the provider call, and any text-only image retry, resolves. The retry sets `modelRetried`.
  - The iteration row is appended right after the legacy usage block, before the end_turn check, so the terminal `complete_task`/`partial_task`/`fail_task` iterations record it too.
  - Tool time runs from the permission check to the success push, lands on both push literals, and is folded into the iteration row.
  - `setTimeout` still counts 8, the two `stepName` literals are untouched, and the legacy usage lines, hooks, metrics and exports are unchanged.
- **Persistence (D-05, D-09, I-2):**
  - Both `saveSession` action projections spread `projectPersistedActionTiming(a)`.
  - `iterationTiming` and `measurementSummary` persist in the new-session branch. In the existing-session branch they are replaced, or kept when a save omits them.
  - `computeLegacyCostBasis` implements the cost half of the 66-06 BASIS LABELS contract verbatim. The same `totalCostBasis` goes on the record and its index entry, which gains only that field.
  - `exportHumanReadable` appends the timing lines after the step lines.

Sample export tail, from an end-to-end run of the real agent loop and logger (throwaway harness, below):

```
Timing: model 54 ms over 2 iterations | tools 0 ms over 1 calls | cost $0.017050 (provider)
Iteration 1: model 28 ms | tools 0 ms (1 calls) | cost $0.008525 (provider) | served grok-4.3
Iteration 2: model 26 ms | tools none (0 calls) | cost $0.008525 (provider) | served grok-4.3
Call 1: get_site_guide | 0 ms
```

## Task Commits

1. **Task 1: Price rows, provider-first usage/cost readers, and iteration-row helpers in cost-tracker.js:** `b073fbd5` (feat)
2. **Task 2: Inline model and tool timing in agent-loop.js, null-default durationMs, and source-contract assertions:** `62ac836a` (feat)
3. **Task 3: Persist measurement fields through saveSession and add timing lines to the autopilot text export:** `1bc21ddd` (feat)

**Plan metadata:** see the `docs(66-04)` commit that adds this SUMMARY.

## Files Created/Modified

- `extension/ai/cost-tracker.js`:
  - D-11 rows and the retirement comment block.
  - Constants `LEGACY_UNKNOWN_MODEL_PRICING` and `XAI_TICKS_PER_USD`.
  - `resolvePricingKey` and the refactored `estimateCost`.
  - `readProviderUsage`, `estimateCostDetailed`, `buildIterationTimingRow`, `appendIterationTiming` and `addIterationToolTime`.
  - Private `_ct*` helpers; every new top-level name was grep-checked as unused in `extension/`.
  - `CostTracker` is unchanged. `module.exports` gains the six new functions and two constants.
- `extension/ai/agent-loop.js`: the five resolvers, `_timingModelRetried`/`_timingModelMs`, the h1a measurement block, `_timingToolStartedAt`, `_timingToolMs` with the clock-rollback guard, `durationMs: _timingToolMs` on both success-push literals, and the guarded `_al_addIterationToolTime` call (+52/-2 lines).
- `extension/ai/action-history.js`: `durationMs: Number.isFinite(f.durationMs) ? f.durationMs : null`.
- `extension/utils/automation-logger.js`:
  - New helpers `cloneIterationTimingForPersistence`, `cloneMeasurementSummaryForPersistence`, `projectPersistedActionTiming`, `computeLegacyCostBasis` and `formatSessionTimingLines`.
  - Both save branches, the save-time basis, the index field, and the export lines.
- `tests/cost-tracker.test.js`: Grok expectations recomputed. The unknown-model case is relabelled and stays 0.70. Cases cover every behaviour in the plan, including recursive `/token/i` and `stepName` key scans. It went from 67 to 299 assertions.
- `tests/cost-tracker-ordering.test.js`: a `--- Phase 66 measurement wiring ---` section with 20 source assertions (placement, the resolver lines, `durationMs` counts, the malformed and denied slices, D-02 anchors). It went from 17 to 37.
- `tests/action-history.test.js`: the default `durationMs` is now null, with measured, zero and invalid cases added. It went from 65 to 71.
- `tests/automation-logger-mcp-retention.test.js`: seven Phase 66 sections covering both branches, the cap, the row filter, MCP timing in both branches, index leanness, the seven basis cases plus recompute and keep, and the export lines. The 82 existing checks are unchanged; the file went from 82 to 138.
- `tests/fixtures/bench/xai-chat-completion.json`: a synthetic body whose ticks equal the true cached-input bill: 4000 × $1.25/M + 8000 × $0.20/M + 770 × $2.50/M = $0.008525.

## Verification

| Check | Result |
|-------|--------|
| Task 1 verify `node tests/cost-tracker.test.js` + acceptance `node -e` (first keys, 3.75, unavailable) + `git diff --quiet` on analytics.js/background.js | exit 0 (299/0); all acceptance exits 0 |
| Task 2: the 13 verify suites, the 7 extra acceptance suites and cost-tracker (21 in all) | all exit 0 (action-history 71/0, cost-tracker-ordering 37/0, turn-result 69/0, meta-cognitive 19/0, provider-parity 118/0, tool-definitions-parity 268/0, ...) |
| Task 2 acceptance `node -e` (setTimeout 8, `stepName: '` 2, `durationMs: _timingToolMs` 2; `Number.isFinite(f.durationMs) ? f.durationMs : null` present) and `git diff --quiet HEAD -- extension/background.js` | exit 0 |
| Task 3 verify (retention, lattice-replay-background-contract, delegation-sidepanel-tab-follow, mcp-session-recorder) | exit 0 (138/0, 59 passed, pass, 353/0) |
| Task 3 acceptance greps | `projectPersistedActionTiming(a)` = 2; `cloneIterationTimingForPersistence(` = 3; `computeLegacyCostBasis(` = 2; `totalCostBasis` = 2; getReplayData precedes exportHumanReadable |
| W11 sweeps vs `66-02-SWEEP-BASELINE.json` (7225 held, same as the baseline) | Task 1: 4/4; Task 2: 24/24; Task 3: 6/6. No new failures |
| Plan `<verification>` | the four suites exit 0; `git diff --quiet eaa1ed03 HEAD -- extension/background.js extension/utils/analytics.js mcp/` exits 0 |
| Full `npm test` chain, tolerant mode (7225 held by pid 42278) | **311/311 commands exit 0** (13 pretest + 298 test), 204 s. Artifacts: `/tmp/fsb-66-04-chain.{jsonl,log,done}`. The chain rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`; they were reverted with `git checkout --` and never committed. No lockfile or `mcp/` file changed, and 7225 is still held by the same pid |

**End-to-end harness (throwaway, `/tmp/fsb-66-04-agentloop-harness.js`, never committed).** No suite runs `runAgentIteration`, so a harness drove the real `runAgentLoop` in Node with a stubbed xAI bridge. Iteration 1 returned an executed local tool (`get_site_guide`) and a malformed-argument call; iteration 2 returned `complete_task`.
- **Result:** two v1 rows, including the terminal iteration's row. The executed call carries `durationMs` and the malformed call carries none. The summary totals are right. With the real logger loaded, the saved record, the index basis and the export lines are all correct.
- **D-02:** the same run with the Phase 66 helpers removed from `cost-tracker.js`, and the same run against the pre-change `agent-loop.js`/`action-history.js`, produced the same status, two provider calls, `totalCost` 0.03175, `totalInputTokens` 24000 and the same action rows. The only difference was the additive `durationMs` key.

## Decisions Made

- **Legacy fallback kept numerically, decoupled structurally.** Orchestrator decision 9 asks for decoupling. A frozen constant keeps the legacy unknown-model rate at its old value, so D-02 legacy totals do not move. The measurement path reports unknown models as `unavailable`.
- **Model time covers the one retry.** When the text-only image retry fires, model time spans both attempts plus the rejection bookkeeping, and `modelRetried: true` says so. This follows research Pattern 4.
- **The requested model is the latest one.** `measurementSummary.requestedModel` tracks the most recent non-null requested model. `servedModels` keeps up to 10 distinct served strings in first-seen order.
- **Export wording.** See key-decisions: a unit is printed only beside a measured number. Call numbers are the row's position in the persisted `actionHistory`, so `Call N` lines up with `Step N`.
- **Commit granularity.** One commit per task, tests with source (see TDD Gate Compliance).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A backwards wall-clock step could record a negative tool duration**
- **Found during:** Task 2
- **Issue:** The plan's `var _timingToolMs = Date.now() - _timingToolStartedAt;` goes straight onto the action row. A clock step during a tool call would persist a negative `durationMs`, which the v1 contract ("finite and non-negative or null") forbids. 66-03 hit the same problem on the MCP side (its Deviation 1).
- **Fix:** One guard line, `if (!(_timingToolMs >= 0)) _timingToolMs = null;`, so the call is recorded as unmeasured, never negative and never a clamped 0. The plan's literal line is kept, and `durationMs: _timingToolMs` still appears exactly twice. `buildIterationTimingRow` already nulls a negative `modelMs`, and `addIterationToolTime` rejects a negative duration.
- **Files modified:** `extension/ai/agent-loop.js`
- **Verification:** the Task 2 acceptance `node -e` exits 0 and the pin suites pass. A throwaway run of the loop shows non-negative durations.
- **Committed in:** `62ac836a`

**2. [Rule 2 - Missing critical functionality] The persisted durationMs must also be non-negative**
- **Found during:** Task 3
- **Issue:** The plan's projection was finite-only (`Number.isFinite(a.durationMs) ? a.durationMs : null`), so a negative value from any producer would reach history and `get_session_detail`.
- **Fix:** `projectPersistedActionTiming` keeps `durationMs` only when it is finite and `>= 0`, else null. The text export applies the same rule.
- **Files modified:** `extension/utils/automation-logger.js`, `tests/automation-logger-mcp-retention.test.js` (a -5 case)
- **Verification:** "a non-v1 timing and a negative durationMs are dropped" passes in both save branches.
- **Committed in:** `1bc21ddd`

**3. [Rule 1 - Bug] Prototype names and non-string models broke the price lookup**
- **Found during:** Task 1
- **Issue:** The old exact match `MODEL_PRICING[model]` returned `Object.prototype.constructor` for the model `'constructor'`, which gave a NaN cost. A non-string truthy model threw a TypeError at `.toLowerCase()`.
- **Fix:** `resolvePricingKey` requires a non-empty string and matches own keys only. Both cases now resolve to null. The legacy path then uses the display fallback, and the measurement path reports `unavailable`.
- **Files modified:** `extension/ai/cost-tracker.js`, `tests/cost-tracker.test.js`
- **Verification:** the `'constructor'`, `'__proto__'` and `42` cases pass. `estimateCost('constructor', 1e6, 1e6)` is 0.70, not NaN.
- **Committed in:** `b073fbd5`

**4. [Rule 3 - Blocking] The resolver edit trimmed a space from an adjacent line**
- **Found during:** Task 2 diff review
- **Issue:** The multi-line edit that inserted the resolvers dropped the space in `var _al_TranscriptStore = (`, giving `=(`.
- **Fix:** Restored the line byte-for-byte before committing. The committed diff for that region is purely additive.
- **Files modified:** `extension/ai/agent-loop.js`
- **Committed in:** `62ac836a` (never committed in the broken form)

---

**Total deviations:** 4 auto-fixed (2 Rule 1, 1 Rule 2, 1 Rule 3).
**Impact on plan:** each one tightens the plan's own contract (never negative, never NaN, never invented) or keeps the diff clean. There is no scope creep, and the footprint is exactly `files_modified`.

## TDD Gate Compliance

Tasks 1 and 3 are `tdd="true"`, but the plan type is `execute` and every touched suite is in the `npm test` chain. A standalone RED commit would leave the chain red at that commit, so RED was run and recorded before each implementation, and each task has one `feat(66-04)` commit with the tests and source together. This matches 66-03.

| Task | RED (tests first, unchanged source) | GREEN |
|------|-------------------------------------|-------|
| 1 | cost-tracker 66 pass / 58 fail (every failure in a repriced or new case) | 299 / 0 |
| 2 (tests first, not tdd) | action-history 66 / 5; cost-tracker-ordering 22 / 15 | 71 / 0; 37 / 0 |
| 3 | retention: the 82 existing checks and 9 new ones pass, 11 new checks fail, then a new case aborts on the missing rows. That case was hardened to report FAIL instead of throwing | 138 / 0 |

## Issues Encountered

- **LM Studio legacy basis (observation for 66-06; pre-existing, not changed).** The loop's legacy `session._costTracker.record(model, inputTokens, outputTokens)` does not pass the provider. That line is unchanged, per D-02 and the plan's "do not change the legacy usage block". An LM Studio session's legacy `totalCost` is therefore priced at the unknown-model display rate unless its model name matches a table row, exactly as before Phase 66.
  - The measurement path records LM Studio correctly: a $0 estimate with pricingKey `lmstudio-local`.
  - Implemented verbatim, the BASIS LABELS rule then labels that legacy total `'estimate'`, as the contract explicitly intends ("even when the total is 0, for example a local lmstudio run").
  - If 66-06 or the deferred default-model fix wants the label to reflect the non-zero legacy total, the fix belongs in that contract or in the legacy `record()` call, not here.
- **Sub-millisecond tools record 0.** Local tools such as `get_site_guide` finish within one `Date.now()` tick, so `durationMs` 0 is a measured value, not an invented one.
- graphify's graph is stale for these files, as 66-PATTERNS.md notes. It was used for orientation only; every line anchor was re-verified in the working tree.
- The pre-commit `worktree-agent-*` branch allow-list was skipped because the orchestrator directed commits on `Jev`, as in 66-02 and 66-03. The cwd-drift sentinel and the protected-branch deny-list ran before each commit.

## Known Stubs

None. Every new field is written by the live autopilot loop, persisted by the logger, and exercised end to end by the throwaway harness. Plan 66-06 adds the `get_session_detail` projection that reads it over MCP; that is the planned next step, not a stub here.

## Threat Model Coverage

- **T-66-05 (tampering):**
  - Only finite, non-negative provider numbers are accepted, and `servedModel`/`requestedModel` are capped at 128 characters.
  - Both agent-loop measurement blocks are in try/catch, and a hostile body leaves the row all-null (hostile-shape tests in cost-tracker).
  - Legacy MCP timing is re-validated with `fsbMs` recomputed.
- **T-66-01 (information disclosure):** rows hold only numbers, model and provider names, and labels, with no request, response or page text. Recursive key scans find no `/token/i` key and no `stepName` key. The index carries only the basis label.
- **T-66-02b (mislabelled cost):** every row carries `usageSource`/`costSource`. Unknown models are `unavailable`, never Grok-priced. `estimateDeltaPct` records estimate-versus-provider drift.
- **T-66-DoS:** 100-row cap, O(1) summary updates, and no new `chrome.storage` writes. Persistence rides the existing `saveSession` calls.

No new security surface beyond the plan's threat register.

## User Setup Required

None.

## Next Phase Readiness

- **66-06:**
  - `session.iterationTiming`, `session.measurementSummary` and `actionHistory[].durationMs` follow the v1 contract in 66-04-PLAN.md `<interfaces>`.
  - Every session saved from now on carries `totalCostBasis` on its record and its `fsbSessionIndex` entry, always `'estimate'` or `'unavailable'`.
  - Legacy MCP rows carry `timing` and `durationMs` through history.
- **66-08 (autopilot arm):** grok-4.3 is priced correctly, and xAI ticks are recorded as the provider cost with the estimate delta beside them.
- **Blockers:** none.

## Self-Check: PASSED

- All 9 plan files exist on disk (8 modified, 1 created), as does this SUMMARY.
- All three task commits exist: `b073fbd5`, `62ac836a`, `1bc21ddd`.
- No commit in `eaa1ed03..HEAD` has a Co-Authored-By or AI attribution line.
- `git diff --name-only eaa1ed03 HEAD -- .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md mcp/` is empty.
- The working tree was clean apart from this SUMMARY before it was committed.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
