---
phase: 70-bounded-mcp-fast-task
verified: 2026-10-19T00:36:38Z
status: human_needed
score: 12/12 must-haves verified (automated portion; live, human, production and spend checks deferred to V2-V6)
overrides_applied: 0
re_verification: null
gaps: []
human_verification:
  - test: "M-70-02 (V2): after the gateway deploy, with the operator `disabled` switch set, run one switched-on `run_task` (and a `spend_cap_reached` case if it can be provoked)"
    expected: "`fast_mode.jev.latched` is 'disabled' (or 'spend_cap_reached'). The outcome comes from task state, and the task finishes on the in-extension LLM"
    why_human: "Production deploy and the operator switch. Offline proof covers all 19 fallback reasons with the fake gateway only"
  - test: "M-70-03 (V3): run with a calibrated profile and make the `run_task` fast path act on the bench fixtures. Revisit the run_task profile numbers (12 / 16 / 20,000 ms / 3 / 3)"
    expected: "`fast_mode.jev.fast_steps > 0` and calibration 'calibrated'. Profile numbers confirmed or retuned with the autopilot profile"
    why_human: "Live model, real spend and owner decisions. The shipped UNCALIBRATED profile never acts"
  - test: "M-70-04 (V4): comparative gate through `run_task`, with the typed-outcome agreement table built from raw `runTask.fastMode` records"
    expected: "No `done` on a run the checker failed (false done is a gate input). Report the sensitive_goal count (about 0), the uncalibrated overhead, budget exhaustion, runs over 60 s, and the false-ambiguous rates. Those rates cover the PD-70-01 narrowing, `dispatch_unconfirmed` read-only failures (review WR-01, skipped) and the retried-iteration residual. Read stopped-run `jev.attempts/calls/jev_ms` as possibly off by one (review IN-04)"
    why_human: "Comparative live runs. The agreement rate cannot be measured offline"
  - test: "Owner decision on review WR-01 (record at V4 with M-70-04): should a failed read-only call with a null nested result (for example a failed get_page_snapshot or search_memory) stop counting as unresolved uncertainty?"
    expected: "The owner keeps Drift substitution 3 (conservative: such runs report ambiguous/uncertain_action) or accepts the loosening. Loosening is a one-line readOnly guard in afterTool plus flipping the pinned test"
    why_human: "The fix would loosen a recorded tighten-only decision (70-SYNC-RECHECK Drift substitution 3), so it needs an owner decision"
  - test: "M-70-05 (V5): real Claude Code CLI `run_task` with the switch on and the gateway uncalibrated or disabled, then Codex and Cursor parse the same result"
    expected: "At most one Jev attempt, nothing acts, and `fast_mode` is present with an outcome from the four values. No host errors on the extra key"
    why_human: "Needs real MCP hosts. The in-process SDK caller is the offline proxy"
  - test: "M-70-06 (V5): real-page cases (manual approval, stop_task mid-run, foreground and background tab, uncertain target on a re-rendering site). The owner also confirms the PD-70-01 observation-set amendment"
    expected: "needs_confirmation, then blocked or ambiguous, then no false done on background-tab input loss, then one escalation and no duplicate side effect. PD-70-01 confirmed or widened"
    why_human: "Real pages and human judgement"
  - test: "M-70-07 (V6): release check, plus the owner confirms the D-17 amendment (the switch-on `fast_mode` key under MCP-04)"
    expected: "CI on Node 20 green. Nothing pushed before V4's gate. D-17 amendment confirmed in the V6 checklist"
    why_human: "Release, publish and merge. Owner sign-off"
  - test: "M-70-08 (V6): MCP-enable consent review (Chrome Web Store disclosure and consent language, D-07 options a-d)"
    expected: "The owner picks a remedy before any release in which an MCP-started `run_task` can send page context. This blocks release of MCP-started transfers"
    why_human: "Policy judgement. Every remedy amends a requirement"
  - test: "M-70-09 (V6): read the deployed Advanced Settings card and privacy page in each locale"
    expected: "'FSB's autopilot' reads as covering MCP-started `run_task` tasks. The normaliser sentence-removal case reads truthfully"
    why_human: "Needs a human reader"
---

# Phase 70: Bounded MCP Fast Task Verification Report

**Phase Goal:** Let the existing `run_task` use the bounded Jev fast loop when the extension's Advanced Settings switch is enabled.
**Requirement:** MCP-03
**Verified:** 2026-10-19T00:36:38Z at HEAD `9ec5093f` (after the four review-fix commits). P70_START is `3f7efb0a`.
**Status:** human_needed. Every automated must-have holds, no gaps remain, and only Validation Block items (V2-V6) and one owner decision remain.
**Re-verification:** No. This is the initial verification.

## Goal Achievement

### Observable Truths

**Roadmap success criteria (the contract)**

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **SC1.** Existing `run_task` reads the Advanced Settings switch and uses a bounded action, Jev-call and wall-clock budget only when it is on. There is no separate argument or toggle. | ✓ VERIFIED | **Switch read.** `background.js:14214-14248` reads `fsbJevFastModeEnabled` in the existing per-start settings read. `fsbFastModeSessionField(true,'mcp')` returns `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}`. A false, absent or non-boolean value returns `null`, so the session gets no field (`:4015-4023`). `mcp-tool-dispatcher.js:3398` sends `source:'mcp'`.<br>**Budgets.** The frozen `BUDGET_PROFILES.run_task` (`jev-fast-path.js:82-99`) is read only through `budgetsFor(session)` (`:1462`, `:1758`). Each budget is hit in tests and switches the task to LLM-only without ending it. The decide timeout is `min(2500, remaining)`.<br>**No new argument or toggle.** `mcp/src/tools/autopilot.ts:36` still takes `{task}` only. `git diff 3f7efb0a HEAD -- mcp/` is empty, and the diff adds no new storage key. |
| 2 | **SC2.** The MCP result tells done, ambiguous, blocked and needs-confirmation apart using verified effects and task state, not Jev's answer alone. | ✓ VERIFIED (automated). Agreement with real outcomes is V4. | **Classifier.** `classifyRunTaskOutcome` (`jev-fast-path.js:2626-2649`) applies the D-13 precedence over the terminal message and `session._fastRunEvidence`. `done` needs an explicit success terminal and an evidence record with nothing unresolved. A static slice check bans `decisions`, `meetsThreshold`, `probabilities` and `.threshold`.<br>**Real-loop cases.** An uncertain fast or LLM step that nothing observed before `complete_task` gives `ambiguous`. A handed-off step or a later page read gives `done`. `manual_approval` gives `needs_confirmation`, and an auth wall gives `blocked`.<br>**My spot-check** against the real module covers 18 scenarios, and all match D-13.<br>**CR-01 fix.** A bfCache `read_page`, an errored `get_dom_snapshot` or a `wait_for_stable` timeout no longer clears uncertainty. |
| 3 | **SC3.** Provider failures, uncertain targets and safety gates exit through typed fallback or escalation, with no duplicate side effects. | ✓ VERIFIED (offline). Live cases are V2 and V5. | Run with `jev-fast-path.test.js`.<br>**Fallback parity.** "run_task fallback parity" covers all 19 contract fallback reasons. Each gives the same session, command or iteration latch as autopilot and escalates to the LLM.<br>**Uncalibrated gateway.** It costs one decide, then the session latches.<br>**Switch turned off mid-run.** The session latches `switch_off`.<br>Run with `jev-fast-loop.test.js`.<br>**No second dispatch.** An unknown outcome, `mayHaveExecuted` or `bfCacheDetected` produces exactly one `executeAction`.<br>**Risk-excluded controls.** These are never fast-acted.<br>**Permission denial.** It still blocks.<br>**Tighten-only suite.** `jev-policy-tighten-only` passes 29650/0.<br>**Reporting.** Fallbacks only feed the `escalations` and `latched` fields (D-16). |
| 4 | **SC4.** Existing MCP clients still parse responses and call tools with no new required argument or tool. | ✓ VERIFIED (in-process). Real hosts are V5. | **In-process caller.** `mcp-run-task-fast-caller.test.mjs` (12/12) runs a real SDK Client over InMemoryTransport against the fresh `mcp/build`. The switch-off text is byte-identical to the pre-edit golden on all 5 settle paths. The switch-on result parses with `fast_mode` intact and no `isError`. `tools/list` is unchanged.<br>**Other suites.** The shape freeze passes 124/0, and `mcp-tool-smoke` passes 307/0, including the `mcp:start-automation` payload pin. |

**Plan must-haves (merged; they add detail and remove no roadmap criterion)**

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 5 | 70-01: the start point, sync re-check, upstream tripwire, switch-off golden captured before any edit, and sweep baseline | ✓ VERIFIED | **Sync re-check.** `70-SYNC-RECHECK.md` line 1 is `P70_START=3f7efb0a…`. Its items a-u include Drift substitutions (t) and For Phase 71 (u).<br>**Golden.** It was committed in `c20081f5`, before the bridge edit `47d02d78`, and never modified after.<br>**Tripwire.** It passes 87/0.<br>**Sweep baseline.** `failures: []`. |
| 6 | 70-02: gate widening, the frozen `run_task` profile, `budgetsFor` fallback, and the inverted 68 tests | ✓ VERIFIED | **Start-path tests.** `jev-fast-start-path` passes 194/0. It includes `(true,"mcp")` returning the run_task field, with the keys in order, and non-MCP starts unchanged with no `budgetProfile`.<br>**Loop tests.** `jev-fast-loop` passes 490/0. It includes "run_task takes an accepted fast step: the real helper field … through the real tool loop", and that run equals the autopilot run event for event.<br>**Enforcement test.** "budgetsFor drives enforcement" uses a patched copy with maxSteps 2 to prove the selected profile is the one enforced. |
| 7 | 70-03: run evidence for every executed call, including the same-turn calls before a terminal tool | ✓ VERIFIED | **Registration.** `fsbRegisterFastRunEvidence` (`background.js:4193-4217`) is called once, guarded, at `:14515`, before `runAgentLoop`. `createSessionHooks` and `agent-loop.js` are unchanged, and their hashes match.<br>**Observation set.** Only the 9 page-reading read-only tools or a delivered hand-off count (PD-70-01), and only when `pageWasRead` holds (CR-01).<br>**Memory only.** The record is never persisted and holds no URL. The consent key is an FNV-1a digest.<br>**Gates.** Each gate gets its own entry (WR-02 fix). |
| 8 | 70-04: the goal normaliser and the disclosure re-verify | ✓ VERIFIED | **Normaliser.** `normaliseGoal` (`jev-fast-path.js:413-434`) always returns a suffix of the task, is wired at step o (`:1528`) before `buildRequest`, and contains no `https://` literal.<br>**Disclosure.** `jev-run-task-disclosure` passes 51/0, and no copy was edited. |
| 9 | 70-05: classifier, summary and block. Closed vocabularies, frozen key lists, no throw, no page content. | ✓ VERIFIED | **Outcome tests.** `jev-run-task-outcome` passes 793/0. It covers the full D-13 table, reasons derived from the 13 `createTerminalOutcome` call sites, the static slice ban, the marker scan, and the never-throws cases (revoked proxy, cyclic session). |
| 10 | 70-06: the bridge appends `fast_mode` last on every switch-on settle path. The switch-off path is byte-identical, a failure stays isolated, and the block reaches `final_result`. | ✓ VERIFIED | **Wire tests.** `run-task-fast-mode-wire` passes 77/0 against the real `mcp-bridge-client.js` in a vm. That covers 25/25 switch-off golden runs, additive plus wire bytes plus store on 5/5 paths, isolation on 4×5 paths, release at settle, and outcome checks at the wire.<br>**Older suites.** The pre-existing `mcp-bridge-client-lifecycle` (335/0), `run-task-resolve-discipline` (26/0) and `run-task-heartbeat` (17/0) suites pass and were not edited. |
| 11 | 70-07: the in-process caller and the additive bench record, with producer/validator parity | ✓ VERIFIED | **Bench record.** `run-bench.mjs:580` adds `runTask.fastMode` only for a plain-object block. `bench-fast-mode-record` passes 8/8, including "parity" against the extension's `FAST_MODE_*` exports and "committed row unchanged". |
| 12 | 70-08: gate. Full chain, Node 20, footprint, registration and VALIDATION. | ✓ VERIFIED | **Gate.** At `1a5d7ff7` the tolerant chain ran 362/362 at exit 0.<br>**Re-run after the review fixes (this verification).** The 16 Phase 70 and related suites pass on Node 24 and on the official Node 20.20.2. The regression sweep over the 4 edited files passes 116/116 with no new failures against the baseline. `npm run validate:extension` exits 0.<br>**Registration.** The 6 Phase 70 commands each appear exactly once in `scripts.test` and once in `REFINEMENT_ROOT_TEST_COMMANDS`.<br>**Footprint.** No diff touches `mcp/`, `agent-loop.js`, `tool-definitions.js`, `ai-integration.js`, `extension/ui`, `extension/content`, `showcase` or `scripts/bench/{tasks,lib/runs.mjs}`. There are 0 `importScripts` changes. |

**Score:** 12/12 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `extension/ai/jev-fast-path.js` | `BUDGET_PROFILES`, `budgetsFor`, `normaliseGoal`, `createRunEvidenceHandlers`, `classifyRunTaskOutcome`, `summarizeFastMode`, `buildFastModeBlock`, `FAST_MODE_*` | ✓ VERIFIED | All are exported (`:2786-2824`), substantive, and called from beforeTurn, the bridge and background. |
| `extension/background.js` | MCP branch of `fsbFastModeSessionField`; `fsbRegisterFastRunEvidence` and its one call | ✓ VERIFIED | `:4015-4023`, `:4193-4217`, `:14515` |
| `extension/ws/mcp-bridge-client.js` | Session captured at start; `fast_mode` built at settle | ✓ VERIFIED | `:2673-2682`, `:2775-2806`. `final_result: finalValue` and `resolve(finalValue)` use the same value. |
| `scripts/bench/lib/fast-mode.mjs`, `scripts/bench/run-bench.mjs` | Bench projection and additive record | ✓ VERIFIED | Imported and used at `run-bench.mjs:64,580`. |
| `tests/fixtures/run-task-wire-golden.json` | Switch-off golden from the unedited bridge | ✓ VERIFIED | Captured at `c20081f5`, before any bridge edit. |
| New suites (6) plus the extended 68 suites | Registered and green | ✓ VERIFIED | See truths 5-12. |
| `70-SYNC-RECHECK.md`, `70-SWEEP-BASELINE.json`, `70-VALIDATION.md` | Gate documents | ✓ VERIFIED | `nyquist_compliant: true`. The Manual-Only items M-70-01 to M-70-09 carry V tags and none is marked done. |

### Key Link Verification

`gsd-sdk query verify.key-links` reports "Source file not found" for links whose `from` names a function rather than a path, so every link below was checked by hand.

| From | To | Via | Status |
| --- | --- | --- | --- |
| `handleStartAutomation` settings read | `fsbFastModeSessionField(stored, source)` and the `fastMode` spread | `background.js:14248`, `:14274` | ✓ WIRED |
| `fsbFastModeSessionField` | `budgetsFor` | `fastMode.budgetProfile === 'run_task'` → `budgetProfileName` (`:1245-1254`) | ✓ WIRED |
| beforeTurn and afterStep budget reads | `BUDGET_PROFILES` | `budgetsFor(session)` at `:1462` and `:1758`. A static test pins that there is no direct read. | ✓ WIRED |
| `handleStartAutomation` | `FsbFastPath.createRunEvidenceHandlers` | `if (sessionData.fastMode) fsbRegisterFastRunEvidence(sessionHooks, …)` at `:14515` | ✓ WIRED |
| beforeTurn act (step u) | `_fastRunEvidence.fastIteration` | `noteFastIteration` at `:1630` | ✓ WIRED |
| Hand-off flush | `lastObservationSeq` | `noteHandoffObservation` at `:1337`, only on success with a snapshot | ✓ WIRED |
| beforeTurn step o | `normaliseGoal(session.task, [menu.url, session._fastRunStartPage])` | `:1528`, before `buildRequest` | ✓ WIRED |
| `_handleStartAutomation` | `activeSessions.get(sessionId)` | One guarded read, kept only when the session has `fastMode` | ✓ WIRED |
| bridge `settle` | `FsbFastPath.buildFastModeBlock` | try/catch and JSON round trip, appended last, falls back to `classifier_error` | ✓ WIRED |
| bridge result | MCP caller | `_sendResult(id, { success: true, ...result })` → `mapFSBError` stringifies the success result whole. Proven by the in-process SDK caller. | ✓ WIRED |
| `FAST_MODE_BLOCK_KEYS` | bench mirror and wire test | Parity test through `createRequire` | ✓ WIRED |
| `package.json scripts.test` | `REFINEMENT_ROOT_TEST_COMMANDS` | Each of the 6 commands appears exactly once in each list | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces real data | Status |
| --- | --- | --- | --- | --- |
| `fast_mode` block on the run_task result | Outcome and flags | `session._fastRunEvidence`, written by 3 hook handlers on the real session pipeline, plus the terminal lifecycle message | Yes. Real-loop e2e cases give done, ambiguous, needs_confirmation and blocked from executed calls | ✓ FLOWING |
| `fast_mode.jev` summary | Counts, latches, escalations | `jevMeasurement` (68), `_fastPath`, `agentState.jevFast` | Yes. The "e2e uncalibrated tally" and step-budget tally cases | ✓ FLOWING |
| `runTask.fastMode` bench record | Projected block | `json.fast_mode` from the run_task result | Yes. "raw record carries runTask.fastMode through the run executor" | ✓ FLOWING |

### Behavioral Spot-Checks (run by this verifier)

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 70 and related suites, Node 24 | `/tmp/p70-verify-run.sh node` (16 suites) | All exit 0 | ✓ PASS |
| Same suites on the CI runtime | `/tmp/p70-verify-run.sh` with the official Node 20.20.2 | All exit 0 | ✓ PASS |
| D-13 classifier behaviour on the real module | `node /tmp/p70-verify/spot.cjs` | 18 scenarios match D-13. Switch-off fallback, the autopilot default profile and the frozen profiles hold | ✓ PASS |
| CR-01 and WR-02 fixes | `node /tmp/p70-verify/spot2.cjs` | The WR-02 reproduction gives needs_confirmation/payment_not_approved. Consent from another site does not clear the gate, and consent from the same site does. Uncertainty followed by a `wait_for_stable` timeout or an errored `get_dom_snapshot` gives ambiguous. The record holds no URL | ✓ PASS |
| No regression after the review fixes | `sweep-tests.mjs --files <4 edited files> --baseline 70-SWEEP-BASELINE.json` | 116/116, no new failures | ✓ PASS |
| Extension validation | `npm run validate:extension` | Exit 0 | ✓ PASS |
| MCP compatibility | `mcp-tools-list-shape-freeze`, `mcp-tool-smoke` | 124/0 and 307/0 | ✓ PASS |
| Working tree untouched by this verification | `git status --porcelain` before and after | Unchanged: only the two untracked review files | ✓ PASS |

### Probe Execution

Not applicable. Phase 70 declares no `scripts/*/tests/probe-*.sh` probes, and none exist for this phase.

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| MCP-03 | 70-01 to 70-08 (all declare it) | Existing `run_task` honors the Advanced Settings fast-mode switch, applies bounded Jev decisions when it is on, and reports done, ambiguous, blocked or needs-confirmation without claiming success from Jev's answer alone. | ✓ SATISFIED (automated). Live confirmation is V2-V6. | Truths 1-4 and 6-11 |

REQUIREMENTS.md maps only MCP-03 to Phase 70, so no requirement is orphaned. MCP-04 (byte-stable wire) is guarded here but owned by Phase 69. The switch-off path is byte-identical, and the D-17 amendment covering the additive switch-on key waits for owner confirmation at V6 (M-70-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| Phase 70 diff (all files) | — | TBD, FIXME, XXX, TODO, HACK or PLACEHOLDER | — | None found |
| `extension/ai/jev-fast-path.js` | `:2467` | Review WR-01 (skipped). A failed read-only call with a null nested result counts as unresolved uncertainty. | ⚠️ Warning | Errs toward `ambiguous`, never toward a false `done`. Deliberate, per Drift substitution 3. Needs an owner decision, tracked at V4. |
| `extension/background.js` | `:14515` | Review IN-02 (skipped). The boolean from `fsbRegisterFastRunEvidence` is ignored. | ℹ️ Info | A registration failure surfaces as `ambiguous/evidence_unavailable` with `uncertain_unobserved:null`, and the call site is pinned byte-for-byte. |
| `extension/ws/mcp-bridge-client.js` and `jev-fast-path.js` | `:1570` | Review IN-04 (skipped). The `jev` counts of a stopped run depend on microtask order. | ℹ️ Info | Measurement only, and possibly off by one. The orchestrator should add this note to M-70-04 in 70-VALIDATION.md, which does not mention it yet. |
| `tests/jev-fast-capture.test.mjs` | `:6`, `:122`, `:150` | Stale "run_task bench session" wording (deferred-items 70-02 #2) | ℹ️ Info | The suite still tests capture correctly. Only the wording is stale. |
| `deferred-items.md` | — | Items 70-02 #1, 70-03 #1 and 70-04 #1 are still listed as open | ℹ️ Info | They were resolved by `86c5630e` (review IN-01). The orchestrator may close them. |

### Human Verification Required

Every item is deferred to the milestone-end Validation Block under the owner's 2026-10-15 direction. None is an automated gap. M-70-01 (V1) is an explicit "none": with the switch off, the run is pre-milestone `run_task`.

1. **M-70-02 (V2): live fallbacks.** After the deploy, with the operator `disabled` switch set, a switched-on `run_task` shows `fast_mode.jev.latched: 'disabled'` (and `spend_cap_reached` if it can be provoked) with a task-state outcome.
2. **M-70-03 (V3): a calibrated profile acts on `run_task`.** Expect `fast_steps > 0` and `calibration: 'calibrated'`. Revisit the run_task profile numbers.
3. **M-70-04 (V4): comparative gate through `run_task`.** Build the typed-outcome agreement table. A false `done` is a gate input. Report the sensitive_goal count, the overhead, budget exhaustion, runs over 60 s and the false-ambiguous rates. Treat stopped-run Jev counts as possibly off by one (IN-04).
4. **Owner decision (record with M-70-04): review WR-01.** Keep the conservative treatment of failed read-only calls, or accept the loosening, which is a one-line `readOnly` guard plus flipping the pinned test.
5. **M-70-05 (V5): real hosts.** Claude Code CLI with the switch on and the gateway uncalibrated or disabled: at most one attempt and `fast_mode` present. Codex and Cursor parse the same result.
6. **M-70-06 (V5): real pages.** Manual approval, a stop mid-run, a foreground and a background tab, and an uncertain target on a re-rendering page. The owner confirms or widens PD-70-01.
7. **M-70-07 (V6): release.** CI on Node 20. The owner confirms the D-17 amendment (the `fast_mode` key under MCP-04).
8. **M-70-08 (V6): MCP-enable consent review.** This blocks release of MCP-started page-context transfers. The owner chooses among D-07 options a-d.
9. **M-70-09 (V6): human wording check** of the deployed card and privacy page in every locale.

### Gaps Summary

There are no automated gaps. I checked the phase directly against the code rather than the SUMMARY files.
- **Start and gate.** The extension's existing per-start settings read decides whether a `run_task` session carries a fast-mode field. That field selects a frozen `run_task` budget profile, and the Phase 68 loop enforces it unchanged.
- **Evidence and outcome.** Evidence is recorded for every executed call, including calls before a terminal tool in the same turn. A pure classifier maps task state plus that evidence to the four typed outcomes, and it never reads a Jev answer.
- **Result.** The outcome reaches MCP callers as one additive `fast_mode` key, and only when the switch was on at start. With the switch off, the output is byte-identical to the pre-edit golden on every settle path. No MCP package file changed.
- **Review fixes.** The phase gate ran before the four review-fix commits. This verification re-ran the affected suites (Node 24 and Node 20), the 116-test regression sweep and `validate:extension`, and all are green at `9ec5093f`.

What remains needs a live gateway, real MCP hosts, real pages, spend or owner judgement: V2-V6 items M-70-02 to M-70-09, plus the owner decision on review WR-01.

---

_Verified: 2026-10-19T00:36:38Z_
_Verifier: Claude (gsd-verifier)_
