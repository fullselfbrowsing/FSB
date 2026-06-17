# Phase 20: Integration, Cap UI, Docs & Edge Cases - Context

**Gathered:** 2026-06-17 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 20 composes the trigger system already shipped in Phases 14-19. The scope is integration and release readiness: expose the trigger concurrency cap in the control panel, resolve whole-system watch-mode conflicts and refresh-poll reload coalescing, document the trigger tool family and limitations, prepare `fsb-mcp-server@0.10.0`, and capture the deferred live-browser UAT evidence. It should not add new trigger condition kinds, new notification channels, server-side monitoring, cloud hosting, or auto-act-on-fire workflows.
</domain>

<decisions>
## Implementation Decisions

### A. Trigger Cap UI

- **D-01:** Add a Trigger Concurrency card next to the existing Agent Concurrency card in `extension/ui/control_panel.html`. Clone the Agent Concurrency UI shape: number input, current value display, Reset to default button, range hint, validation hint, and live active counter. The storage key is already locked as `fsbTriggerCap` by `extension/utils/trigger-manager.js`.
- **D-02:** The UI cap range is the runtime range: default `8`, min `1`, max `64`. The control panel should clamp on input, re-clamp on load, and clamp on save, mirroring the existing `fsbAgentCap` defense-in-depth path in `extension/ui/options.js`.
- **D-03:** The active trigger counter reads `chrome.storage.session.fsbTriggerRegistry.records` and counts active trigger snapshots, primarily `status === 'armed'` plus active attention states already included by `list_triggers` defaults (`needs_attention`, `blocked`) if the UI copy says active watches. Terminal `fired`, `timed_out`, and `stopped` snapshots must not count as active cap usage.
- **D-04:** The control panel should subscribe to `chrome.storage.onChanged` for `session/fsbTriggerRegistry` and `local/fsbTriggerCap`, using the same debounce pattern as the agent cap counter. The counter is informational and best-effort; it must not throw into the options page.
- **D-05:** Add focused source-shape tests for the Trigger Concurrency card and `options.js` persistence, modeled on `tests/change-report-settings-ui.test.js` and the existing agent cap tests. Do not introduce a browser-driven UI test harness for this card.

### B. Watch-Mode Conflict and Refresh-Poll Coalescing

- **D-06:** Enforce `TRIGGER_TAB_WATCH_CONFLICT` before arming a new trigger when the target tab already has an active trigger of the opposite watch mode (`live-observe` vs `refresh-poll`). This belongs in the background trigger arm path before `FsbTriggerManager.armTrigger(spec)` persists the new snapshot, because only background has target tab, owner, existing trigger registry, and watch-mode normalization in one place.
- **D-07:** Same-mode co-location remains allowed. Multiple `live-observe` triggers on one tab can keep their independent content observers; multiple `refresh-poll` triggers on one tab must coalesce reload work.
- **D-08:** Refresh-poll coalescing should happen in the refresh-poll alarm/tick layer, not in MCP. When several armed refresh-poll triggers on the same `target_tab_id` are due around the same cadence, the runtime should reload the tab once, then read/evaluate each due trigger from that single post-reload page state. The implementation may use a short per-tab in-flight promise/lock and due-trigger scan, as long as ownership validation still occurs per trigger before evaluation.
- **D-09:** The refresh-poll conflict/coalescing logic must preserve existing guarantees: reloads never activate or focus tabs, ownership is validated before reload/evaluation, blocked-page handling still writes attention state, and pulse reassertion only happens for snapshots that remain armed.
- **D-10:** Add tests in the existing trigger harness style: source/VM tests proving cross-mode conflict rejects before arm/persist/observer start, same-mode arms pass, co-located refresh-poll triggers share one `chrome.tabs.reload`, and other-tab refresh-poll triggers still reload separately.

### C. Docs, Versioning, and Public MCP Surface

- **D-11:** Prepare the MCP package as `0.10.0` because the trigger family is an additive minor feature for the public MCP surface. Update `mcp/package.json`, `mcp/src/version.ts`, `mcp/server.json`, and version parity tests together. Do not change dependency versions in this phase.
- **D-12:** Update `mcp/CHANGELOG.md` with a `0.10.0` entry for the trigger family: `trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`, blocking default with 30s progress, detached mode, safety auto-detach, fire/timed_out outcomes, rearm_on_fire, owner/TTL cleanup, trigger cap UI, and anti-scope.
- **D-13:** Update `mcp/README.md` tool counts and add a Trigger Watchers section. It should explain when to choose `live-observe` vs `refresh-poll`, blocking vs detached behavior, rearm_on_fire and hysteresis, notify-only output, browser-must-be-open/session-only limits, restricted-tab/page-blocked behavior, and cancellation/status guidance.
- **D-14:** Update the root `README.md` only where it helps a new user understand the new MCP tool family and the local/browser-open limitation. Detailed tool semantics belong in `mcp/README.md`.
- **D-15:** Keep all tool schemas additive and shared-registry driven. Existing schema-lock/parity gates must stay green; docs must describe the already-implemented shared tool surface rather than inventing separate MCP-only semantics.

### D. Live Browser UAT and Release Readiness

- **D-16:** Phase 20 owns the deferred human/browser evidence, especially Phase 16 live-observe UAT: live ticker no-reload fire, BF-cache re-arm timing, busy ticker frame budget, and pulse/reduced-motion visual behavior. Capture results in a Phase 20 UAT artifact and update prior deferred references rather than fabricating automated proof.
- **D-17:** Include end-to-end UAT for the newly composed trigger system: blocking fire return, detached poll/status, timeout, rearm_on_fire still armed, refresh-poll background focus retention, cross-mode conflict, coalesced reload, and owner disconnect cleanup.
- **D-18:** Release readiness means running and recording full automated gates after implementation: focused trigger suites, MCP build, MCP smoke, version parity, tool-definition parity, schema-lock, docs/source-shape tests, and root `npm test`. Any showcase crawler timestamp churn from `npm test` should be reverted unless the docs intentionally changed those artifacts.
- **D-19:** Final publish/tag actions remain user-gated. This phase can prepare package metadata and docs for `fsb-mcp-server@0.10.0`, but it should not run `npm publish`, push tags, or publish ClawHub artifacts without explicit user instruction.

### the agent's Discretion

- Exact copy and icon choice for the Trigger Concurrency card, as long as it sits in Advanced Settings near Agent Concurrency and uses the existing settings-card design.
- Exact coalescing window/algorithm for refresh-poll, as long as one due batch per tab produces one reload and per-trigger ownership/status semantics remain intact.
- Exact README section placement, as long as the public MCP README has a clear trigger watcher section and the root README remains a concise overview.

### Folded Todos

None -- no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope

- `.planning/ROADMAP.md` -- Phase 20 goal and success criteria for trigger-cap UI, watch-mode conflict/coalescing, docs, version prep, and full CI.
- `.planning/REQUIREMENTS.md` -- all v0.11 trigger requirements are complete through Phase 19; Phase 20 composes them without net-new requirements.
- `.planning/STATE.md` -- Phase 20 ready state, Phase 19 decisions, outstanding Phase 16 human UAT debt, and publish/tag gates.
- `.planning/phases/19-mcp-tools-blocking-detached-reporting/19-03-SUMMARY.md` -- latest trigger behavior and verification results.

### Prior Locked Trigger Decisions

- `.planning/phases/14-trigger-survivability-foundation/14-CONTEXT.md` -- trigger store/lifecycle, `fsbTriggerRegistry`, `fsbTrigger:<id>` alarms, TTL, tab-close reap, and session-only survivability.
- `.planning/phases/15-fire-condition-engine-value-extraction/15-CONTEXT.md` -- pure trigger manager, active cap, edge-fire, parse-error, and condition semantics.
- `.planning/phases/16-live-observe-watch-analyzing-pulse/16-CONTEXT.md` -- live-observe content module, pulse behavior, BF-cache/SPAs, and deferred live-browser UAT.
- `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-CONTEXT.md` -- own-tab refresh-poll reload/read/evaluate path, background focus contract, blocked-page attention, and pulse reassertion.
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-CONTEXT.md` -- shared trigger tool registry, direct MCP routes, companion bypass, and storage-of-truth status/list.
- `.planning/phases/19-mcp-tools-blocking-detached-reporting/19-CONTEXT.md` -- blocking/detached defaults, fire/timeout outcomes, owner lifecycle, and rearm_on_fire decisions.

### Trigger Runtime and UI Integration

- `extension/utils/trigger-manager.js` -- `FSB_TRIGGER_CAP_STORAGE_KEY = 'fsbTriggerCap'`, cap constants, `getCap`, `setCap`, `loadCapFromStorage`, and storage-backed active count.
- `extension/utils/trigger-store.js` -- `FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry'`, envelope shape, `hydrate`, `listArmedSnapshots`.
- `extension/background.js` -- `fsbTriggerHandleToolArm`, watch normalization, refresh-poll tick helpers, status/list projection, stop/status/list handlers, and existing trigger test hooks.
- `extension/utils/trigger-lifecycle.js` -- terminal/rearmed fire behavior, refresh-poll scheduling, TTL restore/reap, owner-release cleanup.
- `extension/ui/control_panel.html` -- existing Agent Concurrency card markup to clone for Trigger Concurrency.
- `extension/ui/options.js` -- `defaultSettings.fsbAgentCap`, element caching, input clamp, reset handler, storage onChanged counter refresh, load/save settings patterns.
- `extension/ui/options.css` and `extension/shared/fsb-ui-core.css` -- existing settings-card/form styles.
- `tests/change-report-settings-ui.test.js` -- source-shape UI persistence test pattern for settings controls.
- `tests/agent-cap.test.js`, `tests/agent-cap-storage.test.js`, `tests/trigger-cap.test.js` -- cap behavior and storage tests to mirror.

### MCP Docs and Versioning

- `mcp/src/tools/triggers.ts` -- public trigger registrar behavior, heartbeat/progress mapping, blocking/detached bridge options, reconnect recovery.
- `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs` -- canonical shared trigger schemas.
- `mcp/package.json`, `mcp/src/version.ts`, `mcp/server.json` -- MCP version metadata that must move together.
- `tests/mcp-version-parity.test.js` -- version parity and explicit README version checks.
- `tests/mcp-tool-smoke.test.js`, `tests/tool-definitions-parity.test.js`, `tests/visual-session-schema-lock.test.js` -- public MCP/tool registry gates.
- `mcp/README.md` -- detailed MCP tool surface and multi-agent contract docs.
- `mcp/CHANGELOG.md` -- published MCP release notes.
- `README.md` -- root public overview and docs governance notes.

### UAT and Full Verification

- `.planning/phases/16-live-observe-watch-analyzing-pulse/16-VERIFICATION.md` -- outstanding human_needed live-observe checks.
- `tests/trigger-refresh-poll.test.js`, `tests/trigger-tool-dispatcher.test.js`, `tests/trigger-blocking-reporting.test.js`, `tests/trigger-lifecycle.test.js`, `tests/trigger-manager.test.js` -- focused trigger suites to extend.
- `package.json` -- root `npm test` gate.
- `mcp/package.json` -- MCP `build` and publish packaging behavior.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- Agent Concurrency card: `extension/ui/control_panel.html` already has the exact UI pattern for numeric cap, helper copy, validation hint, and active counter.
- Options persistence: `extension/ui/options.js` already has end-to-end cap wiring with default settings, cacheElements, input clamp, reset, load/save, storage listener, and live counter refresh.
- Trigger cap runtime: `extension/utils/trigger-manager.js` already exposes `fsbTriggerCap`, default/min/max constants, and storage-local persistence.
- Trigger registry runtime: `extension/utils/trigger-store.js` already stores active trigger snapshots in `chrome.storage.session.fsbTriggerRegistry`.
- MCP trigger docs source of truth: `mcp/src/tools/triggers.ts` already embodies the blocking/detached behavior that docs should describe.

### Established Patterns

- Source-shape Node tests are accepted for settings UI wiring and docs-adjacent contracts when browser UI interaction is not necessary.
- Runtime ownership checks happen in background/dispatcher layers, not UI or MCP docs.
- MCP package version metadata is validated by `tests/mcp-version-parity.test.js`; update metadata and docs together.
- Full test runs can refresh generated showcase crawler timestamps; normalize unintended generated date-only churn after verification.

### Integration Points

- Trigger cap UI reads/writes `chrome.storage.local.fsbTriggerCap`; runtime cap enforcement reads the same key via `FsbTriggerManager.loadCapFromStorage`.
- Active trigger counter reads `chrome.storage.session.fsbTriggerRegistry.records`, matching the store envelope.
- Cross-mode conflict check plugs into `fsbTriggerHandleToolArm` after watch normalization and before `FsbTriggerManager.armTrigger(spec)`.
- Refresh-poll coalescing plugs into `fsbTriggerHandleRefreshPollAlarm` / `fsbTriggerRunRefreshPollTick`; MCP remains a reporting layer.
- Docs/version prep touches `mcp/CHANGELOG.md`, `mcp/README.md`, root `README.md`, `mcp/package.json`, `mcp/src/version.ts`, and `mcp/server.json`.
</code_context>

<specifics>
## Specific Ideas

- Prefer cloning Agent Concurrency card behavior rather than inventing a new settings component.
- Keep trigger conflict error code literal and stable: `TRIGGER_TAB_WATCH_CONFLICT`.
- Frame docs around "watch one element, notify-only, browser must stay open" to avoid overpromising server-side monitoring or push delivery.
</specifics>

<deferred>
## Deferred Ideas

- Desktop/browser push notifications on fire remain `NOTIFY-FUTURE-01`.
- Auto-act-on-fire workflows remain `NOTIFY-FUTURE-02`.
- Cross-browser-restart auto-resume remains `SURV-FUTURE-01`.
- Whole-page visual/screenshot diffing and multi-element compound trigger conditions remain out of v0.11.0 scope.

### Reviewed Todos (not folded)

None.
</deferred>
