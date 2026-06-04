/**
 * Quick task 260516-7l5 -- /api/public-stats/github/:endpoint_id route tests.
 *
 * Mirrors tests/server-public-stats-no-auth.test.js shape (plain Node, no Jest,
 * in-memory better-sqlite3 + raw http.request + check() helper + exit-code).
 *
 * Test cases:
 *   T1: GET /api/public-stats/github/repo-summary with seeded cache row
 *       -> 200 + ETag header + Cache-Control: public, max-age=60 + body match.
 *   T2: Second GET with If-None-Match: <T1-etag> -> 304 empty body, ETag still set.
 *   T3: GET against fresh DB (no row) -> 503 + Retry-After: 60.
 *   T4: GET /api/public-stats/github/not-an-endpoint -> 400 (allowlist rejection).
 *   T5: GET /api/public-stats/github/stars with seeded array -> 200; no Set-Cookie.
 *   T6: Memo rebuild after _resetMemoForTest() reflects updated DB row.
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

const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);

const app = express();
app.use(express.json());
const publicStatsRouter = createPublicStatsRouter(db, queries);
app.use('/api/public-stats', publicStatsRouter);

const server = http.createServer(app).listen(0);
const port = server.address().port;

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function rawGet(path_, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method: 'GET', host: '127.0.0.1', port, path: path_, headers: extraHeaders }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async function main() {
  console.log('--- server-github-cache (quick task 260516-7l5) ---');

  // --- T3 FIRST (before seeding): cache cold -> 503 + Retry-After ---
  const cold = await rawGet('/api/public-stats/github/repo-summary');
  check('T3: cache-cold GET /github/repo-summary -> 503',
    cold.statusCode === 503,
    `got ${cold.statusCode} body=${cold.body.slice(0, 200)}`);
  check('T3: cache-cold response has Retry-After: 60 header',
    cold.headers['retry-after'] === '60',
    `got ${cold.headers['retry-after']}`);
  check('T3: cache-cold response body parses with cache pending shape',
    (() => { try { const j = JSON.parse(cold.body); return j && j.error === 'cache pending' && j.endpoint_id === 'repo-summary'; } catch { return false; } })(),
    `body=${cold.body}`);

  // --- T4: bad endpoint_id -> 400 (still cache cold; allowlist rejection precedes cache lookup) ---
  const bad = await rawGet('/api/public-stats/github/not-an-endpoint');
  check('T4: unknown endpoint_id -> 400',
    bad.statusCode === 400,
    `got ${bad.statusCode}`);

  // --- Seed cache rows now ---
  const seededSummary = { stargazers_count: 66, forks_count: 4, full_name: 'fullselfbrowsing/FSB' };
  queries.upsertGithubCacheRow('repo-summary', JSON.stringify(seededSummary), '"seed-etag-1"', Date.now(), 200, 5000, Math.floor(Date.now() / 1000) + 3600);

  const seededStars = [
    { starred_at: '2026-01-15T10:00:00Z' },
    { starred_at: '2026-02-20T11:00:00Z' },
  ];
  queries.upsertGithubCacheRow('stars', JSON.stringify(seededStars), '"seed-etag-stars"', Date.now(), 200, 5000, Math.floor(Date.now() / 1000) + 3600);

  // Force memo rebuild after seeding (router cached the 503 path on the cold request).
  publicStatsRouter._resetMemoForTest();

  // --- T1: seeded GET -> 200 + ETag + Cache-Control + body match ---
  const t1 = await rawGet('/api/public-stats/github/repo-summary');
  check('T1: seeded GET /github/repo-summary -> 200',
    t1.statusCode === 200,
    `got ${t1.statusCode} body=${t1.body.slice(0, 200)}`);
  check('T1: ETag header present + non-empty',
    typeof t1.headers.etag === 'string' && t1.headers.etag.length > 0,
    `got ${t1.headers.etag}`);
  check('T1: Cache-Control: public, max-age=60',
    t1.headers['cache-control'] === 'public, max-age=60',
    `got ${t1.headers['cache-control']}`);
  check('T1: Content-Type application/json',
    typeof t1.headers['content-type'] === 'string' && t1.headers['content-type'].includes('application/json'),
    `got ${t1.headers['content-type']}`);
  check('T1: body matches seeded payload byte-for-byte',
    t1.body === JSON.stringify(seededSummary),
    `got=${t1.body} expected=${JSON.stringify(seededSummary)}`);

  // --- T2: If-None-Match round-trip -> 304 with empty body ---
  const t2 = await rawGet('/api/public-stats/github/repo-summary', { 'If-None-Match': t1.headers.etag });
  check('T2: If-None-Match round-trip -> 304',
    t2.statusCode === 304,
    `got ${t2.statusCode}`);
  check('T2: 304 has empty body',
    t2.body === '',
    `got body length=${t2.body.length}`);
  check('T2: 304 still includes ETag header',
    t2.headers.etag === t1.headers.etag,
    `got ${t2.headers.etag} expected ${t1.headers.etag}`);

  // --- T5: stars endpoint with seeded array; no Set-Cookie defensive check ---
  const t5 = await rawGet('/api/public-stats/github/stars');
  check('T5: seeded GET /github/stars -> 200',
    t5.statusCode === 200,
    `got ${t5.statusCode}`);
  check('T5: stars body parses to array of length 2',
    (() => { try { const j = JSON.parse(t5.body); return Array.isArray(j) && j.length === 2; } catch { return false; } })(),
    `body=${t5.body}`);
  check('T5: response has NO Set-Cookie header',
    t5.headers['set-cookie'] === undefined,
    `got ${JSON.stringify(t5.headers['set-cookie'])}`);

  // --- T6: memo rebuild after _resetMemoForTest reflects updated DB row ---
  const updatedSummary = { stargazers_count: 99, forks_count: 7, full_name: 'fullselfbrowsing/FSB' };
  queries.upsertGithubCacheRow('repo-summary', JSON.stringify(updatedSummary), '"updated-etag-2"', Date.now(), 200, 5000, Math.floor(Date.now() / 1000) + 3600);
  // Without reset, memo still serves T1 etag/payload.
  publicStatsRouter._resetMemoForTest();
  const t6 = await rawGet('/api/public-stats/github/repo-summary');
  check('T6: after _resetMemoForTest, memo rebuilds from DB',
    t6.statusCode === 200 && t6.body === JSON.stringify(updatedSummary),
    `status=${t6.statusCode} body=${t6.body}`);
  check('T6: new ETag differs from T1 ETag (payload changed)',
    typeof t6.headers.etag === 'string' && t6.headers.etag !== t1.headers.etag,
    `new=${t6.headers.etag} old=${t1.headers.etag}`);

  server.close();
  db.close();

  console.log(`\n=== server-github-cache results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
