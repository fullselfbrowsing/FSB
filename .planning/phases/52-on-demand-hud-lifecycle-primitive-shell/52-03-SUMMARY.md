---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 03
subsystem: ui
tags: [chrome-extension, content-runtime, abort-controller, generation-gate, vm-testing]

requires:
  - phase: 52-01
    provides: Terminal per-tab generation reducer and prepared-before-commit worker state
  - phase: 52-02
    provides: Detached Skopeo shell preparation, one-use mount token, controlled fixture, and complete resource teardown
provides:
  - Explicit-only per-document runtime with exact prepare, commit, probe, and terminate envelopes
  - Abort-first generation teardown that removes listeners, fixture ownership, sentinel, shell, and late render paths
  - VM race evidence for replacement, navigation, failed start, Escape, reinjection, and post-kill deferred work
affects: [52-04-mv3-controller, 52-05-side-panel, 52-06-release-evidence]

tech-stack:
  added: []
  patterns: [prepare-then-worker-commit protocol, terminal-before-abort teardown, named-listener identity removal, dynamic runtime replacement]

key-files:
  created:
    - extension/content/skopeo-runtime.js
  modified:
    - extension/content/skopeo-shell.js
    - tests/skopeo-session-lifecycle.test.js
    - tests/skopeo-shell-contract.test.js

key-decisions:
  - "The shell owns placement selection and reveals only full or compact through an identity-checked accessor for its current opaque token."
  - "A newer generation receives a new runtime API/listener identity only after the prior owner reaches complete synchronous teardown."
  - "The runtime Escape listener ignores defaultPrevented events because the shell listener is registered first and remains authoritative when it already consumed a transition."
  - "Controlled fixture activation is sentinel-only, requires the isolated-world flag plus committed activation, and schedules one abort/generation-guarded delayed render."

patterns-established:
  - "Observational probe: matching committed/mounted generation returns the fixed Ambient active shape; every mismatch is stale and no probe performs work."
  - "Zero-residue terminal owner: saved API references retain only a stable teardown snapshot while the Chrome listener, active page listeners, fixture hook/flag, sentinel, and shell disappear."
  - "Replacement boundary: abort and destroy the prior owner before registering the successor listener or preparing its detached shell."

requirements-completed: [HUD-02, HUD-03, HUD-05]

duration: 20min
completed: 2026-07-14
---

# Phase 52 Plan 03: Explicit Skopeo Document Runtime Summary

**A root-free prepare/commit runtime now admits one generation, reports read-only probes, and tears every terminal path down abort-first so delayed work cannot resurrect the HUD.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-14T20:24:01Z
- **Completed:** 2026-07-14T20:43:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added a classic-script document runtime whose evaluation installs only one sentinel and one named Chrome message listener; preparation creates detached shell state but no root, top layer, focus change, active key handler, or pagehide handler.
- Enforced exact positive-generation prepare/commit/probe/terminate envelopes, one-use worker commit, duplicate/stale rejection, new-owner replacement, and outbound messages with no page-controlled tab identity.
- Centralized terminal cleanup in the required terminal → abort → destroy → acknowledgement → listener/hook/sentinel order and returned the same evidence snapshot through saved terminal API references.
- Added real-runtime VM coverage for zero-root prepare, exact active/stale/missing probes, unsafe and failed starts, close/off/navigation, Ambient and double Escape, replacement, fresh reinjection, and delayed Promise/timer/message releases.
- Added an isolated controlled fixture entry that cannot be reached through runtime messages and whose deterministic delayed render checks both AbortSignal state and exact generation before touching the shell.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend lifecycle tests across the real page runtime boundary** - `b4bdc58b` (test, including Rule 1 shell interface fix)
2. **Task 2: Implement the explicit-only document runtime and abort-first universal teardown** - `c516e37d` (feat)

**Plan metadata:** recorded in the final documentation commit.

## Files Created/Modified

- `extension/content/skopeo-runtime.js` - Explicit-only prepare/commit/probe/terminate adapter, generation ownership, fixture gate, Escape/navigation routing, replacement, and abort-first teardown.
- `extension/content/skopeo-shell.js` - Added the token-identity-checked `getPreparedPlacementMode()` seam so placement remains shell-owned and opaque.
- `tests/skopeo-session-lifecycle.test.js` - Preserved the Plan 01 reducer matrix and added the self-test oracle plus production VM runtime race suite.
- `tests/skopeo-shell-contract.test.js` - Pins valid, foreign, and consumed placement-mode access without exposing geometry or weakening one-use mount identity.

## Message Contract

The document accepts only these exact inbound envelopes from its own Chrome runtime sender:

```javascript
{ action: 'skopeo:prepare', generation }
{ action: 'skopeo:commit', generation }
{ action: 'skopeo:probe', generation }
{ action: 'skopeo:terminate', generation, reason }
```

It emits only generation-bearing page-to-worker envelopes, never a page-controlled `tabId`:

```javascript
{ action: 'skopeo:prepared', generation, placement: 'full' | 'compact' }
{ action: 'skopeo:ready', generation, attention: 'ambient' }
{ action: 'skopeo:kill-request', generation, reason: 'close' | 'escape' | 'unsafe-layout' | 'navigation' }
{ action: 'skopeo:teardown-complete', generation, reason, resources }
```

Probe is synchronous and observational. Exact committed/mounted generation returns `{success:true,generation,status:'active',attention:'ambient',mounted:true}`; every delivered mismatch returns `{success:false,generation,status:'stale',code:'SKOPEO_STALE_GENERATION'}`. After teardown no listener remains, which the worker can normalize to `{success:false,generation,status:'missing',code:'SKOPEO_RUNTIME_MISSING'}`.

## Teardown and Deferred-Work Evidence

The VM suite records this exact order for every accepted terminal owner:

```text
terminal
abort
destroy
teardown-complete
unregister-runtime-listener
unregister-key/pagehide-listeners
delete-fixture-hook
delete-sentinel
```

The recording shell observes an already-aborted signal inside `destroy()`. Its returned resource inventory is zero in all eleven shell categories. A captured delayed fixture callback, cleared timer callback, old Chrome message listener, Promise continuation, and saved API commit are released after teardown; none can render, create another shell, send ready, send a second teardown, or restore the sentinel. Repeated terminate/dispose through the saved owner returns the same terminal snapshot with no second message, listener removal, destroy, or focus work.

## Escape, Navigation, and Replacement Behavior

- Repeated/composing/unrelated keyboard input passes through unchanged.
- One applicable Escape calls one shell back transition and is suppressed only when consumed. From Ambient, the shell callback requests `escape` off and completes teardown.
- A second applicable Escape within 600ms requests universal current-generation kill. The runtime guard ignores an event already `defaultPrevented` by the earlier shell-owned listener, preventing a duplicate back transition.
- Non-persisted or persisted pagehide uses the same `navigation` kill/teardown path; the generation is not silently restored on a later document.
- A newer prepare or script evaluation first aborts/destroys the old identity and removes its listener/sentinel. Only then does one successor listener/sentinel prepare the newer detached shell.
- Re-evaluation after ordinary off installs no primitive or prior attention state. It accepts a newer generation, while queued older-generation work stays stale.

## Decisions Made

- Kept placement internals inside `SkopeoShell`. The runtime may ask only for `full` or `compact` using the exact unconsumed token it already owns; foreign, stale, or consumed tokens return null.
- Used a new API/listener identity for in-document generation replacement instead of reviving a terminal API. This preserves idempotent saved-reference semantics and makes old identity disposal observable.
- Kept the shell keyboard listener authoritative. The runtime listener remains the required active adapter/fallback but exits on `defaultPrevented`, while shell callbacks convey already-consumed Escape timing and attention.
- Removed the fixture method, isolated-world flag, page listeners, Chrome listener, and sentinel during every terminal path. There is no dormant launcher, message action, URL/storage flag, or ordinary control for the controlled fixture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added a public opaque-token placement-mode adapter**

- **Found during:** Task 1 runtime contract reconciliation
- **Issue:** `prepareAmbient()` correctly returned an opaque token, but the required `skopeo:prepared` envelope also needed `placement: 'full'|'compact'`; the shell exposed no public way to obtain that value without reading private state.
- **Fix:** Added `getPreparedPlacementMode(token)`, which identity-checks the current unconsumed token and returns only `full`, `compact`, or null. Runtime code never reads shell internals.
- **Files modified:** `extension/content/skopeo-shell.js`, `tests/skopeo-shell-contract.test.js`
- **Verification:** Foreign and consumed tokens return null; valid prepare stays root-free; shell, lifecycle, and accessibility suites pass.
- **Committed in:** `b4bdc58b`

---

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** The accessor was the minimum interface needed to preserve both the opaque-token boundary and the exact worker envelope; it added no geometry access or product scope.

## Issues Encountered

- VM-returned objects have a distinct realm prototype, so the new exact-shape assertions initially failed despite identical fields. Assertions now normalize only returned test values through JSON before strict structural comparison; production behavior was unchanged.

## Verification Results

- `node tests/skopeo-session-lifecycle.test.js --self-test && node --check tests/skopeo-session-lifecycle.test.js` - PASS
- Normal mode before Task 2 failed explicitly with `production Skopeo runtime must exist in normal mode`, proving there was no missing-runtime skip.
- `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js` - PASS
- `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js` - PASS
- `node --check extension/content/skopeo-runtime.js && git diff --check` - PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can dynamically inject the shell/runtime, persist prepared generation ACTIVE before commit, normalize missing probe delivery, and consume exact prepared/ready/kill/teardown envelopes.
- Plan 05 can reflect the worker-owned per-tab ladder without querying or mutating page state directly.
- Plan 06 can use the deterministic controlled-fixture timer to kill before completion and prove real Chrome resurrection resistance.

## Self-Check: PASSED

- Confirmed runtime, shell accessor, lifecycle integration suite, shell assertion, and this summary exist.
- Confirmed task commits `b4bdc58b` and `c516e37d` exist in git history.
- Re-ran self-test, production lifecycle, shell, accessibility, syntax, and whitespace verification after implementation.
- Confirmed all outbound runtime envelopes are tab-id-free and no active listener/sentinel survives accepted teardown.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-14*
