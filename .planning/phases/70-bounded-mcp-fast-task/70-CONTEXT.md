# Phase 70: Bounded MCP Fast Task - Context

**Gathered:** 2026-10-15 (assumptions mode, auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase lets the existing MCP `run_task` use the Phase 68 fast loop when the one Advanced Settings switch (`fsbJevFastModeEnabled`) is on (MCP-03). The phase widens one gate: Phase 68's session flag, which is currently off for every `source: 'mcp'` start. It gives `run_task` its own named budget profile and reports a typed task outcome (`done`, `ambiguous`, `blocked` or `needs_confirmation`). That outcome comes from task state and observed evidence, never from a Jev answer. It is added as one extra key on the existing `run_task` result, and only when the switch was on at start. With the switch off, `run_task` is byte-for-byte what it was before this milestone.

Phases 66.1 and 69 are running in the main tree now. Phase 67 comes next and Phase 68 after it, so none of their code is in this worktree (`e1e6439c`). Every upstream interface is quoted from its PLAN with a line number. Phase 70's first plan re-checks those interfaces against the real code after Phase 68 executes (D-24).

In scope:
- **The gate.** `fsbFastModeSessionField(true, 'mcp')` returns an enabled field that carries a `run_task` budget profile. There is no MCP argument, no payload change and no new storage key. The Phase 68 tests that say "run_task is never fast" are inverted in the same commit, not deleted.
- **Budgets.** A frozen, separately pinned `run_task` budget profile inside `FsbFastPath`, selected from the session field. The module never reads `source`.
- **Evidence and the typed outcome.** A memory-only evidence recorder for every executed tool result in fast-mode sessions, and a pure classifier that maps the terminal state plus that evidence to the four outcomes.
- **The result.** One additive `fast_mode` block on the `run_task` settle value, built in `extension/ws/mcp-bridge-client.js` from a session reference captured at start. It is also persisted through `FsbMcpTaskStore` `final_result`.
- **Goal text.** A narrow, code-only goal normaliser. It removes the one leading `Open <url>.` sentence that duplicates the page address, which makes the fast path usable on bench goals (68-RESEARCH F5).
- **Disclosure.** A test that re-verifies the Phase 68 disclosure copy now that it also covers `run_task`. No copy is edited unless a fact breaks.
- **Bench.** The bench runner records the block additively, so V4 can measure how often the typed outcome agrees with the code-verified outcome checker.
- **Proof.** All of this is proven offline: the Phase 68 harness with a fake gateway, a bridge-client harness, and an in-process MCP caller.

Out of scope:
- **Any `mcp/src` or `mcp/build` change.** That covers new tools, new arguments, new `MCPMessageType` values and new error codes.
- **Escalating to the MCP caller.** No `budget_exhausted` or `FAST_MODE_UNAVAILABLE` error, and no ending `run_task` early because of anything fast mode did.
- **A second fast-mode switch, a consent marker, or any stored value beside `fsbJevFastModeEnabled`.**
- **A typed outcome for switch-off `run_task`, for `sw_evicted` results (built in `mcp/src`) and for `get_task_status`.**
- **A Jev risk question, risk hook or confirmation card.**
- **Live gateway work, calibrated profiles or threshold numbers.** These belong to V2 and V3.
- **Editing the showcase privacy page, the Advanced Settings copy or the xlf files,** unless D-23's re-verify fails.
- **Any `agent-loop.js` edit, any `createSessionHooks` edit and any new `importScripts` line.**
</domain>

<decisions>
## Implementation Decisions

### Scope, compatibility and validation deferral

- **D-01: With the switch off, `run_task` is pre-milestone FSB, and tests prove it.**
  - **The settle values keep their exact shapes:**
    - `{sessionId, status, result}` from `handleComplete` (`mcp-bridge-client.js:2881-2887`);
    - `{sessionId, status:'error', error}` from `handleError` (`:2889-2895`);
    - `{sessionId, success:true, partial_outcome:'timeout', partial_state, hint}` from the 600 s safety net (`:2836-2842`).
  - **Other paths and payloads are unchanged:**
    - the `FsbMcpTaskStore` writes;
    - the heartbeat payload;
    - the `mcp:start-automation` payload (`tests/mcp-tool-smoke.test.js:327-332`).
  - **The only new work on the switch-off path** is one `activeSessions.get(sessionId)` read after the start dispatch returns (D-19). Everything else in the bridge is guarded by a synchronous check that the captured session has `fastMode`.
  - **Proof.**
    - `tests/mcp-bridge-client-lifecycle.test.js:514-523,555-564` and `tests/run-task-resolve-discipline.test.js` pass unedited.
    - A new bridge-harness golden covers every settle path: the runtime event, the bus event, error, stop and safety net. Each path is run with `FsbFastPath` loaded and not loaded, with no field on the session, and deep-equals the same values.
- **D-02: The validation deferral policy (STATE.md "v1.0.0-specific decisions", owner direction 2026-10-15) applies in full.**
  - Every Phase 70 plan is `autonomous: true`, and no plan has a `checkpoint:*` task.
  - Anything that needs the operator, a live account, a real MCP host, production, real spend or a human eye goes into `70-VALIDATION.md` "Manual-Only Verifications" with its V tag (see `<deferred>`).
  - Nothing is pushed to `origin/main` or any remote before V6.
  - Under the shipped `UNCALIBRATED` profile the live loop never acts (67 D-28, 68 D-02). The `run_task` path is proven only with the fake gateway and a test-only calibrated result (68 D-21).

  How each success criterion splits between automated proof in this phase and the Validation Block:

  | Success criterion | Proven automatically in Phase 70 | Deferred to |
  | --- | --- | --- |
  | **SC1:** `run_task` reads the switch and uses bounded action, Jev-call and wall-clock budgets only when it is on; there is no separate argument or toggle | Helper tests for `(true,'mcp')`, `(false,'mcp')` and `(undefined,'mcp')`. A harness case where a session built by the real helper for `source:'mcp'` takes an accepted fast step through `_executeTool` (fake calibrated gateway). Each budget of the `run_task` profile is hit and switches the task to LLM-only. The switch-off `run_task` golden is unchanged. The `mcp:start-automation` payload deep-equal holds. `git diff P70_START -- mcp/` is empty. The 69 `tools/list` shape freeze passes | **V3:** a calibrated profile makes the `run_task` fast path act on the bench fixtures, and the `run_task` profile numbers are revisited. **V4:** the fast-mode arm runs through `run_task` (overhead, budget-exhaustion and `sensitive_goal` counts). **V5:** a real host (Claude Code CLI) runs `run_task` with the switch on and the gateway uncalibrated or disabled: at most one attempt, nothing acts |
  | **SC2:** the result distinguishes `done`, `ambiguous`, `blocked` and `needs_confirmation` from verified effects and task state, not Jev's answer | A pure classifier table covering every terminal path and evidence state. End-to-end harness cases: an uncertain fast click followed by the LLM's `complete_task` with no observation gives `ambiguous`; an uncertain LLM click in the same turn as `complete_task` gives `ambiguous`; `manual_approval` and a declined payment fill give `needs_confirmation`; auth walls give `blocked`; a stop gives `blocked`, or `ambiguous` with uncertainty; the safety net gives `ambiguous`. A static check that the classifier never reads `decisions`, `meetsThreshold`, `threshold` or `probabilities` | **V4:** agreement between the typed outcome and the bench's code-verified outcome checker. The count of `done` on runs the checker failed (false done) is a gate input. **V5:** a human reads the outcomes on real tasks |
  | **SC3:** provider failures, uncertain targets and safety gates exit through a typed fallback or escalation, with no duplicate side effects | Under `source:'mcp'`: every fallback class gives a session, command or iteration latch and escalates to the LLM; an unknown outcome or `mayHaveExecuted` gets no second dispatch; risk-excluded elements are never fast-acted; a permission denial still blocks; the 67-07 tighten-only suite passes. Fallback reasons appear in the block's escalation tally | **V2:** live `disabled` and `spend_cap_reached` fallbacks are observed on a `run_task`. **V5:** an uncertain target on a real, re-rendering page |
  | **SC4:** existing MCP clients parse responses and call tools with no new required argument or tool | The settle value with the switch on differs from the switch-off value by exactly the key `fast_mode`, and removing that key gives the switch-off bytes. An in-process SDK caller (69-07 `tests/mcp-expect-caller.test.mjs` pattern) parses both. No `mcp/src` diff. The bench classification (`runs.mjs:224-236`) is unaffected | **V5:** Claude Code, Codex and Cursor parse a switched-on `run_task` result. **V6:** the release compatibility check (Phase 71). Phase 70 changes no MCP package file |
- **D-03: The MCP surface does not change (minimal MCP diff, gotcha 3, 66 D-01).**
  - **Nothing new on the MCP side.** No `mcp/src` or `mcp/build` file changes. There is no new tool, argument, payload key, `MCPMessageType` or `CODE_ONLY_ERROR_KEYS` entry (`mcp/src/errors.ts:60-87`).
  - **Why no MCP change is needed.** Extension-side keys already reach every caller unchanged:
    - the bridge sends `{ success: true, ...result }` (`mcp-bridge-client.js:1391-1392`);
    - `mapFSBError` stringifies any `success` result whole (`errors.ts:452-454`);
    - `sendAgentScopedBridgeMessage` returns the payload as it is (`mcp/src/agent-bridge.ts:136-164`).
  - **All four outcomes are success-shaped MCP results.** `isError` stays absent, and `success` is never set to `false`. A `false` would send the result down `mapFSBError`'s error branch, which keeps only Detected, Why and Next text and drops the block.
  - **Unchanged:** `stop_task`, `get_task_status` (`mcp:get-status`), `fsb://config` and the server-side `sw_evicted` result (`mcp/src/tools/autopilot.ts:147-205`). The `sw_evicted` result carries no typed outcome, because adding one would need an `mcp/src` edit (see `<deferred>`).

### Activation gate and loop mechanics (MCP-03, SC1, SC3)

- **D-04: `run_task` joins the fast path by widening exactly one gate, the Phase 68 helper `fsbFastModeSessionField(storedValue, source)` in `extension/background.js` (`68-06-PLAN.md:25,108,118-119`).**
  - **The new return values:**
    - `(true, 'mcp')` returns `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}`.
    - Every non-MCP case returns exactly what Phase 68 returns, with no `budgetProfile` key, so the module uses its autopilot profile.
    - A false, absent or non-boolean value still returns `null`, and the field stays absent (D-01).
  - **Where the switch is read.** It is still read only in the existing per-start settings read in `handleStartAutomation` (`background.js:13955-13960`, extended by 68-06 with `fsbJevFastModeEnabled`). `run_task` never sends a `conversationId` (`mcp-tool-dispatcher.js:3213-3222`), so it never reaches the follow-up branch (`background.js:13803`), and `fsbRecomputeFastModeForFollowUp` is not involved.
  - **Unchanged:**
    - The fast path still re-reads the stored switch before each attempt (68 D-05), so turning it off mid-run latches a `run_task` off at the next iteration.
    - The loop still reads only the session field and never `source` (68 D-05).
    - `createSessionHooks` stays byte-identical, with its slice hash in 68-SYNC-RECHECK item h.
    - The agent-provider early return (`background.js:13747-13755`) still comes first.
- **D-05: The Phase 68 "run_task is never fast" tests are inverted in the same commit as D-04, never deleted.**
  - **Inverted:**
    - the `(true,'mcp') -> {enabled:false, ...}` behavior in `tests/jev-fast-start-path.test.js` (`68-06-PLAN.md:108`);
    - the run_task case in `tests/jev-fast-loop.test.js` (`68-06-PLAN.md:190`), which becomes "a `run_task` session takes an accepted fast step";
    - the D-21 harness bullet (`68-CONTEXT.md:262`);
    - the 68-08 capture cases for `{enabled:false, stored:true, source:'mcp'}` (`68-08-PLAN.md:104-105`). These now assert that a `run_task` session with the switch on behaves exactly like an autopilot session with the same field: capture plus fast attempts.
  - **Kept as they are:**
    - The switch-off `run_task` golden.
    - The 68-05 `not_enabled` unit case (`68-05-PLAN.md:103,129`). It stays a module-level case for a hand-built field whose `enabled` is false, renamed so it no longer claims to represent `run_task`.
  - **Recorded in this phase's VALIDATION.** T-68-16 (`68-06-PLAN.md:242`) and the D-03 "run_task stays on today's path" truth (`68-CONTEXT.md:68-71`) are superseded by this decision.
- **D-06 (Auto-Resolved): `run_task` uses the Phase 68 loop mechanics unchanged, and every escalation goes to the in-extension LLM, never to the MCP caller.**
  - **Mechanics that carry over:**
    - the LLM takes the first turn of the command (68 D-09);
    - at most one menu request and one Jev call per iteration (`68-05-PLAN.md:16`);
    - Jev never retries or re-asks, including `same_state` (68 D-18);
    - risky elements are excluded by code only (68 D-19);
    - the session, command and iteration latches (68 D-16, `68-05-PLAN.md:20`);
    - the hand-off summary with a fresh snapshot (68 D-10);
    - `abortInFlight` on stop (`68-06-PLAN.md:121`).
  - **Only the LLM ends the task.** It does so through `complete_task`, `partial_task`, `fail_task` or `end_turn`, or the existing breakers end it (68 D-17). The fast path has no terminal of its own.
  - **The caller-escalation design is superseded.** `.planning/research/ARCHITECTURE.md:252-266` proposed `escalation:'caller'`, `max_steps` and `max_seconds` arguments, and `FAST_MODE_UNAVAILABLE`. The owner's "no new argument, one switch" direction and SC1/SC4 replace it.
- **D-07 (Auto-Resolved): Phase 70 adds no consent step for a switch that an MCP client turned on. The question stays a V6 policy item and is now marked as a release blocker for MCP-started transfers.**
  - **What the research found** (External Research 2 in the log). The Chrome Web Store FAQ says the prominent disclosure and consent "must occur within the Product's user interface" and must require the user "to take a specific action clearly agreeing to the disclosure before collecting or handling user data". An MCP-client write through the `settings` tool (66.1 D-17; logged per 66.1 D-18) is not such an action.
  - **What V6 must decide before any release in which `run_task` can transfer page context.** M-68-12 is extended as M-70-08. Every remedy needs an owner decision that amends a requirement:
    - (a) the `settings` tool may turn the switch off but not on (this amends SET-01's "every other setting is writable" and AUTO-01);
    - (b) a stored write-provenance marker that `run_task` honors (this is a second stored value, which REQUIREMENTS Out of Scope forbids);
    - (c) a one-time side-panel acknowledgement (a UI change under the sidepanel SHA pins, `tests/delegation-sidepanel-ui.test.js:755-781`);
    - (d) accept the current behavior with a written justification.
  - **What this phase adds.** Nothing reaches users before V6. Phase 70 makes the transfer visible to the MCP caller through the `fast_mode` block (D-17). It adds no new stored value and no UI.

### Budgets: actions, Jev calls and wall clock (SC1)

- **D-08 (Auto-Resolved): "Its own bounded budget" is a frozen `run_task` budget profile inside `FsbFastPath`, selected only through the session field's `budgetProfile`.**
  - **The values match Phase 68's defaults at ship:** 12 fast steps, 16 Jev calls, 20,000 ms of menu-plus-Jev time and 3 consecutive fast steps per command, an escalation latch of 3, and at most `DEFAULT_TIMEOUT_MS` (2,500 ms) per `decide` call (`68-04-PLAN.md:77`, `68-05-PLAN.md:19`). `run_task` is always a single command, so the per-command counters are per-task counters.
  - **Why separate but equal.**
    - The profile is named, selected and pinned on its own (for example `constants.BUDGET_PROFILES.run_task`), so SC1 is auditable and V3/V4 can tune `run_task` without touching autopilot.
    - Equal values keep V4's evidence valid for autopilot. M-68-05 measures autopilot fast mode through `run_task` (`68-VALIDATION.md:170`).
    - Values that differ before V3/V4 would be uncalibrated guesses.
  - **How the module uses it.** It reads budgets from the selected profile and falls back to the autopilot profile, which is today's frozen constants, when `budgetProfile` is absent or unknown. It never reads `source`.
  - **Pins.** The existing constant pins in `tests/jev-fast-path.test.js` stay, and new pins cover the `run_task` profile. Both profiles are marked uncalibrated, pending V3/V4 (M-68-04, M-70-03).
- **D-09 (Auto-Resolved): The wall-clock budget keeps Phase 68's meaning: cumulative menu-plus-Jev time per command. The whole-task ceilings stay as they are and are the task's wall clock.**
  - **The ceilings:**
    - `autopilot.ts:130` (`timeout: 600_000`);
    - `mcp-bridge-client.js:2800` (`RUN_TASK_SAFETY_NET_MS = 600_000`);
    - `checkSafetyBreakers` `timeLimit` 600,000 (`agent-loop.js:282`), unchanged per 68 D-12.
  - **No elapsed-time cutoff for fast attempts.** A cutoff would switch fast mode off exactly on the long tasks where it saves the most LLM turns.
  - **Host timeouts.** They are outside FSB's control, and fast mode only shortens tasks. Codex's default `tool_timeout_sec` is 60 s, Cursor's agent CLI/ACP path has a hardcoded 60 s with no progress reset, and Claude Code CLI's default is about 28 hours with a 30-minute idle timeout for stdio (External Research 3). They are recorded for V4/V5 as context: runs longer than 60 s are counted per arm.
  - **The safety net.** When the 600 s safety net settles a fast-mode session, the block reports `ambiguous` with reason `safety_net_timeout` (D-13). The existing `partial_outcome:'timeout'` keys are unchanged.
- **D-10 (Auto-Resolved): Exhausting a budget never ends a `run_task`.** Fast mode switches to LLM-only for the rest of the task (68 D-12, `68-05-PLAN.md:19`). The exhaustion is reported in the block (`exhausted`, D-18). Ending with `blocked`/`budget_exhausted` is rejected: it would lower switched-on completion against baseline and hand unfinished work back to the caller.
- **D-11 (Auto-Resolved): No memory of an "uncalibrated" answer across sessions.**
  - **The cost while `UNCALIBRATED` ships.** Each switched-on `run_task` pays at most one menu extraction (1,500 ms deadline) and one `decide` (at most 2,500 ms), then latches off (68 D-16; the 67-08 cool-down does not cover `ok:true` uncalibrated answers, `67-08-PLAN.md:20,128`).
  - **The expected cost** is a few hundred milliseconds. Published single-call Jev latency is 70-500 ms (TypeSafe) and 286 ms on average over 202 calls (jev-browser), plus FSB's gateway hop (External Research 4).
  - **The pre-V2 production host** answers 404, which is `invalid_request`, a session latch after one call (M-68-02).
  - **Measured in V4 (M-70-04)** as the switched-on arm's per-task overhead. Remembering the latch for a service-worker lifetime would add cross-session global state, and V3 replaces `UNCALIBRATED` anyway (see `<deferred>`).

### Typed outcome from task state and evidence (SC2, SC3)

- **D-12: The outcome is computed once, after the task ends, by a pure classifier in `FsbFastPath`.**
  - **What it reads:**
    - **The settle source:** lifecycle complete, lifecycle error, or safety net.
    - **The terminal lifecycle message.** `notifySidepanel` sends `outcome`, `reason`, `partial`, `stopped`, `blocker` and `nextStep` (`agent-loop.js:1556-1606`). The background stop paths send `outcome:'stopped'` with `reason` `user_stopped` (`background.js:14511-14522`), `tab_closed` (`:5418-5431`) or `service_worker_restart` (`:5037-5050`).
    - **The session's evidence record** (D-14).
    - **The session's Jev measurement block** (68 D-23).
  - **What it never reads:** `result.decisions`, `meetsThreshold`, `threshold` or `probabilities`. This is checked statically over the classifier's source slice. Jev never ends a task (68 D-17), so no Jev answer can produce `done`.
  - **Rejected alternatives.**
    - A final read-only completion probe (`detectCompletionSignals`, or the legacy `gatherCompletionSignals`/`validateCompletion` scorer at `background.js:11421-11450,11664`) is rejected for now. It adds a content round trip and a heuristic that can demote real successes. It is deferred to after V4.
    - 69's `evaluateExpectation` is rejected: it needs a caller-supplied spec (`69-03-PLAN.md:85-102`), and `run_task` may not gain an argument.
- **D-13 (Auto-Resolved): Exactly four outcome values, applied in this precedence order. Every outcome carries one reason code from a closed list.**

  | # | Condition (first match wins) | `outcome` | `reason` |
  | --- | --- | --- | --- |
  | 1 | The classifier threw, or `FsbFastPath` was unavailable at settle | `ambiguous` | `classifier_error` |
  | 2 | The settle came from the 600 s safety net | `ambiguous` | `safety_net_timeout` |
  | 3 | The terminal is `partial` with reason `manual_approval`, or the terminal is not a success and the evidence holds an unresolved existing human gate (D-15) | `needs_confirmation` | `manual_approval`, `payment_not_approved` or `site_consent_required` |
  | 4 | The evidence holds unresolved uncertainty (D-14) | `ambiguous` | `uncertain_action` |
  | 5 | The terminal is a success (`complete_task` `:2475-2510` or `end_turn` `:2124`) and the session evidence is available | `done` | `complete_task` or `end_turn` |
  | 6 | The terminal is a success but no session evidence could be captured | `ambiguous` | `evidence_unavailable` |
  | 7 | Anything else | `blocked` | The terminal reason mapped to a closed list: `blocked`, `auth_required`, `credentials_missing`, `user_skipped_login`, `credentials_failed`, `fail_task`, `error`, `iteration_limit_exceeded`, `time_limit_exceeded`, `safety`, `meta_cognitive_loop_break`, the stuck reasons, `user_stopped`, `tab_closed`. An unknown reason gives `other` |

  - **Auth walls.** The `isAuthWallPartialReason` reasons other than `manual_approval` (`agent-loop.js:792-799`) map to `blocked`, keeping their reason, so a caller can tell a sign-in wall from an approval.
  - **Two flags travel with every outcome:** `uncertain_unobserved` and `human_gate` (D-18). So `needs_confirmation` with uncertainty still tells the caller to inspect the page.
  - **A user `stop_task`** gives `blocked`/`user_stopped`, or `ambiguous`/`uncertain_action` when a tool was dispatched without a recorded result or uncertainty is otherwise unresolved.
  - **No fifth value.** `status` keeps carrying `stopped` and `error` detail.
- **D-14: The evidence behind the outcome is recorded for every executed tool result in a fast-mode session, including tool calls that come before a terminal tool in the same LLM turn.**
  - **Unresolved uncertainty** is one of the following, with no later observation:
    - (a) any executed tool result that 68's `classifyStepEvidence` calls `uncertain`: `outcome:'unknown'`, `mayHaveExecuted:true` or `bfCacheDetected:true`, read from the nested `result.result` (`68-04-PLAN.md:82,146`). This applies to fast and LLM calls alike;
    - (b) a fast (Jev-chosen) step whose effect was not observed: `unconfirmed`, `uncertain` or `no_effect`;
    - (c) a tool known to have been dispatched with no recorded result when the task ended.
  - **An observation** is a later successful tool whose definition has `_readOnly: true` (`tool-definitions.js`, 19 tools), or a delivered hand-off snapshot. A hand-off whose snapshot was unavailable is not an observation.
    - *Amended 2026-10-16 (PD-70-01; accepted by orchestrator under the owner's deferral direction; owner confirms at V5, M-70-06):* the observation set is narrowed, tighten-only, to a later successful call of one of the 9 page-reading read-only tools (`_readOnly: true` with `_route` 'content' or 'cdp': wait_for_element, wait_for_stable, read_sheet, capture_screenshot, read_page, get_text, get_attribute, get_dom_snapshot and get_page_snapshot) or a delivered hand-off snapshot. `report_progress`, the terminal tools and the other `_readOnly` tools that never read the page are not observations. Reason: under the 19-tool set, `[uncertain click, report_progress, complete_task]` reads as `done`, which is the SC2 failure this decision exists to prevent (RESEARCH F1). The narrowing can only move an outcome from `done` to `ambiguous`, never the reverse, and it changes nothing with the switch off. Plan 70-03 pins the 9-tool list and executes on this amended wording with no further gate; V4 measures the false-`ambiguous` rate it causes (M-70-04). If the owner widens the set at V5, only that pinned list changes.
  - **LLM steps follow baseline rules.** An LLM step that succeeded without verification does not count as uncertain, because the LLM's own success semantics are baseline. Only Jev-chosen steps must show an effect before `done`. This is how SC2's "not from Jev's answer alone" is applied.
  - **The same-turn gap.** `complete_task` returns inside the tool loop (`agent-loop.js:2509-2510`), before the tool-result push and the 68 `observeTools` seam. So an earlier call in the same turn never reaches `observeTools`. `AFTER_TOOL_EXECUTION` is emitted per call with the full result (`:2867-2871`).
    - The recommended capture point is a session-scoped observer, registered with `pipeline.register` (`hook-pipeline.js:78`) in `handleStartAutomation` only when the fast-mode field exists. `createSessionHooks` stays unedited and hash-pinned.
    - The planner may choose another capture point only if it also closes the same-turn gap without editing `agent-loop.js`.
  - **Storage and content.** The record is memory-only, for example under `session._fastPath`. It is never persisted, and it holds only tool names, iteration numbers, sequence counters and gate codes. It never holds labels, URLs, text or values.
- **D-15 (Auto-Resolved): `needs_confirmation` comes only from existing code gates, never from Jev and never from the LLM's free text.**
  - **The gates:**
    - a `partial_task` terminal with reason `manual_approval`;
    - a `fill_payment_method` result with `declined:true`, whose reason is `timeout`, `user_declined` or `sidepanel_unavailable` (`tool-executor.js:502-582`);
    - an `invoke_capability` result carrying `RECIPE_CONSENT_REQUIRED` (`capability-router.js:456-529`).
  - **When a gate is unresolved.** It counts only when the task did not end in success and no later successful call of the same kind cleared it.
  - **No Jev risk.** There is no Jev risk question and no `mergeConfirmation`/`toBeforeToolResult` hook. Under `UNCALIBRATED`, `accept()` is false, and `failClosed` would add a confirmation to every mutation whenever Jev fails (`67-07-PLAN.md:14-18,57-60`, 68 D-19).
  - **Risk-excluded steps.** A next step excluded for risk (68 D-19) goes to the LLM exactly as in autopilot. It does not stop `run_task`.
- **D-16: Jev fallbacks are reported, never turned into outcomes.**
  - 67-CONTEXT's "Phase 70 maps the fallbacks to `run_task` outcomes" (`67-CONTEXT.md:478`) is realised as reporting. Every fallback reason and escalation code lands in the block's `escalations` tally, and the session or command latch reason lands in `latched`.
  - The outcome itself always comes from the task's terminal state and the D-14 evidence. A fallback can never make a `run_task` `blocked` or `ambiguous` by itself.

### Wire shape and where the result is built (SC2, SC4, MCP-04)

- **D-17 (Auto-Resolved; deviates from the analyzer's recommendation (a)): One additive top-level key, `fast_mode`, holds the typed outcome and the compact fast-mode summary.**
  - **When it appears.** On every settle value of a `run_task` whose session had `fastMode` when it started (complete, error and safety net), even if fast mode latched off immediately or Jev never acted. That keeps SC2 demonstrable under `UNCALIBRATED`. It never appears when the switch was off at start (D-01).
  - **Unchanged keys.** `success` is never flipped, `status` keeps its current values, and no existing key is renamed or reordered. The block is appended last.
  - **Why one nested key instead of a top-level `outcome`.**
    - It is the smallest additive footprint: the key-set diff is exactly `{'fast_mode'}`.
    - It avoids a third meaning of `outcome`, which already names the lifecycle terminal and `sess.outcome`, and appears in `mapFSBError`'s `{"outcome":"unknown"}` trailer (`errors.ts:469`).
    - It follows the snake_case of the existing wire (`partial_outcome`, `sw_evicted`, `expect_result`).
  - *Amended 2026-10-16 (accepted by orchestrator under the owner's deferral direction; owner confirms the recorded decision at V6, M-70-07):* the switch-on `fast_mode` key is accepted now as an additive result key under MCP-04. It is present only when the Advanced Settings switch was on when the task started; with the switch off the result is byte-identical to the pre-milestone result (D-01, D-20). MCP-03 and SC2 require the result to carry the typed outcome, and the key adds no tool, no argument and no required field. If the owner wants MCP-04's wording in REQUIREMENTS.md to name the key, that edit is made at V6.
- **D-18: Shape of the `fast_mode` block.** Final key names are the planner's, within these rules.
  - **Top-level keys:**
    - `outcome`: one of the D-13 values;
    - `reason`: one D-13 code;
    - `uncertain_unobserved`: `true`, `false`, or `null` when no evidence was captured;
    - `human_gate`: `null`, `manual_approval`, `payment_not_approved` or `site_consent_required`;
    - `budget_profile`: `run_task`;
    - `jev`: the compact summary below.
  - **The `jev` summary**, derived from 68's `jevMeasurement` per-command totals and `_fastPath` state:
    - `attempts`, `calls` and `fast_steps` (known counts, so 0 is a real value);
    - `jev_ms` (null when no attempt was timed);
    - `calibration`: the last `calibration.status` seen, or null;
    - `latched`: the latch reason, or null;
    - `exhausted`: the budget reason, or null;
    - `escalations`: a map from reason code to count.
  - **Bounds and content.**
    - The vocabulary is closed, and an unknown code becomes `other`.
    - The block never contains a label, URL, title, goal, page text, selector, value, hash key or model output. A test scans for fixture marker strings to prove it.
    - Size is bounded by the closed vocabularies.
  - **Exact-key parity (gotcha 6).** One frozen key list is shared by the producer test, the bench consumer (D-21) and the wire test.
- **D-19 (Auto-Resolved): The block is built in `_handleStartAutomation` from a session reference captured at start. The classifier lives inside `extension/ai/jev-fast-path.js`.**
  - **Capturing the session.** Right after `response.sessionId` is read (`mcp-bridge-client.js:2662`), the bridge reads `activeSessions.get(sessionId)` once, the same read `fireHeartbeat` already does (`:2693-2696`). It keeps the reference only when the session has `fastMode`.
  - **Why capture at start.**
    - `handleStopAutomation` runs `cleanupSession` (`background.js:14501`) before it broadcasts, so a lookup at settle time misses stopped sessions.
    - `finalizeSession` broadcasts before cleanup (`agent-loop.js:1669-1674`), but only for agent-loop endings.
    - `cleanupSession` removes the map entry without clearing the session's fields (`background.js:4446-4510`), so the captured reference stays readable.
  - **Building the block at settle.** A synchronous, try/catch-wrapped step inside `settle` adds the block to the value before the terminal `FsbMcpTaskStore` write (`:2759-2777`). The block therefore reaches `final_result`, and so the `sw_evicted` lookup's `partial_state` (`_handleGetTaskSnapshot`), with no MCP change.
  - **Failure handling.** A classifier exception or a missing `FsbFastPath` gives `{outcome:'ambiguous', reason:'classifier_error'}` plus whatever summary fields are safe. Settle is never delayed and never throws. The captured reference is released at settle.
  - **No new load or boundary change.**
    - The classifier is an `FsbFastPath` member, so there is no new module and the lattice `importScripts` pins (`tests/lattice-provider-bridge-smoke.test.js:635-636,683-684`) do not move.
    - The global does not start with `FsbJev`, so the 67-11 prefix rule (`68-RESEARCH.md:392`, F12) is untouched.
- **D-20 (Auto-Resolved): Additivity is proven by both deep-equal goldens and key-set tests, and on the wire by an in-process caller.**
  - **Switch off:** the D-01 goldens on every settle path.
  - **Switch on:**
    - For every settle path, `Object.keys(on)` minus `Object.keys(off)` equals `['fast_mode']`.
    - Removing `fast_mode` gives the switch-off value deep-equal.
    - The serialized `mapFSBError` text with the block equals the switch-off text with only the block's lines added.
  - **In-process caller (69-07 SC4 pattern).** An SDK `Client` over `InMemoryTransport` drives `createRuntime({bridge: fakeBridge})` from `mcp/build`. The fake bridge answers `mcp:start-automation` with recorded settle values. The test parses the tool result, finds `fast_mode` intact, sees no `isError`, and finds the switch-off output byte-identical to a golden captured before any Phase 70 edit.
  - **Classifier table:** exhaustive over the D-13 rows and every terminal reason the code can produce, derived by scanning the `createTerminalOutcome` call sites and the partial reasons, so a new reason fails the suite.
  - **Registration.** New suites go into `package.json` `test` and `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129`) in the same commit. Every bridge-client edit re-runs the `delegation-phase-contract` regex audits of `mcp-bridge-client.js` (`:2441-2516`).
- **D-21 (Auto-Resolved; addition beyond the analyzer): The bench runner records the `fast_mode` block additively so V4 can measure typed-outcome agreement.**
  - **What changes.** `runAutopilotArm` (`scripts/bench/run-bench.mjs:555-590`) copies `json.fast_mode`, only when it is a plain object, into the run record through the shared exact-key list (D-18). V4 can then count, per arm, how often each typed outcome agrees with the code-verified outcome checker, especially `done` on runs the checker failed (66 D-17: an agent's claim is never proof).
  - **What stays the same.**
    - Runs without the block produce records with the same key set as before.
    - `classifyAutopilot` (`scripts/bench/lib/runs.mjs:224-236`) is unchanged.
    - The frozen corpus (`scripts/bench/tasks/core.lock.json`) is untouched.
  - **The V1 baseline** runs from the pinned `8a058bdf` worktree, so a runner change after it cannot alter V1.

### Goal text and disclosure

- **D-22 (Auto-Resolved): A narrow, code-only goal normaliser removes the one leading `Open <url>.` sentence that duplicates the page address. Nothing else in the goal changes.**
  - **What it removes.** A pure `FsbFastPath` function, applied to `session.task` before `buildRequest` in every fast-mode session (source-blind, 68 D-05), removes exactly one leading sentence of the form `Open <http(s) URL>.`. That is the 67-10 hand-record rule and the 68-08 exporter rule (`68-RESEARCH.md:385`, F5(b)).
  - **When it removes it.** Only when all of these hold:
    - (1) the URL's origin and path equal the origin and path of the current page or of the page the task started on. These are code-held URLs, never LLM text, and the request already carries that address as `page.origin`/`page.path`;
    - (2) every path segment survives `FsbJevState.scrubText` unchanged, so no segment is one that FSB's address rule would redact (`67-06-PLAN.md:76`);
    - (3) the URL's query and fragment do not `matchesSecret`.
  - **What it never does.** It never truncates and never adds text, so its output is always a suffix of the task text.
  - **What the rest of the pipeline still does.**
    - The secret scan in `buildRequest` still runs on the result, so any other secret still gives `sensitive_goal` and a command latch, as in Phase 68.
    - Goals over 1,000 code points still return a local `invalid_request` and a session latch (`67-01-PLAN.md:189`, 68-04 `classifyFallback`). They are counted in V4.
  - **Why.**
    - Without it, almost every bench `run_task` goal trips `sensitive_goal`, and V4's fast-mode arm measures nothing (68-RESEARCH F5(c), Open Question 5 `:839`; M-68-05).
    - With it, live goals equal the calibration records' goals.
    - It sends strictly less text than before.
    - Changing the bench's task rendering is rejected: it would alter the task text compared with the V1 baseline at `8a058bdf`.
  - **Tests.**
    - The 68-05 bench-goal `sensitive_goal` case (`68-05-PLAN.md:107`) is re-pointed in the same commit, not weakened. That goal now normalises and is sent, and two new cases still latch: an `sk-` key, and a token in the Open URL's query.
    - A test renders every core task as `Open <fixture URL>. <instruction>` and asserts that the normaliser's output equals the 68-08 exporter's goal for that task.
  - **Gotcha.** The module may not contain the literal `https://`, comments included (67-11 ban, F12). The URL pattern is written as `https?:\/\/`.
- **D-23 (Auto-Resolved): The existing disclosure already covers `run_task`, because `run_task` is FSB's autopilot. Phase 70 re-verifies it with a test and edits no copy.**
  - **What the new checks assert,** against `tests/fixtures/jev-fast-disclosure-facts.js` (68-12):
    - the Advanced Settings card (`68-12-PLAN.md:127`) and the privacy section (68-10) contain no phrase that limits fast mode to the side panel or to tasks started in the panel;
    - the "Control" fact still names the MCP settings tool (`68-10-PLAN.md:74`);
    - the goal sent for a `run_task` is a suffix of its task text (D-22);
    - the never-sent list still holds, because query strings are removed with the sentence;
    - "one step description before it stops asking" holds for each `run_task` session under `UNCALIBRATED` (D-11).
  - **If a check fails.** The plan stops and raises a copy change for the owner instead of editing silently. Such a change means the card plus the privacy page in six locales, with xlf re-extraction and the line pins.
  - **V6.** M-70-09 confirms that "FSB's autopilot" reads as covering MCP-started tasks, together with the consent review (D-07).

### Testing, tripwires and sync re-check

- **D-24: Before any Phase 70 source edit, plan 70-01 records `P70_START` and re-checks every interface quoted here against the real code.** It follows the 68-01 pattern (`68-01-PLAN.md:120-162`).
  - **Preconditions.** The 66.1, 67, 68 and 69 SUMMARY files exist, and `git status --porcelain -- extension tests package.json scripts showcase mcp` is clean. If either fails, stop.
  - **`70-SYNC-RECHECK.md` records:**
    - the interface table, with status MATCH, RENAMED, CHANGED or MISSING, for:
      - `fsbFastModeSessionField` and its real return shapes;
      - the `FsbFastPath` exports and `constants`, `classifyStepEvidence`, and the `jevMeasurement` and per-command totals layout (68-04, 68-09);
      - the `session.fastMode`, `session._fastPath` and `agentState.jevFast` layouts;
      - the 68 test names and locations that D-05 inverts;
      - the boundary-suite rules as narrowed by 68;
      - the disclosure fact fixture;
      - the 68-08 exporter goal rule;
      - the 67 `buildRequest`, `scrubText`, `matchesSecret` and `toOriginPath`;
      - the 69 caller harness and shape-freeze file names;
    - the bridge settle anchors;
    - whether `activeSessions` holds the session when the start dispatch returns (the `sendResponse` order in `handleStartAutomation`);
    - the slice hashes of `createSessionHooks` and `runAgentIteration`'s seams, which must stay unchanged;
    - a pre-edit sweep baseline (`scripts/bench/sweep-tests.mjs`);
    - a "Drift substitutions" section.
  - **The tripwire suite.** A registered `tests/jev-run-task-upstream-contract.test.js` fails loudly on drift.
  - **Never.** No upstream interface is ever stubbed, and no upstream test is ever weakened to fit.
- **D-25: Test, tripwire and commit rules.**
  - **Before editing.** Before editing `background.js`, `mcp-bridge-client.js`, `jev-fast-path.js`, `run-bench.mjs` or any test, grep `tests/` for `.match(`, `.includes(`, `indexOf(`, `readFileSync` and `sha256(` pins on that file, and bump paired pins in the same commit.
  - **Known readers.**
    - Of `mcp-bridge-client.js`: `tests/mcp-version-parity.test.js:242`, `tests/delegation-phase-contract.test.js:2441-2516`, `tests/run-task-resolve-discipline.test.js:257`, `tests/run-task-heartbeat.test.js:258`, `tests/lattice-replay-background-contract.test.js:15`.
    - Of `background.js`: 57 test files at `e1e6439c`, including the hash users `delegation-phase-contract`, `mcp-version-parity` and `bench-drivers`.
  - **`jev-fast-path.js` keeps every 68-04 and 68-05 grep criterion:**
    - no `chrome.`, timers, storage, `https://`, `importScripts` or `\bJEV_[A-Z_]+\b`;
    - no `meetsThreshold`, `probabilities` or `.threshold`;
    - no `hadEffect`, `estimateCost`, `totalCost` or `getHashKey`;
    - nothing runs at load;
    - `afterStep` and `observeTools` contain no `await`.
  - **Files that stay untouched:**
    - `agent-loop.js`: its 8 `setTimeout` tokens, 4 schedule lines and 2 step names stay pinned;
    - `createSessionHooks`, `tool-definitions.js`, `ai-integration.js` and every `mcp/` file;
    - the lattice `importScripts` counts.
  - **Registration and runtime.**
    - New test commands go into `package.json` `test` and `REFINEMENT_ROOT_TEST_COMMANDS` in the same commit. Never edit the `PRE_PHASE6x` hashes.
    - Node 20 only, with no Node 22+ globals. No test binds 7225 or 7226.
  - **Housekeeping.**
    - Restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` after a full `npm test`.
    - The xlf files are not touched (D-23).
    - Commits carry no AI attribution, and nothing is pushed before V6.

### Claude's Discretion
- **Names.** The `budgetProfile` value and the profile object's name, the classifier, recorder and normaliser function names, and the final key names inside `fast_mode`. The top-level key `fast_mode` and the four outcome strings are fixed.
- **The evidence capture point (D-14),** within "closes the same-turn gap, no `agent-loop.js` edit, `createSessionHooks` unedited".
- **The closed reason vocabularies (D-13, D-18).** They are derived by scanning the real terminal call sites and partial reasons, and the stuck reasons are listed as they exist.
- **The source of the start URL for D-22 (1).** It must be a code-held URL, for example the session's first recorded URL.
- **The bench record field name and any additive report section (D-21).**
- **Plan split and wave order.** A suggested order:
  1. sync re-check, tripwire and sweep baseline;
  2. gate widening with the inverted tests, plus the `run_task` budget profile;
  3. the evidence recorder and goal normaliser;
  4. the classifier and the bridge block with the wire tests;
  5. the in-process caller test, the bench record and the disclosure re-verify;
  6. the phase gate (full chain, Node 20, VALIDATION).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, requirements and owner decisions
- `.planning/ROADMAP.md`: the Phase 70 goal and SC1-SC4; the milestone "Compatibility", "Provider decision", "Validation Block" and "Release evidence" paragraphs.
- `.planning/REQUIREMENTS.md`:
  - MCP-03 (this phase) and MCP-04 (byte-stable wire);
  - SET-01/SET-02 (the switch through the settings tool);
  - AUTO-04/AUTO-05 (the shared loop's budgets and fallbacks);
  - Out of Scope (no second fast-mode switch, no reduced confirmations);
  - Future Requirements (no new MCP tools for Jev).
- `.planning/STATE.md`: "### Decisions", then "v1.0.0-specific decisions" (V1-V6).
- `.planning/PROJECT.md`: the key decisions table, especially "run_task resolves on lifecycle event with 600s safety net", "FSB provides Jev without a user key" ("Phase 70 follows it for MCP") and "Backwards compatible with Jev off".

### Upstream phase contracts (planned; quote these names)
- `.planning/phases/68-autopilot-fast-mode/68-CONTEXT.md`:
  - D-01 (off path), D-03 (`run_task` excluded, superseded here), D-05 (the one session flag), D-09..D-12, D-16..D-19, D-21 (proof harness), D-23 (measurement);
  - `<deferred>` "The `run_task` fast loop, typed outcomes and budgets: Phase 70", including the D-06/D-07 copy re-verify (`:492`) and the needs-confirmation note (`:487`);
  - `<specifics>` "The MCP-enable consent question" (`:458`).
- `68-DISCUSSION-LOG.md:75-77`: "One session flag gives Phase 70 a single gate to widen."
- `68-01-PLAN.md:120-162`: the sync re-check and tripwire pattern that 70-01 follows.
- `68-04-PLAN.md:77-87`: the `FsbFastPath` constants and pure API (`classifyStepEvidence`, measurement helpers); `:146` (evidence semantics); `:125-127` (module grep criteria).
- `68-05-PLAN.md:16-26,72-86,126-153`: `beforeTurn` order, `not_enabled`, budgets, latches, `afterStep`/`observeTools`/`flushHandoff`, the state layout; `:103,107` (cases D-05 and D-22 touch).
- `68-06-PLAN.md:25,108,112,118-121,190,242`: `fsbFastModeSessionField`, the start-path wiring, the stop hook, the `run_task` case and T-68-16.
- `68-08-PLAN.md:23,104-105`: capture gating, including the `run_task` cases D-05 inverts; the exporter goal rule.
- `68-09-PLAN.md:20-23`: the `jevMeasurement` persistence and `get_session_detail` projection, which now also appears for fast-mode `run_task` sessions, additively.
- `68-10-PLAN.md:70-75` and `68-12-PLAN.md:18,120-127,162`: the shared disclosure fact list, the card copy and T-68-07.
- `68-RESEARCH.md:385` (F5), `:390-394` (F10-F14), `:839` (Open Question 5).
- `68-VALIDATION.md:170` (M-68-05), `:177` (M-68-12).
- `.planning/phases/67-hosted-jev-gateway-policy-and-shadow-mode/67-CONTEXT.md`: D-13 (one attempt), D-16 (fallback enum), D-28 (act only when calibrated), D-29/D-30 (tighten-only), `:471-478` ("Phase 70 maps the fallbacks to `run_task` outcomes").
- `67-01-PLAN.md:82,85,189`: `FALLBACK_REASONS`, `NON_TRANSIENT_REASONS`, the goal cap and `sensitive_goal`.
- `67-06-PLAN.md:20,76`: `buildRequest`, and `toOriginPath`'s per-segment path scrub.
- `67-07-PLAN.md:14-18,57-60`: `accept`, `mergeConfirmation`, `failClosed`.
- `67-08-PLAN.md:20,59-64,128`: `createJevClient`, `decide`, `DEFAULT_TIMEOUT_MS`, the cool-down scope.
- `.planning/phases/69-mcp-descriptions-and-same-call-checks/69-CONTEXT.md`:
  - D-18/D-19 (`evaluateExpectation`, not used here);
  - D-21 ("Success responses ... need no change");
  - D-22 (shape freeze and `mapFSBError` byte-identity);
  - D-23 (the in-process caller harness).
- `69-07-PLAN.md`: `tests/mcp-expect-caller.test.mjs`, the harness pattern for D-20.
- `69-06-PLAN.md`: `tests/mcp-expect-wire.test.js`, `tests/mcp-tools-list-shape-freeze.test.js`.
- `.planning/phases/66.1-mcp-settings-tool/66.1-CONTEXT.md`: D-16, D-17, D-18 (MCP writes are allowed and logged).
- `.planning/phases/66-baseline-and-session-timing/66-CONTEXT.md`: D-01 (minimal MCP diff), D-15 (frozen corpus), D-17 (an agent's claim is never proof).

### Research
- `.planning/research/JEV-REFERENCE.md:151` (the `run_task` seam row and "typed outcomes ... rather than silent success").
- `.planning/research/ARCHITECTURE.md:252-266` (§5, superseded by D-03/D-06; read it for what not to build).
- `.planning/research/PITFALLS.md` ("Looks Done But Isn't").

### Codebase maps
- `.planning/codebase/TESTING.md` and `.planning/codebase/CONVENTIONS.md`.

### External (fetched 2026-10-15)
- Chrome Web Store user data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Chrome Web Store disclosure requirements: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- jev-ultrafast-mcp: https://github.com/jiawei686/jev-ultrafast-mcp
- jev-browser (Ying-Kai-Liao): https://github.com/Ying-Kai-Liao/jev-browser ; jevwiki browser builds: https://jevwiki.ai/wiki/ideas/builds-browser-and-interface.md
- Claude Code MCP timeouts: https://code.claude.com/docs/en/mcp
- Codex MCP config: https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli
- Cursor agent CLI/ACP 60 s timeout: https://forum.cursor.com/t/agent-acp-mcp-tools-call-times-out-at-60s-with-no-way-to-configure-it/163925
- Jev latency: https://www.eesel.ai/blog/jev-ultrafast
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The `run_task` settle path** in `extension/ws/mcp-bridge-client.js`:
  - `_handleStartAutomation` (`:2650`), with the start dispatch and `response.sessionId` (`:2651-2662`);
  - `fireHeartbeat` already reads `activeSessions.get(sessionId)` (`:2693-2696`);
  - `settle` with the terminal `FsbMcpTaskStore` write of `final_result: value` (`:2744-2786`);
  - the safety net (`:2800-2842`);
  - `handleComplete`/`handleError` (`:2881-2895`; `status: message.outcome || message.result?.status || ...`, and `message.reason` is dropped today);
  - the runtime and bus listeners (`:2898-2925`);
  - the result send `{ success: true, ...result }` (`:1391-1392`).
- **The MCP side (read only):**
  - `mcp/src/tools/autopilot.ts:32-211` (`{task}` only, a 600 s timeout, the `sw_evicted` result built server-side);
  - `mcp/src/errors.ts:449-454` (success results stringified whole), `:456-472` (the `mayHaveExecuted` branch), `:60-87` (`CODE_ONLY_ERROR_KEYS`);
  - `mcp/src/agent-bridge.ts:136-164` (payload returned as it is).
- **Start forwarding:** `mcp-tool-dispatcher.js:3213-3224` sends `source:'mcp'` and never sends a `conversationId`.
- **Terminal producers:**
  - `agent-loop.js`: `createTerminalOutcome`/`applyTerminalOutcome` (`:1498-1545`), `notifySidepanel` (`:1556-1606`, the message fields D-12 reads), `finalizeSession` (`:1644-1676`, broadcast before cleanup), `isAuthWallPartialReason` (`:792-799`);
  - the terminal sites: `:1853`, `:1877`, `:2124` (`end_turn`), `:2479` (`complete_task`), `:2578` (`partial_task`), `:2617` (`fail_task`), `:2911` (meta loop), `:2982`, `:3015` (stuck), `:3123`, `:3136`, `:3166` (API errors);
  - `background.js` stop and teardown broadcasts: `:5037` (service-worker restart), `:5418` (tab closed), `:14501-14522` (`handleStopAutomation`: `cleanupSession` then broadcast);
  - `fsbBroadcastAutomationLifecycle` (`:4732-4760`).
- **Per-call evidence:**
  - `AFTER_TOOL_EXECUTION` is emitted per tool with the full result (`agent-loop.js:2867-2871`);
  - `complete_task`/`partial_task`/`fail_task` return inside the tool loop (`:2509-2510`, `:2610-2611`, `:2647`);
  - `HookPipeline.register` (`hook-pipeline.js:78`);
  - `createSessionHooks` (`background.js:4558-4589`, hash-pinned by 68);
  - `actionHistory` keeps only `{success, hadEffect, error}` (`action-history.js:39-54`; 68 F10);
  - the `_readOnly: true` flags on 19 tools (`tool-definitions.js`).
- **Human gates:**
  - the payment fill confirmation and its declined result (`tool-executor.js:502-582`);
  - `RECIPE_CONSENT_REQUIRED` (`capability-router.js:456-529`; overlay text `overlay-state.js:277`);
  - `PermissionContext.isAllowed` is a stub that always allows (`permission-context.js:56-61`), so permission denials are not a `run_task` human gate today.
- **Breaker:** `checkSafetyBreakers` (`agent-loop.js:257-294`, a 600 s time limit, unchanged).
- **Cleanup:** `cleanupSession` (`background.js:4446-4510`) deletes the map entry and leaves session fields intact.
- **Bench:**
  - `scripts/bench/run-bench.mjs:555-590` (`runAutopilotArm` reads only `status`, `partial_outcome` and `sw_evicted`);
  - `scripts/bench/lib/runs.mjs:224-236` (`classifyAutopilot` scans `json.error`/`json.message` text);
  - `scripts/bench/tasks/core.lock.json` (frozen).
- **Test harnesses:**
  - `tests/run-task-resolve-discipline.test.js` (a vm harness with an `activeSessions` stub and a lifecycle bus);
  - `tests/mcp-bridge-client-lifecycle.test.js:500-570` (settle deep-equals);
  - the 68 harness `tests/fixtures/agent-loop-fast-harness.js` and `tests/fixtures/jev-fake-gateway.js` (68-06, 68-04);
  - the 69 caller harness `tests/mcp-expect-caller.test.mjs` (69-07).

### Established Patterns
- **Service-worker modules are classic scripts.** Each has an IIFE, a `module.exports` guard and one lazily resolved `globalThis` export. `FsbFastPath` is resolved at call time by its callers.
- **Same-context dispatch.** In-worker code observes lifecycle events through `globalThis.fsbAutomationLifecycleBus`, never `chrome.runtime.sendMessage` loopback (Phase 225-01).
- **Producer/validator parity (gotcha 6).** Exact-key lists are shared by producer and consumer tests.
- **Missing values are null, never 0.** Known counts may be 0. Cost and usage always carry a source label.
- **Source-pin discipline.** Every commit bumps its paired pins, and the full chain stays green from the phase's first commit.

### Integration Points and Known Pins
- **`extension/background.js`.**
  - Edits: the helper's MCP branch (D-04); the conditional evidence observer registration in `handleStartAutomation` (D-14).
  - No `importScripts` change, and `createSessionHooks` untouched.
  - Pins: 57 test files; the hash users above; 68's `tests/jev-fast-start-path.test.js` source checks (`68-06-PLAN.md:112`).
- **`extension/ws/mcp-bridge-client.js`.**
  - Edits: the captured session and the settle-time block (D-19).
  - Pins: listed in D-25.
- **`extension/ai/jev-fast-path.js`.**
  - Edits: the budget profiles (D-08), the evidence recorder (D-14), the classifier (D-12/D-13), the goal normaliser (D-22).
  - Pins: the 68-04 and 68-05 grep criteria, `tests/jev-fast-path.test.js` constants, and `tests/jev-extension-boundary.test.js`.
- **`scripts/bench/run-bench.mjs`.** The additive record (D-21). Pins: `tests/bench-drivers.test.mjs`, `tests/bench-identity.test.mjs`.
- **Tests and registration.** The new suites, the inverted 68 suites (D-05), `package.json` and `tests/delegation-phase-contract.test.js:129`.
</code_context>

<specifics>
## Specific Ideas

- **Owner direction:**
  - "With Jev disabled, FSB behaves exactly as it did before this milestone."
  - "The only fast-mode setting is the control-panel Advanced Settings switch ... MCP `run_task` follows it."
  - Every validation is deferred to V1-V6.
  - Jev can only tighten confirmations.
  - Minimal MCP diff.
- **An example switched-on result** (illustrative; final key names are the planner's):

  ```json
  {
    "success": true,
    "sessionId": "session_…",
    "status": "success",
    "result": "Ticked Alpha and Bravo.",
    "fast_mode": {
      "outcome": "ambiguous",
      "reason": "uncertain_action",
      "uncertain_unobserved": true,
      "human_gate": null,
      "budget_profile": "run_task",
      "jev": { "attempts": 3, "calls": 3, "fast_steps": 2, "jev_ms": 910, "calibration": "calibrated",
               "latched": null, "exhausted": null, "escalations": { "uncertain": 1 } }
    }
  }
  ```

  Here the LLM claimed success, but a Jev-chosen click "may have executed" and nothing looked at the page afterwards. So the caller learns to inspect before retrying or reporting done. That case is the SC2 failure this phase exists to prevent.
- **How the community servers compare** (External Research 1).
  - Both use richer status lists that end the call and hand control back to the caller:
    - jev-browser: `done`, `likely_done`, `needs_login`, `needs_confirmation`, `error`, `stuck`/`max_actions`, `ambiguous`, `blocked`;
    - jev-ultrafast-mcp: `done`, `stopped: no progress`, `stopped: hit max_steps`, `turbo_unavailable`, plus per-action refusals.
  - FSB keeps the in-extension LLM as the escalation target (D-06), so it needs only the four contracted values, with the detail in `reason`.
  - Like jev-ultrafast-mcp's rule that "`verify` is checked by code, so when the summary and the page disagree the assertion decides", FSB's `done` requires code-held evidence (D-14). jev-browser's "0 false done" claim is matched by V4's agreement count (D-21) rather than asserted.
- **The background-tab hazard.** MCP `run_task` tabs open in the background by default (Phase 246), and background tabs can drop CDP key and mouse input while FSB reports success. Jev-chosen steps must show an observed effect before `done` (D-14). LLM steps keep baseline semantics. V5 runs one foreground and one background `run_task` (M-70-06).
- **The uncalibrated reality.** Until V3, every switched-on `run_task` makes at most one Jev call, then behaves like baseline, and still returns the `fast_mode` block. Its outcome is then derived purely from task state, which is how SC2 is demonstrated offline.
</specifics>

<deferred>
## Deferred Ideas

- **Validation Block items** (collect them in `70-VALIDATION.md` "Manual-Only Verifications"; IDs are proposals):
  - **M-70-01 (V1):** none. With the switch off, Phase 70 is pre-milestone `run_task`, and the baseline runs at `8a058bdf`. Record an explicit "none".
  - **M-70-02 (V2):** none of its own. Note for the V2 operator: before deploy, a switched-on `run_task` gets a 404, which is `invalid_request`, and latches after one call. After deploy, observe one `run_task` against the `disabled` operator switch and confirm the block shows `latched: 'disabled'` and a task-state outcome.
  - **M-70-03 (V3):** confirm that a calibrated profile makes the `run_task` fast path act on the bench fixtures, and revisit the `run_task` profile numbers together with M-68-04's autopilot numbers.
  - **M-70-04 (V4):** the comparative gate through `run_task` (baseline, then non-Jev control, then fast mode). Report:
    - the `sensitive_goal` count (expected near zero after D-22);
    - the per-task overhead while uncalibrated;
    - budget-exhaustion counts;
    - the typed-outcome agreement table from the D-21 records, where any `done` on a checker-failed run is a gate input;
    - runs longer than 60 s per arm (the Codex and Cursor CLI defaults).
  - **M-70-05 (V5):** a real Claude Code CLI `run_task` with the switch on and the gateway uncalibrated or disabled. At most one attempt, nothing acts, and `fast_mode` is present with a task-state outcome. Codex and Cursor parse the same result.
  - **M-70-06 (V5):** real-page cases:
    - a manual-approval page gives `needs_confirmation`;
    - `stop_task` mid-run gives `blocked` or `ambiguous`;
    - one foreground and one background-tab run (the background-tab hazard);
    - an uncertain target on a re-rendering site escalates once;
    - the owner confirms the 2026-10-16 D-14 amendment (PD-70-01: the page-reading observation set) or names tools to add.
  - **M-70-07 (V6):** release. Phase 70 changes no MCP package file. Its extension changes ride the 1.0.0 version, with nothing pushed before V4's gate and owner approval. The owner also confirms the recorded 2026-10-16 D-17 amendment (the switch-on `fast_mode` result key under MCP-04).
  - **M-70-08 (V6):** the MCP-enable consent review (M-68-12 extended with the Chrome Web Store FAQ language, D-07). It is a release blocker for MCP-started transfers, and each remedy needs an owner decision that amends a requirement.
  - **M-70-09 (V6):** a human check that the deployed card and privacy page wording ("FSB's autopilot") reads as covering MCP-started `run_task` tasks (D-23).
- **Escalation to the MCP caller** (typed early returns with resume state, as jev-browser and jev-ultrafast-mcp do). It needs new arguments or error codes, which are forbidden in this milestone.
- **A typed outcome for switch-off `run_task`.** This would change the wire for every caller, so it needs an owner decision, likely in a later milestone.
- **`fast_mode` in `sw_evicted` results and in `get_task_status`.** Both are built in `mcp/src`.
- **A final read-only completion probe** to promote or demote `done` (`detectCompletionSignals` or the legacy scorer). Revisit after V4 shows the agreement rate.
- **`evaluateExpectation`-based verification for `run_task`.** It needs a caller spec or an LLM-authored predicate.
- **The Jev risk hook and a confirmation card for `run_task`.** Revisit after V3 shows a calibrated risk question (68 `<deferred>`).
- **A cross-session "uncalibrated" memory** for a service-worker lifetime. Revisit only if V4 shows the overhead matters.
- **An elapsed-time cutoff for fast attempts, or adapting to host timeouts.**
- **A side-panel notice when an MCP client turns the switch on.** This is one of the D-07 remedy options and a V6 decision.

### Reviewed Todos (not folded)
None.
</deferred>

---

*Phase: 70-bounded-mcp-fast-task*
*Context gathered: 2026-10-15*
