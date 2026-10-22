---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 02
subsystem: bench
tags: [jev, shadow, calibration, wilson, bonferroni, threshold-selection, statistics]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing
    provides: "wilson() and mulberry32() in scripts/bench/lib/stats.mjs (read-only), and the null-never-0 rule"
provides:
  - "Pure shadow scoring (scripts/bench/shadow/lib/score.mjs): signalFor, toReadings, bucketAccuracy, coverageAtCuts, optionBandAccuracy, scoreRun"
  - "Predeclared threshold selection (scripts/bench/shadow/lib/select.mjs): zOneSided, validateTargets, loadTargets, selectCut, selectAll, toProfileThresholds"
  - "The committed selection spec scripts/bench/shadow/targets.json that V3 must use unchanged"
  - "tests/jev-shadow-score.test.mjs (16 tests) and tests/jev-shadow-select.test.mjs (17 tests); not yet registered, 67-13 registers them"
affects: [67-03, 67-12, 67-13, V3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One signal axis s in [0, 1] for every question kind; precision mode scans cuts ascending at cut + tieBand, recall mode descending at cut - tieBand"
    - "Bonferroni one-sided Wilson lower bound over the whole grid, a minN floor, and not_a_fit with no number"
    - "Every effective and raw threshold is rounded to 6 decimals so selection and the server's meetsThreshold compare the same number"

key-files:
  created:
    - scripts/bench/shadow/lib/score.mjs
    - scripts/bench/shadow/lib/select.mjs
    - scripts/bench/shadow/targets.json
    - tests/jev-shadow-score.test.mjs
    - tests/jev-shadow-select.test.mjs
  modified: []

key-decisions:
  - "A Noul reading's `correct` is directional (completion: done iff p > 0.5; stuck and risk: flagged iff p >= 0.5), so the bucket report is a true accuracy. For every reading a selection pool can hold (s >= 0.5) it equals 'the veto or flag is right', so selection results are identical to the plan's veto-correctness definition."
  - "Noul bucketValue |p - 0.5| x 2 is rounded to 6 decimals; otherwise p = 0.95 gives 0.8999999999999999 and lands one bucket low"
  - "validateTargets requires grid cuts in [0.5, 1), strictly ascending, with cut +/- tieBand inside [0, 1]; alpha in (0, 0.5); tieBand in [0, 0.5); minN a positive integer; buckets from 0 to 1; non-overlapping integer option bands"
  - "zOneSided uses Acklam's inverse-normal approximation (no dependency), accurate to about 3e-9 here; it throws RangeError for alpha outside (0, 1)"
  - "Empty buckets and bands report accuracy null and wilson [null, null]; empty coverage is null per cut"
  - "Malformed rows, unknown kinds, a fit without a number in [0, 1] and a not_a_fit carrying a number all throw TypeError (offline tooling fails loud, never silently mis-scores)"

patterns-established:
  - "Kind lists are local literals in both libraries and both tests (no import of showcase/server/src/jev/contract.js)"
  - "Synthetic proof data is seeded with mulberry32, and the expected cut is derived independently in the test with the tabulated z (2.5758293035489004) rather than through zOneSided"

requirements-completed: [JEV-05]

# Metrics
duration: about 10 min
completed: 2026-10-16
---

# Phase 67 Plan 02: Jev Shadow Scoring and Predeclared Threshold Selection Summary

**Pure shadow statistics: accuracy by confidence bucket with Wilson intervals, coverage at every grid cut and option-band accuracy, plus a predeclared Bonferroni-Wilson threshold selection (z = 2.5758 over a 10-cut grid, minN 30, tie band 0.05). The selection returns `not_a_fit` with no number whenever the evidence is thin, and its spec is committed in `targets.json` before V3.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-17T03:32:09Z
- **Completed:** 2026-10-17T03:38:10Z
- **Tasks:** 2 (TDD, 4 commits)
- **Files created:** 5 (no existing file modified)

## Accomplishments

- **`scripts/bench/shadow/lib/score.mjs`.** It reads no clock, environment or filesystem.
  - It turns harness rows into readings on one signal axis: `s` is the confidence for operation and target, `1 - p` for completion, and `p` for stuck and risk.
  - Fallback rows are counted by reason and are never read as decisions.
  - It reports per-kind accuracy by confidence bucket (half-open buckets with a closed last bucket, two-sided 95% Wilson), coverage at each grid cut (acting readings with `s >= cut` over all readings), and, for Choice kinds only, accuracy by option-count band.
  - `scoreRun` is deterministic and leaves its input unchanged.
- **`scripts/bench/shadow/lib/select.mjs`.** It implements the D-27 rule as RESEARCH Pattern 11 reads it:
  - precision mode scans cuts in ascending order at `cut + tieBand`, pooling acting readings and counting correct ones;
  - recall mode scans in descending order at `cut - tieBand`, pooling positive readings and counting those at or above the threshold;
  - the Bonferroni z is `zOneSided(alpha / grid.length)`;
  - a cut whose pool is smaller than minN is skipped;
  - the first qualifying cut wins. If no cut qualifies the result is `not_a_fit` with reason `insufficient_samples` (every cut was skipped for minN) or `no_cut_qualifies`.
  - `toProfileThresholds` maps selections to raw-scale profile thresholds (completion becomes `1 - t`, `not_a_fit` becomes null).
- **`scripts/bench/shadow/targets.json`.** The predeclared spec V3 must use. It is validated by an exact-key validator and loaded deep-frozen.
- **Proof on seeded synthetic data.** Precision mode finds the known cut 0.75 (effective threshold 0.80) on 600 readings that are about 99% precise above 0.80 and about 60% below. Recall mode finds the known cut 0.75 (effective 0.70) on 500 positives whose `p` sits at or above 0.72 99% of the time. In both cases more than one cut qualifies, so the scan direction decides the result. Small samples never yield a number: 200 seeds times 5 kinds with n below minN, plus a seed-set-sized run of 12 perfect readings per kind, all come out `not_a_fit`.

## The committed spec (scripts/bench/shadow/targets.json)

| Field | Value |
| --- | --- |
| schemaVersion | 1 |
| note | "Predeclared before V3 (D-27). Do not edit after viewing live shadow results; a change needs a new note and a fresh V3 run." |
| alpha | 0.05 (one-sided) |
| grid | 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95 (10 cuts) |
| tieBand | 0.05 |
| minN | 30 |
| confidenceBuckets | 0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1 |
| optionBands | [2,3], [4,10], [11,50], [51,255] |
| operation | precision, target 0.95 |
| target | precision, target 0.95 |
| completion | precision (veto), target 0.95 |
| stuck | precision, target 0.90 |
| risk | recall, target 0.95 |

**Bonferroni z for the 10-cut grid:** `zOneSided(0.05 / 10) = zOneSided(0.005) = 2.5758293` (the tabulated value is 2.5758293035489004, and the implementation agrees to about 3e-9).

Sample sizes this implies (RESEARCH Pitfall 6): an all-correct pool needs about 60 readings for target 0.90 and about 127 for 0.95, and more when some readings are wrong. A hand-written seed set therefore cannot calibrate, which is why Phase 67 ships UNCALIBRATED.

## Interfaces for downstream plans

- **Reading:** `{s, correct, positive, optionCount, bucketValue, acting}`.
- **Selection, fit:** `{status:'fit', cut, effectiveThreshold, n, hits, lower, z}`.
- **Selection, not a fit:** `{status:'not_a_fit', effectiveThreshold:null, z, reason:'insufficient_samples'|'no_cut_qualifies'}`.
- **`scoreRun(rows, targets)`** returns `{kinds:{<kind>:{n, fallbacks, buckets:[{lo,hi,n,correct,accuracy,wilson}], coverage:[{cut,n,coverage}], optionBands:[...]|null}}}`.
- **`toProfileThresholds(selectionByKind)`** returns `{operation, target, completion, stuck, risk}`. Each value is a number rounded to 6 decimals, or null.
  - **67-03 semantics:** operation, target, stuck and risk act or flag when the value is at or above the threshold; completion vetoes when `p <= threshold`.

## Task Commits

1. **Task 1: scoring by confidence bucket, coverage and option band**
   - `dfa0d0aa` (test, RED)
   - `14008080` (feat, GREEN)
2. **Task 2: predeclared selection rule, Bonferroni z and the committed targets file**
   - `549f6ef4` (test, RED)
   - `808ec25e` (feat, GREEN)

No refactor commits were needed.

## Files Created/Modified

- `scripts/bench/shadow/lib/score.mjs`: the signal axis, readings, bucket, coverage and option-band reports.
- `scripts/bench/shadow/lib/select.mjs`: the quantile, the spec validator and loader, selection, and the profile mapping.
- `scripts/bench/shadow/targets.json`: the predeclared selection spec.
- `tests/jev-shadow-score.test.mjs`: 16 node:test cases, including a 1,000-reading `mulberry32(67)` run checked bucket by bucket against a direct recomputation.
- `tests/jev-shadow-select.test.mjs`: 17 node:test cases covering:
  - quantiles at 0.05, 0.025, 0.005, 0.01, 0.001, 0.0001 and 0.05/19, plus symmetry and monotonicity;
  - 35 malformed-spec cases plus an own `__proto__` key;
  - the loader;
  - every selection path;
  - the profile mapping.

## Decisions Made

See `key-decisions` in the frontmatter. In short:
- The validator interprets "out-of-range grid" as cuts in [0.5, 1) with `cut ± tieBand` inside [0, 1].
- Empty data is null, never 0.
- Malformed input throws a TypeError.
- The quantile is Acklam's approximation, with no dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Noul `correct` is directional instead of the literal veto correctness for completion and stuck**
- **Found during:** Task 1.
- **Issue:** The interfaces block set `correct = (label === false)` for completion and `correct = (label === true)` for stuck, whatever the value of `p`. Nouls are bucketed by `|p - 0.5| x 2`, so a confident "done" (p = 0.97, label done) and a confident "not done" (p = 0.03) share a bucket. Under the literal definition the first counts as wrong, and a perfect model would show about 50% accuracy in the top buckets. That is the "accuracy by confidence bucket" report V3 reviewers rely on (SC5, M-67-09).
- **Fix:** A reading is now correct when its directional answer matches the label:
  - completion predicts done iff `p > 0.5`;
  - stuck predicts stuck iff `p >= 0.5`;
  - risk keeps the plan's `(p >= 0.5) === label`.

  Selection is unchanged. Any pool reading has `s >= 0.5` (validateTargets requires cuts of at least 0.5, and the precision effective threshold is `cut + tieBand`). For completion, `1 - p >= 0.5` holds exactly when `p <= 0.5`; the subtraction is exact for p in [0.5, 1] by Sterbenz. In that region the directional answer equals "the veto or flag is right".
- **Proof:** `inside the selection region (s >= 0.5) a Noul reading is correct exactly when the veto or flag is right` checks 2,000 seeded readings per kind.
- **Files modified:** `scripts/bench/shadow/lib/score.mjs`, `tests/jev-shadow-score.test.mjs`.
- **Commit:** `14008080`.

**2. [Rule 1 - Bug] Noul bucket values are rounded to 6 decimals**
- **Found during:** Task 1.
- **Issue:** `|0.95 - 0.5| x 2` evaluates to `0.8999999999999999`, which put a p = 0.95 reading in the [0.8, 0.9) bucket instead of [0.9, 0.95).
- **Fix:** `bucketValue = Math.round(|p - 0.5| x 2 x 1e6) / 1e6` for Nouls, the same 6-decimal rule the plan applies to thresholds. Choice bucket values stay the raw confidence. The signal `s` is never rounded, so selection compares exactly what the server compares.
- **Files modified:** `scripts/bench/shadow/lib/score.mjs`, `tests/jev-shadow-score.test.mjs`.
- **Commit:** `14008080`.

No other deviations. Neither suite is registered in `package.json` (67-13 does that), and no file under `scripts/bench/lib/` or `scripts/bench/tasks/` changed.

## Issues Encountered

None. Both suites passed on the first GREEN run. Each malformed-spec case was confirmed to fail for its intended reason, not an incidental one.

## Verification

- `node --test tests/jev-shadow-score.test.mjs tests/jev-shadow-select.test.mjs`: 33 passed, 0 failed, on Node 24.14.1 and on the official Node 20.20.2 binary.
- Every acceptance one-liner in the plan exits 0:
  - the zOneSided(0.005) check;
  - the loadTargets check;
  - the purity greps on score.mjs and select.mjs;
  - exactly one `from '../../lib/stats.mjs'` import in score.mjs;
  - no `jev/contract` or `showcase/server` reference in the four files;
  - `git diff --quiet -- scripts/bench/lib scripts/bench/tasks`.
- There are no Node 22+ APIs (`Object.groupBy`, Set methods, `Promise.withResolvers`, `toSorted`, `findLast`) in the new files.
- Regression spot-checks:
  - `node tests/delegation-phase-contract.test.js`: 1224 passed, 0 failed;
  - the bench suites (export-history, stats, tasks, corpus, identity): 144 passed, 0 failed.
- No full-chain sweep was run. The plan adds only new, unregistered files that nothing imports yet. The suites that walk the repo or `scripts/bench` were run and are green.

## Deferred to Validation Block

Deferred: M-67-08, M-67-09 (Validation Block V3).
- **M-67-08 (V3):** gather enough labelled step records. Plan for about 60-130 or more above-cut readings per question.
- **M-67-09 (V3):** run live shadow through the deployed gateway against the V2 pin, then select thresholds with exactly this committed `targets.json` (no edits after seeing results), with every not-a-fit question recorded.

Nothing in this plan calls Jev, needs a credential, or spends money.

## Known Stubs

None. Both libraries are complete. The shipped thresholds stay UNCALIBRATED by design (67-03), not because of a stub here.

## User Setup Required

None.

## Next Phase Readiness

- **67-03:** `toProfileThresholds` output feeds the calibrated-profile `thresholds` field directly, with the polarity listed above.
- **67-12:** `run-shadow.mjs` can call `scoreRun(rows, loadTargets(...))` and `selectAll(readingsByKind, targets)`, building `readingsByKind` from `toReadings(rows, kind).readings`. The seed set will come out `not_a_fit` for every kind (minN 30 against roughly a dozen records).
- **67-13:** must register `node --test tests/jev-shadow-score.test.mjs tests/jev-shadow-select.test.mjs` (or the combined shadow command) in `package.json` and in `REFINEMENT_ROOT_TEST_COMMANDS`.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-16*

## Self-Check: PASSED

All five created files and this SUMMARY exist. All four task commits (dfa0d0aa, 14008080, 549f6ef4, 808ec25e) are in history, and none carries an attribution line.
