# Phase 274: Public Aggregates Endpoint + FSBTelemetryService Angular + /stats Toggle Group - Context

**Gathered:** 2026-05-14
**Status:** Planned (2026-05-14, 2 plans, 4 tasks, 2 waves)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** AGG-01..09, STATS-01..07

<domain>
## Phase Boundary

A visitor to `https://full-selfbrowsing.com/stats` can see live anonymous aggregate metrics about FSB usage, k-anonymity-floor-protected, in all six supported locales.

**In scope:**
- New `showcase/server/src/routes/public-stats.js`: 2 unauthenticated GET endpoints:
  - `GET /api/public-stats/global` — headline numbers (active_users_now, total_users, total_agents_lifetime, active_agents_now, tokens_total_lifetime, tokens_24h, popular_mcp_clients, popular_agents, avg_agents_per_user).
  - `GET /api/public-stats/global/series` — time-series for chart views (per-day for the last 30d / 90d / 365d depending on metric).
- 30s in-process memo + HTTP `Cache-Control: max-age=60` headers. ETag/If-None-Match support.
- "Active users right now" — in-memory `Map<install_uuid, last_seen_ts>` updated by Phase 273's INGEST hook; 5-min window. NOT a SQLite query.
- "Active agents right now" — sum of latest `active_agent_count` field across UUIDs seen in last 10 min. Bucketed for display.
- k-anonymity floor (k>=5) for popular_mcp_clients + popular_agents — below-k labels bucketed as `"Other (N=<count>)"` (the housekeeper already enforces this per Phase 273 WR-01 fix; public endpoint reads telemetry_global_aggregates which is pre-filtered).
- New `showcase/angular/src/app/core/stats/fsb-telemetry.service.ts` (Angular) mirroring `github-stats.service.ts` (PLATFORM_ID guard, `BehaviorSubject<DatasetState<T>>`, `afterNextRender` bootstrap, ETag cache, 5-min visibility-aware polling).
- New `showcase/angular/src/app/core/stats/fsb-telemetry.types.ts` (Angular types).
- `showcase/angular/src/app/pages/stats/stats-page.component.{ts,html,scss}` updates: append 6 toggle entries (`fsb-active-now`, `fsb-tokens`, `fsb-agents-running`, `fsb-popular-agents`, `fsb-popular-mcp`, `fsb-avg-agents-per-user`); new headline row; section heading "FSB Telemetry".
- i18n: ~20-30 new trans-units in `messages.xlf` + AI-filled across `messages.{es,de,ja,zh-CN,zh-TW}.xlf`. Build-time `i18nMissingTranslation: error` MUST pass.
- Tests: server-side public-stats endpoint tests; Angular service unit tests; build smoke (`npm --prefix showcase/angular run build` succeeds with the new strings).

**Explicitly NOT in scope:**
- Public API documentation (deferred per STATS-07 / TELEMETRY-FUTURE-06).
- Per-day sparkline charts (deferred per TELEMETRY-FUTURE-07).
- Geo heatmap (deferred per TELEMETRY-FUTURE-08).
- Privacy policy text (Phase 275).
- CWS listing updates (Phase 275 / B3).
- Dashboard streaming fix (Phase 276).

</domain>

<decisions>
## Implementation Decisions

### Public endpoint mount + auth
- Routes mounted at `app.use('/api/public-stats', createPublicStatsRouter(db, queries))` — NO `auth` middleware. Mounted AFTER auth-gated routes so the auth router can't shadow it.
- CORS already permissive (`cors({ origin: true })`); no change needed.
- Path `/api/public-stats` is distinct from existing auth-gated `/api/stats` — no shadow.

### Cache strategy (per user Q3)
- In-process `Map<string, {body, etag, expiresAt}>` keyed by route path. TTL 30s. LRU eviction (cap 100 entries — only ~2 routes anyway).
- HTTP response headers: `Cache-Control: max-age=60`, `ETag: "<sha256-of-body>"`. Client-side If-None-Match → 304 fast path.
- Client-side polling at 5min naturally lands outside the 30s server memo window — no thundering-herd.

### "Active right now" sources
- `active_users_now` — in-memory `Map<install_uuid, last_seen_ts>` populated by the `/api/telemetry/events` route on every successful insert. NOT a SQLite query. New module `showcase/server/src/telemetry/active-tracker.js` exposes `recordSeen(uuid)` + `countActiveUsers(windowMs)` + `getActiveAgentSum(windowMs)`. Eviction: lazy on read (drop entries older than 10min — covers active_agents window).
- `active_agents_now` — sum of `latest_active_agent_count` per UUID over the same Map (active-tracker stores the latest active_agent_count along with the timestamp). 10-min window. Bucketed for display (`{0, 1, 2-4, 5-8, 9-16, 17-32, 33+}`).

### Aggregations
- All other aggregates come from `telemetry_global_aggregates` (lifetime rollups) + `telemetry_rollups_daily` (per-day per-UUID).
  - `total_users` — `SELECT COUNT(DISTINCT install_uuid) FROM telemetry_rollups_daily`.
  - `total_agents_lifetime` — `SELECT SUM(max_active_agents) FROM telemetry_rollups_daily`.
  - `tokens_total_lifetime` — `SELECT SUM(tokens_in_sum + tokens_out_sum) FROM telemetry_global_aggregates`.
  - `tokens_24h` — `SELECT SUM(tokens_in_sum + tokens_out_sum) FROM telemetry_global_aggregates WHERE day_utc >= date('now', '-1 day')`.
  - `popular_mcp_clients` + `popular_agents` — read pre-computed JSON from `telemetry_global_aggregates.popular_mcp_json` + `popular_agent_json`. Housekeeper from Phase 273 (with WR-01 fix) writes these with k>=5 floor already applied.
  - `avg_agents_per_user` — `active_agents_now / active_users_now` (or 0 if denom 0).
- Series endpoint: 30 / 90 / 365-day windows over `telemetry_global_aggregates`. Bucketed per day.

### Angular service shape
- `showcase/angular/src/app/core/stats/fsb-telemetry.service.ts` mirrors `github-stats.service.ts` exactly:
  - `PLATFORM_ID` guard at constructor (browser-only fetches).
  - `BehaviorSubject<DatasetState<FSBTelemetryHeadline>>` for `headline$`.
  - `BehaviorSubject<DatasetState<FSBTelemetrySeries>>` for `series$`.
  - `afterNextRender(() => this._bootstrap())` for SSR-safe init.
  - ETag cache in-memory; `If-None-Match` on every refetch.
  - 5-min visibility-aware polling: `setInterval` started on visible, cleared on `document.hidden === true`, resumed on `visibilitychange`.
  - Public methods: `headline$`, `series$`, `refresh()`, `destroy()`.
- `fsb-telemetry.types.ts` exports: `FSBTelemetryHeadline`, `FSBTelemetrySeries`, `DatasetState<T>`, `FSBTelemetryServiceState`.

### Stats page updates
- `stats-page.component.ts`: import `FSBTelemetryService` next to `GitHubStatsService`. Add 6 new entries to the existing toggle array (matching GH view's pattern). Subscribe to `headline$` + `series$` BehaviorSubjects. Render same chart shape (line / bar / pie depending on metric).
- `stats-page.component.html`: new section after the existing GH toggles: `<div class="stats-headline">{{ headline.active_now }} active · {{ headline.total_users }} total · {{ headline.tokens_24h }} tokens 24h</div>` (with i18n markers).
- `stats-page.component.scss`: minor styling for headline row + section heading. Reuse existing card tokens.

### i18n strategy (per user Q1)
- ~20-30 new trans-units added to `showcase/angular/src/locale/messages.xlf` with `i18n` markers on each new string.
- Run `npm --prefix showcase/angular run extract-i18n-clean` (existing script per v0.9.63) to regenerate the source XLF.
- AI-fill 5 non-en locales: dispatch a translation agent OR use an inline batched-translation pattern (one batched LLM call with all new strings).
- Build-time `i18nMissingTranslation: error` invariant — must pass.

### Public API documentation (per user Q2)
- NOT advertised in v0.9.69. Endpoints are live but considered internal-use-only.
- Path `/api/public-stats/global` is intentionally chosen to be future-versioned (`/api/public-stats/v1/global` migration in v0.9.70+ if needed).
- No `OpenAPI` / docs file in this phase.

### Tests
- Server: `tests/server-public-stats-headline.test.js` (GET /global returns valid shape + ETag + cache headers); `tests/server-public-stats-series.test.js` (GET /global/series returns time-series); `tests/server-public-stats-cache.test.js` (30s memo + If-None-Match 304); `tests/server-public-stats-no-auth.test.js` (no Set-Cookie, no auth, no PII).
- Angular: `tests/fsb-telemetry-service.test.js` (Node-runnable; mocks fetch + chrome.runtime; validates polling cadence + visibility pause).
- Build smoke: `npm --prefix showcase/angular run build` succeeds.

### Claude's Discretion
- Exact chart type per view (line / bar / spark) — match existing GitHub view conventions.
- Whether to add a tiny "active right now" pulse indicator (real-time-ish) — recommend NO; 5-min poll is enough and matches GitHub views.
- Whether to expose `active_agents_now` raw or bucketed-only — recommend bucketed (defense-in-depth against fingerprinting heavy users).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showcase/angular/src/app/core/stats/github-stats.service.ts` (561 lines) — the canonical pattern: BehaviorSubject discriminated-union streams, PLATFORM_ID guard, afterNextRender, ETag cache, visibility-aware polling. FSBTelemetryService is a near-line-for-line mirror with different endpoint URLs and types.
- `showcase/angular/src/app/pages/stats/stats-page.component.ts` (478 lines) — existing chart-toggle scaffold; add new view types to the same enum + switch.
- `showcase/server/src/db/queries.js` — telemetry query patterns from Phase 273; add SELECT prepared statements for the public-stats aggregations.
- `showcase/server/src/telemetry/housekeeper.js` — already computes popular_mcp_json with k>=5 floor (post WR-01 fix); public-stats just reads it.

### Established Patterns
- Existing /api routes mount via `app.use('/api/X', ...)`; pattern to mirror.
- ETag generation: SHA-256 of body JSON; first 16 hex chars per github-stats.service convention.
- i18n trans-unit IDs: existing convention is custom (`@@SHOWCASE_STATS_FSB_ACTIVE_NOW` etc.) per v0.9.63.

### Integration Points
- `showcase/server/server.js`: add `app.use('/api/public-stats', createPublicStatsRouter(db, queries))` AFTER auth routes + telemetry route mount.
- `showcase/server/src/telemetry/active-tracker.js` (NEW): exposes recordSeen, countActiveUsers, getActiveAgentSum.
- `showcase/server/src/routes/telemetry.js`: add `activeTracker.recordSeen(install_uuid, active_agent_count, ts_minute)` call inside the events INSERT loop.
- `showcase/angular/src/app/pages/stats/stats-page.component.ts`: import FSBTelemetryService, add 6 toggle entries, render new headline row.
- `showcase/angular/src/locale/messages.xlf` + 5 non-en files.

</code_context>

<specifics>
## Specific Ideas

- The "active agents now" bucketing must match Phase 273's k-anonymity bucket scheme: `{0, 1, 2-4, 5-8, 9-16, 17-32, 33+}`.
- Phase 274 is the FIRST phase where end-users will see the telemetry numbers publicly. Sanity-checks (no negative numbers, no NaN, no empty popular_mcp lists due to k-floor) belong here.
- `/stats` page must stay Easter-egg-invisible: no sitemap, llms.txt, prerender, hreflang changes. Verify by running `verify-hreflang.mjs` after build.

</specifics>

<deferred>
## Deferred Ideas

- Public API documentation + versioning (TELEMETRY-FUTURE-06).
- Per-day sparkline charts (TELEMETRY-FUTURE-07).
- Geo heatmap (TELEMETRY-FUTURE-08).
- 1Hz real-time active-agents ticker (TELEMETRY-FUTURE-09).
- Authenticated /api/private-stats with finer granularity for ops dashboards.

</deferred>
