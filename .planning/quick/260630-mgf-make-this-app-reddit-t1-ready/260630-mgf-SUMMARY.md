---
status: complete
quick_id: 260630-mgf
slug: make-this-app-reddit-t1-ready
completed_at: "2026-06-30T21:25:31Z"
commit: working-tree
---

# Quick Task 260630-mgf Summary: Make this app Reddit T1-ready

## Outcome

Reddit is now T1-ready for the safe bundled read surface.

- 13 Reddit same-origin `.json` GET read descriptors resolve as `T1a` and `t1-ready`.
- Runtime specs are pinned to `https://www.reddit.com` and execute only through `ctx.executeBoundSpec`.
- Mutation, write, modhash, and cross-domain token flows remain unregistered.
- Global readiness report after regeneration: 2,314 descriptors, 128 apps, 391 ready, 59 guarded, 1,670 discovery-pending, 194 blocked.

## Implementation

- Added `catalog/handlers/reddit.js` and bundled copy `extension/catalog/handlers/reddit.js`.
- Wired `FsbHandlerReddit` into `extension/background.js` and `extension/utils/capability-catalog.js`.
- Registered the 13 ready Reddit slugs in search readiness, upgrade tests, readiness reports, coverage, recipe-path guard, T1 port contract, and origin-classification proofing.
- Added Reddit handler tests for URL construction, parsing, fallback-on-bad-shape behavior, inactive mutation rows, no direct network calls, and bundled copy drift.
- Rebuilt the extension package: `dist/fsb-extension-v0.9.90.zip`.

## Verification

Passed:

- `node -c catalog/handlers/reddit.js`
- `node -c extension/catalog/handlers/reddit.js`
- `node tests/capability-head-handlers.test.js` (`575 passed`, `0 failed`)
- `node tests/head-handler-upgrade.test.js` (`1460 passed`, `0 failed`)
- `node tests/head-handler-cap.test.js` (`5 passed`, `0 failed`)
- `node scripts/verify-origin-classification.mjs`
- `node tests/verify-origin-classification.test.js` (`91 passed`, `0 failed`)
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node tests/t1-readiness-report.test.js` (`11 passed`, `0 failed`)
- `node tests/t1-tail-worklist.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `npm run package:extension`

Shared-state failures observed:

- `node scripts/report-t1-terminal-states.mjs` fails on unrelated Netlify, Instagram, and MongoDB write/guarded evidence gaps.
- `node scripts/verify-t1-port-contract.mjs` fails on unrelated MongoDB verifier mapping and guarded-handler gaps.
- `node tests/t1-terminal-states.test.js` fails on unrelated Instagram, Netlify, MongoDB evidence and Instagram/Priceline search-readiness override gaps.

## Commit

Working tree only. This workspace already contained concurrent unrelated quick-task edits in shared catalog, test, and planning files, so the Reddit quick task was not committed independently.
