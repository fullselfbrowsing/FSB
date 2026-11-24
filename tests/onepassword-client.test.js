'use strict';

// extension/utils/onepassword-client.js: the service-worker side of 1Password.
// Checks that only the page origin is sent, fills land only on that origin
// (scheme, host, and port), fill results carry no secrets, cards are read only
// after a trusted approval for the same merchant, the autopilot refuses to
// guess between logins, the old vault moves in batches that are erased only
// once 1Password confirms them, and transport failures map to actionable codes.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'utils', 'onepassword-client.js'), 'utf8');
const EXT_ID = 'fsb-test-extension';

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  PASS:', name);
  } catch (error) {
    console.error('  FAIL:', name);
    throw error;
  }
}

function makeEnv({
  tabUrls = ['https://example.com/login?next=/home'],
  responses = {},
  connected = true,
  transportError = null,
  pairingStatus = 'paired',
  // Stands in for background.js's fsbEnsureAgentBridgeReady; null leaves it out.
  ensureReady = null,
  // Whether the side panel answers the card prompt with { shown: true }.
  panelShows = true,
} = {}) {
  const requests = [];
  const pairing = { status: pairingStatus, ensureCalls: 0 };
  const listeners = new Set();
  const runtimeSent = [];
  let tabCall = 0;
  const chrome = {
    runtime: {
      id: EXT_ID,
      onMessage: {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      },
      sendMessage: async (message) => {
        runtimeSent.push(message);
        // The side panel confirms it put the card prompt on screen.
        return message && message.action === 'paymentFillConfirmation' && panelShows ? { shown: true } : undefined;
      },
    },
    tabs: {
      get: async (tabId) => {
        const url = tabUrls[Math.min(tabCall, tabUrls.length - 1)];
        tabCall += 1;
        return { id: tabId, url };
      },
    },
  };
  const mcpBridgeClient = {
    isConnected: connected,
    getState: () => ({ connected, pairingStatus: pairing.status }),
    async sendExtRequest(method, payload) {
      requests.push({ method, payload: JSON.parse(JSON.stringify(payload)) });
      if (transportError) throw transportError;
      const answer = responses[method];
      return typeof answer === 'function' ? answer(payload) : answer;
    },
  };
  const context = {
    chrome,
    mcpBridgeClient,
    armMcpBridge: () => {},
    ...(ensureReady ? {
      fsbEnsureAgentBridgeReady: async () => {
        pairing.ensureCalls += 1;
        return ensureReady(pairing);
      },
    } : {}),
    URL,
    console,
    crypto: require('node:crypto').webcrypto,
    Uint8Array,
    // Bridge polling sleeps collapse to 0ms; the 2-minute approval timeout stays real.
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? ms : 0),
    clearTimeout: (handle) => clearTimeout(handle),
    Promise,
  };
  context.self = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'onepassword-client.js' });
  const deliver = (message, sender) => {
    for (const listener of [...listeners]) listener(message, sender, () => {});
  };
  return { api: context.fsbOnePassword, requests, runtimeSent, deliver, listeners, pairing, context };
}

// The service worker loads mcp-bridge-client.js, which declares the client as
// a top-level const, before this file. Such a binding is shared by name across
// importScripts files but is never a property of self, so this loads both
// scripts into one context the same way instead of placing a fake on self.
async function statusThroughDeclaredBridge() {
  const requests = [];
  const context = vm.createContext({
    chrome: { runtime: { id: EXT_ID, onMessage: { addListener() {}, removeListener() {} } } },
    URL,
    console,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? ms : 0),
    clearTimeout,
    Promise,
    recordBridgeRequest: (method, payload) => {
      requests.push({ method, payload });
      return { ok: true, status: { configured: true } };
    },
  });
  context.self = context;
  vm.runInContext(`
    const mcpBridgeClient = {
      isConnected: true,
      getState() { return { connected: true, pairingStatus: 'paired' }; },
      async sendExtRequest(method, payload) { return recordBridgeRequest(method, payload); },
    };
    function armMcpBridge() {}
  `, context, { filename: 'mcp-bridge-client.js' });
  vm.runInContext(source, context, { filename: 'onepassword-client.js' });
  return { result: await context.fsbOnePassword.status(), requests, onSelf: context.mcpBridgeClient };
}

// --- content-script fill (extension/content/actions.js) --------------------
// Runs fillCredentialFields and its helpers from the real file against a small
// fake DOM: elements with parents, attributes, labels, visibility, and a value
// setter on the input prototype.

const actionsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', 'actions.js'), 'utf8');
const fillStart = actionsSource.indexOf('  const OTP_FIELD_PATTERN');
const fillEnd = actionsSource.indexOf('  tools.fillPaymentFields = ');
assert.ok(fillStart > 0 && fillEnd > fillStart, 'actions.js credential fill block not found');
const fillSource = actionsSource.slice(fillStart, fillEnd);

class FakeElement {
  constructor(attrs = {}, parent = null, tagName = 'div') {
    this.attrs = { ...attrs };
    this.parentElement = parent;
    this.tagName = tagName;
    this.visible = true;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : null;
  }
  contains(other) {
    for (let node = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }
  // Tag names and [role="group"] only, which is all the fill code asks for.
  closest(selectors) {
    const wanted = selectors.split(',').map((entry) => entry.trim());
    for (let node = this; node; node = node.parentElement) {
      if (wanted.some((sel) => (sel === '[role="group"]' ? node.getAttribute('role') === 'group' : node.tagName === sel))) {
        return node;
      }
    }
    return null;
  }
  get offsetParent() { return this.visible ? (this.parentElement || {}) : null; }
}

function makeFillDom() {
  class HTMLInputElement extends FakeElement {
    get value() { return this._value || ''; }
    set value(next) { this._value = String(next); }
    get type() { return (this.getAttribute('type') || 'text').toLowerCase(); }
    get name() { return this.getAttribute('name') || ''; }
    get id() { return this.getAttribute('id') || ''; }
    get labels() { return this.labelText ? [{ textContent: this.labelText }] : []; }
    focus() {}
    dispatchEvent() { return true; }
  }
  class HTMLTextAreaElement extends HTMLInputElement {}
  const documentElement = new FakeElement({}, null, 'html');
  const body = new FakeElement({}, documentElement, 'body');
  const form = new FakeElement({}, body, 'form');
  const inputs = [];
  const input = (attrs, parent = form, extra = {}) => {
    const element = Object.assign(new HTMLInputElement(attrs, parent, 'input'), extra);
    inputs.push(element);
    return element;
  };
  const tools = {};
  const context = {
    tools,
    window: { location: { origin: 'https://example.com' } },
    document: { body, documentElement, querySelectorAll: () => inputs.slice() },
    HTMLInputElement,
    HTMLTextAreaElement,
    Event: class Event { constructor(type) { this.type = type; } },
    FSB: {
      inferElementPurpose(element) {
        if (element.type === 'password') return { role: 'credential-input', intent: 'password' };
        if (element.purpose === 'username') return { role: 'credential-input', intent: 'username' };
        return null;
      },
    },
  };
  vm.runInNewContext(fillSource, context, { filename: 'actions.js' });
  const fill = (params) => tools.fillCredentialFields({ expectedOrigin: 'https://example.com', ...params });
  return { form, input, fill, wrapper: (parent = form) => new FakeElement({}, parent) };
}

const trusted = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/ui/sidepanel.html` };
const login = { id: 'v:a', title: 'Example', username: 'alice', password: 'hunter2', oneTimeCode: '123456', match: 'exact' };
const card = {
  id: 'v:c', title: 'Visa', cardBrand: 'visa', last4: '1111', cardNumber: '4111111111111111', cvv: '737',
  expiryMonth: '12', expiryYear: '2031', cardholderName: 'Alice', addressLine1: '1 Main St', city: 'Chicago',
  stateRegion: 'IL', postalCode: '60601', country: 'US',
};

async function waitFor(predicate) {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('condition not reached');
}

async function run() {
  console.log('\n--- logins ---');
  await check('only the page origin goes to the server, and the fill carries the secrets', async () => {
    const env = makeEnv({ responses: { 'onepassword.resolve-login': { ok: true, login } } });
    const sent = [];
    const result = await env.api.fillLoginInTab(7, { itemId: 'v:a', requireUnique: true }, async (tabId, message) => {
      sent.push({ tabId, message });
      return { success: true, filled: ['username', 'password'], fieldsFound: { username: true, password: true } };
    });
    assert.deepEqual(env.requests, [{
      method: 'onepassword.resolve-login',
      payload: { url: 'https://example.com', itemId: 'v:a', requireUnique: true },
    }]);
    assert.equal(sent[0].tabId, 7);
    assert.equal(sent[0].message.tool, 'fillCredentialFields');
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0].message.params)), {
      username: 'alice', password: 'hunter2', oneTimeCode: '123456', expectedOrigin: 'https://example.com',
    }, 'the content script is told which origin the login is for');
    assert.equal(result.success, true);
    assert.equal(result.site, 'example.com');
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('hunter2') && !serialized.includes('123456'), 'result carries no secrets');
  });
  await check('non-web tabs are refused before asking 1Password', async () => {
    const env = makeEnv({ tabUrls: ['chrome://settings'] });
    const result = await env.api.fillLoginInTab(7, {}, async () => assert.fail('must not fill'));
    assert.equal(result.errorCode, 'unsupported_page');
    assert.equal(env.requests.length, 0);
  });
  await check('ambiguous logins come back as metadata-only candidates', async () => {
    const env = makeEnv({
      responses: {
        'onepassword.resolve-login': {
          ok: false, errorCode: 'multiple_credentials', error: 'pick one',
          candidates: [{ id: 'v:a', title: 'A', username: 'a', password: 'leak' }],
        },
      },
    });
    const result = await env.api.fillLoginInTab(7, { requireUnique: true }, async () => assert.fail('must not fill'));
    assert.equal(result.errorCode, 'multiple_credentials');
    assert.deepEqual(JSON.parse(JSON.stringify(result.candidates)), [{ id: 'v:a', title: 'A', username: 'a' }]);
  });
  for (const [label, moved] of [
    ['another site', 'https://evil.test/login'],
    ['http on the same host', 'http://example.com/login'],
    ['another port on the same host', 'https://example.com:8443/login'],
  ]) {
    await check(`a tab that moves to ${label} while 1Password answers is not filled`, async () => {
      const env = makeEnv({
        tabUrls: ['https://example.com/login', moved],
        responses: { 'onepassword.resolve-login': { ok: true, login } },
      });
      const result = await env.api.fillLoginInTab(7, {}, async () => assert.fail('must not fill'));
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'page_changed');
      assert.ok(!JSON.stringify(result).includes('hunter2'));
    });
  }
  await check('a path change on the same origin still fills', async () => {
    const env = makeEnv({
      tabUrls: ['https://example.com/login', 'https://example.com/login?step=2'],
      responses: { 'onepassword.resolve-login': { ok: true, login } },
    });
    let fills = 0;
    const result = await env.api.fillLoginInTab(7, {}, async () => { fills += 1; return { success: true, filled: ['password'] }; });
    assert.equal(result.success, true);
    assert.equal(fills, 1);
  });

  console.log('\n--- cards ---');
  function cardEnv(tabUrls) {
    return makeEnv({
      tabUrls,
      responses: {
        'onepassword.describe-card': { ok: true, card: { id: 'v:c', cardBrand: 'visa', last4: '1111' } },
        'onepassword.resolve-card': { ok: true, card },
      },
    });
  }
  await check('the card is read only after a trusted approval', async () => {
    const env = cardEnv(['https://shop.test/checkout']);
    const fills = [];
    const pending = env.api.fillCardInTab(9, 'v:c', async (tabId, message) => {
      fills.push(message);
      return { success: true, filled: ['cc-number'], totalFieldsDetected: 4 };
    });
    await waitFor(() => env.runtimeSent.length === 1);
    const { requestId, ...prompt } = JSON.parse(JSON.stringify(env.runtimeSent[0]));
    assert.match(requestId, /^[0-9a-f]{24}$/, 'each prompt carries its own request id');
    assert.deepEqual(prompt, {
      action: 'paymentFillConfirmation', paymentMethodId: 'v:c', cardBrand: 'visa', last4: '1111', merchantDomain: 'shop.test',
      title: '', expiryMonth: '', expiryYearLast2: '',
    });
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: 'f'.repeat(24) }, trusted);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(env.requests.length, 1, 'an answer for another prompt is ignored');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card'], 'no card read before approval');
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, { id: EXT_ID, url: 'https://shop.test/checkout' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(env.requests.length, 1, 'an approval from a web page is ignored');
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
    const result = await pending;
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card', 'onepassword.resolve-card']);
    assert.equal(fills[0].tool, 'fillPaymentFields');
    assert.equal(fills[0].params.cardNumber, '4111111111111111');
    assert.equal(fills[0].params.expectedOrigin, 'https://shop.test');
    assert.deepEqual(JSON.parse(JSON.stringify(fills[0].params.billingAddress)), {
      line1: '1 Main St', line2: '', city: 'Chicago', region: 'IL', postalCode: '60601', country: 'US',
    }, 'billing goes in the shape fillPaymentFields reads');
    assert.equal(result.success, true);
    assert.ok(!JSON.stringify(result).includes('4111111111111111') && !JSON.stringify(result).includes('737'));
  });
  await check('a declined fill never reads the card', async () => {
    const env = cardEnv(['https://shop.test/checkout']);
    const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    await waitFor(() => env.runtimeSent.length === 1);
    env.deliver({ action: 'paymentFillDenied', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
    const result = await pending;
    assert.equal(result.declined, true);
    assert.equal(result.reason, 'user_declined');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card']);
  });
  await check('a tab that moved to another site after approval is refused', async () => {
    const env = cardEnv(['https://shop.test/checkout', 'https://evil.test/pay']);
    const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    await waitFor(() => env.runtimeSent.length === 1);
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
    const result = await pending;
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'merchant_changed');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card']);
  });
  for (const [label, moved] of [
    ['http on the same host', 'http://shop.test/checkout'],
    ['another port on the same host', 'https://shop.test:8443/checkout'],
  ]) {
    await check(`a tab that moves to ${label} after approval is refused`, async () => {
      const env = cardEnv(['https://shop.test/checkout', moved]);
      const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
      await waitFor(() => env.runtimeSent.length === 1);
      env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
      const result = await pending;
      assert.equal(result.errorCode, 'merchant_changed');
      assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card']);
    });
  }
  await check('a tab that moves while the card is read is not filled', async () => {
    const env = cardEnv(['https://shop.test/checkout', 'https://shop.test/checkout', 'https://evil.test/pay']);
    const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    await waitFor(() => env.runtimeSent.length === 1);
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
    const result = await pending;
    assert.equal(result.errorCode, 'merchant_changed');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card', 'onepassword.resolve-card']);
    assert.ok(!JSON.stringify(result).includes('4111111111111111'));
  });
  for (const [url, shown] of [
    ['https://shop.test:8443/checkout', 'shop.test:8443'],
  ]) {
    await check(`the approval prompt names ${shown}`, async () => {
      const env = cardEnv([url]);
      const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
      await waitFor(() => env.runtimeSent.length === 1);
      assert.equal(env.runtimeSent[0].merchantDomain, shown);
      env.deliver({ action: 'paymentFillDenied', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
      await pending;
    });
  }
  await check('a second prompt replaces the first, so one click cannot approve two fills', async () => {
    const env = cardEnv(['https://shop.test/checkout']);
    const first = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('the replaced fill must not run'));
    await waitFor(() => env.runtimeSent.length === 1);
    const second = env.api.fillCardInTab(9, 'v:c', async () => ({ success: true, filled: ['cc-number'], totalFieldsDetected: 1 }));
    const firstResult = await first;
    assert.equal(firstResult.reason, 'replaced');
    await waitFor(() => env.runtimeSent.length === 2);
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[0].requestId }, trusted);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(!env.requests.some((r) => r.method === 'onepassword.resolve-card'), 'the old prompt id approves nothing');
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c', requestId: env.runtimeSent[1].requestId }, trusted);
    assert.equal((await second).success, true);
  });
  await check('no side panel to show the prompt settles at once, not after 2 minutes', async () => {
    const env = makeEnv({
      tabUrls: ['https://shop.test/checkout'],
      panelShows: false,
      responses: { 'onepassword.describe-card': { ok: true, card: { id: 'v:c', cardBrand: 'visa', last4: '1111' } } },
    });
    const started = Date.now();
    const result = await env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    assert.equal(result.errorCode, 'payment_not_approved');
    assert.equal(result.reason, 'sidepanel_unavailable');
    assert.ok(Date.now() - started < 1000, 'no 2-minute wait');
    assert.ok(!env.requests.some((r) => r.method === 'onepassword.resolve-card'));
  });
  await check('cards are never read for an http page, and nobody is asked', async () => {
    const env = cardEnv(['http://shop.test/checkout']);
    const result = await env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    assert.equal(result.errorCode, 'card_requires_https');
    assert.match(result.error, /http:\/\/shop\.test is not https/);
    assert.equal(env.runtimeSent.length, 0, 'no approval prompt');
    assert.ok(!env.requests.some((r) => /card/.test(r.method)), 'nothing asked of 1Password');
  });
  await check('over MCP (confirm: agent) the card fills with no side-panel prompt', async () => {
    const env = cardEnv(['https://shop.test/checkout']);
    const fills = [];
    const pills = [];
    const result = await env.api.fillCardInTab(9, 'v:c', async (tabId, message) => {
      fills.push(message);
      return { success: true, filled: ['cc-number', 'cc-exp', 'cc-csc', 'cc-name'], totalFieldsDetected: 4 };
    }, { confirm: 'agent' }, { status: async (state) => { pills.push(state); return { shown: true }; } });
    assert.equal(result.success, true);
    assert.equal(env.runtimeSent.length, 0, 'no approval prompt');
    assert.equal(fills.length, 1);
    assert.equal(fills[0].params.expectedOrigin, 'https://shop.test');
    assert.deepEqual(pills.map((p) => p.phase), ['checking', 'filling_card', 'card_filled']);
    assert.ok(!JSON.stringify(pills).includes('4111'), 'no card number in pill states');
    assert.ok(!JSON.stringify(result).includes('4111111111111111'));
  });
  await check('over MCP a tab that moves before the read is still refused', async () => {
    const env = cardEnv(['https://shop.test/checkout', 'https://evil.test/']);
    const result = await env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'), { confirm: 'agent' });
    assert.equal(result.errorCode, 'merchant_changed');
    assert.ok(!env.requests.some((r) => r.method === 'onepassword.resolve-card'), 'the card is not read');
  });

  console.log('\n--- content-script fills check the receiving document ---');
  {
    const actions = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content', 'actions.js'), 'utf8');
    const start = actions.indexOf('  const OTP_FIELD_PATTERN');
    const end = actions.indexOf('  FSB.clickAtCoordinates = clickAtCoordinates;');
    assert.ok(start > 0 && end > start, 'fill tools found in content/actions.js');
    const loadFillTools = (origin) => {
      const domReads = { count: 0 };
      const context = {
        tools: {},
        window: { location: { origin } },
        document: { querySelectorAll: () => { domReads.count += 1; return []; } },
        FSB: { inferElementPurpose: () => null },
      };
      vm.runInNewContext(actions.slice(start, end), context);
      return { tools: context.tools, domReads };
    };
    await check('a login meant for another origin is refused before the page is read', async () => {
      const { tools, domReads } = loadFillTools('https://evil.test');
      const result = await tools.fillCredentialFields({ username: 'alice', password: 'hunter2', expectedOrigin: 'https://example.com' });
      assert.equal(result.errorCode, 'page_changed');
      assert.equal(domReads.count, 0);
    });
    await check('a card meant for another origin is refused before the page is read', async () => {
      const { tools, domReads } = loadFillTools('https://shop.test:8443');
      const result = await tools.fillPaymentFields({ cardNumber: '4111111111111111', expectedOrigin: 'https://shop.test' });
      assert.equal(result.errorCode, 'merchant_changed');
      assert.equal(domReads.count, 0);
    });
    await check('a fill without an origin is refused', async () => {
      const { tools, domReads } = loadFillTools('https://example.com');
      assert.equal((await tools.fillCredentialFields({ password: 'hunter2' })).errorCode, 'page_changed');
      assert.equal((await tools.fillPaymentFields({ cardNumber: '4111111111111111' })).errorCode, 'merchant_changed');
      assert.equal(domReads.count, 0);
    });
    await check('the matching origin reaches the field search', async () => {
      const { tools, domReads } = loadFillTools('https://example.com');
      const login = await tools.fillCredentialFields({ password: 'hunter2', expectedOrigin: 'https://example.com' });
      const pay = await tools.fillPaymentFields({ cardNumber: '4111111111111111', expectedOrigin: 'https://example.com' });
      assert.match(login.error, /No login fields/);
      assert.match(pay.error, /No payment fields/);
      assert.equal(domReads.count, 2);
    });
  }

  console.log('\n--- autopilot fill_credential ---');
  {
    const executor = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ai', 'tool-executor.js'), 'utf8');
    const makeResultSrc = executor.slice(executor.indexOf('function makeResult('), executor.indexOf('function buildAutopilotTriggerParams('));
    const caseStart = executor.indexOf("      case 'fill_credential': {");
    const caseEnd = executor.indexOf("      case 'fill_payment_method': {");
    assert.ok(caseStart > 0 && caseEnd > caseStart, 'fill_credential case found in tool-executor.js');
    const runCase = (fillResult) => {
      const calls = [];
      const context = {
        chrome: { tabs: { sendMessage: async () => ({}) } },
        fsbOnePassword: {
          async fillLoginInTab(tabId, options) {
            calls.push({ tabId, options: { ...options } });
            return fillResult;
          },
        },
      };
      context.globalThis = context;
      const run = vm.runInNewContext(
        `${makeResultSrc}\n(async function (tool, params, tabId) { switch (tool.name) {\n${executor.slice(caseStart, caseEnd)}\n} })`,
        context,
      );
      return { calls, run: (params) => run({ name: 'fill_credential' }, params, 5) };
    };
    await check('several matching logins fail with candidates instead of picking one', async () => {
      const candidates = [{ id: 'v:a', title: 'Personal', username: 'me' }, { id: 'v:b', title: 'Work', username: 'me@work' }];
      const env = runCase({ success: false, errorCode: 'multiple_credentials', error: 'pick one', candidates });
      const result = await env.run({});
      assert.equal(env.calls[0].options.requireUnique, true);
      assert.equal(result.success, false);
      assert.equal(result.result.errorCode, 'multiple_credentials');
      assert.deepEqual(JSON.parse(JSON.stringify(result.result.candidates)), candidates);
    });
    await check('credential_id is passed through to pick one', async () => {
      const env = runCase({ success: true, credentialId: 'v:b', site: 'example.com', filled: ['password'] });
      const result = await env.run({ credential_id: 'v:b' });
      assert.equal(env.calls[0].options.itemId, 'v:b');
      assert.equal(result.success, true);
      assert.equal(result.result.candidates, undefined);
    });
  }

  const background = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');

  console.log('\n--- autopilot auto-login ---');
  {
    const hookStart = background.indexOf('// LOGIN DETECTION HOOK');
    const hookEnd = background.indexOf('// END LOGIN DETECTION HOOK', hookStart);
    assert.ok(hookStart > 0 && hookEnd > hookStart, 'login detection hook found in background.js');
    const hook = background.slice(hookStart, hookEnd);
    await check('auto-login asks for a unique match instead of typing the newest login', () => {
      assert.match(hook, /onePassword\.resolveLogin\(currentUrl, \{ requireUnique: true \}\)/);
      assert.equal((hook.match(/\.resolveLogin\(/g) || []).length, 1, 'no second, unguarded lookup');
    });
    await check('several matching logins go to the prompt, which does not offer to save another', () => {
      assert.match(hook, /const savedCred = lookup && lookup\.ok \? lookup\.login : null;/);
      assert.match(hook, /lookup\.errorCode === 'credential_not_found'\) \{\s*const opStatus/);
    });
  }

  console.log('\n--- moving the old vault ---');
  {
    const helpersStart = background.indexOf('function fsbOnePasswordClient() {');
    const helpersEnd = background.indexOf('async function fsbHandleOnePasswordUiAction(');
    assert.ok(helpersStart > 0 && helpersEnd > helpersStart, '1Password helpers found in background.js');
    const helpers = background.slice(helpersStart, helpersEnd);

    const legacy = (loginCount, cardCount) => ({
      success: true,
      logins: Array.from({ length: loginCount }, (_, i) => ({
        storageKey: `cred_l${i}.test`, domain: `l${i}.test`, username: 'u', password: `pw${i}`,
      })),
      cards: Array.from({ length: cardCount }, (_, i) => ({
        storageKey: `payment_method_c${i}`, cardNumber: `41111111111111${String(i).padStart(2, '0')}`, cvv: '737',
      })),
      unreadable: 0,
    });
    const saveAll = ({ logins, cards }) => ({
      ok: true,
      result: {
        logins: { imported: logins.length, failed: 0 },
        cards: { imported: cards.length, failed: 0 },
        importedLoginDomains: logins.map((entry) => entry.domain),
        importedCardIndexes: cards.map((_, i) => i),
        stopped: null,
      },
    });
    const runImport = async ({ vault, answer = saveAll, signIn = { ok: true, vaults: [] }, clockStep = 0 }) => {
      const events = [];
      const batches = [];
      let clock = 5_000_000;
      const context = {
        console,
        Date: { now: () => clock },
        fsbOnePassword: {
          async listVaults() {
            events.push('sign-in');
            return signIn;
          },
          async importLegacy(logins, cards) {
            const batch = JSON.parse(JSON.stringify({ logins, cards }));
            batches.push(batch);
            events.push(`import ${logins.length}+${cards.length}`);
            const response = answer(batch, batches.length);
            clock += clockStep;
            return response;
          },
        },
        secureConfig: {
          async readLegacyVault() { return vault; },
          async purgeLegacyVault(keys) {
            events.push(`purge ${keys.join(',')}`);
            return { success: true };
          },
          async getLegacyVaultSummary() { return { present: true }; },
        },
      };
      const api = vm.runInNewContext(`${helpers}\n({ fsbImportLegacyVault })`, context, { filename: 'background.js' });
      const result = await api.fsbImportLegacyVault('123456');
      return { result: JSON.parse(JSON.stringify(result)), events, batches };
    };
    const kinds = (events) => events.map((event) => event.split(' ')[0]);
    const loginKeys = (from, to) => Array.from({ length: to - from }, (_, i) => `cred_l${from + i}.test`);

    await check('the old vault moves in batches of 10, each erased as soon as 1Password confirms it', async () => {
      const { result, events, batches } = await runImport({ vault: legacy(23, 4) });
      assert.deepEqual(kinds(events), ['sign-in', 'import', 'purge', 'import', 'purge', 'import', 'purge']);
      assert.deepEqual(batches.map((batch) => [batch.logins.length, batch.cards.length]), [[10, 0], [10, 0], [3, 4]]);
      assert.ok(batches.every((batch) => [...batch.logins, ...batch.cards].every((entry) => !('storageKey' in entry))),
        'storage keys stay in the worker');
      assert.equal(events[2], `purge ${loginKeys(0, 10).join(',')}`);
      assert.equal(events[6], `purge ${[...loginKeys(20, 23), 'payment_method_c0', 'payment_method_c1', 'payment_method_c2', 'payment_method_c3'].join(',')}`,
        'card indexes are read against their own batch');
      assert.equal(result.success, true);
      assert.deepEqual(result.imported, { logins: 23, cards: 4 });
      assert.deepEqual(result.notAttempted, { logins: 0, cards: 0 });
    });
    await check('a batch that never answers keeps that batch and everything after it', async () => {
      const { result, events } = await runImport({
        vault: legacy(23, 4),
        answer: (batch, call) => (call === 2
          ? { ok: false, errorCode: 'onepassword_timeout', error: '1Password did not answer in time.' }
          : saveAll(batch)),
      });
      assert.equal(result.success, true);
      assert.deepEqual(result.imported, { logins: 10, cards: 0 });
      assert.deepEqual(result.notAttempted, { logins: 13, cards: 4 });
      assert.deepEqual(kinds(events), ['sign-in', 'import', 'purge', 'import'], 'nothing unconfirmed is erased and no batch follows');
    });
    await check('a first batch that fails reports the failure and erases nothing', async () => {
      const { result, events } = await runImport({
        vault: legacy(5, 0),
        answer: () => ({ ok: false, errorCode: 'onepassword_rate_limited', error: '1Password rate limit reached. Try again shortly.' }),
      });
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'onepassword_rate_limited');
      assert.ok(!kinds(events).includes('purge'));
    });
    await check('1Password stopping partway erases only what it saved, then stops', async () => {
      const { result, events } = await runImport({
        vault: legacy(23, 4),
        answer: (batch, call) => {
          if (call !== 2) return saveAll(batch);
          return {
            ok: true,
            result: {
              logins: { imported: 6, failed: 0 },
              cards: { imported: 0, failed: 0 },
              importedLoginDomains: batch.logins.slice(0, 6).map((entry) => entry.domain),
              importedCardIndexes: [],
              stopped: { code: 'onepassword_rate_limited', notAttempted: { logins: 4, cards: 0 } },
            },
          };
        },
      });
      assert.equal(result.success, true);
      assert.deepEqual(result.imported, { logins: 16, cards: 0 });
      assert.deepEqual(result.notAttempted, { logins: 7, cards: 4 }, 'four from the stopped batch, the three after it, and every card');
      assert.deepEqual(kinds(events), ['sign-in', 'import', 'purge', 'import', 'purge']);
      assert.equal(events[4], `purge ${loginKeys(10, 16).join(',')}`);
    });
    await check('nothing is sent until 1Password has signed in', async () => {
      const { result, batches } = await runImport({
        vault: legacy(3, 1),
        signIn: { ok: false, errorCode: 'onepassword_timeout', error: 'Approve FSB in 1Password.' },
      });
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'onepassword_timeout');
      assert.equal(batches.length, 0);
    });
    await check('one click starts no new batch after its time budget', async () => {
      // 70s per batch: batches start at 0s and 70s; at 140s the 120s budget has passed.
      const { result, batches } = await runImport({ vault: legacy(35, 0), clockStep: 70_000 });
      assert.equal(batches.length, 2);
      assert.equal(result.success, true);
      assert.deepEqual(result.imported, { logins: 20, cards: 0 });
      assert.deepEqual(result.notAttempted, { logins: 15, cards: 0 });
    });
    await check('a stop before anything was moved is reported as a failure', async () => {
      const { result, events } = await runImport({
        vault: legacy(4, 0),
        answer: () => ({
          ok: true,
          result: {
            logins: { imported: 0, failed: 0 },
            cards: { imported: 0, failed: 0 },
            importedLoginDomains: [],
            importedCardIndexes: [],
            stopped: { code: 'onepassword_import_time_limit', notAttempted: { logins: 4, cards: 0 } },
          },
        }),
      });
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'onepassword_import_time_limit');
      assert.match(result.error, /before anything was moved/);
      assert.ok(!kinds(events).includes('purge'));
    });
  }

  console.log('\n--- content-script fill ---');
  await check('a password box labelled "Passcode" gets the password when there is no code', async () => {
    const dom = makeFillDom();
    const user = dom.input({ type: 'email', name: 'email' }, dom.form, { purpose: 'username' });
    const pass = dom.input({ type: 'password', name: 'passcode' }, dom.form, { labelText: 'Passcode' });
    const result = await dom.fill({ username: 'alice', password: 'hunter2' });
    assert.equal(result.success, true);
    assert.deepEqual([...result.filled], ['username', 'password']);
    assert.equal(user.value, 'alice');
    assert.equal(pass.value, 'hunter2');
  });
  await check('autocomplete="current-password" keeps a "Security code" box a password box', async () => {
    const dom = makeFillDom();
    const pass = dom.input({ type: 'password', name: 'security_code', autocomplete: 'current-password' });
    const result = await dom.fill({ password: 'hunter2', oneTimeCode: '123456' });
    assert.equal(result.success, true);
    assert.equal(pass.value, 'hunter2', 'the code never goes into the password box');
    assert.equal(result.fieldsFound.oneTimeCode, false);
  });
  await check('an autocomplete="one-time-code" field gets the code', async () => {
    const dom = makeFillDom();
    const code = dom.input({ type: 'text', name: 'code', autocomplete: 'one-time-code' });
    const result = await dom.fill({ oneTimeCode: '123456' });
    assert.deepEqual([...result.filled], ['one-time-code']);
    assert.equal(code.value, '123456');
  });
  await check('split code boxes that each sit in their own wrapper get the code', async () => {
    const dom = makeFillDom();
    const group = dom.wrapper();
    const boxes = Array.from({ length: 6 }, () => dom.input({ type: 'text', maxlength: '1' }, dom.wrapper(group)));
    const result = await dom.fill({ oneTimeCode: '123456' });
    assert.deepEqual([...result.filled], ['one-time-code']);
    assert.equal(boxes.map((box) => box.value).join(''), '123456');
  });
  await check('split code boxes that are siblings get the code', async () => {
    const dom = makeFillDom();
    const group = dom.wrapper();
    const boxes = Array.from({ length: 6 }, () => dom.input({ type: 'tel', maxlength: '1' }, group));
    const result = await dom.fill({ oneTimeCode: '654321' });
    assert.deepEqual([...result.filled], ['one-time-code']);
    assert.equal(boxes.map((box) => box.value).join(''), '654321');
  });

  console.log('\n--- transport ---');
  await check('the bridge client is found the way the service worker declares it', async () => {
    const { result, requests, onSelf } = await statusThroughDeclaredBridge();
    assert.equal(onSelf, undefined, 'a top-level const is not a property of self');
    assert.equal(result.ok, true, `expected the bridge to answer, got ${result.errorCode}`);
    assert.deepEqual(requests.map((entry) => entry.method), ['onepassword.status']);
  });
  await check('no local server reports how to install it', async () => {
    const env = makeEnv({ connected: false });
    const result = await env.api.status();
    assert.equal(result.errorCode, 'onepassword_bridge_offline');
    assert.match(result.error, /fsb-mcp-server/);
    assert.equal(env.requests.length, 0);
  });
  // The local server closes an unpaired extension's socket (1008) on any
  // 1Password request, and MCP tool calls share that socket. Nothing may be
  // sent until the bridge is paired.
  const pairsOnRequest = (pairing) => {
    pairing.status = 'paired';
    return { ok: true };
  };
  await check('an unpaired extension that cannot pair sends nothing', async () => {
    const env = makeEnv({ pairingStatus: 'unpaired' });
    const result = await env.api.status();
    assert.equal(result.errorCode, 'onepassword_bridge_unpaired');
    assert.equal(env.requests.length, 0);
  });
  await check('an unpaired extension pairs first, then asks', async () => {
    const env = makeEnv({
      pairingStatus: 'unpaired',
      ensureReady: pairsOnRequest,
      responses: { 'onepassword.list-logins': { ok: true, logins: [] } },
    });
    const result = await env.api.listLogins();
    assert.equal(result.ok, true, `expected the list after pairing, got ${result.errorCode}`);
    assert.equal(env.pairing.ensureCalls, 1);
    assert.deepEqual(env.requests.map((entry) => entry.method), ['onepassword.list-logins']);
  });
  await check('a passive status read never starts pairing', async () => {
    const env = makeEnv({ pairingStatus: 'unpaired', ensureReady: pairsOnRequest });
    const result = await env.api.status({ pair: false });
    assert.equal(result.errorCode, 'onepassword_bridge_unpaired');
    assert.equal(env.pairing.ensureCalls, 0, 'opening settings must not reconnect the bridge');
    assert.equal(env.requests.length, 0);
  });
  await check('a passive status read still answers once paired', async () => {
    const env = makeEnv({ responses: { 'onepassword.status': { ok: true, status: { configured: true } } } });
    assert.equal((await env.api.status({ pair: false })).ok, true);
    assert.equal(env.requests.length, 1);
  });
  await check('a pairing check already under way is waited for, not repeated', async () => {
    const env = makeEnv({
      pairingStatus: 'configured',
      ensureReady: pairsOnRequest,
      responses: { 'onepassword.status': { ok: true, status: { configured: true } } },
    });
    let reads = 0;
    Object.defineProperty(env.pairing, 'status', {
      get: () => (reads++ < 3 ? 'configured' : 'paired'),
      set: () => {},
    });
    assert.equal((await env.api.status()).ok, true);
    assert.equal(env.pairing.ensureCalls, 0);
    assert.equal(env.requests.length, 1);
  });
  await check('pairing that does not finish sends nothing', async () => {
    const env = makeEnv({ pairingStatus: 'unpaired', ensureReady: () => ({ ok: false, code: 'bridge_not_ready' }) });
    assert.equal((await env.api.listCards()).errorCode, 'onepassword_bridge_unpaired');
    assert.equal(env.requests.length, 0);
  });
  await check('a missing native helper is reported as how to install the local server', async () => {
    const env = makeEnv({ pairingStatus: 'unpaired', ensureReady: () => ({ ok: false, code: 'native_host_missing' }) });
    const result = await env.api.listLogins();
    assert.equal(result.errorCode, 'onepassword_bridge_offline');
    assert.match(result.error, /fsb-mcp-server install --native-host/);
    assert.equal(env.requests.length, 0);
  });
  await check('the settings page pairs only when Passwords or Payments is open', async () => {
    const options = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options.js'), 'utf8');
    assert.match(options, /const pair = options\.pair === true \|\| readItems;/);
    assert.match(options, /sendMessage\(\{ action: 'onePasswordStatus', pair \}\)/);
    assert.match(options, /loadOnePasswordStatus\(\{ readItems: false \}\);/, 'the passive load at startup stays passive');
    assert.match(options, /await loadOnePasswordStatus\(\{ readItems: false, pair: true \}\);/, 'Payments pairs');
  });
  await check('the status request carries the page\'s pairing choice to the client', async () => {
    const start = background.indexOf('function fsbOnePasswordClient() {');
    const handlerStart = background.indexOf('async function fsbHandleOnePasswordUiAction(');
    const handlerEnd = background.indexOf('\n}\n', handlerStart) + 3;
    assert.ok(start > 0 && handlerStart > start && handlerEnd > handlerStart, 'status handler found in background.js');
    const seen = [];
    const context = {
      console,
      fsbOnePassword: {
        async status(options) {
          seen.push(options);
          return { ok: true, status: {} };
        },
      },
      secureConfig: { async getLegacyVaultSummary() { return null; } },
    };
    const api = vm.runInNewContext(
      `${background.slice(start, background.indexOf('const FSB_LEGACY_IMPORT_BATCH'))}\n${background.slice(handlerStart, handlerEnd)}\n({ fsbHandleOnePasswordUiAction })`,
      context,
      { filename: 'background.js' },
    );
    await api.fsbHandleOnePasswordUiAction({ action: 'onePasswordStatus', pair: false });
    await api.fsbHandleOnePasswordUiAction({ action: 'onePasswordStatus', pair: true });
    await api.fsbHandleOnePasswordUiAction({ action: 'onePasswordStatus' });
    assert.deepEqual(JSON.parse(JSON.stringify(seen)), [{ pair: false }, { pair: true }, { pair: true }]);
  });
  await check('an older local server is reported as outdated', async () => {
    const error = Object.assign(new Error('No extension request handler is available'), { code: 'agent_provider_offline' });
    const env = makeEnv({ transportError: error });
    assert.equal((await env.api.listLogins()).errorCode, 'onepassword_server_outdated');
  });
  await check('a timeout points at the 1Password approval prompt', async () => {
    const error = Object.assign(new Error('Extension request timed out'), { code: 'ext_request_timeout' });
    const env = makeEnv({ transportError: error });
    assert.match((await env.api.listLogins()).error, /approval prompt/);
  });
  await check('configure forwards only non-secret settings', async () => {
    const env = makeEnv({ responses: { 'onepassword.configure': { ok: true } } });
    await env.api.configure({ authKind: 'desktop', accountName: 'acct', vaultIds: ['v'], token: 'ops_leak' });
    assert.deepEqual(env.requests[0].payload, { authKind: 'desktop', accountName: 'acct', vaultIds: ['v'] });
  });
  await check('configure forwards the vault scope', async () => {
    const env = makeEnv({ responses: { 'onepassword.configure': { ok: true } } });
    await env.api.configure({ authKind: 'desktop', accountName: 'acct', vaultScope: 'all' });
    assert.deepEqual(env.requests[0].payload, { authKind: 'desktop', accountName: 'acct', vaultScope: 'all' });
  });
  await check('the Vault page configure handler passes the vault scope through', async () => {
    const handlerStart = background.indexOf('async function fsbHandleOnePasswordUiAction(');
    const handler = background.slice(handlerStart, background.indexOf('\n}\n', handlerStart));
    assert.match(handler, /for \(const key of \['authKind', 'accountName', 'vaultIds', 'saveVaultId', 'vaultScope'\]\)/);
  });
  await check('the logged-in flag is read from local storage only', async () => {
    for (const [stored, expected] of [[{ fsbOnePasswordLoggedIn: true }, true], [{ fsbOnePasswordLoggedIn: false }, false], [{}, false], [{ fsbOnePasswordLoggedIn: 'yes' }, false]]) {
      const env = makeEnv();
      const keys = [];
      env.context.chrome.storage = { local: { get: async (key) => { keys.push(key); return stored; } } };
      assert.equal(await env.api.isLoggedIn(), expected);
      assert.deepEqual(keys, ['fsbOnePasswordLoggedIn']);
      assert.equal(env.requests.length, 0, 'the local server is not asked');
    }
    const broken = makeEnv();
    broken.context.chrome.storage = { local: { get: async () => { throw new Error('storage gone'); } } };
    assert.equal(await broken.api.isLoggedIn(), false);
    assert.equal(await makeEnv().api.isLoggedIn(), false, 'no storage reads as not logged in');
  });
  await check('the autopilot save offer follows the effective save vault', () => {
    const hookStart = background.indexOf('// LOGIN DETECTION HOOK');
    const hook = background.slice(hookStart, background.indexOf('// END LOGIN DETECTION HOOK', hookStart));
    assert.match(hook, /opStatus\.status\.configured && opStatus\.status\.effectiveSaveVaultId\)/);
    assert.ok(!/status\.saveVaultId/.test(hook), 'the stored save vault alone never offers a save');
  });

  console.log('\n--- the Vault page: Log in to 1Password ---');
  {
    const options = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options.js'), 'utf8');
    const between = (from, to) => {
      const start = options.indexOf(from);
      const end = options.indexOf(to, start);
      assert.ok(start > 0 && end > start, `options.js has ${from}`);
      return options.slice(start, end);
    };
    // The connection block, the item lists, and the card list, as the page runs them.
    const pageCode = [
      between('let _onePasswordStatus = null;', 'function updateCaptchaSolverVisibility('),
      between('// Load the logins FSB may use', 'function initializeCredentialManager() {'),
      between('async function loadPaymentMethods() {', '// Site Explorer Functions'),
    ].join('\n');

    // Enough of the DOM for the Vault page: every id is a node that keeps
    // what the page last wrote to it.
    function makeNode(id) {
      const classes = new Set();
      const children = {};
      return {
        id,
        hidden: false,
        disabled: false,
        open: false,
        value: '',
        textContent: '',
        innerHTML: '',
        i18n: null,
        dataset: {},
        style: {},
        attrs: {},
        options: [],
        focused: false,
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          contains: (c) => classes.has(c),
          toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
        },
        setAttribute(name, value) { this.attrs[name] = value; },
        getAttribute(name) { return this.attrs[name]; },
        querySelector(selector) { children[selector] = children[selector] || makeNode(id + ' ' + selector); return children[selector]; },
        focus() { this.focused = true; },
        appendChild(child) { this.options.push(child); },
        remove(index) { this.options.splice(index, 1); },
      };
    }

    function makePage({ stored = {}, onPage = true, answer }) {
      const nodes = {};
      const sent = [];
      const toasts = [];
      const tabsOpened = [];
      const storage = { ...stored };
      let clock = 1_000_000;
      const document = {
        getElementById(id) {
          nodes[id] = nodes[id] || makeNode(id);
          return nodes[id];
        },
        createElement: () => ({ value: '', textContent: '' }),
      };
      const select = document.getElementById('onePasswordSaveVault');
      select.options.push({ value: '', textContent: 'Do not save' });
      if (onPage) document.getElementById('vault').classList.add('active');
      const context = {
        console,
        document,
        Date: { now: () => clock },
        // Timers run at once; the clock moves only when one fires.
        setTimeout: (fn, ms) => setTimeout(() => { clock += ms; fn(); }, 0),
        clearTimeout: (handle) => clearTimeout(handle),
        Promise,
        Set,
        chrome: {
          runtime: {
            sendMessage: async (request) => {
              sent.push(JSON.parse(JSON.stringify(request)));
              return answer(request, sent);
            },
          },
          storage: {
            local: {
              get: async (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? { [key]: storage[key] } : {}),
              set: async (values) => { Object.assign(storage, values); },
            },
          },
          tabs: { create: async (props) => { tabsOpened.push(props.url); return { id: 9 }; } },
        },
        window: { open: (url) => tabsOpened.push('window:' + url) },
        confirm: () => true,
        escapeHtml: (value) => String(value == null ? '' : value),
        fsbUiLine: (english) => english,
        fsbUiHtml: (english) => english,
        fsbUiSet: (node, english, subs) => {
          if (!node) return;
          node.textContent = english;
          node.i18n = { english, subs: subs ? JSON.parse(JSON.stringify(subs)) : undefined };
        },
        showToast: (message, type) => toasts.push({ message, type }),
        createPinInput: () => ({ getValue: () => '', clear() {} }),
      };
      vm.createContext(context);
      const page = vm.runInContext(`${pageCode}
        ({
          ui: _vaultUi,
          status: () => _onePasswordStatus,
          view: vaultView,
          load: loadOnePasswordStatus,
          logIn: logInToOnePassword,
          continueLogin: continueOnePasswordLogin,
          disconnect: disconnectOnePassword,
          retry: retryOnePassword,
          useAll: useAllOnePasswordVaults,
          saveLimit: saveOnePasswordVaults,
          setLimit: (ids) => { _vaultUi.allowEdited = true; _vaultUi.allow = new Set(ids); },
        })`, context, { filename: 'options.js' });
      const settle = async () => {
        for (let i = 0; i < 400; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      };
      const actions = () => sent.map((request) => request.action);
      return { page, nodes: document.getElementById.bind(document), sent, toasts, tabsOpened, storage, settle, actions };
    }

    const DESKTOP = { configured: true, authKind: 'desktop', accountName: 'Acme', vaultScope: 'all', vaultIds: [], saveVaultId: 'v-personal', effectiveSaveVaultId: 'v-personal', vaults: [] };
    const VAULTS = [
      { id: 'v-personal', title: 'Personal', itemCount: 3, vaultType: 'personal' },
      { id: 'v-work', title: 'Work', itemCount: 2, vaultType: 'userCreated' },
      { id: 'v-transfer', title: 'Shared with me', itemCount: 1, vaultType: 'transfer' },
    ];
    // A local server holding `config` (null: nothing saved) whose list-vaults
    // answers come from `lists` in order; the last one repeats.
    function server({ config = null, lists = [{ success: true, vaults: VAULTS }], statusFails = null } = {}) {
      let current = config ? { ...config } : null;
      let listCalls = 0;
      const statusOf = () => (current ? { ...current } : { configured: false, authKind: null, accountName: null, vaultScope: 'listed', vaultIds: [], saveVaultId: null, effectiveSaveVaultId: null, vaults: [] });
      const answer = (request) => {
        switch (request.action) {
          case 'onePasswordStatus':
            if (statusFails && (!request.pair || statusFails.always)) return { success: false, errorCode: statusFails.code, error: 'x' };
            return { success: true, status: statusOf(), legacy: null };
          case 'onePasswordConfigure': {
            const next = { ...statusOf() };
            if (request.authKind === 'desktop') {
              Object.assign(next, { configured: true, authKind: 'desktop', accountName: request.accountName });
            }
            if (request.vaultScope === 'all') Object.assign(next, { vaultScope: 'all', vaultIds: [] });
            if (Array.isArray(request.vaultIds) && request.vaultIds.length) Object.assign(next, { vaultScope: 'listed', vaultIds: request.vaultIds });
            if ('saveVaultId' in request) Object.assign(next, { saveVaultId: request.saveVaultId, effectiveSaveVaultId: request.saveVaultId });
            current = next;
            return { success: true, status: statusOf() };
          }
          case 'onePasswordListVaults': {
            const result = lists[Math.min(listCalls, lists.length - 1)];
            listCalls += 1;
            // Like the broker: reading every vault, the first list picks the Personal vault.
            const personal = result.success && result.vaults.find((vault) => vault.vaultType === 'personal');
            if (current && current.vaultScope === 'all' && !current.saveVaultId && personal) {
              Object.assign(current, { saveVaultId: personal.id, effectiveSaveVaultId: personal.id });
            }
            return result;
          }
          case 'onePasswordListLogins':
            return { success: true, logins: [{ id: 'v-work:l1', title: 'Example', username: 'me', domains: ['example.com'], vaultId: 'v-work' }] };
          case 'onePasswordListCards':
            return { success: true, cards: [{ id: 'v-personal:c1', title: 'Visa', cardBrand: 'visa', last4: '4242', vaultId: 'v-personal' }] };
          case 'onePasswordDisconnect':
            current = null;
            return { success: true, status: statusOf() };
          default:
            return { success: false, error: 'unexpected ' + request.action };
        }
      };
      return { answer, listCalls: () => listCalls };
    }

    await check('a guest opening the Vault page reads the status without pairing and asks 1Password nothing', async () => {
      const srv = server({ statusFails: { code: 'onepassword_bridge_unpaired' } });
      const env = makePage({ answer: srv.answer });
      await env.page.load({ readItems: true });
      assert.deepEqual(env.sent, [{ action: 'onePasswordStatus', pair: false }]);
      assert.equal(env.page.view(), 'none', 'no error for a guest: the Log in button shows');
      assert.equal(env.nodes('onePasswordSetup').hidden, false);
      assert.equal(env.nodes('onePasswordLoginBtn').hidden, false);
      assert.equal(env.nodes('onePasswordAccountRow').hidden, true, 'no account field until Log in needs one');
      assert.equal(env.nodes('vaultAccessGroup').style.display, 'none');
    });

    await check('a saved desktop sign-in without Log in still lists nothing', async () => {
      const srv = server({ config: DESKTOP });
      const env = makePage({ answer: srv.answer });
      await env.page.load({ readItems: true });
      assert.deepEqual(env.actions(), ['onePasswordStatus']);
      assert.equal(env.page.view(), 'none');
      assert.equal(env.nodes('onePasswordAccountLine').hidden, false, 'the saved account is named next to Log in');
      assert.deepEqual(env.nodes('onePasswordAccountText').i18n, { english: '1Password account: $ACCOUNT$', subs: { account: 'Acme' } });
    });

    await check('Log in with no saved account opens the account field, filled in with the last name used', async () => {
      const srv = server();
      const env = makePage({ answer: srv.answer, stored: { fsbOnePasswordAccountName: 'My Family' } });
      await env.page.load({ readItems: true });
      await env.page.logIn();
      await env.settle();
      assert.deepEqual(env.sent[1], { action: 'onePasswordStatus', pair: true }, 'the click pairs');
      assert.deepEqual([...new Set(env.actions())], ['onePasswordStatus'], 'nothing configured or listed yet');
      assert.equal(env.nodes('onePasswordAccountRow').hidden, false);
      assert.equal(env.nodes('onePasswordLoginBtn').hidden, true);
      assert.equal(env.nodes('onePasswordAccount').value, 'My Family');
      assert.equal(env.nodes('onePasswordAccount').focused, true);
    });

    await check('Continue signs in to every vault, waits for approval, then lists logins and cards', async () => {
      const srv = server();
      const env = makePage({ answer: srv.answer });
      await env.page.load({ readItems: true });
      await env.page.logIn();
      await env.settle();
      env.nodes('onePasswordAccount').value = '  Acme  ';
      await env.page.continueLogin();
      await env.settle();
      const configure = env.sent.find((request) => request.action === 'onePasswordConfigure');
      assert.deepEqual(configure, { action: 'onePasswordConfigure', authKind: 'desktop', accountName: 'Acme', vaultScope: 'all' });
      assert.equal(env.storage.fsbOnePasswordLoggedIn, true);
      assert.equal(env.storage.fsbOnePasswordAccountName, 'Acme');
      const after = env.actions().slice(env.actions().indexOf('onePasswordConfigure'));
      assert.deepEqual(after.slice(0, 3), ['onePasswordConfigure', 'onePasswordListVaults', 'onePasswordStatus']);
      assert.ok(after.includes('onePasswordListLogins') && after.includes('onePasswordListCards'), 'logins and cards list at once');
      assert.ok(env.sent.slice(env.actions().indexOf('onePasswordConfigure')).some((request) => request.action === 'onePasswordStatus' && request.pair === true),
        'logged in, the page pairs');
      assert.equal(env.page.view(), 'ready');
      assert.deepEqual(env.nodes('onePasswordStatusText').i18n, { english: 'Logged in · $ACCOUNT$', subs: { account: 'Acme' } });
      assert.equal(env.nodes('onePasswordBody').textContent,
        '1Password may ask you to approve FSB again after 10 idle minutes, a lock, or a local-server restart.');
      assert.equal(env.nodes('onePasswordDisconnectBtn').hidden, false);
      assert.equal(env.nodes('vaultAccessGroup').style.display, 'contents');
      assert.equal(env.nodes('onePasswordAdvanced').open, false, 'the vault limit stays under Advanced');
      assert.equal(env.nodes('onePasswordSaveVault').value, 'v-personal');
      assert.equal(env.nodes('onePasswordSaveHint').hidden, true);
      assert.equal(env.nodes('onePasswordAllVaultsBtn').hidden, true, 'already reading every vault');
      assert.deepEqual(env.nodes('onePasswordScopeText').i18n.english, 'All vaults in your 1Password account');
      assert.ok(!env.nodes('onePasswordVaultList').innerHTML.includes('Shared with me'), 'transfer vaults are left out');
      assert.equal(env.nodes('credentialsList').hidden, false);
      assert.ok(env.toasts.some((toast) => toast.message === '1Password connected'));
    });

    await check('with the 1Password setting off, FSB opens it once and keeps trying until it is on', async () => {
      const off = { success: false, errorCode: 'onepassword_auth_failed', error: 'off', reason: 'integration_off' };
      const srv = server({ config: DESKTOP, lists: [off, off, off, { success: true, vaults: VAULTS }] });
      const env = makePage({ answer: srv.answer });
      await env.page.load({ readItems: true });
      const views = [];
      const pending = env.page.logIn();
      for (let i = 0; i < 400 && srv.listCalls() < 4; i += 1) {
        views.push(env.page.view());
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await pending;
      await env.settle();
      assert.ok(!env.actions().includes('onePasswordConfigure'), 'the saved account is reused as it is');
      assert.deepEqual(env.tabsOpened, ['onepassword://settings/developers']);
      assert.ok(views.includes('integration'), 'the page asks for the setting while it waits');
      assert.equal(env.page.view(), 'ready');
      assert.equal(env.storage.fsbOnePasswordLoggedIn, true);
    });

    await check('after 2 minutes with the setting still off, the page points at an admin', async () => {
      const off = { success: false, errorCode: 'onepassword_auth_failed', error: 'off', reason: 'integration_off' };
      const srv = server({ config: DESKTOP, lists: [off] });
      const env = makePage({ answer: srv.answer });
      await env.page.load({ readItems: true });
      await env.page.logIn();
      await env.settle();
      assert.equal(env.page.view(), 'managed');
      assert.equal(env.nodes('onePasswordBody').textContent, 'On a managed device? Ask your admin.');
      assert.equal(env.nodes('onePasswordRetryBtn').hidden, false);
      assert.equal(env.nodes('onePasswordOpenSettingsBtn').hidden, false);
      assert.deepEqual(env.tabsOpened, ['onepassword://settings/developers'], 'the setting opens once per Log in');
      // One try every 3 seconds for 2 minutes, plus the first.
      assert.equal(srv.listCalls(), 41);
      assert.notEqual(env.storage.fsbOnePasswordLoggedIn, true);
    });

    await check('each sign-in failure gets its own state and a way forward', async () => {
      for (const [reason, view, extra] of [
        ['app_missing', 'appmissing', 'onePasswordDownloadLink'],
        ['locked', 'locked', null],
        ['declined', 'declined', null],
        ['unknown', 'signin', 'onePasswordEditAccountBtn'],
      ]) {
        const srv = server({ config: DESKTOP, lists: [{ success: false, errorCode: 'onepassword_auth_failed', error: '1Password sign-in failed: nope', reason }] });
        const env = makePage({ answer: srv.answer });
        await env.page.load({ readItems: true });
        await env.page.logIn();
        await env.settle();
        assert.equal(env.page.view(), view, reason);
        assert.equal(env.nodes('onePasswordRetryBtn').hidden, false, `${reason}: Try again`);
        if (extra) assert.equal(env.nodes(extra).hidden, false, `${reason}: ${extra}`);
        assert.notEqual(env.storage.fsbOnePasswordLoggedIn, true);
        assert.ok(!env.actions().includes('onePasswordListLogins'), `${reason}: nothing listed`);
      }
      const timeout = server({ config: DESKTOP, lists: [{ success: false, errorCode: 'onepassword_timeout', error: 'slow' }] });
      const env = makePage({ answer: timeout.answer });
      await env.page.load({ readItems: true });
      await env.page.logIn();
      await env.settle();
      assert.equal(env.page.view(), 'approve');
      assert.equal(env.nodes('onePasswordStatusText').textContent, 'Approve FSB in 1Password');
    });

    await check('Try again after a failed Log in logs in again', async () => {
      const srv = server({ config: DESKTOP, lists: [{ success: false, errorCode: 'onepassword_auth_failed', error: 'x', reason: 'locked' }, { success: true, vaults: VAULTS }] });
      const env = makePage({ answer: srv.answer });
      await env.page.load({ readItems: true });
      await env.page.logIn();
      await env.settle();
      assert.equal(env.page.view(), 'locked');
      env.page.retry();
      await env.settle();
      assert.equal(env.page.view(), 'ready');
      assert.equal(env.storage.fsbOnePasswordLoggedIn, true);
    });

    await check('Disconnect clears the logged-in flag', async () => {
      const srv = server({ config: DESKTOP });
      const env = makePage({ answer: srv.answer, stored: { fsbOnePasswordLoggedIn: true } });
      await env.page.load({ readItems: true });
      assert.equal(env.page.view(), 'ready');
      await env.page.disconnect();
      await env.settle();
      assert.equal(env.storage.fsbOnePasswordLoggedIn, false);
      assert.ok(env.actions().includes('onePasswordDisconnect'));
      assert.equal(env.page.view(), 'none');
    });

    await check('a logged-in flag with nothing saved on the server is cleared', async () => {
      const srv = server();
      const env = makePage({ answer: srv.answer, stored: { fsbOnePasswordLoggedIn: true } });
      await env.page.load({ readItems: true });
      assert.equal(env.storage.fsbOnePasswordLoggedIn, false);
      assert.equal(env.page.view(), 'none');
    });

    await check('a service account set up in the terminal shows as connected, with Disconnect', async () => {
      const service = { configured: true, authKind: 'service-account', accountName: null, tokenSource: 'config', vaultScope: 'listed', vaultIds: ['v-work'], saveVaultId: null, effectiveSaveVaultId: null, vaults: [{ id: 'v-work', title: 'Work' }] };
      const srv = server({ config: service });
      const env = makePage({ answer: srv.answer, stored: {} });
      // Already paired by an earlier visit, so the passive read answers.
      await env.page.load({ readItems: true });
      assert.equal(env.page.view(), 'service');
      assert.equal(env.nodes('onePasswordDisconnectBtn').hidden, false);
      assert.equal(env.nodes('onePasswordSetup').hidden, true);
      assert.ok(env.actions().includes('onePasswordListLogins'), 'a service account never prompts, so items list');
      assert.equal(env.storage.fsbOnePasswordLoggedIn, true);
    });

    await check('no Personal vault: the save-vault picker asks for one', async () => {
      const srv = server({ config: { ...DESKTOP, saveVaultId: null, effectiveSaveVaultId: null }, lists: [{ success: true, vaults: [VAULTS[1]] }] });
      const env = makePage({ answer: srv.answer, stored: { fsbOnePasswordLoggedIn: true } });
      await env.page.load({ readItems: true });
      await env.settle();
      assert.equal(env.page.view(), 'ready');
      assert.equal(env.nodes('onePasswordSaveHint').hidden, false);
      assert.equal(env.nodes('onePasswordSaveVault').value, '');
      assert.deepEqual(env.nodes('onePasswordSaveVault').options.map((option) => option.value), ['', 'v-work']);
    });

    await check('limiting FSB to chosen vaults sends their ids; Use all vaults goes back', async () => {
      const srv = server({ config: DESKTOP });
      const env = makePage({ answer: srv.answer, stored: { fsbOnePasswordLoggedIn: true } });
      await env.page.load({ readItems: true });
      await env.settle();
      env.page.setLimit(['v-work']);
      await env.page.saveLimit();
      await env.settle();
      const limit = env.sent.find((request) => request.action === 'onePasswordConfigure');
      assert.deepEqual(limit, { action: 'onePasswordConfigure', vaultIds: ['v-work'], saveVaultId: null }, 'the save vault goes when it is no longer readable');
      assert.equal(env.page.ui.scope, 'listed');
      assert.equal(env.nodes('onePasswordAllVaultsBtn').hidden, false);
      assert.equal(env.nodes('onePasswordScopeText').i18n.english, 'Only the vaults turned on under Advanced');
      await env.page.useAll();
      await env.settle();
      assert.deepEqual(env.sent.filter((request) => request.action === 'onePasswordConfigure').pop(), { action: 'onePasswordConfigure', vaultScope: 'all' });
      assert.equal(env.page.ui.scope, 'all');
    });

    await check('the old vault and service-account copy are gone from the Vault page', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'control_panel.html'), 'utf8');
      const vault = html.slice(html.indexOf('<section class="content-section" id="vault">'), html.indexOf('<!-- Help Section -->'));
      assert.ok(vault.includes('id="onePasswordLoginBtn"'));
      assert.ok(!/Integrate with other apps|onepassword --service-account|onePasswordServiceBtn/.test(vault));
      assert.ok(vault.includes('href="https://1password.com/downloads/"'));
      assert.ok(!/Integrate with other apps/.test(options));
    });
  }

  console.log(`\nonepassword-client: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
