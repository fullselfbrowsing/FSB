---
phase: 68-autopilot-fast-mode
verified: 2026-10-17T13:39:16Z
status: human_needed
score: 10/10 must-haves verified (5/5 roadmap success criteria)
head: 38312ca1
p68_start: ba745cfe
overrides_applied: 0
human_verification:
  - test: "M-68-06 (V5): open the real Advanced Settings panel (unpacked build, Profile 2 or 5), find the 'Jev fast mode (experimental)' card after Action Change Reports, check it is unchecked by default and the copy reads correctly; write fsbJevFastModeEnabled through the MCP settings tool while the panel is open, then press Save"
    expected: "The checkbox refreshes in place to the MCP-written value and Save does not revert it"
    why_human: "Real panel rendering and live MCP-to-panel sync need a running browser"
  - test: "M-68-07 (V5): turn the switch on and run a real autopilot task with the gateway disabled or uncalibrated"
    expected: "At most one menu request and one Jev call in the session, nothing is fast-acted, and the run otherwise matches a switch-off run"
    why_human: "Live gateway behaviour and a real session cannot be exercised offline"
  - test: "M-68-08 (V5): with a calibrated profile, fast-step on a re-rendering real site in a visible foreground tab; also replay a session that took fast steps (WR-05), switch tabs mid-command (IN-04), and read the hand-off text after an uncertain step (WR-03)"
    expected: "Stale targets are refused and escalate; hand-off summaries are truthful; runaway pages stop through the breakers; shadow-DOM selectors resolve uniquely; a fast step replays through its recorded selector; go_back is not offered right after a tab switch"
    why_human: "Real-page freshness, real isElementActionable, real replay and real summaries need a live browser"
  - test: "M-68-03 / M-68-04 (V3): run recorded-llm capture campaigns (export-capture.mjs --arm on, then --since cursor, then --arm off), calibrate on the V2 pin, and confirm the CR-01 structural allowlist (only same-origin links, tabs, closed summaries, aria-expanded=false disclosures and paging/reveal-named buttons are fast-eligible; ARIA toggles get no ops) is the intended eligibility trade-off before freezing MENU_CAP 48, MENU_POOL 256, ordering and excerpt length"
    expected: "Capture drop counts by reason are plausible (note IN-03: a session's last held capture is neither labelled nor counted), the calibrated profile acts on bench fixtures, and the owner accepts the eligibility allowlist as part of the instrument"
    why_human: "Calibration, real captures and the eligibility trade-off are owner/live decisions"
  - test: "M-68-05 (V4): comparative gate through run_task after Phase 70 (baseline, non-Jev control, fast-mode arm)"
    expected: "Completion, wall time and cost compared truthfully; jevMeasurement supplies Jev cost/latency; capture arm key unset in every arm"
    why_human: "Live benchmark with real spend"
  - test: "M-68-09 (V5): human review of the translated privacy text (de, es, ja, ko, zh-CN, zh-TW), legal meaning included"
    expected: "Each locale says the same as the English fast-mode section, including 'one step description' and the Limited Use sentence"
    why_human: "Translation quality and legal meaning need a human reader"
  - test: "M-68-10 / M-68-11 (V6): the deployed privacy page and the Chrome Web Store privacy-practices form, certifications and listing text; and owner confirmation of the WR-04 tightening (any decide() fallback latches the session until a calibrated answer has been seen, which deliberately narrows CONTEXT D-16's 'transient fallbacks escalate one iteration' so the 'one step description' disclosure is true)"
    expected: "Deployed page and CWS wording match SHARED_PHRASES; route sentence matches V2's deployed route; D-16 decision record updated to the shipped behaviour"
    why_human: "Production deploy, store dashboard and an owner decision record"
  - test: "M-68-12 (V6): MCP-enable consent review (review IN-05): an MCP client can turn fsbJevFastModeEnabled on without seeing the card"
    expected: "Owner decides whether the key stays cls 'writable' over MCP or gains a confirmation"
    why_human: "Product and consent decision"
  - test: "M-68-13 (V6): release on CI's Node 20 and no push before V6"
    expected: "New suites green in CI; nothing pushed to origin before V6"
    why_human: "Release and CI run"
---

# Phase 68: Autopilot Fast Mode Verification Report

**Phase Goal:** Add opt-in, bounded Jev decisions for simple autopilot steps while the LLM handles planning, text, reading, and uncertain work.
**Verified:** 2026-10-17T13:39:16Z (HEAD `38312ca1`, P68_START `ba745cfe`)
**Status:** human_needed
**Re-verification:** No. This is the initial verification. It runs after the 12 review-fix commits that landed after the 68-11 gate, so every gate claim was re-run against the current HEAD.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **SC1 / AUTO-01: the switch.** It can be set in Advanced Settings or through the 66.1 settings tool, and both change one stored value. It is off by default. The card explains the FSB-to-Jev transfer. With it off, autopilot runs the existing path. | ✓ VERIFIED | **One key.** `config.js:436` defines `fsbJevFastModeEnabled` as `writable`, default `false`. The default is duplicated in `config.js:47`, `init-config.js:32` and `options.js:47`. `options.js` wires it in cacheElements :331, the listener :1015, load :2064 with `?? false`, save :2401 and the `FIELD_REFRESHERS` entry :9752. **Panel card.** `control_panel.html:636-665` has an unchecked checkbox `id="fsbJevFastModeEnabled"`. The copy names FSB's server, TypeSafe AI and OpenRouter, and lists what is sent and what is never sent. **Settings tool.** `mcp-settings-route.test.js:855-867` reads the key as false and writes `{fsbJevFastModeEnabled:true}`, with no `mcp/` diff. **Off path.** `background.js:4010` `fsbFastModeSessionField` returns null unless the stored value is `true`. The session spread at :14226 then adds nothing. Every loop seam is gated on `session.fastMode`. The `jev-fast-loop` golden was committed in `d8bac390`, before the loop edit in `813b659c`, and was never modified afterwards; the test still matches it. |
| 2 | **SC2 / AUTO-02: Jev picks only from FSB's offer.** Jev chooses among offered operations and current elements; FSB rechecks freshness and executes through its existing machinery. | ✓ VERIFIED | **Decision.** `evaluateDecision` (`jev-fast-path.js:359-404`) uses only `FsbJevPolicy.accept`. The op must be in `offeredOps` and in the entry's code-derived `ops`; `risk` must be null and the entry fast-eligible. **Call.** `buildStaticCall` (:423-450) uses only code-held values. **Freshness.** `messaging.js:1043-1058` runs the jev branch before ref resolution and returns on every failure. `resolveJevHandle` (`dom-analysis.js:4693-4729`) checks generation, handle, connection, role and name. It re-derives ops and risk, checks actionability and the viewport centre, and requires a unique selector. There is no fallback. **Execution.** The fast call goes through the unchanged tool loop: the permission hook at `agent-loop.js:2335`, then `_executeTool`. My spot-check: a calibrated click on "Next" acts, and the call args hold only jevHandle, jevGeneration, expectedRole, expectedName and visual_reason. |
| 3 | **SC3 / AUTO-03: everything else stays with the LLM.** Planning, typed text, extraction, unsupported steps and below-threshold decisions route to the LLM, and the fast path fabricates no arguments. | ✓ VERIFIED | **Never offered.** `NEVER_OFFERED` covers `type_text` and `select_option`. **First turn.** The LLM always takes the first turn of a command (`llmTurnSeen`, :1323). **Fallbacks.** catch-all, below-threshold, threshold_null and malformed answers escalate (spot-check results: `operation_catch_all`, `target_below_threshold`, `op_not_in_element_ops`). **Goal text.** `goal` is `session.task` (:1381). No call carries text, value, selector or ref (spot-check and static test). |
| 4 | **SC4 / AUTO-04: evidence and budgets.** Completion and stuck rest on observable evidence. Action, request and wall-clock budgets stop loops, with a truthful outcome. | ✓ VERIFIED | **Completion and stuck.** Completion is a veto: anything not accepted escalates `completion_unconfirmed`. A stuck flag escalates `jev_stuck`. **Evidence.** `classifyStepEvidence` ignores `hadEffect` (spot-check: `unconfirmed`). `isNoProgress` compares URL and signature, and a repeated no-effect op on one control latches the command. **Budgets.** 12 steps, 16 calls, 20 s and 3 consecutive steps (:41-46). Exhausting one latches the command or declines; it never ends the task. **No terminal call.** No `complete_task`, `partial_task` or `fail_task` appears in the module. **Breakers.** `checkSafetyBreakers` and `detectStuck` are byte-identical to P68_START (hashes below), and the breakers run before the fast seam: `agent-loop.js:1892` comes before :1940. |
| 5 | **SC5 / AUTO-05: escalation.** Ambiguous, changed or failed decisions escalate once or stop as blocked, with no duplicated side effect and no weakened confirmation. | ✓ VERIFIED | **Never dispatches.** `afterStep` (:1604-1689) never dispatches. Uncertain, stale, failed and denied outcomes set `yieldToLlm` once. A missing content response is classed as "uncertain / may have executed". **Exceptions.** An exception after dispatch is recorded from the iteration catch (WR-03, `agent-loop.js:3147-3157`). **Fallbacks.** All 19 fallback reasons are classified, and an unknown reason fails closed to a session latch (spot-check). **Confirmations.** The fast call flows through the same permission hook. `source:'jev'` and `pagePath` are read nowhere else in the loop (grep). The tighten-only suite passes 29650/0. |
| 6 | **68-01: phase-start safety.** It opened with an upstream sync re-check, a sweep baseline and an upstream-interface tripwire. | ✓ VERIFIED | `68-SYNC-RECHECK.md` records `P68_START=ba745cfe`. `68-SWEEP-BASELINE.json` exists. `tests/jev-fast-upstream-contract.test.js` passes 55/0. |
| 7 | **68-02/03: content menu.** The menu is value-free, lives in a separate Jev registry and has a union risk classifier. The LLM's snapshot functions are byte-identical. | ✓ VERIFIED | **Isolation.** `buildJevMenu` resets only `FSB.jevRefMap` (:4586). **No value reads.** `jev-fast-menu` passes 138/0, with no-value cases and the CR-01 probes (English and non-English buttons, a JA consent box, role=switch). **Unchanged.** `buildMarkdownSnapshot` and `formatInlineRef` hash the same at P68_START and HEAD. The phase removed no line from `dom-analysis.js`. |
| 8 | **68-08: capture and exporter.** recorded-llm capture runs only on armed loopback fixtures, and the exporter writes the 67-10 format. | ✓ VERIFIED | **Gate.** `CAPTURE_URL_RE` (:1807) and the arm key. **Background case.** `background.js:12636` forwards exactly 4 keys and requires frameId 0. **Exporter.** It imports `validateRecord` and `checkLockReferences`, and its default output dir is the gitignored `scripts/bench/.local/shadow/recorded-llm`. `jev-fast-capture` passes. |
| 9 | **68-09: measurement.** `jevMeasurement` is persisted and projected only when present, and off-sessions are byte-identical. | ✓ VERIFIED | `jev-fast-measurement` passes 94/0. As an independent check, I ran the golden sections against the pre-68-09 `automation-logger.js` and `mcp-tool-dispatcher.js` (`a780238a`) in a scratch copy. All 8 off-session golden checks pass on the old code, so the goldens really capture pre-edit output. |
| 10 | **68-10/12: disclosure.** The privacy page in six locales and the card share one fact list, and the Limited Use statement is affirmative. | ✓ VERIFIED | **Tests.** `showcase-privacy-page` passes 98/0. **i18n checks I re-ran.** `lint:i18n` exits 0. Drift and quality checks pass for 2458 units x 6 locales. A fresh `ng extract-i18n` diff against `messages.xlf` is empty. **Copy.** The Limited Use body opens with "complies with the Chrome Web Store User Data Policy". |

**Score:** 10/10 truths verified (5/5 roadmap success criteria).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `extension/ai/jev-fast-path.js` | FsbFastPath core and orchestration | ✓ VERIFIED | **Size.** 2133 lines. **Contents.** beforeTurn, afterStep, observeTools, flushHandoff, latchOff, abortInFlight and capture. **Banned tokens.** None present: no chrome., timers, `://`, importScripts, serverUrl, JEV_, estimateCost or costUsd. **Load.** Loaded at `background.js:822`. |
| `extension/ai/agent-loop.js` | Two guarded seams and the jev meta key | ✓ VERIFIED | **Diff.** +76/-1. **Pins.** 8 setTimeout tokens, 4 schedule lines, one LLM_TURN and one TOOL_DISPATCH, unchanged from P68_START. |
| `extension/background.js` | Load line, session field, deps, follow-up recompute, capture case, stop abort | ✓ VERIFIED | **importScripts count.** 337/333 → 338/334, a +1/+1 bump. **Unchanged.** `createSessionHooks` hash is unchanged. |
| `extension/content/dom-analysis.js`, `dom-state.js`, `messaging.js`, `actions.js` | Menu, registry, strict resolver, vault marks, capture observation | ✓ VERIFIED | The jev branch is first in executeAction. `jevSelector` is spread only on jev calls. |
| `extension/config/*`, `extension/ui/options.js`, `control_panel.html` | Switch and card | ✓ VERIFIED | See truth 1. |
| `extension/utils/automation-logger.js`, `extension/ws/mcp-tool-dispatcher.js` | Persistence and projection | ✓ VERIFIED | See truth 9. |
| `extension/utils/lattice-replay.js` | WR-05 backstop | ✓ VERIFIED | Entries with `jevHandle` are marked unsupported. `args` is always an object. |
| `scripts/bench/shadow/export-capture.mjs` | Exporter | ✓ VERIFIED | See truth 8. |
| Privacy page and archive templates, 7 xlf files | Disclosure | ✓ VERIFIED | See truth 10. |
| 8 new suites, 4 fixtures, 3 goldens | Proofs | ✓ VERIFIED | Each suite is registered once in `scripts.test` and in `REFINEMENT_ROOT_TEST_COMMANDS` (`delegation-phase-contract` passes 1246/0). |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| agent-loop `runAgentIteration` | `FsbFastPath.beforeTurn` | guarded by `session.fastMode`, before `buildTurnMessages` | ✓ WIRED |
| agent-loop tool-result push | `afterStep` / `observeTools` | fast branch, or LLM branch only when `session.fastMode` | ✓ WIRED |
| agent-loop catch | `afterStep(session, step, [])` | only when a fast step ran and `afterDone !== true` | ✓ WIRED |
| `handleStartAutomation` / follow-up | `session.fastMode` | `fsbFastModeSessionField` (:14200), `fsbRecomputeFastModeForFollowUp` (:14054) | ✓ WIRED |
| `fsbFastPathDeps.requestMenu` | content `getJevMenu` | `chrome.tabs.sendMessage(frameId 0)` | ✓ WIRED |
| content executeAction | `FSB.resolveJevHandle` | `params.jevHandle !== undefined` branch, before COMPACT REF RESOLUTION | ✓ WIRED |
| `evaluateDecision` | `FsbJevPolicy.accept` | lazy `root.FsbJevPolicy` | ✓ WIRED |
| beforeTurn | `FsbJevClient.decide` | lazily created `createJevClient({})`, `timeoutMs = min(2500, remaining)` | ✓ WIRED |
| content capture | `FsbFastPath.noteCaptureObservation` | `background.js` case `jevCaptureObservation` | ✓ WIRED |
| `sanitizeSessionDetail` | `projectJevMeasurement` | delete-then-project only when present | ✓ WIRED |
| Stop path | `abortInFlight` | `background.js:14684` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| Hand-off message | steps, snapshot | `afterStep` pending steps, `deps.requestSnapshot` → content `getMarkdownSnapshot` | yes | ✓ FLOWING |
| Jev request | elements, url, text | content `buildJevMenu` → `toBuilderInput` → `FsbJevState.buildRequest` | yes (spot-check: query, fragment and password dropped) | ✓ FLOWING |
| `jevMeasurement` | attempts, commands | `attemptFromResult` / `addCommandTotals` → logger clone → dispatcher projection | yes (producer/consumer parity test) | ✓ FLOWING |
| Settings card | checkbox state | `chrome.storage.local` via `loadSettings` / `FIELD_REFRESHERS` | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full chain after the review fixes | `node /tmp/fsb-tolerant-runner.mjs /tmp/v68-verify-full` (7225 held by the user's hub) | 356/356 exit 0, the same command set as the 68-11 gate, 296.9 s | ✓ PASS |
| Phase 68 suites plus paired pin suites on Node 24 and official Node 20.20.2 | `/tmp/v68/run.sh` (20 commands) | all exit 0 on both runtimes | ✓ PASS |
| `validate:extension` | `npm run validate:extension` | exit 0 | ✓ PASS |
| i18n extraction diff | `ng extract-i18n` + `diff -u` | empty | ✓ PASS |
| lint, drift and quality | `npm --prefix showcase/angular run lint:i18n / verify:translation-drift / verify:translation-quality` | all pass | ✓ PASS |
| Decision core, evidence and fallback classes | `node /tmp/v68/spot/spot.cjs` (real jev-state and jev-policy, fake-gateway bodies) | 25/25 PASS | ✓ PASS |
| Byte-identity of protected functions | slice-hash at `ba745cfe` vs HEAD | `createSessionHooks`, `buildSystemPrompt`, `getPublicTools`, `buildMarkdownSnapshot`, `formatInlineRef`, `checkSafetyBreakers`, `detectStuck`, `buildTurnMessages` and `runAgentLoop` are all identical | ✓ PASS |
| Pre-edit off goldens | measurement golden sections run on `a780238a` sources | 8/8 golden checks pass | ✓ PASS |
| Forbidden paths | `git diff --quiet ba745cfe..HEAD -- mcp/ tool-definitions.js ai-integration.js jev-state/client/policy.js scripts/bench/{tasks,lib} showcase/server sidepanel.* scripts/bench/shadow/records` | no changes | ✓ PASS |
| Commit hygiene | attribution grep over `ba745cfe..HEAD` and remote branches containing the first 68 commit | 0 attribution lines, no remote contains it | ✓ PASS |

The crawler files (`llms.txt`, `llms-full.txt` and `sitemap.xml`) were dirtied by my chain run and restored with `git checkout --`. The working tree is back to the two untracked review files.

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared or used by this phase. Step 7c does not apply.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
| --- | --- | --- | --- |
| AUTO-01 | 68-01, 68-06, 68-10, 68-11, 68-12 | ✓ SATISFIED (automated); live UI V5, store and deploy V6 | Truths 1 and 10 |
| AUTO-02 | 68-02 to 68-06, 68-08, 68-11 | ✓ SATISFIED (fake gateway); calibrated live V3/V5 | Truths 2 and 7 |
| AUTO-03 | 68-02, 68-04 to 68-08, 68-11 | ✓ SATISFIED | Truth 3 |
| AUTO-04 | 68-04 to 68-07, 68-09, 68-11 | ✓ SATISFIED; whole-task comparison V4 | Truths 4 and 9 |
| AUTO-05 | 68-03 to 68-07, 68-11 | ✓ SATISFIED; real summaries V5 | Truth 5 |
| JEV-06 re-check (REQUIREMENTS.md asks this verifier) | n/a | ✓ CONFIRMED | **Same gates.** A Jev-accepted step passes the same BEFORE_TOOL_EXECUTION permission hook, breakers and meta-attempt counter; a denial still blocks it (`jev-fast-loop`). **No bypass.** No code path special-cases `source:'jev'`. **Tighten-only.** The suite passes 29650/0. |

No orphaned requirements: REQUIREMENTS.md maps exactly AUTO-01 to AUTO-05 to Phase 68, and every one is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| Phase 68 added lines | n/a | TBD / FIXME / XXX | none found | n/a |
| `extension/background.js` | 14054, 4150-4169 | The follow-up path adds one storage read of the switch even when it is off | ℹ️ Info | A read, not a write. D-01 forbids only added writes and new loop activity. |
| `extension/ai/jev-fast-path.js` | 1313-1315 | `_fastPath` and `agentState.jevFast` are created in memory on run_task sessions when the switch is on (`fastMode.enabled:false`) | ℹ️ Info | Intended by D-22 (capture keys on the URL). No fast step, request or persisted field results. |
| `extension/ai/jev-fast-path.js` | finalizeCapture / beforeTurn | Review IN-03 (skipped): a session's last held capture is neither labelled nor counted as dropped | ℹ️ Info | The ring is diagnostic only. It affects drop counts read in M-68-03 (V3) and is listed there. |
| `extension/config/config.js` | 436 | Review IN-05 (skipped): MCP can turn on the data-sharing switch | ℹ️ Info | Decided in D-04 and disclosed on the privacy page. Owner review is M-68-12 (V6). |

### Human Verification Required

All of these belong to the milestone-end Validation Block (D-02). None is an automated gap.

1. **M-68-06 (V5).** Check the real panel card and copy. Write the switch through MCP while the panel is open, then Save; the value must not revert.
2. **M-68-07 (V5).** Run a real switched-on task against an uncalibrated or disabled gateway. Expect at most one menu and one Jev call, and nothing acts.
3. **M-68-08 (V5).** Check real-page freshness, truthful summaries, breakers, shadow-DOM selector uniqueness and real `isElementActionable`. Also check the review-fix items: replaying a fast-step session (WR-05), go_back after a tab switch (IN-04), and the uncertain hand-off after a post-dispatch exception (WR-03).
4. **M-68-03 / M-68-04 (V3).** Run the capture campaigns and calibration. Confirm the CR-01 structural eligibility allowlist before freezing the instrument, and note IN-03 when reading drop counts.
5. **M-68-05 (V4).** Run the comparative gate after Phase 70.
6. **M-68-09 (V5).** Have a human review the six translated privacy texts.
7. **M-68-10 / M-68-11 (V6).** Check the deployed privacy page and the CWS privacy form and listing. The owner also confirms the WR-04 tightening and updates the D-16 decision record: before a calibrated answer, any fallback now latches the session, so "one step description" holds.
8. **M-68-12 (V6).** Run the MCP-enable consent review (IN-05).
9. **M-68-13 (V6).** Release on CI's Node 20, with nothing pushed before V6.

Also tracked, with no Phase 68 action: M-68-01 (V1, none) and M-68-02 (V2, an operator note that a 404 before the deploy maps to `invalid_request` and latches the session after one call).

### Gaps Summary

There are no automated gaps. Each of the five roadmap success criteria is implemented, wired, and proven through the real `runAgentIteration` with a fake gateway and a test-only calibrated answer. The 12 review fixes landed after the 68-11 gate, so I re-ran the evidence instead of trusting that gate:
- the full chain passed 356/356;
- the Node 20 suites, `validate:extension` and the i18n extraction diff all passed;
- the off-path goldens are proven to be pre-edit output;
- the protected functions are byte-identical;
- nothing touched a forbidden path.

What remains is live, production, human-review and owner-decision work, all deferred to V1-V6 by D-02. That includes three owner confirmations raised by the review fixes: the CR-01 eligibility trade-off (V3), the WR-04 tightening of D-16 (V6), and IN-05 MCP enablement (V6).

---

_Verified: 2026-10-17T13:39:16Z_
_Verifier: Claude (gsd-verifier)_
