/**
 * Quick task 260516-7l5 -- github-poller invariants.
 *
 * Mirrors tests/server-telemetry-housekeeper.test.js pattern (plain Node,
 * in-memory DB, fakeFetch injection, check() helper + exit-code).
 *
 * Test cases:
 *   T1: runGithubPollerTick with fakeFetch returning 200 for all 7 endpoints
 *       -> getGithubCachePayload('repo-summary') returns row with status 200
 *       and the seeded ETag.
 *   T2: Second tick with same canned ETag returning 304 for repo-summary
 *       -> payload UNCHANGED, fetched_at bumped, http_status = 304.
 *   T3: fakeFetch rejects for ONE endpoint -> tick completes without throwing;
 *       other endpoints still upsert.
 *   T4: GITHUB_TOKEN set at module load -> fakeFetch sees Authorization: Bearer header.
 *   T5: GITHUB_TOKEN unset -> fakeFetch headers contain NO Authorization.
 *   T6: Pagination for commits: page 1+2 full, page 3 partial -> upserted row
 *       contains the concatenated 250 elements.
 *   T7: GITHUB_ENDPOINT_IDS contains exactly the 7 expected strings.
 *   T8: Source-grep regression guard -- MAX_PAGES_COMMITS >= 30 so the
 *       commits walk still covers the full repo history (~2300 commits as
 *       of v0.9.66). Invariant migrated from the now-retired
 *       tests/cumulative-commits-aggregator.test.js MAX_PAGES check.
 *
 * Run: node tests/server-github-poller.test.js
 */

'use strict';

const path = require('path');

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));

const SCHEMA_PATH = path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema');
const QUERIES_PATH = path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries');
const POLLER_PATH = path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'github-poller');

const { initializeDatabase } = require(SCHEMA_PATH);
const Queries = require(QUERIES_PATH);

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function makeFakeFetch(canned) {
  const calls = [];
  // Sort by descending prefix length so the most-specific URL key wins (avoids
  // /repos/.../FSB swallowing requests intended for /repos/.../FSB/stargazers).
  const sortedKeys = Object.keys(canned).sort((a, b) => b.length - a.length);
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    const match = sortedKeys.find((k) => url.startsWith(k));
    if (!match) throw new Error(`fakeFetch: no canned response for ${url}`);
    const c = typeof canned[match] === 'function' ? canned[match](url) : canned[match];
    if (c && c.__reject) throw new Error(c.__reject);
    return {
      status: c.status,
      ok: c.status >= 200 && c.status < 300,
      headers: {
        get: (h) => {
          const map = {
            'etag': c.etag,
            'x-ratelimit-remaining': c.rlRemaining,
            'x-ratelimit-reset': c.rlReset,
          };
          return map[h.toLowerCase()] ?? null;
        },
      },
      json: async () => c.body,
      text: async () => JSON.stringify(c.body || ''),
    };
  };
  return { fakeFetch, calls };
}

// Build the 7-endpoint canned response set. For paginated endpoints, page=1
// returns a short array so early-exit kicks in immediately.
function buildSevenEndpointCanned() {
  // Note: keys are URL prefixes; longer/more-specific prefixes must come first so
  // Object.keys(canned).find(...) selects the most specific. The plain
  // /repos/.../FSB (no trailing slash) prefix would otherwise match /FSB/stargazers,
  // so we list the slash-suffixed prefixes first.
  return {
    'https://api.github.com/repos/fullselfbrowsing/FSB/stargazers': { status: 200, body: [{ starred_at: '2026-01-01T00:00:00Z' }], etag: '"stars-1"', rlRemaining: '5000', rlReset: '0' },
    'https://api.github.com/repos/fullselfbrowsing/FSB/issues':     { status: 200, body: [{ created_at: '2026-01-01T00:00:00Z' }], etag: '"issues-1"', rlRemaining: '5000', rlReset: '0' },
    'https://api.github.com/repos/fullselfbrowsing/FSB/forks':      { status: 200, body: [{ created_at: '2026-01-01T00:00:00Z' }], etag: '"forks-1"', rlRemaining: '5000', rlReset: '0' },
    'https://api.github.com/repos/fullselfbrowsing/FSB/pulls':      { status: 200, body: [{ created_at: '2026-01-01T00:00:00Z' }], etag: '"pulls-1"', rlRemaining: '5000', rlReset: '0' },
    'https://api.github.com/repos/fullselfbrowsing/FSB/commits':    { status: 200, body: [{ sha: 'abc123' }], etag: '"commits-1"', rlRemaining: '5000', rlReset: '0' },
    'https://api.github.com/repos/fullselfbrowsing/FSB/releases':   { status: 200, body: [{ published_at: '2026-01-01T00:00:00Z' }], etag: '"releases-1"', rlRemaining: '5000', rlReset: '0' },
    // repo-summary single endpoint: shortest prefix, listed last so the more
    // specific /FSB/<path> prefixes above win when applicable.
    'https://api.github.com/repos/fullselfbrowsing/FSB':            { status: 200, body: { stargazers_count: 66 }, etag: '"repo-summary-1"', rlRemaining: '5000', rlReset: '0' },
  };
}

function freshPoller() {
  delete require.cache[require.resolve(POLLER_PATH)];
  return require(POLLER_PATH);
}

(async function main() {
  console.log('--- server-github-poller (quick task 260516-7l5) ---');

  // Suppress noisy module-level warnings/errors during tests.
  const origErr = console.error;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};

  // Ensure no GITHUB_TOKEN leaks from the environment for T1-T3.
  delete process.env.GITHUB_TOKEN;
  let { runGithubPollerTick, GITHUB_ENDPOINT_IDS, GITHUB_POLL_INTERVAL_MS } = freshPoller();

  // --- T7: allowlist invariants ---
  check('T7: GITHUB_ENDPOINT_IDS.length === 7', GITHUB_ENDPOINT_IDS.length === 7, `got ${GITHUB_ENDPOINT_IDS.length}`);
  const expectedIds = ['repo-summary', 'stars', 'issues', 'forks', 'pulls', 'commits', 'releases'];
  check('T7: GITHUB_ENDPOINT_IDS contains exactly the 7 expected strings',
    expectedIds.every((e) => GITHUB_ENDPOINT_IDS.includes(e)) && GITHUB_ENDPOINT_IDS.every((e) => expectedIds.includes(e)),
    `got ${JSON.stringify(GITHUB_ENDPOINT_IDS)}`);
  check('T7: GITHUB_POLL_INTERVAL_MS === 300000', GITHUB_POLL_INTERVAL_MS === 300000, `got ${GITHUB_POLL_INTERVAL_MS}`);

  // --- T1: full happy path ---
  const db1 = new Database(':memory:');
  initializeDatabase(db1);
  const q1 = new Queries(db1);
  const NOW_T1 = 1700000000000;
  const { fakeFetch: ff1 } = makeFakeFetch(buildSevenEndpointCanned());
  await runGithubPollerTick(db1, q1, ff1, NOW_T1);
  const repoRow1 = q1.getGithubCachePayload('repo-summary');
  check('T1: repo-summary cached after tick', !!repoRow1, `got ${JSON.stringify(repoRow1)}`);
  check('T1: repo-summary.status === 200', repoRow1 && repoRow1.status === 200, `got ${repoRow1 && repoRow1.status}`);
  check('T1: repo-summary payload parseable', (() => { try { JSON.parse(repoRow1.payload); return true; } catch { return false; } })(), `payload=${repoRow1 && repoRow1.payload}`);
  check('T1: repo-summary stores seeded ETag', repoRow1 && repoRow1.etag === '"repo-summary-1"', `got ${repoRow1 && repoRow1.etag}`);
  check('T1: repo-summary fetched_at === NOW_T1', repoRow1 && repoRow1.fetchedAt === NOW_T1, `got ${repoRow1 && repoRow1.fetchedAt}`);
  // Quick sanity: every endpoint_id has a row.
  for (const id of expectedIds) {
    const r = q1.getGithubCachePayload(id);
    check(`T1: endpoint_id '${id}' has a cached row`, !!r, `got null`);
  }

  // --- T2: re-run tick; canned response for repo-summary is now 304 ---
  const cannedT2 = buildSevenEndpointCanned();
  cannedT2['https://api.github.com/repos/fullselfbrowsing/FSB'] = { status: 304, body: undefined, etag: '"repo-summary-1"', rlRemaining: '4999', rlReset: '1' };
  const beforePayload = repoRow1.payload;
  const NOW_T2 = NOW_T1 + 60000;
  const { fakeFetch: ff2 } = makeFakeFetch(cannedT2);
  await runGithubPollerTick(db1, q1, ff2, NOW_T2);
  const repoRow2 = q1.getGithubCachePayload('repo-summary');
  check('T2: 304 path preserves payload_json byte-for-byte',
    repoRow2 && repoRow2.payload === beforePayload,
    `before=${beforePayload} after=${repoRow2 && repoRow2.payload}`);
  check('T2: 304 path bumps fetched_at',
    repoRow2 && repoRow2.fetchedAt === NOW_T2,
    `got ${repoRow2 && repoRow2.fetchedAt} expected ${NOW_T2}`);
  check('T2: 304 path sets http_status = 304',
    repoRow2 && repoRow2.status === 304,
    `got ${repoRow2 && repoRow2.status}`);

  db1.close();

  // --- T3: one endpoint rejects -> other endpoints still upsert; no throw ---
  const db3 = new Database(':memory:');
  initializeDatabase(db3);
  const q3 = new Queries(db3);
  const cannedT3 = buildSevenEndpointCanned();
  cannedT3['https://api.github.com/repos/fullselfbrowsing/FSB/issues'] = { __reject: 'simulated network failure' };
  const { fakeFetch: ff3 } = makeFakeFetch(cannedT3);
  let threwT3 = false;
  try {
    await runGithubPollerTick(db3, q3, ff3, NOW_T1);
  } catch (e) {
    threwT3 = true;
  }
  check('T3: tick does NOT throw when one endpoint rejects', !threwT3, `threw: ${threwT3}`);
  check('T3: failed endpoint (issues) has no cache row', q3.getGithubCachePayload('issues') === null, `got ${JSON.stringify(q3.getGithubCachePayload('issues'))}`);
  check('T3: surrounding endpoint (repo-summary) still cached', q3.getGithubCachePayload('repo-summary') !== null, `got null`);
  check('T3: surrounding endpoint (commits) still cached', q3.getGithubCachePayload('commits') !== null, `got null`);
  db3.close();

  // --- T4: GITHUB_TOKEN set at module load -> Authorization: Bearer present ---
  process.env.GITHUB_TOKEN = 'ghp_test_123';
  const { runGithubPollerTick: tickT4 } = freshPoller();
  const db4 = new Database(':memory:');
  initializeDatabase(db4);
  const q4 = new Queries(db4);
  const { fakeFetch: ff4, calls: callsT4 } = makeFakeFetch(buildSevenEndpointCanned());
  await tickT4(db4, q4, ff4, NOW_T1);
  const sample = callsT4[0];
  check('T4: with GITHUB_TOKEN set, fakeFetch saw at least one call', !!sample, `got ${callsT4.length} calls`);
  check('T4: Authorization header === Bearer ghp_test_123',
    sample && sample.opts && sample.opts.headers && sample.opts.headers['Authorization'] === 'Bearer ghp_test_123',
    `got ${sample && sample.opts && sample.opts.headers && sample.opts.headers['Authorization']}`);
  db4.close();

  // --- T5: GITHUB_TOKEN unset at module load -> no Authorization header ---
  delete process.env.GITHUB_TOKEN;
  const { runGithubPollerTick: tickT5 } = freshPoller();
  const db5 = new Database(':memory:');
  initializeDatabase(db5);
  const q5 = new Queries(db5);
  const { fakeFetch: ff5, calls: callsT5 } = makeFakeFetch(buildSevenEndpointCanned());
  await tickT5(db5, q5, ff5, NOW_T1);
  const sample5 = callsT5[0];
  check('T5: without GITHUB_TOKEN, no Authorization header is sent',
    sample5 && sample5.opts && sample5.opts.headers && !('Authorization' in sample5.opts.headers),
    `got ${sample5 && sample5.opts && sample5.opts.headers && sample5.opts.headers['Authorization']}`);
  db5.close();

  // --- T6: pagination for commits across 3 pages ---
  const db6 = new Database(':memory:');
  initializeDatabase(db6);
  const q6 = new Queries(db6);
  const page1 = Array.from({ length: 100 }, (_, i) => ({ sha: `p1-${i}` }));
  const page2 = Array.from({ length: 100 }, (_, i) => ({ sha: `p2-${i}` }));
  const page3 = Array.from({ length: 50 }, (_, i) => ({ sha: `p3-${i}` }));
  const cannedT6 = buildSevenEndpointCanned();
  // commits: dynamic per-page handler. Page query string is `?page=N&per_page=100`.
  cannedT6['https://api.github.com/repos/fullselfbrowsing/FSB/commits'] = (url) => {
    // Match `page=N` exactly via a boundary regex so `page=10` does NOT also match `page=1`.
    const m = url.match(/[?&]page=(\d+)(?:&|$)/);
    const page = m ? Number(m[1]) : 0;
    if (page === 1) return { status: 200, body: page1, etag: '"commits-p1"', rlRemaining: '5000', rlReset: '0' };
    if (page === 2) return { status: 200, body: page2, etag: '"commits-p2"', rlRemaining: '5000', rlReset: '0' };
    if (page === 3) return { status: 200, body: page3, etag: '"commits-p3"', rlRemaining: '5000', rlReset: '0' };
    return { status: 200, body: [], etag: null, rlRemaining: '5000', rlReset: '0' };
  };
  const { fakeFetch: ff6 } = makeFakeFetch(cannedT6);
  const { runGithubPollerTick: tickT6 } = freshPoller();
  await tickT6(db6, q6, ff6, NOW_T1);
  const commitsRow = q6.getGithubCachePayload('commits');
  check('T6: commits cached after multi-page tick', !!commitsRow, `got null`);
  const commitsParsed = commitsRow ? JSON.parse(commitsRow.payload) : null;
  check('T6: commits payload is array of length 250 (100+100+50)',
    Array.isArray(commitsParsed) && commitsParsed.length === 250,
    `got length=${commitsParsed && commitsParsed.length}`);
  check('T6: commits[0].sha === p1-0 (first page first element)',
    commitsParsed && commitsParsed[0] && commitsParsed[0].sha === 'p1-0',
    `got ${commitsParsed && commitsParsed[0] && commitsParsed[0].sha}`);
  check('T6: commits[249].sha === p3-49 (last page last element)',
    commitsParsed && commitsParsed[249] && commitsParsed[249].sha === 'p3-49',
    `got ${commitsParsed && commitsParsed[249] && commitsParsed[249].sha}`);
  db6.close();

  // --- T8: pagination depth invariant (regression guard) ---
  //
  // Source-grep guard that the commits walk still caps at >= 30 pages. The
  // previous client-side guard (tests/cumulative-commits-aggregator.test.js)
  // retired after pagination moved server-side; the invariant lives here now.
  // A silent revert to a smaller ceiling would re-truncate the all-time
  // cumulative-commits chart on /stats.
  const fs = require('fs');
  const pollerSrc = fs.readFileSync(
    path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'github-poller.js'),
    'utf8',
  );
  const maxPagesMatch = pollerSrc.match(/MAX_PAGES_COMMITS\s*=\s*(\d+)/);
  check('T8: MAX_PAGES_COMMITS declared in github-poller.js', !!maxPagesMatch,
    'MAX_PAGES_COMMITS constant not found');
  const maxPages = maxPagesMatch ? Number(maxPagesMatch[1]) : 0;
  check('T8: MAX_PAGES_COMMITS >= 30 (full repo history coverage)',
    maxPages >= 30,
    `MAX_PAGES_COMMITS = ${maxPages}; must be >= 30 so the commits walk covers full history`);

  // Restore console fns.
  console.error = origErr;
  console.warn = origWarn;

  console.log(`\n=== server-github-poller results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
