'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-bridge-client.js'), 'utf8');

for (const [methodName, statusAction, listAction, field] of [
  ['_handleListCredentials', 'getCredentialVaultStatus', 'getAllCredentials', 'credentials'],
  ['_handleListPayments', 'getPaymentVaultStatus', 'getAllPaymentMethods', 'paymentMethods']
]) {
  const start = source.indexOf(`  async ${methodName}() {`);
  const end = source.indexOf('\n  async ', start + 10);
  const method = vm.runInNewContext(`({${source.slice(start, end)}}).${methodName}`);
  test(`${methodName} distinguishes unconfigured, locked, and empty`, async () => {
    const calls = [];
    const client = { _dispatchToBackground: async ({ action }) => {
      calls.push(action);
      if (action === statusAction) return client.status;
      if (action === listAction) return { success: true, [field]: [] };
      throw new Error(action);
    } };
    client.status = { configured: false, unlocked: false };
    assert.equal((await method.call(client)).errorCode, 'vault_not_configured');
    client.status = { configured: true, unlocked: false };
    assert.equal((await method.call(client)).errorCode, 'vault_locked');
    client.status = { configured: true, unlocked: true, paymentUnlocked: true };
    const empty = await method.call(client);
    assert.equal(empty.success, true);
    assert.deepEqual(Array.from(empty[field]), []);
    assert.deepEqual(calls, [statusAction, statusAction, statusAction, listAction]);
  });
}
