---
status: deferred
phase: 71-comparative-gate-and-release
source: [71-VERIFICATION.md]
started: 2026-10-19T05:06:28Z
updated: 2026-10-19T05:06:28Z
deferred_to: milestone-end Validation Block (V1, V3, V4, V6)
verified_head: 9c8e5d5b
baseline_pin: 8a058bdf
---

## Current Test

[deferred: every item runs in the v1.0.0 milestone-end Validation Block; see .planning/STATE.md -> Decisions]

These items come from the `human_verification` list in `71-VERIFICATION.md` (status `human_needed`, 4/4 roadmap criteria and 69/69 plan must-haves verified for the automated portion, 0 gaps) and from the 19 V-tagged Manual-Only rows in `71-VALIDATION.md`. Automated evidence does not count as a result here: the full chain at the 71-12 gate (`29093c4b`, 348 `scripts.test` commands, exit 0), the re-run at `9c8e5d5b` after the 12 review-fix commits (`CHAIN_EXIT=0`, bench `node --test` 573/573, `mcp-release-compat` 52/0), the Node 20.20.2 runs of every new suite, the 29/29 regression sweep against `71-SWEEP-BASELINE.json`, and the verifier's synthetic end-to-end spot-check of the gate. Only a human run in the Validation Block may change a `result` field.

M-71-V2 (V2) and M-71-V5 (V5) are explicit "none" rows. V4 needs the V2 gateway live with `JEV_ENABLED` on (M-67-03, M-67-04), and the live version-skew row stays with 69-VALIDATION at V5. Both are recorded in `71-VALIDATION.md` so the collectors find them, and neither has a test below.

The frozen gate is `scripts/bench/gate/release-gate-v1.0.0.json` (committed in `b7bba953`; GATE_SHA256 `9d97fb900321925c6ec4a2d93dec4839b11fbdb235499fc1e996ff267bf8eb8e`, pinned in `tests/bench-gate.test.mjs`). It freezes R = 30 rounds for every campaign: 1,800 paid runs (V1 720, V4 autopilot 720, V4 Claude 360), plus 720 more if the owner runs the M-71-08b fallback.

## Tests

### 1. [V1] M-71-00: owner sign-off on the frozen gate (hard pre-V1 gate)
validation_block: V1
expected: Scheduled after the 66-10 V1 smoke and before the 66-11 H4 campaign approval; it blocks M-71-01b. Step 0: run `node scripts/bench/gate/baseline-safety.mjs` on the smoke's raw records to print the real per-type safety event rates, then read `power.safetyTable` in the gate at the nearest p rows. Item 1 (decide before any V1 campaign): accept D-15 and the `safety.unknownExposure: 'acted'` reading as frozen, or amend them with a re-plan, a new `gateVersion` and a new sha256 pin before V1 starts. With no true difference at R = 30 and acted share 0.8, the frozen Jev safety criterion fails 83% of the time at p = 0.5% per run and 97% at p = 1%, and the non-Jev "any excess" rule fails 39-49%. A Jev safety fail maps to `disable_jev_operator_switch` for every install, so as frozen the gate would almost surely disable Jev whatever its true safety. Items 2-5 are acknowledged or rejected: (2) the D-27 deviation, count-free onboarding copy in `extension/ui/onboarding.js`; (3) M-70-08 remedy timing: remedy (a) is incompatible with the V4 design and must be decided now, (c) must land before the release-candidate SHA, and (d) can wait for V6; (4) the D-09 item-3 substitution, under which a typed `done` on a checker-failed run counts as claimedSuccessOnFail; (5) the D-24 narrowing of `showcase/server/**` in the release-diff checker. Record every decision, with the date, in the V1 notes.
result: [pending]

### 2. [V1] Owner decisions on the review follow-ups (fold into M-71-00)
validation_block: V1
expected: These postdate 71-VALIDATION.md and are not yet written into its M-71-00 row, so record them with M-71-00. WR-05 (skipped in 71-REVIEW-FIX.md): `check-release-diff` classes `showcase/**` and `skills/**` code as docs, including the showcase/angular manifests and `skills/fsb/scripts/install-host.mjs`. Decide whether build manifests and `skills/**/scripts` code should be forbidden. Narrowing further than D-24 breaks the M-71-11b procedure and the D-28 release-notes edit. WR-03 (partial fix): the predeclaration check now date-checks every commit that touched the gate, but author dates survive amend and rebase. Agree to record the gate sha256 beside the V1 identity at M-71-01b as an amend-proof anchor. Also confirm the rules the WR-01 (cost claims need full coverage, Jev cost is labelled an estimate, cost is quoted only on a Jev pass), WR-02 (an incomplete or paused campaign is `campaign_incomplete`, so inconclusive) and WR-06 (decision claims must match the verdicts and criteria numbers) fixes introduced.
result: [pending]

### 3. [V1] M-71-01: pin one Claude Code release for V1 and V4
validation_block: V1
expected: Download a Claude Code release `<X.Y.Z>` and its manifest. Verify the manifest signature against the published key (fingerprint `31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE`) and check the binary's sha256 against the manifest. Install it at `~/.fsb-bench/claude/<X.Y.Z>/claude` without touching the auto-updating `~/.local/bin/claude`, and put it first on PATH for every V1 and V4 campaign.
result: [pending]

### 4. [V1] M-71-01c: pin one Chrome major for V1 and V4 (reused at V4)
validation_block: V1
expected: Install Chrome for Testing `<V>` under `~/.fsb-bench/chrome/<V>/`. Use it in place of `/Applications/Google Chrome.app` in the 66-10 setup and campaign launches, with the same flags and `~/.fsb-bench/chrome-profile`. Record `"<chrome>" --version`. The same binary serves every V1 and V4 campaign; D-06 compares the Chrome major, and a mismatch makes the non-Jev and sentinel verdicts `inconclusive`.
result: [pending]

### 5. [V1] M-71-01b: run core-baseline-66 at the pin with the frozen round count
validation_block: V1
expected: Run only after M-71-00 is recorded. In the pin worktree (`8a058bdf`), with the M-71-01 PATH and the M-71-01c Chrome: `caffeinate -i node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms autopilot,claude --claude-model <m> --rounds 30 --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-baseline-66`. That is 24 × 30 = 720 runs, which supersedes the 10 rounds and 240 runs in 66-11-PLAN.md. The pin runner has no gate preflight, so check `--rounds 30` by hand. After exit 75, resume with the exact command the runner prints, never a bare `--resume`. Record the gate sha256 beside the identity (WR-03 anchor, test 2).
result: [pending]

### 6. [V1] M-71-02: bring the baseline results onto Jev
validation_block: V1
expected: Before the release-candidate SHA is chosen, cherry-pick the pin worktree's results commit (only `scripts/bench/results/*-baseline-66/**`) onto Jev. `node scripts/bench/report.mjs scripts/bench/results/core-baseline-66` exits 0 under the v2 validator. Then restore the rewritten `report.md` and `summary.json` so `git status --short` is empty, because a dirty tree sets `git.dirty` in the V4 identity.
result: [pending]

### 7. [V1] M-71-02b: derive the baseline safety sidecar
validation_block: V1
expected: On Jev, right after M-71-02: `node scripts/bench/gate/baseline-safety.mjs --raw <pin-worktree>/scripts/bench/.local/core-baseline-66/runs --campaign scripts/bench/results/core-baseline-66` writes `safety.jsonl`. Commit only that file, with no AI attribution. Exit 2 `corpus_mismatch` must be investigated. Without the sidecar the non-Jev verdict is `inconclusive` (`baseline_safety_unverifiable`) and MCP 0.12.0 is withheld.
result: [pending]

### 8. [V1] M-71-03: identity cross-check
validation_block: V1
expected: In `scripts/bench/results/core-baseline-66/identity.json`: `hosts.claude.version` equals M-71-01's `<X.Y.Z>`, `git.sha` equals `8a058bdf…`, `mcp.toolsList.sha256` equals `8321cc72…8c4a05`, `chrome.browser` shows the M-71-01c major, and `schedule.rounds` is 30. Every `resumes[]` entry has the same Claude version and Chrome major.
result: [pending]

### 9. [V3] M-71-04: the calibrated profile acts on the fixtures (SC1-c, the live F5 check)
validation_block: V3
expected: After the V3 calibrated profile is committed and deployed: `node scripts/bench/run-bench.mjs --smoke --pair-via-cdp --arms autopilot --conditions on --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile"`. The raw `jevMeasurement` records show `calibrationStatus: 'calibrated'`, at least one fast step on at least one fixture, and 0 `sensitive_goal` fallbacks. If no fast step acts anywhere, V4 will be `not_exercised`: stop and review the V3 profile.
result: [pending]

### 10. [V4] M-71-05: V4 preconditions
validation_block: V4
expected: Jev is at the release-candidate SHA, with every phase complete and M-71-02 cherry-picked. `npm run validate:extension && npm test` is green there, the crawler files are restored and `git status --short` is empty. `node --test tests/bench-gate.test.mjs` is green and `shasum -a 256 scripts/bench/gate/release-gate-v1.0.0.json` prints the pinned GATE_SHA256 (any other hash: stop). V2 is live with `JEV_ENABLED` on. The candidate build is loaded unpacked in the bench profile, the export-capture step has run, `claude --version` prints the M-71-01 version, the bench Chrome major matches the baseline identity, and `core-baseline-66/safety.jsonl` exists. The 69 `expect` constants are frozen and the M-70-08 remedy is settled. No commit is made from the first campaign start until M-71-08 finishes.
result: [pending]

### 11. [V4] M-71-06: autopilot gate campaign, plus the IN-05 switch check
validation_block: V4
expected: `caffeinate -i node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms autopilot --conditions off,on --rounds 30 --seed 71 --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-gate-71-autopilot` runs 720 runs. The runner refuses `gate_campaign_mismatch` if an argument differs from `campaigns.autopilot`. After exit 75, resume with the printed command. This also covers M-68-05's comparative gate and its `meta_cognitive_loop_break` watch item. IN-05 (skipped in review): the runner never restores `fsbJevFastModeEnabled`, so after this campaign confirm that the bench profile's switch reads `false` before any unconditioned run.
result: [pending]

### 12. [V4] M-71-07: Claude Code gate campaign (non-Jev MCP path)
validation_block: V4
expected: With the M-71-01 PATH: `caffeinate -i node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms claude --conditions off --rounds 30 --seed 66 --claude-model <V1 model> --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-gate-71-claude` runs 360 runs. It covers 69-VALIDATION's V4 rows on the shorter descriptions and `expect`.
result: [pending]

### 13. [V4] M-71-08: evaluate the gate and commit the decision
validation_block: V4
expected: Run `report.mjs` on both gate campaigns. Then run `node scripts/bench/gate/evaluate-gate.mjs --gate scripts/bench/gate/release-gate-v1.0.0.json --baseline scripts/bench/results/core-baseline-66 --campaign scripts/bench/results/core-gate-71-autopilot --campaign scripts/bench/results/core-gate-71-claude --verify-suites --out scripts/bench/gate/decisions/core-gate-71.json`. The decision file validates. Each path is pass, fail, inconclusive or not_exercised with one V6 action, and the report holds the baseline, control and fast columns with intervals, failure cases, diagnostics and release claims. Commit only the results directories and the two decision files, with no AI attribution. The owner reads the verdicts and confirms (a) the sentinel-to-fallback eligibility reading and (b) the 2026-10-16 exposure decision, using the "Fast-mode exercise" counts and the `jev_measurement_missing` count. Copy the headline numbers from "Typed outcome agreement" (the M-70-04 table) and "MCP caller effect" into the V4 notes.
result: [pending]

### 14. [V4] M-71-08b: conditional fallback core-rebaseline-71
validation_block: V4
expected: Run only if the non-Jev verdict is `inconclusive` for a `fallback.triggers` reason (`sentinel_trip`, `identity_mismatch:*`, `resume_drift`) and the owner approves the extra 720 Claude runs. Alternate 5-round blocks of `core-rebaseline-71-pin` (pin worktree) and `core-rebaseline-71-candidate` (measured SHA) until both reach 30 rounds. Copy the pin results in and derive their safety sidecar, then re-run M-71-08 step 2 with `--fallback-pin` and `--fallback-candidate`. The decision records `paths['mcp-non-jev'].source` and the fallback status. A primary non-Jev `fail` or `underpowered` result is never re-run through the fallback.
result: [pending]

### 15. [V4] M-71-09: exact tool-list token counts
validation_block: V4
expected: `ANTHROPIC_API_KEY=… node scripts/mcp/count-tool-tokens.mjs --model <V1 Claude model>` prints the baseline and new tool-list token counts and their ratio, labelled as an estimate. Record them beside the 69 budget estimate and say whether the "more than half" target is met.
result: [pending]

### 16. [V6] M-71-10: step A, extension 1.0.0 (MCP stays 0.11.2)
validation_block: V6
expected: 1. The owner approves the decision file. 2. If the Jev path failed safety, run `fly secrets set JEV_ENABLED=false` and confirm the typed `disabled` body. 3. Write the `CHANGELOG.md` v1.0.0 entry, quoting only the "Release claims" sentences, plus the gate-dependent D-28 docs. 4. Run `npm run version:set:extension -- 1.0.0`; it refuses without the entry, as verified offline. 5. Run `version:check`, `validate:extension` and `npm test`, restore the crawler files and commit with no AI attribution. 6. `check-release-diff.mjs --measured <V4 sha> --step A` exits 0. 7. Merge `origin/main` in and re-check until `git log Jev..origin/main` is empty. 8. Merge through a PR only after CI is green, including `showcase (build + crawler smoke)` and `all-green`. 9. Re-check against `origin/main`, submit the Chrome Web Store privacy form and listing (M-68-11), tag `extension-v1.0.0`, and wait until the store shows 1.0.0 live. Expected outcome: `version:check` agrees at 1.0.0 / 0.11.2, and the release diff shows only docs and setter output.
result: [pending]

### 17. [V6] M-71-11: step B, MCP 0.12.0 (only if the non-Jev MCP path passed)
validation_block: V6
expected: Branch from `main`. Write the `mcp/CHANGELOG.md` 0.12.0 entry and the `mcp/README.md` "What's New In v0.12.0" section, moving the single Compatibility bullet into it. Add the MCP-only update line to the root v1.0.0 section. Run `npm run version:set:mcp -- 0.12.0 && npm --prefix mcp run build && npm run version:check && npm test`, then commit the bump, the six force-tracked `mcp/build` files and `mcp/native-host/runtime-integrity.json` with no AI attribution. `check-release-diff.mjs --measured <V4 sha> --step B` exits 0. Merge to `main` once CI is green, then re-check against `origin/main`. `npm view fsb-mcp-server dist-tags.latest` prints `0.12.0`, and CI's Node 20 run shows the 69 Layer-2 suite ran.
result: [pending]

### 18. [V6] M-71-11b: conditional 72-count docs fallback when 0.12.0 is withheld
validation_block: V6
expected: Only if the decision file withholds 0.12.0, and as part of M-71-10 before its step 5. Switch the `mcp/README.md` Tool Count Contract line to the "excludes" marker and set 72 in `README.md`, removing the Settings row and "and settings". In `mcp/README.md`, use `## Tools (72 Total)` with the `#tools-72-total` link and move `settings` to an uncounted "arriving in a later MCP release" note, and mark `settings` and `expect` the same way in the skill decision tree. Set 72 in the showcase copy, all seven xlf catalogs (digit-only, same 11 unit ids, allowlist hashes recomputed, never running `sync-xliff-targets`) and the llms files. No file under `tests/` changes, and `check-release-diff --step A` still passes.
result: [pending]

## Summary

total: 18
passed: 0
issues: 0
pending: 18
skipped: 0
blocked: 0

## Gaps

[none yet; verification found no failed truths and no automated gaps. Hand-off drift to fold into `71-VALIDATION.md` before V1, so its collector finds the follow-ups: the EVAL-02-g row still describes `git log -1` (WR-03 now date-checks every commit that touched the gate), M-71-00 lacks the WR-03 anchor and the WR-05 decision (test 2 above), and M-71-06 lacks the IN-05 switch check (test 11 above). Review items skipped in 71-REVIEW-FIX.md: WR-05 (owner decision, test 2) and IN-05 (operator check, test 11). Fixed in review but still needing owner confirmation: WR-01, WR-02, WR-03 (partial) and WR-06 (test 2). Info, optional docs-class copy at V6: the `### MCP tool surface (73 tools)` list in `showcase/angular/scripts/llms-full.source.md` and `showcase/angular/public/llms-full.txt` names 66 of the 73 tools (71-11 Deviation 1).]
