# Phase 70: Bounded MCP Fast Task - Discussion Log (Assumptions Mode, Auto)

> The decisions are in 70-CONTEXT.md. This log keeps the analysis behind them.

**Date:** 2026-10-15
**Phase:** 70-bounded-mcp-fast-task
**Mode:** assumptions + auto. There was no user to confirm. Every Likely or Unclear item was auto-resolved to the option that best fits the owner's stated direction, and every Confident item was locked as stated.
**HEAD analyzed:** `e1e6439c` on the planning worktree `the repository root` (branch `Jev`, detached). Phases 66.1 and 69 are being executed in the main tree, Phase 67 is next and Phase 68 follows it. None of their code is in this tree, so their interfaces are quoted from their PLANs with line numbers.
**Areas analyzed:**
1. Activation gate and loop mechanics
2. Budgets: actions, Jev calls and wall clock
3. Deriving the typed outcome (done, ambiguous, blocked, needs-confirmation)
4. Wire shape and where the result is built (MCP-04, minimal MCP diff)
5. Goal text and disclosure

## Assumptions Presented

### 1. Activation gate and loop mechanics
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `run_task` joins by widening `fsbFastModeSessionField` so `(true,'mcp')` is enabled. No MCP argument, payload change or storage key. The "run_task never fast" tests are inverted, not deleted | Confident | `68-CONTEXT.md:84-89`; `68-DISCUSSION-LOG.md:75-77`; `68-06-PLAN.md:25,108,118-119,190`; `68-05-PLAN.md:16,103`; `mcp/src/tools/autopilot.ts:35,121`; `mcp-tool-dispatcher.js:3213-3224`; `tests/mcp-tool-smoke.test.js:327-332`; REQUIREMENTS Out of Scope |
| `run_task` uses Phase 68's mechanics unchanged and escalates to the in-extension LLM, never to the caller | Likely | `68-DISCUSSION-LOG.md:77`; `68-CONTEXT.md:57,207`; `68-05-PLAN.md:15-30`; `67-CONTEXT.md:478`; `ARCHITECTURE.md:252-266` (superseded) |
| No consent step when an MCP client turns the switch on; the question stays M-68-12 (V6) | Likely | `68-VALIDATION.md:177`; `68-12-PLAN.md:162`; `66.1-CONTEXT.md:162-165` |

### 2. Budgets
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| "Its own budget" is a profile on the session field; the module reads budgets from it and falls back to its frozen constants | Likely | `68-04-PLAN.md:77`; `68-05-PLAN.md:19`; `68-CONTEXT.md:86`; `mcp-tool-dispatcher.js:3215-3222`; `background.js:13803` |
| The wall-clock budget keeps the menu-plus-Jev meaning; the 600 s ceilings stay the task's wall clock | Unclear | `68-05-PLAN.md:19`; `autopilot.ts:130`; `mcp-bridge-client.js:2800,2835-2841`; `agent-loop.js:282`; `68-CONTEXT.md:154` |
| Running out of a budget never ends `run_task` | Likely | `68-CONTEXT.md:161`; `68-05-PLAN.md:19` |
| No cross-session memory of an uncalibrated answer | Likely | `68-CONTEXT.md:204`; `67-08-PLAN.md:20,128` |

### 3. Deriving the typed outcome
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| A pure classifier, run after the task ends, reads the terminal state plus session evidence | Likely | `agent-loop.js:1498-1545,2124,2475-2510`; `68-04-PLAN.md:82,146`; `68-05-PLAN.md:47-53`; `mcp-bridge-client.js:2884` |
| Auth-wall partials map to `blocked`; a user stop maps to `blocked`, or to `ambiguous` with a step in flight; exactly four values | Unclear | `agent-loop.js:792-799`; `background.js:14511-14522` |
| No Jev risk question or hook; `needs_confirmation` only from existing gates | Likely | `68-CONTEXT.md:229-242,487`; `67-07-PLAN.md:14-18,57-60` |

### 4. Wire shape and where the result is built
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| No `mcp/src` change is needed; extension-side additive keys reach callers through both old and new servers | Confident | `mcp-bridge-client.js:1391-1392,2889-2895`; `errors.ts:452-454`; `69-CONTEXT.md` D-21; 66 D-01 |
| The typed block appears only when the session had `fastMode` at start; `success` and `status` are unchanged; snake_case keys | Likely | `tests/mcp-bridge-client-lifecycle.test.js:514-523,555-564`; `PROJECT.md:773`; `scripts/bench/run-bench.mjs:571-577` |
| The result is built in the bridge client from a session reference captured at start, with the classifier in `jev-fast-path.js` | Likely | `background.js:14501,14510-14522`; `agent-loop.js:1556-1606,1644-1676`; `tests/lattice-provider-bridge-smoke.test.js:635-636,683-684`; `mcp-bridge-client.js:2759-2777` |
| Additivity is proven by deep-equal goldens, key-set tests, an in-process caller and a parity test | Likely | MCP-04; `tests/delegation-phase-contract.test.js:129,2441-2516` |

### 5. Goal text and disclosure
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| How the `run_task` goal reaches Jev, given `sensitive_goal` on bench goals and the 1,000 code-point cap | Unclear | `68-RESEARCH.md:385` (F5), `:839` (OQ5); `67-01-PLAN.md:189`; `68-VALIDATION.md:170` |
| The existing disclosure already covers `run_task`; re-verify it, with no copy edits unless a fact changes | Likely | `68-12-PLAN.md:127`; `68-10-PLAN.md:74`; `68-CONTEXT.md:492` |

### Extra code checks made during this discussion (beyond the analyzer)
- **The terminal message already carries the reason.**
  - `notifySidepanel` broadcasts `outcome`, `reason`, `partial`, `stopped`, `blocker`, `nextStep` and `outcomeDetails` (`agent-loop.js:1556-1606`). The bridge's `handleComplete` keeps only `outcome`/`result` and drops `reason` (`mcp-bridge-client.js:2881-2887`). So the classifier can read `manual_approval`, the auth reasons and the breaker reasons straight from the lifecycle message, with no new broadcast field (D-12).
  - The background stop paths add `user_stopped` (`background.js:14511-14522`), `tab_closed` (`:5418`) and `service_worker_restart` (`:5037`).
- **The same-turn terminal gap.**
  - `complete_task`, `partial_task` and `fail_task` `return` inside the tool loop (`agent-loop.js:2510`, `:2611`, `:2647`), before the tool-result push. That is where Phase 68 puts its `observeTools` seam (`68-06-PLAN.md:200`).
  - So in a turn like `[click, complete_task]` the click's result never reaches `observeTools`. A click with an unknown outcome followed by `complete_task` in the same turn would read as `done`, which is exactly the SC2 failure.
  - `AFTER_TOOL_EXECUTION` is emitted per call with the full result (`:2867-2871`), and `HookPipeline.register` exists (`hook-pipeline.js:78`). A session-scoped observer registered only for fast-mode sessions closes the gap with no `agent-loop.js` edit and no `createSessionHooks` edit (D-14).
- **`actionHistory` cannot carry the evidence.** It keeps only `{success, hadEffect, error}` (`action-history.js:39-54`), which confirms 68 F10. The evidence recorder must see the nested `result.result`.
- **Stopped sessions vanish before the broadcast.** `handleStopAutomation` runs `cleanupSession` (`background.js:14501`) before broadcasting. `cleanupSession` deletes the map entry (`:4510`) but leaves the session's fields intact. So a session reference captured at start stays readable, while a lookup at settle time would miss it (D-19).
- **The bridge already reads `activeSessions`.** `fireHeartbeat` does `activeSessions.get(sessionId)` (`mcp-bridge-client.js:2693-2696`), so the capture follows an existing in-file pattern.
- **`success:false` would drop the block.** `mapFSBError` stringifies a result whole only when `success` is truthy, and otherwise keeps only Detected, Why and Next text (`errors.ts:449-488`). The four outcomes must therefore stay success-shaped (D-03).
- **Existing human gates beyond `manual_approval`.**
  - `fill_payment_method` returns `{success:false, result:{declined:true, reason}}` on `timeout`, `user_declined` or `sidepanel_unavailable` (`tool-executor.js:502-582`).
  - `invoke_capability` can return `RECIPE_CONSENT_REQUIRED` (`capability-router.js:456-529`; overlay text "this site needs your approval", `overlay-state.js:277`).
  - `PermissionContext.isAllowed` is a stub that always allows (`permission-context.js:56-61`), so permission denials are not a human gate today (D-15).
- **The bench reads only three keys.** `runAutopilotArm` reads `status`, `partial_outcome` and `sw_evicted` (`run-bench.mjs:571-577`). `classifyAutopilot` scans `json.error` and `json.message` text (`runs.mjs:224-236`). A nested `fast_mode` block cannot trip those patterns, and the bench does not record the typed outcome today, so V4 could not measure "false done" without D-21.
- **Bench goals stay latched if the goal is only compared to the current page.** `toOriginPath` scrubs page paths one segment at a time (`67-06-PLAN.md:76`), so the 22-character bench run token survives in `page.path` while the whole-goal high-entropy rule flags it (F5). A normaliser that removes only a leading `Open <url>.` sentence matching the page address sends no new information. But the page often changes after the LLM's first turn, so the comparison must also accept the page the task started on (D-22 (1)).
- **The boundary ban on the literal `https://`** (67-11, F12) applies to `jev-fast-path.js`, comments included. The normaliser's URL pattern must be written as `https?:\/\/` (D-22).

## Corrections Made

None. Auto mode: there was no user, and every Likely or Unclear item was auto-resolved (below).

## Auto-Resolved

1. **Escalation target (D-06).**
   - **Chosen:** (a) every escalation goes to the in-extension LLM, exactly as in autopilot.
   - **Reason:** Under the shipped `UNCALIBRATED` profile, escalating to the caller would end every switched-on `run_task` early with a non-done outcome. That breaks "Jev off or uncalibrated behaves like baseline" and wrecks the V4 completion comparison. It would also need new MCP error codes (`CODE_ONLY_ERROR_KEYS`), which the minimal-MCP-diff rule rules out. The community servers do escalate to the caller (External Research 1), but they have no in-process LLM to fall back on.
2. **MCP-enable consent (D-07).**
   - **Chosen:** (a) no consent step in Phase 70. M-68-12 is extended as M-70-08 and marked a release blocker for MCP-started transfers, with the Chrome Web Store FAQ language recorded and four remedy options listed.
   - **Reason:** The FAQ requires consent "within the Product's user interface" through "a specific action clearly agreeing" (External Research 2), so an MCP write alone likely falls short. Every compliant remedy amends a requirement: SET-01's "every other setting is writable", the Out of Scope "no separately stored toggle", or a sidepanel UI change under SHA pins. That makes it an owner decision. Nothing reaches users before V6.
3. **Budget profile (D-08). This refines the analyzer's (b).**
   - **Chosen:** a frozen `run_task` profile selected through the session field's `budgetProfile`, with values equal to Phase 68's defaults at ship.
   - **Reason:** M-68-05 measures autopilot fast mode through `run_task`. Different `run_task` numbers would make V4's evidence describe a configuration autopilot never runs. They would also be uncalibrated guesses before V3/V4. A separate, named and pinned profile still makes SC1 auditable and lets V3/V4 tune `run_task` alone. The module stays source-blind (68 D-05).
4. **Wall-clock budget (D-09).**
   - **Chosen:** (a) the Jev-plus-menu time per command, with the 600 s ceilings as the task wall clock and no elapsed-time cutoff. When the safety net settles a fast-mode session, the block reports `ambiguous`/`safety_net_timeout`, which is a light form of (c).
   - **Reason:** An elapsed cutoff turns fast mode off on exactly the long tasks where it saves the most LLM turns. Host timeouts (Codex 60 s default, Cursor CLI 60 s, Claude Code CLI about 28 h; External Research 3) are outside FSB's control and are not made worse by fast mode, so they are recorded for V4/V5 instead.
5. **Budget exhaustion (D-10).**
   - **Chosen:** (a) continue on the LLM and report the exhaustion in the block.
   - **Reason:** Ending as `blocked` would lower switched-on completion against baseline and push unfinished work back to the caller.
6. **Uncalibrated memory (D-11).**
   - **Chosen:** (a) leave it as is and measure it in V4.
   - **Reason:** The cost is bounded at one menu and one call per `run_task`, typically a few hundred milliseconds (External Research 4). Service-worker-lifetime memory would add cross-session global state that V3 makes moot.
7. **Classifier inputs (D-12, D-14).**
   - **Chosen:** (a) terminal state plus session evidence, with no final probe.
   - **Refinements:**
     - Evidence is recorded per executed tool result through a fast-mode-only observer, which closes the same-turn gap found above.
     - Jev-chosen steps need an observed effect or a later observation before `done`.
     - LLM steps keep baseline semantics: only an explicit uncertain result counts.
   - **Reason:** SC2 rules out "done" from Jev alone. Reclassifying every unverified LLM click would change baseline semantics and penalise the control arm's equivalent behaviour. Option (b), a final probe, adds a heuristic content round trip that could demote real successes; it is deferred until V4 shows the agreement rate. Option (c), `evaluateExpectation`, needs a caller spec and no argument may be added.
8. **Edge mapping and precedence (D-13).**
   - **Chosen:** (a) four values with a fixed precedence and a closed `reason` list:
     1. classifier error;
     2. safety net;
     3. human gate;
     4. unresolved uncertainty;
     5. success with evidence (`done`);
     6. success without evidence (`ambiguous`);
     7. otherwise `blocked`.

     Auth walls are `blocked` with their reason. A user stop is `blocked`/`user_stopped`, or `ambiguous` with uncertainty. `uncertain_unobserved` and `human_gate` flags travel with every outcome.
   - **Reason:** SC2 contracts four values, and `status` already carries `stopped` and `error` detail. Ranking `needs_confirmation` above `ambiguous` keeps the human gate visible, and the flag still tells the caller to inspect. Ranking `ambiguous` above `blocked` and `done` stops a caller from retrying a step that may already have run (SC3).
9. **`needs_confirmation` sources (D-15).**
   - **Chosen:** (a) existing gates only: `manual_approval`, a declined payment fill and `RECIPE_CONSENT_REQUIRED`, counted only when unresolved and the task did not succeed. No Jev risk hook.
   - **Reason:** Under `UNCALIBRATED`, a risk hook contributes nothing, and `failClosed` would demand confirmation on every mutation whenever Jev fails. A code-rule stop on risk-excluded steps would turn baseline completions into `needs_confirmation` and hurt V4.
10. **Where the outcome sits on the wire (D-17). Deviates from the analyzer's recommended (a).**
    - **Chosen:** (b) one nested top-level key, `fast_mode`, holding `outcome`, `reason`, the two flags, `budget_profile` and the compact `jev` summary.
    - **Reason:** It is the smallest additive footprint (key diff exactly `{'fast_mode'}`), which is easiest to prove for MCP-04. A top-level `outcome` would give that word a third meaning beside the lifecycle `outcome`, `sess.outcome` and `mapFSBError`'s `{"outcome":"unknown"}` trailer.
11. **Where the block is built (D-19).**
    - **Chosen:** (a) the bridge client, with a session reference captured right after the start dispatch, and the classifier as an `FsbFastPath` member. A classifier failure gives `ambiguous`/`classifier_error`, and settle is never delayed.
    - **Reason:** Stopped sessions are removed before their broadcast, and building in `agent-loop.js` would touch heavily pinned code and miss the background-side endings. A new module would move both lattice `importScripts` pins.
12. **Contract tests (D-20).**
    - **Chosen:** (c) both deep-equal goldens and key-set tests, plus an in-process SDK caller (the 69-07 pattern) and an exhaustive classifier table derived from the real terminal call sites.
    - **Reason:** MCP-04 requires that additions be "proven by contract tests". Producer/validator parity (gotcha 6) requires one shared exact-key list.
13. **Goal text (D-22).**
    - **Chosen:** a narrow form of (b). Remove one leading `Open <http(s) URL>.` sentence only when:
      - its origin and path equal the current or start page;
      - no path segment would be redacted;
      - its query and fragment hold no secret.

      There is no truncation, and the rule applies to every fast-mode session.
    - **Reason:**
      - Option (a) leaves almost every bench `run_task` goal latched on `sensitive_goal`, so V4's fast-mode arm would measure nothing (F5(c), OQ5, M-68-05).
      - Option (c) changes the task text against the V1 baseline at `8a058bdf`.
      - The narrow rule equals the 67-10 hand-record and 68-08 exporter rule, so live goals match the calibration goals.
      - It removes only text that duplicates the page address the request already carries, so nothing new leaves the machine and the "nothing is sent for a secret" fact holds under FSB's own address rule.
      - The 68-05 bench-goal `sensitive_goal` case is re-pointed, not weakened.
14. **Disclosure (D-23).**
    - **Chosen:** (a) verify only, with a test against the shared fact list. If a fact breaks, the plan stops and raises a copy change for the owner. M-70-09 adds the human wording check at V6.
    - **Reason:** The card says "FSB's autopilot sends…", and `run_task` is FSB's autopilot. The facts list already names the MCP settings tool. A copy edit would force privacy-page re-extraction in six locales for no factual change.
15. **Addition beyond the analyzer: bench recording (D-21).**
    - **Chosen:** the bench runner copies the `fast_mode` block, when present, into the run record through the shared key list. The frozen corpus and `classifyAutopilot` are unchanged.
    - **Reason:** Without it, V4 cannot measure whether `done` ever disagrees with the code-verified outcome checker, which is the honest test of SC2 (66 D-17). V1 runs from the pinned `8a058bdf` worktree, so it is unaffected.
16. **Addition beyond the analyzer: fallbacks are reported, not mapped (D-16).**
    - **Chosen:** every fallback reason lands in the block's `escalations` tally or `latched` field and never becomes the outcome itself.
    - **Reason:** 67-CONTEXT expects Phase 70 to "map the fallbacks to `run_task` outcomes" (`:478`). Under D-06 a fallback only escalates to the LLM, so the honest mapping is reporting. The outcome stays a function of task state (SC2, SC3).
17. **Addition beyond the analyzer: the `sw_evicted` and `get_task_status` surfaces (D-03).**
    - **Chosen:** both stay unchanged and carry no typed outcome.
    - **Reason:** Both are built in `mcp/src`. The block still reaches `FsbMcpTaskStore` `final_result`, and through it the `sw_evicted` lookup's `partial_state`, with no MCP change.

## External Research

All sources were fetched on 2026-10-15.

1. **How the community Jev MCP servers return outcomes.**
   - **jev-browser (Ying-Kai-Liao), `browser_do`.**
     - **Statuses:** `done`, `likely_done` ("the page looks done but Jev is unsure"), `needs_login`, `needs_confirmation` (next action "looks irreversible (order, pay, send, delete)"; re-call with `allow_irreversible: true`), `error`, `stuck`/`max_actions`, `ambiguous` (several candidates), `blocked` (captcha, access denied, error page).
     - **Who acts next.** For `likely_done`, `needs_confirmation`, `ambiguous` and `stuck` it is "your turn: check, snapshot or ask the user, don't just retry".
     - **Resume state:** `status`, `url`, `actions[]`, `done_score`, `page_text`, `info`, `candidates` and `pending`.
     - **Reported results:** "40/42, 0 false 'done'" over 42 live tasks; "~300 ms per Jev call, 2–4 calls for most steps"; a 286 ms average over 202 calls.
   - **jev-ultrafast-mcp (jiawei686).**
     - **Statuses:** `status: done`, `stopped: no progress` (three actions changed nothing), `stopped: hit max_steps` (default 20) and `turbo_unavailable`, plus per-action refusals (`needs_confirmation` requiring `"confirm": true`, `occluded`, `detached`, `target_changed`, `page_changed`).
     - **Verification:** "`verify` is checked by code, so when the summary and the page disagree the assertion decides".
     - **Resume state:** a step trace with each step's result.
   - **Effect on Phase 70.**
     - FSB's four values line up with these servers' terminal meanings, with detail in `reason`.
     - Their "code decides done" rule matches D-14's evidence requirement.
     - Their caller-escalation and resume-state designs need new arguments or tools, so they are deferred (D-06).
     - "0 false done" becomes a V4 measurement (D-21, M-70-04) rather than a claim.
   - Sources: https://github.com/Ying-Kai-Liao/jev-browser, https://jevwiki.ai/wiki/ideas/builds-browser-and-interface.md, https://github.com/jiawei686/jev-ultrafast-mcp
2. **Chrome Web Store prominent disclosure and consent when an MCP client turns the switch on.**
   - **The rules:**
     - The disclosure "must not be located only in a privacy policy, terms of service, or similar document".
     - "The prominent disclosure and consent must occur within the Product's user interface".
     - The product "must ask the user to agree to the prominent disclosure in a manner that requires them to take a specific action clearly agreeing to the disclosure before collecting or handling user data".
     - Data-practice changes after install must also be prominently disclosed.
   - **What the pages do not say.** Neither page addresses settings changed by other software, and neither waives consent for functionality closely tied to the single purpose.
   - **Effect.** An MCP-client write through the `settings` tool is likely not the user's affirmative action in FSB's UI. This is recorded as a V6 release blocker for MCP-started transfers (D-07, M-70-08), with remedy options that each need an owner decision amending a requirement.
   - Sources: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq, https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
3. **Default MCP tool-call timeouts of the main hosts.**
   - **Claude Code.** `MCP_TOOL_TIMEOUT` defaults to "about 28 hours" when unset, and a per-server `timeout` in `.mcp.json` overrides it. `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` aborts a call that sends "no response and no progress notification" within 30 minutes for stdio servers, or 5 minutes for HTTP, SSE and WebSocket. FSB is stdio and `run_task` sends a progress heartbeat every 30 s when the client gives a progress token. An issue report also says the Claude Desktop app cancels stdio calls at about 60 s regardless (it could not be fetched for confirmation; recorded as unconfirmed).
   - **Codex.** `tool_timeout_sec` defaults to 60 and `startup_timeout_sec` to 10.
   - **Cursor.** The agent CLI/ACP path uses a hardcoded 60 s `tools/call` timeout that `notifications/progress` does not extend, a known bug acknowledged on 2026-07-02. The IDE allows about 60 minutes.
   - **Effect.** `run_task`'s 600 s ceiling is reachable only in Claude Code CLI and the Cursor IDE, unless the user raises the Codex timeout. Fast mode cannot fix host timeouts and only shortens tasks, so no fast-mode elapsed cutoff is added (D-09). V4 counts runs over 60 s per arm and V5 checks parsing in all three hosts (M-70-04, M-70-05).
   - Sources: https://code.claude.com/docs/en/mcp, https://learn.chatgpt.com/docs/extend/mcp.md?surface=cli, https://forum.cursor.com/t/agent-acp-mcp-tools-call-times-out-at-60s-with-no-way-to-configure-it/163925
4. **Hosted Jev round-trip latency.**
   - **Reported figures:**
     - TypeSafe publishes "70ms to 500ms" end to end per request.
     - jev-browser reports a 286 ms average over 202 calls and "~300 ms per call".
     - LiteLLM measured 126.81 ms, and Convex reports 199 ms per decision eval (JEV-REFERENCE).
     - A vendor blog cites a 227 ms average with a 400 ms p95 in a recorded demo. It is secondary and low-confidence.
   - **What is missing.** No independent p95 exists for a gateway hop like FSB's (extension to `full-selfbrowsing.com` on Fly, then TypeSafe directly or through OpenRouter).
   - **Effect.**
     - Under `UNCALIBRATED`, the cost per switched-on `run_task` is bounded by one menu (1.5 s deadline) and one `decide` (2.5 s timeout), and is expected to be a few hundred milliseconds.
     - With 16 calls and 20 s of Jev time per task, the call cap binds before the time budget unless the gateway is slow.
     - Real p50 and p95 come from V2 (M-67-02) and V3/V4 (`jevMeasurement`).
   - Sources: https://www.eesel.ai/blog/jev-ultrafast, https://jevwiki.ai/wiki/ideas/builds-browser-and-interface.md, `.planning/research/JEV-REFERENCE.md`
