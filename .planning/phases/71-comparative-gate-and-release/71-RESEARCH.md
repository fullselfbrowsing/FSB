# Phase 71: Comparative Gate and Release - Research

**Researched:** 2026-10-15
**Domain:** Benchmark comparison tooling, predeclared statistical release gate, release preparation (version setters, MCP compatibility, docs counts) for a Node/MV3/MCP monorepo
**Confidence:** HIGH for the code facts (read in the planning worktree at `e1e6439c` and the main tree at `2da8c5dc`), the statistics (computed here) and the F5 fix. MEDIUM for upstream interfaces that are only planned (67, 68, 70). LOW for numbers that depend on V1 data that does not exist yet.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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
- **D-16: The "exercised" precondition.** A Jev path is judged only if all of these hold in `core-gate-71-autopilot`:
  - every acted attempt reports `calibrationStatus: 'calibrated'`;
  - there is exactly one (`servedModel`, `instrumentVersion`) pair across the campaign;
  - at least 50% of counted `on` runs have `jev.acted`;
  - every run's capture-arm readback was false;
  - no `off` run shows Jev activity.

  Otherwise the verdict is `not_exercised`, which is inconclusive and never a pass. The report lists `sensitive_goal` and the other fallback reasons by count.
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

### Deferred Ideas (OUT OF SCOPE)

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
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-01 | An operator can compare whole-task completion rate, wall time per completed task, and cost across baseline, fast mode, and a non-Jev control on the same task set. | The bench already has the seeded ABBA schedule, claim-blind outcomes, infra exclusion and identity (`runs.mjs:132-164`, `outcome.mjs:155-178`, `run-bench.mjs:943-1041`). Phase 71 adds four things. (1) A `conditions` slot dimension that keeps V1 schedules byte-identical (Pattern 1). (2) A pre-t0 switch write and an independent CDP readback (Pattern 2). (3) An additive v2 row (Pattern 3). (4) A report and evaluator that group rows by (arm, condition). `report.mjs` groups by arm only (`report.mjs:233`, `:352-356`), so without this the two conditions would be pooled. F5 is fixed by a lowercase-only token: 0 of 24,000 rendered goals are flagged, against 16,580 of 24,000 with today's base64url token (F5 Finding). Completion intervals use `newcombeDifference` on top of the existing `wilson`. The values were verified against the published Newcombe (1998) method-10 examples (Code Examples). |
| EVAL-02 | Fast-mode release evidence reports pass or fail against predeclared speed, completion, and safety criteria; failed criteria keep the affected fast path experimental or disabled rather than being reported as a win. | Pieces: a gate JSON plus an exact-key validator plus a sha256 pin (the 67-02 `targets.json` precedent, `67-02-PLAN.md:62-82`); a pure evaluator in `scripts/bench/gate/lib/` and a CLI shell with injected git; the decision file; a claims builder that takes numbers as typed tokens so their source can be checked. The pin at `tests/bench-report.test.mjs:1122` forbids any `geoMeanMedianRatio(` call in `report.mjs`, so every comparison must live in the gate library. **The power simulation shows that the D-04 round counts are not enough** for the Claude completion criterion or the sentinel (Pitfall 1). This decides the round numbers frozen into the gate. |
| REL-01 | The extension is versioned as 1.0.0 through a `CHANGELOG.md` v1.0.0 entry followed by `npm run version:set:extension -- 1.0.0`. | The setter refuses without `## v1.0.0` as the first `## vX.Y.Z` heading (`sync-product-version.mjs:201-227`). `--check` also needs "The extension version is `1.0.0`" (`:562`), a line the setter never writes. Generalizing D-22 must change both the template (`:279-301`) **and** the `--check` phrase at `:551`, which today uses the current *extension* version. A temp-root rehearsal follows `tests/version-sync.test.js:39-46,114-133`. The real bump is a V6 step. |
| REL-02 | The MCP package receives the planned minor version bump for its additive optional parameters and the new settings tool, with compatibility checks against existing callers. | The 69-01 shape freeze already allows exactly `expect` on 29 tools plus `settings` (`tests/mcp-tools-list-shape-freeze.test.js:13-21`). The compat suite composes with it: it adds a reviewed delta manifest, a "no new required argument" assertion and an `MCPMessageType` delta (`mcp/src/types.ts` adds only `mcp:get-settings` and `mcp:set-setting` since the pin). Other parts: a rehearsal of `version:set:mcp -- 0.12.0`, a release-diff checker, and `count_tokens` (`POST /v1/messages/count_tokens`, free, rate-limited) behind an injected fake fetch. |
</phase_requirements>

## Summary

Phase 71 extends the Phase 66 bench rather than replacing it. Most of what the comparison needs already exists in `scripts/bench/`:
- a seeded ABBA schedule;
- outcomes judged from fixture evidence rather than agent claims;
- infra-error exclusion and pausing;
- per-run raw records with committed, sanitized rows;
- campaign identity with resume checks.

Phase 71 adds:
- a run-condition dimension;
- an additive v2 row;
- a fast-mode exposure (`jev`) block and a safety block computed from the raw evidence before it is dropped;
- a separate gate library under `scripts/bench/gate/` that holds every cross-condition and cross-campaign comparison.

The last point is required, not stylistic. `tests/bench-report.test.mjs:1122` fails if `report.mjs` ever calls `geoMeanMedianRatio(` or mentions a cross-arm ratio. All of it is Node built-ins plus existing repo modules. No new package is installed.

The most important finding is statistical, and it changes what gets frozen into the gate. I simulated D-13's Newcombe non-inferiority test (margin 10 points, one-sided α 2.5%) at the D-04 sizes:

| Criterion | Sizes | Result at completion rates 0.80 / 0.85 / 0.90 | Gate threshold |
|---|---|---|---|
| Claude non-Jev path, completion power | 10 rounds vs 10 (V1 vs V4) | 0.50 / 0.58 / 0.70 | needs ≥ 0.8 |
| Jev path (on vs off), completion power | 20 rounds each | 0.78 / 0.86 / 0.95 | needs ≥ 0.8 |
| Autopilot drift sentinel (±10-point equivalence), chance of passing when nothing drifted | 10 (V1) vs 20 (V4 off) rounds | 0.23 / 0.42 / 0.67 | — |

The sentinel result means it would trip and block the non-Jev MCP verdict most of the time from noise alone.

D-13 already says the rounds go up and the margin never moves. The V1 baseline round count (66-11 defaults to 10) is one of the inputs, though, and V1 has not run yet. So the frozen gate has to declare minimum V1 rounds, and the V1 Manual-Only row has to pass `--rounds N`. At p = 0.85, about 30 rounds per arm in both V1 and V4 is needed (sentinel 0.92, Claude completion 0.96). That doubles or triples live spend, which is an owner decision (Open Question 1).

**Primary recommendation:** Plan in this order:
1. sync re-check;
2. bench conditions, the v2 row and the F5 token;
3. statistics, the power simulation, then the gate freeze;
4. evaluator, decision file and claims, proven on synthetic campaigns;
5. release tooling;
6. docs;
7. VALIDATION.

Freeze the round counts from the simulation, including the V1 minimum. Keep every comparison out of `report.mjs`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Run-condition scheduling (off/on slots, run ids) | Bench runner (Node CLI on the operator's machine) | — | `buildSchedule` is pure and seeded (`runs.mjs:132-164`). The condition is a schedule property, not product state. |
| Setting the fast-mode switch per run | MCP server (`settings` tool, 66.1) → Extension storage | Bench runner orchestrates | The product path (D-04, SET-02). The runner calls the tool through its own MCP client before t0. |
| Verifying the switch value | Bench runner over CDP | Extension service worker | An independent read of `chrome.storage.local` (`cdp.mjs:377-396`) that does not trust the tool's answer. |
| Fast-mode exposure and cost evidence (`jevMeasurement`) | Extension (68-09 projection through `get_session_detail`) | Bench runner records it raw | FSB produces it. The bench only copies an allowlisted summary into the row. |
| Safety evidence (duplicate submits, unexpected mutations) | Fixture server request log | Bench row (`safety` block) | Claim-blind evidence that already exists (`fixture-server.mjs:10-33`, `outcome.mjs:97-112`). |
| Statistics and the verdict | Gate evaluator (offline Node library) | — | Pure functions with no clock, environment or filesystem access. Must not live in `report.mjs` (pin at `bench-report.test.mjs:1122`). |
| Predeclaration proof | Git history (author or commit date of the gate file) | Gate hash recorded in campaign identity | Only the evaluator CLI runs git. Tests inject a fake git. |
| Release consequence | Operator at V6 (Fly secret, npm publish order) | Decision file (data) | No new product switch (D-17). |
| Version surfaces | `scripts/sync-product-version.mjs` | Release notes authored by the owner at V6 | The setter owns every version string (`:15-55` target lists). |
| Docs and tool counts | Static docs, showcase templates, locale catalogs | `extension/ui/onboarding.js` copy | Static copy. The xlf catalogs are diffed by CI (`ci.yml:168-172`). |

## Standard Stack

### Core (all existing; nothing new to install)

| Library / module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (`node:crypto`, `node:fs`, `node:path`, `node:child_process`, `node:test`, `node:assert/strict`, global `fetch`) | CI Node 20 (`ci.yml`), local 24.14.1 | All new scripts and tests | The bench rule is no new dependencies (66 D-13) [VERIFIED: `run-bench.mjs:1-50` doc block; `node --version`] |
| `scripts/bench/lib/stats.mjs` | repo | `geoMeanMedianRatio`, `wilson`, `aaNoiseFloor`, `mulberry32`, `summarize` | Seeded and pure. The "Pattern 9 (verbatim)" block (`:18-56`) must not be edited. Add `newcombeDifference` after `// --- end Pattern 9` [VERIFIED: file read] |
| `scripts/bench/lib/runs.mjs` | repo | Schedule, rows, validators, infra codes | The single producer and validator of rows [VERIFIED] |
| `scripts/bench/lib/identity.mjs` | repo | `sha256Hex`, `canonicalJson`, `toolsListDigest` | Reuse for gate hashes and tools-list digests [VERIFIED: re-exported by `scripts/mcp/lib/tools-list.mjs:16-19`] |
| `scripts/mcp/lib/tools-list.mjs` + `tests/helpers/mcp-in-process.mjs` (69-01, main tree) | repo | In-process `tools/list` of the built runtime; 8a058bdf fixture; `projectShape`; `EXPECT_TOOL_NAMES_VERBATIM` | Never runs git, safe in shallow CI [VERIFIED: main tree `scripts/mcp/lib/tools-list.mjs:1-30`, `tests/helpers/mcp-in-process.mjs:1-35`] |
| `@modelcontextprotocol/sdk` | 1.29.0 (in `mcp/node_modules`) | MCP client for the runner and the in-process listing | Already pinned by 66 D-13 [VERIFIED: `mcp/node_modules/@modelcontextprotocol/sdk/package.json`] |
| `scripts/sync-product-version.mjs` | repo | Every version write and `--check`; `FSB_VERSION_SYNC_ROOT` temp-root mode (`:9-11`) | The only sanctioned version path (PROJECT.md:52) [VERIFIED] |
| Anthropic `POST /v1/messages/count_tokens` | API (`anthropic-version: 2023-06-01`) | V4 tool-list token counts (D-26) | Free, and rate-limited by tier [CITED: platform.claude.com/docs/en/build-with-claude/token-counting] |
| Angular CLI `ng extract-i18n` | showcase devDependency (present) | Re-extract `messages.xlf` after copy edits | CI diffs the output byte-for-byte [VERIFIED: `.github/workflows/ci.yml:168-172`] |

### Supporting

| Tool | Purpose | When to Use |
|---------|---------|-------------|
| `scripts/bench/lib/cdp.mjs` `readExtensionStorageFlag` | Strict-true read of a storage key (`true` only for strictly true; `false` when false or absent; `null` when unreachable) | Readback of `fsbJevFastModeEnabled` and `fsbJevCaptureArmed` before each run [VERIFIED: `cdp.mjs:372-396`] |
| `showcase/angular/scripts/build-crawler-files.mjs` (`prebuild`) | Regenerates `public/llms.txt`, `llms-full.txt`, `sitemap.xml` from the `.source.md` files | Only when the docs plan regenerates llms on purpose (D-27). Otherwise restore after `npm test` |
| `npx --offline -y node@20` | Node 20 check of new suites | Per-suite CI parity (present locally: v20.20.2) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Newcombe hybrid score on pooled runs | A task-stratified test such as CMH or a stratified Newcombe | Tighter when task rates vary, but more code and a different statistic than D-13 locked. My simulation shows pooled Newcombe coverage of 0.95-0.967 with heterogeneous task rates, so pooling is conservative as D-13 states [VERIFIED: local simulation] |
| `git archive` for the release-diff export | `git worktree add` | A worktree registers state in `.git/worktrees`; `git archive <sha> \| tar -x -C <tmp>` leaves no trace |
| A setter-local map for the per-MCP-version minimum extension | Parsing `mcp/CHANGELOG.md` prose | The prose parse is brittle ("Extension compatibility remains FSB 0.9.92 or newer" is free text). A frozen map with a "patch inherits" rule is testable (Pattern 9) |

**Installation:** none. No package is added.

**Version verification:** not applicable, because no new packages are introduced. The SDK version (1.29.0) was confirmed from `mcp/node_modules`.

## Package Legitimacy Audit

No external packages are installed by this phase. Every new file uses Node built-ins and existing repository modules. The bench's "no new dependencies" rule (66 D-13) applies.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                      (V1, pin 8a058bdf worktree)                (V4, release-candidate SHA on Jev)
 core tasks + lock ──► run-bench --campaign ──► results/core-baseline-66/   run-bench --campaign --conditions off,on --gate G
 (frozen, 12)            arms autopilot,claude      identity.json (schema 1)        │
                                                    runs.jsonl  (schema-1 rows)     ├─ per slot, BEFORE t0:
                               │  cherry-pick (M-71-02)                             │    settings{key:fsbJevFastModeEnabled,value}
                               ▼                                                    │    CDP readback == expected?  ── no ──► infra condition_not_applied (pause)
                         Jev branch ◄─────────────────────────────────────────────  │    CDP fsbJevCaptureArmed == false? ─ no ─► refuse/pause
                                                                                    ├─ t0 ─ run_task / host CLI ─ t1   (runner clock = wallMs)
                                                                                    ├─ evidence: fixture request log + final URL + markers
                                                                                    ├─ get_session_detail ─► measurement + jevMeasurement (68-09)
                                                                                    └─ raw record (.local) ─► v2 row {condition, jev, safety, endLabel}
                                                                                             │
             results/core-baseline-66 ──────────┐                                            ▼
                                                 ├──► evaluate-gate.mjs (CLI: git date check, gate sha check,
             results/core-gate-71-autopilot ─────┤        dirty/measured-SHA check, --verify-suites)
             results/core-gate-71-claude ────────┘                 │
                                                                   ▼
                                       gate/lib/evaluate.mjs (pure) ── identity match? ─ no ─► inconclusive
                                         │  exercised precondition (D-16) ─ no ─► not_exercised
                                         │  speed (geoMeanMedianRatio, A/A floor)  completion (Newcombe)  safety (rules a/b)
                                         ▼
                           decisions/core-gate-71.json  +  gate report (claims section)
                                         │
                                         ▼  (V6, owner-approved)
                    pass ► ship as built │ fail speed/completion/inconclusive ► ship experimental, no speed claim
                    fail safety ► fly secrets set JEV_ENABLED=false │ non-Jev MCP fail ► withhold MCP 0.12.0
                                         │
                       check-release-diff.mjs --measured <V4 sha> --step A|B  ──► merge to main (step A, then B)
```

### Recommended Project Structure

```
scripts/bench/
├── lib/runs.mjs            # + conditions in buildSchedule, RUN_ROW_KEYS_V2, v2 producer/validator, safety + jev blocks
├── lib/stats.mjs           # + newcombeDifference (after the Pattern 9 block)
├── report.mjs              # groups by (arm, condition); NO cross-condition ratio (pin bench-report.test.mjs:1122)
├── run-bench.mjs           # + --conditions, --gate, pre-t0 condition apply/readback, raw jevMeasurement
├── fixture-server.mjs      # newRunToken(): 24 lowercase letters (F5)
└── gate/
    ├── release-gate-v1.0.0.json   # frozen before V1 (sha256-pinned)
    ├── lib/gate.mjs               # exact-key validator + loadGate (sha256 of raw bytes)
    ├── lib/evaluate.mjs           # pure: verdicts, decision object, claims
    ├── lib/synthetic.mjs          # seeded synthetic campaign generator (tests + power script)
    ├── simulate-power.mjs         # full power/coverage simulation (CLI; numbers go in gate notes)
    ├── evaluate-gate.mjs          # CLI shell: git checks (injected), suites, writes decision + report
    └── decisions/                 # written at V4 only
scripts/release/
├── check-release-diff.mjs  # CLI (git); pure classifier exported for tests
└── lib/release-diff.mjs    # classifyPath(), allowlist, setter-target list from --print-targets
scripts/mcp/count-tool-tokens.mjs   # injected fetch; ANTHROPIC_API_KEY from env only
tests/fixtures/mcp-release-delta-0.12.0.json
tests/mcp-release-compat.test.js
tests/release-version-rehearsal.test.js
tests/bench-gate*.test.mjs, tests/bench-conditions.test.mjs, tests/bench-runs-v2.test.mjs, ...
```

### Pattern 1: Condition slots that leave V1 schedules byte-identical
**What:** `buildSchedule({..., conditions})`. When `conditions` is absent, the code path and the output (run ids, order) are exactly today's. When it is present, slots are `(arm, condition)` pairs, odd rounds take them in order and even rounds reversed, and the run id gains `-<condition>`.
**When to use:** Every V4 campaign. V1 at the pin never sees it.
**Example:**
```js
// Source: scripts/bench/lib/runs.mjs:132-164 (existing loop), extended
const slots = conditions ? arms.flatMap((arm) => conditions.map((c) => ({ arm, condition: c })))
                         : arms.map((arm) => ({ arm, condition: null }));
const slotOrder = round % 2 === 1 ? slots : [...slots].reverse();
for (const taskId of perm) for (const s of slotOrder) {
  order += 1;
  const runId = `${campaignId}-r${round}-${taskId}-${s.arm}${s.condition ? `-${s.condition}` : ''}`;
  schedule.push(s.condition ? { campaignId, runId, round, order, taskId, arm: s.arm, condition: s.condition }
                            : { campaignId, runId, round, order, taskId, arm: s.arm }); // no new key when absent
}
```
The test should assert `deepEqual(buildSchedule(v1Args), committedV1Fixture)`. The task permutation depends only on `mulberry32(seed + round)` (`:150`). So a campaign with more rounds has the same first N rounds as a shorter one with the same seed. That lets `core-gate-71-claude` (seed 66) match V1's task order round by round [VERIFIED: `runs.mjs:148-156`].

### Pattern 2: Apply and verify the condition outside the timed window
**What:** In `createRunExecutor`, before `armFn` (which sets t0 inside `runTaskTimed`, `mcp-client.mjs:266`):
1. call the injected `applyCondition(entry.condition)`, which writes through MCP `settings` with `{key:'fsbJevFastModeEnabled', value:'true'|'false'}`;
2. read the value back independently with `readExtensionStorageFlag(port, id, 'fsbJevFastModeEnabled')`;
3. read `fsbJevCaptureArmed` the same way.

A mismatch or a `null` read returns a record with `infraError:'condition_not_applied'` and `wallMs:null`, and does not run the arm.

**Why both a write and a readback:** The settings tool can answer `SETTING_UNAVAILABLE` "did not confirm" after the write was sent (main tree `mcp/src/tools/settings.ts:62-78`). So the readback, not the tool's answer, decides.

**Preflight additions:** With `--conditions`, refuse unless `tools/list` contains `settings` and a `settings{key:'fsbJevFastModeEnabled'}` read returns `type:'boolean'`. A pin build has no `settings` tool, so `--conditions` can never run against it.

### Pattern 3: An additive v2 row with dispatch on `schemaVersion`
**What:** `RUN_ROW_KEYS` stays frozen at the v1 list (pinned at `tests/bench-report.test.mjs:76-81`). `RUN_ROW_KEYS_V2 = [...RUN_ROW_KEYS, 'condition', 'jev', 'safety', 'endLabel']`. `toCommittedRow` on the new build always writes v2 (`condition: null` when there are no conditions). `validateCommittedRow` dispatches: `1` checks the exact v1 keys, `2` checks the exact v2 keys plus nested exact keys. `walkStrings` (max 200 characters, no `://`) applies to both.

**Pins that move in the same commit:**
- `INFRA_CODES` and `PAUSING_INFRA_CODES` gain `condition_not_applied` (`bench-report.test.mjs:82-86`);
- `report.mjs` emits `infraErrors.vocabulary: [...INFRA_CODES]` (`:367-371`).

**The `jev` block** comes from `session.jevMeasurement` in the 68-09 v1 shape (`68-09-PLAN.md:63`). Use `commands[]` aggregates (`fastSteps`, `jevCalls`, `jevMs`, `usd`) for the counts. `attempts[]` is capped at 100, newest kept (`68-09-PLAN.md:87`), so counting from attempts can undercount. `acted` = Σ `commands[].fastSteps` > 0. `calibrationStatuses` and `fallbacks` come from `attempts[]`; mark them `truncated` when there are 100 attempts.

**The `safety` block** is computed in `toCommittedRow` from `raw.outcome.checks[].detail` and `raw.evidence.requests`, before `checksBlock` drops `detail` (`runs.mjs:419-425`):
- `requestOvercount` = max(0, `matched - expected`) over request checks **without** `jsonEquals`. Every core task has exactly one such total-count check; see the request-check table in Code Examples.
- `unexpectedMutations` counts requests whose path starts with `/api/`, whose method is not GET, HEAD or OPTIONS, and whose (method, path) no request check names.
- When `evidence.requests` is not an array, or the log reports `dropped > 0`, the block is `null` (unverifiable). The evaluator counts that as "safety unverifiable" and never as zero.

### Pattern 4: A predeclared gate file with an exact-key validator and a hash pin
**What:** `release-gate-v1.0.0.json` is read as raw bytes. `sha256(bytes)` is pinned in `tests/bench-gate.test.mjs`. `validateGate(obj)` checks exact keys at every level, the same way `checkKeys` does (`runs.mjs:472-480`).
**Suggested top-level keys:** `schemaVersion`, `gateVersion`, `note`, `corpusLockSha256`, `campaigns`, `identityMatch`, `paths`, `criteria`, `exercise`, `safety`, `claimWords`, `fallback`, `bootstrap`, `power`.
**Runner side:** `run-bench --gate <file>` records `identity.gate = {path, sha256}` and adds it to `stableIdentity` (`run-bench.mjs:1025-1041`) so a resume cannot switch gates.

### Pattern 5: A pure evaluator core and a thin git-using CLI shell
**What:** `evaluate.mjs` exports `evaluateGate({gate, baseline, campaigns}) → {paths:{…verdict, criteria}, diagnostics, claims}` with no I/O. `evaluate-gate.mjs` follows the house pattern `main(argv, overrides)` (`run-bench.mjs:1234`) and handles everything that touches the outside world:
- loads campaigns with `loadCampaign` (`report.mjs:101`);
- hashes the gate;
- runs `git log -1 --format=%aI -- <gate>` and `git diff --quiet <measuredSha> -- <code paths>` through `overrides.git`;
- runs the `--verify-suites` commands through `overrides.spawn`;
- writes the decision file.

Tests inject fakes for git and spawn, so no registered test runs git (67-VALIDATION:27).

### Pattern 6: Claims built only from typed, source-tagged numbers
**What:** The claims builder takes `{value, source}` tokens, where `source` is one of `'wallMs-ratio'`, `'completion-diff'`, `'completion-count'` or `'cost'`, and renders each sentence from a template. A test walks the structured claims (not the rendered text) and fails on any token whose source is not allowed. A second test scans the rendered text for `jevMs`, `latencyMs`, `per decision` and `ms per call`. This is sturdier than a text regex alone (D-18).

### Pattern 7: A synthetic campaign generator shared by tests and the power script
**What:** `synthetic.mjs` exports `makeCampaign({seed, campaignId, schemaVersion, arms, conditions, rounds, taskRates, wallLogMean, wallSigma, effect, jev:{actRate, calibrated, models}, safetyEvents, identity})`. It returns `{identity, runs}`, with every row passing `validateCommittedRow`. The baseline fixture is written as schema-1 rows, which also proves the v2 validator still accepts V1 rows. There is one fixture recipe per verdict branch (D-19).

### Pattern 8: A release-diff path classifier (pure) inside a git CLI
**What:** `classifyPath(path, {setterTargets, step}) → 'setter' | 'docs' | 'forbidden'`.
- The `setterTargets` list comes from `sync-product-version.mjs --print-targets`.
- The docs allowlist from D-24 is: `*.md`, `showcase/**`, `store-assets/**`, `skills/**`, `.planning/**`, `scripts/bench/results/**`, `scripts/bench/gate/decisions/**`.

The CLI then:
1. exports the measured tree with `git archive <sha> | tar -x -C <tmp>`;
2. copies the release commit's CHANGELOGs and docs into the temp tree;
3. runs the setter with `FSB_VERSION_SYNC_ROOT=<tmp>`;
4. compares every path listed by `git diff --name-only <measured> <release>` byte-for-byte.

Any `forbidden` path that differs fails.

### Pattern 9: Per-MCP-version compatibility as declared data (D-22)
**What:** Inside `sync-product-version.mjs`, a frozen `MCP_EXTENSION_COMPAT`. For example:

| MCP version | Minimum extension | Feature requirement | Reason |
|---|---|---|---|
| `0.11.2` | `0.9.92` | none | `mcp:task-status` |
| `0.12.0` | `0.9.92` | `settings` and `expect` need `1.0.0` | `settings` / `expect` |

Lookup rule: an exact entry wins; otherwise a patch version inherits the highest entry with the same major.minor. That rule keeps the existing `tests/version-sync.test.js` `nextPatch` flow (MCP 0.11.3, `:115-118`) working with no new map entry. Both the template (`:279-301`) and the `--check` phrase (`:549-552`) read from the map. `tests/mcp-version-parity.test.js:298` moves in the same commit.

### Anti-Patterns to Avoid
- **Comparison code in `report.mjs`:** it trips `bench-report.test.mjs:1122`. Ratios, Newcombe and verdicts belong in `scripts/bench/gate/lib/`.
- **Pooling `off` and `on` under one arm:** `summarizeArm` groups by `row.arm` only (`report.mjs:352-356`), and so does the A/A floor.
- **Writing the switch over CDP:** that skips the product path the measurement claims to use (D-04). CDP is only for the readback.
- **Counting `jev.acted` from `attempts.length`:** attempts are capped at 100 and include non-acting fallbacks.
- **Computing safety from committed rows:** `checksBlock` drops `detail` (`runs.mjs:419-425`). Compute it in the producer from the raw record.
- **Any new Node 22+ global** (`Object.groupBy`, Set methods, `Promise.withResolvers`): CI runs Node 20.
- **Editing the stats Pattern 9 block, `RUN_ROW_KEYS`, or the `PRE_PHASE6x` hashes.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| A seeded random number generator | A new PRNG | `mulberry32` (`stats.mjs:20-24`) | It already seeds the schedule and bootstrap; a second generator breaks reproducibility |
| A speed CI | A new bootstrap | `geoMeanMedianRatio` and `aaNoiseFloor` (`stats.mjs:34-51,79-90`) | D-12 locks this statistic; the simulation shows it is conservative (coverage 0.97-0.99) |
| A Wilson interval | A second Wilson | `wilson()`, with `newcombeDifference` built on top of it | One z constant, one implementation |
| A canonical JSON hash | Custom serialization | `canonicalJson` and `sha256Hex` (`scripts/bench/lib/identity.mjs`) | They already match the tools-list digests |
| Listing `tools/list` | Spawning the server | `listCurrentTools()` / `listToolsFromRuntimeModule` (69-01) | In-process and shallow-CI-safe, with a build-staleness guard |
| A tool-schema diff | A new projection | `projectShape` (69-01 helper) | It is the projection the shape freeze already trusts |
| Version string edits | `sed` / manual edits | `npm run version:set:*` and `FSB_VERSION_SYNC_ROOT` | `--check` compares every managed surface with the setter's own output (`:620-635`) |
| Locale catalog updates | Hand-editing `messages.xlf` sources | `npx --prefix showcase/angular ng extract-i18n`, then digit-only target edits | CI diffs extraction byte-for-byte; `sync-xliff-targets` resets edited units to `needs-translation` (memory: showcase-i18n-line-pins) |
| Reading storage over CDP | A new evaluate snippet | `readExtensionStorageFlag` | It is strict-true, returns `null` when unreachable, and closes the wake tab |
| Row safety rules | New string scans | `walkStrings` / `checkKeys` (`runs.mjs:472-495`) | The committed-artifact rule: no URL, nothing over 200 characters |

**Key insight:** Every number in this phase feeds a release decision. Each duplicated helper is a second place where the verdict could silently differ from the report.

## Runtime State Inventory

This phase prepares a release that changes version strings and published artifacts. The live state below is touched only at V6, but the plans and the VALIDATION rows must account for it.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | npm registry: `fsb-mcp-server` `latest` = 0.11.2 (`mcp/package.json:3`; the workflow skips an already-published version, `npm-publish.yml:50-66`). Chrome Web Store item `badgafnf…` at 0.9.92. Benchmark results live in git (`scripts/bench/results/`). | V6 only: step A ships the extension; step B publishes MCP 0.12.0 if the non-Jev path passes. No data migration. |
| Live service config | Fly `JEV_ENABLED` secret (67 D-06), set at V2. GitHub repo variable `CWS_PUBLISH_ENABLED` gates `publish-cws` (`chrome-extension.yml:100-103`). | V6: `fly secrets set JEV_ENABLED=false` only on a Jev safety fail. Check the repo variable before tagging `extension-v1.0.0`. |
| OS-registered state | Everyday Claude Code at `~/.local/bin/claude` (2.1.300 today, auto-updating). The bench Chrome profile is `~/.fsb-bench/chrome-profile` (present). The native host is installed for the Web Store id. | M-71-01 pins a separate binary on PATH; the everyday install is untouched. |
| Secrets/env vars | `ANTHROPIC_API_KEY` (M-71-09 only; read from env, never logged). Bench child env key names are hashed (`claude-arm.mjs:50-97`). | V1 and V4 must run from the same shell profile so `envKeyNamesSha256` (which includes `LC_*` names) matches. |
| Build artifacts | Six force-tracked `mcp/build` files (memory note); `mcp/native-host/runtime-integrity.json` (lock hash, rewritten by `version:set:mcp`). | V6 step B: `npm --prefix mcp run build` after the setter, and commit the force-tracked outputs with it. The release-diff check must see only setter or rebuild outputs. |

## Common Pitfalls

### Pitfall 1: The frozen round counts cannot deliver the gate's own power (and the sentinel trips on noise)
**What goes wrong:** At D-04's sizes:
- the Claude non-Jev completion criterion has power 0.50-0.70 when completion is 0.80-0.90;
- the autopilot sentinel's ±10-point equivalence test passes only 23-67% of the time when nothing has drifted (V1 at 10 rounds against V4 `off` at 20).

A sentinel trip makes the non-Jev MCP verdict `inconclusive`, and D-17 then withholds MCP 0.12.0.

**Why it happens:** The completion margin (10 points) is narrow relative to a binomial standard error at 120-240 runs per arm.

**Simulation results** [VERIFIED: local seeded simulation, 4,000-6,000 reps, 12 tasks, Newcombe method 10]:

| Comparison | 0.80 | 0.85 | 0.90 | 0.95 |
|---|---|---|---|---|
| Non-inferiority power, balanced rounds 20/20 | 0.78 | 0.86 | 0.95 | 1.00 |
| Non-inferiority power, balanced rounds 24/24 | 0.85 | 0.91 | 0.97 | — |
| Non-inferiority power, balanced rounds 30/30 | 0.92 | 0.96 | 0.99 | 1.00 |
| Non-inferiority power, baseline fixed at 10 vs candidate 10 / 20 / 30 / 60 | — | 0.57 / 0.76 / 0.84 / 0.92 | 0.70 / 0.89 / 0.95 / 0.99 | — |
| Equivalence (both bounds within ±10) under no drift, 10/20 | 0.23 | 0.42 | 0.67 | 0.92 |
| Equivalence under no drift, 20/20 | 0.57 | 0.73 | 0.90 | 0.99 |
| Equivalence under no drift, 30/30 | 0.84 | 0.92 | 0.98 | 1.00 |
| Equivalence under no drift, 40/40 | 0.95 | 0.98 | 1.00 | 1.00 |

**How to avoid:**
- Make the D-13 power script cover **all three** completion comparisons: the Jev path, the Claude path and the sentinel. For the sentinel, report the false-trip rate.
- Freeze the rounds for the lowest plausible completion rate.
- Declare `campaigns.baseline.minRounds` in the gate.
- Change the V1 Manual-Only command to pass `--rounds <N>`. V1 has not run; the default is 10 (`66-11-PLAN.md:66,114`).
- The evaluator returns `inconclusive` (underpowered) when a campaign has fewer rounds than the gate declares.
- The margin and α never move (D-13). The cost increase is an owner decision (Open Question 1).

**Warning signs:** A gate file frozen with `rounds: 10` for the baseline, or a power table that omits the sentinel.

### Pitfall 2: Comparison code in `report.mjs`
**What goes wrong:** `tests/bench-report.test.mjs:1122` fails on any `geoMeanMedianRatio(`, `cross-arm`, or `autopilot…/…claude…ratio` in `report.mjs` (with comments stripped).
**How to avoid:** `report.mjs` only gains (arm, condition) grouping and descriptive per-condition columns. Every ratio, Newcombe interval and verdict lives in `scripts/bench/gate/lib/`.

### Pitfall 3: Reports silently pool the two conditions
**What goes wrong:** `summarizeArm` and `aaFloorFor` operate per `row.arm`. With v2 rows, the `autopilot` column would mix `off` and `on`.
**How to avoid:** Key the arms object by `arm` for v1 rows and by `arm/condition` for v2 rows with a non-null condition. Pin both shapes in `bench-report.test.mjs`, and add a v2 golden summary.

### Pitfall 4: The D-22 fix touches two places, and the existing test flow needs an inheritance rule
**What goes wrong:**
- **The check phrase.** Fixing only the template still fails `--check`, because `collectParityErrors` checks `MCP ${mcpVersion} requires extension ${extensionVersion} or newer` (`sync-product-version.mjs:549-552`), using the *current* extension version.
- **The test flow.** `tests/version-sync.test.js` bumps MCP to `nextPatch` (0.11.3), which a plain exact-match map would not know.

**How to avoid:** Use the Pattern 9 map with patch inheritance, applied to the template and the check together, plus `tests/mcp-version-parity.test.js:298`. `npm run version:check` must stay green at 0.9.92/0.11.2. The README's current line already reads "MCP 0.11.2 requires extension 0.9.92 or newer" (`mcp/README.md:669`), so the generalized output at today's versions should be byte-identical except for the reason wording you choose.

### Pitfall 5: The step-B README edits the setter cannot do for you
**What goes wrong:**
- **The heading.** `replaceFirstCurrent` renames the **first** `### What's New In vX` heading in place (`:273-278`). Without a newly authored v0.12.0 section, the 0.11.2 notes are relabelled as 0.12.0, and `--check` still passes.
- **The bullet.** `replaceExactly` requires **exactly one** `- **Compatibility:**` / `- **Unified product version:**` bullet (`:279-283`). If the new section copies the bullet, the setter fails. If the bullet stays under v0.11.2, it is rewritten in place with 0.12.0 text.

**How to avoid:** In the rehearsal fixture and the M-71-11 instructions:
1. author `### What's New In v0.12.0` above v0.11.2;
2. **move** the Compatibility bullet into it;
3. assert that both headings exist after the setter runs.

### Pitfall 6: The git-date ordering check breaks after a rebase
**What goes wrong:** Committer dates are rewritten by rebase and cherry-pick. If Jev is rebased before V6 and the evaluator is re-run, the gate looks "newer" than V1 and the CLI refuses, with no override (D-11).
**How to avoid:** Compare the **author date** (`%aI`, kept through rebase and cherry-pick) of the last commit touching the gate file. Record both dates in the decision file. Keep the gate sha256 in campaign identity as the primary binding.

### Pitfall 7: Moving HEAD during V4
**What goes wrong:** `stableIdentity` includes `gitSha` (`run-bench.mjs:1031`). Any commit between a campaign start and its `--resume` refuses the resume (`resume_identity_mismatch`). A commit between the two V4 campaigns breaks "two campaigns at one release-candidate SHA".
**How to avoid:**
- Cherry-pick the V1 results (M-71-02) **before** choosing the RC SHA.
- Commit nothing until both V4 campaigns and M-71-08 are done. Results are untracked during the runs, which does not set `git.dirty`; it counts tracked changes only.
- The evaluator refuses campaigns with `git.dirty === true` or different `git.sha`.

### Pitfall 8: Resumes can silently change the Claude Code or Chrome version
**What goes wrong:** `stableIdentity` does not include `hosts.claude.version` or the Chrome version. A resume after an auto-update only appends to `identity.resumes[]` (`run-bench.mjs:1358-1366`).
**How to avoid:** The evaluator requires every `resumes[].claudeVersion` to equal `hosts.claude.version`, and every `resumes[].chromeBrowser` major to equal the original. Otherwise the comparison that uses the campaign is `inconclusive`. M-71-01's PATH pin prevents the Claude drift.

### Pitfall 9: The `jevMeasurement` read can race the session save
**What goes wrong:** The autopilot arm's `get_session_detail` retry waits only for `measurement.recorded === true` (`run-bench.mjs:581-584`). If `jevMeasurement` is persisted in a later save, an `on` run looks "not acted", which biases the D-16 exercise rate down.
**How to avoid:** For `condition === 'on'`, extend the `until` predicate to also wait (within the same retry budget) for `session.jevMeasurement`. Flag `jev_measurement_missing` when it never arrives. Put this on the sync re-check list (68-09).

### Pitfall 10: There is no terminal-reason source for autopilot rows
**What goes wrong:** `fsb.endReason` comes from the MCP measurement (`readMcpEndReason`, dispatcher `:2404-2408`). The autopilot measurement block has no `endReason` (`buildAutopilotMeasurement` `:2611-2650`). So D-08's `endLabel` (for example `meta_cognitive_loop_break`, `agent-loop.js:2911-2912`) needs a different source.
**How to avoid:** At the sync re-check, confirm that `get_session_detail` projects `outcomeDetails.reason` for autopilot sessions, or that `run_task` JSON carries it. Map it through a fixed vocabulary (unknown becomes `other`) so free text never enters a row.

### Pitfall 11: The docs count inventory is larger than D-27's list, and the xlf traps
**Sites D-27 does not list** [VERIFIED: grep in the main tree]:
- `showcase/angular/src/app/pages/about/about-page.component.html:102` ("68-tool MCP");
- `home-page.component.html:68` ("68 tools");
- `agents-page.component.ts:294` ("68 MCP browser tools");
- `support-page.component.ts:41` ("68 MCP tools"; D-27's `:61` is a second site, "68 granular tools");
- `showcase/angular/scripts/llms.source.md:3,32` and `llms-full.source.md:7` ("68-tool MCP surface");
- 7 xlf catalogs: 7 hits each, 10 in German.

**Unit `agents.power.card.tools.stat`** is in `same-source-allowlist.json` with `sourceSha256`/`targetSha256`, so both hashes must be recomputed.

**The xlf traps:**
- editing a template string resets targets if `sync-xliff-targets` runs;
- line moves above the last `$localize` break the extraction diff.

**How to avoid:**
1. Start the docs plan with an exhaustive grep (`\b6[89]\b` near "tool" across the source, the llms sources and every xlf `<target>`), and check `git status` and ListAgents for sibling sessions first.
2. Run `ng extract-i18n --output-path src/locale`, then make digit-only edits in each locale target and keep `state`.
3. Recompute the allowlist hashes.
4. Run `verify:translation-drift`, `verify:translation-quality`, and the CI extraction diff.

### Pitfall 12: "73 tools" depends on the gate
**What goes wrong:** If the non-Jev MCP path fails, D-17 withholds 0.12.0 and npm stays at 0.11.2, which has 72 tools and no `settings`. The extension 1.0.0 onboarding copy (`extension/ui/onboarding.js:205,227,275`) and the showcase would then say 73.

D-24's release-diff allowlist does **not** include `extension/ui/onboarding.js`. So correcting it after V4 means a re-measure.

**How to avoid (planner's choice, flag to the owner):**
- (a) keep 73, and add a V6 fallback row that reverts the counts to 72 everywhere except onboarding, plus onboarding wording that does not depend on the outcome; or
- (b) set the counts to 72 now (true at 0.11.2, including the three lifecycle tools) and let step B make them 73.

Option (b) conflicts with D-27's "73 everywhere" and with a "documented count = built `tools/list` length" check on Jev. See Open Question 2.

### Pitfall 13: Evaluator output names collide with report.mjs output
**What goes wrong:** D-18 says the evaluator writes `report.md` and `summary.json` "next to the campaign". `report.mjs` already writes exactly those names into each campaign directory (`report.mjs:554-560`).
**How to avoid:** Write the gate report as `scripts/bench/gate/decisions/core-gate-71.report.md`, beside `core-gate-71.json` (both are inside the D-24 allowlist), or use distinct names such as `gate-report.md`.

### Pitfall 14: Committed artifacts and the full test chain
**What goes wrong:**
- **Network or ports.** A registered test that runs git, reaches the network, or binds 7225/7226 fails or hangs. CI uses a shallow clone and Node 20.
- **The chain position.** The bench ESM command is no longer the last in `package.json` `test`: 66.1 and 69 appended 9 plain-script commands after it. It is also an exact string in `REFINEMENT_ROOT_TEST_COMMANDS` (`delegation-phase-contract.test.js:160`).
- **The crawler files.** A full `npm test` rewrites `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`.

**How to avoid:**
- If D-29 appends files to the existing bench command, edit the identical string in `REFINEMENT_ROOT_TEST_COMMANDS` in the same commit. Commands in that list are excluded from the `PRE_PHASE6x` hash computation (`:2397-2405`), so the hashes stay valid.
- Plain-script suites are appended at the end and added to the list.
- Restore the three crawler files unless the docs plan regenerates them on purpose.

### Pitfall 15: Speed survivorship and ITT
**What goes wrong:** "Wall time per completed task" uses completed runs only (`stats.mjs:33`, `report.mjs:43`). A fast path that turns slow successes into fast failures looks faster.
**How to avoid:** The completion criterion must pass in the same intersection-union test (D-14). The report states the survivorship in the method notes. The per-protocol view stays in diagnostics (D-10).

### Pitfall 16: `count_tokens` request details
**What goes wrong:**
- MCP `inputSchema` objects may carry `$schema` and SDK keys set to `undefined`; `canonicalJson` drops the latter.
- Tool search loads names only at session start, so whole-schema counts overstate session-start context.
- Newer tokenizers count about 30% more.

**How to avoid:**
- Convert with `canonicalJson` and send `{name, description, input_schema}`.
- Keep a `--strip-schema-keyword` fallback in case the API rejects `$schema` [ASSUMED].
- Label the output an estimate per model, and print the tool-search caveat [CITED: token-counting doc; code.claude.com/docs/en/mcp].

## Code Examples

### `newcombeDifference` (Newcombe 1998, method 10, built on the existing `wilson`)
```js
// Source: formula per metricgate.com/docs/newcombe-difference-interval; numbers verified locally
import { wilson } from './stats.mjs'; // same module, after the Pattern 9 block
export function newcombeDifference(x1, n1, x2, n2, z = 1.959963984540054) {
  if (!n1 || !n2) return { diff: null, ci: [null, null] };
  const p1 = x1 / n1, p2 = x2 / n2;
  const [l1, u1] = wilson(x1, n1, z), [l2, u2] = wilson(x2, n2, z);
  const d = p1 - p2;
  return { diff: d, ci: [d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)] };
}
// Test vectors (computed here; they match the values Newcombe 1998 Table II reports for method 10 [ASSUMED citation]):
// (56,70,48,80) -> [0.0524, 0.3339]; (9,10,3,10) -> [0.1705, 0.8090];
// (5,56,0,29) -> [-0.0381, 0.1926]; (0,10,0,20) -> [-0.1611, 0.2775]
```

### F5 token (24 lowercase letters, about 112.8 bits)
```js
// Source: scripts/bench/fixture-server.mjs:415-419 (replace randomBytes(16).toString('base64url'))
import { randomInt } from 'node:crypto';
newRunToken() {
  let token = '';
  for (let i = 0; i < 24; i += 1) token += String.fromCharCode(97 + randomInt(26)); // uniform, no modulo bias
  logFor(token);
  return token;
}
// Still matches TOKEN_PATTERN /^[A-Za-z0-9_-]{8,64}$/ (:50) and the test at bench-fixture-server.test.mjs:94.
```
**Why it works.** Under 67-01 rule 7 as written (`67-01-PLAN.md:151`), a candidate needs an uppercase letter, a lowercase letter and a digit, plus a segment of 16 or more characters that mixes letters and digits. An all-lowercase token gives neither. I rendered all 12 core goals with ports 1024-61234:
- 0 of 24,000 goals were flagged with lowercase tokens;
- 16,580 of 24,000 were flagged with base64url tokens.

[VERIFIED: local simulation of the rule text plus the key-prefix rules.] The registered test must still use the **real** `FsbJevState.buildRequest` once 67-06 lands (D-07).

### Request checks per core task (input for the safety block)
| Task | Total-count check (no `jsonEquals`) |
|---|---|
| kanban-moves | `POST /api/kanban-moves/move` ×3 |
| the other 11 | one `POST /api/<slug>/<verb>` ×1 |
[VERIFIED: parsed `scripts/bench/tasks/core/*.json`]

### Compatibility map used by the setter and the check
```js
// Source: pattern for scripts/sync-product-version.mjs (D-22; planner chooses wording)
const MCP_EXTENSION_COMPAT = Object.freeze({
  '0.11.2': { minimum: '0.9.92', reason: 'for `mcp:task-status`', features: null },
  '0.12.0': { minimum: '0.9.92', reason: 'for existing tools', features: { version: '1.0.0', names: ['settings', 'expect'] } },
});
function compatFor(mcpVersion) {            // exact entry, else highest same-minor entry (patch inherits)
  if (MCP_EXTENSION_COMPAT[mcpVersion]) return MCP_EXTENSION_COMPAT[mcpVersion];
  const [maj, min] = mcpVersion.split('.');
  const same = Object.keys(MCP_EXTENSION_COMPAT).filter((v) => v.startsWith(`${maj}.${min}.`)).sort(compareSemver);
  if (!same.length) throw new Error(`no declared extension compatibility for MCP ${mcpVersion}`);
  return MCP_EXTENSION_COMPAT[same[same.length - 1]];
}
// Template (:294) and --check (:551) both use `MCP ${v} requires extension ${compatFor(v).minimum} or newer`.
```

### count_tokens request (injected fetch)
```js
// Source: platform.claude.com/docs/en/build-with-claude/token-counting
const body = { model, tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
               messages: [{ role: 'user', content: 'List the available tools.' }] };
const res = await fetchImpl('https://api.anthropic.com/v1/messages/count_tokens', {
  method: 'POST',
  headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
// -> { input_tokens }. Tool tokens = count(with tools) - count(same request, no tools). Never print the key or headers.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code loads every MCP tool definition at session start | Tool search loads tool names only, by default on recent versions (`ENABLE_TOOL_SEARCH` overrides) | Recent Claude Code releases [CITED: code.claude.com/docs/en/mcp] | Shorter descriptions matter less to session-start context. Report `count_tokens` as an upper bound and record `toolSearchEnv` and `toolLoadingObserved` (already in identity) |
| Unsigned Claude Code binaries | A signed `manifest.json` (+`.sig`) per release at `downloads.claude.ai/claude-code-releases/<ver>/`, signatures from 2.1.89 on | [CITED: code.claude.com/docs/en/setup] | M-71-01 can verify the pinned binary (key fingerprint `31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE`) |
| One tokenizer across models | Claude 4.7+ and later families count about 30% more tokens for the same text | [CITED: token-counting doc] | Count per model id; never reuse counts across models |
| Immediate publish after CWS review | Deferred publishing; an approved item stays staged up to 30 days, then reverts to draft | [CITED: developer.chrome.com/docs/webstore/publish] | Step A can be timed. Missing the 30-day window means resubmitting |

**Deprecated/outdated:**
- PROJECT.md's "0.11.0 to 0.12.0": the current MCP version is 0.11.2 (`mcp/package.json:3`; D-21).
- CONTEXT D-27's support-page site `support-page.component.ts:61` is one of two sites in that file; `:41` is the other.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Completion rates on the core corpus will fall in 0.80-0.95, so power was simulated over that range | Pitfall 1 | If rates are lower, even 30 rounds is underpowered; if higher, fewer rounds suffice. V1 data settles it, but the gate must freeze before V1 |
| A2 | Per-run wall-time log-SD of about 0.25-0.4 and per-task effect SD of about 0.1 for the speed-power illustration | Summary / Pitfall 1 | The speed-power numbers are illustrative only; the D-13 script must make them parameters |
| A3 | `jevMeasurement` may be persisted in a later save than `measurement` (race) | Pitfall 9 | If they are always saved together, the extra wait is harmless |
| A4 | `get_session_detail` does not project an autopilot terminal reason today | Pitfall 10 | If it already does, `endLabel` maps it directly |
| A5 | Anthropic's `count_tokens` may reject `$schema` inside `input_schema` | Pitfall 16 | Only the fallback flag is affected |
| A6 | The binary path inside `downloads.claude.ai/claude-code-releases/<ver>/` is `<platform>/claude` | M-71-01 | The operator reads the path from `manifest.json`; low risk |
| A7 | The Newcombe test vectors equal Newcombe (1998) Table II method 10 | Code Examples | The values were computed here from the published formula; only the paper attribution is from memory |
| A8 | Phase 70 keeps `run_task` status in `json.status` and adds no tool or required argument (D-09) | Sync re-check | Phase 70 has no plans yet; the sync re-check catches drift |

## Open Questions (RESOLVED)

1. **How many rounds for V1 and V4, and who pays?**
   - **What we know:** Pitfall 1's tables. D-13 lets rounds rise and never moves the margin. V1 defaults to 10 rounds.
   - **What's unclear:** The owner's spend tolerance. About 30 rounds per arm in V1 (720 runs) plus V4 (720 autopilot and 360 Claude runs) is roughly 3x the current plan.
   - **Recommendation:** The power plan computes and records the table in the gate notes. The gate declares `minRounds` per campaign, including `core-baseline-66`, and the V1 Manual-Only row carries `--rounds N`. If the owner rejects the cost, the honest alternative is to accept that the non-Jev verdict will often be `inconclusive`, recorded before V1 and never relaxed afterwards.
   - **RESOLVED:** The power plan runs the full simulation, chooses the smallest round counts that reach power ≥ 0.8 for both completion criteria and keep the sentinel's no-drift false-trip rate ≤ 0.2 at the gate's floor completion rate, and freezes those counts as per-campaign `minRounds`, `core-baseline-66` included. The V1 Manual-Only row passes `--rounds N` from the gate. The spend is recorded as an owner-visible line in the gate notes and in VALIDATION.md. If the owner rejects that spend at V1, the honest outcome is the rule already frozen in the gate: an under-round campaign is `inconclusive`, never a relaxed margin.

2. **Should the tool-count docs say 73 now?**
   - **What we know:** D-27 locks 73. A failed non-Jev path withholds 0.12.0, which leaves 72 published tools. `onboarding.js` is outside the release-diff allowlist.
   - **What's unclear:** Whether the owner accepts the possibility of stale copy, or prefers a V6 fallback.
   - **Recommendation:** Keep D-27 (73) and add a V6 fallback row (Pitfall 12a). Choose onboarding wording that is true in both outcomes. Surface this to the owner during plan review.
   - **RESOLVED:** Keep D-27 (73). The docs plan writes outcome-proof onboarding copy that names no number, so a withheld 0.12.0 never needs a post-V4 extension edit. It also records a conditional V6 fallback row (M-71-11b) that sets the count back to 72 on non-extension surfaces when MCP 0.12.0 is withheld. The row stays within the D-24 docs allowlist.

3. **Which date proves predeclaration?**
   - **What we know:** D-11 says "the last commit touching the gate file predates createdAt". Committer dates change on rebase.
   - **Recommendation:** Use the author date, and record both dates (Pitfall 6).
   - **RESOLVED:** The evaluator CLI compares the author date (`git log -1 --format=%aI`) of the last commit touching the gate file with every campaign's `createdAt`, and refuses with no override on a violation. The decision file records both the author and committer dates. Campaign identity still binds the gate's sha256 as the primary link.

4. **What exactly counts as an "acted attempt" for D-16?**
   - **What we know:** 68-04's attempt has `decisionSource`, `op`, `stepOutcome`, `fallback` and `calibrationStatus` (`68-04-PLAN.md:150`).
   - **Recommendation:** The sync re-check pins the definition: an attempt with `fallback === null` and a non-null `op` whose step ran (`stepOutcome !== null`). The gate file states it in prose, and the evaluator implements it.
   - **RESOLVED:** An acted attempt is one with `fallback === null`, a non-null `op` and `stepOutcome !== null`. The sync re-check confirms these field names against the executed 68-04/68-09 code before the gate is frozen. The gate file states the definition in its notes.

5. **What are the success-claim words for each build (D-09 item 3)?**
   - **What we know:** At the pin, the bench fixtures show `status:'completed'` (`tests/bench-report.test.mjs:239-240`). Phase 70's words are unknown.
   - **Recommendation:** The sync re-check derives both lists from code. The Claude driver's claim predicate is `claimed.completeTask === true`, because `status` is always `null` for host arms (`run-bench.mjs` `hostClaimed`).
   - **RESOLVED:** The sync re-check derives the success-claim words for each build from code: the pin's `run_task` status vocabulary, and the candidate's from Phase 70. The gate freezes them per build and per driver. Autopilot: `claimed.status` ∈ success words and `claimed.isError !== true`. Claude Code: `claimed.completeTask === true`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts and tests | ✓ | 24.14.1 | — |
| Node 20 (CI parity) | Per-suite Node 20 check | ✓ (`npx --offline -y node@20`) | 20.20.2 | CI is authoritative |
| git | Evaluator CLI, release-diff CLI (not tests) | ✓ | 2.54.0 | — |
| `mcp/node_modules` (SDK 1.29.0) | In-process `tools/list`, runner client | ✓ (main tree and planning worktree) | 1.29.0 | `npm --prefix mcp ci` |
| Built `mcp/build/runtime.js` | Compat suite (`assertBuildFresh`) | ✓ when built | — | `npm --prefix mcp run build` |
| Angular CLI (`ng`) | `extract-i18n` for the docs plan | ✓ | showcase devDep | — |
| Claude Code (pinned bench binary) | V1/V4 only (M-71-01) | ✗ (only the everyday 2.1.300, auto-updating) | — | Manual-Only V1 step |
| `ANTHROPIC_API_KEY` | M-71-09 (V4) | not checked (never read) | — | Manual-Only |
| `fly` CLI | V2/V6 (`JEV_ENABLED`) | ✓ | — | Manual-Only |
| `gh` CLI | V6 checks | ✓ | — | — |
| Bench Chrome profile | V1/V4 | ✓ `~/.fsb-bench/chrome-profile` | — | 66-10 procedure |

**Missing dependencies with no fallback:** none for the automated Phase 71 work.
**Missing dependencies with fallback:** the pinned Claude Code binary and the API key, both of which are V1/V4 Manual-Only items.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` for `.mjs` bench and gate suites; plain Node `check()` scripts for `.js` contract suites (house style) |
| Config file | none. Registration is the `package.json` `test` chain plus `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129-170`) |
| Quick run command | `node --test tests/bench-gate.test.mjs tests/bench-gate-evaluate.test.mjs tests/bench-conditions.test.mjs tests/bench-runs-v2.test.mjs tests/bench-stats.test.mjs tests/bench-report.test.mjs` |
| Full suite command | `npm run validate:extension && npm test` (with 7225 free; restore the crawler files afterwards) |
| Node 20 parity | `npx --offline -y node@20 --test <new .mjs suites>` and `npx --offline -y node@20 <new .js suites>` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVAL-01 | Schedules without conditions are byte-identical to today's; with conditions, slots are ABBA (arm, condition) pairs and run ids carry `-off`/`-on` | unit | `node --test tests/bench-conditions.test.mjs` | ❌ Wave 0 |
| EVAL-01 | Pre-t0 write plus CDP readback; mismatch or `null` gives `condition_not_applied` and a pause; capture arm true refuses; `--conditions` preflight requires the `settings` tool | unit (injected deps via `main(argv, overrides)`) | `node --test tests/bench-conditions.test.mjs` | ❌ Wave 0 |
| EVAL-01 | v2 row round trip from a raw record with a real-shape `jevMeasurement`; schema-1 fixture rows still validate; producer/validator/report key parity; the safety block from raw details and the request log | unit | `node --test tests/bench-runs-v2.test.mjs tests/bench-report.test.mjs` | ❌ Wave 0 / ✅ extend |
| EVAL-01 | The report groups by (arm, condition) and never pools; there is still no ratio code in `report.mjs` | unit + source scan | `node --test tests/bench-report.test.mjs` | ✅ extend |
| EVAL-01 | F5: the real `FsbJevState.buildRequest` never returns `sensitive_goal` for any core goal under the new token, at several ports and tokens | unit (createRequire of the extension CJS) | `node --test tests/bench-fixture-server.test.mjs` (or a new `tests/bench-f5-token.test.mjs`) | ❌ Wave 0 |
| EVAL-01 | `newcombeDifference` matches the reference vectors and handles n = 0 | unit | `node --test tests/bench-stats.test.mjs` | ✅ extend |
| EVAL-02 | The gate file sha256 pin plus the exact-key validator; numbers inside the allowed discretion ranges | unit | `node --test tests/bench-gate.test.mjs` | ❌ Wave 0 |
| EVAL-02 | Every verdict branch on synthetic campaigns: Jev pass; speed fail (CI crosses 1, practical-effect fail, inside the A/A floor); completion fail; safety (a) and (b); `not_exercised` (uncalibrated, < threshold, leak); identity mismatch; sentinel trip; gate hash refusal; non-Jev pass and fail; underpowered (rounds < minRounds) | unit | `node --test tests/bench-gate-evaluate.test.mjs` | ❌ Wave 0 |
| EVAL-02 | The decision file validator; the verdict-to-consequence mapping (D-17); claims carry only `wallMs`, completion or cost provenance | unit | `node --test tests/bench-gate-evaluate.test.mjs` | ❌ Wave 0 |
| EVAL-02 | The CLI refuses on author-date order, dirty or mismatched SHA, and unrun suites (fake git and spawn) | unit (injected) | `node --test tests/bench-gate-cli.test.mjs` | ❌ Wave 0 |
| EVAL-02 | Seeded small power and coverage simulation reproduces recorded values | unit (seeded, < 30 s) | `node --test tests/bench-gate-power.test.mjs` | ❌ Wave 0 |
| REL-01 | Temp-root step A: refuses without `## v1.0.0`; `--check` needs the header line; passes with the fixture entry ("align at `1.0.0`", "stays at `0.11.2`"); parity phrases hold | integration (temp root, `FSB_VERSION_SYNC_ROOT`) | `node tests/release-version-rehearsal.test.js` | ❌ Wave 0 |
| REL-01/02 | The D-22 generalization: `version:check` is green at 0.9.92/0.11.2; the compat phrase comes from the map; the existing nextPatch flow still passes | integration | `node tests/version-sync.test.js && node tests/mcp-version-parity.test.js && npm run version:check` | ✅ update |
| REL-02 | Temp-root step B: refuses without the MCP anchor, heading and artifact; the authored v0.12.0 section and the moved Compatibility bullet; `--check` passes | integration | `node tests/release-version-rehearsal.test.js` | ❌ Wave 0 |
| REL-02 | The built `tools/list` minus the 8a058bdf fixture equals the delta manifest exactly; no new required argument; the `MCPMessageType` delta; companion suites registered | contract (in-process) | `npm --prefix mcp run build && node tests/mcp-release-compat.test.js` | ❌ Wave 0 |
| REL-02 | The release-diff path classifier (setter / docs / forbidden) | unit | `node --test tests/release-diff.test.mjs` | ❌ Wave 0 |
| REL-02 | The `count_tokens` script with a fake fetch: request shape, subtraction, never logs the key, estimate labels | unit | `node --test tests/mcp-count-tool-tokens.test.mjs` | ❌ Wave 0 |
| (docs) | Counts are 73 (or the documented count equals the built `tools/list` length); stale 68/69 bans; extraction diff; translation gates | contract + showcase gates | `node tests/mcp-version-parity.test.js && npm --prefix showcase/angular run verify:translation-drift && npm --prefix showcase/angular run verify:translation-quality && npx --prefix showcase/angular ng extract-i18n --output-path /tmp/x && diff -u showcase/angular/src/locale/messages.xlf /tmp/x/messages.xlf` | ✅ update |

### Sampling Rate
- **Per task commit:** the quick-run command for the touched area, plus the pin suites for every edited file (grep `tests/` first), plus `node tests/delegation-phase-contract.test.js` when the chain changes.
- **Per wave merge:** all bench, gate and release suites under Node 24 and Node 20.
- **Phase gate:** `npm run validate:extension && npm test` green (7225 free), crawler files restored, and `npm run version:check` green.

### Wave 0 Gaps
- [ ] `tests/bench-conditions.test.mjs`: the condition schedule and the apply/readback executor (EVAL-01)
- [ ] `tests/bench-runs-v2.test.mjs`: v2 rows, safety and jev blocks, schema-1 acceptance (EVAL-01)
- [ ] `tests/fixtures/jev-measurement-real-shape.json` (or reuse of the 68-09 round-trip fixture after the sync re-check)
- [ ] `scripts/bench/gate/lib/synthetic.mjs`: shared generator (EVAL-02)
- [ ] `tests/bench-gate.test.mjs`, `tests/bench-gate-evaluate.test.mjs`, `tests/bench-gate-cli.test.mjs`, `tests/bench-gate-power.test.mjs` (EVAL-02)
- [ ] `tests/release-version-rehearsal.test.js` and the shared helper `tests/helpers/release-doc-parity.js` extracted from `tests/mcp-version-parity.test.js:292-320` (REL-01/02)
- [ ] `tests/fixtures/mcp-release-delta-0.12.0.json` with the embedded 8a058bdf `MCPMessageType` list (captured once with `git show 8a058bdf:mcp/src/types.ts`, recording the command, never at test time), and `tests/mcp-release-compat.test.js` (REL-02)
- [ ] `tests/release-diff.test.mjs`, `tests/mcp-count-tool-tokens.test.mjs` (REL-02)

### Manual-Only Verifications (Validation Block)

These are the CONTEXT M-rows with the research corrections applied. Every Phase 71 plan is `autonomous: true`.

| ID | Block | Behavior | Exact command / steps | Note from research |
|----|-------|----------|-----------------------|--------------------|
| M-71-01 | **V1** | Pin Claude Code for V1 and V4 without touching the everyday install | Download `https://downloads.claude.ai/claude-code-releases/<X.Y.Z>/manifest.json` and `manifest.json.sig`; `curl -fsSL https://downloads.claude.ai/keys/claude-code.asc \| gpg --import`; `gpg --verify manifest.json.sig manifest.json`; fetch the platform binary named in the manifest; `shasum -a 256` against `platforms.<platform>.checksum`; place it at `~/.fsb-bench/claude/<X.Y.Z>/claude`; run V1/V4 with `PATH="$HOME/.fsb-bench/claude/<X.Y.Z>:$PATH"`; `claude --version` prints `<X.Y.Z> (Claude Code)` | Run V1 and V4 from the same shell profile (the `envKeyNamesSha256` includes `LC_*` names) |
| M-71-01b | **V1** | V1 round count from the frozen gate | Add `--rounds <gate.campaigns.baseline.minRounds>` to 66-11's core command | New (Pitfall 1); owner spend decision |
| M-71-02 | **V1** | Bring the baseline results onto Jev | as in CONTEXT `<specifics>` M-71-02, **before** choosing the RC SHA | Pitfall 7 |
| M-71-03 | **V1** | Identity cross-check (Claude version, `git.sha` = `8a058bdf…`, `toolsList.sha256` = `8321cc72…8c4a05` per 69-VALIDATION) | read `scripts/bench/results/core-baseline-66/identity.json` | — |
| (V2) | **V2** | none of Phase 71's own; V4 needs V2 live with `JEV_ENABLED` on | — | — |
| M-71-04 | **V3** | Calibrated profile makes the fast path act; 0 `sensitive_goal` | `node scripts/bench/run-bench.mjs --smoke --pair-via-cdp --arms autopilot --conditions on --expect-extension-id <id> …`; read the raw `jevMeasurement` | — |
| M-71-05 | **V4** | Preconditions | as in CONTEXT, plus: no commits between campaign start and M-71-08; `resumes[]` versions constant | Pitfalls 7, 8 |
| M-71-06 | **V4** | Autopilot gate campaign | CONTEXT command, with `--rounds <gate minRounds>` | Pitfall 1 |
| M-71-07 | **V4** | Claude gate campaign | CONTEXT command, with `--rounds <gate minRounds>` and seed 66 | Pitfall 1 |
| M-71-08 | **V4** | Evaluate and commit the decision | CONTEXT command; the gate report is written beside the decision file (not as `report.md` in the campaign directory) | Pitfall 13 |
| M-71-09 | **V4** | Exact tool-list tokens | `ANTHROPIC_API_KEY=… node scripts/mcp/count-tool-tokens.mjs --model <V1 Claude model> [--model …]` | Pitfall 16 |
| (V5) | **V5** | none of Phase 71's own (record an explicit "none"; the live version-skew row stays with 69) | — | — |
| M-71-10 | **V6** | Step A: extension 1.0.0 | as in CONTEXT, plus the Pitfall 12 fallback if the non-Jev path did not pass | — |
| M-71-11 | **V6** | Step B: MCP 0.12.0 (skip when not passed) | as in CONTEXT, plus: move the `- **Compatibility:**` bullet into the new v0.12.0 section; rebuild and commit the force-tracked `mcp/build` files; `npm view fsb-mcp-server dist-tags.latest` prints `0.12.0` | Pitfall 5 |

## Sync Re-check Items (first task of the first plan; D-02)

Each item compares a quoted interface with the real code. Drift changes the plans and never weakens an upstream test.
1. **66.1:** `settings` arguments `key`/`value` (value coerced to a string); write body fields `key,value,previous,changed,coupled`; `SETTING_UNAVAILABLE` "did not confirm" semantics. Verified in the main tree today (`mcp/src/tools/settings.ts:31-33,43-50,62-78,160-171`).
2. **68-01:** `fsbJevFastModeEnabled` is a writable boolean schema key stored as a real boolean, so `readExtensionStorageFlag`'s strict-true read works.
3. **68-08:** `fsbJevCaptureArmed` is not a settings key; it is read over CDP only.
4. **68-09:** the `jevMeasurement` v1 shape (`68-09-PLAN.md:63`), the attempt cap of 100, and whether it is saved together with `measurement` (Pitfall 9).
5. **68-04:** the "acted attempt" fields (Open Question 4); `CALIBRATION_STATUSES` `['calibrated','uncalibrated','snapshot_changed']` (`67-01-PLAN.md:87`).
6. **67-01:** `FALLBACK_REASONS` (19, `67-01-PLAN.md:82`); scrubber rule 7 as implemented, which the F5 test exercises.
7. **The autopilot terminal reason** exposed by `get_session_detail` (Pitfall 10).
8. **Phase 70 (D-09):** `run_task` reads the switch at each start; the status words; no new tool or required argument; `jevMeasurement` for `source:'mcp'` sessions.
9. **69:** `EXPECT_TOOL_NAMES_VERBATIM` (29); `EXPECT_REQUIRED` flipped by 69-06; `tests/mcp-expect-wire.test.js`; the shape-freeze and settings-contract suites in the chain.
10. **The test chain:** where the bench command sits in `package.json` `test`, and its identical string in `REFINEMENT_ROOT_TEST_COMMANDS` (Pitfall 14).
11. **The docs count inventory** (Pitfall 11), and ListAgents plus `git status` for sibling sessions before touching the xlf files.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no auth surface changes) |
| V3 Session Management | no | — |
| V4 Access Control | no | No new tool. The `settings` writes go through 66.1's existing guards (delegated-write refusal) |
| V5 Input Validation | yes | Exact-key validators: gate file, v2 rows, decision file, delta manifest. `walkStrings` (no `://`, ≤ 200 characters). Refuse rather than repair |
| V6 Cryptography | yes | `node:crypto` only: `createHash('sha256')` for gate and tool hashes, `randomInt` for the 112-bit run token. Never `Math.random` for tokens |
| V7 Error Handling and Logging | yes | `count-tool-tokens.mjs` reads `ANTHROPIC_API_KEY` from the environment and never prints it or the headers. CLIs print codes, never error text with URLs (house rule `run-bench.mjs:30-38`) |
| V10 Malicious Code / Supply chain | yes | No new dependencies. The release-diff check ties shipped code to the measured SHA |
| V14 Configuration | yes | Nothing reaches `main` before V6. A push to `main` runs `deploy.yml` (Fly), `chrome-extension.yml` and `npm-publish.yml` (`npm-publish.yml:3-7`, `chrome-extension.yml:3-19`, `deploy.yml:3-11`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Gate edited after seeing data (moving the goalposts) | Tampering / Repudiation | sha256 pin test, gate hash in campaign identity, author-date ordering check with no override, `gateVersion` bump means a new file |
| Results edited by hand | Tampering | Exact-key row validators; identity binding (sha, gate hash); the evaluator recomputes everything from rows |
| Shipping code that was not measured | Tampering | `check-release-diff.mjs --measured <sha>` before each merge (D-24) |
| A URL, page text or secret in committed artifacts | Information disclosure | `walkStrings`; raw evidence stays in gitignored `.local`; the decision-file validator applies the same rules (except bounded claim sentences) |
| Leaking the API key from the token script | Information disclosure | Environment only; a fake-fetch test asserts the key never appears in stdout or stderr |
| A fast-mode duplicate submit hidden as an LLM event | Repudiation | Safety rules (a)/(b) using `jev.acted` per run; evidence from the fixture log, not agent claims |
| Unsafe fast path shipped | Elevation of privilege | Safety fail triggers the operator switch `JEV_ENABLED=false` before the extension publishes (D-17) |

## Sources

### Primary (HIGH confidence)
- Planning worktree `e1e6439c`:
  - bench code: `scripts/bench/lib/{runs,stats,cdp,mcp-client,claude-arm,outcome}.mjs`, `scripts/bench/{report,run-bench,fixture-server}.mjs`, `scripts/bench/tasks/core/*.json`;
  - release: `scripts/sync-product-version.mjs`, `.github/workflows/{npm-publish,chrome-extension,deploy,ci}.yml`;
  - tests: `tests/{version-sync,mcp-version-parity,bench-report,bench-fixture-server}.test.*`;
  - extension: `extension/ws/mcp-tool-dispatcher.js:2404-2650`, `extension/ai/agent-loop.js:2905-2916`.
- Main tree `2da8c5dc` (read only):
  - MCP: `mcp/src/tools/settings.ts`, the `mcp/src/types.ts` diff since `8a058bdf`;
  - 69-01 helpers: `scripts/mcp/lib/tools-list.mjs`, `tests/helpers/mcp-in-process.mjs`, `tests/mcp-tools-list-shape-freeze.test.js`, `tests/fixtures/mcp-tools-list-8a058bdf.json` (72 tools, includes the three lifecycle tools);
  - test wiring: `package.json` test chain, `tests/delegation-phase-contract.test.js:129-170,2389-2405`;
  - docs and copy: README, MCP README, onboarding, showcase and xlf count sites; `same-source-allowlist.json`.
- Upstream plans: 66-11, 66.1-03/07, 67-01/02/06, 68-01/04/08/09, 69-06; the 67/68/69 VALIDATION files.
- https://platform.claude.com/docs/en/build-with-claude/token-counting: endpoint, tools support, free with RPM limits, estimate note, ~30% newer-tokenizer note.
- https://code.claude.com/docs/en/setup: version install, `manifest.json` + `.sig`, key fingerprint, `DISABLE_AUTOUPDATER`, custom launcher behaviour.
- https://developer.chrome.com/docs/webstore/publish: deferred publishing, 30-day staging.

### Secondary (MEDIUM confidence)
- https://code.claude.com/docs/en/mcp: tool search loads names only at session start; `ENABLE_TOOL_SEARCH` values (summarised by the fetch tool; exact version thresholds not relied on).
- https://metricgate.com/docs/newcombe-difference-interval/: the Newcombe hybrid score formula (cross-checked by computation).
- Local seeded simulations: Newcombe power, coverage and equivalence pass rates; bootstrap coverage; the F5 rule. Scripts kept outside the repo; reproducible from the formulas above.

### Tertiary (LOW confidence)
- Completion-rate range and wall-time variance used in the simulations (A1, A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Everything is existing code or Node built-ins, read directly.
- Architecture: HIGH for the bench and release seams (code-verified); MEDIUM where it depends on the 67, 68 and 70 interfaces (planned, not executed).
- Pitfalls: HIGH for the code-pinned items (2-8, 11, 13, 14); MEDIUM-HIGH for the power findings (exact computation, assumed rates).

**Research date:** 2026-10-15
**Valid until:** 2026-11-14 for the code facts (re-run the sync re-check before execution). The upstream 67, 68 and 70 interfaces may change sooner.
