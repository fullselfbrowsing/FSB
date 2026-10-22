---
phase: 71-comparative-gate-and-release
plan: 12
subsystem: testing
tags: [phase-gate, full-chain, node20, regression-sweep, footprint-audit, validation-block, eval-01, eval-02, rel-01, rel-02]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-01)
    provides: $P71_START and 71-SWEEP-BASELINE.json (23/23, no failures)
  - phase: 71-comparative-gate-and-release (71-05)
    provides: the frozen gate (GATE_SHA256 9d97fb90…f8eb8e, R = 30) and its power and safety tables
  - phase: 71-comparative-gate-and-release (71-02 to 71-11)
    provides: the 12 new suites and commands, the docs and copy edits, and the deviations that 71-VALIDATION.md carries
provides:
  - "71-VALIDATION.md signed off: status complete, nyquist_compliant true, wave_0_complete true, all 28 per-task rows green on real command results"
  - "A 'Phase gate results (71-12)' table in 71-VALIDATION.md with every gate command and its output"
  - "The Validation Block hand-off: 19 Manual-Only rows (V1-V6), with R = 30, GATE_SHA256, the spend line and the R = 30 power.safetyTable rows filled in"
affects: [Validation Block V1, V2, V3, V4, V5, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase gate: record the 7225/7226 listeners first, run validate:extension && npm test, restore the crawler files, then Node 20, the registration audit, the sweep and the footprint audit, and write each result into the VALIDATION status column"

key-files:
  created:
    - .planning/phases/71-comparative-gate-and-release/71-12-SUMMARY.md
  modified:
    - .planning/phases/71-comparative-gate-and-release/71-VALIDATION.md

key-decisions:
  - "The full chain was green on the first run (7226 free, 7225 held only by the user's npx hub), so the tolerant per-command runner was not needed and no environmental failure was recorded"
  - "The `<N = …minRounds>` placeholders keep their placeholder form and gate key paths and now state the frozen R: `<N = 30, the frozen campaigns.<x>.minRounds>`"
  - "The R = 30 power.safetyTable rows are copied into M-71-00 item 1 inline (30 entries, checked against the gate file by script), not as a separate table, so the row stays self-contained"
  - "Recorded drift folded into the hand-off: 71-10 Deviation 3 (README.md:280) into M-71-11b step 2, 71-11's digit-only procedure into M-71-11b step 3, 71-11 Deviation 1 (llms-full tool list names 66 of 73) as an optional M-71-10 docs review, and 71-06's sentinel-to-fallback eligibility reading as an owner confirmation in M-71-08 step 4"
  - "The M-71-00 sign-off item stays unticked: it is a V1 owner decision by design"

patterns-established:
  - "VALIDATION sign-off cites the evidence on each ticked item and leaves owner-only items open with their V-block"

requirements-completed: [EVAL-01, EVAL-02, REL-01, REL-02]

# Metrics
duration: 14min
completed: 2026-10-19
---

# Phase 71 Plan 12: Phase Gate and Validation Block Hand-off Summary

**Phase 71 is green end to end at `29093c4b`: `npm run validate:extension && npm test` exited 0 on the first run, all 12 new suites pass on Node 20, the regression sweep shows no new failure, and the footprint audit proves that no product runtime, MCP source or build, dependency or version changed and that nothing was pushed. 71-VALIDATION.md is signed off (`nyquist_compliant: true`), and its 19 Manual-Only rows now carry the frozen R = 30, GATE_SHA256 and the spend line for the Validation Block.**

## Performance

- **Duration:** about 14 min
- **Started:** 2026-10-19T03:50Z
- **Completed:** 2026-10-19T04:05Z
- **Tasks:** 2/2
- **Files:** 1 modified (71-VALIDATION.md), plus this SUMMARY

## Task Commits

1. **Task 1: Full chain, Node 20, regression sweep and footprint audit.** `83061e42c`, `docs(71-12): record the Phase 71 full-chain, Node 20, sweep and footprint results` (statuses and the "Phase gate results (71-12)" table).
2. **Task 2: Finalize 71-VALIDATION.md and the Validation Block hand-off.** `8be432154`, `docs(71-12): record the Phase 71 gate results and the Validation Block hand-off`.

## Step 0: port listeners before the chain

`lsof -nP -iTCP:7225 -iTCP:7226 -sTCP:LISTEN` at 2026-10-19T03:54:46Z:

```
COMMAND  PID     USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    7109 lakshman   12u  IPv4 0x601b39580dda8707      0t0  TCP 127.0.0.1:7225 (LISTEN)
```

`ps -o pid,command -p 7109`: `7109 node /Users/lakshman/.npm/_npx/d92c25bff7522293/node_modules/.bin/fsb-mcp`. That is the user's own npx hub, which was left running. **Nothing listened on 7226**, so the native-host serve daemon was not running and the port-bound suites could not fail with EADDRINUSE.

## Step 1: the full chain

- **Command:** `npm run validate:extension && npm test`, run in the background with stdin from /dev/null. `$P71_START` = `3493c34ad99efec9df7d340811a58e019c0f55d1` (the `head` of 71-SWEEP-BASELINE.json); the head was `29093c4be`.
- **Result:** `CHAIN_EXIT=0` in about 5.5 minutes (03:54:50Z to 04:00:16Z). It ran validate:extension, the 16 `pretest` commands and all 348 `scripts.test` commands.
- **Log tail:**

  ```
    PASS: 69-06: the named suite tests/mcp-expect-wire.test.js is a registered companion suite
    PASS: 69-06: tests/mcp-expect-wire.test.js exercises extension_unsupported

  === Results: 52 passed, 0 failed ===
  CHAIN_EXIT=0
  ```

  The last command is `node tests/mcp-release-compat.test.js` (index 347). The bench `node --test` command (index 303) reported 568 tests, 568 passed, 0 failed.
- **No failure:** a scan of the log for non-zero fail counts, `not ok` and `✖` found nothing.
- **Tolerant runner:** not needed, because the `&&` chain completed. No suite was edited, and no process was killed.
- **Crawler files:** the run rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` with date-only churn: 77 `<lastmod>` lines plus the two "generated" lines. They were restored with `git checkout --`, and `git status --short showcase/angular/public` then printed nothing.

## Step 2: version and contract

- `npm run version:check`: `version-check: extension 0.9.92; MCP 0.11.2`.
- `node tests/delegation-phase-contract.test.js`: 1254 passed, 0 failed.

## Step 3: Node 20 (`npx --offline -y node@20`, v20.20.2)

| Command | Result |
| --- | --- |
| `--test` over the ten new `.mjs` suites (`bench-f5-token`, `bench-conditions`, `bench-runs-v2`, `bench-gate-synthetic`, `bench-gate-power`, `bench-gate`, `bench-gate-evaluate`, `bench-gate-cli`, `release-diff`, `mcp-count-tool-tokens`) | exit 0; 218 tests, 218 pass, 13.3 s; slowest single test 1.5 s |
| `npm --prefix mcp run build`, then `tests/release-version-rehearsal.test.js && tests/mcp-release-compat.test.js` | exit 0; `release-version-rehearsal: PASS`; 52 passed, 0 failed; `git status --short mcp/build` empty |
| Modified suites: `tests/version-sync.test.js`, `tests/mcp-version-parity.test.js`, `tests/skill-fsb-spec.test.js` | PASS; 217 passed, 0 failed; "All checks passed." |
| Modified suites: `--test tests/bench-report.test.mjs tests/bench-stats.test.mjs` | 102/102 |

## Step 4: registration audit

A one-off `node` script (`/tmp/fsb-71-12/reg-audit.cjs`, not committed) split `scripts.test` on ` && ` and parsed `REFINEMENT_ROOT_TEST_COMMANDS`:

```
scripts.test commands: 348 | REFINEMENT_ROOT_TEST_COMMANDS entries: 75
bench command (index 303) identical string in REFINEMENT_ROOT_TEST_COMMANDS: 1 | in scripts.test: 1
tests/bench-f5-token.test.mjs: chain bench-entry 1, chain elsewhere 0; refine bench-entry 1, refine elsewhere 0
tests/bench-conditions.test.mjs: … 1, 0; 1, 0
tests/bench-runs-v2.test.mjs: … 1, 0; 1, 0
tests/bench-gate-synthetic.test.mjs: … 1, 0; 1, 0
tests/bench-gate-power.test.mjs: … 1, 0; 1, 0
tests/bench-gate.test.mjs: … 1, 0; 1, 0
tests/bench-gate-evaluate.test.mjs: … 1, 0; 1, 0
tests/bench-gate-cli.test.mjs: … 1, 0; 1, 0
tests/release-diff.test.mjs: … 1, 0; 1, 0
tests/mcp-count-tool-tokens.test.mjs: … 1, 0; 1, 0
node tests/release-version-rehearsal.test.js: chain 1, refine 1, chain index 346
node tests/mcp-release-compat.test.js: chain 1, refine 1, chain index 347
duplicate commands in scripts.test: 0 | in REFINEMENT_ROOT_TEST_COMMANDS: 0
```

All 12 new entries appear exactly once in each list. The bench string is identical in both lists. It ends with `… tests/bench-drivers.test.mjs tests/bench-f5-token.test.mjs tests/bench-conditions.test.mjs tests/bench-runs-v2.test.mjs tests/bench-gate-synthetic.test.mjs tests/bench-gate-power.test.mjs tests/bench-gate.test.mjs tests/bench-gate-evaluate.test.mjs tests/bench-gate-cli.test.mjs tests/release-diff.test.mjs tests/mcp-count-tool-tokens.test.mjs`. (The only other `node --test tests/bench-` command, `tests/bench-fast-mode-record.test.mjs` at index 345, is Phase 70's.)

## Step 5: regression sweep

`node scripts/bench/sweep-tests.mjs --files scripts/bench/run-bench.mjs scripts/bench/fixture-server.mjs scripts/bench/lib/mcp-client.mjs scripts/sync-product-version.mjs extension/ui/onboarding.js --baseline .planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json`, run in the background:

```
sweep: 29 referencing tests for 5 file(s); per-test limit 180000 ms; 7225 held=true; …
sweep: 29/29 passed; failing: none
sweep: NEW failures vs baseline: none
SWEEP_EXIT=0
```

The baseline selected 23 tests. The six extra referencing tests are Phase 71's own suites: `bench-conditions`, `bench-f5-token`, `bench-gate-synthetic`, `bench-runs-v2`, `release-diff` and `release-version-rehearsal`. All 29 passed, including the unregistered `tests/onboarding-first-run.test.js`. The tree was clean afterwards.

**Also run for DOCS-b:** `verify:translation-drift` ("2458 EN trans-units × 6 locales …, zero source drift"), `verify:translation-quality` (passed), `lint:i18n` (clean) and the CI extraction diff. The diff extracted 2487 messages into a fresh `/tmp/fsb-71-12/extract`, and `diff -u` against `messages.xlf` printed 0 lines (exit 0).

## Step 6: footprint audit

| Check | Output |
| --- | --- |
| `git diff --name-only $P71_START HEAD \| grep -E '^(mcp/src\|mcp/build\|extension/(ai\|ws\|content)\|showcase/server\|scripts/bench/tasks)/'` | nothing (grep exit 1) |
| The ALL-c per-commit form over `git log --grep='(71-' $P71_START..HEAD` (38 commits, all `(71-`) | nothing (grep exit 1) |
| `git diff --name-only $P71_START HEAD -- extension` | `extension/ui/onboarding.js` |
| `dependencies`/`devDependencies` deep-equal at `$P71_START` vs HEAD (`node -e` over `git show`) | true for `package.json` (6/5 entries), `mcp/package.json` (6/4), `showcase/angular/package.json` (15/17), `showcase/server/package.json` (6/0). Versions 0.9.92, 0.11.2, 0.9.92, 0.9.92, all unchanged. The only package-file diff is the root `test` line |
| `ls scripts/bench/gate/decisions 2>/dev/null \| wc -l` | 0 |
| `git ls-files scripts/bench/results \| wc -l` | 0 (0 at `$P71_START`) |
| `git diff --quiet $P71_START HEAD -- CHANGELOG.md mcp/CHANGELOG.md` | exit 0 |
| `node --test tests/bench-gate.test.mjs` | 20/20 (the gate hash pin holds) |
| Nothing pushed | No `git push` ran in Phase 71 or in this plan. `git branch -vv` shows `Jev … [origin/Jev: ahead 295]` before the 71-12 commits, and `git merge-base --is-ancestor HEAD origin/main` is false |

Outside `.planning/` and `tests/`, the phase changed: `README.md`, `mcp/README.md`, `package.json` (test chain), `extension/ui/onboarding.js`, `skills/fsb/references/tool-decision-tree.md`, `scripts/bench/**` (runner, rows, stats, report, fixture-server token, mcp-client, gate/), `scripts/lib/mcp-extension-compat.mjs`, `scripts/mcp/count-tool-tokens.mjs`, `scripts/release/**`, `scripts/sync-product-version.mjs`, the showcase components, locales and allowlist, and the llms sources and outputs. In all: 81 files, 24,290 insertions and 264 deletions.

**Task 1 verify** (`npm run version:check && node tests/delegation-phase-contract.test.js && node --test tests/bench-gate.test.mjs && test -z "$(git status --short showcase/angular/public mcp/build)" && test -z "$(… forbidden-path grep …)"`): exit 0.

## The frozen gate (for the Validation Block)

- **GATE_SHA256:** `9d97fb900321925c6ec4a2d93dec4839b11fbdb235499fc1e996ff267bf8eb8e`.
  - It is the hash of `scripts/bench/gate/release-gate-v1.0.0.json`, `gateVersion` 1.0.0.
  - Committed in `b7bba953` with author date 2026-10-18T21:11:41-05:00, before any V1 or V4 campaign.
  - `shasum -a 256` reproduces it.
- **Frozen rounds:** R = 30 for `campaigns.baseline`, `campaigns.autopilot` and `campaigns.claude`, and for `fallback.campaigns.pin` and `fallback.campaigns.candidate`; `fallback.blockRounds` is 5.
  - `power.recommendedRounds` is 30, and `met` is true at floor completion 0.80: jev-ni 0.92125, claude-ni 0.92325, sentinel-equivalence 0.8465, sentinel-speed 1.
- **Spend line** (`power.spend` and the notes): "spend at 30 rounds per arm: V1 720 core runs, V4 autopilot 720 runs, V4 Claude 360 runs (defaults 240, 480, 120); 1800 paid runs instead of 840".
  - The conditional M-71-08b fallback adds 2 × 12 × 30 = 720 Claude runs.
- **corpusLockSha256:** `65faa8c2e482938653ec0e76f3fef07002c409d172c6c4e8c2a49e8308c079d6`.

## What Task 2 changed in 71-VALIDATION.md

- **Frontmatter:** `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`.
- **Per-Task Verification Map:**
  - all 28 rows are `✅ green` (Task 1);
  - File Exists is `✅` for every created suite (18 cells that read `❌ W0` or `❌ W0 / ✅ extend`);
  - the ALL-c command now names `3493c34a…` instead of `<phase-71-start>`.
  - Task IDs, Plans and Waves were checked against the executed plans and their SUMMARYs, and no drift was found.
- **Header:** an "Execution status (71-12)" line.
- **Wave 0 Requirements:** all 13 items ticked. Every file exists and is tracked.
- **Manual-Only:**
  - **New paragraph:** "The frozen gate (71-05)", with GATE_SHA256, the commit and author date, R = 30 per key path, the power numbers and corpusLockSha256.
  - **Spend line:** rewritten with the frozen numbers (1,800 paid runs instead of 840, plus 720 for the fallback) and the A1 floor note.
  - **M-71-00 item 1:** the 30 `power.safetyTable` rows at R = 30, checked against the gate file by script (30 of 30 matched).
  - **`<N = …>` placeholders** (M-71-01b, M-71-06, M-71-07, M-71-08b ×2) now read `<N = 30, the frozen <key path>>`.
  - **Other round counts:** M-71-01b says 30 rounds and 720 rows; M-71-03 says `schedule.rounds` = 30; M-71-08b says `fallback.blockRounds` (5); the 66-10 and 66-11 reconciliation rows say 720 runs and 720 rows.
  - **M-71-05:** GATE_SHA256 and the `shasum` check.
  - **M-71-08 step 4:** the owner confirms 71-06's sentinel-to-fallback eligibility reading.
  - **M-71-10:** the optional llms-full tool-list review (71-11 Deviation 1).
  - **M-71-11b step 2:** README.md:280 (71-10 Deviation 3).
  - **M-71-11b step 3:** 71-11's digit-only locale procedure.
  - **Unchanged:** every row (M-71-00 to M-71-11b, M-71-V2, M-71-V5), the "Resuming a campaign" note and the "Upstream V1/V4/V6 rows reconciled" section with its 66-10 and 66-11 rows.
- **Sign-Off:** every true item is ticked, each with its evidence. The M-71-00 item stays open, marked "deferred to the Validation Block (V1)". Approval reads "automated checks complete; live items deferred to the Validation Block (V1-V6)".

**Task 2 verify** (`grep -c "nyquist_compliant: true"` → 2, at least 19 `| M-71-` rows (19), no `| ⬜ pending |` row, the reconciliation heading present, `Superseded by 71 (2026-10-16)` in 66-11-PLAN.md): exit 0. `git diff --name-only HEAD~1 HEAD` after the commit lists only `.planning/phases/71-comparative-gate-and-release/71-VALIDATION.md`.

## Deferred to Validation Block

71-VALIDATION.md "Manual-Only Verifications" is authoritative. Each row names its block and an exact command (or "None").

- **V1:**
  - **M-71-00:** owner sign-off on the frozen gate. It comes after the 66-10 smoke and before the V1 campaign, and blocks M-71-01b.
    - Item 1: D-15 and the `unknownExposure: 'acted'` reading, against the smoke's per-type rates and the R = 30 `power.safetyTable` rows.
    - Item 2: the D-27 onboarding deviation.
    - Item 3: the M-70-08 remedy timing.
    - Item 4: the D-09 item-3 substitution, for the record.
    - Item 5: the D-24 `showcase/server/**` narrowing.
  - **M-71-01:** pin Claude Code.
  - **M-71-01b:** the V1 campaign at `--rounds 30`, 720 runs.
  - **M-71-01c:** pin Chrome for Testing.
  - **M-71-02:** cherry-pick the baseline results.
  - **M-71-02b:** the baseline safety sidecar.
  - **M-71-03:** the identity cross-check, `schedule.rounds` = 30.
- **V2:** none of Phase 71's own (M-71-V2). V4 needs the V2 gateway live with `JEV_ENABLED` on.
- **V3:** M-71-04, the calibrated-profile smoke: fast steps act, with 0 `sensitive_goal`.
- **V4:**
  - **M-71-05:** preconditions, including GATE_SHA256 `9d97fb90…f8eb8e`.
  - **M-71-06:** the autopilot gate campaign, `--rounds 30 --seed 71`, 720 runs.
  - **M-71-07:** the Claude gate campaign, `--rounds 30 --seed 66`, 360 runs.
  - **M-71-08:** evaluate and commit the decision. This includes the owner's confirmation of the exposure decision and of the sentinel-to-fallback eligibility reading.
  - **M-71-08b:** the conditional `core-rebaseline-71` fallback, 720 more runs.
  - **M-71-09:** exact `count_tokens`.
- **V5:** none of Phase 71's own (M-71-V5). 69's live version-skew row stands.
- **V6:**
  - **M-71-10:** step A, extension 1.0.0, including the optional llms-full tool-list review.
  - **M-71-11:** step B, MCP 0.12.0.
  - **M-71-11b:** the 72-count fallback if 0.12.0 is withheld, now including README.md:280.
  - **CI at V6:** the full chain on CI's Node 20, which `npx node@20` cannot run locally because it lacks npm.
- **Upstream rows:** the 66 V1 rows (66-10, 66-11) and the 69 and 70 V4/V6 rows are reconciled in "Upstream V1/V4/V6 rows reconciled".

## Deviations from Plan

**1. [Not needed] The tolerant runner.** Step 0 found 7226 free, and the `&&` chain exited 0, so the plan's tolerant-runner fallback and its environmental-failure handling never ran. Nothing was recorded as environmental.

**2. [Placement] Task 1 results in their own commit.** Task 1's step 7 writes statuses into 71-VALIDATION.md, and the plan names no commit for Task 1. The statuses and a new "Phase gate results (71-12)" table landed in `83061e42c`, before Task 2's commit with the plan's exact subject (`8be432154`). Both commits touch only 71-VALIDATION.md.

**3. [Drift folded in, per Task 2 step 1] SUMMARY notes moved into the hand-off rows.**
- 71-10 Deviation 3 asked 71-12 to add README.md:280 to M-71-11b step 2.
- 71-11 recorded the M-71-11b locale procedure and the llms-full list gap.
- 71-06 recorded an owner confirmation for M-71-08.
- 71-05 asked 71-12 to restate N = 30.

All of these are now in the rows. No row was removed.

**4. [Environment] Commits on `Jev` in a Conductor worktree.** The GSD worktree guard expects a `worktree-agent-*` branch. The milestone rules direct every plan to commit on `Jev` in this single tree, as 71-01 to 71-11 did. `Jev` is not a protected ref, and nothing was pushed.

Otherwise the plan executed as written.

## Known Stubs

None. The only file changed is 71-VALIDATION.md, and its statuses come from the runs above.

## Self-Check: PASSED

- FOUND: .planning/phases/71-comparative-gate-and-release/71-VALIDATION.md (status complete, nyquist_compliant true, 0 pending rows, 19 Manual-Only rows)
- FOUND: .planning/phases/71-comparative-gate-and-release/71-12-SUMMARY.md
- FOUND commits: 83061e42c, 8be432154
- `git status --short` was clean after the Task 2 commit; the crawler files and mcp/build are unchanged.
