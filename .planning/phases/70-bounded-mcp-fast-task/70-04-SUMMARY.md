---
phase: 70-bounded-mcp-fast-task
plan: 04
subsystem: fast-mode
tags: [run_task, jev, fast-mode, goal-normaliser, disclosure, d-22, d-23, mcp-03]

# Dependency graph
requires:
  - phase: 70-bounded-mcp-fast-task
    provides: "70-01: 70-SYNC-RECHECK.md items g, j, k, l and Drift substitutions 7, 8, 10, 11; 70-02: the run_task session field; 70-03: session._fastRunStartPage"
  - phase: 67-hosted-jev-gateway-policy-and-shadow-mode
    provides: FsbJevState.scrubText, matchesSecret, toOriginPath, buildRequest
  - phase: 68-autopilot-fast-mode
    provides: FsbFastPath beforeTurn step o, the 68-08 exporter (deriveRecords), the 68-12 disclosure fact fixture, the loop harness and fake gateway
provides:
  - "FsbFastPath.normaliseGoal(task, pageUrls): drops one leading 'Open <http(s) URL>.' sentence that only restates a code-held page; always returns a suffix of the task"
  - "beforeTurn step o sends normaliseGoal(session.task, [menu.url, session._fastRunStartPage]) to buildRequest (the only removed line in jev-fast-path.js)"
  - "tests/jev-run-task-disclosure.test.js: the 68 disclosure re-verified for MCP run_task (registered in package.json and REFINEMENT_ROOT_TEST_COMMANDS)"
affects: [70-05, 70-06, 70-07, 70-08, 71]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tighten-only text normaliser: any doubt (no page match, a redactable segment, a secret in the query or fragment, credentials, an undecodable segment, a missing scrubber) returns the input unchanged, and buildRequest still scans the result"
    - "Copy re-verification as a test: limiting-phrase patterns with a self-test (must match / must not match), so a harmless mention can never trigger the stop-and-raise path"

key-files:
  created:
    - tests/jev-run-task-disclosure.test.js
    - .planning/phases/70-bounded-mcp-fast-task/70-04-SUMMARY.md
  modified:
    - extension/ai/jev-fast-path.js
    - tests/jev-fast-path.test.js
    - package.json
    - tests/delegation-phase-contract.test.js
    - .planning/phases/70-bounded-mcp-fast-task/deferred-items.md

key-decisions:
  - "D-22 condition (2) is implemented as Drift substitution 10 allows, and tighter: per-segment scrubText, plus a matchesSecret check of each percent-decoded segment (an undecodable segment declines), plus toOriginPath(url).path === pathname when toOriginPath is exposed"
  - "D-22 condition (3) checks the query plus fragment, the query alone and the fragment alone, each raw and percent-decoded ('+' read as a space); an undecodable query declines"
  - "An Open URL that carries a user name or password declines (Rule 2): URL.origin drops userinfo, so without this check a credential in the task would be dropped silently instead of latching sensitive_goal"
  - "The 'long goal' case follows Drift substitution 7: buildRequest truncates a goal over 1000 code points and sends it (one decide, no latch); the plan's 'invalid_request and a session latch' wording does not match the real 67 code"
  - "The recorded-redaction branch did not apply (70-SYNC-RECHECK item l, Drift substitution 11): both token shapes' core-task sub-checks assert equality with the exporter goal"
  - "No copy change is needed (D-23): every disclosure check passed against the shipped card and privacy section; no file under extension/ui/ or showcase/ changed"

requirements-completed: []  # MCP-03 is advanced here and met only at the Phase 70 gate plan
requirements-advanced: [MCP-03]

# Metrics
duration: ~13min
completed: 2026-10-18
---

# Phase 70 Plan 04: Goal normaliser and run_task disclosure re-verify Summary

**Fast-mode goals no longer carry the duplicate `Open <url>.` sentence when it only restates the current or starting page. This lets every core bench goal reach Jev under both run-token shapes, and the goal equals the 68-08 calibration records' goal. Any other secret still latches `sensitive_goal`. A new registered suite shows that the shipped Phase 68 disclosure holds for MCP-started `run_task` tasks, so no copy was edited.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-10-18T22:41:58Z
- **Completed:** 2026-10-18 (Task 2 commit 22:49Z; the wave check and sweep took until about 22:52Z)
- **Tasks:** 2 of 2
- **Files modified:** 5 (plus deferred-items.md and this SUMMARY)

## The normaliser rule as implemented

`FsbFastPath.normaliseGoal(task, pageUrls)` (`extension/ai/jev-fast-path.js:407`, with its helpers starting at `:349`), exported next to `toBuilderInput`:

1. `task` must be a string and `pageUrls` an array. Otherwise `task` is returned as it is.
2. The pattern `/^Open (https?:\/\/\S+)\.(?=\s|$)/` must match once at the start. The sentence dot is the last dot before whitespace or the end of the text, so `index.html.` keeps `.html`. The scheme must be lower-case `http` or `https`, and `Open` needs a capital O followed by exactly one space.
3. The rest is `task.slice(match.length)` with its leading whitespace removed. Trailing whitespace is kept. If the rest is empty, the task is returned unchanged.
4. `FsbJevState` is resolved lazily through the module's resolver and must expose `scrubText` and `matchesSecret`. If not, the task is returned unchanged.
5. The URL must parse as http(s) through `root.URL` (the module's `parseWebUrl`) and must carry no user name and no password.
6. **Condition 1:** `origin + pathname` must equal `originPathOf(entry)` for an entry of `pageUrls`. Entries that do not parse are skipped. Default ports and host case compare equal, path case does not, and the page's query and fragment are ignored.
7. **Condition 2:** every `pathname.split('/')` segment must satisfy `scrubText(seg) === seg`. A segment containing `%` must also decode, and the decoded form must not `matchesSecret`. When `toOriginPath` is exposed, `toOriginPath(url).path` must equal `pathname`.
8. **Condition 3:** `search + hash`, `search` and `hash` must each give `matchesSecret === false`, both raw and percent-decoded.
9. If every check passes, the function returns the rest. Any throw returns the task unchanged.

**Call site** (`:1522`, step o, the only `-` line in `git diff -U0 HEAD~1` of Task 1):

```js
        goal: normaliseGoal(session.task, [menu.url, session._fastRunStartPage]),
```

`buildRequest` (step p) still scans the result. The module keeps every grep criterion: no scheme-plus-slashes literal, no `JEV_*`, `chrome.`, timers or `importScripts`.

## Core-task equality (both token shapes)

"core tasks equal exporter goals": **24 of 24 PASS.** For each of the 12 core tasks, `renderInstruction(task, 'http://127.0.0.1:53211/r/<token>' + startPath)` was normalised against `[startUrl]`. The result equals the goal of the record that `deriveRecords` produced for that task, and `matchesSecret(goal)` is false. This held for the 22-character token `Ab3dEf9hIj2kLm5nOp8qRs` and for the 24-letter token `qwertyuiopasdfghjklzxcvb`. The exporter goals come from `deriveRecords` fed one minimal capture record per task, with 0 drops. Before normalising, 12 of the 24 rendered tasks matched `matchesSecret`: exactly the 12 with the 22-character token, because the high-entropy run spans the URL. After normalising, none did.

**Recorded-redaction branch: did not apply.** 70-SYNC-RECHECK item l and Drift substitution 11 record that per-segment `scrubText` leaves the 22-character token unchanged. So both shapes take the normal branch, and the "V4 / 71 D-07" note is not needed: with today's 22-character bench token, V4's fast arm no longer trips `sensitive_goal` on the Open sentence.

## The re-pointed 68-05 case

`'a bench-like goal holding a run token latches the command sensitive_goal with zero decide calls'` (`tests/jev-fast-path.test.js`, `orchFallbacks`) is now **`'bench goal normalises and is sent: one decide whose goal is "Tick Alpha."'`**. The case was edited in place: the same `BENCH_GOAL` now runs on a menu whose URL is its Open URL plus `?view=edit#top`. A second check confirms that `session.task` is unchanged and that the address reaches the request only as `page.path`.

The `sensitive_goal` latch is still covered by these cases, each with both token shapes:
- **"sk- key after the Open sentence":** a command latch with zero decide calls. The two old follow-on checks moved here: the latch holds for the rest of the command, and the attempt is recorded with `jevCalled` false.
- **"token in the Open URL query":** the normaliser returns the task unchanged, and the command latches with zero decide calls.
- **"bench goal on another page":** the same goal on the rig's default page still latches, because condition 1 declines.

The two other bench-goal `sensitive_goal` cases (`tests/jev-fast-loop.test.js`, `tests/jev-fast-measurement.test.js`) run on pages other than the Open URL. They stay as written and still pass (Drift substitution 8).

## Task Commits

1. **Task 1: the goal normaliser, its call before buildRequest, and the re-pointed Phase 68 bench-goal case** - `267c1ddb` (feat). 1269 checks in `tests/jev-fast-path.test.js`, up from 1153; 9 failed at RED.
2. **Task 2: re-verify the Phase 68 disclosure for run_task against the shared fact fixture** - `254f4d21` (test). New suite with 51 checks, registered once in `scripts.test` and once in `REFINEMENT_ROOT_TEST_COMMANDS`.

## Named checks (all PASS)

- **Task 1:** "bench goal normalises and is sent" (2), "sk- key after the Open sentence" (3 per shape), "token in the Open URL query" (2 per shape), "long goal" (3), "normaliser output is a suffix" (2,000 generated tasks: 235 changed and 1,765 unchanged, plus 5 fixed tasks), "core tasks equal exporter goals" (24). Also the rule and decline cases (about 50), and the wiring cases: a menu page match, a `_fastRunStartPage` match, neither, and a start page that differs.
- **Task 1 mutation check:** removing each condition fails the suite. The page match fails 13 checks, path scrub 4, query check 8, userinfo 1, the empty-rest guard 3, the decoded-segment guard 1, the step-o wiring 5 and the start-page entry 1. The module was restored byte-for-byte (`cmp`).
- **Task 2:** "panel patterns self-test" (4 must-match, 3 must-not-match), "no panel-only limit", "privacy control names the settings tool" (4), "card MCP mention recorded", "no forbidden overclaim" (3 texts plus 6 shared facts), "run_task goal is a suffix" (4 goals), "query strings never sent" (2 shapes), "secret still sends nothing" (6 cases) and "one step description while uncalibrated". The last one ran on the real loop harness with the real helper's `(true,'mcp')` field and an `uncalibratedBody` gateway over 6 iterations: 1 getJevMenu, 1 decide (goal `Finish the wizard.`), a `not_calibrated` session latch, and the task kept running.

## Disclosure findings (D-23, for M-70-09)

- **Copy change needed (owner decision, D-23): none.** Every check passed against the shipped copy. `git diff --quiet HEAD~1 HEAD -- extension/ui/ showcase/` exits 0, and no xlf file was touched.
- **"card MCP mention recorded":** the card mentions neither `MCP` nor `settings tool`, and it does name the autopilot ("Faster simple clicks during autopilot", "FSB's autopilot sends a short description..."). This matches the 68-12 copy and is recorded for M-70-09. It is not a failure.
- **Every printed panel sentence:**
  - Card: none. 0 of its 9 sentences mention a panel word.
  - Privacy fast-mode section: 1 of 24 sentences. "You can turn it on or off in Advanced Settings in the FSB Control Panel, and you can turn it off at any time; while it is off, nothing is sent." This is a neutral mention of where the switch lives and matches no limiting pattern.
- **Privacy Control fact present:** "An MCP client connected to FSB can also change this setting through FSB's settings tool." It sits in the `@@privacy.section.jevFastMode.control` unit.
- **Open Question 3 reading (asserted by "secret still sends nothing"):**
  - Secrets are judged on the normalised goal.
  - The Open URL is judged by FSB's address rule, per path segment, plus its query and fragment.
  - A secret anywhere outside a page-matching Open sentence still sends nothing.
  - So a goal whose only "secret" was the 22-character bench token in its own page address is now sent without that sentence, where before 70-04 the whole-text scan latched it. The token still travels in `page.path` exactly as before.
  - The M-70-09 reviewer decides whether "if your task text itself contains one, nothing is sent for that task" reads truthfully under that rule.
- **Observation for M-70-09 (not a Phase 70 regression):** an `Open` sentence for a page other than the current or start page stays in the task text, query string included. For example, `Open https://shop.example/cart?q=1. Tick Alpha.` is sent with `?q=1`. The card lists "your task text" as sent and "URL query strings and fragments" as never sent. The second claim holds for the page address but not for a URL a user writes inside the task. Phase 68 already sent task text verbatim, and 70-04 only ever removes text. A wording decision belongs to V6.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Drift substitutions applied (authoritative over the plan text, per 70-SYNC-RECHECK item t)

**1. "long goal" (Drift substitution 7).** The plan says a normalised remainder over 1,000 code points still gives `invalid_request` and a session latch. The real `buildRequest` truncates the goal to 1,000 code points and sends it. The case asserts that behaviour instead: one decide whose goal is the first 1,000 code points (it includes astral characters), and no command or session latch.

**2. Condition (2) (Drift substitution 10).** It is implemented as per-segment `scrubText`, plus the percent-decoded check, plus `toOriginPath` path equality, not per-segment `scrubText` alone. This is tighter: it also declines a percent-encoded card number segment (`4111%201111%201111%201111`) and an undecodable segment.

### Auto-fixed Issues

**1. [Rule 2 - Security] An Open URL with credentials declines.**
- **Found during:** Task 1.
- **Issue:** `URL.origin` drops userinfo, so `Open http://user:pw@host/p.` on page `http://host/p` would match condition 1. The credential would then be removed silently instead of reaching the secret scan.
- **Fix:** `parsed.username !== '' || parsed.password !== ''` declines. A test case covers it.
- **Commit:** `267c1ddb`.

**2. [Rule 2 - Security] The query and fragment are also checked percent-decoded and one at a time.**
- **Found during:** Task 1.
- **Issue:** A percent-encoded secret in the query (`?card=4111%201111%201111%201111`) passes a raw `matchesSecret` check.
- **Fix:** `queryHoldsSecret` checks `search + hash`, `search` and `hash`, each raw and decoded. An undecodable part declines. A test case covers it.
- **Commit:** `267c1ddb`.

**3. [Rule 1 - Bug, test only] A duplicate test helper name.**
- **Found during:** Task 1 RED.
- **Issue:** The first draft added a second `function isolatedFastPath` to `tests/jev-fast-path.test.js`. A later declaration silently replaces the earlier one, so it broke a 70-03 check ("run evidence start page: null when no URL constructor is reachable").
- **Fix:** Removed the duplicate and reused the 70-03 helper, passing `URL` explicitly.
- **Commit:** `267c1ddb`. The broken state was never committed.

### Choices within the plan's latitude

- The re-pointed case puts `?view=edit#top` on its menu URL, which also proves that the page match ignores the page's own query.
- The latch cases run under both token shapes. The 24-letter shape proves that the latch comes only from the sk- key or the query token, since that URL holds no secret of its own.
- "one step description while uncalibrated" also asserts the count is exactly one, so the check cannot pass vacuously. It also asserts that the one goal sent is the normalised task. The run uses `registerRunEvidence: true`, as production does.
- "query strings never sent" scans the raw request body bytes (`init.body`), not the parsed object. It also rejects the bare words `utm` and `frag`.

## Known residuals (recorded, not fixed)

- `deferred-items.md` "From 70-04" item 1: the `toBuilderInput` JSDoc (`jev-fast-path.js:265`) still calls `ctx.goal` "the user's task text, unchanged". Task 1 allowed only one removed module line, so it was left for the next plan that may edit a line there.

## Wave check (`<verification>`)

- `npx --offline -y node@20 tests/jev-fast-path.test.js && npx --offline -y node@20 tests/jev-run-task-disclosure.test.js`: exit 0, 1269/0 and 51/0.
- On the official Node 20.20.2 binary, all exit 0: `jev-fast-settings`, `jev-run-task-upstream-contract`, `jev-fast-loop`, `jev-extension-boundary`, `jev-fast-start-path`, `jev-fast-measurement` and `--test jev-fast-capture.test.mjs`.
- On Node 24, all exit 0: `jev-fast-loop` (365), `jev-extension-boundary` (198), `jev-fast-measurement` (94), `jev-fast-capture.test.mjs`, `jev-run-task-upstream-contract` (87), `jev-fast-start-path` (194), `run-task-fast-mode-wire`, `jev-policy-tighten-only` (29,650), `delegation-phase-contract` (1,249), `showcase-privacy-page` (98), `jev-fast-settings` and `mcp-client-identity-integration`.
- Regression sweep (`node scripts/bench/sweep-tests.mjs --files extension/ai/jev-fast-path.js extension/ai/jev-state.js --baseline .../70-SWEEP-BASELINE.json`): **20/20 passed, no new failures vs baseline, exit 0.**
- Port 7225 was held by the user's hub (node pid 7109), as at baseline, and left alone. `git status --short` was clean afterwards, so no showcase/public churn.
- `git diff --quiet HEAD~2 -- scripts/bench/ showcase/ extension/ui/ mcp/` exits 0. Task 1's commit lists only `extension/ai/jev-fast-path.js` and `tests/jev-fast-path.test.js`.

## TDD Gate Compliance

This is a `type: execute` plan with two `tdd="true"` tasks, and each task prescribes one commit, so there is no separate `test(...)`/`feat(...)` pair per task.
- **Task 1:** RED was observed before the implementation: 9 failures (`FsbFastPath.normaliseGoal is not a function`, the re-pointed case still latching `sensitive_goal`, and the wiring cases).
- **Task 2:** this task re-verifies copy and code that already shipped, and D-23 expects them to hold. A failure would have been a stop-and-raise, never a fix, so a first-run pass is the expected outcome, not a skipped RED. The "panel patterns self-test" proves that the limiting patterns can fail: they match the 4 limiting sentences and none of the 3 neutral ones. The Task 1 mutations show that the normaliser checks in the same suite can fail.

## Known Stubs

None.

## Threat Flags

None. T-70-03 is mitigated as planned:
- the normaliser only removes text;
- conditions (2) and (3) use the 67 scrubber, plus the decoded and userinfo declines;
- `buildRequest` re-scans the result;
- an empty remainder declines;
- the suffix property is tested over 2,000 generated inputs.

T-70-05 is mitigated by the new suite. No endpoint, message, storage key or wire field was added.

## Deferred to Validation Block

Deferred: M-70-04 (V4), M-70-09 (V6).
- **M-70-04 (V4):** expect the `sensitive_goal` count through `run_task` near zero on bench goals now that D-22 has landed. Count the goals that are sent truncated at 1,000 code points (Drift substitution 7).
- **M-70-09 (V6):** a human wording check covering four points:
  - whether "FSB's autopilot" covers MCP-started `run_task`;
  - the Open Question 3 reading above;
  - the card has no MCP sentence, and the settings-tool fact is on the privacy page only;
  - the observation that a URL a user writes inside the task text (not a page-matching Open sentence) is sent with its query string as part of the task text.

## Next Phase Readiness

- 70-05 can rely on step o sending the normalised goal. The goal never feeds the classifier, and the `fast_mode` block never holds a goal (D-18).
- 70-07's bench records: live goals now equal the 68-08 calibration records' goals for every core task.

---
*Phase: 70-bounded-mcp-fast-task*
*Completed: 2026-10-18*

## Self-Check: PASSED

The four source and test files, the new suite and this SUMMARY exist. Commits `267c1ddb` and `254f4d21` are on Jev, and no commit message carries AI attribution. Nothing was pushed. STATE.md, ROADMAP.md and REQUIREMENTS.md were not touched.
