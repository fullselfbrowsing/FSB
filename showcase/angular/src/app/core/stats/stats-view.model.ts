import type {
  DatasetState,
  GitHubCommitHistoryPoint,
  GitHubCommitsStats,
  GitHubStarHistoryPoint,
  GitHubStarsStats,
} from './github-stats.types';

export type StatsDataSource =
  | 'stars'
  | 'commits'
  | 'fsb-active'
  | 'fsb-headline'
  | 'fsb-series';
export type RenderedStatsView =
  | 'stars-cumulative'
  | 'commits-cumulative'
  | 'fsb-active-now'
  | 'fsb-tokens'
  | 'fsb-popular-mcp';

export type StatsSourceStateMap = Record<StatsDataSource, DatasetState<unknown>>;

export type StatsViewDataState =
  | { kind: 'loading' }
  | { kind: 'ready'; fetchedAt: number }
  | { kind: 'partial'; fetchedAt: number; message: string }
  | { kind: 'stale'; fetchedAt: number; message: string }
  | { kind: 'error'; message: string };

export interface StatsResponseFreshness {
  cacheState: 'fresh' | 'stale';
  fetchedAt: number;
}

export function initialStatsSourceStates(): StatsSourceStateMap {
  return {
    stars: { kind: 'loading' },
    commits: { kind: 'loading' },
    'fsb-active': { kind: 'loading' },
    'fsb-headline': { kind: 'loading' },
    'fsb-series': { kind: 'loading' },
  };
}

export function updateStatsSourceState(
  states: StatsSourceStateMap,
  source: StatsDataSource,
  state: DatasetState<unknown>
): StatsSourceStateMap {
  return { ...states, [source]: state };
}

export function sourcesForStatsView(view: RenderedStatsView): readonly StatsDataSource[] {
  switch (view) {
    case 'stars-cumulative': return ['stars'];
    case 'commits-cumulative': return ['commits'];
    // The headline numbers are request-time, but the globe is backed by the
    // hourly regional aggregate. Both sources must be healthy before this
    // compound view can call itself Live.
    case 'fsb-active-now': return ['fsb-active', 'fsb-headline'];
    case 'fsb-tokens': return ['fsb-headline', 'fsb-series'];
    case 'fsb-popular-mcp': return ['fsb-headline'];
  }
}

export function selectedStatsViewState(
  view: RenderedStatsView,
  states: StatsSourceStateMap
): StatsViewDataState {
  return combineDatasetStates(sourcesForStatsView(view).map((source) => states[source]));
}

/** Combine only the sources used by the selected view. */
export function combineDatasetStates(
  states: readonly DatasetState<unknown>[]
): StatsViewDataState {
  const error = states.find((state) => state.kind === 'error');
  if (error?.kind === 'error') return { kind: 'error', message: error.message };
  if (states.length === 0 || states.some((state) => state.kind === 'loading')) {
    return { kind: 'loading' };
  }

  const snapshots = states.filter(
    (state): state is Extract<DatasetState<unknown>, { kind: 'ready' | 'partial' | 'stale' }> =>
      state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale'
  );
  const fetchedAt = Math.min(...snapshots.map((state) => state.fetchedAt));
  const stale = snapshots.find((state) => state.kind === 'stale');
  if (stale?.kind === 'stale') {
    return { kind: 'stale', fetchedAt, message: stale.message };
  }
  const partial = snapshots.find((state) => state.kind === 'partial');
  if (partial?.kind === 'partial') {
    return { kind: 'partial', fetchedAt, message: partial.message };
  }
  return { kind: 'ready', fetchedAt };
}

export function aggregateDatasetState<T extends { aggregate_updated_at?: string | null }>(
  data: T,
  checkedAt: number,
  now = Date.now()
): DatasetState<T> {
  const aggregateUpdatedAt = Date.parse(data.aggregate_updated_at ?? '');
  if (!Number.isFinite(aggregateUpdatedAt)) {
    return {
      kind: 'partial',
      data,
      fetchedAt: checkedAt,
      message: 'Historical aggregates are not available yet.',
    };
  }
  if (now - aggregateUpdatedAt > 2 * 60 * 60 * 1000) {
    return {
      kind: 'stale',
      data,
      fetchedAt: aggregateUpdatedAt,
      message: 'Historical aggregates have not updated in over two hours.',
    };
  }
  return { kind: 'ready', data, fetchedAt: aggregateUpdatedAt };
}

/** Downgrade a fresh request-time snapshot when v2 agent-count coverage is incomplete. */
export function activeSnapshotDatasetState<T extends {
  active_users_now: number;
  active_agents_reporting_users_now?: number;
  active_count_version?: number;
  active_metric_semantics?: string;
}>(data: T, checkedAt: number): DatasetState<T> {
  const activeUsers = Number(data.active_users_now);
  const reportingUsers = Number(data.active_agents_reporting_users_now);
  const hasV2Metadata = Number(data.active_count_version) >= 2 &&
    data.active_metric_semantics === 'reported_registry_count_v2' &&
    Number.isInteger(activeUsers) && activeUsers >= 0 &&
    Number.isInteger(reportingUsers) && reportingUsers >= 0 &&
    reportingUsers <= activeUsers;
  if (!hasV2Metadata || reportingUsers < activeUsers) {
    return {
      kind: 'partial',
      data,
      fetchedAt: checkedAt,
      message: 'Active-agent reporting coverage is incomplete.',
    };
  }
  return { kind: 'ready', data, fetchedAt: checkedAt };
}

/**
 * Difference between the current total and the cumulative total immediately
 * before the seven-day UTC window. Negative values are meaningful (unstars).
 */
export function rollingSevenDayStars(stats: GitHubStarsStats): number | null {
  if (!stats.history_complete) return null;
  const asOf = Date.parse(stats.as_of);
  const anchor = Number.isFinite(asOf) ? new Date(asOf) : new Date();
  const anchorDay = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate()
  );
  const baselineDay = anchorDay - 7 * 24 * 60 * 60 * 1000;
  let baseline: number | null = null;
  for (const point of stats.history) {
    const time = Date.parse(`${point.day_utc}T00:00:00Z`);
    if (Number.isFinite(time) && time <= baselineDay) baseline = point.total;
  }
  if (baseline === null) baseline = 0;
  return stats.total - baseline;
}

/** Read authoritative cache freshness headers, including on HTTP 304. */
export function statsResponseFreshness(headers: Pick<Headers, 'get'>): StatsResponseFreshness {
  const cacheState = headers.get('x-fsb-stats-cache');
  const fetchedAtHeader = headers.get('x-fsb-stats-fetched-at');
  const fetchedAt = Date.parse(fetchedAtHeader ?? '');
  if ((cacheState !== 'fresh' && cacheState !== 'stale') || !Number.isFinite(fetchedAt)) {
    throw new Error('Stats response is missing freshness metadata');
  }
  return { cacheState, fetchedAt };
}

export function normalizeGitHubStars(value: unknown): GitHubStarsStats {
  const record = requireRecord(value, 'stars');
  const history = normalizeHistory(record['history'], 'stars.history');
  const source = record['source'];
  if (source !== 'stargazers' && source !== 'repository-count') {
    throw new Error('Malformed stars response: invalid source');
  }
  const result: GitHubStarsStats = {
    schema_version: requireSchemaVersion(record, 'stars'),
    total: requireNonNegativeNumber(record['total'], 'stars.total'),
    history,
    history_complete: requireBoolean(record['history_complete'], 'stars.history_complete'),
    source,
    as_of: requireDateString(record['as_of'], 'stars.as_of'),
  };
  const finalTotal = result.history.at(-1)?.total ?? 0;
  if (finalTotal !== result.total) {
    throw new Error('Malformed stars response: history total is inconsistent');
  }
  return result;
}

export function normalizeGitHubCommits(value: unknown): GitHubCommitsStats {
  const record = requireRecord(value, 'commits');
  const result: GitHubCommitsStats = {
    schema_version: requireSchemaVersion(record, 'commits'),
    total: requireNonNegativeNumber(record['total'], 'commits.total'),
    last_30_days: requireNonNegativeNumber(record['last_30_days'], 'commits.last_30_days'),
    history: normalizeHistory(record['history'], 'commits.history'),
    history_complete: requireBoolean(record['history_complete'], 'commits.history_complete'),
    as_of: requireDateString(record['as_of'], 'commits.as_of'),
  };
  const finalTotal = result.history.at(-1)?.total ?? 0;
  if (result.last_30_days > result.total || finalTotal !== result.total) {
    throw new Error('Malformed commits response: totals are inconsistent');
  }
  return result;
}

function normalizeHistory(
  value: unknown,
  label: string
): Array<GitHubStarHistoryPoint | GitHubCommitHistoryPoint> {
  if (!Array.isArray(value)) throw new Error(`Malformed ${label}: expected an array`);
  const normalized: Array<GitHubStarHistoryPoint | GitHubCommitHistoryPoint> = [];
  let previousDay = '';
  for (const raw of value) {
    const point = requireRecord(raw, label);
    const day = requireUtcDay(point['day_utc'], `${label}.day_utc`);
    if (previousDay && day <= previousDay) {
      throw new Error(`Malformed ${label}: points must be strictly ascending`);
    }
    normalized.push({
      day_utc: day,
      total: requireNonNegativeNumber(point['total'], `${label}.total`),
    });
    previousDay = day;
  }
  return normalized;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Malformed ${label} response`);
  }
  return value as Record<string, unknown>;
}

function requireSchemaVersion(record: Record<string, unknown>, label: string): 1 {
  if (record['schema_version'] !== 1) {
    throw new Error(`Unsupported ${label} schema version`);
  }
  return 1;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Malformed ${label}`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Malformed ${label}`);
  return value;
}

function requireDateString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Malformed ${label}`);
  }
  return value;
}

function requireUtcDay(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Malformed ${label}`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Malformed ${label}`);
  }
  return value;
}
