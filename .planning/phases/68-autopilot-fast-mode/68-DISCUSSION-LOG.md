# Phase 68: Autopilot Fast Mode - Discussion Log (Assumptions Mode, Auto)

> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-10-15
**Phase:** 68-autopilot-fast-mode
**Mode:** assumptions + auto. There was no user to confirm, so every Likely or Unclear item was auto-resolved to the option that best fits the owner's stated direction, and every Confident item was locked as stated.
**HEAD analyzed:** `e1e6439c` on branch `Jev` (planning worktree `the repository root`). Phases 66.1, 67 and 69 are not in this tree, so their interfaces are quoted from their PLANs.
**Areas analyzed:**
1. The setting, its scope, and "off means pre-milestone FSB" (AUTO-01)
2. Where the fast step lives in the agent loop (AUTO-02, AUTO-03)
3. Element menu, operation vocabulary and target freshness (AUTO-02, AUTO-03)
4. Evidence, budgets, escalation and tighten-only safety (AUTO-04, AUTO-05)
5. Proof strategy, shadow records and measurement under the validation deferral

## Assumptions Presented

### 1. The setting, its scope, and "off means pre-milestone FSB"
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| One boolean `writable` `FsbSettingsSchema` entry, default `false`, under a new fsb-prefixed key that is not `speedMode`. Panel defaults, `saveSettings`, `cacheElements`/`loadSettings` and a `FSBSettingsSync` mapping change in the same commit, and the MCP tool exposes it with zero `mcp/src` edits | Confident | 66.1-CONTEXT D-08, D-09, D-17; 66.1-01 (35 keys, 24 writable); 66.1-02 D-09 parity; 66.1-04 `noteStorageChanges`; `options.js:17,1843-1844`; `config.js:34`; `init-config.js:20` |
| Fast mode applies only to starts not made over MCP; it is read at start and at follow-up reactivation and held on the session; switching off takes effect at the next iteration and switching on at the next task | Likely | `background.js:13732-13755,13803-13859,13955-13960`; `mcp-bridge-client.js:2454`; `mcp-tool-dispatcher.js:2794,3219`; ROADMAP Phase 70 |
| With the switch off nothing new runs (no extraction, request, hook, prompt, tool-list or `fsb://config` change), and tests prove it | Confident | ROADMAP "Compatibility"; `background.js:4558-4589`; `mcp-bridge-client.js:3003-3015`; `agent-loop.js:708,731` |
| An Advanced Settings card next to Action Change Reports, unchecked, with disclosure copy naming FSB's server and TypeSafe AI; the 67-11 boundary suite is narrowed rather than deleted | Likely | `control_panel.html:607-633`; `tests/change-report-settings-ui.test.js:39-74`; 67-11 Task 2; 67-CONTEXT `<specifics>`, D-18, D-20 |
| How much of the showcase privacy page and Chrome Web Store disclosure Phase 68 changes | Unclear | `privacy-page.component.html:13`; 67-CONTEXT `<specifics>` and `<deferred>`; the seven `messages*.xlf` files and their CI extraction diff |

### 2. Where the fast step lives in the agent loop
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| A decision source inside `runAgentIteration`, placed after the safety hook and compaction and before `buildTurnMessages`; an accepted decision becomes `toolCalls = [jevCall]` through the existing tool loop; the logic lives in a new classic module with one `importScripts` load | Likely | `agent-loop.js:1846-1918,2252-2873,3041,3082`; `tests/agent-loop-iterator-guard.test.js:49-69`; the 8-`setTimeout` pins; `tests/lattice-step-emitter-smoke.test.js:156-163,246-250`; `ARCHITECTURE.md` §3 |
| Fast steps reach the LLM as one `role:'user'` summary, never as synthetic `tool_calls` | Likely | `agent-loop.js:2256-2260,2940,2961,2998`; ARCHITECTURE Anti-Pattern 3 |
| Jev's goal is `session.task`; one request asks for operation, target, completion and stuck; no hash key | Likely | 67-06 `buildRequest` input; 67 D-19, D-21, D-07; 67-08 T-67-10 |
| Fast steps count against the existing iteration cap; fast-only caps are added; the time limit is unchanged | Likely | `agent-loop.js:257-294,1787`; 67-07 invariance; `background.js:14061` |

### 3. Element menu, operation vocabulary and target freshness
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| A structured, value-free content-side menu extractor: a new `messaging.js` case plus a `dom-analysis.js` helper; `buildRequest` does the dropping and renumbering | Likely | `messaging.js:895-913`; `dom-analysis.js:263-505,2172,2570`; `dom-state.js:640-650`; 67 D-18 |
| The menu shares the LLM's `FSB.refMap` generation; the fast path acts with `params.ref` after a strict freshness check, with no CSS fallback | Likely | `dom-state.js:634-638`; `selectors.js:568-587`; `messaging.js:1039-1062`; ROADMAP SC2; the JEV-REFERENCE stale-card bug |
| Offered ops need no free argument; `type_text` and `select_option` are not offered or escalate; per-element `ops` come from code | Likely | 67-01 `OPERATIONS`; `tool-definitions.js:244-262,306-323,510-527`; AUTO-03; 67-RESEARCH A7 |

### 4. Evidence, budgets, escalation and tighten-only safety
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Act only when `FsbJevPolicy.accept` accepts operation and target and Phase 68's own checks pass; latch off on an uncalibrated answer or a non-transient fallback | Likely | 67 D-28, D-30; 67-07 `accept` reasons; the 67-08 cool-down scope; 67-03 `UNCALIBRATED` |
| The fast loop never declares success; stuck detection uses observable evidence; Jev's stuck flag only adds a trigger | Likely | `background.js:4558-4589` (no AFTER_ITERATION handler); `agent-loop.js:191-241,2475-2510,2900-2948,2994-3027`; 67-01 `NOUL_DIRECTION`; 66 D-17 |
| Never retry and never re-ask; escalate once with a truthful summary; latch off after N consecutive escalations | Confident | `content/actions.js:205-239,2640-2664`; `tool-executor.js:129-137`; JEV-REFERENCE "Never re-roll"; 67 D-13 |
| Whether Phase 68 adds a Jev-driven confirmation surface or keeps risk tighten-only by exclusion | Unclear | `permission-context.js:56-62`; `agent-loop.js:2295`; `tool-executor.js:536-583`; 67-07 `mergeConfirmation`/`toBeforeToolResult`; 67-01 (`proposedAction` exactly when `risk` is requested) |

### 5. Proof strategy, shadow records and measurement
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| The live path is proven offline with an injected fake gateway and a test-only calibrated result; no calibrated profile is committed; V2-V6 rows go to VALIDATION | Confident | STATE.md V1-V6; 67-08 factory injection; 67-12; 67 D-02, D-28; `tests/stuck-action-repetition.test.js` |
| Whether Phase 68 builds the `recorded-llm` capture that V3 needs | Unclear | `67-RESEARCH.md:422`; `67-VALIDATION.md:137` (M-67-08); 67-10 record format |
| Jev latency and cost go on the session as additive, separately labelled data; never `estimateCost`; v1 rows unchanged | Likely | 67 D-23; `cost-tracker.js` v1 rows; `automation-logger.js:237-245`; `mcp-tool-dispatcher.js:2547-2618` |

### Extra code checks made during this discussion (beyond the analyzer)
- **Refs are positional and reset on every snapshot.** `buildMarkdownSnapshot` calls `refMap.reset()` and registers `e1..eN` from 1 on every call (`dom-analysis.js:2537-2571`; `dom-state.js:634-650`). So a fast-path extraction in the shared registry would silently re-point the refs the LLM holds, with no stale error. This changed the Area 3 freshness choice (Auto-Resolved 9).
- **`hadEffect` is not an effect signal.** For non-read-only content tools it equals success (`tool-executor.js:129-130`). Real evidence is the click's `verification.verified`/`changes` (`actions.js:2690-2700`), `navigationTriggered`, and URL, title or menu changes (D-17).
- **`detectStuck` mutates the session.** It writes `session.agentState` and may attach `goalProgressTracker` (67-07 interfaces), and production never calls it (`createSessionHooks` registers only the safety, progress and permission hooks; no `createStuckDetectionHook(` call exists). Fast mode therefore uses a local no-progress detector (D-17).
- **Completion is a veto.** It is `veto_when_low`, and `meetsThreshold` for completion means p is at or below the cut (67-03). A calibrated answer can only say "confidently not done" (D-17).
- **Risk needs its own request.** The 67-01 validator requires `proposedAction` exactly when `risk` is requested. Risk cannot share the operation and target request whose answer it would depend on (D-11, D-19).
- **Start sources.** The side panel and popup send no `source`; the dashboard sends `'dashboard'` (`ws-client.js:2103`); MCP sends `'mcp'`. The session stores no `source` today (D-05).
- **The bench drives `run_task`.** Its autopilot arm drives `run_task` (`run-bench.mjs:549-590`), so under D-05 the bench cannot exercise Phase 68's fast path until Phase 70. Capture was therefore made source-agnostic and keyed on the fixture URL (D-22).
- **Fixture URLs.** They have the shape `http://127.0.0.1:<dynamic port>/r/<token>/fixtures/<rel>` (`fixture-server.mjs:13`). 67-10 records use the stand-in `http://127.0.0.1:4173` and `/fixtures/<slug>/...`, so the exporter rewrites the origin and strips the run prefix (D-22).
- **Live pins at `e1e6439c`.** `background.js` has 334 `importScripts` tokens and 330 call sites (67-11 will add 3 each). `agent-loop.js` has 8 `setTimeout` tokens and 2 `stepName` literals.
- **The privacy page has no Limited Use statement,** which the Chrome Web Store requires (D-07).

## Corrections Made

None. Auto mode: there was no user, and every Likely or Unclear item was auto-resolved (below).

## Auto-Resolved

1. **Fast-mode scope (D-05).**
   - **Chosen:** alternatives (a) and (c) combined. `handleStartAutomation` and the reactivation path compute one session flag, `stored === true && source !== 'mcp'`, and the loop reads only that flag. While the flag is on, the switch is re-read before each fast attempt.
   - **Reason:** Phase 70 owns `run_task`'s typed outcomes and budgets (MCP-03). Shipping an escalate-to-LLM fast path for `run_task` one phase early would be an untested MCP behavior change. One session flag gives Phase 70 a single gate to widen.
2. **Settings control and status (D-06).**
   - **Chosen:** (a) static copy only, with no network call from the panel. `getJevStatus` and `testJevConnection` are deferred again.
   - **Reason:** A status probe sends a request just to render a label, and under `UNCALIBRATED` it would always say "inactive", which the copy already says. Static copy satisfies AUTO-01 and keeps the Phase 67 boundary suite narrow.
3. **Privacy page and Chrome Web Store disclosure (D-07).**
   - **Chosen:** a variant of (a). Phase 68 edits the privacy page fully: TLDR qualification, an External Services bullet, a fast-mode section, a Limited Use statement and the date. It follows the established i18n workflow in all six locales. The Chrome Web Store dashboard form and listing text are a V6 manual item, with the copy prepared in VALIDATION. Human review of the translated legal text goes to V5 or V6.
   - **Reason:** The Chrome Web Store requires the privacy policy to disclose collection, use and sharing, plus an affirmative Limited Use statement, and the dashboard declarations must match the policy (External Research 1). A switch shipped against today's "no browsing data is collected by FSB servers" would be a policy misstatement. Option (c), English units only, would red the i18n completeness gate. Option (b) pushes code and i18n work into V6, a release step where it can be forgotten. Nothing reaches users before V6 either way.
4. **Loop integration shape (D-08).**
   - **Chosen:** (b) a single guarded call into the new module, plus a minimal skip branch over the LLM-only block. No new `setTimeout`, schedule line or `stepName` literal.
   - **Reason:** This is the smallest `agent-loop.js` diff, and it keeps the four schedule lines, the eight `setTimeout` tokens and the step-name pins byte-stable. A fast call flows through the permission hook, `_executeTool`, actionHistory, meta-attempt tracking and persist unchanged.
5. **LLM hand-off (D-10).**
   - **Chosen:** a hybrid of (a) and (b). One provider-neutral `role:'user'` summary only after fast steps acted, carrying the latest snapshot (bounded: older hand-off snapshots collapse to a marker). A pure decline adds nothing to `session.messages`.
   - **Reason:** A snapshot at hand-off saves the LLM a snapshot turn, which is the speed lever V4 measures, and it realigns the LLM's refs after the page changed. Adding nothing on a pure decline keeps declined iterations equal to today's path, which matters for the uncalibrated latch and for clean `recorded-llm` labels.
6. **Goal and identity (D-11).**
   - **Chosen:** (a) task text only. One request asks for operation, target, completion and stuck. No hash key is sent.
   - **Reason:** LLM-written text could launder injected page content through an unfiltered field (67 D-21). The hash key is attribution-only (67 D-07) and gives no product benefit.
7. **Budgets (D-12).**
   - **Chosen:** (a) the shared iteration cap, plus four fast-only budgets: fast steps, Jev calls, cumulative Jev wall time, and consecutive fast steps. Exhausting any of them switches the command to LLM-only and never ends the task.
   - **Reason:** Excluding fast steps from `maxIterations` would loosen a breaker and break 67-07's invariance property. Adding a consecutive-fast-step cap bounds the case where calibrated completion is "not a fit".
8. **Menu extractor (D-13).**
   - **Chosen:** (a) a new message case plus a `dom-analysis.js` helper, value-free, main frame only, viewport-first, in document order, with a named cap (default 48). The LLM snapshot path stays byte-identical.
   - **Reason:** Option (b), an opt-in option on `getMarkdownSnapshot`, ties the Jev menu to the shared ref reset (see item 9) and touches the LLM snapshot path. Option (c), a new content-script file, needs `CONTENT_SCRIPT_FILES` and completeness-test changes for no benefit.
9. **Target freshness (D-14). Deviates from the analyzer's recommended (a).**
   - **Chosen:** (b) a separate content-side Jev ref registry with a strict resolver reached through an additive param that only fast calls carry. It checks generation, connection, role, name, visibility, enabled state and occlusion, has no CSS fallback, and leaves existing ref and selector calls byte-identical.
   - **Reason:** The extra code check showed that every LLM snapshot resets and renumbers the shared `RefMap` positionally. A Jev extraction in the shared registry, on every decline and every capture, would re-point the refs the LLM holds to different elements with no stale error. That is a silent wrong-target click, the failure the research names. A separate registry makes "decline equals today's path" hold by construction.
10. **Operation vocabulary (D-15).**
    - **Chosen:** (b) and (c) combined. `type_text` and `select_option` are never offered. `scroll` is offered only when more content is below, and code runs it with direction `down`. Per-element `ops` come from code, and a mismatch escalates.
    - **Reason:** AUTO-03 and SC3 forbid fabricated arguments. Excluding the text operations keeps the catch-all meaning clean ("the next step needs reading, planning or writing text") and keeps the operation Choice small.
11. **Acting gate and latch (D-16).**
    - **Chosen:** (a) a per-session latch on the first uncalibrated or `snapshot_changed` answer, or on any non-transient fallback. Transient fallbacks escalate one iteration.
    - **Reason:** Without a latch, every LLM iteration would pay menu extraction plus up to 2.5 s and send page context off the device for nothing. "On" would be slower than "off" until V3. The 67-08 cool-down does not cover ok-but-uncalibrated answers.
12. **Completion and stuck (D-17).**
    - **Chosen:** (a) the LLM confirms completion, refined as follows. The completion veto (calibrated "confidently not done") is a precondition for continuing fast. `threshold_null` falls back to the consecutive-fast-step cap. No-progress detection is fast-mode-local over observable evidence, and the real `detectStuck` is never called on the live session. Jev's stuck flag only adds an escalation.
    - **Reason:** The extra code checks showed that `detectStuck` mutates `agentState` and is never called in production. They also showed that `hadEffect` is not an effect signal, and that completion's polarity can only veto. Option (b), a done-veto on the LLM's `complete_task`, and option (c), Phase 69 `evaluateExpectation`, are deferred: (b) changes the LLM path, and (c) needs an LLM-authored predicate with no autopilot tool to carry it.
13. **Risk surface (D-19).**
    - **Chosen:** (a) code-only exclusion plus escalation. No Jev risk question, risk hook or confirmation card in Phase 68.
    - **Reason:** Under `UNCALIBRATED` the risk Noul never contributes, so a hook would add latency for nothing until V3. `failClosed` would add a confirmation to every mutation on any Jev failure. A risk request needs a second round trip, because `proposedAction` is required exactly when `risk` is requested. Excluding risky elements leaves those steps on today's LLM path: no weakening and no new UI that would need V5. The hook and card are deferred until a calibrated risk question exists.
14. **Shadow capture (D-22).**
    - **Chosen:** (a) a network-free capture, gated on the switch being on and the tab being on the loopback bench fixture origin. It is source-agnostic, so it works under `run_task` bench runs. It goes to a bounded local store and is exported by a `scripts/bench/shadow/` script that rewrites the origin, strips the run prefix, maps each slug to `core.lock.json`, and validates with 67-10 `validateRecord`.
    - **Reason:** M-67-08 says V3 needs `recorded-llm` records from Phase 68, and hand-written seeds come out "not a fit" by construction (`67-RESEARCH.md:422`). So option (c), building nothing, would block V3. Option (b), capture on arbitrary browsing, would collect sanitized page text from real sites. Capture never calls Jev, because the V3 harness replays records through the gateway itself.
15. **Measurement (D-23).**
    - **Chosen:** (a) a separate session Jev block with source-labelled usage and cost, `null` never 0, and no `estimateCost`. v1 rows remain one per LLM turn. actionHistory gets a decision-source marker. The `get_session_detail` projection is additive and absent for sessions with no Jev activity.
    - **Reason:** Folding Jev cost into `costUsd` would mix FSB-borne and provider cost and corrupt V4. Changing v1 row keys would change output for fast-mode-off sessions. EVAL-01 needs the data recorded now.
16. **Addition beyond the analyzer: the LLM takes the first turn of every command (D-09).**
    - **Chosen:** the fast path is eligible only after at least one LLM turn in the current command.
    - **Reason:** AUTO-03 gives the LLM planning, and Jev's goal is only the task text. Letting the LLM see the task and plan first costs one LLM turn that the task needs anyway, and it prevents Jev from acting before any plan exists.
17. **Addition from external research: menu cap and ordering (D-13).**
    - **Chosen:** default 48 offered elements (the planner may tune within 32-64 before V3), viewport-first in deterministic document order. The constant is recorded with every capture record and frozen once V3 calibrates.
    - **Reason:** See External Research 3. There is no published browser target-accuracy curve. Score flattening is reported at 53 near-identical candidates and position bias over long lists. FSB's own heuristic default is 50 elements. A fixed, recorded cap lets V3's option-count-band scoring (67 D-27) measure the cap actually shipped.

## External Research

All sources were fetched on 2026-10-15.

1. **Chrome Web Store user-data rules for sending website content to a developer server.**
   - **Privacy policy contents.** It must disclose what is collected, how it is used and what is shared, including data transmitted automatically.
   - **Prominent disclosure and consent.** Disclosure "must not be located only in a privacy policy"; it must appear in the extension's UI, with affirmative consent before collection. The off-by-default switch next to its disclosure copy is that consent (D-06). Consent through an MCP write bypasses the UI and is flagged for V6 review.
   - **Limited Use.** Transfers to third parties are allowed only when "necessary to providing or improving your single purpose", to comply with law, for security, or in a merger with consent. No sale, no advertising use, and no human reading except in narrow cases. The privacy policy, or a page linked from the homepage, must carry "an affirmative statement that your use of the data complies with the Limited Use restrictions". FSB's page has none (D-07).
   - **Dashboard.** The privacy-practices tab declares the data types collected and certifies the disclosure statements. It must be consistent with the privacy policy, and inconsistencies can lead to suspension. For fast mode, the conservative declaration is "Website content" (page text, control labels) and "Web history" (origin, path and title of pages where fast mode runs). This is a V6 manual item.
   - **Effect:** D-06, D-07, `<deferred>` V6.
   - Sources: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq, https://developer.chrome.com/docs/webstore/program-policies/limited-use, https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements, https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
2. **TypeSafe and OpenRouter retention and training terms.**
   - **TypeSafe direct.**
     - The models page: "Jev is not trained on customer requests or responses". Zero data retention is "for enterprise customers" under the DPA.
     - The privacy policy: "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input". Input is not disclosed "to a third party other than our service providers". Data is retained "as long as reasonably necessary to provide you with the Services". "The Services are hosted in the United States."
     - The DPA gives no fixed deletion period.
     - Current models: `jev-1.14.0` (`jev-preview`) and `jev-1.13.0` (`jev-latest`).
   - **OpenRouter.**
     - "Your prompts are not retained unless you specifically opt in to prompt logging". 67 notes that opting in grants commercial-use rights, so FSB's account must keep logging off (M-67-07).
     - Per-request ZDR routing (`provider.zdr`) and an account setting that avoids providers that train both exist, but the docs do not say whether they apply to `/api/v1/systemone`.
     - The Jev guide lists `typesafe/jev-1.14` as current and `typesafe/jev-1.13` as still available.
   - **Effect.** The disclosure copy may say that TypeSafe states it does not train on these requests and that the service is hosted in the US. It must not say that TypeSafe does not retain requests. The privacy page names both possible routes, and V6 checks the sentence against V2's actual route (D-07).
   - Sources: https://docs.typesafe.ai/models, https://typesafe.ai/legal/privacy-policy, https://typesafe.ai/legal/data-processing, https://openrouter.ai/docs/guides/features/zdr, https://openrouter.ai/docs/guides/privacy/logging, https://openrouter.ai/docs/guides/community/jev
3. **Jev target-Choice accuracy versus menu size.**
   - **No direct curve.** No published curve relates browser target-Choice accuracy to menu size. jev-ultrafast caps its action table at 250 entries without publishing accuracy by size.
   - **Score flattening.** jevwiki "request mechanics": with 53 near-identical candidates per request, "every chunk scored 0.84–0.87" and missed the right item, while batches of 16 ranked it first; one tool now caps requests at 16.
   - **Position bias.** Over 254 candidates the serial-position curve is U-shaped, with the first decile at about 4 times the middle deciles' mean probability. Reordering moves probabilities (0.46-0.64) more often than it changes the winner. Shuffling flipped 5.3% of MMLU-Pro answers with no net accuracy change.
   - **Cost per option.** About 8 tokens per Choice option, or about 21 with a short description.
   - **Ties.** Treat a p within about 0.05 of a cut as a tie.
   - **FSB's own heuristic.** `maxElements` defaults to 50, with about 70% of the budget in the viewport (JEV-REFERENCE seams table).
   - **Effect.** The default cap of 48 is viewport-first in deterministic document order, recorded per record, and frozen after V3. Option-order rotation is deferred. V3 reads target accuracy by option-count band (67 D-27) before anyone raises the cap toward the 254-element contract limit (D-13).
   - Sources: https://jevwiki.ai/raw/wiki/ideas/request-mechanics.md, `.planning/research/JEV-REFERENCE.md` ("Where Jev plugs into FSB's existing seams", "Browser agents prove speed and cost, not success")
