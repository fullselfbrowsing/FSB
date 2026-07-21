/**
 * Server-side GitHub statistics poller.
 *
 * The browser never receives GitHub's raw REST responses. Each successful
 * poll writes a compact, allowlisted payload. Private cursors make the normal
 * commit path incremental and let unchanged star totals skip identity walks.
 * A failed request records status/backoff metadata without replacing the
 * last-known-good commit payload or cursor.
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
    let body;
    try {
      body = await res.json();
    } catch {
      return { status: 502, body: undefined, etag: null, rlRemaining, rlReset, link, retryAfter };
    }
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

function repoSnapshot(queries, nowMs, minimumFetchedAt = 0) {
  const row = queries.getGithubCachePayload('repo-summary');
  if (
    !row || row.fetchedAt <= 0 || row.fetchedAt < minimumFetchedAt ||
    nowMs - row.fetchedAt > REPO_SUMMARY_FALLBACK_MAX_AGE_MS
  ) return null;
  const payload = parseCachedPayload(row);
  const total = isObject(payload) ? nonNegativeInteger(payload.stargazers_count) : null;
  const branch = isObject(payload) && typeof payload.default_branch === 'string' && payload.default_branch.length > 0
    ? payload.default_branch
    : null;
  return total === null || branch === null
    ? null
    : {
        total,
        branch,
        fetchedAt: row.fetchedAt,
        checkedAt: row.lastAttemptAt,
        lastErrorStatus: row.lastErrorStatus,
        status: row.status,
      };
}

function repoStarSnapshot(queries, nowMs, minimumFetchedAt = 0) {
  const snapshot = repoSnapshot(queries, nowMs, minimumFetchedAt);
  return snapshot ? {
    total: snapshot.total,
    fetchedAt: snapshot.fetchedAt,
    checkedAt: snapshot.checkedAt,
    lastErrorStatus: snapshot.lastErrorStatus,
    status: snapshot.status,
  } : null;
}

function commitPollState(row) {
  const state = row && row.pollState;
  if (
    !isObject(state) || typeof state.branch !== 'string' || state.branch.length === 0 ||
    typeof state.head_sha !== 'string' || state.head_sha.length === 0
  ) return null;
  return { branch: state.branch, head_sha: state.head_sha };
}

function starPollState(row) {
  const state = row && row.pollState;
  return isObject(state) && Number.isFinite(state.last_full_scan_at) && state.last_full_scan_at > 0
    ? { last_full_scan_at: state.last_full_scan_at }
    : null;
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
  nextRetryAt = null,
  pollState = null
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
    nextRetryAt,
    pollState
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
  let payload;
  try {
    payload = starsFromRepositoryCount(previous, snapshot.total, snapshot.fetchedAt);
  } catch {
    payload = starsFromRepositoryCount(null, snapshot.total, snapshot.fetchedAt);
  }
  queries.upsertGithubCacheFailureSnapshotRow(
    endpointId,
    JSON.stringify(payload),
    snapshot.fetchedAt,
    status,
    rlRemaining,
    rlReset,
    PAYLOAD_VERSION,
    nowMs,
    nextRetryAt,
    starPollState(existing)
  );
  return true;
}

function upstreamError(message, response = null, statusOverride = null) {
  const error = new Error(message);
  const responseStatus = response && Number.isInteger(response.status) ? response.status : 0;
  error.httpStatus = Number.isInteger(statusOverride) ? statusOverride : responseStatus;
  error.rlRemaining = response ? response.rlRemaining : null;
  error.rlReset = response ? response.rlReset : null;
  error.retryAfter = response ? response.retryAfter : null;
  return error;
}

function responseOrThrow(response, message) {
  if (response.status !== 200) throw upstreamError(message, response);
  return response;
}

function cumulativeDayCounts(history) {
  const counts = new Map();
  let previousTotal = 0;
  for (const point of history) {
    const count = point.total - previousTotal;
    if (!Number.isInteger(count) || count < 0) {
      throw upstreamError('cached commit history is not cumulative', null, 502);
    }
    counts.set(point.day_utc, count);
    previousTotal = point.total;
  }
  return counts;
}

function cumulativeHistoryFromCounts(counts) {
  let total = 0;
  return [...counts.keys()].sort().map((day_utc) => {
    total += counts.get(day_utc);
    return { day_utc, total };
  });
}

function commitAuthorDay(event) {
  return isObject(event) && isObject(event.commit) && isObject(event.commit.author)
    ? utcDay(event.commit.author.date)
    : null;
}

function mergeCommitHistory(payload, commits, nowMs) {
  const previous = validateCommitsEnvelope(payload);
  if (!previous.history_complete) {
    throw upstreamError('incremental merge requires complete commit history', null, 502);
  }
  const counts = cumulativeDayCounts(previous.history);
  for (const event of commits) {
    const day = commitAuthorDay(event);
    if (!day) throw upstreamError('compare response contains a malformed commit date', null, 502);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const history = cumulativeHistoryFromCounts(counts);
  const total = previous.total + commits.length;
  const finalTotal = history.length > 0 ? history[history.length - 1].total : 0;
  if (finalTotal !== total) throw upstreamError('incremental commit total is inconsistent', null, 502);
  return {
    schema_version: PAYLOAD_VERSION,
    total,
    last_30_days: rollingCommitCountFromHistory(history, nowMs),
    history,
    history_complete: true,
    as_of: isoAt(nowMs),
  };
}

async function walkPinnedCommits(headSha, fetchImpl) {
  const collected = [];
  const seen = new Set();
  let page = 1;
  let lastResponse = null;

  while (true) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(headSha)}&page=${page}&per_page=${PER_PAGE}`;
    const response = responseOrThrow(
      await fetchOnePage(url, ENDPOINTS.commits.accept, null, fetchImpl),
      `commits page=${page} failed`
    );
    if (!Array.isArray(response.body)) {
      throw upstreamError(`commits page=${page} is malformed`, response, 502);
    }
    for (const event of response.body) {
      const key = paginationKey('commits', event);
      if (key === null || !commitAuthorDay(event)) {
        throw upstreamError('commit row is missing its SHA or author date', response, 502);
      }
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(event);
    }
    lastResponse = response;
    if (!hasNextPage(response.link) && response.body.length < PER_PAGE) break;
    page += 1;
  }

  if (!collected.some((event) => event.sha === headSha)) {
    throw upstreamError('pinned commit traversal did not contain its requested head', lastResponse, 502);
  }
  return { commits: collected, response: lastResponse };
}

async function compareCommits(baseSha, headSha, fetchImpl) {
  const collected = [];
  const seen = new Set();
  let aheadBy = null;
  let page = 1;
  let lastResponse = null;

  while (true) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}?page=${page}&per_page=${PER_PAGE}`;
    const response = await fetchOnePage(url, null, null, fetchImpl);
    if (response.status === 404 || response.status === 409 || response.status === 422) {
      return { rebuild: true, response };
    }
    responseOrThrow(response, `compare page=${page} failed`);
    if (!isObject(response.body) || !Array.isArray(response.body.commits)) {
      throw upstreamError(`compare page=${page} is malformed`, response, 502);
    }

    const pageAheadBy = nonNegativeInteger(response.body.ahead_by);
    const pageBehindBy = nonNegativeInteger(response.body.behind_by);
    if (response.body.status !== 'ahead' || pageBehindBy !== 0 || pageAheadBy === 0) {
      return { rebuild: true, response };
    }
    if (pageAheadBy === null || (aheadBy !== null && pageAheadBy !== aheadBy)) {
      throw upstreamError('compare pagination changed ahead_by', response, 502);
    }
    aheadBy = pageAheadBy;

    for (const event of response.body.commits) {
      const key = paginationKey('commits', event);
      if (key === null || !commitAuthorDay(event)) {
        throw upstreamError('compare response contains a malformed commit', response, 502);
      }
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(event);
    }
    if (collected.length > aheadBy) {
      throw upstreamError('compare returned more commits than ahead_by', response, 502);
    }
    lastResponse = response;
    if (collected.length === aheadBy) break;
    if (!hasNextPage(response.link) && response.body.commits.length < PER_PAGE) {
      throw upstreamError('compare returned fewer unique commits than ahead_by', response, 502);
    }
    page += 1;
  }

  if (collected.length !== aheadBy) {
    throw upstreamError('compare unique commit count does not equal ahead_by', lastResponse, 502);
  }
  if (!collected.some((event) => event.sha === headSha)) {
    throw upstreamError('compare result does not contain the probed head', lastResponse, 502);
  }
  return { rebuild: false, commits: collected, response: lastResponse };
}

async function pollRepoSummary(existing, queries, fetchImpl, nowMs) {
  const existingEtag = existing && existing.isComplete ? existing.etag : null;
  const response = await fetchOnePage(
    `https://api.github.com${ENDPOINTS['repo-summary'].path}`,
    ENDPOINTS['repo-summary'].accept,
    existingEtag,
    fetchImpl
  );
  if (response.status === 304) {
    queries.touchGithubCacheRow('repo-summary', nowMs, 304, response.rlRemaining, response.rlReset);
    return;
  }
  responseOrThrow(response, 'repo-summary request failed');
  const payload = sanitizePublicPayload('repo-summary', response.body, { nowMs });
  writeSuccessfulPayload(
    'repo-summary', payload, response.etag, nowMs, 200,
    response.rlRemaining, response.rlReset, queries
  );
}

function usableStarEnvelope(existing) {
  if (!existing || !existing.isComplete || existing.payloadVersion !== PAYLOAD_VERSION) return null;
  try { return validateStarsEnvelope(parseCachedPayload(existing)); } catch { return null; }
}

async function pollStars(existing, queries, fetchImpl, nowMs) {
  const summary = repoStarSnapshot(queries, nowMs);
  if (
    !summary || summary.fetchedAt !== nowMs || summary.checkedAt !== nowMs ||
    summary.lastErrorStatus !== null || (summary.status !== 200 && summary.status !== 304)
  ) {
    throw upstreamError('stars require a same-tick repository total', null, 503);
  }

  const envelope = usableStarEnvelope(existing);
  const state = starPollState(existing);
  const reconciledRecently = state && nowMs >= state.last_full_scan_at &&
    nowMs - state.last_full_scan_at < DAY_MS;
  const canUseCountFastPath = envelope && envelope.history_complete &&
    envelope.source === 'stargazers' && envelope.total === summary.total && reconciledRecently;

  if (!GITHUB_TOKEN) {
    let payload;
    try {
      payload = starsFromRepositoryCount(parseCachedPayload(existing), summary.total, nowMs);
    } catch {
      payload = starsFromRepositoryCount(null, summary.total, nowMs);
    }
    writeSuccessfulPayload(
      'stars', payload, null, nowMs, 200,
      existing ? existing.rateLimitRemaining : null,
      existing ? existing.rateLimitReset : null,
      queries, nowMs, null, starPollState(existing)
    );
    return;
  }

  if (existing && existing.nextRetryAt && nowMs < existing.nextRetryAt) {
    let payload;
    try {
      payload = starsFromRepositoryCount(parseCachedPayload(existing), summary.total, nowMs);
    } catch {
      payload = starsFromRepositoryCount(null, summary.total, nowMs);
    }
    queries.refreshGithubCacheSnapshotDuringBackoffRow(
      'stars', JSON.stringify(payload), nowMs, PAYLOAD_VERSION, starPollState(existing)
    );
    return;
  }

  if (canUseCountFastPath) {
    const refreshed = { ...envelope, as_of: isoAt(nowMs) };
    writeSuccessfulPayload(
      'stars', refreshed, existing.etag, nowMs, 200,
      existing.rateLimitRemaining, existing.rateLimitReset, queries,
      nowMs, null, state
    );
    return;
  }

  const collected = [];
  const seen = new Set();
  let page = 1;
  let firstEtag = null;
  let lastResponse = null;
  while (true) {
    const url = `https://api.github.com${ENDPOINTS.stars.path}?page=${page}&per_page=${PER_PAGE}`;
    const response = responseOrThrow(
      await fetchOnePage(url, ENDPOINTS.stars.accept, null, fetchImpl),
      `stars page=${page} failed`
    );
    if (!Array.isArray(response.body)) {
      throw upstreamError(`stars page=${page} is malformed`, response, 502);
    }
    if (page === 1) firstEtag = response.etag;
    for (const event of response.body) {
      const key = paginationKey('stars', event);
      if (key !== null && seen.has(key)) continue;
      if (key !== null) seen.add(key);
      collected.push(event);
    }
    lastResponse = response;
    if (!hasNextPage(response.link) && response.body.length < PER_PAGE) break;
    page += 1;
  }

  const payload = aggregateCompleteStars(collected, summary.total, nowMs);
  if (!payload) {
    throw upstreamError('stargazer traversal did not match the repository total', lastResponse, 409);
  }
  writeSuccessfulPayload(
    'stars', payload, firstEtag, nowMs, 200,
    lastResponse.rlRemaining, lastResponse.rlReset, queries,
    nowMs, null, { last_full_scan_at: nowMs }
  );
}

function usableCommitEnvelope(existing) {
  if (!existing || !existing.isComplete || existing.payloadVersion !== PAYLOAD_VERSION) return null;
  try {
    const envelope = validateCommitsEnvelope(parseCachedPayload(existing));
    if (!envelope.history_complete) return null;
    cumulativeDayCounts(envelope.history);
    return envelope;
  } catch {
    return null;
  }
}

async function pollCommits(existing, queries, fetchImpl, nowMs) {
  const summary = repoSnapshot(queries, nowMs);
  // Repo metadata is a dependency, not a commit-upstream failure. Only advance
  // the commit snapshot against a default branch verified in this same tick;
  // otherwise leave the row and its retry state untouched so recovery can poll
  // immediately after the summary succeeds.
  if (
    !summary || summary.fetchedAt !== nowMs || summary.checkedAt !== nowMs ||
    summary.lastErrorStatus !== null || (summary.status !== 200 && summary.status !== 304)
  ) return;

  const state = commitPollState(existing);
  const cached = usableCommitEnvelope(existing);
  const canIncrement = Boolean(state && cached && state.branch === summary.branch);
  const headResponse = await fetchOnePage(
    `https://api.github.com/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(summary.branch)}&page=1&per_page=1`,
    null,
    canIncrement ? existing.etag : null,
    fetchImpl
  );

  if (headResponse.status === 304) {
    if (!canIncrement) throw upstreamError('unexpected conditional head response', headResponse, 502);
    const refreshed = refreshCommitWindow(cached, nowMs);
    writeSuccessfulPayload(
      'commits', refreshed, existing.etag, nowMs, 304,
      headResponse.rlRemaining, headResponse.rlReset, queries,
      nowMs, null, state
    );
    return;
  }
  responseOrThrow(headResponse, 'default-branch head probe failed');
  const headCommit = Array.isArray(headResponse.body) ? headResponse.body[0] : null;
  const headSha = isObject(headCommit) && typeof headCommit.sha === 'string' && headCommit.sha.length > 0
    ? headCommit.sha
    : null;
  if (!headSha) throw upstreamError('default-branch head response is malformed', headResponse, 502);
  const headEtag = headResponse.etag || (canIncrement && headSha === state.head_sha ? existing.etag : null);
  const nextState = { branch: summary.branch, head_sha: headSha };

  if (canIncrement && headSha === state.head_sha) {
    const refreshed = refreshCommitWindow(cached, nowMs);
    writeSuccessfulPayload(
      'commits', refreshed, headEtag, nowMs, 200,
      headResponse.rlRemaining, headResponse.rlReset, queries,
      nowMs, null, nextState
    );
    return;
  }

  if (canIncrement) {
    const compared = await compareCommits(state.head_sha, headSha, fetchImpl);
    if (!compared.rebuild) {
      const payload = mergeCommitHistory(cached, compared.commits, nowMs);
      writeSuccessfulPayload(
        'commits', payload, headEtag, nowMs, 200,
        compared.response.rlRemaining, compared.response.rlReset, queries,
        nowMs, null, nextState
      );
      return;
    }
  }

  const walked = await walkPinnedCommits(headSha, fetchImpl);
  const payload = aggregateCommits(walked.commits, nowMs, true);
  writeSuccessfulPayload(
    'commits', payload, headEtag, nowMs, 200,
    walked.response.rlRemaining, walked.response.rlReset, queries,
    nowMs, null, nextState
  );
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
    if (existing && existing.nextRetryAt && nowMs < existing.nextRetryAt && endpointId !== 'stars') return;
    if (endpointId === 'repo-summary') await pollRepoSummary(existing, queries, fetchImpl, nowMs);
    else if (endpointId === 'stars') await pollStars(existing, queries, fetchImpl, nowMs);
    else if (endpointId === 'commits') await pollCommits(existing, queries, fetchImpl, nowMs);
  } catch (err) {
    const failureAt = attemptedAt();
    const status = err && Number.isInteger(err.httpStatus) ? err.httpStatus : 0;
    const rlRemaining = !err || err.rlRemaining == null ? null : err.rlRemaining;
    const rlReset = !err || err.rlReset == null ? null : err.rlReset;
    const fallbackRetryAt = failureRetryAt(
      endpointId, queries, failureAt, rlRemaining, rlReset, (err && err.retryAfter) || null
    );
    const nextRetryAt = endpointId === 'stars' && (status === 401 || status === 403)
      ? Math.max(failureAt + RESTRICTED_STARS_RETRY_MS, fallbackRetryAt)
      : fallbackRetryAt;
    if (tryStarsFallback(endpointId, queries, failureAt, status, rlRemaining, rlReset, nextRetryAt)) {
      console.warn(`[github-poller] ${endpointId} request failed; using repository-count fallback`);
      return;
    }
    queries.recordGithubCacheFailureRow(
      endpointId, failureAt, status, rlRemaining, rlReset, nextRetryAt
    );
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
