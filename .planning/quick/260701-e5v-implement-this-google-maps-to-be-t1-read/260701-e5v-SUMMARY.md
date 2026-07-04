---
status: complete
quick_id: 260701-e5v
slug: implement-this-google-maps-to-be-t1-read
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260701-e5v Summary

## Outcome

Implemented Google Maps T1 readiness in the working tree.

- Added a bundled `gmaps` T1a head handler for 15 safe read rows.
- Kept `gmaps.set_travel_mode` guarded fail-closed with byte-stable `RECIPE_DOM_FALLBACK_PENDING`.
- Registered Maps in the extension head-handler manifest, service-worker import path, readiness report loader, and focused upgrade/readiness/evidence tests.

## Verification

- `node --check tests/gmaps-t1-ready.test.js`
- `node --check tests/head-handler-upgrade.test.js`
- `node --check tests/t1-readiness-report.test.js && node --check tests/write-activation-evidence.test.js`
- `node --check catalog/handlers/gmaps.js && node --check extension/catalog/handlers/gmaps.js && node --check extension/utils/capability-fetch.js && node --check extension/utils/capability-catalog.js && node --check extension/background.js`
- `node tests/gmaps-t1-ready.test.js` - 17 passed, 0 failed
- `node tests/t1-readiness-report.test.js` - 33 passed, 0 failed
- `node tests/write-activation-evidence.test.js` - 9 passed, 0 failed
- `node tests/head-handler-upgrade.test.js` - 5735 passed, 0 failed
- `node tests/head-handler-cap.test.js` - 5 passed, 0 failed

## Commit

No Google Maps commit was created. The workspace already had unrelated staged changes in shared files before this task, including `catalog/write-activation-evidence.json`, `extension/background.js`, `extension/utils/capability-catalog.js`, `scripts/report-t1-readiness.mjs`, and shared tests. Committing from the current index would mix Google Maps with other app migrations, so this quick task is recorded as verified working-tree work.

## Residual Risk

- Place details/search parsing is fixture-tested against current Maps HTML/state shapes, but no live Google Maps account/browser UAT was run.
- `gmaps.set_travel_mode` remains intentionally guarded until live mutation evidence is captured.
