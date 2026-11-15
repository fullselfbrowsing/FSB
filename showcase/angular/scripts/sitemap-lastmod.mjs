// Sitemap <lastmod> that moves only when a route's content does.
//
// Each sitemap route has a committed entry in sitemap-lastmod.json holding a
// hash of its content and the date that hash was first seen. A build keeps the
// committed date while the hash still matches and uses the build date once it
// does not. No git: the Docker build has no history to ask.
//
// A route's content is its page directory's templates and component sources
// (styles and specs excluded) plus, per locale, the translations extracted
// from those files. Translations are hashed by unit id and target text, so
// the line numbers a catalog records for each unit can shift freely.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Code-unit order, not localeCompare: the hash must not depend on the ICU data
// of whichever Node version runs the build.
function byKey(key) {
  return (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

/** Route path ('/about') to page directory name ('about'), read from the lazy imports in app.routes.ts. */
export function parseRoutePageDirs(routesSource) {
  const pageDirs = new Map();
  // Other route fields may sit between `path` and `loadComponent`; a brace would start another object.
  const routeRe = /\{\s*path:\s*['"]([^'"]*)['"][^{}]*?\bloadComponent:\s*\(\)\s*=>\s*import\(\s*['"]\.\/pages\/([^/'"]+)\//g;
  for (const match of routesSource.matchAll(routeRe)) {
    pageDirs.set(match[1] ? `/${match[1].replace(/^\/+/, '')}` : '/', match[2]);
  }
  return pageDirs;
}

/** Templates and component sources count as content; styles and specs do not. */
export function isContentFile(name) {
  return (name.endsWith('.html') || name.endsWith('.ts')) && !name.endsWith('.spec.ts');
}

/** Every unit of an XLIFF catalog: its id, target text, and the source files it was extracted from. */
export function parseCatalogUnits(catalog) {
  const units = [];
  for (const match of catalog.matchAll(/<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g)) {
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    units.push({
      id,
      target: match[2].match(/<target\b[^>]*>([\s\S]*?)<\/target>/)?.[1] ?? '',
      files: [...match[2].matchAll(/<context context-type="sourcefile">([^<]*)<\/context>/g)]
        .map((context) => context[1].trim()),
    });
  }
  return units;
}

/** The units of a catalog that were extracted from any of the given source files. */
export function unitsForFiles(units, sourceFiles) {
  const wanted = new Set(sourceFiles);
  return units.filter((unit) => unit.files.some((file) => wanted.has(file)));
}

/**
 * sha256 of one route's content.
 * files: [{ path, content }]; unitsByLocale: [{ locale, units: [{ id, target }] }].
 */
export function hashRouteContent({ files, unitsByLocale }) {
  const hash = createHash('sha256');
  // Length-prefixed so no two different inputs can serialize to the same bytes.
  const add = (...parts) => {
    for (const part of parts) {
      const text = String(part).replace(/\r\n/g, '\n');
      hash.update(`${Buffer.byteLength(text, 'utf8')}:`);
      hash.update(text, 'utf8');
    }
  };
  for (const file of [...files].sort(byKey('path'))) add('file', file.path, file.content);
  for (const { locale, units } of [...unitsByLocale].sort(byKey('locale'))) {
    for (const unit of [...units].sort(byKey('id'))) add('unit', locale, unit.id, unit.target);
  }
  return hash.digest('hex');
}

/**
 * Decide each route's lastmod from its current hash and the committed entries.
 * Returns the entries to publish and the routes whose committed entry no
 * longer describes them.
 */
export function resolveLastmods({ routePaths, hashes, committed = {}, today }) {
  const entries = {};
  const stale = [];
  for (const routePath of routePaths) {
    const hash = hashes[routePath];
    const entry = committed[routePath];
    const wellFormed = Boolean(entry) && typeof entry.hash === 'string' && ISO_DATE.test(entry.lastmod);
    if (wellFormed && entry.hash === hash) {
      entries[routePath] = { hash, lastmod: entry.lastmod };
      continue;
    }
    entries[routePath] = { hash, lastmod: today };
    let reason = `content changed since ${entry?.lastmod}`;
    if (!entry) reason = 'no entry';
    else if (!wellFormed) reason = 'malformed entry';
    stale.push({ route: routePath, reason });
  }
  for (const routePath of Object.keys(committed)) {
    if (!routePaths.includes(routePath)) stale.push({ route: routePath, reason: 'not a sitemap route' });
  }
  return { entries, stale };
}

function listContentFiles(directory) {
  const found = [];
  for (const name of readdirSync(directory).sort()) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) found.push(...listContentFiles(full));
    else if (isContentFile(name)) found.push(full);
  }
  return found;
}

/** Hash every route from the Angular project on disk. Throws when a route has no page directory. */
export function computeRouteHashes({ angularRoot, routePaths, locales }) {
  const pageDirs = parseRoutePageDirs(readFileSync(join(angularRoot, 'src', 'app', 'app.routes.ts'), 'utf8'));
  const catalogs = locales.map((locale) => ({
    locale,
    units: parseCatalogUnits(readFileSync(join(angularRoot, 'src', 'locale', `messages.${locale}.xlf`), 'utf8')),
  }));
  const hashes = {};
  for (const routePath of routePaths) {
    const pageDir = pageDirs.get(routePath);
    if (!pageDir) throw new Error(`sitemap lastmod: ${routePath} has no lazy page import in src/app/app.routes.ts`);
    const directory = join(angularRoot, 'src', 'app', 'pages', pageDir);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(`sitemap lastmod: ${routePath} maps to src/app/pages/${pageDir}, which is not a directory`);
    }
    const files = listContentFiles(directory).map((file) => ({
      // Catalogs name source files relative to the Angular root with forward slashes.
      path: relative(angularRoot, file).split(sep).join('/'),
      content: readFileSync(file, 'utf8'),
    }));
    if (files.length === 0) throw new Error(`sitemap lastmod: src/app/pages/${pageDir} has no template or component source`);
    const sourceFiles = files.map((file) => file.path);
    hashes[routePath] = hashRouteContent({
      files,
      unitsByLocale: catalogs.map(({ locale, units }) => ({ locale, units: unitsForFiles(units, sourceFiles) })),
    });
  }
  return hashes;
}
