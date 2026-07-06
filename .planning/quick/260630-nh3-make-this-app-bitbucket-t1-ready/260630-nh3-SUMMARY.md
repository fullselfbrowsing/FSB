---
quick: 260630-nh3
status: complete
subsystem: capability-t1
tags: [bitbucket, t1, same-origin, guarded-writes]
requirements_completed:
  - QT-260630-nh3
completed: 2026-06-30
commit: working-tree
key-files:
  modified:
    - catalog/handlers/bitbucket.js
    - extension/catalog/handlers/bitbucket.js
    - extension/catalog/recipe-index.generated.js
    - extension/utils/capability-search.js
    - scripts/report-t1-readiness.mjs
    - catalog/write-activation-evidence.json
    - tests/capability-head-handlers.test.js
    - tests/head-handler-upgrade.test.js
    - tests/guarded-write-failclosed.test.js
    - tests/t1-readiness-report.test.js
    - tests/t1-terminal-states.test.js
---

# Quick 260630-nh3: Bitbucket T1 Summary

Bitbucket now has full app-level T1 terminal coverage under the current safety
policy: 18 read descriptors are direct same-origin T1a handlers, and 9 mutation
descriptors are guarded fail-closed rows.

## Accomplishments

- Expanded `FsbHandlerBitbucket` from 3 reads to all 18 existing Bitbucket reads:
  repository, workspace, branch/tag, commit, pull request, pipeline, file, and code
  search reads.
- Kept all Bitbucket reads pinned to `https://bitbucket.org` and `/!api/2.0` through
  `ctx.executeBoundSpec`; the handler contains no direct browser scripting, direct
  network call, token replay, or storage credential paths.
- Registered 9 Bitbucket write/destructive descriptors as inert guarded T1a handlers
  that return dual-field `RECIPE_DOM_FALLBACK_PENDING` and never call
  `ctx.executeBoundSpec`.
- Added Bitbucket read and guarded-write readiness overrides plus guarded evidence
  records.
- Refreshed the bundled extension handler copy and generated catalog snapshot with
  `node scripts/package-extension.mjs`.

## Verification

Passed:
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/head-handler-cap.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/report-t1-readiness.mjs`

Bitbucket-specific report result:
- `bitbucket`: 18 `t1-ready`, 9 `t1-guarded-fail-closed`.

Blocked by unrelated in-progress app heads in this dirty workspace:
- `node tests/t1-terminal-states.test.js` failed on Medium/Starbucks/WhatsApp/Domino's search/evidence gaps; Bitbucket assertions passed.
- `node scripts/verify-write-activation-evidence.mjs` failed on missing Medium/Starbucks/WhatsApp guarded evidence records.
- `node tests/verify-origin-classification.test.js` failed on existing Starbucks/WhatsApp/Amplitude mapping/count drift; the real Bitbucket head classified same-origin.
- `node scripts/verify-t1-port-contract.mjs` failed on existing WhatsApp side-effect mismatches.

## Deviations

- No commit was created because this workspace already contains many unrelated
  uncommitted quick-task changes; recorded as `working-tree` like the surrounding
  quick tasks.
