---
phase: 71-comparative-gate-and-release
reviewed: 2026-10-19T04:19:15Z
depth: standard
files_reviewed: 65
files_reviewed_list:
  - README.md
  - extension/ui/onboarding.js
  - mcp/README.md
  - package.json
  - scripts/bench/fixture-server.mjs
  - scripts/bench/gate/baseline-safety.mjs
  - scripts/bench/gate/evaluate-gate.mjs
  - scripts/bench/gate/lib/decision.mjs
  - scripts/bench/gate/lib/evaluate.mjs
  - scripts/bench/gate/lib/gate-report.mjs
  - scripts/bench/gate/lib/gate.mjs
  - scripts/bench/gate/lib/sidecar.mjs
  - scripts/bench/gate/lib/synthetic.mjs
  - scripts/bench/gate/release-gate-v1.0.0.json
  - scripts/bench/gate/simulate-power.mjs
  - scripts/bench/lib/mcp-client.mjs
  - scripts/bench/lib/runs.mjs
  - scripts/bench/lib/stats.mjs
  - scripts/bench/report.mjs
  - scripts/bench/run-bench.mjs
  - scripts/lib/mcp-extension-compat.mjs
  - scripts/mcp/count-tool-tokens.mjs
  - scripts/release/check-release-diff.mjs
  - scripts/release/lib/release-diff.mjs
  - scripts/sync-product-version.mjs
  - showcase/angular/scripts/llms-full.source.md
  - showcase/angular/scripts/llms.source.md
  - showcase/angular/src/app/pages/about/about-page.component.html
  - showcase/angular/src/app/pages/agents/agents-page.component.html
  - showcase/angular/src/app/pages/agents/agents-page.component.ts
  - showcase/angular/src/app/pages/home/home-page.component.html
  - showcase/angular/src/app/pages/support/support-page.component.ts
  - showcase/angular/src/locale/messages.de.xlf
  - showcase/angular/src/locale/messages.es.xlf
  - showcase/angular/src/locale/messages.ja.xlf
  - showcase/angular/src/locale/messages.ko.xlf
  - showcase/angular/src/locale/messages.xlf
  - showcase/angular/src/locale/messages.zh-CN.xlf
  - showcase/angular/src/locale/messages.zh-TW.xlf
  - showcase/angular/src/locale/same-source-allowlist.json
  - skills/fsb/references/tool-decision-tree.md
  - tests/bench-conditions.test.mjs
  - tests/bench-f5-token.test.mjs
  - tests/bench-fast-mode-record.test.mjs
  - tests/bench-gate-cli.test.mjs
  - tests/bench-gate-evaluate.test.mjs
  - tests/bench-gate-power.test.mjs
  - tests/bench-gate-synthetic.test.mjs
  - tests/bench-gate.test.mjs
  - tests/bench-report.test.mjs
  - tests/bench-runs-v2.test.mjs
  - tests/bench-stats.test.mjs
  - tests/delegation-phase-contract.test.js
  - tests/fixtures/bench/jev-measurement-real-shape.json
  - tests/fixtures/bench/schedule-v1-core-baseline-66.json
  - tests/fixtures/mcp-release-delta-0.12.0.json
  - tests/helpers/release-doc-parity.js
  - tests/helpers/tool-count-docs.js
  - tests/mcp-count-tool-tokens.test.mjs
  - tests/mcp-release-compat.test.js
  - tests/mcp-version-parity.test.js
  - tests/release-diff.test.mjs
  - tests/release-version-rehearsal.test.js
  - tests/skill-fsb-spec.test.js
  - tests/version-sync.test.js
findings:
  critical: 1
  warning: 6
  info: 7
  total: 14
status: issues_found
---

# Phase 71: Code Review Report

**Reviewed:** 2026-10-19T04:19:15Z
**Depth:** standard
**Files Reviewed:** 65
**Status:** issues_found

## Summary

Scope: the Phase 71 diff `3493c34a..HEAD`, excluding `.planning/` and `showcase/angular/public`. I read all of the new tooling in full: the runner condition dimension and the schema-2 rows, the gate validator, the evaluator, the decision file and claims, the gate report, the evaluator CLI, the baseline-safety sidecar, the release-diff checker, the token counter and the version-setter compatibility map. I checked the docs and copy diffs against the code, and skimmed the test files for reliability problems. I traced the cross-module contracts against the producers:
- `readExtensionStorageFlag` and the `chrome.storage.local` keys in `background.js`;
- the Jev scrubber's high-entropy rule behind the F5 fix;
- `projectJevMeasurement` and `addCommandTotals`, which back the Exposure rule;
- the Dockerfile, which backs the release-diff classification.

The new bench and release suites pass locally on Node 24 (292 tests across 10 files).

Security: no secrets, tokens or raw URLs reach committed rows, decision files, reports or console output:
- Raw records stay under the gitignored `scripts/bench/.local/`.
- The added `jevMeasurement` copy is the allowlisted projection.
- `endReason` is restricted to tokens.
- The count-tokens script never echoes the API key or response bodies.
- The F5 token fix is sound: 24 lowercase letters cannot satisfy the scrubber's upper/lower/digit requirement.

The defects are in what the release tooling decides and publishes:
- The sanctioned cost claim prints Jev cost as `$0.0000` (CR-01). It also understates costs when coverage is partial, and it is emitted even when Jev is disabled.
- The evaluator does not check that a campaign is complete.
- The predeclaration check rests on a git author date that `--amend` and rebase preserve.
- The gate preflight lets `--allow-dirty` start paid runs that the evaluator will refuse.
- The release-diff docs allowlist classifies deployed and executable code as docs.
- `validateDecision` does not tie claims to verdicts.

## Critical Issues

### CR-01: The sanctioned Jev cost claim renders sub-cent costs as `$0.0000`

**File:** `scripts/bench/gate/lib/decision.mjs:157` (used by `costClaim` at 211-221)
**Issue:** The `cost` formatter is `` `$${value.toFixed(4)}` ``. Jev cost per completed task is a fraction of a cent. The real-shape fixture has $0.0000756 for a whole command, and `report.mjs` and `gate-report.mjs` both switch to six decimals (`fmtUsdFine`) for exactly this reason. Checked: `renderClaim('cost', …jevOn 0.0000378…)` gives `…Jev cost per completed task with it on was $0.0000 (provider-reported), which FSB bears…`.

This is the only sentence V6 is allowed to quote (D-18, M-71-10 step 3). A release note would therefore state a measured Jev cost of zero. `checkClaims` re-renders with the same formatter, so the validator accepts the wrong text.

**Fix:** Format cost with enough precision for sub-cent values. Either use one formatter per magnitude, or keep `cost` for LLM figures and add a source for Jev cost:
```js
const FORMATTERS = Object.freeze({
  'wallMs-ratio': (value) => `${(value * 100).toFixed(1)}%`,
  'completion-diff': (value) => signedOneDecimal(value * 100),
  'completion-count': (value) => String(Math.round(value)),
  // Six decimals, as fmtUsdFine in report.mjs: Jev costs are fractions of a cent.
  cost: (value) => (value !== 0 && Math.abs(value) < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`),
});
```
Add a test asserting that `formatClaimValue('cost', 0.0000378)` is not `$0.0000`.

## Warnings

### WR-01: Cost claim averages over partial coverage and is published whatever the Jev verdict

**File:** `scripts/bench/gate/lib/decision.mjs:192-221, 271-272`
**Issue:**
1. Both `llmCostPerCompleted` and `jevProviderCostPerCompleted` sum only the rows that have a cost, then divide by every completed run. When some counted runs lack a cost, the per-task figure is biased low. That happens with `cost.usd` null, with `summary`-source rows (`jev.usd` is always null; these are exactly the `jev_measurement_missing` runs), and with a gateway that reports `estimate` instead of `provider`. The Phase 66 report shows `runsWithCost`/`runsWithoutCost` next to its figure; the claim drops that coverage.
2. `costClaim` runs unconditionally. When Jev is `not_exercised`, inconclusive or disabled for safety, the claims list still holds "LLM cost … with fast mode on … Jev cost … with it on". In the disabled case it sits beside "Fast mode is disabled for every install for this release."

**Fix:**
- Return `null` (rendered `unavailable`) unless every counted row in the group has a cost.
- Count Jev cost from `provider ?? estimate`, and say which was used.
- Only emit the `cost` claim when the Jev paths `pass`, or when the claim is an LLM-only sentence with no fast-mode comparison.

### WR-02: The evaluator does not check that a campaign is complete

**File:** `scripts/bench/gate/lib/evaluate.mjs:604-618` (`observedRounds`, `meetsMinRounds`), `670-701` (`refusalsOf`)
**Issue:** `meetsMinRounds` only requires the highest round number among the rows, infra rows included, to reach `minRounds`. Nothing compares the rows against `identity.schedule.runs` or the schedule's run ids. Three things go unnoticed:
- A campaign that paused mid-way through its last round and was never resumed is evaluated as complete. Pausing codes include `condition_not_applied` and `provider_error`.
- Unresolved pausing infra rows are dropped silently, and they can fall unevenly between `off` and `on`, so the interleaving balance breaks.
- A schema-2 row with `condition: null` is excluded from both Jev groups by `groupRows` without any error.

The header promises that "a campaign under its minRounds" can never pass. That is not what the check enforces.

**Fix:** In `refusalsOf` (or as an `underpowered`/`incomplete` guard), rebuild the schedule from the identity and require a row for every scheduled run in rounds `1..minRounds`. Also require that no latest row carries a `PAUSING_INFRA_CODES` code:
```js
const expected = buildSchedule({ campaignId: spec.id, taskIds: identity.tasks.map((t) => t.id),
  rounds: identity.schedule.rounds, arms: spec.arms, seed: spec.seed, ...(spec.conditions ? { conditions: spec.conditions } : {}) });
const have = new Set(runs.map((row) => row.runId));
if (expected.some((entry) => entry.round <= spec.minRounds && !have.has(entry.runId))) add('campaign_incomplete', `${role}.runs`);
if (runs.some((row) => PAUSING_INFRA_CODES.includes(row.infraError))) add('campaign_paused', `${role}.runs`);
```

### WR-03: The predeclaration check trusts the git author date, which amend and rebase keep

**File:** `scripts/bench/gate/evaluate-gate.mjs:279-292`
**Issue:** The gate counts as "predeclared" when the author date of the last commit touching it is earlier than every campaign's `createdAt`. `git commit --amend` keeps the original author date, and so does an interactive rebase that edits the gate. The gate's thresholds can therefore be rewritten after the V1 baseline exists and still pass this check:
- The V1 baseline records no gate hash, because the pin runner has none.
- The V4 campaigns record whatever hash was committed when they ran.
- The committer date is captured into the decision but never compared.

D-11 says the gate is frozen before V1. This check does not enforce that.

**Fix:** List every commit that touched the gate. Refuse when any of them has a committer date at or after the earliest campaign `createdAt`, unless its blob equals the current gate blob:
```js
const log = deps.git(['log', '--format=%H %aI %cI', '--', gateRel], deps.repoRoot);
// for each commit: if Date.parse(cI) >= earliestCreatedAt and `git rev-parse <H>:<gateRel>` !== current blob -> gate_not_predeclared
```
Alternatively, have M-71-01b record the gate's sha256 next to the V1 identity and refuse when it differs from `input.gateSha256`.

### WR-04: The gate campaign preflight lets `--allow-dirty` start hundreds of runs the evaluator will refuse

**File:** `scripts/bench/run-bench.mjs:1478-1489, 1558-1561`
**Issue:**
- `gateCampaignIssues` exists "so a typing error cannot start hundreds of paid runs".
- It ignores `options.allowDirty`, and `evaluatePreflight` skips the dirty-tree refusal when `--allow-dirty` is given.
- The evaluator then refuses any candidate whose `git.dirty !== false` (`candidate_dirty`).

A gate campaign started with `--allow-dirty` on a dirty tree runs all 720 or 360 paid runs, and its output can never be evaluated.

**Fix:** Add the check to `gateCampaignIssues`:
```js
if (options.allowDirty === true) issues.push('allow_dirty');
```
The evaluator refuses candidates with `git.dirty` set to anything but `false`, so it is not enough to check the flag. The runner should also refuse when `pre.git.dirty !== false` for a gate campaign id.

### WR-05: The release-diff docs allowlist classifies deployed and executable code as docs

**File:** `scripts/release/lib/release-diff.mjs:24-32` (`'showcase/**'`, `'skills/**'`)
**Issue:** The checker's contract is that "nothing ships that was not measured", and that the release differs from the measured commit "only by docs and setter output". It carves out `showcase/server/**` because `deploy.yml` ships it. But the root `Dockerfile` also builds and ships `showcase/angular/` (including `package.json`, `package-lock.json`, `angular.json` and `src/**/*.ts`), `showcase/js/*.js` and `showcase/assets/`, and all of those are classified `docs`.

`skills/fsb/scripts/*.mjs` is classified `docs` too. That includes `install-host.mjs`, the consent-gated installer that writes MCP host configs on users' machines.

`showcase/angular/package.json` and `package-lock.json` are even setter targets (`--print-targets` lists them), but rule 3 (docs wins over setter) means they never get the byte-for-byte setter comparison.

So a post-V4 dependency bump or a code change in the deployed site or the skill installer passes `check-release-diff.mjs` with exit 0.

**Fix:** Narrow the docs class for these two trees to non-executable files. Treat package manifests, lockfiles, build config, `*.js`, `*.mjs` and `*.ts` as `forbidden`. The V6 copy edits (templates, locale catalogs, llms sources, `*.md`) stay allowed:
```js
const CODE_FILE = /(^|\/)(package(-lock)?\.json|angular\.json|tsconfig[^/]*\.json)$|\.(m?js|ts|cjs)$/;
if (relativePath.startsWith('showcase/') || relativePath.startsWith('skills/')) {
  if (CODE_FILE.test(relativePath)) return hasTarget(setterTargets, relativePath) ? 'setter' : 'forbidden';
}
```
With this change, the setter-written `showcase/angular/src/app/core/seo/version.ts`, `package.json` and `package-lock.json` get the setter-equality check instead of being skipped. The M-71-11b copy edits stay `docs`.

### WR-06: `validateDecision` accepts claims that contradict the decision's verdicts

**File:** `scripts/bench/gate/lib/decision.mjs:282-330, 628`
**Issue:** `checkClaims` checks that each claim's text matches its own tokens, nothing more:
- A `jev-whole-task` claim is accepted in a decision whose Jev verdict is `fail`.
- An `mcp-non-jev-faster` claim is accepted with `faster: false`.
- Token values are never compared with `paths.*.criteria`, so a ratio edited to 0.5 in both token and text passes.

The module doc says a hand edit fails validation, and D-18 makes these the only sentences V6 may quote. In practice the validator does not detect a claim that is inconsistent with the verdicts.

**Fix:** In `validateDecision`, derive the allowed claim ids from `paths` and compare token values with the criteria. For example:
- `jev-whole-task` is allowed only if both Jev verdicts are `pass`;
- `jev-disabled` is required exactly when `v6Action === 'disable_jev_operator_switch'`;
- `mcp-non-jev-*` is allowed only on a non-Jev `pass`, and `-faster` only when `faster === true`;
- `ratio`, `ratioLow` and `ratioHigh` must equal `criteria.speed.estimate/ci`, and `completionDiff*` must equal `criteria.completion`.

## Info

### IN-01: The method note misstates how run tokens differ from the baseline

**File:** `scripts/bench/report.mjs:85`, `scripts/bench/gate/lib/gate-report.mjs:65`
**Issue:** "…the start URL in each instruction differs in its token alphabet only." The baseline token is `randomBytes(16).toString('base64url')`, which is 22 characters. The new token is 24 characters, so the length differs as well.
**Fix:** Change the sentence to "differs in its token alphabet and length (22 base64url characters at the pin, 24 lowercase letters now)".

### IN-02: The pin identity is checked against an 8-character SHA prefix

**File:** `scripts/bench/gate/lib/evaluate.mjs:56, 693, 766`
**Issue:** `PIN_SHA_PREFIX = '8a058bdf'` and `startsWith` accept any commit whose SHA starts with these 8 hex digits. The full pin SHA (`8a058bdf0d17c1e3e79ec3104cc1996326b4c402`) is known and already used in `synthetic.mjs`.
**Fix:** Compare `git.sha === PIN_SHA` with the full 40-character value.

### IN-03: `evaluate-gate --out` can overwrite any `.json` outside the campaign directories, the gate included

**File:** `scripts/bench/gate/evaluate-gate.mjs:219-224, 417-420`
**Issue:** The only guard is "not inside a campaign directory". A typo such as `--out scripts/bench/gate/release-gate-v1.0.0.json` replaces the frozen gate with the decision file, and the `.report.md` lands beside it.
**Fix:** Refuse when `canonical(outPath) === canonical(gatePath)`, or require the output to be under `scripts/bench/gate/decisions/`.

### IN-04: The count_tokens request has no timeout

**File:** `scripts/mcp/count-tool-tokens.mjs:169-173`
**Issue:** `deps.fetch(COUNT_TOKENS_URL, …)` has no `signal`. A stalled connection hangs the V4 M-71-09 step indefinitely.
**Fix:** Pass `signal: AbortSignal.timeout(30000)` (available on Node 20) and map an abort to `CountError('count_tokens request timed out')`.

### IN-05: The condition applier leaves the fast-mode switch in its last state

**File:** `scripts/bench/run-bench.mjs:1330-1352`
**Issue:** The applier writes `fsbJevFastModeEnabled` before each run and nothing restores it on completion, pause or SIGINT. After `core-gate-71-autopilot` the bench profile can be left with fast mode on. A later run without `--conditions` (a smoke or a manual check) then runs with fast mode on, while its rows record `condition: null`.
**Fix:** In the `finally` of a conditioned run, write the switch back to `false` (best effort) and read it back. Alternatively, have `--smoke`/`--campaign` without `--conditions` refuse when the stored switch reads `true`.

### IN-06: Identity guards inherited from the sentinel are shown as the non-Jev path's own identity mismatches

**File:** `scripts/bench/gate/lib/decision.mjs:343-348`
**Issue:** `identityOf` keeps every guard that starts with `identity_mismatch:`, including `identity_mismatch:sentinel.chromeMajor` inherited from the autopilot sentinel. The non-Jev `criteria.identity` then reads `inconclusive` even when the baseline and Claude campaigns match.
**Fix:** Exclude the `sentinel.`-prefixed details from `identityOf`, or report them under a separate field.

### IN-07: A lower MCP patch inherits a higher patch's compatibility declaration

**File:** `scripts/lib/mcp-extension-compat.mjs:75-86`
**Issue:** `compatFor('0.11.0')` returns the `0.11.2` entry. Its text cites the `mcp:task-status` route, which may not apply to an earlier patch. The doc comment says "a patch release inherits its minor's declaration", which reads as forward-only.
**Fix:** Inherit only from declared patches at or below the requested one (`Number(patch) <= Number(requested[3])`), and throw otherwise.

---

_Reviewed: 2026-10-19T04:19:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
