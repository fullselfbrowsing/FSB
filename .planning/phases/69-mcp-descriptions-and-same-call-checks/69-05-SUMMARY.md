---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 05
subsystem: extension
tags: [expect, dispatcher, isolated-world, webnavigation, commit-gating, back, journal, recorder, mcp-04]

# Dependency graph
requires:
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-03: evaluateExpectation, normalizeExpectSpec, buildUncertainExpectResult, _fsbExpectProbeInPage, EXPECT_TOOL_NAMES, EXPECT_NAV_TOOL_NAMES (extension/utils/action-verification.js)"
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-01: 69-SWEEP-BASELINE.json ($P69_START f978e989) and the 4,190 _handleExecuteAction offset"
provides:
  - "extension/ws/mcp-tool-dispatcher.js: _injectProbe (ISOLATED + injectImmediately), _resolveExpectEvaluator (bare identifiers, then require), _resolveExpectSpec (verb-resolved 29-tool gate), _watchMainFrameCommit, _attachExpectResult, _executeWithExpect; wrapWithChangeReport evaluates expect in every gate state; handleBackRoute evaluates after its own settle with the commit watcher subscribed before goBack"
  - "extension/ws/mcp-bridge-client.js: payload.expect forwarded into both wrapWithChangeReport calls (offset 4,224)"
  - "'expect' in the journal INTERNAL_PAYLOAD_KEYS and the recorder mcp: replay strip list; the recorder never stores expect in a request payload"
  - "tests/expect-dispatcher.test.js (142 checks), chained"
affects: [69-06, 69-07, 69-08, 68, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-worker globals from classic scripts: function declarations are globalThis properties, top-level const bindings are not, so resolve them with bare-identifier typeof checks (try/catch for a binding a failed load left uninitialized)"
    - "Navigation verdicts are commit-gated: subscribe to main-frame webNavigation commits before the action, judge nothing before a commit, and treat a probe of any other documentId as stale"
    - "Load the real classic scripts into one vm context without require/module to prove service-worker resolution; build payload objects inside that realm (JSON.parse there), as the bridge does"

key-files:
  created:
    - tests/expect-dispatcher.test.js
  modified:
    - extension/ws/mcp-tool-dispatcher.js
    - extension/ws/mcp-bridge-client.js
    - extension/utils/mcp-lattice-journal.js
    - extension/utils/mcp-session-recorder.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "An unavailable evaluator degrades to today's path (no expect_result); the MCP side reports extension_unsupported (69-06)"
  - "expect_result rides only on success:true or mayHaveExecuted:true; definitive failures, ownership rejects and back's navigation_unavailable / tab_closed_during_back keep today's shape"
  - "The commit watcher keeps the committed documentId across same-document updates (fragment, history state) and replaces it on every new-document commit"
  - "The recorder drops expect in _sanitizeRequestPayload, so no stored request payload (journal, legacy history or the open-session buffer) carries it; expect_result stays in recorded responses"

patterns-established:
  - "69-06 can send expect knowing the extension evaluates it for all 29 tools (wire verbs resolved) and for back; without expect the extension path and response shapes are unchanged"
  - "69-07 parity can read 'expect' from INTERNAL_PAYLOAD_KEYS and from the recorder's 'visualSession', 'client', 'expect' line"

requirements-completed: [MCP-02, MCP-04]

# Metrics
duration: 23min
completed: 2026-10-15
---

# Phase 69 Plan 05: Same-call expect in the extension dispatch path Summary

**The extension now evaluates `expect` in the same call. The evaluation runs after `execute()` for the 29 tools, after wire verbs are resolved to tool names, and it runs whether the change-report toggle is on or off. Probes run in the ISOLATED world, navigation tools are commit-gated, and `back` is evaluated after its own settle. Without `expect` the path is byte-for-byte today's: the same injections in the same order, zero injections with the toggle off, and no `expect_result` key. `expect` never reaches params, journal payloads or replay payloads.**

## Performance

- **Duration:** about 23 min
- **Started:** 2026-10-15T14:06Z
- **Completed:** 2026-10-15T14:29Z
- **Tasks:** 2 of 2
- **Files modified:** 7 (1 created, 6 modified)

## What was built

### Dispatcher (`extension/ws/mcp-tool-dispatcher.js`)

All new helpers sit before `wrapWithChangeReport`. The hung-page-recovery slice still holds `'navigate', 'close_tab'` and `return execute()`.

- **`_injectProbe(tabId, func, args)`** works like `_injectFn`, with two differences: it uses `world: 'ISOLATED'` and `injectImmediately: true`. It returns `{ ok: true, result, documentId }`, or `{ ok: false, reason }` with one of `no_scripting`, `timeout` (it lost the 750 ms race), `no_result` or the error message. It clears its race timer and never throws.
  - There is exactly one `world: 'ISOLATED'` site.
  - The `world: 'MAIN'` count equals `$P69_START`'s.
- **`_resolveExpectEvaluator()`** tries bare identifiers first. In the service worker, the `EXPECT_*` constants are top-level `const` bindings, which are not `globalThis` properties. If that fails it tries `require('../utils/action-verification.js')`, and otherwise returns `null`. It never reads `globalThis.EXPECT_*` or `self.EXPECT_*`.
- **`_resolveExpectSpec(rawExpect, toolNameOrVerb)`** returns `null` in three cases: there is no `expect`, there is no evaluator, or the tool is outside the 29. It resolves `_mcp_getToolByNameOrVerb(verb).name` first, so `type`, `keyPress`, `cdpClickAt`, `dragdrop` and `toggleCheckbox` are all covered. `back` falls back to the literal. Otherwise it returns `{ toolName, isNav, normalized, evaluator }`.
- **`_watchMainFrameCommit(tabId)`** subscribes to `onCommitted`, `onReferenceFragmentUpdated` and `onHistoryStateUpdated`, for frame 0 only.
  - With a finite `tabId` it records only that tab.
  - With a null `tabId` it buffers commits per tab until `bindTab(id)` picks one (the navigate bootstrap).
  - `dispose()` removes every listener.
  - Without `chrome.webNavigation` it returns a non-required watcher.
- **`_attachExpectResult(response, expectCtx, tabId, commit)`** works as follows:
  - It acts only on `success === true` or `mayHaveExecuted === true`.
  - The tab is the context tab, else a finite `response.tabId`, else `no_tab`.
  - A malformed spec gives `invalid_expect`. An evaluator exception gives `evaluator_failed`.
  - `pageUnresponsive` is set from `errorCode` or `code` `PAGE_UNRESPONSIVE`.
  - It never changes `success` and never throws.
- **`_executeWithExpect(expectCtx, execute, tabId)`** creates the watcher before `execute()` for navigation tools. It binds the watcher to `response.tabId` when the tab id was null, attaches the result, and disposes the watcher in `finally`. A throw from `execute()` propagates unchanged.
- **The `wrapWithChangeReport` gate.** `expectCtx` is computed after the existing gate variables, and the skip-list literal keeps its order.
  - On the skip branch: `if (!expectCtx) return execute();`, then `return _executeWithExpect(...)`.
  - On the harvest path, each of the three `return response;` sites now attaches the result when `expectCtx` is set. Nothing else in the harvest changed.
- **`handleBackRoute`.** `expectCtx` is resolved after both ownership gates.
  - **`no_history`:** the result is attached at once, with no commit required and no listener.
  - **Navigation path:** `backCommit = _watchMainFrameCommit(targetTabId)` is created right after the `no_history` return, before `stampAgentNavigation` and `chrome.tabs.goBack`. It is disposed on the `navigation_unavailable` and `tab_closed_during_back` returns, and in a `finally` around the attach before the success return.
  - **Unchanged:** no existing statement moved, and there is still no tabs-update call.
- **Test-only exports:** `_injectProbe`, `_resolveExpectSpec` and `_watchMainFrameCommit`.

### Bridge client, journal and recorder

- `extension/ws/mcp-bridge-client.js` gets exactly two `expect: payload.expect,` lines, one in each `wrapWithChangeReport({...})` literal in `_handleExecuteAction`.
- **`_handleExecuteAction` offset:** `resolveAgentTabOrError` is now **4,224** characters after `async _handleExecuteAction` (4,190 before, so 34 added). That leaves 276 characters of headroom under the 4,500 window. Neither `action-tool-agent-scoped` nor `ownership-error-codes` prints "skipped".
- `INTERNAL_PAYLOAD_KEYS` ends with `'recordingLeaseMs', 'expect'`. The recorder's `mcp:` strip list reads `'connectionId', 'connection_id', 'visualSession', 'client', 'expect'`.
- The recorder's `_sanitizeRequestPayload` drops `expect`; see deviation 1. `expect_result` stays in recorded responses.

### `tests/expect-dispatcher.test.js` (142 checks, chained)

- **Wrapper without `expect`.** With the toggle off and `expect` undefined or null: zero injections, no `expect_result` key and no listener. With the toggle on: exactly start, waitStable and stop, all in MAIN.
- **Wrapper with `expect`.**
  - With the toggle off, the probe runs after `execute()`, in ISOLATED with `injectImmediately` and `_fsbExpectProbeInPage`.
  - With the toggle on, the three MAIN harvest injections run first, then the probe, and the response has both `change_report` and `expect_result`.
  - Wire verbs `type`, `cdpClickAt`, `toggleCheckbox`, `keyPress` and `dragdrop` are evaluated. `hover` and `open_tab` are ignored.
- **Navigation.**
  - For `refresh`, the three subscriptions happen before `execute()`. Commits for another tab, or for a subframe, are ignored. Every listener is removed afterwards, including when `execute()` throws (the throw propagates).
  - With no commit, the result is `no_commit` and there is no probe.
  - A probe of a document other than the committed one is `stale_document`.
  - For the navigate bootstrap, the result falls back to `response.tabId`, and `no_tab` is reported when no tab id exists.
- **Outcomes.** A definitive failure gets no `expect_result` and no probe, with the toggle on or off. `mayHaveExecuted` gets one. The suite also covers `unmet`, `page_unresponsive` without a probe, and a malformed spec giving `invalid_expect`.
- **Single activation:** `execute()` is called exactly once in every case.
- **Service-worker vm case.** `tool-definitions`, `action-verification` and the dispatcher are loaded in `importScripts` order into one context, with no `require` and no `module`.
  - `typeof globalThis.EXPECT_TOOL_NAMES` is `'undefined'`, while `typeof EXPECT_TOOL_NAMES` is `'object'`.
  - `wrapWithChangeReport` returns `verified`, and only the ISOLATED probe was injected.
- **`back`.**
  - Verified after the settle.
  - The three `addListener` calls come before `tabs.goBack`. When the settle ends without a commit while the old page still shows the text, the result is `uncertain` / `no_commit`, never `verified`, and the old page is never probed.
  - `no_history` is evaluated with no listener.
  - Ownership rejects, `navigation_unavailable` and `tab_closed_during_back` get no `expect_result`, and their listeners are removed.
  - Without `expect`, the response deep-equals today's shape and no `webNavigation` listener is added.
  - The tabs update API is never called.
- **Bridge.** The real `_handleExecuteAction` is run through vm. `payload.expect` reaches the resolved-tab wrap call and the bootstrap wrap call (before `resolveAgentTabOrError`), and it never enters params. The source check covers the two lines and the offset.
- **Journal and recorder.**
  - The journal's stored request has no `expect` and equals the payload recorded without one, and `expect_result` is kept.
  - In the recorder, the action-tool and `mcp:go-back` replay payloads have no `expect` (and no raw expected value) and equal their no-`expect` twins.
  - `redactedInputs` stays false, no `actionHistory` params contain `expect`, and `expect_result` is kept.
- **Registration.** The suite appears exactly once at the end of `package.json` `scripts.test` and of `REFINEMENT_ROOT_TEST_COMMANDS`. No `PRE_PHASE6x` hash was edited.

## Sweep and chain results

- **Task 1 sweep** (`--files extension/ws/mcp-tool-dispatcher.js`): 42 tests were selected (38 measured before this phase, plus suites added since that name the file, including the new one). 42/42 passed, no new failures, exit 0.
- **Task 2 sweep** (dispatcher, bridge client, journal and recorder): 57 selected (53 measured before this phase). 57/57 passed, no new failures, exit 0.
- **Baseline failures.** The pre-existing failures in `69-SWEEP-BASELINE.json` (`agent-manager-start-mode`, `back-tool`, `trigger-cap-settings-ui`) were not selected by either sweep and were not touched.
- **Full chain (extra check, tolerant runner, Node v24):** 330 commands. One failed: `node tests/mcp-install-platforms.test.js`, with its 2 known environmental cases ("expected daemon_offline, got ok" and `EADDRINUSE`), because the user's native-host daemon holds 7225/7226. That is the same single failure as at baseline. The crawler files it rewrote were restored with `git checkout --`.
- **Showcase files:** `git status --short showcase/angular/public` was empty before both task commits.
- **Change-report suites:** `tests/change-report-toggle.test.js` and `tests/change-report-dispatcher.test.js` are unmodified and green.

## Task Commits

1. **Task 1: ISOLATED probe injector, evaluator resolver, commit watcher and the wrapWithChangeReport gate refactor:** `ae39c486` (feat)
2. **Task 2: back-route hook, bridge-client forwarding and expect stripped from journal and replay payloads:** `6476c6ac` (feat)

**Plan metadata:** see the docs commit that adds this SUMMARY.

## Files Created/Modified

- `extension/ws/mcp-tool-dispatcher.js`: the six helpers, the gate refactor, the three harvest return sites, the `handleBackRoute` hook and three test-only exports.
- `extension/ws/mcp-bridge-client.js`: two `expect: payload.expect,` lines.
- `extension/utils/mcp-lattice-journal.js`: `'expect'` added to `INTERNAL_PAYLOAD_KEYS`.
- `extension/utils/mcp-session-recorder.js`: `'expect'` added to the `mcp:` replay strip list, and `delete clone.expect` in `_sanitizeRequestPayload`.
- `tests/expect-dispatcher.test.js`: new chained suite.
- `package.json`, `tests/delegation-phase-contract.test.js`: registration, once each.
- **Unchanged:** `extension/background.js`, `manifest.json`, `extension/content/` and `extension/ai/tool-definitions.js`, all identical to `$P69_START`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] The recorder stored `expect` in every request payload**
- **Found during:** Task 2.
- **Issue:** The two planned strip lists change the journal's stored request and the replay-invocation comparison. But `_sanitizeRequestPayload` copied the whole bridge payload into `replayEntries[].requestPayload`, `expect` included. That copy goes into the open-session buffer, and into history on the legacy backend. Because `_sanitizeRequestPayload` sanitizes with `sensitiveTarget` false, a value check's `expect.value`, which may be a password the caller just typed, was stored raw while `params.text` for the same field was redacted. A probe showed `"expect":{"value":"hunter2"}` in the open session.
- **Fix:** `delete clone.expect;` in `_sanitizeRequestPayload`. Every recorder snapshot (legacy, journal and restored entries) is now `expect`-free, and the journal strip stays as defence in depth. The `'expect'` entry in `_replayInvocationPayload` keeps `redactedInputs` false for `mcp:go-back`; without it, the raw-versus-sanitized comparison would flag the stripped key.
- **Files modified:** extension/utils/mcp-session-recorder.js
- **Commit:** `6476c6ac`

### Design choices the plan left open (recorded, not rule-driven)

- `_resolveExpectSpec` also returns the resolved `evaluator`, so `_attachExpectResult` does not resolve it again.
- The bare-identifier check sits inside `try/catch`. A classic script that throws mid-load can leave a `const` binding uninitialized, and `typeof` on such a binding throws.
- `extension/utils/lattice-replay.js` has a third `mcp:` key list, in `invocationArguments`. It was reviewed and left unchanged, for two reasons. Recorded payloads always carry `params` (`_sanitizeRequestPayload` sets it), so the `mcp:` branch never sees a recorded payload. And the recorder no longer stores `expect` anyway.
- In the vm test, the `expect` object is created with `JSON.parse` inside the vm realm. `normalizeExpectSpec` accepts only same-realm plain objects, which is true in the service worker, where the bridge parses payloads.

### TDD note

Each task's tests were written first and run red: 38 of 88 checks failed for Task 1, and 16 of 142 for Task 2. The tests were not committed separately. The plan names one commit per task, and D-24 requires the chained suite to stay green from every commit.

---

**Total deviations:** 1 auto-fixed (Rule 2 security). **Impact:** stricter than specified, since `expect` is absent from every stored request payload, not only from the journal and the replay comparison. All planned behaviours and acceptance commands hold as written.

## Issues Encountered

None.

## Deferred to Validation Block

- **V5:** ISOLATED-world probe behaviour on the real unpacked extension (Profile 2 or 5): `injectImmediately` on loading documents, `InjectionResult.documentId` against the `webNavigation` commit `documentId`, and FSB ref resolution (`window.FSB.resolveRef`) in that world.
- **V5:** verdict sanity on real navigations: cross-origin moves, BF-cache restores on `go_back` and `back` (whether `onCommitted` fires and carries the restored `documentId`), `pendingUrl`/loading transitions, prerender activation, and background tabs (RESEARCH A2, A3, Pitfall 10).
- **V4:** calibrate the 750 ms probe race reused by `_injectProbe` (listed with the 69-03 constants).

## Known Stubs

None.

## Threat Flags

None. The `webNavigation` listeners use an existing manifest permission. The ISOLATED probe and the strip lists are the planned T-69-01, T-69-02, T-69-03 and T-69-07 mitigations.

## Next Phase Readiness

- 69-06 can start sending `expect`. Without `expect` the extension behaves exactly as before, so a new server never meets an old path inside one release.
- **Constraint for 69-06:** `back` now spends up to `timeout_ms` plus one 750 ms probe after its 2 s settle. `agents.ts` must therefore raise the bridge timeout when `expect` is present (RESEARCH Finding 1), and keep exactly `5_000` without it.

## Self-Check: PASSED

- Files: `tests/expect-dispatcher.test.js`, `extension/ws/mcp-tool-dispatcher.js`, `extension/ws/mcp-bridge-client.js`, `extension/utils/mcp-lattice-journal.js`, `extension/utils/mcp-session-recorder.js` and this SUMMARY all exist.
- Commits `ae39c486` and `6476c6ac` exist on `Jev`. Neither carries AI attribution.
