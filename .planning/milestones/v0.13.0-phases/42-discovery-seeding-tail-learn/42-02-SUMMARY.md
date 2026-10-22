---
phase: 42-discovery-seeding-tail-learn
plan: 02
subsystem: api
tags: [redactor, security, network-capture, discovery-seeds, synthesizer, no-leak]

requires:
  - phase: 42-discovery-seeding-tail-learn
    provides: 42-01 (discovery-seeds.json, the RED-first 119-app redaction test)
provides:
  - "network-capture-redactor.js: AUTH_CARRIER_DENYLIST widened to the 119-app universe + HEADER_NAME_TOKEN_SHAPES + _shapePath path-segment token scrub (:tok)"
  - "network-capture.js: loadSeeds()/getSeedsSync()/getSeedForOrigin() lazy no-throw loader (additive; capture core byte-unchanged)"
  - "recipe-synthesizer.js: seedMatch recognition-bias flag (metadata only; recipe vocab byte-identical; never executes)"
affects: [42-03-seed-resolve, 42-04-affordance, 42-05-battery]

tech-stack:
  added: []
  patterns:
    - "Structure-only path-segment scrub: token-SHAPED segments masked to :tok via a PRECISE distinctive-prefix set (no value-read; benign slugs survive literal)"
    - "Lazy no-throw config loader mirroring service-denylist (SW fetch + Node require + degrade-to-empty), additive to an existing module's export surface"
    - "Recognition-bias metadata flag on candidate bookkeeping (sibling of flaggedForPhase32), never in the schema-validated recipe core"

key-files:
  created: []
  modified:
    - extension/utils/network-capture-redactor.js
    - extension/utils/network-capture.js
    - extension/utils/recipe-synthesizer.js
    - tests/network-capture-redaction.test.js

key-decisions:
  - "Denylist additions anchored to auth-bearing forms (.*-client-id / .*-application-id / .*-security-token / .*-customer-token, x-amz-*, organization, the token/api-key/session families) so benign look-alikes (content-id, request-id, x-correlation-id, etag) are NOT over-matched (verified: 0 benign headers dropped)"
  - "Path scrub uses the EXACT plan distinctive-prefix set (JWT eyJ...\\. / sk_live_ / gho_ / xoxb- / AKIA(20) / ya29. / u!); NO broad separator rule (the synthesizer already parameterizes prefixless high-entropy segments)"
  - "Seed match: exact path / template-equivalent / static-prefix; an origin-only seed matches on origin alone (recognition bias is sufficient per SC1)"

patterns-established:
  - "Pattern: _shapePath(pathname) -> ':tok'-masked pathname, called inside _shapeUrl before the path is returned"
  - "Pattern: _seedMatches(origin, observedPath, template) typeof-guarded over FsbNetworkCapture.getSeedForOrigin"

requirements-completed: [DSEED-01, DSEED-02]

duration: 6min
completed: 2026-06-26
---

# Phase 42 Plan 02: Redactor 119-App No-Leak + Seed Loader + Recognition Bias Summary

**The DSEED-02 security headline GREEN: AUTH_CARRIER_DENYLIST widened to the 119-app auth-carrier universe + a structure-only `_shapePath` token-segment scrub (`:tok`) closes the SC3 sink-#1 path-token leak (JWT / sk_live_ / gho_ / xoxb- / AKIA / ya29. / `u!` share-id) while benign hyphenated slugs survive literal — plus a lazy no-throw seed loader and a metadata-only synthesizer recognition bias that never executes.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-26T19:40:16Z
- **Completed:** 2026-06-26T19:46Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- **The redactor 119-app no-leak GREEN** (`tests/network-capture-redaction.test.js` PASS=130 FAIL=0):
  - **(A)** `AUTH_CARRIER_DENYLIST` widened to the 119-app universe: csrf/xsrf any-position, the `*token*`/`*api-key*`/`*session*`/`-client-id`/`-application-id`/`-security-token`/`-customer-token` families, `organization`, `x-amz-*`, `x-org*`, `x-modhash`, `x-ig-app-id`, `x-notion-active-user-header`, `x-restli-protocol-version`, `x-twitter-auth-type`, `sessionid`. Anchored to auth-bearing forms — **0 benign headers over-matched** (content-id, request-id, x-correlation-id, x-trace-id, etag, ... all survive). Plus `HEADER_NAME_TOKEN_SHAPES` defense-in-depth applied to the NAME only.
  - **(B)** `_shapePath` masks token-shaped PATH SEGMENTS to `:tok` in `_shapeUrl` before the path is returned. PRECISE distinctive-prefix set; benign slugs survive literal.
  - The structure-only invariant holds: `redactRequest` -> exactly `{method,path,origin,headerNames}` (names-only loop, no value-read); `redactResponse` -> exactly `{status,mimeType}`. Module stays dynamic-code-free (Wall-1 guard GREEN).
- **Seed loader** in `network-capture.js`: `loadSeeds()`/`getSeedsSync()`/`getSeedForOrigin()` mirror service-denylist (SW fetch + Node require + degrade-to-empty, no-throw). ADDITIVE only — the capture core (`startSession`/`_onCdpEvent`/`endSession`) + consent gate (`_runGate`) are byte-unchanged (git diff: 111 insertions, 0 core-function touches).
- **Synthesizer recognition bias**: a `seedMatch` metadata flag on the candidate bookkeeping when a captured call's origin+path matches a seed; recipe vocab BYTE-IDENTICAL to the no-seed case; synthesize stays pure (no fetch).

## Task Commits

1. **Task 1: Redactor denylist + path-segment scrub (119-app GREEN)** - `ec593410` (feat)
2. **Task 2: discovery-seeds loader in network-capture.js** - `60d68365` (feat)
3. **Task 3: synthesizer seed recognition bias** - `31117eb3` (feat)

## Files Created/Modified
- `extension/utils/network-capture-redactor.js` - widened denylist + `HEADER_NAME_TOKEN_SHAPES` + `_shapePath`/`_TOKEN_SHAPES` (the path scrub lives in `_shapeUrl` via `_shapePath`)
- `extension/utils/network-capture.js` - `loadSeeds`/`getSeedsSync`/`getSeedForOrigin` (additive exports)
- `extension/utils/recipe-synthesizer.js` - `_capture`/`_seedMatches` accessor + the `seedMatch` flag on the synthesize return
- `tests/network-capture-redaction.test.js` - corrected the AWS path sentinel to a real 20-char AKIA shape (deviation, below)

## GREEN-target reference for Plan 05's battery
- **Denylist additions** (regex families): see `AUTH_CARRIER_DENYLIST` in `network-capture-redactor.js`.
- **Path-scrub distinctive-prefix set** (`_TOKEN_SHAPES`): JWT `^eyJ[A-Za-z0-9_-]{10,}\.`, stripe `^(sk|pk|rk)_(live|test)_`, github `^gh[opsur]_`, slack `^xox[bcpars]-`, aws `^(AKIA|ASIA)[A-Z0-9]{16}$`, google `^ya29\.`, MS Graph `^u!`. The scrub lives in `_shapeUrl` -> `_shapePath`.
- **Loader accessors**: `FsbNetworkCapture.getSeedForOrigin(origin)` -> `{ hints, provenance } | null`.
- **seedMatch flag**: on the synthesize() return object bookkeeping (sibling of `flaggedForPhase32`), NOT in the recipe core.

## Decisions Made
- Denylist anchored to auth-bearing suffixes/prefixes (not bare `*-id`) to avoid sweeping benign correlation/request id headers — verified against an 18-header benign control.
- Path scrub kept to the exact plan distinctive-prefix set; no broad base64url/hex rule (favor LITERAL on ambiguity; the synthesizer already handles prefixless high-entropy segments).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the Plan-01 AWS path-token test sentinel to a real AWS-key shape**
- **Found during:** Task 1 (running the redaction test after the path scrub)
- **Issue:** The Plan-01 AWS path sentinel `AKIADISTINCTAWSPATH99` was 21 chars (`AKIA` + 17), which is NOT a valid AWS access-key-id shape (real keys are `AKIA` + exactly 16 = 20 chars). The PRECISE scrub pattern `^(AKIA|ASIA)[A-Z0-9]{16}$` correctly did NOT mask the malformed sentinel, leaving 3 assertions RED.
- **Fix:** Changed the sentinel to a real 20-char AKIA shape (`AKIADISTINCTAWS9X99Z`) so the test faithfully models the real AWS-key leak vector. The scrub stayed at the plan's exact precise pattern (NOT loosened) and the no-leak assertion is preserved.
- **Files modified:** tests/network-capture-redaction.test.js
- **Verification:** redaction test PASS=130 FAIL=0; the 20-char key masks to `:tok`.
- **Committed in:** ec593410 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — a malformed test fixture, not a scrub weakening)
**Impact on plan:** The security assertion is strengthened (now models the real AWS-key shape). No scope creep; the scrub is exactly the plan spec.

## Issues Encountered
None beyond the deviation above.

## Next Phase Readiness
- The DSEED-02 redactor headline is GREEN; the seed loader + recognition bias are wired.
- Plan 03 (resolve seed->T2) consumes `FsbNetworkCapture.getSeedForOrigin`.
- Plan 05's git-diff capture-core-unchanged assert will pass (network-capture.js change is purely additive; the redactor/synthesizer changes do not touch the capture core, the consent gate, or discovery-session.js).

---
*Phase: 42-discovery-seeding-tail-learn*
*Completed: 2026-06-26*

## Self-Check: PASSED

All modified files exist; all 3 task commits (ec593410, 60d68365, 31117eb3) present.
