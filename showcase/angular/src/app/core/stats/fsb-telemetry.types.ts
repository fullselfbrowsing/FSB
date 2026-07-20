// Phase 274 / AGG-01..09 + STATS-03 -- types for FSBTelemetryService.
//
// Mirrors github-stats.types.ts structure: one DatasetState<T> discriminated
// union + per-endpoint response interfaces. No I/O here; types only.
//
// The FSB public-stats server endpoint is mounted at /api/public-stats and
// has no rate limiter (it is server-cached with a 30 s memo + 60 s
// Cache-Control).

/**
 * Headline response shape from GET /api/public-stats/global.
 *
 * Retained aggregates come from SQLite rollups, while the active values are a
 * request-time snapshot of installs seen in the preceding ten minutes. Active
 * agent totals include only installs that supplied a trusted v2 registry count.
 */
export interface FSBTelemetryHeadline {
  /** Request-time active snapshot timestamp. */
  generated_at: string;
  /** Latest aggregate UTC day, or null while aggregate tables are empty. */
  aggregate_as_of_day: string | null;
  /** Last aggregate update timestamp, or null before the first housekeeper run. */
  aggregate_updated_at: string | null;
  /** Distinct installs with any telemetry event in the current 10-minute cohort. */
  active_users_now: number;
  /** Sum of trusted v2 registry counts within that same 10-minute cohort. */
  active_agents_now: number;
  /** Active installs in the cohort that supplied a trusted v2 agent count. */
  active_agents_reporting_users_now?: number;
  /** active_agents_reporting_users_now / active_users_now. */
  active_agents_coverage?: number;
  /** Bucketised label for active_agents_now; one of '0'|'1'|'2-4'|'5-8'|'9-16'|'17-32'|'33+'. */
  active_agents_bucket: string;
  /** Schema version for trusted active-agent accounting. */
  active_count_version?: number;
  /** First retained UTC day whose active counts use v2 accounting. */
  active_history_since?: string | null;
  /** False because known-corrupt pre-v2 history is intentionally excluded. */
  active_history_complete?: boolean;
  /** Explicit contract for interpreting the request-time active snapshot. */
  active_metric_semantics?: 'reported_registry_count_v2';
  /** Deprecated compatibility alias for users_365d; not a lifetime count. */
  total_users: number;
  /** Distinct installs represented in the retained 365-day rollup window. */
  users_365d: number;
  /** Deprecated unavailable field; anonymous telemetry cannot count lifetime agents. */
  total_agents_lifetime: number | null;
  /** Unavailable because known-corrupt pre-v2 history is excluded. */
  agent_days_lifetime: number | null;
  /** Cumulative agent-days only across trusted active-count-v2 rows. */
  agent_days_since_active_v2?: number | null;
  /** SUM(tokens_in_sum + tokens_out_sum) over all-time global aggregates. */
  tokens_total_lifetime: number;
  /** Same sum, scoped to the last 24 hours. */
  tokens_24h: number;
  /** Latest day's allowlisted MCP-client aggregate; the current display floor is 1. */
  popular_mcp_clients: Array<{ label: string; uniq: number }>;
  /** Latest day's agent-label aggregate (currently empty until agent rollups exist). */
  popular_agents: Array<{ label: string; uniq: number }>;
  /** Latest day's coarse region aggregate with a k>=5 floor. */
  popular_regions: Array<{ label: string; uniq: number }>;
  /** Compatibility alias for avg_agents_per_reporting_user. */
  avg_agents_per_user: number;
  /** active_agents_now / active_agents_reporting_users_now. */
  avg_agents_per_reporting_user?: number;
  /** Installs in the latest daily aggregate that supplied a trusted v2 count. */
  aggregate_active_reporting_installs?: number;
  /** Trusted active reporters divided by all installs in the latest daily aggregate. */
  aggregate_active_coverage?: number;
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
  /** Deprecated ambiguous field; always null for the repaired v2 contract. */
  agents_active: number | null;
  /** Sum of per-install daily peak registry counts; this is not concurrency. */
  reported_agent_daily_peak_sum?: number | null;
  /** Installs for the day that supplied a trusted v2 registry count. */
  active_reporting_installs?: number;
  /** Trusted active reporters divided by all installs represented that day. */
  active_coverage?: number;
  /** Whether the day's v2 count is usable and fully covered. */
  active_data_state?: 'ready' | 'partial' | 'unavailable';
}

/**
 * Time-series response from GET /api/public-stats/global/series.
 *
 * Three windows. Each array is sorted ascending by `day_utc`. The arrays
 * are server-rendered against `telemetry_global_aggregates`, which the
 * housekeeper updates hourly. Popular-label privacy floors are unrelated to
 * these numeric series and are only present on the headline endpoint.
 */
export interface FSBTelemetrySeries {
  /** Time at which this response was assembled. */
  generated_at: string;
  /** Latest aggregate UTC day, or null while aggregate tables are empty. */
  aggregate_as_of_day: string | null;
  /** Last aggregate update timestamp, or null before the first housekeeper run. */
  aggregate_updated_at: string | null;
  active_count_version?: number;
  active_history_since?: string | null;
  active_history_complete?: boolean;
  /** Explicitly identifies the series as sums of per-install daily peaks. */
  active_metric_semantics?: 'sum_of_per_install_daily_peaks';
  /** Exactly today plus the previous 29 UTC calendar days. */
  d30: FSBTelemetrySeriesPoint[];
  /** Last 90 days. */
  d90: FSBTelemetrySeriesPoint[];
  /** Last 365 days. */
  d365: FSBTelemetrySeriesPoint[];
}

/**
 * Per-dataset state emitted by the service's BehaviorSubjects.
 *
 * Mirror of github-stats.types DatasetState<T>. A failed refresh after a prior
 * success emits `stale` with the last usable snapshot; an initial failure emits
 * `error`.
 */
export type DatasetState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T; fetchedAt: number }
  | { kind: 'partial'; data: T; fetchedAt: number; message: string }
  | { kind: 'stale'; data: T; fetchedAt: number; message: string }
  | { kind: 'error'; message: string };
