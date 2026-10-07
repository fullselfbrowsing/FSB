import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import vm from 'node:vm';

// Node 20 has no global WebSocket; reuse the mcp package's ws client there.
const WebSocketClient = globalThis.WebSocket
  ?? createRequire(import.meta.url)('../mcp/node_modules/ws');

const chrome = [process.env.FSB_CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));

let nextRequestId = 1;

function cdp(ws, method, params = {}) {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      ws.removeEventListener('message', listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}

async function evaluate(ws, expression) {
  return (await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;
}

async function openFixture(name) {
  const profile = mkdtempSync(join(tmpdir(), 'fsb-browser-actions-'));
  const fixture = new URL(`./fixtures/${name}`, import.meta.url).href;
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, fixture
  ], { stdio: 'ignore' });
  let ws;
  const close = async () => {
    ws?.close();
    // Chrome keeps writing its profile until it exits; removing it earlier races.
    const exited = child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(5000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      const portFile = join(profile, 'DevToolsActivePort');
      if (existsSync(portFile)) {
        port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
        break;
      }
      await sleep(100);
    }
    assert.ok(port, 'Chrome debugging port opened');
    let target;
    for (let i = 0; i < 100; i++) {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = pages.find(page => page.type === 'page' && page.url.includes(name));
      if (target) break;
      await sleep(100);
    }
    assert.ok(target, 'fixture tab opened');
    ws = new WebSocketClient(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return { ws, close };
  } catch (error) {
    await close();
    throw error;
  }
}

// Runs the extension's CDP text path against the fixture tab: the injected
// target lookup goes through Runtime.evaluate, Input commands over the socket.
function loadCdpTextInsertion(ws, edit = source => source) {
  const background = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const start = background.indexOf('async function prepareCdpTextTarget(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const input = [];
  const dispatch = vm.runInNewContext(`${edit(background.slice(start, end))}\ndispatchCdpTextInsertion`, {
    chrome: {
      scripting: { executeScript: async ({ func, args }) => [{
        result: await evaluate(ws, `(${func})(${args.map(arg => JSON.stringify(arg)).join(', ')})`)
      }] },
      debugger: { sendCommand: (_target, method, params) => { input.push(method); return cdp(ws, method, params); } }
    },
    navigator: { platform: process.platform === 'darwin' ? 'MacIntel' : 'Linux x86_64', userAgent: '' },
    setTimeout, clearTimeout
  });
  return { dispatch, input };
}

test('Chrome fixture inserts multiline Draft text once and dispatches one click',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('browser-editing-actions.html');
    try {
      let raw = 'pending';
      for (let i = 0; i < 150; i++) {
        raw = await evaluate(ws, 'document.querySelector("#result")?.textContent');
        if (raw && raw !== 'pending') break;
        await sleep(200);
      }
      assert.notEqual(raw, 'pending', 'fixture completed within 30 seconds');
      const result = JSON.parse(raw);
      assert.equal(result.a.success, true);
      assert.equal(result.a.final_text, 'first\nsecond');
      assert.equal(result.b.success, true);
      assert.equal(result.b.final_text, 'first\nsecond\nthird');
      assert.equal(result.second, 'first\nsecond\nthird');
      assert.equal(result.c.success, false);
      assert.match(result.c.error, /single editable/);
      assert.equal(result.clickEvents, 1);
      assert.equal(result.d.outcome, 'unknown');
      assert.equal(result.d.mayHaveExecuted, true);
    } finally {
      await close();
    }
  });

test('appending to an editor focused inside a nested frame lands at its end',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('nested-text-editor.html');
    try {
      const editorText = 'document.querySelector("#editor").contentDocument?.body?.textContent';
      for (let i = 0; i < 50 && await evaluate(ws, editorText) !== 'hello'; i++) await sleep(100);
      assert.equal(await evaluate(ws, `(() => {
        const doc = document.querySelector('#editor').contentDocument;
        doc.body.focus();
        const range = doc.createRange();
        range.setStart(doc.body.firstChild, 0);
        doc.getSelection().removeAllRanges();
        doc.getSelection().addRange(range);
        return document.activeElement.tagName;
      })()`), 'IFRAME');
      const { dispatch } = loadCdpTextInsertion(ws);
      const result = await dispatch(1, ' world', 'end', null);
      assert.equal(result.success, true);
      assert.equal(await evaluate(ws, editorText), 'hello world');
    } finally {
      await close();
    }
  });

test('typing into a field inside a shadow root lands the text',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('shadow-text-field.html');
    try {
      let raw = 'pending';
      for (let i = 0; i < 100; i++) {
        raw = await evaluate(ws, 'document.querySelector("#result")?.textContent');
        if (raw && raw !== 'pending') break;
        await sleep(100);
      }
      assert.notEqual(raw, 'pending', 'fixture completed within 10 seconds');
      const { result, value } = JSON.parse(raw);
      assert.equal(result.success, true, result.error);
      assert.equal(value, 'typed');
    } finally {
      await close();
    }
  });

test('appending to a field focused inside a shadow root lands at its end',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('shadow-text-field.html');
    try {
      for (let i = 0; i < 100 && await evaluate(ws, 'document.querySelector("#result")?.textContent') === 'pending'; i++) {
        await sleep(100);
      }
      const inner = 'document.querySelector("shadow-field").shadowRoot.querySelector("#inner")';
      assert.equal(await evaluate(ws, `(() => {
        const input = ${inner};
        input.value = 'hello';
        input.focus();
        input.setSelectionRange(0, 0);
        return document.activeElement.tagName;
      })()`), 'SHADOW-FIELD');
      const { dispatch } = loadCdpTextInsertion(ws);
      const result = await dispatch(1, ' world', 'end', null);
      assert.equal(result.success, true, result.error);
      assert.equal(await evaluate(ws, `${inner}.value`), 'hello world');
    } finally {
      await close();
    }
  });

// Loads the real selector, readiness, and typing modules, so nothing in the
// shadow-root path is stubbed except the chrome.dom API itself.
async function shadowComponentResults(ws) {
  let raw = 'pending';
  for (let i = 0; i < 100; i++) {
    raw = await evaluate(ws, 'document.querySelector("#result")?.textContent');
    if (raw && raw !== 'pending') break;
    await sleep(100);
  }
  assert.notEqual(raw, 'pending', 'fixture completed within 10 seconds');
  assert.doesNotMatch(raw, /^ERROR/);
  return JSON.parse(raw);
}

test('typing reaches fields inside web components through the real readiness checks',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('shadow-components.html');
    try {
      const results = await shadowComponentResults(ws);
      for (const selector of ['open-field >>> #inner']) {
        const { success, error, value, expected } = results[selector];
        assert.equal(success, true, `${selector}: ${error}`);
        assert.equal(value, expected, selector);
      }
    } finally {
      await close();
    }
  });

test('a hung page gets no CDP text once its target lookup times out',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('nested-text-editor.html');
    try {
      const { dispatch, input } = loadCdpTextInsertion(ws, source => source.replaceAll('6000', '300'));
      await evaluate(ws, 'setTimeout(() => { const until = Date.now() + 1500; while (Date.now() < until) {} }, 0); true');
      await sleep(100);
      const result = await dispatch(1, ' late', 'end', '#draft');
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
      // Queued behind the late lookup, so this runs after the page recovers.
      assert.equal(await evaluate(ws, 'document.querySelector("#draft").value + "|" + document.activeElement.tagName'),
        'kept|BODY');
      assert.deepEqual(input, []);
    } finally {
      await close();
    }
  });
