---
phase: 70-bounded-mcp-fast-task
plan: 08
subsystem: phase gate (verification only)
tags: [run_task, fast-mode, phase-gate, tolerant-chain, node20, footprint-audit, registration-audit, inversion-audit, validation, mcp-03, mcp-04, d-01, d-02, d-05, d-20, d-24, d-25]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01..70-07: every Phase 70 suite, fixture, golden and code change; 70-SYNC-RECHECK.md (P70_START 3f7efb0a, item r hashes, item s counts); 70-SWEEP-BASELINE.json"
  - phase: 68-autopilot-fast-mode
    provides: "68-11 gate: the newest per-command tolerant pass (/tmp/fsb-68-11/fsb-gate-68.jsonl, 356 commands, all exit 0), the tolerant runner and the verified Node 20.20.2 binary"
provides:
  - ".planning/phases/70-bounded-mcp-fast-task/70-VALIDATION.md: status complete, wave_0_complete true, all 21 Per-Task Verification Map rows green with named checks (167 names verified against the logs), 9 row-text corrections, 1 command extension, Wave 0 and sign-off ticks, the dated Manual-Only deferral line"
  - "Phase 70 gate evidence: tolerant chain 362/362 at exit 0, validate:extension exit 0, MCP tool smoke and in-process callers after a fresh build, Node 20 runs, and clean footprint, hash, registration and inversion audits"
affects: [71, V1, V2, V3, V4, V5, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-by-row gate: each verification-map row's exact command runs into its own log, and the Status cell quotes check names that a script confirmed are present in those logs"
    - "Golden replay by git archive: a frozen suite is re-run at every commit since it landed, in /tmp exports, without touching the working tree"

key-files:
  created:
    - .planning/phases/70-bounded-mcp-fast-task/70-08-SUMMARY.md
  modified:
    - .planning/phases/70-bounded-mcp-fast-task/70-VALIDATION.md

key-decisions:
  - "Port 7225 was held by the user's npx fsb-mcp hub (PID 7109) and 7226 was free, so the chain ran in tolerant mode against the 68-11 per-command pass, the newest one recorded in a prior SUMMARY"
  - "Nine row texts were corrected to the mechanism the code uses, and row MCP-03-a's command gained tests/jev-fast-path.test.js, which holds its run_task switch-off-mid-run proof. No code changed."
  - "The sign-off item 'switch-off goldens green through every commit; the full chain green from the phase's first commit' stays unticked: the golden half holds at all 23 commits, but the full chain ran only at this gate"
  - "MCP-03 is met at this gate: every row that proves it is green; the human, live, production and spend checks stay deferred to V1-V6"

patterns-established:
  - "Phase gates replay a frozen golden suite per commit from git archive exports when a sign-off claims 'green through every commit'"

requirements-completed: [MCP-03]

# Metrics
duration: 18min
completed: 2026-10-18
---

# Phase 70 Plan 08: Phase 70 gate Summary

**Phase 70 passes its automated gate.**
- **Full chain:** tolerant mode, because the user's hub holds port 7225. All 362 commands exit 0 (16 pretest, 346 test). The 356 commands from the 68-11 gate keep exit 0, and the 6 Phase 70 commands exit 0.
- **validate:extension:** exit 0.
- **MCP side:** after a fresh `npm --prefix mcp run build`, `tests/mcp-tool-smoke.test.js` (307/0, including the `mcp:start-automation` payload pin), the 69 shape freeze (124/0) and both in-process caller suites (24/0) pass, and `git status --porcelain -- mcp/` is empty.
- **Node 20:** all 11 Phase 70 and extended suites pass on the official Node 20.20.2 binary and under `npx --offline -y node@20`.
- **Audits:** 0 footprint violations over 59 paths in 26 `(70-` commits, no forbidden-path diff since P70_START, 0 `importScripts` lines changed, and both item r hashes match. Each Phase 70 command is registered exactly once in each list, and no `PRE_PHASE6x` line changed. No 68 check was removed without a same-intent replacement.
- **70-VALIDATION.md:** all 21 rows are green with verified check names. All nine Manual-Only rows stay deferred to V1-V6.

## Performance

- **Duration:** about 18 min
- **Started:** 2026-10-18T23:37:27Z
- **Completed:** 2026-10-18T23:55Z
- **Tasks:** 2 of 2
- **Files modified:** 1 (`70-VALIDATION.md`), plus this SUMMARY

## Task 1 evidence: chain, validate:extension, MCP side, Node 20 and the audits

All logs are under `/tmp/fsb-70-08/`.

### Ports (step 1)

- `lsof -nP -iTCP:7225 -sTCP:LISTEN`: `node /Users/lakshman/.npm/_npx/d92c25bff7522293/node_modules/.bin/fsb-mcp` (PID 7109, parent 7085), the user's hub. Not touched.
- `lsof -nP -iTCP:7226 -sTCP:LISTEN`: free. `tests/mcp-install-platforms.test.js` therefore ran and exited 0 (T46, 21.1 s).

### Chain (step 2): tolerant mode

- **validate:extension:** `npm run validate:extension` exits 0. Its last line is `write-activation-evidence: 16 passed, 0 failed` (`validate-extension.log`).
- **Command:** `node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-gate-70`, run in the background and waited for. This is the 67-13 method: `scripts.pretest`, then `scripts.test`, split on ` && `; each command runs through `/bin/sh -c` from the repo root, with stdin from /dev/null and `node_modules/.bin` first on PATH, and the run continues past failures. Rows are in `/tmp/fsb-gate-70.jsonl`, copied to `/tmp/fsb-70-08/`.
- **Runner exit:** 0. Total command time 273.2 s. No command timed out or was signalled.
- **Baseline:** the newest per-command pass in a prior SUMMARY is 68-11's, `/tmp/fsb-68-11/fsb-gate-68.jsonl` (356 commands, all exit 0). `/tmp/fsb-gate-68.jsonl` was rewritten later that day, but it has the same 356 commands and the same exit codes.
- **Comparison** (`/tmp/fsb-70-08/compare.mjs`, exit 0):
  `{"baseline":356,"current":362,"nonzeroCurrent":0,"nonzeroBaseline":0,"phase70Commands":6,"phase70Failures":0,"changedExitCodes":0,"newFailures":0,"baselineCommandsMissingNow":0,"signalled":0,"timedOut":0,"totalSeconds":273.2}`
  - No pre-existing command changed its exit code, no baseline command is missing, there is no new failure, and no port-bound suite went red. There is no pre-existing failure to record.
- **Phase 70 commands in the chain:**

  | Id | Command | Exit | Time |
  | --- | --- | --- | --- |
  | T341 | `node tests/jev-run-task-upstream-contract.test.js` | 0 | 116 ms |
  | T342 | `node tests/run-task-fast-mode-wire.test.js` | 0 | 121 ms |
  | T343 | `node tests/jev-run-task-disclosure.test.js` | 0 | 112 ms |
  | T344 | `node tests/jev-run-task-outcome.test.js` | 0 | 94 ms |
  | T345 | `node --test tests/mcp-run-task-fast-caller.test.mjs` | 0 | 326 ms |
  | T346 | `node --test tests/bench-fast-mode-record.test.mjs` | 0 | 204 ms |

- **Crawler files:** `tests/showcase-build-smoke.test.js` (T104, exit 0, 23.4 s) rewrote the three crawler files. `git checkout -- showcase/angular/public/llms.txt showcase/angular/public/llms-full.txt showcase/angular/public/sitemap.xml` restored them. Afterwards `git status --short showcase/angular/public` printed nothing, and `git status --porcelain --untracked-files=no` was empty.

### MCP side (step 3)

- `npm --prefix mcp run build`: exit 0.
- `node tests/mcp-tool-smoke.test.js`: exit 0, `=== Results: 307 passed, 0 failed ===`. The payload pin passes: `run_task routes through mcp:start-automation with task payload (Phase 238 includes agentId; Phase 240 strengthens with ownershipToken)`. It was run directly, because `npm run test:mcp-smoke` starts with the known pre-existing local failure `tests/mcp-lifecycle-smoke.test.js`.
- `node tests/mcp-tools-list-shape-freeze.test.js`: exit 0, 124/0.
- `node --test tests/mcp-expect-caller.test.mjs tests/mcp-run-task-fast-caller.test.mjs`: exit 0, 24 tests, 24 pass, 0 skipped.
- `git status --porcelain -- mcp/`: empty.
- **Task 1 `<verify>` line:** exits 0 in 30 s.

### Node 20 (step 4)

- **Binary:** `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node` reports `v20.20.2`. Its SHA-256 is `38de4fc456c0c439bac48c727d378f749abb4e31f4116703bb1ee9a746fccbb6`, the value 68-11 recorded. The tarball `node-v20.20.2-darwin-arm64.tar.gz` hashes to `466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6`, which equals its line in the adjacent `SHASUMS256.txt`. Nothing was downloaded or installed.
- **Results with that binary first on PATH** (logs `node20-*.log`):

  | Command | Result |
  | --- | --- |
  | `node tests/jev-run-task-upstream-contract.test.js` | 87 passed, 0 failed |
  | `node tests/run-task-fast-mode-wire.test.js` | 77 passed, 0 failed |
  | `node tests/jev-run-task-disclosure.test.js` | 51 passed, 0 failed |
  | `node tests/jev-run-task-outcome.test.js` | 785 passed, 0 failed |
  | `node --test tests/mcp-run-task-fast-caller.test.mjs` | pass 12, fail 0 (after the step 3 build) |
  | `node --test tests/bench-fast-mode-record.test.mjs` | pass 8, fail 0 |
  | `node tests/jev-fast-path.test.js` | 1269 passed, 0 failed |
  | `node tests/jev-fast-start-path.test.js` | 194 passed, 0 failed |
  | `node tests/jev-fast-loop.test.js` | 478 passed, 0 failed |
  | `node tests/jev-fast-measurement.test.js` | 94 passed, 0 failed |
  | `node tests/jev-extension-boundary.test.js` | 198 passed, 0 failed |

- **Row ALL-c as written** (`npx --offline -y node@20`, which resolves to v20.20.2 at `~/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node`) also exits 0.
- **Static scan:** a grep of the six new suites, `scripts/bench/lib/fast-mode.mjs` and the golden fixture finds none of these: `.listen(`, `createServer`, `WebSocket`, `navigator.`, `import.meta.dirname/filename`, `process.getBuiltinModule`, `Iterator.from`, `Promise.try`, `Array.fromAsync`, `RegExp.escape`, `Object.groupBy`, `Map.groupBy`, `Promise.withResolvers`, the new Set methods, `7225` or `7226`.

### Footprint audit (step 5, row ALL-a)

Run by `/tmp/fsb-70-08/footprint.sh`, log `footprint.log`.
- **Commit scope:** `P70_START=3f7efb0ac7aae5607b97f0e5c3b26f41733a3e8e`. There are 26 commits in `P70_START..HEAD`, and all 26 carry `(70-`.
- **Paths:** 59 path entries were checked, with 0 violations and 0 informational `.planning/` paths. The distinct paths are:
  - `extension/ai/jev-fast-path.js`, `extension/background.js` and `extension/ws/mcp-bridge-client.js`;
  - `scripts/bench/run-bench.mjs` and `scripts/bench/lib/fast-mode.mjs`;
  - `package.json`;
  - under `tests/`: `bench-fast-mode-record.test.mjs`, `delegation-phase-contract.test.js`, `fixtures/agent-loop-fast-harness.js`, `fixtures/run-task-wire-golden.json`, `jev-fast-loop.test.js`, `jev-fast-path.test.js`, `jev-fast-start-path.test.js`, `jev-run-task-disclosure.test.js`, `jev-run-task-outcome.test.js`, `jev-run-task-upstream-contract.test.js`, `mcp-run-task-fast-caller.test.mjs` and `run-task-fast-mode-wire.test.js`;
  - files in the phase directory.
- **Forbidden paths:** `git diff --quiet "$P70_START"..HEAD` exits 0 over:
  - `mcp/`;
  - `extension/ai/agent-loop.js`, `tool-definitions.js`, `ai-integration.js`, `jev-state.js`, `jev-client.js` and `jev-policy.js`;
  - `extension/ui/` and `extension/content/`;
  - `showcase/`;
  - `scripts/bench/tasks/`, `scripts/bench/shadow/` and `scripts/bench/lib/runs.mjs`.

  It also exits 0 over the row's own `showcase/angular/src/locale/`, `showcase/angular/src/app/pages/privacy/` and `showcase/server/src/jev/profiles/`.
- **importScripts:** `git diff "$P70_START"..HEAD -- extension/background.js | grep -E "^[-+]" | grep -c importScripts` prints `0`. At HEAD there are 338 tokens and 334 call sites, and the lattice pins read `expected: 338, got: 338` and `expected: 334, got: 334`.
- **Item r hashes** (`slice-hashes.mjs`, using the 68 item-h slicing):
  - `MATCH createSessionHooks extension/background.js:4779-4810 bytes=1347 decls=1 sha256=10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780`
  - `MATCH extension/ai/agent-loop.js (whole file) sha256=699946b2e0d9a734715e3130e66d1446737fde123f5a36dccf4c6e31c5e785f0`
- **Switch key:** `grep -n "fsbJevFastModeEnabled" extension/ws/mcp-bridge-client.js` prints nothing.
- **FsbJev callers:** `grep -rl "FsbJev" extension/ | grep -v "extension/ai/jev-"` prints nothing.
- **jev-fast-path.js criteria:** each of these has 0 matches, checked with JS regexes so `\b` is exact: `chrome.`, `localStorage`, `importScripts`, `https://`, `setTimeout`, `setInterval`, `systemone`, `api.typesafe.ai`, `\bJEV_[A-Z_]+\b`, `meetsThreshold`, `probabilities`, `.threshold\b`, `hadEffect`, `estimateCost`, `totalCost`, `getHashKey`, and any top-level `const|let|class|function|var`.
- **agent-loop.js pins:** 8 `setTimeout` tokens, one `stepName: 'LLM_TURN'` and one `stepName: 'TOOL_DISPATCH'`.
- **Pin suites:** this chain exits 0 (`step5-pins.log`):
  - `lattice-provider-bridge-smoke` (112 passed), `agent-loop-iterator-guard` and `lattice-step-emitter-smoke`;
  - `mcp-version-parity` (202/0), `mcp-bridge-client-lifecycle` (335/0), `run-task-resolve-discipline` (26/0) and `run-task-heartbeat` (17/0);
  - `node --test` of bench-report, bench-drivers and bench-identity (132/0).

### Registration audit (step 6, row ALL-b)

- `node tests/delegation-phase-contract.test.js`: exit 0, `1252 passed, 0 failed`. It prints `... appears exactly once in the refinements root chain` for each of the six Phase 70 commands.
- `/tmp/fsb-70-08/registration.cjs`: 16 pretest and 346 test commands, and 73 `REFINEMENT_ROOT_TEST_COMMANDS` entries.
  - Every Phase 70 command appears once in `scripts.test` (indexes 340-345), 0 times in pretest, and once in the refinement list.
  - The caller suite, at index 344, sits after `npm --prefix mcp run build` at index 12.
  - Both lists end with the six commands in registration order.
- `git diff "$P70_START"..HEAD -- tests/delegation-phase-contract.test.js | grep -cE "^[-+].*PRE_PHASE6[0-9]_ROOT_TEST_HASH"` prints `0`. The only changed lines in that file are the six added command strings.

### Inversion audit (step 7, D-05)

`/tmp/fsb-70-08/inversion.mjs` lists every check or section name removed from the three Phase 68 suites since P70_START (log `inversion.log`). Of 30 named removals, 10 survive verbatim, because they were moved, and 20 are gone. Each gone name has a replacement of the same intent:

| Old name (at P70_START) | New name (at HEAD) |
| --- | --- |
| start-path section `fsbFastModeSessionField (D-01, D-03, D-05)` | `fsbFastModeSessionField (D-01, D-05; Phase 70 D-04)` |
| `(true, "mcp") -> {enabled:false, stored:true, source:"mcp"} (run_task never fast-steps)` | `(true, "mcp") -> {enabled:true, stored:true, source:"mcp", budgetProfile:"run_task"}, keys in that order (...)`, plus the null and non-MCP cases |
| `a run_task follow-up gets enabled:false` | `a follow-up with source "mcp" gets the same run_task field as a start (Phase 70 D-04)` |
| `capture end to end: the run_task iteration holds a capture for the armed menu generation` | `capture end to end: the run_task first iteration (the LLM's turn) holds a capture for the armed menu generation` and `... the run_task second iteration makes its one fast attempt ...`, plus section `capture end to end: a switched-on run_task equals an autopilot session (Phase 70 D-05)` |
| loop section `run_task: fastMode {enabled:false, source:"mcp"} stays on the golden path apart from one capture arm read (D-03, D-22)` and its five checks (`the run_task session carries enabled:false`, `run_task: the command reads the capture arm exactly once ...`, `run_task: nothing is written to storage`, `run_task: apart from that one read, ... equal the golden`, `run_task: no menu request and no decide call`) | section `run_task takes an accepted fast step: the real helper field for (true, "mcp") through the real tool loop (Phase 70 D-04, D-05)`, plus section `run_task switch off: the helper gives no field, so the run equals the golden` (the `(false,'mcp')` and `(undefined,'mcp')` runs equal the off golden, touch no fast-path dependency and write nothing) |
| loop `jev-fast-path.js names no terminal tool anywhere` | `jev-fast-path.js names no terminal tool outside the marked Phase 70 section`, plus `<fn> names no terminal tool` for beforeTurn, attemptStep, evaluateDecision, buildStaticCall, afterStep, observeTools, deliverPending and flushHandoff (PD-70-03) |
| path module ban `['a terminal tool name', /complete_task\|partial_task\|fail_task/]` | `the module source contains no terminal tool name outside the marked Phase 70 section` and `the marked Phase 70 section builds no tool call (no buildStaticCall( and no toolCall)` (PD-70-03) |
| `a run_task session declines not_enabled at iteration i`, section `68-05 beforeTurn: run_task sessions are never fast (D-03)` | `hand-built disabled field declines not_enabled at iteration i`, section `68-05 beforeTurn: a hand-built disabled field declines not_enabled (D-05 of Phase 70)` |
| `capture: deps without readCaptureArm, ... make no call for a run_task session (68-05 deps unchanged)` | `... make no call on a run_task session's first turn (68-05 deps unchanged)`, plus `run_task capture equals autopilot: without the capture deps both fields decline the first turn ...` |
| `capture: a run_task session still declines not_enabled`, `capture: a run_task capture never asks Jev and takes no snapshot`, `capture: a captured run_task session never calls decide`, section `68-08 capture: a run_task bench session (D-22, D-03)` | `capture: a run_task session's first turn is the LLM's`, `capture: the run_task first-turn capture never asks Jev and takes no snapshot`, `capture: the run_task session's next turn makes its one fast attempt ... and the uncalibrated answer latches it`, `capture: after the latch the run_task session is still captured and never asks Jev again (one decide in the session, D-11)` and `run_task capture equals autopilot: on an armed fixture page ...`, in section `68-08 capture: a switched-on run_task bench session equals an autopilot session (D-22; Phase 70 D-05)` |
| `capture gate cost: an unarmed run_task command ... makes no tab, switch, menu, snapshot or decide call`, section `68-08 capture gate cost (D-03, D-22)` | `capture gate cost: an unarmed run_task command reads the arm once over 5 iterations and never the tab url, like autopilot`, plus two `run_task capture equals autopilot` log comparisons, in section `68-08 capture gate cost (D-22; Phase 70 D-05)` |
| `a bench-like goal holding a run token latches the command sensitive_goal with zero decide calls` (70-04, D-22 re-point) | `bench goal normalises and is sent: one decide whose goal is "Tick Alpha."`; the latch is still covered by `sk- key after the Open sentence`, `token in the Open URL query` and `bench goal on another page` |

The switch-off goldens stay: `tests/fixtures/jev-fast-loop-off-golden.json` is unchanged, and the off golden runs A/B/C pass. The 68-05 `not_enabled` module case stays under its new name.

### Safety re-runs (step 8)

`node tests/jev-policy-tighten-only.test.js && node tests/jev-run-task-upstream-contract.test.js && node tests/jev-extension-boundary.test.js && node tests/jev-fast-upstream-contract.test.js` exits 0. The counts are 29650/0, 87/0, 198 passed and 55/0. The tighten-only suite is unedited since P70_START.

### Extra evidence beyond the plan

- **Golden replay:** `/tmp/fsb-70-08/golden-replay.sh` exports each of the 23 commits from `c20081f5` (the golden's commit) to `43dba7b5` with `git archive` into /tmp and runs that commit's `tests/run-task-fast-mode-wire.test.js`. All 23 exit 0, with 20 `switch-off golden` checks at each (39 passed up to 70-05, then 67 and 77). The golden fixture has one commit. The working tree was not touched.
- **Latency for 70-03 and 70-04:** their SUMMARY files record no per-task wall time, so the four `<automated>` commands were timed on HEAD (Node 24): 1.24 s, 1.13 s, 2.20 s and 0.39 s. All 0 exit.

## Task 2: 70-VALIDATION.md (commit `bb805cb9`)

- **Rows:** `/tmp/fsb-70-08/run-rows.mjs` ran each row's exact automated command into its own log (`/tmp/fsb-70-08/rows/<key>.log`). All 21 exit 0, and so does the extended MCP-03-a command.
  - The sweep row selected 116 suites: `sweep: 116/116 passed; failing: none`, `sweep: NEW failures vs baseline: none`.
  - **Status cells:** each now reads `✅ green:` with the exit status, the pass counts and verbatim check names.
  - **Name check:** `check-names.cjs` confirmed that all 167 quoted names appear in the captured logs; 0 were missing.
  - **File Exists:** ✅ for every row. No row is red.
- **Frontmatter:** `status: complete`, `nyquist_compliant: true` (kept) and `wave_0_complete: true`.
- **Wave 0:** all nine checklist items are ticked, with a completion note naming the commits.
- **Sign-off:**
  - **Latency:** stays ticked. Every recorded time is under 30 s (0.08-2.50 s), and the note names the gate-timed 70-03 and 70-04 commands.
  - **Crawler, mcp/, attribution and no-push:** ticked. The `(70-` commit messages hold 0 attribution lines, and `git branch -r --contains 65a60e6a` lists nothing.
  - **D-24 "goldens green through every commit; full chain green from the first commit":** stays unticked, with its reason.
  - **Approval:** the line records the automated gate.
- **Manual-Only:** all nine rows (M-70-01..M-70-09) keep their V-tags, and none is marked done. The added line reads: "Phase 70 automated gate passed on 2026-10-18; the rows above remain deferred to the milestone-end Validation Block (V1-V6) per D-02."
- **Superseded upstream truths:** two facts the SUMMARY files record were added: the PD-70-03 narrowing of the two 68 terminal-name pins (with `CAPTURE_ONLY_FIELD`), and the Drift substitution 7 long-goal truth.
- **Reachability, known defects and handoffs:**
  - F11 now names the bench mirror.
  - Four facts were added: the 70-01 safety-net store-write observation, the 70-03/70-05 tighten-only residuals, the 70-04 Open-sentence observation for M-70-09, and the open `deferred-items.md` wording items.
- **Commit scope:** `git show --stat --format= HEAD` lists only `70-VALIDATION.md`.

## Task Commits

1. **Task 1: full chain, validate:extension, MCP tool smoke, Node 20 runs and the footprint, pin and registration audits.** Verification only, so no commit, by plan.
2. **Task 2: record results and Manual-Only deferrals in 70-VALIDATION.md.** Commit `bb805cb9` (`docs(70-08): record the Phase 70 gate results and Validation Block deferrals`).

**Plan metadata:** the `docs(70-08)` SUMMARY commit that follows.

## Deviations from Plan

### Row text corrected to match the code (never the reverse)

Task 2 step 1a requires each correction to be listed:

1. **MCP-03-a (where the switch is read).**
   - **Row said:** "The switch is still read only in the per-start settings read of `handleStartAutomation`".
   - **The code does:** inside `handleStartAutomation` that is still true. The follow-up branch reads the switch through `fsbRecomputeFastModeForFollowUp`, which since 70-02 gives a follow-up with source `'mcp'` the same `run_task` field. The fast path's per-attempt `readSwitch` (68 D-05) can only turn fast mode off.
2. **MCP-03-b (FAST_* locations and which budgets latch).**
   - **Row said:** no FAST_* name "outside the declarations, the `constants` literal and `BUDGET_PROFILES.autopilot`". It also said each of steps, calls, wall time, consecutive steps and the escalation latch "switches the task to LLM-only".
   - **70-02 does:**
     - Each name appears exactly twice, in the `constants` literal and in the autopilot profile; there is no separate declaration.
     - Steps, calls and wall time latch the command (`step_budget`, `call_budget`, `time_budget`), and three escalations latch it `escalation_latch`.
     - The consecutive cap is a `consecutive_cap` decline until the next LLM turn, not a latch.
3. **MCP-03-l (observation rule and the F14 marker).**
   - **Row said:** the marker sits "in the 68 flush helper, only on `success:true`".
   - **70-03 does:** `noteHandoffObservation` is called only inside `deliverPending`'s delivered-snapshot condition (68's step v, used by both the next `beforeTurn` and `flushHandoff`). That condition needs `success === true` and a non-empty string `markdownSnapshot`.
   - **Also added:** the observation must be a later successful non-fast call, and an off-shape call name is held as `'other'`.
4. **MCP-03-h (address rule, declines and long goals).**
   - **Condition (2):** it now also names the percent-decoded segment check and `toOriginPath(url).path === pathname` (Drift substitution 10).
   - **Condition (3):** it now names the query plus fragment, the query and the fragment, each checked raw and decoded.
   - **Credentials:** the userinfo decline is added.
   - **Long goals:**
     - **Row said:** "goals over 1,000 code points still give `invalid_request` and a session latch".
     - **What happens:** the goal is sent truncated to its first 1,000 code points in one decide, with no latch (Drift substitution 7).
5. **MCP-03-d (needs_confirmation sources).** The row now says:
   - the `manual_approval` partial is the terminal's own gate, needs no evidence record, and is matched trimmed and lower-cased;
   - the two evidence gates count only on a non-success terminal;
   - the safety net is also recognised by source `'safety_net_600s'`.
6. **MCP-03-f (WR-04).**
   - **Row said:** "every fallback class gives its 68 session, command or iteration latch".
   - **What happens:** that holds only after a calibrated answer. Before one, every fallback latches the session (WR-04).
7. **MCP-03-g2 (69 helper).**
   - **Row said:** "missing AgentScope mock methods added locally".
   - **70-07 did:** it added none, because `run_task` needs no method beyond the 69 mock. The row now names the helper call and the two kinds of fake-bridge answer: the 70-01 golden, and the golden plus a real `buildFastModeBlock` block.
8. **MCP-03-i (bench projection).**
   - **Row said:** "closed vocabularies".
   - **`projectFastMode` does:** only `outcome` is a closed list (anything else becomes `'other'`). The other strings follow the token rule `^[a-z_]{1,40}$`; escalation keys are dropped when they fail it, and at most 64 are kept. An unreadable count nulls `jev`.
   - **Also:** `classifyAutopilot` is exercised through the exported `classifyInfra({arm:'autopilot'})`.
9. **ALL-a (audit list).** The row now records that the gate ran the wider 70-08-PLAN list plus the per-commit path audit.

### Row command extended (row text only)

- **MCP-03-a** adds `&& node tests/jev-fast-path.test.js`. The row's "turning the switch off mid-run" claim for `run_task` is proven by `run_task switch off mid-run: ...` in that suite. The original command also exits 0.

### Process notes

- **Node 20 loop retry.** The first Node 20 loop passed `--test <file>` as one zsh word, so `node` refused it (`bad option`, exit 9) for the two `node:test` suites. Both were re-run with separate arguments and exit 0. The bad logs were deleted, and the record (`node20.jsonl`) holds only the correct runs.
- **Extra evidence.** The golden replay and the 70-03/70-04 timing go beyond the plan. They were added to back the sign-off decisions.

**Total deviations:** 9 row-text corrections and 1 command extension, all in `70-VALIDATION.md`. No code, test or fixture changed. No row was made green by editing it: every row's command exited 0 before and after the corrections.

## Issues Encountered

None that block. Port 7225 is held by the user's hub, so this was a tolerant pass, not a plain `npm test`. With 7226 free, every port-bound suite still ran and exited 0.

## Known Stubs

None. This plan changes documentation only.

## Threat Flags

None. No code, endpoint or storage changed. Mitigations:
- **T-70-07:** the footprint audit, the empty `mcp/` diff and status, the tool smoke and in-process callers after a fresh build, and the agent-loop.js and `createSessionHooks` hashes are all clean.
- **T-70-09:** the tripwire (87/0) and the 68 upstream contract (55/0) pass.
- **T-70-SC:** the Node 20 binary and tarball were re-verified against SHASUMS256.txt, run from /tmp and never installed, and no package was installed.
- **T-70-05:** M-70-08 stays open, and nothing was pushed.

## For Phase 71

These answer 71-CONTEXT D-09:
- **Item 3 (typed words in `status`): differs.**
  - Phase 70 keeps the `run_task` `status` field unchanged (MCP-04, D-17). It still carries `success`, `partial`, `stopped`, `error` or `completed`, so `claimed.status` never holds the typed words.
  - The typed outcome (`done`, `ambiguous`, `blocked`, `needs_confirmation`) is at **`fast_mode.outcome`** on the wire, present only when the Advanced Settings switch was on when the task started. It is at **`runTask.fastMode.outcome`** in raw bench records, alongside `reason`, `uncertain_unobserved`, `human_gate`, `budget_profile` and the `jev` summary.
  - `scripts/bench/lib/fast-mode.mjs` mirrors the extension's key lists (`FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS`, `FAST_MODE_OUTCOMES`) and exports `projectFastMode`. The parity test in `tests/bench-fast-mode-record.test.mjs` guards the mirror.
  - Committed rows and `RUN_ROW_KEYS` (schema 1) do not carry the block. 71-CONTEXT already records this substitution (its `RUN_ROW_KEYS_V2` `fastMode` projection, 71-SYNC-RECHECK S8).
- **Item 1 (switch read at each start): holds.** `handleStartAutomation` reads `fsbJevFastModeEnabled` in its per-start settings read, and `fsbFastModeSessionField(true, 'mcp')` gives `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}`. So a change between runs takes effect at the next `run_task`.
- **Item 2 (`jevMeasurement` reaches `get_session_detail`): holds per 70-SYNC-RECHECK item q.** `projectJevMeasurement` and `cloneJevMeasurementForPersistence` have no source or mode condition. Phase 70 adds no `jevMeasurement` field (F12).
- **Item 4 (no new tool or required argument): holds.**
  - The in-process caller's `tools/list unchanged` check shows run_task's properties and `required` are exactly `['task']`, with no tool name matching `/fast|jev/i`.
  - The 69 shape freeze passes (124/0).
  - `mcp/` has no diff since P70_START.
- **Item 5 (`sensitive_goal` on MCP goals): bench goals are normalised by D-22.** The leading `Open <url>.` sentence is dropped when it only restates the current or start page. All 12 core tasks equal the 68-08 exporter goal under both token shapes (70-04 `core tasks equal exporter goals`, 24/24), so the 22-character bench token no longer trips `sensitive_goal`. Any other secret still latches the command, with zero decide calls.

## Deferred to Validation Block

The complete Phase 70 list. Each item is also recorded in 70-VALIDATION.md under Manual-Only Verifications.

| ID | Block | What waits |
| --- | --- | --- |
| M-70-01 | V1 | None. With the switch off, Phase 70 is pre-milestone `run_task`, and the baseline runs at `8a058bdf`. |
| M-70-02 | V2 | No Phase 70 item of its own. Before the deploy, a switched-on `run_task` gets a 404 (`invalid_request`) and latches off after one call. After the deploy, with the operator `disabled` switch set, the block shows `fast_mode.jev.latched === 'disabled'` and a task-state outcome. |
| M-70-03 | V3 | A calibrated profile makes the `run_task` path act on the bench fixtures. Revisit the `run_task` profile numbers (12 / 16 / 20,000 ms / 3 / 3) together with M-68-04. |
| M-70-04 | V4 | The comparative gate through `run_task`. It includes the `sensitive_goal` count (about 0 expected), uncalibrated overhead, budget-exhaustion counts, and the typed-outcome agreement table from raw `runTask.fastMode` records (a false `done` is a gate input). It also counts runs over 60 s and the false-`ambiguous` watch items (F18 `bfCacheDetected`, the PD-70-01 narrowing, `dispatch_unconfirmed` and the retried-iteration residual), plus F17 timeout races and goals sent truncated at 1,000 code points. |
| M-70-05 | V5 | A real Claude Code CLI `run_task` with the switch on: at most one Jev attempt, nothing acts, and `fast_mode` is present. Codex and Cursor parse the same result. |
| M-70-06 | V5 | Real-page outcomes: manual approval, `stop_task`, foreground and background tabs, and an uncertain target on a re-rendering site. The owner also confirms the PD-70-01 observation set. |
| M-70-07 | V6 | Release with no MCP package change; the new suites on CI's Node 20; nothing pushed before V4 and owner approval. The owner also confirms the D-17 amendment for the `fast_mode` key. |
| M-70-08 | V6 | The MCP-enable consent review, a release blocker for MCP-started transfers (D-07 options a-d). |
| M-70-09 | V6 | The human wording check: the card and privacy page read as covering MCP-started `run_task` tasks; Open Question 3; the card's missing MCP sentence; the 70-04 Open-sentence observation. |

Deferred: M-70-01..M-70-09 (V1-V6).

## User Setup Required

None.

## Next Phase Readiness

- Phase 70 is code-complete and gate-green. The orchestrator owns the STATE.md, ROADMAP.md and REQUIREMENTS.md updates, including marking MCP-03 complete.
- **Open for the orchestrator:**
  - confirm or revert the PD-70-03 auto-acceptance (`6a86571c`);
  - the three wording items in `deferred-items.md`.
- **Next gate baseline:** `/tmp/fsb-gate-70.jsonl` (362 commands, all exit 0), with a copy in `/tmp/fsb-70-08/`.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

- FOUND: .planning/phases/70-bounded-mcp-fast-task/70-VALIDATION.md (status complete, wave_0_complete true, nyquist_compliant true, 21 green rows, 0 pending rows, 9 Manual-Only rows)
- FOUND: commit bb805cb9 (docs(70-08)), which touches only 70-VALIDATION.md and carries no attribution line
- FOUND: /tmp/fsb-gate-70.jsonl (362 rows, all exit 0) and /tmp/fsb-70-08/rows.jsonl (21 rows plus the extended MCP-03-a command, all exit 0)
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched; nothing was pushed
