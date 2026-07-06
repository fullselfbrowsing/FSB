---
status: partial
phase: 28-lean-mcp-surface-capability-search-eval-harness
source: [28-VERIFICATION.md]
started: 2026-06-20
updated: 2026-06-20
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live MCP-client end-to-end wire smoke (search -> invoke)

expected: From a live MCP host with the FSB Chrome extension connected, on a tab at `https://github.com`: `search_capabilities("show my github notifications")` ranks the `github.notifications` slug first and returns its `params` schema (schema-on-hit); `invoke_capability("github.notifications")` then runs the routerless `slug -> interpretRecipe -> executeBoundSpec` path and returns a logged-in-shape structured result (HTTP 200, not a 302 to /login).
why_human: Requires a live Chrome extension + MCP host + a logged-in origin. FSB's established live-browser UAT posture — recorded as `human_needed`, never fabricated. The CI half (mocked `executeBoundSpec`, stubbed bridge, in-memory index) fully covers the logic and is green. Consistent with the Phase 27 FETCH-05 live posture and the single Manual-Only row in 28-VALIDATION.md.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

None — all SURF-01..06 automated gates pass (recall@5=1.000, wrong-invoke=0, INV-01 hash unchanged, queue split, RECIPE_NOT_FOUND). The only open item is the human-gated live browser smoke above.
