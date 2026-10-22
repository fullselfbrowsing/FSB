---
phase: 68-autopilot-fast-mode
plan: 06
subsystem: service-worker
tags: [jev, fast-mode, agent-loop, background, harness, golden, off-path, d-01, d-03, d-05, d-06, d-08, d-09, d-10, d-19, f1, f8, f13, f21, auto-01, auto-02, auto-03, auto-04, auto-05]

# Dependency graph
requires:
  - phase: 68-05
    provides: "FsbFastPath.beforeTurn / afterStep / observeTools / flushHandoff / abortInFlight and the dependency contract {now, readSwitch, requestMenu, requestSnapshot, getTabUrl, jevClient?}"
  - phase: 68-04
    provides: "buildStaticCall (the fast call object with pagePath) and tests/fixtures/jev-fake-gateway.js"
  - phase: 68-02
    provides: "the getJevMenu content handler and the menu shape"
  - phase: 68-01
    provides: "the stored key fsbJevFastModeEnabled (default false)"
provides:
  - "extension/background.js loads ai/jev-fast-path.js and defines fsbFastModeSessionField, fsbFastPathWithDeadline, fsbCreateFastPathDeps (globalThis.fsbFastPathDeps) and fsbRecomputeFastModeForFollowUp"
  - "session.fastMode set at start and recomputed per follow-up (after a pending hand-off flush); handleStopAutomation aborts an in-flight decision"
  - "two guarded seams in runAgentIteration and the jev:<pagePath>:<role>:<name> meta-attempt key"
  - "tests/fixtures/agent-loop-fast-harness.js: a driver for the real runAgentIteration"
  - "tests/fixtures/jev-fast-loop-off-golden.json: the switch-off run captured from the unedited loop"
affects: [68-07, 68-08, 68-09, 68-11, V4, V5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A golden captured from the unedited loop before the seams, compared after them (D-01 proven against a pre-edit record, not against itself)"
    - "Background helpers extracted from background.js by name and evaluated in a vm context or in the test realm, so tests run the shipped code"
    - "Source-slice check that the off path gains no await, return or status read (seam 1 guard shape)"

key-files:
  created:
    - tests/jev-fast-start-path.test.js
    - tests/fixtures/agent-loop-fast-harness.js
    - tests/fixtures/jev-fast-loop-off-golden.json
    - tests/jev-fast-loop.test.js
    - .planning/phases/68-autopilot-fast-mode/68-06-SUMMARY.md
  modified:
    - extension/background.js
    - extension/ai/agent-loop.js
    - tests/lattice-provider-bridge-smoke.test.js
    - tests/jev-extension-boundary.test.js
    - tests/meta-cognitive-tracker.test.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "A fast iteration reaches the existing TOOL_DISPATCH emission unchanged, so it reports previousStepName 'LLM_TURN' and emits no LLM_TURN of its own (D-08 planner's choice within the pins)"
  - "The follow-up recompute order is flushHandoff (only when _fastPath exists), then one read of fsbJevFastModeEnabled, then assign or delete session.fastMode"
  - "readSwitch reads chrome.storage.local directly under a 3000 ms deadline and resolves true only for a stored boolean true"
  - "The harness holds timers of 1000 ms or more and runs shorter ones on the next macrotask; a microtask rule would abort every scripted provider answer through the bridge's own request deadline"
  - "The loop cases use the real background.js fsbCreateFastPathDeps over the harness's chrome stub, so menu, snapshot and switch reads appear in the event log"

patterns-established:
  - "68-07..68-09 extend tests/jev-fast-loop.test.js through createHarness; the golden is never regenerated"
  - "Any new background.js jev text must be one of BACKGROUND_JEV_TOKENS (68-08 adds its own tokens there)"

requirements-completed: [AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05]

# Metrics
duration: 20min
completed: 2026-10-17
---

# Phase 68 Plan 06: Wiring the fast path into the running extension Summary

**The service worker now loads the fast-path module. A non-MCP autopilot session carries `session.fastMode` only when the stored switch is a boolean `true`, and `run_task` gets `enabled:false`. A follow-up delivers any pending hand-off before it recomputes the field, and a stop aborts an in-flight decision. `runAgentIteration` gained one guarded `beforeTurn` call and one guarded `afterStep`/`observeTools` hand-back. An accepted step runs through the existing permission hook and `_executeTool` with no provider call and no tool message. With the field absent, three runs (module not loaded; loaded; loaded with the switch false) equal a golden captured from the loop before the seams existed.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-17T10:12:45Z
- **Completed:** 2026-10-17T10:33Z
- **Tasks:** 3 of 3
- **Files:** 4 created, 7 modified

## Accomplishments

### Task 1: background.js (commit `53576b7e`)

- **Load line.** `importScripts('ai/jev-fast-path.js');` is the line right after `importScripts('ai/jev-policy.js');`, with no comment line.
- **importScripts pins** (tests/lattice-provider-bridge-smoke.test.js), moved in the same commit:

  | Pin | Before (P68_START / c7a7d66f) | After (`53576b7e`) | Ledger line added |
  | --- | --- | --- | --- |
  | token count `/importScripts/g` | 337 | **338** | "Phase 68 adds the fast-path decision module -> 338." |
  | call sites `/importScripts\(/g` | 333 | **334** | "Phase 68's fast-path module is call site 334." |

  Both assertion messages now name the fast-path module. No background.js comment contains the word importScripts.
- **`fsbFastModeSessionField(storedValue, source)`.** It returns `{enabled: source !== 'mcp', stored: true, source}`, with `source` set to null when it is not a string, and only for a stored boolean `true`. Any other value returns `null`, so the field is absent.
- **`fsbFastPathWithDeadline(promise, ms)`.** Resolves the value, or null on rejection or at the deadline. The timer is cleared when either settles.
- **`fsbCreateFastPathDeps()` / `globalThis.fsbFastPathDeps`.** Creating it makes no chrome call. The members:
  - `now` is `Date.now`.
  - `readSwitch` reads `chrome.storage.local.get(['fsbJevFastModeEnabled'])` under a 3000 ms deadline. It resolves true only for a boolean `true`, and false on a throw, a rejection or the deadline.
  - `requestMenu(tabId, options, deadlineMs)` sends `{action:'getJevMenu', options}` with `{frameId: 0}`.
  - `requestSnapshot(tabId, deadlineMs)` sends `{action:'getMarkdownSnapshot', options:{charBudget:12000, maxElements:80}}` with `{frameId: 0}`.
  - `getTabUrl` returns the tab's url or null.

  Each member resolves null or false on failure and never rejects.
- **`fsbRecomputeFastModeForFollowUp(existingSession, source)`.** The follow-up flush order is:
  1. `FsbFastPath.flushHandoff(existingSession)`, only when `existingSession._fastPath` exists. Errors are swallowed because the module latches itself.
  2. One read: `getStorageWithTimeout(['fsbJevFastModeEnabled'], 3000, {fsbJevFastModeEnabled:false})`.
  3. Assign `existingSession.fastMode` from `fsbFastModeSessionField`, or `delete` it.

  The helper writes no storage and never rejects.
- **Start path.** `'fsbJevFastModeEnabled'` was added to the settings-read key array and `fsbJevFastModeEnabled: false` to its defaults. `const fastModeField = fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source);` runs before the sessionData literal, and `...(fastModeField ? { fastMode: fastModeField } : {}),` sits right after the agentId spread. The agent-kind early return still comes first (D-03).
- **Follow-up path.** `await fsbRecomputeFastModeForFollowUp(existingSession, source);` is the statement right before `const reactivationHooks = createSessionHooks(sessionId);`, after the resetDOMState message.
- **Stop path.** Right after the "Found session to stop" debug line, `FsbFastPath.abortInFlight(session)` runs inside `if (session._fastPath && ...)`.
- **Untouched.** `createSessionHooks` is byte-identical (SHA-256 `10ce1a54…` matches item h). `persistSession` and `CONTENT_SCRIPT_FILES` are untouched.
- **Boundary suite narrowed (D-06).**
  - The background.js check expects `ALL_MODULES`: four load lines (state, client, policy, fast path), adjacent, directly after `ai/model-discovery.js`.
  - Every other line may mention jev only inside the word-bounded tokens in `BACKGROUND_JEV_TOKENS = ['fsbJevFastModeEnabled', 'getJevMenu']`.
  - Self-test probes confirm that `// Jev fast mode`, `fsbJevOther`, `getJevMenuX`, `xgetJevMenu`, `fsbJevFastModeEnabledX`, a jev comment after an allowed token, `jevFast`, a fifth load line, a missing fast-path line, a gap and a reordering are all still reported. The two allowed forms pass.
  - Every other rule is unchanged, and `MODULES` still exists for the upstream tripwire. The suite has 164 checks.

### Task 2: the harness and the golden (commit `d8bac390`)

- **`tests/fixtures/agent-loop-fast-harness.js`** exports:
  - `createHarness`;
  - `goldenProviderScript`, `runGoldenScenario`;
  - `openAiToolResponse`, `defaultContentResponder`;
  - `normalise`, `normaliseRequestBody`, `digestText`, `sha256`;
  - `DEFAULTS`, `HOLD_MIN_MS`.

  **`createHarness(opts)` options:** `{providerKey, model, task, pageUrl, tabId, sessionId, loadFastPath, sessionPatch, contentResponder, providerScript, deps, jevResponder, jevClient, permissionDenies, storage}`.

  **What it returns:**
  - **The session and its setup:** `session`, `sessionId`, `options`, `pipeline`, `permissionContext`.
  - **Records of the run:** `events`, `providerRequests`, `contentMessages`, `storage` and `consoleLines` (console output is captured during `step()`).
  - **Timers and the fast path:** `heldTimers`, plus `jevTimers` and `jevClient` (fake-gateway held timers), and `fastPath`.
  - **Methods:** `step()`, `snapshot()` (returns `{events, final}`), `finalState()` and `dispose()`.
  - **Counters:** `scheduled`, `stepsRun` and `providerCalls`.

  **What is real and what is stubbed:**
  - **Real:** the hook pipeline. A `HookPipeline` carries the safety-breaker hook on BEFORE_ITERATION and `createPermissionHook(new PermissionContext())` on BEFORE_TOOL_EXECUTION. `permissionDenies` overrides `isAllowed` on that one instance.
  - **Stubbed:** chrome. `runtime.sendMessage` answers `lattice-provider-execute` from the script. `tabs.sendMessage`, `tabs.get`, `tabs.query`, `scripting` and `storage.local`/`storage.session` all record what they receive.
  - **Stubbed globals:** `fsbBroadcastAutomationLifecycle` and `automationLogger`.
- **Event log:** `step`, `provider`, `provider-abort`, `runtime`, `content`, `status`, `dashboard`, `persist`, `lifecycle`, `endOverlays`, `cleanup`, `storage-get`, `storage-set`, `storage-remove`, `cdp`, `schedule`. The final state holds status, outcome, iterationCount, messages, actionHistory and toolCallLog.
- **Normalisation rules:**
  - **N1:** values under `timestamp`, `startTime`, `startedAt`, `durationMs`, `elapsedMs`, `capturedAt` or `lastActiveTime` become `'<time>'`.
  - **N2:** the text of a `role:'system'` message, in the session and in request bodies (including Anthropic `system` and Gemini `systemInstruction`), becomes `'sha256:<hex>:<length>'`.
  - **N3:** a request body's `tools` becomes `{count, sha256}`.
  - **N4:** undefined members are dropped, and every recorded value is deep-copied.
- **Timer rule:** a callback whose source contains `runAgentIteration` is recorded as `{type:'schedule', delayMs}` and not run; `step()` runs the next iteration. Delays of 1000 ms or more are held, and `heldTimers.fireAll()` fires them. Shorter delays run on the next macrotask unless they are cleared first. The fake-gateway client always uses its own injected held pair.
- **The golden:** `tests/fixtures/jev-fast-loop-off-golden.json`, committed in `d8bac390`.
  - **Contents:** run A of the openai-format scenario (iteration 1 `click {selector:'#start'}`, iteration 2 `get_page_snapshot`, iteration 3 `complete_task`), 25 events plus the final state.
  - **Source:** the unedited agent-loop.js, SHA-256 `6fa3ab0c47c132e6fda669ef6bf9d23fd68773ff08f8d3b183d1e404dfc035d2` (git blob `63510394`), recorded in the file as `capturedFromAgentLoopSha256`.
  - **Capture script:** a one-off at `/tmp/fsb-68-06/capture-golden.js`, not committed. `git diff --quiet HEAD~1 HEAD -- extension/` exited 0 for this commit.
- **`tests/jev-fast-loop.test.js` checks:**
  - **"off golden":** run A equals the golden. A non-vacuity check shows that a changed snapshot answer, an extra session message or a changed tool call each break the comparison.
  - **"off three-way":** runs B and C equal the golden. Their recording deps and decide stub saw zero calls, they sent no getJevMenu, and they left no `_fastPath` or `jevMeasurement`.
  - **"slice hashes":** `buildSystemPrompt`, `getPublicTools`, `checkSafetyBreakers` and `detectStuck` all equal item h.

### Task 3: the seams (commit `813b659c`)

- **Seam 1.** It sits right before `var turnMessages = buildTurnMessages(session);`:
  - It declares `var _fastStep = null;`.
  - It opens one guarded block, `if (session.fastMode && typeof globalThis !== 'undefined' && globalThis.FsbFastPath && typeof globalThis.FsbFastPath.beforeTurn === 'function') { try { _fastStep = await …beforeTurn(session, {sessionId, iteration: iterNum}); } catch { _fastStep = null; } if (session.status !== 'running') return; }`.
  - It then opens `if (_fastStep && _fastStep.toolCall) { var toolCalls = [...]; var response = null; var inputTokens = 0; var outputTokens = 0; var iterationCost = 0; var _timingRow = null; } else {`.
  - The else closes right before `// Phase 233 Fix A`, and the existing lines keep their indentation.
- **Seam 2.** It wraps the tool-result push:
  - **Fast iteration:** `afterStep(session, _fastStep.step, toolResults)` runs in a try.
  - **LLM iteration:** the existing push loop runs unchanged. After it, `observeTools(session, toolCalls, toolResults)` runs in a try, only when `session.fastMode`.
- **Meta key (F1).** The format is `jev:<pagePath[0..60]>:<expectedRole[0..20]>:<expectedName[0..60]>`, built from `call.pagePath`, which is set by buildStaticCall. A call without pagePath gives `jev::button:Next`.
- **Pins held:**
  - **Counts:** 8 `setTimeout`, 4 schedule lines, one `stepName: 'LLM_TURN'`, one `stepName: 'TOOL_DISPATCH'` (2 unique), 2 `serialize(session)`, and one `previousStepName: 'LLM_TURN'`.
  - **Diff:** purely additive (no `-` lines). No added line contains setTimeout, stepName or importScripts.
  - **Unchanged since `ba745cfe`:** tool-definitions.js, ai-integration.js and `mcp/`.
- **New loop cases:**
  - **Seam 1 guard shape:** a source-slice check.
  - **Accepted step** (click on "Next"):
    - Iteration 1 is LLM only, with no menu.
    - Iteration 2 makes no provider request, one getJevMenu to frame 0, one decide and one executeAction. That executeAction has `tool:'click'` and `params {jevHandle:'j1', jevGeneration, expectedRole:'button', expectedName:'Next'}`, with no selector, text or value.
    - After iteration 2, actionHistory carries `decisionSource:'jev'`, there is no tool message, the schedule is the normal 100 ms, `iterationCount` is 2 and the meta key is recorded.
    - Iteration 3 makes one getJevMenu and one decide, which answers none_of_the_above. It fetches one snapshot and makes one provider request. That request holds exactly one `FAST MODE HAND-OFF` message, which names `click button "Next" (page text)` and carries the snapshot, and it has no unpaired tool call.
  - **check_box:** `toggleCheckbox` with `checked:true`.
  - **Fast TOOL_DISPATCH:** iteration 2 emits exactly one TOOL_DISPATCH with `previousStepName:'LLM_TURN'` and no LLM_TURN. The recorder is removed afterwards.
  - **Permission denial:**
    - No executeAction is sent.
    - The fast result is exactly `{success:false, hadEffect:false, error:'Tool "click" is not permitted for this origin', navigationTriggered:false, result:null}`.
    - The next LLM turn's hand-off says "not run: not permitted" and "the last step was not permitted, so nothing ran".
  - **First-turn rule after a follow-up:** with commandCount 2 and a rebuilt agentState, the follow-up's first iteration sends no getJevMenu, makes no decide and runs the LLM.
  - **run_task** (`{enabled:false, stored:true, source:'mcp'}`): the run equals the golden, with no menu and no decide.
  - **Containment (F13, F21):**
    - A beforeTurn that throws or rejects, or an observeTools that throws, leaves the iteration to the LLM with a normal 100 ms schedule.
    - An afterStep that throws still lets the fast iteration finish and schedule, with no tool message.
    - A stop during beforeTurn ends the iteration with no provider call, no action, no persist and no schedule.
  - **Off golden again:** run A is repeated after all the fast runs to show that no state leaks between harnesses.
- **Meta suite.** tests/meta-cognitive-tracker.test.js gained 5 checks:
  - the key format, both with and without pagePath;
  - the 60-character name cap;
  - six same-page calls force-stop;
  - six different page paths stay six separate targets.

## Decisions Made

- **The fast iteration's TOOL_DISPATCH keeps `previousStepName: 'LLM_TURN'`** (D-08 leaves this to the planner, within the pins).
  - **What happens:** a fast iteration reaches the existing TOOL_DISPATCH emission byte-unchanged and emits no LLM_TURN of its own, because that emission sits in the skipped block. The field therefore names the command's most recent LLM turn, which under D-09 is the turn that made the fast step eligible.
  - **Why no other expression:** any per-iteration expression would change the Phase 5 D-16 wire payload pinned by tests/lattice-step-emitter-smoke.test.js and tests/lattice-host-step-transition-smoke.test.js, and could add a step-name literal.
  - **Evidence:** the "fast TOOL_DISPATCH" case in tests/jev-fast-loop.test.js checks this, and `grep -c "previousStepName: 'LLM_TURN'"` still prints 1.
- **The follow-up flush order is flushHandoff, then the switch read, then assign or delete.** A command that ended right after a fast step, followed by the user turning the switch off, still gives the LLM one hand-off. The end-to-end case in tests/jev-fast-start-path.test.js runs the real jev-state.js and jev-fast-path.js in the vm.
- See `key-decisions` in the frontmatter for the rest.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Harness timer rule: hold long timers instead of running every non-iteration callback on the next microtask**
- **Found during:** Task 2
- **Issue:** The plan's harness runs every non-iteration setTimeout callback on the next microtask. The provider bridge (extension/ai/lattice-provider-bridge.js:137) arms its own request deadline with setTimeout (about 30 s from calculateAdaptiveTimeout). On a microtask that deadline fires before the scripted answer resolves and aborts every LLM call.
- **Fix:**
  - Callbacks with a delay of 1000 ms or more are held, never fire on their own, and can be fired with `heldTimers.fireAll()`.
  - Shorter callbacks, such as `sleep(900)` in finalizeSession and navigation waits, run on the next macrotask unless they are cleared first.
  - Schedule lines are still captured as steps.
  - The fake-gateway client keeps its injected held timers, as sync issue 5 requires. The rule is documented in the harness header.
- **Files modified:** tests/fixtures/agent-loop-fast-harness.js
- **Commit:** d8bac390

**2. [Plan detail - stronger proof] The loop cases use the shipped background.js dependencies instead of hand-written fake deps**
- **Found during:** Task 3
- **Issue:** With hand-written deps, a menu request never reaches the content stub, so the check "iteration 1 sends no getJevMenu" would be vacuous.
- **Fix:**
  - `fsbFastPathWithDeadline` and `fsbCreateFastPathDeps` are extracted from background.js and evaluated in the test realm, so their `chrome` and timer lookups hit the harness stubs.
  - Menu, snapshot and switch reads therefore appear in the event log as `content` and `storage-get` events.
  - The menus come from a content responder whose signature and generation change after each fast action (D-17), and the decide client is always the injected fake-gateway client, so there is no network path.
- **Commit:** 813b659c

**3. [Rule 2 - robustness] fsbRecomputeFastModeForFollowUp never rejects**
- **Issue:** The helper is awaited in the follow-up path before `runAgentLoop`.
- **Fix:** Besides the flush guard from the plan, it returns early for a missing session and wraps its storage read in try/catch (failures are treated as off). readSwitch uses `fsbFastPathWithDeadline` over `chrome.storage.local.get`, so a hanging read resolves false at 3000 ms and its timer is cleared.
- **Commit:** 53576b7e

**4. [Test scope] Checks beyond the plan's list**
- **Added:**
  - the containment cases (F13, F21);
  - the golden non-vacuity check and the second golden run at the end of the suite;
  - extra boundary probes: `xgetJevMenu`, `fsbJevFastModeEnabledX`, a jev comment next to an allowed token, `jevFast`, a gap, reordering and a missing fast-path line;
  - the safety-breaker hook in the harness pipeline (createSessionHooks registers it). The progress hook is left out because it only emits overlay events.
- **Self-test message:** in the boundary suite it now reads "MODULES keeps the three Phase 67 modules" instead of "the background.js list keeps three", because the background.js check moved to ALL_MODULES.
- **Rules:** none was loosened.

**5. [TDD commit shape] RED observed before every GREEN**
- **Task 1:** the new suite failed with 4 checks (helpers missing). RED and GREEN landed in one `feat` commit because the suite is registered in the root chain, as in 68-02, 68-04 and 68-05.
- **Task 2:** a characterization suite. It passes by design against the unedited loop and is committed as `test(68-06)`.
- **Task 3:** RED showed 31 loop failures and 5 meta failures before the seams. GREEN brought both to 0.

---

**Total deviations:** 5. One was blocking, one strengthens a proof, one adds robustness, one widens test scope and one concerns commit shape. **Impact:** nothing is loosened, and every acceptance criterion holds as written.

## TDD Gate Compliance

- **Gate commits:**
  - `test(68-06)` d8bac390 is the golden characterization, captured before any loop edit.
  - `feat(68-06)` 813b659c is the seams, with RED observed at 31 + 5 failures.
  - `feat(68-06)` 53576b7e is Task 1. RED (4 failures) was observed before it, and RED and GREEN share the commit (deviation 5).
- **Mutation spot-checks on agent-loop.js** (the file was restored byte-identical afterwards, SHA-256 verified):
  - **M1** (status return moved outside the guard): 3 loop failures.
  - **M2** (a tool message pushed for the fast step): 3.
  - **M3** (observeTools removed): 22.
  - **M4** (pagePath dropped from the meta key): 1 loop and 4 meta failures.
  - **M5** (the fast branch disabled): 22.

## Verification

- **New suites:**
  - `node tests/jev-fast-start-path.test.js`: 104 PASS / 0 FAIL.
  - `node tests/jev-fast-loop.test.js`: 71 / 0.
  - `node tests/meta-cognitive-tracker.test.js`: 24 / 0.
  - `node tests/jev-extension-boundary.test.js`: 164 / 0.
  - All four also pass under `npx --offline -y node@20` and `/tmp/fsb-node20/node-v20.20.2-darwin-arm64/bin/node`.
- **Task 1 verify line:** start-path, lattice bridge smoke (112/0), `npm run validate:extension`, boundary, delegation-phase-contract (1244/0 after Task 2), mcp-version-parity, and `node --test tests/bench-drivers.test.mjs tests/bench-identity.test.mjs` (53/53). All exit 0, and they were re-run after Task 3.
- **67-11 verify line** (24 suites): all exit 0.
- **Task 3 pin suites:** iterator guard, lattice bridge smoke, philosophy parity, sidepanel message log, step emitter, survivability, sidepanel tab-aware, tool-definitions parity, meta tracker, stuck repetition, empty contents, provider parity, cost tracker, cost tracker ordering, capability-autopilot parity, goal progress, run-task cleanup paths, jev-policy tighten-only, jev-fast-loop, jev-fast-upstream-contract and jev-fast-path. All exit 0. capability-mcp-surface and recipe-schema-lock exit 0 too.
- **Sweeps:**
  - `--files extension/background.js`: 93/93 passed, no new failures against 68-SWEEP-BASELINE.json.
  - `--files extension/ai/agent-loop.js`: 28/28, no new failures.
  - Port 7225 was held by the user's hub and left untouched. The crawler files never changed.
- **Acceptance greps:**
  - importScripts counts are 338/334, and the fast-path load line comes directly after jev-policy.
  - No added background.js comment contains importScripts.
  - No `FsbJev` text appears outside `extension/ai/jev-*`.
  - The jev grep of background.js, outside load lines and tokens, prints nothing.
  - The follow-up recompute call count is 1.
  - The agent-loop count script exits 0, and the diff removes no line.
  - beforeTurn and afterStep counts are 1 each.
  - The golden is unchanged by the seams commit.
  - `git diff --quiet ba745cfe -- extension/ai/tool-definitions.js extension/ai/ai-integration.js mcp/` exits 0.
  - Each task commit lists only that task's files.
- **Commit messages:** none carries an attribution line.

## Known Stubs

None. The 68-08 capture hook (`getTabUrl` is already in the deps) and the 68-07/68-09 measurement surfaces come later, by plan.

## Deferred to Validation Block

- **M-68-07 (V5):** a real side-panel task with the switch on and an uncalibrated or disabled gateway. It must make at most one attempt, act on nothing, and otherwise match the switch-off path. The offline equivalent is proven here: run_task, the three-way equivalence and the containment cases. The uncalibrated latch was proven in 68-05.
- **M-68-05 (V4):** the fast-mode arm runs through `run_task` only after Phase 70. The same-path meta-key residual (a single-URL wizard with six same-named steps) is a V4 watch item.

Deferred: M-68-05 (V4), M-68-07 (V5)

## User Setup Required

None.

## Next Phase Readiness

- **68-07 and 68-09:** extend tests/jev-fast-loop.test.js through `createHarness` and the `fastHarness` helper.
- **The golden:** must never be regenerated. If a later plan intentionally changes the off path, D-01 is broken.
- **68-08:**
  - add its background.js tokens to `BACKGROUND_JEV_TOKENS` together with its code;
  - gate run_task capture before beforeTurn's `not_enabled` return;
  - use `deps.getTabUrl`.

## Self-Check: PASSED

- FOUND: extension/background.js, extension/ai/agent-loop.js, tests/jev-fast-start-path.test.js, tests/fixtures/agent-loop-fast-harness.js, tests/fixtures/jev-fast-loop-off-golden.json, tests/jev-fast-loop.test.js, tests/meta-cognitive-tracker.test.js
- FOUND: commits 53576b7e, d8bac390 and 813b659c on branch Jev. None carries an attribution line.
- After the last task commit: `node tests/jev-fast-loop.test.js` 71/0, `node tests/jev-fast-start-path.test.js` 104/0, `node tests/meta-cognitive-tracker.test.js` 24/0.
