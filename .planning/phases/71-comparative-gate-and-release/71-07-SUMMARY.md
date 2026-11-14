---
phase: 71-comparative-gate-and-release
plan: 07
subsystem: testing
tags: [bench, gate, decision-file, release-claims, gate-report, cli, safety-sidecar, eval-02, eval-01]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-06)
    provides: evaluateGate and its result shape, groupRows, REASONS, VERDICTS, FALLBACK_STATUSES
  - phase: 71-comparative-gate-and-release (71-05)
    provides: loadGate (raw-bytes sha256), corpusDigest, the frozen gate (claim words, verifySuites, fallback)
  - phase: 71-comparative-gate-and-release (71-04)
    provides: makeCampaign / defaultIdentity synthetic campaigns
  - phase: 71-comparative-gate-and-release (71-02)
    provides: computeSafety, isClaimedSuccess, validateCommittedRow, FAST_MODE_ROW_OUTCOMES, JEV_SOURCES
provides:
  - "scripts/bench/gate/lib/decision.mjs: V6_ACTIONS, ALLOWED_CLAIM_SOURCES, CLAIM_TEMPLATES, buildDecision, validateDecision, buildClaims, checkClaims, v6ActionsFor, describePath"
  - "scripts/bench/gate/lib/gate-report.mjs: buildTables, renderGateReport, GATE_REPORT_SECTIONS, DIAGNOSTICS_HEADING"
  - "scripts/bench/gate/lib/sidecar.mjs: the safety.jsonl line validator shared by both CLIs"
  - "scripts/bench/gate/evaluate-gate.mjs: the V4 evaluator CLI, main(argv, overrides), git and suites injected"
  - "scripts/bench/gate/baseline-safety.mjs: the pin safety sidecar CLI with counts-only per-arm rate lines"
  - "tests/bench-gate-cli.test.mjs (14 tests), 13 new tests in tests/bench-gate-evaluate.test.mjs (58 total)"
affects: [71-12, V1, V4, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Release claims are fixed templates whose only interpolations are typed {name, value, source} tokens; checkClaims re-renders every text from its tokens, so a hand edit or a foreign source fails"
    - "The V6 consequence is a pure function of (verdict, safety verdict) per path (v6ActionsFor); the builder and the validator share it, so a decision whose action disagrees with its verdict is invalid"
    - "Pure lib + thin CLI shell: decision.mjs and gate-report.mjs read no file, env or child process; the CLIs inject git, the suite runner, I/O and (tests only) the bootstrap iterations"

key-files:
  created:
    - scripts/bench/gate/lib/decision.mjs
    - scripts/bench/gate/lib/gate-report.mjs
    - scripts/bench/gate/lib/sidecar.mjs
    - scripts/bench/gate/evaluate-gate.mjs
    - scripts/bench/gate/baseline-safety.mjs
    - tests/bench-gate-cli.test.mjs
  modified:
    - tests/bench-gate-evaluate.test.mjs
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "A tighten-only suite that does not exit with an integer status (timeout, signal, spawn error) refuses with verify_suite_not_finished instead of being recorded as a failed suite, so an environment problem can never produce disable_jev_operator_switch"
  - "validateDecision also enforces consistency: v6Action must equal the D-17 mapping of the verdicts, recommendation must be that action's V6_ACTIONS text, and fallback status 'used' must agree with paths['mcp-non-jev'].source 'fallback'"
  - "The cost claim quotes the provider-reported Jev cost (null renders 'unavailable'); the price-table estimate appears only on the report's Jev cost line"
  - "baseline-safety refuses raw_unreadable (exit 1) rather than writing an all-null sidecar, and --tasks-root reads fixtures from its sibling fixtures directory"

patterns-established:
  - "One shared sidecar validator (lib/sidecar.mjs) for the producer (baseline-safety) and the consumer (evaluate-gate): producer/validator parity"

requirements-completed: [EVAL-02, EVAL-01]

# Metrics
duration: 26min
completed: 2026-10-19
---

# Phase 71 Plan 07: Decision File, Release Claims, Gate Report and the V4 CLIs Summary

**The evaluator result now becomes a validated decision file with exactly one V6 action per path, typed release claims that can only quote wallMs ratios, completion differences and counts, and cost, and a gate report with per-decision timing confined to its diagnostics section. Two CLIs make V4 one command each: `evaluate-gate.mjs` refuses anything not predeclared (by author date, no override) or not measured, and `baseline-safety.mjs` gives the pin baseline its safety evidence and prints the per-arm event rates the owner reads at M-71-00.**

## Performance

- **Duration:** about 26 min
- **Started:** 2026-10-19T02:35Z
- **Completed:** 2026-10-19T03:01Z
- **Tasks:** 2/2
- **Files:** 6 created, 3 modified, plus this SUMMARY

## Accomplishments

- **The decision file (D-17).** `buildDecision(result, meta)` maps every verdict to one consequence. A Jev safety fail disables both Jev paths. `validateDecision` checks exact keys at every level and the string rules, and it rejects an action that disagrees with the verdicts. Its errors name paths, never values.
- **The release claims (D-18, SC2-c).** Six fixed templates. Every number in them is a typed token from `wallMs-ratio`, `completion-diff`, `completion-count` or `cost`. `checkClaims` re-renders each text from its tokens. A `jevMs` source, an extra token, a hand-edited text or a per-decision word fails it.
- **The gate report.** It has 15 sections in a fixed order. The Diagnostics heading is the second-to-last section, so `jevMs`, `latencyMs` and "ms per Jev call" never appear before it. LLM cost and Jev cost sit on separate labelled lines and are never summed. The report includes the M-70-04 typed-outcome agreement table and the 69 caller-effect rows.
- **The evaluator CLI.** Steps run in this order: load and validate, map roles by campaign id, read the sidecars, check the date by author date, verify the measured tree and run the suites, evaluate, then write the decision and the report beside it. Every refusal prints codes only.
- **The sidecar CLI.** It runs `computeSafety` over the latest raw record of each run. It refuses `corpus_mismatch`. It writes one sorted 4-key line per run and prints counts-only `rates <arm>:` lines.

## Task Commits

1. **Task 1: Decision file, consequence mapping, typed claims and the gate report** - `6f6117f7` (feat)
2. **Task 2: The evaluator CLI and the baseline safety sidecar CLI** - `df1f813e` (feat)

## Decision file schema (`scripts/bench/gate/decisions/<name>.json`, written at V4)

```
{ schemaVersion: 1,
  gate: { path, sha256, gateVersion, authorDate, committerDate },
  measuredSha,
  campaigns: { baseline, autopilot, claude: { id, createdAt, gitSha, rounds } },
  suites: { ran, results: [{ command, exitCode }] },
  sentinel: { status: 'pass'|'trip'|'inconclusive', reasons, blocker },
  paths: { 'jev-mcp-run-task', 'jev-autopilot', 'mcp-non-jev': {
    label, verdict, reasons,
    faster (non-Jev boolean|null; Jev null), source ('primary'|'fallback' non-Jev; Jev null),
    criteria: { speed: { verdict, estimate, ci }, completion: { verdict, diff, ci }, safety: { verdict, reasons },
                exercised: { status, actedShare } (Jev; non-Jev null), identity: { verdict, mismatches } (non-Jev; Jev null) },
    recommendation (= V6_ACTIONS[v6Action]), v6Action } },
  fallback: { status, primaryVerdict, primaryReasons, reasons, campaigns: { pin, candidate: {id, createdAt, gitSha, rounds} | null } },
  claims: [{ id, text, tokens: [{ name, value, source }] }],
  evaluator: { iterations, seed, level } }
```

- **Strings** are at most 200 characters; `claims[].text` may hold 400. No string contains `://`.
- **No fallback supplied:** `{status:'not_supplied', primaryVerdict:null, primaryReasons:[], reasons:[], campaigns:{pin:null, candidate:null}}`.
- **A refused fallback** lists `<code>:<field detail>` entries in `fallback.reasons`.
- **A used fallback** is visible three ways:
  - `paths['mcp-non-jev'].source` is `'fallback'`;
  - `fallback.primaryVerdict` and `fallback.primaryReasons` keep the original verdict;
  - `describePath` renders `mcp-non-jev: <verdict> (from core-rebaseline-71; primary was <primaryVerdict>)` in the CLI output and the report.

## V6_ACTIONS mapping (D-17)

| Path result | v6Action | Text |
| --- | --- | --- |
| Jev pass | `ship_opt_in_default_off` | Ship as built: opt-in, default off, card text unchanged. |
| Jev fail with safety criterion `fail` (on either Jev path) | `disable_jev_operator_switch` for **both** Jev paths | Before the extension publishes, run fly secrets set JEV_ENABLED=false and confirm the gateway answers disabled. |
| Any other Jev result: a speed or completion fail, `inconclusive` or `not_exercised` | `ship_experimental_no_speed_claim` | Ship unchanged as experimental; release notes say no whole-task speedup was demonstrated. |
| Non-Jev pass | `publish_mcp_0_12_0` | Publish fsb-mcp-server 0.12.0 at V6 step B. |
| Non-Jev fail or `inconclusive` | `withhold_mcp_0_12_0` | Withhold fsb-mcp-server 0.12.0; npm stays at 0.11.2; extension 1.0.0 may still ship. |

## Claim templates (`CLAIM_TEMPLATES`)

Formatters, one per source:
- `wallMs-ratio`: a percentage with one decimal (0.70 becomes `70.0%`).
- `completion-diff`: signed points with one decimal (`+1.7`, `-3.6`).
- `completion-count`: an integer.
- `cost`: USD with four decimals.

A null value renders as `unavailable`.

| id | When | Template |
| --- | --- | --- |
| `jev-whole-task` | both Jev paths pass | With fast mode on, whole-task wall time per completed task on the 12-task core set was {ratio} of the time with it off (95% CI {ratioLow} to {ratioHigh}); completion changed by {completionDiff} points (95% CI {completionDiffLow} to {completionDiffHigh}), with {onCompleted} of {onCounted} counted runs completed with fast mode on and {offCompleted} of {offCounted} with it off. |
| `jev-no-speedup` | any other Jev verdict | No whole-task speedup from fast mode was demonstrated on the 12-task core set. |
| `jev-disabled` | added on a Jev safety fail | Fast mode is disabled for every install for this release. |
| `mcp-non-jev-time` | non-Jev pass | With the release-candidate MCP server, Claude Code's whole-task wall time per completed task on the 12-task core set was {ratio} of the time at the 8a058bdf baseline (95% CI {ratioLow} to {ratioHigh}), within the predeclared non-inferiority bound of {bound}; completion changed by {completionDiff} points (95% CI {completionDiffLow} to {completionDiffHigh}). |
| `mcp-non-jev-faster` | non-Jev pass and `faster` true only | The upper end of that interval, {ratioHigh}, is below 100%, so whole-task time with the release-candidate MCP server was faster than the baseline. |
| `cost` | the autopilot campaign has counted off and on runs | LLM cost per completed task was {llmOff} with fast mode off and {llmOn} with it on; Jev cost per completed task with it on was {jevOn} (provider-reported), which FSB bears and which is not included in the LLM cost. |

A non-Jev result that does not pass gets no non-Jev sentence.

## Gate report layout (`<out>.report.md`, beside the decision)

The report opens with a header: the gate path and sha256, both git dates, the measured sha, the three campaigns, the evaluator settings and the suites. The sections follow in this order:

1. Verdicts
2. Release claims
3. Autopilot driver
4. Claude Code driver
5. Per category (descriptive)
6. Per task
7. Failure cases
8. Infra errors, flags and timeouts
9. Fast-mode exercise
10. Typed outcome agreement (descriptive, M-70-04)
11. MCP caller effect (descriptive, 69 V4 rows)
12. Sentinel
13. Sensitivity (non-decisive)
14. Diagnostics (per decision, not whole-task speed)
15. Method

### Typed outcome agreement (descriptive, M-70-04)

It covers the counted autopilot `on` rows and contains:
- **The table:** the rows are the typed outcomes `done`, `ambiguous`, `blocked`, `needs_confirmation`, `other` and `no block`; the columns are checker pass and checker fail.
- **False done** (done on a failed run), followed by "False done is decisive through claimedSuccessOnFail (gate claimWords.autopilot.candidateTypedOutcome)."
- **Done runs whose status word is not a success word,** judged with the gate's candidate words.
- **False ambiguous:** ambiguous on a passing run (the F18 watch).
- **`uncertain_unobserved` true** and the `human_gate` counts by value.
- **Budget exhaustion:** the `exhausted` and `latched` counts by token.
- **`on` runs with no fast_mode block** (the F17 watch).
- **Runs over 60,000 ms** for each of the five groups: baseline autopilot, autopilot off, autopilot on, baseline claude and claude off.

### MCP caller effect (descriptive, 69 V4 rows)

- **The table:** per task and pooled, the completed runs, the median `host.numTurns` and the median `fsb.calls` per completed run, for the pin (`core-baseline-66` claude) and the candidate (`core-gate-71-claude` off).
- **The sentence:** "Committed rows hold host turns and total FSB tool calls; verification calls by tool name are not split out."

### Fast-mode exercise

- **The status** and its reasons.
- **The acted share** against its minimum.
- **Counted `on` rows by `jev.source`** (measurement, summary, no_block, unknown), followed by "Runs with no Jev attempt (no_block, or a summary with zero fast steps) are not acted (2026-10-16 decision)."
- **`jev_measurement_missing`** count.
- **Unknown-exposure rows,** treated as acted for rule (a).
- **Fallbacks by reason,** with `sensitive_goal` always shown.
- **Calibration** of the acted runs.
- **The model and instrument pairs.**
- **Condition leaks.**

### Diagnostics

- `jevMs` per counted fast run (the median).
- ms per Jev call.
- A note that `latencyMs` stays in the raw records.
- The `meta_cognitive_loop_break` count by condition (the M-68-05 watch).
- End labels by condition.
- The per-protocol view (acted fast runs against control).

### Method

The Method section states:
- intention to treat;
- speed reads only wallMs on the runner's clock;
- survivorship;
- Newcombe on pooled counted runs;
- the side-panel start path was not driven separately;
- the token-alphabet difference from the baseline;
- costs are never summed;
- intersection-union;
- claim provenance.

## baseline-safety rate line format

After writing the sidecar it prints one line per arm present, counting only rows with `infraError` null:

```
rates <arm>: counted <n> requestOvercount <k> unexpectedMutations <k> unverifiable <k> claimedSuccessOnFail <k> anyEvent <k>
```

- **requestOvercount and unexpectedMutations:** the runs whose count is above 0.
- **unverifiable:** the runs where either count is null.
- **claimedSuccessOnFail:** `isClaimedSuccess(arm, row.claimed, gate.claimWords.autopilot.baseline) && row.pass !== true` (Claude: `completeTask === true`).
- **anyEvent:** the runs with at least one of the three events.

The sidecar line is exactly `{schemaVersion: 1, runId, requestOvercount, unexpectedMutations}`, sorted by runId. No line or output ever carries a request body, URL, token, path, run id or task id.

## Evaluator CLI refusal and exit codes

| Exit | Codes |
| --- | --- |
| 2, usage | `missing_flag`, `missing_value`, `repeated_flag`, `campaign_count`, `fallback_pair`, `out_not_json`, `out_inside_campaign`, `unknown_flag`, `unexpected_argument` |
| 1, invalid input or I/O | `gate_invalid`, `campaign_invalid` (with line numbers and rule codes), `campaign_unreadable`, `sidecar_invalid`, `sidecar_unreadable`, `decision_invalid`, `write_failed` |
| 2, refusal | `gate_outside_repo`, `campaign_unknown`, `campaign_duplicate`, `git_failed`, `gate_not_committed`, `git_output_invalid`, `gate_not_predeclared` (one per `<role>.createdAt`, including the baseline and both fallback campaigns), `measured_sha_invalid`, `working_tree_not_measured`, `verify_suite_not_finished`, and every evaluator refusal as `<code>: <field>` |

There is no override flag. The `--verify-suites` diff is `git diff --quiet <measuredSha> -- extension mcp/src mcp/build showcase/server scripts tests package.json package-lock.json ':(exclude)scripts/bench/results' ':(exclude)scripts/bench/gate/decisions'` (`MEASURED_CODE_PATHS`).

## Suite runtime

| Run | Tests | Duration |
| --- | --- | --- |
| `node --test tests/bench-gate-evaluate.test.mjs`, Node 24.14.1 | 58/58 | about 10.4 s |
| The same on official Node 20.20.2 and through `npx --offline -y node@20` | 58/58 | about 12 s |
| `node --test tests/bench-gate-cli.test.mjs`, Node 24 / Node 20 / npx node@20 | 14/14 | about 1.2 s |
| The whole bench `node --test` command (now ending in `tests/bench-gate-cli.test.mjs`) | 530/530 | about 10.4 s |
| `node tests/delegation-phase-contract.test.js` | 1252 passed, 0 failed | — |
| Plain-script suites that parse `package.json` `test` (11 files) | all exit 0 | — |

Local smoke, not registered and with no output committed:
- `--help` exits 0 for both CLIs.
- One `evaluate-gate.mjs` run against synthetic campaigns in a gitignored scratch directory used the real `git log` on the committed gate. It read author date `2026-10-18T21:11:41-05:00`, ran the gate's 10,000 iterations in about 2.5 s and exited 0.

## Decisions Made

- **Safety fail detection.** The D-17 safety branch checks the path's safety criterion (`criteria.safety.status === 'fail'` on a `fail` verdict), not reason strings. If either Jev path qualifies, both get `disable_jev_operator_switch`.
- **The decision records the measured sha.** `measuredSha` is the autopilot campaign's `git.sha`. The evaluator already refuses a claude campaign at a different sha.
- **The gate path in the decision** is repo-relative with forward slashes. A gate file outside the repository refuses `gate_outside_repo`.
- **Report naming.** The report goes to `<out without .json>.report.md` (Pitfall 13). `--out` refuses any path inside a baseline, candidate or fallback campaign directory, resolved through realpath.
- **Bootstrap iterations.** `deps.iterations` is the only way to change them, and only tests set it. The value used is recorded in `decision.evaluator.iterations`, so a test-only decision is recognisable.

## Deviations from Plan

### Auto-added (Rule 2: missing critical functionality)

**1. `scripts/bench/gate/lib/sidecar.mjs`, a file not in `files_modified`.**
- **Issue:** without a shared module, the safety.jsonl producer (baseline-safety) and its consumer (evaluate-gate) would each hand-mirror the exact-key line validator. That is the producer/validator parity hazard.
- **Fix:** one pure module (`sidecarLine`, `validateSidecarLine`, `serializeSidecar`, `parseSidecar`) that both CLIs import.
- **Commit:** `df1f813e`.

**2. The `verify_suite_not_finished` refusal.**
- **Issue:** the evaluator counts any `exitCode !== 0` as `tighten_only_suite_failed`. A safety fail maps to `disable_jev_operator_switch` for every install. A suite killed by the 900 s bound, a signal or a spawn error would therefore disable Jev because of an environment problem.
- **Fix:** a suite without an integer exit status refuses (exit 2) and writes nothing. A real non-zero exit is still recorded and still fails safety.
- **Commit:** `df1f813e`.

**3. Further refusal and input codes beyond the plan's list.**
- **evaluate-gate:** `git_failed`, `git_output_invalid`, `gate_outside_repo`, `measured_sha_invalid`, `campaign_duplicate`, `campaign_unreadable`, `sidecar_unreadable`, `decision_invalid`, `write_failed`.
- **baseline-safety:** `raw_unreadable`, which replaces silently writing an all-null sidecar, and `tasks_invalid`.
- Unknown flags and stray arguments are reported by code and never echoed.
- **Commit:** `df1f813e`.

**4. Consistency rules in `validateDecision`.**
- **Issue:** a decision whose `v6Action` contradicts its verdict, for example a Jev pass that is withheld, would pass an exact-key check.
- **Fix:** the validator now also requires:
  - `v6Action` equal to the D-17 mapping (`inconsistent:paths.<p>.v6Action`);
  - `recommendation` equal to that action's text;
  - fallback status `used` if and only if `source` is `'fallback'`;
  - an empty `not_supplied` fallback;
  - no suite results when `suites.ran` is false.
- **Commit:** `6f6117f7`.

### Other adjustments

**5. `--tasks-root` fixtures.** `corpusLock` needs the fixture files, so `--tasks-root <dir>` reads fixtures from its sibling `fixtures` directory, which is the repo layout `scripts/bench/{tasks,fixtures}`. The plan named only `--tasks-root`.

**6. Cost claim source.** The claim quotes only the provider-reported Jev cost, so a sentence never mixes the provider and estimate sources. The estimate appears on the report's Jev cost line.

**7. The test fixture for missing blocks.** `synthetic.mjs` has only a `fastMode.missingRate`, not a count. The agreement test injects missing blocks exactly by setting `fastMode: null` on four committed `blocked` rows, which still validate. False done and ambiguous on pass use the generator's count cells. The test asserts exactly 3 false done (one with a non-success status), 2 false ambiguous and 4 runs with no block.

## TDD Gate Compliance

- **Task 1:**
  - **RED:** the extended `tests/bench-gate-evaluate.test.mjs` failed at import with `decision.mjs` and `gate-report.mjs` moved aside. They were then restored.
  - **GREEN:** 55/58 on the first run. The three failures were test-side bugs: twice the test passed `groupRows` campaign objects instead of row arrays, and the LLM-line check matched the cost claim bullet. After those fixes the suite reached 58/58 with no implementation change.
- **Task 2:**
  - **RED:** `tests/bench-gate-cli.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before either CLI existed.
  - **GREEN:** 14/14 on the first run.
- **No separate `test(71-07)` commits.** The plan gives one `feat` subject per task, and Task 2 registers its suite on the bench chain in the same commit, so a RED commit would leave the registered chain red. 71-03 to 71-06 followed the same precedent.

## Known Stubs

None. The only rendered placeholder is `unavailable` for a null claim token or report figure, for example a Jev cost when no provider figure exists. That value is intentional, never zero.

## Threat Model Coverage

| Threat | How it is mitigated |
| --- | --- |
| **T-71-01** | The author-date check against every campaign's `createdAt` (V1 and the fallback included), strictly before; `gate_not_committed`; no override flag (the grep prints 0); both dates recorded in the decision |
| **T-71-03** | `--verify-suites` refuses `working_tree_not_measured` before any suite runs; results and decisions are excluded from the diff |
| **T-71-04** | Exact-key validators for the decision and the sidecar; walkStrings with the 400-character claim exception; URL neutralisation in the report; the sidecar holds only runId and two counts (the sentinel test checks bodies, URLs, tokens, `/api/` paths and the host); CLI output prints codes and field names only |
| **T-71-07** | A Jev safety fail maps to `disable_jev_operator_switch` for both Jev paths, recorded before V6; the validator rejects any other action for that verdict |
| **T-71-08** | Typed token sources, a negative test of the checker (a `jevMs` source and a `jevMsPerCall` token both fail), re-rendering of the text, a scan of the rendered text, and per-decision timing only after the Diagnostics heading |

No surface outside the threat register was added. There are no new network endpoints. The CLIs read local campaign and raw files and run `git` and the gate-listed `node tests/...` suites only.

## Deferred to Validation Block

Nothing was waited on. The rows below restate the Validation Block items this plan's tools serve.

### V1: M-71-00 step 0 (owner sign-off on the frozen gate)

- **When:** after the 66-10 smoke and before the V1 campaign.
- **Command, on Jev:** `node scripts/bench/gate/baseline-safety.mjs --raw <pin-worktree>/scripts/bench/.local/smoke-<YYYYMMDD>/runs --campaign <pin-worktree>/scripts/bench/.local/smoke-<YYYYMMDD>`
- **Then:**
  1. Read the printed `rates <arm>:` lines. Per arm, p is about anyEvent / counted.
  2. Read `power.safetyTable` at the nearest p.
  3. Record the item-1 decision on D-15 and `safety.unknownExposure: 'acted'`: accept them, or amend through a new `gateVersion` before V1.

### V1: M-71-02b (the baseline safety sidecar)

- **When:** right after the M-71-02 cherry-pick and before the release-candidate SHA is chosen.
- **Command:** `node scripts/bench/gate/baseline-safety.mjs --raw <pin-worktree>/scripts/bench/.local/core-baseline-66/runs --campaign scripts/bench/results/core-baseline-66`
- **Commit:** only `scripts/bench/results/core-baseline-66/safety.jsonl`, with no AI attribution.
- **On failure:** exit 2 `corpus_mismatch` means the pin corpus differs and must be investigated. Without the sidecar, the non-Jev verdict is `inconclusive` (`baseline_safety_unverifiable`) and MCP 0.12.0 is withheld.

### V4: M-71-08 (evaluate and commit the decision)

1. Run `node scripts/bench/report.mjs` on both V4 campaign directories.
2. Run the evaluator:

   ```
   node scripts/bench/gate/evaluate-gate.mjs --gate scripts/bench/gate/release-gate-v1.0.0.json --baseline scripts/bench/results/core-baseline-66 --campaign scripts/bench/results/core-gate-71-autopilot --campaign scripts/bench/results/core-gate-71-claude --verify-suites --out scripts/bench/gate/decisions/core-gate-71.json
   ```

   The report goes to `scripts/bench/gate/decisions/core-gate-71.report.md`.
3. Commit only the results directories and the two decision files.
4. Copy into the V4 notes, for the owner:
   - the "Typed outcome agreement" headline numbers, which close M-70-04's table;
   - the "MCP caller effect" rows, which are 69-VALIDATION's caller-effect and turn-reduction outputs;
   - the "Fast-mode exercise" counts by `jev.source` and the `jev_measurement_missing` count, for confirmation of the 2026-10-16 exposure decision.

### V4: M-71-08b (conditional fallback)

It runs only if the non-Jev verdict is `inconclusive` for a `fallback.triggers` reason and the owner decides to run it.
1. Run the `core-rebaseline-71-pin` and `core-rebaseline-71-candidate` blocks.
2. Derive the pin sidecar: `node scripts/bench/gate/baseline-safety.mjs --raw <pin-worktree>/scripts/bench/.local/core-rebaseline-71-pin/runs --campaign scripts/bench/results/core-rebaseline-71-pin`
3. Re-run the M-71-08 step-2 command with `--fallback-pin scripts/bench/results/core-rebaseline-71-pin --fallback-candidate scripts/bench/results/core-rebaseline-71-candidate`.
4. The decision records `paths['mcp-non-jev'].source` and the fallback status. The CLI prints `mcp-non-jev: <verdict> (from core-rebaseline-71; primary was <verdict>)`.

### V6: M-71-10 (step A, the extension)

1. The owner approves `decisions/core-gate-71.json`.
2. If a Jev path's `v6Action` is `disable_jev_operator_switch`, run `fly secrets set JEV_ENABLED=false` before the extension publishes and confirm the gateway answers `disabled`.
3. The `CHANGELOG.md` v1.0.0 entry quotes only the decision's "Release claims" sentences.
4. Then follow 71-VALIDATION M-71-10: commit, `check-release-diff --step A`, catch up with `origin/main`, and merge through the pull request.

### V6: M-71-11 (step B, MCP)

- **When it runs:** only when `paths['mcp-non-jev'].v6Action` is `publish_mcp_0_12_0`.
- **When it is skipped:** on `withhold_mcp_0_12_0`, npm stays at 0.11.2.

## Self-Check: PASSED

- FOUND: scripts/bench/gate/lib/decision.mjs (`JEV_ENABLED=false` count 2)
- FOUND: scripts/bench/gate/lib/gate-report.mjs (the Diagnostics heading string count 1)
- FOUND: scripts/bench/gate/lib/sidecar.mjs
- FOUND: scripts/bench/gate/evaluate-gate.mjs (`gate_not_predeclared` present; override-string grep 0)
- FOUND: scripts/bench/gate/baseline-safety.mjs (`computeSafety` present)
- FOUND: tests/bench-gate-cli.test.mjs (child_process/spawnSync/execSync grep 0)
- FOUND: commit 6f6117f7 (Task 1)
- FOUND: commit df1f813e (Task 2)
- The purity grep prints 0 for decision.mjs and gate-report.mjs
- `ls scripts/bench/gate/decisions | wc -l` prints 0
- The bench `node --test` string appears once in package.json and once in REFINEMENT_ROOT_TEST_COMMANDS, and ends with `tests/bench-gate-cli.test.mjs`
