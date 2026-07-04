/**
 * Quick task 260516-7l5 -- 5-min server-side GitHub stats poller.
 *
 * Polls 7 GitHub REST endpoints once per process (NOT per visitor), caches
 * raw JSON in github_cache. ETag round-trips on subsequent ticks return 304s
 * which do NOT count against the rate limit (per GitHub REST docs).
 *
 * Authentication: reads GITHUB_TOKEN once at module load. Works WITH (5000
 * req/hr) and WITHOUT (60 req/hr per-IP). Logs single boot warning if absent.
 *
 * Errors NEVER crash the interval -- mirrors housekeeper.js try/catch posture.
 *
 * Bugfix 2026-05-26 (see .planning/debug/stars-graph-stuck-at-100.md):
 *   The original implementation reused the cached page-1 ETag as an
 *   If-None-Match sentinel for the entire paginated dataset. That is only
 *   correct for endpoints that GitHub sorts newest-first (commits, releases,
 *   pulls, issues default) -- there page 1 mutates whenever anything new
 *   appears, so its ETag is a valid whole-dataset freshness sentinel. For
 *   endpoints sorted oldest-first (stargazers default, `forks?sort=oldest`),
 *   once page 1 fills to 100 entries it becomes immutable forever -- the
 *   ETag freezes and the poller treats every subsequent 304 as "nothing
 *   changed", silently stranding all entries appended past page 1.
 *
 *   The fix opts oldest-first endpoints out of the ETag sentinel via
 *   `oldestFirst: true` in their ENDPOINTS config; those endpoints always
 *   re-walk. Newest-first endpoints keep the ETag round-trip, which is
 *   important for tokenless deployments: GitHub's rate-limit policy doesn't
 *   count 304 responses against the primary limit, so the ETag path is
 *   effectively free and keeps unauthenticated installs (60 req/hr per-IP
 *   cap) viable. Only `stars` and `forks` poll with always-walk semantics --
 *   ~36 req/hr combined at current data shape, comfortably under 60/hr.
 */
'use strict';

const Queries = require('../db/queries');

const GITHUB_POLL_INTERVAL_MS = 5 * 60 * 1000;
const OWNER = 'fullselfbrowsing';
const REPO = 'FSB';
const PER_PAGE = 100;
const MAX_PAGES_COMMITS = 30; // commits walks all pages; everything else early-exits.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;

// 7-endpoint allowlist. The route handler also imports this and rejects any
// :endpoint_id param not in this set with 400.
const GITHUB_ENDPOINT_IDS = [
  'repo-summary', 'stars', 'issues', 'forks', 'pulls', 'commits', 'releases'
];

// Per-endpoint config: path template + query string + Accept override + paginated flag.
// `oldestFirst: true` opts a paginated endpoint out of the page-1 ETag sentinel
// (see module header bugfix note). Newest-first paginated endpoints omit the
// flag and use the ETag round-trip (free 304s under GitHub's rate-limit policy).
const ENDPOINTS = {
  'repo-summary': { path: `/repos/${OWNER}/${REPO}`,            query: '',            accept: null, paginated: false },
  'stars':        { path: `/repos/${OWNER}/${REPO}/stargazers`, query: '',            accept: 'application/vnd.github.v3.star+json', paginated: true,  earlyExit: true, oldestFirst: true },
  'issues':       { path: `/repos/${OWNER}/${REPO}/issues`,     query: 'state=all',   accept: null, paginated: true,  earlyExit: true },
  'forks':        { path: `/repos/${OWNER}/${REPO}/forks`,      query: 'sort=oldest', accept: null, paginated: true,  earlyExit: true, oldestFirst: true },
  'pulls':        { path: `/repos/${OWNER}/${REPO}/pulls`,      query: 'state=all',   accept: null, paginated: true,  earlyExit: true },
  'commits':      { path: `/repos/${OWNER}/${REPO}/commits`,    query: '',            accept: null, paginated: true,  earlyExit: true, maxPages: MAX_PAGES_COMMITS },
  'releases':     { path: `/repos/${OWNER}/${REPO}/releases`,   query: '',            accept: null, paginated: true,  earlyExit: true },
};

let pollerBusy = false;
let tokenWarningLogged = false;

function buildHeaders(accept) {
  const h = {
    'Accept': accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'fsb-showcase-server',
  };
  if (GITHUB_TOKEN) h['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  return h;
}

/**
 * Fetch one URL. Returns {status, body, etag, rlRemaining, rlReset}.
 *  - status 200: body is the parsed JSON (object or array).
 *  - status 304: body is undefined (caller keeps existing cache).
 *  - status other: body is undefined; caller logs + skips.
 */
async function fetchOnePage(url, accept, ifNoneMatch, fetchImpl) {
  const headers = buildHeaders(accept);
  if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
  const res = await fetchImpl(url, { headers });
  const rlRemaining = res.headers.get('x-ratelimit-remaining');
  const rlReset = res.headers.get('x-ratelimit-reset');
  const etag = res.headers.get('etag');
  if (res.status === 304) return { status: 304, body: undefined, etag: ifNoneMatch, rlRemaining, rlReset };
  if (!res.ok) {
    // Drain body to free the socket but don't parse.
    try { await res.text(); } catch { /* ignore */ }
    return { status: res.status, body: undefined, etag: null, rlRemaining, rlReset };
  }
  const body = await res.json();
  return { status: 200, body, etag, rlRemaining, rlReset };
}

/**
 * Poll one endpoint_id and upsert/touch the cache row. Never throws.
 */
async function pollEndpoint(endpointId, queries, fetchImpl, nowMs) {
  try {
    const cfg = ENDPOINTS[endpointId];
    if (!cfg) return;

    if (!cfg.paginated) {
      // Single-resource endpoint (repo-summary). One request, ETag round-trip
      // is safe here because the full resource's representation is exactly
      // what the ETag is computed over -- no pagination wrinkle.
      const existingEtag = queries.getGithubEtag(endpointId);
      const sep = cfg.query ? '?' : '';
      const url = `https://api.github.com${cfg.path}${sep}${cfg.query}`;
      const r = await fetchOnePage(url, cfg.accept, existingEtag, fetchImpl);
      if (r.status === 304) {
        queries.touchGithubCacheRow(endpointId, nowMs, 304, r.rlRemaining, r.rlReset);
        return;
      }
      if (r.status !== 200) {
        console.warn(`[github-poller] ${endpointId} HTTP ${r.status}; skipping cache update`);
        return;
      }
      queries.upsertGithubCacheRow(endpointId, JSON.stringify(r.body), r.etag, nowMs, 200, r.rlRemaining, r.rlReset);
      return;
    }

    // Paginated. Two strategies, picked per endpoint by `oldestFirst`:
    //  - newest-first (default): send the cached page-1 ETag as If-None-Match;
    //    on 304 the whole dataset is unchanged (page 1's contents are a valid
    //    sentinel because new entries land on page 1). Free under GitHub's
    //    rate-limit policy (304 responses don't count) -- this keeps tokenless
    //    deployments viable within the 60 req/hr per-IP cap.
    //  - oldestFirst: true -- opt out of ETag entirely and always re-walk.
    //    Required for stargazers / `forks?sort=oldest` where page 1 freezes
    //    once it fills to 100 entries. See module header bugfix note.
    const useEtagSentinel = !cfg.oldestFirst;
    const existingEtag = useEtagSentinel ? queries.getGithubEtag(endpointId) : null;
    const maxPages = cfg.maxPages || 30;
    const base = `https://api.github.com${cfg.path}`;
    const firstUrl = `${base}?${cfg.query}${cfg.query ? '&' : ''}page=1&per_page=${PER_PAGE}`;

    const firstResp = await fetchOnePage(firstUrl, cfg.accept, existingEtag, fetchImpl);
    if (firstResp.status === 304) {
      // Reachable only for newest-first endpoints (oldestFirst sent null).
      queries.touchGithubCacheRow(endpointId, nowMs, 304, firstResp.rlRemaining, firstResp.rlReset);
      return;
    }
    if (firstResp.status !== 200) {
      console.warn(`[github-poller] ${endpointId} page=1 HTTP ${firstResp.status}; skipping cache update`);
      return;
    }
    if (!Array.isArray(firstResp.body)) {
      console.warn(`[github-poller] ${endpointId} expected array, got ${typeof firstResp.body}; skipping`);
      return;
    }

    const collected = [...firstResp.body];
    const etagToStore = firstResp.etag;
    let lastRlRemaining = firstResp.rlRemaining;
    let lastRlReset = firstResp.rlReset;

    if (cfg.earlyExit && firstResp.body.length < PER_PAGE) {
      // Single page covers it. Done.
    } else {
      for (let page = 2; page <= maxPages; page++) {
        const url = `${base}?${cfg.query}${cfg.query ? '&' : ''}page=${page}&per_page=${PER_PAGE}`;
        // No ETag on inner pages -- once page 1 indicated a change (200) we
        // need the actual bodies of pages 2+ to concatenate. (Per-page ETag
        // round-trips would be valid but add state we don't currently track.)
        const r = await fetchOnePage(url, cfg.accept, null, fetchImpl);
        if (r.status !== 200 || !Array.isArray(r.body)) {
          console.warn(`[github-poller] ${endpointId} page=${page} HTTP ${r.status}; truncating walk`);
          break;
        }
        lastRlRemaining = r.rlRemaining;
        lastRlReset = r.rlReset;
        collected.push(...r.body);
        if (r.body.length < PER_PAGE) break; // last page reached
      }
    }

    queries.upsertGithubCacheRow(
      endpointId,
      JSON.stringify(collected),
      etagToStore,
      nowMs,
      200,
      lastRlRemaining,
      lastRlReset
    );
  } catch (err) {
    console.error(`[github-poller] ${endpointId} tick failed:`, err && err.message ? err.message : err);
  }
}

/**
 * Run a single poll cycle across all 7 endpoints. Never throws. Sequential
 * (not parallel) to keep rate-limit exposure predictable when unauthenticated.
 */
async function runGithubPollerTick(db, queries, fetchImpl, nowMs = Date.now()) {
  if (pollerBusy) {
    console.warn('[github-poller] previous tick still running; skipping this cycle');
    return;
  }
  pollerBusy = true;
  try {
    if (!queries) queries = new Queries(db);
    if (!fetchImpl) fetchImpl = globalThis.fetch;
    for (const id of GITHUB_ENDPOINT_IDS) {
      await pollEndpoint(id, queries, fetchImpl, nowMs);
    }
  } catch (err) {
    console.error('[github-poller] tick fatal:', err && err.message ? err.message : err);
  } finally {
    pollerBusy = false;
  }
}

function startGithubPoller(db) {
  if (!GITHUB_TOKEN && !tokenWarningLogged) {
    console.warn('[github-poller] GITHUB_TOKEN not set; running unauthenticated (60 req/hr per-IP cap). Set the Fly secret to enable 5000/hr.');
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
  GITHUB_POLL_INTERVAL_MS,
  GITHUB_ENDPOINT_IDS,
  ENDPOINTS,
};
