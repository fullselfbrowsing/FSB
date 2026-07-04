---
quick_id: 260630-njd
slug: make-this-app-whatsapp-t1-ready
status: complete
completed_at: "2026-06-30T22:14:48.000Z"
commit: working-tree
---

# Make This App WhatsApp T1-ready

## Result

WhatsApp now has explicit T1 accounting:

- 7 WhatsApp read descriptors resolve as T1a handler-backed reads pinned to `https://web.whatsapp.com`.
- 14 WhatsApp write/destructive descriptors resolve as guarded fail-closed T1a rows and do not execute any mutation primitive.
- The read path uses a constrained WhatsApp page-state primitive in the page MAIN world, behind the same active-tab origin pin used by the fetch primitive.
- Search readiness, readiness reports, origin classification, port-contract, guarded-write, terminal-state, and handler-copy gates recognize the WhatsApp surface.

## Files Touched

- `catalog/handlers/whatsapp.js`
- `extension/catalog/handlers/whatsapp.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-router.js`
- `extension/utils/capability-catalog.js`
- `extension/background.js`
- `extension/utils/capability-search.js`
- `catalog/write-activation-evidence.json`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- Focused tests under `tests/`
- Generated readiness/terminal-state artifacts under `.planning/phases/44-*` and `.planning/phases/51-*`
- `extension/catalog/recipe-index.generated.js`

## Verification

Passed:

- `npm run package:extension`
- `node tests/capability-fetch.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/capability-head-handlers.test.js`
- `node scripts/report-t1-readiness.mjs`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-write-activation-evidence.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node tests/capability-search-eval.test.js`

WhatsApp readiness rollup after regeneration:

- Total WhatsApp descriptors: 21
- T1-ready: 7
- Guarded fail-closed: 14
- Discovery-pending / blocked: 0
