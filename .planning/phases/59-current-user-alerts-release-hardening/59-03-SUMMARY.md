---
phase: 59-current-user-alerts-release-hardening
plan: "03"
subsystem: alert-hud
tags: [projection, accessibility, confirmation, owner-mapping, currentness]
completed: 2026-08-27
requirements-completed: [ALERT-02, ALERT-03, ALERT-05, VERIFY-03]
---

# Phase 59 Plan 03 — Current Alert Status and Owner Mapping HUD Summary

**The existing folder and reading HUD now shows minimized current local-alert state, omits unavailable placeholders, and offers one-use, explicitly confirmed current-owner mapping or removal without exposing account, source, alarm, notification, or stable owner identifiers.**

## Delivered

- Extended the closed HUD schema and projector with scheduled, attempted, delivered, failed, missed, and not-locally-deliverable states plus opaque confirmation-required mapping/removal actions.
- Joined only the current background alert assessment into folder and reading projections. Missing or ambiguous owners are explicit, while unavailable/not-evaluated alert state is structurally omitted.
- Registered alert actions in the existing projection controller with exact action epochs, private partition/owner/source/digest authority, minimized consequences, one-use confirmation tokens, drift rejection, and replay rejection.
- Re-derives the current corpus, graph, truth, deadline, owner, source revisions, partition, and mapping before any mapping mutation. Successful mapping or removal reconciles durable alerts; removal supersedes pending owner alerts.
- Added closed composer copy for every public alert state and rendered status, detail, alert date, and deadline through text-only sinks and semantic `time` elements.
- Reused the existing 384px shell and modal confirmation surface with native buttons, safe initial focus, current authority checks, narrow-layout behavior, and exact teardown.
- Updated the deterministic HUD oracle so the old permanent “Notification delivery — Not available” placeholder is now forbidden.

## Commit

1. `ef1116c3` — current alert projection, accessible HUD status, and confirmed owner-mapping lifecycle

## Verification

```text
npm run test:skopeo-hud-evals                 PASS (34/34 deterministic cases)
node tests/skopeo-adaptive-composer.test.js   PASS
node tests/skopeo-hud-runtime.test.js         PASS
node tests/skopeo-session-lifecycle.test.js   PASS
node tests/skopeo-shell-contract.test.js      PASS
node tests/skopeo-browser-contract.test.js    PASS (local Google Chrome)
npm run validate:extension                    PASS (451 JS files)
node --check extension/background.js          PASS
git diff --check                              PASS
```

## Honest Boundary

The automated suite proves the production projection, action, confirmation, currentness, accessibility, and teardown paths. It does not claim that a real Chrome profile has displayed the notification or that an authorized live Drive corpus has completed mapping/removal; those observations remain human-needed for Plans 59-04 and 59-05.

## Next

Plan 59-04 can assemble the versioned golden corpus, adversarial release aggregate, and honest live/human evidence ledger across the alert and existing HUD boundaries.
