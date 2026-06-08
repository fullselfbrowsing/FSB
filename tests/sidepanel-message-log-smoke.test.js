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
  let _innerHTML = '';
  const stub = {
    tagName: 'DIV',
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
  // Faithful DOM innerHTML semantics: setting to '' (or any string) clears
  // the children array. Plan 12-01 hydrate Tier 1 + Tier 2 rely on this
  // chatMessages.innerHTML = '' clearing behavior for idempotency.
  Object.defineProperty(stub, 'innerHTML', {
    get: function () { return _innerHTML; },
    set: function (v) {
      _innerHTML = v;
      if (typeof v === 'string') children.length = 0;
    },
    enumerable: true,
    configurable: true
  });
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

// --- sidepanel.js function extraction (vm-style) ---
//
// sidepanel.js is a classic-script document-bound module (2600+ lines,
// depends on document.* + chrome.* listeners). We cannot `require` it in
// Node; instead extract the specific functions Plan 12-01 added or
// modified and instantiate them as fresh closures with injected deps.
function _loadSidepanelHydrate() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'extension/ui/sidepanel.js'), 'utf8');
  const hydrateMatch = src.match(/async function hydrateChatFromConversationId\(convId\) \{[\s\S]*?\n\}/);
  const renderMatch = src.match(/function renderPersistedMessage\(content, role, kind\) \{[\s\S]*?\n\}/);
  if (!hydrateMatch) throw new Error('hydrateChatFromConversationId not found in sidepanel.js');
  if (!renderMatch) throw new Error('renderPersistedMessage not found in sidepanel.js');
  const hydrateSrc = hydrateMatch[0];
  const renderSrc = renderMatch[0];

  // The extracted body references bare identifiers (`activeConversationId`,
  // `lastRenderedTerminalSessionId`, `historySessionId`). Declare them as
  // closure-scoped vars by prepending var declarations.
  const wrapped = new Function(
    'chrome',
    'FSBSidepanelMessageLog',
    'chatMessages',
    'document',
    'state',
    'var activeConversationId = null;' +
    'var lastRenderedTerminalSessionId = null;' +
    'var historySessionId = null;' +
    renderSrc + '\n\n' +
    hydrateSrc + '\n\n' +
    'return {' +
    '  hydrate: hydrateChatFromConversationId,' +
    '  render: renderPersistedMessage,' +
    '  getState: function () { return { activeConversationId: activeConversationId, lastRenderedTerminalSessionId: lastRenderedTerminalSessionId, historySessionId: historySessionId }; }' +
    '};'
  );

  return function instantiate(chatMessagesStub) {
    return wrapped(globalThis.chrome, MessageLog, chatMessagesStub, globalThis.document, {});
  };
}

(async function main() {
  console.log('\n--- Phase 12 Wave 0 smoke (placeholder scaffold) ---');

  console.log('\n--- Part 1: hydrateChatFromConversationId Tier 1 reads fsbConversationMessages (FINT-23) ---');
  {
    _resetMockState();
    const instantiate = _loadSidepanelHydrate();
    const chatMessages = createDivStub();
    installDomStub({ chatMessages: chatMessages });
    const inst = instantiate(chatMessages);

    // Seed the envelope with 3 messages for conv_a in OUT-OF-ORDER timestamps.
    const env = MessageLog.emptyEnvelope();
    MessageLog.appendMessage(env, 'conv_a', { role: 'user',      content: 'first',  timestamp: 100, kind: 'text' });
    MessageLog.appendMessage(env, 'conv_a', { role: 'assistant', content: 'third',  timestamp: 300, kind: 'tool' });
    MessageLog.appendMessage(env, 'conv_a', { role: 'assistant', content: 'second', timestamp: 200, kind: 'progress' });
    _localStore[MessageLog.STORAGE_KEY] = env;
    // Also seed fsbSessionLogs to verify Tier 1 short-circuits Tier 2.
    _localStore.fsbSessionLogs = { sid1: { conversationId: 'conv_a', commands: ['SHOULD-NOT-RENDER'], result: 'SHOULD-NOT-RENDER' } };
    _localStore.fsbSessionIndex = [{ id: 'sid1', conversationId: 'conv_a', startTime: 0 }];

    const count = await inst.hydrate('conv_a');
    ok(count === 3, 'Part 1.1: Tier 1 returns message count (got ' + count + ', want 3)');
    ok(chatMessages._children().length === 3, 'Part 1.2: Tier 1 rendered 3 DOM children');

    // Chronological order: first=100ms, second=200ms, third=300ms.
    const rendered = chatMessages._children().map(function (c) { return c.textContent; });
    ok(rendered[0] === 'first' && rendered[1] === 'second' && rendered[2] === 'third',
       'Part 1.3: Tier 1 sorted by timestamp ascending (got [' + rendered.join(',') + '])');

    // Tier 1 short-circuits Tier 2: the 'SHOULD-NOT-RENDER' text from fsbSessionLogs MUST NOT appear.
    const hasShortCircuit = rendered.every(function (t) { return t.indexOf('SHOULD-NOT-RENDER') === -1; });
    ok(hasShortCircuit, 'Part 1.4: Tier 1 short-circuited Tier 2 (no fsbSessionLogs content rendered)');

    // Idempotency: re-call should clear + rerender same count.
    const count2 = await inst.hydrate('conv_a');
    ok(count2 === 3 && chatMessages._children().length === 3,
       'Part 1.5: Tier 1 idempotent on re-call (count2 ' + count2 + ', children ' + chatMessages._children().length + ')');

    // activeConversationId mutation observed.
    ok(inst.getState().activeConversationId === 'conv_a',
       'Part 1.6: Tier 1 sets activeConversationId = convId');
  }

  console.log('\n--- Part 2: hydrateChatFromConversationId Tier 2 fsbSessionLogs fallback + Tier 3 empty (FINT-23) ---');
  {
    _resetMockState();
    const instantiate = _loadSidepanelHydrate();
    const chatMessages = createDivStub();
    installDomStub({ chatMessages: chatMessages });
    const inst = instantiate(chatMessages);

    // No Tier 1 envelope. Tier 2 should fire with fsbSessionLogs.
    _localStore.fsbSessionLogs = {
      sid1: {
        id: 'sid1',
        conversationId: 'conv_b',
        startTime: 1000,
        commands: ['Hello world'],
        completionMessage: 'Done!',
        outcome: 'success'
      }
    };
    _localStore.fsbSessionIndex = [{ id: 'sid1', conversationId: 'conv_b', startTime: 1000 }];

    const count = await inst.hydrate('conv_b');
    ok(count === 1, 'Part 2.1: Tier 2 returns matching.length (got ' + count + ', want 1)');
    const rendered = chatMessages._children();
    ok(rendered.length === 2, 'Part 2.2: Tier 2 rendered 2 DOM children (user cmd + assistant completion)');
    ok(rendered[0].textContent === 'Hello world', 'Part 2.3: Tier 2 user command rendered first');
    ok(rendered[1].textContent === 'Done!', 'Part 2.4: Tier 2 completion rendered second');

    // Tier 2 uses renderPersistedMessage (Pitfall 3 defense) -- CSS class should
    // be 'message user' on first child and 'message system' on second.
    ok(rendered[0].className.indexOf('user') !== -1, 'Part 2.5: Tier 2 user CSS class set');
    ok(rendered[1].className.indexOf('system') !== -1, 'Part 2.6: Tier 2 assistant CSS class set');

    // activeConversationId mutation observed in Tier 2 path.
    ok(inst.getState().activeConversationId === 'conv_b', 'Part 2.7: Tier 2 sets activeConversationId');

    // Tier 3 empty: both stores empty, return 0.
    _resetMockState();
    const chatMessages2 = createDivStub();
    installDomStub({ chatMessages: chatMessages2 });
    const inst2 = instantiate(chatMessages2);
    const count3 = await inst2.hydrate('conv_nonexistent');
    ok(count3 === 0, 'Part 2.8: Tier 3 returns 0 when both stores empty');
    ok(chatMessages2._children().length === 0, 'Part 2.9: Tier 3 renders zero DOM children');

    // convId guard: null/non-string returns 0.
    const countNull = await inst2.hydrate(null);
    const countEmpty = await inst2.hydrate('');
    ok(countNull === 0 && countEmpty === 0, 'Part 2.10: convId guard returns 0 for null/empty');
  }

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
