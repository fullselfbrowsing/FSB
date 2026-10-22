---
status: deferred
phase: 70-bounded-mcp-fast-task
source: [70-VERIFICATION.md]
started: 2026-10-19T00:38:38Z
updated: 2026-10-19T00:38:38Z
deferred_to: milestone-end Validation Block (V2, V3, V4, V5, V6)
verified_head: 9ec5093f
baseline_pin: 8a058bdf
---

## Current Test

[deferred: every item runs in the v1.0.0 milestone-end Validation Block; see .planning/STATE.md -> Decisions]

These items come from the `human_verification` list in `70-VERIFICATION.md` (status `human_needed`, 12/12 must-haves verified for the automated portion, 0 gaps). Automated evidence (the tolerant chain at `1a5d7ff7`, 362/362; the 16 Phase 70 and related suites re-run on Node 24 and the official Node 20.20.2 at `9ec5093f` after the four review-fix commits; the 116/116 regression sweep against `70-SWEEP-BASELINE.json`; `npm run validate:extension`; the in-process SDK caller, 12/12) does not count as a result here. Only a human run in the Validation Block may change a `result` field.

M-70-01 (V1) is an explicit "none": with the switch off, Phase 70 is pre-milestone `run_task`, and the V1 baseline runs from the worktree pinned at `8a058bdf`. It is recorded in `70-VALIDATION.md` so V1's collector finds it, and it has no test below.

## Tests

### 1. [V2] M-70-02: live fallbacks after the gateway deploy
validation_block: V2
expected: After the gateway deploy, with the operator `disabled` switch set, one switched-on `run_task` returns `fast_mode.jev.latched === 'disabled'` (and `'spend_cap_reached'` if that case can be provoked). The outcome comes from task state, and the task finishes on the in-extension LLM. Before the deploy, a switched-on `run_task` gets a 404 (`invalid_request`) and latches fast mode off after one call. Procedure: from Claude Code, `settings` with `{"key":"fsbJevFastModeEnabled","value":"true"}`, then `run_task` on a test page, read the `fast_mode` block, then restore the switch with `"false"`. Offline proof covers all 19 fallback reasons with the fake gateway only.
result: [pending]

### 2. [V3] M-70-03: a calibrated profile acts on `run_task`
validation_block: V3
expected: With a calibrated profile, the `run_task` fast path acts on the bench fixtures: `fast_mode.jev.fast_steps > 0` and `calibration: 'calibrated'`. Revisit the `run_task` profile numbers (12 / 16 / 20,000 ms / 3 / 3) together with M-68-04's autopilot numbers; they stay equal unless V3/V4 evidence says otherwise. The shipped UNCALIBRATED profile never acts.
result: [pending]

### 3. [V4] M-70-04: comparative gate through `run_task`
validation_block: V4
expected: Baseline at `8a058bdf`, then the non-Jev control, then fast mode. Build the typed-outcome agreement table from raw `runTask.fastMode` records against the code-verified checker; any `done` on a checker-failed run (false done) is a gate input. Report the `sensitive_goal` count (about 0 after D-22), the uncalibrated per-task overhead (D-11), budget-exhaustion counts, runs over 60 s per arm, and any run where the server's 600 s `sendAndWait` timeout beat the extension safety net (F17). Report the false-`ambiguous` rates from: same-turn navigating click plus `complete_task` (F18 `bfCacheDetected`), the PD-70-01 observation-set narrowing, `dispatch_unconfirmed` read-only failures (review WR-01, skipped) and the retried-iteration residual. Read stopped-run `jev.attempts`, `calls` and `jev_ms` as possibly off by one (review IN-04, skipped: an aborted decide may or may not be counted before the settle-time block is built).
result: [pending]

### 4. [V4] Owner decision: review WR-01, failed read-only calls as unresolved uncertainty
validation_block: V4
expected: Record with M-70-04. A failed read-only call with a null nested result (for example a failed `get_page_snapshot` or `search_memory`) currently counts as unresolved uncertainty, so `[get_page_snapshot fails, complete_task]` reports `ambiguous`/`uncertain_action`. The owner either keeps 70-SYNC-RECHECK Drift substitution 3 (conservative; errs toward `ambiguous`, never a false `done`) or accepts the loosening: a one-line `readOnly` guard on `lastUncertainSeq` in `afterTool` (`extension/ai/jev-fast-path.js`) plus flipping the pinned test "an LLM call with a failed snapshot sets lastUncertainSeq only" in `tests/jev-fast-path.test.js`.
result: [pending]

### 5. [V5] M-70-05: real MCP hosts parse the switched-on result
validation_block: V5
expected: A real Claude Code CLI `run_task` with the switch on and the gateway uncalibrated or disabled: `fast_mode.jev.attempts <= 1`, `fast_steps === 0` (nothing acts), and `fast_mode` is present with an `outcome` from the four values. Codex and Cursor parse the same switched-on result with no host error on the extra key. Disable the switch afterwards. The in-process SDK caller (`tests/mcp-run-task-fast-caller.test.mjs`) is only the offline proxy.
result: [pending]

### 6. [V5] M-70-06: real-page cases and the PD-70-01 confirmation
validation_block: V5
expected: A manual-approval page gives `needs_confirmation`; `stop_task` mid-run gives `blocked` or `ambiguous`; one foreground and one background-tab `run_task` show no false `done` on background-tab input loss (a Jev-chosen step must show an observed effect before `done`); an uncertain target on a re-rendering site escalates once with no duplicate side effect. The acting cases need a calibrated profile. Keep each tool result and the session transcript. The owner, reading these transcripts, confirms the PD-70-01 amendment to D-14 (an observation is a later successful call of one of the 9 page-reading read-only tools, or a delivered hand-off snapshot) or names tools to add; a widening changes only the pinned list in 70-03-01. Record the confirmation in the V5 checklist.
result: [pending]

### 7. [V6] M-70-07: release and the D-17 amendment
validation_block: V6
expected: Phase 70 changes no MCP package file; its extension changes ride the 1.0.0 version. The new suites are green on CI's Node 20. Nothing is pushed to `origin/main` or any remote before V4's gate and owner approval (a push to `main` triggers `deploy.yml`, `chrome-extension.yml` and `npm-publish.yml`). The owner confirms the D-17 amendment recorded in 70-CONTEXT.md (the switch-on `fast_mode` key is an additive result key under MCP-04, present only when the switch was on at start; switch-off results stay byte-identical) in the V6 checklist, plus any MCP-04 wording update to REQUIREMENTS.md.
result: [pending]

### 8. [V6] M-70-08: MCP-enable consent review (release blocker)
validation_block: V6
expected: M-68-12 extended with the Chrome Web Store FAQ language (disclosure and consent "must occur within the Product's user interface" and require "a specific action"); an MCP-client `settings` write is not such an action. Before any release in which an MCP-started `run_task` can send page context, the owner picks one D-07 remedy: (a) `settings` may turn the switch off but not on (amends SET-01 and AUTO-01); (b) a stored write-provenance marker (a second stored value, forbidden by REQUIREMENTS Out of Scope); (c) a one-time side-panel acknowledgement (UI change under the side-panel SHA pins); (d) accept with a written justification. Record the decision in the V6 checklist.
result: [pending]

### 9. [V6] M-70-09: human wording check of the deployed card and privacy page
validation_block: V6
expected: In each locale, the deployed Advanced Settings card and privacy page ("FSB's autopilot") read as covering MCP-started `run_task` tasks (D-23). The card has no MCP or settings-tool sentence (68-12 copy), so the reader confirms the card alone reads as covering MCP-started tasks. Open Question 3: "if your task text itself contains one, nothing is sent for that task" reads truthfully when the secret sat only in a page-matching `Open <url>.` sentence that the normaliser removed.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps

[none yet; verification found no failed truths. Non-blocking follow-ups from the review, skipped in 70-REVIEW-FIX.md: WR-01 (owner decision, test 4 above), IN-02 (the boolean from `fsbRegisterFastRunEvidence` is ignored at `extension/background.js:14515`; a registration failure surfaces as `ambiguous`/`evidence_unavailable` with `uncertain_unobserved:null`, and the call site is pinned byte-for-byte; left for a planned background.js change), IN-04 (stopped-run `jev` counts depend on microtask order; measurement only, noted in test 3). Info: `tests/jev-fast-capture.test.mjs` still has stale "run_task bench session" wording (deferred-items 70-02 #2); deferred-items 70-02 #1, 70-03 #1 and 70-04 #1 were resolved by `86c5630e` (review IN-01).]
