'use strict';

// list_credentials / list_payment_methods are answered from 1Password through
// the FSB local server. These handlers must pass setup errors through with
// their codes, report an empty vault as success, and project metadata only.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-bridge-client.js'), 'utf8');

function extractMethod(name) {
  const signature = `  async ${name}() {`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf('\n  async ', start + 10);
  return vm.runInNewContext(`({${source.slice(start, end)}}).${name}`);
}

function extractSyncMethod(name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf('\n  }\n', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}}).${name}`);
}

const onePasswordFailure = extractSyncMethod('_onePasswordFailure');

for (const [methodName, clientMethod, listField, resultField, secretRecord, expected] of [
  [
    '_handleListCredentials', 'listLogins', 'logins', 'credentials',
    { id: 'v1:i1', title: 'Example', domains: ['example.com'], username: 'alice', password: 'hunter2', oneTimeCode: '123456' },
    { id: 'v1:i1', title: 'Example', domain: 'example.com', domains: ['example.com'], username: 'alice' }
  ],
  [
    '_handleListPayments', 'listCards', 'cards', 'paymentMethods',
    { id: 'v1:c1', title: 'Visa', cardBrand: 'visa', last4: '4242', cardholderName: 'A', expiryMonth: '01', expiryYearLast2: '30', cardNumber: '4242424242424242', cvv: '123' },
    { id: 'v1:c1', title: 'Visa', cardBrand: 'visa', last4: '4242', cardholderName: 'A', expiryMonth: '01', expiryYearLast2: '30' }
  ]
]) {
  const method = extractMethod(methodName);

  test(`${methodName} passes 1Password setup errors through with their codes`, async () => {
    for (const errorCode of ['onepassword_not_configured', 'onepassword_no_vaults', 'onepassword_bridge_offline']) {
      const client = {
        _onePasswordFailure: onePasswordFailure,
        _onePassword: () => ({ [clientMethod]: async () => ({ ok: false, errorCode, error: 'x' }) })
      };
      const result = await method.call(client);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, errorCode);
    }
  });

  test(`${methodName} keeps why 1Password refused the sign-in`, async () => {
    for (const reason of ['declined', 'app_missing', 'locked']) {
      const client = {
        _onePasswordFailure: onePasswordFailure,
        _onePassword: () => ({ [clientMethod]: async () => ({ ok: false, errorCode: 'onepassword_auth_failed', error: 'x', reason }) })
      };
      const result = await method.call(client);
      assert.equal(result.errorCode, 'onepassword_auth_failed');
      assert.equal(result.reason, reason, `${methodName} passes reason ${reason} on to the agent guidance`);
    }
    const plain = await method.call({
      _onePasswordFailure: onePasswordFailure,
      _onePassword: () => ({ [clientMethod]: async () => ({ ok: false, errorCode: 'onepassword_no_vaults', error: 'x' }) })
    });
    assert.equal('reason' in plain, false, 'no reason is made up');
  });

  test(`${methodName} reports an empty vault as success`, async () => {
    const client = {
      _onePasswordFailure: onePasswordFailure,
      _onePassword: () => ({ [clientMethod]: async () => ({ ok: true, [listField]: [] }) })
    };
    const result = await method.call(client);
    assert.equal(result.success, true);
    assert.deepEqual(Array.from(result[resultField]), []);
  });

  test(`${methodName} projects metadata only`, async () => {
    const client = {
      _onePasswordFailure: onePasswordFailure,
      _onePassword: () => ({ [clientMethod]: async () => ({ ok: true, [listField]: [secretRecord] }) })
    };
    const result = await method.call(client);
    assert.equal(result.success, true);
    assert.deepEqual(JSON.parse(JSON.stringify(result[resultField])), [expected]);
    const serialized = JSON.stringify(result);
    for (const secret of ['hunter2', '123456', '4242424242424242', '"cvv"']) {
      assert.equal(serialized.includes(secret), false, `${methodName} result never carries ${secret}`);
    }
  });

  test(`${methodName} fails closed when 1Password support did not load`, async () => {
    const result = await method.call({ _onePasswordFailure: onePasswordFailure, _onePassword: () => null });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'onepassword_unavailable');
  });
}
