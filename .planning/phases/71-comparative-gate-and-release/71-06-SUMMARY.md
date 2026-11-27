---
phase: 71-comparative-gate-and-release
plan: 06
subsystem: testing
tags: [bench, gate, evaluator, verdicts, newcombe, bootstrap, safety, exercise, sentinel, fallback, eval-02, eval-01]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-05)
    provides: the frozen gate (release-gate-v1.0.0.json, sha256 9d97fb90…f8eb8e), loadGate, corpusDigest, the claim words, verifySuites, fallback block
  - phase: 71-comparative-gate-and-release (71-04)
    provides: newcombeDifference (stats.mjs); makeCampaign, defaultIdentity, the safety sidecar Map and the jev/fastMode/safety/leakOff recipes (synthetic.mjs)
  - phase: 71-comparative-gate-and-release (71-02)
    provides: v2 rows (condition, jev with the Exposure rule source, safety, endLabel, fastMode), isClaimedSuccess, END_LABELS
  - phase: 71-comparative-gate-and-release (71-03)
    provides: identity.gate {path, sha256} on candidate campaigns; identity.resumes[] entries
provides:
  - "scripts/bench/gate/lib/evaluate.mjs: evaluateGate and its exported criterion helpers, the REASONS / REFUSAL_CODES / FALLBACK_STATUSES vocabularies"
  - "tests/bench-gate-evaluate.test.mjs: one synthetic campaign per verdict branch (45 tests), registered on the bench node --test command"
affects: [71-07, 71-12, V4, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Criteria are computed once as {status, reasons, ...numbers}; jevVerdict/nonJevVerdict are pure precedence functions over computed criteria plus a guards list, so the fallback reuses them and sensitivity can never feed a verdict"
    - "Reason codes are fixed snake_case strings, optionally ':<detail>' (identity_mismatch:<field>, <trigger>:sentinel[.<field>]); refusals are {code, detail} with field names only"
    - "Bootstrap inputs are sorted per task, so the result never depends on row order"

key-files:
  created:
    - scripts/bench/gate/lib/evaluate.mjs
    - tests/bench-gate-evaluate.test.mjs
  modified:
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "A sentinel that is inconclusive passes its trigger-class causes to the non-Jev reasons as resume_drift:sentinel or identity_mismatch:sentinel.<field>, so the fallback applies when the non-Jev verdict is inconclusive because of a listed trigger; an under-round sentinel gives only sentinel_inconclusive and never triggers it"
  - "The Jev verdict is also inconclusive (corpus_mismatch) when the autopilot campaign's corpus digest differs from the gate's lock"
  - "A listed verify suite with no result is inconclusive (suites_incomplete); a failed suite is a safety fail"
  - "An acted row proves calibration only with a non-empty calibrationStatuses holding 'calibrated' alone"
  - "Safety rates are events per counted run, where a run contributes each event kind at most once (claimedSuccessOnFail is the per-run union of the status and typed claims)"

patterns-established:
  - "Every gate number is read from the gate object; the only literals are the pin prefix 8a058bdf, the sensitivity z 2.241402727604947 and the category names, all named constants"

requirements-completed: [EVAL-02, EVAL-01]

# Metrics
duration: 20min
completed: 2026-10-18
---

# Phase 71 Plan 06: The Pure Gate Evaluator Summary

**`evaluateGate` turns committed rows and identities into a pass, fail, inconclusive or not_exercised verdict for each fast path, with every criterion's numbers. It reads speed only from runner wallMs, treats null safety evidence as unverifiable and refuses tampered inputs. Every D-19 branch, refusal and inconclusive reason is proven on seeded synthetic campaigns, on Node 24 and Node 20.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-19T02:14Z
- **Completed:** 2026-10-19T02:33Z
- **Tasks:** 2/2
- **Files:** 2 created, 2 modified, plus this SUMMARY

## Accomplishments

- **One pure module** with no clock, environment, filesystem, git or network. It never imports report.mjs. The purity grep prints 0, and the `speedComparison` source slice names no `jevMs`, `latencyMs` or `modelMs`.
- **Both Jev labels share one comparison** (`core-gate-71-autopilot`, on vs off). They are identical except for the label:
  - speed passes only when the CI upper bound is below 1.0, the estimate is at most 0.90, and the estimate is below the lower bound of the control's A/A floor;
  - completion is Newcombe non-inferiority at -10 points;
  - safety applies rules (a) and (b), unknown exposure counted as acted, and the tighten-only suites;
  - the exercised precondition gates the verdict.
- **The non-Jev MCP path** compares the pin with candidate claude runs:
  - time non-inferiority at CI upper <= 1.10, with the `faster` label only below 1.0;
  - completion non-inferiority;
  - excess safety events over the pin fail it;
  - unverifiable baseline evidence makes it inconclusive.
- **The guards:**
  - nine top-level refusal codes;
  - identity mismatches on the gate's D-06 fields (corpus against the lock, Chrome major parsed);
  - resume drift (Pitfall 8);
  - minRounds, which needs both the scheduled and the observed rounds;
  - the drift sentinel, with the gate's blocker on a trip;
  - the core-rebaseline-71 fallback with its own refusals.
- **Descriptive only:** the Bonferroni sensitivity line at 0.975, the per-category ratios with the PROJECT targets as met or not met, and end-label and meta-loop-break counts by condition.

## Task Commits

1. **Task 1: Criterion helpers and the per-path verdicts (speed, completion, safety, exercise)** - `6b442b36` (feat)
2. **Task 2: Guards: refusals, identity and resume checks, rounds, sentinel, sensitivity and categories** - `87100f37` (feat)

## Files Created/Modified

- `scripts/bench/gate/lib/evaluate.mjs` (created, 1013 lines): the evaluator.
- `tests/bench-gate-evaluate.test.mjs` (created, 45 tests): the fixtures and assertions.
- `package.json`: ` tests/bench-gate-evaluate.test.mjs` appended to the bench `node --test` command. It is now the last file of that command and appears once.
- `tests/delegation-phase-contract.test.js`: the identical string in `REFINEMENT_ROOT_TEST_COMMANDS`, changed in the same commit. The `PRE_PHASE6x` hashes are untouched.

## Exported API (for 71-07)

**Constants:**
- `PIN_SHA_PREFIX` ('8a058bdf')
- `SENSITIVITY_Z` (2.241402727604947)
- `SENSITIVITY_LABEL`
- `CATEGORIES` (['mixed', 'click-heavy'])
- `UAT_NOT_MEASURED`
- `VERDICTS`
- `REASONS`
- `REFUSAL_CODES`
- `FALLBACK_STATUSES` (['not_supplied', 'not_triggered', 'used', 'refused'])

**Comparisons:**
- `groupRows({baseline, autopilot, claude}, gate)` gives `{baselineAutopilot, baselineClaude, autopilotOff, autopilotOn, claudeOff}`, core-set rows only.
- `speedComparison(controlRows, treatmentRows, {iterations, seed, level})` reads only wallMs, pass, infraError and taskId. Its status is `'ok'`, or `'n/a'` with null numbers.
- `aaFloor(controlRows, opts)`: odd rounds against even rounds over completed control rows.
- `completionComparison(controlRows, treatmentRows, z)` gives `{control, treatment, diff, ci, z}`, treatment minus control.

**Criteria:**
- `jevSpeedCriterion(speed, floor, gate)`
- `nonJevSpeedCriterion(speed, gate)` (carries `faster`)
- `completionCriterion(completion, gate)`

**Safety:**
- `safetyEventsOf(row, {gate, build: 'baseline'|'candidate', sidecar})` gives `{kinds, events, unverifiable}`.
- `jevSafety({onRows, offRows, gate, suites})` gives `{status, reasons, failReasons, inconclusiveReasons, exposure, ruleA, ruleB:{on, off}, suites}`.
- `nonJevSafety({baselineRows, candidateRows, gate, baselineSidecar})`

**Exercise and verdicts:**
- `exerciseStats({onRows, offRows, gate})` gives `{status, reasons, onCounted, actedRuns, actedShare, minActedShare, unknownExposureRuns, pairs:{servedModels, instrumentVersions}, uncalibratedActedRuns, leakRuns, leakRunIds, captureArm:'by_construction'}`.
- `jevVerdict({criteria, guards})` and `nonJevVerdict({criteria, guards})`: pure precedence functions.

**Guards and the fallback:**
- `chromeMajor(identity)`
- `identityMismatches(a, b, fields, gate)`
- `resumeDrift(identity)`
- `meetsMinRounds(campaign, minRounds)`
- `sentinelCheck({gate, baselineRows, candidateRows, guards, opts})`
- `evaluateFallback({gate, gateSha256, primary, fallback, candidateSha, opts})` gives `{result, replacement}`.

**`evaluateGate(input, {iterations})`:**
- The input is the shape in the plan's `<interfaces>`. `iterations` defaults to `gate.bootstrap.iterations`; the seed and level always come from `gate.bootstrap`.
- **On a refusal** it returns `{refusals, campaigns, inputs}` and nothing else.
- **Otherwise** it returns `{refusals: [], campaigns, exercise, sentinel, paths, fallback, categories, sensitivity, diagnostics, inputs}`:
  - each path is `{label, verdict, reasons, guards, criteria}`;
  - `mcp-non-jev` also has `faster` and `source`.

## REASONS vocabulary

| Group | Codes |
| --- | --- |
| Jev speed | `ci_upper_not_below_1`, `estimate_above_max`, `not_below_aa_floor`, `aa_floor_unavailable`, `speed_unavailable` |
| Non-Jev speed | `time_noninferiority` |
| Completion | `completion_noninferiority`, `completion_unavailable` |
| Safety | `acted_safety_event`, `excess_llm_path_events`, `excess_safety_events`, `safety_unverifiable`, `baseline_safety_unverifiable`, `suites_not_run`, `suites_incomplete`, `tighten_only_suite_failed` |
| Exercise (D-16) | `no_on_runs`, `uncalibrated`, `acted_share_below_min`, `model_instrument_pair`, `condition_leak` |
| Guards | `underpowered`, `resume_drift`, `corpus_mismatch`, `identity_mismatch` (always `identity_mismatch:<field>`), `sentinel_trip`, `sentinel_inconclusive` |
| The sentinel's own result | `completion_not_equivalent`, `speed_outside_band`, `sentinel_unavailable` |

**Inherited from the sentinel** (non-Jev only): `resume_drift:sentinel` and `identity_mismatch:sentinel.<field>`.

**REFUSAL_CODES:**
- **Top level:** `gate_hash_missing`, `gate_hash_mismatch`, `campaign_id_mismatch`, `campaign_schedule_mismatch`, `candidate_dirty`, `candidate_sha_mismatch`, `baseline_not_pin`, `candidate_row_schema`, `baseline_row_schema`.
- **Fallback only:** `fallback_campaign_mismatch`, `fallback_pin_not_pin`, `fallback_candidate_not_measured`.

## Suite runtime

| Run | Tests | Duration |
| --- | --- | --- |
| `node --test tests/bench-gate-evaluate.test.mjs`, Node 24.14.1 | 45/45 | about 8.3 s |
| Official Node 20.20.2 (`/tmp/fsb-node20`) | 45/45 | about 10.1 s |
| `npx --offline -y node@20` | 45/45 | pass |
| The whole bench `node --test` command | 503/503 | about 8.8 s |
| `node tests/delegation-phase-contract.test.js` | 1252 passed, 0 failed | — |
| Task 2 verify command (evaluate + gate + synthetic) | 82/82 | — |

The Node 20 run stays well under the plan's 60 s ceiling. The fixtures use 400 bootstrap iterations and the gate's real 30 rounds, and each campaign is generated in under 20 ms.

## Verdict branches proven (D-19)

**The Jev paths:**
- (1) Pass. Both labels hold identical numbers.
- (2) The CI crosses 1: `ci_upper_not_below_1`.
- (3) True 0.95 at log-sd 0.05: exactly `['estimate_above_max']`.
- (4) Inside the A/A floor: exactly `['not_below_aa_floor']`.
- (5) `completion_noninferiority`.
- (6) Rule (a): `acted_safety_event`.
- (7) Rule (b): `excess_llm_path_events`.
- (8) `safety_unverifiable`.
- (9) `suites_not_run` (also when `suites` is absent), `tighten_only_suite_failed` and `suites_incomplete`.
- (10) `uncalibrated`, `acted_share_below_min`, `model_instrument_pair`, and `condition_leak` for each of the `calls`, `local` (jevCalls 0, acted false, source 'measurement') and `summary` leak kinds.
- (12) False done:
  - on an acted run: `acted_safety_event`, and only on candidate builds;
  - on a non-acted run: `excess_llm_path_events`;
  - with a passing checker: pass;
  - a done that agrees with a success status: 1 event, not 2.
- (13) Unknown exposure: acted for rule (a), not acted for the acted share.
- (14) The 2026-10-16 decision, cross-checked:
  - `no_block` rows: unflagged, not acted, judged under rule (b);
  - summary-sourced rows: take the summary's acted value;
  - `detailMissingRate` rows: unknown exposure, so acted for rule (a).

**The non-Jev path:**
- (11) Pass with `faster` at true 0.95 (CI upper 0.988).
- Pass without `faster` at true 1.02 (CI upper 1.061).
- `time_noninferiority` at 1.25.
- `excess_safety_events`, with the Jev paths unchanged.

**Cross-cutting:**
- The speed fields are independent of jevMs, model time and host time.
- Precedence:
  - a safety fail outranks not exercised;
  - not exercised outranks a speed fail;
  - inconclusive outranks a fail.
- Determinism: the same input gives deep-equal output, and reversing the rows changes nothing.

**Guards:**
- Every refusal code is exercised, and the paths are omitted when there is one.
- Each of the seven `identityMatch.claude` fields leaves only `mcp-non-jev` inconclusive, with the Jev paths deep-equal to the pass fixture.
- A missing value counts as a mismatch.
- The reported fields are copied, never compared.
- Resume drift:
  - in the claude campaign, it affects non-Jev only;
  - a Chrome major change in the autopilot campaign makes Jev and the sentinel inconclusive.
- Under-round campaigns: the autopilot campaign, the baseline and the claude campaign each tested, plus an observed-rounds truncation.
- The sentinel:
  - it passes on the defaults;
  - it trips on a completion drop and on a 1.5x off path, carrying the blocker while the Jev verdict stays pass;
  - an identity mismatch makes it inconclusive.
- An absent or partial baseline sidecar gives `baseline_safety_unverifiable`.

**Fallback:**
- not_supplied;
- not_triggered on a pass, on a time fail, on underpowered and on an under-round sentinel;
- used on a sentinel trip and on sentinel resume drift;
- a slow fallback fails;
- an identity mismatch inside the fallback pair is inconclusive;
- each of the three fallback refusal codes keeps the primary verdict;
- the Jev verdicts never change.

**Descriptive output:** removing the sensitivity block reproduces every verdict. The categories report `met`/`not met` (autopilotMixed is met at 0.5x), and mcpUatStyle is reported as not measured.

## Decisions Made

- **The test gate** is the committed gate with `corpusLockSha256` replaced by `corpusDigest(defaultIdentity().tasks)`, because the synthetic corpus cannot match the real lock. Candidate identities record `loadGate(...).sha256`, which `tests/bench-gate.test.mjs` pins, so this suite adds no second hash literal.
- **The sentinel's causes reach the fallback trigger check.** The non-Jev verdict inherits a non-pass sentinel:
  - a trip gives `sentinel_trip`;
  - an inconclusive sentinel gives `sentinel_inconclusive`, plus every cause that is a gate fallback trigger, namespaced as `resume_drift:sentinel` or `identity_mismatch:sentinel.<field>`.

  The fallback rule ("none of its reasons starts with a trigger") then treats a non-Jev verdict made inconclusive by autopilot-campaign drift as caused by a listed trigger, which is what the gate note says. An under-round sentinel does not trigger it.
- **Fallback refusals are checked before the trigger,** so a malformed fallback reports `refused` even when it would not have been used. Its refusals never reach the top level.
- **Rates.** Rule (b) and the non-Jev excess comparison are evaluated only when both groups have counted runs. With no counted 'off' run, completion is unavailable and the path is inconclusive anyway.
- **The fallback's category ratios** are not computed: the categories and the sensitivity line describe the primary comparison only, since both are descriptive.

## Deviations from Plan

### Auto-added (Rule 2: missing critical functionality)

**1. `suites_incomplete`.**
- **Issue:** with `suites.ran` true, a gate `verifySuites` command that has no result would otherwise read as verified.
- **Fix:** it is now inconclusive with the reason `suites_incomplete`.
- **Commit:** `6b442b36`.

**2. `corpus_mismatch` on the Jev verdict.**
- **Issue:** the plan lists the corpus check only for the non-Jev path and the sentinel. A Jev pass measured on a corpus other than the gate's lock is not the predeclared comparison.
- **Fix:** the autopilot campaign's digest is now checked against `gate.corpusLockSha256` (T-71-02).
- **Commit:** `87100f37`.

**3. More refusals (T-71-02 tampering).**
- `baseline_row_schema`: the baseline rows must match `gate.campaigns.baseline.rowSchema`.
- `campaign_id_mismatch` with detail `<role>.rows.campaignId`: a row whose campaignId differs from its campaign's gate id.
- A dirty fallback candidate is refused as `fallback_candidate_not_measured`.
- **Commit:** `87100f37`.

**4. Calibration proof.**
- **Issue:** an acted row whose `calibrationStatuses` is empty or null cannot show that its acted attempt was calibrated. That can happen, for example, when truncation drops the attempt.
- **Fix:** such a row now counts as uncalibrated (D-16, "every acted attempt reports calibrated").
- **Commit:** `6b442b36`.

### Other adjustments

**5. Fixture tuning.**
- **Fixture (4):** the plan's "true 0.92 with a noisy control" also trips `ci_upper_not_below_1` (CI upper 1.038). The fixture uses true 0.85 with control log-sd 0.8 and treatment log-sd 0.1, which isolates `['not_below_aa_floor']`: estimate 0.819, CI upper 0.959, A/A lower bound 0.774.
- **The faster labels:**
  - the "CI upper 0.97 is faster" case uses true 0.95 (CI upper 0.988);
  - the "CI upper 1.05 is not faster but passes" case uses true 1.02 (CI upper 1.061).
- **The fallback candidate** uses 0.85, because its seed pair gives a wider interval.
- **Commits:** `6b442b36` and `87100f37`.

**6. Sorted bootstrap inputs.**
- **The change:** wall times are sorted per task, and A/A runs by (round, wallMs), before the bootstrap. So the result does not depend on row order, and a test proves it.
- **The consequence:** `report.mjs`'s descriptive A/A floor does not sort. For the same rows, its A/A numbers can differ slightly from the evaluator's (same seed, different draw order). Only the evaluator's numbers are decisive.
- **Commit:** `6b442b36`.

**7. Additive output fields beyond the plan's shape:**
- `guards` on each path, so the verdict functions can be recomputed from the result;
- `diagnostics`: end labels and meta-loop-break counts by condition, through `END_LABELS`, for the D-15 M-68-05 watch item;
- `campaigns.*.{gitDirty, observedRounds, minRounds, corpusMatch, reported}`;
- `exercise.{minActedShare, unknownExposureRuns, leakRunIds, captureArm}`;
- `inputs.level`.

## TDD Gate Compliance

- **Task 1:**
  - **RED:** the new suite failed with the evaluator module absent. The file was moved aside before the first run and restored afterwards.
  - **GREEN:** 27/27 on the first run of the implementation, after one fix to the test's own reason-shape regex, which wrongly rejected the digit in `ci_upper_not_below_1`.
- **Task 2:**
  - **RED:** the extended suite failed at link time with `does not provide an export named 'FALLBACK_STATUSES'`, before any guard code existed.
  - **GREEN:** 42/43 on the first run, then 43/43 after retuning the fallback candidate fixture, then 45/45 with the two added coverage tests (the Jev `corpus_mismatch` and fallback eligibility after sentinel drift).
- **No separate `test(71-06)` commits.** The plan gives one `feat` subject per task, and the suite is registered on the bench chain in Task 1's commit, so a RED commit would leave the registered chain red. 71-03, 71-04 and 71-05 followed the same precedent.

## Known Stubs

None. Every output field is computed from rows and identities. `mcpUatStyle` is reported as "not measured: no UAT-style tasks in the core set", which is the plan's specified value, not a stub.

## Threat Model Coverage

| Threat | How it is mitigated |
| --- | --- |
| **T-71-01** | `gate_hash_missing` and `gate_hash_mismatch` refusals on both candidate identities |
| **T-71-02** | Every statistic is recomputed from rows; refusals cover a dirty candidate, mismatched SHAs, a non-pin baseline, wrong campaign ids, schedules and row schemas, and rows from another campaign |
| **T-71-06** | Rule (a) has zero tolerance; rule (b) compares rates; null evidence is unverifiable, never zero |
| **T-71-07** | A safety fail outranks every other Jev verdict; a failed tighten-only suite is a safety fail |
| **T-71-08** | Speed reads only wallMs (the source-slice test); groups are ITT by condition; the sensitivity line is never decisive (a recomputation test) |

No new network, auth, file or schema surface was added.

## Deferred to Validation Block

Nothing was waited on.

- **V4, M-71-08:** the 71-07 CLI runs this evaluator on the real `core-baseline-66`, `core-gate-71-autopilot` and `core-gate-71-claude` campaigns, with `--verify-suites` at the measured SHA, and commits the decision file. The default 10,000 bootstrap iterations apply there. Tests use 400 through the options override, which the CLI never sets.
- **V4, M-71-08 (owner confirmation):** the reading that a sentinel left inconclusive by resume drift or an identity mismatch makes the core-rebaseline-71 fallback eligible, through namespaced inherited reasons. An under-round sentinel does not.
- **V1, M-71-00 item 1:** the owner's sign-off on D-15 and the `unknownExposure: 'acted'` reading. This is unchanged by this plan: the evaluator implements D-15 exactly as locked.

## Notes for 71-07

- **Inputs:**
  - Build `baseline.safety` (and the fallback `pin.safety`) as a `Map` runId -> `{requestOvercount, unexpectedMutations}` from the baseline sidecar. `null` gives `baseline_safety_unverifiable`.
  - Pass `suites: {ran, results: [{command, exitCode}]}` from `--verify-suites`. Leaving it out reads as `suites_not_run`.
  - Pass `gateSha256` from `loadGate`.
- **Refusals:** when `result.refusals` is non-empty, `paths` is absent. Map each `{code, detail}` to text and exit non-zero.
- **Text and claims:**
  - Map reasons to text by the code before `:`, and render the detail as the field name.
  - Claims may use `paths[*].criteria.speed.{estimate, ci}` (wallMs ratios), `criteria.completion.{diff, ci, control, treatment}` and cost from the report. Never use `sensitivity` (it is labelled never decisive) or `diagnostics`.
- **The non-Jev path:**
  - `paths['mcp-non-jev'].source` is `'fallback'` when core-rebaseline-71 replaced the verdict;
  - `result.fallback.primaryVerdict` and `primaryReasons` keep the original verdict;
  - the sentinel block itself is never rewritten.

## Self-Check: PASSED

- FOUND: scripts/bench/gate/lib/evaluate.mjs (`export function evaluateGate` 1; `8a058bdf` 1)
- FOUND: tests/bench-gate-evaluate.test.mjs (every acceptance code string present)
- FOUND: commit 6b442b36 (Task 1)
- FOUND: commit 87100f37 (Task 2)
- The bench `node --test` string appears once in package.json and once in REFINEMENT_ROOT_TEST_COMMANDS, and ends with `tests/bench-gate-evaluate.test.mjs`
- The purity grep prints 0, and the speedComparison slice check exits 0
