'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SLUGS = [
  'gsheets.get_spreadsheet',
  'gsheets.get_values',
  'gsheets.update_values',
  'gsheets.append_values',
  'gsheets.clear_values'
];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('manifest and background wire fail-closed Sheets OAuth and handler modules', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.ok(manifest.permissions.includes('identity'));
  assert.ok(manifest.permissions.includes('identity.email'));
  assert.deepEqual(manifest.oauth2.scopes, ['https://www.googleapis.com/auth/spreadsheets']);
  assert.match(manifest.oauth2.client_id, /^REPLACE_/);

  const background = read('extension/background.js');
  assert.match(background, /importScripts\('utils\/google-sheets-api\.js'\)/);
  assert.match(background, /importScripts\('catalog\/handlers\/gsheets\.js'\)/);
  assert.match(background, /case 'google-sheets:connect'/);
  assert.match(background, /!sender\.tab/);
  assert.match(background, /getURL\('ui\/control_panel\.html'\)/);
});

test('router exposes only the five-operation Sheets facade to handlers', () => {
  const router = read('extension/utils/capability-router.js');
  assert.match(router, /googleSheets: _googleSheetsContext\(\)/);
  const contextBody = router.match(/function _googleSheetsContext\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(contextBody);
  for (const method of ['getSpreadsheet', 'getValues', 'updateValues', 'appendValues', 'clearValues']) {
    assert.ok(contextBody[1].includes(`'${method}'`));
  }
  for (const forbidden of ['connect', 'disconnect', 'status', 'fetch', 'request']) {
    assert.equal(contextBody[1].includes(`'${forbidden}'`), false);
  }
});

test('catalog descriptors are strict, handler-backed, discoverable, and classified', () => {
  const expectedClasses = ['read', 'read', 'write', 'write', 'destructive'];
  const index = require('../extension/catalog/recipe-index.generated.js');
  for (let i = 0; i < SLUGS.length; i++) {
    const descriptor = index.descriptors.find(row => row.slug === SLUGS[i]);
    assert.ok(descriptor, `${SLUGS[i]} is in generated catalog`);
    assert.equal(descriptor.backing, 'handler');
    assert.equal(descriptor.service, 'docs.google.com');
    assert.equal(descriptor.sideEffectClass, expectedClasses[i]);
    assert.equal(descriptor.params.additionalProperties, false);
    assert.ok(descriptor.intentSynonyms.length >= 3);
  }
});

test('canonical and packaged handler copies match and catalog seeds every slug', () => {
  assert.equal(read('catalog/handlers/gsheets.js'), read('extension/catalog/handlers/gsheets.js'));
  const catalogSource = read('extension/utils/capability-catalog.js');
  assert.match(catalogSource, /global: 'FsbHandlerGsheets'/);

  delete require.cache[require.resolve('../extension/utils/capability-catalog.js')];
  const catalog = require('../extension/utils/capability-catalog.js');
  globalThis.FsbCapabilityCatalog = catalog;
  delete require.cache[require.resolve('../catalog/handlers/gsheets.js')];
  require('../catalog/handlers/gsheets.js');
  catalog.seedHeadHandlers();
  for (const slug of SLUGS) {
    const entry = catalog.resolve(slug, 'https://docs.google.com');
    assert.ok(entry);
    assert.equal(entry.tier, 'T1a');
    assert.equal(typeof entry.handler.handle, 'function');
  }
});

test('Sheets is sensitive, security guard covers its handler, and legacy fallback remains', () => {
  const policy = JSON.parse(read('extension/config/service-denylist.json'));
  assert.ok(policy.sensitiveOrigins.includes('https://docs.google.com'));
  assert.match(read('scripts/verify-recipe-path-guard.mjs'), /'catalog\/handlers\/gsheets\.js'/);
  const tools = read('extension/ai/tool-definitions.js');
  assert.match(tools, /name: 'fill_sheet'/);
  assert.match(tools, /name: 'read_sheet'/);
});
