---
phase: 66-baseline-and-session-timing
plan: 08
subsystem: testing
tags: [benchmark, runner, mcp-sdk, cdp, claude-code, cursor-agent, abba-schedule, infra-classification, report, wilson, bootstrap, node-test]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: "stats.mjs (wilson, median, quantile, summarize, aaNoiseFloor, mulberry32), outcome.mjs (claim-blind evaluateOutcome), identity.mjs (evaluatePreflight, toolsListDigest, gitIdentity, servedModelMatches)"
  - phase: 66-baseline-and-session-timing (plan 03)
    provides: "fsb://config run identity with the Phase 66 measurement marker"
  - phase: 66-baseline-and-session-timing (plan 05)
    provides: "tasks.mjs, fixture-server.mjs, host-stream.mjs (argv builders, stream summaries, errorKind, rateLimit)"
  - phase: 66-baseline-and-session-timing (plan 06)
    provides: "get_session_detail measurement block (kind mcp or autopilot, recorded, callIntervalMs, servedModels)"
  - phase: 66-baseline-and-session-timing (plan 07)
    provides: "frozen core corpus, live set and [data-bench-marker] fixture contract"
provides:
  - "scripts/bench/lib/mcp-client.mjs: runner SDK client, server identity, fsb://config reader, run_task with progress-reset timeouts plus an exact budget timer, B-TIMEOUT session recovery, session detail retry"
  - "scripts/bench/lib/cdp.mjs: loopback CDP client on mcp/node_modules/ws: evidence reads, target cleanup, worker wake, telemetry flag read, pairing delivery"
  - "scripts/bench/lib/claude-arm.mjs: allowlisted host env (B3), shared host-CLI lifecycle with process-group kill ladder (W7, W10), headless Claude Code driver"
  - "scripts/bench/lib/cursor-arm.mjs: experimental Cursor driver on the same lifecycle (not in the baseline)"
  - "scripts/bench/lib/runs.mjs: seeded ABBA schedule, RUN_ROW_KEYS rows with validation, classifyInfra, pause rule, telemetry safety gate"
  - "scripts/bench/run-bench.mjs: CLI with --dry-run, --preflight, --smoke, --campaign, --resume, --pair-via-cdp; per-run saves; exit 75 pauses"
  - "scripts/bench/report.mjs: loadCampaign, buildSummary, renderMarkdown, writeReport and its CLI"
  - "tests/bench-drivers.test.mjs (27 cases) and tests/bench-report.test.mjs (79 cases), unregistered until 66-09"
  - "tests/fixtures/bench/run-task-provider-error.json and infra-classification-cases.json (39 synthetic cases)"
affects: [66-09, 66-10, 66-11, 71, benchmark smoke, baseline campaign, bench report]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every CLI dependency is injectable (main(argv, overrides)), so preflight, pairing, pause and resume are tested with fakes and nothing live"
    - "Argument validation collects every refusal code before any spawn, pairing or file write"
    - "Host CLIs run detached in their own process group; budget expiry sends SIGINT, SIGTERM, SIGKILL to the group, and every exit reaps the group"
    - "Raw records keep evidence and measurement blocks under gitignored .local; committed rows are rebuilt from the latest raw record of every runId and validated field by field"
    - "Error texts are classified in memory only and never stored, printed or committed"

key-files:
  created:
    - scripts/bench/lib/mcp-client.mjs
    - scripts/bench/lib/cdp.mjs
    - scripts/bench/lib/claude-arm.mjs
    - scripts/bench/lib/cursor-arm.mjs
    - scripts/bench/lib/runs.mjs
    - scripts/bench/run-bench.mjs
    - scripts/bench/report.mjs
    - tests/bench-drivers.test.mjs
    - tests/bench-report.test.mjs
    - tests/fixtures/bench/run-task-provider-error.json
    - tests/fixtures/bench/infra-classification-cases.json
  modified: []

key-decisions:
  - "run_task also gets an exact budget timer (AbortSignal): SDK 1.29 checks maxTotalTimeout only when a progress event arrives, and the heartbeat ticks every 30 s"
  - "The SDK version is read from the real package root; the exports map sends '<sdk>/package.json' to a versionless dist/cjs/package.json"
  - "A host run that used its whole budget is a task failure, not host_no_result, so timeouts stay in the completion denominator"
  - "A host run whose FSB calls never produced an MCP session, or any run whose post-window CDP read failed, is extension_not_connected (infra), not a task failure"
  - "--smoke defaults to one round (the W3 revision); the plan's flag list still said 2"
  - "order is the 1-based position in the whole campaign schedule, so drift over a campaign can be checked"
  - "Cost per completed task is the cost of every counted run divided by completed runs; infra-error runs are excluded"
  - "A resumed campaign must keep its stable identity (git sha, extension id and version, tools hash, models, task lock, schedule) or it is refused"
  - "TDD: each task has a RED test commit before its GREEN commit; the GREEN commits carry the plan's messages"

patterns-established:
  - "66-10 reads the MCP session id of a Claude run from .local/<campaignId>/runs/<runId>.json sessions[].id"
  - "Plan 66-09 appends 'tests/bench-report.test.mjs tests/bench-drivers.test.mjs' to the single bench node --test command"

requirements-completed: [MEAS-01, MEAS-03]

# Metrics
duration: 35min
completed: 2026-09-30
---

# Phase 66 Plan 08: Benchmark Runner, Arm Drivers and Baseline Report Summary

**A benchmark runner that owns the 7225 hub through its own MCP SDK client, refuses to start unless identity, hub ownership and the bench extension's telemetry opt-out all check out, runs a seeded ABBA schedule of autopilot and headless Claude Code runs on its own clock, judges each run only on fixture-server and post-window CDP evidence, saves every run the moment it ends, and pauses (exit 75) on the first usage cap, auth failure or provider failure. A report turns the saved rows into completion with Wilson CIs, wall time per completed task, labelled cost, host metrics and the A/A noise floor.**

This plan delivers the runner and report of MEAS-03 and the driver-side host metrics of MEAS-01 (D-12). No live system was touched: every test uses fakes, and the live smoke and campaign are plans 66-10 and 66-11. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched; the orchestrator owns them.

## Performance

- **Duration:** 35 min
- **Started:** 2026-09-30T09:52:25Z
- **Completed:** 2026-09-30T10:27:38Z
- **Tasks:** 3/3
- **Files:** 11 created, exactly the plan's `files_modified`; no existing file changed

## Accomplishments

- **Runner MCP client (`mcp-client.mjs`):**
  - `openRunnerClient` spawns `node mcp/build/index.js` over stdio with the SDK from `mcp/node_modules` (resolved lazily) and drains the server's stderr into a `.local` log.
  - `collectServerIdentity` reads `tools/list` across every page before digesting it.
  - `runTaskTimed` sends the plan's options (`resetTimeoutOnProgress: true`, `timeout: 60000`, `maxTotalTimeout`).
  - On a timeout it calls `get_task_status` first, then `stop_task` exactly once, then the `list_sessions` fallback (latest non-`mcp-agent` session inside [t0, t1]).
- **CDP client (`cdp.mjs`):**
  - Every `Runtime.evaluate` passes `returnByValue: true, awaitPromise: true`. An exception rejects with the fixed message `cdp_evaluate_exception`.
  - Evidence reads: core runs take the target with the most `[data-bench-marker]` elements (a tie goes to the later target); live runs match the start URL's host and keep up to 200000 characters of text in memory.
  - A sleeping worker is woken through `PUT /json/new` on the control panel, and the wake tab is closed afterwards.
  - Only loopback debugger URLs are accepted.
- **Host drivers (`claude-arm.mjs`, `cursor-arm.mjs`):**
  - `buildBenchChildEnv` copies the allowlist only, then refuses anything named `CLAUDECODE`, `CLAUDE_*` or in the 149-name `DELEGATION_PROVIDER_KEY_NAMES` list (imported from `mcp/build`).
  - Claude runs in an empty temp workdir holding only `mcp.json`, and takes the task on stdin.
  - The shared `runHostCli` lifecycle tees stdout to a 0600 raw file and keeps only a `{type}` stub for partial-message events.
  - The ladder ends in a group SIGKILL, and the group is reaped after every exit.
- **Run contract (`runs.mjs`):**
  - Seeded ABBA schedule: 240 entries for 12 tasks x 10 rounds x 2 arms.
  - `toCommittedRow` builds each row by picking named fields. `validateCommittedRow` checks exact keys at every level, types, the flag vocabulary, and that strings are at most 200 characters with no `://`.
  - `classifyInfra` only counts a number as a status after `HTTP` or `status`.
  - `pauseDecision` and `evaluateBenchSafety` (strict `true` only).
- **CLI (`run-bench.mjs`):**
  - Every argument error is listed at once and exits 2 before any side effect. That includes W9's extension-id check, which also fires with `--dry-run`.
  - `--pair-via-cdp` hands the `pair --json` code straight to `pairExtensionViaCdp`; it is never printed.
  - Preflight = `evaluatePreflight` plus the `fsbTelemetryOptOut` gate.
  - Identity records env key names and their SHA-256, Chrome launch flag names, `startTabActive: true`, the agent-policy hash, and the tool-loading modes observed in `init.tools`.
  - Per-run raw record plus an atomic `runs.jsonl` rewrite; exit 75 pauses with the exact `--resume` command; `--resume` re-runs only runIds whose latest attempt hit an infra error.
- **Report (`report.mjs`):**
  - Per set and per arm: infra errors leave the denominator and are listed by code; completion with a Wilson CI; per-task median and p90; geometric mean of the task medians; cost per completed task with sources and label.
  - FSB per-call medians, with the caller-gap and call-interval labels (W6); Claude API share, turns and the list-price label.
  - A/A floor from `stats.aaNoiseFloor`, reported as `n/a` below two rounds. Under 10 rounds the campaign is labelled `smoke (not a baseline)`; live runs are reported separately.

Sample one-round report excerpt (rendered from synthetic rows):

```
- Completion: 1/2 = 50.0% (Wilson 95% CI 9.5% to 90.5%); timed out 0
- Wall time per completed task: 42,000 ms, the geometric mean of per-task median wall times over completed runs on the runner's clock (1 task; no completed run: core-b-two)
## A/A noise floor
- core / autopilot: n/a (needs at least 2 rounds)
- core / claude FSB: 7 calls per run (median); FSB time per call 310 ms; caller gap per call 8,200 ms (upper bound on host thinking time); call interval 8,600 ms (receive-to-receive call interval; live counterpart of the 66-01 history deltas); queue wait not measured
```

## Interface notes for plans 66-09, 66-10 and 66-11

- **66-09:** add `tests/bench-report.test.mjs tests/bench-drivers.test.mjs` to the bench `node --test` command.
  - Both are Node 20-safe; together they take about 3 s (the kill-ladder cases use real 150-250 ms graces).
  - `bench-drivers` needs the compiled `mcp/build/agent-providers/spawn-environment.js` and `mcp/node_modules/ws`. Both exist in the chain once `npm --prefix mcp run build` has run earlier in it.
- **66-10:**
  - `--help` lists every flag, including `--pair-via-cdp`.
  - `--preflight` prints JSON `{ok, mode, hub:{listenerPid, serverPid, owned}, identity}`, where `identity.extension.telemetryOptOut` is the flag read over CDP. It writes no `identity.json`.
  - A smoke with no `--tasks`/`--rounds` is every task x 1 round.
  - Outputs under `scripts/bench/.local/<campaignId>/`:
    - `runs/<runId>.json` (raw record, with `sessions[].id` and `measurement`);
    - `runs/<runId>.attempt<N>.json` (superseded attempts);
    - `streams/<runId>.attempt<N>.jsonl` (host streams);
    - `progress.json` and `mcp-server.stderr.log`.
    - For a smoke, `identity.json` and `runs.jsonl` live here too.
  - Pairing refusals print `pairing_failed: <reason>`, for example `service_worker_unreachable`, `cdp_unavailable`, `pair_json_failed` or `extension_not_connected_after_pairing`.
  - Reusing a campaign id that already has saved runs is refused as `campaign_exists` unless `--resume` is given.
- **66-11:**
  - A campaign writes `identity.json` and `runs.jsonl` to `scripts/bench/results/<campaignId>/`.
  - `node scripts/bench/report.mjs <dir>` adds `summary.json` and `report.md`, and exits 1 on any invalid row. None of the four files carries `://`.
  - A resume refuses `resume_identity_mismatch` if the build, tools hash, models, task lock or schedule changed, and records each resume in `identity.resumes`.

## Task Commits

1. **Task 1: Arm drivers and clients**
   - `3f5f37f2` (test, RED): all imports missing
   - `6378fafd` (feat, GREEN): `feat(66-08): add benchmark MCP, CDP, Claude Code and Cursor drivers`
2. **Task 2: Seeded ABBA schedule, sanitized rows, run-bench CLI**
   - `f9f060e7` (test, RED): `runs.mjs` missing
   - `4bd408d5` (feat, GREEN): `feat(66-08): add seeded ABBA benchmark runner with preflight and per-run saves`
3. **Task 3: Baseline report**
   - `56c0b5f8` (test, RED): the 69 Task 2 cases pass, the 10 report cases fail
   - `a9a491b3` (feat, GREEN): `feat(66-08): add baseline benchmark report with A/A noise floor`

**Plan metadata:** the `docs(66-08)` commit that adds this SUMMARY.

## Files Created/Modified

- `scripts/bench/lib/mcp-client.mjs`: the runner's SDK client and tool helpers.
- `scripts/bench/lib/cdp.mjs`: CDP evidence, cleanup, worker wake, flag read and pairing.
- `scripts/bench/lib/claude-arm.mjs`: env allowlist, the shared host lifecycle, version probes and the Claude driver.
- `scripts/bench/lib/cursor-arm.mjs`: the experimental Cursor driver.
- `scripts/bench/lib/runs.mjs`: schedule, rows, validation, classification, pause rule and safety gate.
- `scripts/bench/run-bench.mjs`: the CLI, arms, executor, loop, identity and preflight.
- `scripts/bench/report.mjs`: the report library and CLI.
- `tests/bench-drivers.test.mjs`: 27 cases with fake CLIs, a fake MCP client and a ws CDP stub.
- `tests/bench-report.test.mjs`: 79 cases. 39 are classification cases, and the in-process runner cases use injected fakes.
- `tests/fixtures/bench/run-task-provider-error.json` and `infra-classification-cases.json`: synthetic fixtures, each with a `_fixture` note.

## Decisions Made

- **Raw records** keep:
  - the session ids and 66-06 measurement blocks;
  - the host summary;
  - the safe run_task fields (status, partial outcome, sw_evicted);
  - the evidence (request bodies, final URL, markers, live text) under `.local` only.

  They never keep the full session detail, the run_task error, or the session's terminal error text.
- **Host session selection:** the Claude arm takes `mcp-agent` sessions whose start falls in [t0, t1 or exit]. When there are several, it uses the one with the most calls and flags `multiple_mcp_sessions`. Journal sessions are indexed when they are created (`isNew` in `mcp-lattice-journal.js`), so they can be listed right after the host exits.
- **Autopilot start failure:** if `open_tab` fails, the run never starts. It is classified from its text (`extension_not_connected`, `fsb_agent_cap`, ...), and otherwise as `spawn_failed`.
- **Arm crash:** an exception thrown inside an arm is `spawn_failed`. The error name and a bounded message go into the raw record for debugging.
- **Telemetry refusal detail:** `false` gives 'false', `undefined` gives 'absent', and anything else (null, the string 'true') gives 'unverifiable'.
- **Stderr tail:** the host's stderr tail is appended to the raw stream file as one `_bench_stderr_tail` NDJSON line, so the file stays one valid NDJSON artifact per run.
- **Identity tool loading:** `hosts.claude.toolLoadingObserved` collects the tool-loading modes that runs actually report in `init.tools` (D-18). `toolSearchEnv` records the launched `ENABLE_TOOL_SEARCH`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The SDK version would always read as undefined**
- **Found during:** Task 1
- **Issue:** RESEARCH's `require('@modelcontextprotocol/sdk/package.json').version` goes through the SDK's `./*` exports map to `dist/cjs/package.json`, which has no version (verified: it printed `undefined`).
- **Fix:** `resolveSdk` resolves the client entry, then walks up to the package root whose `name` is `@modelcontextprotocol/sdk`.
- **Files modified:** `scripts/bench/lib/mcp-client.mjs`
- **Committed in:** `6378fafd`

**2. [Rule 1 - Bug] run_task could overrun its budget by up to 30 s**
- **Found during:** Task 1 (read from SDK 1.29 `protocol.js`)
- **Issue:** `maxTotalTimeout` is checked only inside `_resetTimeout`, which runs when a progress notification arrives (every 30 s). A 300 s budget could therefore end anywhere up to 330 s.
- **Fix:** an AbortSignal timer at exactly `budgetMs` is combined with the runner's stop signal and passed as `signal`. The plan's four options are passed unchanged.
- **Verification:** the case "runTaskTimed enforces the budget itself when no progress event arrives" passes.
- **Committed in:** `6378fafd`

**3. [Rule 2 - Missing critical functionality] Some infra failures would have counted as task failures**
- **Found during:** Task 2 review of live paths
- **Issue, extension disconnected with Chrome still up:** Claude's FSB calls never reach the extension, so no journal session exists, and the run would count as a failure. Runs alternate between arms (ABBA), so each Claude failure would reset the "two consecutive infra errors" count and the campaign would never pause.
- **Issue, Chrome gone:** the post-window CDP read fails, and every run would become a task failure.
- **Fix:**
  - A host run whose FSB calls produced no MCP session in the window is `extension_not_connected`. `classifyInfra` gains an additive `sessionMatch` input, so a session that was found but whose detail could not be read is not misclassified.
  - A failed evidence read is `extension_not_connected` too.
- **Verification:** three new classification cases, and an executor case for a thrown and a flagged evidence read.
- **Committed in:** `4bd408d5`

**4. [Rule 2 - Missing critical functionality] Campaign-directory and resume safety**
- **Found during:** Task 2
- **Issue:** starting a new campaign under an existing id would mix two campaigns' runs, and a resume on a different build would mix measurements.
- **Fix:**
  - `campaign_exists` refuses a non-resume start when runs are already saved.
  - `resume_not_found` refuses a resume with nothing to continue.
  - `resume_identity_mismatch` compares the stable identity fields; resumes are appended to `identity.resumes`.
- **Committed in:** `4bd408d5`

**5. [Rule 2 - Security] CDP input hardening**
- **Found during:** Task 1
- **Fix:**
  - `evaluate` accepts only loopback `ws://` debugger URLs.
  - Storage keys must match `^[A-Za-z0-9_]{1,64}$` before one is written into an expression.
  - `/json/close` ids are pattern-checked.
  - A run token must match the fixture server's pattern.
- **Committed in:** `6378fafd`

**6. [Rule 1 - Bug] Test-data errors in the RED commits, fixed in GREEN**
- **Task 1:** the sentinel pairing code was 42 characters after `fsb-auth.`, one short of the real 43, so the validator rightly refused it. The env-metadata check compared values against key names, and the short value `'1'` appeared in the SHA-256 hex.
- **Task 3:** the plan says "120 rows (3 tasks x 10 rounds x 2 arms)", but 3 x 10 x 2 is 60. The test keeps 120 rows and 10 rounds by using 6 tasks.
- **Committed in:** `6378fafd`, `a9a491b3`

### Execution notes (not rule deviations)

- **Smoke rounds:** the plan's flag list says `--rounds N (smoke 2, campaign 10)`, while its W3 revision says a smoke defaults to `--rounds 1`. 66-10 depends on 12 x 1 x 2 = 24 runs, so the default is 1.
- **Host timeout without a result:** such a run is a task failure (null), not `host_no_result`. Otherwise timed-out Claude runs would leave the denominator and inflate completion. A cap, auth or API error signal still wins, and so does a missing init.
- **Additive exports:**
  - `claude-arm.mjs`: `runHostCli`, `hostVersion`, `BENCH_ENV_ALLOWLIST`, `TOOL_SEARCH_MODES`
  - `cdp.mjs`: `evaluate`, `listTargets`, `findExtensionWorker`, `LIVE_TEXT_MAX_CHARS`
  - `mcp-client.mjs`: `resolveSdk`, `isRequestTimeoutError`, constants
  - `runs.mjs`: `pauseDecision`, `servedModelMatch`, `RUN_FLAGS`, `ARMS`, `HOST_ARMS`, `CAMPAIGN_ID_PATTERN`
  - `run-bench.mjs`: `main`, `parseArgs`, `resolveOptions`, `createRunExecutor`, `runCampaignLoop`, the two arm runners, `readPairingCode`, `readHubListenerPid`, `buildResumeCommand`, `loadLatestRawRecords`, `defaultDeps`
  - `report.mjs`: labels and constants
- **`classifyInfra` inputs:** besides the plan's list, it accepts `startFailed` and `sessionMatch`.
- **Branch checks:** the executor's `worktree-agent-*` allow-list was skipped, because the orchestrator directs commits on `Jev`. The cwd-drift sentinel and the protected-branch deny-list ran before every commit.

---

**Total deviations:** 6 auto-fixed (3 Rule 1, 3 Rule 2).
**Impact on plan:**
- Each fix keeps a measurement honest: an exact budget, the true SDK version, no infra failure counted as a task failure, and no mixed campaigns. The CDP fix closes an input path.
- The footprint is exactly the plan's 11 files.

## TDD Gate Compliance

Every task is `tdd="true"`, and each has a `test(66-08)` RED commit before its `feat(66-08)` GREEN commit: `3f5f37f2` then `6378fafd`, `f9f060e7` then `4bd408d5`, and `56c0b5f8` then `a9a491b3`. The new suites are not in the `npm test` chain until 66-09, so a RED commit cannot turn the chain red. The plan type is `execute`, so the plan-level gate does not apply.

## Verification Evidence

- **Plan `<verification>`:**
  - `node --test tests/bench-report.test.mjs` passes 79/79.
  - The sample dry run prints `"runs":4`.
  - `--smoke --arms claude` with no model exits 2 with `claude_model_required` and `extension_id_invalid`.
  - `git status --porcelain -- mcp/` is empty.
- **Task verify commands:** all exit 0, including the driver-export `node -e` check and the W-A/W-B classifier `node -e` check.
- **Acceptance greps:**

  | Check | Result |
  |-------|--------|
  | `createRequire` in cdp.mjs | 3 |
  | global WebSocket references | 0 |
  | bypass-flag grep | empty |
  | `resetTimeoutOnProgress: true` | 1 |
  | `get_task_status` in mcp-client.mjs | 4 |
  | `awaitPromise: true` in cdp.mjs | 1 |
  | `detached: true` in claude-arm.mjs | 1 |
  | no-env-copy check | exit 0 |
  | no-print check on cdp.mjs and run-bench.mjs | exit 0 |
  | `evaluatePreflight(` / `evaluateOutcome(` in run-bench.mjs | 1 / 1 |
  | `smoke (not a baseline)` in report.mjs | 1 |
  | `COST_LABEL_LIST_PRICE` in report.mjs | 2 |
  | outcome.mjs, identity.mjs, agent-loop.js unchanged | yes |

- **Node 20.20.2** (the binary already in the local npx cache; nothing was downloaded): the two new suites pass 106/106. **Node 24.14.1:** 106/106. The driver suite was run three times in a row with no flake.
- **Regression:**
  - The seven earlier bench suites pass 218/218.
  - `tests/mcp-in-flight-session-lookup.test.js` (the one existing test that imports `scripts/bench`) passes 214/0.
- **Mutation probes:** each was applied to the committed modules and then restored byte for byte, and each was caught.
  - runs.mjs and run-bench.mjs (6): status prefix dropped, timeout without detail treated as a provider failure, attempt archiving removed, error text stored in the raw record, pausing codes no longer immediate, a truthy telemetry flag accepted.
  - report.mjs (5): infra rows kept in the denominator, the one-round A/A guard removed, the baseline threshold lowered, live rows mixed into core, row validation skipped.
- **No leftovers:**
  - no fake CLI or grandchild process survived;
  - `scripts/bench/.local/` is still empty, and `scripts/bench/results/` does not exist;
  - no tracked file was rewritten;
  - nothing ran against 7225, Chrome or a real host CLI.

## Issues Encountered

- **graphify is stale:** its graph predates `scripts/bench/` (built 2026-07), so the query returned unrelated nodes. Every anchor used here was read from the working tree.
- **Stale anchors in the plan:** it cites `extension/ws/mcp-tool-dispatcher.js` lines 2738-2756 for `handleGetStatusRoute`. The route is now at ~3180. It still returns `currentSessionId`, and `stop_task` still resolves the in-flight session from the same map.
- **Not yet proven live:** these behaviors are covered by fakes only, and 66-10 is the first live run:
  - `Runtime.evaluate` on a real MV3 service-worker target;
  - `PUT /json/new` with a `chrome-extension://` URL;
  - the real `claude` stream through this driver;
  - lsof-based hub ownership.

## Known Stubs

None. Every module is complete and wired: `run-bench.mjs` composes the real drivers, fixture server, CDP client and report inputs. The Cursor arm is intentionally experimental and runs only when `--arms` lists it.

## Threat Flags

None beyond the plan's threat register:
- `mcp-server.stderr.log` and the raw host streams are raw captures under the gitignored `.local` tree (T-66-02).
- The `lsof`, `git` and `pair --json` child processes are the read-only probes the plan names (T-66-01b, T-66-01c).

## User Setup Required

None for this plan. The bench profile, xAI key, Claude model choice and telemetry opt-out are human steps in 66-10.

## Next Phase Readiness

- **66-09:** registers the two new suites (see the interface notes).
- **66-10:** runs `--preflight --pair-via-cdp` and then the 24-run smoke. Pairing and CDP are exercised live there for the first time. If the worker wake fails, its human checkpoint offers "open the control panel once, then retry".
- **Blockers:** none.

## Self-Check: PASSED

- All 11 created files exist on disk.
- All 6 task commits exist: `3f5f37f2`, `6378fafd`, `f9f060e7`, `4bd408d5`, `56c0b5f8`, `a9a491b3`.
- No commit in `698016a1..HEAD` has a Co-Authored-By or AI attribution line.
- `git diff --name-only 698016a1..HEAD -- .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md extension mcp package.json .gitignore` and the 66-01 files is empty.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
