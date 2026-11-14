---
phase: 69-mcp-descriptions-and-same-call-checks
verified: 2026-10-17T03:10:00Z
status: human_needed
score: 12/12 must-haves verified (automated portion; live, spend and human items deferred to the Validation Block)
overrides_applied: 0
human_verification:
  - test: "V4: run Anthropic count_tokens with tools= on the frozen 8a058bdf fixture and on the current tools/list, on the pinned host models"
    expected: "Exact token ratio recorded next to the ceil(chars/4) estimate (55.2% cut on description text, 30.4% on whole-list bytes); PROJECT.md 'tool-list tokens cut by more than half' reported met or not met on real tokens"
    why_human: "Needs an API key and per-model tokenizers; Phase 69 only reports estimates (D-05)"
  - test: "V4: comparative MCP-arm runs at 8a058bdf and at the Phase 69 build (caller error rate, turns, wall time, verification calls per task) and calibration of the uncalibrated expect constants (2,000 ms default, 5,000 ms cap, 200 ms poll, 750 ms probe race, 1,500 ms back headroom, two-probe negatives, still_loading frequency after CR-01)"
    expected: "Shorter descriptions do not raise caller errors; expect reduces follow-up verification calls; constants adjusted from real timing distributions"
    why_human: "Live comparative runs with spend"
  - test: "V5: human read-through of all 73 shortened descriptions against the long registry text"
    expected: "No lost argument or safety guidance beyond what the must-keep table proves by key phrase"
    why_human: "Clarity and safety wording need human judgement"
  - test: "V5: real-site expect verdicts on the unpacked build (Profile 2 or 5): SPA pushState during navigation, cross-origin navigation, slow pages, BF-cache go_back, pendingUrl/loading transitions, shadow DOM, iframes, native alert(), background tabs; ISOLATED-world probe and FSB ref resolution"
    expected: "expect_result matches what is visible on the page; ref selectors verified with FSB loaded and uncertain without it; CR-01 and WR-01 fixes behave on real pages"
    why_human: "Live browsing on a real profile; the Layer-2 harness probes in the MAIN world over CDP"
  - test: "V5: live SC4 in Claude Code against the real extension, and live version skew against the Web Store build (badgafnf...)"
    expected: "One tools/call returns expect_result verified with no read_page/get_text follow-up; the Web Store build yields expect_result uncertain / extension_unsupported"
    why_human: "Needs a real MCP host session and the published extension"
  - test: "V1: compare the V1 live bench identity toolsList.sha256 with the fixture digest 8321cc72...8c4a05"
    expected: "Digests match"
    why_human: "The live bench run belongs to V1 (cross-check only)"
  - test: "V6: MCP minor publish, Phase 71 release compatibility check, extension published before the MCP package, expect and tool-count docs (mcp/README.md, skills/fsb/, showcase), new suites on CI Node 20 with Layer 2 actually running (not skipping) on ubuntu-latest"
    expected: "CI log shows the 10 Layer-2 pass lines; release compatibility check passes"
    why_human: "Release, publish and push to a remote"
  - test: "OWNER DECISION (69-REVIEW WR-04): a predicate that already held before the action is reported verified, and on the unknown-outcome path mapFSBError then says 'Do not repeat the action'"
    expected: "Owner either accepts this as the documented D-19/D-21 limitation (RESEARCH Pitfall 5; before-state checks deferred) or orders a pre-action baseline probe / softer Next action text"
    why_human: "The fix conflicts with locked decision D-21, the pinned 160-char expect description and the 600-byte expect schema cap"
  - test: "OWNER DECISION (69-REVIEW WR-05): the D-25 sensitive-field predicate does not cover token, secret, api key, credential, private key, passphrase or pass, so plain-text inputs with those names still echo raw values through change_report.inputs_changed and value attrs_changed records"
    expected: "Owner either keeps the D-25 term list or widens it (all four predicate copies, the redaction test pin, a keep-today's-bytes case and VALIDATION MCP-04-g in step)"
    why_human: "D-25 is an owner-level security decision that fixes the term list"
  - test: "OWNER ACKNOWLEDGEMENT (69-REVIEW CR-02 fix): the session recorder now runs http(s) URL strings under observed/expected/before/after keys through _sanitizeUrlForPersistence, so stored change_report.url.before/after of pre-existing tools lose sensitive query parameters"
    expected: "Owner records this storage-only hardening next to the D-25 exception in 69-VALIDATION MCP-04-g, or rejects it"
    why_human: "It changes persisted recording bytes for pre-existing tools beyond the one recorded MCP-04 exception; the live MCP wire is unchanged"
---

# Phase 69: MCP Descriptions and Same-Call Checks Verification Report

**Phase Goal:** Cut MCP tool-list context and avoid follow-up verification calls through additive optional expectations.
**Verified:** 2026-10-17T03:10:00Z
**Status:** human_needed
**Re-verification:** No (initial verification; HEAD `f2ddd231`, after the 7 review-fix commits)

## Goal Achievement

The codebase delivers the goal. The current `tools/list` publishes shorter text for every tool. A repeatable, git-free gate measures the cut against a frozen copy of the `8a058bdf` baseline, and the generator still re-derives that copy byte for byte. The 29 D-12 tools accept an optional `expect`, evaluated in the same call by real extension code, and the call returns `verified`, `unmet` or `uncertain`. With `expect` omitted, a pre-phase build and the current build send identical bridge payloads and return identical responses. What remains are live, spend and human checks, already deferred to the Validation Block, plus three owner decisions raised by the code review.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1.** All existing tool descriptions (72 at `8a058bdf`, 73 with `settings`) are shortened. A repeatable token-count check shows the aggregate cut against the Phase 66 baseline, and action and safety guidance survive. | VERIFIED | My own comparison of the live list with `tests/fixtures/mcp-tools-list-8a058bdf.json`: 73 live tools, 72 baseline names all present, only `settings` extra, and **every one of the 72 descriptions strictly shorter** (none equal or longer). The longest live description is `execute_js` at 612 chars (cap 2,048). Budget gate (`tests/mcp-description-budget.test.js`, 56/0): description plus parameter-description chars 88,241 → 39,539 (-55.2%, floor 50%); canonical bytes 121,379 → 84,482 (-30.4%, floor 20%); ceil(chars/4) estimates printed. The must-keep table has 22 rows, all PASS. `node scripts/mcp/tools-list-baseline.mjs --check` re-built `8a058bdf` and matched the fixture byte for byte (sha256 `b0e67bb7…8274b8`). |
| 2 | **SC2.** Supported action tools accept an optional `expect` and report verified, unmet or uncertain effects in the same call, using a bounded post-action observation. | VERIFIED | `expect` is published on exactly 29 tools as one flat, closed object of 554 bytes or less. `wrapWithChangeReport` and `handleBackRoute` evaluate it after `execute()` through `_attachExpectResult` → `evaluateExpectation` (`extension/ws/mcp-tool-dispatcher.js:5099-5181`). I drove the real evaluator with fake deps and got: verified (met text), unmet (`observed: "absent"`), uncertain (`probe_failed`, `restricted_page`, `tab_closed`, `no_commit`, `still_loading`); `timeout_ms: 99999` clamped to 5000. Real headless Chrome (`expect-outcome-browser`): 10 pass, 0 skipped. |
| 3 | **SC3.** Contract tests prove that existing tool names, required arguments, default behavior and serialized wire shapes are unchanged when `expect` is omitted. | VERIFIED | Shape freeze 124/0. Wire goldens (`mcp-expect-wire`) 202/0. **Independent check:** I built `f978e989` (the phase start) in `/tmp`, then called 64 tools against that build and against HEAD with three canned results (success, unknown outcome, failure). That is 192 calls, 62 of the 64 tools reached the bridge, and payloads (minus the random `recordingCallId`), timeouts and response text were **0 diffs**. Required lists and property sets (minus `expect`) matched the fixture for all 72 tools. |
| 4 | **SC4.** A representative MCP caller completes an action and reads its effect without an extra verification call when the outcome is observable. | VERIFIED (in-process; live demo is V5) | `tests/mcp-expect-caller.test.mjs` (12/12, 0 skipped, Node 24 and Node 20): an SDK `Client` over `InMemoryTransport` drives `createRuntime()` from `mcp/build`. The fake bridge runs the real `evaluateExpectation` / `_fsbExpectProbeInPage`, and the test asserts the transcript is exactly `['tools/call']`. My spot check: `click` with `expect` returned `{success:true, expect_result:{status:"verified",…}}` in one call. |
| 5 | The shared registry is untouched, so with Jev off autopilot prompts are unchanged (D-07, SET-02). | VERIFIED | `git diff --quiet 8a058bdf -- extension/ai/tool-definitions.js mcp/ai/tool-definitions.cjs` passed. The four registry hash-pin suites pass unmodified (`tool-definitions-parity` 268/0, `capability-mcp-surface` 19/0, `capability-autopilot-parity` 26/0, `recipe-schema-lock` 3/0). |
| 6 | The baseline is frozen in a self-verifying fixture; no chained test reads git history (D-04). | VERIFIED | The fixture meta has the commit, SDK 1.29.0, zod 3.25.76, sha256 and digest `8321cc72…8c4a05`. `mcp-tools-list-baseline` 16/0. Tests import only `tests/helpers/mcp-in-process.mjs` (no git, no spawn). |
| 7 | A malformed `expect` is rejected before dispatch; a JSON-string `expect` is accepted; `null` is treated as omitted (D-14, D-16). | VERIFIED | My spot check: `expect: {}` and an unknown key give SDK validation errors with **0 bridge sends**; `'{"url_includes":"/done"}'` is forwarded as an object; for `expect: null` the payload has no `expect` key. |
| 8 | `expect` travels only as a top-level sidecar. It never enters `params` and is stripped from journal and recorder replay payloads (D-15). | VERIFIED | `basePayload.expect` is set only when defined (`manual.ts`). `'expect'` is in `INTERNAL_PAYLOAD_KEYS` (`mcp-lattice-journal.js:47`) and in the recorder strip list (`mcp-session-recorder.js:706`); `_sanitizeRequestPayload` deletes it. My spot check payloads show `params:{"selector":"#a"}` with `expect` as a sibling. |
| 9 | Extension wiring: ISOLATED probes; commit-gated navigation (`back` included); wire verbs resolved before the 29-tool check; `execute()` runs once; `expect_result` only on `success:true` or `mayHaveExecuted:true`; works in the SW with no `require`. | VERIFIED | `_injectProbe` uses `world:'ISOLATED'`, `injectImmediately:true` (one site). `_watchMainFrameCommit` is subscribed before `execute()` / `chrome.tabs.goBack`. `expect-dispatcher` 160/0 covers `type`/`keyPress`/`cdpClickAt`/`dragdrop`/`toggleCheckbox`, "execute() once" in every case, and a vm-context SW case resolving through bare identifiers. No duplicate top-level SW identifiers (each `EXPECT_*` binding is declared only in `action-verification.js`). |
| 10 | The unknown-outcome path carries `expect_result` with `isError` still true, and older extensions get an `extension_unsupported` fill (D-21, Finding 10). | VERIFIED | `errors.ts:477-505`. My spot check: `mayHaveExecuted` plus verified gives `isError:true`, the "Do not repeat the action" line and a trailer with `expect_result`. A success with no `expect_result` gets `uncertain`/`extension_unsupported`. A definitive failure has no `expect_result`. `mcp-recovery-messaging` 77/0 (pinned texts unchanged). |
| 11 | Sensitive input values in `change_report.inputs_changed` and `value` `attrs_changed` entries are redacted. This is the one recorded MCP-04 exception (D-25). | VERIFIED (scope per D-25; widening is an owner decision, WR-05) | `redactedInputKeys`, `redactedInputsChanged` and `valueRedacted` are wired in both page functions and in `buildChangeReport`. `change-report-redaction` 15/0, including "MCP-04 security exception (CONTEXT D-25)". `change-report-toggle` and `change-report-dispatcher` pass unmodified. |
| 12 | Footprint and test discipline: no registry, `importScripts`, manifest, content-script, prompt-table, `fsb://config`, bench-lock or force-tracked `mcp/build` change. New suites are registered in `npm test` and `REFINEMENT_ROOT_TEST_COMMANDS` and are green on Node 20. | VERIFIED | `git diff --name-only f978e989` lists 14 `mcp/src`, 5 `extension` and 2 `scripts` files, all in the D-01 allow-list plus recorded deviations. After my `npm --prefix mcp run build`, `git status` on `mcp/build` and `mcp/ai` is clean. `lattice-provider-bridge-smoke` 112/0 (pins 334/330). The 10 commands sit at `npm test` positions 308-317 and in `delegation-phase-contract.test.js:165-174` (1224/0). Official Node 20.20.2: all 10 new suites plus `mcp-session-recorder` exit 0, and Layer 2 passed 10 with 0 skipped. Full chain at HEAD: 334/334 exit 0. |

**Score:** 12/12 truths verified for the automated portion.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mcp/src/tools/descriptions.ts` | MCP-only text for all 73 tools plus common and per-tool parameter text | VERIFIED | 389 lines. Imported by manual, read-only, triggers, screenshots, agents, observability, vault, capabilities, autopilot, visual-session and settings. Coverage gate: 73/73 entries, no orphan keys. |
| `mcp/src/tools/schema-bridge.ts` | `jsonSchemaToZod(inputSchema, paramDescriptions?)` | VERIFIED | Only description text changes (the shape freeze is green). |
| `mcp/src/tools/manual.ts` | `EXPECT_*`, `parseExpectArg`, `EXPECT_SHAPE`, sidecar, `withUnsupportedExpectFill` | VERIFIED | Substantive and wired (handler lifts `expect` before validate, strip and transforms). |
| `mcp/src/tools/agents.ts` | `back` with `expect` and conditional timeout | VERIFIED | Spot check: 5,000 ms without `expect`; 11,500 ms with `timeout_ms: 9000` (5000 + clamp 5000 + 1500). |
| `mcp/src/errors.ts` | unknown-outcome branch carrying `expect_result` | VERIFIED | Byte-identical without `expect_result` (192-call pre/post check). |
| `extension/utils/action-verification.js` | contract constants, `normalizeExpectSpec`, probe, bounded loop, `evaluateExpectation`, D-25 predicate | VERIFIED | `evaluateExpectation` and `_fsbExpectRun` at 1410-1620; exported through the `module.exports` guard; loaded by `background.js:80`. |
| `extension/ws/mcp-tool-dispatcher.js` | `_injectProbe`, `_resolveExpectSpec`, `_watchMainFrameCommit`, `_attachExpectResult`, `_executeWithExpect`, gate refactor, back hook, D-25 harvest | VERIFIED | Without `expect` the path is still `return execute()` / today's harvest. |
| `extension/ws/mcp-bridge-client.js` | `expect: payload.expect` into both wrapper calls | VERIFIED | Lines 2088 and 2233. |
| `extension/utils/mcp-lattice-journal.js`, `mcp-session-recorder.js` | `'expect'` in both strip lists | VERIFIED | — |
| `scripts/mcp/lib/tools-list.mjs`, `scripts/mcp/tools-list-baseline.mjs` | git-free listing and `--write`/`--check` generator | VERIFIED | `--check` exit 0. |
| `tests/fixtures/mcp-tools-list-8a058bdf.json` | frozen baseline | VERIFIED | 72 tools; reproduces byte for byte. |
| 10 new suites + `tests/fixtures/expect-outcome.html` + `tests/helpers/mcp-in-process.mjs` | contract, parity, SC4 layers 1 and 2 | VERIFIED | All exit 0 on Node 24 and Node 20. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `manual.ts` `registerManualTools` | `descriptions.ts` | `mcpToolDescription` + `mcpParamDescriptions(tool.name)` | WIRED | The published text equals the module text (budget coverage checks). |
| MCP handler | bridge payload | `const { expect, ...callerParams } = params`; `basePayload.expect = expect` only when defined | WIRED | Observed on the wire in the spot check. |
| `mcp-bridge-client.js` `_handleExecuteAction` | `wrapWithChangeReport` | `expect: payload.expect` | WIRED | — |
| `wrapWithChangeReport` / `handleBackRoute` | `evaluateExpectation` | `_resolveExpectSpec` → `_attachExpectResult` (bare identifiers in the SW, `require` in Node) | WIRED | vm-context SW case verified. |
| `evaluateExpectation` | page | `deps.executeProbe` = `_injectProbe` (ISOLATED) + `chrome.tabs.get` for URL and title | WIRED | Layer 2 in real Chrome: 10 pass. |
| `mapFSBError` `mayHaveExecuted` branch | caller | trailer `{outcome, mayHaveExecuted, expect_result}` | WIRED | — |
| `package.json` test | `REFINEMENT_ROOT_TEST_COMMANDS` | identical strings, once each | WIRED | `delegation-phase-contract` 1224/0. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `expect_result` in the MCP response | `response.expect_result` | `evaluateExpectation` over `chrome.tabs.get` and the ISOLATED `_fsbExpectProbeInPage` | Yes: real DOM reads in headless Chrome (Layer 2); the success path passes it through verbatim | FLOWING |
| Short descriptions in `tools/list` | `description` / `.describe()` | `MCP_TOOL_DESCRIPTIONS` / `MCP_PARAM_DESCRIPTIONS` | Yes: the live list matches the module text for 73/73 tools | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Every baseline description is strictly shorter; names, required lists and props are unchanged | `/tmp/v69/scripts/compare.mjs` (my script, live in-process list vs the fixture) | 73 live, extra only `settings`, 0 not strictly shorter, 0 required/prop diffs, `expect` on 29 | PASS |
| No-expect wire is identical to the pre-phase build | `/tmp/v69/scripts/prepost.mjs` (`f978e989` built in `/tmp` vs HEAD) | 192 calls, 0 diffs | PASS |
| `expect` validation, sidecar, JSON string, null, `back` timeout | `/tmp/v69/scripts/spot.mjs` | `{}` and unknown key: 0 sends; `back` 5000 vs 11500 | PASS |
| Version-skew fill and unknown-outcome trailer | `/tmp/v69/scripts/skew.mjs` | `extension_unsupported` fill; `isError` true + verified trailer; no `expect_result` on a definitive failure | PASS |
| Evaluator three-state verdicts, clamp, CR-01, CR-02 | `/tmp/v69/scripts/evalprobe.cjs` | All as expected; the `url_includes` echo drops the query string | PASS |
| Fixture re-derivation | `node scripts/mcp/tools-list-baseline.mjs --check` | exit 0, matches byte for byte | PASS |
| 26 targeted suites (10 new + registry pins + change-report + recovery + settings + coercion + bridge-smoke + version parity + delegation contract + schema lock + tool smoke + single activation + recorder) | `bash /tmp/v69/run.sh` | 26/26 exit 0 | PASS |
| New suites on official Node 20.20.2 | `bash /tmp/v69/run20.sh` | 11/11 exit 0; Layer 2: 10 pass, 0 skipped | PASS |
| Full `pretest` + `test` chain at HEAD `f2ddd231` | `node /tmp/fsb-tolerant-runner.mjs /tmp/v69/full` | 334 of 334 commands exited 0 (16 pretest + 318 test, including `tests/mcp-install-platforms.test.js`, because port 7226 was free this run). Layer 2 at the tail: 10 pass, 0 skipped. I restored the rewritten `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` with `git checkout --` | PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` exists and no plan declares one, so there is no probe to run. The phase's equivalent, the fixture `--check` generator, was run above (PASS).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MCP-01 | 69-01, 69-02, 69-04, 69-08 | Shorter descriptions for all existing tools while keeping argument and safety guidance | SATISFIED | Truths 1, 5, 6. V4 (exact tokens) and V5 (read-through) are deferred. |
| MCP-02 | 69-03, 69-05, 69-06, 69-07, 69-08 | Optional `expect` on action tools with a bounded same-call outcome check | SATISFIED | Truths 2, 4, 7-10. V4 (calibration) and V5 (real sites, live SC4) are deferred. |
| MCP-04 | 69-01, 69-02, 69-03, 69-05, 69-06, 69-07, 69-08 | Names, required args and wire stay byte-stable; only `expect` and `settings` are added | SATISFIED, with the recorded D-25 exception | Truths 3, 8, 11, 12. The CR-02 storage-level URL sanitization is not yet recorded next to D-25 (owner acknowledgement item). |

No orphaned requirements: REQUIREMENTS.md maps only MCP-01, MCP-02 and MCP-04 to Phase 69, and every one is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff) | — | TBD/FIXME/XXX/TODO/HACK/placeholder | — | None. No debt markers in added lines or in the modified source files. |
| `mcp/src/tools/agents.ts` | 17-25 | Stale header comment says `back` returns `change_report` | Info | The WR-06 fix corrected the published description, but not this older comment; no runtime effect. |
| `extension/utils/action-verification.js` / `mcp/src/errors.ts` | 1489-1491 / 487-488 | WR-04: an already-true predicate gives `verified`, then "Do not repeat the action" on an unknown outcome | Warning | Documented limitation (RESEARCH Pitfall 5). Owner decision. |
| `extension/utils/action-verification.js` | 724 | WR-05: D-25 term list misses token/secret/api key/credential/private key/passphrase/pass | Warning | Owner decision; implemented exactly as D-25 specifies. |
| `extension/utils/mcp-session-recorder.js` | 301-310, 460 | CR-02 widens persisted URL sanitization to `before`/`after`/`observed`/`expected` | Warning | Storage-only hardening, not recorded in VALIDATION MCP-04-g. |
| Four copies of the sensitive-field predicate | — | IN-01: only the regex and marker are parity-pinned | Info | Drift risk; pair with any WR-05 change. |
| `extension/utils/action-verification.js` | 1260-1270 | IN-02: the value check is an equality oracle on sensitive fields | Info | No new capability (`execute_js` can already read values). |
| `mcp/src/tools/descriptions.ts` | 41-42 | IN-04: `expect` matching rules are undocumented (case-sensitive `url_includes`, exact `value`) | Info | Blocked by the 160-char and 600-byte pins. |
| PROJECT.md target | — | Whole-list estimate cut is 30.4%, not "more than half" | Info | Not a roadmap SC. D-06 reports it without gating; the description-text cut is 55.2%. Exact figure is V4. |

### Human Verification Required

All items are deferred by owner direction to the milestone-end Validation Block, except the three owner decisions raised by the code review.

1. **V4: exact token counts.** Run `count_tokens` for the fixture and the current list on the pinned models. Expected: the real ratio recorded, and the PROJECT.md "more than half" target stated as met or not met.
2. **V4: comparative runs and constant calibration.** Expected: caller error rate, turns, wall time and verification calls per task measured; the `expect` timing constants adjusted (including how often slow pages now end as `still_loading`).
3. **V5: human read-through of the 73 descriptions.** Expected: no lost guidance.
4. **V5: real-site verdicts, ISOLATED world and ref resolution** on the unpacked build (Profile 2 or 5), including the CR-01 and WR-01 fixes on real SPAs and slow pages.
5. **V5: live SC4 in Claude Code and live version skew** against the Web Store build.
6. **V1: baseline digest cross-check** (`8321cc72…8c4a05`).
7. **V6: release.** Publish, compatibility check, docs, CI Node 20 with Layer 2 actually running, merge.
8. **Owner decision, WR-04.** Accept "verified means the postcondition held" (with "Do not repeat the action" on unknown outcomes) as the D-19/D-21 limitation, or order a pre-action baseline probe or softer wording.
9. **Owner decision, WR-05.** Keep or widen the D-25 sensitive-name list.
10. **Owner acknowledgement, CR-02.** Record the storage-only URL sanitization of `before`/`after`/`observed`/`expected` in VALIDATION MCP-04-g, or reject it.

### Gaps Summary

There are no gaps: everything Phase 69 could deliver through automation is present, substantive, wired and green.

- **Descriptions.** Every one of the 72 baseline descriptions is strictly shorter, and the gate enforces the D-06 floors against a reproducible baseline.
- **`expect`.** It is evaluated by real extension code with three outcomes, inside a bound, and in one call.
- **Contract.** I confirmed the no-`expect` contract independently against a fresh build of the phase start (192 calls, 0 diffs).

What remains:
- the live, spend and human checks already listed in the VALIDATION Manual-Only table (V1, V4, V5, V6);
- three review-raised owner decisions (WR-04, WR-05, the CR-02 storage scope).

None of these is something this phase's automated work should have delivered and missed, so the status is `human_needed`.

---

_Verified: 2026-10-17T03:10:00Z_
_Verifier: Claude (gsd-verifier)_
