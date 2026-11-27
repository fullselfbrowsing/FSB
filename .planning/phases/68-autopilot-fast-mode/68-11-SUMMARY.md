---
phase: 68-autopilot-fast-mode
plan: 11
subsystem: phase gate (verification only)
tags: [jev, fast-mode, phase-gate, tolerant-chain, node20, pin-audit, compatibility-audit, registration-audit, validation, d-01, d-02, d-03, d-08, d-20, d-24]

# Dependency graph
requires:
  - phase: 68-01..68-10, 68-12
    provides: "every Phase 68 suite, fixture, golden and code change; 68-SYNC-RECHECK.md (P68_START ba745cfe, item a pins, item h slice hashes)"
  - phase: 67-13
    provides: "the tolerant per-command method (/tmp/fsb-tolerant-runner.mjs), the per-command baseline /tmp/fsb-gate-67.jsonl (348 commands, all exit 0) and the verified Node 20.20.2 binary"
provides:
  - ".planning/phases/68-autopilot-fast-mode/68-VALIDATION.md: status complete, wave_0_complete true, all 35 Per-Task Verification Map rows green with named checks, 10 row-text corrections, Wave 0 and sign-off ticks, the dated Manual-Only deferral line"
  - "Phase 68 gate evidence: tolerant chain 356/356 at exit 0, validate:extension exit 0, Node 20 runs, pin, compatibility, boundary-narrowing and registration audits"
affects: [69, 70, V1, V2, V3, V4, V5, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-by-row gate: each verification-map row's exact command runs into its own log, and the Status cell quotes check names that a script confirmed are present in those logs (203 names, 0 missing)"
    - "A row whose text cites a suite outside its command gets that suite added to the command (row text only), then the corrected command is run"

key-files:
  created:
    - .planning/phases/68-autopilot-fast-mode/68-11-SUMMARY.md
  modified:
    - .planning/phases/68-autopilot-fast-mode/68-VALIDATION.md

key-decisions:
  - "Port 7225 was held by the user's npx fsb-mcp hub (PID 10374) and 7226 was free, so the chain ran in tolerant mode against /tmp/fsb-gate-67.jsonl. No newer per-command pass existed: no Phase 68 SUMMARY records one."
  - "Ten row texts were corrected to match the code, and the commands of AUTO-03-a, AUTO-05-c and AUTO-05-d gained the suites that hold their proofs. No code changed."
  - "The sign-off item 'off-path harness green from the first commit that loads the module, full chain green from the phase's first commit' is left unticked with its reason. It cannot be proven commit by commit: the harness landed one commit after the load line. Both conditions hold at HEAD."

patterns-established:
  - "Phase gates quote check names verbatim and verify them against the captured logs before marking a row green"

requirements-completed: [AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05]

# Metrics
duration: 22min
completed: 2026-10-17
---

# Phase 68 Plan 11: Phase 68 gate Summary

**Phase 68 passes its automated gate.**
- **Full chain:** run in tolerant mode, because the user's hub holds port 7225. All 356 commands exit 0 (16 pretest and 340 test). The 348 commands carried over from the Phase 67 gate keep their exit code 0, and the 8 Phase 68 commands also exit 0.
- **validate:extension:** exits 0.
- **Node 20:** every Phase 68 suite passes under the official Node 20.20.2 binary and under `npx --offline -y node@20`.
- **Audits:**
  - The importScripts pins moved by exactly +1/+1, in one commit (`53576b7e`).
  - The seven item-h slice hashes are unchanged.
  - No `(68-` commit touches a forbidden path, and `mcp/` and `showcase/server/` have no diff since P68_START.
  - fsb://config does not expose the switch.
  - The boundary suite was narrowed only as documented.
  - Every Phase 68 command is registered exactly once in each list.
- **68-VALIDATION.md:** all 35 rows are green, and each cites check names that were verified against the logs. All 13 Manual-Only rows stay deferred to V1-V6.

## Performance

- **Duration:** about 22 min
- **Started:** 2026-10-17T12:12Z
- **Completed:** 2026-10-17T12:35Z
- **Tasks:** 2 of 2
- **Files modified:** 1 (`68-VALIDATION.md`), plus this SUMMARY

## Task 1 evidence: chain, validate:extension, Node 20 and the audits

### Ports (step 1)

- `lsof -nP -iTCP:7225 -sTCP:LISTEN`: held by `node .../.npm/_npx/d92c25bff7522293/node_modules/.bin/fsb-mcp` (PID 10374, the user's hub). It was not touched.
- `lsof -nP -iTCP:7226 -sTCP:LISTEN`: free. The native-host daemon was not running, so `tests/mcp-install-platforms.test.js` could run and exited 0.

### Chain (step 2): tolerant mode

- **Command:** `node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-gate-68`, run in the background and waited for. The runner is the 67-13 method: `scripts.pretest` and then `scripts.test` split on ` && `, each command run through `/bin/sh -c` from the repo root with stdin from /dev/null and `node_modules/.bin` first on PATH, continuing past failures. The rows are in `/tmp/fsb-gate-68.jsonl`, with a copy in `/tmp/fsb-68-11/fsb-gate-68.jsonl`.
- **Runner exit:** 0. Total command time was 299.8 s. No command timed out or was signalled.
- **Result:** 356 commands, all at exit 0.
- **Comparison with the newest prior per-command pass** (`/tmp/fsb-gate-67.jsonl`, the Phase 67 gate: 348 commands, all exit 0), done with `/tmp/fsb-68-11/compare.mjs`:
  `{"baseline":348,"current":356,"nonzeroCurrent":0,"nonzeroBaseline":0,"phase68Commands":8,"phase68Failures":0,"changedExitCodes":0,"newFailures":0,"baselineCommandsMissingNow":0}`
  - No pre-existing command changed its exit code.
  - No baseline command is missing.
  - No new failure.
  - No port-bound suite went red.
- **Phase 68 commands in the chain:**

  | Id | Command | Exit | Time |
  | --- | --- | --- | --- |
  | T333 | `node tests/jev-fast-upstream-contract.test.js` | 0 | 109 ms |
  | T334 | `node tests/jev-fast-settings.test.js` | 0 | 103 ms |
  | T335 | `node tests/jev-fast-menu.test.js` | 0 | 149 ms |
  | T336 | `node tests/jev-fast-path.test.js` | 0 | 208 ms |
  | T337 | `node tests/jev-fast-start-path.test.js` | 0 | 127 ms |
  | T338 | `node tests/jev-fast-loop.test.js` | 0 | 428 ms |
  | T339 | `node --test tests/jev-fast-capture.test.mjs` | 0 | 1033 ms |
  | T340 | `node tests/jev-fast-measurement.test.js` | 0 | 147 ms |

- **Crawler files:** `tests/showcase-build-smoke.test.js` (T104, exit 0) rewrote the three crawler files. `git checkout -- showcase/angular/public/llms.txt showcase/angular/public/llms-full.txt showcase/angular/public/sitemap.xml` restored them. Afterwards `git status --short showcase/angular/public` printed nothing and `git status --porcelain --untracked-files=no` was empty.

### validate:extension

`npm run validate:extension` exits 0 (log `/tmp/fsb-68-11/validate-extension.log`; its last suite prints `write-activation-evidence: 16 passed, 0 failed`).

### Node 20 (step 3)

- **Binary:** `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node` reports `v20.20.2`.
  - Its SHA-256 is `38de4fc456c0c439bac48c727d378f749abb4e31f4116703bb1ee9a746fccbb6`, which equals the value in the interfaces block.
  - The tarball `node-v20.20.2-darwin-arm64.tar.gz` hashes to `466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6`, which equals its line in the adjacent `SHASUMS256.txt`.
  - Nothing was installed globally.
- **Results with that binary first on PATH** (every command exits 0; logs `/tmp/fsb-68-11/node20-*.log`):

  | Command | Result |
  | --- | --- |
  | `node tests/jev-fast-upstream-contract.test.js` | 55 passed, 0 failed |
  | `node tests/jev-fast-settings.test.js` | PASS=93 FAIL=0 |
  | `node tests/jev-fast-menu.test.js` | 130 PASS / 0 FAIL |
  | `node tests/jev-fast-path.test.js` | passed: 920, failed: 0 |
  | `node tests/jev-fast-start-path.test.js` | 153 passed, 0 failed |
  | `node tests/jev-fast-loop.test.js` | 278 passed, 0 failed |
  | `node --test tests/jev-fast-capture.test.mjs` | pass 11, fail 0 |
  | `node tests/jev-fast-measurement.test.js` | 94 passed, 0 failed |
  | `node tests/meta-cognitive-tracker.test.js` | 24 passed, 0 failed |
  | `node tests/jev-extension-boundary.test.js` | passed: 198, failed: 0 |
  | `node tests/settings-schema.test.js` | 1492 passed, 0 failed |
  | `node tests/showcase-privacy-page.test.js` | 98 passed, 0 failed |

- **VALIDATION row ALL-d as written** (`npx --offline -y node@20 ...`, which resolves to v20.20.2 in the npx cache) also exits 0.
- **Static scan:** a grep for `.listen(`, `createServer`, `WebSocket`, `navigator.`, `import.meta.dirname/filename`, `process.getBuiltinModule`, `Iterator.from`, `Promise.try`, `Array.fromAsync`, `RegExp.escape` and `structuredClone` finds nothing in the new suites, the four Phase 68 fixtures or `scripts/bench/shadow/export-capture.mjs`.

### Pin audit (step 4, row ALL-a)

- **Pin suites:** the row's chain exits 0. That chain is `lattice-provider-bridge-smoke` (112 passed), `agent-loop-iterator-guard`, `lattice-step-emitter-smoke`, `lattice-survivability-smoke`, `sidepanel-tab-aware-smoke`, `sidepanel-message-log-smoke`, `mcp-philosophy-parity-smoke`, `extension-content-script-files-completeness`, `delegation-sidepanel-ui` and `npm run validate:extension`.
- **importScripts:** `extension/background.js` holds 338 tokens and 334 call sites at HEAD. That is 337/333 (68-SYNC-RECHECK item a) plus one each. The pins read `passAssertEqual(importScriptsCount, 338, ...)` (`tests/lattice-provider-bridge-smoke.test.js:638`) and `passAssertEqual(importScriptsCallSites, 334, ...)` (`:688`).
  - Exactly one `(68-` commit changed them: `53576b7e` (feat(68-06)), which is also the only Phase 68 commit that touches the lattice test.
  - The only other Phase 68 commit to touch background.js, `19858228` (68-08), left the count at 338.
- **agent-loop.js:** 8 `setTimeout` tokens, 4 schedule lines, one `stepName: 'LLM_TURN'` and one `stepName: 'TOOL_DISPATCH'`.
- **Slice hashes (item h):** recomputed at HEAD with `/tmp/fsb-68-11/slice-hashes.mjs`, which uses the item-h method (the body brace is the first `{` after the parameter list's matching `)`). Every hash equals 68-SYNC-RECHECK item h:

  | Function | File:lines at HEAD | Bytes | SHA-256 |
  | --- | --- | --- | --- |
  | `createSessionHooks` | extension/background.js:4732-4763 | 1347 | `10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780` |
  | `buildSystemPrompt` | extension/ai/agent-loop.js:733-770 | 4633 | `f6d32b22c09f2461c51deae48470b87ae00024d7af9bce8908931b60cb94a7e0` |
  | `getPublicTools` | extension/ai/agent-loop.js:710-716 | 156 | `fa75f080ceb92723ccac1b2d95ec8ff191d20ac6ee9bc59e5a68c1f2baa49706` |
  | `checkSafetyBreakers` | extension/ai/agent-loop.js:259-296 | 1691 | `8a74f88a3894fad05372592f88965d60ad218d023dc3330f320e2fcc1858374a` |
  | `detectStuck` | extension/ai/agent-loop.js:311-554 | 11408 | `4f51f466bef4d3036830cc39ba27669086889259958f3ad14ec0ae4af0027aea` |
  | `buildMarkdownSnapshot` | extension/content/dom-analysis.js:2537-2726 | 7722 | `820fa063ca1215a99e1bf1617f3b6959ef468d14466d4bcc16d551cd6205dc61` |
  | `formatInlineRef` | extension/content/dom-analysis.js:2172-2302 | 5341 | `4c7dae4c52a820cb3092c6b65e58a35cda7345b9d992ca5afd3973478565f8e1` |
  | `getMarkdownSnapshot` | absent (no `function getMarkdownSnapshot(` in dom-analysis.js) | - | none, as recorded |

  Each name is declared exactly once.

### Compatibility audit (step 5, row ALL-c)

- **Commit scope:** `git log --format=%H --grep='(68-' ba745cfe..HEAD` lists 35 commits. Every commit in that range carries `(68-`.
- **Forbidden paths:** for each of them, `git show --name-only --format=` lists none of these:
  - `mcp/`, `extension/ai/tool-definitions.js`, `extension/ai/ai-integration.js`;
  - `extension/ai/jev-state.js`, `extension/ai/jev-client.js`, `extension/ai/jev-policy.js`;
  - `scripts/bench/tasks/`, `scripts/bench/lib/`, `showcase/server/`, `extension/ui/sidepanel.`, `scripts/bench/shadow/records/`.

  The audit printed no violation.
- **No diff since P68_START:** `git diff --quiet ba745cfe..HEAD -- mcp/` exits 0. So do `-- showcase/server/` and the combined diff over the side-panel files, tool-definitions.js, ai-integration.js, the three Phase 67 jev modules, `scripts/bench/tasks`, `scripts/bench/lib` and `scripts/bench/shadow/records`.
- **fsb://config:** `grep -n "fsbJevFastModeEnabled" extension/ws/mcp-bridge-client.js` prints nothing, so fsb://config and `_handleGetConfig` (`mcp-bridge-client.js:3012`) do not expose the switch.
- **FsbJev callers:** `grep -rl "FsbJev" extension/ | grep -v "extension/ai/jev-"` prints nothing.
- **Identity suites:** `node tests/mcp-bridge-background-dispatch.test.js && node --test tests/bench-identity.test.mjs && node tests/tool-definitions-parity.test.js && node tests/capability-mcp-surface.test.js && node tests/recipe-schema-lock.test.js` exits 0. The results include 457 passed, 268 passed and `capability-mcp-surface: 19 passed, 0 failed`.
- **Extension diff since P68_START:** 13 files, +3769/-7. Three of the seven removed lines are in background.js and config.js:
  - the start-path settings read gained the new key (two lines rewritten);
  - the `serverHashKey` schema line gained a trailing comma.
- **Boundary narrowing audit (D-06):**
  - **Token lists:** `UI_CONFIG_JEV_TOKENS` is exactly `['fsbJevFastModeEnabled']`. `UI_CONFIG_TOKEN_FILES` is exactly config.js, init-config.js, options.js and control_panel.html. `BACKGROUND_JEV_TOKENS` is exactly `['fsbJevFastModeEnabled', 'getJevMenu', 'fsbJevCaptureArmed', 'fsbJevCaptureRing', 'jevCaptureObservation']`.
  - **Modules:** `ALL_MODULES` is `MODULES` (jev-state, jev-client, jev-policy) plus `jev-fast-path.js`/`FsbFastPath`.
  - **Card markers:** `id="fsbJevFastModeCard"` and `<!-- /fsbJevFastModeCard -->` each occur once in control_panel.html, at lines 636 and 665.
  - **Removed lines:** `git diff ba745cfe..HEAD -- tests/jev-extension-boundary.test.js` removes 36 lines. None of them defines or applies `TREE_PATTERNS`, `MODULE_PATTERNS`, `URL_PATTERN`, `CALLER_PATTERN` or a vm check. The `TREE_PATTERNS` and `MODULE_PATTERNS` blocks and the `CALLER_PATTERN`, `URL_PATTERN`, `UI_WORD_PATTERN` and `UI_TEXT_PATTERN` lines are byte-identical to P68_START. The removed lines are:
    - the header comments;
    - the documented three-to-four module switches (file set, module scans, inert loads, exact globals: "all four ... exactly the four Fsb* globals");
    - the background.js three-line check, replaced by the four-line-plus-token check;
    - the ui/config scan, replaced by the strip-then-scan with the card range.

### Registration audit (step 6, row ALL-b)

- **Contract suite:** `node tests/delegation-phase-contract.test.js` exits 0 (1246 passed). It prints `... appears exactly once in the refinements root chain` for each of the eight Phase 68 commands.
- **Chain counts:** `/tmp/fsb-68-11/registration.cjs` reports 16 pretest commands and 340 test commands (356 in all), and 67 `REFINEMENT_ROOT_TEST_COMMANDS` entries.
- **Each command:** every one of the eight Phase 68 commands is in `scripts.test` once, in `pretest` 0 times and in the refinement list once. The last eight refinement entries equal the eight commands in chain order.
- **PRE_PHASE6x hashes:** `git diff ba745cfe..HEAD -- tests/delegation-phase-contract.test.js | grep -cE "^[-+].*PRE_PHASE6[0-9]_ROOT_TEST_HASH"` prints 0. The only changed lines in that file are the eight added command strings.

### Safety re-runs (step 7) and the Task 1 verify

- `node tests/jev-policy-tighten-only.test.js && node tests/jev-fast-upstream-contract.test.js && node tests/jev-extension-boundary.test.js` exits 0. The tighten-only suite reports 29650 passed, 0 failed.
- The Task 1 `<verify>` line exits 0: `npm run validate:extension`, `delegation-phase-contract`, `jev-policy-tighten-only`, `jev-fast-upstream-contract`, `jev-extension-boundary`, `jev-fast-loop` and an empty `git status --porcelain --untracked-files=no -- showcase/angular/public`.

## Task 2: 68-VALIDATION.md (commit `ba49f013`)

- **Rows:** every row's exact automated command was run into its own log under `/tmp/fsb-68-11/rows/<key>.log` by `/tmp/fsb-68-11/run-rows.mjs`. All 35 exit 0, including AUTO-01-h's lint, drift, quality and extraction-diff chain.
  - **Status cells:** each now reads `✅ green:` with the exit status, the pass counts and verbatim check names.
  - **Name check:** a script confirmed that all 203 quoted names appear in the captured logs; 0 were missing.
  - **File Exists:** set to ✅ everywhere. No row is red.
- **Frontmatter:** `status: complete`, `nyquist_compliant: true` (kept) and `wave_0_complete: true`.
- **Wave 0:** all eight checklist items are ticked, with a completion note naming the commits.
- **Sign-off:** four items were ticked:
  - Wave 0 coverage;
  - feedback latency;
  - crawler, attribution and no-push. The crawler files were restored, the `(68-` commit messages hold 0 attribution lines, and no remote branch contains the first Phase 68 commit.

  The off-path-from-first-commit item stays unticked, with its reason (see key-decisions). The Approval line records the automated gate.
- **Manual-Only:** all 13 rows (M-68-01..M-68-13) remain with their V-tags, and none is marked done. The added line reads: "Phase 68 automated gate passed on 2026-10-17; the rows above remain deferred to the milestone-end Validation Block (V1-V6) per D-02."
- **Commit scope:** `git show --stat --format= HEAD` lists only `68-VALIDATION.md`.

## Task Commits

1. **Task 1: full chain, validate:extension, Node 20 runs and the pin, compatibility and registration audits.** Verification only; there is no commit, by plan.
2. **Task 2: record results and Manual-Only deferrals in 68-VALIDATION.md.** Commit `ba49f013` (`docs(68-11): record the Phase 68 gate results and Validation Block deferrals`).

**Plan metadata:** the `docs(68-11)` SUMMARY commit that follows.

## Deviations from Plan

### Row text corrected to match the code (never the reverse)

The plan's Task 2 step 1a requires each of these to be listed:

1. **AUTO-02-a (entry shape and cap).**
   - **Row said:** entries were `{handle, role, label, ops, inputType, autocomplete, purpose, hidden, risk, fastEligible, state}`, capped at "the exported `MENU_CAP`".
   - **68-02 builds:** `purpose: {sensitive, danger, intent}`, plus `vaultFilled`, `state: {checked, expanded, selected, pressed}` and `inViewport`. The cap is `FSB.jevMenuConstants.MENU_CAP` (48), and a requested cap is clamped to 32..64.
2. **AUTO-02-e (client construction).**
   - **Row said:** "`createJevClient` keeps `getHashKey = null`".
   - **68-05 does:** the module lazily calls `createJevClient({})` and never names a hash-key supplier, so the client's `getHashKey` stays null.
3. **AUTO-02-f (decisionSource tag).**
   - **Row said:** "actionHistory carries `decisionSource: 'jev'` only when `params.jevHandle` is present".
   - **68-05 `tagActionHistory` does:** it tags the fast step's actionHistory event, matched by iteration and tool name, so the tag keys on the fast step and not on `params.jevHandle`. Page-level scroll and go_back steps carry no handle.
4. **AUTO-03-c (non-accepted reasons).**
   - **Row said:** every non-accepted reason "for operation or target escalates".
   - **68-04 does:** for page ops, a non-accepted target (catch_all, below_threshold, threshold_null) lets scroll or go_back act (F22). The row now says "for the operation, or for the target of an element op". It also names the latches: `not_ok` takes its fallback class's latch, and `not_calibrated` and `malformed` latch the session.
5. **AUTO-04-a (consecutive cap).**
   - **Row said:** `MAX_CONSECUTIVE_FAST` was a budget whose exhaustion "latches the command".
   - **68-05 does:** the constant is `FAST_MAX_CONSECUTIVE` (3). Reaching it declines `consecutive_cap` with no latch, hands the next iteration to the LLM, and the run resets at that LLM turn. The loop check "consecutive cap: the command is not latched; iteration 6 takes a fast step again" proves it. Only the step (12), call (16) and wall-time (20 s) budgets latch the command.
6. **AUTO-04-c (repeat rule).**
   - **Row said:** "the same op on the same element twice".
   - **68-04/05 do:** the rule matches the same op on a control with the same role and label, and needs both steps to have been dispatched.
7. **AUTO-05-d (where exceptions are caught).**
   - **Row said:** "a throwing `beforeTurn` or `afterStep` latches fast mode off".
   - **What happens:** the module catches its own exceptions and latches the session `exception`; `beforeTurn` never rejects. An exception that escapes the module (for example, a replaced method) is caught at the seam without a latch: the iteration runs on the LLM, or the fast iteration completes with no tool message.
8. **AUTO-01-h (archive id and date).** The archive id is named (`september29`), and so is the edit date (October 17, 2026).
9. **AUTO-01-c (card lines).** The card's own lines (`control_panel.html:636-665`) are added next to the Action Change Reports reference.
10. **CAP-a (capture guard line).** The capture guard now sits at `messaging.js:1109`, inside `if (FSB.tools[tool]) {` and before the VIS-01 highlight. The row's c7a7d66f line range is kept and marked as such.

### Row commands extended (row text only)

These rows' texts cite proofs that live in suites outside their commands, so the commands gained those suites. Each corrected command was run and exits 0.
- **AUTO-03-a** adds `node tests/jev-fast-menu.test.js`: the press_enter form oracle and the text-entry ops are 68-02-02's.
- **AUTO-05-c** adds `node tests/jev-fast-start-path.test.js && node tests/jev-fast-path.test.js`: the row names the start-path switch-off case, and the label scrub is 68-04-02's.
- **AUTO-05-d** adds `node tests/jev-fast-path.test.js`: the module-side exception latch is 68-05-02's.

The original commands also exit 0.

### ALL-c list widened

The row text now records that the gate ran the wider list from 68-11-PLAN: the three Phase 67 jev modules, `scripts/bench/lib/` and all of `showcase/server/`, on top of the row's own list.

### Process note

The first row run redirected only the last command of each `&&` chain into its log, although all exit codes were correct. The runner was fixed to wrap each command in `{ ...; }` and all 35 rows were re-run. The status cells come from the second, complete run.

**Total deviations:** 10 row-text corrections, 3 command extensions and 1 audit-list widening. All of them are in `68-VALIDATION.md`. No code, test or fixture changed, and no row was turned green by editing it: every row's command exited 0 before and after the corrections.

## Issues Encountered

None that block. Port 7225 is held by the user's hub, so this was a tolerant pass and not a plain `npm test`. With 7226 free, every port-bound suite still ran and exited 0.

## Known Stubs

None. This plan changes documentation only.

## Threat Flags

None. No code, endpoint or storage changed. Mitigations:
- **T-68-12:** the slice-hash, footprint, fsb://config and tool-list identity audits are all clean.
- **T-68-23:** the Node 20 binary and tarball were re-verified against SHASUMS256.txt, run from /tmp and never installed.
- **T-68-24:** nothing was pushed.
- **T-68-25:** no row was forced green, and no Manual-Only row was marked done.

## Deferred to Validation Block

The complete Phase 68 list. Each item is also recorded in 68-VALIDATION.md under Manual-Only Verifications.

| ID | Block | What waits |
| --- | --- | --- |
| M-68-01 | V1 | None. Fast mode is default-off and the V1 baseline runs at `8a058bdf`, before any Phase 68 code. |
| M-68-02 | V2 | No Phase 68 item of its own. Note for the V2 operator: before the deploy, a switched-on session gets a 404, which maps to `invalid_request` and latches fast mode off for the session after one call. |
| M-68-03 | V3 | Recorded-llm capture campaigns with the switch on and `export-capture.mjs --arm on`; export to `scripts/bench/.local/shadow/recorded-llm/`; drop counts by reason; a run directory with the 67-10 hand seeds for `run-shadow --records DIR`; then `--arm off`. |
| M-68-04 | V3 | Calibration on the V2 pin and a calibrated profile acting on the bench fixtures. Freeze MENU_CAP 48, MENU_POOL 256, the ordering and the excerpt length. Revisit the numeric defaults (12 steps, 16 calls, 20 s, 3 consecutive steps, escalation latch 3, menu deadline 1.5 s, snapshot deadline 3 s, ring 200). Review the not-a-fit questions. Decide where recorded-llm records are committed, given the exactly-25-hand-records assertion. |
| M-68-05 | V4 | The comparative gate through `run_task` after Phase 70: the baseline, the non-Jev control and the fast-mode arm. Check that the capture arm key is unset in every arm, count the `sensitive_goal` bench goals, read Jev cost and latency from `jevMeasurement`, and watch `meta_cognitive_loop_break` stops (the same-path residual). |
| M-68-06 | V5 | The card and copy in the real Advanced Settings panel (unpacked build on Profile 2 or 5). An MCP write refreshes an open panel and a Save does not revert it. |
| M-68-07 | V5 | A real switched-on task with an uncalibrated or disabled gateway: at most one menu and one Jev call, nothing acts, and the run otherwise matches the switch-off run. |
| M-68-08 | V5 | Real-page freshness on a re-rendering site, in a visible foreground tab, with stale targets escalating. Also: truthful summaries, runaway pages stopped by the breakers, shadow-DOM selector uniqueness and real `isElementActionable`. |
| M-68-09 | V5 | Human review of the translated privacy text in de, es, ja, ko, zh-CN and zh-TW, legal meaning included. |
| M-68-10 | V6 | The deployed privacy page (the section, Limited Use, the September 29 archive, the October 17 date) and a route sentence that matches V2's route. |
| M-68-11 | V6 | The Chrome Web Store privacy-practices form, certifications and listing text, matching `SHARED_PHRASES`. |
| M-68-12 | V6 | The MCP-enable consent review: an MCP client can turn the switch on without seeing the card, and the write is logged. |
| M-68-13 | V6 | The release: the new suites on CI's Node 20, and nothing pushed before V6 (a push to `main` triggers deploy, extension packaging and npm publish). |

Deferred: M-68-01 (V1), M-68-02 (V2), M-68-03, M-68-04 (V3), M-68-05 (V4), M-68-06..M-68-09 (V5), M-68-10..M-68-13 (V6).

## User Setup Required

None.

## Next Phase Readiness

- Phase 68 is code-complete and gate-green. The orchestrator owns the STATE.md, ROADMAP.md and REQUIREMENTS.md updates.
- **Phase 70** must re-verify the card and privacy copy once fast mode covers `run_task`. The intro, scope and Limited Use text say "autopilot" today.
- **Next gate baseline:** `/tmp/fsb-gate-68.jsonl` (356 commands, all exit 0), with a copy in `/tmp/fsb-68-11/`.

## Self-Check: PASSED

- FOUND: .planning/phases/68-autopilot-fast-mode/68-VALIDATION.md (status complete, wave_0_complete true, nyquist_compliant true, 35 green rows, 13 Manual-Only rows)
- FOUND: commit ba49f013 (docs(68-11)), which touches only 68-VALIDATION.md and carries no attribution line
- FOUND: /tmp/fsb-gate-68.jsonl (356 rows, all exit 0) and /tmp/fsb-68-11/rows.jsonl (35 rows, all exit 0)
