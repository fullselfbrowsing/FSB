---
status: deferred
phase: 68-autopilot-fast-mode
source: [68-VERIFICATION.md]
started: 2026-10-17T13:42:02Z
updated: 2026-10-17T13:42:02Z
deferred_to: milestone-end Validation Block (V3, V4, V5, V6)
verified_head: 38312ca1
baseline_pin: 8a058bdf
---

## Current Test

[deferred: every item runs in the v1.0.0 milestone-end Validation Block; see .planning/STATE.md -> Decisions]

These items come from the `human_verification` list in `68-VERIFICATION.md` (status `human_needed`, 10/10 must-haves verified for the automated portion: 5/5 roadmap success criteria, 0 failed) and the Manual-Only table in `68-VALIDATION.md` (M-68-01..M-68-13). Automated evidence does not count as a result here. That evidence covers the tolerant full chain at `38312ca1` (356/356 exit 0), the Phase 68 suites and paired pin suites on Node 24 and the official Node 20.20.2, `validate:extension`, the empty `ng extract-i18n` diff, the i18n lint, drift and quality checks, the 25/25 fake-gateway decision spot-check, byte-identity of the protected functions against `ba745cfe`, and the pre-edit off-session goldens. Only a human run in the Validation Block may change a `result` field.

Tracked with no Phase 68 action: M-68-01 (V1: none; fast mode is default-off and the baseline runs at `8a058bdf`) and M-68-02 (V2 operator note: before the V2 deploy, a switched-on session gets a 404 that maps to `invalid_request` and latches fast mode off for the session after one call).

## Tests

### 1. [V3] M-68-03: recorded-llm capture campaigns
validation_block: V3
expected: Run bench campaigns with the switch on and the capture arm key set, export with `node scripts/bench/shadow/export-capture.mjs --arm on`, then again with the `--since` cursor (WR-07 dedupe), then `--arm off`, into `scripts/bench/.local/shadow/recorded-llm/`. Drop counts by reason (navigation, missing observation, `target_unknown`, empty menu) are plausible; note review IN-03 (skipped): a session's last held capture is neither labelled nor counted as dropped. Assemble one run directory with the 67-10 hand seeds for `run-shadow --records DIR` and record counts per question and provenance against M-67-08's 60-130+ above-cut target.
result: [pending]

### 2. [V3] M-68-04: calibration on the V2 pin and the CR-01 eligibility decision
validation_block: V3
expected: Calibrate on the V2 pin and confirm a calibrated profile makes the fast path act on the bench fixtures. Before freezing `MENU_CAP` 48, `MENU_POOL` 256, the ordering and the excerpt length, the owner confirms the CR-01 structural allowlist (commit `2788ebfc`) is the intended eligibility trade-off: only same-origin links, tabs, closed summaries, `aria-expanded=false` disclosures and paging/reveal-named buttons are fast-eligible, and ARIA toggles get no ops. Revisit the numeric defaults (12 fast steps, 16 Jev calls, 20 s wall budget, 3 consecutive fast steps, escalation N 3, menu deadline 1.5 s, ring 200), review "not a fit" questions (completion especially) and target accuracy by option-count band, and decide where `recorded-llm` records are committed given 67-10's exactly-25-hand-records assertion.
result: [pending]

### 3. [V4] M-68-05: comparative gate through run_task after Phase 70
validation_block: V4
expected: Baseline (`8a058bdf`) vs non-Jev control vs fast-mode arm on the same corpus with the predeclared gate. Completion, wall time per completed task and cost are compared truthfully; Jev cost and latency come from the session `jevMeasurement` block, not MCP metrics; the capture arm key is unset in every arm. Count bench goals that came back `sensitive_goal` (F5) and `meta_cognitive_loop_break` stops in the fast-mode arm. Fast mode stays default-off and experimental unless the gate passes.
result: [pending]

### 4. [V5] M-68-06: the Advanced Settings card and MCP-to-panel sync
validation_block: V5
expected: In the real Advanced Settings panel (unpacked build on Profile 2 or 5; Default runs the Web Store build), the "Jev fast mode (experimental)" card sits after Action Change Reports, is unchecked by default and its copy reads correctly. Writing `fsbJevFastModeEnabled` through the MCP `settings` tool while the panel is open refreshes the checkbox in place, and pressing Save does not revert it (also closes 66.1-HUMAN-UAT item 4).
result: [pending]

### 5. [V5] M-68-07: switched-on task with the gateway disabled or uncalibrated
validation_block: V5
expected: One real side-panel task with the switch on: at most one menu request and one Jev call in the session, nothing is fast-acted, nothing visible changes, and the step sequence otherwise matches a switch-off run. `jevMeasurement` shows one attempt, escalated and latched.
result: [pending]

### 6. [V5] M-68-08: calibrated fast steps on real pages, plus the review-fix paths
validation_block: V5
expected: With a calibrated profile, fast-step on a re-rendering real site in a visible foreground tab (background tabs drop CDP input while FSB reports success). Stale targets are refused and escalate, never mis-click; a runaway or stuck page stops truthfully through the existing breakers; shadow-DOM selectors resolve uniquely against real `isElementActionable`. Also: replaying a session that took fast steps goes through the recorded selector (WR-05, `c5420cc7`); `go_back` is not offered right after a tab switch (IN-04, `b608f8d3`); the hand-off text after an uncertain step or a post-dispatch exception reads truthfully and the step is not repeated (WR-03, `2ec79015`).
result: [pending]

### 7. [V5] M-68-09: human review of the translated privacy text
validation_block: V5
expected: Fluent reviewers check de, es, ja, ko, zh-CN and zh-TW, legal meaning included. Each locale says the same as the English fast-mode section, including "one step description"; the sent and never-sent lists stay scoped to fast mode's request to FSB's server (no locale says FSB never reads, sees or sends typed text); the Limited Use unit keeps its affirmative compliance sentence. File any mistranslation against its xlf unit id.
result: [pending]

### 8. [V6] M-68-10: the deployed privacy page
validation_block: V6
expected: The live page in each locale carries the fast-mode section, the Limited Use statement, the September 29, 2026 archive entry and the new date, matching `SHARED_PHRASES`; its route sentence matches the route V2 actually deployed (TypeSafe direct or OpenRouter, M-67-02).
result: [pending]

### 9. [V6] M-68-11: Chrome Web Store privacy practices and listing
validation_block: V6
expected: Submit the privacy-practices form, certifications and listing text with the prepared copy in `68-VALIDATION.md` ("Prepared copy for M-68-11"), consistent with the privacy policy; keep a screenshot of the saved privacy tab.
result: [pending]

### 10. [V6] Owner decision: review WR-04, the session latch narrows D-16
validation_block: V6
expected: The fix (commit `73ee0523`) latches fast mode off for the session on any `decide()` fallback until a calibrated answer has been seen, which deliberately narrows CONTEXT D-16's "transient fallbacks escalate one iteration" so the disclosed "one step description" stays true. Either accept it and update the D-16 decision record to the shipped behaviour, or ask for the original transient handling together with a disclosure change.
result: [pending]

### 11. [V6] M-68-12: MCP-enable consent review (review IN-05, skipped)
validation_block: V6
expected: An MCP client can turn `fsbJevFastModeEnabled` on through the `settings` tool (66.1 D-17) without the human seeing the in-panel disclosure; the write is logged (66.1 D-18). The owner decides whether the key stays `writable` over MCP or gains a confirmation step (in Phase 70 or later), and records the decision in the V6 checklist.
result: [pending]

### 12. [V6] M-68-13: release
validation_block: V6
expected: The new Phase 68 suites pass on CI's Node 20. Nothing from Phase 68 reaches `origin/main` or any remote before V6 (a push to `main` triggers `deploy.yml`, `chrome-extension.yml` and `npm-publish.yml`); merging waits for V4's gate and the owner's approval. Record the CI run link.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps

[none yet; verification found no failed truths. Non-blocking follow-ups from the review, skipped in 68-REVIEW-FIX.md: IN-03 (a session's last held capture is neither labelled nor counted as dropped; diagnostic only, read with item 1) and IN-05 (MCP can enable the data-sharing switch; owner decision in item 11). Info: the follow-up path adds one storage read of the switch even when it is off (a read, not a write; D-01 forbids only added writes), and `_fastPath`/`agentState.jevFast` exist in memory on run_task sessions when the switch is on (intended by D-22; no fast step, request or persisted field results).]
