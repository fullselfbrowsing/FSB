/**
 * Phase 274 / STATS-05 + STATS-06 -- showcase build + i18n + crawler invariants.
 *
 * Four layers of asserts:
 *
 *   1. SOURCE: messages.xlf contains every FSB Stats message used by the
 *      current page. All 5 non-en messages.{lang}.xlf files have a
 *      <target state="translated"> block for EVERY extracted ID (no missing
 *      translations means the build can pass with i18nMissingTranslation: error).
 *   2. AEO: generated llms files match their sources and carry an explicit
 *      MIT License line with the canonical repository license URL.
 *   3. BUILD: `npm --prefix showcase/angular run build --silent` exits 0
 *      and `npm --prefix showcase/angular run verify:hreflang` exits 0. The
 *      prerendered home, agents, and concierge pages expose the canonical MIT
 *      license URL in SoftwareApplication JSON-LD for English and all 6 locales.
 *   4. CRAWLER INVARIANT (Easter-egg posture): /stats does NOT appear in
 *      prerender-routes.txt, public/sitemap.xml, public/llms.txt, or
 *      public/llms-full.txt. The angular dist/ folder MUST NOT contain a
 *      /stats prerendered page either.
 *
 * BUILD COST: the full Angular production build takes ~10-90 seconds. The
 * test invokes it as a single child process. If the CI runner is slow, set
 * env SKIP_BUILD=1 to skip layer 3 (the i18n + AEO + crawler asserts still run).
 *
 * Run: node tests/showcase-build-smoke.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST_ROOT = path.join(ROOT, 'showcase/dist/showcase-angular/browser');
const LICENSE_URL = 'https://github.com/fullselfbrowsing/FSB/blob/main/LICENSE';
const LICENSE_LINE = `License: [MIT License](${LICENSE_URL}).`;

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function extractJsonLdNodes(html) {
  const nodes = [];
  const parseErrors = [];
  const scriptRe = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    nodes.push(value);
    if (value['@graph']) visit(value['@graph']);
  }

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      visit(JSON.parse(match[1]));
    } catch (err) {
      parseErrors.push(err.message);
    }
  }

  return { nodes, parseErrors };
}

function checkPrerenderedLicenseJsonLd(distRoot) {
  const localeBuilds = [{ label: 'en', directory: '' }]
    .concat(LOCALES.map((locale) => ({ label: locale, directory: locale })));
  const pages = [
    {
      label: 'home',
      directory: '',
      findSoftware: (nodes) => nodes.find((node) =>
        node['@type'] === 'SoftwareApplication' && node.name === 'FSB'),
    },
    {
      label: 'agents',
      directory: 'agents',
      findSoftware: (nodes) => nodes.find((node) =>
        node['@type'] === 'SoftwareApplication'
          && node['@id'] === 'https://full-selfbrowsing.com/agents#fsb-skill'),
    },
    {
      label: 'concierge',
      directory: 'concierge',
      findSoftware: (nodes) => nodes.find((node) =>
        node['@type'] === 'SoftwareApplication'
          && node['@id'] === 'https://full-selfbrowsing.com/concierge#concierge-sdk'),
    },
  ];

  for (const locale of localeBuilds) {
    for (const page of pages) {
      const parts = [distRoot];
      if (locale.directory) parts.push(locale.directory);
      if (page.directory) parts.push(page.directory);
      parts.push('index.html');
      const pagePath = path.join(...parts);
      if (!fs.existsSync(pagePath)) {
        check(`build: ${locale.label} ${page.label} prerender exists`, false, `missing ${pagePath}`);
        continue;
      }

      const html = fs.readFileSync(pagePath, 'utf8');
      const { nodes, parseErrors } = extractJsonLdNodes(html);
      check(`build: ${locale.label} ${page.label} JSON-LD parses`,
        parseErrors.length === 0,
        parseErrors.join('; '));
      const software = page.findSoftware(nodes);
      check(`build: ${locale.label} ${page.label} SoftwareApplication exists`,
        Boolean(software),
        'expected SoftwareApplication node not found');
      check(`build: ${locale.label} ${page.label} license URL is canonical`,
        software?.license === LICENSE_URL,
        software ? `actual ${software.license || '(missing)'}` : 'SoftwareApplication node not found');
    }
  }
}

console.log('--- showcase-build-smoke (STATS-05 + STATS-06) ---');

// =============================================================================
// Layer 1: i18n source + target trans-unit parity.
// =============================================================================

const SOURCE_XLF_PATH = path.join(ROOT, 'showcase/angular/src/locale/messages.xlf');
const sourceXlf = fs.readFileSync(SOURCE_XLF_PATH, 'utf8');
const homeStylePath = path.join(ROOT, 'showcase/angular/src/app/pages/home/home-page.component.scss');
const homeStyle = fs.readFileSync(homeStylePath, 'utf8');
const RETIRED_STATS_ISSUES_IDS = [
  'stats.view.issues',
  'stats.metric.open',
  'stats.metric.closed',
  'stats.chart.issuesSankey.aria',
  'stats.chart.issuesSankey.opened',
  'stats.chart.issuesSankey.closed',
  'stats.chart.issuesSankey.stillOpen',
];

// Extract every SHOWCASE_STATS_FSB_* id from source.
const sourceIdRe = /<trans-unit id="(SHOWCASE_STATS_FSB_[^"]+)" datatype="html">/g;
const sourceIds = [];
let m;
while ((m = sourceIdRe.exec(sourceXlf)) !== null) {
  sourceIds.push(m[1]);
}

const REQUIRED_SOURCE_IDS = [
  'SHOWCASE_STATS_FSB_CHART_POPULAR_MCP_LEGEND',
  'SHOWCASE_STATS_FSB_CHART_TOKENS_LEGEND',
  'SHOWCASE_STATS_FSB_GLOBE_ANNOTATION',
  'SHOWCASE_STATS_FSB_GLOBE_EMPTY',
  'SHOWCASE_STATS_FSB_HEADLINE_ACTIVE',
  'SHOWCASE_STATS_FSB_HEADLINE_AGENT_DAYS',
  'SHOWCASE_STATS_FSB_HEADLINE_ARIA',
  'SHOWCASE_STATS_FSB_HEADLINE_TOKENS',
  'SHOWCASE_STATS_FSB_HEADLINE_TOTAL',
  'SHOWCASE_STATS_FSB_VIEW_ACTIVE',
  'SHOWCASE_STATS_FSB_VIEW_POPULAR_MCP',
  'SHOWCASE_STATS_FSB_VIEW_TOKENS',
];
const missingSourceIds = REQUIRED_SOURCE_IDS.filter((id) => !sourceIds.includes(id));
check('source: messages.xlf contains every current FSB Stats message',
  missingSourceIds.length === 0, `missing ${missingSourceIds.join(', ')}`);
check('source: retired Issues/Sankey Stats messages are absent',
  RETIRED_STATS_ISSUES_IDS.every((id) => !sourceXlf.includes(`<trans-unit id="${id}"`)),
  'one or more retired Issues/Sankey translation units remain');

const heroContentRule = homeStyle.match(/\.hero-content\s*\{([^}]*)\}/);
const heroTitleRules = [...homeStyle.matchAll(/\.hero h1\s*\{([^}]*)\}/g)].map((match) => match[1]);
const localizedHeroTitleRule = heroTitleRules.find((rule) => /overflow-wrap:\s*anywhere/.test(rule));
check('source: hero content is constrained to the viewport width',
  heroContentRule !== null && /width:\s*100%/.test(heroContentRule[1]) && /min-width:\s*0/.test(heroContentRule[1]),
  '.hero-content must have width: 100% and min-width: 0');
check('source: localized mobile hero titles can wrap safely',
  localizedHeroTitleRule !== undefined
    && /white-space:\s*normal/.test(localizedHeroTitleRule)
    && /max-width:\s*100%/.test(localizedHeroTitleRule),
  'mobile .hero h1 must allow wrapping within its content box');
check('source: no hero title rule forces translated text onto one line',
  heroTitleRules.every((rule) => !/white-space:\s*nowrap/.test(rule)),
  'remove white-space: nowrap from .hero h1');

// Each non-en locale must have a <target state="translated"> block for every
// SHOWCASE_STATS_FSB_* id in the source.
const LOCALES = ['es', 'de', 'ja', 'ko', 'zh-CN', 'zh-TW'];
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
  check(`${lang}: retired Issues/Sankey Stats messages are absent`,
    RETIRED_STATS_ISSUES_IDS.every((id) => !targetXlf.includes(`<trans-unit id="${id}"`)),
    'one or more retired Issues/Sankey translation units remain');

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
// Layer 2: AEO crawler-source parity and explicit license metadata.
// =============================================================================

const LLMS_FILE_PAIRS = [
  {
    source: 'showcase/angular/scripts/llms.source.md',
    generated: 'showcase/angular/public/llms.txt',
  },
  {
    source: 'showcase/angular/scripts/llms-full.source.md',
    generated: 'showcase/angular/public/llms-full.txt',
  },
];

for (const pair of LLMS_FILE_PAIRS) {
  const source = fs.readFileSync(path.join(ROOT, pair.source), 'utf8');
  const generated = fs.readFileSync(path.join(ROOT, pair.generated), 'utf8');
  const newlineIndex = generated.indexOf('\n');
  const header = newlineIndex >= 0 ? generated.slice(0, newlineIndex) : generated;
  const generatedBody = newlineIndex >= 0 ? generated.slice(newlineIndex + 1) : '';
  const sourceName = path.basename(pair.source);
  const expectedHeaderEnd = ` by build-crawler-files.mjs; edit ${sourceName} -->`;
  const licenseLineCount = source.split(LICENSE_LINE).length - 1;

  check(`${pair.generated}: keeps its generated header`,
    /^<!-- generated \d{4}-\d{2}-\d{2}/.test(header) && header.endsWith(expectedHeaderEnd),
    `unexpected header: ${header}`);
  check(`${pair.source}: contains one explicit MIT license line`,
    licenseLineCount === 1,
    `found ${licenseLineCount}`);
  check(`${pair.generated}: contains MIT License and canonical URL`,
    generated.includes('MIT License') && generated.includes(LICENSE_URL),
    'explicit MIT license phrase or canonical URL missing');
  check(`${pair.generated}: generated body matches ${pair.source}`,
    generatedBody === source,
    'generated content drifted from its source');
}

// =============================================================================
// Layer 3: build + verify:hreflang + prerendered license JSON-LD.
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
  if (buildResult.status === 0) {
    checkPrerenderedLicenseJsonLd(DIST_ROOT);
  }

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
// Layer 4: crawler invariant (/stats Easter-egg posture).
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
// build was just run (Layer 3 ran).
if (!SKIP_BUILD) {
  const statsPath = path.join(DIST_ROOT, 'stats');
  const statsIndexPath = path.join(DIST_ROOT, 'stats', 'index.html');
  const csrShellPath = path.join(DIST_ROOT, 'index.csr.html');
  check('showcase dist/ has NO /stats prerendered directory',
    !fs.existsSync(statsPath),
    `found at ${statsPath}`);
  check('showcase dist/ has NO /stats/index.html',
    !fs.existsSync(statsIndexPath),
    `found at ${statsIndexPath}`);
  check('showcase dist/ includes the dedicated CSR shell',
    fs.existsSync(csrShellPath),
    `missing ${csrShellPath}`);
  if (fs.existsSync(csrShellPath)) {
    const csrShell = fs.readFileSync(csrShellPath, 'utf8');
    check('CSR shell does not embed the prerendered Home component',
      !csrShell.includes('<app-home-page'),
      'index.csr.html contains prerendered Home markup');
  }
}

console.log(`\n=== showcase-build-smoke results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
