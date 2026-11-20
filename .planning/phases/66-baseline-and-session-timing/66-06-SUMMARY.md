---
phase: 66-baseline-and-session-timing
plan: 06
subsystem: observability
tags: [mcp, get-session-detail, lattice-journal, per-call-timing, measurement, cost-basis, sanitizer, list-sessions, node-test]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: start-commit baseline and the W11 regression sweep with 66-02-SWEEP-BASELINE.json
  - phase: 66-baseline-and-session-timing (plan 03)
    provides: ingress stamp on Symbol.for('fsb.mcp.call-timing'), recorder timing forwarding (recordDispatch and recordTaskOutcome), journal metadata.timing and the timed text exports
  - phase: 66-baseline-and-session-timing (plan 04)
    provides: session.iterationTiming, session.measurementSummary, actionHistory[].durationMs, and the save-time totalCostBasis on the record and its index entry
provides:
  - "MCP_DISPATCHER_CALL_TIMING, readDispatcherCallStamp and buildDispatcherCallTiming: timing on the message-route recorder entry and on recordTaskOutcome (stamp read before visual-session canonicalization)"
  - "Journal-first get_session_detail: hasSession, then bounded internal paging (20 pages of 500), then sanitized actionHistory rows (last 100) with sequence, route, logicalTab, timing and durationMs; callsTotal and actionHistoryTruncated; format text = the journal's exportHumanReadable"
  - "measurement block v1 for MCP sessions (journal and legacy) and autopilot sessions, attached after the generic sanitizer"
  - "totalCostBasis beside every totalCost in get_session_detail and list_sessions (stored value first, W1/I-B rule otherwise)"
  - "sanitizeActionHistoryEntry keeps a measured durationMs and a v1-valid timing"
  - "Save-time computeLegacyCostBasis aligned: a positive legacy total beside LM Studio rows is 'unavailable'"
affects: [66-07, 66-08, benchmark runner, list_sessions consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Journal events leave only as pseudo-actions through the existing sanitizeActionHistoryEntry allowlist; inline descriptors contribute, artifact and omitted ones contribute nothing"
    - "One per-call statistics accumulator shared by the journal and legacy MCP paths, so both report identical measures"
    - "Quantiles use the bench report's rule (scripts/bench/lib/stats.mjs), and a test pins the parity"
    - "Measurement blocks are attached after sanitizeSessionMetadata, never passed through the /token/i key filter"
    - "Basis labels: the stored save-time value wins when valid; otherwise the dispatcher computes the same rule the logger uses"

key-files:
  created: []
  modified:
    - extension/ws/mcp-tool-dispatcher.js
    - tests/mcp-in-flight-session-lookup.test.js
    - extension/utils/automation-logger.js
    - tests/automation-logger-mcp-retention.test.js

key-decisions:
  - "LM Studio (orchestrator carry-over): a positive legacy totalCost beside rows with pricingKey 'lmstudio-local' is 'unavailable', because the legacy record() call prices it at the unknown-model fallback. A legacy total of 0 stays 'estimate', as the contract's own lmstudio example says. The same rule is applied at save time in automation-logger.js and in the dispatcher, so list_sessions and get_session_detail agree"
  - "Journal rows take result.success from the inline result when it is boolean, else from the journal's metadata.success, so an artifact-stored result (over 64 KB) does not read as a failure"
  - "The MCP measurement builder landed with Task 2 (the journal branch needs measurement.calls, truncated and pagesRead); Task 3 added the legacy MCP and autopilot builders, the allowlist and the basis labels"
  - "activeSpanMs is the latest completedAt minus the earliest receivedAt over timed calls. This equals first and last in sequence order for sequential calls, and stays correct when concurrent calls complete out of order"
  - "Autopilot modelMs and toolMs median and p90 cover the stored per-iteration rows (the last 100). toolMs.calls is the session's executed-tool count"
  - "Legacy MCP measurement covers the stored actionHistory rows with truncated false and pagesRead 0, because no paging applies"
  - "Each tdd task was committed once, tests with source: every touched suite is in the npm test chain and must stay green in every commit. RED was run and recorded before each implementation"

patterns-established:
  - "Plan 66-08 reads session.measurement from get_session_detail: kind 'mcp' (journal or legacy) or 'autopilot', v 1; the MCP arm's sessions are journal sessions"
  - "Any new legacy total shown over MCP gets a sibling basis label through withLegacyCostBasis"

requirements-completed: [MEAS-01, MEAS-02]

# Metrics
duration: 23min
completed: 2026-09-30
---

# Phase 66 Plan 06: Journal-Backed Session Detail and Measurement Projection Summary

**`get_session_detail` now resolves journal-backed MCP sessions. It checks the journal first and pages it internally within a bound. Each tool call comes back as a sanitized `actionHistory` row carrying its timing, and `format: 'text'` returns the journal's timed report. Every history session gains a filter-proof `measurement` block:**
- **MCP sessions:** per-call FSB milliseconds, a caller gap labelled as an upper bound, receive-to-receive call intervals, an active span that leaves out the idle tail, a flagged `idle_timeout`, queue wait labelled "not measured", and host model time, tokens and cost labelled "unavailable".
- **Autopilot sessions:** iterations, model and tool time, provider-first tokens and cost with their sources, requested and served models, per-iteration rows, and labelled legacy totals.

**Every legacy `totalCost` shown over MCP now carries a `totalCostBasis` label. The dispatcher's own recording paths now carry call timing.**

This plan delivers MEAS-02 (journal sessions resolve instead of "not found") and the MCP-inspection slice of MEAS-01. `requirements-completed` lists the plan's requirement IDs for traceability only. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched, because the orchestrator owns them.

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-30T08:22:47Z
- **Completed:** 2026-09-30T08:45Z
- **Tasks:** 3/3, plus one orchestrator-directed alignment commit
- **Files modified:** 4 (2 extension sources, 2 paired test files); none created

## Accomplishments

- **Dispatcher call timing (D-04), Task 1:**
  - `MCP_DISPATCHER_CALL_TIMING` is the bridge client's registry symbol under a name local to the dispatcher. `Symbol.for('fsb.mcp.call-timing')` appears once in the file, and `MCP_BRIDGE_CALL_TIMING` appears 0 times.
  - `readDispatcherCallStamp` reads only the symbol, so a caller-supplied string key named `timing` is ignored. `buildDispatcherCallTiming` returns null on a clock rollback, never 0.
  - The message-route `sessionRecordEntry` gains `timing` as its last property.
  - `dispatchMcpToolRoute` reads the stamp before `canonicalizeVisualSessionTaskParams`, whose payload copy drops the symbol, and passes `timing` to `recordTaskOutcome`.
  - A behavioural test drives the visual-session path. The recorder receives the canonicalized copy, which has lost the symbol, and still gets valid timing.
- **Journal-first `get_session_detail` (D-07, D-08), Task 2:**
  - Lookup order: `hasSession` (a throw means not a journal session and falls through), then `getSessionDetail` paged 500 at a time for at most 20 pages, then the legacy `loadSession`, then in-flight sessions.
  - Rows are pseudo-actions sent through the existing `sanitizeActionHistoryEntry`. They keep the selector (at most 250 characters), the domain only, and a bounded error, and add `sequence`, `route`, `logicalTab`, `timing` and `durationMs`.
  - Raw events, inline payloads and descriptors never leave. The test checks that page-text, URL-path and query sentinels are absent from the whole response.
  - `callsTotal`, `actionHistoryTruncated`, `measurement.truncated` and `pagesRead` make both the row cap and the page bound visible.
  - `format: 'text'` returns `exportHumanReadable` verbatim, including the 66-03 legend and the `| fsb N ms` lines.
  - A failure to read the detail or the export returns the route error `Journal session detail unavailable`, never `session_not_found`, and never echoes the internal error.
  - With no journal module, or for sessions the journal does not hold, responses are byte-identical to before (asserted with `JSON.stringify` equality).
- **Measurement and labels (D-03, D-05, D-06, D-10, D-12, W1, W6, I-B, I-2), Task 3:**
  - `sanitizeSessionDetail` deletes the raw `iterationTiming` and `measurementSummary`, then attaches the block after the generic sanitizer. Token counts survive the `/token/i` filter, and no `'[object]'` appears in the block.
  - `sanitizeActionHistoryEntry` keeps a finite, non-negative `durationMs` and a v1-valid `timing` (with fsbMs recomputed). The in-flight `currentAction` keeps its pre-Phase-66 key order unless the live action measured a duration.
  - `list_sessions` maps each entry through `withLegacyCostBasis(entry, entry)`. Only `totalCostBasis` is added; the limit, order and all other fields are unchanged.

Sample output from the committed code, rendered by a throwaway harness (`/tmp/fsb-66-06-sample.js`, not committed). The first block is a journal session that closed on the idle timeout; the second is an autopilot session.

```
{"v":1,"kind":"mcp","source":"journal","calls":3,"callsWithTiming":3,"fsbMs":{"total":1604,"median":412,"p90":732},
 "callerGapMs":{"total":17876,"median":8938,"p90":9068.4,"count":2,"overlapped":0,"label":"upper bound on host thinking time"},
 "callIntervalMs":{"median":9550,"p90":9840.4,"count":2},"activeSpanMs":19480,"endReason":"idle_timeout","idleTimeout":true,
 "idleTailExcluded":true,"queueWaitMs":null,"queueWaitStatus":"not_measured",
 "host":{"modelMs":null,"inputTokens":null,"outputTokens":null,"costUsd":null,"status":"unavailable","reason":"host does not report to FSB"},
 "truncated":false,"pagesRead":1}

{"v":1,"kind":"autopilot","recorded":true,"iterations":2,"modelMs":{"total":5000,"median":2750,"p90":2950},
 "toolMs":{"total":900,"median":475,"p90":495,"calls":3},"inputTokens":18000,"outputTokens":700,"reasoningTokens":300,
 "cachedInputTokens":9000,"usageSource":"provider","costUsd":0.0321,"costSource":"provider","costIterations":2,
 "requestedModel":"grok-4.3","servedModels":["grok-4.3"],"perIteration":[{"iteration":1,"startedAt":1790726401000,...}],
 "legacyTotals":{"costUsd":0.03,"costBasis":"estimate","inputTokens":18000,"outputTokens":700,"usageBasis":"provider",
 "label":"legacy price-table total; not provider-reported"}}
```

## Task Commits

1. **Task 1: Carry call timing on the dispatcher's message-route recorder and task-outcome paths:** `8beef0db` (feat)
2. **Task 2: Journal-first get_session_detail with a sanitized, paged actionHistory projection and a journal text path:** `7b4e8de9` (feat)
3. **Task 3: Explicit measurement projection for MCP and autopilot sessions, plus finite-only durationMs and timing in the action allowlist:** `ea0cbfe0` (feat)
4. **Orchestrator carry-over: align the save-time LM Studio basis rule:** `c8a22e4d` (fix)

**Plan metadata:** see the `docs(66-06)` commit that adds this SUMMARY.

## Files Created/Modified

- `extension/ws/mcp-tool-dispatcher.js`:
  - The call-timing constant and helpers, the recorder-entry `timing` and the `recordTaskOutcome` timing.
  - The journal branch in `handleGetSessionMessageRoute`.
  - `projectJournalDescriptorObject`, `validProjectionTiming`, `projectJournalToolCall`, `createMcpCallStats`/`addMcpCallToStats`, `measurementQuantile`/`summarizeMeasurementValues`, `readMcpEndReason` and `buildMcpMeasurementFromStats`.
  - `collectJournalToolCalls` and `projectJournalSessionForMcp`.
  - `buildMcpMeasurementFromLegacy`, `buildAutopilotMeasurement` and `projectAutopilotIterationRow`.
  - `legacyCostBasisFor`, `resolveLegacyCostBasis`, `legacyUsageBasisFor` and `withLegacyCostBasis`.
  - The allowlist spreads, the `sanitizeSessionDetail` block and the `list_sessions` mapping.
  - Every new top-level name was grep-checked as unused in `extension/`. No top-level `require`.
- `tests/mcp-in-flight-session-lookup.test.js`:
  - `buildHarness` gains optional `journal` and `listSessions` arguments; the defaults are unchanged.
  - 19 new cases (Task 1: 4, Task 2: 9, Task 3: 6). The suite went from 15 to 214 assertions, and the original 4 cases are untouched.
  - Real-journal cases reset the module exactly as `tests/mcp-lattice-journal.test.js` `setup()` does.
- `extension/utils/automation-logger.js`: `computeLegacyCostBasis` adds the LM Studio clause. `computeLegacyCostBasis(` still appears 2 times and `totalCostBasis` 2 times (66-04's pins).
- `tests/automation-logger-mcp-retention.test.js`: LM Studio cases for a positive total (unavailable) and a 0 total (estimate), and a check that the legacy value is kept. It went from 138 to 141 assertions.

## Verification

| Check | Result |
|-------|--------|
| Task 1 verify, plus `mcp-tool-routing-contract` | exit 0: in-flight 62/0, recorder 353/0, client-label 51/0, redaction 20/0, routing 239/0 |
| Task 1 acceptance | symbol count 1; `const MCP_BRIDGE_CALL_TIMING` 0; the ordering and metrics-count `node -e` exits 0 |
| Task 2 verify (in-flight, routing contract, `node --test` journal) | exit 0: 140/0, 239/0, 39/0 |
| Task 2 acceptance | journal checked before `automationLogger?.loadSession`; `journalDescriptorPreview` 0; `git status --porcelain -- mcp/` empty |
| Task 3 verify (in-flight, recorder, client-label, routing, redaction) | exit 0: 214/0, 353/0, 51/0, 239/0, 20/0 |
| Task 3 acceptance | `queueWaitStatus: 'not_measured'` 1; `upper bound on host thinking time` 1; `host does not report to FSB` 1; no `endTime - startTime`; `totalCostBasis` 3; `callIntervalMs` 1; `withLegacyCostBasis(` 3 |
| Logger alignment | retention 141/0; `lattice-replay-background-contract` 59 passed; `delegation-sidepanel-tab-follow` 62/0 |
| W11 sweeps vs `66-02-SWEEP-BASELINE.json` (7225 held, the same state as the baseline) | Task 1: 35/35; Task 2: 35/35; Task 3: 35/35; `automation-logger.js`: 6/6. No new failures |
| Plan `<verification>` command, run verbatim | exit 0: 214/0, 353/0, 51/0, 239/0, `node --test` 59/0 |
| Full `npm test` chain, tolerant mode (7225 held by pid 42278) | **311/311 commands exit 0** (13 pretest + 298 test), 204 s. Artifacts: `/tmp/fsb-66-06-chain.{jsonl,log,done}` |
| D-01 | `git status --porcelain -- mcp/` is empty; no `mcp/` file appears in `d73d74ce..HEAD` |

- The chain rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`. They were reverted with `git checkout --` and never committed.
- No lockfile and no `mcp/` file changed. No stray relay was left running, and 7225 is still held by the same pid.

## Decisions Made

- **LM Studio basis label.** This settles the orchestrator's carry-over from 66-04.
  - **Background:** the legacy `CostTracker.record()` call does not pass the provider, so an LM Studio run's legacy `totalCost` is priced at the unknown-model display fallback (or at a table row whose name happens to match). Its iteration rows carry the local $0 estimate with pricingKey `'lmstudio-local'`. The 66-04 save-time rule labelled that total `'estimate'`.
  - **Rule:** within I-B, those iterations have no real price row. So a positive legacy total beside `'lmstudio-local'` rows is `'unavailable'`. A legacy total of exactly 0 stays `'estimate'`, which is the contract's own lmstudio example.
  - **Where it applies:** `computeLegacyCostBasis` (save time, `c8a22e4d`) and `legacyCostBasisFor` (dispatcher recompute, `ea0cbfe0`) now match. Both routes prefer the stored label, so they agree for every session.
  - **What is unchanged:** no legacy number changed (D-02).
  - **Not covered:** an LM Studio session saved by a build between 66-04 and this plan keeps its stored `'estimate'`. That only affects unreleased development builds.
- **`endReason`** is `outcomeDetails.reason`, cut to 64 characters, or null. A running session has no end reason yet.
- **Autopilot `recorded`** requires `measurementSummary.v === 1`. A malformed or future-version summary reads as not recorded rather than being partly trusted.
- **Source and label allowlists:**
  - Summary `usageSource`: provider, mixed or unavailable.
  - Summary `costSource`: provider, estimate, mixed or unavailable.
  - Row `usageSource`: provider or unavailable.
  - Row `costSource`: provider, estimate or unavailable.
  - Anything else reads `'unavailable'`.
  - Model names are cut to 128 characters, and at most 10 served models are kept.
- **Commit granularity:** see TDD Gate Compliance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Journal rows reported artifact-stored results as failures**
- **Found during:** Task 2
- **Issue:** The plan's pseudo-action uses the inline result object as `result`. A result over 64 KB (for example a large `read_page`) is stored as an artifact with no inline value, so `Boolean(result.success)` read `false` for a successful call. The same happens for any inline result without a boolean `success`.
- **Fix:** The pseudo-action's result is `{ success: <inline boolean, else metadata.success !== false>, error: <inline error> }`, which is still sent through `sanitizeActionHistoryEntry`. Artifact content contributes nothing.
- **Files modified:** `extension/ws/mcp-tool-dispatcher.js`, `tests/mcp-in-flight-session-lookup.test.js` (`runJournalArtifactResultCase`)
- **Verification:** "an artifact result keeps the journal success flag and the request domain" passes, and the artifact sentinel is absent.
- **Committed in:** `7b4e8de9`

**2. [Rule 2 - Missing critical functionality] Journal text export and a vanished session could escape as raw errors**
- **Found during:** Task 2
- **Issue:** The plan wraps only the JSON projection in try/catch. A throwing `exportHumanReadable` would reach the route wrapper `maybeBuildRestrictedResponse`. That wrapper rethrows the raw message to the MCP client, or, when the active tab happens to be restricted, returns a misleading restricted-page response. A session deleted between `hasSession` and `getSessionDetail` would have produced an empty session object.
- **Fix:** The text export gets the same `Journal session detail unavailable` route error. `collectJournalToolCalls` throws when no page returned a session, and that throw becomes the route error.
- **Files modified:** `extension/ws/mcp-tool-dispatcher.js`, `tests/mcp-in-flight-session-lookup.test.js` (`runJournalLookupErrorCases`)
- **Verification:** the throwing-exporter and vanished-session cases pass, and the internal message (`cursor 7`) is never echoed.
- **Committed in:** `7b4e8de9`

**3. [Rule 2 - Missing critical functionality] The allowlisted durationMs must also be non-negative**
- **Found during:** Task 3
- **Issue:** The plan's spread is finite-only, so a negative `durationMs` from any producer would reach MCP. 66-04's persisted contract is finite and non-negative (its Deviation 2).
- **Fix:** `...(Number.isFinite(action?.durationMs) && action.durationMs >= 0 ? { durationMs } : {})`
- **Files modified:** `extension/ws/mcp-tool-dispatcher.js`, `tests/mcp-in-flight-session-lookup.test.js`
- **Verification:** the -5 row carries no `durationMs`, and a measured 0 is kept.
- **Committed in:** `ea0cbfe0`

**4. [Rule 1 - Bug, orchestrator-directed] LM Studio legacy totals were labelled 'estimate' at save time**
- **Found during:** the orchestrator's carry-over note from 66-04
- **Issue:** see Decisions Made. The fix has to sit in `automation-logger.js`, which is outside this plan's `files_modified`: `list_sessions` can only use the stored label, because index entries carry no rows.
- **Fix:** add the LM Studio clause to `computeLegacyCostBasis`, and use the same clause in the dispatcher's `legacyCostBasisFor`.
- **Files modified:** `extension/utils/automation-logger.js`, `tests/automation-logger-mcp-retention.test.js` (`c8a22e4d`); `extension/ws/mcp-tool-dispatcher.js`, `tests/mcp-in-flight-session-lookup.test.js` (`ea0cbfe0`)
- **Verification:** the two LM Studio cases pass in both suites. The logger sweep ran 6/6, and the full chain ran 311/311.
- **Committed in:** `ea0cbfe0`, `c8a22e4d`

### Execution notes (not rule deviations)

- **Where the MCP measurement builder landed:** `buildMcpMeasurementFromStats` shipped with Task 2, because the Task 2 behaviours assert `measurement.calls`, `truncated` and `pagesRead`. The plan allows this ("build the MCP block inline if doing Task 3 in the same commit"). The journal-based idle-timeout, overlap and call-interval tests shipped with it.
- **Test additions beyond the plan:**
  - A behavioural visual-session `recordTaskOutcome` test (Pitfall 5).
  - A quantile parity check against `scripts/bench/lib/stats.mjs`, loaded with a dynamic `import()` through `pathToFileURL`.
  - An artifact-result case.
  - A byte-identical fallthrough case.
- **Small implementation choices that do not change the contract:**
  - Journal tool names are cut to 100 characters.
  - The row ring keeps the last 100 raw `tool.call` events and projects them once at the end.
  - A stalled cursor (a `nextSequence` that does not advance) ends paging with `truncated: true`.
- **Branch checks:** the executor's `worktree-agent-*` branch allow-list was skipped because the orchestrator directed commits on `Jev`, as in 66-02 to 66-04. The cwd-drift sentinel and the protected-branch deny-list ran before every commit.

---

**Total deviations:** 4 auto-fixed (2 Rule 1, of which 1 orchestrator-directed; 2 Rule 2).
**Impact on plan:** each one closes a correctness gap inside the plan's own contract.
- The only footprint beyond `files_modified` is the orchestrator-directed `automation-logger.js` alignment and its paired test.
- There is no new tool parameter and no `mcp/` change.

## TDD Gate Compliance

All three tasks are `tdd="true"`, but the plan type is `execute`, and every touched suite is in the `npm test` chain. A standalone RED commit would leave the chain red at that commit. So RED was run and recorded before each implementation, and each task has one `feat(66-06)` commit with the tests and source together. This matches 66-03 and 66-04.
- For Tasks 1 and 2, RED ran against the previous commit's dispatcher. That file was copied into place and then restored; the restore was checked by SHA-1.
- For Task 3, RED ran against the committed Task 2 dispatcher.

| Task | RED (tests first, previous source) | GREEN |
|------|------------------------------------|-------|
| 1 | in-flight 26 pass / 13 fail (all failures in new cases) | 62 / 0 |
| 2 | 85 / 55 (all failures in new journal cases) | 140 / 0 |
| 3 | the first run aborted on an unguarded read. The two assertions were hardened, and the rerun gave 158 / 56 | 214 / 0 |
| Logger alignment | retention 140 / 1 (the LM Studio fallback case) | 141 / 0 |

## Issues Encountered

- graphify's graph is stale for the dispatcher (for example, it places `handleGetSessionMessageRoute` at line 2278; the working tree had it at 2904), as the earlier plans noted. It was used for orientation only, and every anchor was re-read in the working tree.
- 7225 was held by the user's hub (pid 42278) throughout, the same state as the baseline. No port-bound test failed.

## Known Stubs

None. Journal sessions return `logs: []` by design, as the plan specifies; the journal keeps no session logs. In-flight snapshots do not carry a `measurement` block, which the plan does not ask for. The runner re-queries after completion.

## Threat Model Coverage

- **T-66-03 (information disclosure):**
  - Raw events never leave. Only the allowlist fields are returned: selector, domain and error. Artifact and omitted descriptors contribute nothing.
  - The page-text, URL-path, query and artifact sentinels are absent from the whole response.
  - The response contains no `"inline"`, `"events"` or `"metadata"` key.
- **T-66-05 (tampering):** timing is read only from the symbol, and the string-key spoof test passes. Every timing is re-validated with fsbMs recomputed (`validProjectionTiming`).
- **T-66-DoS:**
  - At most 20 pages of 500 events are read, and the ring keeps 100 rows. The 1203-call case reads 3 pages.
  - A journal whose pages never end stops at 20 pages with `truncated: true`, and a stalled cursor stops early.
- **T-66-03b (accepted):** the measurement block holds only numbers, model names and fixed labels.

No new security surface: the journal index fields that `get_session_detail` returns (id, task, status, agent and recording ids, tab ids, outcome) already appear in `list_sessions`.

## User Setup Required

None.

## Next Phase Readiness

- **66-08 (runner):**
  - Read `session.measurement` from `get_session_detail`. MCP-arm sessions are journal sessions (`source: 'journal'`). Use `fsbMs`, `callerGapMs` (an upper bound), `callIntervalMs` (like-for-like with the 66-01 history deltas) and `activeSpanMs`, and check `truncated`.
  - Autopilot sessions give provider-first cost and tokens with sources, and `perIteration[].startedAt`.
  - Retry `get_session_detail` briefly after `run_task`, because `saveSession` is asynchronous.
- **66-07:** the whole chain is green at `c8a22e4d` (311/311 with 7225 held). A Node 20 run remains part of the phase gate. The new tests use only APIs available in Node 20: dynamic `import()`, `structuredClone` and `pathToFileURL`.
- **Blockers:** none.

## Self-Check: PASSED

- All 4 modified files exist on disk. No file was created apart from this SUMMARY.
- All four commits exist: `8beef0db`, `7b4e8de9`, `ea0cbfe0`, `c8a22e4d`.
- No commit in `d73d74ce..HEAD` has a Co-Authored-By or AI attribution line.
- `git diff --name-only d73d74ce HEAD -- .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md mcp/` is empty.
- The working tree was clean apart from this SUMMARY before it was committed.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
