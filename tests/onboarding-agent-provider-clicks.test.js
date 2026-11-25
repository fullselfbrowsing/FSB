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
  'antigravity',
  'codex',
  'opencode',
  'cline',
  'gemini'
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
    Date: opts.realDate ? Date : { now: () => now },
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
  if (opts.sendMessage) context.chrome.runtime.sendMessage = opts.sendMessage;
  context.globalThis = context;

  const testFooter = `
    globalThis.__ONBOARDING_AGENT_PROVIDER_TEST__ = {
      state,
      els,
      handlers,
      bindInteractions,
      renderStepper,
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
  assert.deepStrictEqual(sourceAllIds, ALL_CLIENT_IDS, 'all expands to the exact nine flag-backed ids');
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
  assert(copyCommandSource.includes("showToast(ob('entry_toast_copied', 'Install command copied'))"), 'copy toast text remains exact');
  assert(showToastSource.includes('}, 2600);'), 'toast still uses the 2600 ms timer');
  assert(!/\brender(?:Toast)?\s*\(/.test(persistSource), 'persistence does not render or toast');

  assert.strictEqual(
    sha256(ONBOARDING_HTML_PATH),
    'c2b75c8a5ca86333e4a73200136bb118a1d5f3845d88e59cd5a7296bddd5c3e3',
    'onboarding.html hash rolled: the stage label no longer mentions scrolling, which the wheel no longer does'
  );
  assert.strictEqual(
    sha256(ONBOARDING_CSS_PATH),
    'c82125be8b8689ce82a339e3d0ab7207115cb4f0a9d0834de678a5ef072040ec',
    'onboarding.css hash rolled: the wordmark B is 0.74em tall, level with the black S, as in the showcase fsb-wordmark.css'
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
      'all writes exactly nine clicked entries');
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

    const result = harness.api.copyCommand('install antigravity', 'current');
    assert.strictEqual(result, undefined, 'visual copy path remains synchronous');
    assert.deepStrictEqual(clipboardWrites, ['install antigravity'], 'clipboard action runs once immediately');
    assert.strictEqual(renderCount, 1, 'copy action renders once immediately');
    assert.strictEqual(harness.api.state.copied, 'current', 'base copied state remains current');
    assert.strictEqual(harness.api.state.toast, 'Install command copied', 'one existing toast is shown');
    assert.deepStrictEqual(harness.timers.map((timer) => timer.delay), [1600, 2600],
      'copy schedules only the unchanged copied/toast timers');

    await harness.api.flushCopyWrites();
    const clicked = plain(harness.store.fsbAgentProviders.clicked);
    assert.deepStrictEqual(clicked.antigravity, {
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

  console.log('--- rail ticks follow the live key state after an in-place reset ---');
  {
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    // Drives the real bound handlers; a render redraws only the rail, so its markup can be read back.
    function railHarness(options) {
      const harness = createHarness({}, Object.assign({ realDate: true }, options));
      const { api } = harness;
      const nodes = { innerHTML: '' };
      Object.assign(api.els, {
        nodes,
        stepLabel: { textContent: '' },
        trackFill: { style: {} },
        screen: { querySelector: () => null }
      });
      api.setRender(() => api.renderStepper());
      api.bindInteractions();
      const handler = (selector, eventName) => {
        const entry = api.handlers.find((item) => item.selector === selector && item.eventName === eventName);
        assert(entry, selector + ' ' + eventName + ' is bound');
        return entry.handler;
      };
      // The rail button for a step, as currently drawn.
      const tick = (step) => {
        const tag = (nodes.innerHTML.match(new RegExp('<button [^>]*data-step="' + step + '"[^>]*>')) || [])[0];
        assert(tag, step + ' has a rail tick');
        return {
          disabled: /\sdisabled(?=[\s>])/.test(tag),
          aria: (tag.match(/aria-label="([^"]*)"/) || [])[1],
          dataset: { step }
        };
      };
      return { harness, api, handler, tick, press: handler('.fsb-depth-go[data-step]', 'click') };
    }

    // BYOK: a validated key has moved on to Pin; the rail goes back to API Key and the key is edited.
    {
      const { harness, api, handler, tick, press } = railHarness();
      Object.assign(api.state, { path: 'byok', provider: 'xai', apiKey: 'xai-good', keyStatus: 'valid', screen: 'pin' });
      api.renderStepper();
      press({}, tick('apikey'));
      assert.strictEqual(api.state.screen, 'apikey', 'the back tick returns to API Key');
      const staleDone = tick('done');
      assert.strictEqual(staleDone.disabled, false, 'with a valid key the Done tick is open');

      handler('#obKeyInput', 'input')({ target: { value: 'xai-good1' } });
      assert.strictEqual(api.state.keyStatus, 'idle', 'one keystroke resets the key status in place');
      assert.strictEqual(tick('done').disabled, true, 'the in-place reset closes the Done tick');
      assert.strictEqual(tick('done').aria, 'Done, not reached yet', 'the Done tick says it is not reached');
      assert.strictEqual(tick('pin').disabled, true, 'the in-place reset closes the Pin tick');
      assert.strictEqual(tick('provider').disabled, false, 'the back tick to Provider stays open');
      assert.strictEqual(tick('provider').aria, 'Back to Provider', 'the back tick keeps its label');

      // A tick drawn before the edit still reads as enabled; the press must ask the live state.
      press({}, staleDone);
      await flush();
      assert.strictEqual(api.state.screen, 'apikey', 'a stale Done tick does not leave an unvalidated key');
      assert.strictEqual(harness.store.fsbOnboardingCompleted, undefined, 'a stale Done tick does not finish onboarding');
      assert.strictEqual(harness.calls.set, 0, 'a stale Done tick writes nothing');

      press({}, tick('provider'));
      assert.strictEqual(api.state.screen, 'provider', 'back ticks still go back');
      assert.strictEqual(tick('pin').disabled, true, 'a forward jump from Provider stops at the unanswered key');
      press({}, tick('apikey'));
      assert.strictEqual(api.state.screen, 'apikey', 'a forward tick reaches the step that needs an answer');

      api.state.keyStatus = 'valid';
      api.renderStepper();
      press({}, tick('done'));
      await flush();
      assert.strictEqual(api.state.screen, 'done', 'once the key validates again the Done tick finishes');
      assert.strictEqual(harness.store.fsbOnboardingCompleted, true, 'finishing records completion');
      assert.strictEqual(harness.store.fsbOnboardingSkipped, false, 'a rail finish is not a skip');
    }

    // LM Studio: choosing another model resets the status in place the same way.
    {
      const { harness, api, handler, tick, press } = railHarness();
      Object.assign(api.state, {
        path: 'byok',
        provider: 'lmstudio',
        lmstudioModel: 'model-a',
        lmstudioDiscoveryStatus: 'ready',
        lmstudioDiscoveryMessage: '2 chat models found — choose one',
        keyStatus: 'valid',
        keyMessage: 'LM Studio responded successfully',
        screen: 'apikey'
      });
      // The status area as drawn for model A after its check passed.
      const fieldClasses = new Set(['ob3-field', 'is-ok']);
      const field = { classList: { remove: (...names) => names.forEach((name) => fieldClasses.delete(name)) } };
      const icon = { innerHTML: '<i class="fa-solid fa-circle-check ok"></i>' };
      const msg = { className: 'ob-status-msg ok', textContent: 'LM Studio responded successfully' };
      const statusNodes = { '.ob3-field': field, '.ob-status': icon, '.ob-status-msg': msg };
      api.els.screen = { querySelector: (selector) => statusNodes[selector] || null };
      api.renderStepper();
      const staleDone = tick('done');
      assert.strictEqual(staleDone.disabled, false, 'a validated LM Studio model opens the Done tick');
      handler('#obLocalModelSelect', 'change')({ target: { value: 'model-b' } });
      assert.strictEqual(api.state.keyStatus, 'idle', 'a new model resets the check');
      assert.strictEqual(tick('done').disabled, true, 'a new model closes the Done tick');
      assert.strictEqual(fieldClasses.has('is-ok'), false, 'a new model drops the passed-check field state');
      assert.strictEqual(msg.textContent, '2 chat models found — choose one', 'a new model shows the discovery message, not the old success');
      assert.strictEqual(msg.className, 'ob-status-msg ok', 'the discovery message keeps the ready colour');
      assert.strictEqual(icon.innerHTML, '<i class="fa-solid fa-circle-check ok"></i>', 'the icon shows discovery is ready, as a full render does');
      press({}, staleDone);
      await flush();
      assert.strictEqual(api.state.screen, 'apikey', 'a stale Done tick does not skip the new model check');
      assert.strictEqual(harness.calls.set, 0, 'a stale Done tick writes nothing after a model change');
    }

    console.log('--- a connection test only counts for the key it checked ---');
    // Each connection test is held until the test answers it, the way a slow network would.
    function checkHarness() {
      const checks = [];
      const rail = railHarness({ sendMessage: (message, answer) => { checks.push({ message, answer }); } });
      Object.assign(rail.api.state, { path: 'byok', provider: 'xai', apiKey: 'xai-old-key-1234', screen: 'apikey' });
      rail.api.renderStepper();
      return Object.assign(rail, { checks, next: rail.handler('[data-nav="next"]', 'click') });
    }

    // Back to Provider while xAI is being checked, then Anthropic: the late answer is for xAI.
    {
      const { harness, api, handler, tick, checks, next } = checkHarness();
      next();
      assert.strictEqual(checks.length, 1, 'Continue sends one connection test');
      assert.strictEqual(api.state.validating, true, 'the test is in flight');
      handler('[data-nav="back"]', 'click')();
      assert.strictEqual(api.state.screen, 'provider', 'Back still works while the test runs');
      handler('[data-provider]', 'click')({}, { dataset: { provider: 'anthropic' } });
      checks[0].answer({ ok: true });
      await flush();
      await flush();
      assert.strictEqual(api.state.keyStatus, 'idle', 'an answer for another provider does not validate this one');
      assert.strictEqual(api.state.validating, false, 'the late answer still ends the busy state');
      assert.strictEqual(harness.calls.set, 0, 'the late answer stores nothing');
      assert.strictEqual(harness.store.modelProvider, undefined, 'storage keeps no xAI settings');
      assert.strictEqual(tick('pin').disabled, true, 'the Pin tick stays closed');
      assert.strictEqual(tick('done').disabled, true, 'the Done tick stays closed');

      next();
      assert.strictEqual(api.state.screen, 'apikey', 'Next reaches the Anthropic key step');
      next();
      await flush();
      assert.strictEqual(api.state.screen, 'apikey', 'an empty Anthropic key does not move on');
      assert.strictEqual(api.state.keyStatus, 'invalid', 'an empty Anthropic key is refused');
      assert.strictEqual(api.state.keyMessage, 'Anthropic API key is required', 'the refusal names the provider on screen');
      assert.strictEqual(checks.length, 1, 'no connection test is sent for an empty key');
    }

    // The key is edited while the old one is being checked.
    {
      const { harness, api, handler, checks, next } = checkHarness();
      next();
      handler('#obKeyInput', 'input')({ target: { value: 'xai-new-key-5678' } });
      checks[0].answer({ ok: true });
      await flush();
      await flush();
      assert.strictEqual(api.state.keyStatus, 'idle', 'an answer for the old key does not validate the edit');
      assert.strictEqual(api.state.validating, false, 'Continue is free again');
      assert.strictEqual(api.state.screen, 'apikey', 'the wizard stays on the key step');
      assert.strictEqual(harness.calls.set, 0, 'the old key is not stored');

      next();
      assert.strictEqual(checks.length, 2, 'Continue checks the edited key');
      assert.strictEqual(checks[1].message.config.apiKey, 'xai-new-key-5678', 'the new test carries the edited key');
      checks[1].answer({ ok: true });
      await flush();
      await flush();
      assert.strictEqual(api.state.keyStatus, 'valid', 'a key that did not change while it was checked validates');
      assert.strictEqual(harness.store.modelProvider, 'xai', 'the checked provider is stored');
      assert.strictEqual(harness.store.apiKey, 'xai-new-key-5678', 'the checked key is stored');
    }

    // A failure for the old provider must not mark the new one wrong.
    {
      const { api, handler, checks, next } = checkHarness();
      next();
      handler('[data-nav="back"]', 'click')();
      handler('[data-provider]', 'click')({}, { dataset: { provider: 'anthropic' } });
      checks[0].answer({ ok: false, error: 'Invalid xAI key' });
      await flush();
      await flush();
      assert.strictEqual(api.state.keyStatus, 'idle', 'a late failure leaves the new provider unchecked, not invalid');
      assert.strictEqual(api.state.keyMessage, '', 'a late failure shows no message');
      assert.strictEqual(api.state.validating, false, 'a late failure ends the busy state');
    }
  }

  console.log('PASS onboarding-agent-provider-clicks.test.js');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
