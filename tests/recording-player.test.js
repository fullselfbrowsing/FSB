'use strict';

// Recording player page and the side panel's Watch entry point: script order
// and CSP safety, catalog keys, gap-reason coverage across host/content/page,
// and the look-only guarantees the page relies on.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('extension/ui/recording-player.html');
const pageJs = read('extension/ui/recording-player.js');
const hostJs = read('extension/utils/page-recorder-host.js');
const contentJs = read('extension/content/page-recorder.js');
const sidepanelJs = read('extension/ui/sidepanel.js');
const LOCALES = ['en', 'de', 'es', 'ja', 'ko', 'ru', 'zh_CN', 'zh_TW'];
const catalogs = Object.fromEntries(LOCALES.map((loc) => [loc, JSON.parse(read('extension/_locales/' + loc + '/messages.json'))]));
const copyKey = (english) => 'copy_' + crypto.createHash('sha256').update(english).digest('hex').slice(0, 10);

test('loads locale, store, player kit, then the page script, with no inline script', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((m) => (m[1].match(/src="([^"]+)"/) || [])[1]), [
    '../utils/ui-locale.js',
    '../utils/page-recording-store.js',
    '../dist/ui/recording-player-kit.js',
    'recording-player.js'
  ]);
  scripts.forEach((m) => assert.equal(m[2].trim(), '', 'MV3 CSP blocks inline scripts'));
  assert.ok(html.indexOf('../shared/fsb-ui-core.css') < html.indexOf('recording-player.css'), 'core tokens load first');
  for (const rel of ['extension/dist/ui/recording-player-kit.js', 'extension/dist/content/page-recorder-capture.js']) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel + ' is committed (CI never builds)');
  }
  assert.match(read('extension/dist/ui/recording-player-kit.js'), /FsbRecordingPlayerKit/);
});

test('static copy is keyed and present in every catalog', () => {
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n="([^"]+)">([^<]*)</g)) {
    keys.add(m[1]);
    assert.equal(catalogs.en[m[1]].message, m[2], m[1] + ' fallback matches English');
  }
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    m[1].split(',').forEach((pair) => keys.add(pair.split(':')[1]));
    assert.ok(!m[1].includes(';'), 'attribute pairs are comma-separated');
  }
  assert.ok(keys.size >= 10);
  keys.forEach((key) => LOCALES.forEach((loc) => assert.ok(catalogs[loc][key], loc + ' has ' + key)));
});

test('every page COPY entry uses its sha256 key and exists in all locales', () => {
  const entries = [...pageJs.matchAll(/\['(copy_[0-9a-f]{10})', '((?:[^'\\]|\\.)*)'\]/g)];
  assert.ok(entries.length >= 15, "the COPY table was found");
  entries.forEach(([, key, english]) => {
    assert.equal(key, copyKey(english), english + ' is keyed by its sha256');
    LOCALES.forEach((loc) => assert.ok(catalogs[loc][key], loc + ' has ' + key));
  });
});

test('the page explains every gap reason the recorder can write', () => {
  const emitted = new Set();
  for (const source of [hostJs, contentJs]) {
    for (const m of source.matchAll(/'gap', \{ reason: '([a-z-]+)'/g)) emitted.add(m[1]);
    for (const m of source.matchAll(/goMarkersOnly\('([a-z-]+)'\)/g)) emitted.add(m[1]);
    for (const m of source.matchAll(/reason: verdict\.reason/g)) emitted.add('restricted-page');
  }
  ['restricted-page', 'not-html', 'inject-blocked', 'recording-full', 'backpressure', 'snapshot-too-large']
    .forEach((reason) => emitted.add(reason));
  const mapped = pageJs.match(/var GAP_REASONS = \{([\s\S]*?)\};/)[1];
  emitted.forEach((reason) => assert.ok(mapped.includes("'" + reason + "'"), 'GAP_REASONS covers ' + reason));
});

test('playback is look-only: no messaging, scripting or fetches from the page', () => {
  assert.ok(!/sendMessage|executeScript|chrome\.tabs\.|fetch\(|XMLHttpRequest/.test(pageJs));
  assert.match(pageJs, /inert: true/);
  assert.match(pageJs, /assetOriginPolicy: assetPolicy\(\)/);
  assert.match(pageJs, /function \(\) \{ return false; \}/, 'the images switch can block every asset origin');
});

test('the side panel opens the player for the session it lists', () => {
  assert.match(sidepanelJs, /chrome\.runtime\.getURL\('ui\/recording-player\.html\?session=' \+ encodeURIComponent\(sessionId\)\)/);
  assert.match(sidepanelJs, /closest\('\.history-watch-btn'\)/);
  assert.match(sidepanelJs, /fsbPageRecordingIndex/);
});
