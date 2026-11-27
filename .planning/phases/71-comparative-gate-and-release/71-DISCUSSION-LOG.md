# Phase 71: Comparative Gate and Release - Discussion Log (Assumptions Mode, Auto)

> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-10-15
**Phase:** 71-comparative-gate-and-release
**Mode:** assumptions + auto. There was no user to confirm. Every Likely or Unclear item was auto-resolved to the option that best fits the owner's stated direction, and every Confident item was locked as stated.
**HEAD analyzed:** `e1e6439c` on branch `Jev` (planning worktree `the repository root`).
- Main-tree progress was read without writing to it: Phase 66.1 has executed (up to `f978e989`) and Phase 69 is at 69-03 (`32d072e5`).
- Phases 67 and 68 are planned but have not executed. Phase 70 has no plans.
- `scripts/bench/` is byte-identical between `8a058bdf` and `e1e6439c`.

**Areas analyzed:**
1. Comparison design: which runs make up the three arms
2. What each run must record
3. The predeclared gate and the evaluator
4. Release prep: versions and compatibility checks
5. Docs: automated in Phase 71 vs. left for V6

## Assumptions Presented

### 1. Comparison design
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Comparisons stay within one driver; only the frozen core set counts toward the gate; the baseline is `core-baseline-66` at `8a058bdf` (schema-1 rows), read unchanged; V1 results are cherry-picked onto Jev | Confident | `report.mjs:47,56`; `66-CONTEXT.md` D-15; `66-RESEARCH.md:292`; `66-11-PLAN.md:8-15,44,114`; `core.lock.json` |
| Control and fast mode run in one V4 campaign, alternating run by run inside the ABBA schedule; the switch is set and read back before t0 | Likely | `runs.mjs:53,132-164`; `68-01-PLAN.md:29`; 68 D-04; `identity.mjs:151-178`; `run-bench.mjs:958-998`; `cdp.mjs:377-396` |
| The autopilot arm drives `run_task`, so it measures both autopilot fast mode and the `run_task` fast loop; two labelled verdicts; no side-panel driver | Likely | `68-CONTEXT.md:412,457,473`; `68-VALIDATION.md:170`; 68 D-05; `mcp-client.mjs:257-291` |
| The non-Jev MCP changes are judged on the Claude Code arm across campaigns with matching identity; autopilot baseline vs control is a drift sentinel | Unclear | `69-VALIDATION.md:197,203`; 68 D-01; `run-bench.mjs:999-1037`; `PITFALLS.md:80-100` |

### 2. What each run must record
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Additive v2 row schema (condition, Jev activity and cost, safety counts); the validator still accepts schema-1 rows; parity across `runs.mjs`, `report.mjs` and tests | Unclear | `runs.mjs:35-39,419-425,514`; `tests/bench-report.test.mjs:76-90,207-209`; `run-bench.mjs:806-808`; `68-09-PLAN.md:63`; `68-VALIDATION.md:170` |
| Phase 71 relies on Phase 70 for three things: the switch read at each start, `jevMeasurement` projected for `run_task` sessions, and the claimed-status words | Likely | ROADMAP Phase 70 SC1-2; `68-09-PLAN.md:42,115-123`; `run-bench.mjs:769-779` |
| LLM cost and Jev cost are separate and never summed; per-decision latency only in diagnostics; speed reads `wallMs` | Confident | 68 D-23; `report.mjs:43,51`; `run-bench.mjs:763-765`; ROADMAP Phase 71 SC2; `PITFALLS.md:88,476` |
| A fast-arm result counts only when Jev demonstrably acted; the F5 `sensitive_goal` trap must be fixed before V4 | Unclear (which phase fixes F5) | `68-RESEARCH.md:385,839`; `68-VALIDATION.md:170`; 68 D-02; core task instructions |

### 3. The predeclared gate and the evaluator
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| The gate is a committed JSON file under `scripts/bench/` with an exact-key validator and a sha256 pin; campaigns record its hash; only the evaluator CLI checks commit-date ordering | Likely | `67-02-PLAN.md:20-24,32-34`; `67-VALIDATION.md:27`; `66-RESEARCH.md:292` |
| Speed: `geoMeanMedianRatio` with the hierarchical bootstrap; "faster" requires the whole CI below 1.0 and an effect beyond the A/A floor; PROJECT targets are reported, not pass conditions | Unclear | `stats.mjs:34-51,79-90`; 66 D-16; ROADMAP milestone note; `PROJECT.md:48` |
| Completion: non-inferiority with a predeclared margin; needs a difference-CI helper; infra errors outside denominators | Unclear (margin, rounds, multiplicity) | `stats.mjs:52-56`; `report.mjs:233-271`; 66 D-17 |
| Safety: zero-tolerance and code-checked (duplicate or unexpected mutation, false success claim, weakened confirmation, meta-loop stop on a progressing task); cost reported, not gated | Likely | REQUIREMENTS EVAL-02, JEV-06; `runs.mjs:408-417`; `core-click-confirm-modals.json`; `68-VALIDATION.md:96,170` |
| A failing or unexercised path stays as Phase 68 ships it; a per-path decision file; no new switch | Likely | `68-CONTEXT.md:96,451,473`; `67-CONTEXT.md:98`; REQUIREMENTS Out of Scope |

### 4. Release prep
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| A temp-root rehearsal of both setters now; real bumps in V6 | Confident | `sync-product-version.mjs:9-11,201-227,366-455,562`; `tests/version-sync.test.js:44,70-85,132`; `tests/mcp-version-parity.test.js:308-314` |
| MCP 0.11.2 → 0.12.0, with the changelog anchor, heading and artifact text | Likely | `mcp/package.json:3`; `mcp/server.json:6,20`; `mcp/src/version.ts`; `PROJECT.md:40` (stale) |
| Compatibility composes the existing pins plus an explicit allowlist diff; a V6 check that the release differs from the V4 SHA only in version, CHANGELOG and doc files | Likely | `69-01-PLAN.md:11-15,192-196`; `69-06-PLAN.md:56,101-171`; `66.1-07-PLAN.md:19,66-67`; `66.1-03-PLAN.md:191`; `tests/mcp-version-parity.test.js:357-384`; `run-bench.mjs:969-971` |
| The extension must publish before MCP 0.12.0, which needs an explicit V6 order | Unclear | `69-VALIDATION.md:206`; `npm-publish.yml:4-7,52-66,258`; `chrome-extension.yml:100-120` |
| The MCP README templates hard-code `mcp:task-status` and "Existing `0.10.0` tool routes"; generalizing them is gate-independent | Likely | `sync-product-version.mjs:271-327`; `mcp/README.md:45,669`; `tests/mcp-version-parity.test.js:298` |

### 5. Docs
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Gate-independent docs (counts to 73, showcase "68 tools", the `settings` row, the `expect` reference) are automated in Phase 71 with paired pins and locale sync; gate-dependent copy waits for V6 | Likely | `66.1-CONTEXT.md:190,329`; `69-CONTEXT.md:404-405`; `69-08-PLAN.md`; `tests/mcp-version-parity.test.js:327-334`; 68 D-07 |
| The prompt's "FSB Tool Reference (49 tools)" table is not updated in v1.0.0 | Confident | `66.1-07-PLAN.md:19,66-67`; `tests/mcp-version-parity.test.js:335` |

### Extra code checks made during this discussion (beyond the analyzer)
- **The run-row safety data already exists in the raw record.** `outcome.checks[].detail` keeps `{matched, expected}` for request checks (`outcome.mjs` `checkRequest`), and the raw record keeps the full request log (`run-bench.mjs:780-830`). Only `checksBlock` drops them. So duplicates and unexpected mutations can be computed at commit time without a sidecar (D-08).
- **Every core task has a total-count request check** (method and path, no body; for example `POST /api/checklist/save` x1, `POST /api/kanban-moves/move` x3). "Duplicate" (matched greater than expected) and "unexpected mutation" (a non-GET request under `/api/` that no check names) are therefore well defined from the task files alone, with no separate allowlist (D-08, D-15).
- **Run token shape.** The token is `randomBytes(16).toString('base64url')` (`fixture-server.mjs:416`), which mixes letters and digits. That confirms F5. `TOKEN_PATTERN` (`:50`) also admits a letters-only token (D-07).
- **The tool-count discrepancy.** The pinned fixture `tests/fixtures/mcp-tools-list-8a058bdf.json` in the main tree lists 72 tools. Every one appears somewhere in `mcp/README.md`, but `complete_task`, `partial_task` and `fail_task` are absent from its tables, which sum to 69. So "69" is the 72 minus the three lifecycle tools, and the README's own "Tool Count Contract" (registered handlers) already makes it stale. 73 means documenting those three plus `settings` (D-27).
- **The step-A version trap.** `setExtensionVersion` calls `setMcpReadmeSurfaces(version, mcpVersion)` (`sync-product-version.mjs:415`). That writes "`fsb-mcp-server` <mcp> requires FSB extension <manifest> or newer for `mcp:task-status`". `--check` re-runs both setters and requires byte equality (`:620-635`). So releasing extension 1.0.0 with MCP still at 0.11.2 forces a false README sentence (D-22).
- **The changelog precedent.** The v0.9.92 section of `CHANGELOG.md` already carries an "MCP-only update (2026-10-14): the package advances to `0.11.2`" paragraph. That satisfies the parity rule "align at" plus "advances to" for a later MCP-only release, and it is the template for step B (D-20, D-25).
- **The What's New rename.** `setMcpReadmeSurfaces` renames the first `### What's New In vX` heading in place (`replaceFirstCurrent`). V6 must therefore author a new `### What's New In v0.12.0` section above the old one first, or the 0.11.2 notes are relabelled (D-20).
- **Pinning Claude Code by environment would break identity.** The bench resolves `claude` from PATH and builds the child environment from an allowlist (`claude-arm.mjs:60-97`). `DISABLE_AUTOUPDATER` is not on it, and adding it would change `envKeyNamesSha256` between V1 and V4. So pinning goes through a bench-only binary on PATH (D-06).
- **Settings tool in the main tree.** `mcp/src/tools/settings.ts` and `tests/mcp-settings-tool-contract.test.js` exist there. 66.1-03 answers `SETTING_UNSUPPORTED` against older extensions, and 69-06 fills `expect_result` `uncertain`/`extension_unsupported`. MCP 0.12.0 with extension 0.9.92 therefore degrades gracefully, which shapes the generalized compatibility sentence (D-22).
- **Meta-loop stops are truthful terminal outcomes.** `meta_cognitive_loop_break` is a `stopped` terminal outcome (`agent-loop.js:2911-2916`). It already fails completion, so treating it as a safety failure would double-count it (D-15).

## Corrections Made

None. Auto mode: there was no user, and every Likely or Unclear item was auto-resolved (below).

## Auto-Resolved

1. **The V4 campaign layout (D-04).**
   - **Chosen:** the primary assumption, refined. There are two V4 campaigns at the release-candidate SHA:
     - `core-gate-71-autopilot`: `off` and `on` interleaved inside ABBA, 20 rounds, seed 71;
     - `core-gate-71-claude`: `off`, 10 rounds, seed 66.
   - **Condition** is a new schedule dimension rather than a new arm value, and V1 run ids stay byte-identical.
   - **The switch** is written through the 66.1 `settings` tool and read back independently over CDP. A mismatch is a pausing infra code. The capture arm key must read false.
   - **Reason:** Interleaving controls xAI and gateway drift. The product-path write proves SET-02 reachability, and the CDP readback keeps the check claim-blind. Alternative (c), a new arm value, would overload `arm`, which the report and the v1 rows treat as the driver. The Claude arm runs only with the switch off, because the fast switch affects only `run_task`.
2. **Path attribution (D-05).**
   - **Chosen:** the primary assumption. One comparison gives two labelled Jev verdicts. No side-panel driver.
   - **Reason:** 68-CONTEXT:457 and M-68-05 already route V4 through `run_task`. A side-panel driver is new tooling for a path that shares the loop mechanics. It is deferred until Phase 70 diverges.
3. **Judging the non-Jev MCP path across campaigns (D-05, D-06).**
   - **Chosen:** the primary assumption plus alternative (b). The Claude arm compares pin vs candidate with the switch off, with required identity equality and the autopilot drift sentinel, and Claude Code is pinned for V1 and V4 through a bench-only binary on PATH. The fallback, alternative (a), a block-swapped re-baseline, is predeclared in the gate, and running it is an owner decision at V4.
   - **Reason:** Alternative (c), context only, would leave MCP-01 and MCP-02 without any whole-task evidence. Pinning removes the largest confounder. PITFALLS Pitfall 2 shows that hosts ship weekly and the tool-description limits changed in v2.1.295-296.
4. **Run-row evidence (D-08).**
   - **Chosen:** alternative (a), a v2 row schema. `RUN_ROW_KEYS` stays the frozen v1 list and `RUN_ROW_KEYS_V2` is added. The validator dispatches on `schemaVersion`. A safety block is computed from the raw check details and the request log. `endLabel` is added.
   - **Reason:** One source of truth for the report and the evaluator. The v1 key pin does not move. Option (b), a sidecar, adds a second hand-mirrored validator. Option (c), raw-only, leaves the committed evidence unable to support the gate.
5. **The F5 fix (D-07).**
   - **Chosen:** alternative (b). Phase 71 changes the bench run-token shape and proves it against the real 67-01 scrubber. If no shape passes, it stops and hands the fix to Phase 70.
   - **Reason:** This is the smallest change, and it touches no product code or redaction contract. Option (a) changes what users send to Jev, a product and privacy decision that belongs to Phase 70. Option (c) makes the instruction differ from the baseline and breaks the drift sentinel.
6. **Gate artifact and ordering (D-11).**
   - **Chosen:** the primary assumption. `scripts/bench/gate/release-gate-v1.0.0.json` with an exact-key validator, a sha256 pin test, the hash recorded in each candidate identity, and the commit-date check in the CLI only. The gate must predate every evaluated campaign, the V1 baseline included, and there is no override.
   - **Reason:** The 67-02 precedent. Shallow-clone CI forbids git in registered tests. Requiring the gate to predate V1 stops anyone tuning margins on baseline data.
7. **The speed criterion (D-12).**
   - **Chosen:** the primary assumption plus alternative (b)'s spirit as a minimum practical effect. For the Jev path, all three must hold: the CI upper bound below 1.0, a point estimate of at most 0.90, and an estimate below the control A/A CI. The non-Jev MCP path is judged on non-inferiority of time (CI upper bound at most 1.10), with a separate "faster" label. Targets are reported by category.
   - **Reason:** Without a practical bound, a 3% speedup could ship as "fast mode" while it sends page context off the device. The non-Jev changes mainly cut context, so their release should hinge on not being slower, not on beating a cross-campaign speed bar.
8. **The completion criterion (D-13).**
   - **Chosen:** alternative (a), the Newcombe hybrid score interval on pooled counted runs. The margin is 10 points, at 95% two-sided (one-sided 2.5%). It applies to fast vs control, candidate vs pin (Claude), and as an equivalence check for the sentinel. A seeded power simulation before freezing may raise the rounds, never the margin.
   - **Reason:** The corpus is fixed, so tasks are strata, not a random sample. A pooled interval over a balanced stratified design is conservative. A 12-cluster bootstrap undercovers (External Research 1). Sizing: about ±6 points at 120 runs per arm and p≈0.9. A 5-point margin has power of about 0.45 even at 20 rounds, while 10 points at 20 rounds gives about 0.87 at p=0.85.
9. **Multiplicity (D-14).**
   - **Chosen:** an intersection-union rule within each path and no adjustment across the two path families. A Bonferroni sensitivity line is printed.
   - **Reason:** The intersection-union rule controls the path error without adjustment. Each family is a separate release decision. 67-02's Bonferroni correction addresses selection over many grid cuts, which does not happen here.
10. **Safety (D-15). Narrows the analyzer's list.**
    - **Chosen:** zero tolerance for duplicate requests, unexpected mutations and false success claims:
      - rule (a): any event in a run where Jev acted fails the path;
      - rule (b): other events are compared with control;
      - weakened confirmations are covered by named offline suites run at the measured SHA;
      - `meta_cognitive_loop_break` stops are completion diagnostics, not safety failures.
    - **Reason:** The LLM path can double-submit on its own. Absolute zero tolerance would fail fast mode for LLM behaviour, while ignoring those events would hide fast-mode duplicates. Confirmations never appear on the fixtures, so they can only be proven offline. A meta-loop stop is a truthful, safe stop that already counts against completion.
11. **Consequences of each verdict (D-17).**
    - **Chosen:**
      - **Jev path:** pass ships it as built. A speed or completion failure, `inconclusive` or `not_exercised` ships it unchanged and experimental, with honest release notes. A safety failure disables it for every install through `JEV_ENABLED=false` before the extension is published.
      - **Non-Jev MCP path:** a failure or `inconclusive` withholds the MCP 0.12.0 publish.
      - No new switch and no constant change after V4.
    - **Reason:** Both Jev verdicts come from one comparison, so one combined disable is consistent, and alternative (a)'s per-path constant would change code after V4. The non-Jev changes reach users only through the npm package, so withholding the publish disables them with no code change.
12. **Publish order (D-25).**
    - **Chosen:** alternative (a), two merges: extension 1.0.0 first with MCP at 0.11.2, which npm skips; the MCP 0.12.0 merge after the Chrome Web Store shows 1.0.0 live. The dashboard's deferred publishing is optional.
    - **Reason:** No workflow change is needed. It meets the 69 V6 requirement (extension first), and the review time of a few days to a few weeks (External Research 4) is too long a gap for option (b). Option (c) needs a reviewed workflow change and is deferred.
13. **README template generalization (D-22).**
    - **Chosen:** generalize now. The compatibility sentence states each MCP version's declared minimum extension version and its reason. The parity pins move in the same commit, and `version:check` stays green.
    - **Reason:** The extra code check showed step A would otherwise force a false sentence. The change does not depend on the gate.
14. **The release-diff check (D-24).**
    - **Chosen:** re-apply the version setters to an export of the measured tree, then compare with the release commit outside a docs allowlist.
    - **Reason:** The setter targets include code files (`extension/ui/*.js`, `mcp/src/index.ts`, `install.ts`, `platforms.ts`). A plain path allowlist would admit arbitrary code changes in them. Re-deriving the setter output is exact.
15. **Docs now vs V6 (D-27, D-28).**
    - **Chosen:** the primary assumption. Counts go to 73, with the three lifecycle tools and `settings` documented, and the showcase locale digits are synced. The `settings` and `expect` references use wording that holds in both gate outcomes. Gate-dependent copy waits for V6.
    - **Reason:** Alternative (a) crowds locale work into the release window. Alternative (b) leaves the showcase at "68" against a 73-tool server. Wording such as "arrive in fsb-mcp-server 0.12.0" stays true whether or not 0.12.0 is published.
16. **Addition beyond the analyzer: an offline `count_tokens` script for V4 (D-26).**
    - **Chosen:** build `scripts/mcp/count-tool-tokens.mjs` now, proven against a fake fetch, so the 69 V4 row has an exact command.
    - **Reason:** The API is free, takes `tools=`, and returns an estimate. Counts differ by tokenizer generation, so V4 must count against the model the bench used (External Research 2).
17. **Addition beyond the analyzer: the "exercised" precondition uses intention to treat (D-10, D-16).**
    - **Chosen:** verdicts use every run with the switch on. A path is judged only when at least 50% of those runs acted, the profile was calibrated with one served model and instrument version, the capture arm was unset, and no control run leaked.
    - **Reason:** A user who turns the switch on gets the whole-task result, declines included. Per-protocol figures would overstate the benefit, so they appear only in diagnostics.

## External Research

All sources were fetched on 2026-10-15.

1. **Non-inferiority statistics for task-clustered binary outcomes.**
   - **Few-cluster bootstraps undercover.** With about 15 clusters, cluster-bootstrap intervals show consistent undercoverage around 90% or below, and 20-50 groups may be needed for a stable cluster bootstrap. At 12 tasks, a task-resampling interval for completion would be optimistic.
   - **Newcombe's hybrid score interval** for a difference of independent proportions is built from two Wilson intervals. It keeps close-to-nominal coverage without being needlessly wide.
   - **Clustered non-inferiority tests** need adjustment when units are clustered, and the number of clusters drives type-1 error and power.
   - **Effect.** The frozen corpus makes tasks fixed strata, so the pooled Newcombe interval on a balanced design is valid and conservative. The cluster bootstrap is reported as descriptive only. Power is checked by simulation before the gate is frozen (D-13).
   - Sources: https://www.econ.queensu.ca/research/working-papers/1315 , https://metricgate.com/docs/newcombe-difference-interval/ , https://pmc.ncbi.nlm.nih.gov/articles/PMC2717020
2. **Anthropic `count_tokens` with `tools=`.**
   - The endpoint accepts the same inputs as message creation, including client tools.
   - "The token count is an **estimate**". Counts may include system-added tokens, which are not billed.
   - Claude 4.7 and later models, and the Fable and Mythos 5.x models, use a newer tokenizer that produces "approximately 30 percent more tokens". The docs say to recount against the model you will use.
   - The endpoint is free and rate-limited per tier.
   - Server tools and the MCP connector are rejected, so the script sends the tool definitions as client tools.
   - **Effect.** D-26 subtracts a no-tools count, labels the result an estimate, and counts against the bench's pinned model.
   - Source: https://platform.claude.com/docs/en/build-with-claude/token-counting
3. **Pinning Claude Code, and tool-loading behaviour across versions.**
   - The native installer takes a version (`bash -s 2.1.89`). Releases publish a signed `manifest.json` with SHA-256 checksums.
   - Auto-update can be disabled with `DISABLE_AUTOUPDATER`. `DISABLE_UPDATES` blocks every update path. A custom launcher is left in place by auto-update.
   - **Tool search** is on by default: "Only tool names and server instructions load at session start". `ENABLE_TOOL_SEARCH` accepts unset, `true`, `auto`, `auto:N` and `false`.
   - **Behaviour changes across versions.** The description-length limits changed in v2.1.295 and v2.1.296, and `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` needs v2.1.280 or later.
   - **Effect.** The version must match between V1 and V4 (D-06). It is pinned through a bench-only binary on PATH, because the bench's environment allowlist would record any added variable in `envKeyNamesSha256`. Shorter descriptions reach the context only when a tool is loaded, which the report notes beside the token counts.
   - Sources: https://code.claude.com/docs/en/setup , https://code.claude.com/docs/en/mcp
4. **Chrome Web Store review, deferred publishing and npm dist-tags.**
   - **Review time.** "For most extensions, review is completed within a few days, but it can take up to a few weeks." Broad host permissions, sensitive permissions and significant code changes lengthen review, and FSB has all three.
   - **Deferred publishing.** Unchecking the publish-on-approval option stages the item, and "you will have up to **30 days** to publish". The API also has `setPublishedDeployPercentage`.
   - **npm.** `npm publish --tag=<tag>` leaves `latest` untouched, and `npm dist-tag add <pkg>@<version> latest` promotes it later.
   - **Effect.** A two-merge order with no workflow change (D-25). The dist-tag route is deferred because it needs a reviewed edit to `npm-publish.yml`, which currently publishes with `--tag latest`.
   - Sources: https://developer.chrome.com/docs/webstore/review-process , https://developer.chrome.com/docs/webstore/publish , https://docs.npmjs.com/cli/v10/commands/npm-dist-tag
