---
phase: 70-bounded-mcp-fast-task
plan: 06
subsystem: mcp-bridge
tags: [run_task, fast-mode, typed-outcome, wire, bridge, sc2, sc4, mcp-04, d-17, d-19, d-20]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01: the switch-off wire golden, the vm bridge harness (buildWireHarness, runSettlePath, makeSeededSession, the five message constants, variants V1-V4) and 70-SYNC-RECHECK items n, o, s; 70-03: createRunEvidenceHandlers; 70-05: FsbFastPath.buildFastModeBlock, FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS, FAST_MODE_ESCALATION_CODES"
provides:
  - "Start-time capture in MCPBridgeClient._handleStartAutomation: one guarded activeSessions.get(sessionId) after the start dispatch, kept only when the session has fastMode"
  - "settle(value, source, terminal): a switched-on run_task resolves with its unchanged value plus one key, fast_mode, appended last, and the terminal FsbMcpTaskStore write carries it in final_result"
  - "handleComplete/handleError pass { kind: 'complete' | 'error', message } as settle's third argument; the safety net is recognised by source 'safety_net_600s'"
  - "tests/run-task-fast-mode-wire.test.js switch-on section: additivity, wire bytes, store, isolation, release, no-extra-read and ten bridge-level outcome checks (77 checks in total)"
affects: [70-07, 70-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture-at-start, build-at-settle: the session reference is taken once when the start dispatch returns and released inside settle, so stopped sessions (already out of activeSessions) still get the block"
    - "Two-stage isolation in settle: build plus JSON round trip in one try (any failure leaves the block null), then attach in a second try that falls back to the classifier_error literal and, failing that, to the unmodified value"
    - "Proxy spy on the session to prove the settle-time read uses the captured reference and nothing reads it afterwards"

key-files:
  created:
    - .planning/phases/70-bounded-mcp-fast-task/70-06-SUMMARY.md
  modified:
    - extension/ws/mcp-bridge-client.js
    - tests/run-task-fast-mode-wire.test.js

key-decisions:
  - "The start capture sits in its own try/catch with block-scoped names (fastStartSessions, fastStartSession), so a failing map read can never reject _handleStartAutomation and only fastModeSession survives into the settle closure"
  - "There is no separate typeof check on the builder: a missing FsbFastPath or builder throws inside the build try and gets the same classifier_error block (this also keeps buildFastModeBlock on exactly one line of the bridge)"
  - "The round-tripped block must be a plain non-array object, otherwise the classifier_error block is used, so the wire never carries a string, array or null in fast_mode"
  - "kind is terminal.kind, else 'safety_net' when source is 'safety_net_600s'; the message passed to the builder is the raw lifecycle message, of which the builder reads only outcome and reason"
  - "MCP-03 is advanced, not completed, by this plan; it is met only at the Phase 70 gate (70-08)"

patterns-established:
  - "runWithHarness(path, opts, {beforeStart, between, settle}) / runSwitchOn(path, module, {withEvidence, extra, between, settle}) / makeFastSession(module, {withEvidence, extra}) in tests/run-task-fast-mode-wire.test.js"

requirements-completed: []  # MCP-03 is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~10min
completed: 2026-10-18
---

# Phase 70 Plan 06: run_task fast_mode block at the bridge Summary

**A `run_task` that started with the fast-mode switch on now returns its normal result plus one key, `fast_mode`, appended last. The key holds the typed outcome (`done`, `ambiguous`, `blocked` or `needs_confirmation`), its reason, the evidence flags, the budget profile and the `jev` summary, and it is stored with the task snapshot. With the switch off, every settle value, wire text, store write and heartbeat is byte-for-byte the 70-01 golden. The only new work on that path is one guarded `activeSessions.get(sessionId)`.**

## Performance

- **Duration:** about 10 minutes. Started 2026-10-18T23:18:04Z. Task 1 committed about 23:21Z, Task 2 about 23:24Z, and the wave check finished 23:25Z.
- **Tasks:** 2 of 2
- **Files modified:** 2 (one extension file, one test file)

## Bridge diff (`extension/ws/mcp-bridge-client.js`, commit `47d02d78`)

`git show --numstat`: **49 lines added, 5 removed**. The 5 removed lines are each replaced by an edited line. No import, listener, timer or storage key was added. No added line matches `spawn(`, `fork(`, `execFile(`, `execSync(`, `spawnSync(`, `shell:`, `terminal://`, `_eventTail`, `chrome.storage`, `setTimeout`, `setInterval` or `addEventListener`. The file never names the switch's storage key, and `buildFastModeBlock` appears on exactly one line.

1. **Start capture.** This is 11 new lines after `const sessionId = response.sessionId;` (:2671).
   - `let fastModeSession = null;` is followed by a try block. Inside it, the fireHeartbeat guard is copied under the new names `fastStartSessions` and `fastStartSession`.
   - `fastModeSession` is set only when `fastStartSession.fastMode` is truthy.
   - The catch leaves it null.
2. **Settle signature.** `const settle = (value, source) => {` became **`const settle = (value, source, terminal) => {`**.
3. **Settle block.** This is 33 new lines, placed after the listener teardown and before the terminal store write.
   - `let finalValue = value;`. When `fastModeSession` is set, it is copied to `fastSessionRef` and the closure's reference is nulled (released).
   - Try 1: resolve `globalThis.FsbFastPath` (typeof guard). The kind is `terminal && terminal.kind`, else `'safety_net'` for source `'safety_net_600s'`. Then `fastPath.buildFastModeBlock(fastSessionRef, { source, kind, message })` runs, then `JSON.parse(JSON.stringify(built))`. The result is kept only if it is a plain non-array object.
   - Try 2: `finalValue = Object.assign({}, value, { fast_mode: fastBlock || <classifier_error literal with all six keys> })`. The catch leaves `finalValue = value`.
4. **Persist and resolve.** The terminal write now has `final_result: finalValue` and the call is `resolve(finalValue)`. `terminalStatus` and the completion log still read `value`.
5. **Handlers.** `handleComplete` and `handleError` gained a third argument, `{ kind: 'complete', message }` and `{ kind: 'error', message }`. Their object literals are byte-identical. The safety-net `settle(...)` call is unchanged.

## Isolation behaviour (D-19, RESEARCH F4)

`settle` always reaches `resolve()`. Each of the four failure sub-cases ran on all five settle paths: no `FsbFastPath` in the context, a getter on `FsbFastPath` that throws, a builder that throws, and a builder that returns a cyclic object. In every run the value carried `fast_mode` `{outcome:'ambiguous', reason:'classifier_error', uncertain_unobserved:null, human_gate:null, budget_profile:null, jev:null}` as its last key, with keys equal to `FAST_MODE_BLOCK_KEYS`. The rest of the value deep-equalled the golden, `JSON.stringify` of the value did not throw, and no heartbeat interval was left running. If attaching even that literal failed, the unmodified value would be resolved.

## Named checks (all PASS; 77 checks, 0 failed, on Node 24.14.1 and Node 20.20.2)

**Task 1** (commit `47d02d78`: RED showed 21 failures before the bridge edit, GREEN 67/0):
- "switch-off unchanged after edit" passed on 25 of 25 golden runs: the 20 V1-V4 combinations, plus a `fastMode: null` seed on each path. The original 20 "switch-off golden" checks also still pass, unedited.
- "additive", "wire bytes" and "store carries block", each for runtime-complete, bus-complete, bus-error, bus-stop and safety-net (15 checks).
  - The key-set difference is exactly `['fast_mode']`, and `fast_mode` is the last key.
  - Without the key, each value deep-equals the golden, and `success` and `status` are unchanged.
  - The block's keys equal `FAST_MODE_BLOCK_KEYS`, `budget_profile` is `'run_task'`, and the `jev` keys equal `FAST_MODE_SUMMARY_KEYS`.
  - On the wire, `JSON.stringify(omit(JSON.parse(JSON.stringify({success:true,...on}, null, 2)), 'fast_mode'), null, 2)` equals the golden `wireText`, and the parsed last key is `fast_mode` (F9).
  - Every store write before the terminal one equals the golden's. The terminal write equals the golden's except for `final_result`, which deep-equals the resolved value.
- "isolation": four sub-cases, each covering 5 of 5 paths.
- "released at settle", on 5 paths. A Proxy spy shows the block read about 5 non-heartbeat session fields during settle, and nothing read the session after settle. A second complete, error and stop event on the runtime and bus routes, plus 630 s of virtual clock, changed no store write, no sent frame and no value. No timer was left pending.
- "no extra read", in V2, V3 and V4. The start path calls `activeSessions.get` exactly once before the first heartbeat, and the count is 2 with the first heartbeat.

**Task 2** (commit `7586d99a`, test-only):

| Check | Result at the wire |
| --- | --- |
| wire outcome stop in flight | BEFORE click with no AFTER, then bus-stop: ambiguous / uncertain_action, `uncertain_unobserved` true, `status` 'stopped' |
| wire outcome clean stop | blocked / user_stopped, `uncertain_unobserved` false |
| wire outcome safety net | ambiguous / safety_net_timeout. `success`, `partial_outcome`, `partial_state` and `hint` deep-equal the golden |
| wire outcome manual approval | partial / manual_approval message: needs_confirmation / manual_approval, `human_gate` 'manual_approval', rest `{sessionId, status:'partial', result}` |
| wire outcome done | verified LLM click, then complete_task: done / complete_task |
| wire outcome uncertain complete | `{success:false, result:{outcome:'unknown', mayHaveExecuted:true}}` given to afterTool, then a success: ambiguous / uncertain_action. Wire `success` is still true and `status` is still 'success' |
| wire outcome error | blocked / error, `status` 'error' |
| wire outcome no evidence | no `_fastRunEvidence`, success: ambiguous / evidence_unavailable |
| wire outcome error without evidence | the content-script-not-ready abort shape (no outcome, no reason): blocked / error, not classifier_error. The rest is exactly `{sessionId, status:'error', error:<abort text>}` in that key order |
| wire marker scan | Markers were placed in session.task, message.result, message.error, outcomeDetails, tool args and results (text, title, URL), and jevMeasurement escalation and calibration codes. No marker appears in any of the 5 blocks. Escalation codes are all in `FAST_MODE_ESCALATION_CODES`, and the markers did reach the value or session, so the scan is not vacuous |

**Mutation checks (each reverted, and the bridge restored byte-for-byte):**
- Dropping the JSON round trip fails "isolation cyclic block".
- Putting the fallback under a different key fails 14 checks.
- Dropping handleComplete's third argument fails clean stop, manual approval, done and no evidence.

## Per-task `<automated>` wall times (Node 24)

- **Task 1:** 1.05 s. This covers the wire suite, mcp-bridge-client-lifecycle (335/0), run-task-resolve-discipline (26/0), run-task-heartbeat (17/0), delegation-phase-contract (1250/0) and the switch-key grep.
- **Task 2:** 0.41 s. This covers the wire suite, jev-run-task-outcome (785/0), delegation-phase-contract and the showcase porcelain check.

## Pin preflight, sweeps and wave check

- **Preflight (D-25).** `grep -rl mcp-bridge-client tests scripts` names 34 files. None pins the text this plan edits.
  - Source pins on the bridge are elsewhere: `mcp-settings-route` (SHA-256 of `_handleGetConfig`), `mcp-session-recorder` (recorder tap counts), `autopilot-agent-scope` (`_handleGetStatus`), `spreadsheet-record-redaction`, and the delegation-phase-contract regex audits. All pass without a pin bump.
  - The three existing run_task bridge suites and `tests/fixtures/run-task-wire-golden.json` are unedited (`git diff --quiet HEAD~1` in the Task 1 commit).
- **Task 1 sweep.** `--files extension/ws/mcp-bridge-client.js` against 70-SWEEP-BASELINE.json passed 31 of 31, with no new failures.
- **Task 2 sweep.** `--files extension/ws/mcp-bridge-client.js extension/ai/jev-fast-path.js extension/background.js` passed 114 of 114, with no new failures.
- **Wave check.** The plan's `<verification>` command exits 0 in 35.9 s. It runs `npm run validate:extension`, the rest of the bridge reader bundle, and `npx --offline -y node@20 tests/run-task-fast-mode-wire.test.js` (v20.20.2, 77/0). The official Node 20.20.2 binary also gives 77/0.
- **Other checks.**
  - `node tests/jev-run-task-upstream-contract.test.js` passes.
  - `git diff --quiet <P70_START> -- mcp/` exits 0.
  - Nothing under `extension/ai/`, `extension/background.js`, `tests/fixtures/` or `package.json` changed in this plan.
  - `git status --short showcase/angular/public` printed nothing after each sweep.
  - Port 7225 was held by the user's hub (pid 7109) and was left alone.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Choices within the plan's latitude (recorded, no scope change)

1. **The start capture is wrapped in try/catch.** The plan quotes the two fireHeartbeat lines directly. They now sit inside a try with block-scoped names, so a throwing map read can never reject the start, and only `fastModeSession` stays in the settle closure. Switch-off behaviour is identical: one `get` call, as "no extra read" shows.
2. **There is no typeof pre-check on the builder.** The acceptance criterion requires `buildFastModeBlock` on exactly one bridge line. A missing module or builder throws a TypeError inside the build try, and the plan's catch path turns that into the classifier_error block.
3. **There is a shape guard after the round trip.** A round-tripped block that is not a plain object (a string, an array, null, or undefined, which makes `JSON.parse` throw) also gives the classifier_error block. This is tighten-only and keeps "the block on the wire is always plain JSON data" true for any stub.
4. **The fallback is attached in a second try rather than a nested one.** If attaching even the literal throws, `finalValue` stays `value`, which is what the plan specified.
5. **Test breadth.**
   - Each isolation sub-case runs on all five settle paths.
   - "switch-off unchanged after edit" re-runs the 20 golden combinations itself and adds a `fastMode: null` seed.
   - "no extra read" covers V2, V3 and V4 (V1 has no map to spy on).
   - The marker scan also puts markers in `jevMeasurement` codes and tool args.
   - The 70-01 harness functions and the switch-off cases are unchanged; new helpers were added beside them.

### Defects fixed in Task 2

None. All ten Task 2 checks passed against the Task 1 code and the 70-05 builder, with no source change.

### Auto-fixed issues

None.

## Verification notes carried from the plan

- **F8 (recorded in 70-VALIDATION.md, not fixed).** The `sw_evicted` lookup reads by agentId, while snapshots are keyed by sessionId. So `final_result.fast_mode` is asserted at store level only.
- **F17 (V4/V5 context).** The MCP server's own 600 s timeout can beat the extension safety net. No test expects the safety-net block to reach a real caller.

## TDD Gate Compliance

This is a `type: execute` plan whose tasks are `tdd="true"`. Each task prescribes one commit, as in 70-03 and 70-05.
- **Task 1:** RED was observed before the bridge edit: 21 failures, covering additive and wire bytes on all five paths, isolation, released at settle and no extra read. GREEN gave 67/0. The tests and the implementation landed together in the single prescribed `feat(70-06)` commit.
- **Task 2:** the plan says these cases exercise code that already exists after Task 1, so no RED phase was possible. The handleComplete mutation above shows the cases fail when the bridge stops passing the terminal through.

## Known Stubs

None.

## Threat Flags

None. The only new wire surface is the `fast_mode` key, which is in the plan's threat model:
- **T-70-07:** goldens, key-set, last-key and byte checks.
- **T-70-04:** isolation on every path.
- **T-70-02:** closed-vocabulary builder and the marker scan at the wire.
- **T-70-01:** uncertain-then-complete and stop-in-flight read ambiguous, while `success` and `status` are unchanged.

## Deferred to Validation Block

Deferred: M-70-05 (V5), M-70-06 (V5), M-70-07 (V6: owner confirms the recorded D-17 amendment for fast_mode).
- M-70-05 (V5): Claude Code, Codex and Cursor parse a switched-on `run_task` result.
- M-70-06 (V5): real-page stop and approval outcomes.
- M-70-07 (V6): the owner confirms the recorded 2026-10-16 D-17 amendment that accepts the switch-on `fast_mode` result key under MCP-04. Switch-off results stay byte-stable.

## Next Phase Readiness

- Plan 70-07 can rely on two things. First, a switched-on bridge value is `{...switch-off value, fast_mode: <FAST_MODE_BLOCK_KEYS object>}`, with `fast_mode` last. Second, `mapFSBError`'s success passthrough stringifies it unchanged (F9).
- The "wire outcome" cases give concrete recorded blocks for the in-process caller's fake bridge. For example, the no-evidence block is `{outcome:'ambiguous', reason:'evidence_unavailable', uncertain_unobserved:null, human_gate:null, budget_profile:'run_task', jev:{attempts:0, calls:0, fast_steps:0, jev_ms:null, calibration:null, latched:null, exhausted:null, escalations:{}}}`.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

- The bridge, the wire suite and this SUMMARY all exist.
- Commits 47d02d78 and 7586d99a exist on Jev, and neither message carries AI attribution. Nothing was pushed.
- The no-evidence block quoted under Next Phase Readiness was re-derived from a live run.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched (the orchestrator owns them).
