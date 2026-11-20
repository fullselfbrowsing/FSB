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
      env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c' }, trusted);
      const result = await pending;
      assert.equal(result.errorCode, 'merchant_changed');
      assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card']);
    });
  }
  await check('a tab that moves while the card is read is not filled', async () => {
    const env = cardEnv(['https://shop.test/checkout', 'https://shop.test/checkout', 'https://evil.test/pay']);
    const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
    await waitFor(() => env.runtimeSent.length === 1);
    env.deliver({ action: 'paymentFillApproved', paymentMethodId: 'v:c' }, trusted);
    const result = await pending;
    assert.equal(result.errorCode, 'merchant_changed');
    assert.deepEqual(env.requests.map((request) => request.method), ['onepassword.describe-card', 'onepassword.resolve-card']);
    assert.ok(!JSON.stringify(result).includes('4111111111111111'));
  });
  for (const [url, shown] of [
    ['https://shop.test:8443/checkout', 'shop.test:8443'],
    ['http://shop.test/checkout', 'http://shop.test'],
  ]) {
    await check(`the approval prompt names ${shown}`, async () => {
      const env = cardEnv([url]);
      const pending = env.api.fillCardInTab(9, 'v:c', async () => assert.fail('must not fill'));
      await waitFor(() => env.runtimeSent.length === 1);
      assert.equal(env.runtimeSent[0].merchantDomain, shown);
      env.deliver({ action: 'paymentFillDenied', paymentMethodId: 'v:c' }, trusted);
      await pending;
    });
  }

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
