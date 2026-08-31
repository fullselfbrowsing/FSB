import type {
  DatasetState,
  GitHubCommitHistoryPoint,
  GitHubCommitsStats,
  GitHubStarHistoryPoint,
  GitHubStarsStats,
} from './github-stats.types';
import type { DatasetAvailability } from './dataset-state.types';

export const GITHUB_FRESHNESS_SLA_MS = 15 * 60 * 1000;
export const ACTIVE_FRESHNESS_SLA_MS = 15 * 60 * 1000;
export const AGGREGATE_FRESHNESS_SLA_MS = 2 * 60 * 60 * 1000;
export const STATS_HARD_LIMIT_MS = 24 * 60 * 60 * 1000;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

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
  | { kind: 'ready'; snapshotAt: number | null; checkedAt: number }
  | { kind: 'partial'; snapshotAt: number | null; checkedAt: number; message: string }
  | { kind: 'error'; message: string };

export interface StatsResponseFreshness extends DatasetAvailability {
  cacheState: 'fresh' | 'stale';
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
    // Regions are an optional visualization. Only the request-time active
    // snapshot determines whether Active now is Live.
    case 'fsb-active-now': return ['fsb-active'];
    case 'fsb-tokens': return ['fsb-headline', 'fsb-series'];
    case 'fsb-popular-mcp': return ['fsb-headline'];
  }
}

export function freshnessSlaForStatsView(view: RenderedStatsView): number {
  switch (view) {
    case 'stars-cumulative':
    case 'commits-cumulative':
      return GITHUB_FRESHNESS_SLA_MS;
    case 'fsb-active-now':
      return ACTIVE_FRESHNESS_SLA_MS;
    case 'fsb-tokens':
    case 'fsb-popular-mcp':
      return AGGREGATE_FRESHNESS_SLA_MS;
  }
}

export function selectedStatsViewState(
  view: RenderedStatsView,
  states: StatsSourceStateMap,
  now = Date.now()
): StatsViewDataState {
  return combineDatasetStates(
    sourcesForStatsView(view).map((source) => states[source]),
    freshnessSlaForStatsView(view),
    now
  );
}

/** Combine only the sources used by the selected view. */
export function combineDatasetStates(
  states: readonly DatasetState<unknown>[],
  freshnessSlaMs: number,
  now = Date.now()
): StatsViewDataState {
  const error = states.find((state) => state.kind === 'error');
  if (error?.kind === 'error') return { kind: 'error', message: error.message };
  if (states.length === 0 || states.some((state) => state.kind === 'loading')) {
    return { kind: 'loading' };
  }

  const snapshots = states.filter(
    (state): state is Extract<DatasetState<unknown>, { kind: 'ready' }> =>
      state.kind === 'ready'
  );
  if (snapshots.some((state) =>
    (state.availability.snapshotAt !== null &&
      !Number.isFinite(state.availability.snapshotAt)) ||
    !Number.isFinite(state.availability.checkedAt)
  )) {
    return { kind: 'error', message: 'Stats response is missing freshness metadata.' };
  }

  const normalizedSnapshotTimes = snapshots.map((state) => {
    const time = state.availability.snapshotAt;
    return time === null || time > now + MAX_FUTURE_SKEW_MS ? null : time;
  });
  const knownSnapshotTimes = normalizedSnapshotTimes.flatMap((time) =>
    time === null ? [] : [time]
  );
  const hasUnknownSnapshotTime = knownSnapshotTimes.length !== snapshots.length;
  const snapshotAt = hasUnknownSnapshotTime ? null : Math.min(...knownSnapshotTimes);
  const checkedAt = Math.min(...snapshots.map((state) => state.availability.checkedAt));
  const ages = knownSnapshotTimes.map((time) => Math.max(0, now - time));
  if (ages.some((age) => age > STATS_HARD_LIMIT_MS)) {
    return {
      kind: 'error',
      message: 'The last usable snapshot is more than 24 hours old.',
    };
  }
  if (hasUnknownSnapshotTime || ages.some((age) => age > freshnessSlaMs)) {
    return {
      kind: 'partial',
      snapshotAt,
      checkedAt,
      message: 'One or more required snapshots are outside the freshness window.',
    };
  }
  return { kind: 'ready', snapshotAt, checkedAt };
}

export function aggregateDatasetState<T extends { aggregate_updated_at?: string | null }>(
  data: T,
  availability: DatasetAvailability
): DatasetState<T> {
  const aggregateUpdatedAt = Date.parse(data.aggregate_updated_at ?? '');
  return {
    kind: 'ready',
    data,
    availability: {
      ...availability,
      snapshotAt: Number.isFinite(aggregateUpdatedAt) ? aggregateUpdatedAt : null,
    },
  };
}

/** Use the request timestamp for Active now; reporting coverage is separate quality data. */
export function activeSnapshotDatasetState<T extends {
  generated_at?: string | null;
}>(data: T, availability: DatasetAvailability): DatasetState<T> {
  const generatedAt = Date.parse(data.generated_at ?? '');
  return {
    kind: 'ready',
    data,
    availability: {
      ...availability,
      snapshotAt: Number.isFinite(generatedAt) ? generatedAt : availability.snapshotAt,
    },
  };
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
  const snapshotAt = Date.parse(headers.get('x-fsb-stats-fetched-at') ?? '');
  const checkedAt = Date.parse(headers.get('x-fsb-stats-checked-at') ?? '');
  const upstreamStatus = headers.get('x-fsb-stats-upstream-status')?.trim() ?? '';
  const nextRetryHeader = headers.get('x-fsb-stats-next-retry-at');
  const nextRetryAt = nextRetryHeader === null ? undefined : Date.parse(nextRetryHeader);
  if (
    (cacheState !== 'fresh' && cacheState !== 'stale') ||
    !Number.isFinite(snapshotAt) ||
    !Number.isFinite(checkedAt) ||
    upstreamStatus.length === 0 ||
    (nextRetryAt !== undefined && !Number.isFinite(nextRetryAt))
  ) {
    throw new Error('Stats response is missing freshness metadata');
  }
  return {
    cacheState,
    snapshotAt,
    checkedAt,
    upstreamStatus,
    ...(nextRetryAt === undefined ? {} : { nextRetryAt }),
  };
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
