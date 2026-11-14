---
phase: 71-comparative-gate-and-release
fixed_at: 2026-10-19T04:43:22Z
review_path: .planning/phases/71-comparative-gate-and-release/71-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 12
skipped: 2
status: partial
---

# Phase 71: Code Review Fix Report

**Fixed at:** 2026-10-19T04:43:22Z
**Source review:** .planning/phases/71-comparative-gate-and-release/71-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 14. The scope covers every Critical and Warning finding, plus each Info finding that is trivial and safe. All 14 were checked against the code; IN-05 was then judged not trivial.
- Fixed: 12. WR-03 is a partial fix; see below.
- Skipped: 2 (WR-05, IN-05).
- Every fix is its own `fix(71): ...` commit with no attribution line. Every behaviour change has a test.
- Verification:
  - The bench and release `node --test` group passes on Node 24.14.1 and Node 20.20.2: 573 tests, plus 8 in `bench-fast-mode-record`. That is 581 against the 576 baseline, with five new tests.
  - `version-sync`, `release-version-rehearsal`, `mcp-release-compat`, `mcp-version-parity` and `skill-fsb-spec` pass on both Node versions.
- No new test command was added, so `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS` are unchanged.
- The tree is clean apart from the untracked 71-REVIEW.md and this file.

## Fixed Issues

### CR-01: The sanctioned Jev cost claim renders sub-cent costs as `$0.0000`

**Files modified:** `scripts/bench/gate/lib/decision.mjs`, `tests/bench-gate-evaluate.test.mjs`
**Commit:** d4b840fa3
**Applied fix:**
- The `cost` formatter keeps four decimals from one cent up.
- Below a cent it shows at least six decimals and at least two significant digits: `0.0000378` renders as `$0.000038` and `3.78e-7` as `$0.00000038`.
- `checkClaims` re-renders with the same formatter, so validation agrees.
- The new test asserts `formatClaimValue('cost', 0.0000378) === '$0.000038'` and checks that the PASS scenario's cost sentence never contains `$0.0000`.

### WR-01: Cost claim averages over partial coverage and is published whatever the Jev verdict

**Files modified:** `scripts/bench/gate/lib/decision.mjs`, `tests/bench-gate-evaluate.test.mjs`
**Commit:** 15e5823f1
**Status:** fixed: requires human verification (cost semantics)
**Applied fix:**
1. **LLM cost per completed task** is `null` ('unavailable') unless every counted run in the group has a `cost.usd`.
2. **Jev cost per completed task** is `null` unless every counted fast run has a known Jev cost:
   - a run with `jevCalls === 0` (no_block, or local declines only) costs FSB nothing and counts as 0;
   - a called run counts as provider + estimate;
   - a called run with neither figure (every `summary` row, and a gateway with no figure) or with unrecorded exposure makes the figure unavailable.
3. **Labelling an estimate.** When any Jev figure comes from the gateway's input-token estimate, the sentence uses a new template, `cost-estimated` ("provider-reported where the provider gave a figure, otherwise estimated from input tokens"). This replaces `provider ?? estimate` per row, which would have dropped the estimated attempts of a mixed row.
4. **Only on a Jev pass.** The cost sentence is now written only when both Jev paths pass.

### WR-02: The evaluator does not check that a campaign is complete

**Files modified:** `scripts/bench/gate/lib/evaluate.mjs`, `tests/bench-gate-evaluate.test.mjs`
**Commit:** b8c318bd7
**Status:** fixed: requires human verification (completeness rule)
**Applied fix:**
- **The new check.** `campaignCompleteness` rebuilds the identity's full seeded schedule with the runner's own `buildSchedule` (from `identity.tasks` and `identity.schedule`). A campaign is complete when all of these hold:
  - each scheduled run has exactly one row whose arm, round, task and condition match its entry, so a schema-2 row with `condition: null` counts as missing;
  - there are no other rows;
  - no row carries a `PAUSING_INFRA_CODES` code.
- **The guard.** A new guard reason, `campaign_incomplete`, joins the sentinel, Jev, non-Jev and fallback guards (inconclusive, never a pass). It is not a fallback trigger, the same as `underpowered`. Campaign facts now also report `complete`, `missingRuns`, `unscheduledRows` and `pausedRuns`.
- **For the reviewer to confirm.**
  - The check uses the identity's full scheduled rounds, not rounds `1..minRounds`. A campaign scheduled above `minRounds` must finish its schedule.
  - The pin runner at 8a058bdf records `identity.tasks` and `identity.schedule` and builds the same runIds, so the V1 baseline is checked the same way. The schedule fixture confirms this.

### WR-03: The predeclaration check trusts the git author date, which amend and rebase keep

**Files modified:** `scripts/bench/gate/evaluate-gate.mjs`, `tests/bench-gate-cli.test.mjs`
**Commit:** f4b9940f4
**Status:** fixed (partial): requires human verification
**Applied fix:**
- The CLI now reads every commit that touched the gate (`git log --format=%aI%x09%cI -- <gate>`), not just the last one, and requires each author date to be strictly before every campaign's `createdAt`.
- This closes a real gap: an older-authored commit cherry-picked on top used to hide a later edit beneath it.
- The decision still records the last commit's author and committer dates. The Pitfall 6 rebase tolerance is unchanged and still tested.

**Not applied, for the owner to decide:**
- **The suggested committer-date rule does not catch the amend case it cites.** It exempts commits whose gate blob equals the current blob. An amend that edits the gate produces exactly the current blob, so the rule lets it through.
- **The same rule would undo the locked Pitfall 6 decision** (71-RESEARCH Q3, RESOLVED). After any post-V1 rebase, it would refuse every gate with more than one historical version.
- **Git history alone cannot tell an amend from a rebase**, because both keep the author date and rewrite the committer date. The only robust anchor is something recorded before V1, such as the gate sha256 written beside the V1 baseline at M-71-01b. That would change the Validation Block procedure, which the orchestrator and owner own.
- The header doc now says that the candidates' recorded gate sha256 binds the gate only from V4 on.

### WR-04: The gate campaign preflight lets `--allow-dirty` start hundreds of runs the evaluator will refuse

**Files modified:** `scripts/bench/run-bench.mjs`, `tests/bench-conditions.test.mjs`
**Commit:** 3e2d513ec
**Applied fix:**
- `gateCampaignIssues` now adds `allow_dirty` for any gate runner campaign id. That covers the two V4 campaigns and the fallback candidate, whose evaluator check also requires `git.dirty === false`. It applies with or without `--gate`, so the run is refused `gate_campaign_mismatch: allow_dirty` before any client opens.
- The second half of the suggestion, refusing when the tree is not known clean, is already covered: `evaluatePreflight` refuses `dirty_tree` unless `git.dirty === false`, and only `--allow-dirty` could bypass it.
- The usage line and the header doc are updated.

### WR-06: `validateDecision` accepts claims that contradict the decision's verdicts

**Files modified:** `scripts/bench/gate/lib/decision.mjs`, `tests/bench-gate-evaluate.test.mjs`
**Commit:** 4d5673ebe
**Status:** fixed: requires human verification (claim rules)
**Applied fix:** `checkClaimConsistency` runs once the paths and claims are structurally valid.
- **Required and allowed claims:**
  - `jev-whole-task` is required on a Jev pass; otherwise `jev-no-speedup` is required.
  - `jev-disabled` is required exactly when a Jev path's `v6Action` is `disable_jev_operator_switch`.
  - `mcp-non-jev-time` is required on a non-Jev pass, and `mcp-non-jev-faster` exactly when `faster === true`.
  - `cost` or `cost-estimated` is optional, at most once, and allowed only on a Jev pass.
  - Any other claim is `claim_not_allowed`. A duplicate is `claim_repeated`; a missing required claim is `claim_missing`.
- **Quoted numbers:**
  - `ratio`, `ratioLow`, `ratioHigh` and `completionDiff*` must equal the path's `criteria.speed`/`completion` exactly (`claim_value`).
  - The two Jev paths must carry the same speed and completion (`inconsistent:paths.jev-autopilot.criteria`).
- **Not checkable:** the counts in `jev-whole-task` and the non-Jev `bound`, because the decision file does not store them.

### IN-01: The method note misstates how run tokens differ from the baseline

**Files modified:** `scripts/bench/report.mjs`, `scripts/bench/gate/lib/gate-report.mjs`, `tests/bench-report.test.mjs`
**Commit:** 819b474b2
**Applied fix:**
- Both notes now say the start URL differs in its token alphabet and length (22 base64url characters at the pin, 24 lowercase letters now). The pin side was checked against `8a058bdf:scripts/bench/fixture-server.mjs` (`randomBytes(16).toString('base64url')`).
- The paired pin in `bench-report.test.mjs` was updated in the same commit.

### IN-02: The pin identity is checked against an 8-character SHA prefix

**Files modified:** `scripts/bench/gate/lib/evaluate.mjs`, `tests/bench-gate-evaluate.test.mjs`
**Commit:** 365181494
**Applied fix:**
- `baseline_not_pin` and `fallback_pin_not_pin` now compare with the full `PIN_SHA` (`8a058bdf0d17c1e3e79ec3104cc1996326b4c402`, checked with `git rev-parse`).
- A new refusal case covers a SHA that shares only the 8-character prefix.

### IN-03: `evaluate-gate --out` can overwrite any `.json` outside the campaign directories, the gate included

**Files modified:** `scripts/bench/gate/evaluate-gate.mjs`, `tests/bench-gate-cli.test.mjs`
**Commit:** bf3a7d0dc
**Applied fix:** `parseArgs` refuses `out_is_gate` (exit 2, before any git call or write) when the canonical `--out` path is the canonical gate path.

### IN-04: The count_tokens request has no timeout

**Files modified:** `scripts/mcp/count-tool-tokens.mjs`, `tests/mcp-count-tool-tokens.test.mjs`
**Commit:** a77384491
**Applied fix:**
- Each request and its body read carry `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` (30000 ms; `deps.timeoutMs` overrides it in tests). An abort exits 1 with the fixed message `count_tokens request timed out`.
- The test's stalled fakes hold a timer the way a real stalled socket holds the event loop. On Node 20, `AbortSignal.timeout`'s own timer does not keep the loop alive, and without the stand-in the runner cancelled the remaining tests. Both Node versions pass.

### IN-06: Identity guards inherited from the sentinel are shown as the non-Jev path's own identity mismatches

**Files modified:** `scripts/bench/gate/lib/decision.mjs`, `tests/bench-gate-evaluate.test.mjs`
**Commit:** ac948aa65
**Applied fix:**
- `identityOf` drops details that are `sentinel` or start with `sentinel.`, so `criteria.identity` reports only the baseline-against-claude comparison.
- The inherited reasons stay in the path's `reasons`, and the verdict is unchanged (inconclusive).

### IN-07: A lower MCP patch inherits a higher patch's compatibility declaration

**Files modified:** `scripts/lib/mcp-extension-compat.mjs`, `tests/version-sync.test.js`
**Commit:** 9c8e5d5b8
**Applied fix:**
- `compatFor` now inherits only from declared patches at or below the requested one. `0.11.0` and `0.11.1` now throw; `0.11.3` and `0.12.4` still inherit.
- `npm run version:check` (extension 0.9.92; MCP 0.11.2) still passes, and so do the rehearsal and parity suites.

## Skipped Issues

### WR-05: The release-diff docs allowlist classifies deployed and executable code as docs

**File:** `scripts/release/lib/release-diff.mjs:24-32`
**Reason:** Skipped. The suggested fix conflicts with a locked decision and would break documented V6 steps.
- **It contradicts D-24 as amended.** The 2026-10-16 amendment (71-CONTEXT D-24) narrows only `showcase/server/**` and states that "the rest of `showcase/**` stays docs". The owner acknowledges or rejects that narrowing as M-71-00 item 5. D-24's stated consequence is that "any extension or MCP code change after V4 needs a re-measure".
- **The Angular site is not part of the measured system.** The root Dockerfile only builds `showcase/angular` into static files that the server serves; the Jev gateway runtime is `showcase/server` alone. `skills/fsb/scripts` is not exercised by the bench either.
- **It would break two V6 steps.**
  - M-71-11b's documented procedure edits the 11 English component sites, including `agents-page.component.ts` and `support-page.component.ts`, and requires `check-release-diff --step A` to still pass.
  - The D-28 showcase release notes live in `release-notes-page.component.ts` (`DOCUMENTED_VERSIONS`).
  - Classifying `showcase/**/*.ts` as forbidden fails both.
- **Narrower variants still change the policy.**
  - Treating the setter-only targets `showcase/angular/package.json`, `package-lock.json` and `src/app/core/seo/version.ts` as `setter` would turn an Angular dependency bump merged from `main` at M-71-10 step 8 into a re-measure decision.
  - Forbidding `skills/**/*.mjs` departs from D-24's `skills/**` allowlist.
- **Owner decision at M-71-00 item 5:** whether to forbid build manifests and `skills/**/scripts` code.

**Original issue:** `showcase/**` and `skills/**` are classified as docs, so post-V4 changes to the deployed Angular site's code and dependencies, `showcase/js`, `showcase/assets` and the skill's `install-host.mjs` pass `check-release-diff.mjs`. The setter targets under `showcase/angular` never get the setter comparison.

### IN-05: The condition applier leaves the fast-mode switch in its last state

**File:** `scripts/bench/run-bench.mjs:1330-1352`
**Reason:** Skipped as not trivial, so outside the "info only when trivial and safe" scope.
- The fix would add a best-effort write and CDP readback of `fsbJevFastModeEnabled` to the runner's completion, pause and SIGINT paths. It changes runner lifecycle behaviour against a live Chrome profile, and it can only be proven live.
- The safer alternative, refusing `--smoke` or `--campaign` without `--conditions` while the stored switch reads `true`, adds a new preflight refusal and needs owner review.
- Suggested for the V3/V4 operator checklist: after `core-gate-71-autopilot`, confirm the bench profile's switch reads off before any unconditioned run.

**Original issue:** Nothing restores `fsbJevFastModeEnabled` after a conditioned run, so a later run without `--conditions` can run with fast mode on while its rows record `condition: null`.

---

_Fixed: 2026-10-19T04:43:22Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
