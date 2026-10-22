# Phase 70: Bounded MCP Fast Task - Research

**Researched:** 2026-10-15
**Domain:** MV3 service-worker `run_task` settle path (extension/ws/mcp-bridge-client.js), the Phase 68 fast loop (`FsbFastPath`), the agent-loop hook pipeline, the MCP success wire (`mapFSBError`), and the bench raw record
**Confidence:** MEDIUM-HIGH. Every FSB code anchor below was read at `e1e6439c` in `the repository root`. Phase 67, 68 and 69 interfaces come from their PLANs because none of their code is in this tree; anything that depends on how they are implemented is MEDIUM until the 70-01 sync re-check (D-24).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Scope, compatibility and validation deferral

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

#### Activation gate and loop mechanics (MCP-03, SC1, SC3)

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

#### Budgets: actions, Jev calls and wall clock (SC1)

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

#### Typed outcome from task state and evidence (SC2, SC3)

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

#### Wire shape and where the result is built (SC2, SC4, MCP-04)

- **D-17 (Auto-Resolved; deviates from the analyzer's recommendation (a)): One additive top-level key, `fast_mode`, holds the typed outcome and the compact fast-mode summary.**
  - **When it appears.** On every settle value of a `run_task` whose session had `fastMode` when it started (complete, error and safety net), even if fast mode latched off immediately or Jev never acted. That keeps SC2 demonstrable under `UNCALIBRATED`. It never appears when the switch was off at start (D-01).
  - **Unchanged keys.** `success` is never flipped, `status` keeps its current values, and no existing key is renamed or reordered. The block is appended last.
  - **Why one nested key instead of a top-level `outcome`.**
    - It is the smallest additive footprint: the key-set diff is exactly `{'fast_mode'}`.
    - It avoids a third meaning of `outcome`, which already names the lifecycle terminal and `sess.outcome`, and appears in `mapFSBError`'s `{"outcome":"unknown"}` trailer (`errors.ts:469`).
    - It follows the snake_case of the existing wire (`partial_outcome`, `sw_evicted`, `expect_result`).
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

#### Goal text and disclosure

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

#### Testing, tripwires and sync re-check

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

### Deferred Ideas (OUT OF SCOPE)

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

#### Reviewed Todos (not folded)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-03 | Existing `run_task` honors the extension's Advanced Settings fast-mode toggle, applies bounded Jev decisions when enabled, and reports done, ambiguous, blocked, or needs-confirmation outcomes without claiming success from Jev's answer alone. | Gate: `fsbFastModeSessionField` is the single widening point and `run_task` never reaches the follow-up path (verified: `mcp-tool-dispatcher.js:3213-3222` sends no `conversationId`). Budgets: profile lookup replaces the flat constant reads in 68-05 steps g, h, q and t. Outcome: settle runs synchronously inside `finalizeSession`, so a classifier at settle sees the full session (F4). Evidence: `AFTER_TOOL_EXECUTION` and `BEFORE_TOOL_EXECUTION` fire per call, before `complete_task` returns, so an observer closes the same-turn gap with no `agent-loop.js` edit (F2, F3). Wire: `{success:true, ...value}` then `JSON.stringify` means one appended key reaches every caller with no MCP change (F9). Findings F1, F5, F6, F7, F13 and F14 change how D-13/D-14/D-22 should be implemented. |
| MCP-04 (guarded, not owned) | Byte-stable MCP wire for existing callers. | Switch-off settle values are untouched, the only new switch-off work is one `activeSessions.get`, and `git diff P70_START -- mcp/` stays empty. Additivity is proven by a key-set diff plus a re-serialization byte check, not a pure line diff (F9). |
</phase_requirements>

## Project Constraints (from the user's global instructions and the task gotchas)

There is no repo `CLAUDE.md`. These directives come from `/Users/lakshman/.claude/CLAUDE.md`, the auto-memory index and the orchestrator's gotcha list, and carry locked-decision authority:

- **No AI attribution** in any commit message, PR body or push (global CLAUDE.md; this overrides the harness attribution reminder).
- **Source-pin tripwires.** Tests pin exact substrings and token counts in extension source, comments included. For example, the word `importScripts` anywhere in `background.js` moves a pin. Grep `tests/` for pins on every file you edit and bump paired pins in the same commit.
- **New test commands** go into both `package.json` `scripts.test` and `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129`) in the same commit. Never edit the `PRE_PHASE6x` hashes.
- **Minimal MCP diff.** No `mcp/src` edit, so the six force-tracked `mcp/build` files are not rebuilt and committed. The in-chain build at `npm test` step 12 must leave `git status -- mcp/` clean.
- **Same-context dispatch** inside the service worker goes through `globalThis.fsbDispatchInternalMessage` or the lifecycle bus, never `chrome.runtime.sendMessage` loopback. Phase 70 adds no in-SW message.
- **CI runs Node 20.** Use no Node 22+ globals, and run every new suite under `npx --offline -y node@20`.
- **Producer/validator parity.** One frozen key list for the block is shared by producer, wire test and bench consumer, with a parity test.
- **Byte-stable MCP wire** for existing callers (MCP-04).
- **Crawler files are never committed.** Restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` after a full run.
- **Jev only tightens.** There are no duplicate side effects, fast mode is default-off, and nothing acts on `UNCALIBRATED` thresholds.
- **Work only in the planning worktree** for planning artifacts. Executors commit in the main tree.

## Summary

Phase 70 is a narrow integration phase, not a new subsystem. Every moving part already exists or is planned upstream: the switch (68-01), the session field helper (68-06), the fast loop with budgets and latches (68-04/68-05), the evidence classifier `classifyStepEvidence` (68-04), the measurement block (68-05/68-09), the secret scrubber (67-01/67-06), and the in-process MCP caller harness (69-01/69-07). Phase 70 widens one helper branch, makes the module's budget reads profile-driven, adds a session-scoped evidence observer, a goal normaliser and a pure classifier to `FsbFastPath`, and appends one `fast_mode` key at the `run_task` settle point in `mcp-bridge-client.js`. The MCP server needs nothing: the bridge already spreads the settle value into `{success:true, ...}`, and `mapFSBError` stringifies success results whole (verified: `mcp-bridge-client.js:1391-1392`, `mcp/src/errors.ts:452-454`).

The code read surfaced several facts that sharpen the locked decisions:
- D-14's literal observation set (all 19 `_readOnly` tools) includes `report_progress`, which would turn `[uncertain click, report_progress, complete_task]` into `done`, the exact SC2 failure (F1).
- The hook context has no call object, so fast and LLM calls cannot be told apart from the event alone (F2).
- Settle runs synchronously inside the agent loop's terminal broadcast, so a throw in the block builder would leave `run_task` hanging (F4).
- No code-held start URL exists on a modern-loop session today (F5).
- D-13's reason list misses reasons the code really produces (F6).
- The payment-decline gate is unreachable from autopilot today (F7).
- The `sw_evicted` lookup reads by `agentId` while the bridge writes by `sessionId` (F8).
- Phase 71's plan expects typed words in `status`, which conflicts with D-17 (F11).

**Primary recommendation:** Implement exactly the D-04/D-08/D-14/D-19 shape. Make the evidence observer an `FsbFastPath`-owned, synchronous set of three handlers (`BEFORE_TOOL_EXECUTION`, `AFTER_TOOL_EXECUTION`, `AFTER_ITERATION`) registered from one background helper only when `session.fastMode` exists. Store its O(1) state in a separate memory-only field. Narrow "observation" to page-reading read-only tools plus a delivered hand-off snapshot, as a recorded tighten-only drift substitution. Build the block inside an isolated try/catch in `settle` that can never prevent `resolve()`.

## Verified Findings That Change or Sharpen the Plan

| # | Finding | Evidence | Planning consequence |
|---|---------|----------|----------------------|
| F1 | **D-14's 19-tool observation set includes tools that never look at the page.** `_readOnly: true` covers wait_for_element, wait_for_stable, read_sheet, capture_screenshot, read_page, get_text, get_attribute, get_dom_snapshot, list_tabs, get_page_snapshot, get_site_guide, search_memory, **report_progress, complete_task, partial_task, fail_task**, stop_trigger, get_trigger_status and list_triggers. `report_progress` reaches `AFTER_TOOL_EXECUTION` (agent-loop.js:2646-2656), so `[click → mayHaveExecuted, report_progress, complete_task]` would count as observed and yield `done`. | [VERIFIED: `node -e` over `tool-definitions.js` TOOL_REGISTRY; agent-loop.js:2646-2656, 2866-2872] | Define observation = a successful call to a tool with `_readOnly === true && (_route === 'content' \|\| _route === 'cdp')`, which gives 9 tools: wait_for_element, wait_for_stable, read_sheet, capture_screenshot, read_page, get_text, get_attribute, get_dom_snapshot and get_page_snapshot. Add a delivered hand-off snapshot. Pin the derived list in a test so a registry change fails loudly. This only moves outcomes from `done` to `ambiguous` (tighten-only). Record it in 70-SYNC-RECHECK "Drift substitutions" as a narrowing of D-14's wording that serves D-14's stated intent. |
| F2 | **The hook context has no call object.** `AFTER_TOOL_EXECUTION` receives `{toolName, toolResult, session, sessionId, iteration}`, and `BEFORE_TOOL_EXECUTION` receives `{toolName, origin:'', session, sessionId, iteration}`. The fast call's `source:'jev'` marker lives only on the call object. | [VERIFIED: agent-loop.js:2291-2297, 2866-2872] [CITED: 68-04-PLAN.md:81] | A fast iteration runs exactly one call (`toolCalls = [_fastStep.toolCall]`, 68-06-PLAN.md:199). Set one marker at act time inside `beforeTurn` step u (for example `session._fastRunEvidence.fastIteration = ctx.iteration`). The recorder compares it with `ctx.iteration`. `iterationCount` restarts per command (68 F14), and `run_task` is a single command, so the marker is unambiguous. Fallback join: a `jevMeasurement.attempts[]` entry with the same command and iteration and a non-null `stepOutcome` (68-05 Task 2). |
| F3 | **The same-turn gap closes from the hook pipeline, with the following edge cases.** `BEFORE_TOOL_EXECUTION` fires for every call, terminal tools included. `complete_task`, `partial_task` and `fail_task` return before their own `AFTER`, but earlier calls in the turn have already emitted `AFTER`. A permission-denied call emits `BEFORE` and never `AFTER` (`continue` at :2323). A malformed-args call emits neither (:2261-2284). The permission hook returns `{shouldStop:false, denied:true}`, so later `BEFORE` handlers still run. | [VERIFIED: agent-loop.js:2255-2335, 2509-2510, 2866-2872; hooks/permission-hook.js:38-51; hook-pipeline.js:78-150] | Recorder: on `BEFORE`, mark `pending = {tool, iteration, seq}` unless the tool is one of the three terminal tools. On `AFTER`, record evidence and clear `pending`. On `AFTER_ITERATION`, clear any leftover `pending`, because the call was denied or skipped and never executed. `pending` at settle then means a call was really in flight, which is D-14(c). A handler returning `undefined` changes nothing in the loop (agent-loop.js:2952-2980 only reads `isStuck`/`shouldStop` results). |
| F4 | **Settle runs synchronously inside the agent loop's terminal broadcast.** `finalizeSession` → `notifySidepanel` → `fsbBroadcastAutomationLifecycle` → `EventTarget.dispatchEvent` → `busCompleteHandler` → `settle`. `settle` sets `settled = true` and clears the 600 s timer before its store write and `resolve(value)`. A throw in between leaves `run_task` unresolved until the MCP server's own 600 s timeout. A block that is not plain JSON data makes `_send`'s `JSON.stringify` throw inside `_handleMessage`'s try, which turns the result into `mcp:error`. | [VERIFIED: agent-loop.js:1556-1606, 1644-1676; background.js:4732-4760; mcp-bridge-client.js:1391-1395, 1308-1311, 2744-2786] | Build the block in its own try/catch that falls back to `{outcome:'ambiguous', reason:'classifier_error', ...}`, and fall back to the unmodified value if even that fails. `resolve()` must be reached on every path. The block holds only primitives, plain objects and closed-vocabulary strings. Test with a throwing `FsbFastPath` stub (a getter that throws) and assert that settle still resolves with `classifier_error`. Also assert `JSON.parse(JSON.stringify(block))` deep-equals the block. Keep the classifier O(1) or O(entries), because it runs on the agent loop's stack. |
| F5 | **No code-held start URL exists on a modern-loop session.** `session.lastKnownUrl` is read (heartbeat; agent-loop.js:411) but never assigned. `urlHistory` and `lastUrl` are written only by the legacy `startAutomationLoop` (background.js:17216-17224). `tabInfo.url` in `handleStartAutomation` is a local. 68-05's `jevFast.firstUrl` is the first fast-attempt menu URL, which comes after the LLM's first turn. | [VERIFIED: grep `lastKnownUrl\s*=` empty; background.js:13860-13963, 17216-17224] [CITED: 68-05-PLAN.md:138] | Seed the D-22(1) start URL from `tabInfo.url`, which holds the post-smart-navigation value, inside the fast-mode-only registration step in `handleStartAutomation`. **Superseded by PD-70-02 (70-VALIDATION.md "Planner decisions"; 70-03, 70-04):** keep only its origin + path, in its own memory-only field `session._fastRunStartPage`, never in the evidence record (which holds no URL, D-14) and never on the wire. The normaliser accepts the current `menu.url` or `session._fastRunStartPage`. |
| F6 | **D-13's closed reason list misses reasons the code produces.** These are `cost_limit_exceeded` (mapSafetyReasonToConstant, agent-loop.js:1686), `session_not_found` and `session_not_running` (guard broadcasts in `runAgentIteration`, :1710-1775), and an `automationError` with no `reason` (content-script-not-ready, background.js:14194). The guard broadcasts can win the race against `user_stopped`: `handleStopAutomation` broadcasts only after `cleanupSession` waits up to 5 s for the loop (background.js:4462-4470, 14501-14522). Partial reasons come from the LLM (`call.args.reason \|\| 'blocked'`, :2516). The schema enum (tool-definitions.js:1213) is not validated at runtime. | [VERIFIED: agent-loop.js:1678-1692, 1710-1775, 2516; background.js:14194-14202] | Add `cost_limit_exceeded`, `session_not_found` and `session_not_running` to the closed `blocked` reasons. Map an `automationError` without a reason to `error`. Map any unlisted partial reason to `other`. Derive the classifier table test by scanning `createTerminalOutcome(` sites, `reason: '…'` literals in lifecycle broadcasts, `STUCK_REASONS` and the partial-reason enum, so a new reason fails the suite (D-20). |
| F7 | **Human-gate reachability.** `fill_payment_method` is not in TOOL_REGISTRY, so `executeTool` returns "Unknown tool" from the agent loop and the decline gate is unreachable for `run_task` today. `invoke_capability` is out-of-registry, runs through the `CAPABILITY_TOOL_NAMES` front door, and is absent from `getPublicTools`. It is reachable only if the LLM calls a tool named in the system prompt (agent-loop.js:766) but not declared. The live `needs_confirmation` source is `partial_task` with reason `manual_approval`. | [VERIFIED: tool-executor.js:840-853; agent-loop.js:708-713, 766; tests/provider-parity.test.js "capability tools absent"; `getToolByName('fill_payment_method') === null`] | Keep all three gates in the classifier (closed vocabulary) and prove them with injected tool results. The consent gate is detected from `toolName === 'invoke_capability' && toolResult.result.code === 'RECIPE_CONSENT_REQUIRED'`. The payment gate is detected from `toolResult.result.declined === true`. Record the reachability honestly in VALIDATION. Do not build a real-run test that expects a payment decline. |
| F8 | **The `sw_evicted` lookup misses in production.** `_handleGetTaskSnapshot` reads `FsbMcpTaskStore.readSnapshot(agentId)` (mcp-bridge-client.js:2953-2962), while every run_task snapshot is written under `sessionId` (:2716-2777). The existing test seeds the record under the agentId key (run-task-resolve-discipline.test.js:437-439). | [VERIFIED: code read; no extension writer keys by agentId] | D-19's "the block reaches the `sw_evicted` lookup's `partial_state`" holds only at store level. Assert that `final_result.fast_mode` is written. Do not assert the end-to-end `sw_evicted` path. Record the keying defect as a deferred item: fixing it changes switch-off behaviour and is out of scope. |
| F9 | **Pure line-diff additivity is false.** `mapFSBError` returns `JSON.stringify(fsbResult, null, 2)` and the bridge sends `{success:true, ...value}`. Appending `fast_mode` last adds a trailing comma to the previous last line, so the switch-on text is not "switch-off text plus added lines". | [VERIFIED: errors.ts:452-454; mcp-bridge-client.js:1391-1392] | Prove D-20's text clause as follows: `Object.keys(on).slice(-1)` is `['fast_mode']`, the key-set diff is exactly `['fast_mode']`, and `JSON.stringify(omit(JSON.parse(onText), 'fast_mode'), null, 2) === offText` byte for byte. Describe this in the plan as the precise form of D-20's "only the block's lines added". |
| F10 | **Bench committed rows have exact keys, and raw records keep `runTask` verbatim.** `RUN_ROW_KEYS` (schema 1, runs.mjs:35-39) is validated by `validateCommittedRow` (:509-511). `toCommittedRow` picks named fields (:437-470). The raw record copies `runTask` as is (run-bench.mjs:769, :811). No test calls `runAutopilotArm` directly; `tests/bench-report.test.mjs` fakes the arm. | [VERIFIED] | Put D-21 on the raw record only, as `runTask.fastMode`, present only when `json.fast_mode` is a plain object and projected through the bench-side frozen key list. Committed rows and the `RUN_ROW_KEYS` pin (`tests/bench-report.test.mjs:76-90`) do not change, and Phase 71 D-08's v2 row owns any committed projection. A new test must call the exported `runAutopilotArm` with fake `deps` (`openTab`, `runTaskTimed`, `getSessionDetailWithRetry`, `now`). |
| F11 | **Phase 71 expects typed words in `status`.** 71-CONTEXT D-09 item 3 says the done/ambiguous/blocked/needs-confirmation words "appear in the `run_task` JSON `status` field, which the bench stores as `claimed.status`". D-17 keeps `status` unchanged (`success`/`partial`/`stopped`/`error`/`completed`) and puts the outcome at `fast_mode.outcome`. | [VERIFIED: 71-CONTEXT.md:146-153; mcp-bridge-client.js:2881-2887] | Do not change `status`, because MCP-04 forbids it. Record in 70-SYNC-RECHECK and in the 70 SUMMARY a "For Phase 71" note: the typed outcome is at `fast_mode.outcome` on the wire and at `runTask.fastMode.outcome` in raw bench records. 71's own D-09 says its plans change before execution if an item differs. |
| F12 | **68-09 pins `jevMeasurement` key paths.** A producer/consumer parity test checks the paths through the logger clone and the dispatcher projection. | [CITED: 68-09-PLAN.md:20-23] | Add no field to `jevMeasurement`. The profile name, evidence and typed outcome live elsewhere: the session field, a separate evidence record and the block computed at settle. Otherwise three hand-mirrored allowlists move. |
| F13 | **The evidence container belongs outside `_fastPath`.** 68-05 creates `_fastPath` lazily inside `beforeTurn` step b with a fixed layout `{off, offReason, offCommand, inFlight, pendingSteps, stopReason, uncertain, recent, lastLlmTools, refEpoch, docEpoch}`. `flushHandoff` returns early when `_fastPath` is absent. A recorder that creates or extends `_fastPath` can pre-empt 68's ensure step or break 68 deep-equals. | [CITED: 68-05-PLAN.md:77, 86, 128] [ASSUMED: the implemented ensure uses `if (!session._fastPath)`] | Use a separate memory-only field, `session._fastRunEvidence`, created at registration. **Layout superseded by PD-70-02 and 70-03-PLAN.md's interfaces block (authoritative):** `{v:1, seq:0, fastIteration:null, pending:null, lastUncertainSeq:0, lastObservationSeq:0, fastUnobservedSeq:0, gate:null}` with `pending` `{tool, iteration, seq}` or null and `gate` `{code, tool, seq, cleared}` or null; no `startUrl` (the start page is `session._fastRunStartPage`) and no `captured` flag. `persistSession` (background.js:4962-4995) and `automationLogger.saveSession` (automation-logger.js:941+) are field allowlists, so a new field is never persisted. |
| F14 | **A delivered hand-off snapshot is the usual observation for fast steps.** Only the 68-05 flush helper (step v) knows whether `requestSnapshot` returned `{success:true, markdownSnapshot}`. Every fast run hands off before the next LLM turn (68 D-10). | [CITED: 68-05-PLAN.md:86, 152] | Add one additive line in the flush helper: when the snapshot was delivered, record `lastObservationSeq = ++seq` in the evidence record, if the record exists. Without it, fast steps' `unconfirmed` (D-14(b)) never resolves unless the LLM calls a read tool, and most switched-on runs read `ambiguous`. Keep 68's flushHandoff tests green: the marker writes only to the separate evidence field. |
| F15 | **Only some bridge harnesses define `activeSessions`.** `tests/mcp-bridge-client-lifecycle.test.js`'s vm context has none. The resolve-discipline and heartbeat harnesses define `activeSessions = new Map()`. | [VERIFIED: tests/run-task-resolve-discipline.test.js:229-248; lifecycle harness grep] | The start capture must reuse `fireHeartbeat`'s guard `(typeof activeSessions !== 'undefined') ? activeSessions : null` (mcp-bridge-client.js:2693-2696). With no map, the capture is `null` and the switch-off goldens stay intact. |
| F16 | **CI builds MCP inside `npm test`.** Chain step 12 is `npm --prefix mcp run build` (304 commands). CI job 1 runs Node 20 `npm test` without a separate build step. `mcp/build/runtime.js` is gitignored and absent in this worktree until built. | [VERIFIED: package.json scripts.test; .github/workflows/ci.yml:22-34] | The in-process caller suite can import `mcp/build/runtime.js` in CI if it is registered after step 12, which is true when appended at the end. Use 69's `assertBuildFresh()`. After any local full run, `git status --porcelain -- mcp/` must print nothing. |
| F17 | **Two 600 s timeouts race.** The server's `sendAndWait` timeout (autopilot.ts:130, 600_000) equals the extension safety net (mcp-bridge-client.js:2800, 600_000). If the server fires first, the caller gets an error and no `fast_mode`. | [VERIFIED] | This is pre-existing and not Phase 70's to change (D-09). Note it in VALIDATION as a V4/V5 context item. Do not write a test that expects the safety-net `fast_mode` to reach a real caller. |
| F18 | **`bfCacheDetected` appears on some LLM navigations.** When the receiving end vanishes, `executeContentTool` returns `{success:true, navigationTriggered:true, result:{bfCacheDetected:true}}` (tool-executor.js:139-151). D-14(a) counts this as uncertain for LLM calls too. | [VERIFIED] | Keep it locked. Record a V4 watch item: the false-`ambiguous` rate when an LLM's navigating click and `complete_task` share a turn. The D-21 agreement table measures it (M-70-04). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read the switch at start and set the session field (SC1) | Service worker: `background.js` `handleStartAutomation` | — | It is the only per-start settings read (background.js:13955-13960). The loop stays source-blind (68 D-05). |
| Budget profile selection and enforcement | Service worker module: `FsbFastPath` (`jev-fast-path.js`) | — | 68-05 already owns the budget checks. The profile is chosen from `session.fastMode.budgetProfile`. |
| Per-call evidence capture | Service worker module: `FsbFastPath` handlers on the session `HookPipeline` | `background.js` (registration helper) | The hook pipeline is the only no-`agent-loop.js` seam that sees calls before a terminal tool returns (F3). |
| Goal normalisation before Jev | `FsbFastPath` (`beforeTurn` step o) | `FsbJevState` (scrubber, 67) | Pure text transform on code-held inputs. It must sit before `buildRequest`'s secret scan. |
| Typed outcome classification (SC2) | `FsbFastPath` pure classifier | — | D-12/D-19: a pure function, statically checked to never read Jev decision fields. |
| Block attach and persistence (SC4) | Service worker: `mcp-bridge-client.js` `_handleStartAutomation` `settle` | `FsbMcpTaskStore` (`chrome.storage.session`) | Settle is the single place every `run_task` ending passes through (D-19, F4). |
| MCP wire delivery | MCP server (unchanged): `agent-bridge.ts` → `mapFSBError` | — | Success payloads are stringified whole (F9). No `mcp/src` edit. |
| V4 agreement data | Bench Node scripts: `run-bench.mjs` raw record | Phase 71 report/gate | Raw records only (F10). The committed row schema belongs to Phase 71 D-08. |

## Standard Stack

### Core (all existing; nothing is installed)

| Module / tool | Version / location | Purpose | Why standard here |
|---------------|--------------------|---------|-------------------|
| `FsbFastPath` (`extension/ai/jev-fast-path.js`) | Created by 68-04/68-05/68-08 | Budgets, `classifyStepEvidence`, `beforeTurn`/`afterStep`, hand-off flush, measurement | Phase 70 adds members only. It is the one place `run_task` logic may live without a new `importScripts` (D-19). |
| `FsbJevState` (`extension/ai/jev-state.js`) | Created by 67-06 | `scrubText`, `matchesSecret`, `toOriginPath`, `buildRequest` | The normaliser's safety conditions (D-22 (2)/(3)) must use the same scrubber the request uses [CITED: 67-06-PLAN.md:24,69,76]. |
| `HookPipeline` (`extension/ai/hook-pipeline.js`) | In tree | `register(event, handler)` and an ordered `emit` with per-handler try/catch | [VERIFIED: hook-pipeline.js:78-150]. Per-session registration needs no edit to `createSessionHooks`. |
| `mcp-bridge-client.js` `_handleStartAutomation` | In tree, :2650-2925 | Settle, store write, lifecycle listeners | [VERIFIED]. This is the single settle point. |
| `@modelcontextprotocol/sdk` | 1.29.0 in `mcp/node_modules` | `Client` plus `InMemoryTransport.createLinkedPair()` for the in-process caller | [VERIFIED: mcp/node_modules/@modelcontextprotocol/sdk/package.json; dist/esm/inMemory.js:11]. Already a dependency. |
| 69 test helper `tests/helpers/mcp-in-process.mjs` | Created by 69-01 | `createInProcessClient({bridge})`, `makeStubBridge`, `makeMockAgentScope`, `assertBuildFresh` | [CITED: 69-01-PLAN.md:144,202; 69-07-PLAN.md:69]. Reuse it; do not build a second harness. |
| 68 loop harness `tests/fixtures/agent-loop-fast-harness.js` and fake gateway `tests/fixtures/jev-fake-gateway.js` | Created by 68-06/68-04 | Drive `runAgentIteration` with a real `HookPipeline` and a fake calibrated gateway | [CITED: 68-06-PLAN.md:160; 68-04-PLAN.md:111]. Extend it with an option to register the Phase 70 observer through the same `FsbFastPath` API the background helper calls. |
| `scripts/bench/sweep-tests.mjs` | In tree | Runs every test that references the edited files, with `--baseline` | [VERIFIED: exists; usage at :31-40]. |
| Node | 24.14.1 locally; 20.20.2 via `npx --offline -y node@20`; CI uses 20 | Test runtime | [VERIFIED] |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Hook-pipeline observer (D-14) | Reading `session.actionHistory` | Rejected: it holds only `{success, hadEffect, error}` [VERIFIED: action-history.js:39-54]. It cannot see `outcome:'unknown'` or `mayHaveExecuted`. |
| Hook-pipeline observer | Extending 68's `observeTools` | Rejected: it never runs for a turn that ends in `complete_task` (agent-loop.js:2509-2510), which is the same-turn gap. |
| Separate evidence field | Inside `session._fastPath` | Rejected (F13): it can pre-empt 68's lazy ensure step and break 68's state deep-equals. |
| Fast-iteration marker | Joining on `jevMeasurement.attempts[].stepOutcome` | The join works only after `afterStep` runs. A stop mid-step leaves no `stepOutcome`, but D-14(c) `pending` covers that case. Use the marker as primary and the join as a sync-recheck fallback. |
| A bench mirror of the key list | Importing the extension module from bench ESM | Rejected: it couples the bench to extension load order. Use the mirror plus a parity test, the established gotcha-6 pattern. |

**Installation:** none.

## Package Legitimacy Audit

This phase installs no external package. Every dependency it uses is already in the tree: `@modelcontextprotocol/sdk` 1.29.0 under `mcp/node_modules`, and Node built-ins. slopcheck was not run because there is nothing to vet.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
MCP caller (Claude Code / Codex / Cursor)
   │ tools/call run_task {task}          (unchanged: no new arg, no new tool)
   ▼
mcp/src run_task ──sendAgentScopedBridgeMessage──► extension bridge _handleStartAutomation
                                                      │ dispatch mcp:start-automation {task, tabId, source:'mcp', agentId}
                                                      ▼
                                   background handleStartAutomation
                                     ├─ agent-provider early return (unchanged, first)
                                     ├─ settings read incl. fsbJevFastModeEnabled (68-06)
                                     ├─ fsbFastModeSessionField(stored, 'mcp')
                                     │     off/absent → null → NO field ──────────────► baseline path (D-01)
                                     │     true → {enabled, stored, source:'mcp', budgetProfile:'run_task'}
                                     ├─ activeSessions.set → sendResponse({sessionId})
                                     ├─ [field only] register evidence handlers + seed session._fastRunStartPage from tabInfo.url (PD-70-02)
                                     └─ runAgentLoop(hooks = createSessionHooks + Phase 70 handlers)
   bridge: response.sessionId → activeSessions.get once → keep ref only if session.fastMode
                                                      │
          ┌───────────────────── each iteration (runAgentIteration) ─────────────────────┐
          │ seam 1 FsbFastPath.beforeTurn: profile budgets → normalise goal → 1 menu →   │
          │   1 decide → act? ── yes ─► mark fastIteration; toolCalls=[fast call]         │
          │                     └ no ─► flush hand-off (marks observation if snapshot) → LLM turn │
          │ tool loop per call: BEFORE_TOOL_EXECUTION (pending) → execute → AFTER_TOOL_EXECUTION │
          │   (classifyStepEvidence → uncertain / observation / gate / fast-unobserved)  │
          │ AFTER_ITERATION (clear denied/skipped pending)                                │
          └───────────────────────────────────────────────────────────────────────────────┘
                                                      │ terminal: LLM complete/partial/fail/end_turn,
                                                      │ breakers, stop, tab close, guard broadcast
                                                      ▼
                     lifecycle bus (synchronous) → bridge settle(value, source, message)
                        ├─ ref null → value unchanged (byte-identical)
                        └─ ref set → try { block = FsbFastPath.buildFastModeBlock(...) } catch → classifier_error
                                     value' = {...value, fast_mode: block}   (appended last)
                        → FsbMcpTaskStore final_result (value') → resolve(value')
   bridge sends {success:true, ...value'} → mapFSBError JSON.stringify → caller parses fast_mode
   bench runAutopilotArm: json.fast_mode (plain object) → raw record runTask.fastMode (projected keys)
```

### Recommended Project Structure (files touched)

```
extension/background.js           # helper MCP branch (D-04); fsbRegisterFastRunEvidence(pipeline, session, startUrl) top-level helper; one guarded call before runAgentLoop
extension/ai/jev-fast-path.js     # BUDGET_PROFILES + profile lookup; evidence handlers; fastIteration marker (beforeTurn step u);
                                  # hand-off observation marker (flush step v); normaliseGoal; classifyRunTaskOutcome; buildFastModeBlock; frozen key/vocabulary lists
extension/ws/mcp-bridge-client.js # start capture (guarded activeSessions.get); settle(value, source, message) block attach
scripts/bench/run-bench.mjs       # runAutopilotArm: runTask.fastMode (raw record only) via projectFastMode from the new scripts/bench/lib/fast-mode.mjs, the fixed home of the bench-side frozen key mirror (Open Question 5 RESOLVED; 70-07-02)
tests/jev-run-task-upstream-contract.test.js   # 70-01 tripwire
tests/fixtures/run-task-wire-golden.json       # pre-edit switch-off settle values + mapFSBError text (captured in 70-01)
tests/jev-fast-start-path.test.js / tests/jev-fast-loop.test.js / 68-08 capture cases   # D-05 inversions (edit, never delete)
tests/jev-fast-path.test.js       # run_task profile pins, recorder, normaliser, classifier unit cases (or a new suite, see below)
tests/jev-run-task-outcome.test.js         # exhaustive classifier table + static slice checks
tests/run-task-fast-mode-wire.test.js      # bridge harness goldens, key-set, re-serialization byte check, throwing-classifier case
tests/mcp-run-task-fast-caller.test.mjs    # in-process SDK caller (node --test)
tests/bench-fast-mode-record.test.mjs      # runAutopilotArm projection + parity with the extension key list (node --test)
tests/jev-run-task-disclosure.test.js      # D-23 re-verify against the 68-12 fact fixture
.planning/phases/70-bounded-mcp-fast-task/70-SYNC-RECHECK.md, 70-SWEEP-BASELINE.json, 70-VALIDATION.md
```

### Pattern 1: Widen one helper branch; budgets come from a named profile

**What:** `fsbFastModeSessionField(true, 'mcp')` returns an enabled field with `budgetProfile:'run_task'`. The module resolves budgets by profile name and never reads `source`.
**When to use:** It is the only activation change (D-04, D-08).
```javascript
// background.js (sketch; 68-06 owns the function; Phase 70 changes only the MCP branch)
function fsbFastModeSessionField(storedValue, source) {
  if (storedValue !== true) return null;                       // false, absent, 'true' -> no field (D-01)
  if (source === 'mcp') {
    return { enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' };
  }
  return { enabled: true, stored: true, source: source || null }; // byte-identical to 68 for non-MCP
}

// jev-fast-path.js (sketch; names are the planner's; no JEV_ prefix, no https literal)
var BUDGET_PROFILES = Object.freeze({
  autopilot: Object.freeze({ maxSteps: 12, maxCalls: 16, wallBudgetMs: 20000, maxConsecutive: 3, escalationLatch: 3 }),
  run_task:  Object.freeze({ maxSteps: 12, maxCalls: 16, wallBudgetMs: 20000, maxConsecutive: 3, escalationLatch: 3 })
});
function budgetsFor(session) {
  var name = session && session.fastMode && session.fastMode.budgetProfile;
  return (typeof name === 'string' && Object.prototype.hasOwnProperty.call(BUDGET_PROFILES, name))
    ? BUDGET_PROFILES[name] : BUDGET_PROFILES.autopilot;      // unknown/absent -> autopilot (D-08)
}
```
Every 68-05 read of `FAST_MAX_STEPS`, `FAST_MAX_CALLS`, `FAST_WALL_BUDGET_MS`, `FAST_MAX_CONSECUTIVE` and `FAST_ESCALATION_LATCH` (steps g, h, q and t) becomes a read of `budgetsFor(session)`. The autopilot profile's values must equal the 68 constants: assert `BUDGET_PROFILES.autopilot.maxSteps === constants.FAST_MAX_STEPS` and so on. If 68's tests deep-equal the key set of `constants`, export `BUDGET_PROFILES` as a sibling instead of nesting it (Assumption A2).

### Pattern 2: An O(1) evidence state machine on three hook events

**What:** Synchronous handlers created by `FsbFastPath` and registered from one background helper. They record only names, iterations, sequence counters and gate codes. **Superseded draft, corrected below; 70-03-PLAN.md's interfaces block and behavior list win wherever anything here differs.** The first draft held `startUrl` inside the record (superseded by PD-70-02: the start page lives only in `session._fastRunStartPage`, origin + path) and returned early from `onBeforeTool` for terminal tools without clearing `pending` (superseded by 70-03's beforeTool rule: always clear `pending` first, then set it only for a non-terminal tool, so `[denied click, complete_task]` leaves nothing in flight; 70-03 case "denied call not pending").
```javascript
// jev-fast-path.js (sketch)
var TERMINAL_TOOLS = { complete_task: 1, partial_task: 1, fail_task: 1 };
function createRunEvidence() {                 // no URL in the record; the start page is session._fastRunStartPage (PD-70-02)
  return { v: 1, seq: 0, fastIteration: null, pending: null /* {tool, iteration, seq} */,
           lastUncertainSeq: 0, lastObservationSeq: 0, fastUnobservedSeq: 0,
           gate: null /* {code, tool, seq, cleared} */ };
}
function onBeforeTool(ev, ctx) {               // BEFORE_TOOL_EXECUTION
  if (!ev) return; ev.pending = null;          // always clear first: calls run in sequence (70-03)
  if (!TERMINAL_TOOLS[ctx.toolName]) ev.pending = { tool: ctx.toolName, iteration: ctx.iteration, seq: ++ev.seq };
}
function onAfterTool(ev, ctx, isObservationTool) {   // AFTER_TOOL_EXECUTION
  if (!ev) return;
  var seq = ++ev.seq; ev.pending = null;
  var r = ctx.toolResult || {};
  var cls = classifyStepEvidence(ctx.toolName, r).outcome;   // 68-04, nested result.result
  var isFast = ev.fastIteration !== null && ev.fastIteration === ctx.iteration;
  if (cls === 'uncertain') ev.lastUncertainSeq = seq;                        // D-14(a), fast and LLM
  if (isFast && (cls === 'unconfirmed' || cls === 'uncertain' || cls === 'no_effect')) ev.fastUnobservedSeq = seq; // D-14(b)
  if (r.success === true && !isFast && isObservationTool(ctx.toolName)) ev.lastObservationSeq = seq; // F1
  // gates (D-15): fill_payment_method declined / invoke_capability RECIPE_CONSENT_REQUIRED set ev.gate {code, tool, seq, cleared:false}; a later success of gate.tool clears it
}
function onAfterIteration(ev) { if (ev) ev.pending = null; }   // denied/skipped calls never executed (F3)
// unresolved uncertainty at settle:
//   pending !== null  ||  max(lastUncertainSeq, fastUnobservedSeq) > lastObservationSeq
```
Planning outcome (70-03 Task 1; 70-PATTERNS.md Analog C): `isObservationTool` is the module's own `isPageObservationTool` (`_readOnly === true` and route `content` or `cdp`), resolved through 68-08's lazy `TOOL_REGISTRY` lookup in `jev-fast-path.js` (`68-08-PLAN.md:115`), which reads the service-worker global or requires `tool-definitions.js` only when called, never at load; the 9-tool list is pinned in a test. The first draft of this pattern derived the predicate in the background helper and passed it in. `classifyStepEvidence` never reads `hadEffect`, which keeps the 68-04 grep criterion.

### Pattern 3: Settle attaches the block in isolation

```javascript
// mcp-bridge-client.js inside _handleStartAutomation (sketch)
const sessionsForCapture = (typeof activeSessions !== 'undefined') ? activeSessions : null;
const capturedSession = (sessionsForCapture && typeof sessionsForCapture.get === 'function')
  ? sessionsForCapture.get(sessionId) : null;
let fastSession = (capturedSession && capturedSession.fastMode) ? capturedSession : null;  // switch off -> null

const settle = (value, source, terminalMessage) => {
  if (settled) return;
  settled = true;
  // ... existing timer/listener teardown unchanged ...
  let finalValue = value;
  if (fastSession) {
    const sessionRef = fastSession; fastSession = null;          // release at settle (D-19)
    try {
      const api = (typeof globalThis !== 'undefined') ? globalThis.FsbFastPath : null;
      const block = (api && typeof api.buildFastModeBlock === 'function')
        ? api.buildFastModeBlock(sessionRef, { source, message: terminalMessage || null })
        : { outcome: 'ambiguous', reason: 'classifier_error' /* + safe summary per D-19 */ };
      finalValue = Object.assign({}, value, { fast_mode: block });   // appended last
    } catch (_e) {
      try { finalValue = Object.assign({}, value, { fast_mode: { outcome: 'ambiguous', reason: 'classifier_error' } }); }
      catch (_e2) { finalValue = value; }
    }
  }
  // ... existing FsbMcpTaskStore write uses finalValue as final_result ...
  // ... existing log ...
  resolve(finalValue);
};
// handleComplete/handleError pass `message` as the third argument; the safety net passes none.
```
Keep every new identifier free of the `delegation-phase-contract` audit patterns, such as `spawn(` and `fork(` (tests/delegation-phase-contract.test.js:2705-2720), and of `this._eventTail`.

### Pattern 4: Classifier precedence (D-13 with the F6 additions)

```javascript
// jev-fast-path.js (sketch): reads ONLY settle source, terminal message fields, evidence record, jevMeasurement/_fastPath/jevFast counters
function classifyRunTaskOutcome(input) {
  // 1 classifier_error is handled by the caller's catch
  if (input.source === 'safety_net_600s') return out('ambiguous', 'safety_net_timeout');
  var m = input.message || {}; var ev = input.evidence;
  var terminal = m.outcome || (input.isError ? 'error' : null);       // 'success'|'partial'|'stopped'|'error'
  var success = terminal === 'success';
  if (terminal === 'partial' && m.reason === 'manual_approval') return out('needs_confirmation', 'manual_approval');
  if (!success && ev && ev.gate && !ev.gate.cleared) return out('needs_confirmation', ev.gate.code);
  if (ev && unresolved(ev)) return out('ambiguous', 'uncertain_action');
  if (success) return ev ? out('done', successReason(m.reason)) : out('ambiguous', 'evidence_unavailable');
  return out('blocked', blockedReason(terminal, m.reason));            // closed list incl. F6 additions; unknown -> 'other'
}
```
Run a static slice check over this function and its helpers: no `decisions`, `meetsThreshold`, `threshold`, `probabilities`, `task`, `label`, `url` or `title` token.

### Pattern 5: Goal normaliser (D-22)

```javascript
// jev-fast-path.js (sketch). Never write the literal scheme-plus-slashes string; use the escaped form.
var OPEN_SENTENCE = /^Open (https?:\/\/\S+)\.(?=\s|$)/;   // greedy \S+ backtracks one char to the sentence dot
function normaliseGoal(task, pageUrls) {
  if (typeof task !== 'string') return task;
  var m = OPEN_SENTENCE.exec(task); if (!m) return task;
  var S = resolveJevState(); if (!S || typeof S.scrubText !== 'function' || typeof S.matchesSecret !== 'function') return task;
  var u; try { u = new URL(m[1]); } catch (_e) { return task; }
  var key = u.origin + u.pathname;
  var matchesPage = (pageUrls || []).some(function (p) { try { var q = new URL(p); return q.origin + q.pathname === key; } catch (_e) { return false; } });
  if (!matchesPage) return task;                                                     // (1)
  if (!u.pathname.split('/').every(function (seg) { return S.scrubText(seg) === seg; })) return task;  // (2)
  if (S.matchesSecret(u.search + u.hash)) return task;                               // (3)
  var rest = task.slice(m[0].length).replace(/^\s+/, '');                            // suffix of task; matches the exporter's trim for bench texts
  return rest.length > 0 ? rest : task;                                              // never send an empty goal
}
```
Call it in `beforeTurn` step o with `[menu.url, session._fastRunStartPage]` (PD-70-02; 70-04; the evidence record holds no URL). All 12 core tasks start with `Open {startUrl}. ` [VERIFIED: scripts/bench/tasks/core/*.json], so the "equals the 68-08 exporter goal" test covers the whole corpus. Run it with the current token shape (`randomBytes(16).toString('base64url')`) and with 71 D-07's candidate shape (24 lowercase letters).

### Anti-Patterns to Avoid

- **Setting `success:false` or `isError` for `blocked`/`ambiguous`.** The error branch of `mapFSBError` drops the block (D-03).
- **Changing `status` to typed words.** It breaks MCP-04, the bench's `claimed.status` and the `runs.mjs` classification (F11).
- **Registering the observer inside `createSessionHooks`.** That function is hash-pinned and identical for switch-off sessions (D-01, D-04).
- **Reading `source` in `FsbFastPath`.** Use `budgetProfile` only (68 D-05, D-08).
- **Adding fields to `jevMeasurement` or `_fastPath`** (F12, F13).
- **Deleting the 68 "run_task never fast" tests** instead of inverting them (D-05).
- **Hand-writing the switch-off golden.** Capture it from the real code before any Phase 70 edit (D-20).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Uncertain/unknown/bfCache detection | New checks on `outcome`/`mayHaveExecuted` | `FsbFastPath.classifyStepEvidence(op, toolResult)` (68-04) | One definition of "uncertain" for the fast path and the outcome. Its `hadEffect` ban is already tested. |
| Secret detection in the Open URL and goal | New regexes | `FsbJevState.scrubText` / `matchesSecret` (67-06 mirror of 67-01) | They are corpus-tested and server-parity-tested, and `buildRequest` uses them too. |
| URL comparison | String slicing | `new URL()`, comparing `origin + pathname` | This handles default ports, host case and trailing segments. Query and fragment drop out naturally. |
| Fallback classes in the `escalations` tally | A new mapping | `classifyFallback` / `CONTRACT.FALLBACK_REASONS` and 68-05's command totals | They are closed and iterated in tests. A new reason fails the suite. |
| Observing tool calls | Edits to the agent-loop tool loop | `HookPipeline.register` on the session pipeline | It keeps `agent-loop.js`'s token, schedule and stepName pins untouched. |
| An MCP caller harness | A WebSocket server or port | 69's `createInProcessClient({bridge})` over `InMemoryTransport` | No ports (7225/7226 are forbidden), and it is already proven in 69-07. |
| Extracting background functions for vm tests | Requiring background.js | The brace-matching extractor (tests/ownership-leakage-regression.test.js:20-44; used by 68-06) | `background.js` cannot load under Node. |
| Finding affected pin suites | A manual grep only | `node scripts/bench/sweep-tests.mjs --files … --baseline 70-SWEEP-BASELINE.json` | It catches the 57 `background.js` readers automatically. |

**Key insight:** Every judgement Phase 70 needs already has one canonical implementation upstream. Phase 70's value is wiring it at the right seams, and correctness depends on seam choice (F2, F3, F4), not on new logic.

## Common Pitfalls

### Pitfall 1: A throwing block builder hangs `run_task`
**What goes wrong:** `settle` has already set `settled = true` and cleared the safety net when the classifier throws, so `resolve` never runs. The caller waits for the server's 600 s timeout.
**Why it happens:** Settle runs synchronously on the lifecycle bus inside `finalizeSession` (F4).
**How to avoid:** Use a nested try/catch with a `classifier_error` fallback and an unmodified-value last resort. Test with a getter-throwing `FsbFastPath` and a block holding a cyclic object, and assert that `resolve` is reached and the result is JSON-serializable.
**Warning signs:** A bridge harness case times out instead of resolving, or Node's `EventTarget` reports an uncaught listener error.

### Pitfall 2: `report_progress` counts as an observation
**What goes wrong:** An uncertain click, then `report_progress`, then `complete_task` reads as `done` (F1).
**How to avoid:** Use the page-reading read-only set (9 tools) and pin it.
**Warning signs:** The SC2 harness case "uncertain click + report_progress + complete_task" passes as `done`.

### Pitfall 3: No hand-off observation marker, so false `ambiguous`
**What goes wrong:** Every fast run whose LLM finishes without a read tool reads `ambiguous` (F14).
**How to avoid:** Add the marker in the 68-05 flush helper only when `requestSnapshot` returned `success:true`. Cover both cases with tests: delivered gives `done`, and "Snapshot unavailable" gives `ambiguous`.

### Pitfall 4: Denied calls look like in-flight calls
**What goes wrong:** A permission-denied call emits `BEFORE` without `AFTER`. A naive `pending` flag would mark the run `ambiguous` forever (F3).
**How to avoid:** Clear `pending` on the next `BEFORE` and on `AFTER_ITERATION`. Test with 68-06's PermissionContext-deny harness option.

### Pitfall 5: The text-diff additivity test fails on a trailing comma
**What goes wrong:** Asserting "switch-off lines are a prefix of switch-on lines" fails on `"result": …,` (F9).
**How to avoid:** Use the re-serialization byte check, the key-set diff and the last-key check.

### Pitfall 6: The reason vocabulary misses real reasons
**What goes wrong:** A stop that races into `session_not_running`, or a `cost_limit_exceeded` breaker, maps to `other`, and the "derived from code" table test does not catch it unless the scan includes the guard broadcasts (F6).
**How to avoid:** The scan covers `createTerminalOutcome(` sites, `reason: '<literal>'` in every `fsbBroadcastAutomationLifecycle` message reachable from `handleStartAutomation`/`runAgentLoop`, `mapSafetyReasonToConstant`'s outputs, `STUCK_REASONS` and the partial-reason enum. Legacy `startAutomationLoop` and replay broadcasts are unreachable from `run_task` and are excluded with a comment.

### Pitfall 7: Normaliser edge cases
**What goes wrong:**
- trimming both ends breaks the suffix property;
- an empty remainder returns `invalid_request` and a session latch;
- writing the literal scheme-plus-slashes string in a comment trips the 67-11 ban;
- names like `JEV_*` trip the `\bJEV_[A-Z_]+\b` scan.

**How to avoid:**
- use `trimStart` semantics;
- return the original task when the remainder is empty;
- write the pattern as `https?:\/\/` and keep the literal out of comments;
- use `FAST_*`/`RUN_*` names.

### Pitfall 8: Breaking 68's pinned contracts
**What goes wrong:** Adding keys to `jevMeasurement` (68-09 parity), or nesting `BUDGET_PROFILES` in a `constants` object whose key set is pinned, breaks Phase 68's tests.
**How to avoid:** 70-01 records the real pins. Prefer sibling exports and separate fields.

### Pitfall 9: A bench schema change breaks V1 comparability
**What goes wrong:** Adding a key to `RUN_ROW_KEYS` or `claimed` fails `validateCommittedRow`, moves the `tests/bench-report.test.mjs:76-90` pin, and collides with Phase 71 D-08.
**How to avoid:** Write to the raw record only (`runTask.fastMode`).

### Pitfall 10: Out-of-chain suites are forgotten
**What goes wrong:** `tests/mcp-tool-smoke.test.js` (the `mcp:start-automation` payload pin, `:327-332`) runs only in `npm run test:mcp-smoke`, a CI-only job, not in `npm test`.
**How to avoid:** The phase gate runs `npm run test:mcp-smoke` explicitly. Also run `npm run validate:extension`.

### Pitfall 11: Phase 71 is planned against a different wire
**What goes wrong:** 71 reads typed words from `claimed.status` (F11).
**How to avoid:** Write a "For Phase 71" handoff note in 70-SYNC-RECHECK and the SUMMARY.

### Pitfall 12: Port and crawler hygiene
Run no test that binds 7225/7226. After `npm test`, restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` and confirm `git status --porcelain -- mcp/` is empty.

## Code Examples

### Wire additivity check (SC4, F9)
```javascript
// tests/run-task-fast-mode-wire.test.js (sketch)
const off = await runSettlePath({ fastMode: null });          // golden captured pre-edit
const on  = await runSettlePath({ fastMode: { enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' } });
const offWire = { success: true, ...off }, onWire = { success: true, ...on };
assert.deepStrictEqual(Object.keys(onWire).filter(k => !(k in offWire)), ['fast_mode']);
assert.strictEqual(Object.keys(onWire).at(-1), 'fast_mode');   // Array.prototype.at exists in Node 16.6+, fine on 20
const { fast_mode, ...rest } = JSON.parse(JSON.stringify(onWire, null, 2));
assert.strictEqual(JSON.stringify(rest, null, 2), JSON.stringify(offWire, null, 2));  // byte-identical once removed
assert.strictEqual(JSON.stringify(offWire, null, 2), GOLDEN.mapFsbErrorText[pathName]);
```

### Bench raw-record projection (D-21, F10)
```javascript
// scripts/bench/run-bench.mjs inside runAutopilotArm (sketch)
const runTask = {
  isError: …, status: …, partialOutcome: …, swEvicted: …, sessionIdSource: …,   // unchanged keys, unchanged order
};
if (json && isPlainObject(json.fast_mode)) runTask.fastMode = projectFastMode(json.fast_mode); // exact keys, closed vocab, no strings > 40 chars
```

### Registration helper (D-14, F5)
```javascript
// background.js (sketch; top-level, name-unique, comments never contain the word importScripts)
function fsbRegisterFastRunEvidence(pipeline, session, startUrl) {
  try {
    const api = (typeof globalThis !== 'undefined') ? globalThis.FsbFastPath : null;
    if (!session || !session.fastMode || !api || typeof api.createRunEvidenceHandlers !== 'function') return false;
    const handlers = api.createRunEvidenceHandlers(session, { startUrl });   // the observation predicate lives in the module (70-03)
    pipeline.register(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, handlers.beforeTool);
    pipeline.register(LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, handlers.afterTool);
    pipeline.register(LIFECYCLE_EVENTS.AFTER_ITERATION, handlers.afterIteration);
    return true;
  } catch (_e) { return false; }   // classifier later reports evidence_unavailable / uncertain_unobserved:null
}
// in handleStartAutomation, between `const sessionHooks = createSessionHooks(sessionId);` and `runAgentLoop(`:
//   if (sessionData.fastMode) fsbRegisterFastRunEvidence(sessionHooks, sessionData, tabInfo && tabInfo.url);
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| `run_task` excluded from fast mode (68 D-03/D-05, T-68-16) | `run_task` follows the one switch with its own named profile (D-04/D-08) | Phase 70 | The 68 tests are inverted, and the superseded truths are recorded in VALIDATION |
| Caller escalation via new args and errors (ARCHITECTURE.md §5) | In-extension LLM escalation, outcome reported additively (D-06) | 70-CONTEXT | No `mcp/src` diff |
| Community servers end the call with richer statuses (jev-browser, jev-ultrafast-mcp) | Four values plus a `reason`. "Done" requires code-held evidence; the LLM remains the escalation target | 70-CONTEXT External Research 1 | V4 measures false-done instead of asserting it |

**Deprecated/outdated:**
- `68-CONTEXT.md:68-71` "`run_task` stays on today's path" and T-68-16 (`68-06-PLAN.md:242`) are superseded by D-04/D-05.
- `67-CONTEXT.md:478` "Phase 70 maps the fallbacks to `run_task` outcomes" is realised as reporting (D-16).

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | 68's implemented layouts match the 68-04/68-05 plan text: `_fastPath` fields, `jevFast.latched`/`firstUrl`, attempts carrying `command`/`iteration`/`stepOutcome`/`calibrationStatus`, per-command `{fastSteps, jevCalls, jevMs, escalations}` | Patterns 1-4, F2, F13, D-18 summary | Summary fields or the fallback join need different paths. 70-01 records RENAMED/CHANGED and Drift substitutions. |
| A2 | 68's tests do not deep-equal the key set of `FsbFastPath.constants` or the export list | Pattern 1 | Nesting `BUDGET_PROFILES` in `constants` breaks a 68 pin. Use a sibling export. |
| A3 | 68-05's ensure step uses a guarded lazy create of `_fastPath` | F13 | Low if the evidence lives in a separate field as recommended. |
| A4 | 69's `makeMockAgentScope` covers the AgentScope methods `run_task` touches; most calls in `agent-bridge.ts` are `typeof`-guarded | Standard Stack | The Phase 70 caller test adds the missing mock methods locally. It never edits 69's helper semantics. |
| A5 | The 67 per-segment `scrubText` leaves a 22-char base64url bench token unredacted, so D-22(2) passes for the bench | Pattern 5 | Taken from 68-RESEARCH F5 [VERIFIED there], not re-verifiable here. If the token is redacted, the normaliser declines, `sensitive_goal` persists and V4 measures nothing. 71 D-07's token change is the backstop. |
| A6 | Providers rarely emit a call to an undeclared `invoke_capability` | F7 | The consent gate's real reachability is low either way. The classifier covers it. |
| A7 | Content-route fast ops (all except `go_back`, which is background-route; verified) work in background tabs because they are DOM-level | Specifics (background-tab hazard) | V5 M-70-06 runs foreground and background tabs. |
| A8 | Host timeout facts (Codex 60 s, Cursor CLI/ACP 60 s, Claude Code roughly 28 h and a 30 min stdio idle) | D-09 context | Cited from 70-DISCUSSION-LOG External Research 3 (fetched 2026-10-15) and not re-fetched. They only inform V4/V5 notes. |

## Open Questions (RESOLVED)

All five questions were resolved during planning by adopting the recommendation (question 5 takes the fallback location). Each resolution names the plan task that implements it.

1. **Narrowing D-14's observation set (F1).**
   - What we know: the literal 19-tool set includes `report_progress` and other tools that never look at the page.
   - What's unclear: whether the planner may record a tighten-only narrowing of a locked decision's wording.
   - Recommendation: record it as a Drift substitution with this justification: D-14's own SC2 example fails under the literal set, and the narrowing only moves `done` to `ambiguous`. Flag it in the plan's truths.
   - **RESOLVED:** adopted as an explicit planner decision, PD-70-01 (70-VALIDATION.md "Planner decisions"; stated in 70-03-PLAN.md's context and truths). Observation = a successful call of a `_readOnly === true` tool with `_route` 'content' or 'cdp' (9 tools, pinned by 70-03-01) or a delivered hand-off snapshot. It is tighten-only (it can move `done` to `ambiguous`, never the reverse), it is also listed in 70-SYNC-RECHECK item t, and V4 measures its false-`ambiguous` rate (M-70-04). The orchestrator accepted it on 2026-10-16 under the owner's deferral direction and 70-CONTEXT.md records it as a D-14 amendment; the owner confirms it at V5 (M-70-06) and can widen the set then by naming tools.
2. **Phase 71 D-09 item 3 (F11).**
   - What we know: 71 expects typed words in `status`, and D-17 forbids changing `status`.
   - Recommendation: Phase 70 keeps D-17, and the 70 SUMMARY includes a "For Phase 71" section naming `fast_mode.outcome` and `runTask.fastMode.outcome`.
   - **RESOLVED:** adopted. `status` is unchanged (70-06-01 additivity checks); the note is in 70-SYNC-RECHECK item u (70-01-02), the 70-07 SUMMARY and the 70-08 SUMMARY's "For Phase 71" section.
3. **The disclosure fact "if your task text itself contains one, nothing is sent for that task" under D-22.**
   - What we know: a bench-shaped goal matches the whole-goal high-entropy rule only through its Open URL. After normalisation the request is sent, and the URL travels per segment through FSB's address rule.
   - What's unclear: whether "your task text" in the card means the raw text or the text FSB would send.
   - Recommendation: the D-23 test asserts the precise semantics. Secrets are judged on the normalised goal, the URL by the address rule (per segment plus query/fragment), and a secret anywhere outside a page-matching Open sentence still sends nothing. If the test cannot express the copy truthfully under that reading, D-23's stop-and-raise path applies. Add the wording question to M-70-09.
   - **RESOLVED:** adopted. 70-04-02's "secret still sends nothing" check asserts this reading, and M-70-09 (V6) carries the wording question.
4. **Recording evidence for non-MCP fast-mode sessions.**
   - What we know: D-14 says "every fast-mode session". Only `run_task` consumes the block.
   - Recommendation: register for every fast-mode new-session start. It is cheap, source-blind and memory-only. Do not register on the follow-up path (`reactivationHooks`), which `run_task` never uses, and record that the record covers the first command only.
   - **RESOLVED:** adopted. 70-03-02 adds the one guarded registration line on the new-session path only, and a source check forbids it on `reactivationHooks`. 70-VALIDATION.md "Evidence coverage" records the first-command scope.
5. **Where the bench key mirror lives.**
   - Original recommendation (superseded by the resolution below): keep it inside `run-bench.mjs` or `scripts/bench/lib/runs.mjs` after grepping `tests/bench-*.mjs` for file-list or export pins. If neither is safe, use a new `scripts/bench/lib/fast-mode.mjs`.
   - **RESOLVED:** the fallback, a new `scripts/bench/lib/fast-mode.mjs` (70-07-02). Adding the mirror to `runs.mjs` would put it next to the pinned `RUN_ROW_KEYS`, `toCommittedRow` and committed schema. Adding it to `run-bench.mjs` would make the parity test load the runner. A separate pure module keeps both untouched and lets the parity test import only the lists. 70-07-02 still runs the preflight grep for `scripts/bench/lib/` file-list pins.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (local) | All suites | ✓ | 24.14.1 | — |
| Node 20 | CI parity (`npx --offline -y node@20`) | ✓ | 20.20.2 | — |
| npm | Chain, MCP build | ✓ | 11.19.0 | — |
| `@modelcontextprotocol/sdk` | In-process caller | ✓ (`mcp/node_modules`) | 1.29.0 | — |
| `mcp/build/runtime.js` | In-process caller | ✗ in this worktree (gitignored) | — | Built by `npm --prefix mcp run build` (chain step 12) |
| Phase 66.1/67/68/69 code and SUMMARYs | Every Phase 70 task | ✗ in this worktree (planned; executing in the main tree) | — | **Blocking precondition:** 70-01 stops if the SUMMARYs are missing (D-24) |
| Chrome / headless browser | None | n/a | — | Phase 70 has no browser suite |
| Live gateway, real MCP hosts | V2-V5 only | n/a | — | Deferred to the Validation Block |

**Missing dependencies with no fallback:** the upstream phase code, which is only a sequencing precondition (D-24).
**Missing dependencies with fallback:** `mcp/build/runtime.js`, built in the chain.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Plain Node scripts with `check()` counters and an exit code (CJS `.test.js`); `node:test` for ESM `.test.mjs` |
| Config file | none. Suites are registered in `package.json` `scripts.test` (304 commands) and `REFINEMENT_ROOT_TEST_COMMANDS` |
| Quick run command | `node tests/<suite>.test.js` or `node --test tests/<suite>.test.mjs` |
| Full suite command | `npm test` (includes `npm --prefix mcp run build`), then `npm run test:mcp-smoke` and `npm run validate:extension` |
| Node 20 parity | `npx --offline -y node@20 tests/<suite>.test.js` (and `npx --offline -y node@20 --test tests/<suite>.test.mjs`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-03-a (SC1 gate) | `(true,'mcp')` gives an enabled field with `budgetProfile:'run_task'`; `(false\|undefined\|'true','mcp')` give null; non-MCP output equals 68; a real-helper `source:'mcp'` session takes an accepted fast step through `_executeTool` | unit + loop harness | `node tests/jev-fast-start-path.test.js && node tests/jev-fast-loop.test.js` | ❌ created by 68; inverted here (D-05) |
| MCP-03-b (SC1 budgets) | `run_task` profile values pinned and equal to autopilot; each of steps/calls/wall/consecutive/escalation-latch exhausted under the `run_task` field switches to LLM-only with no status change; unknown profile falls back to autopilot; the module never reads `source` (static) | unit | `node tests/jev-fast-path.test.js` | ❌ created by 68; extended |
| MCP-03-c (SC1/D-01 off path) | Switch-off settle values on runtime/bus/error/stop/safety-net paths deep-equal the pre-edit golden, with `FsbFastPath` loaded and not loaded; the existing lifecycle and resolve-discipline suites pass unedited | bridge harness | `node tests/run-task-fast-mode-wire.test.js && node tests/mcp-bridge-client-lifecycle.test.js && node tests/run-task-resolve-discipline.test.js && node tests/run-task-heartbeat.test.js` | ❌ Wave 0 (golden captured in 70-01) |
| MCP-03-d (SC2 classifier) | Exhaustive D-13 table plus F6 reasons, derived from source scans; flags `uncertain_unobserved`/`human_gate`; static slice ban (`decisions`, `meetsThreshold`, `threshold`, `probabilities`, page-content tokens); marker-string scan of blocks | unit + static | `node tests/jev-run-task-outcome.test.js` | ❌ Wave 0 |
| MCP-03-e (SC2 end to end) | Harness cases: uncertain fast click then LLM `complete_task` with no observation gives `ambiguous`; uncertain LLM click in the same turn as `complete_task` gives `ambiguous`; `[uncertain, report_progress, complete_task]` gives `ambiguous` (F1); delivered hand-off then complete gives `done` (F14); `manual_approval` gives `needs_confirmation`; injected payment-decline and consent results give `needs_confirmation`; auth partial gives `blocked`; stop gives `blocked`, or `ambiguous` with pending; safety net gives `ambiguous`; denied call then `end_turn` gives no false pending (F3) | loop harness + bridge harness | `node tests/jev-fast-loop.test.js && node tests/run-task-fast-mode-wire.test.js` | ❌ Wave 0 / extend |
| MCP-03-f (SC3) | Under `source:'mcp'`: every fallback class latches session/command/iteration and escalates to the LLM; unknown/`mayHaveExecuted` gets no second dispatch; risk-excluded elements are never fast-acted; a permission denial blocks; the tighten-only suite is green; the `escalations` tally and `latched`/`exhausted` reflect the reasons | unit + harness + existing | `node tests/jev-fast-path.test.js && node tests/jev-fast-loop.test.js && node tests/jev-policy-tighten-only.test.js` | ❌ created by 67/68; extended |
| MCP-03-g (SC4 wire) | Key-set diff `['fast_mode']`, last key, re-serialization byte equality (F9); throwing classifier still resolves with `classifier_error` (F4); block is JSON-safe; in-process SDK caller parses `fast_mode` with no `isError` and switch-off output equals the pre-edit golden; `git diff P70_START -- mcp/` empty; 69 shape freeze green | bridge harness + in-process MCP + git | `node tests/run-task-fast-mode-wire.test.js && node --test tests/mcp-run-task-fast-caller.test.mjs && node tests/mcp-tools-list-shape-freeze.test.js && git diff --quiet "$P70_START" -- mcp/` | ❌ Wave 0 |
| MCP-03-h (D-22) | Normaliser: removes only a page-matching Open sentence; conditions (2)/(3) decline; empty remainder declines; output is a suffix; all 12 core tasks equal the 68-08 exporter goal under both token shapes; the re-pointed 68-05 `sensitive_goal` case plus the new `sk-` and query-token cases still latch; no `https://` literal in the module | unit + grep | `node tests/jev-fast-path.test.js && ! grep -n "https://" extension/ai/jev-fast-path.js` | ❌ extend |
| MCP-03-i (D-21) | `runAutopilotArm` adds `runTask.fastMode` only for a plain-object block, with exact keys and closed vocabulary; records without a block keep the old key set; `toCommittedRow` output is unchanged; bench key list equals the extension's frozen list | node:test | `node --test tests/bench-fast-mode-record.test.mjs tests/bench-report.test.mjs` | ❌ Wave 0 |
| MCP-03-j (D-23) | Disclosure facts: no panel-only limiting phrase; Control names the settings tool; the sent goal is a suffix; never-sent list holds; at most one decide per `run_task` under `UNCALIBRATED` | unit (fact fixture) | `node tests/jev-run-task-disclosure.test.js` | ❌ Wave 0 |
| MCP-03-k (D-24) | Upstream tripwire over the 67/68/69 interfaces Phase 70 consumes | contract | `node tests/jev-run-task-upstream-contract.test.js` | ❌ Wave 0 |
| MCP-03-pins | Every edited file's pin suites; sweep against the baseline; chain registration | sweep + contract | `node scripts/bench/sweep-tests.mjs --files extension/background.js extension/ws/mcp-bridge-client.js extension/ai/jev-fast-path.js scripts/bench/run-bench.mjs --baseline .planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json && node tests/delegation-phase-contract.test.js` | ✅ tools exist |

### Sampling Rate
- **Per task commit:** the task's suite(s) on Node 24 and under `npx --offline -y node@20`, plus `node tests/delegation-phase-contract.test.js` when `package.json` or the chain changes.
- **Per wave merge:** the sweep for the files edited in the wave against `70-SWEEP-BASELINE.json`.
- **Phase gate:** `npm test` green (restore crawler files afterwards), `npm run test:mcp-smoke`, `npm run validate:extension`, `git diff --quiet "$P70_START" -- mcp/`, `git status --porcelain -- mcp/` empty, and every new suite under Node 20.

### Wave 0 Gaps
- [ ] Preconditions: 66.1, 67, 68 and 69 SUMMARY files exist in the execution tree (D-24)
- [ ] `tests/jev-run-task-upstream-contract.test.js`: tripwire (MCP-03-k)
- [ ] `tests/fixtures/run-task-wire-golden.json`: switch-off settle values and `mapFSBError` texts captured from unedited code
- [ ] `.planning/phases/70-bounded-mcp-fast-task/70-SWEEP-BASELINE.json`: pre-edit sweep
- [ ] `tests/jev-run-task-outcome.test.js`, `tests/run-task-fast-mode-wire.test.js`, `tests/mcp-run-task-fast-caller.test.mjs`, `tests/bench-fast-mode-record.test.mjs`, `tests/jev-run-task-disclosure.test.js`, each registered in both lists in its creating commit
- [ ] An option in the 68 loop harness to register the Phase 70 evidence handlers through the real `FsbFastPath` API
- No framework install needed.

### Manual-Only Verifications (tagged for the Validation Block)

| ID | Tag | What | How (exact where possible) |
|----|-----|------|----------------------------|
| M-70-01 | V1 | **None.** With the switch off, Phase 70 is pre-milestone `run_task`. The baseline runs at `8a058bdf`. | Record "none" explicitly |
| M-70-02 | V2 | Pre-deploy, a switched-on `run_task` gets a 404 (`invalid_request`) and latches after one call. Post-deploy, with the operator `disabled` switch, one `run_task` shows `fast_mode.jev.latched === 'disabled'` and a task-state outcome | Set `fsbJevFastModeEnabled` true via the MCP `settings` tool (66.1), run one `run_task` from Claude Code, then read the `fast_mode` block in the tool result |
| M-70-03 | V3 | A calibrated profile makes the `run_task` fast path act on bench fixtures. Revisit the `run_task` profile numbers with M-68-04 | Per 67/68 V3 shadow procedure; then a `run_task` smoke on core fixtures |
| M-70-04 | V4 | Comparative gate through `run_task`: `sensitive_goal` count (about 0 expected), uncalibrated overhead, budget-exhaustion counts, typed-outcome agreement table from raw `runTask.fastMode` (any `done` on a checker-failed run is a gate input), runs over 60 s per arm, false-`ambiguous` watch (F18), the server-vs-safety-net timeout race (F17) | `node scripts/bench/run-bench.mjs --campaign --arms autopilot --campaign-id core-gate-71-autopilot …` per the Phase 71 gate file; agreement from `scripts/bench/.local/<campaign>/runs/*.json` |
| M-70-05 | V5 | Real Claude Code CLI `run_task` with the switch on and the gateway uncalibrated or disabled: at most one attempt, nothing acts, `fast_mode` present with a task-state outcome. Codex and Cursor parse the same result | Manual host session |
| M-70-06 | V5 | Real pages: manual-approval page gives `needs_confirmation`; `stop_task` mid-run gives `blocked`/`ambiguous`; one foreground and one background-tab run; an uncertain target on a re-rendering site escalates once; the owner confirms the D-14 amendment (PD-70-01) | Manual host session |
| M-70-07 | V6 | Release. No MCP package file changes. Extension changes ride 1.0.0. Nothing is pushed before V4's gate and owner approval. The owner confirms the recorded D-17 amendment (switch-on `fast_mode` key) | V6 checklist |
| M-70-08 | V6 | MCP-enable consent review (M-68-12 extended with the CWS FAQ language). Release blocker for MCP-started transfers | Owner decision among D-07 (a)-(d) |
| M-70-09 | V6 | Human wording check: "FSB's autopilot" covers MCP-started `run_task`. Includes Open Question 3 (the "nothing is sent for a secret" reading under D-22) | Read the deployed card and privacy page |

Also record in 70-VALIDATION that the following are superseded: T-68-16, the 68 D-03 `run_task` truth and the 68-08 `{enabled:false, source:'mcp'}` capture cases. Record the F7 reachability notes, the F8 `sw_evicted` keying defect (deferred) and the F11 Phase 71 handoff.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface changes |
| V3 Session Management | no | Memory-only session fields; `persistSession` is an allowlist (background.js:4962-4995) |
| V4 Access Control | yes | No new MCP tool or argument (D-03). An MCP client enabling the switch through `settings` is the open consent question (D-07, M-70-08) |
| V5 Input Validation | yes | The block is built only from closed vocabularies (unknown becomes `other`); the bench projects exact keys; the normaliser parses with `new URL` and declines on doubt |
| V6 Cryptography | no | — |
| V7 Error Handling and Logging | yes | Classifier failure gives `classifier_error` and never throws or delays settle (F4). Existing `redactForLog` on the completion log is unchanged |
| V8 Data Protection | yes | The block never contains a label, URL, title, goal, text, selector, value, hash key or model output (marker scan). The evidence record is memory-only. The normaliser sends strictly less text, and secrets still latch through `buildRequest` |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| False `done` (Jev or LLM claim without effect) | Repudiation | D-14 evidence rules, F1 page-reading observation set, F14 hand-off marker, V4 agreement table |
| Page content leaking into the MCP result or bench record | Information disclosure | Closed vocabularies, a marker-string scan over blocks and raw records, no `jevMeasurement` additions (F12) |
| Goal normaliser hiding a secret | Information disclosure | D-22 conditions (2)/(3) use the 67 scrubber; `buildRequest` re-scans the remainder; the empty-remainder decline |
| Settle hang or `mcp:error` from a bad block | Denial of service | Isolated try/catch, JSON-safety test, throwing-stub test (F4) |
| MCP client turns on page-context transfer without in-UI consent | Elevation / Repudiation | Write logged (66.1 D-18); block makes the transfer visible; V6 release blocker M-70-08 |
| Duplicate side effect after an uncertain step | Tampering | 68 escalate-once (no second dispatch), proven again under `source:'mcp'` (SC3) |

## Sources

### Primary (HIGH confidence; code read at `e1e6439c`)
- `extension/ws/mcp-bridge-client.js:1308-1395, 2650-2963`: send path, start, heartbeat, settle, safety net, handlers, snapshot lookup
- `extension/background.js:4446-4510, 4558-4589, 4703-4760, 4962-4995, 5030-5055, 5410-5435, 13732-14275, 14438-14530, 17205-17226`
- `extension/ai/agent-loop.js:95-106, 322-334, 410-412, 708-713, 766, 792-799, 1498-1606, 1644-1692, 1710-1775, 2100-2160, 2240-2345, 2380-2520, 2640-2872, 2950-2990`
- `extension/ai/hook-pipeline.js`, `extension/ai/hooks/permission-hook.js:38-51`, `extension/ai/permission-context.js:56-61`
- `extension/ai/tool-definitions.js` (registry scan: 19 `_readOnly`, routes, fast-op verbs, partial enum :1213)
- `extension/ai/tool-executor.js:115-170, 495-590, 677-880`; `extension/utils/capability-router.js:61-69, 456-529`
- `extension/utils/mcp-task-store.js:120-160`; `extension/utils/automation-logger.js:941+`
- `mcp/src/errors.ts:440-488`, `mcp/src/tools/autopilot.ts:25-211`, `mcp/src/agent-bridge.ts:110-164`
- `scripts/bench/run-bench.mjs:540-600, 735-830`, `scripts/bench/lib/runs.mjs:1-60, 224-240, 430-560`, `scripts/bench/lib/tasks.mjs:461-471`, `scripts/bench/tasks/core/*.json`, `scripts/bench/lib/mcp-client.mjs:250-322`
- `tests/mcp-bridge-client-lifecycle.test.js:495-570`, `tests/run-task-resolve-discipline.test.js:225-300, 419-520`, `tests/delegation-phase-contract.test.js:129, 2375-2400, 2525-2545, 2700-2790`, `tests/mcp-tool-smoke.test.js:320-335`, `tests/provider-parity.test.js:395-420`, `tests/bench-report.test.mjs:190-240, 600-640, 770-800`
- `package.json` (scripts; chain step 12 builds MCP), `.github/workflows/ci.yml` (Node 20)

### Secondary (MEDIUM; planned interfaces, re-verified by 70-01)
- `68-CONTEXT.md` D-01..D-23; `68-01-PLAN.md:118-165`; `68-04-PLAN.md`; `68-05-PLAN.md`; `68-06-PLAN.md`; `68-08-PLAN.md:14-32, 90-125`; `68-09-PLAN.md:18-30`; `68-10-PLAN.md:66-80`; `68-12-PLAN.md:14-24, 116-165`; `68-RESEARCH.md:380-395, 830-845`; `68-VALIDATION.md:167-177`
- `67-01-PLAN.md:110-189`; `67-06-PLAN.md:24, 65-100, 138`
- `69-CONTEXT.md` D-21..D-23; `69-01-PLAN.md:144, 202-203`; `69-07-PLAN.md:1-60, 125-162`
- `71-CONTEXT.md:100-170` (D-05, D-07, D-08, D-09)
- `.planning/STATE.md:98-106`, `.planning/REQUIREMENTS.md:28-44, 67-88`, `.planning/ROADMAP.md:230-242`, `.planning/PROJECT.md:770-773`

### Tertiary (cited, not re-fetched this session)
- 70-DISCUSSION-LOG External Research 1-4 (fetched 2026-10-15): Chrome Web Store user-data FAQ and disclosure requirements; jev-browser and jev-ultrafast-mcp statuses; Claude Code, Codex and Cursor MCP timeouts; Jev latency figures

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Nothing new is installed, and every in-tree module was read.
- Architecture (seams, settle timing, hook context, wire path): HIGH. Verified in code.
- Upstream-dependent details (68 state layouts, 69 helper API): MEDIUM. Taken from plans, and 70-01 must re-check them.
- Pitfalls: HIGH for F1, F3, F4, F6, F7, F9 and F10 (code-verified); MEDIUM for F13 and F14 (depend on 68-05's implementation).

**Research date:** 2026-10-15
**Valid until:** the 70-01 sync re-check, or 30 days. Re-verify after 67, 68 and 69 land in the main tree.
