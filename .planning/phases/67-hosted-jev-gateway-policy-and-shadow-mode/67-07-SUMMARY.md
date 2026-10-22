---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 07
subsystem: extension
tags: [jev, extension, policy, tighten-only, safety, hook-pipeline, jev-06, jev-05]

# Dependency graph
requires:
  - phase: 67-01
    provides: "Server CONTRACT (KINDS, CHOICE_KINDS, NOUL_KINDS, RESERVED_OPTION_KEY, FALLBACK_REASONS, HTTP_STATUS_BY_REASON) that CONSTANTS mirrors and the outcome tables iterate"
  - phase: 67-03
    provides: "Server applyCalibration, loadProfiles and the shipped UNCALIBRATED profile, used to produce the calibrated, uncalibrated and snapshot_changed fixtures"
provides:
  - "extension/ai/jev-policy.js: FsbJevPolicy with LEVELS, LEVEL_NAMES, CONSTANTS, accept, normalizeGate.{consent, paymentFill, permission, safetyBreakers, stuck}, combineGates, mergeConfirmation, toBeforeToolResult"
  - "tests/jev-policy-tighten-only.test.js (29,647 checks; not yet registered, 67-13 registers it)"
affects: [67-11, 67-12, 67-13, 68, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A strictness lattice (proceed 0 < confirm 1 < deny 2 < stop 3) where Jev's contribution is typed 'none' | 'confirm' and the merge is max()"
    - "Fail-closed normalizers: every unrecognised gate output maps to deny (or stop for breakers and stuck)"
    - "Total functions: each read is guarded, so a throwing getter, a throwing Proxy or a revoked Proxy gives a typed verdict instead of an exception"
    - "Hook adapter that expresses tightening only through `denied`, never by stopping the pipeline"
    - "Fixtures produced by the server's own applyCalibration, so the producer and the consumer are held to the same shapes"

key-files:
  created:
    - extension/ai/jev-policy.js
    - tests/jev-policy-tighten-only.test.js
  modified: []

key-decisions:
  - "accept() checks fields in a fixed order (kind, ok, calibration.status, decisions[kind] as an own property, threshold, meetsThreshold, choice or p) and reads each field once; an unknown kind argument is 'malformed'"
  - "A risk decision inherited through the prototype chain is 'kind_absent' (own-property lookup), so a polluted prototype cannot raise or lower anything"
  - "combineGates: a non-array is deny; an entry whose level is not exactly 0, 1, 2 or 3 is deny; a fault partway through keeps the strictest level already seen"
  - "mergeConfirmation reads options.failClosed only when it is exactly true; a non-object options value or a throwing getter is treated as not opted in"
  - "toBeforeToolResult denies only when merged.jevContribution is exactly 'confirm'; a malformed merged value gives a pass (D-30: a Jev failure contributes nothing)"
  - "The module and its normalizeGate object are frozen, so another script in the shared worker scope cannot swap an export"

patterns-established:
  - "Mutation-checked property suite: every planted policy or agent-loop regression (10 tried) turns the suite red"
  - "Read-tracing Proxy proves the exact field set accept() reads, including on a hostile result"

requirements-completed: [JEV-06, JEV-05]

# Metrics
duration: 30min
completed: 2026-10-17
---

# Phase 67 Plan 07: FsbJevPolicy Tighten-Only Policy Summary

**FsbJevPolicy is a pure, total strictness lattice. Jev can only ever add a confirmation on top of FSB's own gates, and 7,350 gate x outcome x failClosed combinations prove it. The tables run over real `detectStuck`, `checkSafetyBreakers` and `createPermissionHook` outputs and over real server-produced Jev results. The real breakers and the real stuck detector ignore every Jev field on the session. A permission denial survives both registration orders of the real HookPipeline.**

## Performance

- **Duration:** about 30 min
- **Started:** 2026-10-17T04:48:43Z
- **Completed:** 2026-10-17T05:20:00Z
- **Tasks:** 2 (TDD; 3 commits)
- **Files:** 2 created, none modified

## Accomplishments

- **`extension/ai/jev-policy.js`.** One IIFE over `globalThis`/`self`, frozen exports and a `module.exports` guard. There is no top-level `const`/`let`/`class` and no `chrome`, `fetch`, timer, storage, clock or randomness. In a bare `vm` context it loads and adds exactly one global, `FsbJevPolicy`. Every export is total: none throws on any input, including throwing getters, throwing proxies and revoked proxies.
- **Section A (shape).** The suite checks the exact API key set, the frozen state, the CONSTANTS deep-equality with the server CONTRACT, the inert vm load and the D-17 source rules.
- **Section B (`accept`).** Every one of the 75 outcomes gets its expected risk verdict. All 10 kind arguments give exact-key verdicts. A read-tracing Proxy shows `accept` reads only `ok`, `calibration.status` and `decisions[kind].{threshold, meetsThreshold, choice|p}`. JEV-05: results that the real server `applyCalibration` builds under the shipped UNCALIBRATED profile give `not_calibrated` for all 5 kinds on 4 served models. Every profile `loadProfiles()` returns today stays inside the acceptance rule, so the V3 rerun (M-67-09) checks the committed profile automatically.
- **Section C (normalizers).** The real stuck rows are captured from `detectStuck` (not stuck, hint-only at the warn threshold, force-stop) and checked to have exactly the keys `isStuck`, `shouldForceStop`, `reasonCode` and `hint`. The real breaker rows come from `checkSafetyBreakers` (iteration cap, time limit with a stubbed `Date.now`, go). The real permission rows come from `createPermissionHook`. Each normalizer fails closed on 25 hostile inputs.
- **Section D (cross product).** 49 existing-gate states x 75 Jev outcomes x failClosed in {false, true} = **7,350 combinations**. Each failClosed=false combination runs 5 equivalent option forms (`undefined`, `{}`, `{failClosed:false}`, `{failClosed:'true'}`, `{failClosed:1}`), giving 22,050 merges. The suite checks every property in the plan for each one. Hostile outcomes must merge exactly like their non-hostile twins, and no input is mutated.
- **Section E (real-export invariance).** In 7 scenarios, two fresh sessions are run per scenario, one of them carrying `session.jev`, `jevApproved`, `skipConfirmation`, `fastMode` and `agentState.jevOverride`. The scenarios are a fresh session, the iteration cap, the time limit with a stubbed clock, an identical-action repeat to force-stop, changing results, a no-page-change force-stop and a mixed run. Both arms give deep-equal `checkSafetyBreakers` and `detectStuck` sequences and the same agent-state evolution. A control shows that a real change (maxIterations 4 to 5) does change the sequence, so the comparison is not vacuous.
- **Section F (real HookPipeline).** A denying `createPermissionHook` is registered with a `toBeforeToolResult` handler, for a 'confirm' and a 'none' merged result, in both orders. All four emits come back not stopped, with the permission denial present and the agent-loop consumer (`results.find(r => r && r.denied)`) skipping the tool. The same holds for all 6 distinct merged results the tables produce. With an allowing permission hook, a Jev 'confirm' holds the tool as `jev_requires_confirmation` and a 'none' lets it run. **Control case:** a handler returning a stop registered before the permission hook hides the denial (the pipeline stops, nothing is denied, and the consumer would run the tool). That is why `toBeforeToolResult` never stops.

## Consumer API (Phases 68 and 70)

Everything is on `globalThis.FsbJevPolicy` in the service worker, or `require('extension/ai/jev-policy.js')` under Node. Nothing in the extension calls it in Phase 67, and 67-11 loads it inert.

### Levels and constants

- `LEVELS = {proceed:0, confirm:1, deny:2, stop:3}` and `LEVEL_NAMES = ['proceed','confirm','deny','stop']`.
- `CONSTANTS = {KINDS, CHOICE_KINDS, NOUL_KINDS, RESERVED_OPTION_KEY}`. These deep-equal the server CONTRACT, and the suite enforces it.

### `FsbJevPolicy.accept(result, kind)`

- Returns one of:
  - `{accepted:true, kind, choice}` for operation and target;
  - `{accepted:true, kind, p}` for completion, stuck and risk;
  - `{accepted:false, reason}`, where reason is `not_ok`, `not_calibrated`, `kind_absent`, `threshold_null`, `below_threshold`, `catch_all` or `malformed`.
- A decision is accepted only when all of these hold:
  - `result.ok === true`;
  - `result.calibration.status === 'calibrated'`;
  - `decisions[kind]` is an own property and is an object;
  - `threshold` is a number in [0, 1];
  - `meetsThreshold === true`;
  - for a Choice, `choice` is a non-empty string other than `none_of_the_above` (`catch_all`);
  - for a Noul, `p` is in [0, 1].
- Check order and reasons:
  - an unknown `kind` argument, or a non-object result, is `malformed`;
  - `ok === false` is `not_ok`;
  - any other non-true `ok` is `malformed`;
  - a status other than `calibrated` is `not_calibrated`;
  - a missing decision is `kind_absent`;
  - a null threshold is `threshold_null`.
- **It is necessary, never sufficient.** Phase 68 must add its own eligibility and freshness checks on top (D-28).
- `meetsThreshold` already encodes direction. For completion it means "p at or below the veto cut" (`NOUL_DIRECTION`), so callers must not compare `p` to `threshold` themselves.

### `FsbJevPolicy.normalizeGate.*(rawGateOutput)`

Each normalizer returns `{level, source}`.

| Normalizer | proceed | everything else |
| --- | --- | --- |
| `consent(decisionOrObject)` | `'allow'` or `{decision:'allow'}` | deny: `ask`, `off`, `mutating_required`, `blocked`, unknown, wrong case, null (the router blocks every non-allow verdict at invoke time) |
| `paymentFill(result)` | `{approved:true}` | deny: `{approved:false, reason}` for any reason, malformed |
| `permission(result)` | `{denied:false}` | deny: `{denied:true}`, malformed |
| `safetyBreakers(result)` | `{shouldStop:false}` | stop: a stop, malformed |
| `stuck(result)` | `{isStuck:false, shouldForceStop:false}` and the hint-only `{isStuck:true, shouldForceStop:false}` | stop: force-stop, null, `{}`, non-boolean flags, `shouldForceStop` true with `isStuck` false |

A caller with no stuck result for the step must leave the stuck gate out of `combineGates` rather than pass null, because null fails closed to stop.

### `FsbJevPolicy.combineGates(gates)`

- Returns `{level, source:'combined'}`, where level is the maximum of the gate levels.
- An empty array is proceed and a non-array is deny.
- An entry whose `level` is not exactly 0, 1, 2 or 3 counts as deny.

### `FsbJevPolicy.mergeConfirmation(existingGate, result, options = {})`

- `existingGate` is one normalized gate, or an array that is merged with `combineGates`. A malformed value counts as deny.
- Returns `{level, levelName, existingLevel, jevContribution, requiresConfirmation, blocked}`:
  - `jevContribution` is only ever `'none'` or `'confirm'`;
  - `level = max(existingLevel, jevContribution === 'confirm' ? 1 : 0)`;
  - `requiresConfirmation` is `level === 1`;
  - `blocked` is `level >= 2`. Jev alone never causes a deny or a stop.
- Jev contributes `'confirm'` when `accept(result, 'risk')` accepts, which means a calibrated, at-threshold risk flag.
- **`options.failClosed`.** This is Phase 68's code-near-risk predicate, for example for danger-flagged submit controls.
  - When `options.failClosed === true` (exactly true), any risk failure other than `below_threshold` also contributes `'confirm'`. That covers a fallback, a timeout, `uncalibrated`, `snapshot_changed`, an absent risk and a malformed body.
  - A calibrated "not risky" answer (`below_threshold`) never adds a confirmation.
- Without `failClosed`, a Jev failure contributes nothing (D-30).

### `FsbJevPolicy.toBeforeToolResult(merged)`

- Returns `{shouldStop:false, denied:true, denial:{reason:'jev_requires_confirmation', source:'jev'}}` when `merged.jevContribution === 'confirm'`, and `{shouldStop:false, denied:false}` otherwise.
- `shouldStop` is always false.
- **Phase 68 registers its risk hook AFTER the permission hook.** It expresses tightening only through `denied` and the confirmation card, never by stopping. `HookPipeline.emit` stops at the first stopping result, and the agent-loop BEFORE_TOOL_EXECUTION consumer reads only `denied`. The suite proves the denial survives either order, but registering after the permission hook keeps the permission denial as the first `denied` result the consumer sees.

## Task Commits

1. **Task 1: pure tighten-only policy module with exhaustive cross-product tables**
   - `54aaf077` (test, RED: the suite failed with MODULE_NOT_FOUND)
   - `2516fe37` (feat, GREEN; also fixes two test-side coercion bugs found on the first green run)
2. **Task 2: real-export invariance and the real HookPipeline ordering proof**
   - `4f68f31a` (test)

No refactor commits were needed.

## Files Created/Modified

- `extension/ai/jev-policy.js`: the FsbJevPolicy module (422 lines, mostly JSDoc).
- `tests/jev-policy-tighten-only.test.js`: sections A to F, 29,647 checks. Bulk table checks print only their failures; the run prints 151 lines including the combination count and the control case.

## Decisions Made

- **Fixtures come from the real server producer.** Calibrated, uncalibrated and snapshot_changed results are built with `showcase/server/src/jev/calibration.js` `applyCalibration`. The calibrated cases use a test-only profile that is never written under `profiles/`, and the uncalibrated cases use the shipped `UNCALIBRATED_PROFILE`. Hand-forged results are used only for version skew and hostile bodies, for example `snapshot_changed` with `meetsThreshold: true`.
- **Shipped-profile sweep.** The suite runs `accept` over every profile `loadProfiles()` returns, so after V3 commits a calibrated profile, rerunning this suite (M-67-09) checks it with no edit.
- **The stuck, breaker and permission rows are real outputs, not literals.** If `detectStuck`, `checkSafetyBreakers` or `createPermissionHook` ever changes shape, the suite fails at the row-shape checks before the tables run.
- **Own-property lookup for `decisions[kind]`.** A risk decision reachable only through the prototype chain is `kind_absent`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, test only] Two coercion bugs in the totality checks**
- **Found during:** Task 1, the first GREEN run.
- **Issue:** The `combineGates` totality loop called `Array.isArray` on a revoked proxy, which throws in the test itself. The `toBeforeToolResult` expectation used `input && ...`, which gives `0` or `''` instead of `false` for falsy inputs.
- **Fix:** The loop now checks for a proxy before calling `Array.isArray`, and the expectation is wrapped in `Boolean(...)`. The module was correct in both cases.
- **Files modified:** `tests/jev-policy-tighten-only.test.js`
- **Commit:** `2516fe37`

**2. [Minor, explicit] Task 2 has no RED commit**
- Task 2 is `tdd="true"`, but its subjects are existing code that must not be modified (`agent-loop.js`, `hook-pipeline.js`, `hooks/*`) and the already-GREEN `toBeforeToolResult`. Its checks therefore pass on first run by design.
- Instead, the sections were mutation-checked against out-of-tree copies loaded through the require cache, with no repository file touched:
  - an `agent-loop.js` whose breaker honours `session.jevApproved` fails the iteration-cap scenario;
  - an `agent-loop.js` whose stuck detector honours `agentState.jevOverride` fails 4 checks;
  - a `toBeforeToolResult` that stops fails 4,608 checks.
- The control case shows the pipeline hazard is real.

### Scope additions (no behaviour change)

- The suite covers more than the plan's minimums: 49 gate states (minimum 17), 75 outcomes (minimum 40), 7 invariance scenarios (minimum 6) and five option forms for failClosed=false. It also adds the read-tracing Proxy check, the shipped-profile sweep, the allowing-permission pipeline cases and a second control (a stopping handler registered after the permission hook leaves the denial in place).

## Issues Encountered

- **Mutation checks.** Eight planted policy regressions were tried, each in an out-of-tree copy, and every one turned the suite red:
  - hostile `approved:true` lowering the level: 1,019 failures;
  - consent `ask` treated as proceed: 904;
  - a stopping hook result: 4,608;
  - `uncalibrated` accepted: 762;
  - failClosed firing on `below_threshold`: 295;
  - `catch_all` accepted: 3;
  - malformed stuck input treated as proceed: 905;
  - `accept` reading `decision.status`: 2.

  The two agent-loop mutations above make 10 in total. No repository file was changed for these checks; the harness lives in /tmp.

## Verification

- `node tests/jev-policy-tighten-only.test.js`: 29,647 passed, 0 failed. It prints `Cross product: 49 existing-gate states x 75 Jev outcomes x 2 failClosed values = 7350 combinations checked` and the CONTROL line. The result is the same on Node 24.14.1 and on the official Node 20.20.2 binary.
- `node --check extension/ai/jev-policy.js` passes.
- `grep -nE "shouldStop: *true|shouldStop *= *true" extension/ai/jev-policy.js` prints nothing.
- `grep -nE "^(const|let|class) |chrome\.|fetch\(|setTimeout|importScripts" extension/ai/jev-policy.js` prints nothing, and so do `systemone` and `chrome.storage`.
- `node tests/stuck-action-repetition.test.js`: 16 passed. `node tests/hook-pipeline.test.js`: 48 passed.
- `git diff --quiet -- extension/ai/agent-loop.js extension/ai/hook-pipeline.js extension/ai/hooks` exits 0. These files, plus `tool-executor.js`, `capability-router.js` and `background.js`, are unchanged since baseline 8a058bdf.
- **Neighbouring suites.** `tests/no-dead-entry.test.js` (16), `tests/lattice-provider-bridge-smoke.test.js` (112), `tests/delegation-phase-contract.test.js` (1224) and `tests/phase65-full-tests-harness.test.js` all pass.
- **Full tolerant sweep.** `node /tmp/fsb-tolerant-runner.mjs /tmp/fsb-67-07-full` ran 334 pretest and test commands with 0 failing. This run also passed `node tests/mcp-install-platforms.test.js`, which fails at baseline only while the native-host daemon holds ports 7225 and 7226. The sweep rewrote the crawler files `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`, and they were restored with `git checkout --`. The new suite is not in the chain yet; 67-13 registers it.

## Known Stubs

None. Nothing in the extension calls FsbJevPolicy yet, which is intentional (D-17). Phase 68 wires `accept`, `mergeConfirmation` and `toBeforeToolResult` into its decision site and risk hook.

## Threat Model Coverage

- **T-67-08 (elevation of privilege).** Jev's contribution is typed `'none'` or `'confirm'`, the merge is `max()`, the exhaustive tables run, and `accept` reads only the calibrated threshold fields.
- **T-67-08b (the hook seam).** `toBeforeToolResult` never stops. The real HookPipeline is tested in both orders, and the control case documents the hazard.
- **T-67-06 (hostile fields).** `authorize`, `skipConfirmation`, `approved`, 'human approved', downgrade fields, a decision-level `status` and an inherited `risk` are never read. Twin merges are identical, and the read trace confirms it.
- **T-67-09 (uncalibrated and snapshot_changed).** Both need `calibrated` and a numeric threshold. The forged `meetsThreshold:true` variants are rejected.

No new network endpoint, auth path, file access or schema surface was added.

## Deferred to Validation Block

Deferred: M-67-09 (V3), M-67-10 (V4).
- **M-67-09 (V3).** After V3 commits a calibrated profile for the deployed pin, rerun `node tests/jev-policy-tighten-only.test.js`. Its shipped-profile sweep picks the new profile up automatically.
- **M-67-10 (V4).** Fast mode stays default-off, and no Jev decision acts for users, until the V4 comparative gate passes.

JEV-06 itself is fully proven in this phase; there is no Validation Block item for it. Nothing in this plan needs a human, a live account, production or spend.

## User Setup Required

None.

## Next Phase Readiness

- **67-11** can load `ai/jev-policy.js` inert (state, client, policy order). It adds exactly one global, `FsbJevPolicy`, and contains no `importScripts` token.
- **67-12** can `require('../extension/ai/jev-policy.js')` (or use `createRequire`) to apply `accept` to harness decisions.
- **67-13** must register `node tests/jev-policy-tighten-only.test.js`.
- **Phase 68** consumes the API above. Register the risk hook after the permission hook, pass `{failClosed:true}` only for code-flagged near-risk steps, and keep its own freshness and eligibility checks on top of `accept`.

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Both created files and this SUMMARY exist.
- All three task commits (54aaf077, 2516fe37, 4f68f31a) are in history, and none carries an attribution line.
- No commit deletes a file.
- No TODO, FIXME or placeholder marker is in the module.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were left to the orchestrator.
