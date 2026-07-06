---
status: complete
created: 2026-07-01T00:06:01.713Z
quick_id: 260630-qj0
slug: make-this-app-snowflake-t1-ready
---

# Quick Task: Make Snowflake T1-Ready

## Goal
Promote the existing Snowflake catalog descriptors from discovery-pending to executable T1 readiness without adding per-app MCP tools or bypassing the existing capability router.

## Scope
- Add a reviewed Snowflake T1a handler for the 14 existing read descriptors.
- Use the existing bounded execution primitives only:
  - `executeBoundSpec` for Snowflake backend query/chunk reads.
  - `executeBoundPageRead` for Snowflake page-state context and worksheet/dashboard entity reads.
- Register Snowflake in the T1 head manifest, service-worker imports, path guard allowlist, readiness reporter, and port-contract verifier.
- Add targeted head-handler/readiness test expectations.

## Verification
- `node tests/head-handler-cap.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/t1-readiness-report.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
