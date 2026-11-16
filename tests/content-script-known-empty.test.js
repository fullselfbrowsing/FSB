'use strict';

// The first content-script call after a navigation must not pay the
// reconnection sleeps when FSB itself cleared the tab's state on commit, while
// a tab whose state is unknown keeps every existing wait.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');

function region(startMarker, endMarker) {
  const start = background.indexOf(startMarker);
  assert.ok(start >= 0, `background.js contains ${startMarker}`);
  const end = background.indexOf(endMarker, start);
  assert.ok(end > start, `background.js contains ${endMarker} after ${startMarker}`);
  return background.slice(start, end);
}

const SOURCE = [
  region('const contentScriptKnownEmptyTabs = new Map();', '\n// Listen for persistent port connections from content scripts'),
  region('chrome.runtime.onConnect.addListener((port) => {', '\n// Clear content script state on navigation'),
  region('chrome.webNavigation.onCommitted.addListener((details) => {', '\nchrome.tabs.onUpdated.addListener('),
  region('async function checkContentScriptHealth(', '\n// Wait for content script to be ready before starting automation'),
  region('const contentScriptInjectionFlights = new Map();', '\nfunction fsbTriggerObserveWatchdogName('),
  region('async function sendMessageWithRetry(', '\n// Alternative action strategies'),
  '({ contentScriptKnownEmptyTabs, hasContentScriptKnownEmptyMark, checkContentScriptHealth,',
  '   ensureContentScriptInjectedUnlocked, sendMessageWithRetry })'
].join('\n');

const SLEEPS = [500, 1000, 1500];
const TAB = 7;

function createHarness() {
  const realSetTimeout = setTimeout;
  const page = { documentId: 'doc-0', scriptLoaded: false, answering: false };
  const calls = { sleeps: [], healthMessages: 0, probes: [], injections: 0, messages: 0 };
  const listeners = { connect: null, commit: null };
  const onSleep = new Map();

  function connectPort() {
    const messageListeners = [];
    const port = {
      name: 'content-script',
      sender: { tab: { id: TAB }, frameId: 0 },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onDisconnect: { addListener() {} },
      postMessage() {},
      disconnect() {}
    };
    listeners.connect(port);
    for (const fn of messageListeners) fn({ type: 'ready', url: 'https://example.com/', timestamp: Date.now() });
  }

  function startScript() {
    page.scriptLoaded = true;
    page.answering = true;
    connectPort();
  }

  const chrome = {
    runtime: { onConnect: { addListener: (fn) => { listeners.connect = fn; } } },
    webNavigation: { onCommitted: { addListener: (fn) => { listeners.commit = fn; } } },
    tabs: {
      get: async (tabId) => ({ id: tabId, url: 'https://example.com/', status: 'complete' }),
      onUpdated: { addListener() {}, removeListener() {} },
      sendMessage: async (_tabId, message) => {
        if (message.action === 'healthCheck') {
          calls.healthMessages++;
          if (page.answering) return { success: true };
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        calls.messages++;
        if (!page.answering) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { success: true, text: 'page text' };
      }
    },
    scripting: {
      executeScript: async (options) => {
        if (options.files) {
          calls.injections++;
          realSetTimeout(startScript, 5);
          return [{ frameId: 0, documentId: page.documentId }];
        }
        if (String(options.func).includes('__FSB_CONTENT_SCRIPT_LOADED__')) {
          calls.probes.push(options.target);
          const ids = options.target.documentIds;
          if (ids && !ids.includes(page.documentId)) throw new Error(`No document with id ${ids[0]}`);
          return [{ frameId: 0, documentId: page.documentId, result: page.scriptLoaded }];
        }
        return [{ frameId: 0, documentId: page.documentId }];
      }
    }
  };

  const context = {
    chrome,
    console,
    Date,
    Math,
    setTimeout(fn, ms) {
      // Delivery and injection deadlines never fire here; sleeps resolve at once.
      if (ms >= 4000) return 0;
      calls.sleeps.push(ms);
      const hook = onSleep.get(ms);
      if (hook) { onSleep.delete(ms); hook(); }
      realSetTimeout(fn, 0);
      return 0;
    },
    clearTimeout() {},
    setInterval(fn) {
      const handle = { stopped: false };
      const tick = () => { if (handle.stopped) return; fn(); realSetTimeout(tick, 2); };
      realSetTimeout(tick, 2);
      return handle;
    },
    clearInterval(handle) { if (handle) handle.stopped = true; },
    MAX_CONTENT_SCRIPT_ENTRIES: 200,
    enforceMapLimit() {},
    contentScriptReadyStatus: new Map(),
    contentScriptHealth: new Map(),
    contentScriptPorts: new Map(),
    armMcpBridge() {},
    debugLog() {},
    automationLogger: { debug() {}, logComm() {}, logInit() {}, logRecovery() {}, logTiming() {} },
    replayMcpVisualSessionForTab: async () => {},
    fsbTriggerRearmLiveObserversForTab: async () => {},
    pageLoadWatcher: { pingContentScript: async () => page.answering },
    classifyFailure: () => 'communication',
    FAILURE_TYPES: { BF_CACHE: 'bf_cache', COMMUNICATION: 'communication' },
    CONTENT_SCRIPT_FILES: ['content/init.js', 'content/messaging.js', 'content/lifecycle.js']
  };
  const api = vm.runInNewContext(SOURCE, context);

  function commit(documentId, transitionQualifiers = []) {
    page.documentId = documentId;
    page.scriptLoaded = false;
    page.answering = false;
    listeners.commit({ tabId: TAB, frameId: 0, documentId, transitionType: 'link', transitionQualifiers });
  }

  return { api, calls, context, page, commit, connectPort, onSleep };
}

function waitsIn(sleeps) {
  return sleeps.filter((ms) => SLEEPS.includes(ms));
}

test('the first read on a document FSB saw commit injects without the reconnection sleeps', async () => {
  const h = createHarness();
  h.commit('doc-1');
  assert.equal(h.api.hasContentScriptKnownEmptyMark(TAB), true);

  const started = Date.now();
  const response = await h.api.sendMessageWithRetry(TAB, { action: 'readPage' });

  assert.deepEqual(response, { success: true, text: 'page text' });
  assert.deepEqual(waitsIn(h.calls.sleeps), [], 'no fixed reconnection or retry sleep');
  assert.equal(h.calls.healthMessages, 1, 'one health message, no retry and no duplicate check');
  assert.equal(h.calls.injections, 1);
  assert.deepEqual(h.calls.probes.map((target) => [...target.documentIds]), [['doc-1']],
    'the emptiness probe targets the committed document');
  assert.equal(h.context.contentScriptPorts.has(TAB), true);
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false, 'the connected port clears the mark');
  assert.ok(Date.now() - started < 1000, 'the call is not held by fixed sleeps');
});

test('a tab whose state is unknown keeps the reconnection and retry waits', async () => {
  const h = createHarness();
  // No commit observed, as after a service-worker restart.

  assert.equal(await h.api.checkContentScriptHealth(TAB), false);
  assert.deepEqual(waitsIn(h.calls.sleeps), [1000, 500]);
  assert.equal(h.calls.healthMessages, 2);

  await h.api.ensureContentScriptInjectedUnlocked(TAB);
  assert.deepEqual(waitsIn(h.calls.sleeps).slice(0, 4), [1000, 500, 1000, 500],
    'the injection path still runs its own health check with both waits');
  assert.equal(h.calls.probes.length, 0, 'no emptiness probe without a commit mark');
  assert.equal(h.calls.injections, 1);
});

test('a port that reconnects during the wait on an unknown tab avoids injection', async () => {
  const h = createHarness();
  h.onSleep.set(1000, () => { h.page.scriptLoaded = true; h.page.answering = true; h.connectPort(); });

  assert.equal(await h.api.checkContentScriptHealth(TAB), true);
  assert.deepEqual(waitsIn(h.calls.sleeps), [1000]);
  assert.equal(h.calls.injections, 0);
});

test('a port connecting clears the mark and the next check is immediate', async () => {
  const h = createHarness();
  h.commit('doc-1');
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), true);

  h.connectPort();
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false);
  assert.equal(await h.api.checkContentScriptHealth(TAB), true);
  assert.deepEqual(h.calls.sleeps, []);
  assert.equal(h.calls.healthMessages, 0);
});

test('a main-frame ready signal or a health answer clears the mark', async () => {
  const h = createHarness();
  h.commit('doc-1');
  h.context.contentScriptReadyStatus.set(TAB, { ready: true, timestamp: Date.now() });
  assert.equal(h.api.hasContentScriptKnownEmptyMark(TAB), false);
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false);

  h.commit('doc-2');
  h.context.contentScriptReadyStatus.delete(TAB);
  h.page.answering = true;
  assert.equal(await h.api.checkContentScriptHealth(TAB), true);
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false);
  assert.deepEqual(waitsIn(h.calls.sleeps), []);

  const readyBranch = region("case 'contentScriptReady':", "case 'contentScriptConfirmation':");
  assert.ok(readyBranch.includes('contentScriptKnownEmptyTabs.delete(tabId);'),
    'the runtime ready signal drops the mark');
});

test('a back/forward commit leaves the tab unknown so its waits stay', async () => {
  const h = createHarness();
  h.commit('doc-1');
  h.commit('doc-cached', ['forward_back']);
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false);

  assert.equal(await h.api.checkContentScriptHealth(TAB), false);
  assert.deepEqual(waitsIn(h.calls.sleeps), [1000, 500]);
});

test('a script started by another injector drops the mark instead of being injected over', async () => {
  const h = createHarness();
  h.commit('doc-1');
  // Another injector has run the files; the port is not connected yet.
  h.page.scriptLoaded = true;
  h.onSleep.set(1000, () => { h.page.answering = true; h.connectPort(); });

  assert.equal(await h.api.ensureContentScriptInjectedUnlocked(TAB), true);
  assert.equal(h.calls.probes.length, 1);
  assert.equal(h.calls.injections, 0, 'no second injection over a live script');
  assert.deepEqual(waitsIn(h.calls.sleeps), [1000], 'the reconnection wait applies again');
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false);
});

test('a mark for a document that is no longer current cannot skip the waits', async () => {
  const h = createHarness();
  h.commit('doc-1');
  // The tab moved on to a document whose commit FSB never observed.
  h.page.documentId = 'doc-unseen';

  await h.api.ensureContentScriptInjectedUnlocked(TAB);
  assert.deepEqual(h.calls.probes.map((target) => [...target.documentIds]), [['doc-1']]);
  assert.deepEqual(waitsIn(h.calls.sleeps).slice(0, 2), [1000, 500],
    'the stale mark is dropped and the existing health check runs');
  assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false);
});

test('starting an injection drops the mark so post-injection checks keep their waits', async () => {
  const h = createHarness();
  h.commit('doc-1');
  // The injected script loads but connects only after the first reconnection wait.
  h.context.chrome.scripting.executeScript = (original => async (options) => {
    if (!options.files) return original(options);
    h.calls.injections++;
    h.page.scriptLoaded = true;
    assert.equal(h.api.contentScriptKnownEmptyTabs.has(TAB), false, 'mark is gone before files run');
    h.onSleep.set(1000, () => { h.page.answering = true; h.connectPort(); });
    return [{ frameId: 0, documentId: h.page.documentId }];
  })(h.context.chrome.scripting.executeScript);

  assert.equal(await h.api.ensureContentScriptInjectedUnlocked(TAB), true);
  assert.equal(h.calls.injections, 1);
  assert.ok(waitsIn(h.calls.sleeps).includes(1000), 'post-injection health check waited for the port');
});

test('the mark is set on main-frame commits only and keyed by the committed document', () => {
  const h = createHarness();
  h.commit('doc-1');
  assert.equal(h.api.contentScriptKnownEmptyTabs.get(TAB).documentId, 'doc-1');
  h.commit('doc-2');
  assert.equal(h.api.contentScriptKnownEmptyTabs.get(TAB).documentId, 'doc-2', 'a later commit replaces the mark');

  const removed = region('chrome.tabs.onRemoved.addListener((tabId) => {', '\n  // A closed tab');
  assert.ok(removed.includes('contentScriptKnownEmptyTabs.delete(tabId);'), 'a closed tab drops its mark');
  const suspend = region('chrome.runtime.onSuspend.addListener(() => {', '\n});');
  assert.ok(suspend.includes('contentScriptKnownEmptyTabs.clear();'), 'suspension drops every mark');
});
