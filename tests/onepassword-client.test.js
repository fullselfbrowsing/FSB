'use strict';

// extension/utils/onepassword-client.js: the service-worker side of 1Password.
// Checks that only the page origin is sent, fill results carry no secrets,
// cards are read only after a trusted approval for the same merchant, and
// transport failures map to actionable codes.

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

function makeEnv({ tabUrls = ['https://example.com/login?next=/home'], responses = {}, connected = true, transportError = null } = {}) {
  const requests = [];
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
        return undefined;
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
    URL,
    console,
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
  return { api: context.fsbOnePassword, requests, runtimeSent, deliver, listeners };
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
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0].message.params)), { username: 'alice', password: 'hunter2', oneTimeCode: '123456' });
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
    assert.deepEqual(JSON.parse(JSON.stringify(env.runtimeSent[0])), {
      action: 'paymentFillConfirmation', paymentMethodId: 'v:c', cardBrand: 'visa', last4: '1111', merchantDomain: 'shop.test',
    });
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card'], 'no card read before approval');
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c' }, { id: EXT_ID, url: 'https://shop.test/checkout' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(env.requests.length, 1, 'an approval from a web page is ignored');
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c' }, trusted);
    const result = await pending;
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card', 'onepassword.resolve-card']);
    assert.equal(fills[0].tool, 'fillPaymentFields');
    assert.equal(fills[0].params.cardNumber, '4111111111111111');
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
    env.deliver({ action: 'paymentFillDenied', paymentMethodId: 'v:c' }, trusted);
    const result = await pending;
    assert.equal(result.declined, true);
    assert.equal(result.reason, 'user_declined');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card']);
  });
  await check('a tab that moved to another site after approval is refused', async () => {
    const env = cardEnv(['https://shop.test/checkout', 'https://evil.test/pay']);
    const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    await waitFor(() => env.runtimeSent.length === 1);
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c' }, trusted);
    const result = await pending;
    assert.equal(result.errorCode, 'merchant_changed');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card']);
  });

  console.log('\n--- transport ---');
  await check('no local server reports how to install it', async () => {
    const env = makeEnv({ connected: false });
    const result = await env.api.status();
    assert.equal(result.errorCode, 'onepassword_bridge_offline');
    assert.match(result.error, /fsb-mcp-server/);
    assert.equal(env.requests.length, 0);
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

  console.log(`\nonepassword-client: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
