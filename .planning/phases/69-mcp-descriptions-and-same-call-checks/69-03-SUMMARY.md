---
phase: 69-mcp-descriptions-and-same-call-checks
plan: 03
subsystem: extension
tags: [expect, evaluator, probe, redaction, change-report, mcp-04-exception, security]

# Dependency graph
requires:
  - phase: 69-mcp-descriptions-and-same-call-checks
    provides: "69-01: 69-SWEEP-BASELINE.json ($P69_START f978e989) for the regression sweeps"
provides:
  - "extension/utils/action-verification.js: the expect contract (EXPECT_* constants, clampExpectTimeoutMs, normalizeExpectSpec, aggregateExpectStatus, capObserved, isRedactedField, buildUncertainExpectResult), the self-contained read-only probe _fsbExpectProbeInPage and the bounded loop evaluateExpectation with injected deps"
  - "D-25 redaction: sensitive input values no longer reach change_report.inputs_changed or the 'value' entries of attrs_changed (page-side masking in both harvest functions, builder masking again)"
  - "tests/expect-evaluator.test.js (59 checks) and tests/change-report-redaction.test.js (15 checks), both chained"
affects: [69-05, 69-06, 69-07, 68, 70]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Browser access behind injected deps ({ tabsGet, executeProbe, now, sleep }), so the real loop runs under a fake clock in Node"
    - "Page functions stay self-contained: helpers declared inside the body, inputs from one serialisable argument, globalThis.window/document so tests can stub them"
    - "Defence in depth for secrets: the page masks, then the service-worker builder masks the same data again"

key-files:
  created:
    - tests/expect-evaluator.test.js
    - tests/change-report-redaction.test.js
  modified:
    - extension/utils/action-verification.js
    - extension/ws/mcp-tool-dispatcher.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "Repeated short probes (200 ms poll), at most one in flight, none after a probe timeout, no extra settle injection, two-probe rule only gates the early exit, overall reason = first uncertain check's reason"
  - "A value check's expected is echoed only after the probe has seen the field and found it non-sensitive; otherwise (sensitive, sensitive-looking selector, or never observed) expected is '[redacted]'. buildUncertainExpectResult always redacts value expected, matching the MCP-side version-skew fill"
  - "DOM-check observed values are re-derived by kind in the loop ('present'/'absent', whitelisted state words, booleans), so only tabs.get url/title strings and caller-supplied strings can appear in expect_result"
  - "text_visible with no match in a truncated scan is uncertain text_budget_exhausted, like text_gone (unmet only when observable)"
  - "normalizeExpectSpec rejects fractional, empty or non-numeric timeout_ms to mirror MCP's coerced .int().finite(); in-range clamping happens after validation"
  - "D-25 sensitive-name source uses the orchestrator amendment: t?otp and passwd, so totp/TOTPCode/passwd/Passwd match while footprint/hotpot/notpad do not"
  - "Show-password toggles: elements sensitive at harvest start are kept on the page-side handle (handle.sensitiveEls) and stay sensitive at stop"

patterns-established:
  - "69-05 wires evaluateExpectation with an ISOLATED-world executeProbe and a commit watcher; a raw expect object is also accepted and normalized first"
  - "69-07 parity tests can rely on EXPECT_REDACTED being the single marker in expect_result, inputs_changed and attrs_changed"

requirements-completed: [MCP-02, MCP-04]

# Metrics
duration: 23min
completed: 2026-10-15
---

# Phase 69 Plan 03: Same-call expect evaluator and change_report redaction Summary

**The extension now owns the full `expect` contract: a validated spec, a self-contained read-only page probe and a bounded polling loop that reports `verified`, `unmet` or `uncertain` without ever returning a page-read value. The same predicate and `[redacted]` marker now close the D-25 leak, so secrets no longer leave the page through `change_report.inputs_changed` or the `value` entries of `attrs_changed`. No importScripts, manifest, content-script or background.js change.**

## Performance

- **Duration:** about 23 min
- **Started:** 2026-10-15T13:23:42Z
- **Completed:** 2026-10-15T13:47Z
- **Tasks:** 3 of 3
- **Files modified:** 6 (2 created, 4 modified)

## Exported names (`extension/utils/action-verification.js`)

Existing exports are unchanged and keep their order. The new exports are:

- **Constants:** `EXPECT_TOOL_NAMES` (29, D-12 order), `EXPECT_NAV_TOOL_NAMES`, `EXPECT_SPEC_KEYS`, `EXPECT_PREDICATE_KEYS`, `EXPECT_STATES`, `EXPECT_DEFAULT_TIMEOUT_MS` (2000), `EXPECT_MAX_TIMEOUT_MS` (5000), `EXPECT_POLL_INTERVAL_MS` (200), `EXPECT_OBSERVED_MAX` (120), `EXPECT_STRING_MAX` (2000), `EXPECT_TEXT_SCAN_MAX_CHARS` (200000), `EXPECT_SHADOW_HOST_BUDGET` (2000), `EXPECT_REDACTED` ('[redacted]'), `EXPECT_SENSITIVE_NAME_SOURCE`, `EXPECT_RESULT_KEYS`, `EXPECT_CHECK_KEYS`, `EXPECT_CHECK_KINDS`, `EXPECT_STATUSES`, `EXPECT_CHECK_STATUSES` and `EXPECT_UNCERTAIN_REASONS` (18 reasons, including `extension_unsupported`). Every array is frozen. Every timing and size constant is commented "uncalibrated, pending V4".
- **Functions:** `clampExpectTimeoutMs`, `normalizeExpectSpec`, `aggregateExpectStatus`, `capObserved`, `isRedactedField`, `buildUncertainExpectResult`, `_fsbExpectProbeInPage` and `evaluateExpectation`.
- **Private helpers** (not exported; all named `_fsbExpect*` or `_fsbRedact*` so they stay unique in the service-worker global scope): `_fsbExpectSplitWords`, `_fsbExpectIsPlainObject`, `_fsbExpectSelectorLooksSensitive`, `_fsbExpectIsRestrictedUrl`, `_fsbExpectNormText`, `_fsbExpectIsNegative`, `_fsbExpectSanitizeObserved`, `_fsbExpectApplyValueRule`, `_fsbExpectBuildCheck`, `_fsbExpectRun`, `_fsbRedactChangeValue` and `_fsbRedactionListsTarget`. A grep of `extension/` found no clash.

`evaluateExpectation({ tabId, spec, deps, commit?, pageUnresponsive? })` never throws. It accepts a normalized spec (`{ timeoutMs, checks }`) and also a raw `expect` object, which it normalizes first. Missing deps give `evaluator_unavailable`, a non-finite tab id gives `no_tab`, an invalid raw spec gives `invalid_expect`, and any exception gives `evaluator_failed`.

## Planner decisions recorded as code comments

- **Polling:** repeated short probes, not one long-lived in-page poller. The interval is `EXPECT_POLL_INTERVAL_MS`.
- **One probe in flight:** at most one DOM probe runs at a time, and none runs after a probe timed out.
- **No extra settle:** evaluation starts right after the action's own settle and returns as soon as every check holds.
- **Two-probe rule:** negative predicates (`text_gone`, state `gone`/`unchecked`, `dialog_open: false`) need two consecutive holding probes before an early exit. The rule gates only the early exit; at the deadline the final probe decides, so `timeout_ms: 0` accepts one holding probe.
- **Commit gating:** with `commit.required`, nothing is judged until `isCommitted()`, and a probe whose `documentId` differs from `commit.documentId()` is ignored (`stale_document`).
- **Overall reason:** the first uncertain check's reason, present only when the status is `uncertain`.
- **Probe:** read-only and self-contained, with no timers, observers or animation-frame callbacks. The comment notes that `FSB.resolveRef` may touch FSB's own element cache in the ISOLATED world. `aria-expanded` is deliberately left out of the toggle signals, as D-13 does.
- **D-19 value rule:** `_fsbExpectApplyValueRule` runs on every value check, whatever the probe returned: `met` gives the caller's `expected`, `unmet` gives `[redacted]`, `uncertain` gives `null`. The comment names it as what delivers D-19's "vault-filled fields are never echoed". The probe applies the same rule in the page.

## The D-25 change (the one recorded MCP-04 exception)

- **Marker rule.** For a sensitive field, each side of an `inputs_changed` entry is `[redacted]` when non-empty and `''` when empty. Both sides of an `attrs_changed` entry for a `value` record on a sensitive input are `[redacted]` when non-empty, `''` when empty and `null` when absent. This is the same `EXPECT_REDACTED` marker as `expect_result`.
- **Boundary-aware name source.** `(?<![a-z])(?:t?otp|pwd|cvv|cvc|cc[-_ ]?num(?:ber)?)(?![a-z])|pass(?:wd|[-_ ]?(?:word|code))|card[-_ ]?num(?:ber)?|security[-_ ]?code|one[-_ ]?time[-_ ]?(?:code|pass)`, with the `i` flag after the camelCase word split. Per the orchestrator amendment it adds `t?otp` and `passwd`. It matches `otp-code`, `otpCode`, `OTPCode`, `totp`, `TOTPCode`, `userPwd`, `passwd`, `Passwd` and `card_number`, and leaves `footprint`, `hotpot`, `notpad`, `passport` and `account_number` alone. Run-together lowercase ids such as `otpcode` are a documented miss of the name rule only; the type and autocomplete rules still apply.
- **New optional state fields.** Both harvest `captureState` copies now add `redactedInputKeys` (always an array) to the before and after states. The stop adds `afterState.redactedInputsChanged`, the keys of sensitive inputs whose raw value changed, appeared or disappeared. The comparison runs on the page against `handle.sensitiveRaw`, which is deleted with the handle at stop or at the 120 s expiry.
- **Show-password toggles.** The start keeps the elements that were sensitive at harvest start on `handle.sensitiveEls`. The stop's `captureState` and its serialiser treat an input as sensitive if it was sensitive at start or is sensitive now. The builder already takes the union of both states' key lists.
- **Internal `valueRedacted` flag.** The stop serialiser masks the `oldValue` of a `value` attribute record on a sensitive input and adds `valueRedacted: true`. It calls the predicate only for `value` records, so the hung-page harness's 6,000 `class` records stay cheap. Every other record keeps exactly today's six keys. `buildChangeReport` masks flagged records, and records whose target id is a listed key, on both sides, and never copies the flag.
- **Byte stability.** States without the new fields, and records without the flag, take today's code path byte for byte. The six change-report suites and `hung-page-recovery` pass unmodified. No injection was added (one `world: 'MAIN'`, as at `$P69_START`), the injection args stay `[selector, token, deadline]`, and the two column-0 slice comments did not move.
- **Contract record.** `tests/change-report-redaction.test.js` carries the D-25 header and the check "MCP-04 security exception (CONTEXT D-25)". That check proves the redacted report and today's report differ only in the sensitive `inputs_changed` entry and the sensitive `attrs_changed` before/after.

## Sweep results

- **Task 2** (`--files extension/utils/action-verification.js`): 7 tests selected (the 6 measured plus the new `expect-evaluator`), 7 passed, no new failures, exit 0.
- **Task 3** (`--files extension/ws/mcp-tool-dispatcher.js extension/utils/action-verification.js`): 45 tests selected (41 measured before this plan, plus suites added since that mention these basenames, including the two new ones), 45 passed, no new failures, exit 0. Both sweeps ran on Node v24.14.1 with 7225 held.
- The baseline's pre-existing failures (`agent-manager-start-mode`, `back-tool`, `trigger-cap-settings-ui`) were not selected by either sweep and were not touched.
- `git status --short showcase/angular/public` was empty before every commit.
- **Full chain (extra check, tolerant runner, Node v24.14.1):** all 329 pretest and test commands ran. One failed: `node tests/mcp-install-platforms.test.js`, with its 2 known environmental cases (`EADDRINUSE`, and "expected daemon_offline, got ok"), because the user's native-host daemon holds 7225/7226. That is the same single failure as at baseline. The crawler files it rewrote were restored with `git checkout --`.

## Task Commits

1. **Task 1: Expect contract constants and pure helpers:** `3841d38b` (feat)
2. **Task 2: Self-contained page probe and the bounded evaluateExpectation loop:** `f8339ebd` (feat)
3. **Task 3: Redact sensitive input values in change_report inputs_changed and attrs_changed (D-25):** `32d072e5` (fix)

**Plan metadata:** see the docs commit that adds this SUMMARY.

## Files Created/Modified

- `extension/utils/action-verification.js`: the expect contract, probe and loop; D-25 masking in `buildChangeReport` (the attributes branch and the `inputs_changed` block only).
- `extension/ws/mcp-tool-dispatcher.js`: `_fsbHarvestStartInPage` and `_fsbHarvestStopInPage` only (inline predicate, in-page redaction, change detection and the serialiser mask).
- `tests/expect-evaluator.test.js`: 59 checks on the constants, pure helpers, the probe against stub DOMs and in a fresh vm, and the loop with a fake clock.
- `tests/change-report-redaction.test.js`: 15 checks on predicate parity, in-page capture, change detection, the show-password toggle, the serialiser, builder masking, byte stability, the MCP-04 record and an end-to-end `wrapWithChangeReport` run on the real page functions.
- `package.json` and `tests/delegation-phase-contract.test.js`: both suites appended once to `scripts.test` and to `REFINEMENT_ROOT_TEST_COMMANDS`, each in its own task's commit. No `PRE_PHASE6x` hash was edited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Value-check `expected` is redacted unless the field was seen and found non-sensitive**
- **Found during:** Task 2
- **Issue:** The plan redacts `expected` only for a sensitive field or a sensitive selector hint. When the probe cannot see the field (invalid selector, ref unavailable, injection failure), a password the caller typed would come back raw in `expect_result`. Responses are stored in the journal and recordings, while `expect` itself is stripped from them (69-05).
- **Fix:** `expected` is echoed only after a probe observed the field with `redact: false`. Otherwise it is `[redacted]`. `buildUncertainExpectResult` always redacts value `expected`, which matches MCP's planned `buildUnsupportedExpectResult`. Met plain fields still echo `expected` and `observed`, as the plan requires.
- **Files modified:** extension/utils/action-verification.js
- **Commit:** `f8339ebd` (and `3841d38b` for the builder)

**2. [Rule 2 - Security] DOM-check `observed` values are re-derived in the loop**
- **Found during:** Task 2
- **Issue:** The plan re-applies the value rule in the loop, but text, state and dialog checks would still trust the probe's `observed` string.
- **Fix:** `_fsbExpectSanitizeObserved` derives text and dialog `observed` from `holds`, and accepts only the five state words. Page text can no longer reach `expect_result` through a regressed probe.
- **Commit:** `f8339ebd`

**3. [Rule 1 - Bug] Test-side corrections while making Task 3 green**
- **Found during:** Task 3
- **Issue:** Two checks in the new redaction test were wrong. One deep-compared vm-realm objects, which fails on prototype identity. The other expected `after: null` for a `class` record, but the serialised target answers `class` with `''`, which is today's behaviour.
- **Fix:** The test compares vm results as plain JSON and expects `''`. The product code did not change.
- **Commit:** `32d072e5`

### Design choices the plan left open (recorded, not rule-driven)

- `text_visible` with no match in a truncated scan is `uncertain` (`text_budget_exhausted`), the same as `text_gone`.
- A value check whose element is absent is `uncertain` (`value_unreadable`).
- The toggle state uses the element's own signals first and its associated control only when the element has none. A native `checked` counts only on checkbox and radio inputs, or on non-input elements such as custom controls; a text input's `checked: false` is not a signal.
- `normalizeExpectSpec` rejects fractional, empty or non-numeric `timeout_ms`, mirroring MCP's `.int().finite()`. `clampExpectTimeoutMs` still truncates when it is called directly.
- `sensitiveHint` is set when a value selector names `type=password|hidden`, a credential autocomplete or a sensitive name.
- The restricted-URL list adds `chrome-untrusted:`, `chrome-search:`, `brave:`, `opera:`, `vivaldi:`, the old Chrome Web Store path and Edge Add-ons to the plan's list.
- The probe falls back to `document.querySelector` when `FSB.querySelectorWithShadow` returns a disconnected (stale cache) element. FSB-only syntax (XPath, `>>>`) has no native fallback.
- The probe fails closed (`redact: true`) if the sensitive-name pattern cannot compile.
- The loop stops early once DOM probing is impossible (`probe_timeout`, `page_unresponsive`) and every tab-level check already holds.

### TDD note

Each task's tests were written first and run red: 20 of 21 failing for Task 1, 37 of 59 for Task 2, and 12 of 15 for Task 3. They were not committed separately. The plan names one commit per task, and D-24 requires the chained suite to stay green from every commit, so each task landed as one commit with its tests.

---

**Total deviations:** 3 auto-fixed (2 Rule 2 security hardening, 1 test-side Rule 1). **Impact:** stricter redaction than specified. Every planned behaviour and acceptance command holds as written.

## Issues Encountered

None.

## Deferred to Validation Block

- **V4:** calibrate the uncalibrated constants from comparative-run data: default 2,000 ms, cap 5,000 ms, poll 200 ms, the 750 ms probe race (69-05), the 120-character observed cap, the 2,000-character string cap, the 200,000-character text scan, the 2,000 shadow-host budget and the two-probe rule.
- **V5:** sanity-check verdicts on real sites: SPA updates, slow pages, shadow DOM, iframes and background tabs; the live FSB ref path (`e12` through `window.FSB.resolveRef` in the ISOLATED world); and D-25 on real pages (React-controlled password inputs, CSRF hidden-token rotation and show-password toggles), so that no raw value appears in `change_report`.

## Known Stubs

None. `evaluateExpectation` is complete but not yet called by the dispatcher; plan 69-05 wires it (by design, not a stub).

## Next Phase Readiness

- 69-05 can resolve `normalizeExpectSpec`, `evaluateExpectation`, `buildUncertainExpectResult`, `_fsbExpectProbeInPage`, `EXPECT_TOOL_NAMES` and `EXPECT_NAV_TOOL_NAMES` as bare service-worker globals or through `require`.
- 69-06 and 69-07 can mirror `EXPECT_RESULT_KEYS`, `EXPECT_CHECK_KEYS`, `EXPECT_CHECK_KINDS`, `EXPECT_UNCERTAIN_REASONS` and `EXPECT_REDACTED`. For the validator-parity table: the extension accepts `value: ''`, rejects every other empty string, rejects a fractional `timeout_ms`, and rejects `timeout_ms: null`, which MCP's coerced form would read as 0.

## Self-Check: PASSED

- Files: `extension/utils/action-verification.js`, `extension/ws/mcp-tool-dispatcher.js`, `tests/expect-evaluator.test.js`, `tests/change-report-redaction.test.js` and this SUMMARY all exist.
- Commits `3841d38b`, `f8339ebd` and `32d072e5` exist on `Jev`. None carries AI attribution.
