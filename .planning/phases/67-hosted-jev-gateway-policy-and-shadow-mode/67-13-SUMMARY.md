---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 13
subsystem: testing
tags: [jev, test-chain, ci, node20, integration-verification, compatibility-audit, d-01, d-32]

# Dependency graph
requires:
  - phase: 67-01..67-12
    provides: "the 17 Phase 67 test files (13 single-file suites and four node:test shadow files)"
provides:
  - "14 appended root-chain commands (T319..T332) that run every Phase 67 suite; the same 14 strings are the last REFINEMENT_ROOT_TEST_COMMANDS entries"
  - "Phase integration record: 348/348 chain commands exit 0 in tolerant mode against the 334/334 baseline, validate:extension green, official Node 20.20.2 runs of all 17 Jev test files, and a clean D-01 compatibility audit over 61 (67- commits"
affects: [67-verify, V2, V3, V6, CI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQLite suites get their Node 20 evidence from a git-archive scratch copy in /tmp with its own Node 20 `npm ci`, so the worktree's Node 24 better-sqlite3 build is never rebuilt"

key-files:
  created: []
  modified:
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The chain ran in the tolerant per-command mode because 7225 is held by the user's npx hub (pid 10374). The hub was not touched, so a fail-fast `npm test` with 7225 free was not run locally; CI runs it at V6"
  - "The baseline is 67-12's tolerant pass (/tmp/fsb-67-12-full.jsonl, 334/334). Its command set is identical to the pre-Phase-67 Phase 69 gate pass (/tmp/fsb-gate-69.jsonl, 334/334), so no Phase 67 plan before this one changed the chain"
  - "Node 20 evidence reuses the official v20.20.2 tarball already at /tmp/fsb-node20 (the 66-09 path is gone). Its SHA-256 was re-verified against both the cached SHASUMS256.txt and a fresh nodejs.org latest-v20.x SHASUMS256.txt, and the extracted bin/node was checked byte-for-byte against the tarball"
  - "The four better-sqlite3 suites passed under Node 20 in the /tmp scratch copy, so none of them falls back to 'covered by CI at V6'"
  - "Task 2 is verification-only (its files list is none), so it has no commit; its evidence is this SUMMARY"

patterns-established:
  - "Phase gates compare a tolerant JSONL pass with the newest recorded pass by command identity and exit code, plus a per-suite pass-count check"

requirements-completed: [JEV-01, JEV-02, JEV-03, JEV-04, JEV-05, JEV-06, JEV-07]

# Metrics
duration: 9min
completed: 2026-10-17
---

# Phase 67 Plan 13: Jev Suites in the Root Chain and Phase Integration Verification Summary

**Every Phase 67 suite now runs in the root `npm test` chain through 14 appended commands, registered in the refinement contract in the same commit (`4aad7fb1`). The full chain passes 348/348 commands in tolerant mode against the 334/334 baseline, with no new failure and no pre-existing failure. `validate:extension` is green. All 17 Jev test files pass under the official Node 20.20.2 binary: 13 in the worktree, and the four better-sqlite3 suites in a /tmp scratch copy with its own Node 20 install. The compatibility audit finds no Phase 67 commit touching `mcp/`, `agent-loop.js`, `ai-integration.js`, `scripts/bench/tasks/` or the showcase server's package files. `extension/background.js` changed only in 67-11.**

`requirements-completed` lists the plan's IDs for traceability only. This plan proves the JEV-01..07 code is wired and green before any live run. The live gateway, calibration and release items are in the deferred list below. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched; the orchestrator owns them.

## Performance

- **Duration:** about 9 min of execution, plus this SUMMARY
- **Started:** 2026-10-17T06:29:03Z
- **Completed:** 2026-10-17T06:38Z
- **Tasks:** 2/2
- **Files modified:** 2 (`package.json`, `tests/delegation-phase-contract.test.js`)

## Task 1: Chain Registration

**Pre-check.** Each of the 14 commands ran on its own under Node 24.14.1, one after another, from the repo root (`/tmp/fsb-67-13/pre-sweep.jsonl`). All 14 exited 0:

| # | Command | Passed |
|---|---------|--------|
| 1 | `node tests/jev-gateway-contract.test.js` | 329 |
| 2 | `node tests/jev-gateway-config.test.js` | 345 |
| 3 | `node tests/jev-gateway-upstream.test.js` | 468 |
| 4 | `node tests/jev-instrument.test.js` | 149 |
| 5 | `node tests/jev-calibration-profile.test.js` | 156 |
| 6 | `node tests/jev-gateway-ledger.test.js` | 278 |
| 7 | `node tests/jev-gateway-router.test.js` | 343 |
| 8 | `node tests/jev-gateway-log-hygiene.test.js` | 32 |
| 9 | `node tests/jev-state.test.js` | 232 |
| 10 | `node tests/jev-contract-parity.test.js` | 379 |
| 11 | `node tests/jev-client.test.js` | 280 |
| 12 | `node tests/jev-policy-tighten-only.test.js` | 29,647 |
| 13 | `node tests/jev-extension-boundary.test.js` | 115 |
| 14 | `node --test tests/jev-shadow-score.test.mjs tests/jev-shadow-select.test.mjs tests/jev-shadow-records.test.mjs tests/jev-shadow-harness.test.mjs` | 88 |

`git status --short showcase/angular/public` printed nothing before the commit.

**Edits.**
- **package.json:** a textual edit appended ` && <command>` 14 times after `node --test tests/expect-outcome-browser.test.mjs`.
  - The chain went from 318 to 332 entries, and the first 318 are unchanged.
  - Top-level key order, script key order and every other value are deep-equal to HEAD~1.
- **Refinement contract:** the 14 strings were appended as the last `REFINEMENT_ROOT_TEST_COMMANDS` elements, after the Phase 69 entry `node --test tests/expect-outcome-browser.test.mjs`, each with a trailing comma. That is the file's only change.

| Check | Result |
|-------|--------|
| Task 1 `<automated>` verify | both commands exit 0 |
| `node tests/delegation-phase-contract.test.js` | 1238 passed, 0 failed (1224 before; +14 "appears exactly once in the refinements root chain" checks). Both historical-hash checks pass: "removing the six new Phase 61 gates…" and "removing the three Phase 62 gates… reproduces the exact prior serial chain" |
| Each of the 14 commands appears exactly once in `scripts.test` | yes (verify `node -e`) |
| `git show --stat HEAD` | exactly `package.json` (+1/-1) and `tests/delegation-phase-contract.test.js` (+14) |
| `git diff HEAD~1 --numstat -- package.json` | `1	1	package.json` |
| `git diff HEAD~1 -- tests/delegation-phase-contract.test.js \| grep -cE "^[-+].*PRE_PHASE6[0-9]_ROOT_TEST_HASH"` | 0 |
| Other suites that read `scripts.test` (`lattice-step-emitter-smoke`, `trigger-tool-dispatcher`, `lattice-provider-bridge-smoke`, `capability-mcp-surface`, `capability-fetch`, `settings-panel-sync`, `classification-gate`, `capability-interpreter`, `qr-pairing`, `mcp-client-identity-integration`) | all exit 0 before the commit; none pins the chain tail or length |

## Task 2: Integration Verification Record

### Ports and chain mode (steps 1-2)

| Port | Holder |
|------|--------|
| 7225 | **held** by pid 10374, `node /Users/lakshman/.npm/_npx/d92c25bff7522293/node_modules/.bin/fsb-mcp…` (parent 10261, started Fri Oct 16 21:12:25 2026). This is the user's npx hub. It was not killed or restarted, and it still held 7225 after the run. |
| 7226 | free (the native-host serve daemon was not listening) |

**Mode: tolerant pass.**
- Runner: `node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-67-13-full`, from the repo root, in the background.
- `scripts.pretest`, then `scripts.test`, are split on ` && `. Each command runs through `/bin/sh -c` with stdin from `/dev/null`, `node_modules/.bin` first on PATH and a 20-minute per-command bound, and the runner continues past failures.
- `/tmp/fsb-67-13-full.exit` holds the exit code `npm test` would have returned (the first non-zero command's code, or 0). It is derived from the JSONL, not a real chain exit.
- Artifacts: `/tmp/fsb-67-13-full.{jsonl,log,exit,done}`. None is committed.

### Chain result and baseline comparison

The baseline is the newest per-command tolerant pass recorded in a prior SUMMARY: 67-12's (`/tmp/fsb-67-12-full.jsonl`). Its 334 commands are identical, by id and text, to the pre-Phase-67 Phase 69 gate pass (`/tmp/fsb-gate-69.jsonl`), and both are 334/334 exit 0.

| Item | Baseline (67-12, `818355ef`) | 67-13 (`4aad7fb1`) |
|------|------------------------------|--------------------|
| Commands | 334 (16 pretest + 318 test) | 348 (16 pretest + 332 test) |
| Exit 0 | 334/334 | **348/348** |
| Equivalent `npm test` exit | 0 | **0** |
| Last suite reached | T318 `expect-outcome-browser` | **T332, the shadow `node --test` command (end of chain):** exit 0 |
| Failing commands | none | **none** |
| Timed out (20-minute bound) | none | none |
| Total time | 253.3 s | 261.7 s |

- **Command identity:** the first 334 commands match the baseline exactly, by id (P1..P16, T1..T318) and by text, and every one keeps exit code 0. T319..T332 are the only additions.
- **Pre-existing failures:** none. The baseline has no failing command, so there is nothing to carry forward and nothing was "fixed". The milestone note that `mcp-install-platforms` fails 2 cases applies only while the native-host daemon holds 7226; 7226 was free here.
- **New commands (T319..T332):** all exit 0, with the same pass counts as the pre-check (for example T325 `jev-gateway-router` 343 in 4.0 s, T330 `jev-policy-tighten-only` 29,647, T332 shadow 88).
- **Port-bound suites, with 7225 held:**
  - T45 `mcp-diagnostics-status`: exit 0.
  - T46 `mcp-install-platforms`: exit 0.
- **Per-suite count check** (a sanity check; the pass rule is exit codes): 193 commands print a parseable pass count in both logs. 192 are unchanged and none decreased. The one change is T17 `delegation-phase-contract`, 1224 → 1238, from this plan's 14 new checks.
- **Slowest commands:** P12 `browser-editing-actions` 91.4 s, T104 `showcase-build-smoke` 21.6 s, T46 `mcp-install-platforms` 19.4 s, T8 `phase60-full-tests-harness` 16.4 s.

### Run side effects (step 3)

- **Rewritten and reverted with `git checkout --`:** `showcase/angular/public/llms.txt`, `llms-full.txt` and `sitemap.xml` (1 + 1 + 77 changed lines of generated date stamps, from `showcase-build-smoke`).
- After the restore, `git status --short showcase/angular/public` printed nothing, `git status --porcelain --untracked-files=no` was empty, and no untracked file was created.

### validate:extension

`npm run validate:extension` exits 0: all 15 commands in the script, ending with `write-activation-evidence: 16 passed, 0 failed`. It ran twice, once on its own and once inside the Task 2 verify, and the tree stayed clean.

**Task 2 `<automated>` verify:** `npm run validate:extension && node tests/delegation-phase-contract.test.js && node tests/jev-extension-boundary.test.js && test -z "$(git status --porcelain --untracked-files=no -- showcase/angular/public)"` exits 0 (contract 1238/0, boundary 115/0).

### Node 20 run (step 4)

**Binary identity.**
- `/tmp/fsb-66-09-node20/` no longer exists, so the plan's fallback applied. The official tarball was already at `/tmp/fsb-node20/node-v20.20.2-darwin-arm64.tar.gz` (the binary the milestone gotchas name).
- **Tarball SHA-256:** `466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6`.
  - `shasum -a 256 -c` against the cached `SHASUMS256.txt` line: OK.
  - A fresh `https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt` names the same file with the same hash, so v20.20.2 is still the latest v20.
- **Binary:** `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node`, SHA-256 `38de4fc456c0c439bac48c727d378f749abb4e31f4116703bb1ee9a746fccbb6`. That equals `bin/node` freshly extracted from the verified tarball. It reports **v20.20.2**, darwin-arm64, release `node`, LTS `Iron` (Mach-O arm64), with npm 10.8.2. It was never installed globally.
- In every Node 20 run, the binary's bin dir was first on PATH, and the sweep runner itself ran under it, so `node` in each command is 20.20.2 (the first command of each sweep printed `v20.20.2`). The spawning suites use `process.execPath` for children anyway.

**4a. Worktree, the suites that do not load better-sqlite3** (`/tmp/fsb-67-13/node20-worktree.jsonl`). All exit 0:

| Command | Passed |
|---------|--------|
| `jev-gateway-contract` | 329 |
| `jev-gateway-config` | 345 |
| `jev-gateway-upstream` | 468 |
| `jev-instrument` | 149 |
| `jev-calibration-profile` | 156 |
| `jev-state` | 232 |
| `jev-contract-parity` | 379 |
| `jev-client` | 280 |
| `jev-policy-tighten-only` | 29,647 |
| `jev-extension-boundary` | 115 |
| `node --test` shadow score, select, records | 65 (0 fail) |

**4b. Scratch copy, the four better-sqlite3 suites.**
- `git archive HEAD` (`4aad7fb1`) was extracted into `/tmp/fsb-67-13-node20-scratch`.
- `npm --prefix showcase/server ci --no-audit --no-fund` ran there with the Node 20 tarball's npm first on PATH: exit 0, 110 packages in 2 s.
  - better-sqlite3 11.10.0 loaded under v20.20.2 (SQLite 3.49.2).
  - Its `better_sqlite3.node` (SHA-256 `aab42ba2…45007`) differs from the worktree's Node 24 build (`fe90e492…5e760`), as expected.
- The four suites ran from the scratch root under Node 20 (`/tmp/fsb-67-13/node20-scratch.jsonl`). All exit 0, with no `ERR_DLOPEN_FAILED`:

| Command | Passed |
|---------|--------|
| `jev-gateway-ledger` | 278 |
| `jev-gateway-router` | 343 |
| `jev-gateway-log-hygiene` (spawns `server.js` via `process.execPath`, so under Node 20 too) | 32 |
| `node --test tests/jev-shadow-harness.test.mjs` | 23 (0 fail) |

- The scratch directory was deleted afterwards. None of the four needs the "covered by CI Node 20 at V6" fallback, though CI's Node 20 `extension` job will run them again when the branch is pushed at V6.

**Worktree install untouched:** `node -e "const D=require('./showcase/server/node_modules/better-sqlite3');new D(':memory:').close()"` still exits 0 under local Node 24.14.1. Nothing in the worktree's `node_modules` was rebuilt, reinstalled or `npm rebuild`-ed.

### Compatibility audit (step 5, D-01, ALL-c)

`git log --format=%H --grep='(67-' 469907cb..HEAD` lists **61 commits** (60 from 67-01..67-12 plus this plan's `4aad7fb1`). `git show --name-only --format=` over all of them gives 110 file rows and 89 unique files:

| Area | Files |
|------|-------|
| `scripts/bench/shadow/` | 33 |
| `showcase/server/src/` | 15 |
| `showcase/server/server.js`, `showcase/server/.env.example` | 1 each |
| `extension/ai/jev-client.js`, `jev-policy.js`, `jev-state.js` | 1 each |
| `extension/background.js` | 1 |
| `tests/` (17 jev test files, 3 fixtures, `lattice-provider-bridge-smoke`, `delegation-phase-contract`) | 22 |
| `package.json` | 1 (this plan only) |
| `.planning/phases/67-…` | 12 |

| Audit | Output | Verdict |
|-------|--------|---------|
| Any `(67-` commit touching `mcp/`, `extension/ai/agent-loop.js`, `extension/ai/ai-integration.js`, `scripts/bench/tasks/`, `showcase/server/package.json` or `showcase/server/package-lock.json` | no rows | PASS |
| `(67-` commits touching `extension/background.js` | `d1bfdbea feat(67-11): load the three Jev modules inert after model-discovery and move both lattice importScripts pins by three` only. It is also the only commit in `469907cb..HEAD` that touches the file | PASS |
| `grep -rl "FsbJev" extension/ \| grep -v "extension/ai/jev-"` | empty | PASS |

- **Context for the range diff.** `git diff --stat 469907cb..HEAD` over the forbidden paths is not empty: it shows `mcp/` edits. Every one comes from Phase 66.1 or 69 commits (`feat(66.1-03)` ×2, `fix(66.1)` ×3, `feat(69-02)` ×3, `feat(69-04)` ×2, `feat(69-06)` ×2, `fix(69)` ×3). None comes from a `(67-` commit.
- **Phase 67 commits outside the `(67-` pattern.** `66c7909d docs(67)` and `e1e6439c docs(66.1,67,69)` touch only `.planning/` files.

## Accomplishments

- **CI coverage:** every Phase 67 suite now runs in CI's Node 20 `npm test`, through 14 registered chain commands. The refinement contract pins them, and the pre-Phase-61 and pre-Phase-62 chain hashes still reproduce.
- **Phase gate:** its automated evidence is complete.
  - The chain is green against the recorded baseline, with command identity checked and no suite count dropping.
  - `validate:extension` is green.
  - All 17 Jev test files pass on a verified official Node 20 binary, the SQLite ones included.
  - The D-01 compatibility audit passes.

## Task Commits

1. **Task 1: Register the 14 Phase 67 commands in the root chain and the refinement contract:** `4aad7fb1` (test). Message: `test(67-13): run the Phase 67 Jev suites in the root test chain`.
2. **Task 2: Phase integration verification:** no commit. The task is verification-only (`<files>none`), and its results are this SUMMARY.

**Plan metadata:** the `docs(67-13)` commit that adds this SUMMARY.

## Files Created/Modified

- `package.json`: 14 appended `scripts.test` commands (one changed line).
- `tests/delegation-phase-contract.test.js`: 14 appended `REFINEMENT_ROOT_TEST_COMMANDS` elements.

## Decisions Made

- **Tolerant mode:** 7225 is held by the user's hub, and the rules forbid freeing it. The plan's branch for a held port applies, and the result is judged by exit codes against the baseline.
- **Baseline choice:** 67-12's pass is the newest one recorded in a SUMMARY. The Phase 69 gate pass gives the same command set and result, which also confirms that no earlier Phase 67 plan touched the chain.
- **Node 20 binary:** the 66-09 path is gone, and `/tmp/fsb-node20` holds the same official v20.20.2 tarball. Re-verifying it against nodejs.org's current latest-v20.x SHASUMS made a new download unnecessary.

## Deviations from Plan

None. The plan was executed as written.

### Execution notes (not rule deviations)

- **Extra evidence beyond the plan's list:**
  - the baseline cross-check against the pre-Phase-67 Phase 69 gate pass;
  - the per-suite count comparison;
  - the binary-to-tarball byte check;
  - the scratch-versus-worktree native-module hashes;
  - the attribution of the range diff's `mcp/` edits to Phases 66.1 and 69.

  None of these changed a file.
- **Branch checks:** the executor's `worktree-agent-*` allow-list does not apply, because the orchestrator directs commits on `Jev` in this single working tree, as in every earlier Phase 67 plan. HEAD was on `Jev`, inside the Conductor worktree, before the commit.
- **Shell:** the first audit attempt in zsh did not word-split the commit list and printed nothing useful. It was re-run under `bash` with a `while read` loop, and that run is the one recorded above.

## Issues Encountered

- **"With port 7225 free" is not met literally.** The user's hub holds 7225 and must not be disturbed. The tolerant pass is the plan's stated substitute. The first fail-fast `npm test` with 7225 free will be CI's, at V6.

## Known Stubs

None. This plan only registers existing suites and verifies them.

## Threat Model Coverage

- **T-67-15 (tampering, chain edits):**
  - Both registration files changed in one commit.
  - Each command appears exactly once in each place, checked by the contract and by the plan's verify.
  - The historical hash constants are untouched (0 changed lines), and the contract's hash-reproduction checks pass.
- **T-67-16 (tampering, Node 20 download):**
  - The tarball comes from the official nodejs.org dist, and its SHA-256 matches both the cached and a freshly fetched SHASUMS256.txt.
  - The binary equals the tarball's `bin/node`, runs from /tmp, and was never installed globally.
  - The only Node 20 `npm ci` ran inside the deleted /tmp scratch copy, never in the worktree.
- **T-67-17 (elevation, release workflows):** nothing was pushed. No `git push` ran in this plan.

No new security surface.

## User Setup Required

None.

## Deferred to Validation Block

Every Phase 67 manual item, collected here as the plan requires. None of these was attempted. Nothing in this plan called Jev, needed a credential, touched production or spent money.

| ID | Block | Item |
|----|-------|------|
| M-67-01 | V1 | None. Phase 67 is user-invisible (D-01), so the baseline at `8a058bdf` is unaffected. Recorded so V1's collector finds an explicit "none". |
| M-67-02 | V2 | Choose the upstream route (TypeSafe direct or OpenRouter) and the pin (`jev-1.13.0` / `typesafe/jev-1.13`, or 1.14). Set `JEV_API_KEY`, `JEV_UPSTREAM_URL`, `JEV_MODEL`, `JEV_DAILY_USD_CAP` and the other `JEV_*` values with `fly secrets set`, never in `fly.toml [env]`. Leave `JEV_ENABLED` off for the first deploy. |
| M-67-03 | V2 | Deploy from the branch with `flyctl deploy`, never a push to `main`. With `JEV_ENABLED` off, `POST https://full-selfbrowsing.com/api/jev/decide` answers 503 with the typed `disabled` body, and the showcase is unaffected. |
| M-67-04 | V2 | Flip `JEV_ENABLED` on and off with `fly secrets set`, time each flip and confirm the showcase recovers. Run `node scripts/bench/shadow/gateway-smoke.mjs --gateway https://full-selfbrowsing.com/api/jev/decide` once per configured route, and confirm the served model, `usageSource`/`costSource` and latency. |
| M-67-05 | V2 | One wrong key confirms the real 401/403 → `auth_error`. One unknown model confirms `unavailable_model`. Note whether an OpenRouter 403 is a moderation block (Pitfall 11). |
| M-67-06 | V2 | Read one real decision's `fly logs` line, find its ledger row by `decisionId` with `node src/jev/report.js --recent 5` over `fly ssh console`, then `--days 1`. Confirm there is no body, URL, origin, goal, title, text, label, element id, hash key, IP or credential. |
| M-67-07 | V2 | If OpenRouter is chosen: account prompt logging OFF and a per-key credit limit set. Set the production `JEV_DAILY_USD_CAP`. |
| M-67-08 | V3 | Gather enough labelled step records, roughly 60-130+ above-cut readings per question, mostly `recorded-llm` records in the 67-10 format. |
| M-67-09 | V3 | Run `node scripts/bench/shadow/run-shadow.mjs --gateway https://full-selfbrowsing.com/api/jev/decide --pin <V2 pin>` against exactly the V2 pin. Review the buckets and Wilson intervals, commit `report.candidateProfile` unchanged beside `uncalibrated.json` if it is non-null, record every not-a-fit kind, then re-run `node tests/jev-calibration-profile.test.js` and `node tests/jev-policy-tighten-only.test.js`. |
| M-67-10 | V4 | Fast mode stays default-off, and no Jev decision acts for users, until the V4 comparative gate passes. |
| M-67-11 | V5 | None. Phase 67 has no UI. Recorded so V5's collector finds an explicit "none". |
| M-67-12 | V6 | The gateway ships with the milestone release in the showcase server image. Nothing from Phase 67 reaches `origin/main` or any remote before V6; the V2 branch deploy is the only pre-V6 production touch. CI's Node 20 `extension` job first runs the 14 registered commands, with 7225 free, when the branch is pushed at V6. |

## Next Phase Readiness

- **Phase 67 verification:** the code is wired and green. The automated must-haves have evidence above, and every manual item is deferred with its Validation Block id.
- **Node 20:** `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node` is verified and still present for later plans.
- **Blockers:** none.

## Self-Check: PASSED

- `package.json`, `tests/delegation-phase-contract.test.js` and this SUMMARY exist on disk.
- The task commit `4aad7fb1` exists, touches exactly the two registration files, and its message has no Co-Authored-By or AI attribution line.
- `git diff --name-only 818355ef HEAD -- .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md mcp/` is empty.
- The tracked working tree was clean before this SUMMARY was committed. The SUMMARY was the only untracked file, and `/tmp/fsb-67-13-node20-scratch` no longer exists.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-17*
