const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const initConfigPath = path.join(ROOT, 'extension', 'config', 'init-config.js');
const onboardingHtmlPath = path.join(ROOT, 'extension', 'ui', 'onboarding.html');
const onboardingCssPath = path.join(ROOT, 'extension', 'ui', 'onboarding.css');
const onboardingJsPath = path.join(ROOT, 'extension', 'ui', 'onboarding.js');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

async function loadInitConfigHarness() {
  const createdTabs = [];
  const openedOptions = [];
  const storageSets = [];
  let installListener = null;

  const context = {
    console,
    chrome: {
      runtime: {
        getManifest: () => ({ version: '0.9.91' }),
        getURL: (rel) => `chrome-extension://fsb/${rel}`,
        openOptionsPage: () => openedOptions.push(true),
        onInstalled: {
          addListener: (fn) => { installListener = fn; }
        }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async (patch) => { storageSets.push(patch); }
        }
      },
      tabs: {
        create: async (opts) => { createdTabs.push(opts); }
      }
    }
  };

  vm.runInNewContext(fs.readFileSync(initConfigPath, 'utf8'), context, { filename: initConfigPath });
  assert.strictEqual(typeof installListener, 'function', 'init-config registers an onInstalled listener');
  return { installListener, createdTabs, openedOptions, storageSets };
}

(async function run() {
  console.log('--- onboarding first-run install opener ---');
  {
    const harness = await loadInitConfigHarness();
    await harness.installListener({ reason: 'update' });
    assert.strictEqual(harness.createdTabs.length, 0, 'update does not open onboarding');
    assert.strictEqual(harness.openedOptions.length, 0, 'update does not open options');

    await harness.installListener({ reason: 'install' });
    assert.strictEqual(harness.openedOptions.length, 0, 'install does not call chrome.runtime.openOptionsPage');
    assert.strictEqual(harness.createdTabs.length, 1, 'install opens exactly one tab');
    assert.strictEqual(harness.createdTabs[0].url, 'chrome-extension://fsb/ui/onboarding.html', 'install opens ui/onboarding.html');
    assert.strictEqual(harness.createdTabs[0].active, true, 'install opens onboarding in an active tab');
    assert(
      harness.storageSets.some((patch) => patch.modelProvider === 'xai' && patch.modelName === 'grok-4-1-fast'),
      'install initializes real modelProvider/modelName defaults'
    );
    assert(
      harness.storageSets.some((patch) => typeof patch.fsbOnboardingAutoOpenedAt === 'string'),
      'install records onboarding auto-open timestamp'
    );
  }

  console.log('--- onboarding page is extension-safe markup ---');
  {
    const html = fs.readFileSync(onboardingHtmlPath, 'utf8');
    const css = fs.readFileSync(onboardingCssPath, 'utf8');
    const forbidden = [
      /<x-dc/i,
      /<\/x-dc/i,
      /text\/x-dc/i,
      /data-dc/i,
      /support\.js/i,
      /\.dc\.html/i,
      /cdnjs/i,
      /fonts\.googleapis/i
    ];
    forbidden.forEach((pattern) => {
      assert(!pattern.test(html), `onboarding.html excludes ${pattern}`);
      assert(!pattern.test(css), `onboarding.css excludes ${pattern}`);
    });
    assert(!/<link[^>]+https?:\/\//i.test(html), 'onboarding.html has no remote stylesheet/script links');
    assert(!/@import\s+url\(["']?https?:\/\//i.test(css), 'onboarding.css has no remote font imports');
    assert(html.includes('onboarding.js'), 'onboarding.html loads onboarding.js');
    assert(html.includes('onboarding.css'), 'onboarding.html loads onboarding.css');
  }

  console.log('--- onboarding provider storage mapping ---');
  {
    const context = {
      chrome: { runtime: { getManifest: () => ({ version: '0.9.91' }) } },
      document: { addEventListener: () => {} },
      window: { addEventListener: () => {} },
      console,
      setInterval: () => 1,
      clearInterval: () => {}
    };
    context.globalThis = context;
    vm.runInNewContext(fs.readFileSync(onboardingJsPath, 'utf8'), context, { filename: onboardingJsPath });
    assert.strictEqual(
      JSON.stringify(context.FSB_ONBOARDING_PROVIDER_KEY_FIELDS),
      JSON.stringify({
        xai: 'apiKey',
        gemini: 'geminiApiKey',
        openai: 'openaiApiKey',
        anthropic: 'anthropicApiKey',
        openrouter: 'openrouterApiKey'
      }),
      'BYOK providers map to control-panel storage fields'
    );
    const clientIds = context.FSB_ONBOARDING_INSTALL_CLIENTS.map((client) => client.id).sort();
    assert.strictEqual(
      JSON.stringify(clientIds),
      JSON.stringify(['all', 'claude-code', 'claude-desktop', 'codex', 'cursor', 'openclaw', 'opencode', 'vscode', 'windsurf'].sort()),
      'MCP install client list includes all planned targets'
    );
  }

  console.log('--- onboarding validation dispatch contract ---');
  {
    const js = fs.readFileSync(onboardingJsPath, 'utf8');
    assert(
      /chrome\.runtime\.sendMessage\(\{\s*action:\s*'lattice-test-connection',\s*provider,\s*config\s*\}/.test(js),
      'BYOK validation dispatches lattice-test-connection with provider/config'
    );
    assert(js.includes("patch[PROVIDER_KEY_FIELDS[provider.id]] = key;"), 'BYOK validation saves selected provider key field');
    assert(js.includes("patch.lmstudioBaseUrl = baseUrl;"), 'LM Studio validation saves lmstudioBaseUrl');
    assert(js.includes("chrome.sidePanel.open"), 'Open FSB uses chrome.sidePanel.open');
    assert(js.includes("url: chrome.runtime.getURL('ui/popup.html')"), 'Open FSB has popup fallback');
  }

  console.log('--- onboarding input focus preservation ---');
  {
    const js = fs.readFileSync(onboardingJsPath, 'utf8');
    // The key/URL input handlers must NOT full-render per keystroke: render()
    // rebuilds els.screen.innerHTML, destroying the focused input (the caret
    // jumped out after every character). They reset the status area in place.
    assert(js.includes('function resetKeyStatusIdle()'), 'in-place status reset helper exists');
    const keyHandlerStart = js.indexOf("bind('#obKeyInput', 'input'");
    const localHandlerStart = js.indexOf("bind('#obLocalUrlInput', 'input'");
    const revealStart = js.indexOf("bind('#obRevealKey'");
    assert(keyHandlerStart !== -1 && localHandlerStart !== -1 && revealStart !== -1,
      'apikey screen binds key input, local URL input, and reveal button');
    const keyHandler = js.slice(keyHandlerStart, localHandlerStart);
    assert(keyHandler.includes('resetKeyStatusIdle()') && !keyHandler.includes('render()'),
      '#obKeyInput input handler resets status in place (no focus-destroying render)');
    const localHandler = js.slice(localHandlerStart, revealStart);
    assert(localHandler.includes('resetKeyStatusIdle()') && !localHandler.includes('render()'),
      '#obLocalUrlInput input handler resets status in place (no focus-destroying render)');
  }

  console.log('PASS onboarding-first-run.test.js');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
