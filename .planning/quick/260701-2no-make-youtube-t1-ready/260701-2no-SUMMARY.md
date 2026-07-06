---
status: complete
quick_id: 260701-2no
slug: make-youtube-t1-ready
completed_at: "2026-07-01T15:15:11Z"
commit: working-tree
---

# Quick Task 260701-2no Summary: Make YouTube T1-ready

## Outcome

YouTube is T1-terminal as blocked-policy under the current denylist posture.

No `FsbHandlerYouTube` module, recipe, descriptor backing promotion, or search readiness override was added. The existing policy hard floor has `https://youtube.com` and `https://www.youtube.com` in denied origins, so the readiness generator must classify every `youtube.*` descriptor as non-executable `blocked` before any handler or guarded override can make it T1-ready.

This task made that outcome explicit and regression-tested:

- all 18 `youtube.*` descriptors are `readiness: blocked`, `originClass: denied`, `routeFeasibility: blocked`, and have no handler/recipe proof
- all 18 terminal-state rows are `blocked-policy` with `executionEnabled: false`
- the 4 YouTube write/destructive ledger rows are `blocked-policy` with `activationAllowed: false`
- the classification roster and legal docs now name main YouTube origins alongside YouTube Music in the denied media/social set

## Verification

Passed:

- `node scripts/verify-classification-gate.mjs`
- `node tests/t1-readiness-report.test.js`
- `node tests/service-denylist.test.js`
- `node tests/t1-terminal-states.test.js`
- direct YouTube-only readiness/terminal/ledger check
- no YouTube handler or recipe files exist in `catalog/handlers`, `extension/catalog/handlers`, `catalog/recipes`, or `catalog/recipes/generated`
- `git diff --check -- docs/LEGAL.md extension/config/service-denylist.json scripts/verify-classification-gate.mjs tests/service-denylist.test.js tests/t1-readiness-report.test.js tests/t1-terminal-states.test.js .planning/quick/260701-2no-make-youtube-t1-ready/260701-2no-PLAN.md .planning/quick/260701-2no-make-youtube-t1-ready/260701-2no-SUMMARY.md`

Blocked by unrelated shared-worktree drift:

- `npm run validate:extension` fails before reaching the later T1 checks because the shared workspace currently has a syntax error in `extension/utils/capability-search.js` at the `T1_READY_SLUGS` object.

## Commit

Working tree only. The workspace has concurrent dirty edits across shared T1 gate files and generated planning state, so this quick task was not committed independently.
