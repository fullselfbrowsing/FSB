---
phase: 66-baseline-and-session-timing
plan: 03
subsystem: observability
tags: [mcp, per-call-timing, session-recorder, lattice-journal, fsb-config, run-identity, redaction, node-test]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: start-commit baseline (311/311 chain commands) and the W11 regression sweep with 66-02-SWEEP-BASELINE.json
provides:
  - "Ingress stamp { receivedAt } on the non-enumerable Symbol.for('fsb.mcp.call-timing') (MCP_BRIDGE_CALL_TIMING) in _handleMessage"
  - "_buildMcpCallTiming: { v:1, receivedAt, completedAt, fsbMs } or null on the bridge action-tap entry"
  - "Sheets redaction keeps a validated timing (safeTiming in baseFields)"
  - "fsb://config run identity: config { providerKind, modelProvider, modelName, maxIterations?, domOptimization?, maxDOMElements? } plus extension { id, version, measurement { callTiming:1, sessionDetailJournal:1 } }"
  - "Recorder _sanitizeCallTiming and timing forwarding: recordAction, _snapshotJournalEntry, _snapshotEntry, recordTaskOutcome, legacy actionHistory rows (timing + durationMs), SW-eviction restore"
  - "Journal metadata.timing on tool.call events, plus CALL_TIMING_LEGEND and formatCallTimingSuffix shared by both text exports"
affects: [66-04, 66-05, 66-06, 66-08, benchmark runner preflight, get_session_detail journal branch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-call timing travels on a registry Symbol that JSON, structuredClone and spreads drop; each classic-script file gets its own top-level identifier for it"
    - "One v1 timing contract, re-validated at every hop (bridge producer, Sheets redactor, recorder, journal): v === 1, safe non-negative integer times, completedAt >= receivedAt, fsbMs recomputed"
    - "Optional measurement fields are attached only when valid; an unmeasured call carries no key, never a 0"
    - "One shared line formatter, plus state that survives pages, keeps two text producers byte-identical"

key-files:
  created: []
  modified:
    - extension/ws/mcp-bridge-client.js
    - extension/utils/spreadsheet-record-redaction.js
    - extension/utils/mcp-session-recorder.js
    - extension/utils/mcp-lattice-journal.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/spreadsheet-record-redaction.test.js
    - tests/mcp-session-recorder-journal.test.js
    - tests/mcp-lattice-journal.test.js

key-decisions:
  - "_buildMcpCallTiming returns null when the wall clock stepped backwards (completedAt < receivedAt), rather than clamping fsbMs to 0"
  - "Legacy actionHistory rows keep a validated timing and a re-derived durationMs through _sanitizeActionHistory, so a service-worker eviction restore does not strip them"
  - "Each tdd task was committed once (tests and source together): the plan requires every pinned suite to be green in every commit. RED was run and recorded before each implementation"
  - "fsb://config returns the manifest version only when it is a string; mistyped optional settings are omitted, never coerced"
  - "The journal's timing helpers sit next to the text exporters, far from the INTERNAL_PAYLOAD_KEYS block, which is untouched"

patterns-established:
  - "Plan 66-06 reads the same Symbol.for('fsb.mcp.call-timing') as MCP_DISPATCHER_CALL_TIMING and passes timing into recordDispatch / recordTaskOutcome. The recorder and journal need no further change"
  - "Text-export call lines end in one of: '| fsb N ms', '| fsb N ms | caller gap N ms (upper bound)', '| fsb N ms | overlapped previous call', or '| timing not recorded'"

requirements-completed: [MEAS-01, MEAS-03]

# Metrics
duration: 19min
completed: 2026-09-30
---

# Phase 66 Plan 03: MCP Call Timing and Run Identity Summary

**MCP calls are stamped with `receivedAt` on a hidden `Symbol.for('fsb.mcp.call-timing')` where they enter the extension. The action tap turns the stamp into validated `{v:1, receivedAt, completedAt, fsbMs}` timing, which reaches the recorder, the journal's `metadata.timing`, legacy `actionHistory` rows and Sheets records. Both journal text exports show per-call FSB milliseconds and a caller gap labelled as an upper bound. `fsb://config` now returns a secret-free run identity (provider, model, extension id, manifest version, Phase 66 marker).**

This plan delivers the MCP-side slice of MEAS-01 and the run-identity slice of MEAS-03 (D-18). `requirements-completed` above lists the plan's requirement IDs for traceability only. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched, because the orchestrator owns them.

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-30T06:43:01Z
- **Completed:** 2026-09-30T07:02Z
- **Tasks:** 3/3
- **Files modified:** 8 (4 extension sources, 4 paired test files); none created

## Accomplishments

- **Ingress stamp (D-04):**
  - `_handleMessage` defines `{ receivedAt: Date.now() }` on `payload[MCP_BRIDGE_CALL_TIMING]` with `enumerable: false`, inside a try/catch (`timing capture never gates routing`).
  - Tests prove that the stamp is absent from `Object.keys`, from `JSON.stringify` and from the wire result frame, even when a handler echoes the payload back.
  - The `beginCall` identity keeps exactly its seven keys.
- **Action-tap timing:**
  - `sessionRecordEntry.timing = this._buildMcpCallTiming(payload)` is taken synchronously at the tap. It is null when there is no stamp or the stamp is malformed, and never 0.
  - A caller-supplied string key `timing` is ignored: the spoof test shows `receivedAt` always comes from the Symbol.
- **Sheets (orchestrator decision 9):** `baseFields` keeps a fresh validated `timing`. A real-bridge `fillsheet` test shows that the ingress timing survives redaction.
- **`fsb://config` (D-18, T-66-01):**
  - It reads exactly six storage keys (asserted on the storage mock) and applies the `fsbReadAuthoritativeProviderConfig` defaults.
  - Seven secret-bearing keys seeded in the test never appear in the result or on the wire.
  - It returns the extension id, the manifest version, and `measurement: {callTiming:1, sessionDetailJournal:1}`.
  - The payload shape matches `evaluatePreflight` in `scripts/bench/lib/identity.mjs` from plan 66-02.
- **Recorder:**
  - `_sanitizeCallTiming` enforces the contract.
  - Timing flows through `recordAction`, `_snapshotJournalEntry`, `_snapshotEntry` and `recordTaskOutcome` (the journal `task-status` entry).
  - Legacy-only sessions get `timing` plus `durationMs = timing.fsbMs` on their `actionHistory` rows. These fields survive an SW-eviction restore and are handed to `automationLogger.saveSession` on close; plan 66-04 persists them.
- **Journal:**
  - `recordDispatchNow` sets `metadata.timing` only when the timing is valid, so untimed events keep their byte cost, and the budget-exhausted compact marker keeps it.
  - Both text exports print the legend once, after `Calls retained` / `Executable replay`, and share `formatCallTimingSuffix`.
  - `previousCompletedAt` survives the 500-event stream pages. A timed 505-call session exports byte-identically from both producers, with a continuous caller gap at call 500 (`fsb 102 ms | caller gap 899 ms (upper bound)`).

Sample export (rendered from the committed code):

```
Calls retained: 3
Timing: fsb = extension receive to completion; caller gap = receive(n) - completion(n-1), an upper bound on host thinking time; MCP queue wait not measured

[OK] Call 1: navigate | fsb 812 ms
[OK] Call 2: click | fsb 412 ms | caller gap 9101 ms (upper bound)
[OK] Call 3: read_page | timing not recorded
```

## Task Commits

1. **Task 1: Ingress stamp, action-tap timing, Sheets timing allowlist, allowlisted fsb://config identity:** `a70ac9b6` (feat)
2. **Task 2: Carry validated timing through the session recorder:** `68cdb830` (feat)
3. **Task 3: Journal metadata.timing and per-call timing in both text exports:** `a90c8281` (feat)

**Plan metadata:** see the `docs(66-03)` commit that adds this SUMMARY.

## Files Created/Modified

- `extension/ws/mcp-bridge-client.js`:
  - `MCP_BRIDGE_CALL_TIMING` constant, the ingress stamp, and `_buildMcpCallTiming`.
  - The `timing` property on the existing tap literal (still exactly 3 `this._recordMcpSessionAction(` calls, and the `_handleExecuteAction` resolver offset is still 3845).
  - The allowlisted `_handleGetConfig`.
- `extension/utils/spreadsheet-record-redaction.js`: private `safeTiming`, and `baseFields` keeps a valid timing. Nothing else changed.
- `extension/utils/mcp-session-recorder.js`:
  - `_sanitizeCallTiming`.
  - Timing forwarding in `recordAction`, `_snapshotJournalEntry`, `_snapshotEntry` and `recordTaskOutcome`.
  - Legacy row `timing`/`durationMs`, and `_sanitizeActionHistory` keeps them on restore.
  - The replayEntries push is byte-identical, and there is still no `setTimeout(`.
- `extension/utils/mcp-lattice-journal.js`:
  - `sanitizeCallTiming`, `CALL_TIMING_LEGEND`, `formatCallTimingSuffix` and `callTimingCompletedAt`.
  - `metadata.timing` in `recordDispatchNow`.
  - Both text producers updated.
  - `INTERNAL_PAYLOAD_KEYS`, `stripInternalPayload` and `replayEntryFromEvent` unchanged.
- `tests/mcp-bridge-background-dispatch.test.js`: `runCallTimingIngressCase`, `runCallTimingActionTapCase` and `runGetConfigIdentityCase`, registered after `runRecordingLeaseDoesNotGateRoutingCase()`. 455 → 456 assertions pass, including a clock-rollback case.
- `tests/spreadsheet-record-redaction.test.js`: two cases, one for valid, invalid and non-Sheets timing and one real-bridge `fillsheet` case. The source-pin test is untouched.
- `tests/mcp-session-recorder-journal.test.js`: four cases, covering journal dispatches (valid, 10 invalid shapes, corrected fsbMs, untimed), `recordAction` forwarding, task outcomes, and legacy rows (live, restored, handed to `saveSession`).
- `tests/mcp-lattice-journal.test.js`:
  - The `entry()` helper passes `timing` through only when the override is given, so existing entries are byte-identical.
  - Four cases: metadata validation plus replay isolation, the compact marker, gap/overlap/untimed/FAILED lines with the legend, and a timed 505-call parity export.

## Verification

| Check | Result |
|-------|--------|
| Task 1 verify (`mcp-bridge-background-dispatch`, `spreadsheet-record-redaction`, `mcp-session-recorder`, `mcp-dispatcher-client-label`) | exit 0: 456/0, 20/0, 353/0, 51/0 |
| Task 2 verify (`mcp-session-recorder-journal`, `mcp-session-recorder`, `lattice-replay-background-contract`) | exit 0: 12/0, 353/0, 59 passed |
| Task 3 verify (`node --test mcp-lattice-journal + mcp-session-export-port`, `npm run test:mcp-journal`) | exit 0: 42/0; 12/0 + 39/0 |
| Plan `<verification>` chain (plus `mcp-in-flight-session-lookup`) | exit 0 (15/0 for the in-flight suite) |
| W11 sweeps vs `66-02-SWEEP-BASELINE.json` | Task 1: 24/24 (run twice); Task 2: 5/5; Task 3: 1/1; all four files combined: 27/27. No new failures (7225 held, the same state as the baseline) |
| Full `npm test` chain, tolerant mode (7225 held by pid 42278) | **311/311 commands exit 0** (13 pretest + 298 test), 207 s. Artifacts: `/tmp/fsb-66-03-chain.{jsonl,log,done}` |
| Acceptance greps | `Symbol.for('fsb.mcp.call-timing')` = 1; `MCP_BRIDGE_CALL_TIMING` = 3; tap calls = 3; resolver offset = 3845; `_handleGetConfig` secret-token scan passes; `_sanitizeCallTiming(` = 5; no `setTimeout(`; `requestPayload: _sanitizeRequestPayload(payload, entry.response)` = 1; `redactedInputs: entry.redactedInputs === true` = 3; `formatCallTimingSuffix(` = 3; `metadata.timing = ` = 1; `INTERNAL_PAYLOAD_KEYS` lines in the journal diff = 0 |
| D-01 | `git status --porcelain -- mcp/` is empty, and `git log --name-only --format= -n 10 \| grep -c '^mcp/'` = 0 |

- The chain rewrote `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`. They were reverted with `git checkout --` and never committed.
- No lockfile and no `mcp/` file changed.

## Decisions Made

- **Clock-rollback guard at the source.** See Deviation 1.
- **Restore keeps legacy timing.** See Deviation 2.
- **Commit granularity:** one commit per task (see TDD Gate Compliance).
- **`fsb://config` hardening beyond the plan text:**
  - The manifest version is kept only when it is a string.
  - `(await chrome.storage.local.get(...)) || {}` tolerates a storage mock that returns undefined.
  - `chrome.runtime` is read once, with a guard.
- **Timing validators are fail-closed and exception-safe.** `_buildMcpCallTiming`, `_sanitizeCallTiming` and the journal's `sanitizeCallTiming` each catch their own errors and return null, so a malformed timing can never drop the whole record (T-66-05b).
- **Where timing is written:**
  - The legacy open-session buffer is `chrome.storage.session` (the existing per-mutation SW-eviction buffer), not `chrome.storage.local`. Timing integers on legacy rows therefore travel only with that existing write.
  - `chrome.storage.local` receives them only at session close, through `saveSession`. That satisfies D-04's "never per call to `chrome.storage.local`".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `_buildMcpCallTiming` returns null on wall-clock rollback instead of an invented 0**
- **Found during:** Task 1
- **Issue:** The plan's literal builder returns `fsbMs: Math.max(0, completedAt - receivedAt)`. If the clock steps backwards, that object has `completedAt < receivedAt` with `fsbMs: 0`, which is exactly the invented zero the contract forbids. Every downstream validator would drop it, but the in-memory entry would carry it.
- **Fix:** When `completedAt < receivedAt` (or `completedAt` is not a safe integer), the builder returns null. Otherwise `fsbMs = completedAt - receivedAt`.
- **Files modified:** `extension/ws/mcp-bridge-client.js`, `tests/mcp-bridge-background-dispatch.test.js`
- **Verification:** the case "a stamp with receivedAt after completion (clock stepped back) records timing null" passes.
- **Committed in:** `a70ac9b6`

**2. [Rule 2 - Missing critical functionality] Legacy row timing was lost on service-worker eviction restore**
- **Found during:** Task 2
- **Issue:** `_restoreFromBuffer` (and the one-time redaction scrub) rebuild `actionHistory` rows through `_sanitizeActionHistory`, which copies an explicit five-field list. `timing`/`durationMs` would silently vanish from every legacy session that outlived an MV3 eviction. That breaks the must-have "Legacy-only MCP sessions carry timing and durationMs on their actionHistory rows".
- **Fix:** `_sanitizeActionHistory` keeps a `_sanitizeCallTiming`-validated `timing` and re-derives `durationMs` from it. Untimed rows keep their exact five keys in the same order.
- **Files modified:** `extension/utils/mcp-session-recorder.js`, `tests/mcp-session-recorder-journal.test.js`
- **Verification:** the restore segment of "legacy-only sessions carry timing and durationMs on actionHistory rows" passes, and the 353-assertion `mcp-session-recorder` suite (restore cases included) is unchanged.
- **Committed in:** `68cdb830`

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2).
**Impact on plan:** both close correctness gaps inside the plan's own contract. There is no scope creep, and the footprint is exactly the plan's `files_modified`.

## TDD Gate Compliance

All three tasks are `tdd="true"`, but the plan type is `execute`, and the plan requires every pinned suite to "stay green in every commit". A standalone RED commit would have left in-chain suites (for example, `tests/mcp-bridge-background-dispatch.test.js`) failing at that commit. So RED was run before each implementation but not committed separately. Each task has one `feat(66-03)` commit that pairs the tests with the source.

| Task | RED (tests written first, before source) | GREEN |
|------|-------------------------------------------|-------|
| 1 | bridge 432 pass / 23 fail; Sheets 18 / 2 (all failures in new cases) | 456 / 0; 20 / 0 |
| 2 | recorder-journal 8 / 4 (the 4 new cases) | 12 / 0 |
| 3 | lattice-journal 35 / 4 (the 4 new cases; the extended `entry()` kept all 35 existing cases green) | 39 / 0 (+3 export-port) |

## Issues Encountered

- graphify's graph is stale for these files, as 66-PATTERNS.md notes: a query returned unrelated nodes. The verified line numbers in the plan and in PATTERNS were used instead. Every one matched the working tree.
- The pre-commit `worktree-agent-*` branch allow-list was skipped because the orchestrator directed commits on `Jev`, as in 66-02. The cwd-drift sentinel and the protected-branch deny-list ran before each commit.

## Known Stubs

These are intentional and resolved by plan 66-06:
- **Dispatcher-routed calls are not timed yet.** Only `mcp:execute-action` calls, which go through the bridge action tap, carry timing today. Message-route calls (read-only tools recorded by the dispatcher's `recordDispatch` site) and `complete_task`/`partial_task`/`fail_task` outcomes show `| timing not recorded` until 66-06 adds `MCP_DISPATCHER_CALL_TIMING` and passes `timing` into `recordDispatch` / `recordTaskOutcome`. The recorder already accepts `input.timing` on `recordTaskOutcome`; no production caller passes it yet.
- **The `measurement.sessionDetailJournal: 1` marker comes before the feature it names.** `fsb://config` advertises it as the fixed Phase 66 build marker, but the journal-first `get_session_detail` branch lands in 66-06. A build between 66-03 and 66-06 advertises it early. The live campaign runs only after the whole phase is in, so preflight is unaffected in practice.

## Threat Model Coverage

- **T-66-05 (tampering):**
  - Timing is read only from the Symbol.
  - The string-key spoof test passes.
  - The recorder, journal and Sheets redactor re-validate and recompute `fsbMs`.
  - Ten invalid shapes are dropped in the recorder tests, and seven in the journal tests.
- **T-66-01 (information disclosure):**
  - A six-key read, asserted on the storage mock.
  - The seeded-secret test covers both the return value and the wire frame.
  - The source scan forbids `apiKey`/`ApiKey`/`selectedModel`/`customEndpoint`/`captcha` inside `_handleGetConfig`.
- **T-66-03 (accepted):** text exports add only integers and fixed labels.
- **T-66-05b (denial of service):**
  - Every stamp and read is wrapped in try/catch.
  - Recording stays fire-and-forget.
  - No timer was added, and there is no per-call `chrome.storage.local` write.

No new security surface beyond the plan's threat register.

## User Setup Required

None.

## Next Phase Readiness

- **66-04 (automation-logger):** closing a legacy MCP session hands `actionHistory` rows with `timing` and `durationMs` to `saveSession` (proved by test). The logger's two `.map` projections must keep both fields.
- **66-06 (dispatcher):**
  - Declare `const MCP_DISPATCHER_CALL_TIMING = Symbol.for('fsb.mcp.call-timing');`.
  - Add `timing` (built the same way as `_buildMcpCallTiming`, with `completedAt` taken synchronously) to the message-route `var sessionRecordEntry = {`.
  - Read the stamp from the original payload at the top of `dispatchMcpToolRoute`, before canonicalization, and pass `timing` into `recordTaskOutcome({ tool, params, payload, response, timing })`.
  - The `format:'text'` branch can call `journal.exportHumanReadable`, which already shows per-call ms.
- **66-05 / 66-08 (bench runner):** `fsb://config` now satisfies `evaluatePreflight`'s marker, provider and model checks, with no `mcp/` change.
- **Blockers:** none.

## Self-Check: PASSED

- All 8 modified files exist on disk. No file was created.
- All three task commits exist: `a70ac9b6`, `68cdb830`, `a90c8281`.
- No commit in `783b8650..HEAD` has a Co-Authored-By or AI attribution line.
- `git status --porcelain -- mcp/` is empty. The working tree was clean before this SUMMARY was written.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
