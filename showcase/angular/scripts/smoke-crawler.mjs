#!/usr/bin/env node
// Phase 216 SMOKE-01..03: production-or-local crawler smoke.
// Curls marketing routes under GPTBot UA; curls crawler files; resolves every
// sitemap <loc>. Asserts route-specific titles, canonicals, JSON-LD presence
// (home), Content-Type headers, and llms-full.txt size budget.
//
// Run:
//   npm --prefix showcase/angular run smoke:crawler:local           (local static build)
//   BASE_URL=http://localhost:3217 node scripts/smoke-crawler.mjs   (custom local target)
//   node scripts/smoke-crawler.mjs                                  (production default)
//
// Zero new npm dependencies -- node:fetch is built into Node 18+; no other
// imports required. Exit 0 on full pass; exit 1 with a printed report on any
// failure; exit 2 on fatal (uncaught) errors.

const BASE_URL = (process.env.BASE_URL || 'https://full-selfbrowsing.com').replace(/\/$/, '');
const PROD_HOST = 'https://full-selfbrowsing.com';
const UA = 'GPTBot';

const failures = [];
const passes = [];

function record(passed, label, detail) {
  const entry = { label, detail };
  if (passed) {
    passes.push(entry);
  } else {
    failures.push(entry);
  }
  const tag = passed ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -- ${detail}` : '';
  console.log(`${tag}: ${label}${suffix}`);
}

async function fetchText(url, opts = {}) {
  const headers = { 'User-Agent': opts.ua || UA };
  const res = await fetch(url, { redirect: 'follow', headers });
  const body = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') || '', body };
}

const MARKETING_ASSERTIONS = [
  { path: '/',               titleSubstr: 'Full Self-Browsing', canonical: `${PROD_HOST}` },
  { path: '/about',          titleSubstr: 'About',              canonical: `${PROD_HOST}/about` },
  { path: '/agents',         titleSubstr: 'Agents',             canonical: `${PROD_HOST}/agents` },
  { path: '/support',        titleSubstr: 'Support',            canonical: `${PROD_HOST}/support` },
  { path: '/privacy',        titleSubstr: 'Privacy',            canonical: `${PROD_HOST}/privacy` },
  { path: '/lattice',        titleSubstr: 'Lattice',            canonical: `${PROD_HOST}/lattice` },
  { path: '/phantom-stream', titleSubstr: 'PhantomStream',      canonical: `${PROD_HOST}/phantom-stream` },
  { path: '/prometheus',     titleSubstr: 'Prometheus',         canonical: `${PROD_HOST}/prometheus` },
  { path: '/sitemaps',       titleSubstr: 'Site Maps',          canonical: `${PROD_HOST}/sitemaps` },
];

const EXPECTED_SITEMAP_LOCS = MARKETING_ASSERTIONS.map(({ canonical }) => canonical);

async function checkMarketingRoutes() {
  for (const { path, titleSubstr, canonical } of MARKETING_ASSERTIONS) {
    const url = `${BASE_URL}${path}`;
    let r;
    try {
      r = await fetchText(url);
    } catch (err) {
      record(false, `GET ${path}`, `fetch threw: ${err.message}`);
      continue;
    }
    record(r.status === 200, `GET ${path} -> 200`, `actual ${r.status}`);
    record(/text\/html/i.test(r.contentType), `GET ${path} content-type is text/html`, r.contentType);
    record(r.body.includes(titleSubstr), `GET ${path} body contains title substring "${titleSubstr}"`, '');
    record(r.body.includes(`href="${canonical}"`), `GET ${path} canonical href="${canonical}"`, '');
    record(r.body.includes('<app-root'), `GET ${path} contains <app-root>`, '');
    if (path === '/') {
      record(
        r.body.includes('type="application/ld+json"'),
        'GET / contains JSON-LD <script type="application/ld+json">',
        ''
      );
    }
  }
}

const CRAWLER_FILES = [
  { path: '/robots.txt',    ctMatch: /text\/plain/i,        bodyMustContain: 'User-agent: GPTBot' },
  { path: '/sitemap.xml',   ctMatch: /(application|text)\/xml/i, bodyMustContain: '<urlset' },
  { path: '/llms.txt',      ctMatch: /text\/plain/i,        bodyMustContain: '# FSB (Full Self-Browsing)' },
  { path: '/llms-full.txt', ctMatch: /text\/plain/i,        bodyMustContain: '' },
];

async function checkCrawlerFiles() {
  for (const { path, ctMatch, bodyMustContain } of CRAWLER_FILES) {
    const url = `${BASE_URL}${path}`;
    let r;
    try {
      r = await fetchText(url, { ua: 'curl/7.0' });
    } catch (err) {
      record(false, `GET ${path}`, `fetch threw: ${err.message}`);
      continue;
    }
    record(r.status === 200, `GET ${path} -> 200`, `actual ${r.status}`);
    record(ctMatch.test(r.contentType), `GET ${path} content-type matches ${ctMatch}`, r.contentType);
    record(r.body.length > 0, `GET ${path} body non-empty`, `${r.body.length} chars`);
    if (bodyMustContain) {
      record(r.body.includes(bodyMustContain), `GET ${path} body contains "${bodyMustContain}"`, '');
    }
    if (path === '/llms-full.txt') {
      const bytes = Buffer.byteLength(r.body, 'utf8');
      record(bytes < 256000, `GET ${path} body < 256000 bytes`, `${bytes} bytes`);
    }
  }
}

async function checkSitemapLocs() {
  const url = `${BASE_URL}/sitemap.xml`;
  let r;
  try {
    r = await fetchText(url, { ua: 'curl/7.0' });
  } catch (err) {
    record(false, 'parse sitemap', err.message);
    return;
  }
  if (r.status !== 200) {
    record(false, 'parse sitemap', `sitemap status ${r.status}`);
    return;
  }
  const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const missing = EXPECTED_SITEMAP_LOCS.filter((loc) => !locs.includes(loc));
  const unexpected = locs.filter((loc) => !EXPECTED_SITEMAP_LOCS.includes(loc));
  record(
    locs.length === EXPECTED_SITEMAP_LOCS.length && missing.length === 0 && unexpected.length === 0,
    `sitemap has exact expected <loc> set (${EXPECTED_SITEMAP_LOCS.length} entries)`,
    `actual ${locs.length}; missing ${missing.join(', ') || 'none'}; unexpected ${unexpected.join(', ') || 'none'}`
  );
  for (const loc of locs) {
    // When running locally, rewrite the prod-host URLs in sitemap.xml to BASE_URL
    // so the loc assertions exercise the local server (the sitemap content is
    // canonical production URLs, not request targets).
    const target = BASE_URL === PROD_HOST ? loc : loc.replace(PROD_HOST, BASE_URL);
    let lr;
    try {
      lr = await fetchText(target);
    } catch (err) {
      record(false, `sitemap loc ${loc}`, `fetch threw: ${err.message}`);
      continue;
    }
    record(lr.status === 200, `sitemap loc ${loc} -> 200`, `actual ${lr.status}`);
    record(lr.body.includes('<app-root'), `sitemap loc ${loc} body contains <app-root>`, '');
  }
}

export default async function main() {
  console.log(`[smoke-crawler] BASE_URL=${BASE_URL}`);
  await checkMarketingRoutes();
  await checkCrawlerFiles();
  await checkSitemapLocs();
  console.log('');
  console.log(`[smoke-crawler] passed=${passes.length} failed=${failures.length}`);
  if (failures.length > 0) {
    console.log('[smoke-crawler] FAILURES:');
    for (const f of failures) {
      const suffix = f.detail ? ` (${f.detail})` : '';
      console.log(`  - ${f.label}${suffix}`);
    }
    process.exit(1);
  }
  console.log('[smoke-crawler] all assertions passed');
}

main().catch((err) => {
  console.error('[smoke-crawler] FATAL:', err && err.message ? err.message : err);
  process.exit(2);
});
