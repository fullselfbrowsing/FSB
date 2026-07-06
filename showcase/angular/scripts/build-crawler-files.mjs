#!/usr/bin/env node
// Phase 216 prebuild: regenerate sitemap.xml, llms-full.txt, and version.ts.
// Wired via showcase/angular/package.json "prebuild" -- runs automatically before `ng build`.
// Per CRAWL-05: zero new npm dependencies (node:fs + node:path + node:url only).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/ is at showcase/angular/scripts; angular root is one level up; repo root is two levels up from there.
const ANGULAR_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(ANGULAR_ROOT, '..', '..');
const PUBLIC_DIR = join(ANGULAR_ROOT, 'public');
const SCRIPTS_DIR = __dirname;
const SERVER_ROUTES_PATH = join(ANGULAR_ROOT, 'src', 'app', 'app.routes.server.ts');

const HOST = 'https://full-selfbrowsing.com';
// PRE-03 locked, /dashboard excluded. changefreq/priority hint relative importance
// to crawlers; lastmod is regenerated per build (see generateSitemap).
const ROUTES = [
  { path: '/',               changefreq: 'weekly',  priority: '1.0' },
  { path: '/about',          changefreq: 'weekly',  priority: '0.9' },
  { path: '/agents',         changefreq: 'weekly',  priority: '0.9' },
  { path: '/support',        changefreq: 'monthly', priority: '0.7' },
  { path: '/privacy',        changefreq: 'yearly',  priority: '0.5' },
  { path: '/lattice',        changefreq: 'weekly',  priority: '0.8' },
  { path: '/phantom-stream', changefreq: 'weekly',  priority: '0.8' },
  { path: '/prometheus',     changefreq: 'weekly',  priority: '0.8' },
  { path: '/sitemaps',       changefreq: 'monthly', priority: '0.6' },
];
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
  // Build-date lastmod per D-07: ISO 8601 short form YYYY-MM-DD, UTC.
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateSitemap() {
  const lastmod = todayIsoDate();
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const route of ROUTES) {
    const loc = route.path === '/' ? HOST : `${HOST}${route.path}`;
    lines.push('  <url>');
    lines.push(`    <loc>${loc}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
    lines.push(`    <priority>${route.priority}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  lines.push(''); // trailing newline
  const body = lines.join('\n');
  writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), body, 'utf8');
  console.log(`[build-crawler-files] sitemap.xml written (${body.length} bytes, lastmod=${lastmod})`);
}

function copyLlmsFull() {
  const sourcePath = join(SCRIPTS_DIR, 'llms-full.source.md');
  if (!existsSync(sourcePath)) {
    throw new Error(`llms-full.source.md not found at ${sourcePath} (Plan 01 must commit this file first)`);
  }
  const source = readFileSync(sourcePath, 'utf8');
  const header = `<!-- generated ${todayIsoDate()} by build-crawler-files.mjs; edit llms-full.source.md -->\n`;
  const body = header + source;
  if (Buffer.byteLength(body, 'utf8') >= MAX_LLMS_FULL_BYTES) {
    throw new Error(`llms-full.txt exceeds ${MAX_LLMS_FULL_BYTES} bytes -- trim llms-full.source.md`);
  }
  writeFileSync(join(PUBLIC_DIR, 'llms-full.txt'), body, 'utf8');
  console.log(`[build-crawler-files] llms-full.txt written (${Buffer.byteLength(body, 'utf8')} bytes)`);
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
  generateSitemap();
  copyLlmsFull();
  writeVersion();
  console.log('[build-crawler-files] all crawler-file artifacts regenerated');
}

main().catch((err) => {
  console.error('[build-crawler-files] FAILED:', err.message);
  process.exit(1);
});
