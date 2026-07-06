# Phase 17: Refresh-Poll Watch (Tab-Owning Background Reload) - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-06-16
**Phase:** 17-refresh-poll-watch-tab-owning-background-reload
**Mode:** assumptions
**Areas analyzed:** Evaluation Seam, Alarm Cadence, Tab Ownership, Attention States & Pulse

## Assumptions Presented

### Evaluation Seam

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Refresh-poll should reuse the storage-first value-report seam: content reads `{ text, attributes? }`, the SW stages reported fields on the snapshot, then `FsbTriggerLifecycle.handleTriggerAlarm()` performs evaluation and terminal writes. | Confident | `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md`; `extension/utils/trigger-lifecycle.js`; `extension/background.js`; `extension/content/messaging.js`; `extension/content/trigger-observe.js` |

### Alarm Cadence

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Refresh-poll should use the `fsbTrigger:<trigger_id>` lifecycle for recurring poll ticks, with persisted interval, hard 30s rejection floor, ~60s default, light jitter, and `deadline_at` retained as TTL. | Likely | `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md`; `extension/utils/trigger-lifecycle.js`; `.planning/ROADMAP.md`; Chrome alarms API docs |

### Tab Ownership

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Refresh-poll should reload only the persisted `target_tab_id` after validating `agent_id` ownership; it must never use active-tab lookup or activate the tab, and ownership mismatch returns `TAB_NOT_OWNED` before reload. | Confident | `.planning/ROADMAP.md`; `extension/utils/trigger-store.js`; `extension/utils/agent-tab-resolver.js`; `extension/utils/agent-registry.js`; `extension/ws/mcp-tool-dispatcher.js`; Chrome tabs API docs |

### Attention States & Pulse

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| After each reload, refresh-poll should re-inject/wait for readiness, read through `triggerRead`, distinguish element-not-found and blocked/challenge pages before evaluation, and re-assert the trigger pulse while armed. | Likely | `.planning/ROADMAP.md`; `extension/content/messaging.js`; `extension/content/trigger-observe.js`; `extension/background.js`; `extension/content/selectors.js`; `extension/content/dom-analysis.js` |

## Corrections Made

No corrections were made. `request_user_input` was unavailable in Default mode, so the workflow fallback selected the recommended "Yes, proceed" path.

## External Research

- Chrome alarms API: official docs confirm Chrome limits alarms to at most once every 30 seconds in production; `delayInMinutes` / `periodInMinutes` below `0.5` are not honored. Source: `https://developer.chrome.com/docs/extensions/reference/api/alarms`.
- Chrome tabs API: official docs define `chrome.tabs.reload(tabId, reloadProperties)` and state that `tabId` defaults to the selected tab only when omitted. Phase 17 therefore must always pass `target_tab_id`. Source: `https://developer.chrome.com/docs/extensions/reference/api/tabs#method-reload`.

---

*Discussion log: assumptions mode, 2026-06-16*
