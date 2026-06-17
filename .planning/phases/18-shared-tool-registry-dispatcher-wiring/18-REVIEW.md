---
phase: 18-shared-tool-registry-dispatcher-wiring
reviewed: 2026-06-17T01:13:16Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - extension/ai/tool-definitions.js
  - extension/ai/tool-executor.js
  - extension/background.js
  - extension/ws/mcp-tool-dispatcher.js
  - mcp/ai/tool-definitions.cjs
  - mcp/src/runtime.ts
  - mcp/src/tools/manual.ts
  - mcp/src/tools/triggers.ts
  - mcp/src/types.ts
  - package.json
  - tests/mcp-tool-routing-contract.test.js
  - tests/mcp-tool-smoke.test.js
  - tests/tool-definitions-parity.test.js
  - tests/trigger-tool-dispatcher.test.js
  - tests/visual-session-schema-lock.test.js
findings:
  critical: 1
  warning: 2
  info: 0
  total: 3
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-06-17T01:13:16Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the shared trigger tool registry, MCP trigger registrar, extension dispatcher, background trigger handlers, and Phase 18 route/smoke tests. The new trigger route contracts are present, and the targeted Phase 18 tests pass, but the live bridge path and authorization boundary still have gaps.

Verification run:
- `node tests/trigger-tool-dispatcher.test.js` passed
- `node tests/mcp-tool-routing-contract.test.js --group=trigger` passed

## Critical Issues

### CR-01: Trigger Message Route Bypasses Ownership Gate

**File:** `extension/ws/mcp-tool-dispatcher.js:1570`
**Issue:** `handleTriggerToolMessageRoute` forwards `mcp:trigger` / companion messages directly to `fsbTriggerDispatchToolRequest` without the Phase 240 ownership gate. Message routes are not globally gated, and `fsbTriggerHandleToolArm` then trusts the caller-provided MCP context and reads the target page before arming (`extension/background.js:4432`, `extension/background.js:4462`). Once the trigger message route is reachable, a caller can target another agent's tab by supplying `target_tab_id` plus arbitrary agent/token values.
**Fix:**
```js
const requestPayload = payload || {};
const normalizedPayload = {
  ...requestPayload,
  tabId: requestPayload.tabId ?? requestPayload.tab_id ?? requestPayload.target_tab_id,
};

const gateResult = checkOwnershipGate({
  tool: toolName,
  params: normalizedPayload,
  payload: normalizedPayload,
});
if (gateResult) return gateResult;

const context = {
  agentId: normalizedPayload.agentId,
  ownershipToken: normalizedPayload.ownershipToken,
  tabId: normalizedPayload.tabId,
  source: 'mcp',
};
return dispatch(toolName, normalizedPayload, context);
```
Also add a regression test where `mcp:trigger` with `target_tab_id` for another agent returns `TAB_NOT_OWNED` before any trigger read/arm call.

## Warnings

### WR-01: MCP Trigger Messages Are Not Routed by the Bridge Client

**File:** `mcp/src/tools/triggers.ts:69`
**Issue:** The MCP server now emits `mcp:trigger`, `mcp:stop-trigger`, `mcp:get-trigger-status`, and `mcp:list-triggers`, but the extension bridge client's `_routeMessage` switch does not handle those message types and falls through to `Unknown MCP message type`. The Phase 18 tests cover the server harness and dispatcher contract, but not the live bridge-client receiver, so all four new MCP trigger tools fail in production.
**Fix:** Add the trigger message cases to `extension/ws/mcp-bridge-client.js` and route them through the dispatcher:
```js
case 'mcp:trigger':
case 'mcp:stop-trigger':
case 'mcp:get-trigger-status':
case 'mcp:list-triggers':
  return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });
```
Add a bridge-client switch regression test so future MCP message types cannot be registered server-side without a receiver.

### WR-02: Registry Advertises `delta_percent`, but Runtime Rejects It

**File:** `extension/ai/tool-definitions.js:1226`
**Issue:** The trigger schema description tells callers that `delta_percent` is supported, but `fsbTriggerValidateToolCondition` only accepts `percent_change` (`extension/background.js:4358-4376`). Calls generated from the advertised schema will be rejected with `TRIGGER_CONDITION_INVALID`. The mirrored `mcp/ai/tool-definitions.cjs:1226` has the same text.
**Fix:** Either change both registry descriptions to `percent_change`, or support the advertised alias before validation/evaluation:
```js
const rawKind = fsbTriggerFirstString(condition.kind);
const kind = rawKind === 'delta_percent' ? 'percent_change' : rawKind;
```
Keep the extension and MCP registry copies byte-identical after the update.

---

_Reviewed: 2026-06-17T01:13:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
