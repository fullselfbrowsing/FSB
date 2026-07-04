---
quick_id: 260630-vnw
slug: make-this-app-newrelic-t1-ready
mode: quick
status: completed
created_at: 2026-06-30
autonomous: true
---

# Make New Relic T1-ready where safe

## Objective

Promote New Relic's safe same-origin NerdGraph read surface from discovery-pending to T1a handler-backed execution, while leaving New Relic mutations and destructive actions non-executable until live mutation-body UAT and write evidence exist.

## Source Coverage Audit

- `.planning/STATE.md`: preserve the two-tool surface, MV3 data/code wall, same-origin proof standard, denylist gates, and fail-closed write posture.
- `tests/t1-readiness-report.test.js` and `scripts/report-t1-readiness.mjs`: a row is T1-ready only with T0/T1a/T1b resolver proof; handler-backed descriptors must resolve to T1a and must not produce unknown readiness.
- Current New Relic catalog: 22 descriptors on `one.newrelic.com`; 11 are generated `read`, `newrelic.run_nrql_query` is source-audited as a NerdGraph query but currently generated `write`, and the remaining 10 are mutation/delete operations.
- Existing patterns: follow the bundled same-origin GraphQL handler style used by `catalog/handlers/meticulous.js` and `catalog/handlers/amplitude.js`: no OpenTabs runtime imports, no direct `fetch`, no token scraping, all network work through `ctx.executeBoundSpec`.
- Dirty worktree: preserve unrelated parallel-agent/user changes; scope edits to New Relic handler/readiness wiring, generated package/report artifacts, and this quick artifact.

## Safe Read Slugs

Register only these New Relic query/read descriptors:

`newrelic.get_current_user`, `newrelic.get_dashboard`, `newrelic.get_entity`, `newrelic.get_organization`, `newrelic.list_accounts`, `newrelic.list_alert_policies`, `newrelic.list_dashboards`, `newrelic.list_entity_tags`, `newrelic.list_event_types`, `newrelic.list_nrql_conditions`, `newrelic.search_entities`, `newrelic.run_nrql_query`.

For `newrelic.run_nrql_query`, correct the descriptor from `write` to `read` only with a handler-side read-only guard: accept single-statement NRQL whose first token is `SELECT` or `SHOW`, and fail closed for empty input, semicolon-delimited multi-statements, or mutation/DDL-looking tokens such as `DELETE`, `DROP`, `INSERT`, `UPDATE`, `CREATE`, `ALTER`, or `TRUNCATE`.

Do not register these New Relic mutation/destructive rows:

`newrelic.add_entity_tags`, `newrelic.create_alert_policy`, `newrelic.create_dashboard`, `newrelic.create_nrql_condition`, `newrelic.delete_alert_policy`, `newrelic.delete_dashboard`, `newrelic.delete_entity_tags`, `newrelic.delete_nrql_condition`, `newrelic.update_dashboard`, `newrelic.update_nrql_condition`.

## Tasks

<task type="auto">
  <name>Task 1: Add the New Relic same-origin NerdGraph read handler</name>
  <files>catalog/handlers/newrelic.js, extension/catalog/handlers/newrelic.js, tests/capability-head-handlers.test.js</files>
  <action>Create `catalog/handlers/newrelic.js` as a dual-export IIFE exposing `FsbHandlerNewrelic`. Pin `ORIGIN = "https://one.newrelic.com"`, `SERVICE = "one.newrelic.com"`, and `GRAPHQL_URL = "https://one.newrelic.com/graphql"`. Build only POST specs through `ctx.executeBoundSpec(spec, ctx.tabId)` using `authStrategy: "same-origin-cookie"`, `origin: ORIGIN`, `extract: "data"`, and headers `Content-Type: application/json; charset=utf-8`, `newrelic-requesting-services: platform|nr1-ui`, and `x-requested-with: XMLHttpRequest`. Inline the reviewed query strings from `vendor/opentabs-snapshot/plugins/newrelic/src/tools/*.ts`; do not import OpenTabs runtime code. Return typed `RECIPE_DOM_FALLBACK_PENDING` with dual fields on missing `executeBoundSpec`, 401/403/redirect, GraphQL errors, missing expected response shape, not-found nulls, or NRQL read-only guard failure. Add focused handler tests for registered read slugs, origin pinning, required headers, query-not-mutation bodies, read-only NRQL guard, shape/error fail-closed behavior, absence of direct `fetch`/`chrome.*`/`Authorization`/`Bearer` usage, and absence of the 10 mutation/destructive slugs.</action>
  <verify>
    <automated>node tests/capability-head-handlers.test.js</automated>
  </verify>
  <done>New Relic has a bundled T1a handler for only the safe read/query slugs, all calls are same-origin bound NerdGraph specs, and focused handler tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Wire New Relic into T1 readiness surfaces</name>
  <files>catalog/descriptors/opentabs__newrelic__run_nrql_query.json, catalog/descriptors/_fixtures/seed-descriptors.json, extension/background.js, extension/utils/capability-catalog.js, extension/utils/capability-search.js, scripts/report-t1-readiness.mjs, scripts/coverage-report.mjs, scripts/verify-t1-port-contract.mjs, scripts/verify-origin-classification.mjs, scripts/verify-recipe-path-guard.mjs, tests/head-handler-cap.test.js, tests/head-handler-upgrade.test.js, tests/verify-origin-classification.test.js, tests/t1-readiness-report.test.js, tests/t1-terminal-states.test.js</files>
  <action>Add `FsbHandlerNewrelic` to the head-handler manifest with service `one.newrelic.com` and origin `https://one.newrelic.com`, load `catalog/handlers/newrelic.js` from `extension/background.js`, add `newrelic.js` to readiness/report/port/path-guard handler module lists, and add New Relic origin classification metadata. Correct `newrelic.run_nrql_query` and its seed descriptor to `sideEffectClass: "read"` based on the source-audited NerdGraph query plus handler-side NRQL read guard. Add the 12 safe read slugs to `T1_READY_SLUGS`, update exact head-count/global assertions from 55 to 56, and extend readiness/search/terminal-state tests so drift cannot mark mutation/destructive New Relic rows T1-ready.</action>
  <verify>
    <automated>node tests/head-handler-cap.test.js && node tests/head-handler-upgrade.test.js && node tests/verify-origin-classification.test.js && node tests/t1-readiness-report.test.js && node tests/t1-terminal-states.test.js && node scripts/verify-recipe-path-guard.mjs && node scripts/verify-origin-classification.mjs && node scripts/verify-t1-port-contract.mjs</automated>
  </verify>
  <done>The resolver, search/readiness reports, origin gate, path guard, and port contract recognize New Relic as the 56th reviewed T1 head, with only the 12 safe read/query slugs eligible for T1-ready status.</done>
</task>

<task type="auto">
  <name>Task 3: Package, refresh reports, and validate</name>
  <files>extension/catalog/handlers/newrelic.js, extension/catalog/recipe-index.generated.js, .planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md, .planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json, .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.md, .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.json, .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.md, .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.json, .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-WRITE-UAT-LEDGER.md, .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-WRITE-UAT-LEDGER.json</files>
  <action>Run extension packaging so the canonical handler is copied into `extension/catalog/handlers/`, then regenerate T1 readiness, tail worklist, terminal-state, and write-UAT ledger artifacts. Confirm the 12 safe New Relic rows are `t1-ready` with handler proof and the 10 mutation/destructive rows remain non-activated UAT/discovery tail rows. Keep generated report churn limited to artifacts whose counts change because of New Relic.</action>
  <verify>
    <automated>npm run package:extension && node scripts/report-t1-readiness.mjs && node scripts/report-t1-tail-worklist.mjs && node scripts/report-t1-terminal-states.mjs && node tests/t1-readiness-report.test.js && node tests/t1-tail-worklist.test.js && node tests/t1-terminal-states.test.js && npm run validate:extension</automated>
  </verify>
  <done>Packaged extension output includes `newrelic.js`, readiness artifacts show New Relic read/query promotion without activating mutations/deletes, and focused extension validation passes.</done>
</task>

## Success Criteria

- `search_capabilities` marks only the 12 New Relic safe read/query slugs `readinessStatus: "t1-ready"`.
- `invoke_capability` resolves those slugs to T1a and executes only same-origin bound NerdGraph requests on `https://one.newrelic.com/graphql`.
- New Relic mutation/destructive descriptors remain non-executable until live mutation-body UAT and write evidence exist.
- MV3 Wall 1 remains intact: descriptors stay data, reviewed handler code is bundled locally, and no OpenTabs runtime/plugin code ships.
