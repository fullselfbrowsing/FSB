---
phase: 71-comparative-gate-and-release
plan: 09
subsystem: release
tags: [mcp-compat, release-delta, release-diff, count-tokens, rel-02, d-23, d-24, d-26]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-08)
    provides: the wave order and the declared MCP compatibility map; the release rehearsal
  - phase: 69 (69-01, 69-06)
    provides: tests/fixtures/mcp-tools-list-8a058bdf.json, scripts/mcp/lib/tools-list.mjs, tests/helpers/mcp-in-process.mjs (EXPECT_TOOL_NAMES_VERBATIM, listCurrentTools), the expect skew fill
  - phase: 66.1 (66.1-03)
    provides: the settings tool and SETTING_UNSUPPORTED from older extensions
provides:
  - "tests/fixtures/mcp-release-delta-0.12.0.json: the reviewed fsb-mcp-server 0.12.0 delta against 8a058bdf (tools, optional properties, required arguments, MCPMessageType)"
  - "tests/mcp-release-compat.test.js: the built tools/list and mcp/src/types.ts delta must equal the manifest exactly; the four companion suites must stay registered (REL-02-b)"
  - "scripts/release/lib/release-diff.mjs: DOCS_ALLOWLIST, GATEWAY_PREFIX, isDocsPath, classifyPath, judgeDifferences, parseNameStatus, parseArgs (pure)"
  - "scripts/release/check-release-diff.mjs: the git CLI V6 runs after committing each bump (REL-02-c)"
  - "scripts/mcp/count-tool-tokens.mjs: the count_tokens script V4 runs (M-71-09, REL-02-d)"
affects: [71-10, 71-11, 71-12, V4, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A reviewed delta manifest: the observed difference between a frozen fixture and the built artifact is computed without reading the manifest, then compared with it, so every unreviewed change is printed by name"
    - "Bind a release to a measured commit: export the measured tree, replay only the docs and the setters, then byte-compare every differing path and every setter target with the release commit"
    - "Secrets only through injected env: the key never leaves deps.env except as a request header, and every test scenario scans captured stdout and stderr for a sentinel key"

key-files:
  created:
    - tests/fixtures/mcp-release-delta-0.12.0.json
    - tests/mcp-release-compat.test.js
    - scripts/release/lib/release-diff.mjs
    - scripts/release/check-release-diff.mjs
    - tests/release-diff.test.mjs
    - scripts/mcp/count-tool-tokens.mjs
    - tests/mcp-count-tool-tokens.test.mjs
  modified:
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The release-diff comparison set is the measured..release diff plus every --print-targets path, so a release that skipped a setter (a target the setter changes but the release does not) also fails"
  - "The checker runs the measured tree's own scripts/sync-product-version.mjs (and its --print-targets) with FSB_VERSION_SYNC_ROOT on the exported tree; a changed setter is itself a forbidden difference"
  - "The measured tree is exported with git archive --output to a temp file and extracted with tar -x -f (the whole tree is about 373 MB, too large to buffer through spawnSync); the temp directory is removed in finally"
  - "Differing paths come from git diff --no-renames --name-status -z, so additions and deletions are known and a rename is a deletion plus an addition"
  - "count-tool-tokens sends four POSTs per model (with and without tools for each list) and carries its own copy of the 69-01 build-freshness guard, so scripts/ never imports tests/"

patterns-established:
  - "Release-time git CLIs follow the evaluate-gate shape: main(argv, overrides) with an injected runChecked, refusals before any export, exit 0/1/2"

requirements-completed: [REL-02]

# Metrics
duration: 15min
completed: 2026-10-19
---

# Phase 71 Plan 09: Release Delta, Release-Diff Checker and count_tokens Summary

**Three REL-02 checks that can run now. A reviewed delta manifest pins exactly what fsb-mcp-server 0.12.0 adds over the 8a058bdf pin: the `settings` tool, an optional `expect` on 29 tools, and two message types. Any other tool, property, required argument or message type fails the chain. A release-diff checker binds the V6 release commit to the commit V4 measured: only docs and setter output may differ, and the deployed gateway's code is never treated as docs. A `count_tokens` script lets V4 measure the tool-list tokens per model, never printing the key.**

## Performance

- **Duration:** about 15 min
- **Started:** 2026-10-19T03:17Z
- **Completed:** 2026-10-19T03:32Z
- **Tasks:** 3/3
- **Files:** 7 created, 2 modified, plus this SUMMARY

## Accomplishments

- **No unreviewed MCP addition can ship (D-23, MCP-04, SC4).** `tests/mcp-release-compat.test.js` lists the built runtime in-process with `listCurrentTools()`, which runs the 69-01 freshness guard so a stale build fails loudly. It computes the observed delta against the frozen fixture without reading the manifest, then requires that delta to equal the manifest exactly. It prints each difference with its tool name. It never runs git: the pin's MCPMessageType list is data in the manifest, next to the command that captured it.
- **It composes with the existing suites.** It does not re-check goldens, digests or the full shape freeze. It requires each of the four companion suites to appear exactly once in `scripts.test`, and it checks that the two older-extension cases it names exist in their suites.
- **The release is bound to the measured commit (D-24).** `check-release-diff.mjs` refuses `uncommitted_changes` before any export, and refuses `measured_not_ancestor` too. Then it exports the measured tree, copies in the release's docs and runs the step's setters. Every setter target, and every non-docs path that differs, must then equal the release commit byte for byte.
- **V4 has its token tool (D-26).** `count-tool-tokens.mjs` converts both lists to `{name, description, input_schema}` through `canonicalJson` and subtracts the same model's no-tools count. It labels the result an estimate and prints both caveats. It reads the key only from `deps.env`.
- **Registration.** `node tests/mcp-release-compat.test.js` is appended to the end of `scripts.test` and of `REFINEMENT_ROOT_TEST_COMMANDS`; it runs after `npm --prefix mcp run build`, which is index 12. `tests/release-diff.test.mjs` and `tests/mcp-count-tool-tokens.test.mjs` end the bench `node --test` command in both lists. The chain now has 348 commands.
- **Footprint.** No `mcp/src` or `mcp/build` change: `git diff --quiet $P71_START -- mcp/src mcp/build` exits 0, and `git status --short mcp/build` was empty after the build.

## Task Commits

1. **Task 1: Reviewed MCP 0.12.0 delta manifest and the compatibility suite.** `6a0c1952`, `test(71-09): pin the reviewed MCP 0.12.0 tools/list and message-type delta`.
2. **Task 2: Release-diff library and CLI.** `abf491a2`, `feat(71-09): add the release-diff checker tying shipped code to the measured SHA`.
3. **Task 3: The count_tokens script.** `e24d66d2`, `feat(71-09): add the count_tokens tool-list measurement script for V4`.

TDD: in each task the suite was written first and failed. Task 1 failed with ENOENT on the manifest; Tasks 2 and 3 failed with ERR_MODULE_NOT_FOUND. The implementation then made each suite pass, and each task landed as one commit with its registration, per the plan's commit instructions.

## The delta manifest (tests/fixtures/mcp-release-delta-0.12.0.json)

| Key | Value |
| --- | --- |
| `schemaVersion` | `1` |
| `note` | "Reviewed tools/list and MCPMessageType delta of fsb-mcp-server 0.12.0 against the 8a058bdf pin (D-23). Any other change fails tests/mcp-release-compat.test.js." (159 characters, no URL) |
| `release` | `0.12.0` |
| `baselineFixture` | `tests/fixtures/mcp-tools-list-8a058bdf.json` |
| `baselineFixtureSha256` | `b0e67bb7974cf1cf0d649113162b438559585aa02ba28666f17df5d14a8274b8` (the fixture's `meta.sha256`, also recomputed as `sha256(canonicalJson(tools))`) |
| `addedTools` | `["settings"]` |
| `removedTools` | `[]` |
| `addedOptionalProperties` | `{"expect": [the 29 EXPECT_TOOL_NAMES_VERBATIM names in D-12 order: execute_js, click, right_click, double_click, click_at, double_click_at, click_and_hold, type_text, insert_text, press_enter, press_key, clear_input, select_option, check_box, set_attribute, drag_drop, drag, drag_variable_speed, drop_file, upload_file, select_text_range, scroll_to_top, scroll_to_bottom, scroll_to_element, navigate, go_back, go_forward, refresh, back]}` |
| `newRequiredArguments` | `[]` |
| `baselineMessageTypes` | the 45 S13 pin values, from `mcp:start-automation` to `system:client-inventory` |
| `baselineMessageTypesCommand` | `git show 8a058bdf0d17c1e3e79ec3104cc1996326b4c402:mcp/src/types.ts` |
| `addedMessageTypes` | `["mcp:get-settings", "mcp:set-setting"]` |
| `companionSuites` | `node tests/mcp-tools-list-baseline.test.js`, `node tests/mcp-tools-list-shape-freeze.test.js`, `node tests/mcp-settings-tool-contract.test.js`, `node tests/mcp-expect-wire.test.js` |
| `oldExtensionCoverage` | "66.1-03: settings answers SETTING_UNSUPPORTED from an extension without the settings routes (tests/mcp-settings-tool-contract.test.js)"; "69-06: an older extension's result gets the expect_result skew fill uncertain / extension_unsupported (tests/mcp-expect-wire.test.js)" |

The suite extracts the MCPMessageType list from the current `mcp/src/types.ts` with the S13 rule: strip line comments, then read the quoted union members in order. That gives 47 values, and the 45 pin values are an exact prefix. The suite passes with 52 checks on Node 24 and on Node 20 (v20.20.2).

**Negative proofs (manual, not committed).** Each was run on a scratch copy of the suite with one injected change, and each scratch copy was deleted afterwards.

| Injected change | Result |
| --- | --- |
| A fake tool `zz_fake_tool` | FAIL "current tool names minus baseline names equal addedTools; unreviewed tool: zz_fake_tool" |
| `extra_flag` added to `get_text` | FAIL "get_text: added properties [extra_flag] differ from the reviewed []; unreviewed property: extra_flag" |
| `expect` made required on `click` | FAIL on 5 checks, including "unreviewed: click.expect" and "`expect` is in no required list (required on: click)" |
| `refresh` removed | FAIL "removed: refresh" |
| A fake message type `mcp:zz-fake` | FAIL "unreviewed message type: mcp:zz-fake" |

## Release-diff checker

**The classification.** First match wins:

1. `*.md` at any depth is docs.
2. Under `showcase/server/**`, a setter target is `setter` and anything else is `forbidden`.
3. The other docs prefixes are docs: `showcase/**`, `store-assets/**`, `skills/**`, `.planning/**`, `scripts/bench/results/**` and `scripts/bench/gate/decisions/**`. Docs wins over setter here, for example for `README.md` and `showcase/angular/public/llms.txt`.
4. A `--print-targets` path is `setter`.
5. Everything else is `forbidden`.

`judgeDifferences` ignores docs. A setter path passes only when its bytes after the setter equal the release bytes. A forbidden path fails when it differs, or exists on one side only. An unknown class fails closed. The node:test suite has 27 tests, including "uncommitted refusal", and passes on Node 24 and Node 20.

**The plan's manual smoke.** This used two local commits and a clean tree, with release defaulting to HEAD:

```
$ node scripts/release/check-release-diff.mjs --measured $(git rev-parse HEAD~1) --step A
check-release-diff: measured 6a0c1952694af8fbcc6f2be5da66433bf5641f20; release HEAD -> abf491a224c51c9a4307246441707bbf6338a062; step A
check-release-diff: 5 differing paths (0 docs, 1 setter, 4 other); 0 docs copied from the release; setters: extension 0.9.92; 40 paths compared
check-release-diff: VIOLATION setter package.json: differs from the setter output for this step
check-release-diff: VIOLATION forbidden scripts/release/check-release-diff.mjs: added after the measured commit
check-release-diff: VIOLATION forbidden scripts/release/lib/release-diff.mjs: added after the measured commit
check-release-diff: VIOLATION forbidden tests/delegation-phase-contract.test.js: changed after the measured commit
check-release-diff: VIOLATION forbidden tests/release-diff.test.mjs: added after the measured commit
check-release-diff: FAIL: 5 violation(s); any code change after V4 needs a re-measure
exit 1
```

These are exactly Task 2's non-docs files. `package.json` is a setter target whose test-chain edit the setter did not make, which proves the checker fires.

**The other smokes.** None of them moved a ref, the branch, HEAD or the working tree:

| Smoke | Command shape | Exit | Result |
| --- | --- | --- | --- |
| Uncommitted refusal | the same command after appending a newline to `tests/release-diff.test.mjs`; the newline was then reverted with `git checkout --` | 2 | `refused uncommitted_changes`, before any export |
| Identity, step A | `--measured HEAD --step A` | 0 | 0 differing paths; 36 setter targets byte-identical after `extension 0.9.92` |
| Identity, step B | `--measured HEAD --step B` | 0 | byte-identical after `extension 0.9.92` and then `mcp 0.11.2` |
| Docs only | `--measured 1181ca10 --release 518ef453 --step B` | 0 | the 71-08 SUMMARY commit: 1 docs path copied, OK |
| V6 step-A shape | a dangling `git commit-tree` commit on HEAD: a `## v1.0.0` entry, the header line, then `extension 1.0.0` run in a temp tree | 0 | 20 differing paths (15 docs, 5 setter), `showcase/server/package.json` and `package-lock.json` among the setter paths |
| Tampered step A | the step-A shape plus a dependency in `showcase/server/package.json`, a line in `extension/ui/onboarding.js`, `mcp/package.json` at 0.12.0, and a line in `showcase/server/server.js` | 1 | exactly those 4 violations: 3 setter, 1 forbidden |
| V6 step-B shape | the step-A shape plus a `mcp/CHANGELOG.md` 0.12.0 entry, then `mcp 0.12.0` | 0 | 28 differing paths (16 docs, 12 setter) |
| Step-B tree checked as step A | the step-B commit with `--step A` | 1 | 7 setter violations, one for each MCP version file. This is the "MCP unchanged in step A" rule |

The checker takes about 3 s, most of it exporting and extracting the 373 MB tree. The scratch commits are unreferenced objects, and git gc prunes them.

## The `showcase/server/**` narrowing of D-24 (for M-71-00 item 5)

D-24's docs allowlist names `showcase/**`. The checker narrows it.

- **What it means.** `showcase/server/**` is the Fly gateway, and `deploy.yml` deploys it on every push to `main`. Only its `*.md` files are docs.
- **The setter outputs.** `showcase/server/package.json` and `showcase/server/package-lock.json` are extension-setter outputs (`extensionStructuredTargets`, `scripts/sync-product-version.mjs:16-26`; `setPackageAndLock`, `:396-400`). They are byte-compared after the setter runs, exactly like `extension/manifest.json`. The step-A smoke above proves that a bump made exactly as the setter writes it passes, and that an added dependency fails.
- **Everything else is forbidden.** Examples are `showcase/server/src/**` and `showcase/server/server.js`, so a gateway code change after V4 fails step A and step B.
- **Owner decision.** The owner acknowledges or rejects this narrowing as M-71-00 item 5 (V1). If it is rejected, gateway code counts as docs, a post-V4 gateway change would deploy unmeasured on the V6 merge, and 71-09 is re-planned before V6.

## Deferred to Validation Block

These rows are restated from 71-VALIDATION.md, which is authoritative.

- **M-71-00 item 5 (V1).** The owner acknowledges or rejects the `showcase/server/**` narrowing described above.
- **M-71-09 (V4).** Run `ANTHROPIC_API_KEY=… node scripts/mcp/count-tool-tokens.mjs --model <V1 Claude model> [--model …]`. Add `--strip-schema-keyword` only if the API rejects `$schema`. Record the baseline and new tool-list tokens and their ratio beside the 69 budget estimate, and say whether "more than half" is met. Keep the estimate label and the tool-search caveat.
- **M-71-10 (V6, step A, extension 1.0.0, MCP stays 0.11.2).** This is the order for the release-diff steps:
  1. Write the gate-dependent docs.
  2. Run `npm run version:set:extension -- 1.0.0` and the checks.
  3. Commit, so that `git status --short` is empty.
  4. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step A`, which must exit 0. `--release` defaults to HEAD, and uncommitted tracked changes are refused as `uncommitted_changes`.
  5. `git fetch origin main`. While `Jev..origin/main` prints anything, merge it, rerun the checks and the release-diff check. A non-docs violation from a main-only commit is a re-measure decision for the owner, never a waiver.
  6. Merge only when the pull request's CI checks are green, `showcase (build + crawler smoke)` and `all-green` included.
  7. After the merge, record `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step A --release origin/main` (exit 0) in the V6 notes.
- **M-71-11 (V6, step B, MCP 0.12.0; skipped if the non-Jev MCP path did not pass).**
  1. Author the `mcp/CHANGELOG.md` 0.12.0 entry, the README "What's New In v0.12.0" section (moving the Compatibility bullet into it) and the root CHANGELOG MCP-only paragraph.
  2. Run `npm run version:set:mcp -- 0.12.0 && npm --prefix mcp run build && npm run version:check && npm test`.
  3. Commit the bump with the six force-tracked `mcp/build` files and `mcp/native-host/runtime-integrity.json`.
  4. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step B`, which must exit 0.
  5. Bring in `origin/main` and re-check until `HEAD..origin/main` is empty.
  6. Merge when CI is green.
  7. Record the check against `--release origin/main`.
  8. Confirm `npm view fsb-mcp-server dist-tags.latest` prints `0.12.0`.
- **V5.** Phase 71 has no row of its own here; 69's live version-skew row stands.

## Deviations from Plan

There were no Rule 1-4 deviations; the plan was executed as written. The implementation choices below stay within the plan's interfaces:

- **Export.** The measured tree is exported with `git archive --format=tar --output=<tmp>/measured.tar` and then `tar -x -f`, instead of piping archive stdout through `spawnSync`'s buffer as `tools-list-baseline.mjs` does. That script exports only `mcp/`, while this one exports the whole tree, about 373 MB. There is still no worktree, and the temp directory is removed in `finally`.
- **Listing differing paths.** It uses `git diff --no-renames --name-status -z` rather than `--name-only`, so additions and deletions are known without extra git calls, and paths with spaces parse safely.
- **The comparison set.** It is the differing paths plus every setter target. This is stricter than the diff alone: a release that skipped the setter on one target also fails.
- **The count_tokens freshness guard.** The script carries its own copy of the 69-01 `assertBuildFresh` pattern, exported and unit-tested with temp directories, so that `scripts/` does not import from `tests/`. Its message reads "run npm --prefix mcp run build", without backticks, as the plan words it.
- **The compat suite's extra checks.** The suite also recomputes `sha256(canonicalJson(fixture.tools))` against the manifest. It also checks that each `oldExtensionCoverage` entry names a registered companion suite that contains its error code.

## Known Stubs

None.

## Threat Flags

None. The only new network surface is the `count_tokens` POST to api.anthropic.com, which T-71-05 already covers: the key is read from the injected env and never printed, and the sentinel-key scan runs in every scenario.

## Issues Encountered

None. Port 7225/7226 state was not relevant: none of these suites binds a port.

## Next Phase Readiness

- 71-10 and 71-11 (docs) can read `addedTools` from the delta manifest for the outcome-aware count rule (D-27 amendment).
- 71-12's phase gate runs the full chain with the new 348th command and the two new bench suites.

## Self-Check: PASSED

- FOUND: tests/fixtures/mcp-release-delta-0.12.0.json, tests/mcp-release-compat.test.js, scripts/release/lib/release-diff.mjs, scripts/release/check-release-diff.mjs, tests/release-diff.test.mjs, scripts/mcp/count-tool-tokens.mjs, tests/mcp-count-tool-tokens.test.mjs
- FOUND commits: 6a0c1952, abf491a2, e24d66d2
- Verify commands: Task 1 (compat on Node 24 and 20, delegation-phase-contract 1254/0, `mcp/build` clean), Task 2 (27/27 on Node 24 and 20, `--step C` exits 2), Task 3 (11/11 on Node 24 and 20, a missing key exits 2). The bench `node --test` command passes 568/568. Neighbouring suites all exit 0: version-sync, release-version-rehearsal, mcp-version-parity, settings-panel-sync, jev-fast-settings, qr-pairing, mcp-tools-list-baseline, mcp-tools-list-shape-freeze.
