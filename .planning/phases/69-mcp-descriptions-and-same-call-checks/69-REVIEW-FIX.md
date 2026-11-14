---
phase: 69-mcp-descriptions-and-same-call-checks
fixed_at: 2026-10-17T02:53:08Z
review_path: .planning/phases/69-mcp-descriptions-and-same-call-checks/69-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 7
skipped: 5
status: partial
---

# Phase 69: Code Review Fix Report

**Fixed at:** 2026-10-17T02:53:08Z
**Source review:** .planning/phases/69-mcp-descriptions-and-same-call-checks/69-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12. All 2 critical and 6 warning findings were in scope. The 4 info findings were in scope only where the fix was trivial and safe.
- Fixed: 7 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-06, IN-03)
- Skipped: 5. WR-04 and WR-05 need an owner decision. IN-01, IN-02 and IN-04 are not trivial, or would breach a pinned budget.

Each fix was first confirmed against the code. Each fix that changes behaviour has new tests, and I ran those tests against the pre-fix code to confirm they fail there:
- CR-01: 5 tests fail;
- WR-01: 8 checks fail;
- WR-02: 11 checks fail;
- CR-02: the HEAD recorder stored the raw `code=` value.

Verification:
- **Focused checks.** After every commit, 60 `npm test` commands passed. These are the ones that touch the dispatcher, evaluator, recorder, descriptions or the MCP build. The real-browser `expect-outcome-browser` suite passed 10 of 10.
- **Full chain.** At HEAD f2ddd231 the full `pretest` + `test` chain ran in tolerant mode (`/tmp/fix69-full.jsonl`): 334 of 334 commands exited 0. That includes `tests/mcp-install-platforms.test.js`, the only failure at baseline, which needs the 7225/7226 ports to be free. The rewritten `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` were restored and not committed.
- **Published schema.** `mcp/build` was rebuilt after each `mcp/src` edit. None of the six force-tracked build files changed. The `tools/list` shape freeze and the baseline are unchanged, so the published `expect` schema is byte-identical.

## Fixed Issues

### CR-01: Negative predicates are falsely `verified` while the committed document is still loading

**Files modified:** `extension/utils/action-verification.js`, `tests/expect-evaluator.test.js`
**Commit:** 3a9d7df1
**Status:** fixed: requires human verification (evaluator state logic)
**Applied fix:** The probe now returns `document.readyState`. In the loop, a probe is "unsettled" in either of these cases:
- the tab is loading with a `pendingUrl`;
- the probed document's `readyState` is `'loading'` (the tab's own `loading` status is used when `readyState` is unknown).

A negative check that holds on an unsettled probe does not count toward the two-probe streak. If its last holding probe was unsettled, it ends as `uncertain` / `still_loading` instead of `met`.

Positive checks are not gated. A parsed document (`interactive`) on a tab that is still fetching subresources still settles normally.

**Differs from the review:** The review suggested gating on `tab.status === 'loading'` alone. Pages with slow subresources keep that status for seconds, so that rule would have turned most negative checks on heavy pages into `uncertain`.

**Tests added:**
- the review's repro (two empty loading probes, then `Error banner`) for both `text_gone` and `state: 'gone'`;
- `readyState` gating;
- downgrade at the deadline and at `timeout_ms: 0`;
- a pending navigation on a `complete` outgoing document;
- a guard against over-downgrading.

### CR-02: The `url_includes` observed value stores raw tab URLs in session recordings

**Files modified:** `extension/utils/action-verification.js`, `extension/utils/mcp-session-recorder.js`, `tests/expect-evaluator.test.js`, `tests/mcp-session-recorder.test.js`
**Commit:** 276740ba
**Applied fix:** There are two layers.
1. **Evaluator.** The new `_fsbExpectSafeUrl` reports the URL without userinfo, query or fragment (`null` if it cannot be parsed). Matching still runs on the full URL.
2. **Recorder.** `_redactSensitiveValuesInPlace` now sends any string that starts with `http(s)://` under the keys `observed`, `expected`, `before` or `after` through the existing `_sanitizeUrlForPersistence`. That sanitizer keeps benign URLs byte-exact. This also closes the older `change_report.url.before/after` gap.

**Tests:** They pin the evaluator echo and the recorder clone of `expect_result` and `change_report.url`, and confirm that benign and non-URL values are unchanged.

**Caller-visible change:** `url_includes` observed no longer shows the query string.

### WR-01: The commit watcher treats same-document events from the outgoing document as "the commit"

**Files modified:** `extension/ws/mcp-tool-dispatcher.js`, `extension/utils/action-verification.js`, `tests/expect-dispatcher.test.js`
**Commit:** b962c320
**Status:** fixed: requires human verification (commit-gating state logic)
**Applied fix:** `_watchMainFrameCommit(tabId, toolName)` now records new-document commits and same-document events separately for each tab.
- **New-document commits.** An `onCommitted` always counts.
- **Same-document events.** These are fragment or history-state updates. One counts as the commit only when `isCommitted(tab)` sees no `tab.pendingUrl`, meaning no cross-document navigation is pending. For `refresh` they are ignored entirely.
- **Committed document.** A same-document event that arrives after a new-document commit can no longer replace the committed `documentId`.

The evaluator now passes the tab from that iteration into `commit.isCommitted(tab)`; callers that ignore the argument are unaffected. Both call sites pass the tool name (`expectCtx.toolName`, and `'back'` in the back route).

**Tests:** Watcher unit cases cover `go_back`, `refresh`, a fragment-only `navigate`, and buffering during bootstrap. Dispatcher-level cases cover `go_back` with a pending navigation and `refresh`, both now `no_commit` instead of `verified`.

### WR-02: `expect.timeout_ms: null`, `true` or a whitespace string is silently coerced to 0 or 1 ms

**Files modified:** `mcp/src/tools/manual.ts`, `extension/utils/action-verification.js`, `tests/expect-evaluator.test.js`, `tests/expect-parity.test.js`, `tests/mcp-expect-wire.test.js`
**Commit:** 2e6fbcfd
**Applied fix:**
- **MCP side.** A named preprocess maps `null` to omitted. Only numbers and non-blank strings reach `Number()`; booleans, arrays, objects and blank strings become NaN and are rejected. The inner schema keeps the `z.coerce.number().int().finite()` form, so the A11 guard and the shape freeze still pass.
- **Extension side.** `normalizeExpectSpec` mirrors the `null` rule.

**Tests:**
- New parity rows, which also close an undetected disagreement: MCP accepted `timeout_ms: []` as 0, while the extension rejected it.
- Wire cases: `null` now gives the 8,500 ms back timeout (it was 6,500 ms) and forwards no `timeout_ms`; `true`, `'   '` and `[]` are rejected before dispatch.

### WR-03: Whitespace-only text predicates are vacuously `verified`

**Files modified:** `mcp/src/tools/manual.ts`, `extension/utils/action-verification.js`, `tests/expect-evaluator.test.js`, `tests/expect-parity.test.js`, `tests/mcp-expect-wire.test.js`
**Commit:** e57b8ada
**Applied fix:** Both validators reject string predicates whose trimmed value is empty, with the message `<key> must not be blank`. This applies to `url_includes`, `title_includes`, `text_visible`, `text_gone` and `selector`. `value` keeps accepting `''` and blank strings, and padded text such as `' Order saved '` is still accepted.

**Tests:** Parity rows, evaluator cases and wire rejections.

### WR-06: The `back` description says it returns `change_report`, which it never does

**Files modified:** `mcp/src/tools/descriptions.ts`, `tests/mcp-description-budget.test.js`
**Commit:** 3cce1b70
**Applied fix:** I first confirmed that `handleBackRoute` and the `mcp:go-back` route never attach `change_report`. The description now uses the review's text: it drops `MCP_CHANGE_REPORT_SENTENCE` and keeps "if the outcome is unknown, inspect the page before retrying". The comment is corrected.

All must-keep patterns still match. The description budget improved slightly (55.2% cut, against a 50% floor). A new budget check asserts that `back` does not mention `change_report`.

### IN-03: The recorder strips `expect` "because it may hold a secret", but `expect_result` stores the same value

**Files modified:** `extension/utils/mcp-session-recorder.js`
**Commit:** f2ddd231
**Applied fix:** This is a comment-only fix, the review's option 1. The comment now explains why replay manifests never carry `expect`. It also notes that the stored response's `expect_result` can echo the caller's value only when the evaluator saw a plain field; sensitive or unobserved fields are already the redaction marker.

## Skipped Issues

### WR-04: `verified` does not show that the action caused the effect, yet the unknown-outcome text says "Do not repeat the action"

**File:** `mcp/src/errors.ts:487-488`; `extension/utils/action-verification.js:1489-1491`
**Reason:** Needs an owner decision. The finding is real, but each fix it proposes runs into a locked decision or a pinned budget.
- **Softening the line in `errors.ts`.** This contradicts locked decision D-21 (69-CONTEXT.md): "verified: it states that the expected effect was observed and the action must not be repeated". The current text is also pinned by `tests/mcp-expect-wire.test.js` and `tests/mcp-expect-caller.test.mjs`.
- **Telling callers to check for a change in `MCP_EXPECT_DESCRIPTION`.** The description is 151 of its pinned 160 characters, and the published `expect` schema is 554 of its 600-byte cap. The clause does not fit.
- **The stronger fix, a pre-action baseline probe.** This adds a new verdict or reason to the D-19 contract (`EXPECT_UNCERTAIN_REASONS`, plus MCP/extension parity).

CR-01 and WR-01 already remove the navigation-timing cases where `verified` came from the wrong document. One case remains: a predicate that already held before the action.

**Original issue:** The evaluator takes no pre-action baseline, so a predicate that was already true is `met` on the first probe. On the `mayHaveExecuted` path, `mapFSBError` then says "Do not repeat the action" even though the action may never have run.

### WR-05: The D-25 predicate misses common secret field names that the repo already treats as sensitive

**File:** `extension/utils/action-verification.js:724`; `extension/ws/mcp-tool-dispatcher.js:4491, 4641`
**Reason:** Needs an owner decision. The review itself says so, because D-25 is an owner-level security decision (69-CONTEXT.md) that lists the terms and is the one recorded exception to byte-stability. The claim is confirmed: `isRedactedField` returns `false` for `apiKey`, `api_key`, `client_secret`, `access_token`, `secret`, `token`, `privateKey`, `passphrase` and `pass` on a visible text input.

If the scope is widened, all four copies of the predicate, the redaction test pin, a "keeps today's bytes" case (such as `tokenizer-demo`) and 69-VALIDATION MCP-04-g must change together.

**Original issue:** Raw values of plain-text API-key, client-secret and token inputs still reach the LLM through `change_report.inputs_changed` and `value` attribute records. The session recorder already masks those names in storage.

### IN-01: The sensitive-field predicate exists in four hand-copied versions

**File:** `extension/utils/action-verification.js:891-908, 1019-1043`; `extension/ws/mcp-tool-dispatcher.js:4492-4517, 4642-4667`
**Reason:** Not trivial. The two dispatcher copies are nested inside the in-page harvest functions, so a behavioural parity test would have to slice the source and evaluate it. This belongs in a dedicated test task, best done together with any WR-05 change.
**Original issue:** Only the marker and the regex source are pinned; the type, autocomplete and camelCase rules can drift without a failure.

### IN-02: The value check is an equality oracle on sensitive fields

**File:** `extension/utils/action-verification.js:1260-1270`
**Reason:** Not trivial or safe to do automatically. Reporting `uncertain` (`value_unreadable`) for sensitive fields changes the D-19 value-check contract. The alternative, documenting it in the D-19 notes, means editing 69-CONTEXT.md, which is a planning artifact owned by the orchestrator. No new capability is exposed: `execute_js` can already read `input.value`.
**Original issue:** `met`/`unmet` reveals whether a sensitive field equals a guessed string, so D-19's "never echoed" can read as stronger than it is.

### IN-04: The `expect` description does not explain matching rules

**File:** `mcp/src/tools/descriptions.ts:41-42`
**Reason:** The pinned budgets do not allow it. `MCP_EXPECT_DESCRIPTION` is 151 of 160 characters and the `expect` schema is 554 of 600 bytes, so the suggested clause does not fit. Making `url_includes` match case-insensitively like the other checks would change behaviour on the D-18 contract, and the current case-sensitive match is pinned by `tests/expect-evaluator.test.js`.
**Original issue:** Callers have to guess the per-check matching rules (case, whitespace, exact value, selector syntax).

## Deferred to Validation Block

- **CR-01, WR-01 (V5):** On real sites (SPA routers that call `pushState` during navigation, slow pages, back/forward cache), check that negative checks settle once the page has parsed and that navigation tools wait for the real commit.
- **CR-01 (V4):** Calibrate how often slow pages now end as `still_loading` instead of `verified` for negative checks.

---

_Fixed: 2026-10-17T02:53:08Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
