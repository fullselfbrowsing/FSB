// Types for the /stats Easter-egg page (quick task 260514-1nv).
//
// All shapes here are subsets of GitHub's public REST API responses (the only
// fields we actually consume), plus pure-data aggregator outputs and a
// per-dataset discriminated-union state. No I/O here -- types only.

/**
 * 7 chart views exposed by /stats. The component renders one at a time;
 * data for all views is shared via the same set of BehaviorSubjects so
 * switching views never triggers a refetch.
 */
export type StatsViewId =
  | 'stars-cumulative'
  | 'stars-weekly'
  | 'issues-open-vs-closed'
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

/**
 * GET /repos/{owner}/{repo}/issues?state=all
 *
 * GitHub returns PRs inside the issues stream. The `pull_request` discriminator
 * field is present (and non-`undefined`) on PRs -- the aggregator uses this to
 * filter PRs back out of the issue series.
 */
export interface IssueEvent {
  number: number;
  created_at: string;
  closed_at: string | null;
  pull_request?: unknown;
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
 * - `rate-limited`: HTTP 403 + `X-RateLimit-Remaining: 0`. UI shows retry card.
 * - `error`:   any other fetch/parse failure. UI shows generic retry hint.
 */
export type DatasetState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T; fetchedAt: number }
  | { kind: 'rate-limited'; resetAt: number }
  | { kind: 'error'; message: string };
