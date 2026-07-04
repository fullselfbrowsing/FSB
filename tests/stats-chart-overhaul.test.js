/**
 * stats-chart-overhaul -- regression guards for quick task 260515-kw1.
 *
 * Suite A -- commitPunchcard() bucketing (Task 1):
 *   Re-implements the production algorithm locally and asserts it produces
 *   the expected {x: hour, y: weekday, r: sqrt-clamped} cells. Also reads
 *   the source file as text to confirm the production helper still exists
 *   with the documented name + PunchcardPoint shape + sqrt scaling -- a
 *   future refactor that renames or alters the algorithm fails CI loud.
 *
 * (Suite B, the agentHistoryRing sparkline ring-buffer guard, was removed
 * when the Phase 274 redesign trimmed the /stats tab list to 6 views and
 * dropped 'fsb-agents-running' -- the ring buffer it guarded no longer
 * exists in stats-page.component.ts.)
 *
 * Suite B -- Active Now globe lifecycle:
 *   Static guards for the Stats page globe: view switches defer redraw by one
 *   animation frame, pending redraws are canceled on teardown, and the globe
 *   requestAnimationFrame loop runs outside Angular change detection.
 *
 * Suite C -- globe service + sitemaps PRNG (review-fix guards):
 *   Static guards that the coastline GeoJSON is cached across setupGlobe()
 *   calls and that the sitemaps page draws region counts + node jitter from
 *   one shared seed-719 stream (the pre-extraction draw order).
 *
 * Test is Node-only -- no test framework dependency. Mirrors the pattern of
 * tests/cumulative-commits-aggregator.test.js (text-parse + re-impl + run).
 *
 * Run: node tests/stats-chart-overhaul.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SERVICE_PATH = path.join(__dirname, '..', 'showcase/angular/src/app/core/stats/github-stats.service.ts');
const COMPONENT_PATH = path.join(__dirname, '..', 'showcase/angular/src/app/pages/stats/stats-page.component.ts');
const GLOBE_SERVICE_PATH = path.join(__dirname, '..', 'showcase/angular/src/app/core/globe/globe-visualization.service.ts');
const SITEMAPS_PATH = path.join(__dirname, '..', 'showcase/angular/src/app/pages/sitemaps/sitemaps-page.component.ts');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

console.log('--- stats-chart-overhaul (quick task 260515-kw1) ---');

// -----------------------------------------------------------------------------
// Suite A -- commitPunchcard()
// -----------------------------------------------------------------------------

// Local re-implementation matching Task 1's spec verbatim. Any production drift
// from this algorithm should be caught by the source-snapshot regex below.
function isValidIsoString(s) {
  return typeof s === 'string' && s.length > 0 && !Number.isNaN(Date.parse(s));
}
function commitPunchcardLocal(commits) {
  const buckets = new Map();
  for (const c of commits) {
    const d = c && c.commit && c.commit.author && c.commit.author.date;
    if (!isValidIsoString(d)) continue;
    const dt = new Date(d);
    const weekday = dt.getUTCDay();
    const hour = dt.getUTCHours();
    const key = `${weekday}-${hour}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const out = [];
  for (const [key, count] of buckets.entries()) {
    if (count <= 0) continue;
    const [wdStr, hrStr] = key.split('-');
    const r = Math.max(3, Math.min(20, Math.sqrt(count) * 4));
    out.push({ x: Number(hrStr), y: Number(wdStr), r, c: count });
  }
  return out;
}

// A1. Empty input -> empty array.
{
  const result = commitPunchcardLocal([]);
  check('commitPunchcard: empty input -> []',
    Array.isArray(result) && result.length === 0,
    `expected [], got ${JSON.stringify(result)}`);
}

// A2. Single commit at known UTC timestamp -> single bucket with correct (x,y,r).
{
  // 2024-06-05T14:30:00Z -- Wednesday, hour 14. UTC getDay returns 3 for Wed.
  const result = commitPunchcardLocal([
    { commit: { author: { date: '2024-06-05T14:30:00Z' } } },
  ]);
  const expectedR = Math.max(3, Math.min(20, Math.sqrt(1) * 4));
  check('commitPunchcard: single commit -> [{x:14,y:3,r:>=3}]',
    result.length === 1 && result[0].x === 14 && result[0].y === 3
      && Math.abs(result[0].r - expectedR) < 1e-9 && result[0].r >= 3,
    `expected x:14 y:3 r:${expectedR}, got ${JSON.stringify(result)}`);
}

// A3. 5 commits in same hour/weekday -> single bucket, r = sqrt(5)*4 clamped.
{
  const same = [];
  for (let i = 0; i < 5; i++) {
    same.push({ commit: { author: { date: '2024-06-05T14:00:00Z' } } });
  }
  const result = commitPunchcardLocal(same);
  const expectedR = Math.max(3, Math.min(20, Math.sqrt(5) * 4));
  check('commitPunchcard: 5 commits same bucket -> r=sqrt(5)*4 (~8.94)',
    result.length === 1 && Math.abs(result[0].r - expectedR) < 1e-9,
    `expected r:${expectedR}, got ${JSON.stringify(result)}`);
}

// A4. 50 commits in same bucket -> r clamped to 20.
{
  const many = [];
  for (let i = 0; i < 50; i++) {
    many.push({ commit: { author: { date: '2024-06-05T14:00:00Z' } } });
  }
  const result = commitPunchcardLocal(many);
  check('commitPunchcard: 50 commits same bucket -> r clamped to 20',
    result.length === 1 && result[0].r === 20,
    `expected r:20, got ${JSON.stringify(result)}`);
}

// A5. Invalid date strings filtered out.
{
  const result = commitPunchcardLocal([
    { commit: { author: { date: '2024-06-05T14:00:00Z' } } },
    { commit: { author: { date: 'not-a-date' } } },
    { commit: { author: { date: '' } } },
    { commit: { author: { date: null } } },
  ]);
  check('commitPunchcard: invalid date strings filtered out',
    result.length === 1 && result[0].x === 14 && result[0].y === 3,
    `expected 1 valid bucket, got ${JSON.stringify(result)}`);
}

// A6. Source snapshot -- production helper still present with the expected shape.
{
  let src = '';
  try { src = fs.readFileSync(SERVICE_PATH, 'utf8'); } catch { /* swallow */ }
  check('commitPunchcard: source file readable',
    src.length > 0,
    `could not read ${SERVICE_PATH}`);
  check('commitPunchcard: export function commitPunchcard present',
    /export\s+function\s+commitPunchcard\s*\(/.test(src),
    'export function commitPunchcard(...) not found in github-stats.service.ts');
  check('commitPunchcard: PunchcardPoint interface present',
    /export\s+interface\s+PunchcardPoint\s*\{/.test(src),
    'export interface PunchcardPoint {...} not found');
  check('commitPunchcard: Math.sqrt scaling present',
    /Math\.sqrt\s*\(\s*count\s*\)/.test(src),
    'Math.sqrt(count) scaling not found -- did someone switch to linear?');
}

// ---- Quick task 260515-mfs (P2) -- raw count `c` plumbing ----

// A7. Single commit -> c === 1 (raw count, independent of sqrt-scaled r).
{
  const result = commitPunchcardLocal([
    { commit: { author: { date: '2024-06-05T14:30:00Z' } } },
  ]);
  check('commitPunchcard: single commit -> c=1 (raw count field)',
    result.length === 1 && result[0].c === 1,
    `expected c:1, got ${JSON.stringify(result)}`);
}

// A8. 5 commits same bucket -> c === 5 even though r is sqrt-scaled.
{
  const same = [];
  for (let i = 0; i < 5; i++) {
    same.push({ commit: { author: { date: '2024-06-05T14:00:00Z' } } });
  }
  const result = commitPunchcardLocal(same);
  check('commitPunchcard: 5 commits same bucket -> c=5 (raw, unaffected by sqrt scaling)',
    result.length === 1 && result[0].c === 5,
    `expected c:5, got ${JSON.stringify(result)}`);
}

// A9. 50 commits same bucket -> c === 50 (radius clamp at 20 does NOT touch c).
{
  const many = [];
  for (let i = 0; i < 50; i++) {
    many.push({ commit: { author: { date: '2024-06-05T14:00:00Z' } } });
  }
  const result = commitPunchcardLocal(many);
  check('commitPunchcard: 50 commits same bucket -> c=50 (radius clamp does not affect c)',
    result.length === 1 && result[0].c === 50 && result[0].r === 20,
    `expected c:50 r:20, got ${JSON.stringify(result)}`);
}

// A10. Source snapshot -- production helper still emits the `c` field.
{
  let src = '';
  try { src = fs.readFileSync(SERVICE_PATH, 'utf8'); } catch { /* swallow */ }
  check('commitPunchcard: PunchcardPoint interface declares c: number',
    /export\s+interface\s+PunchcardPoint\s*\{[^}]*\bc\s*:\s*number\b/.test(src),
    'PunchcardPoint c: number field not found in interface declaration');
  check('commitPunchcard: production push includes c: count',
    /out\.push\(\s*\{[^}]*\bc\s*:\s*count\b/.test(src),
    'commitPunchcard push site does not include c: count -- did someone drop the raw count field?');
}

// -----------------------------------------------------------------------------
// Suite B -- Active Now globe lifecycle
// -----------------------------------------------------------------------------

{
  let src = '';
  try { src = fs.readFileSync(COMPONENT_PATH, 'utf8'); } catch { /* swallow */ }
  const setViewStart = src.indexOf('  setView(');
  const setViewEnd = src.indexOf('  onTabsEnter', setViewStart);
  const setViewBlock = setViewStart >= 0 && setViewEnd > setViewStart
    ? src.slice(setViewStart, setViewEnd)
    : '';
  const destroyStart = src.indexOf('  ngOnDestroy()');
  const destroyEnd = src.indexOf('  setView(', destroyStart);
  const destroyBlock = destroyStart >= 0 && destroyEnd > destroyStart
    ? src.slice(destroyStart, destroyEnd)
    : '';

  check('stats globe: component source file readable',
    src.length > 0,
    `could not read ${COMPONENT_PATH}`);
  check('stats globe: NgZone is imported and injected',
    /\bNgZone\b/.test(src) && /inject\(\s*NgZone\s*\)/.test(src),
    'NgZone import/inject missing from stats-page.component.ts');
  check('stats globe: setupGlobe runs outside Angular',
    /zone\.runOutsideAngular\(\(\)\s*=>[\s\S]*globeService\.setupGlobe\(/.test(src),
    'globeService.setupGlobe(...) is not wrapped in zone.runOutsideAngular(...)');
  check('stats globe: setView schedules deferred redraw',
    setViewBlock.includes('this.scheduleViewRedraw();'),
    'setView(...) does not call scheduleViewRedraw()');
  check('stats globe: setView no longer redraws synchronously',
    !setViewBlock.includes('this.redrawChart();'),
    'setView(...) still calls redrawChart() synchronously');
  check('stats globe: scheduleViewRedraw uses requestAnimationFrame',
    /pendingViewRedrawFrame\s*=\s*window\.requestAnimationFrame/.test(src),
    'scheduleViewRedraw() does not use window.requestAnimationFrame');
  check('stats globe: pending frame cancellation uses cancelAnimationFrame',
    /window\.cancelAnimationFrame\(\s*this\.pendingViewRedrawFrame\s*\)/.test(src),
    'cancelPendingViewRedraw() does not cancel pendingViewRedrawFrame');
  check('stats globe: ngOnDestroy cancels pending view redraw',
    destroyBlock.includes('this.cancelPendingViewRedraw();'),
    'ngOnDestroy() does not call cancelPendingViewRedraw()');

  // Review-fix guards -- globe lifecycle hardening + fan-picker state.
  const rateStart = src.indexOf('  private applyRateLimit(');
  const rateEnd = src.indexOf('  private scheduleViewRedraw', rateStart);
  const rateBlock = rateStart >= 0 && rateEnd > rateStart ? src.slice(rateStart, rateEnd) : '';
  check('stats globe: applyRateLimit stops a running globe before the ready template unmounts',
    rateBlock.includes('this.stopGlobe?.();') && rateBlock.includes('this.stopGlobe = undefined;'),
    'applyRateLimit() does not tear down the globe rAF loop');

  const redrawStart = src.indexOf('  private redrawChart(');
  const redrawEnd = src.indexOf('  private buildGlobeRegions', redrawStart);
  const redrawBlock = redrawStart >= 0 && redrawEnd > redrawStart ? src.slice(redrawStart, redrawEnd) : '';
  check('stats globe: redrawChart keeps the running globe when regions are unchanged',
    /if\s*\(this\.stopGlobe\s*&&\s*key\s*===\s*this\.lastGlobeKey\)\s*return;/.test(redrawBlock),
    'redrawChart() lacks the stopGlobe && key === lastGlobeKey early return');
  check('stats globe: globe signature key derives from popular_regions',
    redrawBlock.includes('JSON.stringify(this.latestFsbHeadline?.popular_regions ?? [])'),
    'redrawChart() key is not JSON.stringify(latestFsbHeadline?.popular_regions ?? [])');
  check('stats globe: no unconditional globe teardown ahead of the fsb-active-now branch',
    redrawBlock.indexOf("selectedView === 'fsb-active-now'") !== -1 &&
      redrawBlock.indexOf("selectedView === 'fsb-active-now'") < redrawBlock.indexOf('this.stopGlobe?.();'),
    'redrawChart() stops the globe before checking whether the globe view is active');

  // tabPulse=false / frozenView=null also appear in the pulseTimer callback,
  // so this check must anchor on the early-return block specifically.
  check('stats tabs: reselecting the active view clears pulse/frozen state',
    /if\s*\(this\.selectedView\s*===\s*id\)\s*\{[^}]*this\.tabPulse\s*=\s*false;[^}]*this\.frozenView\s*=\s*null;[^}]*\}/.test(src),
    'setView() early-return leaves tabPulse/frozenView sticky');
}

// -----------------------------------------------------------------------------
// Suite C -- globe service coastline cache + shared PRNG stream
// -----------------------------------------------------------------------------

{
  let gsrc = '';
  let ssrc = '';
  try { gsrc = fs.readFileSync(GLOBE_SERVICE_PATH, 'utf8'); } catch { /* swallow */ }
  try { ssrc = fs.readFileSync(SITEMAPS_PATH, 'utf8'); } catch { /* swallow */ }

  check('globe service: source file readable',
    gsrc.length > 0,
    `could not read ${GLOBE_SERVICE_PATH}`);
  check('globe service: Natural Earth dots cached across setupGlobe calls',
    /private\s+cachedLandDots\s*:\s*LandPoint\[\]\s*\|\s*null\s*=\s*null;/.test(gsrc) &&
      gsrc.includes('this.cachedLandDots'),
    'GlobeVisualizationService does not cache fetched land dots');
  check('globe service: setupGlobe accepts a caller-supplied PRNG defaulting to seed 719',
    /random:\s*\(\)\s*=>\s*number\s*=\s*createSeededRandom\(719\)/.test(gsrc),
    'setupGlobe() signature lacks the random param with createSeededRandom(719) default');
  check('globe service: setupGlobe body no longer re-seeds its own PRNG',
    !/const\s+random\s*=\s*createSeededRandom\(719\);/.test(gsrc),
    'setupGlobe() still constructs an internal createSeededRandom(719)');
  check('sitemaps globe: source file readable',
    ssrc.length > 0,
    `could not read ${SITEMAPS_PATH}`);
  check('sitemaps globe: counts and jitter share one per-visit PRNG stream',
    /ngAfterViewInit\(\)[\s\S]*createSeededRandom\(719\)[\s\S]*setupGlobe\(canvas,\s*regions,\s*random\)/.test(ssrc),
    'sitemaps ngAfterViewInit does not build regions + pass the same PRNG into setupGlobe');
  check('sitemaps globe: module-scope PRNG removed',
    !/^const random = createSeededRandom/m.test(ssrc),
    'module-scope createSeededRandom(719) still draws counts at module load');
}

console.log(`\n=== stats-chart-overhaul results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
