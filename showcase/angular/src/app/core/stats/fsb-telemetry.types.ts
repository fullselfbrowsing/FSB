// Phase 274 / AGG-01..09 + STATS-03 -- types for FSBTelemetryService.
//
// Mirrors github-stats.types.ts structure: one DatasetState<T> discriminated
// union + per-endpoint response interfaces. No I/O here; types only.
//
// The FSB public-stats server endpoint is mounted at /api/public-stats and
// has no rate limiter (it is server-cached with a 30 s memo + 60 s
// Cache-Control). Even so, we keep the `rate-limited` variant of
// DatasetState<T> verbatim so any consumer that already handles the
// GitHubStatsService union shape continues to type-check unchanged --
// FSBTelemetryService simply never EMITS that variant.

/**
 * Headline response shape from GET /api/public-stats/global.
 *
 * Five fields come from SQLite rollups (telemetry_rollups_daily +
 * telemetry_global_aggregates -- Phase 273 housekeeper output), two from
 * the in-memory active-tracker (5-min users window, 10-min agent-sum
 * window), one bucketised display label, one derived ratio, and two arrays
 * of k-anonymity-filtered labels.
 */
export interface FSBTelemetryHeadline {
  /** Count of distinct install_uuids the server has seen in the last 5 minutes. */
  active_users_now: number;
  /** Sum of latest active_agent_count across UUIDs seen in last 10 minutes. */
  active_agents_now: number;
  /** Bucketised label for active_agents_now; one of '0'|'1'|'2-4'|'5-8'|'9-16'|'17-32'|'33+'. */
  active_agents_bucket: string;
  /** COUNT(DISTINCT install_uuid) FROM telemetry_rollups_daily. */
  total_users: number;
  /** SUM(max_active_agents) FROM telemetry_rollups_daily. */
  total_agents_lifetime: number;
  /** SUM(tokens_in_sum + tokens_out_sum) over all-time global aggregates. */
  tokens_total_lifetime: number;
  /** Same sum, scoped to the last 24 hours. */
  tokens_24h: number;
  /** Latest day's popular_mcp_json from the housekeeper; k>=5 floor already applied. */
  popular_mcp_clients: Array<{ label: string; uniq: number }>;
  /** Latest day's popular_agent_json from the housekeeper; k>=5 floor already applied. */
  popular_agents: Array<{ label: string; uniq: number }>;
  /** Latest day's popular_region_json from the housekeeper; k>=5 floor already applied (stricter than the k>=2 floor used for popular_mcp_clients/popular_agents). Labels are coarse country/US-state codes (e.g. 'US-CA', 'DE') or 'unknown'/'Other'. */
  popular_regions: Array<{ label: string; uniq: number }>;
  /** active_agents_now / active_users_now, rounded to 1 decimal; 0 when denom is 0. */
  avg_agents_per_user: number;
}

/**
 * One per-day point in any of the FSBTelemetrySeries windows.
 *
 * `tokens` is the server-side sum of (tokens_in_sum + tokens_out_sum) for
 * that day, NOT the raw `tokens_in_sum` / `tokens_out_sum` columns -- the
 * server collapses them so the client never sees a 2-D bar.
 */
export interface FSBTelemetrySeriesPoint {
  /** ISO calendar date in UTC, format YYYY-MM-DD. */
  day_utc: string;
  unique_installs: number;
  tokens: number;
  agents_active: number;
}

/**
 * Time-series response from GET /api/public-stats/global/series.
 *
 * Three windows. Each array is sorted ascending by `day_utc`. The arrays
 * are server-rendered against `telemetry_global_aggregates`, which the
 * housekeeper updates hourly with k>=5 anonymity protection already
 * applied to the popular_* fields (those are not part of this series).
 */
export interface FSBTelemetrySeries {
  /** Last 30 days (server-side `WHERE day_utc >= date('now', '-30 days')`). */
  d30: FSBTelemetrySeriesPoint[];
  /** Last 90 days. */
  d90: FSBTelemetrySeriesPoint[];
  /** Last 365 days. */
  d365: FSBTelemetrySeriesPoint[];
}

/**
 * Per-dataset state emitted by the service's BehaviorSubjects.
 *
 * Mirror of github-stats.types DatasetState<T> -- the `rate-limited` variant
 * is preserved verbatim so cross-service consumers (e.g. the stats-page
 * onDatasetUpdate switch) share one union shape. FSBTelemetryService
 * itself never emits `rate-limited` because the server endpoint is
 * server-cached, not rate-limited.
 */
export type DatasetState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T; fetchedAt: number }
  | { kind: 'rate-limited'; resetAt: number }
  | { kind: 'error'; message: string };
