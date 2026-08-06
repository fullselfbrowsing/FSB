'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(
  path.join(root, 'extension', 'ui', 'control_panel.html'),
  'utf8'
);
const css = fs.readFileSync(
  path.join(root, 'extension', 'ui', 'options.css'),
  'utf8'
);
const js = fs.readFileSync(
  path.join(root, 'extension', 'ui', 'options.js'),
  'utf8'
);

function extractElement(source, tagName, id) {
  const startPattern = new RegExp(
    `<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`,
    'i'
  );
  const startMatch = startPattern.exec(source);
  assert.ok(startMatch, `finds #${id}`);
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = startMatch.index;
  let depth = 0;
  let match;
  while ((match = tokenPattern.exec(source))) {
    depth += match[0][1] === '/' ? -1 : 1;
    if (depth === 0) return source.slice(startMatch.index, tokenPattern.lastIndex);
  }
  throw new Error(`unclosed #${id}`);
}

function extractFunction(source, name) {
  const signature = `function ${name}(`;
  const functionStart = source.indexOf(signature);
  assert.notEqual(functionStart, -1, `${name} exists`);
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const paramsOpen = source.indexOf('(', functionStart);
  let paramsDepth = 0;
  let paramsClose = -1;
  for (let index = paramsOpen; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1;
    if (source[index] === ')' && --paramsDepth === 0) {
      paramsClose = index;
      break;
    }
  }
  const brace = source.indexOf('{', paramsClose);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed ${name}`);
}

const apiSection = extractElement(html, 'section', 'api-config');
const providerSelects = html.match(/<select\b[^>]*\bid="modelProvider"[^>]*>[\s\S]*?<\/select>/gi) || [];
assert.equal(providerSelects.length, 1, 'there is exactly one visible provider selector');
assert.doesNotMatch(providerSelects[0], /\bhidden\b|aria-hidden="true"|tabindex="-1"/);
assert.deepEqual(
  Array.from(providerSelects[0].matchAll(/<option\s+value="([^"]+)"/g), (match) => match[1]),
  [
    'xai',
    'gemini',
    'openai',
    'anthropic',
    'openrouter',
    'lmstudio',
    'custom',
    'claude-code',
    'opencode',
    'codex'
  ],
  'the seven API providers are followed by the three local agents'
);
assert.equal((html.match(/data-section="api-config"/g) || []).length, 1);
assert.equal((html.match(/id="api-config"/g) || []).length, 1);
assert.doesNotMatch(html, /data-section="providers"|id="providers"/);

assert.match(apiSection, /id="apiProviderDetails"/);
assert.match(apiSection, /id="agentProviderDetails"[^>]*hidden/);
assert.match(apiSection, /id="agentProviderDetailsHeading"/);
assert.match(apiSection, /existing local sign-in/);
assert.equal((apiSection.match(/id="fullApiTest"/g) || []).length, 1);
assert.equal((apiSection.match(/>\s*Test Connection\s*</g) || []).length, 1);

for (const forbidden of [
  'providerRoster',
  'refreshProviderStatusBtn',
  'providerEvidenceAnnouncement',
  'agentProviderSetup',
  'agentProviderBilling',
  'agentProviderUsage',
  'mcpBridgePairingCode',
  'pairMcpBridgeBtn',
  'removeMcpBridgePairingBtn'
]) {
  assert.doesNotMatch(apiSection, new RegExp(forbidden), `${forbidden} is absent`);
}
assert.doesNotMatch(
  apiSection,
  /Recommended|Compatibility|Refresh status|Pair this browser|Remove Pairing/i
);
assert.doesNotMatch(
  css,
  /\.provider-roster|\.provider-row|\.compatibility-badge|\.mcp-bridge-pairing/
);

const normalizeSection = extractFunction(js, 'normalizeSectionId');
assert.match(normalizeSection, /sectionId === 'providers' \? 'api-config'/);
const renderKind = extractFunction(js, 'renderProviderKind');
assert.match(renderKind, /apiProviderDetails\.hidden = showAgentDetails/);
assert.match(renderKind, /agentProviderDetails\.hidden = !showAgentDetails/);

const selection = extractFunction(js, 'setProviderSelection');
assert.match(selection, /providerPanelState\.modelProvider = id/);
assert.match(selection, /providerPanelState\.agentProviderId = id/);
assert.doesNotMatch(selection, /providerPanelState\.modelProvider = id[\s\S]*?kind === 'agent'/);

const connectionTest = extractFunction(js, 'runFullApiTest');
assert.match(
  connectionTest,
  /action:\s*'testAgentProviderConnection',\s*providerId:\s*providerId/
);
assert.match(connectionTest, /result = await checkApiConnection\(\)/);

const keyboardShortcuts = extractFunction(js, 'handleKeyboardShortcuts');
assert.match(keyboardShortcuts, /runFullApiTest\(\)/);
assert.doesNotMatch(keyboardShortcuts, /testApiConnection\(\)/);
assert.doesNotMatch(js, /function testApiConnection\(/);

function testKeyboardConnectionShortcuts() {
  let testCalls = 0;
  let preventDefaultCalls = 0;
  const context = {
    dashboardState: { hasUnsavedChanges: false },
    saveSettings() {
      throw new Error('save path must not run for the connection shortcut');
    },
    discardChanges() {
      throw new Error('discard path must not run for the connection shortcut');
    },
    runFullApiTest() {
      testCalls += 1;
    }
  };
  vm.runInNewContext(
    `${keyboardShortcuts}\nthis.handleKeyboardShortcuts = handleKeyboardShortcuts;`,
    context,
    { filename: 'options.js#handleKeyboardShortcuts' }
  );
  for (const modifiers of [
    { ctrlKey: true, metaKey: false },
    { ctrlKey: false, metaKey: true }
  ]) {
    context.handleKeyboardShortcuts({
      key: 't',
      ...modifiers,
      preventDefault() {
        preventDefaultCalls += 1;
      }
    });
  }
  assert.equal(testCalls, 2, 'Ctrl+T and Cmd+T both use the unified connection test');
  assert.equal(preventDefaultCalls, 2, 'both connection shortcuts suppress the browser default');
}

async function renderAgentConnectionResponse(response) {
  const logs = [];
  const statusUpdates = [];
  const fullApiTest = {
    disabled: false,
    innerHTML: ''
  };
  const testResults = {
    innerHTML: '',
    classList: {
      add() {},
      remove() {}
    }
  };
  const apiStatusCard = { style: { display: 'block' } };
  const context = {
    chrome: {
      runtime: {
        async sendMessage(message) {
          assert.deepEqual(JSON.parse(JSON.stringify(message)), {
            action: 'testAgentProviderConnection',
            providerId: 'codex'
          });
          return response;
        }
      }
    },
    elements: {
      fullApiTest,
      testResults,
      apiStatusCard
    },
    providerPanelState: {
      providerKind: 'agent',
      agentProviderId: 'codex',
      modelProvider: 'xai'
    },
    getAgentProviderLabel() {
      return 'Codex';
    },
    async checkApiConnection() {
      throw new Error('API connection path must not run for an agent');
    },
    escapeHtml(value) {
      return String(value);
    },
    updateApiStatusCard() {
      statusUpdates.push(Array.from(arguments));
    },
    addLog() {
      logs.push(Array.from(arguments));
    }
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${connectionTest}\nthis.runFullApiTest = runFullApiTest;`,
    context,
    { filename: 'options.js#runFullApiTest' }
  );
  await context.runFullApiTest();
  return {
    html: testResults.innerHTML,
    button: fullApiTest,
    apiStatusCard,
    logs,
    statusUpdates
  };
}

async function testAgentConnectionRendering() {
  const success = await renderAgentConnectionResponse({
    success: true,
    ok: true,
    providerId: 'codex'
  });
  assert.match(success.html, /<strong>Status:<\/strong>\s*Success/);
  assert.doesNotMatch(success.html, /<strong>Error:<\/strong>|Connection test failed/);
  assert.equal(success.apiStatusCard.style.display, 'none');
  assert.deepEqual(success.statusUpdates, []);

  const backendFailure = await renderAgentConnectionResponse({
    success: true,
    ok: false,
    providerId: 'codex',
    errorCode: 'auth_unauthenticated',
    message: 'Sign in to Codex locally, then try again.'
  });
  assert.match(backendFailure.html, /<strong>Status:<\/strong>\s*Failed/);
  assert.match(backendFailure.html, /Sign in to Codex locally, then try again\./);
  assert.deepEqual(backendFailure.statusUpdates, [[
    'disconnected',
    'Connection Failed',
    'Sign in to Codex locally, then try again.'
  ]]);

  const codeFailure = await renderAgentConnectionResponse({
    success: true,
    ok: false,
    errorCode: 'connection_test_timeout'
  });
  assert.match(codeFailure.html, /connection test timeout/);

  const fallbackFailure = await renderAgentConnectionResponse(null);
  assert.match(fallbackFailure.html, /Connection test failed/);
}

const apiTest = extractFunction(js, 'checkApiConnection');
assert.doesNotMatch(apiTest, /chrome\.storage/);
for (const id of [
  'apiKey',
  'geminiApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'customApiKey',
  'openrouterApiKey',
  'lmstudioBaseUrl'
]) {
  assert.match(apiTest, new RegExp(id), `API test reads unsaved #${id}`);
}

const save = extractFunction(js, 'saveSettings');
assert.match(save, /providerKind:\s*normalizedProviderSettings\.providerKind/);
assert.match(save, /agentProviderId:\s*normalizedProviderSettings\.agentProviderId/);
assert.match(save, /modelProvider:\s*normalizedProviderSettings\.modelProvider/);
const discard = extractFunction(js, 'discardChanges');
assert.match(discard, /loadSettings\(\)/);

testKeyboardConnectionShortcuts();
testAgentConnectionRendering()
  .then(() => console.log('providers-panel-ui.test.js: PASS'))
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
