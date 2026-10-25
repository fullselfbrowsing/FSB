import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLocalizedMarketingIndex } from './crawler-locale-summaries.mjs';

function catalogs({ mutate = catalog => catalog } = {}) {
  const source = [];
  const targets = [];
  for (const page of ['home', 'about', 'agents', 'support']) {
    for (const field of ['title', 'description']) {
      const id = `${page}.meta.${field}`;
      const english = `FSB ${page} ${field} &amp; Full Self-Browsing`;
      source.push(`<trans-unit id="${id}"><source>${english}</source></trans-unit>`);
      targets.push(`<trans-unit datatype="html" id="${id}"><source>${english}</source><target state="translated">FSB 日本語 ${page} ${field} &amp; Full Self-Browsing</target></trans-unit>`);
    }
  }
  return { en: source.join('\n'), ja: mutate(targets.join('\n')) };
}

function render(options = {}) {
  const data = catalogs(options);
  return buildLocalizedMarketingIndex({
    locales: ['en', 'ja'],
    subpaths: { en: '', ja: 'jp' },
    sourceLocale: 'en',
    host: 'https://example.com',
    catalogForLocale: locale => data[locale],
  });
}

test('summaries use registry subpaths, translated metadata, and decoded brand copy', () => {
  const result = render();
  assert.match(result, /### en\n/);
  assert.match(result, /### ja\n/);
  assert.match(result, /\]\(https:\/\/example.com\): FSB home description & Full Self-Browsing/);
  assert.match(result, /\]\(https:\/\/example.com\/jp\): FSB 日本語 home description & Full Self-Browsing/);
  assert.match(result, /\]\(https:\/\/example.com\/jp\/support\): FSB 日本語 support description/);
  assert.equal((result.match(/^- /gm) || []).length, 8);
  assert.ok(!result.includes('&amp;'));
});

test('missing locale copy fails instead of falling back to English', () => {
  assert.throws(() => render({ mutate: catalog => catalog.replace(/<target[^>]*>.*?<\/target>/, '') }), /Unreviewed crawler translation: ja\/home.meta.title/);
});

test('stale mirrored sources fail before publishing translated summaries', () => {
  assert.throws(() => render({ mutate: catalog => catalog.replace('<source>FSB home title', '<source>Old home title') }), /Stale crawler translation source: ja\/home.meta.title/);
});

test('unreviewed translations fail before publishing summaries', () => {
  assert.throws(() => render({ mutate: catalog => catalog.replace('state="translated"', 'state="needs-translation"') }), /Unreviewed crawler translation: ja\/home.meta.title/);
});

test('placeholder-bearing metadata is rejected as a plain-text summary', () => {
  assert.throws(() => render({ mutate: catalog => catalog.replace('FSB 日本語 home title', '<x id="INTERPOLATION"/>') }), /Missing plain-text crawler copy: ja\/home.meta.title/);
});

test('Markdown punctuation in catalog copy cannot change the link structure', () => {
  const result = render({ mutate: catalog => catalog.replace('FSB 日本語 home title', '[FSB] *日本語*') });
  assert.ok(result.includes('[\\[FSB\\] \\*日本語\\*'));
});
