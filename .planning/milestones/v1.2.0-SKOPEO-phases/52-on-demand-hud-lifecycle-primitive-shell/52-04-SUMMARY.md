---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 04
subsystem: extension
tags: [chrome-extension, mv3, commands, storage-session, abort-controller, generation-gate]

requires:
  - phase: 52-01
    provides: Terminal per-tab reducer, storage-key contract, and prepared-before-commit ACTIVE marker
  - phase: 52-03
    provides: Exact document-runtime prepare, commit, probe, terminate, and acknowledgment envelopes
provides:
  - Explicit current-tab Skopeo command and side-panel message protocol without changing toolbar behavior
  - Authoritative persisted per-tab MV3 controller with dynamic injection, terminal teardown, wake probes, and stale-ack rejection
  - Integration coverage for restricted tabs, generation races, bundle exclusion, navigation, and later explicit reinjection
  - Mandatory registration of all four Phase 52 contract suites in the default regression chain
affects: [52-05-side-panel, 52-06-release-evidence, extension-runtime-routing]

tech-stack:
  added: []
  patterns: [sender-derived tab authority, persisted terminal generation ledger, dynamic ordered injection pair, observational wake probe]

key-files:
  created:
    - tests/skopeo-sidepanel-command.test.js
  modified:
    - extension/manifest.json
    - extension/background.js
    - package.json

key-decisions:
  - "The standard command consumes only the listener-provided tab id; public side-panel messages require an explicit positive tab id, while content acknowledgments derive authority only from sender.tab.id."
  - "Skopeo shell and runtime files live in one dedicated ordered dynamic injection list and remain absent from CONTENT_SCRIPT_FILES, the fallback automation bundle, manifest content scripts, and web-accessible resources."
  - "Prepared state is persisted ACTIVE with reason prepared-awaiting-commit before commit, but remains publicly Starting until an exact ready acknowledgment or a matching mounted wake probe clears the marker."
  - "Wake recovery is observational and never injects: matching active probes restore the record, while interrupted, stale, malformed, or missing runtime state is terminated to an OFF tombstone."

patterns-established:
  - "Terminal-first worker ownership: persist TERMINATING, abort the tab controller, best-effort terminate the document runtime, then persist and broadcast OFF even when its listener is already gone."
  - "Exact acknowledgment boundary: fixed action/key allowlists plus sender-derived tab and current generation checks precede every prepared, ready, kill, and teardown transition."
  - "Static-bundle exclusion: on-demand HUD files are parsed and asserted absent from both automation injection lists while the dedicated pair is pinned in shell-then-runtime order."

requirements-completed: [HUD-01, HUD-02, HUD-03, HUD-04]

duration: 26min
completed: 2026-07-14
---

# Phase 52 Plan 04: Explicit Current-Tab MV3 Controller Summary

**A configurable current-tab command and explicit side-panel protocol now drive an MV3-durable Skopeo controller that dynamically injects only the shell/runtime pair, commits through a persisted generation boundary, and fails terminally without altering the toolbar path.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-07-14T20:48:10Z
- **Completed:** 2026-07-14T21:14:32Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added the one standard `toggle-skopeo-current-tab` manifest command with `Ctrl+Shift+Space` and macOS `Alt+Space`, while preserving the popup-free toolbar action and the declared "ui/sidepanel.html" path byte-behaviorally.
- Added a storage-session-backed per-tab controller with independent AbortControllers, explicit URL preflight, ordered frame-0 injection, STARTING/prepare/ACTIVE-marker/commit/ready admission, universal terminal teardown, navigation/tab cleanup, and newer-generation explicit reinjection.
- Bound every content acknowledgment to the Chrome-provided sender tab and exact current generation, rejected payload tab identity and extra keys, and prevented stale async failures from broadcasting over a newer or already-OFF generation.
- Added read-only wake recovery: matching mounted probes preserve ACTIVE, while missing/stale/malformed probes and interrupted STARTING or TERMINATING records finish OFF without injection or automatic startup.
- Added a non-vacuous source/runtime hybrid contract and registered all four Skopeo suites exactly once beside the overlay tests in the ordinary `npm test` chain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin command, explicit-tab, injection, and restricted-page behavior** - `56a09fa4` (test)
   - Negative-control correction: `e75e30a3` (test)
2. **Task 2: Wire manifest command and the authoritative per-tab service-worker controller** - `71baceca` (feat)
3. **Task 3: Register the Phase 52 contract suites in the default regression chain** - `759d0ee9` (test)

**Plan metadata:** recorded in the final documentation commit.

## Files Created/Modified

- `tests/skopeo-sidepanel-command.test.js` - ASCII-only parser/oracle self-test plus production controller VM harness covering manifest, toolbar, explicit tabs, generations, rollback, probes, navigation, and injection exclusion.
- `extension/manifest.json` - Exact configurable Skopeo command; existing permissions, toolbar icons, side-panel declaration, content scripts, and web-accessible resources remain unchanged.
- `extension/background.js` - Guarded reducer import, dedicated ordered injection list, per-tab persisted controller, exact runtime routing, command listener, wake probe, and navigation/tab terminal cleanup.
- `package.json` - Four Phase 52 suites added once after the existing overlay audit without removing or reordering any prior command.

## Command and Message Contract

The manifest exposes exactly one Skopeo command:

```text
toggle-skopeo-current-tab
default: Ctrl+Shift+Space
mac: Alt+Space
description: Toggle Skopeo in current tab
```

The command listener handles only that name and uses its supplied tab. It never performs a late active-tab query. The unchanged toolbar listener still opens the global FSB side panel. Side-panel callers use `{action:'skopeo:toggle-tab',tabId}` and `{action:'skopeo:get-status',tabId}` with a positive explicit tab id.

The worker sends only exact generation-bearing document actions:

```javascript
{ action: 'skopeo:prepare', generation }
{ action: 'skopeo:commit', generation }
{ action: 'skopeo:probe', generation }
{ action: 'skopeo:terminate', generation, reason }
```

Document acknowledgments accept only the fixed prepared, ready, kill-request, and teardown-complete key sets. Their tab comes exclusively from `sender.tab.id`; any payload `tabId`, missing sender tab, wrong generation, wrong state, or extra key fails closed.

## Persisted Lifecycle and Public Projection

An explicit start preflights the selected URL before allocating a generation. It then persists and broadcasts STARTING, injects `content/skopeo-shell.js` followed by `content/skopeo-runtime.js` once into frame 0, rechecks storage and AbortSignal state, and sends prepare. Preparation stays detached and therefore root-, listener-, and top-layer-free.

A matching prepared acknowledgment transitions the reducer record to ACTIVE with `reason: 'prepared-awaiting-commit'` and persists it before the exact commit. That marker continues to project public Starting. Only matching ready clears the reason and broadcasts/returns Active Ambient. Commit delivery failure, unsafe layout, runtime teardown before ready, injection failure, cancellation at either boundary, restricted URLs, stale continuations, and navigation all leave an authoritative OFF tombstone and zero page resources.

Kill persists TERMINATING before aborting or contacting the page runtime. A runtime that has already removed its listener/sentinel may make terminate delivery fail; this is accepted as a terminal condition, and the worker still persists OFF. Tab removal aborts and deletes only that tab's record.

## MV3 Wake and Probe Evidence

Worker startup scans only `skopeoSession:<tabId>` records. It performs no injection, prepare, commit, focus, attention change, or automatic activation:

- A matching exact `{success:true,generation,status:'active',attention:'ambient',mounted:true}` probe preserves ACTIVE and clears a prepared marker only after mounted state is proven.
- The exact stale response, a missing receiver, wrong generation, malformed response, interrupted STARTING, or interrupted TERMINATING becomes a terminal OFF record.
- Normalization best-effort terminates any surviving detached/mounted runtime, but delivery failure still completes the tombstone.
- A later explicit toggle starts from the tombstone, allocates a newer generation, and dynamically reinjects the ordered pair once.

Two-tab harness cases keep records, generations, AbortControllers, injection counts, and teardown independent. Stale/wrong-tab prepared, ready, and teardown messages cannot mutate another tab or resurrect a terminal generation.

## Injection Exclusion Evidence

The integration contract parses all three relevant lists:

- `SKOPEO_INJECTION_FILES` is exactly `['content/skopeo-shell.js', 'content/skopeo-runtime.js']`, each once and in order.
- Neither file appears in `CONTENT_SCRIPT_FILES`.
- Neither file appears in the ws-client fallback returned by `_getContentScriptFilesForInjection()`.

The manifest also keeps its sole always-loaded content script (`canvas-interceptor.js`) and existing web-accessible resources unchanged. No Skopeo namespace was added to automation startup, install/startup hooks, the toolbar action, or `_execute_action`.

## Decisions Made

- Kept the controller in one bounded background region and routed its six actions before the unrelated automation switch. This preserves existing message cases while making the sender/generation boundary directly testable in a VM.
- Used storage records as the only authoritative lifecycle state; in-memory AbortControllers only cancel current async work and are recreated after a successful wake probe.
- Preserved OFF tombstones after ordinary teardown so late generations remain rejectable; only tab removal deletes the tab-specific record.
- Treated exact missing/stale probe results as evidence for terminal normalization, never as permission to inject or restart.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the deliberately wrong-tab negative control**

- **Found during:** Task 2 read-first reconciliation of the Task 1 harness
- **Issue:** The initial wrong-tab prepared case used Tab B while Tab B independently owned the same numeric generation. Sender-derived authority correctly interpreted that as Tab B's own acknowledgment, so the fixture did not represent a wrong-tab message.
- **Fix:** Switched the negative control to an unowned sender tab and added an explicit self-test assertion for that case, while retaining the same-generation Tab B isolation proof.
- **Files modified:** `tests/skopeo-sidepanel-command.test.js`
- **Verification:** Self-test rejects the unowned sender; production mode rejects it without sending commit or changing Tab A/Tab B records.
- **Committed in:** `e75e30a3`

---

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** The correction made the required negative control semantically valid; it changed no product behavior or scope.

## Issues Encountered

- A sender tab with the same generation number is not intrinsically stale: generation authority is per tab. The harness now distinguishes valid per-tab independence from a genuinely unowned/wrong sender.
- The GSD progress helper counted the two out-of-milestone Phase 999.1 summaries and briefly reported 6/6. ROADMAP's disk count correctly reported 4/6; STATE was reconciled manually to the same phase-local 4/6 (67%) value.

## Test Results

- `node tests/skopeo-sidepanel-command.test.js --self-test && node --check tests/skopeo-sidepanel-command.test.js` - PASS; normal mode initially failed on the absent manifest command, proving no missing-production skip.
- `node tests/skopeo-sidepanel-command.test.js && node tests/extension-content-script-files-completeness.test.js && node --check extension/background.js` - PASS.
- `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-sidepanel-command.test.js && node tests/skopeo-accessibility.test.js` - PASS.
- Six-command Phase 52 suite, including `tests/test-overlay-state.js` (117 checks) and `tests/overlay-content-audit.test.js` (69 checks) - PASS.
- Adjacent `tests/extension-content-script-files-completeness.test.js` and `tests/sidepanel-tab-aware-smoke.test.js` (42 checks) - PASS.
- Manifest/package JSON parsing, exact once-only test registration, background syntax, and `git diff --check` - PASS.

## User Setup Required

None - no external service configuration required. Chrome shortcut collision/remapping and live page behavior remain Plan 06 UAT items.

## Next Phase Readiness

- Plan 05 can bind its selected-tab UI to the explicit toggle/status messages and `skopeo:status-changed` broadcasts without reading page state or changing the toolbar action.
- Plan 06 can validate command collision/remapping, real MV3 suspension, Drive/Docs pass-through, accessibility, and delayed-work resurrection using the now-persisted generation controller.
- No implementation blocker remains; live Chrome UAT is intentionally deferred to Plan 06.

## Self-Check: PASSED

- Confirmed the test, manifest command, background controller, package registration, and this summary exist.
- Confirmed task commits `56a09fa4`, `e75e30a3`, `71baceca`, and `759d0ee9` exist in git history.
- Re-ran the Phase 52 suite, adjacent injection/side-panel regressions, JSON/syntax checks, and whitespace gate after all task commits.
- Confirmed the toolbar action diff is empty and both Skopeo files remain absent from static/automation bundles.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-14*
