/**
 * Phase 274 / STATS-05 + STATS-06 -- showcase build + i18n + crawler invariants.
 *
 * Three layers of asserts:
 *
 *   1. SOURCE: messages.xlf has >= 12 SHOWCASE_STATS_FSB_* trans-units.
 *      All 5 non-en messages.{lang}.xlf files have a <target state="translated">
 *      block for EVERY new ID (no missing translations means the build can pass
 *      with i18nMissingTranslation: error).
 *   2. BUILD: `npm --prefix showcase/angular run build --silent` exits 0
 *      and `npm --prefix showcase/angular run verify:hreflang` exits 0.
 *   3. CRAWLER INVARIANT (Easter-egg posture): /stats does NOT appear in
 *      prerender-routes.txt, public/sitemap.xml, public/llms.txt, or
 *      public/llms-full.txt. The angular dist/ folder MUST NOT contain a
 *      /stats prerendered page either.
 *
 * BUILD COST: the full Angular production build takes ~10-90 seconds. The
 * test invokes it as a single child process. If the CI runner is slow, set
 * env SKIP_BUILD=1 to skip layer 2 (the i18n + crawler asserts still run).
 *
 * Run: node tests/showcase-build-smoke.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

console.log('--- showcase-build-smoke (STATS-05 + STATS-06) ---');

// =============================================================================
// Layer 1: i18n source + target trans-unit parity.
// =============================================================================

const SOURCE_XLF_PATH = path.join(ROOT, 'showcase/angular/src/locale/messages.xlf');
const sourceXlf = fs.readFileSync(SOURCE_XLF_PATH, 'utf8');

// Extract every SHOWCASE_STATS_FSB_* id from source.
const sourceIdRe = /<trans-unit id="(SHOWCASE_STATS_FSB_[^"]+)" datatype="html">/g;
const sourceIds = [];
let m;
while ((m = sourceIdRe.exec(sourceXlf)) !== null) {
  sourceIds.push(m[1]);
}

check('source: messages.xlf has >= 12 SHOWCASE_STATS_FSB_ trans-units',
  sourceIds.length >= 12, `got ${sourceIds.length}`);

// Each non-en locale must have a <target state="translated"> block for every
// SHOWCASE_STATS_FSB_* id in the source.
const LOCALES = ['es', 'de', 'ja', 'zh-CN', 'zh-TW'];
for (const lang of LOCALES) {
  const targetXlfPath = path.join(ROOT, `showcase/angular/src/locale/messages.${lang}.xlf`);
  if (!fs.existsSync(targetXlfPath)) {
    check(`${lang}: messages.${lang}.xlf exists`, false, `missing file at ${targetXlfPath}`);
    continue;
  }
  const targetXlf = fs.readFileSync(targetXlfPath, 'utf8');

  // Quick sanity: target-language attribute is set.
  check(`${lang}: target-language="${lang}" attribute present`,
    targetXlf.includes(`target-language="${lang}"`), 'attribute missing');

  // For each source id, check the target file has a <trans-unit id="${id}"> AND
  // that the corresponding block contains <target state="translated">.
  for (const id of sourceIds) {
    const blockRe = new RegExp(
      `<trans-unit id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" datatype="html">([\\s\\S]*?)<\\/trans-unit>`
    );
    const blockMatch = targetXlf.match(blockRe);
    if (!blockMatch) {
      check(`${lang}: has trans-unit for ${id}`, false, 'block missing');
      continue;
    }
    check(`${lang}: ${id} has <target state="translated">`,
      /<target state="translated">/.test(blockMatch[1]),
      'no translated target');
  }
}

// =============================================================================
// Layer 2: build + verify:hreflang.
// =============================================================================

const SKIP_BUILD = process.env.SKIP_BUILD === '1';
if (SKIP_BUILD) {
  console.log('  SKIP build (SKIP_BUILD=1)');
} else {
  console.log('  (running `npm --prefix showcase/angular run build` -- may take 30-90 s ...)');
  const buildResult = spawnSync('npm', ['--prefix', 'showcase/angular', 'run', 'build', '--silent'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, CI: '1' },
  });
  const buildErr = (buildResult.stderr ? buildResult.stderr.toString() : '');
  check('npm run build exits 0 (i18nMissingTranslation: error invariant honoured)',
    buildResult.status === 0,
    buildErr.slice(-2000) || `exit ${buildResult.status}, no stderr`);

  // hreflang verification derives the route count from server prerender routes.
  console.log('  (running `npm --prefix showcase/angular run verify:hreflang` ...)');
  const hreflangResult = spawnSync('npm', ['--prefix', 'showcase/angular', 'run', 'verify:hreflang'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, CI: '1' },
  });
  const hreflangOut = (hreflangResult.stdout ? hreflangResult.stdout.toString() : '');
  check('npm run verify:hreflang exits 0 (route count matches prerender config)',
    hreflangResult.status === 0,
    (hreflangResult.stderr ? hreflangResult.stderr.toString().slice(-1000) : 'no stderr')
      + ' | stdout tail: ' + hreflangOut.slice(-500));
}

// =============================================================================
// Layer 3: crawler invariant (/stats Easter-egg posture).
// =============================================================================

const CRAWLER_FILES = [
  'showcase/angular/prerender-routes.txt',
  'showcase/angular/public/sitemap.xml',
  'showcase/angular/public/llms.txt',
  'showcase/angular/public/llms-full.txt',
];
for (const rel of CRAWLER_FILES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    check(`${rel}: file exists (optional)`, true, 'skipped: not present');
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  check(`${rel}: does NOT contain '/stats'`,
    !text.includes('/stats'),
    `'/stats' found in ${rel}`);
}

function normalizeRoutePath(routePath) {
  if (!routePath || routePath === '/') return '/';
  return '/' + String(routePath).replace(/^\/+/, '');
}

function extractRoutesByRenderMode(source, renderMode) {
  const routes = [];
  const routeObjectRe = /\{[\s\S]*?\}/g;
  let match;
  while ((match = routeObjectRe.exec(source)) !== null) {
    const block = match[0];
    const modeRe = new RegExp(`renderMode:\\s*RenderMode\\.${renderMode}`);
    if (!modeRe.test(block)) continue;
    const pathMatch = block.match(/path:\s*'([^']*)'/);
    if (!pathMatch) continue;
    const raw = pathMatch[1];
    if (raw.includes('*') || raw.includes(':')) continue;
    routes.push(normalizeRoutePath(raw));
  }
  return [...new Set(routes)].sort((a, b) => a.localeCompare(b));
}

function extractRouteSet(source, setName) {
  const setMatch = source.match(new RegExp(`const\\s+${setName}\\s*=\\s*new\\s+Set\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\);`));
  if (!setMatch) return null;
  return [...setMatch[1].matchAll(/'([^']+)'/g)]
    .map((m) => normalizeRoutePath(m[1]))
    .sort((a, b) => a.localeCompare(b));
}

const serverRoutesSource = fs.readFileSync(path.join(ROOT, 'showcase/angular/src/app/app.routes.server.ts'), 'utf8');
const showcaseServerSource = fs.readFileSync(path.join(ROOT, 'showcase/server/server.js'), 'utf8');
const prerenderRoutes = extractRoutesByRenderMode(serverRoutesSource, 'Prerender');
const clientRoutes = extractRoutesByRenderMode(serverRoutesSource, 'Client');
const marketingRoutes = extractRouteSet(showcaseServerSource, 'marketingRoutes');
const clientShellRoutes = extractRouteSet(showcaseServerSource, 'clientShellRoutes');
check('source: app.routes.server.ts has prerender routes',
  prerenderRoutes.length > 0,
  'no RenderMode.Prerender routes parsed');
check('source: app.routes.server.ts has client routes',
  clientRoutes.length > 0,
  'no RenderMode.Client routes parsed');
check('source: server.js marketingRoutes set parsed',
  Array.isArray(marketingRoutes),
  'const marketingRoutes = new Set([...]) not found');
check('source: server.js clientShellRoutes set parsed',
  Array.isArray(clientShellRoutes),
  'const clientShellRoutes = new Set([...]) not found');
if (Array.isArray(marketingRoutes) && Array.isArray(clientShellRoutes)) {
  const missingMarketingRoutes = prerenderRoutes.filter((route) => !marketingRoutes.includes(route));
  const clientRoutesPresent = clientRoutes.filter((route) => marketingRoutes.includes(route));
  const missingClientShellRoutes = clientRoutes.filter((route) => !clientShellRoutes.includes(route));
  check('showcase server marketingRoutes covers every prerender route',
    missingMarketingRoutes.length === 0,
    `missing ${missingMarketingRoutes.join(', ') || 'none'}`);
  check('showcase server marketingRoutes excludes client-only routes',
    clientRoutesPresent.length === 0,
    `unexpected ${clientRoutesPresent.join(', ') || 'none'}`);
  check('showcase server clientShellRoutes covers every explicit client route',
    missingClientShellRoutes.length === 0,
    `missing ${missingClientShellRoutes.join(', ') || 'none'}`);
}

// dist/ must not contain a /stats prerendered page either. Only check if a
// build was just run (Layer 2 ran).
if (!SKIP_BUILD) {
  const distRoot = path.join(ROOT, 'showcase/dist/showcase-angular/browser');
  const statsPath = path.join(distRoot, 'stats');
  const statsIndexPath = path.join(distRoot, 'stats', 'index.html');
  check('showcase dist/ has NO /stats prerendered directory',
    !fs.existsSync(statsPath),
    `found at ${statsPath}`);
  check('showcase dist/ has NO /stats/index.html',
    !fs.existsSync(statsIndexPath),
    `found at ${statsIndexPath}`);
}

console.log(`\n=== showcase-build-smoke results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
