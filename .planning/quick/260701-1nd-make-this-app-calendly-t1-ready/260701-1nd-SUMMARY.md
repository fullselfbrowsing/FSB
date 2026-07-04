---
quick: 260701-1nd
status: complete
completed_at: 2026-07-01
commit: working-tree
---

# Quick 260701-1nd Summary: Calendly T1 Readiness

## Outcome

Calendly is T1-ready through a reviewed `FsbHandlerCalendly` head pinned to `https://calendly.com`.

Nine read slugs now execute through bounded same-origin `/api` GET specs after a CSRF meta bootstrap:

- `calendly.get_current_user`
- `calendly.get_event_type`
- `calendly.get_organization`
- `calendly.get_organization_statistics`
- `calendly.get_user_busy_times`
- `calendly.get_user_permissions`
- `calendly.list_calendar_accounts`
- `calendly.list_event_types`
- `calendly.list_scheduled_events`

Six event-type mutation slugs are registered as T1a guarded fail-closed rows and call no execution primitive until live mutation-body UAT exists:

- `calendly.activate_event_type`
- `calendly.clone_event_type`
- `calendly.create_event_type`
- `calendly.deactivate_event_type`
- `calendly.delete_event_type`
- `calendly.update_event_type`

## Notes

- Descriptors remain `backing:"dom"`; runtime handler registration and readiness overrides provide the T1 terminal state, matching the existing T1 port pattern.
- The shared workspace already had other active T1 head changes, so this quick records `working-tree` rather than an isolated atomic commit.

## Verification

- `npm run package:extension`
- `node --check catalog/handlers/calendly.js`
- `node --check extension/catalog/handlers/calendly.js`
- `cmp -s catalog/handlers/calendly.js extension/catalog/handlers/calendly.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run validate:extension`
