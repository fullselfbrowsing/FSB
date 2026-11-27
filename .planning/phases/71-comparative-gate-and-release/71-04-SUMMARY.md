---
phase: 71-comparative-gate-and-release
plan: 04
subsystem: testing
tags: [bench, statistics, newcombe, power-simulation, synthetic-campaigns, safety-false-fail, gate, eval-01, eval-02]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-02)
    provides: buildSchedule({conditions}), toCommittedRow and validateCommittedRow for schema-1 and schema-2 rows, the Exposure rule (jev.source), RUN_ROW_KEYS_V2, INFRA_CODES
  - phase: 71-comparative-gate-and-release (71-03)
    provides: schema-2 raw record shape (condition, jevMeasurement, endReason, safety, runTask.fastMode), identity.gate and schedule.conditions
  - phase: 66-bench
    provides: stats.mjs Pattern 9 block (mulberry32, wilson, geoMeanMedianRatio), aaNoiseFloor
provides:
  - "newcombeDifference(x1, n1, x2, n2, z) in scripts/bench/lib/stats.mjs, after the untouched Pattern 9 block"
  - "scripts/bench/gate/lib/synthetic.mjs: makeCampaign, makeRawCampaign, defaultIdentity, CORE_TASK_IDS_SYNTHETIC, SYNTHETIC_TASK_BASE_MS, standardNormal and the pin/candidate shas"
  - "scripts/bench/gate/simulate-power.mjs: taskRates, simulateCompletion, coverageNewcombe, coverageBootstrap, simulateSpeedSentinel, buildTable, selectRounds, simulateSafety, buildSafetyTable, spendFor, runSimulation, main"
  - "71-POWER.json: recommendedRounds {rounds: 30, met: true}, the 104-row power table, coverage, the spend line and 60 safety false-fail rows"
affects: [71-05, 71-06, 71-07, 71-12, V1, V4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate mulberry32 streams per concern (infra, pass, wall, exposure, fast_mode), each drawn the same number of times per run, so one knob never reshuffles another"
    - "Synthetic rows only through toCommittedRow, then validateCommittedRow; the generator refuses unknown options and unfillable cells"
    - "Closed forms by repeated multiplication instead of ** so frozen numbers are bit-identical on Node 20 and Node 24"

key-files:
  created:
    - scripts/bench/gate/lib/synthetic.mjs
    - scripts/bench/gate/simulate-power.mjs
    - tests/bench-gate-synthetic.test.mjs
    - tests/bench-gate-power.test.mjs
    - .planning/phases/71-comparative-gate-and-release/71-POWER.json
  modified:
    - scripts/bench/lib/stats.mjs
    - tests/bench-stats.test.mjs
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "Recommended common rounds R = 30 for every gate campaign (V1 baseline, V4 autopilot, V4 Claude), met at the floor completion rate 0.80; the binding constraint is the sentinel's no-drift equivalence (0.7438 at 25 rounds, 0.8465 at 30)"
  - "All three completion comparisons run R against R; the Jev and Claude non-inferiority rows are independent seeded replications of the same design"
  - "Speed sentinel and bootstrap coverage use only runs that complete at the floor rate 0.80, as the report does; task completion rates spread +/-0.10 around p (narrowed inside [0.01, 0.99])"
  - "makeCampaign also returns `safety`, a Map runId -> {requestOvercount, unexpectedMutations} for every counted run: the sidecar 71-06 reads for schema-1 baseline rows"
  - "Synthetic identities omit hosts.claude for autopilot-only campaigns, as run-bench collectIdentity does; 71-05's identityMatch.autopilot does not name hosts.claude, so the sentinel is unaffected"
  - "Safety injections never change pass/fail; a row takes at most one evidence event and one claim"

patterns-established:
  - "One synthetic recipe per verdict branch: makeCampaign({seed, scheduleSeed, schemaVersion, arms, conditions, rounds, taskRates, wallMs, effect, jev, fastMode, safety, infra, identity})"
  - "A seeded small run of the full simulation is a registered snapshot test (0.5 s); the full run is a CLI writing 71-POWER.json"

requirements-completed: [EVAL-01, EVAL-02]

# Metrics
duration: 21min
completed: 2026-10-18
---

# Phase 71 Plan 04: Completion Statistic, Synthetic Campaigns and the Power Simulation Summary

**The gate's round count now comes from a seeded, re-runnable simulation: 30 rounds per arm for every gate campaign meets power of at least 0.8 on both completion criteria, and keeps the sentinel's false-trip rate at or below 0.2, at a floor completion rate of 0.80.**
- The completion margin (10 points), alpha (2.5% one-sided) and the 0.90 practical-effect bound did not move.
- The same run measures how often the locked D-15 safety rules fail when there is no true difference. At realistic event rates, rule (a) fails almost every time. That table goes to the owner for M-71-00.

## Performance

- **Duration:** about 21 min
- **Started:** 2026-10-19T01:37:14Z
- **Completed:** 2026-10-19T01:58Z
- **Tasks:** 3/3
- **Files:** 5 created, 4 modified, plus this SUMMARY

## Task Commits

1. **Task 1: newcombeDifference beside the verbatim statistics block.** Commit `fec5c727` (feat).
2. **Task 2: Seeded synthetic-campaign generator.** Commit `7452a255` (test).
3. **Task 3: Power and coverage simulation, and the round counts to freeze.** Commit `9b6a6442` (feat).

RED was observed before each GREEN change but not committed separately; see TDD Gate Compliance.

## Pattern 9 block hash

I measured it with a one-off node command before editing stats.mjs:
- **What is hashed:** the text from the `// --- 66-RESEARCH.md Pattern 9 (verbatim)` line through the `// --- end Pattern 9` line, without the trailing newline. That is lines 19-57, 39 lines.
- **sha256:** `fda24eaa275a2574a43548060015c28b23964e057df1422175a9301e9718896e`.
- **Same at the pin:** the value is identical at `$P71_START` (`3493c34a`). The whole stats.mjs file was unchanged since `8a058bdf` (file sha256 `7a029c5d…8ae7`).
- **The pin:** `tests/bench-stats.test.mjs` pins it as `PATTERN_9_BLOCK_SHA256` and also checks that `newcombeDifference` sits after the block.
- **Additions only:** `git diff $P71_START -- scripts/bench/lib/stats.mjs | grep -E "^-" | grep -v "^---"` prints nothing.

## What was built

### `newcombeDifference` (stats.mjs, appended after `aaNoiseFloor`)

- **What it computes:** `newcombeDifference(x1, n1, x2, n2, z = 1.959963984540054)` returns `{diff, ci}`. It is Newcombe (1998) method 10, built on `wilson()`.
- **No data:** if either n is 0, it returns `{diff: null, ci: [null, null]}`, never NaN or 0.
- **Header:** one sentence was added: "Completion differences (Phase 71, D-13) use the Newcombe hybrid score interval on pooled counted runs."
- **Tests:**
  - the four reference vectors reproduce to 1e-4;
  - diff equals p1 - p2;
  - the null cases hold;
  - for 200 seeded (x, n) pairs, the interval contains diff and stays within [-1, 1];
  - a larger z widens the interval.

### `scripts/bench/gate/lib/synthetic.mjs`

**`makeCampaign(options)`** returns `{identity, runs, safety}`:
- run ids and orders come from `buildSchedule`;
- each row is built by `toCommittedRow` from a synthetic raw record (schema 1 or 2, matching `schemaVersion`);
- every row must pass `validateCommittedRow`, or the call throws.

**`makeRawCampaign(options)`** returns the raw records, so tests can check them against the rows.

**Options:**
- **Core:** `seed`, `scheduleSeed` (default `seed`; this is the ABBA seed the identity records), `schemaVersion`, `arms`, `conditions`, `rounds`, `campaignId`, `taskIds` and `createdAt`.
- **Pass/fail and timing:**
  - `taskRates`: a single number or one per task;
  - `wallMs {base, sigma}`: `sigma` may be one number or a map by group;
  - `effect {<arm> | <arm>/<condition>: {speed, completion}}`.
- **`jev`:** `actRate`, `calibrated`, `models`, `missingRate`, `noBlockRate`, `unknownRate`, `detailMissingRate` and `leakOff {count, kind}`.
- **`fastMode`:**
  - `falseDone` and `ambiguousOnPass`, as cells;
  - `missingRate`;
  - `statusMismatch`.
- **`safety.events`:** each event has a `kind` (`requestOvercount`, `unexpectedMutations`, `unverifiable` or `claimedSuccessOnFail`) and optionally `arm`, `condition`, `acted`, `count` and `value`.
- **`infra {rate, code}`** and **`identity`** (overrides; undefined removes a key).

**What each option produces** (each asserted in the suite):

| Recipe | `jev.source` | `jev.acted` | flags | `fastMode` |
|--------|--------------|-------------|-------|------------|
| default `on` row | `measurement` | Bernoulli(actRate) | none | done / blocked |
| `missingRate` | `summary` | fast_steps > 0 | `jev_measurement_missing` | present |
| `noBlockRate` | `no_block` | false | none | null |
| `unknownRate` | null | null | none | present, with jev null |
| `detailMissingRate` | null | null | `session_detail_missing` | null |
| `off` row | null | null | none | null |
| `leakOff` kind `calls` | `measurement` | false (jevCalls 2, fastSteps 0) | none | null |
| `leakOff` kind `local` | `measurement` | false (jevCalls 0, fallbacks {sensitive_goal: 1}) | none | null |
| `leakOff` kind `summary` | `summary` | false | none | the zero summary |

**Exposure and claim details:**
- **The raw summary agrees with the measurement.** The raw `runTask.fastMode.jev` summary matches the `jevMeasurement` on attempts, calls and fast_steps.
- **Calibration.** Acted rows carry `{calibrated: n}`, or `{uncalibrated: n}` when `calibrated` is false.
- **Models.** `models` are assigned in turn to the rows that call Jev.
- **False done.** It gives status `success`, or `error` with `statusMismatch`. Either way `claimedSuccessOnFail` is true.

**Other exports:**
- `defaultIdentity(overrides)` returns the collectIdentity shape: `createdAt`, `git`, `hosts.claude`, `provider.requestedModel`, `chrome.browser`, the 12 `tasks` and `schedule`, with optional `gate` and `resumes`.
- `SYNTHETIC_PIN_SHA` starts with `8a058bdf`. `SYNTHETIC_CANDIDATE_SHA` is `7171…`.

**Purity.** It uses mulberry32 only, through five separate streams. It never reads the clock, the environment or the filesystem: the `Math.random|Date.now|process.env|readFileSync` grep prints 0.

### `scripts/bench/gate/simulate-power.mjs`

**Exports.** These implement the plan's behaviours:
- `taskRates`, `simulateCompletion`, `coverageNewcombe`, `coverageBootstrap` and `simulateSpeedSentinel`;
- `buildTable`, `selectRounds`, `simulateSafety`, `buildSafetyTable` and `spendFor`;
- `runSimulation`, the pure whole run;
- `main(argv, overrides)`, with injected stdout, stderr and writeFile.

**Fixed constants.** `COMPLETION_MARGIN` 0.10, `Z_95`, `ALPHA_ONE_SIDED` 0.025 and the 0.90 bound are constants. They are recorded in `assumptions` and are never outputs.

**CLI flags.** `--reps`, `--speed-reps`, `--safety-reps`, `--iterations`, `--seed` and `--out`. An unknown flag, a missing value or a bad value exits 2 and prints the usage. The `invokedPath` guard is copied from report.mjs.

## The full run (71-POWER.json)

**The run.**
- **Command:** `node scripts/bench/gate/simulate-power.mjs --reps 4000 --speed-reps 100 --safety-reps 4000 --iterations 500 --seed 71 --out .planning/phases/71-comparative-gate-and-release/71-POWER.json`, run in the background.
- **Time:** 25.6 s.
- **Reproduced byte for byte** with the official Node 20 binary (`/tmp/fsb-node20/.../node`): `cmp` reports no difference.

**Model** (`assumptions`):
- 12 tasks, with rates evenly spread over p ± 0.10 and mean p;
- no true difference;
- floor completion rate 0.80;
- wall times lognormal with sigma 0.30 around `SYNTHETIC_TASK_BASE_MS` (A2);
- the speed sentinel band [0.80, 1.25].

### Power table (pass rate; non-inferiority power or no-drift equivalence pass)

| Rounds (R vs R) | jev-ni 0.80 / 0.85 / 0.90 / 0.95 | claude-ni 0.80 / 0.85 / 0.90 / 0.95 | sentinel-equivalence 0.80 / 0.85 / 0.90 / 0.95 |
|---|---|---|---|
| 20 | 0.7910 / 0.8732 / 0.9485 / 0.9985 | 0.7847 / 0.8720 / 0.9513 / 0.9975 | 0.5820 / 0.7228 / 0.9145 / 0.9962 |
| 24 | 0.8505 / 0.9220 / 0.9765 / 0.9995 | 0.8490 / 0.9167 / 0.9800 / 0.9985 | 0.7140 / 0.8380 / 0.9567 / 0.9982 |
| 25 | 0.8628 / 0.9287 / 0.9818 / 1.0000 | 0.8665 / 0.9327 / 0.9810 / 0.9998 | 0.7438 / 0.8665 / 0.9673 / 0.9990 |
| **30** | **0.9213** / 0.9730 / 0.9930 / 1.0000 | **0.9233** / 0.9698 / 0.9940 / 0.9998 | **0.8465** / 0.9323 / 0.9895 / 1.0000 |
| 35 | 0.9530 / 0.9850 / 0.9985 / 1.0000 | 0.9567 / 0.9842 / 0.9988 / 1.0000 | 0.9110 / 0.9670 / 0.9958 / 1.0000 |
| 40 | 0.9752 / 0.9900 / 1.0000 / 1.0000 | 0.9722 / 0.9908 / 0.9995 / 1.0000 | 0.9530 / 0.9865 / 0.9990 / 1.0000 |
| 50 | 0.9930 / 0.9985 / 0.9998 / 1.0000 | 0.9920 / 0.9980 / 1.0000 / 1.0000 | 0.9845 / 0.9955 / 1.0000 / 1.0000 |
| 60 | 0.9982 / 0.9990 / 1.0000 / 1.0000 | 0.9972 / 0.9995 / 1.0000 / 1.0000 | 0.9938 / 0.9995 / 1.0000 / 1.0000 |

**Sentinel speed band** at the floor rate: a pass rate of 1.0 at every R from 20 to 60. At sigma 0.30 and 20 or more rounds, the speed band is not the binding constraint, so the default band [0.80, 1.25] stands for 71-05.

**Agreement with RESEARCH Pitfall 1.** Every comparable figure is within 0.0145; the largest gap is sentinel-equivalence at 20 rounds and p 0.90, 0.9145 against 0.90. The plan's tolerance was ±0.04, so there was nothing to explain.

### Recommended rounds

**`recommendedRounds` = `{rounds: 30, met: true}`.**

What happens at p = 0.80 at each candidate:
- **24 and 25 rounds:** both non-inferiority criteria already pass (0.85 or more), but the sentinel's no-drift equivalence is only 0.7140 and 0.7438, below the 0.8 it needs.
- **30 rounds:** jev-ni 0.9213, claude-ni 0.9233, sentinel-equivalence 0.8465 and sentinel-speed 1.0, so every criterion is met.

71-05 freezes R = 30 as `minRounds` for `core-baseline-66`, `core-gate-71-autopilot`, `core-gate-71-claude` and both `core-rebaseline-71` campaigns.

### Coverage at R = 30

- **Newcombe interval, pooled, with heterogeneous task rates** (4,000 reps). RESEARCH expects about 0.95-0.967.

  | p | true difference | coverage |
  |---|-----------------|----------|
  | 0.80 | 0 | 0.95175 |
  | 0.80 | -0.10 | 0.94975 |
  | 0.90 | 0 | 0.9505 |
  | 0.90 | -0.10 | 0.94625 |

- **One-sided false pass at the margin.** With a true difference of -10 points, the non-inferiority pass rate is 0.0235 at p 0.80 and 0.02125 at p 0.90. The nominal value is 0.025, so alpha holds.
- **Hierarchical bootstrap** (100 reps, 500 iterations). Coverage is 1.00 at a true ratio of 1.0 and 0.99 at 0.7. RESEARCH expects 0.97-0.99, so the bootstrap is conservative.

### Spend line (owner-visible)

`spend` = `{roundsPerArm: 30, v1CoreRuns: 720, v4AutopilotRuns: 720, v4ClaudeRuns: 360, defaultRuns: {v1: 240, v4Autopilot: 480, v4Claude: 120}}`.

In words:
- **V1:** 720 core runs instead of 240.
- **V4 autopilot:** 720 runs instead of 480.
- **V4 Claude:** 360 runs instead of 120.

In total that is 1,800 paid runs instead of 840. The conditional fallback M-71-08b would add 2 × 12 × 30 = 720 Claude runs if the owner runs it.

## Safety false-fail exposure (for M-71-00)

This is the locked D-15 rule set, measured with no true difference. One Bernoulli(p) safety event can occur per counted run, and p is the per-run rate of any safety event, `claimedSuccessOnFail` included. Real runs can carry up to three events, which only raises these rates. The rows below are at the recommended 30 rounds: 360 runs per arm or condition, 4,000 reps each.

| p | acted share | unknown share | rule (a) | rule (a) exact | rule (b) | Jev safety (a or b) | non-Jev any excess |
|---|---|---|---|---|---|---|---|
| 0.005 | 0.5 | 0 | 0.5985 | 0.5943 | 0.4325 | 0.7685 | 0.3865 |
| 0.005 | 0.5 | 0.1 | 0.6265 | 0.6293 | 0.4430 | 0.7897 | 0.3820 |
| 0.005 | 0.8 | 0 | 0.7588 | 0.7639 | 0.2920 | 0.8325 | 0.3920 |
| 0.005 | 0.8 | 0.1 | 0.7642 | 0.7721 | 0.2680 | 0.8293 | 0.3905 |
| 0.005 | 1 | 0 | 0.8380 | 0.8354 | 0.0000 | 0.8380 | 0.3907 |
| 0.005 | 1 | 0.1 | 0.8413 | 0.8354 | 0.0000 | 0.8413 | 0.3972 |
| 0.01 | 0.5 | 0 | 0.8425 | 0.8362 | 0.4768 | 0.9147 | 0.4268 |
| 0.01 | 0.5 | 0.1 | 0.8615 | 0.8633 | 0.4758 | 0.9250 | 0.4203 |
| 0.01 | 0.8 | 0 | 0.9507 | 0.9447 | 0.4445 | 0.9740 | 0.4235 |
| 0.01 | 0.8 | 0.1 | 0.9513 | 0.9484 | 0.4143 | 0.9695 | 0.4230 |
| 0.01 | 1 | 0 | 0.9745 | 0.9732 | 0.0000 | 0.9745 | 0.4225 |
| 0.01 | 1 | 0.1 | 0.9712 | 0.9732 | 0.0000 | 0.9712 | 0.4245 |
| 0.02 | 0.5 | 0 | 0.9738 | 0.9737 | 0.4830 | 0.9882 | 0.4432 |
| 0.02 | 0.5 | 0.1 | 0.9810 | 0.9817 | 0.4820 | 0.9902 | 0.4470 |
| 0.02 | 0.8 | 0 | 0.9968 | 0.9970 | 0.4740 | 0.9978 | 0.4363 |
| 0.02 | 0.8 | 0.1 | 0.9978 | 0.9974 | 0.4612 | 0.9988 | 0.4402 |
| 0.02 | 1 | 0 | 0.9992 | 0.9993 | 0.0000 | 0.9992 | 0.4612 |
| 0.02 | 1 | 0.1 | 0.9998 | 0.9993 | 0.0000 | 0.9998 | 0.4510 |
| 0.05 | 0.5 | 0 | 1.0000 | 0.9999 | 0.4795 | 1.0000 | 0.4647 |
| 0.05 | 0.5 | 0.1 | 0.9998 | 1.0000 | 0.4875 | 1.0000 | 0.4705 |
| 0.05 | 0.8 | 0 | 1.0000 | 1.0000 | 0.4805 | 1.0000 | 0.4720 |
| 0.05 | 0.8 | 0.1 | 1.0000 | 1.0000 | 0.4698 | 1.0000 | 0.4572 |
| 0.05 | 1 | 0 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.4637 |
| 0.05 | 1 | 0.1 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.4650 |
| 0.1 | 0.5 | 0 | 1.0000 | 1.0000 | 0.4945 | 1.0000 | 0.4733 |
| 0.1 | 0.5 | 0.1 | 1.0000 | 1.0000 | 0.4675 | 1.0000 | 0.4730 |
| 0.1 | 0.8 | 0 | 1.0000 | 1.0000 | 0.4823 | 1.0000 | 0.4698 |
| 0.1 | 0.8 | 0.1 | 1.0000 | 1.0000 | 0.4908 | 1.0000 | 0.4900 |
| 0.1 | 1 | 0 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.4725 |
| 0.1 | 1 | 0.1 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.4700 |

The 20-round rows are in 71-POWER.json, `safetyFalseFail.rows`, where `rounds` is 20.

**What the table says:**
- **Rule (a) alone, acted share 0.5.**
  - At 30 rounds it fails at least half the time already at **p = 0.005**, the smallest p in the grid (0.5985 simulated, 0.5943 exact). The exact form 1 - (1 - p)^180 crosses 0.5 at about p = 0.0038.
  - At 20 rounds the smallest grid p is 0.01 (0.7095).
  - More rounds only raise this rate, so no round count can lower it.
- **The non-Jev "any excess over the pin" criterion** fails **0.4647** of the time at p 0.05 with no true difference (0.457-0.472 across the p = 0.05 rows). It sits near 0.4-0.5 at every p. Rule (b) behaves the same way: 0.43-0.49 whenever some runs are non-acted.
- **The cost of the planner-added `safety.unknownExposure: 'acted'` reading** (M-71-00 item 1). At acted share 0.5, p 0.01 and 30 rounds, an unknown share of 0.1 raises rule (a):
  - from 0.8425 to 0.8615 simulated (+1.9 points);
  - from 0.8362 to 0.8633 exact (+2.7 points): 198 acted-or-unknown runs instead of 180;
  - the combined Jev criterion goes from 0.9147 to 0.9250.

  The reading applies only to rows that are still unknown after the 71-02 Exposure rule. An `on` run with no Jev attempt is `acted:false` and never takes it. The 71-07 gate report counts the real unknown rows at V4.
- **`claimedSuccessOnFail` counts toward p.**
  - p is about (1 - completion) × the share of failed runs that claim success. For example, 0.15 × 0.5 = **0.075**, which lies between the p 0.05 and p 0.10 rows.
  - At both of those rows rule (a) fails with rate 1.0, and the exact form gives 1 - 0.925^180 ≈ 0.999999.
  - So with no true difference, the locked rules would almost surely map the Jev path to `disable_jev_operator_switch` for every install.
  - They would also withhold MCP 0.12.0 about half the time.
- **No rule was changed.** The planner and this plan changed no D-15 rule and no round count in response. The owner decides at M-71-00, against the 66-10 smoke's real per-type event rates and before the V1 campaign starts:
  - accept D-15 and the unknown-exposure reading as frozen; or
  - amend them with a new `gateVersion` before V1.

## Verification

| Command | Result |
|---------|--------|
| Task 1 verify: `node --test tests/bench-stats.test.mjs tests/bench-report.test.mjs` | 102/102 |
| `node tests/mcp-in-flight-session-lookup.test.js` (the other stats.mjs importer) | 214 passed, 0 failed |
| `npx --offline -y node@20 --test tests/bench-stats.test.mjs` (v20.20.2) | 15/15 |
| Task 2 verify: synthetic suite on Node 24, then `npx node@20` | 17/17 each |
| Task 3 verify: power suite on Node 24, then `npx node@20` | 11/11 each |
| Task 3 verify: the `node -e` check on `recommendedRounds` | exit 0 |
| Official Node 20 binary on bench-stats, bench-gate-synthetic and bench-gate-power | 43/43 |
| The whole bench `node --test …` command | 433/433 (401 before this plan, then 422 after Task 2) |
| `node tests/delegation-phase-contract.test.js` | 1252 passed, 0 failed (after Tasks 2 and 3) |
| `/usr/bin/time -p node --test tests/bench-gate-power.test.mjs` | real 1.72 s (limit 30 s) |
| `node scripts/bench/gate/simulate-power.mjs --bogus` | exit 2, usage printed |
| Full run reproduced on the official Node 20 binary | byte-identical 71-POWER.json |
| Sweep `node scripts/bench/sweep-tests.mjs --files scripts/bench/lib/stats.mjs --baseline …/71-SWEEP-BASELINE.json` | **38/38 passed; NEW failures vs baseline: none; exit 0**. 7225 was held by the user's own hub, which I left running. |

**Acceptance checks:**
- **stats.mjs:** the removed-lines diff prints nothing, and `grep -c "export function newcombeDifference"` prints 1.
- **synthetic.mjs:** `grep -cE "Math\.random|Date\.now|process\.env|readFileSync"` prints 0.
- **simulate-power.mjs:** `grep -cE "Math\.random|Date\.now"` prints 0.
- **Registration:** the bench `node --test` string appears once in `package.json` `scripts.test` and once in `REFINEMENT_ROOT_TEST_COMMANDS`. It now ends with `tests/bench-gate-synthetic.test.mjs tests/bench-gate-power.test.mjs`. Each suite was registered in its own task's commit.
- **71-POWER.json:**
  - 104 table rows: 8 round counts × (4 p × 3 completion comparisons + 1 sentinel-speed);
  - coverage, `recommendedRounds`, `spend`, and 60 `safetyFalseFail.rows`, which is 30 × |{20, 30}|. The acceptance `node -e` check exits 0;
  - no `://`.
- **Crawler files.** The sweep ran suites that rewrite `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`. The diff was date-only, and I restored the files with `git checkout --`. The tree is clean.

## Decisions Made

- **R = 30 for every gate campaign.** It is chosen by `selectRounds` at the floor rate 0.80, and the sentinel's equivalence is the binding constraint. The margin, alpha and the 0.90 bound are constants.
- **The speed model uses completed runs at the floor rate.** `simulateSpeedSentinel` and `coverageBootstrap` take an optional `completion` (default 0.80), because the report and the evaluator compute speed over completed runs only. This is recorded in `assumptions.wallTime`.
- **A check of alpha at the margin.** `simulateCompletion` takes an optional `delta` (default 0), which `coverage.nonInferiorityAtMargin` uses to show the one-sided false pass rate at a true -10 points.
- **Per-cell seeds.** Each grid cell has its own seed, derived from the run seed. So the jev-ni and claude-ni rows are independent replications of the same R-vs-R design, not copies.
- **The generator's added interface,** for 71-06 and 71-07:
  - `makeRawCampaign`;
  - `scheduleSeed`, so a fixture can use the gate's schedule seed (71 or 66) while varying the draws;
  - the `safety` sidecar Map;
  - `standardNormal` and `SYNTHETIC_TASK_BASE_MS`, which the power script reuses;
  - the pin and candidate sha constants;
  - option checking: unknown keys, the cursor arm (never gated, D-03) and cells that cannot be filled all throw.
- **Status words.** A synthetic autopilot run claims `success` on a pass and `partial`/`blocked` on a failure, following the S12 status vocabulary. A Claude run claims `completeTask === pass`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ruleAExact` was not bit-identical across Node versions**
- **Found during:** Task 3, the Node 20 run of the snapshot test.
- **Issue:** `1 - (1 - p) ** n` differed in the last bit between Node 20 and Node 24 for 12 of the 60 snapshot rows. That would make the frozen snapshot fail in CI (Node 20), and the gate's copy of `power.safetyTable` would not be reproducible across versions. The simulated rates themselves were already identical.
- **Fix:** `powInt` computes (1 - p)^n by repeated multiplication. It is the same formula, but every step is a plain IEEE product, so the result is the same everywhere. I regenerated the snapshot from the new code.
- **Result:** Node 20 and Node 24 give byte-identical snapshot output and a byte-identical full 71-POWER.json.
- **Files:** scripts/bench/gate/simulate-power.mjs, tests/bench-gate-power.test.mjs
- **Commit:** `9b6a6442`

**2. [Rule 3 - Blocking, small] The task category split for task lists other than 12**
- **Found during:** Task 2 GREEN. The new custom-task-list test caught it.
- **Issue:** `k < n / 2` made 2 of 3 tasks "mixed".
- **Fix:** the first `floor(n / 2)` tasks are mixed, which is unchanged for 12 tasks. `perTask` also now repeats the 12 default base times for other task counts instead of throwing.
- **Commit:** `7452a255`

### Process deviations

**1. [TDD protocol] RED was not committed separately.**
- **Task 1:** bench-stats is already registered, so a RED commit would leave the registered chain red. This is the same reason as 71-03.
- **Tasks 2 and 3:** the plan gives one commit subject per task, and each suite is registered in that same commit.
- **Evidence:** see TDD Gate Compliance.

## TDD Gate Compliance

- **Task 1:**
  - **RED:** the extended bench-stats suite failed at link time, because `newcombeDifference` was not exported. That was before any stats.mjs edit.
  - **GREEN:** 15/15.
- **Task 2:**
  - **RED:** the new synthetic suite failed with the module missing.
  - **GREEN:** 16/16 first, then 17/17 after the custom-task-list test and its fix.
- **Task 3:**
  - **RED:** the new power suite failed with the module missing.
  - **GREEN:** 11/11 after the snapshot was filled from the first GREEN run and frozen, as the plan directs. It was regenerated once, for the determinism fix.
- **Commits:** there are no separate `test(71-04)` RED commits; Task 2's plan-given subject is itself `test(71-04)`.

## Notes for later plans

- **71-05:**
  - Copy `recommendedRounds.rounds` (30) into every `minRounds`.
  - Copy `table` rows as-is: `{comparison, rounds, p, pass}`, with the comparison names `jev-ni`, `claude-ni`, `sentinel-equivalence` and `sentinel-speed`.
  - Copy `spend` exactly. Its keys match the 71-05 schema.
  - Copy `safetyFalseFail.rows` as `power.safetyTable`. Every number lies in [0, 1].
  - Keep the default speed band: sentinel-speed is 1.0 at R = 30.
  - The power block's `seed`/`reps`/`speedReps`/`safetyReps`/`iterations` are 71 / 4000 / 100 / 4000 / 500.
- **71-06:**
  - Build each D-19 branch with `makeCampaign`:
    - `scheduleSeed` 71 or 66 to match the gate;
    - `identity: {gate: {path, sha256}}` for candidates;
    - `effect` keyed by `autopilot/on` and similar;
    - the `jev`, `fastMode` and `safety.events` recipes listed above.
  - Use the returned `safety` Map as `baseline.safety`.
  - Schema-1 campaigns default to `core-baseline-66` with git sha `8a058bdf…`.

## Deferred to Validation Block

Nothing was waited on.
- **V1, M-71-00 (owner sign-off, hard gate before the V1 campaign).** It is signed after the 66-10 V1 smoke, against that smoke's real per-type event rates.
  - Item 1 decides on D-15 and the `safety.unknownExposure: 'acted'` reading, using the "Safety false-fail exposure (for M-71-00)" table above (frozen into the gate's `power.safetyTable` by 71-05).
  - The owner either accepts both as frozen, or amends them with a new `gateVersion` file and its sha256 pin before V1.
- **V1, M-71-01b, and V4, M-71-06 and M-71-07 (spend).**
  - The spend at R = 30 must be restated in 71-VALIDATION.md: V1 720 runs, V4 autopilot 720, V4 Claude 360. This plan does not edit 71-VALIDATION.md; its rows already say "the exact N is whatever the frozen gate says".
  - V1 must run `--rounds 30`. If the owner declines that spend, the frozen rule applies: an under-round campaign is `inconclusive` and the margin never moves.
- **A1, the floor completion rate.** It is checked against V1's measured completion only after the gate is frozen. A lower real rate leaves the gate underpowered and is never a reason to relax the margin.

## Known Stubs

None. No TODO, FIXME, placeholder or empty data flowing to output in any created or modified file.

## Threat Flags

None beyond the plan's threat model:
- **T-71-01:** the rounds come from a seeded run that reproduces byte for byte on Node 20 and Node 24, committed with its parameters. The margin, the bound and alpha are constants.
- **T-71-08:** the thresholds are explicit, and `selectRounds` returns a `shortfall` when they are not met. It was not needed here: `met` is true.
- **T-71-07-b:** the false-fail table is computed and recorded for M-71-00.
- **T-71-SC:** no package was added.

No new endpoint, auth path, file access at a trust boundary or schema change.

## Self-Check: PASSED

- FOUND: scripts/bench/lib/stats.mjs (newcombeDifference)
- FOUND: scripts/bench/gate/lib/synthetic.mjs
- FOUND: scripts/bench/gate/simulate-power.mjs
- FOUND: tests/bench-stats.test.mjs, tests/bench-gate-synthetic.test.mjs, tests/bench-gate-power.test.mjs
- FOUND: .planning/phases/71-comparative-gate-and-release/71-POWER.json
- FOUND commits: fec5c727, 7452a255, 9b6a6442
