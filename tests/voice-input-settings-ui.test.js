'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'extension/ui/control_panel.html'), 'utf8');
const optionsSource = fs.readFileSync(path.join(root, 'extension/ui/options.js'), 'utf8');
const controllerSource = fs.readFileSync(
  path.join(root, 'extension/ui/voice-input-settings.js'),
  'utf8'
);

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

function makeButton() {
  const listeners = {};
  const label = { textContent: '' };
  return {
    hidden: true,
    textContent: '',
    label,
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelector(selector) { return selector === 'span' ? label : null; },
    click() { return listeners.click?.(); }
  };
}

function makeHarness(permissionState = 'prompt', options = {}) {
  const status = makePermissionStatus(permissionState);
  const tabsOpened = [];
  const errors = [];
  const sandbox = {
    navigator: {},
    chrome: {},
    console,
    Promise
  };
  vm.createContext(sandbox);
  vm.runInContext(controllerSource, sandbox, { filename: 'voice-input-settings.js' });

  const statusElement = { textContent: '', dataset: {} };
  const detailElement = { textContent: '' };
  const permissionButton = makeButton();
  const settingsButton = makeButton();
  const permissions = options.permissionsUnsupported ? {} : {
    async query(descriptor) {
      assert.strictEqual(descriptor.name, 'microphone');
      return status;
    }
  };
  const mediaDevices = options.mediaDevicesUnsupported ? {} : {
    async getUserMedia() {}
  };
  const tabs = {
    async create(details) {
      tabsOpened.push(details);
      return { id: tabsOpened.length };
    }
  };
  const runtime = {
    getURL(relativePath) {
      return `chrome-extension://test-extension/${relativePath}`;
    }
  };

  const controller = new sandbox.FSBVoiceInputSettings.VoiceInputSettingsController({
    statusElement,
    detailElement,
    permissionButton,
    settingsButton,
    permissions,
    mediaDevices,
    tabs,
    runtime,
    onError(message) { errors.push(message); }
  });

  return {
    controller,
    status,
    statusElement,
    detailElement,
    permissionButton,
    settingsButton,
    tabsOpened,
    errors
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('Advanced Settings markup and options persistence use a default-on feature switch', () => {
  const privacyHeading = html.indexOf('Privacy &amp; Developer');
  const voiceCard = html.indexOf('id="voiceInputSettings"');
  const developerCard = html.indexOf('<!-- Developer Card -->');
  assert.ok(privacyHeading !== -1 && privacyHeading < voiceCard && voiceCard < developerCard);
  assert.match(html, /id="voiceInputEnabled" checked/);
  assert.match(html, /id="voiceInputPermissionStatus"/);
  assert.match(html, /id="voiceInputPermissionAction"/);
  assert.match(html, /id="voiceInputChromeSettings"/);
  assert.ok(
    html.indexOf('<script src="voice-input-settings.js"></script>') <
      html.indexOf('<script src="options.js"></script>')
  );

  const providerToggle = html.indexOf('id="sttProvider"');
  const advancedSection = html.indexOf('id="advanced"');
  assert.ok(providerToggle !== -1 && providerToggle < advancedSection,
    'the Whisper provider toggle remains in API Configuration');

  assert.match(optionsSource, /voiceInputEnabled\s*:\s*true/);
  assert.match(optionsSource, /elements\.voiceInputEnabled\s*=\s*document\.getElementById\('voiceInputEnabled'\)/);
  assert.match(optionsSource, /elements\.voiceInputEnabled,[\s\S]{0,180}formInputs\.forEach/);
  assert.match(optionsSource, /elements\.voiceInputEnabled\.checked\s*=\s*voiceInputEnabled/);
  assert.match(optionsSource, /voiceInputEnabled\s*:\s*elements\.voiceInputEnabled\?\.checked\s*\?\?\s*true/);
  assert.match(optionsSource, /function discardChanges\(\)[\s\S]{0,100}loadSettings\(\)/);
  assert.match(optionsSource, /handleSavedChange\(\s*previousVoiceInputEnabled,\s*settings\.voiceInputEnabled/);
});

test('permission states expose the correct setup and recovery actions', async () => {
  const h = makeHarness('prompt');
  await h.controller.init();
  assert.strictEqual(h.statusElement.dataset.state, 'prompt');
  assert.ok(h.statusElement.textContent.includes('Setup required'));
  assert.strictEqual(h.permissionButton.hidden, false);
  assert.strictEqual(h.permissionButton.label.textContent, 'Enable microphone');
  assert.strictEqual(h.settingsButton.hidden, true);

  h.permissionButton.click();
  await Promise.resolve();
  assert.strictEqual(
    h.tabsOpened[0].url,
    'chrome-extension://test-extension/ui/microphone-permission.html'
  );

  h.status.setState('granted');
  assert.strictEqual(h.statusElement.dataset.state, 'granted');
  assert.ok(h.statusElement.textContent.includes('Allowed'));
  assert.strictEqual(h.permissionButton.hidden, true);
  assert.strictEqual(h.settingsButton.hidden, false);

  h.status.setState('denied');
  assert.strictEqual(h.statusElement.dataset.state, 'denied');
  assert.ok(h.statusElement.textContent.includes('Blocked'));
  assert.strictEqual(h.permissionButton.hidden, false);
  assert.strictEqual(h.permissionButton.label.textContent, 'Review microphone access');
  assert.strictEqual(h.settingsButton.hidden, false);

  h.settingsButton.click();
  await Promise.resolve();
  assert.strictEqual(h.tabsOpened.at(-1).url, 'chrome://settings/content/microphone');
});

test('unsupported microphone access is reported without unusable actions', async () => {
  const h = makeHarness('prompt', { mediaDevicesUnsupported: true });
  await h.controller.init();
  assert.strictEqual(h.statusElement.dataset.state, 'unavailable');
  assert.ok(h.statusElement.textContent.includes('Unavailable'));
  assert.ok(h.detailElement.textContent.includes('does not provide microphone access'));
  assert.strictEqual(h.permissionButton.hidden, true);
  assert.strictEqual(h.settingsButton.hidden, true);
});

test('only a saved off-to-on transition automatically opens permission setup', async () => {
  const h = makeHarness('prompt');
  await h.controller.init();
  assert.strictEqual(h.tabsOpened.length, 0);

  assert.strictEqual(await h.controller.handleSavedChange(true, true), false);
  assert.strictEqual(await h.controller.handleSavedChange(false, false), false);
  assert.strictEqual(h.tabsOpened.length, 0, 'unrelated saves must not open permission UI');

  assert.strictEqual(await h.controller.handleSavedChange(false, true), true);
  assert.strictEqual(h.tabsOpened.length, 1);

  const granted = makeHarness('granted');
  await granted.controller.init();
  assert.strictEqual(await granted.controller.handleSavedChange(false, true), false);
  assert.strictEqual(granted.tabsOpened.length, 0, 'an existing grant must not prompt again');
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
    console.error(`\n${failures} voice-input settings test(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${tests.length} voice-input settings tests passed.`);
  }
})();
