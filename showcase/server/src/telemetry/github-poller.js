/**
 * Server-side GitHub statistics poller.
 *
 * The browser never receives GitHub's raw REST responses. Each successful
 * poll writes a compact, allowlisted payload after the complete page walk has
 * finished. A failed request records status/backoff metadata without replacing
 * the last-known-good payload.
 */
'use strict';

const Queries = require('../db/queries');

const GITHUB_POLL_INTERVAL_MS = 5 * 60 * 1000;
const GITHUB_REQUEST_TIMEOUT_MS = 15 * 1000;
const FAILURE_BACKOFF_BASE_MS = 5 * 60 * 1000;
const FAILURE_BACKOFF_MAX_MS = 60 * 60 * 1000;
const RESTRICTED_STARS_RETRY_MS = 6 * 60 * 60 * 1000;
const REPO_SUMMARY_FALLBACK_MAX_AGE_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OWNER = 'fullselfbrowsing';
const REPO = 'FSB';
const PER_PAGE = 100;
const PAYLOAD_VERSION = 1;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;

// Only datasets consumed by the current stats page are polled. Keeping the
// allowlist small avoids spending rate limit and storage on legacy views.
const GITHUB_ENDPOINT_IDS = ['repo-summary', 'stars', 'commits'];

const ENDPOINTS = {
  'repo-summary': {
    path: `/repos/${OWNER}/${REPO}`,
    query: '',
    accept: null,
    paginated: false,
  },
  'stars': {
    path: `/repos/${OWNER}/${REPO}/stargazers`,
    query: '',
    accept: 'application/vnd.github.v3.star+json',
    paginated: true,
    oldestFirst: true,
  },
  'commits': {
    path: `/repos/${OWNER}/${REPO}/commits`,
    query: '',
    accept: null,
    paginated: true,
  },
};

let pollerBusy = false;
let tokenWarningLogged = false;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function validIso(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function utcDay(value) {
  const iso = validIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function isoAt(nowMs) {
  return new Date(nowMs).toISOString();
}

function sanitizeRepoSummary(payload) {
  if (!isObject(payload)) throw new Error('repo-summary payload must be an object');

  const id = nonNegativeInteger(payload.id);
  const stars = nonNegativeInteger(payload.stargazers_count);
  const forks = nonNegativeInteger(payload.forks_count);
  const openIssues = nonNegativeInteger(payload.open_issues_count);
  const subscribers = nonNegativeInteger(payload.subscribers_count);
  const pushedAt = validIso(payload.pushed_at);

  if (
    id === null || stars === null || forks === null || openIssues === null ||
    subscribers === null || typeof payload.name !== 'string' ||
    typeof payload.default_branch !== 'string' || !pushedAt
  ) {
    throw new Error('repo-summary payload is missing a required public field');
  }

  return {
    id,
    name: payload.name,
    stargazers_count: stars,
    forks_count: forks,
    open_issues_count: openIssues,
    subscribers_count: subscribers,
    default_branch: payload.default_branch,
    pushed_at: pushedAt,
  };
}

function aggregateDailyCumulative(days) {
  const counts = new Map();
  for (const day of days) counts.set(day, (counts.get(day) || 0) + 1);

  let total = 0;
  return [...counts.keys()].sort().map((day_utc) => {
    total += counts.get(day_utc);
    return { day_utc, total };
  });
}

function starDaysFromRaw(events) {
  if (!Array.isArray(events)) throw new Error('stars payload must be an array or v1 envelope');
  const days = [];
  for (const event of events) {
    const day = isObject(event) ? utcDay(event.starred_at) : null;
    if (day) days.push(day);
  }
  return { days, allValid: days.length === events.length };
}

function validateStarHistory(history) {
  if (!Array.isArray(history)) throw new Error('stars history must be an array');
  const normalized = [];
  let previousDay = null;
  for (const point of history) {
    const day = isObject(point) && /^\d{4}-\d{2}-\d{2}$/.test(point.day_utc)
      ? point.day_utc
      : null;
    const total = isObject(point) ? nonNegativeInteger(point.total) : null;
    if (!day || !validIso(`${day}T00:00:00.000Z`) || total === null) {
      throw new Error('history contains an invalid point');
    }
    if (previousDay !== null && day <= previousDay) {
      throw new Error('history points must be strictly ordered and unique');
    }
    normalized.push({ day_utc: day, total });
    previousDay = day;
  }
  return normalized;
}

function validateStarsEnvelope(payload) {
  if (!isObject(payload) || payload.schema_version !== PAYLOAD_VERSION) {
    throw new Error('stars payload is not a v1 envelope');
  }
  const total = nonNegativeInteger(payload.total);
  const asOf = validIso(payload.as_of);
  if (
    total === null || !asOf || typeof payload.history_complete !== 'boolean' ||
    (payload.source !== 'stargazers' && payload.source !== 'repository-count')
  ) {
    throw new Error('stars envelope metadata is invalid');
  }
  const history = validateStarHistory(payload.history);
  const finalTotal = history.length > 0 ? history[history.length - 1].total : 0;
  if (finalTotal !== total) throw new Error('stars history total is inconsistent');
  return {
    schema_version: PAYLOAD_VERSION,
    total,
    history,
    // Count-only repository snapshots cannot detect offsetting star/unstar
    // churn. Only a complete stargazer traversal may claim complete history.
    history_complete: payload.source === 'stargazers' ? payload.history_complete : false,
    source: payload.source,
    as_of: asOf,
  };
}

function aggregateCompleteStars(events, total, nowMs) {
  const { days, allValid } = starDaysFromRaw(events);
  const authoritativeTotal = nonNegativeInteger(total);
  if (!allValid || authoritativeTotal === null || days.length !== authoritativeTotal) return null;
  return {
    schema_version: PAYLOAD_VERSION,
    total: authoritativeTotal,
    history: aggregateDailyCumulative(days),
    history_complete: true,
    source: 'stargazers',
    as_of: isoAt(nowMs),
  };
}

function previousStarHistory(payload, currentTotal) {
  if (Array.isArray(payload)) {
    const { days, allValid } = starDaysFromRaw(payload);
    return {
      history: aggregateDailyCumulative(days),
      historyComplete: allValid && days.length === currentTotal,
      total: days.length,
      asOfMs: null,
    };
  }
  if (isObject(payload) && payload.schema_version === PAYLOAD_VERSION) {
    const envelope = validateStarsEnvelope(payload);
    return {
      history: envelope.history,
      historyComplete: envelope.history_complete,
      total: envelope.total,
      asOfMs: Date.parse(envelope.as_of),
    };
  }
  return { history: [], historyComplete: false, total: null, asOfMs: null };
}

function starsFromRepositoryCount(previousPayload, total, nowMs) {
  const authoritativeTotal = nonNegativeInteger(total);
  if (authoritativeTotal === null) throw new Error('repository star count is unavailable');

  const previous = previousStarHistory(previousPayload, authoritativeTotal);
  const today = isoAt(nowMs).slice(0, 10);
  const history = previous.history.filter((point) => point.day_utc <= today);
  const todayIndex = history.findIndex((point) => point.day_utc === today);
  const snapshot = { day_utc: today, total: authoritativeTotal };
  if (todayIndex >= 0) history[todayIndex] = snapshot;
  else history.push(snapshot);
  history.sort((a, b) => a.day_utc.localeCompare(b.day_utc));

  return {
    schema_version: PAYLOAD_VERSION,
    total: authoritativeTotal,
    history,
    history_complete: false,
    source: 'repository-count',
    as_of: isoAt(nowMs),
  };
}

function normalizeStarsPayload(payload, repoTotal, nowMs) {
  const authoritativeTotal = nonNegativeInteger(repoTotal);

  if (Array.isArray(payload)) {
    const { days, allValid } = starDaysFromRaw(payload);
    const total = authoritativeTotal === null ? days.length : authoritativeTotal;
    if (allValid && days.length === total) return aggregateCompleteStars(payload, total, nowMs);
    return starsFromRepositoryCount(payload, total, nowMs);
  }

  const envelope = validateStarsEnvelope(payload);
  if (authoritativeTotal !== null && authoritativeTotal !== envelope.total) {
    return starsFromRepositoryCount(envelope, authoritativeTotal, nowMs);
  }
  return envelope;
}

function aggregateCommits(events, nowMs, historyComplete = true) {
  if (!Array.isArray(events)) throw new Error('commits payload must be an array');
  const days = [];

  for (const event of events) {
    const date = isObject(event) && isObject(event.commit) && isObject(event.commit.author)
      ? validIso(event.commit.author.date)
      : null;
    if (!date) {
      if (historyComplete) throw new Error('commits payload contains a malformed commit date');
      continue;
    }
    days.push(date.slice(0, 10));
  }

  const history = aggregateDailyCumulative(days);

  return {
    schema_version: PAYLOAD_VERSION,
    total: days.length,
    last_30_days: rollingCommitCountFromHistory(history, nowMs),
    history,
    history_complete: Boolean(historyComplete),
    as_of: isoAt(nowMs),
  };
}

function rollingCommitCountFromHistory(history, nowMs) {
  const cutoffDay = isoAt(nowMs - (29 * DAY_MS)).slice(0, 10);
  let totalBeforeWindow = 0;
  let grandTotal = 0;
  for (const point of history) {
    grandTotal = point.total;
    if (point.day_utc < cutoffDay) totalBeforeWindow = point.total;
  }
  return Math.max(0, grandTotal - totalBeforeWindow);
}

function refreshCommitWindow(payload, nowMs) {
  const envelope = validateCommitsEnvelope(payload);
  return {
    ...envelope,
    last_30_days: rollingCommitCountFromHistory(envelope.history, nowMs),
    as_of: isoAt(nowMs),
  };
}

function validateCommitsEnvelope(payload) {
  if (!isObject(payload) || payload.schema_version !== PAYLOAD_VERSION) {
    throw new Error('commits payload is not a v1 envelope');
  }
  const total = nonNegativeInteger(payload.total);
  const last30Days = nonNegativeInteger(payload.last_30_days);
  const asOf = validIso(payload.as_of);
  if (total === null || last30Days === null || last30Days > total || !asOf || typeof payload.history_complete !== 'boolean') {
    throw new Error('commits envelope metadata is invalid');
  }
  const history = validateStarHistory(payload.history);
  const finalTotal = history.length > 0 ? history[history.length - 1].total : 0;
  if (finalTotal !== total) throw new Error('commits history total is inconsistent');
  return {
    schema_version: PAYLOAD_VERSION,
    total,
    last_30_days: last30Days,
    history,
    history_complete: payload.history_complete,
    as_of: asOf,
  };
}

function sanitizePublicPayload(endpointId, payload, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  switch (endpointId) {
    case 'repo-summary':
      return sanitizeRepoSummary(payload);
    case 'stars': {
      const normalized = normalizeStarsPayload(payload, options.repoTotal, nowMs);
      if (options.historyComplete === false) {
        const repositoryTotal = nonNegativeInteger(options.repoTotal);
        return starsFromRepositoryCount(
          normalized,
          repositoryTotal === null ? normalized.total : repositoryTotal,
          nowMs
        );
      }
      return normalized;
    }
    case 'commits':
      return Array.isArray(payload)
        ? aggregateCommits(payload, nowMs, Boolean(options.historyComplete))
        : validateCommitsEnvelope(payload);
    default:
      throw new Error(`unsupported GitHub endpoint: ${endpointId}`);
  }
}

function buildHeaders(accept) {
  const headers = {
    Accept: accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'fsb-showcase-server',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function fetchOnePage(url, accept, ifNoneMatch, fetchImpl) {
  const headers = buildHeaders(accept);
  if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    const rlRemaining = res.headers.get('x-ratelimit-remaining');
    const rlReset = res.headers.get('x-ratelimit-reset');
    const etag = res.headers.get('etag');
    const link = res.headers.get('link');
    const retryAfter = res.headers.get('retry-after');
    if (res.status === 304) {
      return { status: 304, body: undefined, etag: ifNoneMatch, rlRemaining, rlReset, link, retryAfter };
    }
    if (!res.ok) {
      try { await res.text(); } catch { /* socket cleanup only */ }
      return { status: res.status, body: undefined, etag: null, rlRemaining, rlReset, link, retryAfter };
    }
    const body = await res.json();
    return { status: 200, body, etag, rlRemaining, rlReset, link, retryAfter };
  } finally {
    clearTimeout(timeout);
  }
}

function failureBackoffMs(consecutiveFailures) {
  const exponent = Math.max(0, Math.min(20, consecutiveFailures - 1));
  return Math.min(FAILURE_BACKOFF_MAX_MS, FAILURE_BACKOFF_BASE_MS * (2 ** exponent));
}

function retryAfterMs(value, nowMs) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return nowMs + (seconds * 1000);
  const absolute = Date.parse(value);
  return Number.isFinite(absolute) && absolute > nowMs ? absolute : null;
}

function failureRetryAt(endpointId, queries, nowMs, rlRemaining, rlReset, retryAfter = null) {
  const current = queries.getGithubCachePayload(endpointId);
  const failures = (current ? current.consecutiveFailures : 0) + 1;
  let nextRetryAt = nowMs + failureBackoffMs(failures);
  const resetMs = Number(rlReset) * 1000;
  if (Number(rlRemaining) === 0 && Number.isFinite(resetMs) && resetMs > nextRetryAt) {
    nextRetryAt = resetMs;
  }
  const instructedRetryAt = retryAfterMs(retryAfter, nowMs);
  if (instructedRetryAt !== null && instructedRetryAt > nextRetryAt) nextRetryAt = instructedRetryAt;
  return nextRetryAt;
}

function recordFailure(endpointId, queries, nowMs, status, rlRemaining, rlReset, retryAfter = null) {
  const nextRetryAt = failureRetryAt(endpointId, queries, nowMs, rlRemaining, rlReset, retryAfter);
  queries.recordGithubCacheFailureRow(endpointId, nowMs, status, rlRemaining, rlReset, nextRetryAt);
}

function paginationKey(endpointId, event) {
  if (!isObject(event)) return null;
  if (endpointId === 'commits' && typeof event.sha === 'string') return `sha:${event.sha}`;
  if (endpointId === 'stars' && isObject(event.user)) {
    const id = nonNegativeInteger(event.user.id);
    if (id !== null) return `user-id:${id}`;
    if (typeof event.user.login === 'string') return `login:${event.user.login}`;
  }
  return null;
}

function hasNextPage(linkHeader) {
  return typeof linkHeader === 'string' && linkHeader
    .split(',')
    .some((segment) => /<[^>]+>[^,]*;\s*rel="?next"?(?:\s*;|\s*$)/i.test(segment));
}

function parseCachedPayload(row) {
  if (!row) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}

function repoStarSnapshot(queries, nowMs, minimumFetchedAt = 0) {
  const row = queries.getGithubCachePayload('repo-summary');
  if (
    !row || row.fetchedAt <= 0 || row.fetchedAt < minimumFetchedAt ||
    nowMs - row.fetchedAt > REPO_SUMMARY_FALLBACK_MAX_AGE_MS
  ) return null;
  const payload = parseCachedPayload(row);
  const total = isObject(payload) ? nonNegativeInteger(payload.stargazers_count) : null;
  return total === null ? null : { total, fetchedAt: row.fetchedAt };
}

function writeSuccessfulPayload(
  endpointId,
  payload,
  etag,
  fetchedAt,
  status,
  rlRemaining,
  rlReset,
  queries,
  lastAttemptAt = fetchedAt,
  nextRetryAt = null
) {
  queries.upsertGithubCacheRow(
    endpointId,
    JSON.stringify(payload),
    etag,
    fetchedAt,
    status,
    rlRemaining,
    rlReset,
    true,
    PAYLOAD_VERSION,
    lastAttemptAt,
    nextRetryAt
  );
}

function tryStarsFallback(endpointId, queries, nowMs, status, rlRemaining, rlReset, nextRetryAt = null) {
  if (endpointId !== 'stars') return false;
  const existing = queries.getGithubCachePayload('stars');
  const minimumFetchedAt = existing && Number.isFinite(existing.fetchedAt) && existing.fetchedAt > 0
    ? existing.fetchedAt
    : 0;
  const snapshot = repoStarSnapshot(queries, nowMs, minimumFetchedAt);
  if (!snapshot) return false;
  const previous = parseCachedPayload(existing);
  const payload = starsFromRepositoryCount(previous, snapshot.total, snapshot.fetchedAt);
  writeSuccessfulPayload(
    endpointId,
    payload,
    null,
    snapshot.fetchedAt,
    status,
    rlRemaining,
    rlReset,
    queries,
    nowMs,
    nextRetryAt
  );
  return true;
}

async function pollEndpoint(endpointId, queries, fetchImpl, nowMs) {
  const cfg = ENDPOINTS[endpointId];
  if (!cfg) return;

  const existing = queries.getGithubCachePayload(endpointId);
  const attemptStartedAt = Date.now();
  // Keep injected test clocks deterministic at sub-second speed while making
  // long production traversals base their backoff on the actual failure time.
  const attemptedAt = () => nowMs + Math.floor(
    Math.max(0, Date.now() - attemptStartedAt) / 1000
  ) * 1000;

  try {
    // Without a token, the stargazer-list endpoint is restricted and would
    // produce a permanent auth failure. The repository resource already gives
    // us the authoritative total, so use it without making the doomed request.
    if (endpointId === 'stars' && !GITHUB_TOKEN) {
      if (!tryStarsFallback(endpointId, queries, nowMs, 200, null, null)) {
        recordFailure(endpointId, queries, attemptedAt(), 503, null, null);
      }
      return;
    }

    if (existing && existing.nextRetryAt && nowMs < existing.nextRetryAt) return;

    if (!cfg.paginated) {
      const existingEtag = existing && existing.isComplete ? existing.etag : null;
      const url = `https://api.github.com${cfg.path}${cfg.query ? `?${cfg.query}` : ''}`;
      const response = await fetchOnePage(url, cfg.accept, existingEtag, fetchImpl);
      if (response.status === 304) {
        queries.touchGithubCacheRow(endpointId, nowMs, 304, response.rlRemaining, response.rlReset);
        return;
      }
      if (response.status !== 200) {
        recordFailure(
          endpointId,
          queries,
          attemptedAt(),
          response.status,
          response.rlRemaining,
          response.rlReset,
          response.retryAfter
        );
        console.warn(`[github-poller] ${endpointId} HTTP ${response.status}; preserving last-known-good cache`);
        return;
      }
      const payload = sanitizePublicPayload(endpointId, response.body, { nowMs });
      writeSuccessfulPayload(endpointId, payload, response.etag, nowMs, 200, response.rlRemaining, response.rlReset, queries);
      return;
    }

    // Incomplete/legacy rows never use their page-1 ETag: they must self-heal
    // via a complete walk. Oldest-first endpoints always walk because page 1
    // becomes immutable once full.
    const existingEtag = existing && existing.isComplete && !cfg.oldestFirst ? existing.etag : null;
    const base = `https://api.github.com${cfg.path}`;
    const collected = [];
    const seenKeys = new Set();
    let page = 1;
    let etagToStore = null;
    let firstPageFingerprint = null;
    let lastRlRemaining = null;
    let lastRlReset = null;

    while (true) {
      const separator = cfg.query ? '&' : '';
      const url = `${base}?${cfg.query}${separator}page=${page}&per_page=${PER_PAGE}`;
      const response = await fetchOnePage(url, cfg.accept, page === 1 ? existingEtag : null, fetchImpl);

      if (page === 1 && response.status === 304) {
        if (endpointId === 'commits') {
          const cached = parseCachedPayload(existing);
          const refreshed = refreshCommitWindow(cached, nowMs);
          writeSuccessfulPayload(
            endpointId,
            refreshed,
            existing.etag,
            nowMs,
            304,
            response.rlRemaining,
            response.rlReset,
            queries
          );
        } else {
          queries.touchGithubCacheRow(endpointId, nowMs, 304, response.rlRemaining, response.rlReset);
        }
        return;
      }
      if (response.status !== 200 || !Array.isArray(response.body)) {
        const failureAt = attemptedAt();
        const fallbackRetryAt = failureRetryAt(
          endpointId,
          queries,
          failureAt,
          response.rlRemaining,
          response.rlReset,
          response.retryAfter
        );
        const restrictionRetryAt = endpointId === 'stars' && (response.status === 401 || response.status === 403)
          ? Math.max(failureAt + RESTRICTED_STARS_RETRY_MS, fallbackRetryAt)
          : fallbackRetryAt;
        if (tryStarsFallback(
          endpointId,
          queries,
          failureAt,
          response.status || 502,
          response.rlRemaining,
          response.rlReset,
          restrictionRetryAt
        )) return;
        recordFailure(
          endpointId,
          queries,
          failureAt,
          response.status || 502,
          response.rlRemaining,
          response.rlReset,
          response.retryAfter
        );
        console.warn(`[github-poller] ${endpointId} page=${page} failed; preserving last-known-good cache`);
        return;
      }

      if (page === 1) {
        etagToStore = response.etag;
        firstPageFingerprint = JSON.stringify(response.body);
      }
      lastRlRemaining = response.rlRemaining;
      lastRlReset = response.rlReset;
      for (const event of response.body) {
        const key = paginationKey(endpointId, event);
        if (key !== null && seenKeys.has(key)) continue;
        if (key !== null) seenKeys.add(key);
        collected.push(event);
      }
      if (!hasNextPage(response.link) && response.body.length < PER_PAGE) break;
      page += 1;
    }

    // New commits reorder the leading pages. Verify page 1 did not change
    // while a multi-page traversal was in flight before
    // publishing the combined result as complete. A changed sentinel leaves
    // the last-known-good row untouched and retries from page 1 next cycle.
    if (page > 1 && !cfg.oldestFirst) {
      const separator = cfg.query ? '&' : '';
      const firstPageUrl = `${base}?${cfg.query}${separator}page=1&per_page=${PER_PAGE}`;
      const sentinel = await fetchOnePage(firstPageUrl, cfg.accept, etagToStore || null, fetchImpl);
      const stableByValidator = Boolean(etagToStore) && sentinel.status === 304;
      const stableByBody = sentinel.status === 200 && Array.isArray(sentinel.body) &&
        JSON.stringify(sentinel.body) === firstPageFingerprint;
      if (!stableByValidator && !stableByBody) {
        recordFailure(
          endpointId,
          queries,
          attemptedAt(),
          sentinel.status === 200 ? 409 : (sentinel.status || 502),
          sentinel.rlRemaining,
          sentinel.rlReset,
          sentinel.retryAfter
        );
        console.warn(`[github-poller] ${endpointId} changed during pagination; preserving last-known-good cache`);
        return;
      }
      if (stableByBody && sentinel.etag) etagToStore = sentinel.etag;
    }

    let payload;
    if (endpointId === 'stars') {
      // A successful terminal page proves the complete current list. Do not
      // let an older repository-summary snapshot override that newer walk.
      const sameTickSummary = repoStarSnapshot(queries, nowMs);
      const expectedTotal = sameTickSummary && sameTickSummary.fetchedAt === nowMs
        ? sameTickSummary.total
        : collected.length;
      payload = aggregateCompleteStars(collected, expectedTotal, nowMs);
      if (!payload && sameTickSummary && sameTickSummary.fetchedAt === nowMs) {
        if (tryStarsFallback(endpointId, queries, nowMs, 409, lastRlRemaining, lastRlReset)) return;
      }
      if (!payload) throw new Error('complete stargazer walk contained malformed rows');
    } else {
      payload = sanitizePublicPayload(endpointId, collected, { nowMs, historyComplete: true });
    }

    writeSuccessfulPayload(endpointId, payload, etagToStore, nowMs, 200, lastRlRemaining, lastRlReset, queries);
  } catch (err) {
    const failureAt = attemptedAt();
    const fallbackRetryAt = failureRetryAt(endpointId, queries, failureAt, null, null);
    if (tryStarsFallback(endpointId, queries, failureAt, 0, null, null, fallbackRetryAt)) {
      console.warn(`[github-poller] ${endpointId} request failed; using repository-count fallback`);
      return;
    }
    recordFailure(endpointId, queries, failureAt, 0, null, null);
    console.error(`[github-poller] ${endpointId} tick failed:`, err && err.message ? err.message : err);
  }
}

async function runGithubPollerTick(db, queries, fetchImpl, nowMs = Date.now()) {
  if (pollerBusy) {
    console.warn('[github-poller] previous tick still running; skipping this cycle');
    return;
  }
  pollerBusy = true;
  try {
    if (!queries) queries = new Queries(db);
    if (!fetchImpl) fetchImpl = globalThis.fetch;
    for (const endpointId of GITHUB_ENDPOINT_IDS) {
      await pollEndpoint(endpointId, queries, fetchImpl, nowMs);
    }
  } catch (err) {
    console.error('[github-poller] tick fatal:', err && err.message ? err.message : err);
  } finally {
    pollerBusy = false;
  }
}

function startGithubPoller(db) {
  if (!GITHUB_TOKEN && !tokenWarningLogged) {
    console.warn('[github-poller] GITHUB_TOKEN not set; running unauthenticated with GitHub rate limits');
    tokenWarningLogged = true;
  }
  const queries = new Queries(db);
  setImmediate(() => runGithubPollerTick(db, queries));
  return setInterval(() => runGithubPollerTick(db, queries), GITHUB_POLL_INTERVAL_MS);
}

module.exports = {
  startGithubPoller,
  runGithubPollerTick,
  pollEndpoint,
  sanitizePublicPayload,
  aggregateCommits,
  refreshCommitWindow,
  rollingCommitCountFromHistory,
  retryAfterMs,
  hasNextPage,
  normalizeStarsPayload,
  starsFromRepositoryCount,
  GITHUB_POLL_INTERVAL_MS,
  GITHUB_REQUEST_TIMEOUT_MS,
  RESTRICTED_STARS_RETRY_MS,
  GITHUB_ENDPOINT_IDS,
  PAYLOAD_VERSION,
  ENDPOINTS,
};
