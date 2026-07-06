---
quick: 260630-qjb
status: complete
subsystem: capability-t1
tags: [powerpoint, t1, microsoft-graph, guarded-writes]
requirements_completed:
  - QT-260630-qjb
completed: 2026-07-01
commit: working-tree
key-files:
  created:
    - catalog/handlers/powerpoint.js
    - extension/catalog/handlers/powerpoint.js
  modified:
    - extension/utils/capability-fetch.js
    - extension/background.js
    - extension/utils/capability-catalog.js
    - scripts/report-t1-readiness.mjs
    - scripts/coverage-report.mjs
    - scripts/verify-origin-classification.mjs
    - scripts/verify-recipe-path-guard.mjs
    - scripts/verify-t1-port-contract.mjs
    - catalog/write-activation-evidence.json
    - tests/capability-fetch.test.js
    - tests/capability-head-handlers.test.js
    - tests/head-handler-cap.test.js
    - tests/head-handler-upgrade.test.js
    - tests/guarded-write-failclosed.test.js
    - tests/t1-readiness-report.test.js
    - tests/verify-origin-classification.test.js
    - tests/write-activation-evidence.test.js
---

# Quick 260630-qjb Summary: PowerPoint T1 Readiness

## Completed

- Added `FsbHandlerPowerpoint` as a bundled T1a head pinned to `https://powerpoint.cloud.microsoft`.
- Promoted 14 safe PowerPoint read descriptors through a bounded PowerPoint page-read auth context and Microsoft Graph read specs.
- Added the PowerPoint page-read `auth_context` branch in `capabilityPageReadInPage`; it returns Graph token, drive id, and item id only to the handler boundary.
- Kept 12 write/destructive descriptors guarded fail-closed: `copy_item`, `create_folder`, `create_presentation`, `create_sharing_link`, `delete_item`, `delete_permission`, `delete_slide`, `get_preview_url`, `move_item`, `rename_item`, `update_slide_notes`, and `update_slide_text`.
- Kept PPTX binary slide parsing reads fail-closed with `powerpoint-pptx-binary-parser-unavailable` until a reviewed binary body/parser path exists.
- Wired PowerPoint through service-worker imports, head registration, readiness reporting, coverage, recipe-path guard, port-contract verification, origin classification, guarded-write evidence, and focused tests.

## Verification

Passed:

- `node --check catalog/handlers/powerpoint.js && node --check extension/catalog/handlers/powerpoint.js && node --check extension/utils/capability-fetch.js`
- `node tests/capability-fetch.test.js` - 44 passed, 0 failed.
- `node tests/capability-head-handlers.test.js` - 943 passed, 0 failed.
- `node tests/head-handler-cap.test.js` - 5 passed, 0 failed.
- `node tests/head-handler-upgrade.test.js` - passed; PowerPoint read and guarded rows resolve as T1a upgrades.
- `node tests/guarded-write-failclosed.test.js` - 801 passed, 0 failed.
- `node tests/t1-readiness-report.test.js` - 15 passed, 0 failed.
- `node tests/write-activation-evidence.test.js` - 9 passed, 0 failed.
- `node scripts/verify-write-activation-evidence.mjs` - passed with 172 guarded fail-closed records.
- `node scripts/verify-t1-port-contract.mjs` - passed with 717 T1 rows and 708 handler rows.
- `node scripts/verify-recipe-path-guard.mjs` - passed with 47 bundled-head handlers on the allowlist.
- `node scripts/report-t1-readiness.mjs` - descriptors=2314, ready=545, guarded=172.
- `node scripts/report-t1-terminal-states.mjs` - PASS over 2314 descriptors.

Observed unrelated red gate in the shared dirty workspace:

- `node tests/verify-origin-classification.test.js` and `node scripts/verify-origin-classification.mjs` recognize PowerPoint as `PAGE-BEARER-GRAPH`, but still fail on existing unmapped Snowflake and Discord heads.

## Notes

- The handler does not call direct `fetch`, `XMLHttpRequest`, `chrome.*`, page storage, cookies, or console-log token material.
- Microsoft Graph calls are built as read-only GET specs using `authStrategy: "none"`, `credentials: "omit"`, and an origin pin to `https://powerpoint.cloud.microsoft`.
- The quick task is recorded as `working-tree` because this Conductor workspace already contained many unrelated uncommitted parallel T1 changes in shared files.
