---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 12
subsystem: bench
tags: [jev, shadow, calibration, harness, smoke, gateway, jev-05, jev-02]

# Dependency graph
requires:
  - phase: 67-02
    provides: "scoreRun/toReadings (score.mjs), loadTargets/selectAll/toProfileThresholds (select.mjs), the committed targets.json"
  - phase: 67-03
    provides: "INSTRUMENT_VERSION, INSTRUMENT_HASH, buildUpstreamBody; validateProfile, applyCalibration, servedModelInFamily, loadProfiles, selectProfile; canonicalJson/sha256Hex"
  - phase: 67-04
    provides: "loadJevConfig and the loopback fake upstream (answersFn and ok-openrouter modes)"
  - phase: 67-08
    provides: "FsbJevClient.createJevClient({endpoint, fetchImpl, now}) whose decide never rejects"
  - phase: 67-09
    provides: "createJevRouter mounted in-process in production middleware order"
  - phase: 67-10
    provides: "loadRecords/checkLockReferences and the 25 labelled seed records"
provides:
  - "scripts/bench/shadow/run-shadow.mjs: main(argv, overrides), parseArgs, buildCandidateProfile, plus the shared CLI helpers checkGatewayUrl, parseFlags, gatewayFrom, forEcho, EXIT"
  - "scripts/bench/shadow/gateway-smoke.mjs: main(argv, overrides), SMOKE_REQUEST, smokeLine"
  - "scripts/bench/shadow/lib/recorded-answers.mjs: expandAnswer, loadRecordedAnswers, stateKey, buildAnswerLookup, answersForBody, RECORDED_ANSWERS_PATH"
  - "scripts/bench/shadow/answers/fake-upstream.json: 25 compact recorded answers keyed by record id"
  - "tests/jev-shadow-harness.test.mjs (23 node:test cases; not yet registered, 67-13 registers it)"
affects: [67-13, V2, V3, V4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gateway-only harness: the real FsbJevClient with endpoint = --gateway, so the shadow run measures exactly the instrument production sends"
    - "Recorded answers looked up by sha256Hex(canonicalJson(upstream state)), computed through the server's own buildUpstreamBody"
    - "Refuse before writing: an instrument-version mismatch or a second served model stops the run at that response, and nothing is written"
    - "Evidence files are never overwritten: run ids are safe file names, a used id is refused before any request, and writes use flag 'wx'"

key-files:
  created:
    - scripts/bench/shadow/run-shadow.mjs
    - scripts/bench/shadow/gateway-smoke.mjs
    - scripts/bench/shadow/lib/recorded-answers.mjs
    - scripts/bench/shadow/answers/fake-upstream.json
    - tests/jev-shadow-harness.test.mjs
  modified: []

key-decisions:
  - "A run in which no decision came back (for example a disabled gateway) still writes its rows and report, so the fallback counts are visible, but exits 1, not 0"
  - "The mixed-served-model refusal considers every non-null servedModel the client returns, fallbacks included, and the refusal fires at the first differing response"
  - "Records are checked against core.lock.json before any request; a stale record exits 1 without spending"
  - "The candidate profileId is calibrated-<first 16 hex of sha256(canonical {model, snapshot, instrumentHash, thresholds})>, deterministic and well inside the client's 64-character profileId bound"
  - "The harness keeps the production client's in-memory cool-down: after a non-transient fallback (disabled, not_configured, spend_cap_reached, auth_error, upstream_billing, unavailable_model) the remaining records are recorded with that fallback without further requests"
  - "The --gateway value is never echoed in an error (it could carry credentials) and is never written to the rows or the report"

patterns-established:
  - "Offline shadow proof: in-process router on 127.0.0.1:0 in front of the fake upstream in answersFn mode, answering from recorded answers"
  - "Body-free output check: scan both output files for every record's goal, title, page text, origin, path and element labels, and for any '://'"

requirements-completed: [JEV-05, JEV-02]

# Metrics
duration: about 15 min
completed: 2026-10-17
---

# Phase 67 Plan 12: Shadow Harness and V2 Gateway Smoke Command Summary

**The shadow pipeline now runs end to end offline: labelled records go through FSB's own gateway, using the real FsbJevClient, to a loopback fake upstream that answers from recorded answers. The harness writes body-free per-step rows and a report keyed by the served model and the instrument hash, scored by confidence bucket and selected with the committed targets.json. On the 25-record seed set every kind is `not_a_fit` and no profile is produced. The harness refuses an instrument mismatch or mixed served models. A synthetic fit selection becomes a profile that the server validates, loads, selects and applies, flipping exactly at the threshold. V2 gets a one-request, body-free smoke command.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-10-17T06:14:08Z
- **Completed:** 2026-10-17T06:28:00Z
- **Tasks:** 2 (both TDD), 4 commits
- **Files:** 5 created, none modified

## Accomplishments

- **`run-shadow.mjs` (D-26, D-27).**
  - It loads the records (and lock-checks them) and the targets.
  - It calls `decide` once per record, strictly in sequence.
  - It builds one row per (record, requested kind) and refuses on a mismatch.
  - It writes the rows and the report, then prints one summary line per kind.
  - With `--pin`, it builds a candidate profile only when the served model is in the pin's family and at least one kind is fit.
- **`gateway-smoke.mjs` (JEV-02, M-67-04).** It sends one fixed benign request through the same client and prints one JSON line. It exits 0 on any typed result and 2 on a usage error.
- **`lib/recorded-answers.mjs`.**
  - `expandAnswer` turns `{pick, top}` / `{p}` into raw upstream answers that the server's `validateAnswers` accepts.
  - `buildAnswerLookup` keys each record by its upstream state, and fails loudly on a missing entry, a kind mismatch, an unoffered pick or a duplicate state.
  - `answersForBody` is the fake upstream's `answersFn`.
- **`answers/fake-upstream.json`.** It has 25 entries, one per seed record, with exactly that record's kinds.
  - Correct picks run at mixed confidence.
  - Four picks are deliberately wrong, on near-miss elements: confirm-modals-01 target, custom-dropdowns-01 target, invoice-lookup-02 operation and ticket-triage-01 target.
  - Risk `p` is 0.71 to 0.97 on the four risk positives and at most 0.35 on the negatives.
- **`tests/jev-shadow-harness.test.mjs`.** It has 23 cases:
  - recorded answers: 7;
  - arguments: 2;
  - the offline run, limit and run-id reuse, the disabled gateway, both refusals and usage: 6;
  - the profile round trip: 2;
  - smoke: 4;
  - CLI: 1;
  - static: 1.

## Exact commands for the Validation Block

**V2 smoke (M-67-04)**, once per configured route after the branch deploy:

```
node scripts/bench/shadow/gateway-smoke.mjs --gateway https://full-selfbrowsing.com/api/jev/decide
```

It prints one line: `{"ok":…,"fallback":…,"servedModel":…,"instrumentVersion":…,"calibrationStatus":…,"usageSource":…,"costSource":…,"latencyMs":…}`. With `JEV_ENABLED` off, the expected line is `ok:false, fallback:"disabled"` and the exit code is still 0.

**V3 shadow (M-67-09)**, against exactly the V2 pin, once enough records exist (M-67-08):

```
node scripts/bench/shadow/run-shadow.mjs --gateway https://full-selfbrowsing.com/api/jev/decide --pin <V2 pin>
```

The optional flags are `--records <dir>` (default `scripts/bench/shadow/records`), `--targets <file>` (default the committed `scripts/bench/shadow/targets.json`, which must not be edited after seeing results), `--out <dir>`, `--run-id <id>` and `--limit <n>`.

Exit codes:
- 0: ok;
- 1: failure, including a run where no decision came back;
- 2: usage error;
- 3: refused, because of an instrument version mismatch or mixed served models.

If `report.candidateProfile` is non-null, V3 reviews the buckets and the not-a-fit kinds, then commits that object unchanged as a JSON file beside `showcase/server/src/jev/profiles/uncalibrated.json`.

## Output file layout

Outputs go under the gitignored `scripts/bench/.local/shadow/` (`.gitignore:83`) by default:

- `<runId>.jsonl`: one row per (record, requested kind):
  `{recordId, taskId, kind, label, decision, fallback}`. Here `decision` is `{choice, confidence, optionCount}` for operation and target, `{p}` for completion, stuck and risk, or `null` exactly when `fallback` is a reason string.
- `<runId>.report.json`:
  `{runId, servedModel, instrumentVersion, instrumentHash, counts:{records, ok, fallbacks:{reason:n}}, scores, selection, candidateProfile}`.
  - `scores` is `scoreRun(rows, targets)`.
  - `selection` is `selectAll(readingsByKind, targets)`.
  - `candidateProfile` is null, or a full `calibrated` profile that passes `validateProfile`.

The default run id is `shadow-<ISO timestamp with : and . replaced by ->`. Neither file holds a goal, URL, title, page text, element label, origin or the gateway address.

## Offline run on the seed set (per kind)

| Kind | Readings (n) | Selection |
| --- | --- | --- |
| operation | 22 | not_a_fit (insufficient_samples) |
| target | 22 | not_a_fit (insufficient_samples) |
| completion | 24 | not_a_fit (insufficient_samples) |
| stuck | 10 | not_a_fit (insufficient_samples) |
| risk | 9 | not_a_fit (insufficient_samples) |

There are 87 rows from 25 records, with `counts {records: 25, ok: 25, fallbacks: {}}`, and `candidateProfile` is null even with `--pin typesafe/jev-1.13` (Pitfall 6, minN 30). The fake upstream received exactly 25 requests, each carrying the gateway's own `Authorization: Bearer <test credential>`. The harness sent 25 requests, one at a time, with no auth or hash-key header.

## Task Commits

1. **Task 1: recorded answers, the gateway-only harness and the offline end-to-end run**
   - `0ed7a1cd` (test, RED: 15 of 15 failed, module missing)
   - `4ee3a214` (feat, GREEN: 15 passed)
2. **Task 2: profile round trip and the V2 smoke command**
   - `9f7d6958` (test, RED: 8 new tests failed, the 15 earlier ones still passed)
   - `24684a6b` (feat, GREEN: 23 passed)

No refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Records are lock-checked before any request**
- **Found during:** Task 1
- **Issue:** The plan's steps load records without `checkLockReferences`. A record whose fixture changed would be scored against stale labels, and V3 would calibrate on it (T-67-12).
- **Fix:** `main` runs `checkLockReferences(records)` right after loading. A mismatch exits 1 before any request.
- **Files modified:** `scripts/bench/shadow/run-shadow.mjs`
- **Commit:** `4ee3a214`

**2. [Rule 2 - Security] The run id is a safe file name, and evidence is never overwritten**
- **Found during:** Task 1
- **Issue:** `--run-id` builds output file names, so `../x` could write outside `--out`. A reused id would also silently overwrite a V3 run's evidence.
- **Fix:**
  - `--run-id` must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`.
  - An id whose output files already exist is refused with exit 2 before any request.
  - Both files are written with flag `wx`.
- **Files modified:** `scripts/bench/shadow/run-shadow.mjs`, `tests/jev-shadow-harness.test.mjs`
- **Commit:** `4ee3a214`

**3. [Rule 2 - Security] The gateway value is never echoed**
- **Found during:** Task 1
- **Issue:** A rejected `--gateway` could carry `user:password@`. The plan asks only that unknown flags be stripped and truncated.
- **Fix:** URL errors are fixed text, and the URL never appears in either output file. A test checks that a rejected URL's password is absent from the errors.
- **Commit:** `4ee3a214`

### Interpretations and additive API

- **A run with no decisions.** It writes rows and a report (`servedModel: null`, every row a fallback) and exits 1. The plan's exit table did not cover it, and reporting such a run as 0 would read as a successful shadow run.
- **The mixed-model refusal.** It covers fallback bodies' `servedModel` too, and both refusals stop at the first offending response to save spend on a production run.
- **Additive exports.**
  - `answersForBody` and `RECORDED_ANSWERS_PATH` in `recorded-answers.mjs`.
  - `checkGatewayUrl`, `parseFlags`, `gatewayFrom`, `forEcho`, `EXIT` and the path constants in `run-shadow.mjs`, which `gateway-smoke.mjs` reuses so both commands validate `--gateway` identically, without a new shared file.
  - `SMOKE_USAGE` and `smokeLine` in `gateway-smoke.mjs`.
- **`parseArgs(argv, {now})`.** It takes an optional clock for the default run id.
- **TDD ordering.** `buildCandidateProfile` existed inside `run-shadow.mjs` from Task 1, because `--pin` needs it, but stayed unexported until Task 2. That made Task 2's RED step genuine.

## TDD Gate Compliance

- **Task 1:** `test(67-12)` `0ed7a1cd` comes before `feat(67-12)` `4ee3a214`.
- **Task 2:** `test(67-12)` `9f7d6958` comes before `feat(67-12)` `24684a6b`.
- Mutation checks:
  - disabling the instrument-version refusal turned exactly that test red;
  - writing the gateway URL into the report turned the offline body-free test red.

## Verification

- `node --test tests/jev-shadow-harness.test.mjs tests/jev-shadow-score.test.mjs tests/jev-shadow-select.test.mjs tests/jev-shadow-records.test.mjs`: 88 passed, 0 failed (Node 24.14.1).
- `grep -nE "systemone|typesafe\.ai|openrouter\.ai|JEV_API_KEY|Authorization"` over all three scripts prints nothing. The static test bans the same strings case-insensitively, plus `process.env` and Node 22+ array and promise helpers.
- `node scripts/bench/shadow/gateway-smoke.mjs` and `node scripts/bench/shadow/run-shadow.mjs` with no flags each exit 2 with a `usage:` line. A spawned-process test covers both.
- `git status --porcelain scripts/bench/.local` prints nothing, and `git diff --quiet -- scripts/bench/tasks scripts/bench/lib` exits 0.
- **Node 20.** The harness suite cannot load `better-sqlite3` locally on the official Node 20.20.2 binary (`ERR_DLOPEN_FAILED`, the known local ABI gotcha). Separate probes on Node 20 ran `run-shadow` main (stub gateway, all 25 records, all five kinds not_a_fit, exit 0), `buildAnswerLookup` (25 keys) and `gateway-smoke` main (exit 0). The new files use no Node 22+ API.
- **Neighbour suites, all exit 0:**
  - `agent-provider-forbidden-flags`;
  - the `phase60`, `phase64` and `phase65` full-tests harnesses;
  - `delegation-phase-contract`;
  - `server-no-ip-leak`;
  - `jev-instrument`, `jev-gateway-router`, `jev-gateway-log-hygiene`, `jev-extension-boundary` and `jev-client`;
  - the ten bench suites.
- **Full chain, tolerant mode** (`node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-67-12-full`): all 334 commands exited 0 in 4.2 min, `mcp-install-platforms` included. The new suite is not in the chain yet (67-13 registers it). Afterwards `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` were restored, and `git status --short` showed only this SUMMARY.

## Known Stubs

None. `answers/fake-upstream.json` is deliberately hand-written fake data, labelled as such in its `note`, and serves offline CI only. V3 runs the same harness against the live gateway.

## Threat Flags

None beyond the plan's threat model. The harness and the smoke command are operator-side clients of the existing public route (T-67-01, T-67-04, T-67-09 and T-67-12 are mitigated as planned).

## Deferred to Validation Block

Deferred: M-67-04 (V2), M-67-08, M-67-09 (V3), M-67-10 (V4).

- **M-67-04 (V2).** After the branch deploy (`flyctl deploy`, never a push to main), run the smoke command above once per configured route. Confirm the served model, `usageSource`/`costSource` and latency. With `JEV_ENABLED` off, confirm the line shows `fallback:"disabled"`.
- **M-67-08 (V3).** Gather enough labelled records, roughly 60-130+ above-cut readings per question, mostly `recorded-llm` records in the 67-10 format.
- **M-67-09 (V3).**
  - Run the V3 shadow command above against exactly the V2 pin and review the buckets and Wilson intervals.
  - Commit `report.candidateProfile` unchanged beside `uncalibrated.json`, if it is non-null, and record every not-a-fit kind.
  - Re-run `node tests/jev-calibration-profile.test.js` and `node tests/jev-policy-tighten-only.test.js`.
- **M-67-10 (V4).** Fast mode stays off, and no Jev decision acts for users, until the comparative gate passes.

Nothing in this plan called Jev, needed a credential, touched production or spent money.

## User Setup Required

None.

## Next Phase Readiness

- **67-13** must register `node --test tests/jev-shadow-harness.test.mjs` in the root `package.json` `test` chain and in `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js`). It can be combined with the other shadow suites in one `node --test` command.
  - In CI on Node 20 the suite needs `showcase/server/node_modules` (express and better-sqlite3), which CI already installs.
- **V2 and V3** have exact command lines above.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-17*

## Self-Check: PASSED

All five created files and this SUMMARY exist. All four task commits (0ed7a1cd, 4ee3a214, 9f7d6958, 24684a6b) are in history, and none carries an attribution line. STATE.md, ROADMAP.md and REQUIREMENTS.md were left to the orchestrator.
