# Phase 58: Providers Panel - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename the control panel's API Configuration surface to Providers and make provider selection explicitly distinguish the seven existing BYOK API providers from the milestone's three agent CLI providers. Render Phase 57 identity evidence, compute one advisory recommendation without changing the user's selection, preserve API and agent settings independently, and present honest agent status and subscription-usage copy. Delegated execution, adapter implementation, live run persistence, and adapter compatibility/auth detection remain in Phases 60-65.

</domain>

<decisions>
## Implementation Decisions

### Roster and Selection Surface
- Replace the native provider dropdown as the visible selection surface with compact selectable rows grouped under **Agent CLIs** and **API providers**. The existing API model selector remains the source of BYOK model configuration when an API provider is selected.
- Expose Claude Code, OpenCode, and Codex as the selectable agent providers because those are the only delegation adapters in this milestone. Other recognized or raw MCP clients from Phase 57 may appear in a secondary informational status area, but are non-selectable and cannot become the recommendation.
- Keep group and row order stable: Agent CLIs first, then API providers; agent tie order is Claude Code, OpenCode, then Codex; API order preserves the current seven-provider order. Recommendation moves only the badge, never the row.
- A row click changes the in-form selection and uses the existing unsaved-changes/Save flow. It does not persist immediately, auto-select a recommendation, or otherwise bypass the page's established save bar.

### State Model and Compatibility
- Add `providerKind` with the closed values `api` or `agent`, plus a separate `agentProviderId`. Keep `modelProvider`, `modelName`, and every existing key/endpoint setting API-only and byte-compatible.
- Migrate legacy settings deterministically: when `providerKind` is absent or invalid, use `api` with the saved valid `modelProvider`; use xAI only when no valid API value exists. Installed, connected, or clicked evidence never changes migration or selection.
- Preserve inactive-kind configuration. Selecting an agent leaves the BYOK provider, model, keys, and endpoints untouched; selecting an API provider leaves `agentProviderId` untouched. `universal-provider.js` must never observe an agent id.
- Unknown or unsupported MCP identities remain raw informational evidence. Do not fuzzy-map them, make them selectable, or let them participate in recommendation tie-breaking.

### Status and Recommendation Semantics
- Treat only a non-null Phase 57 `live` record as currently connected. A durable `connected` record without `live` is historical evidence and must be labeled honestly (for example, “Seen before”), never “Connected.”
- Compute exactly one recommendation in the strict tier order: live supported agent, installed supported agent, copy-clicked supported agent, then xAI. Historical `connected` evidence is display-only and does not form an extra tier.
- Resolve same-tier ties with fixed product order Claude Code, OpenCode, Codex. Do not use saved selection, click recency, connection recency, object iteration order, or dynamic row reordering as a tie-breaker.
- Refresh the merged evidence on initial load, when the Providers section is opened, on relevant `chrome.storage` changes, and through a manual refresh affordance. Do not poll continuously or trigger daemon disk scans on every window focus.
- Recommendation is advisory state only. Recomputing or refreshing it must never mutate the saved setting, the unsaved in-form choice, or the active BYOK provider.

### Agent Details and Billing Honesty
- When an agent row is selected, hide the API model combobox, all API-key/server/endpoint groups, key URLs, and model/key-format hints. Show install status, live connection status, historical-seen evidence where applicable, auth status, and the agent usage panel instead.
- Scope the no-key caption to FSB: FSB uses the CLI's existing sign-in and does not need its credential. Provider-specific copy must say that billing and limits follow the account or provider configured in that CLI; never infer subscription state from installation alone.
- Show auth as “Not reported” until a current CLI/adapter contract supplies a real auth state. Later adapter phases may enrich the same field without changing the Phase 58 selection model.
- Show token count, turn count, and duration without any dollar-value field. Before delegated-run data exists, render an honest “No delegated runs yet”/em-dash state rather than fabricated zeros, plus a current official vendor billing/account link. Show “Included in your subscription” only when adapter auth metadata confirms subscription-backed usage; otherwise show provider-specific billed/unknown wording.
- Keep unavailable agent rows visible and selectable as configuration intent. Mark them “Not installed” and provide an installation action; recommendation eligibility still comes only from Phase 57 evidence and never from a UI guess.

### the agent's Discretion
- Exact row density, icon treatment, responsive breakpoint, focus-ring styling, and wording of secondary “seen before” timestamps may follow the existing control-panel design system so long as status labels and selection state remain accessible and unambiguous.
- The secondary informational treatment for unsupported MCP clients may be collapsed or omitted when there is no such evidence; it must not compete visually with selectable providers.
- Choose the official vendor billing/account destinations during implementation research and lock them with tests so stale or fabricated URLs are not introduced.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/ui/control_panel.html` already owns the API Configuration nav item, section header, seven-value `#modelProvider` select, model combobox, per-provider key groups, and shared form-card primitives.
- `extension/ui/options.js` already centralizes element caching, provider-change wiring, `updateApiKeyVisibility`, settings load/save, unsaved-change handling, section routing, and hash replacement.
- Phase 57 exposes one guarded `getMcpClients` runtime action whose merged rows preserve `clicked`, `installed`, `connected`, and `live` separately; the UI should consume this contract rather than read storage maps directly.
- Existing control-panel button, badge, form-help, discovery-status, and save-bar styles can be extended for provider rows and status chips without introducing a separate UI framework.

### Established Patterns
- The options page is vanilla JavaScript over a static MV3 HTML document, uses two-space indentation, caches DOM references once, and persists settings through `chrome.storage.local` only when the existing Save action runs.
- The hidden native `#modelName` select remains the source of truth beneath the searchable model combobox, so API behavior can stay intact while the visible provider selection surface changes.
- `switchSection` matches `data-section` to section ids and writes the current hash; `initializeSections` accepts only an existing id, so the legacy `#api-config` alias must be normalized explicitly to canonical `#providers`.
- Extension tests commonly pin exact source tokens and execute focused VM/DOM harnesses. Provider-panel changes need paired source-tripwire updates in the same commit and a full suite from the first implementation commit.

### Integration Points
- Rename the nav target and section id in `extension/ui/control_panel.html`; normalize `api-config` to `providers` at the options-page section-routing boundary.
- Extend `defaultSettings`, `cacheElements`, `loadSettings`, `saveSettings`, provider event wiring, and visibility rendering in `extension/ui/options.js` while keeping `modelProvider` API-only.
- Query `{ action: 'getMcpClients' }` through the existing runtime boundary and refresh from relevant storage-change notifications; do not self-send from the service worker.
- Preserve `extension/ai/universal-provider.js` and every consumer of `settings.modelProvider` as BYOK-only; enforce the boundary with focused regression tests.

</code_context>

<specifics>
## Specific Ideas

- The visible hierarchy should read as a provider chooser, not as an API-key form with agent rows bolted on: selectable provider roster first, then kind-specific configuration/details.
- The “Recommended” badge must remain visually obvious but behaviorally inert; selection styling and recommendation styling should be distinct.
- Status copy should distinguish “Connected” from “Seen before,” and “Not reported” from “Unauthenticated,” rather than collapsing unknown states into negative claims.

</specifics>

<deferred>
## Deferred Ideas

- Making Cursor, VS Code, Windsurf, Claude Desktop, OpenClaw, or other observed MCP clients selectable requires a real delegation adapter and belongs in a future adapter phase.
- Live delegated-run metrics, streaming events, consent, stop/take-control behavior, and service-worker-eviction persistence remain Phase 61 work; Phase 58 provides only the honest empty-state surface and selection contract.
- Adapter-reported compatibility and detailed auth states arrive in Phases 62, 64, and 65 and may enrich existing status fields without changing this phase's storage model.

</deferred>
