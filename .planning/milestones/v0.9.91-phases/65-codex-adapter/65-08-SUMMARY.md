---
phase: 65-codex-adapter
plan: "08"
subsystem: phase-validation-and-closure
tags: [codex, validation, human-uat, workspace-preservation, ci]

requires:
  - phase: 65-codex-adapter
    plan: "05"
    provides: Atomic complete Codex adapter, fixture, provider roster, and drift exposure
  - phase: 65-codex-adapter
    plan: "07"
    provides: Durable accepted-identity feed, exact billing, and shared accessibility closure
provides:
  - Exact 16-task Phase 65 graph, decision, threat, provenance, source, security, and UI validation closure
  - Honest three-scenario milestone-end human UAT ledger with no synthetic evidence
  - Bounded preservation-safe Phase 65 runner covering focused, extension, root, and CI authority
affects: [phase65-verification, milestone-closure, ci, human-uat]

tech-stack:
  added: []
  patterns:
    - Pass one bounded argv-only command matrix to the shared MCP build/workspace preserver
    - Treat final restored bytes, modes, links, status, index, and untracked identity as the settlement invariant
    - Read a missing historical planning fixture from bounded HEAD bytes only when it is an exact tracked deletion

key-files:
  created:
    - .planning/phases/65-codex-adapter/65-HUMAN-UAT.md
    - scripts/run-phase65-full-tests.mjs
    - tests/phase65-full-tests-harness.test.js
  modified:
    - .planning/phases/65-codex-adapter/65-VALIDATION.md
    - tests/delegation-phase-contract.test.js
    - tests/agent-provider-forbidden-flags.test.js
    - scripts/run-mcp-build-preserving-workspace.mjs
    - scripts/run-phase64-full-tests.mjs
    - tests/phase64-full-tests-harness.test.js
    - package.json
    - .github/workflows/ci.yml

key-decisions:
  - "Keep genuine auth, browser/process, and rendered accessibility evidence as exactly three pending human-only scenarios after automated closure."
  - "Use one exact 32-command runner matrix and one shared preservation wrapper; root npm test never recursively invokes the Phase 65 runner."
  - "Permit guarded generators to rewrite pre-existing dirty artifacts temporarily, but require exact final restoration on success, failure, spawn error, SIGINT, and SIGTERM."
  - "Do not recreate user-deleted planning files; a test may read exact committed bytes only after proving the bounded path is a tracked deletion."

patterns-established:
  - "Honest closure: automated green status and genuine external UAT status are independent and mechanically enforced."
  - "Dirty-workspace closure: generated test activity is allowed only inside an outer snapshot/restore boundary with final byte identity proof."

requirements-completed: [MULTI-04, MULTI-05, MULTI-06]

duration: 55m
completed: 2026-07-22
---

# Phase 65 Plan 08: Validation and Preservation-Safe Closure Summary

**Phase 65 now has a complete deterministic Codex closure gate: all 16 implementation tasks are green, the dirty shared workspace is restored byte-for-byte, and exactly three genuine external scenarios remain honestly pending.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-22T14:57:26Z
- **Completed:** 2026-07-22T15:51:53Z
- **Tasks:** 2
- **Files created/modified:** 22

## Accomplishments

- Created the exact three-row `65-HUMAN-UAT.md` ledger for genuine Codex account-state, Codex-to-browser execution, and rendered accessibility evidence. Every row remains unchecked, `human_needed`, `pending`, and evidence-empty.
- Closed the approved validation graph over exactly 8 plans and 16 task ids, all MULTI-04/05/06 ownership, D65-01 through D65-24, UI65-01 through UI65-10, and T65-01 through T65-12.
- Added a bounded argv-only Phase 65 runner with the exact 32-command focused/extension/root matrix and no root recursion or shell execution.
- Added success, nonzero, command-spawn, wrapper-spawn, oversized-injection, SIGINT, SIGTERM, temporary-dirty-rewrite, raw-index, build-tree, mode, symlink, staged, unstaged, and untracked restoration coverage.
- Added the Phase 65 harness and complete Codex adapter suite exactly once to root `npm test`, retained Phase 60/64 ordering, and renamed the sole Linux root CI step to the exact Phase 65 label with one `run: npm test`.
- Completed `65-VALIDATION.md`: `implementation_status: complete`, all 16 automated rows green, automated approval recorded, and human UAT still pending.

## Task Commits

Each plan task was committed atomically:

1. **Lock validation, security, provenance, and human UAT contracts** — `0e5a05fb` (test)
2. **Wire the preservation-safe focused, root, and CI closure gate** — `e958cd54` (test)

Full-gate integration findings were repaired in isolated commits:

- `8810e20b` — Refresh final direct-runtime authority contract.
- `59f5c2b4` — Refresh canonical provider sentinels.
- `a1451498` — Refresh native-wake and OpenCode root harnesses.
- `a674b10d` — Retain the deterministic closed provider environment boundary.
- `66c802f7` — Refresh canonical three-provider client inventory fixtures.
- `143be25e` — Refresh the terminal-ledger authority fixture for accepted identity.
- `733de01d` — Restore temporary dirty artifact rewrites without a false failure.
- `68ffaa9a` — Read a tracked-deleted historical planning fixture from bounded HEAD bytes.

## Files Created/Modified

- `.planning/phases/65-codex-adapter/65-HUMAN-UAT.md` — Exact three-scenario pending external evidence ledger.
- `.planning/phases/65-codex-adapter/65-VALIDATION.md` — Complete 16/16 implementation evidence and honest pending-UAT sign-off.
- `scripts/run-phase65-full-tests.mjs` — Exact 32-command protected closure runner.
- `tests/phase65-full-tests-harness.test.js` — Exact order/count, bounded injection, all settlement paths, and byte-identity restoration proof.
- `package.json` and `.github/workflows/ci.yml` — One root Phase 65 harness/adapter invocation and one sole Linux root CI invocation.
- `scripts/run-phase64-full-tests.mjs` and `tests/phase64-full-tests-harness.test.js` — Coordinated Phase 65 CI label without weakening Phase 64 contracts.
- `scripts/run-mcp-build-preserving-workspace.mjs` and `tests/mcp-native-host-packaging.test.js` — Final restoration is authoritative when guarded generators temporarily rewrite an already-dirty artifact.
- The remaining modified tests and one environment source file align the broad root baseline with the already-approved Phase 65 provider roster, accepted identity, and deterministic spawn boundary.

## Decisions Made

- Automated DOM/source assertions protect the external scenarios but cannot mark them passed. The validation contract rejects checked headings, completed results, or populated evidence.
- Temporary changes to a snapshotted dirty artifact are expected during generated-site tests. A run succeeds only if the wrapper restores every byte/type/mode/link and the final Git status, index entries/bytes, and untracked listing exactly match the initial state.
- Git-index mutation remains a failure even if cleanup can restore it; only temporary rewrites of already-snapshotted dirty worktree artifacts use final restoration as the authority.
- The root baseline may consume the committed Phase 39 manifest without materializing the user's deletion. The fallback is limited to one `.planning/**` path, requires an exact tracked-deletion status, uses shell-free bounded `git show HEAD:path`, and otherwise fails closed.

## Verification

- Exact Task 01 command — **PASS**: Phase 65 validation contract, UAT honesty ledger, and forbidden provider/source flags all green.
- Exact Task 02 command — **PASS**: `node tests/phase65-full-tests-harness.test.js && node scripts/run-phase65-full-tests.mjs`.
- Phase 65 harness — **PASS** across success, nonzero, both spawn-error classes, oversized injection, SIGINT, SIGTERM, and temporary dirty rewrite restoration.
- Phase 65 runner — **PASS**: focused adapter/authority/persistence/UI/source matrix, extension validation, sole root baseline, and final workspace identity.
- Terminal-ledger authority fixture — **PASS** in three consecutive focused registry repetitions; corrupt variants remain rejected and only the exact current-schema ledger acknowledges.
- Historical coverage manifest fallback — **20 passed, 0 failed**; every remaining root-tail test also passed.
- `65-VALIDATION.md` reports 16/16 automated commands green; the contract parser accepts the complete state and still rejects promoted manual rows.
- No live Codex model, account mutation, browser task, credential read, screenshot, or assistive-technology claim was made.
- The Git index was empty after every authoritative run. The inherited 402 planning deletions remained deletions, and the four protected artifacts retained their exact hashes:
  - `mcp/build/index.js`: `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`
  - `showcase/angular/public/llms-full.txt`: `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`
  - `showcase/angular/public/llms.txt`: `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`
  - `showcase/angular/public/sitemap.xml`: `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`

## Deviations from Plan

### Broad root contracts lagged the completed Phase 65 authority

- The exact Plan 08 contracts exposed older broad-suite expectations for the final direct-runtime authority, three-provider rosters, native wake, OpenCode topology, client inventory, and accepted terminal-ledger identity.
- Each was reconciled to the already-approved production contract in an isolated commit. The changes tightened current-schema assertions; they did not weaken production validation or add authority.

### Generated tests temporarily rewrite protected dirty artifacts

- The existing wrapper restored the artifacts exactly but still failed because it compared their intermediate pre-restore bytes. The harness now proves that temporary regeneration may occur while final restoration remains mandatory.
- Index mutation and any final byte/status/type/mode/link/untracked mismatch still fail closed.

### One root test depended on a user-deleted historical planning path

- The coverage test now prefers the live workspace file. Only when that exact bounded planning path is a tracked deletion does it read the unchanged committed HEAD bytes without recreating the file.
- The remaining root tail was scanned and executed; no other deleted-planning dependency remained.

**Total deviations:** three integration-alignment classes, all closed with focused regression evidence and no scope, authority, security, or acceptance-criteria reduction.

## Issues Encountered

- The first near-complete full run identified the stale terminal-ledger fixture after all Phase 65-focused suites passed. Source inspection showed the fixture omitted the accepted identity introduced by Plan 01; three repeated full registry runs passed after correction.
- The next run showed a restoration false-positive even though every protected hash was exact afterward. The shared wrapper's intermediate dirty-byte check, not final restoration, caused the failure.
- After that fix, the root tail reached the intentionally deleted Phase 39 manifest. A bounded read-only HEAD fallback preserved both the completeness proof and the user's deletion.

## User Setup Required

None for automated closure. Genuine account, browser/process, and accessibility evidence remains intentionally deferred to UAT65-01 through UAT65-03.

## Next Phase Readiness

- Phase 65 deterministic implementation and repository closure are complete; no automated blocker remains.
- The coordinating workflow can update project state and roadmap completion using this summary and the 16/16 validation receipt.
- UAT65-01, UAT65-02, and UAT65-03 remain the only outstanding Phase 65 evidence and must be performed by a human with the required external environment.

## Self-Check: PASSED

- Both task commits exist, and the final task commit contains exactly the declared validation/runner/root/CI files.
- The exact two plan commands pass on the final tree.
- All 16 automated validation rows are green; exactly three human UAT rows remain unchecked and evidence-empty.
- The inherited 402 deletions and four unrelated dirty artifacts remain untouched and unstaged with exact hashes.
- No `STATE.md` or `ROADMAP.md` update was made by this delegated executor.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
