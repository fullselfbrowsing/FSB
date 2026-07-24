---
phase: 64-opencode-adapter
plan: "13"
subsystem: testing
tags: [opencode, validation, uat, ci, workspace-preservation, security]

requires:
  - phase: 64-opencode-adapter
    plan: "08"
    provides: Shared attestation, replay, transient-secret, and terminal-barrier enforcement
  - phase: 64-opencode-adapter
    plan: "12"
    provides: Canonical provider-neutral delegated UI and honest unknown-billing presentation
provides:
  - Exact 13-plan and 28-task automated validation map across MULTI-01..03, D64-01..16, and T64-01..10
  - One guarded serial Phase 64 runner with complete failure, signal, index, dirty-state, and generated-graph preservation coverage
  - Exact root and CI occurrence/order contracts for the OpenCode adapter, topology suite, and existing drift gate
  - One honest three-scenario milestone-end UAT ledger that automation cannot promote
affects: [phase-64-verification, 65-codex-adapter, delegated-agent-ci]

tech-stack:
  added: []
  patterns:
    - Run compiled focused matrices through one closed commands-json invocation of the existing workspace preserver
    - Parse PLAN and validation artifacts into exact task, command, wave, requirement, threat, and dependency bijections
    - Keep deterministic green evidence separate from genuine authenticated process, browser, and accessibility evidence

key-files:
  created:
    - .planning/phases/64-opencode-adapter/64-HUMAN-UAT.md
    - scripts/run-phase64-full-tests.mjs
    - tests/phase64-full-tests-harness.test.js
  modified:
    - .planning/phases/64-opencode-adapter/64-VALIDATION.md
    - package.json
    - .github/workflows/ci.yml
    - tests/delegation-phase-contract.test.js
    - tests/agent-provider-forbidden-flags.test.js
    - tests/mcp-opencode-adapter.test.js

key-decisions:
  - "Treat only three unchecked human_needed/pending/evidence-empty rows as genuine account, process, browser, or accessibility evidence; deterministic fixtures and DOM tests cannot promote them."
  - "Use one explicit adapter aggregate section for root/focused execution while retaining the separate first-commit drift gate, so no parser/fixture/drift evidence is duplicated or skipped."
  - "Keep the existing Phase 62 direct drift-smoke CI job and make the renamed Phase 64 root step the sole Linux root invocation."
  - "Mark all 28 implementation rows green only after focused, source/security, historical-contract, full-root, and nested workspace-preservation gates pass."

patterns-established:
  - "Validation-map parser: exact task ids, plan/wave metadata, requirements, declared-threat coverage, PLAN command bytes, Wave-0 ownership, decisions, and manual evidence all fail closed."
  - "Closure runner: one shell-free outer process invokes one preservation wrapper and one bounded serial argv matrix."

requirements-completed: [MULTI-01, MULTI-02, MULTI-03]

duration: 30 min
completed: 2026-07-21
---

# Phase 64 Plan 13: OpenCode Validation Closure Summary

**Phase 64 now has an exact fail-closed validation map, one workspace-safe focused/root/CI path, complete source-security coverage, and an honest three-row pending live-evidence boundary.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-07-21T11:21:14Z
- **Completed:** 2026-07-21T11:50:40Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 9 implementation, test, workflow, and planning paths

## Accomplishments

- Added one milestone-end ledger with exactly three unchecked scenarios: genuine authenticated OpenCode-to-browser delegation, installed OpenCode 1.14.25 Providers/keyboard/screen-reader behavior, and live cold-versus-FSB-owned-attach feed/summary equivalence. Every scenario remains `human_needed`, `pending`, and evidence-empty.
- Added mutation-tested UAT honesty parsing that rejects checked, completed, nonpending, populated, missing, duplicate, extra, or synthetically promoted scenarios.
- Added `run-phase64-full-tests.mjs`, which invokes the existing MCP build preserver exactly once with a bounded, shell-free, explicit serial matrix covering the complete Phase 64 MCP, extension, browser, UI, security, and validation surface.
- Added an isolated preservation harness covering success, nonzero exit, command spawn error, wrapper spawn error, SIGINT, SIGTERM, dirty/staged/untracked files, complete generated graph shape/bytes/modes/symlinks, and raw Git index identity.
- Wired the harness and exact OpenCode adapter/topology suites into the root chain once, kept the generalized direct drift-smoke CI job once, and retained one Linux root invocation plus unchanged all-green dependencies.
- Reconciled all 28 task rows across all 13 plans, including Plan 02's declared T64-09 ownership, and mechanically pinned every command, wave, dependency, requirement, threat, decision, Wave-0 owner, architecture boundary, UI lock, and human-evidence boundary.
- Recalibrated seven historical literal assertions to their provider-neutral Phase 64 forms without relaxing their underlying trust, diagnostics, roster, root-order, or CI constraints.

## Task Commits

All three tasks landed as explicit RED/GREEN pairs:

1. **Human-UAT honesty RED** — `2269973f` (test; missing ledger and synthetic-promotion mutation corpus)
2. **Human-UAT honesty GREEN** — `aad446b1` (docs; exact three-row pending sanitized ledger)
3. **Focused runner/wiring RED** — `99717609` (test; runner preservation, occurrence, source, and secret-boundary contracts)
4. **Focused runner/wiring GREEN** — `e14994b8` (feat; guarded serial runner, root/CI wiring, and aggregate adapter entry)
5. **Final validation RED** — `9eaa4820` (test; exact plan/map/dependency/architecture/UI mutation contract and historical-pin calibration)
6. **Final validation GREEN** — `8b1783a9` (test; 28 green rows, complete threat map, current frontmatter, and automated/live sign-off split)

## Files Created/Modified

- `.planning/phases/64-opencode-adapter/64-HUMAN-UAT.md` — Defines the only three genuine external scenarios, all still unchecked and evidence-empty.
- `.planning/phases/64-opencode-adapter/64-VALIDATION.md` — Records exact 13-plan/28-task automated closure while preserving pending manual evidence.
- `scripts/run-phase64-full-tests.mjs` — Runs one bounded closed Phase 64 matrix through the existing workspace-preserving MCP build lifecycle.
- `tests/phase64-full-tests-harness.test.js` — Exercises runner success/failure/spawn/signal settlement and complete workspace/index/build identity.
- `tests/delegation-phase-contract.test.js` — Parses the Phase 64 UAT ledger, plan graph, validation map, root/CI wiring, architecture, security, and UI locks; also updates stale historical literals to current provider-neutral forms.
- `tests/agent-provider-forbidden-flags.test.js` — Pins the exact five-method/shared-verifier/no-user-process/no-replay/private-policy/transient-secret and reviewed-script-tag boundaries.
- `tests/mcp-opencode-adapter.test.js` — Adds the explicit adapter aggregate entry used by root and focused verification.
- `package.json` — Adds the preservation harness, adapter aggregate, and topology suite once in dependency order.
- `.github/workflows/ci.yml` — Names the sole root invocation for Phase 64 while retaining the one generalized drift-smoke job.

## Decisions Made

- Kept real capture provenance independent of fixture quality. Even complete deterministic parser, fake-process, DOM, and source evidence cannot populate or promote the live ledger.
- Derived exact task commands from PLAN `<automated>` blocks and compared them byte-for-byte with validation rows; requirements must equal each plan's frontmatter and task-row threat unions must cover every threat declared by the plan.
- Preserved the existing CI topology instead of adding a duplicate Phase 64 focused job: root owns each new suite once, while the Phase 62 drift-smoke step remains the single direct native-fixture gate.
- Kept OpenCode UI verification source/DOM based and provider-neutral: exact canonical Claude/OpenCode metadata, unknown OpenCode billing, two reviewed helper tags, existing row markup, and no provider-specific CSS.

## Security and Verification

- **T64-01 through T64-10: mitigated and mapped.** The validation parser proves all ten threats have exact plan/task ownership; no HIGH/CRITICAL threat is accepted or deferred.
- Exact five methods, generic topology, shared closed verifier, no provider callback/import/id branch, replay-before-spawn closure, result-candidate cleanup barrier, fixedEnv/opaque secret-binding separation, private 1.14.25 policy, canonical browser metadata, unknown billing, and no provider-specific layout are source-pinned.
- `node tests/delegation-phase-contract.test.js --section phase64-uat-ledger` — **PASS**, 10/10.
- `node tests/phase64-full-tests-harness.test.js` — **PASS** across success, nonzero, two spawn-error, SIGINT, and SIGTERM fixtures.
- `node scripts/run-phase64-full-tests.mjs` — **PASS** with `[mcp-build-preserver]` and `[phase64-full-tests]` workspace-identity receipts.
- `node tests/delegation-phase-contract.test.js --section phase64-validation` — **PASS**, 106/106 including eleven validation mutations and one invalid dependency-wave mutation.
- `node tests/delegation-phase-contract.test.js` — **PASS**, 1,153/1,153 historical and current assertions.
- `node tests/agent-provider-forbidden-flags.test.js` — **PASS**, all assertions.
- Exact final combined command — Phase 64 106/0, forbidden-source gate PASS, 20,295 streamed lines with 131 green summary lines, `[phase60-full-tests] PASS`, and `[mcp-build-preserver] PASS`; exit `0`.
- Final workspace audit retained the exact original 402 planning deletions and four unrelated modified artifacts, empty staging/untracked state, ordinary `H` flags on all seven guarded stat-refresh entries, and protected hashes `6a492a2e`, `664347e0`, `c69ed23d`, and `826aa8f8`.

No live OpenCode account, model call, user process, loopback service, Chrome delegation, screenshot, keyboard walkthrough, or assistive-technology run was performed or represented as green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added an explicit aggregate adapter test entry**

- **Found during:** Task 64-13-02 GREEN, first real focused-runner execution.
- **Issue:** The plan required one complete adapter-suite invocation, but `tests/mcp-opencode-adapter.test.js` accepted only narrow section arguments and exited with usage when invoked as a suite. The file was not listed in Plan 13's `files_modified` set.
- **Fix:** Added `--section adapter` to run detection, profile-policy, attestation, and composition exactly once; retained the separate first-commit drift gate so native parser/fixture/drift coverage is neither skipped nor duplicated. Root, runner, harness, and occurrence contracts use the same explicit entry.
- **Files modified:** `tests/mcp-opencode-adapter.test.js`, `scripts/run-phase64-full-tests.mjs`, `tests/phase64-full-tests-harness.test.js`, `tests/delegation-phase-contract.test.js`, `package.json`.
- **Verification:** Focused runner, isolated harness, exact root occurrence/order contract, and final full root suite all pass.
- **Committed in:** `e14994b8`.

**2. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation**

- **Found during:** Focused and final guarded repository verification.
- **Issue:** The external workspace watcher can refresh Git index stat tuples for clean generated entries after guarded builds, violating the frozen outer wrapper's raw-index byte invariant even when content, staging, status, and tests are unchanged.
- **Fix:** Proved the exact candidates ordinary tracked, worktree/staged clean, and object-identical; temporarily marked only six MCP generated entries for the focused run and those six plus the showcase version entry for the full run `assume-unchanged` under EXIT/INT/TERM restoration traps. The dirty MCP index and three dirty showcase artifacts were excluded.
- **Files modified:** None; all temporary local index flags were restored to ordinary `H`.
- **Verification:** Both preservation layers passed, candidate hashes stayed index-identical, protected dirty hashes stayed exact, and final staging/untracked state remained empty.
- **Committed in:** n/a.

---

**Total deviations:** 2 auto-fixed blocking integration/environment conditions.
**Impact on plan:** The required suite became executable and the documented external stat interference was neutralized without broadening production authority, adding dependencies, or changing user-owned work.

## Issues Encountered

- The first real focused matrix exposed the missing aggregate adapter CLI entry; the added explicit section resolved the invocation contract and remained independently covered by narrow section tests.
- The known Conductor stat-refresh race affected raw index bytes during guarded builds. The exact reversible mitigation produced current focused and full-suite preservation receipts without changing tracked content or retaining flags.

## User Setup Required

None - no dependency, credential, account, browser, executable, service, or local configuration was added. Genuine external UAT remains intentionally unexecuted.

## Next Phase Readiness

- Phase 64 deterministic implementation and security validation is complete; the exact three user-directed milestone-end UAT scenarios remain the only outstanding evidence.
- The provider-neutral five-method, topology, attestation, secret, lifecycle, browser metadata, UI, drift, runner, root, and CI contracts are ready to constrain Phase 65 Codex work.
- No automated Plan 64-13 blocker remains.

## Self-Check: PASSED

- All six RED/GREEN task commits exist with the expected paths and messages.
- All nine owned implementation/test/workflow/planning paths are committed; the summary is the only pending plan artifact before its metadata commit.
- Exact focused, source/security, historical, root, CI, full-suite, and nested preservation receipts are green.
- All three live scenarios remain unchecked, `human_needed`, `pending`, and evidence-empty.
- Shared planning state and all unrelated dirty workspace paths remained untouched and unstaged.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-21*
