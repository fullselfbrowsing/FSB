---
quick_id: 260630-vnw
slug: make-this-app-newrelic-t1-ready
status: completed
completed_at: 2026-07-01
commit: working-tree
---

# New Relic T1 Readiness Summary

## Outcome

New Relic is T1-ready for the reviewed read/query surface. The executable head now exposes 12 same-origin NerdGraph read handlers on `https://one.newrelic.com/graphql`; mutation and destructive New Relic descriptors remain unregistered and non-executable pending live write evidence.

## Promoted Slugs

- `newrelic.get_current_user`
- `newrelic.get_dashboard`
- `newrelic.get_entity`
- `newrelic.get_organization`
- `newrelic.list_accounts`
- `newrelic.list_alert_policies`
- `newrelic.list_dashboards`
- `newrelic.list_entity_tags`
- `newrelic.list_event_types`
- `newrelic.list_nrql_conditions`
- `newrelic.run_nrql_query`
- `newrelic.search_entities`

## Key Changes

- Added `catalog/handlers/newrelic.js` and packaged mirror `extension/catalog/handlers/newrelic.js`.
- Wired `FsbHandlerNewrelic` through the extension background loader, head-handler manifest, readiness search override, report scripts, path guard, port contract, and origin-classification gate.
- Reclassified `newrelic.run_nrql_query` from `write` to `read` with a handler-side read-only NRQL guard accepting only single-statement `SELECT` or `SHOW` queries.
- Added focused handler, readiness, upgrade, cap, origin, and report coverage for New Relic.
- Refreshed extension package and T1 readiness/tail/terminal-state generated reports.
- Applied two shared-gate maintenance fixes encountered during validation: Facebook Marketplace parser argument order and generated same-origin recipe test expectations after Redfin/Webflow handler promotion.

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-tail-worklist.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run package:extension`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `npm run validate:extension`

## Notes

No git commit was created because this Conductor workspace contains extensive parallel-agent changes. The quick task is recorded as `working-tree`, matching the surrounding T1 quick-task entries.
