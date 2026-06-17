# Deferred Items

## 2026-06-16 - Plan 18-01 wave-level route-contract failure

- **Category:** planned_followup
- **Found during:** Plan 18-01 overall verification
- **Command:** `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools`
- **Result:** root `npm test` stops in `tests/mcp-tool-routing-contract.test.js` because the new background-routed `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` registry entries do not yet have direct MCP route contracts.
- **Disposition:** Deferred to Plan 18-04, which explicitly owns `extension/ws/mcp-tool-dispatcher.js` trigger route contracts, `tests/mcp-tool-routing-contract.test.js` trigger coverage, and autopilot executor wiring. Focused Plan 18-01 verification passed.

## 2026-06-17 - Plan 18-03 wave-level route-contract confirmation

- **Category:** planned_followup
- **Found during:** Plan 18-03 overall verification
- **Command:** `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools`
- **Result:** root `npm test` still stops in `tests/mcp-tool-routing-contract.test.js` on the same four missing direct trigger routes after MCP-side trigger registration landed.
- **Disposition:** Still deferred to Plan 18-04. Focused Plan 18-03 verification passed: `npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js && node tests/trigger-tool-dispatcher.test.js`.
