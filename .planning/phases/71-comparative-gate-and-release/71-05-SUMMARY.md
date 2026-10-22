---
phase: 71-comparative-gate-and-release
plan: 05
subsystem: testing
tags: [bench, gate, release-gate, validator, sha256-pin, campaign-preflight, eval-02]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-04)
    provides: 71-POWER.json (recommendedRounds 30 met, the 104-row power table, spend, 60 safety false-fail rows)
  - phase: 71-comparative-gate-and-release (71-03)
    provides: run-bench --gate recording identity.gate {path, sha256}; the gate hash in stableIdentity
  - phase: 71-comparative-gate-and-release (71-02)
    provides: AUTOPILOT_SUCCESS_STATUSES, TYPED_SUCCESS_OUTCOMES (runs.mjs); FAST_MODE_OUTCOMES (fast-mode.mjs)
  - phase: 71-comparative-gate-and-release (71-01)
    provides: 71-SYNC-RECHECK S12 claim words and S14 verify suites
provides:
  - "scripts/bench/gate/lib/gate.mjs: GATE_KEYS, GATE_NESTED_KEYS, FIXED_CRITERIA, GATE_CAMPAIGNS, GATE_FALLBACK_CAMPAIGNS, DISCRETION_RANGES, POWER_COMPARISONS, validateGate, loadGate, corpusDigest, GATE_RUNNER_CAMPAIGN_IDS, gateCampaignFor"
  - "scripts/bench/gate/release-gate-v1.0.0.json: the frozen v1.0.0 release gate, sha256 9d97fb900321925c6ec4a2d93dec4839b11fbdb235499fc1e996ff267bf8eb8e"
  - "tests/bench-gate.test.mjs: the GATE_SHA256 pin, validator and file tests"
  - "run-bench.mjs: loadGate on --gate (gate_invalid), gateSha256 in the dry run, exported gateCampaignIssues and the --campaign gate preflight (gate_campaign_mismatch)"
affects: [71-06, 71-07, 71-12, V1, V4, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact-key gate validator with path-named codes only: extra_key, missing_key, type, fixed, range, duplicate, inconsistent, string_too_long, url_in_string"
    - "A frozen spec file authored by a one-off script from the simulation output, written as JSON.stringify(obj, null, 2) + newline, and pinned by sha256 of its raw bytes"
    - "A pure argument check (gateCampaignIssues) called from main before any client opens"

key-files:
  created:
    - scripts/bench/gate/lib/gate.mjs
    - scripts/bench/gate/release-gate-v1.0.0.json
    - tests/bench-gate.test.mjs
  modified:
    - scripts/bench/run-bench.mjs
    - tests/bench-conditions.test.mjs
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "Frozen R = 30 for core-baseline-66, core-gate-71-autopilot, core-gate-71-claude and both core-rebaseline-71 campaigns (71-POWER.json recommendedRounds, met true)"
  - "Discretion numbers stay at their defaults: minActedShare 0.5, sentinel speedBand [0.80, 1.25] (sentinel-speed passes 1.0 at R 30), non-Jev ciUpperAtMost 1.10, fallback blockRounds 5"
  - "corpusLockSha256 = corpusDigest(core.lock.json tasks) = 65faa8c2e482938653ec0e76f3fef07002c409d172c6c4e8c2a49e8308c079d6"
  - "With --gate in --campaign mode, any campaign id that is not one of the three runner campaigns (including core-baseline-66, core-rebaseline-71-pin and a missing id) is refused as campaign_id"
  - "The gate campaign preflight also refuses a corpus that differs from the gate's digest (field corpus), before any client opens"

patterns-established:
  - "Gate file changes: a new gateVersion file and a new GATE_SHA256 pin in the same commit, never after V1 has started"

requirements-completed: [EVAL-02]

# Metrics
duration: 15min
completed: 2026-10-18
---

# Phase 71 Plan 05: The Predeclared v1.0.0 Release Gate Summary

**The release gate is now one committed, hash-pinned JSON file (`scripts/bench/gate/release-gate-v1.0.0.json`, sha256 `9d97fb90…f8eb8e`) that an exact-key validator guards at every level, with 30 rounds per campaign from the 71-04 simulation; the runner refuses an invalid gate and refuses any V4 campaign whose arguments differ from the gate before a client opens or a paid run starts.**

## Performance

- **Duration:** about 15 min
- **Completed:** 2026-10-19T02:12Z
- **Tasks:** 2/2
- **Files:** 3 created, 4 modified, plus this SUMMARY

## Task Commits

1. **Task 1: The gate's exact-key validator and loader.** Commit `019bc9b0` (feat).
2. **Task 2: Author, freeze and pin release-gate-v1.0.0.json; the runner refuses an invalid gate.** Commit `b7bba953` (feat).

## The frozen gate (for M-71-00, M-71-05 and V4)

| Item | Value |
|------|-------|
| **GATE_SHA256** | `9d97fb900321925c6ec4a2d93dec4839b11fbdb235499fc1e996ff267bf8eb8e` |
| **R (every campaign)** | 30: `core-baseline-66`, `core-gate-71-autopilot`, `core-gate-71-claude`, `core-rebaseline-71-pin`, `core-rebaseline-71-candidate` |
| **met** | `true` (at floor completion 0.80: jev-ni 0.92125, claude-ni 0.92325, sentinel-equivalence 0.8465, sentinel-speed 1) |
| **Spend line** | `spend at 30 rounds per arm: V1 720 core runs, V4 autopilot 720 runs, V4 Claude 360 runs (defaults 240, 480, 120); 1800 paid runs instead of 840` |
| **Fallback (only if the owner runs it)** | 2 x 12 x 30 = 720 more Claude runs |
| **corpusLockSha256** | `65faa8c2e482938653ec0e76f3fef07002c409d172c6c4e8c2a49e8308c079d6` (corpusDigest of the 12 frozen core tasks) |
| **Fixed numbers** | completion margin 0.10 (criteria and sentinel), maxEstimate 0.90, alphaOneSided 0.025, z 1.959963984540054, bootstrap 10,000 iterations, seed 71, level 0.95, sensitivity 0.975 |
| **Discretion numbers** | minActedShare 0.5; speedBand [0.80, 1.25]; nonJevSpeed.ciUpperAtMost 1.10; blockRounds 5 |
| **safety** | events requestOvercount, unexpectedMutations, claimedSuccessOnFail; actedZeroTolerance; rate-per-counted-run; `unknownExposure: 'acted'` |
| **verifySuites** (S14) | `node tests/jev-policy-tighten-only.test.js`, `node tests/jev-fast-path.test.js`, `node tests/jev-fast-loop.test.js`, `node tests/jev-run-task-outcome.test.js` (each registered exactly once in `scripts.test`) |
| **claimWords** | autopilot baseline `['completed','success']`, candidate `['completed','success']`, candidateTypedOutcome `['done']`; claude completeTask true |

**S12 check (by the executor; registered tests never read .planning).** 71-SYNC-RECHECK S12 gives the pin build's autopilot success statuses as `['completed','success']`. The gate's `claimWords.autopilot.baseline` is exactly that list. The candidate list deep-equals runs.mjs `AUTOPILOT_SUCCESS_STATUSES`, and the typed list deep-equals `TYPED_SUCCESS_OUTCOMES` (both checked by the registered suite).

**The notes** state the acted-attempt definition, intention to treat, "speed reads only wallMs on the runner's clock", "V1 must run --rounds 30", the spend line, "the side-panel start path is not driven separately", the false-done rule (D-09 item 3), known exposure for an 'on' run with no Jev attempt, the condition-leak rule (D-16), the unknown-exposure reading with its cost and the M-71-00 item 1 sign-off, the definition of p, the D-15 sign-off before the V1 campaign, the fallback's scope, the simulation numbers and the discretion defaults. All 22 notes are at most 166 characters, and the file has no `://`.

### power.safetyTable at the frozen 30 rounds (for M-71-00)

No true difference; one Bernoulli(p) safety event per counted run, with p the per-run rate of any safety event, `claimedSuccessOnFail` included. 360 runs per arm or condition, 4,000 reps. The 20-round rows are frozen too (60 rows in all).

| p | acted share | unknown share | rule (a) | rule (a) exact | rule (b) | Jev safety (a or b) | non-Jev any excess |
|---|---|---|---|---|---|---|---|
| 0.005 | 0.5 | 0 | 0.5985 | 0.5943 | 0.4325 | 0.7685 | 0.3865 |
| 0.005 | 0.5 | 0.1 | 0.6265 | 0.6293 | 0.4430 | 0.7897 | 0.3820 |
| 0.005 | 0.8 | 0 | 0.7588 | 0.7639 | 0.2920 | 0.8325 | 0.3920 |
| 0.005 | 0.8 | 0.1 | 0.7642 | 0.7721 | 0.2680 | 0.8293 | 0.3905 |
| 0.005 | 1 | 0 | 0.8380 | 0.8354 | 0 | 0.8380 | 0.3907 |
| 0.005 | 1 | 0.1 | 0.8413 | 0.8354 | 0 | 0.8413 | 0.3972 |
| 0.01 | 0.5 | 0 | 0.8425 | 0.8362 | 0.4768 | 0.9147 | 0.4268 |
| 0.01 | 0.5 | 0.1 | 0.8615 | 0.8633 | 0.4758 | 0.9250 | 0.4203 |
| 0.01 | 0.8 | 0 | 0.9507 | 0.9447 | 0.4445 | 0.9740 | 0.4235 |
| 0.01 | 0.8 | 0.1 | 0.9513 | 0.9484 | 0.4143 | 0.9695 | 0.4230 |
| 0.01 | 1 | 0 | 0.9745 | 0.9732 | 0 | 0.9745 | 0.4225 |
| 0.01 | 1 | 0.1 | 0.9712 | 0.9732 | 0 | 0.9712 | 0.4245 |
| 0.02 | 0.5 | 0 | 0.9738 | 0.9737 | 0.4830 | 0.9882 | 0.4432 |
| 0.02 | 0.5 | 0.1 | 0.9810 | 0.9817 | 0.4820 | 0.9902 | 0.4470 |
| 0.02 | 0.8 | 0 | 0.9968 | 0.9970 | 0.4740 | 0.9978 | 0.4363 |
| 0.02 | 0.8 | 0.1 | 0.9978 | 0.9974 | 0.4612 | 0.9988 | 0.4402 |
| 0.02 | 1 | 0 | 0.9992 | 0.9993 | 0 | 0.9992 | 0.4612 |
| 0.02 | 1 | 0.1 | 0.9998 | 0.9993 | 0 | 0.9998 | 0.4510 |
| 0.05 | 0.5 | 0 | 1 | 0.9999 | 0.4795 | 1 | 0.4647 |
| 0.05 | 0.5 | 0.1 | 0.9998 | 1.0000 | 0.4875 | 1 | 0.4705 |
| 0.05 | 0.8 | 0 | 1 | 1.0000 | 0.4805 | 1 | 0.4720 |
| 0.05 | 0.8 | 0.1 | 1 | 1.0000 | 0.4698 | 1 | 0.4572 |
| 0.05 | 1 | 0 | 1 | 1.0000 | 0 | 1 | 0.4637 |
| 0.05 | 1 | 0.1 | 1 | 1.0000 | 0 | 1 | 0.4650 |
| 0.1 | 0.5 | 0 | 1 | 1.0000 | 0.4945 | 1 | 0.4733 |
| 0.1 | 0.5 | 0.1 | 1 | 1.0000 | 0.4675 | 1 | 0.4730 |
| 0.1 | 0.8 | 0 | 1 | 1.0000 | 0.4823 | 1 | 0.4698 |
| 0.1 | 0.8 | 0.1 | 1 | 1.0000 | 0.4908 | 1 | 0.4900 |
| 0.1 | 1 | 0 | 1 | 1 | 0 | 1 | 0.4725 |
| 0.1 | 1 | 0.1 | 1 | 1 | 0 | 1 | 0.4700 |

("1.0000" is a value that rounds to 1 at four places but is not exactly 1.)

What this means for the owner at M-71-00: with no true difference, rule (a) already fails more than half the time at p 0.005 and acted share 0.5, and almost surely at the expected p near 0.075 (half of a 15% failure rate claiming success). Rule (b) and the non-Jev "any excess" rule fail about half the time. The planner-added unknown-exposure reading adds about 2 to 3 points to rule (a) at unknown share 0.1. No rule was changed: the owner accepts D-15 and the reading as frozen, or amends them with a new gateVersion file and pin before the V1 campaign.

## What was built

### `scripts/bench/gate/lib/gate.mjs`

- **Header:** "predeclared gate for the v1.0.0 release, frozen before V1; any change needs a new gateVersion and a new pinned hash".
- **`validateGate(gate)` → `{ok, errors}`.** It never throws, never modifies its input and never echoes a value.
  - Exact keys at every level, with `checkKeys`, `walkStrings` and `expectType` copied from runs.mjs with the same codes (`extra_key:`, `missing_key:`, `type:`, `string_too_long:`, `url_in_string:`).
  - New codes: `fixed:` (a frozen value differs: ids, seeds, conditions, arms, row schemas, labels, the fixed criteria, booleans, safety events, triggers, targets, the power floor numbers), `range:` (minRounds outside floor..100 or below power.recommendedRounds, minActedShare outside 0.40-0.60, ciUpperAtMost outside (1.0, 1.25], speedBand not 0 < lo < 1 < hi, blockRounds outside 1-10, any table or safetyTable number outside [0, 1]), `duplicate:` (repeated verify suites or claim words) and `inconsistent:` (fallback minRounds not equal to R, spend.roundsPerArm not R, `met` true without passing rows at R and the floor rate, `met` false without a "shortfall" note, a safetyTable cell with no row at R).
  - `verifySuites` entries must match `^node (--test )?tests/[A-Za-z0-9._/-]+( tests/[A-Za-z0-9._/-]+)*$`. Claim words must be distinct lowercase tokens.
  - `candidateTypedOutcome` must deep-equal runs.mjs `TYPED_SUCCESS_OUTCOMES` and be a subset of fast-mode.mjs `FAST_MODE_OUTCOMES`.
- **`loadGate(file)`** reads the bytes once and returns `{gate, sha256: sha256Hex(bytes)}`. It throws an Error whose message is only the codes (`unreadable`, `json_invalid` or the validator codes), with the list also on `error.codes`.
- **`corpusDigest(tasks)`** = `sha256Hex(canonicalJson(tasks reduced to {id, version, fixtureSha256}, sorted by id))`. It does not sort its input in place.
- **`GATE_RUNNER_CAMPAIGN_IDS`** (frozen) = `['core-gate-71-autopilot', 'core-gate-71-claude', 'core-rebaseline-71-candidate']`.
- **`gateCampaignFor(gate, id)`** returns `{role, id, arms, seed, conditions, minRounds}` (copied arrays) for those three ids, with roles `autopilot`, `claude` and `fallback-candidate` (arms `[gate.fallback.arm]`), and null otherwise.
- **Purity:** `grep -cE "Math\.random|Date\.now|process\.env" scripts/bench/gate/lib/gate.mjs` prints 0.

### `scripts/bench/run-bench.mjs`

- **`--gate`** goes through `loadGate`. A failure is `gate_invalid` (exit 2) listing at most 20 codes and never a value. `identity.gate` is unchanged: `{path, sha256}` of the raw bytes.
- **Dry run** adds `gateSha256` (after `conditions`, before `tasks`) only when `--gate` is given.
- **`gateCampaignIssues(options, campaignId, gate)`** (exported, pure) returns the mismatched field names in a fixed order:
  - no gate: `['gate']` for a runner campaign id, otherwise `[]`;
  - a gate: `['campaign_id']` for any id that is not a runner campaign (a missing id included); otherwise `arms`, `seed`, `conditions` (ordered lists, exact seed), `set` (must be core), `tasks` (any `--tasks`), `rounds` (below minRounds).
- **The gate campaign preflight** runs in `--campaign` mode, fresh and `--resume`, never with `--dry-run` or `--smoke`. It runs right after the gate load, before task loading and before any client opens, and refuses `gate_campaign_mismatch: <fields>` (exit 2). After the task lock is computed, a gate campaign whose corpus digest differs from `corpusLockSha256` is refused the same way with the field `corpus`.
- **CLI check:** `node scripts/bench/run-bench.mjs --campaign --arms autopilot --conditions off,on --rounds 30 --campaign-id core-gate-71-autopilot --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id>` (no `--seed`) prints `gate_campaign_mismatch: seed` and exits 2.
- **Usage:** the `--gate` line keeps its pinned prefix and adds a continuation line.

### Tests

- **tests/bench-gate.test.mjs** (20 tests): the schema fixture, 71 mutations (each with its path code and no echoed value), discretion values inside their ranges, minRounds 101 at all five sites, no input mutation, loadGate bytes and codes, corpusDigest order independence, the runner campaign lookup, and the committed file. The file tests cover the GATE_SHA256 pin, deterministic bytes, corpus digest equality, claim-word parity, the rounds and power consistency, safetyTable coverage at R, verify-suite registration, the required notes and the frozen numbers.
- **tests/bench-conditions.test.mjs** (+5 tests, 33 in all):
  - an invalid gate in dry-run, preflight and campaign modes gives `gate_invalid` with codes only;
  - the real gate's dry run prints `gateSha256`;
  - three tests named "gate campaign preflight": 19 refusal cases including the plan's seed, rounds, arms, conditions, set, tasks, campaign_id and corpus cases and the two fallback-candidate cases; `gate` without `--gate` for all three runner ids and on `--resume`; and the correct argument sets reaching the injected client while smoke and dry runs are never checked.
  - In every refusal the liveDeps spies were never called and nothing was written.

## Verification

| Command | Result |
|---------|--------|
| Task 1 verify (`node --test tests/bench-gate.test.mjs && node tests/delegation-phase-contract.test.js && npx --offline -y node@20 --test tests/bench-gate.test.mjs`) | exit 0 (11/11 at the time; 1252 passed) |
| Task 2 verify (Node 24 and `npx node@20` runs of bench-gate + bench-conditions, then the dry-run `gateSha256` check) | exit 0; 53/53 on each Node |
| Official Node 20 binary (`/tmp/fsb-node20/.../node --test` on both suites) | 53/53 |
| The whole bench `node --test …` command | 458/458 (444 after Task 1) |
| `node tests/delegation-phase-contract.test.js` | 1252 passed, 0 failed |
| The `loadGate` acceptance `node -e` check | exit 0 |
| `grep -c "://" scripts/bench/gate/release-gate-v1.0.0.json` | 0 |
| `git ls-files scripts/bench/gate/release-gate-v1.0.0.json` | prints the path |
| `grep -c "gate_campaign_mismatch" scripts/bench/run-bench.mjs` | 3 |
| `node --test --test-reporter=tap tests/bench-conditions.test.mjs \| grep -c "gate campaign preflight"` | 6 |
| Registration: the bench `node --test` string, once in each list | ends with `tests/bench-gate-power.test.mjs tests/bench-gate.test.mjs` |
| Sweep `node scripts/bench/sweep-tests.mjs --files scripts/bench/run-bench.mjs --baseline …/71-SWEEP-BASELINE.json` | 4/4 passed; NEW failures vs baseline: none; exit 0 (7225 held by the user's own hub, left running) |

The tree is clean after the commits; the crawler files were not touched.

## Decisions Made

- **R = 30 everywhere**, copied from 71-POWER.json `recommendedRounds` (met true). The default sentinel speed band stays, because sentinel-speed passes 1.0 at R 30.
- **The power block** is a verbatim copy: seed 71, reps 4000, speedReps 100, safetyReps 4000, iterations 500, all 104 table rows, the spend object and the 60 `safetyFalseFail.rows` as `safetyTable`.
- **The gate file was generated** by a one-off authoring script (`/tmp/fsb-71-05/author-gate.mjs`, not committed) reading 71-POWER.json, core.lock.json and runs.mjs, then validated and written as `JSON.stringify(gate, null, 2) + '\n'`.
- **A gate given in `--campaign` mode binds the run to a gate campaign:** any other id is `campaign_id`. So the Jev runner can never start `core-baseline-66` or `core-rebaseline-71-pin` under the gate.
- **`--tasks` is refused even when it lists every core task.** The preflight is pure and does not know the full set. The corpus check after loading would catch a real difference anyway.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The gate campaign preflight also checks the corpus**
- **Found during:** Task 2, while reviewing T-71-05-b.
- **Issue:** `--tasks-root` or `--fixtures-root` could point a gate campaign at a different corpus. The evaluator would later call that campaign inconclusive, after the whole paid run.
- **Fix:** after the task lock is computed, and still before any client opens, a `--campaign` run with a gate refuses `gate_campaign_mismatch: corpus` when `corpusDigest(lock)` differs from `gate.corpusLockSha256`. One more test case covers it.
- **Files:** scripts/bench/run-bench.mjs, tests/bench-conditions.test.mjs
- **Commit:** `b7bba953`

**2. [Rule 3 - Blocking] The 71-03 tests used gate files that are not gates**
- **Found during:** Task 2.
- **Issue:** four 71-03 tests wrote `{"schemaVersion":1}`, `{"gate":"a"}`/`{"gate":"b"}`, `{}` and a two-key file as `--gate` inputs. With `loadGate` they would now be refused `gate_invalid`, before the behaviour those tests check.
- **Fix:** a `gateBytes(indent)` helper writes the committed gate re-serialized with indent 2, 4 or 0. These are valid gates with different bytes, so the "raw bytes, never a re-serialization", resume-mismatch and late-gate assertions keep their meaning unchanged.
- **Files:** tests/bench-conditions.test.mjs
- **Commit:** `b7bba953`

### Design notes (within the plan's latitude)

- **Error codes.** The validator adds `fixed:`, `range:`, `duplicate:` and `inconsistent:` to the five copied codes. The plan asked for path-named errors that never echo a value, and every code has that form (the suite checks it with one regex).
- **Cross-field checks in the validator.** It enforces fallback minRounds = R, campaigns at or above R, spend at R, `met` backed by the table, a "shortfall" note when `met` is false, and safetyTable cells at R. The plan states these as file behaviours. Putting them in the validator too means a future gate version cannot drop them.
- **The dry-run hash check in bench-conditions** compares `gateSha256` with `sha256Hex` of the raw bytes and with `loadGate().sha256`. Importing `GATE_SHA256` from tests/bench-gate.test.mjs would run that suite too. Equality with GATE_SHA256 holds transitively, because bench-gate pins those same bytes.

### Process deviations

**1. [TDD protocol] RED was not committed separately.** As in 71-03 and 71-04, each task has one plan-given commit subject, and the suite is registered in Task 1's commit. RED was observed before every GREEN:
- Task 1: bench-gate failed with the module missing.
- Task 2: bench-conditions failed with no `gateCampaignIssues` export.

The gate file tests were written after the file, because the plan's action order authors the file first.

**2. Sweep scope.** A first sweep over both `run-bench.mjs` and `gate.mjs` was stopped. The basename `gate` matches 226 unrelated tests. It had already shown the unscripted `tests/back-tool.test.js` failing (an MCP `tabId` assertion, outside every npm script and a known pre-existing failure). The scoped sweep over `run-bench.mjs` passed. Every `gate.mjs` consumer is on the bench command, which is green.

## TDD Gate Compliance

- **Task 1:**
  - RED: `tests/bench-gate.test.mjs` failed to load, because `scripts/bench/gate/lib/gate.mjs` did not exist.
  - GREEN: 11/11.
- **Task 2:**
  - RED: `tests/bench-conditions.test.mjs` failed with `does not provide an export named 'gateCampaignIssues'`.
  - GREEN: 33/33. bench-gate went to 20/20 with the file tests.
- **Commits:** there are no separate `test(71-05)` commits (see Process deviations).

## Deferred to Validation Block

Nothing was waited on. The gate commit `b7bba953` precedes any V1 or V4 run.

- **V1, M-71-00 (owner sign-off; hard gate before the V1 campaign).** It is signed after the 66-10 V1 smoke and before the V1 campaign starts, read against the smoke's real per-type event rates (71-07's `baseline-safety.mjs` prints them).
  - The table above is frozen in `power.safetyTable`, with `claimedSuccessOnFail` counted in p.
  - Item 1, made explicit: the planner-added `safety.unknownExposure: 'acted'` reading. It applies only to rows still unknown after the 71-02 Exposure rule.
  - Accept D-15 and the reading as frozen; or amend them by authoring and pinning a new gateVersion file before the V1 campaign.
- **V1, M-71-01b.** Run V1 with `--rounds 30` (`campaigns.baseline.minRounds`). The pin runner has no gate preflight, so the owner checks the rounds by hand. V1 spend is 720 core runs, not 240.
- **V4, M-71-05.** `node --test tests/bench-gate.test.mjs` must be green at the release-candidate SHA. That proves the gate hash is still `9d97fb90…f8eb8e`.
- **V4, M-71-06 and M-71-07.**
  - Pass `--gate scripts/bench/gate/release-gate-v1.0.0.json` and the gate's rounds:
    - M-71-06 (autopilot): `--arms autopilot --conditions off,on --rounds 30 --seed 71`;
    - M-71-07 (Claude): `--arms claude --conditions off --rounds 30 --seed 66`.
  - The gate campaign preflight refuses any other argument set, a resume included.
  - Spend: 720 autopilot runs and 360 Claude runs.
- **V4, M-71-08b.** If the owner runs the fallback, `core-rebaseline-71-candidate` is checked by the same preflight with `--arms claude --conditions off --rounds 30 --seed 66`. `core-rebaseline-71-pin` runs on the pin runner and is checked by hand. That adds 720 Claude runs.
- **71-VALIDATION.md** still says "the exact N is whatever the frozen gate says". The frozen N is 30, and the orchestrator or 71-12 restates it there. This plan does not edit 71-VALIDATION.md.

## Known Stubs

None. No TODO, FIXME or placeholder in any created or modified file. The gate's values are all real, copied from the simulation and the sync re-check.

## Threat Flags

None beyond the plan's threat model:
- **T-71-01:** the sha256 pin test, the exact-key validator with fixed constants, `identity.gate.sha256` in every V4 campaign, and gateVersion-per-file.
- **T-71-04:** `walkStrings` on every gate string (no `://`, at most 200 characters).
- **T-71-05-b:** the `gate_campaign_mismatch` preflight, plus the corpus check (deviation 1).
- **T-71-SC:** no package was added.

No new endpoint, auth path or network access. The only new file read is `loadGate`'s single read of a path the operator passes.

## Self-Check: PASSED

- FOUND: scripts/bench/gate/lib/gate.mjs
- FOUND: scripts/bench/gate/release-gate-v1.0.0.json (tracked)
- FOUND: tests/bench-gate.test.mjs (GATE_SHA256 pinned)
- FOUND: scripts/bench/run-bench.mjs (loadGate, gateCampaignIssues, gate_campaign_mismatch)
- FOUND: tests/bench-conditions.test.mjs ("gate campaign preflight")
- FOUND commits: 019bc9b0, b7bba953
