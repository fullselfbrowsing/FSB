---
phase: 70-bounded-mcp-fast-task
plan: 03
subsystem: fast-mode
tags: [run_task, jev, fast-mode, evidence, hook-pipeline, d-14, pd-70-01, pd-70-03]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01: 70-SYNC-RECHECK.md (items b, e, f, h, o, p, r, s and Drift substitutions), 70-SWEEP-BASELINE.json, the upstream tripwire; 70-02: the run_task session field and budget profile"
  - phase: 68-autopilot-fast-mode
    provides: FsbFastPath (classifyStepEvidence, attemptStep step u, deliverPending), the loop harness, the fake gateway
provides:
  - "FsbFastPath.createRunEvidenceHandlers(session, {startUrl}) -> {beforeTool, afterTool, afterIteration}; isPageObservationTool(name); runEvidenceUnresolved(ev)"
  - "session._fastRunEvidence (memory only) and session._fastRunStartPage (origin + path, memory only) on fast-mode sessions"
  - "background.js fsbRegisterFastRunEvidence(pipeline, session, startUrl) and its one guarded call in handleStartAutomation's new-session path"
  - "Harness option registerRunEvidence in tests/fixtures/agent-loop-fast-harness.js (default off)"
  - "One marked Phase 70 section in jev-fast-path.js, the only place the module may name a terminal tool (PD-70-03)"
affects: [70-04, 70-05, 70-06, 70-07, 70-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-scoped hook observers: synchronous, try/catch-wrapped handlers registered after createSessionHooks, reading their record from the session at call time"
    - "Never-throwing marker helpers called from inside the 68 fast loop, so evidence can never latch fast mode off or change a hand-off"
    - "Fail-closed registration: on any failure the helper unregisters what it added and deletes the record, so a partial record never reads as evidence"

key-files:
  created:
    - .planning/phases/70-bounded-mcp-fast-task/70-03-SUMMARY.md
  modified:
    - extension/ai/jev-fast-path.js
    - extension/background.js
    - tests/fixtures/agent-loop-fast-harness.js
    - tests/jev-fast-path.test.js
    - tests/jev-fast-loop.test.js
    - tests/jev-fast-start-path.test.js
    - .planning/phases/70-bounded-mcp-fast-task/deferred-items.md

key-decisions:
  - "PD-70-03 auto-accepted under auto_advance (config mode yolo): the two 68 'no terminal tool name in jev-fast-path.js' pins are narrowed to outside one marked Phase 70 section, with paired checks that the eight fast-step functions name no terminal tool and the section builds no tool call. Landed as its own commit (6a86571c) so the orchestrator can revert it if rejected."
  - "Observation set is the pinned 9 page-reading tools (PD-70-01) plus a delivered hand-off snapshot; report_progress, the terminal tools, search_memory, list_tabs and get_site_guide are not observations"
  - "A call name that is not a tool-name shape (/^[a-z][a-z0-9_]{0,63}$/) is held in the record as 'other', so an LLM-chosen name can never carry page text into the record"
  - "runEvidenceUnresolved fails closed (true) for a missing or non-object record"
  - "fsbRegisterFastRunEvidence removes partial registrations and the record on failure (a record with no handlers would read as 'evidence available')"
  - "MCP-03 is advanced, not completed, by this plan; it is met only at the Phase 70 gate"

patterns-established:
  - "driveEvidence(handlers, session, turns) in tests/jev-fast-path.test.js: emits BEFORE/AFTER/AFTER_ITERATION exactly as the tool loop does (denied call: no AFTER; terminal tool: no AFTER and no AFTER_ITERATION)"
  - "evidenceLoop(opts) in tests/jev-fast-loop.test.js: a run_task fast-mode run on the real loop with registerRunEvidence, an LLM click on #maybe answered {success:false, outcome:'unknown', mayHaveExecuted:true} by the content script, and an optional getMarkdownSnapshot answer"

requirements-completed: []  # MCP-03 is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~16min
completed: 2026-10-18
---

# Phase 70 Plan 03: Run evidence recorder for fast-mode sessions Summary

**Every executed call of a fast-mode session (run_task or autopilot) is now recorded by three synchronous `FsbFastPath` handlers on the session's hook pipeline, so an uncertain click that runs before `complete_task` in the same LLM turn is never lost. The record lives in memory only (`session._fastRunEvidence`), holds only tool names, iteration numbers, sequence counters and gate codes, and is registered from one guarded line in `handleStartAutomation`. `agent-loop.js` and `createSessionHooks` are unchanged.**

## Performance

- **Duration:** ~16 min (start 2026-10-18T22:19:31Z, last task commit 22:34:31Z, wave check and SUMMARY by ~22:40Z)
- **Started:** 2026-10-18T22:19:31Z
- **Completed:** 2026-10-18
- **Tasks:** 2 of 2, plus one PD-70-03 pin commit before Task 1
- **Files modified:** 6 source/test files (+ deferred-items.md)

## The record as implemented

`session._fastRunEvidence` (created by `createRunEvidenceHandlers`, key order pinned by "run evidence layout"):

```
{ v: 1, seq: 0, fastIteration: null, pending: null, lastUncertainSeq: 0,
  lastObservationSeq: 0, fastUnobservedSeq: 0, gate: null }
pending: { tool, iteration, seq } | null      (tool is 'other' for an off-shape name)
gate:    { code, tool, seq, cleared } | null  (code: payment_not_approved | site_consent_required)
```

`session._fastRunStartPage`: `origin + pathname` of the code-held start URL (`tabInfo.url`) when it is http(s), else null. A second `createRunEvidenceHandlers` call replaces both fields.

| Event | Handler rule |
| --- | --- |
| BEFORE_TOOL_EXECUTION | clear `pending`; unless the tool is complete_task, partial_task or fail_task: `pending = {tool, iteration, seq: ++seq}` |
| AFTER_TOOL_EXECUTION | `seq = ++seq`, `pending = null`; `classifyStepEvidence(...).outcome === 'uncertain'` sets `lastUncertainSeq` (any call); the fast call (`fastIteration === ctx.iteration`) that is unconfirmed, uncertain or no_effect sets `fastUnobservedSeq`; a non-fast successful page-observation tool sets `lastObservationSeq`; a declined `fill_payment_method` or an `invoke_capability` result with `RECIPE_CONSENT_REQUIRED` opens the gate; a later successful call of `gate.tool` sets `cleared: true` |
| AFTER_ITERATION | clear `pending` |
| attemptStep step u (act) | `noteFastIteration(session, iteration)` sets `fastIteration` |
| deliverPending (step v) | only inside the delivered-snapshot condition (`success === true`, non-empty string `markdownSnapshot`): `noteHandoffObservation(session)` sets `lastObservationSeq = ++seq` |

`runEvidenceUnresolved(ev)`: `ev.pending !== null || Math.max(ev.lastUncertainSeq, ev.fastUnobservedSeq) > ev.lastObservationSeq`; a missing or non-object record gives `true`.

**Pinned observation-tool list (PD-70-01):** `capture_screenshot, get_attribute, get_dom_snapshot, get_page_snapshot, get_text, read_page, read_sheet, wait_for_element, wait_for_stable` (`_readOnly === true` and `_route` 'content' or 'cdp'; derived from the registry and pinned in "page-observation tools: the predicate picks exactly the pinned 9 tools").

**Harness option:** `registerRunEvidence` (`{startUrl}` or `true`, where `true` uses `pageUrl`) in `tests/fixtures/agent-loop-fast-harness.js`. It registers like background.js: only on a session that carries `fastMode`, with the module loaded, after the permission hook, in the order before-tool, after-tool, after-iteration. Absent, nothing changes.

**Registration line** (commit `9d69d3f0`, `extension/background.js:14511`), directly between `const sessionHooks = createSessionHooks(sessionId);` and `runAgentLoop(sessionId, {`:

```js
if (sessionData.fastMode) fsbRegisterFastRunEvidence(sessionHooks, sessionData, tabInfo && tabInfo.url);
```

The helper `fsbRegisterFastRunEvidence(pipeline, session, startUrl)` is at `extension/background.js:4189`. The follow-up path (`reactivationHooks`) is not touched.

## Accomplishments

- **PD-70-03 commit:** `jev-fast-path.js` gains one marked section (`// --- run_task outcome (Phase 70) ---` ... `// --- end run_task outcome ---`). `tests/jev-fast-path.test.js` and `tests/jev-fast-loop.test.js` keep their terminal-name bans for everything outside it. They add checks that each marker appears exactly once, that `beforeTurn`, `attemptStep`, `evaluateDecision`, `buildStaticCall`, `afterStep`, `observeTools`, `deliverPending` and `flushHandoff` name no terminal tool, and that the section builds no tool call. The `buildStaticCall` slice check and the executed-fast-call check are unchanged.
- **Task 1:** the recorder, the predicate, `runEvidenceUnresolved` and the two never-throwing marker helpers, all inside the marked section, plus one call line each at step u and in `deliverPending`. 115 new checks in `tests/jev-fast-path.test.js` (1153 total). Mutation check: removing either marker, the terminal exclusion, the observation rule or the gate read each fails 2-13 checks.
- **Task 2:** the background helper and its one call, the harness option, 29 new start-path checks (194 total) and 32 new loop checks (365 total). The loop cases drive the real `runAgentIteration`.

## Task Commits

0. **PD-70-03: confine the terminal-name pins to one marked section** - `6a86571c` (test)
1. **Task 1: the evidence recorder, page-observation predicate and the two fast-loop markers** - `2da3583d` (feat)
2. **Task 2: register the recorder for fast-mode starts and prove the same-turn gap is closed** - `9d69d3f0` (feat), **the registration line's commit**

## Named checks (all PASS)

- Task 1: "run evidence same-turn" (3), "report_progress is not an observation" (4), "hand-off observation delivered" (4), "hand-off observation unavailable" (5: null, failed, empty, non-string, rejecting), "pending cleared by next call" (3), "payment gate", "consent gate", "gate cleared" (4), "evidence holds no page content" (9, including `_fastPath`, `jevMeasurement`, `agentState` and messages deep-equal to a run without the handlers).
- Task 2 loop: "same-turn uncertain then complete" -> true, "same-turn report_progress" -> true, "same-turn observed" -> false, "fast step handed off" (snapshot delivered -> false, snapshot unavailable -> true), "denied call not pending" ([denied click] then end_turn; [denied click, complete_task] in one turn), "switch-off untouched" (golden runs A/B/C and both run_task switch-off runs carry no `_fastRunEvidence` or `_fastRunStartPage`; the option on a session without fastMode equals the golden; the real background helper on a switch-off golden session returns false and the run equals the golden).
- Task 2 start path: three handlers in order BEFORE_TOOL_EXECUTION, AFTER_TOOL_EXECUTION, AFTER_ITERATION, wired end to end through the real `HookPipeline.emit`; false with nothing registered for no field, `null` or `false` field, missing module, missing or throwing or null-returning `createRunEvidenceHandlers`, `register` throwing on call 1, 2 or 3 (partial registration removed); the source checks for the one line, the follow-up branch, the `createSessionHooks` hash (`10ce1a54...`, item r), "no _fastRun persistence" (persistSession, automation-logger.js, the rest of background.js), and 338 importScripts tokens.

## Wave check (`<verification>`)

- `npm run validate:extension`: exit 0
- `node tests/lattice-provider-bridge-smoke.test.js`, `node tests/mcp-version-parity.test.js`, `node tests/mcp-bridge-background-dispatch.test.js`, `node --test tests/bench-drivers.test.mjs tests/bench-identity.test.mjs`: all exit 0
- `npx --offline -y node@20` (v20.20.2) on `jev-fast-path`, `jev-fast-start-path`, `jev-fast-loop`: all exit 0. The official Node 20.20.2 binary also passes those three plus the tripwire, the boundary suite and tighten-only.
- Also green on Node 24: `jev-fast-measurement`, `jev-extension-boundary`, `jev-run-task-upstream-contract`, `jev-policy-tighten-only`, `jev-fast-capture.test.mjs`, `delegation-phase-contract`, `runtime-contracts`, `run-task-fast-mode-wire`. Three repeat runs of `jev-fast-path` and `jev-fast-loop` were all green.
- Regression sweep (`node scripts/bench/sweep-tests.mjs --files extension/background.js extension/ai/jev-fast-path.js --baseline .../70-SWEEP-BASELINE.json`, run before the Task 2 commit): **98/98 passed, no new failures, exit 0**. Port 7225 was held by the user's hub (node pid 7109), as at baseline, and left alone. `git status --short showcase/angular/public` printed nothing.
- `git diff --quiet 3f7efb0a -- mcp/ extension/ai/agent-loop.js extension/ai/tool-definitions.js extension/ui/`: exit 0. `tests/fixtures/jev-fast-loop-off-golden.json` is unchanged. No new test file, so `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS` are unchanged.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Decision taken under auto mode

**PD-70-03 (70-SYNC-RECHECK Drift substitution 9) was auto-accepted.**
- **Context:** the 70-01 and 70-02 SUMMARYs said PD-70-03 needed orchestrator acceptance before 70-03 Task 1 commits. No acceptance is recorded in STATE.md, 70-VALIDATION.md or 70-CONTEXT.md, and the spawn prompt did not mention it.
- **Why auto-select:** config has `auto_advance: true` and mode `yolo`, so a decision auto-selects its recommended option. Task 1 cannot exclude the terminal tools from `pending` without naming them, because no registry flag marks a terminal tool. 70-05's `FAST_MODE_REASONS` also names `complete_task` and `fail_task`.
- **What was applied:** the recommended option, as a separate `test(70-03)` commit (`6a86571c`) before Task 1. This kept Task 1's "only jev-fast-path.js and tests/jev-fast-path.test.js" file-list criterion true, kept every commit green, and makes the decision revertable on its own.
- **If the orchestrator rejects it:** revert `6a86571c`, and the recorder needs the terminal-tool set injected from outside the module (the alternative 70-01 recorded).
- **Note for 70-05:** its classifier vocabulary must live inside the same marked section.

### Auto-fixed Issues

**1. [Rule 2 - Content safety] Off-shape call names are held as 'other'**
- **Found during:** Task 1
- **Issue:** BEFORE_TOOL_EXECUTION's `toolName` is the LLM's `call.name`, which the agent loop does not validate. A page-influenced name could carry page text into `pending.tool`, against D-14's rule that the record holds no text (T-70-02).
- **Fix:** names that fail `/^[a-z][a-z0-9_]{0,63}$/` (the module's existing reason-code shape; every registry name passes) are recorded as `'other'`. They still count as in flight and as uncertain.
- **Commit:** 2da3583d

**2. [Rule 2 - Containment] The markers are never-throwing helpers**
- **Found during:** Task 1
- **Issue:** a bare write at step u sits inside `attemptStep`'s try. A throw there (for example a hostile record getter) would reach the catch, latch fast mode off with `exception` and re-flush. A bare write in `deliverPending` sits inside the snapshot try, where a throw would drop a delivered snapshot.
- **Fix:** each site gets one additive call line (`noteFastIteration(session, iteration);` and `noteHandoffObservation(session);`). The helpers live in the marked section with their own try/catch. Proven by "markers: a record that throws on read never latches fast mode off or changes the hand-off".
- **Commit:** 2da3583d

**3. [Rule 2 - Fail closed] runEvidenceUnresolved and createRunEvidenceHandlers handle missing inputs**
- **Issue:** the interface formula throws on a null record.
- **Fix:** a non-object record gives `true` (unresolved). 70-05 decides a missing record before calling it anyway. `createRunEvidenceHandlers` returns null for a non-object session instead of throwing.
- **Commit:** 2da3583d

**4. [Rule 2 - Fail closed] fsbRegisterFastRunEvidence removes a partial registration**
- **Found during:** Task 2
- **Issue:** if `pipeline.register` threw after the record was created, the session would keep a record with no handlers or only some of them. A record with no AFTER handler reads as "evidence available, nothing uncertain", which is `done`. That is a loosening.
- **Fix:** on any failure the helper calls each returned unsubscribe function, deletes `_fastRunEvidence` and `_fastRunStartPage`, and returns false. The classifier then gives `evidence_unavailable`.
- **Commit:** 9d69d3f0

### Choices within the plan's latitude

- The start page reuses the module's `parseWebUrl` (`root.URL`, http(s) only), behind the planned `/^https?:/i` pre-check.
- The hand-off marker uses 68's delivered-snapshot condition as is, which also requires a non-empty string. That is tighter than the plan's "a string `markdownSnapshot`" wording.
- The harness option mirrors the production guard (`session.fastMode` and a loaded module), so the switch-off golden run with the option still equals the golden.

### Additions beyond the plan (strengthening, no scope change)

- Golden runs A/B/C and both run_task switch-off runs now also assert that their sessions carry no `_fastRunEvidence` or `_fastRunStartPage`.
- The real `fsbRegisterFastRunEvidence` is evaluated from background.js source on a switch-off golden harness. It returns false, and the run still equals the golden.
- The start-path suite checks that the evidence before-tool handler runs after an earlier-registered permission hook.
- The module and test header comments name the 70-03 additions.

## Known residuals (tighten-only; recorded, not fixed)

- **70-SYNC-RECHECK item p (meta-cognitive force stop).** A permission-denied last call can leave `pending` set when that iteration force-stops with `meta_cognitive_loop_break`. The outcome then reads ambiguous instead of blocked. Production permission denials cannot happen today.
- **Drift substitution 3.** LLM failures with a null nested result (`dispatch_unconfirmed`, for example a failed get_page_snapshot or `Unknown tool`) count as uncertain. This is kept as planned and is a V4 false-`ambiguous` watch item (M-70-04).
- **A retried iteration number.** `fastIteration` is never cleared, so an LLM call in a retried iteration with the same number counts as the fast call (deferred-items.md "From 70-03" item 2).

## TDD Gate Compliance

This is a `type: execute` plan whose two tasks are `tdd="true"`, and each task prescribes one commit, so there is no separate `test(...)`/`feat(...)` pair per task. RED was observed before every implementation step:
- Task 1: 8 failing sections ("FsbFastPath.createRunEvidenceHandlers is not a function").
- Task 2: the start-path suite stopped with "fsbRegisterFastRunEvidence is a top-level function in background.js" failing. The loop suite had 12 failures before the harness option and the background helper existed.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, message, storage key or wire field. T-70-01, T-70-02, T-70-04 and T-70-07 are mitigated as planned. The two new session fields are memory only and are in no persistence allowlist; the "no _fastRun persistence" source checks guard that.

## Deferred to Validation Block

- Deferred: M-70-06 (V5). Real-page outcomes, including the background-tab hazard (a Jev-chosen step must show an observed effect before `done`). The owner also confirms or widens the PD-70-01 observation set; a widening changes only the pinned list in `tests/jev-fast-path.test.js` "page-observation tools".
- M-70-04 (V4) watch items added by this plan: the false-`ambiguous` rate from the PD-70-01 narrowing, from `dispatch_unconfirmed` LLM failures, and from the retried-iteration residual.

## Next Phase Readiness

- 70-04 can read `session._fastRunStartPage` for D-22's start-page condition.
- 70-05 reads `session._fastRunEvidence` and `runEvidenceUnresolved`. Its terminal-reason vocabulary must sit inside the marked Phase 70 section (PD-70-03).
- Open for the orchestrator: confirm or revert the PD-70-03 auto-acceptance (`6a86571c`).

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

All six modified source/test files and this SUMMARY exist; commits 6a86571c, 2da3583d and 9d69d3f0 exist on Jev; no commit message carries AI attribution; nothing was pushed; STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched.
