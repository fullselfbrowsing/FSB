'use strict';

/**
 * Phase 12 Wave 0 smoke -- placeholder scaffold.
 *
 * Parts 1 + 2 filled by Plan 12-01 (FINT-23 hydrate Tier 1 + Tier 2 fallback).
 * Parts 3 + 4 filled by Plan 12-02 (FINT-23 addMessage write-through + LRU + flushAll).
 * Part 5     filled by Plan 12-03 (FINT-22 showSidepanelProgress default flip + unconditional persistence).
 * Parts 6 + 7 filled by Plan 12-04 (FINT-24 chrome.sidePanel.setOptions + open + graceful degradation).
 * Part 8     filled by Plan 12-04 (INV-04 + INV-06 + Phase-12 token byte-freeze regression).
 *
 * Wave 0 baseline emits one PASS per Part (8 PASS / 0 FAIL) so the
 * existing `npm test` &&-chain stays green.
 *
 * Real-runtime test discipline per CLAUDE.md MEMORY (no static-text grep
 * for presence; load + invoke the modules). The extension host globals
 * (runtime + tabs + storage.local + storage.session + sidePanel) are
 * mocked at module-top BEFORE requiring extension/ui modules.
 *
 * Run: node tests/sidepanel-message-log-smoke.test.js
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
let _onMessageListeners = [];
let _onActivatedListeners = [];
let _onRemovedListeners = [];
let _sidePanelOptionsCalls = [];
let _sidePanelOpenCalls = [];
let _sidePanelSetOptionsImpl = null;  // null = success; function = throw / Promise.reject
let _sidePanelOpenImpl = null;
let _activeTab = { id: 1, active: true, currentWindow: true };

globalThis.chrome = {
  runtime: {
    id: 'fsb-phase-12-test',
    lastError: null,
    sendMessage: function (msg, cb) { if (typeof cb === 'function') cb({}); },
    onMessage: { addListener: function (fn) { _onMessageListeners.push(fn); } }
  },
  tabs: {
    onActivated: { addListener: function (fn) { _onActivatedListeners.push(fn); } },
    onRemoved: { addListener: function (fn) { _onRemovedListeners.push(fn); } },
    onDiscarded: { addListener: function () {} },
    query: function (filter, cb) {
      const result = [_activeTab];
      if (typeof cb === 'function') { cb(result); return; }
      return Promise.resolve(result);
    }
  },
  storage: {
    local: {
      get: function (keys, cb) {
        const bag = {};
        if (typeof keys === 'string') {
          if (_localStore[keys] !== undefined) bag[keys] = _localStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) if (_localStore[k] !== undefined) bag[k] = _localStore[k];
        } else if (keys === null) {
          Object.assign(bag, _localStore);
        } else if (typeof keys === 'object' && keys) {
          for (const k of Object.keys(keys)) bag[k] = _localStore[k] !== undefined ? _localStore[k] : keys[k];
        }
        if (typeof cb === 'function') { cb(bag); return; }
        return Promise.resolve(bag);
      },
      set: function (payload, cb) {
        Object.assign(_localStore, payload);
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      },
      remove: function (key, cb) {
        if (Array.isArray(key)) { for (const k of key) delete _localStore[k]; }
        else delete _localStore[key];
        if (typeof cb === 'function') { cb(); return; }
        return Promise.resolve();
      }
    },
    session: {
      get: function (keys, cb) {
        const bag = {};
        if (typeof keys === 'string') {
          if (_sessionStore[keys] !== undefined) bag[keys] = _sessionStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) if (_sessionStore[k] !== undefined) bag[k] = _sessionStore[k];
        } else if (keys === null) {
          Object.assign(bag, _sessionStore);
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
    onChanged: { addListener: function () {} }
  },
  sidePanel: {
    setOptions: function (opts) {
      _sidePanelOptionsCalls.push(opts);
      if (typeof _sidePanelSetOptionsImpl === 'function') return _sidePanelSetOptionsImpl(opts);
      return Promise.resolve();
    },
    open: function (opts) {
      _sidePanelOpenCalls.push(opts);
      if (typeof _sidePanelOpenImpl === 'function') return _sidePanelOpenImpl(opts);
      return Promise.resolve();
    }
  }
};

// --- Module loads ---
const MessageLog = require('../extension/ui/sidepanel-message-log.js');
const TabConvStore = require('../extension/ui/sidepanel-tab-conv-store.js');

// --- DOM stub helpers (forward-compat for Plan 12-01..03 listener Parts) ---
function createDivStub() {
  const attrs = {};
  const classes = new Set();
  const children = [];
  const stub = {
    tagName: 'DIV',
    innerHTML: '',
    textContent: '',
    setAttribute: function (k, v) { attrs[k] = v; },
    removeAttribute: function (k) { delete attrs[k]; },
    getAttribute: function (k) { return attrs[k]; },
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); }
    },
    appendChild: function (child) { children.push(child); return child; },
    _attrs: function () { return attrs; },
    _classes: function () { return Array.from(classes); },
    _children: function () { return children.slice(); }
  };
  return stub;
}
function createButtonStub() {
  const stub = createDivStub();
  stub.tagName = 'BUTTON';
  stub.disabled = false;
  return stub;
}
function installDomStub(idMap) {
  globalThis.document = {
    getElementById: function (id) { return idMap[id] || null; },
    createElement: function (tag) {
      const stub = (tag === 'button') ? createButtonStub() : createDivStub();
      stub.tagName = tag.toUpperCase();
      return stub;
    }
  };
}

// Helper: clear mock state between Parts (Plan 12-XX may need fresh runs).
function _resetMockState() {
  _localStore = {};
  _sessionStore = {};
  _sidePanelOptionsCalls = [];
  _sidePanelOpenCalls = [];
  _sidePanelSetOptionsImpl = null;
  _sidePanelOpenImpl = null;
}

// --- Deterministic fake-timer harness for Plan 12-02 debouncer tests ---
// Plan 12-02 schedules write-through callbacks through MessageLog.createDebouncer
// with injected setTimeoutFn / clearTimeoutFn. The shape below mirrors the
// pattern used in Phase 11 sidepanel-tab-aware-smoke.test.js so downstream
// Parts can advance simulated time deterministically without real timers.
function createFakeClock() {
  const state = { now: 0, queue: [], nextId: 1 };
  function setFakeTimeout(fn, ms) {
    const entry = {
      id: state.nextId++,
      due: state.now + (typeof ms === 'number' ? ms : 0),
      fn: fn,
      cancelled: false
    };
    state.queue.push(entry);
    return entry.id;
  }
  function clearFakeTimeout(id) {
    for (const e of state.queue) if (e.id === id) e.cancelled = true;
  }
  function advance(ms) {
    state.now += (typeof ms === 'number' ? ms : 0);
    const due = state.queue
      .filter(function (e) { return !e.cancelled && e.due <= state.now; })
      .sort(function (a, b) { return a.due - b.due || a.id - b.id; });
    for (const e of due) {
      e.cancelled = true;
      try { e.fn(); } catch (_err) { /* swallow */ }
    }
  }
  function pendingCount() {
    return state.queue.filter(function (e) { return !e.cancelled; }).length;
  }
  return {
    now: function () { return state.now; },
    setTimeout: setFakeTimeout,
    clearTimeout: clearFakeTimeout,
    advance: advance,
    pendingCount: pendingCount
  };
}

// --- Helper: synthesize a Phase 11 envelope entry for fixture seeding ---
// Plan 12-01 hydrate tests need a TabConvStore envelope with a known convId
// already bound to a fake tabId. This helper builds the byTab + lru shape
// expected by Phase 11 sidepanel-tab-conv-store.js.
function seedTabConvEnvelope(tabId, convId) {
  const env = TabConvStore.emptyEnvelope();
  TabConvStore.ensureTabConversation(env, tabId, function () { return convId; });
  return env;
}

// --- Helper: synthesize a Phase 12 message-log entry for fixture seeding ---
// Plan 12-01 hydrate Tier-1 tests need a populated fsbConversationMessages
// envelope. This helper builds it from a sequence of {role, content, kind}
// triples; timestamps auto-increment from a base.
function seedMessageLogEnvelope(convId, msgSeq) {
  const env = MessageLog.emptyEnvelope();
  let ts = 1000000;
  for (const m of msgSeq) {
    MessageLog.appendMessage(env, convId, {
      role: m.role,
      content: m.content,
      timestamp: ts++,
      kind: m.kind
    });
  }
  return env;
}

(async function main() {
  console.log('\n--- Phase 12 Wave 0 smoke (placeholder scaffold) ---');

  console.log('\n--- Part 1: hydrateChatFromConversationId Tier 1 reads fsbConversationMessages (FILLED in Plan 12-01) ---');
  ok(true, 'placeholder Part 1 -- filled in Plan 12-01 (FINT-23 hydrate Tier 1)');

  console.log('\n--- Part 2: hydrateChatFromConversationId Tier 2 fsbSessionLogs fallback + Tier 3 empty (FILLED in Plan 12-01) ---');
  ok(true, 'placeholder Part 2 -- filled in Plan 12-01 (FINT-23 hydrate Tier 2)');

  console.log('\n--- Part 3: addMessage write-through via debouncer + LRU cap enforcement (FILLED in Plan 12-02) ---');
  ok(true, 'placeholder Part 3 -- filled in Plan 12-02 (FINT-23 write-through)');

  console.log('\n--- Part 4: flushAll on beforeunload + cancel on drop (FILLED in Plan 12-02) ---');
  ok(true, 'placeholder Part 4 -- filled in Plan 12-02 (FINT-23 flush + cancel)');

  console.log('\n--- Part 5: showSidepanelProgress default flip + unconditional persistence write-through for tool_executed / iteration_complete (FILLED in Plan 12-03) ---');
  ok(true, 'placeholder Part 5 -- filled in Plan 12-03 (FINT-22)');

  console.log('\n--- Part 6: chrome.sidePanel.setOptions + open called in Run handler with target tabId (FILLED in Plan 12-04) ---');
  ok(true, 'placeholder Part 6 -- filled in Plan 12-04 (FINT-24)');

  console.log('\n--- Part 7: chrome.sidePanel API failure is best-effort (try/catch swallows; automation continues) (FILLED in Plan 12-04) ---');
  ok(true, 'placeholder Part 7 -- filled in Plan 12-04 (FINT-24 graceful degradation)');

  console.log('\n--- Part 8: INV-04 setTimeout=8 + 4 iterator patterns + Phase-12 token awk-scan empty + INV-06 SHA byte-frozen (FILLED in Plan 12-04) ---');
  ok(true, 'placeholder Part 8 -- filled in Plan 12-04 (INV-04 + INV-06 byte-freeze)');

  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
})();
