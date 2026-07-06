---
quick_id: 260630-qj4
slug: make-this-app-hack2hire-t1-ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Summary: Make Hack2Hire T1-Ready

Implemented a Hack2Hire T1a read head for all 14 Hack2Hire descriptors:

- `hack2hire.get_comment`
- `hack2hire.get_company_question_stats`
- `hack2hire.get_completed_question_count`
- `hack2hire.get_current_user`
- `hack2hire.get_question`
- `hack2hire.get_question_neighbors`
- `hack2hire.get_subscription`
- `hack2hire.list_comment_replies`
- `hack2hire.list_companies`
- `hack2hire.list_my_bookmarks`
- `hack2hire.list_my_visits`
- `hack2hire.list_question_coding_problems`
- `hack2hire.list_question_comments`
- `hack2hire.list_questions`

## What Changed

- Added `catalog/handlers/hack2hire.js` as the canonical handler and regenerated the extension handler mirror.
- Added bounded bearer-from-storage support to `capabilityFetchInPage` for JSON-string `ALGRO_TOKEN` plus `USER_ID` values, with token material kept inside the origin-pinned page fetch.
- Registered Hack2Hire in the background loader, head catalog, readiness report, coverage report, T1 port contract, recipe-path guard, and origin classification gate.
- Added an explicit `SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ` origin-classification accommodation for `https://www.hack2hire.com` -> `https://api.hack2hire.com/algro/v1`.
- Regenerated `extension/catalog/recipe-index.generated.js` with `node scripts/package-extension.mjs`.

## Verification

Passed:

- `node tests/capability-fetch.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`

Hack2Hire-specific assertions passed inside:

- `node tests/capability-head-handlers.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`

Known unrelated residual failures in the shared dirty workspace:

- `node tests/capability-head-handlers.test.js` fails one MSWord assertion: `msword.js contains no Graph token, Authorization, cookie, or storage path`.
- `node tests/verify-origin-classification.test.js` and `node scripts/verify-origin-classification.mjs` fail because the concurrently added Snowflake, Discord, and PowerPoint heads are unmapped in `HEAD_APP_MAP`.

## Notes

No commit was created. The workspace already contained substantial unrelated dirty work from parallel agents, so this quick task is recorded as `working-tree`.
