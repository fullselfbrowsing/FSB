---
phase: 70-bounded-mcp-fast-task
fixed_at: 2026-10-19T00:22:48Z
review_path: .planning/phases/70-bounded-mcp-fast-task/70-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 4
skipped: 3
status: partial
---

# Phase 70: Code Review Fix Report

**Fixed at:** 2026-10-19T00:22:48Z
**Source review:** .planning/phases/70-bounded-mcp-fast-task/70-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 critical, 2 warnings, 4 info; info fixed only when trivial and safe)
- Fixed: 4 (CR-01, WR-02, IN-01, IN-03)
- Skipped: 3 (WR-01, IN-02, IN-04)

Work ran directly on branch `Jev` in the single working tree, as the milestone rules require (no worktree, no branch). Each fix was committed on its own and staged by path. No commit carries an attribution line. Every changed suite passes on Node 24 and on the official Node 20. Those suites are jev-fast-path, jev-fast-loop, jev-run-task-outcome, jev-fast-start-path, run-task-fast-mode-wire, jev-run-task-disclosure, jev-run-task-upstream-contract, jev-extension-boundary, jev-fast-measurement, jev-fast-capture, mcp-run-task-fast-caller and bench-fast-mode-record. The background.js commit (IN-01) also passed every test file that reads `extension/background.js` (about 60 files, including lattice-provider-bridge-smoke, mcp-version-parity, mcp-bridge-background-dispatch, bench-drivers and bench-identity).

## Fixed Issues

### CR-01: A page read that never reached the page counts as an observation and turns unresolved uncertainty into `done`

**Files modified:** `extension/ai/jev-fast-path.js`, `tests/jev-fast-path.test.js`, `tests/jev-fast-loop.test.js`
**Commit:** 691cf5b0
**Status:** fixed: requires human verification (logic change in the outcome classifier)
**Applied fix:**
- **New predicate.** Added `pageWasRead(name, toolResult, outcome)` inside the Phase 70 section. A call counts as an observation only when all of these hold:
  - it succeeded and was not classified `uncertain`;
  - it carries a nested content or CDP answer;
  - that answer is not `success:false` and not `bfCacheDetected`;
  - for `wait_for_stable`, the answer is not `stable:false`.
- **Where it applies.** `afterTool` now requires `pageWasRead` as well as `isPageObservationTool`.
- **Effect.** The change is tighten-only: it can only move `done` to `ambiguous`. The PD-70-01 tool list is unchanged.
- **Unit tests.** These run through the real tool executor:
  - `read_page` and `get_text` through "Receiving end does not exist" (bfCache);
  - an errored `get_dom_snapshot` and a silent one;
  - a `wait_for_stable` timeout and a read with no content answer. None of these resolves an earlier uncertain click or an unobserved fast step.
  - A settled `wait_for_stable` still observes.
  - Both of the review's exact reproductions now give `unresolved = true`.
- **Loop-harness cases** through the real agent loop:
  - `[uncertain click, read_page (content script gone), complete_task]`;
  - `[uncertain click, errored get_dom_snapshot, complete_task]`.
  - Both now classify `ambiguous`/`uncertain_action`.
  - Against the pre-fix module these cases failed with `done`/`complete_task`, which confirms the defect.

### WR-02: The recorder keeps a single human-gate slot, and any later success of the same tool clears it, so `needs_confirmation` can be lost

**Files modified:** `extension/ai/jev-fast-path.js`, `tests/jev-fast-path.test.js`, `tests/jev-fast-start-path.test.js`, `tests/jev-run-task-outcome.test.js`, `tests/bench-fast-mode-record.test.mjs`, `tests/mcp-run-task-fast-caller.test.mjs`
**Commit:** 523c570d
**Status:** fixed: requires human verification (state-handling change)
**Applied fix:**
- **Record layout.** The evidence record's `gate: null` slot is replaced by `gates: []`, with one entry `{code, tool, key, seq, cleared}` per gate.
  - A second gate never hides the first.
  - The same gate raised again reopens its own entry.
- **Clearing.**
  - A successful `fill_payment_method` clears the payment gate.
  - A successful `invoke_capability` clears a consent gate only when its result carries the same origin and slug. A success for another site or capability, or one that names neither, clears nothing.
  - Today's capability success results carry neither origin nor slug, so in practice a consent gate stays open. That is fail-closed, and it matters only when the task did not end in success.
- **No URL in the record.** The consent key is an FNV-1a digest (8 hex digits) of origin and slug, so the record holds no URL (D-14 content rule). A test checks that neither the origin nor the slug appears in the record.
- **Which gate is reported.** `openGateOf` returns the first uncleared code in `EVIDENCE_GATES` order (payment first).
- **Tests.**
  - The review's reproduction (declined payment, then consent required, then consent cleared, then a partial terminal) now gives `needs_confirmation`/`payment_not_approved`.
  - A test with consent required on two sites, where one is cleared, keeps the other open.
  - New D-13 table rows check the order and the cleared/uncleared mix.
- **Layout pins.** The three layout pins (`EVIDENCE_LAYOUT`, `EVIDENCE_RECORD`, the outcome fixture) and two bench/caller fixtures move from `gate: null` to `gates: []`. The throwing-field test now targets `gates`.
- **Reachability.** RESEARCH F7 still applies: neither gate is reachable from a real run_task today.

### IN-01: Stale JSDoc still says run_task never takes a fast step

**Files modified:** `extension/background.js`, `extension/ai/jev-fast-path.js`
**Commit:** 86c5630e
**Status:** fixed (comments only)
**Applied fix:**
- **background.js.** Reworded the `fsbFastModeSessionField` JSDoc to say that a run_task start follows the switch under its own frozen budget profile (D-04 replaces D-03). The in-function comment says the same thing, without the "supersedes the sentence above" wording.
- **The `budgetProfile` token.** The literal token `budgetProfile` was deliberately kept out of the comment, including the `@returns` type. `tests/jev-fast-start-path.test.js` pins `countOf(bgSource, 'budgetProfile') === 1` to prove there is no other reader. The return text describes the key in prose instead of weakening that pin. The comment adds no "jev" and no `importScripts` text.
- **jev-fast-path.js.** The `toBuilderInput` JSDoc now says the goal is the one the caller built: step o passes `normaliseGoal` of the task (D-22).
- **Follow-up.** deferred-items.md (70-02 #1, 70-03 #1, 70-04 #1) still lists these as open. The orchestrator may close them.

### IN-03: `beforeTool` assumes a permission denial is the only reason a call has no after event

**Files modified:** `extension/ai/jev-fast-path.js`
**Commit:** 9ec5093f
**Status:** fixed (comments only)
**Applied fix:**
- **`RUN_TERMINAL_TOOLS` comment.** It now notes that a `partial_task` resumed by inline auth resolution does not end the task and gets an after-tool event. This was checked against `agent-loop.js`.
- **`beforeTool` doc.** It now names both kinds of call that get no after event:
  - a permission denial;
  - a dispatch that threw, which `agent-loop.js` retries under the same iteration number.
  It also states the D-14 c residual.
- **Optional promotion not applied.** The suggested "promote a stale pending from an earlier iteration" would not catch this case: the retry decrements `iterationCount` and reruns the same iteration number. A correct version needs its own design.

## Skipped Issues

### WR-01: A failed read-only call is recorded as unresolved uncertainty, so a completed task reports `ambiguous`

**File:** `extension/ai/jev-fast-path.js:2378,2381`
**Reason:** The fix conflicts with a recorded decision and needs a decision from the owner or orchestrator.
- **What the review describes is accurate.**
- **The behaviour was deliberately kept.** It is 70-SYNC-RECHECK Drift substitution 3, "kept as planned" in 70-03-SUMMARY. That substitution names agent-loop's null-result failures (`get_page_snapshot failed`, `search_memory requires a non-empty query`) as marked uncertain, and it says: "If 70-03 chooses to key D-14(a) on `reason === 'uncertain'` instead, that is a loosening and needs its own recorded decision."
- **Both proposed fixes loosen.** Exempting `_readOnly` tools, or restricting D-14(a) to the three named shapes, moves `ambiguous` to `done`.
- **A test pins the current behaviour.** `tests/jev-fast-path.test.js` asserts "an LLM call with a failed snapshot sets lastUncertainSeq only".
- **It is already measured.** M-70-04 (V4) tracks the `dispatch_unconfirmed` false-`ambiguous` rate.
- **If the owner accepts the loosening,** the change is the one-line `readOnly` guard on `lastUncertainSeq` in `afterTool`, plus flipping that pinned test.
- **Interaction with CR-01:** a bfCache `read_page` is now neither an observation nor exempt from uncertainty, which is the tighter of the two options.

**Original issue:** `classifyStepEvidence` returns `uncertain`/`dispatch_unconfirmed` for any `success:false` result with a null nested `result`. That includes read-only calls that cannot change the page, so `[get_page_snapshot fails, complete_task]` and `[search_memory fails, complete_task]` give `ambiguous`/`uncertain_action`.

### IN-02: A failed evidence registration is silent

**File:** `extension/background.js:14515` (helper at `:4193`)
**Reason:** The fix is not trivial, and the failure path is quiet by design.
- **The call site is pinned byte-for-byte.** `REGISTER_LINE` in `tests/jev-fast-start-path.test.js` must be the only text between `createSessionHooks(sessionId);` and `runAgentLoop(sessionId, {`, and the helper must be named exactly twice in background.js.
- **The quiet failure is pinned too.** The helper's failure paths are asserted to "return false quietly". The helper is evaluated alone in a vm, so a logger call would need its own typeof guard.
- **The block already records the failure.** A failed registration leaves no record, so the run reports `ambiguous`/`evidence_unavailable` with `uncertain_unobserved:null`. A real evidence gap reports `uncertain_action` with `uncertain_unobserved:true`. A log line would only separate registration failure from the F6 content-script-not-ready abort.

This is left for a planned background.js change.

**Original issue:** The boolean that `fsbRegisterFastRunEvidence` returns is ignored, so a registration failure leaves no log line saying why the run reports `evidence_unavailable`.

### IN-04: The `jev` summary of a stopped run depends on whether an aborted decide settles before the stop broadcast

**File:** `extension/ws/mcp-bridge-client.js:2782-2844`; `extension/ai/jev-fast-path.js:1563-1616`
**Reason:** The claim is verified, but the code fix is not trivial.
- **Where the count happens.** `jevFast.calls += 1` and `jevMs` run after `await client.decide(...)` (`jev-fast-path.js:1570`).
- **Why the code fix was not made.** Counting at issue time would change the Phase 68 measurement contract: per-command totals and attempts are timed after the decide returns, and the measurement suites pin them.
- **What remains.** The issue affects measurement only. The review's other option, documenting the race in M-70-04, is a Validation Block tracking note, so it is left to the orchestrator. It is recorded here so V4 reads stopped-run `jev.attempts`, `calls` and `jev_ms` as possibly off by one.

**Original issue:** `buildFastModeBlock` runs synchronously at settle. Whether an aborted decide has been counted depends on microtask order against `cleanupSession`'s awaits.

---

_Fixed: 2026-10-19T00:22:48Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
