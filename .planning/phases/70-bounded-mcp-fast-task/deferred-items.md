# Phase 70: deferred items

Out-of-scope discoveries logged by executors. Each item names the plan that found it; none blocks that plan.

## From 70-02

1. **Stale JSDoc above `fsbFastModeSessionField`** (`extension/background.js:4002-4010`). It still says a run_task start (source 'mcp') "carries enabled:false and never takes a fast step (D-03)", and its `@returns` type omits `budgetProfile`. The 70-02 acceptance criterion allowed exactly one removed line in background.js (the 68 `enabled: from !== 'mcp'` line) and required the rest of the file outside the helper to be unchanged, so 70-02 added an in-function comment (`:4014-4016`) saying D-04 supersedes that sentence. Suggested fix: reword the JSDoc in a later Phase 70 commit that touches background.js, and run the background.js pin bundle (boundary suite, lattice-provider-bridge-smoke, mcp-version-parity, mcp-bridge-background-dispatch, bench-drivers/identity) in that commit. Note: no comment in background.js may contain "jev" or the word importScripts.
2. **Stale "run_task bench session" wording in `tests/jev-fast-capture.test.mjs`** (`:6`, `:122`, `:150`). `moduleRing` builds a hand-built `{enabled:false, stored:true, source:'mcp'}` session and calls it a run_task bench session. After D-04 a switched-on run_task session is enabled. The suite stays green and still tests capture mechanics correctly (capture keys on the page, not the source), but the wording is wrong. The file was outside the 70-02 file list. Suggested fix: rename the comment wording (or use a capture-only field name, as 70-02 did in tests/jev-fast-path.test.js).

## From 70-03

1. **70-02 item 1 is still open.** 70-03 Task 2's acceptance criterion also allows no removed line in `extension/background.js` (`git diff -U0 HEAD~1 -- extension/background.js | grep -E "^-[^-]"` must print nothing), so the stale JSDoc above `fsbFastModeSessionField` was left as is again. The next plan that may remove a background.js line should reword it.
2. **Tighten-only residual: a retried iteration number.** The act marker (`session._fastRunEvidence.fastIteration`) is never cleared. When a fast iteration's `_executeTool` throws and the loop retries that iteration with the same number (the first-failure path decrements `iterationCount`, 70-SYNC-RECHECK item p), an LLM call in the retried iteration is treated as the fast call, so an unconfirmed LLM result there marks `fastUnobservedSeq`. This can only move an outcome from `done` to `ambiguous` and needs a dispatch that throws; V4 (M-70-04) would show it in the false-`ambiguous` rate. No fix proposed unless V4 shows it.

## From 70-04

1. **Stale ctx wording in the `toBuilderInput` JSDoc** (`extension/ai/jev-fast-path.js:265`). It still describes `ctx.goal` as "the user's task text, unchanged". Since 70-04, step o passes `normaliseGoal(session.task, [menu.url, session._fastRunStartPage])`, which can drop one leading `Open <address>.` sentence. `toBuilderInput` itself still copies the goal it is given unchanged, so the sentence is not false about that function, but it reads as if the caller sends the raw task. 70-04 Task 1's acceptance allowed exactly one removed line in the module (the step-o goal argument), so the comment was left. Suggested fix: reword it in the next plan that may remove a line of `jev-fast-path.js` (for example 70-05), and re-run the module's grep criteria in that commit.
