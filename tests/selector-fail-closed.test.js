'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const selectors = fs.readFileSync(path.join(__dirname, '../extension/content/selectors.js'), 'utf8');
const domState = fs.readFileSync(path.join(__dirname, '../extension/content/dom-state.js'), 'utf8');

test('selector handling preserves :has and does not broaden unsupported syntax', () => {
  const start = selectors.indexOf('  function sanitizeSelector(');
  const end = selectors.indexOf('  /**\n   * Resolve a compact ref', start);
  assert.ok(start >= 0 && end > start);
  const queried = [];
  const match = { id: 'matching-button' };
  const context = {
    FSB: { sessionId: 'test', elementCache: { get: () => null, set() {} } },
    logger: { warn() {}, debug() {} },
    document: { querySelector(selector) {
      queried.push(selector);
      if (selector.includes(':contains(')) throw new SyntaxError('unsupported');
      return selector === 'button:has(.ready)' ? match : null;
    } }
  };
  const helpers = vm.runInNewContext(`${selectors.slice(start, end)}\n({ sanitizeSelector, querySelectorWithShadow })`, context);
  assert.equal(helpers.querySelectorWithShadow('button:has(.ready)'), match);
  assert.equal(helpers.querySelectorWithShadow('button:contains("Send")'), null);
  assert.deepEqual(queried, ['button:has(.ready)', 'button:contains("Send")']);
});

test('cached element is discarded when its selector condition changes', () => {
  const start = domState.indexOf('  class ElementCache {');
  const end = domState.indexOf('  const elementCache =', start);
  assert.ok(start >= 0 && end > start);
  const ElementCache = vm.runInNewContext(`${domState.slice(start, end)}\nElementCache`, { WeakRef });
  const cache = new ElementCache(5);
  let ready = true;
  const element = { isConnected: true, matches: () => ready };
  cache.set('button:has(.ready)', element);
  assert.equal(cache.get('button:has(.ready)'), element);
  ready = false;
  assert.equal(cache.get('button:has(.ready)'), null);
});
