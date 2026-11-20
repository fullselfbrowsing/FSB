---
phase: 71-comparative-gate-and-release
plan: 03
subsystem: testing
tags: [bench, run-bench, conditions, fast-mode-switch, settings-tool, cdp-readback, gate-identity, report-grouping, eval-01]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-02)
    provides: CONDITIONS, buildSchedule({conditions}), condition_not_applied, jev_measurement_missing, computeSafety, the v2 row (toCommittedRow on schemaVersion 2), JEV_SOURCES, the vocabularies
  - phase: 71-comparative-gate-and-release (71-01)
    provides: 71-SYNC-RECHECK S1 (settings tool), S2/S3 (switch and capture-arm keys), S4 (Exposure rule), S7 (session.outcomeDetails.reason), S8 (Phase 70 runner items), S16 (fixture evidence {requests, dropped}); 71-SWEEP-BASELINE.json
  - phase: 66.1-mcp-settings-tool
    provides: the MCP settings tool (read-one and write, string values, SETTING_UNAVAILABLE after a sent write)
  - phase: 70-bounded-mcp-fast-task
    provides: runTask.fastMode in runAutopilotArm (70-07) and its record suite
provides:
  - "run-bench --conditions off,on: per-run product-path write of fsbJevFastModeEnabled, independent CDP readback of it and of fsbJevCaptureArmed before t0; anything unconfirmed is condition_not_applied (pausing), and the arm never runs"
  - "conditionPreflight (exported): conditions_unverifiable, conditions_unsupported, capture_armed, capture_arm_unverifiable refusals before identity is written"
  - "createConditionApplier (exported): {ok, reason} with reason readback_mismatch | unverifiable | capture_armed; CDP only reads"
  - "run-bench --gate <file>: gate_invalid refusal before any client opens; identity.gate {path, sha256 of raw bytes}; gate and conditions join stableIdentity"
  - "schema-2 raw records: condition, jevMeasurement (autopilot), endReason, safety, evidence.dropped; jevAttempted gates the jevMeasurement wait and the jev_measurement_missing flag"
  - "mcp-client writeSetting / readSetting over the settings tool"
  - "report.mjs: (arm, condition) groups keyed arm/condition, descriptive exposure/Jev cost/typed outcomes/safety/end labels for groups with v2 rows, the 'Fast-mode exposure and safety (descriptive)' section, gate and conditions in the identity summary, five new method notes"
affects: [71-05, 71-06, 71-07, V3, V4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write through the product path, decide on an independent readback: the settings tool's answer is ignored, CDP reads (never writes) the stored switch and the capture arm"
    - "Pre-t0 gate inside the executor: a conditioned entry awaits the applier before the arm sets t0; a failed apply returns an infra record with no timing and no outcome"
    - "Report groups keyed arm/condition for schema-2 rows only, so schema-1 summaries stay byte-identical and off/on are never pooled"

key-files:
  created:
    - .planning/phases/71-comparative-gate-and-release/71-03-SUMMARY.md
  modified:
    - scripts/bench/run-bench.mjs
    - scripts/bench/lib/mcp-client.mjs
    - scripts/bench/report.mjs
    - tests/bench-conditions.test.mjs
    - tests/bench-report.test.mjs
    - tests/bench-fast-mode-record.test.mjs

key-decisions:
  - "endReason comes from session.outcomeDetails.reason (71-SYNC-RECHECK S7) of the session detail the executor already holds, for every arm, kept only when it matches /^[a-z][a-z0-9_]{0,63}$/; the row maps it through END_LABELS"
  - "Raw records are schema 2 for every run, with or without --conditions (plan behavior); the Phase 70 'committed rows are identical' assertion was replaced by a schema-1 identity check plus a v2 diff limited to fastMode and jev"
  - "--conditions refuses any empty part ('off,,on', ',') as conditions_invalid, stricter than --arms"
  - "An applier that throws counts as not applied (condition_not_applied), and a conditioned entry with no applier is a programming error"
  - "--gate is read and parsed right after option resolution, so --dry-run and --preflight refuse a bad gate too; the dry-run JSON does not list the gate"
  - "Jev cost per completed task is rendered with six decimals (fractions of a cent) beside the four-decimal LLM cost"

patterns-established:
  - "conditionPreflight / createConditionApplier as exported, injectable seams; main builds the applier from the preflight's cdpPort and extensionId"
  - "exposure, safety and endLabels attach only to report groups that contain schema-2 rows"

requirements-completed: [EVAL-01]

# Metrics
duration: 24min
completed: 2026-10-18
---

# Phase 71 Plan 03: Condition Apply-and-Verify, Gate Identity and Report Grouping Summary

**A conditioned campaign now counts only runs whose fast-mode switch was written through the MCP settings tool and then read back over CDP before t0, with the capture arm off.**
- Anything unconfirmed becomes the pausing infra code `condition_not_applied`, and that run's arm never starts.
- The gate's sha256 and the condition list bind the campaign, so a resume cannot change either.
- Campaign reports keep `autopilot/off` and `autopilot/on` apart and show exposure, Jev cost, typed outcomes and safety as descriptive counts.

## Performance

- **Duration:** about 24 min
- **Started:** 2026-10-19T01:12Z (20:12 -05:00)
- **Completed:** 2026-10-19T01:36Z
- **Tasks:** 2/2
- **Files modified:** 6 (plus this SUMMARY)

## Task Commits

1. **Task 1: Runner.** `--conditions` and `--gate`, the condition preflight, apply-and-verify before t0, and schema-2 raw records. Commit `d543439e` (feat).
2. **Task 2: Campaign report.** `(arm, condition)` grouping, the descriptive exposure and safety blocks, and the new method notes. Commit `395b165d` (feat).

RED was observed before each GREEN change but not committed separately; see TDD Gate Compliance.

## What the runner does now

**Options.**
- `--conditions off,on` lists distinct values from `CONDITIONS`. An empty, repeated or unknown part is refused as `conditions_invalid`.
- `--gate <file>` sets `options.gatePath`.
- Both flags are listed in `USAGE` with the exact plan wording.

**The gate.**
- `main` reads the gate's bytes once and parses them, right after option resolution and before any client opens.
- An unreadable or non-JSON file is refused as `gate_invalid` (exit 2), with no dependency called.
- Identity records `gate = {path, sha256}`. The path is repo-relative with `/` separators, and the sha256 is `sha256Hex` of the raw bytes, never of a re-serialization.
- Plan 71-05 adds the full validator in the same place.

**Condition preflight** (`conditionPreflight`). It runs only with `--conditions`, after the Phase 66 preflight passes and before identity is written. Every refusal exits 2:
- no DevTools port or no extension id: `conditions_unverifiable`. The Phase 66 telemetry check normally refuses first, so this is defence in depth and is unit-tested directly.
- `readSetting(fsbJevFastModeEnabled)` throws, returns `isError`, or does not report `json.type === 'boolean'`: `conditions_unsupported`. The 8a058bdf pin has no settings tool, so it always lands here.
- the capture arm reads `true`: `capture_armed`.
- the capture arm reads anything but `false`: `capture_arm_unverifiable`.

**Per run** (`createConditionApplier`, awaited in `createRunExecutor` before `armFn`):
1. `writeSetting(client, 'fsbJevFastModeEnabled', 'true'|'false')`. The answer and any throw are ignored.
2. `readExtensionStorageFlag` for `fsbJevFastModeEnabled`. It must equal `condition === 'on'`.
3. `readExtensionStorageFlag` for `fsbJevCaptureArmed`. It must be `false`.

No other key is read and nothing is written over CDP. The `evaluate(` count in run-bench.mjs is 0, the same as at `$P71_START`.

**When the condition is not confirmed.** Any result other than `{ok:true}` returns a schema-2 record with:
- `infraError: 'condition_not_applied'`, `wallMs: null`, `timedOut: false`;
- `outcome {pass:false, checks:[]}`, all timing null, and the condition set.

The cleanup still clears the run token. The loop pauses with exit 75 and prints the `--resume` command.

**Schema-2 raw records.** Every run writes them, with or without `--conditions`. They add:
- `condition`, which is null without `--conditions`;
- `jevMeasurement`: the detail's plain object for autopilot, and null for host arms;
- `endReason`;
- `safety`: `computeSafety` for core tasks, null for live tasks;
- `evidence.dropped`, which `productionEvidence` now takes from `fixtureServer.evidence(token)`.

**The jevMeasurement wait** (Pitfall 9).
- `runAutopilotArm` takes `condition`, which `productionArms` passes from `entry.condition`.
- `jevAttempted` is true only for `condition === 'on'` with a plain-object projected `runTask.fastMode` whose `jev` reports `attempts > 0`.
- Only then does the `until` predicate also require a plain-object `session.jevMeasurement`.
- A session read without one sets `jevMeasurementMissing`, which the executor turns into the `jev_measurement_missing` flag.

The five 'on' cases behave as the plan requires:

| Case | Polls | Flags | Row `jev.source` / `acted` |
|------|-------|-------|----------------------------|
| attempts 2, measurement on the 3rd poll | 3 | `[]` | `measurement` / true |
| attempts 2, measurement never arrives | 10 (existing budget) | `['jev_measurement_missing']` | `summary` / true |
| attempts 0 | 1 | `[]` | `summary` / **false** |
| no block, session read | 1 | `[]` | `no_block` / false |
| no block, no session on any poll | 10 | `['session_detail_missing']` only | null / null |

`off`, a null condition and a `jev: null` block all keep the Phase 66 predicate.

**Identity and resume.**
- `identity.schedule.conditions` is present only with `--conditions`.
- `stableIdentity` gains `gate` (the sha256 or null) and `conditions` (the array or null).
- A resume with another gate, conditions in another order, a subset of conditions, or a dropped `--conditions` is refused as `resume_identity_mismatch`, and the message names the field.
- A V1-style identity, with neither key, still resumes when neither flag is given.

## S7: the endReason source field used

`session.outcomeDetails.reason` from the `get_session_detail` result the executor already holds, as 71-SYNC-RECHECK S7 recorded. For host arms that is the selected MCP session's detail. A value is kept only when it matches `/^[a-z][a-z0-9_]{0,63}$/`; free text, non-strings and over-long tokens give null. The v2 row maps it through `END_LABELS`, so unknown tokens become `other`.

## S8: Phase 70 runner edits preserved

- `if (json && isPlainObject(json.fast_mode)) runTask.fastMode = projectFastMode(json.fast_mode);` and the `runTask` literal are untouched. `git diff $P71_START -- scripts/bench/run-bench.mjs | grep -E "^-.*(projectFastMode|runTask\.fastMode)"` prints nothing.
- The 70-07 key-order pins in `tests/bench-fast-mode-record.test.mjs` pass unchanged: `[...OLD_RUN_TASK_KEYS, 'fastMode']`. The one assertion that changed there is listed under Deviations.
- The raw record still copies `runTask` verbatim, so the v2 row's `fastMode` block has its source, and `fastMode.outcome` equals `runTask.fastMode.outcome` (tested).

## What the report does now

**Grouping.**
- Within each set, `buildSummary` builds `ARM_ORDER × [null, ...CONDITIONS]` groups.
- Schema-2 rows with a condition are keyed `` `${arm}/${condition}` ``. Schema-1 rows and condition-null schema-2 rows keep the bare arm key.
- Each group runs `summarizeArm` on its own rows only, so its denominator and A/A floor never mix conditions. A test checks that each group deep-equals a summary built from that condition's rows alone.
- V1 summaries are unchanged: `summary.sets.core.arms.autopilot` and `.claude` have no new keys.

**New blocks for groups with schema-2 rows**, all computed over that group's counted schema-2 rows:
- **`exposure`:**
  - `exposureSources {measurement, summary, no_block, unknown}`, with null counted as unknown;
  - `actedRuns`;
  - `jevCallsTotal` (null when nothing is recorded, never 0);
  - `fallbacks` and `calibrationStatuses`, summed in vocabulary order;
  - `servedModels` and `instrumentVersions`;
  - `missingMeasurement`;
  - `jevCostPerCompletedTask {provider, estimate, label}`, with the fixed label "Jev cost (FSB-borne), reported beside the LLM cost and never added to it";
  - `typedOutcomes {<outcome or none>: {pass, fail}}`.
- **`safety`:** `verifiableRuns`, `unverifiableRuns`, `requestOvercountRuns`, `unexpectedMutationRuns`, `claimedSuccessOnFailRuns`.
- **`endLabels`:** counts by label.

**Markdown.**
- Each group gets a heading such as `### autopilot/off`.
- When any group has exposure data, a `## Fast-mode exposure and safety (descriptive)` section appears before the live set. It shows the LLM cost and the Jev cost side by side and never adds them.
- The identity block gains `- Gate: sha256 …` and `conditions off, on` only when the identity has them.
- Neither output contains `jevMs`, `latencyMs`, `://`, NaN, `null%`, Infinity or `undefined` (tested).

**Identity summary.** It adds `gate: {sha256}` (not the path) and `schedule.conditions`, each only when present.

**Method notes.** All eight Phase 66 sentences are kept, and "not compared with each other" still appears exactly once. Five sentences are appended:
- conditions are interleaved run by run, the switch is written through the settings tool before t0 and read back over CDP, and unconfirmed runs are `condition_not_applied`;
- intention to treat;
- survivorship ("covers completed runs only, so it is read together with completion");
- the 24-letter lowercase tokens against the 8a058bdf base64url tokens ("differs in its token alphabet only");
- FSB-borne Jev cost and user-borne LLM cost, side by side and never summed.

**Ratio ban.** The ban still holds with `//` comments stripped. report.mjs has no `jevMs` or `latencyMs`, and no Newcombe or verdict code.

**Producer/report parity.** Varying `condition`, `jev`, `safety`, `endLabel` or `fastMode` in a raw record each changes a summary field (tested).

## Verification

| Command | Result |
|---------|--------|
| Task 1 verify, `node --test` on bench-conditions, runs-v2, report, drivers, claude-stream and fast-mode-record | 211/211 |
| `npx --offline -y node@20 --test` on bench-conditions and fast-mode-record | 36/36 (v20.20.2) |
| Official Node 20 binary on conditions, fast-mode-record, report and runs-v2 (after Task 1) | 138/138 |
| The plan's dry-run verify (`--arms autopilot --conditions off,on --rounds 2`) | exit 0 (runs 48, conditions `["off","on"]`) |
| V1-shape dry run (`--arms autopilot,claude --rounds 1`) | keys `campaignId,mode,set,runs,arms,rounds,seed,tasks`, no `conditions` |
| Sweep, `node scripts/bench/sweep-tests.mjs --files scripts/bench/run-bench.mjs scripts/bench/lib/mcp-client.mjs --baseline …/71-SWEEP-BASELINE.json` | **14/14 passed; NEW failures vs baseline: none; exit 0** (7225 held by the user's own hub, left running) |
| Task 2 verify, `node --test` on bench-report, runs-v2 and conditions | 138/138 |
| `npx --offline -y node@20 --test tests/bench-report.test.mjs` and the official Node 20 binary | 87/87 each |
| The whole bench `node --test …` command after Task 2 | 401/401 (393 after Task 1; 372 before) |
| `node --test tests/bench-fast-mode-record.test.mjs` | 8/8 |
| `node tests/delegation-phase-contract.test.js` | 1252 passed, 0 failed |

**Acceptance checks:**
- **`evaluate(` count:** 0 now and 0 at `$P71_START`.
- **`jevAttempted`:** 4 occurrences.
- **`fsbJevFastModeEnabled|fsbJevCaptureArmed`** in run-bench.mjs: 7 lines.
- **`'settings'`** in mcp-client.mjs: 2.
- **The dry runs** left nothing under `scripts/bench/.local` or `scripts/bench/results`.
- **The ratio-ban `node -e` command** exits 0.
- **`jevMs|latencyMs` in report.mjs:** 0. **"not compared with each other":** 1.
- **Upstream tripwires,** each at least 1:
  - `WRITE_FIELDS` in settings.ts: 2;
  - extension files naming `fsbJevFastModeEnabled`: 5;
  - extension files naming `fsbJevCaptureArmed`: 1;
  - `fsbFastModeSessionField` in background.js: 3;
  - `jevMeasurement` in mcp-tool-dispatcher.js: 14.
- **Comments:** no `importScripts` and no URL in any added comment.
- **Working tree:** the crawler files were untouched (no full `npm test` or showcase build ran), and `git status --short` was clean after each commit.

**Removed `assert` lines in tests/bench-report.test.mjs since `$P71_START`: 1, from 71-02, none from this plan.** `git diff b00ed210 -- tests/bench-report.test.mjs | grep -cE "^-\s+assert"` prints 0. The one line is:
- `assert.deepEqual([...PAUSING_INFRA_CODES], ['agent_cap', 'agent_auth', 'provider_error']);`
- 71-02 commit `60fe3cd0` replaced it with the stricter `assert.deepEqual([...PAUSING_INFRA_CODES], ['agent_cap', 'agent_auth', 'provider_error', 'condition_not_applied']);`.

## Decisions Made

- **endReason source and scope.** It comes from `session.outcomeDetails.reason` for every arm, token-checked (see S7 above).
- **Every run writes schema-2 raw records.** This follows the plan's behaviour "Without --conditions the raw record is still schemaVersion 2 with condition null".
- **Strict `--conditions` parsing.** Empty parts are refused instead of skipped.
- **A throwing applier is `condition_not_applied`.** That is the safe direction: the run is never counted and the campaign pauses. A conditioned entry with no applier throws, because it is a programming error.
- **`--gate` is checked in every mode,** dry run and preflight included. The dry-run JSON gains only `conditions`.
- **Jev cost has six decimals** in the markdown, because four decimals would show realistic per-task Jev costs as $0.0000.
- **Exported seams.** `conditionPreflight` and `createConditionApplier` are exported, so the plan's direct behaviours are unit-tested without a live bench.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 70's "committed rows are identical" assertion conflicted with schema-2 raw records**
- **Found during:** Task 1 verify, in `tests/bench-fast-mode-record.test.mjs`, "raw record carries runTask.fastMode through the run executor".
- **Issue:** The plan requires every raw record to be schema 2. Under the 71-02 v2 producer and the D-08 amendment of 2026-10-16, a row with the fast_mode block carries `fastMode` and `jev.source 'summary'`, and a row without it carries nulls. Phase 70 asserted `deepEqual(toCommittedRow(runs.on), toCommittedRow(runs.off))`, so it failed. The plan also requires that suite to pass. Writing schema 1 for unconditioned runs would break the plan's explicit behaviour instead.
- **Fix:** I replaced that single assertion with a stronger set:
  - the schema-1 rows of the same two records deep-equal, which is exactly Phase 70's claim, and have exactly `RUN_ROW_KEYS`;
  - the v2 rows deep-equal once `fastMode` and `jev` are removed;
  - the off row has `fastMode` null and `jev.source` null;
  - the on row's `fastMode.outcome` equals the raw block's outcome, and its `jev.source` is `'summary'`;
  - both v2 rows validate.

  The 70-07 runTask key-order pins and every other Phase 70 assertion are unchanged. A comment cites D-08.
- **Files modified:** tests/bench-fast-mode-record.test.mjs
- **Commit:** `d543439e`

**2. [Rule 2 - Test enforcement] bench-report's `liveDeps` gained throwing `writeSetting` and `readSetting` spies**
- **Why:** The plan states that "the liveDeps spies in tests/bench-report.test.mjs throw if they are called", but those spies did not exist.
- **What changed:** Two additive lines. Every existing in-process runner test there now fails if an unconditioned run touches the switch. The new conditions suite proves the same on a full smoke run.
- **Scope:** Task 1's file list does not include bench-report.test.mjs, and no assertion was removed.
- **Commit:** `d543439e`

### Process deviations

**1. [TDD protocol] RED was not committed separately**
- **Why:** Both edited suites (`tests/bench-conditions.test.mjs`, `tests/bench-report.test.mjs`) are already registered in the bench `node --test` command. A RED commit would leave the registered test chain red. 71-01 and 71-02 avoided this by putting RED in unregistered suites, which was not possible here.
- **What was done:** Each task landed as one `feat(71-03)` commit with the plan's exact subject.
- **RED evidence:** See TDD Gate Compliance.

## TDD Gate Compliance

- **Task 1 RED:** the extended bench-conditions suite failed at link time with "does not provide an export named 'conditionPreflight'", before any source edit. GREEN: 28/28.
- **Task 2 RED:** 6 of the 8 new bench-report tests failed before report.mjs changed: grouping, exposure, markdown, identity summary, method notes and parity. The 2 that passed are guards that hold by design before the change: v1 unchanged, and no ratio or per-decision timing names in the source. GREEN: 87/87.
- **Commits:** no separate `test(71-03)` RED commits, for the reason under Process deviations. The GREEN commits are `d543439e` and `395b165d`.

## Deferred to Validation Block

Nothing was waited on. Restated from 71-VALIDATION.md:
- **V3, M-71-04:** with the calibrated profile committed and deployed, run `node scripts/bench/run-bench.mjs --smoke --pair-via-cdp --arms autopilot --conditions on --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile"`. Then check the raw records' `jevMeasurement` under `scripts/bench/.local/`: `calibrationStatus 'calibrated'`, at least one fast step on at least one fixture, and 0 `sensitive_goal` fallbacks.
  - This plan's runner now copies `jevMeasurement` into those raw records.
  - It also refuses the smoke if the build has no boolean settings key or the capture arm is not off.
- **V4, M-71-05 (preconditions):**
  - Jev is at the release-candidate SHA, with M-71-02 cherry-picked first.
  - `npm run validate:extension && npm test` is green and `git status --short` is empty.
  - The gate hash test is green.
  - V2 is live with `JEV_ENABLED` on, and the candidate build is loaded unpacked in the bench profile.
  - `node scripts/bench/shadow/export-capture.mjs --arm off --port <p> --extension-id <id>` has run. Without it, `--conditions` now refuses `capture_armed` or `capture_arm_unverifiable`.
  - `claude --version` prints M-71-01's version on the M-71-01 PATH.
- **V4, M-71-06 (autopilot gate campaign):** `caffeinate -i node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms autopilot --conditions off,on --rounds <campaigns.autopilot.minRounds> --seed 71 --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-gate-71-autopilot`.
- **V4, M-71-07 (Claude Code gate campaign, `off` only, V1 order):** with the M-71-01 PATH, `caffeinate -i node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms claude --conditions off --rounds <campaigns.claude.minRounds> --seed 66 --claude-model <V1 model> --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-gate-71-claude`.
- **Notes for M-71-06 and M-71-07:**
  - `gate_campaign_mismatch` is 71-05's refusal; this plan records `identity.gate` and binds resumes to it.
  - **Interaction to keep in mind at M-71-00** (71-VALIDATION row on M-70-08): if remedy (a), "settings may turn the switch off but not on", is chosen, every `on` write fails its readback. Each `on` run then ends as `condition_not_applied`, and the campaign pauses at the first one. The runner is correct to do this; the condition write would need re-planning before V1.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model:
- **T-71-09:** the product-path write plus an independent CDP readback, the capture arm check, the preflight refusals, and `condition_not_applied` pausing.
- **T-71-01:** the gate sha256 is in identity and in `stableIdentity`.
- **T-71-08:** no ratio, interval or verdict code in report.mjs, no `jevMs` or `latencyMs`, and method notes that cover ITT, survivorship and the token alphabet.
- **T-71-04:** only the allowlisted `jevMeasurement` and the `endReason` token come from the session detail, and raw records stay in the gitignored `.local`.

The settings write is the existing 66.1 tool. No new endpoint, auth path or schema change was added.

## Self-Check: PASSED

- FOUND: scripts/bench/run-bench.mjs (condition_not_applied, applyCondition, jevAttempted, gate, conditionPreflight, createConditionApplier)
- FOUND: scripts/bench/lib/mcp-client.mjs (writeSetting, readSetting)
- FOUND: scripts/bench/report.mjs (condition grouping, exposure, METHOD_NOTES additions)
- FOUND: tests/bench-conditions.test.mjs, tests/bench-report.test.mjs, tests/bench-fast-mode-record.test.mjs
- FOUND commits: d543439e, 395b165d
