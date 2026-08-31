/**
 * Authenticated incremental GitHub poller/cache regression tests.
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
const REPO_URL = 'https://api.github.com/repos/fullselfbrowsing/FSB';
const STARS_URL = `${REPO_URL}/stargazers`;
const COMMITS_URL = `${REPO_URL}/commits`;
const COMPARE_URL = `${REPO_URL}/compare`;

function headUrl(branch = 'main') {
  return `${COMMITS_URL}?sha=${encodeURIComponent(branch)}&page=1&per_page=1`;
}

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
    json: async () => {
      if (canned.malformedJson) throw new Error('malformed JSON');
      return canned.body;
    },
    text: async () => JSON.stringify(canned.body ?? ''),
  };
}

function makeFakeFetch(handler) {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    const canned = await handler(url, options, calls.length);
    if (!canned) throw new Error(`no canned response for ${url}`);
    if (canned.reject) throw new Error(canned.reject);
    return response(canned);
  };
  return { fakeFetch, calls };
}

function ok(body, extras = {}) {
  return { status: 200, body, rlRemaining: '4999', rlReset: '0', ...extras };
}

function repoSummary(stars = 2, branch = 'main') {
  return {
    id: 123,
    name: 'FSB',
    full_name: 'fullselfbrowsing/FSB',
    stargazers_count: stars,
    forks_count: 4,
    open_issues_count: 8,
    subscribers_count: 3,
    default_branch: branch,
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

function star(id, date) {
  return { starred_at: date, user: { id, login: `private-${id}` } };
}

function openDb() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  return { db, queries: new Queries(db) };
}

function seedRepo(poller, queries, fetchedAt = NOW, stars = 2, branch = 'main') {
  const payload = poller.sanitizePublicPayload('repo-summary', repoSummary(stars, branch), { nowMs: fetchedAt });
  queries.upsertGithubCacheRow(
    'repo-summary', JSON.stringify(payload), '"repo-etag"', fetchedAt,
    200, 5000, 0, true, 1, fetchedAt
  );
}

function seedCommits(poller, queries, options = {}) {
  const fetchedAt = options.fetchedAt ?? NOW - 60_000;
  const events = options.events || [
    commit('old-head', '2026-07-19T12:00:00Z'),
    commit('old-root', '2026-07-18T12:00:00Z'),
  ];
  const payload = poller.aggregateCommits(events, fetchedAt, options.historyComplete ?? true);
  queries.upsertGithubCacheRow(
    'commits', JSON.stringify(payload), options.etag ?? '"old-head-etag"', fetchedAt,
    200, 4900, 0, true, 1, fetchedAt, null,
    options.pollState === undefined ? { branch: 'main', head_sha: 'old-head' } : options.pollState
  );
  return payload;
}

function seedStars(poller, queries, options = {}) {
  const fetchedAt = options.fetchedAt ?? NOW - 60_000;
  const events = options.events || [
    star(1, '2026-07-18T10:00:00Z'),
    star(2, '2026-07-19T10:00:00Z'),
  ];
  let payload = poller.sanitizePublicPayload('stars', events, {
    nowMs: fetchedAt,
    repoTotal: events.length,
    historyComplete: options.historyComplete ?? true,
  });
  if (options.historyComplete === false) {
    payload = { ...payload, history_complete: false, source: 'repository-count' };
  }
  queries.upsertGithubCacheRow(
    'stars', JSON.stringify(payload), '"stars-etag"', fetchedAt,
    200, 4900, 0, true, 1, fetchedAt, null,
    options.pollState === undefined ? { last_full_scan_at: fetchedAt } : options.pollState
  );
  return payload;
}

(async function main() {
  console.log('--- server-github-poller ---');
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};

  process.env.GITHUB_TOKEN = 'github_pat_test';
  let poller = freshPoller();

  check('allowlist contains only current public GitHub datasets',
    JSON.stringify(poller.GITHUB_ENDPOINT_IDS) === JSON.stringify(['repo-summary', 'stars', 'commits']));
  check('poll cadence remains five minutes', poller.GITHUB_POLL_INTERVAL_MS === 300_000);

  // The additive migration leaves all pre-existing rows without a cursor.
  const legacyDb = new Database(':memory:');
  legacyDb.exec(`
    CREATE TABLE github_cache (
      endpoint_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      etag TEXT,
      fetched_at INTEGER NOT NULL,
      http_status INTEGER NOT NULL,
      rate_limit_remaining INTEGER,
      rate_limit_reset INTEGER
    );
    INSERT INTO github_cache VALUES (
      'repo-summary',
      '${JSON.stringify(repoSummary()).replaceAll("'", "''")}',
      '"legacy"', ${NOW}, 200, 60, 0
    );
  `);
  initializeDatabase(legacyDb);
  const legacyRow = legacyDb.prepare(
    'SELECT poll_state_json FROM github_cache WHERE endpoint_id = ?'
  ).get('repo-summary');
  check('migration adds nullable private poll state and migrates existing rows as NULL',
    legacyRow && legacyRow.poll_state_json === null, JSON.stringify(legacyRow));
  legacyDb.close();

  // First authenticated tick performs complete, immutable-head seed walks.
  const happyDb = openDb();
  const happyFetch = makeFakeFetch((url) => {
    if (url === REPO_URL) return ok(repoSummary(2), { etag: '"repo-1"' });
    if (url.startsWith(`${STARS_URL}?`)) {
      return ok([star(1, '2026-07-18T10:00:00Z'), star(2, '2026-07-19T10:00:00Z')], { etag: '"stars-1"' });
    }
    if (url === headUrl()) return ok([commit('head-2', '2026-07-19T12:00:00Z')], { etag: '"head-2-etag"' });
    if (url.startsWith(`${COMMITS_URL}?sha=head-2`)) {
      return ok([commit('head-2', '2026-07-19T12:00:00Z'), commit('root-1', '2026-07-01T12:00:00Z')]);
    }
    return null;
  });
  await poller.runGithubPollerTick(happyDb.db, happyDb.queries, happyFetch.fakeFetch, NOW);
  const seededStars = happyDb.queries.getGithubCachePayload('stars');
  const seededCommits = happyDb.queries.getGithubCachePayload('commits');
  check('first authenticated star walk seeds reconciliation state',
    seededStars.pollState.last_full_scan_at === NOW, JSON.stringify(seededStars));
  check('first authenticated commit walk is pinned to the probed immutable SHA and seeds its cursor',
    seededCommits.pollState.branch === 'main' && seededCommits.pollState.head_sha === 'head-2' &&
      happyFetch.calls.some((call) => call.url.includes('?sha=head-2')),
    JSON.stringify(happyFetch.calls.map((call) => call.url)));
  check('private cursor and raw identities are absent from public payload JSON',
    !/(head-2|main|private-|identity-must-not-escape|private@example|"sha")/.test(
      `${seededStars.payload}${seededCommits.payload}`
    ), `${seededStars.payload} ${seededCommits.payload}`);
  check('all authenticated GitHub requests carry the bearer token',
    happyFetch.calls.every((call) => call.options.headers.Authorization === 'Bearer github_pat_test'));
  check('every request has timeout cancellation attached',
    happyFetch.calls.every((call) => call.options.signal && typeof call.options.signal.aborted === 'boolean'));

  // Unchanged commits use one conditional head probe and still age the rolling window.
  const conditionalDb = openDb();
  seedRepo(poller, conditionalDb.queries, NOW);
  seedCommits(poller, conditionalDb.queries, {
    fetchedAt: Date.parse('2026-06-01T12:00:00Z'),
    events: [commit('old-head', '2026-06-01T12:00:00Z')],
  });
  const conditionalFetch = makeFakeFetch((url, options) => {
    if (url === headUrl()) {
      return {
        status: 304, etag: '"old-head-etag"', rlRemaining: '4800', rlReset: '0',
        body: undefined,
      };
    }
    return null;
  });
  await poller.pollEndpoint('commits', conditionalDb.queries, conditionalFetch.fakeFetch, NOW);
  const conditionalRow = conditionalDb.queries.getGithubCachePayload('commits');
  const conditionalPayload = JSON.parse(conditionalRow.payload);
  check('unchanged commit refresh is a single conditional head request',
    conditionalFetch.calls.length === 1 &&
      conditionalFetch.calls[0].options.headers['If-None-Match'] === '"old-head-etag"');
  check('head 304 refreshes snapshot age, keeps cursor, and recalculates rolling 30 days',
    conditionalRow.fetchedAt === NOW && conditionalRow.status === 304 &&
      conditionalRow.pollState.head_sha === 'old-head' && conditionalPayload.last_30_days === 0,
    JSON.stringify(conditionalRow));

  // A failed summary must not let commits refresh against an unverified old
  // default branch, and must not back off commit recovery.
  const dependencyDb = openDb();
  seedRepo(poller, dependencyDb.queries, NOW - 60_000, 2, 'main');
  seedCommits(poller, dependencyDb.queries);
  const beforeDependency = dependencyDb.queries.getGithubCachePayload('commits');
  const summaryFailure = makeFakeFetch((url) => url === REPO_URL
    ? { status: 500, body: {}, rlRemaining: '4800', rlReset: '0' }
    : null);
  await poller.pollEndpoint('repo-summary', dependencyDb.queries, summaryFailure.fakeFetch, NOW);
  const dependencyCommitFetch = makeFakeFetch(() => null);
  await poller.pollEndpoint('commits', dependencyDb.queries, dependencyCommitFetch.fakeFetch, NOW);
  const afterDependency = dependencyDb.queries.getGithubCachePayload('commits');
  check('failed same-tick summary leaves commits untouched and creates no commit backoff',
    dependencyCommitFetch.calls.length === 0 &&
      afterDependency.payload === beforeDependency.payload &&
      afterDependency.fetchedAt === beforeDependency.fetchedAt &&
      afterDependency.lastAttemptAt === beforeDependency.lastAttemptAt &&
      afterDependency.consecutiveFailures === 0 && afterDependency.nextRetryAt === null,
    JSON.stringify(afterDependency));

  const recoveryAt = NOW + 300_000;
  const dependencyRecovery = makeFakeFetch((url) => {
    if (url === REPO_URL) return ok(repoSummary(2, 'release'), { etag: '"release-summary"' });
    if (url === headUrl('release')) {
      return ok([commit('release-recovery', '2026-07-20T12:05:00Z')], { etag: '"release-recovery"' });
    }
    if (url.includes('sha=release-recovery&page=1&per_page=100')) {
      return ok([commit('release-recovery', '2026-07-20T12:05:00Z')]);
    }
    return null;
  });
  await poller.pollEndpoint('repo-summary', dependencyDb.queries, dependencyRecovery.fakeFetch, recoveryAt);
  await poller.pollEndpoint('commits', dependencyDb.queries, dependencyRecovery.fakeFetch, recoveryAt);
  const recoveredDependency = dependencyDb.queries.getGithubCachePayload('commits');
  check('summary recovery immediately detects a default-branch change and performs a pinned rebuild',
    recoveredDependency.fetchedAt === recoveryAt && recoveredDependency.pollState.branch === 'release' &&
      recoveredDependency.pollState.head_sha === 'release-recovery' &&
      dependencyRecovery.calls.some((call) => call.url.includes('sha=release-recovery&page=1&per_page=100')),
    JSON.stringify(dependencyRecovery.calls.map((call) => call.url)));

  // Normal fast-forward is a head probe plus compare request.
  const fastDb = openDb();
  seedRepo(poller, fastDb.queries, NOW);
  seedCommits(poller, fastDb.queries);
  const fastFetch = makeFakeFetch((url) => {
    if (url === headUrl()) return ok([commit('new-head', '2026-07-20T11:00:00Z')], { etag: '"new-head-etag"' });
    if (url.startsWith(`${COMPARE_URL}/old-head...new-head?`)) {
      return ok({ status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit('new-head', '2026-07-20T11:00:00Z')] });
    }
    return null;
  });
  await poller.pollEndpoint('commits', fastDb.queries, fastFetch.fakeFetch, NOW);
  const fastRow = fastDb.queries.getGithubCachePayload('commits');
  check('one-commit fast-forward uses two requests and atomically advances payload, ETag, and cursor',
    fastFetch.calls.length === 2 && JSON.parse(fastRow.payload).total === 3 &&
      fastRow.etag === '"new-head-etag"' && fastRow.pollState.head_sha === 'new-head',
    JSON.stringify({ calls: fastFetch.calls.map((call) => call.url), row: fastRow }));

  // Paginated compare merge validates unique cardinality and supports backdated author dates.
  const pagedDb = openDb();
  seedRepo(poller, pagedDb.queries, NOW);
  seedCommits(poller, pagedDb.queries);
  const newCommits = Array.from({ length: 101 }, (_, index) => commit(
    `new-${index}`,
    index === 100 ? '2025-01-01T00:00:00Z' : '2026-07-20T00:00:00Z'
  ));
  const pagedFetch = makeFakeFetch((url) => {
    if (url === headUrl()) return ok([commit('new-100', '2025-01-01T00:00:00Z')], { etag: '"paged-head"' });
    if (url.includes('/compare/old-head...new-100?page=1')) {
      return ok(
        { status: 'ahead', ahead_by: 101, behind_by: 0, commits: newCommits.slice(0, 100) },
        { link: '<https://api.github.com/example?page=2>; rel="next"' }
      );
    }
    if (url.includes('/compare/old-head...new-100?page=2')) {
      return ok({ status: 'ahead', ahead_by: 101, behind_by: 0, commits: newCommits.slice(100) });
    }
    return null;
  });
  await poller.pollEndpoint('commits', pagedDb.queries, pagedFetch.fakeFetch, NOW);
  const pagedPayload = JSON.parse(pagedDb.queries.getGithubCachePayload('commits').payload);
  check('paginated fast-forward merges every unique compare commit',
    pagedPayload.total === 103 && pagedFetch.calls.length === 3, JSON.stringify(pagedPayload));
  check('backdated compare commits are inserted into chronological cumulative history',
    pagedPayload.history[0].day_utc === '2025-01-01' &&
      pagedPayload.history.at(-1).total === 103, JSON.stringify(pagedPayload.history));

  // Any compare inconsistency fails closed with payload/ETag/cursor/fetched_at untouched.
  const atomicDb = openDb();
  seedRepo(poller, atomicDb.queries, NOW);
  seedCommits(poller, atomicDb.queries);
  const beforeAtomic = atomicDb.queries.getGithubCachePayload('commits');
  const malformedCompare = makeFakeFetch((url) => {
    if (url === headUrl()) return ok([commit('bad-head', '2026-07-20T00:00:00Z')], { etag: '"bad-head-etag"' });
    if (url.startsWith(`${COMPARE_URL}/old-head...bad-head?`)) {
      return ok({ status: 'ahead', ahead_by: 2, behind_by: 0, commits: [commit('bad-head', '2026-07-20T00:00:00Z')] });
    }
    return null;
  });
  await poller.pollEndpoint('commits', atomicDb.queries, malformedCompare.fakeFetch, NOW);
  const afterAtomic = atomicDb.queries.getGithubCachePayload('commits');
  check('compare cardinality mismatch preserves payload, ETag, cursor, and fetched_at atomically',
    afterAtomic.payload === beforeAtomic.payload && afterAtomic.etag === beforeAtomic.etag &&
      afterAtomic.fetchedAt === beforeAtomic.fetchedAt &&
      JSON.stringify(afterAtomic.pollState) === JSON.stringify(beforeAtomic.pollState) &&
      afterAtomic.lastErrorStatus === 502,
    JSON.stringify(afterAtomic));

  const wrongHeadDb = openDb();
  seedRepo(poller, wrongHeadDb.queries, NOW);
  seedCommits(poller, wrongHeadDb.queries);
  const beforeWrongHead = wrongHeadDb.queries.getGithubCachePayload('commits');
  const wrongHeadCompare = makeFakeFetch((url) => {
    if (url === headUrl()) return ok([commit('expected-head', '2026-07-20T00:00:00Z')], { etag: '"expected-head"' });
    if (url.startsWith(`${COMPARE_URL}/old-head...expected-head?`)) {
      return ok({
        status: 'ahead', ahead_by: 1, behind_by: 0,
        commits: [commit('wrong-but-cardinality-matches', '2026-07-20T00:00:00Z')],
      });
    }
    return null;
  });
  await poller.pollEndpoint('commits', wrongHeadDb.queries, wrongHeadCompare.fakeFetch, NOW);
  const afterWrongHead = wrongHeadDb.queries.getGithubCachePayload('commits');
  check('right-cardinality compare with the wrong head SHA preserves the complete LKG',
    afterWrongHead.payload === beforeWrongHead.payload &&
      afterWrongHead.etag === beforeWrongHead.etag &&
      afterWrongHead.fetchedAt === beforeWrongHead.fetchedAt &&
      JSON.stringify(afterWrongHead.pollState) === JSON.stringify(beforeWrongHead.pollState) &&
      afterWrongHead.lastErrorStatus === 502,
    JSON.stringify(afterWrongHead));

  const authDb = openDb();
  seedRepo(poller, authDb.queries, NOW);
  seedCommits(poller, authDb.queries);
  const beforeAuth = authDb.queries.getGithubCachePayload('commits');
  const authFailure = makeFakeFetch((url) => {
    if (url === headUrl()) return ok([commit('auth-head', '2026-07-20T00:00:00Z')], { etag: '"auth-head"' });
    if (url.startsWith(`${COMPARE_URL}/old-head...auth-head?`)) return { status: 403, body: {}, rlRemaining: '0', rlReset: '0' };
    return null;
  });
  await poller.pollEndpoint('commits', authDb.queries, authFailure.fakeFetch, NOW);
  const afterAuth = authDb.queries.getGithubCachePayload('commits');
  check('compare authentication failure preserves the full last-known-good row',
    afterAuth.payload === beforeAuth.payload && afterAuth.etag === beforeAuth.etag &&
      afterAuth.fetchedAt === beforeAuth.fetchedAt &&
      JSON.stringify(afterAuth.pollState) === JSON.stringify(beforeAuth.pollState) &&
      afterAuth.lastErrorStatus === 403,
    JSON.stringify(afterAuth));

  // Unavailable bases and rewritten history rebuild from the new immutable head.
  for (const scenario of [
    { label: 'unavailable compare base', compare: { status: 404, body: {} } },
    { label: 'rewritten history', compare: ok({ status: 'diverged', ahead_by: 1, behind_by: 1, commits: [] }) },
    { label: 'nonzero compare behind count', compare: ok({
      status: 'ahead', ahead_by: 1, behind_by: 1,
      commits: [commit('rewrite-head', '2026-07-20T00:00:00Z')],
    }) },
  ]) {
    const rebuiltDb = openDb();
    seedRepo(poller, rebuiltDb.queries, NOW);
    seedCommits(poller, rebuiltDb.queries);
    const rebuiltFetch = makeFakeFetch((url) => {
      if (url === headUrl()) return ok([commit('rewrite-head', '2026-07-20T00:00:00Z')], { etag: '"rewrite-etag"' });
      if (url.startsWith(`${COMPARE_URL}/old-head...rewrite-head?`)) {
        return { rlRemaining: '4800', rlReset: '0', ...scenario.compare };
      }
      if (url.startsWith(`${COMMITS_URL}?sha=rewrite-head`)) {
        return ok([
          commit('rewrite-head', '2026-07-20T00:00:00Z'),
          commit('rewrite-root', '2026-07-10T00:00:00Z'),
        ]);
      }
      return null;
    });
    await poller.pollEndpoint('commits', rebuiltDb.queries, rebuiltFetch.fakeFetch, NOW);
    const rebuilt = rebuiltDb.queries.getGithubCachePayload('commits');
    check(`${scenario.label} triggers a complete traversal pinned to the new head`,
      JSON.parse(rebuilt.payload).total === 2 && rebuilt.pollState.head_sha === 'rewrite-head' &&
        rebuiltFetch.calls.some((call) => call.url.includes('?sha=rewrite-head')),
      JSON.stringify(rebuiltFetch.calls.map((call) => call.url)));
    rebuiltDb.db.close();
  }

  const branchDb = openDb();
  seedRepo(poller, branchDb.queries, NOW, 2, 'release');
  seedCommits(poller, branchDb.queries);
  const branchFetch = makeFakeFetch((url, options) => {
    if (url === headUrl('release')) return ok([commit('release-head', '2026-07-20T00:00:00Z')], { etag: '"release-etag"' });
    if (url.startsWith(`${COMMITS_URL}?sha=release-head`)) return ok([commit('release-head', '2026-07-20T00:00:00Z')]);
    return null;
  });
  await poller.pollEndpoint('commits', branchDb.queries, branchFetch.fakeFetch, NOW);
  const branchRow = branchDb.queries.getGithubCachePayload('commits');
  check('default-branch change bypasses compare and performs an unconditional pinned rebuild',
    branchRow.pollState.branch === 'release' && branchFetch.calls.length === 2 &&
      branchFetch.calls[0].options.headers['If-None-Match'] === undefined &&
      !branchFetch.calls.some((call) => call.url.includes('/compare/')),
    JSON.stringify(branchFetch.calls.map((call) => call.url)));

  // Missing state forces a full seed; a failed seed leaves the prior public snapshot available.
  const missingStateDb = openDb();
  seedRepo(poller, missingStateDb.queries, NOW);
  seedCommits(poller, missingStateDb.queries, { pollState: null });
  const beforeSeedFailure = missingStateDb.queries.getGithubCachePayload('commits');
  const seedFailure = makeFakeFetch((url) => {
    if (url === headUrl()) return ok([commit('seed-head', '2026-07-20T00:00:00Z')], { etag: '"seed-etag"' });
    if (url.startsWith(`${COMMITS_URL}?sha=seed-head`)) return { status: 500, body: {}, rlRemaining: '4700', rlReset: '0' };
    return null;
  });
  await poller.pollEndpoint('commits', missingStateDb.queries, seedFailure.fakeFetch, NOW);
  const failedSeed = missingStateDb.queries.getGithubCachePayload('commits');
  check('failed first cursor seed preserves the pre-existing aggregate while state remains NULL',
    failedSeed.payload === beforeSeedFailure.payload && failedSeed.fetchedAt === beforeSeedFailure.fetchedAt &&
      failedSeed.pollState === null && failedSeed.lastErrorStatus === 500,
    JSON.stringify(failedSeed));

  const laterPageDb = openDb();
  seedRepo(poller, laterPageDb.queries, NOW);
  seedCommits(poller, laterPageDb.queries, { pollState: null });
  const beforeLaterPage = laterPageDb.queries.getGithubCachePayload('commits');
  const firstRebuildPage = [
    commit('long-head', '2026-07-20T00:00:00Z'),
    ...Array.from({ length: 99 }, (_, index) => commit(`long-${index}`, '2026-07-19T00:00:00Z')),
  ];
  const laterPageFailure = makeFakeFetch((url) => {
    if (url === headUrl()) {
      return ok([commit('long-head', '2026-07-20T00:00:00Z')], { etag: '"long-head-etag"' });
    }
    if (url.includes('sha=long-head&page=1&per_page=100')) {
      return ok(firstRebuildPage, {
        link: '<https://api.github.com/example?page=2>; rel="next"',
      });
    }
    if (url.includes('sha=long-head&page=2&per_page=100')) {
      return { status: 500, body: {}, rlRemaining: '4600', rlReset: '0' };
    }
    return null;
  });
  await poller.pollEndpoint('commits', laterPageDb.queries, laterPageFailure.fakeFetch, NOW);
  const afterLaterPage = laterPageDb.queries.getGithubCachePayload('commits');
  check('later-page pinned rebuild failure preserves LKG payload, cursor, ETag, and fetched_at',
    afterLaterPage.payload === beforeLaterPage.payload &&
      afterLaterPage.etag === beforeLaterPage.etag &&
      afterLaterPage.fetchedAt === beforeLaterPage.fetchedAt &&
      JSON.stringify(afterLaterPage.pollState) === JSON.stringify(beforeLaterPage.pollState) &&
      afterLaterPage.lastErrorStatus === 500 && laterPageFailure.calls.length === 3,
    JSON.stringify(afterLaterPage));

  // Star total is the cheap detector; identity traversal is skipped while reconciled.
  const starFastDb = openDb();
  seedRepo(poller, starFastDb.queries, NOW, 2);
  seedStars(poller, starFastDb.queries, { fetchedAt: NOW - 60_000 });
  const noIdentityFetch = makeFakeFetch(() => null);
  await poller.pollEndpoint('stars', starFastDb.queries, noIdentityFetch.fakeFetch, NOW);
  const fastStars = starFastDb.queries.getGithubCachePayload('stars');
  check('unchanged complete star total under 24 hours skips the identity-list request',
    noIdentityFetch.calls.length === 0 && fastStars.fetchedAt === NOW &&
      JSON.parse(fastStars.payload).history_complete === true,
    JSON.stringify(fastStars));

  const starChangedDb = openDb();
  seedRepo(poller, starChangedDb.queries, NOW, 3);
  seedStars(poller, starChangedDb.queries, { fetchedAt: NOW - 60_000 });
  const changedStarsFetch = makeFakeFetch((url) => url.startsWith(`${STARS_URL}?`)
    ? ok([
        star(1, '2026-07-18T00:00:00Z'),
        star(2, '2026-07-19T00:00:00Z'),
        star(3, '2026-07-20T00:00:00Z'),
      ], { etag: '"stars-3"' })
    : null);
  await poller.pollEndpoint('stars', starChangedDb.queries, changedStarsFetch.fakeFetch, NOW);
  const changedStars = starChangedDb.queries.getGithubCachePayload('stars');
  check('changed repository total triggers a complete star reconciliation and advances state',
    changedStarsFetch.calls.length === 1 && JSON.parse(changedStars.payload).total === 3 &&
      JSON.parse(changedStars.payload).history_complete === true &&
      changedStars.pollState.last_full_scan_at === NOW,
    JSON.stringify(changedStars));

  for (const scenario of [
    { label: 'missing star state', options: { pollState: null } },
    { label: 'incomplete star history', options: { historyComplete: false } },
    { label: 'daily star reconciliation', options: { fetchedAt: NOW - (24 * 60 * 60 * 1000) } },
  ]) {
    const dueDb = openDb();
    seedRepo(poller, dueDb.queries, NOW, 2);
    seedStars(poller, dueDb.queries, scenario.options);
    const dueFetch = makeFakeFetch((url) => url.startsWith(`${STARS_URL}?`)
      ? ok([star(1, '2026-07-18T00:00:00Z'), star(2, '2026-07-19T00:00:00Z')])
      : null);
    await poller.pollEndpoint('stars', dueDb.queries, dueFetch.fakeFetch, NOW);
    check(`${scenario.label} forces an atomic full stargazer walk`,
      dueFetch.calls.length === 1 && dueDb.queries.getGithubCachePayload('stars').pollState.last_full_scan_at === NOW,
      JSON.stringify(dueFetch.calls.map((call) => call.url)));
    dueDb.db.close();
  }

  // Restricted tokens keep the same-tick total fresh while isolating history quality.
  const restrictedDb = openDb();
  seedRepo(poller, restrictedDb.queries, NOW, 3);
  seedStars(poller, restrictedDb.queries, { fetchedAt: NOW - (24 * 60 * 60 * 1000) });
  const previousRestrictedState = restrictedDb.queries.getGithubCachePayload('stars').pollState;
  const restrictedFetch = makeFakeFetch((url) => url.startsWith(`${STARS_URL}?`)
    ? { status: 403, body: {}, rlRemaining: '4990', rlReset: '0' }
    : null);
  await poller.pollEndpoint('stars', restrictedDb.queries, restrictedFetch.fakeFetch, NOW);
  const restrictedRow = restrictedDb.queries.getGithubCachePayload('stars');
  const restrictedPayload = JSON.parse(restrictedRow.payload);
  check('restricted token fallback retains the fresh repository total and marks only history incomplete',
    restrictedRow.fetchedAt === NOW && restrictedPayload.total === 3 &&
      restrictedPayload.source === 'repository-count' && restrictedPayload.history_complete === false,
    JSON.stringify(restrictedRow));
  check('restricted token fallback preserves private reconciliation state and sets a six-hour retry',
    JSON.stringify(restrictedRow.pollState) === JSON.stringify(previousRestrictedState) &&
      restrictedRow.status === 403 && restrictedRow.lastErrorStatus === 403 &&
      restrictedRow.consecutiveFailures === 1 &&
      restrictedRow.nextRetryAt === NOW + poller.RESTRICTED_STARS_RETRY_MS,
    JSON.stringify(restrictedRow));
  check('restricted fallback never persists raw stargazer identities',
    !/(private-|"user"|login)/.test(restrictedRow.payload), restrictedRow.payload);

  // Real star-list failures retain health metadata while count-only snapshots
  // continue to refresh during backoff. Repeated failures then back off
  // exponentially from the retained consecutive-failure count.
  const repeatedStarDb = openDb();
  seedRepo(poller, repeatedStarDb.queries, NOW, 2);
  seedStars(poller, repeatedStarDb.queries, { fetchedAt: NOW - (24 * 60 * 60 * 1000) });
  const star500 = makeFakeFetch((url) => url.startsWith(`${STARS_URL}?`)
    ? { status: 500, body: {}, rlRemaining: '4700', rlReset: '0' }
    : null);
  await poller.pollEndpoint('stars', repeatedStarDb.queries, star500.fakeFetch, NOW);
  const firstStarFailure = repeatedStarDb.queries.getGithubCachePayload('stars');
  check('first star 5xx keeps the repository-count snapshot fresh and records failure metadata',
    firstStarFailure.fetchedAt === NOW && firstStarFailure.lastAttemptAt === NOW &&
      firstStarFailure.status === 500 && firstStarFailure.lastErrorStatus === 500 &&
      firstStarFailure.consecutiveFailures === 1 && firstStarFailure.nextRetryAt === NOW + 300_000 &&
      JSON.parse(firstStarFailure.payload).source === 'repository-count',
    JSON.stringify(firstStarFailure));

  const insideBackoffAt = NOW + 60_000;
  seedRepo(poller, repeatedStarDb.queries, insideBackoffAt, 3);
  const noStarRetry = makeFakeFetch(() => null);
  await poller.pollEndpoint('stars', repeatedStarDb.queries, noStarRetry.fakeFetch, insideBackoffAt);
  const insideStarBackoff = repeatedStarDb.queries.getGithubCachePayload('stars');
  check('star tick inside backoff refreshes count but preserves all failure and retry metadata',
    noStarRetry.calls.length === 0 && insideStarBackoff.fetchedAt === insideBackoffAt &&
      JSON.parse(insideStarBackoff.payload).total === 3 &&
      insideStarBackoff.lastAttemptAt === NOW && insideStarBackoff.lastErrorStatus === 500 &&
      insideStarBackoff.consecutiveFailures === 1 && insideStarBackoff.nextRetryAt === NOW + 300_000,
    JSON.stringify(insideStarBackoff));

  const secondFailureAt = NOW + 300_000;
  seedRepo(poller, repeatedStarDb.queries, secondFailureAt, 4);
  const secondStar500 = makeFakeFetch((url) => url.startsWith(`${STARS_URL}?`)
    ? { status: 500, body: {}, rlRemaining: '4600', rlReset: '0' }
    : null);
  await poller.pollEndpoint('stars', repeatedStarDb.queries, secondStar500.fakeFetch, secondFailureAt);
  const secondStarFailure = repeatedStarDb.queries.getGithubCachePayload('stars');
  check('repeated star 5xx increments failure count and applies exponential retry delay',
    secondStarFailure.fetchedAt === secondFailureAt && JSON.parse(secondStarFailure.payload).total === 4 &&
      secondStarFailure.lastAttemptAt === secondFailureAt && secondStarFailure.lastErrorStatus === 500 &&
      secondStarFailure.consecutiveFailures === 2 &&
      secondStarFailure.nextRetryAt === secondFailureAt + 600_000,
    JSON.stringify(secondStarFailure));

  // Tokenless deployments use the same count-only fallback without calling the restricted API.
  delete process.env.GITHUB_TOKEN;
  const tokenlessPoller = freshPoller();
  const tokenlessDb = openDb();
  seedRepo(tokenlessPoller, tokenlessDb.queries, NOW, 4);
  const tokenlessFetch = makeFakeFetch(() => null);
  await tokenlessPoller.pollEndpoint('stars', tokenlessDb.queries, tokenlessFetch.fakeFetch, NOW);
  const tokenless = JSON.parse(tokenlessDb.queries.getGithubCachePayload('stars').payload);
  check('tokenless star poll uses repository count without an identity-list request',
    tokenlessFetch.calls.length === 0 && tokenless.total === 4 &&
      tokenless.source === 'repository-count' && tokenless.history_complete === false,
    JSON.stringify(tokenless));

  // Persistent backoff prevents commit endpoint hammering.
  process.env.GITHUB_TOKEN = 'github_pat_test';
  poller = freshPoller();
  const backoffDb = openDb();
  seedRepo(poller, backoffDb.queries, NOW);
  seedCommits(poller, backoffDb.queries);
  backoffDb.queries.recordGithubCacheFailureRow('commits', NOW, 500, null, null, NOW + 600_000);
  const skippedFetch = makeFakeFetch(() => null);
  await poller.pollEndpoint('commits', backoffDb.queries, skippedFetch.fakeFetch, NOW + 1_000);
  check('commit endpoint inside persistent backoff makes no request', skippedFetch.calls.length === 0);

  for (const holder of [
    happyDb, conditionalDb, dependencyDb, fastDb, pagedDb, atomicDb, wrongHeadDb, authDb, branchDb,
    missingStateDb, laterPageDb, starFastDb, starChangedDb, restrictedDb, tokenlessDb, backoffDb,
    repeatedStarDb,
  ]) holder.db.close();

  delete process.env.GITHUB_TOKEN;
  console.warn = originalWarn;
  console.error = originalError;

  console.log(`\n=== server-github-poller results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})();
