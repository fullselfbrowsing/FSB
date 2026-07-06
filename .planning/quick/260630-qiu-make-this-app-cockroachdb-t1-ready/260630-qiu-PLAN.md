---
quick: 260630-qiu
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - catalog/handlers/cockroachdb.js
  - extension/catalog/handlers/cockroachdb.js
  - extension/utils/capability-fetch.js
  - extension/background.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-search.js
  - scripts/report-t1-readiness.mjs
  - scripts/verify-origin-classification.mjs
  - scripts/verify-recipe-path-guard.mjs
  - scripts/verify-t1-port-contract.mjs
  - catalog/write-activation-evidence.json
  - catalog/descriptors/opentabs__cockroachdb__execute_sql.json
  - tests/capability-fetch.test.js
  - tests/capability-head-handlers.test.js
  - tests/head-handler-cap.test.js
  - tests/head-handler-upgrade.test.js
  - tests/guarded-write-failclosed.test.js
  - tests/verify-origin-classification.test.js
  - tests/t1-terminal-states.test.js
  - tests/t1-readiness-report.test.js
requirements:
  - QT-260630-qiu
user_setup: []
---

# Quick 260630-qiu Plan: CockroachDB Cloud T1 Readiness

## Objective

Promote safe CockroachDB Cloud descriptors to T1a through an app-specific bundled head for `https://cockroachlabs.cloud`, while keeping mutation-capable rows fail-closed until live UAT proves their request/body safety.

## Tasks

1. Add `FsbHandlerCockroachdb` and bounded CockroachDB page-read support.
   - The handler exposes read slugs as T1a page-read dispatches and never performs direct fetch/chrome/storage access.
   - The fixed page-read primitive adds a `cockroachdb` namespace that uses the page's loaded protobuf globals to perform same-origin gRPC-web reads and decode protobuf responses.
   - `cockroachdb.execute_sql`, `create_database_user`, `set_delete_protection`, `delete_cluster`, and `delete_database_user` remain guarded fail-closed.

2. Wire CockroachDB into runtime/readiness gates.
   - Register the handler in service-worker imports, `HEAD_HANDLER_MODULES`, readiness/search overrides, report generation, origin-classification, recipe-path guard, port-contract mapping, and guarded-write evidence.
   - Correct `cockroachdb.execute_sql` to `sideEffectClass: "write"` because arbitrary SQL can mutate state.

3. Verify with focused gates.
   - Run handler behavior, page-read, exact-upgrade, guarded-write, origin-classification, readiness, recipe-path, port-contract, and extension validation checks.
