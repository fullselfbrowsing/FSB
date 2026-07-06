---
phase: 274-public-aggregates-fsbtelemetryservice-stats-toggle
plan: 01
subsystem: api
tags: [express, sqlite, better-sqlite3, angular, rxjs, etag, telemetry, public-aggregates, k-anonymity]

requires:
  - phase: 273-server-schema-telemetry-routes-salt-rate-limit-housekeeper
    provides: telemetry_global_aggregates + telemetry_rollups_daily tables; housekeeper-pre-filtered popular_*_json (k>=5 floor)
provides:
  - GET /api/public-stats/global (FSBTelemetryHeadline; 10 fields; ETag + 30s memo + Cache-Control)
  - GET /api/public-stats/global/series (FSBTelemetrySeries; d30/d90/d365 windows)
  - In-memory active-tracker (Map<install_uuid,{ts,agent_count}>; lazy eviction; bucketAgents helper)
  - activeTracker.recordSeen hook inside POST /api/telemetry/events success path
  - FSBTelemetryService Angular mirror (PLATFORM_ID guard, 2 BehaviorSubjects, 5-min visibility-aware polling, ETag cache)
  - 4 server-side tests + 1 Angular service test = 5 tests / 160 sub-assertions
affects: [274-02 (stats-page UI), 275 (privacy policy linking)]

tech-stack:
  added: []
  patterns:
    - "GitHub-stats-service mirror pattern: structural copy with endpoint + rate-limit-branch swap; no shared base class."
    - "ETag round-trip with in-process memo: 30 s server memo + 60 s Cache-Control; client If-None-Match -> 304 short-circuit."
    - "Active-tracker module: module-scoped Map + lazy eviction on read (no timer / no setInterval / no persistence)."
    - "Public-stats response shape: hand-built typed object (no SELECT *); regex-asserted no PII in test."

key-files:
  created:
    - showcase/server/src/telemetry/active-tracker.js
    - showcase/server/src/routes/public-stats.js
    - showcase/angular/src/app/core/stats/fsb-telemetry.service.ts
    - showcase/angular/src/app/core/stats/fsb-telemetry.types.ts
    - tests/server-public-stats-headline.test.js
    - tests/server-public-stats-series.test.js
    - tests/server-public-stats-cache.test.js
    - tests/server-public-stats-no-auth.test.js
    - tests/fsb-telemetry-service.test.js
  modified:
    - showcase/server/src/db/queries.js
    - showcase/server/src/routes/telemetry.js
    - showcase/server/server.js
    - package.json

key-decisions:
  - "Use receive-time (Date.now() captured in the route) NOT client ts_minute when calling recordSeen, defending against clients with drifted clocks pinning themselves active."
  - "Lazy eviction in active-tracker (drop entries older than EVICTION_MS=10min on every read); no timer to keep the hot-path cheap."
  - "Response body hand-built from typed fields (FSBTelemetryHeadline shape); no SELECT *. Defensive renames map raw {mcp_client, uniq} -> {label, uniq} and {agent, uniq} -> {label, uniq}."
  - "Memo+ETag both keyed by route path so /global and /global/series have independent cache lifetimes. 304 short-circuits with empty body per RFC 7232."
  - "FSBTelemetryService keeps DatasetState's rate-limited variant in the type union for cross-service consumer ergonomics, but never emits it -- the server endpoint is cached, not rate-limited."
  - "Angular service test uses a fake harness reimplementing the polling state machine + static grep asserts on the .ts source; we don't bring Angular zone into Node tests."

patterns-established:
  - "Mirror-of-canonical-service pattern: copy github-stats.service.ts byte-by-axis, swap only the GitHub-specific bits (vendor accept headers, 403+RateLimit branch)."
  - "k-anonymity floor enforcement: ALWAYS read popular_* from housekeeper output; never compute live in the route."
  - "Public endpoint no-auth + no-cookie posture: res.removeHeader('Set-Cookie') before send; tests/server-public-stats-no-auth.test.js regex-asserts."

requirements-completed:
  - AGG-01
  - AGG-02
  - AGG-03
  - AGG-04
  - AGG-05
  - AGG-06
  - AGG-07
  - AGG-08
  - AGG-09
  - STATS-03
  - STATS-04

duration: 11min
completed: 2026-05-14
---

# Phase 274 Plan 01: Public Aggregates Endpoint + FSBTelemetryService Summary

**Anonymous /api/public-stats/global + /global/series endpoints (ETag + 30s memo + Cache-Control: max-age=60) backed by an in-memory active-tracker, plus the Angular FSBTelemetryService mirror (2 BehaviorSubjects, PLATFORM_ID guard, 5-min visibility-aware polling, ETag cache).**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-14T17:59:19Z
- **Completed:** 2026-05-14T18:10:49Z
- **Tasks:** 2
- **Files created:** 9
- **Files modified:** 4
- **Lines added:** 1817 (1083 in Task 1 + 734 in Task 2)
- **Tests:** 5 new files / 160 sub-assertions

## Accomplishments

- `/api/public-stats/global` returns the full FSBTelemetryHeadline shape (10 fields) with ETag, Cache-Control: max-age=60, and no Set-Cookie. 304 round-trip works on matching If-None-Match.
- `/api/public-stats/global/series` returns FSBTelemetrySeries with d30/d90/d365 windows, ascending by `day_utc`, with the monotonic length invariant `d30.length <= d90.length <= d365.length`.
- `active-tracker.js` provides recordSeen + countActiveUsers + getActiveAgentSum + bucketAgents helpers backed by a module-scoped Map with lazy 10-min eviction. No timers, no persistence; module-private; only counts/sums leave the module.
- `recordSeen` hook lands in `routes/telemetry.js` AFTER successful INSERT in the events POST handler, using wall-clock receive time (drift defense).
- `FSBTelemetryService.ts` mirrors `github-stats.service.ts` line-for-axis: PLATFORM_ID + isPlatformBrowser guards, 2 BehaviorSubjects (`headline$`, `series$`), idempotent `start()`/`stop()`, 5-min `setInterval` polling that auto-pauses on `document.hidden` and auto-resumes with an immediate refresh on visibility-change, in-memory ETag cache with `If-None-Match` round-trip, `Promise.allSettled` on parallel fetches. The X-RateLimit-Remaining 403 branch is REMOVED (server is cached, not rate-limited).
- 5 tests / 160 sub-assertions pass; 13 pre-existing Phase 273 telemetry tests still pass (no regression).

## Task Commits

1. **Task 1: Server public-stats endpoint + active-tracker + recordSeen hook + 4 tests** — `5dfc6c1` (feat)
2. **Task 2: FSBTelemetryService Angular mirror + types + harness test** — `a4744bf` (feat)

## Files Created/Modified

### Created (9 files)

- `showcase/server/src/telemetry/active-tracker.js` (141 lines) — module-scoped Map; recordSeen + countActiveUsers + getActiveAgentSum + bucketAgents + _resetForTest.
- `showcase/server/src/routes/public-stats.js` (225 lines) — createPublicStatsRouter factory; GET /global + GET /global/series; in-process memo + ETag + Cache-Control; defensive Set-Cookie removal; _resetMemoForTest hook.
- `showcase/angular/src/app/core/stats/fsb-telemetry.service.ts` (211 lines) — Angular service mirroring github-stats.service.
- `showcase/angular/src/app/core/stats/fsb-telemetry.types.ts` (90 lines) — 4 exported types.
- `tests/server-public-stats-headline.test.js` (215 lines, 33 assertions)
- `tests/server-public-stats-series.test.js` (141 lines, 21 assertions)
- `tests/server-public-stats-cache.test.js` (134 lines, 17 assertions)
- `tests/server-public-stats-no-auth.test.js` (153 lines, 21 assertions)
- `tests/fsb-telemetry-service.test.js` (431 lines, 68 assertions)

### Modified (4 files)

- `showcase/server/src/db/queries.js` — +6 prepared statements (aggregateTotalUsers / aggregateTotalAgentsLifetime / aggregateTokensLifetime / aggregateTokens24h / selectLatestGlobalAggregate / selectSeriesForWindow) + 2 helper methods (getPublicHeadlineRows / getPublicSeriesRows).
- `showcase/server/src/routes/telemetry.js` — +activeTracker require; +activeTracker.recordSeen loop inside events POST after successful insert. Uses wall-clock receive time (`now`), not client ts_minute.
- `showcase/server/server.js` — +createPublicStatsRouter require + `app.use('/api/public-stats', createPublicStatsRouter(db, queries))` mount, AFTER /api/telemetry and BEFORE static files.
- `package.json` — +5 test entries chained into test script (4 server tests + 1 service test), positioned after server-telemetry-housekeeper.test.js and before server-no-ip-leak.test.js.

## Endpoint Shapes (Reference for Plan 02)

### GET /api/public-stats/global — FSBTelemetryHeadline

```json
{
  "active_users_now": 3,
  "active_agents_now": 6,
  "active_agents_bucket": "5-8",
  "total_users": 3,
  "total_agents_lifetime": 7,
  "tokens_total_lifetime": 575,
  "tokens_24h": 525,
  "popular_mcp_clients": [{"label": "Claude", "uniq": 6}, {"label": "Other (N=12)", "uniq": 12}],
  "popular_agents": [{"label": "agent-x", "uniq": 8}],
  "avg_agents_per_user": 2.0
}
```
Headers: `ETag: "<16hex>"`, `Cache-Control: public, max-age=60`, `Content-Type: application/json; charset=utf-8`. No `Set-Cookie`. No `WWW-Authenticate`.

### GET /api/public-stats/global/series — FSBTelemetrySeries

```json
{
  "d30":  [{"day_utc": "2026-04-15", "unique_installs": 5, "tokens": 150, "agents_active": 7}, ...],
  "d90":  [...],
  "d365": [...]
}
```

### FSBTelemetryService public surface

```typescript
@Injectable({ providedIn: 'root' })
export class FSBTelemetryService {
  readonly headline$: BehaviorSubject<DatasetState<FSBTelemetryHeadline>>;
  readonly series$:   BehaviorSubject<DatasetState<FSBTelemetrySeries>>;
  start(): void;   // idempotent, browser-only, 5min interval + visibilitychange listener
  stop(): void;
  refreshAll(): Promise<void>;
}
```

## active-tracker Invariants (verified by tests)

- `recordSeen(uuid, agent_count, ts_ms)`: upserts entry (latest wins); coerces non-integer agent_count to 0.
- `countActiveUsers(windowMs)`: returns count of entries with `ts > now - windowMs`, after evicting entries older than 10 min.
- `getActiveAgentSum(windowMs)`: returns SUM(agent_count) for entries in window, after same eviction.
- `bucketAgents(n)`: maps to one of `{'0','1','2-4','5-8','9-16','17-32','33+'}`.
- Module-scoped state; tests call `_resetForTest()` between runs to keep hermetic.

## Decisions Made

- **Receive-time vs client time:** active-tracker stores `Date.now()` captured in the route handler, not the client's `ts_minute`. A drifted client cannot pin itself active indefinitely.
- **Lazy eviction:** no `setInterval` cleanup; every read drops stale entries. 10-min ceiling covers both the 5-min active-users and 10-min active-agents windows.
- **No persistence:** server restart wipes the Map; the next 5 min of incoming beats rebuild it. Acceptable per Phase 273 CONTEXT D-05.
- **Mirror, not shared base:** FSBTelemetryService is a structural copy of github-stats.service; we did not extract a polling base class because the github service has aggregator helpers FSB lacks, and the shared base would force null branches into github-stats.
- **Keep DatasetState's rate-limited variant:** preserves cross-service consumer ergonomics in stats-page (Task 3) even though FSBTelemetryService never emits it.
- **Test harness for service polling:** rather than bring Angular zone into Node tests, we reimplement the polling state machine in a FakeFSBTelemetryService class and drive it through 6 phases (cold, start, poll cycle with 304, tab-hidden, tab-visible, stop/restart).

## Deviations from Plan

None — plan executed exactly as written. Two minor implementation choices clarified:

1. **Memo eviction LRU:** plan said "cap 100 entries"; implemented as `Map.keys().next().value` first-key drop when at cap (insertion-order is the LRU proxy). With 2 routes today the branch is effectively dead code; the cap is belt-and-suspenders.
2. **bucketAgents return type:** plan said the field is `active_agents_bucket: string`; I added explicit non-finite + negative-input guards in `bucketAgents` (returns `'0'`) so a future caller passing NaN/-1 cannot leak `'undefined'` into the JSON.

## Issues Encountered

- **Worktree node_modules missing:** symlinked `showcase/server/node_modules` and `showcase/angular/node_modules` to the main repo's resolved paths so `require.resolve(..., { paths: [SERVER_NM] })` could find better-sqlite3, express, cors, etc. The symlinks are gitignored (`node_modules/` at repo root). No code change needed.
- **HEAD-ref reset to fc8716:** on startup the worktree HEAD was on a different lineage (858e692, the main branch tip). The worktree_branch_check directive in the prompt told me to verify `git merge-base HEAD fc871655c78297a49b7875e29d6526d028e27832` and reset if mismatched. Reset was required and performed; the worktree is now correctly seeded from the Phase 274 planning commits.

## Self-Check: PASSED

All claimed Plan 01 artifacts verified:

- `showcase/server/src/telemetry/active-tracker.js` — FOUND
- `showcase/server/src/routes/public-stats.js` — FOUND
- `showcase/angular/src/app/core/stats/fsb-telemetry.service.ts` — FOUND
- `showcase/angular/src/app/core/stats/fsb-telemetry.types.ts` — FOUND
- `tests/server-public-stats-headline.test.js` — FOUND (33 assertions pass)
- `tests/server-public-stats-series.test.js` — FOUND (21 assertions pass)
- `tests/server-public-stats-cache.test.js` — FOUND (17 assertions pass)
- `tests/server-public-stats-no-auth.test.js` — FOUND (21 assertions pass)
- `tests/fsb-telemetry-service.test.js` — FOUND (68 assertions pass)
- Commit `5dfc6c1` — FOUND (Task 1)
- Commit `a4744bf` — FOUND (Task 2)

## Next Phase Readiness

- **Plan 274-02 unblocked.** FSBTelemetryService is exported from `showcase/angular/src/app/core/stats/fsb-telemetry.service.ts`. Plan 02 (Task 3) imports it next to `GitHubStatsService` in `stats-page.component.ts`.
- **Server endpoints live.** The Angular service will fetch `/api/public-stats/global` and `/api/public-stats/global/series` from the same origin; no CORS configuration needed beyond the existing permissive `cors({ origin: true })`.
- **i18n note:** all the new component strings landed by Plan 02 (6 toggle labels, 3 headline labels, 1 section heading, ~6 chart legend labels) — Plan 01 is data-plane-only.
