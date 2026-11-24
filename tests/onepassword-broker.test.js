'use strict';

// 1Password broker (mcp/src/onepassword): site matching, vault allowlist,
// secret projection, card gating, saving, legacy import, error hygiene, and
// the bridge rule that onepassword.* requests are answered by the hub only.
// Runs against the compiled build (npm --prefix mcp run build) with a fake SDK
// shaped like @1password/sdk 0.5.x.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const buildDir = path.join(__dirname, '..', 'mcp', 'build', 'onepassword');
const load = (name) => import(pathToFileURL(path.join(buildDir, name)).href);

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

// --- fake SDK --------------------------------------------------------------

class DesktopSessionExpiredError extends Error {}
class RateLimitExceededError extends Error {}

function loginItem(vaultId, id, { title, url, behavior = 'AnywhereOnWebsite', username, password, otp, updatedAt = '2026-01-01T00:00:00Z' }) {
  const fields = [
    { id: 'username', title: 'username', fieldType: 'Text', value: username },
    { id: 'password', title: 'password', fieldType: 'Concealed', value: password },
  ];
  if (otp) {
    fields.push({ id: 'TOTP_x', title: 'one-time password', fieldType: 'Totp', value: 'otpauth://totp/x?secret=SEED', details: { type: 'Otp', content: { code: otp } } });
  }
  return {
    id, vaultId, title, category: 'Login', state: 'active', tags: [], notes: '',
    websites: [{ url, label: 'website', autofillBehavior: behavior }],
    fields, updatedAt,
  };
}

function cardItem(vaultId, id) {
  return {
    id, vaultId, title: 'Work Visa', category: 'CreditCard', state: 'active', websites: [], tags: [], notes: '',
    fields: [
      { id: 'cardholder', title: 'cardholder name', fieldType: 'Text', value: 'Alice Example' },
      { id: 'type', title: 'type', fieldType: 'CreditCardType', value: 'Visa' },
      { id: 'ccnum', title: 'number', fieldType: 'CreditCardNumber', value: '4111 1111 1111 1111' },
      { id: 'cvv', title: 'verification number', fieldType: 'Concealed', value: '737' },
      { id: 'expiry', title: 'expiry date', fieldType: 'MonthYear', value: '12/2031' },
      { id: 'addr', title: 'billing', fieldType: 'Address', value: '', details: { type: 'Address', content: { street: '1 Main St', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' } } },
    ],
  };
}

function makeSdk(items, options = {}) {
  const calls = { createClient: [], list: 0, get: [], create: [], created: [] };
  let expireNext = options.expireOnce === true;
  // { at: n, error: 'expire' | 'rate' }: the nth create call fails once.
  let interruptCreate = options.interruptCreate ? { ...options.interruptCreate } : null;
  const sdk = {
    DesktopAuth: class { constructor(accountName) { this.accountName = accountName; } },
    async createClient(config) {
      calls.createClient.push(config);
      if (options.authError) throw new Error(options.authError);
      // expireClient: n -- the nth client's session has expired, so every
      // read through it fails, the way one lapsed desktop session does.
      const expired = options.expireClient === calls.createClient.length;
      const lapse = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (expired) throw new DesktopSessionExpiredError('session expired');
      };
      return {
        vaults: {
          async list() {
            await lapse();
            return [
              { id: 'vaultA', title: 'FSB', activeItemCount: 3, vaultType: 'userCreated' },
              { id: 'vaultB', title: 'Private', activeItemCount: 1, vaultType: 'personal' },
            ];
          },
        },
        items: {
          async list(vaultId) {
            calls.list += 1;
            await lapse();
            if (expireNext) {
              expireNext = false;
              throw new DesktopSessionExpiredError('session expired');
            }
            if (options.rateLimited) throw new RateLimitExceededError('slow down');
            return items.filter((item) => item.vaultId === vaultId).map(({ fields, ...overview }) => overview);
          },
          async get(vaultId, itemId) {
            calls.get.push(`${vaultId}:${itemId}`);
            const item = items.find((entry) => entry.vaultId === vaultId && entry.id === itemId);
            if (!item) throw new Error('item not found');
            return item;
          },
          async getAll(vaultId, ids) {
            return {
              individualResponses: ids.map((id) => {
                const item = items.find((entry) => entry.vaultId === vaultId && entry.id === id);
                return item ? { content: item } : { error: { type: 'itemNotFound' } };
              }),
            };
          },
          async create(params) {
            calls.create.push(params);
            if (interruptCreate && calls.create.length === interruptCreate.at) {
              const kind = interruptCreate.error;
              interruptCreate = null;
              throw kind === 'rate' ? new RateLimitExceededError('slow down') : new DesktopSessionExpiredError('session expired');
            }
            if (options.failCreateTitle && params.title === options.failCreateTitle) throw new Error('create failed');
            if (typeof options.onCreate === 'function') options.onCreate(params);
            calls.created.push(params.title);
            return { ...params, id: `new${calls.create.length}` };
          },
        },
      };
    },
  };
  return { sdk, calls };
}

function tempConfigPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-op-test-')), 'onepassword.json');
}

async function rejects(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`expected rejection with ${code}`);
}

async function run() {
  const match = await load('domain-match.js');
  const { OnePasswordBroker, parseItemRef } = await load('broker.js');
  const { handleOnePasswordRequest, isOnePasswordExtMethod, ONEPASSWORD_EXT_METHODS } = await load('ext-handler.js');

  console.log('\n--- site matching follows 1Password autofill rules ---');
  const at = (url) => match.parseHostTarget(url);
  await check('exact host matches', () => {
    assert.equal(match.websiteMatch({ url: 'https://example.com', autofillBehavior: 'ExactDomain' }, at('https://www.example.com/login')), 'exact');
  });
  await check('AnywhereOnWebsite covers subdomains of the registrable domain', () => {
    assert.equal(match.websiteMatch({ url: 'example.com', autofillBehavior: 'AnywhereOnWebsite' }, at('https://accounts.example.com')), 'site');
  });
  await check('ExactDomain refuses subdomains', () => {
    assert.equal(match.websiteMatch({ url: 'example.com', autofillBehavior: 'ExactDomain' }, at('https://accounts.example.com')), null);
  });
  await check('Never websites are ignored', () => {
    assert.equal(match.websiteMatch({ url: 'example.com', autofillBehavior: 'Never' }, at('https://example.com')), null);
  });
  await check('look-alike hosts do not match', () => {
    assert.equal(match.websiteMatch({ url: 'example.com' }, at('https://example.com.evil.test')), null);
    assert.equal(match.websiteMatch({ url: 'example.com' }, at('https://notexample.com')), null);
  });
  await check('multi-level suffixes keep sites apart', () => {
    assert.equal(match.websiteMatch({ url: 'alpha.co.uk' }, at('https://beta.co.uk')), null);
    assert.equal(match.websiteMatch({ url: 'shop.alpha.co.uk' }, at('https://login.alpha.co.uk')), 'site');
  });
  await check('shared hosting suffixes keep customers apart', () => {
    for (const suffix of ['github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'up.railway.app']) {
      assert.equal(match.websiteMatch({ url: `app.${suffix}` }, at(`https://other.${suffix}`)), null, suffix);
      assert.equal(match.websiteMatch({ url: `app.${suffix}` }, at(`https://docs.app.${suffix}`)), 'site', suffix);
      assert.equal(match.websiteMatch({ url: suffix }, at(`https://app.${suffix}`)), null, `bare ${suffix}`);
    }
    assert.equal(match.registrableDomain('a.b.up.railway.app'), 'b.up.railway.app', 'longest suffix wins');
    assert.equal(match.registrableDomain('accounts.github.com'), 'github.com', 'other domains are unchanged');
    assert.equal(match.websiteMatch({ url: 'app.github.io', autofillBehavior: 'ExactDomain' }, at('https://app.github.io/login')), 'exact');
  });
  await check('explicit ports must agree', () => {
    assert.equal(match.websiteMatch({ url: 'http://localhost:3000' }, at('http://localhost:3000/login')), 'exact');
    assert.equal(match.websiteMatch({ url: 'http://localhost:3000' }, at('http://localhost:4000')), null);
  });
  await check('IP addresses only match exactly', () => {
    assert.equal(match.websiteMatch({ url: 'http://10.0.0.5' }, at('http://10.0.0.6')), null);
  });
  await check('an https login is never released to an http page', () => {
    assert.equal(match.websiteMatch({ url: 'https://bank.com', autofillBehavior: 'ExactDomain' }, at('http://bank.com/login')), null);
    assert.equal(match.websiteMatch({ url: 'https://bank.com' }, at('http://login.bank.com')), null);
    assert.equal(match.bestWebsiteMatch([{ url: 'https://bank.com' }], at('http://bank.com')), null);
    assert.equal(match.websiteMatch({ url: 'https://bank.com' }, at('https://bank.com')), 'exact');
  });
  await check('http and scheme-less websites match either scheme', () => {
    assert.equal(match.websiteMatch({ url: 'http://intranet.test' }, at('https://intranet.test')), 'exact');
    assert.equal(match.websiteMatch({ url: 'http://intranet.test' }, at('http://intranet.test')), 'exact');
    assert.equal(match.websiteMatch({ url: '192.168.1.1' }, at('http://192.168.1.1')), 'exact');
    assert.equal(match.websiteMatch({ url: 'example.com' }, at('http://example.com')), 'exact');
  });
  await check('hosts with an unknown scheme get http only when usually served that way', () => {
    assert.equal(at('example.com').protocol, null);
    assert.equal(at('http://example.com').protocol, 'http:');
    assert.equal(match.defaultSchemeForHost('example.com'), 'https:');
    assert.equal(match.defaultSchemeForHost('192.168.1.1'), 'http:');
    assert.equal(match.defaultSchemeForHost('localhost'), 'http:');
  });
  await check('non-web schemes are rejected', () => {
    assert.equal(at('chrome://settings'), null);
    assert.equal(at('file:///etc/passwd'), null);
  });

  console.log('\n--- configuration and allowlist ---');
  const items = [
    loginItem('vaultA', 'loginA', { title: 'Example', url: 'https://example.com', username: 'alice', password: 'pw-a', otp: '123456' }),
    loginItem('vaultA', 'loginA2', { title: 'Example work', url: 'https://example.com', username: 'alice@work', password: 'pw-a2', updatedAt: '2026-06-01T00:00:00Z' }),
    loginItem('vaultA', 'loginShop', { title: 'Shop', url: 'https://shop.test', behavior: 'ExactDomain', username: 'bob', password: 'pw-shop' }),
    loginItem('vaultB', 'loginPrivate', { title: 'Bank', url: 'https://bank.test', username: 'carol', password: 'pw-bank' }),
    cardItem('vaultA', 'cardA'),
  ];

  await check('unconfigured broker refuses to read', async () => {
    const { sdk } = makeSdk(items);
    const broker = new OnePasswordBroker({ loadSdk: async () => sdk, configPath: tempConfigPath(), env: {} });
    assert.equal(broker.status().configured, false);
    await rejects(broker.listLogins(), 'onepassword_not_configured');
  });

  const configPath = tempConfigPath();
  const fake = makeSdk(items);
  const broker = new OnePasswordBroker({ loadSdk: async () => fake.sdk, configPath, env: {} });

  await check('desktop sign-in without vaults is not ready', async () => {
    const status = broker.configure({ authKind: 'desktop', accountName: 'my.1password.com' });
    assert.equal(status.authKind, 'desktop');
    assert.equal(status.configured, false);
    await rejects(broker.listLogins(), 'onepassword_no_vaults');
    assert.equal(fake.calls.createClient[0].auth.accountName, 'my.1password.com', 'desktop auth uses the account name');
    assert.equal(fake.calls.createClient[0].integrationName, 'FSB');
  });

  await check('config file is owner-only', () => {
    if (process.platform === 'win32') return;
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
  });

  await check('listing vaults shows every vault so the user can choose', async () => {
    const vaults = await broker.listVaults();
    assert.deepEqual(vaults.map((vault) => vault.id), ['vaultA', 'vaultB']);
  });

  await check('save vault must be one of the allowed vaults', () => {
    assert.throws(() => broker.configure({ vaultIds: ['vaultA'], saveVaultId: 'vaultB' }), /allowed vaults/);
  });

  broker.configure({ vaultIds: ['vaultA'] });

  await check('only allowlisted vaults are listed, without passwords', async () => {
    const logins = await broker.listLogins();
    assert.deepEqual(logins.map((login) => login.id).sort(), ['vaultA:loginA', 'vaultA:loginA2', 'vaultA:loginShop']);
    const serialized = JSON.stringify(logins);
    for (const secret of ['pw-a', 'pw-bank', '123456', 'SEED']) assert.ok(!serialized.includes(secret), `list omits ${secret}`);
    assert.equal(logins.find((login) => login.id === 'vaultA:loginA').username, 'alice');
  });
  await check('logins list how each site matches and whether a code is saved, never the code', async () => {
    const logins = await broker.listLogins();
    const byId = Object.fromEntries(logins.map((login) => [login.id, login]));
    assert.deepEqual(byId['vaultA:loginA'].websites, [{ host: 'example.com', rule: 'site', protocol: 'https' }]);
    assert.deepEqual(byId['vaultA:loginShop'].websites, [{ host: 'shop.test', rule: 'exact', protocol: 'https' }]);
    assert.equal(byId['vaultA:loginA'].hasOneTimeCode, true);
    assert.equal(byId['vaultA:loginA2'].hasOneTimeCode, false);
    assert.equal(byId['vaultA:loginA'].vaultId, 'vaultA');
    assert.ok(!JSON.stringify(logins).includes('123456') && !JSON.stringify(logins).includes('SEED'), 'no code or seed');
  });
  await check('vaults carry their type so the UI can name personal and shared vaults', async () => {
    const vaults = await broker.listVaults();
    assert.deepEqual(vaults.map((vault) => vault.vaultType), ['userCreated', 'personal']);
  });

  console.log('\n--- resolving logins for a page ---');
  await check('the most specific, most recent match wins without requireUnique', async () => {
    const login = await broker.resolveLogin({ url: 'https://example.com/login' });
    assert.equal(login.id, 'vaultA:loginA2', 'newer exact match wins');
    assert.equal(login.password, 'pw-a2');
  });
  await check('requireUnique returns candidates instead of guessing', async () => {
    const error = await rejects(broker.resolveLogin({ url: 'https://example.com', requireUnique: true }), 'multiple_credentials');
    const candidates = error.details.candidates;
    assert.deepEqual(candidates.map((candidate) => candidate.id).sort(), ['vaultA:loginA', 'vaultA:loginA2']);
    assert.ok(!JSON.stringify(candidates).includes('pw-'), 'candidates carry no passwords');
  });
  await check('one exact-host login is not ambiguous next to site-level matches', async () => {
    const tiered = makeSdk([
      loginItem('vaultA', 'exactOne', { title: 'Accounts', url: 'https://accounts.example.com', username: 'exact', password: 'pw-exact' }),
      loginItem('vaultA', 'siteOne', { title: 'Example', url: 'https://example.com', username: 'site', password: 'pw-site' }),
    ]);
    const tieredBroker = new OnePasswordBroker({ loadSdk: async () => tiered.sdk, configPath, env: {} });
    const login = await tieredBroker.resolveLogin({ url: 'https://accounts.example.com', requireUnique: true });
    assert.equal(login.username, 'exact');
  });
  await check('a chosen item resolves with its one-time code', async () => {
    const login = await broker.resolveLogin({ url: 'https://sub.example.com', itemId: 'vaultA:loginA', requireUnique: true });
    assert.equal(login.username, 'alice');
    assert.equal(login.password, 'pw-a');
    assert.equal(login.oneTimeCode, '123456');
    assert.equal(login.match, 'site');
  });
  await check('a chosen item for another site is refused', async () => {
    await rejects(broker.resolveLogin({ url: 'https://shop.test', itemId: 'vaultA:loginA' }), 'credential_domain_mismatch');
  });
  await check('items outside the allowlist cannot be addressed', async () => {
    await rejects(broker.resolveLogin({ url: 'https://bank.test', itemId: 'vaultB:loginPrivate' }), 'invalid_request');
    await rejects(broker.resolveLogin({ url: 'https://bank.test' }), 'credential_not_found');
  });
  await check('an https login is withheld from the http version of its site, and the error says why', async () => {
    // A refusal on purpose has its own code, so FSB never offers to type a
    // login on that http page instead.
    const error = await rejects(broker.resolveLogin({ url: 'http://example.com/login' }), 'credential_needs_https');
    assert.match(error.message, /never fills it on an http:\/\/ page/);
    const pinned = await rejects(broker.resolveLogin({ url: 'http://example.com', itemId: 'vaultA:loginA' }), 'credential_domain_mismatch');
    assert.match(pinned.message, /https:\/\//);
    const plain = await rejects(broker.resolveLogin({ url: 'https://nothing-saved.test' }), 'credential_not_found');
    assert.doesNotMatch(plain.message, /http:\/\//, 'https pages keep the plain message');
  });
  await check('ExactDomain logins are not released on subdomains', async () => {
    await rejects(broker.resolveLogin({ url: 'https://www2.shop.test' }), 'credential_not_found');
  });
  await check('pages without an http(s) URL are refused', async () => {
    await rejects(broker.resolveLogin({ url: 'javascript:alert(1)' }), 'invalid_request');
  });

  console.log('\n--- credit cards ---');
  await check('card list and description carry no number or CVV', async () => {
    const cards = await broker.listCards();
    assert.equal(cards.length, 1);
    assert.equal(cards[0].cardBrand, 'visa');
    assert.equal(cards[0].last4, '1111');
    assert.equal(cards[0].expiryYearLast2, '31');
    assert.equal(cards[0].hasBillingAddress, true, 'whether an address is saved, never the address');
    assert.ok(!JSON.stringify(cards).includes('Main St') && !JSON.stringify(cards).includes('60601'));
    const described = await broker.describeCard({ itemId: 'vaultA:cardA' });
    for (const value of [JSON.stringify(cards), JSON.stringify(described)]) {
      assert.ok(!value.includes('4111111111111111') && !value.includes('737'), 'metadata only');
    }
  });
  await check('resolveCard returns the full card with billing address', async () => {
    const card = await broker.resolveCard({ itemId: 'vaultA:cardA' });
    assert.equal(card.cardNumber, '4111111111111111');
    assert.equal(card.cvv, '737');
    assert.equal(card.expiryMonth, '12');
    assert.equal(card.expiryYear, '2031');
    assert.equal(card.city, 'Chicago');
  });
  await check('a login item is not a card', async () => {
    await rejects(broker.resolveCard({ itemId: 'vaultA:loginA' }), 'payment_method_not_found');
  });

  console.log('\n--- saving and importing ---');
  await check('saving needs a save vault', async () => {
    await rejects(broker.saveLogin({ url: 'https://new.test', username: 'u', password: 'p' }), 'onepassword_save_vault_missing');
  });
  broker.configure({ saveVaultId: 'vaultA' });
  await check('saved logins are tagged and bound to the site', async () => {
    const saved = await broker.saveLogin({ url: 'https://new.test/login', username: 'u', password: 'p' });
    assert.equal(saved.id, 'vaultA:new1');
    const params = fake.calls.create[0];
    assert.equal(params.category, 'Login');
    assert.equal(params.vaultId, 'vaultA');
    assert.deepEqual(params.tags, ['FSB']);
    assert.equal(params.websites[0].url, 'https://new.test');
    assert.deepEqual(params.fields.map((field) => field.id), ['username', 'password']);
  });
  await check('legacy import reports exactly what 1Password saved', async () => {
    const importFake = makeSdk([], { failCreateTitle: 'bad.test' });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => importFake.sdk, configPath, env: {} });
    const result = await importBroker.importLegacy({
      logins: [
        { domain: 'example.com', username: 'alice', password: 'pw', allowSubdomains: true },
        { domain: 'bad.test', username: 'x', password: 'y' },
        { domain: 'not a domain', username: 'x', password: 'y' },
      ],
      cards: [{ cardholderName: 'A', cardNumber: '4111111111111111', expiryMonth: '12', expiryYear: '2031', cvv: '737', city: 'Chicago' }],
    });
    assert.deepEqual(result.logins, { imported: 1, failed: 2 });
    assert.deepEqual(result.cards, { imported: 1, failed: 0 });
    assert.deepEqual(result.importedLoginDomains, ['example.com']);
    assert.deepEqual(result.importedCardIndexes, [0]);
    const card = importFake.calls.create.find((params) => params.category === 'CreditCard');
    assert.equal(card.fields.find((field) => field.id === 'expiry').value, '12/2031');
    assert.ok(card.notes.includes('Chicago'), 'billing address is kept in the card notes');
    assert.ok(!JSON.stringify(result).includes('pw'), 'import result echoes no secrets');
    assert.equal(result.stopped, null);
  });
  await check('logins saved from an http page keep their scheme', async () => {
    const httpFake = makeSdk([]);
    const httpBroker = new OnePasswordBroker({ loadSdk: async () => httpFake.sdk, configPath, env: {} });
    await httpBroker.saveLogin({ url: 'http://router.test:8080', username: 'admin', password: 'p' });
    assert.equal(httpFake.calls.create[0].websites[0].url, 'http://router.test:8080');
  });
  await check('imported hostnames get https, except IPs and single-label hosts', async () => {
    const schemeFake = makeSdk([]);
    const schemeBroker = new OnePasswordBroker({ loadSdk: async () => schemeFake.sdk, configPath, env: {} });
    await schemeBroker.importLegacy({
      logins: [
        { domain: 'example.com', username: 'a', password: 'p' },
        { domain: '192.168.1.1', username: 'b', password: 'p' },
        { domain: 'localhost', username: 'c', password: 'p' },
      ],
    });
    assert.deepEqual(schemeFake.calls.create.map((params) => params.websites[0].url),
      ['https://example.com', 'http://192.168.1.1', 'http://localhost']);
  });
  const legacyLogins = ['a.test', 'b.test', 'c.test', 'd.test'].map((domain) => ({ domain, username: 'u', password: 'p' }));
  const legacyCard = { cardholderName: 'A', cardNumber: '4111111111111111', expiryMonth: '12', expiryYear: '2031', cvv: '737' };
  await check('a session that expires mid-import stops without duplicating anything', async () => {
    const expiring = makeSdk([], { interruptCreate: { at: 3, error: 'expire' } });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => expiring.sdk, configPath, env: {} });
    const result = await importBroker.importLegacy({ logins: legacyLogins, cards: [legacyCard] });
    assert.deepEqual(expiring.calls.created, ['a.test', 'b.test'], 'each item is created at most once');
    assert.deepEqual(result.importedLoginDomains, ['a.test', 'b.test']);
    assert.deepEqual(result.logins, { imported: 2, failed: 0 });
    assert.deepEqual(result.cards, { imported: 0, failed: 0 });
    assert.deepEqual(result.stopped, { code: 'onepassword_auth_failed', notAttempted: { logins: 2, cards: 1 } });
    await importBroker.listVaults();
    assert.equal(expiring.calls.createClient.length, 2, 'the next request signs in again');
  });
  await check('a session that expires before anything is saved is retried once', async () => {
    const expiring = makeSdk([], { interruptCreate: { at: 1, error: 'expire' } });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => expiring.sdk, configPath, env: {} });
    const result = await importBroker.importLegacy({ logins: legacyLogins, cards: [] });
    assert.deepEqual(expiring.calls.created, ['a.test', 'b.test', 'c.test', 'd.test']);
    assert.equal(expiring.calls.createClient.length, 2);
    assert.equal(result.stopped, null);
  });
  await check('a rate limit mid-import keeps what was saved and reports the rest', async () => {
    const limited = makeSdk([], { interruptCreate: { at: 5, error: 'rate' } });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => limited.sdk, configPath, env: {} });
    const result = await importBroker.importLegacy({ logins: legacyLogins, cards: [legacyCard, legacyCard] });
    assert.deepEqual(result.logins, { imported: 4, failed: 0 });
    assert.deepEqual(result.cards, { imported: 0, failed: 0 });
    assert.deepEqual(result.importedCardIndexes, []);
    assert.deepEqual(result.stopped, { code: 'onepassword_rate_limited', notAttempted: { logins: 0, cards: 2 } });
    assert.equal(importBroker.status().lastError.code, 'onepassword_rate_limited');
  });
  await check('a rate limit before anything is saved is still an error', async () => {
    const limited = makeSdk([], { interruptCreate: { at: 1, error: 'rate' } });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => limited.sdk, configPath, env: {} });
    await rejects(importBroker.importLegacy({ logins: legacyLogins, cards: [] }), 'onepassword_rate_limited');
    assert.deepEqual(limited.calls.created, []);
  });
  await check('a slow import stops starting items at its time limit so the reply arrives in time', async () => {
    let clock = 1_000_000;
    // Each save takes 25s: saves start at 0s, 25s, and 50s; at 75s the limit has passed.
    const slow = makeSdk([], { onCreate: () => { clock += 25_000; } });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => slow.sdk, configPath, env: {}, now: () => clock });
    const result = await importBroker.importLegacy({ logins: legacyLogins, cards: [legacyCard] });
    assert.deepEqual(slow.calls.created, ['a.test', 'b.test', 'c.test'], 'nothing starts after the limit');
    assert.deepEqual(result.importedLoginDomains, ['a.test', 'b.test', 'c.test']);
    assert.deepEqual(result.stopped, { code: 'onepassword_import_time_limit', notAttempted: { logins: 1, cards: 1 } });
  });
  await check('the time limit also covers the cards', async () => {
    let clock = 1_000_000;
    const slow = makeSdk([], { onCreate: () => { clock += 25_000; } });
    const importBroker = new OnePasswordBroker({ loadSdk: async () => slow.sdk, configPath, env: {}, now: () => clock });
    const result = await importBroker.importLegacy({ logins: legacyLogins.slice(0, 2), cards: [legacyCard, legacyCard] });
    assert.equal(slow.calls.created.length, 3, 'two logins and one card fit inside the limit');
    assert.deepEqual(result.importedCardIndexes, [0]);
    assert.deepEqual(result.stopped, { code: 'onepassword_import_time_limit', notAttempted: { logins: 0, cards: 1 } });
  });

  console.log('\n--- sessions, limits, and error hygiene ---');
  await check('an expired desktop session reconnects once', async () => {
    const expiring = makeSdk(items, { expireOnce: true });
    const retrying = new OnePasswordBroker({ loadSdk: async () => expiring.sdk, configPath, env: {} });
    const logins = await retrying.listLogins();
    assert.ok(logins.length > 0);
    assert.equal(expiring.calls.createClient.length, 2, 'client was rebuilt after expiry');
  });
  // The settings page lists vaults and logins at once on a cold server; with
  // the desktop app each extra sign-in is another approval prompt.
  const slowLoad = (sdk) => async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return sdk;
  };
  await check('requests that arrive during the first sign-in share it', async () => {
    const shared = makeSdk(items);
    const cold = new OnePasswordBroker({ loadSdk: slowLoad(shared.sdk), configPath, env: {} });
    const [vaults, logins] = await Promise.all([cold.listVaults(), cold.listLogins()]);
    assert.ok(vaults.length > 0 && logins.length > 0);
    assert.equal(shared.calls.createClient.length, 1, 'one sign-in for both requests');
    assert.equal(cold.status().connection, 'connected');
  });
  await check('a declined first sign-in fails every waiting request, and the next one asks again', async () => {
    const flaky = makeSdk(items);
    const createClient = flaky.sdk.createClient;
    let declineNext = true;
    flaky.sdk.createClient = async (config) => {
      if (!declineNext) return createClient(config);
      declineNext = false;
      flaky.calls.createClient.push(config);
      throw new Error('declined in the 1Password app');
    };
    const cold = new OnePasswordBroker({ loadSdk: slowLoad(flaky.sdk), configPath, env: {} });
    await Promise.all([
      rejects(cold.listVaults(), 'onepassword_auth_failed'),
      rejects(cold.listLogins(), 'onepassword_auth_failed'),
    ]);
    assert.equal(flaky.calls.createClient.length, 1, 'one approval request, not two');
    assert.ok((await cold.listLogins()).length > 0);
    assert.equal(flaky.calls.createClient.length, 2, 'the next request signs in again');
  });
  await check('requests that hit the same expired session share one new sign-in', async () => {
    const lapsed = makeSdk(items, { expireClient: 1 });
    const broker = new OnePasswordBroker({ loadSdk: async () => lapsed.sdk, configPath, env: {} });
    const [vaults, logins] = await Promise.all([broker.listVaults(), broker.listLogins()]);
    assert.ok(vaults.length > 0 && logins.length > 0, 'both requests succeed after signing in again');
    assert.equal(lapsed.calls.createClient.length, 2, 'one sign-in to replace the expired one, not one per request');
  });
  await check('rate limits surface as their own code', async () => {
    const limited = new OnePasswordBroker({ loadSdk: async () => makeSdk(items, { rateLimited: true }).sdk, configPath, env: {} });
    await rejects(limited.listLogins(), 'onepassword_rate_limited');
  });
  await check('sign-in errors never echo a token', async () => {
    const token = `ops_${'A'.repeat(48)}`;
    const failing = new OnePasswordBroker({
      loadSdk: async () => makeSdk(items, { authError: `bad token ${token}` }).sdk,
      configPath: tempConfigPath(),
      env: { OP_SERVICE_ACCOUNT_TOKEN: token },
    });
    failing.configure({ vaultIds: ['vaultA'] });
    const error = await rejects(failing.listLogins(), 'onepassword_auth_failed');
    assert.ok(!error.message.includes(token));
    assert.ok(!JSON.stringify(error.details || {}).includes(token), 'the reason detail never carries the token');
    const status = failing.status();
    assert.equal(status.tokenSource, 'env');
    assert.ok(!JSON.stringify(status).includes(token), 'status never includes the token');
  });
  await check('a missing desktop app gets an actionable message', async () => {
    const missing = new OnePasswordBroker({
      loadSdk: async () => makeSdk(items, { authError: 'Native library is not available.' }).sdk,
      configPath,
      env: {},
    });
    const error = await rejects(missing.listVaults(), 'onepassword_auth_failed');
    assert.match(error.message, /Integrate with other apps/);
    assert.equal(error.details && error.details.reason, 'app_missing', 'the UI can tell a missing app from a lock');
  });
  await check('item refs are strict', () => {
    assert.deepEqual(parseItemRef('abc:def'), { vaultId: 'abc', itemId: 'def' });
    assert.equal(parseItemRef('abc:def:ghi'), null);
    assert.equal(parseItemRef('../x:y'), null);
  });

  console.log('\n--- ext request handler ---');
  await check('only onepassword.* methods are claimed', () => {
    assert.ok(ONEPASSWORD_EXT_METHODS.every(isOnePasswordExtMethod));
    assert.equal(isOnePasswordExtMethod('delegate.start'), false);
  });
  await check('unknown methods and extra fields are refused', async () => {
    assert.equal((await handleOnePasswordRequest(broker, { method: 'onepassword.export', payload: {} })).errorCode, 'invalid_request');
    const tokenAttempt = await handleOnePasswordRequest(broker, { method: 'onepassword.configure', payload: { authKind: 'service-account', token: 'ops_x' } });
    assert.equal(tokenAttempt.errorCode, 'invalid_request', 'tokens cannot be set over the bridge');
  });
  await check('broker errors map to codes with candidates intact', async () => {
    const response = await handleOnePasswordRequest(broker, { method: 'onepassword.resolve-login', payload: { url: 'https://example.com', requireUnique: true } });
    assert.equal(response.ok, false);
    assert.equal(response.errorCode, 'multiple_credentials');
    assert.equal(response.candidates.length, 2);
  });

  console.log('\n--- MCP tool results ---');
  const { multipleCredentialsResult } = await import(pathToFileURL(path.join(__dirname, '..', 'mcp', 'build', 'tools', 'vault.js')).href);
  await check('several matching logins reach the agent as candidates', () => {
    const mapped = multipleCredentialsResult({
      success: false,
      errorCode: 'multiple_credentials',
      error: 'Several 1Password logins match example.com. Pass credential_id to choose one.',
      candidates: [
        { id: 'vaultA:loginA', title: 'Example', username: 'alice', password: 'pw-a' },
        { id: 'vaultA:loginA2', title: 'Example work', username: 'alice@work' },
      ],
    });
    assert.equal(mapped.isError, true);
    const text = mapped.content[0].text;
    assert.match(text, /^Detected: Several 1Password logins match this site/);
    assert.match(text, /credential_id/);
    const payload = JSON.parse(text.slice(text.indexOf('{')));
    assert.deepEqual(payload.candidates, [
      { id: 'vaultA:loginA', title: 'Example', username: 'alice' },
      { id: 'vaultA:loginA2', title: 'Example work', username: 'alice@work' },
    ]);
    assert.ok(!text.includes('pw-a'), 'only id, title, and username are kept');
  });
  await check('other results keep the generic error mapping', () => {
    assert.equal(multipleCredentialsResult({ success: false, errorCode: 'credential_not_found', error: 'x' }), null);
    assert.equal(multipleCredentialsResult({ success: true, filled: ['password'] }), null);
    assert.equal(multipleCredentialsResult(null), null);
  });
  await check('a choice without candidates points at list_credentials', () => {
    const mapped = multipleCredentialsResult({ success: false, errorCode: 'multiple_credentials', error: 'Several match.' });
    assert.match(mapped.content[0].text, /Call list_credentials/);
  });

  console.log('\n--- bridge hub routing ---');
  const { WebSocketBridge } = await import(pathToFileURL(path.join(__dirname, '..', 'mcp', 'build', 'bridge.js')).href);
  await check('onepassword.* is answered by the hub without agent-spawn and never relayed', async () => {
    const handled = [];
    const bridge = new WebSocketBridge({
      instanceId: 'op-routing',
      handleOnePasswordRequest: async (request) => {
        handled.push(request.method);
        return { ok: true, status: { configured: true } };
      },
    });
    const relaySent = [];
    bridge.relayClients.set('relay-1', { readyState: 1, send: (raw) => relaySent.push(raw) });
    bridge.relayCapabilities.set('relay-1', new Set(['agent-spawn']));
    const extensionSent = [];
    const extensionSocket = { readyState: 1, send: (raw) => extensionSent.push(JSON.parse(raw)) };
    bridge._handleExtRequest(extensionSocket, { id: 'op-1', type: 'ext:request', method: 'onepassword.status', payload: {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(handled, ['onepassword.status']);
    assert.equal(relaySent.length, 0, 'no relay ever sees a 1Password request');
    assert.deepEqual(extensionSent, [{ id: 'op-1', type: 'ext:response', payload: { ok: true, status: { configured: true } } }]);
  });
  await check('a hub with 1Password disabled refuses instead of relaying', async () => {
    const bridge = new WebSocketBridge({ instanceId: 'op-disabled', handleOnePasswordRequest: null });
    const relaySent = [];
    bridge.relayClients.set('relay-1', { readyState: 1, send: (raw) => relaySent.push(raw) });
    bridge.relayCapabilities.set('relay-1', new Set(['agent-spawn']));
    const extensionSent = [];
    bridge._handleExtRequest({ readyState: 1, send: (raw) => extensionSent.push(JSON.parse(raw)) },
      { id: 'op-2', type: 'ext:request', method: 'onepassword.list-logins', payload: {} });
    assert.equal(relaySent.length, 0);
    assert.equal(extensionSent[0].error.code, 'invalid_ext_request');
  });

  console.log(`\nonepassword-broker: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
