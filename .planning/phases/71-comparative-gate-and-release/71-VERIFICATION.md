---
phase: 71-comparative-gate-and-release
verified: 2026-10-19T05:10:00Z
status: human_needed
score: "4/4 roadmap success criteria verified at the automated level (live halves deferred to V1-V6); 69/69 plan must-have truths verified"
overrides_applied: 0
re_verification: false
human_verification:
  - test: "M-71-00 (V1, hard pre-V1 gate): owner sign-off on the frozen gate before the V1 campaign starts"
    expected: "The owner either accepts D-15 and safety.unknownExposure 'acted' as frozen, or amends them with a new gateVersion and sha256 pin before V1. Items 2-5 (onboarding count-free deviation, M-70-08 timing, D-09 item-3 substitution, D-24 showcase/server narrowing) are acknowledged or rejected."
    why_human: "Owner decision on locked rules. The frozen power.safetyTable shows that with NO true difference, at R = 30 and acted share 0.8, the Jev safety criterion fails 83% of the time at a 0.5% per-run event rate and 97% at 1%, and the non-Jev 'any excess' rule fails 39-49%. As frozen, the gate would almost surely disable Jev regardless of its true safety. Deciding which fast paths merit release depends on this decision."
  - test: "Review follow-ups for the owner, to be folded into M-71-00 (they postdate 71-VALIDATION.md)"
    expected: "Decisions recorded on: WR-05 (showcase/** and skills/** code, including showcase/angular manifests and skills/fsb/scripts/install-host.mjs, is classed as docs by check-release-diff); WR-03 (the predeclaration check uses author dates, which amend and rebase keep; record the gate sha256 beside the V1 identity at M-71-01b as an anchor); and confirmation of the WR-01 cost-claim, WR-02 campaign-completeness and WR-06 claim-consistency rules."
    why_human: "71-REVIEW-FIX.md marks these as needing an owner or human decision. They conflict with or extend locked D-24 and D-11 policy."
  - test: "M-71-01, M-71-01b, M-71-01c, M-71-02, M-71-02b, M-71-03 (V1): pin Claude Code and Chrome, run core-baseline-66 at 8a058bdf (30 rounds, 720 runs), cherry-pick the results onto Jev, derive the safety sidecar, cross-check identity"
    expected: "scripts/bench/results/core-baseline-66 validates under the v2 validator (report.mjs exits 0); identity.json records the pinned Claude version and git.sha 8a058bdf…; safety.jsonl exists"
    why_human: "Live campaign with real spend on the operator machine"
  - test: "M-71-04 (V3): calibrated-profile smoke with --conditions on"
    expected: "jevMeasurement shows calibrationStatus 'calibrated', at least one fast step on at least one fixture, 0 sensitive_goal fallbacks (SC1-c, the F5 fix in the live product)"
    why_human: "Needs the V3 calibrated profile deployed and a live gateway"
  - test: "M-71-05 to M-71-08b (V4): run core-gate-71-autopilot (720 runs) and core-gate-71-claude (360 runs) with --gate, then evaluate-gate.mjs --verify-suites, then commit the decision file and report. Optionally run the core-rebaseline-71 fallback. Add the IN-05 operator check: after the autopilot campaign, confirm fsbJevFastModeEnabled reads false before any unconditioned run."
    expected: "The decision file validates; each path has pass, fail, inconclusive or not_exercised with a V6 action; the report holds the three columns with intervals, failure cases, diagnostics and release claims"
    why_human: "Live campaigns with real spend; the owner reads the verdicts and confirms the sentinel-to-fallback eligibility reading"
  - test: "M-71-09 (V4): ANTHROPIC_API_KEY=… node scripts/mcp/count-tool-tokens.mjs --model <V1 model>"
    expected: "Baseline and new tool-list token counts with the ratio, labelled as an estimate"
    why_human: "Needs a real Anthropic API key and the network"
  - test: "M-71-10 (V6 step A): author the CHANGELOG v1.0.0 entry from the Release claims, run version:set:extension -- 1.0.0, version:check, validate:extension and npm test, commit, run check-release-diff --step A, merge, submit to the Chrome Web Store"
    expected: "The setter succeeds only with the entry (it refuses without it, as verified); version:check agrees at 1.0.0 / 0.11.2; the release diff shows only docs and setter output; CI is green, including showcase extraction and all-green"
    why_human: "Release, merge to main (deploys Fly, packages the extension, runs npm-publish) and store submission"
  - test: "M-71-11 / M-71-11b (V6 step B): MCP 0.12.0 bump and publish if the non-Jev path passed; otherwise the docs-only 72-count fallback"
    expected: "npm view fsb-mcp-server dist-tags.latest prints 0.12.0; or 0.12.0 is withheld and the docs move to the 'excludes' marker without a test change"
    why_human: "npm publish via merge to main; depends on the V4 outcome"
---

# Phase 71: Comparative Gate and Release Verification Report

**Phase Goal:** Compare full-task outcomes, decide which fast paths merit release, and version the extension and MCP package honestly.
**Verified:** 2026-10-19T05:10:00Z at HEAD `9c8e5d5b8` (after the 12 review-fix commits)
**Status:** human_needed
**Re-verification:** No (initial verification)

Under the milestone deferral policy (STATE.md "v1.0.0-specific decisions"), Phase 71 delivers everything needed to make the release decision and proves it offline. The live comparison runs at V4 and the version bumps and publishes at V6. Each success criterion below is therefore judged on its automated half, and its live half is listed as a Validation Block item.

## Goal Achievement

### Observable Truths: Roadmap Success Criteria (the contract)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| SC1 | The same outcome-checked corpus compares baseline, fast mode and a non-Jev control on completion rate, wall time per completed task and cost, with uncertainty and failure cases | VERIFIED (automated half); live run at V1/V3/V4 | `run-bench.mjs` `createConditionApplier` (:1331-1352) writes the switch through the settings tool, reads it back over CDP and checks the capture arm before t0; on a mismatch the run is recorded as `condition_not_applied` and never counted (:772-800). The v2 rows (`runs.mjs:51` `RUN_ROW_KEYS_V2`) still accept schema-1 rows. `report.mjs` groups by `arm/condition` and never pools off and on (:475-480). `gate-report.mjs` renders baseline, control and fast columns: Wilson CI (:481), wall time per completed task (:482), Newcombe completion difference (:484), and LLM and Jev cost on separate lines (:488-489), plus failure cases (:562). F5: `fixture-server.mjs:419-421` uses 24 lowercase `randomInt` letters, proven against the real `extension/ai/jev-state.js` in `tests/bench-f5-token.test.mjs`. |
| SC2 | A predeclared gate reports pass or fail for speed, success and safety; a failing path stays experimental or disabled; no per-decision timing is presented as whole-task speedup | VERIFIED (automated half); evaluation on real data at V4 | The gate `scripts/bench/gate/release-gate-v1.0.0.json` has sha256 `9d97fb90…f8eb8e` (`shasum` matches the `GATE_SHA256` pin at `tests/bench-gate.test.mjs:441`). It was committed once, in `b7bba953e`; `scripts/bench/results` is empty, so no campaign predates it. The fixed numbers match: margin 0.10, maxEstimate 0.90, α 0.025, 10,000 bootstrap iterations. `evaluate.mjs` implements D-12 to D-16 (:250-534), and `decision.mjs:139-149` maps each verdict to one V6 action. `ALLOWED_CLAIM_SOURCES` admits only wallMs-ratio, completion and cost, and `FORBIDDEN_CLAIM_TEXT` bans jevMs and latencyMs (:56-60). An independent end-to-end spot-check under Node 20 confirmed each branch: a true 0.70x gives pass and `ship_opt_in_default_off`; 1.0x gives fail and `ship_experimental_no_speed_claim`; one acted-run overcount gives `disable_jev_operator_switch` on both Jev paths; a tampered gate hash is refused `gate_hash_mismatch`. All decisions validated, and no claim had forbidden text. |
| SC3 | `CHANGELOG.md` has a v1.0.0 entry before `version:set:extension -- 1.0.0` succeeds, and product version checks agree | VERIFIED (enforcement and rehearsal); the real bump is V6 (M-71-10) | Independent temp-root probe: `FSB_VERSION_SYNC_ROOT=<tmp> node scripts/sync-product-version.mjs extension 1.0.0` exits 1 with "author the 1.0.0 entry at the top of CHANGELOG.md", and the manifest stays at 0.9.92. `tests/release-version-rehearsal.test.js` passes on Node 24 and Node 20 ("step A released, step B released"). `npm run version:check` reports `extension 0.9.92; MCP 0.11.2`. The compat map (`scripts/lib/mcp-extension-compat.mjs`) keeps "MCP 0.11.2 requires extension 0.9.92", so step A does not write the false "0.11.2 needs 1.0.0" claim. |
| SC4 | The MCP package receives its minor bump for optional `expect` and the `settings` tool, with compatibility checks for existing callers and no unreviewed tool additions | VERIFIED (checks built and green); the real bump and publish are V6 (M-71-11) | `tests/fixtures/mcp-release-delta-0.12.0.json` lists: addedTools `[settings]`, removedTools `[]`, `expect` on 29 tools, newRequiredArguments `[]`, addedMessageTypes `[mcp:get-settings, mcp:set-setting]`. `tests/mcp-release-compat.test.js` diffs the built tools/list against the 8a058bdf fixture and names any unreviewed tool, property, required argument or message type (:216-297); it passes 52/0. The built tools/list has 73 tools, including `settings`. The rehearsal step B passes. The `check-release-diff` CLI flagged post-measure code edits as forbidden in an independent run (exit 1, 14 violations against `4dec7f997`). |

**Score:** 4/4 roadmap criteria verified at the automated level. 69/69 plan must-have truths verified (table below).

### Observable Truths: Plan Must-Haves (grouped)

| Plan | Truths | Status | Key evidence |
| --- | --- | --- | --- |
| 71-01 | 5 | VERIFIED | `71-SYNC-RECHECK.md` records S1-S11 as MATCH or CHANGED, with substitutions. `71-SWEEP-BASELINE.json` has a `head` field. The F5 token uses `randomInt`, and its test drives the real `FsbJevState.buildRequest` and includes an old-shape control token. The scrubber is unchanged: no `extension/ai` diff since `$P71_START`. |
| 71-02 | 8 | VERIFIED | `RUN_ROW_KEYS_V2` = v1 keys plus condition, jev, safety, endLabel and fastMode. `projectFastMode` and `FAST_MODE_OUTCOMES` are imported from `fast-mode.mjs` (:36), not copied. `validateCommittedRow` dispatches on schema (:1002-1005). The schedule fixture and the vocabulary-parity tests pass. |
| 71-03 | 5 | VERIFIED | applyCondition runs before the arm (:772-777); the CDP readback decides; the preflight refuses `conditions_unsupported` and `capture_armed` (:1300-1320); `stableIdentity` (:1199) includes the gate; the report never pools off and on. |
| 71-04 | 5 | VERIFIED | `newcombeDifference` is in stats.mjs; `makeCampaign` validates every row; `simulate-power.mjs` exports `simulateSafety`; `71-POWER.json` holds `safetyFalseFail`. |
| 71-05 | 6 | VERIFIED | The gate and its validator `validateGate` and `loadGate` exist. `run-bench` refuses `gate_campaign_mismatch` (:1567, :1594) and `allow_dirty` (WR-04). The four verifySuites exist and are registered. |
| 71-06 | 8 | VERIFIED | `evaluateGate` returns pass, fail, inconclusive or not_exercised. Named tests cover every D-19 branch, including typed done, unknown exposure, `no_block`, the fallback, the sentinel, refusals and `campaign_incomplete` (WR-02). |
| 71-07 | 8 | VERIFIED | `V6_ACTIONS` includes `JEV_ENABLED=false`. The `DIAGNOSTICS_HEADING` constant exists. The CLI refuses `gate_not_predeclared` and now date-checks every commit (WR-03). `baseline-safety.mjs` uses `computeSafety`. Git and spawn are injected in the tests. |
| 71-08 | 5 | VERIFIED | `compatFor` inherits a patch only from a lower declared patch (IN-07). `version:check` is green and byte-identical at 0.9.92 / 0.11.2. `tests/helpers/release-doc-parity.js` is shared by both suites. |
| 71-09 | 4 | VERIFIED | The delta manifest and compat suite above. `classifyPath` and `DOCS_ALLOWLIST` cover `showcase/server/**`, with only `*.md` and the setter outputs exempt. `--release` refuses `uncommitted_changes`. `count-tool-tokens` exits 2 without `ANTHROPIC_API_KEY` and never prints the key; requests time out at 30 s (IN-04). |
| 71-10 | 6 | VERIFIED | README.md says "73 registered MCP tools" (:82, :280); mcp/README.md has `## Tools (73 Total)` (:484) and links `#tools-73-total`. The count-free onboarding has no `68`/`69` tool claim. The parity test checks the count against `listCurrentTools()` (73) and its outcome-aware marker. |
| 71-11 | 5 | VERIFIED | The stale-count ban `6[689]` covers every `liveToolCountSources` entry (:391-396). `verify:translation-drift`, `verify:translation-quality` and `lint:i18n` pass. Nothing in showcase changed since the 71-12 extraction diff. The SDK flag "Missing pattern: 6[89]" is a false positive: the ban is written `6[689]`. |
| 71-12 | 4 | VERIFIED (re-run at HEAD) | The full chain was re-run at HEAD `9c8e5d5b8` (after the review fixes): `npm run validate:extension && npm test` → `CHAIN_EXIT=0`; bench `node --test` 573/573; no `ℹ fail` above 0. Crawler churn was date-only and restored. `71-VALIDATION.md` has `nyquist_compliant: true` and 19 V-tagged Manual-Only rows. |

### Deferred Items

None to later phases: Phase 71 is the last phase of the milestone. Every remaining item is a Validation Block row (V1-V6), listed under Human Verification Required.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/bench/fixture-server.mjs` | F5 token | VERIFIED | `randomInt`, 24 letters |
| `scripts/bench/lib/runs.mjs` | v2 rows, conditions, safety, exposure | VERIFIED | Imports from fast-mode.mjs; used by report, evaluate, synthetic and baseline-safety |
| `scripts/bench/run-bench.mjs` | `--conditions`, `--gate`, preflight | VERIFIED | Wired to gate.mjs, mcp-client and cdp |
| `scripts/bench/report.mjs` | (arm, condition) grouping | VERIFIED | Used by evaluate-gate `loadCampaign` |
| `scripts/bench/lib/stats.mjs` | `newcombeDifference` | VERIFIED | Used by evaluate and simulate-power |
| `scripts/bench/gate/release-gate-v1.0.0.json` | Frozen gate | VERIFIED | Hash pinned; validator passes |
| `scripts/bench/gate/lib/{gate,evaluate,decision,gate-report,synthetic,sidecar}.mjs` | Validator, evaluator, decision, report | VERIFIED | 4,022 lines, all substantive and wired |
| `scripts/bench/gate/{evaluate-gate,baseline-safety,simulate-power}.mjs` | CLIs | VERIFIED | Injected deps; tests pass |
| `scripts/lib/mcp-extension-compat.mjs` | Per-release minimum | VERIFIED | Imported by the setter and the parity tests |
| `scripts/release/{check-release-diff.mjs,lib/release-diff.mjs}` | Release-diff checker | VERIFIED | Ran live; flags code drift |
| `scripts/mcp/count-tool-tokens.mjs` | count_tokens for V4 | VERIFIED | Refuses without a key; fake-fetch tests pass |
| `tests/fixtures/mcp-release-delta-0.12.0.json` + `tests/mcp-release-compat.test.js` | Reviewed delta | VERIFIED | 52/0 |
| `tests/release-version-rehearsal.test.js` | Two-step rehearsal | VERIFIED | PASS on Node 24 and Node 20 |
| `README.md`, `mcp/README.md`, `skills/fsb/references/tool-decision-tree.md`, `extension/ui/onboarding.js`, showcase, llms, 7 xlf | 73 tools, settings, expect | VERIFIED | Parity and skill-spec tests and the i18n verifiers pass |
| `71-SYNC-RECHECK.md`, `71-SWEEP-BASELINE.json`, `71-POWER.json`, `71-VALIDATION.md` | Phase records | VERIFIED | Present and filled |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| bench-f5-token.test.mjs | extension/ai/jev-state.js | createRequire | WIRED | :35. The SDK missed it because it ran the regex literally |
| package.json test | REFINEMENT_ROOT_TEST_COMMANDS | identical string | WIRED | One occurrence each; delegation-phase-contract 1254/0 |
| runs.mjs | fast-mode.mjs | import projectFastMode | WIRED | runs.mjs:36 |
| run-bench createRunExecutor | applyCondition | called before armFn | WIRED | :772-777, :1660-1715 |
| run-bench stableIdentity | identity.gate | resume refusal | WIRED | :1199-1221 |
| run-bench | gate.mjs | loadGate, gateCampaignFor | WIRED | :80, :1487, :1551 |
| simulate-power | stats.mjs | newcombeDifference | WIRED | SDK verified |
| evaluate.mjs | stats.mjs, runs.mjs | geoMeanMedianRatio, isClaimedSuccess | WIRED | SDK verified |
| evaluate-gate | report.mjs loadCampaign, evaluateGate | import | WIRED | SDK verified |
| sync-product-version | mcp-extension-compat | import | WIRED | :7 |
| mcp-release-compat.test | mcp-in-process.mjs | listCurrentTools | WIRED | SDK verified |
| check-release-diff | sync-product-version | FSB_VERSION_SYNC_ROOT | WIRED | :213; live run confirmed |
| mcp-version-parity.test | listCurrentTools, delta manifest | outcome-aware count | WIRED | SDK verified; 217/0 |
| Showcase templates | messages.xlf | extract-i18n | WIRED | Drift and quality checks pass; the 71-12 extraction diff was 0 lines, and showcase is unchanged since |
| 71-VALIDATION Manual-Only | STATE.md V1-V6 | V-tags | WIRED | 19 rows tagged V1-V6; STATE.md:100+ defines the block |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| evaluate.mjs speed | wallMs per completed row | committed rows from report.mjs `loadCampaign` (runner clock) | Yes in the spot-check: the 0.703 ratio tracks the injected 0.70 effect; the test "huge jevMs change no speed number" passes | FLOWING |
| decision.mjs claims | typed tokens from `result.paths.*.criteria` | evaluator result | Yes: the claim numbers equal the criteria numbers (WR-06 check) | FLOWING |
| Live campaign data | rows under `scripts/bench/results/` | V1 and V4 campaigns | Not yet: no campaign exists by design | DEFERRED (V1/V4) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Bench and gate suites on Node 20 | `node20 --test <20 bench/gate/release files>` and `bench-fast-mode-record` | 573/573 and 8/8 | PASS |
| Release and version suites (Node 24 and Node 20) | version-sync, release-version-rehearsal, mcp-version-parity; plus mcp-release-compat, skill-fsb-spec, delegation-phase-contract, coverage-report | All exit 0 | PASS |
| Full chain at HEAD | `npm run validate:extension && npm test` | CHAIN_EXIT=0 (bench 573/573; compat 52/0) | PASS |
| Setter refuses 1.0.0 without the CHANGELOG entry | temp root `sync-product-version.mjs extension 1.0.0` | exit 1, manifest unchanged | PASS |
| Gate loads, evaluates and decides end to end | `/tmp/fsb71-verify/spot.mjs` (Node 20) | pass, fail, disable and refusal branches as expected; decisions valid; no forbidden claim text | PASS |
| Release-diff detects post-measure code | `check-release-diff.mjs --measured 4dec7f997… --step A` | exit 1, 14 forbidden code violations | PASS |
| count_tokens refuses without a key | `env -u ANTHROPIC_API_KEY node scripts/mcp/count-tool-tokens.mjs --model x` | exit 2, key never printed | PASS |
| Built tools/list length | `listCurrentTools()` | 73, includes `settings` | PASS |
| i18n gates | verify:translation-drift, verify:translation-quality, lint:i18n | All pass (2458 units × 6 locales) | PASS |
| Live campaigns, count_tokens, publish | n/a | Needs the live environment and spend | SKIP (V1-V6) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared or present for this phase: SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| EVAL-01 | 71-01..04, 06, 07, 12 | Compare completion, wall time per completed task and cost across baseline, fast mode and the non-Jev control on the same task set | SATISFIED (tooling); live comparison NEEDS HUMAN (V1, V3, V4) | SC1 evidence above |
| EVAL-02 | 71-01, 04..07, 12 | Release evidence reports pass or fail against predeclared criteria; a failing path stays experimental or disabled | SATISFIED (tooling); real verdicts NEEDS HUMAN (V4), application at V6 | SC2 evidence and spot-check |
| REL-01 | 71-08, 12 | Extension versioned as 1.0.0 through a CHANGELOG v1.0.0 entry, then `version:set:extension -- 1.0.0` | Enforcement and rehearsal SATISFIED; the bump itself NEEDS HUMAN (V6, M-71-10) | Temp-root refusal probe; rehearsal PASS |
| REL-02 | 71-01, 08..12 | MCP minor bump for the optional params and the settings tool, with compatibility checks | Checks SATISFIED; the bump and publish NEED HUMAN (V6, M-71-11) | Delta manifest and compat suite 52/0; rehearsal step B |

No orphaned requirements: REQUIREMENTS.md:89 maps exactly these four IDs to Phase 71, and every one is claimed by at least one plan. The REQUIREMENTS.md checkboxes stay unticked, which is correct while V1-V6 are pending.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (all phase-modified non-planning files) | n/a | TBD, FIXME, XXX, TODO, HACK, PLACEHOLDER in added lines | none found | n/a |
| `scripts/release/lib/release-diff.mjs` | 24-32 | `showcase/**` and `skills/**` classed as docs, including deployed Angular manifests and `skills/fsb/scripts/*.mjs` (review WR-05, skipped) | WARNING | A post-V4 code change there passes `check-release-diff`. Policy is locked (D-24 as amended); the owner decides at M-71-00 |
| `scripts/bench/gate/evaluate-gate.mjs` | 279-292 | Predeclaration check rests on author dates (review WR-03, partial fix) | WARNING | An amended gate commit keeps its old author date. Anchor: record the gate sha256 at V1 (M-71-01b) |
| `scripts/bench/run-bench.mjs` | 1331-1352 | The switch is not restored after a conditioned campaign (review IN-05, skipped) | WARNING | A later unconditioned run may run with fast mode on. Needs an operator check at V4 |
| `.planning/phases/71-comparative-gate-and-release/71-VALIDATION.md` | EVAL-02-g row, Manual-Only | Written before the review: it still describes `git log -1` (now every commit is checked), and the WR-03, WR-05 and IN-05 follow-ups are not yet in M-71-00 or M-71-06 | INFO / WARNING | Hand-off drift; the orchestrator should fold the follow-ups into the V-block rows so the collector finds them |

### Human Verification Required

All items below are Validation Block rows. None of them is automated work this phase left undone.

#### 1. M-71-00: owner sign-off on the frozen gate (V1, hard gate before the V1 campaign)

**Test:** Run `node scripts/bench/gate/baseline-safety.mjs` on the 66-10 smoke to get the real per-type safety event rates, then read `power.safetyTable` in the gate.
**Expected:** The owner accepts D-15 and the `unknownExposure: 'acted'` reading, or amends them with a new `gateVersion` and pin before V1. Items 2-5 are acknowledged or rejected.
**Why human:** This is the escalation. With no true difference, at R = 30 and acted share 0.8, the frozen rules fail Jev safety 83% of the time at p = 0.005 and 97% at p = 0.01, and fail the non-Jev path 39-49% of the time. As frozen, the gate cannot fairly decide which fast paths merit release until the owner rules on this.

#### 2. Review follow-ups (fold into M-71-00)

**Test:** Decide on the following:
- WR-05: narrowing `showcase/**` and `skills/**` code in the release-diff allowlist;
- WR-03: recording the gate sha256 beside the V1 identity at M-71-01b as an amend-proof anchor;
- confirming the WR-01 cost-claim, WR-02 completeness and WR-06 claim-consistency rules.

**Expected:** Each decision is recorded in 71-VALIDATION.md M-71-00 before V1.
**Why human:** These are policy choices against locked D-24 and D-11 (71-REVIEW-FIX.md "requires human verification").

#### 3. V1 baseline (M-71-01, M-71-01b, M-71-01c, M-71-02, M-71-02b, M-71-03)

**Test:**
1. Pin Claude Code and Chrome.
2. Run `core-baseline-66` at `8a058bdf` with 30 rounds (720 runs).
3. Cherry-pick the results onto Jev.
4. Derive the safety sidecar.
5. Cross-check the identity.

**Expected:** `report.mjs scripts/bench/results/core-baseline-66` exits 0 under the v2 validator, and the identity matches the pins.
**Why human:** Live campaign with spend.

#### 4. V3 calibrated smoke (M-71-04)

**Expected:** At least one calibrated fast step and 0 `sensitive_goal`.
**Why human:** Needs the live gateway and the calibrated profile.

#### 5. V4 gate campaigns and evaluation (M-71-05 to M-71-08b, M-71-09)

**Test:**
1. Run the 720-run autopilot campaign and the 360-run Claude campaign with `--gate`.
2. Run `evaluate-gate.mjs … --verify-suites --out scripts/bench/gate/decisions/core-gate-71.json`.
3. Optionally run the `core-rebaseline-71` fallback.
4. Run `count_tokens` on the pinned model.
5. Add the IN-05 check: after the autopilot campaign, confirm the switch reads off before any unconditioned run.

**Expected:** The decision file validates, and the per-path verdicts and V6 actions are committed with the report.
**Why human:** Live spend; the owner reads the verdicts.

#### 6. V6 release (M-71-10, M-71-11, M-71-11b)

**Test:**
- Step A: CHANGELOG v1.0.0 entry, `version:set:extension -- 1.0.0`, `version:check`, the full chain, a commit, `check-release-diff --step A`, the merge, then the CWS listing and privacy form.
- Step B: MCP 0.12.0 with the README "What's New", `check-release-diff --step B` and the npm publish; or the 72-count docs fallback if 0.12.0 is withheld.

**Expected:** Versions agree at 1.0.0 / 0.11.2, and later 0.12.0. CI is green, including the showcase extraction diff. `npm view fsb-mcp-server dist-tags.latest` prints `0.12.0` when published.
**Why human:** Merge to main, store submission, npm publish.

V2 and V5 have no Phase 71 item of their own (explicit "none" rows M-71-V2 and M-71-V5).

### Gaps Summary

No automated gaps:
- Every artifact exists, is substantive and is wired.
- Every SDK key-link miss resolves on manual inspection.
- The full chain is green at the current HEAD, including the 12 review-fix commits that landed after the 71-12 gate.
- The footprint holds: no change under `mcp/src`, `mcp/build`, `extension/{ai,ws,content}`, `showcase/server` or `scripts/bench/tasks`; `onboarding.js` is the only extension file changed; versions and CHANGELOGs are unchanged; `scripts/bench/gate/decisions` and `scripts/bench/results` are empty; nothing was pushed (`origin/Jev: ahead 310`).

The phase goal is reached as far as automation can take it. The comparison, the gate, the evaluator, the decision and claim layers, and the release guards all work and are proven on synthetic data. The goal's outcome (actually deciding, then versioning) is a Validation Block activity. One decision is critical and must come before V1: as frozen, the safety rules (D-15 with the unknown-exposure reading) fail Jev with near certainty even with no true difference. If the owner does not rule at M-71-00, V4 will mechanically disable fast mode regardless of its real safety. That decision, plus the three review follow-ups not yet folded into 71-VALIDATION.md, are the escalations.

---

_Verified: 2026-10-19T05:10:00Z_
_Verifier: Claude (gsd-verifier)_
