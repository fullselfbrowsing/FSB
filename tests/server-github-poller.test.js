/**
 * GitHub poller/cache regression tests.
 *
 * Run: node tests/server-github-poller.test.js
 */
'use strict';

const path = require('path');

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const POLLER_PATH = path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'github-poller');

const NOW = Date.parse('2026-07-20T12:00:00.000Z');
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL: ${label} -- ${detail}`);
  }
}

function freshPoller() {
  delete require.cache[require.resolve(POLLER_PATH)];
  return require(POLLER_PATH);
}

function response(canned) {
  return {
    status: canned.status,
    ok: canned.status >= 200 && canned.status < 300,
    headers: {
      get(name) {
        const values = {
          etag: canned.etag,
          'x-ratelimit-remaining': canned.rlRemaining,
          'x-ratelimit-reset': canned.rlReset,
          link: canned.link,
          'retry-after': canned.retryAfter,
        };
        return values[name.toLowerCase()] ?? null;
      },
    },
    json: async () => canned.body,
    text: async () => JSON.stringify(canned.body ?? ''),
  };
}

function makeFakeFetch(cannedByPrefix) {
  const calls = [];
  const prefixes = Object.keys(cannedByPrefix).sort((a, b) => b.length - a.length);
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    const prefix = prefixes.find((candidate) => url.startsWith(candidate));
    if (!prefix) throw new Error(`no canned response for ${url}`);
    const value = typeof cannedByPrefix[prefix] === 'function'
      ? cannedByPrefix[prefix](url, options)
      : cannedByPrefix[prefix];
    if (value && value.__reject) throw new Error(value.__reject);
    return response(value);
  };
  return { fakeFetch, calls };
}

function repoSummary(stars = 2) {
  return {
    id: 123,
    name: 'FSB',
    full_name: 'fullselfbrowsing/FSB',
    stargazers_count: stars,
    forks_count: 4,
    open_issues_count: 8,
    subscribers_count: 3,
    default_branch: 'main',
    pushed_at: '2026-07-20T10:00:00Z',
    owner: { login: 'private-shape-must-not-escape' },
  };
}

function commit(sha, date) {
  return {
    sha,
    author: { login: 'identity-must-not-escape' },
    commit: {
      author: { name: 'Private Name', email: 'private@example.test', date },
      message: 'large commit message must not escape',
    },
  };
}

function happyCanned() {
  return {
    'https://api.github.com/repos/fullselfbrowsing/FSB/stargazers': {
      status: 200,
      body: [
        { starred_at: '2026-07-18T10:00:00Z', user: { login: 'alice' } },
        { starred_at: '2026-07-19T10:00:00Z', user: { login: 'bob' } },
      ],
      etag: '"stars-1"',
      rlRemaining: '4998',
      rlReset: '0',
    },
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': {
      status: 200,
      body: [
        commit('a', '2026-07-01T12:00:00Z'),
        commit('b', '2026-07-19T12:00:00Z'),
      ],
      etag: '"commits-1"',
      rlRemaining: '4996',
      rlReset: '0',
    },
    'https://api.github.com/repos/fullselfbrowsing/FSB': {
      status: 200,
      body: repoSummary(2),
      etag: '"summary-1"',
      rlRemaining: '4999',
      rlReset: '0',
    },
  };
}

(async function main() {
  console.log('--- server-github-poller ---');
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};

  delete process.env.GITHUB_TOKEN;
  let poller = freshPoller();

  check('allowlist contains only the three GitHub datasets used by the stats page',
    JSON.stringify(poller.GITHUB_ENDPOINT_IDS) === JSON.stringify(['repo-summary', 'stars', 'commits']),
    JSON.stringify(poller.GITHUB_ENDPOINT_IDS));
  check('poll cadence remains five minutes', poller.GITHUB_POLL_INTERVAL_MS === 300000, String(poller.GITHUB_POLL_INTERVAL_MS));
  check('issues endpoint configuration and sanitizer are retired',
    poller.ENDPOINTS.issues === undefined && poller.aggregateIssues === undefined);

  // Happy path: every persisted payload is compact, complete, and identity-free.
  process.env.GITHUB_TOKEN = 'ghp_happy_path';
  poller = freshPoller();
  const db1 = new Database(':memory:');
  initializeDatabase(db1);
  const q1 = new Queries(db1);
  const happy = makeFakeFetch(happyCanned());
  await poller.runGithubPollerTick(db1, q1, happy.fakeFetch, NOW);

  for (const endpointId of poller.GITHUB_ENDPOINT_IDS) {
    const row = q1.getGithubCachePayload(endpointId);
    check(`${endpointId} has a complete v1 cache row`, row && row.isComplete && row.payloadVersion === 1, JSON.stringify(row));
    check(`${endpointId} cached payload contains no raw GitHub identity`,
      row && !/(alice|bob|private@example|identity-must-not-escape|"user"|"owner")/.test(row.payload),
      row && row.payload);
  }
  check('poller makes no Issues API request',
    !happy.calls.some((call) => call.url.includes('/issues')),
    JSON.stringify(happy.calls.map((call) => call.url)));

  const stars1 = JSON.parse(q1.getGithubCachePayload('stars').payload);
  check('stars use the aggregate v1 contract',
    stars1.schema_version === 1 && stars1.total === 2 && stars1.history.length === 2 && stars1.history_complete === true && stars1.source === 'stargazers',
    JSON.stringify(stars1));

  const commits1 = JSON.parse(q1.getGithubCachePayload('commits').payload);
  check('commits use cumulative aggregate contract',
    commits1.schema_version === 1 && commits1.total === 2 && commits1.last_30_days === 2 && commits1.history_complete === true && commits1.history.at(-1).total === 2,
    JSON.stringify(commits1));
  check('every fetch receives an AbortSignal for timeout enforcement',
    happy.calls.length > 0 && happy.calls.every((call) => call.options.signal && typeof call.options.signal.aborted === 'boolean'),
    `${happy.calls.length} calls`);

  // A tokenless deployment must not call the restricted stargazer-list API.
  delete process.env.GITHUB_TOKEN;
  const tokenlessPoller = freshPoller();
  const dbTokenless = new Database(':memory:');
  initializeDatabase(dbTokenless);
  const qTokenless = new Queries(dbTokenless);
  const tokenlessFetch = makeFakeFetch(happyCanned());
  await tokenlessPoller.runGithubPollerTick(dbTokenless, qTokenless, tokenlessFetch.fakeFetch, NOW);
  const tokenlessStars = JSON.parse(qTokenless.getGithubCachePayload('stars').payload);
  check('tokenless poll uses repo count without requesting stargazer identities',
    tokenlessStars.source === 'repository-count' &&
      !tokenlessFetch.calls.some((call) => call.url.includes('/stargazers')),
    JSON.stringify(tokenlessFetch.calls.map((call) => call.url)));
  process.env.GITHUB_TOKEN = 'ghp_happy_path';
  poller = freshPoller();

  // Conditional refresh preserves the complete last-known-good body.
  const beforeSummary = q1.getGithubCachePayload('repo-summary');
  const secondCanned = happyCanned();
  secondCanned['https://api.github.com/repos/fullselfbrowsing/FSB'] = {
    status: 304, body: undefined, etag: '"summary-1"', rlRemaining: '4900', rlReset: '0',
  };
  const second = makeFakeFetch(secondCanned);
  await poller.runGithubPollerTick(db1, q1, second.fakeFetch, NOW + 60000);
  const afterSummary = q1.getGithubCachePayload('repo-summary');
  check('304 preserves payload byte-for-byte', afterSummary.payload === beforeSummary.payload, afterSummary.payload);
  check('304 advances freshness and keeps cache complete',
    afterSummary.fetchedAt === NOW + 60000 && afterSummary.status === 304 && afterSummary.isComplete,
    JSON.stringify(afterSummary));

  // A page-1 304 means no new commits, but the rolling calendar window still
  // changes as old days age out. Refresh that derived field from cached history.
  const commit304 = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': {
      status: 304,
      body: undefined,
      etag: '"commits-1"',
      rlRemaining: '4899',
      rlReset: '0',
    },
  });
  const commitWindowNow = Date.parse('2026-08-20T12:00:00.000Z');
  await poller.pollEndpoint('commits', q1, commit304.fakeFetch, commitWindowNow);
  const commitsAfter304 = JSON.parse(q1.getGithubCachePayload('commits').payload);
  check('commit 304 recomputes the rolling 30-calendar-day count',
    commitsAfter304.last_30_days === 0 && commitsAfter304.as_of === new Date(commitWindowNow).toISOString(),
    JSON.stringify(commitsAfter304));

  // One cold endpoint failure records retry state without aborting the tick.
  const db2 = new Database(':memory:');
  initializeDatabase(db2);
  const q2 = new Queries(db2);
  const failureCanned = happyCanned();
  failureCanned['https://api.github.com/repos/fullselfbrowsing/FSB/commits'] = { __reject: 'network down' };
  const failureFetch = makeFakeFetch(failureCanned);
  await poller.runGithubPollerTick(db2, q2, failureFetch.fakeFetch, NOW);
  const failedCommit = q2.getGithubCachePayload('commits');
  check('cold failure records an incomplete placeholder and exponential retry time',
    failedCommit && !failedCommit.isComplete && failedCommit.status === 0 && failedCommit.consecutiveFailures === 1 && failedCommit.nextRetryAt === NOW + 300000,
    JSON.stringify(failedCommit));
  check('a sibling endpoint still updates after one failure', q2.getGithubCachePayload('repo-summary')?.isComplete === true);

  // Token is captured at module load and sent only when configured.
  process.env.GITHUB_TOKEN = 'ghp_test_123';
  poller = freshPoller();
  const db3 = new Database(':memory:');
  initializeDatabase(db3);
  const q3 = new Queries(db3);
  const authFetch = makeFakeFetch(happyCanned());
  await poller.runGithubPollerTick(db3, q3, authFetch.fakeFetch, NOW);
  check('configured token is sent as a bearer token',
    authFetch.calls.every((call) => call.options.headers.Authorization === 'Bearer ghp_test_123'));
  delete process.env.GITHUB_TOKEN;
  poller = freshPoller();

  // Regression: history larger than the former 30-page/3000-commit cap.
  const db4 = new Database(':memory:');
  initializeDatabase(db4);
  const q4 = new Queries(db4);
  const deepFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': (url, options) => {
      if (options.headers['If-None-Match'] === '"deep"') {
        return { status: 304, body: undefined, etag: '"deep"', rlRemaining: '4499', rlReset: '0' };
      }
      const page = Number(url.match(/[?&]page=(\d+)/)?.[1]);
      const length = page <= 32 ? 100 : 7;
      return {
        status: 200,
        body: Array.from({ length }, (_, index) => commit(`${page}-${index}`, '2025-01-01T00:00:00Z')),
        etag: page === 1 ? '"deep"' : null,
        rlRemaining: '4500',
        rlReset: '0',
      };
    },
  });
  await poller.pollEndpoint('commits', q4, deepFetch.fakeFetch, NOW);
  const deep = JSON.parse(q4.getGithubCachePayload('commits').payload);
  check('commit pagination walks past 30 pages to the terminal short page',
    deep.total === 3207 && deep.history_complete === true && deepFetch.calls.length === 34,
    `total=${deep.total} calls=${deepFetch.calls.length}`);

  // Follow Link rel=next even when a page is unexpectedly short, deduplicate
  // boundary rows, and require a stable page-one ETag before committing.
  const dbPaging = new Database(':memory:');
  initializeDatabase(dbPaging);
  const qPaging = new Queries(dbPaging);
  const linkedFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': (url, options) => {
      if (options.headers['If-None-Match'] === '"linked"') {
        return { status: 304, body: undefined, etag: '"linked"', rlRemaining: '4900', rlReset: '0' };
      }
      const page = Number(url.match(/[?&]page=(\d+)/)?.[1]);
      return page === 1
        ? {
            status: 200,
            body: [commit('a', '2026-07-19T00:00:00Z'), commit('b', '2026-07-18T00:00:00Z')],
            etag: '"linked"',
            link: '<https://api.github.com/example?page=2>; rel="next"',
            rlRemaining: '4902',
            rlReset: '0',
          }
        : {
            status: 200,
            body: [commit('b', '2026-07-18T00:00:00Z'), commit('c', '2026-07-17T00:00:00Z')],
            etag: null,
            rlRemaining: '4901',
            rlReset: '0',
          };
    },
  });
  await poller.pollEndpoint('commits', qPaging, linkedFetch.fakeFetch, NOW);
  const linked = JSON.parse(qPaging.getGithubCachePayload('commits').payload);
  check('pagination follows Link next, removes boundary duplicates, and revalidates page one',
    linked.total === 3 && linkedFetch.calls.length === 3,
    `total=${linked.total} calls=${linkedFetch.calls.length}`);

  // GitHub normally supplies an ETag, but completeness must not depend on it.
  // Re-read page one and compare its body when the validator is absent.
  const dbNoEtag = new Database(':memory:');
  initializeDatabase(dbNoEtag);
  const qNoEtag = new Queries(dbNoEtag);
  let stablePageOneCalls = 0;
  const stableNoEtagFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': (url) => {
      const page = Number(url.match(/[?&]page=(\d+)/)?.[1]);
      if (page === 1) {
        stablePageOneCalls += 1;
        return {
          status: 200,
          body: [commit('a', '2026-07-19T00:00:00Z'), commit('b', '2026-07-18T00:00:00Z')],
          etag: null,
          link: stablePageOneCalls === 1 ? '<https://api.github.com/example?page=2>; rel="next"' : null,
          rlRemaining: '4902',
          rlReset: '0',
        };
      }
      return {
        status: 200,
        body: [commit('c', '2026-07-17T00:00:00Z')],
        etag: null,
        rlRemaining: '4901',
        rlReset: '0',
      };
    },
  });
  await poller.pollEndpoint('commits', qNoEtag, stableNoEtagFetch.fakeFetch, NOW);
  const stableNoEtag = JSON.parse(qNoEtag.getGithubCachePayload('commits').payload);
  check('multi-page walk without an ETag rechecks identical page-one content before publishing',
    stableNoEtag.total === 3 && stableNoEtag.history_complete === true && stablePageOneCalls === 2,
    `total=${stableNoEtag.total} pageOneCalls=${stablePageOneCalls}`);

  const oldNoEtagPayload = JSON.stringify({
    schema_version: 1,
    total: 1,
    last_30_days: 1,
    history: [{ day_utc: '2026-07-16', total: 1 }],
    history_complete: true,
    as_of: '2026-07-19T12:00:00.000Z',
  });
  qNoEtag.upsertGithubCacheRow('commits', oldNoEtagPayload, null, NOW - 1000, 200, 4900, 0, true, 1);
  let changedPageOneCalls = 0;
  const changedNoEtagFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': (url) => {
      const page = Number(url.match(/[?&]page=(\d+)/)?.[1]);
      if (page === 1) {
        changedPageOneCalls += 1;
        return {
          status: 200,
          body: changedPageOneCalls === 1
            ? [commit('a', '2026-07-19T00:00:00Z'), commit('b', '2026-07-18T00:00:00Z')]
            : [commit('new-head', '2026-07-20T00:00:00Z'), commit('a', '2026-07-19T00:00:00Z')],
          etag: null,
          link: changedPageOneCalls === 1 ? '<https://api.github.com/example?page=2>; rel="next"' : null,
          rlRemaining: '4899',
          rlReset: '0',
        };
      }
      return {
        status: 200,
        body: [commit('c', '2026-07-17T00:00:00Z')],
        etag: null,
        rlRemaining: '4898',
        rlReset: '0',
      };
    },
  });
  await poller.pollEndpoint('commits', qNoEtag, changedNoEtagFetch.fakeFetch, NOW);
  const changedNoEtag = qNoEtag.getGithubCachePayload('commits');
  check('changed page one without an ETag fails closed and preserves the LKG',
    changedNoEtag.payload === oldNoEtagPayload && changedNoEtag.lastErrorStatus === 409 && changedPageOneCalls === 2,
    JSON.stringify(changedNoEtag));

  let malformedCommitRejected = false;
  try {
    poller.aggregateCommits([commit('bad', 'not-a-date')], NOW, true);
  } catch {
    malformedCommitRejected = true;
  }
  check('complete commit aggregation rejects malformed dates instead of silently truncating', malformedCommitRejected);

  // A later-page failure must never overwrite a complete LKG with a prefix.
  const oldCommitPayload = JSON.stringify({
    schema_version: 1,
    total: 2,
    last_30_days: 2,
    history: [{ day_utc: '2026-07-19', total: 2 }],
    history_complete: true,
    as_of: '2026-07-19T12:00:00.000Z',
  });
  q4.upsertGithubCacheRow('commits', oldCommitPayload, '"old"', NOW - 1000, 200, 4500, 0, true, 1);
  const partialFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': (url) => {
      const page = Number(url.match(/[?&]page=(\d+)/)?.[1]);
      if (page === 1) {
        return { status: 200, body: Array.from({ length: 100 }, (_, i) => commit(`new-${i}`, '2026-07-20T00:00:00Z')), etag: '"new"', rlRemaining: '4000', rlReset: '0' };
      }
      return { status: 500, body: { message: 'boom' }, etag: null, rlRemaining: '3999', rlReset: '0' };
    },
  });
  await poller.pollEndpoint('commits', q4, partialFetch.fakeFetch, NOW);
  const afterPartial = q4.getGithubCachePayload('commits');
  check('later-page failure preserves LKG payload and fetched_at',
    afterPartial.payload === oldCommitPayload && afterPartial.fetchedAt === NOW - 1000 && afterPartial.isComplete,
    JSON.stringify(afterPartial));
  check('later-page failure records status and retry metadata',
    afterPartial.status === 500 && afterPartial.lastErrorStatus === 500 && afterPartial.consecutiveFailures === 1 && afterPartial.nextRetryAt === NOW + 300000,
    JSON.stringify(afterPartial));

  // A migrated row is incomplete and therefore cannot use its legacy ETag.
  const db5 = new Database(':memory:');
  initializeDatabase(db5);
  const q5 = new Queries(db5);
  q5.upsertGithubCacheRow('commits', JSON.stringify([commit('legacy', '2025-01-01T00:00:00Z')]), '"legacy"', NOW - 1000, 200, 5000, 0, false, 0);
  const healFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': {
      status: 200,
      body: [commit('fresh', '2026-07-20T00:00:00Z')],
      etag: '"fresh"',
      rlRemaining: '4999',
      rlReset: '0',
    },
  });
  await poller.pollEndpoint('commits', q5, healFetch.fakeFetch, NOW);
  const healed = q5.getGithubCachePayload('commits');
  check('incomplete legacy cache does not send If-None-Match',
    !Object.prototype.hasOwnProperty.call(healFetch.calls[0].options.headers, 'If-None-Match'),
    JSON.stringify(healFetch.calls[0].options.headers));
  check('full traversal self-heals legacy cache to complete v1',
    healed.isComplete && healed.payloadVersion === 1 && JSON.parse(healed.payload).history_complete === true,
    JSON.stringify(healed));

  // Restricted stargazer endpoint falls back to the authoritative summary and
  // retains aggregate history without exposing identities.
  const summaryPayload = poller.sanitizePublicPayload('repo-summary', repoSummary(3), { nowMs: NOW });
  q5.upsertGithubCacheRow('repo-summary', JSON.stringify(summaryPayload), '"summary"', NOW, 200, 5000, 0, true, 1);
  const oldStars = {
    ...stars1,
    as_of: '2026-07-15T12:00:00.000Z',
  };
  q5.upsertGithubCacheRow('stars', JSON.stringify(oldStars), '"stars-old"', NOW - 1000, 200, 5000, 0, true, 1);
  const restrictedFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/stargazers': {
      status: 403,
      body: { message: 'collaborator access required' },
      etag: null,
      rlRemaining: '4998',
      rlReset: '0',
    },
  });
  process.env.GITHUB_TOKEN = 'ghp_restricted';
  const restrictedPoller = freshPoller();
  await restrictedPoller.pollEndpoint('stars', q5, restrictedFetch.fakeFetch, NOW);
  const restricted = JSON.parse(q5.getGithubCachePayload('stars').payload);
  check('restricted stars use repository-count fallback with current total',
    restricted.source === 'repository-count' && restricted.total === 3 && restricted.history.at(-1).total === 3,
    JSON.stringify(restricted));
  check('restricted stars remain aggregate-only', !/(alice|bob|"user"|login)/.test(JSON.stringify(restricted)), JSON.stringify(restricted));
  check('multi-day unknown star-count change downgrades history completeness',
    restricted.history_complete === false,
    JSON.stringify(restricted));
  const midnightFallback = restrictedPoller.starsFromRepositoryCount({
    ...stars1,
    as_of: '2026-07-19T23:59:59.000Z',
  }, 3, Date.parse('2026-07-20T00:00:01.000Z'));
  check('star-count change across UTC midnight downgrades history completeness even across a short gap',
    midnightFallback.history_complete === false,
    JSON.stringify(midnightFallback));
  const sameDayFallback = restrictedPoller.starsFromRepositoryCount({
    ...stars1,
    as_of: '2026-07-20T00:01:00.000Z',
  }, 3, Date.parse('2026-07-20T00:02:00.000Z'));
  check('repository-count change on the same day still marks historical distribution incomplete',
    sameDayFallback.history_complete === false,
    JSON.stringify(sameDayFallback));
  const unchangedFallback = restrictedPoller.starsFromRepositoryCount(stars1, stars1.total, NOW);
  check('every repository-count fallback is explicitly history-incomplete, even when net total is unchanged',
    unchangedFallback.history_complete === false,
    JSON.stringify(unchangedFallback));
  check('401/403 stargazer restriction uses a six-hour retry cadence',
    q5.getGithubCachePayload('stars').nextRetryAt === NOW + restrictedPoller.RESTRICTED_STARS_RETRY_MS,
    JSON.stringify(q5.getGithubCachePayload('stars')));

  let invalidStarEnvelopeRejected = false;
  try {
    restrictedPoller.normalizeStarsPayload({
      schema_version: 1,
      total: 99,
      history: [{ day_utc: '2026-07-20', total: 3 }],
      history_complete: true,
      source: 'stargazers',
      as_of: '2026-07-20T12:00:00.000Z',
    }, 99, NOW);
  } catch {
    invalidStarEnvelopeRejected = true;
  }
  check('star envelope rejects a final history total inconsistent with total', invalidStarEnvelopeRejected);

  // A complete stargazer traversal is newer and more authoritative than an
  // older repository summary. Its own terminal-page cardinality wins.
  q5.upsertGithubCacheRow(
    'repo-summary',
    JSON.stringify(restrictedPoller.sanitizePublicPayload('repo-summary', repoSummary(2), { nowMs: NOW })),
    '"older-summary"',
    NOW - 60000,
    200,
    5000,
    0,
    true,
    1
  );
  q5.upsertGithubCacheRow('stars', JSON.stringify(oldStars), '"stars-before-new-walk"', NOW - 120000, 200, 5000, 0, true, 1);
  const newerStarsFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/stargazers': {
      status: 200,
      body: [
        { starred_at: '2026-07-18T10:00:00Z' },
        { starred_at: '2026-07-19T10:00:00Z' },
        { starred_at: '2026-07-20T10:00:00Z' },
      ],
      etag: '"newer-stars"',
      rlRemaining: '4997',
      rlReset: '0',
    },
  });
  await restrictedPoller.pollEndpoint('stars', q5, newerStarsFetch.fakeFetch, NOW);
  const newerStars = JSON.parse(q5.getGithubCachePayload('stars').payload);
  check('newer complete stargazer walk is not overwritten by an older summary count',
    newerStars.total === 3 && newerStars.history_complete === true && newerStars.source === 'stargazers',
    JSON.stringify(newerStars));

  const newerStarsRowBeforeFailure = q5.getGithubCachePayload('stars');
  await restrictedPoller.pollEndpoint('stars', q5, restrictedFetch.fakeFetch, NOW + 1000);
  const newerStarsRowAfterFailure = q5.getGithubCachePayload('stars');
  check('an older repository summary cannot replace a newer star LKG after a restricted-endpoint failure',
    newerStarsRowAfterFailure.payload === newerStarsRowBeforeFailure.payload &&
      newerStarsRowAfterFailure.fetchedAt === newerStarsRowBeforeFailure.fetchedAt &&
      newerStarsRowAfterFailure.lastErrorStatus === 403,
    JSON.stringify(newerStarsRowAfterFailure));

  // GitHub secondary rate limits communicate their own retry window.
  const dbRetry = new Database(':memory:');
  initializeDatabase(dbRetry);
  const qRetry = new Queries(dbRetry);
  const retryFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits': {
      status: 429,
      body: { message: 'secondary rate limit' },
      retryAfter: '1200',
      rlRemaining: '4999',
      rlReset: '0',
    },
  });
  await restrictedPoller.pollEndpoint('commits', qRetry, retryFetch.fakeFetch, NOW);
  check('Retry-After extends persistent backoff beyond the default failure delay',
    qRetry.getGithubCachePayload('commits').nextRetryAt === NOW + 1200000,
    JSON.stringify(qRetry.getGithubCachePayload('commits')));

  qRetry.upsertGithubCacheRow(
    'repo-summary',
    JSON.stringify(restrictedPoller.sanitizePublicPayload('repo-summary', repoSummary(3), { nowMs: NOW })),
    '"retry-summary"',
    NOW,
    200,
    5000,
    0,
    true,
    1
  );
  qRetry.upsertGithubCacheRow('stars', JSON.stringify(oldStars), '"retry-stars"', NOW - 1000, 200, 5000, 0, true, 1);
  const starRateResetAt = NOW + 1800000;
  const starRetryFetch = makeFakeFetch({
    'https://api.github.com/repos/fullselfbrowsing/FSB/stargazers': {
      status: 429,
      body: { message: 'secondary rate limit' },
      retryAfter: '1200',
      rlRemaining: '0',
      rlReset: String(starRateResetAt / 1000),
    },
  });
  await restrictedPoller.pollEndpoint('stars', qRetry, starRetryFetch.fakeFetch, NOW);
  const starRetryRow = qRetry.getGithubCachePayload('stars');
  check('repository-count fallback preserves the longest Retry-After/rate-reset instruction',
    starRetryRow.nextRetryAt === starRateResetAt && JSON.parse(starRetryRow.payload).source === 'repository-count',
    JSON.stringify(starRetryRow));

  // Persistent backoff avoids hammering an unhealthy endpoint.
  q5.recordGithubCacheFailureRow('commits', NOW, 500, null, null, NOW + 600000);
  const skippedFetch = makeFakeFetch({});
  await restrictedPoller.pollEndpoint('commits', q5, skippedFetch.fakeFetch, NOW + 1000);
  check('endpoint inside backoff window makes no request', skippedFetch.calls.length === 0, String(skippedFetch.calls.length));

  db1.close();
  dbTokenless.close();
  db2.close();
  db3.close();
  db4.close();
  db5.close();
  dbPaging.close();
  dbNoEtag.close();
  dbRetry.close();
  console.warn = originalWarn;
  console.error = originalError;

  console.log(`\n=== server-github-poller results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})();
