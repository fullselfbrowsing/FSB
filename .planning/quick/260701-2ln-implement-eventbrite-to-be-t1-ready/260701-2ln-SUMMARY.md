---
quick_id: 260701-2ln
slug: implement-eventbrite-to-be-t1-ready
description: Implement Eventbrite to be T1 ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260701-2ln Summary

## Outcome

Eventbrite is T1-ready for the reviewed safe surface:
- `eventbrite.search_events`, `eventbrite.get_event`, and `eventbrite.list_orders` resolve as T1a read handlers on `https://www.eventbrite.com`.
- `eventbrite.register_for_event` resolves as a T1a guarded write and remains fail-closed because it can register paid tickets or charge a saved payment method.

## Implementation

- Added `catalog/handlers/eventbrite.js` and the matching unpacked extension copy.
- Wired `FsbHandlerEventbrite` into background loading, head-handler catalog registration, readiness/search overrides, T1 port verification, recipe-path guard allowlist, coverage reporting, origin-classification proofing, and guarded write evidence.
- Added focused tests for upgrade resolution, guarded write fail-closed behavior, readiness reporting, terminal-state surfacing, and direct handler fixture behavior.

## Verification

Passing Eventbrite-focused checks:
- `node --check catalog/handlers/eventbrite.js`
- `node --check tests/capability-head-handlers.test.js`
- `node --check tests/t1-terminal-states.test.js`
- Direct resolver smoke for all four Eventbrite slugs
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- Eventbrite block inside `node tests/capability-head-handlers.test.js`

Broader shared gates still have unrelated concurrent failures:
- `tests/capability-head-handlers.test.js`: Home Depot and Sentry failures.
- `tests/t1-terminal-states.test.js`: missing evidence/search override rows for other concurrently added apps.
- `scripts/verify-t1-port-contract.mjs`, `scripts/verify-origin-classification.mjs`, `scripts/verify-recipe-path-guard.mjs`, `scripts/verify-write-activation-evidence.mjs`, and `tests/lattice-provider-bridge-smoke.test.js`: unrelated in-flight app/count drift.

## Commit

Not committed. The workspace contains extensive concurrent uncommitted changes in shared files, and staging those files would not produce an Eventbrite-only atomic commit.
