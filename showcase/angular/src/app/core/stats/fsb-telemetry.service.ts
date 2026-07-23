// Browser lifecycle for the two aggregate FSB endpoints. Each route visit
// begins in loading state; failed refreshes preserve a prior snapshot with
// updated check metadata, and stop() aborts in-flight work from the old visit.

import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

import {
  DatasetAvailability,
  DatasetState,
  FSBTelemetryHeadline,
  FSBTelemetrySeries,
} from './fsb-telemetry.types';
import {
  availabilityAfterFailure,
  httpStatsFetchError,
  retryAfterTimestamp,
  statsFailureMetadata,
} from './stats-fetch-error';

const API_ROOT = '/api/public-stats';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface EtagCacheEntry {
  etag: string;
  body: unknown;
}

interface FetchResult<T> {
  data: T;
  availability: DatasetAvailability;
}

@Injectable({ providedIn: 'root' })
export class FSBTelemetryService {
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

  // Per-dataset state streams. Both start at { kind: 'loading' } and stay
  // there until the first browser-side fetch resolves. On the SSR pass we
  // never advance them.
  readonly headline$ = new BehaviorSubject<DatasetState<FSBTelemetryHeadline>>({ kind: 'loading' });
  readonly series$   = new BehaviorSubject<DatasetState<FSBTelemetrySeries>>({ kind: 'loading' });

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
    this.headline$.next({ kind: 'loading' });
    this.series$.next({ kind: 'loading' });

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
   * Kick off both dataset fetches in parallel. Each updates its own subject.
   * Uses Promise.allSettled so one endpoint failing does NOT cascade.
   */
  async refreshAll(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.started) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    const generation = this.generation;
    const refresh = Promise.allSettled([
      this.fetchDataset(`${API_ROOT}/global`, this.headline$, generation),
      this.fetchDataset(`${API_ROOT}/global/series`, this.series$, generation),
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
    generation: number
  ): Promise<void> {
    try {
      const result = await this.fetchJson<T>(url);
      if (!this.isCurrent(generation)) return;
      subject.next({
        kind: 'ready',
        data: result.data,
        availability: result.availability,
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
   * Fetch a single JSON resource with ETag support.
   *
   * Returns:
   *  - the parsed body on 200 or 304 (cache hit),
   *  - null on the SSR pass (browser guard).
   * Throws on any non-OK status (handled by callers -> { kind: 'error' }).
   *
   * No rate-limit branch -- the server endpoint is server-cached, not
   * rate-limited. If a 500 ever fires, the caller surfaces it as an error
   * state and the next poll retries.
   */
  private async fetchJson<T>(url: string): Promise<FetchResult<T>> {
    if (!isPlatformBrowser(this.platformId)) throw new Error('Stats are browser-only');

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    const cached = this.etagCache.get(url);
    if (cached) {
      headers['If-None-Match'] = cached.etag;
    }

    const controller = new AbortController();
    this.controllers.add(controller);
    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        credentials: 'omit',
        signal: controller.signal,
      });
    } finally {
      this.controllers.delete(controller);
    }

    if (response.status === 304 && cached) {
      // ETag match: reuse cached body, don't read response.
      const data = cached.body as T;
      return {
        data,
        availability: fsbAvailability(data, response.status),
      };
    }

    const retryAfter = response.headers.get('retry-after');
    if (response.status === 503) {
      this.scheduleRetry(retryAfter);
      throw httpStatsFetchError(
        'FSB stats are warming up; retrying shortly.',
        response.status,
        retryAfter
      );
    }
    if (!response.ok) {
      if (retryAfter !== null) this.scheduleRetry(retryAfter);
      throw httpStatsFetchError(
        `FSB stats ${response.status} on ${url}`,
        response.status,
        retryAfter
      );
    }

    const parsed = (await response.json()) as T;
    const etag = response.headers.get('etag');
    if (etag) {
      this.etagCache.set(url, { etag, body: parsed });
    }
    return {
      data: parsed,
      availability: fsbAvailability(parsed, response.status),
    };
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
}

function humanError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAbortError(err: unknown): boolean {
  return typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError';
}

function generatedAt(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('generated_at' in value)) return null;
  const parsed = Date.parse(String((value as { generated_at?: unknown }).generated_at ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function fsbAvailability(value: unknown, status: number): DatasetAvailability {
  const checkedAt = Date.now();
  return {
    snapshotAt: generatedAt(value),
    checkedAt,
    upstreamStatus: String(status),
  };
}
