# Deferred Items

## 2026-06-16 - Plan 18-01 wave-level route-contract failure

- **Category:** planned_followup
- **Found during:** Plan 18-01 overall verification
- **Command:** `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools`
- **Result:** root `npm test` stops in `tests/mcp-tool-routing-contract.test.js` because the new background-routed `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` registry entries do not yet have direct MCP route contracts.
- **Disposition:** Deferred to Plan 18-04, which explicitly owns `extension/ws/mcp-tool-dispatcher.js` trigger route contracts, `tests/mcp-tool-routing-contract.test.js` trigger coverage, and autopilot executor wiring. Focused Plan 18-01 verification passed.
