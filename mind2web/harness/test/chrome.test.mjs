import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { launchChrome, dismissDialogs } from '../chrome.mjs';
import { findChrome } from '../preflight.mjs';

test('Chrome for Testing CDP dismisses a confirm dialog, with no extension loaded', { skip: process.env.OM2W_TEST_CFT !== '1' }, async t => {
  const chromePath = process.env.OM2W_CFT_PATH ?? await findChrome();
  assert.ok(chromePath, 'Chrome for Testing must be installed');
  const profile = await mkdtemp(path.join(tmpdir(), 'om2w-cft-test-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  const chrome = await launchChrome({ chromePath, userDataDir: profile, extraArgs: ['--headless=new', '--disable-gpu'] });
  t.after(async () => { await chrome.close(); await rm(profile, { recursive: true, force: true }); });
  await dismissDialogs(chrome.cdp);
  const { targetId } = await chrome.cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await chrome.cdp.send('Page.enable', {}, sessionId);
  const result = await chrome.cdp.send('Runtime.evaluate', { expression: 'confirm("synthetic test")', returnByValue: true }, sessionId);
  assert.equal(result.result.value, false);
  const targets = await chrome.cdp.send('Target.getTargets');
  assert.ok(!targets.targetInfos.some(t => t.url.startsWith('chrome-extension://')));
});
