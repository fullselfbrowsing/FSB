---
quick_id: 260701-2lx
slug: make-google-calendar-t1-ready
status: complete
---

# Make Google Calendar T1 Ready

## Scope

Promote the imported Google Calendar (`gcal`) descriptor set to the repo's conservative T1 model:

- Register safe read descriptors as T1a handlers pinned to `https://calendar.google.com`.
- Execute read descriptors through the existing bounded MAIN-world page-read primitive using `window.gapi.client.request`.
- Register write/destructive descriptors as guarded fail-closed handlers that return `RECIPE_DOM_FALLBACK_PENDING` and do not call execution primitives.
- Wire the handler into the service-worker handler manifest and focused T1 readiness tests.

## Tasks

1. Add a `gcal` handler plus Calendar page-read primitive support.
2. Wire the handler into extension registration, readiness reporting, and T1 port contract mappings.
3. Add focused tests for read routing, guarded writes, upgrade resolution, and readiness status.

## Outcome

- Implemented a Google Calendar T1a handler for 9 read descriptors through the bounded page-read `gapi.client.request` bridge.
- Registered 9 write/destructive/freebusy descriptors as guarded fail-closed rows pending live mutation-body UAT.
- Wired the handler into service-worker loading, handler seeding, readiness reporting, port-contract mapping, and origin classification.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`

See `SUMMARY.md` for executed verification and known unrelated blockers.
