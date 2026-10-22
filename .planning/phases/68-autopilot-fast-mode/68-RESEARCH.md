# Phase 68: Autopilot Fast Mode - Research

**Researched:** 2026-10-15
**Domain:** MV3 service-worker agent loop + content-script element menus + a hosted decision model (Jev) behind FSB's own gateway; control-panel setting; showcase privacy disclosure (7 locales); bench shadow capture
**Confidence:** MEDIUM-HIGH. Every FSB code seam below was read at `e1e6439c` in this worktree. The Phase 66.1 and Phase 67 interfaces come from their PLANs (not executed here yet), so anything that depends on their exact implementation is MEDIUM until the D-24 sync re-check.

**Post-67 sync (2026-10-17).** Phases 66.1, 67 and 69 are code-complete at `c7a7d66f` and the sync re-check has run. It confirmed A2 and A5, resolved A1, and corrected F12 (see the rows below and 68-CONTEXT.md "Post-67 sync"). It also changed four recommendations of this document, which the plans now follow: a local `buildRequest` refusal latches the command, never the session, and a menu with no surviving entry declines `nothing_offerable` (Pattern 3 step 5); a fast step's failure with no content response is "may have executed", and "denied" requires the exact permission-hook denial text (afterStep paragraph); D-17's unchanged-signature rule applies after any acted step, verified or not; every disclosure claim is scoped to what fast mode sends to FSB's server (Pitfall 13). Line numbers here stay `e1e6439c` values; for `background.js` add 3 after :818, and take `options.js`, `config.js` and `mcp-tool-dispatcher.js` anchors from the plans' interfaces blocks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
<!--VERBATIM:DECISIONS-->

### Claude's Discretion
<!--VERBATIM:DISCRETION-->

### Deferred Ideas (OUT OF SCOPE)
<!--VERBATIM:DEFERRED-->
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTO-01 | Enable or disable Jev fast mode in Advanced Settings or through the MCP settings tool (SET-01), one stored setting; off by default; explains that bounded page context is sent through FSB to Jev; existing autopilot behavior available when off. | Toggle precedent `fsbChangeReportsEnabled` (options.js :45, :327, :1004-1005, :2041-2042, :2375; control_panel.html :607-633; tests/change-report-settings-ui.test.js) [VERIFIED: codebase]. 66.1 schema/sync APIs [CITED: 66.1-01/02/04 PLANs]. Boundary-suite word traps (F12). Privacy page facts (F7). Off-path proof design (Pattern 1, Validation). |
| AUTO-02 | Jev chooses only an offered operation and element from FSB's filtered current snapshot; FSB validates freshness and executes through existing mechanics. | Menu extractor reuses `getFilteredElements`/`computeAccessibleName`/`getImplicitRole`/`isElementActionable` [VERIFIED: dom-analysis.js:1838, accessibility.js:108,218, exports :1386-1389, :3641]. Strict resolver placement in `executeAction` before COMPACT REF and REF-LESS fallbacks (F17). Per-document generation (F16). Ops table (F2). |
| AUTO-03 | LLM keeps planning, generated text, reading, unsupported actions and below-threshold decisions. | `type_text`/`select_option` never offered; text-entry targets ineligible; first LLM turn per command (F14); every non-accepted `FsbJevPolicy.accept` reason escalates; complete fallback-reason table (F9). |
| AUTO-04 | Observable evidence for completion and stuck; task time, action and Jev-call budgets; truthful terminal state. | Click/check_box handlers only report success on verified change; `outcome:'unknown'`/`mayHaveExecuted` [VERIFIED: actions.js:200-239, :2636-2711, :5003-5043]. Breakers unchanged (`checkSafetyBreakers` :257). Meta-attempt counter needs a jev key (F1). Budgets (Pattern 3). |
| AUTO-05 | Ambiguous targets, changed state, provider errors, missing evidence fall back to the LLM or a truthful blocked outcome without repeating an unsafe action. | Never-rejecting `decide` [CITED: 67-08 PLAN]. Unknown-outcome and bfCache mapping (F11). Stop during an in-flight attempt (F21). Exception containment (F13). Escalate-once/latch rules (Pattern 3). |
</phase_requirements>

## Project Constraints (from CLAUDE.md and the task gotchas)

There is no repository `CLAUDE.md` (only `.claude/settings.json` and the `graphify` skill). The user's global instructions and the orchestrator's gotchas apply:

- **No AI attribution** in any commit message, PR text or push. This overrides the harness's attribution reminder.
- **Source-pin tripwires.** Grep `tests/` for `.match(`, `.includes(`, `indexOf(`, `readFileSync`, `sha256(` pins on every file a plan edits; bump paired pins in the same commit. `extension/background.js`: `importScripts` token and call-site counts (tests/lattice-provider-bridge-smoke.test.js:636-637, :685-686 at `c7a7d66f`; 334/330 at `e1e6439c`, 337/333 measured after 67-11, 338/334 after Phase 68's one load). No new comment in background.js may contain the word `importScripts`.
- **Test registration.** Each new suite goes into root `package.json` `test` and `REFINEMENT_ROOT_TEST_COMMANDS` (tests/delegation-phase-contract.test.js:129) in the same commit. Never edit `PRE_PHASE6x` hashes.
- **Minimal MCP diff.** No change under `mcp/` (MCP `run_task` fast loop is Phase 70).
- **Same-context dispatch.** In-SW code reaches background handlers through `globalThis.fsbDispatchInternalMessage`, never `chrome.runtime.sendMessage`. Content scripts are reached with `chrome.tabs.sendMessage(tabId, msg, {frameId: 0})`.
- **Node 20** in CI; no Node 22+ globals. No test binds 7225/7226.
- **Producer/validator parity** across hand-mirrored validators (fast-path output must pass the 67 validators unchanged).
- **Iterator survivability.** `agent-loop.js` keeps exactly 8 `setTimeout` tokens (comments included) and 4 exact schedule lines; exactly one `stepName: 'LLM_TURN'` and one `stepName: 'TOOL_DISPATCH'`; the unique `stepName:\s*'...'` set is exactly those two; no `_currentStepName` write inside a schedule lambda.
- **Crawler files.** After a full `npm test`, restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`; never commit them.
- **Safety.** Jev may only tighten (JEV-06 via `FsbJevPolicy`); never bypass `checkSafetyBreakers`, `detectStuck`, consent, payment or permission gates; no duplicated side effects.
- **Control panel copy** must explain the bounded FSB-to-Jev page-context transfer.
- **Project skill `graphify`:** the knowledge graph (`graphify-out/graph.json`) dates from July 2026; its line numbers are far off current code (for example `handleStartAutomation` at :8912 in the graph vs :13732 now). Treat graph relationships as approximate.

## Summary

The phase is mostly a careful wiring job around three seams FSB already has: the `runAgentIteration` iteration body, the content script's `executeAction` dispatcher, and the Phase 66.1 settings schema. The decision machinery (request builder, never-rejecting client, tighten-only policy) is Phase 67's and is consumed, not rebuilt. Under the shipped `UNCALIBRATED` profile (and before V2, when the gateway route does not even exist in production), the live path must never act, so everything that acts is proven offline with `createJevClient({fetchImpl})` and a test-only calibrated response.

Reading the real code surfaced several facts that the CONTEXT assumptions get wrong or leave open, and the planner should treat them as requirements: the meta-attempt loop breaker cannot see a Jev call as written (F1); `check_box` and `click` *toggle* checkboxes while the Jev element schema carries no state, so Jev can untick a box it was told to tick (F2); `inferElementPurpose` is first-match and misclassifies "Save", "Publish", `input[type=submit]` and confirmation-dialog "Continue" buttons as non-risky (F3); a `document.body.innerText`-style excerpt would ship text typed into rich-text editors (F4); bench instructions embed a run token that trips `sensitive_goal` on most bench runs (F5); the exporter cannot write into `scripts/bench/shadow/records/` without breaking 67-10's "exactly 25 hand records" assertion (F6); and the privacy page already carries a telemetry-only Limited Use statement that is pinned verbatim, plus a Policy History convention that requires archiving the current text (F7).

The off path is the most important property and is cheap to guarantee structurally: gate every new line behind a *synchronous* check of a plain session field that is absent when the stored switch is off, so no `await`, no content message and no storage write is added, and prove it with a `runAgentIteration` harness that compares event logs with the module loaded vs not loaded.

**Primary recommendation:** Build one classic SW module `extension/ai/jev-fast-path.js` (+1 `importScripts`), two guarded call sites in `agent-loop.js` (decision before `buildTurnMessages`; hand-back in place of the tool-result push) plus a one-line `_extractMetaTargetKey` branch; keep all risky/unsupported elements *in* the menu but caller-side ineligible; classify all 19 fallback reasons explicitly; and prove the off path, every escalation, the latch and every budget in a stubbed `runAgentIteration` harness before any live V-block step.

## Verified Findings That Change or Sharpen the Plan

| # | Finding | Evidence | Consequence for the plan |
|---|---------|----------|--------------------------|
| F1 | **The meta-attempt counter does not see Jev calls.** `_extractMetaTargetKey(call)` keys only on `args.selector`, `elementId`, `element_id`, `code`, `text`, `url`, `key`; a fast call carrying `jevHandle` (and no `selector`) returns `null`, so `_trackMetaAttempt` skips it. D-17's "it applies unchanged" is false as written. | [VERIFIED: agent-loop.js:202-241] | Add one branch before the others: `if (a.jevHandle) return 'jev:' + role + ':' + name` from code-held `expectedRole`/`expectedName` (68-06 revision: the key also carries the fast call's `pagePath`, `jev:<pagePath>:<role>:<name>`, so one same-named control per page is not merged across pages). `tests/meta-cognitive-tracker.test.js` slices `var _META_INTERACT_TOOLS = {` .. end of `_trackMetaAttempt` and evals it, so the edit stays inside that slice and the suite gets a new case. |
| F2 | **Checkbox state is invisible to Jev, and FSB toggles.** `toggleCheckbox` sets `element.checked = params.checked` only when `checked` is passed, otherwise `!element.checked`; it only accepts native `checkbox`/`radio`. A click on a native checkbox also toggles. The 67 element schema is exactly `{id, role, label, ops}`. | [VERIFIED: actions.js:5003-5043] [CITED: 67-01 KEYS.element] | Fast `check_box` always sends code-held `checked: true` (idempotent: `alreadyInState` success when already ticked). Native checkbox/radio entries get ops `['check_box']` only when unchecked, none when checked (never `click`). Toggle controls already "on" (`aria-checked/pressed/expanded/selected="true"`) get no ops. Jev can then never toggle something off; the LLM does that. |
| F3 | **`inferElementPurpose` is first-match and misses common commits.** Order is submit → search (`/go/` matches "category", "Google") → login → signup → next → back (`/back/` matches "feedback") → cancel (`/no/` matches "notification", "now") → destructive. "Save", "Publish", "Apply", "Update" are not in the submit regex; `combined` excludes the `value` attribute, so `<input type=submit value="Delete">` returns intent `null`, `danger:false`. "Continue" in a confirmation dialog is `next-step`. | [VERIFIED: dom-analysis.js:263-505] [CITED: 67-10 PLAN: confirm-modals Continue/Delete permanently, wizard Submit, settings Save are risk-true] | D-19 rules cannot rely on `purpose.intent`/`danger` alone. Add an independent, pure, union-based classifier (all patterns tested on accessible name + text + title + button `value` attribute + `aria-describedby` text, never first-match), plus structural rules: any control that submits a form (`el.form && (type === 'submit' || type === 'image')`, and `<button>` defaults to submit inside a form), every control inside `[role=alertdialog]`, affirmative controls inside modal dialogs, `a[download]`, `a[href^="javascript:"]`, logout links. Over-exclusion only costs speed (tighten-only). The 67-10 risk-true fixture targets are a ready-made oracle. |
| F4 | **"Never sent: anything typed into fields" needs an editable-region exclusion.** `innerText` of the page includes contenteditable content (composer drafts, rich editors) and the default text of `<textarea>`. `computeAccessibleName` returns `label.textContent` for label-wrapped controls (a wrapped `<select>` yields all option texts). | [VERIFIED: accessibility.js:108-160] | The visible-text excerpt must use a TreeWalker that skips `input, textarea, select, option, [contenteditable], [role=textbox], [role=combobox], [aria-hidden=true]`, hidden nodes, `script/style/noscript/template`, and FSB's own overlay nodes (`FSB.isFsbElement`). Canvas-editor pseudo-elements (`dataset.fsbRole`) are excluded from the menu. Add a test with a contenteditable draft and a wrapped textarea whose text must not appear in the menu result. |
| F5 | **Bench goals trip `sensitive_goal`.** `run-bench` renders `Open {startUrl}. …` where `startUrl` holds `/r/<token>/fixtures/…` and the token is `randomBytes(16).toString('base64url')` (22 chars). The 67-01 high-entropy rule scans `[A-Za-z0-9+/=_-]{32,}` (`/` included), so `53211/r/<token>/fixtures/checklist/index` is one candidate that is redacted whenever a split segment of 16+ chars mixes letters and digits, which most tokens satisfy. `buildRequest` then returns `sensitive_goal` with no request. | [VERIFIED: fixture-server.mjs:416, run-bench.mjs:671-678] [CITED: 67-01 scrubber rule 7] | (a) Live path: `sensitive_goal` must latch fast mode off **for the command** (the goal is fixed per command; the client answers locally, no network). (b) Capture cannot rely on `buildRequest(goal = session.task)`. Capture should store the builder *input* (menu entries, title, path, text excerpt) and the label; the exporter rebuilds the request with the core task's instruction minus its `Open {startUrl}.` prefix (the 67-10 hand-record rule). (c) Record for V3/V4/Phase 70: most bench `run_task` goals will be `sensitive_goal`, which would make fast mode silently inert in V4 unless Phase 70 or the bench handles it. |
| F6 | **The exporter cannot write into `scripts/bench/shadow/records/`.** 67-10's whole-set test asserts exactly 25 records and every provenance `'hand'`. Record ids must match `^shadow-[a-z0-9-]+-\d{2}$` and the file name must equal `<id>.json`. | [CITED: 67-10 PLAN Task 1, Task 3] | Exporter default `--out` must be the gitignored `scripts/bench/.local/shadow/recorded-llm/` (`.gitignore` already ignores `scripts/bench/.local/`), and tests use temp dirs only. Ids use a run discriminator inside the slug part, e.g. `shadow-checklist-llm<6 base36>-07`. Merging recorded records into the committed set (and amending 67-10's assertion) is a V3 owner decision. `run-shadow --records DIR` reads one directory, so V3 assembles a run directory. |
| F7 | **The privacy page already has a Limited Use statement, scoped to telemetry, pinned verbatim.** `@@PRIVACY_TELEMETRY_LIMITED_USE_TEXT` says the telemetry is "never shared with third parties"; tests/showcase-privacy-page.test.js pins six phrases and 24 `@@PRIVACY_TELEMETRY_*` ids. The page also has a Policy History convention: every update prepends an archive `<details>` with the previous full text (`privacy-history-archive.component.html`; last done in 52f281ca and 604543f7, whose message says the archive body "reuses each locale's existing page translations"). | [VERIFIED: privacy-page.component.html:238-239, :266-269; tests/showcase-privacy-page.test.js:164-215; git log] | Do not edit the telemetry statement. Add a separate fast-mode Limited Use paragraph that states the transfer to TypeSafe (directly or via OpenRouter) is only to provide the feature, which the policy permits ("necessary to providing or improving your single purpose"). Archive the September 29, 2026 text as a new entry with a new id (the `september` id is taken). D-07's statement that the page "does not have one" is wrong in detail; the requirement it serves still holds. |
| F8 | **The follow-up path reads no settings.** Reactivation (background.js:13803-13859) calls `reactivateSession`, `createSessionHooks` and `runAgentLoop` with no `getStorageWithTimeout`. | [VERIFIED: background.js:13803-13859] | D-05's "reactivation recomputes the field" needs a new one-key read there (the only added storage read on the off path; reads are not in the D-01 compared sequence). |
| F9 | **D-16 leaves 6 of 19 fallback reasons unclassified:** `invalid_request`, `payload_too_large`, `sensitive_goal`, `upstream_overloaded` (matched by `upstream_*`), `upstream_rejected`, `invalid_response`. Before V2 the production host has no `/api/jev/decide`, so a 404 maps (status-only) to `invalid_request`. | [CITED: 67-01 FALLBACK_REASONS, 67-08 status table] | Use the table in Pattern 3: `invalid_request` and `invalid_response` latch the session (contract or deployment mismatch, never transient); `sensitive_goal` latches the command; `payload_too_large` and `upstream_rejected` escalate the iteration. Test by iterating `CONTRACT.FALLBACK_REASONS` so a new reason fails the suite. |
| F10 | **The fast path needs the full tool result, which exists only in the local `toolResults`.** `actionHistory` keeps `{success, hadEffect, error}` only; the nested `result.result` (`verification`, `outcome`, `mayHaveExecuted`, `refStale`, `bfCacheDetected`, `navigationTriggered`) is pushed only to `session.messages` as the tool-result message, which D-10 skips for Jev calls. | [VERIFIED: agent-loop.js:2794-2891; action-history.js:39-54] | The D-10 skip at :2882 is a second edit site anyway; make it a guarded hand-back: `FsbJevFastPath.afterStep(session, fastStep, toolResults)` instead of the push loop. |
| F11 | **A vanished content script is reported as success.** `executeContentTool` maps "Receiving end does not exist"/"Could not establish connection" to `{success:true, hadEffect:true, navigationTriggered:true, result:{bfCacheDetected:true}}`. | [VERIFIED: tool-executor.js:137-165] | For fast steps, `bfCacheDetected` means "may have executed": escalate once with the "inspect before retrying" wording, never "clicked X". |
| F12 | **Boundary-suite name traps.** 67-11 scans every file under `extension/` for `\bJEV_[A-Z_]+\b` (so no `JEV_MENU_CAP`-style constants anywhere, content scripts included); `jev-*.js` may contain no `https://` other than the one endpoint in jev-client.js (comments included), no `chrome.storage`, `localStorage`, `serverUrl` or the word `importScripts`; `extension/ui` and `extension/config` may not match `/\bjev\b/i`. `fsbJevFastModeEnabled` does **not** match `\bjev\b` (no word boundary inside the identifier). The 67-11 acceptance grep is prefix-based (`grep -rl "FsbJev" extension/ \| grep -v "extension/ai/jev-"`). **Corrected by the post-67 sync:** the real suite scans text files under `extension/ui` and `extension/config` for the case-insensitive SUBSTRING `jev` (`/jev/gi`), so `fsbJevFastModeEnabled` DOES trip it; it also allows `/jev/i` in `background.js` only on the three load lines, requires `extension/ai` to hold exactly the enumerated jev-*.js files, and allows exactly one `<scheme>://` literal across them (not only "no `https://`"). | [CITED: 67-11 PLAN Task 2] [VERIFIED post-67: tests/jev-extension-boundary.test.js:58-80, :209-282] | Name constants `FAST_*`/`MENU_*`. Narrow the suite with explicit allowlists in the commits that need them: a word-bounded token allowlist for the switch key under ui/config (68-01), the module as a fourth enumerated module (68-04), the fourth load line and exact background.js tokens (68-06, 68-08), the card range (68-12). Keep every other `jev` substring out of config.js, init-config.js, options.js and background.js comments. Use a global that does not start with `FsbJev` (`FsbFastPath`), so the call sites in agent-loop.js and background.js need no exemption. |
| F13 | **An exception in the new call would be handled as an API failure.** The iteration body is one `try { … } catch (error)` (agent-loop.js:1896-3170) whose catch treats errors as provider failures (retry or end the session). | [VERIFIED: agent-loop.js:1896, :3084-3170] | Wrap both new calls in their own `try/catch`; on any exception, latch fast mode off for the session and continue on the LLM path. |
| F14 | **Per-command state can piggyback on `session.agentState`.** `hydrateAgentRunState` rebuilds `session.agentState` with fixed fields on every `runAgentLoop` (new task and every follow-up), and `iterationCount` restarts at 0 per command. | [VERIFIED: agent-loop.js:837-897, :1300-1301] | Keep per-command fast state at `session.agentState.jevFast` (reset for free); keep the session latch on the session (`session._fastPath`). Never compare iteration numbers across commands. The 67-07 invariance suite already proves `checkSafetyBreakers`/`detectStuck` ignore extra `agentState` fields. |
| F15 | **A hit-test helper exists but skips off-viewport elements.** `isElementActionable(node)` checks display, visibility, opacity, `pointer-events`, `disabled`, `aria-disabled`, disabled fieldset, and occlusion via `FSB.deepElementFromPoint` at the centre, ignoring FSB overlays, **only when the centre is inside the viewport**. | [VERIFIED: accessibility.js:218-275] | The strict resolver must additionally require an in-viewport centre (else `refStale`, reason `out_of_viewport`). Recommend in-viewport elements only as fast-actionable; `scroll` reaches the rest. |
| F16 | **Fresh content scripts restart counters.** `RefMap.generationId` starts at 0 per document; `register()` always mints `e${counter}`. | [VERIFIED: dom-state.js:626-668] | The Jev registry's generation must be unique per document (e.g. a random nonce from `crypto.getRandomValues` plus a counter) and handles must not look like LLM refs (use `j1..jN`), so a stale decision can never resolve on a new page with the same numbers. |
| F17 | **Branch order in `executeAction` matters.** After the COMPACT REF branch (`params.ref && !params.selector`) comes the REF-LESS fallback, which sends `pressEnter`, `type` and `keyPress` with no selector to the *focused* element. | [VERIFIED: messaging.js:1039-1085] | The jev branch must be the first branch when `params.jevHandle` is present, must reject a call that also carries `selector`/`ref`, and must `sendResponse({success:false, refStale:true, reason}); return;` on every failure. |
| F18 | **Button-type inputs have empty accessible names in FSB.** `computeAccessibleName` uses `textContent` for role button (inputs have none), then `placeholder`, then `title`. | [VERIFIED: accessibility.js:136-155] | For `input[type=submit|button|reset]` use `getAttribute('value')` (the static label attribute, never the `.value` property); for `input[type=image]` use `alt`; drop elements whose label is empty after that. Document the attribute exception so the "no values" static test can allow exactly that pattern. |
| F19 | **Metrics attribution.** The tool loop's `fsbMcpMetricsRecorder.recordDispatch` reports `drivingModel` from `session.providerConfig`, so fast dispatches are attributed to the LLM model. | [VERIFIED: agent-loop.js:2807-2833] | Known limitation; V4 reads the session Jev block, not telemetry. Changing it needs a telemetry allowlist review (out of scope). |
| F20 | **Persisted sessions are copied generically into `get_session_detail`.** `sanitizeSessionMetadata` runs `sanitizeValue` over the whole stored record, which drops `/token/i` keys and flattens deep objects. Persistence itself is an explicit field projection in `automation-logger.js` `saveSession`. | [VERIFIED: mcp-tool-dispatcher.js:2203-2264; automation-logger.js:941-1100] | D-23 also edits `extension/utils/automation-logger.js` (persist `jevMeasurement` through a clone helper, key absent when no Jev activity). The dispatcher must `delete sanitized.jevMeasurement` and add an explicit projection, as Phase 66 does for `iterationTiming`. |
| F21 | **Stop is only checked at the top of an iteration.** | [VERIFIED: agent-loop.js:1743] | The fast-path call should abort its own `decide` when the session stops and, after every await, return from the iteration (no LLM call, no schedule) if `session.status !== 'running'`. |
| F22 | **Page-level ops conflict with "both accepted".** The instrument always asks operation and target together; for `scroll`/`go_back` the target answer is meaningless, and a `none_of_the_above` target makes `accept(result,'target')` return `catch_all`. | [CITED: 67-07 accept reasons; 67-03 questions] | Define: a page-level op acts when `accept(…,'operation')` is accepted and the target answer is **not** a confident element pick (`accept(…,'target')` not accepted for `catch_all`/`below_threshold`/`threshold_null`); a confident element pick contradicting a page-level op escalates. Record this in the plan explicitly (see Open Questions). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Switch storage, validation, MCP read/write | Extension config (`FsbSettingsSchema` in config.js) | Control panel (options.js + FSBSettingsSync) | 66.1 D-08: one schema is the single source of truth; the MCP tool needs no change. |
| Per-session flag (source gate, latch) | Extension SW (background.js `handleStartAutomation`/reactivation) | — | Only the start path knows `source`; the loop reads only the session field (D-05). |
| Decision orchestration (eligibility, budgets, policy, escalation, summary, measurement, capture) | Extension SW (`extension/ai/jev-fast-path.js`) | agent-loop.js (two guarded call sites) | Keeps agent-loop changes minimal and pins intact (D-08). |
| Request sanitizing, transport, threshold policy | Extension SW (Phase 67 `FsbJevState`/`FsbJevClient`/`FsbJevPolicy`) | FSB server gateway (Phase 67) | Consumed, not rebuilt. |
| Element menu, risk classification, visible-text excerpt, registry | Browser content script (dom-analysis.js, dom-state.js) | — | Only the page has element identity; values never leave it (D-13). |
| Freshness check and execution | Browser content script (messaging.js jev branch → existing tool handlers) | SW `_executeTool` | Existing machinery executes; strict resolver gates (D-14). |
| Measurement persistence and projection | Extension SW (automation-logger.js, mcp-tool-dispatcher.js) | — | Additive, absent for off sessions (D-23). |
| Disclosure | Control panel copy + showcase privacy page (static, 7 locales) | Chrome Web Store dashboard (V6) | D-06, D-07. |
| Shadow capture export | Bench tooling (Node ESM, `scripts/bench/shadow/`) | Extension SW capture store | Offline, CDP-read (D-22). |

## Standard Stack

### Core (all existing; nothing new is installed)

| Module | Where | Purpose in Phase 68 | Status |
|--------|-------|---------------------|--------|
| `FsbJevState` (`buildRequest`, `validateGatewayResponse`, `CONTRACT`, `scrubText`, `filterInjection`) | extension/ai/jev-state.js | Turn the menu into a request v1 with `idMap`; drop sensitive/vault elements | [CITED: 67-06] planned |
| `FsbJevClient` (`createJevClient`, `decide`, `DEFAULT_TIMEOUT_MS = 2500`) | extension/ai/jev-client.js | Never-rejecting POST to the fixed endpoint; tests inject `fetchImpl` | [CITED: 67-08] planned |
| `FsbJevPolicy` (`accept`) | extension/ai/jev-policy.js | The only reader of `meetsThreshold`/`threshold` | [CITED: 67-07] planned |
| `FsbSettingsSchema` (`entries`, `keys()`, `get`, `isWritable`, `create`) | extension/config/config.js | The switch entry (boolean, writable, default false) | [CITED: 66.1-01] planned |
| `FSBSettingsSync` (`keyForElementId`, `noteStorageChanges`, `applyToForm`, `filterForSave`) | extension/ui/options.js tail | Open panel follows MCP writes | [CITED: 66.1-04] planned |
| `getFilteredElements`, `inferElementPurpose`, `getImplicitRole`, `computeAccessibleName`, `isElementActionable`, `deepElementFromPoint`, `isFsbElement`, `generateSelectors`, `RefMap` | extension/content/* | Menu extraction, strict resolution | [VERIFIED: codebase] |
| `HookPipeline` BEFORE_TOOL_EXECUTION permission hook | extension/ai/hook-pipeline.js, hooks/permission-hook.js | Fast calls pass through it unchanged | [VERIFIED: agent-loop.js:2291-2326, background.js:4558-4589] |
| Bench `cdp.mjs` (`findExtensionWorker`, `evaluate`), `tasks.mjs` (`loadTasks`), 67-10 `records.mjs` (`validateRecord`, `checkLockReferences`) | scripts/bench/ | Exporter | [VERIFIED: cdp.mjs:183, :340]; records.mjs [CITED: 67-10] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keeping risky/text-entry elements in the menu but caller-ineligible | Dropping them from the menu | Dropping removes the true target and pushes Jev toward a confident wrong alternative; it also biases `recorded-llm` labels. Keep them; escalate if picked. |
| One SW module (+1 pin) | Two modules (logic + capture) | Each `importScripts` moves two pins and the 67-11 exact-globals check; one module with exported pure helpers is enough. |
| Guarded hand-back call at :2882 | Mutating a module-owned object from agent-loop | The call is clearer and testable; it is the edit D-10 already requires. |
| Synchronous session-field guard | Always calling the module | Any `await` on the off path changes microtask ordering; the guard keeps the off path byte-identical in behaviour. |

**Installation:** none.

## Package Legitimacy Audit

No external package is installed by this phase (no `package.json` dependency change; tests use `node:vm`, `node:test`, existing helpers). `slopcheck` is available at `/opt/homebrew/bin/slopcheck` but there is nothing to check.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 side panel / popup / dashboard start ──► handleStartAutomation (source != 'mcp')
 MCP run_task start ───────────────────► handleStartAutomation (source == 'mcp')
                                              │ storage read adds fsbJevFastModeEnabled (default false)
                                              ▼
                     stored === true ? session.fastMode = {enabled: source !== 'mcp', stored: true}
                                     : (no field at all)          ◄── follow-up reactivation recomputes (F8)
                                              │
 runAgentIteration ── BEFORE_ITERATION safety hook ── compaction ── screenshot expiry
                                              │
                         sync guard: session.fastMode present?
                          no ─────────────────────────────────────────────► existing LLM block (byte-identical)
                          yes ─► FsbFastPath.beforeTurn(session, ctx)  [try/catch → decline + latch]
                                   │ 1. session latch? command budgets? first LLM turn done? consecutive cap?
                                   │ 2. re-read stored switch (injected) → off ⇒ latch for session
                                   │ 3. content: getJevMenu {cap} ──► extractor + Jev registry (gen nonce)
                                   │ 4. caller-side eligibility (risk, text-entry, ops) ; page signature
                                   │ 5. FsbJevState.buildRequest({goal: session.task, …, vaultFilledIds})
                                   │ 6. FsbJevClient.decide(request, {signal, timeoutMs ≤ 2500})
                                   │ 7. FsbJevPolicy.accept(operation/target/completion/stuck)
                                   │ 8. accepted & eligible ⇒ static toolCall {name, args:{jevHandle,…}, source:'jev'}
                                   │    else ⇒ escalate: flush provider-neutral summary (+ hand-off snapshot)
                                   ▼
             {toolCall} ─► skip LLM block ─► existing tool loop: permission hook ─► _executeTool
                                                    │                                  │
                                                    │             content executeAction: jev branch FIRST
                                                    │             strict resolve (gen, alive, role, name,
                                                    │             visible, enabled, in-viewport, hit test,
                                                    │             unique selector) ─► existing handler
                                                    ▼
                         actionHistory, metrics, AFTER_TOOL_EXECUTION, meta-attempt (jev key, F1)
                                                    │
                         tool-result push replaced by FsbFastPath.afterStep(session, step, toolResults)
                                                    │ evidence: verification, outcome unknown, mayHaveExecuted,
                                                    │ refStale, bfCacheDetected, navigation, signature delta
                                                    ▼
                         persist ─► existing 100 ms schedule (unchanged line) ─► next iteration
 {decline} ─► same iteration continues on the LLM path (D-09)

 Capture (stored switch on AND loopback bench URL AND LLM-path iteration; source-agnostic):
   beforeTurn stores builder input + menu gen ─► content records the LLM call's resolved element
   (VIS-01 point) ─► afterwards label = (offered op | none_of_the_above, jev id | none_of_the_above)
   ─► bounded local ring ─► scripts/bench/shadow/export-capture.mjs (CDP read, rebuild goal, validateRecord)
```

### Recommended Project Structure

```
extension/
├── ai/jev-fast-path.js          # NEW classic SW module (IIFE, module.exports guard, one Fsb* global)
├── ai/agent-loop.js             # 2 guarded call sites + 1 _extractMetaTargetKey branch
├── background.js                # +1 importScripts; start/reactivation flag; deps helper
├── config/config.js             # +1 FsbSettingsSchema entry (+ Config.defaults copy, D-04)
├── config/init-config.js        # default copy (D-04)
├── content/dom-analysis.js      # menu extractor, risk classifier, visible-text excerpt (contiguous block)
├── content/dom-state.js         # Jev registry class + FSB.jevRefMap (after RefMap)
├── content/messaging.js         # 'getJevMenu' case; jev branch first in executeAction; capture observation
├── ui/control_panel.html        # card after Action Change Reports
├── ui/options.js                # default, cacheElements, listener, load, save (+ sync mapping if needed)
├── utils/automation-logger.js   # persist jevMeasurement (absent when unused)
└── ws/mcp-tool-dispatcher.js    # explicit jevMeasurement projection + actionHistory marker
scripts/bench/shadow/export-capture.mjs   # NEW exporter (Node ESM)
showcase/angular/src/app/pages/privacy/   # page edits + archive entry; src/locale/*.xlf via extract/sync
tests/ (new)  jev-fast-settings, jev-fast-menu, jev-fast-path, jev-fast-loop (+ fixtures/agent-loop-fast-harness.js),
              jev-fast-capture.test.mjs, jev-fast-measurement; extend showcase-privacy-page, meta-cognitive-tracker,
              jev-extension-boundary (narrowed), 66.1 count pins
```

### Pattern 1: Synchronous guard, one decision call, minimal skip branch

**What:** Every new line in `runAgentIteration` sits behind a plain-field check that is false when the switch is off, so no `await` is introduced on the off path.
**When to use:** The decision call (before `buildTurnMessages`, :1918) and the hand-back (in place of the push loop, :2882-2891).

```javascript
// Sketch only. Inside the existing try, after the screenshot-orphan expiry (agent-loop.js:1917).
// No setTimeout token, no stepName literal, no _currentStepName write.
var _fastStep = null;
if (session.fastMode && typeof globalThis !== 'undefined' && globalThis.FsbFastPath
    && typeof globalThis.FsbFastPath.beforeTurn === 'function') {
  try {
    _fastStep = await globalThis.FsbFastPath.beforeTurn(session, { sessionId: sessionId, iteration: iterNum });
  } catch (_fastErr) {
    _fastStep = null; // the module latches itself off; never reaches the API-error catch (F13)
  }
  if (session.status !== 'running') return; // stopped during the attempt (F21)
}
if (_fastStep && _fastStep.toolCall) {
  var toolCalls = [_fastStep.toolCall];
  var response = null;
  var inputTokens = 0, outputTokens = 0, iterationCost = 0; // no LLM turn this iteration
  var _timingRow = null;                                      // no v1 timing row (D-23)
} else {
  // existing lines :1918-2247 unchanged (left at their current indentation to keep the diff small)
}
```

```javascript
// In place of the tool-result push loop (agent-loop.js:2882-2891).
if (_fastStep && _fastStep.toolCall) {
  try { globalThis.FsbFastPath.afterStep(session, _fastStep, toolResults); } catch (_e) { /* module latches off */ }
} else {
  for (var ti = 0; ti < toolResults.length; ti++) { /* existing push, unchanged */ }
}
```

Variables the tool loop reads after the skipped block: `inputTokens`, `outputTokens`, `iterationCost` (AFTER_ITERATION payload and `lastTurnResult`), `response` (guarded `typeof response !== 'undefined' && response` at :2814), `_timingRow` (guarded at :2859), `providerKey` (defined before :1918). Set them explicitly; `var` hoisting would otherwise leave `undefined` in `_al_createTurnResult` [VERIFIED: agent-loop.js:2486-2489, :2952-2957, :3055-3071].

The TOOL_DISPATCH emission (:2342-2353) stays byte-identical; for a fast iteration its `previousStepName: 'LLM_TURN'` still names the command's last LLM turn. The `lattice-host` accepts any string, so changing it is possible but buys nothing and risks a pin.

### Pattern 2: Session state layout

| Field | Lifetime | Holds | Why |
|-------|----------|-------|-----|
| `session.fastMode` | session, rebuilt per command by background | plain data only: `{enabled, stored, source}`; **absent** when the stored switch is off | D-01: nothing new when off; plain data survives any serialization |
| `session._fastPath` | session (memory) | latch `{off:true, reason}`, consecutive-escalation count, pending summary lines, pending capture, measurement accumulator ref | D-16 session latch; never persisted by `persistSession` (it picks fixed fields, background.js:4962-4991) |
| `session.agentState.jevFast` | command (rebuilt by `hydrateAgentRunState`) | fast steps, Jev calls, Jev ms, consecutive fast steps, `llmTurnSeen`, last page signature, last fast op/target | Per-command budgets reset for free (F14) |
| `session.jevMeasurement` | session, persisted when non-empty | D-23 block | Additive; absent when no Jev activity |

Deps (switch reader, capture store read/write, content messaging, `createJevClient`) are created in background.js and resolved lazily by the module, never stored as session fields. `jev-*.js` may not reference `chrome.storage` (F12); `chrome.tabs.sendMessage` is allowed but injecting it keeps the module testable.

**First-LLM-turn rule (D-09):** after a command reset, require that `session.lastTurnResult` has changed since the reset and has `stopReason === 'tool_calls'` for a non-fast iteration. `lastTurnResult` is set at the end of every tool_calls iteration and on errors (`stopReason: 'error'`) [VERIFIED: agent-loop.js:3055-3071, :3104-3118]. Do not count iterations: numbers restart per command and an errored API call is not an LLM turn.

### Pattern 3: One attempt, in order (each failure is a decline or an escalation, never a retry)

1. `session._fastPath.off` → decline (no work).
2. Command not eligible: no LLM turn yet this command; `consecutiveFast >= MAX_CONSECUTIVE_FAST`; any per-command budget exhausted → decline, and for budgets latch fast mode off for the command (D-12; the task never ends because of it).
3. Re-read the stored switch (injected). Off → latch the session off (D-05).
4. Menu: `chrome.tabs.sendMessage(tabId, {action:'getJevMenu', options:{cap: MENU_CAP}}, {frameId:0})`, bounded by a short deadline that counts toward the wall-time budget. Failure, empty eligible set, non-http(s) page → decline without a Jev call (this is not an "escalation" for the consecutive-escalation latch).
5. `FsbJevState.buildRequest({kinds:['operation','target','completion','stuck'], goal: session.task, url, title, visibleText, elements, vaultFilledIds, recentActions, offeredOps})`. `ok:false` → `sensitive_goal` latches the command; `invalid_request` latches the session. **Superseded by the post-67 sync (sync issue 6):** a local `invalid_request` comes from the page (a target question with zero surviving elements, or a request that cannot fit the byte budget), so it latches the command (`local_invalid_request`), never the session; and the menu step declines `nothing_offerable` before calling `buildRequest` when no entry would survive its drop rules.
6. `decide(request, {signal, timeoutMs: min(DEFAULT_TIMEOUT_MS, remainingWallBudget)})`; count the call and its client-measured `latencyMs`.
7. Classify:

| Result | Action | Latch |
|--------|--------|-------|
| `ok:true` and `calibration.status !== 'calibrated'` | escalate | **session** (D-16) |
| fallback in `NON_TRANSIENT_REASONS` (`disabled`, `not_configured`, `spend_cap_reached`, `auth_error`, `upstream_billing`, `unavailable_model`) | escalate | **session** (D-16) |
| `invalid_request` (gateway 400, decide's own local refusal, or a 404 before the V2 deploy; a `buildRequest` refusal is step 5's command latch), `invalid_response` | escalate | **session** (recommended, F9) |
| `sensitive_goal` | escalate | **command** (recommended, F9) |
| `busy`, `timeout`, `rate_limited`, `upstream_overloaded`, `upstream_error`, `network_error`, `server_error`, `aborted` | escalate this iteration | counts toward the consecutive-escalation latch (D-16, D-18) |
| `payload_too_large`, `upstream_rejected` | escalate this iteration | counts toward the consecutive-escalation latch (recommended, F9) |
| `ok:true` calibrated: `accept(…,'stuck').accepted` | escalate (stuck hint in summary) | consecutive count |
| `accept(…,'completion')` not accepted for a reason other than `threshold_null` | hand to the LLM (it may be done) | consecutive count |
| operation or target not accepted (`below_threshold`, `catch_all`, `threshold_null`, `kind_absent`, `malformed`) | escalate | consecutive count |
| op not offered, op not in the element's ops, element risk-excluded or text-entry | escalate | consecutive count |

8. Accepted and eligible → return a static call built only from code-held values:
   - `click`/`hover`/`press_enter`: `{jevHandle, jevGeneration, expectedRole, expectedName}`
   - `check_box`: the same plus `checked: true` (F2)
   - `scroll`: `{direction: 'down'}` (no target)
   - `go_back`: `{}`

   No `text`, `value`, `selector`, `ref` or Jev-supplied string. Give it a unique `id` (for example `'jev_' + iterNum`), `source: 'jev'`, and a fixed `visual_reason` string if the overlay needs one.

`afterStep` (next to the result) maps evidence: `refStale` → escalate (freshness; nothing dispatched); `outcome:'unknown'` or `mayHaveExecuted:true` (read at `result.result`) or `bfCacheDetected` → escalate once, "may have executed; inspect the page before retrying"; a failure with no content response (`result:null`: a message channel closed by a navigating click, a closed tab, no answer) → the same "may have executed" escalation, and only the exact permission-hook denial text (`Tool "<name>" is not permitted for this origin`, or the loop's `Tool not permitted`) is reported as not permitted (post-67 sync, sync issue 2); `check_box` with `alreadyInState` → no progress; `success` with `verification.verified`, `navigationTriggered`, or a URL/title/signature change → progress. The same op on the same element without effect, or an unchanged page signature across fast steps (after any acted step, verified or not) → escalate and latch the command (D-17). The page signature must include state bits (checked, expanded, selected, pressed) or a successful tick looks like no progress.

### Pattern 4: Content menu, Jev registry, strict resolver

- **Registry:** a sibling class in dom-state.js (after `RefMap`) with handles `j1..jN`, a per-document random nonce plus counter as `generation`, WeakRefs, and the code-held role and name. `FSB.jevRefMap` is reset only by `getJevMenu`; `FSB.refMap` is never touched (D-14).
- **Extractor** (one contiguous block in dom-analysis.js, outside every sliced range tests use): `getFilteredElements({viewportComplete: true, prioritizeViewport: true, taskType: 'general', guideSelectors: null})`; main frame only; in-viewport first, document order; cap `MENU_CAP = 48`. Per entry: `{handle, role, label, ops, inputType, autocomplete, purpose: {sensitive, danger, intent}, hidden, risk: <code reason or null>, fastEligible, state: {checked, expanded, selected, pressed}}`. Also return the generation, a visible-text excerpt (F4), `location.href`, `document.title`, `moreBelow`, and a page signature. Never read `.value` (F18 allows only the `value` *attribute* of button-type inputs).
- **Ops per element** (code-derived subset of D-15):

| Element | ops | Fast-eligible |
|---------|-----|---------------|
| button / `[role=button]` / `summary` / `a[href]` / `[role=link\|tab\|menuitem\|option]`, not "on" | `click`, `hover` | unless risk-excluded |
| native checkbox/radio, unchecked | `check_box` | unless consent/subscribe/terms or risk-excluded |
| native checkbox/radio, checked or indeterminate; any `aria-checked`/`aria-pressed` of `true` or `mixed`; `aria-expanded`/`aria-selected="true"`; the `summary` of an open `details` (68-02 revision) | none (dropped by `buildRequest`) | — |
| `[role=checkbox\|switch]` with `aria-checked="false"` | `click` | unless risk-excluded |
| search field (`type=search` or `role=searchbox` only; superseded in the 68-02 revision: a search-purpose input no longer counts, because `inferElementPurpose`'s rule at `:384-387` matches `/search\|query\|q$\|find\|keyword/` over name/id/class) whose form, if any, holds no other user-editable control, no password, payment or OTP field and no submit control excluded by a name or purpose rule | `press_enter` | yes (narrowing of D-19) |
| other text-entry fields, textarea, contenteditable, select | `click` (listed so Jev sees them) | **no** (typing or selection needs the LLM) |
| file inputs, password/payment/OTP fields | dropped (`buildRequest` D-18 rules, or never extracted) | — |

  `offeredOps` = the union of the ops of the listed elements, plus `scroll` when `moreBelow`, plus `go_back` when the session has navigated in this command (planner's discretion).
- **Strict resolver** (messaging.js, first branch when `params.jevHandle` is present): reject if `selector`/`ref` is also present; check the generation; the WeakRef is alive and `isConnected`; role and accessible name are unchanged; `FSB.isElementActionable(el).actionable` is true; the centre is inside the viewport; then generate a CSS selector and require `document.querySelectorAll(sel).length === 1` and the match equal to `el` (else `selector_not_unique`); set `params.selector` and `FSB.elementCache.set(sel, el)` as the ref branch does (:1040-1062), and fall through to the existing handler. Every failure: `sendResponse({success:false, error, tool, refStale:true, reason}); return;`.

### Pattern 5: Provider-neutral hand-off

- One `role:'user'` message, flushed only when the LLM path is about to run and at least one fast step acted since the last LLM turn. It contains what was done (op, label, observed effect or "no visible change"), why fast mode stopped, uncertainty in plain words, and the hand-off snapshot from `getMarkdownSnapshot` with `{charBudget: 12000, maxElements: 80}` (the same message and budget the LLM's `get_page_snapshot` uses, agent-loop.js:2393-2408). That message resets `FSB.refMap`, which is intended here because the LLM receives the new refs in the same message.
- Labels in the summary pass through `FsbJevState.filterInjection(FsbJevState.scrubText(x))` and are quoted and marked as page text.
- Earlier hand-off snapshots collapse to a one-line marker found by a fixed prefix (D-10). A decline with no fast action adds nothing.

### Pattern 6: Capture and export (D-22)

- **Gate:** stored switch true (`session.fastMode.stored`), loopback fixture URL (`http://127.0.0.1:<port>/r/<token>/fixtures/<slug>/…` or `localhost`), LLM-path iteration. Recommended extra necessary condition: an internal arm key (not a setting, not in the schema) written only by the capture tooling over CDP, so the V4 fast-mode arm (after Phase 70, switch on, same fixtures) does not pay capture overhead (see Open Questions).
- **Before the LLM turn:** extract the menu (Jev registry only), store the builder input (goal-free) and the generation as `pending`.
- **Label:** operation is the LLM's first non-`report_progress` tool when it is an offered op, otherwise `none_of_the_above`; target is the Jev id of the element the LLM's call resolved to, found by identity at the content VIS-01 resolution point (messaging.js:1088-1100, which resolves `params.ref`/`params.selector` for every action) and sent to the SW only while a capture is armed. Drop the record when the observation is missing (for example after navigation) and count drops by reason.
- **Store:** a bounded ring in `chrome.storage.local` under one internal fsb-prefixed key (writer injected). Records never leave the machine except through the exporter.
- **Exporter** `scripts/bench/shadow/export-capture.mjs`: read the ring through `findExtensionWorker` + `evaluate`; map the slug to the core task through `loadTasks({set:'core'})`/`core.lock.json` (read-only); goal = the task instruction minus `Open {startUrl}.`; origin `http://127.0.0.1:4173`; path with any `/r/<segment>` prefix removed (match the segment generically, since a scrubbed path may hold `[REDACTED_TOKEN]`); rebuild with `FsbJevState.buildRequest` through `createRequire`; map labels through `idMap`; `provenance:'recorded-llm'`; labels for `completion/stuck/risk` null; `validateRecord` + `checkLockReferences`; write `<id>.json` to `--out` (default `scripts/bench/.local/shadow/recorded-llm/`) (F5, F6).

### Pattern 7: Measurement block (D-23)

```javascript
// Shape sketch; every missing number is null, never 0.
session.jevMeasurement = {
  v: 1,
  attempts: [ /* last 100 */ {
    iteration, command, decisionSource: 'jev',
    servedModel, instrumentVersion, calibrationStatus,   // null on fallback
    latencyMs, usage: { inputTokens, source }, cost: { usd, source },
    fallback,                                            // null when ok
    outcome: 'acted' | 'escalated' | 'declined',
    escalationReason, op                                 // null when not applicable
  } ],
  commands: [ { command, fastSteps, jevCalls, jevMs,
                usd: { provider: null | n, estimate: null | n }, escalations: { reasonCode: n } } ]
};
```

Never call `CostTracker.estimateCost` and never fold into `totalCost`. `automation-logger.js` persists it through a clone helper only when present, and `mcp-tool-dispatcher.js` deletes it from the generic copy and adds an explicit projection only when present (F20). `sanitizeActionHistoryEntry` may add `decisionSource:'jev'` only when `params.jevHandle` is present.

### Anti-Patterns to Avoid

- **Reusing `FSB.refMap` for the menu.** It silently re-points the LLM's refs (D-14).
- **`await` anywhere on the off path,** including `await` of a resolved value.
- **Reading `meetsThreshold`, `threshold` or `probabilities` outside `FsbJevPolicy.accept`** (D-20).
- **Building fast-call args from Jev output or page text** (labels in `expectedName` are code-held from the menu and used only for verification).
- **Treating `hadEffect` as evidence** (it equals success for content tools, tool-executor.js:129-130).
- **Calling `detectStuck` on the live session** (it mutates `agentState` and may attach `goalProgressTracker`).
- **Letting a fast-path exception reach the iteration's API-error catch** (F13).
- **Writing exporter output into `scripts/bench/shadow/records/`** (F6).
- **`JEV_*` identifiers, `https://` strings, `importScripts` or `chrome.storage` in the new module** (F12).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request sanitizing, ids, byte budget | Your own label/text scrubber or id mapper | `FsbJevState.buildRequest` | Mirrored and parity-tested with the server validator; drop rules and shrink order are contract. |
| Gateway transport, deadlines, cool-down | `fetch` + `AbortController` in the fast path | `FsbJevClient.createJevClient({fetchImpl, …}).decide` | Never rejects; typed fallbacks; injected timers; no credentials. |
| Threshold logic | Comparing `p`/`confidence` to numbers | `FsbJevPolicy.accept` | The only reader allowed (D-20); handles hostile fields and polarity. |
| Visibility, disabled, occlusion | A new hit test | `FSB.isElementActionable` + an in-viewport centre check | Already ignores FSB overlays and checks fieldsets and `aria-disabled`. |
| Accessible names and roles | New name computation | `FSB.getImplicitRole`; for names, superseded in the 68-02 revision: `jevMenuLabel` follows `computeAccessibleName`'s ARIA order but walks label text with control, option and editable descendants skipped (F4: `computeAccessibleName` returns a label's whole `textContent`) | Same order as what the LLM sees, without field contents. |
| Selector generation | Hand-built CSS | `FSB.generateSelectors` + a uniqueness check | Same path the ref branch uses. |
| Settings validation and MCP exposure | A new route or validator | One `FsbSettingsSchema` entry | 66.1 D-17: no `mcp/src` change. |
| Record validation | A second record validator | 67-10 `validateRecord` + `checkLockReferences` | One format, one validator. |
| i18n units | Hand-edited xlf contexts | `ng extract-i18n` + the sync/assemble scripts | CI diffs extraction byte-for-byte; line contexts shift on any template edit. |

**Key insight:** in this phase almost every hard problem already has an owner. The new code is mostly ordering, gating and evidence bookkeeping, and the danger is in skipping an existing gate or duplicating a validator, not in missing a library.

## Common Pitfalls

### Pitfall 1: The off path is "almost" identical
**What goes wrong:** An extra `await`, a storage write, a menu message, a hook registration or a `session.messages` entry appears with the switch off. V1's baseline at `8a058bdf` stops being "fast mode off" for V4.
**How to avoid:** `session.fastMode` absent when off; synchronous guard; the harness compares content messages, provider calls, tool calls and `session.messages` across (module not loaded) / (loaded, key absent) / (loaded, key false).
**Warning signs:** any new `chrome.storage.local.set` in the start path; a new hook in `createSessionHooks`.

### Pitfall 2: Toggling state Jev cannot see
**What goes wrong:** "Tick Alpha" when Alpha is already ticked unticks it (F2); an open accordion closes.
**How to avoid:** `checked: true`; no ops for "on" controls; include state bits in the signature.

### Pitfall 3: First-match purpose misses commits
**What goes wrong:** "Save", "Publish", `input[type=submit]`, a dialog's "Continue" get fast-clicked (F3).
**How to avoid:** a union-based classifier plus form-submission and dialog rules; tests from the 67-10 risk-true targets and a hostile `aria-label="Continue"` on a "Delete" button.

### Pitfall 4: Typed text in the excerpt
**What goes wrong:** a contenteditable draft or a chat composer's text goes to Jev, contradicting the disclosure (F4).
**How to avoid:** an editable-region-excluding text walker, with a test fixture.

### Pitfall 5: Stale decision on a new page
**What goes wrong:** the content script restarts after navigation, its counters restart, and `j3` in "generation 1" exists again (F16).
**How to avoid:** a per-document random generation nonce; generation mismatch means stale.

### Pitfall 6: Fall-through to the focused element
**What goes wrong:** a jev `press_enter` whose branch does not return on failure reaches the REF-LESS fallback and presses Enter on whatever is focused (F17).
**How to avoid:** the jev branch first, explicit returns, and a test where resolution fails while a field is focused.

### Pitfall 7: "Success" without dispatch
**What goes wrong:** `bfCacheDetected` success is reported as "clicked X" (F11).
**How to avoid:** treat it as may-have-executed.

### Pitfall 8: Silent breaker gap
**What goes wrong:** the meta-attempt counter never counts fast steps (F1).
**How to avoid:** a jev key branch plus a harness case with six fast attempts on one element (the fast latch should stop earlier; the counter must still see them).

### Pitfall 9: Unclassified fallback reasons
**What goes wrong:** before V2, every command pays up to N round trips to a 404 because `invalid_request` is treated as transient (F9).
**How to avoid:** the full table, tested over `CONTRACT.FALLBACK_REASONS`.

### Pitfall 10: Capture that never captures
**What goes wrong:** `sensitive_goal` on bench goals (F5); navigation drops every link-click label; records written where 67-10's test breaks (F6).
**How to avoid:** store builder input, rebuild the goal in the exporter, count drops, write to `.local`.

### Pitfall 11: Pin and boundary trips from naming and comments
**What goes wrong:** a comment containing "setTimeout" in agent-loop.js, "importScripts" in background.js or a jev module, "https://" in a jev module, a `JEV_` constant in a content script, or the word "Jev" in an options.js comment.
**How to avoid:** the F12 naming rules; run the pin suites after every commit that touches those files.

### Pitfall 12: Privacy page regressions
**What goes wrong:** editing the pinned telemetry Limited Use paragraph; forgetting the Policy History archive; hand-editing xlf line contexts; English text left as a "translation" (quality gate).
**How to avoid:** a separate fast-mode statement; archive the September 29 text under a new id; `ng extract-i18n` then the sync scripts; translate all six locales; product names `translate="no"`. Run `lint:i18n`, `verify:translation-drift`, `verify:translation-quality`, the extract diff and `tests/showcase-privacy-page.test.js` (extended).

### Pitfall 13: Disclosure claims that outrun facts
**What goes wrong:** the copy says TypeSafe does not retain requests, or names only one route.
**How to avoid:** use only what External Research 2 supports (TypeSafe states it does not train on inputs; US-hosted; retention "as long as reasonably necessary"); name both routes; V6 checks against V2's route. Post-67 sync: also scope every "sent" and "never sent" claim to what fast mode sends to FSB's server, because FSB's own LLM snapshot reads field values (`formatInlineRef`) and the hand-off snapshot goes to the user's AI provider; never write that FSB never reads typed text; open the fast-mode Limited Use statement with an affirmative compliance sentence.

## Code Examples

### A strict-resolver branch skeleton (messaging.js, before COMPACT REF RESOLUTION)

```javascript
// Source: pattern of messaging.js:1039-1062 (existing ref branch), made strict.
if (params && params.jevHandle !== undefined) {
  const verdict = FSB.resolveJevHandle ? FSB.resolveJevHandle(params) : { ok: false, reason: 'unavailable' };
  if (!verdict.ok) {
    sendResponse({ success: false, error: 'Fast-mode target is no longer current (' + verdict.reason + ').',
      tool, refStale: true, reason: verdict.reason });
    return;
  }
  params.selector = verdict.selector;          // unique, verified to match verdict.element
  FSB.elementCache.set(params.selector, verdict.element);
}
```

### A fallback-classification test driven by the contract

```javascript
// Source: 67-01 CONTRACT shape; plain-node check style (tests/server-telemetry-body-cap.test.js).
const { CONTRACT } = require('../extension/ai/jev-state.js');
for (const reason of CONTRACT.FALLBACK_REASONS) {
  const verdict = FsbFastPath.classifyFallback(reason);  // exported pure helper
  check(['session', 'command', 'iteration'].includes(verdict.latch), 'reason ' + reason + ' is classified');
}
check(FsbFastPath.classifyFallback('invalid_request').latch === 'session', 'a 404 before V2 never repeats');
check(FsbFastPath.classifyFallback('sensitive_goal').latch === 'command', 'the goal is fixed per command');
```

### A fake gateway returning a calibrated decision

```javascript
// Source: 67-08 createJevClient({fetchImpl, endpoint, now}); body must pass validateGatewayResponse.
function calibratedBody(request, picks) {
  return { ok: true, decisionId: 'd1', instrumentVersion: 'fsb-jev-instrument-1', servedModel: 'jev-1.13.0',
    calibration: { status: 'calibrated', profileId: 'test-calibrated' },
    decisions: {
      operation: { choice: picks.op, confidence: 0.95, probabilities: { [picks.op]: 0.97, none_of_the_above: 0.03 },
                   threshold: 0.9, meetsThreshold: true },
      target: { choice: picks.id, confidence: 0.95, probabilities: { [picks.id]: 0.97, none_of_the_above: 0.03 },
                threshold: 0.9, meetsThreshold: true },
      completion: { p: 0.05, threshold: 0.2, meetsThreshold: true },   // veto_when_low: p <= cut
      stuck: { p: 0.05, threshold: 0.8, meetsThreshold: false } },
    usage: { inputTokens: 900, source: 'provider' }, cost: { usd: 0.0000378, source: 'provider' }, latencyMs: 120 };
}
// Probability keys must equal the request's offered keys exactly (offeredOps or element ids, plus
// none_of_the_above), or validateGatewayResponse rejects the body as invalid_response.
const client = FsbJevClient.createJevClient({ endpoint: 'https://gateway.test/api/jev/decide',
  fetchImpl: async (url, init) => ({ status: 200, text: async () => JSON.stringify(calibratedBody(JSON.parse(init.body), picks)) }) });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ARCHITECTURE.md §3: a shared `refMap` menu, `maxIterations` counting LLM turns only, a live risk hook and card, a live done-veto | Separate registry (D-14), breakers count fast steps (D-12), risk by exclusion (D-19), completion as a precondition only (D-17) | 68-CONTEXT 2026-10-15 | Plans must not follow the superseded parts. |
| BYOK Jev in the extension (JEV-REFERENCE) | FSB gateway with a server-held credential (D-09 fixed endpoint) | 2026-09-28 milestone decision | No key, no endpoint setting in the extension. |

**Deprecated/outdated:** the `speedMode` legacy key (never reuse it); "maxIterations counts LLM turns only" (superseded).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 66.1-04 `applyToForm` refreshes a plain boolean whose element id equals the key without a per-key mapping entry. The plan text lists specific keys, so an explicit mapping line may be needed. **Resolved by the post-67 sync: an explicit `FIELD_REFRESHERS` entry is required (options.js ~:9668); 68-01 adds it.** | Standard Stack, Validation | MCP writes would not show in an open panel (V5) and the DOM-stub test would fail; fix with one mapping line in the same commit. |
| A2 | 67-11's boundary test enumerates the three module files (not a `jev-*.js` glob) and checks the exact names `FsbJevState/Client/Policy`. **Post-67 sync: the module list is enumerated (`MODULES`), but the caller rule is the prefix `/FsbJev[A-Za-z_$]*/`, and an exact jev-*.js file-set check exists; 68-04 adds the new module as a fourth enumerated module.** | F12 | If it globs or prefix-matches, the new module and call sites need the D-06 widening. |
| A3 | Numeric defaults: `MENU_CAP` 48, fast-step cap 12 per command, Jev-call cap 16, wall budget 20 s per command (menu extraction + decide), `MAX_CONSECUTIVE_FAST` 3, consecutive-escalation N 3, per-call timeout `min(2500, remaining)`, menu deadline 1.5 s, capture ring 200 records. | Pattern 3 | Wrong values change V4 speed or cost only; none affects safety. Recalibrate after V3. |
| A4 | `press_enter` restricted to search fields (narrower than D-19). | Pattern 4 | Fewer fast steps on non-search Enter flows; safe direction. |
| A5 | The 67-01 high-entropy rule will be implemented exactly as written, so most bench goals are `sensitive_goal` (F5). **Confirmed by the post-67 sync: the F5 probe goal returns `{ok:false, reason:'sensitive_goal'}`.** | F5 | If the implementation differs, capture could build requests directly; the input-storing design still works. |
| A6 | Exact fixture paths and labels for the risk-classifier oracle come from the 67-10 records once they exist. | Pitfall 3 | Write the oracle test after 67-10 lands, or from the fixture HTML directly. |

## Open Questions (RESOLVED)

1. **Page-level ops and the "both accepted" rule (F22).** RESOLVED: adopted in 68-04 `evaluateDecision` (page ops act when the operation is accepted and the target answer is catch_all, below_threshold or threshold_null; a confident element pick escalates `page_op_with_target`; both branches tested in `tests/jev-fast-path.test.js`).
   - Known: the instrument always asks operation and target together.
   - Unclear: whether `scroll`/`go_back` should require a target answer.
   - Recommendation: act when the operation is accepted and the target is not a confident element pick; escalate otherwise. State it in the plan and test both branches.
2. **Capture arm key versus V4 overhead.**
   - Known: D-22 gates capture on switch + loopback URL + LLM path; V4's fast-mode arm after Phase 70 runs the same fixtures with the switch on.
   - Recommendation: add an internal, non-settings arm key written by the capture tooling (a tightening of "only when all of these hold"); record in VALIDATION that V4 runs leave it unset.
   - RESOLVED: adopted in 68-08 (`fsbJevCaptureArmed`, read at most once per command, written only by `export-capture.mjs --arm`; not an `FsbSettingsSchema` key); "arm key unset in every arm" is recorded in M-68-05 (V4).
3. **Where recorded-llm records are committed.**
   - Known: 67-10 asserts exactly 25 hand records; 67-12 reads one `--records` directory.
   - Recommendation: export to `.local`; V3 owner decides whether to commit a second records directory or amend 67-10's assertion.
   - RESOLVED: 68-08 exports only to `scripts/bench/.local/shadow/recorded-llm/` and never writes `scripts/bench/shadow/records/`; where to commit is the owner decision M-68-04 (V3).
4. **The fast-path module's global name** (F12, A2). Recommend `FsbFastPath` unless the sync re-check shows the boundary test is name-exact. RESOLVED: 68-04 uses `FsbFastPath` (no `FsbJev` prefix, so the "only jev-*.js references FsbJev*" rule is untouched) and adds it to the exact-globals check; 68-01 Task 1 records the boundary rule's real form (68-SYNC-RECHECK.md item e), and its drift substitutions override the name if the real rule requires it.
5. **Bench goal `sensitive_goal` for Phase 70/V4 (F5).** Not Phase 68's to fix, but VALIDATION should record it so Phase 70 or V4 does not discover fast mode silently inert on every bench run. RESOLVED: 68-01 Task 1 runs the F5 probe (68-SYNC-RECHECK.md item g), 68-08's exporter rebuilds goals without the run token, and the count of bench goals returning `sensitive_goal` is recorded as part of M-68-05 (V4).
6. **Default copies (D-04).** The `fsbChangeReportsEnabled` precedent keeps its default only in options.js and the schema; D-04 locks all three copies. Either satisfies the 66.1-02 parity test (a key absent from a copy is skipped). Follow D-04. RESOLVED: 68-01 Task 2 writes `false` into `Config.defaults`, `init-config.js` and `options.js` `defaultSettings` plus the schema entry, in one commit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all tests | ✓ | v24.14.1 locally; CI Node 20 | `npx --offline -y node@20` is cached (v20.20.2) for Node 20 runs of the new suites |
| npm | test chain, showcase scripts | ✓ | 11.19.0 | — |
| showcase/angular node_modules (`ng extract-i18n`, i18n lint) | privacy plan | ✗ in this planning worktree; ✓ in the execution tree (414 entries) | — | Executors run in the main tree |
| showcase/server node_modules | none in Phase 68 | ✓ execution tree | — | — |
| Port 7225 | full `npm test` chain | held by the hub (pid 48247) | — | Since 2026-10-12 all suites pass with the hub up; new suites must not bind ports |
| Chrome / live gateway / Jev | V2-V5 only | not needed | — | Deferred to the Validation Block |
| slopcheck | package audit | ✓ | — | N/A (no packages) |

**Missing dependencies with no fallback:** none for automated work.
**Missing dependencies with fallback:** showcase deps in this worktree (execute in the main tree).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Plain Node scripts (`node tests/<file>.test.js`, check helper, `process.exit(failed > 0 ? 1 : 0)`) for extension code; `node:vm` slice-and-eval with stub DOM objects for content scripts (precedents: tests/selector-fail-closed.test.js, tests/dom-analysis-viewport-priority.test.js); `node:test` for the ESM exporter (`node --test tests/jev-fast-capture.test.mjs`) |
| Config file | none; root `package.json` `test` chain (304 commands at `e1e6439c`) |
| Quick run command | the task's own suite, e.g. `node tests/jev-fast-path.test.js` |
| Full suite command | `npm run validate:extension && npm test` (Node 20 conditions; restore the crawler files afterwards) |
| Regression sweep | `node scripts/bench/sweep-tests.mjs --files <edited files> --baseline <phase baseline json>` in the background, never with `timeout` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTO-01 | Schema entry: boolean, writable, default false; counts move to 36/25; no default divergence; inventory parity | unit | `node tests/settings-schema.test.js` (66.1, counts bumped) | ❌ until 66.1 lands |
| AUTO-01 | Settings route reads and writes the real key; no `mcp/src` diff | contract | 66.1-05/07 route suites with the real key + `git diff --quiet -- mcp/` | ❌ until 66.1 lands |
| AUTO-01 | Panel: default, cacheElements, listener, load (`?? false`), save, card, unchecked, recipient and "never sent" phrases | source-regex | `node tests/jev-fast-settings.test.js` | ❌ W0 |
| AUTO-01 | Open panel follows an MCP write; Save never reverts it | DOM-stub | `node tests/jev-fast-settings.test.js` (FSBSettingsSync cases) | ❌ W0 |
| AUTO-01 | Off path equals pre-milestone (module absent vs loaded with key absent vs false); `fsb://config` and the tool list unchanged | harness + hash | `node tests/jev-fast-loop.test.js` + existing tool-definitions/registry-hash and `fsb://config` suites | ❌ W0 |
| AUTO-01 | Boundary suite narrowed only by the allowlist; other bans unchanged | static | `node tests/jev-extension-boundary.test.js` | ❌ until 67-11 |
| AUTO-01 | Privacy page: fast-mode section, recipients, never-sent list, retention, Limited Use statement, archive entry, date; telemetry pins unchanged; i18n gates | static + CI scripts | `node tests/showcase-privacy-page.test.js && npm --prefix showcase/angular run lint:i18n && npm --prefix showcase/angular run verify:translation-quality && npx --prefix showcase/angular ng extract-i18n --output-path /tmp/x && diff -u showcase/angular/src/locale/messages.xlf /tmp/x/messages.xlf` | ✅ (extend) |
| AUTO-02 | Menu: no values (`.value` never read; button-input `value` attribute only), drop rules, cap and order, generation nonce, ops table, risk reasons, text excerpt excludes editable regions | unit (vm stubs) | `node tests/jev-fast-menu.test.js` | ❌ W0 |
| AUTO-02 | Strict resolver: stale generation, gone, renamed, role change, hidden, disabled, occluded, out of viewport, non-unique selector, selector+jevHandle conflict; first-branch order; no dispatch on failure | unit (vm stubs) | `node tests/jev-fast-menu.test.js` | ❌ W0 |
| AUTO-02 | Accepted step executes through `_executeTool` with the jev handle; no LLM call that iteration; permission hook still runs and can deny | harness | `node tests/jev-fast-loop.test.js` | ❌ W0 |
| AUTO-03 | `type_text`/`select_option` never offered; text-entry targets escalate; first iteration of every command (new and follow-up) is LLM-only; static check that fast calls carry no `text`, `value`, `selector`, `ref` or free `direction` | unit + static | `node tests/jev-fast-path.test.js` | ❌ W0 |
| AUTO-03 | Every non-accepted `accept` reason and every fallback escalates; uncalibrated latch makes at most one call per session | unit + harness | `node tests/jev-fast-path.test.js && node tests/jev-fast-loop.test.js` | ❌ W0 |
| AUTO-04 | Budgets (fast steps, Jev calls, Jev ms, consecutive fast steps) switch to LLM-only and never end the task; breakers count fast iterations; fast path never calls `complete_task`/`partial_task`/`fail_task` | harness | `node tests/jev-fast-loop.test.js` | ❌ W0 |
| AUTO-04 | Completion veto and stuck flag handling; no-progress detection with state bits; meta-attempt counter sees jev calls | unit + slice | `node tests/jev-fast-path.test.js && node tests/meta-cognitive-tracker.test.js` | ✅ (extend) / ❌ W0 |
| AUTO-04 | Measurement block: nulls not 0, no `estimateCost`, no v1 timing row for fast iterations; persisted and projected only when present; off-session detail byte-identical | unit | `node tests/jev-fast-measurement.test.js` | ❌ W0 |
| AUTO-05 | `outcome:'unknown'`, `mayHaveExecuted`, `bfCacheDetected`, `refStale`: exactly one dispatch, escalate once, truthful summary | harness | `node tests/jev-fast-loop.test.js` | ❌ W0 |
| AUTO-05 | Summary pairing: no unpaired tool messages for xai/openai/anthropic/gemini/openrouter/lmstudio/custom formatters | harness (captured request bodies) | `node tests/jev-fast-loop.test.js` | ❌ W0 |
| AUTO-05 | Exception in the module never ends the session; stop during an attempt makes no LLM call | harness | `node tests/jev-fast-loop.test.js` | ❌ W0 |
| AUTO-05 | Tighten-only and breaker invariance unchanged | existing | `node tests/jev-policy-tighten-only.test.js` | ❌ until 67-07 |
| AUTO-02/03 (capture) | Gate, label rules, drop counting, exporter rewrite (origin, `/r/` prefix, goal), id format, `validateRecord`/`checkLockReferences`, temp-dir output only, `core.lock.json` bytes unchanged | node:test | `node --test tests/jev-fast-capture.test.mjs` | ❌ W0 |
| all | Pins: lattice importScripts (+1), iterator guard, step emitter, survivability, sidepanel setTimeout counts, content-script completeness | existing | `node tests/lattice-provider-bridge-smoke.test.js && node tests/agent-loop-iterator-guard.test.js && node tests/lattice-step-emitter-smoke.test.js && node tests/lattice-survivability-smoke.test.js && node tests/sidepanel-tab-aware-smoke.test.js && node tests/extension-content-script-files-completeness.test.js` | ✅ |

### Sampling Rate

- **Per task commit:** the task's suite plus every pinned suite for files touched (table above); `node tests/delegation-phase-contract.test.js` whenever `package.json` changes.
- **Per wave merge:** all `tests/jev-*` suites, the 66.1 settings suites, `tests/showcase-privacy-page.test.js`.
- **Phase gate:** `npm run validate:extension && npm test` green under Node 20 conditions; restore crawler files; the D-24 pin audit; `git diff --quiet -- mcp/`.

### Wave 0 Gaps

- [ ] `tests/fixtures/agent-loop-fast-harness.js`: drives `runAgentIteration` with a captured `setTimeout` (one iteration per step; `sleep(900)` resolved immediately), `chrome.runtime.sendMessage` returning `lattice-provider-execute` envelopes (pattern: tests/agent-loop-empty-contents.test.js), `chrome.tabs.sendMessage` per-action stubs, a real `HookPipeline` with the permission hook, `globalThis.fsbBroadcastAutomationLifecycle`, and an event log of content messages, provider calls, tool calls and `session.messages`.
- [ ] Fake-gateway helpers (calibrated, uncalibrated, every fallback) built on `createJevClient({fetchImpl})`.
- [ ] Content stub-element kit (rect, computed style, `closest`, `form`, `getAttribute`, `isConnected`, `deepElementFromPoint`) for the vm-loaded dom-analysis/dom-state/messaging slices.
- [ ] Registration of each new suite in `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS` in its creating commit.

### Manual-Only Verifications (Validation Block)

| Tag | Item | Why manual |
|-----|------|-----------|
| V1 | None for Phase 68: fast mode is default-off and the baseline runs at `8a058bdf`. Record an explicit "none". | — |
| V2 | None of Phase 68's own; the live gateway is needed only for V3. Note: before V2 the production host has no `/api/jev/decide` (expect `invalid_request`, session latch). | — |
| V3 | Run bench campaigns with the switch on and the capture arm set; export with `export-capture.mjs` to `.local`; check drop counts by reason (navigation, missing observation, empty menu); assemble a run directory with the hand seeds; calibrate on the V2 pin; confirm a calibrated profile makes the fast path act on fixtures; freeze `MENU_CAP` and ordering; review "not a fit" questions (completion especially); decide where recorded-llm records are committed (67-10 assertion). | Live model and spend |
| V4 | Baseline vs non-Jev control vs fast mode (through `run_task` after Phase 70); confirm the capture arm is unset and check how many goals were `sensitive_goal` (F5); fast mode stays default-off unless the gate passes. | Release gate |
| V5 | The card and copy in the real panel; an MCP write refreshes an open panel; a real task with the switch on and the gateway disabled or uncalibrated (exactly one attempt, nothing acts, nothing visible changes); real-page freshness on a re-rendering site; truthful escalation summaries; a stuck page stops truthfully; human review of translated privacy text. | Human eye, real pages |
| V6 | Deployed privacy page; Chrome Web Store privacy-practices form (declare "Website content" and "Web history"; the three certifications; consistency with the policy); listing text; route sentence matches V2's route; MCP-enable consent review (an MCP client can turn the switch on without seeing the disclosure). | Release, dashboard, policy |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No credential in the extension (D-09) |
| V3 Session Management | no | — |
| V4 Access Control | yes | Existing BEFORE_TOOL_EXECUTION permission hook runs for fast calls; risk exclusion; consent/payment/vault paths never fast |
| V5 Input Validation | yes | `FsbJevState.validateGatewayResponse` (exact keys); strict resolver; static call builder; content message shape checks |
| V6 Cryptography | partial | `crypto.getRandomValues` for the generation nonce only; nothing hand-rolled |
| V8 Data Protection | yes | No values; editable-region exclusion; `buildRequest` drop rules and scrubbing; origin + path only; local-only capture store; measurement without page content |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Page text steering Jev to a harmful click | Tampering / Elevation | Goal is the user's task only (D-11); injection filter; calibrated thresholds; risk exclusion by union classifier; catch-all; LLM keeps commits |
| Label spoofing (`aria-label="Continue"` on a Delete button) | Spoofing | Risk patterns over the union of name sources and text; dialog rules |
| Stale or re-rendered target | Tampering | Generation nonce, identity, role/name, actionability, in-viewport hit test, unique selector; no CSS fallback |
| Duplicate side effect on an uncertain outcome | Repudiation / Tampering | Never retry; escalate once; "inspect before retrying" |
| Typed text or secrets leaving the machine | Information disclosure | No values; editable exclusion; scrubber; vault-filled drop; disclosure copy |
| Prompt injection via the hand-off summary | Tampering | Labels filtered and quoted as page text |
| MCP client enabling fast mode silently | Elevation / Repudiation | Write logged (66.1 D-18); V6 policy review |
| Fast-path fault ending the session | Denial of service | Local try/catch, latch off, LLM continues |

## Sources

### Primary (HIGH confidence)
- Codebase at `e1e6439c`: extension/ai/agent-loop.js (:185-300, :837-897, :1265-1412, :1451-3184), extension/ai/tool-executor.js (:88-180, :840-890), extension/ai/action-history.js (:39-101), extension/background.js (:1000-1080, :4558-4660, :4962-4995, :13730-14200), extension/content/messaging.js (:895-913, :1005-1170), extension/content/dom-analysis.js (:263-505, :1838-1960, :2168-2230, :2537-2580), extension/content/dom-state.js (:600-800), extension/content/selectors.js (:440-590), extension/content/accessibility.js (:100-280), extension/content/actions.js (:200-242, :2270-2330, :2636-2715, :5003-5043), extension/utils/automation-logger.js (:941-1100), extension/ws/mcp-tool-dispatcher.js (:2200-2280, :2540-2680), extension/ui/control_panel.html (:600-640), extension/ui/options.js (fsbChangeReportsEnabled sites), extension/config/{config,init-config}.js, scripts/bench/{fixture-server,run-bench}.mjs, scripts/bench/lib/{cdp,outcome}.mjs, scripts/bench/tasks/core.lock.json, showcase privacy page + archive, tests/{agent-loop-iterator-guard,lattice-step-emitter-smoke,lattice-survivability-smoke,lattice-provider-bridge-smoke,meta-cognitive-tracker,change-report-settings-ui,showcase-privacy-page,selector-fail-closed,dom-analysis-viewport-priority,agent-loop-empty-contents,delegation-phase-contract}.test.js, .github/workflows/ci.yml (:140-190).
- Planned interfaces: 67-01, 67-03, 67-06, 67-07, 67-08, 67-10, 67-11, 67-12 PLANs; 67-CONTEXT D-07..D-30; 66.1-CONTEXT D-08..D-23; 66.1-01/02/04 PLANs; 68-CONTEXT; 68-DISCUSSION-LOG External Research 1-3.

### Secondary (MEDIUM confidence)
- Chrome Web Store Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use (transfers only when "necessary to providing or improving your single purpose", law, security, or merger with consent; human-reading limits) [CITED, fetched 2026-10-15]
- Chrome Web Store user data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq ("All extensions that request user data must show a Limited Use disclosure on your project's homepage or on a page one click away"; website content counts as user data) [CITED, fetched 2026-10-15]

### Tertiary (LOW confidence)
- TypeSafe and OpenRouter retention/training terms as summarized in 68-DISCUSSION-LOG External Research 2 (not re-fetched in this session).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for FSB code; MEDIUM for 66.1/67 module APIs (planned, quoted from PLANs).
- Architecture: HIGH for seams and pins (read and grep-verified); MEDIUM for the capture-label mechanism (needs the content observation path proven in tests).
- Pitfalls: HIGH for F1-F4, F8, F10-F21 (code-verified); MEDIUM for F5 (depends on the 67-01 scrubber as implemented) and F12 (depends on 67-11's exact test text).

**Research date:** 2026-10-15
**Valid until:** the D-24 sync re-check after Phases 66.1, 67 and 69 execute (re-verify interface names, pin values and the boundary-suite text then); otherwise 30 days.
