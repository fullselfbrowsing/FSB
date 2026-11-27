---
phase: 70-bounded-mcp-fast-task
reviewed: 2026-10-19T00:07:19Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - extension/ai/jev-fast-path.js
  - extension/background.js
  - extension/ws/mcp-bridge-client.js
  - package.json
  - scripts/bench/lib/fast-mode.mjs
  - scripts/bench/run-bench.mjs
  - tests/bench-fast-mode-record.test.mjs
  - tests/delegation-phase-contract.test.js
  - tests/fixtures/agent-loop-fast-harness.js
  - tests/fixtures/run-task-wire-golden.json
  - tests/jev-fast-loop.test.js
  - tests/jev-fast-path.test.js
  - tests/jev-fast-start-path.test.js
  - tests/jev-run-task-disclosure.test.js
  - tests/jev-run-task-outcome.test.js
  - tests/jev-run-task-upstream-contract.test.js
  - tests/mcp-run-task-fast-caller.test.mjs
  - tests/run-task-fast-mode-wire.test.js
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-10-19T00:07:19Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

The review covered the Phase 70 source diff `3f7efb0a..HEAD`: the D-04 gate change in `fsbFastModeSessionField`, the run-evidence registration in `handleStartAutomation`, the `run_task` budget profile, `normaliseGoal`, the evidence recorder, the classifier and block builder in `jev-fast-path.js`, the `settle` change in `mcp-bridge-client.js`, and the bench projection. The new and edited suites all pass locally (upstream-contract, wire, disclosure, outcome, fast-path, start-path, loop, caller, bench record, delegation-phase-contract).

Things checked that hold up:
- **Switch off.** The run_task path stays byte-stable. The only new work is the guarded `activeSessions.get`, and every other new branch is behind `fastModeSession`.
- **No leaks.** No URL, label, typed value or page text reaches the `fast_mode` block, the `FsbMcpTaskStore` snapshot, the bridge log line or the bench raw record. `_fastRunEvidence` and `_fastRunStartPage` are never persisted: `persistSession` and `automationLogger.saveSession` copy only selected fields.
- **Goal normaliser.** `normaliseGoal` can only return a suffix of the task. It keeps the task unchanged when there is any doubt about the path or the query.
- **Vocabularies.** The classifier's vocabularies match the real `createTerminalOutcome` call sites, the stop broadcasts and the guard broadcasts. The tool-name check (`FAST_MODE_ESCALATION_CODES`) accepts the bench `TOKEN_PATTERN`.

The main defect is in what the evidence recorder counts as an "observation". A page-read tool that never reached the page still counts as a successful observation. That clears earlier uncertainty and produces `done`. This is the false-`done` failure SC2 and D-14 exist to prevent, and V4 treats any false `done` as a gate input. Two lesser defects skew the outcome the other way, or lose a human gate.

## Critical Issues

### CR-01: A page read that never reached the page counts as an observation and turns unresolved uncertainty into `done`

**File:** `extension/ai/jev-fast-path.js:2378-2383` (consumed by `runEvidenceUnresolved`, `:2414-2416`)
**Issue:** `afterTool` records an observation when `!fastCall && toolResult.success === true && isPageObservationTool(name)`. `toolResult.success` does not show that the page was read:
- **bfCache case.** When the content script cannot be reached, `executeContentTool` returns `{success:true, navigationTriggered:true, result:{bfCacheDetected:true}}` for **any** content tool, `read_page` and `get_text` included (`extension/ai/tool-executor.js:138-153`). The same call is classified `uncertain` (line 2381) and observed (line 2383) at the **same** `seq`. `runEvidenceUnresolved` compares with a strict `>`, so the equal values count as resolved. The call clears its own uncertainty and every earlier one.
- **`get_dom_snapshot` case.** `get_dom_snapshot` reports `success:true` whatever the content script answered (`tool-executor.js:97-110`), so an errored DOM read is also an "observation".
- **`wait_for_stable` case.** It reports `success:true, stable:false` on timeout (`extension/content/actions.js` `waitForDOMStable`).

Reproduced against the real module:
- `[click {success:false, result:{outcome:'unknown', mayHaveExecuted:true}}, read_page {success:true, result:{bfCacheDetected:true}}, complete_task]` gives `{"outcome":"done","reason":"complete_task","uncertain_unobserved":false}`.
- The same holds for an unobserved Jev-chosen click (`fastIteration` set) followed by that `read_page`.
- The same holds for `[uncertain click, get_dom_snapshot {success:true, result:{success:false}}, complete_task]`.

A navigating click followed at once by a `read_page`, while the new document's content script is not yet injected, is a normal sequence. So a task where nothing was observed reports `done` with `uncertain_unobserved:false`.

**Fix:** Count an observation only when the call's own evidence shows the page was read.
```js
var outcome = classifyStepEvidence(name, toolResult).outcome;
var nested = isObject(toolResult) && isObject(toolResult.result) ? toolResult.result : null;
var pageRead = succeeded && outcome !== 'uncertain'
  && nested !== null && nested.success !== false && nested.bfCacheDetected !== true;
if (outcome === 'uncertain') ev.lastUncertainSeq = seq;
if (fastCall && contains(FAST_UNOBSERVED_OUTCOMES, outcome)) ev.fastUnobservedSeq = seq;
if (!fastCall && pageRead && isPageObservationTool(name)) ev.lastObservationSeq = seq;
```
Also consider `wait_for_stable` with `stable === false`, which observes nothing. Add loop-harness cases for `read_page` through the "Receiving end does not exist" responder and for an errored `get_dom_snapshot`. Both must give `ambiguous`/`uncertain_action`.

## Warnings

### WR-01: A failed read-only call is recorded as unresolved uncertainty, so a completed task reports `ambiguous`

**File:** `extension/ai/jev-fast-path.js:2378,2381`
**Issue:** `classifyStepEvidence` returns `uncertain`/`dispatch_unconfirmed` for any `success:false` result whose nested `result` is null (`:632-635`). Several calls that cannot change the page fail that way:
- the agent loop's own `get_page_snapshot` interception ("Snapshot unavailable");
- `search_memory` with an empty query or no memory manager;
- the catch branch of any content or CDP tool.

`afterTool` writes all of them to `lastUncertainSeq`. Only a later *successful* page read clears that, so a later click, a `report_progress` or a terminal tool does not. Reproduced: `[get_page_snapshot {success:false, result:null}, complete_task]` and `[search_memory {success:false, result:null}, complete_task]` both give `ambiguous`/`uncertain_action` with `uncertain_unobserved:true`. D-14(a) lists `outcome:'unknown'`, `mayHaveExecuted` and `bfCacheDetected`, not "any failed call with no payload". The validation file has `dispatch_unconfirmed` on the V4 watch list, but the read-only subset is a deterministic false `ambiguous` with a one-line fix, and it skews the V4 agreement table.
**Fix:** Skip uncertainty for read-only tools, which cannot leave an uncertain side effect:
```js
var def = typeof name === 'string' ? toolDefinitionOf(name) : null;
var readOnly = def !== null && def._readOnly === true;
if (outcome === 'uncertain' && !readOnly) ev.lastUncertainSeq = seq;
```
Alternatively, restrict D-14(a) to the three named shapes by checking `nested.outcome === 'unknown' || nested.mayHaveExecuted === true || nested.bfCacheDetected === true` instead of the evidence label.

### WR-02: The recorder keeps a single human-gate slot, and any later success of the same tool clears it, so `needs_confirmation` can be lost

**File:** `extension/ai/jev-fast-path.js:2384-2389`
**Issue:**
- **One slot.** `ev.gate` holds one gate. A second gate overwrites the first, and clearing the second leaves no trace of the first. Reproduced: `[fill_payment_method declined, invoke_capability RECIPE_CONSENT_REQUIRED, invoke_capability success]` then a `partial`/`blocked` terminal gives `blocked`/`blocked` with `human_gate:null`, although the payment was never approved.
- **Over-broad clearing.** Clearing matches only on the tool name. A successful `invoke_capability` of an unrelated recipe or origin clears a consent gate raised for a different site, while D-15 says "a later successful call of the same kind".

RESEARCH F7 notes that neither gate is reachable from a real run_task today, which keeps this a warning. It is still wrong once either gate becomes reachable.
**Fix:**
- Keep one entry per gate code, for example `ev.gates = { payment_not_approved: {seq, cleared}, site_consent_required: {seq, cleared, key} }`.
- Clear consent only when the later success carries the same origin and slug. Hold a hash or the code-held `slug` only, and never write it into the block.
- Have `openGateOf` return the first uncleared code in `EVIDENCE_GATES` order.

## Info

### IN-01: Stale JSDoc still says run_task never takes a fast step

**File:** `extension/background.js:4004-4008`; `extension/ai/jev-fast-path.js:271`
**Issue:**
- **background.js.** The `fsbFastModeSessionField` JSDoc still says a run_task start "carries enabled:false and never takes a fast step (D-03)". Its `@returns` type omits `budgetProfile`. An in-function comment says D-04 supersedes this.
- **jev-fast-path.js.** The `toBuilderInput` JSDoc still describes `ctx.goal` as "the user's task text, unchanged", but the caller now passes `normaliseGoal(...)`.

Both are logged as open in `deferred-items.md` (70-02 #1, 70-04 #1) and were not closed by the end of the phase.
**Fix:** Reword both comments and add `budgetProfile?: 'run_task'` to the `@returns` type. Run the background.js pin bundle in the same commit, with no "jev" and no `importScripts` text in background.js comments.

### IN-02: A failed evidence registration is silent

**File:** `extension/background.js:14511` (helper at `:4189-4213`)
**Issue:** The boolean `fsbRegisterFastRunEvidence` returns is ignored. When registration fails, every successful switched-on run_task reports `ambiguous`/`evidence_unavailable`, and nothing in the logs says why. During V4, that is hard to tell apart from a real evidence gap.
**Fix:** On `false`, log one content-free debug line, for example `automationLogger.debug('Fast run evidence not registered', { sessionId })`, with no URL or task text.

### IN-03: `beforeTool` assumes a permission denial is the only reason a call has no after event

**File:** `extension/ai/jev-fast-path.js:2273-2275,2353-2360`
**Issue:**
- **Thrown dispatch.** A throw between `BEFORE_TOOL_EXECUTION` and `AFTER_TOOL_EXECUTION` goes to the iteration catch and the network-error retry (`agent-loop.js:3146`, `:3229-3236`). The `_executeTool` call is wrapped in try/finally only, so it can throw. The in-flight marker for a call that may have executed is then cleared by the next `beforeTool` and never counted under D-14(c). In most cases the retried turn fails on the unpaired tool call, and the marker survives as `ambiguous`.
- **`partial_task` comment.** The comment on `RUN_TERMINAL_TOOLS` says these tools "return ... before their own after-tool event". `partial_task` does not return when auth resolution resumes (`agent-loop.js:2588-2607`) and does get an after event.

This is tighten-neutral today, but the stated invariant is inaccurate.
**Fix:** Correct both comments. Optionally, when `beforeTool` finds a stale `pending` from an earlier iteration (not the current `ctx.iteration`), promote it to `lastUncertainSeq` instead of dropping it.

### IN-04: The `jev` summary of a stopped run depends on whether an aborted decide settles before the stop broadcast

**File:** `extension/ws/mcp-bridge-client.js:2782-2844`; `extension/ai/jev-fast-path.js:1563-1616`
**Issue:**
- **What `handleStopAutomation` does.** It calls `abortInFlight`, then awaits `cleanupSession`, then broadcasts.
- **Where the aborted decide is counted.** It is counted (`jevFast.calls += 1`, `appendAttempt`, `addCommandTotals`) in the attempt's continuation, after the awaited `client.decide`.
- **Why the counts vary.** `buildFastModeBlock` runs synchronously at settle, so whether that continuation has run is decided by microtask ordering against `cleanupSession`'s awaits. `jev.attempts`, `calls` and `jev_ms` on a stopped run can therefore be off by one.

This only affects measurement, but V4 reads these counts for the per-task overhead.
**Fix:** Document the race in M-70-04, or count the call when the decide is issued, not when it returns.

---

_Reviewed: 2026-10-19T00:07:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
