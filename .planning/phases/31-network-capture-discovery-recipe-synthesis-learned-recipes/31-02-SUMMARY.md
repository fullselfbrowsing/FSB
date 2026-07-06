---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
plan: 02
subsystem: infra
tags: [chrome-debugger, cdp, network-capture, redaction, consent-gate, privacy, service-worker]

# Dependency graph
requires:
  - phase: 30-consent-governance-recipe-signature-verification-audit-legal
    provides: "FsbConsentPolicyStore (readPolicies/getConsentForOrigin) + FsbServiceDenylist (isDenied/classify) consent gate; redactForLog shape-only reducer"
  - phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes (plan 01)
    provides: "Wave-0 RED contracts: network-capture.test.js, network-capture-consent.test.js, network-capture-redaction.test.js + tests/_helpers/cdp-event-driver.js stub"
provides:
  - "extension/utils/network-capture-redactor.js — capture-time shape-only redactor (redactRequest/redactResponse); the security boundary"
  - "extension/utils/network-capture.js — FsbNetworkCapture consent-gated CDP Network capture session over the existing Input-domain debugger attach"
  - "The redacted in-memory ObservedCall list (method + path-template + header-names + origin + responseShape) that Plan 03/06 will synthesize/promote"
affects: [31-03 recipe-synthesizer, 31-06 background wiring, 32 self-healing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture-time structural redaction: the redactor never reads header values / bodies / query params, so it is UNABLE to leak (structural exclusion, not filtering)"
    - "Consent gate reused verbatim BEFORE attach (denylist -> consent-off -> sensitive-confirm), so a default-OFF/denied origin never attaches the debugger"
    - "Network domain added to the EXISTING Input-domain chrome.debugger attach (collision-safe attach mirrored from background.js); ownership-checked release"
    - "typeof-guarded SW-global accessors with a Node require() sibling fallback (degrade gracefully under the test harness)"

key-files:
  created:
    - extension/utils/network-capture-redactor.js
    - extension/utils/network-capture.js
  modified: []

key-decisions:
  - "redactResponse returns ONLY {status, mimeType} (headers dropped entirely, strictly safer than names-only per RESEARCH Open Q3)"
  - "weAttached ownership: a FRESH attach claims ownership (detach on release); an 'already attached' collision re-attaches to add Network but does NOT claim exclusive ownership (never detaches out from under the prior Input owner)"
  - "Gate returns bare RECIPE_CONSENT_* reason strings (createRecipeError is not a dependency of the standalone gate); RECIPE_CAPTURE_* reasons distinguish attach/enable failures from consent rejections"
  - "Session defaults: maxMs 30000, maxCount 25 (Claude's discretion per CONTEXT A1 — a brief, explicit observation, not a long-lived tap)"

patterns-established:
  - "Structural-exclusion redaction: exclude credential fields by never reading them (cannot leak), proven by the stringify-and-grep no-secret test"
  - "Ownership-checked debugger release: Network.disable + listener removal always; detach only if weAttached AND !keyboardEmulator.isAttachedTo(tabId)"

requirements-completed: [DISC-02, DISC-03, DISC-04, LEARN-02]

# Metrics
duration: 10min
completed: 2026-06-22
---

# Phase 31 Plan 02: Network-Capture Redactor + Consent-Gated CDP Capture Session Summary

**A shape-only capture-time redactor (header-names-only, no body, no query, no header values) and a consent-gated CDP Network capture session that rides the existing Input-domain chrome.debugger attach, filters to same-origin XHR/Fetch, and never fetches a response body — wiring all three Wave-0 capture/redaction suites GREEN.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-22T20:48Z (approx; file-read start)
- **Completed:** 2026-06-22T20:58Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `network-capture-redactor.js` — the capture-time security boundary: `redactRequest` keeps method + path-template (no query/fragment) + header NAMES only with the auth-carrier denylist removing authorization/cookie/set-cookie/x-csrf-*/x-xsrf-*/x-api-key/*bearer*; `redactResponse` returns ONLY `{status, mimeType}`. The redactor structurally cannot read a header value or body.
- `network-capture.js` — `FsbNetworkCapture.startSession/endSession`: the Phase-30 consent gate runs BEFORE attach (denied/off/sensitive-unconfirmed rejected), then the Network domain is added to the existing collision-safe debugger attach, a method-dispatched `onEvent` listener captures same-origin XHR/Fetch (dropping Document/Image/Stylesheet/Font/Media + cross-origin), redacts at the handler, attaches `{status, mimeType}` from `responseReceived` with zero response-body fetches, and time+count bounds the session.
- Ownership-safe release: `endSession` releases `Network.disable` + removes both listeners and detaches ONLY when capture was the attaching owner AND no Input op holds the tab — Input emulation is never disrupted.
- All three Wave-0 suites GREEN: redaction 33/0, capture 24/0, consent 11/0. No Phase-29/30 regression; recipe-path guard PASS; redactForLog untouched (composed, not edited).

## Task Commits

Each task was committed atomically:

1. **Task 1: network-capture-redactor.js (shape-only capture-time redactor)** — `78d981d2` (feat)
2. **Task 2: network-capture.js (consent-gated CDP Network capture session)** — `d22543c6` (feat)

_Note: Task 2 was a `tdd="true"` task; its RED gate was the pre-existing Wave-0 failing suites (network-capture.test.js + network-capture-consent.test.js, MODULE_NOT_FOUND), and this commit is the GREEN gate that turns them passing._

## Files Created/Modified
- `extension/utils/network-capture-redactor.js` (137 lines) — `redactRequest`/`redactResponse`; AUTH_CARRIER_DENYLIST; composes redactForLog defensively; dual-export IIFE; dynamic-code-free.
- `extension/utils/network-capture.js` (437 lines) — `startSession`/`endSession`/`_onCdpEvent`/`_filterResourceType`/`_getObservedCalls`; the consent gate; collision-safe attach mirrored from background.js:13920-13935; ownership-checked release; dual-export IIFE; dynamic-code-free.

## Decisions Made
- **redactResponse keeps only `{status, mimeType}`** — headers dropped entirely (no names-only surface), the strictly-safer reading of RESEARCH Open Q3 and exactly what the no-secret test asserts.
- **`weAttached` ownership semantics** — a fresh attach (we are the owner) sets `weAttached=true` and detaches on release; an "Another debugger is already attached" collision force-detaches + re-attaches to add the Network domain but leaves `weAttached=false`, so the release side never detaches out from under the prior Input owner (RESEARCH Pitfall 1).
- **Bare `RECIPE_CONSENT_*` reason strings** from the gate (the RED suite asserts the `RECIPE_CONSENT_` prefix and the standalone gate has no `createRecipeError` dependency); distinct `RECIPE_CAPTURE_UNAVAILABLE`/`_ATTACH_FAILED`/`_ENABLE_FAILED` reasons separate infrastructure failures from consent rejections.
- **Session defaults maxMs=30000, maxCount=25** (Claude's discretion, CONTEXT A1) — a short, explicit observation so the debugger banner does not linger (RESEARCH Pitfall 2).

## Deviations from Plan

None - plan executed exactly as written.

The `_requireSibling` Node-`require()` fallback inside the typeof-guarded accessors is NOT a deviation: the plan explicitly specified "typeof-guarded SW-global accessors (degrade gracefully under the Node test harness)". The dispatch suite seeds `chrome.storage.local` but does not pre-load the consent module as a global, so the accessor falls back to `require('./consent-policy-store.js')` (which also sets the global) — the documented graceful-degradation behavior. In the service worker the global (set by importScripts) always wins and `require` is never reached.

## Issues Encountered
- Initial dispatch-suite run showed 4 failures because the gate read `globalThis.FsbConsentPolicyStore`, which the dispatch suite (unlike the consent suite) does not pre-load. Resolved by extending the typeof-guarded accessors with the planned Node `require()` sibling fallback so the seeded `chrome.storage.local` consent is read. All 24 dispatch assertions then passed; the consent suite (which loads the real modules as globals) was unaffected (11/0).

## Known Stubs
None — both modules are fully wired against their dependencies. `network-capture.js` deliberately does NOT synthesize or persist (that is Plan 03/06); its output is the in-memory redacted ObservedCall list, which is the intended Plan-02 boundary, not a stub.

## Threat Flags
None — no security surface beyond the plan's `<threat_model>` was introduced. The two modules realize the LEAK / UNCONSENTED / SPOOF / DETACH mitigations exactly as registered:
- T-31-02-LEAK: header values + bodies never read; query dropped; no response-body fetch (no-secret test is the executable proof, 33/0).
- T-31-02-UNCONSENTED: the Phase-30 gate runs before attach; OFF/denied never attach (consent suite asserts zero Network.enable on those paths).
- T-31-02-SPOOF: events only arrive from the SW-owned attachment; same-origin filter drops cross-origin.
- T-31-02-DETACH: ownership-checked release + onDetach teardown; Input emulation never broken.

## User Setup Required
None - no external service configuration required (D-02: the `debugger` permission already exists; no manifest change).

## Next Phase Readiness
- Plan 03 (recipe-synthesizer) can consume `FsbNetworkCapture.endSession()`'s returned ObservedCall list (method + path + headerNames + origin + responseShape) and synthesize a closed-vocab declarative recipe.
- Plan 06 wires the background.js capture-session entry + the live `chrome.debugger.onEvent` listener (this plan deliberately did NOT touch background.js).
- The `endSession` ownership-checked release is the contract the live SW listener must honor so a discovery session never disrupts a concurrent KeyboardEmulator Input op.

## Self-Check: PASSED
- FOUND: extension/utils/network-capture-redactor.js
- FOUND: extension/utils/network-capture.js
- FOUND: .planning/phases/31-network-capture-discovery-recipe-synthesis-learned-recipes/31-02-SUMMARY.md
- FOUND commit: 78d981d2 (Task 1 redactor)
- FOUND commit: d22543c6 (Task 2 capture session)
- Verification: redaction 33/0, capture 24/0, consent 11/0 all GREEN; recipe-path guard PASS; redactForLog regression PASS; no dynamic-code constructs in either module.

---
*Phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes*
*Completed: 2026-06-22*
