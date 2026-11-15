import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  computeRouteHashes,
  hashRouteContent,
  isContentFile,
  parseCatalogUnits,
  parseRoutePageDirs,
  resolveLastmods,
  unitsForFiles,
} from './sitemap-lastmod.mjs';

const TODAY = '2026-12-01';
const ABOUT_HTML = 'src/app/pages/about/about-page.component.html';
const ABOUT_TS = 'src/app/pages/about/about-page.component.ts';
const HOME_HTML = 'src/app/pages/home/home-page.component.html';

const ROUTES_SOURCE = `
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home-page.component').then(m => m.HomePageComponent), data: { depth: 'home' } },
  { path: 'about', loadComponent: () => import('./pages/about/about-page.component').then(m => m.AboutPageComponent) },
  { path: 'release-notes', title: 'Release notes', loadComponent: () => import("./pages/release-notes/release-notes-page.component").then(m => m.ReleaseNotesPageComponent) },
  { path: '**', redirectTo: '' },
];`;

function unit(id, target, locations) {
  const groups = locations.map(([file, line]) => `
        <context-group purpose="location">
          <context context-type="sourcefile">${file}</context>
          <context context-type="linenumber">${line}</context>
        </context-group>`).join('');
  return `
      <trans-unit id="${id}" datatype="html">
        <source>English ${id}</source>
        <target state="translated">${target}</target>${groups}
      </trans-unit>`;
}

function catalog({ aboutTitle = 'Über FSB', aboutLine = '12', homeTitle = 'Start' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2"><file><body>${[
    unit('about.title', aboutTitle, [[ABOUT_HTML, aboutLine]]),
    unit('site.name', 'FSB <x id="INTERPOLATION"/>', [[HOME_HTML, '3'], [ABOUT_TS, '29']]),
    unit('home.title', homeTitle, [[HOME_HTML, '7,8']]),
  ].join('')}
    </body></file></xliff>`;
}

function aboutHash({ html = '<h1 i18n="@@about.title">About FSB</h1>\n', de = catalog() } = {}) {
  const files = [
    { path: ABOUT_HTML, content: html },
    { path: ABOUT_TS, content: 'export class AboutPageComponent {}\n' },
  ];
  return hashRouteContent({
    files,
    unitsByLocale: [{ locale: 'de', units: unitsForFiles(parseCatalogUnits(de), files.map((file) => file.path)) }],
  });
}

function decide(hash, committed) {
  return resolveLastmods({ routePaths: ['/about'], hashes: { '/about': hash }, committed, today: TODAY });
}

test('routes map to the page directories their lazy imports name', () => {
  const pageDirs = parseRoutePageDirs(ROUTES_SOURCE);
  assert.deepEqual([...pageDirs], [['/', 'home'], ['/about', 'about'], ['/release-notes', 'release-notes']]);
});

test('templates and component sources are content; styles and specs are not', () => {
  assert.ok(isContentFile('about-page.component.html'));
  assert.ok(isContentFile('privacy-history-archive.component.ts'));
  assert.ok(!isContentFile('about-page.component.scss'));
  assert.ok(!isContentFile('about-page.component.spec.ts'));
});

test('a route takes the units extracted from its files, wherever else they are also used', () => {
  const units = unitsForFiles(parseCatalogUnits(catalog()), [ABOUT_HTML, ABOUT_TS]);
  assert.deepEqual(units.map((entry) => entry.id), ['about.title', 'site.name']);
  assert.equal(units[1].target, 'FSB <x id="INTERPOLATION"/>');
});

test('unchanged content keeps the committed date', () => {
  const hash = aboutHash();
  const { entries, stale } = decide(hash, { '/about': { hash, lastmod: '2026-10-22' } });
  assert.deepEqual(entries, { '/about': { hash, lastmod: '2026-10-22' } });
  assert.deepEqual(stale, []);
});

test('a changed template moves the date to today', () => {
  const committed = { '/about': { hash: aboutHash(), lastmod: '2026-10-22' } };
  const hash = aboutHash({ html: '<h1 i18n="@@about.title">About the FSB project</h1>\n' });
  const { entries, stale } = decide(hash, committed);
  assert.deepEqual(entries, { '/about': { hash, lastmod: TODAY } });
  assert.deepEqual(stale, [{ route: '/about', reason: 'content changed since 2026-10-22' }]);
});

test('a changed translation of the route moves the date to today', () => {
  const committed = { '/about': { hash: aboutHash(), lastmod: '2026-10-22' } };
  const { entries, stale } = decide(aboutHash({ de: catalog({ aboutTitle: 'Über das FSB-Projekt' }) }), committed);
  assert.equal(entries['/about'].lastmod, TODAY);
  assert.equal(stale.length, 1);
});

test('a catalog whose units only moved to other lines leaves the hash alone', () => {
  assert.equal(aboutHash({ de: catalog({ aboutLine: '480,481' }) }), aboutHash());
  const reordered = catalog().replace(/(\s*<trans-unit id="about\.title"[\s\S]*?<\/trans-unit>)([\s\S]*)(\s*<\/body>)/, '$2$1$3');
  assert.notEqual(reordered, catalog());
  assert.equal(aboutHash({ de: reordered }), aboutHash());
});

test('another page changing its translation leaves the hash alone', () => {
  assert.equal(aboutHash({ de: catalog({ homeTitle: 'Startseite' }) }), aboutHash());
});

test('a route with no committed entry is dated today', () => {
  const hash = aboutHash();
  const { entries, stale } = decide(hash, {});
  assert.deepEqual(entries, { '/about': { hash, lastmod: TODAY } });
  assert.deepEqual(stale, [{ route: '/about', reason: 'no entry' }]);
});

test('malformed and leftover entries are reported rather than trusted', () => {
  const hash = aboutHash();
  const { entries, stale } = decide(hash, {
    '/about': { hash, lastmod: 'yesterday' },
    '/retired': { hash: 'abc', lastmod: '2026-01-01' },
  });
  assert.deepEqual(entries, { '/about': { hash, lastmod: TODAY } });
  assert.deepEqual(stale, [
    { route: '/about', reason: 'malformed entry' },
    { route: '/retired', reason: 'not a sitemap route' },
  ]);
});

test('the same text under a different file, locale or unit id hashes differently', () => {
  const base = { files: [{ path: 'a.html', content: 'x' }], unitsByLocale: [{ locale: 'de', units: [{ id: 'u', target: 't' }] }] };
  const variants = [
    { ...base, files: [{ path: 'b.html', content: 'x' }] },
    { ...base, unitsByLocale: [{ locale: 'es', units: [{ id: 'u', target: 't' }] }] },
    { ...base, unitsByLocale: [{ locale: 'de', units: [{ id: 'v', target: 't' }] }] },
    { ...base, unitsByLocale: [{ locale: 'de', units: [] }] },
  ];
  const hashes = new Set([base, ...variants].map(hashRouteContent));
  assert.equal(hashes.size, variants.length + 1);
  assert.match(hashRouteContent(base), /^[0-9a-f]{64}$/);
});

function project(files) {
  const root = mkdtempSync(join(tmpdir(), 'sitemap-lastmod-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const PROJECT = {
  'src/app/app.routes.ts': ROUTES_SOURCE,
  'src/locale/messages.de.xlf': catalog(),
  [ABOUT_HTML]: '<h1 i18n="@@about.title">About FSB</h1>\n',
  [ABOUT_TS]: 'export class AboutPageComponent {}\n',
  'src/app/pages/about/about-page.component.scss': 'h1 { color: red; }\n',
  'src/app/pages/about/about-page.component.spec.ts': 'it("works", () => {});\n',
  [HOME_HTML]: '<h1 i18n="@@home.title">Home</h1>\n',
};

test('a project on disk hashes like its content, ignoring styles and specs', (t) => {
  const root = project(PROJECT);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = { angularRoot: root, routePaths: ['/', '/about'], locales: ['de'] };
  const hashes = computeRouteHashes(options);
  assert.equal(hashes['/about'], aboutHash());
  assert.notEqual(hashes['/'], hashes['/about']);

  writeFileSync(join(root, 'src/app/pages/about/about-page.component.scss'), 'h1 { color: blue; }\n');
  writeFileSync(join(root, 'src/app/pages/about/about-page.component.spec.ts'), 'it("still works", () => {});\n');
  assert.deepEqual(computeRouteHashes(options), hashes);

  // A sub-component template in the page directory is part of the page.
  writeFileSync(join(root, 'src/app/pages/about/about-history.component.html'), '<p>History</p>\n');
  const withSubComponent = computeRouteHashes(options);
  assert.notEqual(withSubComponent['/about'], hashes['/about']);
  assert.equal(withSubComponent['/'], hashes['/']);
});

test('a route without a page directory fails the build instead of going undated', (t) => {
  const root = project(PROJECT);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () => computeRouteHashes({ angularRoot: root, routePaths: ['/pricing'], locales: ['de'] }),
    /\/pricing has no lazy page import/,
  );
  assert.throws(
    () => computeRouteHashes({ angularRoot: root, routePaths: ['/release-notes'], locales: ['de'] }),
    /\/release-notes maps to src\/app\/pages\/release-notes, which is not a directory/,
  );
});
