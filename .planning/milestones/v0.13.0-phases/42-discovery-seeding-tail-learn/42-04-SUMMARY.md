---
phase: 42-discovery-seeding-tail-learn
plan: 04
subsystem: api
tags: [capability-router, recipe-learn-pending, affordance, inv-03, learn-pending]

requires:
  - phase: 42-discovery-seeding-tail-learn
    provides: 42-03 (the resolve seed->T2-no-recipe leg)
provides:
  - "capability-router.js RECIPE_LEARN_PENDING actionable affordance (additive reason/actionable/message; INV-03 byte-stable code)"
  - "tests/recipe-learn-pending-affordance.test.js (additive fields + INV-03 triple byte-equality + with-recipe control)"
affects: [42-05-battery]

tech-stack:
  added: []
  patterns:
    - "Additive error-field enrichment via _err's extra-merge: surface an actionable affordance while keeping the typed code byte-stable (INV-03)"

key-files:
  created:
    - tests/recipe-learn-pending-affordance.test.js
  modified:
    - extension/utils/capability-router.js

key-decisions:
  - "Origin for the message = entry.descriptor.origin || c.origin || host-less fallback; for a seed->T2 descriptor (which carries service, not origin) this resolves to the active call origin c.origin -- exactly the origin the user must open"
  - "The _err first arg stays the literal 'RECIPE_LEARN_PENDING' so code===errorCode===error is byte-stable; reason/actionable/message are purely additive"

patterns-established:
  - "Pattern: the no-learned-recipe T2 leg returns an actionable 'open <origin> to learn it' affordance, not a silent no-op"

requirements-completed: [DSEED-01]

duration: 2min
completed: 2026-06-26
---

# Phase 42 Plan 04: RECIPE_LEARN_PENDING Actionable Affordance Summary

**The silent RECIPE_LEARN_PENDING no-op becomes an actionable affordance — the router T2-no-learned-recipe leg now returns additive `{ reason:'not-yet-learned', actionable:true, message:'Open <origin> while signed in so FSB can learn this capability from your own traffic.' }` while the dual/triple-field `code === errorCode === error === 'RECIPE_LEARN_PENDING'` stays byte-stable (INV-03).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-26T19:50:04Z
- **Completed:** 2026-06-26T19:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `capability-router.js` T2 branch: the no-recipe leg now builds an actionable message (origin = `entry.descriptor.origin || c.origin || host-less fallback`) and returns it via `_err('RECIPE_LEARN_PENDING', { slug, reason, actionable, message })`. The `_err` first arg is unchanged, so INV-03's `code===errorCode===error` triple stays byte-stable; the fields are additive.
- The T2-WITH-recipe declarative dispatch leg (`trustedProvenance:'local'`), the consent gate, and every other branch are unchanged.
- `tests/recipe-learn-pending-affordance.test.js` (15/15 GREEN): INV-03 triple byte-equality, the additive fields (reason/actionable/message naming the origin + containing 'learn'), the slug field present, the no-dispatch assertion, and a with-recipe control proving the change is scoped to the no-recipe leg.

## Task Commits

1. **Task 1: RECIPE_LEARN_PENDING actionable affordance** - `c80b75bb` (feat)
2. **Task 2: recipe-learn-pending-affordance test** - `af8f58bf` (test)

## Files Created/Modified
- `extension/utils/capability-router.js` - the additive affordance on the T2 no-recipe leg
- `tests/recipe-learn-pending-affordance.test.js` - the additive-fields + INV-03 byte-stable + with-recipe-control proof

## INV-03 byte-stable triple (reference for Plan 05's INV-03 battery)
`code === errorCode === error === 'RECIPE_LEARN_PENDING'` (exact). The message wording:
`'Open ' + origin + ' while signed in so FSB can learn this capability from your own traffic.'`
(host-less fallback: `'Open the site while signed in so FSB can learn this capability from your own traffic.'`).

## Decisions Made
- For a seed->T2 descriptor (which carries `service` but not `origin`), the message origin resolves to the active call origin `c.origin` — exactly the origin the user is invoking against and must open while signed in.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Wave 1 is fully GREEN (the 119-app no-leak, seed->T2 resolve, the affordance, promote-after-replay, INV-01/INV-03), `package-extension` runs clean, and `validate:extension` passes.
- Plan 05's closing battery can run: full `npm test` + validate:extension + the no-manifest-change + capture-core-unchanged git-diff asserts + the human-UAT doc.

---
*Phase: 42-discovery-seeding-tail-learn*
*Completed: 2026-06-26*

## Self-Check: PASSED

All files exist; both task commits (c80b75bb, af8f58bf) present.
