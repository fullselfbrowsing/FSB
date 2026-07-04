---
quick_id: 260630-qj0
slug: make-this-app-snowflake-t1-ready
status: complete
completed_at: "2026-07-01T00:23:35Z"
commit: working-tree
---

# Make This App Snowflake T1-Ready

## Result

Snowflake now has a bundled T1a read-handler surface:

- 14 Snowflake descriptors resolve as `t1-ready` with handler proof.
- Query and chunk reads go through bounded `executeBoundSpec` specs pinned to `https://app.snowflake.com`.
- Session/context and worksheet/dashboard/entity reads go through the bounded Snowflake page-read namespace.
- `snowflake.run_query` is constrained to read-only SQL and fails closed before dispatch for mutation statements.
- The canonical handler and unpacked extension handler copy match byte-for-byte.

## Key Files

- `catalog/handlers/snowflake.js`
- `extension/catalog/handlers/snowflake.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-catalog.js`
- `extension/background.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/t1-readiness-report.test.js`

## Verification

Passed:

- Snowflake readiness filter: 14 `t1-ready`, 0 guarded/discovery rows.
- `node tests/head-handler-cap.test.js`
- `node -c catalog/handlers/snowflake.js && cmp -s catalog/handlers/snowflake.js extension/catalog/handlers/snowflake.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
