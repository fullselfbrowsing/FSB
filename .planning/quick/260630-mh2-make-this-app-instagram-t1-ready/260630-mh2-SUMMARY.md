# Quick Task 260630-mh2 Summary

Date: 2026-06-30
Status: complete
Commit: working-tree

## Result

Made Instagram T1-ready with a conservative public-only head.

Promoted public same-origin reads:

- `instagram.get_post`
- `instagram.get_user_profile`
- `instagram.search`
- `instagram.search_hashtags`
- `instagram.search_users`

Registered guarded fail-closed rows:

- `instagram.create_comment`
- `instagram.follow_user`
- `instagram.get_home_feed`
- `instagram.get_suggested_users`
- `instagram.like_post`
- `instagram.save_post`
- `instagram.send_message`
- `instagram.unfollow_user`
- `instagram.unlike_post`
- `instagram.unsave_post`

The original planner output proposed private/session-bound Instagram reads as well. Those were intentionally not promoted. The implemented handler reads only public profile pages, public post pages, and public topsearch JSON under `https://www.instagram.com`; guarded social/feed/mutation rows return `RECIPE_DOM_FALLBACK_PENDING` without calling `executeBoundSpec`.

## Files

- `catalog/handlers/instagram.js`
- `extension/catalog/handlers/instagram.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/coverage-report.mjs`
- `catalog/write-activation-evidence.json`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`
- `tests/verify-origin-classification.test.js`

## Verification

- `node tests/capability-head-handlers.test.js` -> 623 passed, 0 failed
- `node tests/head-handler-upgrade.test.js` -> 1784 passed, 0 failed
- `node tests/guarded-write-failclosed.test.js` -> 381 passed, 0 failed
- `node tests/t1-readiness-report.test.js` -> 11 passed, 0 failed
- `node tests/t1-terminal-states.test.js` -> 11 passed, 0 failed
- `node tests/verify-origin-classification.test.js` -> 94 passed, 0 failed
- `node tests/head-handler-cap.test.js` -> 5 passed, 0 failed
- `node tests/lattice-provider-bridge-smoke.test.js` -> 101 passed, 0 failed
- `node scripts/verify-origin-classification.mjs` -> PASS
- `node scripts/verify-t1-port-contract.mjs` -> PASS
- `node scripts/verify-write-activation-evidence.mjs` -> PASS
- `node scripts/verify-recipe-path-guard.mjs` -> PASS
- `node scripts/report-t1-readiness.mjs` -> 373 ready, 88 guarded
- `node scripts/verify-t1-readiness-gate.mjs` -> PASS
- `npm run validate:extension` -> PASS

## Notes

No commit was created because this Conductor workspace already had extensive pre-existing shared dirty state from parallel app-head work.
