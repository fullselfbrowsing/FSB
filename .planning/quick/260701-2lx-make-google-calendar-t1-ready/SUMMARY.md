---
quick_id: 260701-2lx
slug: make-google-calendar-t1-ready
status: complete
date: 2026-07-01
commit: working-tree
---

# Google Calendar T1 Readiness Summary

## Summary

Google Calendar now follows the repo's conservative T1 pattern:

- `gcal` read descriptors resolve as `T1a` handler proof pinned to `https://calendar.google.com`.
- Reads execute through `executeBoundPageRead`, keeping `window.gapi.client.request` inside the Calendar page context.
- Mutation/freebusy descriptors return dual-field `RECIPE_DOM_FALLBACK_PENDING` and call no execution primitive until live mutation-body UAT exists.

## Changed Files

- `catalog/handlers/gcal.js`
- `extension/catalog/handlers/gcal.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-router.js`
- `extension/utils/capability-catalog.js`
- `extension/background.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `tests/gcal-t1-ready.test.js`

## Verification

Passed:

- `node -c catalog/handlers/gcal.js`
- `node -c extension/catalog/handlers/gcal.js`
- `node -c extension/utils/capability-fetch.js`
- `node -c scripts/verify-origin-classification.mjs`
- `node tests/gcal-t1-ready.test.js`
- Focused handler assertions inside `node tests/capability-head-handlers.test.js` passed for Google Calendar.
- Readiness probe showed 9 `gcal.*` reads as `t1-ready` and 9 write/destructive/freebusy rows as `t1-guarded-fail-closed`.
- Origin-classification probe showed `FsbHandlerGcal` same-origin with `https://calendar.google.com/calendar/v3` and no Calendar failures.

Blocked by unrelated dirty-worktree failures:

- `node tests/capability-head-handlers.test.js` later fails on existing Shopify/Airtable assertions and an AWS handler syntax error.
- `node tests/head-handler-upgrade.test.js` fails on the same AWS handler syntax error.
- `node tests/guarded-write-failclosed.test.js` fails on the same AWS handler syntax error after Calendar guarded rows pass.
- `node tests/t1-readiness-report.test.js` fails on existing AWS/GCloud readiness rows.
- `node scripts/verify-t1-port-contract.mjs` fails on existing PostHog/Tinder/AWS/TikTok issues.
