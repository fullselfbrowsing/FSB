---
status: complete
completed: 2026-07-01T03:31:06Z
quick_id: 260630-u7s
slug: make-this-app-todoist-t1-ready
commit: working-tree
---

# Summary

Made Todoist T1-ready across all 33 existing `todoist.*` descriptors.

Todoist now has 12 executable T1a read handlers backed by same-origin `/api/v1` requests through `executeBoundSpec`, with bearer auth read from `localStorage.User.token`. The 21 write/destructive Todoist actions are registered as guarded fail-closed handlers and return `RECIPE_DOM_FALLBACK_PENDING` until live mutation UAT evidence exists.

## Files Changed

- Added `catalog/handlers/todoist.js` and packaged it to `extension/catalog/handlers/todoist.js`.
- Marked Todoist descriptors and seed fixtures as handler-backed.
- Registered Todoist in service-worker startup, head seeding, readiness reporting, and T1 port verification.
- Extended storage bearer extraction to read token fields from parsed JSON localStorage objects.
- Added guarded write evidence for Todoist mutations and refreshed readiness/write-evidence tests.

## Result

- Todoist readiness: 33 total rows, all `T1a`.
- T1-ready reads: 12.
- Guarded fail-closed writes/destructive actions: 21.

## Verification

Passed:

- `node tests/capability-fetch.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`

Notes:

- The workspace is shared and already contains many uncommitted T1 app migrations from other agents. This quick task remains recorded as `working-tree` rather than a standalone commit.
