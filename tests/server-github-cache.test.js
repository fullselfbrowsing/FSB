/**
 * Public GitHub cache route and legacy migration tests.
 *
 * Run: node tests/server-github-cache.test.js
 */
'use strict';

const path = require('path');
const http = require('http');

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));
const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const createPublicStatsRouter = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'public-stats'));
const { GITHUB_CACHE_MAX_STALE_MS } = createPublicStatsRouter;

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
    owner: { login: 'must-not-escape' },
  };
}

function commit(sha, date) {
  return {
    sha,
    author: { login: 'commit-author-must-not-escape' },
    commit: {
      author: { name: 'Private Name', email: 'private@example.test', date },
      message: 'large commit body must not escape',
    },
  };
}

function startServer(db, queries) {
  const app = express();
  app.use(express.json());
  const router = createPublicStatsRouter(db, queries);
  app.use('/api/public-stats', router);
  const server = http.createServer(app).listen(0);
  return { server, router, port: server.address().port };
}

function rawGet(port, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      method: 'GET',
      host: '127.0.0.1',
      port,
      path: requestPath,
      headers,
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

(async function main() {
  console.log('--- server-github-cache ---');
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const primary = startServer(db, queries);

  const cold = await rawGet(primary.port, '/api/public-stats/github/repo-summary');
  check('cold cache returns 503', cold.statusCode === 503, `${cold.statusCode} ${cold.body}`);
  check('cold cache returns Retry-After: 60', cold.headers['retry-after'] === '60', cold.headers['retry-after']);
  check('cold cache distinguishes pending data from an unknown endpoint',
    JSON.parse(cold.body).error === 'cache pending', cold.body);

  const unknown = await rawGet(primary.port, '/api/public-stats/github/forks');
  check('removed legacy dataset is rejected by the current allowlist', unknown.statusCode === 400, `${unknown.statusCode}`);

  const now = Date.now();
  queries.upsertGithubCacheRow('repo-summary', JSON.stringify(repoSummary(2)), '"summary"', now, 200, 5000, 0);
  queries.upsertGithubCacheRow('stars', JSON.stringify([
    { starred_at: '2026-07-18T10:00:00Z', user: { login: 'alice' } },
    { starred_at: '2026-07-19T10:00:00Z', user: { login: 'bob' } },
  ]), '"stars"', now, 200, 5000, 0);
  queries.upsertGithubCacheRow('issues', JSON.stringify({
    schema_version: 1,
    total: 2,
    opened_total: 2,
    closed_total: 1,
    open_total: 1,
    as_of: new Date(now).toISOString(),
  }), '"issues"', now, 200, 5000, 0, true, 1);
  queries.upsertGithubCacheRow('commits', JSON.stringify([
    commit('a', new Date(now - 60 * 60 * 1000).toISOString()),
    commit('b', new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString()),
  ]), '"commits"', now, 200, 5000, 0);
  primary.router._resetMemoForTest();

  const summaryResponse = await rawGet(primary.port, '/api/public-stats/github/repo-summary');
  const summaryBody = JSON.parse(summaryResponse.body);
  check('complete summary cache returns 200', summaryResponse.statusCode === 200, summaryResponse.body);
  check('summary response is field-allowlisted',
    summaryBody.stargazers_count === 2 && summaryBody.open_issues_count === 8 &&
      summaryBody.owner === undefined && summaryBody.full_name === undefined,
    summaryResponse.body);
  check('route emits cache check/status metadata for Live-state decisions',
    summaryResponse.headers['x-fsb-stats-cache'] === 'fresh' &&
      summaryResponse.headers['x-fsb-stats-checked-at'] === new Date(now).toISOString() &&
      summaryResponse.headers['x-fsb-stats-upstream-status'] === '200',
    JSON.stringify(summaryResponse.headers));
  check('public route remains anonymous and sets no cookie', summaryResponse.headers['set-cookie'] === undefined);

  const starsResponse = await rawGet(primary.port, '/api/public-stats/github/stars');
  const starsBody = JSON.parse(starsResponse.body);
  check('raw star rows are converted to the v1 aggregate envelope',
    starsResponse.statusCode === 200 && starsBody.schema_version === 1 && starsBody.total === 2 &&
      starsBody.history_complete === true && starsBody.source === 'stargazers',
    starsResponse.body);
  check('star identities never appear in the response',
    !/(alice|bob|"user"|login)/.test(starsResponse.body), starsResponse.body);
  check('aggregate payload as_of is exposed separately from cache checked-at',
    starsResponse.headers['x-fsb-stats-payload-as-of'] === starsBody.as_of &&
      starsResponse.headers['x-fsb-stats-checked-at'] === new Date(now).toISOString(),
    JSON.stringify(starsResponse.headers));

  const issuesResponse = await rawGet(primary.port, '/api/public-stats/github/issues');
  check('retired Issues endpoint returns the existing unknown-endpoint response even when a v1 row exists',
    issuesResponse.statusCode === 400 && JSON.parse(issuesResponse.body).error === 'unknown endpoint_id',
    `${issuesResponse.statusCode} ${issuesResponse.body}`);

  initializeDatabase(db);
  check('database initialization idempotently deletes an already-migrated v1 Issues row',
    queries.getGithubCachePayload('issues') === null,
    JSON.stringify(queries.getGithubCachePayload('issues')));
  initializeDatabase(db);
  check('repeated database initialization leaves the retired Issues cache absent',
    queries.getGithubCachePayload('issues') === null,
    JSON.stringify(queries.getGithubCachePayload('issues')));

  const commitsResponse = await rawGet(primary.port, '/api/public-stats/github/commits');
  const commitsBody = JSON.parse(commitsResponse.body);
  check('commits response is aggregate-only',
    commitsBody.schema_version === 1 && commitsBody.total === 2 && commitsBody.last_30_days === 1 &&
      commitsBody.history_complete === true && commitsBody.history.at(-1).total === 2,
    commitsResponse.body);
  check('commit identity/message/sha fields do not escape',
    !/(Private Name|private@example|large commit|commit-author|"sha")/.test(commitsResponse.body), commitsResponse.body);

  const notModified = await rawGet(primary.port, '/api/public-stats/github/stars', {
    'If-None-Match': starsResponse.headers.etag,
  });
  check('public ETag round-trip returns 304 with empty body',
    notModified.statusCode === 304 && notModified.body === '',
    `${notModified.statusCode} ${notModified.body}`);
  check('304 retains checked-at metadata',
    notModified.headers['x-fsb-stats-checked-at'] === new Date(now).toISOString(),
    JSON.stringify(notModified.headers));

  // A failed refresh preserves and serves the complete LKG while surfacing
  // upstream failure/backoff metadata.
  queries.recordGithubCacheFailureRow('commits', now + 1000, 500, 0, 0, now + 301000);
  primary.router._resetMemoForTest();
  const lkg = await rawGet(primary.port, '/api/public-stats/github/commits');
  check('complete LKG remains available after an upstream failure',
    lkg.statusCode === 200 && lkg.body === commitsResponse.body,
    `${lkg.statusCode} ${lkg.body}`);
  check('LKG exposes latest upstream failure and retry time',
    lkg.headers['x-fsb-stats-upstream-status'] === '500' &&
      lkg.headers['x-fsb-stats-next-retry-at'] === new Date(now + 301000).toISOString(),
    JSON.stringify(lkg.headers));
  check('failed refresh immediately marks LKG stale and reports the actual check time',
    lkg.headers['x-fsb-stats-cache'] === 'stale' &&
      lkg.headers['x-fsb-stats-checked-at'] === new Date(now + 1000).toISOString() &&
      lkg.headers['x-fsb-stats-fetched-at'] === new Date(now).toISOString(),
    JSON.stringify(lkg.headers));

  // Route-time legacy normalization must not let an older repository summary
  // reduce a newer complete stargazer aggregate.
  const orderingDb = new Database(':memory:');
  initializeDatabase(orderingDb);
  const orderingQueries = new Queries(orderingDb);
  orderingQueries.upsertGithubCacheRow('repo-summary', JSON.stringify(repoSummary(2)), '"old-summary"', now - 1000, 200, 5000, 0, true, 1);
  orderingQueries.upsertGithubCacheRow('stars', JSON.stringify({
    schema_version: 1,
    total: 3,
    history: [
      { day_utc: '2026-07-18', total: 1 },
      { day_utc: '2026-07-19', total: 2 },
      { day_utc: '2026-07-20', total: 3 },
    ],
    history_complete: true,
    source: 'stargazers',
    as_of: new Date(now).toISOString(),
  }), '"new-stars"', now, 200, 5000, 0, true, 1);
  const ordering = startServer(orderingDb, orderingQueries);
  const orderedStarsResponse = await rawGet(ordering.port, '/api/public-stats/github/stars');
  const orderedStars = JSON.parse(orderedStarsResponse.body);
  check('older summary cannot override a newer complete star aggregate',
    orderedStarsResponse.statusCode === 200 && orderedStars.total === 3 && orderedStars.source === 'stargazers',
    orderedStarsResponse.body);

  const newerSummaryAt = now + 1;
  orderingQueries.upsertGithubCacheRow(
    'repo-summary',
    JSON.stringify(repoSummary(3)),
    '"newer-count-only-summary"',
    newerSummaryAt,
    200,
    5000,
    0,
    true,
    1
  );
  ordering.router._resetMemoForTest();
  const countOnlyStarsResponse = await rawGet(ordering.port, '/api/public-stats/github/stars');
  const countOnlyStars = JSON.parse(countOnlyStarsResponse.body);
  check('a newer count-only star snapshot downgrades unchanged older history to partial',
    countOnlyStarsResponse.statusCode === 200 && countOnlyStars.total === 3 &&
      countOnlyStars.history_complete === false && countOnlyStars.source === 'repository-count' &&
      countOnlyStars.as_of === new Date(newerSummaryAt).toISOString() &&
      countOnlyStarsResponse.headers['x-fsb-stats-fetched-at'] === new Date(newerSummaryAt).toISOString(),
    `${countOnlyStarsResponse.body} ${JSON.stringify(countOnlyStarsResponse.headers)}`);

  queries.upsertGithubCacheRow('repo-summary', JSON.stringify(repoSummary(2)), null, now - GITHUB_CACHE_MAX_STALE_MS - 1, 200, null, null);
  primary.router._resetMemoForTest();
  const stale = await rawGet(primary.port, '/api/public-stats/github/repo-summary');
  check('cache older than the maximum stale window is withheld',
    stale.statusCode === 503 && JSON.parse(stale.body).error === 'cache stale',
    `${stale.statusCode} ${stale.body}`);

  // Build an actual pre-migration schema and rows, then run the additive
  // migration to prove legacy state is treated as incomplete.
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
    )
  `);
  const insertLegacy = legacyDb.prepare(`
    INSERT INTO github_cache
      (endpoint_id, payload_json, etag, fetched_at, http_status, rate_limit_remaining, rate_limit_reset)
    VALUES (?, ?, ?, ?, 200, 5000, 0)
  `);
  insertLegacy.run('repo-summary', JSON.stringify(repoSummary(2)), '"legacy-summary"', now);
  insertLegacy.run('stars', JSON.stringify([
    { starred_at: '2026-07-18T10:00:00Z', user: { login: 'legacy-alice' } },
    { starred_at: '2026-07-19T10:00:00Z', user: { login: 'legacy-bob' } },
    { starred_at: null, user: { login: 'legacy-null-date' } },
  ]), '"legacy-stars"', now);
  insertLegacy.run('commits', JSON.stringify([
    commit('legacy-a', '2026-07-18T10:00:00Z'),
    commit('legacy-b', '2026-07-19T10:00:00Z'),
    commit('legacy-null-date', null),
  ]), '"legacy-commits"', now);
  insertLegacy.run('issues', JSON.stringify([
    { number: 1, created_at: '2026-07-18T10:00:00Z', closed_at: null, user: { login: 'legacy-user' } },
  ]), '"legacy-issues"', now);
  insertLegacy.run('pulls', JSON.stringify([
    { number: 9, user: { login: 'legacy-retired-user' }, body: 'retired raw body' },
  ]), '"legacy-pulls"', now);
  initializeDatabase(legacyDb);
  const legacyQueries = new Queries(legacyDb);
  const legacy = startServer(legacyDb, legacyQueries);

  const storedLegacyRows = legacyDb.prepare(`
    SELECT endpoint_id, payload_json, etag, is_complete, payload_version
    FROM github_cache
    ORDER BY endpoint_id
  `).all();
  check('migration removes raw GitHub identities from SQLite immediately',
    !/(legacy-alice|legacy-bob|legacy-user|legacy-retired-user|Private Name|private@example|large commit|retired raw body|"user"|"owner")/.test(
      JSON.stringify(storedLegacyRows)
    ),
    JSON.stringify(storedLegacyRows));
  check('migration deletes legacy Issues and retired endpoint rows with no safe partial contract',
    JSON.stringify(storedLegacyRows.map((row) => row.endpoint_id)) ===
      JSON.stringify(['commits', 'repo-summary', 'stars']),
    JSON.stringify(storedLegacyRows));

  for (const endpointId of ['repo-summary', 'stars', 'commits']) {
    const row = legacyQueries.getGithubCachePayload(endpointId);
    check(`migration stores identity-free ${endpointId} v1 data as incomplete with no ETag`,
      row && row.isComplete === false && row.payloadVersion === 1 && row.etag === null,
      JSON.stringify(row));
  }
  const storedLegacySummary = JSON.parse(legacyQueries.getGithubCachePayload('repo-summary').payload);
  const storedLegacyStars = JSON.parse(legacyQueries.getGithubCachePayload('stars').payload);
  const storedLegacyCommits = JSON.parse(legacyQueries.getGithubCachePayload('commits').payload);
  check('migration allowlists the stored repository summary',
    storedLegacySummary.stargazers_count === 2 && storedLegacySummary.owner === undefined &&
      storedLegacySummary.full_name === undefined,
    JSON.stringify(storedLegacySummary));
  check('migration preserves stars only as a partial aggregate',
    storedLegacyStars.schema_version === 1 && storedLegacyStars.total === 2 &&
      storedLegacyStars.history_complete === false && storedLegacyStars.source === 'repository-count' &&
      !JSON.stringify(storedLegacyStars.history).includes('1970-01-01'),
    JSON.stringify(storedLegacyStars));
  check('migration preserves commits only as a partial aggregate',
    storedLegacyCommits.schema_version === 1 && storedLegacyCommits.total === 2 &&
      storedLegacyCommits.history_complete === false && storedLegacyCommits.history.at(-1).total === 2 &&
      !JSON.stringify(storedLegacyCommits.history).includes('1970-01-01'),
    JSON.stringify(storedLegacyCommits));
  check('incomplete legacy ETag is ineligible for a 304 shortcut',
    legacyQueries.getGithubEtag('commits') === null,
    String(legacyQueries.getGithubEtag('commits')));

  const legacyStarsResponse = await rawGet(legacy.port, '/api/public-stats/github/stars');
  const legacyStarsBody = JSON.parse(legacyStarsResponse.body);
  check('legacy raw stars are reduced before response and never inferred complete',
    legacyStarsResponse.statusCode === 200 && legacyStarsBody.total === 2 &&
      legacyStarsBody.history_complete === false && legacyStarsBody.source === 'repository-count',
    legacyStarsResponse.body);
  check('legacy raw star identities never leave the route',
    !/(legacy-alice|legacy-bob|"user"|login)/.test(legacyStarsResponse.body),
    legacyStarsResponse.body);

  const legacyCommitsResponse = await rawGet(legacy.port, '/api/public-stats/github/commits');
  const legacyCommitsBody = JSON.parse(legacyCommitsResponse.body);
  check('legacy raw commits are reduced and explicitly marked history-incomplete',
    legacyCommitsResponse.statusCode === 200 && legacyCommitsBody.total === 2 && legacyCommitsBody.history_complete === false,
    legacyCommitsResponse.body);
  check('legacy commit identities and bulky fields never leave the route',
    !/(Private Name|private@example|large commit|commit-author|"sha")/.test(legacyCommitsResponse.body),
    legacyCommitsResponse.body);

  const legacyIssuesResponse = await rawGet(legacy.port, '/api/public-stats/github/issues');
  check('deleted legacy Issues rows stay retired at the public endpoint',
    legacyIssuesResponse.statusCode === 400 && JSON.parse(legacyIssuesResponse.body).error === 'unknown endpoint_id',
    `${legacyIssuesResponse.statusCode} ${legacyIssuesResponse.body}`);

  await new Promise((resolve) => primary.server.close(resolve));
  await new Promise((resolve) => legacy.server.close(resolve));
  await new Promise((resolve) => ordering.server.close(resolve));
  db.close();
  legacyDb.close();
  orderingDb.close();

  console.log(`\n=== server-github-cache results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})();
