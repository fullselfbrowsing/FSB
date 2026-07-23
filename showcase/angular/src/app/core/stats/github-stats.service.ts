// Browser lifecycle + aggregate GitHub data for the /stats page. Only the
// two GitHub datasets rendered by the current UI are requested. A route-session
// generation and AbortControllers prevent a completion from an old visit
// from repopulating the singleton service after stop()/start().

import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

import {
  CommitEvent,
  DatasetAvailability,
  DatasetState,
  ForkEvent,
  GitHubCommitsStats,
  GitHubStarsStats,
  PullEvent,
  ReleaseEvent,
  StarEvent,
  TimeSeriesPoint,
  WeeklyDelta,
} from './github-stats.types';
import {
  normalizeGitHubCommits,
  normalizeGitHubStars,
  StatsResponseFreshness,
  statsResponseFreshness,
} from './stats-view.model';
import {
  availabilityAfterFailure,
  httpStatsFetchError,
  retryAfterTimestamp,
  statsFailureMetadata,
} from './stats-fetch-error';

// Quick task 260516-7l5 -- same-origin server-side cache. The server polls
// GitHub once per 5 min into showcase/server/.../github_cache and serves each
// endpoint_id at /api/public-stats/github/<endpoint_id>. The browser never
// hits api.github.com directly, so the 60-req/hr per-IP unauth limit no
// longer applies to individual visitors. Pagination, vendor Accept types, and
// rate-limit handling all live server-side now; this client just consumes
// JSON and feeds the same aggregator functions (cumulativeStarsSeries etc.).
const API_ROOT = '/api/public-stats/github';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min (matches server poll cadence)
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface EtagCacheEntry<T = unknown> {
  etag: string;
  body: T;
}

interface FetchResult<T> extends StatsResponseFreshness {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class GitHubStatsService {
  private readonly platformId = inject(PLATFORM_ID);

  /** ETag store keyed by full request URL. */
  private readonly etagCache = new Map<string, EtagCacheEntry>();

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private visibilityListener: (() => void) | null = null;
  private started = false;
  private generation = 0;
  private readonly controllers = new Set<AbortController>();
  private refreshInFlight: Promise<void> | null = null;

  readonly stars$ = new BehaviorSubject<DatasetState<GitHubStarsStats>>({ kind: 'loading' });
  readonly commits$ = new BehaviorSubject<DatasetState<GitHubCommitsStats>>({ kind: 'loading' });

  /**
   * Idempotent boot. Called by the page component inside `afterNextRender`.
   * No-op on the server and on duplicate calls. Sets up visibility-aware
   * 5-minute polling and fires an immediate refresh.
   */
  start(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.started) return;
    this.started = true;
    this.generation += 1;
    this.stars$.next({ kind: 'loading' });
    this.commits$.next({ kind: 'loading' });

    void this.refreshAll();
    this.startPoller();

    this.visibilityListener = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        if (this.pollHandle !== null) {
          clearInterval(this.pollHandle);
          this.pollHandle = null;
        }
      } else {
        if (this.pollHandle === null && this.started) {
          void this.refreshAll();
          this.startPoller();
        }
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  /**
   * Tear down all timers + listeners. Called from the page's ngOnDestroy.
   * Safe to call multiple times.
   */
  stop(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.retryHandle !== null) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
    if (this.visibilityListener !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    this.visibilityListener = null;
    this.started = false;
    this.generation += 1;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.refreshInFlight = null;
  }

  /**
   * Refresh the two GitHub datasets actually rendered by the page. Concurrent calls
   * coalesce, so a focus event cannot race an interval tick.
   */
  async refreshAll(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.started) return;
    if (this.refreshInFlight) return this.refreshInFlight;

    const generation = this.generation;
    const refresh = Promise.allSettled([
      this.fetchDataset(
        `${API_ROOT}/stars`,
        this.stars$,
        normalizeGitHubStars,
        generation
      ),
      this.fetchDataset(
        `${API_ROOT}/commits`,
        this.commits$,
        normalizeGitHubCommits,
        generation
      ),
    ]).then(() => undefined);
    this.refreshInFlight = refresh;
    try {
      await refresh;
    } finally {
      if (this.refreshInFlight === refresh) this.refreshInFlight = null;
    }
  }

  private startPoller(): void {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => void this.refreshAll(), POLL_INTERVAL_MS);
  }

  private async fetchDataset<T>(
    url: string,
    subject: BehaviorSubject<DatasetState<T>>,
    normalize: (value: unknown) => T,
    generation: number
  ): Promise<void> {
    try {
      const result = await this.fetchJson(url, normalize);
      if (!this.isCurrent(generation)) return;
      subject.next({
        kind: 'ready',
        data: result.data,
        availability: availabilityFromResponse(result),
      });
    } catch (err) {
      if (!this.isCurrent(generation) || isAbortError(err)) return;
      const message = humanError(err);
      const failure = statsFailureMetadata(err);
      const previous = subject.value;
      if (previous.kind === 'ready') {
        subject.next({
          kind: 'ready',
          data: previous.data,
          availability: availabilityAfterFailure(previous.availability, err),
        });
      } else {
        subject.next({ kind: 'error', message, failure });
      }
    }
  }

  /**
   * Fetch a single JSON resource same-origin with ETag round-trip support.
   * Returns the validated body on 200 or 304. A cold-cache 503 schedules an
   * earlier Retry-After refresh and throws into either Unavailable or a
   * metadata-noted last-known-good snapshot.
   */
  private async fetchJson<T>(
    url: string,
    normalize: (value: unknown) => T
  ): Promise<FetchResult<T>> {
    if (!isPlatformBrowser(this.platformId)) throw new Error('Stats are browser-only');

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    const cached = this.etagCache.get(url) as EtagCacheEntry<T> | undefined;
    if (cached) headers['If-None-Match'] = cached.etag;

    const controller = new AbortController();
    this.controllers.add(controller);
    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } finally {
      this.controllers.delete(controller);
    }

    if (response.status === 304 && cached) {
      return { data: cached.body, ...statsResponseFreshness(response.headers) };
    }
    const retryAfter = response.headers.get('retry-after');
    if (response.status === 503) {
      this.scheduleRetry(retryAfter);
      throw httpStatsFetchError(
        'Stats are warming up; retrying shortly.',
        response.status,
        retryAfter
      );
    }
    if (!response.ok) {
      if (retryAfter !== null) this.scheduleRetry(retryAfter);
      throw httpStatsFetchError(
        `stats ${response.status} on ${url}`,
        response.status,
        retryAfter
      );
    }

    const parsed = normalize(await response.json());
    const etag = response.headers.get('etag');
    if (etag) {
      this.etagCache.set(url, { etag, body: parsed });
    }
    return { data: parsed, ...statsResponseFreshness(response.headers) };
  }

  private scheduleRetry(retryAfter: string | null): void {
    if (!this.started || this.retryHandle !== null) return;
    const now = Date.now();
    const requestedRetryAt = retryAfterTimestamp(retryAfter, now);
    const delay = requestedRetryAt !== undefined
      ? Math.min(Math.max(0, requestedRetryAt - now), POLL_INTERVAL_MS)
      : 30_000;
    this.retryHandle = setTimeout(() => {
      this.retryHandle = null;
      if (this.started) void this.refreshAll();
    }, delay);
  }

  private isCurrent(generation: number): boolean {
    return this.started && generation === this.generation;
  }

  // --- Pure aggregators (public so the page component can re-derive on view
  //     switches without re-fetching). All inputs come from the BehaviorSubject
  //     `ready` payloads. Defensive against shape mismatches via typeof checks. ---

  cumulativeStarsSeries(stars: StarEvent[]): TimeSeriesPoint[] {
    return cumulativeStarsSeries(stars);
  }

  weeklyStarsDelta(stars: StarEvent[]): WeeklyDelta[] {
    return weeklyStarsDelta(stars);
  }

  forksGrowth(forks: ForkEvent[]): TimeSeriesPoint[] {
    return forksGrowth(forks);
  }

  prsOpenedVsMerged(prs: PullEvent[]): { opened: TimeSeriesPoint[]; merged: TimeSeriesPoint[] } {
    return prsOpenedVsMerged(prs);
  }

  commitsOverTime(commits: CommitEvent[]): TimeSeriesPoint[] {
    return commitsOverTime(commits);
  }

  cumulativeCommitsSeries(commits: CommitEvent[]): TimeSeriesPoint[] {
    return cumulativeCommitsSeries(commits);
  }

  maintenanceSignal(releases: ReleaseEvent[], commits: CommitEvent[]): TimeSeriesPoint[] {
    return maintenanceSignal(releases, commits);
  }

  commitPunchcard(commits: CommitEvent[]): PunchcardPoint[] {
    return commitPunchcard(commits);
  }

  monthlyForks(forks: ForkEvent[]): TimeSeriesPoint[] {
    return monthlyForks(forks);
  }
}

/**
 * Punchcard cell -- one bubble in the GitHub-style "commits by hour of day +
 * weekday" view. `x` is the UTC hour (0-23), `y` is the UTC weekday
 * (0=Sun..6=Sat), `r` is the sqrt-scaled commit count clamped to 3..20 px so
 * a busy bucket does not dominate the canvas, and `c` is the raw un-scaled
 * commit count for that bucket -- used by the tooltip so users see
 * "5 commits" instead of the meaningless radius value (Codex P2 on PR #58).
 */
export interface PunchcardPoint { x: number; y: number; r: number; c: number }

// --- Pure aggregator implementations (exported for unit-test reuse). ---

function isValidIsoString(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && !Number.isNaN(Date.parse(s));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO week-start (Monday, UTC). */
function startOfUtcIsoWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const wd = day.getUTCDay(); // 0=Sun..6=Sat
  const back = (wd + 6) % 7; // distance to Monday
  return new Date(day.getTime() - back * DAY_MS);
}

export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function cumulativeStarsSeries(stars: StarEvent[]): TimeSeriesPoint[] {
  const valid = stars.filter((s) => isValidIsoString(s?.starred_at));
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => Date.parse(a.starred_at) - Date.parse(b.starred_at));
  const buckets = new Map<string, number>();
  for (const s of sorted) {
    const dayKey = isoDate(startOfUtcDay(new Date(s.starred_at)));
    buckets.set(dayKey, (buckets.get(dayKey) ?? 0) + 1);
  }
  // Emit running cumulative.
  const out: TimeSeriesPoint[] = [];
  let running = 0;
  for (const [dayKey, count] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    running += count;
    out.push({ t: dayKey, y: running });
  }
  return out;
}

export function cumulativeCommitsSeries(commits: CommitEvent[]): TimeSeriesPoint[] {
  const valid = commits.filter((c) => isValidIsoString(c?.commit?.author?.date));
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => Date.parse(a.commit.author.date) - Date.parse(b.commit.author.date));
  const buckets = new Map<string, number>();
  for (const c of sorted) {
    const dayKey = isoDate(startOfUtcDay(new Date(c.commit.author.date)));
    buckets.set(dayKey, (buckets.get(dayKey) ?? 0) + 1);
  }
  // Emit running cumulative.
  const out: TimeSeriesPoint[] = [];
  let running = 0;
  for (const [dayKey, count] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    running += count;
    out.push({ t: dayKey, y: running });
  }
  return out;
}

export function weeklyStarsDelta(stars: StarEvent[]): WeeklyDelta[] {
  const valid = stars.filter((s) => isValidIsoString(s?.starred_at));
  // Buckets keyed by ISO week-start.
  const buckets = new Map<string, number>();
  for (const s of valid) {
    const key = isoDate(startOfUtcIsoWeek(new Date(s.starred_at)));
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  // Last 12 weeks ending this week.
  const now = startOfUtcIsoWeek(new Date());
  const weeks: string[] = [];
  for (let i = 11; i >= 0; i--) {
    weeks.push(isoDate(new Date(now.getTime() - i * WEEK_MS)));
  }
  const out: WeeklyDelta[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const wk = weeks[i];
    const count = buckets.get(wk) ?? 0;
    let deltaPct: number | null = null;
    if (i > 0) {
      const prev = buckets.get(weeks[i - 1]) ?? 0;
      deltaPct = prev === 0 ? (count === 0 ? 0 : 100) : ((count - prev) / prev) * 100;
    }
    out.push({ weekStart: wk, count, deltaPct });
  }
  return out;
}

export function forksGrowth(forks: ForkEvent[]): TimeSeriesPoint[] {
  const valid = forks.filter((f) => isValidIsoString(f?.created_at));
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const out: TimeSeriesPoint[] = [];
  let running = 0;
  // Bucket by day, emit cumulative.
  const buckets = new Map<string, number>();
  for (const f of sorted) {
    const k = isoDate(startOfUtcDay(new Date(f.created_at)));
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  for (const [k, c] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    running += c;
    out.push({ t: k, y: running });
  }
  return out;
}

export function prsOpenedVsMerged(prs: PullEvent[]): { opened: TimeSeriesPoint[]; merged: TimeSeriesPoint[] } {
  const opened = new Map<string, number>();
  const merged = new Map<string, number>();
  for (const p of prs) {
    if (isValidIsoString(p?.created_at)) {
      const k = isoDate(startOfUtcDay(new Date(p.created_at)));
      opened.set(k, (opened.get(k) ?? 0) + 1);
    }
    if (isValidIsoString(p?.merged_at)) {
      const k = isoDate(startOfUtcDay(new Date(p.merged_at)));
      merged.set(k, (merged.get(k) ?? 0) + 1);
    }
  }
  return {
    opened: mapToSortedSeries(opened),
    merged: mapToSortedSeries(merged),
  };
}

export function commitsOverTime(commits: CommitEvent[]): TimeSeriesPoint[] {
  // Bucket commits by ISO week, last 12 weeks.
  const buckets = new Map<string, number>();
  for (const c of commits) {
    const d = c?.commit?.author?.date;
    if (!isValidIsoString(d)) continue;
    const k = isoDate(startOfUtcIsoWeek(new Date(d)));
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const now = startOfUtcIsoWeek(new Date());
  const out: TimeSeriesPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const wk = isoDate(new Date(now.getTime() - i * WEEK_MS));
    out.push({ t: wk, y: buckets.get(wk) ?? 0 });
  }
  return out;
}

export function maintenanceSignal(releases: ReleaseEvent[], commits: CommitEvent[]): TimeSeriesPoint[] {
  if (releases.length > 0) {
    // Releases per month over last 12 months.
    const buckets = new Map<string, number>();
    for (const r of releases) {
      if (!isValidIsoString(r?.published_at)) continue;
      const k = isoDate(startOfUtcMonth(new Date(r.published_at)));
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const now = startOfUtcMonth(new Date());
    const out: TimeSeriesPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const k = isoDate(month);
      out.push({ t: k, y: buckets.get(k) ?? 0 });
    }
    return out;
  }
  // Fallback: commits per week over last 12 weeks.
  return commitsOverTime(commits);
}

/**
 * Bucket commits by UTC weekday (0=Sun..6=Sat) and UTC hour (0..23), emitting
 * one bubble cell per non-empty bucket. Radius is sqrt-scaled and clamped to
 * 3..20 px so a dominant bucket cannot blow out the chart. Invalid ISO date
 * strings are filtered out via isValidIsoString -- matches the convention of
 * every other aggregator in this file.
 */
/**
 * Bucket forks by UTC month, returning monthly counts (not cumulative). Used
 * by the dual-axis forks-growth view (bar dataset on the right axis).
 */
export function monthlyForks(forks: ForkEvent[]): TimeSeriesPoint[] {
  const buckets = new Map<string, number>();
  for (const f of forks) {
    if (!isValidIsoString(f?.created_at)) continue;
    const k = isoDate(startOfUtcMonth(new Date(f.created_at)));
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  return mapToSortedSeries(buckets);
}

export function commitPunchcard(commits: CommitEvent[]): PunchcardPoint[] {
  const buckets = new Map<string, number>();
  for (const c of commits) {
    const d = c?.commit?.author?.date;
    if (!isValidIsoString(d)) continue;
    const dt = new Date(d);
    const weekday = dt.getUTCDay(); // 0=Sun..6=Sat
    const hour = dt.getUTCHours();
    const key = `${weekday}-${hour}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const out: PunchcardPoint[] = [];
  for (const [key, count] of buckets.entries()) {
    if (count <= 0) continue;
    const [wdStr, hrStr] = key.split('-');
    const weekday = Number(wdStr);
    const hour = Number(hrStr);
    const r = Math.max(3, Math.min(20, Math.sqrt(count) * 4));
    out.push({ x: hour, y: weekday, r, c: count });
  }
  return out;
}

function mapToSortedSeries(m: Map<string, number>): TimeSeriesPoint[] {
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([t, y]) => ({ t, y }));
}

function humanError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAbortError(err: unknown): boolean {
  return typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError';
}

function availabilityFromResponse(result: StatsResponseFreshness): DatasetAvailability {
  return {
    snapshotAt: result.snapshotAt,
    checkedAt: result.checkedAt,
    upstreamStatus: result.upstreamStatus,
    ...(result.nextRetryAt === undefined ? {} : { nextRetryAt: result.nextRetryAt }),
  };
}
