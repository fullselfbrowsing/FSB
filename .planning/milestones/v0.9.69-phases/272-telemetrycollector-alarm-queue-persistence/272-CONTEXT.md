# Phase 272: TelemetryCollector + Alarm + Queue Persistence - Context

**Gathered:** 2026-05-14
**Status:** Planned (272-01-PLAN.md, 2026-05-14)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** BEAT-01..10

<domain>
## Phase Boundary

The extension transmits a single anonymous beat every 5 minutes, surviving MV3 service-worker eviction and tab close, honoring the opt-out toggle live on every flush.

**In scope:**
- New module `extension/utils/telemetry-collector.js` (function/prototype on `globalThis.fsbTelemetryCollector`).
- `chrome.alarms.create('fsb-telemetry-beat', { periodInMinutes: 5 })` registered at boot.
- Watermark-based aggregation: `lastBeatTs` in `chrome.storage.local`; on each flush, read fsbUsageData rows since watermark, aggregate by `(mcp_client, model)`, enqueue events, advance watermark.
- Queue persistence: `chrome.storage.local.fsbTelemetryQueue` (200-event cap, drop-oldest FIFO).
- Beat payload: `{ event_id, install_uuid, ts_minute, mcp_client, model, tokens_in (sum), tokens_out (sum), active_agent_count, event_type }`.
- Server URL: hardcoded `TELEMETRY_ENDPOINT = "https://full-selfbrowsing.com/api/telemetry/events"`.
- `install_announce` event on first install with 30s idle grace.
- Opt-out read live on every flush: if true, clear queue + no POST + alarm continues firing harmlessly.
- 24h stale-event drop at queue-load.
- `fetch(..., { keepalive: true })`; on failure (5xx or network), re-enqueue with capped retries (max 5 attempts per event, then drop).
- Tests covering: alarm registration, beat aggregation grouping, watermark advancement, queue FIFO cap, stale drop, opt-out short-circuit, install_announce timing, retry cap, no double-beat on SW eviction race.

**Explicitly NOT in scope:**
- Server-side ingest endpoint (Phase 273).
- Aggregations on the server (Phase 273+274).
- /stats page consumption (Phase 274).
- Privacy banner (declined per D-02).
- "View what we send" panel (deferred).

</domain>

<decisions>
## Implementation Decisions

### Beat shape: aggregated summary (per user Q1)
- One event per (mcp_client, model) group within the 5min window.
- Sums `tokens_in`, `tokens_out` across all rows in the group.
- `active_agent_count` is the count at flush time (one value across all events in the same batch).
- Multiple MCP clients in 5min window -> multiple events in one batch POST.

### Collector source: watermark on fsbUsageData (per user Q2)
- Storage key: `fsbTelemetryLastBeatTs` (number; ms epoch).
- On flush: read rows where `row.ts > lastBeatTs`; aggregate; enqueue events; advance watermark to `Date.now()` (NOT max(ts) — handle clock skew defensively).
- Decouples collector from recorder; recorder has zero coupling to collector.

### Active agent count source (per user Q3)
- Read `chrome.storage.local.fsbActiveAgentsCount` (number).
- If the key doesn't exist or is non-numeric, default to 0.
- A separate Task in this phase introduces lightweight tracking:
  - At MCP bridge `agent_id` session start (`mcp-bridge-client.js` create_agent route), increment.
  - At session end / agent disconnect, decrement.
  - Store as `fsbActiveAgentsCount` number (NOT a list — just a count, smaller surface).
  - Guard against negative counts (clamp to 0).

### Server endpoint
- `TELEMETRY_ENDPOINT = "https://full-selfbrowsing.com/api/telemetry/events"` — hardcoded constant in `extension/utils/telemetry-collector.js`.
- Phase 273 implements the matching server route. Until Phase 273 lands, collector requests will 404 — that's expected; queue retries handle it, queue cap drops oldest beats.

### Queue model
- `chrome.storage.local.fsbTelemetryQueue` — JSON array of event objects.
- Cap: 200 events. On overflow: drop OLDEST (FIFO). Log one debug-level warning per cap-hit.
- 24h stale drop on queue load: events where `(Date.now() - event.ts_minute) > 86_400_000` are removed.
- Failed POST: bump `attempts` counter on each event; cap at 5; events at cap are dropped on next flush.

### Alarm + lifecycle
- Register alarm in `extension/background.js` `chrome.runtime.onInstalled` and `onStartup` handlers (idempotent — chrome.alarms.create with same name replaces).
- Alarm handler in `background.js` listens for `chrome.alarms.onAlarm` filtering `alarm.name === 'fsb-telemetry-beat'`, then calls `globalThis.fsbTelemetryCollector.flush()`.
- Jitter: when alarm fires, `setTimeout(flush, Math.random() * 30000)` to spread requests across the 5min window.
- Install announce: in `onInstalled` handler, after 30s timer (NOT a chrome.alarm — too granular), enqueue an `install_announce` event and call flush directly (don't wait for the next 5min beat).

### Opt-out semantics
- Read `chrome.storage.local.fsbTelemetryOptOut` on every flush (NOT cached).
- If `true`:
  - Clear `fsbTelemetryQueue` (drop pending events).
  - Skip POST entirely.
  - Alarm continues firing harmlessly (no extra error condition).
  - Log one debug-level message per minute at most.

### Privacy gate
- The aggregation step MUST NOT copy any field from `fsbUsageData` rows except: `mcp_client`, `model`, `tokens_in`, `tokens_out`, `ts`. No `tool` name, no `pricing_confidence`, no `token_source`, no `cost_usd` (server doesn't need cost — it has the pricing module too).
- Field allowlist enforced in code AND in a new test `tests/telemetry-payload-allowlist.test.js` that scans `telemetry-collector.js` for forbidden symbols.

### Tests
- `tests/telemetry-collector.test.js` covering 10 sections:
  1. Beat aggregation: 5 rows in window with 2 distinct clients -> 2 events.
  2. Watermark advancement: 3 sequential flushes don't re-process old rows.
  3. Queue FIFO cap: 250 events queued -> 200 kept, 50 oldest dropped.
  4. Stale drop on load: 24h-old events removed.
  5. Opt-out short-circuit: opted-out flush clears queue + no POST + alarm survives.
  6. Install announce: first onInstalled + 30s + 1 event with `event_type: 'install_announce'`.
  7. Retry cap: 5 failed POSTs -> event dropped on 6th flush.
  8. Active agent count: reads from `fsbActiveAgentsCount`; defaults to 0 if missing.
  9. Allowlist gate: aggregation output has no `tool`/`url`/`prompt`/`cost_usd` fields.
  10. SW eviction simulation: two flush invocations close together don't double-POST.
- `tests/telemetry-payload-allowlist.test.js`: static grep gate over telemetry-collector.js source for forbidden identifiers.

### Claude's Discretion
- Exact retry backoff curve (recommend: 0s, 5min, 10min, 30min, 60min, then drop).
- Whether to expose a `flushNow()` debug method on globalThis for E2E testing.
- Exact `console.log` debug-level wording.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/mcp-metrics-recorder.js` (Phase 271) -- writes rows to `fsbUsageData`; collector reads from same surface.
- `extension/utils/install-identity.js` (Phase 269) -- `getOrCreateInstallUuid()` returns the UUID for `install_uuid` field; `isTelemetryOptedOut()` returns opt-out boolean.
- `extension/ws/mcp-bridge-client.js` -- existing chrome.alarms usage at line ~14 (`MCP_RECONNECT_ALARM` precedent) -- mirror that pattern.
- `chrome.storage.local` -- existing FSB convention; camelCase `fsb*` keys.

### Established Patterns
- `chrome.alarms.create` + `chrome.alarms.onAlarm` with name filter is the canonical MV3 pattern (already used elsewhere in FSB per ARCHITECTURE).
- `keepalive: true` fetch semantics survive tab close per STACK research.
- 24h stale-window matches PITFALLS recommendation.

### Integration Points
- `extension/background.js` importScripts chain: add `telemetry-collector.js` AFTER `mcp-metrics-recorder.js`.
- `extension/background.js` onInstalled + onStartup: register the alarm + (for onInstalled only) schedule the 30s install_announce.
- `extension/background.js` chrome.alarms.onAlarm handler: route `fsb-telemetry-beat` to collector.flush().
- `extension/background.js` (or `mcp-bridge-client.js`) agent session lifecycle: increment/decrement `fsbActiveAgentsCount`.

</code_context>

<specifics>
## Specific Ideas

- Phase 272 produces events that 404 against the server (Phase 273 lands the route next). Queue retries are by design — they shake out E2E once 273 ships.
- The `event_id = crypto.randomUUID()` generation happens at enqueue, not at flush, so multiple flush attempts of the same event share the ID (server INSERT OR IGNORE handles dedup).
- Active-agent-count is a NUMBER (smaller surface than agent-ID list); cannot deanonymize specific agents.

</specifics>

<deferred>
## Deferred Ideas

- Tunable retry backoff via remote config (hardcoded values for v0.9.69).
- Network-aware flush (e.g., only on WiFi) — too restrictive for a 5min beat.
- Per-event compression — beats are tiny (~200 bytes); gzip overhead exceeds savings.
- Real-time beat on user action (only periodic + install_announce in v0.9.69).

</deferred>
