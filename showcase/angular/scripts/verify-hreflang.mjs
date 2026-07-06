#!/usr/bin/env node
// Phase 264 / SEO-01 / VERIFY-01 partial -- Post-build hreflang + canonical asserter.
//
// Walks the prerender output directory and asserts on every emitted index.html:
//   1. Exactly 7 <link rel="alternate"> tags: 6 locales (en, es, de, ja, zh-CN, zh-TW)
//      and 1 with hreflang="x-default" pointing at the en URL.
//   2. Exactly 1 <link rel="canonical"> whose href matches the file's locale + route.
//   3. <html lang="..."> matches the served locale (Angular i18n compiler sets this).
//
// Run after `ng build --localize`:
//   node scripts/verify-hreflang.mjs
//
// Exit 0 on full pass; exit 1 with a printed report on first failure batch.
// Zero new npm dependencies -- regex-based, no jsdom.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const HOST = 'https://full-selfbrowsing.com';
const LOCALES = ['en', 'es', 'de', 'ja', 'zh-CN', 'zh-TW'];
const SOURCE_LOCALE = 'en';
const SERVER_ROUTES_PATH = join(process.cwd(), 'src', 'app', 'app.routes.server.ts');

// Default to the @angular/build:application outputPath in showcase/angular/angular.json.
const DIST_ROOT = process.env.DIST_ROOT
  || join(process.cwd(), '..', 'dist', 'showcase-angular', 'browser');

const failures = [];
const passes = [];

function record(passed, label, detail) {
  const entry = { label, detail };
  if (passed) passes.push(entry); else failures.push(entry);
  const tag = passed ? 'PASS' : 'FAIL';
  const suffix = detail ? ` -- ${detail}` : '';
  console.log(`${tag}: ${label}${suffix}`);
}

function buildLocaleUrl(locale, routePath) {
  const sub = locale === SOURCE_LOCALE ? '' : locale;
  if (routePath === '' || routePath === '/') {
    return sub ? `${HOST}/${sub}` : HOST;
  }
  return sub ? `${HOST}/${sub}${routePath}` : `${HOST}${routePath}`;
}

function loadPrerenderRoutePaths() {
  if (!existsSync(SERVER_ROUTES_PATH)) {
    return ['', '/about', '/agents', '/privacy', '/support'];
  }

  const source = readFileSync(SERVER_ROUTES_PATH, 'utf8');
  const routes = [];
  const routeRe = /\{\s*path:\s*'([^']*)'[\s\S]*?renderMode:\s*RenderMode\.Prerender[\s\S]*?\}/g;
  let match;
  while ((match = routeRe.exec(source)) !== null) {
    const raw = match[1];
    if (!raw || raw === '/') {
      routes.push('');
    } else if (!raw.includes('*') && !raw.includes(':')) {
      routes.push('/' + raw.replace(/^\/+/, ''));
    }
  }
  return [...new Set(routes)].sort((a, b) => a.localeCompare(b));
}

// Given a path like dist/.../browser/es/about/index.html, infer ('es', '/about').
function inferLocaleAndRoute(filePath) {
  const rel = relative(DIST_ROOT, filePath).split(/[\\/]/);
  if (rel[rel.length - 1] !== 'index.html') return null;
  const dirParts = rel.slice(0, -1);
  // dirParts can be []  (en root /), [locale], [route], or [locale, route].
  let locale = SOURCE_LOCALE;
  let routePath = '';
  if (dirParts.length === 0) {
    locale = SOURCE_LOCALE;
    routePath = '';
  } else if (dirParts.length === 1) {
    const head = dirParts[0];
    if (LOCALES.includes(head)) {
      locale = head;
      routePath = '';
    } else {
      // /about/index.html on en
      routePath = '/' + head;
    }
  } else {
    // [locale, route] or [route] with depth > 1 (not expected for marketing)
    if (LOCALES.includes(dirParts[0])) {
      locale = dirParts[0];
      routePath = '/' + dirParts.slice(1).join('/');
    } else {
      routePath = '/' + dirParts.join('/');
    }
  }
  return { locale, routePath };
}

function findIndexHtmlFiles(root) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (entry === 'index.html') out.push(p);
    }
  }
  walk(root);
  return out;
}

function extractAlternates(html) {
  const re = /<link\s+[^>]*rel=["']alternate["'][^>]*>/gi;
  const matches = html.match(re) || [];
  return matches.map((tag) => {
    const hreflang = (tag.match(/hreflang=["']([^"']+)["']/i) || [, ''])[1];
    const href = (tag.match(/href=["']([^"']+)["']/i) || [, ''])[1];
    return { hreflang, href };
  });
}

function extractCanonical(html) {
  const re = /<link\s+[^>]*rel=["']canonical["'][^>]*>/gi;
  const matches = html.match(re) || [];
  return matches.map((tag) => (tag.match(/href=["']([^"']+)["']/i) || [, ''])[1]);
}

function extractHtmlLang(html) {
  const m = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function verifyFile(filePath) {
  const inferred = inferLocaleAndRoute(filePath);
  if (!inferred) {
    record(false, `parse ${relative(DIST_ROOT, filePath)}`, 'could not infer locale + route');
    return;
  }
  const { locale, routePath } = inferred;
  const rel = relative(DIST_ROOT, filePath);
  const html = readFileSync(filePath, 'utf8');

  // 1. Alternates: exactly 7 (6 locales + x-default).
  const alternates = extractAlternates(html);
  if (alternates.length !== 7) {
    record(false, `[${rel}] alternates count`, `expected 7, got ${alternates.length}`);
  } else {
    record(true, `[${rel}] alternates count = 7`);
  }

  // Each locale must appear exactly once with the expected href.
  for (const L of LOCALES) {
    const matches = alternates.filter((a) => a.hreflang === L);
    if (matches.length !== 1) {
      record(false, `[${rel}] hreflang="${L}"`, `expected 1, got ${matches.length}`);
      continue;
    }
    const expected = buildLocaleUrl(L, routePath);
    if (matches[0].href !== expected) {
      record(false, `[${rel}] hreflang="${L}" href`, `expected ${expected}, got ${matches[0].href}`);
    } else {
      record(true, `[${rel}] hreflang="${L}" href = ${expected}`);
    }
  }

  // x-default.
  const xd = alternates.filter((a) => a.hreflang === 'x-default');
  if (xd.length !== 1) {
    record(false, `[${rel}] hreflang="x-default"`, `expected 1, got ${xd.length}`);
  } else {
    const expectedXd = buildLocaleUrl(SOURCE_LOCALE, routePath);
    if (xd[0].href !== expectedXd) {
      record(false, `[${rel}] hreflang="x-default" href`, `expected ${expectedXd}, got ${xd[0].href}`);
    } else {
      record(true, `[${rel}] hreflang="x-default" href = ${expectedXd}`);
    }
  }

  // 2. Canonical: exactly 1.
  const canonicals = extractCanonical(html);
  if (canonicals.length !== 1) {
    record(false, `[${rel}] canonical count`, `expected 1, got ${canonicals.length}`);
  } else {
    const expectedCanonical = buildLocaleUrl(locale, routePath);
    if (canonicals[0] !== expectedCanonical) {
      record(false, `[${rel}] canonical href`, `expected ${expectedCanonical}, got ${canonicals[0]}`);
    } else {
      record(true, `[${rel}] canonical = ${expectedCanonical}`);
    }
  }

  // 3. <html lang>.
  const htmlLang = extractHtmlLang(html);
  if (htmlLang !== locale) {
    record(false, `[${rel}] <html lang>`, `expected "${locale}", got "${htmlLang}"`);
  } else {
    record(true, `[${rel}] <html lang> = "${locale}"`);
  }
}

function main() {
  if (!existsSync(DIST_ROOT)) {
    console.error(`FATAL: DIST_ROOT not found at ${DIST_ROOT}. Run \`ng build --localize\` first.`);
    process.exit(2);
  }

  const files = findIndexHtmlFiles(DIST_ROOT);
  if (files.length === 0) {
    console.error(`FATAL: No index.html files found under ${DIST_ROOT}.`);
    process.exit(2);
  }

  const routePaths = loadPrerenderRoutePaths();
  const expectedCount = LOCALES.length * routePaths.length;
  if (files.length !== expectedCount) {
    record(false, `total index.html count`, `expected ${expectedCount} (${LOCALES.length} locales x ${routePaths.length} prerender routes), got ${files.length}`);
  } else {
    record(true, `total index.html count = ${expectedCount}`);
  }

  for (const f of files) verifyFile(f);

  console.log('');
  console.log(`Summary: ${passes.length} pass, ${failures.length} fail`);
  if (failures.length > 0) {
    console.log('First 10 failures:');
    for (const f of failures.slice(0, 10)) {
      console.log(`  - ${f.label}${f.detail ? ' -- ' + f.detail : ''}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
