---
phase: 66-baseline-and-session-timing
plan: 09
subsystem: testing
tags: [benchmark, test-chain, ci, node20, integration-verification, timing-audit, d-01, d-04, d-13]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 01)
    provides: "tests/bench-export-history.test.mjs (Task 1 only; 66-01 still paused at H1)"
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: "start-commit baseline (311/311, tolerant mode, 7225 held) and the stats, outcome and identity suites"
  - phase: 66-baseline-and-session-timing (plans 03, 04, 06)
    provides: "the extension timing code that the D-04 audits bound"
  - phase: 66-baseline-and-session-timing (plans 05, 07, 08)
    provides: "the tasks, fixture-server, claude-stream, corpus, report and drivers suites"
provides:
  - "One appended root-chain command (T299) runs all ten tests/bench-*.test.mjs suites; the same string is the last REFINEMENT_ROOT_TEST_COMMANDS entry"
  - "Phase integration record: 312/312 chain commands exit 0 against the 311/311 baseline, validate:extension green, official Node 20.20.2 bench run 338/338, D-04 timing audits, D-01 and D-13 audits"
affects: [66-10, 66-11, 71, CI, gsd-verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bench unit suites live in one multi-file `node --test` chain entry; adding a suite changes that string in package.json and REFINEMENT_ROOT_TEST_COMMANDS in the same commit"
    - "Node 20 evidence comes from the official nodejs.org tarball, checked against SHASUMS256.txt and run from /tmp with its bin dir first on PATH"

key-files:
  created: []
  modified:
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The chain was verified in the tolerant per-command mode because 7225 is held by the user's hub (pid 42278). The hub was not touched, so `npm test` itself (fail-fast, 7225 free) was not run locally"
  - "Node 20 evidence uses the official v20.20.2 darwin-arm64 tarball (SHA-256 verified), not npx node@20 and not the npx-cache binary earlier plans used"
  - "D-01 was audited from both the 66-02 start commit b4fe9d41 (per the plan) and the pre-phase commit 50334671, so 66-01's own commits are covered too"
  - "Task 2 is verification-only (its files list is none), so it has no commit; its evidence is this SUMMARY"

patterns-established:
  - "Phase gates compare a tolerant JSONL pass with the 66-02 baseline by command identity and exit code, and treat per-suite count drops as a warning sign"

requirements-completed: [MEAS-01, MEAS-02, MEAS-03]

# Metrics
duration: 12min
completed: 2026-09-30
---

# Phase 66 Plan 09: Bench Suites in the Root Chain and Phase Integration Verification Summary

**The ten benchmark unit suites (338 cases) now run in the root `npm test` chain through one appended `node --test` command, registered in the refinement contract in the same commit. The full chain passes 312/312 commands in tolerant mode against the 311/311 baseline, with no new failure. `validate:extension` is green. All ten suites pass under the official Node 20.20.2 binary. The audits confirm the timing symbol lives only in the two ingress files, `fsbMs` only in the six allowed modules, no tool result carries timing, and nothing under `mcp/` changed during Phase 66.**

`requirements-completed` lists the plan's IDs for traceability only. This plan proves the MEAS-01..03 code is wired and green before any live run. The live smoke and baseline (66-10, 66-11) and 66-01's H1 export are still open. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched; the orchestrator owns them.

**66-01 status when this check ran:** still paused at its human checkpoint H1, after Task 1 (`f406736b`, `b4fe9d41`).
- Its suite `tests/bench-export-history.test.mjs` is registered here and passes (14 cases).
- Its Task 3 (move the raw export into `scripts/bench/.local/`, commit metrics under `scripts/bench/results/history-2026-09-16_21/`) has not run: `scripts/bench/.local/` is empty and `scripts/bench/results/` does not exist.
- This plan touched none of 66-01's files.

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-30T10:32:03Z
- **Completed:** 2026-09-30T10:45Z
- **Tasks:** 2/2
- **Files modified:** 2 (`package.json`, `tests/delegation-phase-contract.test.js`)

## Task 1: Chain Registration

The registered command, identical in both files:

```
node --test tests/bench-export-history.test.mjs tests/bench-stats.test.mjs tests/bench-outcome.test.mjs tests/bench-identity.test.mjs tests/bench-tasks.test.mjs tests/bench-fixture-server.test.mjs tests/bench-claude-stream.test.mjs tests/bench-corpus.test.mjs tests/bench-report.test.mjs tests/bench-drivers.test.mjs
```

- **Pre-check:** all ten files exist, and together they pass 338/338 under Node 24.14.1 (3.1 s).
- **package.json:** a textual edit appended ` && <command>` after `node --import tsx tests/no-orphan-descriptor.test.js`.
  - The chain went from 298 to 299 entries, and the first 298 are unchanged.
  - Top-level key order, script key order and every other value are deep-equal to HEAD~1.
- **Refinement contract:** the command was appended as the last `REFINEMENT_ROOT_TEST_COMMANDS` element, with a trailing comma. That is the file's only change.

| Check | Result |
|-------|--------|
| Task 1 `<automated>` verify | exit 0 |
| `node tests/delegation-phase-contract.test.js` | 1205 passed, 0 failed. The new "appears exactly once in the refinements root chain" check passes, and both historical-hash checks pass ("removing the six new Phase 61 gates…" and "removing the three Phase 62 gates… reproduces the exact prior serial chain") |
| `node tests/mcp-client-identity-integration.test.js` | PASS |
| Command is the last entry and appears exactly once | yes (verify `node -e`) |
| `npm --prefix mcp run build` entries in the chain | 1 |
| `git diff HEAD~1 -- tests/delegation-phase-contract.test.js \| grep -cE "^[-+].*PRE_PHASE6[0-9]_ROOT_TEST_HASH"` | 0 |
| `git show --stat HEAD` | exactly `package.json` (+1/-1) and `tests/delegation-phase-contract.test.js` (+1) |
| Other suites that read `scripts.test` (capability-*, classification-gate, lattice-*, qr-pairing, trigger-tool-dispatcher) | none pins the tail entry or the chain length; all passed in the chain run below |

## Task 2: Integration Verification Record

### Ports and chain mode

| Port | Holder |
|------|--------|
| 7225 | **held** by pid 42278, `node …/_npx/d92c25bff7522293/node_modules/.bin/fsb-mcp-server` (parent 42179, started 2026-09-29 15:24:36). This is the same user hub as in the 66-02 baseline. It was not killed or restarted. |
| 7226 | free |

**Mode: tolerant pass, as in 66-02 Task 1.**
- The runner was the 66-02 runner with only its output paths changed.
- `scripts.pretest`, then `scripts.test`, were split on ` && `. Each command ran through `/bin/sh -c` from the repo root, with stdin from `/dev/null`, `node_modules/.bin` first on PATH, a 20-minute per-command bound, and continuing past failures.
- The only addition is `/tmp/fsb-66-09-full.exit`. It holds the exit code `npm test` would have returned: the first non-zero command's code, or 0. It is derived from the JSONL, not a real chain exit.
- Artifacts: `/tmp/fsb-66-09-full.jsonl` (one row per command), `/tmp/fsb-66-09-full.log`, `/tmp/fsb-66-09-full.done` and `/tmp/fsb-66-09-full.exit`. None is committed.

### Chain result and baseline comparison

| Item | 66-02 baseline (`b4fe9d41`) | 66-09 (`b381c0ba`) |
|------|-----------------------------|--------------------|
| Commands | 311 (13 pretest + 298 test) | 312 (13 pretest + 299 test) |
| Exit 0 | 311/311 | **312/312** (13/13 pretest, 299/299 test) |
| Equivalent `npm test` exit | 0 | **0** (`/tmp/fsb-66-09-full.exit`) |
| Last suite reached | T298 `no-orphan-descriptor` (end of chain) | **T299, the bench command (end of chain):** 338 pass, 0 fail, 3.2 s |
| Failing commands | none | **none** |
| Timed out (20-minute bound) | none | none |
| Total time | 148.0 s | 207.7 s (same commands; the machine was more loaded) |

- **Command identity:** the first 311 commands match the baseline's 311 exactly, by id (P1..P13, T1..T298) and by text. T299 is the only addition. No other commit in Phase 66 touched `package.json`.
- **Failure comparison:** the baseline's pre-existing failure set in the chain is empty, and this run has no failure. So no command is new, pre-existing or port-bound, and nothing blocks the plan.
- **Port-bound suites, with 7225 held as in the baseline:**
  - T44 `mcp-diagnostics-status`: 254 passed, 0 failed (baseline 254/0).
  - T45 `mcp-install-platforms`: 108 passed, 0 failed (baseline 108/0).
- **Slowest commands:**
  - T103 `showcase-build-smoke`: 30.5 s
  - T45 `mcp-install-platforms`: 28.9 s
  - T8 `phase60-full-tests-harness`: 24.1 s
  - T18 `mcp-native-host-packaging --section workflow-and-pack`: 19.4 s
- **Per-suite count check** (a sanity check, not the pass rule, which is exit codes): 146 suites print a parseable pass count.
  - 136 are unchanged, and none decreased.
  - The 10 increases are all Phase 66 test extensions:

    | Suite | Count | Source |
    |-------|-------|--------|
    | P6 `mcp-session-recorder-journal` | 8 → 12 | 66-03 |
    | P7 `mcp-lattice-journal` + `export-port` | 38 → 42 | 66-03 |
    | T2 `cost-tracker-ordering` | 17 → 37 | 66-04 |
    | T17 `delegation-phase-contract` | 1204 → 1205 | this plan |
    | T28 `mcp-bridge-background-dispatch` | 412 → 456 | 66-03 |
    | T34 `mcp-in-flight-session-lookup` | 15 → 214 | 66-06 |
    | T56 `action-history` | 65 → 71 | 66-04 |
    | T63 `cost-tracker` | 67 → 299 | 66-04 |
    | T70 `automation-logger-mcp-retention` | 82 → 141 | 66-04, 66-06 |
    | T198 Google Sheets group | 60 → 62 | 66-03 Sheets redaction cases |
- **After the run:** 7225 was still held by the same pid 42278. No `mcp/build/index.js` relay from this workspace was running.

### Run side effects (step 2)

- **Rewritten and reverted with `git checkout --`:** `showcase/angular/public/llms.txt`, `llms-full.txt` and `sitemap.xml`. The only changes were generated date stamps (2026-09-01 → 2026-09-30): one header line in each llms file and 77 `<lastmod>` lines in the sitemap.
- **Not changed:** `mcp/build/`, `mcp/ai/tool-definitions.cjs`, the tracked `extension/dist/offscreen/lattice-host.js` and every `package-lock.json`.
- **Untracked files:** none were created.
- `git status --porcelain --untracked-files=no` is empty.

### validate:extension (step 3)

`npm run validate:extension` exits 0: all 15 validators and tests in the script, ending with `write-activation-evidence: 16 passed, 0 failed`. It ran twice, once on its own and once inside the Task 2 verify, and the tree stayed clean.

### Node 20 run (step 4)

- **Source:** `https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt` names `node-v20.20.2-darwin-arm64.tar.gz` (`uname -m` is arm64).
- **Download:** the tarball went to `/tmp/fsb-66-09-node20/` (41,511,345 bytes).
- **SHA-256:** `466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6`. `shasum -a 256 -c` against the SHASUMS256.txt line reported OK, and was checked again right before extraction.
- **Binary:** `/tmp/fsb-66-09-node20/node-v20.20.2-darwin-arm64/bin/node` reports **v20.20.2**, darwin-arm64, release `node`, LTS `Iron` (Mach-O arm64). It was not installed globally. npx node@20 and the npx-cache binary were not used.
- **Run:** the binary's bin dir went first on PATH, so any child `node` is also 20.20.2. The suites spawn children through `process.execPath` anyway.
  - **All ten together:** `node --test <ten files>` gave **338/338 pass, 0 fail, exit 0** (2.3 s).
  - **Each on its own:** all exit 0. The counts sum to 338.

    | Suite | Pass |
    |-------|------|
    | export-history | 14 |
    | stats | 11 |
    | outcome | 13 |
    | identity | 26 |
    | tasks | 76 |
    | fixture-server | 29 |
    | claude-stream | 46 |
    | corpus | 17 |
    | report | 79 |
    | drivers | 27 |
- **Scope:** only the ten bench suites ran under Node 20, as the plan scopes it. The rest of the chain ran on Node 24.14.1 locally, as in the 66-02 baseline. CI runs the whole chain on Node 20.

### Timing audits (step 5, D-04)

| Audit | Output | Verdict |
|-------|--------|---------|
| `grep -rln "Symbol.for('fsb.mcp.call-timing')" extension` | `extension/ws/mcp-bridge-client.js`, `extension/ws/mcp-tool-dispatcher.js` (1 occurrence each). No other spelling of `fsb.mcp.call-timing` anywhere under `extension/` | exact set: PASS |
| `grep -rln "fsbMs" extension --include='*.js'` | `utils/automation-logger.js` (2), `utils/mcp-lattice-journal.js` (4), `utils/mcp-session-recorder.js` (5), `utils/spreadsheet-record-redaction.js` (2), `ws/mcp-bridge-client.js` (1), `ws/mcp-tool-dispatcher.js` (6). No non-`.js` file under `extension/` mentions it | subset of the six allowed files: PASS |
| `node tests/mcp-bridge-background-dispatch.test.js` | 456 passed, 0 failed | PASS |

- The ingress case replaces only `_send`, so the real `_sendResult` builds the frame.
- Even with a handler that echoes the payload, it asserts the wire frame never contains `receivedAt`, `completedAt`, `fsbMs` or `call-timing`.
- Timing reaches operators only through the deliberate `get_session_detail` measurement projection (D-09), never on a tool call's own result.

### D-01, orchestrator decision 6 and D-13 audits (step 6)

| Audit | Output |
|-------|--------|
| `git diff --stat b4fe9d41..HEAD -- mcp/` (the 66-02 start SHA) | empty (0 bytes) |
| `git diff --stat 50334671..HEAD -- mcp/` (pre-phase; covers 66-01's commits too) | empty (0 bytes). 0 of the 50 phase commits touch `mcp/` |
| `git diff --stat b4fe9d41..HEAD -- extension/utils/analytics.js` (decision 6) | empty. Also empty from `50334671` |
| D-13: the benchmark is not in `npm test` or CI | `scripts.test` has exactly one bench entry, the unit-test command. No npm script invokes `run-bench.mjs`, `report.mjs`, `fixture-server.mjs` or `sweep-tests.mjs`. `.github/workflows/ci.yml` and `chrome-extension.yml` run only installs, `npm run validate:extension` and `npm test` |

### CI parity (beyond the plan's list)

These checks ask whether the newly registered command will also pass on Linux CI.

- **Dependencies:**
  - `ci.yml` uses Node `'20'` and runs `npm --prefix mcp ci`; `ws` 8.19.0 is an `mcp` production dependency.
  - The chain builds `mcp/` at T13, long before T299, so `bench-drivers` has `mcp/build/agent-providers/spawn-environment.js` and `ws` when it runs.
- **Path case:** this Mac's APFS volume is case-insensitive, so a wrong-case path would pass here and fail on Linux. A static check resolved 157 path references with exact case. It covered imports, `path.join` targets, `new URL` targets, task fixture files and start paths, and fixture HTML `src`/`href`. It found **0 mismatches**.
- **Untracked files:** the only referenced file that git does not track is `mcp/build/agent-providers/spawn-environment.js`, which CI's chain builds.

## Accomplishments

- **CI coverage:** every Phase 66 bench unit suite now runs in CI through one registered chain command. The refinement contract pins it, and the pre-Phase-61 and pre-Phase-62 chain hashes still reproduce.
- **Phase gate:** its automated evidence is complete.
  - The chain is green against the recorded baseline, with command identity checked and no suite count dropping.
  - `validate:extension` is green.
  - The Node 20 bench run used a verified official binary.
  - The D-04 timing audits, the D-01 `mcp/` audit and the D-13 no-benchmark-in-CI audit all pass.

## Task Commits

1. **Task 1: Register the ten benchmark suites in the root chain and the refinement contract:** `b381c0ba` (test). Message: `test(66-09): run the benchmark unit suites in the root test chain`.
2. **Task 2: Phase integration verification:** no commit. The task is verification-only (`<files>none`), and its results are this SUMMARY.

**Plan metadata:** the `docs(66-09)` commit that adds this SUMMARY.

## Files Created/Modified

- `package.json`: one appended `scripts.test` command.
- `tests/delegation-phase-contract.test.js`: one appended `REFINEMENT_ROOT_TEST_COMMANDS` element.

## Decisions Made

- **Tolerant mode:** 7225 is held by the user's hub, and the rules forbid freeing it. The plan's own branch for a held port applies, and the result is judged by exit codes and the last suite reached.
- **Official Node 20 tarball:** the plan requires it, and it gives an auditable binary identity (URL, SHA-256, version). The same version (20.20.2) was already in the npx cache, but it was not used.
- **Two D-01 ranges:** `b4fe9d41` is 66-01's GREEN commit, so the plan's range starts after 66-01's first two commits. Adding `50334671` covers the whole phase.

## Deviations from Plan

None. The plan was executed as written.

### Execution notes (not rule deviations)

- **Extra evidence beyond the plan's list:**
  - `/tmp/fsb-66-09-full.exit`, derived from the JSONL
  - the per-suite count comparison
  - per-file Node 20 runs
  - the D-01 check from the pre-phase commit
  - the D-13 audit
  - the CI-parity checks

  None of these changed a file.
- **Branch checks:** the executor's `worktree-agent-*` allow-list was skipped, because the orchestrator directs commits on `Jev`, as in 66-02..66-08. The cwd-drift sentinel and the protected-branch deny-list ran before the commit.
- **graphify:** the graph predates `scripts/bench/` and returned unrelated nodes, as earlier plans found. Every edit anchor was read from the working tree.

## Issues Encountered

- **"With port 7225 free" is not met literally.** The must-have asks for a chain result with 7225 free, but the user's hub holds it and must not be disturbed. The tolerant pass is the plan's stated substitute. Both port-bound suites passed with the port held, exactly as at the baseline. The first fail-fast `npm test` with 7225 free will be CI's.
- **This chain run was slower than the baseline** (207.7 s vs 148.0 s). No command came near the bound, and every result matched.

## Known Stubs

None. This plan only registers existing suites and verifies them.

## Threat Model Coverage

- **T-66-09a (tampering, chain edits):**
  - One appended command, plus the identical string in `REFINEMENT_ROOT_TEST_COMMANDS`, in one commit.
  - The historical hash constants are untouched (0 changed lines), and the contract's hash-reproduction checks pass.
- **T-66-09b (tampering, Node 20 download):**
  - The binary comes from the official nodejs.org dist only, and its SHA-256 was verified against SHASUMS256.txt before extraction.
  - It runs from /tmp and was never installed globally.
- **T-66-05 (information disclosure, timing in responses):** the Symbol and `fsbMs` greps bound where timing lives, and the ingress test proves the wire frame carries no timing.
- **T-66-01 (accepted, /tmp logs):**
  - The /tmp logs hold test output only and are not committed.
  - The downloaded tarball and extracted binary remain under `/tmp/fsb-66-09-node20/`.

No new security surface.

## User Setup Required

None.

## Next Phase Readiness

- **66-10 (live smoke):** the code under test is wired and green.
  - The live paths the fakes cannot prove are unchanged from 66-08's list: `Runtime.evaluate` on an MV3 worker, `PUT /json/new`, the real `claude` stream, and lsof hub ownership.
  - If a later plan wants a Node 20 binary, `/tmp/fsb-66-09-node20/node-v20.20.2-darwin-arm64/bin/node` is verified and still present.
- **66-01:** its H1 export and Task 3 remain. Its suite is already in the chain, so Task 3 needs no chain edit.
- **Blockers:** none.

## Self-Check: PASSED

- `package.json`, `tests/delegation-phase-contract.test.js` and this SUMMARY exist on disk.
- The task commit `b381c0ba` exists and has no Co-Authored-By or AI attribution line.
- `git diff --name-only 1098472e HEAD -- .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md mcp/` is empty.
- The tracked working tree was clean before this SUMMARY was committed; the SUMMARY was the only untracked file.
- Re-checked counts: `validate:extension` has 15 commands, and `50334671..b381c0ba` holds 50 commits.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
