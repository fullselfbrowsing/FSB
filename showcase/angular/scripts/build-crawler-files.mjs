#!/usr/bin/env node
// Phase 216 prebuild: regenerate sitemap.xml, llms.txt, llms-full.txt, and version.ts.
// Wired via showcase/angular/package.json "prebuild" -- runs automatically before `ng build`.
// Per CRAWL-05: zero new npm dependencies (Node built-ins only).
//
// `--check` (or SITEMAP_LASTMOD_CHECK=1) writes nothing and exits 1 when
// sitemap-lastmod.json or the committed sitemap.xml is out of date.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocalizedMarketingIndex } from './crawler-locale-summaries.mjs';
import { computeRouteHashes, resolveLastmods } from './sitemap-lastmod.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/ is at showcase/angular/scripts; angular root is one level up; repo root is two levels up from there.
const ANGULAR_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(ANGULAR_ROOT, '..', '..');
const PUBLIC_DIR = join(ANGULAR_ROOT, 'public');
const SCRIPTS_DIR = __dirname;
const SERVER_ROUTES_PATH = join(ANGULAR_ROOT, 'src', 'app', 'app.routes.server.ts');
const SITEMAP_PATH = join(PUBLIC_DIR, 'sitemap.xml');
const LASTMOD_PATH = join(SCRIPTS_DIR, 'sitemap-lastmod.json');

const CHECK_ONLY = process.argv.includes('--check') || process.env.SITEMAP_LASTMOD_CHECK === '1';
// A CI checkout is thrown away, so a stale entry is reported there, not rewritten.
const IN_CI = Boolean(process.env.CI) && process.env.CI !== '0' && process.env.CI !== 'false';
const REGENERATE_HINT = 'run `node scripts/build-crawler-files.mjs` in showcase/angular, then commit scripts/sitemap-lastmod.json and public/sitemap.xml';

const HOST = 'https://full-selfbrowsing.com';
const TRAILER_VIDEO = JSON.parse(readFileSync(
  join(ANGULAR_ROOT, 'src', 'app', 'core', 'seo', 'trailer-video.json'), 'utf8'
));
// PRE-03 locked, /dashboard excluded. changefreq/priority hint relative importance
// to crawlers; lastmod is the date the route's content last changed (see
// sitemap-lastmod.mjs).
const ROUTES = [
  { path: '/',               changefreq: 'weekly',  priority: '1.0' },
  { path: '/about',          changefreq: 'weekly',  priority: '0.9' },
  { path: '/agents',         changefreq: 'weekly',  priority: '0.9' },
  { path: '/support',        changefreq: 'monthly', priority: '0.7' },
  { path: '/privacy',        changefreq: 'yearly',  priority: '0.5' },
  { path: '/release-notes',  changefreq: 'weekly',  priority: '0.8' },
  { path: '/lattice',        changefreq: 'weekly',  priority: '0.8' },
  { path: '/concierge',      changefreq: 'weekly',  priority: '0.8' },
  { path: '/phantom-stream', changefreq: 'weekly',  priority: '0.8' },
  { path: '/prometheus',     changefreq: 'weekly',  priority: '0.8' },
  { path: '/sitemaps',       changefreq: 'monthly', priority: '0.6' },
];
const MAX_LLMS_BYTES = 64000;
const MAX_LLMS_FULL_BYTES = 256000;

function normalizeRoutePath(path) {
  if (!path || path === '/') return '/';
  return '/' + String(path).replace(/^\/+/, '');
}

function loadPrerenderRoutePaths() {
  const source = readFileSync(SERVER_ROUTES_PATH, 'utf8');
  const routes = [];
  const routeRe = /\{\s*path:\s*'([^']*)'[\s\S]*?renderMode:\s*RenderMode\.Prerender[\s\S]*?\}/g;
  let match;
  while ((match = routeRe.exec(source)) !== null) {
    const raw = match[1];
    if (!raw.includes('*') && !raw.includes(':')) {
      routes.push(normalizeRoutePath(raw));
    }
  }
  return [...new Set(routes)].sort((a, b) => a.localeCompare(b));
}

function assertSitemapRoutesMatchPrerenderRoutes() {
  const sitemapRoutes = [...new Set(ROUTES.map((route) => normalizeRoutePath(route.path)))]
    .sort((a, b) => a.localeCompare(b));
  const prerenderRoutes = loadPrerenderRoutePaths();

  const missing = prerenderRoutes.filter((route) => !sitemapRoutes.includes(route));
  const extra = sitemapRoutes.filter((route) => !prerenderRoutes.includes(route));
  if (missing.length > 0 || extra.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`missing from sitemap ROUTES: ${missing.join(', ')}`);
    if (extra.length > 0) details.push(`not prerendered in serverRoutes: ${extra.join(', ')}`);
    throw new Error(`sitemap route drift (${details.join('; ')})`);
  }
  console.log(`[build-crawler-files] sitemap route drift check passed (${sitemapRoutes.length} routes)`);
}

function todayIsoDate() {
  // Build date per D-07: ISO 8601 short form YYYY-MM-DD, UTC.
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Locales are read from the shared registry rather than duplicated here, so a
// new locale reaches the sitemap the moment it is declared. Same extraction
// technique verify-locale-sync.mjs uses against the same file.
const LOCALE_CONSTANTS_PATH = join(ANGULAR_ROOT, 'src', 'app', 'core', 'i18n', 'locale-constants.ts');

function readLocaleRegistry() {
  const source = readFileSync(LOCALE_CONSTANTS_PATH, 'utf8');
  const sourceLocale = source.match(/SOURCE_LOCALE\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (!sourceLocale) throw new Error('build-crawler-files: cannot read SOURCE_LOCALE from locale-constants.ts');
  const listMatch = source.match(/LOCALES\s*=\s*\[([^\]]+)\]/);
  if (!listMatch) throw new Error('build-crawler-files: cannot read LOCALES from locale-constants.ts');
  const locales = listMatch[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  const subpathBlock = source.match(/LOCALE_SUBPATHS[^{]*\{([\s\S]*?)\}/);
  if (!subpathBlock) throw new Error('build-crawler-files: cannot read LOCALE_SUBPATHS from locale-constants.ts');
  const subpaths = {};
  for (const m of subpathBlock[1].matchAll(/['"]([\w-]+)['"]\s*:\s*['"]([^'"]*)['"]/g)) {
    subpaths[m[1]] = m[2];
  }
  for (const locale of locales) {
    if (!(locale in subpaths)) throw new Error(`build-crawler-files: LOCALE_SUBPATHS missing ${locale}`);
  }
  return { locales, subpaths, sourceLocale };
}

function localeUrl(subpath, routePath) {
  const prefix = subpath ? `/${subpath}` : '';
  if (routePath === '/') return prefix ? `${HOST}${prefix}` : HOST;
  return `${HOST}${prefix}${routePath}`;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function localizedTrailerCopy(locale) {
  if (locale === 'en') return TRAILER_VIDEO;
  const catalog = readFileSync(join(ANGULAR_ROOT, 'src', 'locale', `messages.${locale}.xlf`), 'utf8');
  const readTarget = (id) => {
    const unit = catalog.match(new RegExp(`<trans-unit id="${id.replaceAll('.', '\\.')}"[^>]*>([\\s\\S]*?)</trans-unit>`));
    const target = unit?.[1].match(/<target[^>]*>([\s\S]*?)<\/target>/)?.[1];
    if (!target || target.includes('<x ')) throw new Error(`Missing plain-text video translation: ${locale}/${id}`);
    return target.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity) => {
      if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity];
    });
  };
  return {
    name: readTarget('about.schema.trailer.name'),
    description: readTarget('about.schema.trailer.description'),
  };
}

function readCommittedLastmods() {
  if (!existsSync(LASTMOD_PATH)) return {};
  const committed = JSON.parse(readFileSync(LASTMOD_PATH, 'utf8'));
  if (!committed || typeof committed !== 'object' || Array.isArray(committed)) {
    throw new Error('sitemap-lastmod.json must be an object keyed by route');
  }
  return committed;
}

function resolveSitemapLastmods({ locales, sourceLocale }) {
  const routePaths = ROUTES.map((route) => route.path);
  const hashes = computeRouteHashes({
    angularRoot: ANGULAR_ROOT,
    routePaths,
    // English copy lives in the hashed templates and sources themselves.
    locales: locales.filter((locale) => locale !== sourceLocale),
  });
  return resolveLastmods({ routePaths, hashes, committed: readCommittedLastmods(), today: todayIsoDate() });
}

function describeStale(stale) {
  return stale.map(({ route, reason }) => `  ${route} -- ${reason}`).join('\n');
}

function renderSitemap({ locales, subpaths, sourceLocale }, lastmods) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">');
  for (const route of ROUTES) {
    // Every locale variant is its own <url>, and each carries the full
    // alternate set -- Google requires the reciprocal links on each variant.
    // The variants share the route's lastmod.
    const { lastmod } = lastmods[route.path];
    for (const locale of locales) {
      lines.push('  <url>');
      lines.push(`    <loc>${localeUrl(subpaths[locale], route.path)}</loc>`);
      lines.push(`    <lastmod>${lastmod}</lastmod>`);
      lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
      lines.push(`    <priority>${route.priority}</priority>`);
      for (const alternate of locales) {
        lines.push(`    <xhtml:link rel="alternate" hreflang="${alternate}" href="${localeUrl(subpaths[alternate], route.path)}"/>`);
      }
      lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${localeUrl(subpaths[sourceLocale], route.path)}"/>`);
      if (route.path === '/about') {
        const copy = localizedTrailerCopy(locale);
        lines.push('    <video:video>');
        lines.push(`      <video:thumbnail_loc>${escapeXml(TRAILER_VIDEO.thumbnailUrl)}</video:thumbnail_loc>`);
        lines.push(`      <video:title>${escapeXml(copy.name)}</video:title>`);
        lines.push(`      <video:description>${escapeXml(copy.description)}</video:description>`);
        lines.push(`      <video:player_loc>${escapeXml(TRAILER_VIDEO.embedUrl)}</video:player_loc>`);
        lines.push(`      <video:duration>${TRAILER_VIDEO.durationSeconds}</video:duration>`);
        lines.push(`      <video:publication_date>${TRAILER_VIDEO.uploadDate}</video:publication_date>`);
        lines.push('    </video:video>');
      }
      lines.push('  </url>');
    }
  }
  lines.push('</urlset>');
  lines.push(''); // trailing newline
  return lines.join('\n');
}

function checkSitemapLastmods(stale, sitemap) {
  if (stale.length > 0) {
    console.error(`[build-crawler-files] sitemap-lastmod.json is stale for ${stale.length} route(s):\n${describeStale(stale)}`);
    console.error(`[build-crawler-files] ${REGENERATE_HINT}`);
    process.exit(1);
  }
  if (!existsSync(SITEMAP_PATH) || readFileSync(SITEMAP_PATH, 'utf8') !== sitemap) {
    console.error(`[build-crawler-files] public/sitemap.xml is not what the generator writes; ${REGENERATE_HINT}`);
    process.exit(1);
  }
  console.log(`[build-crawler-files] sitemap lastmod check passed (${ROUTES.length} routes, public/sitemap.xml up to date)`);
}

function writeSitemap(registry, { entries, stale }, sitemap) {
  if (stale.length > 0) {
    console.warn(`[build-crawler-files] sitemap-lastmod.json is stale for ${stale.length} route(s):\n${describeStale(stale)}`);
    if (IN_CI) {
      console.warn(`[build-crawler-files] left as committed under CI; this sitemap dates those routes ${todayIsoDate()}. To refresh, ${REGENERATE_HINT}`);
    } else {
      writeFileSync(LASTMOD_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
      console.warn(`[build-crawler-files] sitemap-lastmod.json rewritten (changed routes dated ${todayIsoDate()}); commit it with public/sitemap.xml`);
    }
  }
  writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
  const newest = Object.values(entries).map((entry) => entry.lastmod).sort().at(-1);
  console.log(`[build-crawler-files] sitemap.xml written (${sitemap.length} bytes, ${ROUTES.length * registry.locales.length} urls, newest lastmod=${newest})`);
}

function copyCrawlerTextFile(sourceName, outputName, maxBytes, localizedIndex) {
  const sourcePath = join(SCRIPTS_DIR, sourceName);
  if (!existsSync(sourcePath)) {
    throw new Error(`${sourceName} not found at ${sourcePath}`);
  }
  const source = readFileSync(sourcePath, 'utf8');
  const header = `<!-- generated ${todayIsoDate()} by build-crawler-files.mjs; edit ${sourceName} -->\n`;
  const body = header + source + (source.endsWith('\n') ? '\n' : '\n\n') + localizedIndex;
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes >= maxBytes) {
    throw new Error(`${outputName} exceeds ${maxBytes} bytes -- trim ${sourceName}`);
  }
  writeFileSync(join(PUBLIC_DIR, outputName), body, 'utf8');
  console.log(`[build-crawler-files] ${outputName} written (${bytes} bytes)`);
}

function copyLlmsFiles(registry) {
  const localizedIndex = buildLocalizedMarketingIndex({
    ...registry,
    host: HOST,
    catalogForLocale: locale => readFileSync(join(ANGULAR_ROOT, 'src', 'locale',
      locale === registry.sourceLocale ? 'messages.xlf' : `messages.${locale}.xlf`), 'utf8'),
  });
  copyCrawlerTextFile('llms.source.md', 'llms.txt', MAX_LLMS_BYTES, localizedIndex);
  copyCrawlerTextFile('llms-full.source.md', 'llms-full.txt', MAX_LLMS_FULL_BYTES, localizedIndex);
}

function writeVersion() {
  // Phase 217 moved manifest.json to extension/manifest.json. Fall back to
  // the legacy root path so older checkouts still build.
  const candidates = [
    join(REPO_ROOT, 'extension', 'manifest.json'),
    join(REPO_ROOT, 'manifest.json'),
  ];
  const manifestPath = candidates.find((p) => existsSync(p));
  if (!manifestPath) {
    throw new Error(`manifest.json not found at any of: ${candidates.join(', ')}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = manifest.version;
  if (typeof version !== 'string' || !version) {
    throw new Error(`manifest.json .version is not a non-empty string: ${JSON.stringify(version)}`);
  }
  const versionTsPath = join(ANGULAR_ROOT, 'src', 'app', 'core', 'seo', 'version.ts');
  const body = [
    '// Generated by scripts/build-crawler-files.mjs from manifest.json -- do not edit by hand.',
    `export const APP_VERSION = '${version}';`,
    '',
  ].join('\n');
  writeFileSync(versionTsPath, body, 'utf8');
  console.log(`[build-crawler-files] version.ts written (APP_VERSION='${version}')`);
}

async function main() {
  assertSitemapRoutesMatchPrerenderRoutes();
  const registry = readLocaleRegistry();
  const lastmods = resolveSitemapLastmods(registry);
  const sitemap = renderSitemap(registry, lastmods.entries);
  if (CHECK_ONLY) {
    checkSitemapLastmods(lastmods.stale, sitemap);
    return;
  }
  writeSitemap(registry, lastmods, sitemap);
  copyLlmsFiles(registry);
  writeVersion();
  console.log('[build-crawler-files] all crawler-file artifacts regenerated');
}

main().catch((err) => {
  console.error('[build-crawler-files] FAILED:', err.message);
  process.exit(1);
});
