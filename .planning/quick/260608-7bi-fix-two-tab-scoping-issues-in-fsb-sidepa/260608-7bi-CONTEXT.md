# Quick Task 260608-7bi: Tab-scoped sidepanel visibility + completion routing - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Task Boundary

Fix two related tab-scoping issues in the FSB Chrome extension side panel:

**Issue 1 - Panel visibility leaks across tabs.** Today the sidepanel stays open
on every tab and the global "working" status leaks to non-working tabs even
though chat content is already tab-scoped. Behavior wanted: the panel should
auto-collapse via `chrome.sidePanel.setOptions({ tabId, enabled: false })` on
non-working tabs, and re-enable on working tabs (or on manual icon-click).

**Issue 2 - Completion message routes to wrong tab.** When an agent task
finishes, the final assistant message / completion event is delivered to
whichever tab is currently active at the moment of completion, instead of the
tab the task was originally dispatched from. Behavior wanted: route the final
message to the originating tab's conversation using the tabId persisted on the
task/conversation record, so the completion lands in the correct tab regardless
of focus.

Scope is limited to the extension renderer + service worker; no MCP-server or
roadmap-level changes.

</domain>

<decisions>
## Implementation Decisions

### Multi-tab visibility
- **All working tabs have the panel enabled.** When 2+ tabs have active agent
  tasks at the same time, the panel is enabled on every working tab. Mental
  model: panel visibility == "has work running here". No surprises when running
  parallel tasks; no silent auto-disable of older working tabs.
- Implication: panel-enabled state is tracked per-tabId based on whether that
  tabId has an active agent record in `fsbAgentRegistry` (or equivalent
  per-tab "is working" signal). On `chrome.tabs.onActivated` we don't disable
  other working tabs; only non-working tabs get `enabled: false`.

### Idle-tab manual open
- **Force-open with welcome state on action-icon click.** If the user clicks
  the extension icon on a tab with no active task, we auto re-enable the panel
  for that tab and show the empty/welcome state so they can dispatch a new
  task. Never block the user from opening the panel manually.
- Implication: listen on `chrome.action.onClicked` (or equivalent for the
  side-panel open path) and call `chrome.sidePanel.setOptions({ tabId,
  enabled: true, path: ... })` for the clicked tab before/while Chrome opens
  the panel. The "auto-collapse on tab switch" rule only fires for tabs we did
  NOT just unlock via manual click.

### Originating tab definition (completion routing)
- **Dispatch tab wins.** The originating tab is the tab whose sidepanel the
  user typed the task into. The completion message goes back to THAT tab's
  conversation regardless of which tab is active when the agent finishes,
  and regardless of whether the agent opened new tabs in the meantime. If
  the agent drives a different tab during execution, that tab gets MCP
  visual-progress updates as today; the conversation completion still lands
  on the dispatch tab.
- Implication: every task/conversation record must persist a stable
  `dispatch_tabId` at the moment of user submission. The completion handler
  in `extension/ws/mcp-bridge-client.js` (or wherever the final assistant
  message is delivered) must look up `dispatch_tabId` on the conversation
  record instead of falling back to `chrome.tabs.query({ active: true })`.

### Claude's Discretion
- Exact debounce / timing for `chrome.tabs.onActivated` panel-disable calls
  (immediate vs throttled) - planner picks the simplest correct option.
- Whether to clean up the `enabled: false` state when a tab is closed
  (`chrome.tabs.onRemoved`) - planner decides based on memory / state
  hygiene tradeoffs.
- Whether the "still working" indicator on a non-working tab's panel header
  should be cleared eagerly before the panel collapses, or just left to
  disappear with the panel - planner picks based on flicker risk.

</decisions>

<specifics>
## Specific Ideas

- Chrome's `chrome.sidePanel` API does NOT expose a programmatic close. The
  only mechanism for "collapse on this tab" is `chrome.sidePanel.setOptions({
  tabId, enabled: false })`. Plan must use this mechanism.
- The previous quick fix (commit 00e6dc9b) already makes chat content
  tab-scoped via the `mcpVisualSession:` storage listener and the per-tab
  owner-chip resolution. The current task does NOT change content scoping; it
  changes panel-visibility scoping and completion routing.
- The owner-chip resolution at `extension/ui/sidepanel.js:679-750` already
  reads per-tab state via `lookupClientLabel(tabId, storageReadFn)`. The
  completion-routing fix likely lives in `extension/ws/mcp-bridge-client.js`
  message handlers (around `_handleExecuteAction` and the on-final
  conversation delivery code), and in whatever code path emits the final
  assistant message to the sidepanel runtime.
- Existing per-tab smoke tests at `tests/sidepanel-tab-aware-smoke.test.js`
  and `tests/sidepanel-mcpvisualsession-listener.test.js` are the closest
  template for new test fixtures. Tests for this task should exercise:
  (a) `chrome.tabs.onActivated` -> `chrome.sidePanel.setOptions` disable path
  for non-working tabs, (b) re-enable path on returning to a working tab,
  (c) action-icon click force-open path for idle tabs, (d) completion
  delivery using dispatch_tabId not active-tab lookup.

</specifics>

<canonical_refs>
## Canonical References

- `chrome.sidePanel` API docs (developer.chrome.com/docs/extensions/reference/api/sidePanel)
  - `setOptions({ tabId, enabled, path })` - the only per-tab visibility lever
  - `setPanelBehavior({ openPanelOnActionClick })` - global behavior toggle
  - No programmatic close method exists
- Prior debug session: `.planning/debug/sidepanel-agent-name.md` (root-cause
  walkthrough for the previous tab-scoping fix; useful background on the
  per-tab storage write timeline and the `fsbAgentRegistry` -> `mcpVisualSession`
  ordering that this task builds on).

</canonical_refs>
