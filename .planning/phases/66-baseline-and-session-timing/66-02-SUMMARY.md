---
phase: 66-baseline-and-session-timing
plan: 02
subsystem: testing
tags: [benchmark, bootstrap, statistics, outcome-evaluation, preflight, regression-sweep, node-test]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 01)
    provides: scripts/bench/ directory and the .gitignore entry for scripts/bench/.local/ (already committed before this plan ran)
provides:
  - "Installed worktree (root, mcp ci, mcp build, showcase/server, showcase/angular, esbuild) with lockfile rewrites reverted"
  - "Start-commit test baseline (tolerant mode, 7225 held): 311/311 chain commands exit 0"
  - "scripts/bench/sweep-tests.mjs referencing-test regression sweep (W11) with --baseline new-failure gating"
  - "66-02-SWEEP-BASELINE.json: 73/73 referencing tests pass over the nine Phase 66 extension files at b4fe9d41"
  - "scripts/bench/lib/stats.mjs: median, quantile, mulberry32, wilson, summarize, geoMeanMedianRatio, aaNoiseFloor"
  - "scripts/bench/lib/outcome.mjs: claim-blind evaluateOutcome, normalizeFinalUrl, stripRunPrefix, CHECK_KINDS"
  - "scripts/bench/lib/identity.mjs: canonicalJson, sha256Hex, toolsListDigest, gitIdentity, servedModelMatches, evaluatePreflight (11 refusal codes)"
affects: [66-03, 66-04, 66-05, 66-06, 66-07, 66-08, 66-09, 66-10, 66-11, benchmark runner, fixture server, live baseline campaign]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regression sweep: run every test that mentions an edited file's basename with its package.json invocation; compare failures to a committed baseline"
    - "Per-process bound in-process (SIGTERM to the process group, SIGKILL 5 s later); never the timeout binary"
    - "Claim-blind outcome evaluation: read four evidence fields by name, never enumerate the evidence object"
    - "Preflight refusal matrix: one code per broken condition; config-derived checks are skipped when config is unavailable"

key-files:
  created:
    - scripts/bench/sweep-tests.mjs
    - .planning/phases/66-baseline-and-session-timing/66-02-SWEEP-BASELINE.json
    - scripts/bench/lib/stats.mjs
    - scripts/bench/lib/outcome.mjs
    - scripts/bench/lib/identity.mjs
    - tests/bench-stats.test.mjs
    - tests/bench-outcome.test.mjs
    - tests/bench-identity.test.mjs
  modified: []

key-decisions:
  - "Baseline ran in tolerant mode because 7225 is held by the user's hub (pid 42278, npm exec fsb-mcp-server@latest); the port was never freed"
  - "Sweep failures are keyed by test path; with --baseline only failures absent from the baseline fail the run"
  - "The sweep records 7225 state with a loopback connect probe (no bind), so it cannot race a hub that is starting"
  - "evaluateOutcome fails closed when the request log is absent (not an array), so count:0 absence checks cannot pass vacuously"
  - "evaluatePreflight skips config-derived checks when fsb://config is unavailable, and treats unknown git state as dirty for campaigns"
  - "TDD tasks were committed as RED test + GREEN feat pairs (matching plan 66-01); the GREEN commits carry the plan's exact messages"

patterns-established:
  - "Later plans (66-03, 66-04, 66-06) run: node scripts/bench/sweep-tests.mjs --files <edited files> --baseline .planning/phases/66-baseline-and-session-timing/66-02-SWEEP-BASELINE.json"
  - "Bench libraries are pure ESM with node:test suites that avoid Node 22+ APIs; they are not registered in package.json until plan 66-09"

requirements-completed: [MEAS-03]

# Metrics
duration: 16min
completed: 2026-09-30
---

# Phase 66 Plan 02: Environment, Baseline and Bench Libraries Summary

**Worktree installed with a green start-commit baseline (311/311 chain commands, 7225 held), a referencing-test regression sweep with a committed 73/73 baseline, and tested D-16 statistics (seeded hierarchical bootstrap plus an A/A floor), a D-17 claim-blind outcome evaluator, and D-18/D-19 identity and preflight.**

This plan delivers MEAS-03's foundation slice only. The runner, tasks, fixtures, and live baseline campaign land in later Phase 66 plans.

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-30T06:23:22Z
- **Completed:** 2026-09-30T06:39:22Z
- **Tasks:** 3/3
- **Files created:** 8 (no existing tracked file modified)

## Start-Commit Baseline (the record later plans compare against)

### Environment

| Item | Value |
|------|-------|
| Start commit | `b4fe9d415b62cd1c6f7c0a22a7838eab068b2efb` (branch `Jev`) |
| Node / npm | v24.14.1 / 11.19.0 |
| MCP SDK | `@modelcontextprotocol/sdk` 1.29.0 (from `npm --prefix mcp ci`) |

### Install and build results (in plan order, all exit 0)

| Step | Result |
|------|--------|
| `npm install --no-audit --no-fund` | exit 0, added 44 packages (1 s) |
| `npm --prefix mcp ci --no-audit --no-fund` | exit 0, added 105 packages (1 s) |
| `npm --prefix mcp run build` | exit 0 (2 s); `verify-agent-provider-flags` and `verify-native-host-boundary` (source and compiled) PASS |
| `npm --prefix showcase/server install --no-audit --no-fund` | exit 0, added 110 packages (15 s); better-sqlite3 loads under Node 24 |
| `npm run showcase:install` | exit 0, added 684 packages (4 s); npm audit reports 38 advisories in showcase/angular's committed lock (pre-existing, not acted on) |
| `npm run build` (esbuild) | exit 0; `extension/dist/offscreen/lattice-host.js` written (gitignored) |

- npm 11.19 printed advisory `allowScripts` warnings for install scripts (esbuild, fsevents, better-sqlite3, lmdb, and others). The build and better-sqlite3 both work regardless.
- **Tracked files rewritten and reverted (never committed):**
  - The root `npm install` rewrote `package-lock.json` (root `engines.chrome` `>=88.0.0` → `>=116.0.0`).
  - `showcase:install` rewrote `showcase/angular/package-lock.json` (it dropped the optional `@types/node` 26.4.0 and `undici-types` entries under `@angular/build`).
  - The test pass rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`.
  - The three `npm --prefix mcp run build` runs (one explicit, two inside the chain) left `mcp/build/*` and `mcp/ai/tool-definitions.cjs` byte-identical.
  - `.gitignore` was not touched.

### Hub ports and baseline mode

| Port | Holder |
|------|--------|
| 7225 | **held**: pid 42278 `node /Users/lakshman/.npm/_npx/d92c25bff7522293/node_modules/.bin/fsb-mcp-server` (parent 42179 `npm exec fsb-mcp-server@latest`, started 2026-09-29 15:24:36). This is the user's hub; it was not killed or restarted. |
| 7226 | free |

**Mode: tolerant pass** (7225 held). `scripts.pretest`, then `scripts.test`, were split on ` && `. Each of the 311 commands ran through `/bin/sh -c` from the repo root, with stdin from `/dev/null`, continuing past failures.
- Runner: a throwaway `/tmp/fsb-66-02-tolerant-runner.mjs`, not committed.
- Artifacts: `/tmp/fsb-66-02-baseline.jsonl` (one `{command, exitCode, durationMs}` row per command, plus id, phase, signal, timedOut and startedAt), `/tmp/fsb-66-02-baseline.log` and `/tmp/fsb-66-02-baseline.done`.

### Chain result

- **Exit code:** in tolerant mode there is no single chain exit code. All 311 commands exited 0 (13/13 pretest, 298/298 test), so the equivalent `npm test` result is 0. Total time was 148.0 s, and no command reached the runner's 20-minute per-command bound.
- **Last suite reached:** T298 `node --import tsx tests/no-orphan-descriptor.test.js` (the end of the chain).
- **Failing suites:** **none.**
- **Port-bound suites passed with 7225 held**, contrary to the plan's expectation:
  - T44 `tests/mcp-diagnostics-status.test.js`: 254 passed, 0 failed.
  - T45 `tests/mcp-install-platforms.test.js`: 108 passed, 0 failed.
- The slowest commands were T103 `showcase-build-smoke` (22.1 s), T45 `mcp-install-platforms` (20.5 s) and T8 `phase60-full-tests-harness` (17.1 s).
- No stray `mcp/build/index.js` relay from this workspace was left running. 7225 was still held by the same pid 42278 afterwards.

### Pre-existing failures set (for later plans)

- **In the `npm test` chain:** none.
- **In the sweep baseline:** none (see below).
- **Known out-of-chain failures from operator memory, marked "not in the chain":** these were not re-run here.
  - `tests/mcp-lifecycle-smoke.test.js` (`npm run test:mcp-smoke`), 0/5 on origin/main.
  - Six unscripted tests: `agent-manager-start-mode`, `back-tool`, `dashboard-analytics-refresh`, `foreground-audit`, `site-search` and `trigger-cap-settings-ui` (`.test.js`).
  - One of those six, `tests/foreground-audit.test.js`, is in this plan's sweep set and **passed** at `b4fe9d41` on `Jev`.

### Sweep baseline (`66-02-SWEEP-BASELINE.json`)

- **Command:** `node scripts/bench/sweep-tests.mjs --files <the nine files> --out .planning/phases/66-baseline-and-session-timing/66-02-SWEEP-BASELINE.json`
- **Files covered:**
  - `extension/ws/mcp-bridge-client.js` and `extension/ws/mcp-tool-dispatcher.js`
  - `extension/utils/mcp-session-recorder.js`, `mcp-lattice-journal.js`, `spreadsheet-record-redaction.js` and `automation-logger.js`
  - `extension/ai/cost-tracker.js`, `agent-loop.js` and `action-history.js`
- **Result:**
  - 73 referencing tests ran, and all 73 passed. **`failures: []`**.
  - **7225 was held during the sweep** (`port7225Held: true`), with `head` = `b4fe9d41`.
  - The per-test limit was 180000 ms. The whole sweep took about 9.0 s.
- **Invocations:** 69 tests ran as `node <file>` and 4 as `node --test <file>`. Of the 73, 12 are in no package.json script and ran as plain `node <file>`.
- **After the sweep:** no tracked file was rewritten.

## Accomplishments

- The environment matches CI's install set, and the start commit's test state is recorded before any extension edit. The whole chain is green even with the hub on 7225.
- **`scripts/bench/sweep-tests.mjs`:**
  - selects every `tests/*.test.{js,mjs}` file that mentions an edited file's basename, and resolves that file's own package.json invocation (it handles `--test`, `--import tsx` and trailing script arguments);
  - bounds each test in-process and writes per-test logs under the OS temp dir;
  - with `--baseline`, fails only on new failures.

  Verified cases: help, usage errors (exit 2), a 30 ms bound killing a test by SIGTERM, a new failure against a clean baseline (exit 1), a known failure (exit 0), and "no longer failing" reporting.
- **D-16 statistics:**
  - Seeded (66) hierarchical bootstrap with 10000 iterations by default.
  - A known 0.7x effect gives estimate 0.7047 with CI [0.6995, 0.7098], verdict "faster".
  - An A/A comparison gives CI [0.954, 1.064], verdict "inconclusive". It was inconclusive for 40 of 40 synthetic data seeds, so the null test is not seed-lucky.
- **D-17 claim-blind outcome evaluator:** a Proxy that throws on any read, `in` probe, descriptor lookup or enumeration of `claimed` proves the evaluator never touches it. Mutation runs on temporary copies confirmed the test catches a direct read, an `in` probe, an object spread, and a claim-trusting shortcut.
- **D-18/D-19 identity and preflight:**
  - Canonical JSON, the SHA-256 "abc" vector, an order-independent tools/list digest, git identity, and grok-4.3 served-model matching.
  - Each of the eleven refusal codes is shown to fire alone.
  - Refusal details never echo config values other than provider and model names.

## Task Commits

1. **Task 1: Install, record baseline, add regression sweep and its baseline:** `ee447d4d` (chore)
2. **Task 2: Statistics library:**
   - `0fac17e6` (test, RED)
   - `cb98a67c` (feat, GREEN)
3. **Task 3: Outcome evaluator and run identity plus preflight:**
   - `3d3c598c` (test, RED)
   - `b19e65e8` (feat, GREEN)

**Plan metadata:** see the `docs(66-02)` commit that adds this SUMMARY.

## Files Created/Modified

- `scripts/bench/sweep-tests.mjs`: referencing-test regression sweep CLI (`--files`, `--baseline`, `--out`, `--per-test-timeout-ms`, `--help`). It uses Node built-ins only, has a direct-run guard, and never modifies files.
- `.planning/phases/66-baseline-and-session-timing/66-02-SWEEP-BASELINE.json`: start-commit sweep results for the nine Phase 66 extension files.
- `scripts/bench/lib/stats.mjs`: `mulberry32`, `median`, `quantile`, `geoMeanMedianRatio` and `wilson` from Pattern 9 verbatim, plus `summarize`, `aaNoiseFloor` and `AA_NOISE_FLOOR_LABEL`. It has no imports.
- `scripts/bench/lib/outcome.mjs`: `CHECK_KINDS`, `stripRunPrefix`, `normalizeFinalUrl` and `evaluateOutcome`.
- `scripts/bench/lib/identity.mjs`:
  - constants `WEB_STORE_EXTENSION_ID`, `PINNED_AUTOPILOT_MODEL`, `SERVED_MODEL_PATTERN` and `PREFLIGHT_REFUSAL_CODES`;
  - functions `canonicalJson`, `sha256Hex`, `toolsListDigest`, `gitIdentity`, `servedModelMatches` and `evaluatePreflight`.
- `tests/bench-stats.test.mjs`: 11 node:test cases.
- `tests/bench-outcome.test.mjs`: 13 cases.
- `tests/bench-identity.test.mjs`: 26 cases.

All three test files are unregistered; plan 66-09 adds them to the chain.

## Decisions Made

- **Tolerant baseline instead of `npm test`:** 7225 is held by the user's hub, and the rules forbid freeing it. Because every command passed, the tolerant result is equivalent to a green chain.
- **Sweep identity and exit codes:**
  - A failure is keyed by test path.
  - A test fails on a non-zero exit, a signal, or hitting the time bound.
  - Exit codes are 0 (no new failures), 1 (failures, or new failures with `--baseline`) and 2 (usage or setup error, including a `--files` path that does not exist).
  - `--files`, `--out` and `--baseline` resolve against the current directory.
- **Sweep port probe:** a loopback TCP connect to 127.0.0.1:7225 that sends no bytes, rather than a bind that could race a hub that is starting.
- **Outcome evaluator:**
  - For `set: 'live'` tasks, final-URL checks use the URL as-is. For other sets, the `/r/<token>` prefix is stripped when `{token}` is passed.
  - Check objects that don't match the contract fail with `{error:'invalid check'}`.
  - Query values are compared as strings.
- **Preflight ordering and scope:**
  - Refusals appear in the order of the plan's list.
  - `extension_id_mismatch` fires only when `expectExtensionId` is given.
  - The `hub_not_owned` detail names the two PIDs, which are not config values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Outcome evaluator fails closed on absent request evidence**
- **Found during:** Task 3
- **Issue:** Treating a missing `evidence.requests` as an empty log would let a `count: 0` absence check pass when the fixture server's evidence was never collected.
- **Fix:** A non-array `requests` makes every request check fail with `{error:'no request evidence'}`. An empty array `[]` is still valid evidence.
- **Files modified:** `scripts/bench/lib/outcome.mjs`, `tests/bench-outcome.test.mjs`
- **Verification:** the case "missing request evidence fails closed, even for count: 0" passes.
- **Committed in:** `3d3c598c` (test) / `b19e65e8` (feat)

**2. [Rule 2 - Missing critical functionality] Preflight fails closed on unknown git state for campaigns**
- **Found during:** Task 3
- **Issue:** Firing `dirty_tree` only when `git.dirty === true` would let a campaign run when git state could not be read.
- **Fix:** A campaign without `allowDirty` refuses unless `git.dirty === false`.
- **Files modified:** `scripts/bench/lib/identity.mjs`, `tests/bench-identity.test.mjs`
- **Verification:** the case "dirty_tree applies only to campaigns without allowDirty", including its unknown-state assertion, passes.
- **Committed in:** `3d3c598c` / `b19e65e8`

**3. [Rule 2 - Missing critical functionality] Timed-out tests cannot leave straggler processes**
- **Found during:** Task 1
- **Issue:** Clearing the SIGKILL timer as soon as the direct child exits would let descendants that ignored SIGTERM keep running into later tests.
- **Fix:** After a timed-out test closes, its process group gets one more SIGKILL.
- **Files modified:** `scripts/bench/sweep-tests.mjs`
- **Verification:** a 30 ms bound run killed the test by SIGTERM, and no process was left afterwards.
- **Committed in:** `ee447d4d`

### Execution notes (not rule deviations)

- **TDD commit split:** Tasks 2 and 3 are `tdd="true"`, so each has a RED `test(66-02)` commit before its GREEN `feat(66-02)` commit. The plan named one commit per task; the GREEN commits use the plan's messages verbatim. This matches plan 66-01's history.
- **Branch safety check:** the executor's `worktree-agent-*` branch allow-list was skipped because the orchestrator directed commits on `Jev` in this workspace. The cwd-drift sentinel and the protected-branch deny-list ran before every commit.
- **Tolerant runner additions:** the runner prepended `node_modules/.bin` to `PATH` to mirror `npm run`, added a 20-minute per-command safety bound (never hit), and wrote extra JSONL fields. None of this changes what counts as a pass.
- **Extra output fields:** the sweep JSON adds `finishedAt`, `nodeVersion` and `perTestTimeoutMs` to the specified shape. `gitIdentity` uses `status --porcelain -z` so paths with spaces and renames parse correctly, and it accepts 64-hex SHA-256 object IDs. `toolsListDigest` breaks ties between equal names on canonical JSON, so duplicate names cannot make the digest order-dependent. `PREFLIGHT_REFUSAL_CODES` and `AA_NOISE_FLOOR_LABEL` are additive exports.
- **Drafting order:** the sweep script was drafted in /tmp while the tolerant pass ran, so no file was written into the repo during the baseline.

---

**Total deviations:** 3 auto-fixed (all Rule 2, fail-closed correctness).
**Impact on plan:** they tighten evidence and preflight correctness. There is no scope creep, and the footprint is exactly the plan's `files_modified`.

## Issues Encountered

- The plan expected port-bound suites to fail while 7225 was held. They passed (T44 254/0, T45 108/0), so the pre-existing failure set in the chain is empty.
- No local Node 20 binary exists, and CI runs Node 20. Instead, a static scan found no Node 22+ API in the eight new files (`Object.groupBy`, `Promise.withResolvers`, `crypto.hash`, `fs.globSync`, `process.getBuiltinModule`, global `WebSocket`, Set methods, iterator helpers, `toSorted` and similar). Running the tests under the official Node 20 tarball remains part of the phase gate.

## Known Stubs

None. The modules are complete, pure libraries with no data wiring left open.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: loopback-probe | scripts/bench/sweep-tests.mjs | Opens and immediately closes one TCP connection to 127.0.0.1:7225 per sweep to record whether the hub port is held. It sends no bytes. This is not in the plan's threat register, and it is read-only toward the hub. |

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- **Plans 66-03, 66-04 and 66-06:** after each extension edit, run `node scripts/bench/sweep-tests.mjs --files <edited files> --baseline .planning/phases/66-baseline-and-session-timing/66-02-SWEEP-BASELINE.json`. It exits 1 only on new failures. The baseline was taken with 7225 held, and the sweep prints a note when the port state differs.
- **Plans 66-05, 66-06 and 66-08:** they implement against `evaluateOutcome` (evidence contract), `evaluatePreflight` (fsb://config payload from plan 66-03) and `geoMeanMedianRatio`/`aaNoiseFloor`/`wilson`/`summarize`.
- **Plan 66-09:** registers `tests/bench-{stats,outcome,identity}.test.mjs` in the `test` chain and in `REFINEMENT_ROOT_TEST_COMMANDS`.
- **Blockers:** none.

## Self-Check: PASSED

- All 8 created files were found on disk.
- All 5 task commits were found: `ee447d4d`, `0fac17e6`, `cb98a67c`, `3d3c598c`, `b19e65e8`.
- No commit in `b4fe9d41..HEAD` has a Co-Authored-By line.
- `node --test tests/bench-stats.test.mjs tests/bench-outcome.test.mjs tests/bench-identity.test.mjs` passes 50/50.
- `git status --porcelain --untracked-files=no -- mcp showcase extension package.json package-lock.json` is empty.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
