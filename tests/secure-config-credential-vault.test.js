'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

function createStorageArea(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
      }
      if (typeof keys === 'object') {
        const out = {};
        Object.keys(keys).forEach((key) => {
          out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
        });
        return out;
      }
      return { ...store };
    },
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => {
        delete store[key];
      });
    },
    _dump() {
      return { ...store };
    }
  };
}

function loadSecureConfig(localSeed = {}, sessionSeed = {}) {
  const local = createStorageArea(localSeed);
  const session = createStorageArea(sessionSeed);
  const context = {
    chrome: {
      runtime: { id: 'test-extension-id' },
      storage: { local, session }
    },
    crypto: webcrypto,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    TextEncoder,
    TextDecoder,
    URL,
    console,
    self: {},
    window: undefined,
    module: undefined,
    exports: undefined,
    require: undefined,
    setTimeout,
    clearTimeout
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'config', 'secure-config.js'), 'utf8');
  vm.runInNewContext(`${source}\nthis.__secureConfig = secureConfig;`, context, { filename: 'secure-config.js' });

  return {
    secureConfig: context.__secureConfig,
    storageLocal: local,
    storageSession: session
  };
}

// FSB's own PIN vault was replaced by 1Password. What remains in
// secure-config.js only reads the old vault once (so the background can import
// it into 1Password) and erases it. The fixture was written by the original
// vault code, so these checks prove old data still decrypts.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-vault', 'storage.json'), 'utf8'));

async function run() {
  console.log('\n--- the vault API is gone ---');
  {
    const { secureConfig } = loadSecureConfig();
    for (const name of [
      'createCredentialVault', 'unlockCredentialVault', 'saveCredential', 'getCredential', 'getFullCredential',
      'getAllCredentials', 'savePaymentMethod', 'getFullPaymentMethod', 'unlockPaymentMethods'
    ]) {
      assert(typeof secureConfig[name] !== 'function', `secureConfig.${name} no longer exists`);
    }
    assertEqual(secureConfig.normalizeDomain('https://www.example.com/login'), 'example.com', 'normalizeDomain still strips www');
    assertEqual(secureConfig.getParentDomain('mail.google.co.uk'), 'google.co.uk', 'getParentDomain still handles multi-level TLDs');
  }

  console.log('\n--- empty install ---');
  {
    const { secureConfig } = loadSecureConfig();
    const summary = await secureConfig.getLegacyVaultSummary();
    assert(!summary.present, 'no legacy data reports present: false');
    const read = await secureConfig.readLegacyVault('');
    assert(read.success && read.logins.length === 0 && read.cards.length === 0, 'reading an empty install yields nothing');
  }

  console.log('\n--- PIN-protected vault written by the old code ---');
  {
    const { secureConfig, storageLocal, storageSession } = loadSecureConfig(
      fixture.pinVault,
      { fsbCredentialVaultSessionKey: 'stale', fsbPaymentAccessUnlocked: true }
    );
    const summary = await secureConfig.getLegacyVaultSummary();
    assert(summary.present && summary.pinProtected, 'summary reports a PIN-protected legacy vault');
    assertEqual(summary.pinLength, 6, 'summary reports the PIN length');
    assertEqual(summary.logins, 2, 'summary counts both logins');
    assertEqual(summary.cards, 1, 'summary counts the card');

    const wrong = await secureConfig.readLegacyVault('000000');
    assertEqual(wrong.success, false, 'a wrong PIN is rejected');
    assertEqual(wrong.errorCode, 'invalid_pin', 'a wrong PIN reports invalid_pin');
    const missing = await secureConfig.readLegacyVault('');
    assertEqual(missing.errorCode, 'invalid_pin', 'a missing PIN reports invalid_pin');

    const read = await secureConfig.readLegacyVault(fixture.pin);
    assert(read.success, 'the right PIN reads the old vault');
    assertEqual(read.unreadable, 0, 'every entry decrypts');
    const byDomain = Object.fromEntries(read.logins.map((login) => [login.domain, login]));
    assertEqual(byDomain['example.com']?.password, 'correct horse battery', 'login password decrypts');
    assertEqual(byDomain['example.com']?.allowSubdomains, true, 'subdomain setting is kept');
    assertEqual(byDomain['example.com']?.notes, 'primary', 'notes are kept');
    assertEqual(byDomain['login.shop.test']?.username, 'bob', 'second login decrypts');
    assertEqual(read.cards.length, 1, 'card decrypts');
    assertEqual(read.cards[0].cardNumber, '4111111111111111', 'card number decrypts as digits');
    assertEqual(read.cards[0].cvv, '737', 'CVV decrypts');
    assertEqual(read.cards[0].city, 'Chicago', 'billing address decrypts');
    assert(read.cards[0].storageKey.startsWith('payment_method_'), 'card keeps its storage key for the purge');

    // Erase only what 1Password confirmed: one login.
    const partial = await secureConfig.purgeLegacyVault([byDomain['example.com'].storageKey]);
    assertEqual(partial.removed, 1, 'partial purge removes one entry');
    assertEqual(partial.remaining, 2, 'partial purge keeps the rest');
    const afterPartial = storageLocal._dump();
    assert(!('cred_example.com' in afterPartial), 'imported login is erased');
    assert('cred_login.shop.test' in afterPartial, 'login that was not imported stays');
    assert('credentialVaultConfig' in afterPartial, 'PIN verifier stays while entries remain');
    const stillReadable = await secureConfig.readLegacyVault(fixture.pin);
    assertEqual(stillReadable.logins.length, 1, 'the remaining login can still be read with the PIN');

    const ignored = await secureConfig.purgeLegacyVault(['apiKey', 'credentialVaultConfig']);
    assertEqual(ignored.removed, 0, 'purge ignores keys that are not legacy entries');

    const full = await secureConfig.purgeLegacyVault(null);
    assertEqual(full.remaining, 0, 'full purge leaves nothing');
    const afterFull = storageLocal._dump();
    assert(!Object.keys(afterFull).some((key) => key.startsWith('cred_') || key.startsWith('payment_method_')), 'no legacy entries remain');
    assert(!('credentialVaultConfig' in afterFull), 'PIN verifier is erased once the vault is empty');
    const session = storageSession._dump();
    assert(!('fsbCredentialVaultSessionKey' in session) && !('fsbPaymentAccessUnlocked' in session), 'leftover session unlock state is erased');
    assert(!(await secureConfig.getLegacyVaultSummary()).present, 'summary reports nothing left');
  }

  console.log('\n--- pre-vault credentials (no PIN) ---');
  {
    const { secureConfig } = loadSecureConfig(fixture.preVault);
    const summary = await secureConfig.getLegacyVaultSummary();
    assert(summary.present && !summary.pinProtected, 'pre-vault credentials need no PIN');
    const read = await secureConfig.readLegacyVault('');
    assert(read.success, 'pre-vault credentials read without a PIN');
    assertEqual(read.logins[0]?.domain, 'old.example', 'pre-vault login domain comes from its key');
    assertEqual(read.logins[0]?.password, 'legacy-secret', 'pre-vault login decrypts with the extension key');
  }

  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
