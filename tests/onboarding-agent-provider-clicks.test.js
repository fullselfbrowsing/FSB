'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ONBOARDING_JS_PATH = path.join(ROOT, 'extension', 'ui', 'onboarding.js');
const ONBOARDING_HTML_PATH = path.join(ROOT, 'extension', 'ui', 'onboarding.html');
const ONBOARDING_CSS_PATH = path.join(ROOT, 'extension', 'ui', 'onboarding.css');
const ONBOARDING_SOURCE = fs.readFileSync(ONBOARDING_JS_PATH, 'utf8');
const ALL_CLIENT_IDS = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'vscode',
  'windsurf',
  'codex',
  'opencode'
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractFunction(source, functionName) {
  const anchor = 'function ' + functionName + '(';
  const start = source.indexOf(anchor);
  assert.notStrictEqual(start, -1, functionName + ' exists');
  const braceStart = source.indexOf('{', start);
  let depth = 1;
  let index = braceStart + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}') depth--;
    index++;
  }
  assert.strictEqual(depth, 0, functionName + ' has balanced braces');
  return source.slice(start, index);
}

function createHarness(initialStore, options) {
  const opts = options || {};
  const store = Object.assign({}, plain(initialStore || {}));
  const calls = { get: 0, set: 0 };
  const timers = [];
  let now = 1000;
  let nextTimerId = 1;

  const local = {
    get(keys) {
      calls.get++;
      if (opts.rejectGet) return Promise.reject(new Error('storage get failed'));
      const names = Array.isArray(keys) ? keys : [keys];
      const result = {};
      names.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
      });
      return Promise.resolve(result);
    },
    set(patch) {
      calls.set++;
      if (opts.rejectSet) return Promise.reject(new Error('storage set failed'));
      Object.assign(store, patch);
      return Promise.resolve();
    }
  };

  const context = {
    chrome: {
      runtime: {
        getManifest: () => ({ version: '0.9.90' }),
        lastError: null
      },
      storage: { local }
    },
    document: { addEventListener() {} },
    window: { addEventListener() {} },
    navigator: {},
    console,
    Date: { now: () => now },
    setTimeout(fn, delay) {
      const timer = { id: nextTimerId++, fn, delay, cleared: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    },
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {}
  };
  context.globalThis = context;

  const testFooter = `
    globalThis.__ONBOARDING_AGENT_PROVIDER_TEST__ = {
      state,
      copyCommand,
      persistCopyClick,
      flushCopyWrites: function () { return copyClickMutationTail; },
      setRender: function (fn) { render = fn; },
      setWriteClipboard: function (fn) { writeClipboard = fn; }
    };
  `;
  const instrumented = ONBOARDING_SOURCE.replace(/\}\)\(\);\s*$/, testFooter + '\n})();\n');
  vm.runInNewContext(instrumented, context, { filename: ONBOARDING_JS_PATH });

  return {
    api: context.__ONBOARDING_AGENT_PROVIDER_TEST__,
    calls,
    timers,
    store,
    setNow(value) { now = value; }
  };
}

(async function run() {
  console.log('--- onboarding agent-provider click source contracts ---');

  const baseCalls = ONBOARDING_SOURCE.match(
    /copyCommand\(BASE_INSTALL_COMMAND \+ ' ' \+ current\.flag, 'current'\)/g
  ) || [];
  assert.strictEqual(baseCalls.length, 2, 'both base copy buttons pass literal current');
  assert(
    ONBOARDING_SOURCE.includes('if (client) copyCommand(client.cmd, client.id);'),
    'fan copy buttons pass each canonical client id'
  );

  const allIdsMatch = ONBOARDING_SOURCE.match(/const ALL_INSTALL_CLIENT_IDS = \[([\s\S]*?)\];/);
  assert(allIdsMatch, 'all-client expansion constant exists');
  const sourceAllIds = Array.from(allIdsMatch[1].matchAll(/'([^']+)'/g), (match) => match[1]);
  assert.deepStrictEqual(sourceAllIds, ALL_CLIENT_IDS, 'all expands to the exact seven flag-backed ids');
  assert(!sourceAllIds.includes('openclaw'), 'all expansion excludes openclaw');

  const copyCommandSource = extractFunction(ONBOARDING_SOURCE, 'copyCommand');
  const persistSource = extractFunction(ONBOARDING_SOURCE, 'persistCopyClick');
  const showToastSource = extractFunction(ONBOARDING_SOURCE, 'showToast');
  assert(!/\bawait\b/.test(copyCommandSource), 'copyCommand does not await storage');
  assert.strictEqual(
    (copyCommandSource.match(/\bpersistCopyClick\(/g) || []).length,
    1,
    'copyCommand starts persistence exactly once'
  );
  assert(copyCommandSource.indexOf('writeClipboard(text);') < copyCommandSource.indexOf('persistCopyClick(clientId, source)'),
    'clipboard write remains ahead of persistence');
  assert(copyCommandSource.includes('}, 1600);'), 'copied state still uses the 1600 ms timer');
  assert(copyCommandSource.includes("showToast('Install command copied');"), 'copy toast text remains exact');
  assert(showToastSource.includes('}, 2600);'), 'toast still uses the 2600 ms timer');
  assert(!/\brender(?:Toast)?\s*\(/.test(persistSource), 'persistence does not render or toast');

  assert.strictEqual(
    sha256(ONBOARDING_HTML_PATH),
    '4c8d31710a223b120220d716df9741ac1d677ae8f48f2b3cff54b5328fc5bd35',
    'onboarding.html has no Phase 57 change'
  );
  assert.strictEqual(
    sha256(ONBOARDING_CSS_PATH),
    'd23bdd47f34fb95247113a266ef32a8e2bf8e427e93bdd040e0d05a4f5c7106d',
    'onboarding.css has no Phase 57 change'
  );

  console.log('--- durable count, timestamps, and sibling preservation ---');
  {
    const initialEnvelope = {
      clicked: {
        cursor: { count: 2, firstClickedAt: 111, lastClickedAt: 222, source: 'fan' },
        legacy: { count: 8, firstClickedAt: 10, lastClickedAt: 20, source: 'base' }
      },
      connected: { cursor: { name: 'Cursor', version: '1', lastSeenAt: 50 } },
      installed: { vscode: { detected: true, configPath: '/tmp/code', checkedAt: 60 } },
      futureSibling: { preserved: true }
    };
    const harness = createHarness({ fsbAgentProviders: initialEnvelope });
    harness.setNow(333);
    await harness.api.persistCopyClick('cursor', 'base');

    let envelope = plain(harness.store.fsbAgentProviders);
    assert.deepStrictEqual(envelope.clicked.cursor, {
      count: 3,
      firstClickedAt: 111,
      lastClickedAt: 333,
      source: 'base'
    }, 'repeat click increments count, preserves first timestamp, and replaces last timestamp/source');
    assert.deepStrictEqual(envelope.clicked.legacy, initialEnvelope.clicked.legacy, 'other clicked entries survive');
    assert.deepStrictEqual(envelope.connected, initialEnvelope.connected, 'connected sibling survives');
    assert.deepStrictEqual(envelope.installed, initialEnvelope.installed, 'installed sibling survives');
    assert.deepStrictEqual(envelope.futureSibling, initialEnvelope.futureSibling, 'unknown sibling survives');
    assert.deepStrictEqual(harness.calls, { get: 1, set: 1 }, 'one click performs one read/write mutation');

    harness.setNow(444);
    await harness.api.persistCopyClick('cursor', 'fan');
    envelope = plain(harness.store.fsbAgentProviders);
    assert.deepStrictEqual(envelope.clicked.cursor, {
      count: 4,
      firstClickedAt: 111,
      lastClickedAt: 444,
      source: 'fan'
    }, 'a later fan click keeps the original first timestamp');
  }

  console.log('--- exact all-client expansion ---');
  {
    const harness = createHarness({
      fsbAgentProviders: {
        clicked: {},
        connected: { agent: { name: 'agent', version: '', lastSeenAt: 1 } },
        installed: { cursor: { detected: true, configPath: null, checkedAt: 2 } },
        schemaVersion: 7
      }
    });
    harness.setNow(9000);
    let clipboardCount = 0;
    let renderCount = 0;
    harness.api.setWriteClipboard(() => { clipboardCount++; });
    harness.api.setRender(() => { renderCount++; });
    harness.api.copyCommand('install all', 'all');
    assert.strictEqual(clipboardCount, 1, 'all remains one clipboard action');
    assert.strictEqual(renderCount, 1, 'all remains one immediate render');
    assert.strictEqual(harness.api.state.toast, 'Install command copied', 'all remains one toast');
    await harness.api.flushCopyWrites();
    const envelope = plain(harness.store.fsbAgentProviders);
    assert.deepStrictEqual(Object.keys(envelope.clicked).sort(), ALL_CLIENT_IDS.slice().sort(),
      'all writes exactly seven clicked entries');
    ALL_CLIENT_IDS.forEach((id) => {
      assert.deepStrictEqual(envelope.clicked[id], {
        count: 1,
        firstClickedAt: 9000,
        lastClickedAt: 9000,
        source: 'all'
      }, id + ' receives one all-source click record');
    });
    assert.strictEqual(harness.calls.set, 1, 'all uses one storage mutation');
    assert.strictEqual(renderCount, 1, 'all persistence adds no render');
    assert.strictEqual(envelope.schemaVersion, 7, 'all preserves unknown siblings');
  }

  console.log('--- copy path attribution and unchanged feedback ---');
  {
    const harness = createHarness({});
    const clipboardWrites = [];
    let renderCount = 0;
    harness.api.setWriteClipboard((text) => { clipboardWrites.push(text); });
    harness.api.setRender(() => { renderCount++; });
    harness.api.state.iconIndex = 4;

    const result = harness.api.copyCommand('install windsurf', 'current');
    assert.strictEqual(result, undefined, 'visual copy path remains synchronous');
    assert.deepStrictEqual(clipboardWrites, ['install windsurf'], 'clipboard action runs once immediately');
    assert.strictEqual(renderCount, 1, 'copy action renders once immediately');
    assert.strictEqual(harness.api.state.copied, 'current', 'base copied state remains current');
    assert.strictEqual(harness.api.state.toast, 'Install command copied', 'one existing toast is shown');
    assert.deepStrictEqual(harness.timers.map((timer) => timer.delay), [1600, 2600],
      'copy schedules only the unchanged copied/toast timers');

    await harness.api.flushCopyWrites();
    const clicked = plain(harness.store.fsbAgentProviders.clicked);
    assert.deepStrictEqual(clicked.windsurf, {
      count: 1,
      firstClickedAt: 1000,
      lastClickedAt: 1000,
      source: 'base'
    }, 'current resolves to the visible rolled client at invocation time');
    assert.strictEqual(harness.calls.set, 1, 'base copy performs one storage mutation');
    assert.strictEqual(renderCount, 1, 'storage completion causes no additional render');

    const copiedTimer = harness.timers.find((timer) => timer.delay === 1600);
    copiedTimer.fn();
    assert.strictEqual(harness.api.state.copied, null, '1600 ms callback still clears copied state');
    assert.strictEqual(renderCount, 2, 'only the existing copied-state callback adds a later render');
    const toastTimer = harness.timers.find((timer) => timer.delay === 2600);
    toastTimer.fn();
    assert.strictEqual(harness.api.state.toast, '', '2600 ms callback still clears the toast');
  }

  console.log('--- fan attribution, serialized repeats, and failure isolation ---');
  {
    const harness = createHarness({});
    harness.api.setWriteClipboard(() => {});
    harness.api.setRender(() => {});
    harness.api.copyCommand('install codex', 'codex');
    harness.api.copyCommand('install codex', 'codex');
    await harness.api.flushCopyWrites();
    assert.deepStrictEqual(plain(harness.store.fsbAgentProviders.clicked.codex), {
      count: 2,
      firstClickedAt: 1000,
      lastClickedAt: 1000,
      source: 'fan'
    }, 'rapid fan clicks serialize without losing a count');
    assert.strictEqual(harness.calls.set, 2, 'each repeated fan action performs one mutation');
  }
  {
    const harness = createHarness({}, { rejectGet: true });
    let clipboardCount = 0;
    let renderCount = 0;
    harness.api.setWriteClipboard(() => { clipboardCount++; });
    harness.api.setRender(() => { renderCount++; });
    assert.doesNotThrow(() => harness.api.copyCommand('install cursor', 'cursor'),
      'storage rejection cannot throw through copyCommand');
    assert.strictEqual(clipboardCount, 1, 'storage rejection leaves clipboard behavior intact');
    assert.strictEqual(renderCount, 1, 'storage rejection leaves immediate render intact');
    assert.strictEqual(harness.api.state.toast, 'Install command copied', 'storage rejection leaves toast intact');
    await harness.api.flushCopyWrites();
    assert.strictEqual(harness.calls.set, 0, 'failed read does not attempt a malformed write');
    assert.strictEqual(renderCount, 1, 'swallowed storage rejection adds no render');
  }

  console.log('PASS onboarding-agent-provider-clicks.test.js');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
