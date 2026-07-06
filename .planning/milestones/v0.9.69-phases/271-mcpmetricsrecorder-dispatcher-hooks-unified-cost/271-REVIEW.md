---
phase: 271-mcpmetricsrecorder-dispatcher-hooks-unified-cost
reviewed: 2026-05-14T00:00:00Z
depth: quick
files_reviewed: 4
files_reviewed_list:
  - extension/utils/mcp-metrics-recorder.js
  - extension/utils/analytics.js
  - extension/background.js
  - extension/ws/mcp-tool-dispatcher.js
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: findings_found
---

# Phase 271: Code Review Report

**Reviewed:** 2026-05-14
**Depth:** quick (BLOCKER-only scan, scoped to PII / double-count / back-fill / eviction / payload-leak)
**Files Reviewed:** 4
**Status:** findings_found

## Summary

Quick adversarial scan against the five named focus areas. Four are clean (PII data-flow, back-fill field mutation, service-worker eviction, requestPayload/response leak into rows). One is a confirmed BLOCKER: cross-dispatcher recursion through `handleToolAliasRoute` causes a guaranteed 2x double-write to `fsbUsageData` for 14 of the 27 MCP tools, including the highest-cost ones (`run_task`, `read_page`, `get_dom_snapshot`).

## Critical Issues

### CR-01: handleToolAliasRoute causes double-record for 14 tools (BLOCKER)

**Files:** `extension/ws/mcp-tool-dispatcher.js:50-78`, `extension/ws/mcp-tool-dispatcher.js:285-334`, `extension/ws/mcp-tool-dispatcher.js:336-404`, `extension/ws/mcp-tool-dispatcher.js:1413-1419`

**Issue:**

`MCP_PHASE199_TOOL_ROUTES` registers `handler: handleToolAliasRoute` for 14 tools (lines 59-73): `start_visual_session`, `end_visual_session`, `run_task`, `stop_task`, `get_task_status`, `get_site_guide`, `get_page_snapshot`, `list_sessions`, `get_session_detail`, `get_logs`, `search_memory`, `get_memory_stats`, `read_page`, `get_dom_snapshot`.

`handleToolAliasRoute` (line 1413-1419) is implemented as:

```javascript
async function handleToolAliasRoute({ params, client, route }) {
  return dispatchMcpMessageRoute({
    type: route.messageType,
    payload: params || {},
    client
  });
}
```

Trace for any of those 14 tools:

1. WS client calls `dispatchMcpToolRoute({ tool: 'run_task', ... })`.
2. `dispatchMcpToolRoute` enters its `try { response = await route.handler(...) } finally { recordDispatch({..., dispatcher_route: 'tool'}) }` block (lines 310-333).
3. `route.handler` is `handleToolAliasRoute`, which awaits `dispatchMcpMessageRoute({ type: 'mcp:start-automation', ... })`.
4. `dispatchMcpMessageRoute` enters its OWN `try { response = await ... } finally { recordDispatch({..., dispatcher_route: 'message'}) }` block (lines 352-403). Its finally fires FIRST, writing row #1 with `tool: 'mcp:start-automation'`, `dispatcher_route: 'message'`.
5. Control returns to step 2's finally, which writes row #2 with `tool: 'run_task'`, `dispatcher_route: 'tool'`.

Result: ONE logical client call produces TWO `fsbUsageData` rows. Hero card sums BOTH (no `dispatcher_route` filter in `getAllTimeStats` at `analytics.js:378-403`). For the affected tools, every metric is inflated 2x:

- `run_task`: in 200 + out 8000 = 8200 tokens per call. Doubled to 16400. Cost double-billed.
- `read_page`: in 80 + out 2000 = 2080 tokens. Doubled to 4160.
- `get_dom_snapshot`: in 100 + out 4000 = 4100. Doubled to 8200.

These are the heaviest tools in the heuristic table -- they dominate aggregate totals, so the public-facing "Total Tokens / Total Cost" numbers on the Control Panel will be materially wrong from day one.

A second compounding factor: the two rows carry different `tool` labels (`run_task` vs `mcp:start-automation`) so per-tool dedup is non-trivial; and they share the same `ts` to-the-millisecond only by luck (the inner row's `ts = Date.now()` is captured before the outer's, so a `ts+tool` dedup also fails).

The PR description for Phase 271 (`extension/utils/mcp-metrics-recorder.js:6-8`) explicitly claims "Each recordDispatch() appends ONE row" -- this invariant is violated for 14/27 tools.

**Fix:** Suppress the inner recorder call when a tool-route is aliasing to a message route. Two viable options:

Option A (preferred -- one-line guard, preserves both chokepoints as defense-in-depth):

```javascript
// extension/ws/mcp-tool-dispatcher.js line ~285
async function dispatchMcpToolRoute({ tool, params = {}, client = null, tab = null, payload = {} }) {
  const route = MCP_PHASE199_TOOL_ROUTES[tool];
  // ... existing gate + handler invocation ...
  let response = undefined;
  let success = false;
  try {
    response = await route.handler({
      tool, params: params || {}, client, tab, payload, route,
      _mcpMetricsSuppressInner: true   // <-- NEW: signal alias path to skip its finally
    });
    // ...
  } finally {
    // unchanged
  }
}

// extension/ws/mcp-tool-dispatcher.js line ~336
async function dispatchMcpMessageRoute({ type, payload = {}, client = null, mcpMsgId = null, _mcpMetricsSuppressInner = false }) {
  // ... existing logic ...
  } finally {
    if (_mcpMetricsSuppressInner) return;   // <-- NEW: outer dispatcher will record
    try {
      if (typeof globalThis !== 'undefined' && globalThis.fsbMcpMetricsRecorder && ...) {
        globalThis.fsbMcpMetricsRecorder.recordDispatch({ ... });
      }
    } catch (_e) {}
  }
}

// extension/ws/mcp-tool-dispatcher.js line ~1413
async function handleToolAliasRoute({ params, client, route, _mcpMetricsSuppressInner }) {
  return dispatchMcpMessageRoute({
    type: route.messageType,
    payload: params || {},
    client,
    _mcpMetricsSuppressInner
  });
}
```

Option B (simpler -- record only at the message chokepoint): drop the finally block in `dispatchMcpToolRoute` entirely (lines 314-333). All 14 alias tools already hit the message chokepoint; the remaining 13 non-alias tool routes would need their own recording mechanism (e.g. record inside `route.handler` or wrap each non-alias handler). Net more invasive.

Either way, also add a regression test to `tests/mcp-metrics-recorder.test.js` that exercises a real alias tool (e.g. `run_task`) end-to-end through both dispatchers with a mocked `chrome.storage.local` and asserts `fsbUsageData.length === 1`, not 2, after the call.

---

### Out-of-focus observations (NOT blockers, noted for completeness)

- **Concurrent-write race in `recordDispatch` storage append** (`extension/utils/mcp-metrics-recorder.js:320-325`): the `get -> push -> set` is not atomic, and the dispatcher fires recordDispatch fire-and-forget (lines 323, 393 of dispatcher are not awaited). Two near-simultaneous dispatches will both read the same pre-write array, both push their own row, and the second `set` overwrites the first -- a row is silently dropped. This is an under-count, not a double-count, and falls outside the stated focus areas, so it does not block. Recommended for a follow-on phase: serialize via an in-module `Promise` queue, or migrate to a per-row chrome.storage key with periodic compaction.
- The back-fill walks in `extension/utils/analytics.js:177-191` and `extension/background.js:4382-4398` are correct: both only mutate `next.source` (no other fields touched), spread copies are per-row (no shared-reference mutation), and the `backfilled`/`backfilledAny` flag guards a single persistence pass per load.
- PII data-flow in `recordDispatch` is clean: the only `requestPayload` access is `payload.text.length` in `_estimateTokensForTool` (line 140) for `type_text`/`insert_text` only. `response` is destructured in the function signature but never dereferenced. No URL/DOM/header/value/cookie/body reads.
- Service-worker eviction: no in-memory queue or batch state in the recorder. Every dispatch writes synchronously via `await storage.set()` before returning from the recorder's body. Eviction-safe.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
