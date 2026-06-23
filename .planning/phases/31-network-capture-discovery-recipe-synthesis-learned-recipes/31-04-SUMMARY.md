---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
plan: 04
subsystem: api
tags: [provenance, ed25519, signature, recipe, capability, trust-boundary]

# Dependency graph
requires:
  - phase: 30-consent-governance-recipe-signature-verification-audit-legal
    provides: "verifyRecipeEnvelope Ed25519 verify + the 'bundled' provenance exemption + the HI-01 trusted-provenance rule (resolution from the loader's arg, never the payload)"
  - phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes (plan 01)
    provides: "the Wave-0 RED suite tests/learned-local-provenance-exempt.test.js (zero-verify-call exempt + payload-cannot-self-declare cases)"
provides:
  - "'local' recognized as a third trusted-exempt provenance value alongside 'bundled' in verifyRecipeEnvelope (capability-signature.js)"
  - "'local' short-circuits the interpreter's exempt path BEFORE the async verify branch in interpretRecipe (capability-interpreter.js) -- observable as a zero verifyEd25519 call"
  - "a locally-synthesized learned recipe (provenance:'local', loader-vouched) binds without an Ed25519 verify, realizing D-09"
affects: [recipe-synthesizer promoteAfterReplay, learned-recipe-store, capability-router T2 learned tier, Phase 31 plan 05/06 capture+wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trusted-provenance exemption set (HI-01): a verify exemption is granted ONLY for a provenance value resolved from the loader's trusted channel; new values are added to the exempt-VALUE check, never to the resolution logic"

key-files:
  created:
    - .planning/phases/31-network-capture-discovery-recipe-synthesis-learned-recipes/31-04-SUMMARY.md
  modified:
    - extension/utils/capability-signature.js
    - extension/utils/capability-interpreter.js

key-decisions:
  - "'local' is added ONLY to the exempt-value set (the boolean-OR against the already-resolved trusted provenance); the resolution logic (arguments.length>=2 ? trustedProvenance : envelope.provenance in signature; opts.trustedProvenance-only in the interpreter) is left byte-identical so HI-01 holds -- a payload self-declaring 'local' with no loader vouch still falls through to verify."
  - "The 'local' OR was placed in the interpreter's exempt short-circuit BEFORE the async verify branch so the exemption is observable as a zero verifyEd25519 call (the bundled-exemption test template)."

patterns-established:
  - "Trusted-exempt provenance values are an additive OR against a value already resolved from the trusted channel -- the trust boundary is the resolution, not the value list."

requirements-completed: [LEARN-01]

# Metrics
duration: 1min
completed: 2026-06-23
---

# Phase 31 Plan 04: 'local' Trusted-Exempt Provenance Summary

**`provenance:'local'` joins `'bundled'` as a verify-exempt value in both `verifyRecipeEnvelope` and `interpretRecipe`, so a loader-vouched locally-synthesized recipe binds with zero Ed25519 calls — while a payload self-declaring `'local'` with no loader vouch is still verified (HI-01 preserved).**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-06-23T02:13:02Z
- **Completed:** 2026-06-23T02:14:23Z
- **Tasks:** 1
- **Files modified:** 2 (plus 1 summary created)

## Accomplishments

- Realized **D-09**: a `'local'`-provenance recipe is EXEMPT from the Phase-30 Ed25519 signature verify, parallel to the existing `'bundled'` exemption — a locally-synthesized learned recipe binds without a verify call.
- Preserved **HI-01** with zero change to the resolution logic: the exemption fires only for a provenance resolved from the loader's trusted channel (the signature module's second arg; the interpreter's `opts.trustedProvenance`). A recipe whose PAYLOAD says `provenance:'local'` but with NO loader vouch still falls through to verify, so a tampered core stays rejected.
- The `'local'` short-circuit sits BEFORE the interpreter's async verify branch, so the exemption is observable as a **zero `verifyEd25519` call** (the bundled-exemption test template).
- Turned the Wave-0 RED suite `tests/learned-local-provenance-exempt.test.js` GREEN (5/2 → 7/0) with **no regression**: `recipe-signature-interpreter-hook` 13/0, `recipe-signature` 13/0, `capability-interpreter` 51/0, and the recipe-path guard stays eval-free (PASS). The `'bundled'` and bare-core paths are byte-identical.

## Task Commits

Each task was committed atomically:

1. **Task 1: Recognize 'local' as a trusted-exempt provenance in capability-signature.js and capability-interpreter.js** - `3053f88c` (feat)

_TDD note: the RED test (`tests/learned-local-provenance-exempt.test.js`) was authored in Plan 01 (Wave 0). This plan is the GREEN step — a single `feat` commit makes the existing failing test pass. RED was re-confirmed failing (5 PASS / 2 FAIL) immediately before the edit, then GREEN (7 PASS / 0 FAIL) after._

**Plan metadata:** see final docs commit (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified

- `extension/utils/capability-signature.js` — `verifyRecipeEnvelope`: the resolved-provenance short-circuit now returns `{ ok: true }` for `'local'` as well as `'bundled'`; comment updated to record `'local'` (Phase 31, locally-synthesized) joining `'bundled'` and to reiterate that this fires ONLY for a TRUSTED provenance resolved from the second arg. The resolution at `:242-244` is unchanged.
- `extension/utils/capability-interpreter.js` — `interpretRecipe`: the exempt short-circuit now takes the synchronous bind for `trustedProvenance === 'local'` as well as `'bundled'` (and the bare-core `!envelope` path); placed BEFORE the async verify branch. Comment updated to add `'local'` as the second loader-vouched exempt value and reaffirm the payload's own `provenance` is never consulted (`trustedProvenance` is resolved from `opts` only at `:329-330`, unchanged).

## Decisions Made

- **Add to the exempt-value set, never to the resolution logic.** The entire HI-01 trust boundary lives in HOW provenance is resolved (loader arg / `opts` only). Adding `'local'` as a boolean-OR against the already-resolved trusted value extends the exemption without weakening the boundary — a self-asserted payload `'local'` with no vouch can never reach the short-circuit.
- **Placement before the async verify branch** in the interpreter is load-bearing: it is what makes the exemption a zero-call (the dedicated suite spies on `verifyEd25519` and asserts `verifyCalls === 0`).

## Deviations from Plan

None - plan executed exactly as written. The change is exactly the two boolean-OR additions plus comment updates (no new functions, no signature changes, no new files beyond the SUMMARY).

## Issues Encountered

None. (The duration-computation Bash snippet returned a spurious negative due to a macOS `date -j` parsing quirk; the true wall-clock from the recorded start `02:13:02Z` to completion `02:14:23Z` is ~1 minute. No impact on the implementation.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `'local'` exemption is wired in both the signature module and the interpreter, so Plan 03's `promoteAfterReplay` (which threads `{trustedProvenance:'local'}` through `interpretRecipe → executeBoundSpec`) now binds a learned recipe without a verify call — the D-09 trust contract is complete.
- Remaining Phase 31 work: Plan 05/06 (capture-session entry + the Network-domain `chrome.debugger.onEvent` listener + `background.js` importScripts wiring + the learned T2 router/catalog outranking). No blockers introduced by this plan.

## Self-Check: PASSED

- `31-04-SUMMARY.md` exists.
- `extension/utils/capability-signature.js` contains `resolvedProvenance === 'local'`.
- `extension/utils/capability-interpreter.js` contains `trustedProvenance === 'local'`.
- Task commit `3053f88c` is present in `git log`.

---
*Phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes*
*Completed: 2026-06-23*
