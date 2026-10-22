---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 07
subsystem: testing
tags: [expect, parity, sc4, in-process-sdk, headless-chrome, cdp, redaction, mcp-02, mcp-04]

# Dependency graph
requires:
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-03: the extension expect contract (EXPECT_* constants, normalizeExpectSpec, evaluateExpectation, _fsbExpectProbeInPage, buildUncertainExpectResult) and the D-25 harvest redaction"
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-05: 'expect' in INTERNAL_PAYLOAD_KEYS and the recorder mcp: strip list; _handleExecuteAction offset 4,224"
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-06: the MCP expect wire (EXPECT_TOOL_NAMES, EXPECT_SHAPE, clampExpectTimeoutMs, EXPECT_BRIDGE_HEADROOM_MS, buildUnsupportedExpectResult) and the D-21 unknown-outcome trailer"
provides:
  - "tests/expect-parity.test.js (82 checks, chained): every hand-mirrored piece of the expect contract plus the 4,500-character ownership-guard window"
  - "tests/mcp-expect-caller.test.mjs (12 node:test cases, chained, never skips): SC4 layer 1, an SDK caller acts and reads its verified effect in one tools/call"
  - "tests/expect-outcome-browser.test.mjs + tests/fixtures/expect-outcome.html (10 cases, chained): SC4 layer 2, the real probe against a live DOM in headless Chrome"
  - "tests/mcp-tool-smoke.test.js: EXPECT_SIDECAR_FIELDS guard (no captured payload carries expect)"
affects: [69-08, 70, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Caller transcript: wrap the SDK client's transport.send after connect and count JSON-RPC requests, so 'one call' is measured, not assumed"
    - "Stand-in extension: a stub bridge that runs the real normalizeExpectSpec + evaluateExpectation with canned tab/probe deps and a fake clock"
    - "Launch-or-skip: launch Chrome once with top-level await; launch problems become a printed skip reason, anything after a DevTools endpoint is a real failure"
    - "CDP documentId: main-frame loaderId read before and after each probe; a probe that straddles a navigation reports ok:false"

key-files:
  created:
    - tests/expect-parity.test.js
    - tests/mcp-expect-caller.test.mjs
    - tests/expect-outcome-browser.test.mjs
    - tests/fixtures/expect-outcome.html
  modified:
    - tests/mcp-tool-smoke.test.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The MCP redaction marker is read from buildUnsupportedExpectResult's value check (the MCP side does not export EXPECT_REDACTED), so no mcp/src change was needed"
  - "Beyond kind/order parity, the parity test byte-compares MCP buildUnsupportedExpectResult with the extension's buildUncertainExpectResult(…, 'extension_unsupported') for six specs, so an old extension and an evaluator that could not run look identical to a caller"
  - "The layer-2 harness loads the fixture over file:// like its analog (no loopback HTTP server), so the suite binds no port of its own"
  - "tabsGet over CDP never returns null: mid-navigation it reports a loading tab with the last known URL, as chrome.tabs.get does, so a reload is never misread as tab_closed"

patterns-established:
  - "69-08 and Phase 70 can reuse the stand-in-extension bridge and the transcript counter from tests/mcp-expect-caller.test.mjs"
  - "Phase 68/70 done checks can reuse tests/expect-outcome-browser.test.mjs's CDP deps for evaluateExpectation against real pages"

requirements-completed: [MCP-02, MCP-04]

# Metrics
duration: 14min
completed: 2026-10-15
---

# Phase 69 Plan 07: Expect parity and the SC4 caller proof Summary

**Three new chained suites close the proof for SC2 and SC4. The parity test checks every hand-mirrored piece of the `expect` contract in one place and keeps the ownership-guard window honest. The in-process SDK caller test shows one `tools/call` performing an action and returning its verified effect, through every status path. The headless Chrome suite runs the real probe against a live DOM. Layer 2 ran and passed locally (10/10, 0 skipped) on Node 24.14.1 and Node 20.20.2.**

## Performance

- **Duration:** about 14 min, plus the background full-chain run
- **Started:** 2026-10-15T14:52Z
- **Completed:** 2026-10-15T15:06Z
- **Tasks:** 3 of 3
- **Files modified:** 7 (4 created, 3 modified)

## What was built

### Task 1: `tests/expect-parity.test.js` (82 checks) and the smoke-test guard

This is a plain-node CJS harness. It imports `mcp/build` behind `assertBuildFresh()` and `require`s the extension module. The checks:

- **The 29 names:** MCP `EXPECT_TOOL_NAMES`, the extension's `EXPECT_TOOL_NAMES` and the helper's `EXPECT_TOOL_NAMES_VERBATIM` are identical arrays in the same order. The test also checks that `EXPECT_TOOL_SET` holds exactly those names and that the navigation subset is inside them.
- **Timeouts and caps:** the default (2,000 ms), the cap (5,000 ms) and the string cap (2,000 characters) are equal on both sides. Both `clampExpectTimeoutMs` functions return the same values (`Object.is`) for `[undefined, null, 'abc', NaN, -5, 0, 1234.9, '3000', 99999, Infinity]`.
- **Result shape (D-19):**
  - The MCP `buildUnsupportedExpectResult` uses only `EXPECT_RESULT_KEYS` keys, in order.
  - Each of its check objects has exactly `EXPECT_CHECK_KEYS`.
  - For the every-predicate spec, its kinds equal `EXPECT_CHECK_KINDS` in the fixed order and match the extension's `buildUncertainExpectResult` kinds.
  - Its reason, `extension_unsupported`, is in `EXPECT_UNCERTAIN_REASONS`, and its statuses come from `EXPECT_STATUSES` and `EXPECT_CHECK_STATUSES`.
  - Its value `expected` is `EXPECT_REDACTED`.
  - Beyond the plan, the two builders are byte-compared for six specs: every predicate; selector alone; `value: ''`; a password value with a 99,999 timeout; a 130-character text with a `"3000"` timeout; and `dialog_open: false` with -5.
- **Back headroom:** `EXPECT_BRIDGE_HEADROOM_MS` (1,500) is greater than `_PAGE_INJECTION_TIMEOUT_MS` (750). The 750 is parsed from the dispatcher source, which must declare it exactly once.
- **Description length:** `MCP_EXPECT_DESCRIPTION` is 151 characters, within the 160 limit.
- **Validator parity (D-16):** one table runs through `EXPECT_SHAPE.expect.safeParse` and `normalizeExpectSpec`, and on disagreement the test prints the row and both verdicts. The table has the plan's 13 rows (10 rejects and 3 accepts, including `value: ''`) plus 9 rows where both validators agree: fractional, non-numeric, empty, numeric-string and out-of-range `timeout_ms`; `dialog_open` as a string and `false`; a 2,000-character string at the cap; and `state: 'gone'`.
- **Redaction (D-19):** the MCP marker equals `EXPECT_REDACTED`. The value-check observed rule is checked, and the raw page value `secret-token-123` is shown to be absent, in four results:
  - the extension's `evaluateExpectation` with a canned unmet plain-field observation;
  - the same evaluator with a met sensitive observation (redacted on both sides);
  - `buildUncertainExpectResult`;
  - the MCP `buildUnsupportedExpectResult`.
- **D-25 marker:**
  - The `const REDACTED = '…'` literal in both `_fsbHarvestStartInPage` and `_fsbHarvestStopInPage` equals `EXPECT_REDACTED`. Each function body is sliced from the dispatcher source.
  - A `buildChangeReport` run shows the same marker in `inputs_changed` and in a flagged `value` entry of `attrs_changed`.
- **Strip lists (D-15):** the test reads `'expect'` from the source of the journal's `INTERNAL_PAYLOAD_KEYS` slice and from the recorder's `_replayInvocationPayload` `mcp:` list. It also requires the smoke test to declare `const EXPECT_SIDECAR_FIELDS = ['expect'];`, and `RECORDING_SIDECAR_FIELDS` must not hold `'expect'`.
- **Guard window (T-69-07):** `resolveAgentTabOrError` sits 4,224 characters after `async _handleExecuteAction`, inside the 4,500 window. Outside it, the check fails rather than skips, and prints the offset.
- **`tests/mcp-tool-smoke.test.js`:**
  - `const EXPECT_SIDECAR_FIELDS = ['expect'];` sits next to the unchanged `RECORDING_SIDECAR_FIELDS`.
  - `normalizeRecordingSidecar` asserts "<tool> sends no expect sidecar when the caller sent none" for every captured payload, which adds 39 checks (268 to 307 passed).
  - No golden payload changed. The suite stays in the CI `mcp-smoke` job, outside `npm test`.

### Task 2: `tests/mcp-expect-caller.test.mjs` (12 cases, never skips)

The caller is the SDK `Client` over `InMemoryTransport`, created through `createInProcessClient({ bridge })` with the mock AgentScope.

- **Stand-in extension.** The stub bridge answers `mcp:execute-action` and `mcp:go-back` with the scenario's canned action result. When the payload carries `expect` and the result is `success: true` or `mayHaveExecuted: true`, it runs the real `normalizeExpectSpec` and `evaluateExpectation`. The deps are a canned tab, canned probe observations (it asserts that the injected function is the real `_fsbExpectProbeInPage`) and a fake clock.
- **Transcript.** The client transport's `send` is wrapped, so each scenario asserts that the caller sent exactly one request, `tools/call`, with no follow-up read, and that it caused one bridge dispatch.

Scenarios:

1. `click` + `{ text_visible: 'Saved' }`: one response holds the action result and `expect_result` `verified`, and `payload.expect` deep-equals the input and is absent from `params`.
2. `navigate` + `url_includes` with a committed navigation: `verified` with no probe; the timeout stays 30 s.
3. Unknown outcome: `isError: true`. The trailer keys are `outcome`, `mayHaveExecuted`, `expect_result`, with status `verified`. The Next action line says "Do not repeat the action" and does not contain "retry".
4. Status paths:
   - **4a:** `unmet` at the 2,000 ms deadline after several probes, with no reason.
   - **4b:** `uncertain` with reason `probe_timeout` and a single probe.
   - **4c:** an unmet plain-field value check whose canned observation carries `secret-token-123` returns observed `[redacted]`, and the MCP response text never contains the raw value.
5. A stringified `expect` arrives parsed and is `verified`.
6. Without `expect`: no `expect` key in the payload or `params`, and the response text equals `JSON.stringify(canned, null, 2)`.
7. `type_text` travels as wire verb `type`, and `click_at` as `cdpClickAt` (its params rebuilt by `PARAM_TRANSFORMS` without `expect`). Both get `expect_result`.
8. `back`:
   - **8:** `mcp:go-back` carries `expect`, the timeout is 5,000 + clamp(1,000) + 1,500 = 7,500, and the result is `verified`.
   - **8b:** without `expect`, the timeout is 5,000 and the response bytes are the canned result.
9. A malformed `expect` is rejected with `-32602` and causes zero bridge dispatches.

### Task 3: `tests/expect-outcome-browser.test.mjs` + `tests/fixtures/expect-outcome.html` (10 cases)

**Fixture page.** It is static and loads no `extension/content` scripts, so `window.FSB` is absent. Nothing is scheduled at load. `window.__armDelayed(ms)` resets `#status` to "Saving", re-inserts `#spinner` ("Loading"), cancels any pending timer, and `ms` later sets "Saved" and removes the spinner. The page also has:

- `#agree`, an unchecked checkbox;
- `#bold`, with `aria-pressed="true"`;
- `#panel`, with `data-state="open"`;
- `#email`, value `a@b.c`;
- `#pw`, a password input with value `hunter2`;
- `<dialog id="dlg" open>`;
- a "Reloaded" marker, rendered only when the navigation type is `reload`.

**Harness.** Copied from `tests/browser-editing-actions.test.mjs`: Chrome discovery, `cdp()` (now with a 10 s call timeout), `evaluate()`, the 30 s cold start, profile cleanup, and the Node 20 `ws` fallback.

- **Deps:**
  - `tabsGet` reads `location.href`, `document.title` and `document.readyState`. Mid-navigation it returns a loading tab with the last known URL, as `chrome.tabs.get` does.
  - `executeProbe` evaluates `(${func})(${JSON.stringify(probeSpec)})` with `Runtime.evaluate`. It reports the main frame's `loaderId` as `documentId`, read before and after the evaluation; a probe that straddles a navigation returns `ok: false`.
- **Time:** real.
- **Header:** the header comment says probes run in the MAIN world over CDP and that ISOLATED-world behaviour is V5.

**Cases**, all green locally:

- **Delayed text:**
  - `text_visible` "Saved", armed with `__armDelayed(600)` immediately before evaluating, is `verified` with 500 ≤ `waited_ms` < 2,000 (about 610 measured).
  - `text_gone` "Loading", re-armed, is `verified` with `waited_ms` ≥ 500 (about 810, from the two-probe rule).
- **Absent text:** `text_visible` "Nope" with a 300 ms timeout is `unmet`.
- **Selector state:**
  - `#status` visible and `#missing` gone are `verified`.
  - `#agree` unchecked (native), `#bold` checked (`aria-pressed`) and `#panel` checked (`data-state`) are `verified`.
- **Value checks:**
  - `#email` = `a@b.c` is `verified` with observed `a@b.c`.
  - `#pw` = `hunter2` is `verified` with `[redacted]` on both sides, and `hunter2` never appears.
  - `#email` = `wrong` with a 0 timeout is `unmet` with observed `[redacted]`, and `a@b.c` never appears in `expect_result`.
- **Dialog:** `dialog_open: true` is `verified`.
- **Ref selector:** `e12` is `uncertain` with reason `ref_unavailable`.
- **Refresh:**
  - Before the reload, "Reloaded" is `unmet`.
  - The test subscribes to `Page.frameNavigated` (main frame) and then calls `Page.reload`. With commit gating, the result is `verified`.
  - The probed `documentId` differs from the pre-reload `loaderId` and equals the committed one.

**Skip paths.** The suite exits 0 and reports all 10 cases as skipped, printing the reason once, when:

- `FSB_SKIP_BROWSER_TESTS=1` is set;
- `FSB_CHROME_BIN=/usr/bin/false` (an early exit, code 1);
- `FSB_CHROME_BIN=/etc/hosts` (a spawn error, `EACCES`).

## Verification

**Task 1:**

- `npm --prefix mcp run build && node tests/expect-parity.test.js` passes 82 checks.
- `npm run test:mcp-smoke:tools` passes 307 checks.
- `node tests/delegation-phase-contract.test.js` exits 0.
- The grep checks print 1 for each declaration and 1 for the registry entry.
- **Sanity check (not committed):** setting the extension's `EXPECT_DEFAULT_TIMEOUT_MS` to 2,001 makes the parity test exit 1, failing on the default, the D-20 values and the clamp rows. After the revert, `git diff --quiet extension/utils/action-verification.js` exits 0.

**Task 2:**

- Both commands exit 0.
- With the TAP reporter it prints `# skipped 0` and `# pass 12`.
- `npx --offline -y node@20 --test …` exits 0 (12 of 12), as does the official Node 20.20.2 binary.
- The forbidden-token grep (`listen(`, `createServer`, 7225, 7226, `globalThis.WebSocket`) prints 0.
- The registry grep prints 1.

**Task 3:**

- Both commands exit 0.
- With TAP it prints `# skipped 0` and `# pass 10`.
- The `extension/content` grep prints 0, the `__armDelayed` grep prints 5, and the 7225/7226 grep prints 0.
- `npx --offline -y node@20` exits 0 (10 of 10).
- The registry grep prints 1.
- Five back-to-back runs passed 10/10 each, leaving no temp profiles and no stray Chrome processes.

**Mutation checks (TDD: the suites existed after the features, so each was shown to fail on a broken mirror).** Every mutation was reverted with a byte-compare against the backup.

| Mutation | Suite | Failed case(s) |
| --- | --- | --- |
| The verified Next action line invites a retry (`mcp/build/errors.js`) | caller | scenario 3 |
| The `basePayload.expect` sidecar is dropped (`mcp/build/tools/manual.js`) | caller | 8 cases |
| The loop leaks the raw value on an unmet value check (`action-verification.js`) | caller | 4c |
| `aria-pressed` is removed from the probe's toggle signals | browser | the toggle case |

**Registration:** each command appears exactly once at the end of `package.json` `scripts.test` (318 commands) and of `REFINEMENT_ROOT_TEST_COMMANDS`, each in its own task's commit. No `PRE_PHASE6x` hash was edited.

**Full chain:** run with the tolerant runner on Node v24.14.1, in the background to completion.

- All 334 commands ran (16 pretest and 318 test). One failed: `node tests/mcp-install-platforms.test.js`, with its 2 known environmental cases ("expected daemon_offline, got ok" and `EADDRINUSE`), because the user's native-host daemon holds 7225/7226. That is the same single failure as at baseline.
- The three new suites passed inside the chain: T316 parity in 97 ms, T317 caller in 283 ms, and T318 browser in 9.8 s with 10 passed and 0 skipped.
- The rewritten `llms.txt`, `llms-full.txt` and `sitemap.xml` were restored with `git checkout --` before the SUMMARY commit.
- `git status --short showcase/angular/public` was empty before every task commit.

## Task Commits

1. **Task 1: expect contract parity test and the smoke-test sidecar guard:** `1e19160e` (test)
2. **Task 2: SC4 layer 1, an in-process MCP caller that acts and reads the effect in one call:** `cc541cec` (test)
3. **Task 3: SC4 layer 2, headless Chrome fixture checks for the real-DOM probe:** `db180cd9` (test)

**Plan metadata:** see the docs commit that adds this SUMMARY.

## Files Created/Modified

- `tests/expect-parity.test.js`: the parity and guard-window suite (chained).
- `tests/mcp-expect-caller.test.mjs`: SC4 layer 1 (chained, never skips).
- `tests/expect-outcome-browser.test.mjs`: SC4 layer 2 (chained, skips only on a missing or unlaunchable Chrome, or on opt-out).
- `tests/fixtures/expect-outcome.html`: the layer-2 fixture page.
- `tests/mcp-tool-smoke.test.js`: `EXPECT_SIDECAR_FIELDS` and its per-payload assertion.
- `package.json`, `tests/delegation-phase-contract.test.js`: three registrations, one per task commit.
- **Untouched:** no product source changed. `mcp/src`, `extension/` and the six force-tracked `mcp/build` files are identical to `d98afb08`.

## Deviations from Plan

### Auto-fixed Issues

None. The plan was executed as written. The design choices below were left open by the plan and are recorded here.

### Design choices the plan left open (recorded, not rule-driven)

- **Fixture over `file://`.** The plan's interface note describes the analog's `openFixture` as using a loopback HTTP server. In fact the analog opens fixtures over `file://`, and so does this suite. The suite therefore binds no port of its own (Chrome's `--remote-debugging-port=0` is Chrome's own ephemeral port).
- **Extra checks.** The parity test has 9 agreeing validator rows beyond the plan's 13, the six-spec byte comparison of the two fallback builders, a met-sensitive evaluator case, a `buildChangeReport` marker check and a check that `RECORDING_SIDECAR_FIELDS` never holds `'expect'`. The caller test adds three cases beyond the plan's eight: `back` without `expect` (8b), the malformed-`expect` rejection (9), and a split of scenario 4 into 4a, 4b and 4c.
- **Refresh pre-check.** The refresh case first proves "Reloaded" is `unmet` on the first load, so a `verified` after the reload cannot come from the old document.
- **Probe straddling a navigation.** `executeProbe` compares the main-frame `loaderId` before and after the evaluation and reports `ok: false` when it changed, so `documentId` always names the document that was actually read.

## Issues Encountered

None.

## Deferred to Validation Block

- **V5 (live SC4):** a real MCP host (Claude Code) performs an action with `expect` and reads its effect in one call, with no follow-up verification call. The record is a transcript with one `tools/call` returning `expect_result` `verified`. Also V5: ISOLATED-world probe behaviour on the real extension (Profile 2 or 5), since layer 2 runs in the MAIN world over CDP.
- **V4 (turn reduction):** the turn reduction from `expect` on the comparative corpus, together with calibrating the uncalibrated timing constants (default, cap, poll, headroom and the 750 ms probe race).
- **V6 (CI):** the three new suites must pass on CI's Node 20, and the layer-2 suite must actually run, not skip, on ubuntu-latest Chrome (RESEARCH A4). Because the suite skips rather than fails when Chrome cannot launch, a green CI job does not show that it ran. V6 must read the CI log for the 10 pass lines and for any printed "skipping every case" reason. Locally, layer 2 passed rather than skipped on Node 24.14.1 and Node 20.20.2.

## Known Stubs

None.

## Next Phase Readiness

- 69-08 can rely on SC4 being proven automatically: layer 1 never skips, and layer 2 runs wherever Chrome launches.
- Any later edit that moves an `expect` mirror, a strip list, the redaction marker or the `_handleExecuteAction` guard window now fails `npm test` with both sides printed.

## Self-Check: PASSED

- Files: `tests/expect-parity.test.js`, `tests/mcp-expect-caller.test.mjs`, `tests/expect-outcome-browser.test.mjs`, `tests/fixtures/expect-outcome.html`, `tests/mcp-tool-smoke.test.js`, `package.json`, `tests/delegation-phase-contract.test.js` and this SUMMARY all exist.
- Commits `1e19160e`, `cc541cec` and `db180cd9` exist on `Jev`. None carries an attribution line.
- `git diff d98afb08 -- mcp/src extension` and the six force-tracked `mcp/build` files is empty.
