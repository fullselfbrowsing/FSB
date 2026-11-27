---
phase: 69-mcp-descriptions-and-same-call-checks
reviewed: 2026-10-17T02:36:22Z
depth: standard
diff_base: f978e989ce00bd6fccabb762368463e5fa5ebccc
files_reviewed: 38
files_reviewed_list:
  - extension/utils/action-verification.js
  - extension/utils/mcp-lattice-journal.js
  - extension/utils/mcp-session-recorder.js
  - extension/ws/mcp-bridge-client.js
  - extension/ws/mcp-tool-dispatcher.js
  - mcp/src/errors.ts
  - mcp/src/tools/agents.ts
  - mcp/src/tools/autopilot.ts
  - mcp/src/tools/capabilities.ts
  - mcp/src/tools/descriptions.ts
  - mcp/src/tools/manual.ts
  - mcp/src/tools/observability.ts
  - mcp/src/tools/read-only.ts
  - mcp/src/tools/schema-bridge.ts
  - mcp/src/tools/screenshots.ts
  - mcp/src/tools/settings.ts
  - mcp/src/tools/triggers.ts
  - mcp/src/tools/vault.ts
  - mcp/src/tools/visual-session.ts
  - package.json
  - scripts/mcp/lib/tools-list.mjs
  - scripts/mcp/tools-list-baseline.mjs
  - tests/change-report-redaction.test.js
  - tests/delegation-phase-contract.test.js
  - tests/expect-dispatcher.test.js
  - tests/expect-evaluator.test.js
  - tests/expect-outcome-browser.test.mjs
  - tests/expect-parity.test.js
  - tests/fixtures/expect-outcome.html
  - tests/fixtures/mcp-tools-list-8a058bdf.json
  - tests/helpers/mcp-in-process.mjs
  - tests/mcp-description-budget.test.js
  - tests/mcp-expect-caller.test.mjs
  - tests/mcp-expect-wire.test.js
  - tests/mcp-settings-tool-contract.test.js
  - tests/mcp-tool-smoke.test.js
  - tests/mcp-tools-list-baseline.test.js
  - tests/mcp-tools-list-shape-freeze.test.js
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 69: Code Review Report

**Reviewed:** 2026-10-17T02:36:22Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 69 diff (`f978e989..HEAD`, excluding `.planning` and `showcase/angular/public`). It covers the MCP description module and its registration sites, the `expect` wire (zod shape, sidecar, version-skew fill, unknown-outcome trailer), the extension evaluator (`action-verification.js`), the dispatcher gate refactor, the `mcp:go-back` route, the commit watcher, and the D-25 change-report redaction. Test files were checked only for reliability problems.

The wire contract, sidecar stripping, D-25 redaction plumbing, test wiring and SW global-name hygiene are sound. I found no duplicate top-level declarations across the SW scripts, all 28 registry `expect` tools round-trip from wire verb to tool name, and the new commands are in `npm test` after the MCP build and in `REFINEMENT_ROOT_TEST_COMMANDS` exactly once. The five fast new suites pass locally.

The main problems are in the evaluator's verdicts and in where its output ends up:

- **CR-01:** a still-loading document makes negative checks report a false `verified`. In the unknown-outcome path, that verdict is turned into "Do not repeat the action".
- **CR-02:** the `url_includes` check echoes the raw tab URL. The session recorder then stores it without the URL sanitizer it already applies to `url` and `resultingUrl`. For the navigation tools, this is a new way for OAuth codes and magic-link tokens to reach storage.

Each finding below was confirmed by reading the code. CR-01, CR-02, WR-02, WR-03 and WR-05 were also reproduced with small scripts against the real modules or the in-process MCP build.

## Critical Issues

### CR-01: Negative predicates are falsely `verified` while the committed document is still loading

**File:** `extension/utils/action-verification.js:1328-1334, 1489-1491, 1501-1506`; `extension/ws/mcp-tool-dispatcher.js:4932`

**Issue:** The probe runs with `injectImmediately: true` (dispatcher:4932). For navigation tools, evaluation starts at commit (`navigate` returns as soon as the commit fires). For clicks that navigate, there is no commit gating at all. Right after a commit, the new document's body is empty or only partly parsed. As a result, these checks hold on the empty document:

- `text_gone`
- `state: 'gone'`
- `dialog_open: false`

The "two consecutive probes" rule for negative checks only adds about 200 ms (`EXPECT_POLL_INTERVAL_MS`). The loop then exits early with `verified`. The only loading guard (lines 1501-1506) runs at the deadline and converts only `unmet` checks to `still_loading`. A `met` negative check on a loading tab is never downgraded.

Reproduced with fake probes: the tab status was `loading` and the body was `''` for two probes, then `'Error banner'`. `{text_gone:'Error'}` and `{selector:'#err', state:'gone'}` both returned `status:'verified'` after `waited_ms:200`.

This breaks SC2 ("verified" must mean the effect was observed). On the `mayHaveExecuted` path, `mcp/src/errors.ts:487-488` then tells the caller "The expected effect was observed (expect_result verified). Do not repeat the action." That can stop a required retry.

**Fix:** Do not let a negative check settle while the tab or document is still loading, and apply the final downgrade to `met` negative checks too:

```js
// in the loop, before the early-exit test
const loading = tab.status === 'loading';
const settled = states.every((st, i) => st.status === 'met'
  && (!_fsbExpectIsNegative(checks[i]) || (st.streak >= 2 && !loading)));
...
// after the loop
if (lastTab && lastTab.status === 'loading') {
  for (let i = 0; i < states.length; i++) {
    const neg = _fsbExpectIsNegative(checks[i]);
    if (states[i].status === 'unmet' && lastTab.pendingUrl) setUncertain(i, 'still_loading');
    else if (neg && states[i].status === 'met') setUncertain(i, 'still_loading');
  }
}
```

Optionally, have `_fsbExpectProbeInPage` return `doc.readyState`, and don't count negative observations while it is `'loading'`. Add evaluator tests covering a negative predicate on a loading tab with an empty body.

### CR-02: The `url_includes` observed value stores raw tab URLs (OAuth codes, magic-link tokens) in session recordings

**File:** `extension/utils/action-verification.js:1440`; persisted through `extension/utils/mcp-session-recorder.js:900` (`cloneResultForReplay`)

**Issue:** `setResult(i, tab.url.indexOf(c.expected) !== -1, tab.url)` makes the full tab URL the check's `observed` value. It is capped at 120 characters, which keeps most query strings intact. The recorder already removes sensitive query parameters and fragments, such as `code`, `auth`, `key`, `session`, `jwt`, `x-amz-*` and token-shaped segments, but it does so only under URL-like keys (`_keyLooksUrlLike`: `url`, `*Url`, `href`, ...).

`expect_result.checks[].observed` is not URL-like, so the raw value is persisted. Reproduced with `cloneResultForReplay`:

- `url: 'https://app.test/cb?code=SECRETCODE123&state=s'` was stored as `https://app.test/cb?state=s`;
- the same URL in `expect_result.checks[0].observed` was stored unchanged, `code=SECRETCODE123` included.

For `navigate`, `go_back`, `go_forward` and `refresh`, no `change_report` is produced (they are on the gate-skip list), and their `url` and `resultingUrl` fields are sanitized. So this phase adds a new raw-URL path into storage. `change_report.url.before/after` has the same gap, but only for non-navigation tools; that gap predates this phase. This milestone treats credentials reaching storage as high severity.

**Fix:** Don't echo raw URLs. The simplest option is to report the URL with its query and fragment removed:

```js
function _fsbExpectSafeUrl(url) {
  try { const u = new URL(url); u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.toString(); }
  catch (_) { return null; }
}
...
else setResult(i, tab.url.indexOf(c.expected) !== -1, _fsbExpectSafeUrl(tab.url));
```

Matching still runs on the full URL, so only the echo changes. As a second layer, have the recorder's `_redactSensitiveValuesInPlace` sanitize any string value that parses as an http(s) URL under `observed`, `before` and `after`. That also closes the older `change_report.url` gap. Add a redaction test that pins this behavior.

## Warnings

### WR-01: The commit watcher treats same-document events from the outgoing document as "the commit"

**File:** `extension/ws/mcp-tool-dispatcher.js:5035-5049`

**Issue:** `record()` sets `committed = true` for any main-frame `onHistoryStateUpdated` or `onReferenceFragmentUpdated` on the bound tab, and stores that event's `documentId` as `committedDoc`. The outgoing document stays alive, and keeps running scripts, until the new document commits. So any `pushState`, `replaceState` or hash update it makes during the network phase of `navigate`, `refresh`, `go_back` or `go_forward` counts as "the commit". Many SPAs, including maps, feeds and analytics URL scrubbing, do this.

The probe then reads the old document, its `documentId` matches `committedDoc`, and positive checks that already hold there exit early with `verified`. This happens before the real navigation commits, which defeats D-17 and RESEARCH Pitfall 1. For `refresh`, a same-document event can never be the reload's own result.

**Fix:** Accept same-document events only when no cross-document navigation is pending (`tab.pendingUrl` unset), and ignore them for `refresh`. Alternatively, once a same-document event is seen, require the `onCommitted` that follows whenever `chrome.tabs.get` still reports a `pendingUrl`. Pass the tool name into `_watchMainFrameCommit`, so that only `navigate` to a fragment-only URL and `back`/`go_back` with `fragment_only` or history-state results accept same-document events.

### WR-02: `expect.timeout_ms: null`, `true` or a whitespace string is silently coerced to 0 or 1 ms

**File:** `mcp/src/tools/manual.ts:112-115`

**Issue:** `z.preprocess((v) => (v === '' ? NaN : v), z.coerce.number().int().finite())` converts the value with `Number()`. Measured against the in-process build:

- `{text_visible:'x', timeout_ms:null}` was sent as `timeout_ms:0`;
- `true` was sent as `1`;
- `'   '` was sent as `0`.

A host that sends `null` for an unset optional field, which D-14 already treats as "omitted" at the top level, gets a single immediate check instead of the 2,000 ms default. Most actions then report spurious `unmet` or `uncertain` results.

**Fix:** Treat `null` as omitted and reject non-numeric inputs before coercion, keeping the coerced form the A11 guard requires:

```ts
timeout_ms: z.preprocess(
  (v) => (v === null ? undefined
    : (v === '' || typeof v === 'boolean' || (typeof v === 'string' && v.trim() === '')) ? NaN : v),
  z.coerce.number().int().finite().optional(),
).optional(),
```

Re-run the shape freeze, because the published inner schema must not change. Mirror the `null` rule in `normalizeExpectSpec`, which currently fails the whole spec on `timeout_ms:null`.

### WR-03: Whitespace-only text predicates are vacuously `verified`

**File:** `extension/utils/action-verification.js:1223, 1444`; `mcp/src/tools/manual.ts:121-130`

**Issue:** Validation rejects only `''`. Normalization collapses whitespace and trims, so `'   '` becomes `''`, and `indexOf('') === 0` is always true:

- `text_visible:'   '` and `title_includes:'  '` are always `met`;
- `text_gone:'  '` is never `met`.

Reproduced: `{text_visible:'   '}` returned `verified`. This defeats the "empty `{}` is rejected rather than silently verified" rule (D-13).

**Fix:** In the MCP `superRefine` and in `normalizeExpectSpec`, reject string predicates whose trimmed value is empty. `value` is the exception, because `''` is a valid check after `clear_input`:

```ts
if (key !== 'value' && value.trim().length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must not be blank` });
```

### WR-04: `verified` does not show that the action caused the effect, yet the unknown-outcome text says "Do not repeat the action"

**File:** `mcp/src/errors.ts:487-488`; `extension/utils/action-verification.js:1489-1491`

**Issue:** The evaluator takes no pre-action baseline. Any predicate that was already true before the action is `met` on the first probe; positive predicates need only one probe. Examples: a `text_visible` banner that is always on the page, `url_includes` on the current path, or a `selector` that is already visible.

For clicks that start a navigation, there is no commit gating, so the first probe usually reads the old document. On the `mayHaveExecuted` path, `mapFSBError` then states "The expected effect was observed ... Do not repeat the action". The action may never have run. The `expect` description (`descriptions.ts:41-42`) does not warn callers to pick a predicate that differs from the current state.

**Fix:** At minimum, soften the line, for example: "expect_result is verified; if this state could have held before the action, confirm before repeating it." Add to `MCP_EXPECT_DESCRIPTION` that the check should describe a change. A stronger fix is one probe before `execute()` when `expect` is present, with the result marked `already_true` or kept from being `verified` on the unknown-outcome path when every check already held beforehand. Note that the description text is byte-pinned by the budget and must-keep tests.

### WR-05: The D-25 predicate misses common secret field names that the repo already treats as sensitive

**File:** `extension/utils/action-verification.js:724`; `extension/ws/mcp-tool-dispatcher.js:4491, 4641`

**Issue:** `EXPECT_SENSITIVE_NAME_SOURCE` covers password, pwd, otp, cvv, cvc, card number and security code. It does not cover token, secret, api key, credential, private key, passphrase or `pass`. Checked with `isRedactedField` on a visible `type=text` input: `apiKey`, `api_key`, `client_secret`, `access_token`, `secret`, `token`, `privateKey`, `passphrase` and `pass` are all `false`.

Their raw values therefore still reach the LLM through `change_report.inputs_changed` and `value` attribute records. Meanwhile, the session recorder's own `SENSITIVE_KEY_PATTERN` (`mcp-session-recorder.js:142`: `pass(word)?|secret|token|credential|api[-_ ]?key|...|private[-_ ]?key`) already masks those same `inputs_changed` keys in storage. Developer dashboards commonly use plain-text "API key" and "client secret" inputs. This is the leak D-25 set out to close, and it remains for these names.

**Fix:** This needs an owner decision, because D-25 lists the terms. Extend the name rule to cover at least `secret`, `token`, `api[-_ ]?key`, `credential`, `private[-_ ]?key` and `pass[-_ ]?phrase`, boundary-aware where a term is short. Keep all four copies, the redaction test pin, and a "non-sensitive ids keep today's bytes" case (for example `tokenizer-demo`) in step. Record the wider scope in 69-VALIDATION MCP-04-g.

### WR-06: The `back` description says it returns `change_report`, which it never does

**File:** `mcp/src/tools/descriptions.ts:117-119`

**Issue:** The `back` text ends with `MCP_CHANGE_REPORT_SENTENCE` ("Returns change_report (what changed)..."), and the comment says "it returns change_report". `handleBackRoute` (`mcp-tool-dispatcher.js:1808-2000`) builds `{success, status, resultingUrl, historyDepth, tabId, tool[, ownershipToken, expect_result]}`, and `dispatchMcpMessageRoute` never wraps it with `wrapWithChangeReport`. Callers are told to rely on a field that does not exist, so they skip the read they need. The old text made the same false claim, but this phase rewrote the text and added a comment asserting it.

**Fix:** Drop the sentence from `back`, and keep only the "inspect before retrying" guidance if the must-keep table needs it:

```ts
back: "Go back one step in browser history on the agent's tab (single step, no count). It does not steal focus, so it works on background tabs. Returns status ok, no_history, cross_origin, bf_cache or fragment_only, with resultingUrl and historyDepth; if the outcome is unknown, inspect the page before retrying.",
```

Then update the comment and any budget or must-keep pins in the same commit.

## Info

### IN-01: The sensitive-field predicate exists in four hand-copied versions

**File:** `extension/utils/action-verification.js:891-908, 1019-1043`; `extension/ws/mcp-tool-dispatcher.js:4492-4517, 4642-4667`

**Issue:** `tests/change-report-redaction.test.js:219-226` pins only the marker literal and the regex source. The type, autocomplete and camelCase-split rules in each copy can drift without a failure.

**Fix:** Add a behavioral parity test that runs all four predicates on the same table of element descriptors, using `Function.prototype.toString` and evaluation to extract the in-page copies.

### IN-02: The value check is an equality oracle on sensitive fields

**File:** `extension/utils/action-verification.js:1260-1270`

**Issue:** `observed` and `expected` are redacted, but `status` `met`/`unmet` still tells the caller whether a password, OTP or card field equals a guessed string. `execute_js` can already read `input.value` in the MAIN world, so this adds no new capability, but the D-19 wording ("never echoed") can read as stronger than it is.

**Fix:** Document this in the D-19 notes, or report `uncertain` (`value_unreadable`) for value checks on fields where `isSensitive` is true.

### IN-03: The recorder strips `expect` "because it may hold a secret", but `expect_result` stores the same value

**File:** `extension/utils/mcp-session-recorder.js:661-663`

**Issue:** `expect_result.checks[].expected` echoes the caller's `value` string whenever the field was seen as non-sensitive (`sawPlain && !sawRedact`), and the recorder persists the full response. The stated reason for deleting `clone.expect` is therefore not met. The value is no longer in the request, but it is still in the stored response.

**Fix:** Either correct the comment to "replay manifests never carry expect", or add `expected` and `observed` under `expect_result` to the recorder's sensitive-text handling when `sensitiveTarget` is true.

### IN-04: The `expect` description does not explain matching rules

**File:** `mcp/src/tools/descriptions.ts:41-42`; `extension/utils/action-verification.js:1440, 1444, 1223, 1265`

**Issue:** The rules differ by check, and none of them are described:

- `url_includes` is a case-sensitive raw substring match;
- `title_includes` and `text_*` ignore case and collapse whitespace;
- `value` requires exact equality;
- `selector` accepts CSS, FSB refs and FSB-only XPath or `>>>`.

The sub-properties have no descriptions (by design, D-13), so callers have to guess.

**Fix:** If the byte budget allows, add a short clause, for example "text and title match ignore case; url is a case-sensitive substring; value is exact", or align `url_includes` with the other substring checks.

---

_Reviewed: 2026-10-17T02:36:22Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
