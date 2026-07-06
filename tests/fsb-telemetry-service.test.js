/**
 * Phase 274 / STATS-03 -- FSBTelemetryService structural + behavioural test.
 *
 * Two layers:
 *
 *  1. STATIC asserts on the .ts source file: catches structural drift from
 *     the canonical github-stats.service.ts mirror (BehaviorSubject count,
 *     PLATFORM_ID guard, visibility listener, ETag round-trip, NO rate-limit
 *     branch, NO github.com references, etc.). These are grep-style regex
 *     checks against the source text.
 *
 *  2. CONTRACT harness: a small JS reimplementation of the same polling
 *     state machine that mocks `fetch`, `setInterval`, and `document`. We
 *     drive it through 5 phases (cold start, first fetch, poll cycle,
 *     tab-hidden, tab-visible) and assert the right callbacks fire at the
 *     right times. We do NOT exercise the Angular zone -- that is covered
 *     by the build smoke test in Plan 274-02.
 *
 * Run: node tests/fsb-telemetry-service.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

// =============================================================================
// Layer 1: static asserts on the TypeScript source.
// =============================================================================

console.log('--- fsb-telemetry-service (Layer 1: static structural) ---');

const SERVICE_PATH = path.join(__dirname, '..', 'showcase', 'angular', 'src', 'app', 'core', 'stats', 'fsb-telemetry.service.ts');
const TYPES_PATH = path.join(__dirname, '..', 'showcase', 'angular', 'src', 'app', 'core', 'stats', 'fsb-telemetry.types.ts');

const serviceText = fs.readFileSync(SERVICE_PATH, 'utf8');
const typesText = fs.readFileSync(TYPES_PATH, 'utf8');

// Strip JS-style comments so grep heuristics don't false-positive on jsdoc.
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const serviceCode = stripComments(serviceText);

// ---- service file shape ----
check('service: exports exactly one class FSBTelemetryService',
  /export class FSBTelemetryService\b/.test(serviceText) &&
    (serviceText.match(/export class FSBTelemetryService\b/g) || []).length === 1,
  'expected exactly one class export');

check('service: imports BehaviorSubject from rxjs',
  /import\s*\{[^}]*BehaviorSubject[^}]*\}\s*from\s*'rxjs'/.test(serviceText),
  'no BehaviorSubject import from rxjs');

check('service: imports PLATFORM_ID, inject from @angular/core',
  /import\s*\{[^}]*PLATFORM_ID[^}]*\}\s*from\s*'@angular\/core'/.test(serviceText) &&
  /import\s*\{[^}]*inject[^}]*\}\s*from\s*'@angular\/core'/.test(serviceText),
  '@angular/core imports incomplete');

check('service: imports Injectable from @angular/core',
  /import\s*\{[^}]*Injectable[^}]*\}\s*from\s*'@angular\/core'/.test(serviceText),
  'no Injectable import');

check('service: imports isPlatformBrowser from @angular/common',
  /import\s*\{[^}]*isPlatformBrowser[^}]*\}\s*from\s*'@angular\/common'/.test(serviceText),
  'no isPlatformBrowser import');

check('service: imports DatasetState, FSBTelemetryHeadline, FSBTelemetrySeries from ./fsb-telemetry.types',
  /from\s*'\.\/fsb-telemetry\.types'/.test(serviceText) &&
  /DatasetState/.test(serviceText) &&
  /FSBTelemetryHeadline/.test(serviceText) &&
  /FSBTelemetrySeries/.test(serviceText),
  'types imports missing');

// ---- subject count ----
const bsMatches = serviceCode.match(/new\s+BehaviorSubject<DatasetState</g) || [];
check('service: has EXACTLY 2 BehaviorSubject<DatasetState< occurrences',
  bsMatches.length === 2, `got ${bsMatches.length}`);

check('service: declares headline$ subject',
  /readonly\s+headline\$/.test(serviceCode), 'headline$ missing');
check('service: declares series$ subject',
  /readonly\s+series\$/.test(serviceCode), 'series$ missing');

// ---- platform guard / lifecycle ----
const ipbCount = (serviceCode.match(/isPlatformBrowser\(/g) || []).length;
check('service: isPlatformBrowser used >= 2 times (start + fetchJson at minimum)',
  ipbCount >= 2, `got ${ipbCount}`);

check('service: has POLL_INTERVAL_MS = 5 * 60 * 1000',
  /POLL_INTERVAL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/.test(serviceText),
  'POLL_INTERVAL_MS constant missing or different');

check('service: has visibilitychange listener',
  /addEventListener\(\s*'visibilitychange'/.test(serviceCode),
  'visibilitychange addEventListener missing');

check('service: has removeEventListener visibilitychange in stop()',
  /removeEventListener\(\s*'visibilitychange'/.test(serviceCode),
  'visibilitychange removeEventListener missing');

check('service: clears interval in stop() (clearInterval call)',
  /clearInterval\(/.test(serviceCode),
  'no clearInterval in stop()');

check('service: pauses interval when document.hidden is true',
  /document\.hidden/.test(serviceCode),
  'no document.hidden check');

// ---- ETag round-trip ----
check('service: sends If-None-Match header for ETag round-trip',
  /If-None-Match/.test(serviceText), 'no If-None-Match');
check('service: handles 304 response',
  /\b304\b/.test(serviceText), 'no 304 short-circuit');
check('service: stores etag in etagCache',
  /etagCache\.set\(/.test(serviceCode), 'no etagCache.set call');

// ---- NO github / NO rate-limit branch (this is the key delta) ----
check('service: does NOT reference github.com',
  !/github\.com/i.test(serviceText), 'github.com leaked into mirror');
check('service: does NOT reference OWNER constant',
  !/\bconst\s+OWNER\b/.test(serviceText), 'OWNER constant leaked');
check('service: does NOT reference REPO constant',
  !/\bconst\s+REPO\b/.test(serviceText), 'REPO constant leaked');
check('service: does NOT have X-RateLimit-Remaining branch',
  !/X-RateLimit-Remaining/.test(serviceCode), 'rate-limit branch leaked');
check('service: does NOT call emitRateLimited',
  !/emitRateLimited/.test(serviceCode), 'emitRateLimited leaked');
check('service: does NOT reference vnd.github (GitHub vendor type)',
  !/vnd\.github/.test(serviceText), 'vnd.github leaked');

// ---- endpoint URLs ----
check('service: targets /api/public-stats',
  /\/api\/public-stats/.test(serviceText), 'no /api/public-stats endpoint');
check('service: targets /global endpoint',
  /\/global\b/.test(serviceText), 'no /global endpoint');
check('service: targets /global/series endpoint',
  /\/global\/series/.test(serviceText), 'no /global/series endpoint');

// ---- credentials: omit (defense-in-depth no-cookie) ----
check("service: passes credentials: 'omit' to fetch",
  /credentials:\s*'omit'/.test(serviceCode), "no credentials: 'omit'");

// ---- public surface ----
check('service: has public start() method',
  /^\s*start\(\)\s*:\s*void\s*\{/m.test(serviceText), 'no start() method');
check('service: has public stop() method',
  /^\s*stop\(\)\s*:\s*void\s*\{/m.test(serviceText), 'no stop() method');
check('service: has public refreshAll() method',
  /refreshAll\(\)\s*:\s*Promise/.test(serviceText), 'no refreshAll() method');

// ---- types file shape ----
console.log('\n--- fsb-telemetry-service (Layer 1b: types) ---');
check('types: exports FSBTelemetryHeadline interface',
  /export interface FSBTelemetryHeadline/.test(typesText), 'missing FSBTelemetryHeadline');
check('types: exports FSBTelemetrySeries interface',
  /export interface FSBTelemetrySeries/.test(typesText), 'missing FSBTelemetrySeries');
check('types: exports FSBTelemetrySeriesPoint interface',
  /export interface FSBTelemetrySeriesPoint/.test(typesText), 'missing FSBTelemetrySeriesPoint');
check('types: exports DatasetState type',
  /export type DatasetState/.test(typesText), 'missing DatasetState');

// Headline interface includes the 10 required fields:
const REQUIRED_HEADLINE_FIELDS = [
  'active_users_now', 'active_agents_now', 'active_agents_bucket',
  'total_users', 'total_agents_lifetime', 'tokens_total_lifetime',
  'tokens_24h', 'popular_mcp_clients', 'popular_agents', 'popular_regions',
  'avg_agents_per_user',
];
for (const f of REQUIRED_HEADLINE_FIELDS) {
  check(`types: FSBTelemetryHeadline includes ${f}`,
    new RegExp(`${f}\\s*:`).test(typesText), `${f} field missing`);
}

// Series interface includes the 3 windows:
for (const w of ['d30', 'd90', 'd365']) {
  check(`types: FSBTelemetrySeries includes ${w} window`,
    new RegExp(`${w}\\s*:`).test(typesText), `${w} field missing`);
}

// =============================================================================
// Layer 2: contract harness. JS reimplementation of the polling state machine,
// driven through 5 phases with mocked fetch + document + setInterval.
// =============================================================================

console.log('\n--- fsb-telemetry-service (Layer 2: contract harness) ---');

class FakeFSBTelemetryService {
  constructor(ctx) {
    this.ctx = ctx;
    this.headline = { kind: 'loading' };
    this.series = { kind: 'loading' };
    this.headlineHistory = [];
    this.seriesHistory = [];
    this.etagCache = new Map();
    this.pollHandle = null;
    this.visibilityListener = null;
    this.started = false;
    this.fetchCallCount = 0;
  }

  async fetchJson(url) {
    this.fetchCallCount += 1;
    const cached = this.etagCache.get(url);
    const headers = { Accept: 'application/json' };
    if (cached) headers['If-None-Match'] = cached.etag;
    const response = await this.ctx.fetch(url, { headers, credentials: 'omit' });
    if (response.status === 304 && cached) return cached.body;
    if (!response.ok) throw new Error(`FSB stats ${response.status}`);
    const parsed = await response.json();
    const etag = response.headers.get('etag');
    if (etag) this.etagCache.set(url, { etag, body: parsed, fetchedAt: Date.now() });
    return parsed;
  }

  setHeadline(state) { this.headline = state; this.headlineHistory.push(state); }
  setSeries(state) { this.series = state; this.seriesHistory.push(state); }

  async refreshAll() {
    const [hd, sr] = await Promise.allSettled([
      this.fetchJson('/api/public-stats/global'),
      this.fetchJson('/api/public-stats/global/series'),
    ]);
    if (hd.status === 'fulfilled') this.setHeadline({ kind: 'ready', data: hd.value, fetchedAt: Date.now() });
    else this.setHeadline({ kind: 'error', message: String(hd.reason) });
    if (sr.status === 'fulfilled') this.setSeries({ kind: 'ready', data: sr.value, fetchedAt: Date.now() });
    else this.setSeries({ kind: 'error', message: String(sr.reason) });
  }

  start() {
    if (this.started) return;
    this.started = true;
    void this.refreshAll();
    this.pollHandle = this.ctx.setInterval(() => void this.refreshAll(), this.ctx.POLL_INTERVAL_MS);
    this.visibilityListener = () => {
      if (this.ctx.document.hidden) {
        if (this.pollHandle !== null) { this.ctx.clearInterval(this.pollHandle); this.pollHandle = null; }
      } else if (this.pollHandle === null && this.started) {
        void this.refreshAll();
        this.pollHandle = this.ctx.setInterval(() => void this.refreshAll(), this.ctx.POLL_INTERVAL_MS);
      }
    };
    this.ctx.document.addEventListener('visibilitychange', this.visibilityListener);
  }

  stop() {
    if (this.pollHandle !== null) { this.ctx.clearInterval(this.pollHandle); this.pollHandle = null; }
    if (this.visibilityListener) this.ctx.document.removeEventListener('visibilitychange', this.visibilityListener);
    this.visibilityListener = null;
    this.started = false;
  }
}

function makeCtx() {
  const intervals = [];           // [{id, cb, ms}]
  const listeners = new Map();    // event -> Set<fn>
  let visibilityHidden = false;
  let etagCounter = 0;

  const sentinelBodies = {
    '/api/public-stats/global': {
      active_users_now: 3, active_agents_now: 6, active_agents_bucket: '5-8',
      total_users: 10, total_agents_lifetime: 22, tokens_total_lifetime: 1000, tokens_24h: 100,
      popular_mcp_clients: [], popular_agents: [], avg_agents_per_user: 2.0,
    },
    '/api/public-stats/global/series': { d30: [], d90: [], d365: [] },
  };

  // fetch mock: if If-None-Match matches the stored etag, return 304; else 200 with a fresh etag.
  const responses = new Map();    // url -> {etag, body}
  function mockFetch(url, init = {}) {
    const inm = init.headers && init.headers['If-None-Match'];
    const stored = responses.get(url);
    if (stored && inm === stored.etag) {
      return Promise.resolve({
        ok: false, status: 304,
        headers: { get: (h) => h.toLowerCase() === 'etag' ? stored.etag : null },
        json: () => Promise.resolve(stored.body),
      });
    }
    etagCounter += 1;
    const etag = `"fake-etag-${etagCounter}"`;
    const body = sentinelBodies[url] || { ok: true };
    responses.set(url, { etag, body });
    return Promise.resolve({
      ok: true, status: 200,
      headers: { get: (h) => h.toLowerCase() === 'etag' ? etag : null },
      json: () => Promise.resolve(body),
    });
  }

  function mockSetInterval(cb, ms) {
    const id = intervals.length + 1;
    intervals.push({ id, cb, ms });
    return id;
  }
  function mockClearInterval(id) {
    const idx = intervals.findIndex((x) => x.id === id);
    if (idx !== -1) intervals.splice(idx, 1);
  }

  const document = {
    get hidden() { return visibilityHidden; },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      const s = listeners.get(ev);
      if (s) s.delete(fn);
    },
  };

  function fireVisibility(hidden) {
    visibilityHidden = hidden;
    const s = listeners.get('visibilitychange') || new Set();
    for (const fn of s) fn();
  }

  function tickInterval(id) {
    const x = intervals.find((it) => it.id === id);
    if (x) x.cb();
  }

  return {
    fetch: mockFetch,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
    document,
    POLL_INTERVAL_MS: 5 * 60 * 1000,
    fireVisibility,
    tickInterval,
    intervals,
    responses,
  };
}

async function waitMicro() {
  // Drain microtasks: a single setImmediate + await is enough for our
  // mock fetch chain (Promise.resolve -> .then -> .next() loop).
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

(async function harness() {
  const ctx = makeCtx();
  const svc = new FakeFSBTelemetryService(ctx);

  // Phase 1: cold state.
  check('harness: initial headline state is loading', svc.headline.kind === 'loading',
    `got ${svc.headline.kind}`);
  check('harness: initial series state is loading', svc.series.kind === 'loading',
    `got ${svc.series.kind}`);

  // Phase 2: start() -> immediate fetch.
  svc.start();
  check('harness: start() registers setInterval', ctx.intervals.length === 1,
    `got ${ctx.intervals.length}`);
  check('harness: start() registers visibilitychange listener',
    svc.visibilityListener !== null && svc.visibilityListener !== undefined,
    'no listener stored');
  await waitMicro();
  check('harness: after first refresh, headline.kind === ready',
    svc.headline.kind === 'ready', `got ${svc.headline.kind}`);
  check('harness: after first refresh, series.kind === ready',
    svc.series.kind === 'ready', `got ${svc.series.kind}`);
  check('harness: headline data has expected sentinel',
    svc.headline.kind === 'ready' && svc.headline.data.active_users_now === 3,
    JSON.stringify(svc.headline));
  check('harness: 2 fetch calls fired (one per endpoint)',
    svc.fetchCallCount === 2, `got ${svc.fetchCallCount}`);

  // Phase 3: poll cycle -> ETag round-trip (304 fast path).
  const fetchCountBefore = svc.fetchCallCount;
  ctx.tickInterval(ctx.intervals[0].id);
  await waitMicro();
  check('harness: poll fires 2 more fetch calls',
    svc.fetchCallCount === fetchCountBefore + 2, `got ${svc.fetchCallCount}`);
  // Both responses should be 304 (server returns same etag the client sent).
  // The state should remain `ready` (304 -> reuse cached body).
  check('harness: after 304 round-trip, headline still ready',
    svc.headline.kind === 'ready', `got ${svc.headline.kind}`);
  check('harness: after 304 round-trip, series still ready',
    svc.series.kind === 'ready', `got ${svc.series.kind}`);

  // Phase 4: tab-hidden -> interval cleared.
  ctx.fireVisibility(true);
  check('harness: tab-hidden clears interval',
    ctx.intervals.length === 0, `got ${ctx.intervals.length}`);
  check('harness: tab-hidden sets pollHandle to null',
    svc.pollHandle === null, `got ${svc.pollHandle}`);

  // Phase 5: tab-visible -> immediate refresh + new interval.
  const fetchCountBeforeVis = svc.fetchCallCount;
  ctx.fireVisibility(false);
  check('harness: tab-visible restores interval',
    ctx.intervals.length === 1, `got ${ctx.intervals.length}`);
  check('harness: tab-visible re-stores pollHandle',
    svc.pollHandle !== null, `got ${svc.pollHandle}`);
  await waitMicro();
  check('harness: tab-visible fires immediate refresh (2 more fetches)',
    svc.fetchCallCount === fetchCountBeforeVis + 2, `got ${svc.fetchCallCount}`);

  // Phase 6: stop() -> idempotent teardown.
  svc.stop();
  check('harness: stop() clears interval', ctx.intervals.length === 0,
    `got ${ctx.intervals.length}`);
  check('harness: stop() resets started flag', svc.started === false,
    `got ${svc.started}`);
  // Duplicate stop is harmless.
  svc.stop();
  check('harness: duplicate stop() is safe', ctx.intervals.length === 0,
    `got ${ctx.intervals.length}`);
  // Duplicate start() after stop should re-init.
  svc.start();
  await waitMicro();
  check('harness: re-start() after stop() re-registers interval',
    ctx.intervals.length === 1, `got ${ctx.intervals.length}`);
  svc.stop();

  console.log(`\n=== fsb-telemetry-service results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
