---
status: deferred
phase: 69-mcp-descriptions-and-same-call-checks
source: [69-VERIFICATION.md]
started: 2026-10-17T03:14:51Z
updated: 2026-10-17T03:14:51Z
deferred_to: milestone-end Validation Block (V1, V4, V5, V6)
verified_head: f2ddd231
baseline_pin: 8a058bdf
---

## Current Test

[deferred: every item runs in the v1.0.0 milestone-end Validation Block; see .planning/STATE.md -> Decisions]

These items come from the `human_verification` list in `69-VERIFICATION.md` (status `human_needed`, 12/12 must-haves verified for the automated portion, 0 failed). Automated evidence (the full tolerant chain at `f2ddd231`, 334/334; Node 20.20.2 runs; the 192-call pre/post wire diff against `f978e989`; Layer 2 in headless Chrome, 10 pass, 0 skipped) does not count as a result here. Only a human run in the Validation Block may change a `result` field.

## Tests

### 1. [V4] Exact token counts for the tool list
validation_block: V4
expected: Run Anthropic `count_tokens` with `tools=` on the frozen `tests/fixtures/mcp-tools-list-8a058bdf.json` list and on the current `tools/list`, on the pinned host models. Record the exact token ratio next to the ceil(chars/4) estimate (55.2% cut on description text, 30.4% on whole-list bytes), and report the PROJECT.md target "tool-list tokens cut by more than half" as met or not met on real tokens.
result: [pending]

### 2. [V4] Comparative MCP-arm runs and calibration of the expect constants
validation_block: V4
expected: MCP-arm runs at `8a058bdf` and at the Phase 69 build measure caller error rate, turns, wall time and verification calls per task. Shorter descriptions do not raise caller errors, and `expect` reduces follow-up verification calls. Adjust the uncalibrated constants from the real timing distributions: 2,000 ms default, 5,000 ms cap, 200 ms poll, 750 ms probe race, 1,500 ms `back` headroom, two-probe negatives, and how often slow pages now end as `still_loading` after the CR-01 fix.
result: [pending]

### 3. [V5] Human read-through of the 73 shortened descriptions
validation_block: V5
expected: Read every short text in `mcp/src/tools/descriptions.ts` against the long registry text. No argument or safety guidance is lost beyond what the 22-row must-keep table already proves by key phrase.
result: [pending]

### 4. [V5] Real-site expect verdicts on the unpacked build
validation_block: V5
expected: On the unpacked build (Profile 2 or 5), `expect_result` matches what is visible on the page for: SPA pushState during navigation, cross-origin navigation, slow pages, BF-cache `go_back`, pendingUrl/loading transitions, shadow DOM, iframes, native `alert()` and background tabs. The ISOLATED-world probe resolves FSB ref selectors as verified with FSB loaded and uncertain without it. The CR-01 (negative checks on a loading document) and WR-01 (outgoing-document history updates) fixes behave on real pages.
result: [pending]

### 5. [V5] Live SC4 in Claude Code and live version skew
validation_block: V5
expected: In Claude Code against the real extension, one `tools/call` with `expect` returns `expect_result` `verified` with no `read_page`/`get_text` follow-up. Paired with the Web Store build (`badgafnf...`, Default profile), the same call yields `expect_result` `uncertain` / `extension_unsupported`.
result: [pending]

### 6. [V1, cross-check only] Bench identity digest at 8a058bdf
validation_block: V1
expected: The V1 live bench identity record's `toolsList.sha256` equals the fixture digest `8321cc72...8c4a05` (the same value as `BASELINE_8A058BDF_TOOLS_DIGEST`).
result: [pending]

### 7. [V6] Release
validation_block: V6
expected: MCP minor version bump and npm publish (REL-02); the Phase 71 release compatibility check passes; the extension is published before the MCP package. `expect` and tool-count docs are updated (`mcp/README.md`, `skills/fsb/`, showcase). The 10 new suites are green on CI Node 20 after the push, and the CI log shows Layer 2 (`expect-outcome-browser`) actually running on ubuntu-latest with 10 pass lines, not skipping. Merge to `main` only after V4's gate and the owner's approval.
result: [pending]

### 8. [V5] Owner decision: WR-04, an already-true predicate reports verified
validation_block: V5
expected: The evaluator takes no pre-action baseline, so a predicate that already held before the action is `verified`, and on the unknown-outcome (`mayHaveExecuted`) path `mapFSBError` then says "Do not repeat the action" (`mcp/src/errors.ts:487-488`, `extension/utils/action-verification.js:1489-1491`). Either accept this as the documented D-19/D-21 limitation (RESEARCH Pitfall 5; before-state checks deferred), or order a pre-action baseline probe or softer Next-action text. Any fix must respect locked D-21, the pinned 160-char `expect` description and the 600-byte `expect` schema cap.
result: [pending]

### 9. [V5] Owner decision: WR-05, the D-25 sensitive-field term list
validation_block: V5
expected: The D-25 predicate covers password, pwd, otp, cvv, cvc, card number and security code, but not token, secret, api key, credential, private key, passphrase or `pass`; plain-text inputs with those names still echo raw values through `change_report.inputs_changed` and `value` `attrs_changed` records. Either keep the D-25 list, or widen it with all four predicate copies, the redaction test pin, a "non-sensitive ids keep today's bytes" case (for example `tokenizer-demo`) and VALIDATION MCP-04-g changed in step (pair with review IN-01's behavioural parity test).
result: [pending]

### 10. [V5] Owner acknowledgement: CR-02 storage-only URL sanitization
validation_block: V5
expected: The session recorder now runs http(s) URL strings under `observed`/`expected`/`before`/`after` keys through `_sanitizeUrlForPersistence` (`extension/utils/mcp-session-recorder.js:301-310, 460`), so stored `change_report.url.before/after` of pre-existing tools lose sensitive query parameters. The live MCP wire is unchanged. Either record this storage-only hardening next to the D-25 exception in `69-VALIDATION.md` MCP-04-g, or reject it.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

[none yet; verification found no failed truths. Non-blocking follow-ups from the review, skipped in 69-REVIEW-FIX.md: IN-01 (behavioural parity test for the four hand-copied sensitive-field predicates; do it with any WR-05 change), IN-02 (the `value` check is an equality oracle on sensitive fields; document in the D-19 notes or report `uncertain`), IN-04 (the `expect` description does not state the matching rules; blocked by the 160-char and 600-byte pins). Info: the `mcp/src/tools/agents.ts:17-25` header comment still says `back` returns `change_report`.]
