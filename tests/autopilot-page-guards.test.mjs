// Real-Chrome regressions for #156 and #157, on the shapes from the reporter's
// fixtures (#146). The page loads the real content scripts and messages reach
// messaging.js's own listeners, so the snapshot, ref resolution and readiness
// paths run unmodified. The execute_js guard runs exactly as
// chrome.scripting.executeScript would inject it.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, beforeEach, test } from 'node:test';

const require = createRequire(import.meta.url);
// Node 20 has no global WebSocket; reuse the mcp package's ws client there.
const WebSocketClient = globalThis.WebSocket ?? require('../mcp/node_modules/ws');
const { fsbRunGuardedPageScript } = require('../extension/ai/tool-executor.js');

const chrome = [process.env.FSB_CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
const fixture = new URL('./fixtures/autopilot-guards.html', import.meta.url).href;

let browser = null;

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'fsb-autopilot-guards-'));
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, fixture
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
  let port;
  // Cold Chrome startup can exceed ten seconds on shared CI runners.
  const deadline = Date.now() + 30000;
  while (!port && Date.now() < deadline) {
    const portFile = join(profile, 'DevToolsActivePort');
    if (existsSync(portFile)) {
      const candidate = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(candidate) && candidate > 0) port = candidate;
    }
    if (!port) await sleep(100);
  }
  assert.ok(port, `Chrome debugging port did not open within 30 seconds: ${stderr}`);
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = pages.find(page => page.type === 'page' && page.url.includes('autopilot-guards'));
    if (!target) await sleep(100);
  }
  assert.ok(target, 'fixture tab opened');
  const ws = new WebSocketClient(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      ws.removeEventListener('message', listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const close = async () => {
    ws.close();
    const exited = child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(5000)]);
    // Linux helper processes can briefly outlive the browser and keep writing
    // the profile; a leftover temp profile must not fail the run.
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        return;
      } catch (error) {
        if (attempt === 10) console.warn(`Left Chrome test profile ${profile}: ${error.code}`);
        else await sleep(500);
      }
    }
  };
  return { send, close };
}

async function evaluate(expression) {
  const result = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

const fsbSend = request => evaluate(`fsbSend(${JSON.stringify(request)})`);
const snapshot = async () => (await fsbSend({ action: 'getMarkdownSnapshot', options: {} })).markdownSnapshot;
const refFor = (markdown, pattern) => (markdown.match(new RegExp('`(e\\d+): ' + pattern)) || [])[1];
const runPageScript = (code, mode = 'eval') => evaluate(
  `(${fsbRunGuardedPageScript.toString()})(${JSON.stringify(code)}, ${JSON.stringify(mode)})`);

before(async () => {
  if (chrome) browser = await launch();
});

after(async () => {
  await browser?.close();
});

beforeEach(async () => {
  if (!browser) return;
  await browser.send('Page.navigate', { url: fixture });
  for (let i = 0; i < 100; i++) {
    const ready = await evaluate(`document.readyState === 'complete' && window.__fsbListeners?.length > 0 && !!window.FSB?.tools`)
      .catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  assert.fail('fixture and content scripts did not load');
});

test('#157 snapshot lists the fields wrapped in their labels', { skip: !chrome }, async () => {
  const markdown = await snapshot();
  assert.ok(refFor(markdown, 'textbox "Your name"'), markdown);
  assert.ok(refFor(markdown, 'textbox "Message"'), markdown);
});

test('#157 snapshot still lists elements after get_dom_snapshot stamps them', { skip: !chrome }, async () => {
  await fsbSend({ action: 'getDOM', options: {} });
  assert.equal(await evaluate(`document.querySelector('#name').hasAttribute('data-fsb-id')`), true,
    'get_dom_snapshot stamped the field');
  const markdown = await snapshot();
  assert.ok(refFor(markdown, 'textbox "Your name"'), markdown);
  assert.ok(refFor(markdown, 'button "Place order" \\[disabled\\]'), markdown);
});

test('#157 a snapshot ref passed as the selector types into the field', { skip: !chrome }, async () => {
  const ref = refFor(await snapshot(), 'textbox "Your name"');
  const result = await fsbSend({ action: 'executeAction', tool: 'type', params: { selector: ref, text: 'Ada' } });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(await evaluate(`document.querySelector('#name').value`), 'Ada');
});

test('#156 a snapshot ref reaches the disabled button and the click is refused', { skip: !chrome }, async () => {
  const ref = refFor(await snapshot(), 'button "Place order" \\[disabled\\]');
  const result = await fsbSend({ action: 'executeAction', tool: 'click', params: { selector: ref } });
  assert.equal(result.success, false);
  assert.match(result.error, /disabled/i);
  assert.equal(await evaluate('orderClicks'), 0);
});

test('#156 execute_js cannot click, submit through, or re-enable a disabled control', { skip: !chrome }, async () => {
  const dispatched = await runPageScript(`document.querySelector('#place').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(dispatched.blocked?.[0]?.reason, 'native_disabled');

  const reEnabled = await runPageScript(`const b = document.querySelector('#place'); b.disabled = false; b.click(); b.disabled`);
  assert.deepEqual(reEnabled.blocked.map(entry => entry.action), ['enable', 'click']);
  assert.equal(reEnabled.result, 'true', 'the button stays disabled');

  // Splitting the bypass across two calls must not work either.
  await runPageScript(`document.querySelector('#place').removeAttribute('disabled')`);
  const later = await runPageScript(`document.querySelector('#place').click()`);
  assert.equal(later.blocked?.[0]?.action, 'click');

  const mcp = await runPageScript(`document.querySelector('#place').toggleAttribute('disabled'); return 'sent';`, 'function');
  assert.equal(mcp.blocked?.[0]?.action, 'enable');
  assert.equal(mcp.value, 'sent', 'MCP result shape is kept');

  assert.equal(await evaluate('orderClicks'), 0, 'no order was placed');
});

test('#156 execute_js still acts on enabled controls and pages that enable their own', { skip: !chrome }, async () => {
  const sent = await runPageScript(`document.querySelector('#m').value = 'Hi'; document.querySelector('#contact').requestSubmit(); 'ok'`);
  assert.equal(sent.blocked, undefined);
  assert.equal(sent.result, 'ok');
  assert.equal(await evaluate('messagesSent'), 1);

  const applied = await runPageScript(`const c = document.querySelector('#coupon'); c.value = 'SAVE';
    c.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#apply').click(); 'applied'`);
  assert.equal(applied.blocked, undefined, JSON.stringify(applied));
  assert.equal(await evaluate('applyClicks'), 1);

  assert.equal(await evaluate(`EventTarget.prototype.dispatchEvent.toString().includes('[native code]')
    && HTMLElement.prototype.click.toString().includes('[native code]')
    && Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled').set.toString().includes('[native code]')`),
  true, 'the guard restores every patched API');
});
