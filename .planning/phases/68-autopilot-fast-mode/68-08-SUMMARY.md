---
phase: 68-autopilot-fast-mode
plan: 08
subsystem: service-worker + bench tooling
tags: [jev, fast-mode, capture, recorded-llm, shadow, exporter, bench, cdp, d-03, d-06, d-22, f5, f6, t-68-11, t-68-17, t-68-18, auto-02, auto-03]

# Dependency graph
requires:
  - phase: 68-03
    provides: "getJevMenu options.capture arming and FSB.noteJevCaptureObservation (content message {action:'jevCaptureObservation', generation, handle, resolved, tool})"
  - phase: 68-05
    provides: "beforeTurn / observeTools / lastLlmTools and the declineWith LLM-path exits"
  - phase: 68-06
    provides: "fsbCreateFastPathDeps (getTabUrl), BACKGROUND_JEV_TOKENS, the loop harness"
  - phase: 67-10
    provides: "scripts/bench/shadow/lib/records.mjs validateRecord / checkLockReferences / readCoreLock / SHADOW_RECORDS_ROOT"
provides:
  - "FsbFastPath capture: gate, one held capture per LLM-path iteration, labelling at the next beforeTurn, FsbFastPath.noteCaptureObservation(session, payload)"
  - "background.js: deps readCaptureArm / appendCaptureRecord / noteCaptureDrop, fsbFastPathCaptureWrite (one serialized ring writer), case 'jevCaptureObservation'"
  - "scripts/bench/shadow/export-capture.mjs: deriveRecords, parseArgs, main, DEFAULT_OUT_DIR"
  - "tests/jev-fast-capture.test.mjs (registered in the root chain and REFINEMENT_ROOT_TEST_COMMANDS)"
affects: [68-09, 68-11, V3, V4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A wrapper around the 68-05 attempt: label the previous capture first, run the attempt unchanged, then capture only if the iteration declined to the LLM"
    - "Capture writes are handed off without awaiting; the background serializes them on one promise chain kept on the writer function"
    - "Exporter ring fixtures come from the real module's capture path driven with fake deps, not hand-written records"

key-files:
  created:
    - scripts/bench/shadow/export-capture.mjs
    - tests/jev-fast-capture.test.mjs
    - .planning/phases/68-autopilot-fast-mode/68-08-SUMMARY.md
  modified:
    - extension/ai/jev-fast-path.js
    - extension/background.js
    - tests/jev-extension-boundary.test.js
    - tests/jev-fast-path.test.js
    - tests/jev-fast-start-path.test.js
    - tests/jev-fast-loop.test.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The fast attempt asks for its one menu with capture:true when the capture gate passes; a declined iteration reuses that menu, an acted step holds no capture, so every LLM-path iteration costs at most one menu"
  - "Capture state is added lazily (_fastPath.capturePending, agentState.jevFast.captureArmed and captureFirstUrl), so the 68-05 documented key sets hold whenever the capture deps are absent"
  - "An observation counts only when its content verb equals the label tool's _contentVerb; anything else is target_unknown, never a guessed none_of_the_above"
  - "The background case uses only a message whose keys are exactly action, generation, handle, resolved and tool, and forwards a new four-key object"
  - "--arm off removes fsbJevCaptureArmed, so M-68-05's 'arm key unset' is literal"
  - "Exported record step is the capture's 0-based iteration (iteration - 1)"

patterns-established:
  - "New background.js jev text goes through BACKGROUND_JEV_TOKENS with probes in the same commit (now five tokens)"
  - "Bench exporters refuse an --out inside scripts/bench/shadow/records or scripts/bench/tasks and never overwrite an existing output"

requirements-completed: [AUTO-02, AUTO-03]

# Metrics
duration: 21min
completed: 2026-10-17
---

# Phase 68 Plan 08: recorded-llm capture and exporter Summary

**On an armed bench run the service worker now records, before each LLM turn, what fast mode would have offered (the goal-free builder input of one menu) and labels it at the next turn with the LLM's own tool and the target the content script observed. Records land in a bounded local ring that is never sent anywhere. A bench script turns the ring into validated 67-10 `recorded-llm` records under the gitignored `.local` tree. Capture never asks Jev, never acts and runs only on loopback fixture pages; without the arm key a command pays one storage read.**

## Performance

- **Duration:** about 21 min
- **Started:** 2026-10-17T11:02:13Z
- **Completed:** 2026-10-17T11:23Z
- **Tasks:** 2 of 2
- **Files:** 3 created (including this summary), 8 modified

## Accomplishments

### The capture gate (D-22, D-03, RESEARCH Open Question 2)

A capture runs for an iteration only when every condition below holds, checked in this order:

1. **Synchronous checks:** `session.fastMode.stored === true` (run_task sessions carry `{enabled:false, stored:true, source:'mcp'}`, so capture keys on the page, not the source), the deps carry all capture members, and the iteration runs on the LLM path.
2. **The arm:** `deps.readCaptureArm()`, read at most once per command and cached on `agentState.jevFast.captureArmed`. A throw, a rejection or any value other than boolean `true` counts as unarmed for the whole command.
3. **The tab URL:** `deps.getTabUrl(tabId)`, read on every armed LLM-path iteration, because a bench task opens its fixture page with its first action. It must match `^http://(127\.0\.0\.1|localhost):\d+/r/[^/]+/fixtures/[a-z0-9-]+/`.
4. **The stored switch:** `deps.readSwitch()`. It is not read a second time when the fast attempt has already read it as on.

A stop after any await ends capture for that iteration with nothing held (F21).

**Measured cost** ("capture gate cost" checks):
- **Unarmed run_task command, switch on, non-fixture page, 5 iterations:** 1 readCaptureArm call, and zero getTabUrl, readSwitch, requestMenu, requestSnapshot and decide calls.
- **Two such commands:** 2 readCaptureArm calls.
- **Armed command on a non-fixture page:** one getTabUrl call per LLM-path iteration, and never a readSwitch or requestMenu.

**One menu per LLM-path iteration:**
- **Gate passes in a fast attempt:** the attempt asks for its menu with `capture:true`.
- **The attempt then declines:** the iteration reuses that menu.
- **The attempt acts:** nothing is held, and the fast step's own observation is ignored.
- **Every other LLM-path iteration** (first turn, latched, run_task) requests one capture menu with `capture:true`. This happens after any hand-off flush.

### The held capture and the ring record

**Held capture:** `_fastPath.capturePending = {command, generation, observation, llmTools, record}`.
- `observeTools` sets `llmTools`.
- `noteCaptureObservation` sets `observation` once. It accepts a payload only when the payload's keys are exactly `{generation, handle, resolved, tool}`, the generation is the held one, and each field has its documented type.

**Record:** `{v:1, capturedAt, command, iteration, url, menuCap, entryCount, builderInput:{title, visibleText, elements, vaultFilledIds, recentActions, offeredOps}, label:{op, target}}`.
- `url` is origin plus path only.
- `elements` carry only `{id, role, label, ops, inputType, autocomplete, purpose:{sensitive}, hidden}`.
- There is no goal, no task text and no hash key.
- The `go_back` offer uses a capture-only first URL (`captureFirstUrl`), so capture never changes the fast path's own state.

**Labels (assigned at the next beforeTurn):**
- **op:** the first tool other than `report_progress` when it is in the record's `offeredOps`; otherwise `none_of_the_above`.
- **target:**
  - a tool whose TOOL_REGISTRY schema has no `selector` property gets `none_of_the_above`;
  - an element tool gets the observed handle, provided the observation resolved and its content verb equals the tool's `_contentVerb`;
  - an element tool whose call resolved outside the menu gets `none_of_the_above`.

**Ring:** `{v:1, records:[...], drops:{<reason>:n}}` under `fsbJevCaptureRing`.
- It keeps the newest 200 records.
- Every write goes through `fsbFastPathCaptureWrite`'s single promise chain.
- A failed or late read skips the change rather than overwrite the ring.
- `fsbJevCaptureArmed` and `fsbJevCaptureRing` are plain storage keys used only in background.js. They are not settings and not `FsbSettingsSchema` keys, and the module never names them.

### Drop reasons

| Where | Reason | When |
| --- | --- | --- |
| module, holding | `menu_unavailable` | no menu, `success !== true`, or a rejected request |
| module, holding | `menu_invalid` | no generation, or toBuilderInput reports `menu_invalid` |
| module, holding | `url_changed` | the menu's own URL is not a loopback fixture page |
| module, holding | `nothing_offerable` | fast mode would offer nothing on this menu |
| module, labelling | `stale_command` | the held capture belongs to an earlier command |
| module, labelling | `no_tool_call` | observeTools never ran for that iteration |
| module, labelling | `progress_only` | the turn called only `report_progress` |
| module, labelling | `unknown_tool` | the tool is not in TOOL_REGISTRY |
| module, labelling | `target_unknown` | an element tool whose observation is missing, unresolved or from another verb |
| exporter | `malformed`, `not_fixture_url`, `unknown_slug`, `ambiguous_slug`, `not_in_lock`, `goal_unavailable`, `unlabelled`, `target_unknown`, `build_<reason>`, `slug_limit`, `token_in_record`, `invalid_record`, `lock_mismatch` | see export-capture.mjs. The last two are defensive. |

### Background (Task 1)

- **Capture deps:** `fsbCreateFastPathDeps` gains `readCaptureArm`, which reads `fsbJevCaptureArmed` under a 3000 ms deadline. It also gains `appendCaptureRecord` and `noteCaptureDrop`, both through `fsbFastPathCaptureWrite`. A drop reason outside `^[a-z][a-z0-9_]{0,63}$` is counted as `other`. Creating the deps still calls nothing.
- **The message case:** `case 'jevCaptureObservation': { ... }` is braced and sits right before `contentScriptReady`.
  - It requires `sender.frameId === 0`, a numeric tab id and the exact five-key message.
  - It builds a new `{generation, handle, resolved, tool}` object and passes it to `FsbFastPath.noteCaptureObservation` for every active session on that tab that has `_fastPath`. An observer that throws is contained.
  - It always responds `{success:true}`.
- **Unchanged:** there is no importScripts change (338/334), and no new comment contains `importScripts` or a jev substring.
- **Boundary suite:** `BACKGROUND_JEV_TOKENS` is exactly `['fsbJevFastModeEnabled', 'getJevMenu', 'fsbJevCaptureArmed', 'fsbJevCaptureRing', 'jevCaptureObservation']`. New probes confirm that `fsbJevCaptureOther`, `fsbJevCaptureArmedX`, `xjevCaptureObservation`, `// jev capture` (alone and after an allowed token) and `captureJev` are still reported.

### Exporter (Task 2): `scripts/bench/shadow/export-capture.mjs`

**`deriveRecords(ring, {tasks, lock, run})`** is pure. For each capture, in order, it:
1. rewrites the origin to `http://127.0.0.1:4173`;
2. strips the `/r/<any segment>` run prefix (`[REDACTED_TOKEN]` included), the query and the fragment;
3. maps the slug to the core task through each task's `startPath`, and the task to its lock entry;
4. sets the goal to the instruction minus `Open {startUrl}.`;
5. rebuilds the request with `FsbJevState.buildRequest` and kinds `['operation','target']`;
6. maps the labels through `idMap`, so a handle the builder dropped becomes `none_of_the_above`;
7. sets completion, stuck and risk to `null`, provenance to `'recorded-llm'` and the id to `shadow-<slug>-llm<run>-<nn>` (nn is 01..99 per slug, in capture order);
8. runs `validateRecord` and then `checkLockReferences`.

The result carries the records, the exporter's drop counts and the ring's own drop counters.

**CLI:**

| Flags | Effect |
| --- | --- |
| `--input <ring.json>` | Reads the ring itself or `{fsbJevCaptureRing: ring}`. |
| `--port <n> --extension-id <id>` | Reads the ring with `findExtensionWorker` and `evaluate(chrome.storage.local.get(['fsbJevCaptureRing'])...)`. The wake tab is always closed through `closeTargets`. |
| `[--out <dir>] [--run <id>]` | Optional with either input mode. |
| `--arm on` | Sets only `fsbJevCaptureArmed: true` and writes no file. |
| `--arm off` | Removes only `fsbJevCaptureArmed` and writes no file. |

**Exit codes and guards:**
- Usage errors (a missing argument, an unknown or repeated flag, a malformed value, mixed modes) exit 2. Other failures exit 1.
- `DEFAULT_OUT_DIR` is `'scripts/bench/.local/shadow/recorded-llm'`. An `--out` inside `scripts/bench/shadow/records` or `scripts/bench/tasks` is refused.
- An existing output file is never overwritten: there is a pre-check plus the `wx` write flag.
- A JSON parse error never echoes the input.
- The tool prints a one-line summary with the written and dropped counts and the ring drops.
- Imports are `node:` modules and repo modules only. No new dependency. cdp.mjs, tasks.mjs, outcome.mjs, records.mjs and `scripts/bench/tasks/` are unchanged.

## Task Commits

1. **Task 1:** `19858228`, `feat(68-08): capture recorded-llm labels on armed loopback bench pages without calling Jev`. Six files: the module, background.js and four suites.
2. **Task 2:** `7dbacf07`, `feat(68-08): export captured LLM steps as recorded-llm shadow records`. Four files: the exporter, its suite, package.json and the refinement list.

Neither commit carries an attribution line.

## Verification

**Suites, Node 24:**

| Suite | Result |
| --- | --- |
| `node tests/jev-fast-path.test.js` | 920 / 0 (it was 819 before 68-08; this includes "capture gate cost") |
| `node tests/jev-fast-start-path.test.js` | 153 / 0 (includes "capture end to end") |
| `node tests/jev-fast-loop.test.js` | 278 / 0 |
| `node tests/jev-extension-boundary.test.js` | 174 / 0 |
| `node --test tests/jev-fast-capture.test.mjs` | 11 / 11 |
| `node --test tests/jev-fast-capture.test.mjs tests/jev-shadow-records.test.mjs tests/jev-shadow-harness.test.mjs` | 66 / 66, with the 25 hand records intact |

**Node 20:** the fast-path, start-path, loop, boundary and capture suites pass under `npx --offline -y node@20` (v20.20.2). The fast-path and capture suites also pass under `/tmp/fsb-node20/.../node`.

**Task 1 pin suites:** these all exit 0:
- lattice-provider-bridge-smoke (112/0);
- `npm run validate:extension`;
- delegation-phase-contract (1245/0 after Task 2);
- mcp-version-parity and mcp-bridge-background-dispatch;
- `node --test tests/bench-drivers.test.mjs tests/bench-identity.test.mjs`;
- jev-fast-menu, jev-fast-upstream-contract, jev-policy-tighten-only, meta-cognitive-tracker, jev-fast-settings and settings-schema.

**Sweep:** `--files extension/background.js extension/ai/jev-fast-path.js` passed 94/94 with no new failures against 68-SWEEP-BASELINE.json.
- Port 7225 was held by the user's hub and left alone.
- The crawler files never changed.

**Related root-chain commands:** all 27 jev, bench and pin commands in the root chain were run together at the end, and all exit 0.

**Acceptance greps:**
- The jev grep of background.js outside the load lines and the five tokens prints nothing.
- `case 'jevCaptureObservation'` appears once, and the FsbSettingsSchema `node -e` check exits 0.
- importScripts counts are still 338/334.
- `decide(` still appears 7 times in the module, as after 68-05.
- Every 68-04 ban grep prints nothing.
- `FAST MODE HAND-OFF` still appears once.
- observeTools contains no await.
- `scripts/bench/.local/shadow/recorded-llm` appears twice in the exporter, and the `writeFileSync(...shadow/records` grep prints nothing.
- `git status --porcelain -- scripts/bench/shadow/records scripts/bench/tasks scripts/bench/lib` prints nothing.
- The package.json registration check exits 0.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - T-68-11] The menu's own URL is checked again before a capture is held**
- **Found during:** Task 1
- **Issue:** The gate checks the tab URL before the menu request, but the page can navigate between that read and the menu.
- **Fix:** A held capture also requires the menu's own URL to be a loopback fixture page. Otherwise the capture is dropped as `url_changed`.
- **Commit:** 19858228

**2. [Rule 2 - T-68-17] An observation must come from the label tool's content verb**
- **Found during:** Task 1
- **Issue:** A tool that has a `selector` parameter but is not content-routed sends no observation. The next content action's observation would then label the wrong call.
- **Fix:** The observation's `tool` must equal the label tool's `_contentVerb`. Otherwise the record is dropped as `target_unknown`.
- **Commit:** 19858228

**3. [Rule 2 - truthful labels] Drop reasons beyond the two the plan named**
- **Found during:** Task 1
- **Added reasons:** `no_tool_call`, `progress_only`, `unknown_tool`, `menu_unavailable`, `menu_invalid`, `nothing_offerable` and `url_changed`, alongside the plan's `target_unknown` and `stale_command`.
- **Why:** each covers a turn with no label that can be inferred truthfully, so it is counted instead of guessed.
- **Commit:** 19858228

**4. [Plan detail] The background case requires the exact five-key message**
- **Found during:** Task 1
- **Issue:** The behaviour bullet "the same message with an extra key added at the content side leaves the pending capture unlabelled" cannot hold if the case rebuilds the four keys from any message.
- **Fix:** The case accepts only `action, generation, handle, resolved, tool` and then forwards a new four-key object.
- **Commit:** 19858228

**5. [Plan detail] Capture writes are not awaited, and the ring writer never overwrites on a failed read**
- **Found during:** Task 1
- **Fix:**
  - The module hands records and drops to the deps without awaiting, and swallows throws and rejections, so capture never slows or fails an iteration.
  - The background writer skips a change whose storage read failed or timed out, so an existing ring is never reset.
- **Commit:** 19858228

**6. [Plan detail] The run_task loop case allows exactly one arm read**
- **Found during:** Task 1
- **Issue:** The 68-06 run_task case compared the whole run with the golden. The planned arm read adds one `storage-get ['fsbJevCaptureArmed']` event.
- **Fix:** The case now asserts exactly that one read, no tab read and no storage write. The rest of the run still equals the golden. The golden was not regenerated.
- **Commit:** 19858228

**7. [Plan detail] Exporter choices the plan left open**
- `--arm off` removes the key instead of setting it to false.
- `step` is `iteration - 1`.
- An `--out` inside the records or the task corpus is refused.
- Existing outputs are never overwritten.
- `token_in_record` drops any record whose text still holds the captured run segment.
- A `{fsbJevCaptureRing: ring}` input wrapper is accepted.
- The exporter suite builds its ring with the real module's capture path over fake deps, which is stronger than hand-written 68-02-style inputs.
- **Commit:** 7dbacf07

**8. [Rule 1 - test hygiene] The guard test cleans up after itself**
- **Found during:** Task 2 (mutation spot-check E8)
- **Issue:** With the `--out` guard removed, the guard test wrote 7 files into `scripts/bench/shadow/records/`.
- **Fix:** Those 7 untracked files were removed by name. The test now deletes any `-llmguard-NN.json` it may have written, in its `finally` block. The same mutation now fails the test and leaves the directory at 25 files.
- **Commit:** 7dbacf07

**9. [TDD commit shape] RED observed, RED and GREEN in one feat commit per task**
- **Why:** the suites are in the root chain, so a red `test(...)` commit would break the chain (as in 68-02 to 68-06).
- **Task 1 RED:** 27 failing checks in tests/jev-fast-path.test.js before any module code.
- **Task 2 RED:** the suite failed with the exporter moved aside.
- **Commits:** 19858228, 7dbacf07

---

**Total deviations:** 9. Two close T-68-11 and T-68-17 gaps, one keeps labels truthful, three settle the plan's open details, one is test hygiene, and one concerns commit shape. **Impact:** no rule was loosened, and every acceptance criterion holds as written.

## TDD Gate Compliance

There is no separate `test(68-08)` commit (deviation 9). RED was observed for both tasks.

**Mutation spot-checks** were run over byte-restored files, and SHA-256 was verified after each one:
- **Task 1:** 14 of 14 mutations were caught:
  - forwarding the raw message;
  - no frame check;
  - no exact-key check;
  - unchained ring writes;
  - an uncapped ring;
  - the arm not cached;
  - no verb match;
  - the fast menu never sent with `capture:true`;
  - https accepted;
  - an unresolved observation becoming `none_of_the_above`;
  - no `stale_command`;
  - a second observation overwriting the first;
  - the gate reading the switch twice;
  - capture on an acted step.
- **Task 2:** 8 of 9 mutations were caught:
  - the goal keeping its prefix;
  - https accepted;
  - the default out set to the committed records;
  - the wake tab not closed;
  - no token check;
  - no per-slug limit;
  - no `--out` guard;
  - a dropped handle kept.

  The ninth, removing the overwrite pre-check, changes no behaviour: the `wx` flag still refuses the overwrite before any file is written.

## Known Limitations

- **The last LLM turn of a command is never labelled.** On `complete_task` or `end_turn`, runAgentIteration returns before `observeTools`, and no further beforeTurn runs. That turn's held capture is discarded, or counted as `stale_command` if a follow-up command arrives. Each bench run therefore loses one record, its terminal turn. Recording it would need a new hook at session end; it is noted for V3 (M-68-03).
- **`lock_mismatch` and `invalid_record` cannot fire today.** Each record's task reference is taken from the lock entry, and the request comes from `buildRequest`. Both checks are kept as fail-closed guards.

## Known Stubs

None.

## Threat Flags

None. The new runtime message case is the content-to-service-worker path listed under T-68-11 ("bench page -> capture ring"). It accepts only exact main-frame messages from the extension's own content scripts, because the handler's sender-id check runs first.

## Deferred to Validation Block

- **M-68-03 (V3):** run bench campaigns with the switch on and `export-capture.mjs --arm on`. Export to `scripts/bench/.local/shadow/recorded-llm/`, read the drop counts by reason (ring and exporter), and assemble a run directory with the 67-10 hand seeds for `run-shadow --records DIR`. Afterwards, run `--arm off`.
- **M-68-04 (V3):** decide where `recorded-llm` records are committed, given 67-10's exactly-25-hand-records assertion. The exporter writes only to `.local` until then.
- **M-68-05 (V4):** confirm the arm key is unset in every arm (`--arm off` removes it).

Deferred: M-68-03, M-68-04 (V3), M-68-05 (V4)

## User Setup Required

None.

## Next Phase Readiness

- **68-09:** the measurement projection is untouched by capture. Capture adds no `jevMeasurement` entry and no session message.
- **68-11 (phase gate):** add `npx --offline -y node@20 --test tests/jev-fast-capture.test.mjs` to the Node 20 sweep. The new suite is already in the root chain.

## Self-Check: PASSED

- FOUND: scripts/bench/shadow/export-capture.mjs, tests/jev-fast-capture.test.mjs, extension/ai/jev-fast-path.js, extension/background.js, tests/jev-extension-boundary.test.js, tests/jev-fast-path.test.js, tests/jev-fast-start-path.test.js, tests/jev-fast-loop.test.js
- FOUND: commits 19858228 and 7dbacf07 on branch Jev; neither carries an attribution line
- scripts/bench/shadow/records/ holds exactly 25 files; scripts/bench/tasks and scripts/bench/lib are unchanged
