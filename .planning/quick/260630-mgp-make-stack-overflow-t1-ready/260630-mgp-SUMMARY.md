---
status: complete
quick_id: 260630-mgp
slug: make-stack-overflow-t1-ready
completed_at: "2026-06-30"
commit: working-tree
---

# Quick Task 260630-mgp Summary: Make Stack Overflow T1-ready

## Outcome

Stack Overflow is now T1-ready for the reviewed public first-party HTML read surface.

- 9 Stack Overflow read descriptors resolve as bundled `T1a` handler rows:
  `get_answer`, `get_question`, `get_question_answers`, `get_similar_questions`,
  `get_tag_info`, `list_questions`, `list_tags`, `list_unanswered_questions`,
  and `search_questions`.
- The handler is pinned to `https://stackoverflow.com`, uses only
  `ctx.executeBoundSpec`, accepts `text/html`, and rejects HTTP errors,
  cross-origin redirects, human-verification pages, and unexpected HTML shapes with
  `RECIPE_DOM_FALLBACK_PENDING`.
- Authenticated user/profile/comment rows and Stack Exchange API-dependent rows remain
  unregistered.

## Implementation

- Added `catalog/handlers/stackoverflow.js` and bundled copy
  `extension/catalog/handlers/stackoverflow.js`.
- Wired `FsbHandlerStackoverflow` into `extension/background.js`,
  `extension/utils/capability-catalog.js`, search readiness overrides, readiness
  reporting, coverage, recipe-path guard, T1 port contract, and origin-classification
  proofing.
- Added Stack Overflow behavior tests for URL construction, public HTML parsing,
  inactive rows, no direct network/browser APIs, human-verification fallback, and
  bundled-copy drift.

## Verification

Passed:

- `node -c catalog/handlers/stackoverflow.js`
- `node -c extension/catalog/handlers/stackoverflow.js`
- `cmp -s catalog/handlers/stackoverflow.js extension/catalog/handlers/stackoverflow.js`
- `node tests/capability-head-handlers.test.js` (`621 passed`, `0 failed`)
- `node tests/head-handler-cap.test.js` (`5 passed`, `0 failed`)
- `node tests/head-handler-upgrade.test.js` (`1734 passed`, `0 failed`)
- `node tests/lattice-provider-bridge-smoke.test.js` (`101 passed`, `0 failed`)
- `node tests/verify-origin-classification.test.js` (`92 passed`, `0 failed`)
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node tests/t1-readiness-report.test.js` (`11 passed`, `0 failed`)
- `node tests/t1-terminal-states.test.js` (`11 passed`, `0 failed`)

Known shared-state failure unrelated to Stack Overflow:

- `node scripts/verify-t1-port-contract.mjs` fails on Pinterest side-effect-class
  expectations for `pinterest.follow_user`, `pinterest.save_pin`, and
  `pinterest.unfollow_user`.

## Commit

Working tree only. The workspace contains many concurrent quick-task edits in shared
catalog, test, and planning files, so this Stack Overflow quick task was not committed
independently.
