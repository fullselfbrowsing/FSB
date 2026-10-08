import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
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
  const result = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function openFixture(name) {
  const profile = mkdtempSync(join(tmpdir(), 'fsb-browser-actions-'));
  const fixture = new URL(`./fixtures/${name}`, import.meta.url).href;
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, fixture
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError, launchStderr = '';
  child.once('error', error => { launchError = error; });
  child.stderr.on('data', chunk => { launchStderr = (launchStderr + chunk).slice(-8192); });
  let ws;
  const close = async () => {
    ws?.close();
    // Chrome keeps writing its profile until it exits; removing it earlier races.
    const exited = launchError || child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(5000)]);
    // On Linux, Chrome's helper processes outlive the browser briefly and can
    // still write into the profile, so give them a few seconds to finish. A
    // leftover temp profile is harmless and must not fail the test.
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
  try {
    let port;
    // Cold Chrome startup can exceed ten seconds on shared CI runners.
    const launchDeadline = Date.now() + 30000;
    while (Date.now() < launchDeadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Chrome exited before opening its debugging port (${child.exitCode ?? child.signalCode}): ${launchStderr}`);
      }
      const portFile = join(profile, 'DevToolsActivePort');
      if (existsSync(portFile)) {
        const candidate = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(candidate) && candidate > 0) {
          port = candidate;
          break;
        }
      }
      await sleep(100);
    }
    assert.ok(port, `Chrome debugging port did not open within 30 seconds: ${launchStderr}`);
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
    let loaded = false;
    for (let i = 0; i < 100; i++) {
      loaded = await evaluate(ws, `location.href === ${JSON.stringify(fixture)} && document.readyState === 'complete'`);
      if (loaded) break;
      await sleep(100);
    }
    assert.ok(loaded, 'fixture document and scripts loaded');
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    return { ws, close, debuggerUrl: target.webSocketDebuggerUrl, browserDebuggerUrl: version.webSocketDebuggerUrl, port };
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
      tabs: { get: async () => ({ active: true, windowId: 1 }) },
      windows: { get: async () => ({ focused: true, state: 'normal' }) },
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

test('appending to a code editor moves its own cursor to the end',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('code-editor.html');
    try {
      const editorText = 'document.getElementById("view").textContent';
      for (let i = 0; i < 50 && await evaluate(ws, editorText) !== 'hello'; i++) await sleep(100);
      await evaluate(ws, 'document.getElementById("input").focus()');
      const { dispatch, input } = loadCdpTextInsertion(ws);
      const result = await dispatch(1, ' world', 'end', null, { editorOwnsCaret: true });
      assert.equal(result.success, true, result.error);
      assert.equal(await evaluate(ws, editorText), 'hello world');
      assert.equal(input.filter(method => method === 'Input.insertText').length, 1);
    } finally {
      await close();
    }
  });

test('an EditContext editor with no text field takes appends and replacements',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('edit-context-editor.html');
    try {
      const editorText = 'document.getElementById("editor").textContent';
      for (let i = 0; i < 50 && await evaluate(ws, editorText) !== 'hello'; i++) await sleep(100);
      await evaluate(ws, 'document.getElementById("editor").focus()');
      const { dispatch } = loadCdpTextInsertion(ws);
      const appended = await dispatch(1, ' world', 'end', null, { editorOwnsCaret: true });
      assert.equal(appended.success, true, appended.error);
      assert.equal(await evaluate(ws, editorText), 'hello world');
      const replaced = await dispatch(1, 'new', 'replace_all', null, { editorOwnsCaret: true });
      assert.equal(replaced.success, true, replaced.error);
      assert.equal(await evaluate(ws, editorText), 'new');
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
      for (const selector of ['open-field >>> #inner', 'closed-field >>> #inner', 'open-field', 'closed-field',
        'editor-field >>> #inner', 'editor-field']) {
        const { success, error, value, expected } = results[selector];
        assert.equal(success, true, `${selector}: ${error}`);
        assert.equal(value, expected, selector);
      }
    } finally {
      await close();
    }
  });

test('appending to a field focused inside a closed shadow root lands at its end',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('shadow-components.html');
    try {
      await shadowComponentResults(ws);
      assert.equal(await evaluate(ws, `(() => {
        const input = innerField('closed-field');
        input.value = 'hello';
        input.focus();
        input.setSelectionRange(0, 0);
        return document.activeElement.tagName;
      })()`), 'CLOSED-FIELD');
      const { dispatch } = loadCdpTextInsertion(ws);
      const result = await dispatch(1, ' world', 'end', null);
      assert.equal(result.success, true, result.error);
      assert.equal(await evaluate(ws, 'innerField("closed-field").value'), 'hello world');
    } finally {
      await close();
    }
  });

test('CDP insertion accepts a shadow-piercing selector or the component itself',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('shadow-components.html');
    try {
      await shadowComponentResults(ws);
      await evaluate(ws, 'innerField("open-field").value = "open"; innerField("closed-field").value = "closed"; true');
      const { dispatch } = loadCdpTextInsertion(ws);
      const pierced = await dispatch(1, '!', 'end', 'closed-field >>> #inner');
      assert.equal(pierced.success, true, pierced.error);
      assert.equal(await evaluate(ws, 'innerField("closed-field").value'), 'closed!');
      const host = await dispatch(1, '?', 'end', 'open-field');
      assert.equal(host.success, true, host.error);
      assert.equal(await evaluate(ws, 'innerField("open-field").value'), 'open?');
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

test('Enter/Tab consumption, empty rich text, and refused editor CDP preserve truthful results',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('editing-regressions.html');
    try {
      const results = await evaluate(ws, `(async () => {
        const out = {};
        for (const id of ['enter-clear', 'enter-remove']) {
          const element = document.getElementById(id);
          let submissions = 0;
          element.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
              submissions++;
              if (id === 'enter-remove') element.remove(); else element.value = '';
            }
          });
          out[id] = { result: await FSB.tools.type({selector:'#'+id,text:'message',pressEnter:true}), submissions };
        }
        let tabs = 0;
        document.querySelector('#recipient').addEventListener('keydown', event => {
          if (event.key === 'Tab') { tabs++; event.target.value = ''; }
        });
        out.recipient = { result: await FSB.tools.type({selector:'#recipient',text:'a@example.com'}), tabs };
        out.empty = await FSB.tools.type({selector:'#empty',text:'hello',clear_first:false});
        out.multiline = await FSB.tools.type({selector:'#multiline',text:'\\nthird',clear_first:false});
        let cdpRequests = 0, inputEvents = 0;
        FSB.detectCodeEditor = () => ({isCodeEditor:true,type:'ace'});
        window.chrome = Object.assign(window.chrome || {}, {runtime:{sendMessage(_request, callback) {
          if (_request.action === 'monacoEditorInsert') return callback({success:false,error:'No editor API found on page'});
          cdpRequests++; callback({success:false,code:'SCREENSHOT_DEBUGGER_BUSY',retryable:true});
        }}});
        document.querySelector('#code').addEventListener('input', event => {
          inputEvents++; document.querySelector('#model').textContent = event.target.value;
        });
        out.editor = { result: await FSB.tools.type({selector:'#code',text:'new code'}),
          model:document.querySelector('#model').textContent, inputEvents, cdpRequests };
        return out;
      })()`);
      for (const id of ['enter-clear', 'enter-remove']) {
        assert.equal(results[id].result.success, true, results[id].result.error);
        assert.equal(results[id].result.pressedEnter, true);
        assert.equal(results[id].submissions, 1);
        assert.notEqual(results[id].result.mayHaveExecuted, false);
      }
      assert.equal(results.recipient.result.success, true, results.recipient.result.error);
      assert.equal(results.recipient.tabs, 1);
      assert.equal(results.empty.success, true, results.empty.error);
      assert.equal(results.empty.final_text, 'hello');
      assert.equal(results.multiline.success, true, results.multiline.error);
      assert.equal(results.multiline.final_text, 'first\nsecond\nthird');
      assert.equal(results.editor.result.success, true, results.editor.result.error);
      assert.equal(results.editor.model, 'new code');
      assert.equal(results.editor.inputEvents, 1);
      assert.equal(results.editor.cdpRequests, 1);
    } finally { await close(); }
  });

test('shadow clicks pass real readiness and post-click failures never invite another click',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('shadow-components.html');
    try {
      await shadowComponentResults(ws);
      const results = await evaluate(ws, `(async () => {
        const out = {};
        for (const host of ['open-field', 'closed-field']) {
          const root = chrome.dom.openOrClosedShadowRoot(document.querySelector(host));
          const button = document.createElement('button'); button.id='click'; button.textContent='Expand';
          button.setAttribute('aria-expanded','false'); root.append(button);
          let clicks=0; button.addEventListener('click',()=>{clicks++;button.setAttribute('aria-expanded','true');});
          out[host]={result:await FSB.tools.click({selector:host+' >>> #click'}),clicks};
        }
        const button=document.createElement('button');button.id='obscured';button.textContent='Send';document.body.append(button);
        let clicks=0;button.addEventListener('click',()=>clicks++);
        const ready=FSB.smartEnsureReady;
        FSB.smartEnsureReady=async()=>({ready:false,failureReason:'obscured'});
        out.obscured={result:await FSB.tools.click({selector:'#obscured'}),clicks};
        const nativeClick=button.click;
        button.click=function(){nativeClick.call(this);throw new Error('after click');};
        out.afterClick={result:await FSB.tools.click({selector:'#obscured'}),clicks};
        FSB.smartEnsureReady=async element=>{element.remove();return {ready:true};};
        out.disconnected={result:await FSB.tools.click({selector:'#obscured'}),clicks};
        FSB.smartEnsureReady=ready;
        return out;
      })()`);
      for (const host of ['open-field', 'closed-field']) {
        assert.equal(results[host].result.success, true, results[host].result.error);
        assert.equal(results[host].clicks, 1);
      }
      assert.equal(results.obscured.result.success, true, results.obscured.result.error);
      assert.equal(results.obscured.clicks, 1);
      assert.equal(results.afterClick.result.outcome, 'unknown');
      assert.equal(results.afterClick.result.mayHaveExecuted, true);
      assert.equal(results.afterClick.clicks, 2);
      assert.equal(results.disconnected.result.success, false);
      assert.equal(results.disconnected.clicks, 2);
    } finally { await close(); }
  });

test('native email and number inputs append at the end and replace with one insertion',
  { skip: !chrome }, async () => {
    const { ws, close } = await openFixture('editing-regressions.html');
    try {
      for (const [type, initial, extra, replacement] of [
        ['email', 'a@example.com', '.test', 'b@example.com'], ['number', '12', '34', '88']
      ]) {
        await evaluate(ws, `(() => {const field=document.getElementById('${type}');field.value=${JSON.stringify(initial)};field.focus();})()`);
        // Start at the beginning so the test proves End placement actually moved the caret.
        await cdp(ws, 'Input.dispatchKeyEvent', {type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36,commands:['moveToBeginningOfDocument']});
        await cdp(ws, 'Input.dispatchKeyEvent', {type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
        const { dispatch, input } = loadCdpTextInsertion(ws);
        assert.equal((await dispatch(1, extra, 'end', '#'+type)).success, true);
        assert.equal(await evaluate(ws, `document.getElementById('${type}').value`), initial+extra);
        assert.equal(input.filter(method => method === 'Input.insertText').length, 1);
        input.length=0;
        assert.equal((await dispatch(1, replacement, 'replace_all', '#'+type)).success, true);
        assert.equal(await evaluate(ws, `document.getElementById('${type}').value`), replacement);
        assert.equal(input.filter(method => method === 'Input.insertText').length, 1);
      }
    } finally { await close(); }
  });

test('Chrome can recover a hung renderer over an established debugger session', { skip: !chrome }, async () => {
  const { ws, close } = await openFixture('nested-text-editor.html');
  try {
    const background = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
    const start = background.indexOf('async function recoverStalledTabNavigation(');
    const end = background.indexOf('\nasync function requireForegroundNativeInput', start);
    const recover = vm.runInNewContext(`${background.slice(start, end)}\nrecoverStalledTabNavigation`, {
      chrome: {
        scripting: { executeScript: async ({ func }) => [{ result: await evaluate(ws, `(${func})()`) }] },
        debugger: { sendCommand: (_target, method) => cdp(ws, method), detach: async () => {} }
      },
      FsbCdpLease: { acquire: async () => ({ release() {} }) },
      keyboardEmulator: { isAttachedTo: () => true },
      attachFsbDebugger: async () => { throw new Error('Must reuse the established FSB debugger session'); },
      setTimeout, clearTimeout
    });
    await evaluate(ws, 'setTimeout(() => { const end = Date.now() + 30000; while (Date.now() < end) {} }, 0); true');
    await sleep(100);
    const startedAt = Date.now();
    assert.equal(await recover(1, () => true), true);
    assert.ok(Date.now() - startedAt < 5000, 'recovery interrupts the loop before it expires');
    await cdp(ws, 'Page.navigate', { url: new URL('./fixtures/nested-text-editor.html', import.meta.url).href });
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      ready = await evaluate(ws, 'location.href.includes("nested-text-editor.html") && document.readyState === "complete"');
      if (!ready) await sleep(50);
    }
    assert.equal(ready, true);
  } finally { await close(); }
});

test('Chrome recovery stays bounded when attaching to an already-hung renderer', { skip: !chrome }, async () => {
  const { ws, close, debuggerUrl } = await openFixture('nested-text-editor.html');
  let recoverySocket;
  let released = false;
  try {
    const background = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
    const start = background.indexOf('async function recoverStalledTabNavigation(');
    const end = background.indexOf('\nasync function requireForegroundNativeInput', start);
    const recover = vm.runInNewContext(`${background.slice(start, end)}\nrecoverStalledTabNavigation`, {
      chrome: {
        scripting: { executeScript: async ({ func }) => [{ result: await evaluate(ws, `(${func})()`) }] },
        debugger: { sendCommand: (_target, method) => cdp(recoverySocket, method),
          detach: async () => { recoverySocket?.close(); } }
      },
      FsbCdpLease: { acquire: async () => ({ release() { released = true; } }) },
      attachFsbDebugger: async () => {
        recoverySocket = new WebSocketClient(debuggerUrl);
        await new Promise((resolve, reject) => {
          recoverySocket.addEventListener('open', resolve, { once: true });
          recoverySocket.addEventListener('error', reject, { once: true });
        });
      }, setTimeout, clearTimeout
    });
    await evaluate(ws, 'setTimeout(() => { const end = Date.now() + 30000; while (Date.now() < end) {} }, 0); true');
    await sleep(100);
    const startedAt = Date.now();
    try {
      assert.equal(await recover(1, () => true), true);
    } catch (error) {
      assert.match(error.message, /Navigation recovery timed out/);
    }
    assert.ok(Date.now() - startedAt < 5000);
    assert.equal(released, true);
  } finally { recoverySocket?.close(); await close(); }
});

// A disposable MV3 extension uses the real debugger API and the production
// dispatcher/registry/session code. No inspector session is opened on the
// controlled page by the test runner, so it cannot accidentally warm that page.
test('MV3 public navigation recovers owned tabs before and after keyboard input', { skip: !chrome }, async () => {
  const fixture = await openFixture('nested-text-editor.html');
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(request.url === '/loop'
      ? '<script>const end=Date.now()+30000;while(Date.now()<end){}</script>'
      : request.url === '/destination' ? '<p id="destination">recovered</p>' : '<input id="field">');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const extensionDir = mkdtempSync(join(tmpdir(), 'fsb-navigation-extension-'));
  let browserSocket, workerSocket;
  try {
    mkdirSync(join(extensionDir, 'utils'));
    mkdirSync(join(extensionDir, 'ws'));
    for (const file of ['utils/cdp-lease.js', 'utils/debugger-sessions.js', 'utils/agent-registry.js',
      'utils/keyboard-emulator.js', 'utils/screenshot-capture.js', 'ws/mcp-tool-dispatcher.js']) {
      cpSync(new URL('../extension/' + file, import.meta.url), join(extensionDir, file));
    }
    const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
    const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const workerSource = `
      importScripts('utils/cdp-lease.js', 'utils/debugger-sessions.js', 'utils/agent-registry.js', 'utils/keyboard-emulator.js', 'utils/screenshot-capture.js', 'ws/mcp-tool-dispatcher.js');
      globalThis.__uatLogs = [];
      globalThis.automationLogger = { debug: (name, data) => __uatLogs.push({name, ...data}), logActionExecution() {}, error() {}, info() {}, warn() {} };
      let keyboardEmulator = null;
      ${section('function isCdpDebuggerContention(', '\nasync function runLegacyCdpMessageWithLease(')}
      ${section('async function recoverStalledTabNavigation(', '\nasync function dispatchCdpTextInsertion(')}
      ${section('function initializeKeyboardEmulator(', '\n// Reconcile the KeyboardEmulator')}
      ${section('async function handleKeyboardDebuggerAction(', '\n/**\n * Clean up keyboard emulator resources')}
      globalThis.fsbAgentRegistryInstance = new FsbAgentRegistry.AgentRegistry();
      globalThis.__uatReady = fsbAgentRegistryInstance.hydrate();
    `;
    writeFileSync(join(extensionDir, 'background.js'), workerSource);
    writeFileSync(join(extensionDir, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'FSB navigation test', version: '1.0',
      permissions: ['debugger', 'scripting', 'tabs', 'storage', 'webNavigation'],
      host_permissions: ['<all_urls>'], background: { service_worker: 'background.js' }
    }));
    browserSocket = new WebSocketClient(fixture.browserDebuggerUrl);
    await new Promise(resolve => browserSocket.addEventListener('open', resolve, { once: true }));
    const loaded = await cdp(browserSocket, 'Extensions.loadUnpacked', { path: extensionDir });
    let worker;
    for (let i = 0; i < 60 && !worker; i++) {
      const targets = await (await fetch(`http://127.0.0.1:${fixture.port}/json`)).json();
      worker = targets.find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${loaded.id}/`));
      if (!worker) await sleep(100);
    }
    assert.ok(worker, 'test extension service worker started');
    workerSocket = new WebSocketClient(worker.webSocketDebuggerUrl);
    await new Promise(resolve => workerSocket.addEventListener('open', resolve, { once: true }));
    await evaluate(workerSocket, '__uatReady');
    const agent = await evaluate(workerSocket, 'fsbAgentRegistryInstance.registerAgent()');
    const agentId = agent.agentId;
    assert.ok(agentId);
    const open = async (url, active = false) => evaluate(workerSocket,
      `dispatchMcpToolRoute({tool:'open_tab',params:${JSON.stringify({ url, active, agentId })}})`);
    const route = async (tool, params) => evaluate(workerSocket,
      `dispatchMcpToolRoute({tool:${JSON.stringify(tool)},params:${JSON.stringify({ ...params, agentId })}})`);
    for (const keyboard of [false, true]) {
      // Timer starts only after the debugger is confirmed ready, via the same
      // public tab creation and binding paths that the installed extension uses.
      const opened = await open(origin + '/field', keyboard);
      assert.equal(opened.success, true, JSON.stringify(opened));
      const tabId = opened.tabId;
      assert.equal(await evaluate(workerSocket, `FsbDebuggerSessions.isReady(${tabId})`), true);
      await sleep(200);
      if (keyboard) {
        await evaluate(workerSocket, `chrome.scripting.executeScript({target:{tabId:${tabId}},func:()=>document.getElementById('field').focus()})`);
        const pressed = await evaluate(workerSocket, `new Promise(resolve=>handleKeyboardDebuggerAction({method:'pressKey',key:'ArrowRight'},{tab:{id:${tabId}}},resolve))`);
        assert.equal(pressed.success, true, JSON.stringify(pressed));
        assert.equal(await evaluate(workerSocket, `FsbDebuggerSessions.isReady(${tabId})`), true);
        const captured = await evaluate(workerSocket, `FsbScreenshotCapture.capture({mode:'viewport'},${tabId}).then(result=>({success:result.success,code:result.code}))`);
        assert.equal(captured.success, true, JSON.stringify(captured));
      }
      await evaluate(workerSocket, `chrome.scripting.executeScript({target:{tabId:${tabId}},func:()=>{const end=Date.now()+30000;while(Date.now()<end){}}}).catch(()=>{}); true`);
      await sleep(250);
      if (keyboard) {
        const capture = await evaluate(workerSocket, `FsbScreenshotCapture.capture({mode:'viewport'},${tabId},{deadlineMs:50}).then(result=>({success:result.success,code:result.code}))`);
        assert.equal(capture.code, 'PAGE_UNRESPONSIVE');
        assert.equal(await evaluate(workerSocket, `FsbDebuggerSessions.isReady(${tabId})`), true);
      }
      const started = Date.now();
      const navigated = await route('navigate', { tabId, ownershipToken: opened.ownershipToken,
        url: origin + '/destination' });
      assert.equal(navigated.success, true, JSON.stringify(navigated));
      assert.equal(navigated.recovered, true, JSON.stringify(await evaluate(workerSocket, '__uatLogs')));
      assert.ok(Date.now() - started < 5000, 'navigation interrupts rather than waiting for the loop');
      const destination = await evaluate(workerSocket, `chrome.scripting.executeScript({target:{tabId:${tabId}},func:()=>document.getElementById('destination')?.textContent})`);
      assert.equal(destination[0].result, 'recovered');
      await evaluate(workerSocket, `chrome.tabs.remove(${tabId})`);
    }
    // A loop running immediately at destination load is protected by the blank
    // page attachment too; it does not depend on a preceding keyboard request.
    const immediate = await open(origin + '/loop');
    assert.equal(immediate.success, true);
    await sleep(200);
    const nav = await route('navigate', { tabId: immediate.tabId, ownershipToken: immediate.ownershipToken,
      url: origin + '/destination' });
    assert.equal(nav.success, true, JSON.stringify(nav));
    assert.equal(nav.recovered, true);
    await evaluate(workerSocket, `chrome.tabs.remove(${immediate.tabId})`);
    const released = await open(origin + '/field');
    await evaluate(workerSocket, `fsbAgentRegistryInstance.releaseAgent(${JSON.stringify(agentId)})`);
    await evaluate(workerSocket, 'FsbDebuggerSessions.releaseUnowned()');
    assert.equal(await evaluate(workerSocket, `FsbDebuggerSessions.isAttachedTo(${released.tabId})`), false);
    const target = await evaluate(workerSocket, `chrome.debugger.getTargets().then(targets=>targets.find(target=>target.tabId===${released.tabId}))`);
    assert.equal(target.attached, false);
    await evaluate(workerSocket, `chrome.tabs.remove(${released.tabId})`);
    const logs = await evaluate(workerSocket, '__uatLogs');
    assert.ok(logs.filter(row => row.name === 'Navigation renderer recovery attached').every(row => row.reused === true));
  } finally {
    workerSocket?.close(); browserSocket?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fixture.close();
    rmSync(extensionDir, { recursive: true, force: true });
  }
});
