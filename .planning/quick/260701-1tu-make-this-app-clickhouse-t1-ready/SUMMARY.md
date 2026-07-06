---
quick: 260701-1tu
status: complete
subsystem: capability-t1
tags: [clickhouse, t1, page-read]
requirements_completed:
  - QT-260701-1tu
completed: 2026-07-01
commit: working-tree
key-files:
  modified:
    - catalog/handlers/clickhouse.js
    - extension/catalog/handlers/clickhouse.js
    - extension/background.js
    - extension/utils/capability-catalog.js
    - extension/utils/capability-fetch.js
    - extension/utils/capability-search.js
    - scripts/report-t1-readiness.mjs
    - scripts/verify-origin-classification.mjs
    - scripts/verify-t1-port-contract.mjs
    - tests/capability-fetch.test.js
    - tests/capability-head-handlers.test.js
    - tests/t1-readiness-report.test.js
    - tests/verify-origin-classification.test.js
---

# Quick 260701-1tu Summary: ClickHouse T1 Readiness

## Completed

- Added a bundled ClickHouse T1a handler for 9 read-only slugs on `https://console.clickhouse.cloud`.
- Registered `FsbHandlerClickhouse` in the extension background load path, head-handler catalog, readiness/search overrides, readiness report, and port-contract checks.
- Added ClickHouse page-read support for cached organization/service/member data, authenticated control-plane reads for scaling/private-endpoint/backups/metrics, and public status reads.
- Extended origin-classification proof for ClickHouse's storage-bearer control-plane pattern.
- Added focused handler and page-read tests, including a mocked `clickhouse.query_metrics` execution path that verifies bearer auth stays inside the injected page context.

## Verification

Passed:

- `node tests/capability-head-handlers.test.js` - 1317 passed, 0 failed.
- `node tests/capability-fetch.test.js` - 49 passed, 0 failed.
- `node tests/t1-readiness-report.test.js` - 22 passed, 0 failed.
- `node scripts/verify-t1-port-contract.mjs` - passed with 1034 T1 rows, 1028 handler rows, and 296 guarded fail-closed rows.

Existing non-ClickHouse red gates in the shared workspace:

- `node tests/verify-origin-classification.test.js` still fails on concurrent Instacart, Walmart, and DockerHub head/origin issues; the ClickHouse classification assertions pass.
- `node tests/t1-terminal-states.test.js` still fails on concurrent DockerHub guarded-write evidence and Instacart readiness override gaps.

## Notes

- The ClickHouse head is read-only and delegates through `executeBoundPageRead`; it does not call direct `fetch`, `chrome`, storage, or secret APIs.
- The quick task is recorded as `working-tree` because this Conductor workspace already contains many unrelated uncommitted parallel T1 changes in overlapping shared files.
