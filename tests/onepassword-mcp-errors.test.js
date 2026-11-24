'use strict';

// What an MCP agent reads when a 1Password tool fails (mcp/src/errors.ts,
// mcp/src/tools/vault.ts). Every vault code must get its own guidance, keep
// its code machine-readable, and never be filed as a page problem with a
// "retry" hint: after the user declines, the agent must not ask again.
// Runs against the compiled build (npm --prefix mcp run build).

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const buildDir = path.join(__dirname, '..', 'mcp', 'build');
const load = (name) => import(pathToFileURL(path.join(buildDir, name)).href);

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS:', name);
  } catch (error) {
    console.error('  FAIL:', name);
    throw error;
  }
}

const CODES = [
  ['credential_not_found', 'No 1Password login is saved for example.com'],
  ['credential_not_provided', 'The user did not sign in to example.com; nothing was filled'],
  ['credential_domain_mismatch', 'That login is not saved for example.com'],
  ['credential_needs_https', 'A 1Password login is saved for https://example.com, and FSB never fills it on an http:// page'],
  ['payment_not_approved', 'User declined payment fill'],
  ['payment_method_not_found', 'Payment method not found in 1Password'],
  ['card_requires_https', 'Cards are filled only on https pages'],
  ['page_changed', 'The page changed while 1Password was answering; the login was not filled'],
  ['merchant_changed', 'The page changed after approval; the card was not filled'],
  ['onepassword_timeout', '1Password did not answer in time. Check the 1Password app for an approval prompt, then try again.'],
  ['onepassword_bridge_offline', 'FSB connects to 1Password through the FSB local server.'],
  ['onepassword_bridge_unpaired', 'Pair FSB with the local server again, then retry.'],
  ['onepassword_server_outdated', 'Update the FSB local server (fsb-mcp-server) to use 1Password.'],
  ['onepassword_rate_limited', '1Password is rate limiting requests'],
  ['onepassword_not_configured', 'Connect 1Password in FSB settings'],
  ['onepassword_no_vaults', 'Allow at least one vault'],
  ['onepassword_save_vault_missing', 'Choose a vault for new logins'],
  ['onepassword_auth_failed', '1Password did not let FSB sign in'],
  ['onepassword_unavailable', '1Password support did not load'],
];

async function run() {
  const { mapFSBError } = await load('errors.js');
  const { multipleCredentialsResult } = await load('tools/vault.js');

  console.log('\n--- each vault code has its own guidance ---');
  for (const [code, error] of CODES) {
    check(`${code} is not a page problem and keeps its code`, () => {
      const out = mapFSBError({ success: false, errorCode: code, error });
      assert.equal(out.isError, true);
      const text = out.content[0].text;
      assert.ok(!/Page navigation/.test(text), text);
      assert.ok(!/Refresh page state/.test(text), text);
      assert.match(text, /^Detected: 1Password/);
      assert.ok(text.includes(error), 'keeps the extension\'s reason');
      const tail = JSON.parse(text.slice(text.lastIndexOf('\n') + 1));
      assert.equal(tail.errorCode, code);
    });
  }

  console.log('\n--- the user saying no stops the agent ---');
  check('a declined card fill says not to retry', () => {
    const text = mapFSBError({ success: false, errorCode: 'payment_not_approved', error: 'User declined payment fill' }).content[0].text;
    assert.match(text, /Do not retry the fill/);
    assert.match(text, /Never ask for a password, one-time code or card number in chat/);
  });
  check('a declined sign-in keeps its reason and says not to call again', () => {
    const text = mapFSBError({ success: false, errorCode: 'credential_not_provided', reason: 'cancelled', error: 'The user did not sign in to example.com; nothing was filled' }).content[0].text;
    assert.match(text, /Do not call fill_credential again on your own/);
    assert.deepEqual(JSON.parse(text.slice(text.lastIndexOf('\n') + 1)), { errorCode: 'credential_not_provided', reason: 'cancelled' });
  });
  console.log('\n--- a failed 1Password sign-in says what the user must do ---');
  const authText = (reason) => mapFSBError({
    success: false,
    errorCode: 'onepassword_auth_failed',
    error: '1Password sign-in failed',
    ...(reason ? { reason } : {}),
  }).content[0].text;
  const nextAction = (text) => text.split('\n').find((line) => line.startsWith('Next action: '));
  check('a missing app is not retried', () => {
    const text = authText('app_missing');
    assert.match(nextAction(text), /not installed/);
    assert.match(nextAction(text), /do not retry/);
    assert.deepEqual(JSON.parse(text.slice(text.lastIndexOf('\n') + 1)), { errorCode: 'onepassword_auth_failed', reason: 'app_missing' });
  });
  check('an app that refuses FSB names the setting to turn on', () => {
    const text = authText('integration_off');
    assert.match(nextAction(text), /Settings > Developer, and turn on Integrate with 1Password SDKs/);
    assert.doesNotMatch(text, /other apps/);
  });
  check('a declined approval stops the agent', () => {
    const text = authText('declined');
    assert.match(nextAction(text), /Do not retry/);
    assert.match(nextAction(text), /Never ask for a password/);
  });
  check('a locked app asks for an unlock', () => {
    assert.match(nextAction(authText('locked')), /^Next action: Ask the user to unlock 1Password, then retry once\.$/);
  });
  check('an unknown reason keeps the general advice', () => {
    for (const reason of ['unknown', undefined]) {
      assert.match(nextAction(authText(reason)), /unlock 1Password or approve FSB/);
    }
  });

  check('several matching logins still return their candidates', () => {
    const out = multipleCredentialsResult({ success: false, errorCode: 'multiple_credentials', error: 'Several 1Password logins match example.com.', candidates: [{ id: 'v:1', title: 'A', username: 'a' }] });
    assert.match(out.content[0].text, /Detected: Several 1Password logins match this site/);
  });
  check('candidates keep the vault that holds each login', () => {
    const out = multipleCredentialsResult({
      success: false,
      errorCode: 'multiple_credentials',
      error: 'Several 1Password logins match netflix.com.',
      candidates: [
        { id: 'vP:x', title: 'Netflix', username: 'a@b.com', vault: 'Personal' },
        { id: 'vS:y', title: 'Netflix', username: 'a@b.com', vault: 'Shared' },
        { id: 'vW:z', title: 'Netflix', username: 'a@b.com', vault: '' },
      ],
    });
    const text = out.content[0].text;
    assert.deepEqual(JSON.parse(text.slice(text.indexOf('{'))).candidates, [
      { id: 'vP:x', title: 'Netflix', username: 'a@b.com', vault: 'Personal' },
      { id: 'vS:y', title: 'Netflix', username: 'a@b.com', vault: 'Shared' },
      { id: 'vW:z', title: 'Netflix', username: 'a@b.com' },
    ]);
  });
  check('a typed login result is passed through with no values', () => {
    const out = mapFSBError({ success: true, site: 'example.com', by: 'you', filled: ['username', 'password'], savedTo1Password: true });
    assert.equal(out.isError, undefined);
    assert.deepEqual(JSON.parse(out.content[0].text).by, 'you');
  });
  check('non-vault errors keep their old wording', () => {
    const text = mapFSBError({ success: false, error: 'Something odd happened' }).content[0].text;
    assert.match(text, /^Detected: Page navigation/);
  });

  console.log(`\nonepassword-mcp-errors: ${passed} passed, 0 failed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
