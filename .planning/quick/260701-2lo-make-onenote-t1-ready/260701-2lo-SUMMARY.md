---
status: complete
quick_id: 260701-2lo
slug: make-onenote-t1-ready
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260701-2lo: Make OneNote T1-ready

## Outcome

OneNote is wired as a T1a Microsoft Graph read head. The handler exposes eight read capabilities as `t1-ready` handler rows and keeps four write/create capabilities guarded fail-closed until live mutation-body UAT exists.

## Implementation

- Added `catalog/handlers/onenote.js` and mirrored it to `extension/catalog/handlers/onenote.js`.
- Added a bounded OneNote `auth_context` page-read branch in `extension/utils/capability-fetch.js` that returns only a Graph bearer token from page-owned MSAL storage.
- Registered OneNote in the background import list, head manifest, readiness/search overrides, port/origin verification, recipe-path guard, and guarded-write evidence ledger.
- Added focused coverage for handler mapping, no token leakage, guarded writes, page-read token extraction, origin classification, readiness reporting, and head-cap accounting.

## Verification

- `node tests/capability-fetch.test.js` passed: 55 passed, 0 failed.
- Direct OneNote readiness assertion passed: all eight OneNote reads are `t1-ready` handler rows; all four OneNote writes are `t1-guarded-fail-closed` handler rows.
- `node tests/head-handler-cap.test.js` passed: 5 passed, 0 failed.
- Syntax/mirror sweep passed for the OneNote handler, mirrored extension handler, touched utility files, scripts, and tests.
- `node tests/capability-head-handlers.test.js` has all OneNote assertions passing, but the full suite still fails on unrelated Home Depot, Shopify, and Airtable assertions.
- `node tests/head-handler-upgrade.test.js` and `node tests/guarded-write-failclosed.test.js` are blocked by an unrelated pre-existing `catalog/handlers/aws.js` syntax error.
- Repo-wide T1/reporting gates still have unrelated failures from other in-flight app heads and evidence rows.

## Notes

No commit was created. Several shared files touched for OneNote already had broad parallel-agent edits, so staging them would have mixed unrelated work into the quick commit.

The quick id `260701-2lo` collides with another parallel quick row in `.planning/STATE.md`; the OneNote directory slug is unique.
