---
phase: 68-autopilot-fast-mode
plan: 03
subsystem: content-scripts
tags: [jev, fast-mode, strict-resolver, content-verb, messaging, capture, auto-02, auto-05, d-14, d-19, d-22, f15, f16, f17]

# Dependency graph
requires:
  - phase: 68-02
    provides: "FSB.buildJevMenu, FSB.jevMenuLabel, FSB.jevElementOps, FSB.classifyJevRisk, FSB.jevRefMap (generation, get, findHandle), FSB.vaultFilledElements, the marked dom-analysis.js block and the stub kit"
  - phase: 68-01
    provides: "68-SYNC-RECHECK.md (P68_START ba745cfe, drift substitutions) and 68-SWEEP-BASELINE.json"
provides:
  - "FSB.jevContentVerbOps: frozen {click:'click', toggleCheckbox:'check_box', pressEnter:'press_enter', hover:'hover'} (content verb -> menu op)"
  - "FSB.resolveJevHandle(params, tool) -> {ok:true, element, selector} | {ok:false, reason}: strict, fallback-free target resolution"
  - "FSB.noteJevCaptureObservation(tool, params): one-shot armed capture observation, runtime message {action:'jevCaptureObservation', generation, handle, resolved, tool}"
  - "messaging.js: getJevMenu content message (sync switch), the jev branch first in executeAction, the armed capture guard at the VIS-01 point"
  - "tests/jev-fast-menu.test.js: 130 checks (54 new): resolver, verb-table parity, messaging slices, getJevMenu, real executeTool dispatch, capture observation"
affects: [68-04, 68-05, 68-06, 68-07, 68-08, 68-11, V5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Messaging slices: the executeAction case text from its label to `if (FSB.tools[tool]) {` (or through the capture guard) is compiled inside a function in the vm content context with stubbed FSB, sendResponse, document and logger; 'continued' means it fell through to the tool handler"
    - "Async check queue at the suite tail (checkAsync / sectionAsync) for the real executeTool dispatch path and the rejected-promise case"
    - "Mutation spot-checks per rule (raw verb vs ops, no viewport check, XPath accepted, no return, no risk recheck, non-unique selector, no disarm, no .catch, no generation check, selector leak), each caught, file restored byte-for-byte"

key-files:
  created: []
  modified:
    - extension/content/dom-analysis.js
    - extension/content/messaging.js
    - tests/fixtures/jev-content-dom-kit.js
    - tests/jev-fast-menu.test.js

key-decisions:
  - "getJevMenu lives in the synchronous switch of handleBackgroundMessage (after the executeAction placeholder case), not next to getMarkdownSnapshot in handleAsyncMessage: the async switch is reachable only through the router line that lists executeAction/getDOM/getMarkdownSnapshot/readPage, and editing that line would break the purely-additive rule; buildJevMenu is synchronous"
  - "Resolver check order: conflict, handle shape, registry present, generation, entry, alive+connected, role, name, op of the content verb, risk, actionability, in-viewport centre, unique selector (ops before risk, so the behaviour list's reason codes hold; both refuse)"
  - "conflicting_target fires for any defined selector or ref value, including null and ''"
  - "A missing registry is refused as 'unavailable'; the messaging branch also maps a missing or throwing resolver to 'unavailable' with refStale:true"
  - "getJevMenu arms capture only when capture === true AND the menu built (success true); anything else, including a failed menu, disarms"
  - "The capture observation disarms before sending, so a throwing or rejected sendMessage still leaves it one-shot"

patterns-established:
  - "Fast-mode params the content side reads: jevHandle, jevGeneration, expectedRole, expectedName (68-04 buildStaticCall must send expectedRole/expectedName equal to the menu entry's role and label, and must not send selector or ref keys at all)"
  - "A refStale response from the jev branch carries `reason`; 68-04 classifyStepEvidence reads nested refStale as 'stale'"

requirements-completed: [AUTO-02, AUTO-05]

# Metrics
duration: 8min
completed: 2026-10-17
---

# Phase 68 Plan 03: Strict fast-mode target resolution and capture observation Summary

**A fast-mode action now runs only on the exact element FSB offered in the current menu generation. `executeAction` checks `jevHandle` before any other target resolution. A strict resolver re-verifies the element's identity, role, name, operation, risk, actionability, viewport position and selector uniqueness, and on any failure it answers `refStale:true` with a reason and returns before the focused-element fallback. A `getJevMenu` message serves the 68-02 menu. While a capture menu is armed, the next action's target is reported once to the service worker as a menu handle. Calls without `jevHandle` are unchanged.**

## Performance

- **Duration:** about 8 min of execution (09:15Z to 09:23Z), plus context reading
- **Started:** 2026-10-17T09:15Z
- **Completed:** 2026-10-17T09:23Z
- **Tasks:** 2 of 2
- **Files modified:** 4

## Accomplishments

- **Strict resolver (D-14, D-19, F15, F16, T-68-03).** `FSB.resolveJevHandle(params, tool)` sits in the 68-02 marked block. It reuses `jevMenuRole`, `jevMenuLabel`, `jevElementOps`, `classifyJevRisk` and `jevCentreInViewport`. It never calls `resolveRef` and never uses a selector the caller supplied. On success it returns the first non-XPath candidate from `FSB.generateSelectors(el)` whose `document.querySelectorAll` result is exactly that one element.
- **Content-verb table (AUTO-02).** The service worker sends `tool: tool._contentVerb` (tool-executor.js:117-121), so the resolver looks the verb up in the frozen `FSB.jevContentVerbOps` with `hasOwnProperty`. It then requires the mapped op to be in the element's current code-derived ops. A Jev op name passed as a verb (`check_box`, `press_enter`) is refused, and so are `type`, `selectOption`, `__proto__`, `constructor`, undefined, null and numbers.
- **Jev branch first in executeAction (F17, T-68-04).** `if (params && params.jevHandle !== undefined) { ... }` sits immediately before `// COMPACT REF RESOLUTION` (messaging.js:1043 vs :1060).
  - **On failure:** it sends `{success:false, error:'Fast-mode target is no longer current (<reason>).', tool, refStale:true, reason}` once and returns, so a failing fast `pressEnter` never reaches the REF-LESS fallback.
  - **On success:** it sets `params.selector` and calls `FSB.elementCache.set` once, exactly like the ref branch, and the existing handler runs.
  - **Other calls:** the messaging.js diff against P68_START has no removed lines.
- **getJevMenu (D-13, D-14).** `case 'getJevMenu': { ... }` (messaging.js:1424) is braced and in the synchronous switch.
  - **Building:** it calls `FSB.buildJevMenu({cap, recent})` and passes nothing else. A throw or a non-object result is answered as `{success:false, reason:'menu_error'}`.
  - **Arming:** it sets `FSB._jevCaptureArm = {generation}` only for `capture === true` with a successful menu, and sets it to null otherwise.
  - **Responding:** it sends the menu result object unchanged.
- **Armed capture observation (D-22, T-68-11).** The guard sits first inside `if (FSB.tools[tool]) {` and before the VIS-01 highlight (messaging.js:1109): `if (FSB._jevCaptureArm) { try { FSB.noteJevCaptureObservation(tool, params); } catch (_jevCaptureError) { ... } }`. An unarmed content script does one falsy check and nothing else.
  - **What the observer does:** it disarms first, then resolves the target from `params.selector` only. The ref branch has already run, so a resolved e-ref is seen through the selector it set. Resolution uses the element cache when that returns an element, else `FSB.querySelectorWithShadow`.
  - **What it sends:** one fire-and-forget runtime message. A rejected promise is caught.
- **Real dispatch path.** With `global.chrome.tabs.sendMessage` stubbed, `executeTool('check_box', ...)` and `executeTool('press_enter', ...)` from the real tool-executor.js send `toggleCheckbox` and `pressEnter`. Feeding the captured verb and a structured clone of the params into the sliced executeAction branch over a fresh menu sets `#alpha` / `#q`, never the focused `#nick`, and sends no response. `click` and `hover` pass through unchanged.

## Reason codes (resolveJevHandle, in check order)

| # | Reason | When |
| --- | --- | --- |
| 1 | `conflicting_target` | the call also carries `selector` or `ref` (any defined value, null and '' included) |
| 2 | `bad_handle` | `jevHandle` is not a string matching `^j[1-9][0-9]{0,2}$` |
| 3 | `unavailable` | `FSB.jevRefMap` is missing. The messaging branch also uses it when the resolver is missing or throws |
| 4 | `generation_mismatch` | `jevGeneration` is not a string equal to `FSB.jevRefMap.generation`: a previous reset, or a recycled handle number on a new registry instance (new document nonce) |
| 5 | `unknown_handle` | the current registry has no entry for the handle |
| 6 | `detached` | the WeakRef no longer derefs, or the node is not `isConnected` |
| 7 | `role_changed` | `jevMenuRole(el)` differs from the registry role or from `params.expectedRole` (a missing expectedRole counts as different) |
| 8 | `name_changed` | `jevMenuLabel(el)` differs from the registry name or from `params.expectedName` |
| 9 | `op_not_available` | the verb is not an own key of `jevContentVerbOps`, or its op is not in `jevElementOps(el, {})`. Examples: a box checked since the menu, an opened details summary, a search field whose form now holds another field |
| 10 | `risk_excluded` | `classifyJevRisk(el, {})` is not null: moved into an alertdialog, vault-filled since the menu, and so on |
| 11 | `hidden` | `isElementActionable` reasons include `display:none`, `visibility:hidden` or `opacity:0` |
| 12 | `disabled` | reasons include `disabled`, `aria-disabled` or `fieldset-disabled` |
| 13 | `occluded` | reasons include `obscured`. The hit test ignores FSB overlays |
| 14 | `not_actionable` | any other actionability failure (`pointer-events:none`, `zero-size`), or `isElementActionable` missing or throwing |
| 15 | `out_of_viewport` | the rect centre is outside `window.innerWidth`/`innerHeight` (F15: occlusion is not checked there) |
| 16 | `selector_not_unique` | no non-XPath candidate (not starting with '/', no surrounding whitespace) matches exactly this one element, or `generateSelectors` is missing or throws |

The messaging branch adds `unavailable` when `FSB.resolveJevHandle` is missing or throws.

## Content verb to op table (`FSB.jevContentVerbOps`, frozen)

| Registry tool (tool-definitions.js) | `_contentVerb` (what executeAction receives) | Menu op checked |
| --- | --- | --- |
| `click` | `click` | `click` |
| `check_box` | `toggleCheckbox` | `check_box` |
| `press_enter` | `pressEnter` | `press_enter` |
| `hover` | `hover` | `hover` |

The parity check asserts four things:
- the table is frozen with exactly these four keys;
- each tool's `_route` is `content`;
- each tool's `_contentVerb` maps back to that tool's name;
- each op is in `CONTRACT.OPERATIONS`.

## Observation message shape

`{action: 'jevCaptureObservation', generation, handle, resolved, tool}`. The key set is asserted exactly.

- `generation`: the armed generation string, or null if the arm had none.
- `handle`: `FSB.jevRefMap.findHandle(target)` when the registry generation still equals the armed generation, else null.
- `resolved`: true when `params.selector` resolved to an element. It is false for a text-based click, an empty or unresolvable selector, or a resolver error.
- `tool`: the content verb exactly as executeAction received it, or null if it is not a string.

The message never carries a label, selector, text or value. The suite checks a `type` call with secret text and value markers and finds no marker and no value read. Plan 68-08 adds the background `case 'jevCaptureObservation'` and labels the operation from the LLM's own tool name.

## Task Commits

1. **Task 1: Strict resolver, the getJevMenu case and the jev branch first in executeAction:** `879276e2` (feat)
2. **Task 2: Armed one-shot capture observation at the VIS-01 target-resolution point:** `6d2c36e2` (feat)

**Plan metadata:** the `docs(68-03)` SUMMARY commit that follows these.

## Files Created/Modified

- `extension/content/dom-analysis.js`: +176 lines inside the 68-02 marked block:
  - `jevContentVerbOps`, the handle pattern and reason lists;
  - `jevRefuse`, `jevActionabilityReason` and `jevUniqueSelector`;
  - `resolveJevHandle` and `noteJevCaptureObservation`;
  - three export lines after `FSB.buildJevMenu = buildJevMenu;`.

  Purely additive.
- `extension/content/messaging.js`: +45 lines in three places: the jev branch, the getJevMenu case and the capture guard. Purely additive against P68_START.
- `tests/fixtures/jev-content-dom-kit.js`: `makeDocument` gains an opt-in `matchSelectors` option, which matches simple selectors absent from the map against the live tree, and an `activeElement` slot. Map-only behaviour is unchanged for 68-02 cases.
- `tests/jev-fast-menu.test.js`: 54 new checks (76 -> 130) and an async tail runner. It was already registered in `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS` by 68-02, so no registration change.

## Decisions Made

See `key-decisions` in the frontmatter. Also:
- **Local references:** the resolver calls the block's own `jevContentVerbOps`, `jevElementOps` and `classifyJevRisk` directly rather than through `FSB.*`. They are the same objects as the exports, so reassigning a namespace property cannot change a verdict.
- **Refusal log:** the jev branch logs `logger.warn('Fast-mode target refused', {sessionId, reason})`, with no label, handle or selector.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getJevMenu placed in the synchronous message switch**
- **Found during:** Task 1
- **Issue:** The plan put the case "next to `getMarkdownSnapshot`", which is in `handleAsyncMessage`. `handleBackgroundMessage` sends only `executeAction`, `getDOM`, `getMarkdownSnapshot` and `readPage` to that function (messaging.js router line). A `getJevMenu` case there would never run, and every request would get `{error:'Unknown action'}`. Adding the action to the router line would change an existing line, which the purely-additive acceptance criterion forbids.
- **Fix:** The braced case is in the synchronous switch right after the `executeAction` placeholder case. `buildJevMenu` is synchronous. The test "getJevMenu is routed by the synchronous message switch" pins it there and asserts that the router line does not mention it.
- **Files modified:** extension/content/messaging.js
- **Commit:** 879276e2

**2. [Plan wording] Ops checked before risk**
- **Found during:** Task 1
- **Issue:** The action list orders the risk check before the ops check. The behaviour list, however, expects `op_not_available` for a search field moved into a form with a second text input. The same `jevSearchEnterBlocked` condition also makes `classifyJevRisk` return `enter_submits_form`, so risk-first would report `risk_excluded`.
- **Fix:** The resolver checks the verb's op first and risk second. Both refuse with no dispatch; only the reason code differs. Every reason in the behaviour list holds: the alertdialog and vault cases still report `risk_excluded`.
- **Commit:** 879276e2

**3. [Rule 2 - Tighten-only] Fail-closed handling the plan did not spell out**
- **Found during:** Tasks 1 and 2
- **Fix:**
  - A missing registry is `unavailable`.
  - A throwing resolver in the messaging branch is caught and answered as `unavailable` with `refStale:true`. Otherwise the async handler's generic error, which carries no `refStale`, would answer.
  - `conflicting_target` also fires for `selector: null` / `''`.
  - Any `/`-prefixed candidate is skipped, as are candidates with surrounding whitespace.
  - `fieldset-disabled` maps to `disabled`.
  - A failed menu never arms capture.
  - The observer disarms before sending.

  None of these loosens any rule.
- **Commits:** 879276e2, 6d2c36e2

**4. [Test harness] Kit option and async queue**
- **Found during:** Task 1
- **Fix:** `makeDocument({matchSelectors: true})` lets selectors match nodes moved after the document was built. Without it, the alertdialog and form-move cases could not be expressed. The suite tail became an async runner so the real `executeTool` cases and the rejected-promise case can await. The XPath case was sharpened during the mutation check: the map makes the XPath candidate match the element, so a resolver that accepted XPaths would now fail.
- **Commit:** 879276e2

**5. [Plan wording] RED and GREEN in one commit per task**
- **Found during:** both tasks
- **Issue:** The plan prescribes one commit per task, and the suite is already registered in the root chain, so a red `test(...)` commit would break the chain.
- **Fix:** RED was run and observed before each implementation: Task 1 had 40 failing checks; the three non-jev baseline cases passed by design. Task 2 had 11 failing checks. RED and GREEN landed together in each task's commit, as in 68-02.
- **Commits:** 879276e2, 6d2c36e2

---

**Total deviations:** 5 (1 routing bug fix, 1 check-order note, 1 tighten-only set, 2 harness or commit-shape notes). **Impact:** nothing is loosened. Every acceptance criterion holds as written.

## TDD Gate Compliance

There are no separate `test(68-03)` commits (deviation 5). RED was observed for both tasks before implementation.

GREEN passes 130/130 on Node 24 (v24.14.1), on `npx --offline -y node@20` and on the official `/tmp/fsb-node20/.../node` (v20.20.2).

Mutation spot-checks each broke at least one case and were restored byte-for-byte (`cmp`):
- comparing the raw verb with the ops array: 4 failures;
- no in-viewport check: 1;
- accepting XPath candidates: 1, after the sharpening;
- no `return` after the refStale response: 3;
- no risk recheck: 2;
- accepting a non-unique selector: 2;
- no disarm: 2;
- no `.catch` on the send promise: 1;
- no generation check in the observer: 1;
- a selector added to the message: 8.

## Verification

- **Task verify chains:** `node tests/jev-fast-menu.test.js && node --test tests/selector-fail-closed.test.js tests/hung-page-recovery.test.js && node tests/extension-content-script-files-completeness.test.js && node tests/jev-extension-boundary.test.js && npx --offline -y node@20 tests/jev-fast-menu.test.js` exits 0. The Task 2 chain also exits 0.
- **Messaging and content pin suites** all exit 0:
  - `tests/action-icon-behavior.test.js`, `tests/lattice-replay-background-contract.test.js` and `tests/overlay-content-audit.test.js`;
  - `tests/ownership-leakage-regression.test.js`, `tests/trigger-lifecycle.test.js` and `tests/trigger-observe.test.js`;
  - `tests/extension-content-script-files-completeness.test.js`, `tests/dom-analysis-viewport-priority.test.js` and `tests/click-single-dispatch.test.js`;
  - `tests/delegation-phase-contract.test.js`, `tests/tool-executor-readonly.test.js`, `tests/jev-fast-upstream-contract.test.js` and `tests/jev-extension-boundary.test.js` (132);
  - `node --test` over `selector-fail-closed`, `hung-page-recovery`, `text-editing-contract`, `google-sheets-content-actions` and `content-click-single-activation`.
- **Sweeps** ran in the background against `68-SWEEP-BASELINE.json` with `--files extension/content/messaging.js extension/content/dom-analysis.js`. After Task 1 and after Task 2: 30/30 passed, no new failures, exit 0. Port 7225 was held by the user's hub and left untouched. No sweep selected showcase-build-smoke, so the crawler files never changed.
- **Acceptance greps:**
  - `params.jevHandle !== undefined` is at :1043, before `// COMPACT REF RESOLUTION` at :1060;
  - `case 'getJevMenu'` counts 1;
  - the messaging.js diff against P68_START has no removed lines, and neither does the diff against the Task 1 commit;
  - in the block slice: `resolveRef(` counts 0, `toggleCheckbox: 'check_box'` counts 1, and `pressEnter: 'press_enter'` and `resolveJevHandle` are present;
  - `FSB._jevCaptureArm` counts 2 in messaging.js;
  - `jevCaptureObservation` counts 1 in dom-analysis.js;
  - no `JEV_` or `FsbJev` text under extension/content;
  - the block's no-`.value` gate still holds;
  - both commits carry no attribution line.

## Known Stubs

None that block the plan goal. The capture guard is intentionally inert: the arm is set only by a `getJevMenu` request with `capture:true`, and only plan 68-08's service-worker capture path will send one. The background `case 'jevCaptureObservation'` is also 68-08's. No caller sends `jevHandle` until plans 68-04 and 68-06 wire the fast path.

## Deferred to Validation Block

- **M-68-08 (V5):** real-page freshness on a re-rendering site, in a visible foreground tab. Stale targets must escalate and never mis-click. Also check under V5:
  - real `generateSelectors` output and selector uniqueness, including shadow-DOM targets. These fail closed with `selector_not_unique` because `document.querySelectorAll` does not pierce shadow roots;
  - the real `isElementActionable` hit test against sticky headers and FSB overlays;
  - the one-shot capture observation on real navigations.

Deferred: M-68-08 (V5).

## User Setup Required

None.

## Next Phase Readiness

Plan 68-04 can build fast calls as `{jevHandle, jevGeneration, expectedRole, expectedName, visual_reason}`, plus `checked:true` for `check_box`. Two rules apply:
- `expectedRole` and `expectedName` must be the menu entry's `role` and `label` exactly;
- the call must carry no `selector` or `ref` key at all, not even null, or it is refused as `conflicting_target`.

A refusal comes back as the nested content response `{success:false, refStale:true, reason, tool, error}`, which `executeContentTool` wraps as `result`.

Plan 68-06's `requestMenu` sends `{action:'getJevMenu', options:{cap, recent}}` with `{frameId: 0}` and gets the 68-02 menu object back unchanged.

Plan 68-08 sends `options.capture: true` and handles the `jevCaptureObservation` runtime message shape above.

## Self-Check: PASSED

- FOUND: extension/content/dom-analysis.js, extension/content/messaging.js, tests/fixtures/jev-content-dom-kit.js, tests/jev-fast-menu.test.js, this SUMMARY
- FOUND: commits 879276e2 and 6d2c36e2 on branch Jev; neither carries an attribution line
- `node tests/jev-fast-menu.test.js`: 130 PASS / 0 FAIL after the last commit
