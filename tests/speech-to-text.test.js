'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const speechSourcePath = path.join(__dirname, '..', 'extension', 'ui', 'speech-to-text.js');
const permissionSourcePath = path.join(__dirname, '..', 'extension', 'ui', 'microphone-permission.js');
const permissionHtmlPath = path.join(__dirname, '..', 'extension', 'ui', 'microphone-permission.html');
const speechSource = fs.readFileSync(speechSourcePath, 'utf8');
const permissionSource = fs.readFileSync(permissionSourcePath, 'utf8');
const permissionHtml = fs.readFileSync(permissionHtmlPath, 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function namedError(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : !!force;
      if (next) values.add(name);
      else values.delete(name);
      return next;
    }
  };
}

function makeElements(initialText = '') {
  const icon = { className: 'fa fa-microphone' };
  const listeners = {};
  const inputEvents = [];
  const targetInput = {
    textContent: initialText,
    dataset: { placeholder: 'Ask me to automate something...' },
    setAttribute(name, value) {
      if (name === 'data-placeholder') this.dataset.placeholder = value;
    },
    dispatchEvent(event) { inputEvents.push(event); }
  };
  const micBtn = {
    title: 'Voice input',
    hidden: false,
    attributes: {},
    classList: makeClassList(),
    querySelector(selector) { return selector === 'i' ? icon : null; },
    addEventListener(type, handler) { listeners[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  const sendBtn = { classList: makeClassList() };
  return { targetInput, micBtn, sendBtn, icon, listeners, inputEvents };
}

function makeStream(events = []) {
  const track = {
    stopCalls: 0,
    stop() {
      this.stopCalls++;
      events.push('track-stop');
    }
  };
  return {
    track,
    stream: { getTracks: () => [track] }
  };
}

function makePermissionStatus(initialState) {
  const listeners = new Set();
  return {
    state: initialState,
    addEventListener(type, handler) {
      if (type === 'change') listeners.add(handler);
    },
    removeEventListener(type, handler) {
      if (type === 'change') listeners.delete(handler);
    },
    setState(state) {
      this.state = state;
      for (const handler of [...listeners]) handler();
    }
  };
}

function makeHarness(options = {}) {
  const events = [];
  const elements = makeElements(options.initialText || '');
  const recognitionInstances = [];
  const permissionTabs = [];
  const removedTabListeners = new Set();
  const runtimeMessageListeners = new Set();
  const pendingTimers = new Map();
  let storageChangeHandler = null;
  const calls = {
    permissionQuery: 0,
    getUserMedia: 0,
    permissionTabsOpened: 0,
    permissionTabsFocused: 0,
    permissionTabsRemoved: 0,
    runtimeMessages: 0,
    tabQueries: 0,
    scriptInjections: 0
  };

  const permissionStatus = makePermissionStatus(options.permissionState || 'prompt');

  class MockSpeechRecognition {
    constructor() {
      this.startCalls = 0;
      this.stopCalls = 0;
      this.abortCalls = 0;
      recognitionInstances.push(this);
    }

    start() {
      this.startCalls++;
      events.push('recognition-start');
      if (options.recognitionStartError) throw options.recognitionStartError;
      if (options.autoRecognitionStart !== false && this.onstart) this.onstart();
    }

    stop() {
      this.stopCalls++;
      if (this.onend) this.onend();
    }

    abort() {
      this.abortCalls++;
      if (this.onerror) this.onerror({ error: 'aborted' });
      if (this.onend) this.onend();
    }

    emitResult(results) {
      this.onresult({
        resultIndex: 0,
        results: results.map(({ text, final }) => {
          const result = [{ transcript: text }];
          result.isFinal = final;
          return result;
        })
      });
    }

    emitError(error) {
      if (this.onerror) this.onerror({ error });
      if (this.onend) this.onend();
    }
  }

  const defaultStream = options.stream || makeStream(events);
  const getUserMedia = async constraints => {
    calls.getUserMedia++;
    events.push('get-user-media');
    if (options.getUserMedia) return options.getUserMedia(constraints);
    return defaultStream.stream;
  };

  const chrome = {
    storage: {
      local: {
        get: options.storageGet || (async () => options.settings || {})
      },
      onChanged: { addListener(handler) { storageChangeHandler = handler; } }
    },
    runtime: {
      id: 'test-extension',
      getURL(relativePath) { return `chrome-extension://test-extension/${relativePath}`; },
      onMessage: {
        addListener(handler) { runtimeMessageListeners.add(handler); },
        removeListener(handler) { runtimeMessageListeners.delete(handler); }
      },
      async sendMessage() {
        calls.runtimeMessages++;
        throw new Error('STT must not use runtime relay messages');
      }
    },
    tabs: {
      onRemoved: {
        addListener(handler) { removedTabListeners.add(handler); },
        removeListener(handler) { removedTabListeners.delete(handler); }
      },
      async create(details) {
        calls.permissionTabsOpened++;
        events.push('permission-tab-open');
        if (options.permissionTabCreateError) throw options.permissionTabCreateError;
        const tab = { id: 70 + permissionTabs.length, ...details };
        permissionTabs.push(tab);
        return tab;
      },
      async update(tabId, details) {
        calls.permissionTabsFocused++;
        const tab = permissionTabs.find(item => item.id === tabId);
        if (!tab) throw new Error('No such tab');
        Object.assign(tab, details);
        return tab;
      },
      async remove(tabId) {
        calls.permissionTabsRemoved++;
        events.push('permission-tab-remove');
        for (const handler of [...removedTabListeners]) handler(tabId);
      },
      async query() {
        calls.tabQueries++;
        throw new Error('STT must not inspect the active tab');
      }
    },
    scripting: {
      async executeScript() {
        calls.scriptInjections++;
        throw new Error('STT must not inject a content script');
      }
    }
  };

  let timerId = 0;
  const sandbox = {
    chrome,
    navigator: {
      language: 'en-US',
      permissions: options.permissionsUnsupported ? undefined : {
        async query(descriptor) {
          calls.permissionQuery++;
          assert.strictEqual(descriptor.name, 'microphone');
          if (options.permissionQueryError) throw options.permissionQueryError;
          return permissionStatus;
        }
      },
      mediaDevices: options.mediaDevicesUnsupported ? undefined : { getUserMedia }
    },
    document: {
      createRange() {
        return { selectNodeContents() {}, collapse() {} };
      }
    },
    Event: class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = !!init?.bubbles;
      }
    },
    Blob: options.Blob || class Blob {
      constructor(parts, init) {
        this.parts = parts;
        this.type = init?.type;
      }
    },
    FormData: options.FormData || class FormData {
      constructor() { this.entries = []; }
      append(...args) { this.entries.push(args); }
    },
    fetch: options.fetch || (async () => ({ ok: true, json: async () => ({ text: '' }) })),
    console: options.console || { warn() {}, error() {}, log() {} },
    setTimeout(handler, delay) {
      const id = ++timerId;
      pendingTimers.set(id, { handler, delay });
      return id;
    },
    clearTimeout(id) { pendingTimers.delete(id); },
    MediaRecorder: options.MediaRecorder,
    AbortController: options.AbortController === false ? undefined : AbortController,
    Promise,
    Error
  };

  sandbox.window = {
    SpeechRecognition: options.recognitionUnsupported
      ? undefined
      : (options.SpeechRecognition || MockSpeechRecognition),
    webkitSpeechRecognition: undefined,
    getSelection() {
      return { removeAllRanges() {}, addRange() {} };
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(
    speechSource + '\n;globalThis.FSBSpeechToText = FSBSpeechToText;',
    sandbox,
    { filename: speechSourcePath }
  );

  const stt = new sandbox.FSBSpeechToText(
    elements.targetInput,
    elements.micBtn,
    elements.sendBtn
  );

  return {
    stt,
    calls,
    events,
    elements,
    permissionStatus,
    permissionTabs,
    recognitionInstances,
    defaultStream,
    sandbox,
    emitStorageChange(changes) {
      storageChangeHandler?.(changes, 'local');
    },
    emitTabRemoved(tabId) {
      for (const handler of [...removedTabListeners]) handler(tabId);
    },
    emitRuntimeMessage(message, sender = {}) {
      for (const handler of [...runtimeMessageListeners]) {
        handler(message, sender);
      }
    },
    runtimeMessageListenerCount() {
      return runtimeMessageListeners.size;
    },
    runTimer(delay) {
      const match = [...pendingTimers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(match, `expected a pending ${delay}ms timer`);
      pendingTimers.delete(match[0]);
      match[1].handler();
    }
  };
}

function makePermissionPageHarness(options = {}) {
  const events = [];
  const timers = [];
  const stream = options.stream || makeStream(events);
  const calls = {
    getUserMedia: 0,
    permissionQuery: 0,
    currentTab: 0,
    tabsRemoved: 0,
    settingsTabsOpened: 0,
    windowClose: 0,
    runtimeMessages: 0
  };

  function makeButton(initialClasses = []) {
    const listeners = {};
    return {
      classList: makeClassList(initialClasses),
      disabled: false,
      textContent: '',
      addEventListener(type, handler) { listeners[type] = handler; },
      click() { return listeners.click?.(); }
    };
  }

  const elements = {
    allowMicBtn: makeButton(),
    openSettingsBtn: makeButton(['hidden']),
    status: { textContent: '', className: '' }
  };

  const sandbox = {
    document: {
      getElementById(id) { return elements[id]; }
    },
    navigator: {
      permissions: options.permissionsUnsupported ? undefined : {
        async query(descriptor) {
          calls.permissionQuery++;
          assert.strictEqual(descriptor.name, 'microphone');
          return { state: options.permissionState || 'prompt' };
        }
      },
      mediaDevices: options.mediaDevicesUnsupported ? undefined : {
        async getUserMedia(constraints) {
          calls.getUserMedia++;
          assert.strictEqual(constraints.audio, true);
          if (options.getUserMediaError) throw options.getUserMediaError;
          return stream.stream;
        }
      }
    },
    chrome: {
      runtime: {
        async sendMessage(message) {
          assert.strictEqual(message?.type, 'fsb:microphone-permission-granted');
          calls.runtimeMessages++;
        }
      },
      tabs: {
        async getCurrent() {
          calls.currentTab++;
          return { id: 91 };
        },
        async remove(tabId) {
          assert.strictEqual(tabId, 91);
          calls.tabsRemoved++;
        },
        async create(details) {
          assert.strictEqual(details.url, 'chrome://settings/content/microphone');
          calls.settingsTabsOpened++;
          return { id: 92 };
        }
      }
    },
    window: {
      close() { calls.windowClose++; }
    },
    console: { warn() {}, error() {}, log() {} },
    setTimeout(handler, delay) {
      timers.push({ handler, delay });
      return timers.length;
    },
    Promise,
    Error
  };

  vm.createContext(sandbox);
  vm.runInContext(permissionSource, sandbox, { filename: permissionSourcePath });

  return { sandbox, elements, calls, events, timers, stream };
}

async function flushMicrotasks() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('first browser use grants in a top-level extension tab, then transcribes and stops cleanly', async () => {
  const h = makeHarness({ initialText: 'Draft', permissionState: 'prompt' });

  const startPromise = h.stt.start();
  await flushMicrotasks();

  assert.strictEqual(h.calls.permissionTabsOpened, 1);
  assert.strictEqual(
    h.permissionTabs[0].url,
    'chrome-extension://test-extension/ui/microphone-permission.html'
  );
  assert.strictEqual(h.calls.getUserMedia, 0, 'the embedded side panel must not request the initial grant');
  assert.strictEqual(h.recognitionInstances.length, 0);
  assert.strictEqual(h.stt.isStarting, true);

  h.permissionStatus.setState('granted');
  await startPromise;
  await flushMicrotasks();

  assert.strictEqual(h.recognitionInstances.length, 1);
  assert.strictEqual(h.stt.isRecording, true);
  assert.strictEqual(h.elements.micBtn.classList.contains('recording'), true);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), true);
  assert.strictEqual(h.calls.permissionTabsRemoved, 1);

  const firstRecognition = h.recognitionInstances[0];
  firstRecognition.emitResult([{ text: 'hello', final: false }]);
  assert.strictEqual(h.elements.targetInput.textContent, 'Draft hello');
  firstRecognition.emitResult([{ text: 'hello world', final: true }]);
  assert.strictEqual(h.elements.targetInput.textContent, 'Draft hello world');
  assert.ok(h.elements.inputEvents.length >= 2);

  h.stt.stop();
  assert.strictEqual(firstRecognition.stopCalls, 1);
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.micBtn.title, 'Voice input');
  assert.strictEqual(h.elements.icon.className, 'fa fa-microphone');
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);

  const permissionQueries = h.calls.permissionQuery;
  await h.stt.start();
  assert.strictEqual(h.calls.permissionTabsOpened, 1, 'the extension-origin grant should be cached');
  assert.strictEqual(h.calls.permissionQuery, permissionQueries, 'the panel-lifetime grant should skip another query');
  assert.strictEqual(h.recognitionInstances.length, 2);
  h.stt.stop();

  assert.strictEqual(h.calls.runtimeMessages, 0);
  assert.strictEqual(h.calls.tabQueries, 0);
  assert.strictEqual(h.calls.scriptInjections, 0);
});

test('the permission page requests once and immediately stops its probe stream', async () => {
  const h = makePermissionPageHarness();
  await flushMicrotasks();

  assert.strictEqual(h.calls.getUserMedia, 1);
  assert.strictEqual(h.stream.track.stopCalls, 1);
  assert.strictEqual(h.calls.runtimeMessages, 1);
  assert.strictEqual(h.elements.status.className, 'success');
  assert.ok(h.elements.status.textContent.includes('Microphone enabled'));
  assert.strictEqual(h.elements.allowMicBtn.disabled, true);
  assert.strictEqual(h.timers.length, 1);
  assert.strictEqual(h.timers[0].delay, 700);

  h.timers[0].handler();
  await flushMicrotasks();
  assert.strictEqual(h.calls.tabsRemoved, 1);
});

test('an existing extension-origin grant skips the permission tab and side-panel probe', async () => {
  const h = makeHarness({ permissionState: 'granted' });
  await h.stt.start();

  assert.strictEqual(h.calls.permissionQuery, 1);
  assert.strictEqual(h.calls.permissionTabsOpened, 0);
  assert.strictEqual(h.calls.getUserMedia, 0);
  assert.strictEqual(h.stt.isRecording, true);
  h.stt.stop();
});

for (const scenario of [
  { name: 'is unavailable', options: { permissionsUnsupported: true } },
  { name: 'throws', options: { permissionQueryError: namedError('NotSupportedError') } }
]) {
  test(`permission helper success starts recognition when the Permissions API ${scenario.name}`, async () => {
    const h = makeHarness(scenario.options);
    const startPromise = h.stt.start();
    await flushMicrotasks();

    const permissionTabId = h.permissionTabs[0].id;
    assert.strictEqual(h.runtimeMessageListenerCount(), 1);
    h.emitRuntimeMessage(
      { type: 'fsb:microphone-permission-granted' },
      { id: 'test-extension', tab: { id: permissionTabId } }
    );
    await startPromise;

    assert.strictEqual(h.recognitionInstances.length, 1);
    assert.strictEqual(h.stt.isRecording, true);
    assert.strictEqual(h.runtimeMessageListenerCount(), 0);
    h.stt.stop();
  });
}

test('permission helper ignores grant messages from any other tab', async () => {
  const h = makeHarness({ permissionsUnsupported: true });
  const startPromise = h.stt.start();
  await flushMicrotasks();

  const permissionTabId = h.permissionTabs[0].id;
  h.emitRuntimeMessage(
    { type: 'fsb:microphone-permission-granted' },
    { id: 'other-extension', tab: { id: permissionTabId } }
  );
  h.emitRuntimeMessage(
    { type: 'fsb:microphone-permission-granted' },
    { id: 'test-extension', tab: { id: permissionTabId + 1 } }
  );
  h.emitTabRemoved(permissionTabId);
  await startPromise;

  assert.strictEqual(h.recognitionInstances.length, 0);
  assert.strictEqual(h.runtimeMessageListenerCount(), 0);
});

test('permission helper timeout removes its runtime listener and returns to idle', async () => {
  const h = makeHarness({ permissionsUnsupported: true });
  const startPromise = h.stt.start();
  await flushMicrotasks();

  assert.strictEqual(h.runtimeMessageListenerCount(), 1);
  h.runTimer(120000);
  await startPromise;

  assert.strictEqual(h.runtimeMessageListenerCount(), 0);
  assert.strictEqual(h.stt.isStarting, false);
  assert.strictEqual(h.stt.isRecording, false);
  assert.ok(h.elements.micBtn.title.includes('Microphone permission was not enabled'));
});

test('voice input defaults on and a persisted disabled setting blocks startup', async () => {
  const enabled = makeHarness({ permissionState: 'granted' });
  await enabled.stt._settingsReady;
  assert.strictEqual(enabled.stt.voiceInputEnabled, true);
  assert.strictEqual(enabled.elements.micBtn.hidden, false);
  assert.strictEqual(enabled.elements.micBtn.classList.contains('hidden'), false);

  const disabled = makeHarness({
    permissionState: 'granted',
    settings: { voiceInputEnabled: false }
  });
  await disabled.stt._settingsReady;
  assert.strictEqual(disabled.stt.voiceInputEnabled, false);
  assert.strictEqual(disabled.elements.micBtn.hidden, true);
  assert.strictEqual(disabled.elements.micBtn.attributes['aria-hidden'], 'true');

  await disabled.stt.start();
  assert.strictEqual(disabled.recognitionInstances.length, 0);
  assert.strictEqual(disabled.calls.permissionQuery, 0);
  assert.strictEqual(disabled.calls.permissionTabsOpened, 0);
  assert.strictEqual(disabled.elements.sendBtn.classList.contains('hidden'), false);
});

test('a live disable aborts browser recognition, hides the mic, and re-enable reuses the grant', async () => {
  const h = makeHarness({ permissionState: 'granted' });
  await h.stt.start();
  const recognition = h.recognitionInstances[0];
  assert.strictEqual(h.stt.isRecording, true);

  h.emitStorageChange({ voiceInputEnabled: { oldValue: true, newValue: false } });
  await flushMicrotasks();
  assert.strictEqual(recognition.abortCalls, 1);
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.micBtn.hidden, true);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);

  h.emitStorageChange({ voiceInputEnabled: { oldValue: false, newValue: true } });
  assert.strictEqual(h.elements.micBtn.hidden, false);
  assert.strictEqual(h.elements.micBtn.attributes['aria-hidden'], undefined);

  const permissionQueries = h.calls.permissionQuery;
  await h.stt.start();
  assert.strictEqual(h.recognitionInstances.length, 2);
  assert.strictEqual(h.calls.permissionQuery, permissionQueries);
  h.stt.stop();
});

test('disabling while permission is pending cancels the wait and closes the helper tab', async () => {
  const h = makeHarness({ permissionState: 'prompt' });
  const startPromise = h.stt.start();
  await flushMicrotasks();
  assert.strictEqual(h.calls.permissionTabsOpened, 1);
  assert.strictEqual(h.stt.isStarting, true);

  h.emitStorageChange({ voiceInputEnabled: { oldValue: true, newValue: false } });
  await startPromise;
  await flushMicrotasks();

  assert.strictEqual(h.calls.permissionTabsRemoved, 1);
  assert.strictEqual(h.recognitionInstances.length, 0);
  assert.strictEqual(h.runtimeMessageListenerCount(), 0);
  assert.strictEqual(h.stt.isStarting, false);
  assert.strictEqual(h.elements.micBtn.hidden, true);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
});

test('duplicate starts are ignored while the permission tab is open', async () => {
  const h = makeHarness({ permissionState: 'prompt' });

  const firstStart = h.stt.start();
  const duplicateStart = h.stt.start();
  await flushMicrotasks();
  assert.strictEqual(h.calls.permissionTabsOpened, 1);
  assert.strictEqual(h.stt.isStarting, true);

  h.permissionStatus.setState('granted');
  await Promise.all([firstStart, duplicateStart]);

  assert.strictEqual(h.recognitionInstances.length, 1);
  assert.strictEqual(h.stt.isRecording, true);
  h.stt.stop();
});

for (const scenario of [
  {
    name: 'denied permission',
    permissionState: 'denied',
    error: namedError('NotAllowedError', 'Permission denied'),
    message: 'Microphone access is blocked for FSB',
    settingsVisible: true
  },
  {
    name: 'missing microphone',
    permissionState: 'prompt',
    error: namedError('NotFoundError'),
    message: 'No microphone was found',
    settingsVisible: false
  },
  {
    name: 'busy microphone',
    permissionState: 'prompt',
    error: namedError('NotReadableError'),
    message: 'microphone is busy or unavailable',
    settingsVisible: false
  }
]) {
  test(`permission page explains ${scenario.name} and remains retryable`, async () => {
    const h = makePermissionPageHarness({
      permissionState: scenario.permissionState,
      getUserMediaError: scenario.error
    });
    await flushMicrotasks();

    assert.strictEqual(h.elements.status.className, 'error');
    assert.ok(h.elements.status.textContent.includes(scenario.message));
    assert.strictEqual(h.elements.allowMicBtn.disabled, false);
    assert.strictEqual(h.elements.allowMicBtn.textContent, 'Try again');
    assert.strictEqual(
      h.elements.openSettingsBtn.classList.contains('hidden'),
      !scenario.settingsVisible
    );
  });
}

test('a persisted denial opens the extension-owned recovery page and returns the side panel to idle', async () => {
  const h = makeHarness({ permissionState: 'denied' });
  await h.stt.start();

  assert.strictEqual(h.calls.permissionTabsOpened, 1);
  assert.strictEqual(h.calls.getUserMedia, 0);
  assert.strictEqual(h.recognitionInstances.length, 0);
  assert.strictEqual(h.stt.isStarting, false);
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
  assert.ok(h.elements.micBtn.title.includes('follow the instructions in the permission tab'));
});

test('closing the permission tab without granting returns the side panel to idle', async () => {
  const h = makeHarness({ permissionState: 'prompt' });
  const startPromise = h.stt.start();
  await flushMicrotasks();

  h.emitTabRemoved(h.permissionTabs[0].id);
  await startPromise;

  assert.strictEqual(h.stt.isStarting, false);
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
  assert.ok(h.elements.micBtn.title.includes('Microphone permission was not enabled'));
});

test('unsupported browser speech recognition fails locally without opening permission UI', async () => {
  const h = makeHarness({ recognitionUnsupported: true });
  await h.stt.start();

  assert.strictEqual(h.calls.permissionTabsOpened, 0);
  assert.strictEqual(h.calls.getUserMedia, 0);
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
  assert.strictEqual(
    h.elements.micBtn.title,
    'Speech recognition is not supported in this browser'
  );
});

test('browser recognition capture errors return to idle with a useful message', async () => {
  const h = makeHarness({ permissionState: 'granted' });
  await h.stt.start();
  h.recognitionInstances[0].emitError('audio-capture');

  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
  assert.ok(h.elements.micBtn.title.includes('No microphone was found'));
});

test('settings are awaited and a Whisper failure restores idle UI', async () => {
  const settingsGate = deferred();
  const recorderInstances = [];
  const stream = makeStream();

  class MockMediaRecorder {
    constructor(inputStream, options) {
      this.stream = inputStream;
      this.options = options;
      this.state = 'inactive';
      recorderInstances.push(this);
    }

    start(timeslice) {
      this.timeslice = timeslice;
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: { size: 4 } });
      this.stopPromise = this.onstop();
    }
  }

  const h = makeHarness({
    permissionState: 'granted',
    storageGet: () => settingsGate.promise,
    stream,
    MediaRecorder: MockMediaRecorder,
    fetch: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'bad API key' } })
    })
  });

  const startPromise = h.stt.start();
  await flushMicrotasks();
  assert.strictEqual(recorderInstances.length, 0, 'provider selection must wait for settings');
  assert.strictEqual(h.recognitionInstances.length, 0, 'browser STT must not win the settings race');

  settingsGate.resolve({ sttProvider: 'whisper', openaiApiKey: 'test-key' });
  await startPromise;
  assert.strictEqual(recorderInstances.length, 1);
  assert.strictEqual(h.calls.permissionTabsOpened, 0);
  assert.strictEqual(h.stt.isRecording, true);

  h.stt.stop();
  await recorderInstances[0].stopPromise;

  assert.strictEqual(stream.track.stopCalls, 1);
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.stt.isTranscribing, false);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
  assert.ok(h.elements.micBtn.title.includes('Whisper failed: bad API key'));
});

test('disabling an active Whisper recording stops tracks and discards captured audio', async () => {
  const recorderInstances = [];
  const stream = makeStream();
  let fetchCalls = 0;

  class MockMediaRecorder {
    constructor() {
      this.state = 'inactive';
      this.stopCalls = 0;
      recorderInstances.push(this);
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      this.stopCalls++;
      this.state = 'inactive';
      this.ondataavailable?.({ data: { size: 4 } });
      this.stopPromise = this.onstop?.();
    }
  }

  const h = makeHarness({
    permissionState: 'granted',
    settings: {
      voiceInputEnabled: true,
      sttProvider: 'whisper',
      openaiApiKey: 'test-key'
    },
    stream,
    MediaRecorder: MockMediaRecorder,
    fetch: async () => {
      fetchCalls++;
      return { ok: true, json: async () => ({ text: 'should not appear' }) };
    }
  });

  await h.stt.start();
  assert.strictEqual(h.stt.isRecording, true);
  h.emitStorageChange({ voiceInputEnabled: { oldValue: true, newValue: false } });
  await recorderInstances[0].stopPromise;

  assert.strictEqual(recorderInstances[0].stopCalls, 1);
  assert.strictEqual(stream.track.stopCalls, 1);
  assert.strictEqual(fetchCalls, 0);
  assert.strictEqual(h.elements.targetInput.textContent, '');
  assert.strictEqual(h.stt.isRecording, false);
  assert.strictEqual(h.elements.micBtn.hidden, true);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);
});

test('disabling an in-flight Whisper transcription aborts it and ignores a late response', async () => {
  const responseGate = deferred();
  const recorderInstances = [];
  const stream = makeStream();
  let requestSignal = null;

  class MockMediaRecorder {
    constructor() {
      this.state = 'inactive';
      recorderInstances.push(this);
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: { size: 4 } });
      this.stopPromise = this.onstop();
    }
  }

  const h = makeHarness({
    permissionState: 'granted',
    settings: {
      voiceInputEnabled: true,
      sttProvider: 'whisper',
      openaiApiKey: 'test-key'
    },
    stream,
    MediaRecorder: MockMediaRecorder,
    fetch: async (_url, request) => {
      requestSignal = request.signal;
      return responseGate.promise;
    }
  });

  await h.stt.start();
  h.stt.stop();
  await flushMicrotasks();
  assert.strictEqual(h.stt.isTranscribing, true);
  assert.ok(requestSignal);
  assert.strictEqual(requestSignal.aborted, false);

  h.emitStorageChange({ voiceInputEnabled: { oldValue: true, newValue: false } });
  assert.strictEqual(requestSignal.aborted, true);
  assert.strictEqual(h.stt.isTranscribing, false);
  assert.strictEqual(h.elements.micBtn.hidden, true);
  assert.strictEqual(h.elements.sendBtn.classList.contains('hidden'), false);

  responseGate.resolve({ ok: true, json: async () => ({ text: 'late transcript' }) });
  await recorderInstances[0].stopPromise;
  assert.strictEqual(h.elements.targetInput.textContent, '');
  assert.strictEqual(h.elements.micBtn.classList.contains('error'), false);
});

test('permission assets are packaged locally and browser STT has no website relay path', () => {
  assert.ok(permissionHtml.includes('<script src="microphone-permission.js"></script>'));
  assert.ok(permissionHtml.includes('Allow while visiting'));
  assert.ok(speechSource.includes("chrome.runtime.getURL('ui/microphone-permission.html')"));
  assert.ok(permissionSource.includes('navigator.mediaDevices.getUserMedia({ audio: true })'));

  for (const forbidden of [
    'stt-' + 'start',
    'stt-' + 'stop',
    'content-' + 'stt',
    'chrome.runtime.sendMessage',
    'chrome.tabs.query',
    'chrome.scripting.executeScript'
  ]) {
    assert.strictEqual(speechSource.includes(forbidden), false, `unexpected relay token: ${forbidden}`);
  }
});

(async () => {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL: ${name}`);
      console.error(error.stack || error);
    }
  }

  if (failures) {
    console.error(`\n${failures} speech-to-text test(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${tests.length} speech-to-text tests passed.`);
  }
})();
