// Types for the /stats Easter-egg page (quick task 260514-1nv).
//
// All shapes here are subsets of GitHub's public REST API responses (the only
// fields we actually consume), plus pure-data aggregator outputs and a
// per-dataset discriminated-union state. No I/O here -- types only.

/** GitHub chart view identifiers supported by the stats helpers. */
export type StatsViewId =
  | 'stars-cumulative'
  | 'stars-weekly'
  | 'forks-growth'
  | 'prs-opened-vs-merged'
  | 'commits-cumulative'
  | 'maintenance';

/** GET /repos/{owner}/{repo} -- totals card source. */
export interface RepoSummary {
  id: number;
  name: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count: number;
  default_branch: string;
  pushed_at: string;
}

/** GET /repos/{owner}/{repo}/stargazers with Accept: application/vnd.github.v3.star+json */
export interface StarEvent {
  starred_at: string;
}

/** One privacy-safe cumulative star snapshot, grouped by UTC calendar day. */
export interface GitHubStarHistoryPoint {
  day_utc: string;
  total: number;
}

/** Aggregate-only response from GET /api/public-stats/github/stars. */
export interface GitHubStarsStats {
  schema_version: 1;
  total: number;
  history: GitHubStarHistoryPoint[];
  history_complete: boolean;
  source: 'stargazers' | 'repository-count';
  as_of: string;
}

/** GET /repos/{owner}/{repo}/pulls?state=all */
export interface PullEvent {
  number: number;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

/** GET /repos/{owner}/{repo}/commits */
export interface CommitEvent {
  sha: string;
  commit: { author: { date: string } };
}

/** One privacy-safe cumulative commit snapshot, grouped by UTC calendar day. */
export interface GitHubCommitHistoryPoint {
  day_utc: string;
  total: number;
}

/** Aggregate-only response from GET /api/public-stats/github/commits. */
export interface GitHubCommitsStats {
  schema_version: 1;
  total: number;
  last_30_days: number;
  history: GitHubCommitHistoryPoint[];
  history_complete: boolean;
  as_of: string;
}

/** GET /repos/{owner}/{repo}/forks?sort=oldest */
export interface ForkEvent {
  id: number;
  created_at: string;
}

/** GET /repos/{owner}/{repo}/releases */
export interface ReleaseEvent {
  id: number;
  published_at: string;
  tag_name: string;
}

/** Generic time-bucketed numeric point. `t` is an ISO date or week-start string. */
export interface TimeSeriesPoint {
  t: string;
  y: number;
}

/**
 * Weekly stars delta point.
 *
 * `deltaPct` is `null` for the first emitted week (no prior bucket to compare).
 */
export interface WeeklyDelta {
  weekStart: string;
  count: number;
  deltaPct: number | null;
}

/**
 * Per-dataset state emitted by the service's BehaviorSubjects.
 *
 * - `loading`: pre-first-fetch and during SSR. Component renders skeleton.
 * - `ready`:   normal happy-path; data is the parsed (or aggregated) payload.
 * - `partial`: usable snapshot whose historical series is known incomplete.
 * - `stale`:   a refresh failed after a prior success; data remains usable but
 *              consumers must label it stale rather than live.
 * - `error`:   first load failed and no usable snapshot exists.
 */
export type DatasetState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T; fetchedAt: number }
  | { kind: 'partial'; data: T; fetchedAt: number; message: string }
  | { kind: 'stale'; data: T; fetchedAt: number; message: string }
  | { kind: 'error'; message: string };
