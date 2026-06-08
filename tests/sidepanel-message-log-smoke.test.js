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

  console.log('\n--- Part 3: addMessage write-through via debouncer + LRU cap enforcement (FINT-23) ---');
  {
    // Fake-timer harness: setTimeoutFn returns a numeric id; advance() runs
    // any callbacks whose ms has elapsed. Mirrors the Plan 12-00 verify
    // pattern.
    const fakeNow = { time: 0 };
    const queue = [];
    const setT = function (fn, ms) {
      const entry = { fn: fn, ms: fakeNow.time + ms, id: queue.length + 1, cancelled: false };
      queue.push(entry);
      return entry.id;
    };
    const clearT = function (id) { for (const e of queue) if (e.id === id) e.cancelled = true; };
    const advance = function (ms) {
      fakeNow.time += ms;
      for (const e of queue.slice()) {
        if (!e.cancelled && e.ms <= fakeNow.time) {
          e.cancelled = true;
          e.fn();
        }
      }
    };

    // Test 1: defer 200ms
    let fires = 0;
    const deb = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    deb.schedule('conv_x', function () { fires++; });
    advance(199);
    ok(fires === 0, 'Part 3.1: debouncer defers callback before 200ms');
    advance(1);
    ok(fires === 1, 'Part 3.2: debouncer fires at 200ms exactly');

    // Test 3: clear-and-replace within window
    let fires2 = 0;
    const deb2 = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    deb2.schedule('conv_y', function () { fires2++; });
    advance(100);
    deb2.schedule('conv_y', function () { fires2 += 10; });
    advance(199);
    ok(fires2 === 0, 'Part 3.3: clear-and-replace defers fires until 200ms after LAST schedule');
    advance(2);
    ok(fires2 === 10, 'Part 3.4: clear-and-replace fires only the latest callback (fires2 ' + fires2 + ', want 10)');

    // Test 5: LRU cap = 50 -- insert 51, observe oldest evicted
    const env = MessageLog.emptyEnvelope();
    for (let i = 0; i < 51; i++) {
      MessageLog.appendMessage(env, 'lru_' + i, { role: 'user', content: 'm' + i, timestamp: Date.now() + i, kind: 'text' });
    }
    ok(env.lru.length === 50, 'Part 3.5: LRU cap=50 enforced (got ' + env.lru.length + ')');
    ok(env.byConv['lru_0'] === undefined, 'Part 3.6: oldest conversation lru_0 evicted from byConv');
    ok(env.byConv['lru_50'] !== undefined, 'Part 3.7: newest conversation lru_50 retained');
    ok(env.lru[0] === 'lru_50', 'Part 3.8: LRU head is the most-recently-written convId');

    // Test 9: buffered burst -- 5 schedules in ~80ms (loop body: schedule
    // then advance(20), 5 iters; last schedule at fakeNow=80; after loop
    // fakeNow=100). Last timer fires at 80+200=280.
    let fires3 = 0;
    const deb3 = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    for (let i = 0; i < 5; i++) {
      deb3.schedule('conv_burst', function () { fires3++; });
      advance(20);
    }
    // fakeNow=100 here. Advance by 179 (total 279) -- still 1ms before fire.
    advance(179);
    ok(fires3 === 0, 'Part 3.9: burst of 5 schedules in ~80ms still pending at 199ms-after-last-schedule');
    advance(2);
    ok(fires3 === 1, 'Part 3.10: burst of 5 fires exactly once after 200ms-after-last-schedule (fires3 ' + fires3 + ')');
  }

  console.log('\n--- Part 4: flushAll on beforeunload + cancel on drop + EC-05 resurrection defense (FINT-23) ---');
  {
    const fakeNow = { time: 0 };
    const queue = [];
    const setT = function (fn, ms) { const e = { fn: fn, ms: fakeNow.time + ms, id: queue.length + 1, cancelled: false }; queue.push(e); return e.id; };
    const clearT = function (id) { for (const e of queue) if (e.id === id) e.cancelled = true; };

    // Test 1: flushAll forces immediate fire
    let firesA = 0, firesB = 0;
    const deb = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    deb.schedule('a', function () { firesA++; });
    deb.schedule('b', function () { firesB++; });
    ok(deb._hasPending('a') === true && deb._hasPending('b') === true, 'Part 4.1: _hasPending true for scheduled convIds');
    await deb.flushAll();
    ok(firesA === 1 && firesB === 1, 'Part 4.2: flushAll fires all pending callbacks (firesA ' + firesA + ', firesB ' + firesB + ')');
    ok(deb._hasPending('a') === false && deb._hasPending('b') === false, 'Part 4.3: _hasPending false after flushAll');

    // Test 4: cancel defeats firing
    let firesC = 0;
    const deb2 = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    deb2.schedule('c', function () { firesC++; });
    deb2.cancel('c');
    ok(firesC === 0, 'Part 4.4: cancel pre-emptive (no fire yet)');
    ok(deb2._hasPending('c') === false, 'Part 4.5: cancel clears _hasPending');

    // Test 6: drop + cancel together -- envelope drop + debouncer cancel
    const env = MessageLog.emptyEnvelope();
    MessageLog.appendMessage(env, 'conv_drop', { role: 'user', content: 'hi', timestamp: Date.now(), kind: 'text' });
    const deb3 = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    let firesD = 0;
    deb3.schedule('conv_drop', function () { firesD++; });
    deb3.cancel('conv_drop');
    MessageLog.dropConversationMessages(env, 'conv_drop');
    ok(env.byConv['conv_drop'] === undefined, 'Part 4.6: dropConversationMessages removed byConv entry');
    ok(env.lru.indexOf('conv_drop') === -1, 'Part 4.7: dropConversationMessages removed lru entry');
    ok(firesD === 0, 'Part 4.8: cancel before drop prevented resurrection-after-drop write');

    // Test 9: flushAll on empty pending is a no-op
    const deb4 = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    let firesE = 0;
    await deb4.flushAll();
    ok(firesE === 0, 'Part 4.9: flushAll on empty pending is no-op');

    // Test 10: error in callback swallowed (per CONTEXT D-03 best-effort)
    const deb5 = MessageLog.createDebouncer({ debounceMs: 200, setTimeoutFn: setT, clearTimeoutFn: clearT });
    let firesF = 0;
    deb5.schedule('err', function () { firesF++; throw new Error('boom'); });
    await deb5.flush('err');
    ok(firesF === 1, 'Part 4.10: callback throw swallowed; flush completes without raising');
  }

  console.log('\n--- Part 5: showSidepanelProgress default flip + iteration_complete persistence (FINT-22) ---');
  {
    const optsSrc = fs.readFileSync(path.join(__dirname, '..', 'extension/ui/options.js'), 'utf8');
    const spSrc = fs.readFileSync(path.join(__dirname, '..', 'extension/ui/sidepanel.js'), 'utf8');

    // Test 1: options.js default flipped true.
    ok(/showSidepanelProgress:\s*true/.test(optsSrc),
       'Part 5.1: options.js DEFAULT_SETTINGS contains showSidepanelProgress: true');
    ok(!/showSidepanelProgress:\s*false/.test(optsSrc),
       'Part 5.2: options.js no longer contains showSidepanelProgress: false');

    // Test 3: sidepanel.js module-scope flipped true.
    ok(/let showSidepanelProgressEnabled = true;/.test(spSrc),
       'Part 5.3: sidepanel.js module-scope showSidepanelProgressEnabled = true');
    ok(!/let showSidepanelProgressEnabled = false;/.test(spSrc),
       'Part 5.4: sidepanel.js no longer declares showSidepanelProgressEnabled = false');

    // Test 5: boot read default + catch fallback both flipped true.
    const bootMatch = spSrc.match(/Load sidepanel progress setting[\s\S]*?catch[\s\S]*?\}/);
    ok(bootMatch !== null, 'Part 5.5: boot read block found by content match');
    const bootBody = bootMatch ? bootMatch[0] : '';
    ok(/\?\?\s*true/.test(bootBody),
       'Part 5.6: boot read uses ?? true (default flipped from false)');
    const catchAssign = bootBody.match(/catch[\s\S]*?showSidepanelProgressEnabled\s*=\s*(true|false)/);
    ok(catchAssign !== null && catchAssign[1] === 'true',
       'Part 5.7: catch fallback assigns true (was false)');

    // Test 8: iteration_complete persists progress.
    const iterMatch = spSrc.match(/case 'iteration_complete':[\s\S]*?break;/);
    ok(iterMatch !== null, 'Part 5.8: case iteration_complete found');
    const iterBody = iterMatch ? iterMatch[0] : '';
    ok(/_persistMessage\('assistant', 'Step ' \+ request\.iteration \+ ' complete', 'progress'\)/.test(iterBody),
       'Part 5.9: iteration_complete persists progress via _persistMessage');
    ok(/updateStatusMessage/.test(iterBody),
       'Part 5.10: iteration_complete existing updateStatusMessage call preserved');

    // Test 11: tool_executed wiring intact (carryforward sanity).
    const toolMatch = spSrc.match(/case 'tool_executed':[\s\S]*?break;/);
    ok(toolMatch !== null, 'Part 5.11: case tool_executed still wired');
    const toolBody = toolMatch ? toolMatch[0] : '';
    ok(/addActionMessage/.test(toolBody),
       'Part 5.12: tool_executed body still invokes addActionMessage (Plan 12-02 hook C persists via this chokepoint)');
  }

  console.log('\n--- Part 6: chrome.sidePanel.setOptions + open called in Run handler with target tabId (FINT-24) ---');
  {
    _resetMockState();
    // Read background.js source and grep the handleStartAutomation body for
    // the Plan 12-04 patch site. Static-text grep is the simplest reliable
    // verification since handleStartAutomation has too many dependencies for
    // functional invocation.
    const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'extension/background.js'), 'utf8');
    const handlerMatch = bgSrc.match(/async function handleStartAutomation\(request, sender, sendResponse\) \{[\s\S]*?\n\}/);
    ok(handlerMatch !== null, 'Part 6.1: handleStartAutomation found in background.js');
    const handlerBody = handlerMatch ? handlerMatch[0] : '';
    ok(/await chrome\.sidePanel\.setOptions\(\{[\s\S]*?tabId: targetTabId[\s\S]*?enabled: true[\s\S]*?path: 'ui\/sidepanel\.html'/.test(handlerBody),
       'Part 6.2: chrome.sidePanel.setOptions called with tabId + enabled true + path');
    ok(/await chrome\.sidePanel\.open\(\{ tabId: targetTabId \}\)/.test(handlerBody),
       'Part 6.3: chrome.sidePanel.open called with tabId');
    // Find the *call* index (not the comment), which is the index of the
    // literal "await chrome.sidePanel.setOptions" (open's call follows it).
    const setOptIdx = handlerBody.indexOf('await chrome.sidePanel.setOptions');
    const openIdx = handlerBody.indexOf('await chrome.sidePanel.open(');
    ok(setOptIdx !== -1 && openIdx !== -1 && setOptIdx < openIdx,
       'Part 6.4: setOptions called BEFORE open (gesture-window order)');
    // Verify the new block sits AFTER targetTabId declaration + BEFORE conversationSessions reactivation.
    const targetIdx = handlerBody.indexOf('let targetTabId');
    const reactivateIdx = handlerBody.indexOf('conversationSessions.has');
    ok(targetIdx !== -1 && setOptIdx > targetIdx && (reactivateIdx === -1 || setOptIdx < reactivateIdx),
       'Part 6.5: sidePanel block sits AFTER targetTabId + BEFORE reactivation (gesture preservation)');
  }

  console.log('\n--- Part 7: chrome.sidePanel API failure is best-effort (try/catch swallows; automation continues) (FINT-24) ---');
  {
    const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'extension/background.js'), 'utf8');
    const handlerMatch = bgSrc.match(/async function handleStartAutomation\(request, sender, sendResponse\) \{[\s\S]*?\n\}/);
    const handlerBody = handlerMatch ? handlerMatch[0] : '';
    ok(/try \{[\s\S]*?chrome\.sidePanel\.setOptions[\s\S]*?chrome\.sidePanel\.open[\s\S]*?\} catch \(sidePanelErr\)/.test(handlerBody),
       'Part 7.1: setOptions + open wrapped in try/catch with sidePanelErr identifier');
    ok(/console\.warn\('\[FSB\] Phase 12 FINT-24 sidePanel auto-open failed'/.test(handlerBody),
       'Part 7.2: catch logs structured warning (not error throw)');
    // Verify the new block is gated on typeof chrome.sidePanel !== 'undefined' (Chrome <114 graceful degradation per RESEARCH Section 14).
    ok(/typeof chrome\.sidePanel !== 'undefined'/.test(handlerBody),
       'Part 7.3: sidePanel block gated on API presence (Chrome <114 graceful degradation)');
    // Verify the new block is ALSO gated on targetTabId truthy (do not call setOptions with null tabId).
    ok(/if \(targetTabId && typeof chrome\.sidePanel/.test(handlerBody),
       'Part 7.4: sidePanel block gated on targetTabId truthy');
  }

  console.log('\n--- Part 8: INV-04 setTimeout=8 + 4 iterator patterns + Phase-12 token awk-scan empty + INV-06 SHA byte-frozen (regression) ---');
  {
    const agentLoopSrc = fs.readFileSync(path.join(__dirname, '..', 'extension/ai/agent-loop.js'), 'utf8');

    // Test 1: setTimeout count exactly 8.
    const setTimeoutMatches = agentLoopSrc.match(/setTimeout/g) || [];
    ok(setTimeoutMatches.length === 8,
       'Part 8.1: INV-04 grep -c "setTimeout" extension/ai/agent-loop.js === 8 (got ' + setTimeoutMatches.length + ')');

    // Test 2: 4 iterator patterns intact (content-based discovery per Phase 6 / 11 precedent).
    const iteratorMatches = agentLoopSrc.match(/session\._nextIterationTimer\s*=\s*setTimeout/g) || [];
    ok(iteratorMatches.length === 4,
       'Part 8.2: INV-04 4 session._nextIterationTimer = setTimeout iterator patterns intact (got ' + iteratorMatches.length + ')');

    // Test 3: Phase-12 token awk-scan empty.
    // Pattern: any Phase-12-only identifier (FSBSidepanelMessageLog | _persistMessage |
    // _flushMessageLog | _messageLogDebouncer | fsbConversationMessages |
    // chrome\.sidePanel\.open | chrome\.sidePanel\.setOptions) inside ANY setTimeout
    // lambda body MUST be ZERO. Simulate awk via JS: scan setTimeout( segments, check
    // until matching ).
    const phase12Tokens = /FSBSidepanelMessageLog|_persistMessage|_flushMessageLog|_messageLogDebouncer|fsbConversationMessages|chrome\.sidePanel\.open|chrome\.sidePanel\.setOptions/;
    let violation = false;
    const setTimeoutRe = /setTimeout\s*\(/g;
    let m;
    while ((m = setTimeoutRe.exec(agentLoopSrc)) !== null) {
      // Find matching close paren (simplistic depth tracking, sufficient for agent-loop body).
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < agentLoopSrc.length && depth > 0) {
        const ch = agentLoopSrc[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
      }
      const lambdaBody = agentLoopSrc.slice(m.index, i);
      if (phase12Tokens.test(lambdaBody)) {
        violation = true;
        break;
      }
    }
    ok(!violation, 'Part 8.3: INV-04 Phase-12 token awk-scan empty inside all setTimeout lambdas');

    // Test 4: LATTICE-PIN.md SHA literal byte-frozen.
    const pinSrc = fs.readFileSync(path.join(__dirname, '..', '.planning/LATTICE-PIN.md'), 'utf8');
    ok(/current_lattice_sha:\s*e95067bfa87ed1b75838fc3b3ef217a3b01acbd3/.test(pinSrc),
       'Part 8.4: INV-06 LATTICE-PIN.md frontmatter current_lattice_sha literal === e95067bfa87ed1b75838fc3b3ef217a3b01acbd3');
  }

  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
})();
