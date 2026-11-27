# Phase 68: Autopilot Fast Mode - Context

**Gathered:** 2026-10-15 (assumptions mode, auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds opt-in, bounded Jev decisions to FSB's built-in autopilot (AUTO-01..05). When the switch is on and a step is simple, Jev picks one operation and one element from a menu that FSB builds. FSB rechecks that the element is still the one offered, and then runs the action through its existing tool loop. The LLM keeps planning, typed text, reading, unsupported actions and every decision that is below threshold or ambiguous. With the switch off, which is the default, autopilot behaves exactly as it did before this milestone.

Phases 66.1, 67 and 69 were planned when this context was gathered, so their interfaces were quoted from their PLANs. They are now code-complete in this tree (c7a7d66f), and the post-67 sync re-check (D-24) ran on 2026-10-17; its corrections are listed below and are applied in the plans, RESEARCH, PATTERNS and VALIDATION.

### Post-67 sync (2026-10-17): corrections to quoted facts

These correct facts this document quoted before the upstream code existed. They change no locked decision; where a decision's own wording was imprecise, the note says how the plans implement it.

"Sync issue N" in the plans, RESEARCH, PATTERNS and VALIDATION refers to the seven plan-checker warnings resolved in this pass (their working file was deleted once resolved): 1 = disclosure copy scoped to fast mode's request to FSB's server, with `/FSB never reads/i` forbidden (note 8); 2 = a null-response dispatch failure is "uncertain", not "denied" (note 6); 3 = the affirmative Limited Use compliance sentence (note 8); 4 = the literal D-17 no-progress latch (note 5); 5 = the fake-gateway client gets injected timers under the loop harness (note 4); 6 = a local empty-target or unfittable request declines or latches the command, never the session (note 7); 7 = plans 68-01, 68-06 and 68-08 are large by necessity (each carries a size note: commit per task, resume at a task boundary).

1. **The 67-11 boundary suite is stricter than D-06 assumed** (tests/jev-extension-boundary.test.js). Text files under `extension/ui` and `extension/config` may not contain the case-insensitive SUBSTRING `jev` (`/jev/gi`, :76-77 and :262-282), not only the word, so `fsbJevFastModeEnabled` trips it. `background.js` may match `/jev/i` only on the three jev-*.js load lines, adjacent after `ai/model-discovery.js` (:250-259). `extension/ai` must hold exactly the enumerated jev-*.js files, and those files may hold exactly one `<scheme>://` literal between them (:209-233). The caller rule is the prefix `/FsbJev[A-Za-z_$]*/`. D-06's narrowing is therefore: a word-bounded token allowlist for the switch key under ui/config (68-01), the new module as a fourth enumerated module (68-04), the fourth load line and exact background.js tokens (68-06, 68-08), and the marker-bounded card range (68-12). The new global `FsbFastPath` avoids the FsbJev prefix, so no call-site file needs an exemption.
2. **Real anchors.** `background.js` lines after :818 moved by +3 (67-11 added three load lines at :819-821): `handleStartAutomation` :13735, the settings read :13958-13962, follow-up reactivation :13806-13862, `createSessionHooks` :4561-4592, `CONTENT_SCRIPT_FILES` :843, `contentScriptReady` :12462. The lattice pins are 337/333 at `tests/lattice-provider-bridge-smoke.test.js:636-637` and `:685-686`. `agent-loop.js`, `tool-executor.js`, `tool-definitions.js`, `cost-tracker.js`, `control_panel.html`, `init-config.js` and every content script are unchanged since e1e6439c. `options.js`, `config.js` and `mcp-tool-dispatcher.js` moved (see each plan's interfaces block).
3. **66.1 panel sync needs one explicit refresher.** `FSBSettingsSync` applies and refreshes only keys with a `FIELD_REFRESHERS` entry (options.js ~:9668), so D-04's "covered with no alias" needs one refresher line in the switch commit (68-01).
4. **67 API details.** `require` of each jev module returns the api itself. `FsbJevPolicy.accept` adds `effect: 'veto_completion'` to an accepted completion (67 WR-07). `decide()` refuses locally a request whose page fields are not in `buildRequest`'s sanitized form (67 WR-04), so the fast path sends only `buildRequest` output. `buildRequest` returns `invalid_request` for a target question with zero surviving elements and for a request that cannot fit the byte budget (67 IN-02). `FsbJevClient` looks up its timers when `decide` runs, so tests that patch the global `setTimeout` must inject a timer pair.
5. **D-17 no-progress is implemented literally** (sync issue 4): after an acted fast step, verified or not, a next menu with the same url and signature latches the command (`no_progress`) and the hand-off carries the hint; D-18's `same_state` decline then covers only answered states that escalated.
6. **D-18 evidence** (sync issue 2): a fast step whose result is a failure with no content response (a message channel closed by a navigating click, a closed tab, no answer) is "may have executed", never "not permitted". "Not permitted" is used only for the exact permission-hook denial text. The real `PermissionContext.isAllowed` is a stub that always allows, so tests produce a denial by overriding it on the instance.
7. **D-16 latch scope** (sync issue 6): a local `buildRequest` refusal is a page property, so it latches the command, never the session; a menu whose entries `buildRequest` would all drop declines `nothing_offerable` before any request is built.
8. **D-06/D-07 copy scope and Limited Use** (sync issues 1 and 3): FSB's own LLM snapshot reads field values (`formatInlineRef`, extension/content/dom-analysis.js:2213-2217), and the fast-mode hand-off snapshot goes to the user's AI provider. Every "sent" and "never sent" claim is therefore scoped to what fast mode sends to FSB's server, and no copy may say that FSB never reads typed text. The privacy page's fast-mode Limited Use statement opens with an affirmative compliance sentence ("complies with the Chrome Web Store User Data Policy, including the Limited Use requirements").

In scope:
- **The switch.** One boolean `FsbSettingsSchema` entry, default off, shown in Advanced Settings with disclosure copy. The Phase 66.1 MCP `settings` tool exposes it with no `mcp/src` change.
- **The fast step.** A decision source inside `runAgentIteration` for autopilot sessions that are not started over MCP. It feeds the existing tool loop, hands control back to the LLM with a provider-neutral summary, and is bounded by fast-mode budgets.
- **The element menu.** A content-side menu extractor that never returns values, a separate Jev ref registry with a strict resolver, and the wiring into `FsbJevState.buildRequest`, `FsbJevClient.decide` and `FsbJevPolicy.accept`.
- **Evidence and escalation.** Completion, stuck and escalation rules based on observable evidence. Fast mode never retries, never re-asks Jev, and never declares success.
- **Risk.** Risky elements are excluded by code-only rules. There is no new confirmation surface.
- **Shadow capture.** A network-free `recorded-llm` capture on the bench fixture origin, plus an exporter in the 67-10 record format, so V3 has realistic labels.
- **Measurement.** Jev measurement is recorded on the session as additive, separately labelled data.
- **Disclosure.** The privacy page update, including the Limited Use statement, in every showcase locale.
- **Proof.** An offline proof harness with a fake gateway and a test-only calibrated result.

Out of scope:
- **`run_task` (source `mcp`).** It keeps today's path until Phase 70, which owns its typed done, ambiguous, blocked and needs-confirmation outcomes and its budgets (MCP-03).
- **MCP server code.** No source change under `mcp/`.
- **The live gateway.** Any real Jev call, deploy, secret, calibrated profile or threshold numbers (V2 and V3).
- **Turning fast mode on for users.** Default-on and any user-facing activation wait for V3, V4 and V6.
- **Risk confirmation.** A Jev risk hook and a confirmation card.
- **A Jev status probe or connection test in the control panel.**
- **Side-panel UI changes.**
</domain>

<decisions>
## Implementation Decisions

### Scope, compatibility and validation deferral

- **D-01: With the switch off, autopilot is pre-milestone FSB, and tests prove it rather than assume it.**
  - **Nothing new runs when the switch is off:**
    - no menu extraction message;
    - no Jev request;
    - no new hook in `createSessionHooks` (`extension/background.js:4558-4589`);
    - no new `session.messages` entry;
    - no added storage writes beyond the new key's own default.
  - **These stay byte-identical:**
    - the system prompt (`buildSystemPrompt`, `extension/ai/agent-loop.js:731`);
    - the autopilot tool list (`getPublicTools`, `:708`, and `extension/ai/tool-definitions.js`, which the four `EXPECTED_NON_TRIGGER_REGISTRY_HASH` pins protect);
    - the `fsb://config` resource (`extension/ws/mcp-bridge-client.js:3003-3038`, the bench identity of 66.1 D-21 and 66 D-18).
  - **Proof.** A `runAgentIteration` harness, with stubbed `chrome`, content responses and provider, asserts that with the switch off (and with the key absent) the sequence of content messages, provider calls, tool calls and `session.messages` matches a run where the fast-path module is not loaded at all.
  - **Why it matters.** This keeps the V1 baseline at `8a058bdf` valid as "fast mode off" for V4.
- **D-02: The validation deferral policy (STATE.md "v1.0.0-specific decisions", owner direction 2026-10-15) applies in full.**
  - Every Phase 68 plan is `autonomous: true`.
  - No plan has a `checkpoint:*` task.
  - Anything that needs the operator, a live account, production, real spend or a human eye goes into `68-VALIDATION.md` "Manual-Only Verifications" with its V tag, and into each affected plan's `<verification>`/`<output>` text.
  - Nothing is pushed to `origin/main` or any remote before V6.
  - Fast mode stays default-off. With the shipped `UNCALIBRATED` profile (67 D-28) the live loop must never act. The live path is built completely, but it is proven only with a fake gateway and a test-only calibrated result (D-21). Users stay on the existing path until V3 and V4 produce evidence.

  How each success criterion splits between this phase's automated proof and the Validation Block:

  | Success criterion | Proven automatically in Phase 68 | Deferred to |
  | --- | --- | --- |
  | **SC1:** switch in Advanced Settings and through the settings tool (one stored value); default off; disclosure copy; off follows the existing path | Schema entry plus the 66.1 parity suites (36 keys, 25 writable); settings-route read and write of the real key; FSBSettingsSync refresh mapping in a DOM-stub test; source-regex UI test of the control and its copy; the D-01 off-path equivalence harness; privacy-page source and i18n extraction checks | **V5:** see the switch and copy in the real panel; an MCP write shows in an open panel; turn it on, run a real task and confirm (with the gateway disabled or uncalibrated) that nothing acts. **V6:** Chrome Web Store privacy-practices form, listing text and the deployed privacy page; human review of the translated privacy text |
  | **SC2:** Jev chooses only among offered operations and current elements; FSB rechecks freshness and executes through existing machinery | Fake-gateway harness: an accepted step executes through `_executeTool` with the Jev-registry handle; stale, regenerated, renamed, hidden, disabled and occluded targets escalate; ops not in the element's `ops` escalate; no CSS fallback | **V3:** a calibrated profile makes the fast path act on the bench fixtures. **V5:** real-page freshness on a re-rendering site |
  | **SC3:** planning, text, extraction, unsupported steps and below-threshold decisions route to the LLM with no fabricated arguments | `type_text` and `select_option` are never offered; `none_of_the_above`, below-threshold, `threshold_null` and every fallback escalate; the first iteration of every command is LLM-only; static check that no fast-path call carries `text`, `value` or a free `direction` | **V3:** "not a fit" questions are reviewed, and the coverage and accuracy of the questions that act |
  | **SC4:** observable evidence for completion and stuck; action, request and wall-clock budgets; truthful terminal state | Budget-exhaustion tests (fast-step cap, Jev-call cap, Jev-time budget, consecutive fast-step cap) switch to LLM-only and never end the task; the fast path never calls `complete_task`; the completion veto and no-effect detection tests; the existing breakers are unchanged | **V4:** whole-task completion, wall time and cost against the baseline and a non-Jev control. **V5:** a runaway or stuck real page stops truthfully |
  | **SC5:** ambiguous, changed or failed decisions escalate once or stop as blocked; no duplicated side effect; no weakened confirmation | `outcome:'unknown'`, `mayHaveExecuted`, stale, every fallback and the consecutive-escalation latch escalate exactly once with no second dispatch; risk-excluded elements are never fast-acted; the 67-07 tighten-only and breaker-invariance suites stay green | **V5:** the escalation summary reads truthfully in a real session |
- **D-03: The MCP surface does not change, and `run_task` stays on today's path.**
  - Nothing under `mcp/src` changes (gotcha 3, Phase 66 D-01). The settings tool reaches the new key through the schema alone (66.1 D-17).
  - `run_task` starts (`source: 'mcp'`; `extension/ws/mcp-tool-dispatcher.js:3219`, `mcp-bridge-client.js:2454`) never set the session fast-mode flag in this phase. Phase 70 changes that gate.
  - Delegated `providerKind: 'agent'` runs return before the loop (`background.js:13747-13755`) and are unaffected.

### The switch, its scope and the disclosure (AUTO-01)

- **D-04: The switch is one new boolean `writable` entry in `FsbSettingsSchema`, default `false`, stored under one new fsb-prefixed `chrome.storage.local` key.**
  - The suggested name is `fsbJevFastModeEnabled`, following `fsbChangeReportsEnabled`. It must never be the legacy `speedMode`, which is migrated in `loadSettings` at `options.js:1843-1844` and has three default copies.
  - **One commit carries all of these:**
    - the schema entry in `extension/config/config.js`, appended after the existing 35 entries;
    - the `false` default in `Config.defaults` (`config.js`), in `init-config.js` defaults, and in `options.js` `defaultSettings`, so the 66.1-02 D-12 default parity holds with no new divergence;
    - `cacheElements`, the change listener (`markUnsavedChanges`), `loadSettings` (`?? false`) and the `saveSettings` `const settings = {` object (`options.js:2329+`), so the 66.1-02 D-09 inventory parity holds;
    - the 66.1-01 count pins, which move from 35 keys and 24 writable to 36 and 25.
  - **The open panel stays in sync.** The checkbox element `id` equals the storage key, so `FSBSettingsSync.keyForElementId` maps it with no alias, and the simple checkbox refresh in `applyToForm` covers it (66.1-04 `noteStorageChanges` applies only keys that have an in-place refresh mapping). An MCP write then shows in an open panel, and Save never reverts it.
  - **What stays out.** The key is not added to `fsb://config` or to `_handleGetConfig`, and no `mcp/src` file is edited. The 66.1 test-only fixture `fsbFixtureFastMode` stays a test fixture.
- **D-05 (Auto-Resolved): Fast mode applies only to autopilot starts that do not come over MCP.**
  - **Which starts count.** The side panel (`sidepanel.js:4489`, no `source`), the popup (`popup.js:487`, no `source`) and the remote dashboard (`ws-client.js:2103`, `source: 'dashboard'`).
  - **How the flag is set.** `handleStartAutomation` adds the key to its existing settings read (`background.js:13955-13960`, default `false`). It sets one session field, for example `session.fastMode = { enabled: stored === true && source !== 'mcp', ... }`. The follow-up reactivation path (`:13803-13859`) recomputes the field for the new command. The loop checks only that session field, never `source`.
  - **Turning it off mid-run.** While the session flag is on, the fast path re-reads the stored switch before each fast attempt. If the switch is off, the session latches fast mode off at that iteration.
  - **Turning it on mid-run.** That takes effect at the next task or follow-up command.
  - **State lives in memory only.** Fast-mode state lives on the in-memory session. `persistSession` (`background.js:4962-4991`) stores a fixed handful of fields and restored sessions are stop-only, so nothing new has to survive eviction.
- **D-06 (Auto-Resolved): The control is a static card in Advanced Settings, under "Automation Behavior", right after Action Change Reports (`control_panel.html:607-633`), and unchecked by default.**
  - **The description must:**
    - name FSB's server and TypeSafe AI as recipients;
    - list what is sent: task text, the page origin and path (never the query string or fragment), the title, a visible-text excerpt, and the labels and roles of visible controls;
    - list what is never sent: what is typed into fields, passwords, payment or hidden fields, and URL query strings;
    - say that secrets matching FSB's patterns are removed from the text;
    - say that the feature is experimental, stays inactive until FSB has calibrated it, and that the normal AI provider still plans, types and reads;
    - say that FSB's server keeps no page content.

    The wording proposed in `<specifics>` is a starting point.
  - **No live status.** The panel shows no live status and makes no network call. The `getJevStatus` and `testJevConnection` handlers that 67 deferred to this phase are deferred again (see `<deferred>`).
  - **No other UI changes.** There is no side-panel change: the sidepanel files carry SHA-256 pins (`tests/delegation-sidepanel-ui.test.js:755-781`).
  - **Tests to add and update:**
    - A source-regex UI test, following `tests/change-report-settings-ui.test.js:39-74`, covers the default, `cacheElements`, the listener, load, save, the `?? false` fallback, the card and an unchecked checkbox, and the presence of the recipient and "never sent" phrases.
    - The 67-11 boundary suite (`tests/jev-extension-boundary.test.js`) is narrowed in the same commit, never deleted. Its `/\bjev\b/i` ban under `extension/ui` and `extension/config` gets a small explicit allowlist: the settings card copy and the schema entry. (Post-67 sync note 1: the real scan matches the substring `jev` in text files, and `background.js` and the module list need their own narrowing.) Its "only `extension/ai/jev-*.js` references `FsbJev*`" rule is widened to name the Phase 68 call-site files. Its exact-globals check gains any new module's global.
    - Every ban on upstream paths (`systemone`, `api.typesafe.ai`, `JEV_*` env names), the single fixed endpoint, and "no `chrome.storage` in `jev-state.js`, `jev-client.js` or `jev-policy.js`" stays exactly as strict.
- **D-07 (Auto-Resolved): Phase 68 updates the showcase privacy page in every locale. The Chrome Web Store dashboard edits are a V6 manual item.**
  - **The page that changes.** `showcase/angular/src/app/pages/privacy/privacy-page.component.html`:
    - **TLDR (`:13`).** It currently says that "no browsing data is collected by FSB servers". It is qualified for the opt-in fast mode.
    - **External Services.** A fast-mode bullet is added.
    - **A new "Jev fast mode (optional, off by default)" section.** It covers:
      - what is sent and what is never sent;
      - the recipients: FSB's server at `full-selfbrowsing.com`, then TypeSafe AI, either directly or through OpenRouter;
      - what FSB keeps: body-free per-decision records for 7 days and daily aggregates for 365 days, never the goal, URL, title, text, labels, hash key or IP (67 D-24);
      - TypeSafe's stated terms (External Research 2);
      - that the setting can be turned off at any time.
    - **A Limited Use statement.** The page gains an affirmative statement that FSB's use of user data complies with the Chrome Web Store Limited Use requirements. This is required and the page does not have one.
    - **"Last updated".** Moves to the edit date.
  - **How the page is localized.** New and changed units follow the showcase i18n workflow. Every new unit is extracted, synced and translated into all six locale files (`messages.{de,es,ja,ko,zh-CN,zh-TW}.xlf`) so that CI's byte-for-byte extraction diff and the completeness gate stay green. Template edits shift xlf context line numbers, so the plan re-extracts instead of hand-editing them. Any new TypeScript helper goes in the file tail. Product names keep `translate="no"`.
  - **Manual items.** A human review of the translated legal text is V5 or V6. The Chrome Web Store privacy-practices form, the listing text and certifications are V6 (External Research 1). The exact copy for those is prepared in `68-VALIDATION.md`.
  - **Copy accuracy.** The copy must not claim that TypeSafe does not retain requests. The route sentence covers both possible V2 routes, and V6 checks it against the route actually deployed.

### Where the fast step lives in the loop (AUTO-02, AUTO-03)

- **D-08 (Auto-Resolved): The fast step is one decision source inside `runAgentIteration`, not a second loop. `agent-loop.js` changes as little as possible.**
  - **Placement.** After the BEFORE_ITERATION safety hook (`agent-loop.js:1846-1889`), the TranscriptStore compaction (`:1905-1917`) and the screenshot-orphan expiry, and before `buildTurnMessages` (`:1918`).
  - **The call.** `agent-loop.js` gets one guarded call into a new classic service-worker module, for example `extension/ai/jev-fast-path.js`. That module has an IIFE, a `module.exports` guard and one `globalThis` export, resolved lazily. The call returns either `{toolCall}` or `{decline}`.
  - **An accepted decision.** It sets `toolCalls = [jevCall]` with a `source: 'jev'` marker, a null response and null usage. It then skips the LLM-only block (`:1918-2247`): turn build, the API call, usage and the timing row, end_turn, the assistant push, `LLM_TURN` and the tool-call parse.
  - **The rest of the iteration is unchanged.** The call flows through the existing tool loop (`:2252-2873`):
    - the BEFORE_TOOL_EXECUTION permission hook;
    - `_executeTool` (`~:2709`);
    - actionHistory (`:2841-2857`);
    - the metrics recorder and the AFTER_TOOL_EXECUTION progress hook;
    - the meta-attempt tracking (`:2900-2948`);
    - persist (`:3041`);
    - the existing 100 ms schedule line (`:3082`).
  - **Pins that must not move.** No new `setTimeout` token (8 are pinned), no new or moved schedule line (4 are pinned, exact substrings), no new `stepName` literal (exactly one `LLM_TURN` and one `TOOL_DISPATCH`), and no edit to `checkSafetyBreakers` or `detectStuck`. A fast iteration's `TOOL_DISPATCH` emission must not add a step-name literal. The planner decides how its `previousStepName` is expressed, within the pins.
  - **The new module's load.** It is loaded with one plain `importScripts`. Both lattice pins (`tests/lattice-provider-bridge-smoke.test.js:635-636,683-684`) move by +1 from whatever values 66.1, 67 and 69 leave, and the comment ledgers are extended in the same commit. No new comment in `background.js` may contain the word `importScripts`.
  - **What the module may and may not do.** The module never reads `chrome.storage` itself; the switch reader is injected. It owns its timers through `FsbJevClient`. It never edits `ai-integration.js`.
- **D-09: The LLM always takes the first turn of every command.**
  - The fast path is eligible only after at least one LLM turn in the current command, whether a new task or a follow-up. The LLM therefore always sees the task and plans first (AUTO-03).
  - A decline or escalation runs that same iteration on the LLM, so the LLM always takes a turn before the next fast attempt.
- **D-10 (Auto-Resolved): Fast steps reach the LLM as one provider-neutral `role:'user'` summary, flushed into `session.messages` just before the next LLM turn.**
  - **No synthetic tool messages.** Fast steps never become synthetic assistant `tool_calls` with `role:'tool'` replies. An unpaired `tool_call` is a guaranteed provider 400 (`agent-loop.js:2256-2260`), and the loop already injects `user` messages for stuck hints (`:2961`, `:2998`) and the attempt log (`:2940`).
  - Jev-sourced results skip the tool-result push (`:2882-2891`).
  - **What the summary says.** It is truthful and short. It lists what was done (op, element label, the observed effect or "no visible change"), why fast mode stopped (escalation reason), and any uncertainty in plain words, for example "may have executed; inspect the page before retrying".
  - **A fresh snapshot.** When at least one fast step acted, the summary also carries the current page snapshot, using the same content and budget as the LLM's own snapshot tool, fetched once at hand-off. This realigns the LLM's refs and saves it a snapshot turn. Only the latest hand-off snapshot is kept in full; earlier ones collapse to a one-line marker, so context stays bounded.
  - **A decline with no fast action adds nothing to `session.messages`.**
- **D-11 (Auto-Resolved): What a fast attempt sends to Jev.**
  - Jev's `goal` is the user's task text for the current command (`session.task`), never an LLM-written subgoal or `lastAiReasoning`. D-21 filters only page text and labels, so LLM text in `goal` could launder injected page content.
  - **One request per attempt.** `kinds: ['operation','target','completion','stuck']`, with no `proposedAction`. The 67-01 validator requires `proposedAction` exactly when `risk` is requested. Risk is handled by D-19.
  - **No hash key.** `createJevClient` keeps `getHashKey = null`. The key is attribution-only (67 D-07), and sending it would link decisions to an install for no product benefit.
  - **`recentActions` (at most 10).** Each entry comes from the session's recent actions, LLM and fast alike. Its `targetId` is the current-menu id of the same element when it is still present, otherwise `null`. Its `changed` field comes from observable evidence (D-17), never from `hadEffect`. Actions whose op is outside the 67 vocabulary are omitted.
- **D-12 (Auto-Resolved): Budgets.**
  - **The existing breakers count fast steps.** `iterationCount++` (`agent-loop.js:1787`) and `checkSafetyBreakers` (`:257-294`) are unchanged: the user's `maxIterations`, the multi-site cap of 15 (`background.js:14061`) and the 10-minute time limit all apply to fast steps as well. That keeps the 67-07 invariance property and never loosens a breaker.
  - **Fast mode adds four budgets per command:**
    - a fast-step (action) cap;
    - a Jev-call cap;
    - a cumulative Jev wall-time budget;
    - a maximum run of consecutive fast steps before the LLM must take a turn.
  - **Per call.** Each `decide` call passes a `timeoutMs` at or below `DEFAULT_TIMEOUT_MS` (2,500 ms).
  - **When a budget runs out.** Fast mode switches off for the rest of the command, the LLM path continues, and the task never ends because of it.

### Element menu, operations and target freshness (AUTO-02, AUTO-03)

- **D-13 (Auto-Resolved): A structured, value-free menu extractor runs in the content script.**
  - **Where it lives.** A new message case in `extension/content/messaging.js`, backed by a helper in `extension/content/dom-analysis.js` that may reuse `getFilteredElements`, `getImplicitRole`, `computeAccessibleName` and `inferElementPurpose` (`:263-505`). There is no new content-script file, so `CONTENT_SCRIPT_FILES` (`background.js:840`) and its completeness test do not change.
  - **What it returns:**
    - typed entries `{handle, role, label, ops, inputType, autocomplete, purpose:{sensitive, danger, intent}, hidden}`;
    - the Jev registry generation (D-14);
    - a visible-text excerpt;
    - the page URL and title.
  - **What it never returns.** It never returns a field value. `formatInlineRef` (`dom-analysis.js:2172+`) renders values and is not used. `getMarkdownSnapshot` and `buildMarkdownSnapshot` stay byte-identical: the LLM snapshot is not touched, and the pre-existing value leak stays its own quick task.
  - **Menu shape.** Main frame only, viewport-first, in deterministic document order. It is capped by a named, exported constant, default 48 offered elements; the planner may tune it within 32-64 before V3 (External Research 3).
  - **Which `ops` each entry gets.** Code sets them from role and tag, as the subset of D-15 that applies to that element.
  - **The menu cap is part of the instrument in practice.** Each capture record carries the element count. After V3, a change to the cap or the ordering needs recalibration (recorded in VALIDATION).
  - **What `FsbJevState.buildRequest` does with the menu.** It does the dropping (password, hidden and file inputs; `cc-*`, `one-time-code`, `current-password` and `new-password` autocomplete values; `purpose.sensitive`; vault-filled handles), the `e0..eN` renumbering and the caller-side `idMap`.
  - **Vault-filled elements.** Phase 68 supplies `vaultFilledIds`, so elements filled by FSB's credential or payment tools in this session are dropped. The planner picks the mechanism, for example SW-side tracking of fill targets resolved content-side, or a content-side `WeakSet` set by the existing fill handlers. No value ever leaves the content script.
- **D-14 (Auto-Resolved; deviates from the analyzer's recommendation): Jev targets live in a separate content-side ref registry, never in the LLM's `FSB.refMap`.**
  - **Why.** `buildMarkdownSnapshot` resets the shared `RefMap` on every snapshot, and refs are positional (`dom-analysis.js:2548-2570`, `dom-state.js:634-650`). A fast-path extraction the LLM never sees would silently re-point the refs the LLM holds to different elements, with no stale error. That happens on every decline and on every capture.
  - **The registry.** A second registry instance, for example `FSB.jevRefMap`, using the same `RefMap` class or a sibling with its own generation counter. The menu extractor resets and fills only that registry.
  - **How a fast action targets its element.** It passes an additive param (for example `jevHandle` plus `jevGeneration`, `expectedRole` and `expectedName`) that only fast-path calls carry. `messaging.js` resolves it strictly:
    - the generation must match;
    - the WeakRef must be alive and the element connected;
    - the role and accessible name must be unchanged;
    - the element must be visible, enabled and not occluded at its center (a hit test).

    There is no CSS-selector fallback. Any failure returns `refStale: true` with a reason and no dispatch, and the fast path escalates. On success, the branch sets `params.selector` and the element cache exactly as the existing ref path does (`messaging.js:1040-1062`), and the action then runs through the existing tool handlers.
  - **Existing calls are unaffected.** Calls without the new param behave byte-identically, which covers every LLM and MCP call.
- **D-15 (Auto-Resolved): The offered operations are those that need no free argument.**
  - **Offered:** `click`, `check_box`, `press_enter`, `hover` and `go_back`.
  - **`scroll`.** Offered only when the page reports more content below the viewport. Code then executes it with direction `down`.
  - **Never offered:** `type_text` and `select_option` (they need `text` or `value`; `tool-definitions.js:244-262,306-323`). Typing and option selection fall to Jev's catch-all ("the next step needs reading, planning or writing text") and escalate.
  - **An operation outside the element's `ops` escalates.** If the chosen operation is not in the chosen element's code-derived `ops`, the step escalates (67-RESEARCH A7). This includes `go_back` and `scroll` paired with a target the code did not expect: they then use `targetId: null` semantics, as the planner defines.
  - **Fast-path calls are static.** Their parameters are built only from code-held values (the handle, the code direction). A static test asserts that they never carry `text`, `value` or any Jev-supplied string.

### Evidence, budgets, escalation and tighten-only safety (AUTO-04, AUTO-05)

- **D-16 (Auto-Resolved): When the fast path may act, and the per-session latch.**
  - **A step acts only when both of these hold:**
    - `FsbJevPolicy.accept(result, 'operation').accepted` and `accept(result, 'target').accepted` are both true. `accept` reads only calibration status, the decision, `threshold`, `meetsThreshold` and the catch-all (67-07), so hostile extra fields cannot sway it.
    - Phase 68's own checks pass: the operation is offered and in the element's `ops`; the element is not risk-excluded (D-19); and the completion and stuck gates of D-17 pass.

    Freshness is then rechecked at execution (D-14). `meetsThreshold` is necessary but never sufficient (67 D-28).
  - **The latch.** The first `ok:true` result whose `calibration.status !== 'calibrated'` (`uncalibrated` or `snapshot_changed`), or any fallback in `CONTRACT.NON_TRANSIENT_REASONS` or `spend_cap_reached`, latches fast mode off for the rest of the session. Jev is not called again in that session. Under the shipped `UNCALIBRATED` profile, a session pays at most one menu extraction and one Jev round trip, and then runs exactly like the existing path.
  - **Transient fallbacks.** `busy`, `timeout`, `rate_limited`, `upstream_*`, `network_error`, `server_error` and `aborted` escalate that iteration only, and count toward D-18's consecutive-escalation latch.
- **D-17 (Auto-Resolved): The fast path never declares success, and completion and stuck rest on observable evidence.**
  - **Only the LLM ends a task successfully.** The fast path never calls `complete_task`, `partial_task` or `fail_task`. The LLM's `complete_task` (`agent-loop.js:2475-2510`) stays the only success path. In autopilot the fast path has no terminal outcome of its own: "blocked" is reached only through the existing `fail_task` and breaker paths after escalation. Typed blocked and needs-confirmation outcomes are Phase 70's `run_task` contract.
  - **The completion gate.** `completion` is a veto when low (67-01 `NOUL_DIRECTION`; when calibrated, `meetsThreshold` means p is at or below the cut, which is "confidently not done").
    - A fast step proceeds only when `accept(result,'completion')` is accepted.
    - If the calibrated profile marks completion "not a fit" (`threshold_null`), steps may proceed, but the consecutive-fast-step cap (D-12) is the guard.
    - Any other failure hands control to the LLM, which checks whether the task is done.
  - **The stuck gate.** A calibrated `stuck` flag (`flag_when_high`, accepted) escalates. It never clears a code signal.
  - **Code-side no-progress detection.** It runs over the fast steps' observable evidence:
    - the click result's `verification.verified` and `changes` (`content/actions.js:2690-2700`);
    - `navigationTriggered`;
    - URL, title and menu-signature change between attempts.

    The same op on the same element without an observed effect, or an unchanged page signature across fast steps, escalates and latches fast mode off for the command, with the hint in the summary.
  - **`hadEffect` is not evidence.** It is just success for content tools (`tool-executor.js:129-130`).
  - **No `detectStuck` on the live session.** The fast path does not call the real `detectStuck` on it: `detectStuck` mutates `session.agentState` and may attach `goalProgressTracker` (67-07), and production autopilot never calls it today (`createSessionHooks` registers no AFTER_ITERATION handler). The existing meta-attempt counter (warn at 4, stop at 6, over 12 iterations; `:191-241`, `:2900-2948`) still sees fast calls because they sit in `toolCalls`. It applies unchanged.
- **D-18: Fast mode never retries and never re-asks.**
  - **Escalate exactly once.** Each of these escalates exactly once to the LLM path, with a truthful summary, and never triggers a second dispatch:
    - a fast action that returns `success:false` with `outcome:'unknown'` or `mayHaveExecuted:true` (`content/actions.js:205-239,2640-2711`, read from the nested `result.result`; the summary says "may have executed; inspect before retrying");
    - a freshness failure;
    - any typed fallback;
    - a below-threshold, `none_of_the_above` or `threshold_null` answer for operation or target.
  - **Never re-roll.** Jev is never asked again about the same page state, the same menu signature, to clear a threshold ("Never re-roll a low-confidence answer"; 67 D-13 makes one attempt with no retry).
  - **The consecutive-escalation latch.** After N consecutive escalations (default 3, planner's choice), fast mode turns off for the rest of the command, so a session where Jev keeps declining stops paying the round trip.
- **D-19 (Auto-Resolved): Risk stays tighten-only by exclusion. Phase 68 adds no Jev risk question, no risk hook and no confirmation card.**
  - **Code-near-risk rules.** They make an element ineligible for fast action, so that step runs on the LLM path exactly as today:
    - `purpose.danger`;
    - `purpose.intent` of `submit`, `login` or `signup` (`dom-analysis.js:299-337`; `submit` already matches submit, send, post, confirm, done, finish, complete, checkout, pay, purchase, buy and order);
    - destructive or logout links;
    - file inputs;
    - `press_enter` on a field whose form holds a password, payment or OTP field, or whose submit control is itself excluded;
    - check boxes whose label matches consent or subscription terms (agree, accept, terms, subscribe, consent);
    - anything inside a vault, credential or payment flow.

    The exact list and its patterns are planner's discretion, within the rule "anything that commits, sends, pays, deletes, publishes, authenticates or changes an account goes to the LLM".
  - **Existing gates still apply.** Fast steps still pass through the existing BEFORE_TOOL_EXECUTION permission hook. Vault and payment tools are never fast operations.
  - **Why no risk hook.** Under `UNCALIBRATED` the risk Noul never contributes (`accept` is false, so `jevContribution` is `none`), so a live risk hook would add latency and nothing else until V3. Its `failClosed` mode would add a confirmation to every mutation whenever Jev fails.
  - **Deferred.** The `FsbJevPolicy.mergeConfirmation` and `toBeforeToolResult` hook and a confirmation card are deferred (`<deferred>`).
- **D-20: Tighten-only invariants hold unchanged.**
  - Phase 68 does not edit `checkSafetyBreakers`, `detectStuck`, `createPermissionHook`, `PermissionContext`, the capability consent router or the payment-fill confirmation.
  - The 67-07 suite (`tests/jev-policy-tighten-only.test.js`: exhaustive tables, real-export breaker invariance under hostile Jev fields on the session, HookPipeline ordering) stays green and is re-run in the phase gate.
  - Jev results are read only through `FsbJevPolicy.accept`. No other code reads `meetsThreshold`, `threshold` or `probabilities` to make a decision.

### Proof, shadow capture and measurement (AUTO-04, AUTO-05, V3/V4 support)

- **D-21: The live path is proven entirely offline.**
  - **The fake gateway.** Tests inject `FsbJevClient.createJevClient({fetchImpl, endpoint, now, setTimeoutImpl, clearTimeoutImpl})` with a fake gateway. It returns D-15-shaped `{ok:true, ... calibration:{status:'calibrated', profileId:'test-calibrated'}, decisions:{...}}` bodies that pass `FsbJevState.validateGatewayResponse`, plus every fallback.
  - **What is never added.** No calibrated profile is committed and `showcase/server/src/jev/profiles/` is not touched. No test reaches `full-selfbrowsing.com` or any upstream.
  - **The `runAgentIteration` harness.** It uses stubbed `chrome`, content responses and provider, after the `tests/stuck-action-repetition.test.js` session factory, and proves:
    - the off path (D-01);
    - an accepted step executing through `_executeTool` with the Jev handle and no LLM call that iteration;
    - every escalation path;
    - the uncalibrated latch (one call at most);
    - each budget (D-12);
    - no second dispatch on an unknown outcome;
    - the summary pairing (no unpaired tool messages across the provider formatters);
    - the first-iteration rule (D-09);
    - `run_task` (`source:'mcp'`) never fast.
  - **Content-side proofs.** Menu extraction and the strict resolver are proven with DOM-stub or jsdom-free fixtures, following existing content-script test patterns: no values, the drop rules, the cap and ordering, and every freshness failure.
  - **Registration.** New suites go into the root `package.json` `test` chain and are appended once to `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129`) in the same commit.
- **D-22 (Auto-Resolved): Phase 68 builds a network-free `recorded-llm` capture on the bench fixture origin, plus an exporter.**
  - **When capture runs.** Only when all of these hold:
    - the stored switch is on;
    - the session's tab URL is a loopback bench fixture page (`http://127.0.0.1:<port>/r/<token>/fixtures/<slug>/...` or `localhost`, the Phase 66 fixture-server URL shape);
    - an autopilot iteration is about to run on the LLM path.

    Capture keys on the URL, not on `source`, so it works under `run_task` bench runs. It never calls Jev.
  - **What capture records.** The menu, the `buildRequest` output and the `idMap` before the LLM turn. After the LLM's tool call executes, the label: operation is the LLM's tool when it is an offered operation, otherwise `none_of_the_above`; target is the Jev id whose element is the element the LLM's call resolved to (resolved content-side by element identity), otherwise `none_of_the_above`. Records request only `operation` and `target`, and the other labels are `null`.
  - **Where records go.** A bounded local store (an internal fsb-prefixed key, not a setting and not in `FsbSettingsSchema`; ring size is planner's choice). It is never sent anywhere.
  - **The exporter.** A script under `scripts/bench/shadow/` reads the store through the existing bench CDP pairing (`scripts/bench/lib/cdp.mjs`). For each record it:
    - rewrites the origin to the 67-10 stand-in `http://127.0.0.1:4173`;
    - strips the `/r/<token>` prefix (`stripRunPrefix`);
    - maps `<slug>` to the core task's `{id, version, fixtureSha256}` from `scripts/bench/tasks/core.lock.json` (read-only);
    - sets `provenance: 'recorded-llm'`;
    - validates each record with 67-10 `validateRecord` and `checkLockReferences` before writing it under `scripts/bench/shadow/records/`.
  - **How it is proven.** Offline, with a fake store and fixture URLs. Real captures come from V1-V3 bench runs (M-67-08).
- **D-23 (Auto-Resolved): Jev measurement is recorded on the session as an additive, separately labelled block.**
  - **The block.** For example `session.jevMeasurement` and the persisted history equivalent, carrying for each attempt:
    - the decision source;
    - `servedModel` and `instrumentVersion`;
    - `calibration.status`;
    - `latencyMs`;
    - `usage` and `cost` with their 67 source labels (`provider`, `estimate`, `unavailable`);
    - the fallback reason;
    - the step outcome and escalation reason.

    It also carries per-command totals: fast steps, Jev calls, Jev ms, FSB-borne USD by source, and escalations by reason.
  - **Labelling rules.** Missing values are `null`, never 0. Nothing goes through `CostTracker.estimateCost`, which falls back to Grok pricing. Jev cost is never folded into `costUsd` or the session's provider cost.
  - **The v1 timing rows keep their meaning.** Rows from `cost-tracker.js` `buildIterationTimingRow` remain one row per LLM turn. Fast iterations create no v1 row. Their tool time is in the Jev block.
  - **actionHistory.** Entries for fast steps carry a decision-source marker.
  - **`get_session_detail`.** The projection (`mcp-tool-dispatcher.js` sanitizers and `projectAutopilotIterationRow`) may add the Jev block and the marker only as keys that are absent for sessions with no Jev activity, so output for fast-mode-off sessions is byte-identical. This is extension code, not `mcp/src`.

### Testing and tripwires

- **D-24: Test, tripwire and commit rules.**
  - **Before editing.** Before editing `agent-loop.js`, `background.js`, `content/messaging.js`, `content/dom-analysis.js`, `content/dom-state.js`, `options.js`, `control_panel.html`, `config.js`, `init-config.js`, `mcp-tool-dispatcher.js` or the privacy page, grep `tests/` for `.match(`, `.includes(`, `indexOf(`, `readFileSync` and `sha256(` pins on that file, and bump paired pins in the same commit. The known pins are listed under `<code_context>`.
  - **Test registration.** New test commands go into `package.json` `test` and `REFINEMENT_ROOT_TEST_COMMANDS` in the same commit. Never edit the `PRE_PHASE6x` hashes.
  - **Runtime constraints.** Node 20 only, with no Node 22+ globals (CI and the server image run Node 20). No test binds 7225 or 7226.
  - **After a full `npm test`.** Restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`. The xlf files are committed only from an intentional extract and sync.
  - **Commits.** No AI attribution.
  - **Sync re-check.** After Phases 66.1, 67 and 69 execute, a sync re-check compares every interface name quoted here (schema API and counts, the `FSBSettingsSync` mapping, `FsbJevState`/`FsbJevClient`/`FsbJevPolicy` signatures, `CONTRACT` fields, the 67-10 record API, the boundary-suite rules, the pin values) against the real code before Phase 68 executes. Any drift is fixed in the plans, never by weakening a Phase 67 test.

### Claude's Discretion
- **Names.** The final storage key name, provided it is fsb-prefixed, not `speedMode`, and the same as the checkbox `id`. The new module's file and global names, the content message name, the Jev registry and param names, and the capture store key.
- **The shape of the `agent-loop.js` change,** within D-08's pins. A single guarded call plus a minimal skip branch is preferred over re-indenting the LLM block.
- **Numeric defaults:**
  - the menu cap (default 48, within 32-64 before V3);
  - the fast-step, Jev-call and consecutive-fast-step caps;
  - the Jev wall-time budget;
  - the per-call `timeoutMs`;
  - the consecutive-escalation N (default 3);
  - the capture ring size.
- **Rule details:**
  - the exact code-near-risk patterns (D-19);
  - the "more content below" test for `scroll`;
  - the page-signature function for no-progress detection;
  - how `go_back` and `scroll` map to `targetId: null`.
- **Wording and layout.** The summary wording, the disclosure wording within D-06's required content, and the privacy-page section layout.
- **The vault-filled mechanism (D-13) and the snapshot route used at hand-off (D-10).**
- **Plan split and wave order.** A suggested order is: schema, settings UI and boundary narrowing; content menu and strict resolver; the fast-path module and loop wiring; capture and exporter; measurement projection; the privacy page; the phase gate.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, requirements and owner decisions
- `.planning/ROADMAP.md`: the Phase 68 goal and SC1-SC5; the milestone "Compatibility", "Provider decision", "Validation Block" and "Release evidence" paragraphs; Phase 70 (`run_task` follows the switch later).
- `.planning/REQUIREMENTS.md`: AUTO-01..05, SET-02 (the Jev switch through the settings tool), MCP-03 (Phase 70), Out of Scope (no second switch, no reduced confirmations, no passwords or hidden fields to a decision provider).
- `.planning/STATE.md`: "### Decisions", then "v1.0.0-specific decisions" (V1-V6), restated by D-02.
- `.planning/PROJECT.md`: the v1.0.0 milestone section, "Backwards compatible with Jev off", and the key decisions table.

### Upstream phase contracts (executed; the post-67 sync verified these names against the real code, see the sync notes above)
- `.planning/phases/66.1-mcp-settings-tool/66.1-CONTEXT.md`: D-08 (one schema), D-09 (inventory), D-12 (default parity), D-16 (panel sync), D-17 (the Phase 68 key), D-18 (operator log), D-21 (byte-identical surfaces).
- `66.1-01-PLAN.md`: the `FsbSettingsSchema` API (`entries`, `keys()`, `get`, `isWritable`, `readOnlyKeys()`, `create(entries)`, `CODES`) and the 35-key and 24-writable pins.
- `66.1-02-PLAN.md`: the D-09 inventory parity (`extractSaveSettingsKeys`, `EXCLUDED_FROM_SCHEMA`) and the D-12 `KNOWN_DEFAULT_DIVERGENCES`.
- `66.1-04-PLAN.md`: `FSBSettingsSync` (`keyForElementId`, `noteStorageChanges`, `applyToForm`, `filterForSave`).
- `66.1-05-PLAN.md` and `66.1-07-PLAN.md`: the settings routes and the SC4 `fsbFixtureFastMode` proof.
- `.planning/phases/67-hosted-jev-gateway-policy-and-shadow-mode/67-CONTEXT.md`: D-01..D-32, especially D-09 (fixed endpoint), D-11 (request schema), D-13 (one attempt), D-15/D-16 (`decide` result and fallback enum), D-17 (module rules), D-18 (no value slot; Phase 68 wires the content side), D-20, D-21, D-23 (cost labels), D-24 (body-free ledger), D-26 (record format and `recorded-llm`), D-28 (act only when calibrated), D-29/D-30 (tighten-only; a Jev failure contributes nothing), and `<deferred>` "Belongs to Phase 68".
- `67-01-PLAN.md`: `CONTRACT` (`KINDS`, `OPERATIONS`, `RESERVED_OPTION_KEY`, `ELEMENT_ID_PATTERN`, `NOUL_DIRECTION`, `CAPS`, `BUDGETS`, `NON_TRANSIENT_REASONS`, `FALLBACK_REASONS`) and the validator's cross-field rules (`proposedAction` exactly when `risk` is requested).
- `67-03-PLAN.md`: the instrument questions and catch-all wording, the `UNCALIBRATED` profile (`uncalibrated-v1`), and `meetsThreshold` polarity (completion: p at or below the cut).
- `67-06-PLAN.md`: `FsbJevState.buildRequest(input, {byteBudget})` → `{ok, request, idMap, stats}` | `{ok:false, reason}`; `validateGatewayResponse`; `toOriginPath`.
- `67-07-PLAN.md`: `FsbJevPolicy.accept(result, kind)` (reasons `not_ok`, `not_calibrated`, `kind_absent`, `threshold_null`, `below_threshold`, `catch_all`, `malformed`), `mergeConfirmation`, `toBeforeToolResult`, `LEVELS`.
- `67-08-PLAN.md`: `FsbJevClient.createJevClient({endpoint, fetchImpl, now, getHashKey, setTimeoutImpl, clearTimeoutImpl})` → `{decide, resetCooldown}`; `decide(request, {signal, timeoutMs})`; `DEFAULT_TIMEOUT_MS = 2500`; `COOLDOWN_MS`; the status-only mapping.
- `67-10-PLAN.md`: the record format and `scripts/bench/shadow/lib/records.mjs` (`validateRecord`, `loadRecords`, `checkLockReferences`, `PROVENANCES`).
- `67-11-PLAN.md`: three inert `importScripts` loads and `tests/jev-extension-boundary.test.js` (narrowed by D-06).
- `67-12-PLAN.md` and `67-VALIDATION.md` M-67-08..M-67-10: the harness, the profile round trip, the need for recorded-llm records, and fast mode staying off until V4.
- `.planning/phases/69-mcp-descriptions-and-same-call-checks/69-CONTEXT.md` D-18/D-19 and `69-03-PLAN.md`: `evaluateExpectation({tabId, spec, deps})` in `extension/utils/action-verification.js` (not used by Phase 68; see `<deferred>`). Phase 69 also confirms that `tool-definitions.js` is hash-pinned.
- `.planning/phases/66-baseline-and-session-timing/66-CONTEXT.md`: D-01 (minimal MCP diff), D-10 (usage and cost labels), D-15 (frozen core corpus), D-17 (an agent's claim is never proof), D-18 (`fsb://config` identity).

### Research
- `.planning/research/JEV-REFERENCE.md`: read in full. It covers "Code builds the menu, Jev picks, code verifies", the browser-agent evidence (the stale-card executor bug, the 25/49 DOM result), the FSB seams table, "Never re-roll", menu flattening at 53 candidates, and data retention.
- `.planning/research/ARCHITECTURE.md` §3 "Autopilot fast path" (lines ~190-219). Its in-iteration decision source is adopted. These parts are superseded: its shared-`refMap` menu (D-14), "maxIterations counts LLM turns only" (D-12), the live risk hook and card (D-19), and the live done-veto (D-17).
- `.planning/research/PITFALLS.md`: Pitfalls 5, 14 and 15 and the "Looks Done But Isn't" checklist.

### Codebase maps
- `.planning/codebase/TESTING.md` (test chain, port-bound suites) and `.planning/codebase/CONVENTIONS.md` (classic-script modules, the `module.exports` guard).

### External (fetched 2026-10-15)
- Chrome Web Store user data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Chrome Web Store Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Chrome Web Store disclosure requirements: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- Chrome Web Store dashboard privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- TypeSafe models and data handling: https://docs.typesafe.ai/models ; privacy policy: https://typesafe.ai/legal/privacy-policy ; DPA: https://typesafe.ai/legal/data-processing
- OpenRouter zero data retention and prompt logging: https://openrouter.ai/docs/guides/features/zdr ; logging and provider policies: https://openrouter.ai/docs/guides/privacy/logging ; Jev on OpenRouter: https://openrouter.ai/docs/guides/community/jev
- jevwiki request mechanics (candidate count, position bias, per-option tokens): https://jevwiki.ai/raw/wiki/ideas/request-mechanics.md
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Settings toggle precedent:** Action Change Reports.
  - `control_panel.html:607-633`.
  - `options.js`: default `:45`, `cacheElements` `:327`, listener `:1004-1005`, load `:2041-2042`, save `:2375`.
  - Its test: `tests/change-report-settings-ui.test.js:39-74`.
- **Start path:**
  - `handleStartAutomation` (`background.js:13732`), with the `source` destructure at `:13733` and the agent-kind early return at `:13747-13755`;
  - follow-up reactivation (`:13803-13859`), which builds its own hooks and calls `runAgentLoop`;
  - the settings read through `getStorageWithTimeout` (`:13955-13960`);
  - the multi-site cap (`:14061`).
- **Start sources:** side panel `sidepanel.js:4489` (no source), popup `popup.js:487` (no source), dashboard `ws-client.js:2103` (`'dashboard'`), MCP `mcp-tool-dispatcher.js:3219` and `mcp-bridge-client.js:2454` (`'mcp'`).
- **Loop seams in `agent-loop.js`:**
  - BEFORE_ITERATION `:1846-1889`;
  - compaction `:1905-1917`;
  - `buildTurnMessages` `:1918`;
  - the LLM-only block to `:2247`, including the measurement row `:2042-2063`;
  - tool loop `:2252+`, with the permission hook at `:2290-2300` (`origin: ''`);
  - tool-result push `:2882-2891`;
  - meta-attempt `:2893-2948`;
  - AFTER_ITERATION and the inline stuck fallback `:2950-3028`;
  - persist `:3041`;
  - schedule `:3082`.
- **Content refs:**
  - `RefMap` (`dom-state.js:626-663`): positional `e1..eN`, with `reset()` bumping `generationId`.
  - `buildMarkdownSnapshot` resets and registers on every call (`dom-analysis.js:2537-2571`).
  - `resolveRef` falls back to CSS (`selectors.js:568-587`).
  - The ref branch of `executeAction` (`messaging.js:1040-1062`) returns `refStale:true` only when the fallback also fails.
- **Purpose and visibility:** `inferElementPurpose` (`dom-analysis.js:263-505`; the submit regex at `:301`, danger at `:337,491`, sensitive at `:370-430`); `getFilteredElements`, `getImplicitRole`, `computeAccessibleName`; the enabled and diagnostic checks in `actions.js:714+`.
- **Click evidence:** a success carries `verification:{verified, changes, confidence, ...}` (`actions.js:2690-2700`). Uncertain outcomes return `outcome:'unknown'`, `mayHaveExecuted:true` (`:205-239`, `:2640-2711`; "Never dispatch a second click on an uncertain outcome"). `tool-executor.js:129-137` keeps the response nested as `result.result`, and `hadEffect` equals success for non-read-only tools.
- **Measurement:** `cost-tracker.js` (`buildIterationTimingRow`, source labels, never `estimateCost` for Jev); `mcp-tool-dispatcher.js` `projectAutopilotIterationRow` and the session-detail sanitizers (`~:2540-2620`, exact-field projection).
- **Bench:**
  - `scripts/bench/fixture-server.mjs`: `/r/<token>/fixtures/<rel>` on 127.0.0.1 with a dynamic port.
  - `scripts/bench/lib/outcome.mjs` `stripRunPrefix`.
  - `scripts/bench/lib/cdp.mjs`.
  - `scripts/bench/tasks/core.lock.json` (read-only).
  - `scripts/bench/run-bench.mjs`: the autopilot arm drives `run_task`, so the Phase 68 fast path is not exercised by the bench until Phase 70.
- **Session factory for loop tests:** `tests/stuck-action-repetition.test.js:17-48`.

### Established Patterns
- **Service-worker modules are classic `importScripts` scripts.** Each has an IIFE, a `module.exports` guard and one `globalThis` export resolved lazily at call time. There are no top-level name collisions, and nothing has side effects at load.
- **Same-context dispatch.** In-worker code reaches background handlers through `globalThis.fsbDispatchInternalMessage`, never `chrome.runtime.sendMessage`. Content scripts are reached with `chrome.tabs.sendMessage(tabId, ..., {frameId: 0})`.
- **Exact-key validators are hand-mirrored and guarded by parity tests (gotcha 6).** Fast-path outputs that feed `buildRequest` must pass the 67 validators unchanged.
- **Missing values are null, never 0, and every cost or usage figure carries a source label.**
- **Provider-neutral history.** Injected guidance is a `role:'user'` message. A `tool_call` is always paired with its result.
- **Source-pin discipline.** Every extension-touching commit bumps its paired pins in the same commit, and the full chain stays green from the phase's first commit.

### Integration Points and Known Pins
- **`extension/background.js`.** (Line numbers in this section are e1e6439c values; for `background.js` add 3 to any line after :818, post-67 sync note 2.)
  - Edits: one `importScripts` line for the new module; the settings read and session-flag set in `handleStartAutomation` and in reactivation.
  - Pins: `tests/lattice-provider-bridge-smoke.test.js:635-636,683-684` (token and call-site counts, +1 each after 67's +3). Also `tests/delegation-phase-contract.test.js`, `tests/mcp-version-parity.test.js` and `tests/bench-drivers.test.mjs`, which use hashes. 57 test files reference `background.js`.
- **`extension/ai/agent-loop.js`.**
  - Edit: the guarded call and the skip branch.
  - Pins:
    - `tests/agent-loop-iterator-guard.test.js:49-69` (4 schedule lines);
    - 8 `setTimeout` tokens: `tests/lattice-provider-bridge-smoke.test.js:764,863-887`, `tests/mcp-philosophy-parity-smoke.test.js:373-378`, `tests/sidepanel-message-log-smoke.test.js:637-644`, `tests/lattice-step-emitter-smoke.test.js:302-307`, `tests/lattice-survivability-smoke.test.js:371-372`;
    - step-name literals: `tests/lattice-step-emitter-smoke.test.js:156-163,246-250`;
    - `tests/tool-definitions-parity.test.js` (it requires the module).
- **`extension/content/messaging.js`, `dom-analysis.js` and `dom-state.js`.** Edits: the new menu message case, the strict Jev-handle branch, the extractor helper and the second registry. Eight, one and two test files reference them respectively (none hash-pinned at e1e6439c; re-grep before editing).
- **The settings files.** `extension/config/config.js` (66.1 schema), `init-config.js`, `extension/ui/options.js`, `control_panel.html` (occurrence pins in `tests/delegation-phase-contract.test.js:728,1042,2080,3520-3546`), and `options.css` only if needed.
- **`extension/ws/mcp-tool-dispatcher.js`.** Only the additive session-detail projection (D-23).
- **The showcase privacy page and `showcase/angular/src/locale/messages*.xlf`.** Covered by the i18n extraction diff, the completeness gate and the marker thresholds.
- **`scripts/bench/shadow/`.** The capture exporter, beside the 67-10 and 67-12 tooling.
- **`package.json` and `tests/delegation-phase-contract.test.js:129`.** Test registration.
</code_context>

<specifics>
## Specific Ideas

- **Owner direction.**
  - "With Jev disabled, FSB behaves exactly as it did before this milestone" (2026-09-29).
  - "The only fast-mode setting is the control-panel Advanced Settings switch, default off. MCP `run_task` follows it, and the MCP settings tool reads and writes that same value" (ROADMAP "Provider decision").
  - Every validation is deferred to V1-V6 (2026-10-15).
  - Jev can only tighten confirmations (JEV-06).
- **Proposed settings copy** (final wording at the planner's discretion within D-06):
  - Card title: "Jev fast mode (experimental)". Subtitle: "Faster simple clicks during autopilot".
  - Toggle label: "Use Jev for simple steps".
  - Description: "Off by default. When on, FSB's autopilot sends a short description of the current step to FSB's server, which asks TypeSafe AI's Jev model to choose simple clicks faster. Sent: your task text, the page address without its query string, the page title, an excerpt of visible text, and the labels of visible buttons, links and fields. Never sent: anything typed into fields, passwords, payment or hidden fields, or URL query strings. FSB's server keeps no page content. Your AI provider still plans, types and reads. Experimental: it stays inactive until FSB has calibrated it."
  - Post-67 sync note 8 supersedes this draft's unscoped "Sent:" and "Never sent:" lists: every claim is scoped to what fast mode sends to FSB's server ("Sent to FSB's server", "Never sent to FSB's server", "fast mode leaves out form fields ..."), because FSB's own LLM snapshot reads field values and the hand-off snapshot goes to the user's AI provider. The starting copy in 68-12-PLAN.md Task 2 is the current wording.
- **Why the refs had to be separate (D-14).** Today every LLM snapshot calls `refMap.reset()` and renumbers `e1..eN` from 1. If the Jev menu reused that registry, a declined fast attempt would make the LLM's next `e5` mean a different element, and the click would succeed on the wrong target with no stale error. That is the stale-card failure mode the research warns about.
- **Completion polarity (D-17).** A calibrated completion answer can only say "confidently not done yet". It can never say "done". So the fast loop uses it as a precondition for continuing, never as a reason to stop with success.
- **The uncalibrated reality.** Under the shipped profile, every session with the switch on makes at most one Jev call and then behaves like baseline. V3 is expected to mark several questions "not a fit" (67 specifics). Phase 68 must handle `threshold_null` cleanly (D-16, D-17).
- **Bench path.** The Phase 66 bench's autopilot arm uses `run_task`. Phase 68's fast path is therefore exercised by the bench only after Phase 70. V4 compares through `run_task` using the shared loop mechanics. Capture (D-22) is source-agnostic so V1-V3 bench runs can still produce `recorded-llm` records.
- **The MCP-enable consent question.** An MCP client can turn the switch on through the settings tool (66.1 D-17, owner direction), and the human then never sees the in-panel disclosure. The write is logged (66.1 D-18). This is recorded as a V6 policy-review item. It is not changed here (see `<deferred>`).
</specifics>

<deferred>
## Deferred Ideas

- **Validation Block items** (collect them in `68-VALIDATION.md` "Manual-Only Verifications"):
  - **V1:** none. Phase 68 is off by default and the baseline runs at `8a058bdf`. Record an explicit "none".
  - **V2:** none of Phase 68's own. The fast path needs the live gateway only for V3.
  - **V3:**
    - run bench campaigns with the switch on to collect `recorded-llm` records;
    - export them with the D-22 exporter;
    - calibrate on the V2 pin;
    - confirm that a calibrated profile makes the fast path act on the fixtures and that the menu cap and ordering are frozen;
    - review the "not a fit" questions, especially completion.
  - **V4:** whole-task completion, wall time and cost: baseline vs non-Jev control vs fast mode (through `run_task` after Phase 70). Fast mode stays default-off and experimental unless the gate passes.
  - **V5:**
    - the switch and its copy in the real panel;
    - MCP write to open-panel refresh;
    - a real task with the switch on and the gateway disabled or uncalibrated (nothing acts, nothing visible changes);
    - real-page freshness and escalation summaries;
    - a stuck page stops truthfully.
  - **V6:**
    - the deployed privacy page;
    - the Chrome Web Store privacy-practices form (declare "Website content" and "Web history", the three certifications, consistency with the policy);
    - the listing text;
    - human review of the translated privacy text;
    - confirm the page's route sentence matches V2's route;
    - the MCP-enable consent review.
- **The Jev risk hook and confirmation card** (`FsbJevPolicy.mergeConfirmation` / `toBeforeToolResult` registered after the permission hook, two requests with `proposedAction`, a side-panel card). Revisit after V3 shows a calibrated risk question. The needs-confirmation outcome for `run_task` is Phase 70.
- **The `getJevStatus` and `testJevConnection` handlers, or a live status line in the panel.** They are re-deferred. A probe sends a request just to render.
- **A done-veto on the LLM's `complete_task`,** a fast-mode-only and once-per-session BEFORE_TOOL_EXECUTION denial when calibrated completion is low. A later, separately gated experiment.
- **Code-evaluated done checks through Phase 69's `evaluateExpectation`.** These need an LLM-authored predicate (no new autopilot tool is allowed) and their own ISOLATED probe deps. Phase 70 may reuse them for `run_task`.
- **Jev element pre-ranking for the LLM snapshot** (the research seam). Out of scope: it changes the LLM's input.
- **The `run_task` fast loop, typed outcomes and budgets:** Phase 70. Phase 70 must also re-verify the D-06 and D-07 copy, which then covers `run_task`.
- **The pre-existing LLM and MCP snapshot value leak** (`formatInlineRef` renders values). It is still its own quick task. Fixing it here would move the V4 baseline.
- **Menus across iframes and shadow roots, and option-order rotation against position bias.** Revisit after V3 shows target accuracy by option-count band.
- **Showing fast steps distinctly in the side panel or overlay.** That is a UI change, needing V5 and the sidepanel SHA pins.

### Reviewed Todos (not folded)
None.
</deferred>

---

*Phase: 68-autopilot-fast-mode*
*Context gathered: 2026-10-15*
