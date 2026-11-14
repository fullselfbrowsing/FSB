---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
plan: 01
subsystem: testing
tags: [cors-gate, fail-closed, guarded-writes, inv-03, origin-pin, capability-catalog]

requires:
  - phase: 40-depth-1-hand-ports
    provides: head-handler-upgrade.test.js (dom->T1a upgrade harness), the 4-module head, the typedRecipeError dual-field helper, the consent-mutation-gate posture-B re-gate
provides:
  - tests/guarded-write-failclosed.test.js (the SC1 fail-closed proof harness -- RECIPE_DOM_FALLBACK_PENDING + empty executeBoundSpec recorder + negative control)
  - scripts/verify-origin-classification.mjs (the CORS / first-party-origin verification gate, wired into validate:extension, with a linear separate-origin negative control)
  - head-handler-upgrade.test.js extended with the 7 Phase-41 write slugs (dom->T1a + sideEffectClass write)
  - consent-mutation-gate.test.js extended with the INV-03 byte-equality assert for the new T1a-write RECIPE_DOM_FALLBACK_PENDING reason
affects: [41-02, 41-03, 41-04, 41-05]

tech-stack:
  added: []
  patterns:
    - "Fail-closed write harness: a RECORDING ctx.executeBoundSpec stub whose recorder array MUST stay EMPTY for a guarded write (a fired mutation reds CI); a synthetic mutation-firing negative control proves the recorder is a real proof surface"
    - "Build-time CORS shipping gate: classifyOriginPattern(handlerOrigin, apiBaseUrl) asserts SAME-ORIGIN host equality; a separate-origin head FAILS the build (CORS_SEPARATE_ORIGIN); dual-export ESM (test-driven + CLI) mirroring verify-no-duplicate-stem.mjs"

key-files:
  created:
    - tests/guarded-write-failclosed.test.js
    - scripts/verify-origin-classification.mjs
  modified:
    - tests/head-handler-upgrade.test.js
    - tests/consent-mutation-gate.test.js
    - package.json

key-decisions:
  - "The CORS-gate reads each app's API base-URL from the VENDORED pinned-SHA <app>-api.ts as TEXT (never executes it); github (no vendored plugin) uses its documented https://github.com base via HEAD_APP_MAP fallback"
  - "An UNMAPPED head FAILS the gate (CORS_UNMAPPED_HEAD) -- fail-closed: a new head global with no app->base mapping can never silently pass origin verification"
  - "The fail-closed harness asserts BOTH the dual-field typed reason AND the empty executeBoundSpec recorder; (a)-(d) alone are insufficient because a handler could return the reason yet still have fired a mutation -- (e) the empty recorder is the load-bearing SC1 assertion"

patterns-established:
  - "Wave-0 RED-by-design: existsSync/slug-presence guards emit one deterministic FAIL per absent write slug; GREEN as each plan registers its writes"

requirements-completed: []

duration: 9min
completed: 2026-06-26
---

# Phase 41 Plan 01: Fail-closed harness + CORS-gate + INV-03 extension Summary

**The SC1 fail-closed guarded-write proof harness (RECIPE_DOM_FALLBACK_PENDING + empty executeBoundSpec recorder) and the SC3 CORS / first-party-origin verification gate (4 heads SAME-ORIGIN, linear separate-origin fails the build), both wired into CI, plus the INV-03 byte-equality extension for the new T1a-write reason.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-26T17:53:10Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 edited)

## Accomplishments
- The fail-closed harness: for each of the 7 Phase-41 guarded write slugs, asserts handle() returns the dual-field RECIPE_DOM_FALLBACK_PENDING AND the recording executeBoundSpec recorder stays EMPTY (no mutation fires). A synthetic mutation-firing negative control proves the harness genuinely catches a fired mutation. Wave-0 RED (7 deterministic FAILs until the slugs land); negative control PASSES.
- The CORS-gate: classifies all 4 shipped heads (github/slack/notion/gitlab) SAME-ORIGIN with their vendored API base-URLs, classifies the synthetic linear head (linear.app vs client-api.linear.app) separate (the demote-to-T3 enforcement), and FAILS the build on any separate-origin/unmapped head. Wired into validate:extension after verify-no-duplicate-stem and before verify-no-orphan-descriptor.
- head-handler-upgrade.test.js carries the 7 write rows with the descriptor.sideEffectClass === write assertion (distinct from the read rows).
- consent-mutation-gate.test.js asserts the new T1a-write RECIPE_DOM_FALLBACK_PENDING is byte-equal across code/errorCode/error (INV-03 coverage for the new write reason).

## Task Commits

1. **Task 1: fail-closed harness** + **Task 2: CORS-gate + wiring** + **Task 3: upgrade/consent extensions + npm-test wiring** - `5b93bb00` (test) — committed together as one atomic Wave-0 infrastructure commit (the three tasks share package.json wiring and are a single deliverable boundary)

**Plan metadata:** (this SUMMARY) committed with the phase docs.

## Files Created/Modified
- `tests/guarded-write-failclosed.test.js` - the SC1 keystone harness (created)
- `scripts/verify-origin-classification.mjs` - the CORS / first-party-origin gate (created)
- `tests/head-handler-upgrade.test.js` - added the 7 write slugs + sideEffectClass write assertion
- `tests/consent-mutation-gate.test.js` - added the INV-03 byte-equality block for the T1a-write reason
- `package.json` - wired verify-origin-classification.mjs into validate:extension; guarded-write-failclosed.test.js into npm test

## Decisions Made
- The three Wave-0 tasks were committed in a single atomic commit (they share the package.json wiring edit and form one coherent "Wave-0 safety nets" deliverable; splitting would have produced an intermediate state where the test is unwired).
- Gate reads vendored api.ts as TEXT, never executes it (Wall-1 build-tooling discipline; provenance-pinned SHA).

## Deviations from Plan

**None of substance.** One precision note: the plan's `head-handler-upgrade.test.js` extension was implemented with an `expectWrite` flag on the write rows (branching the sideEffectClass assertion) rather than a separate row array — functionally identical, keeps the existing single-loop structure. Not a behavioral deviation.

## Issues Encountered
None. The slack-api.ts has no static https:// literal (it builds URLs dynamically from workspaceUrl), so the CORS-gate correctly falls back to the documented https://app.slack.com base — verified this is the app.slack.com origin the slack handler pins (not a separate origin).

## Verification
- `node tests/guarded-write-failclosed.test.js` — EXIT 1 (Wave-0 RED, 7 deterministic FAILs + negative control PASS) — correct.
- `node scripts/verify-origin-classification.mjs` — EXIT 0 (4 heads SAME-ORIGIN, linear negative-control separate).
- `node tests/head-handler-upgrade.test.js` — Wave-0 RED on the new write rows (resolve null until slugs land) — correct.
- `node tests/consent-mutation-gate.test.js` — EXIT 0 (34/0, incl the new INV-03 write-reason block).
- `npm run validate:extension` — EXIT 0 (full chain incl the new CORS-gate).

## Next Phase Readiness
- The fail-closed harness + CORS-gate are in place. Plans 02/03/04 land the write slugs (turning the harness GREEN); 41-05 requires the full battery EXIT 0.

---
*Phase: 41-depth-2-remaining-hand-ports-guarded-writes*
*Completed: 2026-06-26*
