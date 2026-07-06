---
phase: 272-telemetrycollector-alarm-queue-persistence
plan: 01
subsystem: telemetry
tags: [telemetry, mcp, chrome-alarms, queue-persistence, mv3-service-worker, privacy-gate, allowlist]
requires:
  - "extension/utils/install-identity.js (Phase 269): getOrCreateInstallUuid + isTelemetryOptedOut"
  - "extension/utils/mcp-metrics-recorder.js (Phase 271): fsbUsageData row shape with source='mcp'"
  - "extension/ws/mcp-tool-dispatcher.js: handleAgentRegisterRoute + handleAgentReleaseRoute as counter chokepoints"
provides:
  - "globalThis.fsbTelemetryCollector module surface: flush, enqueue, getPendingCount"
  - "chrome.storage.local keys: fsbTelemetryQueue, fsbTelemetryLastBeatTs, fsbActiveAgentsCount"
  - "chrome.alarms registry entry: fsb-telemetry-beat (periodInMinutes: 5)"
  - "Outbound HTTP: POST https://full-selfbrowsing.com/api/telemetry/events (Phase 273 will land the server route)"
  - "9-field beat payload contract for Phase 273 Zod allowlist: {event_id, install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type}"
affects:
  - "extension/background.js (importScripts + alarm handler branch + onInstalled/onStartup alarm registration + 30s install_announce setTimeout)"
  - "extension/ws/mcp-tool-dispatcher.js (read-modify-write counter hooks in agent register/release)"
  - "package.json (test chain extended with telemetry-collector.test.js + telemetry-payload-allowlist.test.js)"
tech-stack:
  added: []
  patterns:
    - "function/prototype on globalThis (mirrors install-identity.js + mcp-metrics-recorder.js); NO class, NO ES import/export -- importScripts-compatible in MV3 SW"
    - "chrome.alarms + setTimeout jitter for 5-min beat with 0-30s desync per-install"
    - "_setStorageShim / _setFetchShim / _setIdentityShim test-injection seams; mirror of MCPMetricsRecorder._setStorageShim"
    - "watermark-driven aggregation: fsbTelemetryLastBeatTs in chrome.storage.local advances to Date.now() (NOT max(ts) per CONTEXT D)"
    - "_flushLock Promise-chain serialization (PITFALLS §4.1) to defuse SW-eviction double-flush race"
    - "event_id minted at enqueue time -- retries share ID for server INSERT OR IGNORE dedup (threat T-272-05)"
    - "explicit object literal for beat payload (no spread / Object.assign / row destructuring) -- the in-code allowlist gate"
key-files:
  created:
    - "extension/utils/telemetry-collector.js (698 LOC)"
    - "tests/telemetry-collector.test.js (605 LOC, 71 assertions across 10 sections)"
    - "tests/telemetry-payload-allowlist.test.js (107 LOC, static-grep CI gate over 13 banned identifiers)"
  modified:
    - "extension/background.js (+30 LOC: importScripts +1, alarm onAlarm branch +12, onInstalled +20, onStartup +8)"
    - "extension/ws/mcp-tool-dispatcher.js (+27 LOC: register increment +12, release decrement +14, comments +1)"
    - "package.json (test chain: 2 new entries between mcp-metrics-no-pii-leak.test.js and transcript-store.test.js)"
decisions:
  - "Beat shape: aggregated summary per (mcp_client, model) tuple (CONTEXT D Q1 -- user-confirmed)"
  - "Watermark on fsbUsageData via fsbTelemetryLastBeatTs; advance to Date.now() not max(ts) (CONTEXT D Q2)"
  - "Active-agent count as a single integer in fsbActiveAgentsCount; counter hooks ONLY in dispatcher register/release (NOT in bridge onclose -- staged release routes back through release handler eventually; stale counter is acceptable telemetry quality cost per CONTEXT decision 3)"
  - "Hardcoded TELEMETRY_ENDPOINT constant (string literal in source); Phase 273 lands matching route; until then 404s queue and retry per 5-attempt cap"
  - "Queue lives EXCLUSIVELY in chrome.storage.local.fsbTelemetryQueue -- no top-level mutable queue, no chrome.storage.sync (D-11/IDENT-04)"
  - "Concurrent flush/enqueue serialized via module-level _flushLock; section 10 of behavior test asserts no double-POST under Promise.all(flush, flush)"
  - "event_id minted at enqueue time (not flush) per threat T-272-05; multiple flush attempts of the failed event share the ID; server-side INSERT OR IGNORE handles dedup"
  - "Aggregation copies ONLY (mcp_client, model, tokens_in, tokens_out, ts) from rows; tool/cost_usd/pricing_confidence/token_source are NEVER referenced in source (static-grep gate enforces)"
  - "All chrome.storage.local + fetch calls wrapped in try/catch; collector NEVER throws to caller per threat T-272-04 defence in depth"
  - "All internal logs gated to console.debug per BEAT-10 (no info/warn/error noise during normal beat operation)"
metrics:
  duration_minutes: 9
  tasks_completed: 3
  files_created: 3
  files_modified: 3
  loc_added_module: 698
  loc_added_tests: 712
  assertions_added: 71
  banned_identifiers_scanned: 13
  test_chain_entries_added: 2
  completed_date: "2026-05-14"
---

# Phase 272 Plan 01: TelemetryCollector + Alarm + Queue Persistence Summary

5-minute alarm-driven anonymous telemetry beat with watermarked aggregation over Phase 271's `fsbUsageData` rows, persisted FIFO queue, 5-attempt retry cap, live opt-out re-read, and a 30s post-install `install_announce` event -- all behind a 9-field payload allowlist enforced by both a static-grep CI gate and a runtime test assertion.

## What Landed

### Module added

**`extension/utils/telemetry-collector.js`** (698 LOC) on `globalThis.fsbTelemetryCollector`:

- `flush()` -- read `fsbUsageData` rows where `row.source === 'mcp' && row.ts > fsbTelemetryLastBeatTs`, group by `(client, model)`, emit one 9-field event per group, POST queue snapshot via `fetch(..., {keepalive: true})`, clear sent / re-enqueue failed with incremented `attempts`. Live opt-out re-read; opted-out -> clear queue + skip POST. Concurrency serialized via module-level `_flushLock`.
- `enqueue(input)` -- append to `fsbTelemetryQueue` with 200-cap FIFO drop-oldest. Mints `event_id` at enqueue time so retries share the ID (server INSERT OR IGNORE dedup). Tolerates partial input like `{event_type: 'install_announce'}` and resolves defaults internally (mcp_client='unknown', model='unknown', tokens_in=0, tokens_out=0, active_agent_count from `fsbActiveAgentsCount`).
- `getPendingCount()` -- read-only queue length helper.
- Constants exposed: `TELEMETRY_ENDPOINT = 'https://full-selfbrowsing.com/api/telemetry/events'`, `BEAT_ALARM_NAME = 'fsb-telemetry-beat'`.
- Test seams: `_setStorageShim`, `_setFetchShim`, `_setIdentityShim` for the Node test harness.

### Files edited

**`extension/background.js`** (+30 LOC across 4 surgical sites):
1. Line 47: `importScripts('utils/telemetry-collector.js')` immediately AFTER `mcp-metrics-recorder.js` line.
2. Lines 12970-12986: new `if (alarm.name === 'fsb-telemetry-beat')` branch in `chrome.alarms.onAlarm` listener with `setTimeout(flush, Math.random() * 30000)` jitter -- placed BEFORE the `isMcpReconnectAlarm` check.
3. Lines 13095-13123: `onInstalled` handler -- alarm registration (`chrome.alarms.create('fsb-telemetry-beat', {periodInMinutes: 5})`) + 30s `setTimeout` for `install_announce` enqueue+flush.
4. Lines 13165-13174: `onStartup` handler -- idempotent alarm registration only.

**`extension/ws/mcp-tool-dispatcher.js`** (+27 LOC across 2 sites):
1. `handleAgentRegisterRoute` (line ~1625): read-modify-write `fsbActiveAgentsCount += 1` placed AFTER cap-reached return + AFTER stampConnectionId + BEFORE the final return. AGENT_CAP_REACHED path does NOT increment.
2. `handleAgentReleaseRoute` (line ~1664): read-modify-write `fsbActiveAgentsCount := max(0, n - 1)` gated by `if (released)`. Clamp-to-0 guard.

Both write sites wrapped in best-effort `try/catch (_e) {}` -- storage failures swallowed silently per threat T-272-04 (counter is best-effort telemetry quality; throwing crashes dispatcher chokepoint).

### Storage keys introduced

- `fsbTelemetryQueue` -- JSON array of pending events (200-cap FIFO drop-oldest)
- `fsbTelemetryLastBeatTs` -- number; ms epoch watermark for `fsbUsageData` aggregation
- `fsbActiveAgentsCount` -- single integer; incremented in `handleAgentRegisterRoute`, decremented (clamp-to-0) in `handleAgentReleaseRoute`

All three keys are camelCase per project convention (IDENT-04: chrome.storage.local only, never sync).

### Alarms introduced

- `fsb-telemetry-beat` -- `chrome.alarms.create({periodInMinutes: 5})`, registered in BOTH `onInstalled` and `onStartup` (idempotent). Survives MV3 SW eviction because it lives in the Chrome alarms registry, not SW memory.

### HTTP endpoints touched (outbound only)

- `POST https://full-selfbrowsing.com/api/telemetry/events` with body `{events: [...]}` and `Content-Type: application/json`. `keepalive: true` so tab-close mid-beat completes the request. Phase 273 will land the matching server route -- until then POSTs return 404 and the 5-attempt retry cap + 200-FIFO handle the drop window cleanly.

### Tests added

**`tests/telemetry-collector.test.js`** (605 LOC, 71 assertions, 10 sections):
1. Beat aggregation: 5 rows / 2 distinct (client, model) tuples -> 2 events; tokens summed per group.
2. Watermark advancement: 3 sequential flushes; only new rows aggregated.
3. Queue FIFO cap: 250 enqueues -> 200 retained, oldest 50 dropped.
4. Stale drop on load: 24h boundary; 3 stale + 2 fresh -> 2 POSTed.
5. Opt-out short-circuit: no POST, queue cleared, no throw.
6. `install_announce` event shape: 9 keys, defaults applied.
7. Retry cap: 5 failed POSTs -> drop on 6th flush, no 6th POST attempted.
8. Active agent count default/coercion: 3 / missing / non-numeric / negative / float -> 4 -- 5 variants.
9. Runtime allowlist gate: emitted event has EXACTLY 9 keys; banned row fields (`tool`, `cost_usd`, `pricing_confidence`, `token_source`) NOT in payload even when present on the row.
10. SW eviction race: `Promise.all(flush(), flush())` -> exactly ONE POST via `_flushLock`.

**`tests/telemetry-payload-allowlist.test.js`** (107 LOC, static-grep CI gate):
- Scans 13 banned identifiers over `telemetry-collector.js` source with comments stripped: `tool, cost_usd, pricing_confidence, token_source, prompt, url, href, innerHTML, outerHTML, clipboard, Cookie, Authorization, .value`.
- Failure mode: exit 1 with line-numbered violations list. Fix is to repair the collector, not weaken the gate.

**`package.json`** test chain extended with both new entries in the exact position required by HARD CONSTRAINT 15: `...mcp-metrics-no-pii-leak.test.js -> telemetry-collector.test.js -> telemetry-payload-allowlist.test.js -> transcript-store.test.js...`.

## Test Results (post-commit)

```
=== telemetry-collector.test.js ===
Total: 71 passed, 0 failed
All telemetry-collector tests passed.

=== telemetry-payload-allowlist.test.js ===
PASS: telemetry-collector.js source contains no banned identifiers.
  - 13 banned patterns scanned (tool, cost_usd, pricing_confidence, token_source,
    prompt, url, href, innerHTML, outerHTML, clipboard, Cookie, Authorization, .value)
  - Scanned bytes (comment-stripped): 14477 / raw: 27781

=== existing regression: mcp-metrics-recorder.test.js ===
Total: 88 passed, 0 failed
```

## Deviations from Plan

None. The plan executed exactly as written.

A few observations worth flagging upstream:
- The plan's verification section mentions `grep -c "fsb-telemetry-beat" extension/background.js -- exactly 3`. The actual count is 3 (alarm handler branch + 2 `chrome.alarms.create` calls). Confirmed match.
- The plan's `verify <automated>` step `grep -cn "importScripts('utils/telemetry-collector.js')" extension/background.js` expects 1 -- confirmed.
- The plan's `verify <automated>` step `grep -nE "\\b(prompt|url|href|...)\\b" extension/utils/telemetry-collector.js | grep -v "^[0-9]*: *\\*\\| \\*\\|//"` -- the comment-strip predicate is loose, so several matches surface from JSDoc comment lines (lines 37-39 and 309-310). These are non-runtime references inside `/** ... */` blocks. The authoritative gate is `tests/telemetry-payload-allowlist.test.js` which strips comments PROPERLY before scanning and confirms zero runtime hits.

## Open Risks

1. **Server unreachable until Phase 273**: every beat POSTs to `https://full-selfbrowsing.com/api/telemetry/events` which currently returns 404. The retry counter + 24h stale drop + 200-FIFO cap together bound storage cost to ~40KB worst case for the inter-phase window. Events at the 5-attempt cap are dropped cleanly without log noise (BEAT-10).

2. **Beat-shape commitment**: Phase 273's Zod allowlist validator must match the exact 9-field contract documented in this SUMMARY (event_id, install_uuid, ts_minute, mcp_client, model, tokens_in, tokens_out, active_agent_count, event_type). Any divergence will surface as Phase 273 server-side validation failures rather than silent payload mismatches.

3. **`active_agent_count` accuracy under bridge-onclose staged release**: CONTEXT decision 3 explicitly accepts that the bridge `_ws.onclose` staged-release path does NOT route through `handleAgentReleaseRoute` for its in-flight grace window. If a bridge crashes mid-grace the counter stays inflated until either the bridge reconnects (no release fires) or the next register/release cycle. This is acknowledged telemetry quality cost; not a bug.

## Pattern Decisions to Surface Upstream for Phase 273

For the matching server route in Phase 273:

1. **Exact 9-field payload shape** (alphabetical sort for stable schema diff):
   ```
   active_agent_count: number >= 0 integer
   event_id: string (RFC 4122 v4 UUID format)
   event_type: enum 'periodic' | 'install_announce'
   install_uuid: string (RFC 4122 v4 UUID format)
   mcp_client: string (default 'unknown')
   model: string (default 'unknown')
   tokens_in: number >= 0 integer
   tokens_out: number >= 0 integer
   ts_minute: number (ms epoch, floored to 60000ms boundary)
   ```

2. **POST body envelope**: `{events: [<event>, <event>, ...]}` with `Content-Type: application/json`. No batch ID, no other top-level fields.

3. **Dedup contract**: UNIQUE constraint on `event_id` with `INSERT OR IGNORE` semantics. Client may POST the same event_id multiple times under retry; server must treat duplicates as success.

4. **No client-side auth**: telemetry endpoint is anonymous. The `install_uuid` field is the only identifier; it carries no cross-device link (chrome.storage.local only).

5. **Retry-friendly status codes**: collector treats any `response.ok === false` (incl. 500, 502, 503, 404 against pre-Phase-273 server) as failure and increments attempts. 4xx other than 404 also re-enqueue -- caller may want a Phase 273 INGEST decision on whether server-side `400 Bad Request` should be a hard-drop or a retry.

## Files Touched

| File | Change | Commit |
| --- | --- | --- |
| `extension/utils/telemetry-collector.js` | NEW (698 LOC) | `0c2a1d8` |
| `extension/background.js` | +30 LOC (4 surgical sites) | `0c2a1d8` |
| `extension/ws/mcp-tool-dispatcher.js` | +27 LOC (2 surgical sites) | `eaea6a3` |
| `tests/telemetry-collector.test.js` | NEW (605 LOC) | `205542f` |
| `tests/telemetry-payload-allowlist.test.js` | NEW (107 LOC) | `205542f` |
| `package.json` | +2 test entries in chain | `205542f` |

## Self-Check

- `extension/utils/telemetry-collector.js` exists, 698 LOC, module surface verified via `node -e`.
- `extension/background.js` modified: `importScripts` count = 1, `fsb-telemetry-beat` count = 3, `chrome.alarms.create` count = 2.
- `extension/ws/mcp-tool-dispatcher.js` modified: `fsbActiveAgentsCount` references = 8 (2 read-modify-write blocks each touching the key 4 times).
- `tests/telemetry-collector.test.js` exists, 71 assertions across 10 sections, all PASS.
- `tests/telemetry-payload-allowlist.test.js` exists, 13 banned patterns scanned, zero violations.
- `package.json` test chain ordered correctly: `mcp-metrics-no-pii-leak -> telemetry-collector -> telemetry-payload-allowlist -> transcript-store`.
- All 3 commits land cleanly on `worktree-agent-a8157dce41d4c657b` atop `28f2d9b` (the plan commit).
- Zero accidental file deletions across all 3 commits.

## Self-Check: PASSED
