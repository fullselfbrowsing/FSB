import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';

const chrome = [process.env.FSB_CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));

async function evaluate(ws, expression, requestId) {
  return new Promise((resolve, reject) => {
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      ws.removeEventListener('message', listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value);
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true } }));
  });
}

test('Chrome fixture inserts multiline Draft text once and dispatches one click',
  { skip: !chrome }, async () => {
    const profile = mkdtempSync(join(tmpdir(), 'fsb-browser-actions-'));
    const fixture = new URL('./fixtures/browser-editing-actions.html', import.meta.url).href;
    const child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, fixture
    ], { stdio: 'ignore' });
    let ws;
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
        target = pages.find(page => page.type === 'page' && page.url.includes('browser-editing-actions'));
        if (target) break;
        await sleep(100);
      }
      assert.ok(target, 'fixture tab opened');
      ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
      });
      let raw = 'pending';
      for (let i = 0; i < 150; i++) {
        raw = await evaluate(ws, 'document.querySelector("#result")?.textContent', i + 1);
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
      ws?.close();
      child.kill('SIGTERM');
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
