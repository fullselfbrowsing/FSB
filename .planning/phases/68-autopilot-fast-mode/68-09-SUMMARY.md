---
phase: 68-autopilot-fast-mode
plan: 09
subsystem: service-worker (history store + MCP session detail)
tags: [jev, fast-mode, measurement, persistence, get_session_detail, auto-04, d-01, d-23, f20, t-68-11, t-68-12, t-68-19, t-68-26, gotcha-6]

# Dependency graph
requires:
  - phase: 68-04
    provides: "the jevMeasurement producers (ensureMeasurement, appendAttempt, attemptFromResult, addCommandTotals) and the attempt / command shapes"
  - phase: 68-05
    provides: "beforeTurn / afterStep / observeTools, markStepOutcome and the actionHistory decisionSource:'jev' tag"
  - phase: 68-06
    provides: "the loop wiring (fast branch with no timing row) and tests/fixtures/agent-loop-fast-harness.js"
  - phase: 66
    provides: "the clone-helper and delete-then-project patterns for iterationTiming / measurementSummary, and the null-not-zero measurement helpers"
provides:
  - "automation-logger.js cloneJevMeasurementForPersistence (allowlist clone) and the conditional decisionSource on persisted actions"
  - "mcp-tool-dispatcher.js projectJevMeasurement (with projectJevAttempt / projectJevCommand), delete-then-project in sanitizeSessionDetail, conditional decisionSource in sanitizeActionHistoryEntry"
  - "tests/jev-fast-measurement.test.js (94 checks, registered in the root chain and REFINEMENT_ROOT_TEST_COMMANDS)"
  - "goldens tests/fixtures/jev-fast-logger-off-session.json and tests/fixtures/jev-fast-session-detail-off.json, both captured before the edit they guard"
affects: [68-11, V4, V5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained goldens: the fixture holds its own input, so the suite replays exactly what was captured through the current code"
    - "A fixed vm clock (a Date subclass in the logger sandbox) makes every logger timestamp reproducible, so stored records compare byte for byte"
    - "Three-stage key-path parity (producer -> stored record -> projection) with comparator self-tests in both directions"

key-files:
  created:
    - tests/jev-fast-measurement.test.js
    - tests/fixtures/jev-fast-logger-off-session.json
    - tests/fixtures/jev-fast-session-detail-off.json
    - .planning/phases/68-autopilot-fast-mode/68-09-SUMMARY.md
  modified:
    - extension/utils/automation-logger.js
    - extension/ws/mcp-tool-dispatcher.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "Both allowlists check values as well as keys: code-word fields must match ^[a-z][a-z0-9_]{0,63}$, servedModel and instrumentVersion are bounded strings (128 / 64, the contract limits), sources are limited to their 67 labels, counts must be safe non-negative integers, and other numbers must be finite and non-negative; anything else becomes null (or 'unavailable' for a source)"
  - "The code-word regex stands in for the producer's closed vocabularies instead of hand-copying the fallback, outcome, op and reason lists, so a new contract reason cannot be silently dropped while free text still cannot pass"
  - "An array, null or non-object jevMeasurement is neither persisted nor projected; the logger and the dispatcher apply the same rule"
  - "The persisted and projected attempt and command keys keep producer order, so a stored or projected block deep-equals the producer block"
  - "buildInFlightSessionSnapshot is unchanged: an in-flight session never carries the block, only the currentAction marker"

patterns-established:
  - "68-11's pin audit can rely on the two goldens (never regenerated) and on the 'measurement parity round trip' check for the hand-mirrored allowlists"

requirements-completed: [AUTO-04]

# Metrics
duration: 18min
completed: 2026-10-17
---

# Phase 68 Plan 09: Fast-mode measurement persistence and session-detail projection Summary

**A session's `jevMeasurement` block now persists in the history store and appears in `get_session_detail`, but only for sessions that have one. Each copy is built field by field from an allowlist, so no page content survives, and missing numbers stay null rather than 0. Fast steps carry `decisionSource: 'jev'` in the stored and projected action history. Stored records and detail output for sessions that never used fast mode are byte-identical to goldens captured before the edits. A round trip through the real fast-path module, the real logger and the real dispatcher shows that the two hand-maintained allowlists match the producer key for key.**

## Performance

- **Duration:** about 18 min
- **Started:** 2026-10-17T11:27:55Z
- **Completed:** 2026-10-17T11:45:06Z
- **Tasks:** 2 of 2
- **Files:** 7 (3 created, 4 modified), plus this SUMMARY

## Accomplishments

### What the history store keeps (`automation-logger.js`)

- **Clone:** `cloneJevMeasurementForPersistence(block)` returns `undefined` when the block is missing or is not a plain object. Otherwise it builds `{v: 1, attempts, commands}` from scratch. It drops entries that are not objects and keeps the newest 100 attempts and the newest 100 commands.
- **Off sessions get no key.** In new mode the key is added through a conditional spread. In update mode it is written only when the clone is defined. A later save with no block therefore keeps the stored one, and a save with a block replaces it.
- **Action marker:** both actionHistory projections add `decisionSource: 'jev'` only when the source event has exactly that value. It goes after the existing fields, so every other entry keeps its fields unchanged.
- **Cost:** no cost field is touched, the index entry carries no measurement, and the logger never names `estimateCost` or `CostTracker`.

### What `get_session_detail` returns (`mcp-tool-dispatcher.js`)

- **Delete, then project:** `sanitizeSessionDetail` always deletes `sanitized.jevMeasurement`, next to the Phase 66 deletes. It then adds `projectJevMeasurement(session.jevMeasurement)` after `measurement`, and only when the stored value is a plain object. This prevents three problems with the generic sanitizer (F20): it drops every `/token/i` key such as `inputTokens`, it flattens nested objects to `'[object]'`, and it would let through hostile keys.
- **Numbers:** the projection uses the Phase 66 helpers: `measurementCountOrNull`, `measurementNumberOrNull` and `measurementSourceLabel`. A missing value becomes null, never 0.
- **Action marker:** `sanitizeActionHistoryEntry` adds `decisionSource: 'jev'` only for fast steps. The same rule applies to the in-flight `currentAction`. A fast step's `jevHandle`, `jevGeneration`, `expectedRole` and `expectedName` never leave, because the sanitizer projects only `selector` and the URL's domain from params.
- **Unchanged:** `buildInFlightSessionSnapshot`, the journal path and list_sessions. The dispatcher never names `estimateCost` or `CostTracker`.

### Persisted keys and projected keys (identical sets, producer order)

| Level | Keys |
| --- | --- |
| block | `v` (always 1), `attempts` (newest 100), `commands` (newest 100) |
| attempt | `iteration`, `command`, `decisionSource` (`'jev'` or null), `jevCalled` (boolean), `servedModel` (at most 128 characters), `instrumentVersion` (at most 64), `calibrationStatus`, `latencyMs`, `usage: {inputTokens, source: provider or unavailable}`, `cost: {usd, source: provider, estimate or unavailable}`, `fallback`, `outcome`, `escalationReason`, `op`, `stepOutcome` |
| command | `command`, `fastSteps`, `jevCalls`, `jevMs`, `usd: {provider, estimate}`, `escalations: {<code word>: count}` (at most 100 reasons) |
| actionHistory entry | the existing fields, plus `decisionSource: 'jev'` for fast steps only |

### Goldens (captured before the edit they guard; never regenerate)

- **`tests/fixtures/jev-fast-logger-off-session.json`:** captured at `a780238a` with the unedited logger. It holds the input: a fixed autopilot session with logs, five actions (one failed, one with timing, one on a second tab), v1 timing rows and a measurement summary. It also holds the stored record and index entry after a new-mode save and after an update-mode save. Committed in `a7569a6e`.
- **`tests/fixtures/jev-fast-session-detail-off.json`:** captured at `a7569a6e` with the unedited dispatcher. It covers three `get_session_detail` outputs:
  - the logger golden's update-mode record, read through the real `loadSession`;
  - a legacy stored MCP session;
  - an in-flight autopilot session.

  Committed in `a26f3dfe`.

### What the suite proves (`tests/jev-fast-measurement.test.js`, 94 checks)

- **Logger:**
  - The golden input saved by the current logger is byte-identical to the golden record in both modes.
  - Sessions with the switch on but no Jev activity (`fastMode`, `_fastPath` and `agentState.jevFast` present) store the identical record, as do sessions whose `jevMeasurement` is null, `[]`, a string, a number or a boolean.
  - A clean block persists unchanged, and the rest of the record is byte-identical to the golden (cost, tokens, timing and summary unchanged).
  - In update mode the stored block is kept when the new session has none, replaced when it has one, and added when it first appears in update mode.
  - A hostile block reduces to the expected allowlist output with no marker left. Its markers include labels, URLs, titles, goals, page text, free-text codes, bad escalation keys, non-finite numbers, foreign sources and over-length model ids.
  - The 100-entry caps keep the newest entries.
  - The marker appears only for `'jev'`.
- **Dispatcher:**
  - All three golden outputs are byte-identical, including the full chain from the current logger to the current dispatcher.
  - An in-flight session with the switch on and no Jev activity reads exactly as the golden.
  - A stored `jevMeasurement` of null, `[]`, a string or 0 is not projected.
  - A clean block is projected key for key with `inputTokens` intact. The rest of the output equals the golden, and the provider `measurement` block is unchanged.
  - Sparse and empty blocks project to null and `'unavailable'`, never 0.
  - The hostile block projects the expected output, with no marker anywhere in the output.
  - The marker appears on history entries and on the in-flight `currentAction` for fast steps only, and no fast param leaves.
- **Measurement parity round trip:** the real `FsbFastPath` runs over fake deps and the fake-gateway `makeClient` with held timers. Each decide takes 120 ms on the injected clock. The scenario has two commands:
  - **Command 1:** the first LLM turn; an acted calibrated click followed by the real `afterStep` with a verified success (`stepOutcome: 'progress'`); an `observeTools` LLM turn; a below-threshold answer; another LLM turn; and a `fallbackBody('timeout', 504)` answer. Every menu has a new signature.
  - **Command 2:** a sensitive goal containing a run token, after its first LLM turn.

  The block is saved through the real logger in new mode after command 1 and in update mode after command 2, then read back through the real `get_session_detail`. At both saves the producer, the stored record and the projection agree on every attempt and command key path (arrays collapsed to their element shape) and on every value. `PASS: measurement parity round trip` is printed.
  - **Self-tests:** the comparator rejects an extra attempt key, an extra command key and a producer that omits an allowlisted key. Each case runs through the real logger and dispatcher.
  - **Cost and timing:** the scenario leaves `totalCost`, `iterationTiming` and `measurementSummary` untouched. The output equals the projection of the same record without the block.
  - **No leaks:** no menu label, URL, title or page text appears in the stored block or the output, and no `fastMode`, `_fastPath` or `jevFast` is stored or projected.
- **Loop:**
  - The real `runAgentIteration` runs through the 68-06 harness with an LLM click, one fast click and a catch-all hand-back to the LLM.
  - Timing rows after each step are `[1, 1, 2]`, for iterations `[1, 3]`.
  - The fast iteration adds nothing to `totalCost` or `agentState.totalCost`.
  - Jev cost (2 x 0.0000378 USD, provider-labelled) appears only in `jevMeasurement.commands[0].usd.provider`.
  - After a save and a read, `measurement.perIteration` has two rows and `jevMeasurement` arrives unchanged.
- **Static checks:**
  - The logger, the dispatcher and `jev-fast-path.js` never name `estimateCost` or `CostTracker`.
  - `jev-fast-path.js` never names the timing rows or the session cost fields.
  - The dispatcher has exactly one `delete sanitized.jevMeasurement;`.
  - `buildInFlightSessionSnapshot` never names `jevMeasurement`.

## Task Commits

1. **Task 1: persist jevMeasurement and the decision-source marker only when present.** Commit `a7569a6e` (feat). It includes the logger golden, the suite's logger section and the registration in `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS`.
2. **Task 2: project jevMeasurement and the marker through get_session_detail.** Commit `a26f3dfe` (feat). It includes the detail golden, the dispatcher, parity and loop sections.

**Plan metadata:** the `docs(68-09)` commit that adds this SUMMARY.

## Files Created/Modified

- `extension/utils/automation-logger.js` (+89 / -3): the allowlist clone and its helpers (block-scoped consts, so they add no service-worker globals), one call in each save mode, and the conditional marker in both action projections.
- `extension/ws/mcp-tool-dispatcher.js` (+83 / -1): `jevMeasurementCode`, `jevMeasurementString`, `projectJevAttempt`, `projectJevCommand` and `projectJevMeasurement`; the delete-then-project lines; and the conditional marker. The new global function names collide with nothing under `extension/`.
- `tests/jev-fast-measurement.test.js` (new, 94 checks).
- `tests/fixtures/jev-fast-logger-off-session.json` and `tests/fixtures/jev-fast-session-detail-off.json` (new goldens).
- `package.json` and `tests/delegation-phase-contract.test.js`: `node tests/jev-fast-measurement.test.js` appended once each, after `node --test tests/jev-fast-capture.test.mjs`.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Information hygiene] Both allowlists check values, not only keys**
- **Found during:** Task 1
- **Issue:** The plan asks for an allowlist clone that keeps no page content, but a key allowlist alone would still store free text that a buggy writer put into an allowed string key such as `op` or `fallback`.
- **Fix:** Code-word fields must match the code-word regex, model ids are bounded, sources are limited to their labels, and counts and numbers are type-checked. The parity round trip shows that the real producer's values pass unchanged.
- **Files modified:** extension/utils/automation-logger.js, extension/ws/mcp-tool-dispatcher.js
- **Commits:** a7569a6e, a26f3dfe

**2. [Rule 2 - Consistency] An array `jevMeasurement` is not projected**
- **Found during:** Task 2
- **Issue:** The plan's condition `session.jevMeasurement && typeof session.jevMeasurement === 'object'` accepts an array, which the logger never persists.
- **Fix:** Added `!Array.isArray(...)`. Both layers now use the same notion of "present", and the golden case for `[]` proves the output is unchanged.
- **Commit:** a26f3dfe

**3. [Rule 2 - Evidence for a stated truth] Loop-level proof of "no v1 timing row" and "no provider cost"**
- **Found during:** Task 2
- **Issue:** The must-have truth "fast iterations add no v1 timing row" had no test. No 68-06 or 68-07 suite asserts `iterationTiming` or `totalCost` across a fast iteration.
- **Fix:** One loop case through the existing `agent-loop-fast-harness.js` with its own simple deps (no background.js slices), plus a producer-level check in the parity scenario.
- **Commit:** a26f3dfe

**4. [Plan wording] One clone call per save mode**
- **Found during:** Task 1
- **Issue:** The first draft computed the clone once, before the mode branch. That would leave one definition and one use, while the acceptance grep expects a definition and two uses.
- **Fix:** Each mode calls the helper itself, which matches the plan's step 2 wording.
- **Commit:** a7569a6e

**5. [Acceptance grep] Comment wording**
- **Found during:** Task 1
- **Issue:** A logger comment used the word `totalCost`, which the `estimateCost|totalCost` acceptance grep on added lines would have counted.
- **Fix:** The comment was reworded to "the legacy session cost".
- **Commit:** a7569a6e

**6. [Test harness] Self-contained goldens, extra coverage, RED and GREEN per task commit**
- **Self-contained goldens:**
  - The logger golden stores its own input and the index entry.
  - The detail golden reuses the logger golden's record by reference and adds a stored MCP session.
  - Golden equality is checked byte for byte with `JSON.stringify(_, null, 2)`.
- **RED and GREEN:** RED was observed before each implementation: Task 1 had 16 failing cases with every golden passing, and Task 2 had 22 failing cases with every golden and producer-scenario check passing. RED and GREEN landed in one commit per task, as in 68-02 and 68-04, because a separate `test(...)` commit would register a red suite in the root chain.
- **Commits:** a7569a6e, a26f3dfe

---

**Total deviations:** 6. Two tighten information hygiene, one adds evidence for a stated truth, two concern wording and acceptance greps, and one concerns the test harness. **Impact:** nothing is loosened, and every acceptance criterion holds as written.

## TDD Gate Compliance

There are no separate `test(68-09)` commits (deviation 6). RED was run and observed for both tasks before the implementation. Mutation spot-checks show the cases are not vacuous. Each modified file was restored byte for byte afterwards.
- **Logger, 5 of 5 meaningful mutations caught:**
  - update mode overwriting with nothing;
  - keeping the oldest 100 instead of the newest;
  - free-text `op`;
  - a marker for any value;
  - unchecked escalation keys.

  A sixth mutation (`jevMeasurement: undefined` instead of the conditional spread) is semantically equivalent, because storage drops undefined members.
- **Dispatcher, 8 of 8 caught:**
  - no delete;
  - an unconditional projection;
  - the projection dropping a producer key (parity fails);
  - the projection adding a key (parity fails);
  - a missing `jevMs` becoming 0;
  - a marker for any value;
  - `inputTokens` dropped;
  - keeping the oldest 100.
- **Logger allowlist, parity guard:** adding a key to the logger's command clone fails parity.

## Verification

- **New suite:** `node tests/jev-fast-measurement.test.js` gives 94 passed, 0 failed on Node 24, on `npx --offline -y node@20` and on `/tmp/fsb-node20/.../node` (v20.20.2).
- **Logger pin suites:** `automation-logger-mcp-retention` (141 passed), `mcp-session-recorder` (363), `delegation-sidepanel-tab-follow` (62), `lattice-replay-background-contract` (59), `extension-content-script-files-completeness` and `delegation-phase-contract` (1246) all exit 0.
- **Dispatcher pin suites:** `hung-page-recovery`, `change-report-toggle`, `change-report-dispatcher`, `change-report-cross-origin`, `mcp-session-recorder`, `mcp-dispatcher-client-label`, `mcp-metrics-recorder`, `mcp-tool-routing-contract` (245 passed) and `browser-editing-actions` all exit 0.
- **Other suites:** `mcp-in-flight-session-lookup` (214 passed), `mcp-settings-route` (415 passed) and `jev-extension-boundary` (0 failed) all exit 0.
- **Neighbouring Phase 68 suites:** `jev-fast-path`, `jev-fast-loop` (278 passed), `jev-fast-upstream-contract`, `jev-fast-start-path` and `jev-fast-capture` all exit 0.
- **Background sweeps:** both ran against `68-SWEEP-BASELINE.json`. The `automation-logger.js` sweep passed 7 of 7 tests and the `mcp-tool-dispatcher.js` sweep 44 of 44, with no new failures. Port 7225 was held by the user's hub and was left untouched.
- **Acceptance greps:**
  - `grep -c cloneJevMeasurementForPersistence` on automation-logger.js prints 3.
  - The `estimateCost|totalCost` grep on the logger's added lines prints 0.
  - `grep -c "delete sanitized.jevMeasurement"` prints 1.
  - `grep -c projectJevMeasurement` prints 2.
  - The `estimateCost` grep on the dispatcher's added lines prints 0.
- **Untouched:** nothing under `mcp/` changed since P68_START `ba745cfe` (`git diff --quiet` exits 0), the crawler files never changed, and the working tree is clean.

## Known Stubs

None.

## Threat Flags

None. The only new outbound surface is the `jevMeasurement` key in `get_session_detail`, which the plan's threat model already covers (T-68-11, T-68-12, T-68-19, T-68-26). It is mitigated by the allowlist projection, the marker scans, the goldens and the parity round trip.

## Deferred to Validation Block

- **M-68-05 (V4):** read Jev cost and latency from the session `jevMeasurement` block, not from MCP metrics, because fast dispatches are attributed to the driving LLM model there (RESEARCH F19). In the real side panel and MCP client, confirm that `get_session_detail` for a fast-mode run shows the block and the `decisionSource:'jev'` markers, and that a switch-off run shows neither.
- **M-68-07 (V5) cross-reference:** reading `jevMeasurement` (one attempt, escalated, latched) for the uncalibrated live run uses the surface built here.

Deferred: M-68-05 (V4).

## User Setup Required

None.

## Next Phase Readiness

- **68-12, 68-10, 68-11:** nothing here changes the settings, the UI copy or the privacy page.
- **68-11's pin audit:** add `extension/utils/automation-logger.js` and `extension/ws/mcp-tool-dispatcher.js` to its list of edited files, and add the two goldens and `tests/jev-fast-measurement.test.js` to the suites that guard them.

## Self-Check: PASSED

- FOUND: extension/utils/automation-logger.js, extension/ws/mcp-tool-dispatcher.js, tests/jev-fast-measurement.test.js, tests/fixtures/jev-fast-logger-off-session.json, tests/fixtures/jev-fast-session-detail-off.json, this SUMMARY
- FOUND: commits a7569a6e and a26f3dfe on branch Jev; neither carries an attribution line
- `node tests/jev-fast-measurement.test.js`: 94 passed, 0 failed after the last commit
