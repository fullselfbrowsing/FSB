'use strict';

// Typing a login on the page when 1Password has none for the site
// (extension/utils/onepassword-client.js askLoginInTab / serveSheetPort).
// Checks that the sheet's port is accepted only from the sheet frame in the
// asking tab with the request nonce, that typed values reach only the page
// fill (and 1Password when the user saves), that no result carries them, and
// that cancel, a closed frame, a missing sheet, a moved tab and the timeout
// all end the call without a fill.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'utils', 'onepassword-client.js'), 'utf8');
const EXT_ID = 'fsb-test-extension';
const SHEET_URL = `chrome-extension://${EXT_ID}/ui/credential-sheet.html`;
const TAB = 41;
const USER = 'maya@example.com';
const SECRET = 'tr41l-H3ad-Wa1nut';

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

const NOT_FOUND = { ok: false, errorCode: 'credential_not_found', error: 'No 1Password login is saved for example.com' };

function makeEnv({ tabUrls = ['https://example.com/login'], saveVault = null, resolve = () => NOT_FOUND, timeoutMs = null, sheetShown = true } = {}) {
  const requests = [];
  const pills = [];
  const fills = [];
  let tabCall = 0;
  const chrome = {
    runtime: {
      id: EXT_ID,
      getURL: (p) => `chrome-extension://${EXT_ID}/${p}`,
      onMessage: { addListener() {}, removeListener() {} },
      sendMessage: async () => undefined,
    },
    tabs: {
      get: async (tabId) => {
        const url = tabUrls[Math.min(tabCall, tabUrls.length - 1)];
        tabCall += 1;
        return { id: tabId, url };
      },
    },
  };
  const responses = {
    'onepassword.status': () => ({ ok: true, status: { configured: true, saveVaultId: saveVault } }),
    'onepassword.resolve-login': (payload) => resolve(payload),
    'onepassword.save-login': () => ({ ok: true, saved: { id: 'v1:new1', title: 'example.com' } }),
  };
  const mcpBridgeClient = {
    isConnected: true,
    getState: () => ({ connected: true, pairingStatus: 'paired' }),
    async sendExtRequest(method, payload) {
      requests.push({ method, payload: JSON.parse(JSON.stringify(payload)) });
      const answer = responses[method];
      return typeof answer === 'function' ? answer(payload) : answer;
    },
  };
  let src = source;
  if (timeoutMs) src = src.replace('var LOGIN_ASK_TIMEOUT_MS = 120000;', `var LOGIN_ASK_TIMEOUT_MS = ${timeoutMs};`);
  const context = {
    chrome,
    mcpBridgeClient,
    armMcpBridge: () => {},
    URL,
    console,
    crypto: webcrypto,
    Uint8Array,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? ms : 0),
    clearTimeout: (handle) => clearTimeout(handle),
    Promise,
  };
  context.self = context;
  context.globalThis = context;
  vm.runInNewContext(src, context, { filename: 'onepassword-client.js' });
  const api = context.fsbOnePassword;
  const send = async (tabId, message) => {
    fills.push({ tabId, message: JSON.parse(JSON.stringify(message)) });
    return { success: true, filled: ['username', 'password'], fieldsFound: { username: true, password: true, oneTimeCode: false } };
  };
  const hooks = {
    status: async (state) => {
      pills.push(JSON.parse(JSON.stringify(state)));
      return state.phase === 'ask' ? { success: sheetShown, shown: sheetShown } : { success: true, shown: true };
    },
  };
  return { api, requests, pills, fills, send, hooks };
}

// A port as chrome.runtime.connect hands it to the worker. disconnect() from
// the worker side does not fire the worker's own onDisconnect, like Chrome.
function makePort(sender) {
  const onMessage = [];
  const onDisconnect = [];
  const posted = [];
  return {
    name: 'fsb-credential-sheet',
    sender,
    posted,
    disconnected: false,
    onMessage: { addListener: (fn) => onMessage.push(fn) },
    onDisconnect: { addListener: (fn) => onDisconnect.push(fn) },
    postMessage(message) { posted.push(JSON.parse(JSON.stringify(message))); },
    disconnect() { this.disconnected = true; },
    fromFrame(message) { onMessage.forEach((fn) => fn(message)); },
    frameGone() { onDisconnect.forEach((fn) => fn()); },
  };
}

const sheetSender = (overrides = {}) => ({ id: EXT_ID, url: SHEET_URL, tab: { id: TAB }, frameId: 7, ...overrides });
const tick = () => new Promise((r) => setTimeout(r, 5));

async function startAsk(env, options = {}) {
  const pending = env.api.fillLoginInTab(TAB, { requireUnique: true, askUser: true, client: 'Claude', ...options }, env.send, env.hooks);
  for (let i = 0; i < 20 && !env.pills.some((p) => p.phase === 'ask'); i += 1) await tick();
  const ask = env.pills.find((p) => p.phase === 'ask');
  return { pending, ask };
}

async function readyPort(env, ask, sender = sheetSender()) {
  const port = makePort(sender);
  env.api.serveSheetPort(port);
  port.fromFrame({ type: 'ready', requestId: ask.requestId, nonce: ask.nonce });
  await tick();
  return port;
}

async function run() {
  console.log('\n--- the sheet replaces credential_not_found only when asked ---');
  await check('without askUser the miss is reported as before', async () => {
    const env = makeEnv();
    const result = await env.api.fillLoginInTab(TAB, { requireUnique: true }, env.send, env.hooks);
    assert.equal(result.errorCode, 'credential_not_found');
    assert.ok(!env.pills.some((p) => p.phase === 'ask'));
  });
  await check('a credential_id that does not fit the site never opens the sheet', async () => {
    const env = makeEnv();
    const result = await env.api.fillLoginInTab(TAB, { itemId: 'v1:x', requireUnique: true, askUser: true }, env.send, env.hooks);
    assert.equal(result.errorCode, 'credential_not_found');
    assert.ok(!env.pills.some((p) => p.phase === 'ask'));
  });
  await check('the ask state names the site from the tab and carries no secret', async () => {
    const env = makeEnv();
    const { ask } = await startAsk(env);
    assert.equal(ask.site, 'example.com');
    assert.equal(ask.frameUrl, SHEET_URL);
    assert.match(ask.requestId, /^[0-9a-f]{32}$/);
    assert.match(ask.nonce, /^[0-9a-f]{48}$/);
    assert.equal(env.pills[0].phase, 'checking');
  });
  await check('no sheet on the page reports the miss at once', async () => {
    const env = makeEnv({ sheetShown: false });
    const result = await env.api.fillLoginInTab(TAB, { requireUnique: true, askUser: true }, env.send, env.hooks);
    assert.equal(result.errorCode, 'credential_not_found');
    assert.match(result.error, /could not show the sign-in sheet/);
    assert.equal(env.fills.length, 0);
  });

  console.log('\n--- only the sheet frame in the asking tab, with the nonce, is heard ---');
  for (const [label, sender, nonceOverride] of [
    ['a wrong nonce', sheetSender(), 'f'.repeat(48)],
    ['the top frame', sheetSender({ frameId: 0 }), null],
    ['another tab', sheetSender({ tab: { id: TAB + 1 } }), null],
    ['another extension page', sheetSender({ url: `chrome-extension://${EXT_ID}/ui/sidepanel.html` }), null],
    ['another extension', sheetSender({ id: 'other-extension' }), null],
  ]) {
    await check(`refuses ${label}`, async () => {
      const env = makeEnv();
      const { pending, ask } = await startAsk(env);
      const port = makePort(sender);
      env.api.serveSheetPort(port);
      port.fromFrame({ type: 'ready', requestId: ask.requestId, nonce: nonceOverride || ask.nonce });
      await tick();
      assert.deepEqual(port.posted, [{ type: 'refused', errorCode: 'untrusted_sender' }]);
      port.fromFrame({ type: 'submit', username: USER, password: SECRET });
      await tick();
      assert.equal(env.fills.length, 0);
      const good = await readyPort(env, ask);
      good.fromFrame({ type: 'cancel' });
      assert.equal((await pending).errorCode, 'credential_not_provided');
    });
  }
  await check('a second frame cannot take over a bound request', async () => {
    const env = makeEnv();
    const { pending, ask } = await startAsk(env);
    const first = await readyPort(env, ask);
    assert.equal(first.posted[0].type, 'init');
    const second = await readyPort(env, ask, sheetSender({ frameId: 9 }));
    assert.equal(second.posted[0].type, 'refused');
    first.fromFrame({ type: 'cancel' });
    await pending;
  });

  console.log('\n--- typed values reach the page fill only ---');
  await check('Sign in fills the tab, origin-pinned, and the result carries no value', async () => {
    const env = makeEnv();
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    assert.deepEqual(port.posted[0], { type: 'init', site: 'example.com', canSave: false, client: 'Claude' });
    port.fromFrame({ type: 'submit', username: USER, password: SECRET, save: true });
    const result = await pending;
    assert.equal(result.success, true);
    assert.equal(result.by, 'you');
    assert.equal(result.savedTo1Password, false);
    assert.deepEqual(result.filled, ['username', 'password']);
    const fill = env.fills.find((f) => f.message.tool === 'fillCredentialFields');
    assert.equal(fill.message.params.username, USER);
    assert.equal(fill.message.params.password, SECRET);
    assert.equal(fill.message.params.expectedOrigin, 'https://example.com');
    const visible = JSON.stringify(result) + JSON.stringify(env.pills) + JSON.stringify(port.posted);
    assert.ok(!visible.includes(SECRET) && !visible.includes(USER), 'no typed value in results, pill states or replies');
    assert.ok(!env.requests.some((r) => r.method === 'onepassword.save-login'), 'nothing saved without a save vault');
    assert.equal(env.pills[env.pills.length - 1].phase, 'filled_not_saved');
  });
  await check('with a save vault, a chosen save goes to 1Password with the origin only', async () => {
    const env = makeEnv({ saveVault: 'v1', tabUrls: ['https://example.com/login?next=/orders'] });
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    assert.equal(port.posted[0].canSave, true);
    port.fromFrame({ type: 'submit', username: USER, password: SECRET, save: true });
    const result = await pending;
    assert.equal(result.savedTo1Password, true);
    assert.equal(result.credentialId, 'v1:new1');
    const save = env.requests.find((r) => r.method === 'onepassword.save-login');
    assert.deepEqual(save.payload, { url: 'https://example.com', username: USER, password: SECRET });
    assert.ok(!JSON.stringify(result).includes(SECRET));
    assert.equal(env.pills[env.pills.length - 1].phase, 'filled_saved');
  });
  await check('save switched off saves nothing', async () => {
    const env = makeEnv({ saveVault: 'v1' });
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    port.fromFrame({ type: 'submit', username: USER, password: SECRET, save: false });
    const result = await pending;
    assert.equal(result.savedTo1Password, false);
    assert.ok(!env.requests.some((r) => r.method === 'onepassword.save-login'));
  });
  await check('a tab that moved to another site gets nothing', async () => {
    // First read: the site for the ask. Second: the re-check right before the fill.
    const env = makeEnv({ tabUrls: ['https://example.com/login', 'https://evil.test/'] });
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    port.fromFrame({ type: 'submit', username: USER, password: SECRET });
    const result = await pending;
    assert.equal(result.errorCode, 'page_changed');
    assert.ok(!env.fills.some((f) => f.message.tool === 'fillCredentialFields'));
    assert.equal(env.pills[env.pills.length - 1].phase, 'page_changed');
  });
  await check('an empty or oversized submit is refused and the sheet stays', async () => {
    const env = makeEnv();
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    port.fromFrame({ type: 'submit', username: '', password: '' });
    port.fromFrame({ type: 'submit', username: USER, password: 'x'.repeat(5000) });
    await tick();
    assert.equal(port.posted.filter((m) => m.type === 'refused').length, 2);
    assert.equal(env.fills.length, 0);
    port.fromFrame({ type: 'cancel' });
    await pending;
  });

  console.log('\n--- every other ending fills nothing ---');
  await check('Cancel returns credential_not_provided', async () => {
    const env = makeEnv();
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    port.fromFrame({ type: 'cancel' });
    const result = await pending;
    assert.equal(result.errorCode, 'credential_not_provided');
    assert.equal(result.reason, 'cancelled');
    assert.equal(port.disconnected, true);
    assert.equal(env.pills[env.pills.length - 1].phase, 'cancelled');
  });
  await check('a closed frame ends the call at once', async () => {
    const env = makeEnv();
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    port.frameGone();
    const result = await pending;
    assert.equal(result.errorCode, 'credential_not_provided');
    assert.equal(result.reason, 'closed');
  });
  await check('nobody answering times out', async () => {
    const env = makeEnv({ timeoutMs: 1200 });
    const { pending } = await startAsk(env);
    const result = await pending;
    assert.equal(result.errorCode, 'credential_not_provided');
    assert.equal(result.reason, 'timeout');
  });
  await check('a new ask on the same tab replaces the old one', async () => {
    const env = makeEnv();
    const first = await startAsk(env);
    env.pills.length = 0;
    const second = await startAsk(env);
    const firstResult = await first.pending;
    assert.equal(firstResult.reason, 'replaced');
    const port = await readyPort(env, second.ask);
    port.fromFrame({ type: 'cancel' });
    await second.pending;
  });

  console.log('\n--- "Use 1Password instead" looks again ---');
  await check('still missing keeps the sheet; once saved it fills from 1Password', async () => {
    let saved = false;
    const env = makeEnv({
      resolve: () => (saved
        ? { ok: true, login: { id: 'v1:n', title: 'Example', username: USER, password: SECRET, oneTimeCode: '' } }
        : NOT_FOUND),
    });
    const { pending, ask } = await startAsk(env);
    const port = await readyPort(env, ask);
    port.fromFrame({ type: 'retry' });
    await tick();
    assert.deepEqual(port.posted[port.posted.length - 1], { type: 'still_missing' });
    saved = true;
    port.fromFrame({ type: 'retry' });
    const result = await pending;
    assert.equal(result.success, true);
    assert.equal(result.credentialId, 'v1:n');
    assert.ok(!JSON.stringify(result).includes(SECRET));
    assert.equal(env.pills[env.pills.length - 1].phase, 'filled_1p');
  });

  console.log(`\nonepassword-credential-sheet: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
