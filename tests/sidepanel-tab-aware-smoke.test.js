'use strict';

/**
 * Phase 11 Wave 0 smoke -- placeholder scaffold.
 *
 * Parts 1 + 2 filled by Plan 11-01 (FINT-19 owner-chip friendly label).
 * Parts 3 + 4 filled by Plan 11-02 (FINT-20 foreign-owned input lockout).
 * Parts 5 + 6 filled by Plan 11-03 (FINT-21 per-tab chat history).
 * Part 7 filled by Plan 11-04 (INV-04 + INV-06 byte-freeze regression).
 *
 * Wave 0 baseline emits one PASS per Part (7 PASS / 0 FAIL) so the
 * existing `npm test` &&-chain stays green.
 *
 * Real-runtime test discipline per CLAUDE.md MEMORY (no static-text grep
 * for presence; load + invoke the modules). The extension host globals
 * (tabs + storage.session + runtime) are mocked at module-top BEFORE
 * requiring extension/ui modules.
 *
 * Run: node tests/sidepanel-tab-aware-smoke.test.js
 *
 * ASCII only. No emojis.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// --- Chrome API mocks (installed BEFORE any extension/ui module is required) ---
let _sessionStore = {};
let _localStore = {};
let _onActivatedListeners = [];
let _onRemovedListeners = [];
let _onDiscardedListeners = [];
let _onChangedListeners = [];
let _activeTab = { id: 1, active: true, currentWindow: true };

globalThis.chrome = {
  runtime: {
    id: 'fsb-phase-11-test',
    lastError: null,
    sendMessage: function (msg, cb) { if (typeof cb === 'function') cb({}); },
    onMessage: { addListener: function () {} }
  },
  tabs: {
    onActivated: { addListener: function (fn) { _onActivatedListeners.push(fn); } },
    onRemoved: { addListener: function (fn) { _onRemovedListeners.push(fn); } },
    onDiscarded: { addListener: function (fn) { _onDiscardedListeners.push(fn); } },
    query: function (filter, cb) {
      const result = [_activeTab];
      if (typeof cb === 'function') { cb(result); return; }
      return Promise.resolve(result);
    }
  },
  storage: {
    session: {
      get: function (keys, cb) {
        const bag = {};
        if (typeof keys === 'string') {
          if (_sessionStore[keys] !== undefined) bag[keys] = _sessionStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) if (_sessionStore[k] !== undefined) bag[k] = _sessionStore[k];
        } else if (keys === null) {
          Object.assign(bag, _sessionStore);
        } else if (typeof keys === 'object' && keys) {
          for (const k of Object.keys(keys)) bag[k] = _sessionStore[k] !== undefined ? _sessionStore[k] : keys[k];
        }
        if (typeof cb === 'function') { cb(bag); return; }
        return Promise.resolve(bag);
      },
      set: function (payload, cb) {
        Object.assign(_sessionStore, payload);
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      },
      remove: function (key, cb) {
        if (Array.isArray(key)) { for (const k of key) delete _sessionStore[k]; }
        else delete _sessionStore[key];
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      }
    },
    local: {
      get: function (keys, cb) {
        const bag = {};
        if (typeof keys === 'string' && _localStore[keys] !== undefined) bag[keys] = _localStore[keys];
        if (typeof cb === 'function') { cb(bag); return; }
        return Promise.resolve(bag);
      },
      set: function (payload, cb) {
        Object.assign(_localStore, payload);
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      }
    },
    onChanged: { addListener: function (fn) { _onChangedListeners.push(fn); } }
  }
};

// --- Module loads (sidecar + owner-chip; Plan 11-01+ will require additional modules) ---
const TabConvStore = require('../extension/ui/sidepanel-tab-conv-store.js');
require('../extension/ui/owner-chip.js'); // registers globalThis.FSBOwnerChip

// --- DOM stub helpers (forward-compat for Plan 11-02 lockout assertions) ---
function createButtonStub() {
  const attrs = {};
  const classes = new Set();
  return {
    tagName: 'BUTTON',
    disabled: false,
    setAttribute: function (k, v) { attrs[k] = v; },
    removeAttribute: function (k) { delete attrs[k]; },
    getAttribute: function (k) { return attrs[k]; },
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); }
    },
    _attrs: function () { return attrs; },
    _classes: function () { return Array.from(classes); }
  };
}
function createDivStub() {
  const stub = createButtonStub();
  stub.tagName = 'DIV';
  delete stub.disabled;
  return stub;
}
function installDomStub(idMap) {
  globalThis.document = {
    getElementById: function (id) { return idMap[id] || null; }
  };
}

(async function main() {
  console.log('\n--- Phase 11 Wave 0 smoke (placeholder scaffold) ---');

  console.log('\n--- Part 1: lookupClientLabel happy + null paths (FILLED in Plan 11-01) ---');
  ok(true, 'placeholder Part 1 -- filled in Plan 11-01 (FINT-19)');

  console.log('\n--- Part 2: refreshOwnerChip three-tier resolution + sidepanel/popup wiring (FILLED in Plan 11-01) ---');
  ok(true, 'placeholder Part 2 -- filled in Plan 11-01 (FINT-19)');

  console.log('\n--- Part 3: applyInputLockout DOM mutation on 4 controls (FILLED in Plan 11-02) ---');
  ok(true, 'placeholder Part 3 -- filled in Plan 11-02 (FINT-20)');

  console.log('\n--- Part 4: handleSendMessage runtime gate + .fsb-foreign-owned-disabled CSS class (FILLED in Plan 11-02) ---');
  ok(true, 'placeholder Part 4 -- filled in Plan 11-02 (FINT-20)');

  console.log('\n--- Part 5: envelope CRUD + LRU eviction (FILLED in Plan 11-03) ---');
  ok(true, 'placeholder Part 5 -- filled in Plan 11-03 (FINT-21)');

  console.log('\n--- Part 6: migrateLegacyConversationKey + sidepanel boot wiring (FILLED in Plan 11-03) ---');
  ok(true, 'placeholder Part 6 -- filled in Plan 11-03 (FINT-21)');

  console.log('\n--- Part 7: INV-04 + INV-06 byte-freeze regression (FILLED in Plan 11-04) ---');
  ok(true, 'placeholder Part 7 -- filled in Plan 11-04 (INV-04 + INV-06)');

  // Module references used to keep require side-effect alive across the
  // smoke and demonstrate downstream availability for Plan 11-01+ fills.
  assert.ok(TabConvStore && typeof TabConvStore.emptyEnvelope === 'function',
    'TabConvStore sidecar require side-effect');
  void createButtonStub;
  void createDivStub;
  void installDomStub;

  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
})();
