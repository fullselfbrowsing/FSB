---
phase: 67-hosted-jev-gateway-policy-and-shadow-mode
plan: 10
subsystem: bench
tags: [jev, shadow, labelled-records, calibration, bench, validator, core-lock]

# Dependency graph
requires:
  - phase: 67-01
    provides: "Server CONTRACT and validateRequest (showcase/server/src/jev/validator.js)"
  - phase: 67-06
    provides: "FsbJevState.validateRequest, scrubText, filterInjection, toOriginPath, utf8ByteLength"
  - phase: 66-baseline-and-session-timing
    provides: "The frozen core corpus, core.lock.json, loadTasks and BENCH_TASKS_ROOT"
provides:
  - "scripts/bench/shadow/lib/records.mjs: RECORD_SCHEMA_VERSION, PROVENANCES, SHADOW_RECORDS_ROOT, CORE_LOCK_PATH, RECORD_ID_PATTERN, NOTE_MAX_CHARS, validateRecord, loadRecords, readCoreLock, checkLockReferences"
  - "scripts/bench/shadow/records/: 25 hand-written labelled seed records over all 12 core fixtures"
  - "tests/jev-shadow-records.test.mjs (32 node:test cases; not yet registered, 67-13 registers it)"
affects: [67-12, 67-13, 68, V3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact-key record validator in the validateTask style: collect every error, never throw, one aggregated loader Error naming each bad file"
    - "Dual request validation via createRequire: the server validator and FsbJevState.validateRequest must both accept every record request"
    - "Sanitized-form fixed point: a record request must be exactly what the extension builder emits (scrubber and injection filter leave it unchanged, toOriginPath round-trips, recent-action targets are current ids or null, within the 20,000-byte budget)"
    - "Read-only lock reference: record.task {id, version, fixtureSha256} must equal its core.lock.json entry, so a fixture change invalidates the record"

key-files:
  created:
    - scripts/bench/shadow/lib/records.mjs
    - scripts/bench/shadow/records/ (25 files, shadow-<slug>-<nn>.json)
    - tests/jev-shadow-records.test.mjs
  modified: []

key-decisions:
  - "validateRecord also enforces the sanitized form (scrub/filter fixed point, toOriginPath round trip, stale recent-action ids, request byte budget) so recorded-llm records at V3 are held to 'exactly as the extension would send it'"
  - "Completion-positive records that ask operation/target label both none_of_the_above: once the goal is met, no operation or element moves it forward"
  - "Stuck-positive records ask only completion/stuck (plus risk on paginate-find-02): the right next Choice is ambiguous when the agent is looping, so no Choice label is written there"
  - "Custom ARIA listboxes are labelled click; select_option is offered only for the native <select> (settings-change). Checkboxes, switches and radios use check_box"
  - "offeredOps is the union of the listed elements' ops plus scroll, and go_back only after the run has navigated"
  - "Risk labels follow the instrument's risk question literally: deletes, the paid wizard Submit and the account-settings Save are positive; expanding a section, switching a tab, paging, typing a search and choosing an unsaved dropdown option are negative"
  - "loadRecords deep-freezes the returned array as well as each record"

requirements-completed: [JEV-05]

# Metrics
duration: 20min
completed: 2026-10-17
---

# Phase 67 Plan 10: Labelled Shadow Step Records and Seed Set Summary

**An exact-key labelled step-record format and 25 hand-written seed records over all 12 frozen core fixtures. Every record request passes both Jev request validators and is already in the form the extension builder would send. Every record is pinned to its `core.lock.json` entry, so a fixture change invalidates it. The set has 4 risk positives, 5 risk negatives, 3 completion positives, 21 completion negatives, 2 stuck positives and 8 stuck negatives.**

## Performance

- **Duration:** about 20 min
- **Started:** 2026-10-17T05:45:00Z
- **Completed:** 2026-10-17T06:05:00Z
- **Tasks:** 3 (Task 1 TDD), 5 commits
- **Files:** 27 created (1 module, 25 records, 1 test), none modified

## Accomplishments

- **`scripts/bench/shadow/lib/records.mjs`** validates, loads and lock-checks records, following the `validateTask`/`loadTasks` style.
  - It loads the server validator, the server CONTRACT and `extension/ai/jev-state.js` through `createRequire(import.meta.url)`.
  - It writes nothing.
  - It reads `core.lock.json` through `readCoreLock()` and never modifies it.
- **25 seed records** in `scripts/bench/shadow/records/`, two per fixture (three for confirm-modals), all with provenance `hand`.
  - Every element, title and text word is taken from the fixture's own files, or from the goal where the page echoes typed input.
  - Every request builds an unshrunk upstream body through the 67-03 instrument. The largest is 4,564 bytes, against a 28,000-byte budget.
- **`tests/jev-shadow-records.test.mjs`** has 32 node:test cases in six groups:
  - schema unit cases;
  - sanitized-form and budget cases;
  - loader cases on temp directories;
  - lock-reference cases;
  - per-record seed rules;
  - the click, mixed and whole-set coverage assertions.

  The last test checks that the bytes of `core.lock.json` are unchanged.

## Record format (schemaVersion 1)

Every key below is required. Unknown keys are rejected at every level.

```
{
  schemaVersion: 1,
  id: 'shadow-<slug>-<nn>',            // ^shadow-[a-z0-9-]+-\d{2}$ ; file name must be <id>.json
  provenance: 'hand' | 'recorded-llm' | 'code-outcome',
  task: { id, version, fixtureSha256 },  // ^core-…$, positive integer, 64 lowercase hex; must equal the core.lock.json entry
  step: integer >= 0,                    // the step index within the task
  request: <Jev request v1>,
  labels: { operation, target, completion, stuck, risk },
  note: string                           // at most 300 code points
}
```

- **`request`** must pass all of these checks:
  - the server `validateRequest`;
  - `FsbJevState.validateRequest`;
  - then a sanitized-form check:
    - `scrubText` and `filterInjection` leave the title, the text, each label and each role unchanged;
    - `toOriginPath(origin + path)` gives back the same origin and path;
    - every `recentActions[].targetId` is null or a current element id;
    - the request is at most 20,000 UTF-8 bytes.
- **`labels`** has all five kinds:
  - A kind that is not in `request.kinds` must be `null`.
  - A requested kind must not be `null`:
    - `operation` is one of `offeredOps` or `none_of_the_above`;
    - `target` is a request element id or `none_of_the_above`;
    - `completion`, `stuck` and `risk` are booleans.
- **Seed conventions**, enforced by the test for the hand set only:
  - `goal` is the task instruction without its `Open {startUrl}. ` prefix.
  - The origin is `http://127.0.0.1:4173` and the path is one of the task's own fixture `.html` pages.
  - Page text is at most 600 characters.
  - Element ids run `e0..eN` in order, and every element op is offered.
  - Stuck positives end with at least 3 identical no-change actions, and stuck negatives have only changing actions.
  - Completion positives show every success-marker value of the task in the page text.

### API

| Export | Behaviour |
| --- | --- |
| `validateRecord(record)` | `{ok, errors}`. It collects every error, never throws, and is total on hostile shapes such as an own `__proto__`, a null request or array labels. |
| `loadRecords({recordsRoot = SHADOW_RECORDS_ROOT} = {})` | Returns the records sorted by id, with the array and every record deep-frozen. It ignores non-`.json` entries. It throws one Error that lists every bad file: not a regular file, invalid JSON, validator errors, or `file name must be <id>.json`. |
| `checkLockReferences(records, lock = readCoreLock())` | `{ok, errors}`. `lock` is the parsed lock (`{tasks}`) or its entry array. It reports an unknown task id, a version mismatch or a `fixtureSha256` mismatch, one error each. |
| `readCoreLock(lockPath = CORE_LOCK_PATH)` | The deep-frozen `tasks` array of `core.lock.json`, read-only. |

## The 25 seed records

Labels use `-` for null, meaning the kind was not asked. `none` is `none_of_the_above`.

| Record | Fixture page | Step | Kinds | operation | target | completion | stuck | risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| shadow-accordion-drilldown-01 | accordion-drilldown/index.html | 1 | op, tgt, comp, stuck | click | e1 Security | false | false | - |
| shadow-accordion-drilldown-02 | accordion-drilldown/index.html | 2 | op, tgt, comp, risk | click | e2 Sessions | false | - | false (open section) |
| shadow-checklist-01 | checklist/index.html | 2 | op, tgt, comp, stuck | check_box | e4 Echo | false | false | - |
| shadow-checklist-02 | checklist/index.html | 5 | comp, stuck | - | - | **true** | false | - |
| shadow-confirm-modals-01 | confirm-modals/index.html | 0 | op, tgt, comp | click | e2 Delete Q3 draft forecast | false | - | - |
| shadow-confirm-modals-02 | confirm-modals/index.html | 1 | op, tgt, risk | click | e0 Continue | - | - | **true** |
| shadow-confirm-modals-03 | confirm-modals/index.html | 2 | op, tgt, comp, risk | click | e0 Delete permanently | false | - | **true** |
| shadow-custom-dropdowns-01 | custom-dropdowns/index.html | 3 | op, tgt, comp, stuck | click | e4 Large | false | false | - |
| shadow-custom-dropdowns-02 | custom-dropdowns/index.html | 9 | op, tgt, comp | none | none | **true** | - | - |
| shadow-kanban-moves-01 | kanban-moves/index.html | 1 | op, tgt, comp | click | e2 Done (menu item) | false | - | - |
| shadow-kanban-moves-02 | kanban-moves/index.html | 7 | comp, stuck | - | - | false | **true** | - |
| shadow-tabbed-toggles-01 | tabbed-toggles/index.html | 1 | op, tgt, comp, stuck | click | e1 Notifications | false | false | - |
| shadow-tabbed-toggles-02 | tabbed-toggles/index.html | 3 | op, tgt, comp, risk | click | e2 Privacy | false | - | false (switch tab) |
| shadow-invoice-lookup-01 | invoice-lookup/index.html | 1 | op, tgt, comp, stuck | type_text | e0 Invoice ID | false | false | - |
| shadow-invoice-lookup-02 | invoice-lookup/index.html | 3 | op, tgt, comp, stuck | none | none | **true** | false | - |
| shadow-paginate-find-01 | paginate-find/index.html | 1 | op, tgt, comp, stuck | click | e1 Next | false | false | - |
| shadow-paginate-find-02 | paginate-find/index.html | 5 | comp, stuck, risk | - | - | false | **true** | false (Next) |
| shadow-search-detail-01 | search-detail/index.html | 0 | op, tgt, comp, risk | type_text | e0 Search products | false | - | false (type search) |
| shadow-search-detail-02 | search-detail/detail.html | 5 | op, tgt, comp | click | e1 Add to list | false | - | - |
| shadow-settings-change-01 | settings-change/index.html | 1 | op, tgt, comp | check_box | e1 Weekly digest | false | - | - |
| shadow-settings-change-02 | settings-change/index.html | 2 | op, tgt, comp, risk | click | e2 Save | false | - | **true** |
| shadow-ticket-triage-01 | ticket-triage/index.html | 0 | op, tgt, comp | click | e3 OPS-226 | false | - | - |
| shadow-ticket-triage-02 | ticket-triage/index.html | 2 | op, tgt, comp, risk | click | e12 In Progress | false | - | false (unsaved option) |
| shadow-wizard-submit-01 | wizard-submit/index.html | 3 | op, tgt, comp | type_text | e3 Seats | false | - | - |
| shadow-wizard-submit-02 | wizard-submit/index.html | 5 | op, tgt, comp, risk | click | e1 Submit (review step) | false | - | **true** |

**Coverage:**
- Kinds asked: operation 22, target 22, completion 24, stuck 10, risk 9.
- Operation labels: click 15, type_text 3, check_box 2, `none_of_the_above` 2.
- Near-miss distractors are built into the pages:
  - Q3 final forecast next to Q3 draft forecast;
  - X-Large next to Large;
  - the 16 oz blue mug and the stainless 12 oz travel mug;
  - OPS-233, a billing ticket of Dana's that is already Done;
  - the paid Northwind invoices;
  - the Doing column next to Done.

## Task Commits

1. **Task 1: record schema, loader and lock-reference check (TDD)**
   - `09962c24` (test, RED)
   - `e457624b` (feat, GREEN)
   - `c4aca564` (feat, Rule 2 addition: stale recent-action ids, with its test)
2. **Task 2: 13 click-fixture records and the click test section:** `fd910a04`
3. **Task 3: 12 mixed-fixture records and the whole-set coverage assertions:** `b26e9410`

No refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] validateRecord checks that the request is in the form the extension would send**
- **Found during:** Task 1
- **Issue:** Both validators accept requests the extension builder can never emit:
  - unscrubbed card or key text in labels or page text;
  - an injection phrase in the title;
  - an origin with an explicit default port such as `:80`;
  - a request over the 20,000-byte client budget.

  Truth 1 says each record holds the sanitized request "exactly as the extension would send it".
- **Fix:** After both validators accept a request, `validateRecord` checks four things:
  - `scrubText` and `filterInjection` leave the title, text, labels and roles unchanged;
  - `toOriginPath` round-trips the origin and path;
  - recent-action target ids are current;
  - the request fits the byte budget.

  Each check has its own test case.
- **Files modified:** `scripts/bench/shadow/lib/records.mjs`, `tests/jev-shadow-records.test.mjs`
- **Commits:** `e457624b`, `c4aca564`

**2. [Rule 2 - Correctness] Recent-action targets must be null or a current element id**
- **Found during:** Task 2, while writing the confirm-modals dialogs
- **Issue:** The server only shape-checks `recentActions[].targetId`. The 67-06 builder maps a target that is no longer listed to `null`, so a record carrying a stale `e2` after a dialog opens would not be a real request.
- **Fix:** Added the check, written test first, and wrote every seed record that way: a target that left the snapshot or a page that navigated becomes `null`.
- **Commit:** `c4aca564`

**3. [Minor] loadRecords freezes the returned array too**
- `loadTasks` freezes each task but not the array. The plan asks for "deep-frozen records", and the test asserts the whole result is frozen, so `loadRecords` freezes the array as well.
- Plan 67-12 must therefore copy the array before sorting or slicing it in place. `slice` works on a frozen array.

**4. [Minor, additive API] More exports than the interfaces block lists**
- The extra exports are `CORE_LOCK_PATH`, `readCoreLock`, `RECORD_ID_PATTERN` and `NOTE_MAX_CHARS`.
- `checkLockReferences` accepts either the parsed lock or its `tasks` array. Its `lock` argument defaults to the on-disk lock.
- Every export named in the plan exists with the planned signature.

**5. [Minor, test scope] Per-record seed rules beyond the plan's list**
- The test also checks the following:
  - the goal equals the task instruction;
  - the path is one of the task's fixture pages;
  - every title, text and label word occurs in the fixture files or the goal (pure numbers are skipped, because prices and page counts are computed at runtime);
  - element ids are `e0..eN`;
  - element ops are offered;
  - `go_back` is offered only after a navigation;
  - stuck and completion labels are consistent with the recent actions and success markers;
  - steps increase within each fixture.
- A deliberate invented label (`Archive` in checklist-01) was confirmed to fail the suite and was then reverted.
- The goal counts as a word source because the wizard review step echoes the typed account name ("Acme Robotics").

### Plan-anticipated intermediate state

- At `e457624b` and `c4aca564`, the real-directory test failed because `scripts/bench/shadow/records/` did not exist yet. The plan's Task 1 acceptance expects this ("Task 1 alone: the unit cases pass"), and `fd910a04` turned it green.

### Excerpt choices (within the 600-character rule)

- **invoice-lookup.** The full table is 645 characters. Both records keep the header and the first 13 rows. The two dropped rows are INV-1063, a $1,270.00 unpaid Northwind invoice below INV-1029, and INV-1068, a Tailspin invoice, so neither changes the answer. Record -01 ends with the review-form labels and -02 with `Selected for review: INV-1029`.
- **ticket-triage.** Record -01 keeps the header and the first 6 rows, which include OPS-226 and the near-miss OPS-233. Record -02 shows the page heading and the detail panel only.

## Issues Encountered

None beyond the word-source finding in deviation 5, which the provenance check caught on the first full run.

## Verification

- `node --test tests/jev-shadow-records.test.mjs`: 32 passed, 0 failed, on Node 24.14.1 and on the official Node 20.20.2 binary.
- Plan acceptance commands:
  - `ls scripts/bench/shadow/records/*.json | wc -l` gives 25.
  - The origin and path one-liner exits 0.
  - `git diff --quiet -- scripts/bench/tasks scripts/bench/lib` exits 0.
  - `grep -nE "writeFileSync|appendFileSync" scripts/bench/shadow/lib/records.mjs` prints nothing.
  - The `core.lock.json` SHA-256 is identical before and after the suite. Both the last test and the whole-set test assert this.
- **Instrument probe (not committed).** All 25 requests go through `buildUpstreamBody(request, {model})` from `showcase/server/src/jev/instrument.js`:
  - none is shrunk;
  - the question keys equal `request.kinds`;
  - the largest body is 4,564 bytes.
- **Neighbouring suites:**
  - `tests/jev-shadow-score.test.mjs`: 16 passed;
  - `tests/jev-shadow-select.test.mjs`: 17 passed;
  - `tests/bench-corpus.test.mjs`: 17 passed;
  - `tests/delegation-phase-contract.test.js`: 1224 passed, 0 failed;
  - `tests/server-no-ip-leak.test.js`;
  - the repo-scanning `agent-provider-forbidden-flags`, `phase60`/`phase64`/`phase65` full-tests harnesses and `mcp-native-host-packaging` all exit 0.
- **No full tolerant-chain sweep was run.** The plan only adds files, nothing in the `npm test` chain loads them, and `package.json` is untouched (67-13 registers the suite). This follows the 67-01 and 67-06 precedent.
- None of the five commits carries an attribution line.

## Known Stubs

None. Every record is complete. The seed set is deliberately small (D-26): V3 grows it with `recorded-llm` records in the same format (M-67-08).

## Deferred to Validation Block

Deferred: M-67-08, M-67-09 (Validation Block V3).
- **M-67-08 (V3).** Gather enough additional labelled records, mostly `recorded-llm` from Phase 68 and later runs, to reach about 60-130+ above-cut readings per question. Records go into `scripts/bench/shadow/records/` in this format. `validateRecord` already holds them to the sanitized form and the lock.
- **M-67-09 (V3).** Run live shadow on these and later records through the deployed gateway against the V2 pin.

Nothing in this plan needs a human, a live account, production or spend.

## User Setup Required

None.

## Next Phase Readiness

- **67-12 (harness)** can call `loadRecords()` and read `record.id`, `record.task.id`, `record.request` and `record.labels`.
  - Requests feed `FsbJevClient.decide` and `buildUpstreamBody` unchanged.
  - The recorded-answers file needs one entry per seed record, 25 in all.
  - Probability keys must stay within each request's own `offeredOps` or element ids plus `none_of_the_above` (the 67-06 response validator rule). The two `none_of_the_above` Choice labels on completion positives are legitimate picks.
  - Four records are risk-positive: confirm-modals-02 and -03, settings-change-02 and wizard-submit-02.
- **67-13** must add `node --test tests/jev-shadow-records.test.mjs` to the `package.json` `test` chain and to `REFINEMENT_ROOT_TEST_COMMANDS` in `tests/delegation-phase-contract.test.js`.
- **A fixture change** (a version bump and a regenerated lock) makes `checkLockReferences` fail for that fixture's records until they are reviewed and re-pinned. This is intended (T-67-12).

---
*Phase: 67-hosted-jev-gateway-policy-and-shadow-mode*
*Completed: 2026-10-17*

## Self-Check: PASSED

The module, the test, all 25 record files and this SUMMARY exist. All five task commits (09962c24, e457624b, c4aca564, fd910a04, b26e9410) are in history, and none carries an attribution line. The kind and label counts in this SUMMARY were recomputed from `loadRecords()`. STATE.md, ROADMAP.md and REQUIREMENTS.md were left to the orchestrator.
