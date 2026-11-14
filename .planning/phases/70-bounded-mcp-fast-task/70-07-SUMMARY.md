---
phase: 70-bounded-mcp-fast-task
plan: 07
subsystem: mcp-wire-and-bench
tags: [run_task, fast-mode, typed-outcome, mcp-caller, bench, raw-record, parity, sc4, mcp-04, d-03, d-18, d-20, d-21]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01: tests/fixtures/run-task-wire-golden.json (switch-off value and wireText per settle path); 70-05: FsbFastPath.buildFastModeBlock and the frozen FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS, FAST_MODE_OUTCOMES, FAST_MODE_REASONS, FAST_MODE_HUMAN_GATES, FAST_MODE_ESCALATION_CODES; 70-06: the switched-on bridge value {...switch-off value, fast_mode} with fast_mode last"
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "tests/helpers/mcp-in-process.mjs (createInProcessClient, makeStubBridge, makeMockAgentScope, assertBuildFresh, projectShape, readBaselineFixture) and the 8a058bdf tools/list fixture"
provides:
  - "tests/mcp-run-task-fast-caller.test.mjs: a real MCP SDK Client over InMemoryTransport calls run_task with only {task} against the built server and parses both result forms"
  - "scripts/bench/lib/fast-mode.mjs: the bench-side frozen mirror (FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS, FAST_MODE_OUTCOMES) and projectFastMode(block)"
  - "scripts/bench/run-bench.mjs runAutopilotArm: runTask.fastMode on raw run records when the run_task JSON carries a plain-object fast_mode"
  - "tests/bench-fast-mode-record.test.mjs: runner projection cases, the field-by-field jev rule, committed-row and infra-classification invariance, the executor raw record, and extension/bench parity"
affects: [70-08, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A pure bench lib file mirrors an extension frozen key list; a parity test loads the extension module through createRequire and deep-equals the lists"
    - "Field-by-field projection: an unreadable count nulls the whole summary (unknown exposure), an unreadable jev_ms nulls only that field"
    - "Own-property reads inside try/catch, so a projection never throws on getters, proxies or revoked proxies"

key-files:
  created:
    - tests/mcp-run-task-fast-caller.test.mjs
    - scripts/bench/lib/fast-mode.mjs
    - tests/bench-fast-mode-record.test.mjs
    - .planning/phases/70-bounded-mcp-fast-task/70-07-SUMMARY.md
  modified:
    - scripts/bench/run-bench.mjs
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The bench mirror lives in its own pure lib file (scripts/bench/lib/fast-mode.mjs, RESEARCH Open Question 5), so RUN_ROW_KEYS, toCommittedRow, classifyAutopilot and the committed schema stay untouched"
  - "projectFastMode reads only own properties and treats an unreadable value as missing; a top-level try/catch returns the all-null projection with outcome 'other' as a last resort"
  - "An escalation key named __proto__ matches the token pattern but is dropped, never assigned, so the projected map stays a plain object"
  - "The escalation cap counts kept entries: the first 64 entries with a token key and a valid count survive, in input order"
  - "The caller suite's representative switched-on session is an uncalibrated run_task session (one decide, session latch not_calibrated), the state the shipped UNCALIBRATED profile produces"
  - "MCP-03 is advanced, not completed, by this plan; it is met only at the Phase 70 gate (70-08)"

patterns-established:
  - "runTask(nextAnswer) caller turn helper over makeStubBridge in tests/mcp-run-task-fast-caller.test.mjs"
  - "fakeDeps(timed)/armWith(json, extra) for runAutopilotArm and a createRunExecutor fake-arm run in tests/bench-fast-mode-record.test.mjs"

requirements-completed: []  # MCP-03 is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~7min
completed: 2026-10-18
---

# Phase 70 Plan 07: In-process MCP caller and bench raw record Summary

**A real MCP SDK client calls `run_task` with only `{task}` through the unchanged built server. With the switch off it gets the 70-01 golden text byte for byte on all five settle paths. With the switch on it parses `fast_mode` intact, as the last key, with no `isError`, and removing the key gives the golden bytes. The bench runner now keeps that block on raw run records as `runTask.fastMode`, projected through a frozen bench mirror of the extension's key lists (two added lines in `run-bench.mjs`), so V4 can build the typed-outcome agreement table. Committed rows are unchanged.**

## Performance

- **Duration:** about 7 minutes. Started 2026-10-18T23:28:49Z; Task 1 committed about 23:31Z, Task 2 about 23:34Z; the wave check finished 23:35Z.
- **Tasks:** 2 of 2
- **Files:** 3 created (two test suites, one bench lib file), 3 modified (`scripts/bench/run-bench.mjs`, `package.json`, `tests/delegation-phase-contract.test.js`)

## Task 1: in-process caller (`tests/mcp-run-task-fast-caller.test.mjs`, commit `84f13682`)

- **Wave build.** `npm --prefix mcp run build` ran once, before Task 1, and `git status --porcelain -- mcp/` printed nothing. The suite calls `assertBuildFresh()` first and never rebuilds.
- **Harness.**
  - `createInProcessClient({ bridge: makeStubBridge({ onSend }), agentScope: makeMockAgentScope() })`.
  - run_task needed no AgentScope method beyond the 69 mock; the 69 helper is unedited.
  - `onSend` answers `mcp:start-automation` with the prepared answer (deep-copied) and anything else with `{success:true}`.
- **Switched-on blocks.** Each comes from the real `FsbFastPath.buildFastModeBlock` (createRequire).
  - The representative session is a run_task field, a resolved run evidence record, and the measurement an uncalibrated gateway leaves: one attempt with `calibrationStatus:'uncalibrated'`, `jevCalls` 1, `jevMs` 420, escalation `not_calibrated`, and the session latch `not_calibrated`.
  - Settles per path: runtime-complete and bus-complete `success/complete_task` give done/complete_task. bus-error gives blocked/error. bus-stop `stopped/user_stopped` gives blocked/user_stopped. The safety net gives ambiguous/safety_net_timeout.
  - Example block (bus-complete): `{"outcome":"done","reason":"complete_task","uncertain_unobserved":false,"human_gate":null,"budget_profile":"run_task","jev":{"attempts":1,"calls":1,"fast_steps":0,"jev_ms":420,"calibration":"uncalibrated","latched":"not_calibrated","exhausted":null,"escalations":{"not_calibrated":1}}}`.
- **Tests (12, all pass, 0 skipped):**
  - "tools/list unchanged": run_task's `projectShape` (canonical JSON) equals the 8a058bdf fixture's. Its properties are exactly `['task']` and required is exactly `['task']`. No tool name matches `/fast|jev/i`.
  - "switch-off wire <path>" (5): exactly one bridge message, no `isError`, one text item, the text equals the golden `wireText`, and there is no `fast_mode` key.
  - "switch-on wire <path>" (5):
    - the block's keys equal `FAST_MODE_BLOCK_KEYS`, with the expected typed outcome;
    - no `isError`;
    - the parsed `fast_mode` deep-equals the block and is the last key, and `success` is true;
    - the key-set difference against the golden is exactly `['fast_mode']`;
    - `JSON.stringify(rest, null, 2)` without `fast_mode` equals the golden `wireText`.
  - "start payload unchanged":
    - with the block off and on, the single `mcp:start-automation` payload has `task === 'Tick Alpha.'` as its first key and no `/fast|jev/i` key;
    - the timeout is 600,000 ms;
    - the payload key set and key order are identical between the two runs.
- **Mutation checks (temporary copies, deleted).** Renaming the answer's key to `fast_modex` failed the 5 switch-on tests. Sending a different task text failed "start payload unchanged".
- **Acceptance.**
  - TAP: `# fail 0` once and `# skipped 0` once.
  - `grep -cE "listen\(|createServer|7225|7226|globalThis\.WebSocket"` gives 0.
  - `git diff --quiet <P70_START> -- mcp/` exits 0.
  - The command appears once in `scripts.test`, after the MCP build, and once in `REFINEMENT_ROOT_TEST_COMMANDS`.

## Task 2: bench raw record (commit `d53a5b81`)

### `scripts/bench/lib/fast-mode.mjs` (new, pure, no imports)

- **Exports.** The three lists are frozen copies of the extension's lists:
  - `FAST_MODE_BLOCK_KEYS` = `outcome, reason, uncertain_unobserved, human_gate, budget_profile, jev`;
  - `FAST_MODE_SUMMARY_KEYS` = `attempts, calls, fast_steps, jev_ms, calibration, latched, exhausted, escalations`;
  - `FAST_MODE_OUTCOMES` = `done, ambiguous, blocked, needs_confirmation`;
  - and `projectFastMode(block)`.
- **Projection rules.** The result is a fresh object with exactly the block keys, in order. Only own properties are read. A missing, `undefined` or unreadable value counts as null.
  - `outcome` is kept when it is in `FAST_MODE_OUTCOMES`, else `'other'`.
  - `reason`, `human_gate` and `budget_profile`: null stays null, a `^[a-z_]{1,40}$` string is kept, anything else becomes `'other'`.
  - `uncertain_unobserved` is true, false or null; anything else is null.
  - `jev` is judged field by field:
    - It is null when the input is not a plain object, or when any of `attempts`, `calls` or `fast_steps` fails `Number.isInteger(n) && n >= 0`. An unreadable count is unknown exposure; 0 is a real count.
    - `jev_ms` is kept when it is a finite number >= 0, else null for that field only, so a null `jev_ms` never nulls `jev`.
    - `calibration`, `latched` and `exhausted` follow the token rule.
    - `escalations` keeps the first 64 entries whose key matches the token pattern (never `__proto__`) and whose count is a non-negative integer. A missing or non-object map gives `{}`.
    - Extra keys are dropped.
  - It never throws: there is a per-field try/catch, a safe `isPlainObject` for revoked proxies, and a top-level fallback.

### `scripts/bench/run-bench.mjs` (exactly 2 added lines, 0 removed)

- `import { projectFastMode } from './lib/fast-mode.mjs';` sits after the cursor-arm import.
- `if (json && isPlainObject(json.fast_mode)) runTask.fastMode = projectFastMode(json.fast_mode);` sits immediately after the `runTask` literal in `runAutopilotArm`, before the aborted branch, so both branches carry it.
- The raw record already copies `runTask` verbatim. Nothing else changed.

### `tests/bench-fast-mode-record.test.mjs` (8 tests; RED, then GREEN)

- **RED.** First the missing module (`ERR_MODULE_NOT_FOUND`). With the lib in place but before the runner edit, 2 failures: "runTask.fastMode only for a plain-object block" and the executor raw-record test. **GREEN:** 8/8.
- "runTask.fastMode only for a plain-object block", run for a finished run and an aborted run:
  - With a block, the keys are `isError, status, partialOutcome, swEvicted, sessionIdSource, fastMode`. `fastMode` deep-equals `projectFastMode(block)` and is a fresh object.
  - With the block absent, an array, a string or null, and with a null or array JSON, the keys are exactly the old five.
- "zero summary projects unchanged":
  - Z, U and `{...U, jev_ms:null}` project unchanged, with byte-equal JSON.
  - The real `buildFastModeBlock` for the no-jevMeasurement session gives `jev` = Z and projects unchanged.
  - For each of the three counts, `-1`, `1.5`, `'1'`, `NaN` and missing give `jev: null`.
  - `jev_ms` `-5`, `Infinity`, `'420'` and `NaN` give `jev_ms: null` with the rest kept, and `jev_ms: 0` is kept.
- "projection rules for the top level, jev and escalations": the token, tri-state and outcome rules, the 64-entry cap in order, dropped invalid entries, the `__proto__` key, and no shared objects between input and output.
- "projectFastMode never throws": the inputs were undefined, null, a string, a number, an array, a proxy that throws on get, a throwing getter, and a `jev` proxy or `escalations` proxy whose ownKeys throws. One unreadable field never loses the others.
- "no page content": hostile keys and strings (`P70-MARKER-TASK`, a URL with a query token, a 200-character reason, marker escalation keys) appear nowhere in the projected JSON. `escalations` keeps only `timeout`.
- "committed row unchanged":
  - `RUN_ROW_KEYS` is unchanged.
  - `toCommittedRow` with and without `runTask.fastMode` deep-equals, and `validateCommittedRow` gives `{ok:true}`.
  - No block field reaches the row.
  - `classifyInfra({arm:'autopilot', ...})` gives the same label with and without `fast_mode` for 5 JSON shapes x timedOut. The block's reason held pattern-matching text (`AGENT_CAP_REACHED`, `Extension disconnected`, `extension_not_connected`, `API call failed:`), and the label still did not change.
- "raw record carries runTask.fastMode through the run executor": `createRunExecutor` with a fake autopilot arm that calls the real `runAutopilotArm`.
  - The raw record keeps the projected block.
  - The off-run keeps the old keys.
  - `claimed` and `infraError` are equal, and the committed rows are identical and valid.
- "parity":
  - The bench lists deep-equal the extension's `FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS` and `FAST_MODE_OUTCOMES`, and all three bench lists are frozen.
  - Every producer code (all reasons, human gates, the 69 escalation codes, the budget profile names, the calibration statuses) fits `^[a-z_]{1,40}$`.
  - Every outcome/reason pair projects unchanged, and producer escalation codes survive.
- **Mutation check** (reverted, file restored byte-for-byte). Replacing `isPlainObject(json.fast_mode)` with a truthiness check failed "runTask.fastMode only for a plain-object block".

## Registration positions

- `package.json` `scripts.test` now has **346** ` && `-joined commands; `npm --prefix mcp run build` is still at 0-based index 12.
  - `node --test tests/mcp-run-task-fast-caller.test.mjs` is at index **344**, the next-to-last command.
  - `node --test tests/bench-fast-mode-record.test.mjs` is at index **345**, the last command.
  - Each appears exactly once.
- `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js`) ends with the same two entries (lines 201 and 202), each once. `PRE_PHASE6x` hashes were not touched. The contract suite gives 1252 passed, 0 failed.

## Per-task `<automated>` wall times (Node 24.14.1)

- **Task 1:** 0.66 s. This covers the caller suite (12/0), the 69 shape freeze (124/0), delegation-phase-contract (1251/0) and the `mcp/` porcelain check. `node --test tests/mcp-expect-caller.test.mjs` also passes (12/0).
- **Task 2:** 2.50 s. This covers the bench-fast-mode-record, bench-report, bench-drivers and bench-identity suites (140/0), delegation-phase-contract (1252/0), and `git diff --quiet HEAD~1 -- scripts/bench/lib/runs.mjs scripts/bench/tasks/ scripts/bench/shadow/`.

## Pin preflight, sweep and wave check

- **Preflight (D-25).**
  - The only source-text pin on `run-bench.mjs` is `tests/bench-report.test.mjs:586-591` (the pairing-code print ban). It passes.
  - No test pins the list of files under `scripts/bench/lib/`. The directory walks in bench-corpus and bench-report cover fixtures and temp dirs only. So no pin was bumped.
- **Sweep.** `--files scripts/bench/run-bench.mjs scripts/bench/lib/fast-mode.mjs` against `70-SWEEP-BASELINE.json` ran in the background: **17/17 passed, no new failures, exit 0**. It reported 7225 held by the user's hub (pid 7109), which was left alone. `git status --short showcase/angular/public` printed nothing.
- **Wave check.**
  - `npx --offline -y node@20 --test tests/mcp-run-task-fast-caller.test.mjs tests/bench-fast-mode-record.test.mjs` exits 0 (v20.20.2, 20/0).
  - The official Node 20.20.2 binary runs the run-bench pin bundle plus the caller suite at 152/0, the shape freeze at 124/0, delegation-phase-contract at 1252/0 and mcp-expect-caller at 12/0.
  - `git status --porcelain -- mcp/` is empty.
- **Other checks.** `tests/jev-run-task-upstream-contract.test.js` (87/0), `tests/run-task-fast-mode-wire.test.js` (0 failed) and `tests/jev-run-task-outcome.test.js` (785/0) still pass.
- **Untouched.** `scripts/bench/lib/runs.mjs`, `scripts/bench/tasks/`, `scripts/bench/shadow/`, every `mcp/` file, the extension, the 69 helper and the 70-01 golden fixture.

## For Phase 71

- The typed outcome travels at **`fast_mode.outcome`** on the `run_task` wire, present only when the Advanced Settings switch was on when the task started.
- In raw bench records it is at **`runTask.fastMode.outcome`**, together with `reason`, `uncertain_unobserved`, `human_gate`, `budget_profile` and the `jev` summary.
- `status` is unchanged (`success`, `partial`, `stopped`, `error` or `completed`), so `claimed.status` never carries the typed words.
- Committed rows and `RUN_ROW_KEYS` (schema 1) do not carry the block; any committed projection is Phase 71's (its D-08 v2 row).
- **Exposure rule.**
  - A non-null `runTask.fastMode.jev` is known exposure, including the zero summary and a summary with `jev_ms: null`.
  - `jev: null` means unknown exposure, which happens only when the producer's summary was missing or a count was unreadable.
  - A run with no `runTask.fastMode` was not switched on, or its result carried no block.
- **What to import.** Read the key lists from `scripts/bench/lib/fast-mode.mjs` (`FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS`, `FAST_MODE_OUTCOMES`, `projectFastMode`); the parity test guards them against the extension.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Choices within the plan's latitude (recorded, no scope change)

1. **`__proto__` escalation key dropped** [Rule 2, hardening]. It matches `^[a-z_]{1,40}$`, but assigning it to a plain object would change the prototype instead of creating a key. It is never a producer code; the parity test checks this. Dropping it keeps the projected map a plain object.
2. **Own-property reads and a safe `isPlainObject`.** "Never throws" also covers throwing getters, proxy traps and revoked proxies. A value that cannot be read counts as missing (null), and a last-resort top-level catch returns the all-null projection with `outcome:'other'`.
3. **Extra tests beyond the named five.**
   - "projection rules for the top level, jev and escalations" and "projectFastMode never throws".
   - "raw record carries runTask.fastMode through the run executor", which proves the verbatim raw-record copy end to end through `createRunExecutor` with fakes.
   - The parity test also checks that every producer code fits the bench token rule, so a real block never loses a value to `'other'`.
4. **classifyAutopilot is exercised through the exported `classifyInfra({arm:'autopilot'})`.** `classifyAutopilot` itself is not exported, and runs.mjs is unchanged.
5. **Sweep file list.** The sweep also named the new `scripts/bench/lib/fast-mode.mjs`. It has no baseline entries, so this only added the new suite to the selection.

### Auto-fixed issues

None. One assertion in the RED draft of "committed row unchanged" searched the row JSON for the substring `fast` and matched the test's own campaign id `cmp-fast`. It was narrowed to the block's field names before the GREEN commit, without changing the source.

## TDD Gate Compliance

This is a `type: execute` plan whose tasks are `tdd="true"`. Each task prescribes one commit, as in 70-03, 70-05 and 70-06.
- **Task 1 (`test(70-07)`).** It proves existing behaviour: no MCP change is needed (D-03), so no RED against new code was possible. The mutation checks above show the suite fails when the block is dropped or the payload changes.
- **Task 2 (`feat(70-07)`).**
  - RED was observed twice before the implementation was committed: first the missing module, then the 2 runner failures with the lib present.
  - GREEN gave 8/8.
  - The tests and the implementation landed together in the single prescribed commit.

## Known Stubs

None.

## Threat Flags

None. The new surfaces are both in the plan's threat model.
- **T-70-07** (MCP wire). The in-process caller runs the goldens, the key-set, last-key and byte checks, the payload and schema checks, and the empty `mcp/` diff.
- **T-70-02** (bench raw record). `projectFastMode` keeps the frozen keys, closed or token strings and the bounded escalation map; the parity test and the marker scan back it.
- Raw records stay in the gitignored `scripts/bench/.local/`.

## Deferred to Validation Block

Deferred: M-70-04 (V4), M-70-05 (V5), M-70-07 (V6).
- **M-70-04 (V4):** the typed-outcome agreement table, built from raw `runTask.fastMode` records against the code-verified outcome checker. Any `done` on a checker-failed run is a gate input. Runs over 60 s are counted per arm.
- **M-70-05 (V5):** Claude Code, Codex and Cursor parse a switched-on `run_task` result.
- **M-70-07 (V6):** a release with no MCP package change. The owner also confirms the recorded 2026-10-16 D-17 amendment that accepts the switch-on `fast_mode` result key under MCP-04.

## Next Phase Readiness

- Plan 70-08 (the phase gate) can run the full chain. Both new suites sit at its end, after the MCP build, and pass on Node 24 and Node 20.
- The phase gate still runs `npm run test:mcp-smoke` for the `mcp:start-automation` payload pin (`tests/mcp-tool-smoke.test.js:327-332`), which is outside `npm test`.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

- The two suites, the bench lib file and this SUMMARY exist.
- Commits 84f13682 and d53a5b81 exist on Jev, and neither message carries AI attribution. Nothing was pushed.
- The example block under Task 1 was re-derived from a live `buildFastModeBlock` run.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched (the orchestrator owns them).
