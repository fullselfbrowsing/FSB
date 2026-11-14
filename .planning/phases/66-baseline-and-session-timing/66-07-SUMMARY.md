---
phase: 66-baseline-and-session-timing
plan: 07
subsystem: testing
tags: [benchmark, corpus, fixtures, core-lock, live-set, evidence, chrome-headless-shell, node-test]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: "scripts/bench/lib/outcome.mjs evaluateOutcome (claim-blind)"
  - phase: 66-baseline-and-session-timing (plan 05)
    provides: "scripts/bench/lib/tasks.mjs (validateTask, loadTasks, fixtureSha256, corpusLock, renderInstruction) and scripts/bench/fixture-server.mjs"
provides:
  - "12 frozen core fixture apps and task definitions (6 mixed, 6 click-heavy) under scripts/bench/fixtures/ and scripts/bench/tasks/core/"
  - "scripts/bench/fixtures/_shared/bench.js: benchPost, setMarker, setView, onActivate, the fixtureReady marker, and a one-click-one-activation guard"
  - "4 live reading tasks under scripts/bench/tasks/live/: 2 public Jira issues and 2 UAT-style reads of https://full-selfbrowsing.com"
  - "scripts/bench/tasks/core.lock.json: id, version and fixtureSha256 for every core task, frozen through Phase 71"
  - "tests/bench-corpus.test.mjs: 17 node:test cases, unregistered until 66-09"
affects: [66-08, 66-09, 66-10, 66-11, 71, benchmark runner, baseline campaign]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A fixture app is a static page with relative URLs and in-memory state. Each user action sends one explicit POST, and that request is the evidence"
    - "One click, one activation: a document capture listener cancels a repeat click on the same element before the microtask queue drains"
    - "Every exact-body request check is paired with one exact total for its endpoint"
    - "Byte-hashed fixtures are marked -text in .gitattributes, so no checkout can rewrite them"

key-files:
  created:
    - scripts/bench/fixtures/_shared/bench.js
    - scripts/bench/fixtures/invoice-lookup/index.html
    - scripts/bench/fixtures/ticket-triage/index.html
    - scripts/bench/fixtures/search-detail/index.html
    - scripts/bench/fixtures/search-detail/results.html
    - scripts/bench/fixtures/search-detail/detail.html
    - scripts/bench/fixtures/search-detail/catalog.js
    - scripts/bench/fixtures/wizard-submit/index.html
    - scripts/bench/fixtures/settings-change/index.html
    - scripts/bench/fixtures/paginate-find/index.html
    - scripts/bench/fixtures/paginate-find/items.js
    - scripts/bench/fixtures/checklist/index.html
    - scripts/bench/fixtures/custom-dropdowns/index.html
    - scripts/bench/fixtures/accordion-drilldown/index.html
    - scripts/bench/fixtures/confirm-modals/index.html
    - scripts/bench/fixtures/tabbed-toggles/index.html
    - scripts/bench/fixtures/kanban-moves/index.html
    - scripts/bench/tasks/core/*.json (12 files)
    - scripts/bench/tasks/live/*.json (4 files)
    - scripts/bench/tasks/core.lock.json
    - tests/bench-corpus.test.mjs
    - .planning/phases/66-baseline-and-session-timing/deferred-items.md
  modified:
    - .gitattributes

key-decisions:
  - "bench.js cancels a repeat click on the same element within one synchronous turn. FSB's content click fires two click events per click, so without the guard every toggle flips back and every save posts twice"
  - "Custom options carry tabindex 0, because FSB's snapshot lists [tabindex] but not role=option. Repeated buttons carry visually hidden item context, and listboxes and menus expand inline so nothing overlays the next control"
  - "Pages fit a short viewport (FSB snapshots the viewport only): invoice table and form side by side, ticket list without wrapping cells"
  - "The lock is deterministic pretty JSON with no timestamp; .gitattributes marks scripts/bench/fixtures/** -text"
  - "TDD for Task 3 was a RED test commit then a GREEN commit; the GREEN commit keeps the plan's own test(66-07) message"

patterns-established:
  - "A core task changes only by a version bump plus a deliberately regenerated core.lock.json; tests/bench-corpus.test.mjs fails on any byte of drift"
  - "Runner-side marker reads: [data-bench-marker] textContent after the timed window; the kanban markers exist from page load, the others appear on the first successful action"

requirements-completed: [MEAS-03]

# Metrics
duration: 46min
completed: 2026-09-30
---

# Phase 66 Plan 07: Frozen Benchmark Corpus Summary

**A frozen corpus of 12 local fixture apps (6 mixed, 6 click-heavy) whose success is decided by the app's own server-logged POST, the final URL and DOM markers, plus a separate 4-task live reading set. core.lock.json pins every byte through Phase 71. Every task was driven end to end in a headless browser with FSB's exact click sequence, which revealed that FSB's content click fires twice.**

This plan delivers part of MEAS-03: the corpus the runner (66-08) and the baseline campaign measure. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched; the orchestrator owns them.

## Performance

- **Duration:** 46 min
- **Started:** 2026-09-30T08:48:39Z
- **Completed:** 2026-09-30T09:34:37Z
- **Tasks:** 3/3
- **Files:** 35 created (exactly the plan's `files_modified`), plus `.gitattributes` modified and `deferred-items.md` created

## The core set

Every task posts JSON through `benchPost` to `/r/<token>/api/<slug>/<action>`. Each passes only if all of these hold:
- the exact body is logged the expected number of times;
- the endpoint's total count is exact;
- the final URL matches;
- the DOM marker(s) match.

| Task | The agent must | Answer | Distractors |
|------|----------------|--------|-------------|
| core-mixed-invoice-lookup | find the largest unpaid Northwind Traders invoice among 15, type its ID, submit | INV-1029 ($2,145.75) | paid Northwind $4,310 and $2,990; other customers' unpaid $3,975, $3,120.40, $2,780; the close second INV-1038 ($1,980) |
| core-mixed-ticket-triage | open the open billing ticket reported by Dana, set In Progress in a div combobox, save | OPS-226 | billing by Priya or Sam; Dana without billing; billing by Dana but Done (OPS-233) |
| core-mixed-search-detail | search, open details, add the waterproof trail running shoe under $120 | TRS-4427 ($112) | waterproof at $135 (TRS-4431), dry at $95 (TRS-4410), dry at $104, laces at $12. Waterproofing shows only on the detail page |
| core-mixed-wizard-submit | three steps: Acme Robotics, Team, 12 seats, submit | `{accountName, plan:"team", seats:12}` | the Starter and Enterprise radios; review, Back and validation paths |
| core-mixed-settings-change | copy the profile time zone into a native select, turn a div switch on, save | America/New_York, on | America/Toronto has the same UTC-05:00 offset; the default is UTC |
| core-mixed-paginate-find | page with Next to page 4, add the 12 oz blue ceramic mug | ITM-0437 | 16 oz blue mug (page 2), blue stainless travel mug 12 oz (page 3), green mug 12 oz (page 5), blue ceramic bowl 12 oz (page 1) |
| core-click-checklist | tick Alpha, Delta, Echo and Juliet out of 10 native checkboxes, save | `["alpha","delta","echo","juliet"]` | the six other boxes |
| core-click-custom-dropdowns | pick in four div comboboxes whose values differ from their labels, submit | eu-west, large, graphite, express | X-Large contains "Large"; slug values such as `ap-south` for Asia Pacific |
| core-click-accordion-drilldown | Organization, then Security, then Sessions; turn one auto-saving switch on | path `organization/security/sessions/reauth-exports` | the "(audit copy)" switch under Audit, and the imports switch |
| core-click-confirm-modals | Delete, Continue, then "Delete permanently" for one record | REC-3 "Q3 draft forecast" | REC-5 "Q3 final forecast", REC-6 "Travel policy draft" |
| core-click-tabbed-toggles | three switches across three tabs, save all nine keys | 3 changed from defaults | six more switches, some on by default |
| core-click-kanban-moves | three moves through "Move to" menus | done: Set up CI, Update dependencies, Write release notes; doing: Fix login redirect, Review PR 42 | Draft roadmap, and moving through Doing first |

## The live set (reported separately, never in the lock or the release gate)

| Task | Start URL | Checks |
|------|-----------|--------|
| live-jira-apache-hadoop-1 | `https://issues.apache.org/jira/browse/HADOOP-1` | URL has `/jira/browse/HADOOP-1`; text has `HADOOP-1` and `Fixed` |
| live-jira-atlassian-jraserver-1369 | `https://jira.atlassian.com/browse/JRASERVER-1369` | URL has `/browse/JRASERVER-1369`; text has `JRASERVER-1369` |
| live-uat-showcase-privacy | `https://full-selfbrowsing.com/privacy` | URL has `/privacy`; text has `Privacy Policy` and `No Third-Party Tracking` |
| live-uat-showcase-support | `https://full-selfbrowsing.com/support` | URL has `/support`; text has `Frequently Asked Questions` and `Common Issues` |

- All four facts were re-checked with plain HTTPS on 2026-09-30:
  - privacy: `Privacy Policy` ×1, `No Third-Party Tracking` ×4
  - support: both headings ×1
  - HADOOP-1: `Fixed` ×1
  - JRASERVER-1369: the key ×23
- None of the checked showcase headings is styled `text-transform: uppercase`. That rule applies only to `.section-label`, `.trouble-fix-label` and footer `h4`, so `innerText` keeps the checked case.

## Key finding: FSB's content click fires twice

`extension/content/actions.js` `click` (lines ~2436-2441) and `clickAtCoordinates` (~148-155) dispatch synthetic `mousedown`/`mouseup`/`click` and then also call `element.click()`. Both benchmark arms use this path.

I replayed that exact sequence from an isolated world in chrome-headless-shell 146, both after an `await` (as FSB does) and synchronously:

| Page | Toggle button | Native checkbox (direct / via label) | `role="switch"` div | Form submit |
|------|---------------|--------------------------------------|---------------------|-------------|
| without the guard | flips back (2 activations) | ends unchecked | ends unchanged | 2 submits |
| with `bench.js` guard | on (1) | checked | on | 1 submit |
| trusted CDP click, either page | on (1) | checked | on | 1 submit |

Without the guard, every click-heavy task would be unmeasurable. Every switch would read "no effect", and the accordion's auto-saving switch would send on and off (count 2). `bench.js` therefore cancels a repeat click on the same element before the microtask queue drains. Real input never produces such a repeat.

The product bug is logged in `deferred-items.md`; it is out of scope here (no `extension/**` edits).

## Verification Evidence

- **Functional check of every fixture in a real browser** (throwaway harness in `/tmp`, never committed):
  - It used the standalone puppeteer `chrome-headless-shell` 146 with a temporary profile. The user's Chrome was not touched.
  - **101/101 scenarios** behaved as expected.
  - Each task's intended path passes under FSB-style clicks and under trusted CDP clicks.
  - Variants that pass include keyboard use, label clicks, the `check_box` path, Enter via the `press_enter` fallback, detours, cancels and outside clicks.
  - Every distractor, double save and extra action fails.
  - Every scenario also required: no page exception, no HTTP status of 400 or more, and no GET outside the task's `fixtureFiles`.
- **Layout:** at 1280×800 the content of all 12 start pages ends by 669px, measured with a task's popup open where it has one. Invoice was 841px and ticket triage 756px before the fix. The search results and detail pages are shorter than the start page.
- **Tests:**
  - `node --test tests/bench-corpus.test.mjs tests/bench-tasks.test.mjs tests/bench-fixture-server.test.mjs` passes **122/122** on Node 24.14.1.
  - The same run passes 122/122 on **Node 20.20.2**, a binary already in the local npx cache (nothing was downloaded).
  - The other bench suites (stats, outcome, identity, claude-stream) pass 96/96.
- **Mutation probes (10), all caught, and each file was restored byte for byte:**

  | Mutation | Guard that failed |
  |----------|-------------------|
  | one fixture byte | lock |
  | `setInterval` in a page | static safety |
  | total count raised | pairing and self-checks |
  | answer moved to INV-1038 | invoice answer |
  | `data-bench-app` renamed | W2 |
  | action renamed | W2 |
  | absolute helper path | static safety, W2 and served references |
  | timestamp in the lock | lock byte determinism |
  | marker renamed | W2 |
  | unlisted file in an app directory | listed-and-hashed |

- **Acceptance checks, all as specified:**
  - The Task 1 command printed six `core-mixed-` ids.
  - The Task 2 command printed `core 12 click-heavy 6 live 4`.
  - Both greps over `scripts/bench/fixtures` printed nothing.
  - 4 live files are `"category": "reading"`, and exactly 2 start with `https://full-selfbrowsing.com/`.
  - The lock check exited 0.
  - `git diff --quiet HEAD -- package.json tests/delegation-phase-contract.test.js` exited 0.

## Task Commits

1. **Task 1: Shared helper and the six mixed apps:** `d07021ad` (feat)
2. **Layout fix to two Task 1 pages** (found in Task 2's viewport check): `75e69893` (fix)
3. **Task 2: Six click-heavy apps and the live reading set:** `e830f2dd` (feat)
4. **Task 3: Lock and corpus test (TDD):**
   - `5d8204f1` (test, RED): 16/17 passed; the lock case failed with ENOENT.
   - `f7b9e6ed` (test, GREEN): the plan's message `test(66-07): freeze the core benchmark corpus and self-check every task's evidence`.

**Plan metadata:** the `docs(66-07)` commit that adds this SUMMARY and `deferred-items.md`.

## Files Created/Modified

- `scripts/bench/fixtures/_shared/bench.js`: the shared page helper and the click guard.
- `scripts/bench/fixtures/<12 apps>/…` (16 files): the fixture pages, plus `catalog.js` and `items.js`.
- `scripts/bench/tasks/core/*.json` (12) and `scripts/bench/tasks/live/*.json` (4): task definitions, all `version: 1`.
- `scripts/bench/tasks/core.lock.json`: the frozen lock.
- `tests/bench-corpus.test.mjs`: 17 cases.
  - Composition of both sets.
  - Lock equality and byte determinism.
  - Every app file listed and hashed.
  - W2 ties: request path to `data-bench-app` and `benchPost('<action>'`, and markers to page source.
  - Exact bodies paired with exact totals.
  - Static safety.
  - Answers re-derived from the page data for 11 of the 12 tasks.
  - The offline self-check: correct bodies pass, while one extra body or a near-miss body fails.
  - Served bytes and relative references.
  - `renderInstruction`.

  It is not registered; 66-09 adds it to the chain.
- `.gitattributes`: `scripts/bench/fixtures/** -text`.
- `.planning/phases/66-baseline-and-session-timing/deferred-items.md`: the FSB double-click finding.

## Decisions Made

- **Answers are validated before a request is sent only where a real app would:**
  - Invoice IDs are trimmed, uppercased and must exist in the table.
  - The wizard checks each step.
  - The dropdowns refuse a submit until all four are chosen.

  A wrong but valid choice (a distractor) is still posted and fails.
- **Busy guards only stop overlapping requests.** A second deliberate save after the first finishes is posted and fails the exact total. "Add" buttons become "Added" and stay disabled, as a real shop would.
- **Navigation targets are idempotent:** wizard buttons go to a named step, kanban ignores a move to the card's own column, and the confirm dialogs track their step.
- **The search index adds a `waterproof` tag.** `waterproof trail running shoe` narrows the results to three. The literal query from the instruction returns 7 results and does not show waterproofing.
- **Markers:**
  - `cart-count` reports this page view's adds, so it is `1` on success.
  - The kanban markers are set at load, so they are always truthful.
  - Accordion markers are created in a "Saved changes" list on the first toggle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FSB's content click activated every fixture control twice**
- **Found during:** Task 1 (read from `extension/content/actions.js`, then measured)
- **Issue:** FSB's click fires two click events per click. Toggles flip back, native checkboxes stay unchecked, and submit or auto-save handlers post twice. The click-heavy corpus could not have been completed through FSB's `click` tool.
- **Fix:**
  - `bench.js` cancels a repeat click on the same element within one synchronous turn.
  - `bench.js` also exports `onActivate` (click plus Enter or Space for div controls), in addition to the plan's three helpers.
- **Files modified:** `scripts/bench/fixtures/_shared/bench.js`
- **Verification:** the guard off/on experiment above, and all 101 scenarios in both click modes.
- **Committed in:** `d07021ad`

**2. [Rule 2 - Missing critical functionality] Custom controls FSB could not see or tell apart**
- **Found during:** Task 1
- **Issue:**
  - FSB's snapshot candidate selector (`dom-analysis.js` ~1848) has no `[role="option"]`.
  - Its element description prefers `aria-label`, then text under 50 characters, so "Move to", "Add to cart" and "Delete" repeated on every row would be indistinguishable.
- **Fix:**
  - Options have `tabindex="0"`.
  - Comboboxes and switches carry `aria-label`.
  - Repeated buttons carry visually hidden item names.
  - Listboxes and menus expand inline rather than overlay.
- **Files modified:** the ticket-triage, custom-dropdowns, paginate-find, confirm-modals and kanban-moves pages
- **Committed in:** `d07021ad`, `e830f2dd`

**3. [Rule 1 - Bug] Two pages taller than a real browser viewport**
- **Found during:** Task 2's layout check
- **Issue:** FSB's default snapshot is viewport-only. Invoice (841px) and ticket triage with its panel open (756px) would have cost scroll steps that are not part of the task.
- **Fix:** invoice table and form side by side, and ticket cells that do not wrap (669px and 566px).
- **Files modified:** `invoice-lookup/index.html`, `ticket-triage/index.html`
- **Committed in:** `75e69893`

**4. [Rule 2 - Missing critical functionality] Line-ending conversion would break the byte-hashed lock**
- **Found during:** Task 3
- **Issue:**
  - A Windows checkout with `core.autocrlf=true` rewrites fixture bytes, so the lock would report drift that is not a content change.
  - CI's `npm test` job is Linux-only, but the corpus is frozen for any machine.
- **Fix:** `.gitattributes` gets `scripts/bench/fixtures/** -text`. The files were already LF; `git status` showed no renormalization.
- **Committed in:** `f7b9e6ed`

### Execution notes (not rule deviations)

- **Wording differences from the plan:**
  - paginate-find's Previous and Next are links styled as buttons; they navigate to `?page=N` as specified.
  - Every core `finalUrl` check has `pathEquals`, because the 66-05 schema requires it.
- **Extra distractors:**
  - a Done billing ticket by Dana, which makes "open" matter;
  - America/Toronto, with the same offset as New York;
  - the close second invoice INV-1038;
  - the travel mug and the bowl in the catalog.
- **Corpus test additions beyond the plan's behaviors:**
  - every app file listed and hashed;
  - bodies paired with totals;
  - answers re-derived from page data;
  - near-miss bodies;
  - served bytes and relative references;
  - a wider static list: timers, clocks, randomness, background channels, embeds and CSS resources, `fetch(` only inside `bench.js`, relative `src`/`href`/`action`, and a `data:,` favicon on every page.
- **Branch checks:** the executor's `worktree-agent-*` allow-list was skipped, because the orchestrator directs commits on `Jev`. The cwd-drift sentinel and the protected-branch deny-list ran before every commit.

---

**Total deviations:** 4 auto-fixed (2 Rule 1, 2 Rule 2).
**Impact on plan:**
- Each fix keeps the corpus measurable by both arms and keeps the frozen identity honest.
- The footprint is the plan's 35 files plus one `.gitattributes` line and the deferred-items log.
- No `extension/**`, `mcp/**`, `package.json`, STATE.md or ROADMAP.md change.

## TDD Gate Compliance

- Task 3 has a RED `test(66-07)` commit (`5d8204f1`, failing on the missing lock), followed by its GREEN commit (`f7b9e6ed`).
- The GREEN commit keeps the plan's own `test(66-07)` message, as earlier plans kept the plan messages on GREEN. So this task has no `feat` commit.
- The plan is `type: execute` with task-level TDD, so the plan-level gate does not apply.

## Issues Encountered

- **zsh parsing:** zsh treats a leading `=` as command expansion, so `echo ======` failed. BSD `cat` has no `-A`. Node 24's default test reporter prints `ℹ` summary lines, not TAP `#` lines. Each was re-run correctly. No process was left running.
- **Viewport measurement:** `scrollHeight` is floored at the viewport height, so the layout check used the bottom of `<main>` instead.
- **Known limitation of the live checks:** `urlIncludes` and `includes` are substring checks. `/jira/browse/HADOOP-1` and the text `HADOOP-1` would also match HADOOP-10..19. The live set is separate and never gates, so the planned checks were kept.
- **Text-click traps an agent may hit:** FSB's text click picks the last visible match in document order.
  - `Large` also matches `X-Large`.
  - With both panels open, the accordion's exports text also matches the audit copy.

  These are realistic, and are recorded for the 66-10 smoke.

## Known Stubs

None. Placeholder text such as "Choose a region" is the intended empty state of a custom combobox.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- **66-08:**
  - Drive tasks with `loadTasks` and `renderInstruction` against `startFixtureServer()`, which uses the default root `scripts/bench/fixtures`.
  - Read `[data-bench-marker]` text after the window. The kanban page has markers from load, so "the target with the most markers" still resolves to the task tab.
  - `data-fixture-ready="true"` is set at DOMContentLoaded.
  - Record `corpusLock(tasks)` for run identity. It equals `core.lock.json` today.
- **66-09:** register `tests/bench-corpus.test.mjs`. It is Node 20-safe and takes about 0.2 s.
- **66-10 smoke:**
  - Expect one POST per completed action.
  - If a task fails while the page shows the right state, look at FSB's double click first; `bench.js` should already neutralize it.
  - The live UAT checks need the bench Chrome in English.
- **Blockers:** none.

## Self-Check: PASSED

- All 35 planned files, `deferred-items.md` and this SUMMARY were found on disk.
- All 5 task commits were found: `d07021ad`, `75e69893`, `e830f2dd`, `5d8204f1`, `f7b9e6ed`.
- No commit in `333ed5bc..HEAD` has a Co-Authored-By line.
- `git status --porcelain -- extension/ mcp/ package.json .planning/STATE.md .planning/ROADMAP.md` was empty.

---
*Phase: 66-baseline-and-session-timing*
*Completed: 2026-09-30*
