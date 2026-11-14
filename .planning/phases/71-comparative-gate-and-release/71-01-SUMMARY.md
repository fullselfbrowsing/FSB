---
phase: 71-comparative-gate-and-release
plan: 01
subsystem: testing
tags: [bench, jev, scrubber, sync-recheck, fixture-server, f5, sweep-baseline]

# Dependency graph
requires:
  - phase: 66.1-mcp-settings-tool
    provides: the settings tool (name, args, string coercion, WRITE_FIELDS, SETTING_UNAVAILABLE/UNSUPPORTED)
  - phase: 67-hosted-jev-gateway-policy-and-shadow-mode
    provides: FsbJevState (buildRequest, matchesSecret, CONTRACT, scrubber rule 7) and the tighten-only suite
  - phase: 68-autopilot-fast-mode
    provides: fsbJevFastModeEnabled, fsbJevCaptureArmed, jevMeasurement and its get_session_detail projection
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: EXPECT_TOOL_NAMES_VERBATIM, EXPECT_REQUIRED, the tools/list suites
  - phase: 70-bounded-mcp-fast-task
    provides: the run_task fast_mode block, FAST_MODE_* lists, scripts/bench/lib/fast-mode.mjs and runTask.fastMode
provides:
  - "71-SYNC-RECHECK.md: $P71_START, the S1-S11 interface table (8 MATCH, 3 CHANGED), Derived values S12-S16 (Exposure rule, END_LABELS, FALLBACK_REASONS, success words, MCPMessageType lists, tighten-only suites, tool count 73, fixture evidence, docs inventory) and 3 Drift substitutions"
  - "71-SWEEP-BASELINE.json: the pre-edit regression sweep (23/23 pass, failures []); its head is $P71_START"
  - "scripts/bench/fixture-server.mjs newRunToken(): 24 lowercase letters drawn with crypto.randomInt"
  - "tests/bench-f5-token.test.mjs: F5 proof against the real FsbJevState, registered in the bench node --test command"
affects: [71-02, 71-03, 71-04, 71-05, 71-06, 71-07, 71-10, 71-11, V3, V4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sync re-check table with MATCH/RENAMED/CHANGED/MISSING plus verbatim Derived values that later plans copy instead of re-deriving"
    - "A test that loads the real extension CJS scrubber through createRequire so a weakened scrubber or token cannot pass silently; invalid_request fails on its own message so the proof cannot pass vacuously"

key-files:
  created:
    - .planning/phases/71-comparative-gate-and-release/71-SYNC-RECHECK.md
    - .planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json
    - tests/bench-f5-token.test.mjs
  modified:
    - scripts/bench/fixture-server.mjs
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "$P71_START = 3493c34ad99efec9df7d340811a58e019c0f55d1; the pre-edit sweep has no failures"
  - "jevMeasurement is persisted in the same save as measurementSummary, so Exposure rule case (3) stays 'no_block'"
  - "jevMeasurement attempts have no toolMs; later plans use the implemented key list (Drift substitution 2)"
  - "D-09 item 3 is replaced by the fastMode row block, candidateTypedOutcome ['done'] and the M-70-04 agreement table (Drift substitution 1); a typed done always comes with status 'success'"
  - "END_LABELS has 26 labels including meta_cognitive_loop_break, session_not_found/session_not_running (kept for parity with Phase 70 FAST_MODE_REASONS.blocked) and other"
  - "F5 fixed in the bench only: 24 lowercase randomInt letters; the scrubber is unchanged"

patterns-established:
  - "Bench run tokens are lowercase letters only, so no rendered core goal trips scrubber rule 7"

requirements-completed: [EVAL-01, EVAL-02, REL-02]

# Metrics
duration: 16min
completed: 2026-10-18
---

# Phase 71 Plan 01: Sync Re-check, Sweep Baseline and the F5 Token Fix Summary

**The sync re-check of every interface Phase 71 depends on is recorded (8 MATCH, 3 CHANGED, none blocking), with $P71_START and a 23/23 pre-edit sweep baseline. Bench run tokens are now 24 lowercase `randomInt` letters, so the real FsbJevState accepts every rendered core goal. Before the fix, 72 of 96 server-token goals and 204 of 288 port-shape goals were refused as `sensitive_goal`.**

## Performance

- **Duration:** about 16 min
- **Started:** 2026-10-19T00:39Z (19:39 -05:00)
- **Completed:** 2026-10-19T00:55Z
- **Tasks:** 2/2
- **Files modified:** 6 (3 created, 3 modified)

## $P71_START and the sweep baseline

- **$P71_START:** `3493c34ad99efec9df7d340811a58e019c0f55d1`. Read it with `P71_START=$(node -p "require('./.planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json').head")`.
- **Sweep baseline:** `node scripts/bench/sweep-tests.mjs --files scripts/bench/run-bench.mjs scripts/bench/fixture-server.mjs scripts/bench/lib/mcp-client.mjs scripts/sync-product-version.mjs extension/ui/onboarding.js --out .planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json`. It selected 23 referencing tests and all passed.
- **Failure list:** `[]` (none). The run recorded `port7225Held: true`; the holder is the user's own `npx fsb-mcp` hub (pid 7109), which was left running. Port 7226 was free.
- **After the F5 edit:** the same sweep with `--baseline` selected 24 tests (the new F5 suite joins), all 24 passed, and it reported "NEW failures vs baseline: none".

## Sync re-check results (71-SYNC-RECHECK.md)

| Item | Status |
|------|--------|
| S1 settings tool | MATCH |
| S2 fsbJevFastModeEnabled | MATCH |
| S3 fsbJevCaptureArmed | MATCH |
| S4 jevMeasurement | CHANGED (no `toolMs` on attempts) |
| S5 acted attempt, CALIBRATION_STATUSES | MATCH |
| S6 FALLBACK_REASONS (19), scrubber rule 7 | MATCH |
| S7 terminal reason (`session.outcomeDetails.reason`) | MATCH |
| S8 Phase 70 D-09 items | CHANGED (item 3, as expected) |
| S9 Phase 69 | MATCH |
| S10 test chain | MATCH |
| S11 docs inventory | CHANGED (more sites and higher xlf counts than Pitfall 11 listed) |

Nothing is MISSING and nothing blocks Phase 71: FsbJevState.buildRequest exists, the settings tool exists, and jevMeasurement is projected for run_task (`source:'mcp'`) sessions.

### Non-MATCH items and their substitutions

1. **S8, D-09 item 3** (written verbatim in "Drift substitutions"): "D-09 item 3 (typed words in `status`) is replaced by: (1) the v2 committed row carries a `fastMode` block {outcome, reason, uncertainUnobserved, humanGate, exhausted, latched}, projected from raw `runTask.fastMode` through scripts/bench/lib/fast-mode.mjs (71-02); (2) a typed `done` on a checker-failed run counts as `claimedSuccessOnFail`, because the gate declares `claimWords.autopilot.candidateTypedOutcome: ['done']` and the evaluator takes the per-run union of the status claim and the typed claim (71-05, 71-06); (3) the gate report renders the M-70-04 typed-outcome agreement table as descriptive output (71-07)."
   - The real FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS and FAST_MODE_OUTCOMES equal 70-05's lists, so there is no rename for 71-02.
   - Checked in code: a typed `done` needs `message.outcome === 'success'` and a run-evidence record. The same message makes run_task `status` `'success'`, which is an S12 success word.
2. **S4, attempt keys.** The implemented attempt is `{iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage:{inputTokens, source}, cost:{usd, source}, fallback, outcome, escalationReason, op, stepOutcome}`.
   - There is no `toolMs`. 68-09-PLAN.md:63 never had it; the 71-01 and 71-02 quotes added it.
   - Later plans (71-02 first) must not read or synthesise `attempts[].toolMs`.
3. **S11, inventory.** The docs plans use the S11 inventory.
   - Each of the 7 xlf catalogs holds 11 tool-count units: 11 source occurrences per catalog, and 11 target occurrences in each of the 6 locale files. Pitfall 11 said "7 hits each, 10 in German".
   - The inventory also lists `agents.hero.subtitle` (agents-page.component.html:15), llms-full.source.md:43 and the generated public/llms*.txt lines.
   - 71-10 already covers onboarding.js:882, and 71-11 already covers the hero sentence.

### The S4 Exposure rule as copied (Derived values)

"For a v2 row, `jev` comes from (1) `raw.jevMeasurement` when it is a plain object (jev.source 'measurement'); else (2) the non-null `jev` summary of the projected `raw.runTask.fastMode` (jev.source 'summary'; acted = fast_steps > 0, so a summary with 0 attempts is not acted); else (3) on a counted autopilot row (infraError null) with condition 'on', whose switch was written and read back before t0, whose session detail was actually read (its `flags` do not include `session_detail_missing`), and which has no fast_mode block: zero Jev attempts (jev.source 'no_block'; acted false, counts 0); else (4) not recorded (jev.source null, acted null): 'off' rows without a block, rows with no confirmed switch (condition null, host arms, infra rows), 'on' rows whose fast_mode block carries `jev: null`, and 'on' rows with no block whose session detail was never read (flag `session_detail_missing`, for example a timed-out run whose detail fetch also failed; a missing jevMeasurement then proves nothing). Only case (4) is unknown exposure; a run with no Jev attempt is never flagged jev_measurement_missing and never takes the gate's unknownExposure reading."

**S4 persistence order: same save.**
- `_saveSessionUnlocked` writes `iterationTiming`, `measurementSummary` and `jevMeasurement` from one in-memory session into one record, with a single `chrome.storage.local.set` (automation-logger.js:1023-1227).
- Every saveSession call site is a terminal save. The agent loop's finalizeSession saves before the completion broadcast that settles run_task.
- So case (3) stays `'no_block'`, and no persistence substitution was needed.

## Task Commits

1. **Task 1: Preconditions, $P71_START, sweep baseline and the sync re-check record.** `3f5ee729` (docs)
2. **Task 2: F5 fix** (TDD):
   - RED: `de59959a` (test). The suite was added unregistered and failed 3 of 4 tests against the unedited generator.
   - GREEN: `371c72e3` (fix). The generator change plus the registration in both command lists.

## F5 details

**The buildRequest input shape.** This is the smallest input the real validation accepts: `{kinds: ['completion'], goal, url: <the run URL>, title: '', visibleText: '', elements: [], offeredOps: []}`.
- A `completion` question needs no element and no offered operation (jev-state.js validShape: only `operation` needs offeredOps, and only `target` needs elements).
- No element or op had to be added. `invalid_request` never occurred.
- `buildRequest` checks `matchesSecret(input.goal)` before it parses the URL (jev-state.js:780).

**RED failure count.** Against the unedited `randomBytes(16).toString('base64url')` generator, 3 of 4 tests failed:
- The token-shape test failed, because base64url tokens are not `/^[a-z]{24}$/`.
- "buildRequest accepts every rendered core goal with real fixture-server tokens and URLs": **72 of 96** rendered goals were refused (`matchesSecret=true`, `reason=sensitive_goal`).
- "buildRequest accepts every rendered core goal at other port shapes": **204 of 288** goals were refused.
- The control test passed, as it must: the old-shape token `Ab3dEf9hIj2kLm5nOp8qRs` at port 54321 is refused as `sensitive_goal`.

**GREEN.**
- **Tests:** 4/4 pass, including 0 of 96 and 0 of 288 goals refused. The control token is still refused through the same buildRequest path.
- **Token generator:** `newRunToken()` builds 24 characters, each `String.fromCharCode(97 + randomInt(26))`, then `logFor(token)`.
- **Unchanged:** TOKEN_PATTERN, `runUrl` and the header comment. The header describes only the token pattern, which lowercase letters still match; a short comment above `newRunToken` records why.
- **`randomBytes` stays imported:** the default secret still uses it (`randomBytes(32).toString('hex')`, fixture-server.mjs:100). After the edit the file has no `toString('base64url')` use at all.

**Registration.** ` tests/bench-f5-token.test.mjs` is appended to the bench `node --test tests/bench-export-history.test.mjs ...` string in package.json scripts.test (index 303). The identical edit is in REFINEMENT_ROOT_TEST_COMMANDS (tests/delegation-phase-contract.test.js:160). Both are in the same commit, and each string appears exactly once.

**Verification run.**
- Bench command: 342/342.
- `node tests/delegation-phase-contract.test.js`: 1252 passed, 0 failed.
- `npx --offline -y node@20 --test tests/bench-f5-token.test.mjs tests/bench-fixture-server.test.mjs`: 33/33 on v20.20.2. The official Node 20 binary gives the same 33/33.
- The plan's verify command exits 0.
- The TAP name check counts 6 lines.
- `grep -lE "7225|7226" tests/bench-f5-token.test.mjs` prints nothing.
- `git diff --quiet $P71_START -- extension/ai/jev-state.js showcase/server/src/jev` exits 0, so the scrubber is untouched.

## Files Created/Modified

- **`.planning/phases/71-comparative-gate-and-release/71-SYNC-RECHECK.md`:** the S1-S11 table, Derived values S12-S16 and Drift substitutions.
- **`.planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json`:** the pre-edit sweep. Its `head` is $P71_START.
- **`tests/bench-f5-token.test.mjs`:** the F5 proof, which runs the real FsbJevState with real fixture-server tokens and 6 URL port shapes plus the control token.
- **`scripts/bench/fixture-server.mjs`:** `randomInt` import and the lowercase token generator.
- **`package.json`, `tests/delegation-phase-contract.test.js`:** the bench command now ends with `tests/bench-f5-token.test.mjs`.

## Decisions Made

- **END_LABELS keeps `session_not_found` and `session_not_running`.** They are broadcast-only guard reasons and never persisted, but they are kept for parity with Phase 70's `FAST_MODE_REASONS.blocked`. `payment_not_approved` and `site_consent_required` are run-evidence gates, not terminal reasons, so they are excluded.
- **S13 command.** It strips `//` comments before it reads the `MCPMessageType` union, because a comment in that union contains `;`. A naive extractor stops early and reports the pin and current lists as identical. The recorded lists are: pin 45; current 47; the difference is exactly `mcp:get-settings` and `mcp:set-setting`.

## Deviations from Plan

### Process deviations

**1. [TDD protocol] Task 2 landed as two commits (test, then fix) instead of the single `fix(71-01)` commit the plan names**
- **Why:** The task is `tdd="true"`, and the executor's TDD protocol requires a RED `test(...)` commit before the GREEN commit.
- **How:** The RED commit adds only the unregistered suite, so the test chain was never red. The registration landed in the `fix(71-01)` commit together with the generator change, as the plan requires.
- **Commits:** `de59959a`, `371c72e3`

**2. [Executor environment] ListAgents unavailable**
- **What was done instead:** As the plan allows, the precondition used `git log -5 -- showcase/angular/src/locale`, and the result is recorded in 71-SYNC-RECHECK.md. No locale commit is newer than 68-10, and there are no uncommitted locale changes.

### Auto-fixed Issues

None. The plan's code changes went in as written.

## Issues Encountered

- **zsh `:m` modifier.** `git show $P:mcp/...` in zsh reads `:m` (and `:e`) as history modifiers. The recorded S13 command therefore writes the full sha literally.
- **Line drift in the plan quotes.**
  - runs.mjs line numbers still match.
  - run-bench.mjs moved slightly: flags at :758 and :821, the detail `until` at :585.
  - The "no attempt" line is 68-05-PLAN.md:115, not :114.
  - 71-SYNC-RECHECK cites the real lines.

## Deferred to Validation Block

These are restated from 71-VALIDATION.md Manual-Only rows. None was waited on.
- **V1, M-71-00:** owner sign-off after the 66-10 V1 smoke, before the V1 campaign.
- **V1, M-71-01:** pin Claude Code for V1 and V4 (bench-only directory first on PATH, never through the env).
- **V1 (reused at V4), M-71-01c:** pin one Chrome for Testing major, without touching the everyday Chrome.
- **V1, M-71-01b:** V1 runs the round count the frozen gate declares (`minRounds`), only after M-71-00.
  - Known method difference: the V1 baseline runs the pin's own base64url token generator, so the token alphabet differs from V4. Plan 71-03 lists this in the report method notes.
- **V3, M-71-04:** a calibrated profile makes the fast path act on the fixtures with 0 `sensitive_goal`. This plan proves the bench side offline against the real scrubber. The live calibrated run is V3.

## Known Stubs

None.

## Next Phase Readiness

- Plans 71-02 to 71-11 can read their vocabularies from 71-SYNC-RECHECK.md "Derived values" and apply its three Drift substitutions.
- 71-02 should drop `toolMs` from its real-shape jevMeasurement fixtures.
- F5 is fixed in the bench, so V4's fast-mode arm can be exercised once V3 provides a calibrated profile.

## Self-Check: PASSED

- FOUND: .planning/phases/71-comparative-gate-and-release/71-SYNC-RECHECK.md
- FOUND: .planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json
- FOUND: tests/bench-f5-token.test.mjs
- FOUND: scripts/bench/fixture-server.mjs (randomInt(26) count 1; toString('base64url') count 0; Math.random count 0)
- FOUND commits: 3f5ee729, de59959a, 371c72e3
