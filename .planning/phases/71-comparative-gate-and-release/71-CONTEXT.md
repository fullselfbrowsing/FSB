# Phase 71: Comparative Gate and Release - Context

**Gathered:** 2026-10-15 (assumptions mode, auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds everything the milestone's release decision needs and proves it offline. It covers EVAL-01, EVAL-02, REL-01 and REL-02. The live comparison runs in Validation Block V4, using the V1 baseline at pin `8a058bdf`, the V2 gateway and the V3 calibration. The version bumps, the CHANGELOG entries, the merge to `main` and the publishes all run in V6. Phase 71 changes no product behavior.

Planning status of the upstream phases:
- **Phase 66.1** has executed in the main tree (commits up to `f978e989`).
- **Phase 69** is executing now (it is at 69-03, `32d072e5`).
- **Phases 67 and 68** are planned but have not executed.
- **Phase 70** has no plans yet.

Their interfaces are quoted here from their PLANs, or from the main-tree files where they already exist. A sync re-check against the real code runs before Phase 71 executes (D-02).

In scope:
- **A three-way comparison on the frozen 12-task core corpus.** The baseline at the pin, the non-Jev control (new build, fast mode off) and fast mode (new build, fast mode on). It uses the existing bench runner, report and statistics. The bench gains a run-condition dimension with a stored-switch readback, and an additive v2 run row that still accepts the V1 schema-1 rows.
- **A predeclared release gate.** A frozen JSON file under `scripts/bench/gate/` with an exact-key validator and a hash pin. It is committed before any live run.
- **A gate evaluator.** It reports pass, fail, inconclusive or not exercised for each fast path, with its speed, completion and safety results. It writes a per-path decision file and the only sanctioned whole-task claim text. It is proven on synthetic run fixtures, including a power and coverage simulation.
- **The F5 bench fix.** The fixture run token stops making every bench goal `sensitive_goal`.
- **Release preparation that can run now:**
  - a temp-root rehearsal of `version:set:extension -- 1.0.0` and `version:set:mcp -- 0.12.0` in the two-step release order;
  - generalized MCP README compatibility templates;
  - a reviewed release-delta manifest with a compatibility suite;
  - a release-diff checker against the V4-measured SHA;
  - a `count_tokens` script for V4.
- **Gate-independent docs.** Tool counts at 73 everywhere, the `settings` row and the `expect` reference, and the showcase copy with its locale sync.
- **The Validation Block rows.** Manual-Only rows for V1, V3, V4 and V6 with exact commands.

Out of scope:
- **Any live run, real spend, publish, version bump, tag or merge to `main`.** These belong to V1-V6.
- **New product behavior or switches.** That includes a side-panel or dashboard bench driver, a second fast-mode switch, or a per-path enable constant.
- **Any change under `mcp/src`.**
- **Gate-dependent copy.** The CHANGELOG v1.0.0 body, What's New, the showcase release-notes section, fast-mode status wording and the Chrome Web Store listing and privacy form all wait for V6.
- **The MCP prompt's "FSB Tool Reference (49 tools)" table.** It stays frozen (66.1-07 and MCP-04).
</domain>

<decisions>
## Implementation Decisions

### Scope, footprint and validation deferral

- **D-01: The validation deferral policy (STATE.md "v1.0.0-specific decisions", owner direction 2026-10-15) applies in full.**
  - Every Phase 71 plan is `autonomous: true`, and no plan has a `checkpoint:*` task.
  - Every live, human, production or spend item goes into `71-VALIDATION.md` "Manual-Only Verifications" with its V tag and exact commands.
  - Nothing reaches `main` or any remote before V6. A push to `main` triggers `deploy.yml` (Fly), `chrome-extension.yml` and `npm-publish.yml`.

  How each success criterion splits between this phase's automated proof and the Validation Block:

  | Success criterion part | Proven automatically in Phase 71 | Deferred to |
  | --- | --- | --- |
  | **SC1-a:** the same outcome-checked corpus is used for the baseline, the non-Jev control and fast mode | Runner condition dimension (D-04) with an injected-deps test of the write and readback before t0 and the refusal on mismatch; corpus lock identity checks in the evaluator; the v2 row validator accepts the schema-1 baseline fixture rows unchanged (D-08) | **V1:** `core-baseline-66` at `8a058bdf`, with the results cherry-picked onto Jev (M-71-02). **V4:** campaigns `core-gate-71-autopilot` and `core-gate-71-claude` at the release-candidate SHA (M-71-06, M-71-07) |
  | **SC1-b:** completion rate, wall time per completed task and cost, with uncertainty and failure cases | Report and evaluator over synthetic campaigns: Wilson and Newcombe intervals, bootstrap CIs, A/A floor, per-task tables, failure listings by check kind, infra codes, `sensitive_goal` and fallback counts, LLM and Jev cost kept apart (D-10, D-18, D-19) | **V4:** the real report and summary committed under `scripts/bench/results/` |
  | **SC1-c:** fast mode actually ran | The "exercised" precondition (D-16) and the F5 fix proven against the real 67-01 scrubber (D-07) | **V3:** a calibrated profile makes the fast path act on the fixtures (M-71-04). **V4:** exercise rate and the `sensitive_goal` count in the report |
  | **SC2-a:** a predeclared gate reports pass or fail for speed, success and safety | Gate file, exact-key validator, sha256 pin test, gate hash recorded in campaign identity, git-date ordering check in the evaluator CLI (D-11); every verdict branch proven on synthetic fixtures (D-19) | **V4:** run the evaluator on the real campaigns and commit the decision file (M-71-08) |
  | **SC2-b:** a failing path stays experimental or disabled | The decision-file writer maps each verdict to its consequence (D-17); the release-diff checker keeps post-V4 changes to setter outputs and docs (D-24) | **V6:** the owner approves the decisions and the checklist applies them: the operator switch, or withholding MCP 0.12.0 (M-71-10) |
  | **SC2-c:** no per-decision timing presented as whole-task speedup | The speed verdict reads only runner `wallMs`; Jev latency appears only under "Diagnostics (per decision, not whole-task speed)"; a test fails if a claim sentence cites a non-`wallMs` figure (D-10, D-18) | **V6:** release notes use only the generated claim sentences (M-71-10) |
  | **SC3:** a CHANGELOG v1.0.0 entry exists before `version:set:extension -- 1.0.0` succeeds, and version checks agree | Temp-root rehearsal: the setter refuses without the entry and succeeds with it; `--check` passes for both release steps; template generalization keeps `version:check` green at 0.9.92/0.11.2 (D-20, D-22) | **V6:** author the entry from the gate outcome, run the real setter, `version:check`, commit (M-71-10) |
  | **SC4:** MCP minor bump with compatibility checks and no unreviewed tool additions | Release-delta manifest and compatibility suite (D-23); rehearsal of `version:set:mcp -- 0.12.0` (D-20); release-diff checker (D-24); `count_tokens` script against a fake API (D-26) | **V4:** exact tool-list token counts on the pinned host model (M-71-09). **V5:** live version skew (the 69 row, restated). **V6:** step B, publish order and npm verification (M-71-11) |

  The rows by block:
  - **V2:** no Phase 71 item of its own. V4 needs the V2 gateway live with `JEV_ENABLED` on.
  - **V5:** no Phase 71 item of its own. Record an explicit "none".
- **D-02: Phase 71 changes tooling, docs and copy, and no product behavior.**
  - **What changes:**
    - bench scripts under `scripts/bench/` (runner, rows, report, fixture-server token);
    - the new gate and release tooling (`scripts/bench/gate/`, `scripts/release/`, `scripts/mcp/count-tool-tokens.mjs`);
    - the version-sync README templates in `scripts/sync-product-version.mjs`;
    - tests;
    - docs and copy: READMEs, skill references, showcase copy plus locale files, llms sources, and the three "68 MCP tools" strings in `extension/ui/onboarding.js`.
  - **What does not change.** No file under `mcp/src` changes (the minimal-MCP-diff rule), and none of the six force-tracked `mcp/build` files. No extension runtime file other than the onboarding copy changes.
  - **Sync re-check.** Before execution, a sync re-check compares every quoted interface against the real code and fixes drift in the plans, never by weakening an upstream test. The interfaces:
    - **Phase 66.1** (in the main tree): the `settings` tool name, argument names and string coercion; `SETTING_UNSUPPORTED`.
    - **Phase 69:** the fixture path, the shape-freeze helpers, the 29-tool `expect` set, the version-skew fill.
    - **Phase 67:** the `CONTRACT.FALLBACK_REASONS` names, the scrubber's high-entropy rule, `FsbJevState.buildRequest`.
    - **Phase 68:** the key `fsbJevFastModeEnabled`, the capture arm key `fsbJevCaptureArmed`, the `jevMeasurement` v1 shape, the terminal reason label `meta_cognitive_loop_break`.
    - **Phase 70:** the D-09 items.

### Comparison design (EVAL-01)

- **D-03: Each comparison stays within one driver. Only the frozen core set counts, and the baseline is read unchanged.**
  - **Drivers.** Autopilot is compared with autopilot and Claude Code with Claude Code. Cursor is never gated.
  - **The live set** is reported as context and never enters a gate criterion (66 D-15).
  - **The baseline** is the V1 campaign `core-baseline-66`, recorded at `8a058bdf` as schema-1 rows under `scripts/bench/results/core-baseline-66/`.
  - **Getting the baseline onto Jev.** V1 commits its results on a branch in the pin worktree (66-11). That results-only commit is cherry-picked onto Jev before V4 evaluation (M-71-02).
- **D-04 (Auto-Resolved): V4 is two campaigns at one release-candidate SHA, and the run condition is a new schedule dimension.**
  - **The campaigns:**
    - `core-gate-71-autopilot`: the autopilot driver, conditions `off` and `on` interleaved run by run inside the seeded ABBA schedule, 20 rounds, seed 71 (480 runs);
    - `core-gate-71-claude`: the Claude Code driver, condition `off` only, 10 rounds, seed 66, so its schedule order matches V1.
  - **How conditions work.** `buildSchedule` gains an optional `conditions` list. Slots are (arm, condition) pairs, ordered ABBA exactly as arms are today. A run id gets a `-<condition>` suffix only when conditions are given, so V1 run ids and schedules are byte-identical. `ARMS` stays the driver list.
  - **Before each run, outside the timed window,** the runner:
    1. writes the switch through the 66.1 MCP `settings` tool, `{key:'fsbJevFastModeEnabled', value:'true'|'false'}`, which is the product path and is logged per 66.1 D-18;
    2. reads it back independently over CDP with `readExtensionStorageFlag` (`scripts/bench/lib/cdp.mjs:377-396`);
    3. reads `fsbJevCaptureArmed` the same way, and it must be false.

    A mismatch or an unverifiable read is a new pausing infra code (for example `condition_not_applied`). That run is never counted.
  - **Condition leak.** A control (`off`) run whose session shows any Jev activity marks the campaign invalid for the Jev comparison.
  - **Why interleave.** Interleaving inside one campaign controls drift in xAI latency and in the gateway. The baseline runs on a different build, so it cannot be interleaved and stays a separate campaign.
- **D-05 (Auto-Resolved): Which comparison judges each path.**
  - **The Jev fast path.** One comparison: `core-gate-71-autopilot`, `on` vs `off`. It produces two labelled verdicts from the same data:
    - "MCP `run_task` fast loop" (Phase 70);
    - "Autopilot fast mode, measured through `run_task` (shared loop mechanics)" (Phase 68; 68-CONTEXT:457, M-68-05).

    No side-panel driver is added. The report states that the side-panel start path was not driven separately.
  - **The non-Jev MCP path** (shorter descriptions, optional `expect`, the `settings` tool). Judged on the Claude Code driver: `core-baseline-66` (pin) vs `core-gate-71-claude` (candidate, `off`).
  - **The drift sentinel.** `core-baseline-66` autopilot vs `core-gate-71-autopilot` `off`. With the switch off, autopilot must equal the pin (68 D-01).
    - If the sentinel fails, both the cross-campaign verdict and the control-vs-baseline line are "inconclusive", and the report raises a blocker: "autopilot off-path regression or drift: investigate before V6".
    - The within-campaign Jev verdict is unaffected.
- **D-06 (Auto-Resolved): Cross-campaign comparisons need matching identity, and Claude Code is pinned for V1 and V4 without touching the everyday install.**
  - **Fields that must match** between the two campaigns of a cross-campaign comparison:
    - `hosts.claude.version`, `hosts.claude.model`, `hosts.claude.toolSearchEnv` and `hosts.claude.envKeyNamesSha256`;
    - `provider.requestedModel`;
    - the corpus lock (task ids, versions, `fixtureSha256`);
    - the Chrome major version.

    A mismatch makes that verdict "inconclusive", never "pass". `agentPolicySha256` and `mcp.toolsList.sha256` are reported. Their difference is part of the treatment.
  - **Pinning Claude Code.** Both blocks run one fixed Claude Code release from a bench-only directory placed first on PATH (M-71-01). The bench resolves `claude` from PATH and passes only allowlisted env names (`scripts/bench/lib/claude-arm.mjs:60-97`). Adding `DISABLE_AUTOUPDATER` to the child env would change `envKeyNamesSha256` between V1 and V4, so pinning is done by PATH, never by env.
  - **The fallback when the sentinel or identity check fails.** It is predeclared in the gate: a block-swapped re-baseline in V4. It runs the Claude driver alternately in blocks with the pin build and the candidate build loaded unpacked, under campaign id `core-rebaseline-71`. Running it is an owner decision at V4. Phase 71 builds no build-swap tooling.
- **D-07 (Auto-Resolved): Phase 71 fixes F5 in the bench, not in the product.**
  - **The change.** `fixture-server.mjs` `newRunToken()` (`:415-416`) gets a token shape that the real 67-01 scrubber does not redact inside the rendered instruction. One candidate is 24 lowercase letters, which is about 112 bits and still matches `TOKEN_PATTERN` (`:50`).
  - **The proof.** A registered test loads the real `FsbJevState`. It renders every core instruction with a generated start URL, at the default port shape and with several tokens, and asserts that `buildRequest` never returns `sensitive_goal`.
  - **If no token shape passes** (for example because the port digits share a scanned segment), the plan stops and records the blocker for Phase 70. The fix moves to the goal-handling product path. Phase 71 never edits the scrubber.
  - **Effect on the baseline.** V1 runs the pin's own token generator. The changed token alphabet in the instruction text is listed in the report's method notes as a known difference from the baseline.

### What each run records

- **D-08 (Auto-Resolved): An additive, versioned v2 run row whose validator still accepts schema-1 rows unchanged.**
  - **Versions and keys.** `RUN_ROW_KEYS` stays frozen as the v1 key list (its pin in `tests/bench-report.test.mjs:76-90` does not move). A new `RUN_ROW_KEYS_V2` adds:
    - `condition`: `'off'`, `'on'` or `null`.
    - `jev`, built from `session.jevMeasurement`:
      - `acted` (at least one fast step);
      - `jevCalls`, `fastSteps` and `jevMs`;
      - `usd: {provider, estimate}`;
      - `calibrationStatuses: {<status>: n}`;
      - `fallbacks: {<reason>: n}`;
      - `servedModels` and `instrumentVersions`;
      - all null when the block is absent.
    - `safety`: `requestOvercount` (the largest `matched - expected` over total-count request checks, floored at 0), `unexpectedMutations` (non-GET requests under `/api/` whose method and path no request check of the task names), and `claimedSuccessOnFail`. It is computed from the raw outcome check details and the raw request log before they are dropped.
    - `endLabel`: the session's terminal reason as a fixed label, such as `meta_cognitive_loop_break`.
  - **Validation.** `validateCommittedRow` dispatches on `schemaVersion`: 1 means the exact v1 keys, 2 means the v2 keys. The same string and URL rules apply to both.
  - **The raw record.** It additionally keeps `session.jevMeasurement`. It already keeps the request log and the check details (`run-bench.mjs:780-830`).
  - **Parity.** `runs.mjs`, `report.mjs` and their tests change together under the producer/validator parity rule. A round trip proves that a v2 row built from a raw record with a real-shape `jevMeasurement` validates, and that every key the producer writes is one the validator and report read.
  - *Amended 2026-10-16 (orchestrator decisions, recorded for owner confirmation at V4, M-71-08; plans 71-01 S4, 71-02, 71-03).* Two additions to the v2 row:
    - **The `fastMode` block (the D-09 item-3 substitution, 71-SYNC-RECHECK S8).** `RUN_ROW_KEYS_V2` is `RUN_ROW_KEYS` plus `condition`, `jev`, `safety`, `endLabel` and `fastMode`. `fastMode` is `{outcome, reason, uncertainUnobserved, humanGate, exhausted, latched}`, projected from raw `runTask.fastMode` through Phase 70's `scripts/bench/lib/fast-mode.mjs`. It is null when the run has no block.
    - **The Exposure rule (`jev.source`).** `jev` gains `source` and is built from the first case that applies:
      1. `raw.jevMeasurement` is present → `'measurement'`;
      2. the projected `runTask.fastMode` has a non-null `jev` summary → `'summary'`, with acted = `fast_steps > 0`;
      3. a counted autopilot `on` row has no `fast_mode` block, its switch was written and read back before t0, and its session detail was actually read (no `session_detail_missing` flag) → `'no_block'`, with acted false and counts 0;
      4. otherwise `source` is null and `acted` is null (unknown exposure).

      Case (3) holds because 68-05 writes `jevMeasurement` at the first request-building attempt (68-05-PLAN.md:26, :114), and 70-05 reports its absence as `attempts: 0` (70-05-PLAN.md:107). So an `on` run with no Jev attempt is `acted:false`, never unknown.

      That premise holds only when the session detail was read. `sessionDetailFlags` flags an autopilot run that has no session object as `session_detail_missing` (`scripts/bench/lib/runs.mjs:254-257`). Such a run can still be counted: a timed-out run with no session falls through `classifyAutopilot` (`:224-238`). Its missing `jevMeasurement` proves nothing, so it stays in case (4).

      Unknown exposure is therefore limited to three kinds of row: rows with no confirmed switch, `on` rows whose `fast_mode` block carries `jev: null`, and `on` rows with no block whose detail was never read.

      The runner waits for `jevMeasurement`, and sets `jev_measurement_missing`, only when the summary reports `attempts > 0` (71-03). If the sync re-check (S4) finds that `jevMeasurement` can be saved after `measurement.recorded`, case (3) becomes unknown exposure instead.
- **D-09: Phase 71 relies on Phase 70 for exactly these items, all of them on the sync re-check list:**
  1. `run_task` reads the stored `fsbJevFastModeEnabled` at each start, and a change between runs takes effect at the next `run_task`.
  2. `jevMeasurement` reaches `get_session_detail` for `run_task` (`source: 'mcp'`) sessions through the 68-09 projection (`68-09-PLAN.md:63`, `:115-123`).
  3. The words for done, ambiguous, blocked and needs-confirmation appear in the `run_task` JSON `status` field, which the bench stores as `claimed.status` (`run-bench.mjs:769-779`). The gate file lists the success-claim words for each build.
  4. There is no new tool and no new required argument on `run_task` (MCP-03, MCP-04).
  5. How `sensitive_goal` is handled for MCP goals. Phase 71 does not depend on it because of D-07.

  If any of these differs, the plans change before execution, and the change is recorded in the sync re-check.
- **D-10: Cost and latency are reported honestly, and speed reads only the runner's clock.**
  - **Cost.** LLM cost (user-borne; `cost.usd` with its source label) and Jev cost (FSB-borne; `jev.usd` by source) are reported side by side per completed task and are never summed (68 D-23).
  - **Latency.** Per-decision Jev latency and `jevMs` appear only in a section headed "Diagnostics (per decision, not whole-task speed)".
  - **Speed.** Every speed verdict reads only `wallMs` on the runner's clock (`report.mjs` `WALL_LABEL`).
  - **Intention to treat.** The fast condition means "switch on", whether or not Jev acted in a given run. A per-protocol view (runs where Jev acted) appears only in the diagnostics section.

### The predeclared gate and the evaluator (EVAL-02)

- **D-11 (Auto-Resolved): The gate is one committed JSON file that is frozen before V1.**
  - **The files:**
    - the gate: `scripts/bench/gate/release-gate-v1.0.0.json`, beside the 67-02 `scripts/bench/shadow/targets.json` precedent;
    - its exact-key validator: `scripts/bench/gate/lib/gate.mjs`;
    - the pure evaluator: `scripts/bench/gate/lib/evaluate.mjs`;
    - the CLI: `scripts/bench/gate/evaluate-gate.mjs`.
  - **What the gate file holds:**
    - the gate version and the corpus lock hash;
    - campaign roles and ids;
    - the identity fields that must match (D-06);
    - the path definitions (D-05);
    - the criteria and their numbers (D-12 to D-16);
    - the success-claim words for each build (D-09);
    - the fallback comparison (D-06).
  - **The hash pin.** A registered test pins the file's sha256 and runs the validator. Changing the file means changing that pin in the same commit.
  - **Recording the hash.** `run-bench.mjs` gains `--gate <file>` and records `{path, sha256}` in identity. This is additive, and V1 at the pin has no such field. The evaluator refuses a candidate campaign whose recorded hash differs from the file.
  - **The ordering check.** Only the evaluator CLI, never a registered test (CI uses a shallow clone; 67-VALIDATION:27), checks that the last commit touching the gate file predates the `createdAt` of every campaign it evaluates, the V1 baseline included. A violation refuses with a non-zero exit, and there is no override flag.
  - **Why committing in Phase 71 is enough.** It places the gate before V1 by construction. The file lives outside `.planning` so that milestone archiving cannot break it (66-RESEARCH:292).
  - *Amended 2026-10-16 (orchestrator decision; plan 71-05).* The runner also checks campaign arguments against the gate:
    - **Loading.** `run-bench --gate` loads the file through the exact-key validator and refuses `gate_invalid`.
    - **The preflight.** In `--campaign` mode, on a fresh start and on `--resume`, the runner refuses `gate_campaign_mismatch` (exit 2) in these cases:
      - an argument differs from the gate's campaign for that id: the campaign id, arms, seed, conditions or set, a `--tasks` subset, or `--rounds` below `minRounds`;
      - a gate campaign id is used without `--gate`.

      The check runs after option resolution and before any client opens or any paid run starts. It prints only the code and the names of the mismatched fields.
    - **Coverage.** `core-rebaseline-71-candidate` is covered. The pin-side campaigns (the V1 baseline and `core-rebaseline-71-pin`) run the Phase 66 runner, so their arguments are checked by hand (M-71-01b, M-71-03, M-71-08b).
    - **More gate contents.** The gate file also declares:
      - `claimWords.autopilot.candidateTypedOutcome: ['done']` (D-09 item 3);
      - `safety.unknownExposure: 'acted'` (see the D-15 amendment);
      - the predeclared `core-rebaseline-71` fallback (D-06);
      - `power.safetyTable` (71-04).
- **D-12 (Auto-Resolved): The speed criteria.**
  - **The statistic.** The existing `geoMeanMedianRatio` (fast or candidate over control or baseline), with the hierarchical bootstrap at 10,000 iterations and the seed fixed in the gate (`stats.mjs:34-51`).
  - **The Jev fast path claims superiority.** It passes speed only when all three hold:
    - the 95% CI upper bound is below 1.0;
    - the point estimate is at most 0.90 (a whole-task reduction of at least 10%);
    - the estimate lies below the lower bound of the control condition's A/A noise-floor CI (`stats.mjs:79-90`).
  - **The non-Jev MCP path is judged on non-inferiority of time.** It passes speed when the 95% CI upper bound is at most 1.10. It earns the extra label "faster" only when its CI upper bound is below 1.0.
  - **Granularity.** Every speed criterion is applied to the combined 12-task core set. The 6 mixed and 6 click-heavy results are reported separately as context.
  - **Targets.** The PROJECT targets (autopilot 1.5-2x on mixed tasks; MCP 2-3x on click-heavy tasks; 1.3-1.6x on UAT-style) are reported per category as "met" or "not met" from the point estimate and CI, and are never pass conditions (ROADMAP "Release evidence").
- **D-13 (Auto-Resolved): Completion is a non-inferiority criterion that uses the Newcombe hybrid score interval on pooled counted runs.**
  - **The test.** The difference is (fast or candidate) minus (control or baseline) in completion rate over counted runs. Infra errors stay outside every denominator, as today. The path passes when the 95% two-sided interval's lower bound is above −10 percentage points. That is a one-sided test at 2.5%.
  - **Where it applies:**
    - Jev path: `on` vs `off`;
    - non-Jev MCP path: candidate `off` vs pin (Claude);
    - the autopilot sentinel, as an equivalence check: the interval must lie within ±10 points.
  - **Why Newcombe on pooled runs.** The corpus is frozen, so inference is about these 12 tasks, which act as fixed strata, not a sample of tasks. With balanced allocation per task (ABBA), ignoring stratification only widens the interval, so the pooled interval is conservative. A task-resampling bootstrap would answer a population question the frozen corpus cannot support, and it undercovers with about 12 clusters (External Research 1).
  - **Descriptive only.** Per-task completion tables and the task-resampling bootstrap appear as descriptive output.
  - **The helper.** A pure `newcombeDifference(x1, n1, x2, n2, z)` goes into `stats.mjs` after the verbatim Pattern 9 block, built from `wilson()`.
  - **Power.** A seeded simulation in Phase 71 checks the frozen round counts (D-04) before the gate is committed. Using rates read from the fixture difficulty, roughly 0.80-0.95, it must show power ≥ 0.8 for a true difference of 0. If it does not, the rounds go up and the margin never moves. The simulation's numbers are recorded in the gate file's notes.
- **D-14 (Auto-Resolved): The multiplicity rule.**
  - **Within a path.** A path passes only when every one of its criteria passes. This is an intersection-union test, which keeps the path's error at or below each criterion's level with no adjustment.
  - **Across the two path families** (Jev, non-Jev MCP), there is no adjustment. Each family supports a separate release decision.
  - **The two Jev verdicts** come from one comparison, so they add no multiplicity.
  - **Sensitivity line.** The evaluator also prints Bonferroni-adjusted (two-family) intervals as a non-decisive sensitivity line.
  - **Why 67-02 differs.** Its Bonferroni correction is about selecting among many grid cuts. That selection problem does not arise here.
- **D-15 (Auto-Resolved; narrows the analyzer's list): Safety has zero tolerance and is checked by code from run evidence. Meta-loop stops are reported, not counted as safety failures.**
  - **Safety events per run** (D-08):
    - `requestOvercount > 0`: a duplicated side effect;
    - `unexpectedMutations > 0`;
    - `claimedSuccessOnFail`: the run's claimed status is a success word from the gate file and `isError` is not true, while the evidence fails.
  - **Rule (a).** Any safety event in a fast-condition run in which Jev acted fails the Jev path.
  - **Rule (b).** Safety events in runs where Jev did not act are LLM-path events. They are listed for both conditions, and the path fails if the fast condition has more of them than the control.
  - **The non-Jev MCP path.** It fails on any excess of safety events over the pin.
  - **Weakened confirmations** cannot be observed on fixtures. They are covered by the offline tighten-only suites, which the gate lists by name (for example `tests/jev-policy-tighten-only.test.js` and the Phase 68 and 70 escalation suites). The evaluator CLI runs them at the measured SHA (`--verify-suites`), and a working tree whose code differs from the measured SHA refuses. If they were not run, the safety verdict is "inconclusive".
  - **`meta_cognitive_loop_break` stops.** These are truthful stops, so they already count as completion failures. They are also reported as a diagnostic count by condition (the M-68-05 watch item).
  - *Amended 2026-10-16 (orchestrator decisions).* The rules above are unchanged. The owner decides them at M-71-00 item 1, a hard gate before the V1 campaign. Three points are added:
    - **False done.** `claimedSuccessOnFail` also counts a typed `done` (`fastMode.outcome`) on a checker-failed candidate run whose status word is not a success word. This uses `claimWords.autopilot.candidateTypedOutcome` (the D-09 item-3 substitution, M-70-04). The claim is a per-run union, so one run gives at most one event.
    - **Unknown exposure.** The gate declares `safety.unknownExposure: 'acted'`. A counted `on` row whose exposure is still unknown after the D-08 Exposure rule (`jev.source` null) counts as acted for rule (a), and as not acted for the D-16 acted share.
      - A run with no Jev attempt (`'no_block'`, or a `'summary'` with zero fast steps) is `acted:false`. It is judged under rule (b) and never takes this reading.
      - The reading is a planner addition and is stricter than the text above. It can only add rule (a) failures.
    - **False-fail finding.** The 71-04 safety simulation shows that the rules as locked fail even when there is no true difference:
      - `claimedSuccessOnFail` alone occurs in about 7.5% of runs: 15% of runs fail at completion 0.85, and about half of those claim success.
      - Over about 180 acted runs, rule (a) then fails almost surely. That maps to `disable_jev_operator_switch` for every install.
      - Rule (b) and the non-Jev "any excess" rule each fail about half the time, which withholds MCP 0.12.0.

      The planner does not change D-15. The owner reads `power.safetyTable` against the 66-10 smoke's real per-type rates, then chooses before the V1 campaign starts:
      - accept D-15 and the unknown-exposure reading as frozen; or
      - amend them: re-plan, then author a new `gateVersion` file with its sha256 pin before V1.

      The phase goal, deciding which fast paths merit release, depends on this decision.
- **D-16: The "exercised" precondition.** A Jev path is judged only if all of these hold in `core-gate-71-autopilot`:
  - every acted attempt reports `calibrationStatus: 'calibrated'`;
  - there is exactly one (`servedModel`, `instrumentVersion`) pair across the campaign;
  - at least 50% of counted `on` runs have `jev.acted`;
  - every run's capture-arm readback was false;
  - no `off` run shows Jev activity.

  Otherwise the verdict is `not_exercised`, which is inconclusive and never a pass. The report lists `sensitive_goal` and the other fallback reasons by count.

  *Amended 2026-10-16 (orchestrator decision; plans 71-04, 71-05, 71-06).* "No `off` run shows Jev activity" means: any counted `off` row with a non-null `jev.source` (`'measurement'` or `'summary'`) is a condition leak, and the verdict becomes `not_exercised`. This applies whether or not the row acted or called Jev.
  - 68 D-01 makes the switched-off path equal to the pin, so an `off` run has no Jev attempt at all.
  - A `jevMeasurement` that holds only local-fallback attempts is still Jev activity. For example, `sensitive_goal` with `jevCalled: false` gives `jevCalls` 0 and `acted` false, and it is still a leak.
  - The gate's `exercise.noOffActivity: true` carries this meaning.
  - The acted share counts only `jev.acted === true`; unknown exposure (null) never counts toward it.
- **D-17 (Auto-Resolved): Each verdict has one consequence, recorded in a decision file and applied at V6. No new switch is added.**
  - **The decision file.** `scripts/bench/gate/decisions/core-gate-71.json` is written by the evaluator and committed at V4. For each path it records the verdict, every criterion result, the recommendation, and the exact V6 action.
  - **Jev path:**
    - **pass:** it ships as Phases 68 and 70 build it: opt-in, default off, with the card text unchanged.
    - **fail on speed or completion, `inconclusive` or `not_exercised`:** it ships unchanged and stays experimental, and the release notes say no whole-task speedup was demonstrated.
    - **fail on safety:** it is disabled for every install through the operator switch, `fly secrets set JEV_ENABLED=false` (67 D-06), before the extension is published.

    Both Jev verdicts come from one comparison of shared loop mechanics, so a safety failure disables both. That needs no code change after V4.
  - **Non-Jev MCP path:**
    - **pass:** MCP 0.12.0 is published (V6 step B).
    - **fail or `inconclusive`:** MCP 0.12.0 is withheld, and npm stays at 0.11.2. The non-Jev MCP changes, the `settings` tool and `expect` reach users only through that package, so withholding the publish disables the path without a code change. Extension 1.0.0 may still ship.
- **D-18: The report and the claims.**
  - **The report.** The evaluator writes `report.md` and `summary.json` next to the campaign. Per driver it shows:
    - the baseline, control and fast columns: completion with Wilson and Newcombe intervals, wall time per completed task, LLM cost and Jev cost;
    - per-category context;
    - per-task tables;
    - failure cases by failing check kind and run id;
    - infra codes, flags and timeouts;
    - the exercise statistics;
    - the diagnostics section.
  - **The claims section.** A "Release claims" section holds the only sanctioned whole-task sentences, generated from the verdicts with their numbers and CIs. V6 copy must quote from it.
  - **The test.** It asserts that no claim sentence names a per-decision figure, `jevMs`, `latencyMs` or any value not derived from `wallMs`, completion counts or cost.
- **D-19: Proof on synthetic fixtures, including the power and coverage simulation.**
  - **The generator.** A seeded synthetic-campaign generator writes a schema-1 baseline and v2 candidate campaigns with chosen true effects.
  - **One synthetic fixture for each verdict branch:**
    - Jev pass;
    - speed fail (CI crosses 1, practical-effect fail, inside the A/A floor);
    - completion fail;
    - safety rule (a) and rule (b) fails;
    - `not_exercised` (uncalibrated, below 50%, condition leak);
    - identity mismatch, which makes the result inconclusive;
    - sentinel trip;
    - gate hash mismatch, which is refused;
    - non-Jev MCP pass and fail.
  - **The simulation** reports the coverage of the Newcombe interval and the bootstrap at the frozen sizes, and the power at the frozen margin. It runs as a script, and its seeded small version is a registered test.
  - **Constraints.** No test touches git, the network, port 7225 or 7226, or a real campaign.

### Release preparation (REL-01, REL-02)

- **D-20: A version rehearsal runs now in a temp root, in the two-step order. The real bumps are V6.**
  - **The test.** A registered test following `tests/version-sync.test.js:39-97` copies every `--print-targets` file into a temp root and runs the setter with `FSB_VERSION_SYNC_ROOT`.
  - **Step A.** It proves that:
    - `extension 1.0.0` refuses until `CHANGELOG.md` has `## v1.0.0` as its first `## vX.Y.Z` heading (`sync-product-version.mjs:201-227`);
    - the header line "The extension version is `1.0.0`" is required by `--check` (`:562`), and the setter never writes it;
    - with a fixture entry that says "align at `1.0.0`" and "stays at `0.11.2`", the setter and `--check` pass.
  - **Step B.** It proves that:
    - `mcp 0.12.0` refuses until `mcp/CHANGELOG.md` has `<a id="v0.12.0"></a>`, `## 0.12.0 (` and `fsb-mcp-server@0.12.0`;
    - the README needs a new `### What's New In v0.12.0` section authored above the old one, because the setter renames the first heading in place (`:271-281`);
    - with an "MCP-only update … advances to `0.12.0`" paragraph added to the v1.0.0 section (the 0.9.92 precedent in `CHANGELOG.md`), `--check` passes.
  - **The parity phrases.** The rehearsal also asserts the `mcp-version-parity` phrases (`tests/mcp-version-parity.test.js:308-314`) on the temp files. It reuses that test's rule text through a shared helper rather than a second copy, wherever practical.
- **D-21: The MCP bump is 0.11.2 → 0.12.0, a minor bump** for the `settings` tool and the optional `expect`. The current versions are in `mcp/package.json:3`, `mcp/server.json:6,20` and `mcp/src/version.ts`. PROJECT.md's "0.11.0 to 0.12.0" names a stale starting point. The transition corrects it, and Phase 71 does not edit planning-state files. If `main` publishes another MCP patch before V6, step B rebases the minor bump onto it.
- **D-22 (Auto-Resolved): The MCP README compatibility templates are generalized now.**
  - **The defect.** `setMcpReadmeSurfaces` (`sync-product-version.mjs:271-327`) always writes "`fsb-mcp-server` <mcp> requires FSB extension <current manifest> or newer for `mcp:task-status`" and "Existing `0.10.0` tool routes remain additive". So V6 step A (extension 1.0.0 with MCP 0.11.2) would be forced to state that 0.11.2 requires 1.0.0, which is false. Step B would give the wrong reason why 0.12.0 needs 1.0.0.
  - **The fix:**
    - The compatibility sentence states the MCP release's declared minimum extension version and its reason, read from one declared source per MCP version (planner's choice of source).
    - The 0.12.0 sentence says that existing tools work with extension 0.9.92 or newer, and that `settings` and `expect` need extension 1.0.0 (older extensions answer `SETTING_UNSUPPORTED` and `expect_result` `uncertain`/`extension_unsupported`; 66.1-03 and 69-06).
    - The pin `MCP ${v} requires extension ${ext} or newer` (`tests/mcp-version-parity.test.js:298`) and `tests/version-sync.test.js` move in the same commit.
    - `version:check` stays green at 0.9.92/0.11.2.
- **D-23: Compatibility for existing callers is checked by composing the existing pins, plus one reviewed delta manifest.**
  - **The manifest.** `tests/fixtures/mcp-release-delta-0.12.0.json` lists exactly:
    - one added tool, `settings`;
    - one added optional property, `expect`, on the 29 tool names of 69 D-12;
    - no new required argument on any tool;
    - the added `MCPMessageType` values from 66.1 (and any from 69/70, if the sync re-check finds them).
  - **The suite.** `tests/mcp-release-compat.test.js` diffs the built runtime's `tools/list` against the 8a058bdf fixture (`tests/fixtures/mcp-tools-list-8a058bdf.json`, through `tests/helpers/mcp-in-process.mjs`) and asserts the delta equals the manifest exactly. Any unreviewed addition fails.
  - **No re-implementation.** It does not re-check the byte goldens, the prompt and resource digests or the settings contract. Those stay with 69-01, 69-06 and 66.1-07. It asserts that their suites are registered in the `package.json` `test` chain.
  - **Old extensions.** The pairing of MCP 0.12.0 with extension 0.9.92 is covered by the 66.1-03 `SETTING_UNSUPPORTED` case and the 69-06 fill, listed by name. Live skew stays a V5 row (69).
- **D-24 (Auto-Resolved): A release-diff check ties what ships to what V4 measured.**
  - **Why it is needed.** At V4 the identity still reports extension 0.9.92 (`run-bench.mjs:969-971`), so the git SHA is the only link.
  - **The checker.** `scripts/release/check-release-diff.mjs --measured <sha> [--step A|B]` exports the measured tree to a temp directory. It copies in the release commit's CHANGELOGs and docs, applies the version setters for the step, and compares every remaining file with the release commit. Any difference outside the setter output and the docs allowlist fails. The allowlist is `*.md`, `showcase/**`, `store-assets/**`, `skills/**`, `.planning/**`, `scripts/bench/results/**` and `scripts/bench/gate/decisions/**`.
  - **Testing.** It is a CLI that runs git. Its pure path classifier is unit-tested.
  - **Consequence.** Any extension or MCP code change after V4 needs a re-measure.
  - *Amended 2026-10-16 (orchestrator decisions; plan 71-09; the owner acknowledges or rejects the narrowing as M-71-00 item 5):*
    - **The `showcase/server/**` narrowing.** `showcase/server/**` is the Fly gateway, which `deploy.yml` deploys on every push to `main`. So it is not docs, except for its `*.md` files.
      - `showcase/server/package.json` and `showcase/server/package-lock.json` are extension-setter outputs: they are listed in `extensionStructuredTargets` (`scripts/sync-product-version.mjs:16-26`) and written by `setPackageAndLock` (`:396-400`). Like every setter target, they are byte-compared after the setter runs.
      - Every other `showcase/server/**` path is forbidden, so a gateway code change after V4 fails step A and step B.
      - The rest of `showcase/**` stays docs.
    - **Commits, not the working tree.** `--release <ref>` defaults to `HEAD`. If it resolves to HEAD's commit while tracked changes are uncommitted (`git diff --quiet HEAD` exits non-zero), the CLI refuses `uncommitted_changes` (exit 2) before any export. So the V6 bump is committed first, then checked, and checked again after `origin/main` is merged in (see the M-71-10 and M-71-11 amendments in `<specifics>`).
    - **Docs under `mcp/`.** Docs-class `mcp/` paths (`mcp/README.md`, `mcp/CHANGELOG.md` and any `mcp/**/*.md`) follow the docs rule in both steps. The step-A extension setter itself rewrites lines in `mcp/README.md` (D-22).
- **D-25 (Auto-Resolved): Publish order: two merges, extension first.**
  - **Step A.** Merge Jev into `main` with extension 1.0.0 and MCP still at 0.11.2. `npm-publish.yml` skips the publish because 0.11.2 is already published. Then tag `extension-v1.0.0`, which triggers `publish-cws` when `vars.CWS_PUBLISH_ENABLED == 'true'`, or a manual upload.
  - **Step B.** After the Chrome Web Store shows 1.0.0 live, merge the MCP 0.12.0 bump, which publishes to npm `latest` through the existing workflow.
  - **Rejected alternatives:**
    - One merge would put `settings` and `expect` on `npx @latest` days before store approval. Store review takes from a few days to a few weeks (External Research 4).
    - A `next` dist-tag needs a reviewed workflow change. It is deferred.
  - **Optional.** The dashboard's deferred publishing (stage up to 30 days after approval) can be used to time step A's go-live.
- **D-26: A `count_tokens` script is built offline for V4 (supports MCP-01).**
  - **The script.** `scripts/mcp/count-tool-tokens.mjs` converts the 8a058bdf fixture and the current built `tools/list` (69-01 `scripts/mcp/lib/tools-list.mjs`) to Anthropic tool format: `name`, `description`, and `input_schema` from `inputSchema`.
  - **The calls.** It calls `POST /v1/messages/count_tokens` with `tools=` and a fixed one-line user message, for each model id given, and subtracts the count of the same request with no tools.
  - **Configuration.** It reads `ANTHROPIC_API_KEY` from the environment only and never logs it. It is proven against an injected fake fetch.
  - **Report labels.** The output is labelled an estimate. It notes that newer tokenizers count about 30% more, and that Claude Code's default tool search loads only tool names at session start (External Research 2 and 3).

### Docs (gate-independent now, gate-dependent at V6)

- **D-27 (Auto-Resolved): Docs that do not depend on the gate outcome are automated in Phase 71.**
  - **Counts become 73.** That is the `tools/list` count with `settings`, and the count includes the three registered task-lifecycle tools that today's tables omit: `complete_task`, `partial_task` and `fail_task`. The 69 that the READMEs state today is those 72 minus the three lifecycle tools, so it was already stale at the pin. Places that change:
    - `README.md:82,280` and the root category table (`tests/mcp-version-parity.test.js:327-334` pins 9 rows totalling 69);
    - `mcp/README.md:484` "Tools (69 Total)" and its tables, where the three lifecycle tools and `settings` get rows;
    - `extension/ui/onboarding.js:205,227,275` ("68 MCP tools");
    - the showcase home (`home-page.component.html:276`), agents (`agents-page.component.html:92,122`, `agents-page.component.ts:296`) and support (`support-page.component.ts:61`) copy;
    - `showcase/angular/scripts/llms-full.source.md:43`;
    - the regenerated llms outputs, through their own generator.
  - **The parity pins.** The pins in `tests/mcp-version-parity.test.js` move in the same commit. Where practical, the literal count pin is replaced with a check that the documented count equals the built `tools/list` length, so the docs cannot drift again.
  - **Locales.** Showcase units are re-extracted, and only the digits in each locale's target change in all six locale files (the memory notes on xlf line pins and byte-for-byte extraction diffs apply). First check ListAgents and `git status` for sibling sessions that might rewrite the xlf files.
  - **The `settings` row and the `expect` reference** go into the MCP README and the skill's `references/tool-decision-tree.md`. Their wording holds in both gate outcomes, for example "`settings` and `expect` arrive in fsb-mcp-server 0.12.0 and need FSB extension 1.0.0".
  - *Amended 2026-10-16 (a deviation accepted by the orchestrator; the owner acknowledges or rejects it as M-71-00 item 2, before V4; plan 71-10):*
    - **Count-free onboarding.** `extension/ui/onboarding.js` names no tool count, instead of saying 73. This covers `:205`, `:227` and `:275`, and also the MCP summary row at `:882` (`{ k: 'Tools', v: '68 available' }`), which this decision did not list.
      - onboarding.js is an extension-setter target outside the D-24 docs allowlist. If MCP 0.12.0 is withheld, a count there would force a post-V4 extension edit and a re-measure (RESEARCH Open Question 2, RESOLVED; Pitfall 12).
      - If the owner rejects the deviation, onboarding says 73, and a withheld 0.12.0 leaves stale extension copy.
    - **The other sites** still say 73.
    - **An outcome-aware count pin.** A marker sentence in the "Tool Count Contract" of `mcp/README.md` declares one of two states:
      - the documented count **includes** the tools added in fsb-mcp-server 0.12.0, so the expected count is the built `tools/list` length;
      - it **excludes** them, so the expected count is that length minus the delta manifest's `addedTools`. This state is valid only while `mcp/package.json` is below 0.12.0.

      This lets M-71-11b set the count to 72 at V6 without a test change.
- **D-28: Docs that depend on the gate outcome wait for V6** (66.1 D-22, 69-CONTEXT:404-405). These are:
  - the CHANGELOG v1.0.0 body and header line;
  - the `mcp/CHANGELOG.md` 0.12.0 entry and README "What's New In v0.12.0";
  - the showcase release-notes section;
  - any fast-mode status wording beyond Phase 68's card;
  - `expect` status if its path fails;
  - the Chrome Web Store listing and privacy form (M-68-11).

  The MCP prompt's "FSB Tool Reference (49 tools)" table is not updated in v1.0.0. It is frozen to `8a058bdf` under MCP-04 (66.1-07: `BASELINE_8A058BDF_TOOL_REFERENCE_SHA256`).

### Testing and tripwires

- **D-29: Test, tripwire and commit rules.**
  - **Before editing.** Grep `tests/` for pins (`.match(`, `.includes(`, `indexOf(`, `readFileSync`, `sha256(`) on every file Phase 71 edits, and bump the paired pins in the same commit. Watch in particular:
    - `scripts/bench/*` and `lib/*` (the 10 bench suites);
    - `report.mjs` `METHOD_NOTES` text;
    - the stats Pattern 9 block;
    - `sync-product-version.mjs`;
    - `extension/ui/onboarding.js` (5 test files);
    - the showcase components;
    - the xlf files.
  - **Test registration.** New ESM bench and gate suites join the existing `node --test tests/bench-*.test.mjs …` command at the end of `package.json` `test`. Plain-script suites are appended to the chain. Every new command is added to `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js`) in the same commit. Never edit the `PRE_PHASE6x` hashes.
  - **Runtime constraints.** Node 20 only (CI). No registered test runs git, reaches the network, or binds 7225 or 7226.
  - **After a full `npm test`.** Restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` unless a plan regenerates them on purpose (D-27).
  - **Commits.** No AI attribution.

### Claude's Discretion
- **Names.** File and function names (`release-gate-v1.0.0.json`, `evaluate-gate.mjs`, `check-release-diff.mjs`, `count-tool-tokens.mjs`, `newcombeDifference`, the infra code `condition_not_applied`, the CLI flag `--conditions`), provided the paths stay outside `.planning`.
- **The token shape for D-07,** provided it matches `TOKEN_PATTERN`, carries at least 96 bits, and passes the real scrubber test.
- **Numbers that may change before the gate is frozen,** and only before:
  - the rounds, upward only, from the D-13 simulation;
  - the exercise threshold, 40-60% (default 50%);
  - the sentinel speed band (default 0.80-1.25);
  - the non-Jev time non-inferiority bound (default 1.10).

  The completion margin (10 points), the Jev practical-effect bound (0.90) and the α (2.5% one-sided) are fixed.
- **The declared source of the per-MCP-version minimum extension version** (D-22), for example a small map in the script or a parsed line in `mcp/CHANGELOG.md`.
- **Report layout and the exact claim-sentence templates,** within D-18.
- **Whether the rehearsal reuses `mcp-version-parity` rules through a helper or asserts the phrases directly** (D-20). A helper is preferred.
- **Plan split and wave order.** A suggested order:
  1. Sync re-check, run-row v2 and condition dimension, F5 token.
  2. Statistics helpers, gate file and validator, power simulation, then freeze the gate.
  3. Evaluator, report, decision file and claims, synthetic fixtures.
  4. Version rehearsal, template generalization, compat manifest and suite, release-diff checker, `count_tokens` script.
  5. Docs counts and locales.
  6. The phase gate and `71-VALIDATION.md`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, requirements and owner decisions
- `.planning/ROADMAP.md`: the milestone header ("Compatibility", "Provider decision", "Validation Block", "Release evidence"), Phase 70 SC1-SC4, and Phase 71 SC1-SC4.
- `.planning/REQUIREMENTS.md`: EVAL-01, EVAL-02, REL-01, REL-02; MCP-03 and MCP-04; Out of Scope (no second fast-mode switch).
- `.planning/STATE.md`: "### Decisions", then "v1.0.0-specific decisions" (V1-V6; nothing reaches `main` before V6).
- `.planning/PROJECT.md:29-54`: targets (`:48`), the release line (`:40`, stale "0.11.0"), and "The version bump goes through `scripts/sync-product-version.mjs`" (`:52`).

### Upstream phase contracts (quote these names; sync re-check before execution)
- **Phase 66:**
  - `66-CONTEXT.md`: D-13 to D-18 (`:78-100`; the frozen core set, 10 rounds, the geometric-mean ratio with a hierarchical bootstrap, claim-blind outcomes, identity).
  - `66-RESEARCH.md:285-292`: results live in `scripts/bench/results/`, not `.planning`.
  - `66-11-PLAN.md:8-15,44,66,114-126`: V1 campaign ids, the runner command, run at the pin, commit only the results.
- **Phase 66.1:**
  - `66.1-CONTEXT.md:186-190`: D-21 and D-22 (docs move with the Phase 71 release; 72 tools at the pin).
  - `66.1-03-PLAN.md:186-194`: `SETTING_UNSUPPORTED` against older extensions.
  - `66.1-07-PLAN.md:15-22,60-70`: the 8a058bdf tools, prompts, resources and tool-reference digests.
  - Main-tree files: `mcp/src/tools/settings.ts`, `tests/mcp-settings-tool-contract.test.js`.
- **Phase 67:**
  - `67-CONTEXT.md` D-06 (`:97-101`, the `JEV_ENABLED` operator switch) and D-27/D-28 (thresholds; act only when calibrated).
  - `67-02-PLAN.md:1-60`: the predeclared-spec precedent (`targets.json` plus an exact-key validator, written before V3).
  - `67-VALIDATION.md:27`: shallow-clone CI; no registered test runs git.
  - 67-01: `CONTRACT.FALLBACK_REASONS` and the scrubber's high-entropy rule.
- **Phase 68:**
  - `68-CONTEXT.md` D-01 (the off path equals the pin), D-04 (`fsbJevFastModeEnabled`, not in `fsb://config`), D-05, D-23 (cost never folded), `:457` (V4 goes through `run_task`).
  - `68-01-PLAN.md:29,179-183`: the key and the settings route.
  - `68-08-PLAN.md:23,85,147`: `fsbJevCaptureArmed`; `export-capture.mjs --arm off`.
  - `68-09-PLAN.md:63`: the `jevMeasurement` v1 shape.
  - `68-RESEARCH.md:385` (F5), `:839`.
  - `68-VALIDATION.md:170` (M-68-05), `:96` (the meta-key watch item).
- **Phase 69:**
  - `69-CONTEXT.md` D-02 (72 at the pin), D-12 (the 29 `expect` tools), D-22 (SC3 contracts), `:404-405` (docs move to Phase 71/V6).
  - `69-01-PLAN.md:8-20,185-196`: the fixture, `scripts/mcp/lib/tools-list.mjs`, `tests/helpers/mcp-in-process.mjs`, the shape freeze.
  - `69-06-PLAN.md:26,56,101-171`: no-`expect` goldens and the version-skew fill.
  - `69-08-PLAN.md`: user-facing counts are unchanged until Phase 71.
  - `69-VALIDATION.md:192-206`: `count_tokens` (V4), skew (V5), release (V6).
- **Phase 70:** `.planning/ROADMAP.md` Phase 70 (no plans yet; D-09 lists what Phase 71 assumes).

### Research
- `.planning/research/PITFALLS.md`: Pitfall 2 (`:83-102`: a benchmark that cannot show the effect; hosts ship weekly) and the per-decision vs whole-task trap (`:470-480`).
- `.planning/research/JEV-REFERENCE.md`: "Browser agents prove speed and cost, not success".

### Code (planning worktree at `e1e6439c`; bench code is unchanged since the pin)
- `scripts/bench/lib/runs.mjs`: `RUN_ROW_KEYS` `:35-39`, `ARMS` `:53`, `buildSchedule` `:132-164`, `claimedBlock` `:408`, `checksBlock` `:419-425` (drops `detail`), `toCommittedRow` `:437`, `validateCommittedRow` `:509` (`schemaVersion === 1`).
- `scripts/bench/lib/stats.mjs`: `geoMeanMedianRatio` `:34-51`, `wilson` `:52-56`, `aaNoiseFloor` `:79-90`.
- `scripts/bench/report.mjs`: `ARM_ORDER` `:47`, `METHOD_NOTES` `:50-59`, `summarizeArm` `:233`, `buildSummary` `:340`.
- `scripts/bench/run-bench.mjs`:
  - `runAutopilotArm` `:555-591`;
  - the claimed block and raw record `:769-830`;
  - `collectIdentity` `:943-1018`;
  - `stableIdentity` `:1025-1041`;
  - `DEFAULT_SEED = 66` `:108`.
- `scripts/bench/lib/outcome.mjs`: `checkRequest` (`detail: {matched, expected}`).
- `scripts/bench/lib/cdp.mjs:377-396`: `readExtensionStorageFlag`.
- `scripts/bench/lib/mcp-client.mjs:257-291`: `runTaskTimed`.
- `scripts/bench/lib/claude-arm.mjs:60-97`: the env allowlist and `ENABLE_TOOL_SEARCH`.
- `scripts/bench/lib/tasks.mjs:461-471`: `renderInstruction`.
- `scripts/bench/fixture-server.mjs:50,415-416`: `TOKEN_PATTERN` and `newRunToken`.
- `scripts/bench/tasks/core/*.json` and `core.lock.json`: frozen through Phase 71; every core task has a total-count request check.
- `scripts/sync-product-version.mjs`: `:9-11` (`FSB_VERSION_SYNC_ROOT`), `:201-227`, `:271-327`, `:366-455`, `:460-618` (`:562` header line), `:620-635`.
- `tests/version-sync.test.js:39-97`.
- `tests/mcp-version-parity.test.js:266-281,290-336`.
- `tests/bench-report.test.mjs:76-90,207-209`.
- `.github/workflows/npm-publish.yml:4-7,50-66,258`, `chrome-extension.yml:3-19,100-120`, `deploy.yml:3-11`.
- `mcp/README.md:41-46,484-590,665-690`; `README.md:82,280`; `CHANGELOG.md:1-14` (the "MCP-only update" precedent); `mcp/CHANGELOG.md:1-20`.
- `extension/ai/agent-loop.js:2912`: `meta_cognitive_loop_break`.

### External (fetched 2026-10-15)
- Chrome Web Store publishing (deferred publishing, a 30-day staging window): https://developer.chrome.com/docs/webstore/publish ; review times: https://developer.chrome.com/docs/webstore/review-process
- npm dist-tags: https://docs.npmjs.com/cli/v10/commands/npm-dist-tag
- Anthropic token counting: https://platform.claude.com/docs/en/build-with-claude/token-counting
- Claude Code version pinning and auto-update: https://code.claude.com/docs/en/setup ; tool search and `ENABLE_TOOL_SEARCH`: https://code.claude.com/docs/en/mcp (section "Scale with MCP tool search")
- Few-cluster bootstrap coverage: https://www.econ.queensu.ca/research/working-papers/1315 ; Newcombe hybrid score: https://metricgate.com/docs/newcombe-difference-interval/ ; clustered non-inferiority: https://pmc.ncbi.nlm.nih.gov/articles/PMC2717020
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The bench runner** already gives the comparison most of what it needs:
  - a seeded ABBA schedule;
  - claim-blind outcomes (the fixture request log, final URL, markers);
  - infra codes that are excluded from denominators and pause the campaign;
  - per-run raw records under the gitignored `.local` tree, with committed sanitized rows;
  - identity with resume checks.

  Phase 71 extends it and does not replace it.
- **Statistics.** `geoMeanMedianRatio`, `wilson`, `aaNoiseFloor` and `mulberry32` are pure and seeded. The new `newcombeDifference` sits beside them, outside the verbatim block.
- **Raw evidence already holds what safety needs.** The raw record keeps `outcome.checks[].detail` (`matched`/`expected`) and the request log. Only the committed row drops them (`checksBlock`).
- **CDP storage reads** (`readExtensionStorageFlag`) and the 68-08 `export-capture.mjs --arm` pattern for writes.
- **The version setter's temp-root mode** (`FSB_VERSION_SYNC_ROOT`) and its test pattern.
- **69-01 helpers** (main tree): `tests/fixtures/mcp-tools-list-8a058bdf.json` (72 tools), `scripts/mcp/lib/tools-list.mjs`, `scripts/mcp/tools-list-baseline.mjs`, `tests/helpers/mcp-in-process.mjs`, `tests/mcp-tools-list-shape-freeze.test.js`.

### Established Patterns
- **Exact-key validators with parity tests** (gotcha 6). Rows, the gate file and the decision file each get one.
- **Predeclared, committed specs** with a validator (67-02 `targets.json`). Refuse rather than guess.
- **Missing values are `null`, never 0. Every cost carries a source label.** FSB-borne and user-borne cost are never mixed.
- **Committed artifacts carry no URL, page text or secret** (`walkStrings` rejects `://` and strings longer than 200 characters).
- **CLI pattern.** `main(argv, overrides)` with injected deps. Exit codes 0 ok, 1 invalid, 2 usage, 75 paused.

### Integration Points and Known Pins
- **`scripts/bench/lib/runs.mjs`, `report.mjs` and `run-bench.mjs`.** The 10 `tests/bench-*.test.mjs` suites pin keys, codes, flags and method text. The v1 key pin stays as it is, and v2 gets new pins.
- **`scripts/bench/fixture-server.mjs`.** `tests/bench-fixture-server.test.mjs` covers the token pattern.
- **`scripts/sync-product-version.mjs`.** `tests/version-sync.test.js` (in `pretest`) and `tests/mcp-version-parity.test.js:298,308-336`.
- **Docs and copy.** `README.md`, `mcp/README.md`, `extension/ui/onboarding.js`, the showcase home, agents and support components, the llms sources and outputs, and `showcase/angular/src/locale/messages*.xlf`. All of these are in `liveToolCountSources` (`tests/mcp-version-parity.test.js:266-281`). Showcase extraction is diffed byte-for-byte in CI.
- **`package.json` `test`** (the bench ESM command at the end) and `REFINEMENT_ROOT_TEST_COMMANDS`.
- **No edits** to `mcp/src`, `mcp/build`, `extension/ai`, `extension/ws`, `extension/content` or `showcase/server`.
</code_context>

<specifics>
## Specific Ideas

- **Owner direction.**
  - "A path that fails its predeclared gate remains experimental or disabled."
  - "The project brief's 1.5-2x autopilot and 1.3-1.6x MCP speedups are targets to measure, not results already achieved" (ROADMAP "Release evidence").
  - Every validation is deferred to V1-V6 (2026-10-15).
  - With Jev disabled, FSB behaves exactly as before.
- **The three columns, in one sentence each.**
  - Baseline: FSB at `8a058bdf`, before this milestone.
  - Control: the release candidate with the switch off.
  - Fast: the same build with the switch on, interleaved run by run with control.
- **Why the safety rule has two parts.** The LLM path can double-submit on its own. Charging every such event to fast mode would fail it for the LLM's behaviour. Ignoring them would hide a fast-mode duplicate. So any event in a run where Jev acted is decisive (rule a), and other events are judged against control (rule b).
- **Why ITT.** A user who turns the switch on gets the whole-task result, including the runs where Jev declines. Measuring only the runs where Jev acted would overstate the benefit.
- **The step-A trap found while reading the setter.** With today's templates, `npm run version:set:extension -- 1.0.0` at MCP 0.11.2 rewrites `mcp/README.md` to say that MCP 0.11.2 requires extension 1.0.0, and `--check` then requires that false sentence (D-22).
- **The count discrepancy found while reading the READMEs.** The documented "69" is the 72 pin tools minus `complete_task`, `partial_task` and `fail_task`. Those three are registered handlers, so by the README's own "Tool Count Contract" the count was already stale. 73 includes them and `settings` (D-27).
- **Exact Validation Block commands** (for `71-VALIDATION.md`; flags beyond 66-11 are the Phase 71 additions):
  - **M-71-01 (V1, before the V1 campaign): pin Claude Code without touching the everyday install.**
    1. Download the current release's platform binary from `https://downloads.claude.ai/claude-code-releases/<X.Y.Z>/`.
    2. Verify its SHA-256 against `manifest.json` (signature per the docs).
    3. Place it at `~/.fsb-bench/claude/<X.Y.Z>/claude`.
    4. Run every V1 and V4 bench command with `PATH="$HOME/.fsb-bench/claude/<X.Y.Z>:$PATH"`.
    5. Confirm that `claude --version` prints `<X.Y.Z> (Claude Code)`.
    6. Record `<X.Y.Z>`, the `--claude-model` value and the `--claude-tool-search` value (default unset) in the V1 notes.
  - **M-71-02 (V1, after 66-11 commits the results in the pin worktree).**
    1. `git -C <pin-worktree> log -1 --format=%H -- scripts/bench/results/` gives `<results-sha>`.
    2. `git -C <pin-worktree> show --stat <results-sha>` must list only `scripts/bench/results/*-baseline-66/**`.
    3. On Jev: `git cherry-pick <results-sha>`.
    4. Then `node scripts/bench/report.mjs scripts/bench/results/core-baseline-66` must exit 0 under the v2 validator.
  - **M-71-03 (V1, cross-check).** `scripts/bench/results/core-baseline-66/identity.json` records `hosts.claude.version` equal to M-71-01's version, and `git.sha` equal to `8a058bdf…`.
  - **M-71-04 (V3).**
    1. After the calibrated profile is committed and deployed, run a one-round smoke: `node scripts/bench/run-bench.mjs --smoke --pair-via-cdp --arms autopilot --conditions on …`.
    2. Read the raw records' `jevMeasurement`. It must show `calibrationStatus: 'calibrated'` and at least one fast step on at least one fixture, with 0 `sensitive_goal` fallbacks.
    3. If no fast step acts anywhere, V4 will be `not_exercised`, so stop and review the V3 profile.
  - **M-71-05 (V4 preconditions).**
    - Jev is at the release-candidate SHA, and every phase is complete.
    - `npm run validate:extension && npm test` is green at that SHA, with 7225 free and the crawler files restored.
    - `node --test tests/bench-gate.test.mjs` is green, so the gate hash is pinned.
    - V2 is live with `JEV_ENABLED` on.
    - The candidate build is loaded unpacked in the bench profile (66-10 procedure).
    - `node scripts/bench/shadow/export-capture.mjs --arm off --port <p> --extension-id <id>` has run.
    - The Claude bench binary is the one pinned in M-71-01.
  - **M-71-06 (V4).** Run under `caffeinate -i`:

    ```
    node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms autopilot --conditions off,on --rounds 20 --seed 71 --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-gate-71-autopilot
    ```

    Resume with `--resume core-gate-71-autopilot` after exit 75.
  - **M-71-07 (V4).** Run under `caffeinate -i` with the M-71-01 PATH:

    ```
    node scripts/bench/run-bench.mjs --campaign --pair-via-cdp --arms claude --conditions off --rounds 10 --claude-model <V1 model> --gate scripts/bench/gate/release-gate-v1.0.0.json --expect-extension-id <id> --chrome-profile "$HOME/.fsb-bench/chrome-profile" --campaign-id core-gate-71-claude
    ```
  - *M-71-06 and M-71-07 amended 2026-10-16 (orchestrator decisions; 71-VALIDATION.md M-71-06 and M-71-07 are authoritative).* Three changes:
    - **Rounds and seeds.** `--rounds` is the gate's `minRounds` for that campaign, not 20 or 10. The Claude campaign passes `--seed 66`.
    - **The preflight.** The D-11 amendment's `gate_campaign_mismatch` preflight refuses any other argument set before a client opens.
    - **Resuming.** A bare `--resume <id>` is refused. `stableIdentity` compares the rebuilt schedule's rounds, arms and seed with the saved identity (`scripts/bench/run-bench.mjs:1025-1040`, refused `resume_identity_mismatch` at `:1354-1359`), and the gate preflight checks the arguments again. So run the exact resume command the runner prints on a pause (`run-bench: resume with: …`, `:921`). That command is built by `buildResumeCommand`, which keeps every argument (`:362-374`). After a Ctrl-C no command is printed: rerun the original command with `--campaign-id <id>` replaced by `--resume <id>`.
  - **M-71-08 (V4).**
    1. Run `node scripts/bench/report.mjs` on both campaign directories.
    2. Run the evaluator:

       ```
       node scripts/bench/gate/evaluate-gate.mjs --gate scripts/bench/gate/release-gate-v1.0.0.json --baseline scripts/bench/results/core-baseline-66 --campaign scripts/bench/results/core-gate-71-autopilot --campaign scripts/bench/results/core-gate-71-claude --verify-suites --out scripts/bench/gate/decisions/core-gate-71.json
       ```

    3. Commit only the results and the decision file.
    4. If the sentinel trips, the owner decides whether to run the fallback `core-rebaseline-71`.
  - **M-71-09 (V4).** Run `ANTHROPIC_API_KEY=… node scripts/mcp/count-tool-tokens.mjs --model <V1 Claude model> [--model …]`. Record the baseline and new tool-list tokens and the ratio beside the 69 budget estimate, and say whether "more than half" is met.
  - **M-71-10 (V6, step A, extension).**
    1. The owner approves `decisions/core-gate-71.json`.
    2. If the Jev path failed safety: `fly secrets set JEV_ENABLED=false`, then confirm the gateway answers `disabled`.
    3. Write the `CHANGELOG.md` `## v1.0.0 — … — <date>` entry from the "Release claims" section. It says "align at `1.0.0`" and "stays at `0.11.2`". Update the header line to "The extension version is `1.0.0`".
    4. Run `npm run version:set:extension -- 1.0.0`.
    5. Run `npm run version:check && npm run validate:extension && npm test`, then restore the crawler files.
    6. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step A`.
    7. Commit with no AI attribution.
    8. Merge Jev into `main`. This triggers `deploy.yml`, `chrome-extension.yml`, and `npm-publish.yml`, which skips the publish.
    9. Submit the Chrome Web Store privacy form and listing (M-68-11).
    10. Run `git tag extension-v1.0.0 <merge-sha> && git push origin extension-v1.0.0`, or upload manually with deferred publishing.
    11. Wait until the store shows 1.0.0 live.
    - *Amended 2026-10-16 (the D-24 review fix; 71-VALIDATION.md M-71-10 is authoritative).* The release-diff checker compares commits, never the working tree, so steps 6-8 above are replaced by this order:
      1. Write the gate-dependent docs (D-28) before step 5, so that they go into the commit.
      2. Commit the bump, the CHANGELOG and the docs, with no AI attribution. `git status --short` must be empty afterwards.
      3. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step A`. `--release` defaults to `HEAD`, and the checker refuses `uncommitted_changes` if anything is left uncommitted.
      4. Run `git fetch origin main`. While `git log --oneline Jev..origin/main` prints anything:
         - merge `origin/main` into Jev;
         - rerun step 5 and the check.

         A non-docs violation from a main-only commit is a re-measure decision for the owner, never a waiver.
      5. Push Jev and merge it through the pull request. Merge only when both hold:
         - the pull request's CI checks are green, including `showcase (build + crawler smoke)` and `all-green` (`.github/workflows/ci.yml:140-191`). The showcase job runs `npm --prefix showcase/angular run test:ci`, the extraction diff and the production build, which plan 71-11 defers to CI;
         - `Jev..origin/main` is still empty.
      6. Record the check against `--release origin/main` in the V6 notes.
  - **M-71-11 (V6, step B, MCP; skipped if the non-Jev MCP path did not pass).**
    1. Branch from `main`.
    2. Write `mcp/CHANGELOG.md` `<a id="v0.12.0"></a>` / `## 0.12.0 (<date>)` naming `fsb-mcp-server@0.12.0`.
    3. Add `### What's New In v0.12.0` above v0.11.2 in `mcp/README.md`.
    4. Add "MCP-only update (<date>): the package advances to `0.12.0` …" to the `CHANGELOG.md` v1.0.0 section.
    5. Run `npm run version:set:mcp -- 0.12.0 && npm --prefix mcp run build && npm run version:check && npm test`.
    6. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step B`.
    7. Merge to `main`, which publishes to npm `latest` and creates the `mcp-v0.12.0` tag and release.
    8. Verify with `npm view fsb-mcp-server dist-tags.latest`, which must print `0.12.0`.
    - *Amended 2026-10-16 (the D-24 review fix; 71-VALIDATION.md M-71-11 is authoritative).* Four changes:
      - **README.** Step 3 also moves the single `- **Compatibility:**` bullet into the new section (Pitfall 5).
      - **Commit before the check.** Step 5's bump is committed before step 6, together with the six force-tracked `mcp/build` files and `mcp/native-host/runtime-integrity.json`. Step 6 then runs on `HEAD`, with the `uncommitted_changes` refusal.
      - **Catch up with `main`.** Right before merging, merge or rebase `origin/main` in and rerun steps 5 and 6, until `HEAD..origin/main` is empty.
      - **Merge.** Merge only after the pull request's CI checks are green, including `all-green`. After the merge, record the check against `origin/main` in the V6 notes.
</specifics>

<deferred>
## Deferred Ideas

- **A side-panel or dashboard start-path driver.** One option is the CDP-evaluated `globalThis.fsbDispatchInternalMessage` `startAutomation` with no `source`. Revisit if Phase 70 gives `run_task` its own budgets or exits that differ from autopilot.
- **A per-path release-state constant** that disables `source: 'mcp'` fast runs alone. It is not needed while both Jev verdicts come from one comparison (D-17).
- **An npm `next` dist-tag publish step,** which needs a reviewed workflow change. Also a Chrome Web Store staged rollout by percentage (`setPublishedDeployPercentage`).
- **Automated build-swap tooling** for the fallback re-baseline (D-06). It is a manual V4 procedure if needed.
- **Gating on the live set or the Cursor driver.**
- **Updating the MCP prompt's "FSB Tool Reference (49 tools)" table.** It needs a reviewed MCP-04 exception in a later milestone.
- **Product handling of URL-bearing user goals for Jev** (`sensitive_goal` on real tasks). This is Phase 70 or later. Phase 71 fixes only the bench token.
- **Refining the jev meta-attempt key** if V4 shows `meta_cognitive_loop_break` stops on progressing single-URL flows (M-68-05).
- **`count_tokens` for hosts other than Claude Code.**

### Reviewed Todos (not folded)
None.
</deferred>

---

*Phase: 71-comparative-gate-and-release*
*Context gathered: 2026-10-15*
